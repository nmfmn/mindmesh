// MindMesh Background Service Worker
importScripts('lib/storage.js', 'lib/ai.js', 'lib/gdrive.js', 'lib/autosave.js');

// Handle messages from content script and side panel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse).catch(e => sendResponse({ error: e.message }));
  return true; // keep channel open for async
});

async function handleMessage(msg, sender) {
  switch (msg.action) {
    case 'trackPage':
      return trackPage(msg.data);

    case 'getVisits':
      return Storage.getVisits(msg.options || {});

    case 'summarize':
      return summarize(msg.data);

    case 'dailyDigest':
      return dailyDigest();

    case 'getSetting':
      return Storage.getSetting(msg.key);

    case 'setSetting':
      await Storage.setSetting(msg.key, msg.value);
      return { ok: true };

    case 'clearData':
      await Storage.clearAll();
      return { ok: true };

    // --- Knowledge Graph ---
    case 'extractConcepts':
      return extractConcepts(msg.visitId);

    case 'getConcepts':
      return Storage.getConcepts(msg.options || {});

    case 'getRelations':
      return Storage.getRelations(msg.options || {});

    // --- Serendipity ---
    case 'serendipity':
      return serendipity(msg.query);

    // --- Bookmarks ---
    case 'saveBookmark':
      return saveBookmark(msg.data);

    case 'getBookmarks':
      return Storage.getBookmarks(msg.options || {});

    case 'deleteBookmark':
      await Storage.deleteBookmark(msg.id);
      return { ok: true };

    case 'isBookmarked':
      return Storage.isBookmarked(msg.url);

    case 'saveCurrentPage':
      return saveCurrentPage();

    case 'openSidePanel':
      await chrome.sidePanel.open({ windowId: msg.windowId });
      return { ok: true };

    // --- Sync actions ---
    // --- Sync ---
    case 'syncConnect':
      return syncConnect();

    case 'syncDisconnect':
      return syncDisconnect();

    case 'syncStatus':
      return syncStatus();

    case 'syncPush':
      return syncPush();

    case 'syncPull':
      return syncPull();

    default:
      return { error: 'Unknown action: ' + msg.action };
  }
}

async function trackPage(data) {
  // Check if we already have a visit for this URL today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const existing = await Storage.getVisits({ since: todayStart.getTime() });
  const existingVisit = existing.find(v => v.url === data.url);

  if (existingVisit) {
    // Update existing — merge dwell time
    await Storage.updateVisit(existingVisit.id, {
      dwellMs: data.dwellMs,
      scrollDepth: Math.max(data.scrollDepth, existingVisit.scrollDepth || 0),
      contentText: data.contentText || existingVisit.contentText
    });
    return { id: existingVisit.id, updated: true };
  } else {
    // New visit
    const id = await Storage.addVisit({
      url: data.url,
      title: data.title,
      domain: data.domain,
      dwellMs: data.dwellMs,
      scrollDepth: data.scrollDepth,
      startTime: data.startTime,
      contentText: data.contentText
    });

    // Auto-save valuable pages
    AutoSave.checkAndSave(data).then(result => {
      if (result) console.log('Auto-saved:', result.title, result.type);
    });

    return { id, created: true };
  }
}

async function summarize(data) {
  try {
    const result = await AI.summarize(data.contentText, {
      title: data.title,
      domain: data.domain
    });
    return { summary: result };
  } catch (e) {
    return { error: e.message };
  }
}

async function dailyDigest() {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const visits = await Storage.getVisits({ since: todayStart.getTime() });
    if (visits.length === 0) return { digest: '今天还没有阅读记录。' };
    const digest = await AI.dailyDigest(visits);
    return { digest };
  } catch (e) {
    return { error: e.message };
  }
}

// --- Knowledge Graph ---

async function extractConcepts(visitId) {
  try {
    const visit = await Storage.getVisit(visitId);
    if (!visit || !visit.contentText) return { error: '页面内容为空' };

    const concepts = await AI.extractConcepts(visit.contentText, {
      title: visit.title,
      domain: visit.domain
    });

    if (concepts.length === 0) return { concepts: [], message: '未提取到概念' };

    // Check if already extracted for this visit
    await Storage.deleteConceptsByVisitId(visitId);

    // Save concepts with visit metadata
    const conceptRecords = concepts.map(c => ({
      name: c.name,
      description: c.description || '',
      domain: visit.domain,
      visitId: visitId,
      visitUrl: visit.url,
      visitTitle: visit.title,
      extractedAt: Date.now()
    }));
    const ids = await Storage.addConcepts(conceptRecords);

    // Build relations between concepts from the same page
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        await Storage.addRelation({
          sourceId: ids[i],
          targetId: ids[j],
          type: 'co-occurrence',
          source: visit.title,
          visitId: visitId
        });
      }
    }

    return { concepts: conceptRecords, ids };
  } catch (e) {
    return { error: e.message };
  }
}

async function serendipity(query) {
  try {
    // Get all visits with content
    const allVisits = await Storage.getVisits({ limit: 200 });
    const withContent = allVisits.filter(v => v.contentText && v.contentText.length > 100);

    if (withContent.length === 0) return { results: [], message: '暂无阅读记录' };

    const results = await AI.findSerendipity(query, withContent);
    return { results };
  } catch (e) {
    return { error: e.message };
  }
}

// --- Bookmarks ---

async function saveBookmark(data) {
  try {
    // Check if already bookmarked
    const exists = await Storage.isBookmarked(data.url);
    if (exists) return { alreadySaved: true, message: '已收藏过该页面' };

    // Save immediately
    const id = await Storage.addBookmark({
      url: data.url,
      title: data.title || '未知页面',
      domain: data.domain || '',
      description: data.description || '',
      tags: [],
      contentText: (data.contentText || '').slice(0, 5000)
    });

    // Extract tags in background
    if (data.contentText && data.contentText.length > 200) {
      AI.extractTagsAndCategory(data.contentText, { title: data.title, domain: data.domain }).then(async (result) => {
        if (result && (result.tags.length > 0 || result.category !== '其他')) {
          const db = await openDB();
          const tx = db.transaction('bookmarks', 'readwrite');
          const store = tx.objectStore('bookmarks');
          const getReq = store.get(id);
          getReq.onsuccess = () => {
            const record = getReq.result;
            if (record) {
              record.tags = result.tags;
              record.category = result.category;
              store.put(record);
            }
          };
        }
      }).catch(() => {});
    }

    return { id, saved: true, tagsLoading: true };
  } catch (e) {
    return { error: e.message };
  }
}

async function saveCurrentPage() {
  try {
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return { error: '无法获取当前页面信息' };

    // Check if already bookmarked
    const exists = await Storage.isBookmarked(tab.url);
    if (exists) return { alreadySaved: true, message: '已收藏过该页面' };

    // Try to get content from tracking data
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const visits = await Storage.getVisits({ since: todayStart.getTime() });
    const visit = visits.find(v => v.url === tab.url);

    const contentText = visit ? (visit.contentText || '') : '';
    const domain = tab.url.startsWith('http') ? new URL(tab.url).hostname : '';

    // Save immediately — no waiting for AI
    const id = await Storage.addBookmark({
      url: tab.url,
      title: tab.title || '未知页面',
      domain: domain,
      description: '',
      tags: [],
      contentText: contentText.slice(0, 5000)
    });

    // Extract tags in background (don't await)
    if (contentText.length > 200) {
      AI.extractTagsAndCategory(contentText, { title: tab.title, domain }).then(async (result) => {
        if (result && (result.tags.length > 0 || result.category !== '其他')) {
          const db = await openDB();
          const tx = db.transaction('bookmarks', 'readwrite');
          const store = tx.objectStore('bookmarks');
          const getReq = store.get(id);
          getReq.onsuccess = () => {
            const record = getReq.result;
            if (record) {
              record.tags = result.tags;
              record.category = result.category;
              store.put(record);
            }
          };
        }
      }).catch(() => {});
    }

    return { id, saved: true, title: tab.title, tagsLoading: true };
  } catch (e) {
    return { error: e.message };
  }
}

// --- Sync functions ---

async function syncConnect() {
  try {
    const token = await GDrive.getToken(true);
    if (!token) return { error: '授权失败' };

    // Save connection status
    await Storage.setSetting('sync_enabled', true);

    // Immediately push local data to Drive
    const result = await _doPush();

    return { ok: true, ...result };
  } catch (e) {
    return { error: e.message };
  }
}

async function syncDisconnect() {
  await GDrive.disconnect();
  await Storage.setSetting('sync_enabled', false);
  return { ok: true };
}

async function syncStatus() {
  const enabled = await Storage.getSetting('sync_enabled');
  const connected = await GDrive.isConnected();
  const lastSync = await Storage.getSetting('last_sync_time');
  return {
    enabled: !!enabled,
    connected,
    lastSync: lastSync || null
  };
}

async function syncPush() {
  try {
    const enabled = await Storage.getSetting('sync_enabled');
    if (!enabled) return { error: '同步未启用，请先连接 Google Drive' };
    return await _doPush();
  } catch (e) {
    return { error: e.message };
  }
}

async function _doPush() {
  const data = await _collectLocalData();
  await GDrive.push(data);
  const now = Date.now();
  await Storage.setSetting('last_sync_time', now);
  return { synced: true, time: now };
}

async function syncPull() {
  try {
    const enabled = await Storage.getSetting('sync_enabled');
    if (!enabled) return { error: '同步未启用，请先连接 Google Drive' };

    const remoteData = await GDrive.pull();
    if (!remoteData) return { message: '云端暂无数据' };

    await _mergeRemoteData(remoteData);
    const now = Date.now();
    await Storage.setSetting('last_sync_time', now);
    return { synced: true, time: now };
  } catch (e) {
    return { error: e.message };
  }
}

// Collect all local data for upload
async function _collectLocalData() {
  const visits = await Storage.getVisits({});
  const concepts = await Storage.getConcepts({});
  const relations = await Storage.getRelations({});
  const bookmarks = await Storage.getBookmarks({});
  return {
    version: 3,
    exportedAt: Date.now(),
    visits,
    concepts,
    relations,
    bookmarks
  };
}

// Merge remote data into local (additive merge, no deletes)
async function _mergeRemoteData(remote) {
  if (!remote) return;

  const localVisits = await Storage.getVisits({});
  const localUrls = new Set(localVisits.map(v => v.url + '|' + v.startTime));

  // Merge visits (skip duplicates by url+startTime)
  if (remote.visits) {
    for (const visit of remote.visits) {
      const key = visit.url + '|' + visit.startTime;
      if (!localUrls.has(key)) {
        await Storage.addVisit(visit);
      }
    }
  }

  // Merge concepts
  if (remote.concepts && remote.concepts.length > 0) {
    const localConcepts = await Storage.getConcepts({});
    const localConceptKeys = new Set();
    localConcepts.forEach(c => {
      // We use aggregated format, so check against raw concepts
    });
    // Add all remote concepts (they're raw, not aggregated)
    const rawConcepts = remote.concepts.filter(c => c.visitId); // only raw ones
    if (rawConcepts.length > 0) {
      await Storage.addConcepts(rawConcepts);
    }
  }

  // Merge relations (additive, duplicates are OK for co-occurrence)
  if (remote.relations && remote.relations.length > 0) {
    for (const rel of remote.relations.slice(0, 500)) { // cap to avoid overload
      await Storage.addRelation(rel);
    }
  }

  // Merge bookmarks (skip duplicates by url)
  if (remote.bookmarks && remote.bookmarks.length > 0) {
    for (const bm of remote.bookmarks) {
      const exists = await Storage.isBookmarked(bm.url);
      if (!exists) {
        await Storage.addBookmark(bm);
      }
    }
  }
}

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Set up daily digest alarm (runs at 6am)
chrome.alarms.create('dailyDigest', {
  when: getNext6AM(),
  periodInMinutes: 1440 // 24h
});

// Auto-sync alarm (every hour)
chrome.alarms.create('autoSync', {
  delayInMinutes: 5, // first sync after 5 minutes
  periodInMinutes: 60 // then every hour
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'autoSync') {
    const enabled = await Storage.getSetting('sync_enabled');
    if (enabled) {
      try {
        await _doPush();
        console.log('Auto-sync completed');
      } catch (e) {
        console.warn('Auto-sync failed:', e.message);
      }
    }
  }

  if (alarm.name === 'dailyDigest') {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const visits = await Storage.getVisits({ since: todayStart.getTime() });
      if (visits.length > 0) {
        const digest = await AI.dailyDigest(visits);
        await Storage.setSetting('last_digest', JSON.stringify({
          date: new Date().toISOString(),
          text: digest
        }));
        console.log('Daily digest generated');
      }
    } catch (e) {
      console.warn('Daily digest failed:', e.message);
    }
  }
});

function getNext6AM() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(6, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime();
}

console.log('MindMesh background worker started');
