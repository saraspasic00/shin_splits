import assert from "node:assert/strict";
import test from "node:test";
import { chooseWeek } from "../src/lib/follow-up-policy.ts";

const profile = {
  experience: "regular",
  goal: "consistency",
  currentWeeklyMinutes: 180,
  maxSessionMinutes: 60,
};

const good = { energy: "good", sleep: "good" };

const easy = {
  date: "2026-11-20",
  plannedMinutes: 45,
  actualMinutes: 45,
  plannedEffort: "easy",
  perceivedEffort: 8,
};

const second = { ...easy, date: "2026-11-22", perceivedEffort: 9 };

test("compare check-in-only and completed-run decisions", async t => {
  const host = process.env.OLLAMA_BASE_URL;
  delete process.env.OLLAMA_BASE_URL;
  t.after(() => {
    if (host !== undefined) process.env.OLLAMA_BASE_URL = host;
  });

  const unrated = [easy, second].map(run => ({ ...run, perceivedEffort: null }));
  const shortRun = { ...easy, actualMinutes: 30, perceivedEffort: 3 };

  for (const [label, runs, checkIns, expected] of [
    ["repeated hard easy runs", [easy, second], [], "shorten"],
    ["high effort despite good energy", [easy, second], [good, good], "shorten"],
    ["one hard run", [easy], [], "keep"],
    ["short easy run", [shortRun], [], "keep"],
    ["unrated runs", unrated, [], "keep"],
  ]) {
    const withoutRuns = await chooseWeek(profile, checkIns);
    const withRuns = await chooseWeek(profile, checkIns, runs);
    assert.equal(withoutRuns.choice, "keep", label);
    assert.equal(withRuns.choice, expected, label);
  }
});

test("model receives recorded duration and effort without check-ins", async t => {
  const original = { ...process.env };
  t.after(() => {
    for (const key of ["OLLAMA_BASE_URL", "OLLAMA_MODEL"]) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  process.env.OLLAMA_BASE_URL = "http://localhost:11434";
  process.env.OLLAMA_MODEL = "fixture";
  const runs = [easy, second, { ...second, perceivedEffort: null }];
  let payload;

  t.mock.method(globalThis, "fetch", async (_, init) => {
    const request = JSON.parse(init.body);
    payload = JSON.parse(request.messages[1].content);
    return Response.json({ message: { content: '{"choice":"shorten"}' } });
  });

  const decision = await chooseWeek(profile, [], runs);
  assert.deepEqual(decision, { choice: "shorten", source: "ollama" });
  assert.deepEqual(payload.completedRunsOldestFirst, runs);
  assert.deepEqual(payload.reportedDaysOldestFirst, []);
});

test("live Ollama review using only completed runs", {
  skip: process.env.RUN_LIVE_OLLAMA !== "1",
}, async t => {
  const host = process.env.OLLAMA_BASE_URL;
  const model = process.env.OLLAMA_MODEL;
  assert.ok(host && model, "Set OLLAMA_BASE_URL and OLLAMA_MODEL in apps/web/.env.local.");

  const start = performance.now();
  const warm = await fetch(new URL("/api/chat", host), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    redirect: "error",
    body: JSON.stringify({ model, stream: false, keep_alive: "5m" }),
    signal: AbortSignal.timeout(120000),
  }).catch(error => {
    throw new Error("Ollama preload failed: " + (error.cause?.code ?? error.message), {
      cause: error,
    });
  });

  assert.ok(warm.ok, "Ollama preload returned HTTP " + warm.status + " for " + model);
  assert.equal((await warm.json()).done, true, "Ollama did not confirm preload.");
  console.log("Model ready after", Math.round(performance.now() - start), "ms");

  const realFetch = globalThis.fetch;
  let diagnostic = "Planner did not call Ollama.";

  t.mock.method(globalThis, "fetch", async (url, init) => {
    try {
      const response = await realFetch(url, init);
      diagnostic = "Ollama returned HTTP " + response.status;
      if (response.ok) {
        const body = await response.clone().json();
        diagnostic += "; model output: " + JSON.stringify(body.message?.content);
      }
      return response;
    } catch (error) {
      diagnostic = init.signal?.aborted
        ? "The warmed model exceeded the planner’s request deadline."
        : "Ollama request failed: " + (error.cause?.code ?? error.message);
      throw error;
    }
  });

  const decision = await chooseWeek(profile, [], [easy, second]);
  assert.equal(decision.source, "ollama", diagnostic);
  assert.ok(["keep", "shorten"].includes(decision.choice));
  console.log("Live completed-run decision:", decision.choice);
});