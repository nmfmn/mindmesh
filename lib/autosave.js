// MindMesh Auto-Save — detects valuable pages and auto-bookmarks

const AutoSave = {
  // Patterns for valuable pages
  GITHUB_REPO_PATTERN: /^https:\/\/github\.com\/[^\/]+\/[^\/]+\/?$/,
  
  // Domains that often have valuable content
  VALUABLE_DOMAINS: [
    'github.com', 'arxiv.org', 'huggingface.co', 'paperswithcode.com',
    'stackoverflow.com', 'dev.to', 'medium.com', 'juejin.cn',
    'zhihu.com', 'v2ex.com', 'reddit.com', 'news.ycombinator.com',
    'producthunt.com', 'npmjs.com', 'pypi.org', 'crates.io'
  ],

  // Check if a page should be auto-saved
  shouldAutoSave(url, title, dwellMs) {
    if (!url || !title) return null;

    // GitHub repo page — always save
    if (this.GITHUB_REPO_PATTERN.test(url)) {
      return { type: 'github', reason: 'GitHub 项目' };
    }

    // Other valuable domains — save if user spent enough time
    try {
      const hostname = new URL(url).hostname.replace('www.', '');
      const isValuable = this.VALUABLE_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
      if (isValuable && dwellMs > 15000) { // at least 15 seconds
        return { type: 'resource', reason: '有价值的资源页面' };
      }
    } catch {}

    return null;
  },

  // Auto-save a page if it's valuable
  async checkAndSave(visitData) {
    const result = this.shouldAutoSave(visitData.url, visitData.title, visitData.dwellMs);
    if (!result) return null;

    // Check if already bookmarked
    const exists = await Storage.isBookmarked(visitData.url);
    if (exists) return null;

    // Save it
    try {
      const id = await Storage.addBookmark({
        url: visitData.url,
        title: visitData.title || '未知页面',
        domain: visitData.domain || '',
        description: result.reason,
        tags: [], // will be extracted later by AI
        contentText: (visitData.contentText || '').slice(0, 5000),
        autoSaved: true,
        autoSaveType: result.type
      });
      return { id, type: result.type, title: visitData.title };
    } catch (e) {
      console.warn('Auto-save failed:', e.message);
      return null;
    }
  }
};
