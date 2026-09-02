import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { resolveAuthCookieNames } from "./cookies";

export const AUTH_ROLES = ["viewer", "editor", "admin", "sysadmin"] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];

type OidcTokenUse = "access_token" | "id_token";

interface OidcTokenPayload {
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  nbf: number;
  exp: number;
  jti: string;
  scope: string;
  preferred_username: string;
  role: AuthRole;
  roles: string[];
  token_use: OidcTokenUse;
  name?: string;
}

export interface AuthenticatedUser {
  id: string;
  role: AuthRole;
  /** 업무 인가에 사용하는 원본 역할명(ROLE_ 접두사 제거). */
  roles: string[];
  name: string | null;
}

export interface PortalOidcTokenResponse {
  tokenType: "Bearer";
  accessToken: string;
  idToken: string;
  expiresIn: number;
  scope: string;
  issuer: string;
  audience: string;
}

export interface CreatePortalAuthKitOptions {
  authSecret?: string;
  authCookiePrefix?: string;
  oidcIssuer?: string;
  oidcAudience?: string;
  oidcTokenTtlSeconds?: number;
  backendApiUrl?: string;
  /**
   * BFF→BE 신뢰 채널 공유 시크릿. auth(`/api/auth/login`) 호출 시 X-Client-Key 헤더로 전달한다.
   * 미지정 시 process.env.BACKEND_CLIENT_KEY 로 fallback. (OASIS/be-proxy 와 동일 정책)
   * BE 의 ClientKeyFilter 가 auth 경로(예: WAR `/mcm/api/auth/login`)에서 키를 요구하는 구성에 필요.
   */
  backendClientKey?: string;
}

export interface PortalAuthKit {
  authOptions: NextAuthOptions;
  getAuthSession: () => ReturnType<typeof getServerSession>;
  requireAuthUser: (minimumRole?: AuthRole) => Promise<AuthenticatedUser | null>;
  issueOidcTokensForSession: (minimumRole?: AuthRole) => Promise<PortalOidcTokenResponse | null>;
  authenticateOidcBearerToken: (
    request: Request,
    minimumRole?: AuthRole
  ) => Promise<AuthenticatedUser | null>;
  normalizeCallbackUrl: (rawValue: string | null | undefined) => string;
  sessionTokenCookieName: string;
}

const DEFAULT_CALLBACK_URL = "/portal";
const DEFAULT_OIDC_SCOPE = "openid profile";
const DEFAULT_OIDC_AUDIENCE = "oasis-ui-portal";
const DEFAULT_OIDC_TTL_SECONDS = 60 * 60;

function isRecoverableSessionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("jwt_session_error") ||
    message.includes("decryption operation failed") ||
    message.includes("jwe")
  );
}

function isSafeTokenString(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string | null {
  if (!value || !isSafeTokenString(value)) {
    return null;
  }

  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (base64.length % 4)) % 4;
  const padded = `${base64}${"=".repeat(padLength)}`;

  try {
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function createHmacSignature(message: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(message)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function isValidSignature(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function signJwt(payload: OidcTokenPayload, secret: string): string {
  const headerEncoded = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payloadEncoded = encodeBase64Url(JSON.stringify(payload));
  const signature = createHmacSignature(`${headerEncoded}.${payloadEncoded}`, secret);
  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

function verifyJwt(token: string, secret: string): OidcTokenPayload | null {
  const tokenParts = token.split(".");
  if (tokenParts.length !== 3) {
    return null;
  }

  const [headerPart, payloadPart, signaturePart] = tokenParts;
  if (!headerPart || !payloadPart || !signaturePart) {
    return null;
  }

  if (
    !isSafeTokenString(headerPart) ||
    !isSafeTokenString(payloadPart) ||
    !isSafeTokenString(signaturePart)
  ) {
    return null;
  }

  const expectedSignature = createHmacSignature(`${headerPart}.${payloadPart}`, secret);
  if (!isValidSignature(signaturePart, expectedSignature)) {
    return null;
  }

  const headerJson = decodeBase64Url(headerPart);
  const payloadJson = decodeBase64Url(payloadPart);
  if (!headerJson || !payloadJson) {
    return null;
  }

  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(headerJson);
    payload = JSON.parse(payloadJson);
  } catch {
    return null;
  }

  if (
    typeof header !== "object" ||
    header === null ||
    !("alg" in header) ||
    !("typ" in header) ||
    header.alg !== "HS256" ||
    header.typ !== "JWT"
  ) {
    return null;
  }

  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const typedPayload = payload as Partial<OidcTokenPayload>;
  if (
    typeof typedPayload.iss !== "string" ||
    typeof typedPayload.aud !== "string" ||
    typeof typedPayload.sub !== "string" ||
    typeof typedPayload.iat !== "number" ||
    typeof typedPayload.nbf !== "number" ||
    typeof typedPayload.exp !== "number" ||
    typeof typedPayload.jti !== "string" ||
    typeof typedPayload.scope !== "string" ||
    typeof typedPayload.preferred_username !== "string" ||
    typeof typedPayload.role !== "string" ||
    (typedPayload.roles !== undefined &&
      (!Array.isArray(typedPayload.roles) ||
        typedPayload.roles.some((role) => typeof role !== "string"))) ||
    typeof typedPayload.token_use !== "string"
  ) {
    return null;
  }

  if (!isAuthRole(typedPayload.role)) {
    return null;
  }

  if (typedPayload.token_use !== "access_token" && typedPayload.token_use !== "id_token") {
    return null;
  }

  if (typedPayload.name !== undefined && typeof typedPayload.name !== "string") {
    return null;
  }

  return {
    iss: typedPayload.iss,
    aud: typedPayload.aud,
    sub: typedPayload.sub,
    iat: typedPayload.iat,
    nbf: typedPayload.nbf,
    exp: typedPayload.exp,
    jti: typedPayload.jti,
    scope: typedPayload.scope,
    preferred_username: typedPayload.preferred_username,
    role: typedPayload.role,
    roles: typedPayload.roles ?? [],
    token_use: typedPayload.token_use,
    name: typedPayload.name,
  };
}

function extractBearerTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return null;
  }

  const matched = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!matched || !matched[1]) {
    return null;
  }

  return matched[1].trim();
}

function normalizeIssuer(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function isAuthRole(value: unknown): value is AuthRole {
  return typeof value === "string" && AUTH_ROLES.includes(value as AuthRole);
}

/**
 * @deprecated RBAC 인가는 Next.js proxy.ts에서 API 패턴 매칭으로 처리한다.
 * 이 함수는 하위 호환을 위해 항상 true를 반환하며, 호출처는 세션 유효성만 확인하는 의미가 된다.
 * 커스텀 역할(DB 기반 TB_SEC_ROLE)이 viewer/editor/admin/sysadmin rank 체계에 갇히지 않도록
 * rank 비교를 제거했다.
 *
 * **호출처 모두 제거됨, 다음 메이저에서 export 삭제 예정.**
 * 신규 코드에서 호출 금지. 인가는 proxy.ts 에서, 세션 유효성은 `requireAuthUser()` 로 확인할 것.
 */
export function hasRequiredRole(_currentRole: AuthRole, _minimumRole: AuthRole): boolean {
  return true;
}

export function normalizeCallbackUrl(rawValue: string | null | undefined): string {
  if (!rawValue) {
    return DEFAULT_CALLBACK_URL;
  }

  const normalized = rawValue.trim();
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return DEFAULT_CALLBACK_URL;
  }

  return normalized;
}

export interface NormalizedSessionUser {
  id: string;
  role: AuthRole;
  roles: string[];
  name: string | null;
  email: string | null;
  image: string | null;
}

function isObjectRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function getObjectStringField(value: object, field: string): string | null {
  const fieldValue = Reflect.get(value, field);
  return typeof fieldValue === "string" ? fieldValue : null;
}

function getObjectStringArrayField(value: object, field: string): string[] {
  const fieldValue = Reflect.get(value, field);
  return Array.isArray(fieldValue)
    ? fieldValue.filter((item): item is string => typeof item === "string")
    : [];
}

export function normalizeSessionUser(
  sessionUser: unknown,
  token: { sub?: unknown; role?: unknown; roles?: unknown; name?: unknown }
) {
  const userObject = isObjectRecord(sessionUser) ? sessionUser : {};
  const tokenName = typeof token.name === "string" ? token.name : null;
  const tokenRole =
    typeof token.role === "string" && isAuthRole(token.role) ? token.role : "viewer";
  const tokenRoles: string[] = Array.isArray(token.roles)
    ? (token.roles as unknown[]).filter((r): r is string => typeof r === "string")
    : [];

  return {
    id: typeof token.sub === "string" ? token.sub : "",
    role: tokenRole,
    roles: tokenRoles,
    name: getObjectStringField(userObject, "name") ?? tokenName,
    email: getObjectStringField(userObject, "email"),
    image: getObjectStringField(userObject, "image"),
  } satisfies NormalizedSessionUser;
}

export function readAuthenticatedUserFromSessionUser(
  sessionUser: unknown
): AuthenticatedUser | null {
  if (!isObjectRecord(sessionUser)) {
    return null;
  }

  const id = getObjectStringField(sessionUser, "id");
  const roleValue = getObjectStringField(sessionUser, "role");

  if (!id || !roleValue || !isAuthRole(roleValue)) {
    return null;
  }

  return {
    id,
    role: roleValue,
    roles: getObjectStringArrayField(sessionUser, "roles"),
    name: getObjectStringField(sessionUser, "name"),
  };
}

function logAuthFailure(reason: string, details?: Record<string, unknown>) {
  console.warn("[auth-failure]", {
    reason,
    at: new Date().toISOString(),
    ...(details ?? {}),
  });
}

export function createPortalAuthKit(options: CreatePortalAuthKitOptions): PortalAuthKit {
  const authSecret = options.authSecret?.trim() || process.env.AUTH_SECRET?.trim() || "";
  const resolvedBackendApiUrl =
    options.backendApiUrl?.trim() || process.env.BACKEND_API_URL?.trim() || "";
  const resolvedBackendClientKey =
    options.backendClientKey?.trim() || process.env.BACKEND_CLIENT_KEY?.trim() || "";
  if (!authSecret) {
    throw new Error("AUTH_SECRET 환경 변수가 필요합니다.");
  }

  const oidcIssuer = normalizeIssuer(
    options.oidcIssuer?.trim() ||
      process.env.OIDC_ISSUER?.trim() ||
      process.env.NEXTAUTH_URL?.trim() ||
      "http://localhost"
  );
  const oidcAudience =
    options.oidcAudience?.trim() || process.env.OIDC_AUDIENCE?.trim() || DEFAULT_OIDC_AUDIENCE;
  const oidcTokenTtlSeconds = options.oidcTokenTtlSeconds ?? DEFAULT_OIDC_TTL_SECONDS;

  const authCookieNames = resolveAuthCookieNames({
    cookiePrefix: options.authCookiePrefix ?? process.env.AUTH_COOKIE_PREFIX,
    nextAuthUrl: process.env.NEXTAUTH_URL,
  });
  const cookieOptions = {
    sameSite: "lax" as const,
    path: "/",
    secure: authCookieNames.secureCookie,
  };
  const httpOnlyCookieOptions = {
    ...cookieOptions,
    httpOnly: true,
  };
  function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
      const parts = token.split(".");
      if (parts.length !== 3 || !parts[1]) return null;
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padLength = (4 - (base64.length % 4)) % 4;
      const json = Buffer.from(base64 + "=".repeat(padLength), "base64").toString("utf8");
      const parsed = JSON.parse(json);
      return typeof parsed === "object" && parsed !== null ? parsed : null;
    } catch {
      return null;
    }
  }

  function extractRoleFromJwtRoles(roles: unknown): AuthRole {
    if (!Array.isArray(roles)) return "viewer";
    for (const r of roles) {
      if (typeof r === "string") {
        const normalized = r.replace(/^ROLE_/i, "").toLowerCase();
        if (isAuthRole(normalized)) return normalized;
      }
    }
    return "viewer";
  }

  async function authenticateViaBackend(
    userId: string,
    password: string
  ): Promise<{
    id: string;
    name: string | null;
    role: AuthRole;
    roles: string[];
    permKeys: string[];
    backendAccessToken?: string;
    backendRefreshToken?: string;
  } | null> {
    try {
      // BFF→BE 는 X-Client-Key 신뢰 채널. BE 의 ClientKeyFilter 가 auth 경로(WAR `/mcm/api/auth/login` 등)
      // 에서 키를 요구할 수 있으므로, OASIS/be-proxy 와 동일하게 클라이언트 키를 함께 전송한다.
      const loginHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (resolvedBackendClientKey) loginHeaders["X-Client-Key"] = resolvedBackendClientKey;
      const response = await fetch(`${resolvedBackendApiUrl}/api/auth/login`, {
        method: "POST",
        headers: loginHeaders,
        body: JSON.stringify({ userId, password }),
      });

      if (!response.ok) {
        logAuthFailure("backend_auth_failed", { userId, status: response.status });
        return null;
      }

      const body = (await response.json()) as unknown;
      if (!isObjectRecord(body) || !Reflect.get(body, "success")) {
        return null;
      }

      const data = Reflect.get(body, "data");
      if (!isObjectRecord(data)) {
        return null;
      }

      const accessToken = getObjectStringField(data, "accessToken");
      if (!accessToken) {
        return null;
      }

      // JWT accessToken에서 사용자 정보 추출 (sub=userId, roles=권한 배열)
      const jwtPayload = decodeJwtPayload(accessToken);
      const sub = jwtPayload ? (typeof jwtPayload.sub === "string" ? jwtPayload.sub : null) : null;
      const role = jwtPayload ? extractRoleFromJwtRoles(jwtPayload.roles) : "viewer";

      // 로그인 응답 본문의 userInfo.userNm (TB_MCM_SEC_USER.USER_NM 한글명)
      const userInfoRaw = Reflect.get(data, "userInfo");
      const userNmRaw = isObjectRecord(userInfoRaw)
        ? getObjectStringField(userInfoRaw, "userNm")
        : null;
      const userNm = userNmRaw?.trim() ? userNmRaw.trim() : null;

      // 원본 roles 배열 추출 (ROLE_ 접두사 제거)
      const rawRoles: string[] =
        jwtPayload && Array.isArray(jwtPayload.roles)
          ? (jwtPayload.roles as unknown[])
              .filter((r): r is string => typeof r === "string")
              .map((r) => r.replace(/^ROLE_/i, ""))
          : [];

      // BFF RBAC — 로그인 응답의 permKeys (module/objId/action 키 배열) 추출. SYSADMIN 도 실키
      // (2026-07-30 프리패스 제거) — BE 브레이크글라스(sysadmin-freepass=true) 시에만 ["*"].
      const permKeysRaw = Reflect.get(data, "permKeys");
      const permKeys: string[] = Array.isArray(permKeysRaw)
        ? permKeysRaw.filter((k): k is string => typeof k === "string")
        : [];

      const refreshToken = getObjectStringField(data, "refreshToken");

      return {
        id: sub ?? userId,
        name: userNm ?? sub,
        role,
        roles: rawRoles,
        permKeys,
        backendAccessToken: accessToken,
        backendRefreshToken: refreshToken ?? undefined,
      };
    } catch (error) {
      logAuthFailure("backend_auth_error", {
        userId,
        error: error instanceof Error ? error.message : "unknown",
      });
      return null;
    }
  }

  function issueOidcTokensForUser(user: AuthenticatedUser): PortalOidcTokenResponse {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const expiresAt = nowInSeconds + oidcTokenTtlSeconds;

    const commonPayload = {
      iss: oidcIssuer,
      aud: oidcAudience,
      sub: user.id,
      iat: nowInSeconds,
      nbf: nowInSeconds,
      exp: expiresAt,
      jti: randomUUID(),
      scope: DEFAULT_OIDC_SCOPE,
      preferred_username: user.id,
      role: user.role,
      roles: user.roles,
      name: user.name ?? undefined,
    };

    const accessToken = signJwt(
      {
        ...commonPayload,
        token_use: "access_token",
      },
      authSecret
    );

    const idToken = signJwt(
      {
        ...commonPayload,
        token_use: "id_token",
      },
      authSecret
    );

    return {
      tokenType: "Bearer",
      accessToken,
      idToken,
      expiresIn: oidcTokenTtlSeconds,
      scope: DEFAULT_OIDC_SCOPE,
      issuer: oidcIssuer,
      audience: oidcAudience,
    };
  }

  const authOptions: NextAuthOptions = {
    secret: authSecret,
    session: {
      strategy: "jwt",
    },
    cookies: {
      sessionToken: {
        name: authCookieNames.sessionToken,
        options: httpOnlyCookieOptions,
      },
      callbackUrl: {
        name: authCookieNames.callbackUrl,
        options: cookieOptions,
      },
      csrfToken: {
        name: authCookieNames.csrfToken,
        options: httpOnlyCookieOptions,
      },
      pkceCodeVerifier: {
        name: authCookieNames.pkceCodeVerifier,
        options: httpOnlyCookieOptions,
      },
      state: {
        name: authCookieNames.state,
        options: httpOnlyCookieOptions,
      },
      nonce: {
        name: authCookieNames.nonce,
        options: httpOnlyCookieOptions,
      },
    },
    pages: {
      signIn: "/login",
    },
    providers: [
      CredentialsProvider({
        name: "Credentials",
        credentials: {
          userId: { label: "User ID", type: "text" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          const userId = typeof credentials?.userId === "string" ? credentials.userId.trim() : "";
          const password = typeof credentials?.password === "string" ? credentials.password : "";

          if (!userId || !password) {
            return null;
          }

          if (!resolvedBackendApiUrl) {
            logAuthFailure("backend_auth_not_configured", { userId });
            return null;
          }

          return await authenticateViaBackend(userId, password);
        },
      }),
    ],
    callbacks: {
      async jwt({ token, user }) {
        if (user && "role" in user && typeof user.role === "string" && isAuthRole(user.role)) {
          token.role = user.role;
        }

        if (typeof token.role !== "string" || !isAuthRole(token.role)) {
          token.role = "viewer";
        }

        // 백엔드 JWT 토큰을 NextAuth JWT에 보관
        if (user && "backendAccessToken" in user && typeof user.backendAccessToken === "string") {
          token.backendAccessToken = user.backendAccessToken;
        }
        if (user && "backendRefreshToken" in user && typeof user.backendRefreshToken === "string") {
          token.backendRefreshToken = user.backendRefreshToken;
        }

        // RBAC 역할 배열 저장
        if (user && "roles" in user && Array.isArray((user as { roles?: unknown }).roles)) {
          token.roles = (user as { roles: string[] }).roles;
        }

        // BFF RBAC — 방식 C(서버 캐시) 전환으로 token.perms 적재 폐기(쿠키 크기 회피).
        //   권한키는 proxy.ts 가 BFF 서버 캐시(api-permission-cache.getUserPerms)로 BE 에서 lazy load.
        //   (로그인 응답의 permKeys 는 현재 미사용 — 후속 정리 대상.)

        return token;
      },
      async session({ session, token }) {
        session.user = normalizeSessionUser(session.user, token);
        // 백엔드 JWT 토큰은 서버 사이드(BFF 프록시)에서만 사용 — 클라이언트에 노출하지 않음
        return session;
      },
    },
  };

  async function getAuthSession() {
    try {
      return await getServerSession(authOptions);
    } catch (error) {
      if (isRecoverableSessionError(error)) {
        logAuthFailure("session_recoverable_error", {
          error: error instanceof Error ? error.message : "unknown",
        });
        return null;
      }

      throw error;
    }
  }

  async function requireAuthUser(minimumRole: AuthRole = "viewer") {
    // RBAC 인가는 proxy.ts 에서 처리되므로, 여기서는 세션 유효성만 확인한다.
    // `minimumRole` 파라미터는 시그니처 호환을 위해 유지하며, 실제 비교에는 사용하지 않는다.
    void minimumRole;

    const session = await getAuthSession();
    if (!session) {
      logAuthFailure("session_missing", {
        minimumRole,
      });
      return null;
    }

    const sessionUser = readAuthenticatedUserFromSessionUser(session?.user);
    if (!sessionUser) {
      logAuthFailure("session_user_invalid", {
        minimumRole,
      });
      return null;
    }

    return sessionUser;
  }

  async function issueOidcTokensForSession(
    minimumRole: AuthRole = "viewer"
  ): Promise<PortalOidcTokenResponse | null> {
    const user = await requireAuthUser(minimumRole);
    if (!user) {
      return null;
    }

    return issueOidcTokensForUser(user);
  }

  async function authenticateOidcBearerToken(
    request: Request,
    minimumRole: AuthRole = "viewer"
  ): Promise<AuthenticatedUser | null> {
    // RBAC 인가는 proxy.ts 에서 처리되므로, 여기서는 토큰 유효성만 확인한다.
    // `minimumRole` 파라미터는 시그니처 호환을 위해 유지하며, 실제 비교에는 사용하지 않는다.
    void minimumRole;

    const bearerToken = extractBearerTokenFromRequest(request);
    if (!bearerToken) {
      return null;
    }

    const payload = verifyJwt(bearerToken, authSecret);
    if (!payload) {
      return null;
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp <= nowInSeconds || payload.nbf > nowInSeconds) {
      return null;
    }

    if (payload.iss !== oidcIssuer || payload.aud !== oidcAudience) {
      return null;
    }

    if (payload.token_use !== "access_token" && payload.token_use !== "id_token") {
      return null;
    }

    return {
      id: payload.sub,
      role: payload.role,
      roles: payload.roles,
      name: payload.name ?? null,
    };
  }

  return {
    authOptions,
    getAuthSession,
    requireAuthUser,
    issueOidcTokensForSession,
    authenticateOidcBearerToken,
    normalizeCallbackUrl,
    sessionTokenCookieName: authCookieNames.sessionToken,
  };
}
