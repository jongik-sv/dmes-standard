/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";
import {
  Button,
  Checkbox,
  ComboBox,
  DatePicker,
  FormGroup,
  Input,
  MultiSelectComboBox,
  Radio,
  Select,
  Textarea,
} from "../../src/components/form";
import { renderWithMantine } from "./mantine-test-utils";
import { dmesTheme } from "../../src/ui-provider/theme";

// React 는 controlled input/textarea 노드에 값 추적용 setter 를 얹어두므로, 테스트에서
// `el.value = x` 로 직접 대입하면 React 가 이미 그 값을 "알고 있는 값"으로 간주해 뒤이은
// input 이벤트에서 onChange 를 호출하지 않는다(널리 알려진 RTL fireEvent.change 의 이유와 동일).
// 네이티브 프로토타입의 setter 를 직접 호출해 이 추적을 우회한다.
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  descriptor?.set?.call(el, value);
}

describe("form (Mantine 구현) 계약", () => {
  it("Input 은 onChange(value: string) 로 문자열을 돌려주고 form-input 클래스를 유지한다", () => {
    const onChange = vi.fn();
    const r = renderWithMantine(createElement(Input, { value: "a", onChange, id: "f1" }));
    const input = r.host.querySelector("input#f1") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.className).toContain("form-input");
    act(() => {
      setNativeValue(input, "ab");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("ab");
    r.unmount();
  });

  it("Input error 는 role=alert 메시지를 렌더한다", () => {
    const r = renderWithMantine(createElement(Input, { value: "", error: "필수" }));
    expect(r.host.querySelector('[role="alert"]')?.textContent).toContain("필수");
    r.unmount();
  });

  it("Select 는 placeholder 를 빈 값 옵션으로 두고 string 값을 돌려준다", () => {
    const onChange = vi.fn();
    const r = renderWithMantine(
      createElement(Select, { value: "", onChange, placeholder: "선택", options: ["A", { value: "b", label: "B" }] }),
    );
    const sel = r.host.querySelector("select") as HTMLSelectElement;
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(["", "A", "b"]);
    act(() => {
      sel.value = "b";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("b");
    r.unmount();
  });

  it("Button variant/size 를 Mantine 으로 매핑하면서 form-button 클래스를 유지한다", () => {
    const onClick = vi.fn();
    const r = renderWithMantine(createElement(Button, { variant: "primary", size: "sm", onClick }, "저장"));
    const btn = r.host.querySelector("button") as HTMLButtonElement;
    expect(btn.className).toContain("form-button");
    expect(btn.textContent).toContain("저장");
    act(() => btn.click());
    expect(onClick).toHaveBeenCalled();
    r.unmount();
  });

  it("Checkbox 는 onChange(checked: boolean) 을 돌려준다", () => {
    const onChange = vi.fn();
    const r = renderWithMantine(createElement(Checkbox, { checked: false, onChange, label: "사용" }));
    const cb = r.host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    act(() => cb.click());
    expect(onChange).toHaveBeenCalledWith(true);
    r.unmount();
  });

  it("Radio 는 options 의 value 를 돌려준다", () => {
    const onChange = vi.fn();
    const r = renderWithMantine(createElement(Radio, { value: "Y", onChange, options: ["Y", { value: "N", label: "아니오" }] }));
    const radios = r.host.querySelectorAll('input[type="radio"]');
    expect(radios.length).toBe(2);
    act(() => (radios[1] as HTMLInputElement).click());
    expect(onChange).toHaveBeenCalledWith("N");
    // 옵션들은 Group(가로 배치)으로 감싸져 있어야 한다.
    expect(r.host.querySelector(".mantine-Group-root")).not.toBeNull();
    r.unmount();
  });

  it("DatePicker 는 YYYY-MM-DD 문자열을 주고받는다", () => {
    const onChange = vi.fn();
    const r = renderWithMantine(createElement(DatePicker, { value: "2026-09-07", onChange, id: "d1" }));
    const input = r.host.querySelector("input#d1") as HTMLInputElement;
    expect(input.value).toContain("2026");
    r.unmount();
  });

  it("Textarea 는 onChange(value: string) 을 돌려준다", () => {
    const onChange = vi.fn();
    const r = renderWithMantine(createElement(Textarea, { value: "", onChange }));
    const ta = r.host.querySelector("textarea") as HTMLTextAreaElement;
    act(() => {
      setNativeValue(ta, "x");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("x");
    r.unmount();
  });

  it("ComboBox 는 옵션 선택 시 onChange(value, item) 을 돌려준다", () => {
    const onChange = vi.fn();
    const data = [
      { value: "a", label: "Apple" },
      { value: "b", label: "Banana" },
    ];
    const r = renderWithMantine(createElement(ComboBox, { data, value: "", onChange }));
    const input = r.host.querySelector("input") as HTMLInputElement;
    act(() => input.focus());
    const options = r.host.querySelectorAll('[role="option"]');
    expect(options.length).toBe(2);
    act(() => (options[1] as HTMLElement).click());
    expect(onChange).toHaveBeenCalledWith("b", { value: "b", label: "Banana" });
    r.unmount();
  });

  it("ComboBox 는 maxVisible 만큼만 옵션을 렌더한다", () => {
    const data = Array.from({ length: 50 }, (_, i) => ({ value: String(i), label: `Item${i}` }));
    const r = renderWithMantine(createElement(ComboBox, { data, value: "", maxVisible: 5 }));
    const input = r.host.querySelector("input") as HTMLInputElement;
    act(() => input.focus());
    const options = r.host.querySelectorAll('[role="option"]');
    expect(options.length).toBe(5);
    r.unmount();
  });

  it("MultiSelectComboBox 는 value 배열을 태그로 표시하고 onChange(values) 로 왕복한다", () => {
    const onChange = vi.fn();
    const data = [
      { value: "a", label: "Apple" },
      { value: "b", label: "Banana" },
    ];
    const r = renderWithMantine(createElement(MultiSelectComboBox, { data, value: ["a"], onChange }));
    expect(r.host.textContent).toContain("Apple");
    const input = r.host.querySelector("input") as HTMLInputElement;
    act(() => input.focus());
    const options = r.host.querySelectorAll('[role="option"]');
    act(() => (options[1] as HTMLElement).click());
    expect(onChange).toHaveBeenCalledWith(["a", "b"]);
    r.unmount();
  });

  it("FormGroup + Input 은 SSR 마크업에서부터 aria-invalid/aria-describedby 를 정확히 렌더한다", () => {
    const html = renderToStaticMarkup(
      createElement(
        MantineProvider,
        { theme: dmesTheme },
        createElement(FormGroup, { label: "이름", error: "필수" }, createElement(Input, { value: "" })),
      ),
    );
    const inputTag = html.match(/<input[^>]*>/)?.[0] ?? "";
    expect(inputTag).toContain('aria-invalid="true"');
    expect(inputTag).toMatch(/aria-describedby="[^"]+"/);
  });
});
