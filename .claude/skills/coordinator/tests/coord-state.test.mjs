// scripts/coord-state.mjs 단위·대조 시험(node --test tests/coord-state.test.mjs). jq·bash 가 없으면 건너뛴다.
//   · 시각이 파일에 들어가는 하위명령은 하니스(파일 sha 대조)로 못 보므로, 여기서 두 판을 따로 돌려 시각(ISO)을 지운 뒤 stdout·남긴 파일 내용을 바이트로 대조한다.
//   · now_iso 형식(정규식), state.json 쓰기 글이 진짜 jq 출력과 같은지, 저장소 호출처 경로가 jq 폴백 없이 덮이는지, 폴백 식이 같은 결과를 내는지 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, lstatSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { COORD_ROOT, loadSpec, makeRng } from './js-parity/lib.mjs';
import { parsePath, parseGetExpr } from '../scripts/coord-state.mjs';
import { parse, stringify } from '../scripts/lib/jq-json.mjs';

const HAS_JQ = spawnSync('jq', ['--version'], { stdio: 'ignore' }).status === 0;
const HAS_BASH = spawnSync('bash', ['-c', 'true'], { stdio: 'ignore' }).status === 0;
const SKIP = !HAS_JQ ? 'jq 없음' : !HAS_BASH ? 'bash 없음' : false;
const ISO_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}/g;
const SH = join(COORD_ROOT, 'scripts', 'coord-state.sh');
const MJS = join(COORD_ROOT, 'scripts', 'coord-state.mjs');

function listFiles(root) {
  const out = {};
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name), rel = relative(root, p).split(sep).join('/');
      if (lstatSync(p).isDirectory()) walk(p); else out[rel] = readFileSync(p, 'latin1').replace(ISO_RE, '<ISO>');
    }
  };
  walk(root);
  return out;
}

/** 사례 하나를 한쪽(sh|js)에서 돌려 {rc, out, files(시각 지움)} */
function runOne(spec, c, side) {
  const base = mkdtempSync(join(tmpdir(), `cs-${side}-`));
  const work = join(base, 'work'), home = join(base, 'home'), tmp = join(base, 'tmp');
  for (const d of [work, home, tmp]) mkdirSync(d, { recursive: true });
  try {
    for (const [rel, v] of Object.entries(c.files || {})) {
      const p = join(work, rel);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, typeof v === 'object' && !Buffer.isBuffer(v) ? v.data : v);
    }
    const sub = (v) => (typeof v === 'string' ? v.split('<WORK>').join(work).split('<HOME>').join(home).split('<TMP>').join(tmp) : v);
    const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: tmp, TZ: 'UTC', ...(spec.env || {}), ...(c.env || {}), COORD_JS_COORD_STATE: '0' };
    for (const k of Object.keys(env)) env[k] = sub(env[k]);
    const args = (c.args || []).map(sub);
    const r = side === 'sh'
      ? spawnSync('bash', [SH, ...args], { cwd: work, env, input: c.stdin ?? '', timeout: 60000 })
      : spawnSync(process.execPath, [MJS, ...args], { cwd: work, env, input: c.stdin ?? '', timeout: 60000 });
    const norm = (b) => b.toString('latin1').split(base).join('<BASE>').replace(ISO_RE, '<ISO>').replace(/idle=[0-9]+m/g, 'idle=Nm');
    return { rc: r.status, out: norm(r.stdout), files: listFiles(work) };
  } finally { rmSync(base, { recursive: true, force: true }); }
}

const FILE_TIME_FNS = ['init', 'lane-add', 'event', 'instr', 'ack', 'report', 'item-done', 'hold', 'close-run', 'summary'];
for (const fn of FILE_TIME_FNS) {
  test(`coord-state ${fn}: 시각을 지운 stdout·남긴 파일 내용이 bash 판과 같다(고정 + 무작위 40건)`, { skip: SKIP, timeout: 300000 }, async () => {
    const spec = await loadSpec('coord-state');
    const fs = spec.functions[fn];
    const cases = [...(typeof fs.fixed === 'function' ? await fs.fixed() : fs.fixed || [])];
    const seed = 20261009;
    for (let i = 0; i < 40; i++) cases.push(await fs.gen(makeRng(`${seed}:coord-state-content:${fn}`, i), i));
    const bad = [];
    for (const [i, c0] of cases.entries()) {
      const c = c0.gen ? c0 : { ...c0, args: c0.args && !['init', 'use', 'get', 'set', 'set-many', 'lane-add', 'event', 'instr', 'ack', 'report', 'item-done', 'progress', 'hold', 'close-run', 'summary'].includes(c0.args[0]) ? [fn, ...c0.args] : c0.args };
      const a = runOne(spec, c, 'sh'), b = runOne(spec, c, 'js');
      if (a.rc !== b.rc || a.out !== b.out || JSON.stringify(a.files) !== JSON.stringify(b.files)) {
        const fk = [...new Set([...Object.keys(a.files), ...Object.keys(b.files)])].filter((k) => a.files[k] !== b.files[k]);
        bad.push(`#${i} ${c0.label || ''} ${JSON.stringify(c.args)}\n  sh rc=${a.rc} out=${JSON.stringify(a.out.slice(0, 160))}\n  js rc=${b.rc} out=${JSON.stringify(b.out.slice(0, 160))}\n  다른 파일: ${fk.map((k) => `${k}\n    sh=${JSON.stringify(a.files[k])?.slice(0, 400)}\n    js=${JSON.stringify(b.files[k])?.slice(0, 400)}`).join('\n  ')}`);
        if (bad.length >= 3) break;
      }
    }
    assert.equal(bad.length, 0, bad.join('\n'));
  });
}

test('coord-state: 이벤트·state 에 쓰는 시각 형식이 두 판 모두 YYYY-MM-DDTHH:MM:SS±HH:MM 이다', { skip: SKIP }, () => {
  for (const side of ['sh', 'js']) {
    const base = mkdtempSync(join(tmpdir(), `cs-iso-${side}-`));
    try {
      const env = { ...process.env, HOME: base, TMPDIR: base, COORD_REPO: base, COORD_STATE_ROOT: join(base, 'state'), COORD_RUN: 'r1', COORD_DRY: '1', COORD_CONSOLE_POLL: '0', COORD_JS_COORD_STATE: '0' };
      const run = (...a) => (side === 'sh' ? spawnSync('bash', [SH, ...a], { env, cwd: base }) : spawnSync(process.execPath, [MJS, ...a], { env, cwd: base }));
      assert.equal(run('init', 'r1').status, 0);
      assert.equal(run('lane-add', 'a1', '{"memo":"/x"}').status, 0);
      assert.equal(run('hold', 'a1', '사유', '2026-10-09T12:00:00+09:00').status, 0);
      const st = parse(readFileSync(join(base, 'state', 'r1', 'state.json'), 'utf8'));
      const created = st.get('run').get('created_at');
      assert.match(created, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/, `${side} created_at`);
      for (const ln of readFileSync(join(base, 'state', 'r1', 'events.jsonl'), 'utf8').trim().split('\n')) {
        assert.match(parse(ln).get('at'), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/, `${side} events at`);
      }
    } finally { rmSync(base, { recursive: true, force: true }); }
  }
});

test('coord-state: state.json 쓰기 글이 진짜 jq 와 바이트가 같다(중첩·한글·긴 숫자·빈 배열/객체)', { skip: SKIP }, () => {
  const docs = [
    '{"schema":1,"run":{"id":"r1","goal":"목표 글","pid":4242,"cron_id":null,"big":12345678901234567890,"f":1.50,"e":1e3},"lanes":{},"deps":[],"merge":{"in_flight":null,"queue":[],"history":[]},"x":{}}',
    '{"lanes":{"a1":{"items":[{"id":"it-1","title":"첫 항목","weight":2,"done":true}],"hold":null,"memo":"\\u007f\\u0001 탭\\t줄\\n"}},"usage":{"five":75,"week":0.5}}',
    '{"a":[[],{},[[]],[{"b":[]}]],"s":"😀 é \\"q\\" \\\\ /","n":-0.0,"z":[1,2.5,-3e-7,100000000000000000000]}',
  ];
  for (const d of docs) {
    const r = spawnSync('jq', ['.'], { input: d, encoding: 'utf8' });
    assert.equal(`${stringify(parse(d), { indent: 2 })}\n`, r.stdout, d);
  }
});

// 저장소의 실제 호출처(레인 조사 메모 jq-usage.md)가 쓰는 set·get 식. 전부 jq 폴백 없이 순수 JS 로 덮여야 한다.
const SET_PATHS_REPO = ['.office.user', '.office.finished', '.run.coordinator.pid', '.office.sent["_lead"]', '.office.sent["a1"]', '.office.label["a1"]', '.office.sumhash["a1"]',
  '.usage', '.run.last_tick_at', '.glm', '.lanes["a1"].state', '.lanes.a1.compact.history', '.lanes.a1.compact.last_at', '.lanes.a1.compact.pending', '.approvals', '.windows',
  '.run.cron_id', '.run.coordinator', '.lanes.a1.session', '.run.goal', '.run.rules_doc', '.lanes.c1.compact.pre_compact', '.instrs', '.merge.in_flight', '.merge.queue', '.pending_user',
  '.deps', '.load.soft_ticks', '.lanes.a1.ctx', '.run.cron_id'];
const GET_EXPRS_REPO = ['.', '.lanes | keys', '.lanes.m1.memo', '.lanes.c1.compact.history[-1].after_tokens', '.run.closed_at', '.run.closed_at // ""', '.run.coordinator.session_id',
  '.run.coordinator.pid', '.office.finished', '.office.finished // false', '.run | has("state")'];
test('coord-state: 저장소 호출처의 set 경로 %d개·get 식 %d개를 jq 폴백 없이 덮는다'.replace('%d', SET_PATHS_REPO.length).replace('%d', GET_EXPRS_REPO.length), () => {
  for (const p of SET_PATHS_REPO) assert.notEqual(parsePath(p), null, `set 경로가 폴백: ${p}`);
  for (const e of GET_EXPRS_REPO) assert.notEqual(parseGetExpr(e), null, `get 식이 폴백: ${e}`);
});

test('coord-state: 지원 밖 get 식·경로는 jq 폴백으로 같은 결과를 낸다', { skip: SKIP }, () => {
  const state = '{"run":{"id":"r1","goal":"g"},"lanes":{"a1":{"state":"active","items":[{"id":"1"}]},"b":{"state":"closed"}}}';
  const outsideGet = ['.lanes | map(.state)', '[.lanes[].state] | join(",")', '.lanes | to_entries | length', '.lanes[] | .state', '.run.goal | ascii_upcase', '.lanes.a1.items[0].id', '.["run"].id'];
  for (const expr of outsideGet) {
    const res = [];
    for (const side of ['sh', 'js']) {
      const base = mkdtempSync(join(tmpdir(), 'cs-fb-'));
      try {
        mkdirSync(join(base, 'state', 'r1'), { recursive: true });
        writeFileSync(join(base, 'state', 'r1', 'state.json'), state);
        const env = { ...process.env, HOME: base, COORD_REPO: base, COORD_STATE_ROOT: join(base, 'state'), COORD_RUN: 'r1', COORD_DRY: '1', COORD_JS_COORD_STATE: '0' };
        const r = side === 'sh' ? spawnSync('bash', [SH, 'get', expr], { env, cwd: base }) : spawnSync(process.execPath, [MJS, 'get', expr], { env, cwd: base });
        res.push([r.status, r.stdout.toString()]);
      } finally { rmSync(base, { recursive: true, force: true }); }
    }
    assert.deepEqual(res[1], res[0], `get ${expr}`);
  }
});
