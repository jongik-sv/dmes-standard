import path from "node:path";
import { expect, test } from "@playwright/test";

import { LOGIN_USER, T, login, walkMenuPath } from "./support/common";

/**
 * 검사증명서관리(목업 이식, docs/mqc/demo/mtc-contract.md) 스모크.
 * 탭 5개를 차례로 열어 화면을 찍고, 진위 확인(정상·위조 흉내)을 눌러 본다. 콘솔 오류·실패한 mqc 응답이 없어야 한다.
 */
const SHOTS = process.env.MQC_DEMO_SHOTS ?? path.resolve(__dirname, "../../..", "docs/mqc/demo/screens");
const TABS = [
  ["발행", "mtc-1-issue"],
  ["양식 편집", "mtc-2-form"],
  ["단건 수정", "mtc-3-ovr"],
  ["예외 규칙", "mtc-4-rule"],
  ["서명·스탬프", "mtc-5-sign"],
] as const;

// 시험이 바꾼 시연 데이터를 시드로 되돌린다(reset).
test.afterAll(async ({ request }) => {
  await request.post("http://localhost:8093/api/mqc/oasis/inspectionCertificate/reset", {
    headers: {
      "X-Client-Key": process.env.BACKEND_CLIENT_KEY ?? "dmes-bff-local-client-key-2026",
      "X-Authenticated-User": "admin",
      "X-Authenticated-Role": "SYSADMIN",
    },
    data: { meta: { menuId: "inspectionCertificate" }, params: {} },
  });
});

test("검사증명서관리 탭 5개와 진위 확인이 오류 없이 동작한다", async ({ page }) => {
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
  await walkMenuPath(page, [/^출력물관리$/, /^검사증명서관리$/]);
  const tab = page.locator(".portal-shell__tab-page:visible");
  await expect(tab.getByText("검사증명서관리").first()).toBeVisible({ timeout: T.SLOW });
  await page.waitForLoadState("networkidle", { timeout: T.LONG }).catch(() => undefined);

  for (const [name, file] of TABS) {
    await tab.getByRole("tab", { name }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, `${file}.png`) });
  }
  // 발행 탭 — 진위 확인: 정상 → 위조 흉내 → 재발행 후 이전 번호는 대체됨 → 신규 수신 자동 발행
  await tab.getByRole("tab", { name: /^발행/ }).click();
  const verify = tab.getByTestId("mtc-verify");
  const status = tab.getByTestId("mtc-verify-status");
  await verify.getByRole("button", { name: "선택한 건 번호 넣기" }).click();
  const oldCode = await verify.getByLabel("진위 확인 번호").inputValue();
  await verify.getByRole("button", { name: "확인", exact: true }).click();
  await expect(status).toHaveText("정상", { timeout: T.SLOW });
  await verify.getByRole("button", { name: "위조 흉내" }).click();
  await expect(status).toHaveText("위변조 의심", { timeout: T.SLOW });
  await page.screenshot({ path: path.join(SHOTS, "mtc-6-verify.png") });

  await tab.getByRole("button", { name: "재발행 (현재 규칙)" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "재발행", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: T.SLOW });
  await verify.getByLabel("진위 확인 번호").fill(oldCode);
  await verify.getByRole("button", { name: "확인", exact: true }).click();
  await expect(status).toHaveText("대체됨", { timeout: T.SLOW });

  await tab.getByRole("button", { name: "데이터 수신 → 자동 발행" }).click();
  await expect(tab.getByRole("tab", { name: "발행 (6)" })).toBeVisible({ timeout: T.SLOW });

  console.log(problems.length ? `문제 ${problems.length}건\n${problems.join("\n")}` : "문제 없음");
  expect(problems).toEqual([]);
});
