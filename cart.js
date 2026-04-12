/*
 * cart.js — Cart state, drawer, item controls
 */

let cart = []; // [{ name, price, emoji, qty }]

// ── Open / Close Drawer ─────────────────────────
const cartDrawer  = document.getElementById('cart-drawer');
const drawerOverlay = document.getElementById('drawer-overlay');
const cartBtn     = document.getElementById('cart-btn');
const closeCart   = document.getElementById('close-cart');

function openCart() {
  cartDrawer.classList.add('open');
  drawerOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  cartDrawer.setAttribute('aria-hidden', 'false');
}

function closeCartDrawer() {
  cartDrawer.classList.remove('open');
  drawerOverlay.classList.add('hidden');
  document.body.style.overflow = '';
  cartDrawer.setAttribute('aria-hidden', 'true');
}

cartBtn.addEventListener('click', openCart);
closeCart.addEventListener('click', closeCartDrawer);
drawerOverlay.addEventListener('click', closeCartDrawer);

// ── Add to Cart ─────────────────────────────────
function addToCart({ name, price, emoji }) {
  const existing = cart.find(i => i.name === name);
  if (existing) {
    existing.qty++;
  } else {
    cart.push({ name, price, emoji, qty: 1 });
  }
  updateCartUI();
  openCart();
  // Flash add button
  updateAddButtons();
}

// ── Remove / Adjust ─────────────────────────────
function adjustQty(name, delta) {
  const item = cart.find(i => i.name === name);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    cart = cart.filter(i => i.name !== name);
  }
  updateCartUI();
  updateAddButtons();
}

// ── Render Cart Items ────────────────────────────
function updateCartUI() {
  const container = document.getElementById('cart-items');
  const footer    = document.getElementById('cart-footer');
  const countBadge = document.getElementById('cart-count');
  const totalEl   = document.getElementById('cart-total');

  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  const totalAmt = cart.reduce((s, i) => s + i.price * i.qty, 0);

  // Badge
  if (totalQty > 0) {
    countBadge.textContent = totalQty;
    countBadge.classList.remove('hidden');
  } else {
    countBadge.classList.add('hidden');
  }

  // Total
  totalEl.textContent = '₱' + totalAmt.toLocaleString();

  // Footer visibility
  footer.style.display = cart.length > 0 ? 'block' : 'none';

  // Items
  if (cart.length === 0) {
    container.innerHTML = '<p class="cart-empty-msg">Your cart is empty.<br/>Add items from the menu!</p>';
    return;
  }

  container.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="ci-emoji">${item.emoji}</div>
      <div class="ci-info">
        <div class="ci-name">${escHtml(item.name)}</div>
        <div class="ci-price">₱${(item.price * item.qty).toLocaleString()}</div>
      </div>
      <div class="ci-controls">
        <button class="qty-btn" onclick="adjustQty('${escHtml(item.name)}', -1)" aria-label="Remove one">−</button>
        <span class="qty-num">${item.qty}</span>
        <button class="qty-btn" onclick="adjustQty('${escHtml(item.name)}', 1)" aria-label="Add one">+</button>
      </div>
    </div>
  `).join('');
}

// ── Reflect in-cart state on add buttons ─────────
function updateAddButtons() {
  document.querySelectorAll('.add-btn').forEach(btn => {
    if (btn.disabled) return;
    const name = btn.dataset.name;
    const cartItem = cart.find(i => i.name === name);
    if (cartItem) {
      btn.classList.add('in-cart');
      btn.innerHTML = `✓ <span>${cartItem.qty}</span>`;
    } else {
      btn.classList.remove('in-cart');
      btn.innerHTML = '+';
    }
  });
}

// ── Helper ──────────────────────────────────────
function escHtml(str) {
  return String(str||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/'/g,'&#39;');
}

// ── Expose cart for checkout.js ───────────────────
window.getCart = () => cart;
window.getCartTotal = () => cart.reduce((s, i) => s + i.price * i.qty, 0);
