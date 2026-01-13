let allDomains = [];
let filteredDomains = [];
let selectedDomains = new Set();

// Get domain from URL
function getDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

// Load and process history
async function loadHistory() {
  const domainsList = document.getElementById('domainsList');
  domainsList.innerHTML = '<div class="loading">⏳ Loading history...</div>';

  try {
    const historyItems = await chrome.history.search({
      text: '',
      maxResults: 0,
      startTime: 0
    });

    const domainMap = new Map();

    historyItems.forEach(item => {
      const domain = getDomain(item.url);
      if (domain) {
        if (!domainMap.has(domain)) {
          domainMap.set(domain, {
            domain: domain,
            count: 0,
            urls: []
          });
        }
        const domainData = domainMap.get(domain);
        domainData.count++;
        domainData.urls.push(item.url);
      }
    });

    allDomains = Array.from(domainMap.values()).sort((a, b) => b.count - a.count);
    filteredDomains = [...allDomains];
    
    renderDomains();
  } catch (error) {
    domainsList.innerHTML = `<div class="empty">❌ Error loading history: ${error.message}</div>`;
  }
}

// Render domains list
function renderDomains() {
  const domainsList = document.getElementById('domainsList');
  
  if (filteredDomains.length === 0) {
    domainsList.innerHTML = '<div class="empty">📭 No domains found</div>';
    return;
  }

  domainsList.innerHTML = filteredDomains.map(domain => `
    <div class="domain-item ${selectedDomains.has(domain.domain) ? 'selected' : ''}" data-domain="${domain.domain}">
      <input type="checkbox" class="checkbox" ${selectedDomains.has(domain.domain) ? 'checked' : ''}>
      <div class="domain-info">
        <div class="domain-name">🌐 ${domain.domain}</div>
        <div class="domain-count">📊 ${domain.count} visit${domain.count !== 1 ? 's' : ''}</div>
      </div>
    </div>
  `).join('');

  updateDeleteButton();
}

// Update delete button state
function updateDeleteButton() {
  const deleteBtn = document.getElementById('deleteBtn');
  deleteBtn.disabled = selectedDomains.size === 0;
}

// Delete selected domains
async function deleteSelectedDomains() {
  if (selectedDomains.size === 0) return;

  const deleteBtn = document.getElementById('deleteBtn');
  const status = document.getElementById('status');
  
  deleteBtn.disabled = true;
  deleteBtn.textContent = '⏳ Deleting...';
  status.style.display = 'block';
  status.textContent = '🔄 Deleting history...';

  try {
    let deletedCount = 0;
    
    for (const domainName of selectedDomains) {
      const domainData = allDomains.find(d => d.domain === domainName);
      if (domainData) {
        for (const url of domainData.urls) {
          await chrome.history.deleteUrl({ url: url });
        }
        deletedCount++;
      }
    }

    status.textContent = `✅ Successfully deleted ${deletedCount} domain${deletedCount !== 1 ? 's' : ''}!`;
    
    selectedDomains.clear();
    
    setTimeout(() => {
      status.style.display = 'none';
      loadHistory();
    }, 2000);
    
  } catch (error) {
    status.textContent = `❌ Error: ${error.message}`;
    deleteBtn.disabled = false;
    deleteBtn.innerHTML = '🔥 Delete Selected';
  }
}

// Search domains
function searchDomains(query) {
  const lowerQuery = query.toLowerCase();
  filteredDomains = allDomains.filter(domain => 
    domain.domain.toLowerCase().includes(lowerQuery)
  );
  renderDomains();
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  loadHistory();

  // Search input
  document.getElementById('searchInput').addEventListener('input', (e) => {
    searchDomains(e.target.value);
  });

  // Select all
  document.getElementById('selectAll').addEventListener('click', () => {
    filteredDomains.forEach(domain => selectedDomains.add(domain.domain));
    renderDomains();
  });

  // Deselect all
  document.getElementById('deselectAll').addEventListener('click', () => {
    selectedDomains.clear();
    renderDomains();
  });

  // Delete button
  document.getElementById('deleteBtn').addEventListener('click', () => {
    if (confirm(`🗑️ Are you sure you want to delete history for ${selectedDomains.size} domain${selectedDomains.size !== 1 ? 's' : ''}?`)) {
      deleteSelectedDomains();
    }
  });

  // Domain item click
  document.getElementById('domainsList').addEventListener('click', (e) => {
    const domainItem = e.target.closest('.domain-item');
    if (!domainItem) return;

    const domain = domainItem.dataset.domain;
    
    if (selectedDomains.has(domain)) {
      selectedDomains.delete(domain);
    } else {
      selectedDomains.add(domain);
    }
    
    renderDomains();
  });
});