// Security patch: order status requires the private tracking token returned at checkout.
(() => {
    const originalCheckStatus = window.checkStatus;
    if (typeof originalCheckStatus !== 'function') return;

    window.checkStatus = async function (silent = false) {
        const params = new URLSearchParams(window.location.search);
        const input = document.getElementById('order-input');
        const raw = silent
            ? document.getElementById('status-order-number').textContent.trim().toUpperCase()
            : input.value.trim().toUpperCase();
        const token = params.get('token') || localStorage.getItem('lastOrderTrackingToken') || '';

        if (!raw) return showToast('⚠️ Please enter your order number');
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
                    document.getElementById('track-empty').innerHTML = '<p style="font-size:1.1rem;margin-bottom:8px;">❌ Order not found</p><p>Use the tracking link from your order confirmation.</p>';
                    showToast('❌ Order not found');
                }
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

            if (!silent) {
                subscribeToOrder(order.order_number);
            } else {
                showToast('🔄 Order status updated!');
            }
        } catch (err) {
            console.error(err);
            if (!silent) {
                document.getElementById('loading').style.display = 'none';
                document.getElementById('track-empty').style.display = 'block';
                showToast('❌ Could not check order status. Try again.');
            }
        }
    };
})();
