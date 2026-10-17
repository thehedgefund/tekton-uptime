# TEKTON uptime

Checks each URL in `sites.txt` every 10 minutes (GitHub Actions). A failed run is emailed to the repository owner.

- Add a site: add its `/api/health` URL to `sites.txt`.
- Run now: Actions → Uptime → Run workflow.
- `keepalive.yml` commits once a month so GitHub never pauses the schedule.
