import path from "node:path";
import { expect, test } from "@playwright/test";

import { LOGIN_USER, T, login, walkMenuPath } from "./support/common";

/**
 * 품질보증서관리(보증서 편집 목업 이식, docs/mqc/demo/wty-contract.md) 스모크.
 * 탭 5개를 열어 화면을 찍고, 문구 모두 바꾸기 → 초안 → 승인 요청 → 승인(v2)을 눌러 본다. 끝나면 초기화한다.
 */
const SHOTS = process.env.MQC_DEMO_SHOTS ?? path.resolve(__dirname, "../../..", "docs/mqc/demo/screens");
const TABS = [
  ["조항·블록", "wty-1-clause"],
  ["기준값", "wty-2-value"],
  ["양식", "wty-3-form"],
  ["이미지·서명", "wty-4-image"],
  ["이력", "wty-5-history"],
] as const;

test.afterAll(async ({ request }) => {
  await request.post("http://localhost:8093/api/mqc/oasis/qualityCertificate/reset", {
    headers: {
      "X-Client-Key": process.env.BACKEND_CLIENT_KEY ?? "dmes-bff-local-client-key-2026",
      "X-Authenticated-User": "admin",
      "X-Authenticated-Role": "SYSADMIN",
    },
    data: { meta: { menuId: "qualityCertificate" }, params: {} },
  });
});

test("품질보증서관리 탭과 승인 흐름이 오류 없이 동작한다", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const problems: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on("response", async (r) => {
    if (!r.url().includes("/api/mqc/")) return;
    if (r.status() >= 400) { problems.push(`HTTP ${r.status()} ${r.url()}`); return; }
    try {
      const b = await r.json();
      if (b?.meta?.success === false) problems.push(`FAIL ${r.url()} ${b?.meta?.message ?? ""}`);
    } catch { /* JSON 아님 */ }
  });

  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page, LOGIN_USER);
  await walkMenuPath(page, [/^출력물관리$/, /^품질보증서관리$/]);
  const tab = page.locator(".portal-shell__tab-page:visible");
  await expect(tab.getByText("품질보증서관리").first()).toBeVisible({ timeout: T.SLOW });
  const state = tab.getByTestId("wty-state");
  await expect(state).toHaveText("승인 완료", { timeout: T.SLOW });
  await page.waitForTimeout(1500);

  for (const [name, file] of TABS) {
    await tab.getByRole("tab", { name }).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(SHOTS, `${file}.png`) });
  }

  await tab.getByRole("tab", { name: "조항·블록" }).click();
  await tab.getByLabel("찾을 문구").fill("동국씨엠㈜");
  await tab.getByLabel("바꿀 문구").fill("동국씨엠 주식회사");
  await tab.getByRole("button", { name: "모두 바꾸기" }).click();
  await expect(state).toHaveText("초안 (미승인)", { timeout: T.SLOW });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SHOTS, "wty-6-draft.png") });
  await tab.getByRole("button", { name: "승인 요청" }).click();
  await expect(state).toHaveText("승인 대기", { timeout: T.SLOW });
  await tab.getByRole("button", { name: "승인", exact: true }).click();
  await expect(state).toHaveText("승인 완료", { timeout: T.SLOW });
  await expect(tab.getByText("적용본 v2")).toBeVisible({ timeout: T.SLOW });

  console.log(problems.length ? `문제 ${problems.length}건\n${problems.join("\n")}` : "문제 없음");
  expect(problems).toEqual([]);
});
