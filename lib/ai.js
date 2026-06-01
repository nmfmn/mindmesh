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
      `- [${v.title}](${v.url}) — 驻留 ${Math.round((v.dwellMs || 0) / 60000)}分钟`
    ).join('\n');

    const prompt = `你是一个知识管理助手。以下是用户今天阅读的网页列表，请生成一份每日文摘：

${pages}

要求：
1. 标题：《今日阅读 · 文摘》
2. 总览：阅读了 N 个页面，覆盖哪些领域
3. 核心洞察：今天的内容有什么跨领域的联系或共同主题
4. 新概念：列出 2-4 个今天遇到的重要概念/术语，附简短解释
5. 未完成：如果有明显没读完的页面，提醒用户

用中文回复，保持简洁，3分钟可读完。`;

    return this.chat([
      { role: 'system', content: '你是一个知识管理助手，用中文生成阅读文摘。' },
      { role: 'user', content: prompt }
    ]);
  },

  // Extract tags from page content for bookmarking
  async extractTags(text, context = {}) {
    try {
      const result = await this.extractTagsAndCategory(text, context);
      return result.tags;
    } catch {
      return [];
    }
  },
  // Extract tags and category together (one AI call, more efficient)
  async extractTagsAndCategory(text, context = {}) {
    const CATEGORIES = [
      '后端技术', '前端/Web', '移动开发', '设计/UI',
      'AI/ML', 'DevOps/工具', '产品/灵感', '学习/教程', '其他'
    ];
    try {
      const prompt = `从以下网页内容中提取标签和分类。

标题：${context.title || '未知'}
域名：${context.domain || '未知'}
内容片段：${text.slice(0, 3000)}

要求：
1. 提取 3-5 个简短标签（中文或英文）
2. 从以下分类中选择最匹配的一个：${CATEGORIES.join('、')}

严格用 JSON 格式输出，只输出 JSON，不要其他文字。
示例：{"tags":["机器学习","Python","教程"],"category":"AI/ML"}`;

      const result = await this.chat([
        { role: 'system', content: '只输出 JSON 对象，包含 tags 数组和 category 字符串。' },
        { role: 'user', content: prompt }
      ], { temperature: 0.1 });

      const match = result.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          tags: Array.isArray(parsed.tags) ? parsed.tags : [],
          category: CATEGORIES.includes(parsed.category) ? parsed.category : '其他'
        };
      }
      return { tags: [], category: '其他' };
    } catch {
      return { tags: [], category: '其他' };
    }
  },

  // Extract key concepts from page content
  async extractConcepts(text, context = {}) {
    const prompt = `从以下网页内容中提取关键概念、术语、人物、理论或技术。

标题：${context.title || '未知'}
域名：${context.domain || '未知'}

内容（片段）：
${text.slice(0, 8000)}

要求：
1. 提取 5-10 个最重要的概念/术语/人物/理论
2. 每个概念给出一句话中文解释
3. 严格用 JSON 数组格式输出，每项包含 name 和 description 字段
4. name 用中文或中英混合（如"机器学习"或"Transformer模型"）
5. 只输出 JSON，不要其他文字

示例输出：
[{"name":"注意力机制","description":"一种让模型关注输入中最相关部分的技术"},{"name":"自监督学习","description":"无需人工标注标签的机器学习范式"}]`;

    const result = await this.chat([
      { role: 'system', content: '你是一个知识提取助手。只输出 JSON 数组，不要任何其他文字。' },
      { role: 'user', content: prompt }
    ], { temperature: 0.2 });

    // Parse JSON from response
    try {
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    } catch {
      return [];
    }
  },

  // Serendipity: find related readings from history
  async findSerendipity(query, readings) {
    if (readings.length === 0) return [];

    const readingList = readings.map((v, i) =>
      `${i}. [${v.title}](${v.url}) — 域名: ${v.domain}, 驻留: ${Math.round((v.dwellMs||0)/60000)}分钟`
    ).join('\n');

    const prompt = `用户正在研究以下课题：
"${query}"

以下是用户历史阅读记录：
${readingList}

请从中找出与研究课题最相关的文章（最多5篇），按相关度排序。

严格用 JSON 数组格式输出，每项包含 index（对应上面的编号，从0开始）和 reason（一句话说明为什么相关）字段。
只输出 JSON，不要其他文字。

示例输出：
[{"index":2,"reason":"该文章详细讨论了课题的核心理论"},{"index":5,"reason":"提供了实际应用案例"}]`;

    const result = await this.chat([
      { role: 'system', content: '你是一个知识关联助手。只输出 JSON 数组，不要任何其他文字。' },
      { role: 'user', content: prompt }
    ], { temperature: 0.2 });

    try {
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];
      const indices = JSON.parse(jsonMatch[0]);
      return indices
        .filter(item => item.index >= 0 && item.index < readings.length)
        .map(item => ({
          ...readings[item.index],
          reason: item.reason
        }));
    } catch {
      return [];
    }
  }
};
