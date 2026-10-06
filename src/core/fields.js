/*!
 * 微信求职信息提取器 — 编排层 (fields.js)
 *
 * 流程：
 *   原始素材 → 内容类型判别(classify) → 按画像跑提取器(profiles/*) → 链接归集打分(links) → 汇总
 *
 * 支持的画像：recruit（招聘）/ literature（文献）/ general（通用）/ hybrid（两者都跑）
 * 自动判断，也允许调用方用 options.forceProfile 手动指定（面板上的切换开关）。
 */
(function (root, factory) {
  var api = factory(
    (typeof module !== 'undefined' && module.exports)
      ? {
        rules: require('./rules.js'),
        classify: require('./classify.js'),
        links: require('./links.js'),
        insights: require('./insights.js'),
        recruit: require('./profiles/recruit.js'),
        literature: require('./profiles/literature.js'),
        general: require('./profiles/general.js')
      }
      : {
        rules: root && root.WJE && root.WJE.rules,
        classify: root && root.WJE && root.WJE.classify,
        links: root && root.WJE && root.WJE.links,
        insights: root && root.WJE && root.WJE.insights,
        recruit: root && root.WJE && root.WJE.profiles && root.WJE.profiles.recruit,
        literature: root && root.WJE && root.WJE.profiles && root.WJE.profiles.literature,
        general: root && root.WJE && root.WJE.profiles && root.WJE.profiles.general
      }
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.WJE = root.WJE || {}; root.WJE.fields = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';

  var rules = deps.rules;
  var classify = deps.classify;
  var links = deps.links;
  var insights = deps.insights;

  var ARTICLE_KIND_IMAGE = 'image';
  var ARTICLE_KIND_TEXT = 'text';
  var ARTICLE_KIND_MIXED = 'mixed';

  var VALID_PROFILES = { recruit: 1, literature: 1, general: 1, hybrid: 1 };

  /* ---------------------- 链接：多画像合并 ---------------------- */

  function urlKey(u) { return String(u || '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase(); }

  function mergeLinkSets(a, b) {
    var byKey = Object.create(null);
    [a, b].forEach(function (set) {
      if (!set) return;
      set.all.forEach(function (item) {
        var k = urlKey(item.url);
        var ex = byKey[k];
        if (!ex) {
          byKey[k] = {
            url: item.url, originalUrl: item.originalUrl, host: item.host, text: item.text,
            near: item.near, kind: item.kind, score: item.score,
            reasons: item.reasons.slice(), sources: item.sources.slice()
          };
          return;
        }
        ex.reasons = rules.uniq(ex.reasons.concat(item.reasons));
        ex.sources = rules.uniq(ex.sources.concat(item.sources));
        if (item.score > ex.score) { ex.score = item.score; ex.kind = item.kind; }
      });
    });
    var all = Object.keys(byKey).map(function (k) { return byKey[k]; })
      .sort(function (x, y) { return y.score - x.score; });

    var primKeys = Object.create(null);
    [a, b].forEach(function (set) {
      if (!set) return;
      set.primary.forEach(function (i) { primKeys[urlKey(i.url)] = 1; });
    });
    var primary = all.filter(function (i) { return primKeys[urlKey(i.url)]; });

    var groups = { doi: [], preprint: [], publisher: [], database: [], pdf: [] };
    all.forEach(function (i) { if (groups[i.kind]) groups[i.kind].push(i); });

    return { all: all, primary: primary, apply: primary, best: primary[0] || null, groups: groups, profile: 'hybrid' };
  }

  function rankLinks(raw, profile) {
    var result;
    if (profile === 'hybrid') {
      result = mergeLinkSets(links.classifyAndRank(raw, 'recruit'), links.classifyAndRank(raw, 'literature'));
    } else {
      var p = (profile === 'literature' || profile === 'recruit') ? profile : 'general';
      result = links.classifyAndRank(raw, p);
    }
    // 「阅读原文」是最关键的一条跳转，显式保留在结果里（合并路径也要带上）
    result.readOriginal = (raw.readOriginal && raw.readOriginal.url)
      ? {
        url: rules.unwrapUrl(raw.readOriginal.url),
        from: raw.readOriginal.from,
        text: raw.readOriginal.text || '阅读原文'
      }
      : null;
    return result;
  }

  /* ---------------------- 文章形态 ---------------------- */

  function detectArticleKind(text, imageCount) {
    var textLength = (text || '').replace(/\s/g, '').length;
    if (textLength < 120 && imageCount >= 3) return ARTICLE_KIND_IMAGE;
    if (textLength < 500 && imageCount >= 6) return ARTICLE_KIND_MIXED;
    return ARTICLE_KIND_TEXT;
  }

  function emptyFields() {
    return {
      org: null, batch: null, recruitType: null, deadline: null, education: null,
      majors: null, positions: null, locations: null, headcount: null, contacts: null,
      paper: null, timeline: null, events: null, organizer: null
    };
  }

  /* ---------------------- 主入口 ---------------------- */

  function extractFields(raw, options) {
    options = options || {};
    var text = raw.contentText || '';
    var title = raw.title || '';
    var imageCount = (raw.images || []).length;
    var textLength = text.replace(/\s/g, '').length;
    var kind = detectArticleKind(text, imageCount);

    // 1) 判别内容类型
    var detection = classify.detect(raw);
    var profile = detection.type;
    var overridden = false;
    if (options.forceProfile && VALID_PROFILES[options.forceProfile]) {
      overridden = options.forceProfile !== profile;
      profile = options.forceProfile;
    }

    // 2) 跑对应画像
    var runners = [];
    if (profile === 'recruit' || profile === 'hybrid') runners.push(deps.recruit);
    if (profile === 'literature' || profile === 'hybrid') runners.push(deps.literature);
    if (profile === 'general') runners.push(deps.general);

    var fields = emptyFields();
    var warnings = (raw.warnings || []).slice();

    runners.forEach(function (mod) {
      var r = mod.extract(raw, options);
      Object.keys(r.fields || {}).forEach(function (k) {
        if (r.fields[k] !== null && r.fields[k] !== undefined) fields[k] = r.fields[k];
      });
      if (r.warnings) warnings = warnings.concat(r.warnings);
    });

    // 3) 链接归集（文献画像下的期刊/DOI 加成需要它在前面完成）
    var ranked = rankLinks(raw, profile);

    if (fields.paper) {
      var urls = ranked.all.map(function (i) { return i.url; });
      fields.paper.openAccess = deps.literature.detectOpenAccess(urls, fields.paper.journal);
    }

    // 4) 通用告警
    if (kind === ARTICLE_KIND_IMAGE) {
      warnings.push('正文以图片为主（文字仅 ' + textLength + ' 字，图片 ' + imageCount +
        ' 张）：关键信息很可能只印在长图里，插件无法读取图片文字，请打开原图人工确认。');
    } else if (kind === ARTICLE_KIND_MIXED) {
      warnings.push('正文文字偏少而图片较多（文字 ' + textLength + ' 字 / 图片 ' + imageCount + ' 张），部分关键信息可能只在图片中。');
    }
    if (!ranked.best) {
      warnings.push(profile === 'literature'
        ? '未识别出明确的原文链接，可能是图片型推文或只给了 DOI 文本。'
        : '未识别出明确的关键链接，可能是图片型推文或使用了二维码。');
    }
    if (overridden) {
      warnings.push('内容类型由你手动指定为「' + classify.label(profile) + '」，自动判别结果是「' + classify.label(detection.type) + '」。');
    }

    return {
      version: '2.0.0',
      extractedAt: new Date().toISOString(),
      detection: {
        type: detection.type,
        activeProfile: profile,
        label: classify.label(profile),
        autoLabel: classify.label(detection.type),
        confidence: detection.confidence,
        scores: detection.scores,
        evidence: detection.evidence,
        hints: detection.hints,
        overridden: overridden
      },
      meta: {
        title: title,
        account: raw.account || '',
        author: raw.author || '',
        publishTime: raw.publishTime || '',
        url: options.pageUrl || raw.baseUrl || '',
        canonicalUrl: raw.canonicalUrl || '',
        articleKind: kind,
        textLength: textLength,
        imageCount: imageCount,
        anchorsCount: (raw.anchors || []).length
      },
      summary: insights.buildSummary(profile, fields, ranked),
      fields: fields,
      links: ranked,
      keySentences: insights.findKeySentences(text, options.keySentenceLimit || 12, profile),
      images: (raw.images || []).slice(0, 40),
      warnings: rules.uniq(warnings)
    };
  }

  return {
    extractFields: extractFields,
    emptyFields: emptyFields,
    detectArticleKind: detectArticleKind,
    rankLinks: rankLinks,
    mergeLinkSets: mergeLinkSets,

    // 向后兼容的薄封装
    pickOrg: function (raw) { return deps.recruit.pickOrg(raw); },
    classifyAndRank: function (raw, profile) { return links.classifyAndRank(raw, profile || 'recruit'); },
    findKeySentences: function (text, limit, profile) { return insights.findKeySentences(text, limit, profile || 'recruit'); },

    ARTICLE_KIND_IMAGE: ARTICLE_KIND_IMAGE,
    ARTICLE_KIND_TEXT: ARTICLE_KIND_TEXT,
    ARTICLE_KIND_MIXED: ARTICLE_KIND_MIXED
  };
});
