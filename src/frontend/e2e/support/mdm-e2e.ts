import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

/**
 * 마루 MDM 화면 스펙(e2e/mdm-*.spec.ts) 공용 도우미. 사용자 여정(e2e/mdm-user)은 자기 support.ts 를 쓴다.
 *
 * 픽스처 — 각 스펙이 자기 mdm 픽스처를 beforeAll 에서 스스로 넣는다. 서버 기동 때 모든 픽스처를 미리 넣으면
 * 파일 이름순으로 먼저 도는 스펙의 전제(예: columnMng 의 "COIL_THK 컬럼이 아직 없다")가 깨진다.
 * 그래서 실행 절차는 mcm 픽스처(시험 사용자)만 넣고, mdm 픽스처는 그 픽스처를 쓰는 첫 스펙이 넣는다.
 * 여러 스펙이 같은 파일을 쓰므로 이미 들어 있으면(행의 C_PGM_ID = 파일 이름) 다시 넣지 않는다.
 * 앞 스펙이 고친 행을 되돌리지 않는다는 뜻이다 — 스펙끼리 같은 행을 고치지 않게 픽스처를 나눈다.
 */

const FIXTURE_DIR = path.resolve(__dirname, "../fixtures");

/**
 * 이미 들어 있는지 볼 표. 그 파일이 넣는 행은 C_PGM_ID 에 파일 이름을 적는다.
 * 여기에 없는 파일은 늘 다시 넣는다 — 멱등(INSERT OR IGNORE·NOT EXISTS)이거나 스스로 지우고 다시 넣는 파일만 뺀다.
 */
const LOADED_PROBE: Record<string, string> = {
  "mdm-codeConfirm.sql": "TB_MDM_CODE",
  "mdm-codeItemEdit.sql": "TB_MDM_CODE",
  "mdm-codeCateEdit.sql": "TB_MDM_CODE",
  "mdm-columnMng-dict.sql": "TB_MDM_TERM",
  "mdm-dataItem.sql": "TB_MDM_DATA",
  "mdm-dataMng.sql": "TB_MDM_DATA",
  "mdm-layout-m201.sql": "TB_MDM_LAYOUT",
  "mdm-ruleEdit-data.sql": "TB_MDM_RULE",
  "mdm-ruleSet-data.sql": "TB_MDM_RULE_SET",
  // mdm-ruleConfirm-data.sql 은 E2E_RC_* 를 지우고 다시 넣는 파일이라 늘 다시 넣는다(처음 상태로 돌린다).
};

function mdmDb(): string {
  const db = process.env.SMOKE_MDM_DB;
  if (!db) throw new Error("SMOKE_MDM_DB 에 워크트리 mdm.db 경로를 넣는다(docs/mdm/tasks/TSK-05-02/design.md §3.7)");
  return db;
}

/** sqlite3 로 한 줄 질의(백엔드가 DB 를 열고 있으므로 잠금은 기다린다). */
function query(db: string, sql: string): string {
  return execFileSync("sqlite3", ["-cmd", ".timeout 10000", db, sql], { encoding: "utf8" }).trim();
}

/**
 * e2e/fixtures/<file> 을 SMOKE_MDM_DB 에 넣는다. 한 트랜잭션으로, 첫 오류에서 멈춘다(-bail — 일부만 들어가지 않게).
 * 이미 들어 있으면 건너뛴다(LOADED_PROBE). 스펙의 test.beforeAll 에서 부른다.
 */
export function loadMdmFixture(...files: string[]) {
  const db = mdmDb();
  for (const file of files) {
    const probe = LOADED_PROBE[file];
    if (probe && Number(query(db, `SELECT COUNT(*) FROM ${probe} WHERE C_PGM_ID = '${file}'`)) > 0) continue;
    const sql = readFileSync(path.join(FIXTURE_DIR, file), "utf8");
    execFileSync("sqlite3", ["-bail", db], { input: `.timeout 10000\nBEGIN IMMEDIATE;\n${sql}\nCOMMIT;\n` });
  }
}

/**
 * 목록 화면의 [조회] 를 누른다. MDM 목록 화면은 처음 열 때 목록을 자동 조회하지 않는다(cf4fbb05, 2026-10-02 —
 * 의도된 제품 변경). 결과는 부르는 쪽이 목록 행이나 빈 상태로 확인한다(같은 search URL 을 진입 때 optionsOnly 로도
 * 부르는 화면이 있어 응답 URL 만으로 기다리면 진입 응답을 잡을 수 있다).
 */
export async function clickSearch(scope: Page | Locator) {
  const button = scope.getByRole("button", { name: "조회", exact: true });
  await expect(button).toBeEnabled({ timeout: 20_000 });
  await button.click();
}

/**
 * 확정 화면의 적용 시작 일시 칸(shared DateTimePicker, 6e506cc9)에 값을 넣는다. 칸은 `yyyy-MM-dd HH:mm:ss`(초까지)만
 * 값으로 받고, 해석되지 않는 글자(옛 datetime-local 형식 `yyyy-MM-ddTHH:mm` 등)는 버린다. Enter 로 확정하고 팝업을 닫는다.
 */
export async function fillDateTime(input: Locator, value: string) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) throw new Error(`yyyy-MM-dd HH:mm:ss 형식이 아니다: ${value}`);
  await input.fill(value);
  await input.press("Enter");
  await expect(input).toHaveValue(value);
}

/**
 * ag-grid 행의 한 칸을 확인한다. 목록 패널이 열 폭 합보다 좁으면 ag-grid 는 화면 밖 열의 칸을 DOM 에 그리지 않는다
 * (열 가상화) — 그때는 사용자처럼 그리드를 가로로 굴려 그 열을 드러낸 뒤 확인하고, 다시 왼쪽 끝으로 돌려 놓는다
 * (이름 칸으로 행을 찾는 다음 단계가 깨지지 않게). 행은 row-id 로 다시 잡는다(굴리면 이름 칸이 빠질 수 있다).
 */
export async function expectRowCell(
  row: Locator,
  colId: string,
  expected: string | RegExp,
  opts: { contains?: boolean; timeout?: number } = {},
) {
  const timeout = opts.timeout ?? 10_000;
  await expect(row).toBeVisible({ timeout });
  const rowId = await row.getAttribute("row-id");
  if (rowId === null) throw new Error("ag-grid 행에 row-id 가 없다");
  const root = row.locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' ag-root-wrapper ')][1]");
  const cell = root.locator(`.ag-center-cols-container .ag-row[row-id="${rowId}"] .ag-cell[col-id="${colId}"]`);
  const viewport = root.locator(".ag-center-cols-viewport");
  let scrolled = false;
  if ((await cell.count()) === 0) {
    scrolled = true;
    await expect(async () => {
      await viewport.evaluate((el) => {
        el.scrollLeft = Math.min(el.scrollWidth, el.scrollLeft + Math.max(80, el.clientWidth / 2));
      });
      await expect(cell).toHaveCount(1, { timeout: 500 });
    }).toPass({ timeout });
  }
  if (opts.contains) await expect(cell).toContainText(expected, { timeout });
  else await expect(cell).toHaveText(expected, { timeout });
  if (scrolled) await viewport.evaluate((el) => { el.scrollLeft = 0; });
}

/**
 * ag-grid 가로 가상화로 아직 그려지지 않은 열을 드러낸다 — 그 열 머리가 DOM 에 생길 때까지 그리드를 왼쪽 끝부터
 * 오른쪽으로 굴린다(사용자가 가로 스크롤로 그 열까지 가는 것과 같다). 이미 그려져 있으면 굴리지 않는다.
 */
export async function revealGridColumn(grid: Locator, colId: string, timeout = 10_000) {
  const header = grid.locator(`.ag-header-cell[col-id="${colId}"]`);
  if ((await header.count()) > 0) return;
  const viewport = grid.locator(".ag-center-cols-viewport").first();
  await viewport.evaluate((el) => { el.scrollLeft = 0; });
  await expect(async () => {
    if ((await header.count()) === 0) {
      await viewport.evaluate((el) => {
        el.scrollLeft = Math.min(el.scrollWidth, el.scrollLeft + Math.max(80, el.clientWidth / 2));
      });
    }
    await expect(header).toHaveCount(1, { timeout: 500 });
  }).toPass({ timeout });
}
