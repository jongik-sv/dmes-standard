// 스크립트 전체를 옮기는 모듈의 명세 틀: kind 'script' 이면 sh 는 `bash <sh> 인자…`, mjs 는 `node <mjs> 인자…` 로 같은 인자를 받는다.
export default {
  module: 'sample-script',
  kind: 'script',
  sh: 'tests/js-parity/sample/sample-script.sh',
  mjs: 'tests/js-parity/sample/sample-script.mjs',
  switchEnv: 'COORD_JS_SAMPLE_SCRIPT',
  functions: {
    run: { gen: (rng) => ({ args: Array.from({ length: rng.int(0, 7) }, () => rng.pick(['a', '', '한글', 'x y', '--flag', '<WORK>/f'])), stdin: '' }) },
  },
};
