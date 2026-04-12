/*
 * checkout.js — Multi-step checkout, validation, Messenger prefill
 */

const FACEBOOK_PAGE_ID = '104745502529263';
const MESSENGER_URL    = `https://www.messenger.com/t/${FACEBOOK_PAGE_ID}`;

let currentStep = 1;

// ── Open / Close Modal ──────────────────────────
const checkoutOverlay = document.getElementById('checkout-overlay');
const closeCheckoutBtn = document.getElementById('close-checkout');
const btnCheckout = document.getElementById('btn-checkout');

btnCheckout.addEventListener('click', () => {
  if (window.getCart().length === 0) return;
  openCheckout();
});

function openCheckout() {
  closeCartDrawer();
  checkoutOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  goStep(1);
}

closeCheckoutBtn.addEventListener('click', closeCheckout);
checkoutOverlay.addEventListener('click', (e) => {
  if (e.target === checkoutOverlay) closeCheckout();
});

function closeCheckout() {
  checkoutOverlay.classList.add('hidden');
  document.body.style.overflow = '';
}

// ── Step Navigation ─────────────────────────────
function goStep(n) {
  // Validate before moving forward
  if (n > currentStep) {
    if (!validateStep(currentStep)) return;
  }

  // Update step visibility
  document.querySelectorAll('.checkout-step').forEach((el, i) => {
    el.classList.toggle('active', i + 1 === n);
  });

  // Update progress indicators
  document.querySelectorAll('.progress-step').forEach((el, i) => {
    const stepNum = i + 1;
    el.classList.remove('active', 'done');
    if (stepNum === n) el.classList.add('active');
    if (stepNum < n)  el.classList.add('done');
  });

  currentStep = n;

  // Scroll modal to top
  const modal = document.getElementById('checkout-modal');
  modal.scrollTop = 0;

  // Build review on step 4
  if (n === 4) buildReview();

  // Handle payment method visibility
  if (n === 3) syncPaymentOptions();
}

// Make goStep globally accessible (called from HTML onclick)
window.goStep = goStep;

// ── Validation ──────────────────────────────────
function validateStep(step) {
  let valid = true;

  if (step === 1) {
    const name = document.getElementById('inp-name').value.trim();
    const phone = document.getElementById('inp-phone').value.trim();

    if (!name) {
      showError('inp-name', 'err-name', true);
      valid = false;
    } else {
      showError('inp-name', 'err-name', false);
    }

    if (!phone) {
      showError('inp-phone', 'err-phone', true);
      valid = false;
    } else if (!/^[0-9+\-\s()]{7,15}$/.test(phone)) {
      showError('inp-phone', 'err-phone', true, 'Please enter a valid phone number.');
      valid = false;
    } else {
      showError('inp-phone', 'err-phone', false);
    }
  }

  if (step === 2) {
    const method = getOrderMethod();
    if (method === 'delivery') {
      const address = document.getElementById('inp-address').value.trim();
      if (!address) {
        showError('inp-address', 'err-address', true);
        valid = false;
      } else {
        showError('inp-address', 'err-address', false);
      }
    }
  }

  if (step === 3) {
    const payment = getPaymentMethod();
    const errEl = document.getElementById('err-payment');
    if (!payment) {
      errEl.classList.remove('hidden');
      valid = false;
    } else {
      errEl.classList.add('hidden');
    }
  }

  return valid;
}

function showError(inputId, errId, show, msg) {
  const input = document.getElementById(inputId);
  const err   = document.getElementById(errId);
  if (show) {
    input.classList.add('error');
    err.classList.remove('hidden');
    if (msg) err.textContent = msg;
    input.focus();
  } else {
    input.classList.remove('error');
    err.classList.add('hidden');
  }
}

// ── Order Method ────────────────────────────────
function getOrderMethod() {
  const checked = document.querySelector('input[name="order-method"]:checked');
  return checked ? checked.value : 'delivery';
}

function getPaymentMethod() {
  const checked = document.querySelector('input[name="payment"]:checked');
  return checked ? checked.value : null;
}

// Toggle delivery/pickup fields
document.querySelectorAll('input[name="order-method"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const isDelivery = getOrderMethod() === 'delivery';
    document.getElementById('delivery-fields').style.display = isDelivery ? 'block' : 'none';
    document.getElementById('pickup-fields').style.display   = isDelivery ? 'none' : 'block';
    syncPaymentOptions();
  });
});

// GCash info toggle
document.querySelectorAll('input[name="payment"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const gcashInfo = document.getElementById('gcash-info');
    gcashInfo.classList.toggle('hidden', radio.value !== 'GCash');
  });
});

function syncPaymentOptions() {
  const method = getOrderMethod();
  const cod = document.getElementById('pay-cod');
  const cop = document.getElementById('pay-cop');

  // Show COD only for delivery, COP only for pickup
  cod.style.display = method === 'delivery' ? 'flex' : 'none';
  cop.style.display = method === 'pickup'   ? 'flex' : 'none';

  // Reset payment selection if shown option no longer matches
  const currentPayment = getPaymentMethod();
  if (method === 'delivery' && currentPayment === 'COP') {
    document.querySelector('input[name="payment"][value="COD"]').checked = true;
  }
  if (method === 'pickup' && currentPayment === 'COD') {
    document.querySelector('input[name="payment"][value="COP"]').checked = true;
  }
}

// ── Build Review Summary ─────────────────────────
function buildReview() {
  const name    = document.getElementById('inp-name').value.trim();
  const phone   = document.getElementById('inp-phone').value.trim();
  const notes   = document.getElementById('inp-notes').value.trim();
  const method  = getOrderMethod();
  const address = document.getElementById('inp-address').value.trim();
  const landmark = document.getElementById('inp-landmark').value.trim();
  const payment = getPaymentMethod();
  const items   = window.getCart();
  const total   = window.getCartTotal();

  const deliveryHTML = method === 'delivery'
    ? `<div class="review-value">${esc(address)}${landmark ? `<br><span style="color:var(--text-muted);font-size:0.78rem">📍 Near ${esc(landmark)}</span>` : ''}</div>`
    : `<div class="review-value">🏪 Pick Up at our store</div>`;

  const itemsHTML = items.map(i => `
    <div class="review-item">
      <span class="review-item-name">${esc(i.name)}</span>
      <span class="review-item-qty">×${i.qty}</span>
      <span class="review-item-price">₱${(i.price * i.qty).toLocaleString()}</span>
    </div>`).join('');

  const paymentLabel = payment === 'COD' ? '💵 Cash on Delivery'
    : payment === 'COP' ? '🏪 Cash on Pickup'
    : '📱 GCash';

  document.getElementById('review-card').innerHTML = `
    <div class="review-section">
      <div class="review-label">Customer</div>
      <div class="review-value">${esc(name)}</div>
      <div class="review-value" style="color:var(--text-muted);font-size:0.82rem">${esc(phone)}</div>
    </div>
    <div class="review-divider"></div>
    <div class="review-section">
      <div class="review-label">${method === 'delivery' ? 'Delivery Address' : 'Order Type'}</div>
      ${deliveryHTML}
    </div>
    <div class="review-divider"></div>
    <div class="review-section">
      <div class="review-label">Order Items</div>
      ${itemsHTML}
      <div class="review-total-row">
        <span class="review-total-label">Total</span>
        <span class="review-total-amt">₱${total.toLocaleString()}</span>
      </div>
    </div>
    <div class="review-divider"></div>
    <div class="review-section">
      <div class="review-label">Payment</div>
      <div class="review-value">${paymentLabel}</div>
    </div>
    ${notes ? `<div class="review-divider"></div>
    <div class="review-section">
      <div class="review-label">Special Instructions</div>
      <div class="review-value">${esc(notes)}</div>
    </div>` : ''}
  `;
}

// ── Place Order → Messenger ──────────────────────
document.getElementById('btn-place').addEventListener('click', () => {
  const name     = document.getElementById('inp-name').value.trim();
  const phone    = document.getElementById('inp-phone').value.trim();
  const notes    = document.getElementById('inp-notes').value.trim();
  const method   = getOrderMethod();
  const address  = document.getElementById('inp-address').value.trim();
  const landmark = document.getElementById('inp-landmark').value.trim();
  const payment  = getPaymentMethod();
  const items    = window.getCart();
  const total    = window.getCartTotal();

  const paymentLabel = payment === 'COD' ? 'Cash on Delivery (COD)'
    : payment === 'COP' ? 'Cash on Pickup (COP)'
    : 'GCash';

  const itemLines = items.map(i =>
    `  • ${i.name} ×${i.qty} — ₱${(i.price * i.qty).toLocaleString()}`
  ).join('\n');

  const orderType = method === 'delivery'
    ? `🛵 DELIVERY\nAddress: ${address}${landmark ? `\nLandmark: ${landmark}` : ''}`
    : `🏪 PICK UP`;

  const msg =
`Hi! I'd like to place an order from Sky Sweet Treats 🍔

👤 Name: ${name}
📞 Phone: ${phone}

${orderType}

🛒 Order:
${itemLines}

💰 Total: ₱${total.toLocaleString()}
💳 Payment: ${paymentLabel}
${notes ? `\n📝 Notes: ${notes}` : ''}

Please confirm my order. Thank you!`;

  const encoded = encodeURIComponent(msg);
  const url = `${MESSENGER_URL}?text=${encoded}`;
  window.open(url, '_blank', 'noopener,noreferrer');
});

// ── Helper ──────────────────────────────────────
function esc(str) {
  return String(str||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// Expose closeCartDrawer for checkout.js (may load after cart.js)
window.closeCheckout = closeCheckout;
