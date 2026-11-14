# LEPDO Accounting — Brand Refresh (November 2026)

This release applies the LEPDO Brand Guidelines (Nov 2026) to the existing
accounting application. **It is a visual change only.** Layouts, navigation,
features, calculations, roles, permissions, the database schema, Supabase
integration and every business workflow are exactly as they were.

What changed:

| Area | Before | After |
|---|---|---|
| Logo | Lowercase "Lepdo" script + diamond (Lovable CDN image) | Official uppercase LEPDO wordmark with looping O, exact vector artwork from the guideline PDF |
| Colours | Navy `#2D2D61`-ish + gold `#E2AE40` | Indigo `#2329A8`, Orange `#FF6624`, Cream `#F2E7E1`, Blue `#355CF5`, Amber `#FF9B29` + official neutrals |
| Typography | Manrope + Sora (Google Fonts CDN) | Inter 400/500/600/700, self-hosted in `public/fonts` |
| Icons | Lucide, stroke 2 | Same Lucide set, unified 1.75 rounded outline stroke; Indigo icons, Orange for the active item |
| Documents | Times New Roman invoice, Arial reports, default jsPDF teal | Inter, Indigo headers, Orange rules, Amber labels on Indigo |

---

## 1. Install and run

The stack is unchanged: TanStack Start + React 19 + Vite + Tailwind CSS v4 + Supabase.

```sh
# 1. Environment: use your existing .env (it is NOT included in this ZIP)
cp .env.example .env        # then paste your existing values

# 2. Install
npm install                 # or: bun install  (bun.lock is unchanged)

# 3. Develop
npm run dev

# 4. Production build
npm run build
npm run preview             # serve the build locally
```

No dependency was added or removed, so `package.json` and `bun.lock` are identical
to the version you supplied.

### Lovable
Import or push this folder to the GitHub repository connected to your Lovable
project (or replace the project files). Lovable keeps managing the environment
variables itself; nothing about the Supabase connection changed.

### Deployment
Deploy exactly as before (Lovable publish, or `npm run build` and your existing
Cloudflare / Nitro target). The new files in `public/fonts/` and
`src/assets/brand/` are bundled or served automatically.

---

## 2. Design tokens

All colours live in `src/styles.css` under `:root`:

```css
--brand-orange: #FF6624;  --brand-indigo: #2329A8;  --brand-cream: #F2E7E1;
--brand-blue:   #355CF5;  --brand-amber:  #FF9B29;
--brand-black / dark-grey / mid-grey / light-grey / white  (official neutrals)
```

The existing token names (`navy`, `gold`, `gold-tint`, `sl-*`, `pu-*`, `cat-*`,
`chart-*` …) were kept and now resolve to the LEPDO palette, which is why no
component logic had to change. New utility classes are available:
`bg-brand-orange`, `text-brand-indigo`, `text-brand-amber`, `text-gold-ink`, etc.

**Usage applied**

- Indigo: headings, navigation band, primary buttons, links, table headers in documents.
- Orange: active-navigation marker and icon, highlight rules, profit card border, invoice ornaments. Never used as small text on white (2.9:1).
- Cream: selected navigation row, highlight cards, soft canvas tint (`#FAF7F5`).
- Blue: focus rings, informational / transfer / advance states, chart series.
- Amber: labels on Indigo (approved pairing 5.1:1), demo badge.
- Financial meaning is preserved: green = received / paid / profit, red = pending / overdue / loss, amber-brown = part-paid / unpaid.

**Accessibility shades.** Two derived shades exist only for small text because
the official colours fail WCAG AA there: `--brand-orange-ink #B83C0A` (5.7:1 on
white) and `--brand-grey-ink #5E636A` (6.1:1 on white). All other brand-on-brand
text uses the guideline's approved pairings.

---

## 3. Logo

`src/assets/brand/` contains the official logo as SVG, extracted path-for-path
from page 15 ("Logo Backgrounds") of `LEPDO_IDENTITY.pdf`, in the colourways that page approves:

| File | Use on |
|---|---|
| `lepdo-logo-cream-orange-on-indigo.svg` | Indigo panels (sidebar band, login, reset password, invoice header) |
| `lepdo-logo-indigo-on-light.svg` | Cream / white / Orange / Amber backgrounds |
| `lepdo-logo-indigo-orange-on-cream.svg` | Cream, large sizes |
| `lepdo-logo-black-on-white.svg` | Monochrome documents |
| `lepdo-logo-white.svg` | Black / Dark Grey / Blue backgrounds |
| `lepdo-logo-white-on-black-master.png` | The master file you supplied (archived) |

Nothing was redrawn, recoloured, cropped or separated. Sizes used: 150 px wide in
the sidebar (the guideline minimum), 180 px on the login and reset-password cards, and about 225 px on invoices.

---

## 4. Interactive demo preview (optional)

`preview-demo/` is a **separate, clearly labelled demo kit** that runs the
rebranded UI on invented sample data with an in-memory stand-in for Supabase.
It never reads `.env` and is not imported by the production app.

- `preview-demo/LEPDO_Demo_Preview.html`: open it in any browser. It runs offline as a single file.
- Run the demo live: `VITE_SUPABASE_URL=https://demo.invalid VITE_SUPABASE_PUBLISHABLE_KEY=demo npx vite dev --config preview-demo/vite.demo.config.ts`
- Rebuild the single-file demo: `npx vite build --config preview-demo/spa/vite.spa.config.ts`

Downloads, printing and email backup do nothing inside the demo.

You can delete the `preview-demo/` folder at any time without affecting the app.

---

See also `CHANGED_FILES.md` and `TESTING_REPORT.md` in this folder.
