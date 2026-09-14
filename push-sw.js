// Sky Sweet Treats — push notification service worker (customer site)
// Registered by track.html and walkin.html. Only handles push display/click;
// it does not cache anything, so it won't fight with any other service worker.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { title: 'Sky Sweet Treats', body: event.data ? event.data.text() : '' };
    }

    const title = data.title || 'Sky Sweet Treats';
    const options = {
        body: data.body || '',
        icon: 'images/logo.jpg',
        badge: 'images/logo.jpg',
        data: data.data || {},
        tag: (data.data && data.data.order_number) || undefined,
        renotify: true
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || 'track.html';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (const client of windowClients) {
                if (client.url.includes(targetUrl.split('?')[0]) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
        })
    );
});
