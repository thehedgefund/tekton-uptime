// node --test   (no dependencies; fetch and the pause are stubbed, nothing leaves the machine)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { check, selectSites, syncIssues } from "./check.mjs";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Replies in order; records each call and each pause.
function stub(...replies) {
  const calls = [];
  const waits = [];
  const fetch = async (url) => {
    calls.push(url);
    const next = replies[Math.min(calls.length, replies.length) - 1];
    if (next instanceof Error) throw next;
    return next();
  };
  return { calls, waits, deps: { fetch, wait: async (ms) => void waits.push(ms) } };
}

const arete = { name: "ARETE", url: "https://arete.example/api/health", expect: "200" };

test("a cold-start 503 followed by 200 counts as up, after one retry", async () => {
  const s = stub(() => json(503, { status: "error" }), () => json(200, { status: "ok", database: "ok" }));
  const r = await check(arete, s.deps);
  assert.equal(r.up, true);
  assert.equal(r.attempts, 2);
  assert.equal(s.calls.length, 2);
  assert.deepEqual(s.waits, [20_000]);
});

test("a network error followed by 200 counts as up", async () => {
  const s = stub(new TypeError("fetch failed"), () => json(200, { status: "ok" }));
  const r = await check(arete, s.deps);
  assert.equal(r.up, true);
  assert.equal(r.attempts, 2);
});

test("retries are bounded: always 503 means down after exactly three tries", async () => {
  const s = stub(() => json(503, { status: "error" }));
  const r = await check(arete, s.deps);
  assert.equal(r.up, false);
  assert.equal(r.why, "HTTP 503");
  assert.equal(r.attempts, 3);
  assert.equal(s.calls.length, 3);
  assert.deepEqual(s.waits, [20_000, 20_000]);
});

test("an up site is tried once and never paused", async () => {
  const s = stub(() => json(200, { ok: true }));
  const r = await check({ name: "kit", url: "https://kit.example/api/health", expect: "ok" }, s.deps);
  assert.equal(r.up, true);
  assert.equal(r.attempts, 1);
  assert.deepEqual(s.waits, []);
});

test('ARETE\'s body {status:"ok"} passes "200" but would fail "ok", hence "200"', async () => {
  const body = () => json(200, { status: "ok", database: "ok", commit: "8de820b" });
  assert.equal((await check(arete, stub(body).deps)).up, true);
  const asOk = await check({ ...arete, expect: "ok" }, stub(body).deps);
  assert.equal(asOk.up, false);
});

test("sites.json probes ARETE's /api/health with expect 200", () => {
  const sites = JSON.parse(readFileSync(new URL("./sites.json", import.meta.url), "utf8"));
  const entry = sites.find((s) => s.name === "ARETE");
  assert.ok(entry);
  assert.equal(entry.url, "https://arete-ashen.vercel.app/api/health");
  assert.equal(entry.expect, "200");
});

const deep = { name: "RLWC (live, database)", url: "https://rlwc.example/api/health?db=1", expect: "db" };

test('"db" passes only {ok:true, database:"up"}', async () => {
  const r = await check(deep, stub(() => json(200, { ok: true, database: "up", ms: 8 })).deps);
  assert.equal(r.up, true);
  assert.equal(r.attempts, 1);
});

test('"db" fails the shallow reply {database:"not checked"}, so an ignored ?db=1 never passes as green', async () => {
  const r = await check(deep, stub(() => json(200, { ok: true, database: "not checked" })).deps);
  assert.equal(r.up, false);
  assert.match(r.why, /not checked/);
  assert.equal(r.attempts, 3);
});

test('"db": a database outage (503 {ok:false, database:"down"}) is down after three tries', async () => {
  const s = stub(() => json(503, { ok: false, database: "down" }));
  const r = await check(deep, s.deps);
  assert.equal(r.up, false);
  assert.match(r.why, /HTTP 503.*down/);
  assert.equal(s.calls.length, 3);
});

test("sites.json has a database probe (?db=1, expect db) for RLWC and AOII, live and review", () => {
  const sites = JSON.parse(readFileSync(new URL("./sites.json", import.meta.url), "utf8"));
  for (const url of [
    "https://rlwc.org.uk/api/health?db=1",
    "https://rlwc-review.vercel.app/api/health?db=1",
    "https://theacademyofinfluenceinternational.com/api/health?db=1",
    "https://aoii-review.vercel.app/api/health?db=1",
  ]) {
    const entry = sites.find((s) => s.url === url);
    assert.ok(entry, `missing ${url}`);
    assert.equal(entry.expect, "db");
  }
  for (const s of sites) assert.ok(["ok", "200", "db"].includes(s.expect), `${s.name}: unknown expect ${s.expect}`);
  assert.equal(new Set(sites.map((s) => s.name)).size, sites.length, "site names must be unique (they key the down issues)");
});

test('"db" fails {ok:true} with no database field', async () => {
  const r = await check(deep, stub(() => json(200, { ok: true })).deps);
  assert.equal(r.up, false);
});

test('"db" fails 200 {ok:false, database:"up"}', async () => {
  const r = await check(deep, stub(() => json(200, { ok: false, database: "up" })).deps);
  assert.equal(r.up, false);
});

const plain = { name: "RLWC (live)", url: "https://rlwc.example/api/health", expect: "ok" };
const flat = { name: "African Base", url: "https://ab.example/", expect: "200" };

test("--only db keeps only db sites; --skip db keeps the rest; no flag keeps all", () => {
  const all = [plain, deep, flat];
  assert.deepEqual(selectSites(all, ["--only", "db"]), [deep]);
  assert.deepEqual(selectSites(all, ["--skip", "db"]), [plain, flat]);
  assert.deepEqual(selectSites(all, []), all);
  assert.throws(() => selectSites(all, ["--only"]), /--only needs/);
});

// Records every GitHub call; answers with an empty object.
function ghStub() {
  const calls = [];
  return { calls, gh: async (path, init = {}) => (calls.push({ path, method: init.method ?? "GET", body: init.body && JSON.parse(init.body) }), {}) };
}
const issue = (number, name) => ({ number, title: `DOWN: ${name}`, created_at: "2026-11-02T05:00:00Z" });

test("a --skip db run never closes or opens a db-site issue", async () => {
  const open = [issue(7, deep.name)];
  const { calls, gh } = ghStub();
  // RLWC plain is up, African Base is down; the db site was not checked in this run.
  await syncIssues([{ ...plain, up: true, ms: 5 }, { ...flat, up: false, why: "HTTP 500" }], open, gh);
  assert.ok(!calls.some((c) => c.path.startsWith("/issues/7")), "touched the db-site issue");
  assert.ok(!calls.some((c) => c.body?.title === `DOWN: ${deep.name}`), "opened a db-site issue");
  assert.deepEqual(calls.map((c) => c.body?.title).filter(Boolean), ["DOWN: African Base"]);
});

test("an --only db run never closes or opens a plain-site issue", async () => {
  const open = [issue(8, plain.name), issue(9, deep.name)];
  const { calls, gh } = ghStub();
  await syncIssues([{ ...deep, up: true, ms: 5 }], open, gh);
  assert.ok(!calls.some((c) => c.path.startsWith("/issues/8")), "touched the plain-site issue");
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ["POST /issues/9/comments", "PATCH /issues/9"]);
});

test("a db site that is down and already has an issue gets no second issue", async () => {
  const { calls, gh } = ghStub();
  await syncIssues([{ ...deep, up: false, why: "HTTP 503" }], [issue(9, deep.name)], gh);
  assert.deepEqual(calls, []);
});
