const CACHE_NAME = 'anime-explorer-v2';
const assets = [
  '/',
  '/index.html',
  '/login.html',
  '/signup.html',
  '/profile.html',
  '/watchlist.html',
  '/store.html',
  '/news.html',
  '/poll.html',
  '/main.css',
  '/main.js', 
  '/components.css',
  '/admin.html',
  '/calendar.html',
  '/chat.html',
  '/details.html',
  '/inbox.html',
  '/image-search.html',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// 1. Install & Cache (Files save karna)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching all assets...');
      return cache.addAll(assets);
    })
  );
  self.skipWaiting(); // Naye version ko turant activate karne ke liye
});

// 2. Activate (Purana cache delete karna)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});

// 3. Smart Fetch Strategy (Offline Support)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Agar cache mein hai toh wahi do, nahi toh network se lo
      return cachedResponse || fetch(event.request).catch(() => {
        // Agar net nahi hai aur file cache mein bhi nahi hai (Error fallback)
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
