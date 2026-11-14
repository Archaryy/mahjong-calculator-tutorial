const { cache } = require("react");

// Service worker: keeps a copy of the app on the phone so it opens offline.
const CACHE = 'mcr-calc-v7';

const FILES = [
    './',
    'index.html',
    'rules.html',
    'js/fans-data.js',
    'js/rules.js',
    'css/styles.css',
    'js/engine.js',
    'js/app.js',
    'manifest.webmanifest',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/apple-touch-icon.png',
];

// 42 tile pictures
for (const suit of ['m', 'p', 's']) { // man pin sou
    for (let n = 1; n <= 9; n++) FILES.push('assets/tiles/' + n + suit + '.png');
}
for (let n = 1; n <= 7; n++) FILES.push('assets/tiles/z' + n + '.png'); // honors -> dragons and winds
for (let n = 1; n <= 8; n++) FILES.push('assets/tiles/f' + n + '.png'); // flowers

// install: download everything once
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting())
    );
});

// activate: delete copies from older versions
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
        .then(() => self.clients.claim())
    );
});

// every request: try the internet first (so updates show up), fall back to the saved copy offline
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        fetch(event.request)
        .then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
            return response;
        })
        .catch(() => caches.match(event.request).then((hit) => hit || caches.match('index.html')))
    );
});