const isDevServiceWorkerEnabled = () => (
  import.meta.env.VITE_ENABLE_DEV_SERVICE_WORKER === 'true'
);

const canUseServiceWorker = () => (
  typeof window !== 'undefined'
  && typeof navigator !== 'undefined'
  && 'serviceWorker' in navigator
);

const shouldRegisterServiceWorker = () => (
  canUseServiceWorker()
  && (!import.meta.env.DEV || isDevServiceWorkerEnabled())
);

const cleanupDevelopmentServiceWorker = () => {
  if (!canUseServiceWorker() || !import.meta.env.DEV || isDevServiceWorkerEnabled()) return;

  navigator.serviceWorker.getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .catch((error) => {
      console.warn('Falha ao remover service worker de desenvolvimento:', error);
    });

  if ('caches' in window) {
    window.caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith('motofix-'))
          .map((cacheName) => window.caches.delete(cacheName))
      ))
      .catch((error) => {
        console.warn('Falha ao limpar cache offline de desenvolvimento:', error);
      });
  }
};

const precacheOfflineAssets = (registration: ServiceWorkerRegistration) => {
  const postPrecacheMessage = (activeRegistration: ServiceWorkerRegistration) => {
    activeRegistration.active?.postMessage({ type: 'MOTOFIX_PRECACHE_ASSETS' });
  };

  if (registration.active) {
    postPrecacheMessage(registration);
    return;
  }

  navigator.serviceWorker.ready
    .then(postPrecacheMessage)
    .catch((error) => {
      console.warn('Falha ao acionar cache offline do service worker:', error);
    });
};

export const registerMotoFixServiceWorker = () => {
  if (!shouldRegisterServiceWorker()) {
    cleanupDevelopmentServiceWorker();
    return;
  }

  const register = () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('Service worker registrado em:', registration.scope);
        precacheOfflineAssets(registration);
      })
      .catch((error) => {
        console.warn('Falha ao registrar service worker:', error);
      });
  };

  if (document.readyState !== 'loading') {
    register();
    return;
  }

  document.addEventListener('DOMContentLoaded', register, { once: true });
};

export const getMotoFixServiceWorkerRegistration = async () => {
  if (!canUseServiceWorker()) return null;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) return registration;
    if (!shouldRegisterServiceWorker()) return null;
    return await navigator.serviceWorker.ready;
  } catch (error) {
    console.warn('Falha ao obter service worker:', error);
    return null;
  }
};
