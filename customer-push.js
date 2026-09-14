// Sky Sweet Treats — customer push notification opt-in
// Used by both track.html and walkin.html. Depends on globals already
// defined by those pages: supabaseClient, showToast.
(function () {
    const VAPID_PUBLIC_KEY = 'BL7KtDy1YsjQdQss089xBydx3KbdYDXWiApgcCOd8UoOyqHhvcgNnYykbEwA2LojMnyDykLDtHLgMZAYz0EvUnY';

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = atob(base64);
        return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
    }

    function getTokenFromPage() {
        const params = new URLSearchParams(window.location.search);
        return (params.get('token') || localStorage.getItem('lastOrderTrackingToken') || '').trim();
    }

    window.enableCustomerPush = async function (trackingTokenOverride) {
        const btn = document.getElementById('notify-btn');
        const trackingToken = trackingTokenOverride || getTokenFromPage();

        if (!trackingToken) {
            showToast('🔐 Place or look up an order first.');
            return;
        }
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            showToast("⚠️ Notifications aren't supported on this browser.");
            return;
        }

        if (btn) { btn.disabled = true; btn.textContent = '⏳ Enabling...'; }

        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                showToast('🔕 Notification permission was not granted.');
                if (btn) { btn.disabled = false; btn.textContent = '🔔 Notify me on updates'; }
                return;
            }

            const registration = await navigator.serviceWorker.register('push-sw.js');
            await navigator.serviceWorker.ready;

            let subscription = await registration.pushManager.getSubscription();
            if (!subscription) {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                });
            }

            const { endpoint, keys } = subscription.toJSON();
            const { error } = await supabaseClient
                .from('push_subscriptions')
                .upsert(
                    {
                        subscriber_type: 'customer',
                        tracking_token: trackingToken,
                        endpoint,
                        p256dh: keys.p256dh,
                        auth: keys.auth
                    },
                    { onConflict: 'endpoint' }
                );
            if (error) throw error;

            showToast("🔔 You'll be notified when your order status changes!");
            if (btn) { btn.textContent = '🔔 Notifications on'; }
        } catch (err) {
            console.error('Push subscribe error:', err);
            showToast('❌ Could not enable notifications.');
            if (btn) { btn.disabled = false; btn.textContent = '🔔 Notify me on updates'; }
        }
    };
})();
