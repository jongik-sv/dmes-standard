// 시험 공용: 코디네이터 스킬 루트 경로와 시드 고정 난수(옛 대조 하니스 js-parity/lib.mjs 에서 이 두 가지만 옮겼다).
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const COORD_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');   // .claude/skills/coordinator

// ---------- 시드 고정 난수 ----------
// 사례 i 의 난수는 (시드, i) 만으로 정해진다 — 병렬 실행·재실행(--index)에서도 같은 사례가 나온다.
export function makeRng(seed, index = 0) {
  let x = (createHash('sha1').update(`${seed}:${index}`).digest().readUInt32LE(0) >>> 0) || 1;
  const next = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  return {
    next,
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),            // a..b 포함
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}
