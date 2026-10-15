// sw.js — オフライン動作用 Service Worker。本体ファイルは先読み、辞書・データは使ったものを保存
const VERSION = 'esv-v0.7';
const CORE = ['./', './index.html', './eval.html', './style.css', './app.js', './eval.js', './manifest.json', './icon.svg',
  './vendor/compromise.js', './src/pos.js', './src/chunker.js', './src/patterns.js', './src/analyzer.js', './src/render.js', './src/dict.js', './src/tree.js', './src/text.js', './data/passages_dev.json',
  './rules/patterns.json', './data/testset_dev.csv', './data/testset_eval.csv'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(CORE.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// ネットワーク優先、失敗したらキャッシュ（更新を取りこぼさず、オフラインでも動く）
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
