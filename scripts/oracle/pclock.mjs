// PC 전체 Oracle 잠금 — pdb.mjs 와(앞으로) heavy 이식판이 같은 잠금을 쓰도록 한 곳에 둔다.
// 잠금 = <임시 폴더>/dmes-ora-pdb.lock 폴더(mkdir 은 원자적이다, Windows 도 같다). 안의 owner 파일 = "<주인 pid> <cwd>".
// 주인 프로세스가 죽었거나 30분 넘게 갱신되지 않은 잠금은 stale 로 보고 치운다. 오래 쥐는 쪽은 1분마다 폴더 mtime 을 갱신한다(touchLock).
// 시험 하니스(Gradle)·heavy 가 전 구간 잠금을 쥐고 그 아래에서 부르는 명령에 DMES_ORA_LOCK_HELD=<잠금 주인 pid> 를 넘긴다(lockHeldByParent).
import { mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const LOCK_DIR = join(tmpdir(), 'dmes-ora-pdb.lock');
const STALE_MS = 30 * 60 * 1000;

let owned = false;

/** 기다림 한도를 넘겼다. 호출자(pdb.mjs)가 die 로 바꾼다. */
export class LockTimeoutError extends Error {
  constructor() {
    super(`다른 PDB 작업이 끝나지 않는다(잠금 ${LOCK_DIR})`);
    this.name = 'LockTimeoutError';
  }
}

/** 이 프로세스가 잠금을 쥐고 있는가. */
export const ownsLock = () => owned;

/** 잠금 owner 파일의 주인 pid. 잠금이 없거나 읽을 수 없으면 0. */
export function ownerPid() {
  try {
    return Number(readFileSync(join(LOCK_DIR, 'owner'), 'utf8').split(' ')[0]) || 0;
  } catch { return 0; }
}

/**
 * 상위(Gradle·heavy)가 잠금을 쥐고 있고 그 주인 pid 가 DMES_ORA_LOCK_HELD 와 같으며 살아 있을 때만 true —
 * 이때는 잠금을 다시 잡지 않는다.
 */
export function lockHeldByParent() {
  const held = Number(process.env.DMES_ORA_LOCK_HELD || 0);
  if (!held) return false;
  try {
    if (ownerPid() !== held) return false;
    process.kill(held, 0);
    return true;
  } catch { return false; }
}

/** 지금 잠금이 stale 인가(주인이 죽었거나 30분 넘게 갱신 없음). mkdir 직후 owner 를 쓰기 전 찰나는 10초까지 기다려 준다. */
function isStale() {
  try {
    const age = Date.now() - statSync(LOCK_DIR).mtimeMs;
    const pid = Number(readFileSync(join(LOCK_DIR, 'owner'), 'utf8').split(' ')[0]);
    let alive = true;
    try { process.kill(pid, 0); } catch { alive = false; }
    return !alive || age > STALE_MS;
  } catch {
    try { return Date.now() - statSync(LOCK_DIR).mtimeMs > 10 * 1000; } catch { return true; }
  }
}

/**
 * 기다리지 않고 한 번 시도한다. 잡았으면 true. 쥐고 있는 주인이 stale 이면 치우고 다시 시도한다.
 * heavy 가 「자리와 잠금을 함께, 하나도 쥔 채 기다리지 않고」 잡을 때 쓴다.
 */
export function tryAcquireLock() {
  for (;;) {
    try {
      mkdirSync(LOCK_DIR);
      owned = true;
      writeFileSync(join(LOCK_DIR, 'owner'), `${process.pid} ${process.cwd()}\n`);
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (!isStale()) return false;
      rmSync(LOCK_DIR, { recursive: true, force: true });
    }
  }
}

/** 잠금을 잡고 owner 를 적는다. 이미 누가 쥐고 있으면 waitSec 까지 기다린다(1.5초 폴링, 순서 보장 없음). 넘기면 LockTimeoutError. */
export async function acquireLock(waitSec) {
  const deadline = Date.now() + waitSec * 1000;
  for (;;) {
    if (tryAcquireLock()) return;
    if (Date.now() > deadline) throw new LockTimeoutError();
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/** 잠금 폴더 시각을 갱신해 30분 넘은 잠금으로 오인돼 치워지지 않게 한다. 오래 쥐는 쪽이 1분마다 부른다. */
export function touchLock() {
  try { utimesSync(LOCK_DIR, new Date(), new Date()); } catch { /* 무시 */ }
}

export function releaseLock() {
  owned = false;
  rmSync(LOCK_DIR, { recursive: true, force: true });
}

/** 신호 처리용 — 이 프로세스가 쥔 잠금만 푼다. */
export function releaseIfOwned() {
  if (owned) { try { rmSync(LOCK_DIR, { recursive: true, force: true }); } catch { /* 무시 */ } }
}
