# AWESOME — Brand Design Agreement (v5)

Interactive web-based contract for **THE AWESOME DESIGN STUDIO LTD** — deployed on Vercel with dynamic PDF rendering and BoldSign e-signature integration.

**v5 change:** the e-signature provider has migrated from Dropbox Sign to BoldSign. Same architecture (server renders a personalized PDF, sends it to the e-sig provider, both parties sign by email), but ~70% lower cost ($30/mo vs $100/mo) and a real free Sandbox for safe end-to-end testing without burning production quota. The dynamic PDF generation pipeline from v4 is unchanged.

---

## What's new in v5

### BoldSign e-signature integration
- `/api/sign.js` rewritten to call BoldSign's `POST /v1/document/send` endpoint via raw `fetch` (no SDK — keeps the function bundle small enough to fit alongside Chromium under Vercel's Hobby plan size limit).
- Auth is `X-API-KEY` header. Files are sent as base64 inside JSON. No multipart form construction.
- Signature fields are placed automatically on the last page of the generated PDF (page count is derived from the buffer; coordinates put designer bottom-left, client bottom-right).
- BoldSign automatically attaches a tamperproof audit trail to the completed PDF — equal-or-better than Dropbox Sign's audit trail features.

### Dynamic PDF generation untouched
- `/lib/render-contract-pdf.js` and `/api/generate-pdf.js` are provider-agnostic and were not modified during the migration. The Download PDF button works exactly as it did in v4.
- The same renderer feeds both `/api/sign.js` and `/api/generate-pdf.js`, so what the client downloads is byte-identical to what gets sent for signing.

### Sandbox / Production toggle is just a key swap
- Sandbox and Production use the **same API endpoint** and the **same env var name** — only the key value changes.
- BoldSign's free Sandbox produces real-looking signing flows with watermarked documents that auto-delete after 14 days. Use it freely; it doesn't cost or count against any quota.
- To go live: replace `BOLDSIGN_API_KEY` on Vercel with a Live key from your paid BoldSign account, then redeploy.

### Frontend: HelloSign SDK removed, button copy generalized
- The HelloSign embedded SDK `<script>` tag was removed (saves ~100KB on every page load).
- The `DROPBOX_SIGN_CLIENT_ID` and `TEST_MODE` client-side constants are gone.
- Contract copy is now provider-agnostic ("signed electronically", "Sign Contract") so future provider changes don't require touching legal language.
- The `email` / `embedded` branch structure in `handleSign()` was preserved as scaffolding for v5.1, when BoldSign embedded signing will be wired up. v5 only ships email mode; the embedded branch is a graceful placeholder today.

---

## Architecture (unchanged from v4)

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
│     BoldSign API    │    └────────┬─────────────────┘
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

---

## Project structure

```
awesome-contract/
├── index.html              ← The interactive contract (also handles print mode)
├── package.json            ← puppeteer-core + @sparticuz/chromium-min + @vercel/analytics
├── vercel.json             ← Function memory + maxDuration + includeFiles
├── README.md               ← You are here
├── api/
│   ├── sign.js             ← BoldSign integration (uses dynamic PDF)
│   ├── generate-pdf.js     ← Endpoint for the Download button (unchanged from v4)
│   └── submit.js           ← Form submission logger (unchanged)
├── lib/
│   └── render-contract-pdf.js   ← Shared headless-Chromium PDF renderer (unchanged)
├── assets/
│   ├── fonts/              ← PP Editorial New + ZT Nature (.woff2)
│   ├── logo/               ← awęsome wordmark
│   └── seal/               ← Custom wax seal SVG
└── pdf/
    └── AWESOME_Brand_Design_Agreement.pdf   ← Fallback only (logged when used)
```

---

## How the reactive content works (unchanged)

- **Country selector** → Local (Nigeria) clients see NGN payment terms + Lagos courts. International clients see USD + arbitration.
- **Tier selector** → Phase Structure table hides Strategy row for AWESOME START. Schedule A highlights the chosen tier and dims the others.
- **Start date picker** → Auto-calculates estimated completion based on tier duration (4 / 8 / 12 weeks).
- **Client name field** → "For [Name]" appears under the Promise note, "Prepared for [Name]" appears in the Sign block.
- **Project Brief** → Section 2.4 and Schedule B's Project Brief Summary are bidirectionally synced.
- **Payment structure** → Selecting "Custom split" reveals a textarea.

State is persisted to `localStorage` so a client can refresh without losing progress.

---

## Sign button → BoldSign

Clicking **Sign Contract**:

1. POSTs the form data to `/api/submit` (logged for tracking)
2. POSTs to `/api/sign` which:
   - Generates a personalized PDF via `lib/render-contract-pdf.js` (~2-15s depending on cold/warm state)
   - Falls back to `pdf/AWESOME_Brand_Design_Agreement.pdf` if generation fails (logs `[CRITICAL]`)
   - Counts pages in the PDF and places `Signature` + `DateSigned` form fields on the last page (designer bottom-left, client bottom-right)
   - Calls `POST https://api.boldsign.com/v1/document/send` with the base64 PDF + signer config + metadata
   - Returns `{ mode: 'email', documentId, ... }` on success
3. Frontend confirms emails are on the way; both parties (Kehinde + client) receive a BoldSign signing email
4. After both have signed, BoldSign automatically emails the completed PDF (with audit trail attached) to both parties

---

## Environment variables

Set these in **Vercel dashboard → Settings → Environment Variables**:

### v5 (BoldSign)

| Variable | Required? | Default | Purpose |
| --- | --- | --- | --- |
| `BOLDSIGN_API_KEY` | **Yes** | (none) | API key from `app.boldsign.com → API → API Key`. Use a Sandbox key for testing, a Live key for production. Same env var name; just swap the value. |
| `BOLDSIGN_API_BASE_URL` | No | `https://api.boldsign.com` | Override the BoldSign API base URL. Only set if BoldSign changes their endpoint. |
| `PDF_RENDER_BASE_URL` | No | auto-detected | URL the headless Chromium navigates to. Set this if you have a custom domain (e.g. `https://contract.awesomebydesign.studio`). |
| `CHROMIUM_PACK_URL` | No | v140 GitHub release | Override the chromium tarball download URL (rarely needed). |
| `RESEND_API_KEY` | No | — | Optional: email notifications via Resend. |
| `NOTIFICATION_EMAIL` | No | hello@… | Optional: where notification emails go. |
| `SUBMISSION_WEBHOOK_URL` | No | — | Optional: forward submissions to Zapier/Make/n8n. |

### Removed in v5 (delete these from Vercel after v5 ships and is verified)

| Variable | Replaced by |
| --- | --- |
| `DROPBOX_SIGN_API_KEY` | `BOLDSIGN_API_KEY` |
| `DROPBOX_SIGN_MODE` | (no longer needed — BoldSign defaults to email mode) |
| `DROPBOX_SIGN_TEST_MODE` | (no longer needed — Sandbox vs Live is a key swap, not a flag) |
| `DROPBOX_SIGN_CLIENT_ID` | (no longer needed — embedded signing is reserved for v5.1) |

---

## Deploy checklist (v5)

Today's deploy bug taught us: **never skip the smoke test**. This checklist is non-optional.

### Phase 1 — Sandbox testing

1. Sign up for a [free BoldSign Developer Sandbox account](https://account.boldsign.com/signup?planId=1076). It's free indefinitely; documents auto-delete after 14 days.
2. In the Sandbox app: **API → API Key → Generate API Key**. Copy the key.
3. In Vercel: **Settings → Environment Variables**:
   - **Add** `BOLDSIGN_API_KEY` with the Sandbox key value (apply to Production environment).
   - Leave the old `DROPBOX_SIGN_*` vars in place for now — we'll remove them only after v5 is verified.
4. Push v5 to GitHub. Vercel auto-redeploys.
5. **Smoke test 1: domain email.** Open the live site. Fill the form using `hello@awesomebydesign.studio` (or another `@awesomebydesign.studio` address) as the client email. Click **Sign Contract**. Verify:
   - Status message says "Signing requests sent…"
   - Within 1 minute, both `hello@awesomebydesign.studio` and the test address (if different) receive a BoldSign email.
   - Open the BoldSign email → Review document → confirm it's the **personalized** PDF with all your form data filled in (NOT the static blank template).
   - Sign on both sides.
   - Within 1 minute of the second signature, both parties receive the completed PDF email with the audit trail attached.
   - Vercel function logs show `[sign] Dynamic PDF rendered: …` followed by `[sign] BoldSign document created: …`. NO `[CRITICAL]` lines.
6. **Smoke test 2: real-email address.** Repeat smoke test 1 using a Gmail (or any non-`@awesomebydesign.studio`) address as the client email. This confirms the flow works for any client domain.

### Phase 2 — Joseph's manual review (mandatory)

7. **Send Joseph the deployed Sandbox URL** so he can do a manual end-to-end test before any billable signatures run through it. Wait for his sign-off.

### Phase 3 — Going live

8. Sign up for [BoldSign Essentials](https://boldsign.com/electronic-signature-pricing/) ($30/mo, 40 documents/month at time of writing).
9. In the **Live** BoldSign app (different account from Sandbox): **API → API Key → Generate API Key**. Copy the new Live key.
10. In Vercel: **Settings → Environment Variables**:
    - **Edit** `BOLDSIGN_API_KEY` — replace the Sandbox value with the Live value.
    - Vercel will automatically redeploy.
11. **Smoke test 3 (live).** Repeat smoke test 1 with a `@awesomebydesign.studio` address. This is a real billable signature, so don't repeat unnecessarily — just confirm one round-trip works.
12. **Only after step 11 succeeds**, in Vercel, **delete** the four old Dropbox Sign env vars: `DROPBOX_SIGN_API_KEY`, `DROPBOX_SIGN_MODE`, `DROPBOX_SIGN_TEST_MODE`, `DROPBOX_SIGN_CLIENT_ID`. Redeploy to clear caches.
13. Cancel the Dropbox Sign subscription so it doesn't auto-renew.

### What to verify in BoldSign dashboard after first test signature

- **Documents tab** → the test document appears with status "Completed" after both signers signed.
- **Audit trail** → click the document, scroll to the bottom, confirm the audit trail page shows IP addresses, timestamps, and signer email confirmations for both parties.
- **Activity log** → the document creation API call is logged with your API key.

---

## Test plan (run after every deploy)

| What we're verifying | How |
| --- | --- |
| Dynamic PDF still renders | Click **Download PDF** on the live site. Confirm the personalized PDF downloads with your form data. |
| `/api/sign` reaches BoldSign | Sandbox-mode click on **Sign Contract**. Vercel logs should show `[sign] Dynamic PDF rendered: …` followed by `[sign] BoldSign document created: <documentId>`. |
| No `[CRITICAL]` fallback fired | `grep CRITICAL` in Vercel function logs after a sign attempt. Should be empty. |
| Both signers receive emails | Verify Kehinde's inbox AND the client's inbox each get a BoldSign signing email within 1 min. |
| Signed PDF reflects form data | Sign on both sides in Sandbox. Open the resulting completed PDF. Confirm it shows the actual filled-in form data, not the static blank template. |
| Audit trail attached | The completed PDF should have an extra page at the end listing IP addresses, timestamps, and signer details. |
| Vercel Analytics still working | Open browser DevTools → Network tab on a fresh page load. Confirm `/_vercel/insights/script.js` is requested and 200s. |

---

## Custom domain (unchanged from v4)

Recommended: `contract.awesomebydesign.studio`

1. Vercel dashboard → your project → Settings → Domains → Add `contract.awesomebydesign.studio`
2. Add the CNAME at your registrar (Vercel shows you the value)
3. Set the `PDF_RENDER_BASE_URL` env var to `https://contract.awesomebydesign.studio` so the headless renderer hits your custom domain.

---

## Troubleshooting

**`[CRITICAL] Dynamic PDF render failed, falling back to static PDF` in Vercel logs**
Same as v4 — see that section. Most common causes: `PDF_RENDER_BASE_URL` points to an unreachable host; Chromium tarball download timed out; frontend `body.print-ready` signal never fired (likely a stale cached `index.html`). Force a fresh deploy with `vercel --prod --force`.

**`BoldSign API rejected the request` (502 from /api/sign)**
- Most common: API key is wrong or has been deleted. Regenerate in `app.boldsign.com → API → API Key`.
- Sandbox key used against Live API or vice versa — the keys are environment-scoped. Match the key to the environment.
- Signature field placement out of bounds. If the PDF is unusually short or formatted differently, the last-page coordinates may fall outside the page. Check the BoldSign error `details` for clues; tweak the constants in `buildSigners()` in `/api/sign.js`.

**Sign button stuck on "Preparing your contract for signature…"**
First-ever cold start can take 15+ seconds (Chromium download + boot). If it's still stuck after 30s, check Vercel logs for the actual error.

**Sign button is grayed out**
The button enables when these are filled: country, tier, client name, client email, start date.

**Email mode succeeds but no email arrives**
Check Vercel function logs for the `documentId`. Then check `app.boldsign.com → Documents` — find the document by ID. If it shows status "Sent" but the email never arrived, check the recipient's spam folder, then BoldSign's `Activity Log` for any delivery failures.

**Bundle size limit errors during deploy**
We use `@sparticuz/chromium-min` (~3MB) instead of `@sparticuz/chromium` (~50MB+) specifically to fit Vercel's Hobby plan limit. If you see size errors, check that `vercel.json`'s `includeFiles` isn't pulling in unintended files. Rerun deploy with `vercel --prod --force`.

---

## Local development

```bash
npm install -g vercel
npm install
vercel dev
# opens at http://localhost:3000
```

`.env.local` for local testing:

```
BOLDSIGN_API_KEY=<your-sandbox-key>
PDF_RENDER_BASE_URL=http://localhost:3000
```

---

## Built with

- HTML / CSS / vanilla JS — no framework, no build step
- Vercel Serverless Functions (Node.js 20)
- BoldSign API (https://developers.boldsign.com)
- puppeteer-core 24 + @sparticuz/chromium-min 140 for headless rendering
- @vercel/analytics for page-load metrics
- EB Garamond + Inter (Google Fonts) as fallbacks for the brand fonts

---

*Built to be Awesome. 2026 ©*


### BoldSign 422 — invalid base64 string

If BoldSign returns:

```txt
The value for the file is not a valid base64 string.
```

the PDF payload is likely being sent as raw base64 instead of a full data URI.

BoldSign expects this exact format inside the `Files` array:

```txt
data:application/pdf;base64,<content>
```

Do not send the raw base64 string by itself.
