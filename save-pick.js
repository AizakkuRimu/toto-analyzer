// api/save-pick.js
// Vercel serverless function — writes today's SmartPick to GitHub.
// Required env vars (set in Vercel dashboard):
//   GITHUB_PAT      — personal access token with repo scope
//   GITHUB_REPO     — e.g. "username/repo-name"
//   GITHUB_BRANCH   — e.g. "main"  (optional, defaults to "main")
//   GITHUB_PATH     — e.g. "daily_picks.json"  (optional, defaults to "daily_picks.json")
//   ADMIN_SECRET    — any strong password you choose; sent as x-admin-secret header

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Auth check ────────────────────────────────────────────
  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  if (!ADMIN_SECRET) {
    return res.status(500).json({ error: 'Server misconfigured: ADMIN_SECRET env var missing.' });
  }
  const incoming = req.headers['x-admin-secret'] || '';
  if (incoming !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorised.' });
  }

  // ── GitHub config ─────────────────────────────────────────
  const PAT    = process.env.GITHUB_PAT;
  const REPO   = process.env.GITHUB_REPO;
  const BRANCH = process.env.GITHUB_BRANCH || 'main';
  const PATH   = process.env.GITHUB_PATH   || 'daily_picks.json';

  if (!PAT || !REPO) {
    return res.status(500).json({ error: 'Server misconfigured: GITHUB_PAT or GITHUB_REPO env var missing.' });
  }

  // ── Parse body ────────────────────────────────────────────
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }

  const { date, numbers, audit } = body || {};
  if (!date || !Array.isArray(numbers) || numbers.length !== 6) {
    return res.status(400).json({ error: 'Body must include date (string), numbers (6-element array), and audit.' });
  }

  // ── GitHub read → merge → write ───────────────────────────
  const apiUrl = `https://api.github.com/repos/${REPO}/contents/${PATH}`;
  const ghHeaders = {
    'Accept':               'application/vnd.github+json',
    'Authorization':        `Bearer ${PAT}`,
    'Content-Type':         'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  let sha = null;
  let existing = { picks: [] };
  try {
    const getRes = await fetch(`${apiUrl}?ref=${BRANCH}`, { headers: ghHeaders });
    if (getRes.ok) {
      const meta = await getRes.json();
      sha = meta.sha;
      existing = JSON.parse(Buffer.from(meta.content, 'base64').toString('utf8'));
    } else if (getRes.status !== 404) {
      const err = await getRes.json();
      return res.status(502).json({ error: `GitHub GET failed: ${err.message || getRes.status}` });
    }
  } catch (e) {
    return res.status(502).json({ error: `GitHub GET error: ${e.message}` });
  }

  const picks = (existing.picks || []).filter(p => p.date !== date);
  picks.push({ date, numbers, audit });
  picks.sort((a, b) => b.date.localeCompare(a.date));

  const encoded = Buffer.from(JSON.stringify({ picks }, null, 2)).toString('base64');
  const putBody = {
    message: `chore: SmartPick for ${date}`,
    content: encoded,
    branch:  BRANCH,
    ...(sha ? { sha } : {}),
  };

  try {
    const putRes = await fetch(apiUrl, { method: 'PUT', headers: ghHeaders, body: JSON.stringify(putBody) });
    if (!putRes.ok) {
      const err = await putRes.json();
      return res.status(502).json({ error: `GitHub PUT failed: ${err.message || putRes.status}` });
    }
    const result = await putRes.json();
    return res.status(200).json({ ok: true, commit: result.commit?.sha });
  } catch (e) {
    return res.status(502).json({ error: `GitHub PUT error: ${e.message}` });
  }
}
