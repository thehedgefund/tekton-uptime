# tekton-uptime

TEKTON's free uptime monitor: a GitHub Actions cron (every 10 minutes) checks each address in `sites.json`; a second (every 30 minutes) checks the database probes. Repo `C:\Users\thede\tekton-uptime`, github.com/thehedgefund/tekton-uptime (PUBLIC on purpose: free Actions minutes). Fleet tier T2. Full picture: `README.md`.

## Where things are
- `sites.json`: `{name, url, expect}`; `"expect": "ok"` needs 200 with `{"ok":true}` (the kit's `/api/health`), `"db"` needs 200 with `{"ok":true,"database":"up"}` (the kit's `/api/health?db=1`; plain `/api/health` never touches the database, so RLWC and AOII have both), `"200"` needs 200 only. `check.mjs` does the checks; `.github/workflows/uptime.yml` runs `node check.mjs --skip db` every 10 min and `uptime-db.yml` runs `--only db` at :07/:37 (each deep probe wakes Neon compute, capped on the free plan; the health routes ask for ~30 min); each run only opens/closes issues of the sites it checked; `keepalive.yml` commits monthly so GitHub never pauses the schedule (it does after 60 days idle).
- Down = three failed tries 20 s apart; opens ONE issue labelled `down` (GitHub emails the owner), which closes itself with the outage length. Closed `down` issues are the outage log. The run itself stays green.
- Watched (2 Nov 2026; GENESIS API answering 503): RLWC live and review, AOII live and review, plus database probes (`?db=1`, expect `db`) for those four, Bethel House review, KEYSTONE, TEKTON studio site, African Base, ARETE, DEANGELO aide, GENESIS Render API (genesishq.net sits behind a Cloudflare bot check, so the Render origin is checked).

## Rules
- Add every new client's `/api/health` to `sites.json` and push with plain git (the gh token lacks `workflow` scope). Author `hedgefundthe@gmail.com`.
- Public repo: only public website addresses, never an admin or private URL, never a secret.
- Run locally: `node check.mjs [--only db | --skip db]` (prints results; opens no issues without `GITHUB_TOKEN`). Tests: `node --test` (no deps, no network).

## Gotchas
- GitHub's schedule can run a few minutes late: an outage is noticed within about 15 minutes. For one-minute checks UptimeRobot would need SD's account.
- A full RLWC or AOII outage opens TWO issues (plain + database) by design; the database one alone means app up, database down.
- It lives on GitHub, not Vercel or Render, so it still works when those are down.
