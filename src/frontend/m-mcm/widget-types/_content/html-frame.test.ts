import { describe, expect, it } from "vitest";

import { HTML_FRAME_PRINT_STYLE, HTML_FRAME_SANDBOX, HTML_SCRIPT_WARNING, htmlFrameProps } from "./html-frame";

describe("htmlFrameProps — 스크립트 허용 html 의 격리 iframe 속성(스펙 §6, W-D25)", () => {
  it("sandbox 값은 정확히 allow-scripts 다", () => {
    expect(htmlFrameProps("<p>안녕</p>").sandbox).toBe("allow-scripts");
    expect(HTML_FRAME_SANDBOX).toBe("allow-scripts");
  });

  it("allow-same-origin 은 어디에도 없다", () => {
    const props = htmlFrameProps("<script>parent.document.cookie</script>");
    expect(props.sandbox).not.toContain("allow-same-origin");
    expect(JSON.stringify(props)).not.toContain("allow-same-origin");
  });

  it("srcDoc 는 받은 html 을 그대로 넣는다(정화·변형 없음) — 더하는 것은 앞의 인쇄 색 유지 style 하나뿐이다", () => {
    const html = '<div onclick="x()">a</div><script>alert(1)</script><style>p{color:red}</style>';
    expect(htmlFrameProps(html).srcDoc).toBe(HTML_FRAME_PRINT_STYLE + html);
    expect(htmlFrameProps("").srcDoc).toBe(HTML_FRAME_PRINT_STYLE);
  });

  it("인쇄 색 유지 style 은 인쇄에만 걸리는 print-color-adjust: exact 다", () => {
    const srcDoc = htmlFrameProps("<p>x</p>").srcDoc;
    expect(srcDoc).toContain("@media print{");
    expect(srcDoc).toContain("print-color-adjust:exact!important");
    expect(srcDoc).toContain("-webkit-print-color-adjust:exact!important");
    // 스타일 하나만 더한다 — 스크립트·속성은 넣지 않는다.
    expect(HTML_FRAME_PRINT_STYLE).toMatch(/^<style>[^<]*<\/style>$/);
  });

  it("doctype 이 있으면 doctype 을 맨 앞에 둔 채 그 뒤에 넣는다(quirks 모드로 바뀌지 않게)", () => {
    const html = '<!DOCTYPE html>\n<html lang="ko"><head><title>t</title></head><body style="background:linear-gradient(red,blue)">a</body></html>';
    expect(htmlFrameProps(html).srcDoc).toBe('<!DOCTYPE html>' + HTML_FRAME_PRINT_STYLE + '\n<html lang="ko"><head><title>t</title></head><body style="background:linear-gradient(red,blue)">a</body></html>');
    const lead = "  <!-- 안내 -->\n<!doctype html><p>b</p>";
    expect(htmlFrameProps(lead).srcDoc).toBe("  <!-- 안내 -->\n<!doctype html>" + HTML_FRAME_PRINT_STYLE + "<p>b</p>");
  });

  it("referrerPolicy 는 no-referrer, 속성은 세 개뿐이다", () => {
    const props = htmlFrameProps("<p>x</p>");
    expect(props.referrerPolicy).toBe("no-referrer");
    expect(Object.keys(props).sort()).toEqual(["referrerPolicy", "sandbox", "srcDoc"]);
  });

  it("편집기 경고 문구는 스펙 문구 그대로다", () => {
    expect(HTML_SCRIPT_WARNING).toBe(
      "스크립트는 포털과 분리된 칸에서 실행됩니다. 포털 화면·로그인 정보에는 접근할 수 없습니다"
    );
  });
});
