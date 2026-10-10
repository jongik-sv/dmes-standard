#!/usr/bin/env node
// pool-tab.mjs — 조정자 스크립트(node). 풀 워커(opencode·GLM)를 보이는 TUI 탭으로 띄우고 다루는 드라이버(pool.mjs 실행기가 부른다).
//   open --kind <opencode|glm> --cwd <작업 폴더> --name <탭 이름>   → stdout `TAB <handle>` · 실패 `TAB_FAIL <사유>`(rc 1)
//        spawn-lane.mjs --no-record 로 띄운다(레인 기록·오피스·glm-cap 없음). GLM = 모델만 GLM 인 Claude Code(launch.glm).
//   send <h> --kind <k> --text <글>   → `SENT` · `SEND_FAIL <사유>`(rc 1). glm = term-send-safe.mjs, opencode = terminal send --enter
//        (opencode 2.x 는 tui-idle 판정이 안 나와 term-send-safe 의 대기 조건을 못 쓴다. 띄운 직후 빈 입력창은 spawn-lane 이 확인한다)
//   screen <h>                        → 화면 끝 60줄. 탭이 없으면 rc 3
//   idle <h>                          → `idle` · `busy`(tui-idle 1.5초 확인)
//   close <h>                         → `CLOSED` · `CLOSE_FAIL`(rc 1). 닫은 뒤 목록에서 사라졌는지 최대 10초 확인
//   close-id <id>                     → `CLOSED_ID <n>`. 제목으로 이 묶음의 탭을 찾아 닫는다(핸들을 기록하기 전에 실행기가 죽었을 때)
//   open 이 실패하면(SPAWN_FAIL·시간 초과) 만들어진 탭을 닫고 TAB_FAIL 을 낸다: SPAWN_FAIL 줄의 handle= 와 제목 검색 둘 다.
// 시험은 환경 COORD_POOL_TAB 으로 가짜 드라이버를 쓴다(tests/fixtures/pool-tab-fake.mjs).
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain, scriptMain } from './lib/js-cli.mjs';
import { titleIsPoolTab } from './lib/pool-core.mjs';
import { functions as T } from './lib/term.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function flags(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) { o[a.slice(2)] = argv[i + 1] ?? ''; i += 1; } else o._.push(a);
  }
  return o;
}

const term = (name, args, env, cwd) => T[name].run({ args, env, cwd });
/** 목록에 있나: true·false, 목록을 못 읽으면 null(모름 — 닫힘으로 치지 않는다) */
function listed(h, env, cwd) {
  const r = term('term_list', [], env, cwd);
  if (r.rc) return null;
  return r.out.split('\n').some((l) => l.split('\t')[0] === h);
}
/** Orca 는 닫힌 터미널을 목록에 한동안 남긴다(connected:false·exitCause). 그 기록은 닫힌 것으로 본다 */
function exited(h, env) {
  const r = spawnSync('orca', ['terminal', 'show', '--terminal', h, '--json'], { env, encoding: 'utf8', windowsHide: true, timeout: 20000 });
  try {
    const t = JSON.parse(r.stdout || '').result?.terminal;
    return !!t && (t.connected === false || !!t.exitCause);
  } catch { return false; }
}
function closeHandle(h, env, cwd) {
  term('term_close', [h], env, cwd);
  for (let i = 0; i < 20; i += 1) {
    const l = listed(h, env, cwd);
    if (l === false || (l === true && exited(h, env))) return true;
    sleepMs(500);
  }
  return false;
}
/** 제목으로 이 묶음의 탭을 모두 닫는다. 돌려줌 = 닫은 수 */
function closeById(id, env, cwd) {
  const r = term('term_list', [], env, cwd);
  let n = 0;
  for (const l of String(r.out || '').split('\n')) {
    const [h, title] = l.split('\t');
    if (h && titleIsPoolTab(title, id) && !exited(h, env) && closeHandle(h, env, cwd)) n += 1;
  }
  return n;
}

export async function main(argv, { env = process.env, cwd = process.cwd() } = {}) {
  const [sub, ...rest] = argv;
  const o = flags(rest);
  const out = (s) => process.stdout.write(`${s}\n`);
  if (sub === 'open') {
    const r = spawnSync(process.execPath, [join(HERE, 'spawn-lane.mjs'), '--name', o.name, '--kind', o.kind, '--worktree', o.cwd, '--no-record'],
      { env, cwd: o.cwd || cwd, encoding: 'utf8', windowsHide: true, timeout: 300000 });
    const m = (r.stdout || '').match(/^SPAWNED \S+ handle=(\S+)/m);
    if (m) { out(`TAB ${m[1]}`); return 0; }
    // 실패: spawn-lane 은 만든 탭을 닫지 않고 끝나는 경로가 있다(tui-idle·세션·화면 확인 실패). 시간 초과로 죽었으면 핸들도 모른다.
    const leaked = ((r.stdout || '').match(/^SPAWN_FAIL .*handle=(\S+)/m) || [])[1];
    if (leaked) closeHandle(leaked, env, cwd);
    if (o.id) closeById(o.id, env, cwd);
    const why = ((r.stdout || '').match(/^SPAWN_FAIL \S+ (.*)$/m) || [])[1] || (r.error ? `timeout ${r.error.code || ''}`.trim() : `rc=${r.status}`);
    out(`TAB_FAIL ${why}`);
    if (r.stderr) process.stderr.write(r.stderr);
    return 1;
  }
  const h = o._[0] || '';
  if (h === '') { process.stderr.write('handle 이 필요하다\n'); return 2; }
  if (sub === 'close-id') { out(`CLOSED_ID ${closeById(h, env, cwd)}`); return 0; }
  if (sub === 'send') {
    if (o.kind === 'glm') {
      const r = spawnSync(process.execPath, [join(HERE, 'term-send-safe.mjs'), '--handle', h, '--text', o.text, '--timeout-ms', '60000'],
        { env, cwd, encoding: 'utf8', windowsHide: true });
      const line = (r.stdout || '').split('\n')[0];
      if (line.startsWith('SENT')) { out('SENT'); return 0; }
      out(`SEND_FAIL ${line || `rc=${r.status}`}`);
      return 1;
    }
    const r = term('term_send', [h, o.text, '--enter'], env, cwd);
    const res = String(r.out || '').trim();
    if (['accepted', 'submitted', 'turn_started'].includes(res)) { out('SENT'); return 0; }
    out(`SEND_FAIL ${res || `rc=${r.rc}`}`);
    return 1;
  }
  if (sub === 'screen') {
    const r = term('term_read_screen', [h, '60'], env, cwd);
    if (r.rc === 3) return 3;
    process.stdout.write(r.out || '');
    return 0;
  }
  if (sub === 'idle') {
    out(String(term('term_wait_idle', [h, '1500'], env, cwd).out || '').trim() === 'satisfied' ? 'idle' : 'busy');
    return 0;
  }
  if (sub === 'close') {
    if (closeHandle(h, env, cwd)) { out('CLOSED'); return 0; }
    out('CLOSE_FAIL');
    return 1;
  }
  process.stderr.write('사용법: pool-tab.mjs open|send|screen|idle|close …\n');
  return 2;
}

if (isMain(import.meta.url)) scriptMain(main);
