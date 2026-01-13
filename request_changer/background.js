let isEnabled = false;
let userAgent = '';
let customHeaders = [];

// Load saved settings on startup
chrome.storage.local.get(['enabled', 'userAgent', 'customHeaders'], (data) => {
  isEnabled = data.enabled || false;
  userAgent = data.userAgent || '';
  customHeaders = data.customHeaders || [];
  
  if (isEnabled) {
    updateRules();
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleExtension') {
    isEnabled = message.enabled;
    if (isEnabled) {
      updateRules();
    } else {
      clearRules();
    }
  } else if (message.action === 'updateUserAgent') {
    userAgent = message.userAgent;
    if (isEnabled) {
      updateRules();
    }
  } else if (message.action === 'updateHeaders') {
    customHeaders = message.headers;
    if (isEnabled) {
      updateRules();
    }
  }
});

// Update declarativeNetRequest rules
async function updateRules() {
  try {
    // Clear existing rules
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: (await chrome.declarativeNetRequest.getDynamicRules()).map(rule => rule.id)
    });

    if (!isEnabled) return;

    const rules = [];
    let ruleId = 1;

    // Add User-Agent modification rule
    if (userAgent) {
      const headers = [
        {
          header: 'user-agent',
          operation: 'set',
          value: userAgent
        }
      ];

      // Add custom headers
      customHeaders.forEach(header => {
        if (header.name && header.value) {
          headers.push({
            header: header.name.toLowerCase(),
            operation: 'set',
            value: header.value
          });
        }
      });

      rules.push({
        id: ruleId++,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: headers
        },
        condition: {
          urlFilter: '*',
          resourceTypes: [
            'main_frame',
            'sub_frame',
            'stylesheet',
            'script',
            'image',
            'font',
            'object',
            'xmlhttprequest',
            'ping',
            'csp_report',
            'media',
            'websocket',
            'webtransport',
            'webbundle',
            'other'
          ]
        }
      });
    }

    if (rules.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: rules
      });
      console.log('✅ Rules updated successfully:', rules);
    }
  } catch (error) {
    console.error('❌ Error updating rules:', error);
  }
}

// Clear all rules
async function clearRules() {
  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const ruleIds = existingRules.map(rule => rule.id);
    
    if (ruleIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: ruleIds
      });
      console.log('✅ All rules cleared');
    }
  } catch (error) {
    console.error('❌ Error clearing rules:', error);
  }
}

// Update icon based on state
function updateIcon() {
  const iconPath = isEnabled ? 'icon-active.png' : 'icon.png';
  chrome.action.setIcon({ path: iconPath }).catch(() => {
    // Fallback if custom icons don't exist
  });
}