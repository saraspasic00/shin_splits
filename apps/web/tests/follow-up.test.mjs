import assert from "node:assert/strict";
import test from "node:test";
import { applyDecision, chooseWeek } from "../src/lib/follow-up-policy.ts";

const profile = { experience: "regular", goal: "consistency", currentWeeklyMinutes: 120, maxSessionMinutes: 60 };
const low = {energy: "low", sleep: "okay"};
const good = {energy: "good", sleep: "good"};
const reports = [low, low, good];
const sessions = [
  {id: "mon", date: "2026-11-30", kind: "run", durationMinutes: 40, title: "Easy run", effort: "easy"},
  {id: "tue", date: "2026-12-01", kind: "rest", title: "Rest day"},
];

for (const [name, days, minutes, source] of [
  ["no check-ins", [], 40, "baseline"],
  ["one low-energy day", [low], 40, "baseline"],
  ["two low-energy days out of three", reports, 35, "fallback"],
]) {
  test(name, async t => {
    t.mock.method(globalThis, "fetch", () => assert.fail("Unexpected model request"));
    const original = process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_BASE_URL;
    t.after(() => { if (original !== undefined) process.env.OLLAMA_BASE_URL = original; });
    const decision = await chooseWeek(profile, days);
    assert.equal(decision.source, source);
    assert.deepEqual(applyDecision(sessions, decision), [{...sessions[0], durationMinutes: minutes}, sessions[1]]);
    assert.equal(globalThis.fetch.mock.callCount(), 0);
  });
}

test("recognizes a model answer and falls back on invalid output", async t => {
  const env = {...process.env};
  t.after(() => {
    for (const key of ["OLLAMA_MODEL", "OLLAMA_BASE_URL"]) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
  });
  process.env.OLLAMA_BASE_URL = "http://localhost:11434";
  process.env.OLLAMA_MODEL = "fixture";
  let answer = "keep";
  t.mock.method(globalThis, "fetch", async () => Response.json({message:{content:JSON.stringify({choice:answer})}}));
  assert.deepEqual(await chooseWeek(profile, reports), {source:"ollama", choice:"keep"});
  answer = "increase";
  assert.deepEqual(await chooseWeek(profile, reports), {source:"fallback", choice:"shorten"});
});

test("live Ollama decision", { skip: process.env.RUN_LIVE_OLLAMA !== "1" }, async () => {
  const decision = await chooseWeek(profile, reports);
  assert.equal(decision.source, "ollama", "No valid model answer within five seconds. Check the model name, server and warm-up.");
  const [run] = applyDecision(sessions, decision);
  assert.equal(run.durationMinutes, decision.choice === "keep" ? 40 : 35);
  console.log("Live Ollama decision:", decision.choice, run.durationMinutes, "minutes");
});

test("shortens runs to five-minute increments and preserves short sessions above zero", () => {
  for (const [minutes, expected] of [[45, 40], [40, 35], [20, 15], [6, 5], [5, 4], [1, 1]]) {
    const [run] = applyDecision([{ ...sessions[0], durationMinutes: minutes }], { choice: "shorten", source: "ollama" });
    assert.equal(run.durationMinutes, expected);
  }
});
