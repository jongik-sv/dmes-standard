import { test } from "@playwright/test";

const SCREENS = [
  { id: "commObjMng",       label: "OBJECT 관리" },
  { id: "commMenuMng",      label: "메뉴 관리" },
  { id: "commRoleMng",      label: "역할 관리" },
  { id: "commRoleGrpMng",   label: "역할 그룹 관리" },
  { id: "commUserMng",      label: "사용자 관리" },
  { id: "commPermMng",      label: "PERMISSION 관리" },
  { id: "commUserRoleCopy", label: "사용자 권한 일괄 등록" },
  { id: "commSyncMng",      label: "동기화 관리" },
  { id: "masterCodeMngList",label: "Master Code 상세조회" },
];

const BASE = "http://localhost:5000";
const SESSION_TOKEN = "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..C5DMs_PGXltSqytT.vsXLDpxQ2k8BNa9sOgpfGZzaIV4KtWesLIKkqsz3tFXDmfmJWemey1RS9GP5g5G6Ku2kVeqTH5r2tBhTkSqv7Vp9eNkwr-SVNPLdFN-tEqxUcQMFZdaykzeDDoSqxZzzLLf5qnuFk-qWxKuE96jEPkHDfHBnv95BP-FkqQ6s1zZxi2n0w4N4KxaFA_an3fXG62oIou81A-N8S8gYtV295YUjRwKX7NsprfNloD7WhlrKz3wCou3crv-4SGE36Wp1qMdKdclc3hqrqriOs-qXGu00WL5CHeaYTtdPSt6FKyXpshluCNIoVBRKJVc1G_bGoMNenU1cFtlHS7QcODOQ0r4s8Z90PFFzJLsS72OQYEZUrfmGga2QCaX0d5mNYuHbRcct3c1BYWYI7_KMmsqsQcAVPiB96I7JI15_RM18x1jBr8wawSgc66yYIAVgR_6QVJb27l6bFY-jqFW_PH5KS4y7f4Udqh5_iWGX0G53Ws5d6SS1EBSVn5griUXBYl5p4BN9DUnfZqHy_7FR6BuGIJ-mYqDu14G6FPpyQVsRtw2uKY8D0zoyV_cNwhsTrDpu6a-95bPHCzEog-d8rvlINJ922K7GAs6aAXtN-xDnakC9lxF0OaEpuYE-R7vvwxlhXgo4XHW3TP4HKf3UOPt8iqnZq1vOMnpSinzkNJvA0l9AwkqhSQ4WPKFf3IGcUv0ivQBku9uJef1GO193mrvUFsbh7VfInZZttE3iYB8wanD4LRAkQrJoPltvygy5JTlHx9pKCt5SMOxHkhn24dpc4c5xhTqesCyeBmVR8NJfZ4dM4iyDzNU4pJspI-v2uLymoCxxdqJ2IqTLsdCu3RfzMyMJrXeXphl4UZUOBXDkBfXTRPCOJt4tMx7PH-veL1numdnfdT6v2qSoz88rfSGzgJp2137lZClQRdneaNH0f8oIB8-EVqnTUc3cn946AsbbPi8.w7fjq1T3HBp9sYg8zraHag";

test.describe.configure({ mode: "serial" });

test("snapshot 9 screens via menu", async ({ page, context }) => {
  test.setTimeout(600_000);
  page.setViewportSize({ width: 1600, height: 900 });

  await context.addCookies([
    { name: "oasis-mcm-auth.session-token", value: SESSION_TOKEN, url: BASE, httpOnly: true, sameSite: "Lax" },
  ]);

  await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3_500);

  const dismissModal = async () => {
    try {
      const b = page.getByRole("button", { name: "확인", exact: true }).first();
      if (await b.isVisible({ timeout: 600 })) { await b.click(); await page.waitForTimeout(300); }
    } catch {}
  };

  // Sidebar-scoped click — only consider tree items inside the menu panel
  const clickSidebarItem = async (label: string) => {
    const sel = `.tree-item:has-text("${label}")`;
    const loc = page.locator(sel).first();
    await loc.waitFor({ state: "visible", timeout: 6_000 });
    await loc.scrollIntoViewIfNeeded();
    await loc.click({ timeout: 4_000 });
    await page.waitForTimeout(450);
  };

  // Expand groups (idempotent)
  for (const g of ["공통관리", "시스템관리", "마스터관리(가동)"]) {
    try { await clickSidebarItem(g); } catch {}
  }
  await page.screenshot({ path: "snap/12_menu_full.png", fullPage: false });

  for (const s of SCREENS) {
    await dismissModal();
    // Re-expand if needed (folder click may toggle collapse)
    for (const g of ["공통관리", "시스템관리", "마스터관리(가동)"]) {
      const folder = page.locator(`.tree-item--folder:has-text("${g}")`).first();
      if (await folder.isVisible({ timeout: 1_000 }).catch(() => false)) {
        // Check if the immediate child is visible. If not, expand.
        const childVisible = await page.locator(`.tree-item--page:visible`).count();
        if (childVisible < 9) { try { await folder.click({ timeout: 1_000 }); await page.waitForTimeout(250); } catch {} }
      }
    }
    try {
      await clickSidebarItem(s.label);
      await page.waitForTimeout(4_000);
      await dismissModal();
      await page.waitForTimeout(700);
      await page.screenshot({ path: `snap/${s.id}.png`, fullPage: false });
      console.log(`OPEN_OK ${s.id}`);
    } catch (e) {
      console.log(`OPEN_FAIL ${s.id}:`, (e as Error).message.slice(0, 150));
      await page.screenshot({ path: `snap/${s.id}_fail.png`, fullPage: false });
    }
  }
});
