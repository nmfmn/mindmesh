# MindMesh Browser Extension — Implementation Plan

> **For Hermes:** Implement task-by-task, no delegation needed for this scope.

**Goal:** Build a Chrome extension that silently tracks reading behavior (dwell time, scroll, revisit) and provides an AI research agent (topic → search → synthesize → cited report), with all data stored locally.

**Architecture:** Chrome Extension Manifest V3. Content script tracks pages and injects side panel. Service worker handles AI API calls. IndexedDB for local storage. User brings their own OpenAI-compatible API key.

**Tech Stack:** Vanilla JS (no framework needed for this scope), IndexedDB (via idb wrapper), marked.js (markdown rendering), Chrome Side Panel API.

---

## Task 1: Create project scaffold

**Objective:** Set up the extension directory structure and manifest.json

**Files:**
- Create: `~/mindmesh/manifest.json`
- Create: `~/mindmesh/background.js`
- Create: `~/mindmesh/content.js`
- Create: `~/mindmesh/sidepanel.html`
- Create: `~/mindmesh/sidepanel.js`
- Create: `~/mindmesh/styles.css`
- Create: `~/mindmesh/lib/storage.js`
- Create: `~/mindmesh/lib/ai.js`
- Create: `~/mindmesh/lib/tracker.js`
- Create: `~/mindmesh/icons/` directory

**Step 1: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "MindMesh",
  "version": "0.1.0",
  "description": "AI research companion — tracks what you read and helps you research",
  "permissions": ["storage", "sidePanel", "activeTab", "tabs", "alarms"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }],
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "action": {
    "default_title": "MindMesh",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

**Step 2: Create placeholder files**

Each file just gets a comment header. We'll fill in later tasks.

---

## Task 2: Build IndexedDB storage layer

**Objective:** Create a wrapper for CRUD operations on page visits and research notes.

**Files:**
- Modify: `~/mindmesh/lib/storage.js`

**Database schema:**

```
visits:
  id (autoIncrement), url, title, domain, startTime, endTime,
  dwellMs, scrollDepth, scrollMax, contentText, summary, tags, isRead

research:
  id (autoIncrement), query, report, sources (JSON), createdAt

settings:
  key (primary), value
```

**Complete code for lib/storage.js:**

```javascript
// MindMesh Storage — IndexedDB wrapper

const DB_NAME = 'mindmesh';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('visits')) {
        const visits = db.createObjectStore('visits', { keyPath: 'id', autoIncrement: true });
        visits.createIndex('url', 'url', { unique: false });
        visits.createIndex('domain', 'domain', { unique: false });
        visits.createIndex('startTime', 'startTime', { unique: false });
      }
      if (!db.objectStoreNames.contains('research')) {
        db.createObjectStore('research', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

const Storage = {
  // --- Visits ---
  async addVisit(visit) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('visits', 'readwrite');
      const store = tx.objectStore('visits');
      const req = store.add({
        ...visit,
        startTime: visit.startTime || Date.now()
      });
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async updateVisit(id, updates) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('visits', 'readwrite');
      const store = tx.objectStore('visits');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const record = getReq.result;
        if (!record) return reject(new Error('Visit not found'));
        Object.assign(record, updates);
        store.put(record).onsuccess = () => resolve(record);
      };
      getReq.onerror = (e) => reject(e.target.error);
    });
  },

  async getVisits(options = {}) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('visits', 'readonly');
      const store = tx.objectStore('visits');
      const req = store.getAll();
      req.onsuccess = () => {
        let results = req.result;
        if (options.domain) results = results.filter(v => v.domain === options.domain);
        if (options.since) results = results.filter(v => v.startTime >= options.since);
        results.sort((a, b) => b.startTime - a.startTime);
        if (options.limit) results = results.slice(0, options.limit);
        resolve(results);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async getVisitByUrl(url) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('visits', 'readonly');
      const store = tx.objectStore('visits');
      const idx = store.index('url');
      const req = idx.getAll(url);
      req.onsuccess = () => {
        const results = req.result;
        resolve(results.length > 0 ? results[results.length - 1] : null);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  },

  // --- Research ---
  async saveResearch(research) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('research', 'readwrite');
      const store = tx.objectStore('research');
      const req = store.add({ ...research, createdAt: Date.now() });
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async getResearch(options = {}) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('research', 'readonly');
      const store = tx.objectStore('research');
      const req = store.getAll();
      req.onsuccess = () => {
        let results = req.result;
        results.sort((a, b) => b.createdAt - a.createdAt);
        if (options.limit) results = results.slice(0, options.limit);
        resolve(results);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  },

  // --- Settings ---
  async getSetting(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async setSetting(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      store.put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  },

  async clearAll() {
    const db = await openDB();
    const stores = ['visits', 'research', 'settings'];
    for (const name of stores) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(name, 'readwrite');
        tx.objectStore(name).clear();
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
    }
  }
};
```

---

## Task 3: Build AI client

**Objective:** Create an OpenAI-compatible API client for summarization and research.

**Files:**
- Modify: `~/mindmesh/lib/ai.js`

**Complete code:**

```javascript
// MindMesh AI — OpenAI-compatible API client

const AI = {
  async getConfig() {
    const apiKey = await Storage.getSetting('api_key');
    const baseUrl = await Storage.getSetting('api_url') || 'https://api.openai.com/v1';
    const model = await Storage.getSetting('model') || 'gpt-4o-mini';
    return { apiKey, baseUrl, model };
  },

  async chat(messages, options = {}) {
    const { apiKey, baseUrl, model } = await this.getConfig();
    if (!apiKey) throw new Error('请先在设置中配置 API Key');

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: options.model || model,
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.max_tokens || 4096
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`AI API 错误 (${res.status}): ${err}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
  },

  async summarize(text, context = {}) {
    const prompt = `你是一个知识提炼助手。请用中文总结以下网页内容，提取核心观点：

标题：${context.title || '未知'}
域名：${context.domain || '未知'}

要求：
1. 3-5个要点，每个要点一句话
2. 如果有数据、引文，标注来源
3. 标注 2-3 个关键概念/术语

内容：
${text.slice(0, 15000)}`;

    return this.chat([
      { role: 'system', content: '你是一个高效的知识提炼助手，用中文回复。' },
      { role: 'user', content: prompt }
    ]);
  },

  async dailyDigest(visits) {
    const pages = visits.map(v =>
      `- [${v.title}](${v.url}) — 驻留 ${Math.round(v.dwellMs/60000)}分钟`
    ).join('\n');

    const prompt = `你是一个知识管理助手。以下是用户今天阅读的网页列表，请生成一份每日文摘：

${pages}

要求：
1. 标题：《今日阅读 · 文摘》
2. 总览：阅读了 N 个页面，覆盖哪些领域
3. 核心洞察：今天的内容有什么跨领域的联系或共同主题
4. 新概念：列出 2-4 个今天遇到的重要概念/术语，附简短解释
5. 未完成：如果有明显没读完的页面（驻留时间短），提醒用户

用中文回复，保持简洁，3分钟可读完。`;

    return this.chat([
      { role: 'system', content: '你是一个知识管理助手，用中文生成阅读文摘。' },
      { role: 'user', content: prompt }
    ]);
  },

  async researchAgent(query) {
    const systemPrompt = `你是一个研究助手。给定一个课题，你需要：

1. **分解** — 把课题拆成 3-4 个子问题
2. **综述** — 对每个子问题，综合已知知识给出概述
3. **观点对比** — 如果有不同学术/行业观点，列出并对比
4. **引用** — 标注关键信息来源（论文、文章、书籍）
5. **结论** — 总结核心发现和开放问题

用中文回复，结构化输出。`;

    return this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `研究课题：${query}` }
    ], { max_tokens: 8192 });
  },

  async searchAndResearch(query) {
    // First do web search via background, then synthesize
    return this.researchAgent(query);
  }
};
```

---

## Task 4: Build page tracker (content script)

**Objective:** Inject into every page to track dwell time, scroll depth, and extract content.

**Files:**
- Modify: `~/mindmesh/lib/tracker.js`
- Modify: `~/mindmesh/content.js`

**lib/tracker.js:**

```javascript
// MindMesh Tracker — page dwell & scroll tracking

class PageTracker {
  constructor() {
    this.startTime = Date.now();
    this.maxScroll = 0;
    this.lastActive = Date.now();
    this.totalActiveTime = 0;
    this.isActive = true;
    this.pageId = null;
    this.observer = null;
  }

  init() {
    // Track scroll depth
    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY + window.innerHeight;
      const docHeight = document.documentElement.scrollHeight;
      const pct = Math.round((scrollY / docHeight) * 100);
      if (pct > this.maxScroll) this.maxScroll = Math.min(pct, 100);
    }, { passive: true });

    // Track visibility (tab active/inactive)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.isActive = false;
        this.totalActiveTime += Date.now() - this.lastActive;
      } else {
        this.lastActive = Date.now();
        this.isActive = true;
      }
    });

    // Save interval — periodically flush to storage
    setInterval(() => this.save(), 15000);
  }

  getStats() {
    if (this.isActive) {
      this.totalActiveTime += Date.now() - this.lastActive;
      this.lastActive = Date.now();
    }
    return {
      dwellMs: this.totalActiveTime,
      scrollMax: this.maxScroll,
      startTime: this.startTime
    };
  }

  extractContent() {
    // Extract main text content (heuristic)
    const article = document.querySelector('article') ||
                    document.querySelector('main') ||
                    document.querySelector('.content') ||
                    document.querySelector('#content') ||
                    document.body;

    // Remove scripts, styles, nav, footer
    const clone = article.cloneNode(true);
    clone.querySelectorAll('script, style, nav, footer, header, .sidebar, .nav, .menu, .ad, .advertisement, [role="navigation"]').forEach(el => el.remove());

    const text = clone.textContent.replace(/\s+/g, ' ').trim();
    return text.slice(0, 20000); // cap at 20k chars
  }

  async save() {
    const stats = this.getStats();
    const content = this.extractContent();

    chrome.runtime.sendMessage({
      action: 'trackPage',
      data: {
        url: window.location.href,
        title: document.title,
        domain: window.location.hostname,
        ...stats,
        contentText: content,
        scrollDepth: stats.scrollMax
      }
    });
  }

  destroy() {
    if (this.observer) this.observer.disconnect();
  }
}

// Auto-init
const tracker = new PageTracker();
tracker.init();
```

**content.js:**

```javascript
// MindMesh Content Script
(async function() {
  const src = chrome.runtime.getURL('lib/tracker.js');
  await import(src);
})();
```

Wait — Chrome MV3 content scripts can't use dynamic imports for scripts bundled with the extension. Let me fix this approach. The tracker code should be inlined or bundled.

**Revised approach:** Put tracker code directly in content.js, or use a single bundled file.

---

## Task 5: Build background service worker

**Objective:** Handle messages from content script and side panel, manage AI calls.

**Files:**
- Modify: `~/mindmesh/background.js`

---

## Task 6: Build side panel UI

**Objective:** Create the main interface for research, reading history, and settings.

**Files:**
- Modify: `~/mindmesh/sidepanel.html`
- Modify: `~/mindmesh/sidepanel.js`
- Modify: `~/mindmesh/styles.css`

---

## Task 7: Generate icons

**Objective:** Create simple 16/48/128 icons for the extension.

---

## Task 8: Integration test & load extension

**Objective:** Verify the extension works end-to-end.

---

## Notes

- No build tools — pure vanilla JS for simplicity
- All AI calls go through background service worker (CORS bypass)
- Page content capped at 20k chars to avoid overload
- Dwell time tracks only active tab time (respects visibilitychange)
