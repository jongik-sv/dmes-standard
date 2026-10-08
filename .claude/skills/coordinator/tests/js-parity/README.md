# js-parity — bash 판과 mjs 판 대조 하니스

coordinator 의 bash lib/스크립트를 node(mjs)로 옮길 때, **같은 입력을 두 판에 넣어 stdout 바이트·종료 코드·남긴 파일·전역 변수**가 같은지 확인한다. 정답은 늘 bash 판이다(옮기는 중 bash 판이 틀려 보이면 고치지 말고 보고한다).

## 쓰는 법

```
node tests/js-parity/run.mjs <모듈> --all                 # 그 모듈의 모든 함수, 함수당 200건(시드 20261009)
node tests/js-parity/run.mjs <모듈> sc_key sc_store --cases 500 --seed 7
node tests/js-parity/run.mjs <모듈> --all --switch        # mjs 를 CLI 로 직접 부르는 대신 「스위치 켠 bash 함수」로 돌려 끔·켬을 대조
node tests/js-parity/run.mjs <모듈> <함수> --seed S --index N   # 차이 난 사례 하나만 재현
node --test tests/js-parity/                               # 모든 명세를 함수당 60건(JS_PARITY_SAMPLE 로 조절)
```
`<모듈>` = `tests/js-parity/specs/<모듈>.mjs` 의 이름. 차이가 있으면 종료 코드 1 이고, 재현 명령과 함께 최대 5건을 보여 준다. 사례 i 의 난수는 (시드, 모듈, 함수, i) 로만 정해지므로 병렬·재실행에서도 같다.

## 명세(specs/<모듈>.mjs) 형식

```js
import { gen } from '../gen.mjs';
export default {
  module: 'screen-cache',                         // = 파일 이름
  sh: 'scripts/lib/screen-cache.sh',              // coordinator 루트 기준. 하니스가 source 한다
  mjs: 'scripts/lib/screen-cache.mjs',            // CLI 로 부른다
  source: ['scripts/lib/compat.sh', 'scripts/lib/common.sh'],  // (선택) sh 앞에 먼저 source 할 파일
  switchEnv: 'COORD_JS_SCREEN_CACHE',             // 스위치 환경 변수(대조 때 sh 쪽은 0, --switch 의 js 쪽은 1)
  env: {},                                        // (선택) 모든 사례에 줄 환경 변수
  functions: {
    sc_key:   { js: ['sc_key'], gen: gen('handle'), compareFiles: false },
    sc_store: { js: ['sc_store'], globals: ['SC_STORED_KIND'], gen: (rng, i) => ({ args: [...], stdin: Buffer, files: { 'a.txt': 'x', 'home/.dflow/…': {data:'…', mode:0o600} }, env: {…} }) },
  },
};
```
- `gen(rng, i)` → 사례 `{args, stdin, files, env}`. `files` 는 사례마다 새로 만든 작업 폴더(상대 경로) 또는 `home/…`(= HOME)에 둘 파일이고 `{data, mode}` 도 된다. 하니스가 HOME·TMPDIR·작업 폴더를 사례마다 새 임시 폴더로 바꾸고 TZ=UTC 로 둔다.
- `js` 는 CLI 인자 앞머리(보통 `[함수 이름]`). 다르게 부르려면 `jsArgs(c)`, bash 쪽 인자를 바꾸려면 `shArgs(c)`.
- `globals` 는 함수가 설정해 호출자가 읽는 전역 변수 이름들(예: SC_STORED_KIND). 두 판 값이 같아야 한다.
- `compareFiles: false` 는 파일 상태 비교를 끈다(기본은 작업 폴더·HOME 아래 모든 파일의 종류·권한·크기·sha1 비교, mtime 은 안 봄).
- `normalize(buf, side, c)`(모듈 또는 함수 수준)로 시각·pid 같은 비결정 값을 지운다. 되도록 쓰지 말고, 시계는 환경 변수로 고정하게 설계한다.
- **자리표시자**: 환경 변수 값·인자 안의 `<WORK>`(사례 작업 폴더)·`<HOME>`·`<TMP>` 는 사례마다 실제 경로로 바뀐다. 외부 명령을 가짜로 바꿀 때: `files: {'bin/orca': {data: '#!/bin/sh\n…', mode: 0o755}}` + `env: {PATH: '<WORK>/bin:' + process.env.PATH}`.
- **스크립트 전체를 옮기는 모듈**(`kind: 'script'`): sh 는 source 대신 `bash <sh> 인자…`, mjs 는 `node <mjs> 인자…`(같은 인자). 함수 이름은 서브커맨드 따위를 구분하는 보고용 이름이고 `shArgs(c)` 로 인자를 만든다. 표본 `specs/sample-script.mjs`.
- 생성기(`gen.mjs`): `text`·`screen`·`prompt`(CRLF·한글·빈 입력·64KB 초과·깨진 UTF-8·비밀 값·ANSI 포함), `handle`, 조각 함수 `word`·`line`·`secret`·`textBuf`. 새 생성기는 gen.mjs 에 더하되 **기존 생성기의 난수 호출 순서를 바꾸지 않는다**(다른 모듈의 재현이 달라진다).
- 표본: `specs/sample.mjs` + `sample/` (bash 판·mjs 판·명세가 한 벌). 새 모듈의 틀로 쓴다.

## CLI 계약 (scripts/lib/js-cli.mjs)

옮긴 모듈 `scripts/lib/<모듈>.mjs` 는 **bash 함수 이름 그대로** 부르는 CLI 를 둔다.
```
node scripts/lib/<모듈>.mjs <bash 함수 이름> [인자…]      # stdin → stdout, 종료 코드 = 그 bash 함수의 종료 코드
```
- stdout 은 bash 함수가 낸 바이트 그대로(끝 줄바꿈 유무 포함). stderr 는 비교하지 않는다.
- 전역 변수로 값을 돌려주는 함수는 `run()` 이 `globals: {이름: 값}` 을 돌려주고, 틀이 `COORD_JS_GLOBALS_FILE` 에 `NAME=값\0` 형식으로 쓴다.
- 종료 코드 2(모르는 함수)·70(내부 오류)은 함수의 정상 종료 코드로 쓰지 않는다.
- 모듈 코드는 `export const functions = { 함수이름: { stdin?: true, run({args, stdin, env, cwd}) } }` + 끝에 `if (isMain(import.meta.url)) cliMain(functions);`. 다른 모듈이 import 해 부를 수 있도록 **순수 로직은 별도 export 함수**로 두고 `functions` 표는 얇은 어댑터로 만든다. 시계·환경·작업 폴더는 인자로 받는다(전역을 직접 읽지 않는다).
- 입출력은 바이트 단위로 다루고(`Buffer`), 문자열이 필요하면 UTF-8 로 해석한다. 윈도우 경로는 `node:path`, 줄끝 변환 금지(CRLF 그대로).

스크립트 전체를 옮긴 모듈은 `export async function main(argv, {env, cwd})`(종료 코드를 돌려줌) + 끝에 `if (isMain(import.meta.url)) scriptMain(main);`. stdout·stderr 는 `process.stdout/stderr` 에 직접 써도 된다. 표본 `sample/sample-script.mjs`.

## 스위치 계약 (scripts/lib/js-bridge.sh)

각 bash lib 는 맨 앞에서 `. "<lib 폴더>/js-bridge.sh"` 를 source 하고, 옮긴 함수마다 **첫 줄에만** 분기를 더한다(기존 본문은 한 글자도 바꾸지 않는다).
```bash
sc_key()   { if _jsb_on SCREEN_CACHE; then _jsb_call screen-cache sc_key "$@"; return; fi; …기존 본문… }
sc_store() { if _jsb_on SCREEN_CACHE; then _jsb_callg screen-cache sc_store "SC_STORED_KIND" "$@"; return; fi; … }
```
- 스크립트 전체를 옮긴 경우는 스크립트 맨 위에 `. "$LIB/js-bridge.sh"; if _jsb_on COORD_STATE; then _jsb_exec coord-state "$@"; fi` 한 줄(프로세스를 node 로 바꿔 exec, 인자·stdin·stdout 그대로). 표본 `sample/sample-script.sh`.
- 스위치 이름 `COORD_JS_<모듈 대문자, 하이픈은 밑줄>` (예: COORD_JS_SCREEN_CACHE). 기본(없음·0)은 bash 본문. `=1` 이고 node 가 있으면 node 판.
- 켜짐에서 node 판이 실패(종료 코드 70)하면 bash 본문으로 되돌아가지 않고 그 코드로 실패한다. node 는 source 시점의 절대 경로로 고정한다.
- 한계: 전역 변수는 문자열만, NUL 바이트는 못 옮긴다. 호출마다 node 기동 비용(약 40ms)이 든다 — 켜짐은 시험·확인용이고, 상주 폴러(W2)는 모듈을 import 한다.
- 서브셸 안에서 부른 함수가 바꾼 전역 변수는 호출자에게 안 보이는 것이 bash 판과 같다. `_jsb_callg` 는 부른 셸에 전역을 넣으므로 같은 조건(`$(…)` 밖에서 호출)에서만 의미가 같다.

## 머지 게이트(모듈 하나당)

1. `node tests/js-parity/run.mjs <모듈> --all --cases 500` 차이 0
2. `node tests/js-parity/run.mjs <모듈> --all --cases 200 --switch` 차이 0
3. 그 모듈을 쓰는 기존 bash 시험을 **스위치 끔·켬 각각** 돌려 통과 수가 같다(실패 0 이면서 끔·켬 건수 동일). 부하로 흔들리는 시험은 단독 재실행으로 확인한다.
4. 윈도우 영향 한 줄(미실측이면 그렇게), 옮기며 본 bash 판 의심 목록.
