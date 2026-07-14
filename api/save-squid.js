// api/save-squid.js
// Vercel serverless function — writes the Squid Game tracker state to GitHub.
// Sibling to api/save-pick.js — reuses the same GitHub PAT, repo, and admin
// secret, so no new secrets need to be added in Vercel except (optionally)
// GITHUB_SQUID_PATH if you want the state stored somewhere other than the
// default filename.
//
// Required env vars (set in Vercel dashboard — same ones save-pick.js uses):
//   GITHUB_PAT        — personal access token with repo scope
//   GITHUB_REPO       — e.g. "username/repo-name"
//   GITHUB_BRANCH     — e.g. "main"  (optional, defaults to "main")
//   ADMIN_SECRET       — same password save-pick.js checks; sent as x-admin-secret header
// Optional:
//   GITHUB_SQUID_PATH — e.g. "squid_game_state.json"  (defaults to "squid_game_state.json")

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
  const PATH   = process.env.GITHUB_SQUID_PATH || 'squid_game_state.json';

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

  const { state } = body || {};
  if (!state || !Array.isArray(state.squad) || state.squad.length !== 6) {
    return res.status(400).json({ error: 'Body must include a valid state object with a 6-slot squad array.' });
  }

  // ── GitHub read (for sha) → write (full overwrite) ─────────
  // Unlike save-pick.js, this isn't a date-keyed list to merge into —
  // it's a single evolving snapshot of the whole tracker, so each save
  // just overwrites the file wholesale.
  const apiUrl = `https://api.github.com/repos/${REPO}/contents/${PATH}`;
  const ghHeaders = {
    'Accept':               'application/vnd.github+json',
    'Authorization':        `Bearer ${PAT}`,
    'Content-Type':         'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  let sha = null;
  try {
    const getRes = await fetch(`${apiUrl}?ref=${BRANCH}`, { headers: ghHeaders });
    if (getRes.ok) {
      const meta = await getRes.json();
      sha = meta.sha;
    } else if (getRes.status !== 404) {
      const err = await getRes.json();
      return res.status(502).json({ error: `GitHub GET failed: ${err.message || getRes.status}` });
    }
  } catch (e) {
    return res.status(502).json({ error: `GitHub GET error: ${e.message}` });
  }

  const encoded = Buffer.from(JSON.stringify(state, null, 2)).toString('base64');
  const putBody = {
    message: `chore: squid game state (draw #${state.drawCount ?? '?'})`,
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
