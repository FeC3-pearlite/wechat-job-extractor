/*!
 * 微信求职信息提取器 — 后台 Service Worker (background.js)
 * 负责：右键菜单、快捷键、首次安装打开引导页。
 */

const MENU_ID = 'wje-extract-page';

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: '提取本页招聘关键信息',
      contexts: ['page'],
      documentUrlPatterns: ['https://mp.weixin.qq.com/s*']
    });
    chrome.contextMenus.create({
      id: 'wje-open-batch',
      title: '批量提取公众号文章链接…',
      contexts: ['page', 'action']
    });
  });

  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html?welcome=1') });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'wje-open-batch') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/batch/batch.html') });
    return;
  }
  if (info.menuItemId !== MENU_ID || !tab || tab.id == null) return;
  chrome.tabs.sendMessage(tab.id, { type: 'WJE_SHOW_PANEL' }, () => void chrome.runtime.lastError);
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-panel') return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || tab.id == null) return;
    chrome.tabs.sendMessage(tab.id, { type: 'WJE_TOGGLE_PANEL' }, () => void chrome.runtime.lastError);
  });
});
