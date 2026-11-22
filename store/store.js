/* SubstitOud storefront.
   Cart lives in the browser (localStorage). Prices shown here come from
   store/catalog.json; the server works the price out again from the same file
   before any payment, so nothing the browser sends can change what is charged. */
(function () {
  'use strict';

  var KEY = 'so_cart_v1';
  var catalog = null;
  var memQty = 0;
  var page = document.body.getAttribute('data-page') || '';

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }
  function money(cents) { return '$' + (cents / 100).toFixed(2); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- cart state ---------- */
  function maxQty() { return catalog ? catalog.product.maxPerOrder : 48; }
  function getQty() {
    try {
      var d = JSON.parse(window.localStorage.getItem(KEY) || '{}');
      var n = parseInt(d.box, 10);
      return n > 0 ? Math.min(n, maxQty()) : 0;
    } catch (e) { return memQty; }
  }
  function setQty(n) {
    n = Math.max(0, Math.min(maxQty(), parseInt(n, 10) || 0));
    memQty = n;
    try { window.localStorage.setItem(KEY, JSON.stringify({ box: n })); } catch (e) { /* private mode: keep in memory */ }
    renderAll();
    return n;
  }

  function priceFor(qty) {
    var tiers = catalog.product.tiers;
    var base = tiers[0].unitPrice, unit = base, idx = 0;
    for (var i = 0; i < tiers.length; i++) {
      if (qty >= tiers[i].minQty) { unit = tiers[i].unitPrice; idx = i; }
    }
    var next = tiers[idx + 1] || null;
    return {
      qty: qty, unit: unit, base: base, tierIndex: idx,
      subtotal: unit * qty,
      savings: (base - unit) * qty,
      next: next ? { minQty: next.minQty, unitPrice: next.unitPrice, need: next.minQty - qty } : null
    };
  }

  /* ---------- stepper ---------- */
  function stepper(value, min, onChange, label) {
    var minus = el('button', { type: 'button', 'aria-label': 'Remove one box', text: '−' });
    var input = el('input', { type: 'number', inputmode: 'numeric', min: String(min), max: String(maxQty()), value: String(value), 'aria-label': label || 'Number of boxes' });
    var plus = el('button', { type: 'button', 'aria-label': 'Add one box', text: '+' });
    var wrap = el('div', { class: 'so-stepper' }, [minus, input, plus]);
    function sync(v) {
      v = Math.max(min, Math.min(maxQty(), parseInt(v, 10) || min));
      input.value = String(v);
      minus.disabled = v <= min;
      plus.disabled = v >= maxQty();
      return v;
    }
    minus.addEventListener('click', function () { onChange(sync(parseInt(input.value, 10) - 1)); });
    plus.addEventListener('click', function () { onChange(sync(parseInt(input.value, 10) + 1)); });
    input.addEventListener('change', function () { onChange(sync(input.value)); });
    sync(value);
    wrap.setValue = sync;
    return wrap;
  }

  /* ---------- navigation ---------- */
  function initNav() {
    var nav = $('.so-nav');
    if (!nav) return;
    function onScroll() { nav.classList.toggle('is-stuck', window.scrollY > 6); }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    var menuBtn = $('.so-menu-btn', nav);
    if (menuBtn) {
      menuBtn.addEventListener('click', function () {
        var open = !nav.classList.contains('is-open');
        nav.classList.toggle('is-open', open);
        menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && nav.classList.contains('is-open')) {
          nav.classList.remove('is-open');
          menuBtn.setAttribute('aria-expanded', 'false');
          menuBtn.focus();
        }
      });
    }
    var cartBtn = $('.so-cart-btn', nav);
    if (cartBtn && page !== 'cart') {
      cartBtn.addEventListener('click', function (e) {
        if (!catalog) return;            /* no catalog yet: follow the link to the cart page */
        e.preventDefault();
        openDrawer();
      });
    }
  }
  function renderBadge() {
    var qty = getQty();
    $all('.so-cart-count').forEach(function (b) {
      b.textContent = String(qty);
      b.hidden = qty === 0;
    });
    $all('.so-cart-btn').forEach(function (b) {
      b.setAttribute('aria-label', qty === 0 ? 'Cart, empty' : 'Cart, ' + plural(qty, 'box', 'boxes'));
    });
  }

  /* ---------- cart line + summary (drawer and cart page) ---------- */
  function lineNode(p) {
    var prod = catalog.product;
    var priceHtml = (p.savings > 0 ? '<s>' + money(p.base * p.qty) + '</s>' : '') + money(p.subtotal);
    var step = stepper(p.qty, 1, function (v) { setQty(v); }, 'Number of boxes in your cart');
    var remove = el('button', { type: 'button', class: 'so-remove', text: 'Remove' });
    remove.addEventListener('click', function () { setQty(0); });
    return el('div', { class: 'so-line' }, [
      el('div', { class: 'so-line-img' }, [el('img', { src: prod.thumb, alt: '', width: '280', height: '600' })]),
      el('div', {}, [
        el('p', { class: 'so-line-name', text: prod.shortName }),
        el('p', { class: 'so-line-meta', text: plural(p.qty, 'box', 'boxes') + ', ' + (p.qty * prod.sticksPerBox) + ' sticks. ' + money(p.unit) + ' per box.' }),
        el('div', { class: 'so-line-row' }, [step, el('span', { class: 'so-line-price', html: priceHtml })]),
        remove
      ])
    ]);
  }
  function nudgeNode(p) {
    if (!p.next) return null;
    var after = priceFor(p.next.minQty);
    var node = el('p', { class: 'so-nudge' });
    var btn = el('button', { type: 'button', text: 'Add ' + plural(p.next.need, 'more box', 'more boxes') });
    btn.addEventListener('click', function () { setQty(p.next.minQty); });
    node.appendChild(btn);
    var msg = after.subtotal < p.subtotal
      ? ' and your total goes down to ' + money(after.subtotal) + ', because every box drops to ' + money(p.next.unitPrice) + '.'
      : ' and every box drops to ' + money(p.next.unitPrice) + '. You would save ' + money(after.savings) + ' on ' + p.next.minQty + ' boxes.';
    node.appendChild(document.createTextNode(msg));
    return node;
  }
  function summaryNode(p) {
    var rows = '<div><dt>' + plural(p.qty, 'box', 'boxes') + ' at ' + money(p.base) + '</dt><dd>' + money(p.base * p.qty) + '</dd></div>';
    if (p.savings > 0) rows += '<div class="so-sum-save"><dt>Bundle saving</dt><dd>−' + money(p.savings) + '</dd></div>';
    rows += '<div><dt>Shipping in the US</dt><dd>Free</dd></div>';
    rows += '<div class="so-sum-total"><dt>Total</dt><dd>' + money(p.subtotal) + '</dd></div>';
    return el('dl', { class: 'so-sum', html: rows });
  }

  /* ---------- checkout ---------- */
  function startCheckout(btn, errEl) {
    var qty = getQty();
    if (!qty) return;
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Opening secure checkout…';
    if (errEl) errEl.hidden = true;
    function fail(msg) {
      btn.disabled = false;
      btn.textContent = label;
      if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
    }
    var fallback = 'Checkout is unavailable right now. Email ' + (catalog ? catalog.contactEmail : 'contact@substitoud.com') + ' and we will take your order directly.';
    fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qty: qty })
    }).then(function (res) {
      return res.json().then(function (data) { return { ok: res.ok, data: data }; });
    }).then(function (r) {
      if (r.ok && r.data && r.data.url) { window.location.href = r.data.url; return; }
      fail((r.data && r.data.error) || fallback);
    }).catch(function () { fail(fallback); });
  }

  /* ---------- drawer ---------- */
  var drawer, scrim, drawerBody, drawerFoot, lastFocus;
  function buildDrawer() {
    scrim = el('div', { class: 'so-scrim' });
    var close = el('button', { type: 'button', class: 'so-icon-btn', 'aria-label': 'Close cart',
      html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>' });
    drawerBody = el('div', { class: 'so-drawer-body' });
    drawerFoot = el('div', { class: 'so-drawer-foot' });
    drawer = el('aside', { class: 'so-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Your cart', tabindex: '-1' }, [
      el('div', { class: 'so-drawer-head' }, [el('h2', { text: 'Your cart' }), close]),
      drawerBody, drawerFoot
    ]);
    document.body.appendChild(scrim);
    document.body.appendChild(drawer);
    close.addEventListener('click', closeDrawer);
    scrim.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
      if (!drawer.classList.contains('is-open')) return;
      if (e.key === 'Escape') { closeDrawer(); return; }
      if (e.key !== 'Tab') return;
      var f = $all('a[href], button:not([disabled]), input', drawer).filter(function (n) { return n.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }
  function openDrawer() {
    if (!drawer) buildDrawer();
    renderDrawer();
    lastFocus = document.activeElement;
    drawer.classList.add('is-open');
    scrim.classList.add('is-open');
    document.body.classList.add('so-lock');
    drawer.focus();
  }
  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove('is-open');
    scrim.classList.remove('is-open');
    document.body.classList.remove('so-lock');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function renderDrawer() {
    if (!drawer || !catalog) return;
    var qty = getQty();
    drawerBody.innerHTML = '';
    drawerFoot.innerHTML = '';
    if (!qty) {
      var shopLink = el('a', { class: 'so-btn', href: 'shop.html', text: 'Shop the box' });
      drawerBody.appendChild(el('div', { class: 'so-drawer-empty' }, [el('p', { text: 'Your cart is empty.' }), shopLink]));
      drawerFoot.style.display = 'none';
      return;
    }
    drawerFoot.style.display = '';
    var p = priceFor(qty);
    drawerBody.appendChild(lineNode(p));
    var n = nudgeNode(p);
    if (n) drawerBody.appendChild(n);
    drawerFoot.appendChild(summaryNode(p));
    var err = el('p', { class: 'so-error', role: 'alert' });
    err.hidden = true;
    var go = el('button', { type: 'button', class: 'so-btn so-btn--block', text: 'Checkout' });
    go.addEventListener('click', function () { startCheckout(go, err); });
    var view = el('a', { class: 'so-btn so-btn--ghost so-btn--block', href: 'cart.html', text: 'View cart' });
    drawerFoot.appendChild(go);
    drawerFoot.appendChild(view);
    drawerFoot.appendChild(err);
  }

  /* ---------- product page ---------- */
  var shopQty = 1, shopStepper;
  function initShop() {
    var root = $('[data-shop]');
    if (!root) return;
    var tiers = catalog.product.tiers;

    var tierWrap = $('[data-tiers]', root);
    tierWrap.innerHTML = '';
    tiers.forEach(function (t, i) {
      var off = tiers[0].unitPrice - t.unitPrice;
      var b = el('button', { type: 'button', class: 'tier', 'data-min': String(t.minQty), 'aria-pressed': 'false' }, [
        el('span', { class: 'tier-qty', text: i === 0 ? '1 box' : t.minQty + ' or more' }),
        el('span', { class: 'tier-price', text: money(t.unitPrice) }),
        el('span', { class: 'tier-each', text: 'per box' }),
        el('span', { class: 'tier-save', text: i === 0 ? '' : 'Save ' + off + '\u00a2 a box' })
      ]);
      b.addEventListener('click', function () { setShopQty(t.minQty); });
      tierWrap.appendChild(b);
    });

    var slot = $('[data-stepper]', root);
    shopStepper = stepper(shopQty, 1, function (v) { setShopQty(v); }, 'Number of boxes');
    slot.innerHTML = '';
    slot.appendChild(shopStepper);

    $('[data-add]', root).addEventListener('click', function () {
      setQty(getQty() + shopQty);
      openDrawer();
    });

    $all('[data-add-qty]').forEach(function (b) {
      b.addEventListener('click', function () {
        setQty(getQty() + parseInt(b.getAttribute('data-add-qty'), 10));
        openDrawer();
      });
    });

    /* gallery: photos, plus the smoke test as a drag-to-compare video */
    var main = $('[data-gallery-main]');
    var frame = $('[data-gallery-frame]');
    var compare = $('[data-compare]');
    var caption = $('[data-compare-caption]');
    var videos = compare ? $all('video', compare) : [];
    function showVideo(on) {
      if (!compare) return;
      main.hidden = on;
      compare.hidden = !on;
      if (caption) caption.hidden = !on;
      frame.classList.toggle('is-video', on);
      videos.forEach(function (v) {
        if (on) {
          if (!v.getAttribute('src')) v.setAttribute('src', v.getAttribute('data-src'));   /* loaded only when asked for */
          var pr = v.play();
          if (pr && pr.catch) pr.catch(function () { /* autoplay refused: the poster stays */ });
        } else {
          v.pause();
        }
      });
    }
    function selectThumb(t) {
      if (t.hasAttribute('data-video')) {
        showVideo(true);
      } else {
        showVideo(false);
        main.src = t.getAttribute('data-full');
        main.alt = t.getAttribute('data-alt');
      }
      $all('[data-gallery-thumb]').forEach(function (o) { o.setAttribute('aria-current', o === t ? 'true' : 'false'); });
    }
    $all('[data-gallery-thumb]').forEach(function (t) {
      t.addEventListener('click', function () { selectThumb(t); });
    });
    $all('[data-show-smoke]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var vt = $('[data-gallery-thumb][data-video]');
        if (vt) selectThumb(vt);
        frame.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
    function openFromHash() {
      if (window.location.hash !== '#smoke-test') return;
      var first = $('[data-gallery-thumb][data-video]');
      if (first) selectThumb(first);
    }
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    initCompare(compare);

    setShopQty(1);
  }
  function initCompare(root) {
    if (!root) return;
    var before = $('.compare-side.is-before', root);
    var handle = $('[data-compare-handle]', root);
    var dragging = false;
    function set(pct) {
      pct = Math.max(0, Math.min(100, pct));
      before.style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0)';
      handle.style.left = pct + '%';
      handle.setAttribute('aria-valuenow', String(Math.round(pct)));
    }
    function fromEvent(e) {
      var r = root.getBoundingClientRect();
      set(((e.clientX - r.left) / r.width) * 100);
    }
    root.addEventListener('pointerdown', function (e) {
      dragging = true;
      if (root.setPointerCapture) { try { root.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
      fromEvent(e);
    });
    root.addEventListener('pointermove', function (e) { if (dragging) fromEvent(e); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) {
      root.addEventListener(n, function () { dragging = false; });
    });
    handle.addEventListener('keydown', function (e) {
      var cur = parseFloat(handle.style.left || '50');
      if (e.key === 'ArrowLeft') { set(cur - 4); e.preventDefault(); }
      if (e.key === 'ArrowRight') { set(cur + 4); e.preventDefault(); }
    });
  }
  function setShopQty(v) {
    shopQty = Math.max(1, Math.min(maxQty(), v));
    if (shopStepper) shopStepper.setValue(shopQty);
    var p = priceFor(shopQty);
    $all('[data-tiers] .tier').forEach(function (b, i) { b.setAttribute('aria-pressed', i === p.tierIndex ? 'true' : 'false'); });
    var now = $('[data-price-now]'), was = $('[data-price-was]'), total = $('[data-buy-total]');
    if (now) now.textContent = money(p.unit);
    if (was) { was.hidden = p.savings === 0; was.innerHTML = 'was <s>' + money(p.base) + '</s>'; }
    if (total) {
      var sticks = shopQty * catalog.product.sticksPerBox;
      total.innerHTML = '<strong>' + plural(shopQty, 'box', 'boxes') + ', ' + sticks + ' sticks: ' + money(p.subtotal) + '</strong> with free US shipping.' +
        (p.savings > 0 ? ' <span class="save">You save ' + money(p.savings) + '.</span>' : '') +
        (p.next ? ' Add ' + plural(p.next.need, 'more box', 'more boxes') + ' and each one is ' + money(p.next.unitPrice) + '.' : '');
    }
    var add = $('[data-add]');
    if (add) add.textContent = 'Add ' + plural(shopQty, 'box', 'boxes') + ' to cart';
  }

  /* ---------- cart page ---------- */
  function renderCartPage() {
    var root = $('[data-cart]');
    if (!root || !catalog) return;
    var qty = getQty();
    var filled = $('[data-cart-filled]', root), empty = $('[data-cart-empty]', root);
    filled.hidden = qty === 0;
    empty.hidden = qty !== 0;
    if (!qty) return;
    var p = priceFor(qty);
    var items = $('[data-cart-items]', root);
    items.innerHTML = '';
    items.appendChild(lineNode(p));
    var n = nudgeNode(p);
    if (n) items.appendChild(n);
    var sum = $('[data-cart-summary]', root);
    sum.innerHTML = '';
    sum.appendChild(summaryNode(p));
  }
  function initCartPage() {
    var root = $('[data-cart]');
    if (!root) return;
    var go = $('[data-checkout]', root), err = $('[data-checkout-error]', root);
    go.addEventListener('click', function () { startCheckout(go, err); });
    if (/[?&]checkout=cancelled/.test(window.location.search)) {
      var note = $('[data-cancelled]', root);
      if (note) note.hidden = false;
    }
  }

  /* ---------- form validation ---------- */
  function validate(form) {
    var ok = true, first = null;
    $all('[data-required]', form).forEach(function (f) {
      var v = (f.value || '').trim();
      var msg = '';
      if (!v) msg = f.getAttribute('data-required') || 'This field is required.';
      else if (f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) msg = 'Enter an email address like name@example.com.';
      else if (f.hasAttribute('data-zip') && !/^\d{5}(-\d{4})?$/.test(v)) msg = 'Enter a 5-digit ZIP code.';
      else if (f.hasAttribute('data-phone') && v.replace(/\D/g, '').length < 10) msg = 'Enter a phone number with area code.';
      var errNode = $('#' + f.id + '-error', form);
      if (errNode) errNode.textContent = msg;
      f.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (msg) { ok = false; if (!first) first = f; }
    });
    if (first) first.focus();
    return ok;
  }
  /* ---------- order confirmation ---------- */
  function showState(name) {
    $all('[data-state]').forEach(function (s) { s.hidden = s.getAttribute('data-state') !== name; });
  }
  function renderOrder(o) {
    $all('[data-o="ref"]').forEach(function (n) { n.textContent = o.reference; });
    $all('[data-o="email"]').forEach(function (n) { n.textContent = o.email || 'the email you gave at checkout'; });
    $all('[data-o="first"]').forEach(function (n) { n.textContent = o.name ? ', ' + o.name.split(' ')[0] : ''; });
    var a = o.address || {};
    var addr = [o.name, a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', ') + (a.postal_code ? ' ' + a.postal_code : ''), a.country === 'US' ? 'United States' : a.country]
      .filter(function (x) { return x && String(x).trim(); }).map(esc).join('<br>');
    var addrNode = $('[data-o="address"]');
    if (addrNode) addrNode.innerHTML = addr || 'Shown on your email receipt.';
    var contactNode = $('[data-o="contact"]');
    if (contactNode) contactNode.textContent = [o.email, o.phone].filter(Boolean).join(', ');
    var rows = (o.items || []).map(function (it) {
      return '<div><dt>' + esc(plural(it.qty, 'box', 'boxes')) + (it.unit != null ? ' at ' + money(it.unit) : '') + '</dt><dd>' + money(it.total) + '</dd></div>';
    }).join('');
    if (o.discount) rows += '<div class="so-sum-save"><dt>Discount</dt><dd>−' + money(o.discount) + '</dd></div>';
    rows += '<div><dt>Shipping in the US</dt><dd>' + (o.shipping ? money(o.shipping) : 'Free') + '</dd></div>';
    if (o.tax) rows += '<div><dt>Sales tax</dt><dd>' + money(o.tax) + '</dd></div>';
    rows += '<div class="so-sum-total"><dt>Total paid</dt><dd>' + money(o.total) + '</dd></div>';
    var sum = $('[data-o="summary"]');
    if (sum) sum.innerHTML = rows;
    showState(o.paid ? 'ok' : 'pending');
  }
  function initConfirm() {
    if (!$('[data-confirm]')) return;
    var q = window.location.search;
    var m = q.match(/[?&]session_id=([^&]+)/);
    if (!m) { showState('missing'); return; }
    fetch('/api/order?session_id=' + encodeURIComponent(decodeURIComponent(m[1])))
      .then(function (res) { if (!res.ok) throw new Error('not found'); return res.json(); })
      .then(function (o) {
        if (o.paid) setQty(0);
        renderOrder(o);
      })
      .catch(function () { showState('error'); });
  }

  /* ---------- wholesale inquiry ---------- */
  function initWholesale() {
    var form = $('[data-wholesale]');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate(form)) return;
      var d = {};
      $all('input, select, textarea', form).forEach(function (f) { if (f.name) d[f.name] = f.value.trim(); });
      var lines = [
        'Name: ' + d.name,
        'Organization: ' + d.org,
        'Type: ' + d.type,
        'Email: ' + d.email,
        'Phone: ' + (d.phone || 'not given'),
        'City and state: ' + d.location,
        'Boxes per order: ' + d.volume,
        '',
        d.message || ''
      ];
      var to = (catalog && catalog.contactEmail) || 'contact@substitoud.com';
      var body = lines.join('\n');
      var href = 'mailto:' + to + '?subject=' + encodeURIComponent('Wholesale inquiry: ' + d.org) + '&body=' + encodeURIComponent(body);
      var sent = $('[data-sent]');
      $('[data-sent-text]').textContent = body;
      $('[data-sent-link]').setAttribute('href', href);
      sent.hidden = false;
      sent.scrollIntoView({ block: 'center', behavior: 'smooth' });
      window.location.href = href;
    });
  }

  /* ---------- boot ---------- */
  function renderAll() {
    renderBadge();
    if (!catalog) return;
    renderDrawer();
    renderCartPage();
  }

  initNav();
  renderBadge();
  window.addEventListener('storage', function (e) { if (e.key === KEY) renderAll(); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) renderAll(); });

  fetch('store/catalog.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (c) {
      catalog = c;
      initShop();
      initCartPage();
      initConfirm();
      initWholesale();
      renderAll();
    })
    .catch(function () {
      /* The catalog did not load. Static prices in the page stay visible; say so where it matters. */
      $all('[data-checkout-error]').forEach(function (n) {
        n.textContent = 'The store could not load. Refresh the page, or email contact@substitoud.com to order.';
        n.hidden = false;
      });
    });
}());
