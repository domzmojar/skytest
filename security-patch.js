// Security patch: keeps the existing storefront UI but moves trust to the database.
(() => {
    function makeTrackingToken() {
        if (window.crypto?.randomUUID) return window.crypto.randomUUID();

        if (window.crypto?.getRandomValues) {
            const bytes = new Uint8Array(24);
            window.crypto.getRandomValues(bytes);
            return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        }

        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    }

    function addTrackingTokenToReceipt(text, orderNumber, trackingToken) {
        const oldUrl = `track.html?order=${encodeURIComponent(orderNumber)}`;
        const newUrl = `track.html?order=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(trackingToken)}`;
        const updated = String(text).replace(oldUrl, newUrl);

        if (updated !== String(text)) return updated;

        const fallbackUrl = `${window.location.origin}/track.html?order=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(trackingToken)}`;
        return String(text).replace(
            `Track: ${window.location.origin}/track.html?order=${encodeURIComponent(orderNumber)}`,
            `Track: ${fallbackUrl}`
        );
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
            product_name: i.name,
            flavor: i.flavor || null,
            price: i.price,
            qty: i.qty
        }));

        // Open Messenger immediately from the user's button click so browsers
        // are much less likely to block it after the async Supabase request.
        let messengerWindow = null;
        try {
            messengerWindow = window.open('about:blank', '_blank');
            if (messengerWindow) {
                messengerWindow.opener = null;
            }
        } catch (popupError) {
            console.warn('Could not pre-open Messenger window:', popupError);
        }

        const trackingToken = makeTrackingToken();

        try {
            const { data: rpcData, error } = await supabaseClient.rpc('place_order', {
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

            const orderNumber = rpcData && typeof rpcData === 'object'
                ? rpcData.order_number
                : null;
            const returnedTrackingToken = rpcData && typeof rpcData === 'object'
                ? rpcData.tracking_token
                : null;

            if (!orderNumber || typeof orderNumber !== 'string') {
                throw new Error('Order was created but no order number was returned by the server.');
            }

            if (!returnedTrackingToken || typeof returnedTrackingToken !== 'string') {
                throw new Error('Order was created but no tracking token was returned by the server.');
            }

            window.__lastOrderData = data;
            window.__lastOrderNumber = orderNumber;
            window.__lastOrderTrackingToken = returnedTrackingToken;

            const trackUrl = `track.html?order=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(returnedTrackingToken)}`;
            let text = buildOrderText(data, orderNumber);
            text = addTrackingTokenToReceipt(text, orderNumber, returnedTrackingToken);

            try {
                await navigator.clipboard.writeText(text);
            } catch (clipboardError) {
                console.warn('Could not copy order receipt:', clipboardError);
            }

            // Continue the pre-opened Messenger window using the same user gesture.
            const messengerUrl = `${CONFIG.messengerUrl}?text=${encodeURIComponent(text)}`;
            if (messengerWindow && !messengerWindow.closed) {
                messengerWindow.location.href = messengerUrl;
            } else {
                messengerWindow = null;
            }

            cart = [];
            updateUI();
            loadProducts(false);

            const checkoutModal = document.getElementById('checkout-modal');
            if (checkoutModal) checkoutModal.classList.remove('active');

            // Main page becomes the customer's secure tracking page.
            window.location.assign(trackUrl);
        } catch (err) {
            if (messengerWindow && !messengerWindow.closed) {
                try { messengerWindow.close(); } catch (closeError) {}
            }

            console.error('Error placing order:', err);
            showToast(`❌ ${err?.message || 'Could not place order. Please check your connection and try again.'}`, 5000);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '📱 Send my order';
            }
        }
    };

    window.showOrderBanner = function (orderNumber, trackingToken, messengerBlocked = false) {
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
        message.textContent = messengerBlocked
            ? 'Your order is saved. Tap below to send it to Messenger.'
            : 'Your order is saved and Messenger is ready.';

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap;';

        if (messengerBlocked) {
            const btn = document.createElement('button');
            btn.style.cssText = 'background:#0084FF;color:white;border:none;padding:8px 14px;border-radius:20px;font-weight:600;cursor:pointer;font-size:.82rem;';
            btn.textContent = '📱 Open Messenger';
            btn.onclick = () => window.__sendReceiptToMessenger(orderNumber, trackingToken);
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

    window.__sendReceiptToMessenger = function (orderNumber, trackingToken) {
        const data = window.__lastOrderData;
        if (!data) return;

        let text = buildOrderText(data, orderNumber);
        text = addTrackingTokenToReceipt(text, orderNumber, trackingToken);

        navigator.clipboard.writeText(text).catch(() => {});
        window.location.href = `${CONFIG.messengerUrl}?text=${encodeURIComponent(text)}`;
    };

    window.goToTrackOrder = function () {
        const order = window.__lastOrderNumber;
        const token = window.__lastOrderTrackingToken;

        if (order && token) {
            window.location.href = `track.html?order=${encodeURIComponent(order)}&token=${encodeURIComponent(token)}`;
        } else {
            window.location.href = 'track.html';
        }
    };
})();
