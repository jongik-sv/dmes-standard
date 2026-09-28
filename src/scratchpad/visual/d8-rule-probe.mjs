// D8 룰 확정 취소 실서버 확인 (읽기 위주 — 취소까지만 하고 승인).
// Playwright 를 직접 구동한다. 산출물: /tmp/d8-shots/
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "/tmp/d8-shots";
fs.mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:5100";
const RULE = process.env.RULE_ID || "PROD_WGT_CALC";
const VER = process.env.RULE_VER || "2";

const log = (...a) => console.log("[probe]", ...a);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

const netCalls = [];
page.on("response", async (r) => {
  const u = r.url();
  if (u.includes("/oasis/ruleEdit/") || u.includes("/oasis/ruleConfirm/")) {
    netCalls.push({ url: u.split("/oasis/")[1], status: r.status() });
  }
});

const shot = async (name) => {
  const p = `${OUT}/${name}.png`;
  await page.screenshot({ path: p, fullPage: false });
  log("캡처", p);
};

try {
  // 1) 로그인
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("아이디").fill("admin");
  await page.getByPlaceholder("비밀번호").fill("admin123");
  await shot("01-login");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/portal/, { timeout: 30000 });
  log("로그인 성공 →", page.url());
  await page.waitForTimeout(2500);
  await shot("02-portal");

  // 2) 업무기준 > 룰 화면 이동 (사이드바)
  const sidebar = page.locator(".sidebar-container");
  await sidebar.waitFor({ timeout: 30000 });

  // "업무기준" 그룹 펼치기 시도
  for (const label of ["업무기준", "룰", "규칙"]) {
    const node = sidebar.getByText(label, { exact: false }).first();
    if (await node.count()) {
      log("사이드바에서", label, "발견 → 클릭");
      await node.click().catch(() => {});
      await page.waitForTimeout(1200);
      break;
    }
  }
  await shot("03-sidebar");

  fs.writeFileSync(`${OUT}/net-calls.json`, JSON.stringify(netCalls, null, 2));
  log("네트워크 호출:", JSON.stringify(netCalls));
  log("완료 — 다음 단계는 대화형 진행");
} catch (e) {
  log("오류:", e.message);
  await shot("99-error");
} finally {
  await ctx.storageState({ path: `${OUT}/auth.json` }).catch(() => {});
  log("storageState →", `${OUT}/auth.json`);
  // 브라우저는 닫지 않는다 — 다음 호출에서 재사용하려고 남겨둔다.
  globalThis.__keep = { browser, ctx, page };
  await new Promise(() => {});
}
