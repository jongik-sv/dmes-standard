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
  escapeRe,
  expectToast,
  footerScreenId,
  gridRow,
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
 * 마루 MDM > 업무기준(dme) 사용자 여정 E2E.
 *
 * 화면: 룰(ruleMng) · 룰 화면(ruleEdit — 헤더·버전·의사결정표·열 설정·피벗·입력 계약·값 테스트·테스트 케이스·활용처) ·
 * 버전 확정(ruleConfirm) · 룰 세트(ruleSetMng) · 룰 세트 편집(ruleSetEdit).
 *
 * 담당자(stw)가 화면만으로 룰과 룰 세트의 일생을 다룬다. 장마다 serial 로 한 페이지를 공유하고, 첫 단계에서 자기 룰을
 * 화면으로 새로 만든다(장 하나만 따로 돌려도 되게 — 로컬 SQLite 잠금 시간을 장 단위로 끊는다).
 *   A 룰 등록·조회 → 룰 화면(헤더 수정·찾기·해제/선점·두 사용자 잠금) → 열 설정(초안 거부·도메인 찾기·열 추가·순서·적용)
 *     → 의사결정표(적중 정책·ALL_NA_ROW 거부·행 추가/복사/기본 행·저장·겹침 거부·행 삭제) → 피벗 → 입력 계약
 *     → 값 테스트(편집본·저장된 버전·키 보냄 끔·기본 행) → 테스트 케이스(저장·모두 돌리기·불러오기·수정·기대값 갱신·삭제)
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

/** 오늘에서 days 만큼 뺀 날의 0시 — datetime-local 입력값(yyyy-MM-ddTHH:mm)과 서버 표기(yyyy-MM-dd). */
function daysAgo(days: number): { input: string; date: string } {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return { input: `${date}T00:00`, date };
}

/**
 * 지금 화면에 보이지 않는 컨트롤 — 안쪽 스크롤 영역(룰 화면·세트 편집의 본문, 확정 폼)에서 가운데가 그 영역 밖으로 밀려난 것.
 * checkLayout 은 창 밖만 건너뛰므로, 스크롤로 머리·꼬리 뒤에 숨은 컨트롤을 "가려진 버튼(L7)"·"겹침(L3)" 으로 센다.
 * 사용자에게 보이지 않는 상태라 그 순간의 배치 검사에서 뺀다(측정만 하는 evaluate — DOM 은 바꾸지 않는다).
 */
async function scrolledOut(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = [...document.querySelectorAll<HTMLElement>(".portal-shell__tab-page")].find((el) => getComputedStyle(el).display !== "none");
    if (!root) return [];
    const path = (el: Element): string => {
      const parts: string[] = [];
      for (let e: Element | null = el; e && e.parentElement && e !== document.body; e = e.parentElement) {
        parts.unshift(`${e.tagName.toLowerCase()}:nth-child(${[...e.parentElement.children].indexOf(e) + 1})`);
      }
      return `body > ${parts.join(" > ")}`;
    };
    const out: string[] = [];
    for (const el of root.querySelectorAll("button, input, select, textarea")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.closest(".ag-root-wrapper")) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      for (let a = el.parentElement; a && a !== root.parentElement; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (!/(auto|scroll)/.test(`${cs.overflowX} ${cs.overflowY}`)) continue;
        const ar = a.getBoundingClientRect();
        if (cx < ar.left || cx > ar.right || cy < ar.top || cy > ar.bottom) {
          out.push(path(el));
          break;
        }
      }
    }
    return out;
  });
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

const errorBody = (page: Page) => page.locator(".error-modal__body:visible");

/** 오류 모달(ErrorModal) 문구를 보고 [확인]으로 닫는다. */
async function expectErrorModal(page: Page, text: string | RegExp, shot?: string) {
  await expect(errorBody(page)).toContainText(text, { timeout: 20_000 });
  if (shot) await snapModal(page, shot);
  await answerConfirm(page, "확인");
}

/** 모달이 다 떠오른 뒤(열림 애니메이션 끝) 찍는다. */
async function snapModal(page: Page, name: string) {
  const m = modal(page);
  await expect(m).toBeVisible();
  await expect
    .poll(() => m.evaluate((el) => Number(getComputedStyle(el).opacity) * (el.getAnimations().length ? 0 : 1)))
    .toBe(1);
  await snap(page, name);
}

/** 의도한 업무 오류(4xx) 직후 — 모인 문제가 4xx 콘솔 줄뿐인지 본다(5xx·페이지 예외는 남기지 않는다). */
function expectOnly4xx(watcher: Watcher, label: string) {
  const rest = watcher.drain().filter((p) => !/status of 4\d\d/.test(p));
  expect(rest, `${label}: 의도한 4xx 외의 오류가 없어야 한다`).toEqual([]);
}

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

async function searchRule(page: Page, keyword: string, opts: { kind?: string; status?: string } = {}) {
  await tid(page, "rule-search-keyword").fill(keyword);
  await searchSelect(page, "종류").selectOption(opts.kind ?? "");
  await searchSelect(page, "상태").selectOption(opts.status ?? "");
  await button(page, "조회").click();
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
  await expect(tid(page, "rule-edit-current")).toHaveText(id, { timeout: 30_000 });
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
  }).toPass({ timeout: 20_000 });
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
  }).toPass({ timeout: 20_000 });
  await select.selectOption(value);
  await expect(select).toHaveCount(0);
  await scrollGridLeft(grid);
}

const colEdit = (page: Page, key: string, field: string, value: string) => gridText(colTable(page), colCell(page, key, field), value);
const colSelect = (page: Page, key: string, field: string, value: string) => gridSelect(colTable(page), colCell(page, key, field), value);

/** 열 설정 표의 새 열 키(`n{번호}`) 목록. */
async function newColKeys(page: Page): Promise<string[]> {
  const ids = await colTable(page)
    .locator(".ag-center-cols-container .ag-row")
    .evaluateAll((els) => els.map((e) => e.getAttribute("row-id") ?? ""));
  return ids.filter((i) => /^n\d+$/.test(i));
}

/** [조건 열 추가]·[결과 열 추가]를 누르고 새로 생긴 열의 키를 돌려준다. */
async function clickAddColumn(page: Page, kind: "COND" | "RESULT"): Promise<string> {
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
  axis?: "ROW" | "COL";
}

/** 열 하나를 더하고 칸을 채운다. 새 열 키를 돌려준다. */
async function addColumn(page: Page, c: ColSpec): Promise<string> {
  const key = await clickAddColumn(page, c.kind);
  if (c.disp !== (c.kind === "COND" ? "Equal" : "Value")) await colSelect(page, key, "dispType", c.disp);
  await colEdit(page, key, "varName", c.name);
  await colEdit(page, key, "label", c.label);
  if (c.type) await colSelect(page, key, "dataType", c.type);
  if (c.axis) await colSelect(page, key, "axis", c.axis);
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
  await expect(head).toBeVisible({ timeout: 20_000 });
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
/** 케이스 줄 — 이름 칸이 name 으로 시작하고 복사본("(복사)")이 아닌 줄(설명은 이름 뒤에 붙는다). */
const caseRow = (page: Page, name: string) =>
  tcCard(page)
    .locator('tr[data-testid^="tc-row-"]')
    .filter({ has: page.locator("td:nth-child(2)", { hasText: new RegExp(`^\\s*${escapeRe(name)}(?! \\(복사\\))`) }) });
const resultValue = (page: Page, name: string) => tid(page, "vt-result-values").locator("tr", { hasText: name }).locator("td");

async function vtInput(page: Page, name: string, value: string) {
  const input = tid(page, `vt-input-${name}`);
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill(value);
}

async function vtRun(page: Page) {
  await vtCard(page).getByRole("button", { name: "돌리기", exact: true }).click();
  await expect(tid(page, "vt-result-target")).toBeVisible({ timeout: 30_000 });
  await waitIdle(page);
}

// ── ruleConfirm ──

async function rcValidate(page: Page, applyFrom: string) {
  await tid(page, "rc-apply-from").fill(applyFrom);
  await tid(page, "rc-validate").click();
  await expect(tid(page, "rc-checks")).toBeVisible({ timeout: 30_000 });
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
 * ruleMng 에서 룰을 등록하고, 룰 화면에서 Equal 조건 열 하나·Value 결과 열 하나를 적용한 뒤 행·기본 행을 넣어 저장한다(적중 정책 FIRST).
 * 등록 뒤 룰 화면이 그 룰의 버전 1 DRAFT(편집 중(나))로 열린 상태에서 끝난다.
 */
async function buildEqualRule(page: Page, r: EqualRule) {
  await go(page, "ruleMng");
  await tid(page, "rule-reg-id").fill(r.id);
  await tid(page, "rule-reg-name").fill(r.name);
  await tid(page, "rule-reg-kind").selectOption("DECISION");
  await tid(page, "rule-register-form").getByRole("button", { name: "룰 등록", exact: true }).click();
  await expect(footerScreenId(page)).toHaveText("ruleEdit", { timeout: 60_000 });
  await expect(tid(page, "rule-edit-current")).toHaveText(r.id, { timeout: 30_000 });
  await expect(topbar(page)).toContainText("편집 중(나)");
  await waitIdle(page);

  await addColumn(page, { kind: "COND", disp: "Equal", ...r.cond });
  await addColumn(page, { kind: "RESULT", disp: "Value", ...r.result });
  await expect(tid(page, "col-reject-count")).toHaveText("거부 0건");
  await tid(page, "col-apply").click();
  await expect(tid(page, "col-dirty")).toHaveCount(0, { timeout: 30_000 });
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
  await expect(tid(page, "dt-dirty")).toHaveCount(0, { timeout: 30_000 });
  await expect(dtRows(page)).toHaveCount(r.rows.length + 1);
}

/** 룰 화면의 [확정 이동]으로 버전 확정을 열고, 과거 일시로 검사해 경고 확인란을 체크한 뒤 확정한다. */
async function confirmFromRuleEdit(page: Page, id: string, ver: number, applyFrom: { input: string; date: string }) {
  await cardButton(page, "rule-card-versions", "확정 이동").click();
  await expect(footerScreenId(page)).toHaveText("ruleConfirm", { timeout: 60_000 });
  await expect(tid(page, "rc-target")).toContainText(`${id} 버전 ${ver}`, { timeout: 30_000 });
  await rcValidate(page, applyFrom.input);
  await expect(tid(page, "rc-confirm")).toBeEnabled({ timeout: 20_000 });
  await tid(page, "rc-confirm").click();
  await expect(modal(page)).toContainText("버전 확정");
  // Equal 조건 하나짜리 룰은 "키가 NULL 이면 맞는 행이 없다" 저장 시 검사 경고가 있어 확인란을 체크해야 [확인]이 켜진다.
  await expect(tid(page, "rc-modal-warnings")).toContainText("이(가) NULL 이면 맞는 행이 없다");
  await expect(tid(page, "rc-modal-ok")).toBeDisabled();
  await tid(page, "rc-ack").getByText("경고를 확인했습니다").click();
  await tid(page, "rc-modal-ok").click();
  await expectToast(page, "확정했습니다");
  await expect(tid(page, "rc-form").locator('.mdm-status-badge[data-status="RELEASED"]')).toBeVisible({ timeout: 20_000 });
  await expect(tid(page, "rc-released")).toContainText(`적용 구간 ${applyFrom.date} 00:00:00`);
}

// ═══════════════════════════ A. 룰 등록·편집·확정 ═══════════════════════════

test.describe("A 룰 등록·편집·확정", () => {
  test.describe.configure({ mode: "serial" });

  const RULE = uid("DME");
  const NAME = `E2E 품질 판정 ${RUN}`;
  const NAME2 = `E2E 품질 등급 판정 ${RUN}`;
  // 변수 이름 — 고정한다. 실행마다 바꾸면 같은 룰에 다른 이름의 변수가 쌓여 지침·활용처 목록이 늘어난다
  // (2026-09-28 `uid()` 정리와 같은 이유. `tools/e2e-clean-data.sh` 로 E2E 룰을 통째로 지운다).
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

  test("TC-DME-MNG-01 룰 화면 배치 — 메뉴로 열면 조회영역·목록·등록 폼이 보인다", async () => {
    await go(page, "ruleMng");
    await resetClicks(page);
    await expect(breadcrumb(page)).toContainText("마루 MDM > 업무기준 > 룰");
    await expect(tid(page, "rule-search-keyword")).toBeVisible();
    await expect(searchSelect(page, "종류")).toHaveValue("");
    await expect(searchSelect(page, "상태")).toHaveValue("");
    await expect(ruleList(page).locator(".ag-root-wrapper")).toBeVisible();
    await expect(tid(page, "rule-register-form")).toBeVisible();
    await expect(tid(page, "rule-reg-kind")).toHaveValue("DECISION");
    await expect(tid(page, "rule-reg-source")).toHaveText("MDM (등록은 MDM 원천만 받는다)");
    await expect(tid(page, "rule-register-form").getByRole("button", { name: "룰 등록", exact: true })).toBeDisabled();
    await layout.layout(page, "ruleMng");
    await snap(page, "dme-ruleMng-01-initial");
    watcher.assertClean("ruleMng");
  });

  test("TC-DME-MNG-02 ID 규칙·룰명 길이 위반은 바로 안내되고 [룰 등록]이 꺼진다", async () => {
    const reg = tid(page, "rule-register-form").getByRole("button", { name: "룰 등록", exact: true });
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
    watcher.assertClean("ruleMng");
  });

  test("TC-DME-MNG-03 등록(C) — ID·룰명·종류·설명·활용처 메모를 넣고 등록하면 룰 화면이 버전 1 DRAFT 로 열린다", async () => {
    await tid(page, "rule-reg-id").fill(RULE);
    await tid(page, "rule-reg-name").fill(NAME);
    await tid(page, "rule-reg-kind").selectOption("DERIVE");
    await tid(page, "rule-reg-kind").selectOption("DECISION");
    await tid(page, "rule-reg-description").fill("E2E 사용자 여정으로 만든 판정 룰");
    await tid(page, "rule-reg-usage").fill("E2E 품질 판정 화면");
    await tid(page, "rule-register-form").getByRole("button", { name: "룰 등록", exact: true }).click();

    await expect(footerScreenId(page)).toHaveText("ruleEdit", { timeout: 60_000 });
    await expect(tid(page, "rule-edit-current")).toHaveText(RULE, { timeout: 30_000 });
    await expect(tid(page, "rule-edit-current-name")).toHaveText(NAME);
    await expect(tid(page, "rule-ver-select")).toHaveValue("1");
    await expect(topbar(page).locator(".mdm-status-badge")).toHaveAttribute("data-status", "DRAFT");
    await expect(topbar(page)).toContainText("편집 중(나)");
    watcher.assertClean("ruleMng→ruleEdit");
  });

  test("TC-DME-MNG-04 조회(R) — 키워드·종류·상태 조건을 바꿔 가며 방금 만든 룰을 찾는다", async () => {
    await go(page, "ruleMng");
    // 등록이 끝나면 등록 폼은 비워진다.
    await expect(tid(page, "rule-reg-id")).toHaveValue("");
    await expect(tid(page, "rule-reg-name")).toHaveValue("");
    await expect(tid(page, "rule-reg-kind")).toHaveValue("DECISION");

    await searchRule(page, RULE);
    await expect(ruleRow(page, RULE)).toHaveCount(1, { timeout: 20_000 });
    await expect(ruleCell(page, RULE, "maruRuleName")).toHaveText(NAME);
    await expect(ruleCell(page, RULE, "ruleKind")).toHaveText("판정(DECISION)");
    await expect(ruleCell(page, RULE, "sourceKind")).toHaveText("MDM");
    await expect(ruleCell(page, RULE, "status")).toHaveText("작성");
    await expect(ruleCell(page, RULE, "releasedVer")).toHaveText("");
    await expect(ruleCell(page, RULE, "pendingText")).toHaveText(`1 DRAFT · ${STW}`);
    await expect(panelCount(page)).toHaveText("1건");
    await layout.layout(page, "ruleMng 목록 채워짐");

    // 종류 산출·상태 사용 중이면 빠지고, 판정·작성이면 나온다.
    await searchRule(page, RULE, { kind: "DERIVE" });
    await expect(tid(page, "rule-list-empty")).toHaveText("조회된 룰이 없습니다.", { timeout: 20_000 });
    await searchRule(page, RULE, { status: "INUSE" });
    await expect(tid(page, "rule-list-empty")).toBeVisible({ timeout: 20_000 });
    await searchRule(page, RULE, { kind: "DECISION", status: "CREATED" });
    await expect(ruleRow(page, RULE)).toHaveCount(1, { timeout: 20_000 });

    // 룰명 일부 + Enter 로도 찾는다.
    await searchSelect(page, "종류").selectOption("");
    await searchSelect(page, "상태").selectOption("");
    await tid(page, "rule-search-keyword").fill(`품질 판정 ${RUN}`);
    await tid(page, "rule-search-keyword").press("Enter");
    await expect(ruleRow(page, RULE)).toHaveCount(1, { timeout: 20_000 });

    // 없는 조건이면 빈 상태.
    await searchRule(page, `${RULE}_NONE`);
    await expect(tid(page, "rule-list-empty")).toBeVisible({ timeout: 20_000 });
    await expect(panelCount(page)).toHaveText("0건");
    await layout.layout(page, "ruleMng 빈 목록");
    await snap(page, "dme-ruleMng-04-empty");
    // 쪽 이동은 로컬 룰이 한 쪽(20건) 안이라 버튼이 꺼져 있어 다루지 않는다(보고서 참고).
    watcher.assertClean("ruleMng");
  });

  test("TC-DME-MNG-05 같은 ID 로 다시 등록하면 중복 문구가 보인다", async () => {
    await tid(page, "rule-reg-id").fill(RULE);
    await tid(page, "rule-reg-name").fill("중복 등록");
    await tid(page, "rule-register-form").getByRole("button", { name: "룰 등록", exact: true }).click();
    await expectErrorModal(page, "같은 룰 ID 가 이미 있습니다", "dme-ruleMng-05-dup");
    expectOnly4xx(watcher, "ruleMng 중복 등록");
    // 거부되면 입력값을 그대로 둔다.
    await expect(tid(page, "rule-reg-id")).toHaveValue(RULE);
    await tid(page, "rule-reg-id").fill("");
    await tid(page, "rule-reg-name").fill("");
    await assertAllButtonsPressed(page, "ruleMng");
    watcher.assertClean("ruleMng");
  });

  test("TC-DME-MNG-06 목록의 룰 ID 링크를 누르면 룰 화면이 그 룰로 열린다", async () => {
    await searchRule(page, RULE);
    await ruleRow(page, RULE).locator(`[data-testid="rule-link-${RULE}"]`).click();
    await expect(footerScreenId(page)).toHaveText("ruleEdit", { timeout: 60_000 });
    await expect(tid(page, "rule-edit-current")).toHaveText(RULE, { timeout: 30_000 });
    watcher.assertClean("ruleMng→ruleEdit");
  });

  // ─────────── ruleEdit — 룰 화면(버전 1 DRAFT) ───────────

  test("TC-DME-EDT-01 룰 화면 배치 — 카드 ①~⑧ 이 보이고 열이 없는 새 룰은 표·열 설정이 비어 있다", async () => {
    await openRule(page, RULE);
    await resetClicks(page);
    await expect(breadcrumb(page)).toContainText("마루 MDM > 업무기준 > 룰 화면");
    for (const c of ["rule-card-header", "rule-card-versions", "rule-card-table", "rule-card-value-test", "rule-card-test-result", "rule-card-test-cases", "rule-card-usage"]) {
      await expect(tid(page, c), c).toBeVisible();
    }
    await expect(tid(page, "rule-header-id")).toHaveText(RULE);
    await expect(tid(page, "rule-header-source")).toHaveText("MDM");
    await expect(tid(page, "rule-card-header")).toContainText("작성");
    await expect(tid(page, "rule-card-header")).toContainText("판정(DECISION)");
    await expect(tid(page, "rule-header-description")).toHaveValue("E2E 사용자 여정으로 만든 판정 룰");
    await expect(tid(page, "rule-header-usage")).toHaveValue("E2E 품질 판정 화면");
    // 버전 1 DRAFT 하나 — 미적용이 있어 새 버전이 막히고 안내가 보인다. 작성 중 룰은 폐기 버튼이 없다(INUSE 만).
    await expect(tid(page, "rule-version-table").locator("tbody tr")).toHaveCount(1);
    await expect(tid(page, "rule-version-table")).toContainText(STW);
    await expect(cardButton(page, "rule-card-versions", "새 버전")).toBeDisabled();
    await expect(tid(page, "rule-unapplied-notice")).toHaveText("미적용 버전 1 이 있어 새 버전을 만들 수 없습니다(한 번에 하나).");
    await expect(cardButton(page, "rule-card-header", "폐기")).toHaveCount(0);
    await expect(cardButton(page, "rule-card-versions", "선점")).toHaveCount(0);
    // 표·열 설정은 비어 있고, 피벗은 축이 없어 보이지 않는다.
    await expect(dtGrid(page)).toContainText("행이 없습니다.");
    await expect(colTable(page)).toContainText("열이 없습니다.");
    await expect(tid(page, "pivot-section")).toHaveCount(0);
    await expect(tid(page, "contract-section")).toBeVisible();
    await expect(tid(page, "vt-result-empty")).toBeVisible();
    await expect(tid(page, "tc-empty")).toHaveText("테스트 케이스가 없습니다");
    await expect(tid(page, "rule-card-usage")).toContainText("이 룰을 담은 룰 세트가 없습니다.");
    await expect(tid(page, "rule-card-usage")).toContainText("E2E 품질 판정 화면");
    await layout.layout(page, "ruleEdit 빈 룰");
    await snap(page, "dme-ruleEdit-01-initial");
    watcher.assertClean("ruleEdit");
  });

  test("TC-DME-EDT-02 헤더 수정(U) — 룰명·설명·활용처 메모를 고쳐 저장하면 다시 골라도 남고, 룰명을 비우면 저장이 꺼진다", async () => {
    const save = cardButton(page, "rule-card-header", "헤더 저장");
    await tid(page, "rule-header-name").fill("");
    await expect(save).toBeDisabled();
    await tid(page, "rule-header-name").fill(NAME2);
    await tid(page, "rule-header-description").fill("두께·표면 등급으로 품질 등급을 정한다(E2E)");
    await tid(page, "rule-header-usage").fill("E2E 품질 판정 화면 · 출하 검사");
    await save.click();
    await expect(tid(page, "rule-edit-current-name")).toHaveText(NAME2, { timeout: 20_000 });

    await pickRule(page, RULE);
    await expect(tid(page, "rule-header-name")).toHaveValue(NAME2);
    await expect(tid(page, "rule-header-description")).toHaveValue("두께·표면 등급으로 품질 등급을 정한다(E2E)");
    await expect(tid(page, "rule-header-usage")).toHaveValue("E2E 품질 판정 화면 · 출하 검사");
    await expect(tid(page, "rule-card-usage")).toContainText("E2E 품질 판정 화면 · 출하 검사");
    watcher.assertClean("ruleEdit");
  });

  test("TC-DME-EDT-03 찾기 — 없는 룰이면 안내, 버전 목록 행을 누르면 그 버전을 연다", async () => {
    await tid(page, "rule-pick-keyword").fill(`${RULE}_NONE`);
    await tid(page, "rule-pick-keyword").press("Enter");
    await expect(tid(page, "rule-pick-list")).toHaveText("찾은 룰이 없습니다.", { timeout: 20_000 });
    await pickRule(page, RULE);
    await expect(tid(page, "rule-pick-list")).toHaveCount(0);
    await tid(page, "rule-ver-row-1").click();
    await expect(tid(page, "rule-version-table").locator('tr[data-selected="true"]')).toContainText("1");
    await expect(tid(page, "rule-ver-select")).toHaveValue("1");
    watcher.assertClean("ruleEdit");
  });

  test("TC-DME-EDT-04 해제·선점과 두 사용자 — 남이 잡은 DRAFT 는 잠김이고, 풀면 넘겨받는다", async ({ browser }, testInfo) => {
    const versions = "rule-card-versions";
    await cardButton(page, versions, "해제").click();
    await expect(topbar(page)).toContainText("선점 가능", { timeout: 20_000 });
    await expect(cardButton(page, versions, "선점")).toBeEnabled();
    for (const b of ["해제", HANDOVER, "삭제"]) await expect(cardButton(page, versions, b), b).toBeDisabled();
    await expect(tableButton(page, "행 추가")).toBeDisabled();
    await snap(page, "dme-ruleEdit-04-unlocked");
    await cardButton(page, versions, "선점").click();
    await expect(topbar(page)).toContainText("편집 중(나)", { timeout: 20_000 });
    await expect(tableButton(page, "행 추가")).toBeEnabled();

    const other = await openAs(browser, "stw2", testInfo);
    const p2 = other.page;
    try {
      await openRule(p2, RULE);
      await expect(topbar(p2)).toContainText(`잠김 · ${STW} 편집 중`);
      for (const b of ["해제", HANDOVER, "삭제", "확정 이동"]) {
        const btn = cardButton(p2, versions, b);
        if (b === "확정 이동") await expect(btn, `${b}(stw2)`).toBeEnabled(); // 소유자 판정은 확정 화면이 한다(설계 §9)
        else await expect(btn, `${b}(stw2)`).toBeDisabled();
      }
      await expect(cardButton(p2, versions, "선점")).toHaveCount(0);
      await expect(tableButton(p2, "행 추가")).toBeDisabled();
      await expect(tid(p2, "col-readonly")).toBeVisible();
      await snap(p2, "dme-ruleEdit-04-locked-by-other");

      // stw 해제 → stw2 가 다시 골라 선점 → stw 화면은 잠김 → stw2 해제 → stw 선점.
      await cardButton(page, versions, "해제").click();
      await expect(topbar(page)).toContainText("선점 가능", { timeout: 20_000 });
      await pickRule(p2, RULE);
      await cardButton(p2, versions, "선점").click();
      await expect(topbar(p2)).toContainText("편집 중(나)", { timeout: 20_000 });
      await pickRule(page, RULE);
      await expect(topbar(page)).toContainText(`잠김 · ${STW2} 편집 중`);
      await expect(tableButton(page, "행 추가")).toBeDisabled();
      await cardButton(p2, versions, "해제").click();
      await expect(topbar(p2)).toContainText("선점 가능", { timeout: 20_000 });
      other.watcher.assertClean("ruleEdit(stw2)");
    } finally {
      await p2.context().close();
    }
    await pickRule(page, RULE);
    await cardButton(page, versions, "선점").click();
    await expect(topbar(page)).toContainText("편집 중(나)", { timeout: 20_000 });
    watcher.assertClean("ruleEdit");
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
    await expect(box).toContainText("검색 결과가 없습니다.", { timeout: 20_000 });
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
    const thk = await addColumn(page, { kind: "COND", disp: "2", name: THK, label: "두께", type: "NUMBER", axis: "ROW" });
    const surf = await addColumn(page, { kind: "COND", disp: "Equal", name: SURF, label: "표면", type: "STRING", axis: "COL" });
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
    await expect(tid(page, "col-dirty")).toHaveCount(0, { timeout: 30_000 });
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
    // 적용한 열은 발급된 var_id 키로 다시 그려지고 축이 남는다.
    await expect(tid(page, `col-name-v${vThk}`)).toHaveText(THK);
    await expect(tid(page, `col-axis-v${vSurf}`)).toHaveText("COL");
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
    await expect(tid(page, "dt-save-rejected")).toContainText("룰 저장 거부", { timeout: 30_000 });
    await expect(tid(page, "dt-save-rejected")).toContainText("INCOMPLETE_RESULT");
    await expectErrorModal(page, "INCOMPLETE_RESULT");
    // 결과를 채워도 조건이 전부 - 면 도달 불가 행으로 거부된다.
    await dtEdit(page, id, `c${vGrd}_val`, "X");
    await expect(tid(page, "dt-save-rejected")).toHaveCount(0);
    await tableButton(page, "표 저장").click();
    await expect(tid(page, "dt-save-rejected")).toContainText("ALL_NA_ROW", { timeout: 30_000 });
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
    await dtOp(page, r1, `c${vThk}_op`, "<= 변수 <");
    await dtEdit(page, r1, `c${vThk}_left`, "1.6");
    await dtEdit(page, r1, `c${vThk}_right`, "2.5");
    await dtEqual(page, r1, vSurf, "A");
    await dtEdit(page, r1, `c${vGrd}_val`, "A");
    // 2행: 1행을 골라 [행 복사] → 표면 B → B
    await expect(tid(page, "dt-copy-row")).toBeDisabled();
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
    await expect(tid(page, "dt-dirty")).toHaveCount(0, { timeout: 30_000 });
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
    await expect(tid(page, "dt-save-rejected")).toContainText("OVERLAP", { timeout: 30_000 });
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
    await expect(tid(page, "dt-dirty")).toHaveCount(0, { timeout: 30_000 });
    const five = await dtRowIds(page);
    expect(five).toHaveLength(5);
    await expect(dtCell(page, ids[0], "note")).toHaveText("E2E 중간 두께 A(수정)");

    // 삭제: 늘린 행을 ✕ 로 지워 저장하면 네 행으로 돌아온다.
    const added = five.find((i) => !ids.includes(i))!;
    await tid(page, `dt-del-${added}`).click();
    await expect(tid(page, `dt-row-${added}`)).toHaveCount(0);
    await tableButton(page, "표 저장").click();
    await expect(tid(page, "dt-dirty")).toHaveCount(0, { timeout: 30_000 });
    expect(await dtRowIds(page)).toEqual(ids);
    await layout.layout(page, "ruleEdit 표 저장 뒤");
    watcher.assertClean("ruleEdit");
  });

  // ─────────── 피벗·입력 계약 ───────────

  test("TC-DME-PVT-01 피벗 — 두께 구간 × 표면으로 펼쳐 보이고, 셀·구간을 고쳐 저장하면 결정표 행이 따라 바뀐다", async () => {
    await expect(tid(page, "pivot-section")).toBeVisible();
    await expect(tid(page, "pivot-badge")).toHaveText("편집");
    await expect(tid(page, "pivot-col-A")).toBeVisible();
    await expect(tid(page, "pivot-col-B")).toBeVisible();
    const bands = screen(page).locator('[data-testid^="pivot-band-"]');
    await expect(bands).toHaveCount(2);
    // 구간 키는 그 구간의 첫 행 — 1구간 [1.6, 2.5) 은 1행, 2구간 [2.5, 10) 은 3행이다.
    const rowIds = await dtRowIds(page);
    const [b1, b2] = [rowIds[0], rowIds[2]];
    await expect(page.locator(`input[data-pvc="${b1}"][data-col="B"]`)).toHaveValue("B");
    await layout.layout(page, "ruleEdit 피벗");

    // 빈칸에 값을 넣으면 행을 만든다 — 저장 전에는 표 저장이 막힌다. [피벗 되돌리기]로 버린다.
    const empty = page.locator(`input[data-pvc="${b2}"][data-col="B"]`);
    await expect(empty).toHaveValue("");
    await empty.fill("C");
    await empty.press("Enter");
    await expect(tid(page, "pivot-dirty")).toBeVisible();
    await expect(tid(page, "dt-pivot-block")).toContainText("피벗에 저장 안 한 변경이 있어 표를 저장할 수 없습니다");
    await tid(page, "pivot-revert").click();
    await expect(tid(page, "pivot-dirty")).toHaveCount(0);
    await expect(tid(page, "dt-pivot-block")).toHaveCount(0);

    // 구간 추가(2구간 아래, 값 복사) → 하한·상한 10·20 → 저장하면 결정표가 한 행 는다.
    await screen(page).locator(`[data-pvadd="${b2}"]`).click();
    await expect(bands).toHaveCount(3);
    const newBand = (await bands.nth(2).getAttribute("data-testid"))!.replace("pivot-band-", "");
    const lo = page.locator(`input[data-pvb="lo"][data-band="${newBand}"]`);
    await lo.fill("10");
    await lo.press("Enter");
    const hi = page.locator(`input[data-pvb="hi"][data-band="${newBand}"]`);
    await hi.fill("20");
    await hi.press("Enter");
    // 상한을 "이하"로 바꾸면 그 구간 행의 op 가 닫힌 구간이 된다.
    await page.locator(`select[data-pvb="hop"][data-band="${newBand}"]`).selectOption("<=");
    await snap(page, "dme-ruleEdit-PVT-01-band-added");
    await tid(page, "pivot-save").click();
    await expect(tid(page, "pivot-dirty")).toHaveCount(0, { timeout: 30_000 });
    await expect(tid(page, "rule-edit-notice")).toHaveText("피벗 편집을 의사결정표 행으로 저장했습니다.");
    await expect(dtRows(page)).toHaveCount(5);
    await expect(bands).toHaveCount(3);
    const addedRow = (await dtRowIds(page)).find((i) => !rowIds.includes(i))!;
    await expect(dtCell(page, addedRow, `c${vThk}_op`)).toHaveText("<= 변수 <=");
    await expect(dtCell(page, addedRow, `c${vThk}_left`)).toHaveText("10");
    await expect(dtCell(page, addedRow, `c${vThk}_right`)).toHaveText("20");

    // 그 구간을 지워 저장하면 원래 네 행이다.
    const saved = (await bands.nth(2).getAttribute("data-testid"))!.replace("pivot-band-", "");
    await screen(page).locator(`[data-pvdel="${saved}"]`).click();
    await expect(bands).toHaveCount(2);
    await tid(page, "pivot-save").click();
    await expect(tid(page, "pivot-dirty")).toHaveCount(0, { timeout: 30_000 });
    await expect(dtRows(page)).toHaveCount(4);
    watcher.assertClean("ruleEdit");
  });

  test("TC-DME-CTR-01 입력 계약 — 조건 변수는 늘 키가 있어야 하고, 행 묶음별 필수 변수가 보인다(최초 버전이라 RELEASED 비교 없음)", async () => {
    const always = tid(page, "contract-always");
    await expect(always).toContainText(THK, { timeout: 30_000 });
    await expect(always).toContainText(SURF);
    await expect(screen(page).locator('[data-testid^="contract-group-"]').first()).toBeVisible();
    await expect(tid(page, "contract-warning-count")).toHaveCount(0);
    await expect(tid(page, "contract-diff-none")).toHaveCount(0);
    await tid(page, "contract-section").scrollIntoViewIfNeeded();
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
    await expect(dtGrid(page).locator(`.ag-center-cols-container .ag-row[row-id="${ids[0]}"]`)).toHaveClass(/ag-row-test-hit/);
    await tid(page, "rule-card-test-result").scrollIntoViewIfNeeded();
    await snap(page, "dme-ruleEdit-VT-01-body");

    // 저장된 버전 1 로 돌려도 같다.
    await tid(page, "vt-target").selectOption({ label: "버전 1 · DRAFT" });
    await expect(tid(page, "vt-mode")).toContainText("저장된 버전");
    await vtRun(page);
    await expect(tid(page, "vt-result-target")).toContainText("버전 1");
    await expect(resultValue(page, GRD)).toHaveText(/^\s*"?A"?\s*$/);

    // 두께 키를 빼면 레코드에 키가 없어 판정 오류(MISSING_KEY).
    await tid(page, `vt-key-${THK}`).locator('input[type="checkbox"]').uncheck();
    await expect(tid(page, `vt-input-${THK}`)).toBeDisabled();
    await vtRun(page);
    await expect(tid(page, "vt-result-target")).toContainText("판정 오류");
    await expect(tid(page, "vt-result-errors")).toContainText("MISSING_KEY");
    await tid(page, `vt-key-${THK}`).locator('input[type="checkbox"]').check();

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

  test("TC-DME-TC-01 테스트 케이스 CRUD — 저장·모두 돌리기·불러오기·수정(취소·오류·기대값 틀림)·기대값 갱신·삭제", async () => {
    // 등록: 방금 돌린 결과(5.0·B → C)가 기대값으로 실린다.
    await expect(vtCard(page).getByRole("button", { name: "케이스로 저장", exact: true })).toBeDisabled();
    await tid(page, "vt-case-name").fill(CASE_C);
    await vtCard(page).getByRole("button", { name: "케이스로 저장", exact: true }).click();
    await expect(caseRow(page, CASE_C)).toBeVisible({ timeout: 30_000 });
    await expect(caseRow(page, CASE_C)).toContainText(`"${GRD}"`);
    await expect(tid(page, "vt-case-name")).toHaveValue("");
    await vtInput(page, THK, "2.0");
    await vtInput(page, SURF, "A");
    await vtRun(page);
    await tid(page, "vt-case-name").fill(CASE_A);
    await vtCard(page).getByRole("button", { name: "케이스로 저장", exact: true }).click();
    await expect(caseRow(page, CASE_A)).toBeVisible({ timeout: 30_000 });
    await tid(page, "vt-case-name").fill(CASE_DEL);
    await vtCard(page).getByRole("button", { name: "케이스로 저장", exact: true }).click();
    await expect(caseRow(page, CASE_DEL)).toBeVisible({ timeout: 30_000 });
    await expect(tid(page, "tc-empty")).toHaveCount(0);

    // 조회: 모두 돌리기 — 기대값이 맞아 통과.
    await tcCard(page).getByRole("button", { name: "모두 실행", exact: true }).click();
    for (const n of [CASE_A, CASE_C, CASE_DEL]) {
      await expect(caseRow(page, n).locator('[data-testid^="tc-badge-"]'), n).toHaveText(/통과/, { timeout: 30_000 });
    }
    await layout.layout(page, "ruleEdit 테스트 케이스");
    await tcCard(page).scrollIntoViewIfNeeded();
    await snap(page, "dme-ruleEdit-TC-01-cases");

    // 한 케이스만 돌리기 — 그 케이스만 배지가 남는다.
    await caseRow(page, CASE_A).locator('[data-testid^="tc-run-"]').click();
    await expect(caseRow(page, CASE_A).locator('[data-testid^="tc-badge-"]')).toHaveText(/통과/, { timeout: 30_000 });
    await expect(caseRow(page, CASE_C).locator('[data-testid^="tc-badge-"]')).toHaveCount(0);
    await caseRow(page, CASE_C).locator('[data-testid^="tc-run-"]').click();
    await expect(caseRow(page, CASE_C).locator('[data-testid^="tc-badge-"]')).toHaveText(/통과/, { timeout: 30_000 });
    await expect(caseRow(page, CASE_A).locator('[data-testid^="tc-badge-"]')).toHaveCount(0);

    // 불러오기 — 케이스 입력이 값 테스트 칸에 채워진다.
    await vtInput(page, THK, "");
    await vtInput(page, SURF, "");
    await caseRow(page, CASE_C).getByRole("button", { name: "불러오기", exact: true }).click();
    await expect(tid(page, `vt-input-${SURF}`)).toHaveValue("B");
    await expect(tid(page, `vt-input-${THK}`)).toHaveValue(/^5(\.0)?$/);

    // 수정: 팝업에서 [값 테스트 입력 넣기] 후 [취소] 하면 아무것도 바뀌지 않는다.
    await caseRow(page, CASE_A).locator('[data-testid^="tc-edit-"]').click();
    await expect(tid(page, "tc-edit-modal")).toBeVisible();
    await expect(tid(page, "tc-edit-name")).toHaveValue(CASE_A);
    await tid(page, "tc-edit-use-input").click();
    await expect(tid(page, "tc-edit-input")).toHaveValue(new RegExp(`"${SURF}"\\s*:\\s*"B"`));
    await snapModal(page, "dme-ruleEdit-TC-01-edit-modal");
    await modal(page).getByRole("button", { name: "취소", exact: true }).click();
    await expect(tid(page, "tc-edit-modal")).toHaveCount(0);
    await expect(caseRow(page, CASE_A)).toContainText(`"${SURF}":"A"`);

    // 수정: 입력 JSON 이 깨지면 팝업 안 오류로 막힌다.
    await caseRow(page, CASE_C).locator('[data-testid^="tc-edit-"]').click();
    await tid(page, "tc-edit-input").fill("{");
    await tid(page, "tc-edit-save").click();
    await expect(tid(page, "tc-edit-error")).toBeVisible();
    await expect(tid(page, "tc-edit-modal")).toBeVisible();
    // 수정(U): 이름·설명·틀린 기대값으로 저장하면 모두 돌리기에서 실패로 보인다.
    await tid(page, "tc-edit-input").fill(`{"${THK}": 5.0, "${SURF}": "B"}`);
    await tid(page, "tc-edit-name").fill(`${CASE_C}(수정)`);
    await tid(page, "tc-edit-desc").fill("기대값을 일부러 틀리게 둔다");
    await tid(page, "tc-edit-expected").fill(`{"${GRD}": "Z"}`);
    await tid(page, "tc-edit-save").click();
    await expect(tid(page, "tc-edit-modal")).toHaveCount(0, { timeout: 20_000 });
    const edited = caseRow(page, `${CASE_C}(수정)`);
    await expect(edited).toContainText("기대값을 일부러 틀리게 둔다");
    await expect(edited).toContainText('"Z"');
    await tcCard(page).getByRole("button", { name: "모두 실행", exact: true }).click();
    await expect(edited.locator('[data-testid^="tc-badge-"]')).toHaveText(/실패/, { timeout: 30_000 });
    await expect(edited).toContainText(GRD);

    // 기대값 갱신 — 마지막 결과(C)로 기대값을 다시 쓰면 통과로 돌아온다.
    await edited.getByRole("button", { name: "기대값 갱신", exact: true }).click();
    await expect(edited).not.toContainText('"Z"', { timeout: 20_000 });
    await tcCard(page).getByRole("button", { name: "모두 실행", exact: true }).click();
    await expect(edited.locator('[data-testid^="tc-badge-"]')).toHaveText(/통과/, { timeout: 30_000 });

    // 복사(C) — 남길 두 케이스를 복사하면 "(복사)" 이름으로 같은 입력·기대값의 줄이 생긴다. 복사본은 곧 지운다.
    for (const n of [CASE_A, `${CASE_C}(수정)`]) {
      await caseRow(page, n).locator('[data-testid^="tc-copy-"]').click();
      await expect(caseRow(page, `${n} (복사)`)).toBeVisible({ timeout: 20_000 });
      await expect(caseRow(page, `${n} (복사)`).locator("td").nth(2)).toHaveText((await caseRow(page, n).locator("td").nth(2).textContent())!);
    }
    await expect(tcCard(page).locator('tr[data-testid^="tc-row-"]')).toHaveCount(5);
    for (const n of [`${CASE_A} (복사)`, `${CASE_C}(수정) (복사)`]) {
      await caseRow(page, n).getByRole("button", { name: "삭제", exact: true }).click();
      await caseRow(page, n).getByRole("button", { name: "삭제 확인", exact: true }).click();
      await expect(caseRow(page, n)).toHaveCount(0, { timeout: 20_000 });
    }

    // 삭제(D) — 한 번 더 눌러야 지운다.
    const del = caseRow(page, CASE_DEL);
    await del.getByRole("button", { name: "삭제", exact: true }).click();
    await expect(del.getByRole("button", { name: "삭제 확인", exact: true })).toBeVisible();
    await del.getByRole("button", { name: "삭제 확인", exact: true }).click();
    await expect(caseRow(page, CASE_DEL)).toHaveCount(0, { timeout: 20_000 });
    await expect(tcCard(page).locator('tr[data-testid^="tc-row-"]')).toHaveCount(2);
    watcher.assertClean("ruleEdit");
  });

  test("TC-DME-EDT-05 카드 묶음·섹션 접기와 빈 넘기기 안내 — 룰 화면의 모든 버튼을 한 번씩 눌렀다", async () => {
    for (const g of ["headerVersions", "valueTests"]) {
      await tid(page, `rule-group-${g}-toggle`).click();
      await expect(page.locator(`[data-testid="rule-group-${g}-body"]`)).toBeHidden();
      await tid(page, `rule-group-${g}-toggle`).click();
      await expect(tid(page, `rule-group-${g}-body`)).toBeVisible();
    }
    for (const s of ["rule-section-columns", "pivot-section", "contract-section"]) {
      await tid(page, `${s}-toggle`).click();
      await expect(page.locator(`[data-testid="${s}-body"]`)).toBeHidden();
      await tid(page, `${s}-toggle`).click();
      await expect(tid(page, `${s}-body`)).toBeVisible();
    }
    // 넘기기 — 준비 중이라 받는 사람 칸과 버튼이 꺼져 있고, 올려 보면 이유를 알린다(D2 보류, TC-DME-HND-01).
    await expect(tid(page, "rule-handover-target")).toBeDisabled();
    await expect(cardButton(page, "rule-card-versions", HANDOVER)).toBeDisabled();
    await expect(tid(page, "rule-handover-wrap")).toHaveAttribute("title", HANDOVER_PENDING);
    await expect(topbar(page)).toContainText("편집 중(나)");
    await tid(page, "rule-ver-row-1").click();
    await layout.layout(page, "ruleEdit 편집 끝");
    await snap(page, "dme-ruleEdit-05-done");
    await assertAllButtonsPressed(page, "ruleEdit(버전 1 DRAFT)", {
      "확정 이동": "다음 TC-DME-CNF-01 에서 누른다(누르면 버전 확정 탭으로 옮겨 간다)",
    });
    watcher.assertClean("ruleEdit");
  });

  // ─────────── ruleConfirm — 버전 확정 ───────────

  test("TC-DME-CNF-01 [확정 이동]으로 버전 확정 화면이 그 DRAFT 로 열린다", async () => {
    await cardButton(page, "rule-card-versions", "확정 이동").click();
    await expect(footerScreenId(page)).toHaveText("ruleConfirm", { timeout: 60_000 });
    await resetClicks(page);
    await expect(breadcrumb(page)).toContainText("마루 MDM > 업무기준 > 버전 확정");
    await expect(tid(page, "rc-target")).toHaveText(`${RULE} 버전 1 · DECISION`, { timeout: 30_000 });
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
    const row = tid(page, `rc-row-${RULE}-1`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText(NAME2);
    await expect(row).toContainText("DECISION");
    await expect(row).toContainText(STW);
    await expect(tid(page, "rc-list").locator('tr[data-testid^="rc-row-"]')).toHaveCount(1);
    await tid(page, "rc-keyword").fill(`${RULE}_NONE`);
    await tid(page, "rc-search").click();
    await expect(tid(page, "rc-list-empty")).toHaveText("확정할 DRAFT 가 없습니다", { timeout: 20_000 });
    await layout.layout(page, "ruleConfirm 빈 목록");
    await tid(page, "rc-keyword").fill(RULE);
    await tid(page, "rc-search").click();
    await tid(page, `rc-row-${RULE}-1`).click();
    await expect(tid(page, `rc-row-${RULE}-1`)).toHaveAttribute("aria-selected", "true");
    await expect(tid(page, "rc-target")).toHaveText(`${RULE} 버전 1 · DECISION`, { timeout: 20_000 });
    // 같은 행 보기 — 최초 버전은 모두 추가라 같은 행이 없다.
    await tid(page, "rc-diff-show-same").getByText("같은 행 보기").click();
    await expect(tid(page, "rc-diff").locator('tr[data-kind="ADDED"]')).toHaveCount(4);
    await tid(page, "rc-diff-show-same").getByText("같은 행 보기").click();
    watcher.assertClean("ruleConfirm");
  });

  test("TC-DME-CNF-03 검사 — 일시 없이 검사하면 안내, 검사 뒤 일시를 바꾸면 확정이 꺼지고 다시 검사해야 켜진다", async () => {
    await tid(page, "rc-validate").click();
    await expect(tid(page, "rc-error")).toHaveText("적용 시작 일시를 입력하세요");
    await rcValidate(page, daysAgo(8).input);
    // 저장 시 검사 경고 — 키가 NULL 이면 맞는 행이 없다·축 조합 빈칸(경고라 확정은 된다).
    await expect(tid(page, "rc-check-status-SAVE_CHECKS")).toHaveText("경고");
    await expect(tid(page, "rc-check-SAVE_CHECKS")).toContainText(`${THK} 이(가) NULL 이면 맞는 행이 없다`);
    await expect(tid(page, "rc-check-status-NOT_EMPTY")).toHaveText("통과");
    await expect(tid(page, "rc-check-status-TEST_CASES")).toHaveText("통과");
    await expect(tid(page, "rc-check-TEST_CASES")).toContainText("전체 2 · 기대값 있음 2 · 통과 2 · 실패 0");
    await expect(tid(page, "rc-check-status-RESULT_VAR_RELEASED")).toHaveText("통과");
    await expect(tid(page, "rc-check-status-APPLY_FROM")).toHaveText("면제");
    await expect(tid(page, "rc-confirm")).toBeEnabled();

    await tid(page, "rc-apply-from").fill(CONFIRM1.input);
    await expect(tid(page, "rc-confirm")).toBeDisabled();
    await tid(page, "rc-validate").click();
    await expect(tid(page, "rc-confirm")).toBeEnabled({ timeout: 20_000 });
    await layout.layout(page, "ruleConfirm 검사 결과");
    await snap(page, "dme-ruleConfirm-03-checked");
    watcher.assertClean("ruleConfirm");
  });

  test("TC-DME-CNF-04 확정 — 대화상자 [취소]는 아무것도 바꾸지 않고, [확인]하면 RELEASED 가 되고 목록에서 빠진다", async () => {
    await tid(page, "rc-confirm").click();
    const m = modal(page);
    await expect(m).toContainText("버전 확정");
    await expect(m).toContainText(`${RULE} 버전 1 을(를) ${CONFIRM1.date} 00:00:00 부터 적용하도록 확정합니다.`);
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
    await expect(tid(page, "rc-form").locator('.mdm-status-badge[data-status="RELEASED"]')).toBeVisible({ timeout: 20_000 });
    await expect(tid(page, "rc-released")).toContainText(`적용 구간 ${CONFIRM1.date} 00:00:00 ~ 9999-12-31`);
    await expect(tid(page, "rc-released")).toContainText(`확정자 ${STW}`);
    await expect(tid(page, "rc-validate")).toBeDisabled();
    await expect(tid(page, "rc-confirm")).toBeDisabled();
    await expect(tid(page, `rc-row-${RULE}-1`)).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 });
    await layout.layout(page, "ruleConfirm 확정 뒤");
    await snap(page, "dme-ruleConfirm-04-released");
    await assertAllButtonsPressed(page, "ruleConfirm");
    watcher.assertClean("ruleConfirm");
  });

  test("TC-DME-MNG-07 확정 반영 — 목록에 사용 중·적용 버전 1·적중 정책 UNIQUE·미적용 없음으로 보이고, 룰 화면은 읽기 전용이다", async () => {
    await go(page, "ruleMng");
    await searchRule(page, RULE, { status: "INUSE" });
    await expect(ruleRow(page, RULE)).toHaveCount(1, { timeout: 20_000 });
    await expect(ruleCell(page, RULE, "status")).toHaveText("사용 중");
    await expect(ruleCell(page, RULE, "releasedVer")).toHaveText("1");
    await expect(ruleCell(page, RULE, "hitPolicy")).toHaveText("UNIQUE");
    await expect(ruleCell(page, RULE, "pendingText")).toHaveText("");
    await searchRule(page, RULE, { status: "CREATED" });
    await expect(tid(page, "rule-list-empty")).toBeVisible({ timeout: 20_000 });

    await openRule(page, RULE);
    await expect(topbar(page).locator(".mdm-status-badge")).toHaveAttribute("data-status", "RELEASED");
    await expect(tid(page, "rule-card-header")).toContainText("사용 중");
    await expect(tableButton(page, "행 추가")).toBeDisabled();
    await expect(tid(page, "col-readonly")).toBeVisible();
    await expect(tid(page, "pivot-badge")).toHaveText("화면 표현");
    await expect(cardButton(page, "rule-card-versions", "새 버전")).toBeEnabled();
    await expect(cardButton(page, "rule-card-versions", "확정 이동")).toBeDisabled();
    await expect(cardButton(page, "rule-card-header", "폐기")).toBeEnabled();
    await expect(tid(page, "rule-unapplied-notice")).toHaveCount(0);
    await layout.layout(page, "ruleEdit 확정 뒤");
    await snap(page, "dme-ruleEdit-MNG-07-released");
    watcher.assertClean("ruleEdit");
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
    await confirmFromRuleEdit(page, RULE, 1, RELEASE1);
    watcher.assertClean("ruleEdit·ruleConfirm");
  });

  test("TC-DME-VER-01 새 버전 — 확정 버전을 복사한 버전 2 DRAFT 가 편집 중(나)로 열리고, 그 뒤 새 버전은 막힌다", async () => {
    await openRule(page, RULE);
    await resetClicks(page);
    await expect(tid(page, "rule-ver-select")).toHaveValue("1");
    await expect(topbar(page).locator(".mdm-status-badge")).toHaveAttribute("data-status", "RELEASED");
    v1Rows = await dtRowIds(page);
    expect(v1Rows).toHaveLength(3);
    vSurf = await varIdOf(page, "표면");
    vGrd = await varIdOf(page, "등급");

    await cardButton(page, "rule-card-versions", "새 버전").click();
    await expect(tid(page, "rule-ver-select")).toHaveValue("2", { timeout: 20_000 });
    const v2 = tid(page, "rule-version-table").locator("tr", { has: page.locator('[data-testid="rule-ver-row-2"]') });
    await expect(v2.locator('.mdm-status-badge[data-status="DRAFT"]')).toBeVisible();
    await expect(v2.locator("td").nth(3)).toHaveText(STW);
    await expect(v2.locator("td").nth(4)).toHaveText("1");
    await expect(topbar(page)).toContainText("편집 중(나)");
    await expect(cardButton(page, "rule-card-versions", "새 버전")).toBeDisabled();
    await expect(tid(page, "rule-unapplied-notice")).toContainText("미적용 버전 2");
    await expect(cardButton(page, "rule-card-header", "폐기")).toBeDisabled();
    // 행은 버전 1 을 그대로 복사한다(같은 row_id).
    expect(await dtRowIds(page)).toEqual(v1Rows);
    // RELEASED(base) 와 입력 계약이 같다.
    await expect(tid(page, "contract-warning-count")).toHaveText("RELEASED 대비 경고 0건");
    await expect(tid(page, "contract-diff-none")).toHaveText("RELEASED 버전과 계약이 같습니다.");
    await layout.layout(page, "ruleEdit 새 버전");
    await snap(page, "dme-ruleEdit-VER-01-new-version");
    watcher.assertClean("ruleEdit");
  });

  test("TC-DME-VER-02 새 버전 수정(U)·행 삭제(D) — 바뀐 칸이 강조되고, 값 테스트로 버전 1 과 편집본의 판정 차이를 본다", async () => {
    await dtEdit(page, v1Rows[1], `c${vGrd}_val`, "B2");
    await expect(dtCell(page, v1Rows[1], `c${vGrd}_val`)).toHaveClass(/cell-edited/);
    await tid(page, `dt-del-${v1Rows[0]}`).click();
    await tableButton(page, "표 저장").click();
    await expect(tid(page, "dt-dirty")).toHaveCount(0, { timeout: 30_000 });
    expect(await dtRowIds(page)).toEqual([v1Rows[1], v1Rows[2]]);
    await expect(tid(page, "dt-deleted-rows")).toHaveText(`base 대비 지운 행: row ${v1Rows[0]}`);
    await expect(dtCell(page, v1Rows[1], `c${vGrd}_val`)).toHaveClass(/cell-edited/);

    // 값 테스트 — 버전 1 은 B, 편집본(버전 2)은 B2.
    await tid(page, "vt-target").selectOption({ label: "버전 1 · RELEASED" });
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
    await cardButton(page, "rule-card-versions", "확정 이동").click();
    await expect(footerScreenId(page)).toHaveText("ruleConfirm", { timeout: 60_000 });
    await expect(tid(page, "rc-target")).toHaveText(`${RULE} 버전 2 · DECISION`, { timeout: 30_000 });
    await expect(tid(page, "rc-previous")).toHaveText(`직전 RELEASED 버전 1 · ${RELEASE1.date} 00:00:00`);
    await expect(tid(page, "rc-diff-counts")).toHaveText("추가 0 · 삭제 1 · 수정 1 · 같음 1");
    await expect(tid(page, `rc-diff-${v1Rows[0]}`)).toHaveAttribute("data-kind", "REMOVED");
    await expect(tid(page, `rc-diff-${v1Rows[1]}`)).toContainText("등급");
    await expect(tid(page, `rc-diff-${v1Rows[2]}`)).toHaveCount(0);
    await tid(page, "rc-diff-show-same").getByText("같은 행 보기").click();
    await expect(tid(page, `rc-diff-${v1Rows[2]}`)).toHaveAttribute("data-kind", "SAME");
    await expect(tid(page, "rc-contract")).toHaveAttribute("data-state", "NOT_CHECKED");

    await rcValidate(page, TOO_EARLY.input);
    await expect(tid(page, "rc-check-status-APPLY_FROM")).toHaveText("거부");
    await expect(tid(page, "rc-check-APPLY_FROM")).toHaveAttribute("data-rejected", "true");
    await expect(tid(page, "rc-check-APPLY_FROM")).toContainText(`직전 RELEASED 적용 시작 ${RELEASE1.date} 00:00:00`);
    await expect(tid(page, "rc-confirm")).toBeDisabled();
    await layout.layout(page, "ruleConfirm 적용 순서 거부");
    await snap(page, "dme-ruleConfirm-VER-03-rejected");
    watcher.assertClean("ruleConfirm");
  });

  test("TC-DME-VER-04 삭제(D) — 새 버전 DRAFT 를 삭제하면 확정 버전 1 만 남고 새 버전이 다시 켜진다", async () => {
    await openRule(page, RULE);
    await expect(tid(page, "rule-ver-select")).toHaveValue("2");
    await tid(page, "rule-ver-row-1").click();
    await expect(tid(page, "rule-ver-select")).toHaveValue("1", { timeout: 20_000 });
    await expect(cardButton(page, "rule-card-versions", "삭제")).toBeDisabled();
    await tid(page, "rule-ver-row-2").click();
    await expect(tid(page, "rule-ver-select")).toHaveValue("2", { timeout: 20_000 });
    // 삭제는 확인을 묻지 않고 바로 지운다(설계 §5.2 에 확인 단계가 없다 — 보고서 관찰).
    await cardButton(page, "rule-card-versions", "삭제").click();
    await expect(tid(page, "rule-ver-row-2")).toHaveCount(0, { timeout: 20_000 });
    await expect(tid(page, "rule-ver-select")).toHaveValue("1");
    await expect(cardButton(page, "rule-card-versions", "새 버전")).toBeEnabled();
    await expect(tid(page, "rule-unapplied-notice")).toHaveCount(0);
    expect(await dtRowIds(page)).toEqual(v1Rows);
    await expect(dtCell(page, v1Rows[1], `c${vGrd}_val`)).toHaveText("B");
    watcher.assertClean("ruleEdit");
  });

  test("TC-DME-VER-05 폐기 — [폐기]는 확인을 한 번 더 묻고 [취소]면 그대로, [폐기 확인]이면 폐기 상태가 되어 새 버전을 만들 수 없다", async () => {
    const header = "rule-card-header";
    await cardButton(page, header, "폐기").click();
    await expect(cardButton(page, header, "폐기 확인")).toBeVisible();
    await snap(page, "dme-ruleEdit-VER-05-deprecate-confirm");
    await cardButton(page, header, "취소").click();
    await expect(cardButton(page, header, "폐기 확인")).toHaveCount(0);
    await expect(tid(page, header)).toContainText("사용 중");

    await cardButton(page, header, "폐기").click();
    await cardButton(page, header, "폐기 확인").click();
    await expect(tid(page, header)).toContainText("폐기", { timeout: 20_000 });
    await expect(cardButton(page, header, "폐기")).toHaveCount(0);
    await expect(cardButton(page, "rule-card-versions", "새 버전")).toBeDisabled();
    await layout.layout(page, "ruleEdit 폐기 뒤");
    await snap(page, "dme-ruleEdit-VER-05-deprecated");
    await assertAllButtonsPressed(page, "ruleEdit(새 버전·삭제·폐기)", {
      "rule-group-headerVersions-toggle": "카드 묶음 접기는 장 A TC-DME-EDT-05 에서 누른다",
      "rule-group-valueTests-toggle": "카드 묶음 접기는 장 A TC-DME-EDT-05 에서 누른다",
      "rule-section-columns-toggle": "섹션 접기는 장 A TC-DME-EDT-05 에서 누른다",
      "contract-section-toggle": "섹션 접기는 장 A TC-DME-EDT-05 에서 누른다",
      "pivot-section-toggle": "섹션 접기는 장 A TC-DME-EDT-05 에서 누른다",
      "헤더 저장": "헤더 저장은 장 A TC-DME-EDT-02 에서 누른다",
    });
    watcher.assertClean("ruleEdit");
  });

  test("TC-DME-VER-06 폐기 반영 — 목록 상태 폐기 조건에서만 나오고 사용 중 조건에서는 빠진다", async () => {
    await go(page, "ruleMng");
    await searchRule(page, RULE, { status: "DEPRECATED" });
    await expect(ruleRow(page, RULE)).toHaveCount(1, { timeout: 20_000 });
    await expect(ruleCell(page, RULE, "status")).toHaveText("폐기");
    await expect(ruleCell(page, RULE, "releasedVer")).toHaveText("1");
    await searchRule(page, RULE, { status: "INUSE" });
    await expect(tid(page, "rule-list-empty")).toBeVisible({ timeout: 20_000 });
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
  const setOrder = () =>
    tid(page, "set-rules-grid")
      .locator('.ag-center-cols-container [data-testid^="set-rule-link-"]')
      .allTextContents();

  async function addToSet(id: string) {
    await tid(page, "set-rule-add-keyword").fill(id);
    await tid(page, "set-rule-add-find").click();
    await tid(page, `set-rule-cand-${id}`).click();
  }

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
    await confirmFromRuleEdit(page, SA, 1, daysAgo(10));
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
    await confirmFromRuleEdit(page, SB, 1, daysAgo(10));
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
    await expect(footerScreenId(page)).toHaveText("ruleSetEdit", { timeout: 60_000 });
    await expect(tid(page, "set-edit-current")).toHaveText(`${SET} · ${SET_NAME}`, { timeout: 30_000 });
    await expect(tid(page, "set-status")).toHaveText("INUSE");
    await expect(tid(page, "set-rules-empty")).toBeVisible();
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

  test("TC-DME-SED-01 세트 편집 화면 배치 — 세트 카드·구성 지침 카드가 보이고 빈 세트는 거부 검사가 보인다", async () => {
    await go(page, "ruleSetEdit");
    await resetClicks(page);
    await expect(breadcrumb(page)).toContainText("마루 MDM > 업무기준 > 룰 세트 편집");
    await expect(tid(page, "set-card")).toBeVisible();
    await expect(tid(page, "set-guide-card")).toBeVisible();
    await expect(tid(page, "set-card-id")).toHaveText(SET);
    await expect(tid(page, "set-row-version")).toHaveText(/^row_version \d+$/);
    await expect(tid(page, "set-save")).toBeDisabled();
    await expect(tid(page, "set-guide-run")).toBeDisabled();
    await layout.layout(page, "ruleSetEdit 빈 세트");
    await snap(page, "dme-ruleSetEdit-01-initial");
    watcher.assertClean("ruleSetEdit");
  });

  test("TC-DME-SED-02 룰 추가 — 순서가 거꾸로면 거부 검사·뒤에 있음·앞에 없음이 보이고 저장이 거부되며, 이미 담은 룰은 다시 담지 않는다", async () => {
    await addToSet(SB);
    await addToSet(SA);
    await expect.poll(setOrder).toEqual([SB, SA]);
    await expect(tid(page, "set-rules-empty")).toHaveCount(0);
    await expect(setChecks()).toContainText(`${SB}가 뒤에 도는 ${SA}의 결과 변수 ${GRD}를 읽는다. ${SA}를 ${SB} 앞으로 옮긴다`);
    await expect(tid(page, `set-dep-later-${SB}-${SA}`)).toHaveText("뒤에 있음");
    await expect(tid(page, "set-rules-grid")).toContainText("앞에 없음");
    await expect(tid(page, "set-rules-grid")).toContainText("DECISION · FIRST");
    // 같은 룰을 다시 담으면 안내만 하고 목록은 그대로다.
    await tid(page, `set-rule-cand-${SA}`).click();
    await expect(tid(page, "set-rule-add-notice")).toHaveText("이미 담은 룰이다");
    await expect.poll(setOrder).toEqual([SB, SA]);
    await layout.layout(page, "ruleSetEdit 순서 거부");
    await snap(page, "dme-ruleSetEdit-02-order-rejected");

    // 화면 검사의 거부는 저장 버튼을 막지 않는다 — 서버가 거부한다.
    await expect(tid(page, "set-save")).toBeEnabled();
    await tid(page, "set-save").click();
    await expect(setMessage()).toContainText("룰 세트 저장 검사를 통과하지 못했습니다", { timeout: 20_000 });
    expectOnly4xx(watcher, "ruleSetEdit 순서 거부 저장");
    await expect.poll(setOrder).toEqual([SB, SA]);
    watcher.assertClean("ruleSetEdit");
  });

  test("TC-DME-SED-03 수정(U) — ▲▼로 순서를 고치고 ✕로 뺐다 다시 담아 세트명·설명과 함께 저장하면 검사 통과·입출력 표가 맞다", async () => {
    await tid(page, `set-rule-up-${SA}`).click();
    await expect.poll(setOrder).toEqual([SA, SB]);
    await expect(setChecks()).toContainText("통과");
    await expect(tid(page, `set-dep-later-${SB}-${SA}`)).toHaveCount(0);
    await tid(page, `set-rule-down-${SA}`).click();
    await expect.poll(setOrder).toEqual([SB, SA]);
    await tid(page, `set-rule-up-${SA}`).click();
    await expect.poll(setOrder).toEqual([SA, SB]);
    await tid(page, `set-rule-remove-${SB}`).click();
    await expect.poll(setOrder).toEqual([SA]);
    await addToSet(SB);
    await expect.poll(setOrder).toEqual([SA, SB]);

    // 입출력 — 입력은 표면 하나, 결과는 계수(최종)·등급(중간).
    await expect(tid(page, "set-io-inputs")).toContainText("입력 변수 1개");
    await expect(tid(page, `set-io-input-${SURF}`)).toBeVisible();
    await expect(tid(page, "set-io-results")).toContainText("결과 변수 2개 · 최종 1개, 중간 1개");
    await expect(tid(page, `set-io-result-${FCT}`)).toContainText("최종");
    await expect(tid(page, `set-io-result-${GRD}`)).toContainText("중간");

    await tid(page, "set-name").fill(`${SET_NAME} 수정`);
    await tid(page, "set-desc").fill("E2E 표면 → 등급 → 계수");
    await tid(page, "set-save").click();
    await expect(setMessage()).toContainText(/저장 · row_version \d+/, { timeout: 20_000 });
    await expect(tid(page, "set-save")).toBeDisabled();
    await expect(tid(page, "set-edit-current")).toHaveText(`${SET} · ${SET_NAME} 수정`);
    await layout.layout(page, "ruleSetEdit 저장 뒤");
    await snap(page, "dme-ruleSetEdit-03-saved");
    watcher.assertClean("ruleSetEdit");
  });

  test("TC-DME-SED-04 조회(R) — 세트를 찾아 다시 열면 저장한 목록이 남고, 구성 지침은 결과 변수에서 순서를 제안한다", async () => {
    await tid(page, "set-pick-keyword").fill(`${SET}_NONE`);
    await tid(page, "set-edit-topbar").getByRole("button", { name: "찾기", exact: true }).click();
    await expect(tid(page, "set-pick-list")).toHaveText("찾은 세트가 없다", { timeout: 20_000 });
    await tid(page, "set-pick-keyword").fill(SET);
    await tid(page, "set-pick-keyword").press("Enter");
    await tid(page, `set-pick-${SET}`).click();
    await expect(tid(page, "set-edit-current")).toHaveText(`${SET} · ${SET_NAME} 수정`, { timeout: 20_000 });
    await expect.poll(setOrder).toEqual([SA, SB]);
    await expect(tid(page, "set-desc")).toHaveValue("E2E 표면 → 등급 → 계수");

    // 지침: 목록을 거꾸로 돌려 놓고 계수에서 거슬러 찾은 순서를 적용하면 SA → SB 가 된다.
    await tid(page, `set-rule-down-${SA}`).click();
    await expect.poll(setOrder).toEqual([SB, SA]);
    await tid(page, "set-guide-var").fill(FCT);
    await tid(page, "set-guide-run").click();
    await expect(tid(page, "set-guide-order")).toContainText(`제안 순서 · 1. ${SA} → 2. ${SB}`, { timeout: 20_000 });
    await tid(page, "set-guide-apply").click();
    await expect.poll(setOrder).toEqual([SA, SB]);
    await expect(setChecks()).toContainText("통과");
    await snap(page, "dme-ruleSetEdit-04-guide");
    watcher.assertClean("ruleSetEdit");
  });

  test("TC-DME-SED-05 폐기·되살리기 — [폐기]는 경고와 확인을 한 번 더 묻고, 폐기하면 편집이 막히며 되살리면 사용 중으로 돌아온다", async () => {
    await tid(page, "set-deprecate").click();
    await expect(setMessage()).toContainText("폐기하면 이 세트를 부르는 호출은 판정 오류가 난다.");
    await tid(page, "set-card").getByRole("button", { name: "취소", exact: true }).click();
    await expect(tid(page, "set-deprecate-confirm")).toHaveCount(0);
    await expect(tid(page, "set-status")).toHaveText("INUSE");

    await tid(page, "set-deprecate").click();
    await tid(page, "set-deprecate-confirm").click();
    await expect(tid(page, "set-status")).toHaveText("DEPRECATED", { timeout: 20_000 });
    await expect(setMessage()).toContainText(/폐기 · row_version \d+\. 행은 남기고 되살릴 수 있다/);
    await expect(tid(page, "set-name")).toBeDisabled();
    await expect(tid(page, "set-rule-add-find")).toBeDisabled();
    await expect(tid(page, `set-rule-up-${SB}`)).toHaveCount(0);
    await expect(tid(page, "set-guide-apply")).toBeDisabled();
    await layout.layout(page, "ruleSetEdit 폐기 뒤");
    await snap(page, "dme-ruleSetEdit-05-deprecated");

    await tid(page, "set-restore").click();
    await expect(tid(page, "set-status")).toHaveText("INUSE", { timeout: 20_000 });
    await expect(setMessage()).toContainText(/되살림 · row_version \d+/);
    await expect(tid(page, "set-name")).toBeEnabled();
    await assertAllButtonsPressed(page, "ruleSetEdit", {
      [`set-var-link-${GRD}`]: "결과 변수 링크는 다음 TC-DME-SED-06 에서 누른다(누르면 룰 화면으로 옮겨 간다)",
      [`set-var-link-${FCT}`]: "결과 변수 링크는 다음 TC-DME-SED-06 에서 누른다(누르면 룰 화면으로 옮겨 간다)",
    });
    watcher.assertClean("ruleSetEdit");
  });

  test("TC-DME-SED-06 화면 연결 — 세트의 룰 링크·결과 변수 링크로 룰 화면이 열리고, 활용처 카드에 세트와 의존 룰이 보인다", async () => {
    await tid(page, `set-rule-link-${SA}`).click();
    await expect(footerScreenId(page)).toHaveText("ruleEdit", { timeout: 60_000 });
    await expect(tid(page, "rule-edit-current")).toHaveText(SA, { timeout: 30_000 });
    const usage = tid(page, "rule-usage-sets");
    await expect(usage).toContainText(SET);
    await expect(usage).toContainText(`${SET_NAME} 수정`);
    await expect(tid(page, `rule-usage-link-${SB}`)).toBeVisible();
    await tid(page, "rule-card-usage").scrollIntoViewIfNeeded();
    await layout.layout(page, "ruleEdit 활용처");
    await snap(page, "dme-ruleEdit-SED-06-usage");
    // 역의존 룰 링크 → SB, SB 의 의존 룰 링크 → SA.
    await tid(page, `rule-usage-link-${SB}`).click();
    await expect(tid(page, "rule-edit-current")).toHaveText(SB, { timeout: 30_000 });
    await tid(page, `rule-usage-link-${SA}`).click();
    await expect(tid(page, "rule-edit-current")).toHaveText(SA, { timeout: 30_000 });

    // 세트 편집의 결과 변수 링크 → 그 변수를 만드는 룰.
    await go(page, "ruleSetEdit");
    await tid(page, `set-var-link-${FCT}`).click();
    await expect(footerScreenId(page)).toHaveText("ruleEdit", { timeout: 60_000 });
    await expect(tid(page, "rule-edit-current")).toHaveText(SB, { timeout: 30_000 });
    await go(page, "ruleSetEdit");
    await tid(page, `set-var-link-${GRD}`).click();
    await expect(tid(page, "rule-edit-current")).toHaveText(SA, { timeout: 30_000 });
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
    await expect(row).toHaveCount(1, { timeout: 20_000 });
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
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await search({ rv: GRD });
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await search({ keyword: SET, status: "INUSE" });
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await search({ keyword: SET, status: "DEPRECATED" });
    await expect(tid(page, "set-list-empty")).toHaveText("조건에 맞는 룰 세트가 없다", { timeout: 20_000 });
    await search({ rv: `E2E_NO_SUCH_${RUN}` });
    await expect(tid(page, "set-list-empty")).toBeVisible({ timeout: 20_000 });
    await expect(panelCount(page)).toHaveText("0건");
    await layout.layout(page, "ruleSetMng 빈 목록");
    await tid(page, "set-search-var").press("Enter");
    await assertAllButtonsPressed(page, "ruleSetMng");

    await search({ keyword: SET });
    await row.locator(`[data-testid="set-link-${SET}"]`).click();
    await expect(footerScreenId(page)).toHaveText("ruleSetEdit", { timeout: 60_000 });
    await expect(tid(page, "set-edit-current")).toContainText(SET, { timeout: 20_000 });
    watcher.assertClean("ruleSetMng");
  });

  test("TC-DME-SMN-06 담은 룰을 폐기하면 세트 검사가 거부로 바뀌고, 세트를 폐기하면 거부 때문에 되살릴 수 없다", async () => {
    await openRule(page, SA);
    await cardButton(page, "rule-card-header", "폐기").click();
    await cardButton(page, "rule-card-header", "폐기 확인").click();
    await expect(tid(page, "rule-card-header")).toContainText("폐기", { timeout: 20_000 });

    await go(page, "ruleSetEdit");
    await tid(page, "set-pick-keyword").fill(SET);
    await tid(page, "set-pick-keyword").press("Enter");
    await tid(page, `set-pick-${SET}`).click();
    await expect(setChecks()).toContainText(`${SA}는 DEPRECATED다`, { timeout: 20_000 });

    // 세트 폐기 → 되살리기는 서버가 검사를 다시 돌려 거부한다.
    await tid(page, "set-deprecate").click();
    await tid(page, "set-deprecate-confirm").click();
    await expect(tid(page, "set-status")).toHaveText("DEPRECATED", { timeout: 20_000 });
    await tid(page, "set-restore").click();
    await expect(setMessage()).toContainText("룰 세트 저장 검사를 통과하지 못했습니다", { timeout: 20_000 });
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
    await expect(row).toHaveCount(1, { timeout: 20_000 });
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
        await tid(page, "rule-reg-id").fill(id);
        await tid(page, "rule-reg-name").fill(`E2E 연결 ${RUN}`);
        await tid(page, "rule-register-form").getByRole("button", { name: "룰 등록", exact: true }).click();
        await expect(footerScreenId(page)).toHaveText("ruleEdit", { timeout: 60_000 });
        await expect(tid(page, "rule-edit-current"), "넘겨받은 룰").toHaveText(id, { timeout: 30_000 });
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
      await tid(page, "rule-reg-id").fill(id);
      await tid(page, "rule-reg-name").fill(`E2E 넘기기 ${RUN}`);
      await tid(page, "rule-register-form").getByRole("button", { name: "룰 등록", exact: true }).click();
      await expect(tid(page, "rule-edit-current")).toHaveText(id, { timeout: 60_000 });
      // 넘겨받는 사람의 담당자 여부를 확인할 수단이 없어(서버가 늘 MDM005) 받는 사람 칸과 버튼을 꺼 두었다.
      await expect(tid(page, "rule-handover-target")).toBeDisabled();
      await expect(cardButton(page, "rule-card-versions", HANDOVER)).toBeDisabled();
      await expect(tid(page, "rule-handover-wrap")).toHaveAttribute("title", HANDOVER_PENDING);
      await expect(topbar(page)).toContainText("편집 중(나)");
      await snap(page, "dme-ruleEdit-HND-01-pending");
      await openRule(other.page, id);
      await expect(topbar(other.page)).toContainText(`잠김 · ${STW} 편집 중`);
      await expect(cardButton(other.page, "rule-card-versions", HANDOVER)).toBeDisabled();
      watcher.assertClean("ruleEdit");
      other.watcher.assertClean("ruleEdit(stw2)");
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
      await expect(tid(other.page, "dt-dirty")).toHaveCount(0, { timeout: 30_000 });
      other.watcher.assertClean("ruleEdit(다른 창)");

      // 이 창은 옛 row_version 을 들고 있다.
      await dtEdit(page, ids[1], "note", "이 창이 늦게 고침");
      await tableButton(page, "표 저장").click();
      await expectErrorModal(page, "다른 창에서 바뀌었습니다. 다시 불러오세요", "dme-ruleEdit-CFL-01-conflict");
      expectOnly4xx(watcher, "ruleEdit 충돌");
      await topbar(page).getByRole("button", { name: "다시 불러오기", exact: true }).click();
      await expect(topbar(page).getByRole("button", { name: "다시 불러오기", exact: true })).toHaveCount(0, { timeout: 20_000 });
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
      await expect(tid(page, "dt-dirty")).toHaveCount(0, { timeout: 30_000 });
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
    const owner = await openAs(browser, "stw", testInfo);
    try {
      await go(owner.page, "ruleMng");
      await tid(owner.page, "rule-reg-id").fill(rule);
      await tid(owner.page, "rule-reg-name").fill(`E2E 읽기전용 ${RUN}`);
      await tid(owner.page, "rule-register-form").getByRole("button", { name: "룰 등록", exact: true }).click();
      await expect(tid(owner.page, "rule-edit-current")).toHaveText(rule, { timeout: 60_000 });
      await go(owner.page, "ruleSetMng");
      await tid(owner.page, "set-reg-id").fill(set);
      await tid(owner.page, "set-reg-name").fill(`E2E 읽기전용 세트 ${RUN}`);
      await tid(owner.page, "set-reg-save").click();
      await expect(tid(owner.page, "set-edit-current")).toContainText(set, { timeout: 60_000 });
      await addToSetOn(owner.page, rule);
      owner.watcher.assertClean("dme(stw)");
    } finally {
      await owner.page.context().close();
    }

    const { page, watcher } = await openAs(browser, "std", testInfo);
    try {
      // ruleMng — 조회는 되고(권한 조회가 끝났다는 뜻) 등록은 꺼져 있다.
      await go(page, "ruleMng");
      await expect(button(page, "조회")).toBeEnabled({ timeout: 30_000 });
      await searchRule(page, rule);
      await expect(ruleRow(page, rule)).toHaveCount(1, { timeout: 20_000 });
      await tid(page, "rule-reg-id").fill(`${rule}_X`);
      await tid(page, "rule-reg-name").fill("권한 없음");
      await expect(tid(page, "rule-register-form").getByRole("button", { name: "룰 등록", exact: true })).toBeDisabled();
      await snap(page, "dme-ro-ruleMng");

      // ruleEdit — 헤더·버전·표·열 설정·값 테스트가 모두 막힌다.
      await openRule(page, rule);
      await expect(topbar(page)).toContainText(`잠김 · ${STW} 편집 중`);
      await expect(tid(page, "rule-header-name")).toBeDisabled();
      await expect(cardButton(page, "rule-card-header", "헤더 저장")).toBeDisabled();
      for (const b of ["새 버전", "삭제", "해제", HANDOVER]) await expect(cardButton(page, "rule-card-versions", b), `${b}(std)`).toBeDisabled();
      await expect(cardButton(page, "rule-card-versions", "선점")).toHaveCount(0);
      await expect(tableButton(page, "행 추가")).toBeDisabled();
      await expect(tid(page, "col-readonly")).toBeVisible();
      await expect(tid(page, "col-add-cond")).toHaveCount(0);
      // 대상 정의를 받은 뒤(열 없는 룰이라 "입력 변수가 없습니다" 가 보인 뒤)에 본다 — 받기 전에는 권한과 무관하게 꺼져 있다.
      await expect(tid(page, "vt-no-input")).toBeVisible({ timeout: 20_000 });
      await expect(vtCard(page).getByRole("button", { name: "돌리기", exact: true })).toBeDisabled();
      await snap(page, "dme-ro-ruleEdit");

      // ruleConfirm — 남의 DRAFT 를 골라도 검사·확정이 꺼져 있다.
      await go(page, "ruleConfirm");
      await tid(page, "rc-keyword").fill(rule);
      await tid(page, "rc-search").click();
      await tid(page, `rc-row-${rule}-1`).click();
      await expect(tid(page, "rc-target")).toContainText(rule, { timeout: 20_000 });
      await expect(tid(page, "rc-validate")).toBeDisabled();
      await expect(tid(page, "rc-confirm")).toBeDisabled();
      await snap(page, "dme-ro-ruleConfirm");

      // ruleSetMng — 등록 저장이 꺼져 있다.
      await go(page, "ruleSetMng");
      await expect(button(page, "조회")).toBeEnabled();
      await tid(page, "set-reg-id").fill(`${set}_X`);
      await tid(page, "set-reg-name").fill("권한 없음");
      await expect(tid(page, "set-reg-save")).toBeDisabled();

      // ruleSetEdit — 보기는 되고 세트명·룰 추가·폐기·저장·지침 적용이 막힌다.
      await go(page, "ruleSetEdit");
      await tid(page, "set-pick-keyword").fill(set);
      await tid(page, "set-pick-keyword").press("Enter");
      await tid(page, `set-pick-${set}`).click();
      await expect(tid(page, "set-card-id")).toHaveText(set, { timeout: 20_000 });
      await expect(tid(page, `set-rule-link-${rule}`)).toBeVisible();
      await expect(tid(page, "set-name")).toBeDisabled();
      await expect(tid(page, "set-rule-add-find")).toBeDisabled();
      await expect(tid(page, "set-deprecate")).toBeDisabled();
      await expect(tid(page, "set-save")).toBeDisabled();
      await expect(tid(page, `set-rule-up-${rule}`)).toHaveCount(0);
      await snap(page, "dme-ro-ruleSetEdit");
      watcher.assertClean("dme(std)");
    } finally {
      await page.context().close();
    }
  });
});

/** 세트 편집 화면에서 룰 하나를 담아 저장한다(장 D 준비). */
async function addToSetOn(page: Page, id: string) {
  await tid(page, "set-rule-add-keyword").fill(id);
  await tid(page, "set-rule-add-find").click();
  await tid(page, `set-rule-cand-${id}`).click();
  await tid(page, "set-save").click();
  await expect(tid(page, "set-message")).toContainText(/저장 · row_version \d+/, { timeout: 20_000 });
}
