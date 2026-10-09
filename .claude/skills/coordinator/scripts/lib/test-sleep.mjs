// W3-b 세 스크립트(term-send-safe·auto-answer·spawn-lane)가 쓰는 「초 단위 대기」와 그 시험 훅.
// 대기는 화면이 안정됐는지·창이 사라졌는지 보는 안전장치라 운영에서는 늘 bash 판과 같은 시간을 기다린다. 대조 하니스만 시간을 줄이려고 훅을 둔다.
//   · 훅은 환경 변수 COORD_JS_TEST=1 이 함께 있을 때만 읽는다(하니스가 COORD_JS_NOW_MS 를 넣듯 시험만 넣는 값).
//   · COORD_JS_SLEEP_SCALE 은 0~1 사이 숫자만 받는다. 그 밖·빈 값·숫자 아님은 1(= 줄이지 않음). bash 판에는 이 훅이 없다.
//   · COORD_JS_SLEEP_LOG 가 있으면(시험 때만) 요청한 대기를 `sleep <초>` 한 줄로 그 파일에 덧붙인다. bash 판 쪽은 PATH 앞 가짜 `sleep` 이 같은 줄을 남겨
//     대기 횟수·순서가 같음을 비교한다(건너뛴 대기가 판정을 바꾸지 않음을 보이는 근거).
import { appendFileSync } from 'node:fs';

const sleepMs = (ms) => { if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

/** 시험 훅 배율. 시험 표식이 없거나 값이 0~1 숫자가 아니면 1 */
export function sleepScale(env) {
  if (env.COORD_JS_TEST !== '1') return 1;
  const v = env.COORD_JS_SLEEP_SCALE;
  if (typeof v !== 'string' || !/^(?:0(?:\.[0-9]+)?|1(?:\.0+)?)$/.test(v)) return 1;
  return Number(v);
}

/** `sleep <초>` 대신 쓰는 동기 대기. env 는 호출 맥락의 환경 변수 */
export function sleepSec(env, sec) {
  const scale = sleepScale(env);
  if (env.COORD_JS_TEST === '1' && env.COORD_JS_SLEEP_LOG) {
    try { appendFileSync(env.COORD_JS_SLEEP_LOG, `sleep ${sec}\n`); } catch { /* 기록 실패는 무시 */ }
  }
  sleepMs(sec * 1000 * scale);
}
