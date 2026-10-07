import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  RUN,
  T,
  USERS,
  Watcher,
  assertAllButtonsPressed,
  breadcrumb,
  button,
  checkLayout,
  daysAgo,
  errorBody,
  escapeRe,
  expectErrorModal as expectErrorModalBase,
  expectOnly4xx,
  expectToast,
  footerScreenId,
  gridRow,
  gridRowById,
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
  waitGridScrollbarSettled,
  waitIdle,
} from "./support";
import { fillDateTime } from "../support/mdm-e2e";

/**
 * 마루 MDM > 업무기준(dme) 사용자 여정 E2E.
 *
 * 화면: 룰(ruleMng) · 룰 화면(ruleEdit — 헤더·버전·의사결정표·열 설정·피벗·입력 계약·값 테스트·테스트 케이스·활용처) ·
 * 버전 확정(ruleConfirm) · 룰 세트(ruleSetMng) · 룰 세트 편집(ruleSetEdit).
 *
 * 담당자(stw)가 화면만으로 룰과 룰 세트의 일생을 다룬다. 장마다 serial 로 한 페이지를 공유하고, 첫 단계에서 자기 룰을
 * 화면으로 새로 만든다(장 하나만 따로 돌려도 되게 — 룰 행 잠금이 장 사이로 이어지지 않게 장 단위로 끊는다).
 *   A 룰 등록·조회 → 룰 화면(헤더 수정·찾기·해제/선점·두 사용자 잠금) → 열 설정(초안 거부·도메인 찾기·열 추가·순서·적용)
 *     → 의사결정표(적중 정책·ALL_NA_ROW 거부·행 추가/복사/기본 행·저장·겹침 거부·행 삭제) → 피벗 → 입력 계약
 *     → 값 테스트(편집본·저장된 버전·키 보냄 끔·기본 행) → 테스트 케이스(저장·모두 실행·불러오기·수정·기대값 갱신·삭제)
 *     → 버전 확정(대기 목록·검사·취소·확정) → 확정 반영 조회
 *   B 확정된 룰의 새 버전(복사·표 수정·계약 비교) → 확정 검사 적용 순서 거부 → 새 버전 DRAFT 삭제 → 룰 폐기 → 폐기 반영 조회
 *   C 룰 세트 — 준비(서로 읽는 확정 룰 둘) → 등록·ID 규칙·중복 → 세트 편집(룰 추가·중복·순서 거부·▲▼·✕·지침·저장·검사)
 *     → 세트 조회(키워드·담은 룰·결과 변수·상태) → 활용처 → 폐기/되살리기 → 담은 룰 폐기 반영 → 세트 폐기
 *   D 화면 연결·넘기기·동시 저장 충돌·행 드래그·표준관리자(std) 읽기 전용 — 서로 기대지 않는 독립 테스트
 *
 * 룰 ID 는 uid("DME") 처럼 E2E_USR_ 로 시작하는 컬럼 물리명 규칙(영문 대문자·숫자를 밑줄로 이음, 50자 이하)이다.
 * 배치 검사(checkLayout) 위반은 장을 멈추지 않게 모아 두었다가 장 끝의 "-99" 에서 한꺼번에 단언한다.
 */

// ─────────────────────────── 지역 부품 ───────────────────────────

const MENU = {
  ruleMng: "룰",
  ruleEdit: "룰 화면",
  ruleConfirm: "버전 확정",
  ruleSetMng: "룰 세트",
  ruleSetEdit: "룰 세트 편집",
  ruleSetConfirm: "룰 세트 확정",
} as const;
type ScreenId = keyof typeof MENU;

const STW = USERS.stw.id;
const STW2 = USERS.stw2.id;
/** D2 보류: [넘기기]는 담당자 조회 수단이 생길 때까지 꺼져 있고 이 문구로 이유를 알린다(m-mdm src/shell/handover.ts). */
const HANDOVER_PENDING = "넘기기는 준비 중입니다. 넘겨받는 사람의 담당자 여부를 확인할 수단이 아직 없습니다.";
const HANDOVER = "넘기기(준비 중)";

async function go(page: Page, id: ScreenId) {
  await openMenu(page, ["마루 MDM", "업무기준", MENU[id]], id);
}

/**
 * 배치·표시 검사 기록 — 검사는 그 상태에서 바로 하되 단언은 장 끝의 "-99" 테스트가 한다(dmd 와 같은 방식).
 * serial 장에서 배치 위반 하나가 뒤의 CRUD 단계를 모두 건너뛰게 하지 않으려는 것이다.
 * 안쪽 스크롤로 보이지 않는 컨트롤만 그 순간의 검사에서 뺀다(scrolledOut).
 */
class Findings {
  readonly items: string[] = [];
  async layout(page: Page, label: string) {
    try {
      await checkLayout(page, label, { exclude: await scrolledOut(page) });
    } catch (e) {
      const text = String((e as Error).message).replace(/\x1b\[[0-9;]*m/g, "");
      const lines = [...text.matchAll(/"(L\d [^\n]*?)",?\s*$/gm)].map((m) => m[1].replace(/\\"/g, '"'));
      this.items.push(`${label}: ${lines.length ? lines.join(" / ") : text.split("\n").slice(0, 4).join(" ").slice(0, 300)}`);
      await snap(page, `dme-finding-${label.replace(/[^\w가-힣]+/g, "_")}`);
    }
  }
  assertEmpty(chapter: string) {
    expect(this.items, `${chapter}: 배치 위반`).toEqual([]);
  }
}

/** 오류 모달 문구를 보고 [확인]으로 닫는다 — 이 파일은 answerConfirm 으로 닫는다(가장 위 모달이 닫혔는지 본다). */
const expectErrorModal = (page: Page, text: string | RegExp, shot?: string) =>
  expectErrorModalBase(page, text, shot, { close: "answerConfirm" });

/** 조회영역의 select(SearchField type="select") — 라벨로 찾는다. */
const searchSelect = (page: Page, label: string) =>
  screen(page)
    .locator(".search-field")
    .filter({ has: page.locator(".search-field__label", { hasText: new RegExp(`^${escapeRe(label)}$`) }) })
    .locator("select");

const panelCount = (page: Page) => screen(page).locator(".grid-panel-count").first();

// ── ruleMng ──

const ruleList = (page: Page) => screen(page).locator(".grid-panel").first();
const ruleRow = (page: Page, id: string) => gridRow(ruleList(page), id, "maruRuleId");
const ruleCell = (page: Page, id: string, col: string) => ruleRow(page, id).locator(`.ag-cell[col-id="${col}"]`);

/** 목록 헤더 [룰 등록] 으로 등록 팝업을 연다(열 때만 마운트, 칸은 빈 채로 시작). */
async function openRuleRegister(page: Page) {
  await page.locator("#btn_rule_reg").click();
  await expect(tid(page, "rule-register-form")).toBeVisible({ timeout: T.UI });
}

/** 등록 팝업을 [취소]로 닫는다. */
async function cancelRuleRegister(page: Page) {
  await tid(page, "rule-reg-cancel").click();
  await expect(tid(page, "rule-register-form")).toHaveCount(0, { timeout: T.UI });
}

async function searchRule(page: Page, keyword: string, opts: { kind?: string; status?: string } = {}) {
  await tid(page, "rule-search-keyword").fill(keyword);
  await searchSelect(page, "종류").selectOption(opts.kind ?? "");
  await searchSelect(page, "상태").selectOption(opts.status ?? "");
  await button(page, "조회").click();
  await waitIdle(page);
}

// ── ruleMng 오른쪽 상세 — ① 헤더·② 버전(D-105: 헤더 수정·폐기·새 버전·DRAFT 삭제·선점·해제·넘기기·확정 이동이 룰 화면에서 옮겨 왔다) ──

const versionsCard = (page: Page) => tid(page, "rule-card-versions");
/** 상세 ② 버전 표의 한 줄 — 행 키(row-id)는 서버 버전 표기("1.000")다(D-144). */
const detailVerRow = (page: Page, ver: string) =>
  gridRowById(tid(page, "rule-version-table"), ver);

/**
 * ruleMng 에서 룰을 조회해 그 행을 눌러 오른쪽 상세를 연다. 룰 ID 링크는 룰 화면 탭을 열므로 룰명 칸을 누른다(기능설계서 G-001).
 * 같은 행을 다시 눌러도 상세를 다시 읽는다(0828a082) — 다른 사용자의 선점·해제·확정이 보이도록 행을 누른 뒤의 상세 응답을 기다린다.
 */
async function openRuleDetail(page: Page, id: string) {
  await go(page, "ruleMng");
  await searchRule(page, id);
  await expect(ruleRow(page, id)).toHaveCount(1, { timeout: T.UI });
  const view = page.waitForResponse((r) => r.url().includes("/oasis/ruleMng/view") && r.request().method() === "POST");
  await ruleCell(page, id, "maruRuleName").click();
  expect((await view).ok()).toBe(true);
  await expect(tid(page, "rule-header-id")).toHaveText(id, { timeout: T.LONG });
}

/** 상세 ② 버전 표에서 한 줄을 고른다. 소유·잠금 배지는 같은 카드의 버튼 줄 끝에 있다(VersionActionBar trailing). */
async function selectDetailVer(page: Page, ver: string) {
  // 버전 표는 가로로 넘쳐, 처음 그릴 때 드러나는 가로 막대가 한 줄짜리 표의 행을 덮는다 — 막대가 숨은 뒤 누른다(support 주석).
  await waitGridScrollbarSettled(detailVerRow(page, ver));
  await detailVerRow(page, ver).click();
  await expect(detailVerRow(page, ver)).toHaveClass(/ag-row-highlighted/);
}

/** 상세에서 버전을 골라 [내용 편집 →] 으로 룰 화면(ruleEdit)을 그 룰·버전으로 연다. */
async function openContentEdit(page: Page, id: string, ver: string) {
  await selectDetailVer(page, ver);
  await versionsCard(page).getByRole("button", { name: "내용 편집 →", exact: true }).click();
  await expect(footerScreenId(page)).toHaveText("ruleEdit", { timeout: T.SLOW });
  await expect(tid(page, "rule-edit-current")).toHaveText(id, { timeout: T.LONG });
  await expect(tid(page, "rule-ver-select")).toHaveValue(ver, { timeout: T.LONG });
  await waitIdle(page);
}

// ── ruleEdit ──

/** 카드 안 버튼 — 같은 이름(삭제·취소·찾기)이 여러 카드에 있으므로 카드로 좁힌다. */
const cardButton = (page: Page, cardTestId: string, name: string) =>
  tid(page, cardTestId).getByRole("button", { name, exact: true });
const topbar = (page: Page) => tid(page, "rule-edit-topbar");

/** 룰 화면 상단 [찾기]로 룰을 연다. */
async function pickRule(page: Page, id: string) {
  await tid(page, "rule-pick-keyword").fill(id);
  await topbar(page).getByRole("button", { name: "찾기", exact: true }).click();
  await tid(page, `rule-pick-${id}`).click();
  await expect(tid(page, "rule-edit-current")).toHaveText(id, { timeout: T.LONG });
  await waitIdle(page);
}

/** 메뉴로 룰 화면을 열고 룰을 다시 고른다 — 다른 세션의 코드 수정으로 화면이 다시 적재돼도 이어 가게. */
async function openRule(page: Page, id: string) {
  await go(page, "ruleEdit");
  await pickRule(page, id);
}

// 열 설정 그리드(col-table) — 행은 row-id(기존 열 `v{varId}`·새 열 `n{번호}`), 칸은 col-id.
const colTable = (page: Page) => tid(page, "col-table");
const colCell = (page: Page, key: string, field: string) =>
  colTable(page).locator(`.ag-row[row-id="${key}"] .ag-cell[col-id="${field}"]`);

/** 열 가상화로 아직 그려지지 않은 열이면 가로로 밀어 그리게 한다. */
async function revealCell(grid: Locator, cell: Locator) {
  if (await cell.count()) return;
  const hscroll = grid.locator(".ag-body-horizontal-scroll-viewport").first();
  for (let x = 0; x <= 4000; x += 250) {
    await hscroll.evaluate((el, v) => (el.scrollLeft = v), x);
    if (await cell.count()) return;
  }
}

async function scrollGridLeft(grid: Locator) {
  const hscroll = grid.locator(".ag-body-horizontal-scroll-viewport");
  if (await hscroll.count()) await hscroll.first().evaluate((el) => (el.scrollLeft = 0));
}

/** 한 번 클릭 편집 칸에 글자를 넣고 Enter. */
async function gridText(grid: Locator, cell: Locator, value: string) {
  await revealCell(grid, cell);
  const input = cell.locator("input");
  await expect(async () => {
    await cell.click();
    await expect(input).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: T.UI });
  await input.fill(value);
  await input.press("Enter");
  await expect(input).toHaveCount(0);
  await scrollGridLeft(grid);
}

/** 한 번 클릭 select 칸에서 값을 고른다(고르면 바로 확정된다). */
async function gridSelect(grid: Locator, cell: Locator, value: string) {
  await revealCell(grid, cell);
  const select = cell.locator("select");
  await expect(async () => {
    await cell.click();
    await expect(select).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: T.UI });
  await select.selectOption(value);
  await expect(select).toHaveCount(0);
  await scrollGridLeft(grid);
}

const colEdit = (page: Page, key: string, field: string, value: string) => gridText(colTable(page), colCell(page, key, field), value);
const colSelect = (page: Page, key: string, field: string, value: string) => gridSelect(colTable(page), colCell(page, key, field), value);

/** 열 설정 표의 새 열 키(`n{번호}`) 목록. */
async function newColKeys(page: Page): Promise<string[]> {
  const ids = await gridRows(colTable(page))
    .evaluateAll((els) => els.map((e) => e.getAttribute("row-id") ?? ""));
  return ids.filter((i) => /^n\d+$/.test(i));
}

/** 열 설정 섹션을 펼친다 — 처음에는 접혀 있다(2026-10-01). 이미 펼쳐져 있으면 그대로 둔다. */
async function openColumns(page: Page) {
  const toggle = tid(page, "rule-section-columns-toggle");
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  await expect(tid(page, "rule-section-columns-body")).toBeVisible();
}

/** [조건 열 추가]·[결과 열 추가]를 누르고 새로 생긴 열의 키를 돌려준다. */
async function clickAddColumn(page: Page, kind: "COND" | "RESULT"): Promise<string> {
  await openColumns(page);
  const before = await newColKeys(page);
  await tid(page, kind === "COND" ? "col-add-cond" : "col-add-result").click();
  let added: string[] = [];
  await expect
    .poll(async () => {
      added = (await newColKeys(page)).filter((k) => !before.includes(k));
      return added.length;
    }, { message: "새 열이 생겨야 한다" })
    .toBe(1);
  return added[0];
}

interface ColSpec {
  kind: "COND" | "RESULT";
  disp: "Equal" | "1" | "2" | "Value";
  name: string;
  label: string;
  /** 값 타입 — 비우면 선언하지 않는다(앞 룰 결과·컬럼 사전 이름은 서버가 타입을 푼다). */
  type?: "NUMBER" | "STRING";
}

/** 열 하나를 더하고 칸을 채운다. 새 열 키를 돌려준다. */
async function addColumn(page: Page, c: ColSpec): Promise<string> {
  const key = await clickAddColumn(page, c.kind);
  if (c.disp !== (c.kind === "COND" ? "Equal" : "Value")) await colSelect(page, key, "dispType", c.disp);
  await colEdit(page, key, "varName", c.name);
  await colEdit(page, key, "label", c.label);
  if (c.type) await colSelect(page, key, "dataType", c.type);
  return key;
}

// 의사결정표(dt-grid) — 행은 row-id(= row_id, 새 행은 음수 임시 ID), 칸은 col-id `c{varId}_{op|left|right|na|val}`·note.
const dtGrid = (page: Page) => tid(page, "dt-grid");
const dtCell = (page: Page, rowId: number, field: string) =>
  dtGrid(page).locator(`.ag-row[row-id="${rowId}"] .ag-cell[col-id="${field}"]`);
const dtEdit = (page: Page, rowId: number, field: string, value: string) => gridText(dtGrid(page), dtCell(page, rowId, field), value);
const dtOp = (page: Page, rowId: number, field: string, op: string) => gridSelect(dtGrid(page), dtCell(page, rowId, field), op);
const dtRows = (page: Page) => dtGrid(page).locator('[data-testid^="dt-row-"]');
const tableButton = (page: Page, name: string) => cardButton(page, "rule-card-table", name);

/** 표의 행 ID 목록(보이는 순서). */
async function dtRowIds(page: Page): Promise<number[]> {
  return dtGrid(page)
    .locator(".ag-pinned-left-cols-container .ag-row")
    .evaluateAll((els) =>
      els
        .map((e) => ({ i: Number(e.getAttribute("row-index")), id: Number(e.getAttribute("row-id")) }))
        .sort((a, b) => a.i - b.i)
        .map((x) => x.id),
    );
}

/** 버튼을 눌러 표에 행 하나를 더하고 그 새 행의 임시 ID(음수)를 돌려준다. */
async function addRowBy(page: Page, click: () => Promise<void>): Promise<number> {
  const before = await dtRowIds(page);
  await click();
  let added: number[] = [];
  await expect
    .poll(async () => {
      added = (await dtRowIds(page)).filter((i) => !before.includes(i));
      return added.length;
    }, { message: "새 행이 생겨야 한다" })
    .toBe(1);
  expect(added[0], "새 행은 음수 임시 ID").toBeLessThan(0);
  return added[0];
}

/** 열 머리(dt-var-header-{varId})에서 변수의 var_id 를 읽는다. 서버가 발급하므로 화면에서 읽는다. */
async function varIdOf(page: Page, label: string): Promise<number> {
  const head = dtGrid(page).locator('[data-testid^="dt-var-header-"]').filter({ hasText: label }).first();
  await expect(head).toBeVisible({ timeout: T.UI });
  return Number((await head.getAttribute("data-testid"))!.replace("dt-var-header-", ""));
}

/** Equal 조건 칸 — 새 행은 무관(NA)이라 값 칸이 잠겨 있다. 무관을 끄고 값을 넣는다. */
async function dtEqual(page: Page, rowId: number, varId: number, value: string) {
  const na = tid(page, `dt-na-${rowId}-${varId}`);
  await expect(na).toBeChecked();
  // 제어 체크박스라 표 상태가 다시 그려진 뒤에 풀린다 — 사용자처럼 한 번 누르고 결과를 기다린다.
  await na.click();
  await expect(na, "무관 체크를 풀 수 있어야 한다").not.toBeChecked();
  await dtEdit(page, rowId, `c${varId}_left`, value);
}

// 값 테스트·테스트 케이스
const vtCard = (page: Page) => tid(page, "rule-card-value-test");
const tcCard = (page: Page) => tid(page, "rule-card-test-cases");
/** 케이스 표(AgDataGrid)의 행들. */
const caseRows = (page: Page) => gridRows(tcCard(page));
/** 케이스 줄 — 이름 칸이 name 으로 시작하고 복사본("(복사)")이 아닌 줄(설명은 이름 뒤에 " · " 로 붙는다). */
const caseRow = (page: Page, name: string) =>
  caseRows(page).filter({ has: page.locator('.ag-cell[col-id="name"]', { hasText: new RegExp(`^\\s*${escapeRe(name)}(?! \\(복사\\))`) }) });
/** 케이스 표에서 names 줄만 체크한다(행 맨 앞 체크 칸). 카드 ⑥ 머리글 버튼은 체크한 케이스를 대상으로 한다. */
async function pickCases(page: Page, ...names: string[]) {
  // 체크 칸은 00-setup 선례처럼 .ag-selection-checkbox 를 누른다(상태는 그 안 input 으로 읽는다).
  for (const box of await caseRows(page).locator(".ag-selection-checkbox").all()) {
    if (await box.locator("input").isChecked()) await box.click();
  }
  for (const n of names) await caseRow(page, n).locator(".ag-selection-checkbox").click();
  await expect(tid(page, "tc-selected-count")).toHaveText(`선택 ${names.length}건`);
}
/** 카드 ⑥ 머리글 [삭제] → 확인창(포털) [확인]. */
async function deletePickedCases(page: Page, count: number) {
  await tid(page, "tc-delete").click();
  await expect(page.getByText(`선택한 케이스 ${count}건을 삭제하시겠습니까?`)).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "확인", exact: true }).last().click();
}
/** 세트 입출력 표(AgDataGrid)의 한 행 — 행 키는 변수명이다. kind: inputs(입력 변수) | results(결과 변수). */
const ioRow = (page: Page, kind: "inputs" | "results", name: string): Locator =>
  gridRowById(page.getByTestId(`set-io-${kind}`), name);

const resultValue = (page: Page, name: string) => tid(page, "vt-result-values").locator("tr", { hasText: name }).locator("td");

/** 값 테스트 입력 표의 값 칸 — 행 키는 변수명이다. */
const vtValueCell = (page: Page, name: string): Locator =>
  vtCard(page).locator(`.ag-row[row-id="${name}"] .ag-cell[col-id="value"]`);

/** 값 칸을 눌러 편집하고 Enter 로 확정한다(singleClickEdit). */
async function vtInput(page: Page, name: string, value: string) {
  const c = vtValueCell(page, name);
  await expect(c).toBeVisible({ timeout: T.LONG });
  await c.click();
  const input = c.locator("input");
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill(value);
  await input.press("Enter");
  await expect(input).toHaveCount(0);
}

async function vtRun(page: Page) {
  await vtCard(page).getByRole("button", { name: "실행", exact: true }).click();
  await expect(tid(page, "vt-result-target")).toBeVisible({ timeout: T.LONG });
  await waitIdle(page);
}

// ── ruleConfirm ──

// 버전 확정 화면의 검사 결과·변경 표는 AgDataGrid 다 — 행은 row-id(검사 항목 / row_id)로 찾는다.
const rcCheckRow = (page: Page, item: string) => gridRowById(tid(page, "rc-checks"), item);
const rcDiffRow = (page: Page, rowId: number | string) => gridRowById(tid(page, "rc-diff"), String(rowId));
const rcDiffKind = (page: Page, rowId: number | string) => rcDiffRow(page, rowId).locator('.ag-cell[col-id="kindLabel"]');

async function rcValidate(page: Page, applyFrom: string) {
  await fillDateTime(tid(page, "rc-apply-from"), applyFrom);
  await tid(page, "rc-validate").click();
  await expect(tid(page, "rc-checks")).toBeVisible({ timeout: T.LONG });
}

// ── 룰 한 벌을 화면으로 만든다(장 C·D 의 준비) ──

interface EqualRule {
  id: string;
  name: string;
  cond: { name: string; label: string; type?: "NUMBER" | "STRING" };
  result: { name: string; label: string; type: "NUMBER" | "STRING" };
  /** 조건 값 → 결과 값(NORMAL 행). */
  rows: Array<[string, string]>;
  /** 기본 행 결과 값. */
  fallback: string;
}

/**
 * ruleMng 에서 룰을 등록하고, 열린 룰 화면에서 Equal 조건 열 하나·Value 결과 열 하나를 적용한 뒤 행·기본 행을 넣어 저장한다(적중 정책 FIRST).
 * 등록 뒤 룰 화면이 그 룰의 버전 1 DRAFT(편집 중(나))로 열린 상태에서 끝난다.
 */
async function buildEqualRule(page: Page, r: EqualRule) {
  await go(page, "ruleMng");
  await openRuleRegister(page);
  await tid(page, "rule-reg-id").fill(r.id);
  await tid(page, "rule-reg-name").fill(r.name);
  await tid(page, "rule-reg-kind").selectOption("DECISION");
  await tid(page, "rule-reg-submit").click();
  // 등록하면 룰 화면(ruleEdit) 탭이 그 룰의 버전 1 DRAFT 로 열린다(RuleRegisterForm openRuleEdit).
  await expect(footerScreenId(page)).toHaveText("ruleEdit", { timeout: T.SLOW });
  await expect(tid(page, "rule-edit-current")).toHaveText(r.id, { timeout: T.LONG });
  await expect(topbar(page)).toContainText("편집 중(나)");
  await waitIdle(page);

  await addColumn(page, { kind: "COND", disp: "Equal", ...r.cond });
  await addColumn(page, { kind: "RESULT", disp: "Value", ...r.result });
  await expect(tid(page, "col-reject-count")).toHaveText("거부 0건");
  await tid(page, "col-apply").click();
  await expect(tid(page, "col-dirty")).toHaveCount(0, { timeout: T.LONG });
  const condId = await varIdOf(page, r.cond.label);
  const resId = await varIdOf(page, r.result.label);

  await tid(page, "dt-hit-policy").selectOption("FIRST");
  for (const [when, then] of r.rows) {
    const id = await addRowBy(page, () => tableButton(page, "행 추가").click());
    await dtEqual(page, id, condId, when);
    await dtEdit(page, id, `c${resId}_val`, then);
  }
  const fb = await addRowBy(page, () => tableButton(page, "기본 행 추가").click());
  await dtEdit(page, fb, `c${resId}_val`, r.fallback);
  await tableButton(page, "표 저장").click();
  await expect(tid(page, "dt-dirty")).toHaveCount(0, { timeout: T.LONG });
  await expect(dtRows(page)).toHaveCount(r.rows.length + 1);
}

/**
 * 룰 상세(ruleMng ② 버전)의 [확정]으로 버전 확정을 열고, 과거 일시로 검사해 경고 확인란을 체크한 뒤 확정한다.
 * 확정 이동 버튼은 룰 화면에서 룰 상세로 옮겨 갔다(D-105, RuleDetailPanel `rule-move-to-confirm`).
 */
async function confirmFromRuleMng(page: Page, id: string, ver: string, applyFrom: { input: string; date: string }) {
  await go(page, "ruleMng");
  await openRuleDetail(page, id);
  await selectDetailVer(page, ver);
  await tid(page, "rule-move-to-confirm").click();
  await expect(footerScreenId(page)).toHaveText("ruleConfirm", { timeout: T.SLOW });
  await expect(tid(page, "rc-target")).toContainText(`${id} 버전 v${ver}`, { timeout: T.LONG });
  await rcValidate(page, applyFrom.input);
  await expect(tid(page, "rc-confirm")).toBeEnabled({ timeout: T.UI });
  await tid(page, "rc-confirm").click();
  await expect(modal(page)).toContainText("버전 확정");
  // Equal 조건 하나짜리 룰은 "키가 NULL 이면 맞는 행이 없다" 저장 시 검사 경고가 있어 확인란을 체크해야 [확인]이 켜진다.
  await expect(tid(page, "rc-modal-warnings")).toContainText("이(가) NULL 이면 맞는 행이 없다");
  await expect(tid(page, "rc-modal-ok")).toBeDisabled();
  await tid(page, "rc-ack").getByText("경고를 확인했습니다").click();
  await tid(page, "rc-modal-ok").click();
  await expectToast(page, "확정했습니다");
  await expect(tid(page, "rc-form").locator('.mdm-status-badge[data-status="RELEASED"]')).toBeVisible({ timeout: T.UI });
  await expect(tid(page, "rc-released")).toContainText(`적용 구간 ${applyFrom.date} 00:00:00`);
}

/**
 * 세트 편집 버전 줄 [확정]으로 룰 세트 확정 화면을 그 DRAFT 로 열고, 적용 시작 일시로 검사한 뒤 확정한다.
 * D-144 2단계부터 새 세트는 CREATED 이고 첫 확정 때 사용 중(INUSE)이 된다. 폐기는 사용 중이며 미적용 버전이 없는 세트만 된다
 * (RuleSetEditService canDeprecate) — 그래서 과거 일시로 확정해 곧바로 현재 버전이 되게 한다.
 */
async function confirmSetFromEdit(page: Page, setId: string, ver: string, applyFrom: { input: string; date: string }) {
  await tid(page, "set-ver-confirm").click();
  await expect(footerScreenId(page)).toHaveText("ruleSetConfirm", { timeout: T.SLOW });
  await expect(tid(page, "rsc-target")).toContainText(`${setId} 버전 v${ver}`, { timeout: T.LONG });
  await fillDateTime(tid(page, "rsc-apply-from"), applyFrom.input);
  await tid(page, "rsc-validate").click();
  await expect(tid(page, "rsc-checks")).toBeVisible({ timeout: T.LONG });
  await expect(tid(page, "rsc-confirm")).toBeEnabled({ timeout: T.UI });
  await tid(page, "rsc-confirm").click();
  await expect(modal(page)).toContainText("버전 확정");
  await tid(page, "rc-modal-ok").click();
  await expect(tid(page, "rsc-released")).toBeVisible({ timeout: T.LONG });
}

/** 세트 버전 줄 [삭제](확인창)로 내 DRAFT 를 지운다 — 확정 버전 v1.000 이 다시 골라진다(D-144 2단계 SetVersionRow). */
async function deleteSetDraftVer(page: Page, ver: string) {
  const checked = tid(page, "set-ver-select").locator("option:checked");
  await expect(checked).toHaveText(`v${ver} (DRAFT)`);
  await tid(page, "set-ver-delete").click();
  const confirm = page.getByRole("dialog").filter({ hasText: `v${ver} DRAFT 를 지운다. 되돌릴 수 없다` });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "확인", exact: true }).click();
  await expect(tid(page, "set-message")).toContainText(`v${ver} 을 지웠다`, { timeout: T.UI });
  await expect(tid(page, "set-ver-select").locator("option", { hasText: `v${ver}` })).toHaveCount(0);
  await expect(checked).toHaveText("v1.000 (RELEASED)");
}

/** 세트 버전 줄 [새 버전(major|minor)]으로 DRAFT 를 만든다 — 만든 버전이 골라지고 편집할 수 있다. */
async function newSetVersion(page: Page, kind: "major" | "minor", ver: string) {
  const checked = tid(page, "set-ver-select").locator("option:checked");
  await expect(checked).toHaveText("v1.000 (RELEASED)");
  await tid(page, `set-ver-new-${kind}`).click();
  await expect(tid(page, "set-message")).toContainText(`새 버전(${kind})을 만들었다`, { timeout: T.UI });
  await expect(checked).toHaveText(`v${ver} (DRAFT)`);
}

// ═══════════════════════════ A. 룰 등록·편집·확정 ═══════════════════════════

test.describe("A 룰 등록·편집·확정", () => {
  test.describe.configure({ mode: "serial" });

  const RULE = uid("DME");
  const NAME = `E2E 품질 판정 ${RUN}`;
  const NAME2 = `E2E 품질 등급 판정 ${RUN}`;
  // 변수 이름 — 고정한다. 실행마다 바꾸면 같은 룰에 다른 이름의 변수가 쌓여 지침·활용처 목록이 늘어난다
  // (2026-09-28 `uid()` 정리와 같은 이유. E2E 룰은 수동으로 정리한다).
  const THK = "E2E_THK";
  const SURF = "E2E_SURF";
  const GRD = "E2E_GRD";
  const CONFIRM1 = daysAgo(7);
  const CASE_A = "E2E 중간 두께 A";
  const CASE_C = "E2E 두꺼운 B 는 기본 C";
  const CASE_DEL = "E2E 지울 케이스";

  const layout = new Findings();
  let page: Page;
  let watcher: Watcher;
  /** 서버가 발급한 var_id — 열 설정 적용 뒤 화면 머리에서 읽는다. */
  let vThk = 0;
  let vSurf = 0;
  let vGrd = 0;

  test.beforeAll(async ({ browser }, testInfo) => {
    ({ page, watcher } = await openAs(browser, "stw", testInfo));
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  // ─────────── ruleMng — 룰 ───────────

  test("TC-DME-MNG-01 룰 화면 배치 — 메뉴로 열면 조회영역·목록·[룰 등록] 버튼이 보이고 버튼으로 등록 팝업이 열린다", async () => {
    await go(page, "ruleMng");
    await resetClicks(page);
    await expect(breadcrumb(page)).toContainText("마루 MDM > 업무기준 > 룰");
    await expect(tid(page, "rule-search-keyword")).toBeVisible();
    await expect(searchSelect(page, "종류")).toHaveValue("");
    await expect(searchSelect(page, "상태")).toHaveValue("");
    await expect(ruleList(page).locator(".ag-root-wrapper")).toBeVisible();
    await expect(page.locator("#btn_rule_reg")).toBeVisible();
    await expect(page.getByTestId("rule-register-form")).toHaveCount(0);
    // 화면 배치·스냅샷은 팝업이 닫힌 화면에서 본다. 팝업은 확인 뒤 [취소]로 닫아 MNG-02 가 열어서 시작한다.
    await layout.layout(page, "ruleMng");
    await snap(page, "dme-ruleMng-01-initial");
    await openRuleRegister(page);
    await expect(tid(page, "rule-reg-kind")).toHaveValue("DECISION");
    await expect(tid(page, "rule-reg-source")).toHaveText("MDM (등록은 MDM 원천만 받는다)");
    await expect(tid(page, "rule-reg-submit")).toBeDisabled();
    await cancelRuleRegister(page);
    watcher.assertClean("ruleMng");
  });

  test("TC-DME-MNG-02 ID 규칙·룰명 길이 위반은 바로 안내되고 [등록]이 꺼진다", async () => {
    const reg = tid(page, "rule-reg-submit");
    await openRuleRegister(page);
    await tid(page, "rule-reg-id").fill("e2e bad-id");
    await tid(page, "rule-reg-name").fill(NAME);
    await expect(tid(page, "rule-register-form")).toContainText("룰 ID 는 컬럼 물리명 규칙");
    await expect(reg).toBeDisabled();
    await snap(page, "dme-ruleMng-02-bad-id");

    await tid(page, "rule-reg-id").fill(RULE);
    await expect(tid(page, "rule-register-form")).not.toContainText("컬럼 물리명 규칙");
    await tid(page, "rule-reg-name").fill("가".repeat(101));
    await expect(tid(page, "rule-register-form")).toContainText("룰명은 100자 이하입니다");
    await expect(reg).toBeDisabled();
    // 룰명을 비우면 필수라 꺼진다.
    await tid(page, "rule-reg-name").fill("");
    await expect(reg).toBeDisabled();
    // 팝업은 MNG-03 으로 열린 채 이어진다(입력값도 그대로 — MNG-03 이 다시 채운다).
    watcher.assertClean("ruleMng");
  });

  test("TC-DME-MNG-03 등록(C) — ID·룰명·종류·설명·활용처 메모를 넣고 등록하면 룰 화면이 버전 1 DRAFT 로 열리고, 룰 화면(ruleMng) 상세에도 그 룰이 뜬다", async () => {
    // MNG-02 에서 열린 팝업을 이어 쓴다.
    await expect(tid(page, "rule-register-form")).toBeVisible();
    await tid(page, "rule-reg-id").fill(RULE);
    await tid(page, "rule-reg-name").fill(NAME);
    await tid(page, "rule-reg-kind").selectOption("DERIVE");
    await tid(page, "rule-reg-kind").selectOption("DECISION");
    await tid(page, "rule-reg-description").fill("E2E 사용자 여정으로 만든 판정 룰");
    await tid(page, "rule-reg-usage").fill("E2E 품질 판정 화면");
    await tid(page, "rule-reg-submit").click();

    // 등록하면 룰 화면(ruleEdit, 내용 편집) 탭이 새 룰의 버전 1 DRAFT 로 열린다(RuleRegisterForm openRuleEdit).
    await expect(footerScreenId(page)).toHaveText("ruleEdit", { timeout: T.SLOW });
    await expect(tid(page, "rule-edit-current")).toHaveText(RULE, { timeout: T.LONG });
    await expect(tid(page, "rule-edit-current-name")).toHaveText(NAME);
    await expect(tid(page, "rule-ver-select")).toHaveValue("1.000");
    await expect(topbar(page).locator(".mdm-status-badge")).toHaveAttribute("data-status", "DRAFT");
    await expect(topbar(page)).toContainText("편집 중(나)");
    // 룰 화면(ruleMng) 탭은 팝업이 닫히고 오른쪽 상세(① 헤더·② 버전, D-105)가 새 룰로 바뀌어 있다.
    await go(page, "ruleMng");
    await expect(page.getByTestId("rule-register-form")).toHaveCount(0);
    await expect(tid(page, "rule-header-id")).toHaveText(RULE, { timeout: T.LONG });
    await expect(tid(page, "rule-header-name")).toHaveValue(NAME);
    await expect(detailVerRow(page, "1.000").locator(".mdm-status-badge")).toHaveAttribute("data-status", "DRAFT");
    await expect(versionsCard(page)).toContainText("편집 중(나)");
    watcher.assertClean("ruleMng→ruleEdit");
  });

  test("TC-DME-MNG-04 조회(R) — 키워드·종류·상태 조건을 바꿔 가며 방금 만든 룰을 찾는다", async () => {
    await go(page, "ruleMng");
    // 등록이 끝나면 팝업은 닫히고, 다시 열면 칸이 비어 있다.
    await expect(page.getByTestId("rule-register-form")).toHaveCount(0);
    await openRuleRegister(page);
    await expect(tid(page, "rule-reg-id")).toHaveValue("");
    await expect(tid(page, "rule-reg-name")).toHaveValue("");
    await expect(tid(page, "rule-reg-kind")).toHaveValue("DECISION");
    await cancelRuleRegister(page);

    await searchRule(page, RULE);
    await expect(ruleRow(page, RULE)).toHaveCount(1, { timeout: T.UI });
    await expect(ruleCell(page, RULE, "maruRuleName")).toHaveText(NAME);
    await expect(ruleCell(page, RULE, "ruleKind")).toHaveText("판정(DECISION)");
    await expect(ruleCell(page, RULE, "sourceKind")).toHaveText("MDM");
    await expect(ruleCell(page, RULE, "status")).toHaveText("작성");
    await expect(ruleCell(page, RULE, "releasedVer")).toHaveText("");
    // 버전 표기는 소수 major.minor 다(D-144, fd67f90e).
    await expect(ruleCell(page, RULE, "pendingText")).toHaveText(`v1.000 DRAFT · ${STW}`);
    await expect(panelCount(page)).toHaveText("1건");
    await layout.layout(page, "ruleMng 목록 채워짐");

    // 종류 산출·상태 사용 중이면 빠지고, 판정·작성이면 나온다.
    await searchRule(page, RULE, { kind: "DERIVE" });
    await expect(tid(page, "rule-list-empty")).toHaveText("조회된 룰이 없습니다.", { timeout: T.UI });
    await searchRule(page, RULE, { status: "INUSE" });
    await expect(tid(page, "rule-list-empty")).toBeVisible({ timeout: T.UI });
    await searchRule(page, RULE, { kind: "DECISION", status: "CREATED" });
    await expect(ruleRow(page, RULE)).toHaveCount(1, { timeout: T.UI });

    // 룰명 일부 + Enter 로도 찾는다.
    await searchSelect(page, "종류").selectOption("");
    await searchSelect(page, "상태").selectOption("");
    await tid(page, "rule-search-keyword").fill(`품질 판정 ${RUN}`);
    await tid(page, "rule-search-keyword").press("Enter");
    await expect(ruleRow(page, RULE)).toHaveCount(1, { timeout: T.UI });

    // 없는 조건이면 빈 상태.
    await searchRule(page, `${RULE}_NONE`);
    await expect(tid(page, "rule-list-empty")).toBeVisible({ timeout: T.UI });
    await expect(panelCount(page)).toHaveText("0건");
    await layout.layout(page, "ruleMng 빈 목록");
    await snap(page, "dme-ruleMng-04-empty");
    // 쪽 이동은 로컬 룰이 한 쪽(20건) 안이라 버튼이 꺼져 있어 다루지 않는다(보고서 참고).
    watcher.assertClean("ruleMng");
  });

  test("TC-DME-MNG-05 같은 ID 로 다시 등록하면 중복 문구가 보인다", async () => {
    await openRuleRegister(page);
    await tid(page, "rule-reg-id").fill(RULE);
    await tid(page, "rule-reg-name").fill("중복 등록");
    await tid(page, "rule-reg-submit").click();
    // 오류창이 등록 팝업 위에 뜬다. `expectErrorModal`(answerConfirm)은 닫은 뒤 "마지막 보이는 모달"을 다시 찾아
    // 등록 팝업을 가리키게 되므로, 오류창 자체가 사라지는 것으로 본다.
    await expect(errorBody(page)).toContainText("같은 룰 ID 가 이미 있습니다", { timeout: T.UI });
    await snapModal(page, "dme-ruleMng-05-dup");
    await modal(page).getByRole("button", { name: "확인", exact: true }).click();
    await expect(errorBody(page)).toHaveCount(0);
    await expect(tid(page, "rule-register-form")).toBeVisible();
    expectOnly4xx(watcher, "ruleMng 중복 등록");
    // 거부되면 입력값을 그대로 둔다.
    await expect(tid(page, "rule-reg-id")).toHaveValue(RULE);
    await tid(page, "rule-reg-id").fill("");
    await tid(page, "rule-reg-name").fill("");
    // 뒤 테스트가 깨끗한 화면에서 시작하도록 팝업을 닫는다.
    await cancelRuleRegister(page);
    // 등록한 룰의 오른쪽 상세(① 헤더·② 버전, D-105)가 떠 있다 — 그 버튼은 이어지는 시험에서 누른다.
    await assertAllButtonsPressed(page, "ruleMng", {
      "내용 편집 →": "[내용 편집 →] 은 TC-DME-EDT-03 에서 누른다(누르면 룰 화면 탭으로 옮겨 간다)",
      "rule-version-unlock": "해제·선점은 TC-DME-EDT-04 에서 누른다",
      "rule-move-to-confirm": "확정은 TC-DME-CNF-01 에서 누른다(누르면 버전 확정 탭으로 옮겨 간다)",
      "rule-version-delete": "DRAFT 삭제는 장 B TC-DME-VER-04 에서 누른다(이 룰의 버전 1 은 확정까지 이어 간다)",
    });
    watcher.assertClean("ruleMng");
  });

  test("TC-DME-MNG-06 목록의 룰 ID 링크를 누르면 룰 화면이 그 룰로 열린다", async () => {
    await searchRule(page, RULE);
    await ruleRow(page, RULE).locator(`[data-testid="rule-link-${RULE}"]`).click();
    await expect(footerScreenId(page)).toHaveText("ruleEdit", { timeout: T.SLOW });
    await expect(tid(page, "rule-edit-current")).toHaveText(RULE, { timeout: T.LONG });
    watcher.assertClean("ruleMng→ruleEdit");
  });

  // ─────────── ruleEdit — 룰 화면(내용 편집, 버전 1 DRAFT)·ruleMng 상세(① 헤더·② 버전, D-105) ───────────

  test("TC-DME-EDT-01 룰 화면 배치 — 내용 카드 ③~⑧ 이 보이고 열이 없는 새 룰은 표·열 설정이 비어 있다", async () => {
    await openRule(page, RULE);
    await resetClicks(page);
    await expect(breadcrumb(page)).toContainText("마루 MDM > 업무기준 > 룰 화면");
    // D-105: ① 헤더·② 버전 카드는 룰 상세(ruleMng)로 옮겨 갔다 — 여기는 내용 편집 카드만 있다.
    for (const c of ["rule-card-table", "rule-card-value-test", "rule-card-test-result", "rule-card-test-cases", "rule-card-usage"]) {
      await expect(tid(page, c), c).toBeVisible();
    }
    for (const c of ["rule-card-header", "rule-card-versions"]) await expect(tid(page, c), c).toHaveCount(0);
    await expect(tid(page, "rule-edit-current")).toHaveText(RULE);
    await expect(tid(page, "rule-ver-select")).toHaveValue("1.000");
    await expect(topbar(page)).toContainText("편집 중(나)");
    // 표·열 설정은 비어 있다(피벗은 325ccf9c 로 화면에서 빠졌다).
    await expect(dtGrid(page)).toContainText("행이 없습니다.");
    await openColumns(page);
    await expect(colTable(page)).toContainText("열이 없습니다.");
    await expect(tid(page, "contract-notice")).toHaveCount(0); // 최초 버전이라 RELEASED 대비 변경 알림이 없다
    await expect(tid(page, "vt-result-empty")).toBeVisible();
    await expect(tid(page, "tc-empty")).toHaveText("테스트 케이스가 없습니다");
    await expect(tid(page, "rule-card-usage")).toContainText("이 룰을 담은 룰 세트가 없습니다.");
    await expect(tid(page, "rule-card-usage")).toContainText("E2E 품질 판정 화면");
    await layout.layout(page, "ruleEdit 빈 룰");
    await snap(page, "dme-ruleEdit-01-initial");
    watcher.assertClean("ruleEdit");
  });

  test("TC-DME-EDT-02 룰 상세·헤더 수정(U) — 새 룰은 버전 1 DRAFT 하나라 새 버전이 막히고, 룰명·설명·활용처 메모를 고쳐 저장하면 다시 골라도 남는다(룰명을 비우면 저장이 꺼진다)", async () => {
    await go(page, "ruleMng");
    await openRuleDetail(page, RULE);
    await expect(tid(page, "rule-header-source")).toHaveText("MDM");
    await expect(tid(page, "rule-card-header")).toContainText("작성");
    await expect(tid(page, "rule-card-header")).toContainText("판정(DECISION)");
    await expect(tid(page, "rule-header-description")).toHaveValue("E2E 사용자 여정으로 만든 판정 룰");
    await expect(tid(page, "rule-header-usage")).toHaveValue("E2E 품질 판정 화면");
    // 버전 1 DRAFT 하나 — 미적용이 있어 새 버전이 막히고 안내가 보인다. 작성 중 룰은 폐기 버튼이 없다(INUSE 만).
    await expect(gridRows(tid(page, "rule-version-table"))).toHaveCount(1);
    await expect(tid(page, "rule-version-table")).toContainText(STW);
    await expect(tid(page, "rule-ver-new-major")).toBeDisabled();
    await expect(tid(page, "rule-ver-new-minor")).toBeDisabled();
    await expect(tid(page, "rule-unapplied-notice")).toHaveText("미적용 버전이 있어 새 버전을 만들 수 없습니다(한 번에 하나).");
    await expect(cardButton(page, "rule-card-header", "폐기")).toHaveCount(0);
    await expect(tid(page, "rule-version-lock")).toBeDisabled();
    await layout.layout(page, "ruleMng 상세");
    await snap(page, "dme-ruleMng-detail-02-initial");

    const save = tid(page, "rule-header-save");
    await tid(page, "rule-header-name").fill("");
    await expect(save).toBeDisabled();
    await tid(page, "rule-header-name").fill(NAME2);
    await tid(page, "rule-header-description").fill("두께·표면 등급으로 품질 등급을 정한다(E2E)");
    await tid(page, "rule-header-usage").fill("E2E 품질 판정 화면 · 출하 검사");
    await save.click();
    // 저장하면 상세를 다시 읽어 바뀐 값이 기준이 된다 — 다시 바꿀 것이 없으니 저장이 꺼진다.
    await expect(save).toBeDisabled({ timeout: T.UI });

    // 다시 골라도 남는다 — 목록을 다시 조회해 행을 누른다.
    await openRuleDetail(page, RULE);
    await expect(ruleCell(page, RULE, "maruRuleName")).toHaveText(NAME2);
    await expect(tid(page, "rule-header-name")).toHaveValue(NAME2);
    await expect(tid(page, "rule-header-description")).toHaveValue("두께·표면 등급으로 품질 등급을 정한다(E2E)");
    await expect(tid(page, "rule-header-usage")).toHaveValue("E2E 품질 판정 화면 · 출하 검사");
    // 룰 화면도 새 이름·활용처 메모를 보인다.
    await openRule(page, RULE);
    await expect(tid(page, "rule-edit-current-name")).toHaveText(NAME2);
    await expect(tid(page, "rule-card-usage")).toContainText("E2E 품질 판정 화면 · 출하 검사");
    watcher.assertClean("ruleMng·ruleEdit");
  });

  test("TC-DME-EDT-03 찾기 — 없는 룰이면 안내, 룰 상세에서 버전을 골라 [내용 편집 →] 을 누르면 룰 화면이 그 버전으로 열린다", async () => {
    await tid(page, "rule-pick-keyword").fill(`${RULE}_NONE`);
    await tid(page, "rule-pick-keyword").press("Enter");
    await expect(tid(page, "rule-pick-list")).toHaveText("찾은 룰이 없습니다.", { timeout: T.UI });
    await pickRule(page, RULE);
    await expect(tid(page, "rule-pick-list")).toHaveCount(0);
    // 버전 고르기는 룰 상세 ② 버전 표가 맡는다(D-105). 룰 화면 상단 버전 칸은 고른 버전을 보인다.
    await go(page, "ruleMng");
    await openRuleDetail(page, RULE);
    await openContentEdit(page, RULE, "1.000");
    watcher.assertClean("ruleEdit");
  });

  test("TC-DME-EDT-04 해제·선점과 두 사용자 — 남이 잡은 DRAFT 는 잠김이고, 풀면 넘겨받는다", async ({ browser }, testInfo) => {
    // 해제·선점·넘기기는 룰 상세 ② 버전 줄에 있다(D-105). 내용 편집 가능 여부는 룰 화면이 같은 소유로 판단한다.
    await go(page, "ruleMng");
    await openRuleDetail(page, RULE);
    await selectDetailVer(page, "1.000");
    await tid(page, "rule-version-unlock").click();
    await expect(versionsCard(page)).toContainText("선점 가능", { timeout: T.UI });
    await expect(tid(page, "rule-version-lock")).toBeEnabled();
    for (const b of ["rule-version-unlock", "rule-handover", "rule-version-delete"]) await expect(tid(page, b), b).toBeDisabled();
    await snap(page, "dme-ruleMng-04-unlocked");
    await openRule(page, RULE);
    await expect(topbar(page)).toContainText("선점 가능");
    await expect(tableButton(page, "행 추가")).toBeDisabled();
    await go(page, "ruleMng");
    await openRuleDetail(page, RULE);
    await selectDetailVer(page, "1.000");
    await tid(page, "rule-version-lock").click();
    await expect(versionsCard(page)).toContainText("편집 중(나)", { timeout: T.UI });
    await openRule(page, RULE);
    await expect(tableButton(page, "행 추가")).toBeEnabled();

    const other = await openAs(browser, "stw2", testInfo);
    const p2 = other.page;
    try {
      await go(p2, "ruleMng");
      await openRuleDetail(p2, RULE);
      await selectDetailVer(p2, "1.000");
      await expect(versionsCard(p2)).toContainText(`잠김 · ${STW} 편집 중`);
      for (const b of ["rule-version-unlock", "rule-handover", "rule-version-delete", "rule-version-lock"]) {
        await expect(tid(p2, b), `${b}(stw2)`).toBeDisabled();
      }
      await expect(tid(p2, "rule-move-to-confirm"), "확정(stw2)").toBeEnabled(); // 소유자 판정은 확정 화면이 한다(설계 §9)
      await openRule(p2, RULE);
      await expect(topbar(p2)).toContainText(`잠김 · ${STW} 편집 중`);
      await expect(tableButton(p2, "행 추가")).toBeDisabled();
      await openColumns(p2);
      await expect(tid(p2, "col-readonly")).toBeVisible();
      await snap(p2, "dme-ruleEdit-04-locked-by-other");

      // stw 해제 → stw2 가 다시 골라 선점 → stw 화면은 잠김 → stw2 해제 → stw 선점.
      await go(page, "ruleMng");
      await openRuleDetail(page, RULE);
      await selectDetailVer(page, "1.000");
      await tid(page, "rule-version-unlock").click();
      await expect(versionsCard(page)).toContainText("선점 가능", { timeout: T.UI });
      await go(p2, "ruleMng");
      await openRuleDetail(p2, RULE);
      await selectDetailVer(p2, "1.000");
      await tid(p2, "rule-version-lock").click();
      await expect(versionsCard(p2)).toContainText("편집 중(나)", { timeout: T.UI });
      await openRule(page, RULE);
      await expect(topbar(page)).toContainText(`잠김 · ${STW2} 편집 중`);
      await expect(tableButton(page, "행 추가")).toBeDisabled();
      await tid(p2, "rule-version-unlock").click();
      await expect(versionsCard(p2)).toContainText("선점 가능", { timeout: T.UI });
      other.watcher.assertClean("ruleMng·ruleEdit(stw2)");
    } finally {
      await p2.context().close();
    }
    await go(page, "ruleMng");
    await openRuleDetail(page, RULE);
    await selectDetailVer(page, "1.000");
    await tid(page, "rule-version-lock").click();
    await expect(versionsCard(page)).toContainText("편집 중(나)", { timeout: T.UI });
    await openRule(page, RULE);
    await expect(topbar(page)).toContainText("편집 중(나)");
    watcher.assertClean("ruleMng·ruleEdit");
  });

  // ─────────── 열 설정 ───────────

  test("TC-DME-COL-01 열 설정 초안 — 빈 새 열은 거부로 보이고 표 저장이 막히며, 도메인 찾기 팝업을 열고 닫은 뒤 초안을 버린다", async () => {
    const key = await clickAddColumn(page, "COND");
    await expect(tid(page, "col-dirty")).toHaveText("열 설정 초안(저장 안 함)");
    await expect(tid(page, `col-check-${key}`)).toContainText("조건 변수은(는) 필수입니다");
    await expect(tid(page, "col-reject-count")).toHaveText("거부 1건");
    await expect(tid(page, "dt-col-block")).toContainText("열 설정 초안이 있어 표를 저장할 수 없습니다");
    await expect(tid(page, "vt-col-draft")).toContainText("열 설정 초안은 반영하지 않습니다");

    // 거부가 있으면 적용해도 아무것도 반영되지 않는다.
    await tid(page, "col-apply").click();
    await expect(tid(page, "col-apply-rejects")).toContainText("아무 것도 반영되지 않음");
    await layout.layout(page, "ruleEdit 열 설정 거부");
    await snap(page, "dme-ruleEdit-COL-01-rejected");

    // 도메인 찾기 — 팝업이 열리고, 검색하면 결과(또는 없음 안내)가 보이며, [닫기]로 닫힌다.
    await tid(page, `col-domain-open-${key}`).click();
    const box = tid(page, `col-domain-${key}`);
    await expect(modal(page)).toContainText("값 타입 도메인 찾기 · 새 열");
    await tid(page, `col-domain-${key}-keyword`).fill("E2E_NO_SUCH_DOMAIN");
    await tid(page, `col-domain-${key}-search`).click();
    await expect(box).toContainText("검색 결과가 없습니다.", { timeout: T.UI });
    await snapModal(page, "dme-ruleEdit-COL-01-domain");
    await box.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(box).toHaveCount(0);

    await tid(page, "col-discard").click();
    await expect(tid(page, "col-dirty")).toHaveCount(0);
    await expect(colTable(page)).toContainText("열이 없습니다.");
    await expect(tid(page, "dt-col-block")).toHaveCount(0);
    watcher.assertClean("ruleEdit");
  });

  test("TC-DME-COL-02 열 등록(C) — 조건 2 타입·Equal 과 결과 열을 넣고, 순서·임시 열 삭제를 거쳐 적용하면 표 머리에 보인다", async () => {
    // 피벗 축(ROW·COL) 칸은 피벗과 함께 없어졌다(325ccf9c, V13__drop_rule_var_axis).
    const thk = await addColumn(page, { kind: "COND", disp: "2", name: THK, label: "두께", type: "NUMBER" });
    const surf = await addColumn(page, { kind: "COND", disp: "Equal", name: SURF, label: "표면", type: "STRING" });
    const grd = await addColumn(page, { kind: "RESULT", disp: "Value", name: GRD, label: "등급", type: "STRING" });
    for (const k of [thk, surf, grd]) await expect(tid(page, `col-check-${k}`), k).toHaveText("통과");
    await expect(tid(page, `col-disp-${thk}`)).toHaveText("2");
    await expect(tid(page, `col-type-${surf}`)).toHaveText("STRING");
    await expect(tid(page, "col-reject-count")).toHaveText("거부 0건");
    await expect(tid(page, "col-notices")).toContainText(`새 열 ${THK}: 적용하면 var_id 가 발급되고 표에 빈 칸이 생깁니다.`);

    // 순서 — 같은 묶음(조건) 안에서만 움직인다. 표면을 위로 올렸다 다시 내린다.
    const order = async () =>
      colTable(page)
        .locator('.ag-center-cols-container [data-testid^="col-name-"]')
        .allTextContents();
    await colTable(page).getByRole("button", { name: `${SURF} 위로`, exact: true }).click();
    await expect.poll(order).toEqual([SURF, THK, GRD]);
    await colTable(page).getByRole("button", { name: `${SURF} 아래로`, exact: true }).click();
    await expect.poll(order).toEqual([THK, SURF, GRD]);
    // 결과 열은 조건 묶음 위로 넘어가지 않는다.
    await colTable(page).getByRole("button", { name: `${GRD} 위로`, exact: true }).click();
    await expect.poll(order).toEqual([THK, SURF, GRD]);

    // 임시 결과 열을 더했다가 삭제 단추로 뺀다(저장 전 새 열은 바로 사라진다).
    const tmp = await clickAddColumn(page, "RESULT");
    await colEdit(page, tmp, "varName", "E2E_TMP");
    await expect(tid(page, `col-check-${tmp}`)).toContainText("결과 열은 값 타입");
    await expect(tid(page, "col-reject-count")).toHaveText("거부 1건");
    await tid(page, `col-del-${tmp}`).click();
    await expect(colCell(page, tmp, "varName")).toHaveCount(0);
    await expect(tid(page, "col-reject-count")).toHaveText("거부 0건");
    await layout.layout(page, "ruleEdit 열 설정 초안");
    await snap(page, "dme-ruleEdit-COL-02-draft");

    await tid(page, "col-apply").click();
    await expect(tid(page, "col-dirty")).toHaveCount(0, { timeout: T.LONG });
    await expect(tid(page, "rule-edit-notice")).toContainText(`새 열 ${THK}`);
    vThk = await varIdOf(page, "두께");
    vSurf = await varIdOf(page, "표면");
    vGrd = await varIdOf(page, "등급");
    await expect(tid(page, `dt-var-header-${vThk}`)).toContainText("2 타입");
    await expect(tid(page, `dt-var-header-${vThk}`)).toContainText("Number");
    await expect(tid(page, `dt-var-header-${vSurf}`)).toContainText("Equal");
    await expect(tid(page, `dt-var-header-${vGrd}`)).toContainText("상수");
    for (const h of ["OP", "하한", "상한", "무관", "값"]) {
      await expect(dtGrid(page).locator(".ag-header-cell-text").filter({ hasText: new RegExp(`^${h}$`) }).first(), h).toBeVisible();
    }
    // 적용한 열은 발급된 var_id 키로 다시 그려진다.
    await expect(tid(page, `col-name-v${vThk}`)).toHaveText(THK);
    await expect(tid(page, `col-name-v${vSurf}`)).toHaveText(SURF);
    watcher.assertClean("ruleEdit");
  });

  // ─────────── 의사결정표 ───────────

  test("TC-DME-DT-01 조건이 전부 - 인 행은 즉시 검사에 오류로 보이고 저장이 거부되며, [되돌리기]로 원래대로 돌아온다", async () => {
    await tid(page, "dt-hit-policy").selectOption("UNIQUE");
    await expect(tid(page, "rule-card-table")).toContainText("맞는 행이 하나뿐이어야 한다");
    const id = await addRowBy(page, () => tableButton(page, "행 추가").click());
    await expect(tid(page, "dt-dirty")).toHaveText("저장 안 한 변경");
    await expect(tid(page, "dt-check-rows")).toContainText(`[ALL_NA_ROW] 행 ${id}`);
    // 결과 칸이 비었으면 미완성으로 먼저 거부된다.
    await tableButton(page, "표 저장").click();
    await expect(tid(page, "dt-save-rejected")).toContainText("룰 저장 거부", { timeout: T.LONG });
    await expect(tid(page, "dt-save-rejected")).toContainText("INCOMPLETE_RESULT");
    await expectErrorModal(page, "INCOMPLETE_RESULT");
    // 결과를 채워도 조건이 전부 - 면 도달 불가 행으로 거부된다.
    await dtEdit(page, id, `c${vGrd}_val`, "X");
    await expect(tid(page, "dt-save-rejected")).toHaveCount(0);
    await tableButton(page, "표 저장").click();
    await expect(tid(page, "dt-save-rejected")).toContainText("ALL_NA_ROW", { timeout: T.LONG });
    await expectErrorModal(page, "ALL_NA_ROW", "dme-ruleEdit-DT-01-rejected");
    expectOnly4xx(watcher, "ruleEdit 표 저장 거부");
    // 거부돼도 편집은 남는다.
    await expect(tid(page, `dt-row-${id}`)).toBeVisible();
    await tableButton(page, "되돌리기").click();
    await expect(dtRows(page)).toHaveCount(0);
    await expect(tid(page, "dt-dirty")).toHaveCount(0);
    await expect(tid(page, "dt-save-rejected")).toHaveCount(0);
    watcher.assertClean("ruleEdit");
  });

  test("TC-DME-DT-02 행 등록(C) — 행 추가·행 복사·기본 행으로 결정표를 채우고 저장하면 서버 검사와 같다", async () => {
    await tid(page, "dt-hit-policy").selectOption("UNIQUE");
    // 1행: 두께 [1.6, 2.5) · 표면 A → A
    const r1 = await addRowBy(page, () => tableButton(page, "행 추가").click());
    // [행 복사]는 고른 행이 있어야 켜진다 — [행 추가]만으로는 새 행을 고르지 않는다.
    await expect(tid(page, "dt-copy-row")).toBeDisabled();
    await dtOp(page, r1, `c${vThk}_op`, "<= 변수 <");
    await dtEdit(page, r1, `c${vThk}_left`, "1.6");
    await dtEdit(page, r1, `c${vThk}_right`, "2.5");
    await dtEqual(page, r1, vSurf, "A");
    await dtEdit(page, r1, `c${vGrd}_val`, "A");
    // 어느 칸을 눌러도 그 행을 고른다(f7d9c47a, DecisionTableCard handleRowClick) — 칸을 고친 1행이 골라져 [행 복사]가 켜진다.
    await expect(tid(page, "dt-copy-row")).toBeEnabled();
    // 2행: 행 번호로 1행을 골라 [행 복사] → 표면 B → B
    await tid(page, `dt-row-${r1}`).click();
    await expect(tid(page, "dt-copy-row")).toBeEnabled();
    const r2 = await addRowBy(page, () => tid(page, "dt-copy-row").click());
    expect(await dtRowIds(page)).toEqual([r1, r2]);
    await expect(dtCell(page, r2, `c${vThk}_left`)).toHaveText("1.6");
    await dtEdit(page, r2, `c${vSurf}_left`, "B");
    await dtEdit(page, r2, `c${vGrd}_val`, "B");
    // 3행: 두께 [2.5, 10) · 표면 A → B
    const r3 = await addRowBy(page, () => tableButton(page, "행 추가").click());
    await dtOp(page, r3, `c${vThk}_op`, "<= 변수 <");
    await dtEdit(page, r3, `c${vThk}_left`, "2.5");
    await dtEdit(page, r3, `c${vThk}_right`, "10");
    await dtEqual(page, r3, vSurf, "A");
    await dtEdit(page, r3, `c${vGrd}_val`, "B");
    // 기본 행 → C. 기본 행은 하나뿐이라 버튼이 꺼진다.
    const rd = await addRowBy(page, () => tableButton(page, "기본 행 추가").click());
    await expect(tid(page, `dt-row-${rd}`)).toContainText("기본");
    await expect(tableButton(page, "기본 행 추가")).toBeDisabled();
    await dtEdit(page, rd, `c${vGrd}_val`, "C");
    await dtEdit(page, r1, "note", "E2E 중간 두께 A");
    await expect(tid(page, "dt-check-count")).toHaveText(/^오류 0 · 경고 \d+$/);
    await expect(tid(page, "dt-check")).toContainText("검사(화면)");
    await layout.layout(page, "ruleEdit 표 편집 중");
    await snap(page, "dme-ruleEdit-DT-02-editing");

    await tableButton(page, "표 저장").click();
    await expect(tid(page, "dt-dirty")).toHaveCount(0, { timeout: T.LONG });
    await expect(tid(page, "dt-check-same")).toHaveText("화면·서버 검사 일치");
    await expect(tid(page, "dt-check")).toContainText("검사(서버)");
    // 저장하면 새 행이 발급된 row_id 를 받는다(음수 임시 ID 가 없다).
    const ids = await dtRowIds(page);
    expect(ids).toHaveLength(4);
    expect(ids.every((i) => i > 0), `발급된 row_id: ${ids}`).toBe(true);
    await expect(tid(page, "dt-hit-policy")).toHaveValue("UNIQUE");
    await expect(dtCell(page, ids[0], "note")).toHaveText("E2E 중간 두께 A");
    await expect(dtCell(page, ids[1], `c${vSurf}_left`)).toHaveText("B");
    await expect(dtCell(page, ids[2], `c${vThk}_right`)).toHaveText("10");
    await expect(dtCell(page, ids[3], `c${vGrd}_val`)).toHaveText("C");

    // 다시 골라도 같다.
    await pickRule(page, RULE);
    expect(await dtRowIds(page)).toEqual(ids);
    await expect(dtCell(page, ids[0], `c${vGrd}_val`)).toHaveText("A");
    watcher.assertClean("ruleEdit");
  });

  test("TC-DME-DT-03 수정(U)·삭제(D) — 행을 고르면 적중 조건 칸이 강조되고, UNIQUE 겹침은 거부되며, 늘린 행을 ✕로 지워 저장한다", async () => {
    const ids = await dtRowIds(page);
    // 행 선택 강조 — 1행의 - 가 아닌 조건 칸(두께 OP·표면 값)만.
    await tid(page, `dt-row-${ids[0]}`).click();
    await expect(dtCell(page, ids[0], `c${vThk}_op`)).toHaveClass(/cell-emphasis/);
    await expect(dtCell(page, ids[1], `c${vThk}_op`)).not.toHaveClass(/cell-emphasis/);

    // 2행 표면 B → A: 1행과 겹친다. UNIQUE 라 오류이고 저장이 거부된다.
    await dtEdit(page, ids[1], `c${vSurf}_left`, "A");
    await expect(tid(page, "dt-check-rows")).toContainText("오류 [OVERLAP]");
    await tableButton(page, "표 저장").click();
    await expect(tid(page, "dt-save-rejected")).toContainText("OVERLAP", { timeout: T.LONG });
    await expectErrorModal(page, "룰 저장 거부");
    expectOnly4xx(watcher, "ruleEdit 겹침 저장 거부");
    // FIRST 로 바꾸면 겹침은 경고다 — 저장하지 않고 되돌린다.
    await tid(page, "dt-hit-policy").selectOption("FIRST");
    await expect(tid(page, "dt-check-rows")).toContainText("경고 [OVERLAP]");
    await tableButton(page, "되돌리기").click();
    await expect(tid(page, "dt-dirty")).toHaveCount(0);
    await expect(tid(page, "dt-hit-policy")).toHaveValue("UNIQUE");
    await expect(dtCell(page, ids[1], `c${vSurf}_left`)).toHaveText("B");

    // 수정: 1행 설명을 고치고, 3행을 복사해 두께 [10, 20) 으로 늘려 저장한다.
    await dtEdit(page, ids[0], "note", "E2E 중간 두께 A(수정)");
    await tid(page, `dt-row-${ids[2]}`).click();
    const extra = await addRowBy(page, () => tid(page, "dt-copy-row").click());
    await dtEdit(page, extra, `c${vThk}_left`, "10");
    await dtEdit(page, extra, `c${vThk}_right`, "20");
    await tableButton(page, "표 저장").click();
    await expect(tid(page, "dt-dirty")).toHaveCount(0, { timeout: T.LONG });
    const five = await dtRowIds(page);
    expect(five).toHaveLength(5);
    await expect(dtCell(page, ids[0], "note")).toHaveText("E2E 중간 두께 A(수정)");

    // 삭제: 늘린 행을 ✕ 로 지워 저장하면 네 행으로 돌아온다.
    const added = five.find((i) => !ids.includes(i))!;
    await tid(page, `dt-del-${added}`).click();
    await expect(tid(page, `dt-row-${added}`)).toHaveCount(0);
    await tableButton(page, "표 저장").click();
    await expect(tid(page, "dt-dirty")).toHaveCount(0, { timeout: T.LONG });
    expect(await dtRowIds(page)).toEqual(ids);
    await layout.layout(page, "ruleEdit 표 저장 뒤");
    watcher.assertClean("ruleEdit");
  });

  // ─────────── 입력 계약 ───────────
  // TC-DME-PVT-01(피벗)은 지웠다 — 피벗 보기·룰 변수 축이 제품에서 빠졌다(325ccf9c: PivotSection·pivot-model 삭제,
  // V13__drop_rule_var_axis.sql). 화면 스펙 mdm-ruleEdit C2 도 같은 근거로 지웠다(54ecd830).

  test("TC-DME-CTR-01 입력 계약 — 조건 변수는 ④ 값 테스트 입력 표에 보이고, 최초 버전이라 RELEASED 대비 변경 알림은 없다", async () => {
    await expect(tid(page, `vt-field-${THK}`)).toBeVisible({ timeout: T.LONG });
    await expect(tid(page, `vt-field-${SURF}`)).toBeVisible();
    await expect(tid(page, "contract-notice")).toHaveCount(0);
    await layout.layout(page, "ruleEdit 입력 계약");
    await snap(page, "dme-ruleEdit-CTR-01-contract");
    watcher.assertClean("ruleEdit");
  });

  // ─────────── 값 테스트·테스트 케이스 ───────────

  test("TC-DME-VT-01 값 테스트 — 편집본·저장된 버전으로 돌려 적중 행을 칠하고, 키를 빼면 판정 오류, 어느 행도 안 맞으면 기본 행이다", async () => {
    await expect(tid(page, "vt-target")).toHaveValue("BODY");
    await expect(tid(page, "vt-mode")).toContainText("본문 정의");
    await vtInput(page, THK, "2.0");
    await vtInput(page, SURF, "A");
    await vtRun(page);
    await expect(tid(page, "vt-result-target")).toContainText("판정함");
    await expect(resultValue(page, GRD)).toHaveText(/^\s*"?A"?\s*$/);
    const ids = await dtRowIds(page);
    await expect(tid(page, "vt-result-hits")).toContainText(`row_id ${ids[0]}`);
    await expect(tid(page, "vt-result-on-table")).toBeVisible();
    await expect(tid(page, "dt-test-shown")).toContainText("편집본");
    await expect(gridRowById(dtGrid(page), String(ids[0]))).toHaveClass(/ag-row-test-hit/);
    await tid(page, "rule-card-test-result").scrollIntoViewIfNeeded();
    await snap(page, "dme-ruleEdit-VT-01-body");

    // 저장된 버전 1 로 돌려도 같다.
    await tid(page, "vt-target").selectOption({ label: "버전 v1.000 · DRAFT" });
    await expect(tid(page, "vt-mode")).toContainText("저장된 버전");
    await vtRun(page);
    await expect(tid(page, "vt-result-target")).toContainText("버전 v1.000");
    await expect(resultValue(page, GRD)).toHaveText(/^\s*"?A"?\s*$/);

    // 두께 키를 빼면 레코드에 키가 없어 판정 오류(MISSING_KEY).
    // 키 보냄 체크박스는 그리드 칸 안의 제어 컴포넌트라 상태가 행 갱신으로 한 박자 늦게 바뀐다 — uncheck() 는 누른 직후 상태를 확인해
    // "did not change its state" 로 흔들린다(화면 스펙 mdm-ruleEdit V3 의 trace 로 확정, bd2ae53f). 누르고 바뀔 때까지 기다린다.
    const keyBox = tid(page, `vt-key-${THK}`).locator('input[type="checkbox"]');
    await keyBox.click();
    await expect(keyBox).not.toBeChecked();
    await expect(vtValueCell(page, THK)).toHaveText("(키 없음)");
    await vtRun(page);
    await expect(tid(page, "vt-result-target")).toContainText("판정 오류");
    await expect(tid(page, "vt-result-errors")).toContainText(`${THK} 값이`);
    await expect(tid(page, "vt-result-errors").locator("li").first()).toHaveAttribute("title", /MISSING_KEY/);
    await keyBox.click();
    await expect(keyBox).toBeChecked();

    // 두께 5.0 · 표면 B 는 어느 행도 맞지 않아 기본 행 C 다.
    await tid(page, "vt-target").selectOption("BODY");
    await vtInput(page, THK, "5.0");
    await vtInput(page, SURF, "B");
    await vtRun(page);
    await expect(resultValue(page, GRD)).toHaveText(/^\s*"?C"?\s*$/);
    await expect(tid(page, "vt-result-hits")).toContainText("어느 행도 참이 아니어서 기본 행");
    await layout.layout(page, "ruleEdit 값 테스트 결과");
    watcher.assertClean("ruleEdit");
  });

  test("TC-DME-TC-01 테스트 케이스 CRUD — 저장·모두 실행·불러오기·수정(취소·오류·기대값 틀림)·기대값 갱신·삭제", async () => {
    // 등록: 방금 돌린 결과(5.0·B → C)가 기대값으로 실린다.
    await expect(vtCard(page).getByRole("button", { name: "케이스로 저장", exact: true })).toBeDisabled();
    await tid(page, "vt-case-name").fill(CASE_C);
    await vtCard(page).getByRole("button", { name: "케이스로 저장", exact: true }).click();
    await expect(caseRow(page, CASE_C)).toBeVisible({ timeout: T.LONG });
    await expect(caseRow(page, CASE_C)).toContainText(`"${GRD}"`);
    await expect(tid(page, "vt-case-name")).toHaveValue("");
    await vtInput(page, THK, "2.0");
    await vtInput(page, SURF, "A");
    await vtRun(page);
    await tid(page, "vt-case-name").fill(CASE_A);
    await vtCard(page).getByRole("button", { name: "케이스로 저장", exact: true }).click();
    await expect(caseRow(page, CASE_A)).toBeVisible({ timeout: T.LONG });
    await tid(page, "vt-case-name").fill(CASE_DEL);
    await vtCard(page).getByRole("button", { name: "케이스로 저장", exact: true }).click();
    await expect(caseRow(page, CASE_DEL)).toBeVisible({ timeout: T.LONG });
    await expect(tid(page, "tc-empty")).toHaveCount(0);

    // 조회: 모두 실행 — 기대값이 맞아 통과.
    await tcCard(page).getByRole("button", { name: "모두 실행", exact: true }).click();
    for (const n of [CASE_A, CASE_C, CASE_DEL]) {
      await expect(caseRow(page, n).locator('[data-testid^="tc-badge-"]'), n).toHaveText(/통과/, { timeout: T.LONG });
    }
    await layout.layout(page, "ruleEdit 테스트 케이스");
    await tcCard(page).scrollIntoViewIfNeeded();
    await snap(page, "dme-ruleEdit-TC-01-cases");

    // 한 케이스만 실행(체크 → 머리글 [실행]) — 그 케이스만 배지가 남는다.
    await pickCases(page, CASE_A);
    await tid(page, "tc-run").click();
    await expect(caseRow(page, CASE_A).locator('[data-testid^="tc-badge-"]')).toHaveText(/통과/, { timeout: T.LONG });
    await expect(caseRow(page, CASE_C).locator('[data-testid^="tc-badge-"]')).toHaveCount(0);
    await pickCases(page, CASE_C);
    await tid(page, "tc-run").click();
    await expect(caseRow(page, CASE_C).locator('[data-testid^="tc-badge-"]')).toHaveText(/통과/, { timeout: T.LONG });
    await expect(caseRow(page, CASE_A).locator('[data-testid^="tc-badge-"]')).toHaveCount(0);

    // 불러오기 — 케이스 입력이 값 테스트 칸에 채워진다.
    await vtInput(page, THK, "");
    await vtInput(page, SURF, "");
    await pickCases(page, CASE_C);
    await tid(page, "tc-load").click();
    await expect(vtValueCell(page, SURF)).toHaveText("B");
    await expect(vtValueCell(page, THK)).toHaveText(/^5(\.0)?$/);

    // 수정: 팝업은 폼 탭으로 열린다. [값 테스트 입력으로 바꾸기] 후 [취소] 하면 아무것도 바뀌지 않는다.
    await pickCases(page, CASE_A);
    await tid(page, "tc-edit").click();
    await expect(tid(page, "tc-edit-modal")).toBeVisible();
    await expect(tid(page, "tc-edit-name")).toHaveValue(CASE_A);
    await tid(page, "tc-edit-use-input").click();
    await expect(tid(page, `tc-form-in-${SURF}`)).toHaveValue("B");
    await snapModal(page, "dme-ruleEdit-TC-01-edit-modal");
    await modal(page).getByRole("button", { name: "취소", exact: true }).click();
    await expect(tid(page, "tc-edit-modal")).toHaveCount(0);
    await expect(caseRow(page, CASE_A)).toContainText(`"${SURF}":"A"`);

    // 수정: JSON 탭에서 입력 JSON 이 깨지면 팝업 안 오류로 막힌다.
    await pickCases(page, CASE_C);
    await tid(page, "tc-edit").click();
    await tid(page, "tc-edit-tab-json").click();
    await tid(page, "tc-edit-input").fill("{");
    await tid(page, "tc-edit-save").click();
    await expect(tid(page, "tc-edit-error")).toBeVisible();
    await expect(tid(page, "tc-edit-modal")).toBeVisible();
    // 수정(U): 이름·설명·틀린 기대값으로 저장하면 모두 실행에서 실패로 보인다.
    await tid(page, "tc-edit-input").fill(`{"${THK}": 5.0, "${SURF}": "B"}`);
    await tid(page, "tc-edit-name").fill(`${CASE_C}(수정)`);
    await tid(page, "tc-edit-desc").fill("기대값을 일부러 틀리게 둔다");
    await tid(page, "tc-edit-expected").fill(`{"${GRD}": "Z"}`);
    await tid(page, "tc-edit-save").click();
    await expect(tid(page, "tc-edit-modal")).toHaveCount(0, { timeout: T.UI });
    const edited = caseRow(page, `${CASE_C}(수정)`);
    await expect(edited).toContainText("기대값을 일부러 틀리게 둔다");
    await expect(edited).toContainText('"Z"');
    await tcCard(page).getByRole("button", { name: "모두 실행", exact: true }).click();
    await expect(edited.locator('[data-testid^="tc-badge-"]')).toHaveText(/실패/, { timeout: T.LONG });
    await expect(edited).toContainText(GRD);

    // 기대값 갱신 — 마지막 결과(C)로 기대값을 다시 쓰면 통과로 돌아온다.
    // 수정 저장 뒤 다시 불러온 view 에도 같은 케이스(case_id)가 남아 체크가 유지된다.
    await pickCases(page, `${CASE_C}(수정)`);
    await tid(page, "tc-update-expected").click();
    await expect(edited).not.toContainText('"Z"', { timeout: T.UI });
    await tcCard(page).getByRole("button", { name: "모두 실행", exact: true }).click();
    await expect(edited.locator('[data-testid^="tc-badge-"]')).toHaveText(/통과/, { timeout: T.LONG });

    // 복사(C) — 남길 두 케이스를 함께 체크해 복사하면 "(복사)" 이름으로 같은 입력·기대값의 줄이 생긴다. 복사본은 곧 함께 지운다.
    const copied = [CASE_A, `${CASE_C}(수정)`];
    await pickCases(page, ...copied);
    await tid(page, "tc-copy").click();
    for (const n of copied) {
      await expect(caseRow(page, `${n} (복사)`)).toBeVisible({ timeout: T.UI });
      const input = (row: Locator) => row.locator('.ag-cell[col-id="inputJson"]');
      await expect(input(caseRow(page, `${n} (복사)`))).toHaveText((await input(caseRow(page, n)).textContent())!);
    }
    await expect(caseRows(page)).toHaveCount(5);
    await pickCases(page, ...copied.map((n) => `${n} (복사)`));
    await deletePickedCases(page, 2);
    for (const n of copied) await expect(caseRow(page, `${n} (복사)`)).toHaveCount(0, { timeout: T.UI });

    // 삭제(D) — 확인창에서 확인해야 지운다.
    await pickCases(page, CASE_DEL);
    await deletePickedCases(page, 1);
    await expect(caseRow(page, CASE_DEL)).toHaveCount(0, { timeout: T.UI });
    await expect(caseRows(page)).toHaveCount(2);
    watcher.assertClean("ruleEdit");
  });

  test("TC-DME-EDT-05 카드 묶음·섹션 접기와 빈 넘기기 안내 — 룰 화면의 모든 버튼을 한 번씩 눌렀다", async () => {
    // 경계값 케이스 만들기(b3317e4d) — 팝업을 열어 본 뒤 저장하지 않고 닫는다(케이스는 그대로 둘이다).
    await tid(page, "tc-boundary").click();
    await expect(tid(page, "bc-modal")).toBeVisible({ timeout: T.UI });
    await snapModal(page, "dme-ruleEdit-05-boundary");
    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).last().click();
    await expect(page.locator('[data-testid="bc-modal"]')).toHaveCount(0);
    await expect(caseRows(page)).toHaveCount(2);
    // 카드 묶음은 ④⑤⑥(valueTests) 하나다 — ①② 묶음(headerVersions)은 룰 상세로 옮겨 가며 없어졌다(D-105, cards.ts).
    await tid(page, "rule-group-valueTests-toggle").click();
    await expect(page.locator('[data-testid="rule-group-valueTests-body"]')).toBeHidden();
    await tid(page, "rule-group-valueTests-toggle").click();
    await expect(tid(page, "rule-group-valueTests-body")).toBeVisible();
    // 열 설정은 처음에 접혀 있으므로(2026-10-01) 먼저 펼쳐 둔 뒤 접기·펼치기를 본다. 피벗 섹션은 없어졌다(325ccf9c).
    await openColumns(page);
    await tid(page, "rule-section-columns-toggle").click();
    await expect(page.locator('[data-testid="rule-section-columns-body"]')).toBeHidden();
    await tid(page, "rule-section-columns-toggle").click();
    await expect(tid(page, "rule-section-columns-body")).toBeVisible();
    // 의사결정표 [크게 보기]와 검사 섹션 접기(f7d9c47a)는 행이 있는 표에서 보인다 — 누르면 바뀌고 다시 누르면 돌아온다.
    await tid(page, "dt-expand").click();
    await expect(tid(page, "dt-expand")).toHaveText("원래 크기");
    await expect(tid(page, "dt-expand")).toHaveAttribute("aria-pressed", "true");
    await tid(page, "dt-expand").click();
    await expect(tid(page, "dt-expand")).toHaveText("크게 보기");
    for (const sec of ["dt-check", "dt-check-table"]) {
      const toggle = tid(page, `${sec}-toggle`);
      const before = await toggle.getAttribute("aria-expanded");
      expect(before, sec).toMatch(/^(true|false)$/);
      const after = before === "true" ? "false" : "true";
      await toggle.click();
      await expect(toggle, sec).toHaveAttribute("aria-expanded", after);
      await toggle.click();
      await expect(toggle, sec).toHaveAttribute("aria-expanded", before as string);
    }
    await expect(topbar(page)).toContainText("편집 중(나)");
    await layout.layout(page, "ruleEdit 편집 끝");
    await snap(page, "dme-ruleEdit-05-done");
    await assertAllButtonsPressed(page, "ruleEdit(버전 1 DRAFT)");

    // 넘기기 — 룰 상세 ② 버전 줄에 있다(D-105). 준비 중이라 받는 사람 칸과 버튼이 꺼져 있고, 올려 보면 이유를 알린다(D2 보류, TC-DME-HND-01).
    await go(page, "ruleMng");
    await openRuleDetail(page, RULE);
    await selectDetailVer(page, "1.000");
    await expect(versionsCard(page)).toContainText("편집 중(나)");
    await expect(tid(page, "rule-handover-target")).toBeDisabled();
    await expect(tid(page, "rule-handover")).toHaveText(HANDOVER);
    await expect(tid(page, "rule-handover")).toBeDisabled();
    await expect(tid(page, "rule-handover-wrap")).toHaveAttribute("title", HANDOVER_PENDING);
    watcher.assertClean("ruleEdit·ruleMng");
  });

  // ─────────── ruleConfirm — 버전 확정 ───────────

  test("TC-DME-CNF-01 [확정]으로 버전 확정 화면이 그 DRAFT 로 열린다", async () => {
    // 확정 이동은 룰 상세 ② 버전 줄의 [확정] 이다(D-105, 86ec7d67). EDT-05 가 룰 상세에서 버전 1 을 골라 두었다.
    await expect(detailVerRow(page, "1.000")).toHaveClass(/ag-row-highlighted/);
    await tid(page, "rule-move-to-confirm").click();
    await expect(footerScreenId(page)).toHaveText("ruleConfirm", { timeout: T.SLOW });
    await resetClicks(page);
    await expect(breadcrumb(page)).toContainText("마루 MDM > 업무기준 > 버전 확정");
    await expect(tid(page, "rc-target")).toHaveText(`${RULE} 버전 v1.000 · DECISION`, { timeout: T.LONG });
    await expect(tid(page, "rc-form")).toContainText(NAME2);
    await expect(tid(page, "rc-form")).toContainText("편집 중(나)");
    await expect(tid(page, "rc-previous")).toHaveText("최초 버전 — 적용 순서 검사를 하지 않습니다");
    await expect(tid(page, "rc-contract")).toHaveAttribute("data-state", "FIRST");
    await expect(tid(page, "rc-diff-counts")).toHaveText("추가 4 · 삭제 0 · 수정 0 · 같음 0");
    await expect(tid(page, "rc-confirm")).toBeDisabled();
    await layout.layout(page, "ruleConfirm");
    await snap(page, "dme-ruleConfirm-01-initial");
    watcher.assertClean("ruleConfirm");
  });

  test("TC-DME-CNF-02 조회(R) — 확정 대기 목록을 검색어로 좁히고 풀어 본다", async () => {
    await tid(page, "rc-keyword").fill(RULE);
    await tid(page, "rc-search").click();
    // 확정 대기 목록은 AgDataGrid 다 — rc-row-* 는 룰 ID 칸 표지이고, 행은 row-id(룰 ID-버전, 버전은 "1.000" 표기 — D-144)로 찾는다.
    const row = gridRowById(tid(page, "rc-list"), `${RULE}-1.000`);
    await expect(row).toBeVisible({ timeout: T.UI });
    await expect(row).toContainText(NAME2);
    await expect(row).toContainText("DECISION");
    await expect(row).toContainText(STW);
    await expect(tid(page, "rc-list").locator('[data-testid^="rc-row-"]')).toHaveCount(1);
    await tid(page, "rc-keyword").fill(`${RULE}_NONE`);
    await tid(page, "rc-search").click();
    await expect(tid(page, "rc-list-empty")).toHaveText("확정할 DRAFT 가 없습니다", { timeout: T.UI });
    await layout.layout(page, "ruleConfirm 빈 목록");
    await tid(page, "rc-keyword").fill(RULE);
    await tid(page, "rc-search").click();
    await tid(page, `rc-row-${RULE}-1.000`).click();
    await expect(row).toHaveClass(/ag-row-highlighted/);
    await expect(tid(page, "rc-target")).toHaveText(`${RULE} 버전 v1.000 · DECISION`, { timeout: T.UI });
    // 같은 행 보기 — 최초 버전은 모두 추가라 같은 행이 없다.
    await tid(page, "rc-diff-show-same").getByText("같은 행 보기").click();
    await expect(
      gridRows(tid(page, "rc-diff"))
        .filter({ has: page.locator('.ag-cell[col-id="kindLabel"]', { hasText: /^추가$/ }) }),
    ).toHaveCount(4);
    await tid(page, "rc-diff-show-same").getByText("같은 행 보기").click();
    watcher.assertClean("ruleConfirm");
  });

  test("TC-DME-CNF-03 검사 — 일시 없이 검사하면 안내, 검사 뒤 일시를 바꾸면 확정이 꺼지고 다시 검사해야 켜진다", async () => {
    await tid(page, "rc-validate").click();
    await expect(tid(page, "rc-error")).toHaveText("적용 시작 일시를 입력하세요");
    await rcValidate(page, daysAgo(8).input);
    // 저장 시 검사 경고 — 키가 NULL 이면 맞는 행이 없다·축 조합 빈칸(경고라 확정은 된다).
    await expect(tid(page, "rc-check-status-SAVE_CHECKS")).toHaveText("경고");
    await expect(rcCheckRow(page, "SAVE_CHECKS")).toContainText(`${THK} 이(가) NULL 이면 맞는 행이 없다`);
    await expect(tid(page, "rc-check-status-NOT_EMPTY")).toHaveText("통과");
    await expect(tid(page, "rc-check-status-TEST_CASES")).toHaveText("통과");
    await expect(rcCheckRow(page, "TEST_CASES")).toContainText("전체 2 · 기대값 있음 2 · 통과 2 · 실패 0");
    await expect(tid(page, "rc-check-status-RESULT_VAR_RELEASED")).toHaveText("통과");
    await expect(tid(page, "rc-check-status-APPLY_FROM")).toHaveText("면제");
    await expect(tid(page, "rc-confirm")).toBeEnabled();

    await fillDateTime(tid(page, "rc-apply-from"), CONFIRM1.input);
    await expect(tid(page, "rc-confirm")).toBeDisabled();
    await tid(page, "rc-validate").click();
    await expect(tid(page, "rc-confirm")).toBeEnabled({ timeout: T.UI });
    await layout.layout(page, "ruleConfirm 검사 결과");
    await snap(page, "dme-ruleConfirm-03-checked");
    watcher.assertClean("ruleConfirm");
  });

  test("TC-DME-CNF-04 확정 — 대화상자 [취소]는 아무것도 바꾸지 않고, [확인]하면 RELEASED 가 되고 목록에서 빠진다", async () => {
    await tid(page, "rc-confirm").click();
    const m = modal(page);
    await expect(m).toContainText("버전 확정");
    await expect(m).toContainText(`${RULE} 버전 v1.000 을(를) ${CONFIRM1.date} 00:00:00 부터 적용하도록 확정합니다.`);
    await expect(tid(page, "rc-future-warning")).toHaveCount(0);
    await expect(tid(page, "rc-modal-contract")).toHaveCount(0);
    await snapModal(page, "dme-ruleConfirm-04-modal");
    await tid(page, "rc-modal-cancel").click();
    await expect(m).toBeHidden();
    await expect(tid(page, "rc-form").locator('.mdm-status-badge[data-status="DRAFT"]')).toBeVisible();

    await tid(page, "rc-confirm").click();
    // 저장 시 검사 경고가 있어 확인란을 체크해야 [확인]이 켜진다.
    await expect(tid(page, "rc-modal-warnings")).toContainText(`${SURF} 이(가) NULL 이면 맞는 행이 없다`);
    await expect(tid(page, "rc-modal-ok")).toBeDisabled();
    await tid(page, "rc-ack").getByText("경고를 확인했습니다").click();
    await expect(tid(page, "rc-modal-ok")).toBeEnabled();
    await tid(page, "rc-modal-ok").click();
    await expectToast(page, "확정했습니다");
    await expect(tid(page, "rc-form").locator('.mdm-status-badge[data-status="RELEASED"]')).toBeVisible({ timeout: T.UI });
    await expect(tid(page, "rc-released")).toContainText(`적용 구간 ${CONFIRM1.date} 00:00:00 ~ 9999-12-31`);
    await expect(tid(page, "rc-released")).toContainText(`확정자 ${STW}`);
    await expect(tid(page, "rc-validate")).toBeDisabled();
    await expect(tid(page, "rc-confirm")).toBeDisabled();
    await expect(tid(page, `rc-row-${RULE}-1.000`)).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 });
    await layout.layout(page, "ruleConfirm 확정 뒤");
    await snap(page, "dme-ruleConfirm-04-released");
    await assertAllButtonsPressed(page, "ruleConfirm");
    watcher.assertClean("ruleConfirm");
  });

  test("TC-DME-MNG-07 확정 반영 — 목록에 사용 중·적용 버전 1·적중 정책 UNIQUE·미적용 없음으로 보이고, 룰 화면은 읽기 전용이다", async () => {
    await go(page, "ruleMng");
    await searchRule(page, RULE, { status: "INUSE" });
    await expect(ruleRow(page, RULE)).toHaveCount(1, { timeout: T.UI });
    await expect(ruleCell(page, RULE, "status")).toHaveText("사용 중");
    await expect(ruleCell(page, RULE, "releasedVer")).toHaveText("v1.000");
    await expect(ruleCell(page, RULE, "hitPolicy")).toHaveText("UNIQUE");
    await expect(ruleCell(page, RULE, "pendingText")).toHaveText("");
    await searchRule(page, RULE, { status: "CREATED" });
    await expect(tid(page, "rule-list-empty")).toBeVisible({ timeout: T.UI });

    // 룰 상세 — 사용 중이고, 확정 버전이라 확정은 꺼지고 새 버전·폐기가 켜진다(D-105).
    await openRuleDetail(page, RULE);
    await expect(tid(page, "rule-card-header")).toContainText("사용 중");
    await expect(detailVerRow(page, "1.000").locator(".mdm-status-badge")).toHaveAttribute("data-status", "RELEASED");
    await expect(tid(page, "rule-ver-new-major")).toBeEnabled();
    await expect(tid(page, "rule-move-to-confirm")).toBeDisabled();
    await expect(cardButton(page, "rule-card-header", "폐기")).toBeEnabled();
    await expect(screen(page).getByTestId("rule-unapplied-notice")).toHaveCount(0);
    await layout.layout(page, "ruleMng 확정 뒤");
    await snap(page, "dme-ruleMng-MNG-07-released");

    // 룰 화면은 읽기 전용이다.
    await openRule(page, RULE);
    await expect(topbar(page).locator(".mdm-status-badge")).toHaveAttribute("data-status", "RELEASED");
    await expect(tableButton(page, "행 추가")).toBeDisabled();
    await openColumns(page);
    await expect(tid(page, "col-readonly")).toBeVisible();
    await layout.layout(page, "ruleEdit 확정 뒤");
    await snap(page, "dme-ruleEdit-MNG-07-released");
    watcher.assertClean("ruleMng·ruleEdit");
  });

  test("TC-DME-LAY-99 배치 검사 모음 — 장 A 에서 본 화면 상태에 배치 위반이 없다", async () => {
    layout.assertEmpty("A 룰 등록·편집·확정");
  });
});

// ═══════════════════════════ B. 새 버전·삭제·폐기 ═══════════════════════════

test.describe("B 새 버전·삭제·폐기", () => {
  test.describe.configure({ mode: "serial" });

  const RULE = uid("DMEV");
  const SURF = "E2E_SURF";
  const GRD = `E2E_VGRD_${RUN}`;
  const RELEASE1 = daysAgo(10);
  const TOO_EARLY = daysAgo(30);

  const layout = new Findings();
  let page: Page;
  let watcher: Watcher;
  let v1Rows: number[] = [];
  let vSurf = 0;
  let vGrd = 0;

  test.beforeAll(async ({ browser }, testInfo) => {
    ({ page, watcher } = await openAs(browser, "stw", testInfo));
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  test("TC-DME-VER-00 준비 — 표면 A·B → 등급 A·B, 기본 C 인 판정 룰을 화면으로 만들어 확정한다", async () => {
    await buildEqualRule(page, {
      id: RULE,
      name: `E2E 버전 시험 ${RUN}`,
      cond: { name: SURF, label: "표면", type: "STRING" },
      result: { name: GRD, label: "등급", type: "STRING" },
      rows: [
        ["A", "A"],
        ["B", "B"],
      ],
      fallback: "C",
    });
    await confirmFromRuleMng(page, RULE, "1.000", RELEASE1);
    watcher.assertClean("ruleEdit·ruleConfirm");
  });

  test("TC-DME-VER-01 새 버전 — 확정 버전을 복사한 버전 2 DRAFT 가 편집 중(나)로 열리고, 그 뒤 새 버전은 막힌다", async () => {
    await openRule(page, RULE);
    await resetClicks(page);
    await expect(tid(page, "rule-ver-select")).toHaveValue("1.000");
    await expect(topbar(page).locator(".mdm-status-badge")).toHaveAttribute("data-status", "RELEASED");
    v1Rows = await dtRowIds(page);
    expect(v1Rows).toHaveLength(3);
    vSurf = await varIdOf(page, "표면");
    vGrd = await varIdOf(page, "등급");

    // 새 버전은 룰 상세 ② 버전 줄의 [새 버전(major)] 이다(D-105, 버전 번호는 major.minor — D-144).
    await go(page, "ruleMng");
    await openRuleDetail(page, RULE);
    await tid(page, "rule-ver-new-major").click();
    const v2 = detailVerRow(page, "2.000");
    await expect(v2.locator('.mdm-status-badge[data-status="DRAFT"]')).toBeVisible({ timeout: T.UI });
    await expect(v2.locator('.ag-cell[col-id="ownerId"]')).toHaveText(STW);
    await expect(v2.locator('.ag-cell[col-id="baseVer"]')).toHaveText("v1.000");
    await expect(tid(page, "rule-ver-new-major")).toBeDisabled();
    await expect(tid(page, "rule-ver-new-minor")).toBeDisabled();
    await expect(tid(page, "rule-unapplied-notice")).toHaveText("미적용 버전이 있어 새 버전을 만들 수 없습니다(한 번에 하나).");
    await expect(cardButton(page, "rule-card-header", "폐기")).toBeDisabled();
    await openContentEdit(page, RULE, "2.000");
    await expect(topbar(page)).toContainText("편집 중(나)");
    // 행은 버전 1 을 그대로 복사한다(같은 row_id).
    expect(await dtRowIds(page)).toEqual(v1Rows);
    // RELEASED(base) 와 입력 계약이 같다.
    await expect(tid(page, "contract-notice")).toHaveCount(0);
    await layout.layout(page, "ruleEdit 새 버전");
    await snap(page, "dme-ruleEdit-VER-01-new-version");
    watcher.assertClean("ruleEdit");
  });

  test("TC-DME-VER-02 새 버전 수정(U)·행 삭제(D) — 바뀐 칸이 강조되고, 값 테스트로 버전 1 과 편집본의 판정 차이를 본다", async () => {
    await dtEdit(page, v1Rows[1], `c${vGrd}_val`, "B2");
    await expect(dtCell(page, v1Rows[1], `c${vGrd}_val`)).toHaveClass(/cell-edited/);
    await tid(page, `dt-del-${v1Rows[0]}`).click();
    await tableButton(page, "표 저장").click();
    await expect(tid(page, "dt-dirty")).toHaveCount(0, { timeout: T.LONG });
    expect(await dtRowIds(page)).toEqual([v1Rows[1], v1Rows[2]]);
    await expect(tid(page, "dt-deleted-rows")).toHaveText(`base 대비 지운 행: row ${v1Rows[0]}`);
    await expect(dtCell(page, v1Rows[1], `c${vGrd}_val`)).toHaveClass(/cell-edited/);

    // 값 테스트 — 버전 1 은 B, 편집본(버전 2)은 B2.
    await tid(page, "vt-target").selectOption({ label: "버전 v1.000 · RELEASED" });
    await vtInput(page, SURF, "B");
    await vtRun(page);
    await expect(resultValue(page, GRD)).toHaveText(/^\s*"?B"?\s*$/);
    await expect(tid(page, "vt-result-table")).toBeVisible();
    await tid(page, "vt-target").selectOption("BODY");
    await vtRun(page);
    await expect(resultValue(page, GRD)).toHaveText(/^\s*"?B2"?\s*$/);
    // 표면 A 행을 지웠으니 A 는 기본 행 C 다.
    await vtInput(page, SURF, "A");
    await vtRun(page);
    await expect(resultValue(page, GRD)).toHaveText(/^\s*"?C"?\s*$/);
    await layout.layout(page, "ruleEdit 새 버전 수정");
    watcher.assertClean("ruleEdit");
  });

  test("TC-DME-VER-03 새 버전 확정 검사 — 직전 대비 변경이 보이고, 직전보다 이른 적용 일시는 거부되어 확정이 꺼진다", async () => {
    await go(page, "ruleMng");
    await openRuleDetail(page, RULE);
    await selectDetailVer(page, "2.000");
    await tid(page, "rule-move-to-confirm").click();
    await expect(footerScreenId(page)).toHaveText("ruleConfirm", { timeout: T.SLOW });
    await expect(tid(page, "rc-target")).toHaveText(`${RULE} 버전 v2.000 · DECISION`, { timeout: T.LONG });
    await expect(tid(page, "rc-previous")).toHaveText(`직전 RELEASED 버전 v1.000 · ${RELEASE1.date} 00:00:00`);
    await expect(tid(page, "rc-diff-counts")).toHaveText("추가 0 · 삭제 1 · 수정 1 · 같음 1");
    await expect(rcDiffKind(page, v1Rows[0])).toHaveText("삭제");
    await expect(rcDiffRow(page, v1Rows[1])).toContainText("등급");
    await expect(rcDiffRow(page, v1Rows[2])).toHaveCount(0);
    await tid(page, "rc-diff-show-same").getByText("같은 행 보기").click();
    await expect(rcDiffKind(page, v1Rows[2])).toHaveText("같음");
    await expect(tid(page, "rc-contract")).toHaveAttribute("data-state", "NOT_CHECKED");

    await rcValidate(page, TOO_EARLY.input);
    await expect(tid(page, "rc-check-status-APPLY_FROM")).toHaveText("거부");
    await expect(tid(page, "rc-check-status-APPLY_FROM")).toHaveAttribute("data-rejected", "true");
    await expect(rcCheckRow(page, "APPLY_FROM")).toContainText(`직전 RELEASED 적용 시작 ${RELEASE1.date} 00:00:00`);
    await expect(tid(page, "rc-confirm")).toBeDisabled();
    await layout.layout(page, "ruleConfirm 적용 순서 거부");
    await snap(page, "dme-ruleConfirm-VER-03-rejected");
    watcher.assertClean("ruleConfirm");
  });

  test("TC-DME-VER-04 삭제(D) — 새 버전 DRAFT 를 삭제하면 확정 버전 1 만 남고 새 버전이 다시 켜진다", async () => {
    // DRAFT 삭제는 룰 상세 ② 버전 줄의 [삭제] 다(D-105).
    await go(page, "ruleMng");
    await openRuleDetail(page, RULE);
    // 미적용 버전(2.000)이 골라져 있다(다시 읽어도 남은 버전이면 선택을 유지한다 — RuleDetailPanel). 확정 버전 1 을 고르면 삭제가 꺼진다.
    await expect(detailVerRow(page, "2.000")).toHaveClass(/ag-row-highlighted/);
    await selectDetailVer(page, "1.000");
    await expect(tid(page, "rule-version-delete")).toBeDisabled();
    await selectDetailVer(page, "2.000");
    // 삭제는 마스터코드와 같은 확인창을 거친다(MDM 버전 버튼 규약).
    await tid(page, "rule-version-delete").click();
    await page.getByRole("dialog").getByRole("button", { name: "확인", exact: true }).last().click();
    await expect(detailVerRow(page, "2.000")).toHaveCount(0, { timeout: T.UI });
    await expect(tid(page, "rule-ver-new-major")).toBeEnabled();
    await expect(screen(page).getByTestId("rule-unapplied-notice")).toHaveCount(0);
    // 룰 화면은 확정 버전 1 로 돌아온다.
    await openRule(page, RULE);
    await expect(tid(page, "rule-ver-select")).toHaveValue("1.000");
    expect(await dtRowIds(page)).toEqual(v1Rows);
    await expect(dtCell(page, v1Rows[1], `c${vGrd}_val`)).toHaveText("B");
    // 룰 화면(확정 버전 1, 읽기 전용) 버튼 커버리지 — 옛 VER-05 의 룰 화면 확인을 여기로 옮겼다(헤더·버전 버튼은 룰 상세로 갔다, D-105).
    // 장 B 는 새 페이지라 장 A 에서 누른 것은 기록에 없다.
    await assertAllButtonsPressed(page, "ruleEdit(새 버전·삭제)", {
      "rule-group-valueTests-toggle": "카드 묶음 접기는 장 A TC-DME-EDT-05 에서 누른다",
      "rule-section-columns-toggle": "섹션 접기는 장 A TC-DME-EDT-05 에서 누른다",
      "tc-boundary": "경계값 케이스 팝업은 장 A TC-DME-EDT-05 에서 누른다",
      "dt-expand": "의사결정표 [크게 보기]는 장 A TC-DME-EDT-05 에서 누른다",
      "dt-check-toggle": "검사(화면) 섹션 접기는 장 A TC-DME-EDT-05 에서 누른다",
      "dt-check-table-toggle": "표 단위 검사 섹션 접기는 장 A TC-DME-EDT-05 에서 누른다",
    });
    watcher.assertClean("ruleMng·ruleEdit");
  });

  test("TC-DME-VER-05 폐기 — [폐기]는 확인을 한 번 더 묻고 [취소]면 그대로, [폐기 확인]이면 폐기 상태가 되어 새 버전을 만들 수 없다", async () => {
    // 폐기는 룰 상세 ① 헤더의 [폐기] 다(D-105).
    const header = "rule-card-header";
    await go(page, "ruleMng");
    await openRuleDetail(page, RULE);
    await cardButton(page, header, "폐기").click();
    await expect(cardButton(page, header, "폐기 확인")).toBeVisible();
    await snap(page, "dme-ruleEdit-VER-05-deprecate-confirm");
    await cardButton(page, header, "취소").click();
    await expect(cardButton(page, header, "폐기 확인")).toHaveCount(0);
    await expect(tid(page, header)).toContainText("사용 중");

    await cardButton(page, header, "폐기").click();
    await cardButton(page, header, "폐기 확인").click();
    await expect(tid(page, header)).toContainText("폐기", { timeout: T.UI });
    await expect(cardButton(page, header, "폐기")).toHaveCount(0);
    await expect(tid(page, "rule-ver-new-major")).toBeDisabled();
    await layout.layout(page, "ruleMng 폐기 뒤");
    await snap(page, "dme-ruleMng-VER-05-deprecated");
    await assertAllButtonsPressed(page, "ruleMng(새 버전·삭제·폐기)", {
      "룰 등록": "[룰 등록] 은 장 A TC-DME-MNG-02~05·이 장 VER-00(buildEqualRule) 에서 눌렀다(VER-01 에서 누름 기록을 비웠다)",
    });
    watcher.assertClean("ruleMng");
  });

  test("TC-DME-VER-06 폐기 반영 — 목록 상태 폐기 조건에서만 나오고 사용 중 조건에서는 빠진다", async () => {
    await go(page, "ruleMng");
    await searchRule(page, RULE, { status: "DEPRECATED" });
    await expect(ruleRow(page, RULE)).toHaveCount(1, { timeout: T.UI });
    await expect(ruleCell(page, RULE, "status")).toHaveText("폐기");
    await expect(ruleCell(page, RULE, "releasedVer")).toHaveText("v1.000");
    await searchRule(page, RULE, { status: "INUSE" });
    await expect(tid(page, "rule-list-empty")).toBeVisible({ timeout: T.UI });
    await snap(page, "dme-ruleMng-VER-06-deprecated");
    watcher.assertClean("ruleMng");
  });

  test("TC-DME-VER-99 배치 검사 모음 — 장 B 에서 본 화면 상태에 배치 위반이 없다", async () => {
    layout.assertEmpty("B 새 버전·삭제·폐기");
  });
});

// ═══════════════════════════ C. 룰 세트 ═══════════════════════════

test.describe("C 룰 세트", () => {
  test.describe.configure({ mode: "serial" });

  // SA: 표면 → 등급(중간 결과), SB: 등급 → 계수(최종 결과). SB 가 SA 의 결과를 읽으므로 세트 안에서 SA 가 먼저 돌아야 한다.
  const SA = uid("DMESA");
  const SB = uid("DMESB");
  const SET = uid("DMESET");
  const SURF = "E2E_SURF";
  const GRD = `E2E_SGRD_${RUN}`;
  const FCT = `E2E_SFCT_${RUN}`;
  const SET_NAME = `E2E 품질 세트 ${RUN}`;

  const layout = new Findings();
  let page: Page;
  let watcher: Watcher;

  test.beforeAll(async ({ browser }, testInfo) => {
    ({ page, watcher } = await openAs(browser, "stw", testInfo));
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  const setMessage = () => tid(page, "set-message");
  const setChecks = () => tid(page, "set-checks");
  // 세트의 룰 순서 — 캔버스의 룰 박스(data-kind="RULE")에 적힌 룰 ID(.rsf-id)를 노드 배열(=흐름) 순서로 읽는다.
  const setOrder = () => flowRuleOrder(page);
  const addToSet = (id: string) => addRuleToFlow(page, id);

  test("TC-DME-SET-00 준비 — 표면→등급 룰(SA)과 등급→계수 룰(SB)을 화면으로 만들어 차례로 확정한다", async () => {
    await buildEqualRule(page, {
      id: SA,
      name: `E2E 세트 등급 ${RUN}`,
      cond: { name: SURF, label: "표면", type: "STRING" },
      result: { name: GRD, label: "등급", type: "STRING" },
      rows: [
        ["A", "A"],
        ["B", "B"],
      ],
      fallback: "C",
    });
    await confirmFromRuleMng(page, SA, "1.000", daysAgo(10));
    await buildEqualRule(page, {
      id: SB,
      name: `E2E 세트 계수 ${RUN}`,
      // 앞 룰(SA) 결과를 읽는 조건 — 값 타입을 선언하지 않는다(서버가 앞 룰 결과 타입으로 푼다).
      cond: { name: GRD, label: "등급 입력" },
      result: { name: FCT, label: "계수", type: "NUMBER" },
      rows: [
        ["A", "1.0"],
        ["B", "0.9"],
      ],
      fallback: "0.8",
    });
    await confirmFromRuleMng(page, SB, "1.000", daysAgo(10));
    watcher.assertClean("룰 준비");
  });

  // ─────────── ruleSetMng — 룰 세트 ───────────

  test("TC-DME-SMN-01 룰 세트 화면 배치 — 조회영역 네 칸·목록·등록 폼이 보이고 빈 폼은 저장이 꺼져 있다", async () => {
    await go(page, "ruleSetMng");
    await resetClicks(page);
    await expect(breadcrumb(page)).toContainText("마루 MDM > 업무기준 > 룰 세트");
    for (const t of ["set-search-keyword", "set-search-rule", "set-search-var", "set-search-status", "set-list", "set-register-form"]) {
      await expect(tid(page, t), t).toBeVisible();
    }
    await expect(tid(page, "set-reg-save")).toBeDisabled();
    await layout.layout(page, "ruleSetMng");
    await snap(page, "dme-ruleSetMng-01-initial");
    watcher.assertClean("ruleSetMng");
  });

  test("TC-DME-SMN-02 세트 ID 규칙·세트명 길이 위반은 바로 안내되고 저장이 꺼진다", async () => {
    await tid(page, "set-reg-id").fill("bad-set id");
    await tid(page, "set-reg-name").fill(SET_NAME);
    await expect(tid(page, "set-reg-id-error")).toContainText("컬럼 물리명 규칙");
    await expect(tid(page, "set-reg-save")).toBeDisabled();
    await tid(page, "set-reg-id").fill(SET);
    await expect(tid(page, "set-reg-id-error")).toHaveCount(0);
    await tid(page, "set-reg-name").fill("나".repeat(101));
    await expect(tid(page, "set-register-form")).toContainText("세트명은 100자 이하입니다");
    await expect(tid(page, "set-reg-save")).toBeDisabled();
    await snap(page, "dme-ruleSetMng-02-invalid");
    watcher.assertClean("ruleSetMng");
  });

  test("TC-DME-SMN-03 등록(C) — ID·세트명·설명을 넣고 저장하면 세트 편집이 그 빈 세트로 열린다", async () => {
    await tid(page, "set-reg-id").fill(SET);
    await tid(page, "set-reg-name").fill(SET_NAME);
    await tid(page, "set-reg-desc").fill("E2E 표면으로 계수를 낸다");
    await tid(page, "set-reg-save").click();
    await expect(footerScreenId(page)).toHaveText("ruleSetEdit", { timeout: T.SLOW });
    await expect(tid(page, "set-edit-current")).toHaveText(`${SET} · ${SET_NAME}`, { timeout: T.LONG });
    // 새 세트는 CREATED 이고 첫 확정 때 INUSE 가 된다(D-144 2단계, MdmRuleSet.java STATUS — 화면 스펙 mdm-ruleSetMng M3 와 같다).
    await expect(tid(page, "set-status")).toHaveText("CREATED");
    // 빈 세트는 시작 → 끝만 그려진다.
    await expect(tid(page, "flow-node-start")).toBeVisible();
    await expect(tid(page, "flow-node-end")).toBeVisible();
    await expect(tid(page, "flow-canvas").locator('[data-kind="RULE"]')).toHaveCount(0);
    await expect(setChecks()).toContainText("룰이 하나도 없다");
    await expect(tid(page, "set-desc")).toHaveValue("E2E 표면으로 계수를 낸다");
    watcher.assertClean("ruleSetMng→ruleSetEdit");
  });

  test("TC-DME-SMN-04 같은 세트 ID 로 다시 등록하면 중복 문구가 보인다", async () => {
    await go(page, "ruleSetMng");
    await expect(tid(page, "set-reg-id")).toHaveValue("");
    await tid(page, "set-reg-id").fill(SET);
    await tid(page, "set-reg-name").fill("중복 등록");
    await tid(page, "set-reg-save").click();
    await expectErrorModal(page, "이미 있는 룰 세트 ID 입니다", "dme-ruleSetMng-04-dup");
    expectOnly4xx(watcher, "ruleSetMng 중복 등록");
    await tid(page, "set-reg-id").fill("");
    await tid(page, "set-reg-name").fill("");
    watcher.assertClean("ruleSetMng");
  });

  // ─────────── ruleSetEdit — 룰 세트 편집 ───────────

  test("TC-DME-SED-01 세트 편집 화면 배치 — 도구줄·캔버스·세트 패널·구성 지침이 보이고 빈 세트는 시작·끝만 그려지며 거부 검사가 보인다", async () => {
    await go(page, "ruleSetEdit");
    await resetClicks(page);
    await expect(breadcrumb(page)).toContainText("마루 MDM > 업무기준 > 룰 세트 편집");
    for (const t of ["flow-toolbar", "flow-canvas", "flow-props", "flow-prop-set", "flow-bottom", "set-guide-card"]) {
      await expect(tid(page, t), t).toBeVisible();
    }
    await expect(tid(page, "set-card-id")).toHaveText(SET);
    await expect(tid(page, "set-row-version")).toHaveText(/^row_version \d+$/);
    // 세트를 열면 보기 모드다 — 팔레트가 없고 저장·지침 실행이 꺼져 있다.
    await expect(tid(page, "flow-mode-view")).toHaveAttribute("aria-pressed", "true");
    await expect(tid(page, "flow-palette")).toHaveCount(0);
    await expect(tid(page, "flow-node-start")).toBeVisible();
    await expect(tid(page, "flow-node-end")).toBeVisible();
    await expect(tid(page, "flow-canvas").locator('[data-kind="RULE"]')).toHaveCount(0);
    await expect(setChecks()).toContainText("룰이 하나도 없다");
    await expect(tid(page, "set-save")).toBeDisabled();
    await expect(tid(page, "set-guide-run")).toBeDisabled();
    // 화면 맞춤·[표시] 바꾸기는 흐름을 바꾸지 않는다. [표시]는 끔 → ID → 이름 → 끔 으로 돈다 — 끔으로 돌려 두어 뒤 테스트 화면(칩 없음)이 그대로다.
    await tid(page, "flow-fit").click();
    const varToggle = tid(page, "flow-var-toggle");
    await expect(varToggle).toHaveAttribute("data-mode", "off");
    for (const [mode, pressed] of [["id", "true"], ["name", "true"], ["off", "false"]] as const) {
      await varToggle.click();
      await expect(varToggle).toHaveAttribute("data-mode", mode);
      await expect(varToggle).toHaveAttribute("aria-pressed", pressed);
    }
    await layout.layout(page, "ruleSetEdit 빈 세트");
    await snap(page, "dme-ruleSetEdit-01-initial");
    watcher.assertClean("ruleSetEdit");
  });

  test("TC-DME-SED-02 룰 추가 — 편집 모드에서 순서가 거꾸로 담기면 룰 박스에 거부 표시·검사 항목이 보이되 저장은 켜져 있으며, 이미 담은 룰은 사용 중으로 표시된다", async () => {
    await enterFlowEdit(page);
    await addToSet(SB);
    await addToSet(SA);
    await expect.poll(setOrder).toEqual([SB, SA]);
    await expect(ruleNodeOf(page, SB)).toContainText("DECISION · FIRST");
    const nodeSB = await ruleNodeIdOf(page, SB);
    await expect(tid(page, `flow-node-mark-${nodeSB}`)).toHaveAttribute("data-severity", "REJECT");
    await expect(setChecks()).toContainText(`${SB}가 뒤에 도는 ${SA}의 결과 변수 ${GRD}를 읽는다. ${SA}를 ${SB} 앞으로 옮긴다`);
    // 검사 항목을 누르면 그 룰 박스로 이동해 선택하고 오른쪽이 그 룰의 속성 패널이 된다.
    await tid(page, "set-check-0").click();
    await expect(tid(page, `flow-node-${nodeSB}`)).toHaveAttribute("data-selected", "true");
    await expect(tid(page, "flow-prop-rule")).toContainText(SB);

    // 같은 룰을 룰 목록에서 찾으면 줄에 "사용 중" 이 붙는다(다른 갈래에 두려고 다시 담을 수는 있어 막지는 않는다).
    await tid(page, "flow-rule-panel-search").fill(SA);
    await tid(page, "flow-rule-panel-find").click();
    await expect(tid(page, `flow-rule-used-${SA}`)).toHaveText("사용 중", { timeout: T.UI });
    await expect.poll(setOrder).toEqual([SB, SA]);
    await layout.layout(page, "ruleSetEdit 순서 거부");
    await snap(page, "dme-ruleSetEdit-02-order-rejected");

    // 거부(REJECT) 검사가 있어도 DRAFT 저장은 허용한다(2026-10-06) — 확정·되살리기 거부는 서버 테스트가 맡는다.
    await expect(tid(page, "set-save")).toBeEnabled();
    watcher.assertClean("ruleSetEdit");
  });

  test("TC-DME-SED-03 수정(U) — 룰 박스를 지웠다 다른 자리에 다시 끼워 순서를 고치고 세트명·설명과 함께 저장하면 검사 통과·입출력 표가 맞다", async () => {
    // 목록의 ▲▼ 는 캔버스에 없다 — 순서는 "룰 지우기(앞뒤 선은 이어진다) → 팔레트로 다시 끼우기" 로 고친다.
    await removeRuleFromFlow(page, SB);
    await expect.poll(setOrder).toEqual([SA]);
    await addToSet(SB);
    await expect.poll(setOrder).toEqual([SA, SB]);
    await expect(setChecks()).toContainText("통과");
    await expect(tid(page, `flow-node-mark-${await ruleNodeIdOf(page, SB)}`)).toHaveCount(0);
    // 뺐다 다시 담기(✕ 뒤 재삽입)도 같은 결과다.
    await removeRuleFromFlow(page, SB);
    await expect.poll(setOrder).toEqual([SA]);
    await addToSet(SB);
    await expect.poll(setOrder).toEqual([SA, SB]);

    // 입출력·세트명·설명은 세트 패널(선택 없음)에 있다 — 입력은 표면 하나, 결과는 계수(최종)·등급(중간).
    await clearFlowSelection(page);
    await expect(tid(page, "set-io-inputs")).toContainText("입력 변수 1개");
    await expect(ioRow(page, "inputs", SURF)).toBeVisible();
    await expect(tid(page, "set-io-results")).toContainText("결과 변수 2개 · 최종 1개, 중간 1개");
    await expect(ioRow(page, "results", FCT)).toContainText("최종");
    await expect(ioRow(page, "results", GRD)).toContainText("중간");

    await tid(page, "set-name").fill(`${SET_NAME} 수정`);
    await tid(page, "set-desc").fill("E2E 표면 → 등급 → 계수");
    await expect(tid(page, "set-save")).toBeEnabled({ timeout: T.UI });
    await tid(page, "set-save").click();
    await expect(setMessage()).toContainText(/저장 · row_version \d+/, { timeout: T.UI });
    await expect(tid(page, "set-save")).toBeDisabled();
    // 저장하면 서버가 돌려준 흐름으로 다시 불러오되 모드와 되돌리기 이력은 그대로 둔다 — 편집 모드가 남는다
    // (ruleSetEdit 기능설계서 §7: "세트 저장·폐기·되살리기 뒤의 다시 불러오기는 모드와 되돌리기 이력을 그대로 둔다", cdcb8ea3).
    await expect(tid(page, "flow-mode-edit")).toHaveAttribute("aria-pressed", "true");
    await expect(tid(page, "flow-mode-view")).toHaveAttribute("aria-pressed", "false");
    await expect(tid(page, "set-edit-current")).toHaveText(`${SET} · ${SET_NAME} 수정`);
    await expect.poll(setOrder).toEqual([SA, SB]);
    await layout.layout(page, "ruleSetEdit 저장 뒤");
    await snap(page, "dme-ruleSetEdit-03-saved");
    watcher.assertClean("ruleSetEdit");
  });

  test("TC-DME-SED-04 조회(R) — 세트를 찾아 다시 열면 저장한 흐름이 남고, 구성 지침은 결과 변수에서 순서를 제안하며 적용하면 캔버스가 그 순서가 된다", async () => {
    await tid(page, "set-pick-keyword").fill(`${SET}_NONE`);
    await tid(page, "set-edit-topbar").getByRole("button", { name: "찾기", exact: true }).click();
    await expect(tid(page, "set-pick-list")).toHaveText("찾은 세트가 없습니다.", { timeout: T.UI });
    await tid(page, "set-pick-keyword").fill(SET);
    await tid(page, "set-pick-keyword").press("Enter");
    await tid(page, `set-pick-${SET}`).click();
    await expect(tid(page, "set-edit-current")).toHaveText(`${SET} · ${SET_NAME} 수정`, { timeout: T.UI });
    await expect.poll(setOrder).toEqual([SA, SB]);
    await expect(tid(page, "set-desc")).toHaveValue("E2E 표면 → 등급 → 계수");

    // 지침: 흐름을 거꾸로 돌려 놓고(SA 를 지워 END 앞에 다시 끼움) 계수에서 거슬러 찾은 순서를 적용하면 SA → SB 가 된다.
    await enterFlowEdit(page);
    await removeRuleFromFlow(page, SA);
    await addToSet(SA);
    await expect.poll(setOrder).toEqual([SB, SA]);
    await clearFlowSelection(page);
    await tid(page, "set-guide-var").fill(FCT);
    await tid(page, "set-guide-run").click();
    await expect(tid(page, "set-guide-order")).toContainText(`제안 순서 · 1. ${SA} → 2. ${SB}`, { timeout: T.UI });
    await tid(page, "set-guide-apply").click();
    await expect.poll(setOrder).toEqual([SA, SB]);
    await expect(setChecks()).toContainText("통과");
    await snap(page, "dme-ruleSetEdit-04-guide");

    // 적용한 흐름은 저장하지 않은 편집이다 — 같은 세트를 다시 열면 dirty 확인을 받아들이고 저장된 흐름으로 돌아온다.
    // Watcher 가 대화상자를 자동으로 수락한다(문구는 watcher.dialogs 에 남는다).
    await tid(page, "set-pick-keyword").fill(SET);
    await tid(page, "set-pick-keyword").press("Enter");
    await tid(page, `set-pick-${SET}`).click();
    await expect(tid(page, "flow-mode-view")).toHaveAttribute("aria-pressed", "true", { timeout: T.UI });
    await expect.poll(setOrder).toEqual([SA, SB]);
    watcher.assertClean("ruleSetEdit");
  });

  test("TC-DME-SED-05 폐기·되살리기 — [폐기]는 경고와 확인을 한 번 더 묻고, 폐기하면 편집이 막히며 되살리면 사용 중으로 돌아온다", async () => {
    // 확정한 적 없는 세트는 CREATED 라 [폐기]가 꺼져 있다(D-144 2단계 — 폐기는 사용 중 세트만). 버전 줄 [확정]으로 v1.000 을
    // 과거 일시(담은 룰 확정 뒤)로 확정하면 사용 중(INUSE)이 된다.
    await expect(tid(page, "set-status")).toHaveText("CREATED");
    await expect(tid(page, "set-deprecate")).toBeDisabled();
    await confirmSetFromEdit(page, SET, "1.000", daysAgo(5));
    await snap(page, "dme-ruleSetConfirm-05-released");
    await go(page, "ruleSetEdit");
    await tid(page, "set-pick-keyword").fill(SET);
    await tid(page, "set-pick-keyword").press("Enter");
    await tid(page, `set-pick-${SET}`).click();
    await expect(tid(page, "set-status")).toHaveText("INUSE", { timeout: T.UI });

    await tid(page, "set-deprecate").click();
    await expect(setMessage()).toContainText("폐기하면 이 세트를 부르는 호출은 판정 오류가 난다.");
    await tid(page, "set-deprecate-cancel").click();
    await expect(tid(page, "set-deprecate-confirm")).toHaveCount(0);
    await expect(tid(page, "set-status")).toHaveText("INUSE");

    await tid(page, "set-deprecate").click();
    await tid(page, "set-deprecate-confirm").click();
    await expect(tid(page, "set-status")).toHaveText("DEPRECATED", { timeout: T.UI });
    // 세트 폐기·되살리기는 부모 행 상태만 바꿔 문구에 row_version 이 없다(45502b49, D-144 2단계 useRuleSetEdit).
    await expect(setMessage()).toContainText("폐기. 행은 남기고 되살릴 수 있다");
    await expect(tid(page, "set-name")).toBeDisabled();
    await expect(tid(page, "flow-mode-edit")).toBeDisabled();
    await expect(tid(page, "flow-palette")).toHaveCount(0);
    await expect(tid(page, "set-guide-apply")).toBeDisabled();
    await layout.layout(page, "ruleSetEdit 폐기 뒤");
    await snap(page, "dme-ruleSetEdit-05-deprecated");

    await tid(page, "set-restore").click();
    await expect(tid(page, "set-status")).toHaveText("INUSE", { timeout: T.UI });
    await expect(setMessage()).toContainText("되살림");
    // D-144 2단계: 확정 버전(v1.000)은 읽기 전용이다 — [편집] 모드로 바꿀 수 없다(view.editable). 고치려면 버전 줄
    // [새 버전(minor)]으로 내 DRAFT 를 만든다. 남은 버튼은 그 DRAFT 에서 누르고, 끝에서 [삭제]로 지운다.
    await expect(tid(page, "flow-mode-edit")).toBeDisabled();
    await expect(tid(page, "set-name")).toBeDisabled();
    await newSetVersion(page, "minor", "1.001");
    await expect(tid(page, "flow-mode-edit")).toBeEnabled();

    // 남은 버튼을 한 번씩 누른다 — 보기/편집/디버그 전환, 되돌리기·다시 하기, 아래 패널 접기·펼치기, 미니맵·도움말·왼쪽 룰 패널·찾기·화면 확대 단추,
    // 디버그 모드의 실행 단추·케이스. 마지막은 보기 모드·검사 탭으로 돌려 둔다.
    await tid(page, "flow-mode-edit").click();
    await expect(tid(page, "flow-palette")).toBeVisible();
    // 세트명·설명은 편집 모드에서 내 DRAFT 일 때 고칠 수 있다(SidePanel editable).
    await expect(tid(page, "set-name")).toBeEnabled();
    // 도구 상자 [공간] 켜기·끄기(끄면 기본 도구 [영역 선택] 으로 돌아온다).
    await tid(page, "flow-space-tool").click();
    await expect(tid(page, "flow-space-tool")).toHaveAttribute("aria-pressed", "true");
    await tid(page, "flow-space-tool").click();
    await expect(tid(page, "flow-tool-select")).toHaveAttribute("aria-pressed", "true");
    // 편집 모드 — 선의 [+] 로 IF 를 넣고 되돌리기 → 다시 하기 → 되돌리기(저장한 흐름으로 돌아온다).
    const ifNodes = tid(page, "flow-canvas").locator('[data-kind="IF"]');
    // 선 [+] 는 올리거나 고른 선에만 보인다(L1) — 첫 선의 누름 영역에 mouseover 를 보낸 뒤 누른다.
    await tid(page, "flow-canvas").locator(".react-flow__edge .react-flow__edge-interaction").first().dispatchEvent("mouseover");
    await page.locator('[data-testid^="flow-edge-add-"]').first().click();
    await tid(page, "flow-menu-item-insert-if").click();
    await expect(ifNodes).toHaveCount(1);
    await tid(page, "flow-undo").click();
    await expect(ifNodes).toHaveCount(0);
    await tid(page, "flow-redo").click();
    await expect(ifNodes).toHaveCount(1);
    await tid(page, "flow-undo").click();
    await expect(ifNodes).toHaveCount(0);
    await tid(page, "flow-mode-view").click();
    await expect(tid(page, "flow-palette")).toHaveCount(0);
    await tid(page, "flow-bottom-toggle").click();
    await expect(tid(page, "flow-bottom")).toHaveAttribute("data-collapsed", "true");
    await tid(page, "flow-bottom-toggle").click();
    await expect(tid(page, "flow-bottom")).toHaveAttribute("data-collapsed", "false");
    await tid(page, "flow-tab-checks").click();
    await expect(setChecks()).toBeVisible();

    // 미니맵·단축키 도움말·왼쪽 룰 패널(접기·찾기)·노드 찾기·React Flow 확대/축소/맞춤 단추.
    await tid(page, "flow-minimap-toggle").click();
    await expect(tid(page, "flow-minimap-toggle")).toHaveAttribute("aria-pressed", /true|false/);
    await tid(page, "flow-minimap-toggle").click();
    await tid(page, "flow-help").click();
    await expect(tid(page, "flow-help-panel")).toBeVisible();
    await tid(page, "flow-help").click();
    await expect(tid(page, "flow-help-panel")).toHaveCount(0);
    // 도구 상자 도구 — 보기 모드 기본은 [손]이므로 [영역 선택] 을 눌렀다가 [손] 으로 돌려 놓는다.
    await tid(page, "flow-tool-select").click();
    await expect(tid(page, "flow-tool-select")).toHaveAttribute("aria-pressed", "true");
    await tid(page, "flow-tool-hand").click();
    await expect(tid(page, "flow-tool-hand")).toHaveAttribute("aria-pressed", "true");
    await tid(page, "flow-section-rules-head").click();
    await expect(tid(page, "flow-rule-panel-search")).toHaveCount(0);
    await tid(page, "flow-section-rules-head").click();
    await tid(page, "flow-rule-panel-search").fill(SA);
    await tid(page, "flow-rule-panel-find").click();
    await expect(tid(page, `flow-rule-row-${SA}`)).toBeVisible({ timeout: T.UI });
    // 노드 찾기 위젯 — 툴바 [노드 찾기] 로 열고 다음·이전·옵션 셋을 눌러 본 뒤 [닫기].
    await tid(page, "flow-find-open").click();
    await expect(tid(page, "flow-find-widget")).toBeVisible();
    await tid(page, "flow-find").fill(SA);
    await expect(tid(page, "flow-find-count")).toHaveText("1/1");
    await tid(page, "flow-find-next").click();
    await tid(page, "flow-find-prev").click();
    for (const opt of ["flow-find-case", "flow-find-word", "flow-find-regex"]) {
      await tid(page, opt).click();
      await expect(tid(page, opt)).toHaveAttribute("aria-pressed", "true");
      await tid(page, opt).click();
    }
    await tid(page, "flow-find").fill("");
    await tid(page, "flow-find-close").click();
    await expect(tid(page, "flow-find-widget")).toHaveCount(0);
    const controls = tid(page, "flow-canvas").locator(".react-flow__controls-button");
    for (let i = 0, n = await controls.count(); i < n; i++) await controls.nth(i).click();

    // 디버그 모드 — 입력을 넣고 한 단계 · 이전 · 계속 · 처음부터 · 여기까지 · 끝까지 · 중지, 지금 입력을 케이스로 저장하고 모두 실행.
    await tid(page, "flow-mode-debug").click();
    await expect(tid(page, "dbg-toolbar")).toBeVisible();
    await tid(page, `dbg-input-${SURF}`).fill("A");
    const dbgStatus = tid(page, "dbg-status");
    await tid(page, "dbg-step").click();
    await expect(dbgStatus).toHaveText(/^1\/\d+ · start 실행 전$/, { timeout: T.LONG });
    await tid(page, "dbg-step").click();
    await tid(page, "dbg-step-back").click();
    await tid(page, "dbg-continue").click();
    await tid(page, "dbg-restart").click();
    await expect(dbgStatus).toHaveText(/^1\/\d+ · start 실행 전$/);
    // 중단점 점 — 켰다 끈다(상태는 data-on). 위에서 React Flow 확대·축소 단추를 누르고 디버그 줄·버전 줄(D-144)이 더해져
    // 첫 룰 박스가 캔버스 보이는 영역 위로 밀려날 수 있다(캔버스는 화면 이동이라 스크롤로 드러나지 않는다) — [화면 맞춤] 뒤 누른다.
    await tid(page, "flow-fit").click();
    const bpSA = tid(page, `flow-bp-${await ruleNodeIdOf(page, SA)}`);
    await bpSA.click();
    await expect(bpSA).toHaveAttribute("data-on", "true");
    await bpSA.click();
    await expect(bpSA).toHaveAttribute("data-on", "false");
    await ruleNodeOf(page, SA).click();
    await tid(page, "dbg-run-to").click();
    await tid(page, "dbg-finish").click();
    await expect(dbgStatus).toHaveText(/^완료 · \d+단계 · 결과 변수 \d+개$/);
    await tid(page, "flow-tab-values").click();
    await expect(tid(page, "sim-values")).toBeVisible();
    await tid(page, "flow-tab-compare").click();
    await expect(tid(page, "run-compare")).toBeVisible();
    await tid(page, "case-save-current").click();
    await tid(page, "case-modal-name").fill(`E2E 케이스 ${RUN}`);
    await tid(page, "case-modal-save").click();
    await expect(tid(page, "case-modal")).toHaveCount(0, { timeout: T.UI });
    await expect(tid(page, "case-grid")).toContainText(`E2E 케이스 ${RUN}`, { timeout: T.UI });
    await tid(page, "case-run-all").click();
    await expect(tid(page, "case-summary")).toHaveText("1/1 통과", { timeout: T.LONG });
    // [중지](fc911d0d) — 디버그를 끝내고 실행 전으로 돌린다. 지난 실행이 없어지면 다시 꺼진다.
    await expect(tid(page, "dbg-stop")).toBeEnabled();
    await tid(page, "dbg-stop").click();
    await expect(tid(page, "dbg-stop")).toBeDisabled({ timeout: T.UI });
    // 디버그 모드에서도 보이는 활성 단추를 다시 확인한다. 케이스 고르기·불러오기·수정·삭제·디버그로 열기는 케이스 줄을 고르기 전에는 꺼져 있어 목록에서 빠진다.
    // 세트 편집 탭 줄(D-135 하위 세트 탭)의 탭 단추만 — 이 시나리오는 지금 연 세트 탭 하나뿐이라 누르면 같은 화면이다.
    // 탭 전환은 m-mdm 단위 시험(debug-subset·set-node-page)이 확인한다. 닫기(set-tab-close-*) 등 다른 단추는 면제하지 않는다.
    const setTabAllow = async () =>
      Object.fromEntries(
        (await page.locator('[data-testid^="set-tab-"][role="tab"]:visible').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid") ?? "")))
          .filter(Boolean)
          .map((k) => [k, "세트 편집 탭 단추 — 지금 연 세트 탭 하나뿐이라 누르면 같은 화면이다(탭 전환은 m-mdm 단위 시험)"]),
      );
    const dynamicAllow = async (prefix: string, why: string) =>
      Object.fromEntries(
        (await page.locator(`[data-testid^="${prefix}"]:visible`).evaluateAll((els) => els.map((e) => e.getAttribute("data-testid") ?? "")))
          .filter(Boolean)
          .map((k) => [k, why]),
      );
    await assertAllButtonsPressed(page, "ruleSetEdit(디버그 모드)", {
      ...(await dynamicAllow("var-watch-remove-", "조사식 빼기 — 조사식 목록 확인은 디버그 전용 단위 테스트가 맡는다")),
      ...(await dynamicAllow("expr-recent-", "최근 식 채우기 — 식 평가는 이 시나리오에서 하지 않는다")),
      ...(await dynamicAllow("flow-bp-", "노드마다 있는 중단점 점 — 하나(SA)는 위에서 켰다 껐다. 나머지는 같은 동작이다")),
      ...(await dynamicAllow("flow-rule-open-", "룰 박스 링크 아이콘은 다음 TC-DME-SED-06 에서 누른다(누르면 룰 화면으로 옮겨 간다)")),
      ...(await dynamicAllow("flow-section-", "오른쪽 섹션 머리 — 펴고 접기는 flow-section-rules-head 로 확인했고 나머지는 같은 동작이다")),
      ...(await setTabAllow()),
      "sim-detail-open-rule": "노드 상세의 [룰 편집 열기] 는 누르면 룰 화면으로 옮겨 가 다음 TC-DME-SED-06 흐름이 깨진다",
      "set-ver-unlock": "버전 줄 [해제]·[선점]은 이 시험 끝(보기 모드)에서 누른다",
      "set-ver-delete": "버전 줄 [삭제]는 이 시험 끝에서 v1.001·v2.000 DRAFT 를 지우며 누른다",
    });

    // 만든 케이스를 지워 데이터를 남기지 않는다.
    await gridRows(tid(page, "case-grid")).first().click();
    await tid(page, "case-delete").click();
    await tid(page, "case-delete-confirm").click();
    await expect(tid(page, "case-grid")).not.toContainText(`E2E 케이스 ${RUN}`, { timeout: T.UI });

    // 보기 모드로 돌려 놓는다 — 아래 패널은 검사 결과 탭으로 돌아온다.
    await tid(page, "flow-mode-view").click();
    await expect(tid(page, "dbg-toolbar")).toHaveCount(0);
    await tid(page, "flow-tab-checks").click();
    await expect(setChecks()).toBeVisible();
    // 버전 줄 — 내 DRAFT 를 [해제]하면 소유자 없는 DRAFT 가 되어 [선점]이 켜지고, [선점]하면 다시 내 편집 중이다.
    await tid(page, "set-ver-unlock").click();
    await expect(tid(page, "set-message")).toContainText("해제했다", { timeout: T.UI });
    await expect(tid(page, "set-ver-lock")).toBeEnabled();
    await expect(tid(page, "flow-mode-edit")).toBeDisabled();
    await tid(page, "set-ver-lock").click();
    await expect(tid(page, "set-message")).toContainText("선점했다", { timeout: T.UI });
    await expect(tid(page, "set-ver-unlock")).toBeEnabled();
    await expect(tid(page, "flow-mode-edit")).toBeEnabled();
    // 위에서 만든 v1.001 DRAFT 를 [삭제](확인창)로 지우고, [새 버전(major)]도 만들었다 지운다. 확정 버전 v1.000 만 남는다.
    await deleteSetDraftVer(page, "1.001");
    await newSetVersion(page, "major", "2.000");
    await deleteSetDraftVer(page, "2.000");
    await expect(tid(page, "set-status")).toHaveText("INUSE");
    // 룰 박스의 링크 아이콘(flow-rule-open-*)은 눌러 보면 룰 화면으로 옮겨 가므로 다음 TC-DME-SED-06 에서 누른다.
    const ruleOpenAllow = Object.fromEntries(
      (await page.locator('[data-testid^="flow-rule-open-"]:visible').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid") ?? "")))
        .filter(Boolean)
        .map((k) => [k, "룰 박스 링크 아이콘은 다음 TC-DME-SED-06 에서 누른다(누르면 룰 화면으로 옮겨 간다)"]),
    );
    await assertAllButtonsPressed(page, "ruleSetEdit", {
      ...ruleOpenAllow,
      ...(await setTabAllow()),
      ...(await dynamicAllow("flow-section-", "오른쪽 섹션 머리 — 펴고 접기는 flow-section-rules-head 로 확인했고 나머지는 같은 동작이다")),
      [`set-var-link-${GRD}`]: "결과 변수 링크는 다음 TC-DME-SED-06 에서 누른다(누르면 룰 화면으로 옮겨 간다)",
      [`set-var-link-${FCT}`]: "결과 변수 링크는 다음 TC-DME-SED-06 에서 누른다(누르면 룰 화면으로 옮겨 간다)",
      "flow-prop-rule-open": "룰 속성 패널의 [룰 화면 열기]는 다음 TC-DME-SED-06 에서 누른다(누르면 룰 화면으로 옮겨 간다)",
    });
    watcher.assertClean("ruleSetEdit");
  });

  test("TC-DME-SED-06 화면 연결 — 캔버스 룰 박스의 링크 아이콘·결과 변수 링크로 룰 화면이 열리고, 활용처 카드에 세트와 의존 룰이 보인다", async () => {
    // 룰 박스의 링크 아이콘만 룰 화면을 연다(박스 누르기는 속성 패널만 연다).
    await tid(page, `flow-rule-open-${await ruleNodeIdOf(page, SA)}`).click();
    await expect(footerScreenId(page)).toHaveText("ruleEdit", { timeout: T.SLOW });
    await expect(tid(page, "rule-edit-current")).toHaveText(SA, { timeout: T.LONG });
    const usage = tid(page, "rule-usage-sets");
    await expect(usage).toContainText(SET);
    await expect(usage).toContainText(`${SET_NAME} 수정`);
    await expect(tid(page, `rule-usage-link-${SB}`)).toBeVisible();
    await tid(page, "rule-card-usage").scrollIntoViewIfNeeded();
    await layout.layout(page, "ruleEdit 활용처");
    await snap(page, "dme-ruleEdit-SED-06-usage");
    // 역의존 룰 링크 → SB, SB 의 의존 룰 링크 → SA.
    await tid(page, `rule-usage-link-${SB}`).click();
    await expect(tid(page, "rule-edit-current")).toHaveText(SB, { timeout: T.LONG });
    await tid(page, `rule-usage-link-${SA}`).click();
    await expect(tid(page, "rule-edit-current")).toHaveText(SA, { timeout: T.LONG });

    // 세트 편집의 결과 변수 링크(세트 패널) → 그 변수를 만드는 룰.
    await go(page, "ruleSetEdit");
    await clearFlowSelection(page);
    await tid(page, `set-var-link-${FCT}`).click();
    await expect(footerScreenId(page)).toHaveText("ruleEdit", { timeout: T.SLOW });
    await expect(tid(page, "rule-edit-current")).toHaveText(SB, { timeout: T.LONG });
    await go(page, "ruleSetEdit");
    await tid(page, `set-var-link-${GRD}`).click();
    await expect(tid(page, "rule-edit-current")).toHaveText(SA, { timeout: T.LONG });
    // 룰 박스를 누르면 오른쪽 속성 패널이 그 룰로 바뀌고, 패널의 [룰 화면 열기]로도 그 룰의 룰 화면이 열린다.
    await go(page, "ruleSetEdit");
    await ruleNodeOf(page, SB).click();
    await expect(tid(page, "flow-prop-rule")).toBeVisible({ timeout: T.UI });
    await tid(page, "flow-prop-rule-open").click();
    await expect(footerScreenId(page)).toHaveText("ruleEdit", { timeout: T.SLOW });
    await expect(tid(page, "rule-edit-current")).toHaveText(SB, { timeout: T.LONG });
    watcher.assertClean("ruleSetEdit→ruleEdit");
  });

  test("TC-DME-SMN-05 조회(R) — 키워드·담은 룰·결과 변수(중간 포함)·상태 조건으로 세트를 찾고, 계산 칸이 맞으며 ID 링크로 편집이 열린다", async () => {
    await go(page, "ruleSetMng");
    const list = tid(page, "set-list");
    const row = gridRow(list, SET, "setId");
    const cell = (col: string) => row.locator(`.ag-cell[col-id="${col}"]`);
    const search = async (f: { keyword?: string; rule?: string; rv?: string; status?: string }) => {
      await tid(page, "set-search-keyword").fill(f.keyword ?? "");
      await tid(page, "set-search-rule").fill(f.rule ?? "");
      await tid(page, "set-search-var").fill(f.rv ?? "");
      await tid(page, "set-search-status").selectOption(f.status ?? "");
      await button(page, "조회").click();
      await waitIdle(page);
    };
    await search({ keyword: SET });
    await expect(row).toHaveCount(1, { timeout: T.UI });
    await expect(cell("setName")).toHaveText(`${SET_NAME} 수정`);
    await expect(cell("ruleCount")).toHaveText("2");
    await expect(cell("finalResults")).toHaveText(FCT);
    await expect(cell("inputCount")).toHaveText("1");
    await expect(cell("description")).toHaveText("E2E 표면 → 등급 → 계수");
    await expect(cell("checkText")).toHaveText("통과");
    await expect(cell("status")).toHaveText("INUSE");
    await expect(panelCount(page)).toHaveText("1건");
    await layout.layout(page, "ruleSetMng 목록 채워짐");

    await search({ rule: SA });
    await expect(row).toHaveCount(1, { timeout: T.UI });
    await search({ rv: GRD });
    await expect(row).toHaveCount(1, { timeout: T.UI });
    await search({ keyword: SET, status: "INUSE" });
    await expect(row).toHaveCount(1, { timeout: T.UI });
    await search({ keyword: SET, status: "DEPRECATED" });
    await expect(tid(page, "set-list-empty")).toHaveText("조건에 맞는 룰 세트가 없다", { timeout: T.UI });
    await search({ rv: `E2E_NO_SUCH_${RUN}` });
    await expect(tid(page, "set-list-empty")).toBeVisible({ timeout: T.UI });
    await expect(panelCount(page)).toHaveText("0건");
    await layout.layout(page, "ruleSetMng 빈 목록");
    await tid(page, "set-search-var").press("Enter");
    await assertAllButtonsPressed(page, "ruleSetMng");

    await search({ keyword: SET });
    await row.locator(`[data-testid="set-link-${SET}"]`).click();
    await expect(footerScreenId(page)).toHaveText("ruleSetEdit", { timeout: T.SLOW });
    await expect(tid(page, "set-edit-current")).toContainText(SET, { timeout: T.UI });
    watcher.assertClean("ruleSetMng");
  });

  test("TC-DME-SMN-06 담은 룰을 폐기하면 세트 검사가 거부로 바뀌고, 세트를 폐기하면 거부 때문에 되살릴 수 없다", async () => {
    // 룰 폐기는 룰 상세 ① 헤더의 [폐기] 다(D-105).
    await go(page, "ruleMng");
    await openRuleDetail(page, SA);
    await cardButton(page, "rule-card-header", "폐기").click();
    await cardButton(page, "rule-card-header", "폐기 확인").click();
    await expect(tid(page, "rule-card-header")).toContainText("폐기", { timeout: T.UI });

    await go(page, "ruleSetEdit");
    await tid(page, "set-pick-keyword").fill(SET);
    await tid(page, "set-pick-keyword").press("Enter");
    await tid(page, `set-pick-${SET}`).click();
    await expect(setChecks()).toContainText(`${SA}는 DEPRECATED다`, { timeout: T.UI });

    // 세트 폐기 → 되살리기는 서버가 검사를 다시 돌려 거부한다.
    await tid(page, "set-deprecate").click();
    await tid(page, "set-deprecate-confirm").click();
    await expect(tid(page, "set-status")).toHaveText("DEPRECATED", { timeout: T.UI });
    await tid(page, "set-restore").click();
    await expect(setMessage()).toContainText("룰 세트 저장 검사를 통과하지 못했습니다", { timeout: T.UI });
    await expect(tid(page, "set-status")).toHaveText("DEPRECATED");
    expectOnly4xx(watcher, "ruleSetEdit 되살리기 거부");
    await snap(page, "dme-ruleSetEdit-SMN-06-restore-rejected");

    await go(page, "ruleSetMng");
    await tid(page, "set-search-keyword").fill(SET);
    await tid(page, "set-search-rule").fill("");
    await tid(page, "set-search-var").fill("");
    await tid(page, "set-search-status").selectOption("DEPRECATED");
    await button(page, "조회").click();
    const row = gridRow(tid(page, "set-list"), SET, "setId");
    await expect(row).toHaveCount(1, { timeout: T.UI });
    await expect(row.locator('.ag-cell[col-id="status"]')).toHaveText("DEPRECATED");
    await expect(row.locator('.ag-cell[col-id="checkText"]')).toHaveText("-");
    watcher.assertClean("ruleSetMng");
  });

  test("TC-DME-SET-99 배치 검사 모음 — 장 C 에서 본 화면 상태에 배치 위반이 없다", async () => {
    layout.assertEmpty("C 룰 세트");
  });
});

// ═══════════════════════════ D. 화면 연결·넘기기·충돌·드래그·읽기 전용 ═══════════════════════════

test.describe("D 화면 연결·넘기기·충돌·드래그·읽기 전용", () => {
  // 서로 기대지 않는다 — 하나가 실패해도 나머지는 돈다. 테스트마다 스스로 룰을 만든다.
  test.describe.configure({ mode: "default" });

  const simple = (id: string, label: string): EqualRule => ({
    id,
    name: `E2E ${label} ${RUN}`,
    cond: { name: "E2E_SURF", label: "표면", type: "STRING" },
    result: { name: `E2E_${label === "충돌" ? "C" : "D"}GRD_${RUN}`, label: "등급", type: "STRING" },
    rows: [
      ["A", "A"],
      ["B", "B"],
    ],
    fallback: "C",
  });

  test("TC-DME-LNK-01 이미 열린 룰 화면 탭으로 [룰 등록]해도 그 새 룰로 바뀐다", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "stw", testInfo);
    try {
      const first = uid("DMEL1");
      const second = uid("DMEL2");
      for (const id of [first, second]) {
        await go(page, "ruleMng");
        await openRuleRegister(page);
        await tid(page, "rule-reg-id").fill(id);
        await tid(page, "rule-reg-name").fill(`E2E 연결 ${RUN}`);
        await tid(page, "rule-reg-submit").click();
        await expect(footerScreenId(page)).toHaveText("ruleEdit", { timeout: T.SLOW });
        await expect(tid(page, "rule-edit-current"), "넘겨받은 룰").toHaveText(id, { timeout: T.LONG });
      }
      // 룰 화면 탭은 하나뿐이다(이미 열린 탭이 대상 이벤트를 받아 룰을 바꾼다).
      await expect(page.locator(".tabs-bar .tab-item .tab-title").filter({ hasText: /^룰 화면$/ })).toHaveCount(1);
      watcher.assertClean("ruleMng→ruleEdit");
    } finally {
      await page.context().close();
    }
  });

  test("TC-DME-HND-01 넘기기(보류, D2) — 넘길 수 없으니 DRAFT 는 내 편집 중으로 남고, 다른 담당자에게는 잠김으로 보인다", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "stw", testInfo);
    const other = await openAs(browser, "stw2", testInfo);
    try {
      const id = uid("DMEH");
      await go(page, "ruleMng");
      await openRuleRegister(page);
      await tid(page, "rule-reg-id").fill(id);
      await tid(page, "rule-reg-name").fill(`E2E 넘기기 ${RUN}`);
      await tid(page, "rule-reg-submit").click();
      // 등록하면 룰 화면 탭이 열리고, 룰(ruleMng) 상세도 그 룰의 버전 1 DRAFT 로 바뀐다. 넘기기는 상세 ② 버전 줄에 있다(D-105).
      await expect(tid(page, "rule-edit-current")).toHaveText(id, { timeout: T.SLOW });
      await expect(topbar(page)).toContainText("편집 중(나)");
      await go(page, "ruleMng");
      await expect(tid(page, "rule-header-id")).toHaveText(id, { timeout: T.LONG });
      await selectDetailVer(page, "1.000");
      // 넘겨받는 사람의 담당자 여부를 확인할 수단이 없어(서버가 늘 MDM005) 받는 사람 칸과 버튼을 꺼 두었다.
      await expect(tid(page, "rule-handover-target")).toBeDisabled();
      await expect(cardButton(page, "rule-card-versions", HANDOVER)).toBeDisabled();
      await expect(tid(page, "rule-handover-wrap")).toHaveAttribute("title", HANDOVER_PENDING);
      await expect(versionsCard(page)).toContainText("편집 중(나)");
      await snap(page, "dme-ruleMng-HND-01-pending");
      await go(other.page, "ruleMng");
      await openRuleDetail(other.page, id);
      await selectDetailVer(other.page, "1.000");
      await expect(versionsCard(other.page)).toContainText(`잠김 · ${STW} 편집 중`);
      await expect(cardButton(other.page, "rule-card-versions", HANDOVER)).toBeDisabled();
      await openRule(other.page, id);
      await expect(topbar(other.page)).toContainText(`잠김 · ${STW} 편집 중`);
      watcher.assertClean("ruleMng");
      other.watcher.assertClean("ruleMng·ruleEdit(stw2)");
    } finally {
      await page.context().close();
      await other.page.context().close();
    }
  });

  test("TC-DME-CFL-01 같은 DRAFT 를 두 창에서 고치면 늦게 저장한 창에 충돌 안내와 [다시 불러오기]가 보이고, 누르면 최신 표를 불러온다", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "stw", testInfo);
    const other = await openAs(browser, "stw", testInfo);
    try {
      const r = simple(uid("DMEC"), "충돌");
      await buildEqualRule(page, r);
      const ids = await dtRowIds(page);
      await openRule(other.page, r.id);
      await dtEdit(other.page, ids[0], "note", "다른 창이 먼저 고침");
      await tableButton(other.page, "표 저장").click();
      await expect(tid(other.page, "dt-dirty")).toHaveCount(0, { timeout: T.LONG });
      other.watcher.assertClean("ruleEdit(다른 창)");

      // 이 창은 옛 row_version 을 들고 있다.
      await dtEdit(page, ids[1], "note", "이 창이 늦게 고침");
      await tableButton(page, "표 저장").click();
      await expectErrorModal(page, "다른 창에서 바뀌었습니다. 다시 불러오세요", "dme-ruleEdit-CFL-01-conflict");
      expectOnly4xx(watcher, "ruleEdit 충돌");
      await topbar(page).getByRole("button", { name: "다시 불러오기", exact: true }).click();
      await expect(topbar(page).getByRole("button", { name: "다시 불러오기", exact: true })).toHaveCount(0, { timeout: T.UI });
      await expect(dtCell(page, ids[0], "note")).toHaveText("다른 창이 먼저 고침");
      await expect(dtCell(page, ids[1], "note")).toHaveText("");
      await expect(tid(page, "dt-dirty")).toHaveCount(0);
      watcher.assertClean("ruleEdit");
    } finally {
      await page.context().close();
      await other.page.context().close();
    }
  });

  test("TC-DME-DRG-01 행 드래그 — 둘째 행을 손잡이로 맨 위로 끌어 저장하면 순서가 남는다", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "stw", testInfo);
    try {
      const r = simple(uid("DMED"), "드래그");
      await buildEqualRule(page, r);
      const [a, b, fb] = await dtRowIds(page);
      const handle = dtGrid(page).locator(`.ag-row[row-id="${b}"] .ag-row-drag`).first();
      const target = dtGrid(page).locator(`.ag-pinned-left-cols-container .ag-row[row-id="${a}"]`);
      const hb = (await handle.boundingBox())!;
      const tb = (await target.boundingBox())!;
      await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
      await page.mouse.down();
      await page.mouse.move(hb.x + hb.width / 2, hb.y - 10, { steps: 5 });
      await page.mouse.move(tb.x + 20, tb.y + 2, { steps: 15 });
      await page.mouse.up();
      await expect.poll(() => dtRowIds(page), { timeout: 10_000 }).toEqual([b, a, fb]);
      await expect(tid(page, "dt-dirty")).toBeVisible();
      await tableButton(page, "표 저장").click();
      await expect(tid(page, "dt-dirty")).toHaveCount(0, { timeout: T.LONG });
      await pickRule(page, r.id);
      expect(await dtRowIds(page)).toEqual([b, a, fb]);
      await expect(tid(page, `dt-row-${b}`)).toContainText("1");
      watcher.assertClean("ruleEdit");
    } finally {
      await page.context().close();
    }
  });

  test("TC-DME-RO-01 표준관리자(std)는 dme 를 조회만 한다 — 등록·저장·편집·확정·세트 편집 버튼이 막힌다", async ({ browser }, testInfo) => {
    const rule = uid("DMERO");
    const set = uid("DMEROS");
    // 세트에는 확정된 룰만 담는다(D-144 — 세트는 판정 시각의 RELEASED 버전을 참조한다. 룰 지정 목록이 "확정된 룰이 없다" 를 보인다).
    // 방금 등록한 DRAFT 룰은 담을 수 없으므로 로컬 샘플의 사용 중 룰(전제 DB) 중 입력이 컬럼 사전에만 있는 WID_CHK(입력 COIL_WID)를 담는다
    // (다른 룰 결과를 읽는 룰을 혼자 담으면 세트 검사가 거부로 보이므로 결과 변수를 읽지 않는 룰을 쓴다).
    const releasedRule = "WID_CHK";
    const owner = await openAs(browser, "stw", testInfo);
    try {
      await go(owner.page, "ruleMng");
      await openRuleRegister(owner.page);
      await tid(owner.page, "rule-reg-id").fill(rule);
      await tid(owner.page, "rule-reg-name").fill(`E2E 읽기전용 ${RUN}`);
      await tid(owner.page, "rule-reg-submit").click();
      await expect(tid(owner.page, "rule-edit-current")).toHaveText(rule, { timeout: T.SLOW });
      await go(owner.page, "ruleSetMng");
      await tid(owner.page, "set-reg-id").fill(set);
      await tid(owner.page, "set-reg-name").fill(`E2E 읽기전용 세트 ${RUN}`);
      await tid(owner.page, "set-reg-save").click();
      await expect(tid(owner.page, "set-edit-current")).toContainText(set, { timeout: T.SLOW });
      await addToSetOn(owner.page, releasedRule);
      owner.watcher.assertClean("dme(stw)");
    } finally {
      await owner.page.context().close();
    }

    const { page, watcher } = await openAs(browser, "std", testInfo);
    try {
      // ruleMng — 조회는 되고(권한 조회가 끝났다는 뜻) 등록은 꺼져 있다.
      await go(page, "ruleMng");
      await expect(button(page, "조회")).toBeEnabled({ timeout: T.LONG });
      await searchRule(page, rule);
      await expect(ruleRow(page, rule)).toHaveCount(1, { timeout: T.UI });
      await expect(page.locator("#btn_rule_reg")).toBeDisabled();
      await snap(page, "dme-ro-ruleMng");

      // 룰 상세 — 헤더·버전이 모두 막힌다(D-105 로 룰 화면에서 옮겨 왔다).
      await openRuleDetail(page, rule);
      await selectDetailVer(page, "1.000");
      await expect(tid(page, "rule-header-name")).toBeDisabled();
      await expect(cardButton(page, "rule-card-header", "헤더 저장")).toBeDisabled();
      for (const b of ["새 버전(major)", "새 버전(minor)", "삭제", "해제", HANDOVER]) await expect(cardButton(page, "rule-card-versions", b), `${b}(std)`).toBeDisabled();
      await expect(cardButton(page, "rule-card-versions", "선점")).toBeDisabled();
      await snap(page, "dme-ro-ruleMng-detail");

      // ruleEdit — 표·열 설정·값 테스트가 모두 막힌다.
      await openRule(page, rule);
      await expect(topbar(page)).toContainText(`잠김 · ${STW} 편집 중`);
      await expect(tableButton(page, "행 추가")).toBeDisabled();
      await openColumns(page);
      await expect(tid(page, "col-readonly")).toBeVisible();
      await expect(tid(page, "col-add-cond")).toHaveCount(0);
      // 대상 정의를 받은 뒤(열 없는 룰이라 "입력 변수가 없습니다" 가 보인 뒤)에 본다 — 받기 전에는 권한과 무관하게 꺼져 있다.
      await expect(tid(page, "vt-no-input")).toBeVisible({ timeout: T.UI });
      await expect(vtCard(page).getByRole("button", { name: "실행", exact: true })).toBeDisabled();
      await snap(page, "dme-ro-ruleEdit");

      // ruleConfirm — 남의 DRAFT 를 골라도 검사·확정이 꺼져 있다.
      await go(page, "ruleConfirm");
      await tid(page, "rc-keyword").fill(rule);
      await tid(page, "rc-search").click();
      await tid(page, `rc-row-${rule}-1.000`).click();
      await expect(tid(page, "rc-target")).toContainText(rule, { timeout: T.UI });
      await expect(tid(page, "rc-validate")).toBeDisabled();
      await expect(tid(page, "rc-confirm")).toBeDisabled();
      await snap(page, "dme-ro-ruleConfirm");

      // ruleSetMng — 등록 저장이 꺼져 있다.
      await go(page, "ruleSetMng");
      await expect(button(page, "조회")).toBeEnabled();
      await tid(page, "set-reg-id").fill(`${set}_X`);
      await tid(page, "set-reg-name").fill("권한 없음");
      await expect(tid(page, "set-reg-save")).toBeDisabled();

      // ruleSetEdit — 보기는 되고 세트명·편집 모드(룰 추가)·폐기·저장·지침 적용이 막힌다.
      await go(page, "ruleSetEdit");
      await tid(page, "set-pick-keyword").fill(set);
      await tid(page, "set-pick-keyword").press("Enter");
      await tid(page, `set-pick-${set}`).click();
      await expect(tid(page, "set-card-id")).toHaveText(set, { timeout: T.UI });
      await expect(ruleNodeOf(page, releasedRule)).toBeVisible();
      await expect(tid(page, "set-name")).toBeDisabled();
      await expect(tid(page, "flow-mode-edit")).toBeDisabled();
      await expect(tid(page, "set-deprecate")).toBeDisabled();
      await expect(tid(page, "set-save")).toBeDisabled();
      await expect(tid(page, "flow-palette")).toHaveCount(0);
      await snap(page, "dme-ro-ruleSetEdit");
      watcher.assertClean("dme(std)");
    } finally {
      await page.context().close();
    }
  });
});

// ─────────── 룰 세트 편집(캔버스) 도우미 — 흐름도 2단계 ───────────

/** 캔버스의 룰 박스 하나(노드 안에 룰 ID 가 보인다). */
const ruleNodeOf = (page: Page, ruleId: string): Locator =>
  tid(page, "flow-canvas").locator('[data-kind="RULE"]').filter({ hasText: ruleId });

/** 캔버스의 룰 ID 를 흐름 순서로 — 룰 박스의 .rsf-id 칸(testid 가 없어 클래스로 읽는다). */
const flowRuleOrder = (page: Page) => tid(page, "flow-canvas").locator('[data-kind="RULE"] .rsf-id').allTextContents();

/** 룰 박스의 노드 ID(r1 …). 삭제·재삽입으로 번호가 바뀌므로 룰 ID 로 찾아 읽는다. */
async function ruleNodeIdOf(page: Page, ruleId: string): Promise<string> {
  const t = await ruleNodeOf(page, ruleId).first().getAttribute("data-testid");
  return (t ?? "").replace(/^flow-node-/, "");
}

/** 보기 모드 → 편집 모드. 팔레트가 나타난다. */
async function enterFlowEdit(page: Page) {
  await tid(page, "flow-mode-edit").click();
  await expect(tid(page, "flow-palette")).toBeVisible();
}

/** 캔버스 빈 곳을 눌러 선택을 푼다 — 오른쪽 패널이 세트 패널(세트명·설명·입출력 표·구성 지침)로 돌아온다. */
async function clearFlowSelection(page: Page) {
  await tid(page, "flow-canvas").locator(".react-flow__pane").click({ position: { x: 6, y: 6 } });
  await expect(tid(page, "flow-prop-set")).toBeVisible();
}

/** 도구 상자 [룰] → 빈 단계 → 「룰 지정」 에서 [지정]. 고른 선이 없으면 END 앞 선이고 지정한 룰 박스가 선택된 채다. */
async function addRuleToFlow(page: Page, id: string) {
  await tid(page, "flow-add-rule").click();
  await expect(tid(page, "flow-panel-kind")).toHaveText("빈 단계");
  await tid(page, "flow-rule-panel-search").fill(id);
  await tid(page, "flow-rule-panel-find").click();
  await tid(page, `flow-rule-assign-${id}`).click();
}

/** 룰 박스를 골라 속성 패널의 [지우기] 로 뺀다(앞뒤 선은 이어진다). */
async function removeRuleFromFlow(page: Page, id: string) {
  await ruleNodeOf(page, id).click();
  await tid(page, "flow-prop-delete").click();
  await expect(ruleNodeOf(page, id)).toHaveCount(0);
}

/** 세트 편집 화면에서 룰 하나를 담아 저장한다(장 D 준비). */
async function addToSetOn(page: Page, id: string) {
  await enterFlowEdit(page);
  await addRuleToFlow(page, id);
  await tid(page, "set-save").click();
  await expect(tid(page, "set-message")).toContainText(/저장 · row_version \d+/, { timeout: T.UI });
}
