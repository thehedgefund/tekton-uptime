# TEKTON uptime

The uptime monitor for every TEKTON live site (BUILD-PLAYBOOK §4.6, COMPLIANCE-FLOOR §2.2), with no outside account: a GitHub Actions job every 10 minutes checks each address in [sites.json](sites.json), and a second one every 30 minutes checks the database probes.

- **Down** (three failed tries, 20 seconds apart): an issue labelled `down` opens, titled `DOWN: <site>`, saying what failed. GitHub emails the repo owner.
- **Back up**: the issue gets a comment with how long it was down, and closes itself.
- **History**: the closed `down` issues are the outage log.

## Adding a site

Add a line to `sites.json`: `"expect": "ok"` for a build with the kit's `/api/health` (must answer `{"ok": true}`), `"expect": "db"` for its deep form `/api/health?db=1` (must answer `{"ok": true, "database": "up"}`: the plain form never touches the database, so only this one alerts on a database outage), or `"expect": "200"` for any page that should answer 200. Give each kit build both a plain and a `?db=1` entry. Run it now: Actions › Uptime › Run workflow (or Uptime (databases) for `db` entries).

## Database probes

RLWC live and review and AOII live and review each have a `?db=1` entry (`expect: "db"`). `uptime.yml` runs `node check.mjs --skip db` every 10 minutes; `uptime-db.yml` runs `node check.mjs --only db` every 30 minutes (at :07 and :37). Why the split: each deep probe wakes the site's Neon compute, Neon's free plan caps compute hours, and the health routes themselves ask for the deep form about every 30 minutes. A database outage is therefore noticed within about 35 minutes. Each run only opens or closes the issues of the sites it checked, so the two workflows never touch each other's issues.

A full outage of RLWC or AOII opens **two** issues (`DOWN: RLWC (live)` and `DOWN: RLWC (live, database)`), by design: the plain one says the app is down, the database one alone says the app is up but its database is not.

## Limits, honestly

- Every 10 minutes (GitHub's schedule can run a few minutes late), so an outage is noticed within about a quarter of an hour. For one-minute checks, use UptimeRobot (needs SD's account) on the same addresses.
- **This repo is public** (that is what makes the minutes free): the addresses and outage issues can be seen by anyone. Every address here is a public website anyway; never add a private or admin address.
- `keepalive.yml` commits once a month so GitHub never pauses the schedule (it does after 60 days without a commit).
- It runs on GitHub, not on Vercel or Render, so it still works when they are down.
- genesishq.net itself is behind a Cloudflare bot check that refuses scripts; its Render origin is checked instead.

Run locally: `node check.mjs` (prints the results; opens no issues without `GITHUB_TOKEN`; `--only db` / `--skip db` pick the sites). Tests: `node --test` (retry and expect rules in `check.test.mjs`; fetch is stubbed, no network).
