/*
 * Sky Sweet Treats — Menu Loader
 * Fetches live data from a published Google Sheet (CSV format)
 * No server required. Free. Auto-updates.
 *
 * HOW TO SET UP YOUR GOOGLE SHEET:
 *   1. Go to https://sheets.google.com and create a new sheet
 *   2. Name the columns EXACTLY (Row 1 headers):
 *      name | category | description | price | stock | badge | emoji | image_url
 *   3. File → Share → Publish to web → Sheet1 → CSV → Publish
 *   4. Copy the URL and paste it below as SHEET_CSV_URL
 */

// ─────────────────────────────────────────────────
//  🔧 CONFIGURATION — PASTE YOUR GOOGLE SHEET URL HERE
// ─────────────────────────────────────────────────
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQSD8htdn5MEhyQXTvBeibFi-uIWOmTltU3ZuzLZ5tvLtj6y5tYjrhz6akEB0_j76O-onLilumjPw64/pub?output=csv';

// How often to auto-refresh (in milliseconds). Default: every 2 minutes.
const REFRESH_INTERVAL = 2 * 60 * 1000;

// Category filter mapping (lowercase sheet values → filter button data-filter)
const CATEGORY_MAP = {
  'burgers':  'burgers',
  'sides':    'sides',
  'drinks':   'drinks',
  'desserts': 'desserts',
};

// ─────────────────────────────────────────────────
//  DEMO DATA (shown when no Sheet URL is set yet)
// ─────────────────────────────────────────────────
const DEMO_ITEMS = [
  {
    name: 'The Sky Classic',
    category: 'burgers',
    description: 'Double smash patty, aged cheddar, caramelised onions, house sauce on a brioche bun.',
    price: '₱189',
    stock: 'available',
    badge: 'bestseller',
    emoji: '🍔',
    image_url: ''
  },
  {
    name: 'Crispy Chicken Deluxe',
    category: 'burgers',
    description: 'Buttermilk fried chicken, slaw, jalapeño aioli, pickles. A fan favourite.',
    price: '₱175',
    stock: 'available',
    badge: 'spicy',
    emoji: '🌶️',
    image_url: ''
  },
  {
    name: 'Mushroom Melt',
    category: 'burgers',
    description: 'Sautéed mushrooms, Swiss cheese, truffle mayo, arugula on sourdough.',
    price: '₱165',
    stock: 'low',
    badge: 'new',
    emoji: '🍄',
    image_url: ''
  },
  {
    name: 'Loaded Fries',
    category: 'sides',
    description: 'Golden fries topped with cheese sauce, bacon bits, spring onion.',
    price: '₱89',
    stock: 'available',
    badge: '',
    emoji: '🍟',
    image_url: ''
  },
  {
    name: 'Onion Rings',
    category: 'sides',
    description: 'Beer-battered thick-cut onion rings with smoky dipping sauce.',
    price: '₱79',
    stock: 'available',
    badge: '',
    emoji: '🧅',
    image_url: ''
  },
  {
    name: 'Sky Shake — Salted Caramel',
    category: 'drinks',
    description: 'Thick milkshake blended with salted caramel, topped with whipped cream.',
    price: '₱129',
    stock: 'available',
    badge: 'bestseller',
    emoji: '🥤',
    image_url: ''
  },
  {
    name: 'Mango Lemonade',
    category: 'drinks',
    description: 'Fresh mango purée, lemon juice, sparkling water. Refreshing and bright.',
    price: '₱79',
    stock: 'out of stock',
    badge: '',
    emoji: '🍋',
    image_url: ''
  },
  {
    name: 'Iced Americano',
    category: 'drinks',
    description: 'Double shot espresso over ice. Simple, strong, perfect.',
    price: '₱69',
    stock: 'available',
    badge: '',
    emoji: '☕',
    image_url: ''
  },
  {
    name: 'Dark Chocolate Lava Cake',
    category: 'desserts',
    description: 'Warm molten chocolate cake with vanilla ice cream and gold dust.',
    price: '₱119',
    stock: 'low',
    badge: 'new',
    emoji: '🍫',
    image_url: ''
  },
  {
    name: 'Sky Sundae',
    category: 'desserts',
    description: 'Soft serve vanilla swirl, caramel drizzle, crushed nuts, wafer.',
    price: '₱89',
    stock: 'available',
    badge: '',
    emoji: '🍨',
    image_url: ''
  },
];

// ─────────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────────
let allItems = [];
let activeFilter = 'all';

// ─────────────────────────────────────────────────
//  CSV PARSER (handles quoted commas)
// ─────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));

  return lines.slice(1).map(line => {
    // Handle commas inside quotes
    const cols = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    cols.push(cur.trim());

    const obj = {};
    headers.forEach((h, i) => { obj[h] = (cols[i] || '').replace(/"/g, ''); });
    return obj;
  }).filter(row => row.name);
}

// ─────────────────────────────────────────────────
//  FETCH FROM GOOGLE SHEETS
// ─────────────────────────────────────────────────
async function fetchMenu() {
  if (!SHEET_CSV_URL || SHEET_CSV_URL === 'YOUR_GOOGLE_SHEET_CSV_URL_HERE') {
    // Use demo data
    allItems = DEMO_ITEMS;
    renderMenu();
    return;
  }

  try {
    const res = await fetch(SHEET_CSV_URL);
    if (!res.ok) throw new Error('Network response was not ok');
    const text = await res.text();
    allItems = parseCSV(text);
    renderMenu();
  } catch (err) {
    console.error('Failed to fetch menu:', err);
    // Fallback to demo
    allItems = DEMO_ITEMS;
    renderMenu();
  }
}

// ─────────────────────────────────────────────────
//  RENDER
// ─────────────────────────────────────────────────
function renderMenu() {
  const grid = document.getElementById('menu-grid');
  const loading = document.getElementById('loading-state');
  const empty = document.getElementById('empty-state');
  const count = document.getElementById('item-count');

  loading.classList.add('hidden');

  const filtered = activeFilter === 'all'
    ? allItems
    : allItems.filter(item => (item.category || '').toLowerCase() === activeFilter);

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    count.textContent = '0 items';
    return;
  }

  empty.classList.add('hidden');
  count.textContent = `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`;

  grid.innerHTML = filtered.map((item, i) => buildCard(item, i)).join('');
}

// ─────────────────────────────────────────────────
//  CARD BUILDER
// ─────────────────────────────────────────────────
function buildCard(item, index) {
  const stockRaw = (item.stock || '').toLowerCase();
  const isOut   = stockRaw === 'out of stock' || stockRaw === 'out' || stockRaw === '0';
  const isLow   = stockRaw === 'low';

  const badgeRaw = (item.badge || '').toLowerCase();
  let badgeHTML = '';
  if (isOut) {
    badgeHTML += `<span class="badge badge-oos">Sold Out</span>`;
  } else {
    if (badgeRaw === 'bestseller') badgeHTML += `<span class="badge badge-bestseller">⭐ Best Seller</span>`;
    if (badgeRaw === 'new')        badgeHTML += `<span class="badge badge-new">New</span>`;
    if (badgeRaw === 'spicy')      badgeHTML += `<span class="badge badge-spicy">🌶 Spicy</span>`;
  }

  const imgHTML = item.image_url
    ? `<img src="${escHtml(item.image_url)}" alt="${escHtml(item.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
       <div class="card-img-placeholder" style="display:none">${escHtml(item.emoji || '🍔')}</div>`
    : `<div class="card-img-placeholder">${escHtml(item.emoji || '🍔')}</div>`;

  const stockLabel = isOut ? 'Out of stock'
    : isLow ? 'Low stock'
    : 'Available';

  const stockClass = isOut ? 'out' : isLow ? 'low' : '';

  const price = item.price
    ? item.price.replace('₱', '').replace('$', '').trim()
    : '—';

  const currency = item.price && item.price.includes('$') ? '$' : '₱';

  return `
    <div class="menu-card${isOut ? ' out-of-stock' : ''}" style="animation-delay:${index * 0.06}s">
      <div class="card-img-wrap">
        ${imgHTML}
        <div class="card-badge-wrap">${badgeHTML}</div>
      </div>
      <div class="card-body">
        <p class="card-category">${escHtml(item.category || '')}</p>
        <h3 class="card-name">${escHtml(item.name || '')}</h3>
        <p class="card-desc">${escHtml(item.description || '')}</p>
        <div class="card-footer">
          <div class="card-price"><span class="currency">${currency}</span>${escHtml(price)}</div>
          <span class="card-stock ${stockClass}">${stockLabel}</span>
        </div>
      </div>
    </div>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ─────────────────────────────────────────────────
//  FILTER BUTTONS
// ─────────────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderMenu();
  });
});

// ─────────────────────────────────────────────────
//  INIT + AUTO REFRESH
// ─────────────────────────────────────────────────
fetchMenu();
setInterval(fetchMenu, REFRESH_INTERVAL);
