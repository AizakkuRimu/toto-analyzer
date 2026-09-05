// api/get-squid.js
// Vercel serverless function — reads the Squid Game tracker state straight
// from the GitHub Contents API (api.github.com), which is NOT CDN-cached
// the way raw.githubusercontent.com is. raw.githubusercontent.com can lag
// several minutes behind the real repo content after a fresh commit, which
// made saves look like they "didn't work" until the CDN cache expired.
// This endpoint always returns the current committed content.
//
// Required env vars (same ones save-squid.js uses):
//   GITHUB_PAT        — personal access token with repo scope
//   GITHUB_REPO       — e.g. "username/repo-name"
//   GITHUB_BRANCH     — e.g. "main"  (optional, defaults to "main")
// Optional:
//   GITHUB_SQUID_PATH — e.g. "squid_game_state.json"  (defaults to "squid_game_state.json")
//
// No ADMIN_SECRET check here — this is a read-only endpoint and the data
// isn't sensitive (same content that's already publicly readable via the
// raw GitHub URL), so it's fine for the "auto-load on page open" call too.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const PAT    = process.env.GITHUB_PAT;
  const REPO   = process.env.GITHUB_REPO;
  const BRANCH = process.env.GITHUB_BRANCH || 'main';
  // Allow the client to override the path (it lets users customise the
  // squid-game filename in the UI), falling back to the env default.
  const PATH   = (req.query && req.query.path) || process.env.GITHUB_SQUID_PATH || 'squid_game_state.json';

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
