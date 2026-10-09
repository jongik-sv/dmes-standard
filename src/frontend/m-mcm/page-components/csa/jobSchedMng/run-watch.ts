/**
 * 「지금 실행」 뒤 재조회 — 실행 요청은 접수만 기다리고 돌아오므로(실행 이력에는 RUN 으로 남는다) 요청 직후 한 번 조회해서는
 * 끝난 결과가 목록·이력에 올라오지 않는다. 실행이 끝날 때까지 상한 있는 횟수만 다시 조회한다(합계 약 33초).
 * 화면(React)과 떼어 두어 시간·조회를 주입해 시험한다.
 */

/** 재조회 사이의 대기(ms) — 짧은 작업은 첫 번째로 끝나고, 긴 작업도 합계가 상한을 넘지 않는다. */
export const RUN_WATCH_DELAYS_MS: readonly number[] = [2000, 3000, 5000, 5000, 8000, 10000];

/** 실행 중으로 보는 최근 결과 상태. */
export const RUN_STATUS_RUNNING = "RUN";

export interface RunWatchOptions {
  delaysMs?: readonly number[];
  sleep: (ms: number) => Promise<void>;
  /** 목록·이력을 다시 조회하고, 아직 실행 중이면 true. */
  poll: () => Promise<boolean>;
  /** 화면이 닫혔거나 새 감시가 시작됐으면 false — 그러면 더 조회하지 않는다. */
  isActive: () => boolean;
}

/** 실행이 끝났거나 상한에 닿거나 조회가 실패하면 끝난다. 실제로 조회한 횟수를 돌려준다. */
export async function watchRunUntilDone(opts: RunWatchOptions): Promise<number> {
  const delays = opts.delaysMs ?? RUN_WATCH_DELAYS_MS;
  let polls = 0;
  for (const ms of delays) {
    if (!opts.isActive()) return polls;
    await opts.sleep(ms);
    if (!opts.isActive()) return polls;
    polls++;
    let running: boolean;
    try {
      running = await opts.poll();
    } catch {
      return polls; // 재조회 실패는 알리지 않는다 — 사용자가 조회 단추로 다시 받을 수 있다.
    }
    if (!running) return polls;
  }
  return polls;
}
