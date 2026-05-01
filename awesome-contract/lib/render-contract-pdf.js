// ============================================================
// /lib/render-contract-pdf.js
//
// Renders the AWESOME contract HTML to a PDF buffer using
// puppeteer-core + @sparticuz/chromium-min on Vercel serverless.
//
// Approach: navigate headless Chromium to the live site with a
// `?print=1&state=<base64-json>` query string. The page reads
// the param, applies the injected state, freezes inputs into
// static spans, then sets `body.print-ready` to signal readiness.
// We wait for that class, then call page.pdf().
//
// Used by:
//   - /api/sign.js — to produce the PDF that Dropbox Sign signs
//   - /api/generate-pdf.js — to power the Download PDF button
//
// Both paths share this single renderer, so what the client
// downloads is byte-identical to what gets signed.
//
// API notes:
//   In @sparticuz/chromium-min v140, the public surface is just:
//     - chromium.args (getter)
//     - chromium.executablePath(url)
//     - chromium.setGraphicsMode = false  (setter)
//   There is no longer a chromium.headless or chromium.defaultViewport.
//   The headless flag is baked into args (as `--headless='shell'`).
// ============================================================

const chromium = require('@sparticuz/chromium-min');
const puppeteer = require('puppeteer-core');

// ============================================================
// Configuration
// ============================================================

// chromium-pack tarball URL hosted on GitHub. The version here MUST
// match the major version of @sparticuz/chromium-min in package.json
// (both pinned to v140). If you upgrade the npm package, also update
// this URL — the brotli format and binary layout can change between
// major versions.
//
// Why a remote URL: chromium-min ships without a binary so the function
// bundle stays well under Vercel's 50MB Hobby plan limit. On the first
// cold start, the tarball is downloaded to /tmp and cached for the
// lifetime of the warm container.
const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ||
  'https://github.com/Sparticuz/chromium/releases/download/v140.0.0/chromium-v140.0.0-pack.x64.tar';

// Disable WebGL/graphics — we don't need them for PDF rendering and
// it cuts the chromium-pack download by saving the swiftshader file.
chromium.setGraphicsMode = false;

// ============================================================
// Browser caching across warm invocations
// Saves 3-8s on subsequent renders within the same container.
// ============================================================

let cachedBrowser = null;

async function getBrowser() {
  if (cachedBrowser) {
    try {
      if (cachedBrowser.connected || (cachedBrowser.isConnected && cachedBrowser.isConnected())) {
        return cachedBrowser;
      }
    } catch (e) { /* fall through and create new */ }
    cachedBrowser = null;
  }

  cachedBrowser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
    // chromium.args already contains --headless='shell', so this is belt-and-suspenders
    headless: 'shell'
  });

  return cachedBrowser;
}

// ============================================================
// Base URL detection
// Priority: explicit override > Vercel production alias >
//           Vercel deployment URL > localhost
// ============================================================

function getBaseUrl() {
  if (process.env.PDF_RENDER_BASE_URL) {
    return process.env.PDF_RENDER_BASE_URL.replace(/\/$/, '');
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
}

// ============================================================
// Encode the state object as a base64 query parameter.
// The frontend's getPrintParams() decodes this on page load.
// ============================================================

function encodeState(state) {
  const json = JSON.stringify(state || {});
  return Buffer.from(json, 'utf8').toString('base64');
}

// ============================================================
// Main render function
// ============================================================

async function renderContractPDF(state) {
  const baseUrl = getBaseUrl();
  const stateParam = encodeState(state);
  const printUrl = `${baseUrl}/?print=1&state=${encodeURIComponent(stateParam)}`;

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Force a generous viewport so the page renders at desktop dimensions
    // rather than triggering the @media (max-width: 1100px) mobile rules.
    await page.setViewport({
      width: 1200,
      height: 1600,
      deviceScaleFactor: 1
    });

    // Navigate. networkidle0 = wait for all network activity to settle
    // (fonts, logo SVG, wax seal SVG all need to load).
    await page.goto(printUrl, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    // Wait for the page's print-mode handler to finish freezing inputs
    // and signal readiness via the body.print-ready class.
    await page.waitForSelector('body.print-ready', { timeout: 15000 });

    // Switch to print media so the @media print stylesheet applies
    // (hides topbar, sidebar, sign button, etc.)
    await page.emulateMediaType('print');

    // Generate the PDF. preferCSSPageSize lets the page CSS define
    // page dimensions; we fall back to A4 if the page doesn't specify.
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in'
      }
    });

    return pdfBuffer;
  } finally {
    // Always close the page (not the browser — we keep the browser
    // cached for warm reuse).
    try { await page.close(); } catch (e) { /* ignore */ }
  }
}

module.exports = { renderContractPDF, getBaseUrl };
