import { describe, expect, it } from "vitest";

import {
  SAME_ORIGIN_MESSAGE,
  WEB_FRAME_SANDBOX,
  WEB_URL_EMPTY_MESSAGE,
  WEB_URL_FORMAT_MESSAGE,
  checkWebUrl,
  isHttpUrl,
  webFrameProps,
} from "./web";

const PORTAL = "https://portal.example.com";

describe("checkWebUrl — 웹 주소 위젯 주소 검사(스펙 §6)", () => {
  it("http·https 절대 주소는 통과한다", () => {
    expect(checkWebUrl("https://www.example.org/board?id=1", PORTAL)).toEqual({
      ok: true,
      url: "https://www.example.org/board?id=1",
    });
    expect(checkWebUrl("http://intranet.local:8080/a", PORTAL)).toEqual({
      ok: true,
      url: "http://intranet.local:8080/a",
    });
  });

  it("앞뒤 공백은 지우고 주소는 브라우저 표기로 맞춘다", () => {
    expect(checkWebUrl("  HTTPS://Example.ORG  ", PORTAL)).toEqual({ ok: true, url: "https://example.org/" });
  });

  it("빈 주소는 입력 안내", () => {
    expect(checkWebUrl("", PORTAL)).toEqual({ ok: false, message: WEB_URL_EMPTY_MESSAGE });
    expect(checkWebUrl("   ", PORTAL)).toEqual({ ok: false, message: WEB_URL_EMPTY_MESSAGE });
  });

  it.each([
    ["javascript:alert(1)"],
    ["JavaScript:alert(1)"],
    ["java\tscript:alert(1)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["blob:https://portal.example.com/uuid"],
    ["ftp://files.example.org/a"],
    ["file:///etc/passwd"],
    ["/mcm/home"],
    ["home"],
    ["//evil.example.org/a"],
    ["www.example.org"],
  ])("http(s) 절대 주소가 아니면 거절한다: %s", (url) => {
    expect(checkWebUrl(url, PORTAL)).toEqual({ ok: false, message: WEB_URL_FORMAT_MESSAGE });
  });

  it("포털과 같은 출처는 거절한다(대소문자·기본 포트 표기가 달라도)", () => {
    const same = { ok: false, message: SAME_ORIGIN_MESSAGE };
    expect(checkWebUrl("https://portal.example.com/portal", PORTAL)).toEqual(same);
    expect(checkWebUrl("https://PORTAL.example.com:443/x", PORTAL)).toEqual(same);
    expect(checkWebUrl("https://portal.example.com", `${PORTAL}/`)).toEqual(same);
    expect(SAME_ORIGIN_MESSAGE).toBe("포털 화면은 링크 모음 위젯으로 여세요");
  });

  it("같은 호스트라도 포트·스킴이 다르면 다른 출처다", () => {
    expect(checkWebUrl("https://portal.example.com:8443/", PORTAL).ok).toBe(true);
    expect(checkWebUrl("http://localhost:3000/", "http://localhost:5100").ok).toBe(true);
    expect(checkWebUrl("http://localhost:5100/portal", "http://localhost:5100").ok).toBe(false);
  });
});

describe("isHttpUrl", () => {
  it("http(s) 절대 주소만 true", () => {
    expect(isHttpUrl("https://a.example.org")).toBe(true);
    expect(isHttpUrl(" http://a.example.org/x ")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("/relative")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
  });
});

describe("webFrameProps — 웹 주소 iframe 속성", () => {
  it("sandbox 는 스펙 값 그대로, referrerPolicy 는 no-referrer, src 는 받은 주소", () => {
    const props = webFrameProps("https://www.example.org/");
    expect(props).toEqual({
      src: "https://www.example.org/",
      sandbox: "allow-scripts allow-same-origin allow-forms allow-popups",
      referrerPolicy: "no-referrer",
    });
    expect(WEB_FRAME_SANDBOX).toBe("allow-scripts allow-same-origin allow-forms allow-popups");
  });

  it("최상위 창 이동·팝업 탈출 권한은 주지 않는다", () => {
    const { sandbox } = webFrameProps("https://www.example.org/");
    expect(sandbox).not.toContain("allow-top-navigation");
    expect(sandbox).not.toContain("allow-popups-to-escape-sandbox");
  });
});
