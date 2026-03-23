// ============================================
// JOB LEGITIMACY CHECKER - IMPROVED VERSION
// With multiple fallback methods
// ============================================

// DOM Elements
const jobUrlInput = document.getElementById('jobUrl');
const analyzeBtn = document.getElementById('analyzeBtn');
const loadingDiv = document.getElementById('loading');
const resultsDiv = document.getElementById('results');

// Scam patterns to detect
const SCAM_PATTERNS = {
    aiInterview: {
        keywords: ['AI interview', 'record yourself', 'train our AI', 'test our model', 'AI training', 'record your response', 'LLM', 'Large Language Model', 'data annotation', 'annotator', 'train our model', 'training data'],
        weight: 25,
        message: '⚠️ AI Training Scam - May be using you to train their AI model for free or low pay'
    },
    paymentRequest: {
        keywords: ['pay for training', 'deposit required', 'equipment fee', 'background check fee', 'processing fee', 'registration fee', 'application fee', 'pay to apply'],
        weight: 30,
        message: '💰 Requests Payment - Legitimate employers never ask for money'
    },
    urgency: {
        keywords: ['immediate start', 'urgent hiring', 'limited positions', 'act now', 'apply today only', 'within 2 days', 'within 48 hours', 'apply immediately'],
        weight: 10,
        message: '⏰ High Pressure Tactics - Scammers create false urgency'
    },
    suspiciousContact: {
        keywords: ['@gmail.com', '@hotmail.com', '@yahoo.com', '@outlook.com', 'whatsapp', 'telegram', 'signal app', 'telegram group'],
        weight: 20,
        message: '📧 Suspicious Contact Method - Legitimate companies use professional email domains'
    },
    vagueDescription: {
        keywords: ['work from home', 'no experience needed', 'earn quick money', 'unlimited income', 'be your own boss', 'flexible hours', 'freelance', 'project-based', 'make money fast'],
        weight: 15,
        message: '📝 Vague Job Description - Lacks specific responsibilities and requirements'
    }
};

// Multiple proxy services (free, no API key)
const PROXIES = [
    (url) => `https://api.allorigins.ws/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url) => `https://cors-anywhere.herokuapp.com/${url}`,
    (url) => `https://thingproxy.freeboard.io/fetch/${url}`
];

// Fetch job description from LinkedIn URL with multiple proxy fallbacks
async function fetchJobDescription(url) {
    let lastError = null;
    
    for (const proxy of PROXIES) {
        try {
            const proxyUrl = proxy(url);
            console.log(`Trying proxy: ${proxyUrl}`);
            
            const response = await fetch(proxyUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const html = await response.text();
            
            // Check if we got actual content (not LinkedIn login page)
            if (html.includes('login') && html.includes('linkedin') && html.length < 5000) {
                console.log('Got login page, trying next proxy');
                continue;
            }
            
            // Extract job description from HTML
            const description = extractDescriptionFromHTML(html);
            
            if (description && description.length > 100) {
                console.log(`Successfully extracted ${description.length} characters`);
                return description;
            }
            
        } catch (error) {
            console.log(`Proxy failed: ${error.message}`);
            lastError = error;
            continue;
        }
    }
    
    console.error('All proxies failed');
    return null;
}

// Extract description from LinkedIn HTML
function extractDescriptionFromHTML(html) {
    let description = '';
    
    // Method 1: LinkedIn's job description div
    const descMatch = html.match(/<div[^>]*class="[^"]*description__text[^"]*"[^>]*>(.*?)<\/div>/is);
    if (descMatch) {
        description += cleanHTML(descMatch[1]) + ' ';
    }
    
    // Method 2: Show more less markup
    const markupMatch = html.match(/<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>(.*?)<\/div>/is);
    if (markupMatch) {
        description += cleanHTML(markupMatch[1]) + ' ';
    }
    
    // Method 3: Jobs description
    const jobsDescMatch = html.match(/<div[^>]*class="[^"]*jobs-description[^"]*"[^>]*>(.*?)<\/div>/is);
    if (jobsDescMatch) {
        description += cleanHTML(jobsDescMatch[1]) + ' ';
    }
    
    // Method 4: Any div containing job description text
    if (description.length < 100) {
        const textMatch = html.match(/>(.*?(?:responsibilities|qualifications|requirements|about the role|description).*?)</is);
        if (textMatch) {
            description += cleanHTML(textMatch[1]) + ' ';
        }
    }
    
    // Method 5: Extract meta description
    const metaMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
    if (metaMatch) {
        description += cleanHTML(metaMatch[1]) + ' ';
    }
    
    // Method 6: Extract title
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    if (titleMatch) {
        description += titleMatch[1] + ' ';
    }
    
    return description.trim();
}

// Clean HTML tags and decode entities
function cleanHTML(text) {
    return text
        .replace(/<[^>]*>/g, ' ')           // Remove HTML tags
        .replace(/&nbsp;/g, ' ')            // Replace &nbsp;
        .replace(/&amp;/g, '&')             // Replace &amp;
        .replace(/&lt;/g, '<')              // Replace &lt;
        .replace(/&gt;/g, '>')              // Replace &gt;
        .replace(/&quot;/g, '"')            // Replace &quot;
        .replace(/\s+/g, ' ')               // Collapse multiple spaces
        .trim();
}

// Analyze job description for scam patterns
function analyzeScamPatterns(jobDescription, companyName) {
    const detectedFlags = [];
    let totalRisk = 0;
    let maxPossibleWeight = 0;
    
    const textToAnalyze = (jobDescription + ' ' + (companyName || '')).toLowerCase();
    
    for (const [key, pattern] of Object.entries(SCAM_PATTERNS)) {
        maxPossibleWeight += pattern.weight;
        
        for (const keyword of pattern.keywords) {
            if (textToAnalyze.includes(keyword.toLowerCase())) {
                // Check if already flagged
                if (!detectedFlags.find(f => f.type === key)) {
                    detectedFlags.push({
                        type: key,
                        message: pattern.message,
                        keyword: keyword,
                        weight: pattern.weight
                    });
                    totalRisk += pattern.weight;
                }
                break;
            }
        }
    }
    
    const riskScore = maxPossibleWeight > 0 ? (totalRisk / maxPossibleWeight) * 100 : 0;
    const legitimacyScore = Math.max(0, 100 - riskScore);
    
    return {
        score: Math.round(legitimacyScore),
        flags: detectedFlags,
        riskLevel: riskScore > 50 ? 'high' : (riskScore > 25 ? 'medium' : 'low')
    };
}

// Fetch Reddit posts about the company
async function fetchRedditData(companyName) {
    if (!companyName || companyName.length < 3) return null;
    
    try {
        const searchTerm = encodeURIComponent(companyName.split(' ')[0]);
        const response = await fetch(
            `https://www.reddit.com/search.json?q=${searchTerm}&limit=8`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; JobValidator/1.0)'
                }
            }
        );
        
        if (!response.ok) throw new Error('Reddit API error');
        
        const data = await response.json();
        
        if (data.data && data.data.children && data.data.children.length > 0) {
            const scamMentions = [];
            let relevantPosts = 0;
            
            data.data.children.forEach(child => {
                const post = child.data;
                const content = (post.title + ' ' + (post.selftext || '')).toLowerCase();
                
                if (content.includes(companyName.toLowerCase()) || content.includes(searchTerm.toLowerCase())) {
                    relevantPosts++;
                    if (content.includes('scam') || content.includes('fake') || content.includes('ghost job') || 
                        content.includes('never heard back') || content.includes('avoid') || content.includes('warning')) {
                        scamMentions.push({
                            title: post.title.substring(0, 120),
                            url: `https://reddit.com${post.permalink}`,
                            score: post.score
                        });
                    }
                }
            });
            
            return {
                totalPosts: relevantPosts,
                scamMentions: scamMentions,
                hasData: relevantPosts > 0
            };
        }
        return { hasData: false };
        
    } catch (error) {
        console.error('Reddit fetch error:', error);
        return null;
    }
}

// Extract company name from job description
function extractCompanyName(jobDescription) {
    if (!jobDescription) return null;
    
    const patterns = [
        /(?:at|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/,
        /company[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i,
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:is hiring|is seeking|is looking)/i,
        /([A-Z][a-z]+)\s+(?:Inc|Corp|LLC|Ltd|GmbH)/i
    ];
    
    for (const pattern of patterns) {
        const match = jobDescription.match(pattern);
        if (match && match[1] && match[1].length < 40 && match[1].length > 2) {
            return match[1];
        }
    }
    
    return null;
}

// Calculate final trust score
function calculateTrustScore(scamAnalysis, redditData) {
    let score = scamAnalysis.score;
    
    if (redditData && redditData.hasData && redditData.scamMentions.length > 0) {
        score -= Math.min(25, redditData.scamMentions.length * 8);
    }
    
    return Math.max(0, Math.min(100, score));
}

// Get recommendation
function getRecommendation(score) {
    if (score >= 80) {
        return { 
            text: '✅ Likely Legitimate - This job posting appears trustworthy. Proceed with normal caution.', 
            class: 'trust-high' 
        };
    } else if (score >= 50) {
        return { 
            text: '⚠️ Moderate Risk - Some red flags detected. Research the company thoroughly before applying.', 
            class: 'trust-medium' 
        };
    } else {
        return { 
            text: '❌ High Risk - Multiple scam indicators found. We strongly recommend avoiding this opportunity.', 
            class: 'trust-low' 
        };
    }
}

// Display results
function displayResults(trustScore, scamAnalysis, redditData, companyName, jobDescriptionPreview) {
    const recommendation = getRecommendation(trustScore);
    
    let scoreColor = '#28a745';
    if (trustScore < 50) scoreColor = '#dc3545';
    else if (trustScore < 80) scoreColor = '#ffc107';
    
    let html = `
        <div class="result-card ${recommendation.class}">
            <h2>🔍 Final Trust Score: ${trustScore}/100</h2>
            <p style="margin-top: 10px; font-size: 1.1rem;">${recommendation.text}</p>
        </div>
        
        <div class="score-circle" style="border: 5px solid ${scoreColor}; color: ${scoreColor};">
            ${trustScore}
        </div>
    `;
    
    if (companyName) {
        html += `<div class="section"><h3>🏢 Company: ${companyName}</h3></div>`;
    }
    
    // Scam Pattern Analysis
    html += `<div class="section"><h3>⚠️ Scam Pattern Analysis</h3>`;
    html += `<p><strong>Legitimacy Score from Patterns:</strong> ${scamAnalysis.score}/100</p>`;
    html += `<p><strong>Risk Level:</strong> <span style="font-weight: bold; text-transform: uppercase; color: ${scamAnalysis.riskLevel === 'high' ? '#dc3545' : (scamAnalysis.riskLevel === 'medium' ? '#ffc107' : '#28a745')};">${scamAnalysis.riskLevel}</span></p>`;
    
    if (scamAnalysis.flags.length > 0) {
        html += `<ul class="flag-list">`;
        scamAnalysis.flags.forEach(flag => {
            html += `<li>${flag.message}</li>`;
        });
        html += `</ul>`;
    } else {
        html += `<p>✅ No obvious scam patterns detected in this job description</p>`;
    }
    html += `</div>`;
    
    // Reddit Analysis
    if (redditData && redditData.hasData) {
        html += `<div class="section"><h3>🗣️ Reddit Community Analysis</h3>`;
        html += `<p>Found ${redditData.totalPosts} discussions mentioning this company</p>`;
        
        if (redditData.scamMentions.length > 0) {
            html += `<p><strong>⚠️ ${redditData.scamMentions.length} scam-related mentions found:</strong></p>`;
            redditData.scamMentions.forEach(post => {
                html += `<div class="reddit-post">📌 <a href="${post.url}" target="_blank" rel="noopener noreferrer">${post.title}</a></div>`;
            });
        } else {
            html += `<p>✅ No scam mentions found in recent Reddit discussions</p>`;
        }
        html += `</div>`;
    } else {
        html += `<div class="section"><h3>🗣️ Reddit Analysis</h3><p>ℹ️ Could not fetch Reddit data. This doesn't indicate a problem with the job.</p></div>`;
    }
    
    // Show preview
    if (jobDescriptionPreview && jobDescriptionPreview.length > 50) {
        html += `<div class="section"><h3>📄 Job Description Preview</h3>`;
        html += `<p style="font-size: 0.85rem; color: #666; max-height: 120px; overflow-y: auto; background: #f8f9fa; padding: 10px; border-radius: 8px;">${jobDescriptionPreview.substring(0, 600)}${jobDescriptionPreview.length > 600 ? '...' : ''}</p>`;
        html += `</div>`;
    }
    
    resultsDiv.innerHTML = html;
    resultsDiv.classList.remove('hidden');
}

// Display error message
function displayError(message) {
    resultsDiv.innerHTML = `
        <div class="section" style="background: #f8d7da; color: #721c24;">
            <h3>❌ Error</h3>
            <p>${message}</p>
        </div>
    `;
    resultsDiv.classList.remove('hidden');
}

// Main analysis function
async function analyzeJob() {
    const url = jobUrlInput.value.trim();
    
    if (!url) {
        alert('Please paste a LinkedIn job URL');
        return;
    }
    
    if (!url.includes('linkedin.com/jobs/view/')) {
        alert('Please enter a valid LinkedIn job URL.\n\nIt should look like: https://www.linkedin.com/jobs/view/1234567890/');
        return;
    }
    
    loadingDiv.classList.remove('hidden');
    resultsDiv.classList.add('hidden');
    
    try {
        const jobDescription = await fetchJobDescription(url);
        
        if (!jobDescription || jobDescription.length < 50) {
            displayError('Could not fetch the job description. The LinkedIn page might be restricted. Try again later or manually paste the job description.');
            loadingDiv.classList.add('hidden');
            return;
        }
        
        const companyName = extractCompanyName(jobDescription);
        const scamAnalysis = analyzeScamPatterns(jobDescription, companyName);
        
        let redditData = null;
        if (companyName) {
            try {
                redditData = await fetchRedditData(companyName);
            } catch (e) {
                console.log('Reddit fetch skipped:', e);
            }
        }
        
        const trustScore = calculateTrustScore(scamAnalysis, redditData);
        displayResults(trustScore, scamAnalysis, redditData, companyName, jobDescription);
        
    } catch (error) {
        console.error('Analysis error:', error);
        displayError('An unexpected error occurred. Please try again.');
    } finally {
        loadingDiv.classList.add('hidden');
    }
}

// Event listeners
analyzeBtn.addEventListener('click', analyzeJob);
jobUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') analyzeJob();
});