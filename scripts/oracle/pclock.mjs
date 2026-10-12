// PC 전체 Oracle 잠금 — pdb.mjs·heavy.mjs(--oracle)·Gradle 시험 하니스가 같은 잠금을 쓰도록 한 곳에 둔다.
//
// 잠금은 두 가지다(2026-10-12 잠금 세분화, docs/reports/2026-10-12-oracle-test-seats-trial.md).
//   ① CDB 잠금(mutex) = <임시 폴더>/dmes-ora-pdb.lock. PDB 를 만들고·복제하고·열고·지우는 CDB 단위 작업(pdb.mjs withLock)이 잠깐 쥔다.
//   ② 시험 자리(seat) = <임시 폴더>/dmes-ora-seat-<i>.lock (i = 1..DMES_ORA_TEST_SEATS, 기본 2). Oracle 시험 빌드 하나가
//      복제→시험→삭제 동안 자리 하나를 쥐고, 복제·삭제 때만 CDB 잠금을 잠깐 잡는다. 자리 수 = 동시에 도는 Oracle 시험 빌드 수(1 = 옛 동작).
//   (기존 PDB 모드는 자리에 더해 PDB 별 사용 잠금 <임시 폴더>/dmes-ora-use-<PDB>.lock 을 쥔다 — 같은 PDB 를 두 빌드가 함께 비우지 않게.)
// 잡는 순서는 늘 자리 → (사용 잠금) → CDB 잠금이다. CDB 잠금을 쥔 채 자리를 기다리는 일은 없다(CDB 잠금은 짧게만 쥔다).
//
// 모든 잠금은 mkdir 폴더다(원자적, Windows 도 같다). 안의 owner 파일 = "<주인 pid> <cwd>".
// 주인 프로세스가 죽었거나 30분 넘게 갱신되지 않은 잠금은 stale 로 보고 치운다. 오래 쥐는 쪽은 1분마다 폴더 mtime 을 갱신한다(touch).
// 상위가 쥔 잠금을 아래 명령에 알리는 환경 변수:
//   DMES_ORA_LOCK_HELD=<CDB 잠금 주인 pid>  아래 pdb.mjs 는 CDB 잠금을 다시 잡지 않는다(lockHeldByParent). 옛 하니스·heavy 와의 호환용.
//   DMES_ORA_SEAT_HELD=<자리 주인 pid>      아래 하니스는 자리를 다시 잡지 않고 그 자리를 쓴다(seatHeldByParent). CDB 잠금은 따로 잡는다.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TMP = tmpdir();
export const LOCK_DIR = join(TMP, 'dmes-ora-pdb.lock');
const STALE_MS = 30 * 60 * 1000;

/** 시험 자리 수(DMES_ORA_TEST_SEATS, 기본 2, 최소 1). 같은 PC 의 모든 호출이 같은 값을 써야 상한이 맞다. */
export function seatCount() {
  const n = Math.floor(Number(process.env.DMES_ORA_TEST_SEATS ?? 2));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}
export const seatDir = (i) => join(TMP, `dmes-ora-seat-${i}.lock`);
export const useDir = (pdb) => join(TMP, `dmes-ora-use-${String(pdb).toUpperCase()}.lock`);

// 이 프로세스가 쥔 잠금 폴더들
const owned = new Set();

// ── 폴더 잠금 공통 ───────────────────────────────────────────────────
function readOwner(dir) {
  try {
    const [pid = '', ...rest] = readFileSync(join(dir, 'owner'), 'utf8').trim().split(' ');
    return { pid: Number(pid) || 0, cwd: rest.join(' ') };
  } catch { return null; }
}
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/** 그 잠금이 stale 인가(주인이 죽었거나 30분 넘게 갱신 없음). mkdir 직후 owner 를 쓰기 전 찰나는 10초까지 기다려 준다. */
function isStaleDir(dir) {
  let age;
  try { age = Date.now() - statSync(dir).mtimeMs; } catch { return true; }
  const o = readOwner(dir);
  if (!o || !o.pid) return age > 10 * 1000;
  return !alive(o.pid) || age > STALE_MS;
}

/** 기다리지 않고 한 번 시도한다. 잡았으면 true. 주인이 stale 이면 치우고 다시 시도한다. */
export function tryAcquireDir(dir) {
  for (;;) {
    try {
      mkdirSync(dir);
      owned.add(dir);
      writeFileSync(join(dir, 'owner'), `${process.pid} ${process.cwd()}\n`);
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (!isStaleDir(dir)) return false;
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
export function touchDir(dir) {
  try { utimesSync(dir, new Date(), new Date()); } catch { /* 무시 */ }
}
export function releaseDir(dir) {
  owned.delete(dir);
  rmSync(dir, { recursive: true, force: true });
}
/** 그 폴더의 살아 있는 주인({pid, cwd}). 비었거나 stale 이면 null. */
export function liveOwner(dir) {
  if (isStaleDir(dir)) return null;
  return readOwner(dir);
}

/** 기다림 한도를 넘겼다. 호출자(pdb.mjs)가 die 로 바꾼다. */
export class LockTimeoutError extends Error {
  constructor(what = `다른 PDB 작업이 끝나지 않는다(잠금 ${LOCK_DIR})`) {
    super(what);
    this.name = 'LockTimeoutError';
  }
}

async function waitFor(tryFn, waitSec, what) {
  const deadline = Date.now() + waitSec * 1000;
  for (;;) {
    const r = tryFn();
    if (r) return r;
    if (Date.now() > deadline) throw new LockTimeoutError(what());
    await new Promise((res) => setTimeout(res, 1500));
  }
}

// ── ① CDB 잠금(mutex) ────────────────────────────────────────────────
/** 이 프로세스가 CDB 잠금을 쥐고 있는가. */
export const ownsLock = () => owned.has(LOCK_DIR);

/** CDB 잠금 owner 파일의 주인 pid. 잠금이 없거나 읽을 수 없으면 0. */
export function ownerPid() {
  return readOwner(LOCK_DIR)?.pid ?? 0;
}

/**
 * 상위(옛 하니스·heavy·e2e)가 CDB 잠금을 쥐고 있고 그 주인 pid 가 DMES_ORA_LOCK_HELD 와 같으며 살아 있을 때만 true —
 * 이때는 잠금을 다시 잡지 않는다. 상위가 쥔 것이 시험 자리(DMES_ORA_SEAT_HELD)뿐이면 false 다(자리는 CDB 잠금을 대신하지 않는다).
 */
export function lockHeldByParent() {
  const held = Number(process.env.DMES_ORA_LOCK_HELD || 0);
  if (!held) return false;
  return ownerPid() === held && alive(held);
}

/** CDB 잠금을 기다리지 않고 한 번 시도한다. */
export const tryAcquireLock = () => tryAcquireDir(LOCK_DIR);

/** CDB 잠금을 잡는다. 이미 누가 쥐고 있으면 waitSec 까지 기다린다(1.5초 폴링, 순서 보장 없음). 넘기면 LockTimeoutError. */
export async function acquireLock(waitSec) {
  await waitFor(tryAcquireLock, waitSec, () => `다른 PDB 작업이 끝나지 않는다(잠금 ${LOCK_DIR})`);
}

/** 잠금 폴더 시각을 갱신해 30분 넘은 잠금으로 오인돼 치워지지 않게 한다. 오래 쥐는 쪽이 1분마다 부른다. */
export const touchLock = () => touchDir(LOCK_DIR);
export const releaseLock = () => releaseDir(LOCK_DIR);

/** 신호 처리용 — 이 프로세스가 쥔 잠금(CDB 잠금·자리·사용 잠금)만 푼다. */
export function releaseIfOwned() {
  for (const d of [...owned]) { try { releaseDir(d); } catch { /* 무시 */ } }
}

// ── ② 시험 자리(seat) ────────────────────────────────────────────────
/** 빈 자리 하나를 기다리지 않고 잡는다. 잡은 자리 번호(1..N), 못 잡으면 0. */
export function tryAcquireSeat() {
  for (let i = 1; i <= seatCount(); i++) if (tryAcquireDir(seatDir(i))) return i;
  return 0;
}
/** 자리를 잡는다. 다 차 있으면 waitSec 까지 기다린다. 잡은 자리 번호를 돌려준다. */
export async function acquireSeat(waitSec) {
  return waitFor(tryAcquireSeat, waitSec, () => `Oracle 시험 자리 ${seatCount()}개가 모두 차 있다(${seatOwners().map((o) => `seat-${o.seat} pid=${o.pid}`).join(', ')})`);
}
export const touchSeat = (i) => touchDir(seatDir(i));
export const releaseSeat = (i) => releaseDir(seatDir(i));
export const ownsSeat = (i) => owned.has(seatDir(i));

/** 지금 있는 자리 폴더(번호가 seatCount 보다 큰 것 포함)의 살아 있는 주인 목록 [{seat, pid, cwd}]. */
export function seatOwners() {
  let names = [];
  try { names = readdirSync(TMP); } catch { /* 없음 */ }
  const out = [];
  for (const n of names) {
    const m = /^dmes-ora-seat-(\d+)\.lock$/.exec(n);
    if (!m) continue;
    const o = liveOwner(join(TMP, n));
    if (o) out.push({ seat: Number(m[1]), ...o });
  }
  return out.sort((a, b) => a.seat - b.seat);
}

/** 자리 1..N 이 모두 살아 있는 남에게 잡혀 있으면 그 주인 목록, 하나라도 비었거나 stale 이면 null. heavy 가 헛걸음을 피하려고 쓴다. */
export function seatsBusy() {
  const list = [];
  for (let i = 1; i <= seatCount(); i++) {
    const o = liveOwner(seatDir(i));
    if (!o || o.pid === process.pid) return null;
    list.push({ seat: i, ...o });
  }
  return list;
}

/** 상위가 DMES_ORA_SEAT_HELD=<pid> 로 알린 자리가 지금도 그 pid 의 것이면 자리 번호, 아니면 0. */
export function seatHeldByParent() {
  const held = Number(process.env.DMES_ORA_SEAT_HELD || 0);
  if (!held || !alive(held)) return 0;
  return seatOwners().find((o) => o.pid === held)?.seat ?? 0;
}

// ── 기존 PDB 모드의 PDB 별 사용 잠금 ──────────────────────────────────
export const tryAcquireUse = (pdb) => tryAcquireDir(useDir(pdb));
export async function acquireUse(pdb, waitSec) {
  await waitFor(() => tryAcquireUse(pdb), waitSec, () => `다른 시험 빌드가 ${pdb} 를 쓰고 있다(잠금 ${useDir(pdb)})`);
}
