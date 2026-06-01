// MindMesh Storage — IndexedDB wrapper
const DB_NAME = 'mindmesh';
const DB_VERSION = 3;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // v1 stores
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

      // v2 stores — knowledge graph
      if (!db.objectStoreNames.contains('concepts')) {
        const concepts = db.createObjectStore('concepts', { keyPath: 'id', autoIncrement: true });
        concepts.createIndex('name', 'name', { unique: false });
        concepts.createIndex('domain', 'domain', { unique: false });
        concepts.createIndex('visitId', 'visitId', { unique: false });
      }
      if (!db.objectStoreNames.contains('relations')) {
        const relations = db.createObjectStore('relations', { keyPath: 'id', autoIncrement: true });
        relations.createIndex('sourceId', 'sourceId', { unique: false });
        relations.createIndex('targetId', 'targetId', { unique: false });
        relations.createIndex('type', 'type', { unique: false });
      }
      if (!db.objectStoreNames.contains('bookmarks')) {
        const bm = db.createObjectStore('bookmarks', { keyPath: 'id', autoIncrement: true });
        bm.createIndex('url', 'url', { unique: false });
        bm.createIndex('domain', 'domain', { unique: false });
        bm.createIndex('savedAt', 'savedAt', { unique: false });
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
      const req = store.add({ ...visit, startTime: visit.startTime || Date.now() });
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
        if (options.ids) {
          const idSet = new Set(options.ids);
          results = results.filter(v => idSet.has(v.id));
        }
        results.sort((a, b) => b.startTime - a.startTime);
        if (options.limit) results = results.slice(0, options.limit);
        resolve(results);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async getVisit(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('visits', 'readonly');
      const req = tx.objectStore('visits').get(id);
      req.onsuccess = () => resolve(req.result || null);
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

  async deleteResearch(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('research', 'readwrite');
      const req = tx.objectStore('research').delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  // --- Concepts (Knowledge Graph nodes) ---
  async addConcepts(conceptList) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('concepts', 'readwrite');
      const store = tx.objectStore('concepts');
      const ids = [];
      let pending = conceptList.length;
      if (pending === 0) return resolve([]);
      conceptList.forEach(c => {
        const req = store.add(c);
        req.onsuccess = (e) => {
          ids.push(e.target.result);
          if (--pending === 0) resolve(ids);
        };
        req.onerror = (e) => { pending--; if (pending === 0) resolve(ids); };
      });
    });
  },

  async getConcepts(options = {}) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('concepts', 'readonly');
      const store = tx.objectStore('concepts');
      const req = store.getAll();
      req.onsuccess = () => {
        let results = req.result;
        if (options.visitId) results = results.filter(c => c.visitId === options.visitId);
        if (options.search) {
          const q = options.search.toLowerCase();
          results = results.filter(c => c.name.toLowerCase().includes(q));
        }
        // Count occurrences of each concept name
        const counts = {};
        results.forEach(c => {
          const key = c.name.toLowerCase();
          if (!counts[key]) {
            counts[key] = { name: c.name, count: 0, descriptions: [], domains: new Set(), ids: [] };
          }
          counts[key].count++;
          if (c.description) counts[key].descriptions.push(c.description);
          if (c.domain) counts[key].domains.add(c.domain);
          counts[key].ids.push(c.id);
        });

        // Convert to array and sort by frequency
        const aggregated = Object.values(counts).map(c => ({
          name: c.name,
          count: c.count,
          description: c.descriptions[0] || '',
          domains: [...c.domains],
          ids: c.ids
        }));
        aggregated.sort((a, b) => b.count - a.count);

        if (options.limit) return resolve(aggregated.slice(0, options.limit));
        resolve(aggregated);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async deleteConceptsByVisitId(visitId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('concepts', 'readwrite');
      const store = tx.objectStore('concepts');
      const idx = store.index('visitId');
      const req = idx.getAll(visitId);
      req.onsuccess = () => {
        const ids = req.result.map(c => c.id);
        let pending = ids.length;
        if (pending === 0) return resolve(0);
        ids.forEach(id => {
          const del = store.delete(id);
          del.onsuccess = () => { if (--pending === 0) resolve(ids.length); };
          del.onerror = () => { if (--pending === 0) resolve(ids.length); };
        });
      };
      req.onerror = (e) => reject(e.target.error);
    });
  },

  // --- Relations (Knowledge Graph edges) ---
  async addRelation(relation) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('relations', 'readwrite');
      const req = tx.objectStore('relations').add(relation);
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async getRelations(options = {}) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('relations', 'readonly');
      const store = tx.objectStore('relations');
      const req = store.getAll();
      req.onsuccess = () => {
        let results = req.result;
        if (options.sourceId) results = results.filter(r => r.sourceId === options.sourceId);
        if (options.targetId) results = results.filter(r => r.targetId === options.targetId);
        if (options.type) results = results.filter(r => r.type === options.type);
        resolve(results);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  },

  // --- Bookmarks ---
  async addBookmark(bookmark) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('bookmarks', 'readwrite');
      const store = tx.objectStore('bookmarks');
      const req = store.add({ ...bookmark, savedAt: bookmark.savedAt || Date.now() });
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async getBookmarks(options = {}) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('bookmarks', 'readonly');
      const store = tx.objectStore('bookmarks');
      const req = store.getAll();
      req.onsuccess = () => {
        let results = req.result;
        results.sort((a, b) => b.savedAt - a.savedAt);
        if (options.search) {
          const q = options.search.toLowerCase();
          results = results.filter(bm =>
            (bm.title && bm.title.toLowerCase().includes(q)) ||
            (bm.url && bm.url.toLowerCase().includes(q)) ||
            (bm.domain && bm.domain.toLowerCase().includes(q)) ||
            (bm.description && bm.description.toLowerCase().includes(q)) ||
            (bm.tags && bm.tags.some(t => t.toLowerCase().includes(q))) ||
            (bm.contentText && bm.contentText.toLowerCase().includes(q))
          );
        }
        if (options.limit) results = results.slice(0, options.limit);
        resolve(results);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async deleteBookmark(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('bookmarks', 'readwrite');
      const req = tx.objectStore('bookmarks').delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async isBookmarked(url) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('bookmarks', 'readonly');
      const store = tx.objectStore('bookmarks');
      const idx = store.index('url');
      const req = idx.getAll(url);
      req.onsuccess = () => resolve(req.result.length > 0);
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
    const stores = ['visits', 'research', 'settings', 'concepts', 'relations', 'bookmarks'];
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
