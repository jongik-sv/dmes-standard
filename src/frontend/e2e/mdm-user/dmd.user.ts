import fs from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  OUT_DIR,
  RUN,
  Watcher,
  answerConfirm,
  assertAllButtonsPressed,
  breadcrumb,
  button,
  checkLayout,
  expectToast,
  footerScreenId,
  gridRow,
  modal,
  openAs,
  openMenu,
  screen,
  snap,
  tid,
  uid,
  waitIdle,
} from "./support";

/**
 * 마루 MDM 사용자 여정 E2E — dmd(마스터데이터) 그룹.
 *
 * 화면(2026-09-29 통합 D-104): 마루 데이터(dataMng — 옛 마루 데이터 수정 dataEdit 를 흡수: 목록 행 클릭 → 오른쪽 상세,
 * 목록 헤더 [데이터 등록] → 등록 팝업) · 항목 편집(dataItemMng — 옛 카테고리 편집 dataCateEdit·항목 이력 dataHistory 를 흡수: 탭
 * [항목]·[트리]·[카테고리], 오른쪽 열에 항목 이력·카테고리 이력) · CSV 업로드 팝업(dataCsvUploadPop — 항목 편집의
 * [항목] 탭 "CSV 업로드" 버튼으로 연다). dataEdit·dataCateEdit·dataHistory 는 메뉴·화면이 없다.
 *
 * 업무 순서를 따라 다섯 장으로 나눈다. 각 장은 serial 로 한 페이지를 공유하고, 첫 단계에서 자기 마루 데이터를
 * dataMng 화면으로 새로 등록한다(실패 뒤 워커가 다시 떠 RUN 이 바뀌어도 다른 장이 영향받지 않게).
 *   A 마루 데이터 등록·조회·검증 → 같은 화면 상세에서 수정(헤더·라벨·동시 수정 충돌) → [항목 편집 →]
 *   B 항목 등록·조회·수정·닫기/다시 열기·동시 수정 충돌 → CSV 업로드(오류 CSV·정상 CSV·재업로드) → 쪽 이동·트리 보기
 *   C [카테고리] 탭(BASE 보호·REGEX 미리보기·TABLE 소속·닫기/다시 열기) → 항목 조회의 카테고리 조건 → 오른쪽 이력(항목·카테고리·소속)
 *   D 계층 칸 수 축소 거부 → 폐기(취소 → 확인) → 목록 상태 필터 → 항목 편집 조회 전용
 *   E 표준관리자(std)는 읽기 전용 — 등록·저장·폐기·닫기·CSV 가 막힌다
 *
 * 마루 데이터는 마루 코드(dmc)를 참조하지 않으므로 dmc 화면 선행 작업이 없다. dmd 에는 편집 잠금이 없고,
 * 두 번째 담당자(stw2)는 행 버전·감사 버전 충돌 시험에 쓴다.
 */

// ─────────────────────────── 지역 부품 ───────────────────────────

const FOLDER = ["마루 MDM", "마스터데이터"];
/**
 * 마루 데이터 ID — 실행마다 접미를 붙인다. 마루 데이터는 화면에서 지울 수 없고(폐기만 가능) 정리 스크립트
 * (tools/e2e-clean-data.sh)도 다루지 않아, 고정 ID 로 두면 두 번째 실행부터 [등록] 이 중복(MDM011)으로 막힌다.
 * dmc 는 마루 코드 삭제(D-102)가 있어 고정 ID 를 쓰지만 dmd 는 그럴 수 없다.
 */
const DM_RUN = Date.now().toString(36).toUpperCase();
const mdId = (tag: string) => `${uid(tag)}_${DM_RUN}`;
/** 항목 키 패턴 — 영문 대문자·숫자·_ 1~30자. */
const KEY_PATTERN = "^[A-Z0-9_]{1,30}$";
const CONFLICT = "다른 사용자가 수정했습니다";

/** 마루 MDM > 마스터데이터 > leaf 를 사이드바에서 열고 버튼 누름 기록을 비운다. */
async function openDmd(page: Page, leaf: string, screenId: string) {
  await openMenu(page, [...FOLDER, leaf], screenId);
  await resetClicks(page);
}

/**
 * 열린 MDI 탭을 모두 닫는다. 탭의 × 는 마우스를 올렸을 때만 눌리므로(TabsBar.css pointer-events) 사용자처럼
 * 탭에 먼저 올린 뒤 누른다 — support.closeAllTabs 는 올리지 않고 눌러 비활성 탭에서 막힌다.
 */
async function closeTabs(page: Page) {
  const tabs = page.locator(".tabs-bar .tab-item").filter({ has: page.locator(".tab-close") });
  for (let n = await tabs.count(); n > 0; n = await tabs.count()) {
    await tabs.first().hover();
    await tabs.first().locator(".tab-close").click();
    await expect(tabs).toHaveCount(n - 1);
  }
}

/**
 * 배치·표시 검사 기록 — 검사는 그 상태에서 바로 하되 단언은 장 끝의 "-99" 테스트가 한다. serial 장에서 배치
 * 위반이나 빈 상태 안내 누락 하나가 뒤의 CRUD·권한 단계를 모두 건너뛰게 하지 않으려는 것이다(위반은 실패로 남는다).
 */
class Findings {
  readonly items: string[] = [];
  async layout(page: Page, label: string) {
    await this.later(page, label, () => checkLayout(page, label));
  }
  async later(page: Page, label: string, check: () => Promise<unknown>) {
    try {
      await check();
    } catch (e) {
      const text = String((e as Error).message).replace(/\x1b\[[0-9;]*m/g, "");
      const lines = [...text.matchAll(/"(L\d [^\n]*?)",?\s*$/gm)].map((m) => m[1].replace(/\\"/g, '"'));
      this.items.push(`${label}: ${lines.length ? lines.join(" / ") : text.split("\n").slice(0, 4).join(" ").slice(0, 300)}`);
      await snap(page, `dmd-finding-${label.replace(/[^\w가-힣]+/g, "_")}`);
    }
  }
  assertEmpty(chapter: string) {
    expect(this.items, `${chapter}: 배치 위반·표시 누락`).toEqual([]);
  }
}

/** 버튼 누름 기록을 비운다 — 화면별 assertAllButtonsPressed 가 그 화면에서 실제로 누른 것만 보게. */
async function resetClicks(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __mdmClicked?: string[] }).__mdmClicked = [];
  });
}

/** 의도한 업무 오류(4xx) 직후 — 모인 문제가 4xx 네트워크 콘솔 줄뿐인지 본다(5xx·페이지 예외는 남기지 않는다). */
function expectOnly4xx(watcher: Watcher, label: string) {
  const rest = watcher.drain().filter((p) => !/status of 4\d\d/.test(p));
  expect(rest, `${label}: 의도한 4xx 외의 오류가 없어야 한다`).toEqual([]);
}

/** 오류 모달(ErrorModal)이 문구를 보이는지 확인하고 "확인" 으로 닫는다. */
async function expectErrorModal(page: Page, text: string | RegExp, shot?: string) {
  const m = modal(page);
  await expect(m.locator(".error-modal__body")).toContainText(text, { timeout: 20_000 });
  if (shot) await snap(page, shot);
  await m.getByRole("button", { name: "확인", exact: true }).click();
  await expect(m.locator(".error-modal__body")).toHaveCount(0);
}

/** 화면 머리 버튼([조회])만 — 화면 본문 안 같은 이름 버튼(카테고리 이력의 [조회])과 섞이지 않게 한다. */
const headerBtn = (page: Page, name: string) =>
  page.locator(".page-layout__header-buttons:visible").getByRole("button", { name, exact: true });

/** 마루 데이터 목록 헤더 [데이터 등록] 으로 등록 팝업을 연다(열 때마다 새로 마운트되어 칸이 빈다). */
async function openRegPopup(page: Page) {
  await page.locator("#btn_data_reg").click();
  await expect(tid(page, "data-mng-register-form")).toBeVisible({ timeout: 20_000 });
}

/** 등록 팝업을 [취소]로 닫는다 — 팝업이 떠 있는 동안에는 뒤 화면이 눌리지 않는다. */
async function cancelRegPopup(page: Page) {
  await tid(page, "data-mng-reg-cancel").click();
  await expect(tid(page, "data-mng-register-form")).toHaveCount(0, { timeout: 20_000 });
}

/**
 * 행을 누르고 상세 조회(dataEdit/view) 응답이 올 때까지 기다린다. 이미 고른 행을 다시 누르면 상세가 그대로 떠 있어
 * `data-edit-id` 만 보고는 재조회 도착을 알 수 없다 — 응답을 기다리지 않으면 뒤이은 입력이 늦은 응답에 덮일 수 있다.
 */
async function clickRowAndAwaitView(page: Page, row: Locator) {
  const viewed = page.waitForResponse((r) => r.url().includes("/oasis/dataEdit/view"), { timeout: 20_000 });
  await row.click();
  await viewed;
  await expect(tid(page, "detail-stale")).toHaveCount(0);
}

/** 마루 데이터 화면에서 ID 로 조회한 뒤 그 행을 눌러 오른쪽 상세를 연다(고르기 전이든 다른 상세를 보던 중이든 같다). */
async function selectMng(page: Page, id: string) {
  await tid(page, "data-mng-search-id").fill(id);
  await headerBtn(page, "조회").click();
  const row = gridRow(tid(page, "data-mng-list"), id, "maruDataId");
  await expect(row).toBeVisible({ timeout: 20_000 });
  await clickRowAndAwaitView(page, row);
  await expect(tid(page, "data-edit-id")).toHaveText(id, { timeout: 20_000 });
  await waitIdle(page);
}

/**
 * 상세를 서버에서 다시 불러온다 — 이미 고른 행을 다시 누르면 상세를 다시 부른다(옛 화면의 [조회] 재조회와 같은 확인).
 * 목록 조건은 그대로라 그 행이 보이는 상태여야 한다.
 */
async function reselectMng(page: Page, id: string) {
  const row = gridRow(tid(page, "data-mng-list"), id, "maruDataId");
  await expect(row).toBeVisible({ timeout: 20_000 });
  await clickRowAndAwaitView(page, row);
  await expect(tid(page, "data-edit-id")).toHaveText(id, { timeout: 20_000 });
  await waitIdle(page);
}

interface MaruDataInput {
  id: string;
  name: string;
  lvl: string;
  desc?: string;
}

/** 마루 데이터 화면에서 [데이터 등록] 팝업으로 등록한다 — 성공하면 팝업이 닫히고 같은 화면 오른쪽에 그 ID 의 상세가 뜬다(탭을 새로 열지 않는다). */
async function registerMaruData(page: Page, d: MaruDataInput) {
  await openDmd(page, "마루 데이터", "dataMng");
  await openRegPopup(page);
  await tid(page, "data-mng-reg-id").fill(d.id);
  await tid(page, "data-mng-reg-name").fill(d.name);
  await tid(page, "data-mng-reg-pattern").fill(KEY_PATTERN);
  if (d.desc) await tid(page, "data-mng-reg-desc").fill(d.desc);
  await tid(page, "data-mng-reg-lvl").selectOption(d.lvl);
  await tid(page, "data-mng-reg-save").click();
  await expectToast(page, "등록했습니다");
  await expect(tid(page, "data-mng-register-form")).toHaveCount(0, { timeout: 20_000 });
  await expect(footerScreenId(page)).toHaveText("dataMng");
  await expect(tid(page, "data-edit-id")).toHaveText(d.id, { timeout: 20_000 });
  await expect(tid(page, "data-edit-name")).toHaveValue(d.name);
}

/** 마루 데이터 상세에서 추가 컬럼 라벨을 붙이고 저장한다. */
async function saveLabels(page: Page, labels: Partial<Record<"attr01Name" | "attr02Name", string>>) {
  for (const [key, value] of Object.entries(labels)) await tid(page, `data-edit-${key}`).fill(value);
  await tid(page, "data-edit-save").click();
  await expectToast(page, "저장했습니다");
}

// ── 항목 편집(항목 탭) ──

const itemList = (page: Page) => tid(page, "item-list");
const itemRow = (page: Page, code: string) => itemList(page).locator(`.ag-center-cols-container .ag-row[row-id="${code}"]`);
const itemCell = (page: Page, code: string, col: string) => itemRow(page, code).locator(`.ag-cell[col-id="${col}"]`);
const itemCount = (page: Page) => itemList(page).locator(".grid-panel-count").first();

/** 항목 편집에서 마루 데이터를 고른다(고르면 머리와 첫 쪽을 불러온다). */
async function selectItemMaru(page: Page, id: string) {
  await tid(page, "item-pick-keyword").fill(id);
  await tid(page, "item-pick-keyword").press("Enter");
  await tid(page, `item-pick-${id}`).click({ timeout: 20_000 });
  await expect(itemList(page).locator(".grid-panel-title")).toContainText("항목 — ", { timeout: 20_000 });
  await waitIdle(page);
}

async function searchItems(page: Page) {
  await headerBtn(page, "조회").click();
  await waitIdle(page);
}

/** "항목 추가" 패널에 값을 넣는다(등록은 누르지 않는다). */
async function fillItemForm(page: Page, fields: Record<string, string>) {
  if (!(await tid(page, "item-form").isVisible())) await button(page, "항목 추가").click();
  await expect(tid(page, "item-form")).toBeVisible();
  for (const [field, value] of Object.entries(fields)) await tid(page, `item-form-${field}`).fill(value);
}

async function registerItem(page: Page, fields: Record<string, string>) {
  await fillItemForm(page, fields);
  await tid(page, "item-form-submit").click();
  await expectToast(page, "등록했습니다");
  await expect(itemRow(page, fields.code)).toBeVisible({ timeout: 20_000 });
}

/** 그리드 칸을 한 번 눌러 편집하고 Enter 로 마친다(singleClickEdit). */
async function editItemCell(page: Page, code: string, col: string, value: string) {
  const cell = itemCell(page, code, col);
  await cell.click();
  const editor = cell.locator("input");
  await expect(editor).toBeVisible({ timeout: 5_000 });
  await editor.fill(value);
  await editor.press("Enter");
  await expect(cell).toHaveText(value, { timeout: 5_000 });
}

// ── CSV ──

const CSV_COLS = [
  "code", "name", "alter_name", "seq", "description", "lvl1", "lvl2", "lvl3", "lvl4", "lvl5",
  "attr01", "attr02", "attr03", "attr04", "attr05", "attr06", "attr07", "attr08", "attr09", "attr10",
] as const;
type CsvCol = (typeof CSV_COLS)[number];
const csvLine = (f: Partial<Record<CsvCol, string>>) => CSV_COLS.map((c) => f[c] ?? "").join(",");

/** 사용자 PC 의 CSV 파일처럼 .out/csv 아래에 파일을 만든다. */
function writeCsv(name: string, lines: string[]): string {
  const dir = path.join(OUT_DIR, "csv");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}-${RUN}.csv`);
  fs.writeFileSync(file, lines.join("\r\n") + "\r\n", "utf-8");
  return file;
}

const csvPop = (page: Page) => page.getByTestId("csv-pop");
const csvRow = (page: Page, lineNo: number) => page.getByTestId("csv-pop-rows").locator(`.ag-row[row-id="${lineNo}"]`);

async function openCsvPopup(page: Page, maruName: string) {
  await button(page, "CSV 업로드").click();
  await expect(csvPop(page)).toBeVisible();
  await expect(modal(page).locator(".cm-modal-title")).toHaveText(`CSV 업로드 — ${maruName}`);
}

async function chooseCsv(page: Page, file: string) {
  await page.getByTestId("csv-pop-file").setInputFiles(file);
  await expect(csvPop(page)).toContainText(path.basename(file));
  // FileReader 가 끝나야 "검증" 이 켜진다.
  await expect(page.getByTestId("csv-pop-validate")).toBeEnabled({ timeout: 5_000 });
}

// ── 카테고리 탭 ──

/** 항목 편집 화면에서 마루 데이터를 고른 채 [카테고리] 탭으로 들어간다(탭에 들어가면 그 데이터의 카테고리 목록을 읽는다). */
async function openCateTab(page: Page) {
  await tid(page, "item-tab-cate").click();
  await expect(tid(page, "cate-tab")).toBeVisible({ timeout: 20_000 });
  await expect(tid(page, "cate-row-BASE")).toBeVisible({ timeout: 20_000 });
  await waitIdle(page);
}

async function addCategory(page: Page, id: string, name: string, kind: "REGEX" | "TABLE") {
  await tid(page, "cate-add-id").fill(id);
  await tid(page, "cate-add-name").fill(name);
  await tid(page, "cate-add-kind").selectOption(kind);
  await tid(page, "cate-add-submit").click();
  await expectToast(page, "등록했습니다");
  await expect(tid(page, `cate-row-${id}`)).toBeVisible({ timeout: 20_000 });
}

// ── 이력(항목 이력 패널·카테고리 이력 패널이 같은 타임라인을 쓴다) ──

const timelineRows = (page: Page, panelTestId: string) =>
  tid(page, panelTestId).locator(".ag-center-cols-container .ag-row");

/** 카테고리 이력 패널에서 소속 이력을 본다 — 대상을 「소속」으로 바꾸고 키를 넣어 [조회] 한다(고른 카테고리 안의 항목 하나). */
async function queryMemberHistory(page: Page, key: string) {
  await tid(page, "cate-history-target").selectOption("CATE_ITEM");
  await tid(page, "cate-history-key").fill(key);
  await tid(page, "cate-history-search").click();
  await waitIdle(page);
}

// ═══════════════════════════ A. 마루 데이터 등록·수정 ═══════════════════════════

test.describe("A 마루 데이터 등록·조회·수정", () => {
  test.describe.configure({ mode: "serial" });

  const MD = mdId("DMA");
  const NAME = `E2E 항구 ${RUN}`;
  const NEW_NAME = `E2E 항구 수정 ${RUN}`;
  let page: Page;
  let watcher: Watcher;
  const layout = new Findings();

  test.beforeAll(async ({ browser }, testInfo) => {
    ({ page, watcher } = await openAs(browser, "stw", testInfo));
  });
  test.afterAll(async () => {
    await page?.context().close();
  });

  test("TC-DMD-MNG-01 마루 데이터 화면 배치 — 메뉴 이동·breadcrumb·목록과 오른쪽 안내", async () => {
    await closeTabs(page);
    await openDmd(page, "마루 데이터", "dataMng");
    await expect(breadcrumb(page)).toContainText("마루 MDM > 마스터데이터 > 마루 데이터");
    await expect(tid(page, "data-mng-list").locator(".grid-panel-title")).toContainText("마루 데이터 목록");
    // 고르기 전에는 오른쪽에 안내만 있다 — 상세도 없고 등록 팝업도 닫혀 있다.
    await expect(tid(page, "data-mng-empty")).toHaveText("목록에서 마루 데이터를 고르거나 [데이터 등록] 을 누르세요");
    await expect(tid(page, "data-edit-id")).toHaveCount(0);
    await expect(tid(page, "data-mng-register-form")).toHaveCount(0);
    await expect(page.locator("#btn_data_reg")).toBeEnabled();
    // 삭제 수단은 없다 — 폐기는 상세에서 한다(고른 뒤에만 보인다).
    await expect(screen(page).getByRole("button", { name: /삭제|폐기/ })).toHaveCount(0);
    await layout.layout(page, "dataMng 초기");
    await snap(page, "dmd-dataMng-01-initial");
    watcher.assertClean("dataMng");
  });

  test("TC-DMD-MNG-02 [데이터 등록] 팝업 배치, 필수값 누락·잘못된 ID 형식은 알아듣기 쉬운 문구로 막힌다", async () => {
    await openRegPopup(page);
    // 팝업은 뒤 화면(안내)을 바꾸지 않는다.
    await expect(tid(page, "data-mng-empty")).toBeVisible();
    // 원천은 MDM 고정 글자일 뿐 고를 수 있는 컨트롤이 없다(R10).
    await expect(tid(page, "data-mng-reg-source")).toHaveText("MDM");
    await expect(tid(page, "data-mng-reg-source").locator("select, input, [role='combobox']")).toHaveCount(0);
    // 계층 칸 수 기본값 0, 선택지 0~5.
    await expect(tid(page, "data-mng-reg-lvl")).toHaveValue("0");
    await expect(tid(page, "data-mng-reg-lvl").locator("option")).toHaveText(["0", "1", "2", "3", "4", "5"]);
    await snap(page, "dmd-dataMng-02-form");

    await tid(page, "data-mng-reg-save").click();
    await expectErrorModal(page, "마루 데이터 ID·이름·키 패턴을 입력하세요.", "dmd-dataMng-02-required-error");

    await tid(page, "data-mng-reg-id").fill("e2e_usr_lower");
    await tid(page, "data-mng-reg-name").fill("소문자 ID");
    await tid(page, "data-mng-reg-pattern").fill(KEY_PATTERN);
    await tid(page, "data-mng-reg-save").click();
    await expectErrorModal(page, "영문 대문자로 시작하고 영문 대문자·숫자·_ 만 쓸 수 있습니다");

    await tid(page, "data-mng-reg-id").fill("E2E.USR BAD");
    await tid(page, "data-mng-reg-save").click();
    await expectErrorModal(page, "점·콤마·공백을 쓸 수 없습니다");
    expectOnly4xx(watcher, "dataMng 검증");
    // 팝업이 떠 있으면 뒤 화면이 눌리지 않으므로 [취소]로 닫고 조회한다. 실패한 등록은 목록에 남지 않는다.
    await cancelRegPopup(page);
    await tid(page, "data-mng-search-id").fill("E2E.USR");
    await headerBtn(page, "조회").click();
    await expect(tid(page, "data-mng-list-empty")).toHaveText("조회된 마루 데이터가 없습니다");
    await tid(page, "data-mng-search-id").fill("");
    watcher.assertClean("dataMng");
  });

  test("TC-DMD-MNG-03 등록(C) — 팝업에서 입력 후 등록하면 토스트가 뜨고 같은 화면 오른쪽에 그 ID 의 상세가 뜬다", async () => {
    await openRegPopup(page);
    // 팝업은 열 때마다 새로 마운트되어 앞 단계의 입력이 남아 있지 않다.
    await expect(tid(page, "data-mng-reg-id")).toHaveValue("");
    await tid(page, "data-mng-reg-id").fill(MD);
    await tid(page, "data-mng-reg-name").fill(NAME);
    await tid(page, "data-mng-reg-pattern").fill(KEY_PATTERN);
    await tid(page, "data-mng-reg-desc").fill("사용자 여정 E2E 가 만든 마루 데이터");
    await tid(page, "data-mng-reg-lvl").selectOption("2");
    await snap(page, "dmd-dataMng-03-form-filled");
    await tid(page, "data-mng-reg-save").click();
    await expectToast(page, "등록했습니다");

    // 탭을 새로 열지 않는다 — 같은 dataMng 화면에서 등록 팝업이 닫히고 방금 만든 데이터의 상세가 보인다.
    await expect(footerScreenId(page)).toHaveText("dataMng");
    await expect(tid(page, "data-mng-register-form")).toHaveCount(0);
    await expect(tid(page, "data-edit-id")).toHaveText(MD, { timeout: 20_000 });
    await expect(tid(page, "data-edit-name")).toHaveValue(NAME);
    await expect(tid(page, "data-edit-status")).toHaveText("INUSE");
    await expect(tid(page, "data-edit-lvl")).toHaveValue("2");
    await expect(tid(page, "data-edit-desc")).toHaveValue("사용자 여정 E2E 가 만든 마루 데이터");
    // 등록하면 BASE(전체) 카테고리가 함께 생긴다(카드 ③ 카테고리 요약 그리드).
    await expect(tid(page, "data-edit-categories").locator('.ag-row[row-id="BASE"]')).toContainText("열림", { timeout: 20_000 });
    await expect(tid(page, "data-edit-item-count")).toHaveText("0");
    watcher.assertClean("dataMng 등록");
  });

  test("TC-DMD-MNG-04 조회(R) — ID·이름·상태 조건을 바꿔 가며 조회한다", async () => {
    await openDmd(page, "마루 데이터", "dataMng");
    const list = tid(page, "data-mng-list");
    // 등록 팝업은 닫혀 있다.
    await expect(tid(page, "data-mng-register-form")).toHaveCount(0);

    await tid(page, "data-mng-search-id").fill(MD);
    await headerBtn(page, "조회").click();
    await expect(gridRow(list, MD, "maruDataId")).toBeVisible({ timeout: 20_000 });
    await expect(list.locator(".grid-panel-count")).toHaveText("1건");
    await expect(gridRow(list, MD, "maruDataId").locator('.ag-cell[col-id="maruDataName"]')).toHaveText(NAME);
    await expect(gridRow(list, MD, "maruDataId").locator('.ag-cell[col-id="sourceKind"]')).toHaveText("MDM");
    await expect(gridRow(list, MD, "maruDataId").locator('.ag-cell[col-id="status"]')).toHaveText("INUSE");
    await layout.layout(page, "dataMng 목록 채워짐");
    await snap(page, "dmd-dataMng-04-searched");

    // 이름 조건 + Enter 키 조회.
    await tid(page, "data-mng-search-id").fill("");
    await tid(page, "data-mng-search-name").fill(NAME);
    await tid(page, "data-mng-search-name").press("Enter");
    await expect(gridRow(list, MD, "maruDataId")).toBeVisible({ timeout: 20_000 });

    // 상태 — INUSE 면 보이고 DEPRECATED 면 빠진다.
    await tid(page, "data-mng-search-status").selectOption("INUSE");
    await headerBtn(page, "조회").click();
    await expect(gridRow(list, MD, "maruDataId")).toBeVisible({ timeout: 20_000 });
    await tid(page, "data-mng-search-status").selectOption("DEPRECATED");
    await headerBtn(page, "조회").click();
    await expect(tid(page, "data-mng-list-empty")).toBeVisible({ timeout: 20_000 });
    await expect(gridRow(list, MD, "maruDataId")).toHaveCount(0);
    await snap(page, "dmd-dataMng-04-empty");

    // 조건에 맞는 것이 없으면 빈 안내.
    await tid(page, "data-mng-search-status").selectOption("");
    await tid(page, "data-mng-search-name").fill(`없는이름_${RUN}`);
    await headerBtn(page, "조회").click();
    await expect(tid(page, "data-mng-list-empty")).toHaveText("조회된 마루 데이터가 없습니다");

    // 초기화 버튼이 없으므로 사용자가 조건을 직접 지우고 다시 조회한다.
    await expect(screen(page).getByRole("button", { name: "초기화" })).toHaveCount(0);
    await tid(page, "data-mng-search-name").fill("");
    await tid(page, "data-mng-search-id").fill(MD);
    await headerBtn(page, "조회").click();
    await expect(gridRow(list, MD, "maruDataId")).toBeVisible({ timeout: 20_000 });
    watcher.assertClean("dataMng 조회");
  });

  test("TC-DMD-MNG-05 같은 ID 로 다시 등록하면 중복 문구로 거부되고, [취소] 해도 보던 상세는 그대로다", async () => {
    // 앞 단계에서 이 데이터의 상세를 보고 있었다.
    await expect(tid(page, "data-edit-id")).toHaveText(MD);
    await openRegPopup(page);
    await tid(page, "data-mng-reg-id").fill(MD);
    await tid(page, "data-mng-reg-name").fill("중복 시도");
    await tid(page, "data-mng-reg-pattern").fill(KEY_PATTERN);
    await tid(page, "data-mng-reg-save").click();
    await expectErrorModal(page, "마루 코드·마루 데이터에 같은 ID 가 있습니다", "dmd-dataMng-05-duplicate");
    expectOnly4xx(watcher, "dataMng 중복");
    // 거부된 등록은 팝업이 입력값을 유지한 채 열려 있다. (오류창이 팝업 위에 떴다 닫히므로, 오류창 본문이
    // 사라졌는지는 `expectErrorModal` 이 오류창 본문 기준으로 이미 확인했다.)
    await expect(tid(page, "data-mng-register-form")).toBeVisible();
    await expect(footerScreenId(page)).toHaveText("dataMng");
    await expect(tid(page, "data-mng-reg-id")).toHaveValue(MD);
    // [취소] 는 팝업만 닫는다 — 보던 상세는 그대로다.
    await cancelRegPopup(page);
    await expect(tid(page, "data-edit-id")).toHaveText(MD, { timeout: 20_000 });
    watcher.assertClean("dataMng");
  });

  test("TC-DMD-MNG-06 목록의 행을 누르면 오른쪽 상세가 그 ID 로 바뀐다", async () => {
    // 등록 팝업을 열었다 닫아도 선택은 그대로이고, 행을 누르면 그 행의 상세가 다시 뜬다.
    await openRegPopup(page);
    await cancelRegPopup(page);
    await expect(tid(page, "data-edit-id")).toHaveText(MD);
    await gridRow(tid(page, "data-mng-list"), MD, "maruDataId").click();
    await expect(tid(page, "data-edit-id")).toHaveText(MD, { timeout: 20_000 });
    await expect(tid(page, "data-mng-register-form")).toHaveCount(0);
    watcher.assertClean("dataMng 행 선택");
  });

  test("TC-DMD-EDIT-01 상세 배치 — ① 헤더·② 추가 컬럼 라벨·③ 카테고리 요약과 항목 수", async () => {
    await expect(breadcrumb(page)).toContainText("마루 MDM > 마스터데이터 > 마루 데이터");
    await expect(screen(page).getByText("① 헤더")).toBeVisible();
    await expect(screen(page).getByText("② 추가 컬럼 라벨")).toBeVisible();
    await expect(screen(page).getByText(/③ 카테고리 요약/)).toBeVisible();
    for (let i = 1; i <= 10; i++) {
      await expect(tid(page, `data-edit-attr${String(i).padStart(2, "0")}Name`)).toBeEditable();
    }
    await expect(tid(page, "data-edit-item-edit")).toBeEnabled();
    await layout.layout(page, "dataMng 상세");
    await snap(page, "dmd-dataMng-06-detail");
    watcher.assertClean("dataMng 상세");
  });

  test("TC-DMD-EDIT-02 수정(U) — 이름·설명·라벨을 바꿔 저장하면 다시 불러와도 유지된다", async () => {
    await tid(page, "data-edit-name").fill(NEW_NAME);
    await tid(page, "data-edit-desc").fill("설명을 고쳤다");
    await tid(page, "data-edit-attr01Name").fill("국가명");
    await tid(page, "data-edit-attr02Name").fill("비고");
    await layout.layout(page, "dataMng 편집 중");
    await tid(page, "data-edit-save").click();
    await expectToast(page, "저장했습니다");

    // 목록에도 바뀐 이름이 보인다.
    const list = tid(page, "data-mng-list");
    await expect(gridRow(list, MD, "maruDataId").locator('.ag-cell[col-id="maruDataName"]')).toHaveText(NEW_NAME, {
      timeout: 20_000,
    });
    // 선택을 비웠다가 다시 고르면(서버에서 다시 읽는다) 저장한 값이 그대로다.
    await reselectMng(page, MD);
    await expect(tid(page, "data-edit-name")).toHaveValue(NEW_NAME);
    await expect(tid(page, "data-edit-desc")).toHaveValue("설명을 고쳤다");
    await expect(tid(page, "data-edit-attr01Name")).toHaveValue("국가명");
    await expect(tid(page, "data-edit-attr02Name")).toHaveValue("비고");
    await expect(tid(page, "data-edit-attr03Name")).toHaveValue("");
    await snap(page, "dmd-dataMng-07-saved");
    watcher.assertClean("dataMng 저장");
  });

  test("TC-DMD-EDIT-03 이름 누락·잘못된 키 패턴 정규식은 저장을 막는다", async () => {
    await expect(tid(page, "data-edit-name")).toHaveValue(NEW_NAME);
    await tid(page, "data-edit-name").fill("");
    await tid(page, "data-edit-save").click();
    await expectErrorModal(page, "이름·키 패턴을 입력하세요.");

    await tid(page, "data-edit-name").fill(NEW_NAME);
    await tid(page, "data-edit-pattern").fill("[A-Z");
    await tid(page, "data-edit-save").click();
    await expectErrorModal(page, "키 패턴 정규식이 올바르지 않습니다", "dmd-dataMng-08-invalid-pattern");
    expectOnly4xx(watcher, "dataMng 검증");

    // 다시 불러오면 저장된 값으로 돌아간다(거부된 값은 남지 않는다).
    await reselectMng(page, MD);
    await expect(tid(page, "data-edit-pattern")).toHaveValue(KEY_PATTERN, { timeout: 20_000 });
    watcher.assertClean("dataMng");
  });

  test("TC-DMD-EDIT-04 다른 담당자(stw2)가 먼저 저장하면 내 저장은 충돌 안내 후 최신 값으로 다시 불러온다", async ({
    browser,
  }, testInfo) => {
    // stw 는 이미 이 마루 데이터를 불러 둔 상태다.
    await expect(tid(page, "data-edit-desc")).toHaveValue("설명을 고쳤다");

    const other = await openAs(browser, "stw2", testInfo);
    try {
      await openDmd(other.page, "마루 데이터", "dataMng");
      await selectMng(other.page, MD);
      await tid(other.page, "data-edit-desc").fill("stw2 가 먼저 고친 설명");
      await tid(other.page, "data-edit-save").click();
      await expectToast(other.page, "저장했습니다");
      other.watcher.assertClean("dataMng(stw2)");
    } finally {
      await other.page.context().close();
    }

    await tid(page, "data-edit-desc").fill("stw 가 나중에 고친 설명");
    await tid(page, "data-edit-save").click();
    await expectErrorModal(page, CONFLICT, "dmd-dataMng-09-conflict");
    expectOnly4xx(watcher, "dataMng 충돌");
    await expect(tid(page, "data-edit-desc")).toHaveValue("stw2 가 먼저 고친 설명", { timeout: 20_000 });

    // 폐기는 D 장에서 취소·확인을 모두 누르고, [항목 편집 →] 은 바로 다음 시험에서 누른다.
    await assertAllButtonsPressed(page, "dataMng", {
      "data-edit-deprecate": "폐기 — TC-DMD-DEL 에서 누른다",
      "data-edit-item-edit": "[항목 편집 →] — TC-DMD-MNG-07 에서 누른다(누르면 다른 탭으로 옮겨 간다)",
      "데이터 등록": "[데이터 등록] — TC-DMD-MNG-02·03·05 에서 눌렀다(팝업이 닫힌 상태에서 이 검사를 한다)",
    });
    watcher.assertClean("dataMng");
  });

  test("TC-DMD-MNG-07 [항목 편집 →] 을 누르면 항목 편집 탭이 그 마루 데이터로 열린다", async () => {
    await tid(page, "data-edit-item-edit").click();
    await expect(footerScreenId(page)).toHaveText("dataItemMng", { timeout: 30_000 });
    await expect(tid(page, "item-current")).toContainText(MD, { timeout: 20_000 });
    await expect(tid(page, "item-tab-grid")).toBeVisible();
    await expect(itemList(page).locator(".grid-panel-title")).toContainText(`항목 — ${NEW_NAME}`, { timeout: 20_000 });
    await expect(itemCount(page)).toHaveText("0건");
    // 라벨을 붙였으므로 항목 편집의 동적 열에 그대로 보인다.
    await expect(itemList(page).locator(".ag-header-cell-text").filter({ hasText: /^국가명$/ })).toHaveCount(1);
    await snap(page, "dmd-dataMng-10-to-itemMng");
    watcher.assertClean("dataMng → dataItemMng");
  });
  test("TC-DMD-EDIT-99 배치·표시 검사 모음 — 이 장에서 본 화면 상태에 배치 위반·빈 상태 안내 누락이 없다", async () => {
    layout.assertEmpty("A 마루 데이터·수정");
  });
});

// ═══════════════════════════ B. 항목 편집·CSV 업로드·트리 ═══════════════════════════

test.describe("B 항목 편집·CSV 업로드·트리 보기", () => {
  test.describe.configure({ mode: "serial" });

  const MD = mdId("DMB");
  const NAME = `E2E 항목 ${RUN}`;
  let page: Page;
  let watcher: Watcher;
  const layout = new Findings();

  test.beforeAll(async ({ browser }, testInfo) => {
    ({ page, watcher } = await openAs(browser, "stw", testInfo));
  });
  test.afterAll(async () => {
    await page?.context().close();
  });

  test("TC-DMD-ITEM-00 준비 — 계층 2칸·라벨 2개짜리 마루 데이터를 화면으로 만든다", async () => {
    await closeTabs(page);
    await registerMaruData(page, { id: MD, name: NAME, lvl: "2" });
    await saveLabels(page, { attr01Name: "국가명", attr02Name: "비고" });
    watcher.assertClean("준비");
  });

  test("TC-DMD-ITEM-01 항목 편집 화면 배치 — 동적 열(계층·라벨)과 빈 목록", async () => {
    await closeTabs(page);
    await openDmd(page, "항목 편집", "dataItemMng");
    await expect(breadcrumb(page)).toContainText(/마루 MDM > 마스터데이터 > 항목 편집/);
    await selectItemMaru(page, MD);
    // 탭 셋과 오른쪽 열(항목 이력 자리 — 이력을 부르기 전에도 패널이 보이고 안내만 있다).
    await expect(tid(page, "item-tab-grid")).toHaveText("항목");
    await expect(tid(page, "item-tab-tree")).toHaveText("트리");
    await expect(tid(page, "item-tab-cate")).toHaveText("카테고리");
    await expect(tid(page, "item-history")).toBeVisible();
    await expect(tid(page, "item-history-empty")).toHaveText("행의 [이력] 을 누르면 여기에 보입니다");
    await expect(tid(page, "item-form")).toHaveCount(0);
    await expect(itemList(page).locator(".grid-panel-title")).toContainText(`항목 — ${NAME}`);
    await expect(itemCount(page)).toHaveText("0건");
    // 빈 목록이면 그리드 안에 빈 상태 안내가 보여야 한다.
    await layout.later(page, "dataItemMng 빈 목록 안내", () =>
      expect(itemList(page).getByText("조회된 항목이 없습니다.")).toBeVisible({ timeout: 5_000 }),
    );
    const headers = itemList(page).locator(".ag-header-cell-text");
    await expect(headers).toHaveText(["키", "이름", "약칭", "순서", "1차", "2차", "국가명", "비고", "상태", "시작 일시", "작업"]);
    await expect(button(page, "항목 추가")).toBeEnabled();
    await expect(button(page, "CSV 업로드")).toBeEnabled();
    await layout.layout(page, "dataItemMng 초기");
    await snap(page, "dmd-dataItemMng-01-initial");
    watcher.assertClean("dataItemMng");
  });

  test("TC-DMD-ITEM-02 등록(C) — 항목 추가 패널의 모든 칸을 채워 등록한다", async () => {
    await button(page, "항목 추가").click();
    await expect(tid(page, "item-form")).toBeVisible();
    for (const f of ["code", "name", "alterName", "seq", "description", "lvl1", "lvl2", "attr01", "attr02"]) {
      await expect(tid(page, `item-form-${f}`)).toBeVisible();
    }
    // 계층 칸 수 2 → 3차 칸은 없다. 라벨 없는 attr03 칸도 없다.
    await expect(tid(page, "item-form-lvl3")).toHaveCount(0);
    await expect(tid(page, "item-form-attr03")).toHaveCount(0);
    await fillItemForm(page, {
      code: "KRPUS", name: "부산항", alterName: "부산", seq: "10", description: "남해안 대표 항구",
      lvl1: "KR", lvl2: "BUSAN", attr01: "대한민국", attr02: "주요항",
    });
    await layout.layout(page, "dataItemMng 등록 패널");
    await snap(page, "dmd-dataItemMng-02-form");
    await tid(page, "item-form-submit").click();
    await expectToast(page, "등록했습니다");
    await expect(tid(page, "item-form")).toHaveCount(0);
    await expect(itemCell(page, "KRPUS", "name")).toHaveText("부산항", { timeout: 20_000 });
    await expect(itemCell(page, "KRPUS", "alterName")).toHaveText("부산");
    await expect(itemCell(page, "KRPUS", "seq")).toHaveText("10");
    await expect(itemCell(page, "KRPUS", "lvl2")).toHaveText("BUSAN");
    await expect(itemCell(page, "KRPUS", "attr01")).toHaveText("대한민국");
    await expect(itemCell(page, "KRPUS", "open")).toHaveText("열림");

    await registerItem(page, { code: "KRINC", name: "인천항", seq: "20", lvl1: "KR", lvl2: "INCHEON", attr01: "대한민국" });
    await registerItem(page, { code: "CNSHA", name: "상하이항", seq: "30", lvl1: "CN", lvl2: "SHANGHAI", attr01: "중국" });
    await expect(itemCount(page)).toHaveText("3건");
    await layout.layout(page, "dataItemMng 목록 채워짐");
    watcher.assertClean("dataItemMng 등록");
  });

  test("TC-DMD-ITEM-03 흔한 입력 실수(빈 값·키 형식·중복 키·순서 문자·계층 빈칸)는 문구로 막힌다", async () => {
    await button(page, "항목 추가").click();
    await tid(page, "item-form-submit").click();
    await expectErrorModal(page, "키를 입력하세요", "dmd-dataItemMng-03-required");

    await fillItemForm(page, { code: "bad key", name: "나쁜 키" });
    await tid(page, "item-form-submit").click();
    await expectErrorModal(page, "키가 키 패턴에 맞지 않습니다");

    await fillItemForm(page, { code: "KRPUS", name: "중복" });
    await tid(page, "item-form-submit").click();
    await expectErrorModal(page, "이미 있는 키입니다");

    await fillItemForm(page, { code: "KRX01", name: "순서 문자", seq: "첫째" });
    await tid(page, "item-form-submit").click();
    await expectErrorModal(page, "순서는 정수여야 합니다.");

    await fillItemForm(page, { code: "KRX01", name: "계층 빈칸", seq: "", lvl1: "", lvl2: "BUSAN" });
    await tid(page, "item-form-submit").click();
    await expectErrorModal(page, "계층 중간 칸이 비어 있습니다");
    expectOnly4xx(watcher, "dataItemMng 검증");

    // 취소하면 패널이 닫히고 아무것도 등록되지 않는다.
    await tid(page, "item-form-cancel").click();
    await expect(tid(page, "item-form")).toHaveCount(0);
    await expect(itemRow(page, "KRX01")).toHaveCount(0);
    await expect(itemCount(page)).toHaveText("3건");
    watcher.assertClean("dataItemMng");
  });

  test("TC-DMD-ITEM-04 조회(R) — 키·이름 조건으로 걸러지고 맞지 않으면 0건이다", async () => {
    await tid(page, "item-search-code").fill("KR");
    await searchItems(page);
    await expect(itemRow(page, "KRPUS")).toBeVisible({ timeout: 20_000 });
    await expect(itemRow(page, "KRINC")).toBeVisible();
    await expect(itemRow(page, "CNSHA")).toHaveCount(0);
    await expect(itemCount(page)).toHaveText("2건");

    await tid(page, "item-search-code").fill("");
    await tid(page, "item-search-name").fill("상하이");
    await tid(page, "item-search-name").press("Enter");
    await expect(itemRow(page, "CNSHA")).toBeVisible({ timeout: 20_000 });
    await expect(itemCount(page)).toHaveText("1건");

    await tid(page, "item-search-name").fill(`없는이름${RUN}`);
    await searchItems(page);
    await expect(itemCount(page)).toHaveText("0건");

    // 카테고리 조건은 BASE 뿐이라 "전체" 하나만 있다(BASE 는 고르지 않는다).
    await expect(tid(page, "item-search-cate").locator("option")).toHaveText(["전체"]);
    await tid(page, "item-search-cate").selectOption("");
    await tid(page, "item-search-name").fill("");
    await searchItems(page);
    await expect(itemCount(page)).toHaveText("3건");
    watcher.assertClean("dataItemMng 조회");
  });

  test("TC-DMD-ITEM-05 수정(U) — 칸을 고쳐 취소하면 되돌아가고, 저장하면 유지되며 이력 패널에 남는다", async () => {
    await editItemCell(page, "CNSHA", "name", "상해항");
    await expect(tid(page, "item-save-CNSHA")).toBeVisible();
    await tid(page, "item-cancel-CNSHA").click();
    await expect(itemCell(page, "CNSHA", "name")).toHaveText("상하이항");
    await expect(tid(page, "item-close-CNSHA")).toBeVisible();

    await editItemCell(page, "CNSHA", "name", "상해항");
    await editItemCell(page, "CNSHA", "alterName", "상해");
    await editItemCell(page, "CNSHA", "seq", "31");
    await editItemCell(page, "CNSHA", "attr02", "환적항");
    await layout.layout(page, "dataItemMng 셀 편집 중");
    await snap(page, "dmd-dataItemMng-05-editing");
    await tid(page, "item-save-CNSHA").click();
    await expectToast(page, "저장했습니다");
    await searchItems(page);
    await expect(itemCell(page, "CNSHA", "name")).toHaveText("상해항", { timeout: 20_000 });
    await expect(itemCell(page, "CNSHA", "alterName")).toHaveText("상해");
    await expect(itemCell(page, "CNSHA", "seq")).toHaveText("31");
    await expect(itemCell(page, "CNSHA", "attr02")).toHaveText("환적항");

    await tid(page, "item-history-CNSHA").click();
    const panel = tid(page, "item-history");
    await expect(panel).toContainText("이력 — CNSHA");
    const rows = panel.locator(".ag-center-cols-container .ag-row");
    await expect(rows).toHaveCount(2, { timeout: 20_000 });
    await expect(rows.nth(0)).toContainText("생성");
    await expect(rows.nth(1)).toContainText("변경");
    await expect(rows.nth(1)).toContainText("상해항");
    await layout.layout(page, "dataItemMng 이력 패널");
    await snap(page, "dmd-dataItemMng-05-history");
    watcher.assertClean("dataItemMng 수정");
  });

  test("TC-DMD-ITEM-06 닫기(D)·다시 열기 — 닫힌 항목은 숨겨지고, 같은 키 등록은 다시 열기로 안내한다", async () => {
    await tid(page, "item-close-KRINC").click();
    await expectToast(page, "닫았습니다");
    await expect(itemRow(page, "KRINC")).toHaveCount(0, { timeout: 20_000 });
    await expect(itemCount(page)).toHaveText("2건");

    await tid(page, "item-search-closed").selectOption("Y");
    await searchItems(page);
    await expect(itemCell(page, "KRINC", "open")).toHaveText("닫힘", { timeout: 20_000 });
    await expect(tid(page, "item-reopen-KRINC")).toBeVisible();
    // 닫힌 행은 칸을 고칠 수 없다.
    await itemCell(page, "KRINC", "name").click();
    await expect(itemCell(page, "KRINC", "name").locator("input")).toHaveCount(0);
    await snap(page, "dmd-dataItemMng-06-closed");

    await registerItemExpectingError(page, { code: "KRINC", name: "다시 등록" }, "닫힌 키입니다. 새로 등록할 수 없으니 다시 여세요");
    expectOnly4xx(watcher, "닫힌 키 등록");
    await tid(page, "item-form-cancel").click();

    await tid(page, "item-reopen-KRINC").click();
    await expectToast(page, "다시 열었습니다");
    await expect(itemCell(page, "KRINC", "open")).toHaveText("열림", { timeout: 20_000 });
    await tid(page, "item-search-closed").selectOption("N");
    await searchItems(page);
    await expect(itemCount(page)).toHaveText("3건");
    await tid(page, "item-history-close").click();
    await expect(tid(page, "item-history-empty")).toBeVisible();
    watcher.assertClean("dataItemMng 닫기");
  });

  test("TC-DMD-ITEM-07 다른 담당자(stw2)가 먼저 고친 항목을 저장하면 충돌 안내 후 최신 값으로 다시 불러온다", async ({
    browser,
  }, testInfo) => {
    await expect(itemCell(page, "KRPUS", "name")).toHaveText("부산항");

    const other = await openAs(browser, "stw2", testInfo);
    try {
      await openDmd(other.page, "항목 편집", "dataItemMng");
      await selectItemMaru(other.page, MD);
      await editItemCell(other.page, "KRPUS", "name", "부산신항");
      await tid(other.page, "item-save-KRPUS").click();
      await expectToast(other.page, "저장했습니다");
      other.watcher.assertClean("dataItemMng(stw2)");
    } finally {
      await other.page.context().close();
    }

    await editItemCell(page, "KRPUS", "name", "부산북항");
    await tid(page, "item-save-KRPUS").click();
    await expectErrorModal(page, CONFLICT, "dmd-dataItemMng-07-conflict");
    expectOnly4xx(watcher, "dataItemMng 충돌");
    await expect(itemCell(page, "KRPUS", "name")).toHaveText("부산신항", { timeout: 20_000 });
    watcher.assertClean("dataItemMng");
  });

  test("TC-DMD-CSV-01 CSV 업로드 팝업 배치 — 안내 문구·파일 선택 전 비활성 버튼", async () => {
    await openCsvPopup(page, NAME);
    await expect(csvPop(page)).toContainText("열 2차까지 계층, 추가 칸 국가명·비고");
    await expect(csvPop(page)).toContainText(`헤더는 ${CSV_COLS.join(",")} 20열 고정 순서입니다.`);
    await expect(page.getByTestId("csv-pop-validate")).toBeDisabled();
    await expect(page.getByTestId("csv-pop-save")).toBeDisabled();
    await snap(page, "dmd-dataCsvUploadPop-01-open");
    // 머리의 X 로 닫았다가 다시 연다.
    await modal(page).locator(".cm-modal-header").getByRole("button", { name: "닫기" }).click();
    await expect(csvPop(page)).toBeHidden();
    watcher.assertClean("CSV 팝업");
  });

  test("TC-DMD-CSV-02 헤더 열이 빠진 CSV 는 헤더 오류로 표시되고 저장할 수 없다", async () => {
    const file = writeCsv("dmd-header-missing", [
      CSV_COLS.slice(0, 19).join(","),
      CSV_COLS.slice(0, 19).map((c) => (c === "code" ? "KRH01" : c === "name" ? "헤더누락" : "")).join(","),
    ]);
    await openCsvPopup(page, NAME);
    await chooseCsv(page, file);
    await page.getByTestId("csv-pop-validate").click();
    await expect(page.getByTestId("csv-pop-summary")).toContainText("오류 1", { timeout: 20_000 });
    await expect(csvRow(page, 1)).toContainText("20열 고정 순서와 다릅니다");
    await expect(page.getByTestId("csv-pop-save")).toBeDisabled();
    await snap(page, "dmd-dataCsvUploadPop-02-header-error");
    await modal(page).locator(".cm-modal-footer").getByRole("button", { name: "닫기" }).click();
    await expect(csvPop(page)).toBeHidden();
    watcher.assertClean("CSV 헤더 오류");
  });

  test("TC-DMD-CSV-03 행 오류(키 형식·순서 문자·중복 키·라벨 없는 칸·계층 충돌·빈칸·열 수)는 그 줄에만 표시된다", async () => {
    const file = writeCsv("dmd-row-errors", [
      CSV_COLS.join(","),
      csvLine({ code: "KRE001", name: "정상 행", seq: "1", lvl1: "KR", lvl2: "SEOUL", attr01: "대한민국" }), // 2
      csvLine({ code: "kr bad", name: "키 형식", lvl1: "KR", lvl2: "SEOUL" }), // 3
      csvLine({ code: "KRE002", name: "순서 문자", seq: "abc", lvl1: "KR", lvl2: "SEOUL" }), // 4
      csvLine({ code: "KRE003", name: "중복1", lvl1: "KR", lvl2: "SEOUL" }), // 5
      csvLine({ code: "KRE003", name: "중복2", lvl1: "KR", lvl2: "SEOUL" }), // 6
      csvLine({ code: "KRE004", name: "라벨 없는 칸", lvl1: "KR", lvl2: "SEOUL", attr03: "값" }), // 7
      csvLine({ code: "CNE001", name: "계층 충돌", lvl1: "CN", lvl2: "BUSAN" }), // 8
      csvLine({ code: "KRE005", name: "계층 빈칸", lvl2: "SEOUL" }), // 9
      csvLine({ code: "KRE006", name: "열 수 초과" }) + ",넘친값", // 10
    ]);
    await openCsvPopup(page, NAME);
    await chooseCsv(page, file);
    await page.getByTestId("csv-pop-validate").click();
    await expect(page.getByTestId("csv-pop-summary")).toContainText(/오류 [1-9]/, { timeout: 20_000 });
    await expect(csvRow(page, 2).locator('.ag-cell[col-id="issues"]')).toHaveText("");
    await expect(csvRow(page, 3)).toContainText("키 패턴");
    await expect(csvRow(page, 4)).toContainText("정수");
    await expect(csvRow(page, 6)).toContainText("같은 키가 두 번 있습니다");
    await expect(csvRow(page, 7)).toContainText("라벨이 없는 추가 컬럼");
    await expect(csvRow(page, 8)).toContainText("같은 계층 값이 다른 상위 아래에 있습니다");
    await expect(csvRow(page, 9)).toContainText("계층 중간 칸이 비어 있습니다");
    await expect(csvRow(page, 10)).toContainText("열 수(21)가 20(고정 컬럼 수)과 다릅니다");
    await expect(page.getByTestId("csv-pop-save")).toBeDisabled();
    await snap(page, "dmd-dataCsvUploadPop-03-row-errors");
    await modal(page).locator(".cm-modal-footer").getByRole("button", { name: "닫기" }).click();
    // 오류 CSV 는 아무것도 저장하지 않았다.
    await expect(itemRow(page, "KRE001")).toHaveCount(0);
    await expect(itemCount(page)).toHaveText("3건");
    watcher.assertClean("CSV 행 오류");
  });

  test("TC-DMD-CSV-04 정상 CSV(신규 55·수정 1)를 검증·저장하면 목록에 반영되고, 같은 파일은 변경없음이다", async () => {
    const lines = [CSV_COLS.join(",")];
    const krLvl2 = ["SEOUL", "BUSAN", "INCHEON"];
    for (let i = 1; i <= 30; i++) {
      const n = String(i).padStart(3, "0");
      lines.push(csvLine({ code: `KRP${n}`, name: `한국 항목 ${n}`, seq: String(100 + i), lvl1: "KR", lvl2: krLvl2[i % 3], attr01: "대한민국" }));
    }
    const cnLvl2 = ["SHANGHAI", "NINGBO"];
    for (let i = 1; i <= 25; i++) {
      const n = String(i).padStart(3, "0");
      lines.push(csvLine({ code: `CNP${n}`, name: `중국 항목 ${n}`, seq: String(200 + i), lvl1: "CN", lvl2: cnLvl2[i % 2], attr01: "중국" }));
    }
    lines.push(
      csvLine({ code: "CNSHA", name: "상해항", alter_name: "상해", seq: "31", lvl1: "CN", lvl2: "SHANGHAI", attr01: "중국", attr02: "CSV 로 고친 비고" }),
    );
    const file = writeCsv("dmd-items", lines);

    await openCsvPopup(page, NAME);
    await chooseCsv(page, file);
    await page.getByTestId("csv-pop-validate").click();
    await expect(page.getByTestId("csv-pop-summary")).toHaveText("신규 55 · 수정 1 · 변경없음 0 · 오류 0", { timeout: 20_000 });
    await expect(page.getByTestId("csv-pop-save")).toBeEnabled();
    await snap(page, "dmd-dataCsvUploadPop-04-preview");
    await page.getByTestId("csv-pop-save").click();
    await expectToast(page, "저장했습니다");
    await expect(csvPop(page)).toBeHidden();
    await expect(itemCount(page)).toHaveText("58건", { timeout: 20_000 });
    await searchItems(page);
    await expect(itemCell(page, "CNSHA", "attr02")).toHaveText("CSV 로 고친 비고");

    // 같은 파일을 다시 검증하면 바뀐 것이 없다.
    await openCsvPopup(page, NAME);
    await chooseCsv(page, file);
    await page.getByTestId("csv-pop-validate").click();
    await expect(page.getByTestId("csv-pop-summary")).toHaveText("신규 0 · 수정 0 · 변경없음 56 · 오류 0", { timeout: 20_000 });
    await modal(page).locator(".cm-modal-footer").getByRole("button", { name: "닫기" }).click();
    await expect(csvPop(page)).toBeHidden();
    watcher.assertClean("CSV 저장");
  });

  test("TC-DMD-ITEM-08 트리 보기 — 펴기·접기·노드로 거르기·거르기 풀기", async () => {
    await tid(page, "item-tab-tree").click();
    const tree = tid(page, "item-tree");
    const kr = tree.locator(".tree-item").filter({ hasText: /^KR \(\d+건\)$/ });
    await expect(kr).toHaveText("KR (32건)", { timeout: 20_000 });
    await expect(tree.locator(".tree-item").filter({ hasText: /^CN \(\d+건\)$/ })).toHaveText("CN (26건)");
    await expect(tid(page, "item-tree-to-grid")).toBeDisabled();

    await screen(page).getByRole("button", { name: "모두 펴기" }).click();
    await expect(tree.locator(".tree-item").filter({ hasText: /^SEOUL \(\d+건\)$/ })).toBeVisible();
    await expect(tree.locator(".tree-item").filter({ hasText: /^· KRPUS / })).toBeVisible();
    await layout.layout(page, "dataItemMng 트리 펼침");
    await snap(page, "dmd-dataItemMng-09-tree");
    await screen(page).getByRole("button", { name: "모두 접기" }).click();
    await expect(tree.locator(".tree-item").filter({ hasText: /^SEOUL \(\d+건\)$/ })).toHaveCount(0);

    await kr.click();
    await expect(tid(page, "item-tree-to-grid")).toBeEnabled();
    await assertAllButtonsPressed(page, "dataItemMng 트리", {
      항목: "[항목] 탭 — 아래에서 탭 머리로 누른다",
      카테고리: "[카테고리] 탭 — 장 C 에서 누른다",
      "item-tree-to-grid": "이 노드로 보기 — 바로 다음 줄에서 누른다(누르면 그리드로 바뀌어 이 목록에서 볼 수 없다)",
    });
    await tid(page, "item-tree-to-grid").click();
    await expect(tid(page, "item-node-filter-chip")).toContainText("KR 아래", { timeout: 20_000 });
    await expect(itemCount(page)).toHaveText("32건");
    await expect(itemRow(page, "CNSHA")).toHaveCount(0);
    await snap(page, "dmd-dataItemMng-09-node-filter");

    await tid(page, "item-node-filter-clear").click();
    await expect(tid(page, "item-node-filter-chip")).toHaveCount(0);
    await expect(itemCount(page)).toHaveText("58건", { timeout: 20_000 });
    // 탭 머리로 트리에 갔다가 그리드로 돌아온다.
    await tid(page, "item-tab-tree").click();
    await expect(tid(page, "item-tree-panel")).toBeVisible();
    await tid(page, "item-tab-grid").click();
    await expect(itemCount(page)).toHaveText("58건");
    await assertAllButtonsPressed(page, "dataItemMng", {
      카테고리: "[카테고리] 탭 — 장 C 에서 누른다",
      다음: "쪽 이동은 TC-DMD-PAGE-01 에서 따로 누른다(막대가 그리드에 가려지는 결함이 있어 독립 장으로 뗐다)",
    });
    watcher.assertClean("dataItemMng 트리");
  });
  test("TC-DMD-ITEM-99 배치·표시 검사 모음 — 이 장에서 본 화면 상태에 배치 위반·빈 상태 안내 누락이 없다", async () => {
    layout.assertEmpty("B 항목 편집·CSV·트리");
  });

});


// ═══════════════════════════ B2. 항목 쪽 이동 ═══════════════════════════

test.describe("B2 항목 쪽 이동", () => {
  test.describe.configure({ mode: "serial" });

  const MD = mdId("DMP");
  const NAME = `E2E 쪽 ${RUN}`;
  let page: Page;
  let watcher: Watcher;

  test.beforeAll(async ({ browser }, testInfo) => {
    ({ page, watcher } = await openAs(browser, "stw", testInfo));
  });
  test.afterAll(async () => {
    await page?.context().close();
  });

  test("TC-DMD-PAGE-00 준비 — 마루 데이터를 만들고 CSV 로 항목 55건(한 쪽 50건 초과)을 올린다", async () => {
    await registerMaruData(page, { id: MD, name: NAME, lvl: "1" });
    await openDmd(page, "항목 편집", "dataItemMng");
    await selectItemMaru(page, MD);
    const lines = [CSV_COLS.join(",")];
    for (let i = 1; i <= 55; i++) {
      const n = String(i).padStart(3, "0");
      lines.push(csvLine({ code: `PG${n}`, name: `쪽 항목 ${n}`, seq: String(i), lvl1: i % 2 ? "KR" : "CN" }));
    }
    await openCsvPopup(page, NAME);
    await chooseCsv(page, writeCsv("dmd-paging", lines));
    await page.getByTestId("csv-pop-validate").click();
    await expect(page.getByTestId("csv-pop-summary")).toHaveText("신규 55 · 수정 0 · 변경없음 0 · 오류 0", { timeout: 20_000 });
    await page.getByTestId("csv-pop-save").click();
    await expectToast(page, "저장했습니다");
    await expect(itemCount(page)).toHaveText("55건", { timeout: 20_000 });
    watcher.assertClean("준비");
  });

  test("TC-DMD-PAGE-01 쪽 이동 — 50건을 넘으면 쪽 이동 막대가 보이고 다음 쪽으로 넘겼다 돌아온다", async () => {
    const pager = screen(page).getByText(/\d+ \/ \d+ 페이지/);
    await expect(pager).toHaveText("1 / 2 페이지 · 총 55건");
    // 사용자가 누르려면 쪽 이동 막대가 화면 안에 보여야 한다(그리드에 가려지거나 밀려나지 않아야 한다).
    await expect(screen(page).getByRole("button", { name: "다음", exact: true })).toBeInViewport();
    await expect(screen(page).getByRole("button", { name: "이전", exact: true })).toBeDisabled();
    await screen(page).getByRole("button", { name: "다음", exact: true }).click();
    await expect(pager).toHaveText("2 / 2 페이지 · 총 55건", { timeout: 20_000 });
    await expect(itemList(page).locator(".ag-center-cols-container .ag-row")).toHaveCount(5);
    await expect(screen(page).getByRole("button", { name: "다음", exact: true })).toBeDisabled();
    await checkLayout(page, "dataItemMng 2쪽");
    await snap(page, "dmd-dataItemMng-page2");
    await screen(page).getByRole("button", { name: "이전", exact: true }).click();
    await expect(pager).toHaveText("1 / 2 페이지 · 총 55건", { timeout: 20_000 });
    watcher.assertClean("dataItemMng 쪽 이동");
  });
});

/** 항목 추가 패널로 등록을 시도하고 오류 문구를 확인한다. */
async function registerItemExpectingError(page: Page, fields: Record<string, string>, message: string) {
  await fillItemForm(page, fields);
  await tid(page, "item-form-submit").click();
  await expectErrorModal(page, message);
}

// ═══════════════════════════ C. 카테고리 탭·이력 ═══════════════════════════

test.describe("C 카테고리 탭·이력", () => {
  test.describe.configure({ mode: "serial" });

  const MD = mdId("DMC");
  const NAME = `E2E 카테고리 ${RUN}`;
  let page: Page;
  let watcher: Watcher;
  const layout = new Findings();

  test.beforeAll(async ({ browser }, testInfo) => {
    ({ page, watcher } = await openAs(browser, "stw", testInfo));
  });
  test.afterAll(async () => {
    await page?.context().close();
  });

  test("TC-DMD-CATE-00 준비 — 계층 1칸 마루 데이터와 항목 3건을 화면으로 만든다", async () => {
    await closeTabs(page);
    await registerMaruData(page, { id: MD, name: NAME, lvl: "1" });
    await openDmd(page, "항목 편집", "dataItemMng");
    await selectItemMaru(page, MD);
    await registerItem(page, { code: "KRPUS", name: "부산항", lvl1: "KR" });
    await registerItem(page, { code: "KRINC", name: "인천항", lvl1: "KR" });
    await registerItem(page, { code: "CNSHA", name: "상하이항", lvl1: "CN" });
    watcher.assertClean("준비");
  });

  test("TC-DMD-CATE-01 [카테고리] 탭 배치 — BASE 는 닫기 버튼이 없고, 오른쪽 열은 미리보기·카테고리 이력으로 바뀐다", async () => {
    await closeTabs(page);
    await openDmd(page, "항목 편집", "dataItemMng");
    await selectItemMaru(page, MD);
    await openCateTab(page);
    // 고르기 전 — 편집 자리와 카테고리 이력 자리에는 안내만 있다. 항목 이력 패널은 이 탭에 없다.
    await expect(tid(page, "cate-edit-empty")).toHaveText("왼쪽에서 카테고리를 고르세요");
    await expect(tid(page, "cate-history-empty")).toHaveText("왼쪽 목록에서 카테고리를 고르면 이력이 보입니다");
    await expect(tid(page, "cate-preview")).toBeVisible();
    await expect(tid(page, "item-history")).toHaveCount(0);
    await expect(tid(page, "cate-row-BASE")).toContainText("REGEX");
    await expect(tid(page, "cate-match-BASE")).toHaveText("3건");
    await expect(tid(page, "cate-close-BASE")).toHaveCount(0);
    await expect(tid(page, "cate-add-kind")).toHaveValue("TABLE");
    // 머리의 [조회] 는 이 탭에서 카테고리 목록을 다시 읽는다.
    await headerBtn(page, "조회").click();
    await waitIdle(page);
    await expect(tid(page, "cate-row-BASE")).toBeVisible();
    await layout.layout(page, "카테고리 탭 초기");
    await snap(page, "dmd-dataCateTab-01-initial");
    watcher.assertClean("카테고리 탭");
  });

  test("TC-DMD-CATE-02 BASE 정의를 저장하려 하면 예약 카테고리 문구로 거부된다", async () => {
    await tid(page, "cate-row-BASE").click();
    await expect(tid(page, "regex-edit-panel")).toContainText("BASE — REGEX 정의");
    const save = tid(page, "regex-save");
    if (await save.isEnabled()) {
      await save.click();
      await expectErrorModal(page, "예약 카테고리 BASE 는 편집·삭제할 수 없습니다", "dmd-dataCateEdit-02-base");
      expectOnly4xx(watcher, "BASE 저장");
    }
    watcher.assertClean("dataCateEdit BASE");
  });

  test("TC-DMD-CATE-03 REGEX 카테고리 — 등록·대상 후보·미리보기·문법 오류·저장", async () => {
    await tid(page, "cate-add-kind").selectOption("REGEX");
    await addCategory(page, "KRONLY", "한국 항구", "REGEX");
    await expect(tid(page, "regex-edit-panel")).toContainText("KRONLY — REGEX 정의");
    // 오른쪽 열 — 등록한 카테고리의 이력에 「생성」 1행이 바로 남는다.
    await expect(tid(page, "cate-history")).toContainText("카테고리 이력 — KRONLY", { timeout: 20_000 });
    await expect(timelineRows(page, "cate-history")).toHaveCount(1, { timeout: 20_000 });
    await expect(timelineRows(page, "cate-history").first()).toContainText("생성");
    await expect(tid(page, "regex-expr")).toHaveValue("^.*$");
    await expect(tid(page, "regex-target")).toHaveValue("KEY");
    // 대상 후보는 KEY + 계층 칸 수(1)만큼 — 라벨 없는 ATTR 은 없다(D5).
    await expect(tid(page, "regex-target").locator("option")).toHaveText(["KEY", "LVL1"]);

    // 정규식은 값 전체에 맞춘다(서버 matches) — "KR 로 시작" 은 ^KR.* 로 쓴다.
    await tid(page, "regex-expr").fill("^KR.*");
    await expect(tid(page, "preview-count")).toHaveText("매칭 2건", { timeout: 20_000 });
    await expect(tid(page, "preview-panel")).toContainText("KRPUS");
    await expect(tid(page, "preview-panel")).not.toContainText("CNSHA");

    await tid(page, "regex-expr").fill("[");
    await expect(tid(page, "preview-invalid")).toHaveText("정규식 문법이 올바르지 않습니다", { timeout: 20_000 });
    await snap(page, "dmd-dataCateEdit-03-invalid-preview");

    await tid(page, "regex-expr").fill("^KR$");
    await tid(page, "regex-target").selectOption("LVL1");
    await expect(tid(page, "preview-count")).toHaveText("매칭 2건", { timeout: 20_000 });
    await tid(page, "regex-name").fill("한국 항구(계층)");
    await tid(page, "regex-desc").fill("1차가 KR 인 항목");
    await layout.layout(page, "dataCateEdit REGEX 편집");
    await snap(page, "dmd-dataCateEdit-03-regex");
    await tid(page, "regex-save").click();
    await expectToast(page, "저장했습니다");
    await expect(tid(page, "cate-match-KRONLY")).toHaveText("2건", { timeout: 20_000 });
    await expect(tid(page, "cate-row-KRONLY")).toContainText("한국 항구(계층)");
    // 저장하면 카테고리 이력에 「변경」 행이 더해진다.
    await expect(timelineRows(page, "cate-history")).toHaveCount(2, { timeout: 20_000 });
    await expect(timelineRows(page, "cate-history").nth(1)).toContainText("변경");

    // 문법 오류 정의는 저장도 거부된다.
    await tid(page, "regex-expr").fill("(");
    await tid(page, "regex-save").click();
    await expectErrorModal(page, "카테고리 정의가 올바르지 않습니다");
    expectOnly4xx(watcher, "REGEX 저장 오류");
    watcher.assertClean("dataCateEdit REGEX");
  });

  test("TC-DMD-CATE-04 TABLE 카테고리 — 등록하고 후보를 검색·선택해 좌우로 옮긴다", async () => {
    await tid(page, "cate-add-kind").selectOption("TABLE");
    await addCategory(page, "MAJOR", "주요 항구", "TABLE");
    const panel = tid(page, "transfer-list-panel");
    await expect(panel).toBeVisible({ timeout: 20_000 });
    for (const code of ["KRPUS", "KRINC", "CNSHA"]) await expect(tid(page, `transfer-available-${code}`)).toBeVisible();

    // 검색어로 좁혔다가 푼다.
    await tid(page, "transfer-query").fill("인천");
    await expect(tid(page, "transfer-available-KRINC")).toBeVisible();
    await expect(tid(page, "transfer-available-KRPUS")).toHaveCount(0);
    await tid(page, "transfer-query").fill("");

    await tid(page, "transfer-available-KRPUS").click();
    await tid(page, "transfer-available-CNSHA").click();
    await tid(page, "transfer-move-right").click();
    await expect(tid(page, "transfer-member-KRPUS")).toBeVisible();
    await expect(tid(page, "transfer-member-CNSHA")).toBeVisible();
    await layout.layout(page, "dataCateEdit TABLE 편집");
    await snap(page, "dmd-dataCateEdit-04-transfer");
    // 오른쪽에서 골라 왼쪽으로 되돌린다(적용 전이라 서버에는 아무것도 가지 않는다 — 적용은 TC-DMD-CATE-08).
    await tid(page, "transfer-member-KRPUS").click();
    await tid(page, "transfer-member-CNSHA").click();
    await tid(page, "transfer-move-left").click();
    await expect(tid(page, "transfer-available-KRPUS")).toBeVisible();
    await expect(tid(page, "transfer-member-KRPUS")).toHaveCount(0);
    await expect(tid(page, "cate-match-MAJOR")).toHaveText("0건");
    watcher.assertClean("dataCateEdit TABLE");
  });

  test("TC-DMD-CATE-05 닫기·다시 열기 — 닫힌 카테고리는 소속을 바꿀 수 없다", async () => {
    await tid(page, "cate-close-MAJOR").click();
    await expectToast(page, "닫았습니다");
    await expect(tid(page, "cate-reopen-MAJOR")).toBeVisible({ timeout: 20_000 });
    await expect(tid(page, "cate-close-MAJOR")).toHaveCount(0);
    await expect(tid(page, "transfer-apply")).toBeDisabled();
    await expect(tid(page, "transfer-move-right")).toBeDisabled();
    await snap(page, "dmd-dataCateEdit-05-closed");

    // 닫힌 카테고리 ID 로 다시 등록하면 다시 열기로 안내한다. 이미 있는 ID 는 중복으로 거부된다.
    await tid(page, "cate-add-id").fill("MAJOR");
    await tid(page, "cate-add-name").fill("다시 등록");
    await tid(page, "cate-add-submit").click();
    await expectErrorModal(page, "닫힌 키입니다. 새로 등록할 수 없으니 다시 여세요");
    await tid(page, "cate-add-id").fill("KRONLY");
    await tid(page, "cate-add-name").fill("중복 등록");
    await tid(page, "cate-add-submit").click();
    await expectErrorModal(page, "이미 있는 키입니다");
    expectOnly4xx(watcher, "카테고리 중복");

    await tid(page, "cate-reopen-MAJOR").click();
    await expectToast(page, "다시 열었습니다");
    await expect(tid(page, "cate-close-MAJOR")).toBeVisible({ timeout: 20_000 });
    await tid(page, "cate-row-MAJOR").click();
    await expect(tid(page, "transfer-move-right")).toBeEnabled({ timeout: 20_000 });
    await assertAllButtonsPressed(page, "항목 편집 [카테고리] 탭", {
      항목: "[항목] 탭 — 다음 시험(TC-DMD-CATE-06)에서 누른다",
      트리: "[트리] 탭 — 장 B 에서 눌렀다(이 화면은 장 C 에서 새로 열었다)",
      "cate-close-KRONLY": "닫기는 MAJOR 로 확인했다(같은 버튼의 다른 행)",
      "transfer-apply": "적용은 TC-DMD-CATE-08 에서 누른다(서버 결함으로 실패해 장 끝에 둔다)",
    });
    watcher.assertClean("dataCateEdit 닫기");
  });

  test("TC-DMD-CATE-06 항목 편집의 카테고리 조건 — REGEX 카테고리로 걸러진다", async () => {
    // 카테고리 탭에서 [항목] 탭으로 돌아온다(같은 마루 데이터). 카테고리를 쓴 뒤라 조회조건의 카테고리 목록도 새로 만들어졌다.
    await tid(page, "item-tab-grid").click();
    await expect(itemList(page).locator(".grid-panel-title")).toContainText("항목 — ", { timeout: 20_000 });
    await searchItems(page);
    await expect(tid(page, "item-search-cate").locator("option")).toHaveText([
      "전체",
      "한국 항구(계층) (KRONLY)",
      "주요 항구 (MAJOR)",
    ]);
    await tid(page, "item-search-cate").selectOption("KRONLY");
    await searchItems(page);
    await expect(itemRow(page, "KRPUS")).toBeVisible({ timeout: 20_000 });
    await expect(itemRow(page, "KRINC")).toBeVisible();
    await expect(itemRow(page, "CNSHA")).toHaveCount(0);
    await expect(itemCount(page)).toHaveText("2건");

    // 이력용 변경 — KRPUS 이름 수정, KRINC 닫았다가 다시 열기.
    await tid(page, "item-search-cate").selectOption("");
    await searchItems(page);
    await editItemCell(page, "KRPUS", "name", "부산신항");
    await tid(page, "item-save-KRPUS").click();
    await expectToast(page, "저장했습니다");
    await tid(page, "item-close-KRINC").click();
    await expectToast(page, "닫았습니다");
    await tid(page, "item-search-closed").selectOption("Y");
    await searchItems(page);
    await tid(page, "item-reopen-KRINC").click();
    await expectToast(page, "다시 열었습니다");
    await expect(itemCell(page, "KRINC", "open")).toHaveText("열림", { timeout: 20_000 });
    watcher.assertClean("dataItemMng 카테고리 조건");
  });

  test("TC-DMD-HIST-01 항목 이력 패널 배치 — 이력을 부르기 전에도 패널이 보이고 안내만 있다", async () => {
    await tid(page, "item-search-closed").selectOption("N");
    await searchItems(page);
    await expect(tid(page, "item-history")).toBeVisible();
    await expect(tid(page, "item-history-empty")).toHaveText("행의 [이력] 을 누르면 여기에 보입니다");
    await expect(tid(page, "item-history-close")).toHaveCount(0);
    await expect(tid(page, "item-history")).not.toContainText("이력 — ");
    await layout.layout(page, "항목 이력 패널 초기");
    await snap(page, "dmd-itemHistory-01-initial");
    watcher.assertClean("항목 이력 패널");
  });

  test("TC-DMD-HIST-02 항목 이력 — 생성·변경, 닫혀 있던 구간·다시 열기, 이력 닫기", async () => {
    await tid(page, "item-history-KRPUS").click();
    await expect(tid(page, "item-history")).toContainText("이력 — KRPUS", { timeout: 20_000 });
    await expect(tid(page, "item-history").getByTestId("history-state")).toHaveText("KRPUS · 열림 · 2행", { timeout: 20_000 });
    await expect(timelineRows(page, "item-history").nth(0)).toContainText("생성");
    await expect(timelineRows(page, "item-history").nth(0)).toContainText("지난 행");
    await expect(timelineRows(page, "item-history").nth(1)).toContainText("변경");
    await expect(timelineRows(page, "item-history").nth(1)).toContainText("부산신항");
    await layout.layout(page, "항목 이력 타임라인");
    await snap(page, "dmd-itemHistory-02-item");

    await tid(page, "item-history-KRINC").click();
    await expect(tid(page, "item-history")).toContainText("이력 — KRINC", { timeout: 20_000 });
    await expect(tid(page, "item-history").getByTestId("history-state")).toHaveText("KRINC · 열림 · 2행", { timeout: 20_000 });
    await expect(tid(page, "item-history").getByTestId("history-timeline")).toContainText("닫혀 있던 구간");
    await expect(tid(page, "item-history").getByTestId("history-timeline")).toContainText("다시 열기");
    await snap(page, "dmd-itemHistory-02-gap");

    await tid(page, "item-history-close").click();
    await expect(tid(page, "item-history-empty")).toBeVisible();
    watcher.assertClean("항목 이력");
  });

  test("TC-DMD-HIST-03 카테고리 이력 — 정의 변경·닫혀 있던 구간이 남고, 소속 조회는 키를 넣어야 한다", async () => {
    await openCateTab(page);
    await tid(page, "cate-row-KRONLY").click();
    await expect(tid(page, "cate-history")).toContainText("카테고리 이력 — KRONLY", { timeout: 20_000 });
    await expect(tid(page, "cate-history").getByTestId("history-state")).toContainText("KRONLY · 열림", { timeout: 20_000 });
    await expect(timelineRows(page, "cate-history").first()).toContainText("생성");
    await expect(tid(page, "cate-history").getByTestId("history-timeline")).toContainText("변경");
    // 좁은 오른쪽 열에서도 가로로 밀지 않고 정의 변경(이름·종류·대상·정규식)이 보인다 — 한 칸에 세 줄로 쌓는다(D-104 회귀).
    await expect(tid(page, "cate-history").locator(".ag-header-cell-text")).toHaveText(["사건", "시작", "끝", "카테고리 정의"]);
    const createdDef = timelineRows(page, "cate-history").nth(0).locator('.ag-cell[col-id="cateName"]');
    const changedDef = timelineRows(page, "cate-history").nth(1).locator('.ag-cell[col-id="cateName"]');
    await expect(createdDef).toContainText("한국 항구");
    await expect(createdDef).toContainText("REGEX · KEY");
    await expect(createdDef).toContainText("^.*$");
    await expect(changedDef).toBeVisible();
    await expect(changedDef).toContainText("한국 항구(계층)");
    await expect(changedDef).toContainText("REGEX · LVL1");
    await expect(changedDef).toContainText("^KR$");
    const overflow = await tid(page, "cate-history").locator(".ag-center-cols-viewport")
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow, "카테고리 이력 그리드에 가로 스크롤이 없다").toBeLessThanOrEqual(0);

    await tid(page, "cate-row-MAJOR").click();
    await expect(tid(page, "cate-history")).toContainText("카테고리 이력 — MAJOR", { timeout: 20_000 });
    await expect(tid(page, "cate-history").getByTestId("history-timeline")).toContainText("닫혀 있던 구간", { timeout: 20_000 });
    await snap(page, "dmd-cateHistory-03-cate");

    // 소속 — 대상을 바꾸면 항목 키 칸과 [조회] 가 나타난다. 대상 선택지는 카테고리·소속 둘이다.
    await expect(tid(page, "cate-history-target").locator("option")).toHaveText(["카테고리", "소속"]);
    await tid(page, "cate-history-target").selectOption("CATE_ITEM");
    await expect(tid(page, "cate-history-key")).toHaveAttribute("placeholder", "항목 키");
    // 키를 비운 채 조회하면 서버 거부 문구가 보인다(판정은 서버 한 곳).
    await tid(page, "cate-history-search").click();
    await expectErrorModal(page, "키를 입력하세요", "dmd-cateHistory-03-key-required");
    expectOnly4xx(watcher, "소속 이력 키 누락");

    // 아직 소속을 적용하지 않았으므로 행이 없다. 없는 키도 같다.
    await queryMemberHistory(page, "KRPUS");
    await expect(tid(page, "cate-history").getByTestId("history-state")).toContainText("KRPUS · 행 없음", { timeout: 20_000 });
    await queryMemberHistory(page, `NOPE${RUN}`);
    await expect(tid(page, "cate-history").getByTestId("history-empty")).toHaveText("행이 없습니다", { timeout: 20_000 });
    await layout.layout(page, "카테고리 이력");
    watcher.assertClean("카테고리 이력");
  });

  test("TC-DMD-HIST-99 배치·표시 검사 모음 — 이 장에서 본 화면 상태에 배치 위반·빈 상태 안내 누락이 없다", async () => {
    layout.assertEmpty("C 카테고리·이력");
  });

  test("TC-DMD-CATE-08 TABLE 소속 적용 — 넣고 적용, 빼고 적용하면 건수·항목 조건·소속 이력에 반영된다", async () => {
    // 이 시점에는 [카테고리] 탭이 열려 있다 — MAJOR 를 고르면 소속 transfer-list 가 나타난다.
    await tid(page, "cate-row-MAJOR").click();
    await expect(tid(page, "transfer-list-panel")).toBeVisible({ timeout: 20_000 });
    await tid(page, "transfer-available-KRPUS").click();
    await tid(page, "transfer-available-CNSHA").click();
    await tid(page, "transfer-move-right").click();
    await tid(page, "transfer-apply").click();
    await expectToast(page, "적용했습니다");
    await expect(tid(page, "cate-match-MAJOR")).toHaveText("2건", { timeout: 20_000 });

    await tid(page, "transfer-member-CNSHA").click();
    await tid(page, "transfer-move-left").click();
    await tid(page, "transfer-apply").click();
    await expectToast(page, "적용했습니다");
    await expect(tid(page, "cate-match-MAJOR")).toHaveText("1건", { timeout: 20_000 });

    // 소속 이력 — 오른쪽 열의 카테고리 이력에서 대상을 「소속」으로 바꿔 두 키를 본다(고른 카테고리는 MAJOR).
    await queryMemberHistory(page, "CNSHA");
    await expect(tid(page, "cate-history").getByTestId("history-state")).toContainText("CNSHA · 소멸(닫힘)", { timeout: 20_000 });
    await snap(page, "dmd-cateHistory-08-member");
    await queryMemberHistory(page, "KRPUS");
    await expect(tid(page, "cate-history").getByTestId("history-state")).toContainText("KRPUS · 열림", { timeout: 20_000 });

    // [항목] 탭의 카테고리 조건에도 반영된다.
    await tid(page, "item-tab-grid").click();
    await tid(page, "item-search-closed").selectOption("N");
    await tid(page, "item-search-cate").selectOption("MAJOR");
    await searchItems(page);
    await expect(itemCount(page)).toHaveText("1건", { timeout: 20_000 });
    await expect(itemRow(page, "KRPUS")).toBeVisible();
    watcher.assertClean("소속 적용");
  });
});


// ═══════════════════════════ C2. 카테고리 등록 빈 값 ═══════════════════════════

test.describe("C2 카테고리 등록 빈 값", () => {
  test("TC-DMD-CATE-07 카테고리 ID·이름을 비우고 등록을 누르면 무엇이 빠졌는지 안내한다", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "stw", testInfo);
    try {
      await openDmd(page, "항목 편집", "dataItemMng");
      // 빈 값 등록은 아무것도 만들지 않으므로 앞 장들이 화면으로 만든 시험 마루 데이터(E2E_USR_) 하나를 고른다.
      await tid(page, "item-pick-keyword").fill("E2E_USR_");
      await tid(page, "item-pick-keyword").press("Enter");
      const first = await tid(page, "item-pick-list").locator('[data-testid^="item-pick-E2E_USR_"]').first().getAttribute("data-testid");
      await selectItemMaru(page, (first ?? "").replace("item-pick-", ""));
      await openCateTab(page);
      const rows = tid(page, "cate-list").locator('[data-testid^="cate-row-"]');
      const before = await rows.count();
      await tid(page, "cate-add-id").fill("");
      await tid(page, "cate-add-name").fill("");
      await tid(page, "cate-add-submit").click();
      await snap(page, "dmd-cateTab-07-empty-submit");
      await expect(rows).toHaveCount(before);
      // 아무 반응이 없으면 사용자는 버튼이 고장 난 것으로 여긴다 — 빠진 값을 알리는 오류 모달·입력 칸 안내·토스트가 보여야 한다.
      await expect(
        page
          .locator(".error-modal__body:visible, .form-error-message:visible, .mantine-Notification-root:visible")
          .filter({ hasText: /입력|ID|이름|cate/ })
          .first(),
        "빈 값 등록 안내",
      ).toBeVisible({ timeout: 5_000 });
      watcher.assertClean("카테고리 탭 빈 값");
    } finally {
      await page.context().close();
    }
  });
});

// ═══════════════════════════ D. 폐기 ═══════════════════════════

test.describe("D 계층 축소 거부·폐기", () => {
  test.describe.configure({ mode: "serial" });

  const MD = mdId("DMD");
  const NAME = `E2E 폐기 ${RUN}`;
  let page: Page;
  let watcher: Watcher;
  const layout = new Findings();

  test.beforeAll(async ({ browser }, testInfo) => {
    ({ page, watcher } = await openAs(browser, "stw", testInfo));
  });
  test.afterAll(async () => {
    await page?.context().close();
  });

  test("TC-DMD-DEL-00 준비 — 계층 2칸 마루 데이터와 2차 값이 있는 항목을 만든다", async () => {
    await closeTabs(page);
    await registerMaruData(page, { id: MD, name: NAME, lvl: "2" });
    await openDmd(page, "항목 편집", "dataItemMng");
    await selectItemMaru(page, MD);
    await registerItem(page, { code: "KRPUS", name: "부산항", lvl1: "KR", lvl2: "BUSAN" });
    watcher.assertClean("준비");
  });

  test("TC-DMD-DEL-01 값이 있는 계층 칸을 줄여 저장하면 거부된다", async () => {
    await openDmd(page, "마루 데이터", "dataMng");
    await selectMng(page, MD);
    await tid(page, "data-edit-lvl").selectOption("1");
    await tid(page, "data-edit-save").click();
    await expectErrorModal(page, "LVL2 에 값이 있는 코드가 있어 계층 칸 수를 1 로 줄일 수 없습니다", "dmd-dataMng-lvl-shrink");
    expectOnly4xx(watcher, "계층 축소");
    // 다시 불러오면 저장된 값(2)으로 돌아간다.
    await reselectMng(page, MD);
    await expect(tid(page, "data-edit-lvl")).toHaveValue("2", { timeout: 20_000 });
    watcher.assertClean("dataMng");
  });

  test("TC-DMD-DEL-02 폐기 확인 모달에서 취소하면 아무것도 바뀌지 않는다", async () => {
    await tid(page, "data-edit-deprecate").click();
    const m = modal(page);
    await expect(m).toContainText("폐기하면 이 마루 데이터의 저장·항목 편집을 더 할 수 없습니다. 폐기할까요?");
    await snap(page, "dmd-dataMng-deprecate-confirm");
    await answerConfirm(page, "취소");
    await reselectMng(page, MD);
    await expect(tid(page, "data-edit-status")).toHaveText("INUSE", { timeout: 20_000 });
    await expect(tid(page, "data-edit-save")).toBeEnabled();
    await expect(tid(page, "data-edit-deprecate")).toBeEnabled();
    watcher.assertClean("폐기 취소");
  });

  test("TC-DMD-DEL-03 폐기(D) — 확인하면 DEPRECATED 가 되고 입력·저장·폐기가 모두 막힌다", async () => {
    await tid(page, "data-edit-deprecate").click();
    await answerConfirm(page, "확인");
    await expectToast(page, "폐기했습니다");
    await expect(tid(page, "data-edit-status")).toHaveText("DEPRECATED", { timeout: 20_000 });
    await expect(tid(page, "data-edit-name")).toBeDisabled();
    await expect(tid(page, "data-edit-pattern")).toBeDisabled();
    await expect(tid(page, "data-edit-lvl")).toBeDisabled();
    await expect(tid(page, "data-edit-attr01Name")).toBeDisabled();
    await expect(tid(page, "data-edit-save")).toBeDisabled();
    await expect(tid(page, "data-edit-deprecate")).toBeDisabled();
    await layout.layout(page, "dataMng 폐기 후");
    await snap(page, "dmd-dataMng-deprecated");
    await assertAllButtonsPressed(page, "dataMng 폐기", {
      "data-edit-item-edit": "[항목 편집 →] — TC-DMD-MNG-07 에서 눌렀다(이 화면은 장 D 에서 새로 열었다)",
      "데이터 등록": "[데이터 등록] — registerMaruData 가 눌렀다(팝업은 닫힌 상태다)",
    });
    watcher.assertClean("폐기");
  });

  test("TC-DMD-DEL-04 폐기된 마루 데이터는 목록의 DEPRECATED 조건에서만 나온다", async () => {
    await openDmd(page, "마루 데이터", "dataMng");
    const list = tid(page, "data-mng-list");
    await tid(page, "data-mng-search-id").fill(MD);
    await tid(page, "data-mng-search-status").selectOption("DEPRECATED");
    await headerBtn(page, "조회").click();
    await expect(gridRow(list, MD, "maruDataId").locator('.ag-cell[col-id="status"]')).toHaveText("DEPRECATED", {
      timeout: 20_000,
    });
    await tid(page, "data-mng-search-status").selectOption("INUSE");
    await headerBtn(page, "조회").click();
    await expect(tid(page, "data-mng-list-empty")).toBeVisible({ timeout: 20_000 });
    watcher.assertClean("dataMng 폐기 조회");
  });

  test("TC-DMD-DEL-05 폐기된 마루 데이터의 항목 편집은 조회 전용이다", async () => {
    await openDmd(page, "항목 편집", "dataItemMng");
    await selectItemMaru(page, MD);
    await expect(tid(page, "item-readonly")).toHaveText("조회 전용입니다(원천 MDM, 상태 DEPRECATED).");
    await expect(itemRow(page, "KRPUS")).toBeVisible();
    await expect(button(page, "항목 추가")).toBeDisabled();
    await expect(button(page, "CSV 업로드")).toBeDisabled();
    await expect(tid(page, "item-close-KRPUS")).toHaveCount(0);
    await expect(tid(page, "item-history-KRPUS")).toBeVisible();
    await itemCell(page, "KRPUS", "name").click();
    await expect(itemCell(page, "KRPUS", "name").locator("input")).toHaveCount(0);
    await layout.layout(page, "dataItemMng 조회 전용");
    await snap(page, "dmd-dataItemMng-readonly");
    // [카테고리] 탭도 조회 전용이다 — 안내가 보이고 등록 폼이 없다.
    await openCateTab(page);
    await expect(tid(page, "cate-readonly")).toHaveText("조회 전용 마루 데이터라 카테고리를 편집할 수 없습니다.");
    await expect(tid(page, "cate-add-submit")).toHaveCount(0);
    await expect(tid(page, "cate-close-BASE")).toHaveCount(0);
    await layout.layout(page, "카테고리 탭 조회 전용");
    watcher.assertClean("dataItemMng 조회 전용");
  });
  test("TC-DMD-DEL-99 배치·표시 검사 모음 — 이 장에서 본 화면 상태에 배치 위반·빈 상태 안내 누락이 없다", async () => {
    layout.assertEmpty("D 폐기");
  });
});

// ═══════════════════════════ E. 표준관리자 읽기 전용 ═══════════════════════════

test.describe("E 표준관리자(std) 읽기 전용", () => {
  test.describe.configure({ mode: "serial" });

  const MD = mdId("DME");
  const NAME = `E2E 권한 ${RUN}`;

  test("TC-DMD-ROLE-00 준비(담당자) — 사용 중인 마루 데이터·카테고리·항목을 만든다", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "stw", testInfo);
    try {
      await registerMaruData(page, { id: MD, name: NAME, lvl: "1" });
      await openDmd(page, "항목 편집", "dataItemMng");
      await selectItemMaru(page, MD);
      await registerItem(page, { code: "KRPUS", name: "부산항", lvl1: "KR" });
      await openCateTab(page);
      await addCategory(page, "MAJOR", "주요 항구", "TABLE");
      watcher.assertClean("준비");
    } finally {
      await page.context().close();
    }
  });

  test("TC-DMD-ROLE-01 표준관리자는 조회만 되고 등록·저장·폐기·닫기·CSV 가 막힌다", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "std", testInfo);
    try {
      await openDmd(page, "마루 데이터", "dataMng");
      // 목록은 보이지만 [데이터 등록] 은 숨기지 않고 비활성이며(등록 권한 없음), 행을 누르면 상세는 보이되 저장·폐기가 막힌다.
      await tid(page, "data-mng-search-id").fill(MD);
      await headerBtn(page, "조회").click();
      await expect(gridRow(tid(page, "data-mng-list"), MD, "maruDataId")).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("#btn_data_reg")).toBeVisible();
      await expect(page.locator("#btn_data_reg")).toBeDisabled();
      await snap(page, "dmd-std-dataMng");

      await gridRow(tid(page, "data-mng-list"), MD, "maruDataId").click();
      await expect(tid(page, "data-edit-id")).toHaveText(MD, { timeout: 20_000 });
      await expect(tid(page, "data-edit-status")).toHaveText("INUSE");
      await expect(tid(page, "data-edit-save")).toBeDisabled();
      await expect(tid(page, "data-edit-deprecate")).toBeDisabled();

      await openDmd(page, "항목 편집", "dataItemMng");
      await selectItemMaru(page, MD);
      await expect(itemRow(page, "KRPUS")).toBeVisible({ timeout: 20_000 });
      await expect(button(page, "항목 추가")).toBeDisabled();
      await expect(button(page, "CSV 업로드")).toBeDisabled();
      const close = tid(page, "item-close-KRPUS");
      if (await close.count()) await expect(close).toBeDisabled();
      await snap(page, "dmd-std-dataItemMng");

      // 오른쪽 열의 이력은 조회 권한만으로 본다.
      await tid(page, "item-history-KRPUS").click();
      await expect(tid(page, "item-history").getByTestId("history-state")).toHaveText("KRPUS · 열림 · 1행", { timeout: 20_000 });

      // [카테고리] 탭 — 목록은 보이지만 등록 폼·닫기가 없고 소속 [적용] 이 막힌다.
      await openCateTab(page);
      await expect(tid(page, "cate-row-MAJOR")).toBeVisible();
      await expect(tid(page, "cate-add-submit")).toHaveCount(0);
      await expect(tid(page, "cate-close-MAJOR")).toHaveCount(0);
      await tid(page, "cate-row-MAJOR").click();
      await expect(tid(page, "transfer-apply")).toBeDisabled({ timeout: 20_000 });
      watcher.assertClean("std 읽기 전용");
    } finally {
      await page.context().close();
    }
  });
});
