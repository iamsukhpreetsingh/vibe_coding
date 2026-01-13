// Content script to monitor search inputs and form submissions
(function() {
  'use strict';
  
  let blockedKeywords = [];
  
  // Get blocked keywords from storage
  chrome.storage.sync.get(['blockedKeywords'], function(result) {
    if (result.blockedKeywords) {
      blockedKeywords = result.blockedKeywords;
    }
  });
  
  // Listen for storage changes
  chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (changes.blockedKeywords) {
      blockedKeywords = changes.blockedKeywords.newValue || [];
    }
  });
  
  // Function to check if text contains blocked keywords
  function containsBlockedKeywords(text) {
    if (!text || blockedKeywords.length === 0) return false;
    
    const lowerText = text.toLowerCase();
    return blockedKeywords.some(keyword => {
      if (!keyword.trim()) return false;
      return lowerText.includes(keyword.toLowerCase().trim());
    });
  }
  
  // Monitor search form submissions
  document.addEventListener('submit', function(e) {
    const form = e.target;
    if (form.tagName === 'FORM') {
      const searchInputs = form.querySelectorAll('input[type="search"], input[name*="q"], input[name*="query"], input[name*="search"]');
      
      for (const input of searchInputs) {
        if (input.value && containsBlockedKeywords(input.value)) {
          e.preventDefault();
          e.stopPropagation();
          window.close();
          return false;
        }
      }
    }
  }, true);
  
  // Monitor input changes in search fields
  function monitorSearchInput(input) {
    if (input.dataset.keywordMonitored) return;
    input.dataset.keywordMonitored = 'true';
    
    input.addEventListener('input', function() {
      if (this.value && containsBlockedKeywords(this.value)) {
        this.value = '';
        this.blur();
      }
    });
    
    input.addEventListener('paste', function(e) {
      setTimeout(() => {
        if (this.value && containsBlockedKeywords(this.value)) {
          this.value = '';
          e.preventDefault();
        }
      }, 0);
    });
  }
  
  // Find and monitor search inputs
  function findAndMonitorSearchInputs() {
    const searchInputs = document.querySelectorAll(`
      input[type="search"],
      input[name*="q"]:not([type="hidden"]),
      input[name*="query"]:not([type="hidden"]),
      input[name*="search"]:not([type="hidden"]),
      input[placeholder*="search" i]:not([type="hidden"]),
      input[placeholder*="Search" i]:not([type="hidden"]),
      input[id*="search"]:not([type="hidden"]),
      input[class*="search"]:not([type="hidden"])
    `);
    
    searchInputs.forEach(monitorSearchInput);
  }
  
  // Initial monitoring
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', findAndMonitorSearchInputs);
  } else {
    findAndMonitorSearchInputs();
  }
  
  // Monitor for dynamically added search inputs
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.matches && node.matches('input[type="search"], input[name*="q"], input[name*="query"], input[name*="search"]')) {
            monitorSearchInput(node);
          }
          
          const searchInputs = node.querySelectorAll && node.querySelectorAll('input[type="search"], input[name*="q"], input[name*="query"], input[name*="search"]');
          if (searchInputs) {
            searchInputs.forEach(monitorSearchInput);
          }
        }
      });
    });
  });
  
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });
  
  // Check current URL and page content
  if (window.location.href) {
    chrome.runtime.sendMessage({
      action: 'checkKeywords',
      text: window.location.href
    });
  }
  
})();