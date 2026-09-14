const CACHE_NAME = 'sst-staff-v8';
const PRECACHE_URLS = [
    'dashboard.html',
    'index.html',
    'track.html',
    'style.css',
    'manifest.json',
    'dashboard-fix.js',
    'checkout-fix.js',
    'track-realtime-fix.js',
    'security-patch.js?v=5'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .then(async (response) => {
                if (event.request.destination === 'document') {
                    const contentType = response.headers.get('content-type') || '';
                    if (contentType.includes('text/html')) {
                        const url = new URL(event.request.url);
                        const pathname = url.pathname.toLowerCase();
                        const html = await response.text();

                        let injected = html;
                        const scripts = [];

                        if (pathname.endsWith('/track.html')) {
                            scripts.push('<script src="track-realtime-fix.js?v=7"></script>');
                        } else if (pathname.endsWith('/index.html') || pathname.endsWith('/')) {
                            scripts.push('<script src="checkout-fix.js?v=5"></script>');
                        } else if (pathname.endsWith('/dashboard.html')) {
                            scripts.push('<script src="dashboard-fix.js?v=5"></script>');
                        }

                        if (scripts.length) {
                            injected = html.replace('</body>', `${scripts.join('')}</body>`);
                        }

                        const headers = new Headers(response.headers);
                        headers.set('content-type', 'text/html; charset=utf-8');
                        const patchedResponse = new Response(injected, {
                            status: response.status,
                            statusText: response.statusText,
                            headers
                        });

                        const clone = patchedResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                        return patchedResponse;
                    }
                }

                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});

// ============ WEB PUSH ============
self.addEventListener('push', (event) => {
    let payload = { title: 'Sky Sweet Treats', body: 'You have an order update.' };
    if (event.data) {
        try {
            payload = event.data.json();
        } catch (e) {
            payload = { title: 'Sky Sweet Treats', body: event.data.text() };
        }
    }

    const options = {
        body: payload.body || '',
        icon: 'images/logo.jpg',
        badge: 'images/logo.jpg',
        data: payload.data || {},
        vibrate: [100, 50, 100],
        tag: (payload.data && payload.data.order_number) || 'sst-order-update',
        renotify: true
    };

    event.waitUntil(self.registration.showNotification(payload.title || 'Sky Sweet Treats', options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || 'track.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes('track.html') && 'focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            if (clients.openWindow) return clients.openWindow(targetUrl);
        })
    );
});