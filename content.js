// MindMesh Floating Toolbar — inject into every page
(function() {
  if (window.__mindmesh_toolbar) return;
  window.__mindmesh_toolbar = true;

  const STYLE = `
    #mindmesh-fab {
      position: fixed;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #mindmesh-fab-trigger {
      width: 28px;
      height: 56px;
      background: linear-gradient(135deg, #6c8cff 0%, #4a6cf7 100%);
      border-radius: 12px 0 0 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: -2px 2px 12px rgba(0,0,0,0.3);
      transition: width 0.2s ease;
      user-select: none;
    }
    #mindmesh-fab-trigger:hover {
      width: 34px;
    }
    #mindmesh-fab-trigger svg {
      width: 18px;
      height: 18px;
      fill: #fff;
      transition: transform 0.3s ease;
    }
    #mindmesh-fab.open #mindmesh-fab-trigger svg {
      transform: rotate(180deg);
    }
    #mindmesh-fab-menu {
      position: absolute;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      gap: 4px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease, transform 0.2s ease;
      transform: translateY(-50%) translateX(10px);
    }
    #mindmesh-fab.open #mindmesh-fab-menu {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(-50%) translateX(-8px);
    }
    .mindmesh-fab-btn {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: #1a1d27;
      border: 1px solid #2a2e3a;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      transition: all 0.15s ease;
      position: relative;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .mindmesh-fab-btn:hover {
      background: #242836;
      border-color: #6c8cff;
      transform: scale(1.1);
    }
    .mindmesh-fab-btn .tooltip {
      position: absolute;
      right: 48px;
      background: #1a1d27;
      color: #e1e4eb;
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 6px;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s;
      border: 1px solid #2a2e3a;
    }
    .mindmesh-fab-btn:hover .tooltip {
      opacity: 1;
    }
    .mindmesh-fab-btn.success {
      border-color: #4ade80;
    }
    .mindmesh-fab-btn.success::after {
      content: '✓';
      position: absolute;
      top: -4px;
      right: -4px;
      background: #4ade80;
      color: #000;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      font-size: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
    }
  `;

  // Inject styles
  const styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);

  // Build DOM
  const fab = document.createElement('div');
  fab.id = 'mindmesh-fab';
  fab.innerHTML = `
    <div id="mindmesh-fab-menu">
      <button class="mindmesh-fab-btn" id="mm-btn-bookmark" title="收藏当前页面">
        <span>⭐</span>
        <span class="tooltip">收藏</span>
      </button>
      <button class="mindmesh-fab-btn" id="mm-btn-sidepanel" title="打开侧边栏">
        <span>📋</span>
        <span class="tooltip">侧边栏</span>
      </button>
      <button class="mindmesh-fab-btn" id="mm-btn-graph" title="知识图谱">
        <span>🕸️</span>
        <span class="tooltip">图谱</span>
      </button>
    </div>
    <div id="mindmesh-fab-trigger">
      <svg viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/></svg>
    </div>
  `;
  document.body.appendChild(fab);

  // Toggle menu
  let isOpen = false;
  const trigger = document.getElementById('mindmesh-fab-trigger');
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    isOpen = !isOpen;
    fab.classList.toggle('open', isOpen);
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!fab.contains(e.target) && isOpen) {
      isOpen = false;
      fab.classList.remove('open');
    }
  });

  // Bookmark button
  document.getElementById('mm-btn-bookmark').addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = document.getElementById('mm-btn-bookmark');
    btn.querySelector('span:first-child').textContent = '⏳';
    try {
      const response = await chrome.runtime.sendMessage({ action: 'saveCurrentPage' });
      if (response.error) throw new Error(response.error);
      if (response.alreadySaved) {
        btn.querySelector('span:first-child').textContent = '✅';
      } else {
        btn.classList.add('success');
        btn.querySelector('span:first-child').textContent = '⭐';
        setTimeout(() => btn.classList.remove('success'), 2000);
      }
    } catch (e) {
      btn.querySelector('span:first-child').textContent = '❌';
      setTimeout(() => btn.querySelector('span:first-child').textContent = '⭐', 2000);
    }
  });

  // Open side panel — use chrome.sidePanel.open if available
  document.getElementById('mm-btn-sidepanel').addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
    } catch (err) {
      // Fallback: show hint
      const btn = document.getElementById('mm-btn-sidepanel');
      btn.querySelector('.tooltip').textContent = '请点击工具栏图标';
      btn.querySelector('.tooltip').style.opacity = '1';
      setTimeout(() => {
        btn.querySelector('.tooltip').textContent = '侧边栏';
        btn.querySelector('.tooltip').style.opacity = '';
      }, 2000);
    }
  });

  // Knowledge graph shortcut
  document.getElementById('mm-btn-graph').addEventListener('click', async (e) => {
    e.stopPropagation();
    // Extract concepts from current page
    const btn = document.getElementById('mm-btn-graph');
    btn.querySelector('span:first-child').textContent = '⏳';
    try {
      // First save to tracking if not already tracked
      const response = await chrome.runtime.sendMessage({ action: 'saveCurrentPage' });
      // Then extract concepts from the visit
      if (response && response.id) {
        await chrome.runtime.sendMessage({ action: 'extractConcepts', visitId: response.id });
        btn.querySelector('span:first-child').textContent = '✅';
        setTimeout(() => btn.querySelector('span:first-child').textContent = '🕸️', 2000);
      }
    } catch (e) {
      btn.querySelector('span:first-child').textContent = '❌';
      setTimeout(() => btn.querySelector('span:first-child').textContent = '🕸️', 2000);
    }
  });
})();
