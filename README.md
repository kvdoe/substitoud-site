# SubstitOud website and store

Static site plus a small checkout API. The same files run on Vercel (preview) and Cloudflare Pages (production).

## What is where

| Path | What it is |
| --- | --- |
| `index.html`, `about.html`, `team.html`, `news.html` | The original pages, with the shared nav, footer and buy buttons added |
| `shop.html` | Product page: gallery, price tiers, add to cart |
| `cart.html` | Cart and order summary, starts checkout |
| `order-confirmed.html` | Confirmation page shown after payment |
| `test-checkout.html` | Stand-in payment step, used only while Stripe is not connected |
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

## Store modes

The mode depends on the `STRIPE_SECRET_KEY` environment variable.

| Key | Mode | What happens at checkout |
| --- | --- | --- |
| none, on a preview address | `demo` | Goes to `test-checkout.html`. No payment. |
| none, on substitoud.com | `off` | Shows "checkout is not switched on yet, email us". |
| `sk_test_...` | `test` | Real Stripe page in test mode. Card 4242 4242 4242 4242. |
| `sk_live_...` | `live` | Real payments. |

Optional: set `STRIPE_AUTOMATIC_TAX` to `1` to have Stripe Tax calculate sales tax (Stripe Tax must be set up in the dashboard first).

## Changing prices

Edit `store/catalog.json`. Prices are in cents. The cart, the price tiles on the shop page and the amount charged all follow it.

Prices are also printed as plain text in a few places that need a manual edit: the tier table and "Before you buy" answer in `shop.html`, the price list and hero button in `index.html`, and the bundle table in `faq.html`.

## Local preview

```
node dev-server.js
```

Then open http://localhost:4173.
