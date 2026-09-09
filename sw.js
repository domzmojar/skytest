const CACHE_NAME = 'sst-staff-v5';
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
                            scripts.push('<script src="track-realtime-fix.js?v=5"></script>');
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
