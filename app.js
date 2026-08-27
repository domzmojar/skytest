const CONFIG = {
    currency: "₱",
    messengerUrl: "https://m.me/100089330907916",
    sheetUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRBquyZXkcMOzDv_14qyXq7sQvxqQ6k1l6tWZsiqspZ_mgl88Lqx08h3wUVYu9W9-MIP-ja5f-Yvtsj/pub?gid=1109857950&single=true&output=csv",
    businessPhone: "09264569430",
    businessHours: "8:00 AM - 9:00 PM"
};

let products = [];
let cart = [];
let hasCopied = false; // kept for backward compatibility, but copy button removed
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
// CONVERT GOOGLE DRIVE LINK TO THUMBNAIL URL
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
// LOAD PRODUCTS + ANNOUNCEMENT + SHIPPING OPTIONS + BANNERS
// ============================================
async function loadProducts(showToastOnSuccess = true) {
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

            if (id === 'ANNOUNCE') {
                announcementRow = cols;
            } else if (id === 'DIST') {
                distanceRows.push(cols);
            } else if (id === 'BANNER') {
                bannerRows.push(cols);
            } else if (id !== 'id') {
                allProducts.push(cols);
            }
        });

        if (announcementRow) {
            const title = announcementRow[1]?.trim();
            const message = announcementRow[5]?.trim();
            const status = announcementRow[6]?.trim();
            if (status && status.toLowerCase() === 'active' && title && message) {
                currentAnnouncement = { title, message };
            } else {
                currentAnnouncement = null;
            }
        } else {
            currentAnnouncement = null;
        }

        const shippingOptions = distanceRows.map(cols => ({
            name: cols[1]?.trim(),
            fee: parseFloat(cols[4]) || 0
        })).filter(opt => opt.name && opt.fee > 0);

        if (shippingOptions.length > 0) {
            renderShippingDropdown(shippingOptions);
        }

        banners = bannerRows.map(cols => ({
            alt: cols[1]?.trim() || 'Banner',
            image: convertGoogleDriveLink(cols[11]?.trim() || '')
        })).filter(banner => banner.image);

        renderHeroCarousel();

        products = allProducts.map(cols => {
            const id = cols[0]?.trim();
            const name = cols[1]?.trim();
            const badge = cols[2]?.trim() || '';
            const category = cols[3]?.trim() || 'Uncategorized';
            const price = parseFloat(cols[4]) || 0;
            const details = cols[5]?.trim() || '';
            const status = cols[6]?.trim();
            const stock = parseInt(cols[7]) || 0;
            
            let variant_option_raw = cols[8]?.trim() || '';
            let flavorArray = variant_option_raw
                .split(',')
                .map(f => f.trim())
                .filter(f => f.length > 0);

            const has_flavors = flavorArray.length > 0;

            let unavailable_raw = cols[10]?.trim() || '';
            let unavailableArray = unavailable_raw
                .split(',')
                .map(f => f.trim())
                .filter(f => f.length > 0);

            const image = convertGoogleDriveLink(cols[11]?.trim() || '');

            return {
                id, name, badge, category, price, details, status, stock,
                variant_option: flavorArray,
                unavailable_flavors: unavailableArray,
                has_flavors,
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

        if (showToastOnSuccess) {
            showToast("🔄 Menu updated with latest stock!");
        }

    } catch (error) {
        console.error("Error loading products:", error);
        if (products.length === 0) {
            document.getElementById('menu-grid').innerHTML = `
                <div class='error-message'>
                    <p>📋 Menu is updating...</p>
                    <p>Please refresh the page.</p>
                </div>`;
        } else {
            showToast("❌ Could not update stock. Check connection.");
        }
    }
}

// ============================================
// RENDER HERO CAROUSEL
// ============================================
function renderHeroCarousel() {
    const container = document.getElementById('hero-carousel');
    if (!container) return;

    if (banners.length === 0) {
        container.innerHTML = '';
        return;
    }

    if (carouselInterval) {
        clearInterval(carouselInterval);
        carouselInterval = null;
    }

    currentSlide = 0;

    const html = `
        <div class="carousel-container">
            <div class="carousel-slides" id="carousel-slides">
                ${banners.map(banner => `
                    <div class="carousel-slide">
                        <img src="${banner.image}" alt="${banner.alt}" onerror="this.src='https://placehold.co/600x200?text=Image+Error'">
                    </div>
                `).join('')}
            </div>
            ${banners.length > 1 ? `
                <button class="carousel-btn prev" id="carousel-prev">❮</button>
                <button class="carousel-btn next" id="carousel-next">❯</button>
                <div class="carousel-dots" id="carousel-dots">
                    ${banners.map((_, i) => `<span class="carousel-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></span>`).join('')}
                </div>
            ` : ''}
        </div>
    `;
    container.innerHTML = html;

    if (banners.length > 1) {
        setupCarousel();
    }
}

// ============================================
// SETUP CAROUSEL INTERACTIONS
// ============================================
function setupCarousel() {
    const slides = document.getElementById('carousel-slides');
    const prevBtn = document.getElementById('carousel-prev');
    const nextBtn = document.getElementById('carousel-next');
    const dots = document.querySelectorAll('.carousel-dot');
    let slideWidth = slides.clientWidth;
    let startX, startY, isDragging = false;

    function updateSlide(index) {
        if (index < 0) index = banners.length - 1;
        if (index >= banners.length) index = 0;
        currentSlide = index;
        slides.style.transform = `translateX(-${currentSlide * 100}%)`;
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === currentSlide);
        });
    }

    carouselInterval = setInterval(() => {
        updateSlide(currentSlide + 1);
    }, 5000);

    if (prevBtn && nextBtn) {
        prevBtn.addEventListener('click', () => {
            updateSlide(currentSlide - 1);
            clearInterval(carouselInterval);
            carouselInterval = setInterval(() => updateSlide(currentSlide + 1), 5000);
        });
        nextBtn.addEventListener('click', () => {
            updateSlide(currentSlide + 1);
            clearInterval(carouselInterval);
            carouselInterval = setInterval(() => updateSlide(currentSlide + 1), 5000);
        });
    }

    dots.forEach(dot => {
        dot.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            updateSlide(index);
            clearInterval(carouselInterval);
            carouselInterval = setInterval(() => updateSlide(currentSlide + 1), 5000);
        });
    });

    slides.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isDragging = true;
        clearInterval(carouselInterval);
    }, { passive: true });

    slides.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
    }, { passive: false });

    slides.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        const endX = e.changedTouches[0].clientX;
        const deltaX = endX - startX;
        const threshold = 50;

        if (Math.abs(deltaX) > threshold) {
            if (deltaX > 0) {
                updateSlide(currentSlide - 1);
            } else {
                updateSlide(currentSlide + 1);
            }
        }
        isDragging = false;
        carouselInterval = setInterval(() => updateSlide(currentSlide + 1), 5000);
    });

    window.addEventListener('resize', () => {
        slideWidth = slides.clientWidth;
        slides.style.transform = `translateX(-${currentSlide * 100}%)`;
    });
}

// ============================================
// RENDER SHIPPING DROPDOWN
// ============================================
function renderShippingDropdown(shippingOptions) {
    const select = document.getElementById('shipping-address');
    if (!select) return;

    const sorted = [...shippingOptions].sort((a, b) => {
        const getSecondWord = (str) => {
            const parts = str.split(' ');
            return parts.length > 1 ? parts[1] : str;
        };
        return getSecondWord(a.name).localeCompare(getSecondWord(b.name));
    });

    let html = `<option value="" disabled selected>Select your barangay/sitio</option>`;
    sorted.forEach(opt => {
        html += `<option value="${opt.name}|${opt.fee.toFixed(2)}">${opt.name}</option>`;
    });
    select.innerHTML = html;
}

// ============================================
// SHOW ANNOUNCEMENT MODAL (core function)
// ============================================
function showAnnouncementModal(dismissOnClose = false) {
    if (!currentAnnouncement) return null;

    const modal = document.createElement('div');
    modal.className = 'announcement-modal';
    modal.innerHTML = `
        <div class="announcement-content">
            <div class="announcement-header">
                <h3>📢 ${currentAnnouncement.title}</h3>
                <button class="announcement-close">&times;</button>
            </div>
            <div class="announcement-body">
                <p>${currentAnnouncement.message.replace(/\n/g, '<br>')}</p>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('.announcement-close');
    
    const closeHandler = () => {
        modal.remove();
        if (dismissOnClose) {
            announcementDismissed = true;
            sessionStorage.setItem('announcementDismissed', 'true');
        }
    };

    closeBtn.addEventListener('click', closeHandler);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeHandler();
        }
    });

    return modal;
}

// ============================================
// AUTO ANNOUNCEMENT (once per session)
// ============================================
function showAnnouncementIfNeeded() {
    if (!currentAnnouncement) {
        if (announcementIcon) announcementIcon.style.display = 'none';
        return;
    }
    
    if (!announcementIcon) {
        announcementIcon = document.getElementById('announcement-icon');
    }
    if (announcementIcon) {
        announcementIcon.style.display = 'inline-block';
    }

    if (announcementDismissed) return;
    if (sessionStorage.getItem('announcementDismissed')) return;

    showAnnouncementModal(true);
}

// ============================================
// MANUAL ANNOUNCEMENT (via icon click)
// ============================================
window.showAnnouncementManually = function() {
    if (!currentAnnouncement) {
        showToast("No announcement at this time");
        return;
    }
    showAnnouncementModal(false);
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
        changeContainer.style.display = 'block';
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
// UPDATE CHANGE DUE BASED ON AMOUNT INPUT
// ============================================
window.updateChangeDue = function() {
    const amountInput = document.getElementById('customer-amount');
    const changeSpan = document.getElementById('change-due-amount');
    const total = getTotal();
    
    if (amountInput && amountInput.value) {
        const amount = parseFloat(amountInput.value);
        if (!isNaN(amount) && amount >= total) {
            const change = amount - total;
            changeSpan.textContent = `₱${change.toFixed(2)}`;
        } else {
            changeSpan.textContent = `₱0.00`;
        }
    } else {
        changeSpan.textContent = `₱0.00`;
    }
    updateCheckoutSummary();
};

// ============================================
// RESET EXACT AMOUNT SELECTION (used when switching payment methods)
// ============================================
function resetExactAmount() {
    const radios = document.querySelectorAll('input[name="exact-amount"]');
    const amountContainer = document.getElementById('amount-input-container');
    const changeContainer = document.getElementById('change-due-container');
    const amountInput = document.getElementById('customer-amount');
    
    // Uncheck all radios
    radios.forEach(r => r.checked = false);
    
    // Hide and clear amount input
    amountContainer.style.display = 'none';
    changeContainer.style.display = 'none';
    amountInput.value = '';
    amountInput.required = false;
    
    // Update change display
    updateChangeDue();
}

// ============================================
// TOGGLE DELIVERY FIELDS + PAYMENT OPTIONS
// ============================================
window.toggleDeliveryFields = function() {
    const orderType = document.getElementById('order-type').value;
    const shippingGroup = document.getElementById('shipping-group');
    const landmarkGroup = document.getElementById('landmark-group');
    const landmarkField = document.getElementById('customer-address');
    const paymentSelect = document.getElementById('payment-method');
    
    if (orderType === 'Delivery') {
        shippingGroup.style.display = 'block';
        landmarkGroup.style.display = 'block';
        landmarkField.required = true;
    } else {
        shippingGroup.style.display = 'none';
        landmarkGroup.style.display = 'none';
        landmarkField.required = false;
        selectedShippingAddress = '';
        selectedShippingFee = 0;
        const shippingSelect = document.getElementById('shipping-address');
        if (shippingSelect) shippingSelect.value = '';
        const feeDisplay = document.getElementById('shipping-fee-display');
        if (feeDisplay) feeDisplay.innerHTML = '';
        updateUI();
    }
    
    const codOption = paymentSelect.querySelector('option[value="COD"]');
    const copOption = paymentSelect.querySelector('option[value="COP"]');
    
    if (orderType === 'Delivery') {
        codOption.style.display = 'block';
        copOption.style.display = 'none';
        if (paymentSelect.value === 'COP') {
            paymentSelect.value = 'COD';
            toggleGcashInfo();
        }
    } else {
        codOption.style.display = 'none';
        copOption.style.display = 'block';
        if (paymentSelect.value === 'COD') {
            paymentSelect.value = 'COP';
            toggleGcashInfo();
        }
    }
};

// ============================================
// TOGGLE GCASH INFO + HIDE/SHOW EXACT AMOUNT + RESET SELECTION
// ============================================
function toggleGcashInfo() {
    const isGcash = document.getElementById('payment-method').value === 'GCASH';
    const gcashInfo = document.getElementById('gcash-info');
    const exactGroup = document.getElementById('exact-amount-group');
    
    gcashInfo.style.display = isGcash ? 'block' : 'none';
    
    // Reset exact amount selection regardless of mode (clean slate)
    resetExactAmount();
    
    if (isGcash) {
        // Hide exact amount section
        exactGroup.style.display = 'none';
        // Radios already unchecked and cleared by resetExactAmount
    } else {
        // Show exact amount section
        exactGroup.style.display = 'block';
        // Radios are unchecked; user must choose again
    }
    
    if (isGcash) showToast("💳 GCash selected – exact amount not needed", 3000);
}

// ============================================
// RENDER CATEGORY TABS + HEADINGS + PRODUCT CARDS (scroll spy)
// ============================================
function renderCategoriesAndMenu() {
    const categoryMap = new Map();
    products.forEach(prod => {
        const cat = prod.category || 'Uncategorized';
        if (!categoryMap.has(cat)) {
            categoryMap.set(cat, []);
        }
        categoryMap.get(cat).push(prod);
    });

    const tabsContainer = document.getElementById('category-tabs');
    let tabsHtml = '';
    categoryMap.forEach((_, category) => {
        const safeId = category.replace(/\s+/g, '-').toLowerCase();
        tabsHtml += `<button class="category-tab" data-category="${safeId}">${category}</button>`;
    });
    tabsContainer.innerHTML = tabsHtml;

    const tabMap = new Map();
    document.querySelectorAll('.category-tab').forEach(tab => {
        const categoryId = tab.dataset.category;
        tabMap.set(categoryId, tab);
    });

    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.addEventListener('click', function(e) {
            const categoryId = this.dataset.category;
            const heading = document.getElementById(`cat-${categoryId}`);
            if (heading) {
                const header = document.querySelector('.app-header');
                const tabs = document.querySelector('.category-tabs');
                const headerHeight = header ? header.offsetHeight : 0;
                const tabsHeight = tabs ? tabs.offsetHeight : 0;
                const offset = headerHeight + tabsHeight + 15;
                const y = heading.getBoundingClientRect().top + window.scrollY - offset;
                window.scrollTo({ top: y, behavior: 'smooth' });
            }
            document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            window.lastActiveCategory = categoryId;
        });
    });

    const grid = document.getElementById('menu-grid');
    let gridHtml = '';
    const categoryBoundaries = [];

    categoryMap.forEach((productsInCat, category) => {
        const safeId = category.replace(/\s+/g, '-').toLowerCase();
        gridHtml += `<div id="cat-${safeId}" class="category-heading">${category}</div>`;
        
        productsInCat.forEach((prod, index) => {
            if (prod.has_flavors && prod.variant_option.length > 0) {
                gridHtml += renderFlavorProductCard(prod);
            } else {
                gridHtml += renderSimpleProductCard(prod);
            }
            if (index === productsInCat.length - 1) {
                gridHtml += `<div id="end-${safeId}" class="category-end" style="height:0; opacity:0;"></div>`;
            }
        });
    });

    grid.innerHTML = gridHtml;

    categoryBoundaries.length = 0;
    categoryMap.forEach((_, category) => {
        const safeId = category.replace(/\s+/g, '-').toLowerCase();
        const heading = document.getElementById(`cat-${safeId}`);
        const endMarker = document.getElementById(`end-${safeId}`);
        if (heading && endMarker) {
            categoryBoundaries.push({
                id: safeId,
                headingEl: heading,
                endEl: endMarker,
                tab: tabMap.get(safeId)
            });
        }
    });

    let lastScrollY = window.scrollY;
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
        const header = document.querySelector('.app-header');
        const tabs = document.querySelector('.category-tabs');
        const headerHeight = header ? header.offsetHeight : 0;
        const tabsHeight = tabs ? tabs.offsetHeight : 0;
        const stickyBottom = headerHeight + tabsHeight;

        let activeId = null;
        for (let i = categoryBoundaries.length - 1; i >= 0; i--) {
            const boundary = categoryBoundaries[i];
            const headingTop = boundary.headingEl.getBoundingClientRect().top;
            if (headingTop <= stickyBottom + 10) {
                activeId = boundary.id;
                break;
            }
        }
        if (!activeId && categoryBoundaries.length > 0) {
            activeId = categoryBoundaries[0].id;
        }
        if (activeId) {
            updateActiveTab(activeId);
        }
    }

    let ticking = false;
    const scrollHandler = function() {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                onScroll();
                ticking = false;
            });
            ticking = true;
        }
    };

    if (window.scrollListenerAttached) {
        window.removeEventListener('scroll', window.scrollHandler);
    }
    window.scrollHandler = scrollHandler;
    window.scrollListenerAttached = true;
    window.addEventListener('scroll', window.scrollHandler);

    setTimeout(() => {
        const header = document.querySelector('.app-header');
        const tabs = document.querySelector('.category-tabs');
        const headerHeight = header ? header.offsetHeight : 0;
        const tabsHeight = tabs ? tabs.offsetHeight : 0;
        const stickyBottom = headerHeight + tabsHeight;
        let found = false;
        for (let i = categoryBoundaries.length - 1; i >= 0; i--) {
            const boundary = categoryBoundaries[i];
            const headingTop = boundary.headingEl.getBoundingClientRect().top;
            if (headingTop <= stickyBottom + 10) {
                updateActiveTab(boundary.id);
                found = true;
                break;
            }
        }
        if (!found && categoryBoundaries.length > 0) {
            updateActiveTab(categoryBoundaries[0].id);
        }
    }, 100);
}

// ============================================
// RENDER SIMPLE PRODUCT – with BADGE + DETAILS
// ============================================
function renderSimpleProductCard(p) {
    const isSoldOut = p.stock <= 0;
    let stockBadge = '';
    if (isSoldOut) {
        stockBadge = `<span class="tag sold-out">⛔ SOLD OUT</span>`;
    } else if (p.stock <= 5) {
        stockBadge = `<span class="tag low-stock">⚠️ Only ${p.stock} left!</span>`;
    } else {
        stockBadge = `<span class="tag available">✅ In Stock</span>`;
    }

    let badgeHtml = '';
    if (p.badge) {
        const badgeClass = `badge-${p.badge.toLowerCase().replace(/\s+/g, '-')}`;
        badgeHtml = `<span class="product-badge ${badgeClass}">${p.badge}</span>`;
    }

    let detailsHtml = '';
    if (p.details) {
        const lines = p.details.split(',').map(item => item.trim()).filter(item => item);
        detailsHtml = '<div class="product-details-text">' + 
            lines.map(line => `<span>${line}</span>`).join('') + 
            '</div>';
    }

    return `
        <div class="product-card ${isSoldOut ? 'sold-out-gray' : ''}" data-product-id="${p.id}">
            <div class="product-image-container">
                <img src="${p.image}" class="product-image" onerror="this.src='https://placehold.co/300x400?text=Sweet'">
                ${badgeHtml}
            </div>
            <div class="product-details">
                <div class="product-info">
                    <h3>${p.name}</h3>
                    ${stockBadge}
                    <span class="price">₱${p.price.toFixed(2)}</span>
                    ${detailsHtml}
                </div>
                ${isSoldOut ?
                    `<button class="add-btn disabled" disabled>⛔ Sold Out</button>` :
                    `<button class="add-btn" onclick="addSimpleToCart('${p.id}', event)">➕ Add to Cart</button>`
                }
            </div>
        </div>`;
}

// ============================================
// RENDER FLAVOR PRODUCT CARD – with BADGE + DETAILS
// ============================================
function renderFlavorProductCard(p) {
    const isSoldOut = p.stock <= 0;
    const dropdownId = `flavor-select-${p.id}`;

    let options = `<option value="" disabled selected class="placeholder-option">🍹 Choose flavor</option>`;
    p.variant_option.forEach(flavor => {
        const isUnavailable = p.unavailable_flavors && p.unavailable_flavors.includes(flavor);
        const disabledAttr = isUnavailable ? 'disabled' : '';
        const displayText = isUnavailable ? `${flavor} (not available)` : flavor;
        options += `<option value="${flavor}" ${disabledAttr}>${displayText}</option>`;
    });

    let stockBadge = '';
    if (isSoldOut) {
        stockBadge = `<span class="tag sold-out">⛔ SOLD OUT</span>`;
    } else if (p.stock <= 5) {
        stockBadge = `<span class="tag low-stock">⚠️ Only ${p.stock} left!</span>`;
    } else {
        stockBadge = `<span class="tag available">✅ In Stock</span>`;
    }

    let badgeHtml = '';
    if (p.badge) {
        const badgeClass = `badge-${p.badge.toLowerCase().replace(/\s+/g, '-')}`;
        badgeHtml = `<span class="product-badge ${badgeClass}">${p.badge}</span>`;
    }

    let detailsHtml = '';
    if (p.details) {
        const lines = p.details.split(',').map(item => item.trim()).filter(item => item);
        detailsHtml = '<div class="product-details-text">' + 
            lines.map(line => `<span>${line}</span>`).join('') + 
            '</div>';
    }

    return `
        <div class="product-card product-card-variant ${isSoldOut ? 'sold-out-gray' : ''}" data-product-id="${p.id}">
            <div class="product-image-container">
                <img src="${p.image}" class="product-image" onerror="this.src='https://placehold.co/300x400?text=Sweet'">
                ${badgeHtml}
            </div>
            <div class="product-details">
                <div class="product-info">
                    <h3>${p.name}</h3>
                    ${stockBadge}
                    <span class="price">₱${p.price.toFixed(2)}</span>
                    ${detailsHtml}
                    <div class="variant-selector">
                        <select id="${dropdownId}" class="variant-dropdown" ${isSoldOut ? 'disabled' : ''} required>
                            ${options}
                        </select>
                    </div>
                </div>
                ${isSoldOut ?
                    `<button class="add-btn disabled" disabled>⛔ Sold Out</button>` :
                    `<button class="add-btn" onclick="addFlavorToCart('${p.id}', '${dropdownId}', event)">➕ Add to Cart</button>`
                }
            </div>
        </div>`;
}

// ============================================
// ADD TO CART: SIMPLE PRODUCT
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
    showToast(`✅ Added ${p.name}`);
    animateCart();
};

// ============================================
// ADD TO CART: FLAVOR PRODUCT
// ============================================
window.addFlavorToCart = (productId, dropdownId, event) => {
    const product = products.find(x => x.id === productId);
    if (!product) return showToast("❌ Product not available");
    if (product.stock <= 0) return showToast("⛔ Sold out!");

    const select = document.getElementById(dropdownId);
    if (!select) return showToast("❌ Error: Flavor selector not found");

    const selectedFlavor = select.value;
    if (!selectedFlavor) {
        showToast("⚠️ Please choose a flavor first!", 3000);
        return;
    }

    if (product.unavailable_flavors && product.unavailable_flavors.includes(selectedFlavor)) {
        showToast(`❌ ${selectedFlavor} is currently not available`, 3000);
        return;
    }

    if (event) animateAddToCart(event.currentTarget, product.image);

    const variantId = `${productId}-${selectedFlavor.replace(/\s+/g, '-')}`;
    const variantName = `${product.name} (${selectedFlavor})`;

    const existingIndex = cart.findIndex(item => item.id === variantId);
    if (existingIndex !== -1) {
        if (cart[existingIndex].qty >= product.stock) {
            return showToast(`⚠️ Only ${product.stock} ${variantName} available!`);
        }
        cart[existingIndex].qty++;
    } else {
        cart.push({
            id: variantId,
            name: variantName,
            price: product.price,
            image: product.image,
            stock: product.stock,
            parentId: product.id,
            flavor: selectedFlavor,
            qty: 1
        });
    }

    updateUI();
    showToast(`✅ Added ${variantName}`);
    animateCart();
};

// ============================================
// CART & TOTAL HELPERS
// ============================================
function getSubtotal() {
    return cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
}

function getTotal() {
    return getSubtotal() + selectedShippingFee;
}

function updateUI() {
    const totalQty = cart.reduce((s, i) => s + i.qty, 0);
    const subtotal = getSubtotal();
    const total = getTotal();

    document.getElementById('cart-count').textContent = totalQty;
    document.getElementById('float-total').textContent = `₱${total.toFixed(2)}`;
    document.getElementById('modal-total').textContent = `₱${total.toFixed(2)}`;

    const cartContainer = document.getElementById('cart-items');
    cartContainer.innerHTML = cart.length === 0
        ? '<div class="empty-cart"><p>🛒 Your cart is empty</p><p class="empty-hint">Add some sweet treats! 🍰</p></div>'
        : cart.map(i => `
            <div class="cart-item">
                <div class="cart-item-info">
                    <strong>${i.name}</strong>
                    <small>₱${i.price.toFixed(2)} each</small>
                </div>
                <div class="cart-item-controls">
                    <button class="qty-btn minus" onclick="changeQty('${i.id}', -1)">−</button>
                    <span class="qty-display">${i.qty}</span>
                    <button class="qty-btn plus" onclick="changeQty('${i.id}', 1)">+</button>
                </div>
            </div>
        `).join('');

    if (document.getElementById('checkout-modal').classList.contains('active')) {
        updateCheckoutSummary();
    }
}

window.changeQty = (id, delta) => {
    const idx = cart.findIndex(i => i.id === id);
    if (idx === -1) return;
    const item = cart[idx];
    const product = item.parentId
        ? products.find(p => p.id === item.parentId)
        : products.find(p => p.id === item.id);

    if (!product) {
        cart.splice(idx, 1);
        updateUI();
        return;
    }

    if (delta > 0) {
        if (item.qty >= product.stock) {
            return showToast(`⚠️ Only ${product.stock} ${item.name} available!`);
        }
        item.qty += delta;
    } else {
        item.qty += delta;
        if (item.qty <= 0) cart.splice(idx, 1);
    }
    updateUI();
};

// ============================================
// SHIPPING FEE HANDLER – with loading animation and display next to label
// ============================================
window.updateShippingFee = function() {
    const select = document.getElementById('shipping-address');
    const selected = select.value;
    const feeDisplay = document.getElementById('shipping-fee-display');
    
    if (feeDisplay) {
        feeDisplay.innerHTML = '';
        feeDisplay.classList.add('loading');
    }

    setTimeout(() => {
        if (selected) {
            const [address, feeStr] = selected.split('|');
            const fee = parseFloat(feeStr);
            selectedShippingAddress = address;
            selectedShippingFee = fee;
        } else {
            selectedShippingAddress = '';
            selectedShippingFee = 0;
        }
        
        if (feeDisplay) {
            if (selectedShippingFee > 0) {
                feeDisplay.innerHTML = `+₱${selectedShippingFee.toFixed(2)}`;
                feeDisplay.classList.remove('loading');
            } else {
                feeDisplay.innerHTML = '';
                feeDisplay.classList.remove('loading');
            }
        }
        
        animateTotalUpdate();
        updateUI();
        if (document.getElementById('checkout-modal').classList.contains('active')) {
            updateCheckoutSummary();
        }
    }, 300);
};

function animateTotalUpdate() {
    const totalElements = [
        document.getElementById('float-total'),
        document.getElementById('modal-total')
    ];
    totalElements.forEach(el => {
        if (el) {
            el.classList.add('total-update');
            setTimeout(() => el.classList.remove('total-update'), 400);
        }
    });
}

function updateCheckoutSummary() {
    const subtotal = getSubtotal();
    const total = getTotal();
    const shippingEl = document.getElementById('shipping-summary');
    const exactNo = document.querySelector('input[name="exact-amount"][value="no"]');
    const amountInput = document.getElementById('customer-amount');
    
    let changeHtml = '';
    if (exactNo && exactNo.checked && amountInput && amountInput.value) {
        const amount = parseFloat(amountInput.value);
        if (!isNaN(amount) && amount >= total) {
            const change = amount - total;
            changeHtml = `
                <div class="shipping-line" style="font-weight:700; color:#2e7d32; margin-top:8px;">
                    <span>🔄 Imo kambyo:</span>
                    <span>₱${change.toFixed(2)}</span>
                </div>
            `;
        }
    }
    
    if (selectedShippingAddress && document.getElementById('order-type').value === 'Delivery') {
        shippingEl.innerHTML = `
            <div class="shipping-line" style="font-weight:700; color:var(--primary); margin-top:8px;">
                <span>🚚 Shipping (${selectedShippingAddress}):</span>
                <span>₱${selectedShippingFee.toFixed(2)}</span>
            </div>
            <div class="shipping-line" style="font-weight:700; color:var(--primary); margin-top:8px;">
                <span>Total with shipping:</span>
                <span>₱${total.toFixed(2)}</span>
            </div>
            ${changeHtml}
        `;
    } else {
        shippingEl.innerHTML = changeHtml;
    }

    document.getElementById('final-summary-text').innerHTML = cart.map(i =>
        `<div class="summary-item">${i.qty}x ${i.name} = ₱${(i.price * i.qty).toFixed(2)}</div>`
    ).join('');
}

// ============================================
// VALIDATE CART AGAINST CURRENT STOCK
// ============================================
function validateCartAgainstNewStock() {
    let changed = false;
    const removed = [];
    for (let i = cart.length - 1; i >= 0; i--) {
        const item = cart[i];
        const prodId = item.parentId || item.id;
        const prod = products.find(p => p.id === prodId);
        if (!prod || prod.stock <= 0) {
            removed.push(item.name);
            cart.splice(i, 1);
            changed = true;
        } else if (item.qty > prod.stock) {
            item.qty = prod.stock;
            changed = true;
            showToast(`⚠️ ${item.name} quantity reduced to ${prod.stock}`);
        }
    }
    if (changed) {
        updateUI();
        if (removed.length) showToast(`❌ ${removed.length} item(s) removed – no longer available`, 4000);
    }
}

// ============================================
// CHECKOUT & RECEIPT – with GCash handling
// ============================================
window.openCheckout = () => {
    if (cart.length === 0) return showToast("🛒 Add some treats first!");
    toggleDeliveryFields();
    document.getElementById('cart-modal').classList.remove('active');
    document.getElementById('checkout-modal').classList.add('active');
    updateCheckoutSummary();
};

// Helper to build order text (used by sendToMessenger)
function buildOrderText() {
    const name = document.getElementById('customer-name').value.trim();
    const landmark = document.getElementById('customer-address').value.trim();
    const type = document.getElementById('order-type').value;
    const pay = document.getElementById('payment-method').value;
    
    // For GCash, skip exact amount validation
    if (pay !== 'GCASH') {
        const exactAmountRadio = document.querySelector('input[name="exact-amount"]:checked');
        if (!exactAmountRadio) {
            showToast("💰 Please indicate if you have exact amount");
            return null;
        }
    }
    
    // Determine display texts
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
            if (customerAmount < total) {
                showToast(`💵 Amount must be at least ₱${total.toFixed(2)}`);
                return null;
            }
            changeDue = customerAmount - total;
        }
    }
    
    if (!name) {
        showToast("👤 Please enter your name");
        return null;
    }
    
    if (type === 'Delivery') {
        if (!selectedShippingAddress) {
            showToast("📍 Please select your shipping address");
            return null;
        }
        if (!landmark) {
            showToast("🗺️ Please provide a landmark or delivery instructions");
            return null;
        }
    }
    
    const subtotal = getSubtotal();
    const total = getTotal();

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });

    let paymentDisplay = '';
    if (pay === 'COD') paymentDisplay = 'Cash on Delivery';
    else if (pay === 'COP') paymentDisplay = 'Cash on Pickup';
    else paymentDisplay = 'GCash';

    let text = `✨ SKY SWEET TREATS ✨\n`;
    text += `════════════════\n`;

    text += `📋 **ORDER RECEIPT**\n`;
    text += `📅 ${dateStr}\n`;
    text += `⏰ ${timeStr}\n`;
    text += `🆔 #${Date.now().toString().slice(-6)}\n`;
    text += `════════════════\n`;

    text += `👤 **CUSTOMER DETAILS**\n`;
    text += `• Name: ${name}\n`;
    if (type === 'Delivery') {
        text += `• Shipping Address: ${selectedShippingAddress}\n`;
        text += `• Landmark/Instructions: ${landmark}\n`;
    }
    text += `• Order Type: ${type}\n`;
    text += `• Payment: ${paymentDisplay}\n`;
    text += `• Sakto imo ibayad? ${exactDisplay}\n`;
    if (customerAmount !== null) {
        text += `• Amount nga ibayad mo: ₱${customerAmount.toFixed(2)}\n`;
        text += `• Imo kambyo: ₱${changeDue.toFixed(2)}\n`;
    }
    text += `\n`;

    if (type === 'Delivery' && selectedShippingAddress) {
        text += `🚚 **SHIPPING**\n`;
        text += `• Shipping Fee: ₱${selectedShippingFee.toFixed(2)}\n\n`;
    }

    text += `════════════════\n`;
    text += `🛒 **ORDER ITEMS**\n`;
    cart.forEach(i => {
        text += `• ${i.qty}x ${i.name} = ₱${(i.price * i.qty).toFixed(2)}\n`;
    });
    text += `════════════════\n`;

    text += `💰 **PAYMENT SUMMARY**\n`;
    text += `• Subtotal: ₱${subtotal.toFixed(2)}\n`;
    if (type === 'Delivery' && selectedShippingFee > 0) {
        text += `• Shipping Fee: ₱${selectedShippingFee.toFixed(2)}\n`;
    }
    text += `• Total Amount: ₱${total.toFixed(2)}\n`;
    if (customerAmount !== null) {
        text += `• Amount nga ibayad mo: ₱${customerAmount.toFixed(2)}\n`;
        text += `• Imo kambyo: ₱${changeDue.toFixed(2)}\n`;
    }
    text += `════════════════\n`;

    text += `⚠️ **IMPORTANT REMINDERS**\n`;
    if (pay === 'GCASH') {
        text += `\n💳 **GCASH PAYMENT REQUIRED**\n`;
        text += `1. Send payment to: ${CONFIG.businessPhone}\n`;
        text += `2. Account Name: K** M.\n`;
        text += `3. Send SCREENSHOT of payment receipt\n`;
        text += `4. Order will only be processed after payment confirmation\n`;
    }

    text += `\n📞 **CONTACT INFORMATION**\n`;
    text += `• Messenger: Sky Sweet Treats Page\n`;
    text += `• Phone: ${CONFIG.businessPhone}\n`;
    text += `• Hours: ${CONFIG.businessHours}\n`;
    text += `════════════════\n`;
    text += `Thank you for your order! 🎉\n`;
    text += `We'll contact you within 5-10 minutes.`;

    return text;
}

// ============================================
// SEND TO MESSENGER (no copy button, only send)
// ============================================
window.sendToMessenger = function() {
    const text = buildOrderText();
    if (!text) return;
    
    // Copy to clipboard as fallback (in case pre‑fill doesn't work)
    navigator.clipboard.writeText(text).catch(() => {});
    
    const encodedText = encodeURIComponent(text);
    const messengerUrl = `${CONFIG.messengerUrl}?text=${encodedText}`;
    
    window.open(messengerUrl, '_blank');
    
    showToast("📱 Messenger opened – message is pre‑filled!", 3000);
};

// ============================================
// UI HELPERS
// ============================================
window.closeModal = (id) => {
    document.getElementById(id).classList.remove('active');
};

window.downloadQR = function() {
    const qrImage = document.getElementById('qr-image-el');
    if (!qrImage || !qrImage.src) {
        showToast("❌ QR code image not found");
        return;
    }

    showToast("📥 Downloading QR code...", 0);

    try {
        const a = document.createElement('a');
        a.href = qrImage.src;
        a.download = 'gcash-qr.jpg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => {
            showToast("✅ QR code downloaded!", 2000);
        }, 500);
    } catch (e) {
        console.error('Download failed:', e);
        window.open(qrImage.src, '_blank');
        showToast("📱 Long‑press to save the QR code", 4000);
    }
};

function showToast(message, duration = 2000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    if (duration > 0) {
        window.toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
    }
}

// ============================================
// ANIMATION HELPERS
// ============================================
function animateAddToCart(button, imageSrc) {
    if (!button) return;
    const buttonRect = button.getBoundingClientRect();
    const cartBtn = document.getElementById('open-cart-btn');
    const cartRect = cartBtn.getBoundingClientRect();
    const startX = buttonRect.left + buttonRect.width / 2;
    const startY = buttonRect.top + buttonRect.height / 2;
    const endX = cartRect.left + cartRect.width / 2;
    const endY = cartRect.top + cartRect.height / 2;

    for (let i = 0; i < 3; i++) {
        setTimeout(() => {
            createFlyingImage(imageSrc || 'https://placehold.co/300x400?text=Sweet',
                startX + Math.random() * 20 - 10,
                startY + Math.random() * 20 - 10,
                endX, endY);
        }, i * 100);
    }
}

function createFlyingImage(src, startX, startY, endX, endY) {
    const flyingImg = document.createElement('div');
    flyingImg.className = 'flying-item';
    flyingImg.style.left = `${startX}px`;
    flyingImg.style.top = `${startY}px`;
    flyingImg.innerHTML = `<img src="${src}" alt="Flying item">`;
    document.body.appendChild(flyingImg);
    flyingImg.offsetWidth;
    flyingImg.style.transform = `translate(${endX - startX}px, ${endY - startY}px) scale(0.3)`;
    flyingImg.style.opacity = '0.5';
    setTimeout(() => {
        flyingImg.style.transition = 'all 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
        flyingImg.style.transform = `translate(${endX - startX}px, ${endY - startY}px) scale(0.1)`;
        flyingImg.style.opacity = '0';
        setTimeout(() => flyingImg.remove(), 800);
    }, 100);
}

function animateCart() {
    const cartBtn = document.getElementById('open-cart-btn');
    const cartCount = document.getElementById('cart-count');
    cartBtn.style.transform = 'translateX(-50%) scale(1.15)';
    cartCount.style.transform = 'scale(1.5)';
    cartCount.style.backgroundColor = '#FF9800';
    setTimeout(() => {
        cartBtn.style.transform = 'translateX(-50%) scale(1)';
        cartCount.style.transform = 'scale(1)';
        setTimeout(() => cartCount.style.backgroundColor = '', 300);
    }, 300);
}

// ============================================
// GENTLE REFRESH BANNER
// ============================================
function showRefreshPrompt() {
    if (refreshPromptCount >= MAX_REFRESH_PROMPTS) return;
    const prompt = document.createElement('div');
    prompt.className = 'refresh-prompt';
    prompt.innerHTML = `
        <div class="refresh-prompt-content">
            <span class="refresh-icon">🔄</span>
            <div class="refresh-text">
                <strong>Stock may have changed?</strong>
                <small>Check for updates</small>
            </div>
            <button class="refresh-now-btn" onclick="handleRefreshClick()">Check Now</button>
            <button class="refresh-close-btn" onclick="this.closest('.refresh-prompt').remove()">✕</button>
        </div>
    `;
    document.body.prepend(prompt);
    refreshPromptCount++;
}

window.handleRefreshClick = function() {
    loadProducts(true);
    document.querySelectorAll('.refresh-prompt').forEach(el => el.remove());
};

window.forceStockRefresh = function() {
    loadProducts(true);
    showToast("🔄 Manual refresh triggered");
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    loadProducts(false);
    
    document.getElementById('open-cart-btn').onclick = () => {
        document.getElementById('cart-modal').classList.add('active');
    };
    setTimeout(showRefreshPrompt, 10000);

    const orderTypeSelect = document.getElementById('order-type');
    const paymentMethodSelect = document.getElementById('payment-method');
    if (orderTypeSelect) {
        orderTypeSelect.addEventListener('change', toggleDeliveryFields);
    }
    if (paymentMethodSelect) {
        paymentMethodSelect.addEventListener('change', toggleGcashInfo);
    }

    toggleDeliveryFields();
    toggleGcashInfo(); // ensure initial state (GCash not selected, so exact amount visible)

    selectedShippingAddress = '';
    selectedShippingFee = 0;

    document.getElementById('customer-name')?.addEventListener('input', function() {
        if (this.value.trim()) this.style.borderColor = '#4CAF50';
    });
    document.getElementById('customer-address')?.addEventListener('input', function() {
        if (this.value.trim()) this.style.borderColor = '#4CAF50';
    });
});

// Admin shortcut
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        loadProducts(true);
        showToast('🔄 Manual refresh triggered');
    }
});
