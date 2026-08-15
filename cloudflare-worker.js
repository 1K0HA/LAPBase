// LAPBase Guides Worker — test build v5.17
// Teletype -> structured JSON for the native LAPBase guide reader.
// v5.4:
//   - balanced article extraction so nested <div> content is never cut at the first child closing tag
//   - RU / ENG markers are detected in H1-H4, including labels such as "[ENG] - not finished"
//   - generated TOC uses real stable IDs for reliable in-app anchor scrolling
//   - Teletype figure geometry is preserved so images keep their original proportions/display width
//   - broader lazy-image recovery with node/anchor hints and ordered fallbacks
//   - enriched guide index still includes covers, dates and language availability

const ALLOWED_HOST = 'teletype.in';
const ALLOWED_AUTHOR_PREFIX = '/@1k0na_inf/';
const INDEX_CONCURRENCY = 5;
const INDEX_LIMIT = 40;
const INDEX_PAGE_SIZE = 10;
const INDEX_MAX_PAGE = 20;
const RSS_MAX_PAGES = 12;
const RSS_MAX_ITEMS = 160;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'no-store',
    },
  });
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function plainText(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractAttribute(tag, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i');
  const match = String(tag || '').match(re);
  return match ? decodeEntities(match[2]) : '';
}

function extractMeta(html, key, value) {
  const tags = String(html || '').match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const actual = extractAttribute(tag, key);
    if (actual && actual.toLowerCase() === String(value).toLowerCase()) {
      return extractAttribute(tag, 'content');
    }
  }
  return '';
}

function extractPageTitle(html) {
  const og = extractMeta(html, 'property', 'og:title');
  if (og) return decodeEntities(og).trim();

  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const title = plainText(h1[1]);
    if (title) return title;
  }

  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return title ? plainText(title[1]).replace(/\s*[—|-]\s*Teletype\s*$/i, '') : '';
}

function splitBilingualTitle(title) {
  const value = String(title || '').trim();
  if (!value) return { ru: 'LAPBase Guide', en: 'LAPBase Guide' };

  // Most LAPBase bilingual Teletype titles use "RU title | EN title".
  const parts = value.split(/\s+\|\s+/).map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      ru: parts[0],
      en: parts.slice(1).join(' | '),
    };
  }

  return { ru: value, en: value };
}


function normalizePublishedAt(raw) {
  if (raw === null || raw === undefined) return '';
  let value = decodeEntities(normalizeSerializedHtml(String(raw))).trim();
  if (!value) return '';

  // Unix timestamps can appear in serialized hydration data.
  if (/^\d{10,13}$/.test(value)) {
    let n = Number(value);
    if (value.length === 10) n *= 1000;
    const date = new Date(n);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function parseVisibleTeletypeDate(raw) {
  const text = plainText(raw).replace(/\s+/g, ' ').trim();
  if (!text) return '';

  const months = {
    january: 0, jan: 0, 'января': 0, 'янв': 0,
    february: 1, feb: 1, 'февраля': 1, 'фев': 1,
    march: 2, mar: 2, 'марта': 2, 'мар': 2,
    april: 3, apr: 3, 'апреля': 3, 'апр': 3,
    may: 4, 'мая': 4,
    june: 5, jun: 5, 'июня': 5, 'июн': 5,
    july: 6, jul: 6, 'июля': 6, 'июл': 6,
    august: 7, aug: 7, 'августа': 7, 'авг': 7,
    september: 8, sep: 8, sept: 8, 'сентября': 8, 'сен': 8,
    october: 9, oct: 9, 'октября': 9, 'окт': 9,
    november: 10, nov: 10, 'ноября': 10, 'ноя': 10,
    december: 11, dec: 11, 'декабря': 11, 'дек': 11,
  };

  let day, monthName, year, hour = 12, minute = 0;
  let m = text.match(/\b([A-Za-zА-Яа-яЁё.]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?(?:,?\s+(\d{1,2}):(\d{2}))?/u);
  if (m) {
    monthName = m[1].replace(/\./g, '').toLowerCase();
    day = Number(m[2]);
    year = m[3] ? Number(m[3]) : null;
    if (m[4]) hour = Number(m[4]);
    if (m[5]) minute = Number(m[5]);
  } else {
    m = text.match(/\b(\d{1,2})\s+([A-Za-zА-Яа-яЁё.]+)(?:\s+(\d{4}))?(?:,?\s+(\d{1,2}):(\d{2}))?/u);
    if (!m) return '';
    day = Number(m[1]);
    monthName = m[2].replace(/\./g, '').toLowerCase();
    year = m[3] ? Number(m[3]) : null;
    if (m[4]) hour = Number(m[4]);
    if (m[5]) minute = Number(m[5]);
  }

  const month = months[monthName];
  if (month === undefined || !day || day > 31) return '';

  const now = new Date();
  if (!year) {
    year = now.getUTCFullYear();
    // Teletype often omits the year for recent posts. If the inferred date is
    // clearly in the future, it belongs to the previous year.
    const tentative = Date.UTC(year, month, day, hour, minute);
    if (tentative - now.getTime() > 7 * 86400000) year -= 1;
  }

  const date = new Date(Date.UTC(year, month, day, hour, minute));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function extractPublishedAt(html) {
  const source = String(html || '');

  // Standard metadata / JSON-LD first.
  const metaCandidates = [
    extractMeta(source, 'property', 'article:published_time'),
    extractMeta(source, 'property', 'og:published_time'),
    extractMeta(source, 'name', 'date'),
    extractMeta(source, 'name', 'publish_date'),
    extractMeta(source, 'name', 'published_time'),
    extractMeta(source, 'itemprop', 'datePublished'),
  ];
  for (const value of metaCandidates) {
    const normalized = normalizePublishedAt(value);
    if (normalized) return normalized;
  }

  const serialized = normalizeSerializedHtml(source);
  const stringPatterns = [
    /["']datePublished["']\s*:\s*["']([^"']+)["']/i,
    /["']publishedAt["']\s*:\s*["']([^"']+)["']/i,
    /["']published_at["']\s*:\s*["']([^"']+)["']/i,
    /["']createdAt["']\s*:\s*["']([^"']+)["']/i,
    /["']created_at["']\s*:\s*["']([^"']+)["']/i,
  ];
  for (const re of stringPatterns) {
    const match = serialized.match(re);
    const normalized = normalizePublishedAt(match?.[1]);
    if (normalized) return normalized;
  }

  const numericPatterns = [
    /["']publishedAt["']\s*:\s*(\d{10,13})/i,
    /["']published_at["']\s*:\s*(\d{10,13})/i,
    /["']createdAt["']\s*:\s*(\d{10,13})/i,
  ];
  for (const re of numericPatterns) {
    const match = serialized.match(re);
    const normalized = normalizePublishedAt(match?.[1]);
    if (normalized) return normalized;
  }

  // Semantic <time datetime="..."> fallback.
  for (const tag of source.match(/<time\b[^>]*>/gi) || []) {
    const normalized = normalizePublishedAt(extractAttribute(tag, 'datetime'));
    if (normalized) return normalized;
  }

  // Last fallback: Teletype's visible article date. This is useful when the SSR
  // page only contains text such as "April 24" / "24 апреля".
  const dateClassPatterns = [
    /<[^>]*class=(["'])[^"']*(?:article__header_date|article__date|article__header_time)[^"']*\1[^>]*>([\s\S]*?)<\/[^>]+>/i,
    /<time\b[^>]*>([\s\S]*?)<\/time>/i,
  ];
  for (const re of dateClassPatterns) {
    const match = source.match(re);
    const visible = match?.[2] ?? match?.[1];
    const normalized = parseVisibleTeletypeDate(visible);
    if (normalized) return normalized;
  }

  return '';
}

function formatGuideDate(iso, lang) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function extractBalancedElementInner(html, startIndex, openingTag) {
  const open = String(openingTag || '');
  const nameMatch = open.match(/^<\s*([a-zA-Z][\w:-]*)\b/);
  if (!nameMatch) return '';

  const tagName = nameMatch[1];
  const openEnd = startIndex + open.length;
  const tokenRe = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  tokenRe.lastIndex = openEnd;
  let depth = 1;
  let token;

  while ((token = tokenRe.exec(html))) {
    const value = token[0];
    const closing = /^<\s*\//.test(value);
    const selfClosing = /\/\s*>$/.test(value);

    if (closing) {
      depth -= 1;
      if (depth === 0) return html.slice(openEnd, token.index);
    } else if (!selfClosing) {
      depth += 1;
    }
  }

  // If Teletype returned malformed SSR markup, preserving everything after the
  // opening container is safer than silently truncating the article.
  return html.slice(openEnd);
}

function findElementInnerByClass(html, className) {
  const source = String(html || '');
  const openRe = /<([a-zA-Z][\w:-]*)\b[^>]*>/g;
  let match;

  while ((match = openRe.exec(source))) {
    const openingTag = match[0];
    const classes = extractAttribute(openingTag, 'class')
      .split(/\s+/)
      .filter(Boolean);
    if (!classes.includes(className)) continue;

    return {
      tagName: match[1].toLowerCase(),
      openingTag,
      start: match.index,
      content: extractBalancedElementInner(source, match.index, openingTag),
    };
  }

  return null;
}

function extractArticle(html) {
  const source = String(html || '');
  const titleMatch = source.match(
    /<h1\b[^>]*class=(["'])[^"']*\barticle__header_title\b[^"']*\1[^>]*>([\s\S]*?)<\/h1>/i
  );

  const article = findElementInnerByClass(source, 'article__content');

  return {
    title: titleMatch ? plainText(titleMatch[2]) : extractPageTitle(source),
    content: article?.content || '',
    containerTag: article?.tagName || '',
  };
}

function annotateFigureGeometry(html) {
  return String(html || '').replace(
    /<figure\b([^>]*)>([\s\S]*?)<\/figure>/gi,
    (whole, attrs, inner) => {
      const opening = `<figure${attrs}>`;
      const className = extractAttribute(opening, 'class');

      let width = 0;
      let height = 0;
      const spacer = inner.match(/<svg\b[^>]*\bclass=(["'])[^"']*\bspacer\b[^"']*\1[^>]*>/i)?.[0] || '';
      const viewBox = extractAttribute(spacer, 'viewbox') || extractAttribute(spacer, 'viewBox');
      if (viewBox) {
        const nums = viewBox.trim().split(/[\s,]+/).map(Number);
        if (nums.length >= 4 && nums.every(Number.isFinite)) {
          width = Math.abs(nums[2]);
          height = Math.abs(nums[3]);
        }
      }

      if (!width) width = Number(extractAttribute(spacer, 'width')) || 0;
      if (!height) height = Number(extractAttribute(spacer, 'height')) || 0;

      if ((!width || !height) && /<img\b/i.test(inner)) {
        const img = inner.match(/<img\b[^>]*>/i)?.[0] || '';
        width = width || Number(extractAttribute(img, 'width')) || 0;
        height = height || Number(extractAttribute(img, 'height')) || 0;
      }

      if (!width || !height) return whole;

      const retina = /(?:^|\s)m_retina(?:\s|$)/i.test(className);
      const displayWidth = retina ? width / 2 : width;
      let nextAttrs = attrs;
      nextAttrs += ` data-media-original-width="${Math.round(width)}"`;
      nextAttrs += ` data-media-original-height="${Math.round(height)}"`;
      nextAttrs += ` data-media-display-width="${Math.max(1, Math.round(displayWidth))}"`;
      nextAttrs += ` data-media-aspect="${width / height}"`;
      return `<figure${nextAttrs}>${inner}</figure>`;
    }
  );
}

function absoluteUrl(value, baseUrl) {
  if (!value) return value;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function isAllowedGuideUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' &&
      parsed.hostname === ALLOWED_HOST &&
      parsed.pathname.startsWith(ALLOWED_AUTHOR_PREFIX);
  } catch {
    return false;
  }
}

function normalizeSerializedHtml(source) {
  return String(source || '')
    .replace(/\\u002F/gi, '/')
    .replace(/\\u003A/gi, ':')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003F/gi, '?')
    .replace(/\\u003D/gi, '=')
    .replace(/\\u0025/gi, '%')
    .replace(/\\x2F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&');
}

function cleanImageCandidate(raw, baseUrl) {
  if (!raw) return '';
  let value = decodeEntities(normalizeSerializedHtml(raw)).trim();
  value = value.replace(/[\\"'<>\]\[}{),;]+$/g, '');

  if (/^https%3A%2F%2F/i.test(value)) {
    try { value = decodeURIComponent(value); } catch {}
  }

  const absolute = absoluteUrl(value, baseUrl);
  if (!absolute || !/^https:\/\/img\d*\.teletype\.in\//i.test(absolute)) return '';
  return absolute;
}

function extractImageUrlsFromText(source, baseUrl) {
  const found = [];
  const seen = new Set();
  const normalized = normalizeSerializedHtml(source);

  const add = (raw) => {
    const value = cleanImageCandidate(raw, baseUrl);
    if (!value || seen.has(value)) return;
    seen.add(value);
    found.push(value);
  };

  // Direct Teletype CDN URLs. Do not require a file extension: some lazy-media
  // payloads carry transformed URLs that end in query parameters or variants.
  const directRe = /https:\/\/img\d*\.teletype\.in\/files\/[^\s"'<>\\]+/gi;
  for (const match of normalized.matchAll(directRe)) add(match[0]);

  // Explicit image attributes can contain relative/escaped URLs.
  const tagRe = /<(?:img|source)\b[^>]*>/gi;
  for (const tag of normalized.match(tagRe) || []) {
    for (const attr of ['src', 'data-src', 'data-original', 'data-image', 'data-url', 'data-lazy-src']) {
      add(extractAttribute(tag, attr));
    }

    for (const attr of ['srcset', 'data-srcset']) {
      const srcset = extractAttribute(tag, attr);
      if (srcset) {
        for (const part of srcset.split(',')) add(part.trim().split(/\s+/)[0]);
      }
    }
  }

  // Some Teletype payloads keep media in CSS/background values.
  const cssUrlRe = /url\(\s*(['"]?)(https:\/\/img\d*\.teletype\.in\/[^)'"\s]+)\1\s*\)/gi;
  for (const match of normalized.matchAll(cssUrlRe)) add(match[2]);

  // Encoded CDN URLs sometimes appear inside serialized client payloads.
  const encodedRe = /https%3A%2F%2Fimg\d*\.teletype\.in%2Ffiles%2F[^\s"'<>\\]+/gi;
  for (const match of String(source || '').matchAll(encodedRe)) add(match[0]);

  return found;
}

function extractTeletypeImages(sourceHtml, baseUrl) {
  const found = [];
  const seen = new Set();
  const add = (raw) => {
    const value = cleanImageCandidate(raw, baseUrl);
    if (!value || seen.has(value)) return;
    seen.add(value);
    found.push(value);
  };

  // Keep page/payload order first; this is much more useful for mapping lazy
  // <figure> blocks than putting og:image at index 0 unconditionally.
  for (const url of extractImageUrlsFromText(sourceHtml, baseUrl)) add(url);

  // Metadata is a fallback and usually represents the article cover.
  add(extractMeta(sourceHtml, 'property', 'og:image'));
  add(extractMeta(sourceHtml, 'name', 'twitter:image'));

  return found.slice(0, 160);
}

function figureDescriptors(html) {
  const result = [];
  const re = /<figure\b([^>]*)>/gi;
  let match;
  while ((match = re.exec(String(html || '')))) {
    const tag = `<figure${match[1]}>`;
    result.push({
      nodeId: extractAttribute(tag, 'data-node-id'),
      anchor: extractAttribute(tag, 'data-anchor'),
      originalWidth: Number(extractAttribute(tag, 'data-media-original-width')) || 0,
      originalHeight: Number(extractAttribute(tag, 'data-media-original-height')) || 0,
      displayWidth: Number(extractAttribute(tag, 'data-media-display-width')) || 0,
    });
  }
  return result;
}

function findNearbyFigureImage(sourceHtml, descriptor, baseUrl) {
  const normalized = normalizeSerializedHtml(sourceHtml);
  const markers = [];
  if (descriptor?.nodeId) {
    markers.push(`data-node-id="${descriptor.nodeId}"`);
    markers.push(`data-node-id='${descriptor.nodeId}'`);
    markers.push(`"nodeId":"${descriptor.nodeId}"`);
    markers.push(`"nodeId":${descriptor.nodeId}`);
    markers.push(`"node_id":"${descriptor.nodeId}"`);
    markers.push(`"nodeId":${descriptor.nodeId}`);
    markers.push(`"id":${descriptor.nodeId}`);
    markers.push(`"id":"${descriptor.nodeId}"`);
  }
  if (descriptor?.anchor) {
    markers.push(`data-anchor="${descriptor.anchor}"`);
    markers.push(`"anchor":"${descriptor.anchor}"`);
  }

  let best = '';
  let bestDistance = Infinity;

  for (const marker of markers) {
    let offset = 0;
    while (true) {
      const index = normalized.indexOf(marker, offset);
      if (index < 0) break;
      offset = index + marker.length;

      const from = Math.max(0, index - 12000);
      const to = Math.min(normalized.length, index + marker.length + 12000);
      const chunk = normalized.slice(from, to);
      const images = extractImageUrlsFromText(chunk, baseUrl);
      for (const image of images) {
        const local = chunk.indexOf(image);
        const absolutePos = local >= 0 ? from + local : index;
        const distance = Math.abs(absolutePos - index);
        if (distance < bestDistance) {
          best = image;
          bestDistance = distance;
        }
      }
    }
  }

  return best;
}

function extractGuideLinks(html, sourceUrl) {
  const source = new URL(sourceUrl);
  const found = [];
  const seen = new Set();
  const anchorRe = /<a\b([^>]*)href\s*=\s*(["'])(.*?)\2([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRe.exec(html))) {
    const rawHref = decodeEntities(match[3]);
    let absolute;
    try {
      absolute = new URL(rawHref, sourceUrl);
    } catch {
      continue;
    }

    if (absolute.hostname !== ALLOWED_HOST) continue;
    if (!absolute.pathname.startsWith(ALLOWED_AUTHOR_PREFIX)) continue;
    if (absolute.pathname === source.pathname) continue;

    const rest = absolute.pathname.slice(ALLOWED_AUTHOR_PREFIX.length);
    if (!rest || rest === '/' || rest.startsWith('+')) continue;

    absolute.hash = '';
    const key = absolute.pathname + absolute.search;
    if (seen.has(key)) continue;

    seen.add(key);
    found.push(absolute.toString());
    if (found.length >= INDEX_LIMIT) break;
  }

  return found;
}

function makePreview(html, max = 220) {
  const value = plainText(html)
    .replace(/^\[(?:RU|ENG|EN)\]\s*/i, '')
    .trim();
  if (!value) return '';
  if (value.length <= max) return value;
  return value.slice(0, max - 1).trimEnd() + '…';
}

async function fetchTeletypeHtml(url) {
  const upstream = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 LAPBase Guide Reader',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ru,en;q=0.8',
    },
    redirect: 'follow',
  });

  if (!upstream.ok) {
    throw new Error(`Teletype returned ${upstream.status}`);
  }

  return {
    html: await upstream.text(),
    finalUrl: upstream.url || url,
  };
}


function allowedAuthorUri() {
  const match = ALLOWED_AUTHOR_PREFIX.match(/^\/@([^/]+)\//);
  return match ? match[1] : '';
}

function normalizeFeedArticleUrl(rawUrl, baseUrl) {
  if (!rawUrl) return '';
  try {
    const url = new URL(decodeEntities(String(rawUrl).trim()), baseUrl);
    if (url.hostname !== ALLOWED_HOST) return '';
    if (!url.pathname.startsWith(ALLOWED_AUTHOR_PREFIX)) return '';
    const rest = url.pathname.slice(ALLOWED_AUTHOR_PREFIX.length);
    if (!rest || rest === '/' || rest.startsWith('+')) return '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|yclid$|gclid$|fbclid$)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return '';
  }
}

function stripXmlCdata(value) {
  return decodeEntities(String(value || '')
    .replace(/^\s*<!\[CDATA\[/i, '')
    .replace(/\]\]>\s*$/i, '')
    .trim());
}

function rssTagValue(block, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(block || '').match(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return match ? stripXmlCdata(match[1]) : '';
}

function extractRssItems(xml, feedUrl) {
  const items = [];
  const seen = new Set();
  const re = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = re.exec(String(xml || ''))) && items.length < RSS_MAX_ITEMS) {
    const block = match[1];
    const guid = rssTagValue(block, 'guid');
    const link = rssTagValue(block, 'link');
    const url = normalizeFeedArticleUrl(guid || link, feedUrl);
    if (!url) continue;
    const key = new URL(url).pathname;
    if (seen.has(key)) continue;
    seen.add(key);

    const categories = [];
    const catRe = /<category\b[^>]*>([\s\S]*?)<\/category>/gi;
    let cat;
    while ((cat = catRe.exec(block))) categories.push(stripXmlCdata(cat[1]));

    items.push({
      url,
      title: rssTagValue(block, 'title'),
      publishedAt: rssTagValue(block, 'pubDate'),
      description: rssTagValue(block, 'description'),
      categories,
    });
  }
  return items;
}

function extractRssNextUrl(xml, feedUrl) {
  const tags = String(xml || '').match(/<(?:atom:)?link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const rel = extractAttribute(tag, 'rel');
    if (String(rel).toLowerCase() !== 'next') continue;
    const href = extractAttribute(tag, 'href');
    if (!href) continue;
    try {
      const next = new URL(decodeEntities(href), feedUrl);
      if (next.hostname === ALLOWED_HOST && next.pathname.startsWith('/rss/')) return next.toString();
    } catch {}
  }
  return '';
}

async function fetchTeletypeRssIndex() {
  const author = allowedAuthorUri();
  if (!author) return { items: [], pages: 0, exhausted: true };

  let nextUrl = `https://${ALLOWED_HOST}/rss/${encodeURIComponent(author)}`;
  const seenFeeds = new Set();
  const seenArticles = new Set();
  const items = [];
  let pages = 0;

  while (nextUrl && pages < RSS_MAX_PAGES && items.length < RSS_MAX_ITEMS) {
    if (seenFeeds.has(nextUrl)) break;
    seenFeeds.add(nextUrl);

    let response;
    try {
      response = await fetch(nextUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 LAPBase Guide Reader',
          'Accept': 'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.6',
          'Accept-Language': 'ru,en;q=0.8',
        },
        redirect: 'follow',
      });
    } catch {
      break;
    }
    if (!response.ok) break;

    const finalFeedUrl = response.url || nextUrl;
    const xml = await response.text();
    pages += 1;

    for (const item of extractRssItems(xml, finalFeedUrl)) {
      let key = item.url;
      try { key = new URL(item.url).pathname; } catch {}
      if (seenArticles.has(key)) continue;
      seenArticles.add(key);
      items.push(item);
      if (items.length >= RSS_MAX_ITEMS) break;
    }

    const discoveredNext = extractRssNextUrl(xml, finalFeedUrl);
    if (!discoveredNext || seenFeeds.has(discoveredNext)) {
      nextUrl = '';
      break;
    }
    nextUrl = discoveredNext;
  }

  return {
    items,
    pages,
    exhausted: !nextUrl,
  };
}


function isLastAsylumArticleHtml(html) {
  const source = normalizeSerializedHtml(String(html || ''));
  // Prefer the article's category/channel link. Do not scan arbitrary article
  // body text, otherwise unrelated posts that merely mention the game could
  // leak into the knowledge base.
  const anchors = source.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [];
  return anchors.some(anchor =>
    /\+last(?:-)?asylum(?:-)?plague/i.test(anchor) ||
    /\+lastasylumplague/i.test(anchor) ||
    /Last\s+Asylum\s*:\s*Plague/i.test(plainText(anchor))
  );
}

function indexCandidateUrl(baseUrl, page, mode) {
  const url = new URL(baseUrl);
  url.hash = '';
  const offset = Math.max(0, (page - 1) * INDEX_PAGE_SIZE);
  if (mode === 'page') url.searchParams.set('page', String(page));
  if (mode === 'offset') url.searchParams.set('offset', String(offset));
  if (mode === 'skip') url.searchParams.set('skip', String(offset));
  return url.toString();
}

async function getIndexPageLinks(baseUrl, baseHtml, page) {
  const baseLinks = extractGuideLinks(baseHtml, baseUrl);
  if (page <= 1) {
    return {
      links: baseLinks.slice(0, INDEX_PAGE_SIZE),
      mode: 'collection:first',
      page: 1,
      hasMoreHint: baseLinks.length >= INDEX_PAGE_SIZE,
      requireLastAsylumFilter: false,
      discovery: { rssPages: 0, rssItems: 0 },
    };
  }

  const baseSet = new Set(baseLinks.map(url => {
    try { const u = new URL(url); return u.pathname; } catch { return url; }
  }));

  // Teletype's visible blog/collection HTML is server-rendered with only ten
  // cards. Query-string guesses such as ?page=2 return the same first page.
  // The official page advertises an RSS feed, and that feed exposes rel="next"
  // links with Teletype's real offset cursor. Follow those links instead.
  try {
    const rss = await fetchTeletypeRssIndex();
    const novel = rss.items
      .map(item => item.url)
      .filter(url => {
        try { return !baseSet.has(new URL(url).pathname); }
        catch { return !baseSet.has(url); }
      });

    const start = Math.max(0, (page - 2) * INDEX_PAGE_SIZE);
    const links = novel.slice(start, start + INDEX_PAGE_SIZE);
    if (links.length || start < novel.length) {
      return {
        links,
        mode: 'rss:cursor',
        page,
        hasMoreHint: start + INDEX_PAGE_SIZE < novel.length,
        requireLastAsylumFilter: true,
        discovery: { rssPages: rss.pages, rssItems: rss.items.length, rssNovelItems: novel.length },
      };
    }

    // If RSS was read successfully and we are past its end, stop here instead
    // of falling back to guessed query parameters that duplicate page one.
    if (rss.pages > 0) {
      return {
        links: [],
        mode: 'rss:exhausted',
        page,
        hasMoreHint: false,
        requireLastAsylumFilter: true,
        discovery: { rssPages: rss.pages, rssItems: rss.items.length, rssNovelItems: novel.length },
      };
    }
  } catch (_) {}

  // Compatibility fallback for a temporary RSS outage.
  const authorRoot = `https://${ALLOWED_HOST}/@${allowedAuthorUri()}`;
  const candidates = [
    { url: indexCandidateUrl(baseUrl, page, 'page'), mode: 'collection:page-fallback', filter: false },
    { url: indexCandidateUrl(baseUrl, page, 'offset'), mode: 'collection:offset-fallback', filter: false },
    { url: indexCandidateUrl(baseUrl, page, 'skip'), mode: 'collection:skip-fallback', filter: false },
    { url: indexCandidateUrl(authorRoot, page, 'page'), mode: 'author:page-fallback', filter: true },
    { url: indexCandidateUrl(authorRoot, page, 'offset'), mode: 'author:offset-fallback', filter: true },
    { url: indexCandidateUrl(authorRoot, page, 'skip'), mode: 'author:skip-fallback', filter: true },
  ];

  for (const candidate of candidates) {
    try {
      const fetched = await fetchTeletypeHtml(candidate.url);
      const rawLinks = extractGuideLinks(fetched.html, fetched.finalUrl);
      const novel = rawLinks.filter(url => {
        try { return !baseSet.has(new URL(url).pathname); }
        catch { return !baseSet.has(url); }
      });
      if (!novel.length) continue;
      return {
        links: novel.slice(0, INDEX_PAGE_SIZE),
        mode: candidate.mode,
        page,
        hasMoreHint: rawLinks.length >= INDEX_PAGE_SIZE,
        requireLastAsylumFilter: candidate.filter,
        discovery: { rssPages: 0, rssItems: 0 },
      };
    } catch (_) {}
  }

  return {
    links: [],
    mode: 'exhausted',
    page,
    hasMoreHint: false,
    requireLastAsylumFilter: false,
    discovery: { rssPages: 0, rssItems: 0 },
  };
}

async function enrichGuide(url) {
  try {
    const fetched = await fetchTeletypeHtml(url);
    const extracted = extractArticle(fetched.html);
    const title = splitBilingualTitle(extracted.title || extractPageTitle(fetched.html));
    const images = extractTeletypeImages(fetched.html, fetched.finalUrl);
    const publishedAt = extractPublishedAt(fetched.html);

    // Read previews from the actual RU / ENG sections when the article is bilingual.
    // This fixes v3, where the English card reused the Russian og:description.
    const sections = extracted.content
      ? splitLanguageSections(extracted.content)
      : { ru: '', en: '', available: { ru: false, en: false }, mode: 'none' };

    const description = extractMeta(fetched.html, 'property', 'og:description') ||
      extractMeta(fetched.html, 'name', 'description') || '';

    const ruPreview = makePreview(sections.ru) || makePreview(description);
    const enPreview = makePreview(sections.en);

    return {
      url: fetched.finalUrl,
      title,
      preview: {
        ru: ruPreview,
        en: enPreview,
      },
      image: images[0] || '',
      publishedAt,
      availableLanguages: {
        ru: Boolean(sections.available?.ru || ruPreview),
        en: Boolean(sections.available?.en),
      },
      languageMode: sections.mode,
      isLastAsylum: isLastAsylumArticleHtml(fetched.html),
    };
  } catch {
    const fallback = url.split('/').pop() || 'Guide';
    return {
      url,
      title: { ru: fallback, en: fallback },
      preview: { ru: '', en: '' },
      image: '',
      publishedAt: '',
      availableLanguages: { ru: true, en: false },
      languageMode: 'fallback',
      isLastAsylum: true,
    };
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const result = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      result[index] = await mapper(items[index], index);
    }
  }

  const count = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: count }, () => worker()));
  return result;
}

function buildIndexHtml(items, lang) {
  if (!items.length) return '';

  return `
    <div class="guide-index-list">
      ${items.map((item) => {
        const hasRequestedLanguage = item.availableLanguages?.[lang] !== false;
        const shownLang = hasRequestedLanguage ? lang : (item.availableLanguages?.ru ? 'ru' : lang);
        const title = item.title?.[shownLang] || item.title?.ru || item.title?.en || 'Guide';
        const preview = item.preview?.[shownLang] || '';
        const open = lang === 'en' ? 'Open' : 'Открыть';
        const badge = lang === 'en' && !item.availableLanguages?.en
          ? '<span class="guide-index-language-badge">RU only</span>'
          : '';
        const dateLabel = formatGuideDate(item.publishedAt, lang);
        const dateHtml = dateLabel
          ? `<time class="guide-index-date" datetime="${escapeHtml(item.publishedAt)}">${escapeHtml(dateLabel)}</time>`
          : '';

        return `
        <a class="guide-index-card" href="${escapeHtml(item.url)}" data-lapbase-guide-link="1">
          ${item.image ? `<img class="guide-index-image" src="${escapeHtml(item.image)}" alt="" loading="lazy" decoding="async">` : ''}
          <div class="guide-index-copy">
            ${badge}
            ${dateHtml}
            <div class="guide-index-title">${escapeHtml(title)}</div>
            ${preview ? `<div class="guide-index-preview">${escapeHtml(preview)}</div>` : ''}
            <div class="guide-index-open">${open}</div>
          </div>
        </a>`;
      }).join('')}
    </div>
  `;
}

async function sanitizeArticleHtml(content, sourceUrl) {
  let imageCount = 0;
  let linkCount = 0;

  // Teletype's SSR output contains Vue comments such as <!--[-->. They are
  // harmless but noisy, so remove them before the HTMLRewriter pass.
  const withoutFrameworkComments = String(content || '').replace(/<!--[\s\S]*?-->/g, '');

  const input = new Response(`<div id="lapbase-guide-root">${withoutFrameworkComments}</div>`, {
    headers: { 'Content-Type': 'text/html; charset=UTF-8' },
  });

  const transformed = new HTMLRewriter()
    .on('script', { element(el) { el.remove(); } })
    .on('style', { element(el) { el.remove(); } })
    .on('noscript', { element(el) { el.remove(); } })
    .on('iframe', { element(el) { el.remove(); } })
    .on('form', { element(el) { el.remove(); } })
    .on('button', { element(el) { el.remove(); } })
    .on('.loader', { element(el) { el.remove(); } })
    .on('svg.spacer', { element(el) { el.remove(); } })
    .on('.contents', { element(el) { el.remove(); } })
    .on('*', {
      element(el) {
        for (const [name] of el.attributes) {
          if (name.toLowerCase().startsWith('on')) el.removeAttribute(name);
        }
        el.removeAttribute('style');
      },
    })
    .on('img', {
      element(el) {
        imageCount += 1;
        const src = el.getAttribute('src') || el.getAttribute('data-src');
        if (src) el.setAttribute('src', absoluteUrl(src, sourceUrl));
        el.removeAttribute('data-src');
        el.removeAttribute('srcset');
        el.setAttribute('loading', 'lazy');
        el.setAttribute('decoding', 'async');
      },
    })
    .on('a', {
      element(el) {
        linkCount += 1;
        const href = el.getAttribute('href');
        if (!href) return;
        const absolute = absoluteUrl(href, sourceUrl);
        el.setAttribute('href', absolute);
        el.removeAttribute('target');
        if (isAllowedGuideUrl(absolute)) {
          el.setAttribute('data-lapbase-guide-link', '1');
        }
      },
    })
    .transform(input);

  const wrapped = await transformed.text();
  const match = wrapped.match(/<div\s+id="lapbase-guide-root">([\s\S]*)<\/div>/i);

  return {
    html: match ? match[1] : wrapped,
    imageCount,
    linkCount,
  };
}

function headingBlocks(html) {
  const blocks = [];
  const re = /<(h[1-4])\b[^>]*>[\s\S]*?<\/\1>/gi;
  let match;
  while ((match = re.exec(String(html || '')))) {
    blocks.push({
      start: match.index,
      end: re.lastIndex,
      html: match[0],
      tagName: match[1].toLowerCase(),
      text: plainText(match[0]),
    });
  }
  return blocks;
}

function isRuLanguageHeading(text) {
  return /^\[\s*RU\s*\](?:\s|$)/i.test(String(text || '').trim());
}

function isEnLanguageHeading(text) {
  return /^\[\s*(?:EN|ENG)\s*\](?:\s|$)/i.test(String(text || '').trim());
}

function sharedMediaFromPrefix(prefix) {
  if (!prefix) return '';
  const pieces = [];
  const re = /<figure\b[^>]*>[\s\S]*?<\/figure>|<img\b[^>]*>/gi;
  let match;
  while ((match = re.exec(prefix))) pieces.push(match[0]);
  if (!pieces.length) return '';

  pieces[0] = pieces[0].replace(/<figure\b([^>]*)>/i, (whole, attrs) => {
    if (/\bguide-cover-media\b/i.test(attrs)) return whole;
    const classMatch = attrs.match(/\bclass=(["'])(.*?)\1/i);
    if (classMatch) {
      const next = classMatch[2] + ' guide-cover-media';
      return `<figure${attrs.replace(classMatch[0], `class=${classMatch[1]}${next}${classMatch[1]}`)}>`;
    }
    return `<figure class="guide-cover-media"${attrs}>`;
  });

  return pieces.join('');
}


function stripLeadingHeaderMedia(html) {
  let value = String(html || '').trim();
  // Teletype can place profile/cover media before the actual article language
  // marker. LAPBase intentionally starts with the article text instead.
  value = value.replace(/^(?:\s*<figure\b[^>]*>[\s\S]*?<\/figure>\s*)+/i, '');
  return value.trim();
}

function splitLanguageSections(html) {
  const source = String(html || '');
  const headings = headingBlocks(source);
  const ruHeading = headings.find(h => isRuLanguageHeading(h.text));
  const enHeading = headings.find(h => isEnLanguageHeading(h.text));

  if (!ruHeading && !enHeading) {
    const body = stripLeadingHeaderMedia(source);
    return {
      ru: body,
      en: '',
      sharedMedia: '',
      available: { ru: true, en: false },
      mode: 'single',
    };
  }

  const languageHeadings = headings
    .filter(h => isRuLanguageHeading(h.text) || isEnLanguageHeading(h.text))
    .sort((a, b) => a.start - b.start);
  const firstLanguageStart = languageHeadings[0]?.start ?? 0;
  // sanitizeArticleHtml has already removed Teletype's native TOC/scripts, so
  // keep the complete remaining prefix. This preserves cover media and any
  // introduction blocks that appear before the [RU]/[ENG] marker.
  // Do not prepend Teletype's author/profile/cover block to the native reader.
  // The article begins at its language section; inline media inside the section is preserved.
  const sharedMedia = '';

  const sliceAfter = (heading) => {
    if (!heading) return '';
    const next = languageHeadings.find(h => h.start > heading.start);
    return source.slice(heading.end, next ? next.start : source.length).trim();
  };

  const ru = sliceAfter(ruHeading);
  const en = sliceAfter(enHeading);

  return {
    ru: ru || (!en ? source : ''),
    en,
    sharedMedia,
    available: { ru: Boolean(ru), en: Boolean(en) },
    mode: ru && en ? 'bilingual' : 'single',
  };
}

function buildTocAndAnchors(sectionHtml, lang) {
  if (!sectionHtml) return { html: '', toc: '', count: 0 };

  let counter = 0;
  const items = [];
  const html = String(sectionHtml).replace(
    /<(h[1-4])\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (whole, tagName, attrs, inner) => {
      const text = plainText(inner);
      if (!text || isRuLanguageHeading(text) || isEnLanguageHeading(text)) return whole;

      const opening = `<${tagName}${attrs}>`;
      const sourceAnchor = extractAttribute(opening, 'data-anchor') ||
        extractAttribute(opening, 'id') ||
        (inner.match(/<a\b[^>]*\bname=(["'])(.*?)\1/i)?.[2] ? decodeEntities(inner.match(/<a\b[^>]*\bname=(["'])(.*?)\1/i)[2]) : '');

      counter += 1;
      const id = `lapbase-toc-${lang}-${String(counter).padStart(2, '0')}`;
      const level = Number(tagName.slice(1)) || 2;
      items.push({ id, sourceAnchor, text, level });

      let nextAttrs = String(attrs || '')
        .replace(/\s+id\s*=\s*(["']).*?\1/gi, '');
      nextAttrs += ` id="${id}"`;
      if (sourceAnchor) nextAttrs += ` data-teletype-anchor="${escapeHtml(sourceAnchor)}"`;
      return `<${tagName}${nextAttrs}>${inner}</${tagName}>`;
    }
  );

  if (items.length < 2) return { html, toc: '', count: items.length };

  const title = lang === 'en' ? 'Contents' : 'Оглавление';
  const toc = `
    <nav class="guide-toc" data-guide-generated-toc="1" aria-label="${escapeHtml(title)}">
      <div class="guide-toc-title">${escapeHtml(title)}</div>
      <ul class="guide-toc-list">
        ${items.map(item => `
          <li class="guide-toc-item level-${item.level}">
            <a href="#${item.id}">${escapeHtml(item.text)}</a>
          </li>`).join('')}
      </ul>
    </nav>
  `;

  return { html, toc, count: items.length };
}

function composeLanguageSection(sectionHtml, sharedMedia, lang) {
  if (!sectionHtml) return { html: '', tocCount: 0 };
  const built = buildTocAndAnchors(sectionHtml, lang);
  return {
    html: `${sharedMedia || ''}${built.toc}${built.html}`,
    tocCount: built.count,
  };
}

function injectLazyFigureImages(html, imageUrls, sourceHtml, baseUrl) {
  if (!html) return { html, injected: 0, hinted: 0, fallback: 0, figures: 0, unresolved: 0 };

  const descriptors = figureDescriptors(html);
  let descriptorCursor = 0;
  let imageCursor = 0;
  let injected = 0;
  let hinted = 0;
  let fallback = 0;
  let unresolved = 0;
  const usedImages = new Set();

  const nextFallback = () => {
    while (imageCursor < (imageUrls?.length || 0)) {
      const candidate = imageUrls[imageCursor++];
      if (!candidate || usedImages.has(candidate)) continue;
      usedImages.add(candidate);
      return candidate;
    }
    return '';
  };

  const output = String(html).replace(/<figure\b([^>]*)>([\s\S]*?)<\/figure>/gi, (whole, attrs, inner) => {
    const descriptor = descriptors[descriptorCursor++] || {};

    // Preserve already-rendered images and mark them as used so they are not
    // injected again into another lazy figure later in the document.
    if (/<img\b/i.test(inner)) {
      const existingTags = inner.match(/<img\b[^>]*>/gi) || [];
      for (const tag of existingTags) {
        const src = cleanImageCandidate(extractAttribute(tag, 'src'), baseUrl);
        if (src) usedImages.add(src);
      }
      return whole;
    }

    let src = findNearbyFigureImage(sourceHtml, descriptor, baseUrl);
    if (src && usedImages.has(src)) src = '';
    if (src) {
      usedImages.add(src);
      hinted += 1;
    }

    if (!src) {
      src = nextFallback();
      if (src) fallback += 1;
    }

    if (!src) {
      unresolved += 1;
      return whole;
    }

    injected += 1;
    const cleanInner = inner
      .replace(/<div\b[^>]*class=(['"])[^"']*\bloader\b[^"']*\1[^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<svg\b[^>]*class=(['"])[^"']*\bspacer\b[^"']*\1[^>]*>[\s\S]*?<\/svg>/gi, '');

    const sizeAttrs = descriptor.originalWidth && descriptor.originalHeight
      ? ` width="${descriptor.originalWidth}" height="${descriptor.originalHeight}"`
      : '';
    return `<figure${attrs}>${cleanInner}<img src="${escapeHtml(src)}" alt=""${sizeAttrs} loading="lazy" decoding="async"></figure>`;
  });

  return { html: output, injected, hinted, fallback, figures: descriptors.length, unresolved };
}

async function articleApi(request) {
  const requestUrl = new URL(request.url);
  const rawUrl = requestUrl.searchParams.get('url');
  const requestedPage = Math.max(1, Math.min(INDEX_MAX_PAGE, Number.parseInt(requestUrl.searchParams.get('page') || '1', 10) || 1));

  if (!rawUrl) return json({ ok: false, error: 'Missing url parameter' }, 400);

  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    return json({ ok: false, error: 'Invalid URL' }, 400);
  }

  if (!isAllowedGuideUrl(target.toString())) {
    return json({ ok: false, error: 'URL is not allowed' }, 403);
  }

  const fetched = await fetchTeletypeHtml(target.toString());
  const sourceHtml = fetched.html;
  const finalUrl = fetched.finalUrl;
  const extracted = extractArticle(sourceHtml);

  if (extracted.content) {
    const geometryAwareContent = annotateFigureGeometry(extracted.content);
    const clean = await sanitizeArticleHtml(geometryAwareContent, finalUrl);
    const imageUrls = extractTeletypeImages(sourceHtml, finalUrl);
    const withImages = injectLazyFigureImages(clean.html, imageUrls, sourceHtml, finalUrl);
    const sections = splitLanguageSections(withImages.html);
    const titles = splitBilingualTitle(extracted.title || 'LAPBase Guide');
    const ruView = composeLanguageSection(sections.ru, sections.sharedMedia, 'ru');
    const enView = composeLanguageSection(sections.en, sections.sharedMedia, 'en');

    return json({
      ok: true,
      type: 'article',
      title: titles,
      html: {
        ru: ruView.html,
        en: enView.html,
      },
      availableLanguages: sections.available,
      publishedAt: extractPublishedAt(sourceHtml),
      sourceUrl: finalUrl,
      assets: {
        images: imageUrls,
      },
      meta: {
        sourceImages: imageUrls.length,
        htmlImages: clean.imageCount,
        injectedImages: withImages.injected,
        hintedImages: withImages.hinted,
        fallbackImages: withImages.fallback,
        unresolvedFigures: withImages.unresolved,
        lazyFigures: withImages.figures,
        tocItems: { ru: ruView.tocCount, en: enView.tocCount },
        links: clean.linkCount,
        languageMode: sections.mode,
        parser: 'article__content-v5.4-balanced',
        sourceContentLength: extracted.content.length,
        sanitizedContentLength: clean.html.length,
        articleContainerTag: extracted.containerTag || '',
      },
    });
  }

  // The +lastasylumplague page is a collection/profile-like page. Its visible
  // cards contain dates in the anchor text, so v3 follows those links and reads
  // each article's own metadata to get the actual title / cover.
  const firstPageLinks = extractGuideLinks(sourceHtml, finalUrl);
  if (firstPageLinks.length) {
    const pageData = await getIndexPageLinks(finalUrl, sourceHtml, requestedPage);
    let items = await mapWithConcurrency(pageData.links, INDEX_CONCURRENCY, enrichGuide);

    if (pageData.requireLastAsylumFilter) {
      items = items.filter(item => item.isLastAsylum !== false);
    }

    // Internal classification is useful while crawling the author's fallback
    // feed, but the WebApp does not need it in public JSON.
    items = items.map(({ isLastAsylum, ...item }) => item);

    return json({
      ok: true,
      type: 'index',
      title: {
        ru: 'База знаний',
        en: 'Knowledge Base',
      },
      html: {
        ru: buildIndexHtml(items, 'ru'),
        en: buildIndexHtml(items, 'en'),
      },
      availableLanguages: { ru: true, en: true },
      sourceUrl: finalUrl,
      items,
      pagination: {
        page: requestedPage,
        pageSize: items.length,
        hasMore: Boolean(pageData.hasMoreHint && items.length),
        mode: pageData.mode,
      },
      meta: {
        guides: items.length,
        parser: 'enriched-guide-index-v5.17-rss-cursor',
        englishGuides: items.filter(item => item.availableLanguages?.en).length,
        ruOnlyGuides: items.filter(item => !item.availableLanguages?.en).length,
        datedGuides: items.filter(item => Boolean(item.publishedAt)).length,
        page: requestedPage,
        paginationMode: pageData.mode,
        discovery: pageData.discovery || {},
      },
    });
  }

  return json({
    ok: false,
    error: 'Teletype page loaded, but no article body or guide links were found',
    debug: {
      finalUrl,
      pageTitle: extractPageTitle(sourceHtml),
      htmlLength: sourceHtml.length,
    },
  }, 422);
}

async function reverseProxy(request) {
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, 'https://teletype.in');

  const response = await fetch(targetUrl.toString(), {
    method: request.method,
    headers: {
      'User-Agent': 'Mozilla/5.0 LAPBase Guide Proxy',
      'Accept': request.headers.get('Accept') || '*/*',
      'Accept-Language': request.headers.get('Accept-Language') || 'ru,en;q=0.9',
    },
    redirect: 'manual',
  });

  const headers = new Headers(response.headers);
  headers.delete('x-frame-options');
  headers.delete('content-security-policy');
  headers.delete('content-security-policy-report-only');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cache-Control', 'no-store');

  if (response.status >= 300 && response.status < 400 && headers.has('location')) {
    const location = headers.get('location');
    try {
      const redirectUrl = new URL(location, targetUrl);
      if (redirectUrl.hostname === ALLOWED_HOST) {
        headers.set('location', incomingUrl.origin + redirectUrl.pathname + redirectUrl.search + redirectUrl.hash);
      }
    } catch {}
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return json({ ok: true, service: 'lapbase-guides', version: '5.17' });
    }

    if (url.pathname === '/api/article') {
      try {
        return await articleApi(request);
      } catch (error) {
        return json({ ok: false, error: error?.message || 'Unknown Worker error' }, 500);
      }
    }

    return reverseProxy(request);
  },
};
