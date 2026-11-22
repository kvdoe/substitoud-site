/* SubstitOud store: server logic shared by Cloudflare (_worker.js) and Vercel (api/).
   Prices are never taken from the browser. The browser sends a box count;
   the price is worked out here from store/catalog.json. */

function unitPriceFor(catalog, qty) {
  var tiers = catalog.product.tiers, price = tiers[0].unitPrice;
  for (var i = 0; i < tiers.length; i++) {
    if (qty >= tiers[i].minQty) price = tiers[i].unitPrice;
  }
  return price;
}

function priceCart(catalog, qty) {
  var base = catalog.product.tiers[0].unitPrice;
  var unit = unitPriceFor(catalog, qty);
  return { qty: qty, unit: unit, base: base, subtotal: unit * qty, savings: (base - unit) * qty };
}

function storeMode(env) {
  var key = (env && env.STRIPE_SECRET_KEY) || '';
  if (/^(sk|rk)_live_/.test(key)) return 'live';
  if (/^(sk|rk)_test_/.test(key)) return 'test';
  return 'off';
}

function formEncode(params) {
  return Object.keys(params).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
}

async function stripeRequest(env, fetchImpl, method, path, params) {
  var init = {
    method: method,
    headers: { Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY }
  };
  var url = 'https://api.stripe.com/v1' + path;
  if (method === 'POST') {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = formEncode(params || {});
  } else if (params) {
    url += '?' + formEncode(params);
  }
  var res = await fetchImpl(url, init);
  var data = await res.json().catch(function () { return {}; });
  return { ok: res.ok, status: res.status, data: data };
}

function checkoutParams(catalog, cart, origin, env, email) {
  var p = catalog.product, s = catalog.shipping;
  var sticks = cart.qty * p.sticksPerBox;
  var params = {
    'mode': 'payment',
    'success_url': origin + '/order-confirmed.html?session_id={CHECKOUT_SESSION_ID}',
    'cancel_url': origin + '/cart.html?checkout=cancelled',
    'line_items[0][quantity]': cart.qty,
    'line_items[0][price_data][currency]': catalog.currency,
    'line_items[0][price_data][unit_amount]': cart.unit,
    'line_items[0][price_data][product_data][name]': p.name,
    'line_items[0][price_data][product_data][description]':
      p.sticksPerBox + ' sticks per box, ' + p.netWeight + '. ' + sticks + ' sticks in this order.',
    'line_items[0][price_data][product_data][images][0]': origin + '/' + p.image,
    'shipping_options[0][shipping_rate_data][type]': 'fixed_amount',
    'shipping_options[0][shipping_rate_data][display_name]': s.label,
    'shipping_options[0][shipping_rate_data][fixed_amount][amount]': s.amount,
    'shipping_options[0][shipping_rate_data][fixed_amount][currency]': catalog.currency,
    'shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]': 'business_day',
    'shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]': s.minBusinessDays,
    'shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]': 'business_day',
    'shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]': s.maxBusinessDays,
    'phone_number_collection[enabled]': 'true',
    'allow_promotion_codes': 'true',
    'metadata[boxes]': cart.qty,
    'metadata[unit_price]': cart.unit,
    'metadata[bundle_savings]': cart.savings,
    'payment_intent_data[description]': 'SubstitOud web order: ' + cart.qty + (cart.qty === 1 ? ' box' : ' boxes')
  };
  s.countries.forEach(function (c, i) {
    params['shipping_address_collection[allowed_countries][' + i + ']'] = c;
  });
  if (email) params['customer_email'] = email;
  if (env && env.STRIPE_AUTOMATIC_TAX === '1') params['automatic_tax[enabled]'] = 'true';
  return params;
}

function orderSummary(session) {
  var ship = session.shipping_details ||
    (session.collected_information && session.collected_information.shipping_details) || null;
  var cust = session.customer_details || {};
  var items = ((session.line_items && session.line_items.data) || []).map(function (li) {
    return {
      name: li.description,
      qty: li.quantity,
      unit: li.price ? li.price.unit_amount : null,
      total: li.amount_total
    };
  });
  var ref = String(session.payment_intent || session.id || '');
  if (ref && typeof session.payment_intent === 'object' && session.payment_intent) ref = session.payment_intent.id;
  return {
    reference: 'SO-' + ref.slice(-8).toUpperCase(),
    paid: session.payment_status === 'paid' || session.payment_status === 'no_payment_required',
    status: session.status,
    email: cust.email || session.customer_email || null,
    phone: cust.phone || (ship && ship.phone) || null,
    name: (ship && ship.name) || cust.name || null,
    address: ship && ship.address ? ship.address : null,
    items: items,
    subtotal: session.amount_subtotal,
    discount: session.total_details ? session.total_details.amount_discount : 0,
    shipping: session.total_details ? session.total_details.amount_shipping : 0,
    tax: session.total_details ? session.total_details.amount_tax : 0,
    total: session.amount_total,
    currency: session.currency,
    livemode: !!session.livemode
  };
}

/* input: { method, path, query, body, origin, host, env, catalog, fetchImpl }
   output: { status, body } */
async function handleApi(input) {
  var catalog = input.catalog, env = input.env || {};
  var mode = storeMode(env);
  var path = input.path.replace(/\/+$/, '');

  if (path === '/api/config' && input.method === 'GET') {
    return { status: 200, body: { mode: mode } };
  }

  if (path === '/api/checkout') {
    if (input.method !== 'POST') return { status: 405, body: { error: 'Use POST.' } };
    var qty = Number(input.body && input.body.qty);
    var max = catalog.product.maxPerOrder;
    if (!Number.isInteger(qty) || qty < 1) {
      return { status: 400, body: { error: 'Your cart is empty.' } };
    }
    if (qty > max) {
      return { status: 400, body: { error: 'Online orders are limited to ' + max + ' boxes. For larger orders, use the wholesale form.' } };
    }
    var cart = priceCart(catalog, qty);
    if (mode === 'off') {
      return { status: 503, body: { error: 'Checkout is unavailable right now. Email ' + catalog.contactEmail + ' to place your order.' } };
    }
    var email = input.body && typeof input.body.email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.body.email)
      ? input.body.email : null;
    var r = await stripeRequest(env, input.fetchImpl, 'POST', '/checkout/sessions',
      checkoutParams(catalog, cart, input.origin, env, email));
    if (!r.ok || !r.data.url) {
      var detail = r.data && r.data.error && r.data.error.message;
      return { status: 502, body: { error: 'The payment page could not be opened. Try again in a moment.', detail: mode === 'test' ? detail : undefined } };
    }
    return { status: 200, body: { mode: mode, url: r.data.url } };
  }

  if (path === '/api/order' && input.method === 'GET') {
    var id = String((input.query && input.query.session_id) || '');
    if (mode === 'off' || !/^cs_(test|live)_[A-Za-z0-9]{10,}$/.test(id)) {
      return { status: 404, body: { error: 'Order not found.' } };
    }
    var o = await stripeRequest(env, input.fetchImpl, 'GET', '/checkout/sessions/' + id, { 'expand[]': 'line_items' });
    if (!o.ok) return { status: 404, body: { error: 'Order not found.' } };
    return { status: 200, body: orderSummary(o.data) };
  }

  return { status: 404, body: { error: 'Not found.' } };
}

/* ---------- Cloudflare Pages adapter (advanced mode) ---------- */
export default {
  async fetch(request, env) {
    var url = new URL(request.url);
    if (url.pathname.indexOf('/api/') !== 0) return env.ASSETS.fetch(request);
    var headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
    try {
      var catRes = await env.ASSETS.fetch(new Request(new URL('/store/catalog.json', url.origin)));
      var catalog = await catRes.json();
      var body = null;
      if (request.method === 'POST') body = await request.json().catch(function () { return null; });
      var query = {};
      url.searchParams.forEach(function (v, k) { query[k] = v; });
      var out = await handleApi({
        method: request.method, path: url.pathname, query: query, body: body,
        origin: url.origin, host: url.host, env: env, catalog: catalog,
        fetchImpl: function (u, i) { return fetch(u, i); }
      });
      return new Response(JSON.stringify(out.body), { status: out.status, headers: headers });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Something went wrong on our side. Try again in a moment.' }), { status: 500, headers: headers });
    }
  }
};
