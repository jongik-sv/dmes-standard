# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mdm-layoutMng.spec.ts >> mdm 전문 레이아웃 >> L1 메뉴로 이동하고 목록은 서버 데이터, 결과가 없으면 빈 상태
- Location: e2e/mdm-layoutMng.spec.ts:123:7

# Error details

```
Error: SMOKE_MDM_DB 에 워크트리 mdm.db 경로를 넣는다(design.md §3.7)
```

# Test source

```ts
  1   | import { execFileSync } from "node:child_process";
  2   | import { readFileSync } from "node:fs";
  3   | import path from "node:path";
  4   | import { expect, test, type Locator, type Page } from "@playwright/test";
  5   | 
  6   | /**
  7   |  * 전문 레이아웃(dmb/layoutMng) 브라우저 E2E — TSK-05-02 design.md §3.5.
  8   |  *
  9   |  *   L1 메뉴 이동·목록(서버 데이터)·빈 상태(스모크 1·2)   L2 EAI 를 고르면 표준 헤더가 1번에(F25)
  10  |  *   L3 M201 을 화면 조작만으로 — 저장 전 본문 첫 오프셋 130·총 187(수용 기준 6)
  11  |  *   L5 상수 편집 — CONST 만, 헤더 기본값은 입력 아님, 헤더 길이·순서 입력 없음(수용 기준 3)
  12  |  *   L6 저장 → 목록 187, 재정의는 이 전문에만(스모크 3)   L7 서버 오류 표시(동시 수정 MDM001, 스모크 4)
  13  |  *   L8 드래그 순서 → 즉시 재계산(serial 에서 불안정할 수 있어 맨 뒤)
  14  |  *
  15  |  * 전제·실행은 mdm-headerMng.spec.ts 와 같다(design.md §3.7). beforeAll 이 SMOKE_MDM_DB 에 M201 픽스처를 넣는다(멱등).
  16  |  * TSK-05-03 design.md §3.6 — L9 등록 검증 7종·인코딩 바이트 샘플 한 줄, L10 표현 자리 부족 거부(검증 표·저장), L11 여분 쪼개기 → 버전 2
  17  |  * 순차 전환·스냅샷 JSON·엑셀 내려받기, L12 영향 전문 목록. 스크린샷은 docs/mdm/tasks/TSK-05-03/screens.
  18  |  */
  19  | 
  20  | const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
  21  | const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
  22  | const USER = process.env.SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin";
  23  | const API = "/api/mdm/oasis/layoutMng";
  24  | 
  25  | const STAMP = Date.now().toString(36).toUpperCase();
  26  | const NEW_LAYOUT = `출측검사 ${STAMP}`;
  27  | const FIXTURE_LAYOUT = "출측검사 실적 수신(E2E)";
  28  | 
  29  | const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-05-02/screens", name);
  30  | const SHOT_0503 = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-05-03/screens", name);
  31  | 
  32  | function loadFixture() {
  33  |   const db = process.env.SMOKE_MDM_DB;
> 34  |   if (!db) throw new Error("SMOKE_MDM_DB 에 워크트리 mdm.db 경로를 넣는다(design.md §3.7)");
      |                  ^ Error: SMOKE_MDM_DB 에 워크트리 mdm.db 경로를 넣는다(design.md §3.7)
  35  |   execFileSync("sqlite3", [db], { input: readFileSync(path.resolve(__dirname, "fixtures/mdm-layout-m201.sql")) });
  36  | }
  37  | 
  38  | async function login(page: Page) {
  39  |   await page.goto(`${BASE_URL}/login`);
  40  |   await page.getByPlaceholder("아이디").fill(USER);
  41  |   await page.getByPlaceholder("비밀번호").fill(PASSWORD);
  42  |   await page.getByRole("button", { name: "로그인" }).click();
  43  |   await expect(page).toHaveURL(/\/portal/, { timeout: 30_000 });
  44  | }
  45  | 
  46  | async function openScreen(page: Page): Promise<Locator> {
  47  |   const item = (text: RegExp) => page.locator(".tree-item .item-name").filter({ hasText: text }).first();
  48  |   for (const name of [/^마루 MDM$/, /^레이아웃$/, /^전문 레이아웃$/]) {
  49  |     const node = item(name);
  50  |     await expect(node).toBeVisible({ timeout: 20_000 });
  51  |     await node.click();
  52  |   }
  53  |   const layout = page.locator(".page-layout").filter({
  54  |     has: page.locator(".page-layout__footer-screen-id", { hasText: "layoutMng" }),
  55  |   });
  56  |   await expect(layout.getByTestId("layout-list")).toBeVisible({ timeout: 60_000 });
  57  |   return layout;
  58  | }
  59  | 
  60  | async function search(layout: Locator, keyword: string) {
  61  |   await layout.getByTestId("layout-search-keyword").fill(keyword);
  62  |   await layout.getByRole("button", { name: "조회", exact: true }).click();
  63  | }
  64  | 
  65  | function listRow(layout: Locator, text: string): Locator {
  66  |   return layout.getByTestId("layout-list").locator(".ag-row").filter({ hasText: text }).first();
  67  | }
  68  | 
  69  | async function selectLayout(layout: Locator, name: string) {
  70  |   await listRow(layout, name).click();
  71  |   await expect(layout.getByTestId("layout-form-name")).toHaveValue(name, { timeout: 30_000 });
  72  | }
  73  | 
  74  | async function pickColumn(page: Page, layout: Locator, phys: string) {
  75  |   await layout.getByTestId("layout-item-add-column").click();
  76  |   const modal = page.getByTestId("column-pick-modal");
  77  |   await expect(modal).toBeVisible();
  78  |   await page.getByTestId("column-pick-keyword").fill(phys);
  79  |   await page.getByTestId("column-pick-search").click();
  80  |   await page.getByTestId("column-pick-grid").locator(".ag-row").filter({ hasText: phys }).first().click();
  81  |   await page.getByTestId("column-pick-select").click();
  82  |   await expect(modal).toBeHidden();
  83  | }
  84  | 
  85  | function bodyCells(layout: Locator, col: string): Locator {
  86  |   return layout.getByTestId("layout-items").locator(`.ag-center-cols-container .ag-cell[col-id="${col}"]`);
  87  | }
  88  | 
  89  | function bodyRow(layout: Locator, text: string): Locator {
  90  |   return layout.getByTestId("layout-items").locator(".ag-center-cols-container .ag-row").filter({ hasText: text }).first();
  91  | }
  92  | 
  93  | /** 상수 편집 표(AgDataGrid)의 한 행 — 값 칸 span(const-input-PHYS)을 가진 행. */
  94  | const constRow = (modal: Locator, phys: string) =>
  95  |   modal.locator(".ag-center-cols-container .ag-row").filter({ has: modal.page().getByTestId(`const-input-${phys}`) });
  96  | /** 값 칸을 한 번 눌러 편집기를 열고 값을 넣어 Enter 로 확정한다. */
  97  | async function editConst(modal: Locator, phys: string, value: string) {
  98  |   await constRow(modal, phys).locator('.ag-cell[col-id="VALUE"]').click();
  99  |   const editor = modal.locator(".ag-cell-inline-editing input");
  100 |   await editor.fill(value);
  101 |   await editor.press("Enter");
  102 | }
  103 | 
  104 | async function openConst(page: Page, layout: Locator, seq: number): Promise<Locator> {
  105 |   await layout.getByTestId(`const-edit-open-${seq}`).click();
  106 |   const modal = page.getByTestId("const-edit-modal");
  107 |   await expect(modal).toBeVisible();
  108 |   return modal;
  109 | }
  110 | 
  111 | async function closeDialog(page: Page) {
  112 |   await page.getByRole("dialog").getByRole("button", { name: "닫기" }).last().click();
  113 | }
  114 | 
  115 | test.describe.configure({ mode: "serial" });
  116 | test.use({ viewport: { width: 1680, height: 1200 } });
  117 | 
  118 | test.describe("mdm 전문 레이아웃", () => {
  119 |   test.setTimeout(180_000);
  120 | 
  121 |   test.beforeAll(() => loadFixture());
  122 | 
  123 |   test("L1 메뉴로 이동하고 목록은 서버 데이터, 결과가 없으면 빈 상태", async ({ page }) => {
  124 |     await login(page);
  125 |     const layout = await openScreen(page);
  126 |     await expect(layout.locator(".page-layout__footer-breadcrumb")).toHaveText("마루 MDM > 레이아웃 > 전문 레이아웃");
  127 |     await expect(layout.locator(".page-layout__footer-screen-id")).toHaveText("layoutMng");
  128 |     // 화면을 열어도 목록은 자동 조회되지 않는다 — [조회] 를 눌러야 픽스처 전문이 보인다.
  129 |     await layout.getByRole("button", { name: "조회", exact: true }).click();
  130 |     const row = listRow(layout, FIXTURE_LAYOUT);
  131 |     await expect(row).toBeVisible({ timeout: 30_000 });
  132 |     await expect(row.locator('.ag-cell[col-id="TOTAL_LENGTH"]')).toHaveText("187");
  133 |     await expect(row.locator('.ag-cell[col-id="HEADER_SUMMARY"]')).toHaveText("GLUE 공통 헤더(E2E) (100) + L2 구간 헤더(E2E) (30)");
  134 |     await page.screenshot({ path: screenshot("dmb-layoutMng-list.png"), fullPage: true });
```