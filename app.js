/* ============================================
   SKY SWEET TREATS — Upgraded App Logic
   - Auto-refresh every 5 min
   - Stock freshness indicator
   - Cleaner checkout with toggle UI
   - All original functionality preserved
   ============================================ */

const CONFIG = {
    currency: "₱",
    messengerUrl: "https://m.me/100089330907916",
    sheetUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRBquyZXkcMOzDv_14qyXq7sQvxqQ6k1l6tWZsiqspZ_mgl88Lqx08h3wUVYu9W9-MIP-ja5f-Yvtsj/pub?gid=1109857950&single=true&output=csv",
    businessPhone: "09264569430",
    businessHours: "8:00 AM - 9:00 PM",
    autoRefreshInterval: 5 * 60 * 1000  // 5 minutes in ms
};

let products = [];
let cart = [];
let refreshPromptCount = 0;
const MAX_REFRESH_PROMPTS = 1;
let toastTimeout = null;

// Shipping state
let selectedShippingAddress = '';
let selectedShippingFee = 0;

// Announcement state
let currentAnnouncement = null;
let announcementDismissed = false;
let announcementIcon = null;

// Banners array
let banners = [];

// Carousel state
let currentSlide = 0;
let carouselInterval = null;

// ============================================
// STOCK FRESHNESS SYSTEM
// ============================================
let lastLoadedAt = null;
let autoRefreshTimer = null;
let freshnessUpdateTimer = null;

function startFreshnessTimer() {
    if (freshnessUpdateTimer) clearInterval(freshnessUpdateTimer);
    freshnessUpdateTimer = setInterval(updateFreshnessDisplay, 30000); // update label every 30s
}

function updateFreshnessDisplay() {
    const bar = document.getElementById('freshness-text');
    const icon = document.getElementById('freshness-icon');
    if (!bar || !lastLoadedAt) return;

    const secondsAgo = Math.floor((Date.now() - lastLoadedAt) / 1000);
    const minutesAgo = Math.floor(secondsAgo / 60);

    if (secondsAgo < 60) {
        bar.textContent = 'Stock updated just now';
        icon.textContent = '🟢';
    } else if (minutesAgo < 5) {
        bar.textContent = `Stock updated ${minutesAgo} min ago`;
        icon.textContent = '🟢';
    } else if (minutesAgo < 10) {
        bar.textContent = `Stock last checked ${minutesAgo} min ago — refreshing soon`;
        icon.textContent = '🟡';
    } else {
        bar.textContent = `Stock may be outdated (${minutesAgo} min ago) — tap ↻ to refresh`;
        icon.textContent = '🔴';
    }
}

function setFreshnessLoading() {
    const bar = document.getElementById('freshness-text');
    const icon = document.getElementById('freshness-icon');
    if (bar) bar.textContent = 'Checking stock...';
    if (icon) icon.textContent = '⏳';
}

function startAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(() => {
        loadProducts(false); // silent refresh
    }, CONFIG.autoRefreshInterval);
}

// ============================================
// CSV ROW PARSER – handles quoted fields
// ============================================
function parseCSVRow(row) {
    const result = [];
    let inQuote = false;
    let currentField = '';
    for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"') {
            inQuote = !inQuote;
        } else if (char === ',' && !inQuote) {
            result.push(currentField);
            currentField = '';
        } else {
            currentField += char;
        }
    }
    result.push(currentField);
    return result;
}

// ============================================
// CONVERT GOOGLE DRIVE LINK TO THUMBNAIL
// ============================================
function convertGoogleDriveLink(url) {
    if (!url) return url;
    const patterns = [
        /(?:https?:\/\/)?drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
        /(?:https?:\/\/)?drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
        /(?:https?:\/\/)?drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/,
        /[-\w]{25,}/
    ];
    for (let pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            const fileId = match[1] || match[0];
            return `https://drive.google.com/thumbnail?id=${fileId}&sz=w400-h400`;
        }
    }
    return url;
}

// ============================================
// LOAD PRODUCTS + ANNOUNCEMENT + SHIPPING + BANNERS
// ============================================
async function loadProducts(showToastOnSuccess = true) {
    setFreshnessLoading();
    try {
        const response = await fetch(`${CONFIG.sheetUrl}&t=${Date.now()}`);
        const data = await response.text();
        const lines = data.split('\n');
        const rows = lines.slice(1).filter(line => line.trim() !== '');

        const allProducts = [];
        const distanceRows = [];
        const bannerRows = [];
        let announcementRow = null;

        rows.forEach(row => {
            const cols = parseCSVRow(row);
            const id = cols[0]?.trim();
            if (!id) return;
            if (id === 'ANNOUNCE')    { announcementRow = cols; }
            else if (id === 'DIST')   { distanceRows.push(cols); }
            else if (id === 'BANNER') { bannerRows.push(cols); }
            else if (id !== 'id')     { allProducts.push(cols); }
        });

        if (announcementRow) {
            const title   = announcementRow[1]?.trim();
            const message = announcementRow[5]?.trim();
            const status  = announcementRow[6]?.trim();
            currentAnnouncement = (status?.toLowerCase() === 'active' && title && message)
                ? { title, message } : null;
        } else {
            currentAnnouncement = null;
        }

        const shippingOptions = distanceRows.map(cols => ({
            name: cols[1]?.trim(),
            fee: parseFloat(cols[4]) || 0
        })).filter(opt => opt.name && opt.fee > 0);

        if (shippingOptions.length > 0) renderShippingDropdown(shippingOptions);

        banners = bannerRows.map(cols => ({
            alt:   cols[1]?.trim() || 'Banner',
            image: convertGoogleDriveLink(cols[11]?.trim() || '')
        })).filter(b => b.image);

        renderHeroCarousel();

        products = allProducts.map(cols => {
            const id      = cols[0]?.trim();
            const name    = cols[1]?.trim();
            const badge   = cols[2]?.trim() || '';
            const category = cols[3]?.trim() || 'Uncategorized';
            const price   = parseFloat(cols[4]) || 0;
            const details = cols[5]?.trim() || '';
            const status  = cols[6]?.trim();
            const stock   = parseInt(cols[7]) || 0;

            let flavorArray = (cols[8]?.trim() || '').split(',').map(f => f.trim()).filter(f => f.length > 0);
            let unavailableArray = (cols[10]?.trim() || '').split(',').map(f => f.trim()).filter(f => f.length > 0);
            const image = convertGoogleDriveLink(cols[11]?.trim() || '');

            return {
                id, name, badge, category, price, details, status, stock,
                variant_option: flavorArray,
                unavailable_flavors: unavailableArray,
                has_flavors: flavorArray.length > 0,
                image
            };
        }).filter(p => p.id && p.name);

        renderCategoriesAndMenu();
        validateCartAgainstNewStock();
        showAnnouncementIfNeeded();

        if (window.lastActiveCategory) {
            const activeTab = document.querySelector(`.category-tab[data-category="${window.lastActiveCategory}"]`);
            if (activeTab) {
                document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
                activeTab.classList.add('active');
            }
        }

        window.dispatchEvent(new Event('scroll'));

        // Update freshness
        lastLoadedAt = Date.now();
        updateFreshnessDisplay();
        startFreshnessTimer();

        if (showToastOnSuccess) showToast("✅ Menu updated!");

    } catch (error) {
        console.error("Error loading products:", error);
        const bar = document.getElementById('freshness-text');
        const icon = document.getElementById('freshness-icon');
        if (bar) bar.textContent = 'Could not update — check connection';
        if (icon) icon.textContent = '🔴';
        if (products.length === 0) {
            document.getElementById('menu-grid').innerHTML = `
                <div class='error-message'>
                    <p>📋 Menu is loading...</p>
                    <p>Please refresh the page.</p>
                </div>`;
        } else {
            showToast("⚠️ Could not refresh. Showing last known stock.");
        }
    }
}

// ============================================
// RENDER HERO CAROUSEL
// ============================================
function renderHeroCarousel() {
    const container = document.getElementById('hero-carousel');
    if (!container) return;
    if (banners.length === 0) { container.innerHTML = ''; return; }

    if (carouselInterval) { clearInterval(carouselInterval); carouselInterval = null; }
    currentSlide = 0;

    container.innerHTML = `
        <div class="carousel-container">
            <div class="carousel-slides" id="carousel-slides">
                ${banners.map(b => `
                    <div class="carousel-slide">
                        <img src="${b.image}" alt="${b.alt}" onerror="this.src='https://placehold.co/600x200?text=Sky+Sweet+Treats'">
                    </div>`).join('')}
            </div>
            ${banners.length > 1 ? `
                <button class="carousel-btn prev" id="carousel-prev">❮</button>
                <button class="carousel-btn next" id="carousel-next">❯</button>
                <div class="carousel-dots" id="carousel-dots">
                    ${banners.map((_, i) => `<span class="carousel-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></span>`).join('')}
                </div>` : ''}
        </div>`;

    if (banners.length > 1) setupCarousel();
}

// ============================================
// SETUP CAROUSEL
// ============================================
function setupCarousel() {
    const slides = document.getElementById('carousel-slides');
    const prevBtn = document.getElementById('carousel-prev');
    const nextBtn = document.getElementById('carousel-next');
    const dots = document.querySelectorAll('.carousel-dot');
    let startX, isDragging = false;

    function updateSlide(index) {
        if (index < 0) index = banners.length - 1;
        if (index >= banners.length) index = 0;
        currentSlide = index;
        slides.style.transform = `translateX(-${currentSlide * 100}%)`;
        dots.forEach((d, i) => d.classList.toggle('active', i === currentSlide));
    }

    carouselInterval = setInterval(() => updateSlide(currentSlide + 1), 5000);

    prevBtn?.addEventListener('click', () => { updateSlide(currentSlide - 1); resetCarouselTimer(updateSlide); });
    nextBtn?.addEventListener('click', () => { updateSlide(currentSlide + 1); resetCarouselTimer(updateSlide); });
    dots.forEach(dot => dot.addEventListener('click', e => { updateSlide(parseInt(e.target.dataset.index)); resetCarouselTimer(updateSlide); }));

    slides.addEventListener('touchstart', e => { startX = e.touches[0].clientX; isDragging = true; clearInterval(carouselInterval); }, { passive: true });
    slides.addEventListener('touchmove', e => { if (isDragging) e.preventDefault(); }, { passive: false });
    slides.addEventListener('touchend', e => {
        if (!isDragging) return;
        const deltaX = e.changedTouches[0].clientX - startX;
        if (Math.abs(deltaX) > 50) updateSlide(deltaX > 0 ? currentSlide - 1 : currentSlide + 1);
        isDragging = false;
        carouselInterval = setInterval(() => updateSlide(currentSlide + 1), 5000);
    });

    window.addEventListener('resize', () => { slides.style.transform = `translateX(-${currentSlide * 100}%)`; });
}

function resetCarouselTimer(updateSlide) {
    clearInterval(carouselInterval);
    carouselInterval = setInterval(() => updateSlide(currentSlide + 1), 5000);
}

// ============================================
// RENDER SHIPPING DROPDOWN
// ============================================
function renderShippingDropdown(shippingOptions) {
    const select = document.getElementById('shipping-address');
    if (!select) return;

    const sorted = [...shippingOptions].sort((a, b) => {
        const getSecondWord = str => { const p = str.split(' '); return p.length > 1 ? p[1] : str; };
        return getSecondWord(a.name).localeCompare(getSecondWord(b.name));
    });

    select.innerHTML = `<option value="" disabled selected>Select your barangay/sitio</option>` +
        sorted.map(opt => `<option value="${opt.name}|${opt.fee.toFixed(2)}">${opt.name}</option>`).join('');
}

// ============================================
// ANNOUNCEMENT MODAL
// ============================================
function showAnnouncementModal(dismissOnClose = false) {
    if (!currentAnnouncement) return null;

    const modal = document.createElement('div');
    modal.className = 'announcement-modal';
    modal.innerHTML = `
        <div class="announcement-content">
            <div class="announcement-header">
                <h3>📢 ${currentAnnouncement.title}</h3>
                <button class="announcement-close">✕</button>
            </div>
            <div class="announcement-body">
                <p>${currentAnnouncement.message.replace(/\n/g, '<br>')}</p>
            </div>
        </div>`;
    document.body.appendChild(modal);

    const closeHandler = () => {
        modal.remove();
        if (dismissOnClose) {
            announcementDismissed = true;
            sessionStorage.setItem('announcementDismissed', 'true');
        }
    };

    modal.querySelector('.announcement-close').addEventListener('click', closeHandler);
    modal.addEventListener('click', e => { if (e.target === modal) closeHandler(); });
    return modal;
}

function showAnnouncementIfNeeded() {
    if (!currentAnnouncement) {
        if (announcementIcon) announcementIcon.style.display = 'none';
        return;
    }
    if (!announcementIcon) announcementIcon = document.getElementById('announcement-icon');
    if (announcementIcon) announcementIcon.style.display = 'inline-block';
    if (announcementDismissed || sessionStorage.getItem('announcementDismissed')) return;
    showAnnouncementModal(true);
}

window.showAnnouncementManually = function() {
    if (!currentAnnouncement) { showToast("No announcement at this time"); return; }
    showAnnouncementModal(false);
};

// ============================================
// ORDER TYPE TOGGLE (new button UI)
// ============================================
window.selectOrderType = function(value, btn) {
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const select = document.getElementById('order-type');
    if (select) select.value = value;
    toggleDeliveryFields();
};

// ============================================
// PAYMENT SELECTION (new card UI)
// ============================================
window.selectPayment = function(value) {
    const select = document.getElementById('payment-method');
    if (select) select.value = value;
    toggleGcashInfo();
};

// ============================================
// TOGGLE AMOUNT INPUT BASED ON EXACT AMOUNT RADIO
// ============================================
window.toggleAmountInput = function() {
    const exactNo = document.querySelector('input[name="exact-amount"][value="no"]');
    const amountContainer = document.getElementById('amount-input-container');
    const changeContainer = document.getElementById('change-due-container');
    const amountInput = document.getElementById('customer-amount');

    if (exactNo && exactNo.checked) {
        amountContainer.style.display = 'block';
        changeContainer.style.display = 'flex';
        amountInput.required = true;
    } else {
        amountContainer.style.display = 'none';
        changeContainer.style.display = 'none';
        amountInput.required = false;
        amountInput.value = '';
    }
    updateChangeDue();
    updateCheckoutSummary();
};

// ============================================
// UPDATE CHANGE DUE
// ============================================
window.updateChangeDue = function() {
    const amountInput = document.getElementById('customer-amount');
    const changeSpan = document.getElementById('change-due-amount');
    const total = getTotal();

    if (amountInput && amountInput.value) {
        const amount = parseFloat(amountInput.value);
        changeSpan.textContent = (!isNaN(amount) && amount >= total)
            ? `₱${(amount - total).toFixed(2)}`
            : `₱0.00`;
    } else {
        changeSpan.textContent = `₱0.00`;
    }
    updateCheckoutSummary();
};

// ============================================
// RESET EXACT AMOUNT SELECTION
// ============================================
function resetExactAmount() {
    document.querySelectorAll('input[name="exact-amount"]').forEach(r => r.checked = false);
    const amountContainer = document.getElementById('amount-input-container');
    const changeContainer = document.getElementById('change-due-container');
    const amountInput = document.getElementById('customer-amount');
    if (amountContainer) amountContainer.style.display = 'none';
    if (changeContainer) changeContainer.style.display = 'none';
    if (amountInput) { amountInput.value = ''; amountInput.required = false; }
    updateChangeDue();
}

// ============================================
// TOGGLE DELIVERY FIELDS
// ============================================
window.toggleDeliveryFields = function() {
    const orderType = document.getElementById('order-type').value;
    const shippingGroup = document.getElementById('shipping-group');
    const landmarkGroup = document.getElementById('landmark-group');
    const landmarkField = document.getElementById('customer-address');

    const isDelivery = orderType === 'Delivery';
    shippingGroup.style.display = isDelivery ? 'block' : 'none';
    landmarkGroup.style.display = isDelivery ? 'block' : 'none';
    landmarkField.required = isDelivery;

    if (!isDelivery) {
        selectedShippingAddress = '';
        selectedShippingFee = 0;
        const shippingSelect = document.getElementById('shipping-address');
        if (shippingSelect) shippingSelect.value = '';
        const feeDisplay = document.getElementById('shipping-fee-display');
        if (feeDisplay) feeDisplay.innerHTML = '';
        updateUI();
    }

    // Sync payment options visibility
    const codOption = document.querySelector('.payment-card input[value="COD"]');
    const copOption = document.querySelector('.payment-card input[value="COP"]');
    const codCard = codOption?.closest('.payment-card');
    const copCard = copOption?.closest('.payment-card');

    if (isDelivery) {
        if (codCard) codCard.style.display = 'flex';
        if (copCard) copCard.style.display = 'none';
        if (document.getElementById('payment-method').value === 'COP') {
            document.getElementById('payment-method').value = 'COD';
            const codRadio = document.querySelector('input[name="payment-radio"][value="COD"]');
            if (codRadio) codRadio.checked = true;
            toggleGcashInfo();
        }
    } else {
        if (codCard) codCard.style.display = 'none';
        if (copCard) copCard.style.display = 'flex';
        if (document.getElementById('payment-method').value === 'COD') {
            document.getElementById('payment-method').value = 'COP';
            const copRadio = document.querySelector('input[name="payment-radio"][value="COP"]');
            if (copRadio) copRadio.checked = true;
            toggleGcashInfo();
        }
    }
};

// ============================================
// TOGGLE GCASH INFO
// ============================================
function toggleGcashInfo() {
    const isGcash = document.getElementById('payment-method').value === 'GCASH';
    const gcashInfo = document.getElementById('gcash-info');
    const exactGroup = document.getElementById('exact-amount-group');

    gcashInfo.style.display = isGcash ? 'block' : 'none';
    resetExactAmount();
    exactGroup.style.display = isGcash ? 'none' : 'block';

    if (isGcash) showToast("📱 GCash selected — exact amount not needed", 3000);
}

// ============================================
// RENDER CATEGORIES + MENU + SCROLL SPY
// ============================================
function renderCategoriesAndMenu() {
    const categoryMap = new Map();
    products.forEach(prod => {
        const cat = prod.category || 'Uncategorized';
        if (!categoryMap.has(cat)) categoryMap.set(cat, []);
        categoryMap.get(cat).push(prod);
    });

    const tabsContainer = document.getElementById('category-tabs');
    tabsContainer.innerHTML = [...categoryMap.keys()].map(category => {
        const safeId = category.replace(/\s+/g, '-').toLowerCase();
        return `<button class="category-tab" data-category="${safeId}">${category}</button>`;
    }).join('');

    const tabMap = new Map();
    document.querySelectorAll('.category-tab').forEach(tab => tabMap.set(tab.dataset.category, tab));

    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const categoryId = this.dataset.category;
            const heading = document.getElementById(`cat-${categoryId}`);
            if (heading) {
                const header = document.querySelector('.app-header');
                const tabs = document.querySelector('.category-tabs-wrapper');
                const freshBar = document.querySelector('.freshness-bar');
                const offset = (freshBar?.offsetHeight || 0) + (header?.offsetHeight || 0) + (tabs?.offsetHeight || 0) + 15;
                const y = heading.getBoundingClientRect().top + window.scrollY - offset;
                window.scrollTo({ top: y, behavior: 'smooth' });
            }
            document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            window.lastActiveCategory = categoryId;
        });
    });

    const grid = document.getElementById('menu-grid');
    const categoryBoundaries = [];
    let gridHtml = '';

    categoryMap.forEach((productsInCat, category) => {
        const safeId = category.replace(/\s+/g, '-').toLowerCase();
        gridHtml += `<div id="cat-${safeId}" class="category-heading">${category}</div>`;
        productsInCat.forEach((prod, index) => {
            gridHtml += prod.has_flavors && prod.variant_option.length > 0
                ? renderFlavorProductCard(prod)
                : renderSimpleProductCard(prod);
            if (index === productsInCat.length - 1) {
                gridHtml += `<div id="end-${safeId}" class="category-end"></div>`;
            }
        });
    });

    grid.innerHTML = gridHtml;

    categoryMap.forEach((_, category) => {
        const safeId = category.replace(/\s+/g, '-').toLowerCase();
        const heading = document.getElementById(`cat-${safeId}`);
        const endMarker = document.getElementById(`end-${safeId}`);
        if (heading && endMarker) {
            categoryBoundaries.push({ id: safeId, headingEl: heading, endEl: endMarker, tab: tabMap.get(safeId) });
        }
    });

    let activeCategoryId = window.lastActiveCategory || null;

    function updateActiveTab(categoryId) {
        if (!categoryId || activeCategoryId === categoryId) return;
        const tab = tabMap.get(categoryId);
        if (tab) {
            document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeCategoryId = categoryId;
            window.lastActiveCategory = categoryId;
        }
    }

    function onScroll() {
        const freshBar = document.querySelector('.freshness-bar');
        const header = document.querySelector('.app-header');
        const tabs = document.querySelector('.category-tabs-wrapper');
        const stickyBottom = (freshBar?.offsetHeight || 0) + (header?.offsetHeight || 0) + (tabs?.offsetHeight || 0);

        let activeId = null;
        for (let i = categoryBoundaries.length - 1; i >= 0; i--) {
            const b = categoryBoundaries[i];
            if (b.headingEl.getBoundingClientRect().top <= stickyBottom + 10) {
                activeId = b.id;
                break;
            }
        }
        if (!activeId && categoryBoundaries.length > 0) activeId = categoryBoundaries[0].id;
        if (activeId) updateActiveTab(activeId);
    }

    if (window.scrollListenerAttached) window.removeEventListener('scroll', window.scrollHandler);
    let ticking = false;
    window.scrollHandler = function() {
        if (!ticking) { window.requestAnimationFrame(() => { onScroll(); ticking = false; }); ticking = true; }
    };
    window.scrollListenerAttached = true;
    window.addEventListener('scroll', window.scrollHandler);

    setTimeout(() => {
        onScroll();
        if (categoryBoundaries.length > 0 && !activeCategoryId) updateActiveTab(categoryBoundaries[0].id);
    }, 100);
}

// ============================================
// STOCK BADGE HELPER
// ============================================
function getStockBadge(p) {
    if (p.stock <= 0) return `<span class="tag sold-out">⛔ Sold Out</span>`;
    if (p.stock <= 5) return `<span class="tag low-stock">⚠️ Only ${p.stock} left!</span>`;
    return `<span class="tag available">✅ In Stock</span>`;
}

// ============================================
// RENDER SIMPLE PRODUCT CARD
// ============================================
function renderSimpleProductCard(p) {
    const isSoldOut = p.stock <= 0;
    const badgeHtml = p.badge
        ? `<span class="product-badge badge-${p.badge.toLowerCase().replace(/\s+/g, '-')}">${p.badge}</span>` : '';
    const detailsHtml = p.details
        ? `<div class="product-details-text">${p.details.split(',').map(l => l.trim()).filter(l => l).map(l => `<span>${l}</span>`).join('')}</div>` : '';

    return `
        <div class="product-card ${isSoldOut ? 'sold-out-gray' : ''}" data-product-id="${p.id}">
            <div class="product-image-container">
                <img src="${p.image}" class="product-image" loading="lazy" onerror="this.src='https://placehold.co/300x300?text=🍰'">
                ${badgeHtml}
            </div>
            <div class="product-details">
                <div class="product-info">
                    <h3>${p.name}</h3>
                    ${getStockBadge(p)}
                    <span class="price">₱${p.price.toFixed(2)}</span>
                    ${detailsHtml}
                </div>
                ${isSoldOut
                    ? `<button class="add-btn disabled" disabled>⛔ Sold Out</button>`
                    : `<button class="add-btn" onclick="addSimpleToCart('${p.id}', event)">+ Add to Cart</button>`}
            </div>
        </div>`;
}

// ============================================
// RENDER FLAVOR PRODUCT CARD
// ============================================
function renderFlavorProductCard(p) {
    const isSoldOut = p.stock <= 0;
    const dropdownId = `flavor-select-${p.id}`;
    const badgeHtml = p.badge
        ? `<span class="product-badge badge-${p.badge.toLowerCase().replace(/\s+/g, '-')}">${p.badge}</span>` : '';
    const detailsHtml = p.details
        ? `<div class="product-details-text">${p.details.split(',').map(l => l.trim()).filter(l => l).map(l => `<span>${l}</span>`).join('')}</div>` : '';

    const options = `<option value="" disabled selected class="placeholder-option">Choose flavor</option>` +
        p.variant_option.map(flavor => {
            const unavail = p.unavailable_flavors?.includes(flavor);
            return `<option value="${flavor}" ${unavail ? 'disabled' : ''}>${unavail ? flavor + ' (unavailable)' : flavor}</option>`;
        }).join('');

    return `
        <div class="product-card product-card-variant ${isSoldOut ? 'sold-out-gray' : ''}" data-product-id="${p.id}">
            <div class="product-image-container">
                <img src="${p.image}" class="product-image" loading="lazy" onerror="this.src='https://placehold.co/300x300?text=🍰'">
                ${badgeHtml}
            </div>
            <div class="product-details">
                <div class="product-info">
                    <h3>${p.name}</h3>
                    ${getStockBadge(p)}
                    <span class="price">₱${p.price.toFixed(2)}</span>
                    ${detailsHtml}
                    <div class="variant-selector">
                        <select id="${dropdownId}" class="variant-dropdown" ${isSoldOut ? 'disabled' : ''}>
                            ${options}
                        </select>
                    </div>
                </div>
                ${isSoldOut
                    ? `<button class="add-btn disabled" disabled>⛔ Sold Out</button>`
                    : `<button class="add-btn" onclick="addFlavorToCart('${p.id}', '${dropdownId}', event)">+ Add to Cart</button>`}
            </div>
        </div>`;
}

// ============================================
// ADD TO CART: SIMPLE
// ============================================
window.addSimpleToCart = (id, event) => {
    const p = products.find(x => x.id === id);
    if (!p) return showToast("❌ Product not available");
    if (event) animateAddToCart(event.currentTarget, p.image);

    const existing = cart.find(x => x.id === id);
    if (existing) {
        if (existing.qty >= p.stock) return showToast(`⚠️ Only ${p.stock} ${p.name} available!`);
        existing.qty++;
    } else {
        if (p.stock <= 0) return showToast("⛔ Sold out!");
        cart.push({ ...p, qty: 1 });
    }
    updateUI();
    showToast(`✅ ${p.name} added`);
    animateCart();
};

// ============================================
// ADD TO CART: FLAVOR
// ============================================
window.addFlavorToCart = (productId, dropdownId, event) => {
    const product = products.find(x => x.id === productId);
    if (!product) return showToast("❌ Product not available");
    if (product.stock <= 0) return showToast("⛔ Sold out!");

    const select = document.getElementById(dropdownId);
    if (!select) return showToast("❌ Selector not found");

    const selectedFlavor = select.value;
    if (!selectedFlavor) { showToast("⚠️ Please choose a flavor first!", 3000); return; }
    if (product.unavailable_flavors?.includes(selectedFlavor)) {
        showToast(`❌ ${selectedFlavor} is not available`, 3000);
        return;
    }

    if (event) animateAddToCart(event.currentTarget, product.image);

    const variantId = `${productId}-${selectedFlavor.replace(/\s+/g, '-')}`;
    const variantName = `${product.name} (${selectedFlavor})`;
    const existing = cart.findIndex(item => item.id === variantId);

    if (existing !== -1) {
        if (cart[existing].qty >= product.stock) return showToast(`⚠️ Only ${product.stock} available!`);
        cart[existing].qty++;
    } else {
        cart.push({ id: variantId, name: variantName, price: product.price, image: product.image, stock: product.stock, parentId: product.id, flavor: selectedFlavor, qty: 1 });
    }

    updateUI();
    showToast(`✅ ${variantName} added`);
    animateCart();
};

// ============================================
// CART & TOTAL HELPERS
// ============================================
function getSubtotal() { return cart.reduce((s, i) => s + i.price * i.qty, 0); }
function getTotal()    { return getSubtotal() + selectedShippingFee; }

function updateUI() {
    const totalQty = cart.reduce((s, i) => s + i.qty, 0);
    const total    = getTotal();

    document.getElementById('cart-count').textContent  = totalQty;
    document.getElementById('float-total').textContent  = `₱${total.toFixed(2)}`;
    document.getElementById('modal-total').textContent  = `₱${total.toFixed(2)}`;

    const cartContainer = document.getElementById('cart-items');
    cartContainer.innerHTML = cart.length === 0
        ? `<div class="empty-cart"><p>🛒 Your cart is empty</p><p class="empty-hint">Add some sweet treats! 🍰</p></div>`
        : cart.map(i => `
            <div class="cart-item">
                <div class="cart-item-info">
                    <strong>${i.name}</strong>
                    <small>₱${i.price.toFixed(2)} each</small>
                </div>
                <div class="cart-item-controls">
                    <button class="qty-btn minus" onclick="changeQty('${i.id}', -1)">−</button>
                    <span class="qty-display">${i.qty}</span>
                    <button class="qty-btn plus"  onclick="changeQty('${i.id}', 1)">+</button>
                </div>
            </div>`).join('');

    if (document.getElementById('checkout-modal').classList.contains('active')) updateCheckoutSummary();
}

window.changeQty = (id, delta) => {
    const idx  = cart.findIndex(i => i.id === id);
    if (idx === -1) return;
    const item    = cart[idx];
    const product = item.parentId ? products.find(p => p.id === item.parentId) : products.find(p => p.id === item.id);

    if (!product) { cart.splice(idx, 1); updateUI(); return; }

    if (delta > 0) {
        if (item.qty >= product.stock) return showToast(`⚠️ Only ${product.stock} ${item.name} available!`);
        item.qty += delta;
    } else {
        item.qty += delta;
        if (item.qty <= 0) cart.splice(idx, 1);
    }
    updateUI();
};

// ============================================
// SHIPPING FEE HANDLER
// ============================================
window.updateShippingFee = function() {
    const select = document.getElementById('shipping-address');
    const feeDisplay = document.getElementById('shipping-fee-display');

    if (feeDisplay) { feeDisplay.innerHTML = ''; feeDisplay.classList.add('loading'); }

    setTimeout(() => {
        if (select.value) {
            const [address, feeStr] = select.value.split('|');
            selectedShippingAddress = address;
            selectedShippingFee = parseFloat(feeStr);
        } else {
            selectedShippingAddress = '';
            selectedShippingFee = 0;
        }

        if (feeDisplay) {
            feeDisplay.classList.remove('loading');
            feeDisplay.innerHTML = selectedShippingFee > 0 ? `+₱${selectedShippingFee.toFixed(2)}` : '';
        }

        animateTotalUpdate();
        updateUI();
        if (document.getElementById('checkout-modal').classList.contains('active')) updateCheckoutSummary();
    }, 300);
};

function animateTotalUpdate() {
    [document.getElementById('float-total'), document.getElementById('modal-total')].forEach(el => {
        if (el) { el.classList.add('total-update'); setTimeout(() => el.classList.remove('total-update'), 400); }
    });
}

function updateCheckoutSummary() {
    const total      = getTotal();
    const shippingEl = document.getElementById('shipping-summary');
    const exactNo    = document.querySelector('input[name="exact-amount"][value="no"]');
    const amountInput = document.getElementById('customer-amount');

    let changeHtml = '';
    if (exactNo?.checked && amountInput?.value) {
        const amount = parseFloat(amountInput.value);
        if (!isNaN(amount) && amount >= total) {
            changeHtml = `
                <div class="shipping-line" style="font-weight:700; color:#15803D; margin-top:8px;">
                    <span>🔄 Imo kambyo:</span>
                    <span>₱${(amount - total).toFixed(2)}</span>
                </div>`;
        }
    }

    const isDelivery = document.getElementById('order-type').value === 'Delivery';
    if (selectedShippingAddress && isDelivery) {
        shippingEl.innerHTML = `
            <div class="shipping-line" style="font-weight:600; color:var(--coral);">
                <span>🚚 Shipping (${selectedShippingAddress})</span>
                <span>₱${selectedShippingFee.toFixed(2)}</span>
            </div>
            <div class="shipping-line" style="font-weight:800; font-size:0.95rem; margin-top:6px;">
                <span>Total</span>
                <span>₱${total.toFixed(2)}</span>
            </div>
            ${changeHtml}`;
    } else {
        shippingEl.innerHTML = changeHtml;
    }

    document.getElementById('final-summary-text').innerHTML = cart.map(i =>
        `<div class="summary-item">
            <span>${i.qty}× ${i.name}</span>
            <span>₱${(i.price * i.qty).toFixed(2)}</span>
        </div>`
    ).join('');
}

// ============================================
// VALIDATE CART AGAINST STOCK
// ============================================
function validateCartAgainstNewStock() {
    let changed = false;
    const removed = [];
    for (let i = cart.length - 1; i >= 0; i--) {
        const item = cart[i];
        const prodId = item.parentId || item.id;
        const prod   = products.find(p => p.id === prodId);
        if (!prod || prod.stock <= 0) {
            removed.push(item.name);
            cart.splice(i, 1);
            changed = true;
        } else if (item.qty > prod.stock) {
            item.qty = prod.stock;
            changed = true;
            showToast(`⚠️ ${item.name} qty reduced to ${prod.stock}`);
        }
    }
    if (changed) {
        updateUI();
        if (removed.length) showToast(`❌ ${removed.length} item(s) removed — no longer available`, 4000);
    }
}

// ============================================
// CHECKOUT
// ============================================
window.openCheckout = () => {
    if (cart.length === 0) return showToast("🛒 Add some treats first!");
    toggleDeliveryFields();
    document.getElementById('cart-modal').classList.remove('active');
    document.getElementById('checkout-modal').classList.add('active');
    updateCheckoutSummary();
};

// ============================================
// BUILD ORDER TEXT
// ============================================
function buildOrderText() {
    const name     = document.getElementById('customer-name').value.trim();
    const landmark = document.getElementById('customer-address').value.trim();
    const type     = document.getElementById('order-type').value;
    const pay      = document.getElementById('payment-method').value;

    if (pay !== 'GCASH') {
        const exactAmountRadio = document.querySelector('input[name="exact-amount"]:checked');
        if (!exactAmountRadio) { showToast("💰 Please indicate if you have exact amount"); return null; }
    }

    let exactDisplay = '';
    let customerAmount = null;
    let changeDue = null;

    if (pay === 'GCASH') {
        exactDisplay = 'N/A (GCash)';
    } else {
        const exactAmountRadio = document.querySelector('input[name="exact-amount"]:checked');
        exactDisplay = exactAmountRadio.value === 'yes' ? 'Yes, exact amount akon ibayad' : 'No, kalambyuhan akon ibayad';

        if (exactAmountRadio.value === 'no') {
            const amountInput = document.getElementById('customer-amount');
            if (!amountInput.value || isNaN(parseFloat(amountInput.value))) {
                showToast("💵 Please enter the amount you will pay");
                return null;
            }
            customerAmount = parseFloat(amountInput.value);
            const total = getTotal();
            if (customerAmount < total) { showToast(`💵 Amount must be at least ₱${total.toFixed(2)}`); return null; }
            changeDue = customerAmount - total;
        }
    }

    if (!name) { showToast("👤 Please enter your name"); return null; }
    if (type === 'Delivery') {
        if (!selectedShippingAddress) { showToast("📍 Please select your shipping address"); return null; }
        if (!landmark) { showToast("🗺️ Please provide a landmark"); return null; }
    }

    const subtotal = getSubtotal();
    const total    = getTotal();
    const now      = new Date();
    const dateStr  = now.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr  = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });

    let paymentDisplay = pay === 'COD' ? 'Cash on Delivery' : pay === 'COP' ? 'Cash on Pickup' : 'GCash';

    let text = `✨ SKY SWEET TREATS ✨\n`;
    text += `════════════════\n`;
    text += `📋 ORDER RECEIPT\n`;
    text += `📅 ${dateStr}\n`;
    text += `⏰ ${timeStr}\n`;
    text += `🆔 #${Date.now().toString().slice(-6)}\n`;
    text += `════════════════\n`;
    text += `👤 CUSTOMER DETAILS\n`;
    text += `• Name: ${name}\n`;
    if (type === 'Delivery') {
        text += `• Shipping Address: ${selectedShippingAddress}\n`;
        text += `• Landmark: ${landmark}\n`;
    }
    text += `• Order Type: ${type}\n`;
    text += `• Payment: ${paymentDisplay}\n`;
    text += `• Sakto imo ibayad? ${exactDisplay}\n`;
    if (customerAmount !== null) {
        text += `• Ibayad mo: ₱${customerAmount.toFixed(2)}\n`;
        text += `• Kambyo: ₱${changeDue.toFixed(2)}\n`;
    }
    text += `\n`;
    if (type === 'Delivery' && selectedShippingAddress) {
        text += `🚚 SHIPPING\n• Fee: ₱${selectedShippingFee.toFixed(2)}\n\n`;
    }
    text += `════════════════\n`;
    text += `🛒 ORDER ITEMS\n`;
    cart.forEach(i => { text += `• ${i.qty}x ${i.name} = ₱${(i.price * i.qty).toFixed(2)}\n`; });
    text += `════════════════\n`;
    text += `💰 PAYMENT SUMMARY\n`;
    text += `• Subtotal: ₱${subtotal.toFixed(2)}\n`;
    if (type === 'Delivery' && selectedShippingFee > 0) text += `• Shipping: ₱${selectedShippingFee.toFixed(2)}\n`;
    text += `• Total: ₱${total.toFixed(2)}\n`;
    if (customerAmount !== null) {
        text += `• Ibayad mo: ₱${customerAmount.toFixed(2)}\n`;
        text += `• Kambyo: ₱${changeDue.toFixed(2)}\n`;
    }
    text += `════════════════\n`;
    if (pay === 'GCASH') {
        text += `💳 GCASH PAYMENT\n`;
        text += `1. Send to: ${CONFIG.businessPhone}\n`;
        text += `2. Account: K** M.\n`;
        text += `3. Send SCREENSHOT of receipt\n`;
        text += `4. Order processed after confirmation\n`;
        text += `════════════════\n`;
    }
    text += `📞 CONTACT\n`;
    text += `• Messenger: Sky Sweet Treats Page\n`;
    text += `• Phone: ${CONFIG.businessPhone}\n`;
    text += `• Hours: ${CONFIG.businessHours}\n`;
    text += `════════════════\n`;
    text += `Thank you for your order! 🎉\nWe'll contact you within 5–10 minutes.`;

    return text;
}

// ============================================
// SEND TO MESSENGER
// ============================================
window.sendToMessenger = function() {
    const text = buildOrderText();
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => {});
    window.open(`${CONFIG.messengerUrl}?text=${encodeURIComponent(text)}`, '_blank');
    showToast("📱 Messenger opened – message pre-filled!", 3000);
};

// ============================================
// UI HELPERS
// ============================================
window.closeModal = (id) => document.getElementById(id).classList.remove('active');

window.downloadQR = function() {
    const qrImage = document.getElementById('qr-image-el');
    if (!qrImage?.src) { showToast("❌ QR code not found"); return; }
    showToast("📥 Downloading...", 0);
    try {
        const a = document.createElement('a');
        a.href = qrImage.src;
        a.download = 'gcash-qr.jpg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => showToast("✅ QR saved!", 2000), 500);
    } catch(e) {
        window.open(qrImage.src, '_blank');
        showToast("📱 Long-press to save QR", 4000);
    }
};

function showToast(message, duration = 2500) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    if (duration > 0) {
        window.toastTimeout = setTimeout(() => toast.classList.remove('show'), duration);
    }
}

// ============================================
// ANIMATION HELPERS
// ============================================
function animateAddToCart(button, imageSrc) {
    if (!button) return;
    const cartBtn = document.getElementById('open-cart-btn');
    const bRect = button.getBoundingClientRect();
    const cRect = cartBtn.getBoundingClientRect();
    const startX = bRect.left + bRect.width / 2;
    const startY = bRect.top + bRect.height / 2;
    const endX   = cRect.left + cRect.width / 2;
    const endY   = cRect.top + cRect.height / 2;

    for (let i = 0; i < 3; i++) {
        setTimeout(() => {
            createFlyingImage(imageSrc || 'https://placehold.co/300x300?text=🍰',
                startX + Math.random() * 16 - 8,
                startY + Math.random() * 16 - 8,
                endX, endY);
        }, i * 90);
    }
}

function createFlyingImage(src, startX, startY, endX, endY) {
    const el = document.createElement('div');
    el.className = 'flying-item';
    el.style.cssText = `left:${startX}px; top:${startY}px; position:fixed; width:50px; height:50px; border-radius:50%; z-index:9999; pointer-events:none; transition:all 0.75s cubic-bezier(0.68,-0.55,0.265,1.55); border:2px solid #fff; overflow:hidden; box-shadow:0 6px 20px rgba(0,0,0,0.2);`;
    el.innerHTML = `<img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="">`;
    document.body.appendChild(el);
    el.offsetWidth;
    el.style.transform = `translate(${endX - startX}px, ${endY - startY}px) scale(0.1)`;
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 800);
}

function animateCart() {
    const cartCount = document.getElementById('cart-count');
    if (!cartCount) return;
    cartCount.style.transform = 'scale(1.5)';
    cartCount.style.background = '#F59E0B';
    setTimeout(() => {
        cartCount.style.transform = 'scale(1)';
        setTimeout(() => cartCount.style.background = '', 300);
    }, 250);
}

// ============================================
// REFRESH PROMPT
// ============================================
function showRefreshPrompt() {
    if (refreshPromptCount >= MAX_REFRESH_PROMPTS) return;
    const prompt = document.createElement('div');
    prompt.className = 'refresh-prompt';
    prompt.innerHTML = `
        <div class="refresh-prompt-content">
            <span class="refresh-icon">🔄</span>
            <div class="refresh-text">
                <strong>Stock may have changed!</strong>
                <small>Tap to get the latest</small>
            </div>
            <button class="refresh-now-btn" onclick="handleRefreshClick()">Check Now</button>
            <button class="refresh-close-btn" onclick="this.closest('.refresh-prompt').remove()">✕</button>
        </div>`;
    document.body.prepend(prompt);
    refreshPromptCount++;
}

window.handleRefreshClick = function() {
    loadProducts(true);
    document.querySelectorAll('.refresh-prompt').forEach(el => el.remove());
};

window.forceStockRefresh = function() {
    loadProducts(true);
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    loadProducts(false);
    startAutoRefresh();

    document.getElementById('open-cart-btn').onclick = () => {
        document.getElementById('cart-modal').classList.add('active');
    };

    setTimeout(showRefreshPrompt, 12000);

    toggleDeliveryFields();
    toggleGcashInfo();

    selectedShippingAddress = '';
    selectedShippingFee = 0;

    // Field focus highlights
    ['customer-name', 'customer-address', 'customer-amount'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', function() {
            this.style.borderColor = this.value.trim() ? 'var(--coral)' : '';
        });
    });
});

// Admin shortcut: Ctrl+Shift+R
document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        loadProducts(true);
        showToast('🔄 Manual refresh triggered');
    }
});
