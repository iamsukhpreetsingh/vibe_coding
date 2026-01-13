// Content script - runs in page context
(async () => {
  const { enabled, mode } = await chrome.storage.local.get(['enabled', 'mode']);
  
  if (!enabled) return;

  const currentMode = mode || 'aggressive';
  
  // Inject the main bypass script
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.dataset.mode = currentMode;
  (document.head || document.documentElement).appendChild(script);
  script.remove();

  // Monitor and remove ad-blocker detection overlays
  const overlayPatterns = [
    /adblock/i,
    /ad-block/i,
    /adblocker/i,
    /ad blocker/i,
    /disable.*ad/i,
    /turn.*off.*ad/i,
    /please.*disable/i,
    /anti-adblock/i,
    /block.*detect/i,
    /ads.*blocked/i
  ];

  function removeOverlays() {
    let removed = 0;

    // Check all divs for overlay patterns
    document.querySelectorAll('div, section, aside').forEach(el => {
      const id = el.id || '';
      const className = el.className || '';
      const text = el.textContent || '';
      
      const combined = `${id} ${className} ${text}`.toLowerCase();
      
      if (overlayPatterns.some(pattern => pattern.test(combined))) {
        // Check if it's likely an overlay (fixed/absolute position, high z-index)
        const style = window.getComputedStyle(el);
        const isOverlay = (
          (style.position === 'fixed' || style.position === 'absolute') &&
          (parseInt(style.zIndex) > 100 || style.display === 'flex')
        );
        
        if (isOverlay) {
          el.remove();
          removed++;
        }
      }
    });

    // Remove elements with anti-adblock IDs/classes
    const selectors = [
      '[id*="adblock"]',
      '[class*="adblock"]',
      '[id*="ad-block"]',
      '[class*="ad-block"]',
      '[id*="adblocker"]',
      '[class*="adblocker"]',
      '[id*="anti-ad"]',
      '[class*="anti-ad"]'
    ];

    selectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          const style = window.getComputedStyle(el);
          if (style.position === 'fixed' || style.position === 'absolute') {
            el.remove();
            removed++;
          }
        });
      } catch (e) {}
    });

    // Re-enable scrolling if disabled
    if (document.body.style.overflow === 'hidden') {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }

    // Update stats if any overlays were removed
    if (removed > 0) {
      chrome.runtime.sendMessage({ 
        action: 'incrementStat', 
        stat: 'overlaysRemoved',
        value: removed 
      });
    }
  }

  // Run overlay removal
  removeOverlays();
  
  // Watch for dynamically added overlays
  const observer = new MutationObserver(() => {
    removeOverlays();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    observer.disconnect();
  });

  // Block known ad-blocker detection scripts
  const scriptObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.tagName === 'SCRIPT') {
          const src = node.src || '';
          const content = node.textContent || '';
          
          const blockPatterns = [
            /adblock/i,
            /blockadblock/i,
            /antiblock/i,
            /anti-adblock/i,
            /fuckadblock/i,
            /addefend/i,
            /admiral/i
          ];

          if (blockPatterns.some(pattern => pattern.test(src) || pattern.test(content))) {
            node.remove();
            chrome.runtime.sendMessage({ 
              action: 'incrementStat', 
              stat: 'scriptsBlocked',
              value: 1 
            });
          }
        }
      });
    });
  });

  scriptObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // Notify that this site is protected
  chrome.runtime.sendMessage({ 
    action: 'incrementStat', 
    stat: 'sitesProtected',
    value: 1,
    unique: true
  });
})();