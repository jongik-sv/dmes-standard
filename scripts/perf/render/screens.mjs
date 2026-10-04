/**
 * 1차 스캔 대상 화면 정의 — `measure-screens.mjs` 가 읽는다.
 *
 * ★이 파일은 "무엇을 잴지"만 적는다. 수치·환경 의존 값(계정·포트·저장 위치)은
 *   `measure-screens.mjs` 쪽 환경 변수로 받는다. 여기 PC 고유 경로를 박지 않는다.
 *
 * 메뉴 경로·breadcrumb 문구는 e2e 스펙이 이미 쓰던 것을 그대로 가져왔다
 * (`src/frontend/e2e/mdm-{termMng,columnMng,layoutConfirm,dataMng,codeMng}.spec.ts`).
 * 메뉴 이름이 바뀌면 e2e 도 같이 깨지므로, 이 두 곳은 한 쌍으로 관리한다.
 *
 * 화면 준비 신호 두 개를 구분한다:
 *   - `shell`: 메뉴 잎을 누른 뒤 **화면 틀**이 섰는 순간. 조회를 누르기 전에도 측정된다.
 *   - `firstRow`: 조회 응답이 온 뒤 **그리드 첫 행**이 그려진 순간.
 * MDM 목록 화면은 처음 열 때 목록을 자동 조회하지 않는다(의도된 제품 변경, cf4fbb05 2026-10-02).
 * 그래서 "메뉴 클릭 → 첫 행" 을 하나로 재면 조회 버튼 대기 시간이 섞인다. 두 구간을 따로 잰다.
 */

/** breadcrumb 을 잡을 CSS 선택자 — 화면이_mounted_ 되었는지 판정한다. */
export const SHELL_SELECTOR = ".page-layout__footer-breadcrumb";

/** ag-grid 첫 행 — 머리글 행이 아니라 데이터 행만. */
export const FIRST_ROW_SELECTOR = ".ag-center-cols-container .ag-row[row-id]";

/**
 * 조회 버튼. MDM 목록 화면 공통. 조회가 필요 없는 화면은 `needsSearch: false`.
 */
export const SEARCH_BUTTON = { role: "button", name: "조회", exact: true };

export const SCREENS = [
  {
    id: "termMng",
    label: "용어 관리",
    /** 우선순위 1 */
    trail: [/^마루 MDM$/, /^용어·도메인$/, /^용어 관리$/],
    breadcrumb: "마루 MDM > 용어·도메인 > 용어 관리",
    /** 조회 응답 대기용 — 이 URL 패턴이 아닌 다른 API 는 집계에서 뺀다. */
    searchUrlPattern: /\/api\/mdm\/oasis\/termMng\/search/,
    /**
     * 진입 시 optionsOnly 로 목록을 한 번 더 불러온다(진입 콤보 값용).
     * 그 응답을 "조회"로 잘못 세지 않도록 body 까지 본다.
     */
    searchUrlExclude: /optionsOnly/,
    needsSearch: true,
  },
  {
    id: "columnMng",
    label: "컬럼 사전(컬럼 관리)",
    /** 우선순위 2 */
    trail: [/^마루 MDM$/, /^용어·도메인$/, /^컬럼 사전$/],
    breadcrumb: "마루 MDM > 용어·도메인 > 컬럼 사전",
    searchUrlPattern: /\/api\/mdm\/oasis\/columnMng\/(columnMng\/search|search)/,
    searchUrlExclude: /optionsOnly/,
    needsSearch: true,
  },
  {
    id: "layoutConfirm",
    label: "전문 헤더 정의(레이아웃 확정)",
    /** 우선순위 3 */
    trail: [/^마루 MDM$/, /^레이아웃$/, /^전문 헤더 정의$/],
    breadcrumb: "마루 MDM > 레이아웃 > 전문 헤더 정의",
    searchUrlPattern: /\/api\/mdm\/oasis\/layoutConfirm\/search/,
    searchUrlExclude: /optionsOnly/,
    needsSearch: true,
  },
  {
    id: "dataMng",
    label: "마루 데이터(데이터 관리)",
    /** 우선순위 4 */
    trail: [/^마루 MDM$/, /^마스터데이터$/, /^마루 데이터$/],
    breadcrumb: "마루 MDM > 마스터데이터 > 마루 데이터",
    searchUrlPattern: /\/api\/mdm\/oasis\/dataMng\/search/,
    searchUrlExclude: /optionsOnly/,
    needsSearch: true,
  },
  {
    id: "codeMng",
    label: "마루 코드(코드 관리)",
    /** 우선순위 5 */
    trail: [/^마루 MDM$/, /^마스터코드$/, /^마루 코드$/],
    breadcrumb: "마루 MDM > 마스터코드 > 마루 코드",
    searchUrlPattern: /\/api\/mdm\/oasis\/codeMng\/(codeMng\/search|search)/,
    searchUrlExclude: /optionsOnly/,
    needsSearch: true,
  },
];

/** id 로 화면 정의를 찾는다. 없으면 undefined. */
export function screenById(id) {
  return SCREENS.find((s) => s.id === id);
}
