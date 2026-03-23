// Vercel Serverless Function — /api/analyze
// Keys live in Vercel Environment Variables, never exposed to the browser.

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GROQ_KEY   = process.env.GROQ_API_KEY;

export const config = { runtime: 'edge' };   // Edge runtime = faster cold starts on Vercel free tier

export default async function handler(req) {
  // CORS — allow your own Vercel domain (and localhost for dev)
  const origin = req.headers.get('origin') || '';
  const allowed = ['http://localhost:3000', 'http://127.0.0.1:5500'];
  // In production Vercel sets VERCEL_URL automatically
  if (process.env.VERCEL_URL) allowed.push(`https://${process.env.VERCEL_URL}`);

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',        // lock to your domain once in prod
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

  const { prompt } = body;
  if (!prompt || typeof prompt !== 'string' || prompt.length > 8000) {
    return new Response(JSON.stringify({ error: 'Invalid prompt' }), { status: 400, headers: corsHeaders });
  }

  // ── Try Gemini first ───────────────────────────────────────────────────────
  if (GEMINI_KEY) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 1400 },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) {
          return new Response(JSON.stringify({ result: text, source: 'gemini' }), { headers: corsHeaders });
        }
      }
    } catch (e) {
      console.error('Gemini error:', e);
    }
  }

  // ── Fallback: Groq ─────────────────────────────────────────────────────────
  if (GROQ_KEY) {
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
            { role: 'system', content: 'You are a job legitimacy analyst. Respond with raw JSON only, no markdown fences.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
          max_tokens: 1400,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || '';
        if (text) {
          return new Response(JSON.stringify({ result: text, source: 'groq' }), { headers: corsHeaders });
        }
      }
    } catch (e) {
      console.error('Groq error:', e);
    }
  }

  // ── Both failed — signal frontend to use offline heuristics ───────────────
  return new Response(JSON.stringify({ result: null, source: 'offline' }), { headers: corsHeaders });
}
