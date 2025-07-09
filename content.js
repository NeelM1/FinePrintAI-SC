// Content script for Fineprint AI Chrome Extension
class FineprintContentScript {
    constructor() {
        this.overlayVisible = false;
        this.currentAnalysis = null;
        this.init();
    }

    async init() {
        // Check if this is a TOS/Privacy page
        if (await this.shouldAutoDetect()) {
            await this.checkAutoScanSetting();
        }
        
        // Listen for messages from popup
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open for async response
        });
    }

    async shouldAutoDetect() {
        try {
            const result = await chrome.storage.sync.get(['detectionSensitivity']);
            const sensitivity = result.detectionSensitivity || 'medium';
            return this.detectTosPage(window.location.href, document.title, sensitivity);
        } catch (error) {
            console.error('Error checking detection sensitivity:', error);
            return this.detectTosPage(window.location.href, document.title, 'medium');
        }
    }

    detectTosPage(url, title, sensitivity = 'medium') {
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

    async checkAutoScanSetting() {
        try {
            const result = await chrome.storage.sync.get(['autoScan']);
            if (result.autoScan !== false) { // Default to true
                this.showAutoDetectBanner();
            }
        } catch (error) {
            console.error('Error checking auto-scan setting:', error);
        }
    }

    showAutoDetectBanner() {
        // Create auto-detect banner
        const banner = document.createElement('div');
        banner.id = 'fineprint-auto-banner';
        banner.innerHTML = `
            <div class="fineprint-banner-content">
                <div class="fineprint-banner-icon">
                    <svg width="32" height="32" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect width="48" height="48" rx="8" fill="#0D0D0D"/>
                        <path d="M8 12L24 6L40 12L24 18L8 12Z" stroke="#00FF7F" stroke-width="2" fill="none"/>
                        <path d="M8 24L24 30L40 24" stroke="#00FF7F" stroke-width="2" fill="none"/>
                        <path d="M8 33L24 39L40 33" stroke="#00FFFF" stroke-width="2" fill="none"/>
                    </svg>
                </div>
                <div class="fineprint-banner-text">
                    <strong>Fineprint AI detected a Terms/Privacy page</strong>
                    <p>Would you like to scan this document for red flags?</p>
                </div>
                <div class="fineprint-banner-actions">
                    <button class="fineprint-btn-scan">Scan Now</button>
                    <button class="fineprint-btn-dismiss">Dismiss</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(banner);
        
        // Animate banner in
        setTimeout(() => banner.classList.add('visible'), 100);
        
        // Bind events
        banner.querySelector('.fineprint-btn-scan').addEventListener('click', () => {
            this.startScan();
            banner.remove();
        });
        
        banner.querySelector('.fineprint-btn-dismiss').addEventListener('click', () => {
            banner.classList.remove('visible');
            setTimeout(() => banner.remove(), 300);
        });
        
        // Auto-dismiss after 10 seconds
        setTimeout(() => {
            if (banner.parentNode) {
                banner.classList.remove('visible');
                setTimeout(() => banner.remove(), 300);
            }
        }, 10000);
    }

    async handleMessage(message, sender, sendResponse) {
        switch (message.action) {
            case 'extractText':
                try {
                    const text = this.extractCleanText();
                    sendResponse({ success: true, text });
                } catch (error) {
                    sendResponse({ success: false, error: error.message });
                }
                break;
                
            case 'showOverlay':
                try {
                    await this.showOverlay(message.data);
                    sendResponse({ success: true });
                } catch (error) {
                    sendResponse({ success: false, error: error.message });
                }
                break;
                
            case 'hideOverlay':
                this.hideOverlay();
                sendResponse({ success: true });
                break;
        }
    }

    extractCleanText() {
        try {
            console.log('Starting text extraction, document state:', document.readyState);
            
            // Strategy 1: Wait for page to fully load if needed
            if (document.readyState !== 'complete') {
                console.log('Document not complete, waiting...');
                return new Promise(resolve => {
                    setTimeout(() => {
                        console.log('Retrying extraction after delay');
                        resolve(this.performTextExtraction());
                    }, 2000);
                });
            }
            
            return this.performTextExtraction();
        } catch (error) {
            console.error('Text extraction error:', error);
            throw new Error('Could not extract text from page: ' + error.message);
        }
    }
    
    performTextExtraction() {
        console.log('Performing text extraction...');
        let text = '';
        let bestContent = null;
        let maxLength = 0;
        
        // Strategy 1: Try common content containers with multiple attempts
        const contentSelectors = [
            // Main content areas
            'main', '[role="main"]', 'article',
            // Specific TOS/Privacy containers
            '.terms-content', '.privacy-content', '.policy-content', '.legal-content',
            '.document-content', '.legal-document', '.terms-of-service', '.privacy-policy',
            // Generic content containers
            '.content', '.main-content', '#content', '#main-content', '#main',
            '.container', '.wrapper', '.page-content', '.document', '.text-content',
            // Facebook specific
            '._4-u2', '.x1ey2m1c', '[data-testid="main_column"]', '.x78zum5', '.x1q0g3np',
            // Twitch specific  
            '.tw-root--theme-dark', '.tw-full-height', '.scrollable-area', '.tw-main-layout',
            // Generic fallbacks
            'body > div', 'body > main', 'body > article', '[class*="content"]', '[id*="content"]'
        ];
        
        console.log('Trying', contentSelectors.length, 'content selectors');
        
        // Find element with most relevant content
        for (const selector of contentSelectors) {
            try {
                const elements = document.querySelectorAll(selector);
                console.log(`Selector "${selector}" found ${elements.length} elements`);
                
                elements.forEach((element, index) => {
                    if (element && element.offsetHeight > 0) { // Element must be visible
                        const elementText = this.getElementText(element);
                        console.log(`Element ${index} text length: ${elementText.length}`);
                        
                        if (elementText.length > maxLength) {
                            maxLength = elementText.length;
                            bestContent = element;
                            console.log(`New best content found with ${elementText.length} characters`);
                        }
                    }
                });
            } catch (e) {
                console.log(`Error with selector "${selector}":`, e.message);
                continue;
            }
        }
        
        console.log('Best content element found:', !!bestContent, 'Length:', maxLength);
        
        // Strategy 2: If no good container, collect all visible text elements
        if (!bestContent || maxLength < 500) {
            console.log('Using fallback strategy - collecting all text elements');
            const textElements = document.querySelectorAll('p, div, span, section, h1, h2, h3, h4, h5, h6, li, td, th');
            const textParts = [];
            
            textElements.forEach((el, index) => {
                if (el.offsetHeight > 0 && !this.isUnwantedElement(el)) {
                    const elementText = (el.innerText || el.textContent || '').trim();
                    if (elementText.length > 30) { // Lowered threshold for fallback
                        textParts.push(elementText);
                        if (index < 10) { // Log first few for debugging
                            console.log(`Text part ${index}: ${elementText.substring(0, 100)}...`);
                        }
                    }
                }
            });
            
            console.log('Collected', textParts.length, 'text parts');
            text = textParts.join('\n\n');
        } else {
            text = this.getElementText(bestContent);
        }
        
        // Clean and validate the extracted text
        text = this.cleanExtractedText(text);
        console.log('Final extracted text length:', text.length);
        console.log('Text preview:', text.substring(0, 200));
        
        if (text.length < 100) { // Lowered threshold for debugging
            console.error('Insufficient text extracted. Raw page content length:', document.body.innerText.length);
            // Last resort: try body text
            const bodyText = this.cleanExtractedText(document.body.innerText || document.body.textContent || '');
            if (bodyText.length > 200) {
                console.log('Using body text as fallback');
                return bodyText.length > 50000 ? bodyText.substring(0, 50000) + '... (truncated)' : bodyText;
            }
            throw new Error(`Could not extract sufficient text content. Found only ${text.length} characters.`);
        }
        
        // Truncate if too long for API
        if (text.length > 50000) {
            text = text.substring(0, 50000) + '... (content truncated for analysis)';
        }
        
        return text;
    }
    
    getElementText(element) {
        if (!element) return '';
        
        // Get text while preserving some structure
        let text = '';
        
        // Handle different node types
        if (element.nodeType === Node.TEXT_NODE) {
            return element.textContent.trim();
        }
        
        // For element nodes, get inner text but clean it
        const clone = element.cloneNode(true);
        
        // Remove unwanted elements
        const unwantedSelectors = [
            'script', 'style', 'noscript', 'iframe', 'embed', 'object',
            'nav', 'header', 'footer', 'aside', 'menu', 'button',
            '.advertisement', '.ads', '.ad', '.cookie-banner', '.popup',
            '.social-share', '.comments', '.sidebar', '.navigation',
            '.breadcrumb', '.pagination', '.related-articles', '.footer',
            '[role="banner"]', '[role="navigation"]', '[role="complementary"]',
            '[role="contentinfo"]', '[aria-hidden="true"]', '[style*="display: none"]',
            '.skip-link', '.screen-reader-text', '.sr-only', '.visually-hidden'
        ];
        
        unwantedSelectors.forEach(selector => {
            try {
                const elements = clone.querySelectorAll(selector);
                elements.forEach(el => el.remove());
            } catch (e) {
                // Continue if selector fails
            }
        });
        
        return clone.innerText || clone.textContent || '';
    }
    
    isRelevantContent(text) {
        // Check if text contains terms/privacy related keywords
        const keywords = [
            'terms', 'service', 'privacy', 'policy', 'legal', 'agreement',
            'license', 'copyright', 'data', 'information', 'collect',
            'use', 'share', 'rights', 'liability', 'disclaimer'
        ];
        
        const lowerText = text.toLowerCase();
        return keywords.some(keyword => lowerText.includes(keyword));
    }
    
    isUnwantedElement(element) {
        const unwantedClasses = ['nav', 'menu', 'header', 'footer', 'sidebar', 'ad', 'cookie'];
        const className = element.className || '';
        const id = element.id || '';
        
        return unwantedClasses.some(unwanted => 
            className.toLowerCase().includes(unwanted) || 
            id.toLowerCase().includes(unwanted)
        );
    }
    
    cleanExtractedText(text) {
        return text
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
            .replace(/\t+/g, ' ') // Replace tabs with spaces
            .replace(/\u00A0/g, ' ') // Replace non-breaking spaces
            .replace(/[^\x20-\x7E\n]/g, '') // Remove non-printable characters except newlines
            .trim();
    }

    async tryFallbackExtraction() {
        try {
            // Update scanning overlay to show fallback attempt
            const overlay = document.querySelector('#fineprint-scanning-overlay');
            if (overlay) {
                const statusText = overlay.querySelector('.scanning-status');
                if (statusText) {
                    statusText.textContent = 'Trying alternative extraction method...';
                }
            }

            console.log('Attempting aggressive text extraction...');
            
            // More aggressive extraction - get all text content
            let allText = '';
            
            // Method 1: Get all visible text nodes
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: function(node) {
                        const parent = node.parentElement;
                        if (!parent) return NodeFilter.FILTER_REJECT;
                        
                        // Skip if parent is hidden or unwanted
                        const style = window.getComputedStyle(parent);
                        if (style.display === 'none' || style.visibility === 'hidden') {
                            return NodeFilter.FILTER_REJECT;
                        }
                        
                        // Skip script/style content
                        const tagName = parent.tagName.toLowerCase();
                        if (['script', 'style', 'noscript'].includes(tagName)) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        
                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
            );
            
            const textNodes = [];
            let node;
            while (node = walker.nextNode()) {
                const text = node.textContent.trim();
                if (text.length > 10) {
                    textNodes.push(text);
                }
            }
            
            allText = textNodes.join(' ').trim();
            console.log('Extracted text using tree walker:', allText.length, 'characters');
            
            // Method 2: If still insufficient, try document.body.innerText
            if (allText.length < 500) {
                console.log('Trying document.body.innerText fallback...');
                allText = document.body.innerText || document.body.textContent || '';
            }
            
            // Clean the extracted text
            allText = this.cleanExtractedText(allText);
            
            if (allText.length < 300) {
                throw new Error(`Still insufficient text after fallback extraction: ${allText.length} characters`);
            }
            
            // Truncate if too long
            if (allText.length > 50000) {
                allText = allText.substring(0, 50000) + '... (content truncated for analysis)';
            }
            
            console.log('Fallback extraction successful:', allText.length, 'characters');
            
            // Now try analysis with the fallback text
            const response = await chrome.runtime.sendMessage({
                action: 'analyzeText',
                text: allText,
                url: window.location.href,
                title: document.title
            });
            
            if (response.success) {
                this.showAnalysisOverlay(response.data);
            } else {
                throw new Error(response.error || 'Analysis failed');
            }
            
        } catch (error) {
            console.error('Fallback extraction also failed:', error);
            document.querySelector('#fineprint-scanning-overlay')?.remove();
            this.showError('Unable to extract text from this page. The website may have content restrictions or use complex dynamic loading.');
        }
    }

    async startScan() {
        try {
            // Show scanning overlay
            this.showScanningOverlay();
            
            // Extract text (handle potential Promise)
            let text = this.extractCleanText();
            if (text instanceof Promise) {
                text = await text;
            }
            
            // Start AI analysis in parallel with visual showcase
            const analysisPromise = chrome.runtime.sendMessage({
                action: 'analyzeText',
                text: text,
                url: window.location.href,
                title: document.title
            });
            
            // Artificial delay to showcase the amazing scanning animations (5-10 seconds)
            const showcaseDelay = 5000 + Math.random() * 5000; // 5-10 seconds
            const delayPromise = new Promise(resolve => setTimeout(resolve, showcaseDelay));
            
            // Wait for both analysis and showcase delay
            const [response] = await Promise.all([analysisPromise, delayPromise]);
            
            if (response.success) {
                this.showAnalysisOverlay(response.data);
            } else {
                throw new Error(response.error || 'Analysis failed');
            }
            
        } catch (error) {
            console.error('Scan error:', error);
            
            // Try fallback extraction if initial scan failed due to text extraction
            if (error.message.includes('Could not extract') || error.message.includes('Insufficient')) {
                console.log('Attempting fallback text extraction...');
                this.tryFallbackExtraction();
            } else {
                document.querySelector('#fineprint-scanning-overlay')?.remove();
                this.showError('Scan failed: ' + error.message);
            }
        }
    }

    showScanningOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'fineprint-scanning-overlay';
        overlay.innerHTML = `
            <div class="fineprint-scanning-content">
                <div class="fineprint-radar-large">
                    <div class="fineprint-radar-sweep"></div>
                    <div class="fineprint-data-streams">
                        <div class="data-stream"></div>
                        <div class="data-stream"></div>
                        <div class="data-stream"></div>
                    </div>
                </div>
                <h3 class="typewriter-text">Analyzing Document...</h3>
                <p class="scanning-status">AI is scanning for red flags and transparency issues</p>
                <div class="fineprint-progress-dots">
                    <span></span><span></span><span></span>
                </div>
                <div class="matrix-bg">
                    <div class="matrix-char">0</div>
                    <div class="matrix-char">1</div>
                    <div class="matrix-char">0</div>
                    <div class="matrix-char">1</div>
                    <div class="matrix-char">0</div>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        setTimeout(() => overlay.classList.add('visible'), 100);
        
        // Add typewriter effect to title
        const title = overlay.querySelector('.typewriter-text');
        this.typewriterEffect(title, 'Analyzing Document...');
    }

    showAnalysisOverlay(data) {
        // Remove scanning overlay
        const scanningOverlay = document.getElementById('fineprint-scanning-overlay');
        if (scanningOverlay) scanningOverlay.remove();
        
        // Create analysis overlay
        const overlay = document.createElement('div');
        overlay.id = 'fineprint-analysis-overlay';
        overlay.innerHTML = `
            <div class="fineprint-overlay-panel">
                <div class="fineprint-overlay-header">
                    <div class="fineprint-overlay-title">
                        <div class="fineprint-logo-small">
                            <svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect width="48" height="48" rx="8" fill="#0D0D0D"/>
                                <path d="M8 12L24 6L40 12L24 18L8 12Z" stroke="#00FF7F" stroke-width="2" fill="none"/>
                                <path d="M8 24L24 30L40 24" stroke="#00FF7F" stroke-width="2" fill="none"/>
                                <path d="M8 33L24 39L40 33" stroke="#00FFFF" stroke-width="2" fill="none"/>
                            </svg>
                        </div>
                        <h2>Fineprint AI Analysis</h2>
                    </div>
                    <button class="fineprint-close-btn">&times;</button>
                </div>
                
                <div class="fineprint-score-section">
                    <div class="fineprint-score-circle grade-${data.transparencyGrade.toLowerCase()}">
                        <span class="fineprint-score-letter">${data.transparencyGrade}</span>
                    </div>
                    <div class="fineprint-score-info">
                        <h3>Transparency Grade</h3>
                        <p>${this.getGradeDescription(data.transparencyGrade)}</p>
                    </div>
                </div>
                
                <div class="fineprint-tabs">
                    <button class="fineprint-tab active" data-tab="tldr">TL;DR</button>
                    <button class="fineprint-tab" data-tab="summary">Summary</button>
                    <button class="fineprint-tab" data-tab="redflags">Red Flags</button>
                    <button class="fineprint-tab" data-tab="insights">Insights</button>
                </div>
                
                <div class="fineprint-tab-content">
                    <div class="fineprint-tab-panel active" id="fineprint-tldr">
                        ${this.renderTLDR(data)}
                    </div>
                    <div class="fineprint-tab-panel" id="fineprint-summary">
                        <ul class="fineprint-summary-list">
                            ${data.summary.map(item => `<li>${item}</li>`).join('')}
                        </ul>
                    </div>
                    <div class="fineprint-tab-panel" id="fineprint-redflags">
                        ${this.renderRedFlags(data.redFlags)}
                    </div>
                    <div class="fineprint-tab-panel" id="fineprint-insights">
                        <div class="fineprint-insights-content">
                            <h4>What this means for you:</h4>
                            <p>${data.userInsight}</p>
                        </div>
                        ${this.renderRecommendations(data)}
                    </div>
                </div>
                
                <div class="fineprint-overlay-actions">
                    <button class="fineprint-action-btn fineprint-share-btn">📤 Share</button>
                    <button class="fineprint-action-btn fineprint-save-btn">💾 Save</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        // Bind events
        this.bindOverlayEvents(overlay, data);
        
        // Animate in
        setTimeout(() => overlay.classList.add('visible'), 100);
        
        // Load AI explanations and check for updates after overlay is shown
        setTimeout(() => {
            this.loadAIExplanations();
            this.checkForUpdates(data);
        }, 500);
        
        this.overlayVisible = true;
        this.currentAnalysis = data;
    }

    renderTLDR(data) {
        const riskLevel = this.getRiskLevel(data.transparencyGrade);
        const topConcerns = data.redFlags.slice(0, 3);
        
        return `
            <div class="fineprint-tldr-container">
                <div class="fineprint-risk-indicator ${riskLevel.class}">
                    <div class="fineprint-traffic-light">
                        <div class="light red ${riskLevel.level === 'high' ? 'active' : ''}"></div>
                        <div class="light yellow ${riskLevel.level === 'medium' ? 'active' : ''}"></div>
                        <div class="light green ${riskLevel.level === 'low' ? 'active' : ''}"></div>
                    </div>
                    <div class="fineprint-risk-text">
                        <h3>${riskLevel.title}</h3>
                        <p>${riskLevel.description}</p>
                    </div>
                </div>
                
                <div class="fineprint-top-concerns">
                    <h4>🚨 Top 3 Concerns:</h4>
                    ${topConcerns.length > 0 ? 
                        topConcerns.map(flag => `
                            <div class="fineprint-concern-item">
                                <span class="concern-severity ${flag.severity.toLowerCase()}">${flag.severity}</span>
                                <span class="concern-text">${flag.description}</span>
                            </div>
                        `).join('') : 
                        '<div class="fineprint-no-concerns">✅ No major concerns detected!</div>'
                    }
                </div>
                
                <div class="fineprint-quick-actions">
                    <button class="fineprint-quick-btn" onclick="this.closest('.fineprint-tab-content').querySelector('[data-tab=\"redflags\"]').click()">View All Issues</button>
                    <button class="fineprint-quick-btn" onclick="this.closest('.fineprint-overlay-panel').querySelector('.fineprint-share-btn').click()">Share Score</button>
                </div>
            </div>
        `;
    }

    getRiskLevel(grade) {
        const levels = {
            'A': { level: 'low', class: 'risk-low', title: 'Low Risk', description: 'This policy is user-friendly and transparent.' },
            'B': { level: 'low', class: 'risk-low', title: 'Low Risk', description: 'Generally good with minor concerns.' },
            'C': { level: 'medium', class: 'risk-medium', title: 'Medium Risk', description: 'Some concerning clauses worth reviewing.' },
            'D': { level: 'medium', class: 'risk-medium', title: 'Medium Risk', description: 'Several problematic terms detected.' },
            'F': { level: 'high', class: 'risk-high', title: 'High Risk', description: 'Many concerning clauses - proceed with caution.' }
        };
        return levels[grade] || levels['C'];
    }

    renderRecommendations(data) {
        const recommendations = this.generateRecommendations(data);
        if (recommendations.length === 0) return '';
        
        return `
            <div class="fineprint-recommendations">
                <h4>💡 Smart Recommendations</h4>
                ${recommendations.map(rec => `
                    <div class="fineprint-recommendation-item">
                        <div class="fineprint-recommendation-icon">${rec.icon}</div>
                        <div class="fineprint-recommendation-content">
                            <div class="fineprint-recommendation-title">${rec.title}</div>
                            <div class="fineprint-recommendation-desc">${rec.description}</div>
                            ${rec.link ? `<a href="${rec.link}" target="_blank" class="fineprint-recommendation-link">${rec.linkText} →</a>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    generateRecommendations(data) {
        const recommendations = [];
        const domain = window.location.hostname;
        const hasHighRisk = data.redFlags.some(flag => flag.severity === 'High');
        const hasDataSharing = data.redFlags.some(flag => flag.type === 'data_sharing');
        const hasTracking = data.redFlags.some(flag => flag.type === 'data_collection');
        
        // Privacy settings recommendations
        if (hasDataSharing || hasTracking) {
            const privacyLinks = {
                'facebook.com': 'https://www.facebook.com/settings?tab=privacy',
                'google.com': 'https://myaccount.google.com/privacy',
                'twitter.com': 'https://twitter.com/settings/privacy_and_safety',
                'instagram.com': 'https://www.instagram.com/accounts/privacy_and_security/',
                'linkedin.com': 'https://www.linkedin.com/psettings/privacy'
            };
            
            const privacyLink = Object.keys(privacyLinks).find(key => domain.includes(key));
            if (privacyLink) {
                recommendations.push({
                    icon: '⚙️',
                    title: 'Review Privacy Settings',
                    description: 'Limit data sharing and tracking in your account settings.',
                    link: privacyLinks[privacyLink],
                    linkText: 'Open Privacy Settings'
                });
            }
        }
        
        // Alternative services for high-risk policies
        if (hasHighRisk) {
            const alternatives = {
                'google.com': { name: 'DuckDuckGo', url: 'https://duckduckgo.com' },
                'facebook.com': { name: 'Signal', url: 'https://signal.org' },
                'whatsapp.com': { name: 'Signal', url: 'https://signal.org' },
                'zoom.us': { name: 'Jitsi Meet', url: 'https://meet.jit.si' }
            };
            
            const alternative = Object.keys(alternatives).find(key => domain.includes(key));
            if (alternative) {
                recommendations.push({
                    icon: '🔄',
                    title: `Consider ${alternatives[alternative].name}`,
                    description: 'A privacy-focused alternative with better terms.',
                    link: alternatives[alternative].url,
                    linkText: `Try ${alternatives[alternative].name}`
                });
            }
        }
        
        // General privacy tools
        if (data.transparencyGrade === 'D' || data.transparencyGrade === 'F') {
            recommendations.push({
                icon: '🛡️',
                title: 'Use Privacy Tools',
                description: 'Protect yourself with ad blockers and privacy extensions.',
                link: 'https://privacytools.io',
                linkText: 'Browse Privacy Tools'
            });
        }
        
        // Data deletion recommendation
        if (hasDataSharing) {
            recommendations.push({
                icon: '🗑️',
                title: 'Request Data Deletion',
                description: 'You have the right to request deletion of your personal data.',
                link: `https://${domain}/help`,
                linkText: 'Contact Support'
            });
        }
        
        return recommendations.slice(0, 3); // Limit to 3 recommendations
    }

    renderRedFlags(redFlags) {
        if (!redFlags || redFlags.length === 0) {
            return '<div class="fineprint-no-flags">No major red flags detected! 👍</div>';
        }
        
        return redFlags.map((flag, index) => `
            <div class="fineprint-red-flag severity-${flag.severity.toLowerCase()}" data-flag-index="${index}">
                <div class="fineprint-flag-header">
                    <div class="fineprint-flag-icon">⚠️</div>
                    <div class="fineprint-flag-content">
                        <div class="fineprint-flag-severity">${flag.severity} Risk</div>
                        <div class="fineprint-flag-description">${flag.description}</div>
                    </div>
                    <div class="fineprint-flag-expand">▼</div>
                </div>
                <div class="fineprint-flag-details">
                    <div class="fineprint-flag-section">
                        <h4>Problematic Clause:</h4>
                        <p class="fineprint-clause-text">${flag.clause || 'No specific clause extracted from document'}</p>
                    </div>
                    <div class="fineprint-flag-section">
                        <h4>Why This Is Concerning:</h4>
                        <p class="fineprint-explanation" data-desc="${flag.description}" data-severity="${flag.severity}">Loading AI explanation...</p>
                    </div>
                    <div class="fineprint-flag-section">
                        <h4>What This Means For You:</h4>
                        <p class="fineprint-impact">${flag.impact || this.generateImpact(flag.description, flag.severity)}</p>
                    </div>
                </div>
            </div>
        `).join('');
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

    bindOverlayEvents(overlay, data) {
        // Close button
        overlay.querySelector('.fineprint-close-btn').addEventListener('click', () => {
            this.hideOverlay();
        });
        
        // Tab switching
        overlay.querySelectorAll('.fineprint-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchOverlayTab(e.target.dataset.tab);
            });
        });
        
        // Red flag expand/collapse
        overlay.querySelectorAll('.fineprint-flag-header').forEach(header => {
            header.addEventListener('click', () => {
                const flagElement = header.closest('.fineprint-red-flag');
                flagElement.classList.toggle('expanded');
            });
        });
        
        // Handle recommendation link clicks
        overlay.querySelectorAll('.fineprint-recommendation-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                chrome.runtime.sendMessage({
                    action: 'openTab',
                    url: link.href
                });
            });
        });
        
        // Action buttons
        overlay.querySelector('.fineprint-share-btn').addEventListener('click', () => {
            this.shareAnalysis(data);
        });
        
        overlay.querySelector('.fineprint-save-btn').addEventListener('click', () => {
            this.saveAnalysis(data);
        });
        
        // Click outside to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.hideOverlay();
            }
        });
        
        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlayVisible) {
                this.hideOverlay();
            }
        });
    }

    switchOverlayTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.fineprint-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        // Update tab panels
        document.querySelectorAll('.fineprint-tab-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        document.getElementById(`fineprint-${tabName}`).classList.add('active');
        
        // Handle tab clicks from quick actions
        if (tabName === 'redflags') {
            // Expand first red flag for better UX
            setTimeout(() => {
                const firstFlag = document.querySelector('.fineprint-red-flag');
                if (firstFlag) firstFlag.classList.add('expanded');
            }, 100);
        }
    }

    hideOverlay() {
        const overlay = document.getElementById('fineprint-analysis-overlay');
        if (overlay) {
            overlay.classList.remove('visible');
            setTimeout(() => overlay.remove(), 300);
        }
        this.overlayVisible = false;
        this.currentAnalysis = null;
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

    async shareAnalysis(data) {
        try {
            const shareText = `Fineprint AI Analysis - Grade: ${data.transparencyGrade}\n\nKey Points:\n${data.summary.slice(0, 3).join('\n')}\n\nAnalyzed with Fineprint AI Chrome Extension`;
            
            if (navigator.share) {
                await navigator.share({
                    title: 'Fineprint AI Analysis',
                    text: shareText,
                    url: window.location.href
                });
            } else {
                await navigator.clipboard.writeText(shareText);
                this.showToast('Analysis copied to clipboard!');
            }
        } catch (error) {
            console.error('Share error:', error);
            this.showToast('Failed to share analysis', 'error');
        }
    }

    async saveAnalysis(data) {
        try {
            const saveData = {
                url: window.location.href,
                title: document.title,
                results: data,
                timestamp: Date.now(),
                saved: true
            };
            
            // Send to background script to save
            const response = await chrome.runtime.sendMessage({
                action: 'saveAnalysis',
                data: saveData
            });
            
            if (response.success) {
                this.showToast('Analysis saved successfully!');
            } else {
                throw new Error(response.error);
            }
        } catch (error) {
            console.error('Save error:', error);
            this.showToast('Failed to save analysis', 'error');
        }
    }

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `fineprint-toast fineprint-toast-${type}`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('visible'), 100);
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
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

    async loadAIExplanations() {
        const explanationElements = document.querySelectorAll('.fineprint-explanation[data-desc]');
        
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

    async checkForUpdates(currentData) {
        try {
            const url = window.location.href;
            const result = await chrome.storage.local.get(['updateTracking']);
            const tracking = result.updateTracking || {};
            
            const lastScan = tracking[url];
            if (lastScan && Date.now() - lastScan.timestamp > 7 * 24 * 60 * 60 * 1000) { // 7 days
                // Check if policy might have changed
                const textHash = this.simpleHash(document.body.innerText);
                if (lastScan.hash && lastScan.hash !== textHash) {
                    this.showUpdateBanner();
                }
            }
            
            // Update tracking
            tracking[url] = {
                timestamp: Date.now(),
                hash: this.simpleHash(document.body.innerText),
                grade: currentData.transparencyGrade
            };
            
            await chrome.storage.local.set({ updateTracking: tracking });
        } catch (error) {
            console.log('Update tracking error:', error);
        }
    }

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString();
    }

    showUpdateBanner() {
        const banner = document.createElement('div');
        banner.id = 'fineprint-update-banner';
        banner.className = 'fineprint-update-banner';
        banner.innerHTML = `
            <div class="fineprint-update-content">
                <div class="fineprint-update-title">
                    🔄 Policy Updated
                </div>
                <div class="fineprint-update-text">
                    This policy may have changed since your last scan. Re-scan to see what's new.
                </div>
                <div class="fineprint-update-actions">
                    <button class="fineprint-update-btn primary">Re-scan Now</button>
                    <button class="fineprint-update-btn secondary">Dismiss</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(banner);
        setTimeout(() => banner.classList.add('visible'), 100);
        
        // Bind events
        banner.querySelector('.primary').addEventListener('click', () => {
            banner.remove();
            this.startScan();
        });
        
        banner.querySelector('.secondary').addEventListener('click', () => {
            banner.classList.remove('visible');
            setTimeout(() => banner.remove(), 300);
        });
        
        // Auto-dismiss after 15 seconds
        setTimeout(() => {
            if (banner.parentNode) {
                banner.classList.remove('visible');
                setTimeout(() => banner.remove(), 300);
            }
        }, 15000);
    }

    showError(message) {
        // Remove any existing scanning overlay
        const scanningOverlay = document.getElementById('fineprint-scanning-overlay');
        if (scanningOverlay) scanningOverlay.remove();
        
        this.showToast(message, 'error');
    }
}

// Initialize content script
new FineprintContentScript();
