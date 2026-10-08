// 표본 모듈 명세 — 하니스·js-bridge 가 제대로 도는지 보는 자체 시험이자 새 명세의 틀.
import { gen } from '../gen.mjs';

export default {
  module: 'sample',
  sh: 'tests/js-parity/sample/sample.sh',
  mjs: 'tests/js-parity/sample/sample.mjs',
  switchEnv: 'COORD_JS_SAMPLE',
  functions: {
    // 표본의 bash 본문은 $(…) 를 쓰므로 NUL 이 든 입력은 제외한다(하니스가 NUL 차이를 잡아낸 것을 확인함)
    smp_upper: { js: ['smp_upper'], gen: (rng, i) => { const c = gen('text')(rng, i); c.stdin = Buffer.from(c.stdin.filter((b) => b !== 0)); return c; } },
    smp_pair: { js: ['smp_pair'], globals: ['SMP_A', 'SMP_B'], gen: (rng) => ({ args: [rng.pick(['', 'a', '한글', 'x y', 'ab\ncd']), rng.pick(['', 'zz', '값', "it's"])], stdin: '' }) },
    smp_write: { js: ['smp_write'], gen: (rng) => ({ args: [rng.pick(['', 'a', 'dir/x', 'n1', '한']), ], stdin: '' }) },
  },
};
