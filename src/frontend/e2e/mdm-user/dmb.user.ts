import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  RUN,
  USERS,
  Watcher,
  answerConfirm,
  assertAllButtonsPressed,
  breadcrumb,
  button,
  checkLayout,
  expectToast,
  gridRow,
  modal,
  openAs,
  openMenu,
  resetClicks,
  screen,
  snap,
  tid,
  uid,
  type LayoutOptions,
} from "./support";

/**
 * 마루 MDM > 레이아웃(dmb) 사용자 여정 E2E.
 *
 * 표준관리자(std)가 화면만으로 전문 헤더 하나(headerMng)와 그 헤더를 쌓은 전문 레이아웃 하나(layoutMng)의
 * 일생을 다룬다. 담당자(stw)는 조회만 되는지 별도로 본다.
 *
 * 구조
 *   A "여정"      — serial. headerMng 에서 헤더 둘을 다 만든 뒤에만 layoutMng 을 연다(카탈로그가 처음 열 때
 *     한 번만 채워지는 한계 — page.tsx ensureCatalog). 여정 끝까지 한 페이지를 공유한다.
 *   B "연결·권한" — 서로 기대지 않는 독립 테스트. 동시 수정 충돌(같은 std 계정 두 탭), 헤더 카탈로그 새로고침
 *     시점, 담당자 읽기 전용을 다룬다.
 * 배치 검사(checkLayout) 위반은 여정을 멈추지 않게 모아 두었다가 TC-DMB-LAY-99 에서 한꺼번에 단언한다.
 *
 * 두 화면 모두 레코드 자체를 지우는 버튼이 없다(헤더·전문 삭제 수단 없음) — "삭제(D)"는 항목 삭제·헤더 빼기·
 * 상수 재정의 비우기로 대신한다(보고서에 관찰로 남긴다).
 */

const TRAIL = (leaf: string) => ["마루 MDM", "레이아웃", leaf];
const MENU = { headerMng: "전문 헤더 정의", layoutMng: "전문 레이아웃" } as const;
type ScreenId = keyof typeof MENU;

async function go(page: Page, id: ScreenId) {
  await openMenu(page, TRAIL(MENU[id]), id);
}

/** 배치 위반을 모은다(여정을 멈추지 않는다). 위반 화면은 스크린샷을 남긴다. */
const layoutIssues: string[] = [];
async function layout(page: Page, label: string, opts?: LayoutOptions) {
  try {
    // dmb 의 오른쪽 패널은 내용이 길어 스스로 스크롤한다(overflowY:auto) — 스크롤된 채로 재면 위(스크롤 밖) 요소의
    // 좌표가 화면 머리 버튼과 겹친 것처럼 보인다(가짜 L3). 재기 전에 이 화면의 스크롤 컨테이너를 맨 위로 되돌린다.
    await page.evaluate(() => {
      const root = [...document.querySelectorAll<HTMLElement>(".portal-shell__tab-page")].find(
        (el) => getComputedStyle(el).display !== "none",
      );
      if (!root) return;
      for (const el of [root, ...root.querySelectorAll<HTMLElement>("*")]) {
        if (el.scrollTop > 0) el.scrollTop = 0;
      }
    });
    await checkLayout(page, label, opts);
  } catch (e) {
    layoutIssues.push(`${label}\n${(e as Error).message.split("\n").slice(0, 30).join("\n")}`);
    await snap(page, `dmb-layout-${label.replace(/[^\w가-힣-]+/g, "_")}`);
  }
}

const errorBody = (page: Page) => page.locator(".error-modal__body:visible");

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
  await answerConfirm(page, "확인");
}

/** SearchArea 의 라벨-only(select) 조회칸 — testid 도 aria-label 도 없다(SearchField.tsx). */
function searchField(page: Page, label: string): Locator {
  return screen(page)
    .locator(".search-field")
    .filter({ has: page.locator(".search-field__label", { hasText: new RegExp(`^${label}$`) }) });
}
async function chooseSearch(page: Page, label: string, value: string) {
  await searchField(page, label).locator("select").selectOption(value);
}

// ── ag-grid 항목 그리드 ──

const headerGrid = (page: Page) => tid(page, "header-items");
const layoutGrid = (page: Page) => tid(page, "layout-items");
const stackGrid = (page: Page) => tid(page, "layout-header-stack");
const itemRow = (grid: Locator, text: string): Locator =>
  grid.locator(".ag-center-cols-container .ag-row").filter({ hasText: text }).first();

/**
 * 세로 가상화로 아직 그려지지 않은 행이면 그리드를 끝까지 스크롤해 그리게 한다 — [헤더 추가] 목록은 값이 쌓일수록
 * (반복 실행 누적 포함) 길어지고, 방금 만든 헤더일수록 ID 순 정렬 맨 아래에 있다.
 */
async function revealRow(grid: Locator, text: string): Promise<Locator> {
  const row = grid.locator(".ag-row").filter({ hasText: text }).first();
  if (await row.count()) return row;
  const viewport = grid.locator(".ag-body-viewport").first();
  await viewport.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(row).toHaveCount(1, { timeout: 10_000 });
  return row;
}

/** 검색 결과 그리드에서 표준 물리명이 정확히 phys 인 행 — 접두어가 겹치는 컬럼(PROD_DT/PLAN_PROD_DT 등)을 가려낸다. */
function columnPickRow(page: Page, phys: string): Locator {
  return tid(page, "column-pick-grid").locator(".ag-row")
    .filter({ has: page.locator('.ag-cell[col-id="PHYS_NAME"]', { hasText: new RegExp(`^${phys}$`) }) }).first();
}

/** 컬럼 사전 검색 팝업으로 항목을 고른다(headerMng·layoutMng 공용 컴포넌트). */
async function pickColumn(page: Page, addTestId: string, phys: string) {
  await tid(page, addTestId).click();
  const pm = tid(page, "column-pick-modal");
  await expect(pm).toBeVisible();
  await tid(page, "column-pick-keyword").fill(phys);
  await tid(page, "column-pick-search").click();
  await columnPickRow(page, phys).click();
  await tid(page, "column-pick-select").click();
  await expect(pm).toBeHidden();
}

/** 헤더 항목 행 손잡이를 끌어 옮긴다(순서 재계산은 화면 즉시). */
async function dragRow(page: Page, grid: Locator, fromText: string, toText: string) {
  const handle = itemRow(grid, fromText).locator(".ag-row-drag");
  const target = itemRow(grid, toText);
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("드래그 손잡이·대상 행 위치를 얻지 못했다");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + 4, { steps: 10 });
  await page.mouse.move(from.x + from.width / 2, to.y + 2, { steps: 5 });
  await page.mouse.up();
}

test.describe("dmb 레이아웃 사용자 여정", () => {
  test.describe.configure({ mode: "serial" });

  const EAI1 = `E2H${RUN}`;
  const HDR1 = `E2E 헤더1 ${RUN}`;
  const HDR2 = `E2E 헤더2 ${RUN}`;
  const LAYOUT_NAME = `E2E 전문 ${RUN}`;

  let page: Page;
  let watcher: Watcher;
  let layoutId = "";

  test.beforeAll(async ({ browser }, testInfo) => {
    ({ page, watcher } = await openAs(browser, "std", testInfo));
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  // ═══════════════════════ headerMng — 전문 헤더 정의 ═══════════════════════

  test("TC-DMB-HDR-01 전문 헤더 정의 화면 배치 — 메뉴로 열면 목록·안내가 보인다", async () => {
    await go(page, "headerMng");
    await resetClicks(page);
    await expect(breadcrumb(page)).toContainText("마루 MDM > 레이아웃 > 전문 헤더 정의");
    await expect(tid(page, "header-list")).toBeVisible();
    await expect(screen(page).getByText("목록에서 헤더를 선택하거나 [신규] 를 누르세요.")).toBeVisible();
    await expect(button(page, "조회")).toBeEnabled();
    await expect(button(page, "신규")).toBeEnabled();
    await expect(button(page, "저장")).toBeDisabled();
    await layout(page, "headerMng 초기");
    await snap(page, "dmb-headerMng-01-initial");
    watcher.assertClean("headerMng");
  });

  test("TC-DMB-HDR-02 필수값 — 이름 없이 저장하면 알아듣기 쉬운 문구로 막힌다", async () => {
    await button(page, "신규").click();
    await expect(screen(page).getByText("헤더 상세 — 신규")).toBeVisible();
    await button(page, "저장").click();
    await expectErrorModal(page, /헤더 저장 거부.*헤더 이름이 비었다/, "dmb-headerMng-02-required");
    watcher.assertClean("headerMng");
  });

  test("TC-DMB-HDR-03 등록(C) — 이름·EAI·항목 4종(AUTO·CONST·DATA·FILLER)을 넣고 드래그로 순서를 바꿔 저장한다", async () => {
    await tid(page, "header-form-name").fill(HDR1);
    // 기존 EAI 코드를 넣어 보면 "기존 EAI" 안내로 바뀐다 — 저장하지 않고 내 코드로 바꾼다(공용 GLUE 오염 금지).
    await tid(page, "header-form-eai").fill("GLUE");
    await expect(screen(page).getByText(/기존 EAI — 저장하면 이 헤더가 그 EAI 의 표준 헤더가 됩니다/)).toBeVisible();
    await tid(page, "header-form-eai").fill(EAI1);
    await expect(screen(page).getByText(/새 EAI 로 만듭니다/)).toBeVisible();
    await tid(page, "header-form-eai-name").fill(`E2E EAI ${RUN}`);
    await tid(page, "header-form-encoding").selectOption("UTF-8");
    await tid(page, "header-form-pad-rule").fill("숫자 왼쪽 0, 문자 오른쪽 공백");

    // 컬럼 사전 팝업 — 조회 전 안내(이 화면에서 처음 열 때만 확인할 수 있다 — 팝업은 다시 열어도 지난 검색 상태를 들고 있다).
    await tid(page, "header-item-add-column").click();
    await expect(tid(page, "column-pick-modal")).toContainText("검색어를 넣고 조회하세요");
    await tid(page, "column-pick-keyword").fill("TC_CD");
    await tid(page, "column-pick-search").click();
    await columnPickRow(page, "TC_CD").click();
    await tid(page, "column-pick-select").click();
    await expect(tid(page, "column-pick-modal")).toBeHidden();
    await tid(page, "item-detail-fill-kind").selectOption("AUTO");
    await tid(page, "item-detail-default").selectOption("LAYOUT_ID");
    await pickColumn(page, "header-item-add-column", "SND_FAC_TP");
    await tid(page, "item-detail-fill-kind").selectOption("CONST");
    await tid(page, "item-detail-default").fill("E1");
    await pickColumn(page, "header-item-add-column", "SND_SYS"); // DATA 그대로 — "IF_ID" 는 "EAI_IF_ID" 와 검색어가 겹쳐 피한다.
    await tid(page, "header-item-add-filler").click();
    await tid(page, "item-detail-filler-length").fill("6");

    const grid = headerGrid(page);
    await expect(grid.locator(".ag-center-cols-container .ag-cell[col-id=\"OFFSET\"]")).toHaveText(["0", "8", "12", "22"]);
    await expect(tid(page, "header-length")).toHaveText("28 바이트 (4항목)");
    await snap(page, "dmb-headerMng-03-editing");
    await layout(page, "headerMng 편집 중");

    // 드래그 — FILLER 를 맨 앞으로.
    await dragRow(page, grid, "FILLER", "TC_CD");
    await expect(grid.locator(".ag-center-cols-container .ag-cell[col-id=\"OFFSET\"]")).toHaveText(["0", "6", "14", "18"], { timeout: 10_000 });
    await expect(tid(page, "header-length")).toHaveText("28 바이트 (4항목)");
    await snap(page, "dmb-headerMng-03-dragged");

    await button(page, "저장").click();
    await expectToast(page, "저장했습니다");
    await expect(tid(page, "header-form-name")).toHaveValue(HDR1, { timeout: 30_000 });
    watcher.assertClean("headerMng");
  });

  test("TC-DMB-HDR-04 컬럼 사전 팝업·항목 삭제 — 검색·중복 방지·닫힌 칸·삭제 버튼", async () => {
    // 없는 검색어 안내(조회 전 빈 안내는 TC-DMB-HDR-03 에서 이미 봤다).
    await tid(page, "header-item-add-column").click();
    await tid(page, "column-pick-keyword").fill(`NOPE_${RUN}`);
    await tid(page, "column-pick-search").click();
    await expect(tid(page, "column-pick-empty")).toHaveText("컬럼 사전에 없습니다. 먼저 컬럼 사전에 등재하세요");
    await snap(page, "dmb-headerMng-04-column-empty");

    // 이미 쓴 컬럼은 다시 못 고른다.
    await tid(page, "column-pick-keyword").fill("TC_CD");
    await tid(page, "column-pick-search").click();
    await columnPickRow(page, "TC_CD").click();
    // 안내는 모달 footer(화면 밖 포털)에 있다 — "column-pick-modal" 은 본문만 감싸므로 모달 전체로 본다.
    await expect(modal(page)).toContainText("이미 이 레이아웃에 있는 컬럼입니다");
    await expect(tid(page, "column-pick-select")).toBeDisabled();
    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).last().click();
    await expect(tid(page, "column-pick-modal")).toBeHidden();

    // 임시 FILLER 를 넣어 닫힌 칸 규칙을 보고, 그대로 지운다(H1 은 건드리지 않는다).
    await tid(page, "header-item-add-filler").click();
    await tid(page, "item-detail-filler-length").fill("10");
    for (const id of ["item-detail-default", "item-detail-trans-unit", "item-detail-unit-item", "item-detail-sign",
      "item-detail-zero", "item-detail-implied", "item-detail-width"]) {
      await expect(tid(page, id), id).toBeDisabled();
    }
    await expect(tid(page, "item-detail-filler-length")).toBeEnabled();
    await expect(tid(page, "header-length")).toHaveText("38 바이트 (5항목)");
    await tid(page, "item-detail-fill-kind").selectOption("DATA");
    await expect(tid(page, "item-detail-filler-length")).toHaveValue("");
    await expect(tid(page, "item-detail-filler-length")).toBeDisabled();
    await snap(page, "dmb-headerMng-04-temp-toggled");

    await button(page, "삭제").click();
    await expect(tid(page, "header-length")).toHaveText("28 바이트 (4항목)");

    // 사용 전문 영향도 — 새 헤더는 아직 아무 전문도 안 쓴다.
    await expect(tid(page, "header-usage")).toContainText("이 헤더를 쓰는 전문이 없습니다");
    watcher.assertClean("headerMng");
  });

  test("TC-DMB-HDR-05 조회(R) — 검색어로 좁히고 풀어 방금 만든 헤더를 본다", async () => {
    const list = tid(page, "header-list");
    await tid(page, "header-search-keyword").fill(RUN);
    await tid(page, "header-search-keyword").press("Enter");
    const row = gridRow(list, HDR1, "LAYOUT_NAME");
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await expect(row.locator('.ag-cell[col-id="TOTAL_LENGTH"]')).toHaveText("28");
    await expect(row.locator('.ag-cell[col-id="ITEM_COUNT"]')).toHaveText("4");
    await expect(row.locator('.ag-cell[col-id="EAI_CODE"]')).toHaveText(EAI1);
    await layout(page, "headerMng 목록 채워짐");

    await tid(page, "header-search-keyword").fill(`${RUN}_없음`);
    await button(page, "조회").click();
    await expect(tid(page, "header-list-empty")).toHaveText("조회된 헤더가 없습니다", { timeout: 20_000 });
    await snap(page, "dmb-headerMng-05-empty");

    await tid(page, "header-search-keyword").fill(RUN);
    await button(page, "조회").click();
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    watcher.assertClean("headerMng");
  });

  test("TC-DMB-HDR-06 수정(U) — 인코딩·패딩 규칙을 고쳐 저장하면 다시 조회해도 남는다", async () => {
    await tid(page, "header-form-encoding").selectOption("EUC-KR");
    await tid(page, "header-form-pad-rule").fill("숫자 왼쪽 0, 문자 오른쪽 공백(E2E 수정)");
    await button(page, "저장").click();
    await expectToast(page, "저장했습니다");

    await gridRow(tid(page, "header-list"), HDR1, "LAYOUT_NAME").click();
    await expect(tid(page, "header-form-name")).toHaveValue(HDR1, { timeout: 20_000 });
    await expect(tid(page, "header-form-encoding")).toHaveValue("EUC-KR");
    await expect(tid(page, "header-form-pad-rule")).toHaveValue("숫자 왼쪽 0, 문자 오른쪽 공백(E2E 수정)");
    watcher.assertClean("headerMng");
  });

  test("TC-DMB-HDR-07 사용 전문 영향도(관찰) — 이미 전문에 쌓인 헤더는 사용 전문이 보인다(저장하지 않는다)", async () => {
    // 표본 데이터는 다른 세션이 이름을 바꿀 수 있어(실측: GLUE 공통 헤더가 세션 중 개명됨) 이름을 박지 않고,
    // 목록에서 "사용 전문" 열이 0 이 아닌 첫 행을 고른다.
    await tid(page, "header-search-keyword").fill("");
    await button(page, "조회").click();
    const used = tid(page, "header-list").locator(".ag-center-cols-container .ag-row")
      .filter({ has: page.locator('.ag-cell[col-id="USED_BY_COUNT"]', { hasText: /[1-9]/ }) }).first();
    await expect(used).toBeVisible({ timeout: 20_000 });
    await used.click();
    const usage = tid(page, "header-usage");
    await expect(usage).not.toContainText("이 헤더를 쓰는 전문이 없습니다", { timeout: 20_000 });
    await expect(usage.locator(".ag-center-cols-container .ag-row").first()).toBeVisible();
    await snap(page, "dmb-headerMng-07-impact");
    // 조회만 했다 — 저장 버튼을 누르지 않는다(공용 샘플 데이터 보호).
    watcher.assertClean("headerMng");
  });

  test("TC-DMB-HDR-08 등록(C) — EAI 없는 두 번째 헤더(CONST·AUTO·FILLER)", async () => {
    await button(page, "신규").click();
    await tid(page, "header-form-name").fill(HDR2);
    await expect(screen(page).getByText(/비우면 전문의 EAI 인코딩을 따릅니다/)).toBeVisible();

    await pickColumn(page, "header-item-add-column", "LINE_CODE");
    await tid(page, "item-detail-fill-kind").selectOption("CONST");
    await tid(page, "item-detail-default").fill("B1");
    await pickColumn(page, "header-item-add-column", "SEQUENCE_NO");
    await tid(page, "item-detail-fill-kind").selectOption("AUTO");
    await tid(page, "item-detail-default").selectOption("SEQ");
    await tid(page, "header-item-add-filler").click();
    await tid(page, "item-detail-filler-length").fill("4");

    const grid = headerGrid(page);
    await expect(grid.locator(".ag-center-cols-container .ag-cell[col-id=\"OFFSET\"]")).toHaveText(["0", "2", "6"]);
    await expect(tid(page, "header-length")).toHaveText("10 바이트 (3항목)");
    await layout(page, "headerMng H2 편집 중");
    await snap(page, "dmb-headerMng-08-hdr2");

    await button(page, "저장").click();
    await expectToast(page, "저장했습니다");
    await expect(tid(page, "header-form-name")).toHaveValue(HDR2, { timeout: 30_000 });

    await tid(page, "header-search-keyword").fill(RUN);
    await button(page, "조회").click();
    const row = gridRow(tid(page, "header-list"), HDR2, "LAYOUT_NAME");
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await expect(row.locator('.ag-cell[col-id="TOTAL_LENGTH"]')).toHaveText("10");
    await expect(row.locator('.ag-cell[col-id="ITEM_COUNT"]')).toHaveText("3");
    await layout(page, "headerMng 목록 H1·H2");
    await snap(page, "dmb-headerMng-08-list");
    await assertAllButtonsPressed(page, "headerMng");
    watcher.assertClean("headerMng");
  });

  // ═══════════════════════ layoutMng — 전문 레이아웃 ═══════════════════════
  // 여기서부터 처음 연다 — headerMng 에서 헤더 둘을 다 만든 뒤라야 [헤더 추가] 팝업 카탈로그에 둘 다 보인다.

  test("TC-DMB-LAY-01 전문 레이아웃 화면 배치 — 메뉴로 열면 목록·탭 3개가 보인다", async () => {
    await go(page, "layoutMng");
    await resetClicks(page);
    await expect(breadcrumb(page)).toContainText("마루 MDM > 레이아웃 > 전문 레이아웃");
    await expect(tid(page, "layout-list")).toBeVisible();
    for (const t of ["layout-tab-edit", "layout-tab-check", "layout-tab-version"]) await expect(tid(page, t)).toBeVisible();
    await expect(screen(page).getByText("목록에서 전문을 선택하거나 [신규] 를 누르세요.")).toBeVisible();
    await expect(button(page, "저장")).toBeDisabled();
    await layout(page, "layoutMng 초기");
    await snap(page, "dmb-layoutMng-01-initial");
    watcher.assertClean("layoutMng");
  });

  test("TC-DMB-LAY-02 필수값 — 이름·송신·수신 없이 저장하면 알아듣기 쉬운 문구로 막힌다", async () => {
    await button(page, "신규").click();
    await expect(screen(page).getByText("기본 속성 — 신규")).toBeVisible();
    await button(page, "저장").click();
    await expectErrorModal(page, /전문 저장 거부/, "dmb-layoutMng-02-required");
    await expect(errorBody(page)).toHaveCount(0); // 확인으로 닫혔다
    watcher.assertClean("layoutMng");
  });

  test("TC-DMB-LAY-03 등록(C) — EAI 로 헤더 1번 자동 삽입, 헤더 추가·빼기·상수 재정의·본문 항목", async () => {
    await tid(page, "layout-form-name").fill(LAYOUT_NAME);
    await tid(page, "layout-form-eai").selectOption(EAI1);
    const stack = stackGrid(page);
    await expect(stack.locator(".ag-center-cols-container .ag-row")).toHaveCount(1, { timeout: 20_000 });
    await expect(stack).toContainText(HDR1);
    await expect(stack.locator('.ag-cell[col-id="TOTAL_LENGTH"]').first()).toHaveText("28");
    await expect(stack.locator('.ag-cell[col-id="POSITION"]').first()).toHaveText("1-28");

    // 헤더 추가 — 이미 쌓인 H1 은 후보에서 빠진다.
    await tid(page, "layout-header-add").click();
    const pick = tid(page, "header-pick-modal");
    await expect(pick).toBeVisible();
    await expect(pick.locator(".ag-row").filter({ hasText: HDR1 })).toHaveCount(0);
    await (await revealRow(pick, HDR2)).click();
    await expect(stack.locator(".ag-center-cols-container .ag-row")).toHaveCount(2);
    await expect(stack).toContainText(HDR2);

    // 빼기 → 다시 추가(왕복 확인).
    await itemRow(stack, HDR2).getByRole("button", { name: "빼기" }).click();
    await expect(stack.locator(".ag-center-cols-container .ag-row")).toHaveCount(1);
    await tid(page, "layout-header-add").click();
    await (await revealRow(tid(page, "header-pick-modal"), HDR2)).click();
    await expect(stack.locator(".ag-center-cols-container .ag-row")).toHaveCount(2);

    await tid(page, "layout-form-snd").selectOption("MES");
    await tid(page, "layout-form-rcv").selectOption("ERP");

    // 본문 — 임시 FILLER 를 넣었다 지운다(항목 삭제 버튼 확인).
    await tid(page, "layout-item-add-filler").click();
    await tid(page, "item-detail-filler-length").fill("1");
    await expect(tid(page, "layout-body-summary")).toContainText("38");
    await button(page, "삭제").click();

    await pickColumn(page, "layout-item-add-column", "COIL_ID");
    await pickColumn(page, "layout-item-add-column", "PROD_DT");
    await tid(page, "layout-item-add-filler").click();
    await tid(page, "item-detail-filler-length").fill("29");

    const grid = layoutGrid(page);
    await expect(grid.locator(".ag-center-cols-container .ag-cell[col-id=\"OFFSET\"]")).toHaveText(["38", "58", "66"]);
    await expect(tid(page, "layout-total-length")).toHaveText("헤더 38 (28 + 10) + 본문 57 (20 + 8 + 29) = 95 바이트");
    await snap(page, "dmb-layoutMng-03-editing");
    await layout(page, "layoutMng 편집 중");

    // 상수 편집 — H1 의 CONST(SND_FAC_TP) 하나만 있다.
    const c = tid(page, "const-edit-open-1");
    await c.click();
    const cm = tid(page, "const-edit-modal");
    await expect(cm).toBeVisible();
    await expect(cm.locator('[data-testid^="const-input-"]')).toHaveCount(1);
    await expect(cm.getByTestId("const-default-SND_FAC_TP")).toHaveText("E1");
    // 값 칸은 표시 span 이다 — 칸을 눌러 편집기를 열고 값을 넣어 Enter 로 확정한다.
    await cm.locator(".ag-center-cols-container .ag-cell").filter({ has: cm.getByTestId("const-input-SND_FAC_TP") }).click();
    const constEditor = cm.locator(".ag-cell-inline-editing input");
    await constEditor.fill("E9");
    await constEditor.press("Enter");
    await snapModal(page, "dmb-layoutMng-03-const");
    await tid(page, "const-edit-apply").click();
    await expect(cm).toBeHidden();
    await expect(stack).toContainText("송신공장구분 E9");

    await button(page, "저장").click();
    await expectToast(page, "저장했습니다.");
    await expect(tid(page, "layout-form-name")).toHaveValue(LAYOUT_NAME, { timeout: 30_000 });

    await tid(page, "layout-search-keyword").fill(RUN);
    await button(page, "조회").click();
    const row = gridRow(tid(page, "layout-list"), LAYOUT_NAME, "LAYOUT_NAME");
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await expect(row.locator('.ag-cell[col-id="TOTAL_LENGTH"]')).toHaveText("95");
    layoutId = (await row.locator('.ag-cell[col-id="LAYOUT_ID"]').textContent())!.trim();
    expect(layoutId).toMatch(/^\d+$/);
    watcher.assertClean("layoutMng");
  });

  test("TC-DMB-LAY-04 조회(R) — 키워드·송신·수신 조건을 바꿔 가며 조회한다", async () => {
    await tid(page, "layout-search-keyword").fill(RUN);
    await button(page, "조회").click();
    const row = gridRow(tid(page, "layout-list"), LAYOUT_NAME, "LAYOUT_NAME");
    await expect(row).toHaveCount(1, { timeout: 20_000 });

    await chooseSearch(page, "송신 시스템", "MES");
    await chooseSearch(page, "수신 시스템", "ERP");
    await button(page, "조회").click();
    await expect(row).toHaveCount(1, { timeout: 20_000 });

    await chooseSearch(page, "수신 시스템", "APS");
    await button(page, "조회").click();
    await expect(tid(page, "layout-list-empty")).toBeVisible({ timeout: 20_000 });

    await chooseSearch(page, "수신 시스템", "");
    await chooseSearch(page, "송신 시스템", "");
    await button(page, "조회").click();
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await layout(page, "layoutMng 조회 조건");
    watcher.assertClean("layoutMng");
  });

  test("TC-DMB-LAY-05 등록 검증 — 7행 표에 거부가 없다", async () => {
    await gridRow(tid(page, "layout-list"), LAYOUT_NAME, "LAYOUT_NAME").click();
    await expect(tid(page, "layout-form-name")).toHaveValue(LAYOUT_NAME, { timeout: 20_000 });
    await tid(page, "layout-tab-check").click();
    await tid(page, "layout-check-run").click();
    await expect(tid(page, "layout-check-table").locator('[data-testid^="layout-check-row-"]')).toHaveCount(7, { timeout: 20_000 });
    for (let n = 1; n <= 7; n++) await expect(tid(page, `layout-check-result-${n}`)).toHaveText(/^(통과|경고)$/);
    await layout(page, "layoutMng 검증 통과");
    await snap(page, "dmb-layoutMng-05-check");
    watcher.assertClean("layoutMng");
  });

  test("TC-DMB-LAY-06 샘플 전문 — 예시 값으로 인코딩 바이트 기준 한 줄을 렌더한다", async () => {
    await tid(page, "sample-input-COIL_ID").fill("C26E2E00001");
    await tid(page, "sample-input-PROD_DT").fill("20260928");
    await tid(page, "sample-render").click();
    await expect(tid(page, "sample-length")).toContainText("95", { timeout: 20_000 });
    await expect(tid(page, "sample-length")).toContainText("EUC-KR");
    await expect(tid(page, "sample-line").locator('[data-testid^="sample-seg-"]').first()).toBeVisible();
    await expect(tid(page, "sample-parsed-COIL_ID")).toHaveText("C26E2E00001");
    await layout(page, "layoutMng 샘플 전문");
    await snap(page, "dmb-layoutMng-06-sample");
    watcher.assertClean("layoutMng");
  });

  test("TC-DMB-LAY-07 수정(U) — 표현 자리 부족은 검증·저장 모두 거부하고, 고치면 버전 2·다운로드", async () => {
    await tid(page, "layout-tab-edit").click();
    await itemRow(layoutGrid(page), "FILLER").click();
    await tid(page, "item-detail-filler-length").fill("25");
    await pickColumn(page, "layout-item-add-column", "COIL_THK");
    await tid(page, "item-detail-width").fill("2");
    await tid(page, "item-detail-zero").selectOption("Y");
    await tid(page, "item-detail-implied").selectOption("1");

    await tid(page, "layout-tab-check").click();
    await tid(page, "layout-check-run").click();
    await expect(tid(page, "layout-check-result-4")).toHaveText("거부", { timeout: 20_000 });
    await expect(tid(page, "layout-check-message-4")).toContainText("표현 자리 2");
    await snap(page, "dmb-layoutMng-07-reject-check");

    await button(page, "저장").click();
    await expectErrorModal(page, /L14.*표현 자리 2/, "dmb-layoutMng-07-reject-save");

    await tid(page, "layout-tab-edit").click();
    await itemRow(layoutGrid(page), "COIL_THK").click();
    await tid(page, "item-detail-width").fill("4");
    await tid(page, "layout-tab-check").click();
    await tid(page, "layout-check-run").click();
    for (let n = 1; n <= 7; n++) await expect(tid(page, `layout-check-result-${n}`)).toHaveText(/^(통과|경고)$/, { timeout: 20_000 });

    await tid(page, "layout-tab-edit").click();
    await expect(tid(page, "layout-total-length")).toContainText("95");
    await button(page, "저장").click();
    await expectToast(page, "저장했습니다.");
    await expect(tid(page, "layout-total-length")).toContainText("95", { timeout: 30_000 });

    await tid(page, "layout-tab-version").click();
    const versions = tid(page, "version-list");
    const vrow = (i: number) => versions.locator(`.ag-center-cols-container .ag-row[row-index="${i}"]`);
    await expect(versions.locator(".ag-center-cols-container .ag-row")).toHaveCount(2, { timeout: 20_000 });
    await expect(vrow(0).locator('.ag-cell[col-id="LAYOUT_VERSION"]')).toHaveText("2");
    await expect(vrow(0).locator('.ag-cell[col-id="SWITCH_MODE"]')).toHaveText("순차 전환");
    await expect(vrow(1).locator('.ag-cell[col-id="LAYOUT_VERSION"]')).toHaveText("1");
    await expect(tid(page, "change-class-table")).toContainText("여분을 쪼개 항목 추가");
    await expect(tid(page, "snapshot-preview")).toContainText('"layoutVersion": 2', { timeout: 20_000 });
    await layout(page, "layoutMng 버전 이력");
    await snap(page, "dmb-layoutMng-07-version");

    const [json] = await Promise.all([page.waitForEvent("download"), tid(page, "snapshot-download-json").click()]);
    expect(json.suggestedFilename()).toBe(`layout-${layoutId}-v2.json`);
    const [xlsx] = await Promise.all([page.waitForEvent("download"), tid(page, "snapshot-download-excel").click()]);
    expect(xlsx.suggestedFilename()).toBe(`layout-${layoutId}-v2.xlsx`);
    watcher.assertClean("layoutMng");
  });

  test("TC-DMB-LAY-08 영향 전문 — 컬럼 물리명으로 찾으면 내 전문이 보인다", async () => {
    // 버전 탭에 이미 있다(TC-DMB-LAY-07 에서 이동).
    await tid(page, "impact-keyword").fill("COIL_THK");
    await tid(page, "impact-search").click();
    const row = tid(page, "impact-list").locator(".ag-center-cols-container .ag-row").filter({ hasText: LAYOUT_NAME }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText("MES → ERP");
    await expect(row).toContainText("91 / 4");
    await snap(page, "dmb-layoutMng-08-impact");

    await tid(page, "impact-keyword").fill(`없음-${RUN}`);
    await tid(page, "impact-search").click();
    await expect(tid(page, "impact-list-empty")).toHaveText("찾은 컬럼·도메인이 없습니다", { timeout: 20_000 });
    await layout(page, "layoutMng 영향 전문");
    await assertAllButtonsPressed(page, "layoutMng");
    watcher.assertClean("layoutMng");
  });

  test("TC-DMB-LAY-09 화면 연결(관찰) — 전문을 쌓은 뒤 헤더 쪽에서 사용 전문이 보인다", async () => {
    await go(page, "headerMng");
    await tid(page, "header-search-keyword").fill(HDR1);
    await button(page, "조회").click();
    await gridRow(tid(page, "header-list"), HDR1, "LAYOUT_NAME").click();
    await expect(tid(page, "header-form-name")).toHaveValue(HDR1, { timeout: 20_000 });
    const usage = tid(page, "header-usage");
    await expect(usage).toContainText(LAYOUT_NAME, { timeout: 20_000 });
    await snap(page, "dmb-layoutMng-09-back-to-header");
    watcher.assertClean("headerMng(전문 저장 뒤)");
  });

  test("TC-DMB-LAY-99 여정 중 모든 화면 배치가 표준을 지킨다", async () => {
    expect(layoutIssues, "화면 배치 위반(스크린샷: .out/screens/dmb-layout-*)").toEqual([]);
  });
});

// ═══════════════════════════ B. 연결·권한 ═══════════════════════════

test.describe("dmb 화면 연결·권한", () => {
  test.describe.configure({ mode: "default" });

  test("TC-DMB-CAT-01 헤더 카탈로그 — [헤더 추가]를 한 번 연 뒤 만든 헤더가 다시 열었을 때 보이는지(관찰)", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "std", testInfo);
    try {
      const id = uid("CAT");
      await go(page, "layoutMng");
      await button(page, "신규").click();
      // 카탈로그를 이 페이지에서 먼저 한 번 채운다(page.tsx ensureCatalog 는 catalog state 가 비어 있을 때만 불러온다) —
      // 그래야 "이미 캐시된 뒤 다른 세션이 헤더를 더한다" 시나리오가 된다.
      await tid(page, "layout-header-add").click();
      const pick = tid(page, "header-pick-modal");
      await expect(pick).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: "닫기" }).last().click();
      await expect(pick).toBeHidden();

      const other = await openAs(browser, "std", testInfo);
      try {
        await go(other.page, "headerMng");
        await button(other.page, "신규").click();
        await tid(other.page, "header-form-name").fill(id);
        await tid(other.page, "header-item-add-filler").click();
        await tid(other.page, "item-detail-filler-length").fill("1");
        await button(other.page, "저장").click();
        await expectToast(other.page, "저장했습니다");
        other.watcher.assertClean("headerMng(카탈로그 시험)");
      } finally {
        await other.page.context().close();
      }

      // [조회](목록 검색)는 눌러 보되, 카탈로그(헤더 추가 후보)는 이것으로 새로고침되지 않는다 — 그 자체가 관찰 대상이다.
      await button(page, "조회").click();
      await tid(page, "layout-header-add").click();
      await expect(pick).toBeVisible();
      // 세로 가상화 — 누적 실행으로 목록이 길어지면 방금 만든(ID 가 가장 큰) 행은 끝까지 스크롤해야 그려진다.
      await pick.locator(".ag-body-viewport").first().evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      const found = await pick.locator(".ag-row").filter({ hasText: id }).count();
      await snap(page, "dmb-catalog-probe");
      test.info().annotations.push({
        type: "observation",
        description: found > 0
          ? "[헤더 추가]를 한 번 연 뒤에도 카탈로그가 다시 불려 방금 만든 헤더가 보인다(추정과 다르다 — 코드 근거로 재확인 필요)."
          : "[헤더 추가]를 한 번 열면 그 뒤 [조회]를 눌러도 카탈로그가 새로고침되지 않는다 — 방금 만든 헤더는 이 탭을 새로 열어야 후보에 나온다(page.tsx ensureCatalog, catalog state 가 채워지면 다시 안 부른다).",
      });
      watcher.assertClean("layoutMng(카탈로그 시험)");
    } finally {
      await page.context().close();
    }
  });

  test("TC-DMB-CFL-01 동시 수정 — 같은 표준관리자 두 탭에서 먼저 저장한 쪽이 이기고, 나중 쪽은 충돌 안내 뒤 최신 값을 본다", async ({ browser }, testInfo) => {
    const owner = await openAs(browser, "std", testInfo);
    const id = uid("CFL");
    try {
      await go(owner.page, "headerMng");
      await button(owner.page, "신규").click();
      await tid(owner.page, "header-form-name").fill(id);
      await tid(owner.page, "header-item-add-filler").click();
      await tid(owner.page, "item-detail-filler-length").fill("2");
      await button(owner.page, "저장").click();
      await expectToast(owner.page, "저장했습니다");
      owner.watcher.assertClean("headerMng(충돌 준비)");
    } finally {
      await owner.page.context().close();
    }

    const a = await openAs(browser, "std", testInfo);
    const b = await openAs(browser, "std", testInfo);
    try {
      for (const p of [a.page, b.page]) {
        await go(p, "headerMng");
        await tid(p, "header-search-keyword").fill(id);
        await button(p, "조회").click();
        await gridRow(tid(p, "header-list"), id, "LAYOUT_NAME").click();
        await expect(tid(p, "header-form-name")).toHaveValue(id, { timeout: 20_000 });
      }
      // 패딩 규칙 칸은 EAI 가 있어야 열려서(HeaderForm.tsx) 이 헤더(EAI 없음)에는 늘 disabled 다 —
      // 항상 열려 있는 "이름" 칸으로 충돌을 낸다.
      const nameA = `${id} A탭`;
      await tid(a.page, "header-form-name").fill(nameA);
      await button(a.page, "저장").click();
      await expectToast(a.page, "저장했습니다");

      await tid(b.page, "header-form-name").fill(`${id} B탭`);
      await button(b.page, "저장").click();
      // headerMng 은 codeEdit 과 달리 충돌 모달을 닫아도 자동으로 다시 불러오지 않는다(page.tsx catch 가 오류만 보인다) —
      // 사용자가 하듯 목록에서 다시 눌러 최신 값을 본다.
      await expectErrorModal(b.page, "다른 사용자가 수정했습니다", "dmb-conflict-headerMng");
      await tid(b.page, "header-search-keyword").fill(id);
      await button(b.page, "조회").click();
      await gridRow(tid(b.page, "header-list"), nameA, "LAYOUT_NAME").click();
      await expect(tid(b.page, "header-form-name")).toHaveValue(nameA, { timeout: 20_000 });

      a.watcher.assertClean("headerMng(A)");
      b.watcher.assertClean("headerMng(B)");
    } finally {
      await a.page.context().close();
      await b.page.context().close();
    }
  });

  test("TC-DMB-RO-01 담당자(stw)는 dmb 를 조회만 한다 — 등록·저장·항목 추가 버튼이 아예 없다", async ({ browser }, testInfo) => {
    // 표본 데이터는 다른 세션이 바꿀 수 있어(TC-DMB-HDR-07 관찰 참고) std 로 직접 만든 헤더·전문을 쓴다.
    const owner = await openAs(browser, "std", testInfo);
    const hdrName = uid("ROH");
    const layName = uid("ROL");
    const eaiCode = `E2R${RUN}`;
    try {
      await go(owner.page, "headerMng");
      await button(owner.page, "신규").click();
      await tid(owner.page, "header-form-name").fill(hdrName);
      await tid(owner.page, "header-form-eai").fill(eaiCode);
      await tid(owner.page, "header-form-eai-name").fill(`E2E RO EAI ${RUN}`);
      await tid(owner.page, "header-form-encoding").selectOption("UTF-8");
      await pickColumn(owner.page, "header-item-add-column", "LINE_CODE");
      await tid(owner.page, "item-detail-fill-kind").selectOption("CONST");
      await tid(owner.page, "item-detail-default").fill("R1");
      await button(owner.page, "저장").click();
      await expectToast(owner.page, "저장했습니다");

      await go(owner.page, "layoutMng");
      await button(owner.page, "신규").click();
      await tid(owner.page, "layout-form-name").fill(layName);
      await tid(owner.page, "layout-form-eai").selectOption(eaiCode);
      await expect(stackGrid(owner.page).locator(".ag-center-cols-container .ag-row")).toHaveCount(1, { timeout: 20_000 });
      await tid(owner.page, "layout-form-snd").selectOption("MES");
      await tid(owner.page, "layout-form-rcv").selectOption("ERP");
      await button(owner.page, "저장").click();
      await expectToast(owner.page, "저장했습니다.");
      owner.watcher.assertClean("headerMng·layoutMng(RO 준비)");
    } finally {
      await owner.page.context().close();
    }

    const { page, watcher } = await openAs(browser, "stw", testInfo);
    try {
      await go(page, "headerMng");
      await expect(button(page, "조회")).toBeEnabled({ timeout: 30_000 });
      await expect(button(page, "신규")).toHaveCount(0);
      await expect(button(page, "저장")).toHaveCount(0);
      await tid(page, "header-search-keyword").fill(hdrName);
      await button(page, "조회").click();
      await gridRow(tid(page, "header-list"), hdrName, "LAYOUT_NAME").click();
      await expect(tid(page, "header-form-name")).toBeDisabled({ timeout: 20_000 });
      await expect(tid(page, "header-item-add-column")).toHaveCount(0);
      await expect(tid(page, "header-item-add-filler")).toHaveCount(0);
      await snap(page, "dmb-ro-headerMng");

      await go(page, "layoutMng");
      await expect(button(page, "신규")).toHaveCount(0);
      await expect(button(page, "저장")).toHaveCount(0);
      await tid(page, "layout-search-keyword").fill(layName);
      await button(page, "조회").click();
      await gridRow(tid(page, "layout-list"), layName, "LAYOUT_NAME").click();
      await expect(tid(page, "layout-form-name")).toBeDisabled({ timeout: 20_000 });
      await expect(tid(page, "layout-header-add")).toHaveCount(0);
      await expect(tid(page, "layout-item-add-column")).toHaveCount(0);
      // 상수 편집은 열리지만 [적용]이 없다(읽기 전용).
      await tid(page, "const-edit-open-1").click();
      const cm = tid(page, "const-edit-modal");
      await expect(cm).toBeVisible();
      await expect(tid(page, "const-edit-apply")).toHaveCount(0);
      // 모달에 X 아이콘(aria-label "닫기")과 footer [닫기] 글자 버튼이 둘 다 있다 — 마지막(footer) 것을 누른다.
      await page.getByRole("dialog").getByRole("button", { name: "닫기" }).last().click();
      await snap(page, "dmb-ro-layoutMng");
      watcher.assertClean("dmb(stw)");
    } finally {
      await page.context().close();
    }
  });
});
