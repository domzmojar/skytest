// Security patch: keeps the existing storefront UI but moves trust to the database.
(() => {
    function makeTrackingToken() {
        if (window.crypto?.randomUUID) return window.crypto.randomUUID();
        const bytes = new Uint8Array(24);
        window.crypto.getRandomValues(bytes);
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }

    window.submitOrder = async function () {
        const data = collectCheckoutData();
        if (!data) return;

        const submitBtn = document.getElementById('messenger-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Placing your order...';
        }

        const items = cart.map(i => ({
            product_id: i.parentId || i.id,
            flavor: i.flavor || null,
            qty: i.qty
        }));
        const trackingToken = makeTrackingToken();

        try {
            const { data: orderNumber, error } = await supabaseClient.rpc('place_order', {
                p_customer_name: data.name,
                p_customer_phone: null,
                p_order_type: data.type,
                p_landmark: data.landmark || null,
                p_shipping_zone: data.shippingAddress || null,
                p_shipping_fee: data.shippingFee,
                p_payment_method: data.pay,
                p_exact_amount: data.exactAmount,
                p_amount_given: data.customerAmount,
                p_change_due: data.changeDue,
                p_subtotal: data.subtotal,
                p_total: data.total,
                p_items: items,
                p_tracking_token: trackingToken
            });

            if (error) throw error;
            if (!orderNumber || typeof orderNumber !== 'string') {
                throw new Error('Order was created but no order number was returned.');
            }

            localStorage.setItem('lastOrderNumber', orderNumber);
            localStorage.setItem('lastOrderTrackingToken', trackingToken);

            document.getElementById('checkout-modal').classList.remove('active');
            window.__lastOrderData = data;
            window.__lastOrderNumber = orderNumber;
            window.__lastTrackingToken = trackingToken;

            const text = buildOrderText(data, orderNumber);
            navigator.clipboard.writeText(text).catch(() => {});
            const messengerWin = window.open(`${CONFIG.messengerUrl}?text=${encodeURIComponent(text)}`, '_blank');

            showOrderBanner(orderNumber, trackingToken, !messengerWin);

            cart = [];
            updateUI();
            loadProducts(false);
        } catch (err) {
            console.error('Error placing order:', err);
            showToast(`❌ ${err?.message || 'Could not place order. Please check your connection and try again.'}`, 5000);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '📱 Send my order';
            }
        }
    };

    window.showOrderBanner = function (orderNumber, trackingToken, messengerBlocked) {
        document.querySelectorAll('.order-banner').forEach(el => el.remove());
        const trackUrl = `track.html?order=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(trackingToken)}`;
        const banner = document.createElement('div');
        banner.className = 'order-banner';
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#2E7D32;color:white;padding:14px 16px;text-align:center;font-size:.9rem;box-shadow:0 2px 8px rgba(0,0,0,.2);';
        const title = document.createElement('div');
        title.style.cssText = 'font-weight:700;margin-bottom:4px;';
        title.textContent = `✅ Order placed — ${orderNumber}`;
        const message = document.createElement('div');
        message.style.cssText = 'font-size:.82rem;opacity:.95;margin-bottom:8px;';
        message.textContent = messengerBlocked ? 'Tap below to send your order to Messenger.' : 'Your order was sent to Messenger. Check your chat!';
        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap;';
        if (messengerBlocked) {
            const btn = document.createElement('button');
            btn.style.cssText = 'background:#0084FF;color:white;border:none;padding:8px 14px;border-radius:20px;font-weight:600;cursor:pointer;font-size:.82rem;';
            btn.textContent = '📱 Open Messenger';
            btn.onclick = () => window.__sendReceiptToMessenger(orderNumber);
            actions.appendChild(btn);
        }
        const track = document.createElement('a');
        track.href = trackUrl;
        track.style.cssText = 'background:rgba(255,255,255,.2);color:white;padding:8px 14px;border-radius:20px;font-weight:600;text-decoration:none;font-size:.82rem;';
        track.textContent = '📦 Track my order';
        actions.appendChild(track);
        const dismiss = document.createElement('button');
        dismiss.style.cssText = 'background:none;border:1px solid rgba(255,255,255,.5);color:white;padding:8px 14px;border-radius:20px;cursor:pointer;font-size:.82rem;';
        dismiss.textContent = '✕ Dismiss';
        dismiss.onclick = () => banner.remove();
        actions.appendChild(dismiss);
        banner.append(title, message, actions);
        document.body.appendChild(banner);
        setTimeout(() => banner.remove(), 20000);
    };

    window.__sendReceiptToMessenger = function (orderNumber) {
        const data = window.__lastOrderData;
        if (!data) return;
        const text = buildOrderText(data, orderNumber);
        navigator.clipboard.writeText(text).catch(() => {});
        window.open(`${CONFIG.messengerUrl}?text=${encodeURIComponent(text)}`, '_blank');
        showToast('📱 Messenger opened – message is pre-filled!', 3000);
    };

    window.goToTrackOrder = function () {
        const order = localStorage.getItem('lastOrderNumber');
        const token = localStorage.getItem('lastOrderTrackingToken');
        if (order && token) {
            window.location.href = `track.html?order=${encodeURIComponent(order)}&token=${encodeURIComponent(token)}`;
        } else {
            window.location.href = 'track.html';
        }
    };
})();
