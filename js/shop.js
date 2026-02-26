// js/shop.js
// MotoSynteza Print Shop — pure vanilla JS, zero dependencies
// ============================================================

'use strict';

// ============================================================
// SECTION 1 — CONFIGURATION
// ============================================================

const SHOP_CONFIG = {
  // ─── Operational ──────────────────────────────────────────
  storeCountry          : 'Israel',
  currency              : 'EUR',
  currencySymbol        : '€',
  freeShippingThreshold : 400,
  maxQtyPerItem         : 10,

  // ─── Data ─────────────────────────────────────────────────
  // Resolves relative to shop.html (both in docs/)
  indexUrl : 'index.json',

  // ─── PayPal ───────────────────────────────────────────────
  // CONFIGURE: replace with your PayPal client-id from
  // https://developer.paypal.com/dashboard/applications
  paypal : {
    clientId    : 'YOUR_PAYPAL_CLIENT_ID',
    environment : 'sandbox' // change to 'production' when ready
  },

  // ─── EmailJS ──────────────────────────────────────────────
  // CONFIGURE: create account at https://www.emailjs.com
  // Add a service, a template, and paste the IDs here
  emailjs : {
    serviceId  : 'YOUR_EMAILJS_SERVICE_ID',
    templateId : 'YOUR_EMAILJS_TEMPLATE_ID',
    publicKey  : 'YOUR_EMAILJS_PUBLIC_KEY'
  }
};

// Print sizes available for purchase
const PRICES = {
  '30x40'  : 80,
  '50x70'  : 150,
  '70x100' : 300
};

// Human-readable size labels
const SIZE_LABELS = {
  '30x40'  : '30×40 cm',
  '50x70'  : '50×70 cm',
  '70x100' : '70×100 cm'
};

// Shipping rates by size (largest item in cart determines rate)
const SHIPPING_RATES = {
  local : {
    '30x40'  : 15,
    '50x70'  : 25,
    '70x100' : 40
  },
  international : {
    '30x40'  : 30,
    '50x70'  : 45,
    '70x100' : 70
  }
};

// Size progression for "largest in cart" shipping logic
const SIZE_ORDER = ['30x40', '50x70', '70x100'];

// Countries considered "local" (case-insensitive)
const LOCAL_COUNTRIES = ['israel', 'il'];

// ============================================================
// SECTION 2 — STATE
// ============================================================

let shopData      = null;  // Loaded from index.json
let validCodesMap = {};    // { "UU-001": { projectTitle, folder, src, thumbnailUrl } }

// Single source of truth — never read totals from the DOM
let cart = createEmptyCart();

function createEmptyCart() {
  return {
    orderId   : '',
    createdAt : '',
    items     : [],   // [{ code, size, qty, thumbnailUrl, unitPrice, lineTotal, projectTitle }]
    subtotal  : 0,
    shipping  : 0,
    total     : 0,
    customer  : {
      fullName   : '',
      address1   : '',
      city       : '',
      postalCode : '',
      country    : '',
      email      : ''
    }
  };
}

// ============================================================
// SECTION 3 — DATA LOADING
// ============================================================

async function loadShopData() {
  let data;

  try {
    const res = await fetch(SHOP_CONFIG.indexUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    throw new Error(`Cannot load index.json — ${err.message}. Run the build first.`);
  }

  // Validate required fields per spec
  if (!data || !Array.isArray(data.projects)) {
    throw new Error('index.json is malformed: missing projects array');
  }

  for (const project of data.projects) {
    if (!project.projectCode) throw new Error(`Project missing projectCode: ${JSON.stringify(project)}`);
    if (!project.folder)      throw new Error(`Project "${project.projectCode}" missing folder`);
    if (!Array.isArray(project.images)) throw new Error(`Project "${project.projectCode}" missing images`);
  }

  return data;
}

// ============================================================
// SECTION 4 — CODE GENERATION
// ============================================================

/**
 * Build a flat map: code → image metadata
 * Called once after loadShopData() resolves
 */
function generateValidCodes(data) {
  const map = {};

  for (const project of data.projects) {
    for (const image of project.images) {
      map[image.code] = {
        projectCode  : project.projectCode,
        projectTitle : project.title,
        folder       : project.folder,
        src          : image.src,
        caption      : image.caption,
        thumbnailUrl : `${project.folder}/${image.src}`
      };
    }
  }

  return map;
}

function getAllValidCodes() {
  return Object.keys(validCodesMap).sort();
}

// ============================================================
// SECTION 5 — CART OPERATIONS
// ============================================================

function addItemToCart(code, size, qty) {
  // Sanitise inputs
  code = String(code).trim().toUpperCase();
  size = String(size).trim();
  qty  = parseInt(qty, 10);

  // Validate code
  if (!validCodesMap[code]) {
    showAddFormError(`Unknown image code: "${code}"`);
    return false;
  }

  // Validate size
  if (!PRICES[size]) {
    showAddFormError(`Invalid size: "${size}"`);
    return false;
  }

  // Validate quantity
  if (isNaN(qty) || qty < 1 || qty > SHOP_CONFIG.maxQtyPerItem) {
    showAddFormError(`Quantity must be 1–${SHOP_CONFIG.maxQtyPerItem}`);
    return false;
  }

  // Merge: same code + same size → increase qty
  const existing = cart.items.find(
    item => item.code === code && item.size === size
  );

  if (existing) {
    const merged = existing.qty + qty;
    if (merged > SHOP_CONFIG.maxQtyPerItem) {
      showAddFormError(
        `Max ${SHOP_CONFIG.maxQtyPerItem} per item. ` +
        `You already have ${existing.qty} — can add ${SHOP_CONFIG.maxQtyPerItem - existing.qty} more.`
      );
      return false;
    }
    existing.qty       = merged;
    existing.lineTotal = existing.unitPrice * merged;

  } else {
    const info      = validCodesMap[code];
    const unitPrice = PRICES[size];

    cart.items.push({
      code,
      size,
      qty,
      projectTitle : info.projectTitle,
      thumbnailUrl : info.thumbnailUrl,
      unitPrice,
      lineTotal    : unitPrice * qty
    });
  }

  calculateTotals();
  saveCart();
  renderCart();
  clearAddFormError();
  return true;
}

function removeItemFromCart(index) {
  if (index < 0 || index >= cart.items.length) return;
  cart.items.splice(index, 1);
  calculateTotals();
  saveCart();
  renderCart();
}

// ============================================================
// SECTION 6 — CALCULATIONS
// ============================================================

function calculateShipping() {
  if (!cart.items.length) return 0;

  const country  = (cart.customer.country || SHOP_CONFIG.storeCountry).trim();
  const isLocal  = LOCAL_COUNTRIES.includes(country.toLowerCase());
  const rates    = isLocal ? SHIPPING_RATES.local : SHIPPING_RATES.international;

  // Largest size in cart determines the rate
  const maxIdx = cart.items.reduce((max, item) => {
    return Math.max(max, SIZE_ORDER.indexOf(item.size));
  }, 0);

  return rates[SIZE_ORDER[maxIdx]] ?? 0;
}

/**
 * Always derive totals from cart.items — never from DOM
 */
function calculateTotals() {
  cart.subtotal = cart.items.reduce((sum, item) => sum + item.lineTotal, 0);

  const rawShipping = calculateShipping();
  cart.shipping = cart.subtotal >= SHOP_CONFIG.freeShippingThreshold
    ? 0
    : rawShipping;

  cart.total = cart.subtotal + cart.shipping;
}

// ============================================================
// SECTION 7 — PERSISTENCE (localStorage)
// ============================================================

const STORAGE_KEY = 'motosynteza-shop-cart-v1';

function saveCart() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  } catch (_) {
    // Storage not available — fail silently
  }
}

function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const saved = JSON.parse(raw);
    if (saved && Array.isArray(saved.items)) {
      cart = { ...createEmptyCart(), ...saved };
      calculateTotals(); // Ensure consistency after restore
    }
  } catch (_) {
    // Corrupt data — start fresh
  }
}

function clearCart() {
  cart = createEmptyCart();
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
}

// ============================================================
// SECTION 8 — ORDER ID
// ============================================================

function generateOrderId() {
  const d  = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `ORD-${yy}${mm}${dd}-${hh}${mi}${ss}`;
}

// ============================================================
// SECTION 9 — DOM BUILD
// (Called once per shop page visit — builds the full structure)
// ============================================================

function buildShopDOM(root) {
  root.innerHTML = '';

  // ── Wrapper ─────────────────────────────────────────────
  const layout = document.createElement('div');
  layout.className = 'shop-layout';
  root.appendChild(layout);

  layout.appendChild(buildCartPanel());
  layout.appendChild(buildOrderPanel());

  // ── Success overlay (inside root so PJAX replaces it) ───
  const overlay = document.createElement('div');
  overlay.id        = 'shop-success-overlay';
  overlay.className = 'shop-success-overlay';
  overlay.hidden    = true;
  overlay.innerHTML =
    '<div class="shop-success-box">' +
      '<div class="shop-success-icon">✓</div>' +
      '<h2>Order Confirmed</h2>' +
      '<pre id="shop-success-msg" class="shop-success-msg"></pre>' +
      '<button id="shop-success-close" class="shop-btn shop-btn-primary">Continue Shopping</button>' +
    '</div>';
  root.appendChild(overlay);
}

function buildCartPanel() {
  const panel = document.createElement('div');
  panel.id        = 'shop-cart-panel';
  panel.className = 'shop-cart-panel';

  panel.innerHTML =
    // Title
    '<h2 class="shop-panel-title">Your Cart</h2>' +

    // Items container (populated by renderCart)
    '<div id="cart-items-container"></div>' +

    // Totals
    '<div class="cart-summary" id="cart-summary">' +
      '<p class="cart-free-shipping-msg" id="free-shipping-msg" hidden></p>' +
      '<div class="cart-totals-grid">' +
        '<span>Subtotal</span><span id="cart-subtotal">€0</span>' +
        '<span>Shipping</span><span id="cart-shipping">€0</span>' +
      '</div>' +
      '<div class="cart-grand-total">' +
        '<span>TOTAL</span><span id="cart-total">€0</span>' +
      '</div>' +
    '</div>' +

    // Customer form
    '<div class="customer-section" id="customer-section">' +
      '<h3 class="shop-section-label">Your Information</h3>' +
      '<form id="customer-form" novalidate>' +
        '<div class="form-group">' +
          '<label for="cust-name">Full Name</label>' +
          '<input type="text" id="cust-name" autocomplete="name" required>' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="cust-address">Address</label>' +
          '<input type="text" id="cust-address" autocomplete="street-address" required>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group">' +
            '<label for="cust-city">City</label>' +
            '<input type="text" id="cust-city" autocomplete="address-level2" required>' +
          '</div>' +
          '<div class="form-group">' +
            '<label for="cust-postal">Postal Code</label>' +
            '<input type="text" id="cust-postal" autocomplete="postal-code" required>' +
          '</div>' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="cust-country">Country</label>' +
          '<input type="text" id="cust-country" autocomplete="country-name" required ' +
            'placeholder="e.g. Israel · Poland · Germany">' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="cust-email">Email</label>' +
          '<input type="email" id="cust-email" autocomplete="email" required ' +
            'placeholder="confirmation will be sent here">' +
        '</div>' +
      '</form>' +
    '</div>' +

    // PayPal button
    '<div id="paypal-button-container" class="paypal-container" aria-label="Pay with PayPal"></div>' +
    '<div id="paypal-loader" class="paypal-loader" hidden>' +
      '<span class="loader-dot"></span>' +
      '<span class="loader-dot"></span>' +
      '<span class="loader-dot"></span>' +
      '<span>Processing…</span>' +
    '</div>';

  return panel;
}

function buildOrderPanel() {
  const panel = document.createElement('div');
  panel.className = 'shop-order-panel';

  // ── Add to Cart form ──────────────────────────────────
  const addSection = document.createElement('section');
  addSection.className = 'shop-section';
  addSection.innerHTML =
    '<h2 class="shop-panel-title">Add a Print</h2>' +
    '<form id="add-to-cart-form" novalidate>' +
      '<div class="form-group">' +
        '<label for="item-code">Image Code</label>' +
        '<input type="text" id="item-code" list="valid-codes-list" ' +
               'placeholder="e.g. UU-001" required autocomplete="off" spellcheck="false">' +
        '<datalist id="valid-codes-list"></datalist>' +
        '<span class="form-hint">Click a thumbnail below to auto-fill</span>' +
      '</div>' +
      '<div class="form-group">' +
        '<label for="item-size">Print Size</label>' +
        '<select id="item-size" required>' +
          '<option value="30x40">30×40 cm — €80</option>' +
          '<option value="50x70">50×70 cm — €150</option>' +
          '<option value="70x100">70×100 cm — €300</option>' +
        '</select>' +
      '</div>' +
      '<div class="form-group form-group-small">' +
        '<label for="item-qty">Quantity (max 10)</label>' +
        '<input type="number" id="item-qty" min="1" max="10" value="1" required>' +
      '</div>' +
      '<div id="add-form-error" class="form-error" hidden></div>' +
      '<button type="submit" class="shop-btn shop-btn-primary">Add to Cart</button>' +
    '</form>';

  // ── Catalog ───────────────────────────────────────────
  const catalogSection = document.createElement('section');
  catalogSection.className = 'shop-section shop-catalog-section';
  catalogSection.innerHTML =
    '<h2 class="shop-panel-title">Browse Prints</h2>' +
    '<div id="catalog-grid" class="catalog-grid"></div>';

  panel.appendChild(addSection);
  panel.appendChild(catalogSection);

  return panel;
}

// ============================================================
// SECTION 10 — RENDER CART
// ============================================================

function renderCart() {
  const container    = document.getElementById('cart-items-container');
  const subtotalEl   = document.getElementById('cart-subtotal');
  const shippingEl   = document.getElementById('cart-shipping');
  const totalEl      = document.getElementById('cart-total');
  const freeShipEl   = document.getElementById('free-shipping-msg');

  if (!container) return;

  // Items
  container.innerHTML = '';
  if (cart.items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'cart-empty';
    empty.textContent = 'Your cart is empty.';
    container.appendChild(empty);
  } else {
    container.appendChild(buildCartTable());
  }

  // Totals
  if (subtotalEl) subtotalEl.textContent = formatCurrency(cart.subtotal);
  if (totalEl)    totalEl.textContent    = formatCurrency(cart.total);

  if (shippingEl) {
    shippingEl.textContent =
      (cart.shipping === 0 && cart.items.length > 0)
        ? 'Free'
        : formatCurrency(cart.shipping);
  }

  // Free shipping message
  if (freeShipEl) {
    const remaining = SHOP_CONFIG.freeShippingThreshold - cart.subtotal;
    if (cart.items.length === 0) {
      freeShipEl.hidden = true;
    } else if (remaining > 0) {
      freeShipEl.textContent = `Add ${formatCurrency(remaining)} more for free shipping`;
      freeShipEl.hidden = false;
    } else {
      freeShipEl.textContent = 'Free shipping applied!';
      freeShipEl.hidden = false;
    }
  }

  // Show customer form when cart has items
  const custSection = document.getElementById('customer-section');
  if (custSection) custSection.style.display = cart.items.length ? 'block' : 'none';

  // PayPal button opacity
  updatePaypalState();
}

function buildCartTable() {
  const table  = document.createElement('table');
  table.className = 'cart-table';

  // Header
  const thead = table.createTHead();
  const hr    = thead.insertRow();
  ['', 'Code', 'Size', 'Qty', 'Unit', 'Total', ''].forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    hr.appendChild(th);
  });

  // Body
  const tbody = table.createTBody();
  cart.items.forEach((item, index) => {
    const row = tbody.insertRow();
    row.className = 'cart-row';

    // Thumbnail cell
    const thumbCell = row.insertCell();
    thumbCell.className = 'cart-thumb-cell';
    const img = document.createElement('img');
    img.src     = item.thumbnailUrl;
    img.alt     = item.code;
    img.loading = 'lazy';
    img.className = 'cart-thumb';
    img.onerror = () => { img.style.display = 'none'; };
    thumbCell.appendChild(img);

    // Code
    const codeCell = row.insertCell();
    codeCell.className = 'cart-code';
    codeCell.textContent = item.code;

    // Size
    row.insertCell().textContent = SIZE_LABELS[item.size] || item.size;

    // Qty
    row.insertCell().textContent = item.qty;

    // Unit price
    row.insertCell().textContent = formatCurrency(item.unitPrice);

    // Line total
    const totalCell = row.insertCell();
    totalCell.className   = 'cart-line-total';
    totalCell.textContent = formatCurrency(item.lineTotal);

    // Remove button
    const removeCell = row.insertCell();
    const btn = document.createElement('button');
    btn.className   = 'cart-remove-btn';
    btn.textContent = '×';
    btn.setAttribute('aria-label', `Remove ${item.code}`);
    btn.addEventListener('click', () => removeItemFromCart(index));
    removeCell.appendChild(btn);
  });

  return table;
}

// ============================================================
// SECTION 11 — CATALOG RENDER
// ============================================================

function renderCatalog(data) {
  const grid = document.getElementById('catalog-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (const project of data.projects) {
    const card = document.createElement('div');
    card.className = 'catalog-card';

    const titleEl = document.createElement('h3');
    titleEl.className = 'catalog-card-title';
    titleEl.textContent = project.title;
    card.appendChild(titleEl);

    const strip = document.createElement('div');
    strip.className = 'catalog-strip';

    const previewImages = project.images.slice(0, 6);

    for (const image of previewImages) {
      const item = document.createElement('button');
      item.className = 'catalog-item';
      item.type      = 'button';
      item.title     = `${image.code} — click to select`;
      item.dataset.code = image.code;

      const img = document.createElement('img');
      img.src       = `${project.folder}/${image.src}`;
      img.alt       = image.code;
      img.loading   = 'lazy';
      img.className = 'catalog-img';
      img.onerror   = () => { item.classList.add('catalog-item--broken'); };

      const tag = document.createElement('span');
      tag.className   = 'catalog-tag';
      tag.textContent = image.code;

      item.appendChild(img);
      item.appendChild(tag);
      strip.appendChild(item);

      item.addEventListener('click', () => prefillCode(image.code));
    }

    if (project.images.length > 6) {
      const more = document.createElement('div');
      more.className   = 'catalog-item catalog-item--more';
      more.textContent = `+${project.images.length - 6}`;
      strip.appendChild(more);
    }

    card.appendChild(strip);
    grid.appendChild(card);
  }
}

function prefillCode(code) {
  const input = document.getElementById('item-code');
  if (!input) return;

  input.value = code;

  const addForm = document.getElementById('add-to-cart-form');
  if (addForm) addForm.scrollIntoView({ behavior: 'smooth', block: 'center' });

  input.focus();
}

// ============================================================
// SECTION 12 — DATALIST (autocomplete)
// ============================================================

function populateDatalist() {
  const list = document.getElementById('valid-codes-list');
  if (!list) return;
  list.innerHTML = '';

  for (const code of getAllValidCodes()) {
    const opt = document.createElement('option');
    opt.value = code;
    const info = validCodesMap[code];
    if (info) opt.label = `${info.projectTitle}`;
    list.appendChild(opt);
  }
}

// ============================================================
// SECTION 13 — FORM BINDING
// ============================================================

function bindAddToCartForm() {
  const form = document.getElementById('add-to-cart-form');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();

    const code = (document.getElementById('item-code')?.value || '').trim().toUpperCase();
    const size = document.getElementById('item-size')?.value || '';
    const qty  = document.getElementById('item-qty')?.value  || '1';

    const ok = addItemToCart(code, size, qty);
    if (ok) {
      document.getElementById('item-code').value = '';
      document.getElementById('item-qty').value  = '1';
      scrollToCart();
    }
  });
}

function bindCustomerForm() {
  const form = document.getElementById('customer-form');
  if (!form) return;

  // Live sync: update cart.customer on every keystroke
  form.addEventListener('input', () => {
    syncCustomerToCart();
    // Recalculate shipping when country changes
    calculateTotals();
    renderCart();
  });
}

function syncCustomerToCart() {
  const map = {
    fullName   : 'cust-name',
    address1   : 'cust-address',
    city       : 'cust-city',
    postalCode : 'cust-postal',
    country    : 'cust-country',
    email      : 'cust-email'
  };
  for (const [key, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) cart.customer[key] = el.value.trim();
  }
}

function restoreCustomerForm() {
  const map = {
    fullName   : 'cust-name',
    address1   : 'cust-address',
    city       : 'cust-city',
    postalCode : 'cust-postal',
    country    : 'cust-country',
    email      : 'cust-email'
  };
  for (const [key, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.value = cart.customer[key] || '';
  }
}

// ============================================================
// SECTION 14 — CUSTOMER FORM VALIDATION
// ============================================================

function validateCustomerForm() {
  syncCustomerToCart();
  clearCustomerErrors();

  const checks = [
    { key: 'fullName',   id: 'cust-name',    label: 'Full Name' },
    { key: 'address1',   id: 'cust-address',  label: 'Address' },
    { key: 'city',       id: 'cust-city',     label: 'City' },
    { key: 'postalCode', id: 'cust-postal',   label: 'Postal Code' },
    { key: 'country',    id: 'cust-country',  label: 'Country' },
    { key: 'email',      id: 'cust-email',    label: 'Email' }
  ];

  for (const check of checks) {
    if (!(cart.customer[check.key] || '').trim()) {
      markFieldError(check.id, `${check.label} is required`);
      return false;
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cart.customer.email)) {
    markFieldError('cust-email', 'Enter a valid email address');
    return false;
  }

  return true;
}

function markFieldError(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('field-error');
  el.setAttribute('title', message);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.addEventListener('input', () => {
    el.classList.remove('field-error');
    el.removeAttribute('title');
  }, { once: true });
}

function clearCustomerErrors() {
  ['cust-name','cust-address','cust-city','cust-postal','cust-country','cust-email']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('field-error'); el.removeAttribute('title'); }
    });
}

// ============================================================
// SECTION 15 — PAYPAL INTEGRATION
// ============================================================

let _paypalButtonsInstance = null;

function loadPayPalSDK() {
  return new Promise((resolve, reject) => {
    if (window.paypal) { resolve(); return; }

    const existing = document.querySelector('script[src*="paypal.com/sdk"]');
    if (existing) {
      existing.addEventListener('load', resolve);
      existing.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');
    script.src   =
      `https://www.paypal.com/sdk/js` +
      `?client-id=${SHOP_CONFIG.paypal.clientId}` +
      `&currency=${SHOP_CONFIG.currency}` +
      `&intent=capture`;
    script.onload  = resolve;
    script.onerror = () => reject(new Error('Failed to load PayPal SDK'));
    document.head.appendChild(script);
  });
}

async function initPayPal() {
  try {
    await loadPayPalSDK();
    renderPayPalButtons();
  } catch (err) {
    const container = document.getElementById('paypal-button-container');
    if (container) {
      const msg = document.createElement('p');
      msg.className   = 'paypal-error';
      msg.textContent = 'Payment system unavailable. Please try again later.';
      container.appendChild(msg);
    }
    console.error('[Shop] PayPal init failed:', err.message);
  }
}

function renderPayPalButtons() {
  const container = document.getElementById('paypal-button-container');
  if (!container || !window.paypal) return;

  // Clean up previous instance (PJAX re-entry)
  if (_paypalButtonsInstance) {
    try { _paypalButtonsInstance.close(); } catch (_) {}
    _paypalButtonsInstance = null;
  }
  container.innerHTML = '';

  _paypalButtonsInstance = window.paypal.Buttons({
    style: {
      layout : 'vertical',
      color  : 'black',
      shape  : 'rect',
      label  : 'pay'
    },

    // Validate before opening PayPal overlay
    onClick(data, actions) {
      if (!cart.items.length) {
        showAddFormError('Please add items to your cart first.');
        return actions.reject();
      }
      if (!validateCustomerForm()) {
        return actions.reject();
      }
      return actions.resolve();
    },

    // Create the PayPal order
    createOrder(data, actions) {
      // Generate Order ID once, here, before payment
      if (!cart.orderId) {
        cart.orderId   = generateOrderId();
        cart.createdAt = new Date().toISOString();
        saveCart();
      }

      showPaypalLoader(true);

      return actions.order.create({
        purchase_units: [{
          custom_id   : cart.orderId,
          description : `MotoSynteza Prints — ${cart.orderId}`,
          amount: {
            currency_code : SHOP_CONFIG.currency,
            value         : cart.total.toFixed(2)
          }
        }]
      });
    },

    // Payment approved — capture it
    async onApprove(data, actions) {
      try {
        const details = await actions.order.capture();
        showPaypalLoader(false);

        await sendOrderEmail(details.id);
        showSuccessOverlay(details.id);

        clearCart();
        renderCart();

      } catch (err) {
        showPaypalLoader(false);
        console.error('[Shop] Capture failed:', err);
        alert('Payment could not be completed. Please contact support.');
      }
    },

    onError(err) {
      showPaypalLoader(false);
      console.error('[Shop] PayPal error:', err);
    },

    onCancel() {
      showPaypalLoader(false);
    }
  });

  _paypalButtonsInstance.render('#paypal-button-container');
  updatePaypalState();
}

function updatePaypalState() {
  const container = document.getElementById('paypal-button-container');
  if (!container) return;
  const empty = cart.items.length === 0;
  container.style.opacity       = empty ? '0.35' : '1';
  container.style.pointerEvents = empty ? 'none'  : 'auto';
  container.title = empty ? 'Add prints to enable payment' : '';
}

function showPaypalLoader(show) {
  const el = document.getElementById('paypal-loader');
  if (el) el.hidden = !show;
}

// ============================================================
// SECTION 16 — EMAIL (EmailJS)
// ============================================================

async function loadEmailJS() {
  if (window.emailjs) return;

  await new Promise((resolve, reject) => {
    const script   = document.createElement('script');
    script.src     = 'https://cdn.emailjs.com/dist/email.min.js';
    script.onload  = () => {
      window.emailjs.init(SHOP_CONFIG.emailjs.publicKey);
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function sendOrderEmail(transactionId) {
  try {
    await loadEmailJS();

    const itemLines = cart.items.map(item =>
      `${item.code} | ${SIZE_LABELS[item.size]} | ` +
      `Qty: ${item.qty} | ${formatCurrency(item.lineTotal)}`
    ).join('\n');

    await window.emailjs.send(
      SHOP_CONFIG.emailjs.serviceId,
      SHOP_CONFIG.emailjs.templateId,
      {
        // Map these names to variables in your EmailJS template
        order_id         : cart.orderId,
        order_date       : new Date().toLocaleDateString('en-GB'),
        transaction_id   : transactionId,
        customer_name    : cart.customer.fullName,
        customer_email   : cart.customer.email,
        customer_address : [
          cart.customer.address1,
          cart.customer.city,
          cart.customer.postalCode,
          cart.customer.country
        ].filter(Boolean).join(', '),
        items_breakdown  : itemLines,
        subtotal         : formatCurrency(cart.subtotal),
        shipping         : cart.shipping === 0 ? 'Free' : formatCurrency(cart.shipping),
        total            : formatCurrency(cart.total),
        to_email         : cart.customer.email
      }
    );

    console.info('[Shop] Confirmation email sent to', cart.customer.email);

  } catch (err) {
    // Email failure must NOT block the success flow — log only
    console.warn('[Shop] Email send failed (non-critical):', err.message);
  }
}

// ============================================================
// SECTION 17 — SUCCESS OVERLAY
// ============================================================

function showSuccessOverlay(transactionId) {
  const overlay = document.getElementById('shop-success-overlay');
  const msgEl   = document.getElementById('shop-success-msg');

  if (!overlay) {
    alert(`Order confirmed!\nOrder ID: ${cart.orderId}\nThank you!`);
    return;
  }

  if (msgEl) {
    // Use textContent — never innerHTML for user-derived data
    msgEl.textContent = [
      `Order ID: ${cart.orderId}`,
      `PayPal Ref: ${transactionId}`,
      '',
      `Name:    ${cart.customer.fullName}`,
      `Email:   ${cart.customer.email}`,
      `Address: ${cart.customer.address1}, ${cart.customer.city}`,
      '',
      'A confirmation email has been sent.',
      'Thank you for your order!'
    ].join('\n');
  }

  overlay.hidden = false;

  document.getElementById('shop-success-close')?.addEventListener(
    'click', () => { overlay.hidden = true; }, { once: true }
  );
}

// ============================================================
// SECTION 18 — UI HELPERS
// ============================================================

function formatCurrency(amount) {
  const n = Number(amount);
  return `${SHOP_CONFIG.currencySymbol}${isNaN(n) ? '0' : n.toFixed(0)}`;
}

function scrollToCart() {
  document.getElementById('shop-cart-panel')
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showAddFormError(message) {
  const el = document.getElementById('add-form-error');
  if (!el) return;
  el.textContent = message;
  el.hidden      = false;
}

function clearAddFormError() {
  const el = document.getElementById('add-form-error');
  if (!el) return;
  el.textContent = '';
  el.hidden      = true;
}

// ============================================================
// SECTION 19 — INIT
// ============================================================

async function initShopPage() {
  if (document.body.dataset.page !== 'shop') return;

  const root = document.getElementById('shop-root');
  if (!root) return;

  // Build full DOM structure first
  buildShopDOM(root);
  bindAddToCartForm();
  bindCustomerForm();

  try {
    // 1. Load canonical data from index.json (built by ShopIndexGenerator)
    shopData      = await loadShopData();
    validCodesMap = generateValidCodes(shopData);

    // 2. Restore cart from localStorage
    loadCart();

    // 3. Populate datalist autocomplete
    populateDatalist();

    // 4. Render product catalog
    renderCatalog(shopData);

    // 5. Render cart (with restored items)
    renderCart();

    // 6. Restore customer info into form
    restoreCustomerForm();

    // 7. Init PayPal (async SDK load)
    await initPayPal();

  } catch (err) {
    root.innerHTML =
      '<div class="shop-error">' +
        '<h2>Shop Unavailable</h2>' +
        '<p class="shop-error-msg">' + escapeHtml(err.message) + '</p>' +
        '<p>Run the build (<code>node build.js</code>) to generate <code>index.json</code>.</p>' +
      '</div>';
  }
}

// Safe DOM text insertion
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Exports ──────────────────────────────────────────────────
// Called by layout.js runShopInit() on every PJAX page load
window.initShopPage = initShopPage;

// Direct page load
document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'shop') initShopPage();
});
