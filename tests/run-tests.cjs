/*!
 * 微信求职信息提取器 — 单元测试 / 夹具回归测试
 * 运行： node tests/run-tests.cjs
 * 说明：不依赖任何第三方库，直接 require src/core 下的 UMD 模块。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const rules = require('../src/core/rules.js');
const parse = require('../src/core/parse.js');
const fields = require('../src/core/fields.js');
const format = require('../src/core/format.js');
const WJE = require('../src/core/extract.js');

const FIXTURES = path.join(__dirname, 'fixtures');
const NOW_YEAR = 2026;

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  \u2713 ' + name);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log('  \u2717 ' + name + '\n      ' + String(err && err.message || err).split('\n').join('\n      '));
  }
}

function group(title) {
  console.log('\n' + title);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || 'not equal') + '\n      expected: ' + JSON.stringify(expected) + '\n      actual:   ' + JSON.stringify(actual));
  }
}

function includes(haystack, needle, msg) {
  const ok = Array.isArray(haystack) ? haystack.some((h) => String(h).indexOf(needle) !== -1) : String(haystack).indexOf(needle) !== -1;
  if (!ok) throw new Error((msg || 'missing') + ': ' + JSON.stringify(needle) + '\n      in: ' + JSON.stringify(haystack).slice(0, 400));
}

function loadFixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

function analyze(name, opts) {
  return WJE.fromHtml(loadFixture(name), Object.assign({ nowYear: NOW_YEAR }, opts || {}));
}

/* ================================================================== *
 * 1. 规则层
 * ================================================================== */

group('1. 规则层 rules.js');

test('normalize：全角转半角、压缩空白', () => {
  eq(rules.normalize('ａｂｃ　１２３  x'), 'abc 123 x');
});

test('extractBatch：识别“2027届”与“2027年校园招聘”', () => {
  eq(rules.extractBatch('华夏银行2027届校园招聘').year, 2027);
  eq(rules.extractBatch('中信银行2027年校园招聘公告').year, 2027);
  eq(rules.extractBatch('普通文章没有批次'), null);
});

test('extractRecruitType：区分秋招 / 校园招聘 / 实习', () => {
  eq(rules.extractRecruitType('2027届秋季校园招聘正式启动').value, '秋季校园招聘');
  eq(rules.extractRecruitType('某某公司校园招聘').value, '校园招聘');
  eq(rules.extractRecruitType('暑期实习生招聘').value, '暑期实习');
});

test('extractDeadline：完整日期', () => {
  const d = rules.extractDeadline('简历接收截止时间暂定2026年10月9日；', 2026, NOW_YEAR);
  eq(d.value, '2026-10-09');
  eq(d.yearAssumed, false);
});

test('extractDeadline：仅“X月X日”时用发布时间年份补全', () => {
  const d = rules.extractDeadline('五、网申通道（简历投递截止时间：10月25日）', 2026, NOW_YEAR);
  eq(d.value, '2026-10-25');
  eq(d.yearAssumed, true);
});

test('extractDeadline：无投递语义的日期不应误判', () => {
  eq(rules.extractDeadline('公司成立于1987年4月，2007年4月上市。', 2026, NOW_YEAR), null);
});

test('extractEducation：本科及以上', () => {
  const e = rules.extractEducation('具有国家认可的本科及以上学历');
  includes(e.list, '本科');
  eq(e.minRequirement, '本科');
});

test('extractLocations：抓到工作地点段落', () => {
  const loc = rules.extractLocations('工作地点：北京、上海、广州、深圳。');
  includes(loc.list, '北京');
  includes(loc.list, '深圳');
  eq(loc.fromDedicatedSection, true);
});

test('extractContacts：邮箱与电话', () => {
  const c = rules.extractContacts('咨询邮箱：job@citicbank.com，电话：010-66638888。');
  includes(c.emails, 'job@citicbank.com');
  includes(c.phones, '010-66638888');
});

test('unwrapUrl：解微信跳转中间页（含二次编码）', () => {
  eq(
    rules.unwrapUrl('https://mp.weixin.qq.com/mp/redirect?url=https%3A%2F%2Fjob.citicbank.com'),
    'https://job.citicbank.com'
  );
  eq(
    rules.unwrapUrl('https://career.gdufs.edu.cn/link?target=https://wecruit.hotjob.cn/SU645/pb/school.html'),
    'https://wecruit.hotjob.cn/SU645/pb/school.html'
  );
});

test('scoreLink：招聘官网得分高，微信站内文章得分低', () => {
  const good = rules.scoreLink('https://job.citicbank.com', '投递简历', '');
  assert(good.score >= 60, '官网应高分，实际 ' + good.score);
  const bad = rules.scoreLink('https://mp.weixin.qq.com/s?__biz=abc&mid=1', '阅读', '');
  assert(bad.score < 0, '微信文章链接应低分，实际 ' + bad.score);
});

group('2. 机构名抽取');

test('标题模板直取：中信银行（含“｜”分隔）', () => {
  const r = rules.extractOrgFromTitle('奔赴“信”征程｜中信银行2027年校园招聘正式启动');
  eq(r && r.name, '中信银行');
});

test('标题模板直取：华夏银行 / 中国光大银行（去尾噪）', () => {
  eq(rules.extractOrgFromTitle('华夏银行2027届校园招聘正式启动').name, '华夏银行');
  eq(rules.extractOrgFromTitle('2027中国光大银行秋季校园招聘公告').name, '中国光大银行');
  eq(rules.extractOrgFromTitle('中国光大银行2027届秋季校园招聘正式启动！').name, '中国光大银行');
});

test('候选枚举：不吞掉前文（“应聘者登录中信银行” → 中信银行）', () => {
  const names = rules.findOrgCandidates('应聘者登录中信银行招聘官网并注册用户').map((c) => c.name);
  includes(names, '中信银行');
  assert(names.every((n) => n.indexOf('应聘者') === -1), '不应出现带句子残渣的候选：' + names.join(','));
});

test('候选枚举：丢掉“征程中信银行”这类前缀残渣', () => {
  const names = rules.findOrgCandidates('奔赴“信”征程｜中信银行2027年校园招聘').map((c) => c.name);
  includes(names, '中信银行');
  assert(names.every((n) => n.indexOf('征程') === -1), '不应出现残渣候选：' + names.join(','));
});

test('候选枚举：保留合法限定前缀（中国光大银行）', () => {
  const names = rules.findOrgCandidates('中国光大银行成立于1992年8月').map((c) => c.name);
  includes(names, '中国光大银行');
});

/* ================================================================== *
 * 3. 夹具回归
 * ================================================================== */

group('3. 夹具回归：中信银行（文字型推文 + 跳转外链）');

const citic = analyze('citic-2027.html');

test('标题 / 公众号 / 发布时间', () => {
  includes(citic.meta.title, '中信银行2027年校园招聘');
  eq(citic.meta.account, '中信银行招聘');
  includes(citic.meta.publishTime, '2026-08-31');
});

test('招聘主体 = 中信银行，高置信度', () => {
  eq(citic.fields.org.value, '中信银行');
  eq(citic.fields.org.confidence, 'high');
});

test('批次 / 类型 / 截止日期', () => {
  eq(citic.fields.batch.value, '2027届');
  eq(citic.fields.recruitType.value, '校园招聘');
  eq(citic.fields.deadline.value, '2026-10-09');
});

test('投递入口：解出重定向后的中信银行招聘官网', () => {
  assert(citic.links.best, '应识别出投递入口');
  eq(citic.links.best.host, 'job.citicbank.com');
  assert(citic.links.best.url.indexOf('https://job.citicbank.com') === 0, '实际 ' + citic.links.best.url);
});

test('阅读原文 = https://job.citicbank.com/', () => {
  assert(citic.links.readOriginal, '应有阅读原文');
  eq(citic.links.readOriginal.url, 'https://job.citicbank.com/');
  eq(citic.links.readOriginal.from, 'msg_source_url');
});

test('学历 / 专业 / 岗位 / 联系方式', () => {
  includes(citic.fields.education.list, '本科');
  includes(citic.fields.majors.list, '经济学类');
  includes(citic.fields.majors.list, '工学类');
  includes(citic.fields.positions.list, '管培生');
  includes(citic.fields.positions.list, '客户经理');
  includes(citic.fields.contacts.emails, 'job@citicbank.com');
});

test('文章类型判定为文字型', () => {
  eq(citic.meta.articleKind, 'text');
});

group('4. 夹具回归：光大银行（图片型推文 + 阅读原文投递）');

const cebImg = analyze('cebbank-2027-image.html');

test('判定为图片型推文并给出告警', () => {
  eq(cebImg.meta.articleKind, 'image');
  assert(cebImg.warnings.some((w) => w.indexOf('图片') !== -1), '应有图片型告警');
});

test('阅读原文解出光大银行招贤馆公告页', () => {
  eq(
    cebImg.links.readOriginal.url,
    'https://eoap.cebbank.com/uiap/wt/CEB/zpzhm/dynamic/detail?columnId=102302'
  );
});

test('投递入口落在 eoap.cebbank.com', () => {
  assert(cebImg.links.best, '应识别出投递入口');
  eq(cebImg.links.best.host, 'eoap.cebbank.com');
});

group('5. 夹具回归：华夏银行（文字型推文 + 招聘系统链接）');

const hxb = analyze('hxb-2027.html');

test('主体 / 批次 / 类型', () => {
  eq(hxb.fields.org.value, '华夏银行');
  eq(hxb.fields.batch.value, '2027届');
  eq(hxb.fields.recruitType.value, '校园招聘');
});

test('截止日期用发布时间年份补全（10月25日 → 2026-10-25）', () => {
  eq(hxb.fields.deadline.value, '2026-10-25');
  eq(hxb.fields.deadline.confidence, 'medium');
});

test('投递入口 = 北森招聘系统链接', () => {
  eq(hxb.links.best.kind, 'ats');
  includes(hxb.links.best.url, 'wecruit.hotjob.cn');
});

test('岗位与专业', () => {
  includes(hxb.fields.positions.list, '管培生');
  includes(hxb.fields.positions.list, '经办岗');
  includes(hxb.fields.majors.list, '信息科技');
  includes(hxb.fields.majors.list, '经济金融');
  includes(hxb.fields.majors.list, '法律');
});

group('6. 夹具回归：光大银行（文字型公告，多字段齐全）');

const cebTxt = analyze('cebbank-2027-text.html');

test('主体 = 中国光大银行', () => {
  eq(cebTxt.fields.org.value, '中国光大银行');
});

test('截止日期 2026-11-08', () => {
  eq(cebTxt.fields.deadline.value, '2026-11-08');
});

test('投递入口与阅读原文都指向招贤馆', () => {
  includes(cebTxt.links.best.url, 'eoap.cebbank.com/uiap/wt/CEB/zpzhm');
  includes(cebTxt.links.readOriginal.url, 'eoap.cebbank.com');
});

test('工作地点 / 联系方式', () => {
  includes(cebTxt.fields.locations.list, '北京');
  includes(cebTxt.fields.locations.list, '乌鲁木齐');
  includes(cebTxt.fields.contacts.emails, 'zhaopin@cebbank.com');
});

group('7. 输出格式化 format.js');

test('Markdown 含表格、投递入口与免责声明', () => {
  const md = format.toMarkdown(citic);
  includes(md, '| 招聘主体 | 中信银行 |');
  includes(md, '## 投递入口');
  includes(md, 'https://job.citicbank.com');
  includes(md, '以官方原文为准');
});

test('JSON 可往返解析', () => {
  const j = JSON.parse(format.toJSON(citic));
  eq(j.fields.org.value, '中信银行');
});

test('CSV 表头与行数正确', () => {
  const csv = format.toCSV([citic, hxb]);
  const lines = csv.split('\r\n');
  eq(lines.length, 3);
  includes(lines[0], 'applyLink');
  includes(lines[1], '中信银行');
  includes(lines[2], '华夏银行');
});

test('纯链接输出只含投递链接', () => {
  const links = format.toLinkList(hxb).split('\n').filter(Boolean);
  assert(links.length >= 1, '应有链接');
  assert(links.every((u) => /^https?:\/\//.test(u)), '应都是 URL');
});

group('8. 健壮性');

test('空输入不抛异常', () => {
  const r = WJE.fromHtml('');
  eq(r.meta.title, '');
  assert(Array.isArray(r.warnings));
});

test('非微信 HTML 不崩溃且能抽到通用信息', () => {
  const r = WJE.fromHtml('<html><head><title>某某集团有限公司2027届校园招聘公告</title></head><body><div id="js_content"><p>投递截止时间：2026年11月30日</p><p>网申地址：https://job.example.com/apply</p></div></body></html>', { nowYear: NOW_YEAR });
  eq(r.fields.deadline.value, '2026-11-30');
  assert(r.links.best && r.links.best.host === 'job.example.com', '应识别网申地址，实际 ' + JSON.stringify(r.links.best && r.links.best.url));
});

test('恶意/畸形 href 不产生无效链接', () => {
  const r = WJE.fromHtml('<div id="js_content"><a href="javascript:void(0)">点击</a><a href="#">x</a><p>正文足够长足够长足够长足够长足够长足够长足够长足够长</p></div>', { nowYear: NOW_YEAR });
  assert(r.links.all.every((l) => /^https?:\/\//.test(l.url)), '所有链接都应是 http(s)');
});

test('HTML 实体与零宽字符被正确解码', () => {
  const t = parse.htmlToText('<p>中信银行&amp;光大银行&#x3001;招聘&nbsp;公告\u200b</p>');
  includes(t, '中信银行&光大银行、招聘 公告');
});

/* ================================================================== */

console.log('\n' + '─'.repeat(60));
console.log('通过 ' + passed + ' / ' + (passed + failed) + '，失败 ' + failed);
if (failed) {
  console.log('\n失败详情：');
  failures.forEach((f) => console.log('  · ' + f.name + '\n    ' + String(f.err.message).split('\n').join('\n    ')));
  process.exit(1);
}
console.log('全部通过 ✅');
