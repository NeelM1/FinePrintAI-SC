/**
 * Free AI Analysis Service for Fineprint AI Extension
 * Uses completely free AI APIs that don't require payment
 */

class FreeAIService {
    constructor() {
        this.services = [
            {
                name: 'Hugging Face Inference API',
                endpoint: 'https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium',
                free: true,
                headers: {}
            },
            {
                name: 'Ollama Local',
                endpoint: 'http://localhost:11434/api/generate',
                free: true,
                local: true
            }
        ];
    }

    async analyzeWithFreeAI(text, url, title) {
        const prompt = this.createAnalysisPrompt(text, url, title);
        
        // Try different free AI services
        for (const service of this.services) {
            try {
                console.log(`Trying ${service.name}...`);
                const result = await this.callFreeAI(service, prompt);
                if (result) {
                    return this.parseAIResponse(result);
                }
            } catch (error) {
                console.log(`${service.name} failed:`, error.message);
                continue;
            }
        }
        
        // If all AI services fail, use rule-based analysis
        console.log('All AI services failed, using rule-based analysis');
        return this.createRuleBasedAnalysis(text, url, title);
    }

    createAnalysisPrompt(text, url, title) {
        return `Analyze this Terms of Service or Privacy Policy document and provide:

1. A transparency grade (A-F) where A is very user-friendly and F is very concerning
2. 3-5 major red flags or concerning clauses
3. A brief summary in plain English
4. Key points users should know

Document: ${title}
URL: ${url}
Content: ${text.substring(0, 3000)}...

Respond in JSON format:
{
  "grade": "B",
  "score": 75,
  "redFlags": ["concerning clause 1", "concerning clause 2"],
  "summary": "This document...",
  "keyPoints": ["point 1", "point 2"]
}`;
    }

    async callFreeAI(service, prompt) {
        try {
            const response = await fetch(service.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...service.headers
                },
                body: JSON.stringify({
                    inputs: prompt,
                    parameters: {
                        max_new_tokens: 500,
                        temperature: 0.7
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            return data.generated_text || data.response || data[0]?.generated_text;
        } catch (error) {
            throw new Error(`${service.name} API call failed: ${error.message}`);
        }
    }

    parseAIResponse(response) {
        try {
            // Try to extract JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    grade: parsed.grade || 'C',
                    score: parsed.score || 50,
                    redFlags: parsed.redFlags || [],
                    summary: parsed.summary || 'Analysis completed',
                    keyPoints: parsed.keyPoints || []
                };
            }
        } catch (error) {
            console.log('Failed to parse AI response as JSON');
        }
        
        // Fallback: create analysis from text response
        return this.createAnalysisFromText(response);
    }

    createAnalysisFromText(text) {
        const grade = this.extractGrade(text) || 'C';
        const score = this.gradeToScore(grade);
        
        return {
            grade: grade,
            score: score,
            redFlags: this.extractRedFlags(text),
            summary: this.extractSummary(text),
            keyPoints: this.extractKeyPoints(text)
        };
    }

    createRuleBasedAnalysis(text, url, title) {
        console.log('Creating rule-based analysis...');
        
        const concerningPhrases = [
            'we may share your information',
            'third party partners',
            'for marketing purposes',
            'without notice',
            'at our discretion',
            'binding arbitration',
            'class action waiver',
            'perpetual license',
            'irrevocable rights',
            'indemnify',
            'hold harmless',
            'liability limitation',
            'exclude warranties',
            'as-is basis'
        ];

        const positiveSignals = [
            'user control',
            'opt-out',
            'delete your data',
            'privacy by design',
            'transparent',
            'user rights',
            'data protection'
        ];

        let redFlags = [];
        let score = 70; // Start with neutral score

        // Check for concerning phrases
        const lowerText = text.toLowerCase();
        concerningPhrases.forEach(phrase => {
            if (lowerText.includes(phrase)) {
                redFlags.push(`Contains concerning language: "${phrase}"`);
                score -= 8;
            }
        });

        // Check for positive signals
        positiveSignals.forEach(phrase => {
            if (lowerText.includes(phrase)) {
                score += 5;
            }
        });

        // Additional red flag checks
        if (lowerText.includes('terminate') && lowerText.includes('without notice')) {
            redFlags.push('Can terminate your account without notice');
        }
        
        if (lowerText.includes('share') && lowerText.includes('third party')) {
            redFlags.push('May share your data with third parties');
        }

        if (lowerText.includes('change') && lowerText.includes('terms')) {
            redFlags.push('Can change terms without explicit consent');
        }

        // Determine grade based on score
        const grade = this.scoreToGrade(Math.max(0, Math.min(100, score)));

        return {
            grade: grade,
            score: score,
            redFlags: redFlags.slice(0, 5), // Limit to 5 red flags
            summary: `This ${title.includes('Privacy') ? 'privacy policy' : 'terms of service'} has been analyzed using pattern recognition. ${redFlags.length > 0 ? 'Several concerning clauses were identified.' : 'No major red flags detected.'} Score: ${score}/100`,
            keyPoints: [
                `Document type: ${title.includes('Privacy') ? 'Privacy Policy' : 'Terms of Service'}`,
                `Red flags found: ${redFlags.length}`,
                `Overall transparency: ${this.getGradeDescription(grade)}`,
                'Analysis performed using rule-based system (no AI costs)'
            ]
        };
    }

    extractGrade(text) {
        const gradeMatch = text.match(/grade["\s]*:?["\s]*([A-F])/i);
        return gradeMatch ? gradeMatch[1].toUpperCase() : null;
    }

    extractRedFlags(text) {
        const redFlags = [];
        const lines = text.split('\n');
        
        lines.forEach(line => {
            if (line.toLowerCase().includes('red flag') || 
                line.toLowerCase().includes('concerning') ||
                line.includes('•') || line.includes('-')) {
                const cleaned = line.replace(/[•\-\*]/g, '').trim();
                if (cleaned.length > 10) {
                    redFlags.push(cleaned);
                }
            }
        });
        
        return redFlags.slice(0, 5);
    }

    extractSummary(text) {
        const sentences = text.split('.').filter(s => s.length > 50);
        return sentences.length > 0 ? sentences[0] + '.' : 'Analysis completed using free AI service.';
    }

    extractKeyPoints(text) {
        const points = [];
        const lines = text.split('\n');
        
        lines.forEach(line => {
            if ((line.includes('•') || line.includes('-') || line.includes('*')) && 
                line.length > 20) {
                points.push(line.replace(/[•\-\*]/g, '').trim());
            }
        });
        
        return points.slice(0, 4);
    }

    gradeToScore(grade) {
        const gradeMap = { 'A': 90, 'B': 75, 'C': 60, 'D': 45, 'F': 25 };
        return gradeMap[grade] || 50;
    }

    scoreToGrade(score) {
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

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FreeAIService;
} else if (typeof window !== 'undefined') {
    window.FreeAIService = FreeAIService;
} else if (typeof globalThis !== 'undefined') {
    globalThis.FreeAIService = FreeAIService;
}