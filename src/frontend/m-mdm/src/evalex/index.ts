/**
 * `@dk-oasis/m-mdm/evalex` — 화면 EvalEx 평가기·겹침 빈틈 분석·입력 계약(TSK-03-04).
 *
 * 구현은 2026-10-03 `@dk-oasis/shared/evalex` 로 옮겼다(화면 검증이 shared 에서 표준식을 평가해야 해서 — shared 가 m-mdm 을
 * 가져오면 순환). 여기는 기존 import 경로(`@/evalex`·`@dk-oasis/m-mdm/evalex`)를 지키려고 다시 내보낸다.
 * 루트 배럴(`src/index.ts`)은 타입 전용으로 두고 이 모듈은 서브패스로만 공개한다(decimal.js 를 루트 번들에 끌어들이지 않는다, D7).
 */
export * from "@dk-oasis/shared/evalex";
