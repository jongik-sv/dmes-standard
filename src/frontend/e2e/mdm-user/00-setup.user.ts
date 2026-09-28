import fs from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  ADMIN,
  AUTH_DIR,
  INIT_PWD,
  USERS,
  Watcher,
  authFile,
  gridRow,
  loginUI,
  modal,
  openMenu,
  screen,
} from "./support";

/**
 * 시험 사용자 준비 — admin 이 포털 "공통관리 > 시스템관리 > 사용자 관리" 화면에서 사람이 하듯 만든다.
 *
 *   SETUP-01 사용자 등록: 없으면 행추가 → 상세 입력(사용자ID·사번·사용자명·부서 검색·이메일·내부외부) → 저장.
 *   SETUP-02 역할 부여: 역할조회 → 추가 가능 역할그룹에서 MDM 역할 체크 → 역할추가 → 역할저장.
 *   SETUP-03 비밀번호 초기화: Yes → 비밀번호 초기화 → 초기 비밀번호 안내 확인(재실행 때 비밀번호가 바뀌어 있어도 안전).
 *   SETUP-04 로그인: 각 사용자가 로그인 화면에서 로그인하고, 로그인 상태를 .out/auth/{역할}.json 에 남긴다.
 *
 * SYSADMIN(admin)은 MDM 담당자·표준관리자 동작을 서버가 거부하므로(MDM013) 역할별 사용자가 따로 있어야 한다.
 * 재실행해도 같은 사용자를 다시 쓴다(있으면 등록을 건너뛰고 역할·비밀번호만 맞춘다).
 */

test.describe.configure({ mode: "serial" });

const detailInput = (page: Page, label: string): Locator =>
  screen(page).locator("tr").filter({ has: page.locator("th", { hasText: new RegExp(`^${label}$`) }) }).locator("input").first();

const panel = (page: Page, title: string): Locator =>
  screen(page).locator(".grid-panel").filter({ has: page.locator(".grid-panel-title", { hasText: title }) });

/** 저장 결과 "알림" 모달을 확인으로 닫는다. */
async function closeNotice(page: Page, text: RegExp) {
  const m = modal(page);
  await expect(m).toContainText(text, { timeout: 20_000 });
  await m.getByRole("button", { name: "확인" }).click();
  await expect(m).toBeHidden();
}

async function searchUser(page: Page, userId: string) {
  await screen(page).getByPlaceholder("ID / 사번 / 이름").fill(userId);
  await screen(page).getByRole("button", { name: "조회", exact: true }).click();
  await expect(screen(page).locator(".page-layout").first()).not.toContainText("조회 중...");
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

test("SETUP-01~04 시험 사용자 등록·역할 부여·비밀번호 초기화·로그인", async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const watcher = new Watcher(page, testInfo);
  await loginUI(page, ADMIN.id, ADMIN.pwd);
  await openMenu(page, ["공통관리", "시스템관리", "사용자 관리"], "mcm:csa/commUserMng");

  const users = panel(page, "사용자 목록");
  for (const u of Object.values(USERS)) {
    await test.step(`${u.id} 등록`, async () => {
      await searchUser(page, u.id);
      if ((await gridRow(users, u.id, "USER_ID").count()) === 0) {
        await users.getByRole("button", { name: "행추가" }).click();
        await detailInput(page, "사용자ID \\*").fill(u.id);
        await detailInput(page, "사번 \\*").fill(u.empNo);
        await detailInput(page, "사용자명 \\*").fill(u.name);
        await detailInput(page, "이메일 \\*").fill(`${u.id.toLowerCase()}@example.com`);
        await screen(page)
          .locator("tr")
          .filter({ has: page.locator("th", { hasText: /^내부 외부 구분 \*$/ }) })
          .locator("select")
          .selectOption("I");
        // 부서코드는 직접 입력이 막혀 있다 — 검색 버튼 → 부서 검색 모달에서 고른다.
        await screen(page)
          .locator("tr")
          .filter({ has: page.locator("th", { hasText: /^부서코드 \*$/ }) })
          .getByRole("button", { name: "검색" })
          .click();
        const lov = modal(page);
        await expect(lov).toContainText("부서 검색");
        await lov.locator(".ag-center-cols-container .ag-row").first().click();
        await lov.getByRole("button", { name: "확인" }).click();
        await expect(lov).toBeHidden();
        await expect(detailInput(page, "부서코드 \\*")).not.toHaveValue("");

        await screen(page).getByRole("button", { name: "저장", exact: true }).click();
        await closeNotice(page, /1건 저장 되었습니다/);
        await searchUser(page, u.id);
      }
      await expect(gridRow(users, u.id, "USER_ID")).toHaveCount(1);
    });

    await test.step(`${u.id} 역할 ${u.roleGroup}`, async () => {
      await gridRow(users, u.id, "USER_ID").locator('.ag-cell[col-id="USER_ID"]').click();
      await expect(detailInput(page, "사용자ID \\*")).toHaveValue(u.id);
      const owned = panel(page, "보유 역할그룹");
      await page.waitForLoadState("networkidle").catch(() => undefined);
      if ((await gridRow(owned, u.roleGroup).count()) === 0) {
        const avail = panel(page, "추가 가능 역할그룹");
        await avail.getByRole("button", { name: "역할조회" }).click();
        const row = gridRow(avail, u.roleGroup);
        await expect(row).toHaveCount(1);
        await row.locator(".ag-selection-checkbox").click();
        await avail.getByRole("button", { name: "역할추가" }).click();
        await expect(gridRow(owned, u.roleGroup)).toHaveCount(1);
        await owned.getByRole("button", { name: "역할저장" }).click();
        await closeNotice(page, /역할 1건 저장 되었습니다/);
      }
      await expect(gridRow(owned, u.roleGroup)).toHaveCount(1);
    });

    await test.step(`${u.id} 비밀번호 초기화`, async () => {
      const row = screen(page).locator("tr").filter({ has: page.locator("th", { hasText: /^비밀번호 초기화$/ }) });
      await row.getByLabel("Yes").check();
      await row.getByRole("button", { name: "비밀번호 초기화" }).click();
      const m = modal(page);
      await expect(m).toBeVisible({ timeout: 20_000 });
      // 초기 비밀번호 안내 팝업(init-pwd-modal) 또는 "비밀번호가 초기화 되었습니다" 알림 — 둘 다 확인으로 닫는다.
      if (await m.getByTestId("init-pwd-close").isVisible().catch(() => false)) {
        await expect(m).toContainText(INIT_PWD);
        await m.getByTestId("init-pwd-close").click();
      } else {
        await expect(m).toContainText("비밀번호가 초기화 되었습니다");
        await m.getByRole("button", { name: "확인" }).click();
      }
      await expect(m).toBeHidden();
    });
  }
  expect(watcher.dialogs.length, "저장·역할저장·초기화 확인창을 수락했다").toBeGreaterThan(0);
  watcher.assertClean("사용자 관리");
  await context.close();

  for (const [role, u] of Object.entries(USERS)) {
    await test.step(`${u.id} 로그인 → ${role}.json`, async () => {
      const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const p = await ctx.newPage();
      await loginUI(p, u.id, INIT_PWD);
      await expect(p.locator(".sidebar-container .tree-item .item-name").filter({ hasText: /^마루 MDM$/ })).toBeVisible({
        timeout: 60_000,
      });
      await ctx.storageState({ path: authFile(role as keyof typeof USERS) });
      await ctx.close();
    });
  }
});
