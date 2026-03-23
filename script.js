// ============================================
// JOB LEGITIMACY CHECKER
// Simple Version - Scam Detection Only
// ============================================

// DOM Elements
const jobDescTextarea = document.getElementById('jobDescription');
const companyNameInput = document.getElementById('companyName');
const analyzeBtn = document.getElementById('analyzeBtn');
const loadingDiv = document.getElementById('loading');
const resultsDiv = document.getElementById('results');

// Scam patterns to detect
const SCAM_PATTERNS = {
    aiInterview: {
        keywords: ['AI interview', 'record yourself', 'train our AI', 'test our model', 'AI training', 'record your response', 'LLM', 'Large Language Model', 'data annotation', 'annotator', 'train our model', 'training data', 'language model training'],
        weight: 25,
        message: '⚠️ AI Training Scam - May be using you to train their AI model for free or low pay'
    },
    paymentRequest: {
        keywords: ['pay for training', 'deposit required', 'equipment fee', 'background check fee', 'processing fee', 'registration fee', 'application fee', 'pay to apply', 'investment required'],
        weight: 30,
        message: '💰 Requests Payment - Legitimate employers never ask for money'
    },
    urgency: {
        keywords: ['immediate start', 'urgent hiring', 'limited positions', 'act now', 'apply today only', 'within 2 days', 'within 48 hours', 'apply immediately', 'hiring immediately'],
        weight: 10,
        message: '⏰ High Pressure Tactics - Scammers create false urgency'
    },
    suspiciousContact: {
        keywords: ['@gmail.com', '@hotmail.com', '@yahoo.com', '@outlook.com', 'whatsapp', 'telegram', 'signal app', 'telegram group', 'skype interview'],
        weight: 20,
        message: '📧 Suspicious Contact Method - Legitimate companies use professional email domains'
    },
    vagueDescription: {
        keywords: ['work from home', 'no experience needed', 'earn quick money', 'unlimited income', 'be your own boss', 'flexible hours', 'freelance', 'project-based', 'make money fast', 'easy money'],
        weight: 15,
        message: '📝 Vague Job Description - Lacks specific responsibilities and requirements'
    }
};

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

// Extract company name from job description if not provided
function extractCompanyFromDescription(jobDescription) {
    if (!jobDescription) return null;
    
    const patterns = [
        /(?:at|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/,
        /company[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i,
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:is hiring|is seeking|is looking)/i,
        /([A-Z][a-z]+)\s+(?:Inc|Corp|LLC|Ltd|GmbH|AG|SE)/i
    ];
    
    for (const pattern of patterns) {
        const match = jobDescription.match(pattern);
        if (match && match[1] && match[1].length < 40 && match[1].length > 2) {
            return match[1];
        }
    }
    
    return null;
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

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Display results
function displayResults(trustScore, scamAnalysis, companyName, jobDescription) {
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
        const glassdoorSearchUrl = `https://www.glassdoor.com/Reviews/${encodeURIComponent(companyName.replace(/ /g, '-'))}-Reviews-E.htm`;
        html += `<div class="section"><h3>🏢 Company: ${escapeHtml(companyName)}</h3>`;
        html += `<a href="${glassdoorSearchUrl}" target="_blank" rel="noopener noreferrer" class="glassdoor-link">📊 View on Glassdoor →</a>`;
        html += `</div>`;
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
    
    // Show preview of analyzed text
    if (jobDescription && jobDescription.length > 0) {
        html += `<div class="section"><h3>📄 Analyzed Job Description Preview</h3>`;
        html += `<p style="font-size: 0.85rem; color: #666; max-height: 150px; overflow-y: auto; background: #f8f9fa; padding: 12px; border-radius: 8px; white-space: pre-wrap;">${escapeHtml(jobDescription.substring(0, 600))}${jobDescription.length > 600 ? '...' : ''}</p>`;
        html += `</div>`;
    }
    
    resultsDiv.innerHTML = html;
    resultsDiv.classList.remove('hidden');
}

// Main analysis function
function analyzeJob() {
    const jobDescription = jobDescTextarea.value.trim();
    let companyName = companyNameInput.value.trim();
    
    // Validate
    if (!jobDescription) {
        alert('Please paste the job description');
        jobDescTextarea.focus();
        return;
    }
    
    if (jobDescription.length < 50) {
        alert('Please paste a complete job description (at least 50 characters)');
        jobDescTextarea.focus();
        return;
    }
    
    // If company name not provided, try to extract from description
    if (!companyName) {
        companyName = extractCompanyFromDescription(jobDescription);
        if (companyName) {
            companyNameInput.value = companyName;
        }
    }
    
    loadingDiv.classList.remove('hidden');
    resultsDiv.classList.add('hidden');
    
    // Small delay to show loading animation
    setTimeout(() => {
        const scamAnalysis = analyzeScamPatterns(jobDescription, companyName);
        const trustScore = scamAnalysis.score;
        
        displayResults(trustScore, scamAnalysis, companyName, jobDescription);
        loadingDiv.classList.add('hidden');
    }, 100);
}

// Event listeners
analyzeBtn.addEventListener('click', analyzeJob);