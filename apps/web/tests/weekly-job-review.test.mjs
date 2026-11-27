// Run with Node 24: node --test tests/weekly-job-review.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

test("saved upcoming week responds to check-ins without a profile save", async t => {
  const originalHost = process.env.OLLAMA_BASE_URL;
  delete process.env.OLLAMA_BASE_URL; // deterministic check-in fallback
  t.after(() => {
    if (originalHost !== undefined) process.env.OLLAMA_BASE_URL = originalHost;
  });
  const days = ["2026-11-30","2026-12-01","2026-12-02","2026-12-04"];
  const sessions = days.map(date => ({id:date, date, kind:"run", durationMinutes:45}));
  const row = {id:"plan",plan:{version:1,sessions:structuredClone(sessions)},profile_snapshot:{},
    review_key:null,review_version:null};
  const reports = [];
  const logs = [];
  let previews = 0;
  const prefix = "data:text/javascript,";
  const mods = {
    "server-only":"",
    "./ensure-week":'export async function ensureWeek(){return "existing"}',
    "./schemas/runner-profile":"export const runnerProfileSchema={parse:x=>x}",
    "./schemas/training-plan":"export const trainingPlanSchema={parse:x=>x}",
    "./schemas/check-in":"export const checkInRequestSchema={array:()=>({max:()=>({parse:x=>x})})}",
    "./schemas/run-log":"export const plannedRunSchema={parse:x=>x}, runFeedbackSchema={parse:x=>x}",
    "./run-log-dates":"export const runLogToday=()=> '2026-11-23'",
    "./week-calendar":"export const offsetDate=(date,n)=>new Date(Date.parse(date)+n*86400000).toISOString().slice(0,10)",
    "./plan-preview":"export const getPlanPreview=(...args)=>globalThis.testPreview(...args)",
  };
  globalThis.testPreview = () => {
    previews++;
    return {ok:true,preview:{status:"preview",notes:[],plan:{sessions:structuredClone(sessions),weekStart:days[0]}}};
  };
  const hook = registerHooks({resolve(spec,ctx,next) {
    if (Object.hasOwn(mods,spec)) return {url:prefix+encodeURIComponent(mods[spec]),shortCircuit:true};
    if (["./follow-up-week","./follow-up-policy"].includes(spec)) return next(spec+".ts",ctx);
    return next(spec,ctx);
  }});
  t.after(() => { hook.deregister(); delete globalThis.testPreview; });
  const {prepareOrReviewWeek} = await import("../src/lib/review-upcoming-week.ts");
  const db = {
    from(table) {
      assert.ok(["training_plans","check_ins","run_logs"].includes(table));
      let rows = table === "run_logs" ? logs : reports;
      return {
        select(){return this},
        eq(field,value){
          if (field === "user_id") assert.equal(value,"runner");
          else if (field === "status") rows = rows.filter(r=>r.status===value);
          return this;
        },
        gte(field,value){rows=rows.filter(r=>r[field]>=value);return this},
        lte(field,value){rows=rows.filter(r=>r[field]<=value);return this},
        lt(field,value){rows=rows.filter(r=>r[field]<value);return this},
        single(){return {data:row}},
        order(){return this},
        then(resolve){resolve({data:rows})},
      };
    },
    rpc(name, args) {
      assert.equal(name,"review_upcoming_week");
      assert.equal(args.p_version,row.plan.version);
      assert.equal(args.p_previous_key,row.review_key);
      const changed = row.plan.sessions.some(s => args.p_minutes[s.date] !== s.durationMinutes);
      if (changed) {
        for (const s of row.plan.sessions) s.durationMinutes = args.p_minutes[s.date];
        row.plan.version++;
      }
      row.review_key = args.p_key;
      row.review_version = row.plan.version;
      return {data:changed ? "updated" : "existing"};
    },
  };
  const run = () => prepareOrReviewWeek(db,"runner",days[0]);
  assert.equal(await run(),"existing");
  reports.push({date:"2026-11-22",energy:"low",sleep:"okay"},{date:"2026-11-23",energy:"low",sleep:"poor"});
  assert.equal(await run(),"updated");
  assert.deepEqual(row.plan.sessions.map(s=>s.durationMinutes),[40,40,40,40]);
  const saved = structuredClone(row);
  assert.equal(await run(),"existing");
  assert.deepEqual(row,saved);
  assert.equal(previews,1);
  reports[0].sleep = "poor";
  assert.equal(await run(),"existing");
  assert.equal(row.plan.version,2);
  assert.deepEqual(row.plan.sessions,saved.plan.sessions);
  reports.splice(0);
  assert.equal(await run(),"updated");
  assert.deepEqual(row.plan.sessions,sessions);
  const runRow = { status:"completed", completed_on:"2026-11-10", actual_minutes:45,
    perceived_effort:8, planned_session:{durationMinutes:45,effort:"easy"} };
  logs.push(runRow, {...runRow, completed_on:"2026-11-23", perceived_effort:9});
  assert.equal(await run(),"updated");
  assert.deepEqual(row.plan.sessions.map(s=>s.durationMinutes),[40,40,40,40]);
  const before = previews;
  logs.push({...runRow,status:"skipped"}, {...runRow,completed_on:"2026-11-09"},
    {...runRow,completed_on:"2026-11-24"});
  assert.equal(await run(),"existing");
  assert.equal(previews,before);
  logs[0].actual_minutes = 35;
  assert.equal(await run(),"existing");
  assert.equal(previews,before + 1);
  logs[1].perceived_effort = null;
  assert.equal(await run(),"updated");
  assert.deepEqual(row.plan.sessions,sessions);
});
