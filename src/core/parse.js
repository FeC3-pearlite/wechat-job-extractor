/*!
 * 微信求职信息提取器 — 文章解析层 (parse.js)
 *
 * 两个入口：
 *   1) parseDocument(document)   —— 内容脚本注入真实页面时使用（选择器精确）
 *   2) parseHtml(htmlString)     —— 批量抓取/离线场景使用（纯字符串，无需 DOM）
 * 两者返回同一种「原始素材」结构，后续字段抽取完全共用 fields.js。
 */
(function (root, factory) {
  var api = factory(
    (typeof module !== 'undefined' && module.exports) ? require('./rules.js') : (root && root.WJE && root.WJE.rules)
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.WJE = root.WJE || {}; root.WJE.parse = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (rules) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 通用工具
   * ------------------------------------------------------------------ */

  var ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ',
    ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', mdash: '—', ndash: '–',
    middot: '·', times: '×', divide: '÷', copy: '©', reg: '®', trade: '™', deg: '°',
    laquo: '«', raquo: '»', bull: '•', dagger: '†', permil: '‰', euro: '€', pound: '£', yen: '¥'
  };

  function decodeEntities(s) {
    if (!s) return '';
    return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, function (m, body) {
      if (body[0] === '#') {
        var code = body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
        if (!isFinite(code) || code < 0 || code > 0x10ffff) return m;
        try { return String.fromCodePoint(code); } catch (e) { return m; }
      }
      var v = ENTITIES[body.toLowerCase()];
      return v !== undefined ? v : m;
    });
  }

  /** 去掉 script/style/注释 */
  function stripNonContent(html) {
    return String(html)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');
  }

  var BLOCK_TAGS = /<\/?(?:p|div|section|article|header|footer|li|tr|h[1-6]|blockquote|figure|figcaption|table|ul|ol|dl|dd|dt|pre|aside|main|nav|form|fieldset)\b[^>]*>/gi;

  /** HTML → 纯文本（保留段落换行） */
  function htmlToText(html) {
    if (!html) return '';
    var s = stripNonContent(html);
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(BLOCK_TAGS, '\n');
    s = s.replace(/<[^>]+>/g, '');
    s = decodeEntities(s);
    return rules.normalize(s);
  }

  /** 属性值解析，兼容单/双引号与无引号 */
  function getAttr(tagHtml, name) {
    var re = new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+))', 'i');
    var m = tagHtml.match(re);
    if (!m) return null;
    return decodeEntities(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]));
  }

  function absolutize(url, base) {
    if (!url) return null;
    var u = String(url).trim();
    if (!u || u === '#' || /^javascript:/i.test(u) || /^data:/i.test(u)) return null;
    if (/^https?:\/\//i.test(u)) return u;
    if (u.indexOf('//') === 0) return 'https:' + u;
    var b = base || 'https://mp.weixin.qq.com/';
    try { return new URL(u, b).href; } catch (e) { return u; }
  }

  /* ------------------------------------------------------------------ *
   * 从原始 HTML 字符串提取素材（无 DOM 依赖）
   * ------------------------------------------------------------------ */

  /** 按 </div> 配平截取 id="js_content" 的容器。 */
  function sliceBalancedDiv(html, startIdx) {
    var re = /<div\b[^>]*>|<\/div>/gi;
    re.lastIndex = startIdx;
    var depth = 0, m, started = false;
    while ((m = re.exec(html)) !== null) {
      if (m[0][1] === '/') {
        depth--;
        if (started && depth <= 0) return html.slice(startIdx, m.index + m[0].length);
      } else {
        depth++;
        started = true;
      }
    }
    return html.slice(startIdx);
  }

  function extractContentHtml(html) {
    // 现代图文页：<div class="rich_media_content ..." id="js_content">
    var m = html.match(/<div[^>]*\bid\s*=\s*["']js_content["'][^>]*>/i);
    if (m) return sliceBalancedDiv(html, m.index);
    // 旧版：<div class="rich_media_content" id="js_content">
    m = html.match(/<div[^>]*\bclass\s*=\s*["'][^"']*rich_media_content[^"']*["'][^>]*>/i);
    if (m) return sliceBalancedDiv(html, m.index);
    return '';
  }

  function extractMetaTags(html) {
    var out = {};
    var re = /<meta\b[^>]*>/gi, m;
    while ((m = re.exec(html)) !== null) {
      var tag = m[0];
      var key = getAttr(tag, 'property') || getAttr(tag, 'name') || getAttr(tag, 'itemprop');
      var content = getAttr(tag, 'content');
      if (key && content != null && out[key] === undefined) out[key] = content;
    }
    return out;
  }

  function extractScriptVars(html) {
    var out = {};
    var keys = ['msg_source_url', 'msg_title', 'nickname', 'appuin', 'biz', 'mid', 'idx', 'sn', 'ct', 'msg_desc', 'user_name', 'ori_head_img_url'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var re = new RegExp('(?:var\\s+)?' + k + '\\s*=\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|\'((?:[^\'\\\\]|\\\\.)*)\')', 'i');
      var m = html.match(re);
      if (m) out[k] = decodeEntities(unescapeJs(m[1] !== undefined ? m[1] : m[2]));
    }
    // og / twitter 兜底
    return out;
  }

  function unescapeJs(s) {
    if (s == null) return s;
    return String(s)
      .replace(/\\x([0-9a-fA-F]{2})/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/\\u([0-9a-fA-F]{4})/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/\\\//g, '/')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  /** 提取所有 <a> 的 href + 锚文本 */
  function extractAnchors(html) {
    var out = [];
    var re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi, m;
    while ((m = re.exec(html)) !== null) {
      var attrs = m[1];
      var href = getAttr(attrs, 'href') || getAttr(attrs, 'data-link') || getAttr(attrs, 'data-href');
      var text = htmlToText(m[2]).replace(/\s+/g, ' ').trim();
      if (!href && !text) continue;
      out.push({
        href: href || null,
        text: text,
        raw: m[0],
        index: m.index,
        near: htmlToText(html.slice(Math.max(0, m.index - 160), m.index)).slice(-160)
      });
    }
    return out;
  }

  /** 提取所有 <img> 的 src（含懒加载 data-src） */
  function extractImages(html) {
    var out = [];
    var re = /<img\b([^>]*)\/?>/gi, m;
    while ((m = re.exec(html)) !== null) {
      var src = getAttr(m[1], 'data-src') || getAttr(m[1], 'src') || getAttr(m[1], 'data-original');
      if (!src) continue;
      out.push({ src: src, alt: getAttr(m[1], 'alt') || '', width: getAttr(m[1], 'data-w') || null });
    }
    return out;
  }

  function extractTitle(html, metas) {
    if (metas['og:title']) return rules.normalize(metas['og:title']);
    var m = html.match(/<h1[^>]*\bid\s*=\s*["']activity-name["'][^>]*>([\s\S]*?)<\/h1>/i);
    if (m) return htmlToText(m[1]);
    m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (m) return htmlToText(m[1]).replace(/\s*[-|_]\s*微信.*$/, '');
    return '';
  }

  function extractAccount(html, metas, scriptVars) {
    var m = html.match(/<[^>]*\bid\s*=\s*["']js_name["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
    if (m) { var t = htmlToText(m[1]); if (t) return t; }
    m = html.match(/<strong[^>]*class\s*=\s*["'][^"']*profile_nickname[^"']*["'][^>]*>([\s\S]*?)<\/strong>/i);
    if (m) { var t2 = htmlToText(m[1]); if (t2) return t2; }
    if (metas['og:article:author']) return rules.normalize(metas['og:article:author']);
    if (scriptVars.nickname) return unescapeJs(scriptVars.nickname);
    return '';
  }

  function extractPublishTime(html, metas, scriptVars) {
    var m = html.match(/<em[^>]*\bid\s*=\s*["']publish_time["'][^>]*>([\s\S]*?)<\/em>/i);
    if (m) { var t = htmlToText(m[1]); if (t) return t; }
    m = html.match(/<[^>]*\bid\s*=\s*["']publish_time["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
    if (m) { var t2 = htmlToText(m[1]); if (t2) return t2; }
    if (scriptVars.ct) {
      var ts = parseInt(scriptVars.ct, 10);
      if (isFinite(ts) && ts > 1000000000) {
        var d = new Date(ts * 1000);
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
      }
    }
    return '';
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** 「阅读原文」目标：优先 msg_source_url，其次底部栏 <a>。 */
  function extractReadOriginal(html, scriptVars, anchors) {
    var candidates = [];
    if (scriptVars.msg_source_url) {
      var u = absolutize(unescapeJs(scriptVars.msg_source_url));
      if (u) candidates.push({ url: u, from: 'msg_source_url' });
    }
    // 底部栏
    var m = html.match(/<div[^>]*\bid\s*=\s*["']js_article_bottom_bar["'][^>]*>([\s\S]{0,4000}?)<\/div>\s*<\/div>/i);
    if (m) {
      var inner = extractAnchors(m[1]);
      for (var i = 0; i < inner.length; i++) {
        if (inner[i].href) candidates.push({ url: absolutize(inner[i].href), from: 'bottom_bar', text: inner[i].text });
      }
    }
    for (var j = 0; j < anchors.length; j++) {
      var a = anchors[j];
      if (!a.href) continue;
      if (/(阅读原文|阅读全文|点击阅读|阅读全文请点击)/.test(a.text)) {
        candidates.push({ url: absolutize(a.href), from: 'anchor_text', text: a.text });
      }
      if (/\bid\s*=\s*["']js_view_source["']/.test(a.raw)) {
        candidates.push({ url: absolutize(a.href), from: 'js_view_source', text: a.text });
      }
    }
    for (var k = 0; k < candidates.length; k++) {
      var c = candidates[k];
      if (!c.url) continue;
      if (rules.isWechatHost(rules.safeHost(c.url)) && /\/s\?|__biz=/.test(c.url)) continue;
      return { url: rules.unwrapUrl(c.url), from: c.from, text: c.text || '阅读原文' };
    }
    // msg_source_url 可能就是微信站内链接，兜底返回
    if (candidates.length && candidates[0].url) {
      return { url: rules.unwrapUrl(candidates[0].url), from: candidates[0].from, text: candidates[0].text || '阅读原文' };
    }
    return null;
  }

  /** 正文中以纯文本形式出现的 URL（很多银行公告就是这么写的） */
  function extractBareUrls(text) {
    if (!text) return [];
    var out = [];
    var re = /(?:https?:\/\/|\/\/)[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]{4,}/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      var u = m[0].replace(/[),.;，。）】"'<>]+$/, '');
      if (/^\/\//.test(u)) u = 'https:' + u;
      out.push({ url: u, index: m.index, near: text.slice(Math.max(0, m.index - 40), m.index) });
    }
    return out;
  }

  function parseHtml(html, baseUrl) {
    var h = String(html || '');
    var metas = extractMetaTags(h);
    var scriptVars = extractScriptVars(h);
    var contentHtml = extractContentHtml(h);
    var bodyHtml = contentHtml || h;
    var anchors = extractAnchors(bodyHtml);
    var images = extractImages(bodyHtml);
    var contentText = htmlToText(bodyHtml);
    return {
      origin: 'html',
      baseUrl: baseUrl || 'https://mp.weixin.qq.com/',
      title: extractTitle(h, metas),
      account: extractAccount(h, metas, scriptVars),
      author: metas['og:article:author'] || '',
      publishTime: extractPublishTime(h, metas, scriptVars),
      description: metas['og:description'] || metas.description || '',
      contentHtml: contentHtml,
      contentText: contentText,
      anchors: anchors,
      images: images,
      readOriginal: extractReadOriginal(h, scriptVars, anchors),
      bareUrls: extractBareUrls(contentText),
      scriptVars: scriptVars,
      canonicalUrl: metas['og:url'] || (scriptVars.biz && scriptVars.mid
        ? 'https://mp.weixin.qq.com/s?__biz=' + scriptVars.biz + '&mid=' + scriptVars.mid + '&idx=' + (scriptVars.idx || 1) + '&sn=' + (scriptVars.sn || '')
        : null),
      structuredData: null,
      warnings: contentHtml ? [] : ['未定位到正文容器 #js_content，可能不是微信图文页或页面结构已变更']
    };
  }

  /* ------------------------------------------------------------------ *
   * 从真实 DOM 提取素材（内容脚本使用）
   * ------------------------------------------------------------------ */

  function pick(sel, root) { try { return (root || document).querySelector(sel); } catch (e) { return null; } }
  function pickAll(sel, root) { try { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); } catch (e) { return []; } }
  function textOf(el) { return el ? rules.normalize(el.textContent || '') : ''; }

  function parseDocument(doc, baseUrl) {
    doc = doc || document;
    var contentEl = pick('#js_content', doc)
      || pick('.rich_media_content', doc)
      || pick('#js_article', doc)
      || pick('article', doc);
    var contentHtml = contentEl ? contentEl.innerHTML : '';
    var contentText = contentEl ? rules.normalize(contentEl.innerText || contentEl.textContent || '') : '';

    // 锚点：保留 DOM 顺序与邻近文本
    var anchors = [];
    var aEls = contentEl ? pickAll('a[href], a[data-link], a[data-href]', contentEl) : pickAll('#js_article a[href]', doc);
    aEls.forEach(function (a) {
      var href = a.getAttribute('href') || a.getAttribute('data-link') || a.getAttribute('data-href');
      var near = '';
      var prev = a.previousSibling;
      var guard = 0;
      while (prev && guard++ < 5 && near.length < 120) {
        near = (prev.textContent || '') + near;
        prev = prev.previousSibling;
      }
      anchors.push({
        href: href,
        text: rules.normalize(a.textContent || ''),
        raw: a.outerHTML ? a.outerHTML.slice(0, 500) : '',
        index: -1,
        near: rules.normalize(near).slice(-160)
      });
    });

    var images = pickAll('img', contentEl || doc).map(function (img) {
      return {
        src: img.getAttribute('data-src') || img.getAttribute('src') || '',
        alt: img.getAttribute('alt') || '',
        width: img.getAttribute('data-w') || null
      };
    }).filter(function (i) { return i.src; });

    // 「阅读原文」
    var readOriginal = null;
    var msgSource = null;
    var scripts = pickAll('script', doc);
    for (var i = 0; i < scripts.length; i++) {
      var t = scripts[i].textContent || '';
      var m = t.match(/msg_source_url\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/);
      if (m) { msgSource = unescapeJs(m[1] !== undefined ? m[1] : m[2]); break; }
    }
    if (msgSource) readOriginal = { url: rules.unwrapUrl(absolutize(msgSource)), from: 'msg_source_url', text: '阅读原文' };

    if (!readOriginal) {
      var bottomLinks = pickAll('#js_article_bottom_bar a[href], .rich_media_tool a[href], #js_view_source', doc);
      for (var b = 0; b < bottomLinks.length; b++) {
        var href = bottomLinks[b].getAttribute('href');
        if (!href) continue;
        var abs = absolutize(href, baseUrl || location.href);
        if (abs && !(rules.isWechatHost(rules.safeHost(abs)) && /\/s\?|__biz=/.test(abs))) {
          readOriginal = { url: rules.unwrapUrl(abs), from: 'bottom_bar', text: rules.normalize(bottomLinks[b].textContent || '阅读原文') };
          break;
        }
      }
    }
    if (!readOriginal) {
      for (var a2 = 0; a2 < anchors.length; a2++) {
        if (anchors[a2].href && /(阅读原文|阅读全文)/.test(anchors[a2].text)) {
          readOriginal = { url: rules.unwrapUrl(absolutize(anchors[a2].href, baseUrl || location.href)), from: 'anchor_text', text: anchors[a2].text };
          break;
        }
      }
    }

    var canonical = pick('meta[property="og:url"]', doc);
    var biz = '';
    try {
      var qp = new URL(baseUrl || location.href).searchParams;
      biz = qp.get('__biz') || '';
    } catch (e) { /* ignore */ }

    return {
      origin: 'dom',
      baseUrl: baseUrl || (typeof location !== 'undefined' ? location.href : ''),
      title: textOf(pick('#activity-name', doc)) || textOf(pick('h1', doc)) || textOf(pick('meta[property="og:title"]', doc)) || (typeof document !== 'undefined' ? document.title.replace(/\s*[-|_]\s*微信.*$/, '') : ''),
      account: textOf(pick('#js_name', doc)) || textOf(pick('.profile_nickname', doc)) || '',
      author: textOf(pick('#js_author_name', doc)) || '',
      publishTime: textOf(pick('#publish_time', doc)) || textOf(pick('em#publish_time', doc)) || '',
      description: (pick('meta[name="description"]', doc) || { getAttribute: function () { return ''; } }).getAttribute('content') || '',
      contentHtml: contentHtml,
      contentText: contentText,
      anchors: anchors,
      images: images,
      readOriginal: readOriginal,
      bareUrls: extractBareUrls(contentText),
      scriptVars: { biz: biz, msg_source_url: msgSource || '' },
      canonicalUrl: canonical ? canonical.getAttribute('content') : (baseUrl || (typeof location !== 'undefined' ? location.href : null)),
      structuredData: readStructuredData(doc),
      warnings: contentEl ? [] : ['未找到正文容器 #js_content']
    };
  }

  /** 读取页面里的 JSON-LD / 微信 JS 变量（部分页面存在） */
  function readStructuredData(doc) {
    try {
      var el = pick('script[type="application/ld+json"]', doc);
      if (!el) return null;
      return JSON.parse(el.textContent || 'null');
    } catch (e) { return null; }
  }

  /** 统一入口：接受 HTML 字符串、Document 或 {html}/{document} */
  function parseSource(source, options) {
    options = options || {};
    if (!source) return parseHtml('', options.baseUrl);
    if (typeof source === 'string') {
      if (options.useDom !== false && typeof DOMParser !== 'undefined') {
        try {
          var doc = new DOMParser().parseFromString(source, 'text/html');
          var r = parseDocument(doc, options.baseUrl);
          // DOMParser 路径若拿不到正文，回落到字符串路径
          if (r.contentText && r.contentText.length > 0) return r;
        } catch (e) { /* 回落到字符串解析 */ }
      }
      return parseHtml(source, options.baseUrl);
    }
    if (typeof source.querySelector === 'function') return parseDocument(source, options.baseUrl);
    if (source.document) return parseDocument(source.document, options.baseUrl);
    if (source.html) return parseSource(source.html, options);
    return parseHtml('', options.baseUrl);
  }

  return {
    parseHtml: parseHtml,
    parseDocument: parseDocument,
    parseSource: parseSource,
    htmlToText: htmlToText,
    decodeEntities: decodeEntities,
    extractContentHtml: extractContentHtml,
    extractAnchors: extractAnchors,
    extractImages: extractImages,
    extractScriptVars: extractScriptVars,
    extractBareUrls: extractBareUrls,
    absolutize: absolutize,
    getAttr: getAttr,
    unescapeJs: unescapeJs
  };
});
