// 시험 전용: 하위 프로세스 실행에 시간 제한(기본 120초)을 건다. 공용 proc.mjs 의 runCommand·runNode 는 opts.timeout 을 spawnSync 로
// 넘기므로 그대로 감싸기만 한다. 시간이 지나면 자식이 죽고(SIGTERM) 이 도우미가 분명한 메시지로 예외를 던져 시험이 실패한다
// (끝없이 멈추는 대신). `_shared/node/*` 는 다른 레인과 공유하므로 고치지 않는다.

import { runCommand as rawCommand, runNode as rawNode } from '../../_shared/node/proc.mjs';

export const TEST_TIMEOUT_MS = 120000;

function label(cmd, args) {
  const shown = [cmd, ...args].map(String).map((a) => (a.length > 60 ? `...${a.slice(-57)}` : a));
  return shown.slice(0, 5).join(' ') + (args.length + 1 > 5 ? ' ...' : '');
}

function guard(r, cmd, args, ms) {
  if (r.error && /ETIMEDOUT/.test(r.error)) {
    throw new Error(`[시간 초과] 자식 프로세스가 ${ms}ms 안에 끝나지 않아 강제 종료했다: ${label(cmd, args)}`);
  }
  return r;
}

/** runCommand(proc.mjs)에 timeout(기본 TEST_TIMEOUT_MS)을 건다. 시간 초과면 Error 를 던진다. */
export function runCommand(cmd, args = [], opts = {}) {
  const timeout = opts.timeout ?? TEST_TIMEOUT_MS;
  return guard(rawCommand(cmd, args, { ...opts, timeout }), cmd, args, timeout);
}

/** runNode(proc.mjs)에 timeout(기본 TEST_TIMEOUT_MS)을 건다. 시간 초과면 Error 를 던진다. */
export function runNode(scriptPath, args = [], opts = {}) {
  const timeout = opts.timeout ?? TEST_TIMEOUT_MS;
  return guard(rawNode(scriptPath, args, { ...opts, timeout }), scriptPath, args, timeout);
}
