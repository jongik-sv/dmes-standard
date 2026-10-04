import { expect, test } from "@playwright/test";
import { BASE_URL } from "./support/common";

interface GuardAppConfig {
  appId: "mcm";
  baseUrl: string;
}

const guardApps: GuardAppConfig[] = [
  {
    appId: "mcm",
    baseUrl: BASE_URL,
  },
];

async function isAppReachable(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/login`, {
      redirect: "manual",
    });
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

for (const app of guardApps) {
  test(`[${app.appId}] unauthenticated /portal redirects to login with callbackUrl`, async ({
    page,
  }) => {
    test.skip(
      !(await isAppReachable(app.baseUrl)),
      `${app.baseUrl} 앱 실행이 필요합니다.`,
    );

    await page.goto(`${app.baseUrl}/portal`);
    await expect(page).toHaveURL(
      new RegExp(
        `^${escapeRegExp(app.baseUrl)}/login\\?callbackUrl=%2Fportal(?:%2F.*)?$`,
      ),
    );
  });

  test(`[${app.appId}] unauthenticated auth/portal APIs return 401`, async ({
    request,
  }) => {
    test.skip(
      !(await isAppReachable(app.baseUrl)),
      `${app.baseUrl} 앱 실행이 필요합니다.`,
    );

    const authMeResponse = await request.get(`${app.baseUrl}/api/auth/me`);
    expect(authMeResponse.status()).toBe(401);
    await expect(authMeResponse.json()).resolves.toEqual({
      authenticated: false,
    });

    const portalMenuResponse = await request.post(
      `${app.baseUrl}/api/mcm/oasis/secUser/myMenusTree`,
    );
    expect(portalMenuResponse.status()).toBe(401);
    await expect(portalMenuResponse.json()).resolves.toEqual({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "인증이 필요합니다.",
      },
    });

    const portalFavoritesResponse = await request.post(
      `${app.baseUrl}/api/mcm/oasis/secFavorite/search`,
    );
    expect(portalFavoritesResponse.status()).toBe(401);
    await expect(portalFavoritesResponse.json()).resolves.toEqual({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "인증이 필요합니다.",
      },
    });

    const portalStartPagesResponse = await request.post(
      `${app.baseUrl}/api/mcm/oasis/secStartPgm/search`,
    );
    expect(portalStartPagesResponse.status()).toBe(401);
    await expect(portalStartPagesResponse.json()).resolves.toEqual({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "인증이 필요합니다.",
      },
    });
  });
}
