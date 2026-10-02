import { describe, expect, it } from "vitest";

import {
  HTML_EMPTY_MESSAGE,
  MARKDOWN_EMPTY_MESSAGE,
  readHtmlConfig,
  readLinksConfig,
  readMarkdownConfig,
  readWebConfig,
  validateHtmlConfig,
  validateLinksConfig,
  validateMarkdownConfig,
  validateWebConfig,
} from "./config";
import { LINKS_EMPTY_MESSAGE } from "./links";
import { SAME_ORIGIN_MESSAGE, WEB_URL_EMPTY_MESSAGE } from "./web";

describe("정의 설정 읽기 — definition(unknown)을 안전한 설정으로", () => {
  it("markdown — 문자열만 받고 없으면 빈 글", () => {
    expect(readMarkdownConfig({ markdown: "# 제목" })).toEqual({ markdown: "# 제목" });
    expect(readMarkdownConfig(null)).toEqual({ markdown: "" });
    expect(readMarkdownConfig({ markdown: 3 })).toEqual({ markdown: "" });
    expect(readMarkdownConfig("문자열")).toEqual({ markdown: "" });
  });

  it("html — allowScript 는 정확히 true 일 때만 켠다", () => {
    expect(readHtmlConfig({ html: "<p>a</p>", allowScript: true })).toEqual({ html: "<p>a</p>", allowScript: true });
    expect(readHtmlConfig({ html: "<p>a</p>", allowScript: "true" })).toEqual({
      html: "<p>a</p>",
      allowScript: false,
    });
    expect(readHtmlConfig({ html: "<p>a</p>", allowScript: 1 }).allowScript).toBe(false);
    expect(readHtmlConfig(undefined)).toEqual({ html: "", allowScript: false });
  });

  it("web — url 문자열", () => {
    expect(readWebConfig({ url: "https://a.example.org" })).toEqual({ url: "https://a.example.org" });
    expect(readWebConfig({ url: null })).toEqual({ url: "" });
    expect(readWebConfig([])).toEqual({ url: "" });
  });

  it("links — 객체가 아닌 항목은 버리고 종류는 page·url 만(그 밖은 page)", () => {
    expect(
      readLinksConfig({
        items: [
          { label: "메뉴", kind: "page", pageId: "mcm:csa/commMenuMng" },
          { label: "게시판", kind: "url", url: "https://a.example.org" },
          "문자열",
          null,
          { label: 5, kind: "weird", pageId: 7 },
        ],
      })
    ).toEqual({
      items: [
        { label: "메뉴", kind: "page", pageId: "mcm:csa/commMenuMng" },
        { label: "게시판", kind: "url", url: "https://a.example.org" },
        { label: "", kind: "page", pageId: "" },
      ],
    });
    expect(readLinksConfig({ items: "x" })).toEqual({ items: [] });
    expect(readLinksConfig(null)).toEqual({ items: [] });
  });
});

describe("편집기 검사(onValidate)", () => {
  it("markdown·html — 비면 오류", () => {
    expect(validateMarkdownConfig({ markdown: "  \n" })).toEqual([MARKDOWN_EMPTY_MESSAGE]);
    expect(validateMarkdownConfig({ markdown: "글" })).toEqual([]);
    expect(validateHtmlConfig({ html: "", allowScript: true })).toEqual([HTML_EMPTY_MESSAGE]);
    expect(validateHtmlConfig({ html: "<b>a</b>", allowScript: false })).toEqual([]);
  });

  it("web — checkWebUrl 메시지 그대로", () => {
    const portal = "https://portal.example.com";
    expect(validateWebConfig({ url: "" }, portal)).toEqual([WEB_URL_EMPTY_MESSAGE]);
    expect(validateWebConfig({ url: "https://portal.example.com/x" }, portal)).toEqual([SAME_ORIGIN_MESSAGE]);
    expect(validateWebConfig({ url: "https://www.example.org" }, portal)).toEqual([]);
  });

  it("links — validateLinkItems 결과", () => {
    expect(validateLinksConfig({ items: [] })).toEqual([LINKS_EMPTY_MESSAGE]);
    expect(validateLinksConfig({ items: [{ label: "a", kind: "url", url: "https://a.example.org" }] })).toEqual([]);
  });
});
