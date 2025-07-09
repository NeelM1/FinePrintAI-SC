#!/usr/bin/env python3
"""
Text extraction service for Fineprint AI Chrome Extension
Uses trafilatura for robust web content extraction when JavaScript fails
"""

import trafilatura
import sys
import json
from urllib.parse import urlparse

def extract_text_from_url(url):
    """
    Extract clean text content from a URL using trafilatura
    Returns structured data for the Chrome extension
    """
    try:
        # Validate URL
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            return {"error": "Invalid URL provided"}
        
        # Download and extract content
        downloaded = trafilatura.fetch_url(url)
        if not downloaded:
            return {"error": "Could not fetch content from URL"}
        
        # Extract text content
        text = trafilatura.extract(downloaded, 
                                 include_comments=False,
                                 include_tables=True,
                                 include_formatting=False)
        
        if not text:
            return {"error": "Could not extract text content from page"}
        
        # Clean and validate
        text = text.strip()
        if len(text) < 200:
            return {"error": f"Insufficient content extracted: only {len(text)} characters"}
        
        # Truncate if too long for API
        if len(text) > 50000:
            text = text[:50000] + "... (content truncated for analysis)"
        
        return {
            "success": True,
            "text": text,
            "length": len(text),
            "url": url
        }
        
    except Exception as e:
        return {"error": f"Extraction failed: {str(e)}"}

def main():
    """Main function to handle command line input"""
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python text_extractor.py <url>"}))
        sys.exit(1)
    
    url = sys.argv[1]
    result = extract_text_from_url(url)
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()