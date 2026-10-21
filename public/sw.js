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
    if (!response.ok) return null;

    const manifest = await response.json();
    if (
      !manifest
      || manifest.version !== CACHE_VERSION
      || !Array.isArray(manifest.assets)
      || !manifest.assets.includes('/index.html')
      || !manifest.assets.includes('/master-admin.html')
    ) {
      return null;
    }

    const assets = manifest.assets
      .map(normalizeAssetUrl)
      .filter(Boolean);
    return assets.length > 0 ? assets : null;
  } catch {
    return null;
  }
};

const getPrecacheUrls = async () => {
  const urls = new Set(PRECACHE_URLS);
  const manifestUrls = await readOfflineAssetManifest();

  // Development service workers are opt-in and do not have a build manifest.
  // Production updates must have a matching manifest or preserve the old cache.
  if (!manifestUrls && CACHE_VERSION !== 'dev') {
    throw new Error('Offline asset manifest is missing or does not match this MotoFix build.');
  }

  manifestUrls?.forEach((url) => urls.add(url));
  return Array.from(urls);
};

const precacheOfflineAssets = async () => {
  const cache = await caches.open(APP_SHELL_CACHE);
  const urls = await getPrecacheUrls();
  await cache.addAll(urls);
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        await precacheOfflineAssets();
        // Let the previous worker finish serving its open app tabs before an
        // update activates and removes that version's cached lazy-loaded chunks.
      } catch (error) {
        // A partial new cache must never replace a previously working offline app.
        await caches.delete(APP_SHELL_CACHE);
        throw error;
      }
    })()
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
    const fallbackUrl = url.pathname === '/master-admin.html' ? '/master-admin.html' : '/index.html';
    event.respondWith(networkFirst(request, fallbackUrl));
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
