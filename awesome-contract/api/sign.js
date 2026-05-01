// ============================================================
// /api/sign.js — Dropbox Sign integration
//
// Creates a signature request via Dropbox Sign API.
// Two modes supported:
//
//   1. EMBEDDED MODE — opens signing modal in-page
//      (requires Premium plan + Embedded App with client_id)
//
//   2. EMAIL MODE — sends signing emails to both parties
//      (works on any Dropbox Sign plan, simpler setup)
//
// Set MODE below to choose.
//
// Required environment variables (set in Vercel dashboard):
//   DROPBOX_SIGN_API_KEY — your API key from Dropbox Sign
//   DROPBOX_SIGN_CLIENT_ID — only needed for embedded mode
// ============================================================

const fs = require('fs');
const path = require('path');

// Toggle: 'embedded' or 'email'
const MODE = process.env.DROPBOX_SIGN_MODE || 'email';

// API key — should be set as a Vercel env var. The fallback below was previously
// the same value as CLIENT_ID, which is incorrect (these are different in Dropbox Sign).
// Leaving the fallback empty so missing env vars surface a clear error instead of
// silently failing the API call.
const API_KEY = process.env.DROPBOX_SIGN_API_KEY || '';

const CLIENT_ID = process.env.DROPBOX_SIGN_CLIENT_ID ||
                  '4de7afdc22788c66ca6604f466e51f846cafbfe66cbcddfacd72fbef92db0b29';

const TEST_MODE = process.env.DROPBOX_SIGN_TEST_MODE !== 'false'; // default: test mode on

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

// Build multipart/form-data manually so we can attach the PDF
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
// Main handler
// ============================================================

module.exports = async (req, res) => {
  // CORS for safety
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Upfront validation — if no API key is set, return a clear error
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

    // Read the PDF from /pdf folder
    // On Vercel, serverless functions resolve relative paths from the function's own directory.
    // We try multiple candidate paths so this works locally AND in production.
    const candidates = [
      path.join(process.cwd(), 'pdf', 'AWESOME_Brand_Design_Agreement.pdf'),
      path.join(__dirname, '..', 'pdf', 'AWESOME_Brand_Design_Agreement.pdf'),
      path.join('/var/task', 'pdf', 'AWESOME_Brand_Design_Agreement.pdf'),
      path.join(__dirname, 'pdf', 'AWESOME_Brand_Design_Agreement.pdf')
    ];
    let pdfBuffer;
    let pdfPath;
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          pdfBuffer = fs.readFileSync(candidate);
          pdfPath = candidate;
          break;
        }
      } catch (e) { /* try next */ }
    }
    if (!pdfBuffer) {
      console.error('Contract PDF not found. Tried paths:', candidates);
      return res.status(500).json({
        error: 'Contract PDF not found on server.',
        hint: 'Make sure pdf/AWESOME_Brand_Design_Agreement.pdf is committed and that vercel.json includes it via functions[].includeFiles.',
        triedPaths: candidates
      });
    }

    const boundary = '----awesome' + Math.random().toString(36).substring(2);
    const endpoint = MODE === 'embedded' ? '/signature_request/create_embedded' : '/signature_request/send';

    // Build form fields for Dropbox Sign API
    const fields = {
      'title': title,
      'subject': subject,
      'message': message,
      'test_mode': TEST_MODE ? '1' : '0',

      // Two signers — designer first, client second
      'signers[0][email_address]': designerEmail,
      'signers[0][name]': designerName,
      'signers[0][order]': '0',

      'signers[1][email_address]': clientEmail,
      'signers[1][name]': clientName,
      'signers[1][order]': '1',

      // Metadata for tracking
      'metadata[client_email]': clientEmail,
      'metadata[tier]': formData.tier || '',
      'metadata[country]': formData.country || '',
      'metadata[start_date]': formData.startDate || '',
      'metadata[project_name]': formData.projectName || ''
    };

    // Embedded mode requires client_id
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

    // Send to Dropbox Sign
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
      // Get the embedded sign URL for the client (signer index 1)
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
        signatureRequestId: sigRequest.signature_request_id
      });
    } else {
      // Email mode — both parties get email links
      return res.status(200).json({
        mode: 'email',
        emailsSent: true,
        signatureRequestId: sigRequest.signature_request_id,
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
