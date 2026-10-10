// scripts/coord-state.mjs 단위·골든 시험(node --test tests/coord-state.test.mjs). jq 가 없으면 jq 와 대조하는 시험만 건너뛴다.
//   · tests/golden/coord-state.json: 옛 bash 판(W4 에서 퇴역) 출력으로 만든 기대값. 하위명령마다 고정 사례 + 시드 고정 무작위 사례의
//     {입력(args, files, env, stdin), rc, 시각·임시 폴더를 지운 stdout, 바뀐·지워진 파일}. 시험은 node 판 단독으로 같은 입력을 돌려 같음을 본다.
//     스크립트 이름만 bash 판 이름에서 coord-state.mjs 로 바꿨다(사용법·DRY·오류 문구).
//   · now_iso 형식(정규식), state.json 쓰기 글이 진짜 jq 출력과 같은지, 저장소 호출처 경로가 jq 폴백 없이 덮이는지, 폴백 식이 같은 결과를 내는지 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, lstatSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { COORD_ROOT } from './support/rng.mjs';
import { parsePath, parseGetExpr } from '../scripts/coord-state.mjs';
import { parse, stringify } from '../scripts/lib/jq-json.mjs';

const HAS_JQ = spawnSync('jq', ['--version'], { stdio: 'ignore' }).status === 0;
const SKIP = !HAS_JQ ? 'jq 없음' : false;
const ISO_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}/g;
const MJS = join(COORD_ROOT, 'scripts', 'coord-state.mjs');
const GOLDEN = JSON.parse(readFileSync(join(COORD_ROOT, 'tests', 'golden', 'coord-state.json'), 'utf8'));

/** 골든의 글(문자열 또는 {b64})을 바이트로 */
const dec = (v) => (typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v.b64, 'base64'));
const norm = (buf) => buf.toString('latin1').replace(ISO_RE, '<ISO>');

function listFiles(root) {
  const out = {};
  const walk = (d, pre) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name), rel = relative(root, p).split(sep).join('/');
      if (lstatSync(p).isDirectory()) walk(p, pre); else out[pre + rel] = readFileSync(p, 'latin1').replace(ISO_RE, '<ISO>');
    }
  };
  walk(root, '');
  return out;
}

/** 골든 사례 하나를 node 판으로 돌려 {rc, out, files(시각 지움)} */
function runOne(c) {
  const base = mkdtempSync(join(tmpdir(), 'cs-js-'));
  const work = join(base, 'work'), home = join(base, 'home'), tmp = join(base, 'tmp');
  for (const d of [work, home, tmp]) mkdirSync(d, { recursive: true });
  try {
    for (const [rel, v] of Object.entries(c.files)) {
      const p = rel.startsWith('home/') ? join(home, rel.slice(5)) : join(work, rel);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, dec(v));
    }
    const sub = (v) => (typeof v === 'string' ? v.split('<WORK>').join(work).split('<HOME>').join(home).split('<TMP>').join(tmp) : v);
    const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: tmp, TZ: 'UTC', COORD_WBS_AUTO: '0', ...c.env };   // 골든은 옛 판 기대값 — WBS 자동 생성(init·item-done·close-run)은 끈다
    delete env.ORCA_TAB_ID;
    for (const k of Object.keys(env)) env[k] = sub(env[k]);
    const r = spawnSync(process.execPath, [MJS, ...c.args.map(sub)], { cwd: work, env, input: dec(c.stdin), timeout: 60000 });
    const outStr = r.stdout.toString('latin1').split(base).join('<BASE>').replace(ISO_RE, '<ISO>').replace(/idle=[0-9]+m/g, 'idle=Nm');
    const files = { ...listFiles(work) };
    for (const [k, v] of Object.entries(listFiles(home))) files[`home/${k}`] = v;
    return { rc: r.status, out: outStr, files: Object.fromEntries(Object.entries(files).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) };
  } finally { rmSync(base, { recursive: true, force: true }); }
}

/** 골든이 말하는 기대 파일 목록: 입력 파일(시각 지움) 위에 바뀐 것을 덮고 지워진 것을 뺀다 */
function expectedFiles(c) {
  const exp = {};
  for (const [k, v] of Object.entries(c.files)) exp[k] = norm(dec(v));
  for (const [k, v] of Object.entries(c.changed)) exp[k] = dec(v).toString('latin1');
  for (const k of c.removed) delete exp[k];
  return Object.fromEntries(Object.entries(exp).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));
}

const FNS = [...new Set(GOLDEN.cases.map((c) => c.fn))];
for (const fn of FNS) {
  const mine = GOLDEN.cases.filter((c) => c.fn === fn);
  test(`coord-state ${fn}: 시각을 지운 stdout·종료 코드·남긴 파일이 골든과 같다(고정 + 무작위 ${mine.length}건)`, { timeout: 300000 }, () => {
    const bad = [];
    for (const [i, c] of mine.entries()) {
      const a = { rc: c.rc, out: dec(c.out).toString('latin1'), files: expectedFiles(c) }, b = runOne(c);
      if (a.rc !== b.rc || a.out !== b.out || JSON.stringify(a.files) !== JSON.stringify(b.files)) {
        const fk = [...new Set([...Object.keys(a.files), ...Object.keys(b.files)])].filter((k) => a.files[k] !== b.files[k]);
        bad.push(`#${i} ${c.label || ''} ${JSON.stringify(c.args)}\n  골든 rc=${a.rc} out=${JSON.stringify(a.out.slice(0, 160))}\n  js    rc=${b.rc} out=${JSON.stringify(b.out.slice(0, 160))}\n  다른 파일: ${fk.map((k) => `${k}\n    골든=${JSON.stringify(a.files[k])?.slice(0, 400)}\n    js  =${JSON.stringify(b.files[k])?.slice(0, 400)}`).join('\n  ')}`);
        if (bad.length >= 3) break;
      }
    }
    assert.equal(bad.length, 0, bad.join('\n'));
  });
}

test('coord-state: 이벤트·state 에 쓰는 시각 형식이 YYYY-MM-DDTHH:MM:SS±HH:MM 이다', () => {
  const base = mkdtempSync(join(tmpdir(), 'cs-iso-'));
  try {
    const env = { ...process.env, HOME: base, TMPDIR: base, COORD_REPO: base, COORD_STATE_ROOT: join(base, 'state'), COORD_RUN: 'r1', COORD_DRY: '1', COORD_CONSOLE_POLL: '0' };
    const run = (...a) => spawnSync(process.execPath, [MJS, ...a], { env, cwd: base });
    assert.equal(run('init', 'r1').status, 0);
    assert.equal(run('lane-add', 'a1', '{"memo":"/x"}').status, 0);
    assert.equal(run('hold', 'a1', '사유', '2026-10-09T12:00:00+09:00').status, 0);
    const st = parse(readFileSync(join(base, 'state', 'r1', 'state.json'), 'utf8'));
    const created = st.get('run').get('created_at');
    assert.match(created, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/, 'created_at');
    for (const ln of readFileSync(join(base, 'state', 'r1', 'events.jsonl'), 'utf8').trim().split('\n')) {
      assert.match(parse(ln).get('at'), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/, 'events at');
    }
  } finally { rmSync(base, { recursive: true, force: true }); }
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

// 기대값은 옛 bash 판(jq 직접 호출)의 [종료 코드, stdout] 이다.
test('coord-state: 지원 밖 get 식·경로는 jq 폴백으로 골든과 같은 결과를 낸다', { skip: SKIP }, () => {
  const state = '{"run":{"id":"r1","goal":"g"},"lanes":{"a1":{"state":"active","items":[{"id":"1"}]},"b":{"state":"closed"}}}';
  const outsideGet = [
    ['.lanes | map(.state)', [0, '[\n  "active",\n  "closed"\n]\n']],
    ['[.lanes[].state] | join(",")', [0, 'active,closed\n']],
    ['.lanes | to_entries | length', [0, '2\n']],
    ['.lanes[] | .state', [0, 'active\nclosed\n']],
    ['.run.goal | ascii_upcase', [0, 'G\n']],
    ['.lanes.a1.items[0].id', [0, '1\n']],
    ['.["run"].id', [0, 'r1\n']],
  ];
  for (const [expr, want] of outsideGet) {
    const base = mkdtempSync(join(tmpdir(), 'cs-fb-'));
    try {
      mkdirSync(join(base, 'state', 'r1'), { recursive: true });
      writeFileSync(join(base, 'state', 'r1', 'state.json'), state);
      const env = { ...process.env, HOME: base, COORD_REPO: base, COORD_STATE_ROOT: join(base, 'state'), COORD_RUN: 'r1', COORD_DRY: '1' };
      const r = spawnSync(process.execPath, [MJS, 'get', expr], { env, cwd: base });
      assert.deepEqual([r.status, r.stdout.toString()], want, `get ${expr}`);
    } finally { rmSync(base, { recursive: true, force: true }); }
  }
});
