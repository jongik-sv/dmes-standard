import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  RUN,
  T,
  Watcher,
  assertAllButtonsPressed,
  breadcrumb,
  button,
  checkLayout,
  escapeRe,
  expectErrorModal,
  expectToast,
  gridRow,
  gridRowById,
  gridRowCount,
  gridRows,
  modal,
  openAs,
  openMenu,
  resetClicks,
  screen,
  scrolledOut,
  snap,
  snapModal,
  tid,
  uid,
} from "./support";
import { revealGridColumn } from "../support/mdm-e2e";

/**
 * 마루 MDM > 용어·도메인(dma) 사용자 여정 E2E.
 *
 * 화면: 단위 마스터(unitMng) · 용어 관리(termMng) · 도메인 관리(domainMng) · 컬럼 사전(columnMng, 팝업 termRegPop 포함) ·
 * MDM 샘플(mdmSample, 빈 화면).
 *
 * 편집 역할은 dmc·dmd 와 반대다 — dma 는 표준관리자(std)가 편집하고 담당자(stw)는 조회만 한다
 * (DataInitializer.seedMdmObjectRbac: dma → STD_ADMIN=PERM_MDM_EDIT, STEWARD=PERM_MDM_READ).
 * READ 등급에도 compare 액션(분해·환산 미리보기)은 포함돼 있어, stw 도 [분해]·[계산]은 누를 수 있고
 * 저장·등록만 막힌다 — 결함이 아니라 설계(ADR-0003 D5, DataInitializer:1163).
 *
 * 장 구성 — dmd 선례를 따라 장마다 별도 describe + 별도 세션을 쓴다(dmc 처럼 한 describe 로 묶지 않는다):
 *   A 단위 마스터  · B 용어 관리 · C 도메인 관리 · D 컬럼 사전(+termRegPop) · E 연결·권한(default, 독립 테스트)
 *
 * 실측 함정(중요) — Playwright 는 serial describe 안에서 테스트가 실패하면 **다음 워커를 새로 띄운다**.
 * 새 워커는 이 파일을 다시 import 하므로 모듈 최상단에서 한 번만 계산하는 값(uid() 로 만든 ID)이
 * "장 안에서 실패가 하나도 없어야만" 안정적이다. 이 파일은 의도적으로 실패로 남기는 배치 위반(-99)이
 * 있으므로, 장을 넘어 참조하는 ID(단위 코드·도메인명 등)를 모듈 스코프 상수로 두면 뒷 장이 엉뚱한 값을
 * 찾다가 타임아웃한다(실제로 겪었다). 그래서 **장 사이에 공유하는 ID 는 두지 않는다** — 각 장이 필요한
 * 데이터를 자기 안에서(준비 단계로) 새로 만든다.
 *
 * ID 규약(2026-09-28) — `uid()` 는 실행 번호를 붙이지 않고 태그 하나를 ID 하나로 쓴다. 또 `RUN` 은
 * 고정값(`E2EX`)이다 — 유일성 제약이 있는 칸(용어 표기·영문 약어)에만 쓰이는 접미라 실행마다 달라야 할
 * 이유가 없다. 주 DB 에 남은 시험 데이터는 접두 `E2E` 기준으로 수동 정리한다.
 *
 * domainMng 의 6개 하위 컴포넌트는 data-testid 가 전혀 없다(관찰 — 보고에 기록). aria-label 은 모두 붙어 있어
 * getByLabel 로 찾는다. unitMng·termMng 상세 폼도 data-testid 가 거의 없어(일부만) <tr><th>라벨</th>… 구조를
 * th 텍스트로 찾는 field() 로 찾는다.
 */

const TRAIL = (leaf: string) => ["마루 MDM", "용어·도메인", leaf];
const MENU = {
  unitMng: "단위 마스터",
  termMng: "용어 관리",
  domainMng: "도메인 관리",
  columnMng: "컬럼 사전",
  mdmSample: "MDM 샘플",
} as const;
type ScreenId = keyof typeof MENU;

/** 테스트 케이스 표(AgDataGrid)의 n 번째 케이스 칸을 눌러 값을 넣는다 — 행 키는 1부터, 결과 칸(RESULT_TEXT)이 있는 행이 이 표의 행이다. 기대 칸은 true/false 선택이다. */
async function editCaseCell(root: Locator, n: number, col: "VALUE" | "EXPECT" | "MEMO", value: string) {
  const row = gridRowById(root, String(n))
    .filter({ has: root.page().locator('.ag-cell[col-id="RESULT_TEXT"]') });
  await row.locator(`.ag-cell[col-id="${col}"]`).click();
  if (col === "EXPECT") {
    await root.locator(".ag-cell-inline-editing select").selectOption(value);
    return;
  }
  const editor = root.locator(".ag-cell-inline-editing input");
  await editor.fill(value);
  await editor.press("Enter");
}

async function go(page: Page, id: ScreenId) {
  await openMenu(page, TRAIL(MENU[id]), id);
}

/** 배치·표시 검사 기록 — 검사는 그 상태에서 바로 하되 단언은 장 끝의 "-99" 테스트가 한다(dmd 선례). */
class Findings {
  readonly items: string[] = [];
  async layout(page: Page, label: string, opts?: Parameters<typeof checkLayout>[2]) {
    try {
      // 안쪽 스크롤로 보이지 않는 컨트롤(도메인 상세 패널이 검사 결과 쪽으로 내려가 위로 잘린 칸 등)은 그 순간 검사에서 뺀다(dme 와 같은 공용 scrolledOut).
      await checkLayout(page, label, { ...opts, exclude: [...(opts?.exclude ?? []), ...(await scrolledOut(page))] });
    } catch (e) {
      this.items.push(`${label}\n${(e as Error).message.split("\n").slice(0, 30).join("\n")}`);
      await snap(page, `dma-layout-${label.replace(/[^\w가-힣-]+/g, "_")}`);
    }
  }
  assertEmpty(chapter: string) {
    expect(this.items, `${chapter}: 화면 배치 위반(스크린샷: .out/screens/dma-layout-*)`).toEqual([]);
  }
}

/**
 * unitMng·termMng 상세 폼 — data-testid 가 없는 <tr><th>라벨</th><td><input/…></td></tr> 구조에서 입력칸을 찾는다.
 * th 전체 텍스트가 label 과 정확히 같은 행만 본다(예: "환산 계수 *" ≠ "환산 계수").
 */
function field(page: Page, label: string): Locator {
  return screen(page)
    .locator("tr")
    .filter({ has: page.locator("th").filter({ hasText: new RegExp(`^\\s*${escapeRe(label)}\\s*$`) }) })
    .locator("input, textarea, select")
    .first();
}

// ── unitMng 환산 계산기(ConvertCalculator, 01304edc) — 값 칸·입력 단위 콤보·결과 표(단위·환산값) ──

const calcValue = (page: Page): Locator => screen(page).getByLabel("환산할 값", { exact: true });
/** 입력 단위 콤보 입력칸 — 같은 aria-label 을 펼침 목록(listbox)도 가지므로 역할로 고른다. */
const calcUnit = (page: Page): Locator => screen(page).getByRole("combobox", { name: "입력 단위", exact: true });
const calcGrid = (page: Page): Locator =>
  screen(page).locator(".ag-root-wrapper").filter({ has: page.locator(".ag-header-cell-text", { hasText: /^환산값$/ }) });
const calcRows = (page: Page): Locator => gridRows(calcGrid(page));
/** 결과 표 행 — 행 키(row-id)는 단위 코드다(rowKey="unitCode"). */
const calcRow = (page: Page, unitCode: string): Locator =>
  gridRowById(calcGrid(page), unitCode);
const calcCell = (page: Page, unitCode: string): Locator => calcRow(page, unitCode).locator('.ag-cell[col-id="display"]');

/** 입력 단위 콤보에서 단위를 고른다 — 칸에 코드를 쳐서 좁히고 "코드 (차원)" 항목을 누른다. */
async function chooseCalcUnit(page: Page, unitCode: string) {
  const combo = calcUnit(page);
  await combo.click();
  await combo.fill(unitCode);
  await screen(page).getByRole("option", { name: new RegExp(`^${escapeRe(unitCode)} \\(`) }).click();
  await expect(combo).toHaveValue(new RegExp(`^${escapeRe(unitCode)} `));
}

/**
 * 컬럼명 자동 생성의 토큰 표 한 줄 — 9146703e 로 토큰 목록이 AgDataGrid 가 되어 `token-row-{n}` 은 순서 칸의 표지이고,
 * 처리 결과(등록됨·용어 등록 버튼)는 같은 행의 처리 칸에 있다. 그래서 그 표지를 가진 행 전체로 본다.
 */
const tokenRow = (page: Page, n: number): Locator =>
  gridRows(screen(page)).filter({ has: page.locator(`[data-testid="token-row-${n}"]`) });

/** SearchArea 안 SearchField(label) — <table> 이 아니라 .search-field div 구조라 field() 와 다른 셀렉터를 쓴다. */
function searchField(page: Page, label: string): Locator {
  return screen(page)
    .locator(".search-field")
    .filter({ has: page.locator(".search-field__label").filter({ hasText: new RegExp(`^\\s*${escapeRe(label)}\\s*$`) }) })
    .locator("input, select")
    .first();
}

/** GridPanel 제목으로 그 패널(.grid-panel) 을 찾는다 — gridRow()/gridRowCount() 의 "grid" 인자로 쓴다. */
function panelByTitle(page: Page, title: string): Locator {
  return screen(page)
    .locator(".grid-panel")
    .filter({ has: page.locator(".grid-panel-title").filter({ hasText: title }) });
}

/**
 * 도메인 목록(DomainTreeGrid)의 행 — 이름 칸 키는 `_NAME` 이다(abe1ad9f: 표시 문자열을 칸 값으로 미리 만든다). 하위 도메인은
 * 깊이만큼 전각 공백 + "└ " 가 앞에 붙고, 검색에 맞지 않은 조상 행은 끝에 폭 없는 표지(U+200B)가 붙는다(domain-tree.ts).
 * 그 꾸밈만 허용하고 이름은 정확히 같아야 한다.
 */
function domainRow(page: Page, name: string): Locator {
  const grid = panelByTitle(page, "도메인 목록");
  return gridRows(grid)
    .filter({ has: page.locator('.ag-cell[col-id="_NAME"]', { hasText: new RegExp(`^[\\s\\u3000]*(└ )?${escapeRe(name)}\\u200B?\\s*$`) }) });
}

/**
 * ag-grid 가로 스크롤을 맨 왼쪽으로 되돌린다(dmc codeItemEdit 선례). domainMng 의 도메인 목록은 칸이 8개로
 * 넓어서, 행 전체(.ag-row)를 클릭하면 Playwright 가 그 행의 가운데를 보이려고 그리드를 오른쪽으로 스크롤할
 * 때가 있다 — 그러면 맨 왼쪽 이름(_NAME) 칸이 가상화로 DOM 에서 빠져 다음 gridRow() 조회가 0건이 된다.
 */
async function scrollGridLeft(grid: Locator) {
  const hscroll = grid.locator(".ag-body-horizontal-scroll-viewport");
  if (await hscroll.count()) await hscroll.first().evaluate((el) => (el.scrollLeft = 0));
}

/**
 * 검색어로 이미 좁힌 목록에 행이 있는지 확인한다. domainMng 목록처럼 칸이 8개로 넓으면 scrollLeft 를
 * 되돌려도(scrollGridLeft) 다시 그려질 때 오른쪽으로 밀리는 경우가 실측에서 있어, 특정 칸(_NAME)
 * 텍스트 대신 행 수만 본다 — 검색으로 이미 그 키워드로만 걸렀으니 "1건 이상" = 그 값이 있다는 뜻이다.
 */
async function expectSearchedRowExists(grid: Locator) {
  await expect(async () => {
    expect(await gridRowCount(grid)).toBeGreaterThanOrEqual(1);
  }).toPass({ timeout: T.UI });
}

/** 한글 접두 + RUN(대문자 영숫자, 밑줄 없음) — 용어 표기처럼 밑줄이 금지된 칸에 쓴다(NamingRules.TERM_NAME). */
const kw = (tag: string) => `${tag}${RUN}`;

// ─────────────────────────── 화면 간 공용 준비 동작 ───────────────────────────
// 여러 장(C·D·E)이 "우선 단위/도메인/용어 하나가 있어야" 하므로 화면 조작만으로 만드는 헬퍼를 둔다.
// 각 헬퍼는 자기 메뉴부터 연다(호출 시점의 현재 화면을 가정하지 않는다).

/**
 * 여러 시험 실행이 쌓이면 목록이 커져(ag-grid 가상 스크롤) 방금 저장한 행이 전체 목록에서 바로 그려지지
 * 않을 수 있다 — 검색어로 좁혀 그 행만 확실히 보이게 한 뒤 확인한다.
 */
async function verifyListedAfterSearch(page: Page, panelTitle: string, keyword: string, _colId: string) {
  await searchField(page, "검색어").fill(keyword);
  await button(page, "조회").click();
  await expectSearchedRowExists(panelByTitle(page, panelTitle));
}

/**
 * 단위 상세의 차원 콤보를 열고, 진입 때 받는 차원 목록이 뜬 것을 본 뒤 돌려준다. 공용 ComboBox 는 목록(options)이 새로 오면
 * 검색어를 선택값 라벨로 되돌려(ComboBox.tsx 동기화 효과 [value, options]), 목록이 오기 전에 친 새 차원 글자가 지워진다
 * (최종 실행 4회차 — 새로 띄운 mdm 의 첫 조회가 5초 걸렸다, 보고서 결함 후보). 사람처럼 목록이 뜬 뒤에 친다.
 */
async function openDimensionCombo(page: Page): Promise<Locator> {
  const dim = field(page, "차원 *");
  await dim.click();
  await expect(dim.locator("xpath=ancestor::td[1]").getByRole("option").first()).toBeVisible({ timeout: T.UI });
  return dim;
}

/** unitMng — 새 차원의 첫 단위 하나를 등록한다(기준 단위=자기 자신, 계수=1). */
async function registerNewDimensionUnit(page: Page, unitCode: string, dimension: string) {
  await go(page, "unitMng");
  await button(page, "단위 등록").click();
  await field(page, "단위 코드 *").fill(unitCode);
  const dim = await openDimensionCombo(page);
  await dim.fill(dimension);
  await screen(page).locator(".form-combobox-create").click();
  await button(page, "저장").click();
  await verifyListedAfterSearch(page, "단위 목록", unitCode, "unitCode");
}

/** termMng — 표기·의미 번호 1·정의만 채운 간단한 용어를 등록한다. */
async function registerSimpleTerm(page: Page, termName: string, definition: string) {
  await go(page, "termMng");
  await button(page, "등록").click();
  await field(page, "표기 *").fill(termName);
  await field(page, "의미 번호 *").fill("1");
  await field(page, "정의 *").fill(definition);
  await button(page, "저장").click();
  await verifyListedAfterSearch(page, "용어 목록", termName, "termName");
}

/**
 * domainMng — 최상위(부모 없음) TEXT 도메인을 등록한다. 부모가 없으니 W01("부모와 정의가 같다") 경고가
 * 뜨지 않아 곧바로 저장된다(하위 도메인의 W01 흐름은 DOM-05 가 따로 다룬다).
 */
async function registerTextDomain(page: Page, domainName: string, stdName: string) {
  await go(page, "domainMng");
  await screen(page).getByRole("button", { name: "도메인 등록", exact: true }).click();
  await screen(page).getByLabel("도메인명", { exact: true }).fill(domainName);
  await screen(page).getByLabel("표준명", { exact: true }).fill(stdName);
  await screen(page).getByLabel("종류", { exact: true }).selectOption("TEXT");
  await screen(page).getByLabel("데이터 타입", { exact: true }).selectOption("STRING");
  await screen(page).getByRole("button", { name: "도메인검증" }).click();
  await expect(screen(page).getByText(/검사 통과/)).toBeVisible({ timeout: T.UI });
  await screen(page).getByRole("button", { name: "저장", exact: true }).click();
  await expectToast(page, "저장했습니다");
  await verifyListedAfterSearch(page, "도메인 목록", domainName, "_NAME");
}

/** domainMng — 최상위 QTY(NUMBER) 도메인을 등록하고 주어진 단위를 참조시킨다(부모 없음 → W01 없음). */
async function registerQtyDomain(page: Page, domainName: string, stdName: string, unitCode: string) {
  await go(page, "domainMng");
  await screen(page).getByRole("button", { name: "도메인 등록", exact: true }).click();
  await screen(page).getByLabel("도메인명", { exact: true }).fill(domainName);
  await screen(page).getByLabel("표준명", { exact: true }).fill(stdName);
  await screen(page).getByLabel("종류", { exact: true }).selectOption("QTY");
  await screen(page).getByLabel("데이터 타입", { exact: true }).selectOption("NUMBER");
  await screen(page).getByLabel("단위", { exact: true }).fill(unitCode);
  await screen(page).getByRole("button", { name: "도메인검증" }).click();
  await expect(screen(page).getByText(/검사 통과|검사 실패/)).toBeVisible({ timeout: T.UI });
  await screen(page).getByRole("button", { name: "저장", exact: true }).click();
  await expectToast(page, "저장했습니다");
  await verifyListedAfterSearch(page, "도메인 목록", domainName, "_NAME");
}

// ─────────── A. unitMng — 단위 마스터 ───────────

test.describe("A 단위 마스터", () => {
  test.describe.configure({ mode: "serial" });

  let page: Page;
  let watcher: Watcher;

  test.beforeAll(async ({ browser }, testInfo) => {
    ({ page, watcher } = await openAs(browser, "std", testInfo));
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  const DIM1 = uid("DIM1");
  const U1 = uid("UN1");
  const U2 = uid("UN2"); // 같은 차원 형제 단위
  const DIM3 = uid("DIM3");
  const U3 = uid("UN3"); // 독립 차원, 참조 없음(삭제 시험은 장 E 에서 자기 데이터로 따로 한다)

  const layoutA = new Findings();

  test("TC-DMA-UNT-01 단위 마스터 화면 배치 — 메뉴로 열면 목록·상세·환산 미리보기가 보인다", async () => {
    await go(page, "unitMng");
    await resetClicks(page);
    await expect(breadcrumb(page)).toContainText("마루 MDM > 용어·도메인 > 단위 마스터");
    await expect(panelByTitle(page, "단위 목록")).toBeVisible();
    await expect(screen(page).getByText("목록에서 행을 선택하거나 [단위 등록] 을 눌러 작성하세요.")).toBeVisible();
    await expect(button(page, "저장")).toBeDisabled();
    await expect(button(page, "삭제")).toBeDisabled();
    await layoutA.layout(page, "unitMng");
    await snap(page, "dma-unitMng-01-initial");
    watcher.assertClean("unitMng");
  });

  test("TC-DMA-UNT-02 필수값 오류는 알아듣기 쉬운 문구로 막힌다", async () => {
    // "저장" 은 form 이 없으면(등록도 선택도 전) 비활성이라 UnitMngService 의 "저장할 값이 없습니다." 분기는
    // 화면으로는 누를 수 없다(observed — 보고서 "실패로 두지 않은 관찰"). [단위 등록] 을 눌러 폼을 연 뒤부터 본다.
    await button(page, "단위 등록").click();
    await button(page, "저장").click();
    await expectErrorModal(page, "단위 코드는 영문·숫자·밑줄 20자 이내여야 합니다", "dma-unitMng-02-required");
    watcher.assertClean("unitMng");
  });

  test("TC-DMA-UNT-03 등록(C) — 새 차원의 첫 단위는 스스로 기준 단위(계수 1)가 된다", async () => {
    await field(page, "단위 코드 *").fill(U1);
    const dim = await openDimensionCombo(page);
    await dim.fill(DIM1);
    await screen(page).locator(".form-combobox-create").click();
    await expect(field(page, "기준 단위")).toHaveValue(U1);
    await expect(field(page, "환산 계수 *")).toHaveValue("1");
    await expect(field(page, "환산 계수 *")).toBeDisabled();
    await layoutA.layout(page, "unitMng 새 차원 등록 중");
    await snap(page, "dma-unitMng-03-new-dimension");

    await button(page, "저장").click();
    // 여러 번의 시험 실행이 쌓여 단위 목록이 커지면(가상 스크롤) 방금 만든 행이 처음엔 그려지지 않을 수
    // 있다 — 검색어로 좁혀서 확실히 그 행만 보이게 한다.
    await searchField(page, "검색어").fill(U1);
    await button(page, "조회").click();
    await expect(gridRow(panelByTitle(page, "단위 목록"), U1, "unitCode")).toHaveCount(1, { timeout: T.UI });
    watcher.assertClean("unitMng");
  });

  test("TC-DMA-UNT-04 등록(C) — 같은 차원을 고르면 기준 단위가 자동으로 채워지고 계수만 입력한다", async () => {
    await button(page, "단위 등록").click();
    await field(page, "단위 코드 *").fill(U2);
    const dim = await openDimensionCombo(page);
    await dim.fill(DIM1);
    // 콤보박스 드롭다운은 이 칸(<td>) 안에서 연다(withinPortal:false) — 검색조건의 같은 이름 native <select><option>
    // 과 섞이지 않게 그 <td> 범위 안에서만 옵션을 찾는다.
    await dim.locator("xpath=ancestor::td[1]").getByRole("option", { name: new RegExp(`^${escapeRe(DIM1)}`) }).first().click();
    await expect(field(page, "기준 단위")).toHaveValue(U1);
    await expect(field(page, "환산 계수 *")).toBeEnabled();

    await field(page, "환산 계수 *").fill("abc");
    await button(page, "저장").click();
    await expectErrorModal(page, "환산 계수는 0보다 큰 숫자여야 합니다", "dma-unitMng-04-bad-factor");
    await field(page, "환산 계수 *").fill("1000");
    await button(page, "저장").click();
    // UNT-03 이 남긴 검색어(U1) 필터를 U2 로 바꿔 방금 저장한 행만 확실히 보이게 한다.
    await searchField(page, "검색어").fill(U2);
    await button(page, "조회").click();
    await expect(gridRow(panelByTitle(page, "단위 목록"), U2, "unitCode")).toHaveCount(1, { timeout: T.UI });
    watcher.assertClean("unitMng");
  });

  test("TC-DMA-UNT-05 조회(R) — 단위 코드·차원 조건으로 방금 만든 단위를 찾는다", async () => {
    await searchField(page, "검색어").fill(U1);
    await button(page, "조회").click();
    const list = panelByTitle(page, "단위 목록");
    await expect(gridRow(list, U1, "unitCode")).toHaveCount(1, { timeout: T.UI });
    await expect(gridRow(list, U2, "unitCode")).toHaveCount(0);
    await searchField(page, "검색어").fill("");
    await searchField(page, "차원").selectOption(DIM1);
    await button(page, "조회").click();
    await expect(gridRow(list, U1, "unitCode")).toHaveCount(1, { timeout: T.UI });
    await expect(gridRow(list, U2, "unitCode")).toHaveCount(1);
    await searchField(page, "차원").selectOption("");
    await layoutA.layout(page, "unitMng 목록 채워짐");
    watcher.assertClean("unitMng");
  });

  test("TC-DMA-UNT-06 수정(U) — 환산 계수를 고쳐 저장하면 다시 조회해도 남는다", async () => {
    await searchField(page, "검색어").fill(U2);
    await button(page, "조회").click();
    const list = panelByTitle(page, "단위 목록");
    await gridRow(list, U2, "unitCode").click();
    await expect(field(page, "단위 코드 *")).toBeDisabled();
    await field(page, "환산 계수 *").fill("2000");
    await button(page, "저장").click();
    await button(page, "조회").click();
    await expect(gridRow(list, U2, "unitCode").locator('.ag-cell[col-id="factor"]')).toHaveText("2000", { timeout: T.UI });
    watcher.assertClean("unitMng");
  });

  test("TC-DMA-UNT-07 환산 계산기 — 값과 입력 단위를 넣으면 같은 차원 단위마다 서버 환산값이 바로 보인다", async () => {
    // 01304edc(10-02): [계산] 버튼·표시 단위 칸이 없어지고, 값·입력 단위가 바뀌면 같은 차원의 모든 단위로 자동 계산한다
    // (unitMng 기능설계서 A-PREVIEW·B-005). 숫자가 아니면 팝업 대신 값 칸 아래에 안내한다(서버 호출 없음).
    const value = calcValue(page);
    await value.fill("abc");
    await expect(screen(page).getByText("숫자만 입력할 수 있습니다.")).toBeVisible();
    await snap(page, "dma-unitMng-07-invalid");

    // 천 단위 쉼표를 받는다. U2 는 UNT-06 에서 계수 2000(1 U2 = 2000 U1)이 됐다 — 2,000 U1 = 1 U2.
    await value.fill("2,000");
    await chooseCalcUnit(page, U1);
    await expect(calcCell(page, U1)).toHaveText("2,000", { timeout: T.UI });
    await expect(calcCell(page, U2)).toHaveText("1");
    await layoutA.layout(page, "unitMng 환산 계산기");
    await snap(page, "dma-unitMng-07-preview");

    // 결과 행을 누르면 그 단위·환산값이 새 입력이 되어 그 기준으로 다시 계산한다. 환산은 왕복해도 값이 같으므로
    // 칸 값만으로는 다시 계산했는지 알 수 없다 — U2 기준 compare 응답이 오는 것까지 본다.
    const recalculated = page.waitForResponse(
      (r) => r.url().includes("/oasis/unitMng/compare") && (r.request().postData() ?? "").includes(`"fromUnitCode":"${U2}"`),
      { timeout: T.UI },
    );
    await calcRow(page, U2).click();
    await recalculated;
    await expect(value).toHaveValue("1");
    await expect(calcUnit(page)).toHaveValue(new RegExp(`^${escapeRe(U2)} `));
    await expect(calcCell(page, U1)).toHaveText("2,000", { timeout: T.UI });
    await expect(calcCell(page, U2)).toHaveText("1");
    watcher.assertClean("unitMng");
  });

  test("TC-DMA-UNT-08 독립 차원 단위(U3) — 다른 차원끼리는 변환할 수 없다", async () => {
    await button(page, "단위 등록").click();
    await field(page, "단위 코드 *").fill(U3);
    const dim = await openDimensionCombo(page);
    await dim.fill(DIM3);
    await screen(page).locator(".form-combobox-create").click();
    await button(page, "저장").click();
    await searchField(page, "검색어").fill(U3);
    await button(page, "조회").click();
    await expect(gridRow(panelByTitle(page, "단위 목록"), U3, "unitCode")).toHaveCount(1, { timeout: T.UI });

    // 환산 계산기는 입력 단위와 같은 차원의 단위만 결과로 늘어놓는다(01304edc, A-PREVIEW) — 다른 차원(DIM1)의
    // U1·U2 는 U3 기준 결과에 나오지 않는다.
    await calcValue(page).fill("1");
    await chooseCalcUnit(page, U3);
    await expect(calcCell(page, U3)).toHaveText("1", { timeout: T.UI });
    await expect(calcRows(page)).toHaveCount(1);
    await expect(calcRow(page, U1)).toHaveCount(0);
    await expect(calcRow(page, U2)).toHaveCount(0);
    await snap(page, "dma-unitMng-08-dimension-only");
    await assertAllButtonsPressed(page, "unitMng");
    watcher.assertClean("unitMng");
  });

  test("TC-DMA-UNT-99 배치 모음 — 이 장에서 본 단위 마스터 화면 상태에 배치 위반이 없다", async () => {
    layoutA.assertEmpty("A 단위 마스터");
  });
});

// ─────────── B. termMng — 용어 관리 ───────────

test.describe("B 용어 관리", () => {
  test.describe.configure({ mode: "serial" });

  let page: Page;
  let watcher: Watcher;

  test.beforeAll(async ({ browser }, testInfo) => {
    ({ page, watcher } = await openAs(browser, "std", testInfo));
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  const TERM_A_NAME = kw("표준용어");
  const TERM_B_NAME = `${TERM_A_NAME}확장`; // TERM_A 를 포함해 유사어 1차 추천(포함 일치)에 걸리게 한다.

  const layoutB = new Findings();

  test("TC-DMA-TRM-01 용어 관리 화면 배치 — 메뉴로 열면 목록·상세·유사어 추천 영역이 보인다", async () => {
    await go(page, "termMng");
    await resetClicks(page);
    await expect(breadcrumb(page)).toContainText("마루 MDM > 용어·도메인 > 용어 관리");
    await expect(panelByTitle(page, "용어 목록")).toBeVisible();
    await expect(screen(page).getByText("목록에서 행을 선택하거나 [등록] 을 눌러 작성하세요.")).toBeVisible();
    await expect(button(page, "저장")).toBeDisabled();
    await expect(button(page, "삭제")).toBeDisabled();
    await layoutB.layout(page, "termMng");
    await snap(page, "dma-termMng-01-initial");
    watcher.assertClean("termMng");
  });

  test("TC-DMA-TRM-02 필수값 오류는 알아듣기 쉬운 문구로 막힌다", async () => {
    // "저장" 도 form 없으면 비활성이라 TermMngService 의 "저장할 값이 없습니다." 분기는 화면으로 누를 수 없다
    // (observed — unitMng 와 같은 모양, 보고서 "실패로 두지 않은 관찰").
    await button(page, "등록").click();
    await button(page, "저장").click();
    await expectErrorModal(page, "표기(한글)는 필수입니다", "dma-termMng-02-required");
    watcher.assertClean("termMng");
  });

  test("TC-DMA-TRM-03 등록(C) — 표기·의미 번호·정의를 넣고 저장한다", async () => {
    await field(page, "표기 *").fill(TERM_A_NAME);
    await field(page, "의미 번호 *").fill("1");
    await field(page, "정의 *").fill("E2E 유사어 추천 원본 용어");
    await field(page, "영문명").fill("StandardTermSample");
    await field(page, "영문 약어").fill(`A${RUN}`);
    await layoutB.layout(page, "termMng 등록 중");
    await button(page, "저장").click();
    await verifyListedAfterSearch(page, "용어 목록", TERM_A_NAME, "termName");
    watcher.assertClean("termMng");
  });

  test("TC-DMA-TRM-04 조회(R) — 검색어·사용 시스템·맥락 조건으로 방금 만든 용어를 찾는다", async () => {
    await searchField(page, "검색어").fill(TERM_A_NAME);
    await button(page, "조회").click();
    const list = panelByTitle(page, "용어 목록");
    await expect(gridRow(list, TERM_A_NAME, "termName")).toHaveCount(1, { timeout: T.UI });
    await searchField(page, "검색어").fill(`${TERM_A_NAME}_없음`);
    await button(page, "조회").click();
    await expect(gridRow(list, TERM_A_NAME, "termName")).toHaveCount(0, { timeout: T.UI });
    await searchField(page, "검색어").fill(TERM_A_NAME);
    await button(page, "조회").click();
    await expect(gridRow(list, TERM_A_NAME, "termName")).toHaveCount(1, { timeout: T.UI });
    watcher.assertClean("termMng");
  });

  test("TC-DMA-TRM-05 수정(U) — 정의를 고쳐 저장하면 다시 조회해도 남는다", async () => {
    await gridRow(panelByTitle(page, "용어 목록"), TERM_A_NAME, "termName").click();
    await field(page, "정의 *").fill("E2E 유사어 추천 원본 용어(수정)");
    await button(page, "저장").click();
    await button(page, "조회").click();
    await gridRow(panelByTitle(page, "용어 목록"), TERM_A_NAME, "termName").click();
    await expect(field(page, "정의 *")).toHaveValue("E2E 유사어 추천 원본 용어(수정)", { timeout: T.UI });
    watcher.assertClean("termMng");
  });

  test("TC-DMA-TRM-06 유사어 추천 — 표기가 겹치는 새 용어를 적으면 1차 추천이 뜨고 동의어로 확정할 수 있다", async () => {
    await button(page, "등록").click();
    await field(page, "표기 *").fill(TERM_B_NAME);
    const candidate = page
      .getByLabel("유사어 추천")
      .locator(".ag-row", { has: page.locator('[data-testid^="reco-candidate-1-"]') })
      .first();
    await expect(candidate).toBeVisible({ timeout: 10_000 });
    await expect(candidate).toContainText(TERM_A_NAME);
    await snap(page, "dma-termMng-06-recommend");
    await candidate.getByRole("button", { name: "동의어로 확정" }).click();
    await expect(field(page, "동의어")).toHaveValue(TERM_A_NAME);

    await field(page, "의미 번호 *").fill("1");
    await field(page, "정의 *").fill("E2E 유사어 추천 — 확장 표기");
    await layoutB.layout(page, "termMng 유사어 추천");
    await button(page, "저장").click();
    await verifyListedAfterSearch(page, "용어 목록", TERM_B_NAME, "termName");
    watcher.assertClean("termMng");
  });

  test("TC-DMA-TRM-07 재인코딩 배치 실행 — 누르면 상태 문구가 뜬다", async () => {
    await screen(page).getByRole("button", { name: "재인코딩 배치 실행" }).click();
    await expect(
      screen(page).getByText(/임베딩 인코더가 비활성 상태입니다|처리 \d+건, 남은 \d+건/),
    ).toBeVisible({ timeout: T.LONG });
    watcher.assertClean("termMng");
  });

  test("TC-DMA-TRM-08 삭제(D) — 참조 없는 용어를 지우면 목록에서 빠진다", async () => {
    const throwaway = kw("지울용어");
    await button(page, "등록").click();
    await field(page, "표기 *").fill(throwaway);
    await field(page, "의미 번호 *").fill("1");
    await field(page, "정의 *").fill("E2E 삭제 시험용");
    await button(page, "저장").click();
    // TRM-04 가 남긴 검색어(TERM_A_NAME) 필터가 남아 있으면 방금 등록한 용어가 걸러진다 — throwaway 로
    // 다시 검색해 그 행만 보이게 한다(가상 스크롤 대비도 겸한다).
    await verifyListedAfterSearch(page, "용어 목록", throwaway, "termName");

    await gridRow(panelByTitle(page, "용어 목록"), throwaway, "termName").click();
    await button(page, "삭제").click();
    await expect(gridRow(panelByTitle(page, "용어 목록"), throwaway, "termName")).toHaveCount(0, { timeout: T.UI });
    await assertAllButtonsPressed(page, "termMng");
    watcher.assertClean("termMng");
  });

  test("TC-DMA-TRM-99 배치 모음 — 이 장에서 본 용어 관리 화면 상태에 배치 위반이 없다", async () => {
    layoutB.assertEmpty("B 용어 관리");
  });
});

// ─────────── C. domainMng — 도메인 관리 ───────────

test.describe("C 도메인 관리", () => {
  test.describe.configure({ mode: "serial" });

  let page: Page;
  let watcher: Watcher;

  test.beforeAll(async ({ browser }, testInfo) => {
    ({ page, watcher } = await openAs(browser, "std", testInfo));
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  const DOM1_NAME = `E2E 도메인 ${RUN}`;
  const DOM1_STD = `DOM${RUN}`;
  const DOM2_NAME = `E2E 하위 도메인 ${RUN}`;
  const DOM2_STD = `DOMC${RUN}`;
  const DOM3_NAME = `E2E 계량 도메인 ${RUN}`;
  const DOM3_STD = `QTY${RUN}`;
  /** DOM-00 이 unitMng 화면에서 만들어 DOM-06(QTY 도메인)이 참조한다. */
  let U_FOR_QTY: string;

  const layoutC = new Findings();

  test("TC-DMA-DOM-00 준비 — QTY 도메인이 참조할 단위를 단위 마스터 화면에서 만든다", async () => {
    U_FOR_QTY = uid("CUN");
    await registerNewDimensionUnit(page, U_FOR_QTY, uid("CDIM"));
  });

  test("TC-DMA-DOM-01 도메인 관리 화면 배치 — 메뉴로 열면 도메인 목록과 안내 문구가 보인다", async () => {
    await go(page, "domainMng");
    await resetClicks(page);
    await expect(breadcrumb(page)).toContainText("마루 MDM > 용어·도메인 > 도메인 관리");
    await expect(panelByTitle(page, "도메인 목록")).toBeVisible();
    await expect(screen(page).getByText("목록에서 도메인을 선택하거나 [도메인 등록] 을 누르세요.")).toBeVisible();
    await expect(screen(page).getByRole("button", { name: "하위 도메인 등록" })).toBeDisabled();
    await layoutC.layout(page, "domainMng");
    await snap(page, "dma-domainMng-01-initial");
    watcher.assertClean("domainMng");
  });

  test("TC-DMA-DOM-02 저장은 도메인검증을 통과해야만 켜진다 — 필수값 없이 검증하면 오류 목록이 보인다", async () => {
    await screen(page).getByRole("button", { name: "도메인 등록", exact: true }).click();
    await expect(screen(page).getByText("[도메인검증] 을 누르면 검사 목록이 보입니다")).toBeVisible();
    await expect(screen(page).getByRole("button", { name: "저장", exact: true })).toBeDisabled();

    await screen(page).getByRole("button", { name: "도메인검증" }).click();
    await expect(screen(page).getByText(/검사 실패/)).toBeVisible({ timeout: T.UI });
    await expect(screen(page).getByText(/도메인명 필수|표준명 필수/).first()).toBeVisible();
    await expect(screen(page).getByRole("button", { name: "저장", exact: true })).toBeDisabled();
    await layoutC.layout(page, "domainMng 검증 실패");
    await snap(page, "dma-domainMng-02-invalid");
    watcher.assertClean("domainMng");
  });

  test("TC-DMA-DOM-03 등록(C) — 필수값을 채우고 검증·저장하면 목록에 반영되고, 값을 고치면 다시 검증해야 한다", async () => {
    await screen(page).getByLabel("도메인명", { exact: true }).fill(DOM1_NAME);
    await screen(page).getByLabel("표준명", { exact: true }).fill(DOM1_STD);
    await screen(page).getByLabel("종류", { exact: true }).selectOption("TEXT");
    await screen(page).getByLabel("데이터 타입", { exact: true }).selectOption("STRING");
    await screen(page).getByLabel("정의", { exact: true }).fill("E2E 표준관리자 여정 — 최상위 TEXT 도메인");
    await layoutC.layout(page, "domainMng 등록 입력 중");

    await screen(page).getByRole("button", { name: "도메인검증" }).click();
    await expect(screen(page).getByText(/검사 통과/)).toBeVisible({ timeout: T.UI });
    // 부모가 없는 최상위 도메인은 W01(부모와 정의가 같음) 대상이 아니라 곧바로 저장된다(하위 도메인의
    // W01 확인 모달 흐름은 DOM-05 가 다룬다).
    const saveBtn = screen(page).getByRole("button", { name: "저장", exact: true });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await expectToast(page, "저장했습니다");
    await verifyListedAfterSearch(page, "도메인 목록", DOM1_NAME, "_NAME");

    // 저장 뒤 값을 고치면(재검증 전) 저장이 다시 잠긴다 — dmc CNF-03 과 같은 게이팅.
    await screen(page).getByLabel("정의", { exact: true }).fill("E2E 표준관리자 여정 — 최상위 TEXT 도메인(수정)");
    await expect(saveBtn).toBeDisabled();
    await screen(page).getByRole("button", { name: "도메인검증" }).click();
    await expect(screen(page).getByText(/검사 통과/)).toBeVisible({ timeout: T.UI });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await expectToast(page, "저장했습니다");
    // 토스트만으로는 "직전 저장이 아직 안 사라진 토스트"와 구분이 안 된다 — 다시 조회해 실제로
    // 두 번째 저장(정의 "수정")이 반영됐는지 확인한다.
    await button(page, "조회").click();
    await domainRow(page, DOM1_NAME).click();
    await scrollGridLeft(panelByTitle(page, "도메인 목록"));
    await expect(screen(page).getByLabel("정의", { exact: true }))
      .toHaveValue("E2E 표준관리자 여정 — 최상위 TEXT 도메인(수정)", { timeout: T.UI });
    watcher.assertClean("domainMng");
  });

  test("TC-DMA-DOM-04 조회(R) — 검색어·종류 조건으로 방금 만든 도메인을 찾는다", async () => {
    await searchField(page, "검색어").fill(DOM1_NAME);
    await button(page, "조회").click();
    const tree = panelByTitle(page, "도메인 목록");
    await expectSearchedRowExists(tree);
    await searchField(page, "종류").selectOption("QTY");
    await button(page, "조회").click();
    await expect(domainRow(page, DOM1_NAME)).toHaveCount(0, { timeout: T.UI });
    await searchField(page, "종류").selectOption("");
    await searchField(page, "검색어").fill("");
    await button(page, "조회").click();
    watcher.assertClean("domainMng");
  });

  test("TC-DMA-DOM-05 하위 도메인 등록 — 부모와 정의가 같으면 경고 확인이 뜨고, [취소]는 아무것도 바꾸지 않는다", async () => {
    await domainRow(page, DOM1_NAME).click();
    await scrollGridLeft(panelByTitle(page, "도메인 목록"));
    await expect(screen(page).getByLabel("도메인명", { exact: true })).toHaveValue(DOM1_NAME, { timeout: T.UI });
    await screen(page).getByRole("button", { name: "하위 도메인 등록" }).click();
    await expect(screen(page).getByText("기본 속성 — 하위 도메인 신규")).toBeVisible();
    await expect(screen(page).getByLabel("종류", { exact: true })).toBeDisabled();
    await expect(screen(page).getByLabel("종류", { exact: true })).toHaveValue("TEXT");

    await screen(page).getByLabel("도메인명", { exact: true }).fill(DOM2_NAME);
    await screen(page).getByLabel("표준명", { exact: true }).fill(DOM2_STD);
    await screen(page).getByRole("button", { name: "도메인검증" }).click();
    await expect(screen(page).getByText(/검사 통과/)).toBeVisible({ timeout: T.UI });

    // 부모(D1)와 정의가 같아(둘 다 규칙 없음) W01 경고 — [저장] 을 누르면 "그래도 저장할까요?" 모달이 뜬다.
    const saveBtn = screen(page).getByRole("button", { name: "저장", exact: true });
    await saveBtn.click();
    const m = modal(page);
    await expect(m).toContainText("부모와 정의가 같습니다");
    await snapModal(page, "dma-domainMng-05-w01-confirm");
    await m.getByRole("button", { name: "취소", exact: true }).click();
    await expect(m).toBeHidden();
    await expect(domainRow(page, DOM2_NAME)).toHaveCount(0);

    await saveBtn.click();
    await expect(modal(page)).toContainText("부모와 정의가 같습니다");
    await modal(page).getByRole("button", { name: "확인", exact: true }).click();
    await expectToast(page, "저장했습니다");
    await verifyListedAfterSearch(page, "도메인 목록", DOM2_NAME, "_NAME");
    await layoutC.layout(page, "domainMng 하위 도메인");
    await snap(page, "dma-domainMng-05-child");
    watcher.assertClean("domainMng");
  });

  test("TC-DMA-DOM-06 QTY 도메인 — 단위를 참조하고 테스트 케이스를 추가해 검증한다", async () => {
    await screen(page).getByRole("button", { name: "도메인 등록", exact: true }).click();
    await screen(page).getByLabel("도메인명", { exact: true }).fill(DOM3_NAME);
    await screen(page).getByLabel("표준명", { exact: true }).fill(DOM3_STD);
    await screen(page).getByLabel("종류", { exact: true }).selectOption("QTY");
    await screen(page).getByLabel("데이터 타입", { exact: true }).selectOption("NUMBER");
    await screen(page).getByLabel("단위", { exact: true }).fill(U_FOR_QTY);

    // 미리보기 — 표준식이 없으면 상시 "-"(none) 다.
    await screen(page).getByLabel("미리보기 입력값", { exact: true }).fill("10");
    await expect(screen(page).locator(".domain-mng__preview-std")).toHaveText("-");

    // 케이스 추가
    await screen(page).getByRole("button", { name: "케이스 추가" }).click();
    await editCaseCell(screen(page), 1, "VALUE", "10");
    await editCaseCell(screen(page), 1, "EXPECT", "true");
    await editCaseCell(screen(page), 1, "MEMO", "E2E 케이스");
    await layoutC.layout(page, "domainMng QTY 등록 입력 중");
    await snap(page, "dma-domainMng-06-qty");

    await screen(page).getByRole("button", { name: "도메인검증" }).click();
    await expect(screen(page).getByText(/검사 통과|검사 실패/)).toBeVisible({ timeout: T.UI });
    // 최상위(부모 없음) 도메인이라 W01 경고 없이 곧바로 저장된다.
    await screen(page).getByRole("button", { name: "저장", exact: true }).click();
    await expectToast(page, "저장했습니다");
    await verifyListedAfterSearch(page, "도메인 목록", DOM3_NAME, "_NAME");

    // 영향도 패널 — 지금까지는 참조가 없어 표가 비어 있어도 렌더는 된다.
    await expect(screen(page).locator(".domain-mng__impact")).toBeVisible();

    // [부모 연결] 은 저장된 도메인에 부모를 다는 대화상자를 연다(53465b16, D-132). [취소] 하면 아무것도 바뀌지 않는다.
    await button(page, "부모 연결").click();
    const link = page.locator('[data-testid="domain-parent-link-modal"]');
    await expect(link).toBeVisible();
    await expect(link).toContainText(`${DOM3_NAME} (${DOM3_STD})`);
    await snapModal(page, "dma-domainMng-06-parent-link");
    await modal(page).getByRole("button", { name: "취소", exact: true }).click();
    await expect(link).toHaveCount(0);
    // 부모가 생기지 않았다 — 목록 이름 칸이 └ 없이 그대로다. 넓은 목록은 가로로 밀려 이름 칸이 가상화로 빠질 수 있어
    // 이름 열을 드러낸 뒤 본다(공용 revealGridColumn — 가운데 칸 뷰포트를 굴린다).
    const list = panelByTitle(page, "도메인 목록");
    await revealGridColumn(list, "_NAME");
    await expect(gridRow(list, DOM3_NAME, "_NAME")).toHaveCount(1);
    await assertAllButtonsPressed(page, "domainMng", { 삭제: "테스트 케이스 행 삭제는 이 여정에서 다루지 않는다" });
    watcher.assertClean("domainMng");
  });

  test("TC-DMA-DOM-99 배치 모음 — 이 장에서 본 도메인 관리 화면 상태에 배치 위반이 없다", async () => {
    layoutC.assertEmpty("C 도메인 관리");
  });
});

// ─────────── D. columnMng — 컬럼 사전(+termRegPop 팝업) ───────────

test.describe("D 컬럼 사전", () => {
  test.describe.configure({ mode: "serial" });

  let page: Page;
  let watcher: Watcher;

  test.beforeAll(async ({ browser }, testInfo) => {
    ({ page, watcher } = await openAs(browser, "std", testInfo));
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  // 공백 없는 한 덩어리 → 토큰 1개, 사전에 없어 UNKNOWN. 분해는 사전 키를 왼쪽부터 가장 길게 맞추므로(ColumnNameComposer)
  // 사전의 어떤 키(용어·동의어·별칭)도 입력 안에 들어 있지 않은 한글만 쓴다. 스냅샷 사전(8천여 개)에는 「판정」「값」과 1글자 용어
  // 「E」「X」가 있어 예전 값 kw("판정값")=판정값E2EX 가 여러 토큰으로 쪼개졌다(oracle-1007 스냅샷 적재 뒤).
  // 이 장이 이 용어를 등록하므로 같은 PDB 로 다시 돌리면 MATCHED 가 되어 실패한다 — 새 PDB 로 돌린다(정의가 「E2E …」 로 시작해
  // snapshot.py import 의 E2E 거르기에 걸린다).
  const COL_INPUT = "곰팡솜뭉";
  const COL_ABBR = `T${RUN}`;
  /** COL-00 이 domainMng 화면에서 만들어 이 장의 컬럼이 참조한다. */
  let DOM_NAME: string;

  const layoutD = new Findings();

  test("TC-DMA-COL-00 준비 — 컬럼이 참조할 도메인을 도메인 관리 화면에서 만든다", async () => {
    DOM_NAME = `E2E 컬럼용 도메인 ${RUN}`;
    await registerTextDomain(page, DOM_NAME, `COLDOM${RUN}`);
  });

  test("TC-DMA-COL-01 컬럼 사전 화면 배치 — 메뉴로 열면 목록·자동 생성·상세가 보인다", async () => {
    await go(page, "columnMng");
    await resetClicks(page);
    await expect(breadcrumb(page)).toContainText("마루 MDM > 용어·도메인 > 컬럼 사전");
    await expect(tid(page, "column-list")).toBeVisible();
    await expect(tid(page, "gen-input")).toHaveValue("");
    await expect(tid(page, "gen-decompose")).toBeDisabled();
    await expect(tid(page, "form-column-name")).toHaveValue("");
    await layoutD.layout(page, "columnMng");
    await snap(page, "dma-columnMng-01-initial");

    await button(page, "조회").click();
    await expect(gridRows(tid(page, "column-list")).first()).toBeVisible({ timeout: T.UI });
    watcher.assertClean("columnMng");
  });

  test("TC-DMA-COL-02 분해 — 사전에 없는 한글 토큰은 UNKNOWN 으로 보이고, 인라인 팝업에서 새 용어를 등록한다", async () => {
    await tid(page, "gen-input").fill(COL_INPUT);
    await tid(page, "gen-decompose").click();
    await expect(tid(page, "token-row-1")).toBeVisible({ timeout: T.UI });
    // FORWARD 방향 UNKNOWN 토큰은 텍스트 "미등록" 이 아니라 [*** 용어 등록] 버튼으로 보인다
    // (columnMng/page.tsx renderAction UNKNOWN 분기 — REVERSE 일 때만 STATUS_TEXT.UNKNOWN 문구를 쓴다).
    await expect(tid(page, "token-placeholder-1")).toContainText("용어 등록");
    await snap(page, "dma-columnMng-02-unknown-token");

    // 토큰 표는 열 최소 폭 합이 표 폭 안에 들어 가로로 넘치지 않는다(15864467, Local-Rules §30) — 가로 스크롤 막대가 마지막 행
    // [용어 등록] 버튼을 덮지 않는다.
    const tokenViewport = tokenRow(page, 1).locator("xpath=ancestor::div[contains(@class,'ag-center-cols-viewport')][1]");
    await expect.poll(() => tokenViewport.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await tid(page, "token-placeholder-1").click(); // "*** 용어 등록"
    await expect(tid(page, "term-pop")).toBeVisible({ timeout: T.UI });
    await expect(tid(page, "term-pop-term-name")).toHaveValue(COL_INPUT);
    await tid(page, "term-pop-definition").fill("E2E 컬럼 사전 인라인 등록 용어");
    await tid(page, "term-pop-eng-name").fill("JudgmentValue");
    // [약어 제안]은 영문명을 실어 서버에 물은 제안값으로 약어 칸을 채운다(termRegPop handleSuggest). 사람처럼 그 제안이 칸에 들어온 뒤
    // 직접 정한 값으로 한 번 고쳐 쓴다 — 응답 전에 쓰면 뒤늦은 제안이 덮는다(최종 실행 7회차, trace). 제안값이 ENG_ABBR 형식에 안
    // 맞을 수도 있어 어차피 직접 정한 값으로 덮는다.
    const suggested = page.waitForResponse(
      (r) => r.url().includes("/oasis/termRegPop/search") && r.request().method() === "POST" && (r.request().postData() ?? "").includes("JudgmentValue"),
    );
    await tid(page, "term-pop-abbr-suggest").click();
    expect((await suggested).ok()).toBe(true);
    await expect(tid(page, "term-pop-abbr")).not.toHaveValue("");
    await expect(tid(page, "term-pop-abbr-suggest")).toBeEnabled();
    await tid(page, "term-pop-abbr").fill(COL_ABBR);
    await expect(tid(page, "term-pop-abbr")).toHaveValue(COL_ABBR);
    await snapModal(page, "dma-columnMng-02-termRegPop");
    await tid(page, "term-pop-reg").click();
    await expect(tid(page, "term-pop")).toHaveCount(0, { timeout: T.UI });

    await expect(tokenRow(page, 1)).toContainText("등록됨", { timeout: T.UI });
    await tid(page, "gen-apply").click();
    await expect(tid(page, "form-column-name")).not.toHaveValue("");
    await expect(tid(page, "form-phys-name")).toHaveValue(COL_ABBR);

    {
      // 도메인 칸은 검색형 입력이다 — 이름을 넣고 Enter 로 확정하면 서버가 하나로 정해 바로 적용한다.
      const domainInput = tid(page, "form-domain");
      await domainInput.fill(DOM_NAME);
      await domainInput.press("Enter");
      await expect(domainInput).toHaveValue(DOM_NAME);
      // 확정 검색이 끝나기 전에 [찾기]를 눌러도 칸을 떠나며 시작된 확정 검색은 물러져 찾기 팝업이 닫히지 않는다(20bbb905).
      // [찾기] 는 빈 검색어로 도메인 찾기 팝업을 연다 — 검색해 고르면 칸에 그 도메인이 들어간다(DomainField).
      await tid(page, "form-domain-find").click();
      await expect(tid(page, "form-domain-box")).toBeVisible();
      await tid(page, "form-domain-box-keyword").fill(DOM_NAME);
      await tid(page, "form-domain-box-search").click();
      await tid(page, `form-domain-box-pick-COLDOM${RUN}`).click();
      await expect(page.locator('[data-testid="form-domain-box"]')).toHaveCount(0);
      await expect(domainInput).toHaveValue(DOM_NAME);
    }
    await layoutD.layout(page, "columnMng 등록 입력 중");
    await snap(page, "dma-columnMng-02-applied");

    // 시스템별 실제 필드명 — 행추가로 넣고 선택해 행삭제까지 눌러 본다(SYSTEM 칸 값 입력은 ag-grid
    // 내장 select 편집기 자동화가 불안정해 값은 넣지 않는다 — 보고서 관찰 항목).
    const sysGrid = tid(page, "system-grid");
    await screen(page).getByRole("button", { name: "행추가" }).click();
    await expect(gridRows(sysGrid)).toHaveCount(1, { timeout: 10_000 });
    await sysGrid.locator('.ag-cell[col-id="note"]').first().click();
    await screen(page).getByRole("button", { name: "행삭제" }).click();
    await expect(gridRows(sysGrid)).toHaveCount(0, { timeout: 10_000 });
    watcher.assertClean("columnMng");
  });

  test("TC-DMA-COL-03 저장 — 컬럼을 저장하면 목록에 반영된다", async () => {
    await button(page, "저장").click();
    await expectToast(page, "저장했습니다");
    // 컬럼 목록도 여러 실행이 쌓이면 커진다(가상 스크롤) — 검색어로 좁혀 확실히 본다.
    await tid(page, "column-search-keyword").fill(COL_ABBR);
    await button(page, "조회").click();
    await expect(gridRow(tid(page, "column-list"), COL_ABBR, "physName")).toHaveCount(1, { timeout: T.UI });
    watcher.assertClean("columnMng");
  });

  test("TC-DMA-COL-04 중복 검사 — 같은 이름을 다시 분해하면 방금 저장한 컬럼이 뜨고, [열기]로 불러온다", async () => {
    await tid(page, "gen-input").fill(COL_INPUT);
    await tid(page, "gen-decompose").click();
    await expect(tid(page, "gen-duplicates")).toContainText(COL_ABBR, { timeout: T.UI });
    await snap(page, "dma-columnMng-03-duplicate");
    await tid(page, "gen-duplicates").getByRole("button", { name: "열기" }).first().click();
    await expect(tid(page, "form-phys-name")).toHaveValue(COL_ABBR, { timeout: T.UI });
    watcher.assertClean("columnMng");
  });

  test("TC-DMA-COL-05 역분해 — 물리명(약어)을 넣으면 등록된 용어로 역으로 풀린다", async () => {
    await tid(page, "gen-direction").selectOption("REVERSE");
    await tid(page, "gen-input").fill(COL_ABBR);
    await tid(page, "gen-decompose").click();
    await expect(tokenRow(page, 1)).toContainText("등록됨", { timeout: T.UI });
    await expect(tid(page, "gen-preview")).toContainText(COL_INPUT);
    await layoutD.layout(page, "columnMng 역분해");
    await snap(page, "dma-columnMng-04-reverse");
    watcher.assertClean("columnMng");
  });

  test("TC-DMA-COL-06 신규 — 폼이 비워지고 자동 생성 영역도 초기화된다", async () => {
    await tid(page, "gen-direction").selectOption("FORWARD");
    await button(page, "신규").click();
    await expect(tid(page, "form-column-name")).toHaveValue("");
    await expect(tid(page, "form-phys-name")).toHaveValue("");
    await expect(tid(page, "gen-input")).toHaveValue("");
    await assertAllButtonsPressed(page, "columnMng");
    watcher.assertClean("columnMng");
  });

  test("TC-DMA-COL-99 배치 모음 — 이 장에서 본 컬럼 사전 화면 상태에 배치 위반이 없다", async () => {
    layoutD.assertEmpty("D 컬럼 사전");
  });
});

// ═══════════════════════════ E. 연결·권한 ═══════════════════════════

test.describe("dma 화면 연결·권한", () => {
  // 서로 기대지 않는다(dmc B 장과 같은 규칙) — 각 테스트가 자기 세션·자기 데이터를 스스로 만든다.
  test.describe.configure({ mode: "default" });

  test("TC-DMA-SAM-01 MDM 샘플 — 메뉴로 열리고 배치가 깨지지 않는다(설계상 API 호출 없는 빈 화면)", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "std", testInfo);
    try {
      await openMenu(page, TRAIL(MENU.mdmSample), "mdmSample");
      await expect(breadcrumb(page)).toContainText("마루 MDM > 용어·도메인 > MDM 샘플");
      await checkLayout(page, "mdmSample");
      await snap(page, "dma-mdmSample-01");
      watcher.assertClean("mdmSample");
    } finally {
      await page.context().close();
    }
  });

  test("TC-DMA-DEL-01 단위 삭제 거부 — 도메인이 참조 중인 단위는 삭제할 수 없다", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "std", testInfo);
    try {
      const unitCode = uid("DU1");
      await registerNewDimensionUnit(page, unitCode, uid("DELDIM1"));
      await registerQtyDomain(page, `E2E 삭제거부 도메인 ${RUN}`, `DELQTY${RUN}`, unitCode);

      await go(page, "unitMng");
      await searchField(page, "검색어").fill(unitCode);
      await button(page, "조회").click();
      await gridRow(panelByTitle(page, "단위 목록"), unitCode, "unitCode").click();
      await button(page, "삭제").click();
      await expectErrorModal(page, "다른 데이터(도메인)가 이 단위를 참조하고 있어 삭제할 수 없습니다", "dma-del-01-blocked");
      await expect(gridRow(panelByTitle(page, "단위 목록"), unitCode, "unitCode")).toHaveCount(1, { timeout: T.UI });
      watcher.assertClean("unitMng");
    } finally {
      await page.context().close();
    }
  });

  test("TC-DMA-DEL-02 단위 삭제 성공 — 참조 없는 단위는 지우면 목록에서 빠진다", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "std", testInfo);
    try {
      const unitCode = uid("DU2");
      await registerNewDimensionUnit(page, unitCode, uid("DELDIM2"));
      await searchField(page, "검색어").fill(unitCode);
      await button(page, "조회").click();
      await gridRow(panelByTitle(page, "단위 목록"), unitCode, "unitCode").click();
      await button(page, "삭제").click();
      await expect(gridRow(panelByTitle(page, "단위 목록"), unitCode, "unitCode")).toHaveCount(0, { timeout: T.UI });
      watcher.assertClean("unitMng");
    } finally {
      await page.context().close();
    }
  });

  // RO-00(준비)이 만든 값을 RO-01 이 읽는다 — default 모드라 실패해도 다음 테스트는 돈다(선언 순서대로 실행).
  let roUnit: string;
  let roTerm: string;
  let roDomain: string;

  test("TC-DMA-RO-00 준비(표준관리자) — 담당자가 조회할 단위·용어·도메인을 만든다", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "std", testInfo);
    try {
      roUnit = uid("ROUN");
      await registerNewDimensionUnit(page, roUnit, uid("RODIM"));
      roTerm = kw("담당자조회용어");
      await registerSimpleTerm(page, roTerm, "E2E 읽기 전용 시험용 용어");
      roDomain = `E2E 읽기전용 도메인 ${RUN}`;
      await registerTextDomain(page, roDomain, `RODOM${RUN}`);
      watcher.assertClean("dma(std 준비)");
    } finally {
      await page.context().close();
    }
  });

  test("TC-DMA-RO-01 담당자(stw)는 dma 를 조회만 한다 — 등록·저장·삭제·분해 저장이 막힌다", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "stw", testInfo);
    try {
      // unitMng — 조회는 되고 등록·저장·삭제는 막힌다.
      await openMenu(page, TRAIL(MENU.unitMng), "unitMng");
      await expect(button(page, "조회")).toBeEnabled({ timeout: T.LONG });
      await searchField(page, "검색어").fill(roUnit);
      await button(page, "조회").click();
      await expect(gridRow(panelByTitle(page, "단위 목록"), roUnit, "unitCode")).toHaveCount(1, { timeout: T.UI });
      await expect(button(page, "단위 등록")).toBeDisabled();
      await gridRow(panelByTitle(page, "단위 목록"), roUnit, "unitCode").click();
      await expect(button(page, "저장")).toBeDisabled();
      await expect(button(page, "삭제")).toBeDisabled();
      // 환산 계산기(compare)는 READ 등급에 포함돼 있어 담당자도 쓸 수 있다(설계, 결함 아님). [계산] 버튼은 01304edc 로 없어지고
      // 값·입력 단위를 넣으면 바로 계산한다 — 서버 환산값이 보이는 것까지 본다.
      // 목록에서 단위를 고르면 그 단위가 입력 단위로 채워진다(A-PREVIEW·B-005) — 콤보를 다시 고르지 않는다(같은 항목을 누르면 풀린다).
      await expect(calcUnit(page)).toHaveValue(new RegExp(`^${escapeRe(roUnit)} `));
      await calcValue(page).fill("1");
      await expect(calcCell(page, roUnit)).toHaveText("1", { timeout: T.UI });
      await snap(page, "dma-ro-unitMng");

      // termMng — 조회는 되고 등록·저장·삭제·재인코딩 배치는 막힌다.
      await openMenu(page, TRAIL(MENU.termMng), "termMng");
      await searchField(page, "검색어").fill(roTerm);
      await button(page, "조회").click();
      await expect(gridRow(panelByTitle(page, "용어 목록"), roTerm, "termName")).toHaveCount(1, { timeout: T.UI });
      await expect(button(page, "등록")).toBeDisabled();
      await expect(button(page, "저장")).toBeDisabled();
      await expect(button(page, "삭제")).toBeDisabled();
      await expect(screen(page).getByRole("button", { name: "재인코딩 배치 실행" })).toBeDisabled();
      await snap(page, "dma-ro-termMng");

      // domainMng — 조회는 되고 등록 버튼은 막히며, 도메인검증·저장 버튼 자체가 나타나지 않는다(읽기 전용 모드).
      await openMenu(page, TRAIL(MENU.domainMng), "domainMng");
      await searchField(page, "검색어").fill(roDomain);
      await button(page, "조회").click();
      await expect(domainRow(page, roDomain)).toHaveCount(1, { timeout: T.UI });
      await expect(screen(page).getByRole("button", { name: "도메인 등록", exact: true })).toBeDisabled();
      await domainRow(page, roDomain).click();
      await expect(screen(page).getByLabel("도메인명", { exact: true })).toHaveValue(roDomain, { timeout: T.UI });
      await expect(screen(page).getByLabel("도메인명", { exact: true })).toBeDisabled();
      await expect(screen(page).getByRole("button", { name: "도메인검증" })).toHaveCount(0);
      await expect(screen(page).getByRole("button", { name: "저장", exact: true })).toHaveCount(0);
      await snap(page, "dma-ro-domainMng");

      // columnMng — 첫 진입은 조회하지 않는다(cf4fbb05). [조회]로 목록을 받아 첫 행으로 조회를 확인하고,
      // 신규·저장이 막혀 있는지 본다(분해는 READ 등급이라 켜져 있다 — 설계).
      await openMenu(page, TRAIL(MENU.columnMng), "columnMng");
      await expect(gridRows(tid(page, "column-list"))).toHaveCount(0);
      await button(page, "조회").click();
      await expect(gridRows(tid(page, "column-list")).first()).toBeVisible({ timeout: T.UI });
      await expect(button(page, "신규")).toBeDisabled();
      await expect(button(page, "저장")).toBeDisabled();
      await tid(page, "gen-input").fill("아무값");
      await expect(tid(page, "gen-decompose")).toBeEnabled();
      await snap(page, "dma-ro-columnMng");

      watcher.assertClean("dma(stw)");
    } finally {
      await page.context().close();
    }
  });
});
