// api/verify-secret.js
// Vercel serverless function — verifies the ADMIN_SECRET without touching
// GitHub at all. Used by the "Unlock Admin Access" button so the UI can
// tell the user immediately whether their password was actually correct,
// instead of optimistically showing "Unlocked" and only finding out on
// the first real save.
//
// Required env vars:
//   ADMIN_SECRET — same password save-pick.js / save-squid.js check

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  if (!ADMIN_SECRET) {
    return res.status(500).json({ error: 'Server misconfigured: ADMIN_SECRET env var missing.' });
  }

  const incoming = req.headers['x-admin-secret'] || '';
  if (incoming !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorised.' });
  }

  return res.status(200).json({ ok: true });
}
