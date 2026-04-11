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
  '/admin-login.html', 
  '/admin.html', 
  '/calendar.html', 
  '/chat.html', 
  '/components.css', 
  '/details.html', 
  '/inbox.html', 
  '/image-search.html', 
  
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(assets);
    })
  );
});

// Fetching Assets
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
