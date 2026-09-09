/*
 * Sky Sweet Treats customer tracking realtime fix
 *
 * The orders table is intentionally not publicly readable, so Postgres Changes
 * cannot be used by the anonymous tracking page. This switches the live part
 * to Supabase Realtime Broadcast, using the random tracking token as the topic.
 */
(function () {
    let liveChannel = null;

    function getTrackingToken() {
        const params = new URLSearchParams(window.location.search);
        return (params.get('token') || '').trim();
    }

    function getOrderNumber() {
        return document.getElementById('status-order-number').textContent.trim();
    }

    function unsubscribeLive() {
        if (liveChannel) {
            supabaseClient.removeChannel(liveChannel);
            liveChannel = null;
        }
    }

    function subscribeToOrderBroadcast(orderNumber) {
        unsubscribeLive();

        const token = getTrackingToken();
        if (!token || !orderNumber) return;

        const topic = `track:${token}`;
        liveChannel = supabaseClient
            .channel(topic)
            .on('broadcast', { event: 'order_status_updated' }, (payload) => {
                const payloadOrderNumber = payload?.payload?.order_number;
                if (payloadOrderNumber && payloadOrderNumber !== orderNumber) return;
                checkStatus(true);
            })
            .subscribe((status, error) => {
                console.log('Tracking realtime status:', status, error || '');
            });
    }

    window.checkStatus = async function (silent = false) {
        const params = new URLSearchParams(window.location.search);
        const raw = silent
            ? getOrderNumber()
            : document.getElementById('order-input').value.trim().toUpperCase();
        const token = getTrackingToken();

        if (!raw) {
            showToast('⚠️ Please enter your order number');
            return;
        }

        if (!token) {
            if (!silent) showToast('🔐 Please use the tracking link from your order confirmation.');
            return;
        }

        if (!silent) {
            document.getElementById('status-card').classList.remove('show');
            document.getElementById('track-empty').style.display = 'none';
            document.getElementById('loading').style.display = 'block';
        }

        try {
            const { data, error } = await supabaseClient.rpc('get_order_status', {
                p_order_number: raw,
                p_tracking_token: token
            });

            if (!silent) document.getElementById('loading').style.display = 'none';
            if (error) throw error;

            if (!data || data.length === 0) {
                if (!silent) {
                    document.getElementById('track-empty').style.display = 'block';
                    document.getElementById('track-empty').innerHTML =
                        '<p style="font-size:1.1rem;margin-bottom:8px;">❌ Order not found</p>' +
                        '<p>Use the tracking link from your order confirmation.</p>';
                    showToast('❌ Order not found');
                }
                unsubscribeLive();
                return;
            }

            const order = data[0];
            document.getElementById('status-order-number').textContent = order.order_number;
            document.getElementById('status-total').textContent = `Total: ₱${parseFloat(order.total).toFixed(2)}`;
            document.getElementById('status-payment').innerHTML = paymentPill(order.payment_status);
            document.getElementById('status-created').textContent = formatDate(order.created_at);
            document.getElementById('status-updated').textContent = formatDate(order.updated_at);
            renderSteps(order.status);
            document.getElementById('status-note-box').style.display = 'none';
            document.getElementById('status-card').classList.add('show');

            subscribeToOrderBroadcast(order.order_number);

            if (silent) showToast('🔄 Order status updated!');

            // Keep the URL in sync so a refresh continues to work.
            if (!params.get('token')) {
                const url = new URL(window.location.href);
                url.searchParams.set('order', order.order_number);
                url.searchParams.set('token', token);
                history.replaceState({}, '', url);
            }
        } catch (err) {
            console.error('Tracking error:', err);
            if (!silent) {
                document.getElementById('loading').style.display = 'none';
                document.getElementById('track-empty').style.display = 'block';
                showToast('❌ Could not check order status. Try again.');
            }
        }
    };

    window.addEventListener('beforeunload', unsubscribeLive);

    window.addEventListener('DOMContentLoaded', () => {
        const params = new URLSearchParams(window.location.search);
        const orderParam = params.get('order');
        const tokenParam = params.get('token');

        if (orderParam && tokenParam) {
            document.getElementById('order-input').value = orderParam;
            checkStatus();
        }
    });
})();
