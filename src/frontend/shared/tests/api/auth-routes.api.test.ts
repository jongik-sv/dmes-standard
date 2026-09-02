import { describe, expect, it } from "vitest";
import { createAuthMeGetHandler } from "../../src/auth/routes";

describe("auth routes API contract", () => {
  it("returns 401 when session user is missing", async () => {
    const handler = createAuthMeGetHandler(async () => null);

    const response = await handler();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ authenticated: false });
  });

  it("returns authenticated user payload when session exists", async () => {
    const handler = createAuthMeGetHandler(async () => ({
      id: "tester",
      role: "viewer",
      roles: ["PLANNER"],
      name: "Tester",
    }));

    const response = await handler();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.authenticated).toBe(true);
    expect(body.user.id).toBe("tester");
    expect(body.user.role).toBe("viewer");
    expect(body.user.roles).toEqual(["PLANNER"]);
    expect(body.user.name).toBe("Tester");
  });
});
