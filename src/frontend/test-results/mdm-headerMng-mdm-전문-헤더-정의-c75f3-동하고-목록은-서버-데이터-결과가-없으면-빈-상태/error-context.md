# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mdm-headerMng.spec.ts >> mdm 전문 헤더 정의 >> H1 메뉴로 이동하고 목록은 서버 데이터, 결과가 없으면 빈 상태
- Location: e2e/mdm-headerMng.spec.ts:95:7

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
  7   |  * 전문 헤더 정의(dmb/headerMng) 브라우저 E2E — TSK-05-02 design.md §3.5.
  8   |  *
  9   |  *   H1 메뉴 이동·목록(서버 데이터)·빈 상태(스모크 1·2)   H2 화면 조작만으로 헤더 등록 — 저장 전 즉시 재계산(스모크 3)
  10  |  *   H3 사전에 없는 항목은 만들 경로가 없고 API 도 L01(수용 기준 1)   H4 fill_kind 닫힌 칸(수용 기준 5 화면 쪽)
  11  |  *   H5 헤더 변경 영향도 — 사용 전문                        H6 서버 오류 표시(동시 수정 MDM001, 스모크 4)
  12  |  *
  13  |  * 전제: 격리 DB 로 mcm·mdm 백엔드와 포털을 빈 포트에 직접 띄우고 e2e/fixtures/mdm-rbac-users.sql 을 넣는다(design.md §3.7).
  14  |  * SMOKE_MCM_BASE_URL 로 반드시 자기 포털을 가리킨다(기본값 5100 은 메인 체크아웃 포털 → 거짓 통과).
  15  |  * beforeAll 이 SMOKE_MDM_DB(워크트리 mdm.db)에 e2e/fixtures/mdm-layout-m201.sql 을 넣는다 — 컬럼 사전 스펙 뒤에 들어가야 한다.
  16  |  */
  17  | 
  18  | const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
  19  | const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
  20  | const USER = process.env.SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin";
  21  | const API = "/api/mdm/oasis/headerMng";
  22  | 
  23  | const STAMP = Date.now().toString(36).toUpperCase();
  24  | const NEW_HEADER = `E2E 헤더 ${STAMP}`;
  25  | const NEW_EAI = `X${STAMP}`;
  26  | 
  27  | // __dirname = src/frontend/e2e → repo root 까지 3단계 위.
  28  | const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-05-02/screens", name);
  29  | 
  30  | function loadFixture() {
  31  |   const db = process.env.SMOKE_MDM_DB;
> 32  |   if (!db) throw new Error("SMOKE_MDM_DB 에 워크트리 mdm.db 경로를 넣는다(design.md §3.7)");
      |                  ^ Error: SMOKE_MDM_DB 에 워크트리 mdm.db 경로를 넣는다(design.md §3.7)
  33  |   execFileSync("sqlite3", [db], { input: readFileSync(path.resolve(__dirname, "fixtures/mdm-layout-m201.sql")) });
  34  | }
  35  | 
  36  | async function login(page: Page) {
  37  |   await page.goto(`${BASE_URL}/login`);
  38  |   await page.getByPlaceholder("아이디").fill(USER);
  39  |   await page.getByPlaceholder("비밀번호").fill(PASSWORD);
  40  |   await page.getByRole("button", { name: "로그인" }).click();
  41  |   await expect(page).toHaveURL(/\/portal/, { timeout: 30_000 });
  42  | }
  43  | 
  44  | async function openScreen(page: Page): Promise<Locator> {
  45  |   const item = (text: RegExp) => page.locator(".tree-item .item-name").filter({ hasText: text }).first();
  46  |   for (const name of [/^마루 MDM$/, /^레이아웃$/, /^전문 헤더 정의$/]) {
  47  |     const node = item(name);
  48  |     await expect(node).toBeVisible({ timeout: 20_000 });
  49  |     await node.click();
  50  |   }
  51  |   const layout = page.locator(".page-layout").filter({
  52  |     has: page.locator(".page-layout__footer-screen-id", { hasText: "headerMng" }),
  53  |   });
  54  |   await expect(layout.getByTestId("header-list")).toBeVisible({ timeout: 60_000 });
  55  |   return layout;
  56  | }
  57  | 
  58  | async function search(layout: Locator, keyword: string) {
  59  |   await layout.getByTestId("header-search-keyword").fill(keyword);
  60  |   await layout.getByRole("button", { name: "조회", exact: true }).click();
  61  | }
  62  | 
  63  | function listRow(layout: Locator, text: string): Locator {
  64  |   return layout.getByTestId("header-list").locator(".ag-row").filter({ hasText: text }).first();
  65  | }
  66  | 
  67  | async function selectHeader(layout: Locator, name: string) {
  68  |   await listRow(layout, name).click();
  69  |   await expect(layout.getByTestId("header-form-name")).toHaveValue(name, { timeout: 30_000 });
  70  | }
  71  | 
  72  | async function pickColumn(page: Page, layout: Locator, phys: string) {
  73  |   await layout.getByTestId("header-item-add-column").click();
  74  |   const modal = page.getByTestId("column-pick-modal");
  75  |   await expect(modal).toBeVisible();
  76  |   await page.getByTestId("column-pick-keyword").fill(phys);
  77  |   await page.getByTestId("column-pick-search").click();
  78  |   await page.getByTestId("column-pick-grid").locator(".ag-row").filter({ hasText: phys }).first().click();
  79  |   await page.getByTestId("column-pick-select").click();
  80  |   await expect(modal).toBeHidden();
  81  | }
  82  | 
  83  | function offsets(layout: Locator): Locator {
  84  |   return layout.getByTestId("header-items").locator('.ag-center-cols-container .ag-cell[col-id="OFFSET"]');
  85  | }
  86  | 
  87  | test.describe.configure({ mode: "serial" });
  88  | test.use({ viewport: { width: 1680, height: 1200 } });
  89  | 
  90  | test.describe("mdm 전문 헤더 정의", () => {
  91  |   test.setTimeout(180_000);
  92  | 
  93  |   test.beforeAll(() => loadFixture());
  94  | 
  95  |   test("H1 메뉴로 이동하고 목록은 서버 데이터, 결과가 없으면 빈 상태", async ({ page }) => {
  96  |     await login(page);
  97  |     const layout = await openScreen(page);
  98  |     await expect(layout.locator(".page-layout__footer-breadcrumb")).toHaveText("마루 MDM > 레이아웃 > 전문 헤더 정의");
  99  |     await expect(layout.locator(".page-layout__footer-screen-id")).toHaveText("headerMng");
  100 |     // 화면을 열어도 목록은 자동 조회되지 않는다 — [조회] 를 눌러야 픽스처 헤더가 보인다.
  101 |     await layout.getByRole("button", { name: "조회", exact: true }).click();
  102 |     const glue = listRow(layout, "GLUE 공통 헤더(E2E)");
  103 |     await expect(glue).toBeVisible({ timeout: 30_000 });
  104 |     await expect(glue.locator('.ag-cell[col-id="TOTAL_LENGTH"]')).toHaveText("100");
  105 |     await expect(glue.locator('.ag-cell[col-id="ITEM_COUNT"]')).toHaveText("13");
  106 |     const l2 = listRow(layout, "L2 구간 헤더(E2E)");
  107 |     await expect(l2.locator('.ag-cell[col-id="TOTAL_LENGTH"]')).toHaveText("30");
  108 |     await expect(l2.locator('.ag-cell[col-id="ITEM_COUNT"]')).toHaveText("6");
  109 |     await page.screenshot({ path: screenshot("dmb-headerMng-list.png"), fullPage: true });
  110 | 
  111 |     await search(layout, `없음-${STAMP}`);
  112 |     await expect(layout.getByTestId("header-list-empty")).toHaveText("조회된 헤더가 없습니다", { timeout: 30_000 });
  113 |     await page.screenshot({ path: screenshot("dmb-headerMng-empty.png"), fullPage: true });
  114 |   });
  115 | 
  116 |   test("H2~H6 등록·사전 밖 항목·닫힌 칸·영향도·동시 수정", async ({ page }) => {
  117 |     await login(page);
  118 |     const layout = await openScreen(page);
  119 | 
  120 |     // ── H2 화면 조작만으로 헤더 등록 — 저장 전 즉시 재계산 ──
  121 |     await layout.getByRole("button", { name: "신규", exact: true }).click();
  122 |     await layout.getByTestId("header-form-name").fill(NEW_HEADER);
  123 |     await layout.getByTestId("header-form-eai").fill(NEW_EAI);
  124 |     await layout.getByTestId("header-form-eai-name").fill(`E2E EAI ${STAMP}`);
  125 |     await layout.getByTestId("header-form-encoding").selectOption("UTF-8");
  126 |     await layout.getByTestId("header-form-pad-rule").fill("숫자 왼쪽 0, 문자 오른쪽 공백");
  127 |     await pickColumn(page, layout, "TC_CD");
  128 |     await layout.getByTestId("item-detail-fill-kind").selectOption("AUTO");
  129 |     await layout.getByTestId("item-detail-default").selectOption("LAYOUT_ID");
  130 |     await pickColumn(page, layout, "SND_FAC_TP");
  131 |     await layout.getByTestId("item-detail-fill-kind").selectOption("CONST");
  132 |     await layout.getByTestId("item-detail-default").fill("B0");
```