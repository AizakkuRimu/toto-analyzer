// api/get-pick.js
// Vercel serverless function — reads daily_picks.json straight from the
// GitHub Contents API (api.github.com) instead of raw.githubusercontent.com,
// which is CDN-cached and can lag behind a fresh commit. Same fix as
// get-squid.js, applied to the SmartPick side.
//
// Required env vars (same ones save-pick.js uses):
//   GITHUB_PAT    — personal access token with repo scope
//   GITHUB_REPO   — e.g. "username/repo-name"
//   GITHUB_BRANCH — e.g. "main"  (optional, defaults to "main")
// Optional:
//   GITHUB_PATH   — e.g. "daily_picks.json"  (defaults to "daily_picks.json")

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const PAT    = process.env.GITHUB_PAT;
  const REPO   = process.env.GITHUB_REPO;
  const BRANCH = process.env.GITHUB_BRANCH || 'main';
  const PATH   = (req.query && req.query.path) || process.env.GITHUB_PATH || 'daily_picks.json';

  if (!PAT || !REPO) {
    return res.status(500).json({ error: 'Server misconfigured: GITHUB_PAT or GITHUB_REPO env var missing.' });
  }

  const apiUrl = `https://api.github.com/repos/${REPO}/contents/${PATH}?ref=${BRANCH}`;
  const ghHeaders = {
    'Accept':               'application/vnd.github+json',
    'Authorization':        `Bearer ${PAT}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  try {
    const getRes = await fetch(apiUrl, { headers: ghHeaders, cache: 'no-store' });
    if (getRes.status === 404) {
      return res.status(404).json({ error: 'Not found.' });
    }
    if (!getRes.ok) {
      const err = await getRes.json().catch(() => ({}));
      return res.status(502).json({ error: `GitHub GET failed: ${err.message || getRes.status}` });
    }
    const meta = await getRes.json();
    const content = JSON.parse(Buffer.from(meta.content, 'base64').toString('utf8'));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(content);
  } catch (e) {
    return res.status(502).json({ error: `GitHub GET error: ${e.message}` });
  }
}
