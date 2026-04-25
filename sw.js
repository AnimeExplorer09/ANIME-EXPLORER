// Service Worker for PWA support
// Empty service worker - can be expanded with caching strategies

self.addEventListener('install', (event) => {
    console.log('Service Worker installed');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker activated');
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Fallback for network requests
    if (event.request.method !== 'GET') {
        return;
    }
});