/*!
 * 微信求职信息提取器 — 输出格式化 (format.js)
 * 支持 Markdown / JSON / CSV / 纯链接列表 / 剪贴板文本。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.WJE = root.WJE || {}; root.WJE.format = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function fieldValue(res, key) {
    var f = res.fields && res.fields[key];
    if (!f) return '';
    if (typeof f === 'string') return f;
    if (f.value !== undefined) return String(f.value);
    if (f.list) return f.list.join('、');
    return '';
  }

  function confidenceTag(f) {
    if (!f || !f.confidence) return '';
    return { high: '', medium: '（待确认）', low: '（推测）' }[f.confidence] || '';
  }

  /* ---------------------------- Markdown ---------------------------- */

  function toMarkdown(res, opts) {
    opts = opts || {};
    var lines = [];
    lines.push('# ' + (res.meta.title || '(无标题)'));
    lines.push('');
    lines.push('| 字段 | 内容 |');
    lines.push('| --- | --- |');
    var rows = [
      ['公众号', res.meta.account],
      ['发布时间', res.meta.publishTime],
      ['原文链接', res.meta.url],
      ['招聘主体', fieldValue(res, 'org') + confidenceTag(res.fields.org)],
      ['招聘批次', fieldValue(res, 'batch')],
      ['招聘类型', fieldValue(res, 'recruitType')],
      ['投递截止', fieldValue(res, 'deadline') + (res.fields.deadline && res.fields.deadline.raw ? '（原文：' + res.fields.deadline.raw + '）' : '')],
      ['学历要求', fieldValue(res, 'education')],
      ['工作地点', res.fields.locations ? (res.fields.locations.list.join('、') + (res.fields.locations.nationwide ? '（含全国）' : '')) : ''],
      ['招聘岗位', fieldValue(res, 'positions')],
      ['需求专业', fieldValue(res, 'majors')],
      ['招聘人数', res.fields.headcount ? String(res.fields.headcount.value) : ''],
      ['联系方式', res.fields.contacts ? [].concat(res.fields.contacts.emails || [], res.fields.contacts.phones || []).join(' / ') : '']
    ];
    rows.forEach(function (r) {
      if (r[1] === undefined || r[1] === null || r[1] === '') return;
      lines.push('| ' + r[0] + ' | ' + String(r[1]).replace(/\|/g, '\\|').replace(/\n/g, ' ') + ' |');
    });
    lines.push('');

    lines.push('## 投递入口');
    if (res.links.apply.length) {
      res.links.apply.forEach(function (l, i) {
        lines.push((i + 1) + '. [' + (l.text || l.host) + '](' + l.url + ')');
        lines.push('   - 域名：`' + l.host + '`　类型：' + kindLabel(l.kind) + '　评分：' + l.score);
        if (l.reasons && l.reasons.length && opts.verbose !== false) {
          lines.push('   - 判定依据：' + l.reasons.join('；'));
        }
      });
    } else {
      lines.push('> 未识别到明确的投递入口。' + (res.meta.articleKind === 'image' ? '本篇为图片型推文，链接可能印在长图中。' : ''));
    }
    lines.push('');

    if (res.links.readOriginal) {
      lines.push('## 阅读原文跳转');
      lines.push('- ' + res.links.readOriginal.url + '　（来源：' + res.links.readOriginal.from + '）');
      lines.push('');
    }

    var others = res.links.all.filter(function (l) {
      return res.links.apply.indexOf(l) === -1 && !/read_original/.test(l.sources.join(',')) && l.kind !== 'wechat';
    }).slice(0, 10);
    if (others.length) {
      lines.push('## 其他链接');
      others.forEach(function (l) { lines.push('- [' + (l.text || l.host) + '](' + l.url + ')'); });
      lines.push('');
    }

    if (res.keySentences.length && opts.verbose !== false) {
      lines.push('## 关键句摘录');
      res.keySentences.forEach(function (s) { lines.push('> ' + s); });
      lines.push('');
    }

    if (res.warnings.length) {
      lines.push('## 提示');
      res.warnings.forEach(function (w) { lines.push('- ⚠️ ' + w); });
      lines.push('');
    }

    lines.push('---');
    lines.push('_由「微信求职信息提取器」于 ' + res.extractedAt + ' 生成，字段为机器抽取结果，投递前请以官方原文为准。_');
    return lines.join('\n');
  }

  function kindLabel(kind) {
    return {
      official: '官网/官方域名',
      ats: '招聘系统',
      redirect: '跳转中间页',
      wechat: '微信站内',
      other: '其他',
      invalid: '无效'
    }[kind] || kind;
  }

  /* ------------------------------ JSON ------------------------------ */

  function toJSON(res, pretty) {
    return JSON.stringify(res, null, pretty === false ? 0 : 2);
  }

  /* ------------------------------ CSV ------------------------------- */

  var CSV_COLUMNS = [
    ['title', function (r) { return r.meta.title; }],
    ['account', function (r) { return r.meta.account; }],
    ['publishTime', function (r) { return r.meta.publishTime; }],
    ['url', function (r) { return r.meta.url; }],
    ['org', function (r) { return fieldValue(r, 'org'); }],
    ['batch', function (r) { return fieldValue(r, 'batch'); }],
    ['recruitType', function (r) { return fieldValue(r, 'recruitType'); }],
    ['deadline', function (r) { return fieldValue(r, 'deadline'); }],
    ['education', function (r) { return fieldValue(r, 'education'); }],
    ['locations', function (r) { return r.fields.locations ? r.fields.locations.list.join('、') : ''; }],
    ['positions', function (r) { return fieldValue(r, 'positions'); }],
    ['majors', function (r) { return fieldValue(r, 'majors'); }],
    ['headcount', function (r) { return r.fields.headcount ? String(r.fields.headcount.value) : ''; }],
    ['contacts', function (r) { return r.fields.contacts ? [].concat(r.fields.contacts.emails || [], r.fields.contacts.phones || []).join(' / ') : ''; }],
    ['applyLink', function (r) { return r.links.best ? r.links.best.url : ''; }],
    ['allApplyLinks', function (r) { return r.links.apply.map(function (l) { return l.url; }).join(' | '); }],
    ['readOriginal', function (r) { return r.links.readOriginal ? r.links.readOriginal.url : ''; }],
    ['articleKind', function (r) { return r.meta.articleKind; }],
    ['warnings', function (r) { return r.warnings.join(' | '); }]
  ];

  function csvCell(v) {
    var s = v === undefined || v === null ? '' : String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCSV(results) {
    var arr = Array.isArray(results) ? results : [results];
    var out = [CSV_COLUMNS.map(function (c) { return c[0]; }).join(',')];
    arr.forEach(function (r) {
      out.push(CSV_COLUMNS.map(function (c) { return csvCell(c[1](r)); }).join(','));
    });
    return out.join('\r\n');
  }

  /* ---------------------------- 纯链接 ------------------------------ */

  function toLinkList(res, mode) {
    if (!Array.isArray(res)) res = [res];
    var urls = [];
    res.forEach(function (r) {
      var pool = mode === 'all' ? r.links.apply.concat(r.links.readOriginal ? [{ url: r.links.readOriginal.url }] : []) : r.links.apply;
      pool.forEach(function (l) { if (l && l.url && urls.indexOf(l.url) === -1) urls.push(l.url); });
    });
    return urls.join('\n');
  }

  /* --------------------------- 一行速览 ----------------------------- */

  function toOneLiner(res) {
    var bits = [];
    if (res.fields.org) bits.push(res.fields.org.value);
    if (res.fields.batch) bits.push(res.fields.batch.value);
    if (res.fields.deadline) bits.push('截止' + res.fields.deadline.value);
    if (res.links.best) bits.push(res.links.best.url);
    return bits.join(' | ');
  }

  return {
    toMarkdown: toMarkdown,
    toJSON: toJSON,
    toCSV: toCSV,
    toLinkList: toLinkList,
    toOneLiner: toOneLiner,
    fieldValue: fieldValue,
    kindLabel: kindLabel,
    CSV_COLUMNS: CSV_COLUMNS
  };
});
