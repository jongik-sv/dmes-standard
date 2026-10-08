// scripts/office.mjs 단위·비결정 기능 시험(node --test tests/office.test.mjs). 순수 로직은 office.sh 안의 진짜 jq 정의(SUM_JQ)와 대조한다(jq 가 없으면 건너뜀).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COORD_ROOT, makeRng } from './js-parity/lib.mjs';
import { epochOf, isotz, ctlSp, ctlDel, strN, rng, u16, trunc16, slug, leadKey, laneKey, maskPaths, sha256Hex, laneSum, inreq, inreqActive, lbl, readTab } from '../scripts/office.mjs';
import { parse, tojson } from '../scripts/lib/jq-json.mjs';

const HAS_JQ = spawnSync('jq', ['--version'], { stdio: 'ignore' }).status === 0;
const HAS_BASH = spawnSync('bash', ['-c', 'true'], { stdio: 'ignore' }).status === 0;
const SKIP = !HAS_JQ ? 'jq 없음' : false;
const OFFICE_SH = readFileSync(join(COORD_ROOT, 'scripts', 'office.sh'), 'utf8');
const grab = (name, next) => { const m = new RegExp(`^${name}='([\\s\\S]*?)'\\n${next}`, 'm').exec(OFFICE_SH); assert.ok(m, `${name} 를 office.sh 에서 못 찾았다`); return m[1]; };
const SUM_JQ = grab('SUM_JQ', 'sha256\\(\\)');
const LABEL_JQ = grab('LABEL_JQ', 'st\\(\\)');
const COORD_S8_JQ = /^COORD_S8_JQ='([\s\S]*?)'\ncoord_sess8/m.exec(readFileSync(join(COORD_ROOT, 'scripts', 'lib', 'common.sh'), 'utf8'))[1];
const jqRun = (prog, args = [], input = 'null') => {
  const r = spawnSync('jq', ['-c', ...args, prog], { input, encoding: 'utf8' });
  return { rc: r.status, out: r.stdout.replace(/\n$/, ''), err: r.stderr };
};

test('sha256Hex: 알려진 값과 같다', () => {
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('slug·u16·trunc16·leadKey·laneKey: UTF-16 단위로 세고 자른다', () => {
  assert.equal(slug('Jji.Test'), 'jji-test');
  assert.equal(slug('한글Host'), '--host');
  assert.equal(u16('a😀b'), 4);
  assert.equal(trunc16('a😀b', 2), 'a');   // 이모지(2칸)가 반쯤 걸치면 통째로 뺀다
  assert.equal(trunc16('a😀b', 3), 'a😀');
  assert.equal(leadKey('u/h', 's1'), 'u/h/coord:s1');
  assert.equal(leadKey('u/h', ''), 'u/h/coord');
  assert.equal(laneKey('u/h', 'a1', '두  줄\n요약 /경로/x ', 40), 'u/h/임시:a1·두 줄 요약 경로x');
  assert.equal(laneKey('u/h', 'a1', '', 40), 'u/h/임시:a1');
  assert.ok(u16(laneKey('u/h', 'l'.repeat(60), '가'.repeat(200), 120)) <= 120);
});

test('maskPaths: 절대 경로 토큰을 [경로] 로 바꾼다(줄마다)', () => {
  assert.equal(maskPaths('보기 /Users/x/a.md 와 ~/b, (/c/d) "e=/f/g"'), '보기 [경로] 와 [경로] ([경로]) "e=[경로]"');
  assert.equal(maskPaths('/a\n/b x'), '[경로]\n[경로] x');
  assert.equal(maskPaths('a/b 는 그대로'), 'a/b 는 그대로');
});

test('isotz·epochOf 가 office.sh 의 jq 정의와 같다(경계 값 + 무작위 300건)', { skip: SKIP }, () => {
  const cases = ['2026-10-09T01:02:03+09:00', '2026-10-09T01:02:03Z', '2026-10-09T01:02Z', '2026-10-09T01:02:03.456Z', '2026-10-09T01:02:03', '2026-10-09 01:02:03Z', '2026-10-09T01:02:03Z\n', '2026-10-09T01:02:03Z\n\n',
    '2026-13-45T25:61:61Z', '2026-02-31T00:00:00Z', '2026-10-00T01:02:03Z', '2026-10-09T23:59:60Z', '2026-10-09T24:00:00Z', '1969-12-31T23:59:59Z', '1970-01-01T00:00:00Z', '0000-10-09T00:00:00Z', '9999-12-31T23:59:59Z', '2026-10-09T01:02:03-05:30', '2026-10-09T01:02:03+99:99', '', 'x'];
  const r = makeRng('office-iso', 0);
  for (let i = 0; i < 300; i++) cases.push(`${r.int(1960, 2040)}-${String(r.int(0, 14)).padStart(2, '0')}-${String(r.int(0, 33)).padStart(2, '0')}T${String(r.int(0, 25)).padStart(2, '0')}:${String(r.int(0, 61)).padStart(2, '0')}${r.chance(0.7) ? `:${String(r.int(0, 62)).padStart(2, '0')}` : ''}${r.pick(['Z', '+09:00', '-03:30', ''])}`);
  for (const s of cases) {
    const j = jqRun(`${SUM_JQ} $s | [isotz, (try epoch catch "ERR")]`, ['--arg', 's', s]);
    let mine;
    try { mine = tojson([isotz(s), epochOf(s)]); } catch (e) { if (e.name !== 'JqError') throw e; mine = tojson([isotz(s), 'ERR']); }
    assert.equal(mine, j.out, JSON.stringify(s));
  }
});

test('ctlSp·ctlDel·strN·rng 가 jq 정의와 같다', { skip: SKIP }, () => {
  const r = makeRng('office-str', 0);
  const parts = ['a', ' ', '\t', '\n', '\r', '\u0001', '\u007f', '\u0085', '\u009f', ' ', '한글', '😀', 'é', '/'];
  for (let i = 0; i < 200; i++) {
    const s = Array.from({ length: r.int(0, 12) }, () => r.pick(parts)).join('');
    const n = r.int(0, 8);
    const j = jqRun(`${SUM_JQ} [($s | ctl_sp), ($s | ctl_del), ($s | str(${n}))]`, ['--arg', 's', s]);
    assert.equal(tojson([ctlSp(s), ctlDel(s), strN(s, n)]), j.out, JSON.stringify(s));
  }
  for (const [v, lo, hi] of [[5.7, 0, 9], [-3, 0, 9], [250.5, 0, 100], ['7', 0, 100], [null, 0, 9]]) {
    const j = jqRun(`${SUM_JQ} ${JSON.stringify(v)} | rng(${lo}; ${hi})`);
    assert.equal(tojson(rng(parse(JSON.stringify(v)), lo, hi)), j.out);
  }
});

test('laneSum·inreq·lbl 이 jq 정의와 같다(무작위 state 200건)', { skip: SKIP }, () => {
  const r = makeRng('office-sum', 0);
  const rv = (d = 0) => { const k = r.int(0, d > 1 ? 4 : 8); return k === 0 ? 'null' : k === 1 ? r.pick(['true', 'false']) : k === 2 ? r.pick(['0', '7', '42.9', '-3', '250']) : k === 3 ? JSON.stringify(r.pick(['', 'x', '한글 /p/q', '2026-10-09T01:02:03Z', 'closed', 'closing'])) : k === 4 ? '[]' : k === 5 ? `[${rv(d + 1)}]` : k === 6 ? '{}' : `{"done":${r.pick(['true', 'false', '1'])},"pct":${rv(d + 1)},"pending":${r.pick(['true', 'false', '"x"'])},"reason":"r","lane":${rv(d + 1)}}`; };
  for (let i = 0; i < 200; i++) {
    const lane = `{${['state', 'brief', 'branch', 'hold', 'items', 'last_report_at', 'last_instr_at', 'ctx', 'compact'].filter(() => r.chance(0.8)).map((k) => `"${k}":${k === 'items' ? `[${rv(1)},${rv(1)}]` : rv()}`).join(',')}}`;
    const doc = `{"run":{"id":"r1","coordinator":{"session_id":${r.pick(['"S1A2B3C4-ffff"', '""', 'null', '5'])},"pid":${r.pick(['0', '99', 'null'])}}},"lanes":{"a1":${r.chance(0.9) ? lane : rv()}},"merge":{"in_flight":${r.pick(['null', '{"lane":"a1"}', '{"lane":5}'])}}}`;
    const max = r.pick([100, 300, 2048]);
    const rb = r.pick(['', '요약 글 '.repeat(r.int(1, 30)), 'x'.repeat(250)]), rh = r.pick(['', '대기 사유', '사유 '.repeat(40)]);
    const j = jqRun(`${COORD_S8_JQ}${LABEL_JQ}${SUM_JQ} lane_sum($l; ${max}; $rb; $rh)`, ['--arg', 'l', 'a1', '--arg', 'rb', rb, '--arg', 'rh', rh], doc);
    let mine;
    try { mine = tojson(laneSum(parse(doc), 'a1', max, rb, rh)); } catch (e) { if (e.name !== 'JqError') throw e; mine = ''; }
    assert.equal(mine, j.rc === 0 ? j.out : '', doc);
    const jl = jqRun(`${LABEL_JQ} lbl("a1")`, ['-r'], doc);
    let ml;
    try { ml = lbl(parse(doc), 'a1'); } catch (e) { if (e.name !== 'JqError') throw e; ml = ''; }
    assert.equal(ml, jl.rc === 0 ? jl.out : '', doc);
  }
  for (let i = 0; i < 200; i++) {
    const rec = `{${['run', 'handle', 'kind', 'since', 'excerpt', 'handled'].filter(() => r.chance(0.9)).map((k) => `"${k}":${k === 'kind' ? JSON.stringify(r.pick(['permission', 'question', 'usage-limit', 'trust', 'bogus', 'message'])) : k === 'since' ? JSON.stringify(r.pick(['2026-10-09T01:02:03Z', '2026-10-09T01:02', 'x'])) : k === 'handled' ? r.pick(['null', '{"by":"auto","at":"2026-10-09T01:02:03Z"}', '{"by":"x","at":"2026-10-09T01:02:03Z"}', '"s"']) : k === 'excerpt' ? JSON.stringify(Array.from({ length: r.int(0, 14) }, () => `줄 ${'가'.repeat(r.int(0, 250))}\u0001`)) : rv()}`).join(',')}}`;
    const max = r.pick([200, 600, 3072]);
    const j = jqRun(`${LABEL_JQ}${SUM_JQ} inreq(${max}) | [., (. | inreq_active)]`, [], rec);
    const m = inreq(parse(rec), max);
    assert.equal(tojson([m, m !== null && inreqActive(m)]), j.out, rec);
  }
});

// ---- dflow.sh 5초 제한: 느린 가짜 dflow.sh 와 그 손자까지 거둔다(비결정 기능 — 별도 시험) ----
test('office: 느린 dflow.sh 는 5초에 끊고 손자 프로세스까지 거둔다(종료 코드 0)', { skip: !HAS_BASH || process.platform === 'win32', timeout: 60000 }, async () => {
  const base = mkdtempSync(join(tmpdir(), 'office-kill-'));
  try {
    mkdirSync(join(base, 'state', 'r1'), { recursive: true });
    const mark = `sleep ${40 + (process.pid % 7)}.${process.pid % 10}`;   // 이 시험만의 표식 sleep
    writeFileSync(join(base, 'fake-dflow.sh'), `#!/bin/sh\n${mark} &\nwait\n`);
    writeFileSync(join(base, '.coord.local.json'), '{"state_dir":"state","office":{"enabled":true,"project_id":"p","label_max":40,"dflow_script":"fake-dflow.sh"}}');
    writeFileSync(join(base, 'state', 'r1', 'state.json'), '{"run":{"id":"r1","coordinator":{"session_id":"S1A2B3C4","pid":0}},"office":{"user":"u"},"lanes":{}}');
    const env = { ...process.env, COORD_REPO: base, COORD_STATE_ROOT: join(base, 'state'), COORD_RUN: 'r1', COORD_SESSION_ID: 'S1A2B3C4', HOME: base, DFLOW_CONSOLE_DIR: join(base, 'console'), COORD_DRY: '', COORD_CONSOLE_POLL: '0' };
    const t0 = Date.now();
    const rc = await new Promise((res) => spawn(process.execPath, [join(COORD_ROOT, 'scripts', 'office.mjs'), 'lead-up'], { env, cwd: base, stdio: 'ignore' }).on('exit', res));
    const dt = Date.now() - t0;
    assert.equal(rc, 0);
    assert.ok(dt >= 4500 && dt < 12000, `경과 ${dt}ms`);
    await new Promise((r) => setTimeout(r, 600));
    const ps = spawnSync('ps', ['-axo', 'command'], { encoding: 'utf8' }).stdout;
    assert.ok(!ps.split('\n').some((l) => l.trim() === mark), '손자 sleep 이 남아 있다');
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('readTab: bash IFS=탭 read 처럼 빈 칸을 합치고 마지막 변수가 나머지를 받는다', { skip: !HAS_BASH && 'bash 없음' }, () => {
  const cases = [['r1', '', '1', '0', '2'], ['r1', 'ab', '1', '0'], ['', 'x', 'y'], ['a', 'b', '', '', 'c', 'd', 'e'], ['k', ''], ['k', '', '9']];
  for (const f of cases) for (const n of [2, 3, 5]) {
    const names = Array.from({ length: n }, (_, i) => `v${i}`);
    const script = `IFS=$'\\t' read -r ${names.join(' ')} <<< "$1"; for v in ${names.map((x) => `"$${x}"`).join(' ')}; do printf '%s\\0' "$v"; done`;
    const r = spawnSync('bash', ['-c', script, 'x', f.join('\t')], { encoding: 'utf8' });
    assert.deepEqual(readTab(f, n), r.stdout.split('\0').slice(0, n), JSON.stringify([f, n]));
  }
});
