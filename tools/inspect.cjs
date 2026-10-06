#!/usr/bin/env node
/*!
 * 开发辅助：对一个 HTML 文件（或夹具名）跑完整提取，并打印结构化结果。
 *
 *   node tools/inspect.cjs tests/fixtures/literature-nature.html
 *   node tools/inspect.cjs literature-nature --json
 *   node tools/inspect.cjs tests/fixtures/citic-2027.html --profile literature
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WJE = require(path.join(ROOT, 'src/core/extract.js'));

const argv = process.argv.slice(2);
const target = argv.find((a) => !a.startsWith('--'));
const asJson = argv.includes('--json');
const pi = argv.indexOf('--profile');
const profile = pi !== -1 ? argv[pi + 1] : null;

if (!target) {
  console.error('用法: node tools/inspect.cjs <文件路径|夹具名> [--json] [--profile recruit|literature|general|hybrid]');
  process.exit(1);
}

let file = target;
if (!fs.existsSync(file)) {
  const guess = path.join(ROOT, 'tests/fixtures', target.endsWith('.html') ? target : target + '.html');
  if (fs.existsSync(guess)) file = guess;
}
if (!fs.existsSync(file)) { console.error('找不到文件: ' + target); process.exit(1); }

const html = fs.readFileSync(file, 'utf8');
const opts = { nowYear: new Date().getFullYear() };
if (profile) opts.forceProfile = profile;
const res = WJE.fromHtml(html, opts);

if (asJson) {
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}

const F = WJE.format;
const p = res.fields.paper;

console.log('═'.repeat(72));
console.log('文件      : ' + path.relative(ROOT, file));
console.log('标题      : ' + res.meta.title);
console.log('公众号    : ' + res.meta.account + '　发布于 ' + res.meta.publishTime);
console.log('识别类型  : ' + res.detection.label + '（置信度 ' + res.detection.confidence +
  '；招聘 ' + res.detection.scores.recruit + ' / 文献 ' + res.detection.scores.literature + '）');
res.detection.evidence.slice(0, 6).forEach((e) => console.log('            · ' + e));
console.log('文章形态  : ' + res.meta.articleKind + '（文字 ' + res.meta.textLength + ' 字 / 图片 ' + res.meta.imageCount + ' 张）');

if (p) {
  console.log('─'.repeat(72));
  console.log('【文献字段】');
  console.log('  标题(中) : ' + (p.titleZh || '—'));
  console.log('  标题(英) : ' + (p.titleEn || '—'));
  console.log('  作者     : ' + (p.authors.length ? p.authors.join(' / ') : '—'));
  console.log('  第一作者 : ' + (p.firstAuthor ? p.firstAuthor.join(' / ') : '—'));
  console.log('  通讯作者 : ' + (p.correspondingAuthor ? p.correspondingAuthor.join(' / ') : '—'));
  console.log('  期刊     : ' + (p.journal || '—') + '　年份 ' + (p.year || '—'));
  console.log('  卷期页   : ' + [p.volume, p.issue, p.pages].filter(Boolean).join(' / ') || '—');
  console.log('  DOI      : ' + (p.doi || '—') + '　arXiv ' + (p.arxiv || '—') + '　PMID ' + (p.pmid || '—'));
  console.log('  影响因子 : ' + (p.impactFactor || '—') + '　JCR ' + (p.jcr || '—') + '　中科院 ' + (p.cas || '—'));
  console.log('  类型     : ' + p.paperType + '　开放获取 ' + (p.openAccess ? '是' : '否'));
  console.log('  关键词   : ' + [].concat(p.keywordsZh || [], p.keywordsEn || []).join('、') || '—');
  console.log('  摘要(中) : ' + (p.abstractZh ? p.abstractZh.slice(0, 90) + '…' : '—'));
  console.log('  摘要(英) : ' + (p.abstractEn ? p.abstractEn.slice(0, 90) + '…' : '—'));
  console.log('  GB/T7714 : ' + (p.citations.gbt7714 || '—'));
  console.log('  APA      : ' + (p.citations.apa || '—'));
}

const f = res.fields;
if (f.org || f.batch || f.deadline) {
  console.log('─'.repeat(72));
  console.log('【招聘字段】');
  console.log('  主体     : ' + (f.org ? f.org.value + '（' + f.org.confidence + '）' : '—'));
  console.log('  批次/类型: ' + (f.batch ? f.batch.value : '—') + ' / ' + (f.recruitType ? f.recruitType.value : '—'));
  console.log('  截止     : ' + (f.deadline ? f.deadline.value + '（' + f.deadline.confidence + '）' : '—'));
  console.log('  学历     : ' + (f.education ? f.education.list.join('、') : '—'));
  console.log('  地点     : ' + (f.locations ? f.locations.list.slice(0, 10).join('、') : '—'));
  console.log('  岗位     : ' + (f.positions ? f.positions.list.join('、') : '—'));
  console.log('  专业     : ' + (f.majors ? f.majors.list.join('、') : '—'));
  console.log('  联系     : ' + (f.contacts ? [].concat(f.contacts.emails || [], f.contacts.phones || []).join(' ') : '—'));
}

console.log('─'.repeat(72));
console.log('【关键链接】（' + res.links.primary.length + ' 条）');
res.links.primary.slice(0, 6).forEach((l, i) => {
  console.log('  ' + (i + 1) + '. [' + F.kindLabel(l.kind) + '] ' + l.url);
  console.log('     评分 ' + l.score + '　' + (l.reasons || []).slice(0, 3).join('；'));
});
if (!res.links.primary.length) console.log('  （无）');
if (res.links.readOriginal) console.log('  阅读原文 → ' + res.links.readOriginal.url + '（' + res.links.readOriginal.from + '）');

console.log('─'.repeat(72));
console.log('【关键句】');
res.keySentences.slice(0, 5).forEach((s) => console.log('  · ' + s.slice(0, 110)));

if (res.warnings.length) {
  console.log('─'.repeat(72));
  console.log('【提示】');
  res.warnings.forEach((w) => console.log('  ⚠️ ' + w));
}
console.log('═'.repeat(72));
