import { createPortalAppBindings } from "@dk-oasis/shared/auth-routes";

/**
 * auth(`/api/auth/login`) 호출용 BE base URL.
 *
 * OASIS/Phase7 라우트는 `/{moduleId}` prefix 를 스스로 붙이지만, auth 호출은 붙이지 않는다.
 * 그래서 nginx 게이트웨이(`/mcm/` → BE 라우팅 + prefix strip) 경유 시 auth 만 BE 로 가지 못해
 * 404(또는 프론트로 되돌아가 404)가 난다. OASIS 와 동일한 규칙으로 auth 의 BE 위치를 정한다:
 *   - `MCM_WAS_URL` 직결(개발): 그대로 → `${MCM_WAS_URL}/api/auth/login` (embedded root BE)
 *   - `BACKEND_API_URL`(운영 게이트웨이): `/mcm` 을 더해 → `${URL}/mcm/api/auth/login`
 *     (nginx 가 `/mcm` 을 strip 해 BE 의 root `/api/auth/login` 으로 전달)
 */
function resolveAuthBackendApiUrl(): string {
  const mcmWasUrl = process.env.MCM_WAS_URL?.trim();
  if (mcmWasUrl) return mcmWasUrl;
  const backendApiUrl = process.env.BACKEND_API_URL?.trim();
  if (!backendApiUrl) return "";
  return `${backendApiUrl.replace(/\/+$/, "")}/mcm`;
}

const portalBindings = createPortalAppBindings({
  authCookiePrefix: "oasis-mcm-auth",
  oidcAudience: "oasis-mcm",
  backendApiUrl: resolveAuthBackendApiUrl(),
});

export const {
  authOptions,
  getAuthSession,
  requireAuthUser,
  issueOidcTokensForSession,
  authenticateOidcBearerToken,
  normalizeCallbackUrl,
  sessionTokenCookieName,
} = portalBindings.authKit;

export const authNextGet = portalBindings.authHandlers.nextAuthGet;
export const authNextPost = portalBindings.authHandlers.nextAuthPost;
export const authMeGet = portalBindings.authHandlers.authMeGet;
