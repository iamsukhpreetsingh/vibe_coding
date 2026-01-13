let isEnabled = false;
let currentMode = 'aggressive';
let stats = {
  scriptsBlocked: 0,
  overlaysRemoved: 0,
  sitesProtected: 0
};

let protectedSites = new Set();

// Load saved settings on startup
chrome.storage.local.get(['enabled', 'mode', 'stats'], (data) => {
  isEnabled = data.enabled || false;
  currentMode = data.mode || 'aggressive';
  stats = data.stats || stats;
  
  if (isEnabled) {
    updateBlockingRules();
  }
});

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleExtension') {
    isEnabled = message.enabled;
    if (isEnabled) {
      updateBlockingRules();
    } else {
      clearBlockingRules();
    }
  } 
  else if (message.action === 'updateMode') {
    currentMode = message.mode;
    if (isEnabled) {
      updateBlockingRules();
    }
  }
  else if (message.action === 'incrementStat') {
    if (message.unique) {
      // For unique sites, use URL to track
      const url = sender.tab?.url;
      if (url && !protectedSites.has(url)) {
        protectedSites.add(url);
        stats[message.stat] = (stats[message.stat] || 0) + message.value;
      }
    } else {
      stats[message.stat] = (stats[message.stat] || 0) + message.value;
    }
    
    saveStats();
    
    // Send updated stats to popup if open
    chrome.runtime.sendMessage({ 
      action: 'updateStats', 
      stats: stats 
    }).catch(() => {});
  }
});

// Save stats to storage
function saveStats() {
  chrome.storage.local.set({ stats });
}

// Update blocking rules using declarativeNetRequest
async function updateBlockingRules() {
  try {
    // Clear existing rules
    await clearBlockingRules();

    if (!isEnabled) return;

    const rules = [];
    let ruleId = 1;

    // Block known ad-blocker detection scripts
    const blockDomains = [
      '*://*.blockadblock.com/*',
      '*://*.fuckadblock.com/*',
      '*://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
      '*://*.addefend.com/*',
      '*://*.anti-adblock.com/*',
      '*://*.getadmiral.com/*'
    ];

    blockDomains.forEach(domain => {
      rules.push({
        id: ruleId++,
        priority: 1,
        action: { type: 'block' },
        condition: {
          urlFilter: domain,
          resourceTypes: ['script', 'xmlhttprequest', 'main_frame', 'sub_frame']
        }
      });
    });

    // In aggressive mode, block more detection methods
    if (currentMode === 'aggressive') {
      const aggressiveBlocks = [
        '*://*/*ad-detect*',
        '*://*/*adblock-detect*',
        '*://*/*antiblock*',
        '*://*/*anti-adblock*'
      ];

      aggressiveBlocks.forEach(pattern => {
        rules.push({
          id: ruleId++,
          priority: 1,
          action: { type: 'block' },
          condition: {
            urlFilter: pattern,
            resourceTypes: ['script', 'xmlhttprequest']
          }
        });
      });
    }

    if (rules.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: rules
      });
      
      console.log('✅ Blocking rules updated:', rules.length, 'rules in', currentMode, 'mode');
    }
  } catch (error) {
    console.error('❌ Error updating blocking rules:', error);
  }
}

// Clear all blocking rules
async function clearBlockingRules() {
  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const ruleIds = existingRules.map(rule => rule.id);
    
    if (ruleIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: ruleIds
      });
      console.log('✅ All blocking rules cleared');
    }
  } catch (error) {
    console.error('❌ Error clearing rules:', error);
  }
}

// Update icon based on state
chrome.action.setBadgeBackgroundColor({ color: '#10b981' });

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && isEnabled) {
    chrome.action.setBadgeText({ tabId, text: '✓' });
  }
});

// Clear protected sites set periodically (every hour)
setInterval(() => {
  protectedSites.clear();
  stats.sitesProtected = 0;
  saveStats();
}, 3600000);