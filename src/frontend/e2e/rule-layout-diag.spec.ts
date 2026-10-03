import { expect, test, type Page } from "@playwright/test";
import { T, loginByApi } from "./support/common";

/**
 * 룰 화면(ruleEdit) · 룰 세트 편집(ruleSetEdit) 레이아웃 진단.
 *
 * PageLayout 구조 = .page-layout(flex column, height:100%, overflow:hidden)
 *   ├ .page-layout__header  (flex-shrink:0)
 *   ├ {children}            ← 스크롤 컨테이너가 없음
 *   └ .page-layout__footer  (flex-shrink:0, height:24px, margin-top:auto 없음)
 *
 * 이 두 화면은 ContentBody(flex:1 1 0; height:0)를 쓰지 않고 자체 16칸 카드 그리드를
 * children 으로 직접 둔다. children 이 flex:1 을 갖지 않아
 *   (a) 넘치면 잘리고 스크롤이 없고
 *   (b) 남는 공간이 footer 아래에 붙어 footer 가 맨 아래로 밀리지 않는다.
 *
 * 전제: 5100 포털 + mcm/mdm 백엔드.
 */

const BASE = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";

/** 마루 MDM > 업무기준 > leaf 를 순서대로 연다. 이미 펼쳐져 있으면 클릭을 무시한다. */
async function openMenu(page: Page, leaf: RegExp) {
  for (const label of ["마루 MDM", "업무기준"]) {
    const n = page.locator(".tree-item .item-name").filter({ hasText: label }).first();
    await expect(n).toBeVisible({ timeout: T.LONG });
    await n.click().catch(() => {});
    await page.waitForTimeout(400);
  }
  const t = page.locator(".tree-item .item-name").filter({ hasText: leaf }).first();
  await expect(t).toBeVisible({ timeout: T.UI });
  await t.click();
}

interface Probe {
  viewport: number;
  layoutH: number;
  headerH: number;
  footerH: number;
  footerBottomGap: number;
  layoutScrollOverflow: number;
  kids: Array<{ testid: string; tag: string; h: number; clippedBy: number; scrollH: number; clientH: number }>;
}

async function measure(page: Page, screenId: string): Promise<Probe> {
  const m = (await page.evaluate((sid) => {
    const layout = [...document.querySelectorAll(".page-layout")].find(
      (el) => el.querySelector(".page-layout__footer-screen-id")?.textContent?.trim() === sid,
    ) as HTMLElement | undefined;
    if (!layout) return null;
    const footer = layout.querySelector(".page-layout__footer") as HTMLElement;
    const header = layout.querySelector(".page-layout__header") as HTMLElement;
    const kids = [...layout.children].filter((c) => c !== header && c !== footer) as HTMLElement[];
    const lr = layout.getBoundingClientRect();
    const fr = footer.getBoundingClientRect();
    const floor = lr.bottom - fr.height;
    return {
      viewport: window.innerHeight,
      layoutH: Math.round(lr.height),
      headerH: Math.round(header.getBoundingClientRect().height),
      footerH: Math.round(fr.height),
      footerBottomGap: Math.round(lr.bottom - fr.bottom),
      layoutScrollOverflow: layout.scrollHeight - layout.clientHeight,
      kids: kids.map((k) => {
        const r = k.getBoundingClientRect();
        return {
          tag: k.tagName.toLowerCase(),
          testid: k.getAttribute("data-testid") || "",
          h: Math.round(r.height),
          clippedBy: Math.round(Math.max(0, r.bottom - floor)),
          scrollH: k.scrollHeight,
          clientH: k.clientHeight,
        };
      }),
    };
  }, screenId)) as Probe | null;
  if (!m) throw new Error(`${screenId} 화면(.page-layout)을 찾지 못했다`);
  return m;
}

test("ruleSetEdit — footer 맨 아래 + 본문 미잘림", async ({ page, context }) => {
  test.setTimeout(150_000);
  page.setViewportSize({ width: 1600, height: 900 });
  await loginByApi(context, { baseUrl: BASE, openPortal: page });

  await openMenu(page, /^룰 세트 편집$/);
  await expect(page.getByTestId("set-pick-keyword")).toBeVisible({ timeout: T.SLOW });

  // 본문(카드 그리드)이 다 그려진 상태를 만든다.
  // 본문(카드 그리드)이 다 그려진 상태를 만든다.
  await page.getByTestId("set-pick-keyword").fill("LS_A3");
  await page.getByTestId("set-edit-topbar").getByRole("button", { name: "찾기" }).click();
  const pick = page.getByTestId("set-pick-LS_A3");
  await expect(pick, `세트 ${"LS_A3"} 픽 버튼이 안 떴다`).toBeVisible({ timeout: 15_000 });
  await pick.click();
  await expect(page.getByTestId("set-card-id")).toHaveText("LS_A3", { timeout: T.LONG });
  await page.waitForTimeout(1_500);

  const m = await measure(page, "ruleSetEdit");
  console.log(`[ruleSetEdit] ${JSON.stringify(m)}`);

  expect(m.footerBottomGap, `footer 아래 빈 공간 ${m.footerBottomGap}px`).toBeLessThanOrEqual(2);
  for (const k of m.kids) {
    expect(k.clippedBy, `${k.testid || k.tag} 이 아래 ${k.clippedBy}px 잘림`).toBeLessThanOrEqual(0);
  }

  if (process.env.SNAP_OUT) await page.screenshot({ path: process.env.SNAP_OUT, fullPage: false });
});

test("ruleEdit — footer 맨 아래 + 본문 미잘림", async ({ page, context }) => {
  test.setTimeout(150_000);
  page.setViewportSize({ width: 1600, height: 900 });
  await loginByApi(context, { baseUrl: BASE, openPortal: page });

  await openMenu(page, /^룰 화면$/);
  await expect(page.getByTestId("rule-pick-keyword")).toBeVisible({ timeout: T.SLOW });

  await page.getByTestId("rule-pick-keyword").fill("BASE_SPD_LKP");
  await page.getByTestId("rule-edit-topbar").getByRole("button", { name: "찾기" }).click();
  await page.waitForTimeout(2_000);
  const pick = page.getByTestId("rule-pick-BASE_SPD_LKP");
  if (await pick.isVisible({ timeout: 5_000 }).catch(() => false)) await pick.click();
  await page.waitForTimeout(2_500);
  if (process.env.SNAP_OUT) await page.screenshot({ path: `${process.env.SNAP_OUT}-ruleEdit.png`, fullPage: false });

  const m = await measure(page, "ruleEdit");
  console.log(`[ruleEdit] ${JSON.stringify(m)}`);

  expect(m.footerBottomGap, `footer 아래 빈 공간 ${m.footerBottomGap}px`).toBeLessThanOrEqual(2);
  for (const k of m.kids) {
    expect(k.clippedBy, `${k.testid || k.tag} 이 아래 ${k.clippedBy}px 잘림`).toBeLessThanOrEqual(0);
  }

  if (process.env.SNAP_OUT) await page.screenshot({ path: `${process.env.SNAP_OUT}-ruleEdit.png`, fullPage: false });
});
