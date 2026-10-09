// scripts/office.mjs 단위·비결정 기능 시험(node --test tests/office.test.mjs).
// 순수 로직(isotz·epochOf·ctlSp·strN·laneSum·inreq·lbl·readTab)은 tests/golden/office-jq.json 과 대조한다:
// 옛 bash 판 안의 jq 정의(SUM_JQ·LABEL_JQ·COORD_S8_JQ)를 진짜 jq 로 돌린 출력, readTab 은 bash `IFS=탭 read` 출력이 기대값이다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COORD_ROOT } from './support/rng.mjs';
import { epochOf, isotz, ctlSp, ctlDel, strN, rng, u16, trunc16, slug, leadKey, laneKey, maskPaths, sha256Hex, laneSum, inreq, inreqActive, lbl, readTab, redactCheck } from '../scripts/office.mjs';
import { parse, tojson } from '../scripts/lib/jq-json.mjs';

const HAS_BASH = spawnSync('bash', ['-c', 'true'], { stdio: 'ignore' }).status === 0;
const GOLD = JSON.parse(readFileSync(join(COORD_ROOT, 'tests', 'golden', 'office-jq.json'), 'utf8'));

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

test('isotz·epochOf 가 골든(옛 jq 정의 출력)과 같다(경계 값 + 무작위 300건)', () => {
  assert.ok(GOLD.iso.length >= 300);
  for (const { s, want } of GOLD.iso) {
    let mine;
    try { mine = tojson([isotz(s), epochOf(s)]); } catch (e) { if (e.name !== 'JqError') throw e; mine = tojson([isotz(s), 'ERR']); }
    assert.equal(mine, want, JSON.stringify(s));
  }
});

test('ctlSp·ctlDel·strN·rng 가 골든과 같다', () => {
  assert.equal(GOLD.str.length, 200);
  for (const { s, n, want } of GOLD.str) assert.equal(tojson([ctlSp(s), ctlDel(s), strN(s, n)]), want, JSON.stringify(s));
  assert.equal(GOLD.rng.length, 5);
  for (const { v, lo, hi, want } of GOLD.rng) assert.equal(tojson(rng(parse(v), lo, hi)), want, `rng(${v}; ${lo}; ${hi})`);
});

test('laneSum·inreq·lbl 이 골든과 같다(무작위 state 200건 + 무작위 요청 기록 280건)', () => {
  assert.equal(GOLD.laneSum.length, 200);
  for (const { doc, max, rb, rh, want, lbl: wantLbl } of GOLD.laneSum) {
    let mine;
    try { mine = tojson(laneSum(parse(doc), 'a1', max, rb, rh)); } catch (e) { if (e.name !== 'JqError') throw e; mine = ''; }
    assert.equal(mine, want, doc);
    let ml;
    try { ml = lbl(parse(doc), 'a1'); } catch (e) { if (e.name !== 'JqError') throw e; ml = ''; }
    assert.equal(ml, wantLbl, doc);
  }
  assert.equal(GOLD.inreq.length, 280);
  for (const { rec, max, want } of GOLD.inreq) {
    const m = inreq(parse(rec), max);
    assert.equal(tojson([m, m !== null && inreqActive(m)]), want, rec);
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

test('readTab: bash IFS=탭 read 처럼 빈 칸을 합치고 마지막 변수가 나머지를 받는다(골든 = bash 출력)', () => {
  assert.equal(GOLD.readTab.length, 18);
  for (const { f, n, want } of GOLD.readTab) assert.deepEqual(readTab(f, n), want, JSON.stringify([f, n]));
});

test('redactCheck: 가림 함수가 정상이면 통과, 던지거나 rc≠0 이면 실패(닫힘)', () => {
  assert.equal(redactCheck(), true, '기본 redactText 로 확인');
  assert.equal(redactCheck(() => ({ rc: 0 })), true);
  assert.equal(redactCheck(() => { throw new Error('boom'); }), false, 'redact 가 던지면 닫힘');
  assert.equal(redactCheck(() => ({ rc: 71 })), false, 'redact 가 rc≠0 을 돌려주면 닫힘');
  assert.equal(redactCheck(() => ({})), false, 'rc 가 없으면 닫힘');
});

test('redactCheck: bash 가 PATH 에 없는 프로세스에서도 JS 가림이 통과하고 비밀을 가린다', () => {
  const empty = mkdtempSync(join(tmpdir(), 'nobash-'));
  try {
    const lib = join(COORD_ROOT, 'scripts', 'lib', 'console-redact.mjs').replace(/\\/g, '/');
    const code = `import('${join(COORD_ROOT, 'scripts', 'office.mjs').replace(/\\/g, '/')}').then(async (m) => { const { redactText } = await import('${lib}'); console.log(m.redactCheck(), redactText(Buffer.from('password=hunter2xyz\\n')).out.toString().includes('hunter2')); });`;
    const r = spawnSync(process.execPath, ['-e', code], { env: { PATH: empty, HOME: empty }, encoding: 'utf8' });
    assert.equal(r.stdout.trim(), 'true false', r.stderr);
  } finally { rmSync(empty, { recursive: true, force: true }); }
});
