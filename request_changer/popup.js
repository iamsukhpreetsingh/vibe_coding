// User-Agent presets
const userAgentPresets = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/108.0.0.0',
  ie: 'Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko'
};

let customHeaders = [];

// Load saved state
async function loadState() {
  const data = await chrome.storage.local.get(['enabled', 'userAgent', 'customHeaders']);
  
  const enableToggle = document.getElementById('enableToggle');
  enableToggle.checked = data.enabled || false;
  updateStatus(data.enabled || false);

  if (data.userAgent) {
    document.getElementById('userAgentInput').value = data.userAgent;
  }

  if (data.customHeaders) {
    customHeaders = data.customHeaders;
    renderHeaders();
  }
}

// Update status text
function updateStatus(enabled) {
  const statusText = document.getElementById('statusText');
  if (enabled) {
    statusText.textContent = '✅ Extension is active - Requests are being modified';
    statusText.style.color = '#10b981';
  } else {
    statusText.textContent = '❌ Extension is disabled';
    statusText.style.color = 'rgba(255, 255, 255, 0.8)';
  }
}

// Toggle extension
document.getElementById('enableToggle').addEventListener('change', async (e) => {
  const enabled = e.target.checked;
  await chrome.storage.local.set({ enabled });
  updateStatus(enabled);
  
  // Notify background script
  chrome.runtime.sendMessage({ action: 'toggleExtension', enabled });
});

// Handle preset buttons
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = btn.dataset.preset;
    const userAgent = userAgentPresets[preset];
    document.getElementById('userAgentInput').value = userAgent;
    
    // Visual feedback
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Apply User-Agent
document.getElementById('applyUserAgent').addEventListener('click', async () => {
  const userAgent = document.getElementById('userAgentInput').value.trim();
  
  if (!userAgent) {
    alert('⚠️ Please enter a User-Agent string');
    return;
  }

  await chrome.storage.local.set({ userAgent });
  chrome.runtime.sendMessage({ action: 'updateUserAgent', userAgent });
  
  // Show success feedback
  const btn = document.getElementById('applyUserAgent');
  const originalText = btn.innerHTML;
  btn.innerHTML = '✅ Applied!';
  btn.style.background = 'rgba(16, 185, 129, 0.5)';
  
  setTimeout(() => {
    btn.innerHTML = originalText;
    btn.style.background = '';
  }, 1500);
});

// Render custom headers
function renderHeaders() {
  const headersList = document.getElementById('headersList');
  
  if (customHeaders.length === 0) {
    headersList.innerHTML = '<div style="text-align: center; opacity: 0.6; padding: 20px; font-size: 13px;">No custom headers added yet</div>';
    return;
  }

  headersList.innerHTML = customHeaders.map((header, index) => `
    <div class="header-item">
      <input type="text" class="header-input" placeholder="Header Name" value="${header.name}" data-index="${index}" data-field="name">
      <input type="text" class="header-input" placeholder="Header Value" value="${header.value}" data-index="${index}" data-field="value">
      <button class="btn-remove" data-index="${index}">🗑️</button>
    </div>
  `).join('');

  // Add event listeners for inputs
  headersList.querySelectorAll('.header-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const index = parseInt(e.target.dataset.index);
      const field = e.target.dataset.field;
      customHeaders[index][field] = e.target.value;
    });
  });

  // Add event listeners for remove buttons
  headersList.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      customHeaders.splice(index, 1);
      renderHeaders();
    });
  });
}

// Add new header
document.getElementById('addHeader').addEventListener('click', () => {
  customHeaders.push({ name: '', value: '' });
  renderHeaders();
});

// Apply headers
document.getElementById('applyHeaders').addEventListener('click', async () => {
  // Filter out empty headers
  const validHeaders = customHeaders.filter(h => h.name.trim() && h.value.trim());
  
  await chrome.storage.local.set({ customHeaders: validHeaders });
  chrome.runtime.sendMessage({ action: 'updateHeaders', headers: validHeaders });
  
  // Show success feedback
  const btn = document.getElementById('applyHeaders');
  const originalText = btn.innerHTML;
  btn.innerHTML = '✅ Headers Applied!';
  btn.style.background = 'rgba(16, 185, 129, 0.5)';
  
  setTimeout(() => {
    btn.innerHTML = originalText;
    btn.style.background = '';
  }, 1500);
});

// Initialize
loadState();
renderHeaders();