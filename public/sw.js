const APP_VERSION = '__MOTOFIX_BUILD_VERSION__';
const CACHE_VERSION = APP_VERSION.includes('MOTOFIX_BUILD_VERSION') ? 'dev' : APP_VERSION;
const APP_SHELL_CACHE = `motofix-app-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `motofix-runtime-${CACHE_VERSION}`;
const OFFLINE_ASSET_MANIFEST_URL = `/offline-assets.json?v=${CACHE_VERSION}`;
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/motofix-logo.svg',
  '/motofix-icon.svg',
];

const normalizeAssetUrl = (assetUrl) => {
  try {
    const url = new URL(assetUrl, self.location.origin);
    if (url.origin !== self.location.origin) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
};

const readOfflineAssetManifest = async () => {
  try {
    const response = await fetch(OFFLINE_ASSET_MANIFEST_URL, { cache: 'no-store' });
    if (!response.ok) return [];

    const manifest = await response.json();
    if (!Array.isArray(manifest.assets)) return [];

    return manifest.assets
      .map(normalizeAssetUrl)
      .filter(Boolean);
  } catch {
    return [];
  }
};

const getPrecacheUrls = async () => {
  const urls = new Set(PRECACHE_URLS);
  const manifestUrls = await readOfflineAssetManifest();
  manifestUrls.forEach((url) => urls.add(url));
  return Array.from(urls);
};

const precacheOfflineAssets = async () => {
  const cache = await caches.open(APP_SHELL_CACHE);
  const urls = await getPrecacheUrls();
  await Promise.all(urls.map((url) => cache.add(url).catch(() => null)));
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    precacheOfflineAssets()
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith('motofix-'))
          .filter((cacheName) => ![APP_SHELL_CACHE, RUNTIME_CACHE].includes(cacheName))
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

const cacheResponse = async (cacheName, request, response) => {
  if (!response || response.status >= 400 || response.type === 'opaque') {
    return response;
  }

  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  return response;
};

const networkFirst = async (request, fallbackUrl) => {
  try {
    const response = await fetch(request);
    return cacheResponse(RUNTIME_CACHE, request, response);
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }

    throw new Error('Offline and no cached response available.');
  }
};

const cacheFirst = async (request) => {
  const cached = await caches.match(request);
  if (cached) {
    fetch(request)
      .then((response) => cacheResponse(RUNTIME_CACHE, request, response))
      .catch(() => null);
    return cached;
  }

  const response = await fetch(request);
  return cacheResponse(RUNTIME_CACHE, request, response);
};

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isViteDevelopmentRequest = (
    url.pathname.startsWith('/src/')
    || url.pathname.startsWith('/@vite/')
    || url.pathname.startsWith('/@id/')
    || url.pathname.startsWith('/@fs/')
    || url.pathname.startsWith('/node_modules/.vite/')
    || url.pathname === '/@react-refresh'
    || url.pathname === '/__vite_ping'
  );

  // Nunca misture modulos transformados de execucoes diferentes do Vite.
  if (isViteDevelopmentRequest) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/index.html'));
    return;
  }

  const isStaticAsset = ['script', 'style', 'image', 'font', 'manifest'].includes(request.destination)
    || url.pathname.startsWith('/assets/');

  if (isStaticAsset) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'MOTOFIX_PRECACHE_ASSETS') return;
  event.waitUntil(precacheOfflineAssets());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      const openWindow = clientList.find((client) => client.url === url && 'focus' in client);
      if (openWindow) {
        return openWindow.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const title = data.title || 'MotoFix';
  const options = {
    body: data.body || 'Voce tem um lembrete de manutencao.',
    icon: '/motofix-icon.svg',
    badge: '/motofix-icon.svg',
    data: { url: data.url || '/' },
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
