import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { BASE_URL, T, login, walkMenuPath, type LoginOptions } from "./support/common";
import { loadMdmFixture } from "./support/mdm-e2e";
import { gridRowById } from "./support/grid";

/**
 * mdm dmd/dataCsvUploadPop(항목 CSV 업로드 팝업) smoke — TSK-07-04 design.md §3(e2e 스모크 넷).
 *
 * `dataCsvUploadPop` 은 독립 화면이 아니라 `dataItemMng`(항목 편집) 화면이 여는 팝업이다(D2) — 이 스펙도 그 화면으로
 * 이동해 [항목] 탭 그리드 패널 머리의 "CSV 업로드" 버튼(testid `item-csv-upload`, D-104 로 상단 바에서 옮겨 옴)으로 연다. 파싱·검증은 서버에서만 한다(D3) — 화면은 `FileReader` 로 원문만 넘긴다.
 *
 * 스모크 넷:
 *   C1 메뉴 이동 — `dataItemMng` 화면으로 이동해 "CSV 업로드" 버튼으로 팝업을 연다.
 *   C2 목록 채워짐·빈 상태 — 헤더만 있는(0행) CSV 를 검증하면 결과가 나오되 모두 0(빈 상태)이다.
 *   C3 화면 조작만으로 저장 1회 반영 — 오류 0건 CSV 를 저장하면 팝업이 닫히고 `dataItemMng` 목록에 반영된다.
 *   C4 서버 오류 노출 — 키 패턴을 어긴 행이 있으면 그 줄만 오류로 표시되고(I7) 저장 버튼이 비활성된다.
 *
 * 픽스처: `e2e/fixtures/mdm-dataItem.sql` 의 `E2E_DI_CSV`(TSK-07-04 추가, MDM·INUSE·LVL_CNT 1·ATTR01 국가, 항목
 * 행 없음) — `E2E_DI_PORT` 의 KRPUS·KRINC·CNSHA 는 `mdm-dataHistory.spec.ts` 가 행 수를 그대로 기대하므로 이 스펙은
 * 건드리지 않는다. 쓰기는 실행마다 새 키(`E2ECSV${SUFFIX}` 류)로 한다.
 */

const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";

const SUFFIX = Date.now().toString(36).toUpperCase();
const MARU = "E2E_DI_CSV";
const MARU_NAME = "CSV 항구";
const SAVE_CODE = `E2ECSV${SUFFIX}`;
const VALIDATE_CODE = `E2ECSVV${SUFFIX}`;
const BAD_CODE = "csvbadkey";

// 스크린샷은 저장소 문서(docs)를 건드리지 않도록 git 제외 폴더(mdm-user/.out)에 남긴다.
const screenshot = (name: string) => path.resolve(__dirname, "mdm-user/.out/screens", name);

/** CSV 20 고정 열(물리명, 순서 고정, I7) — `pages/dmd/dataCsvUploadPop/api.ts` 의 `CSV_COLS` 와 같다. */
const CSV_COLS = [
  "code",
  "name",
  "alter_name",
  "seq",
  "description",
  "lvl1",
  "lvl2",
  "lvl3",
  "lvl4",
  "lvl5",
  "attr01",
  "attr02",
  "attr03",
  "attr04",
  "attr05",
  "attr06",
  "attr07",
  "attr08",
  "attr09",
  "attr10",
] as const;
const CSV_HEADER = CSV_COLS.join(",");

function csvLine(fields: Partial<Record<(typeof CSV_COLS)[number], string>>): string {
  return CSV_COLS.map((c) => fields[c] ?? "").join(",");
}

/** 레코드 번호(I7) — 헤더 = 1, 첫 데이터 행 = 2, ... */
function csvBody(...rows: string[]): string {
  return [CSV_HEADER, ...rows].join("\r\n") + "\r\n";
}

const LOGIN_OPTS: LoginOptions = { portalTimeout: T.SLOW };

async function openScreen(page: Page) {
  await walkMenuPath(page, [/^마루 MDM$/, /^마스터데이터$/, /^항목 편집$/]);
  await expect(page.getByTestId("item-add")).toBeVisible({ timeout: T.SLOW });
  // 화면은 진입하면 첫 마루 데이터(또는 snapshot)를 비동기로 자동 선택하고, 선택이 끝나면 ID 고르기 칸을 그 ID 로 맞추며
  // 열린 후보 목록을 닫는다(IdPicker currentId). 그 전에 후보를 열어 누르면 후보가 사라져 클릭이 끝나지 않으므로
  // 자동 선택이 끝난 표시(item-current)를 본 뒤 고른다.
  await expect(page.getByTestId("item-current")).toBeVisible({ timeout: T.LONG });
}

async function selectMaru(page: Page, id: string) {
  const searched = page.waitForResponse(
    (r) =>
      r.url().includes("/api/mdm/oasis/dataItemMng/search") &&
      r.status() === 200 &&
      (r.request().postData() ?? "").includes(`"maruDataId":"${id}"`),
    { timeout: T.LONG },
  );
  await page.getByTestId("item-pick-keyword").fill(id);
  await page.getByTestId("item-pick-keyword").press("Enter");
  await page.getByTestId(`item-pick-${id}`).click();
  await searched;
  await expect(page.locator(".grid-panel-count").first()).toBeVisible();
}

function waitAction(page: Page, action: string, service = "dataItemMng") {
  return page.waitForResponse(
    (r) => r.url().includes(`/api/mdm/oasis/${service}/${action}`) && r.status() === 200,
    { timeout: T.LONG },
  );
}

function listRow(page: Page, code: string): Locator {
  return gridRowById(page.getByTestId("item-list"), code);
}

/** `dataItemMng` 화면으로 이동해 마루 데이터를 고르고 "CSV 업로드" 버튼으로 팝업을 연다(C1). */
async function openCsvPopup(page: Page, maruDataId: string) {
  await login(page, STEWARD, LOGIN_OPTS);
  await openScreen(page);
  await selectMaru(page, maruDataId);
  await page.getByTestId("item-csv-upload").click();
  await expect(page.getByTestId("csv-pop")).toBeVisible();
}

/** `input[type=file]` 에 CSV 원문을 올린다(D3 — 화면은 파싱하지 않고 원문만 서버에 보낸다). */
async function uploadCsv(page: Page, text: string) {
  await page.getByTestId("csv-pop-file").setInputFiles({
    name: "upload.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(text, "utf-8"),
  });
  // FileReader.readAsText 는 비동기라 "검증" 버튼이 활성화될 때까지 기다린다.
  await expect(page.getByTestId("csv-pop-validate")).toBeEnabled({ timeout: 5_000 });
}

test.describe.configure({ mode: "serial" });

test.describe("mdm dmd/dataCsvUploadPop smoke", () => {
  test.setTimeout(150_000);

  test.beforeAll(() => loadMdmFixture("mdm-dataItem.sql"));

  test("C1 dataItemMng 화면의 CSV 업로드 버튼으로 팝업이 열린다", async ({ page }) => {
    await openCsvPopup(page, MARU);
    await expect(page.getByText(`CSV 업로드 — ${MARU_NAME}`)).toBeVisible();
    await expect(page.getByTestId("csv-pop-file")).toBeVisible();
    await expect(page.getByTestId("csv-pop-validate")).toBeDisabled();
    await page.screenshot({ path: screenshot("dmd-dataCsvUploadPop-open.png"), fullPage: true });
  });

  test("C2 헤더만 있는 CSV 를 검증하면 결과가 나오되 모두 빈 상태다", async ({ page }) => {
    await openCsvPopup(page, MARU);
    await uploadCsv(page, csvBody());
    await page.getByTestId("csv-pop-validate").click();
    await expect(page.getByTestId("csv-pop-summary")).toHaveText("신규 0 · 수정 0 · 변경없음 0 · 오류 0");
    // ag-grid 는 overlay 컨테이너에도 같은 클래스명(.ag-overlay-no-rows-wrapper)을 쓴다 — 문구는 getByText 로 찾는다.
    await expect(page.getByTestId("csv-pop-rows").getByText("결과가 없습니다.")).toBeVisible({ timeout: T.UI });
  });

  test("C4 키 패턴을 어긴 행은 그 줄만 오류로 표시되고 저장이 비활성된다(I7)", async ({ page }) => {
    await openCsvPopup(page, MARU);
    const csv = csvBody(
      csvLine({ code: VALIDATE_CODE, name: "CSV검증", seq: "1", lvl1: "KR", attr01: "KR" }),
      csvLine({ code: BAD_CODE, name: "잘못된키", seq: "2", lvl1: "KR", attr01: "KR" }),
    );
    await uploadCsv(page, csv);
    await page.getByTestId("csv-pop-validate").click();
    await expect(page.getByTestId("csv-pop-summary")).toContainText("오류 1");
    // 레코드 번호(I7): 헤더=1, 첫 데이터 행(VALIDATE_CODE)=2, 둘째 데이터 행(BAD_CODE)=3 — 오류는 그 줄에만 붙는다.
    const okRow = page.getByTestId("csv-pop-rows").locator('.ag-row[row-id="2"]');
    const badRow = page.getByTestId("csv-pop-rows").locator('.ag-row[row-id="3"]');
    await expect(okRow).not.toContainText("키 패턴");
    await expect(badRow).toContainText("키 패턴");
    await expect(page.getByTestId("csv-pop-save")).toBeDisabled();
    await page.screenshot({ path: screenshot("dmd-dataCsvUploadPop-error.png"), fullPage: true });
  });

  test("C3 오류 0건 CSV 를 저장하면 팝업이 닫히고 목록에 반영된다", async ({ page }) => {
    await openCsvPopup(page, MARU);
    const csv = csvBody(csvLine({ code: SAVE_CODE, name: "CSV항목", seq: "1", lvl1: "KR", attr01: "KR" }));
    await uploadCsv(page, csv);
    await page.getByTestId("csv-pop-validate").click();
    await expect(page.getByTestId("csv-pop-summary")).toHaveText("신규 1 · 수정 0 · 변경없음 0 · 오류 0");
    await expect(page.getByTestId("csv-pop-save")).toBeEnabled();

    const reloaded = waitAction(page, "search");
    await page.getByTestId("csv-pop-save").click();
    await reloaded;
    await expect(page.getByTestId("csv-pop")).toBeHidden();
    await expect(listRow(page, SAVE_CODE)).toBeVisible({ timeout: T.UI });
    await page.screenshot({ path: screenshot("dmd-dataCsvUploadPop-saved.png"), fullPage: true });

    // 같은 파일 재업로드 시 바뀐 행만 새 선분(I4) — 값이 같으면 NONE.
    await page.getByTestId("item-csv-upload").click();
    await expect(page.getByTestId("csv-pop")).toBeVisible();
    await uploadCsv(page, csv);
    await page.getByTestId("csv-pop-validate").click();
    await expect(page.getByTestId("csv-pop-summary")).toHaveText("신규 0 · 수정 0 · 변경없음 1 · 오류 0");
  });
});
