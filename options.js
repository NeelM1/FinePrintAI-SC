// Options page functionality for Fineprint AI Chrome Extension
class FineprintOptions {
    constructor() {
        this.settings = {
            openaiApiKey: '',
            autoScan: true,
            scanSensitivity: 'medium',
            theme: 'cyberpunk'
        };
        this.init();
    }

    async init() {
        await this.loadSettings();
        this.bindEvents();
        this.updateDataStats();
        this.checkApiKeyStatus();
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get([
                'openaiApiKey',
                'autoScan',
                'scanSensitivity',
                'theme'
            ]);

            this.settings = {
                openaiApiKey: result.openaiApiKey || '',
                autoScan: result.autoScan !== false, // Default to true
                scanSensitivity: result.scanSensitivity || 'medium',
                theme: result.theme || 'cyberpunk'
            };

            this.updateUI();
        } catch (error) {
            console.error('Error loading settings:', error);
            this.showMessage('Error loading settings', 'error');
        }
    }

    updateUI() {
        // API Key
        document.getElementById('apiKey').value = this.settings.openaiApiKey;

        // Auto Scan
        document.getElementById('autoScan').checked = this.settings.autoScan;

        // Scan Sensitivity
        document.getElementById('scanSensitivity').value = this.settings.scanSensitivity;

        // Theme
        document.querySelectorAll('.theme-option').forEach(option => {
            option.classList.remove('selected');
            if (option.dataset.theme === this.settings.theme) {
                option.classList.add('selected');
            }
        });
    }

    bindEvents() {
        // API Key toggle visibility
        document.getElementById('toggleApiKey').addEventListener('click', () => {
            this.toggleApiKeyVisibility();
        });

        // API Key input
        document.getElementById('apiKey').addEventListener('input', (e) => {
            this.settings.openaiApiKey = e.target.value;
            this.checkApiKeyStatus();
        });

        // Auto Scan toggle
        document.getElementById('autoScan').addEventListener('change', (e) => {
            this.settings.autoScan = e.target.checked;
        });

        // Scan Sensitivity
        document.getElementById('scanSensitivity').addEventListener('change', (e) => {
            this.settings.scanSensitivity = e.target.value;
        });

        // Theme selection
        document.querySelectorAll('.theme-option').forEach(option => {
            option.addEventListener('click', () => {
                this.selectTheme(option.dataset.theme);
            });
        });

        // Action buttons
        document.getElementById('exportData').addEventListener('click', () => this.exportData());
        document.getElementById('importData').addEventListener('click', () => this.importData());
        document.getElementById('clearData').addEventListener('click', () => this.clearData());

        // Footer actions
        document.getElementById('resetSettings').addEventListener('click', () => this.resetSettings());
        document.getElementById('saveSettings').addEventListener('click', () => this.saveSettings());

        // File input for import
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileImport(e));

        // About links
        document.getElementById('showHelp').addEventListener('click', () => this.showHelp());
        document.getElementById('showPrivacy').addEventListener('click', () => this.showPrivacy());
        document.getElementById('reportIssue').addEventListener('click', () => this.reportIssue());

        // Auto-save on input
        const inputs = ['apiKey', 'autoScan', 'scanSensitivity'];
        inputs.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('change', () => this.autoSave());
            }
        });
    }

    toggleApiKeyVisibility() {
        const apiKeyInput = document.getElementById('apiKey');
        const toggleBtn = document.getElementById('toggleApiKey');
        
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            toggleBtn.textContent = '🙈';
        } else {
            apiKeyInput.type = 'password';
            toggleBtn.textContent = '👁️';
        }
    }

    async checkApiKeyStatus() {
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        
        if (!this.settings.openaiApiKey) {
            statusIndicator.className = 'status-indicator status-success';
            statusText.textContent = 'Free mode active';
            return;
        }

        if (!this.settings.openaiApiKey.startsWith('sk-')) {
            statusIndicator.className = 'status-indicator status-warning';
            statusText.textContent = 'Invalid API key format';
            return;
        }

        statusIndicator.className = 'status-indicator status-premium';
        statusText.textContent = 'Premium mode configured';

        // Optionally test the API key (commented out to avoid unnecessary API calls)
        /*
        try {
            statusIndicator.className = 'status-indicator status-loading';
            statusText.textContent = 'Validating...';
            
            // Test API key with a minimal request
            const response = await fetch('https://api.openai.com/v1/models', {
                headers: {
                    'Authorization': `Bearer ${this.settings.openaiApiKey}`
                }
            });
            
            if (response.ok) {
                statusIndicator.className = 'status-indicator status-success';
                statusText.textContent = 'Valid & working';
            } else {
                statusIndicator.className = 'status-indicator status-error';
                statusText.textContent = 'Invalid or expired';
            }
        } catch (error) {
            statusIndicator.className = 'status-indicator status-warning';
            statusText.textContent = 'Cannot validate';
        }
        */
    }

    selectTheme(theme) {
        this.settings.theme = theme;
        
        document.querySelectorAll('.theme-option').forEach(option => {
            option.classList.remove('selected');
        });
        
        document.querySelector(`[data-theme="${theme}"]`).classList.add('selected');
        
        // Apply theme preview to entire page
        document.body.className = `theme-${theme}`;
        
        // Auto-save theme change
        this.autoSave();
    }

    async updateDataStats() {
        try {
            const result = await chrome.storage.local.get(['scanHistory']);
            const history = result.scanHistory || [];
            
            document.getElementById('scanCount').textContent = history.length;
            
            // Calculate storage usage
            const dataSize = JSON.stringify(history).length;
            const sizeInKB = Math.round(dataSize / 1024);
            document.getElementById('storageUsed').textContent = `${sizeInKB}KB`;
            
        } catch (error) {
            console.error('Error updating data stats:', error);
        }
    }

    async exportData() {
        try {
            const result = await chrome.storage.local.get(['scanHistory']);
            const data = {
                scanHistory: result.scanHistory || [],
                exportDate: new Date().toISOString(),
                version: '1.0.0'
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `fineprint-ai-data-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            URL.revokeObjectURL(url);
            this.showMessage('Data exported successfully', 'success');
            
        } catch (error) {
            console.error('Export error:', error);
            this.showMessage('Failed to export data', 'error');
        }
    }

    importData() {
        document.getElementById('fileInput').click();
    }

    async handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            if (!data.scanHistory || !Array.isArray(data.scanHistory)) {
                throw new Error('Invalid data format');
            }

            // Confirm import
            const confirmed = confirm(`This will import ${data.scanHistory.length} scan records and overwrite existing data. Continue?`);
            if (!confirmed) return;

            await chrome.storage.local.set({ scanHistory: data.scanHistory });
            
            this.updateDataStats();
            this.showMessage('Data imported successfully', 'success');
            
        } catch (error) {
            console.error('Import error:', error);
            this.showMessage('Failed to import data: ' + error.message, 'error');
        }
        
        // Clear file input
        event.target.value = '';
    }

    async clearData() {
        const confirmed = confirm('This will permanently delete all scan history. This cannot be undone. Continue?');
        if (!confirmed) return;

        try {
            await chrome.storage.local.clear();
            this.updateDataStats();
            this.showMessage('All data cleared successfully', 'success');
        } catch (error) {
            console.error('Clear data error:', error);
            this.showMessage('Failed to clear data', 'error');
        }
    }

    async resetSettings() {
        const confirmed = confirm('This will reset all settings to defaults. Continue?');
        if (!confirmed) return;

        try {
            await chrome.storage.sync.clear();
            
            this.settings = {
                openaiApiKey: '',
                autoScan: true,
                scanSensitivity: 'medium',
                theme: 'cyberpunk'
            };
            
            this.updateUI();
            this.showMessage('Settings reset to defaults', 'success');
            
        } catch (error) {
            console.error('Reset error:', error);
            this.showMessage('Failed to reset settings', 'error');
        }
    }

    async saveSettings() {
        try {
            await chrome.storage.sync.set(this.settings);
            
            // Notify background script of API key update
            if (this.settings.openaiApiKey) {
                chrome.runtime.sendMessage({
                    action: 'updateApiKey',
                    apiKey: this.settings.openaiApiKey
                });
            }
            
            this.showMessage('Settings saved successfully', 'success');
            
        } catch (error) {
            console.error('Save error:', error);
            this.showMessage('Failed to save settings', 'error');
        }
    }

    async autoSave() {
        try {
            await chrome.storage.sync.set(this.settings);
            this.showMessage('Settings auto-saved', 'success', 2000);
        } catch (error) {
            console.error('Auto-save error:', error);
        }
    }

    showMessage(message, type = 'info', duration = 5000) {
        const saveStatus = document.getElementById('saveStatus');
        saveStatus.textContent = message;
        saveStatus.className = `save-status ${type}`;
        
        setTimeout(() => {
            saveStatus.textContent = '';
            saveStatus.className = 'save-status';
        }, duration);
    }

    showHelp() {
        const helpContent = `
        🤖 Fineprint AI Help

        Getting Started:
        1. Enter your OpenAI API key in the settings
        2. Enable automatic scanning for convenience
        3. Visit any Terms of Service or Privacy Policy page
        4. The extension will automatically detect and offer to scan the document

        Features:
        • AI-powered analysis using GPT-4
        • Transparency grading (A-F scale)
        • Red flag detection for concerning clauses
        • Plain English summaries
        • Scan history and data export

        Tips:
        • Use high sensitivity for comprehensive detection
        • Export your data regularly for backup
        • Check different themes for your preference

        Troubleshooting:
        • Ensure your API key is valid and has credits
        • Check internet connection for analysis
        • Try refreshing the page if detection fails
        `;
        
        alert(helpContent);
    }

    showPrivacy() {
        const privacyContent = `
        🔒 Fineprint AI Privacy Policy

        Data Collection:
        • We only process text from pages you choose to scan
        • Your API key is stored locally in your browser
        • Scan results are saved locally on your device

        Data Usage:
        • Document text is sent to OpenAI for analysis only
        • We don't store or transmit your personal data
        • All data remains under your control

        Data Storage:
        • All data is stored locally in Chrome's storage
        • You can export or delete your data anytime
        • No data is sent to our servers

        Third Parties:
        • We use OpenAI's API for document analysis
        • Refer to OpenAI's privacy policy for their practices
        • No other third parties have access to your data
        `;
        
        alert(privacyContent);
    }

    reportIssue() {
        const issueTemplate = `
        Please describe your issue:

        Extension Version: 1.0.0
        Browser: ${navigator.userAgent}
        Date: ${new Date().toISOString()}

        Issue Description:
        [Please describe what happened]

        Steps to Reproduce:
        1. 
        2. 
        3. 

        Expected Behavior:
        [What should have happened]

        Additional Information:
        [Any other relevant details]
        `;

        // Open email client or copy to clipboard
        const subject = encodeURIComponent('Fineprint AI Issue Report');
        const body = encodeURIComponent(issueTemplate);
        const mailtoLink = `mailto:support@example.com?subject=${subject}&body=${body}`;
        
        try {
            window.open(mailtoLink);
        } catch (error) {
            // Fallback: copy to clipboard
            navigator.clipboard.writeText(issueTemplate).then(() => {
                alert('Issue template copied to clipboard. Please email it to support@example.com');
            });
        }
    }
}

// Initialize options page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FineprintOptions();
});
