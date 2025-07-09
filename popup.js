// Popup functionality for Fineprint AI Chrome Extension
class FineprintPopup {
    constructor() {
        this.currentTab = 'summary';
        this.currentResults = null;
        this.init();
    }

    async init() {
        await this.loadTheme();
        await this.loadHistory();
        this.bindEvents();
        this.checkCurrentPage();
    }

    async loadTheme() {
        try {
            const result = await chrome.storage.sync.get(['theme']);
            const theme = result.theme || 'cyberpunk';
            document.body.className = `theme-${theme}`;
        } catch (error) {
            console.error('Error loading theme:', error);
        }
    }

    bindEvents() {
        // Scan button
        document.getElementById('scanBtn').addEventListener('click', () => this.scanCurrentPage());
        
        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Action buttons
        document.getElementById('shareBtn').addEventListener('click', () => this.shareResults());
        document.getElementById('saveBtn').addEventListener('click', () => this.saveResults());
        document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());

        // History items
        document.addEventListener('click', (e) => {
            if (e.target.closest('.history-item')) {
                this.loadHistoryItem(e.target.closest('.history-item').dataset.id);
            }
        });
    }

    async checkCurrentPage() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const url = tab.url;
            
            if (this.isTosOrPrivacyPage(url)) {
                const autoDetectInfo = document.getElementById('autoDetectInfo');
                autoDetectInfo.innerHTML = `
                    <div style="color: var(--neon-green);">
                        🎯 TOS/Privacy page detected! Ready for automatic scanning.
                    </div>
                `;
                autoDetectInfo.style.display = 'block';
            }
        } catch (error) {
            console.error('Error checking current page:', error);
        }
    }

    isTosOrPrivacyPage(url) {
        const patterns = ['/terms', '/privacy', '/policy', '/legal'];
        return patterns.some(pattern => url.toLowerCase().includes(pattern));
    }

    async scanCurrentPage() {
        const scanBtn = document.getElementById('scanBtn');
        const radarScanner = document.getElementById('radarScanner');
        const statusText = document.getElementById('statusText');
        
        try {
            // Update UI to scanning state with enhanced animations
            scanBtn.disabled = true;
            scanBtn.classList.add('scanning-animation');
            scanBtn.innerHTML = '<span class="btn-icon">⚡</span>Analyzing...';
            radarScanner.classList.add('active');
            statusText.textContent = 'AI is analyzing document...';
            
            // Add typewriter effect to status
            this.typewriterEffect(statusText, 'AI is analyzing document...');

            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Send message to content script to extract text
            const response = await chrome.tabs.sendMessage(tab.id, { 
                action: 'extractText' 
            });

            if (!response || !response.text) {
                throw new Error('Could not extract text from page');
            }

            // Start AI analysis in parallel with visual showcase
            const analysisPromise = chrome.runtime.sendMessage({
                action: 'analyzeText',
                text: response.text,
                url: tab.url,
                title: tab.title
            });

            // Artificial delay to showcase the amazing scanning animations (5-10 seconds)
            const showcaseDelay = 5000 + Math.random() * 5000; // 5-10 seconds
            const delayPromise = new Promise(resolve => setTimeout(resolve, showcaseDelay));
            
            // Wait for both analysis and showcase delay
            const [analysisResponse] = await Promise.all([analysisPromise, delayPromise]);

            if (!analysisResponse.success) {
                throw new Error(analysisResponse.error || 'Analysis failed');
            }

            // Display results
            this.displayResults(analysisResponse.data);
            
            // Save to history
            await this.saveToHistory({
                url: tab.url,
                title: tab.title,
                results: analysisResponse.data,
                timestamp: Date.now()
            });

        } catch (error) {
            console.error('Scan error:', error);
            this.showError('Scan failed: ' + error.message);
        } finally {
            // Reset UI with animations
            scanBtn.disabled = false;
            scanBtn.classList.remove('scanning-animation');
            scanBtn.innerHTML = '<span class="btn-icon">🔍</span>Scan Current Page';
            radarScanner.classList.remove('active');
            statusText.textContent = 'Ready to scan';
        }
    }

    displayResults(results) {
        this.currentResults = results;
        
        // Show results section
        document.getElementById('resultsSection').style.display = 'block';
        
        // Update transparency score
        const scoreLetter = document.getElementById('scoreLetter');
        const scoreDescription = document.getElementById('scoreDescription');
        
        scoreLetter.textContent = results.transparencyGrade;
        scoreDescription.textContent = this.getGradeDescription(results.transparencyGrade);
        
        // Update score circle color based on grade
        const scoreCircle = document.querySelector('.score-circle');
        scoreCircle.className = `score-circle grade-${results.transparencyGrade.toLowerCase()}`;

        // Populate summary
        const summaryList = document.getElementById('summaryList');
        summaryList.innerHTML = results.summary.map(item => 
            `<li>${item}</li>`
        ).join('');

        // Populate red flags
        const redFlagsList = document.getElementById('redFlagsList');
        if (results.redFlags && results.redFlags.length > 0) {
            redFlagsList.innerHTML = results.redFlags.map((flag, index) => `
                <div class="red-flag severity-${flag.severity.toLowerCase()}" data-flag-index="${index}">
                    <div class="red-flag-header">
                        <div class="red-flag-content">
                            <div class="red-flag-severity">${flag.severity} Risk</div>
                            <div>${flag.description}</div>
                        </div>
                        <div class="red-flag-expand">▼</div>
                    </div>
                    <div class="red-flag-details">
                        <div class="red-flag-section">
                            <h4>Problematic Clause:</h4>
                            <p class="clause-text">${flag.clause || 'No specific clause extracted from document'}</p>
                        </div>
                        <div class="red-flag-section">
                            <h4>Why This Is Concerning:</h4>
                            <p class="explanation" data-desc="${flag.description}" data-severity="${flag.severity}">Loading AI explanation...</p>
                        </div>
                        <div class="red-flag-section">
                            <h4>What This Means For You:</h4>
                            <p class="impact">${flag.impact || this.generateImpact(flag.description, flag.severity)}</p>
                        </div>
                    </div>
                </div>
            `).join('');
            // Add event listeners for red flag expansion and load AI explanations
            setTimeout(() => {
                document.querySelectorAll('.red-flag-header').forEach(header => {
                    header.addEventListener('click', () => {
                        const flagElement = header.closest('.red-flag');
                        flagElement.classList.toggle('expanded');
                    });
                });
                this.loadAIExplanations();
            }, 100);
        } else {
            redFlagsList.innerHTML = '<div class="success-message">No major red flags detected! 👍</div>';
        }

        // Populate insights
        const insightsContent = document.getElementById('insightsContent');
        insightsContent.innerHTML = `
            <h4 style="color: var(--neon-cyan); margin-bottom: 8px;">What this means for you:</h4>
            <p>${results.userInsight}</p>
        `;

        // Animate results appearance
        document.getElementById('resultsSection').style.animation = 'slideIn 0.5s ease-out';
    }

    getGradeDescription(grade) {
        const descriptions = {
            'A': 'Excellent transparency and user-friendly terms',
            'B': 'Good transparency with minor concerns',
            'C': 'Average transparency, some unclear areas',
            'D': 'Below average, several concerning clauses',
            'F': 'Poor transparency with major red flags'
        };
        return descriptions[grade] || 'Unable to determine transparency level';
    }

    getGradeColor(grade) {
        const colors = {
            'A': '#00ff88',  // Bright green
            'B': '#00aaff',  // Bright blue
            'C': '#ffdd00',  // Bright yellow
            'D': '#ff8800',  // Orange
            'F': '#ff4444'   // Red
        };
        return colors[grade] || '#808080';
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab panels
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        document.getElementById(tabName).classList.add('active');

        this.currentTab = tabName;
    }

    async shareResults() {
        if (!this.currentResults) return;

        try {
            const shareData = {
                title: 'Fineprint AI Analysis',
                text: `Transparency Grade: ${this.currentResults.transparencyGrade}\n\nKey Points:\n${this.currentResults.summary.slice(0, 3).join('\n')}`,
                url: window.location.href
            };

            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                // Fallback: copy to clipboard
                await navigator.clipboard.writeText(shareData.text);
                this.showSuccess('Analysis copied to clipboard!');
            }
        } catch (error) {
            console.error('Share error:', error);
            this.showError('Failed to share results');
        }
    }

    async saveResults() {
        if (!this.currentResults) return;

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            const saveData = {
                url: tab.url,
                title: tab.title,
                results: this.currentResults,
                timestamp: Date.now(),
                saved: true
            };

            await this.saveToHistory(saveData);
            this.showSuccess('Results saved successfully!');
        } catch (error) {
            console.error('Save error:', error);
            this.showError('Failed to save results');
        }
    }

    async saveToHistory(data) {
        try {
            const result = await chrome.storage.local.get(['scanHistory']);
            const history = result.scanHistory || [];
            
            // Remove duplicate entries for same URL
            const filteredHistory = history.filter(item => item.url !== data.url);
            
            // Add new entry at the beginning
            filteredHistory.unshift(data);
            
            // Keep only last 20 entries
            const trimmedHistory = filteredHistory.slice(0, 20);
            
            await chrome.storage.local.set({ scanHistory: trimmedHistory });
            
            // Refresh history display
            this.loadHistory();
        } catch (error) {
            console.error('Error saving to history:', error);
        }
    }

    async loadHistory() {
        try {
            const result = await chrome.storage.local.get(['scanHistory']);
            const history = result.scanHistory || [];
            
            const historyList = document.getElementById('historyList');
            
            if (history.length === 0) {
                historyList.innerHTML = '<div class="empty-state">No scans yet. Start by scanning a Terms of Service or Privacy Policy page!</div>';
                return;
            }

            historyList.innerHTML = history.map((item, index) => `
                <div class="history-item" data-id="${index}">
                    <div class="history-item-title">${item.title || 'Untitled'}</div>
                    <div class="history-item-info">
                        <span>Grade: ${item.results?.transparencyGrade || 'N/A'}</span>
                        <span>${new Date(item.timestamp).toLocaleDateString()}</span>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading history:', error);
        }
    }

    async loadHistoryItem(id) {
        try {
            const result = await chrome.storage.local.get(['scanHistory']);
            const history = result.scanHistory || [];
            const item = history[parseInt(id)];
            
            if (item && item.results) {
                this.displayResults(item.results);
            }
        } catch (error) {
            console.error('Error loading history item:', error);
        }
    }

    openSettings() {
        chrome.runtime.openOptionsPage();
    }

    showError(message) {
        const mainContent = document.getElementById('mainContent');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        mainContent.insertBefore(errorDiv, mainContent.firstChild);
        
        setTimeout(() => errorDiv.remove(), 5000);
    }

    showSuccess(message) {
        const mainContent = document.getElementById('mainContent');
        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.textContent = message;
        successDiv.style.animation = 'bounceIn 0.5s ease-out';
        mainContent.insertBefore(successDiv, mainContent.firstChild);
        
        setTimeout(() => {
            successDiv.style.animation = 'fadeIn 0.3s ease-out reverse';
            setTimeout(() => successDiv.remove(), 300);
        }, 3000);
    }

    generateClauseExample(description) {
        const clauseExamples = {
            'without notice': '"We may modify these terms at any time without prior notice to users. Continued use constitutes acceptance of changes."',
            'data sharing': '"We may share your personal information with third-party partners, affiliates, and service providers for business purposes."',
            'binding arbitration': '"Any disputes must be resolved through binding arbitration. You waive your right to participate in class action lawsuits."',
            'account termination': '"We reserve the right to suspend or terminate your account at our sole discretion without notice or explanation."',
            'broad data collection': '"We collect information about your device, location, browsing habits, and interactions across our services and partner sites."',
            'liability limitation': '"Our liability is limited to the maximum extent permitted by law. We are not responsible for any damages or losses."'
        };
        
        for (const [key, clause] of Object.entries(clauseExamples)) {
            if (description.toLowerCase().includes(key)) {
                return clause;
            }
        }
        return 'Specific clause text would be highlighted from the original document.';
    }

    async generateExplanation(description, severity) {
        try {
            const response = await fetch('https://api-inference.huggingface.co/models/facebook/blenderbot-400M-distill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    inputs: `Explain in 1-2 sentences why "${description}" is concerning for users:`,
                    parameters: { max_length: 80, temperature: 0.7 }
                })
            });

            if (response.ok) {
                const data = await response.json();
                const explanation = data[0]?.generated_text?.trim();
                if (explanation && explanation.length > 20 && explanation.length < 150) {
                    return explanation;
                }
            }
        } catch (error) {
            console.log('AI explanation failed');
        }
        
        // Fallback explanations
        const explanations = {
            'without notice': 'Companies can change rules anytime without telling you, potentially removing protections.',
            'data sharing': 'Your personal information can be sold or shared with unknown third parties.',
            'binding arbitration': 'You lose the right to sue in court and must use private arbitration.',
            'account termination': 'Your account and data can be deleted without warning or justification.',
            'broad data collection': 'Extensive tracking creates detailed profiles that can be misused.',
            'liability limitation': 'The company avoids responsibility for problems or damages they cause.'
        };
        
        for (const [key, explanation] of Object.entries(explanations)) {
            if (description.toLowerCase().includes(key)) {
                return explanation;
            }
        }
        return 'This clause may not be in your best interest as a user.';
    }

    generateImpact(description, severity) {
        const impacts = {
            'High': 'This could significantly affect your rights and privacy. Consider if the service is worth these risks.',
            'Medium': 'This may limit your options or expose you to some risk. Review carefully before agreeing.',
            'Low': 'Minor concern but still worth being aware of. Standard for many services but not ideal.'
        };
        
        return impacts[severity] || 'Consider the implications of this clause before accepting the terms.';
    }

    async loadAIExplanations() {
        const explanationElements = document.querySelectorAll('.explanation[data-desc]');
        
        for (const element of explanationElements) {
            const description = element.getAttribute('data-desc');
            const severity = element.getAttribute('data-severity');
            
            try {
                const explanation = await this.generateExplanation(description, severity);
                element.textContent = explanation;
            } catch (error) {
                element.textContent = 'This clause may not be in your best interest as a user.';
            }
        }
    }

    typewriterEffect(element, text, speed = 50) {
        element.textContent = '';
        let i = 0;
        const timer = setInterval(() => {
            element.textContent += text[i];
            i++;
            if (i >= text.length) {
                clearInterval(timer);
            }
        }, speed);
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FineprintPopup();
});
