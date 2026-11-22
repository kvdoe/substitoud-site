# SubstitOud website and store

Static site plus a small checkout API. The same files run on Vercel (preview) and Cloudflare Pages (production).

## What is where

| Path | What it is |
| --- | --- |
| `index.html`, `about.html`, `team.html`, `news.html` | The original pages, with the shared nav, footer and buy buttons added |
| `shop.html` | Product page: gallery, price tiers, add to cart |
| `cart.html` | Cart and order summary, starts checkout |
| `order-confirmed.html` | Confirmation page shown after payment |
| `wholesale.html`, `faq.html`, `shipping-returns.html`, `privacy.html`, `terms.html`, `404.html` | Supporting pages |
| `store/catalog.json` | Prices, tiers, order limit, shipping. **This is what customers are charged.** |
| `store/store.js`, `store/chrome.css`, `store/store.css` | Cart logic and styles |
| `_worker.js`, `_routes.json` | Checkout API for Cloudflare Pages |
| `api/` , `vercel.json` | The same checkout API for Vercel |

## How checkout works

1. The cart lives in the visitor's browser. Only the number of boxes is sent to the server.
2. `/api/checkout` works out the price from `store/catalog.json` and creates a Stripe Checkout session.
3. Stripe's hosted page collects the email, US shipping address and payment.
4. Stripe sends the customer back to `order-confirmed.html`, which reads the order from `/api/order`.

Orders, addresses and refunds are managed in the Stripe dashboard.

## Connecting Stripe

Checkout needs one environment variable, `STRIPE_SECRET_KEY`, set on the host (Vercel and Cloudflare Pages each have their own).

| Key | What happens at checkout |
| --- | --- |
| not set | The cart shows "Checkout is unavailable right now" with the contact email. |
| `sk_test_...` | Stripe's page opens in test mode. Card 4242 4242 4242 4242, no real charge. |
| `sk_live_...` | Real payments. |

Stripe's page collects the email, phone number and US shipping address, all required.

Sales tax: once Stripe Tax is activated in the dashboard (head office address and at least one registration), set `STRIPE_AUTOMATIC_TAX` to `1`. Checkout then adds the tax for the buyer's shipping address on top of the price.

Setup check, test keys only: open `/api/config?diagnose=1` to see whether Stripe accepts the key and whether Stripe Tax is ready.

## Changing prices

Edit `store/catalog.json`. Prices are in cents. The cart, the price tiles on the shop page and the amount charged all follow it.

Prices are also printed as plain text in a few places that need a manual edit: the "Before you buy" answer in `shop.html`, the price list and hero button in `index.html`, and the bundle table in `faq.html`.

## Local preview

```
node dev-server.js
```

Then open http://localhost:4173.
