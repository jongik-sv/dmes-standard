#!/usr/bin/env node
// 사용법: node tests/js-parity/run.mjs <모듈> [함수…|--all] [--cases 200] [--seed 20261009] [--jobs 6] [--index N] [--stderr] [--switch]
//   --switch: mjs 를 CLI 로 직접 부르는 대신 스위치(COORD_JS_<모듈>=1)를 켠 bash 함수로 돌려, 꺼짐(bash 본문)과 켜짐(js-bridge 경유)을 대조한다
//   모듈 = tests/js-parity/specs/<모듈>.mjs 의 이름(예: console-redact). 함수를 안 쓰면 --all 과 같다.
//   차이가 있으면 재현 명령과 함께 최대 5건을 보여 주고 종료 코드 1, 없으면 0, 사용법 오류 2.
import { parseArgs } from 'node:util';
import { loadSpec, runParity } from './lib.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { all: { type: 'boolean' }, cases: { type: 'string' }, seed: { type: 'string' }, jobs: { type: 'string' }, index: { type: 'string' }, stderr: { type: 'boolean' }, switch: { type: 'boolean' }, max: { type: 'string' } },
});
if (!positionals.length) { process.stderr.write('사용: node tests/js-parity/run.mjs <모듈> [함수…|--all] [--cases N] [--seed S] [--jobs J] [--index I] [--stderr] [--switch]\n'); process.exit(2); }
const [mod, ...fns] = positionals;
let spec;
try { spec = await loadSpec(mod); } catch (e) { process.stderr.write(`명세를 읽지 못했다(tests/js-parity/specs/${mod}.mjs): ${e.message}\n`); process.exit(2); }
const num = (v, d) => (v == null ? d : Number(v));
const t0 = Date.now();
let rep;
try {
  rep = await runParity(spec, { functions: values.all ? [] : fns, cases: num(values.cases, 200), seed: values.seed ?? 20261009, jobs: num(values.jobs, 6), index: values.index == null ? undefined : Number(values.index), compareStderr: values.stderr, viaSwitch: values.switch, maxReport: num(values.max, 5) });
} catch (e) { process.stderr.write(`${e.message}\n`); process.exit(2); }
for (const [name, s] of Object.entries(rep.perFn)) process.stdout.write(`${s.diffs ? '✖' : '✔'} ${spec.module}.${name}: 사례 ${s.cases}건 · 차이 ${s.diffs}건\n`);
const bad = Object.values(rep.perFn).reduce((a, s) => a + s.diffs, 0);
process.stdout.write(`js-parity ${spec.module}: 총 ${rep.total}건 · 차이 ${bad}건 · ${((Date.now() - t0) / 1000).toFixed(1)}초\n`);
for (const d of rep.diffs) process.stdout.write(d + '\n');
process.exitCode = bad ? 1 : 0;
