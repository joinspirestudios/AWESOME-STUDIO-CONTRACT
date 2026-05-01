# AWESOME — Brand Design Agreement

Interactive web-based contract for **THE AWESOME DESIGN STUDIO LTD** — built to be deployed on Vercel with Dropbox Sign integration.

---

## Quick start (5 minutes)

```bash
# 1. Get the code on GitHub
git init
git add .
git commit -m "AWESOME contract — initial deploy"
git remote add origin https://github.com/YOUR_USERNAME/awesome-contract.git
git push -u origin main

# 2. Connect to Vercel
# - Go to vercel.com → New Project → Import this repo
# - Click Deploy (no build settings needed)

# 3. Add environment variables in Vercel dashboard
# - DROPBOX_SIGN_API_KEY
# - DROPBOX_SIGN_CLIENT_ID  (only if using embedded mode)
# - DROPBOX_SIGN_MODE       (set to "email" to start)
```

That's it. Site is live.

---

## Before you push: 3 things to drop in

### 1. Brand fonts → `/assets/fonts/`

Download from:
👉 https://drive.google.com/drive/folders/16EyDI-YiTRM3JV70e8nQTT7LsYa0yKRL

Drop these files in `/assets/fonts/`:

```
PPEditorialNew-Ultralight.woff2
PPEditorialNew-UltralightItalic.woff2
PPEditorialNew-Regular.woff2
ZTNature-Regular.woff2
ZTNature-Medium.woff2
ZTNature-SemiBold.woff2
ZTNature-Bold.woff2
```

If they're `.otf` or `.ttf`, convert to `.woff2` at https://transfonter.org

(See `/assets/fonts/README.txt` for full details. Until added, the contract falls back gracefully to EB Garamond + Inter from Google Fonts.)

### 2. Real logo → `/assets/logo/awesome-wordmark.svg`

Download from:
👉 https://drive.google.com/drive/folders/1CiyAOXnw11KennGp2oRw5r0nHavoCNUn

Replace the placeholder file at `/assets/logo/awesome-wordmark.svg`.

(See `/assets/logo/README.txt` for sizing notes.)

### 3. The contract PDF → already in `/pdf/`

Already in place. If you ever need to regenerate it (different terms, updated styling), the source HTML is in the previous Claude conversation transcript.

---

## Project structure

```
awesome-contract/
├── index.html              ← The interactive contract (everything visible to client)
├── package.json            ← Vercel project config
├── vercel.json             ← Routes, headers, function settings
├── README.md               ← You are here
├── api/
│   ├── sign.js             ← Dropbox Sign integration (creates signature requests)
│   └── submit.js           ← Form submission logger (records every contract started)
├── assets/
│   ├── fonts/              ← Drop your PP Editorial + ZT Nature .woff2 files here
│   ├── logo/               ← Real awęsome wordmark goes here
│   └── seal/               ← Custom wax seal SVG (already in place)
└── pdf/
    └── AWESOME_Brand_Design_Agreement.pdf   ← Used by /api/sign for the actual signing flow
```

---

## How it works

### Reactive content
The contract reflects choices in real time:

- **Country selector** → Local (Nigeria) clients see NGN payment terms + Lagos courts. International clients see USD + arbitration. Currency, payment methods, and dispute clauses all swap accordingly.
- **Tier selector** → Phase Structure table hides Strategy row for AWESOME START. Schedule A highlights the chosen tier and dims the others. Pricing, revisions, and durations adjust everywhere they appear.
- **Start date picker** → Auto-calculates estimated completion based on the tier's duration (4 / 8 / 12 weeks).
- **Client name field** → Once filled, "For [Name]" appears under the Promise note, "Prepared for [Name]" appears in the Sign block, and the Section 1 alias paragraph swaps in the legal name. Formal "the Client" references inside legal clauses stay generic on purpose (legal clarity).
- **Project Brief** → Section 2.4 and Schedule B's Project Brief Summary are bidirectionally synced — typing in one fills the other.
- **Payment structure** → Selecting "Custom split" reveals a textarea so the client can write the structure they've agreed on.
- **Download PDF button** → Triggers the browser's native print-to-PDF with the form values frozen in place, so the downloaded PDF reflects exactly what the client filled in (not the blank original).

State is persisted to `localStorage` so a client can refresh without losing progress.

### Sign button → Dropbox Sign

Clicking **Sign with Dropbox Sign**:

1. Posts the form data to `/api/submit` (logged for tracking)
2. Posts to `/api/sign` which:
   - Reads the PDF from `/pdf/AWESOME_Brand_Design_Agreement.pdf`
   - Creates a Dropbox Sign signature request via API
   - Sets up two signers: Kehinde Awe (designer) + the client
3. Depending on `DROPBOX_SIGN_MODE`:
   - **`email`** (default) → both parties get email links to sign
   - **`embedded`** → opens an in-page signing modal (requires Premium plan + embedded app setup)

---

## Environment variables

Set these in **Vercel dashboard → Settings → Environment Variables**:

| Variable                    | Required? | Default              | Purpose                                        |
| --------------------------- | --------- | -------------------- | ---------------------------------------------- |
| `DROPBOX_SIGN_API_KEY`      | Yes       | (uses fallback)      | Your Dropbox Sign API key                      |
| `DROPBOX_SIGN_MODE`         | No        | `email`              | `email` or `embedded`                          |
| `DROPBOX_SIGN_CLIENT_ID`    | If embedded | (uses fallback)    | Required for embedded signing only             |
| `DROPBOX_SIGN_TEST_MODE`    | No        | `true`               | Set to `false` to use real (paid) signatures   |
| `RESEND_API_KEY`            | No        | —                    | Email notifications via Resend                 |
| `NOTIFICATION_EMAIL`        | No        | hello@…              | Where notification emails go                   |
| `SUBMISSION_WEBHOOK_URL`    | No        | —                    | Forward submissions to Zapier/Make/n8n         |

**Important:** While `DROPBOX_SIGN_API_KEY` defaults to the key you provided in the HTML, putting it in the env var is more secure (the key won't show up in the page source). Set the env var on Vercel, then it overrides the fallback.

---

## ★ Question 15 answered — Where do form responses go?

You'll get the data in **three places** after deployment:

### A. Dropbox Sign dashboard (signed contracts)
- Go to https://app.hellosign.com → Documents
- Every signed contract appears here with all field values intact, the signed PDF, audit trail, and signer IPs/timestamps.
- Both you and the client receive the completed PDF by email automatically.

### B. Vercel function logs (every contract started, even abandoned ones)
- Go to **Vercel dashboard → your project → Logs**
- Filter for `[contract submission]`
- Every time a client clicks **Sign**, the form data they entered is logged here as JSON.
- Includes: client name, email, country, tier, start date, project name/brief, custom variations, special terms.

### C. Optional — pick one of these to get notified instantly

The `/api/submit.js` file is built to extend in any of these ways:

#### Option 1: Email yourself on every submission (Resend, free tier)
1. Sign up at https://resend.com (free for 3,000 emails/month)
2. Add domain `awesomebydesign.studio` and verify DNS
3. Add to Vercel env vars:
   - `RESEND_API_KEY=re_xxxxx`
   - `NOTIFICATION_EMAIL=hello@awesomebydesign.studio`
4. The submit endpoint will automatically send formatted notification emails

#### Option 2: Post to Notion database
1. Create a database in Notion (Client, Email, Tier, Project columns)
2. Get an API key from https://www.notion.so/my-integrations
3. Share the database with your integration
4. Edit `/api/submit.js` (extension example included at the bottom of the file)
5. Add `NOTION_API_KEY` and `NOTION_DATABASE_ID` to Vercel env vars

#### Option 3: Forward to Zapier / Make / n8n
1. Create a webhook trigger on your automation platform
2. Add to Vercel env vars: `SUBMISSION_WEBHOOK_URL=https://hooks.zapier.com/...`
3. Done — every submission forwards to your automation

---

## Custom domain

Recommended: `contract.awesomebydesign.studio`

1. Vercel dashboard → your project → Settings → Domains → Add
2. Add `contract.awesomebydesign.studio`
3. Vercel shows you the DNS record to add (usually a `CNAME` to `cname.vercel-dns.com`)
4. Add that CNAME at your domain registrar
5. Wait 5–15 minutes for DNS propagation

---

## Going from test mode → production

While testing, signatures are watermarked "TEST MODE" and don't count against your quota.

When you're ready to use it for real clients:

1. In Vercel → Settings → Environment Variables, set `DROPBOX_SIGN_TEST_MODE=false`
2. Make sure your Dropbox Sign account has signing credits (free tier = 3 free signatures/month, paid plans for more)
3. Redeploy (Vercel auto-redeploys on env var change)

---

## Local development

```bash
npm install -g vercel
vercel dev
# opens at http://localhost:3000
```

Vercel's CLI will pick up your env vars from a local `.env.local` file:

```
# .env.local
DROPBOX_SIGN_API_KEY=4de7afdc...
DROPBOX_SIGN_MODE=email
DROPBOX_SIGN_TEST_MODE=true
```

---

## Troubleshooting

**Sign button is grayed out**
The button enables when these are filled: country, tier, client name, client email, start date.

**Email mode succeeds but no email arrives**
Check the Vercel function logs. The Dropbox Sign API may have rejected the request — usually a misconfigured API key or quota exhaustion.

**Embedded mode shows "skipDomainVerification" warning**
This is fine in test mode. For production embedded signing, you need to verify the domain in your Dropbox Sign Embedded App settings.

**Fonts look wrong**
Check that the .woff2 files are in `/assets/fonts/` with the exact filenames listed in the fonts README. The CSS is case-sensitive.

**Logo doesn't appear**
The system falls back to a styled text wordmark if `/assets/logo/awesome-wordmark.svg` is missing. To use the real logo, replace that file.

---

## Built with

- HTML / CSS / vanilla JS — no framework, no build step
- Vercel Serverless Functions (Node.js 18)
- Dropbox Sign API (https://developers.hellosign.com)
- EB Garamond + Inter (Google Fonts) as fallbacks for the brand fonts

---

*Built to be Awesome. 2026 ©*
