self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
    body: data.body || 'Você tem um lembrete de manutenção.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: data.url || '/' },
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
