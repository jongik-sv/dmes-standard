/** @vitest-environment happy-dom */

// 글 | HTML 형식 전환 칸(shared html-editor 의 HtmlFormatField) — 처음 형식은 detectFormat, 글 → HTML 은 textToHtml(묻지 않음),
// HTML → 글은 확인 뒤 htmlToText, 빈 값은 빈 값 그대로, 형식 경고·글자 수·상한 경고, testId 접미, 문구 바꾸기, 확인창 기본값(공용 확인창).
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DmesUiProvider } from "../../src/ui-provider";
import {
  HTML_TO_TEXT_MESSAGE,
  HtmlFormatField,
  type HtmlFormat,
  type HtmlFormatFieldProps,
} from "../../src/components/html-editor";
import { flush, installDomStorage, polyfillLayout, typeInto } from "./markdown-editor-test-utils";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  installDomStorage();
  polyfillLayout();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

const tid = <T extends Element = HTMLElement>(id: string) =>
  document.querySelector<T & Element>(`[data-testid="${id}"]`) as T | null;

/** 시험용 판별 — <p>·<b> 가 있으면 HTML. */
const detect = (v: string): HtmlFormat => (/<\/?(p|b)\b/i.test(v) ? "HTML" : "TEXT");

interface Harness {
  onChange: ReturnType<typeof vi.fn>;
  value: () => string;
}

async function mount(
  initial: string,
  props: Partial<HtmlFormatFieldProps> = {}
): Promise<Harness> {
  const onChange = vi.fn();
  let current = initial;
  function Wrap() {
    const [v, setV] = useState(initial);
    current = v;
    return createElement(HtmlFormatField, {
      value: v,
      detectFormat: detect,
      ...props,
      onChange: (next: string) => {
        onChange(next);
        setV(next);
      },
    });
  }
  await act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement(Wrap)));
  });
  await flush();
  await flush();
  return { onChange, value: () => current };
}

async function pick(testId: string, format: HtmlFormat) {
  const radio = tid(`${testId}-format`)?.querySelector<HTMLInputElement>(
    `input[type="radio"][value="${format}"]`
  );
  if (!radio) throw new Error(`${testId} 형식 ${format} 칸 없음`);
  await act(async () => {
    radio.click();
  });
  await flush();
  await flush();
}

const checked = (testId: string) =>
  tid(`${testId}-format`)?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.value;

describe("HtmlFormatField — 형식 판별·전환", () => {
  it("기본 testId·이름 — 뿌리 html-format-field, 형식 선택 `본문 형식`, 글 칸 `본문`", async () => {
    await mount("a");
    expect(tid("html-format-field")).not.toBeNull();
    expect(document.querySelector('[aria-label="본문 형식"]')).not.toBeNull();
    expect(tid("html-format-field-text")?.getAttribute("aria-label")).toBe("본문");
    expect(tid("html-format-field-format")?.textContent).toBe("글HTML");
  });

  it("처음 형식은 detectFormat — 글이면 Textarea, HTML 이면 편집기(열기만 해서는 onChange 없음)", async () => {
    const t = await mount("a < b", { testId: "f" });
    expect(checked("f")).toBe("TEXT");
    expect(tid<HTMLTextAreaElement>("f-text")?.value).toBe("a < b");
    expect(tid("f-html")).toBeNull();
    await act(async () => root.unmount());
    root = createRoot(host);
    const h = await mount("<p>가</p>", { testId: "f" });
    expect(checked("f")).toBe("HTML");
    expect(tid("f-html")).not.toBeNull();
    expect(h.onChange).not.toHaveBeenCalled();
    expect(t.onChange).not.toHaveBeenCalled();
  });

  it("글 → HTML 은 textToHtml 로 바꾸고 묻지 않는다", async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    const h = await mount("a < b\n\n둘째", { testId: "f", confirm });
    await pick("f", "HTML");
    expect(confirm).not.toHaveBeenCalled();
    expect(h.onChange).toHaveBeenLastCalledWith("<p>a &lt; b</p>\n<p><br></p>\n<p>둘째</p>");
    expect(checked("f")).toBe("HTML");
  });

  it("HTML → 글 은 확인 뒤 htmlToText — 취소면 그대로", async () => {
    const confirm = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const h = await mount("<p>가<br>나</p><p>다</p>", { testId: "f", confirm });
    await pick("f", "TEXT");
    expect(confirm).toHaveBeenCalledWith(HTML_TO_TEXT_MESSAGE);
    expect(h.onChange).not.toHaveBeenCalled();
    expect(checked("f")).toBe("HTML");
    await pick("f", "TEXT");
    expect(h.onChange).toHaveBeenLastCalledWith("가\n나\n다");
    expect(checked("f")).toBe("TEXT");
  });

  it("빈 값은 빈 값 그대로 — 형식을 바꿔도 값을 만들지 않고 묻지 않는다", async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    const h = await mount("", { testId: "f", confirm });
    await pick("f", "HTML");
    await pick("f", "TEXT");
    expect(confirm).not.toHaveBeenCalled();
    expect(h.onChange).not.toHaveBeenCalled();
    expect(checked("f")).toBe("TEXT");
  });

  it("confirm 을 주지 않으면 공용 메시지 확인창으로 묻는다", async () => {
    await mount("<p>가</p>", { testId: "f" });
    await pick("f", "TEXT");
    expect(document.body.textContent).toContain(HTML_TO_TEXT_MESSAGE);
    const ok = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "확인");
    await act(async () => {
      ok!.click();
    });
    await flush();
    await flush();
    expect(checked("f")).toBe("TEXT");
    expect(tid<HTMLTextAreaElement>("f-text")?.value).toBe("가");
  });
});

describe("HtmlFormatField — 경고·글자 수·문구", () => {
  it("저장하면 다른 형식으로 보일 값은 -format-warning 으로 알린다", async () => {
    await mount("a", { testId: "f" });
    expect(tid("f-format-warning")).toBeNull();
    await typeInto(tid<HTMLTextAreaElement>("f-text")!, "<b>굵게</b>");
    expect(tid("f-format-warning")?.textContent).toBe("HTML 태그가 들어 있어 저장하면 HTML 로 보입니다.");
    await typeInto(tid<HTMLTextAreaElement>("f-text")!, "그냥 글");
    await pick("f", "HTML");
    await act(async () => {
      tid<HTMLButtonElement>("f-html-mode-html")!.click();
    });
    await flush();
    await typeInto(tid<HTMLTextAreaElement>("f-html-source")!, "태그 없는 글");
    expect(tid("f-format-warning")?.textContent).toBe("알려진 HTML 태그가 없어 저장하면 글로 보입니다.");
  });

  it("maxLength 가 없으면 글 모드에 글자 수 줄을 그리지 않는다", async () => {
    await mount("가", { testId: "f" });
    expect(tid("f-text-count")).toBeNull();
  });

  it("maxLength 를 주면 글자 수를 보이고 넘으면 경고만 한다(입력은 막지 않는다)", async () => {
    const h = await mount("가", { testId: "f", maxLength: 1000 });
    expect(tid("f-text-count")?.textContent).toBe("1 / 1,000자");
    expect(tid("f-text-count")?.getAttribute("data-over")).toBe("false");
    expect(tid("f-text")?.hasAttribute("maxlength")).toBe(false);
    await typeInto(tid<HTMLTextAreaElement>("f-text")!, "x".repeat(1001));
    expect(h.value().length).toBe(1001);
    expect(tid("f-text-count")?.getAttribute("data-over")).toBe("true");
    expect(tid("f-text-count")?.querySelector('[role="alert"]')?.textContent).toBe(
      "1,000자를 넘었습니다. 줄이지 않으면 저장하지 못합니다."
    );
    expect(tid("f-text-count")?.textContent).toContain("1,001 / 1,000자");
  });

  it("HTML 모드 편집기에도 같은 상한을 준다", async () => {
    await mount("<p>a</p>", { testId: "f", maxLength: 50 });
    expect(tid("f-html-count")?.textContent).toBe("글자 1 · HTML 8 / 50자");
  });

  it("messages 로 문구를 바꾸고, 경고를 null 로 끌 수 있다", async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    await mount("<p>a</p>", {
      testId: "f",
      confirm,
      maxLength: 3,
      messages: {
        textLabel: "TEXT",
        htmlLabel: "Html",
        toTextConfirm: "바꿀까요?",
        htmlLooksText: null,
        textLooksHtml: "태그 있음",
        overLimit: (max) => `${max} 초과`,
      },
    });
    expect(tid("f-format")?.textContent).toBe("TEXTHtml");
    await pick("f", "TEXT");
    expect(confirm).toHaveBeenCalledWith("바꿀까요?");
    await act(async () => root.unmount());
    root = createRoot(host);
    await mount("abcd", {
      testId: "g",
      maxLength: 3,
      messages: { textLooksHtml: "태그 있음", overLimit: (max) => `${max} 초과` },
    });
    expect(tid("g-text-count")?.querySelector('[role="alert"]')?.textContent).toBe("3 초과");
    await typeInto(tid<HTMLTextAreaElement>("g-text")!, "<b>x</b>");
    expect(tid("g-format-warning")?.textContent).toBe("태그 있음");
  });

  it("rows 기본 2, 바꿀 수 있다", async () => {
    await mount("a", { testId: "f", rows: 5 });
    expect(tid("f-text")?.getAttribute("rows")).toBe("5");
  });
});
