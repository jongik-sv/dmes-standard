import { afterEach, describe, expect, it, vi } from "vitest";

const { getServerSessionMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
}));

vi.mock("next-auth", async () => {
  const actual = await vi.importActual("next-auth");
  return {
    ...actual,
    getServerSession: getServerSessionMock,
  };
});

import { createPortalAuthKit } from "../../src/auth/server";

afterEach(() => {
  getServerSessionMock.mockReset();
});

describe("auth token unit contract", () => {
  it("returns null when issuing token without authenticated session", async () => {
    getServerSessionMock.mockResolvedValue(null);

    const authKit = createPortalAuthKit({
      authSecret: "unit-test-secret",
    });

    const tokenResponse = await authKit.issueOidcTokensForSession("viewer");
    expect(tokenResponse).toBeNull();
  });

  it("issues token for any session regardless of minimumRole (RBAC moved to proxy.ts)", async () => {
    // hasRequiredRole 이 deprecated 되어 항상 true 를 반환하므로,
    // viewer 세션도 minimumRole="admin" 으로 토큰 발급이 가능하다.
    // RBAC 인가는 Next.js proxy.ts 에서 API 패턴 매칭으로 처리한다.
    getServerSessionMock.mockResolvedValue({
      user: {
        id: "viewer-user",
        role: "viewer",
        name: "Viewer User",
      },
    });

    const authKit = createPortalAuthKit({
      authSecret: "unit-test-secret",
    });

    const tokenResponse = await authKit.issueOidcTokensForSession("admin");
    expect(tokenResponse).not.toBeNull();
  });

  it("issues access token and authenticates bearer token (RBAC delegated to proxy.ts)", async () => {
    // hasRequiredRole deprecation 으로 minimumRole 인자는 더 이상 거부 사유가 되지 않는다.
    // 토큰 발급 → bearer 인증 통과의 happy-path 만 검증한다.
    getServerSessionMock.mockResolvedValue({
      user: {
        id: "editor-user",
        role: "editor",
        name: "Editor User",
      },
    });

    const authKit = createPortalAuthKit({
      authSecret: "unit-test-secret",
    });

    const tokenResponse = await authKit.issueOidcTokensForSession("viewer");
    expect(tokenResponse).not.toBeNull();
    if (!tokenResponse) {
      return;
    }

    const request = new Request("http://localhost/api/mcm/oasis/secUser/myMenusTree", {
      headers: {
        Authorization: `Bearer ${tokenResponse.accessToken}`,
      },
    });

    await expect(authKit.authenticateOidcBearerToken(request, "viewer")).resolves.toEqual({
      id: "editor-user",
      role: "editor",
      roles: [],
      name: "Editor User",
    });
  });

  it("rejects malformed or tampered bearer tokens", async () => {
    getServerSessionMock.mockResolvedValue({
      user: {
        id: "admin-user",
        role: "admin",
        name: "Admin User",
      },
    });

    const authKit = createPortalAuthKit({
      authSecret: "unit-test-secret",
    });

    const tokenResponse = await authKit.issueOidcTokensForSession("viewer");
    expect(tokenResponse).not.toBeNull();
    if (!tokenResponse) {
      return;
    }

    const malformedRequest = new Request("http://localhost/api/mcm/oasis/secUser/myMenusTree", {
      headers: {
        Authorization: "Bearer invalid",
      },
    });
    const tamperedToken = `${tokenResponse.accessToken.slice(0, -1)}x`;
    const tamperedRequest = new Request("http://localhost/api/mcm/oasis/secUser/myMenusTree", {
      headers: {
        Authorization: `Bearer ${tamperedToken}`,
      },
    });

    await expect(authKit.authenticateOidcBearerToken(malformedRequest)).resolves.toBeNull();
    await expect(authKit.authenticateOidcBearerToken(tamperedRequest)).resolves.toBeNull();
  });
});
