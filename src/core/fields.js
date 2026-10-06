/*!
 * 微信求职信息提取器 — 字段抽取层 (fields.js)
 * 输入 parse.js 的「原始素材」，输出结构化求职信息（含证据与置信度）。
 */
(function (root, factory) {
  var api = factory(
    (typeof module !== 'undefined' && module.exports)
      ? { rules: require('./rules.js'), parse: require('./parse.js') }
      : { rules: root && root.WJE && root.WJE.rules, parse: root && root.WJE && root.WJE.parse }
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.WJE = root.WJE || {}; root.WJE.fields = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';

  var rules = deps.rules;
  var parse = deps.parse;

  var ARTICLE_KIND_IMAGE = 'image';
  var ARTICLE_KIND_TEXT = 'text';
  var ARTICLE_KIND_MIXED = 'mixed';

  /* ------------------------------------------------------------------ *
   * 机构名
   * ------------------------------------------------------------------ */

  function pickOrg(raw) {
    var title = raw.title || '';
    var account = raw.account || '';
    var body = raw.contentText || '';

    // ── 阶段 1：标题模板直取（公众号招聘推文标题高度模板化，最可靠）──
    var fromTitle = rules.extractOrgFromTitle(title);
    if (fromTitle) {
      return {
        value: fromTitle.name,
        aliases: rules.uniq(rules.findFullOrgNames(body, fromTitle.name)).slice(0, 5),
        evidence: '标题模板匹配：“' + title.slice(0, 40) + '”',
        from: 'title_pattern',
        confidence: 'high'
      };
    }

    // ── 阶段 2：公众号名（“中信银行招聘” → 中信银行）──
    var fromAccount = rules.extractOrgFromAccount(account);

    // ── 阶段 3：加权候选打分 ──
    var titleCands = rules.findOrgCandidates(title);
    var acctCands = rules.findOrgCandidates(account);
    var bodyCands = rules.findOrgCandidates(body);
    var freq = Object.create(null), firstIdx = Object.create(null), inTitle = Object.create(null);
    titleCands.forEach(function (c) { inTitle[c.name] = true; });
    bodyCands.forEach(function (c) {
      freq[c.name] = (freq[c.name] || 0) + 1;
      if (firstIdx[c.name] === undefined) firstIdx[c.name] = c.index;
    });

    var scored = [];
    function push(name, weight, base, from) {
      var s = base + weight;
      if (freq[name]) s += Math.min(freq[name], 8) * 3;
      if (inTitle[name] && from !== 'title') s += 25;      // 标题与正文互相印证
      if (firstIdx[name] !== undefined) s += Math.max(0, 20 - firstIdx[name] / 200);
      scored.push({ name: name, score: s, from: from });
    }
    titleCands.slice(0, 6).forEach(function (c) { push(c.name, c.weight, 70, 'title'); });
    if (fromAccount) push(fromAccount.name, 8, 85, 'account');
    acctCands.slice(0, 3).forEach(function (c) { push(c.name, c.weight, 60, 'account'); });
    bodyCands.slice(0, 60).forEach(function (c) { push(c.name, c.weight, 20, 'body'); });

    if (!scored.length) return null;
    scored.sort(function (a, b) { return b.score - a.score; });

    var top = scored[0];
    var aliasPool = scored.filter(function (s) {
      return s !== top && (top.name.indexOf(s.name) !== -1 || s.name.indexOf(top.name) !== -1);
    }).map(function (s) { return s.name; });
    aliasPool = aliasPool.concat(rules.findFullOrgNames(body, top.name));
    var confidence = top.from === 'title' ? 'high' : (top.from === 'account' ? 'medium' : (freq[top.name] >= 3 ? 'medium' : 'low'));
    return {
      value: top.name,
      aliases: rules.uniq(aliasPool).slice(0, 5),
      evidence: top.from === 'title' ? ('标题：“' + title.slice(0, 40) + '”')
        : top.from === 'account' ? ('公众号名：“' + account + '”')
          : ('正文出现 ' + (freq[top.name] || 1) + ' 次'),
      from: top.from,
      confidence: confidence
    };
  }

  /* ------------------------------------------------------------------ *
   * 链接
   * ------------------------------------------------------------------ */

  function classifyAndRank(raw) {
    var seen = Object.create(null);
    var list = [];

    function add(url, text, near, source) {
      if (!url) return;
      var abs = parse.absolutize(url, raw.baseUrl);
      if (!abs) return;
      var unwrapped = rules.unwrapUrl(abs);
      var key = unwrapped.replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
      if (seen[key]) {
        // 合并锚文本
        var ex = seen[key];
        if (text && ex.text.indexOf(text) === -1) ex.text = (ex.text ? ex.text + ' / ' : '') + text;
        if (source && ex.sources.indexOf(source) === -1) ex.sources.push(source);
        return;
      }
      var sc = rules.scoreLink(unwrapped, text, near);
      var item = {
        url: unwrapped,
        originalUrl: abs,
        host: rules.safeHost(unwrapped),
        text: text || '',
        near: near || '',
        kind: sc.kind,
        score: sc.score,
        reasons: sc.reasons,
        sources: source ? [source] : []
      };
      seen[key] = item;
      list.push(item);
    }

    // 阅读原文优先
    if (raw.readOriginal && raw.readOriginal.url) {
      add(raw.readOriginal.url, raw.readOriginal.text || '阅读原文', '阅读原文', 'read_original:' + raw.readOriginal.from);
    }
    // 正文锚点
    (raw.anchors || []).forEach(function (a) {
      if (!a.href) return;
      var host = rules.safeHost(parse.absolutize(a.href, raw.baseUrl) || '');
      if (/mmbiz\.qpic\.cn|mmbiz\.qlogo\.cn|res\.wx\.qq\.com/.test(host)) return;  // 图片/表情链接
      add(a.href, a.text, a.near, 'content_anchor');
    });
    // 正文纯文本 URL
    (raw.bareUrls || []).forEach(function (b) { add(b.url, '(正文文本)', b.near, 'content_text'); });

    // 从「阅读原文」推导投递标记
    list.forEach(function (it) {
      if (/read_original/.test(it.sources.join(','))) {
        it.score += 18;
        it.reasons.push('来自「阅读原文」');
      }
    });

    list.sort(function (a, b) { return b.score - a.score; });
    var apply = list.filter(function (i) { return i.score >= 25 && i.kind !== 'wechat' && !/\.(png|jpe?g|gif|webp|svg)$/i.test(i.url); });
    return { all: list, apply: apply, best: apply[0] || null };
  }

  /* ------------------------------------------------------------------ *
   * 关键句
   * ------------------------------------------------------------------ */

  var KEY_SENTENCE_RE = /(投递|网申|报名|申请|截止|官网|阅读原文|简历投递|校招|校园招聘|招聘系统|扫码|网申地址|投递地址|投递方式)/;

  function findKeySentences(text, limit) {
    limit = limit || 12;
    if (!text) return [];
    var sentences = text
      .split(/(?<=[。！？；\n])/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length >= 6 && s.length <= 220; });
    var hits = sentences.filter(function (s) { return KEY_SENTENCE_RE.test(s); });
    // 去重（按前 30 字）
    var seen = Object.create(null), out = [];
    hits.forEach(function (s) {
      var k = s.slice(0, 30);
      if (seen[k]) return;
      seen[k] = 1;
      out.push(s);
    });
    return out.slice(0, limit);
  }

  /* ------------------------------------------------------------------ *
   * 主入口
   * ------------------------------------------------------------------ */

  function extractFields(raw, options) {
    options = options || {};
    var text = raw.contentText || '';
    var title = raw.title || '';
    var haystack = [title, raw.account, raw.description, text].filter(Boolean).join('\n');
    var head = [title, raw.description, text.slice(0, 600)].filter(Boolean).join('\n');

    var textLength = text.replace(/\s/g, '').length;
    var imageCount = (raw.images || []).length;
    var kind = ARTICLE_KIND_TEXT;
    if (textLength < 120 && imageCount >= 3) kind = ARTICLE_KIND_IMAGE;
    else if (textLength < 500 && imageCount >= 6) kind = ARTICLE_KIND_MIXED;

    var batch = rules.extractBatch(haystack);
    var recruitType = rules.extractRecruitType([title, raw.account, text.slice(0, 400)].filter(Boolean).join('\n'));

    // 截止年份的推断顺序：发布时间 > 当年 > （届别年份 - 1）。
    // 注意：「2027届」是毕业年份，其校招截止日期通常落在前一年（2026），
    // 因此届别年份只能作为最后兜底，绝不能优先于发布时间。
    var publishYear = guessYear(raw.publishTime);
    var nowYear = options.nowYear || new Date().getFullYear();
    var yearGuess = publishYear || nowYear || (batch && batch.year ? batch.year - 1 : null);

    var deadline = rules.extractDeadline(text, yearGuess, nowYear)
      || rules.extractDeadline(head, yearGuess, nowYear);

    var fields = {
      org: pickOrg(raw),
      batch: batch ? { value: batch.label, year: batch.year, raw: batch.raw, evidence: '匹配“' + batch.raw + '”', confidence: 'high' } : null,
      recruitType: recruitType ? { value: recruitType.value, raw: recruitType.raw, evidence: '匹配“' + recruitType.raw + '”', confidence: /校园招聘|校招/.test(recruitType.raw) ? 'high' : 'medium' } : null,
      deadline: deadline ? {
        value: deadline.value,
        raw: deadline.raw,
        evidence: deadline.evidence,
        confidence: (deadline.yearAssumed ? 'medium' : 'high')
      } : null,
      education: rules.extractEducation(text),
      majors: rules.extractMajors(text),
      positions: rules.extractPositions(text),
      locations: rules.extractLocations(text),
      headcount: rules.extractHeadcount(text),
      contacts: rules.extractContacts(text)
    };

    var links = classifyAndRank(raw);
    // 「阅读原文」是微信推文最关键的投递入口来源，显式保留在结果里
    links.readOriginal = raw.readOriginal && raw.readOriginal.url
      ? { url: rules.unwrapUrl(raw.readOriginal.url), from: raw.readOriginal.from, text: raw.readOriginal.text || '阅读原文' }
      : null;
    var warnings = (raw.warnings || []).slice();

    if (kind === ARTICLE_KIND_IMAGE) {
      warnings.push('正文以图片为主（文字仅 ' + textLength + ' 字，图片 ' + imageCount + ' 张）：投递链接与截止时间很可能只印在长图里，插件无法读取图片文字，请打开原图人工确认或使用带 OCR 的流程。');
    } else if (kind === ARTICLE_KIND_MIXED) {
      warnings.push('正文文字偏少而图片较多（文字 ' + textLength + ' 字 / 图片 ' + imageCount + ' 张），部分关键信息可能只在图片中。');
    }
    if (!links.best) warnings.push('未识别出明确的投递入口链接，可能是图片型推文或使用了二维码投递。');
    if (fields.org && fields.org.confidence === 'low') warnings.push('招聘主体为推测结果，请人工确认。');

    var result = {
      version: '1.0.0',
      extractedAt: new Date().toISOString(),
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
      summary: buildSummary(fields, links),
      fields: fields,
      links: links,
      keySentences: findKeySentences(text, options.keySentenceLimit || 12),
      images: (raw.images || []).slice(0, 40),
      warnings: rules.uniq(warnings)
    };
    return result;
  }

  function guessYear(publishTime) {
    var m = String(publishTime || '').match(/(20\d{2})/);
    return m ? +m[1] : null;
  }

  function buildSummary(fields, links) {
    var parts = [];
    if (fields.org) parts.push(fields.org.value);
    if (fields.batch) parts.push(fields.batch.value);
    if (fields.recruitType) parts.push(fields.recruitType.value);
    var line = parts.join(' · ');
    if (fields.deadline) line += ' ｜ 截止 ' + fields.deadline.value;
    if (links.best) line += ' ｜ 投递入口 ' + links.best.host;
    return line;
  }

  return {
    extractFields: extractFields,
    pickOrg: pickOrg,
    classifyAndRank: classifyAndRank,
    findKeySentences: findKeySentences,
    ARTICLE_KIND_IMAGE: ARTICLE_KIND_IMAGE,
    ARTICLE_KIND_TEXT: ARTICLE_KIND_TEXT,
    ARTICLE_KIND_MIXED: ARTICLE_KIND_MIXED
  };
});
