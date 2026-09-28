import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  RUN,
  Watcher,
  assertAllButtonsPressed,
  breadcrumb,
  button,
  checkLayout,
  escapeRe,
  expectToast,
  gridRow,
  gridRowCount,
  modal,
  openAs,
  openMenu,
  resetClicks,
  screen,
  snap,
  tid,
  uid,
  waitIdle,
} from "./support";

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
 * 이유가 없다. 주 DB 에 남은 시험 데이터는 `tools/e2e-clean-data.sh --apply` 로 접두 `E2E` 기준 한 번에 지운다.
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

async function go(page: Page, id: ScreenId) {
  await openMenu(page, TRAIL(MENU[id]), id);
}

/** 배치·표시 검사 기록 — 검사는 그 상태에서 바로 하되 단언은 장 끝의 "-99" 테스트가 한다(dmd 선례). */
class Findings {
  readonly items: string[] = [];
  async layout(page: Page, label: string, opts?: Parameters<typeof checkLayout>[2]) {
    try {
      await checkLayout(page, label, opts);
    } catch (e) {
      this.items.push(`${label}\n${(e as Error).message.split("\n").slice(0, 30).join("\n")}`);
      await snap(page, `dma-layout-${label.replace(/[^\w가-힣-]+/g, "_")}`);
    }
  }
  assertEmpty(chapter: string) {
    expect(this.items, `${chapter}: 화면 배치 위반(스크린샷: .out/screens/dma-layout-*)`).toEqual([]);
  }
}

const errorBody = (page: Page) => page.locator(".error-modal__body:visible");

/** 모달이 다 떠오른 뒤(열림 애니메이션 끝) 찍는다. */
async function snapModal(page: Page, name: string) {
  const m = modal(page);
  await expect(m).toBeVisible();
  await expect
    .poll(() => m.evaluate((el) => Number(getComputedStyle(el).opacity) * (el.getAnimations().length ? 0 : 1)))
    .toBe(1);
  await snap(page, name);
}

async function expectErrorModal(page: Page, text: string | RegExp, shot?: string) {
  await expect(errorBody(page)).toContainText(text, { timeout: 20_000 });
  if (shot) await snapModal(page, shot);
  await modal(page).getByRole("button", { name: "확인", exact: true }).click();
  await expect(errorBody(page)).toHaveCount(0);
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
 * ag-grid 가로 스크롤을 맨 왼쪽으로 되돌린다(dmc codeItemEdit 선례). domainMng 의 도메인 목록은 칸이 8개로
 * 넓어서, 행 전체(.ag-row)를 클릭하면 Playwright 가 그 행의 가운데를 보이려고 그리드를 오른쪽으로 스크롤할
 * 때가 있다 — 그러면 맨 왼쪽 DOMAIN_NAME 칸이 가상화로 DOM 에서 빠져 다음 gridRow() 조회가 0건이 된다.
 */
async function scrollGridLeft(grid: Locator) {
  const hscroll = grid.locator(".ag-body-horizontal-scroll-viewport");
  if (await hscroll.count()) await hscroll.first().evaluate((el) => (el.scrollLeft = 0));
}

/**
 * 검색어로 이미 좁힌 목록에 행이 있는지 확인한다. domainMng 목록처럼 칸이 8개로 넓으면 scrollLeft 를
 * 되돌려도(scrollGridLeft) 다시 그려질 때 오른쪽으로 밀리는 경우가 실측에서 있어, 특정 칸(DOMAIN_NAME)
 * 텍스트 대신 행 수만 본다 — 검색으로 이미 그 키워드로만 걸렀으니 "1건 이상" = 그 값이 있다는 뜻이다.
 */
async function expectSearchedRowExists(grid: Locator) {
  await expect(async () => {
    expect(await gridRowCount(grid)).toBeGreaterThanOrEqual(1);
  }).toPass({ timeout: 20_000 });
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

/** unitMng — 새 차원의 첫 단위 하나를 등록한다(기준 단위=자기 자신, 계수=1). */
async function registerNewDimensionUnit(page: Page, unitCode: string, dimension: string) {
  await go(page, "unitMng");
  await button(page, "단위 등록").click();
  await field(page, "단위 코드 *").fill(unitCode);
  const dim = field(page, "차원 *");
  await dim.click();
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
  await expect(screen(page).getByText(/검사 통과/)).toBeVisible({ timeout: 20_000 });
  await screen(page).getByRole("button", { name: "저장", exact: true }).click();
  await expectToast(page, "저장했습니다");
  await verifyListedAfterSearch(page, "도메인 목록", domainName, "DOMAIN_NAME");
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
  await expect(screen(page).getByText(/검사 통과|검사 실패/)).toBeVisible({ timeout: 20_000 });
  await screen(page).getByRole("button", { name: "저장", exact: true }).click();
  await expectToast(page, "저장했습니다");
  await verifyListedAfterSearch(page, "도메인 목록", domainName, "DOMAIN_NAME");
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
    const dim = field(page, "차원 *");
    await dim.click();
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
    await expect(gridRow(panelByTitle(page, "단위 목록"), U1, "unitCode")).toHaveCount(1, { timeout: 20_000 });
    watcher.assertClean("unitMng");
  });

  test("TC-DMA-UNT-04 등록(C) — 같은 차원을 고르면 기준 단위가 자동으로 채워지고 계수만 입력한다", async () => {
    await button(page, "단위 등록").click();
    await field(page, "단위 코드 *").fill(U2);
    const dim = field(page, "차원 *");
    await dim.click();
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
    await expect(gridRow(panelByTitle(page, "단위 목록"), U2, "unitCode")).toHaveCount(1, { timeout: 20_000 });
    watcher.assertClean("unitMng");
  });

  test("TC-DMA-UNT-05 조회(R) — 단위 코드·차원 조건으로 방금 만든 단위를 찾는다", async () => {
    await searchField(page, "검색어").fill(U1);
    await button(page, "조회").click();
    const list = panelByTitle(page, "단위 목록");
    await expect(gridRow(list, U1, "unitCode")).toHaveCount(1, { timeout: 20_000 });
    await expect(gridRow(list, U2, "unitCode")).toHaveCount(0);
    await searchField(page, "검색어").fill("");
    await searchField(page, "차원").selectOption(DIM1);
    await button(page, "조회").click();
    await expect(gridRow(list, U1, "unitCode")).toHaveCount(1, { timeout: 20_000 });
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
    await expect(gridRow(list, U2, "unitCode").locator('.ag-cell[col-id="factor"]')).toHaveText("2000", { timeout: 20_000 });
    watcher.assertClean("unitMng");
  });

  test("TC-DMA-UNT-07 환산 미리보기 — 값·단위 두 개를 넣고 계산하면 서버 응답을 그대로 보인다", async () => {
    await screen(page).getByRole("button", { name: "계산" }).click();
    await expectErrorModal(page, "환산할 값과 단위 두 개를 모두 입력하세요", "dma-unitMng-07-required");

    await field(page, "값").fill("2");
    await field(page, "입력 단위").fill(U1);
    await field(page, "표시 단위").fill(U2);
    await screen(page).getByRole("button", { name: "계산" }).click();
    await expect(tid(page, "convert-preview-result")).toBeVisible({ timeout: 20_000 });
    await layoutA.layout(page, "unitMng 환산 미리보기");
    await snap(page, "dma-unitMng-07-preview");
    watcher.assertClean("unitMng");
  });

  test("TC-DMA-UNT-08 독립 차원 단위(U3) — 다른 차원끼리는 변환할 수 없다", async () => {
    await button(page, "단위 등록").click();
    await field(page, "단위 코드 *").fill(U3);
    const dim = field(page, "차원 *");
    await dim.click();
    await dim.fill(DIM3);
    await screen(page).locator(".form-combobox-create").click();
    await button(page, "저장").click();
    await searchField(page, "검색어").fill(U3);
    await button(page, "조회").click();
    await expect(gridRow(panelByTitle(page, "단위 목록"), U3, "unitCode")).toHaveCount(1, { timeout: 20_000 });

    await field(page, "값").fill("1");
    await field(page, "입력 단위").fill(U1);
    await field(page, "표시 단위").fill(U3);
    await screen(page).getByRole("button", { name: "계산" }).click();
    await expectErrorModal(page, "서로 다른 차원끼리는 변환할 수 없습니다", "dma-unitMng-08-dimension-mismatch");
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
    await expect(gridRow(list, TERM_A_NAME, "termName")).toHaveCount(1, { timeout: 20_000 });
    await searchField(page, "검색어").fill(`${TERM_A_NAME}_없음`);
    await button(page, "조회").click();
    await expect(gridRow(list, TERM_A_NAME, "termName")).toHaveCount(0, { timeout: 20_000 });
    await searchField(page, "검색어").fill(TERM_A_NAME);
    await button(page, "조회").click();
    await expect(gridRow(list, TERM_A_NAME, "termName")).toHaveCount(1, { timeout: 20_000 });
    watcher.assertClean("termMng");
  });

  test("TC-DMA-TRM-05 수정(U) — 정의를 고쳐 저장하면 다시 조회해도 남는다", async () => {
    await gridRow(panelByTitle(page, "용어 목록"), TERM_A_NAME, "termName").click();
    await field(page, "정의 *").fill("E2E 유사어 추천 원본 용어(수정)");
    await button(page, "저장").click();
    await button(page, "조회").click();
    await gridRow(panelByTitle(page, "용어 목록"), TERM_A_NAME, "termName").click();
    await expect(field(page, "정의 *")).toHaveValue("E2E 유사어 추천 원본 용어(수정)", { timeout: 20_000 });
    watcher.assertClean("termMng");
  });

  test("TC-DMA-TRM-06 유사어 추천 — 표기가 겹치는 새 용어를 적으면 1차 추천이 뜨고 동의어로 확정할 수 있다", async () => {
    await button(page, "등록").click();
    await field(page, "표기 *").fill(TERM_B_NAME);
    const candidate = page.locator('[data-testid^="reco-candidate-1-"]').first();
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
    ).toBeVisible({ timeout: 30_000 });
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
    await expect(gridRow(panelByTitle(page, "용어 목록"), throwaway, "termName")).toHaveCount(0, { timeout: 20_000 });
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
    await expect(screen(page).getByText(/검사 실패/)).toBeVisible({ timeout: 20_000 });
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
    await expect(screen(page).getByText(/검사 통과/)).toBeVisible({ timeout: 20_000 });
    // 부모가 없는 최상위 도메인은 W01(부모와 정의가 같음) 대상이 아니라 곧바로 저장된다(하위 도메인의
    // W01 확인 모달 흐름은 DOM-05 가 다룬다).
    const saveBtn = screen(page).getByRole("button", { name: "저장", exact: true });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await expectToast(page, "저장했습니다");
    await verifyListedAfterSearch(page, "도메인 목록", DOM1_NAME, "DOMAIN_NAME");

    // 저장 뒤 값을 고치면(재검증 전) 저장이 다시 잠긴다 — dmc CNF-03 과 같은 게이팅.
    await screen(page).getByLabel("정의", { exact: true }).fill("E2E 표준관리자 여정 — 최상위 TEXT 도메인(수정)");
    await expect(saveBtn).toBeDisabled();
    await screen(page).getByRole("button", { name: "도메인검증" }).click();
    await expect(screen(page).getByText(/검사 통과/)).toBeVisible({ timeout: 20_000 });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await expectToast(page, "저장했습니다");
    // 토스트만으로는 "직전 저장이 아직 안 사라진 토스트"와 구분이 안 된다 — 다시 조회해 실제로
    // 두 번째 저장(정의 "수정")이 반영됐는지 확인한다.
    await button(page, "조회").click();
    await gridRow(panelByTitle(page, "도메인 목록"), DOM1_NAME, "DOMAIN_NAME").click();
    await scrollGridLeft(panelByTitle(page, "도메인 목록"));
    await expect(screen(page).getByLabel("정의", { exact: true }))
      .toHaveValue("E2E 표준관리자 여정 — 최상위 TEXT 도메인(수정)", { timeout: 20_000 });
    watcher.assertClean("domainMng");
  });

  test("TC-DMA-DOM-04 조회(R) — 검색어·종류 조건으로 방금 만든 도메인을 찾는다", async () => {
    await searchField(page, "검색어").fill(DOM1_NAME);
    await button(page, "조회").click();
    const tree = panelByTitle(page, "도메인 목록");
    await expectSearchedRowExists(tree);
    await searchField(page, "종류").selectOption("QTY");
    await button(page, "조회").click();
    await expect(gridRow(tree, DOM1_NAME, "DOMAIN_NAME")).toHaveCount(0, { timeout: 20_000 });
    await searchField(page, "종류").selectOption("");
    await searchField(page, "검색어").fill("");
    await button(page, "조회").click();
    watcher.assertClean("domainMng");
  });

  test("TC-DMA-DOM-05 하위 도메인 등록 — 부모와 정의가 같으면 경고 확인이 뜨고, [취소]는 아무것도 바꾸지 않는다", async () => {
    await gridRow(panelByTitle(page, "도메인 목록"), DOM1_NAME, "DOMAIN_NAME").click();
    await scrollGridLeft(panelByTitle(page, "도메인 목록"));
    await expect(screen(page).getByLabel("도메인명", { exact: true })).toHaveValue(DOM1_NAME, { timeout: 20_000 });
    await screen(page).getByRole("button", { name: "하위 도메인 등록" }).click();
    await expect(screen(page).getByText("기본 속성 — 하위 도메인 신규")).toBeVisible();
    await expect(screen(page).getByLabel("종류", { exact: true })).toBeDisabled();
    await expect(screen(page).getByLabel("종류", { exact: true })).toHaveValue("TEXT");

    await screen(page).getByLabel("도메인명", { exact: true }).fill(DOM2_NAME);
    await screen(page).getByLabel("표준명", { exact: true }).fill(DOM2_STD);
    await screen(page).getByRole("button", { name: "도메인검증" }).click();
    await expect(screen(page).getByText(/검사 통과/)).toBeVisible({ timeout: 20_000 });

    // 부모(D1)와 정의가 같아(둘 다 규칙 없음) W01 경고 — [저장] 을 누르면 "그래도 저장할까요?" 모달이 뜬다.
    const saveBtn = screen(page).getByRole("button", { name: "저장", exact: true });
    await saveBtn.click();
    const m = modal(page);
    await expect(m).toContainText("부모와 정의가 같습니다");
    await snapModal(page, "dma-domainMng-05-w01-confirm");
    await m.getByRole("button", { name: "취소", exact: true }).click();
    await expect(m).toBeHidden();
    await expect(gridRow(panelByTitle(page, "도메인 목록"), DOM2_NAME, "DOMAIN_NAME")).toHaveCount(0);

    await saveBtn.click();
    await expect(modal(page)).toContainText("부모와 정의가 같습니다");
    await modal(page).getByRole("button", { name: "확인", exact: true }).click();
    await expectToast(page, "저장했습니다");
    await verifyListedAfterSearch(page, "도메인 목록", DOM2_NAME, "DOMAIN_NAME");
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
    await screen(page).getByLabel("케이스 입력 1", { exact: true }).fill("10");
    await screen(page).getByLabel("케이스 기대 1", { exact: true }).selectOption("true");
    await screen(page).getByLabel("케이스 메모 1", { exact: true }).fill("E2E 케이스");
    await layoutC.layout(page, "domainMng QTY 등록 입력 중");
    await snap(page, "dma-domainMng-06-qty");

    await screen(page).getByRole("button", { name: "도메인검증" }).click();
    await expect(screen(page).getByText(/검사 통과|검사 실패/)).toBeVisible({ timeout: 20_000 });
    // 최상위(부모 없음) 도메인이라 W01 경고 없이 곧바로 저장된다.
    await screen(page).getByRole("button", { name: "저장", exact: true }).click();
    await expectToast(page, "저장했습니다");
    await verifyListedAfterSearch(page, "도메인 목록", DOM3_NAME, "DOMAIN_NAME");

    // 영향도 패널 — 지금까지는 참조가 없어 표가 비어 있어도 렌더는 된다.
    await expect(screen(page).locator(".domain-mng__impact")).toBeVisible();
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

  const COL_INPUT = kw("판정값"); // 공백 없는 한 덩어리 → 토큰 1개, 사전에 없어 UNKNOWN.
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
    await expect(tid(page, "column-list").locator(".ag-center-cols-container .ag-row").first()).toBeVisible({ timeout: 20_000 });
    watcher.assertClean("columnMng");
  });

  test("TC-DMA-COL-02 분해 — 사전에 없는 한글 토큰은 UNKNOWN 으로 보이고, 인라인 팝업에서 새 용어를 등록한다", async () => {
    await tid(page, "gen-input").fill(COL_INPUT);
    await tid(page, "gen-decompose").click();
    await expect(tid(page, "token-row-1")).toBeVisible({ timeout: 20_000 });
    // FORWARD 방향 UNKNOWN 토큰은 텍스트 "미등록" 이 아니라 [*** 용어 등록] 버튼으로 보인다
    // (columnMng/page.tsx renderAction UNKNOWN 분기 — REVERSE 일 때만 STATUS_TEXT.UNKNOWN 문구를 쓴다).
    await expect(tid(page, "token-placeholder-1")).toContainText("용어 등록");
    await snap(page, "dma-columnMng-02-unknown-token");

    await tid(page, "token-placeholder-1").click(); // "*** 용어 등록"
    await expect(tid(page, "term-pop")).toBeVisible({ timeout: 20_000 });
    await expect(tid(page, "term-pop-term-name")).toHaveValue(COL_INPUT);
    await tid(page, "term-pop-definition").fill("E2E 컬럼 사전 인라인 등록 용어");
    await tid(page, "term-pop-eng-name").fill("JudgmentValue");
    await tid(page, "term-pop-abbr-suggest").click();
    await waitIdle(page);
    // 제안 응답이 waitIdle 직후에도 뒤늦게 칸을 덮어쓸 때가 있어(관찰) — 내가 정한 값이 그대로 남을 때까지
    // 다시 채운다. 제안값이 ENG_ABBR 형식에 안 맞을 수도 있어 어차피 직접 정한 값으로 덮어야 한다.
    await expect(async () => {
      await tid(page, "term-pop-abbr").fill(COL_ABBR);
      await expect(tid(page, "term-pop-abbr")).toHaveValue(COL_ABBR);
    }).toPass({ timeout: 5_000 });
    await snapModal(page, "dma-columnMng-02-termRegPop");
    await tid(page, "term-pop-reg").click();
    await expect(tid(page, "term-pop")).toHaveCount(0, { timeout: 20_000 });

    await expect(tid(page, "token-row-1")).toContainText("등록됨", { timeout: 20_000 });
    await tid(page, "gen-apply").click();
    await expect(tid(page, "form-column-name")).not.toHaveValue("");
    await expect(tid(page, "form-phys-name")).toHaveValue(COL_ABBR);

    {
      const domainSelect = tid(page, "form-domain");
      const optionValue = await domainSelect.locator("option", { hasText: DOM_NAME }).first().getAttribute("value");
      await domainSelect.selectOption(optionValue!);
    }
    await layoutD.layout(page, "columnMng 등록 입력 중");
    await snap(page, "dma-columnMng-02-applied");

    // 시스템별 실제 필드명 — 행추가로 넣고 선택해 행삭제까지 눌러 본다(SYSTEM 칸 값 입력은 ag-grid
    // 내장 select 편집기 자동화가 불안정해 값은 넣지 않는다 — 보고서 관찰 항목).
    const sysGrid = tid(page, "system-grid");
    await screen(page).getByRole("button", { name: "행추가" }).click();
    await expect(sysGrid.locator(".ag-center-cols-container .ag-row")).toHaveCount(1, { timeout: 10_000 });
    await sysGrid.locator('.ag-cell[col-id="note"]').first().click();
    await screen(page).getByRole("button", { name: "행삭제" }).click();
    await expect(sysGrid.locator(".ag-center-cols-container .ag-row")).toHaveCount(0, { timeout: 10_000 });
    watcher.assertClean("columnMng");
  });

  test("TC-DMA-COL-03 저장 — 컬럼을 저장하면 목록에 반영된다", async () => {
    await button(page, "저장").click();
    await expectToast(page, "저장했습니다");
    // 컬럼 목록도 여러 실행이 쌓이면 커진다(가상 스크롤) — 검색어로 좁혀 확실히 본다.
    await tid(page, "column-search-keyword").fill(COL_ABBR);
    await button(page, "조회").click();
    await expect(gridRow(tid(page, "column-list"), COL_ABBR, "physName")).toHaveCount(1, { timeout: 20_000 });
    watcher.assertClean("columnMng");
  });

  test("TC-DMA-COL-04 중복 검사 — 같은 이름을 다시 분해하면 방금 저장한 컬럼이 뜨고, [열기]로 불러온다", async () => {
    await tid(page, "gen-input").fill(COL_INPUT);
    await tid(page, "gen-decompose").click();
    await expect(tid(page, "gen-duplicates")).toContainText(COL_ABBR, { timeout: 20_000 });
    await snap(page, "dma-columnMng-03-duplicate");
    await tid(page, "gen-duplicates").getByRole("button", { name: "열기" }).first().click();
    await expect(tid(page, "form-phys-name")).toHaveValue(COL_ABBR, { timeout: 20_000 });
    watcher.assertClean("columnMng");
  });

  test("TC-DMA-COL-05 역분해 — 물리명(약어)을 넣으면 등록된 용어로 역으로 풀린다", async () => {
    await tid(page, "gen-direction").selectOption("REVERSE");
    await tid(page, "gen-input").fill(COL_ABBR);
    await tid(page, "gen-decompose").click();
    await expect(tid(page, "token-row-1")).toContainText("등록됨", { timeout: 20_000 });
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
      await expect(gridRow(panelByTitle(page, "단위 목록"), unitCode, "unitCode")).toHaveCount(1, { timeout: 20_000 });
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
      await expect(gridRow(panelByTitle(page, "단위 목록"), unitCode, "unitCode")).toHaveCount(0, { timeout: 20_000 });
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
      await expect(button(page, "조회")).toBeEnabled({ timeout: 30_000 });
      await searchField(page, "검색어").fill(roUnit);
      await button(page, "조회").click();
      await expect(gridRow(panelByTitle(page, "단위 목록"), roUnit, "unitCode")).toHaveCount(1, { timeout: 20_000 });
      await expect(button(page, "단위 등록")).toBeDisabled();
      await gridRow(panelByTitle(page, "단위 목록"), roUnit, "unitCode").click();
      await expect(button(page, "저장")).toBeDisabled();
      await expect(button(page, "삭제")).toBeDisabled();
      // 환산 미리보기(compare)는 READ 등급에 포함돼 있어 담당자도 쓸 수 있다(설계, 결함 아님).
      await expect(screen(page).getByRole("button", { name: "계산" })).toBeEnabled();
      await snap(page, "dma-ro-unitMng");

      // termMng — 조회는 되고 등록·저장·삭제·재인코딩 배치는 막힌다.
      await openMenu(page, TRAIL(MENU.termMng), "termMng");
      await searchField(page, "검색어").fill(roTerm);
      await button(page, "조회").click();
      await expect(gridRow(panelByTitle(page, "용어 목록"), roTerm, "termName")).toHaveCount(1, { timeout: 20_000 });
      await expect(button(page, "등록")).toBeDisabled();
      await expect(button(page, "저장")).toBeDisabled();
      await expect(button(page, "삭제")).toBeDisabled();
      await expect(screen(page).getByRole("button", { name: "재인코딩 배치 실행" })).toBeDisabled();
      await snap(page, "dma-ro-termMng");

      // domainMng — 조회는 되고 등록 버튼은 막히며, 도메인검증·저장 버튼 자체가 나타나지 않는다(읽기 전용 모드).
      await openMenu(page, TRAIL(MENU.domainMng), "domainMng");
      await searchField(page, "검색어").fill(roDomain);
      await button(page, "조회").click();
      await expect(gridRow(panelByTitle(page, "도메인 목록"), roDomain, "DOMAIN_NAME")).toHaveCount(1, { timeout: 20_000 });
      await expect(screen(page).getByRole("button", { name: "도메인 등록", exact: true })).toBeDisabled();
      await gridRow(panelByTitle(page, "도메인 목록"), roDomain, "DOMAIN_NAME").click();
      await expect(screen(page).getByLabel("도메인명", { exact: true })).toHaveValue(roDomain, { timeout: 20_000 });
      await expect(screen(page).getByLabel("도메인명", { exact: true })).toBeDisabled();
      await expect(screen(page).getByRole("button", { name: "도메인검증" })).toHaveCount(0);
      await expect(screen(page).getByRole("button", { name: "저장", exact: true })).toHaveCount(0);
      await snap(page, "dma-ro-domainMng");

      // columnMng — 목록이 늘 채워져 있으니 검색 없이 첫 행으로 조회 확인하고, 신규·저장이 막혀 있는지 본다
      // (분해는 READ 등급이라 켜져 있다 — 설계).
      await openMenu(page, TRAIL(MENU.columnMng), "columnMng");
      await expect(tid(page, "column-list").locator(".ag-center-cols-container .ag-row").first()).toBeVisible({ timeout: 20_000 });
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
