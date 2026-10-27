# tekton-uptime

TEKTON's free uptime monitor: a GitHub Actions cron (every 10 minutes) checks each address in `sites.json`. Repo `C:\Users\thede\tekton-uptime`, github.com/thehedgefund/tekton-uptime (PUBLIC on purpose: free Actions minutes). Fleet tier T2. Full picture: `README.md`.

## Where things are
- `sites.json`: `{name, url, expect}`; `"expect": "ok"` needs 200 with `{"ok":true}` (the kit's `/api/health`), `"200"` needs 200 only. `check.mjs` does the checks; `.github/workflows/uptime.yml` runs it; `keepalive.yml` commits monthly so GitHub never pauses the schedule (it does after 60 days idle).
- Down = three failed tries 20 s apart; opens ONE issue labelled `down` (GitHub emails the owner), which closes itself with the outage length. Closed `down` issues are the outage log. The run itself stays green.
- Watched (21 Oct 2026; GENESIS API was answering 503 that day): RLWC live and review, AOII live and review, Bethel House review, KEYSTONE, TEKTON studio site, African Base, ARETE, DEANGELO aide, GENESIS Render API (genesishq.net sits behind a Cloudflare bot check, so the Render origin is checked).

## Rules
- Add every new client's `/api/health` to `sites.json` and push with plain git (the gh token lacks `workflow` scope). Author `hedgefundthe@gmail.com`.
- Public repo: only public website addresses, never an admin or private URL, never a secret.
- Run locally: `node check.mjs` (prints results; opens no issues without `GITHUB_TOKEN`). Tests: `node --test` (no deps, no network).

## Gotchas
- GitHub's schedule can run a few minutes late: an outage is noticed within about 15 minutes. For one-minute checks UptimeRobot would need SD's account.
- It lives on GitHub, not Vercel or Render, so it still works when those are down.
