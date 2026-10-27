// node --test   (no dependencies; fetch and the pause are stubbed, nothing leaves the machine)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { check } from "./check.mjs";

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
