// ============================================================
// /api/generate-pdf.js — Dynamic PDF generator
//
// Renders the contract HTML to a PDF reflecting the client's
// filled-in state, and returns the buffer.
//
// Used by:
//   - The Download PDF button on the frontend
//   - Indirectly by /api/sign.js (which imports the same lib)
//
// POST body shape:
//   { formData: { ...state } }
//   or
//   { ...state }
//
// Response: application/pdf (binary), with a filename header
//           derived from the client's name.
// ============================================================

const { renderContractPDF } = require('../lib/render-contract-pdf');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    // Accept either { formData: {...} } or the raw state object
    const state = body.formData || body.state || body;

    const startedAt = Date.now();
    const pdfBuffer = await renderContractPDF(state);
    const elapsedMs = Date.now() - startedAt;

    console.log(
      `[generate-pdf] Rendered PDF (${pdfBuffer.length} bytes) in ${elapsedMs}ms ` +
      `for client="${state.clientName || 'unknown'}" tier="${state.tier || 'unknown'}"`
    );

    // Build a filesystem-safe filename
    const clientSlug = (state.clientName || 'Client')
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 60);
    const filename = `AWESOME_x_${clientSlug}_Brand_Design_Agreement.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error('[generate-pdf] PDF rendering failed:', err);
    return res.status(500).json({
      error: 'Failed to generate PDF',
      message: err.message,
      hint: 'Check Vercel function logs for the full stack trace. ' +
            'Common causes: chromium-pack URL unreachable, frontend print-mode handler missing, ' +
            'PDF_RENDER_BASE_URL pointing to a wrong/unreachable host.'
    });
  }
};
