// ============================================================
// /api/submit.js — Form submission logger
//
// This endpoint receives form data BEFORE the user signs, so
// you have a record of every contract started (even abandoned ones).
//
// Default behavior: logs to Vercel function logs (visible in
// Vercel dashboard → Logs).
//
// To extend, you can:
//
//   1. EMAIL — send yourself an email on every submission
//      (use Resend, Sendgrid, or Mailgun)
//
//   2. DATABASE — store in Vercel Postgres or KV
//
//   3. NOTION — POST to Notion API to create a page
//
//   4. WEBHOOK — forward to Zapier, Make, n8n, etc.
//
// See the bottom of this file for example extension snippets.
// ============================================================

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = req.body || {};

    // === Default: log to Vercel function logs ===
    console.log('[contract submission]', JSON.stringify({
      timestamp: new Date().toISOString(),
      clientName: data.clientName,
      clientEmail: data.clientEmail,
      country: data.country,
      tier: data.tier,
      startDate: data.startDate,
      projectName: data.projectName,
      industry: data.industry,
      payment: data.payment,
      portfolioDelay: data.portfolioDelay,
      // Keep full payload for debugging
      fullPayload: data
    }, null, 2));

    // === Optional: forward to webhook ===
    if (process.env.SUBMISSION_WEBHOOK_URL) {
      try {
        await fetch(process.env.SUBMISSION_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      } catch (e) {
        console.warn('Webhook forward failed:', e.message);
      }
    }

    // === Optional: send email via Resend ===
    if (process.env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'AWESOME Contracts <contracts@awesomebydesign.studio>',
            to: [process.env.NOTIFICATION_EMAIL || 'hello@awesomebydesign.studio'],
            subject: `New contract started — ${data.clientName || 'Unknown client'}`,
            html: `
              <h2>New contract submission</h2>
              <table style="font-family: sans-serif; border-collapse: collapse;">
                <tr><td><b>Client</b></td><td>${data.clientName || '—'}</td></tr>
                <tr><td><b>Email</b></td><td>${data.clientEmail || '—'}</td></tr>
                <tr><td><b>Country</b></td><td>${data.country || '—'}</td></tr>
                <tr><td><b>Tier</b></td><td>${data.tier || '—'}</td></tr>
                <tr><td><b>Project</b></td><td>${data.projectName || '—'}</td></tr>
                <tr><td><b>Start Date</b></td><td>${data.startDate || '—'}</td></tr>
              </table>
              <pre style="background:#f5f5f5;padding:12px;font-size:11px;">${JSON.stringify(data, null, 2)}</pre>
            `
          })
        });
      } catch (e) {
        console.warn('Email send failed:', e.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Submission recorded.'
    });
  } catch (err) {
    console.error('Submit handler error:', err);
    return res.status(500).json({
      error: 'Server error while recording submission',
      message: err.message
    });
  }
};

/* ============================================================
   EXTENSION EXAMPLES
   ============================================================

   --- Vercel KV (key-value store) ---
   import { kv } from '@vercel/kv';
   await kv.lpush('submissions', JSON.stringify(data));

   --- Vercel Postgres ---
   import { sql } from '@vercel/postgres';
   await sql`INSERT INTO submissions (data, created_at) VALUES (${JSON.stringify(data)}, NOW())`;

   --- Notion ---
   await fetch('https://api.notion.com/v1/pages', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
       'Notion-Version': '2022-06-28',
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({
       parent: { database_id: process.env.NOTION_DATABASE_ID },
       properties: {
         'Client': { title: [{ text: { content: data.clientName }}] },
         'Tier':   { rich_text: [{ text: { content: data.tier }}] }
       }
     })
   });
   ============================================================ */
