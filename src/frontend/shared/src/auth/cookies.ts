export interface ResolveAuthCookieNamesOptions {
  cookiePrefix?: string;
  nextAuthUrl?: string;
}

export interface AuthCookieNames {
  secureCookie: boolean;
  sessionToken: string;
  callbackUrl: string;
  csrfToken: string;
  pkceCodeVerifier: string;
  state: string;
  nonce: string;
}

const DEFAULT_COOKIE_PREFIX = "next-auth";

function normalizeCookiePrefix(rawValue: string | undefined): string {
  const normalized = (rawValue ?? DEFAULT_COOKIE_PREFIX).trim().toLowerCase();
  const sanitized = normalized.replace(/[^a-z0-9_-]/g, "-");
  return sanitized || DEFAULT_COOKIE_PREFIX;
}

function shouldUseSecureCookie(nextAuthUrl: string | undefined): boolean {
  const normalized = nextAuthUrl?.trim().toLowerCase() ?? "";
  return normalized.startsWith("https://");
}

export function resolveAuthCookieNames(
  options: ResolveAuthCookieNamesOptions = {}
): AuthCookieNames {
  const secureCookie = shouldUseSecureCookie(options.nextAuthUrl);
  const cookiePrefix = normalizeCookiePrefix(options.cookiePrefix);
  const securePrefix = secureCookie ? "__Secure-" : "";
  const hostPrefix = secureCookie ? "__Host-" : "";

  return {
    secureCookie,
    sessionToken: `${securePrefix}${cookiePrefix}.session-token`,
    callbackUrl: `${securePrefix}${cookiePrefix}.callback-url`,
    csrfToken: `${hostPrefix}${cookiePrefix}.csrf-token`,
    pkceCodeVerifier: `${securePrefix}${cookiePrefix}.pkce.code_verifier`,
    state: `${securePrefix}${cookiePrefix}.state`,
    nonce: `${securePrefix}${cookiePrefix}.nonce`,
  };
}
