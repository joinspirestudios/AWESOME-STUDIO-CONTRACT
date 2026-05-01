# AWESOME — Brand Design Agreement (v4)

Interactive web-based contract for **THE AWESOME DESIGN STUDIO LTD** — built to be deployed on Vercel with Dropbox Sign integration.

**v4 change:** the document sent to Dropbox Sign is now generated dynamically from the client's filled-in form state, using server-side headless Chromium rendering. Previously, a static blank PDF was sent regardless of what the client filled in. The signed contract now reflects every choice and field the client entered.

---

## What's new in v4

### Dynamic PDF generation
- New endpoint `/api/generate-pdf` renders the live contract HTML to PDF using `puppeteer-core` + `@sparticuz/chromium-min`.
- New shared library `/lib/render-contract-pdf.js` is used by both `/api/sign.js` (for the document Dropbox Sign signs) and `/api/generate-pdf.js` (for the Download PDF button). Both paths produce byte-identical PDFs.
- The generated PDF reflects: client name, address, email, phone, country, tier, start/end dates, payment structure (including custom split text), project brief, project name, industry, portfolio delay choice, custom variations, special terms — and all the country-aware (NGN/USD, Lagos/arbitration) and tier-aware (Strategy phase visibility, Schedule A highlight) swaps.

### Print-mode rendering of the live page
- The frontend handles a `?print=1&state=<base64-json>` URL parameter.
- When present: skip localStorage restore, apply the injected state, freeze form inputs into static spans, signal `body.print-ready` so the headless renderer knows to call `page.pdf()`.
- The `@media print` stylesheet (already in v3) handles hiding the topbar, sidebar, sign CTA block, etc.

### Static PDF kept as fallback only
- `pdf/AWESOME_Brand_Design_Agreement.pdf` is still on disk and read by `/api/sign.js` only if dynamic rendering fails.
- If the fallback fires, a `[CRITICAL]` error is logged to Vercel function logs so it doesn't go unnoticed. Investigate immediately if you see one — clients in that signing session received a blank template.

### Download PDF button rewired
- `#downloadBtn` now POSTs to `/api/generate-pdf` and triggers a browser download of the dynamic PDF.
- The old `window.print()` flow remains as `downloadFilledPDFViaPrint()` and is auto-invoked if the server-side call fails.

### Latency hint on Sign button
- After 5 seconds of waiting for `/api/sign`, the status message updates to "this may take a few seconds — generating a personalized PDF".
- First cold start can take 8–15s due to Chromium boot + tarball download. Subsequent renders within the same warm container: 2–4s.

---

## Quick start (5 minutes)

```bash
# 1. Get the code on GitHub
git init
git add .
git commit -m "AWESOME contract v4 — dynamic PDF rendering"
git remote add origin https://github.com/YOUR_USERNAME/awesome-contract.git
git push -u origin main

# 2. Connect to Vercel
# - Go to vercel.com → New Project → Import this repo
# - Click Deploy (npm install will run automatically and pull puppeteer-core + chromium-min)

# 3. Add environment variables in Vercel dashboard
# - DROPBOX_SIGN_API_KEY      (existing — required)
# - DROPBOX_SIGN_CLIENT_ID    (existing — only if using embedded mode)
# - DROPBOX_SIGN_MODE         (existing — set to "email" to start)
# - PDF_RENDER_BASE_URL       (NEW — optional, see below)
# - CHROMIUM_PACK_URL         (NEW — optional, see below)
```

### New optional environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PDF_RENDER_BASE_URL` | auto-detected from Vercel | The URL the headless browser navigates to. Use this if you have a custom domain like `contract.awesomebydesign.studio`. Set to e.g. `https://contract.awesomebydesign.studio` (no trailing slash needed). |
| `CHROMIUM_PACK_URL` | `https://github.com/Sparticuz/chromium/releases/download/v140.0.0/chromium-v140.0.0-pack.x64.tar` | Override the chromium tarball location. Only useful if GitHub's CDN is rate-limiting or unreachable from Vercel's region. |

If you don't set `PDF_RENDER_BASE_URL`, the function uses these in priority order: `VERCEL_PROJECT_PRODUCTION_URL` → `VERCEL_URL` → `localhost:3000`. The Vercel-provided variables work for default `*.vercel.app` deployments.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (client)                                            │
│  ┌──────────────────┐                                        │
│  │ index.html       │                                        │
│  │  Normal mode →   │ Renders interactive contract           │
│  │  Print mode →    │ ?print=1&state=<base64>                │
│  └──────┬───────────┘                                        │
│         │ POST /api/sign       POST /api/generate-pdf        │
└─────────┼───────────────────────────┼───────────────────────┘
          ▼                           ▼
┌─────────────────────┐    ┌──────────────────────────┐
│ /api/sign.js        │    │ /api/generate-pdf.js     │
│  1. Render PDF →────┼────┤  Render PDF →            │
│  2. Send to         │    │  Stream PDF buffer back  │
│     Dropbox Sign    │    └────────┬─────────────────┘
│  3. Email signers   │             │
└─────────┬───────────┘             │
          │   ┌─────────────────────┘
          ▼   ▼
    ┌──────────────────────────────────┐
    │ /lib/render-contract-pdf.js      │
    │  puppeteer-core +                │
    │  @sparticuz/chromium-min         │
    │                                  │
    │  navigates → ?print=1&state=...  │
    │  waits → body.print-ready        │
    │  page.pdf() → buffer             │
    └──────────────────────────────────┘
```

Both PDF-producing API endpoints share `/lib/render-contract-pdf.js`. The browser caches the headless Chromium instance across warm invocations to avoid 3–8s of boot time per request.

---

## Project structure

```
awesome-contract/
├── index.html              ← The interactive contract (now also handles print mode)
├── package.json            ← Adds puppeteer-core + @sparticuz/chromium-min
├── vercel.json             ← Updated function memory + maxDuration + includeFiles
├── README.md               ← You are here
├── api/
│   ├── sign.js             ← Dropbox Sign integration (now uses dynamic PDF)
│   ├── generate-pdf.js     ← NEW: Endpoint for the Download button
│   └── submit.js           ← Form submission logger (unchanged)
├── lib/
│   └── render-contract-pdf.js   ← NEW: shared headless-Chromium PDF renderer
├── assets/
│   ├── fonts/              ← PP Editorial New + ZT Nature (.woff2)
│   ├── logo/               ← awęsome wordmark
│   └── seal/               ← Custom wax seal SVG
└── pdf/
    └── AWESOME_Brand_Design_Agreement.pdf   ← Fallback only (logged when used)
```

---

## How the reactive content works (unchanged from v3)

- **Country selector** → Local (Nigeria) clients see NGN payment terms + Lagos courts. International clients see USD + arbitration.
- **Tier selector** → Phase Structure table hides Strategy row for AWESOME START. Schedule A highlights the chosen tier and dims the others.
- **Start date picker** → Auto-calculates estimated completion based on tier duration (4 / 8 / 12 weeks).
- **Client name field** → "For [Name]" appears under the Promise note, "Prepared for [Name]" appears in the Sign block, the Section 1 alias paragraph swaps in the legal name.
- **Project Brief** → Section 2.4 and Schedule B's Project Brief Summary are bidirectionally synced.
- **Payment structure** → Selecting "Custom split" reveals a textarea.

State is persisted to `localStorage` so a client can refresh without losing progress.

---

## Sign button → Dropbox Sign

Clicking **Sign with Dropbox Sign**:

1. POSTs the form data to `/api/submit` (logged for tracking)
2. POSTs to `/api/sign` which:
   - Generates a personalized PDF via `lib/render-contract-pdf.js` (~2-15s depending on cold/warm state)
   - Falls back to `pdf/AWESOME_Brand_Design_Agreement.pdf` if generation fails (logs `[CRITICAL]`)
   - Creates a Dropbox Sign signature request with the PDF
   - Sets up two signers: Kehinde Awe + the client
3. Depending on `DROPBOX_SIGN_MODE`:
   - **`email`** (default) → both parties get email links to sign
   - **`embedded`** → opens an in-page signing modal

---

## Environment variables (full list)

Set these in **Vercel dashboard → Settings → Environment Variables**:

| Variable | Required? | Default | Purpose |
| --- | --- | --- | --- |
| `DROPBOX_SIGN_API_KEY` | Yes | (none) | Your Dropbox Sign API key |
| `DROPBOX_SIGN_MODE` | No | `email` | `email` or `embedded` |
| `DROPBOX_SIGN_CLIENT_ID` | If embedded | (fallback in code) | Required for embedded signing only |
| `DROPBOX_SIGN_TEST_MODE` | No | `true` | Set to `false` for paid/binding signatures |
| `PDF_RENDER_BASE_URL` | No | auto-detected | Override the URL the renderer navigates to |
| `CHROMIUM_PACK_URL` | No | v140 GitHub release | Override the chromium tarball download URL |
| `RESEND_API_KEY` | No | — | Email notifications via Resend |
| `NOTIFICATION_EMAIL` | No | hello@… | Where notification emails go |
| `SUBMISSION_WEBHOOK_URL` | No | — | Forward submissions to Zapier/Make/n8n |

---

## Custom domain

Recommended: `contract.awesomebydesign.studio`

1. Vercel dashboard → your project → Settings → Domains → Add `contract.awesomebydesign.studio`
2. Vercel shows you the DNS record to add (usually a `CNAME` to `cname.vercel-dns.com`)
3. Add that CNAME at your domain registrar
4. Wait 5–15 minutes for DNS propagation
5. **Important for v4**: also set the `PDF_RENDER_BASE_URL` env var to `https://contract.awesomebydesign.studio` so the headless renderer hits your custom domain.

---

## Going from test mode → production

While testing, signatures are watermarked "TEST MODE" and don't count against your quota.

1. In Vercel → Settings → Environment Variables, set `DROPBOX_SIGN_TEST_MODE=false`
2. Make sure your Dropbox Sign account has signing credits
3. Redeploy (Vercel auto-redeploys on env var change)

---

## Troubleshooting

**`[CRITICAL] Dynamic PDF render failed, falling back to static PDF` in Vercel logs**
The dynamic render threw. Check the full stack trace in the same log entry. Most common causes:
- `PDF_RENDER_BASE_URL` points to an unreachable host
- Chromium tarball download from GitHub timed out (rare; usually self-resolves on retry)
- Frontend `body.print-ready` signal never fired — likely because the `?print=1` URL is hitting a stale cached `index.html` that doesn't have the v4 print handler. Force a fresh deploy.
- `index.html` has a JS error in the print branch — open browser DevTools and visit `?print=1&state=<base64>` manually to debug.

**Sign button stuck on "Preparing your contract for signature…"**
First-ever cold start after deploy can take 15+ seconds. If it's still stuck after 30s, the function timed out. Check Vercel logs for the actual error.

**Sign button is grayed out**
The button enables when these are filled: country, tier, client name, client email, start date.

**Email mode succeeds but no email arrives**
Check the Vercel function logs. Dropbox Sign may have rejected the request — usually a misconfigured API key or quota exhaustion.

**PDF looks unstyled or wrong**
- Verify font files in `/assets/fonts/` are actually being served (visit `/assets/fonts/PPEditorialNew-Regular.woff2` directly in the browser).
- The headless browser fetches them over HTTP from the live site — if your custom domain has no fonts, they won't be in the PDF.
- Check `PDF_RENDER_BASE_URL` is correct.

**Bundle size limit errors during deploy**
The setup uses `@sparticuz/chromium-min` (~3MB) instead of `@sparticuz/chromium` (~50MB+) specifically to fit Vercel's Hobby plan limit. If you see bundle size errors anyway, check that `vercel.json`'s `includeFiles` isn't pulling in unintended files. Rerun deploy with `vercel --prod --force` to bust caches.

---

## Local development

```bash
npm install -g vercel
npm install
vercel dev
# opens at http://localhost:3000
```

Vercel CLI picks up env vars from `.env.local`:

```
# .env.local
DROPBOX_SIGN_API_KEY=4de7afdc...
DROPBOX_SIGN_MODE=email
DROPBOX_SIGN_TEST_MODE=true
PDF_RENDER_BASE_URL=http://localhost:3000
```

**Note:** Puppeteer + chromium-min downloads the Chromium tarball on first run, even locally. If you have a local Chrome you'd rather use, modify `lib/render-contract-pdf.js` to set `executablePath` to your local Chrome path when `process.env.IS_LOCAL` is set.

---

## Built with

- HTML / CSS / vanilla JS — no framework, no build step
- Vercel Serverless Functions (Node.js 20)
- Dropbox Sign API (https://developers.hellosign.com)
- puppeteer-core 24 + @sparticuz/chromium-min 140 for headless rendering
- EB Garamond + Inter (Google Fonts) as fallbacks for the brand fonts

---

*Built to be Awesome. 2026 ©*
