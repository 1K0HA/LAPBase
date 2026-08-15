// LAPBase Guides Worker — Free optimized
// Compatible with the current LAPBase /api/article API.
// Main optimization: the guide index no longer downloads/parses every article.
// It uses the collection page + Teletype RSS and enriches only ambiguous RSS items.

const ALLOWED_HOST = 'teletype.in';
const ALLOWED_AUTHOR_PREFIX = '/@1k0na_inf/';
const COLLECTION_SLUG = '+lastasylumplague';

const WORKER_VERSION = 'v1.0.2';
const CACHE_VERSION = 'v1.0.2-6';

// Small batches keep CPU predictable on Workers Free.
const INDEX_PAGE_SIZE = 5;
const INDEX_MAX_PAGE = 40;
const RSS_MAX_PAGES = 12;
const RSS_MAX_ITEMS = 160;
const CLASSIFY_CONCURRENCY = 2;

// Cache API is per Cloudflare data center, but it still removes most repeat work.
const INDEX_CACHE_SECONDS = 10 * 60;
const ARTICLE_CACHE_SECONDS = 6 * 60 * 60;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function plainText(html) {
  return decodeEntities(
    String(html ?? '')
      .replace(/<!--[^]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

function normalizeSerializedHtml(value) {
  return String(value ?? '')
    .replace(/\\u002F/gi, '/')
    .replace(/\\u003A/gi, ':')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003F/gi, '?')
    .replace(/\\u003D/gi, '=')
    .replace(/\\x2F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&');
}

function extractAttribute(tag, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(tag ?? '').match(
    new RegExp(`\\b${escaped}\\s*=\\s*(["'])([^]*?)\\1`, 'i')
  );
  return match ? decodeEntities(match[2]) : '';
}

function extractMeta(html, key, value) {
  const tags = String(html ?? '').match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const actual = extractAttribute(tag, key);
    if (actual && actual.toLowerCase() === String(value).toLowerCase()) {
      return extractAttribute(tag, 'content');
    }
  }
  return '';
}

function absoluteUrl(value, baseUrl) {
  if (!value) return '';
  try {
    return new URL(decodeEntities(value), baseUrl).toString();
  } catch {
    return '';
  }
}

function isAllowedGuideUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.hostname === ALLOWED_HOST &&
      url.pathname.startsWith(ALLOWED_AUTHOR_PREFIX);
  } catch {
    return false;
  }
}

function allowedAuthor() {
  const match = ALLOWED_AUTHOR_PREFIX.match(/^\/@([^/]+)\//);
  return match ? match[1] : '';
}

function canonicalArticleUrl(raw, baseUrl = `https://${ALLOWED_HOST}`) {
  try {
    const url = new URL(decodeEntities(String(raw ?? '').trim()), baseUrl);
    if (url.protocol !== 'https:' || url.hostname !== ALLOWED_HOST) return '';
    if (!url.pathname.startsWith(ALLOWED_AUTHOR_PREFIX)) return '';

    const rest = url.pathname.slice(ALLOWED_AUTHOR_PREFIX.length);
    if (!rest || rest.startsWith('+')) return '';

    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|yclid$|gclid$|fbclid$)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return '';
  }
}

function pathKey(value) {
  try {
    return new URL(value).pathname;
  } catch {
    return String(value ?? '');
  }
}

function normalizePublishedAt(raw) {
  const value = decodeEntities(normalizeSerializedHtml(String(raw ?? ''))).trim();
  if (!value) return '';

  if (/^\d{10,13}$/.test(value)) {
    let n = Number(value);
    if (value.length === 10) n *= 1000;
    const date = new Date(n);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function extractPublishedAt(html) {
  const candidates = [
    extractMeta(html, 'property', 'article:published_time'),
    extractMeta(html, 'property', 'og:published_time'),
    extractMeta(html, 'name', 'date'),
    extractMeta(html, 'name', 'publish_date'),
    extractMeta(html, 'itemprop', 'datePublished'),
  ];

  for (const candidate of candidates) {
    const iso = normalizePublishedAt(candidate);
    if (iso) return iso;
  }

  const source = normalizeSerializedHtml(html);
  const patterns = [
    /["']datePublished["']\s*:\s*["']([^"']+)["']/i,
    /["']publishedAt["']\s*:\s*["']([^"']+)["']/i,
    /["']published_at["']\s*:\s*["']([^"']+)["']/i,
    /["']createdAt["']\s*:\s*["']([^"']+)["']/i,
  ];

  for (const re of patterns) {
    const match = source.match(re);
    const iso = normalizePublishedAt(match?.[1]);
    if (iso) return iso;
  }

  for (const tag of source.match(/<time\b[^>]*>/gi) || []) {
    const iso = normalizePublishedAt(extractAttribute(tag, 'datetime'));
    if (iso) return iso;
  }

  return '';
}

function splitBilingualTitle(rawTitle) {
  const value = plainText(rawTitle).trim();
  if (!value) return { ru: 'LAPBase Guide', en: 'LAPBase Guide' };

  const parts = value.split(/\s+\|\s+/).map(v => v.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      ru: parts[0],
      en: parts.slice(1).join(' | '),
    };
  }

  return { ru: value, en: value };
}

function makePreview(html, maxLength = 220) {
  const text = plainText(html)
    .replace(/^\[(?:RU|ENG|EN)\]\s*/i, '')
    .trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trimEnd() + '…';
}

function cleanImageCandidate(raw, baseUrl) {
  if (!raw) return '';
  let value = decodeEntities(normalizeSerializedHtml(raw)).trim();
  value = value.replace(/[\\"'<>{}\[\]),;]+$/g, '');

  if (/^https%3A%2F%2F/i.test(value)) {
    try { value = decodeURIComponent(value); } catch {}
  }

  const absolute = absoluteUrl(value, baseUrl);
  if (!absolute) return '';

  // LAPBase articles currently use Teletype's image CDN.
  if (!/^https:\/\/img\d*\.teletype\.in\//i.test(absolute)) return '';
  return absolute;
}

function extractImageUrls(source, baseUrl) {
  const normalized = normalizeSerializedHtml(source);
  const result = [];
  const seen = new Set();

  const add = raw => {
    const url = cleanImageCandidate(raw, baseUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    result.push(url);
  };

  // Direct Teletype CDN URLs preserve their order in the source.
  for (const match of normalized.matchAll(/https:\/\/img\d*\.teletype\.in\/files\/[^\s"'<>\\]+/gi)) {
    add(match[0]);
  }

  for (const tag of normalized.match(/<(?:img|source)\b[^>]*>/gi) || []) {
    for (const name of [
      'src', 'data-src', 'data-original', 'data-lazy-src',
      'data-image', 'data-url'
    ]) {
      add(extractAttribute(tag, name));
    }

    const srcset = extractAttribute(tag, 'srcset') || extractAttribute(tag, 'data-srcset');
    if (srcset) {
      for (const part of srcset.split(',')) {
        add(part.trim().split(/\s+/)[0]);
      }
    }
  }

  // Some lazy media URLs live in CSS or serialized hydration payloads.
  for (const match of normalized.matchAll(/url\(\s*(['"]?)(https:\/\/img\d*\.teletype\.in\/[^)'"\s]+)\1\s*\)/gi)) {
    add(match[2]);
  }

  for (const match of String(source ?? '').matchAll(
    /https%3A%2F%2Fimg\d*\.teletype\.in%2Ffiles%2F[^\s"'<>\\]+/gi
  )) {
    add(match[0]);
  }

  add(extractMeta(normalized, 'property', 'og:image'));
  add(extractMeta(normalized, 'name', 'twitter:image'));

  return result.slice(0, 160);
}

async function fetchText(url, accept) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 LAPBase Guide Reader',
      'Accept': accept,
      'Accept-Language': 'ru,en;q=0.8',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Teletype returned ${response.status}`);
  }

  return {
    text: await response.text(),
    finalUrl: response.url || url,
  };
}

async function fetchTeletypeHtml(url) {
  const result = await fetchText(url, 'text/html,application/xhtml+xml');
  return { html: result.text, finalUrl: result.finalUrl };
}

function findMatchingTagEnd(html, openIndex, tagName) {
  const tokenRe = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  tokenRe.lastIndex = openIndex;
  let depth = 0;
  let token;

  while ((token = tokenRe.exec(html))) {
    const isClosing = /^<\//.test(token[0]);
    const isSelfClosing = /\/>$/.test(token[0]);

    if (!isClosing && !isSelfClosing) depth += 1;
    if (isClosing) depth -= 1;

    if (depth === 0) {
      return {
        start: openIndex,
        end: tokenRe.lastIndex,
        openEnd: html.indexOf('>', openIndex) + 1,
        closeStart: token.index,
      };
    }
  }

  return null;
}

function extractArticle(html) {
  const source = String(html ?? '');
  const title = extractMeta(source, 'property', 'og:title') ||
    plainText(source.match(/<h1\b[^>]*>([^]*?)<\/h1>/i)?.[1] || '') ||
    plainText(source.match(/<title\b[^>]*>([^]*?)<\/title>/i)?.[1] || '');

  const candidates = [
    /<div\b[^>]*class=(["'])[^"']*\barticle__content\b[^"']*\1[^>]*>/i,
    /<article\b[^>]*>/i,
  ];

  for (const re of candidates) {
    const match = source.match(re);
    if (!match || match.index == null) continue;

    const tagName = /^<article/i.test(match[0]) ? 'article' : 'div';
    const bounds = findMatchingTagEnd(source, match.index, tagName);
    if (!bounds) continue;

    return {
      title,
      content: source.slice(bounds.openEnd, bounds.closeStart),
      containerTag: tagName,
    };
  }

  return { title, content: '', containerTag: '' };
}

function sanitizeUrl(raw, baseUrl, { image = false } = {}) {
  const absolute = absoluteUrl(raw, baseUrl);
  if (!absolute) return '';

  try {
    const url = new URL(absolute);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (image && !/^img\d*\.teletype\.in$/i.test(url.hostname)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function sanitizeTag(tag, tagName, baseUrl) {
  const closing = /^<\//.test(tag);
  if (closing) return `</${tagName}>`;

  const allowed = new Set([
    'p','div','span','h1','h2','h3','h4','h5','h6',
    'ul','ol','li','strong','b','em','i','u','s','blockquote',
    'pre','code','br','hr','a','img','figure','figcaption',
    'table','thead','tbody','tr','th','td','sup','sub',
  ]);
  if (!allowed.has(tagName)) return '';

  const attrs = [];
  const className = extractAttribute(tag, 'class');
  if (className) attrs.push(`class="${escapeHtml(className)}"`);

  if (/^h[1-6]$/.test(tagName)) {
    const anchor = extractAttribute(tag, 'data-anchor');
    if (anchor) attrs.push(`data-anchor="${escapeHtml(anchor)}"`);
  }

  if (tagName === 'a') {
    const rawHref = extractAttribute(tag, 'href').trim();

    // Keep same-page anchors as fragments. Besides making in-article links
    // behave correctly, this lets the TOC cleanup recognize Teletype's own
    // anchor list before LAPBase generates the language-specific TOC.
    if (/^#[^\s"'<>]+$/.test(rawHref)) {
      attrs.push(`href="${escapeHtml(rawHref)}"`);
    } else {
      const href = sanitizeUrl(rawHref, baseUrl);
      if (href) {
        attrs.push(`href="${escapeHtml(href)}"`);
        attrs.push('target="_blank"');
        attrs.push('rel="noopener noreferrer"');
      }
    }
  }

  if (tagName === 'img') {
    const src = sanitizeUrl(
      extractAttribute(tag, 'src') ||
      extractAttribute(tag, 'data-src') ||
      extractAttribute(tag, 'data-original') ||
      extractAttribute(tag, 'data-lazy-src'),
      baseUrl,
      { image: true }
    );
    if (src) attrs.push(`src="${escapeHtml(src)}"`);

    const alt = extractAttribute(tag, 'alt');
    attrs.push(`alt="${escapeHtml(alt)}"`);
    attrs.push('loading="lazy"');
    attrs.push('decoding="async"');

    const width = Number(extractAttribute(tag, 'width'));
    const height = Number(extractAttribute(tag, 'height'));
    if (Number.isFinite(width) && width > 0) attrs.push(`width="${Math.round(width)}"`);
    if (Number.isFinite(height) && height > 0) attrs.push(`height="${Math.round(height)}"`);
  }

  if (tagName === 'figure') {
    for (const name of ['data-node-id','data-anchor','data-media-original-width','data-media-original-height','data-media-display-width','data-media-aspect']) {
      const value = extractAttribute(tag, name);
      if (value) attrs.push(`${name}="${escapeHtml(value)}"`);
    }
  }

  if (tagName === 'td' || tagName === 'th') {
    const colspan = Number(extractAttribute(tag, 'colspan'));
    const rowspan = Number(extractAttribute(tag, 'rowspan'));
    if (Number.isFinite(colspan) && colspan > 1 && colspan < 20) attrs.push(`colspan="${colspan}"`);
    if (Number.isFinite(rowspan) && rowspan > 1 && rowspan < 20) attrs.push(`rowspan="${rowspan}"`);
  }

  const selfClosing = tagName === 'img' || tagName === 'br' || tagName === 'hr';
  return `<${tagName}${attrs.length ? ' ' + attrs.join(' ') : ''}${selfClosing ? '>' : '>'}`;
}

function stripNativeTocContainers(html) {
  let source = String(html ?? '');
  if (!source) return source;

  // The older parser removed Teletype's `.contents` node before building the
  // LAPBase TOC. Do the same here, but with balanced element removal so nested
  // <div> blocks cannot leave half of the native TOC behind.
  const openRe = /<(div|nav|aside|section)\b[^>]*>/gi;
  let match;

  while ((match = openRe.exec(source))) {
    const openingTag = match[0];
    const tagName = String(match[1]).toLowerCase();
    const className = extractAttribute(openingTag, 'class');
    const id = extractAttribute(openingTag, 'id');

    const classTokens = className.split(/\s+/).filter(Boolean);
    const hasTocClass = classTokens.some(token =>
      /^(?:contents|toc|table[-_]?of[-_]?contents)$/i.test(token)
    );
    const hasTocId = /^(?:contents|toc|table[-_]?of[-_]?contents)$/i.test(id);

    if (!hasTocClass && !hasTocId) continue;

    const bounds = findMatchingTagEnd(source, match.index, tagName);
    if (!bounds) {
      // Malformed upstream markup: at least remove the opening TOC container.
      source = source.slice(0, match.index) + source.slice(openRe.lastIndex);
      openRe.lastIndex = match.index;
      continue;
    }

    source = source.slice(0, bounds.start) + source.slice(bounds.end);
    openRe.lastIndex = bounds.start;
  }

  return source;
}

function sanitizeArticleHtml(content, baseUrl) {
  let html = stripNativeTocContainers(content)
    .replace(/<!--[^]*?-->/g, '')
    .replace(/<(script|style|noscript|iframe|object|embed|form|button|input|textarea|select)\b[^>]*>[^]*?<\/\1>/gi, '')
    .replace(/<(script|style|noscript|iframe|object|embed|form|button|input|textarea|select)\b[^>]*\/?>/gi, '');

  html = html.replace(/<\/?([a-z0-9]+)\b[^>]*>/gi, (tag, rawName) => {
    const name = String(rawName).toLowerCase();
    return sanitizeTag(tag, name, baseUrl);
  });

  return html;
}


function annotateFigureGeometry(html) {
  return String(html ?? '').replace(
    /<figure\b([^>]*)>([^]*?)<\/figure>/gi,
    (whole, attrs, inner) => {
      const opening = `<figure${attrs}>`;
      const className = extractAttribute(opening, 'class');

      let originalWidth = Number(extractAttribute(opening, 'data-media-original-width')) || 0;
      let originalHeight = Number(extractAttribute(opening, 'data-media-original-height')) || 0;
      let displayWidth = Number(extractAttribute(opening, 'data-media-display-width')) || 0;

      // Teletype commonly stores the real media geometry in svg.spacer.
      const spacer = inner.match(
        /<svg\b[^>]*\bclass=(["'])[^"']*\bspacer\b[^"']*\1[^>]*>/i
      )?.[0] || '';

      const viewBox =
        extractAttribute(spacer, 'viewbox') ||
        extractAttribute(spacer, 'viewBox');

      if (viewBox && (!originalWidth || !originalHeight)) {
        const nums = viewBox.trim().split(/[\s,]+/).map(Number);
        if (nums.length >= 4 && nums.every(Number.isFinite)) {
          originalWidth = originalWidth || Math.abs(nums[2]);
          originalHeight = originalHeight || Math.abs(nums[3]);
        }
      }

      if (!originalWidth) originalWidth = Number(extractAttribute(spacer, 'width')) || 0;
      if (!originalHeight) originalHeight = Number(extractAttribute(spacer, 'height')) || 0;

      const img = inner.match(/<img\b[^>]*>/i)?.[0] || '';
      if (!originalWidth) originalWidth = Number(extractAttribute(img, 'width')) || 0;
      if (!originalHeight) originalHeight = Number(extractAttribute(img, 'height')) || 0;

      // m_retina in Teletype means the source bitmap is normally shown at 1/2 width.
      if (!displayWidth && originalWidth) {
        const retina = /(?:^|\s)m_retina(?:\s|$)/i.test(className);
        displayWidth = retina ? originalWidth / 2 : originalWidth;
      }

      if (!originalWidth && !displayWidth) return whole;

      let nextAttrs = String(attrs || '')
        .replace(/\s+data-media-original-width\s*=\s*(["'])[^"']*\1/gi, '')
        .replace(/\s+data-media-original-height\s*=\s*(["'])[^"']*\1/gi, '')
        .replace(/\s+data-media-display-width\s*=\s*(["'])[^"']*\1/gi, '')
        .replace(/\s+data-media-aspect\s*=\s*(["'])[^"']*\1/gi, '');

      if (originalWidth > 0) {
        nextAttrs += ` data-media-original-width="${Math.round(originalWidth)}"`;
      }
      if (originalHeight > 0) {
        nextAttrs += ` data-media-original-height="${Math.round(originalHeight)}"`;
      }
      if (displayWidth > 0) {
        nextAttrs += ` data-media-display-width="${Math.max(1, Math.round(displayWidth))}"`;
      }
      if (originalWidth > 0 && originalHeight > 0) {
        nextAttrs += ` data-media-aspect="${originalWidth / originalHeight}"`;
      }

      return `<figure${nextAttrs}>${inner}</figure>`;
    }
  );
}

function mergeClassName(existing, extra) {
  const tokens = `${existing || ''} ${extra || ''}`
    .split(/\s+/)
    .map(value => value.trim())
    .filter(Boolean);
  return [...new Set(tokens)].join(' ');
}

function applyArticleImageLayout(html) {
  let source = String(html ?? '');
  if (!source) return source;

  // Figures preserve Teletype's display width and are centered in LAPBase.
  source = source.replace(
    /<figure\b([^>]*)>([^]*?)<\/figure>/gi,
    (whole, attrs, inner) => {
      const opening = `<figure${attrs}>`;
      const originalWidth = Number(extractAttribute(opening, 'data-media-original-width')) || 0;
      const originalHeight = Number(extractAttribute(opening, 'data-media-original-height')) || 0;
      const displayWidth =
        Number(extractAttribute(opening, 'data-media-display-width')) ||
        originalWidth ||
        0;

      const existingClass = extractAttribute(opening, 'class');
      const className = mergeClassName(existingClass, 'lapbase-article-figure');

      let cleanAttrs = String(attrs || '')
        .replace(/\s+class\s*=\s*(["'])[^"']*\1/gi, '')
        .replace(/\s+style\s*=\s*(["'])[^"']*\1/gi, '');

      const figureStyle = [
        'display:block',
        'box-sizing:border-box',
        'margin-left:auto',
        'margin-right:auto',
        displayWidth > 0 ? `width:min(100%, ${Math.round(displayWidth)}px)` : 'width:100%',
      ].join(';');

      const laidOutInner = String(inner).replace(
        /<img\b([^>]*)>/gi,
        (imgWhole, imgAttrs) => {
          const imgOpening = `<img${imgAttrs}>`;
          const imgClass = mergeClassName(
            extractAttribute(imgOpening, 'class'),
            'lapbase-article-image'
          );

          let attrsOut = String(imgAttrs || '')
            .replace(/\s+class\s*=\s*(["'])[^"']*\1/gi, '')
            .replace(/\s+style\s*=\s*(["'])[^"']*\1/gi, '')
            .replace(/\s+width\s*=\s*(["'])[^"']*\1/gi, '')
            .replace(/\s+height\s*=\s*(["'])[^"']*\1/gi, '');

          let renderedHeight = 0;
          if (displayWidth > 0 && originalWidth > 0 && originalHeight > 0) {
            renderedHeight = Math.max(
              1,
              Math.round(displayWidth * originalHeight / originalWidth)
            );
          }

          const imgStyle = [
            'display:block',
            'box-sizing:border-box',
            'max-width:100%',
            displayWidth > 0 ? 'width:100%' : 'width:auto',
            'height:auto',
            'margin-left:auto',
            'margin-right:auto',
          ].join(';');

          const dimensions = displayWidth > 0
            ? ` width="${Math.round(displayWidth)}"${renderedHeight > 0 ? ` height="${renderedHeight}"` : ''}`
            : '';

          return `<img${attrsOut} class="${escapeHtml(imgClass)}"${dimensions} style="${imgStyle}">`;
        }
      );

      return `<figure${cleanAttrs} class="${escapeHtml(className)}" style="${figureStyle}">${laidOutInner}</figure>`;
    }
  );

  // Also center standalone images that are not wrapped in <figure>.
  // Images inside figures already carry lapbase-article-image and are skipped.
  source = source.replace(
    /<img\b([^>]*)>/gi,
    (whole, attrs) => {
      const opening = `<img${attrs}>`;
      const existingClass = extractAttribute(opening, 'class');
      if (/\blapbase-article-image\b/i.test(existingClass)) return whole;

      const className = mergeClassName(existingClass, 'lapbase-article-image');
      let cleanAttrs = String(attrs || '')
        .replace(/\s+class\s*=\s*(["'])[^"']*\1/gi, '')
        .replace(/\s+style\s*=\s*(["'])[^"']*\1/gi, '');

      const style = [
        'display:block',
        'max-width:100%',
        'height:auto',
        'margin-left:auto',
        'margin-right:auto',
      ].join(';');

      return `<img${cleanAttrs} class="${escapeHtml(className)}" style="${style}">`;
    }
  );

  return source;
}

function extractSourceFigureImages(articleHtml, baseUrl) {
  const result = [];
  const re = /<figure\b([^>]*)>([^]*?)<\/figure>/gi;
  let match;

  while ((match = re.exec(String(articleHtml ?? '')))) {
    const whole = match[0];
    const opening = `<figure${match[1]}>`;
    const images = extractImageUrls(whole, baseUrl);

    result.push({
      nodeId: extractAttribute(opening, 'data-node-id'),
      anchor: extractAttribute(opening, 'data-anchor'),
      image: images[0] || '',
    });
  }

  return result;
}

function figureDescriptor(attrs) {
  const opening = `<figure${attrs}>`;
  return {
    nodeId: extractAttribute(opening, 'data-node-id'),
    anchor: extractAttribute(opening, 'data-anchor'),
  };
}

function findNearbyFigureImage(sourceHtml, descriptor, baseUrl, used) {
  const normalized = normalizeSerializedHtml(sourceHtml);
  const markers = [];

  if (descriptor?.nodeId) {
    const id = descriptor.nodeId;
    markers.push(
      `data-node-id="${id}"`,
      `data-node-id='${id}'`,
      `"nodeId":"${id}"`,
      `"nodeId":${id}`,
      `"node_id":"${id}"`,
      `"id":"${id}"`,
      `"id":${id}`
    );
  }

  if (descriptor?.anchor) {
    const anchor = descriptor.anchor;
    markers.push(
      `data-anchor="${anchor}"`,
      `data-anchor='${anchor}'`,
      `"anchor":"${anchor}"`
    );
  }

  let best = '';
  let bestDistance = Infinity;

  for (const marker of markers) {
    let offset = 0;
    while (true) {
      const index = normalized.indexOf(marker, offset);
      if (index < 0) break;
      offset = index + marker.length;

      // Keep the search local to this figure. This prevents a nearby article
      // cover or the next figure from being selected just because it appears
      // earlier in the page-wide image list.
      const from = Math.max(0, index - 8000);
      const to = Math.min(normalized.length, index + marker.length + 8000);
      const chunk = normalized.slice(from, to);
      const candidates = extractImageUrls(chunk, baseUrl);

      for (const candidate of candidates) {
        if (!candidate || used.has(candidate)) continue;

        const localIndex = chunk.indexOf(candidate);
        const absolutePosition = localIndex >= 0 ? from + localIndex : index;
        const distance = Math.abs(absolutePosition - index);
        if (distance < bestDistance) {
          best = candidate;
          bestDistance = distance;
        }
      }
    }
  }

  return best;
}

function injectMissingFigureImages(html, articleImageUrls, sourceFigureImages, sourceHtml, baseUrl) {
  let cursor = 0;
  let figureIndex = 0;
  const used = new Set();
  let positional = 0;
  let hinted = 0;
  let fallback = 0;
  let unresolved = 0;

  const nextArticleImage = () => {
    while (cursor < articleImageUrls.length) {
      const url = articleImageUrls[cursor++];
      if (!url || used.has(url)) continue;
      used.add(url);
      return url;
    }
    return '';
  };

  const output = String(html ?? '').replace(
    /<figure\b([^>]*)>([^]*?)<\/figure>/gi,
    (whole, attrs, inner) => {
      const currentIndex = figureIndex++;
      const existing = inner.match(/<img\b[^>]*>/gi) || [];
      if (existing.length) {
        for (const img of existing) {
          const src = cleanImageCandidate(extractAttribute(img, 'src'), baseUrl);
          if (src) used.add(src);
        }
        return whole;
      }

      const descriptor = figureDescriptor(attrs);
      const sourceFigure = sourceFigureImages[currentIndex] || null;
      let src = '';

      // Strongest mapping: the image that originally belonged to the source
      // <figure> at this exact position inside article__content.
      if (sourceFigure?.image && !used.has(sourceFigure.image)) {
        src = sourceFigure.image;
        used.add(src);
        positional += 1;
      }

      // Lazy Teletype figures sometimes keep the URL outside the visible
      // article HTML. In that case bind by node-id / anchor in hydration data.
      if (!src) {
        src = findNearbyFigureImage(sourceHtml, descriptor, baseUrl, used);
        if (src) {
          used.add(src);
          hinted += 1;
        }
      }

      if (!src) {
        // Last-resort fallback is restricted to image URLs discovered inside
        // article__content. Never inject page-wide og:image/profile media.
        src = nextArticleImage();
        if (src) fallback += 1;
      }

      if (!src) {
        unresolved += 1;
        return whole;
      }

      return `<figure${attrs}>${inner}<img src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async"></figure>`;
    }
  );

  return { html: output, positional, hinted, fallback, unresolved };
}

function languageMarker(text) {
  const value = plainText(text).trim();
  if (/^\[(?:RU|RUS)\](?:\s|$)/i.test(value)) return 'ru';
  if (/^\[(?:ENG|EN)\](?:\s|$)/i.test(value)) return 'en';
  return '';
}

function splitLanguageSections(html) {
  const source = String(html ?? '');
  const re = /<h([1-4])\b[^>]*>([^]*?)<\/h\1>/gi;
  const markers = [];
  let match;

  while ((match = re.exec(source))) {
    const lang = languageMarker(match[2]);
    if (!lang) continue;
    markers.push({
      lang,
      start: match.index,
      end: re.lastIndex,
    });
  }

  if (!markers.length) {
    return {
      ru: source,
      en: '',
      sharedMedia: '',
      available: { ru: Boolean(plainText(source)), en: false },
      mode: 'single',
    };
  }

  const buckets = { ru: '', en: '' };
  const sharedMedia = source.slice(0, markers[0].start);

  for (let i = 0; i < markers.length; i += 1) {
    const marker = markers[i];
    const next = markers[i + 1];
    const segment = source.slice(marker.end, next ? next.start : source.length);
    buckets[marker.lang] += segment;
  }

  return {
    ru: buckets.ru,
    en: buckets.en,
    sharedMedia,
    available: {
      ru: Boolean(plainText(buckets.ru)),
      en: Boolean(plainText(buckets.en)),
    },
    mode: 'markers',
  };
}

function slugifyHeading(text, used) {
  let base = plainText(text)
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/giu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);

  if (!base) base = 'section';
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

function isExistingTocTitle(text) {
  const value = plainText(text)
    .replace(/[\s:：.]+$/g, '')
    .trim()
    .toLowerCase();

  return (
    value === 'оглавление' ||
    value === 'содержание' ||
    value === 'contents' ||
    value === 'table of contents'
  );
}

function countHashLinks(html) {
  const matches = String(html ?? '').match(
    /<a\b[^>]*\bhref\s*=\s*(["'])[^"']*#[^"']+\1[^>]*>/gi
  );

  return matches ? matches.length : 0;
}

function countAllLinks(html) {
  const matches = String(html ?? '').match(/<a\b[^>]*\bhref\s*=\s*(["'])[^"']+\1[^>]*>/gi);
  return matches ? matches.length : 0;
}

function stripAnchorOnlyTocLists(html) {
  let source = String(html ?? '');
  if (!source) return source;

  // Teletype can inject an automatic TOC as a plain <ul>/<ol> with no
  // "Оглавление" heading or TOC-specific class. In bilingual articles this
  // block usually lives before the first [RU]/[ENG] section and consists
  // almost entirely of internal #anchor links.
  source = source.replace(
    /<(ul|ol)\b([^>]*)>([^]*?)<\/\1>/gi,
    (whole, _tag, _attrs, inner) => {
      const hashLinks = countHashLinks(inner);
      const allLinks = countAllLinks(inner);
      const liCount = (String(inner).match(/<li\b/gi) || []).length;

      if (liCount < 3 || hashLinks < 3 || allLinks < 3) return whole;

      // Require the list to be overwhelmingly internal navigation links.
      // This avoids deleting ordinary article lists that happen to contain
      // one or two links.
      if (hashLinks / allLinks < 0.8) return whole;

      return '';
    }
  );

  return source;
}

function stripExistingToc(html, { stripBareAnchorLists = false } = {}) {
  let source = String(html ?? '');

  if (!source) return source;

  if (stripBareAnchorLists) {
    source = stripAnchorOnlyTocLists(source);
  }

  // Remove explicit TOC containers when Teletype/source HTML gives them
  // a recognizable class/id. The LAPBase-generated TOC is not present yet
  // when this function runs, so it cannot be removed accidentally.
  source = source.replace(
    /<(nav|aside|div)\b([^>]*(?:class|id)\s*=\s*(["'])[^"']*(?:table[-_ ]?of[-_ ]?contents|contents|toc)[^"']*\3[^>]*)>[^]*?<\/\1>/gi,
    ''
  );

  // Teletype articles may contain a normal heading such as "Оглавление"
  // followed by a list of anchor links. Remove that block up to the next
  // article heading, but only when it really looks like a TOC (2+ #links).
  const headingRe = /<h([1-4])\b[^>]*>([^]*?)<\/h\1>/gi;
  const headings = [];
  let match;

  while ((match = headingRe.exec(source))) {
    headings.push({
      start: match.index,
      end: headingRe.lastIndex,
      text: plainText(match[2]),
    });
  }

  const removals = [];

  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];

    if (!isExistingTocTitle(heading.text)) continue;

    const nextStart = headings[i + 1]?.start ?? source.length;
    const candidate = source.slice(heading.end, nextStart);

    if (countHashLinks(candidate) >= 2) {
      removals.push({
        start: heading.start,
        end: nextStart,
      });
    }
  }

  for (let i = removals.length - 1; i >= 0; i -= 1) {
    const { start, end } = removals[i];
    source = source.slice(0, start) + source.slice(end);
  }

  return source.trim();
}

function buildTocAndAnchors(sectionHtml, lang) {
  if (!sectionHtml) return { html: '', toc: '', count: 0 };

  const used = new Set();
  const items = [];
  const html = String(sectionHtml).replace(
    /<h([1-4])\b([^>]*)>([^]*?)<\/h\1>/gi,
    (whole, levelRaw, attrs, inner) => {
      const text = plainText(inner);
      if (!text || languageMarker(text)) return whole;

      const level = Number(levelRaw);
      const existing = extractAttribute(`<h${level}${attrs}>`, 'id');
      const id = existing || slugifyHeading(text, used);
      if (existing) used.add(existing);

      items.push({ id, text, level });
      const cleanAttrs = String(attrs).replace(/\s+id\s*=\s*(["'])[^]*?\1/gi, '');
      return `<h${level}${cleanAttrs} id="${escapeHtml(id)}">${inner}</h${level}>`;
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
            <a href="#${escapeHtml(item.id)}">${escapeHtml(item.text)}</a>
          </li>`).join('')}
      </ul>
    </nav>`;

  return { html, toc, count: items.length };
}

function extractCoverMedia(html) {
  const source = String(html ?? '');
  if (!source) return '';

  // Для позиции №1 берём только первую картинку/figure из области,
  // расположенной до языкового текста статьи.
  const figure = source.match(/<figure\b[^>]*>[^]*?<\/figure>/i);
  if (figure) return figure[0];

  const image = source.match(/<img\b[^>]*>/i);
  return image ? image[0] : '';
}

function detachLeadingCoverMedia(html) {
  const source = String(html ?? '');
  if (!source) return { cover: '', body: '' };

  // В одноязычных статьях обложка может находиться прямо в начале body.
  // Убираем её оттуда и переносим перед сгенерированным оглавлением.
  const match = source.match(
    /^\s*(?:<p\b[^>]*>\s*<\/p>\s*)*(<figure\b[^>]*>[^]*?<\/figure>|<img\b[^>]*>)\s*/i
  );

  if (!match) {
    return {
      cover: '',
      body: source.trim(),
    };
  }

  return {
    cover: match[1],
    body: source.slice(match[0].length).trim(),
  };
}

function composeLanguageSection(sectionHtml, sharedMedia, lang) {
  if (!sectionHtml) return { html: '', tocCount: 0 };

  // Жёсткая структура html.ru / html.en:
  // 1. обложка, если она есть;
  // 2. одно сгенерированное оглавление выбранного языка;
  // 3. текст статьи + все остальные inline-картинки.
  const cleanSection = stripExistingToc(sectionHtml, {
    stripBareAnchorLists: true,
  });
  const cleanSharedMedia = stripExistingToc(sharedMedia || '', {
    stripBareAnchorLists: true,
  });

  let coverMedia = extractCoverMedia(cleanSharedMedia);
  let bodyHtml = cleanSection;

  // Для одноязычных статей и статей, где cover идёт сразу после [RU]/[ENG].
  if (!coverMedia) {
    const detached = detachLeadingCoverMedia(bodyHtml);
    coverMedia = detached.cover;
    bodyHtml = detached.body;
  }

  const built = buildTocAndAnchors(bodyHtml, lang);

  return {
    html: `${coverMedia}${built.toc}${built.html}`,
    tocCount: built.count,
  };
}

function extractGuideLinks(html, sourceUrl) {
  const source = new URL(sourceUrl);
  const result = [];
  const seen = new Set();
  const re = /<a\b[^>]*href\s*=\s*(["'])([^]*?)\1[^>]*>([^]*?)<\/a>/gi;
  let match;

  while ((match = re.exec(String(html ?? '')))) {
    const url = canonicalArticleUrl(match[2], sourceUrl);
    if (!url) continue;
    if (new URL(url).pathname === source.pathname) continue;

    const key = pathKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(url);
    if (result.length >= 40) break;
  }

  return result;
}

function stripCdata(value) {
  return decodeEntities(
    String(value ?? '')
      .replace(/^\s*<!\[CDATA\[/i, '')
      .replace(/\]\]>\s*$/i, '')
      .trim()
  );
}

function rssTagValue(block, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(block ?? '').match(
    new RegExp(`<${escaped}\\b[^>]*>([^]*?)<\\/${escaped}>`, 'i')
  );
  return match ? stripCdata(match[1]) : '';
}

function extractRssItems(xml, feedUrl) {
  const items = [];
  const seen = new Set();
  const re = /<item\b[^>]*>([^]*?)<\/item>/gi;
  let match;

  while ((match = re.exec(String(xml ?? ''))) && items.length < RSS_MAX_ITEMS) {
    const block = match[1];
    const url = canonicalArticleUrl(
      rssTagValue(block, 'guid') || rssTagValue(block, 'link'),
      feedUrl
    );
    if (!url) continue;

    const key = pathKey(url);
    if (seen.has(key)) continue;
    seen.add(key);

    const categories = [];
    const catRe = /<category\b[^>]*>([^]*?)<\/category>/gi;
    let cat;
    while ((cat = catRe.exec(block))) categories.push(stripCdata(cat[1]));

    const description = rssTagValue(block, 'description');
    const images = extractImageUrls(`${description}\n${block}`, feedUrl);

    items.push({
      url,
      title: rssTagValue(block, 'title'),
      publishedAt: rssTagValue(block, 'pubDate'),
      description,
      image: images[0] || '',
      categories,
      raw: block,
    });
  }

  return items;
}

function extractRssNextUrl(xml, feedUrl) {
  const tags = String(xml ?? '').match(/<(?:atom:)?link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (extractAttribute(tag, 'rel').toLowerCase() !== 'next') continue;
    const href = extractAttribute(tag, 'href');
    if (!href) continue;

    try {
      const url = new URL(href, feedUrl);
      if (url.hostname === ALLOWED_HOST && url.pathname.startsWith('/rss/')) {
        return url.toString();
      }
    } catch {}
  }
  return '';
}

function rssLastAsylumState(item) {
  const categoryText = (item.categories || []).join(' ');
  const categoryNormalized = normalizeSerializedHtml(categoryText);
  const rawNormalized = normalizeSerializedHtml(item.raw || '');

  const positive = /\+last(?:-)?asylum(?:-)?plague/i.test(rawNormalized) ||
    /Last\s+Asylum\s*:\s*Plague/i.test(plainText(categoryNormalized));
  if (positive) return true;

  // No positive collection marker: classify this one candidate with a cheap
  // article fetch. We intentionally do not treat an unrelated RSS category
  // string as a hard negative, because Teletype feed metadata can vary.
  return null;
}

function isLastAsylumArticleHtml(html) {
  const source = normalizeSerializedHtml(html);
  return /<a\b[^>]*href\s*=\s*(["'])[^"']*\+last(?:-)?asylum(?:-)?plague[^"']*\1/i.test(source) ||
    /<a\b[^>]*href\s*=\s*(["'])[^"']*\+lastasylumplague[^"']*\1/i.test(source);
}

function rssItemToGuide(item) {
  const rawTitle = plainText(item.title) || decodeURIComponent(item.url.split('/').pop() || 'Guide');
  const title = splitBilingualTitle(rawTitle);
  const hasEnglish = /\s+\|\s+/.test(rawTitle) ||
    /\[(?:ENG|EN)\]/i.test(item.description || '');

  return {
    url: item.url,
    title,
    preview: {
      ru: makePreview(item.description),
      en: '',
    },
    image: item.image || '',
    publishedAt: normalizePublishedAt(item.publishedAt),
    availableLanguages: {
      ru: true,
      en: hasEnglish,
    },
    languageMode: 'rss',
  };
}

function fallbackGuide(url) {
  const raw = decodeURIComponent((url.split('/').pop() || 'Guide').replace(/[-_]+/g, ' '));
  return {
    url,
    title: { ru: raw, en: raw },
    preview: { ru: '', en: '' },
    image: '',
    publishedAt: '',
    availableLanguages: { ru: true, en: false },
    languageMode: 'fallback',
  };
}

async function fetchRssIndex({ maxItems = RSS_MAX_ITEMS, maxPages = RSS_MAX_PAGES } = {}) {
  const author = allowedAuthor();
  if (!author) return { items: [], pages: 0, exhausted: true };

  let nextUrl = `https://${ALLOWED_HOST}/rss/${encodeURIComponent(author)}`;
  const items = [];
  const seenFeeds = new Set();
  const seenArticles = new Set();
  let pages = 0;

  while (nextUrl && pages < maxPages && items.length < maxItems) {
    if (seenFeeds.has(nextUrl)) break;
    seenFeeds.add(nextUrl);

    const response = await fetch(nextUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 LAPBase Guide Reader',
        'Accept': 'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.6',
        'Accept-Language': 'ru,en;q=0.8',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      if (!pages) throw new Error(`Teletype RSS returned ${response.status}`);
      break;
    }

    const finalUrl = response.url || nextUrl;
    const xml = await response.text();
    pages += 1;

    for (const item of extractRssItems(xml, finalUrl)) {
      const key = pathKey(item.url);
      if (seenArticles.has(key)) continue;
      seenArticles.add(key);
      items.push(item);
      if (items.length >= maxItems) break;
    }

    const discovered = extractRssNextUrl(xml, finalUrl);
    if (!discovered || seenFeeds.has(discovered)) {
      nextUrl = '';
      break;
    }
    nextUrl = discovered;
  }

  return {
    items,
    pages,
    exhausted: !nextUrl,
  };
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
  await Promise.all(Array.from({ length: count }, worker));
  return result;
}

async function classifyRssCandidate(item) {
  const state = rssLastAsylumState(item);
  if (state !== null) return state;

  try {
    const fetched = await fetchTeletypeHtml(item.url);
    return isLastAsylumArticleHtml(fetched.html);
  } catch {
    return false;
  }
}

function buildIndexHtml(items, lang) {
  if (!items.length) return '';

  const openText = lang === 'en' ? 'Open' : 'Открыть';
  return `<div class="guide-index-list">${items.map(item => {
    const requestedExists = item.availableLanguages?.[lang] !== false;
    const shownLang = requestedExists ? lang : 'ru';
    const title = item.title?.[shownLang] || item.title?.ru || item.title?.en || 'Guide';
    const preview = item.preview?.[shownLang] || '';
    return `
      <a class="guide-index-card" href="${escapeHtml(item.url)}" data-lapbase-guide-link="1">
        ${item.image ? `<img class="guide-index-image" src="${escapeHtml(item.image)}" alt="" loading="lazy" decoding="async">` : ''}
        <div class="guide-index-copy">
          <div class="guide-index-title">${escapeHtml(title)}</div>
          ${preview ? `<div class="guide-index-preview">${escapeHtml(preview)}</div>` : ''}
          <div class="guide-index-open">${openText}</div>
        </div>
      </a>`;
  }).join('')}</div>`;
}

async function guideIndexApi(collectionUrl, requestedPage) {
  // One collection HTML request gives us a guaranteed set of real guide URLs.
  const collection = await fetchTeletypeHtml(collectionUrl.toString());
  const collectionLinks = extractGuideLinks(collection.html, collection.finalUrl);
  const firstPageLinks = collectionLinks.slice(0, INDEX_PAGE_SIZE);
  const firstPageSet = new Set(firstPageLinks.map(pathKey));

  if (requestedPage === 1) {
    // Fetch just the first RSS page for metadata. No article enrichment here.
    let rssItems = [];
    try {
      rssItems = (await fetchRssIndex({ maxItems: 20, maxPages: 2 })).items;
    } catch {}

    const rssMap = new Map(rssItems.map(item => [pathKey(item.url), item]));
    const items = firstPageLinks.map(url => {
      const rss = rssMap.get(pathKey(url));
      return rss ? rssItemToGuide(rss) : fallbackGuide(url);
    });

    // A full first page does not automatically mean that another page exists.
    // Only advertise more data when the collection itself contains another
    // link or the sampled RSS contains an article outside page 1.
    const rssHasNovelItems = rssItems.some(
      item => !firstPageSet.has(pathKey(item.url))
    );
    const firstPageHasMore =
      collectionLinks.length > INDEX_PAGE_SIZE || rssHasNovelItems;

    return json({
      ok: true,
      type: 'index',
      title: { ru: 'Гайды', en: 'Knowledge Base' },
      html: {
        ru: buildIndexHtml(items, 'ru'),
        en: buildIndexHtml(items, 'en'),
      },
      availableLanguages: { ru: true, en: true },
      sourceUrl: collection.finalUrl,
      items,
      pagination: {
        page: 1,
        pageSize: items.length,
        hasMore: firstPageHasMore,
        mode: 'collection+rss:free',
      },
      meta: {
        guides: items.length,
        parser: 'free-index-v1.0.2-pagination-fix',
        page: 1,
        collectionLinks: collectionLinks.length,
        rssItems: rssItems.length,
      },
    });
  }

  // Page 2+ is paged over the author's raw RSS stream. The app already knows
  // how to skip an empty filtered page and request the next one.
  const rss = await fetchRssIndex();
  const novel = rss.items.filter(item => !firstPageSet.has(pathKey(item.url)));
  const start = Math.max(0, (requestedPage - 2) * INDEX_PAGE_SIZE);
  const candidates = novel.slice(start, start + INDEX_PAGE_SIZE);

  const acceptedFlags = await mapWithConcurrency(
    candidates,
    CLASSIFY_CONCURRENCY,
    classifyRssCandidate
  );

  const items = candidates
    .filter((_, index) => acceptedFlags[index])
    .map(rssItemToGuide);

  // IMPORTANT:
  // fetchRssIndex() always starts from the beginning and is intentionally
  // capped for Cloudflare Workers Free. If that cap is reached, setting
  // hasMore from !rss.exhausted would make the client request pages that this
  // Worker can never expose: every request would fetch the same capped RSS
  // window again. That leaves the UI loader spinning forever.
  //
  // Therefore hasMore describes the data actually available in `novel`.
  const hasMoreAvailable = start + INDEX_PAGE_SIZE < novel.length;

  return json({
    ok: true,
    type: 'index',
    title: { ru: 'Гайды', en: 'Knowledge Base' },
    html: {
      ru: buildIndexHtml(items, 'ru'),
      en: buildIndexHtml(items, 'en'),
    },
    availableLanguages: { ru: true, en: true },
    sourceUrl: collection.finalUrl,
    items,
    pagination: {
      page: requestedPage,
      pageSize: items.length,
      hasMore: hasMoreAvailable,
      mode: 'rss-raw-filtered:free',
    },
    meta: {
      guides: items.length,
      parser: 'free-index-v1.0.2-pagination-fix',
      page: requestedPage,
      candidates: candidates.length,
      rssPages: rss.pages,
      rssItems: rss.items.length,
      rssNovelItems: novel.length,
      rssExhausted: rss.exhausted,
      rssWindowTruncated: !rss.exhausted,
      hasMoreAvailable,
    },
  });
}

async function articleApi(request) {
  const requestUrl = new URL(request.url);
  const rawUrl = requestUrl.searchParams.get('url');
  const requestedPage = Math.max(
    1,
    Math.min(
      INDEX_MAX_PAGE,
      Number.parseInt(requestUrl.searchParams.get('page') || '1', 10) || 1
    )
  );

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

  const rest = target.pathname.slice(ALLOWED_AUTHOR_PREFIX.length);
  if (rest.toLowerCase() === COLLECTION_SLUG.toLowerCase() || rest.startsWith('+')) {
    return guideIndexApi(target, requestedPage);
  }

  const fetched = await fetchTeletypeHtml(target.toString());
  const sourceHtml = fetched.html;
  const finalUrl = fetched.finalUrl;
  const extracted = extractArticle(sourceHtml);

  if (!extracted.content) {
    return json({
      ok: false,
      error: 'Teletype page loaded, but no article body was found',
      debug: {
        finalUrl,
        htmlLength: sourceHtml.length,
      },
    }, 422);
  }

  const geometryAwareContent = annotateFigureGeometry(extracted.content);
  const sanitized = sanitizeArticleHtml(geometryAwareContent, finalUrl);
  const imageUrls = extractImageUrls(sourceHtml, finalUrl);
  const articleImageUrls = extractImageUrls(extracted.content, finalUrl);
  const sourceFigureImages = extractSourceFigureImages(extracted.content, finalUrl);
  const imageInjection = injectMissingFigureImages(
    sanitized,
    articleImageUrls,
    sourceFigureImages,
    sourceHtml,
    finalUrl
  );
  const withImages = applyArticleImageLayout(imageInjection.html);
  const sections = splitLanguageSections(withImages);
  const titles = splitBilingualTitle(
    extracted.title || extractMeta(sourceHtml, 'property', 'og:title') || 'LAPBase Guide'
  );

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
      parser: 'free-article-v1.0.2-image-size-center-fix',
      sourceImages: imageUrls.length,
      articleImages: articleImageUrls.length,
      imageMapping: {
        positional: imageInjection.positional,
        hinted: imageInjection.hinted,
        fallback: imageInjection.fallback,
        unresolved: imageInjection.unresolved,
      },
      tocItems: {
        ru: ruView.tocCount,
        en: enView.tocCount,
      },
      languageMode: sections.mode,
      sourceContentLength: extracted.content.length,
      sanitizedContentLength: sanitized.length,
      articleContainerTag: extracted.containerTag,
    },
  });
}

function apiCacheKey(request) {
  const incoming = new URL(request.url);
  const key = new URL(`${incoming.origin}/__lapbase_cache__`);
  key.searchParams.set('v', CACHE_VERSION);
  key.searchParams.set('url', incoming.searchParams.get('url') || '');
  key.searchParams.set('page', incoming.searchParams.get('page') || '1');
  return new Request(key.toString(), { method: 'GET' });
}

function cacheTtlForRequest(request) {
  const incoming = new URL(request.url);
  const raw = incoming.searchParams.get('url') || '';
  try {
    const target = new URL(raw);
    const rest = target.pathname.slice(ALLOWED_AUTHOR_PREFIX.length);
    return rest.startsWith('+') ? INDEX_CACHE_SECONDS : ARTICLE_CACHE_SECONDS;
  } catch {
    return INDEX_CACHE_SECONDS;
  }
}

function clientResponse(response, cacheState) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-LAPBase-Cache', cacheState);
  for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function cachedArticleApi(request, ctx) {
  const cache = caches.default;
  const key = apiCacheKey(request);
  const cached = await cache.match(key);

  if (cached) return clientResponse(cached, 'HIT');

  const response = await articleApi(request);
  if (!response.ok) return clientResponse(response, 'BYPASS');

  const ttl = cacheTtlForRequest(request);
  const clone = response.clone();
  const headers = new Headers(clone.headers);
  headers.set('Cache-Control', `public, max-age=${ttl}`);
  headers.delete('X-LAPBase-Cache');

  const storable = new Response(clone.body, {
    status: clone.status,
    statusText: clone.statusText,
    headers,
  });

  if (ctx?.waitUntil) ctx.waitUntil(cache.put(key, storable));
  else await cache.put(key, storable);

  return clientResponse(response, 'MISS');
}

async function reverseProxy(request) {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, `https://${ALLOWED_HOST}`);

  const response = await fetch(target.toString(), {
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
    try {
      const redirect = new URL(headers.get('location'), target);
      if (redirect.hostname === ALLOWED_HOST) {
        headers.set(
          'location',
          incoming.origin + redirect.pathname + redirect.search + redirect.hash
        );
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
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        service: 'lapbase-guides',
        version: WORKER_VERSION,
      });
    }

    if (url.pathname === '/api/article') {
      try {
        return await cachedArticleApi(request, ctx);
      } catch (error) {
        return json({
          ok: false,
          error: error?.message || 'Unknown Worker error',
        }, 500);
      }
    }

    return reverseProxy(request);
  },
};
