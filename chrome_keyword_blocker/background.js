// Background script for keyword blocking
let blockedKeywords = [];

// Load blocked keywords from storage
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

// Function to check if URL contains blocked keywords
function containsBlockedKeywords(url) {
  if (!url || blockedKeywords.length === 0) return false;
  
  const decodedUrl = decodeURIComponent(url.toLowerCase());
  
  return blockedKeywords.some(keyword => {
    if (!keyword.trim()) return false;
    return decodedUrl.includes(keyword.toLowerCase().trim());
  });
}

// Function to extract search query from URL
function extractSearchQuery(url) {
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;
    
    // Common search parameter names
    const searchParams = ['q', 'query', 'search', 'p', 'text', 's'];
    
    for (const param of searchParams) {
      const value = params.get(param);
      if (value) return value;
    }
    
    // Check for Yahoo search format
    if (urlObj.hostname.includes('yahoo.com') && urlObj.pathname.includes('/search')) {
      const pathParts = urlObj.pathname.split('/');
      const searchIndex = pathParts.indexOf('search');
      if (searchIndex !== -1 && pathParts[searchIndex + 1]) {
        return decodeURIComponent(pathParts[searchIndex + 1]);
      }
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

// Listen for tab updates
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'loading' && tab.url) {
    // Check if it's a search engine
    const searchEngines = [
      'google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com', 
      'yandex.com', 'search.brave.com', 'baidu.com'
    ];
    
    const isSearchEngine = searchEngines.some(engine => 
      tab.url.includes(engine)
    );
    
    if (isSearchEngine) {
      const searchQuery = extractSearchQuery(tab.url);
      
      if (searchQuery && containsBlockedKeywords(searchQuery)) {
        chrome.tabs.remove(tabId);
        return;
      }
    }
    
    // Also check the full URL for blocked keywords
    if (containsBlockedKeywords(tab.url)) {
      chrome.tabs.remove(tabId);
    }
  }
});

// Listen for web navigation events (handles navigation within same tab)
chrome.webNavigation.onBeforeNavigate.addListener(function(details) {
  if (details.frameId === 0) { // Main frame only
    const searchQuery = extractSearchQuery(details.url);
    
    if (searchQuery && containsBlockedKeywords(searchQuery)) {
      chrome.tabs.remove(details.tabId);
      return;
    }
    
    if (containsBlockedKeywords(details.url)) {
      chrome.tabs.remove(details.tabId);
    }
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'checkKeywords') {
    if (containsBlockedKeywords(request.text)) {
      chrome.tabs.remove(sender.tab.id);
    }
  }
});

// Initialize with default keywords if none exist
chrome.runtime.onInstalled.addListener(function() {
  chrome.storage.sync.get(['blockedKeywords'], function(result) {
    if (!result.blockedKeywords) {
      const defaultKeywords = [
        'porn', 'sex', 'xxx', 'adult', 'nude', 'naked', 'explicit'
      ];
      chrome.storage.sync.set({blockedKeywords: defaultKeywords});
      blockedKeywords = defaultKeywords;
    }
  });
});