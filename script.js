// ============================================
// JOB LEGITIMACY CHECKER
// Full version with LinkedIn job description extraction
// ============================================

// DOM Elements
const jobUrlInput = document.getElementById('jobUrl');
const analyzeBtn = document.getElementById('analyzeBtn');
const loadingDiv = document.getElementById('loading');
const resultsDiv = document.getElementById('results');

// Scam patterns to detect
const SCAM_PATTERNS = {
    aiInterview: {
        keywords: ['AI interview', 'record yourself', 'train our AI', 'test our model', 'AI training', 'record your response', 'LLM', 'Large Language Model', 'data annotation', 'annotator'],
        weight: 25,
        message: '⚠️ AI Training Scam - May be using you to train their AI model for free or low pay'
    },
    paymentRequest: {
        keywords: ['pay for training', 'deposit required', 'equipment fee', 'background check fee', 'processing fee', 'registration fee', 'application fee'],
        weight: 30,
        message: '💰 Requests Payment - Legitimate employers never ask for money'
    },
    urgency: {
        keywords: ['immediate start', 'urgent hiring', 'limited positions', 'act now', 'apply today only', 'within 2 days', 'within 48 hours'],
        weight: 10,
        message: '⏰ High Pressure Tactics - Scammers create false urgency'
    },
    suspiciousContact: {
        keywords: ['@gmail.com', '@hotmail.com', '@yahoo.com', '@outlook.com', 'whatsapp', 'telegram', 'signal app'],
        weight: 20,
        message: '📧 Suspicious Contact Method - Legitimate companies use professional email domains'
    },
    vagueDescription: {
        keywords: ['work from home', 'no experience needed', 'earn quick money', 'unlimited income', 'be your own boss', 'flexible hours', 'freelance', 'project-based'],
        weight: 15,
        message: '📝 Vague Job Description - Lacks specific responsibilities and requirements'
    }
};

// Fetch job description from LinkedIn URL using AllOrigins (free CORS proxy)
async function fetchJobDescription(url) {
    try {
        // Use AllOrigins API to fetch LinkedIn page (free, no API key)
        const proxyUrl = `https://api.allorigins.ws/raw?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error('Failed to fetch job page');
        }
        
        const html = await response.text();
        
        // Extract job description from LinkedIn page
        // Look for job description content in various possible locations
        let description = '';
        
        // Method 1: Look for description in meta tags
        const metaMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
        if (metaMatch) {
            description += metaMatch[1] + ' ';
        }
        
        // Method 2: Look for job description divs (common LinkedIn patterns)
        const descPatterns = [
            /<div[^>]*class="[^"]*description[^"]*"[^>]*>(.*?)<\/div>/is,
            /<div[^>]*data-job-description[^>]*>(.*?)<\/div>/is,
            /<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>(.*?)<\/div>/is,
            /<div[^>]*class="[^"]*jobs-description[^"]*"[^>]*>(.*?)<\/div>/is
        ];
        
        for (const pattern of descPatterns) {
            const match = html.match(pattern);
            if (match) {
                // Strip HTML tags
                const text = match[1].replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
                description += text + ' ';
                break;
            }
        }
        
        // Method 3: Extract job title and company
        const titleMatch = html.match(/<title>(.*?)<\/title>/i);
        if (titleMatch) {
            description += titleMatch[1] + ' ';
        }
        
        if (description.length < 50) {
            // If we couldn't extract enough content, use a fallback
            description = "Job description could not be fully extracted. The analysis is based on limited information. " + description;
        }
        
        return description;
        
    } catch (error) {
        console.error('Fetch error:', error);
        return null;
    }
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
                detectedFlags.push({
                    type: key,
                    message: pattern.message,
                    keyword: keyword,
                    weight: pattern.weight
                });
                totalRisk += pattern.weight;
                break; // Only count each pattern once
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
        // Clean company name for search
        const searchTerm = encodeURIComponent(companyName.split(' ')[0]); // Use first word for better results
        const response = await fetch(
            `https://api.pushshift.io/reddit/search/submission/?q=${searchTerm}&size=8&sort=desc`
        );
        
        if (!response.ok) throw new Error('Reddit API error');
        
        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
            const scamMentions = [];
            let relevantPosts = 0;
            
            data.data.forEach(post => {
                const content = (post.title + ' ' + (post.selftext || '')).toLowerCase();
                if (content.includes(companyName.toLowerCase()) || content.includes(searchTerm.toLowerCase())) {
                    relevantPosts++;
                    if (content.includes('scam') || content.includes('fake') || content.includes('ghost job') || 
                        content.includes('never heard back') || content.includes('avoid')) {
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

// Extract company name from LinkedIn URL or job description
function extractCompanyName(url, jobDescription = '') {
    // Try to extract from URL
    let urlMatch = url.match(/linkedin\.com\/company\/([^\/?]+)/);
    if (urlMatch) {
        return decodeURIComponent(urlMatch[1].replace(/-/g, ' '));
    }
    
    // Try from job description - look for common patterns
    if (jobDescription) {
        const patterns = [
            /(?:at|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/,
            /company[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i,
            /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:is hiring|is seeking|is looking)/i
        ];
        
        for (const pattern of patterns) {
            const match = jobDescription.match(pattern);
            if (match && match[1] && match[1].length < 40) {
                return match[1];
            }
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
    html += `<p><strong>Risk Level:</strong> <span style="font-weight: bold; text-transform: uppercase;">${scamAnalysis.riskLevel}</span></p>`;
    
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
        html += `<div class="section"><h3>🗣️ Reddit Analysis</h3><p>ℹ️ Could not fetch Reddit data for this company. Try searching manually on Reddit.</p></div>`;
    }
    
    // Show preview of what was analyzed
    if (jobDescriptionPreview && jobDescriptionPreview.length > 0) {
        html += `<div class="section"><h3>📄 Job Description Preview (Analyzed)</h3>`;
        html += `<p style="font-size: 0.85rem; color: #666; max-height: 100px; overflow-y: auto;">${jobDescriptionPreview.substring(0, 500)}...</p>`;
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
            <p style="margin-top: 10px;">💡 <strong>Tip:</strong> Make sure you're using a public LinkedIn job URL like:<br>
            <code>https://www.linkedin.com/jobs/view/1234567890/</code></p>
            <p>If the URL is correct, the job page might be temporarily unavailable. Try again later.</p>
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
    
    // Validate URL format
    if (!url.includes('linkedin.com/jobs/view/')) {
        alert('Please enter a valid LinkedIn job URL.\n\nIt should look like: https://www.linkedin.com/jobs/view/1234567890/\n\nNote: URLs with /jobs/collections/ are your personal recommendations and cannot be analyzed.');
        return;
    }
    
    loadingDiv.classList.remove('hidden');
    resultsDiv.classList.add('hidden');
    
    try {
        // Step 1: Fetch job description
        const jobDescription = await fetchJobDescription(url);
        
        if (!jobDescription) {
            displayError('Could not fetch the job description. The LinkedIn page might be restricted or temporarily unavailable.');
            loadingDiv.classList.add('hidden');
            return;
        }
        
        // Step 2: Extract company name
        const companyName = extractCompanyName(url, jobDescription);
        
        // Step 3: Analyze scam patterns
        const scamAnalysis = analyzeScamPatterns(jobDescription, companyName);
        
        // Step 4: Fetch Reddit data (optional, don't block if fails)
        let redditData = null;
        try {
            redditData = await fetchRedditData(companyName);
        } catch (e) {
            console.log('Reddit fetch skipped:', e);
        }
        
        // Step 5: Calculate trust score
        const trustScore = calculateTrustScore(scamAnalysis, redditData);
        
        // Step 6: Display results
        displayResults(trustScore, scamAnalysis, redditData, companyName, jobDescription);
        
    } catch (error) {
        console.error('Analysis error:', error);
        displayError('An unexpected error occurred while analyzing the job. Please try again.');
    } finally {
        loadingDiv.classList.add('hidden');
    }
}

// Event listener
analyzeBtn.addEventListener('click', analyzeJob);
jobUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') analyzeJob();
});