/*!
 * 微信求职信息提取器 — 通用画像 (profiles/general.js)
 * 两类信号都不强时使用：尽量把「时间 / 机构 / 联系方式 / 事件」这些通用要素捞出来，
 * 不强行套招聘或文献的字段。
 */
(function (root, factory) {
  var api = factory(
    (typeof module !== 'undefined' && module.exports)
      ? { rules: require('../rules.js') }
      : { rules: root && root.WJE && root.WJE.rules }
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    root.WJE = root.WJE || {};
    root.WJE.profiles = root.WJE.profiles || {};
    root.WJE.profiles.general = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';

  var rules = deps.rules;

  var EVENT_KEYWORDS = [
    '会议', '论坛', '峰会', '讲座', '报告会', '研讨会', '沙龙', '培训', 'workshop', 'Workshop',
    '征稿', '通知', '公告', '公示', '评选', '申报', '报名', '启动', '发布', '上线', '开放',
    '政策', '解读', '指南', '清单', '汇总', '盘点', '数据', '报告'
  ];

  var ORG_LABELS = ['主办单位', '承办单位', '协办单位', '主办', '承办', '发布单位', '来源', '机构', '单位'];

  function extractEvents(text, title) {
    var hay = (title || '') + '\n' + (text || '').slice(0, 1500);
    var hits = [];
    for (var i = 0; i < EVENT_KEYWORDS.length; i++) {
      var kw = EVENT_KEYWORDS[i];
      if (hay.indexOf(kw) !== -1) hits.push(kw);
    }
    if (!hits.length) return null;
    // 取标题里命中的优先
    var inTitle = hits.filter(function (k) { return (title || '').indexOf(k) !== -1; });
    return {
      list: rules.uniq(inTitle.concat(hits)).slice(0, 8),
      fromTitle: inTitle.length > 0
    };
  }

  function extractOrganizer(text) {
    for (var i = 0; i < ORG_LABELS.length; i++) {
      var re = new RegExp('(?:^|[\\n。；;])\\s*' + ORG_LABELS[i] + '\\s*[:：]\\s*([^\\n]{2,60})');
      var m = text.match(re);
      if (m) {
        var v = m[1].trim().replace(/[。；;，,]\s*$/, '');
        if (v.length >= 2) return { value: v, from: ORG_LABELS[i] };
      }
    }
    return null;
  }

  function extract(raw, options) {
    options = options || {};
    var text = raw.contentText || '';
    var title = raw.title || '';

    var dates = rules.findAllDates(text);
    var contacts = rules.extractContacts(text);
    var events = extractEvents(text, title);
    var organizer = extractOrganizer(text);

    // 通用画像下也给出一个"疑似主体"，便于归档命名
    var cands = rules.findOrgCandidates([title, text.slice(0, 1200)].filter(Boolean).join('\n'));
    var org = cands.length
      ? { value: cands[0].name, confidence: 'low', evidence: '正文候选（未做招聘模板校验）', from: 'body' }
      : null;

    var fields = {
      org: org,
      batch: null, recruitType: null, deadline: null, education: null, majors: null,
      positions: null, locations: null, headcount: null,
      contacts: contacts,
      paper: null,
      timeline: dates.slice(0, 12).map(function (d) { return { value: d.value, raw: d.raw }; }),
      events: events,
      organizer: organizer
    };

    var warnings = [];
    if (!events && !dates.length && !contacts) {
      warnings.push('这是一篇通用推送：未识别到招聘或文献特征，也没抓到明确的时间/联系方式，建议人工阅读。');
    }

    return { fields: fields, warnings: warnings };
  }

  return { extract: extract, extractEvents: extractEvents, extractOrganizer: extractOrganizer };
});
