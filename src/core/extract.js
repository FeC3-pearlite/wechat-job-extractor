/*!
 * 微信求职信息提取器 — 统一入口 (extract.js)
 *
 *   WJE.extract.fromDocument(document)   → 结构化结果（内容脚本）
 *   WJE.extract.fromHtml(htmlString)     → 结构化结果（批量抓取 / 离线）
 *   WJE.extract.pipeline(source, opts)   → 通用入口
 */
(function (root, factory) {
  var api = factory(
    (typeof module !== 'undefined' && module.exports)
      ? {
        parse: require('./parse.js'),
        fields: require('./fields.js'),
        format: require('./format.js'),
        rules: require('./rules.js')
      }
      : {
        parse: root && root.WJE && root.WJE.parse,
        fields: root && root.WJE && root.WJE.fields,
        format: root && root.WJE && root.WJE.format,
        rules: root && root.WJE && root.WJE.rules
      }
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.WJE = root.WJE || {}; root.WJE.extract = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';

  var VERSION = '1.0.0';

  function pipeline(source, options) {
    options = options || {};
    var raw = deps.parse.parseSource(source, options);
    var result = deps.fields.extractFields(raw, options);
    result.version = VERSION;
    result.raw = options.keepRaw ? raw : undefined;
    return result;
  }

  return {
    VERSION: VERSION,
    fromDocument: function (doc, options) { return pipeline(doc || (typeof document !== 'undefined' ? document : null), options); },
    fromHtml: function (html, options) {
      options = options || {};
      return pipeline(html, Object.assign({ useDom: false }, options));
    },
    pipeline: pipeline,
    format: deps.format,
    rules: deps.rules,
    parse: deps.parse,
    fields: deps.fields
  };
});
