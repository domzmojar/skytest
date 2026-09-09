/*
 * Sky Sweet Treats checkout fix
 *
 * This file intentionally overrides only submitOrder(). It works with the
 * existing checkout UI, collectCheckoutData(), and buildOrderText().
 */
(function () {
    function generateTrackingToken() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }

        if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
            const bytes = new Uint8Array(24);
            window.crypto.getRandomValues(bytes);
            return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        }

        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    }

    function addTrackingTokenToReceipt(text, orderNumber, trackingToken) {
        const oldUrl = `track.html?order=${encodeURIComponent(orderNumber)}`;
        const newUrl = `track.html?order=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(trackingToken)}`;
        return String(text).replace(oldUrl, newUrl);
    }

    window.submitOrder = async function () {
        const data = collectCheckoutData();
        if (!data) return;

        const submitBtn = document.getElementById('messenger-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Placing your order...';
        }

        const trackingToken = generateTrackingToken();
        const items = cart.map(i => ({
            product_id: i.parentId || i.id,
            product_name: i.name,
            flavor: i.flavor || null,
            price: i.price,
            qty: i.qty
        }));

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
                : trackingToken;

            if (!orderNumber) {
                throw new Error('Order was created but no order number was returned by the server.');
            }

            if (!returnedTrackingToken) {
                throw new Error('Order was created but no tracking token was returned by the server.');
            }

            document.getElementById('checkout-modal').classList.remove('active');
            window.__lastOrderData = data;
            window.__lastOrderNumber = orderNumber;
            window.__lastOrderTrackingToken = returnedTrackingToken;

            let text = buildOrderText(data, orderNumber);
            text = addTrackingTokenToReceipt(text, orderNumber, returnedTrackingToken);

            try {
                await navigator.clipboard.writeText(text);
            } catch (clipboardError) {
                console.warn('Could not copy order receipt:', clipboardError);
            }

            cart = [];
            updateUI();
            loadProducts(false);

            const messengerUrl = `${CONFIG.messengerUrl}?text=${encodeURIComponent(text)}`;
            window.location.assign(messengerUrl);
        } catch (err) {
            console.error('Error placing order:', err);
            showToast('❌ Could not place order. Please check your connection and try again.', 4000);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '📱 Send my order';
            }
        }
    };
})();
