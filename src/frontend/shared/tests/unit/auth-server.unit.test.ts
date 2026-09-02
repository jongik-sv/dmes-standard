import { describe, expect, it } from "vitest";
import {
  hasRequiredRole,
  isAuthRole,
  normalizeCallbackUrl,
  normalizeSessionUser,
  readAuthenticatedUserFromSessionUser,
} from "../../src/auth/server";

describe("auth-server unit contract", () => {
  it("validates auth role values", () => {
    expect(isAuthRole("viewer")).toBe(true);
    expect(isAuthRole("editor")).toBe(true);
    expect(isAuthRole("admin")).toBe(true);
    expect(isAuthRole("owner")).toBe(false);
  });

  it("hasRequiredRole is deprecated and always returns true", () => {
    // RBAC 인가는 proxy.ts 에서 처리되며, hasRequiredRole 은 하위 호환을 위해 유지된 deprecated API.
    // 모든 입력 조합에 대해 항상 true 를 반환해야 한다.
    expect(hasRequiredRole("admin", "viewer")).toBe(true);
    expect(hasRequiredRole("editor", "editor")).toBe(true);
    expect(hasRequiredRole("viewer", "admin")).toBe(true);
    expect(hasRequiredRole("viewer", "sysadmin")).toBe(true);
  });

  it("normalizes callbackUrl to internal path only", () => {
    expect(normalizeCallbackUrl("/portal")).toBe("/portal");
    expect(normalizeCallbackUrl("/portal?tab=favorites")).toBe("/portal?tab=favorites");
    expect(normalizeCallbackUrl("https://malicious.example")).toBe("/portal");
    expect(normalizeCallbackUrl("//malicious.example/path")).toBe("/portal");
    expect(normalizeCallbackUrl("")).toBe("/portal");
  });

  it("normalizes session user with token fallback", () => {
    const normalized = normalizeSessionUser(
      {
        name: "Existing Name",
        email: "existing@example.com",
      },
      {
        sub: "tester",
        role: "editor",
        name: "Token Name",
      }
    );

    expect(normalized).toEqual({
      id: "tester",
      role: "editor",
      roles: [],
      name: "Existing Name",
      email: "existing@example.com",
      image: null,
    });
  });

  it("maps authenticated session user only when shape is valid", () => {
    expect(
      readAuthenticatedUserFromSessionUser({
        id: "tester",
        role: "admin",
        roles: ["ADMIN", "PLANNER"],
        name: "Tester",
      })
    ).toEqual({
      id: "tester",
      role: "admin",
      roles: ["ADMIN", "PLANNER"],
      name: "Tester",
    });

    expect(
      readAuthenticatedUserFromSessionUser({
        id: "tester",
        role: "unknown",
      })
    ).toBeNull();
  });
});
