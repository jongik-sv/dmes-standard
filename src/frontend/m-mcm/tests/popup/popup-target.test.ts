import { describe, expect, it } from "vitest";
import { buildPopoutUrl, popupSlugToPageId } from "@/app/popup/popup-target";

describe("popup-target", () => {
  it("첫 칸은 moduleId, 나머지는 pageName", () => {
    expect(popupSlugToPageId(["mdm", "dmc", "codeMng"])).toBe("mdm:dmc/codeMng");
  });
  it("인코딩된 칸을 푼다", () => {
    expect(popupSlugToPageId(["mcm", "csa", encodeURIComponent("commUserMng")])).toBe("mcm:csa/commUserMng");
  });
  it("칸이 모자라거나 잘못되면 null", () => {
    expect(popupSlugToPageId([])).toBeNull();
    expect(popupSlugToPageId(["mdm"])).toBeNull();
    expect(popupSlugToPageId(["mdm", ".."])).toBeNull();
    expect(popupSlugToPageId(["mdm", "a:b"])).toBeNull();
    expect(popupSlugToPageId(["a:b", "c"])).toBeNull();
  });
  it("URL 을 만들고 다시 풀면 같은 pageId", () => {
    const url = buildPopoutUrl("mdm:dmc/codeMng", "tok-1");
    expect(url).toBe("/popup/mdm/dmc/codeMng?h=tok-1");
    const slug = url.split("?")[0].split("/").slice(2);
    expect(popupSlugToPageId(slug)).toBe("mdm:dmc/codeMng");
  });
});
