import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { LOGIN_USER, T, login, walkMenuPath } from "./support/common";

/**
 * mqc 품질관리 시연 화면 스모크(2026-11-25, docs/mqc/demo/README.md).
 * 메뉴 19개를 차례로 열어 화면 제목이 뜨는지, 콘솔 오류·실패한 API 응답이 없는지 보고 화면을 찍는다.
 * 전제: mcm·mdm·mqc 서버와 포털(5100)이 떠 있고 Maru 기준데이터가 적재돼 있다(scripts/mqc-demo/mdm/README.md).
 */

const SHOTS = process.env.MQC_DEMO_SHOTS ?? path.resolve(__dirname, "../../..", "docs/mqc/demo/screens");

const SCREENS: { trail: RegExp[]; name: string; file: string }[] = [
  { trail: [/^품질관리$/, /^품질설계$/, /^모듈관리$/, /^품질사양 관리$/], name: "품질사양 관리", file: "01-qualitySpec" },
  { trail: [/^원자재강종관리$/], name: "원자재강종관리", file: "02-rawMaterialGrade" },
  { trail: [/^규격약호관리$/], name: "규격약호관리", file: "03-specCode" },
  { trail: [/^압연두께Set보정관리$/], name: "압연두께Set보정관리", file: "04-rollingThicknessSet" },
  { trail: [/^공정라우팅관리$/], name: "공정라우팅관리", file: "05-processRouting" },
  { trail: [/^폭수축량관리$/], name: "폭수축량관리", file: "06-lineWidthShrinkage" },
  { trail: [/^폭마진량관리$/], name: "폭마진량관리", file: "07-lineWidthMargin" },
  { trail: [/^생산가부관리$/, /^주문단중에러관리$/], name: "주문단중에러관리", file: "08-orderWeightError" },
  { trail: [/^주문정합성관리$/], name: "주문정합성관리", file: "09-orderConsistency" },
  // 폴더 생산가부관리 아래 화면 생산가부관리 — 같은 이름이라 두 번째 항목(화면)을 누른다.
  { trail: [/^생산가부관리#2$/], name: "생산가부관리", file: "10-productionFeasibility" },
  { trail: [/^설계결과관리$/, /^품질설계결과$/], name: "품질설계결과", file: "11-qualityDesignResult" },
  { trail: [/^시뮬레이션$/], name: "시뮬레이션", file: "12-designSimulation" },
  { trail: [/^기준정보관리$/, /^마스터코드$/], name: "마스터코드", file: "13-masterCode" },
  { trail: [/^칼라부재료관리$/], name: "칼라부재료관리", file: "14-colorSubmaterial" },
  { trail: [/^칼라BOM관리$/], name: "칼라BOM관리", file: "15-colorBom" },
  // 폴더 품질판정 아래 화면 품질판정 — 같은 이름이라 두 번째 항목(화면)을 누른다(아래 openScreen).
  { trail: [/^품질판정$/, /^품질판정#2$/], name: "품질판정", file: "16-qualityJudgment" },
  { trail: [/^출력물관리$/, /^품질보증서관리$/], name: "품질보증서관리", file: "17-qualityCertificate" },
  { trail: [/^검사증명서관리$/], name: "검사증명서관리", file: "18-inspectionCertificate" },
  { trail: [/^Tag관리$/], name: "Tag관리", file: "19-tagManagement" },
];

test.describe.configure({ mode: "serial" });

test("mqc 시연 화면 19개가 열리고 오류가 없다", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const problems: string[] = [];
  let current = "로그인";
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[${current}] console: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => problems.push(`[${current}] pageerror: ${e.message.slice(0, 300)}`));
  page.on("response", async (r) => {
    const url = r.url();
    if (!url.includes("/api/mqc/")) return;
    if (r.status() >= 400) problems.push(`[${current}] HTTP ${r.status()} ${url}`);
    else {
      try {
        const body = await r.json();
        if (body?.meta?.success === false || body?.success === false) {
          problems.push(`[${current}] FAIL ${url} ${(body?.meta?.message ?? body?.message ?? "").slice(0, 200)}`);
        }
      } catch {
        /* JSON 이 아닌 응답은 무시 */
      }
    }
  });

  await login(page, LOGIN_USER);
  for (const s of SCREENS) {
    current = s.name;
    for (const t of s.trail) {
      const m = /^\^(.*)#2\$$/.exec(t.source);
      if (m) await page.locator(".tree-item .item-name").filter({ hasText: new RegExp(`^${m[1]}$`) }).nth(1).click({ timeout: T.UI });
      else await walkMenuPath(page, [t]);
    }
    const tab = page.locator(".portal-shell__tab-page:visible");
    await expect(tab).toBeVisible({ timeout: T.SLOW });
    await expect(tab.getByText(s.name).first()).toBeVisible({ timeout: T.SLOW });
    await page.waitForLoadState("networkidle", { timeout: T.LONG }).catch(() => undefined);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, `${s.file}.png`), fullPage: false });
  }
  await openScenarios(page);
  console.log(problems.length ? `문제 ${problems.length}건\n${problems.join("\n")}` : "문제 없음");
  expect(problems).toEqual([]);
});

/** 화면 안 동작 몇 가지 — 탭 전환이 오류 없이 되는지. */
async function openScenarios(_page: Page) {
  /* 탭별 시나리오는 화면 담당 시험(vitest)과 수동 시연으로 본다. */
}
