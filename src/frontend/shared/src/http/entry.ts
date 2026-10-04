/**
 * `@dk-oasis/shared/http` 진입점 — 기존 http 모듈(./index) 전부와 OASIS 호출 공통 계약(./oasis-call)을 함께 내보낸다.
 *
 * 진입점을 ./index 가 아닌 이 파일로 둔 까닭: shared 루트 `src/index.ts` 가 `export * from "./http"`(= ./http/index)로
 * http 를 통째로 다시 내보낸다. ./index 에서 oasis-call 을 내보내면 tsup `splitting:false` 에서 루트 번들(dist/index.js)에도
 * `OasisCallError` 사본이 생겨 `instanceof` 가 갈라진다. 이 파일은 tsup·package.json exports 의 `./http` 만 가리키므로
 * 클래스는 dist/http.js 한 곳에만 있다(tests/unit/http-oasis-call-bundle.unit.test.ts 가 지킨다).
 * 루트 index 가 http 를 이름으로 골라 내보내게 되면 이 두 줄을 ./index 끝으로 옮기고 이 파일을 거둘 수 있다.
 */
export * from "./index";
export * from "./oasis-call";
