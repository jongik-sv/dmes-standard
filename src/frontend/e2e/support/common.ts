import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";

/**
 * e2e/*.spec.ts 공용 도우미 — 로그인·메뉴 이동·대기 시간 상수. 픽스처·조회·그리드 칸 확인은 mdm-e2e.ts, 그리드 행 찾기는 grid.ts.
 * 사용자 여정(e2e/mdm-user)은 자기 support.ts 를 쓴다.
 */

/**
 * 여러 스펙에 되풀이되는 대기 시간(ms). 숫자만 이름으로 묶었다 — 값을 바꾸면 그 이름을 쓰는 모든 호출의 대기 시간이 바뀐다.
 * 설정(playwright.config.ts)의 기본값(테스트 30_000·expect 10_000)과는 따로다. actionTimeout·navigationTimeout 은
 * 설정하지 않았으므로(무제한) 이 값들을 설정 기본값으로 올리지 않는다 — 올리면 시간을 적지 않은 호출의 대기가 바뀐다.
 */
export const T = {
  /** 화면 안 요소 대기의 표준값. */
  UI: 20_000,
  /** 로그인 뒤 포털 이동·저장 뒤 반영처럼 조금 긴 대기. */
  LONG: 30_000,
  /** 화면 첫 진입(지연 로딩 청크)·서버 왕복이 여러 번 끼는 대기. */
  SLOW: 60_000,
} as const;

/** 포털 주소. mdm 화면 스펙의 기본값(127.0.0.1)이다 — 기본값이 localhost 인 스펙은 자기 BASE_URL 을 login 의 baseUrl 로 넘긴다. */
export const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";

/** 시험 계정 공통 비밀번호(mcm 픽스처 사용자·admin). */
export const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";

export interface LoginOptions {
  /** 포털 주소. 기본 BASE_URL. */
  baseUrl?: string;
  /** 기본 PASSWORD. */
  password?: string;
  /** 로그인 뒤 /portal 로 넘어가길 기다리는 시간. 기본 T.LONG(30_000). */
  portalTimeout?: number;
  /** [로그인] 버튼을 이름 완전 일치로 찾는다. 기본 false(부분 일치). */
  exactButton?: boolean;
}

/** 로그인 화면에서 아이디·비밀번호를 넣고 [로그인] 을 눌러 포털로 넘어가길 기다린다. */
export async function login(page: Page, user: string, opts: LoginOptions = {}) {
  const { baseUrl = BASE_URL, password = PASSWORD, portalTimeout = T.LONG, exactButton = false } = opts;
  await page.goto(`${baseUrl}/login`);
  await page.getByPlaceholder("아이디").fill(user);
  await page.getByPlaceholder("비밀번호").fill(password);
  await page.getByRole("button", exactButton ? { name: "로그인", exact: true } : { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/portal/, { timeout: portalTimeout });
}

export interface ApiLoginOptions {
  /** 포털 주소(필수 — 스펙마다 기본값·환경변수 사용 여부가 다르다). */
  baseUrl: string;
  /** 기본 "admin". */
  user?: string;
  /** 기본 "admin123"(환경변수를 읽지 않는다 — 옮기기 전 스펙들이 글자 그대로 넣던 값). */
  password?: string;
  /** 주면 로그인 뒤 그 페이지로 /portal 을 연다(domcontentloaded). */
  openPortal?: Page;
}

/** 로그인 화면을 거치지 않고 next-auth CSRF 토큰 + credentials 콜백으로 세션 쿠키를 받는다. */
export async function loginByApi(context: BrowserContext, opts: ApiLoginOptions) {
  const { baseUrl, user = "admin", password = "admin123", openPortal } = opts;
  const csrfResp = await context.request.get(`${baseUrl}/api/auth/csrf`);
  const { csrfToken } = await csrfResp.json();
  await context.request.post(`${baseUrl}/api/auth/callback/credentials`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: `csrfToken=${csrfToken}&userId=${user}&password=${password}&callbackUrl=${encodeURIComponent(baseUrl + "/portal")}&json=true`,
  });
  if (openPortal) await openPortal.goto(`${baseUrl}/portal`, { waitUntil: "domcontentloaded" });
}

export interface MenuOptions {
  /** 보이는 메뉴 항목만 대상으로 삼는다(.item-name:visible). 기본 false. */
  visibleOnly?: boolean;
}

/** 사이드바 메뉴 트리의 항목(이름 칸). 같은 이름이 여럿이면 첫 항목. */
export function menuItem(page: Page, text: RegExp, opts: MenuOptions = {}): Locator {
  const selector = opts.visibleOnly ? ".tree-item .item-name:visible" : ".tree-item .item-name";
  return page.locator(selector).filter({ hasText: text }).first();
}

/** 메뉴 경로를 차례로 누른다(각 항목 click 대기 T.UI). 이미 펼쳐진 폴더도 다시 누른다. */
export async function clickMenuPath(page: Page, trail: RegExp[]) {
  for (const text of trail) await menuItem(page, text).click({ timeout: T.UI });
}

/** 메뉴 경로를 차례로, 각 항목이 보이길(T.UI) 기다린 뒤 누른다. 이미 펼쳐진 폴더도 다시 누른다. */
export async function walkMenuPath(page: Page, trail: RegExp[]) {
  for (const text of trail) {
    const node = menuItem(page, text);
    await expect(node).toBeVisible({ timeout: T.UI });
    await node.click();
  }
}

/** 메뉴 트리를 따라 연다. 새로 고침 뒤에는 트리가 펼친 채 남으므로 하위 항목이 이미 보이면 상위를 누르지 않는다(누르면 접힌다). */
export async function openMenu(page: Page, trail: RegExp[], opts: MenuOptions = {}) {
  for (let i = 0; i < trail.length; i++) {
    const item = menuItem(page, trail[i], opts);
    await expect(item).toBeVisible({ timeout: T.UI });
    if (i < trail.length - 1 && (await menuItem(page, trail[i + 1], opts).isVisible())) continue;
    await item.click();
  }
}

/** 마루 MDM > 업무기준 > leaf 를 openMenu 로 연다(룰·룰 세트 화면). */
export function openRuleMenu(page: Page, leaf: RegExp, opts: MenuOptions = {}) {
  return openMenu(page, [/^마루 MDM$/, /^업무기준$/, leaf], opts);
}
