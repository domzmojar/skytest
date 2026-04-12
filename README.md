[README.md](https://github.com/user-attachments/files/26659023/README.md)
# 🍔 Sky Sweet Treats v2 — Setup Guide

## Files
```
index.html       ← Main website
css/style.css    ← All styling
js/menu.js       ← Fetches Google Sheet, renders menu
js/cart.js       ← Cart drawer
js/checkout.js   ← Multi-step checkout → Messenger
README.md        ← This file
```

---

## Your Google Sheet Column Guide

Row 1 headers (exact spelling):

| Column      | Values / Notes                                      |
|-------------|-----------------------------------------------------|
| name        | Item name — required                                |
| category    | Anything you want (Burgers, Drinks, etc.) — drives filter tabs automatically |
| description | Short description shown on card                     |
| price       | ₱189 or 189                                         |
| stock       | `available` / `low` / `out of stock`               |
| badge       | `bestseller` / `new` / `spicy` — or leave blank    |
| emoji       | 🍔 🍟 🥤 🍫 — shown if no image                   |
| image_url   | Direct image link (optional)                        |

**Categories are 100% dynamic** — whatever you type in the `category` column automatically becomes a filter tab. No code changes needed.

---

## Deploy Free on GitHub Pages

1. Create account at github.com
2. New repository → `sky-sweet-treats`
3. Upload all files
4. Settings → Pages → main branch → Save
5. Live at: `https://YOUR-USERNAME.github.io/sky-sweet-treats/`

---

## Checkout Flow

1. Customer fills in Name + Phone (required)
2. Chooses Delivery (with address) or Pick Up
3. Picks payment: COD / COP / GCash
4. Reviews full order summary
5. Taps "Place Order" → Messenger opens with order pre-filled → they hit Send

---

## GCash Number

Update your GCash number in `js/checkout.js`:
Search for `09XX-XXX-XXXX` and replace with your real GCash number.
