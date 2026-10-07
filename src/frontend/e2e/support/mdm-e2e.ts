import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

import { T } from "./common";
import { gridRowById } from "./grid";
import { compareFirstColumn, connectStringFromEnv, detectFixtureUser, query, runSqlFile } from "./oracle";

/**
 * 마루 MDM 화면 스펙(e2e/mdm-*.spec.ts) 공용 도우미. 사용자 여정(e2e/mdm-user)은 자기 support.ts 를 쓴다.
 *
 * 접속(oracle-1007) — mdm 백엔드와 같은 Oracle PDB 에 node-oracledb(thin, support/oracle.ts)로 붙는다. 환경 변수는 oracle.ts 와 같다.
 *   DMES_ORA_URL        jdbc:oracle:thin:@//localhost:1521/L_ORA_MDM (없으면 DMES_ORA_HOST·DMES_ORA_PORT·DMES_ORA_PDB 로 만든다)
 *   DMES_ORA_PASSWORD   스키마 사용자 비밀번호(기본 dmes_password_123)
 *   DMES_E2E_ALLOW_PDB  접속 PDB 이름을 그대로 적어 내 것임을 확인한다(필수 — 예: L_ORA_MDM 또는 시험 PDB 복제본 T_ORA_MDM). 대소문자는 가리지 않는다.
 *                       `T_<레인>` 도 Gradle 이 시험 중이거나 곧 지울 다른 레인의 것일 수 있어 적어야 한다. 허용되는 것은 여기에 적은 `T_*` 또는 `L_*` 한 개뿐이다.
 * 스키마 사용자는 env 로 주지 않는다 — 픽스처 파일 머리 주석의 대상(MDMAPUSER·MCMAPUSER)을 읽어 그 사용자로 접속한다.
 * 옛 SMOKE_MDM_DB(mdm.db 파일 경로)와 sqlite3 CLI 는 쓰지 않는다. 서버(mcm·mdm)도 같은 PDB 를 바라보게 띄운다.
 *
 * 접속 대상 안전 — DMES_E2E_ALLOW_PDB 와 같은 `T_*`·`L_*` 가 아니면 픽스처를 넣지 않는다(guardTarget). FREEPDB1·TPL_*·PDB$SEED·CDB$ROOT 는
 * 지정해도 거부하고, 남의 `T_*`·`L_*` 는 지정하지 않으니 막힌다. 파일 머리 주석의 대상 사용자와 접속 사용자가 다를 때 oracle.ts 의 checkTarget 이 막는 것은
 * 사용자를 고정해 부르는 verifyMdmRbacSeed(MCMAPUSER)뿐이다 — loadMdmFixture 는 접속 사용자를 같은 파일에서 뽑으므로 늘 같다.
 *
 * 잠금 대기 — oracle.ts 의 연결은 호출 시간 제한(node-oracledb callTimeout)을 받지 않는다. 다른 세션이 행 잠금을 쥐면 끝없이 기다릴 수 있으므로
 * 상한은 스펙 setTimeout(beforeAll 은 test.setTimeout·설정의 timeout 을 따른다)이다. 옛 sqlite3 `.timeout 10000` 에 해당하는 값은 없다.
 *
 * Oracle 실행은 PC 전체에서 한 번에 하나다(scripts/oracle/README.md). 이 파일의 픽스처 투입은 가벼워 잠금을 따로 잡지 않으니,
 * E2E 를 도는 레인 세션이 실행 전체를 PC 잠금 아래에서 돌린다.
 *
 * 픽스처 — 각 스펙이 자기 mdm 픽스처를 beforeAll 에서 스스로 넣는다. 서버 기동 때 모든 픽스처를 미리 넣으면
 * 파일 이름순으로 먼저 도는 스펙의 전제(예: columnMng 의 "COIL_THK 컬럼이 아직 없다")가 깨진다.
 * 그래서 실행 절차는 mcm 픽스처(시험 사용자 mdm-rbac-users.sql·mdm-ruleEdit-users.sql, MCMAPUSER)만 넣고, mdm 픽스처는 그 픽스처를 쓰는 첫 스펙이 넣는다.
 * 여러 스펙이 같은 파일을 쓰므로 이미 들어 있으면(행의 C_PGM_ID = 파일 이름) 다시 넣지 않는다.
 * 앞 스펙이 고친 행을 되돌리지 않는다는 뜻이다 — 스펙끼리 같은 행을 고치지 않게 픽스처를 나눈다.
 * 파일 하나는 한 트랜잭션이다(첫 오류에서 멈추고 롤백 — 일부만 들어가지 않는다).
 */

const FIXTURE_DIR = path.resolve(__dirname, "../fixtures");

/**
 * 이미 들어 있는지 볼 표. 그 파일이 넣는 행은 C_PGM_ID 에 파일 이름을 적는다(MDMAPUSER 표).
 * 여기에 없는 파일은 늘 다시 넣는다 — 멱등(NOT EXISTS)이거나 스스로 지우고 다시 넣는 파일만 뺀다.
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

let targetChecked = false;

/**
 * 접속 PDB 가 시험·레인 E2E 용인지 확인한다(프로세스당 한 번). 서비스 이름이 `T_*`(시험 PDB) 또는 `L_*`(레인 PDB) 이면서 DMES_E2E_ALLOW_PDB 와 대소문자 무시로 같을 때만 통과한다.
 * FREEPDB1·TPL_*·PDB$SEED·CDB$ROOT 는 지정해도 던지고, 허용을 적지 않은 `T_*`·`L_*`(다른 레인의 것일 수 있다)도 던진다. oracle.ts 에는 PDB 이름 검사가 없어 여기에 둔다.
 */
function guardTarget(): void {
  if (targetChecked) return;
  const cs = connectStringFromEnv();
  const service = cs.slice(cs.lastIndexOf("/") + 1).toUpperCase();
  const allow = (process.env.DMES_E2E_ALLOW_PDB ?? "").trim().toUpperCase();
  const ok = /^[TL]_/.test(service) && service === allow;
  if (!ok) {
    throw new Error(
      `E2E 픽스처를 넣을 수 없는 대상이다: ${cs} — 시험 PDB(T_*) 또는 내 레인 PDB(L_*)이면서 DMES_E2E_ALLOW_PDB=${service} 로 확인해야 한다. FREEPDB1·TPL_*·PDB$SEED·CDB$ROOT·남의 T_*/L_* 에는 넣지 않는다`,
    );
  }
  targetChecked = true;
}

/**
 * e2e/fixtures/<file> 을 접속 PDB 에 넣는다. 대상 사용자는 파일 머리 주석(MDMAPUSER·MCMAPUSER)으로 정하고, 한 파일은 한 트랜잭션이다.
 * 이미 들어 있으면 건너뛴다(LOADED_PROBE). 스펙의 test.beforeAll 에서 부른다(Promise 를 돌려주므로 `() => loadMdmFixture(...)` 로 쓴다).
 */
export async function loadMdmFixture(...files: string[]): Promise<void> {
  guardTarget();
  for (const file of files) {
    const full = path.join(FIXTURE_DIR, file);
    const user = detectFixtureUser(readFileSync(full, "utf8"));
    if (!user) throw new Error(`${file} 머리 주석에 대상 스키마 사용자(MDMAPUSER·MCMAPUSER)가 없다`);
    const probe = LOADED_PROBE[file];
    if (probe) {
      let rows: { CNT: number }[];
      try {
        rows = await query<{ CNT: number }>(user, `SELECT COUNT(*) AS CNT FROM ${probe} WHERE C_PGM_ID = :1`, [file]);
      } catch (e) {
        throw new Error(`${file} 투입 여부 조회(${probe}) 실패: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
      }
      if (Number(rows[0]?.CNT ?? 0) > 0) continue;
    }
    await runSqlFile(user, full, { checkTarget: true });
  }
}

/**
 * mcm 의 MDM 메뉴·RBAC 시드를 mdm-rbac-seed-check.sql 의 SELECT 6개로 읽어 .expected.txt 와 글자 그대로 비교한다. 다르면 두 쪽을 담아 던진다.
 * 마지막 SELECT(e2e 사용자 0명)는 mdm-rbac-users.sql 을 넣기 **전**에만 참이다 — 새 mcm 기동 직후, 시험 사용자를 넣기 전에 부른다.
 */
export async function verifyMdmRbacSeed(): Promise<void> {
  guardTarget();
  const { selects } = await runSqlFile("MCMAPUSER", path.join(FIXTURE_DIR, "mdm-rbac-seed-check.sql"), { checkTarget: true });
  const r = compareFirstColumn(selects.flat(), path.join(FIXTURE_DIR, "mdm-rbac-seed-check.expected.txt"));
  if (!r.equal) throw new Error(`mdm-rbac-seed-check 불일치\n--- 기대 ---\n${r.expected}\n--- 실제 ---\n${r.actual}`);
}

/**
 * 목록 화면의 [조회] 를 누른다. MDM 목록 화면은 처음 열 때 목록을 자동 조회하지 않는다(cf4fbb05, 2026-10-02 —
 * 의도된 제품 변경). 결과는 부르는 쪽이 목록 행이나 빈 상태로 확인한다(같은 search URL 을 진입 때 optionsOnly 로도
 * 부르는 화면이 있어 응답 URL 만으로 기다리면 진입 응답을 잡을 수 있다).
 */
export async function clickSearch(scope: Page | Locator) {
  const button = scope.getByRole("button", { name: "조회", exact: true });
  await expect(button).toBeEnabled({ timeout: T.UI });
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
  const cell = gridRowById(root, rowId).locator(`.ag-cell[col-id="${colId}"]`);
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
