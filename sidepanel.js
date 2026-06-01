// MindMesh Side Panel

// --- Tab switching ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
    if (tab.dataset.tab === 'reading') loadReading();
    if (tab.dataset.tab === 'research') loadResearchHistory();
    if (tab.dataset.tab === 'bookmarks') loadBookmarks();
    if (tab.dataset.tab === 'graph') loadGraph();
    if (tab.dataset.tab === 'settings') { loadSettings(); loadSyncStatus(); }
  });
});

// --- Research ---
document.getElementById('research-btn').addEventListener('click', async () => {
  const query = document.getElementById('research-query').value.trim();
  if (!query) return toast('请输入研究课题', 'error');

  const btn = document.getElementById('research-btn');
  const resultEl = document.getElementById('research-result');
  btn.disabled = true;
  btn.textContent = '研究中...';
  resultEl.classList.add('visible', 'loading');
  resultEl.textContent = '正在分解课题、搜索资料、综合分析...';

  try {
    const res = await chrome.runtime.sendMessage({ action: 'research', query });
    if (res.error) throw new Error(res.error);
    resultEl.classList.remove('loading');
    resultEl.innerHTML = markdownToHtml(res.report);
    document.getElementById('research-query').value = '';
    loadResearchHistory();
  } catch (e) {
    resultEl.textContent = '研究失败: ' + e.message;
    resultEl.classList.remove('loading');
  } finally {
    btn.disabled = false;
    btn.textContent = '开始研究';
  }
});

// --- Serendipity ---
document.getElementById('serendipity-btn').addEventListener('click', async () => {
  const query = document.getElementById('research-query').value.trim();
  if (!query) return toast('请输入课题再点击偶然发现', 'error');

  const btn = document.getElementById('serendipity-btn');
  const resultEl = document.getElementById('serendipity-result');
  btn.disabled = true;
  btn.textContent = '搜索中...';
  resultEl.classList.add('visible', 'loading');
  resultEl.textContent = '正在从历史阅读中寻找相关内容...';

  try {
    const res = await chrome.runtime.sendMessage({ action: 'serendipity', query });
    if (res.error) throw new Error(res.error);
    resultEl.classList.remove('loading');

    if (!res.results || res.results.length === 0) {
      resultEl.innerHTML = '<div style="color:var(--text2);">暂未找到相关历史阅读，多读一些页面后再试</div>';
    } else {
      resultEl.innerHTML = `<div style="margin-bottom:8px;color:var(--accent);">💡 找到 ${res.results.length} 篇相关阅读：</div>` +
        res.results.map(r => `
          <div class="history-item" onclick="window.open('${escapeHtml(r.url)}')">
            <div class="title">${escapeHtml(r.title)}</div>
            <div class="meta">
              <span class="domain">${escapeHtml(r.domain)}</span>
              <span style="color:var(--green);">${escapeHtml(r.reason)}</span>
            </div>
          </div>
        `).join('');
    }
  } catch (e) {
    resultEl.textContent = '搜索失败: ' + e.message;
    resultEl.classList.remove('loading');
  } finally {
    btn.disabled = false;
    btn.textContent = '💡 偶然发现';
  }
});

async function loadResearchHistory() {
  const res = await chrome.runtime.sendMessage({ action: 'getResearch', options: { limit: 20 } });
  const el = document.getElementById('research-history');
  if (!res || res.length === 0) {
    el.innerHTML = '<div style="color:var(--text2);padding:16px;">暂无研究记录</div>';
    return;
  }
  el.innerHTML = res.map(r => `
    <div class="history-item" data-id="${r.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div class="title" style="flex:1;">${escapeHtml(r.query)}</div>
        <button class="btn-icon delete-research" data-id="${r.id}" title="删除">✕</button>
      </div>
      <div class="meta">${new Date(r.createdAt).toLocaleString()}</div>
    </div>
  `).join('');

  // Delete buttons
  el.querySelectorAll('.delete-research').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      await chrome.runtime.sendMessage({ action: 'deleteResearch', id });
      loadResearchHistory();
      toast('已删除', 'success');
    });
  });

  el.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => {
      const r = res.find(x => x.id === parseInt(item.dataset.id));
      if (r) {
        const resultEl = document.getElementById('research-result');
        resultEl.classList.add('visible');
        resultEl.classList.remove('loading');
        resultEl.innerHTML = markdownToHtml(r.report);
      }
    });
  });
}

// --- Reading ---
document.getElementById('digest-btn').addEventListener('click', async () => {
  const btn = document.getElementById('digest-btn');
  const resultEl = document.getElementById('digest-result');
  btn.disabled = true;
  btn.textContent = '生成中...';
  resultEl.classList.add('visible', 'loading');
  resultEl.textContent = '正在分析今日阅读记录...';

  try {
    const res = await chrome.runtime.sendMessage({ action: 'dailyDigest' });
    if (res.error) throw new Error(res.error);
    resultEl.classList.remove('loading');
    resultEl.innerHTML = markdownToHtml(res.digest);
    // Save to storage for later retrieval
    await chrome.runtime.sendMessage({ action: 'setSetting', key: 'last_digest', value: JSON.stringify({ date: new Date().toISOString(), text: res.digest }) });
  } catch (e) {
    resultEl.textContent = '生成失败: ' + e.message;
    resultEl.classList.remove('loading');
  } finally {
    btn.disabled = false;
    btn.textContent = '📋 生成今日文摘';
  }
});

document.getElementById('refresh-reading-btn').addEventListener('click', loadReading);

document.getElementById('last-digest-btn').addEventListener('click', async () => {
  const resultEl = document.getElementById('digest-result');
  try {
    const raw = await chrome.runtime.sendMessage({ action: 'getSetting', key: 'last_digest' });
    if (!raw) {
      resultEl.classList.add('visible');
      resultEl.classList.remove('loading');
      resultEl.textContent = '暂无历史文摘，每天凌晨 6 点会自动生成，或手动点击「生成今日文摘」';
      return;
    }
    const digest = JSON.parse(raw);
    resultEl.classList.add('visible');
    resultEl.classList.remove('loading');
    resultEl.innerHTML = `<div style="color:var(--text2);font-size:11px;margin-bottom:8px;">${new Date(digest.date).toLocaleString()}</div>` + markdownToHtml(digest.text);
  } catch (e) {
    resultEl.textContent = '读取失败: ' + e.message;
  }
});

async function loadReading() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const visits = await chrome.runtime.sendMessage({
    action: 'getVisits',
    options: { since: todayStart.getTime(), limit: 50 }
  });

  const el = document.getElementById('reading-list');
  if (!visits || visits.length === 0) {
    el.innerHTML = '<div style="color:var(--text2);padding:16px;">今天还没有阅读记录，浏览网页时会自动追踪</div>';
    return;
  }

  const totalTime = visits.reduce((sum, v) => sum + (v.dwellMs || 0), 0);
  const mins = Math.round(totalTime / 60000);
  const summary = `<div style="padding:8px 0;color:var(--text2);font-size:12px;">
    今日 ${visits.length} 个页面，总阅读 ${mins > 0 ? mins + '分钟' : Math.round(totalTime/1000) + '秒'}
  </div>`;

  el.innerHTML = summary + visits.map(v => {
    const secs = Math.round((v.dwellMs || 0) / 1000);
    const timeStr = secs >= 60 ? `${Math.floor(secs/60)}分${secs%60}秒` : `${secs}秒`;
    return `
    <div class="history-item visit-item" data-id="${v.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div class="title" style="flex:1;">${escapeHtml(v.title)}</div>
        <div style="display:flex;gap:2px;">
          <button class="btn-icon extract-concept" data-id="${v.id}" title="提取概念">🧠</button>
          <button class="btn-icon bookmark-page" data-id="${v.id}" title="收藏">⭐</button>
        </div>
      </div>
      <div class="meta">
        <span class="domain">${escapeHtml(v.domain)}</span>
        <span>${timeStr}</span>
        <span>滚动 ${v.scrollDepth || 0}%</span>
      </div>
    </div>
  `}).join('');

  // Extract concept buttons
  el.querySelectorAll('.extract-concept').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const visitId = parseInt(btn.dataset.id);
      btn.disabled = true;
      btn.textContent = '⏳';
      try {
        const res = await chrome.runtime.sendMessage({ action: 'extractConcepts', visitId });
        if (res.error) throw new Error(res.error);
        const count = res.concepts ? res.concepts.length : 0;
        toast(`已提取 ${count} 个概念`, 'success');
        btn.textContent = '✅';
      } catch (e) {
        toast('提取失败: ' + e.message, 'error');
        btn.textContent = '🧠';
      }
    });
  });

  // Bookmark buttons
  el.querySelectorAll('.bookmark-page').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const visitId = parseInt(btn.dataset.id);
      const v = visits.find(x => x.id === visitId);
      if (!v) return;
      btn.disabled = true;
      btn.textContent = '⏳';
      try {
        const res = await chrome.runtime.sendMessage({
          action: 'saveBookmark',
          data: { url: v.url, title: v.title, domain: v.domain, contentText: v.contentText }
        });
        if (res.error) throw new Error(res.error);
        if (res.alreadySaved) {
          toast('已收藏过', 'error');
          btn.textContent = '✅';
        } else {
          toast('已收藏，标签提取中...', 'success');
          btn.textContent = '✅';
        }
      } catch (e) {
        toast('收藏失败: ' + e.message, 'error');
        btn.textContent = '⭐';
      }
    });
  });

  // Click to summarize
  el.querySelectorAll('.visit-item').forEach(item => {
    item.addEventListener('click', async () => {
      const v = visits.find(x => x.id === parseInt(item.dataset.id));
      if (!v || !v.contentText) return;
      const resultEl = document.getElementById('digest-result');
      resultEl.classList.add('visible', 'loading');
      resultEl.textContent = '正在总结...';
      try {
        const res = await chrome.runtime.sendMessage({ action: 'summarize', data: v });
        resultEl.classList.remove('loading');
        resultEl.innerHTML = markdownToHtml(res.summary);
      } catch (e) {
        resultEl.textContent = '总结失败: ' + e.message;
        resultEl.classList.remove('loading');
      }
    });
  });
}

// --- Settings ---
document.getElementById('save-settings-btn').addEventListener('click', async () => {
  const apiKey = document.getElementById('setting-apikey').value.trim();
  const apiUrl = document.getElementById('setting-apiurl').value.trim();
  const model = document.getElementById('setting-model').value.trim();

  if (apiKey) await chrome.runtime.sendMessage({ action: 'setSetting', key: 'api_key', value: apiKey });
  if (apiUrl) await chrome.runtime.sendMessage({ action: 'setSetting', key: 'api_url', value: apiUrl });
  if (model) await chrome.runtime.sendMessage({ action: 'setSetting', key: 'model', value: model });
  toast('设置已保存', 'success');
});

document.getElementById('test-api-btn').addEventListener('click', async () => {
  const btn = document.getElementById('test-api-btn');
  btn.disabled = true;
  btn.textContent = '测试中...';
  try {
    // Save current settings first
    const apiKey = document.getElementById('setting-apikey').value.trim();
    const apiUrl = document.getElementById('setting-apiurl').value.trim();
    const model = document.getElementById('setting-model').value.trim();
    if (apiKey) await chrome.runtime.sendMessage({ action: 'setSetting', key: 'api_key', value: apiKey });
    if (apiUrl) await chrome.runtime.sendMessage({ action: 'setSetting', key: 'api_url', value: apiUrl });
    if (model) await chrome.runtime.sendMessage({ action: 'setSetting', key: 'model', value: model });

    // Send a minimal test request
    const res = await chrome.runtime.sendMessage({ action: 'summarize', data: { contentText: 'Hello, this is a connection test.', title: 'Test', domain: 'test.com' } });
    if (res.error) throw new Error(res.error);
    toast('✅ API 连接正常！', 'success');
  } catch (e) {
    toast('❌ 连接失败: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔗 测试连接';
  }
});

document.getElementById('clear-data-btn').addEventListener('click', async () => {
  if (!confirm('确定要清除所有阅读记录和研究数据？此操作不可恢复。')) return;
  await chrome.runtime.sendMessage({ action: 'clearData' });
  toast('数据已清除', 'success');
  loadReading();
  loadResearchHistory();
});

async function loadSettings() {
  const apiKey = await chrome.runtime.sendMessage({ action: 'getSetting', key: 'api_key' });
  const apiUrl = await chrome.runtime.sendMessage({ action: 'getSetting', key: 'api_url' });
  const model = await chrome.runtime.sendMessage({ action: 'getSetting', key: 'model' });
  if (apiKey) document.getElementById('setting-apikey').value = apiKey;
  if (apiUrl) document.getElementById('setting-apiurl').value = apiUrl;
  if (model) document.getElementById('setting-model').value = model;
}

// --- Sync ---
async function loadSyncStatus() {
  const res = await chrome.runtime.sendMessage({ action: 'syncStatus' });
  const statusText = document.getElementById('sync-status-text');
  const lastTime = document.getElementById('sync-last-time');
  const connectBtn = document.getElementById('sync-connect-btn');
  const disconnectBtn = document.getElementById('sync-disconnect-btn');
  const syncNowBtn = document.getElementById('sync-now-btn');

  if (res && res.enabled && res.connected) {
    statusText.textContent = '✅ 已连接 Google Drive';
    statusText.style.color = 'var(--accent)';
    connectBtn.style.display = 'none';
    disconnectBtn.style.display = '';
    syncNowBtn.style.display = '';
    if (res.lastSync) {
      lastTime.textContent = '上次同步: ' + new Date(res.lastSync).toLocaleString();
    }
  } else {
    statusText.textContent = '未连接';
    statusText.style.color = '';
    connectBtn.style.display = '';
    disconnectBtn.style.display = 'none';
    syncNowBtn.style.display = 'none';
    lastTime.textContent = '';
  }
}

document.getElementById('sync-connect-btn').addEventListener('click', async () => {
  const btn = document.getElementById('sync-connect-btn');
  btn.disabled = true;
  btn.textContent = '连接中...';
  try {
    const res = await chrome.runtime.sendMessage({ action: 'syncConnect' });
    if (res.error) throw new Error(res.error);
    toast('Google Drive 已连接，数据已同步', 'success');
    loadSyncStatus();
  } catch (e) {
    toast('连接失败: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '连接 Google Drive';
  }
});

document.getElementById('sync-disconnect-btn').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ action: 'syncDisconnect' });
  toast('已断开 Google Drive 连接', 'success');
  loadSyncStatus();
});

document.getElementById('sync-now-btn').addEventListener('click', async () => {
  const btn = document.getElementById('sync-now-btn');
  btn.disabled = true;
  btn.textContent = '同步中...';
  try {
    // Push local, then pull remote
    const pushRes = await chrome.runtime.sendMessage({ action: 'syncPush' });
    if (pushRes.error) throw new Error(pushRes.error);
    const pullRes = await chrome.runtime.sendMessage({ action: 'syncPull' });
    if (pullRes.error) throw new Error(pullRes.error);
    toast('同步完成', 'success');
    loadSyncStatus();
  } catch (e) {
    toast('同步失败: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '立即同步';
  }
});

// --- Bookmarks ---
async function loadBookmarks(options = {}) {
  const bookmarks = await chrome.runtime.sendMessage({
    action: 'getBookmarks',
    options: { search: options.search || '', limit: 100 }
  });

  const el = document.getElementById('bookmark-list');
  const statsEl = document.getElementById('bookmark-stats');

  if (!bookmarks || bookmarks.length === 0) {
    statsEl.textContent = '';
    el.innerHTML = '<div style="color:var(--text2);padding:16px;">暂无收藏。点击「⭐ 收藏当前页面」保存你感兴趣的网页。</div>';
    return;
  }

  statsEl.textContent = `共 ${bookmarks.length} 个收藏`;

  el.innerHTML = bookmarks.map(bm => {
    const tags = (bm.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    return `
    <div class="history-item bookmark-item">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <a href="${escapeHtml(bm.url)}" target="_blank" class="title" style="flex:1;color:var(--accent);text-decoration:none;">${escapeHtml(bm.title)}</a>
        <button class="btn-icon delete-bookmark" data-id="${bm.id}" title="取消收藏">✕</button>
      </div>
      ${bm.description ? `<div style="font-size:12px;color:var(--text2);margin-top:4px;">${escapeHtml(bm.description)}</div>` : ''}
      <div class="meta">
        <span class="domain">${escapeHtml(bm.domain)}</span>
        <span>${new Date(bm.savedAt).toLocaleDateString()}</span>
      </div>
      ${tags ? `<div class="tags">${tags}</div>` : ''}
    </div>
  `}).join('');

  // Delete buttons
  el.querySelectorAll('.delete-bookmark').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      await chrome.runtime.sendMessage({ action: 'deleteBookmark', id });
      loadBookmarks({ search: document.getElementById('bookmark-search').value.trim() });
      toast('已取消收藏', 'success');
    });
  });
}

// Save current page
document.getElementById('save-page-btn').addEventListener('click', async () => {
  const btn = document.getElementById('save-page-btn');
  btn.disabled = true;
  btn.textContent = '保存中...';
  try {
    const res = await chrome.runtime.sendMessage({ action: 'saveCurrentPage' });
    if (res.error) throw new Error(res.error);
    if (res.alreadySaved) {
      toast('该页面已收藏过', 'error');
    } else {
      toast('已收藏，标签后台提取中...', 'success');
    }
    loadBookmarks();
  } catch (e) {
    toast('收藏失败: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '⭐ 收藏当前页面';
  }
});

document.getElementById('refresh-bookmarks-btn').addEventListener('click', () => loadBookmarks());

// Export bookmarks as JSON download
document.getElementById('export-bookmarks-btn').addEventListener('click', async () => {
  const btn = document.getElementById('export-bookmarks-btn');
  btn.disabled = true;
  btn.textContent = '导出中...';
  try {
    const bookmarks = await chrome.runtime.sendMessage({ action: 'getBookmarks', options: { limit: 500 } });
    if (!bookmarks || bookmarks.length === 0) {
      toast('暂无收藏可导出', 'error');
      return;
    }
    const data = JSON.stringify(bookmarks, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mindmesh-bookmarks.json';
    a.click();
    URL.revokeObjectURL(url);
    toast(`已导出 ${bookmarks.length} 个收藏`, 'success');
  } catch (e) {
    toast('导出失败: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '📤 导出';
  }
});

// Bookmark search
let bookmarkSearchTimer = null;
document.getElementById('bookmark-search').addEventListener('input', (e) => {
  clearTimeout(bookmarkSearchTimer);
  bookmarkSearchTimer = setTimeout(() => {
    loadBookmarks({ search: e.target.value.trim() });
  }, 300);
});

// --- Knowledge Graph ---
async function loadGraph(options = {}) {
  const concepts = await chrome.runtime.sendMessage({
    action: 'getConcepts',
    options: { search: options.search || '', limit: 100 }
  });

  const el = document.getElementById('graph-list');
  const statsEl = document.getElementById('graph-stats');

  if (!concepts || concepts.length === 0) {
    statsEl.textContent = '';
    el.innerHTML = '<div style="color:var(--text2);padding:16px;">暂无概念数据。去阅读 tab 点击 🧠 按钮提取概念，或使用批量提取。</div>';
    return;
  }

  const totalNodes = concepts.reduce((sum, c) => sum + c.count, 0);
  statsEl.textContent = `共 ${concepts.length} 个概念，${totalNodes} 次出现`;

  el.innerHTML = concepts.map(c => `
    <div class="history-item concept-item">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div class="title" style="flex:1;">${escapeHtml(c.name)}</div>
        <span class="concept-count">${c.count}</span>
      </div>
      ${c.description ? `<div style="font-size:12px;color:var(--text2);margin-top:4px;">${escapeHtml(c.description)}</div>` : ''}
      <div class="meta">
        ${c.domains.map(d => `<span class="domain">${escapeHtml(d)}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

// Batch extract concepts from all today's readings
document.getElementById('extract-all-btn').addEventListener('click', async () => {
  const btn = document.getElementById('extract-all-btn');
  btn.disabled = true;
  btn.textContent = '提取中...';

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const visits = await chrome.runtime.sendMessage({
      action: 'getVisits',
      options: { since: todayStart.getTime(), limit: 50 }
    });

    const withContent = (visits || []).filter(v => v.contentText && v.contentText.length > 100);
    if (withContent.length === 0) {
      toast('今天暂无可提取的阅读记录', 'error');
      return;
    }

    let total = 0;
    for (let i = 0; i < withContent.length; i++) {
      btn.textContent = `${i+1}/${withContent.length}`;
      const res = await chrome.runtime.sendMessage({ action: 'extractConcepts', visitId: withContent[i].id });
      if (res.concepts) total += res.concepts.length;
    }

    toast(`已从 ${withContent.length} 个页面提取 ${total} 个概念`, 'success');
    loadGraph();
  } catch (e) {
    toast('批量提取失败: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🧠 批量提取概念';
  }
});

document.getElementById('refresh-graph-btn').addEventListener('click', () => loadGraph());

// Graph search
let graphSearchTimer = null;
document.getElementById('graph-search').addEventListener('input', (e) => {
  clearTimeout(graphSearchTimer);
  graphSearchTimer = setTimeout(() => {
    loadGraph({ search: e.target.value.trim() });
  }, 300);
});

// --- Utilities ---
function toast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  setTimeout(() => el.classList.add('hidden'), 2500);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function markdownToHtml(md) {
  // Simple markdown renderer (no external deps for extension)
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

// Load initial data
loadReading();
loadResearchHistory();
