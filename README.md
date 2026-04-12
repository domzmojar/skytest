# 🍔 Sky Sweet Treats — Online Menu

A premium dark-luxury online menu. Free hosting. Auto-updating stock.
No servers. No monthly fees. Just a Google Sheet.

---

## 🗂️ File Structure

```
sky-sweet-treats/
├── index.html          ← Your menu website
├── css/
│   └── style.css       ← All styles
├── js/
│   └── menu.js         ← Fetches from Google Sheets & renders cards
└── README.md           ← This file
```

---

## 🚀 STEP 1 — Set Up Your Google Sheet (Free Database)

This is your admin panel. Edit items here and the website updates automatically.

1. Go to **https://sheets.google.com** → Create a new sheet
2. Name it: `Sky Sweet Treats Menu`
3. Set up **Row 1** with these exact column headers:

| name | category | description | price | stock | badge | emoji | image_url |
|------|----------|-------------|-------|-------|-------|-------|-----------|

### Column Guide:

| Column | What to enter | Examples |
|--------|--------------|---------|
| `name` | Item name | Sky Classic Burger |
| `category` | Filter group | `burgers` `sides` `drinks` `desserts` |
| `description` | Short description | Double smash patty, aged cheddar… |
| `price` | Price with ₱ | `₱189` |
| `stock` | Stock status | `available` `low` `out of stock` |
| `badge` | Optional badge | `bestseller` `new` `spicy` *(or leave blank)* |
| `emoji` | Fallback icon | 🍔 🍟 🥤 🍫 |
| `image_url` | Optional photo URL | https://... *(or leave blank)* |

### Sample Data to Paste:

```
name,category,description,price,stock,badge,emoji,image_url
Sky Classic,burgers,Double smash patty aged cheddar caramelised onions house sauce,₱189,available,bestseller,🍔,
Crispy Chicken,burgers,Buttermilk fried chicken slaw jalapeño aioli pickles,₱175,available,spicy,🌶️,
Loaded Fries,sides,Golden fries cheese sauce bacon bits spring onion,₱89,available,,🍟,
Sky Shake,drinks,Thick salted caramel milkshake whipped cream,₱129,available,bestseller,🥤,
Lava Cake,desserts,Warm molten chocolate cake vanilla ice cream,₱119,low,new,🍫,
```

---

## 🔗 STEP 2 — Publish Your Sheet as a CSV

1. In Google Sheets: **File → Share → Publish to web**
2. Set: **Sheet1** → **Comma-separated values (.csv)**
3. Click **Publish** → Copy the URL
4. Open `js/menu.js` in a text editor
5. Find this line near the top:
   ```js
   const SHEET_CSV_URL = 'YOUR_GOOGLE_SHEET_CSV_URL_HERE';
   ```
6. Replace `YOUR_GOOGLE_SHEET_CSV_URL_HERE` with your copied URL

---

## 🌐 STEP 3 — Deploy for Free on GitHub Pages

1. Create a free account at **https://github.com**
2. Click **New Repository** → Name it: `sky-sweet-treats`
3. Upload all your files (drag & drop the entire folder)
4. Go to **Settings → Pages**
5. Under *Source*, select **main branch** → Save
6. Your site will be live at:
   ```
   https://YOUR-USERNAME.github.io/sky-sweet-treats/
   ```

That's it! Free hosting, forever. ✅

---

## ✏️ How to Update Your Menu

| Task | What to do |
|------|-----------|
| Add a new item | Add a new row in your Google Sheet |
| Remove an item | Delete the row |
| Mark as sold out | Change `stock` column to `out of stock` |
| Change a price | Edit the `price` column |
| Show low stock | Change `stock` to `low` |

Changes appear on your website within **2 minutes** (auto-refresh).
You can also just reload the page to see changes immediately.

---

## 🖼️ Adding Photos (Optional)

1. Upload your food photo to **https://imgur.com** or **https://postimages.org** (free)
2. Copy the **direct image link** (ending in `.jpg` or `.png`)
3. Paste it in the `image_url` column of your sheet

---

## 🎨 Customizing Colors

Open `css/style.css` and find the `:root` section at the top.
Change `--gold` to any color you like.

---

## 🆘 Need Help?

- Menu not loading? → Check your CSV URL in `js/menu.js`
- Items not showing? → Make sure column headers match exactly
- Site not live? → Check GitHub Pages is enabled in repo Settings

