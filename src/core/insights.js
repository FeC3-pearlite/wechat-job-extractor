/*!
 * 微信求职信息提取器 — 关键句与摘要 (insights.js)
 * 关键句关键词随画像变化：招聘看「投递/截止」，文献看「DOI/作者/期刊」。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.WJE = root.WJE || {}; root.WJE.insights = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PATTERNS = {
    recruit: /(投递|网申|报名|申请|截止|官网|阅读原文|简历投递|校招|校园招聘|招聘系统|扫码|网申地址|投递地址|投递方式|联系方式|笔试|面试)/,
    literature: /(DOI|doi|arXiv|PMID|作者|期刊|发表|影响因子|分区|摘要|关键词|引用|原文|全文|PDF|通讯作者|第一作者|参考文献|课题组|单位|接受|投稿|Accepted|Published)/i,
    general: /(来源|原文|阅读原文|链接|作者|时间|地点|联系|电话|邮箱|详情|报名|截止)/
  };

  var SENTENCE_SPLIT = /(?<=[。！？；!?;\n])/;

  function splitSentences(text) {
    if (!text) return [];
    var parts;
    try {
      parts = text.split(SENTENCE_SPLIT);
    } catch (e) {
      // 极老环境不支持 lookbehind，退化为按标点切分
      parts = text.replace(/([。！？；!?;\n])/g, '$1\u0001').split('\u0001');
    }
    return parts.map(function (s) { return s.trim(); }).filter(function (s) { return s.length >= 6 && s.length <= 240; });
  }

  /**
   * 抽取关键句。
   * @param {string} text
   * @param {number} limit
   * @param {string} profile
   */
  function findKeySentences(text, limit, profile) {
    limit = limit || 12;
    var re = PATTERNS[profile] || PATTERNS.general;
    var sentences = splitSentences(text);
    var hits = sentences.filter(function (s) { return re.test(s); });

    // 去重（按前 30 字）
    var seen = Object.create(null), out = [];
    hits.forEach(function (s) {
      var k = s.slice(0, 30);
      if (seen[k]) return;
      seen[k] = 1;
      out.push(s);
    });

    // 若关键词命中太少，补几条长句（往往是摘要/正文要点）
    if (out.length < 3) {
      var extra = sentences
        .filter(function (s) { return s.length >= 30 && out.indexOf(s) === -1; })
        .sort(function (a, b) { return b.length - a.length; })
        .slice(0, 3);
      extra.forEach(function (s) {
        var k = s.slice(0, 30);
        if (!seen[k]) { seen[k] = 1; out.push(s); }
      });
    }
    return out.slice(0, limit);
  }

  /** 一行速览。 */
  function buildSummary(profile, fields, links) {
    var parts = [];
    if (profile === 'literature' || profile === 'hybrid') {
      var p = fields.paper;
      if (p) {
        if (p.title) parts.push(p.title.length > 60 ? p.title.slice(0, 60) + '…' : p.title);
        if (p.authors && p.authors.length) {
          parts.push(p.authors.slice(0, 3).join(', ') + (p.authors.length > 3 ? ' 等' : ''));
        }
        if (p.journal) parts.push(p.journal);
        if (p.year) parts.push(String(p.year));
        if (p.doi) parts.push('DOI ' + p.doi);
      }
    }
    if (profile === 'recruit' || profile === 'hybrid') {
      var r = [];
      if (fields.org) r.push(fields.org.value);
      if (fields.batch) r.push(fields.batch.value);
      if (fields.recruitType) r.push(fields.recruitType.value);
      if (r.length) parts = parts.concat(r);
      if (fields.deadline) parts.push('截止 ' + fields.deadline.value);
    }
    if (links && links.best) parts.push('主链接 ' + links.best.host);
    return parts.join(' · ');
  }

  return {
    findKeySentences: findKeySentences,
    buildSummary: buildSummary,
    splitSentences: splitSentences,
    PATTERNS: PATTERNS
  };
});
