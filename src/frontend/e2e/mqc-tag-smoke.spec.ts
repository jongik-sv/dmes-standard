import path from "node:path";
import { expect, test } from "@playwright/test";

import { LOGIN_USER, T, login, walkMenuPath } from "./support/common";

/**
 * Tag관리(TAG 발행 시뮬레이터 목업 이식, docs/mqc/demo/tag-contract.md) 스모크.
 * 오른쪽 탭 4개와 기준값 표를 열어 화면을 찍고, 칸 값 고치기 → 초안 → 승인 요청 → 승인(v2)을 눌러 본다. 끝나면 초기화한다.
 */
const SHOTS = process.env.MQC_DEMO_SHOTS ?? path.resolve(__dirname, "../../..", "docs/mqc/demo/screens");
const TABS = [
  ["칸", "tag-1-field"],
  ["칸 목록", "tag-2-list"],
  ["코일 조건", "tag-3-coil"],
  ["출력 점검", "tag-4-out"],
] as const;

test.afterAll(async ({ request }) => {
  await request.post("http://localhost:8093/api/mqc/oasis/tagManagement/reset", {
    headers: {
      "X-Client-Key": process.env.BACKEND_CLIENT_KEY ?? "dmes-bff-local-client-key-2026",
      "X-Authenticated-User": "admin",
      "X-Authenticated-Role": "SYSADMIN",
    },
    data: { meta: { menuId: "tagManagement" }, params: {} },
  });
});

test("Tag관리 탭과 승인 흐름이 오류 없이 동작한다", async ({ page }) => {
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
  await walkMenuPath(page, [/^출력물관리$/, /^Tag관리$/]);
  const tab = page.locator(".portal-shell__tab-page:visible");
  const state = tab.getByTestId("tag-state");
  await expect(state).toHaveText("적용본 v1", { timeout: T.LONG });
  await expect(tab.getByTestId("tag-stage")).toBeVisible({ timeout: T.SLOW });
  await page.waitForTimeout(1500);

  for (const [name, file] of TABS) {
    await tab.getByRole("tab", { name, exact: true }).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(SHOTS, `${file}.png`) });
  }
  await tab.getByRole("button", { name: "기준값 표" }).first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(SHOTS, "tag-5-table.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: T.SLOW });

  await tab.getByRole("tab", { name: "칸", exact: true }).click();
  const ed = tab.locator("input[data-ed]").first();
  await ed.fill(`${await ed.inputValue()}-1`);
  await expect(state).toHaveText("초안 — 발행 안 됨", { timeout: T.SLOW });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SHOTS, "tag-6-draft.png") });
  await tab.getByRole("button", { name: "승인 요청" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "승인 요청" }).click();
  await expect(state).toHaveText("승인 대기", { timeout: T.SLOW });
  await page.keyboard.press("Escape");
  await tab.getByRole("button", { name: "승인", exact: true }).click();
  await expect(state).toHaveText("적용본 v2", { timeout: T.SLOW });

  console.log(problems.length ? `문제 ${problems.length}건\n${problems.join("\n")}` : "문제 없음");
  expect(problems).toEqual([]);
});
