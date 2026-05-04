// ============================================================
// /api/sign.js — BoldSign integration (v5)
//
// Creates a signature request via the BoldSign API.
//
// Architecture (unchanged from v4):
//   1. Render a personalized PDF from the client's filled-in form
//      state via /lib/render-contract-pdf.js.
//   2. If dynamic render fails, fall back to the static PDF in
//      /pdf/ — and log [CRITICAL] so the failure gets noticed.
//   3. Hand the resulting PDF to the e-signature provider for
//      signing by both parties.
//
// Mode: email — both signers receive signing emails directly from
// BoldSign, and both receive the completed PDF (with a tamperproof
// audit trail attached) when both have signed. Embedded signing is
// reserved for v5.1; the frontend already has a placeholder branch
// for it but the backend currently only returns mode='email'.
//
// Sandbox vs Production toggle:
//   Different API keys, same endpoint. Generate a Sandbox key for
//   testing (free, watermarked, 14-day retention) and a Live key
//   for production (Essentials plan, $30/mo, 40 docs/mo at time of
//   writing). Swap the BOLDSIGN_API_KEY env var on Vercel; no code
//   change required.
//
// Required environment variables (set in Vercel → Settings → Env Vars):
//   BOLDSIGN_API_KEY       — required. API key from
//                            app.boldsign.com → API → API Key.
//   BOLDSIGN_API_BASE_URL  — optional, defaults to
//                            https://api.boldsign.com. Override
//                            only if BoldSign changes their URL.
// ============================================================

const fs = require('fs');
const path = require('path');
const { renderContractPDF } = require('../lib/render-contract-pdf');

const API_KEY = process.env.BOLDSIGN_API_KEY || '';
const API_BASE_URL = (process.env.BOLDSIGN_API_BASE_URL || 'https://api.boldsign.com')
  .replace(/\/$/, '');

// ============================================================
// Helpers
// ============================================================

/**
 * Count pages in a PDF buffer by counting `/Type /Page` dictionary
 * entries (excluding `/Pages`, which is the parent container).
 *
 * Works on puppeteer-generated PDFs whose top-level structure is
 * uncompressed. Returns 1 as a safe fallback if the regex doesn't
 * match — in that case the signature lands on page 1, which is
 * wrong visually but doesn't break the signing flow.
 */
function countPdfPages(buffer) {
  try {
    // PDFs are binary, but the structural tokens like `/Type /Page`
    // are ASCII. latin1 round-trips arbitrary bytes safely.
    const text = buffer.toString('latin1');
    // Match `/Type /Page` followed by a non-letter char to exclude
    // the `/Pages` parent. Whitespace and `/` are valid PDF token
    // separators after a name.
    const matches = text.match(/\/Type\s*\/Page[^s]/g);
    return matches && matches.length > 0 ? matches.length : 1;
  } catch (e) {
    return 1;
  }
}

/**
 * Build the BoldSign signers array with signature + date-signed
 * fields placed on the last page of the document.
 *
 * Layout: designer (Kehinde) bottom-left, client bottom-right.
 *
 * Coordinates are in PDF points (1/72 inch) on an A4 page
 * (595 × 842). BoldSign uses top-left origin: Y increases downward.
 *
 * NOTE: If the first sandbox render shows fields in the wrong
 * place, the fix is to tweak these constants — not to refactor.
 */
function buildSigners({
  designerEmail, designerName,
  clientEmail, clientName,
  lastPage
}) {
  const sigY = 720;     // ~120pt up from bottom of A4 (842 - 720 = 122)
  const sigW = 200;
  const sigH = 40;
  const dateH = 18;

  const designerX = 60;
  const clientX = 335;

  return [
    {
      Name: designerName,
      EmailAddress: designerEmail,
      SignerType: 'Signer',
      SignerOrder: 1,
      FormFields: [
        {
          Id: 'designer_signature',
          FieldType: 'Signature',
          PageNumber: lastPage,
          Bounds: { X: designerX, Y: sigY, Width: sigW, Height: sigH },
          IsRequired: true
        },
        {
          Id: 'designer_date',
          FieldType: 'DateSigned',
          PageNumber: lastPage,
          Bounds: { X: designerX, Y: sigY + sigH + 4, Width: sigW, Height: dateH },
          IsRequired: true
        }
      ]
    },
    {
      Name: clientName,
      EmailAddress: clientEmail,
      SignerType: 'Signer',
      SignerOrder: 2,
      FormFields: [
        {
          Id: 'client_signature',
          FieldType: 'Signature',
          PageNumber: lastPage,
          Bounds: { X: clientX, Y: sigY, Width: sigW, Height: sigH },
          IsRequired: true
        },
        {
          Id: 'client_date',
          FieldType: 'DateSigned',
          PageNumber: lastPage,
          Bounds: { X: clientX, Y: sigY + sigH + 4, Width: sigW, Height: dateH },
          IsRequired: true
        }
      ]
    }
  ];
}

// ============================================================
// PDF resolution: dynamic render first, static fallback (with loud log)
// ============================================================

async function resolvePdfBuffer(formData) {
  // Try dynamic render first
  try {
    const startedAt = Date.now();
    const buf = await renderContractPDF(formData);
    const elapsedMs = Date.now() - startedAt;
    console.log(
      `[sign] Dynamic PDF rendered: ${buf.length} bytes in ${elapsedMs}ms ` +
      `(client="${formData.clientName || 'unknown'}" tier="${formData.tier || 'unknown'}")`
    );
    return { buffer: buf, source: 'dynamic' };
  } catch (err) {
    // CRITICAL: dynamic render failed. Fall back to static PDF so the
    // sign flow doesn't break, but log loudly so this gets noticed.
    console.error(
      '[CRITICAL] Dynamic PDF render failed, falling back to static PDF. ' +
      'This means the client will receive a BLANK template instead of their ' +
      'filled contract. Investigate immediately. Error:',
      err
    );
  }

  // Static PDF fallback
  const candidates = [
    path.join(process.cwd(), 'pdf', 'AWESOME_Brand_Design_Agreement.pdf'),
    path.join(__dirname, '..', 'pdf', 'AWESOME_Brand_Design_Agreement.pdf'),
    path.join('/var/task', 'pdf', 'AWESOME_Brand_Design_Agreement.pdf'),
    path.join(__dirname, 'pdf', 'AWESOME_Brand_Design_Agreement.pdf')
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const buf = fs.readFileSync(candidate);
        console.error(
          '[CRITICAL] Sending STATIC fallback PDF to BoldSign — ' +
          'client will not see their filled-in data in the signed contract.'
        );
        return { buffer: buf, source: 'static-fallback', path: candidate };
      }
    } catch (e) { /* try next */ }
  }

  // Total failure — neither dynamic nor static worked
  const error = new Error(
    'Unable to obtain a contract PDF: dynamic render failed AND static fallback file not found. ' +
    'Tried: ' + candidates.join(', ')
  );
  error.triedPaths = candidates;
  throw error;
}

// ============================================================
// Main handler
// ============================================================

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!API_KEY) {
    console.error('BOLDSIGN_API_KEY env var not set on Vercel');
    return res.status(500).json({
      error: 'Server is missing BOLDSIGN_API_KEY environment variable.',
      hint: 'Set BOLDSIGN_API_KEY in Vercel → Settings → Environment Variables, then redeploy. ' +
            'Use a Sandbox key during testing, a Live key in production. Same env var name, different value.'
    });
  }

  try {
    const body = req.body || {};
    const {
      designerEmail = 'hello@awesomebydesign.studio',
      designerName = 'Kehinde Awe',
      clientEmail,
      clientName,
      title = 'AWESOME — Brand Design Agreement',
      subject = 'Please sign your Brand Design Agreement',
      message = 'Please review and sign this brand design agreement.',
      formData = {}
    } = body;

    if (!clientEmail || !clientName) {
      return res.status(400).json({
        error: 'Missing required fields: clientEmail and clientName must be provided.'
      });
    }

    // Resolve the PDF — dynamic render first, static fallback if it fails
    let pdfBuffer, pdfSource;
    try {
      const result = await resolvePdfBuffer(formData);
      pdfBuffer = result.buffer;
      pdfSource = result.source;
    } catch (pdfErr) {
      console.error('[sign] PDF resolution failed entirely:', pdfErr);
      return res.status(500).json({
        error: 'Could not produce a contract PDF for signing.',
        hint: 'Both dynamic rendering and static fallback failed. ' +
              'Check Vercel function logs and ensure pdf/AWESOME_Brand_Design_Agreement.pdf is committed.',
        triedPaths: pdfErr.triedPaths
      });
    }

    // Determine which page to place signatures on
    const pageCount = countPdfPages(pdfBuffer);
    console.log(
      `[sign] PDF has ${pageCount} pages — signature fields will be placed on page ${pageCount}.`
    );

    // Build the BoldSign request
    const signers = buildSigners({
      designerEmail, designerName,
      clientEmail, clientName,
      lastPage: pageCount
    });

    const base64Pdf = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;

    // BoldSign caps each metadata value at 500 chars; truncate defensively.
    const trimMeta = (v) => String(v == null ? '' : v).slice(0, 500);

    const payload = {
      Title: title,
      Subject: subject,
      Message: message,
      Signers: signers,
      // Parallel signing (matches v4 behavior). Set to true if you ever
      // want sequential signing where Kehinde must sign before the
      // client gets their email.
      EnableSigningOrder: false,
      ExpiryDays: 30,
      DisableExpiryAlert: false,
      Files: [
        // BoldSign accepts a base64 data URI in the Files array.
        `data:application/pdf;base64,${base64Pdf}`
      ],
      MetaData: {
        client_email: trimMeta(clientEmail),
        tier: trimMeta(formData.tier),
        country: trimMeta(formData.country),
        start_date: trimMeta(formData.startDate),
        project_name: trimMeta(formData.projectName),
        pdf_source: trimMeta(pdfSource)
      }
    };

    let bsRes;
    try {
      bsRes = await fetch(`${API_BASE_URL}/v1/document/send`, {
        method: 'POST',
        headers: {
          'X-API-KEY': API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    } catch (netErr) {
      console.error('[sign] Network error reaching BoldSign:', netErr);
      return res.status(502).json({
        error: 'Network error reaching BoldSign API',
        message: netErr.message,
        hint: 'Check Vercel function logs and BoldSign status (status.boldsign.com).'
      });
    }

    let bsData = null;
    try { bsData = await bsRes.json(); } catch (e) { /* may not be JSON on some errors */ }

    if (!bsRes.ok) {
      console.error('BoldSign API error:', bsRes.status, bsData);
      return res.status(502).json({
        error: 'BoldSign API rejected the request',
        status: bsRes.status,
        details: bsData,
        hint: (bsData && (bsData.error || bsData.title || bsData.message)) ||
              'Verify BOLDSIGN_API_KEY is correct and has document-send scope. ' +
              'Note: a Sandbox key cannot send from a Live account, and vice versa.'
      });
    }

    const documentId = bsData && bsData.documentId;
    if (!documentId) {
      console.error('BoldSign returned 2xx without a documentId:', bsData);
      return res.status(502).json({
        error: 'BoldSign accepted the request but returned no documentId.',
        details: bsData
      });
    }

    console.log(
      `[sign] BoldSign document created: ${documentId} ` +
      `(client="${clientName}" pdfSource="${pdfSource}")`
    );

    // Response shape matches what the frontend handleSign() expects.
    // Frontend keeps the email/embedded branch structure for v5.1.
    return res.status(200).json({
      mode: 'email',
      emailsSent: true,
      documentId: documentId,
      pdfSource: pdfSource,
      message: `Signature request emails sent to ${designerEmail} and ${clientEmail}.`
    });
  } catch (err) {
    console.error('Sign handler error:', err);
    return res.status(500).json({
      error: 'Server error while creating signature request',
      message: err.message
    });
  }
};
