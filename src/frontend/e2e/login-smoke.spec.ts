import { expect, test } from "@playwright/test";

interface SmokeAppConfig {
  appId: "mcm";
  baseUrl: string;
  userEnvKey: string;
  passwordEnvKey: string;
}

const smokeApps: SmokeAppConfig[] = [
  {
    appId: "mcm",
    baseUrl: process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5000",
    userEnvKey: "SMOKE_MCM_USER",
    passwordEnvKey: "SMOKE_MCM_PASSWORD",
  },
];

for (const app of smokeApps) {
  test(`[${app.appId}] login smoke redirects to /portal`, async ({ page }) => {
    const userId = process.env[app.userEnvKey] ?? process.env.SMOKE_LOGIN_USER;
    const password = process.env[app.passwordEnvKey] ?? process.env.SMOKE_LOGIN_PASSWORD;

    test.skip(
      !userId || !password,
      `${app.userEnvKey}/${app.passwordEnvKey} 또는 SMOKE_LOGIN_USER/SMOKE_LOGIN_PASSWORD 설정이 필요합니다.`
    );

    await page.goto(`${app.baseUrl}/login`);
    await page.getByLabel("User ID").fill(userId);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/portal(?:\?.*)?$/);
  });
}
