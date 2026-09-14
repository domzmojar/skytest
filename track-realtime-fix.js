/*
 * Sky Sweet Treats customer tracking realtime fix
 *
 * Customer tracking is anonymous, so use a PUBLIC token-specific Broadcast
 * channel. The tracking token makes the topic difficult to guess, while the
 * order itself remains protected behind get_order_status().
 */
(function () {
    let liveChannel = null;
    let subscribedTopic = '';

    function getTrackingToken() {
        const params = new URLSearchParams(window.location.search);
        return (params.get('token') || localStorage.getItem('lastOrderTrackingToken') || '').trim();
    }

    function getOrderNumber() {
        const el = document.getElementById('status-order-number');
        return el ? el.textContent.trim() : '';
    }

    async function unsubscribeLive() {
        if (!liveChannel) return;
        try {
            await supabaseClient.removeChannel(liveChannel);
        } catch (error) {
            console.warn('Tracking realtime unsubscribe warning:', error);
        }
        liveChannel = null;
        subscribedTopic = '';
    }

    async function subscribeToOrderBroadcast(orderNumber) {
        const token = getTrackingToken();
        if (!token || !orderNumber) return;

        const topic = `track:${token}`;
        if (liveChannel && subscribedTopic === topic) return;

        await unsubscribeLive();

        // IMPORTANT: this customer page is anonymous. Do NOT use
        // config.private=true or realtime.setAuth(). The database trigger
        // sends this event as a public broadcast (private=false).
        liveChannel = supabaseClient
            .channel(topic, {
                config: {
                    private: false,
                    broadcast: {
                        self: false
                    }
                }
            })
            .on('broadcast', { event: 'order_status_updated' }, (message) => {
                const payload = message && message.payload ? message.payload : {};
                const payloadOrderNumber = payload.order_number;

                if (payloadOrderNumber && payloadOrderNumber !== orderNumber) return;

                console.log('Tracking realtime event received:', message);
                window.checkStatus(true);
            })
            .subscribe((status, error) => {
                console.log('Tracking realtime status:', status, error || '');

                if (status === 'SUBSCRIBED') {
                    subscribedTopic = topic;
                    console.log('Tracking realtime connected:', topic);
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    subscribedTopic = '';
                    console.error('Tracking realtime connection problem:', status, error || '');
                }
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
                await unsubscribeLive();
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

            await subscribeToOrderBroadcast(order.order_number);

            if (silent) {
                showToast('🔄 Order status updated!');
            }

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

    window.addEventListener('beforeunload', () => {
        if (liveChannel) {
            supabaseClient.removeChannel(liveChannel);
            liveChannel = null;
        }
    });
})();