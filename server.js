const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const PASSWORD = (process.env.PASSWORD || '').trim();
const SESSION_SECRET = crypto
  .createHash('sha256')
  .update(PASSWORD || '4k-scout-default-secret')
  .digest('hex');

// v3.0 默认预置：全球 4K 原盘 JSON 引擎 + 10 大网盘/4K 频道与需登录论坛支持
const DEFAULT_SITES = [
  {
    id: 'api-tpb4k',
    name: '全球4K原盘/REMUX库 (免盾直连)',
    type: 'tpb_api',
    url: 'https://apibay.org/q.php?q={kw}&cat=200',
    enabled: true,
    cookie: '',
    note: '内置API · 经典老片/纪录片 4K UHD/REMUX 100%命中，带精确GB大小'
  },
  {
    id: 'api-yts4k',
    name: 'YTS 4K蓝光电影库 (免盾直连)',
    type: 'yts_api',
    url: 'https://yts.mx/api/v2/list_movies.json?query_term={kw}&quality=2160p',
    enabled: true,
    cookie: '',
    note: '内置API · 经典欧美大片 2160p 4K 蓝光压制，带精确GB大小'
  },
  {
    id: 'tg-dianying4k',
    name: '4K影视屋 (蓝光无损)',
    type: 'tg',
    url: 'https://t.me/s/dianying4k',
    enabled: true,
    cookie: '',
    note: 'TG频道 · 4K原盘/115/迅雷/夸克'
  },
  {
    id: 'tg-yunpanxunlei',
    name: '迅雷4K原盘频道',
    type: 'tg',
    url: 'https://t.me/s/yunpanxunlei',
    enabled: true,
    cookie: '',
    note: 'TG频道 · 迅雷网盘4K高码率'
  },
  {
    id: 'tg-yunpan189',
    name: '天翼云盘4K频道',
    type: 'tg',
    url: 'https://t.me/s/yunpan189',
    enabled: true,
    cookie: '',
    note: 'TG频道 · 天翼云盘不限速4K'
  },
  {
    id: 'tg-quarkmovies',
    name: 'Quark夸克4K影视库',
    type: 'tg',
    url: 'https://t.me/s/Quark_Movies',
    enabled: true,
    cookie: '',
    note: 'TG频道 · 夸克网盘电影剧集'
  },
  {
    id: 'tg-115shares',
    name: '115原盘分享频道',
    type: 'tg',
    url: 'https://t.me/s/Channel_Shares_115',
    enabled: true,
    cookie: '',
    note: 'TG频道 · 115蓝光原盘/ISO'
  },
  {
    id: 'tg-pikpak',
    name: 'PikPak/磁力原盘频道',
    type: 'tg',
    url: 'https://t.me/s/PikPak_Share_Channel',
    enabled: true,
    cookie: '',
    note: 'TG频道 · 磁力与原盘资源'
  },
  {
    id: 'tg-yunpans',
    name: '夸克影视资源频道',
    type: 'tg',
    url: 'https://t.me/s/yunpans',
    enabled: true,
    cookie: '',
    note: 'TG频道 · 夸克网盘影视'
  },
  {
    id: 'tg-tgsearchers4',
    name: 'TG全网盘聚合4号',
    type: 'tg',
    url: 'https://t.me/s/tgsearchers4',
    enabled: true,
    cookie: '',
    note: 'TG频道 · 多网盘综合检索'
  },
  {
    id: 'web-leijing',
    name: '雷鲸小站 (天翼4K论坛)',
    type: 'web',
    url: 'https://www.leijing.xyz/index?keyword={kw}',
    loginUrl: 'https://www.leijing.xyz/user-login.htm',
    enabled: true,
    cookie: '',
    note: '支持在『登录凭证』中绑定账号Cookie解锁隐藏帖'
  },
  {
    id: 'web-yiove',
    name: 'YiOVE综合4K资源区',
    type: 'web',
    url: 'https://bbs.yiove.com/search-{kw}-1.htm',
    loginUrl: 'https://bbs.yiove.com/user-login.htm',
    enabled: true,
    cookie: '',
    note: '支持绑定登录Cookie抓取帖子内迅雷/天翼/阿里链接'
  }
];

function getInitialSites() {
  if (process.env.CUSTOM_SITES) {
    try {
      const parsed = JSON.parse(process.env.CUSTOM_SITES);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      console.error('CUSTOM_SITES JSON 解析失败，使用默认站点:', e.message);
    }
  }
  return DEFAULT_SITES.map((s) => ({ ...s }));
}

let runtimeSites = getInitialSites();

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

// 经典影视与纪录片常见中英对照速查表（兜底加速）+ 在线豆瓣/iTunes 自动中英互译
const BUILTIN_BILINGUAL_MAP = {
  '泰坦尼克号': 'Titanic',
  '创战纪': 'TRON Legacy',
  '创：战纪': 'TRON Legacy',
  '疾速追杀': 'John Wick',
  '地球脉动': 'Planet Earth',
  '蓝色星球': 'Blue Planet',
  '星际穿越': 'Interstellar',
  '盗梦空间': 'Inception',
  '奥本海默': 'Oppenheimer',
  '沙丘': 'Dune',
  '沙丘2': 'Dune Part Two',
  '阿凡达': 'Avatar',
  '复仇者联盟': 'Avengers',
  '指环王': 'Lord of the Rings',
  '霍比特人': 'The Hobbit',
  '黑客帝国': 'The Matrix',
  '银翼杀手': 'Blade Runner',
  '教父': 'The Godfather',
  '肖申克的救赎': 'The Shawshank Redemption',
  '蝙蝠侠': 'The Dark Knight',
  '哈利波特': 'Harry Potter',
  '变形金刚': 'Transformers',
  '速度与激情': 'Fast and Furious',
  '碟中谍': 'Mission Impossible',
  '异形': 'Alien',
  '终结者': 'Terminator',
  '疯狂的麦克斯': 'Mad Max',
  '权力的游戏': 'Game of Thrones',
  '绝命毒师': 'Breaking Bad',
  '切尔诺贝利': 'Chernobyl',
  '兄弟连': 'Band of Brothers'
};

// 自动解析中英文双语片名（输入中文自动补英文原名，输入英文自动补中文名）
async function resolveBilingualKeywords(kw) {
  const cleanKw = kw.trim();
  const kwSet = new Set([cleanKw]);

  // 1. 检查内置高频字典
  for (const [zh, en] of Object.entries(BUILTIN_BILINGUAL_MAP)) {
    if (cleanKw.includes(zh)) kwSet.add(cleanKw.replace(zh, en).trim());
    if (cleanKw.toLowerCase() === en.toLowerCase()) kwSet.add(zh);
  }

  // 2. 在线查询豆瓣 Suggest 接口获取原名 (sub_title) 与中文名 (title)
  try {
    const doubanUrl = `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(cleanKw)}`;
    const txt = await fetchText(doubanUrl, 3500, {
      Referer: 'https://movie.douban.com/'
    });
    const arr = JSON.parse(txt);
    if (Array.isArray(arr) && arr.length > 0) {
      const top = arr[0];
      if (top.title) kwSet.add(top.title.trim());
      if (top.sub_title && /[a-zA-Z]{2,}/.test(top.sub_title)) {
        kwSet.add(top.sub_title.trim());
      }
    }
  } catch {}

  // 3. 若仍只有中文，尝试 iTunes Search API 兜底查英文原名
  if ([...kwSet].every((k) => !/[a-zA-Z]{2,}/.test(k))) {
    try {
      const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanKw)}& media=movie&limit=2`;
      const txt = await fetchText(itunesUrl, 3000);
      const data = JSON.parse(txt);
      if (data.results && data.results[0] && data.results[0].trackName) {
        kwSet.add(data.results[0].trackName.trim());
      }
    } catch {}
  }

  const allKws = [...kwSet].filter(Boolean);
  const enKw = allKws.find((k) => /[a-zA-Z]{2,}/.test(k)) || cleanKw;
  const zhKw = allKws.find((k) => /[\u4e00-\u9fa5]/.test(k)) || cleanKw;
  return { allKws, enKw, zhKw };
}

// 网盘 + 磁力链接识别正则
const PAN_PATTERNS = [
  { pan: '迅雷', color: '#2563eb', regex: /https?:\/\/pan\.xunlei\.com\/s\/[A-Za-z0-9_-]+(?:\?pwd=[A-Za-z0-9]+)?/gi },
  { pan: '天翼', color: '#ea580c', regex: /https?:\/\/cloud\.189\.cn\/(?:t|web\/share)\/[A-Za-z0-9]+(?:\?[^\s"'<>]+)?/gi },
  { pan: '夸克', color: '#7c3aed', regex: /https?:\/\/pan\.quark\.cn\/s\/[A-Za-z0-9]+(?:#\/list\/share)?/gi },
  { pan: '阿里', color: '#d97706', regex: /https?:\/\/(?:www\.)?(?:alipan|aliyundrive)\.com\/s\/[A-Za-z0-9]+/gi },
  { pan: '115', color: '#0891b2', regex: /https?:\/\/(?:115|115cdn)\.com\/s\/[A-Za-z0-9]+(?:\?password=[A-Za-z0-9]+)?/gi },
  { pan: '123', color: '#059669', regex: /https?:\/\/(?:www\.)?123(?:pan|684|865)\.com\/s\/[A-Za-z0-9-]+/gi },
  { pan: '百度', color: '#dc2626', regex: /https?:\/\/pan\.baidu\.com\/s\/[A-Za-z0-9_-]+(?:\?pwd=[A-Za-z0-9]+)?/gi },
  { pan: 'PikPak', color: '#0284c7', regex: /https?:\/\/mypikpak\.com\/s\/[A-Za-z0-9_-]+/gi },
  { pan: '磁力', color: '#4f46e5', regex: /magnet:\?xt=urn:btih:[A-Za-z0-9]{32,40}[^\s"'<>]*/gi }
];

const NOISE_REGEX = /\.(?:epub|mobi|azw3|pdf|exe|apk|dmg)\b|电子书|有声书|网盘课程|教程合集|考研|考公|字体包|壁纸包/i;

function isNoisePost(title, kw) {
  if (NOISE_REGEX.test(kw)) return false;
  return NOISE_REGEX.test(title);
}

function formatBytesToSize(bytes) {
  const num = Number(bytes);
  if (!num || num <= 0) return { sizeText: '未知大小', sizeMB: 0 };
  const mb = num / (1024 * 1024);
  if (mb >= 1024) {
    return { sizeText: `${(mb / 1024).toFixed(2)}GB`, sizeMB: Math.round(mb) };
  }
  return { sizeText: `${Math.round(mb)}MB`, sizeMB: Math.round(mb) };
}

function extractSizeInfo(text, rawUrls = []) {
  let bestMB = 0;
  let bestText = '未知大小';

  if (text) {
    const matches = [...text.matchAll(/(\d+(?:\.\d{1,2})?)\s*(TB|T|GB|GiB|G|MB|MiB|M)\b/gi)];
    for (const m of matches) {
      const val = parseFloat(m[1]);
      const unit = m[2].toUpperCase();
      let mb = 0;
      if (unit.startsWith('T')) mb = val * 1024 * 1024;
      else if (unit.startsWith('G')) mb = val * 1024;
      else mb = val;

      if (mb > bestMB && mb >= 100 && mb <= 80 * 1024 * 1024) {
        bestMB = mb;
        const normUnit = unit.startsWith('T') ? 'TB' : unit.startsWith('G') ? 'GB' : 'MB';
        bestText = `${val}${normUnit}`;
      }
    }
  }

  if (bestMB === 0 && rawUrls.length > 0) {
    for (const u of rawUrls) {
      const xlMatch = u.match(/[?&]xl=(\d+)/i);
      if (xlMatch) {
        return formatBytesToSize(xlMatch[1]);
      }
    }
  }

  return { sizeText: bestText, sizeMB: Math.round(bestMB) };
}

function extractQualityTags(text) {
  const tags = [];
  const rules = [
    ['4K/2160P', /4K|2160[pP]|UHD/i],
    ['原盘/REMUX', /原盘|REMUX|BDMV|ISO|BluRay|Blu-ray|蓝光/i],
    ['杜比视界', /杜比|Dolby|DV\b|DoVi/i],
    ['HDR', /HDR10?\+?/i],
    ['高码率', /高码|HQ|60FPS|10bit|HEVC|x265/i]
  ];
  for (const [label, re] of rules) {
    if (re.test(text)) tags.push(label);
  }
  return tags;
}

function extractPanLinks(text) {
  const found = [];
  const seen = new Set();
  for (const { pan, color, regex } of PAN_PATTERNS) {
    const matches = text.match(regex) || [];
    for (const rawUrl of matches) {
      const cleanUrl = rawUrl.replace(/["'<>)\]]+$/, '');
      if (!seen.has(cleanUrl)) {
        seen.add(cleanUrl);
        found.push({ pan, color, url: cleanUrl });
      }
    }
  }
  const pwdMatch = text.match(/(?:提取码|访问码|密码|pwd)[：:\s]*([A-Za-z0-9]{4})/i);
  return { links: found, pwd: pwdMatch ? pwdMatch[1] : '' };
}

function calcRelevanceScore(title, body, kws, sizeMB, tags) {
  const titleLower = title.toLowerCase();
  const bodyLower = body.toLowerCase();
  let score = 0;

  for (const k of kws) {
    const kl = k.toLowerCase();
    if (titleLower.includes(kl)) {
      score = Math.max(score, 100);
    } else {
      const tokens = kl.split(/[\s:：·-]+/).filter((t) => t.length >= 2);
      if (tokens.length > 0) {
        const hit = tokens.filter((t) => titleLower.includes(t)).length;
        if (hit > 0) score = Math.max(score, Math.round(75 * (hit / tokens.length)));
      }
      if (score === 0 && bodyLower.includes(kl)) score = Math.max(score, 25);
    }
  }

  if (tags.length > 0) score += tags.length * 15;
  if (sizeMB >= 15360) score += 35;
  else if (sizeMB >= 4096) score += 20;
  else if (sizeMB > 0) score += 10;
  return score;
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

async function fetchText(targetUrl, timeoutMs = 10000, customHeaders = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/json,text/plain,*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      ...customHeaders
    };
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers,
      redirect: 'follow'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// 引擎 A：全球 4K 原盘 / REMUX 免盾 JSON 接口 (apibay)
async function searchTpbApi(site, bi) {
  const queries = [
    `${bi.enKw} 2160p`,
    bi.enKw !== bi.zhKw ? `${bi.zhKw} 2160p` : `${bi.enKw} 4K`
  ];
  const results = [];
  const seenHash = new Set();

  for (const q of queries) {
    try {
      const apiUrl = `https://apibay.org/q.php?q=${encodeURIComponent(q)}&cat=200`;
      const raw = await fetchText(apiUrl, 9000);
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) continue;

      for (const item of list) {
        if (!item || !item.info_hash || item.id === '0' || item.name === 'No results returned') continue;
        if (seenHash.has(item.info_hash)) continue;
        seenHash.add(item.info_hash);

        const title = item.name;
        const { sizeText, sizeMB } = formatBytesToSize(item.size);
        const magnet = `magnet:?xt=urn:btih:${item.info_hash}&dn=${encodeURIComponent(title)}&xl=${item.size}`;
        const tags = extractQualityTags(title);
        if (tags.length === 0 && sizeMB >= 10240) tags.push('大体积原盘');

        const seeds = Number(item.seeders) || 0;
        const score = calcRelevanceScore(title, title, bi.allKws, sizeMB, tags) + Math.min(20, Math.floor(seeds / 5));

        results.push({
          source: site.name,
          sourceType: '4K原盘API',
          title,
          snippet: `文件体积: ${sizeText} | 做种热度: ${seeds} Seeds | 支持迅雷云盘/115/PikPak秒离线播放`,
          sizeText,
          sizeMB,
          tags,
          links: [{ pan: '磁力', color: '#4f46e5', url: magnet }],
          pwd: '',
          score,
          date: item.added ? new Date(Number(item.added) * 1000).toISOString().slice(0, 10) : '',
          pageUrl: ''
        });
        if (results.length >= 25) break;
      }
      if (results.length > 0) break;
    } catch {}
  }

  // 若加 2160p 没搜到，放宽直接用英文原名搜高码率蓝光
  if (results.length === 0) {
    try {
      const apiUrl = `https://apibay.org/q.php?q=${encodeURIComponent(bi.enKw)}&cat=200`;
      const raw = await fetchText(apiUrl, 8000);
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const item of list.slice(0, 15)) {
          if (!item || !item.info_hash || item.id === '0' || item.name === 'No results returned') continue;
          const { sizeText, sizeMB } = formatBytesToSize(item.size);
          if (sizeMB < 1500) continue;
          const title = item.name;
          const magnet = `magnet:?xt=urn:btih:${item.info_hash}&dn=${encodeURIComponent(title)}&xl=${item.size}`;
          const tags = extractQualityTags(title);
          results.push({
            source: site.name,
            sourceType: '4K原盘API',
            title,
            snippet: `文件体积: ${sizeText} | 做种热度: ${item.seeders || 0} Seeds | 迅雷/115秒离线`,
            sizeText,
            sizeMB,
            tags,
            links: [{ pan: '磁力', color: '#4f46e5', url: magnet }],
            pwd: '',
            score: calcRelevanceScore(title, title, bi.allKws, sizeMB, tags),
            date: item.added ? new Date(Number(item.added) * 1000).toISOString().slice(0, 10) : '',
            pageUrl: ''
          });
        }
      }
    } catch {}
  }
  return results;
}

// 引擎 B：YTS 2160p 4K 蓝光电影 JSON 接口
async function searchYtsApi(site, bi) {
  const apiUrl = `https://yts.mx/api/v2/list_movies.json?query_term=${encodeURIComponent(bi.enKw)}&limit=10`;
  const raw = await fetchText(apiUrl, 8000);
  const data = JSON.parse(raw);
  const movies = (data && data.data && data.data.movies) || [];
  const results = [];

  for (const m of movies) {
    const torrents = m.torrents || [];
    for (const t of torrents) {
      if (t.quality !== '2160p' && t.quality !== '1080p') continue;
      const { sizeText, sizeMB } = formatBytesToSize(t.size_bytes);
      const title = `${m.title_long} [${t.quality}.${t.type || 'BluRay'}.${t.video_codec || 'x265'}]`;
      const magnet = `magnet:?xt=urn:btih:${t.hash}&dn=${encodeURIComponent(title)}&xl=${t.size_bytes}`;
      const tags = extractQualityTags(title);
      results.push({
        source: site.name,
        sourceType: '4K电影API',
        title,
        snippet: `IMDb评分: ${m.rating || '-'} | 体积: ${sizeText} | 编码: ${t.video_codec || 'HEVC'} | 迅雷秒离线`,
        sizeText,
        sizeMB,
        tags,
        links: [{ pan: '磁力', color: '#4f46e5', url: magnet }],
        pwd: '',
        score: calcRelevanceScore(title, title, bi.allKws, sizeMB, tags),
        date: (t.date_uploaded || '').slice(0, 10),
        pageUrl: m.url || ''
      });
    }
  }
  return results;
}

// 引擎 C：Telegram 频道双语检索
async function searchTelegramChannel(site, bi) {
  const baseUrl = site.url.replace(/\/+$/, '');
  const customHeaders = site.cookie ? { Cookie: site.cookie } : {};
  // 优先用中文关键词搜国内频道，若无中文则用英文
  const searchKws = [...new Set([bi.zhKw, bi.enKw])].slice(0, 2);
  const results = [];
  const seenLinks = new Set();

  for (const q of searchKws) {
    try {
      const searchUrl = `${baseUrl}?q=${encodeURIComponent(q)}`;
      const html = await fetchText(searchUrl, 9000, customHeaders);
      const blocks = html.split(/class="tgme_widget_message_wrap/g).slice(1);

      for (const block of blocks) {
        const textMatch = block.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        if (!textMatch) continue;
        const rawBlock = textMatch[1];
        const hrefs = [...rawBlock.matchAll(/href="(https?:\/\/[^"]+|magnet:[^"]+)"/gi)].map((m) => m[1]);
        const plain = stripHtml(rawBlock);
        const combined = `${plain}\n${hrefs.join('\n')}`;
        const { links, pwd } = extractPanLinks(combined);
        if (links.length === 0) continue;

        const firstLinkKey = links[0].url;
        if (seenLinks.has(firstLinkKey)) continue;

        const lines = plain.split('\n').map((l) => l.trim()).filter(Boolean);
        // 寻找包含“名称/片名/标题”或包含关键词的行作为主标题
        const titleLine =
          lines.find((l) => /^(?:名称|片名|标题|译名|🎥|🎬)/.test(l)) ||
          lines.find((l) => bi.allKws.some((k) => l.toLowerCase().includes(k.toLowerCase()))) ||
          lines[0] ||
          q;
        const title = titleLine.slice(0, 95);
        if (isNoisePost(title, q)) continue;

        // 检查前 5 行或标题行是否命中任一中英文关键词（排除长书评末尾顺带提及）
        const topLinesText = lines.slice(0, 5).join(' ').toLowerCase();
        const hitAny = bi.allKws.some((k) => topLinesText.includes(k.toLowerCase()));
        if (!hitAny) continue;

        seenLinks.add(firstLinkKey);
        const { sizeText, sizeMB } = extractSizeInfo(plain, links.map((l) => l.url));
        const tags = extractQualityTags(plain);
        const score = calcRelevanceScore(title, plain, bi.allKws, sizeMB, tags);
        const timeMatch = block.match(/datetime="([^"]+)"/i);

        results.push({
          source: site.name,
          sourceType: 'TG频道',
          title,
          snippet: lines.slice(0, 4).join(' | ').slice(0, 220),
          sizeText,
          sizeMB,
          tags,
          links,
          pwd,
          score,
          date: timeMatch ? timeMatch[1].slice(0, 10) : '',
          pageUrl: searchUrl
        });
      }
      if (results.length > 0) break;
    } catch {}
  }
  return results;
}

// 引擎 D：在线文档 / 清单直链 (支持携带登录 Cookie)
async function searchOnlineDoc(site, bi) {
  const customHeaders = site.cookie ? { Cookie: site.cookie } : {};
  const content = await fetchText(site.url, 12000, customHeaders);
  const plain = /<html|<body/i.test(content) ? stripHtml(content) : content;
  const lines = plain.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const results = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hit = bi.allKws.some((k) => line.toLowerCase().includes(k.toLowerCase()));
    if (!hit) continue;
    if (isNoisePost(line, bi.zhKw)) continue;

    const windowText = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 4)).join('\n');
    const { links, pwd } = extractPanLinks(windowText);
    if (links.length === 0) continue;

    const { sizeText, sizeMB } = extractSizeInfo(windowText, links.map((l) => l.url));
    const tags = extractQualityTags(windowText);
    const score = calcRelevanceScore(line, windowText, bi.allKws, sizeMB, tags);
    results.push({
      source: site.name,
      sourceType: '在线文档',
      title: line.slice(0, 95),
      snippet: windowText.slice(0, 220),
      sizeText,
      sizeMB,
      tags,
      links,
      pwd,
      score,
      date: '',
      pageUrl: site.url
    });
    if (results.length >= 20) break;
  }
  return results;
}

// 引擎 E：通用网页搜索站（支持自动携带站点专属登录 Cookie 深入详情页抓隐藏网盘链接）
async function searchWebSite(site, bi) {
  const searchUrl = site.url.replace('{kw}', encodeURIComponent(bi.zhKw));
  const origin = new URL(searchUrl).origin;
  const customHeaders = {
    Referer: origin + '/',
    ...(site.cookie ? { Cookie: site.cookie } : {})
  };
  const html = await fetchText(searchUrl, 12000, customHeaders);
  const results = [];

  const directPlain = stripHtml(html);
  const directPan = extractPanLinks(`${directPlain}\n${html}`);
  if (directPan.links.length > 0 && bi.allKws.some((k) => directPlain.toLowerCase().includes(k.toLowerCase()))) {
    const { sizeText, sizeMB } = extractSizeInfo(directPlain, directPan.links.map((l) => l.url));
    const tags = extractQualityTags(directPlain);
    results.push({
      source: site.name,
      sourceType: site.cookie ? '已登录网页站' : '网页站',
      title: `${site.name} - ${bi.zhKw}`,
      snippet: directPlain.slice(0, 180),
      sizeText,
      sizeMB,
      tags,
      links: directPan.links.slice(0, 8),
      pwd: directPan.pwd,
      score: calcRelevanceScore(bi.zhKw, directPlain, bi.allKws, sizeMB, tags),
      date: '',
      pageUrl: searchUrl
    });
  }

  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  const candidatePosts = [];
  const seenUrls = new Set();

  for (const m of html.matchAll(anchorRegex)) {
    const attrs = m[1] || '';
    const hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    let href = hrefMatch[1].trim();
    const titleAttr = (attrs.match(/title=["']([^"']+)["']/i) || [])[1] || '';
    const anchorText = (stripHtml(m[2]) || titleAttr).trim();
    if (!anchorText || anchorText.length < 2) continue;

    const hit = bi.allKws.some((k) => anchorText.toLowerCase().includes(k.toLowerCase()));
    if (!hit) continue;
    if (isNoisePost(anchorText, bi.zhKw)) continue;
    if (/^(javascript:|#|mailto:)/i.test(href)) continue;
    if (href.startsWith('/')) href = origin + href;
    else if (!/^https?:\/\//i.test(href)) href = `${origin}/${href.replace(/^\/+/, '')}`;
    if (href === searchUrl || /[?&](?:s|q|keyword|page)=/i.test(href)) continue;
    if (seenUrls.has(href)) continue;
    seenUrls.add(href);
    candidatePosts.push({ title: anchorText.slice(0, 95), url: href });
    if (candidatePosts.length >= 6) break;
  }

  const detailResults = await Promise.allSettled(
    candidatePosts.map(async (post) => {
      const detailHtml = await fetchText(post.url, 10000, customHeaders);
      const detailText = stripHtml(detailHtml);
      const { links, pwd } = extractPanLinks(`${detailText}\n${detailHtml}`);
      const { sizeText, sizeMB } = extractSizeInfo(`${post.title} ${detailText}`, links.map((l) => l.url));
      const tags = extractQualityTags(`${post.title} ${detailText}`);
      return {
        source: site.name,
        sourceType: site.cookie ? '已登录网页站' : '网页站',
        title: post.title,
        snippet: detailText.slice(0, 180),
        sizeText,
        sizeMB,
        tags,
        links: links.slice(0, 10),
        pwd,
        score: calcRelevanceScore(post.title, detailText, bi.allKws, sizeMB, tags),
        date: '',
        pageUrl: post.url
      };
    })
  );

  for (const r of detailResults) {
    if (r.status === 'fulfilled' && r.value.links.length > 0) {
      results.push(r.value);
    }
  }
  return results;
}

async function searchSingleSite(site, bi) {
  const start = Date.now();
  try {
    let items = [];
    if (site.type === 'tpb_api') items = await searchTpbApi(site, bi);
    else if (site.type === 'yts_api') items = await searchYtsApi(site, bi);
    else if (site.type === 'tg') items = await searchTelegramChannel(site, bi);
    else if (site.type === 'doc') items = await searchOnlineDoc(site, bi);
    else items = await searchWebSite(site, bi);
    return { id: site.id, name: site.name, ok: true, ms: Date.now() - start, items };
  } catch (err) {
    return { id: site.id, name: site.name, ok: false, ms: Date.now() - start, error: err.message, items: [] };
  }
}

// 代理账密登录获取站点会话 Cookie（适配常见 Xiuno / Discuz / WordPress / 通用表单）
async function proxySiteLogin(loginUrl, username, password) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const formBody = new URLSearchParams({
      email: username,
      username,
      user: username,
      log: username,
      password,
      pwd: password
    }).toString();

    const res = await fetch(loginUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: loginUrl
      },
      body: formBody,
      redirect: 'manual'
    });

    const rawCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
    const cookiePairs = rawCookies
      .map((c) => c.split(';')[0].trim())
      .filter(Boolean);

    if (cookiePairs.length === 0) {
      return {
        ok: false,
        message: '该站点开启了图形验证码或非标准登录接口，请点击『打开站点登录』后粘贴 Cookie'
      };
    }
    return { ok: true, cookie: cookiePairs.join('; ') };
  } catch (e) {
    return { ok: false, message: '登录请求异常: ' + e.message };
  } finally {
    clearTimeout(timer);
  }
}

function isAuthenticated(req) {
  if (!PASSWORD) return true;
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/scout_auth=([^;]+)/);
  if (!match) return false;
  return match[1] === SESSION_SECRET;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

function sendJson(res, status, data, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders });
  res.end(JSON.stringify(data));
}

const HTML_PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<title>4K原盘资源聚合搜索 v3.0</title>
<style>
  :root {
    --bg: #0b0f17;
    --panel: #131a26;
    --card: #182132;
    --border: #263248;
    --text: #e2e8f0;
    --muted: #94a3b8;
    --accent: #38bdf8;
    --accent-bg: rgba(56, 189, 248, 0.14);
    --green: #34d399;
    --amber: #fbbf24;
    --red: #f87171;
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
    background: var(--bg); color: var(--text); line-height: 1.5; padding-bottom: 60px;
  }
  .topbar {
    position: sticky; top: 0; z-index: 20; background: rgba(11, 15, 23, 0.92);
    backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); padding: 12px 14px;
  }
  .brand-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .brand { font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .badge-4k { background: var(--accent-bg); color: var(--accent); font-size: 11px; padding: 2px 7px; border-radius: 6px; font-weight: 600; }
  .btn-icon {
    background: var(--panel); border: 1px solid var(--border); color: var(--text);
    padding: 6px 11px; border-radius: 8px; font-size: 12px; cursor: pointer;
  }
  .search-box { display: flex; gap: 8px; }
  .search-input {
    flex: 1; background: var(--panel); border: 1px solid var(--border); color: var(--text);
    border-radius: 10px; padding: 10px 12px; font-size: 15px; outline: none;
  }
  .search-input:focus { border-color: var(--accent); }
  .search-btn {
    background: var(--accent); color: #06121e; border: none; border-radius: 10px;
    padding: 0 18px; font-size: 15px; font-weight: 700; cursor: pointer;
  }
  .search-btn:disabled { opacity: 0.6; }
  .filter-bar {
    display: flex; gap: 8px; overflow-x: auto; padding: 10px 14px 4px; scrollbar-width: none;
  }
  .filter-bar::-webkit-scrollbar { display: none; }
  .chip {
    white-space: nowrap; background: var(--panel); border: 1px solid var(--border);
    color: var(--muted); padding: 5px 11px; border-radius: 99px; font-size: 12px; cursor: pointer;
  }
  .chip.active { background: var(--accent-bg); border-color: var(--accent); color: var(--accent); font-weight: 600; }
  .status-strip { padding: 6px 14px; font-size: 12px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 8px; max-width: 860px; margin: 0 auto; }
  .container { padding: 8px 14px; display: flex; flex-direction: column; gap: 10px; max-width: 860px; margin: 0 auto; }
  .card {
    background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px;
  }
  .card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 6px; }
  .card-title { font-size: 15px; font-weight: 600; color: #f8fafc; word-break: break-all; }
  .size-pill {
    flex-shrink: 0; background: rgba(52, 211, 153, 0.16); color: var(--green);
    border: 1px solid rgba(52, 211, 153, 0.35); font-size: 12px; font-weight: 700;
    padding: 2px 8px; border-radius: 6px;
  }
  .size-pill.unknown { background: rgba(148, 163, 184, 0.12); color: var(--muted); border-color: transparent; font-weight: 500; }
  .meta-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; font-size: 11px; }
  .tag { background: var(--panel); border: 1px solid var(--border); color: var(--muted); padding: 1px 6px; border-radius: 4px; }
  .tag.q { color: var(--amber); border-color: rgba(251, 191, 36, 0.3); }
  .snippet { font-size: 12px; color: var(--muted); margin-bottom: 10px; word-break: break-word; }
  .links-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .pan-btn {
    display: inline-flex; align-items: center; gap: 5px; text-decoration: none;
    color: #fff; font-size: 12px; font-weight: 600; padding: 6px 11px; border-radius: 8px; border: none; cursor: pointer;
  }
  .copy-btn {
    background: var(--panel); border: 1px solid var(--border); color: var(--text);
    font-size: 12px; padding: 6px 10px; border-radius: 8px; cursor: pointer;
  }
  .drawer-backdrop {
    display: none; position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65); z-index: 40;
  }
  .drawer-backdrop.open { display: block; }
  .drawer {
    position: fixed; right: 0; top: 0; bottom: 0; width: min(94vw, 440px); background: var(--bg);
    border-left: 1px solid var(--border); z-index: 50; padding: 16px; overflow-y: auto;
    transform: translateX(100%); transition: transform 0.2s ease;
  }
  .drawer.open { transform: translateX(0); }
  .drawer-tabs { display: flex; gap: 8px; margin-bottom: 12px; }
  .tab-btn {
    flex: 1; padding: 8px; border-radius: 8px; border: 1px solid var(--border);
    background: var(--panel); color: var(--muted); font-size: 13px; font-weight: 600; cursor: pointer;
  }
  .tab-btn.active { background: var(--accent-bg); border-color: var(--accent); color: var(--accent); }
  .form-group { margin-bottom: 10px; }
  .form-group label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; }
  .form-control {
    width: 100%; background: var(--panel); border: 1px solid var(--border); color: var(--text);
    padding: 8px 10px; border-radius: 8px; font-size: 13px;
  }
  .site-item {
    background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 10px;
    margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; gap: 8px;
  }
  .site-info { min-width: 0; flex: 1; }
  .site-name { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
  .site-url { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { text-align: center; padding: 48px 16px; color: var(--muted); font-size: 14px; }
  .login-overlay {
    position: fixed; inset: 0; background: var(--bg); z-index: 100; display: none;
    align-items: center; justify-content: center; padding: 20px;
  }
  .login-overlay.show { display: flex; }
  .login-card { width: 100%; max-width: 340px; background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 20px; }
</style>
</head>
<body>
<div class="login-overlay" id="loginOverlay">
  <div class="login-card">
    <h3 style="margin:0 0 12px">访问密码验证</h3>
    <input type="password" id="pwdInput" class="form-control" placeholder="请输入站点密码" style="margin-bottom:12px" />
    <button class="search-btn" style="width:100%;padding:10px" onclick="doLogin()">进入搜索</button>
    <div id="loginErr" style="color:var(--red);font-size:12px;margin-top:8px"></div>
  </div>
</div>

<div class="topbar">
  <div class="brand-row">
    <div class="brand">🎬 4K原盘聚合搜 <span class="badge-4k">v3.0 双语+凭证中心</span></div>
    <button class="btn-icon" onclick="openDrawer()">⚙️ 站点与登录 (<span id="siteCount">0</span>)</button>
  </div>
  <div class="search-box">
    <input id="kwInput" class="search-input" placeholder="输入中外片名：地球脉动 / 泰坦尼克号 / 创战纪 / 疾速追杀" onkeydown="if(event.key==='Enter')doSearch()" />
    <button id="searchBtn" class="search-btn" onclick="doSearch()">搜索</button>
  </div>
</div>

<div class="filter-bar">
  <div class="chip active" onclick="setFilter('all', this)">全部结果</div>
  <div class="chip" onclick="setFilter('4k', this)">仅看 4K / 大体积(&gt;10GB)</div>
  <div class="chip" onclick="setFilter('磁力', this)">🧲 4K原盘磁力(迅雷秒存)</div>
  <div class="chip" onclick="setFilter('迅雷', this)">⚡ 迅雷云盘</div>
  <div class="chip" onclick="setFilter('天翼', this)">☁️ 天翼</div>
  <div class="chip" onclick="setFilter('夸克', this)">🟣 夸克</div>
  <div class="chip" onclick="setFilter('115', this)">💠 115</div>
  <div class="chip" onclick="toggleSort(this)">📊 按体积从大到小</div>
</div>

<div class="status-strip" id="statusStrip"></div>
<div class="container" id="resultsBox">
  <div class="empty">
    <b>v3.0 已升级：中文片名自动关联英文原名双搜</b><br/>
    内置全球 4K 原盘/REMUX 免盾库 + 10 大网盘源，点右上角可配置需要登录的论坛与私密文档凭证
  </div>
</div>

<div class="drawer-backdrop" id="drawerBackdrop" onclick="closeDrawer()"></div>
<div class="drawer" id="siteDrawer">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <b style="font-size:16px">⚙️ 巡影式站点与登录管理</b>
    <button class="btn-icon" onclick="closeDrawer()">关闭</button>
  </div>

  <div class="drawer-tabs">
    <button class="tab-btn active" id="tabBtnSites" onclick="switchTab('sites')">📡 站点列表与新增</button>
    <button class="tab-btn" id="tabBtnAuth" onclick="switchTab('auth')">🔑 站点登录/凭证中心</button>
  </div>

  <!-- Tab 1: 站点列表 -->
  <div id="tabPanelSites">
    <div style="background:var(--panel);padding:10px;border-radius:10px;border:1px solid var(--border);margin-bottom:12px">
      <div class="form-group">
        <label>站点名称</label>
        <input id="newSiteName" class="form-control" placeholder="例如：某4K论坛 / 我的在线文档" />
      </div>
      <div class="form-group">
        <label>站点类型</label>
        <select id="newSiteType" class="form-control">
          <option value="web">网页搜索站 (URL 含 {kw}，支持绑定登录Cookie)</option>
          <option value="doc">在线文档 / 列表直链 (支持绑定登录Cookie)</option>
          <option value="tg">TG 公开频道 (如 https://t.me/s/频道名)</option>
        </select>
      </div>
      <div class="form-group">
        <label>搜索或文档 URL</label>
        <input id="newSiteUrl" class="form-control" placeholder="https://example.com/search?q={kw}" />
      </div>
      <button class="search-btn" style="width:100%;padding:9px;font-size:13px;margin-bottom:8px" onclick="addSite()">+ 添加新站点</button>
      <div style="display:flex;gap:8px">
        <button class="copy-btn" style="flex:1;padding:7px" onclick="resetDefaultSites()">🔄 恢复默认 12 源</button>
        <button class="copy-btn" style="flex:1;padding:7px" onclick="exportSitesEnv()">📋 复制 CUSTOM_SITES</button>
      </div>
    </div>
    <div id="siteList"></div>
  </div>

  <!-- Tab 2: 巡影式站点登录与凭证中心 -->
  <div id="tabPanelAuth" style="display:none">
    <div style="background:var(--panel);padding:12px;border-radius:10px;border:1px solid var(--border);margin-bottom:12px;font-size:12px;color:var(--muted)">
      支持为需要登录的论坛（如雷鲸小站、YiOVE、私密在线文档）绑定账号凭证。绑定后服务端搜索与抓取详情页时会自动携带登录态，解锁『游客不可见』的网盘链接。
    </div>
    <div class="form-group">
      <label>选择要登录/绑定凭证的站点</label>
      <select id="authSiteSelect" class="form-control" onchange="onSelectAuthSite()"></select>
    </div>

    <div style="background:var(--panel);padding:12px;border-radius:10px;border:1px solid var(--border);margin-bottom:12px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">方式一：账号密码一键直登（适用于无图形验证码站点）</div>
      <div class="form-group">
        <label>登录接口地址 (Login URL)</label>
        <input id="authLoginUrl" class="form-control" placeholder="https://example.com/user-login.htm" />
      </div>
      <div class="form-group">
        <label>站点账号 / 手机号 / 邮箱</label>
        <input id="authUser" class="form-control" placeholder="输入你在该站点的账号" />
      </div>
      <div class="form-group">
        <label>站点密码</label>
        <input type="password" id="authPass" class="form-control" placeholder="输入你在该站点的密码" />
      </div>
      <button class="search-btn" style="width:100%;padding:9px;font-size:13px" onclick="doProxySiteLogin()">⚡ 尝试自动登录并捕获 Cookie</button>
      <div id="proxyLoginMsg" style="font-size:12px;margin-top:6px;color:var(--amber)"></div>
    </div>

    <div style="background:var(--panel);padding:12px;border-radius:10px;border:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:13px;font-weight:600">方式二：手动粘贴站点登录 Cookie（100% 通用）</span>
        <button class="copy-btn" style="padding:3px 8px;font-size:11px" onclick="openTargetSiteLogin()">🌐 打开该站登录页</button>
      </div>
      <div class="form-group">
        <label>已绑定的 Cookie 凭证（支持 Via/Kiwi 浏览器登录后提取）</label>
        <textarea id="authCookieInput" class="form-control" rows="4" placeholder="例如：bbs_sid=xxxx; bbs_token=yyyy"></textarea>
      </div>
      <button class="search-btn" style="width:100%;padding:9px;font-size:13px" onclick="saveSiteCookie()">💾 保存该站点登录凭证</button>
    </div>
  </div>
</div>

<script>
const STORAGE_KEY = 'custom_4k_sites_v3';
let allItems = [];
let currentPanFilter = 'all';
let sortBySize = false;
let sites = [];

async function init() {
  const res = await fetch('/api/sites');
  if (res.status === 401) {
    document.getElementById('loginOverlay').classList.add('show');
    return;
  }
  const data = await res.json();
  sites = data.sites || [];
  const localRaw = localStorage.getItem(STORAGE_KEY);
  if (localRaw) {
    try {
      const localSites = JSON.parse(localRaw);
      if (Array.isArray(localSites) && localSites.length > 0) {
        sites = localSites;
        await fetch('/api/sites', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ sites }) });
      }
    } catch {}
  }
  renderSiteList();
}

async function doLogin() {
  const pwd = document.getElementById('pwdInput').value;
  const res = await fetch('/api/login', {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ password: pwd })
  });
  if (res.ok) {
    document.getElementById('loginOverlay').classList.remove('show');
    init();
  } else {
    document.getElementById('loginErr').textContent = '密码错误';
  }
}

function switchTab(tab) {
  document.getElementById('tabBtnSites').classList.toggle('active', tab === 'sites');
  document.getElementById('tabBtnAuth').classList.toggle('active', tab === 'auth');
  document.getElementById('tabPanelSites').style.display = tab === 'sites' ? 'block' : 'none';
  document.getElementById('tabPanelAuth').style.display = tab === 'auth' ? 'block' : 'none';
  if (tab === 'auth') renderAuthSelect();
}

function renderSiteList() {
  document.getElementById('siteCount').textContent = sites.filter(s => s.enabled).length;
  const box = document.getElementById('siteList');
  box.innerHTML = sites.map((s, idx) => \`
    <div class="site-item">
      <div class="site-info">
        <div class="site-name">
          <span>[\${s.type.toUpperCase()}] \${s.name}</span>
          \${s.cookie ? '<span class="badge-4k" style="background:rgba(52,211,153,0.18);color:var(--green)">🔑已绑定登录</span>' : ''}
        </div>
        <div class="site-url">\${s.note || s.url}</div>
      </div>
      <input type="checkbox" \${s.enabled ? 'checked' : ''} onchange="toggleSite(\${idx})" />
      <button class="copy-btn" style="color:var(--red);padding:4px 8px" onclick="delSite(\${idx})">删</button>
    </div>
  \`).join('');
}

function renderAuthSelect() {
  const sel = document.getElementById('authSiteSelect');
  sel.innerHTML = sites.map((s, i) => \`<option value="\${i}">\${s.name} \${s.cookie ? '(已绑定凭证)' : ''}</option>\`).join('');
  onSelectAuthSite();
}

function onSelectAuthSite() {
  const idx = Number(document.getElementById('authSiteSelect').value) || 0;
  const s = sites[idx];
  if (!s) return;
  let defaultLogin = s.loginUrl || '';
  if (!defaultLogin && s.url) {
    try { defaultLogin = new URL(s.url.replace('{kw}', '')).origin + '/login'; } catch {}
  }
  document.getElementById('authLoginUrl').value = defaultLogin;
  document.getElementById('authCookieInput').value = s.cookie || '';
  document.getElementById('proxyLoginMsg').textContent = '';
}

function openTargetSiteLogin() {
  const u = document.getElementById('authLoginUrl').value.trim();
  if (u) window.open(u, '_blank');
}

async function doProxySiteLogin() {
  const idx = Number(document.getElementById('authSiteSelect').value) || 0;
  const loginUrl = document.getElementById('authLoginUrl').value.trim();
  const username = document.getElementById('authUser').value.trim();
  const password = document.getElementById('authPass').value.trim();
  const msgEl = document.getElementById('proxyLoginMsg');
  if (!loginUrl || !username || !password) {
    msgEl.textContent = '请填写登录地址、账号与密码';
    return;
  }
  msgEl.textContent = '正在请求登录接口...';
  const res = await fetch('/api/site-login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ loginUrl, username, password })
  });
  const data = await res.json();
  if (data.ok && data.cookie) {
    sites[idx].cookie = data.cookie;
    sites[idx].loginUrl = loginUrl;
    document.getElementById('authCookieInput').value = data.cookie;
    await syncSites();
    msgEl.style.color = 'var(--green)';
    msgEl.textContent = '✓ 登录成功，已自动捕获并绑定 Cookie！';
  } else {
    msgEl.style.color = 'var(--amber)';
    msgEl.textContent = data.message || '未能自动捕获 Cookie，请使用下方方式二粘贴';
  }
}

async function saveSiteCookie() {
  const idx = Number(document.getElementById('authSiteSelect').value) || 0;
  if (!sites[idx]) return;
  sites[idx].cookie = document.getElementById('authCookieInput').value.trim();
  sites[idx].loginUrl = document.getElementById('authLoginUrl').value.trim();
  await syncSites();
  renderAuthSelect();
  alert('已保存 ' + sites[idx].name + ' 的登录凭证，后续搜索将自动携带该登录态！');
}

async function syncSites() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));
  await fetch('/api/sites', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ sites }) });
  renderSiteList();
}

async function resetDefaultSites() {
  localStorage.removeItem(STORAGE_KEY);
  const res = await fetch('/api/sites/reset', { method: 'POST' });
  const data = await res.json();
  sites = data.sites || [];
  renderSiteList();
  alert('已恢复 v3.0 默认 12 个精选源');
}

function exportSitesEnv() {
  const jsonStr = JSON.stringify(sites);
  navigator.clipboard.writeText(jsonStr).then(() => {
    alert('已复制单行 JSON！可粘贴到 Render 环境变量 CUSTOM_SITES 中永久保存（含已绑定的登录Cookie）');
  });
}

async function addSite() {
  const name = document.getElementById('newSiteName').value.trim();
  const type = document.getElementById('newSiteType').value;
  const url = document.getElementById('newSiteUrl').value.trim();
  if (!name || !url) return alert('请填写名称和地址');
  if (type === 'web' && !url.includes('{kw}')) return alert('网页搜索站 URL 中必须包含 {kw} 占位符');
  sites.unshift({ id: 'custom-' + Date.now(), name, type, url, enabled: true, cookie: '' });
  document.getElementById('newSiteName').value = '';
  document.getElementById('newSiteUrl').value = '';
  await syncSites();
}

function toggleSite(idx) { sites[idx].enabled = !sites[idx].enabled; syncSites(); }
function delSite(idx) { sites.splice(idx, 1); syncSites(); }
function openDrawer() { document.getElementById('drawerBackdrop').classList.add('open'); document.getElementById('siteDrawer').classList.add('open'); }
function closeDrawer() { document.getElementById('drawerBackdrop').classList.remove('open'); document.getElementById('siteDrawer').classList.remove('open'); }

async function doSearch() {
  const kw = document.getElementById('kwInput').value.trim();
  if (!kw) return;
  const btn = document.getElementById('searchBtn');
  btn.disabled = true; btn.textContent = '搜索中...';
  document.getElementById('statusStrip').innerHTML = '正在智能解析中英文片名并并发检索各源...';
  document.getElementById('resultsBox').innerHTML = '<div class="empty">正在并发检索 4K 原盘库与各大网盘源...</div>';

  try {
    const res = await fetch('/api/search?kw=' + encodeURIComponent(kw));
    if (res.status === 401) return location.reload();
    const data = await res.json();
    allItems = data.items || [];
    const biTip = data.bilingual ? \`<span style="color:var(--accent);font-weight:600">🔍 双语检索: \${data.bilingual.join(' ⇄ ')}</span>\` : '';
    const statsHtml = (data.siteStats || []).map(st =>
      \`<span style="color:\${st.ok ? (st.count > 0 ? 'var(--green)' : 'var(--muted)') : 'var(--red)'}">\${st.ok ? '✓' : '✗'} \${st.name} (\${st.count}条/\${st.ms}ms)</span>\`
    ).join('');
    document.getElementById('statusStrip').innerHTML = biTip + ' ' + statsHtml;
    renderResults();
  } catch (e) {
    document.getElementById('resultsBox').innerHTML = '<div class="empty">请求失败：' + e.message + '</div>';
  } finally {
    btn.disabled = false; btn.textContent = '搜索';
  }
}

function setFilter(val, el) {
  currentPanFilter = val;
  document.querySelectorAll('.filter-bar .chip').forEach((c, i) => { if (i < 7) c.classList.remove('active'); });
  el.classList.add('active');
  renderResults();
}

function toggleSort(el) {
  sortBySize = !sortBySize;
  el.classList.toggle('active', sortBySize);
  renderResults();
}

function copyText(txt, btn) {
  navigator.clipboard.writeText(txt).then(() => {
    const old = btn.textContent;
    btn.textContent = '已复制';
    setTimeout(() => btn.textContent = old, 1200);
  });
}

function renderResults() {
  let list = allItems.slice();
  if (currentPanFilter === '4k') {
    list = list.filter(it => it.sizeMB >= 10240 || it.tags.some(t => /4K|原盘/i.test(t)));
  } else if (currentPanFilter !== 'all') {
    list = list.filter(it => it.links.some(l => l.pan === currentPanFilter));
  }
  if (sortBySize) {
    list.sort((a, b) => b.sizeMB - a.sizeMB);
  } else {
    list.sort((a, b) => (b.score || 0) - (a.score || 0));
  }
  const box = document.getElementById('resultsBox');
  if (list.length === 0) {
    box.innerHTML = '<div class="empty">当前筛选条件下暂无结果</div>';
    return;
  }
  box.innerHTML = list.map(it => {
    const sizeCls = it.sizeMB > 0 ? 'size-pill' : 'size-pill unknown';
    const tagsHtml = it.tags.map(t => \`<span class="tag q">\${t}</span>\`).join('');
    const linksHtml = it.links.map(l => \`
      <a class="pan-btn" style="background:\${l.color}" href="\${l.url}" target="_blank" rel="noopener">\${l.pan === '磁力' ? '⚡ 迅雷打开磁力' : l.pan + '直达'}</a>
      <button class="copy-btn" onclick="copyText('\${l.url}', this)">复制\${l.pan}</button>
    \`).join('');
    const pwdBadge = it.pwd ? \`<span class="tag q">提取码: \${it.pwd}</span>\` : '';
    const detailBtn = it.pageUrl ? \`<a class="copy-btn" style="text-decoration:none" href="\${it.pageUrl}" target="_blank" rel="noopener">原帖</a>\` : '';
    return \`
      <div class="card">
        <div class="card-head">
          <div class="card-title">\${it.title}</div>
          <div class="\${sizeCls}">\${it.sizeText}</div>
        </div>
        <div class="meta-row">
          <span class="tag">\${it.source}</span>
          \${it.date ? \`<span class="tag">\${it.date}</span>\` : ''}
          \${tagsHtml}
          \${pwdBadge}
        </div>
        <div class="snippet">\${it.snippet}</div>
        <div class="links-row">\${linksHtml}\${detailBtn}</div>
      </div>
    \`;
  }).join('');
}

init();
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (reqUrl.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, version: '3.0', sites: runtimeSites.length });
  }

  if (reqUrl.pathname === '/api/login' && req.method === 'POST') {
    const body = await readJsonBody(req).catch(() => ({}));
    if (!PASSWORD || body.password === PASSWORD) {
      return sendJson(
        res,
        200,
        { ok: true },
        { 'Set-Cookie': `scout_auth=${SESSION_SECRET}; Path=/; HttpOnly; SameSite=Lax` }
      );
    }
    return sendJson(res, 401, { ok: false, error: '密码错误' });
  }

  if (reqUrl.pathname.startsWith('/api/') && !isAuthenticated(req)) {
    return sendJson(res, 401, { ok: false, error: '未登录' });
  }

  if (reqUrl.pathname === '/api/sites' && req.method === 'GET') {
    return sendJson(res, 200, { sites: runtimeSites });
  }

  if (reqUrl.pathname === '/api/sites' && req.method === 'POST') {
    const body = await readJsonBody(req).catch(() => ({}));
    if (Array.isArray(body.sites)) {
      runtimeSites = body.sites;
      return sendJson(res, 200, { ok: true, count: runtimeSites.length });
    }
    return sendJson(res, 400, { ok: false, error: '格式错误' });
  }

  if (reqUrl.pathname === '/api/sites/reset' && req.method === 'POST') {
    runtimeSites = getInitialSites();
    return sendJson(res, 200, { ok: true, sites: runtimeSites });
  }

  if (reqUrl.pathname === '/api/site-login' && req.method === 'POST') {
    const body = await readJsonBody(req).catch(() => ({}));
    const result = await proxySiteLogin(body.loginUrl, body.username, body.password);
    return sendJson(res, 200, result);
  }

  if (reqUrl.pathname === '/api/search' && req.method === 'GET') {
    const kw = (reqUrl.searchParams.get('kw') || '').trim();
    if (!kw) return sendJson(res, 400, { error: '缺少关键词 kw' });

    const bi = await resolveBilingualKeywords(kw);
    const activeSites = runtimeSites.filter((s) => s.enabled);
    const settled = await Promise.all(activeSites.map((s) => searchSingleSite(s, bi)));

    const items = [];
    const siteStats = [];
    for (const r of settled) {
      siteStats.push({ name: r.name, ok: r.ok, ms: r.ms, count: r.items.length, error: r.error });
      items.push(...r.items);
    }
    items.sort((a, b) => (b.score || 0) - (a.score || 0));
    return sendJson(res, 200, { kw, bilingual: bi.allKws, items, siteStats });
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML_PAGE);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`4K原盘聚合搜索服务 v3.0 已启动，监听端口: ${PORT}`);
});