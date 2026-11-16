const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const PASSWORD = (process.env.PASSWORD || '').trim();
const SESSION_SECRET = crypto
  .createHash('sha256')
  .update(PASSWORD || '4k-scout-default-secret')
  .digest('hex');

// v2.0 默认预置的高纯度 4K 原盘/网盘资源源（可通过环境变量 CUSTOM_SITES 覆盖，也可在网页端随时增删）
const DEFAULT_SITES = [
  {
    id: 'web-yinfans',
    name: '音范丝 (4K蓝光原盘)',
    type: 'web',
    url: 'https://www.yinfans.me/?s={kw}',
    enabled: true,
    note: '4K蓝光原盘/REMUX 磁力主力（支持迅雷离线秒存）'
  },
  {
    id: 'tg-dianying4k',
    name: '4K影视屋 (蓝光无损)',
    type: 'tg',
    url: 'https://t.me/s/dianying4k',
    enabled: true,
    note: 'TG频道 · 4K原盘/115/迅雷/夸克'
  },
  {
    id: 'tg-yunpanxunlei',
    name: '迅雷4K原盘频道',
    type: 'tg',
    url: 'https://t.me/s/yunpanxunlei',
    enabled: true,
    note: 'TG频道 · 迅雷网盘4K高码率'
  },
  {
    id: 'tg-yunpan189',
    name: '天翼云盘4K频道',
    type: 'tg',
    url: 'https://t.me/s/yunpan189',
    enabled: true,
    note: 'TG频道 · 天翼云盘不限速4K'
  },
  {
    id: 'tg-yunpans',
    name: '夸克影视资源频道',
    type: 'tg',
    url: 'https://t.me/s/yunpans',
    enabled: true,
    note: 'TG频道 · 夸克网盘影视'
  },
  {
    id: 'tg-baidudisk',
    name: '百度网盘影视频道',
    type: 'tg',
    url: 'https://t.me/s/BaiduCloudDisk',
    enabled: true,
    note: 'TG频道 · 百度网盘资源'
  },
  {
    id: 'tg-yunpan139',
    name: '移动云盘影视频道',
    type: 'tg',
    url: 'https://t.me/s/yunpan139',
    enabled: true,
    note: 'TG频道 · 移动云盘4K'
  },
  {
    id: 'tg-tgsearchers4',
    name: 'TG全网盘聚合4号',
    type: 'tg',
    url: 'https://t.me/s/tgsearchers4',
    enabled: true,
    note: 'TG频道 · 多网盘综合检索'
  },
  {
    id: 'tg-ydypzyfx',
    name: '多网盘4K剧集分享',
    type: 'tg',
    url: 'https://t.me/s/ydypzyfx',
    enabled: true,
    note: 'TG频道 · 移动/天翼/夸克'
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
  'Mozilla/5.0 (Linux; Android 14; Redmi K70) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';

// 网盘 + 磁力链接识别正则
const PAN_PATTERNS = [
  { pan: '迅雷', color: '#2563eb', regex: /https?:\/\/pan\.xunlei\.com\/s\/[A-Za-z0-9_-]+(?:\?pwd=[A-Za-z0-9]+)?/gi },
  { pan: '天翼', color: '#ea580c', regex: /https?:\/\/cloud\.189\.cn\/(?:t|web\/share)\/[A-Za-z0-9]+(?:\?[^\s"'<>]+)?/gi },
  { pan: '夸克', color: '#7c3aed', regex: /https?:\/\/pan\.quark\.cn\/s\/[A-Za-z0-9]+(?:#\/list\/share)?/gi },
  { pan: '阿里', color: '#d97706', regex: /https?:\/\/(?:www\.)?(?:alipan|aliyundrive)\.com\/s\/[A-Za-z0-9]+/gi },
  { pan: '115', color: '#0891b2', regex: /https?:\/\/(?:115|115cdn)\.com\/s\/[A-Za-z0-9]+(?:\?password=[A-Za-z0-9]+)?/gi },
  { pan: '123', color: '#059669', regex: /https?:\/\/(?:www\.)?123(?:pan|684|865)\.com\/s\/[A-Za-z0-9-]+/gi },
  { pan: '百度', color: '#dc2626', regex: /https?:\/\/pan\.baidu\.com\/s\/[A-Za-z0-9_-]+(?:\?pwd=[A-Za-z0-9]+)?/gi },
  { pan: '磁力', color: '#475569', regex: /magnet:\?xt=urn:btih:[A-Za-z0-9]{32,40}[^\s"'<>]*/gi }
];

// 过滤电子书/软件/文档等非影视噪声
const NOISE_REGEX = /\.(?:epub|mobi|azw3|pdf|exe|apk|dmg|zip|rar)\b|电子书|有声书|网盘课程|教程合集|考研|考公|字体包|壁纸包/i;

function isNoisePost(title, kw) {
  if (NOISE_REGEX.test(kw)) return false;
  return NOISE_REGEX.test(title);
}

// 提取文件大小（支持文本内的 GB/TB/MB 以及磁力链接里的 xl= 字节数）
function extractSizeInfo(text, rawUrls = []) {
  let bestMB = 0;
  let bestText = '未知大小';

  if (text) {
    const matches = [...text.matchAll(/(\d+(?:\.\d{1,2})?)\s*(TB|T|GB|G|MB|M)\b/gi)];
    for (const m of matches) {
      const val = parseFloat(m[1]);
      const unit = m[2].toUpperCase();
      let mb = 0;
      if (unit === 'TB' || unit === 'T') mb = val * 1024 * 1024;
      else if (unit === 'GB' || unit === 'G') mb = val * 1024;
      else mb = val;

      // 过滤掉明显不是影片体积的极小数值或年份/编码误匹配
      if (mb > bestMB && mb >= 100 && mb <= 50 * 1024 * 1024) {
        bestMB = mb;
        const normUnit = unit.length === 1 ? unit + 'B' : unit;
        bestText = `${val}${normUnit}`;
      }
    }
  }

  // 若文本未标大小，尝试从磁力链接 xl= 字节参数换算
  if (bestMB === 0 && rawUrls.length > 0) {
    for (const u of rawUrls) {
      const xlMatch = u.match(/[?&]xl=(\d+)/i);
      if (xlMatch) {
        const bytes = Number(xlMatch[1]);
        if (bytes > 100 * 1024 * 1024) {
          bestMB = bytes / (1024 * 1024);
          bestText = bestMB >= 1024 ? `${(bestMB / 1024).toFixed(2)}GB` : `${Math.round(bestMB)}MB`;
          break;
        }
      }
    }
  }

  return { sizeText: bestText, sizeMB: Math.round(bestMB) };
}

function extractQualityTags(text) {
  const tags = [];
  const rules = [
    ['4K/2160P', /4K|2160P|UHD/i],
    ['原盘/REMUX', /原盘|REMUX|BDMV|ISO|蓝光|BluRay/i],
    ['杜比视界', /杜比|Dolby|DV\b/i],
    ['HDR', /HDR10?\+?/i],
    ['高码率', /高码|HQ|60FPS/i]
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

// 相关性打分：标题命中远高于正文顺带提及，4K/原盘/有明确大小加分
function calcRelevanceScore(title, body, kw, sizeMB, tags) {
  const kwLower = kw.toLowerCase();
  const titleLower = title.toLowerCase();
  const bodyLower = body.toLowerCase();
  let score = 0;

  if (titleLower.includes(kwLower)) score += 100;
  else {
    // 拆分多词或短词匹配
    const tokens = kwLower.split(/\s+/).filter(Boolean);
    const hitCount = tokens.filter((t) => titleLower.includes(t)).length;
    if (hitCount > 0) score += 60 * (hitCount / tokens.length);
    else if (bodyLower.includes(kwLower)) score += 10;
  }

  if (tags.length > 0) score += tags.length * 12;
  if (sizeMB >= 10240) score += 25;
  else if (sizeMB > 0) score += 10;
  return Math.round(score);
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

async function fetchText(targetUrl, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/json,text/plain,*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      redirect: 'follow'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// 1. 解析 Telegram 频道网页版 (https://t.me/s/<channel>?q=<kw>)
async function searchTelegramChannel(site, kw) {
  const baseUrl = site.url.replace(/\/+$/, '');
  const searchUrl = `${baseUrl}?q=${encodeURIComponent(kw)}`;
  const html = await fetchText(searchUrl, 10000);
  const blocks = html.split(/class="tgme_widget_message_wrap/g).slice(1);
  const results = [];

  for (const block of blocks) {
    const textMatch = block.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (!textMatch) continue;
    const rawBlock = textMatch[1];
    const hrefs = [...rawBlock.matchAll(/href="(https?:\/\/[^"]+|magnet:[^"]+)"/gi)].map((m) => m[1]);
    const plain = stripHtml(rawBlock);
    const combined = `${plain}\n${hrefs.join('\n')}`;
    const { links, pwd } = extractPanLinks(combined);
    if (links.length === 0) continue;

    const lines = plain.split('\n').map((l) => l.trim()).filter(Boolean);
    const title = (lines[0] || kw).slice(0, 95);
    if (isNoisePost(title, kw)) continue;

    // 严格要求标题或前两行明确包含关键词（避免书评/杂谈正文顺带提及的误匹配）
    const headText = lines.slice(0, 2).join(' ').toLowerCase();
    if (!headText.includes(kw.toLowerCase())) continue;

    const { sizeText, sizeMB } = extractSizeInfo(plain, links.map((l) => l.url));
    const tags = extractQualityTags(plain);
    const score = calcRelevanceScore(title, plain, kw, sizeMB, tags);
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
  return results;
}

// 2. 解析在线文档 / 公开清单 / JSON / TXT (type === 'doc')
async function searchOnlineDoc(site, kw) {
  const content = await fetchText(site.url, 12000);
  const plain = /<html|<body/i.test(content) ? stripHtml(content) : content;
  const kwLower = kw.toLowerCase();
  const lines = plain.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const results = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.toLowerCase().includes(kwLower)) continue;
    if (isNoisePost(line, kw)) continue;

    const windowText = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 4)).join('\n');
    const { links, pwd } = extractPanLinks(windowText);
    if (links.length === 0) continue;

    const { sizeText, sizeMB } = extractSizeInfo(windowText, links.map((l) => l.url));
    const tags = extractQualityTags(windowText);
    const score = calcRelevanceScore(line, windowText, kw, sizeMB, tags);
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

// 3. 解析通用网页搜索站（兼容 WordPress 如音范丝 / 论坛 / 详情页磁力与网盘提取）
async function searchWebSite(site, kw) {
  const searchUrl = site.url.replace('{kw}', encodeURIComponent(kw));
  const origin = new URL(searchUrl).origin;
  const html = await fetchText(searchUrl, 12000);
  const results = [];

  // 如果搜索结果页本身已直接包含网盘/磁力链接
  const directPlain = stripHtml(html);
  const directPan = extractPanLinks(`${directPlain}\n${html}`);
  if (directPan.links.length > 0 && directPlain.toLowerCase().includes(kw.toLowerCase())) {
    const { sizeText, sizeMB } = extractSizeInfo(directPlain, directPan.links.map((l) => l.url));
    const tags = extractQualityTags(directPlain);
    results.push({
      source: site.name,
      sourceType: '网页站',
      title: `${site.name} - ${kw}`,
      snippet: directPlain.slice(0, 180),
      sizeText,
      sizeMB,
      tags,
      links: directPan.links.slice(0, 8),
      pwd: directPan.pwd,
      score: calcRelevanceScore(kw, directPlain, kw, sizeMB, tags),
      date: '',
      pageUrl: searchUrl
    });
  }

  // 提取匹配关键词的帖子详情页链接（优先抓取 h1/h2/h3 标题链接或包含关键词的链接，最多前 8 篇）
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const candidatePosts = [];
  const seenUrls = new Set();
  const kwLower = kw.toLowerCase();

  for (const m of html.matchAll(anchorRegex)) {
    let href = m[1].trim();
    const anchorText = stripHtml(m[2]);
    if (!anchorText || anchorText.length < 2) continue;
    if (!anchorText.toLowerCase().includes(kwLower)) continue;
    if (isNoisePost(anchorText, kw)) continue;
    if (/^(javascript:|#|mailto:)/i.test(href)) continue;
    if (href.startsWith('/')) href = origin + href;
    else if (!/^https?:\/\//i.test(href)) continue;
    if (href === searchUrl || /[?&](?:s|q|keyword|page)=/i.test(href)) continue;
    if (seenUrls.has(href)) continue;
    seenUrls.add(href);
    candidatePosts.push({ title: anchorText.slice(0, 95), url: href });
    if (candidatePosts.length >= 8) break;
  }

  const detailResults = await Promise.allSettled(
    candidatePosts.map(async (post) => {
      const detailHtml = await fetchText(post.url, 10000);
      const detailText = stripHtml(detailHtml);
      const { links, pwd } = extractPanLinks(`${detailText}\n${detailHtml}`);
      const { sizeText, sizeMB } = extractSizeInfo(`${post.title} ${detailText}`, links.map((l) => l.url));
      const tags = extractQualityTags(`${post.title} ${detailText}`);
      return {
        source: site.name,
        sourceType: '网页站',
        title: post.title,
        snippet: detailText.slice(0, 180),
        sizeText,
        sizeMB,
        tags,
        links: links.slice(0, 10),
        pwd,
        score: calcRelevanceScore(post.title, detailText, kw, sizeMB, tags),
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

async function searchSingleSite(site, kw) {
  const start = Date.now();
  try {
    let items = [];
    if (site.type === 'tg') items = await searchTelegramChannel(site, kw);
    else if (site.type === 'doc') items = await searchOnlineDoc(site, kw);
    else items = await searchWebSite(site, kw);
    return { id: site.id, name: site.name, ok: true, ms: Date.now() - start, items };
  } catch (err) {
    return { id: site.id, name: site.name, ok: false, ms: Date.now() - start, error: err.message, items: [] };
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
<title>4K原盘资源聚合搜索 v2</title>
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
    padding: 6px 11px; border-radius: 8px; font-size: 13px; cursor: pointer;
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
    position: fixed; right: 0; top: 0; bottom: 0; width: min(92vw, 420px); background: var(--bg);
    border-left: 1px solid var(--border); z-index: 50; padding: 16px; overflow-y: auto;
    transform: translateX(100%); transition: transform 0.2s ease;
  }
  .drawer.open { transform: translateX(0); }
  .drawer h3 { margin: 0 0 12px; font-size: 16px; display: flex; justify-content: space-between; align-items: center; }
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
  .site-name { font-size: 13px; font-weight: 600; }
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
    <div class="brand">🎬 4K原盘聚合搜 <span class="badge-4k">v2.0</span></div>
    <button class="btn-icon" onclick="openDrawer()">⚙️ 站点管理 (<span id="siteCount">0</span>)</button>
  </div>
  <div class="search-box">
    <input id="kwInput" class="search-input" placeholder="输入片名，如：复仇者联盟 / 沙丘2 / 奥本海默" onkeydown="if(event.key==='Enter')doSearch()" />
    <button id="searchBtn" class="search-btn" onclick="doSearch()">搜索</button>
  </div>
</div>

<div class="filter-bar">
  <div class="chip active" onclick="setFilter('all', this)">全部结果</div>
  <div class="chip" onclick="setFilter('4k', this)">仅看 4K / 大体积(&gt;10GB)</div>
  <div class="chip" onclick="setFilter('迅雷', this)">⚡ 迅雷</div>
  <div class="chip" onclick="setFilter('磁力', this)">🧲 磁力(原盘)</div>
  <div class="chip" onclick="setFilter('天翼', this)">☁️ 天翼</div>
  <div class="chip" onclick="setFilter('夸克', this)">🟣 夸克</div>
  <div class="chip" onclick="setFilter('百度', this)">🔵 百度</div>
  <div class="chip" onclick="toggleSort(this)">📊 按体积从大到小</div>
</div>

<div class="status-strip" id="statusStrip"></div>
<div class="container" id="resultsBox">
  <div class="empty">已内置 音范丝4K原盘 + 8大网盘TG主力频道<br/>自动过滤电子书等无关结果，支持按文件体积排序</div>
</div>

<div class="drawer-backdrop" id="drawerBackdrop" onclick="closeDrawer()"></div>
<div class="drawer" id="siteDrawer">
  <h3><span>自定义资源站点</span><button class="btn-icon" onclick="closeDrawer()">关闭</button></h3>
  <div style="background:var(--panel);padding:10px;border-radius:10px;border:1px solid var(--border);margin-bottom:12px">
    <div class="form-group">
      <label>站点名称</label>
      <input id="newSiteName" class="form-control" placeholder="例如：4K指南 / 我的电影文档" />
    </div>
    <div class="form-group">
      <label>站点类型</label>
      <select id="newSiteType" class="form-control">
        <option value="web">网页搜索站 (URL 中需包含 {kw})</option>
        <option value="tg">TG 公开频道 (如 https://t.me/s/频道名)</option>
        <option value="doc">在线文档 / 清单直链 (抓取全文匹配)</option>
      </select>
    </div>
    <div class="form-group">
      <label>地址 URL</label>
      <input id="newSiteUrl" class="form-control" placeholder="https://example.com/?s={kw}" />
    </div>
    <button class="search-btn" style="width:100%;padding:9px;font-size:13px;margin-bottom:8px" onclick="addSite()">+ 添加新站点</button>
    <button class="copy-btn" style="width:100%;padding:7px;font-size:12px" onclick="resetDefaultSites()">🔄 恢复默认内置站点 (9个)</button>
  </div>
  <div id="siteList"></div>
</div>

<script>
const STORAGE_KEY = 'custom_4k_sites_v2';
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

function renderSiteList() {
  document.getElementById('siteCount').textContent = sites.filter(s => s.enabled).length;
  const box = document.getElementById('siteList');
  box.innerHTML = sites.map((s, idx) => \`
    <div class="site-item">
      <div class="site-info">
        <div class="site-name">[\${s.type.toUpperCase()}] \${s.name}</div>
        <div class="site-url">\${s.url}</div>
      </div>
      <input type="checkbox" \${s.enabled ? 'checked' : ''} onchange="toggleSite(\${idx})" />
      <button class="copy-btn" style="color:var(--red);padding:4px 8px" onclick="delSite(\${idx})">删</button>
    </div>
  \`).join('');
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
  alert('已恢复默认 9 个精选 4K 站点');
}

async function addSite() {
  const name = document.getElementById('newSiteName').value.trim();
  const type = document.getElementById('newSiteType').value;
  const url = document.getElementById('newSiteUrl').value.trim();
  if (!name || !url) return alert('请填写名称和地址');
  if (type === 'web' && !url.includes('{kw}')) return alert('网页搜索站 URL 中必须包含 {kw} 占位符');
  sites.unshift({ id: 'custom-' + Date.now(), name, type, url, enabled: true });
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
  document.getElementById('statusStrip').innerHTML = '正在并发检索 9 大站点...';
  document.getElementById('resultsBox').innerHTML = '<div class="empty">正在抓取并解析资源体积与网盘/磁力链接...</div>';

  try {
    const res = await fetch('/api/search?kw=' + encodeURIComponent(kw));
    if (res.status === 401) return location.reload();
    const data = await res.json();
    allItems = data.items || [];
    const statsHtml = (data.siteStats || []).map(st =>
      \`<span style="color:\${st.ok ? 'var(--green)' : 'var(--red)'}">\${st.ok ? '✓' : '✗'} \${st.name} (\${st.count}条/\${st.ms}ms)</span>\`
    ).join('');
    document.getElementById('statusStrip').innerHTML = statsHtml;
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
      <a class="pan-btn" style="background:\${l.color}" href="\${l.url}" target="_blank" rel="noopener">\${l.pan}直达</a>
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
    return sendJson(res, 200, { ok: true, sites: runtimeSites.length });
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

  if (reqUrl.pathname === '/api/search' && req.method === 'GET') {
    const kw = (reqUrl.searchParams.get('kw') || '').trim();
    if (!kw) return sendJson(res, 400, { error: '缺少关键词 kw' });

    const activeSites = runtimeSites.filter((s) => s.enabled);
    const settled = await Promise.all(activeSites.map((s) => searchSingleSite(s, kw)));

    const items = [];
    const siteStats = [];
    for (const r of settled) {
      siteStats.push({ name: r.name, ok: r.ok, ms: r.ms, count: r.items.length, error: r.error });
      items.push(...r.items);
    }
    items.sort((a, b) => (b.score || 0) - (a.score || 0));
    return sendJson(res, 200, { kw, items, siteStats });
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML_PAGE);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`4K原盘聚合搜索服务 v2.0 已启动，监听端口: ${PORT}`);
});
