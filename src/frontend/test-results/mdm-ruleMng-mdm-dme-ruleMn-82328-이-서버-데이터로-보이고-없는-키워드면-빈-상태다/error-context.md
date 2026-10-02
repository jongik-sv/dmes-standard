# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mdm-ruleMng.spec.ts >> mdm dme/ruleMng >> T2 목록·빈 상태: 픽스처 룰이 서버 데이터로 보이고 없는 키워드면 빈 상태다
- Location: e2e/mdm-ruleMng.spec.ts:90:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('rule-link-E2E_LOCK_JDG')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByTestId('rule-link-E2E_LOCK_JDG')

```

```yaml
- alert
- banner:
  - img "DMES Portal"
  - button "개인 정보":
    - img
    - paragraph: E2E MDM 담당자 님
    - img
- main:
  - button "메뉴 접기": ◀
  - radiogroup:
    - radio "메뉴" [checked]
    - img
    - text: 메뉴
    - radio "즐겨찾기"
    - img
    - text: 즐겨찾기
    - radio "기본 화면"
    - img
    - text: 기본 화면
  - textbox "메뉴명 검색"
  - button "전체 펼치기": ≡ ▼
  - button "전체 접기": ≡ ▲
  - list:
    - listitem:
      - img
      - text: 마루 MDM
      - list:
        - listitem:
          - img
          - text: 용어·도메인
        - listitem:
          - img
          - text: 레이아웃
        - listitem:
          - img
          - text: 마스터코드
        - listitem:
          - img
          - text: 마스터데이터
        - listitem:
          - img
          - text: 업무기준
          - list:
            - listitem:
              - img
              - text: 룰
            - listitem:
              - img
              - text: 룰 화면
            - listitem:
              - img
              - text: 버전 확정
            - listitem:
              - img
              - text: 룰 세트
            - listitem:
              - img
              - text: 룰 세트 편집
  - button "홈":
    - img
  - text: 룰
  - button "룰 탭 닫기": ×
  - button "새로고침":
    - img
  - button "화면 캡쳐 (PNG 다운로드)":
    - img
  - button "즐겨찾기 추가":
    - img
  - button "탭 목록":
    - img
    - text: "1"
  - button "전체 화면으로 보기":
    - img
  - button "헤더 접기":
    - img
  - heading "룰" [level=2]
  - button "조회"
  - search:
    - paragraph: 룰 ID·명
    - textbox "ID 또는 룰명"
    - paragraph: 종류
    - combobox:
      - option "전체" [selected]
      - option "판정(DECISION)"
      - option "산출(DERIVE)"
    - img
    - paragraph: 상태
    - combobox:
      - option "전체" [selected]
      - option "작성"
      - option "사용 중"
      - option "폐기"
    - img
  - text: 룰 목록 14건
  - button "룰 등록"
  - grid:
    - rowgroup:
      - row "룰 ID 룰명 종류 원천 상태 적용 버전 적중 정책 미적용 버전":
        - columnheader "룰 ID"
        - columnheader "룰명"
        - columnheader "종류"
        - columnheader "원천"
        - columnheader "상태"
        - columnheader "적용 버전"
        - columnheader "적중 정책"
        - columnheader "미적용 버전"
    - rowgroup:
      - row "BASE_SPD_LKP 기본 L/S 조회 판정(DECISION) MDM 사용 중 1 UNIQUE 2 DRAFT · 41000132":
        - gridcell "BASE_SPD_LKP":
          - button "BASE_SPD_LKP"
        - gridcell "기본 L/S 조회"
        - gridcell "판정(DECISION)"
        - gridcell "MDM"
        - gridcell "사용 중"
        - gridcell "1"
        - gridcell "UNIQUE"
        - gridcell "2 DRAFT · 41000132"
      - row "C10B1040 설계KEY 판정(DECISION) MDM 작성 1 DRAFT · 41000132":
        - gridcell "C10B1040":
          - button "C10B1040"
        - gridcell "설계KEY"
        - gridcell "판정(DECISION)"
        - gridcell "MDM"
        - gridcell "작성"
        - gridcell
        - gridcell
        - gridcell "1 DRAFT · 41000132"
      - row "C10B1071 원자재두께 관리 판정(DECISION) MDM 작성 1 DRAFT · 41000132":
        - gridcell "C10B1071":
          - button "C10B1071"
        - gridcell "원자재두께 관리"
        - gridcell "판정(DECISION)"
        - gridcell "MDM"
        - gridcell "작성"
        - gridcell
        - gridcell
        - gridcell "1 DRAFT · 41000132"
      - row "COIL_WGT_CALC 코일 중량 산출 산출(DERIVE) MDM 사용 중 1 2 DRAFT · 41000132":
        - gridcell "COIL_WGT_CALC":
          - button "COIL_WGT_CALC"
        - gridcell "코일 중량 산출"
        - gridcell "산출(DERIVE)"
        - gridcell "MDM"
        - gridcell "사용 중"
        - gridcell "1"
        - gridcell
        - gridcell "2 DRAFT · 41000132"
      - row "EQP_CHK_JDG 설비 점검 판정 판정(DECISION) EXTERNAL 사용 중 3 FIRST":
        - gridcell "EQP_CHK_JDG":
          - button "EQP_CHK_JDG"
        - gridcell "설비 점검 판정"
        - gridcell "판정(DECISION)"
        - gridcell "EXTERNAL"
        - gridcell "사용 중"
        - gridcell "3"
        - gridcell "FIRST"
        - gridcell
      - row "PACK_TYPE_LKP 포장 방식 판정 판정(DECISION) MDM 사용 중 1 UNIQUE 2 DRAFT · 41000132":
        - gridcell "PACK_TYPE_LKP":
          - button "PACK_TYPE_LKP"
        - gridcell "포장 방식 판정"
        - gridcell "판정(DECISION)"
        - gridcell "MDM"
        - gridcell "사용 중"
        - gridcell "1"
        - gridcell "UNIQUE"
        - gridcell "2 DRAFT · 41000132"
      - row "PACK_WGT_CALC 출하 중량 산출 산출(DERIVE) MDM 사용 중 1 2 DRAFT · 41000132":
        - gridcell "PACK_WGT_CALC":
          - button "PACK_WGT_CALC"
        - gridcell "출하 중량 산출"
        - gridcell "산출(DERIVE)"
        - gridcell "MDM"
        - gridcell "사용 중"
        - gridcell "1"
        - gridcell
        - gridcell "2 DRAFT · 41000132"
      - row "PROD_WGT_CALC 제품 중량 산출 판정(DECISION) MDM 사용 중 1 UNIQUE 2 DRAFT":
        - gridcell "PROD_WGT_CALC":
          - button "PROD_WGT_CALC"
        - gridcell "제품 중량 산출"
        - gridcell "판정(DECISION)"
        - gridcell "MDM"
        - gridcell "사용 중"
        - gridcell "1"
        - gridcell "UNIQUE"
        - gridcell "2 DRAFT"
      - row "QLTY_GRD_JDG 품질 등급 판정 판정(DECISION) MDM 사용 중 1 FIRST 2 DRAFT":
        - gridcell "QLTY_GRD_JDG":
          - button "QLTY_GRD_JDG"
        - gridcell "품질 등급 판정"
        - gridcell "판정(DECISION)"
        - gridcell "MDM"
        - gridcell "사용 중"
        - gridcell "1"
        - gridcell "FIRST"
        - gridcell "2 DRAFT"
      - row "QLTY_SURCHG 등급 할증률 판정(DECISION) MDM 사용 중 1 FIRST":
        - gridcell "QLTY_SURCHG":
          - button "QLTY_SURCHG"
        - gridcell "등급 할증률"
        - gridcell "판정(DECISION)"
        - gridcell "MDM"
        - gridcell "사용 중"
        - gridcell "1"
        - gridcell "FIRST"
        - gridcell
      - row "SPD_EXC 예외 조건 판정(DECISION) MDM 사용 중 1 COLLECT 2 DRAFT · 41000132":
        - gridcell "SPD_EXC":
          - button "SPD_EXC"
        - gridcell "예외 조건"
        - gridcell "판정(DECISION)"
        - gridcell "MDM"
        - gridcell "사용 중"
        - gridcell "1"
        - gridcell "COLLECT"
        - gridcell "2 DRAFT · 41000132"
      - row "SPD_JOIN 결합 산출(DERIVE) MDM 사용 중 1":
        - gridcell "SPD_JOIN":
          - button "SPD_JOIN"
        - gridcell "결합"
        - gridcell "산출(DERIVE)"
        - gridcell "MDM"
        - gridcell "사용 중"
        - gridcell "1"
        - gridcell
        - gridcell
      - row "UNIT_WID_WGT_CALC 단위폭중량 산출 산출(DERIVE) MDM 사용 중 1":
        - gridcell "UNIT_WID_WGT_CALC":
          - button "UNIT_WID_WGT_CALC"
        - gridcell "단위폭중량 산출"
        - gridcell "산출(DERIVE)"
        - gridcell "MDM"
        - gridcell "사용 중"
        - gridcell "1"
        - gridcell
        - gridcell
      - row "WID_CHK 광폭 여부 판정(DECISION) MDM 사용 중 1 FIRST":
        - gridcell "WID_CHK":
          - button "WID_CHK"
        - gridcell "광폭 여부"
        - gridcell "판정(DECISION)"
        - gridcell "MDM"
        - gridcell "사용 중"
        - gridcell "1"
        - gridcell "FIRST"
        - gridcell
    - rowgroup
    - rowgroup
    - rowgroup
  - text: 1 / 1 페이지 · 총 14건
  - button "이전" [disabled]
  - button "다음" [disabled]
  - separator "드래그하여 크기 조절 · 더블클릭하면 기본 크기"
  - strong: ① 헤더
  - text: 사용 중 판정(DECISION)
  - table:
    - rowgroup:
      - row "룰 ID BASE_SPD_LKP":
        - rowheader "룰 ID"
        - cell "BASE_SPD_LKP"
      - row "룰명 * 기본 L/S 조회":
        - rowheader "룰명 *"
        - cell "기본 L/S 조회":
          - textbox [disabled]: 기본 L/S 조회
      - row "설명 두께 구간과 칼라 BOM 수지 코드·도장 면으로 기본 라인스피드(mpm)":
        - rowheader "설명"
        - cell "두께 구간과 칼라 BOM 수지 코드·도장 면으로 기본 라인스피드(mpm)":
          - textbox [disabled]: 두께 구간과 칼라 BOM 수지 코드·도장 면으로 기본 라인스피드(mpm)
      - row "활용처 메모 LS_A3 1단계. 결과 열 그룹 BASE_SPD":
        - rowheader "활용처 메모"
        - cell "LS_A3 1단계. 결과 열 그룹 BASE_SPD":
          - textbox [disabled]: LS_A3 1단계. 결과 열 그룹 BASE_SPD
      - row "원천 MDM":
        - rowheader "원천"
        - cell "MDM"
  - button "폐기" [disabled]
  - button "헤더 저장" [disabled]
  - strong: ② 버전
  - button "내용 편집 →"
  - grid:
    - rowgroup:
      - row "버전 상태 적용 구간 소유자 base 적중 정책":
        - columnheader "버전"
        - columnheader "상태"
        - columnheader "적용 구간"
        - columnheader "소유자"
        - columnheader "base"
        - columnheader "적중 정책"
    - rowgroup:
      - row "2 작성 중 41000132 1 UNIQUE":
        - gridcell "2"
        - gridcell "작성 중"
        - gridcell
        - gridcell "41000132"
        - gridcell "1"
        - gridcell "UNIQUE"
      - row "1 확정 2026-09-01 ~ 9999-12-31 UNIQUE":
        - gridcell "1"
        - gridcell "확정"
        - gridcell "2026-09-01 ~ 9999-12-31"
        - gridcell
        - gridcell
        - gridcell "UNIQUE"
    - rowgroup
    - rowgroup
    - rowgroup
  - paragraph: 미적용 버전이 있어 새 버전을 만들 수 없습니다(한 번에 하나).
  - paragraph: 적중 정책은 [내용 편집 →] 의 의사결정표에서 바꾸고 표 저장과 함께 저장합니다.
  - button "새 버전" [disabled]
  - button "확정 이동"
  - button "삭제" [disabled]
  - button "확정 취소" [disabled]
  - button "해제" [disabled]
  - textbox "넘겨받을 사용자 ID" [disabled]
  - button "넘기기(준비 중)" [disabled]
  - text: 잠김 · 41000132 편집 중 마루 MDM > 업무기준 > 룰 ruleMng
```

# Test source

```ts
  1   | import path from "node:path";
  2   | import { expect, test, type Page } from "@playwright/test";
  3   | 
  4   | /**
  5   |  * mdm dme/ruleMng(룰 헤더·버전) — TSK-08-02 design.md §3.4.1, decisions.md D-105.
  6   |  *
  7   |  * 스모크 넷: T1 메뉴 이동, T2 목록(서버 데이터)·빈 상태, T3 등록 한 번(팝업에서 등록하면 상세에 새 룰이 뜨고 목록에 반영), T4 서버 오류.
  8   |  * 고유: T5 수용 1(ID 물리명 규칙 — 즉시 안내 + 서버 거부), T6 수용 2(원천 선택 칸 없음), T7 권한(READ 는 [룰 등록] 버튼이 비활성).
  9   |  *
  10  |  * D-105 — 이 화면이 ① 헤더·② 버전(목록 + 상세)까지 맡는다. H 계열은 옮겨 온 시험이다:
  11  |  * 헤더 저장(낙관적 잠금 auditVer)·폐기·적중 정책 표시(D-133 — 고치는 곳은 ruleEdit)·새 버전·DRAFT 삭제·선점·해제·넘기기·확정 취소·확정 이동.
  12  |  *
  13  |  * 전제(design.md 「E2E 서버 절차」): 새 mcm.db·mdm.db 로 mcm·mdm 백엔드와 포털을 빈 포트에 직접 띄우고,
  14  |  * mcm 기동 뒤 e2e/fixtures/mdm-rbac-users.sql·mdm-ruleEdit-users.sql, mdm 기동 뒤 e2e/fixtures/mdm-ruleEdit-data.sql 을 넣는다.
  15  |  * 룰을 만들므로 같은 mdm.db 로 다시 돌릴 수 없다(새 DB 로 시작). 편집 시나리오는 SYSADMIN 이 아니라 담당자로 로그인한다.
  16  |  */
  17  | 
  18  | const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
  19  | const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
  20  | const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";
  21  | /** 둘째 담당자 — 소유권 시험(선점·해제)에 쓴다. */
  22  | const STEWARD2 = process.env.SMOKE_MDM_STEWARD2_USER ?? "e2e_mdm_steward2";
  23  | const STDADMIN = process.env.SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin";
  24  | 
  25  | const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-08-02/screens", name);
  26  | 
  27  | async function login(page: Page, user: string) {
  28  |   await page.goto(`${BASE_URL}/login`);
  29  |   await page.getByPlaceholder("아이디").fill(user);
  30  |   await page.getByPlaceholder("비밀번호").fill(PASSWORD);
  31  |   await page.getByRole("button", { name: "로그인" }).click();
  32  |   await expect(page).toHaveURL(/\/portal/, { timeout: 60_000 });
  33  | }
  34  | 
  35  | function menuItem(page: Page, text: RegExp) {
  36  |   return page.locator(".tree-item .item-name").filter({ hasText: text }).first();
  37  | }
  38  | 
  39  | /** 메뉴 트리를 따라 연다. 하위 항목이 이미 보이면 상위를 누르지 않는다(누르면 접힌다). */
  40  | async function openMenu(page: Page, leaf: RegExp) {
  41  |   const path = [/^마루 MDM$/, /^업무기준$/, leaf];
  42  |   for (let i = 0; i < path.length; i++) {
  43  |     const item = menuItem(page, path[i]);
  44  |     await expect(item).toBeVisible({ timeout: 20_000 });
  45  |     if (i < path.length - 1 && (await menuItem(page, path[i + 1]).isVisible())) continue;
  46  |     await item.click();
  47  |   }
  48  | }
  49  | 
  50  | async function openRuleMng(page: Page) {
  51  |   await openMenu(page, /^룰$/);
  52  |   await expect(page.locator("#btn_rule_reg")).toBeVisible({ timeout: 60_000 });
  53  | }
  54  | 
  55  | /** 목록 헤더 [룰 등록] 으로 등록 팝업을 연다. 팝업은 열 때만 마운트되고 칸은 빈 채로 시작한다. */
  56  | async function openRuleRegister(page: Page) {
  57  |   await page.locator("#btn_rule_reg").click();
  58  |   await expect(page.getByTestId("rule-register-form")).toBeVisible({ timeout: 20_000 });
  59  | }
  60  | 
  61  | async function search(page: Page, keyword: string) {
  62  |   await page.getByTestId("rule-search-keyword").fill(keyword);
  63  |   await page.getByRole("button", { name: "조회", exact: true }).click();
  64  | }
  65  | 
  66  | /** 목록에서 룰을 골라 ① 헤더·② 버전 상세를 연다(D-105). */
  67  | async function openDetail(page: Page, ruleId: string) {
  68  |   // 화면을 열어도 목록은 자동 조회되지 않는다 — [조회] 를 눌러 그 룰을 목록에 올린 뒤 고른다.
  69  |   await search(page, ruleId);
  70  |   await page.getByTestId(`rule-link-${ruleId}`).click();
  71  |   await expect(page.getByTestId("rule-header-id")).toHaveText(ruleId, { timeout: 30_000 });
  72  | }
  73  | 
  74  | /** 버전 표에서 한 줄을 고른다. */
  75  | function versionRow(page: Page, ver: number) {
  76  |   return page.getByTestId("rule-version-table").locator(`.ag-center-cols-container .ag-row[row-id="${ver}"]`);
  77  | }
  78  | 
  79  | test.describe.configure({ mode: "serial" });
  80  | 
  81  | test.describe("mdm dme/ruleMng", () => {
  82  |   test.setTimeout(180_000);
  83  | 
  84  |   test("T1 메뉴: 마루 MDM > 업무기준 > 룰 이 열린다", async ({ page }) => {
  85  |     await login(page, STEWARD);
  86  |     await openRuleMng(page);
  87  |     await expect(page.locator(".page-layout__title:visible", { hasText: /^룰$/ })).toBeVisible();
  88  |   });
  89  | 
  90  |   test("T2 목록·빈 상태: 픽스처 룰이 서버 데이터로 보이고 없는 키워드면 빈 상태다", async ({ page }) => {
  91  |     await login(page, STEWARD);
  92  |     await openRuleMng(page);
  93  |     // 화면을 열어도 목록은 자동 조회되지 않는다 — [조회] 를 눌러야 픽스처 룰이 보인다.
  94  |     await page.getByRole("button", { name: "조회", exact: true }).click();
  95  |     const qlty = page.locator(".ag-row", { has: page.getByTestId("rule-link-QLTY_GRD_JDG") });
  96  |     await expect(qlty).toBeVisible({ timeout: 30_000 });
  97  |     await expect(qlty.locator('[col-id="releasedVer"]')).toHaveText("1");
  98  |     await expect(qlty.locator('[col-id="hitPolicy"]')).toHaveText("FIRST");
> 99  |     await expect(page.getByTestId("rule-link-E2E_LOCK_JDG")).toBeVisible();
      |                                                              ^ Error: expect(locator).toBeVisible() failed
  100 |     await page.screenshot({ path: screenshot("dme-ruleMng-list.png"), fullPage: true });
  101 | 
  102 |     await search(page, "NO_SUCH_RULE");
  103 |     await expect(page.getByTestId("rule-list-empty")).toHaveText("조회된 룰이 없습니다.", { timeout: 20_000 });
  104 |     await expect(page.locator(".grid-panel-count")).toHaveText("0건");
  105 |   });
  106 | 
  107 |   test("T3 등록: 등록하면 목록에 있고 고르면 상세가 버전 1 DRAFT·편집 중(나)으로 열린다", async ({ page }) => {
  108 |     await login(page, STEWARD);
  109 |     await openRuleMng(page);
  110 |     await openRuleRegister(page);
  111 |     await page.getByTestId("rule-reg-id").fill("E2E_NEW_JDG");
  112 |     await page.getByTestId("rule-reg-name").fill("E2E 신규 판정");
  113 |     await page.getByTestId("rule-reg-kind").selectOption("DECISION");
  114 |     await page.screenshot({ path: screenshot("dme-ruleMng-register.png"), fullPage: true });
  115 |     await page.getByTestId("rule-reg-submit").click();
  116 |     await expect(page.getByTestId("rule-register-form")).toHaveCount(0, { timeout: 20_000 });
  117 | 
  118 |     await search(page, "E2E_NEW");
  119 |     await expect(page.getByTestId("rule-link-E2E_NEW_JDG")).toBeVisible({ timeout: 20_000 });
  120 | 
  121 |     // D-105 — 고르면 같은 화면의 상세(① 헤더·② 버전)가 열린다(자동 선점된 버전 1 DRAFT).
  122 |     await openDetail(page, "E2E_NEW_JDG");
  123 |     await expect(page.getByTestId("rule-header-name")).toHaveValue("E2E 신규 판정");
  124 |     await expect(versionRow(page, 1).locator('[data-status="DRAFT"]')).toBeVisible();
  125 |     await expect(page.getByTestId("rule-version-table").getByText("편집 중(나)")).toBeVisible();
  126 |   });
  127 | 
  128 |   test("T4 서버 오류: 같은 ID 로 등록하면 서버 중복 오류가 보인다", async ({ page }) => {
  129 |     await login(page, STEWARD);
  130 |     await openRuleMng(page);
  131 |     await openRuleRegister(page);
  132 |     await page.getByTestId("rule-reg-id").fill("QLTY_GRD_JDG");
  133 |     await page.getByTestId("rule-reg-name").fill("중복 등록");
  134 |     await page.getByTestId("rule-reg-submit").click();
  135 |     await expect(page.getByRole("dialog").filter({ hasText: /같은 룰 ID 가 이미 있습니다/ }).first()).toBeVisible({ timeout: 20_000 });
  136 |   });
  137 | 
  138 |   test("T5 수용 1: 물리명 규칙 위반은 즉시 안내하고 막으며, 가로채 보내도 서버가 거부한다", async ({ page }) => {
  139 |     await login(page, STEWARD);
  140 |     await openRuleMng(page);
  141 |     await openRuleRegister(page);
  142 |     await page.getByTestId("rule-reg-id").fill("qlty-bad");
  143 |     await page.getByTestId("rule-reg-name").fill("규칙 위반");
  144 |     await expect(page.getByText(/컬럼 물리명 규칙/).first()).toBeVisible();
  145 |     await expect(page.getByTestId("rule-reg-submit")).toBeDisabled();
  146 | 
  147 |     // 화면 검사를 지나도록 올바른 ID 를 넣고, 요청 본문을 규칙 위반 ID 로 바꿔 보낸다 → 서버가 판정한다(I1).
  148 |     await page.getByTestId("rule-reg-id").fill("E2E_ROUTE_JDG");
  149 |     await page.route("**/api/mdm/oasis/ruleMng/reg", async (route) => {
  150 |       const body = JSON.parse(route.request().postData() ?? "{}");
  151 |       body.params.maruRuleId = "qlty-bad";
  152 |       await route.continue({ postData: JSON.stringify(body) });
  153 |     });
  154 |     await page.getByTestId("rule-reg-submit").click();
  155 |     // 서버 오류 ErrorModal — 등록 팝업(rule-register-form 을 품은 dialog)이 아닌 dialog 로 좁힌다.
  156 |     await expect(page.getByRole("dialog").filter({ hasNot: page.getByTestId("rule-register-form") }).getByText(/컬럼 물리명 규칙/)).toBeVisible({ timeout: 20_000 });
  157 |     await page.unroute("**/api/mdm/oasis/ruleMng/reg");
  158 |   });
  159 | 
  160 |   test("T6 수용 2: 등록 폼에 원천 선택 칸이 없고 MDM 고정이다", async ({ page }) => {
  161 |     await login(page, STEWARD);
  162 |     await openRuleMng(page);
  163 |     await openRuleRegister(page);
  164 |     const form = page.getByTestId("rule-register-form");
  165 |     await expect(form.getByTestId("rule-reg-source")).toHaveText(/MDM/);
  166 |     await expect(form.locator("select")).toHaveCount(1); // 종류만 고른다
  167 |     await expect(form.getByText("EXTERNAL")).toHaveCount(0);
  168 |   });
  169 | 
  170 |   test("T7 권한: 표준 관리자(READ)는 목록은 보고 등록 버튼은 비활성이다", async ({ page }) => {
  171 |     await login(page, STDADMIN);
  172 |     await openRuleMng(page);
  173 |     await page.getByRole("button", { name: "조회", exact: true }).click();
  174 |     await expect(page.getByTestId("rule-link-QLTY_GRD_JDG")).toBeVisible({ timeout: 30_000 });
  175 |     await expect(page.locator("#btn_rule_reg")).toBeDisabled();
  176 |   });
  177 |   // ── D-105 — ① 헤더·② 버전 상세 (옮겨 온 시험) ──
  178 | 
  179 |   test("H1 헤더: 룰명을 바꿔 바로 저장하면 다시 불러와도 유지된다", async ({ page }) => {
  180 |     await login(page, STEWARD);
  181 |     await openRuleMng(page);
  182 |     await openDetail(page, "QLTY_GRD_JDG");
  183 |     await page.getByTestId("rule-header-name").fill("품질 등급 판정 E2E");
  184 |     await page.getByRole("button", { name: "헤더 저장", exact: true }).click();
  185 |     await expect(page.getByTestId("rule-header-name")).toHaveValue("품질 등급 판정 E2E", { timeout: 20_000 });
  186 |     await page.reload();
  187 |     await openRuleMng(page);
  188 |     await openDetail(page, "QLTY_GRD_JDG");
  189 |     await expect(page.getByTestId("rule-header-name")).toHaveValue("품질 등급 판정 E2E");
  190 |   });
  191 | 
  192 |   test("H2 수용 5: 새 버전은 버전 2 DRAFT(base 1, 편집 중(나))이고 그 뒤 새 버전은 막힌다", async ({ page }) => {
  193 |     await login(page, STEWARD);
  194 |     await openRuleMng(page);
  195 |     await openDetail(page, "QLTY_GRD_JDG");
  196 |     await page.getByRole("button", { name: "새 버전", exact: true }).click();
  197 |     await expect(versionRow(page, 2).locator('[data-status="DRAFT"]')).toBeVisible({ timeout: 20_000 });
  198 |     await expect(versionRow(page, 2).locator('.ag-cell[col-id="baseVer"]')).toHaveText("1");
  199 |     await expect(page.getByTestId("rule-version-table").getByText("편집 중(나)")).toBeVisible();
```