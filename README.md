# TEKTON uptime

The uptime monitor for every TEKTON live site (BUILD-PLAYBOOK §4.6, COMPLIANCE-FLOOR §2.2), with no outside account: a GitHub Actions job every 10 minutes checks each address in [sites.json](sites.json).

- **Down** (three failed tries, 20 seconds apart): an issue labelled `down` opens, titled `DOWN: <site>`, saying what failed. GitHub emails the repo owner.
- **Back up**: the issue gets a comment with how long it was down, and closes itself.
- **History**: the closed `down` issues are the outage log.

## Adding a site

Add a line to `sites.json`: `"expect": "ok"` for a build with the kit's `/api/health` (must answer `{"ok": true}`), or `"expect": "200"` for any page that should answer 200. Run it now: Actions › Uptime › Run workflow.

## Limits, honestly

- Every 10 minutes (GitHub's schedule can run a few minutes late), so an outage is noticed within about a quarter of an hour. For one-minute checks, use UptimeRobot (needs SD's account) on the same addresses.
- **This repo is public** (that is what makes the minutes free): the addresses and outage issues can be seen by anyone. Every address here is a public website anyway; never add a private or admin address.
- `keepalive.yml` commits once a month so GitHub never pauses the schedule (it does after 60 days without a commit).
- It runs on GitHub, not on Vercel or Render, so it still works when they are down.
- genesishq.net itself is behind a Cloudflare bot check that refuses scripts; its Render origin is checked instead.

Run locally: `node check.mjs` (prints the results; opens no issues without `GITHUB_TOKEN`).
