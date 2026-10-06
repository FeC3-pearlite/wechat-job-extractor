/*!
 * 微信求职信息提取器 — 输出格式化 (format.js)
 * 支持 Markdown / JSON / CSV / 纯链接列表 / 一键引用格式。
 * 输出按画像分流：招聘 → 投递入口表；文献 → 论文信息表 + 原文链接 + 引用格式。
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

  function profileOf(res) {
    return (res.detection && res.detection.activeProfile) || 'recruit';
  }

  function isLiterature(res) {
    var p = profileOf(res);
    return p === 'literature' || (p === 'hybrid' && res.fields && res.fields.paper && res.fields.paper.title);
  }
  function isRecruit(res) {
    var p = profileOf(res);
    return p === 'recruit' || p === 'hybrid';
  }

  function mdCell(v) {
    return String(v === undefined || v === null ? '' : v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  }

  function pushRow(lines, k, v) {
    if (v === undefined || v === null || v === '') return;
    lines.push('| ' + k + ' | ' + mdCell(v) + ' |');
  }

  /* ---------------------------- Markdown ---------------------------- */

  function toMarkdown(res, opts) {
    opts = opts || {};
    var lines = [];
    var lit = isLiterature(res);

    lines.push('# ' + (res.meta.title || '(无标题)'));
    lines.push('');

    // 类型徽标
    if (res.detection) {
      var conf = { high: '高', medium: '中', low: '低' }[res.detection.confidence] || res.detection.confidence;
      lines.push('> 识别类型：**' + res.detection.label + '**（置信度 ' + conf +
        '；招聘信号 ' + res.detection.scores.recruit + ' / 文献信号 ' + res.detection.scores.literature + '）');
      lines.push('');
    }

    lines.push('| 字段 | 内容 |');
    lines.push('| --- | --- |');
    pushRow(lines, '公众号', res.meta.account);
    pushRow(lines, '发布时间', res.meta.publishTime);
    pushRow(lines, '原文链接', res.meta.url);

    if (lit) renderLiteratureRows(lines, res);
    if (isRecruit(res)) renderRecruitRows(lines, res);
    if (profileOf(res) === 'general') renderGeneralRows(lines, res);

    lines.push('');

    // ---- 链接 ----
    if (lit) {
      lines.push('## 原文链接');
      renderLinkList(lines, res, opts);
      lines.push('');
      var g = res.links.groups || {};
      var extras = []
        .concat(g.doi || [], g.preprint || [], g.publisher || [], g.database || [], g.pdf || [])
        .filter(function (l) { return (res.links.primary || []).indexOf(l) === -1; });
      if (extras.length) {
        lines.push('### 其他学术链接');
        dedupeLinks(extras).slice(0, 10).forEach(function (l) {
          lines.push('- [' + (l.text || l.host) + '](' + l.url + ')　`' + l.host + '`');
        });
        lines.push('');
      }
    } else {
      lines.push('## ' + (profileOf(res) === 'general' ? '主要链接' : '投递入口'));
      renderLinkList(lines, res, opts);
      lines.push('');
    }

    if (res.links && res.links.readOriginal) {
      lines.push('## 阅读原文跳转');
      lines.push('- ' + res.links.readOriginal.url + '　（来源：' + res.links.readOriginal.from + '）');
      lines.push('');
    }

    // ---- 文献专属：摘要 / 引用格式 ----
    if (lit && res.fields.paper) renderLiteratureExtras(lines, res.fields.paper);

    // ---- 通用画像：时间线 ----
    if (profileOf(res) === 'general' && res.fields.timeline && res.fields.timeline.length) {
      lines.push('## 文中日期');
      res.fields.timeline.forEach(function (d) { lines.push('- ' + d.value + '（' + d.raw + '）'); });
      lines.push('');
    }

    // ---- 其他链接 ----
    var others = (res.links.all || []).filter(function (l) {
      return (res.links.primary || []).indexOf(l) === -1 && !/read_original/.test((l.sources || []).join(',')) && l.kind !== 'wechat';
    }).slice(0, 10);
    if (others.length) {
      lines.push('## 其他链接');
      others.forEach(function (l) { lines.push('- [' + (l.text || l.host) + '](' + l.url + ')'); });
      lines.push('');
    }

    if (res.keySentences && res.keySentences.length && opts.verbose !== false) {
      lines.push('## 关键句摘录');
      res.keySentences.forEach(function (s) { lines.push('> ' + s); });
      lines.push('');
    }

    if (res.warnings && res.warnings.length) {
      lines.push('## 提示');
      res.warnings.forEach(function (w) { lines.push('- ⚠️ ' + w); });
      lines.push('');
    }

    lines.push('---');
    lines.push('_由「微信求职信息提取器」v' + (res.version || '2.0.0') + ' 于 ' + res.extractedAt +
      ' 生成，字段为机器抽取结果，请以原文为准。_');
    return lines.join('\n');
  }

  function renderLinkList(lines, res, opts) {
    var primary = res.links.primary || res.links.apply || [];
    if (!primary.length) {
      lines.push('> 未识别到明确链接。' + (res.meta.articleKind === 'image' ? '本篇为图片型推文，链接可能印在长图中。' : ''));
      return;
    }
    primary.forEach(function (l, i) {
      lines.push((i + 1) + '. [' + (l.text || l.host) + '](' + l.url + ')');
      lines.push('   - 域名：`' + l.host + '`　类型：' + kindLabel(l.kind) + '　评分：' + l.score);
      if (opts.verbose !== false && l.reasons && l.reasons.length) lines.push('   - 判定依据：' + l.reasons.join('；'));
    });
  }

  function dedupeLinks(list) {
    var seen = Object.create(null), out = [];
    list.forEach(function (l) {
      var k = String(l.url).replace(/[#?].*$/, '').toLowerCase();
      if (!seen[k]) { seen[k] = 1; out.push(l); }
    });
    return out;
  }

  function renderLiteratureRows(lines, res) {
    var p = res.fields.paper || {};
    pushRow(lines, '论文标题', p.title);
    if (p.titleZh && p.titleEn && p.titleZh !== p.titleEn) pushRow(lines, '英文标题', p.titleEn);
    if (p.authors && p.authors.length) pushRow(lines, '作者', p.authors.join(', '));
    if (p.firstAuthor && p.firstAuthor.length) pushRow(lines, '第一作者', p.firstAuthor.join(', '));
    if (p.correspondingAuthor && p.correspondingAuthor.length) pushRow(lines, '通讯作者', p.correspondingAuthor.join(', '));
    pushRow(lines, '期刊', p.journal);
    var num = [];
    if (p.year) num.push(p.year + ' 年');
    if (p.volume) num.push('第 ' + p.volume + ' 卷');
    if (p.issue) num.push('第 ' + p.issue + ' 期');
    if (p.pages) num.push('页 ' + p.pages);
    if (p.articleNumber) num.push('文章号 ' + p.articleNumber);
    if (num.length) pushRow(lines, '卷期页', num.join('，'));
    pushRow(lines, 'DOI', p.doi);
    pushRow(lines, 'arXiv', p.arxiv);
    pushRow(lines, 'PMID', p.pmid);
    pushRow(lines, '影响因子', p.impactFactor);
    pushRow(lines, '分区', [p.jcr, p.cas].filter(Boolean).join(' / '));
    pushRow(lines, '被引', p.citations);
    pushRow(lines, '文献类型', p.paperType);
    pushRow(lines, '开放获取', p.openAccess ? '是' : '');
    if (p.keywordsZh && p.keywordsZh.length) pushRow(lines, '关键词', p.keywordsZh.join('、'));
    if (p.keywordsEn && p.keywordsEn.length) pushRow(lines, 'Keywords', p.keywordsEn.join(', '));
  }

  function renderRecruitRows(lines, res) {
    var f = res.fields;
    pushRow(lines, '招聘主体', fieldValue(res, 'org') + confidenceTag(f.org));
    if (f.org && f.org.aliases && f.org.aliases.length) pushRow(lines, '全称', f.org.aliases.join('、'));
    pushRow(lines, '招聘批次', fieldValue(res, 'batch'));
    pushRow(lines, '招聘类型', fieldValue(res, 'recruitType'));
    pushRow(lines, '投递截止', fieldValue(res, 'deadline') +
      (f.deadline && f.deadline.raw ? '（原文：' + f.deadline.raw + '）' : ''));
    pushRow(lines, '学历要求', fieldValue(res, 'education'));
    pushRow(lines, '工作地点', f.locations ? (f.locations.list.join('、') + (f.locations.nationwide ? '（含全国）' : '')) : '');
    pushRow(lines, '招聘岗位', fieldValue(res, 'positions'));
    pushRow(lines, '需求专业', fieldValue(res, 'majors'));
    pushRow(lines, '招聘人数', f.headcount ? String(f.headcount.value) : '');
    pushRow(lines, '联系方式', f.contacts ? [].concat(f.contacts.emails || [], f.contacts.phones || []).join(' / ') : '');
  }

  function renderGeneralRows(lines, res) {
    var f = res.fields;
    pushRow(lines, '疑似主体', fieldValue(res, 'org'));
    pushRow(lines, '主办/来源', f.organizer ? f.organizer.value : '');
    pushRow(lines, '事件类型', f.events ? f.events.list.join('、') : '');
    pushRow(lines, '联系方式', f.contacts ? [].concat(f.contacts.emails || [], f.contacts.phones || []).join(' / ') : '');
  }

  function renderLiteratureExtras(lines, p) {
    if (p.abstractZh) {
      lines.push('## 中文摘要');
      lines.push('> ' + p.abstractZh.replace(/\n+/g, '\n> '));
      lines.push('');
    }
    if (p.abstractEn) {
      lines.push('## Abstract');
      lines.push('> ' + p.abstractEn.replace(/\n+/g, '\n> '));
      lines.push('');
    }
    if (p.citations) {
      lines.push('## 引用格式');
      lines.push('');
      lines.push('**GB/T 7714**');
      lines.push('```');
      lines.push(p.citations.gbt7714 || '');
      lines.push('```');
      lines.push('**APA 7th**');
      lines.push('```');
      lines.push(p.citations.apa || '');
      lines.push('```');
      if (p.citations.bibtex) {
        lines.push('**BibTeX**');
        lines.push('```bibtex');
        lines.push(p.citations.bibtex);
        lines.push('```');
      }
      lines.push('');
    }
  }

  function kindLabel(kind) {
    return {
      official: '官网/官方域名',
      ats: '招聘系统',
      redirect: '跳转中间页',
      wechat: '微信站内',
      other: '其他',
      invalid: '无效',
      doi: 'DOI 解析页',
      preprint: '预印本',
      publisher: '出版社官网',
      database: '文献数据库',
      pdf: 'PDF 全文'
    }[kind] || kind;
  }

  /* ------------------------------ JSON ------------------------------ */

  function toJSON(res, pretty) {
    return JSON.stringify(res, null, pretty === false ? 0 : 2);
  }

  /* ------------------------------ CSV ------------------------------- */

  var CSV_COLUMNS = [
    ['type', function (r) { return r.detection ? r.detection.label : ''; }],
    ['title', function (r) { return r.meta.title; }],
    ['account', function (r) { return r.meta.account; }],
    ['publishTime', function (r) { return r.meta.publishTime; }],
    ['url', function (r) { return r.meta.url; }],
    // 招聘
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
    // 文献
    ['paperTitle', function (r) { return r.fields.paper ? r.fields.paper.title : ''; }],
    ['paperTitleEn', function (r) { return r.fields.paper ? r.fields.paper.titleEn : ''; }],
    ['authors', function (r) { return r.fields.paper && r.fields.paper.authors ? r.fields.paper.authors.join('; ') : ''; }],
    ['firstAuthor', function (r) { return r.fields.paper && r.fields.paper.firstAuthor ? r.fields.paper.firstAuthor.join('; ') : ''; }],
    ['correspondingAuthor', function (r) { return r.fields.paper && r.fields.paper.correspondingAuthor ? r.fields.paper.correspondingAuthor.join('; ') : ''; }],
    ['journal', function (r) { return r.fields.paper ? r.fields.paper.journal : ''; }],
    ['year', function (r) { return r.fields.paper && r.fields.paper.year ? String(r.fields.paper.year) : ''; }],
    ['volume', function (r) { return r.fields.paper ? r.fields.paper.volume : ''; }],
    ['issue', function (r) { return r.fields.paper ? r.fields.paper.issue : ''; }],
    ['pages', function (r) { return r.fields.paper ? r.fields.paper.pages : ''; }],
    ['doi', function (r) { return r.fields.paper ? r.fields.paper.doi : ''; }],
    ['arxiv', function (r) { return r.fields.paper ? r.fields.paper.arxiv : ''; }],
    ['pmid', function (r) { return r.fields.paper ? r.fields.paper.pmid : ''; }],
    ['impactFactor', function (r) { return r.fields.paper ? r.fields.paper.impactFactor : ''; }],
    ['quartile', function (r) {
      var p = r.fields.paper;
      return p ? [p.jcr, p.cas].filter(Boolean).join(' / ') : '';
    }],
    ['keywords', function (r) {
      var p = r.fields.paper;
      return p ? [].concat(p.keywordsZh || [], p.keywordsEn || []).join('; ') : '';
    }],
    // 链接
    ['primaryLink', function (r) { return r.links.best ? r.links.best.url : ''; }],
    ['allPrimaryLinks', function (r) { return (r.links.primary || []).map(function (l) { return l.url; }).join(' | '); }],
    ['readOriginal', function (r) { return r.links.readOriginal ? r.links.readOriginal.url : ''; }],
    ['citationGBT', function (r) { return r.fields.paper && r.fields.paper.citations ? r.fields.paper.citations.gbt7714 : ''; }],
    ['citationAPA', function (r) { return r.fields.paper && r.fields.paper.citations ? r.fields.paper.citations.apa : ''; }],
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
      var primary = r.links.primary || r.links.apply || [];
      var pool = mode === 'all'
        ? primary.concat(r.links.readOriginal ? [{ url: r.links.readOriginal.url }] : [])
        : primary;
      pool.forEach(function (l) { if (l && l.url && urls.indexOf(l.url) === -1) urls.push(l.url); });
    });
    return urls.join('\n');
  }

  /* --------------------------- 引用格式 ----------------------------- */

  /** 只复制引用格式，供文献笔记场景使用。 */
  function toCitation(res, style) {
    var p = res.fields && res.fields.paper;
    if (!p || !p.citations) return '';
    style = (style || 'gbt7714').toLowerCase();
    if (style === 'apa') return p.citations.apa || '';
    if (style === 'bibtex') return p.citations.bibtex || '';
    if (style === 'oneline') return p.citations.oneline || '';
    return p.citations.gbt7714 || '';
  }

  /** 复制论文题录（标题/作者/期刊/DOI 一行一条）。 */
  function toPaperCard(res) {
    var p = res.fields && res.fields.paper;
    if (!p) return '';
    var lines = [];
    if (p.title) lines.push('标题：' + p.title);
    if (p.titleEn && p.titleEn !== p.title) lines.push('英文标题：' + p.titleEn);
    if (p.authors && p.authors.length) lines.push('作者：' + p.authors.join(', '));
    if (p.correspondingAuthor && p.correspondingAuthor.length) lines.push('通讯作者：' + p.correspondingAuthor.join(', '));
    if (p.journal) lines.push('期刊：' + p.journal);
    var loc = [];
    if (p.year) loc.push(p.year);
    if (p.volume) loc.push('vol. ' + p.volume);
    if (p.issue) loc.push('no. ' + p.issue);
    if (p.pages) loc.push('pp. ' + p.pages);
    if (loc.length) lines.push('出处：' + loc.join(', '));
    if (p.doi) lines.push('DOI：' + p.doi);
    if (p.arxiv) lines.push('arXiv：' + p.arxiv);
    if (p.pmid) lines.push('PMID：' + p.pmid);
    if (p.impactFactor) lines.push('影响因子：' + p.impactFactor);
    if (p.jcr || p.cas) lines.push('分区：' + [p.jcr, p.cas].filter(Boolean).join(' / '));
    if (res.links.best) lines.push('原文链接：' + res.links.best.url);
    return lines.join('\n');
  }

  /* --------------------------- 一行速览 ----------------------------- */

  function toOneLiner(res) {
    var bits = [];
    var p = res.fields && res.fields.paper;
    if (isLiterature(res) && p) {
      if (p.title) bits.push(p.title);
      if (p.authors && p.authors.length) bits.push(p.authors.slice(0, 2).join(', '));
      if (p.journal) bits.push(p.journal);
      if (p.year) bits.push(String(p.year));
      if (p.doi) bits.push(p.doi);
    } else {
      if (res.fields.org) bits.push(res.fields.org.value);
      if (res.fields.batch) bits.push(res.fields.batch.value);
      if (res.fields.deadline) bits.push('截止' + res.fields.deadline.value);
    }
    if (res.links.best) bits.push(res.links.best.url);
    return bits.join(' | ');
  }

  return {
    toMarkdown: toMarkdown,
    toJSON: toJSON,
    toCSV: toCSV,
    toLinkList: toLinkList,
    toCitation: toCitation,
    toPaperCard: toPaperCard,
    toOneLiner: toOneLiner,
    fieldValue: fieldValue,
    kindLabel: kindLabel,
    profileOf: profileOf,
    isLiterature: isLiterature,
    isRecruit: isRecruit,
    CSV_COLUMNS: CSV_COLUMNS
  };
});
