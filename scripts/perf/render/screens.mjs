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

/**
 * ★모든 그리드 셀렉터는 이 접두로 감싼다★
 *
 * 포털은 **숨겨진 탭을 마운트된 채 둔다**(`portal-shell.tsx:154` — `display: none` 으로 숨김만).
 * 그래서 문서 전체를 보면 **몇 개 화면의 그리드가 한꺼번에 조회된다.** 측정 중 실제로
 * 용어 관리 화면을 열었는데 `.ag-row[row-id]` 가 11개, 다른 숨겨진 탭 것까지 합쳐 28개가 잡혔다.
 * `.first()` 는 그중 **숨겨진 탭의 행을 고를 수 있다** → `isVisible()` 가 false 가 되고,
 * "조회 후 첫 행이 안 보인다" 는 잘못된 결론이 났다(첫 실행에서 15건이 이 못했다).
 *
 * `:visible` 은 포털 탭뿐 아니라 **탭 안의 모든 그리드에 적용**되므로, 숨겨진 탭은 자연히 걸러진다.
 */
export const VISIBLE_GRID = '.portal-shell__tab-page:visible ';

/**
 * ★측정 대상은 "메인 목록 그리드 하나"다★ 화면 안에 그리드가 여럿 있다
 * (termMng 은 목록 + 유사어 추천, codeMng 은 목록 + 버전, dataMng 은 목록 + 카테고리).
 * `:visible` 만으로는 충분하지 않다 — **같은 화면 안의 다른 그리드가 항상 비어 있으면**
 * 그 빈 상태가 "조회 결과 0건"으로 잡힌다(2026-10-04 첫 실행에서 termMng·columnMng 가 이 모순에 빠졌다).
 *
 * 목록 그리드의 특정 방법 두 가지:
 *   1. `listPanelTitle` 이 있으면 그 `GridPanel` 안으로 한정한다(선호).
 *      `GridPanel.tsx:222-252` — `.grid-panel > .grid-panel-header > .grid-panel-title > span` 이 제목,
 *      본문은 `.grid-panel-content` 다.
 *   2. 없으면 **화면 안에서 DOM 순서상 첫 번째 그리드**를 쓴다. 목록 그리드가 첫 번째다
 *      (termMng `page.tsx:307` 용어 목록이 `:397` 유사어 추천보다 앞선다 등).
 *      `layoutConfirm` 만 GridPanel 이 없다(`page.tsx:317`·`:392` 가 AgDataGrid 직접 사용).
 *      그 화면은 **조회 0건이면 그리드를 만들지 않는다**(`:313-330` 이 `<p/>` 로 갈음)라
 *      "그리드 없음"이 정상 상태일 수 있다 — 그래서 `listGridPresent` 는 예외가 아니라 경고다.
 *
 * @param {{listPanelTitle?: string}} screen
 * @returns {string} CSS 선택자 접두(그리드 루트까지)
 */
export function listGridRoot(screen) {
  const title = screen.listPanelTitle;
  if (title) {
    return `${VISIBLE_GRID}.grid-panel:has(.grid-panel-title:has-text("${title}")) .grid-panel-content .ag-root-wrapper`;
  }
  // ★GridPanel 이 없는 화면이거나 패널 제목이 화면과 맞지 않을 때★ — 보이는 탭 안의 그리드를
  //   전부 후보로 두고 **첫 행이 실제로 보이는 것**을 하네스가 고르게 한다
  //   (`:visible` 이 붙으므로 숨겨진 탭은 걸러진다).
  return `${VISIBLE_GRID}.ag-root-wrapper`;
}

/** 목록 그리드의 데이터 행 — 머리글 행이 아니라 실제 행만. */
export function firstRowSelector(screen) {
  return `${listGridRoot(screen)} .ag-center-cols-container .ag-row[row-id]`;
}

/** 목록 그리드의 "행 없음" 오버레이. */
export function emptyOverlaySelector(screen) {
  return `${listGridRoot(screen)} .ag-overlay-no-rows-wrapper`;
}

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
    listPanelTitle: "용어 목록",
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
    listPanelTitle: "컬럼 목록",
    searchUrlPattern: /\/api\/mdm\/oasis\/columnMng\/(columnMng\/search|search)/,
    searchUrlExclude: /optionsOnly/,
    needsSearch: true,
  },
  {
    id: "layoutConfirm",
    label: "레이아웃 확정",
    /** 우선순위 3 */
    // ★정정(2026-10-04, 지시 4)★ 이전에 「전문 헤더 정의」 잎을 썼는데 그건 headerMng 메뉴였다.
    //   layoutConfirm 은 **별도 메뉴 「레이아웃 확정」** 이다 —
    //   `MdmMenuSeeder.java:589`
    //   `insertMcmSecMenuIfAbsent("layoutConfirm","003","5020130","레이아웃 확정","dmb","layoutConfirm")`
    //   화면 제목도 `layoutConfirm/page.tsx:213` `title="레이아웃 확정"` 이다.
    //   (e2e `mdm-layoutConfirm.spec.ts:32` 가 헤더 화면을 여는 건 시험 준비 단계일 뿐이었다.)
    trail: [/^마루 MDM$/, /^레이아웃$/, /^레이아웃 확정$/],
    breadcrumb: "마루 MDM > 레이아웃 > 레이아웃 확정",
    listPanelTitle: undefined, // GridPanel 없음(page.tsx:313-330 이 AgDataGrid 를 직접 쓴다)
    searchUrlPattern: /\/api\/mdm\/oasis\/layoutConfirm\/search/,
    searchUrlExclude: /optionsOnly/,
    needsSearch: true,
    /** 이 화면은 조회 0건이면 그리드를 아예 만들지 않는다 → 0건이면 빈 상태 지표로 잰다(지시 2-1). */
    emptyWhenNoGrid: true,
    /**
     * 진입하면 자동으로 조회한다(`layoutConfirm/page.tsx:149-156`). [조회] 클릭보다 ≈60ms 먼저 나가 첫 행이
     * 자동 조회 응답으로 그려지므로 조회→첫 행 지표가 무효다(검증 §2.1). summarize.mjs 가 조회 지표에서 뺀다.
     */
    autoSearchAtEntry: true,
  },
  {
    // headerMng 는 원래 1차 후보가 아니었다. layoutConfirm 메뉴 경로를 잘못 잡은 과정에서
    // 실제로 열린 화면으로 확인되어 **6번째 측정 대상으로 남긴다**(지시 4-13).
    id: "headerMng",
    label: "전문 헤더 정의(헤더 관리)",
    trail: [/^마루 MDM$/, /^레이아웃$/, /^전문 헤더 정의$/],
    breadcrumb: "마루 MDM > 레이아웃 > 전문 헤더 정의",
    listPanelTitle: "헤더 목록",
    searchUrlPattern: /\/api\/mdm\/oasis\/headerMng\/search/,
    searchUrlExclude: /optionsOnly/,
    needsSearch: true,
  },
  {
    id: "dataMng",
    label: "마루 데이터(데이터 관리)",
    /** 우선순위 4 */
    trail: [/^마루 MDM$/, /^마스터데이터$/, /^마루 데이터$/],
    breadcrumb: "마루 MDM > 마스터데이터 > 마루 데이터",
    listPanelTitle: "마루 데이터 목록",
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
    listPanelTitle: "마루 코드 목록",
    searchUrlPattern: /\/api\/mdm\/oasis\/codeMng\/(codeMng\/search|search)/,
    searchUrlExclude: /optionsOnly/,
    needsSearch: true,
  },
];

/** id 로 화면 정의를 찾는다. 없으면 undefined. */
export function screenById(id) {
  return SCREENS.find((s) => s.id === id);
}
