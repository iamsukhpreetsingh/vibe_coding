// Popup script for managing blocked keywords
document.addEventListener('DOMContentLoaded', function() {
  const keywordInput = document.getElementById('keywordInput');
  const addKeywordBtn = document.getElementById('addKeyword');
  const clearAllBtn = document.getElementById('clearAll');
  const keywordList = document.getElementById('keywordList');
  const statusMessage = document.getElementById('statusMessage');
  const stats = document.getElementById('stats');
  
  let blockedKeywords = [];
  
  // Load existing keywords
  loadKeywords();
  
  // Add keyword event listener
  addKeywordBtn.addEventListener('click', addKeyword);
  keywordInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      addKeyword();
    }
  });
  
  // Clear all keywords
  clearAllBtn.addEventListener('click', function() {
    if (confirm('Are you sure you want to clear all blocked keywords?')) {
      blockedKeywords = [];
      saveKeywords();
      displayKeywords();
      showStatus('All keywords cleared!', 'success');
    }
  });
  
  function loadKeywords() {
    chrome.storage.sync.get(['blockedKeywords'], function(result) {
      if (result.blockedKeywords) {
        blockedKeywords = result.blockedKeywords;
      } else {
        // Initialize with default keywords
        blockedKeywords = [
          'porn', 'sex', 'xxx', 'adult', 'nude', 'naked', 'explicit'
        ];
        saveKeywords();
      }
      displayKeywords();
    });
  }
  
  function saveKeywords() {
    chrome.storage.sync.set({blockedKeywords: blockedKeywords}, function() {
      displayKeywords();
    });
  }
  
  function addKeyword() {
    const keyword = keywordInput.value.trim().toLowerCase();
    
    if (!keyword) {
      showStatus('Please enter a keyword', 'error');
      return;
    }
    
    if (blockedKeywords.includes(keyword)) {
      showStatus('Keyword already exists', 'error');
      return;
    }
    
    blockedKeywords.push(keyword);
    keywordInput.value = '';
    saveKeywords();
    showStatus('Keyword added successfully!', 'success');
  }
  
  function removeKeyword(keyword) {
    const index = blockedKeywords.indexOf(keyword);
    if (index > -1) {
      blockedKeywords.splice(index, 1);
      saveKeywords();
      showStatus('Keyword removed!', 'success');
    }
  }
  
  function displayKeywords() {
    keywordList.innerHTML = '';
    
    if (blockedKeywords.length === 0) {
      keywordList.innerHTML = '<div style="text-align: center; opacity: 0.7; padding: 20px;">No keywords blocked yet</div>';
      stats.textContent = 'No keywords active';
      return;
    }
    
    blockedKeywords.forEach(function(keyword) {
      const keywordItem = document.createElement('div');
      keywordItem.className = 'keyword-item';
      
      keywordItem.innerHTML = `
        <span class="keyword-text">${escapeHtml(keyword)}</span>
        <button class="btn-remove" data-keyword="${escapeHtml(keyword)}">Remove</button>
      `;
      
      keywordList.appendChild(keywordItem);
    });
    
    // Add event listeners to remove buttons
    document.querySelectorAll('.btn-remove').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const keyword = this.getAttribute('data-keyword');
        removeKeyword(keyword);
      });
    });
    
    // Update stats
    const count = blockedKeywords.length;
    stats.textContent = `${count} keyword${count !== 1 ? 's' : ''} active`;
  }
  
  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message status-${type}`;
    statusMessage.style.display = 'block';
    
    setTimeout(function() {
      statusMessage.style.display = 'none';
    }, 3000);
  }
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // Import/Export functionality (bonus feature)
  document.addEventListener('keydown', function(e) {
    // Ctrl+E to export keywords
    if (e.ctrlKey && e.key === 'e') {
      e.preventDefault();
      const dataStr = JSON.stringify(blockedKeywords, null, 2);
      const dataBlob = new Blob([dataStr], {type: 'application/json'});
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(dataBlob);
      link.download = 'blocked_keywords.json';
      link.click();
      
      showStatus('Keywords exported!', 'success');
    }
  });
});