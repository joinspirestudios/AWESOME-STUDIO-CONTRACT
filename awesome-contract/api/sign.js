// ============================================================
// /api/sign.js — Dropbox Sign integration
//
// Creates a signature request via Dropbox Sign API.
//
// v4 CHANGE: The document being signed is now generated dynamically
// from the client's filled-in form state (via /lib/render-contract-pdf.js)
// instead of being read from the static pdf/ folder. The static PDF
// is kept as a logged fallback only — if it ever fires, that's a
// [CRITICAL] error worth investigating.
//
// Two modes supported:
//   1. EMBEDDED MODE — opens signing modal in-page
//      (requires Premium plan + Embedded App with client_id)
//   2. EMAIL MODE — sends signing emails to both parties
//      (works on any Dropbox Sign plan, simpler setup)
//
// Required environment variables (set in Vercel dashboard):
//   DROPBOX_SIGN_API_KEY — your API key from Dropbox Sign
//   DROPBOX_SIGN_CLIENT_ID — only needed for embedded mode
// ============================================================

const fs = require('fs');
const path = require('path');
const { renderContractPDF } = require('../lib/render-contract-pdf');

const MODE = process.env.DROPBOX_SIGN_MODE || 'email';
const API_KEY = process.env.DROPBOX_SIGN_API_KEY || '';
const CLIENT_ID = process.env.DROPBOX_SIGN_CLIENT_ID ||
                  '4de7afdc22788c66ca6604f466e51f846cafbfe66cbcddfacd72fbef92db0b29';
const TEST_MODE = process.env.DROPBOX_SIGN_TEST_MODE !== 'false';
const HS_BASE = 'https://api.hellosign.com/v3';

// ============================================================
// Helpers
// ============================================================

function basicAuth(apiKey) {
  return 'Basic ' + Buffer.from(apiKey + ':').toString('base64');
}

function escapeFormVal(val) {
  return String(val == null ? '' : val);
}

function buildMultipart(fields, files, boundary) {
  const chunks = [];
  const CRLF = '\r\n';

  for (const [key, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}${CRLF}`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${key}"${CRLF}${CRLF}`));
    chunks.push(Buffer.from(escapeFormVal(value) + CRLF));
  }

  for (const file of files) {
    chunks.push(Buffer.from(`--${boundary}${CRLF}`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${file.field}"; filename="${file.filename}"${CRLF}`));
    chunks.push(Buffer.from(`Content-Type: ${file.contentType}${CRLF}${CRLF}`));
    chunks.push(file.data);
    chunks.push(Buffer.from(CRLF));
  }

  chunks.push(Buffer.from(`--${boundary}--${CRLF}`));
  return Buffer.concat(chunks);
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
          '[CRITICAL] Sending STATIC fallback PDF to Dropbox Sign — ' +
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
    console.error('DROPBOX_SIGN_API_KEY env var not set on Vercel');
    return res.status(500).json({
      error: 'Server is missing DROPBOX_SIGN_API_KEY environment variable.',
      hint: 'Set DROPBOX_SIGN_API_KEY in your Vercel project Settings → Environment Variables, then redeploy.'
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

    const boundary = '----awesome' + Math.random().toString(36).substring(2);
    const endpoint = MODE === 'embedded' ? '/signature_request/create_embedded' : '/signature_request/send';

    const fields = {
      'title': title,
      'subject': subject,
      'message': message,
      'test_mode': TEST_MODE ? '1' : '0',

      'signers[0][email_address]': designerEmail,
      'signers[0][name]': designerName,
      'signers[0][order]': '0',

      'signers[1][email_address]': clientEmail,
      'signers[1][name]': clientName,
      'signers[1][order]': '1',

      'metadata[client_email]': clientEmail,
      'metadata[tier]': formData.tier || '',
      'metadata[country]': formData.country || '',
      'metadata[start_date]': formData.startDate || '',
      'metadata[project_name]': formData.projectName || '',
      'metadata[pdf_source]': pdfSource
    };

    if (MODE === 'embedded') {
      fields['client_id'] = CLIENT_ID;
    }

    const multipartBody = buildMultipart(
      fields,
      [{
        field: 'file[0]',
        filename: 'AWESOME_Brand_Design_Agreement.pdf',
        contentType: 'application/pdf',
        data: pdfBuffer
      }],
      boundary
    );

    const dsRes = await fetch(HS_BASE + endpoint, {
      method: 'POST',
      headers: {
        'Authorization': basicAuth(API_KEY),
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': multipartBody.length.toString()
      },
      body: multipartBody
    });

    const dsData = await dsRes.json();

    if (!dsRes.ok) {
      console.error('Dropbox Sign API error:', dsData);
      return res.status(502).json({
        error: 'Dropbox Sign API rejected the request',
        details: dsData.error || dsData,
        hint: dsData.error?.error_msg ||
              'Verify DROPBOX_SIGN_API_KEY is correct and has signing permissions.'
      });
    }

    const sigRequest = dsData.signature_request;

    if (MODE === 'embedded') {
      const clientSig = sigRequest.signatures.find(s => s.signer_email_address === clientEmail);
      if (!clientSig) {
        return res.status(500).json({ error: 'Could not locate client signature record.' });
      }

      const urlRes = await fetch(`${HS_BASE}/embedded/sign_url/${clientSig.signature_id}`, {
        method: 'GET',
        headers: { 'Authorization': basicAuth(API_KEY) }
      });
      const urlData = await urlRes.json();

      if (!urlRes.ok) {
        return res.status(502).json({
          error: 'Could not retrieve embedded sign URL',
          details: urlData.error || urlData
        });
      }

      return res.status(200).json({
        mode: 'embedded',
        signUrl: urlData.embedded.sign_url,
        signatureRequestId: sigRequest.signature_request_id,
        pdfSource: pdfSource
      });
    } else {
      return res.status(200).json({
        mode: 'email',
        emailsSent: true,
        signatureRequestId: sigRequest.signature_request_id,
        pdfSource: pdfSource,
        message: `Signature request emails sent to ${designerEmail} and ${clientEmail}.`
      });
    }
  } catch (err) {
    console.error('Sign handler error:', err);
    return res.status(500).json({
      error: 'Server error while creating signature request',
      message: err.message
    });
  }
};
