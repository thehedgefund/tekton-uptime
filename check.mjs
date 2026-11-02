// TEKTON uptime monitor (BUILD-PLAYBOOK §4.6): checks every live site in
// sites.json, and keeps one GitHub issue per site that is down. GitHub emails
// the repo owner when an issue opens, so an outage reaches TEKTON; the issue
// closes itself, with a note of how long it lasted, when the site is back.
//
// A site counts as down only after three failed tries 20 seconds apart, so a
// single slow answer (or a database waking from cold start) never raises an
// alarm. "ok" sites must answer 200 with {"ok": true} (the kit's /api/health);
// "db" sites must answer 200 with {"ok": true, "database": "up"} (the kit's
// /api/health?db=1, which round-trips the database; plain /api/health never
// touches it); "200" sites must answer 200.
//
//   node check.mjs              (prints results; with GITHUB_TOKEN and GITHUB_REPOSITORY, opens and closes issues)
//   node check.mjs --skip db    (every site except the database probes: uptime.yml, every 10 minutes)
//   node check.mjs --only db    (only the database probes: uptime-db.yml, every 30 minutes, so Neon's
//                                free-plan compute can sleep between checks, as the health routes ask)
//   node --test                 (check.test.mjs: retry and expect rules, stubbed, no network)
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TRIES = 3;
const GAP_MS = 20_000;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function once(site, fetchImpl) {
  const started = Date.now();
  try {
    const res = await fetchImpl(site.url, { redirect: "follow", signal: AbortSignal.timeout(25_000), headers: { "user-agent": "tekton-uptime/1 (+github actions)" } });
    const ms = Date.now() - started;
    if (res.status !== 200) {
      // For health endpoints the body says what broke (e.g. {"ok":false,"database":"down"}).
      const body = site.expect === "ok" || site.expect === "db" ? await res.text().then((t) => t.trim().slice(0, 120)).catch(() => "") : "";
      return { up: false, why: `HTTP ${res.status}${body ? ` ${body}` : ""}`, ms };
    }
    if (site.expect === "ok" || site.expect === "db") {
      const body = await res.json().catch(() => null);
      if (body?.ok !== true || (site.expect === "db" && body?.database !== "up")) return { up: false, why: `health check answered ${JSON.stringify(body).slice(0, 120)}`, ms };
    }
    return { up: true, ms };
  } catch (e) {
    return { up: false, why: e?.name === "TimeoutError" ? "no answer within 25 seconds" : String(e?.cause?.code ?? e?.message ?? e), ms: Date.now() - started };
  }
}

// fetch and wait are parameters only so the tests can stub them.
export async function check(site, { fetch: fetchImpl = globalThis.fetch, wait = pause } = {}) {
  let last;
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    last = await once(site, fetchImpl);
    if (last.up) return { ...site, ...last, attempts: attempt };
    if (attempt < TRIES) await wait(GAP_MS);
  }
  return { ...site, ...last, attempts: TRIES };
}

// --only <expect> / --skip <expect>: which sites this run checks.
export function selectSites(sites, argv) {
  const pick = (flag) => {
    const i = argv.indexOf(flag);
    if (i === -1) return null;
    if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`${flag} needs an expect value, e.g. ${flag} db`);
    return argv[i + 1];
  };
  const only = pick("--only");
  const skip = pick("--skip");
  return sites.filter((s) => (only === null || s.expect === only) && (skip === null || s.expect !== skip));
}

// Opens an issue for each checked site that is down without one, closes the issue of each
// checked site that is back. It looks only at `results`, so an issue belonging to a site
// this run did not check (the other workflow's sites) is never opened or closed here.
export async function syncIssues(results, open, gh, now = () => new Date()) {
  const title = (r) => `DOWN: ${r.name}`;
  for (const r of results) {
    const issue = open.find((i) => i.title === title(r));
    if (!r.up && !issue) {
      await gh("/issues", { method: "POST", body: JSON.stringify({ title: title(r), labels: ["down"], body: `**${r.name}** is not answering properly.\n\n- Address: ${r.url}\n- What happened: ${r.why}\n- Checked: ${now().toISOString()} (3 tries, 20 seconds apart)\n${r.note ? `- Note: ${r.note}\n` : ""}\nThis issue closes itself when the site is back. Runbook: the site's docs/OPERATIONS.md (Monitoring), and for Render or Vercel suspensions, the billing email's Stripe link.` }) });
      console.log(`  opened an issue for ${r.name}`);
    } else if (r.up && issue) {
      const mins = Math.round((now().getTime() - new Date(issue.created_at).getTime()) / 60_000);
      await gh(`/issues/${issue.number}/comments`, { method: "POST", body: JSON.stringify({ body: `Back up at ${now().toISOString()} (${r.ms} ms). Down for about ${mins} minutes.` }) });
      await gh(`/issues/${issue.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "completed" }) });
      console.log(`  closed the issue for ${r.name}`);
    }
  }
}

async function main() {
  const sites = selectSites(JSON.parse(readFileSync(new URL("./sites.json", import.meta.url), "utf8")), process.argv.slice(2));
  const results = await Promise.all(sites.map((site) => check(site)));
  for (const r of results) console.log(`${r.up ? "UP  " : "DOWN"} ${r.name.padEnd(24)} ${r.up ? `${r.ms} ms` : r.why}  ${r.url}`);

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (token && repo) {
    const gh = (path, init = {}) =>
      fetch(`https://api.github.com/repos/${repo}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json", ...(init.headers ?? {}) } }).then(async (r) => {
        if (!r.ok) throw new Error(`GitHub ${r.status} on ${path}: ${await r.text()}`);
        return r.json();
      });
    const open = await gh("/issues?state=open&labels=down&per_page=100");
    await syncIssues(results, open, gh);
  }

  // The run itself stays green: the issues are the alarm, not a red cross on every run.
  const down = results.filter((r) => !r.up).length;
  console.log(`\n${results.length - down} up, ${down} down.`);
}

// Run only when executed (node check.mjs), not when the tests import check().
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
