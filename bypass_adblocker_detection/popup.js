// Load saved state
async function loadState() {
  const data = await chrome.storage.local.get(['enabled', 'mode', 'stats']);
  
  const enableToggle = document.getElementById('enableToggle');
  enableToggle.checked = data.enabled || false;
  updateStatus(data.enabled || false);

  const mode = data.mode || 'aggressive';
  document.querySelector(`input[value="${mode}"]`).checked = true;
  document.querySelector(`[data-mode="${mode}"]`).classList.add('active');

  if (data.stats) {
    updateStats(data.stats);
  }
}

// Update status text
function updateStatus(enabled) {
  const statusText = document.getElementById('statusText');
  if (enabled) {
    statusText.textContent = '✅ Protection is active - Bypassing ad-blocker detection';
    statusText.style.color = '#10b981';
  } else {
    statusText.textContent = '❌ Protection is disabled';
    statusText.style.color = 'rgba(255, 255, 255, 0.8)';
  }
}

// Update statistics display
function updateStats(stats) {
  document.getElementById('scriptsBlocked').textContent = stats.scriptsBlocked || 0;
  document.getElementById('overlaysRemoved').textContent = stats.overlaysRemoved || 0;
  document.getElementById('sitesProtected').textContent = stats.sitesProtected || 0;
}

// Toggle extension
document.getElementById('enableToggle').addEventListener('change', async (e) => {
  const enabled = e.target.checked;
  await chrome.storage.local.set({ enabled });
  updateStatus(enabled);
  
  chrome.runtime.sendMessage({ action: 'toggleExtension', enabled });
});

// Mode selection
document.querySelectorAll('.mode-option').forEach(option => {
  option.addEventListener('click', async () => {
    const radio = option.querySelector('input[type="radio"]');
    radio.checked = true;
    
    document.querySelectorAll('.mode-option').forEach(o => o.classList.remove('active'));
    option.classList.add('active');
    
    const mode = radio.value;
    await chrome.storage.local.set({ mode });
    chrome.runtime.sendMessage({ action: 'updateMode', mode });
  });
});

// Reset statistics
document.getElementById('resetStats').addEventListener('click', async () => {
  const stats = {
    scriptsBlocked: 0,
    overlaysRemoved: 0,
    sitesProtected: 0
  };
  
  await chrome.storage.local.set({ stats });
  updateStats(stats);
  
  const btn = document.getElementById('resetStats');
  const originalText = btn.textContent;
  btn.textContent = '✅ Reset!';
  setTimeout(() => {
    btn.textContent = originalText;
  }, 1000);
});

// Listen for stats updates
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'updateStats') {
    updateStats(message.stats);
  }
});

// Initialize
loadState();