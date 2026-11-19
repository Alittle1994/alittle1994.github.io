/* 金田三中安全教育材料收集 —— 静态资源缓存
   原则：只缓存页面外壳（HTML / 图标 / 本地 SDK），
   云服务接口 /.cloud/ 一律走网络，绝不缓存提交数据。 */
(function () {
  'use strict';
  var CACHE = 'jtsz-edu-shell-v1';
  var CORE = [
    './', './index.html', './manifest.json',
    './icon-180.png', './icon-192.png', './icon-512.png',
    './vendor/workbuddy-cloud-sdk.js', './vendor/docx.umd.js'
  ];
  var lastQuery = '';

  self.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'sharecode') lastQuery = e.data.q || '';
  });

  self.addEventListener('install', function (e) {
    e.waitUntil(
      caches.open(CACHE)
        .then(function (c) { return c.addAll(CORE); })
        .catch(function () {})
        .then(function () { return self.skipWaiting(); })
    );
  });

  self.addEventListener('activate', function (e) {
    e.waitUntil(
      caches.keys()
        .then(function (keys) {
          return Promise.all(keys.filter(function (k) { return k !== CACHE; })
            .map(function (k) { return caches.delete(k); }));
        })
        .then(function () { return self.clients.claim(); })
    );
  });

  self.addEventListener('fetch', function (e) {
    var req = e.request;
    if (req.method !== 'GET') return;
    var url;
    try { url = new URL(req.url); } catch (err) { return; }
    if (url.origin !== self.location.origin) return;

    // 云数据 / 接口：永远实时请求，不缓存、不拦截
    if (url.pathname.indexOf('/.cloud/') >= 0 ||
        url.pathname.indexOf('/api/') >= 0 ||
        url.pathname.indexOf('/v2/as/') >= 0) return;
    if (url.pathname.indexOf('/sw.js') >= 0) return;

    // 清单：按当前分享链接动态补 start_url，保证从桌面图标进入仍带 sharecode
    if (/\/(manifest\.json)$/.test(url.pathname)) {
      e.respondWith(
        fetch(req).then(function (r) { return r.json(); }).then(function (m) {
          if (lastQuery && m) m.start_url = './index.html' + lastQuery;
          return new Response(JSON.stringify(m), {
            headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' }
          });
        }).catch(function () {
          return caches.match(req);
        })
      );
      return;
    }

    // 页面导航：网络优先，断网时回退到已缓存的页面外壳
    if (req.mode === 'navigate') {
      e.respondWith(
        fetch(req).then(function (r) {
          if (r && r.ok) {
            var copy = r.clone();
            caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
          }
          return r;
        }).catch(function () {
          return caches.match('./index.html').then(function (r) { return r || Response.error(); });
        })
      );
      return;
    }

    // 静态资源：缓存优先，后台静默更新
    e.respondWith(
      caches.match(req).then(function (cached) {
        var net = fetch(req).then(function (r) {
          if (r && r.ok) {
            var copy = r.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
          return r;
        }).catch(function () { return cached; });
        return cached || net;
      })
    );
  });
})();
