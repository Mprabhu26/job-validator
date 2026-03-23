// Vercel Serverless Function — /api/analyze
// Keys live in Vercel Environment Variables

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GROQ_KEY   = process.env.GROQ_API_KEY;

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders });
  }

  const { jobData } = body;
  if (!jobData) {
    return new Response(JSON.stringify({ error: 'Missing job data' }), { status: 400, headers: corsHeaders });
  }

  const { companyName, jobTitle, jobDescription, salary, location } = jobData;

  console.log('📊 Analyzing job for:', companyName);

  // ─── Step 1: Fetch Reddit reviews automatically ────────────────────────────
  let redditReviews = [];
  if (companyName) {
    redditReviews = await fetchRedditReviews(companyName);
    console.log(`📌 Found ${redditReviews.length} Reddit discussions`);
  }

  // ─── Step 2: Fetch Glassdoor reviews via web search (since no official API) ─
  let glassdoorReviews = [];
  if (companyName) {
    glassdoorReviews = await fetchGlassdoorReviews(companyName);
    console.log(`📌 Found ${glassdoorReviews.length} Glassdoor mentions`);
  }

  // ─── Step 3: Build AI prompt with all data ─────────────────────────────────
  const prompt = buildAnalysisPrompt({
    companyName,
    jobTitle,
    jobDescription,
    salary,
    location,
    redditReviews,
    glassdoorReviews
  });

  // ─── Step 4: Call AI for analysis ──────────────────────────────────────────
  let aiResult = null;
  let aiSource = 'offline';

  if (GEMINI_KEY) {
    aiResult = await callGemini(prompt);
    if (aiResult) aiSource = 'gemini';
  }

  if (!aiResult && GROQ_KEY) {
    aiResult = await callGroq(prompt);
    if (aiResult) aiSource = 'groq';
  }

  // ─── Step 5: Return combined result ────────────────────────────────────────
  return new Response(JSON.stringify({
    result: aiResult,
    source: aiSource,
    reddit: redditReviews,
    glassdoor: glassdoorReviews
  }), { headers: corsHeaders });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Fetch Reddit reviews automatically
// ─────────────────────────────────────────────────────────────────────────────
async function fetchRedditReviews(companyName) {
  const queries = [
    `${companyName} company review`,
    `${companyName} interview experience`,
    `${companyName} scam`,
    `${companyName} work culture`
  ];
  
  const seen = new Set();
  const results = [];
  
  for (const q of queries.slice(0, 3)) {
    try {
      const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=relevance&t=year&limit=4`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'JobTruth/1.0 (job analysis tool)' }
      });
      
      if (!res.ok) continue;
      
      const data = await res.json();
      for (const post of data.data?.children || []) {
        const p = post.data;
        if (!p.title || seen.has(p.permalink)) continue;
        seen.add(p.permalink);
        
        // Analyze sentiment
        const content = (p.title + ' ' + (p.selftext || '')).toLowerCase();
        let sentiment = 'neutral';
        if (/scam|fake|fraud|ghost|avoid|terrible|worst|never/i.test(content)) sentiment = 'negative';
        else if (/great|good|recommend|legit|awesome|love|best/i.test(content)) sentiment = 'positive';
        
        results.push({
          title: p.title,
          snippet: (p.selftext || '').slice(0, 300),
          url: `https://reddit.com${p.permalink}`,
          subreddit: p.subreddit,
          score: p.score,
          sentiment: sentiment,
          date: new Date(p.created_utc * 1000).toLocaleDateString()
        });
      }
    } catch (e) {
      console.error(`Reddit fetch error for "${q}":`, e.message);
    }
  }
  
  return results.slice(0, 6);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Fetch Glassdoor reviews (via web search + analysis)
// ─────────────────────────────────────────────────────────────────────────────
async function fetchGlassdoorReviews(companyName) {
  // Glassdoor has no public API. Instead, we search for reviews via DuckDuckGo
  // and extract relevant snippets. This gives users a starting point.
  
  const searchTerms = [
    `${companyName} glassdoor review`,
    `${companyName} employee reviews`
  ];
  
  const results = [];
  const seen = new Set();
  
  for (const term of searchTerms.slice(0, 2)) {
    try {
      // Use DuckDuckGo's lite search (free, no API key)
      const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(term)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobTruth/1.0)' }
      });
      
      if (!res.ok) continue;
      
      const html = await res.text();
      // Extract result snippets (simple parsing)
      const snippetMatches = html.match(/<td class="result-snippet">(.*?)<\/td>/g) || [];
      
      for (let i = 0; i < Math.min(snippetMatches.length, 3); i++) {
        const snippet = snippetMatches[i]
          .replace(/<[^>]*>/g, '')
          .replace(/&[^;]+;/g, ' ')
          .trim();
        
        if (snippet && snippet.length > 30 && !seen.has(snippet)) {
          seen.add(snippet);
          
          // Simple sentiment analysis
          let sentiment = 'neutral';
          if (/scam|fake|fraud|avoid|terrible|worst|negative/i.test(snippet)) sentiment = 'negative';
          else if (/great|good|recommend|positive|excellent|love/i.test(snippet)) sentiment = 'positive';
          
          results.push({
            text: snippet,
            sentiment: sentiment,
            source: 'Glassdoor (search result)',
            note: 'Manual verification recommended'
          });
        }
      }
    } catch (e) {
      console.error(`Glassdoor search error for "${term}":`, e.message);
    }
  }
  
  return results.slice(0, 4);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Build comprehensive AI prompt
// ─────────────────────────────────────────────────────────────────────────────
function buildAnalysisPrompt({ companyName, jobTitle, jobDescription, salary, location, redditReviews, glassdoorReviews }) {
  const redditText = redditReviews.length > 0 
    ? redditReviews.map(r => `- [${r.sentiment}] r/${r.subreddit}: "${r.title}"\n  ${r.snippet.slice(0, 200)}`).join('\n')
    : 'No Reddit data found';
    
  const glassdoorText = glassdoorReviews.length > 0
    ? glassdoorReviews.map(g => `- [${g.sentiment}] ${g.text.slice(0, 300)}`).join('\n')
    : 'No Glassdoor data found';

  return `You are a job analyst. Analyze this job posting and return ONLY valid JSON.

## JOB DETAILS
Company: ${companyName}
Title: ${jobTitle}
Salary: ${salary || 'Not specified'}
Location: ${location || 'Not specified'}

## JOB DESCRIPTION
${jobDescription.slice(0, 4000)}

## REDDIT COMMUNITY FEEDBACK
${redditText}

## GLASSDOOR FEEDBACK (search results)
${glassdoorText}

## RETURN THIS EXACT JSON STRUCTURE:
{
  "trustScore": <0-100>,
  "verdict": "<Likely Legitimate|Proceed with Caution|Suspicious|Likely Scam>",
  "verdictSummary": "<2-3 sentence plain-English summary>",
  
  "extractedInfo": {
    "keyResponsibilities": ["<responsibility 1>", "<responsibility 2>", "<up to 6>"],
    "requiredSkills": ["<skill 1>", "<skill 2>", "<up to 8>"],
    "niceToHaveSkills": ["<skill 1>", "<skill 2>", "<up to 4>"],
    "experienceLevel": "<entry|mid|senior|lead>",
    "educationRequirements": ["<degree/certification 1>"],
    "keyBenefits": ["<benefit 1>", "<benefit 2>"],
    "redFlags": ["<concern 1>", "<concern 2>"],
    "greenFlags": ["<positive 1>", "<positive 2>"]
  },
  
  "ghostJobScore": <0-100, 100=definitely ghost job>,
  "ghostJobSignals": ["<signal 1>", "<signal 2>"],
  
  "scamSignals": [
    {"text": "<finding>", "severity": "<high|medium|low>"}
  ],
  
  "companyReputation": {
    "score": <0-100>,
    "summary": "<brief summary of community sentiment>",
    "positiveMentions": <number>,
    "negativeMentions": <number>
  },
  
  "recommendedActions": [
    {"text": "<action>", "priority": "<high|medium|low>"}
  ]
}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Call Gemini API
// ─────────────────────────────────────────────────────────────────────────────
async function callGemini(prompt) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2000 },
        }),
      }
    );
    
    if (!res.ok) {
      console.error('Gemini HTTP error:', res.status);
      return null;
    }
    
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (!text) return null;
    
    // Extract JSON from response (remove markdown fences if present)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(text);
  } catch (e) {
    console.error('Gemini error:', e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Call Groq API (fallback)
// ─────────────────────────────────────────────────────────────────────────────
async function callGroq(prompt) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are a job analyst. Return only valid JSON, no markdown.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });
    
    if (!res.ok) {
      console.error('Groq HTTP error:', res.status);
      return null;
    }
    
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    
    if (!text) return null;
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(text);
  } catch (e) {
    console.error('Groq error:', e.message);
    return null;
  }
}