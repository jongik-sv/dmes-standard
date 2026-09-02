import { describe, expect, it } from "vitest";
import {
  composePageName,
  isValidPageLeafName,
  isValidPageNamePath,
  isValidPagePath,
  parsePageId,
} from "../../src/portal-shell/module";

describe("portal-shell module path contract", () => {
  it("validates page leaf names", () => {
    expect(isValidPageLeafName("overview")).toBe(true);
    expect(isValidPageLeafName("users/list")).toBe(false);
    expect(isValidPageLeafName("..")).toBe(false);
  });

  it("validates menu path format", () => {
    expect(isValidPagePath("/")).toBe(true);
    expect(isValidPagePath("/admin/users")).toBe(true);
    expect(isValidPagePath("admin/users")).toBe(false);
    expect(isValidPagePath("/admin//users")).toBe(false);
  });

  it("composes page name from path and leaf", () => {
    expect(composePageName("/", "home")).toBe("home");
    expect(composePageName("/admin/users", "list")).toBe("admin/users/list");
    expect(composePageName("/admin/", "list")).toBeNull();
  });

  it("parses pageId only when module and pageName are valid", () => {
    expect(parsePageId("portal:admin/users/list")).toEqual({
      moduleId: "portal",
      pageName: "admin/users/list",
    });
    expect(parsePageId("portal:")).toBeNull();
    expect(parsePageId("invalid")).toBeNull();
  });

  it("validates pageName path strings", () => {
    expect(isValidPageNamePath("admin/users/list")).toBe(true);
    expect(isValidPageNamePath("/admin/users/list")).toBe(false);
    expect(isValidPageNamePath("admin/users/list/")).toBe(false);
    expect(isValidPageNamePath("admin/../list")).toBe(false);
  });
});
