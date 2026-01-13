// Injected script - runs in page's main world
(function() {
  'use strict';

  const mode = document.currentScript?.dataset?.mode || 'aggressive';

  // Prevent ad-blocker detection by overriding common detection methods
  
  // 1. Override document.getElementById for bait elements
  const originalGetElementById = document.getElementById;
  document.getElementById = function(id) {
    const element = originalGetElementById.call(this, id);
    
    // If it's a bait ad element that doesn't exist, create a fake one
    if (!element && /ad|banner|sponsor/i.test(id)) {
      const fakeElement = document.createElement('div');
      fakeElement.id = id;
      fakeElement.style.display = 'block';
      fakeElement.style.position = 'absolute';
      fakeElement.style.left = '-9999px';
      return fakeElement;
    }
    
    return element;
  };

  // 2. Override querySelector for ad elements
  const originalQuerySelector = document.querySelector;
  document.querySelector = function(selector) {
    const element = originalQuerySelector.call(this, selector);
    
    if (!element && /ad|banner|sponsor/i.test(selector)) {
      const fakeElement = document.createElement('div');
      fakeElement.className = selector.replace(/[.#\[\]]/g, '');
      fakeElement.style.display = 'block';
      return fakeElement;
    }
    
    return element;
  };

  // 3. Neutralize common ad-blocker detection objects
  const neutralizeDetection = () => {
    // FuckAdBlock / BlockAdBlock detection
    if (mode === 'aggressive' || mode === 'balanced') {
      window.fuckAdBlock = undefined;
      window.FuckAdBlock = undefined;
      window.blockAdBlock = undefined;
      window.BlockAdBlock = undefined;
      
      // Create fake detection objects that always report "no adblock"
      const fakeDetector = {
        onDetected: function() {},
        onNotDetected: function(callback) { if (callback) callback(); },
        on: function(detected, callback) { 
          if (!detected && callback) callback(); 
          return this;
        },
        setOption: function() { return this; }
      };
      
      Object.defineProperty(window, 'FuckAdBlock', { get: () => fakeDetector });
      Object.defineProperty(window, 'fuckAdBlock', { get: () => fakeDetector });
      Object.defineProperty(window, 'BlockAdBlock', { get: () => fakeDetector });
      Object.defineProperty(window, 'blockAdBlock', { get: () => fakeDetector });
    }

    // AdDefend detection
    if (window.AdDefend) {
      window.AdDefend = undefined;
    }

    // Admiral detection
    if (window.admiral) {
      window.admiral = undefined;
    }
  };

  neutralizeDetection();

  // 4. Override fetch to intercept ad-blocker detection requests
  if (mode === 'aggressive') {
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const url = args[0];
      
      if (typeof url === 'string') {
        // Block known ad-blocker detection endpoints
        if (/pagead|doubleclick|adservice|adserver/i.test(url)) {
          return Promise.resolve(new Response('', {
            status: 200,
            statusText: 'OK'
          }));
        }
      }
      
      return originalFetch.apply(this, args);
    };
  }

  // 5. Override XMLHttpRequest
  if (mode === 'aggressive') {
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      // Block ad-blocker detection requests
      if (typeof url === 'string' && /pagead|doubleclick|adservice|adserver/i.test(url)) {
        this._blocked = true;
      }
      return originalOpen.call(this, method, url, ...rest);
    };

    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(...args) {
      if (this._blocked) {
        // Simulate successful response
        Object.defineProperty(this, 'status', { value: 200 });
        Object.defineProperty(this, 'statusText', { value: 'OK' });
        Object.defineProperty(this, 'responseText', { value: '' });
        
        setTimeout(() => {
          if (this.onload) this.onload();
          if (this.onreadystatechange) {
            Object.defineProperty(this, 'readyState', { value: 4 });
            this.onreadystatechange();
          }
        }, 0);
        return;
      }
      return originalSend.apply(this, args);
    };
  }

  // 6. Override ad-related iframe creation detection
  const originalCreateElement = document.createElement;
  document.createElement = function(tagName) {
    const element = originalCreateElement.call(this, tagName);
    
    if (tagName.toLowerCase() === 'iframe') {
      // Prevent ad-blocker detection through iframe loading failures
      const originalSetAttribute = element.setAttribute;
      element.setAttribute = function(name, value) {
        if (name === 'src' && /ad|banner|doubleclick|pagead/i.test(value)) {
          // Don't actually set the src to prevent network request
          return;
        }
        return originalSetAttribute.call(this, name, value);
      };
    }
    
    return element;
  };

  // 7. Create fake ad elements to fool bait-based detection
  if (mode === 'aggressive' || mode === 'balanced') {
    const createBaitElement = (id, className) => {
      const bait = document.createElement('div');
      if (id) bait.id = id;
      if (className) bait.className = className;
      bait.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;';
      return bait;
    };

    // Add common bait element IDs/classes
    const baits = [
      { id: 'ad', className: 'ad' },
      { id: 'ads', className: 'ads' },
      { id: 'banner', className: 'banner' },
      { className: 'ad-banner' },
      { className: 'adsbygoogle' }
    ];

    window.addEventListener('DOMContentLoaded', () => {
      baits.forEach(bait => {
        document.body.appendChild(createBaitElement(bait.id, bait.className));
      });
    });
  }

  // 8. Prevent detection through CSS property checking
  if (mode === 'aggressive') {
    const originalGetComputedStyle = window.getComputedStyle;
    window.getComputedStyle = function(element, pseudoElement) {
      const styles = originalGetComputedStyle.call(this, element, pseudoElement);
      
      // If checking ad-related elements, always report visible
      if (element && (element.id || element.className)) {
        const id = element.id || '';
        const className = element.className || '';
        
        if (/ad|banner|sponsor/i.test(id + className)) {
          return new Proxy(styles, {
            get(target, prop) {
              if (prop === 'display') return 'block';
              if (prop === 'visibility') return 'visible';
              if (prop === 'height') return '100px';
              if (prop === 'width') return '100px';
              return target[prop];
            }
          });
        }
      }
      
      return styles;
    };
  }

  console.log('🛡️ AdBlock Detector Bypass active in', mode, 'mode');
})();