const CACHE_NAME = 'alex-v5';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// Установка — кэшируем основные файлы
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// Активация — удаляем старые кэши
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Перехват запросов — сначала сеть, потом кэш
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Запросы к Supabase API и Metered — всегда из сети, не кэшируем
  if (url.hostname.includes('supabase.co') || url.hostname.includes('metered.live')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Если ответ хороший — сохраняем в кэш
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Нет сети — берём из кэша
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Если запрашивают страницу — отдаём главную из кэша
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});
