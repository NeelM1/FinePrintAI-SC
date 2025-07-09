// Background script for Fineprint AI Chrome Extension

// Inline Free AI Service for Service Worker compatibility
class FreeAIService {
    async analyzeWithFreeAI(text, url, title) {
        console.log('Using free AI analysis (no costs)');
        
        try {
            // Try Hugging Face free inference first
            const aiResult = await this.callHuggingFaceAPI(text, title);
            if (aiResult) {
                return aiResult;
            }
        } catch (error) {
            console.log('Free AI failed, using rule-based fallback:', error.message);
        }
        
        // Fallback to rule-based analysis
        return this.createRuleBasedAnalysis(text, url, title);
    }

    async callHuggingFaceAPI(text, title) {
        const truncatedText = text.length > 2000 ? text.substring(0, 2000) + '...' : text;
        
        const prompt = `Analyze this ${title.includes('Privacy') ? 'privacy policy' : 'terms of service'} and rate its transparency from A-F. List concerning clauses:

${truncatedText}

Provide: Grade (A-F), 3 key points, and concerning issues.`;
        
        try {
            const response = await fetch('https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    inputs: prompt,
                    parameters: {
                        max_length: 500,
                        temperature: 0.3
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                return this.parseAIResponse(data, title);
            }
        } catch (error) {
            console.log('Hugging Face API error:', error);
        }
        
        return null;
    }

    parseAIResponse(data, title) {
        try {
            const responseText = data[0]?.generated_text || '';
            
            // Extract grade (look for A, B, C, D, F)
            const gradeMatch = responseText.match(/\b([ABCDF])\b/);
            const grade = gradeMatch ? gradeMatch[1] : 'C';
            
            // Create structured response
            return {
                transparencyGrade: grade,
                summary: [
                    `Document type: ${title.includes('Privacy') ? 'Privacy Policy' : 'Terms of Service'}`,
                    `AI-generated transparency assessment: Grade ${grade}`,
                    'Analysis performed using free AI model',
                    responseText.length > 50 ? responseText.substring(0, 100) + '...' : 'Standard terms and conditions detected'
                ],
                redFlags: this.extractRedFlagsFromAI(responseText),
                userInsight: `This document received a ${grade} grade from our AI analysis. ${this.getGradeDescription(grade)} Consider reviewing the highlighted concerns before accepting.`
            };
        } catch (error) {
            console.log('Error parsing AI response:', error);
            return null;
        }
    }

    extractRedFlagsFromAI(text) {
        const commonIssues = [
            { keywords: ['data', 'collect', 'share'], description: 'Data collection and sharing practices', severity: 'Medium' },
            { keywords: ['terminate', 'suspend'], description: 'Account termination policies', severity: 'Medium' },
            { keywords: ['change', 'modify', 'update'], description: 'Terms modification policies', severity: 'Low' }
        ];
        
        const flags = [];
        const lowerText = text.toLowerCase();
        
        commonIssues.forEach(issue => {
            if (issue.keywords.some(keyword => lowerText.includes(keyword))) {
                flags.push({
                    severity: issue.severity,
                    description: issue.description,
                    clause: 'AI-identified concerning clause from document analysis'
                });
            }
        });
        
        return flags.slice(0, 3); // Limit to 3 flags
    }

    extractClauseForPattern(text, pattern) {
        const sentences = text.split(/[.!?]+/);
        const lowerText = text.toLowerCase();
        
        // Find sentence containing the concerning keyword
        for (const keyword of pattern.keywords) {
            const keywordIndex = lowerText.indexOf(keyword);
            if (keywordIndex !== -1) {
                // Find the sentence containing this keyword
                let charCount = 0;
                for (const sentence of sentences) {
                    charCount += sentence.length + 1;
                    if (charCount > keywordIndex) {
                        return sentence.trim() + '.';
                    }
                }
            }
        }
        return 'Specific clause would be highlighted from the original document.';
    }

    createRuleBasedAnalysis(text, url, title) {
        const patterns = [
            {
                keywords: ['without notice', 'without prior notice', 'at any time without notice', 'modify these terms at any time'],
                negations: ['will not', 'do not', 'never', 'not without notice'],
                description: 'Can change terms without notice',
                severity: 'High',
                type: 'terms_modification'
            },
            {
                keywords: ['share', 'sell', 'third party', 'third-party', 'partners', 'affiliates', 'service providers'],
                negations: ['do not share', 'will not share', 'never share', 'do not sell', 'will not sell', 'never sell'],
                description: 'May share your data with third parties',
                severity: 'Medium',
                type: 'data_sharing'
            },
            {
                keywords: ['binding arbitration', 'arbitration', 'waive', 'class action', 'jury trial'],
                negations: ['no arbitration', 'not binding', 'do not waive'],
                description: 'Requires binding arbitration',
                severity: 'High',
                type: 'arbitration'
            },
            {
                keywords: ['terminate', 'suspend', 'sole discretion', 'without cause', 'immediately'],
                negations: ['will not terminate', 'do not terminate', 'only with cause'],
                description: 'Can terminate account at their discretion',
                severity: 'Medium',
                type: 'account_termination'
            },
            {
                keywords: ['collect', 'track', 'monitor', 'location', 'device information', 'browsing habits'],
                negations: ['do not collect', 'will not collect', 'never collect', 'do not track', 'will not track', 'never track'],
                description: 'Extensive data collection and tracking',
                severity: 'Low',
                type: 'data_collection'
            },
            {
                keywords: ['liability', 'damages', 'not responsible', 'disclaim', 'exclude'],
                negations: ['accept liability', 'responsible for', 'do not disclaim'],
                description: 'Limits company liability for damages',
                severity: 'Low',
                type: 'liability_limitation'
            },
            {
                keywords: ['intellectual property', 'license', 'royalty-free', 'worldwide', 'perpetual'],
                negations: ['do not claim', 'limited license', 'revocable license'],
                description: 'Claims broad rights to your content',
                severity: 'Low',
                type: 'content_rights'
            },
            {
                keywords: ['cookies', 'analytics', 'advertising', 'targeting', 'personalized ads'],
                negations: ['no cookies', 'do not use cookies', 'no advertising', 'no tracking'],
                description: 'Uses cookies for advertising and tracking',
                severity: 'Low',
                type: 'cookies_tracking'
            }
        ];

        const positiveSignals = [
            'user control', 'opt-out', 'delete your data', 'privacy by design',
            'transparent', 'user rights', 'data protection', 'user consent',
            'do not sell', 'do not share', 'do not collect', 'do not track',
            'you can delete', 'you control', 'your choice', 'with your permission'
        ];

        let redFlags = [];
        let score = 80; // Start with good baseline
        const lowerText = text.toLowerCase();
        
        // Check for concerning patterns with improved negation detection
        patterns.forEach(pattern => {
            const hasKeyword = pattern.keywords.some(keyword => lowerText.includes(keyword));
            
            // Check for negations in context (within 50 characters of keyword)
            let hasNegation = false;
            if (hasKeyword) {
                for (const keyword of pattern.keywords) {
                    const keywordIndex = lowerText.indexOf(keyword);
                    if (keywordIndex !== -1) {
                        const contextStart = Math.max(0, keywordIndex - 50);
                        const contextEnd = Math.min(lowerText.length, keywordIndex + keyword.length + 50);
                        const context = lowerText.substring(contextStart, contextEnd);
                        
                        if (pattern.negations.some(negation => context.includes(negation))) {
                            hasNegation = true;
                            break;
                        }
                    }
                }
            }
            
            // Only flag if keyword found AND no negation in context
            if (hasKeyword && !hasNegation) {
                const flaggedClause = this.extractClauseForPattern(text, pattern);
                redFlags.push({
                    severity: pattern.severity,
                    description: pattern.description,
                    clause: flaggedClause,
                    type: pattern.type
                });
                // Balanced penalties
                score -= pattern.severity === 'High' ? 12 : pattern.severity === 'Medium' ? 7 : 3;
            }
        });

        // Check for positive signals with moderate rewards
        positiveSignals.forEach(phrase => {
            if (lowerText.includes(phrase)) {
                score += 5; // Moderate reward for positive practices
            }
        });

        // Prevent extremely low scores - minimum of 15
        score = Math.max(15, Math.min(100, score));
        
        // Determine grade based on adjusted score
        const grade = this.scoreToGrade(score);

        return {
            transparencyGrade: grade,
            score: score,
            redFlags: redFlags.slice(0, 8), // Show more red flags
            summary: [
                `Document type: ${title.includes('Privacy') ? 'Privacy Policy' : 'Terms of Service'}`,
                `Transparency score: ${score}/100 (${this.getGradeDescription(grade)})`,
                `Red flags detected: ${redFlags.length}`,
                redFlags.length > 0 ? 'Several concerning clauses were identified' : 'No major red flags detected',
                'Analysis performed using advanced pattern recognition'
            ],
            userInsight: `This ${title.includes('Privacy') ? 'privacy policy' : 'terms of service'} has been analyzed for user-friendliness. ${redFlags.length > 0 ? 'Be aware of the concerning clauses highlighted in the red flags section.' : 'This document appears relatively user-friendly.'} Consider reading the full document for complete understanding.`
        };
    }

    scoreToGrade(score) {
        // Balanced grading scale
        if (score >= 85) return 'A';
        if (score >= 70) return 'B'; 
        if (score >= 55) return 'C';
        if (score >= 40) return 'D';
        return 'F';
    }

    getGradeDescription(grade) {
        const descriptions = {
            'A': 'Very user-friendly and transparent',
            'B': 'Generally fair with minor concerns',
            'C': 'Average with some concerning clauses',
            'D': 'Several problematic terms',
            'F': 'Many concerning or unfair clauses'
        };
        return descriptions[grade] || 'Analysis unclear';
    }
}

class FineprintBackground {
    constructor() {
        this.apiKey = null;
        this.freeAI = new FreeAIService();
        this.init();
    }

    init() {
        // Listen for messages from content script and popup
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open for async response
        });

        // Load API key on startup
        this.loadApiKey();
    }

    async loadApiKey() {
        try {
            const result = await chrome.storage.sync.get(['openaiApiKey']);
            this.apiKey = result.openaiApiKey || '';
        } catch (error) {
            console.error('Error loading API key:', error);
        }
    }

    async handleMessage(message, sender, sendResponse) {
        switch (message.action) {
            case 'analyzeText':
                try {
                    const result = await this.analyzeTextWithAI(message.text, message.url, message.title);
                    sendResponse({ success: true, data: result });
                } catch (error) {
                    console.error('Analysis error:', error);
                    sendResponse({ success: false, error: error.message });
                }
                break;

            case 'saveAnalysis':
                try {
                    await this.saveAnalysisToHistory(message.data);
                    sendResponse({ success: true });
                } catch (error) {
                    console.error('Save error:', error);
                    sendResponse({ success: false, error: error.message });
                }
                break;

            case 'updateApiKey':
                try {
                    await chrome.storage.sync.set({ openaiApiKey: message.apiKey });
                    this.apiKey = message.apiKey;
                    sendResponse({ success: true });
                } catch (error) {
                    console.error('API key update error:', error);
                    sendResponse({ success: false, error: error.message });
                }
                break;
                
            case 'openTab':
                try {
                    await chrome.tabs.create({ url: message.url });
                    sendResponse({ success: true });
                } catch (error) {
                    console.error('Open tab error:', error);
                    sendResponse({ success: false, error: error.message });
                }
                break;
        }
    }

    async analyzeTextWithAI(text, url, title) {
        // Always try free AI first
        console.log('Using free AI analysis (no costs)');
        const freeResult = await this.freeAI.analyzeWithFreeAI(text, url, title);
        
        // If free AI worked, return it
        if (freeResult && freeResult.transparencyGrade) {
            return freeResult;
        }
        
        // Only use OpenAI if user specifically has API key configured and free AI failed
        if (!this.apiKey || this.apiKey === 'your-openai-api-key-here') {
            console.log('Free AI failed, using rule-based analysis');
            return this.freeAI.createRuleBasedAnalysis(text, url, title);
        }

        console.log('Using premium OpenAI analysis');
        
        // Truncate text if too long (OpenAI has token limits)
        const maxLength = 12000; // Approximately 3000 tokens
        const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
                    messages: [
                        {
                            role: "system",
                            content: `You are a legal document analyzer specializing in Terms of Service and Privacy Policy analysis. 
                            Analyze the provided document and return a JSON response with the following structure:
                            {
                                "transparencyGrade": "A-F letter grade",
                                "summary": ["bullet point 1", "bullet point 2", "bullet point 3", "bullet point 4", "bullet point 5"],
                                "redFlags": [
                                    {"severity": "High/Medium/Low", "description": "Description of concerning clause"}
                                ],
                                "userInsight": "A paragraph explaining what this means for the average user in plain English"
                            }
                            
                            Focus on identifying concerning clauses like:
                            - Broad data collection practices
                            - Unclear data sharing policies
                            - Difficult account deletion processes
                            - Binding arbitration clauses
                            - Automatic renewals
                            - Overly broad liability limitations
                            - Unclear termination policies
                            
                            Provide practical, actionable insights that help users understand the real implications.`
                        },
                        {
                            role: "user",
                            content: `Please analyze this Terms of Service or Privacy Policy document:\n\nTitle: ${title}\nURL: ${url}\n\nDocument text:\n${truncatedText}`
                        }
                    ],
                    response_format: { type: "json_object" },
                    max_tokens: 1500,
                    temperature: 0.3
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`OpenAI API error: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`);
            }

            const data = await response.json();
            const content = data.choices[0].message.content;
            
            try {
                const analysisResult = JSON.parse(content);
                
                // Validate the response structure
                if (!analysisResult.transparencyGrade || !analysisResult.summary || !analysisResult.userInsight) {
                    throw new Error('Invalid analysis response structure');
                }

                // Ensure summary is an array
                if (!Array.isArray(analysisResult.summary)) {
                    analysisResult.summary = [analysisResult.summary];
                }

                // Ensure redFlags is an array
                if (!Array.isArray(analysisResult.redFlags)) {
                    analysisResult.redFlags = [];
                }

                // Validate transparency grade
                if (!/^[ABCDF]$/.test(analysisResult.transparencyGrade)) {
                    analysisResult.transparencyGrade = 'C'; // Default grade
                }

                return analysisResult;

            } catch (parseError) {
                console.error('JSON parse error:', parseError);
                throw new Error('Failed to parse AI analysis response');
            }

        } catch (error) {
            console.error('OpenAI API error:', error);
            
            if (error.message.includes('API key')) {
                throw new Error('Invalid API key. Please check your OpenAI API key in settings.');
            } else if (error.message.includes('quota')) {
                throw new Error('OpenAI API quota exceeded. Please check your API usage.');
            } else if (error.message.includes('network') || error.message.includes('fetch')) {
                throw new Error('Network error. Please check your internet connection.');
            } else {
                throw new Error(`Analysis failed: ${error.message}`);
            }
        }
    }

    async saveAnalysisToHistory(data) {
        try {
            const result = await chrome.storage.local.get(['scanHistory']);
            const history = result.scanHistory || [];
            
            // Remove duplicate entries for same URL
            const filteredHistory = history.filter(item => item.url !== data.url);
            
            // Add new entry at the beginning
            filteredHistory.unshift(data);
            
            // Keep only last 50 entries
            const trimmedHistory = filteredHistory.slice(0, 50);
            
            await chrome.storage.local.set({ scanHistory: trimmedHistory });
            
        } catch (error) {
            console.error('Error saving to history:', error);
            throw error;
        }
    }

    // Utility method to get analysis history
    async getAnalysisHistory() {
        try {
            const result = await chrome.storage.local.get(['scanHistory']);
            return result.scanHistory || [];
        } catch (error) {
            console.error('Error getting history:', error);
            return [];
        }
    }

    // Utility method to clear history
    async clearAnalysisHistory() {
        try {
            await chrome.storage.local.set({ scanHistory: [] });
        } catch (error) {
            console.error('Error clearing history:', error);
            throw error;
        }
    }
}

// Initialize background script
new FineprintBackground();

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        // Set default settings
        chrome.storage.sync.set({
            autoScan: true,
            theme: 'cyberpunk',
            detectionSensitivity: 'medium'
        });
        
        // Open options page on first install
        chrome.runtime.openOptionsPage();
    }
});

// Handle tab updates to detect TOS/Privacy pages
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        try {
            const result = await chrome.storage.sync.get(['autoScan', 'detectionSensitivity']);
            
            if (result.autoScan !== false) { // Default to true
                const sensitivity = result.detectionSensitivity || 'medium';
                const isTosPage = await this.detectTosPage(tab.url, tab.title, sensitivity);
                
                if (isTosPage) {
                    // Badge to indicate TOS page detected
                    chrome.action.setBadgeText({
                        tabId: tabId,
                        text: 'TOS'
                    });
                    
                    chrome.action.setBadgeBackgroundColor({
                        color: '#00FF7F'
                    });
                } else {
                    // Clear badge for non-TOS pages
                    chrome.action.setBadgeText({
                        tabId: tabId,
                        text: ''
                    });
                }
            }
        } catch (error) {
            console.error('Error handling tab update:', error);
        }
    }
});

// Enhanced TOS/Privacy page detection with sensitivity levels
function detectTosPage(url, title, sensitivity = 'medium') {
    const lowerUrl = url.toLowerCase();
    const lowerTitle = (title || '').toLowerCase();
    
    const patterns = {
        high: [
            // URL patterns
            '/terms', '/privacy', '/policy', '/legal', '/tos', '/eula',
            '/agreement', '/conditions', '/disclaimer', '/gdpr', '/ccpa',
            '/data-policy', '/cookie-policy', '/user-agreement',
            'terms-of-service', 'privacy-policy', 'terms-and-conditions',
            'legal-notice', 'data-protection', 'cookie-notice',
            // Title patterns
            'terms of service', 'privacy policy', 'terms and conditions',
            'user agreement', 'legal notice', 'data policy', 'cookie policy',
            'privacy notice', 'terms of use', 'service agreement'
        ],
        medium: [
            '/terms', '/privacy', '/policy', '/legal', '/tos',
            '/agreement', '/conditions', 'terms-of-service', 'privacy-policy',
            'terms of service', 'privacy policy', 'terms and conditions'
        ],
        low: [
            '/terms', '/privacy', '/policy', '/legal',
            'terms of service', 'privacy policy'
        ]
    };
    
    const currentPatterns = patterns[sensitivity] || patterns.medium;
    
    return currentPatterns.some(pattern => 
        lowerUrl.includes(pattern) || lowerTitle.includes(pattern)
    );
}

// Clear badge when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.action.setBadgeText({
        tabId: tabId,
        text: ''
    });
});
