// DOM Elements
const jobUrlInput = document.getElementById('jobUrl');
const analyzeBtn = document.getElementById('analyzeBtn');
const loadingDiv = document.getElementById('loading');
const resultsDiv = document.getElementById('results');

// Scam patterns to detect
const SCAM_PATTERNS = {
    aiInterview: {
        keywords: ['AI interview', 'record yourself', 'train our AI', 'test our model', 'AI training'],
        weight: 25,
        message: '⚠️ AI Interview Request - May be using you to train their AI model'
    },
    paymentRequest: {
        keywords: ['pay for training', 'deposit required', 'equipment fee', 'background check fee', 'processing fee'],
        weight: 30,
        message: '💰 Requests Payment - Legitimate employers never ask for money'
    },
    urgency: {
        keywords: ['immediate start', 'urgent hiring', 'limited positions', 'act now'],
        weight: 10,
        message: '⏰ High Pressure Tactics - Scammers create false urgency'
    },
    suspiciousContact: {
        keywords: ['@gmail.com', '@hotmail.com', '@yahoo.com', '@outlook.com', 'whatsapp', 'telegram'],
        weight: 20,
        message: '📧 Suspicious Contact Method - Legitimate companies use professional email domains'
    },
    vagueDescription: {
        keywords: ['work from home', 'no experience needed', 'earn quick money', 'unlimited income'],
        weight: 15,
        message: '📝 Vague Job Description - Lacks specific responsibilities'
    }
};

// Analyze job description for scam patterns
function analyzeScamPatterns(jobDescription) {
    const detectedFlags = [];
    let totalRisk = 0;
    let maxPossibleWeight = 0;
    
    for (const [key, pattern] of Object.entries(SCAM_PATTERNS)) {
        maxPossibleWeight += pattern.weight;
        
        for (const keyword of pattern.keywords) {
            if (jobDescription.toLowerCase().includes(keyword.toLowerCase())) {
                detectedFlags.push({
                    type: key,
                    message: pattern.message,
                    keyword: keyword,
                    weight: pattern.weight
                });
                totalRisk += pattern.weight;
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
    if (!companyName) return null;
    
    try {
        const response = await fetch(
            `https://api.pushshift.io/reddit/search/submission/?q=${encodeURIComponent(companyName)}&size=8&sort=desc`
        );
        
        if (!response.ok) throw new Error('Reddit API error');
        
        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
            const scamMentions = [];
            
            data.data.forEach(post => {
                const content = (post.title + ' ' + (post.selftext || '')).toLowerCase();
                if (content.includes('scam') || content.includes('fake') || content.includes('ghost job')) {
                    scamMentions.push({
                        title: post.title,
                        url: `https://reddit.com${post.permalink}`,
                        score: post.score
                    });
                }
            });
            
            return {
                totalPosts: data.data.length,
                scamMentions: scamMentions,
                hasData: true
            };
        }
        return { hasData: false };
        
    } catch (error) {
        console.error('Reddit fetch error:', error);
        return null;
    }
}

// Extract company name from URL or use placeholder
function extractCompanyName(url) {
    const match = url.match(/linkedin\.com\/company\/([^\/?]+)/);
    if (match) {
        return decodeURIComponent(match[1].replace(/-/g, ' '));
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
        return { text: '✅ Likely Legitimate - This job posting appears trustworthy', class: 'trust-high' };
    } else if (score >= 50) {
        return { text: '⚠️ Moderate Risk - Proceed with caution and do additional research', class: 'trust-medium' };
    } else {
        return { text: '❌ High Risk - Strong scam indicators. We recommend avoiding this opportunity', class: 'trust-low' };
    }
}

// Display results
function displayResults(trustScore, scamAnalysis, redditData, companyName) {
    const recommendation = getRecommendation(trustScore);
    
    let scoreColor = '#28a745';
    if (trustScore < 50) scoreColor = '#dc3545';
    else if (trustScore < 80) scoreColor = '#ffc107';
    
    let html = `
        <div class="result-card ${recommendation.class}">
            <h2>Final Trust Score: ${trustScore}/100</h2>
            <p style="margin-top: 10px;">${recommendation.text}</p>
        </div>
        
        <div class="score-circle" style="border: 5px solid ${scoreColor}; color: ${scoreColor};">
            ${trustScore}
        </div>
    `;
    
    if (companyName) {
        html += `<div class="section"><h3>🏢 Company: ${companyName}</h3></div>`;
    }
    
    html += `<div class="section"><h3>⚠️ Scam Pattern Analysis</h3>`;
    html += `<p><strong>Legitimacy Score:</strong> ${scamAnalysis.score}/100</p>`;
    html += `<p><strong>Risk Level:</strong> ${scamAnalysis.riskLevel.toUpperCase()}</p>`;
    
    if (scamAnalysis.flags.length > 0) {
        html += `<ul class="flag-list">`;
        scamAnalysis.flags.forEach(flag => {
            html += `<li>${flag.message}</li>`;
        });
        html += `</ul>`;
    } else {
        html += `<p>✅ No obvious scam patterns detected</p>`;
    }
    html += `</div>`;
    
    if (redditData && redditData.hasData) {
        html += `<div class="section"><h3>🗣️ Reddit Community Analysis</h3>`;
        html += `<p>Found ${redditData.totalPosts} discussions about this company</p>`;
        
        if (redditData.scamMentions.length > 0) {
            html += `<p><strong>⚠️ ${redditData.scamMentions.length} scam-related mentions found:</strong></p>`;
            redditData.scamMentions.forEach(post => {
                html += `<div class="reddit-post">📌 <a href="${post.url}" target="_blank">${post.title.substring(0, 100)}</a></div>`;
            });
        } else {
            html += `<p>✅ No scam mentions found in recent Reddit discussions</p>`;
        }
        html += `</div>`;
    } else {
        html += `<div class="section"><h3>🗣️ Reddit Analysis</h3><p>Could not fetch Reddit data. Try again later.</p></div>`;
    }
    
    resultsDiv.innerHTML = html;
    resultsDiv.classList.remove('hidden');
}

// Main analysis function
async function analyzeJob() {
    const url = jobUrlInput.value.trim();
    
    if (!url) {
        alert('Please paste a LinkedIn job URL');
        return;
    }
    
    if (!url.includes('linkedin.com/jobs/') && !url.includes('linkedin.com/company/')) {
        alert('Please enter a valid LinkedIn job URL');
        return;
    }
    
    loadingDiv.classList.remove('hidden');
    resultsDiv.classList.add('hidden');
    
    const companyName = extractCompanyName(url);
    const sampleDescription = "Job description would be extracted here. In a real implementation, you'd need to scrape or use LinkedIn API. For demo, we're using pattern matching on URL and company name.";
    
    const scamAnalysis = analyzeScamPatterns(sampleDescription + ' ' + (companyName || ''));
    const redditData = await fetchRedditData(companyName);
    const trustScore = calculateTrustScore(scamAnalysis, redditData);
    
    displayResults(trustScore, scamAnalysis, redditData, companyName);
    loadingDiv.classList.add('hidden');
}

// Event listener
analyzeBtn.addEventListener('click', analyzeJob);
jobUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') analyzeJob();
});