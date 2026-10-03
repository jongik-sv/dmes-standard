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

  it("style 은 늘 문서 맨 앞에 붙는다 — doctype 이 있어도 그 앞에(srcdoc 문서는 늘 표준 모드라 모드가 바뀌지 않는다)", () => {
    const html = '<!DOCTYPE html>\n<html lang="ko"><head><title>t</title></head><body style="background:linear-gradient(red,blue)">a</body></html>';
    expect(htmlFrameProps(html).srcDoc).toBe(HTML_FRAME_PRINT_STYLE + html);
    const lead = "  <!-- 안내 -->\n<!doctype html><p>b</p>";
    expect(htmlFrameProps(lead).srcDoc).toBe(HTML_FRAME_PRINT_STYLE + lead);
  });

  it("<html> 로 시작해도, 앞에 doctype 이 없어도 맨 앞에 붙는다", () => {
    const html = '<html lang="ko"><body>a</body></html>';
    expect(htmlFrameProps(html).srcDoc).toBe(HTML_FRAME_PRINT_STYLE + html);
    expect(htmlFrameProps("<p>x").srcDoc.startsWith(HTML_FRAME_PRINT_STYLE)).toBe(true);
  });

  it("문서 중간의 <!doctype 은 무시한다 — style 이 script 문자열·textarea 안으로 들어가지 않는다", () => {
    const html = "<!-- a --><textarea>--><!doctype html></textarea>";
    expect(htmlFrameProps(html).srcDoc).toBe(HTML_FRAME_PRINT_STYLE + html);
    const inScript = '<script>var s = "<!-- "; </script><!doctype html><p>x</p>';
    expect(htmlFrameProps(inScript).srcDoc).toBe(HTML_FRAME_PRINT_STYLE + inScript);
  });

  it("연속 주석 5000개(뒤에 doctype 도 없음)도 바로 처리한다 — 정규식 역추적(ReDoS)이 없다", () => {
    const html = " <!---->".repeat(5000) + "<p>x";
    const t0 = performance.now();
    const { srcDoc } = htmlFrameProps(html);
    const elapsed = performance.now() - t0;
    expect(srcDoc).toBe(HTML_FRAME_PRINT_STYLE + html);
    expect(elapsed).toBeLessThan(50);
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
