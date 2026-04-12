/*
 * menu.js — Fetches from Google Sheets CSV, builds dynamic category filters
 */

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQSD8htdn5MEhyQXTvBeibFi-uIWOmTltU3ZuzLZ5tvLtj6y5tYjrhz6akEB0_j76O-onLilumjPw64/pub?output=csv';
const REFRESH_MS = 2 * 60 * 1000; // 2 minutes

let allItems = [];
let activeFilter = 'all';

// ── CSV Parser ──────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h =>
    h.trim().toLowerCase().replace(/"/g, '').replace(/\s+/g, '_')
  );

  return lines.slice(1).map(line => {
    const cols = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    cols.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (cols[i] || '').replace(/^"|"$/g, '').trim(); });
    return obj;
  }).filter(r => r.name);
}

// ── Fetch ───────────────────────────────────────
async function fetchMenu() {
  try {
    const res = await fetch(SHEET_CSV_URL + '&t=' + Date.now()); // cache bust
    if (!res.ok) throw new Error('fetch failed');
    const text = await res.text();
    allItems = parseCSV(text);
  } catch (e) {
    console.warn('Sheet fetch failed, using demo data.', e);
    allItems = getDemoItems();
  }
  buildCategories();
  renderMenu();
}

// ── Categories ──────────────────────────────────
function buildCategories() {
  const seen = new Set();
  allItems.forEach(item => {
    const cat = (item.category || '').trim();
    if (cat) seen.add(cat);
  });

  const inner = document.getElementById('filter-inner');
  // Keep "All" button, remove any old dynamic buttons
  const allBtn = inner.querySelector('[data-filter="all"]');
  inner.innerHTML = '';
  inner.appendChild(allBtn);

  seen.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.filter = cat.toLowerCase();
    btn.textContent = cap(cat);
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = cat.toLowerCase();
      renderMenu();
    });
    inner.appendChild(btn);
  });

  // Re-bind "All" click (it was re-inserted fresh)
  allBtn.onclick = () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    allBtn.classList.add('active');
    activeFilter = 'all';
    renderMenu();
  };
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── Render ──────────────────────────────────────
function renderMenu() {
  const grid = document.getElementById('menu-grid');
  const status = document.getElementById('menu-status');
  const empty = document.getElementById('empty-state');

  const filtered = activeFilter === 'all'
    ? allItems
    : allItems.filter(i => (i.category || '').toLowerCase() === activeFilter);

  status.classList.add('hidden');

  if (filtered.length === 0) {
    grid.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.classList.remove('hidden');
  grid.innerHTML = filtered.map((item, idx) => buildCard(item, idx)).join('');
  // Re-attach add-to-cart listeners
  grid.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.name;
      const price = parseFloat(btn.dataset.price);
      const emoji = btn.dataset.emoji;
      addToCart({ name, price, emoji });
    });
  });
}

// ── Card Builder ────────────────────────────────
function buildCard(item, idx) {
  const stockRaw = (item.stock || '').toLowerCase();
  const isOut = ['out of stock','out','0','sold out','unavailable'].includes(stockRaw);
  const isLow = stockRaw === 'low';

  const badgeRaw = (item.badge || '').toLowerCase();
  let badges = '';
  if (isOut) {
    badges = `<span class="badge badge-oos">Sold Out</span>`;
  } else {
    if (badgeRaw === 'bestseller') badges += `<span class="badge badge-bestseller">⭐ Best Seller</span>`;
    if (badgeRaw === 'new')        badges += `<span class="badge badge-new">New</span>`;
    if (badgeRaw === 'spicy')      badges += `<span class="badge badge-spicy">🌶 Spicy</span>`;
  }

  const rawPrice = (item.price || '').replace(/[₱$,]/g, '').trim();
  const numPrice = parseFloat(rawPrice) || 0;
  const dispPrice = numPrice > 0 ? numPrice.toLocaleString() : '—';
  const emoji = item.emoji || '🍔';
  const hasImg = item.image_url && item.image_url.trim();

  const imgContent = hasImg
    ? `<img src="${esc(item.image_url)}" alt="${esc(item.name)}" loading="lazy"
         onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
       <div class="card-placeholder" style="display:none">${emoji}</div>`
    : `<div class="card-placeholder">${emoji}</div>`;

  const stockLabel = isOut ? '' : isLow ? '<span class="card-stock low">⚠ Low stock</span>' : '';

  const addBtnHTML = isOut
    ? `<button class="add-btn" disabled style="opacity:0.3;cursor:not-allowed">✕</button>`
    : `<button class="add-btn" data-name="${esc(item.name)}" data-price="${numPrice}" data-emoji="${emoji}"
         aria-label="Add ${esc(item.name)} to cart">+</button>`;

  return `
    <div class="menu-card${isOut ? ' out-of-stock' : ''}" style="animation-delay:${idx*0.05}s">
      <div class="card-img-wrap">
        ${imgContent}
        <div class="badge-strip">${badges}</div>
      </div>
      <div class="card-body">
        <p class="card-cat">${esc(item.category || '')}</p>
        <h3 class="card-name">${esc(item.name)}</h3>
        <p class="card-desc">${esc(item.description || '')}</p>
        <div class="card-footer">
          <div class="card-price"><span class="cur">₱</span>${dispPrice}</div>
          <div style="display:flex;align-items:center;gap:0.5rem">
            ${stockLabel}
            ${addBtnHTML}
          </div>
        </div>
      </div>
    </div>`;
}

function esc(str) {
  return String(str||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ── Demo fallback ────────────────────────────────
function getDemoItems() {
  return [
    { name:'Sky Classic Burger', category:'Burgers', description:'Double smash patty, aged cheddar, caramelised onions, house sauce.', price:'₱189', stock:'available', badge:'bestseller', emoji:'🍔', image_url:'' },
    { name:'Crispy Chicken Burger', category:'Burgers', description:'Buttermilk fried chicken, slaw, jalapeño aioli, pickles.', price:'₱175', stock:'available', badge:'spicy', emoji:'🌶️', image_url:'' },
    { name:'Loaded Fries', category:'Sides', description:'Golden fries, cheese sauce, bacon bits, spring onion.', price:'₱89', stock:'low', badge:'', emoji:'🍟', image_url:'' },
    { name:'Sky Shake', category:'Drinks', description:'Thick salted caramel milkshake with whipped cream.', price:'₱129', stock:'available', badge:'bestseller', emoji:'🥤', image_url:'' },
    { name:'Lava Cake', category:'Desserts', description:'Warm molten chocolate cake, vanilla ice cream.', price:'₱119', stock:'available', badge:'new', emoji:'🍫', image_url:'' },
  ];
}

// ── Init ─────────────────────────────────────────
fetchMenu();
setInterval(fetchMenu, REFRESH_MS);
