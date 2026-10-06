/*!
 * 微信求职信息提取器 — 招聘画像 (profiles/recruit.js)
 * 从 fields.js 拆出：机构名识别 + 批次/类型/截止/学历/专业/岗位/地点/人数/联系方式。
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
    root.WJE.profiles.recruit = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';

  var rules = deps.rules;

  /* ------------------------------------------------------------------ *
   * 机构名（三阶段）
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
      if (inTitle[name] && from !== 'title') s += 25;
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
   * 主入口
   * ------------------------------------------------------------------ */

  function extract(raw, options) {
    options = options || {};
    var text = raw.contentText || '';
    var title = raw.title || '';
    var haystack = [title, raw.account, raw.description, text].filter(Boolean).join('\n');
    var head = [title, raw.description, text.slice(0, 600)].filter(Boolean).join('\n');

    var batch = rules.extractBatch(haystack);
    var recruitType = rules.extractRecruitType([title, raw.account, text.slice(0, 400)].filter(Boolean).join('\n'));

    // 截止年份推断顺序：发布时间 > 当年 > （届别年份 − 1）。
    // 「2027届」是毕业年份，校招截止通常落在前一年，故届别年份只能兜底。
    var publishYear = guessYear(raw.publishTime);
    var nowYear = options.nowYear || new Date().getFullYear();
    var yearGuess = publishYear || nowYear || (batch && batch.year ? batch.year - 1 : null);

    var deadline = rules.extractDeadline(text, yearGuess, nowYear)
      || rules.extractDeadline(head, yearGuess, nowYear);

    var fields = {
      org: pickOrg(raw),
      batch: batch ? { value: batch.label, year: batch.year, raw: batch.raw, evidence: '匹配“' + batch.raw + '”', confidence: 'high' } : null,
      recruitType: recruitType ? {
        value: recruitType.value, raw: recruitType.raw,
        evidence: '匹配“' + recruitType.raw + '”',
        confidence: /校园招聘|校招/.test(recruitType.raw) ? 'high' : 'medium'
      } : null,
      deadline: deadline ? {
        value: deadline.value, raw: deadline.raw, evidence: deadline.evidence,
        confidence: deadline.yearAssumed ? 'medium' : 'high'
      } : null,
      education: rules.extractEducation(text),
      majors: rules.extractMajors(text),
      positions: rules.extractPositions(text),
      locations: rules.extractLocations(text),
      headcount: rules.extractHeadcount(text),
      contacts: rules.extractContacts(text),
      paper: null
    };

    var warnings = [];
    if (fields.org && fields.org.confidence === 'low') warnings.push('招聘主体为推测结果，请人工确认。');

    return { fields: fields, warnings: warnings };
  }

  function guessYear(publishTime) {
    var m = String(publishTime || '').match(/(20\d{2})/);
    return m ? +m[1] : null;
  }

  return {
    extract: extract,
    pickOrg: pickOrg,
    guessYear: guessYear
  };
});
