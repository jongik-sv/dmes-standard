/** @vitest-environment happy-dom */
import { act, createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Button,
  Checkbox,
  ComboBox,
  DatePicker,
  DateTimePicker,
  parseDateTime,
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

describe("DateTimePicker 계약 (직접 입력 · 24시간제 · 초)", () => {
  async function flush() {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  function panel(): HTMLElement {
    const el = document.body.querySelector("[data-dates-dropdown]");
    if (!el) throw new Error("패널이 열려 있지 않습니다");
    return el as HTMLElement;
  }

  function setNativeValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  }

  /** React 의 onBlur 는 focusout 에 붙는다(포커스를 준 적이 없는 노드에서 blur() 는 아무 일도 없다). */
  function fireBlur(el: HTMLElement) {
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  }

  /** 닫을 때 Mantine Transition 이 종료(150ms)한 뒤에 패널 노드가 빠진다. */
  async function waitPanelGone() {
    for (let i = 0; i < 20 && document.body.querySelector("[data-dates-dropdown]"); i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        await new Promise((r) => setTimeout(r, 25));
      });
    }
  }

  /** 브라우저 키 입력 모사 — 선택 영역은 치환하고, 없으면 캐럿 위치에 넣어 뒤로 캐럿을 보낸다. */
  function typeChar(el: HTMLInputElement, ch: string) {
    const len = el.value.length;
    const start = el.selectionStart ?? len;
    const end = el.selectionEnd ?? len;
    const next = start !== end
      ? el.value.slice(0, start) + ch + el.value.slice(end)
      : el.value.slice(0, start) + ch + el.value.slice(start);
    setNativeValue(el, next);
    el.setSelectionRange?.(next.length, next.length);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /** 트리거 → 연·월 → 날짜 → 시·분·초 순으로 실제 조작한다(화면 사용자가 고르는 경로). */
  async function pick(trigger: () => HTMLElement, value: string) {
    const [, y, mo, d, hh, mm, ss] = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value)!;
    await act(async () => {
      trigger().click();
    });
    await flush();
    for (const [which, v] of [["year", y], ["month", String(Number(mo) - 1)]] as const) {
      await act(async () => {
        const sel = panel().querySelector(`select[data-select="${which}"]`) as HTMLSelectElement;
        setNativeValue(sel, v);
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await flush();
    }
    const day = Array.from(panel().querySelectorAll("button"))
      .find((b) => b.textContent?.trim() === String(Number(d)) && !b.hasAttribute("data-outside"))!;
    await act(async () => {
      (day as HTMLElement).click();
    });
    await flush();
    for (const [label, v] of [["시", hh], ["분", mm], ["초", ss]] as const) {
      await act(async () => {
        const input = panel().querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
        setNativeValue(input, v);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await flush();
    }
  }

  /** controlled 로 쓰는 실제 사용 형태(값을 상태로 들고 있다). */
  function Controlled({ initial = "" }: { initial?: string }) {
    const [value, setValue] = useState(initial);
    return createElement(DateTimePicker, { value, onChange: setValue, id: "dt1", "data-testid": "dt" });
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("datetime-local 이 아니라 직접 칠 수 있는 text 입력이다", () => {
    const r = renderWithMantine(createElement(Controlled));
    const input = r.host.querySelector("#dt1") as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
    // 브라우저 기본 type(=OS 지역 설정을 따르는 datetime-local)을 쓰지 않는다.
    expect(input.getAttribute("type")).toBeNull();
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("YYYY-MM-DD HH:mm:ss");
    // data-testid 등 속성이 입력 칸에 그대로 실린다.
    expect(r.host.querySelector('[data-testid="dt"]')).toBe(input);
    r.unmount();
  });

  it("입력 칸에 한 글자씩 치면 YYYY-MM-DD HH:mm:ss 가 값이 되고 초까지 보존된다", async () => {
    const seen: string[] = [];
    function Controlled2() {
      const [value, setValue] = useState("");
      return createElement(DateTimePicker, {
        value,
        onChange: (v: string) => {
          seen.push(v);
          setValue(v);
        },
        id: "dt1",
      });
    }
    const r = renderWithMantine(createElement(Controlled2));
    const input = r.host.querySelector("#dt1") as HTMLInputElement;
    for (const ch of "2026-10-01 21:45:37") {
      await act(async () => {
        typeChar(input, ch);
      });
    }
    await flush();
    // 값은 다 친 뒤 한 번, 초까지 그대로.
    expect(seen).toEqual(["2026-10-01 21:45:37"]);
    expect(input.value).toBe("2026-10-01 21:45:37");
    expect(input.value).not.toMatch(/오후|AM|PM/);
    r.unmount();
  });

  it("붙여 넣은 값도 같다 — 통째로 한 번에 바꿔도 초가 남는다", async () => {
    const onChange = vi.fn();
    function Controlled3() {
      const [value, setValue] = useState("");
      return createElement(DateTimePicker, { value, onChange: (v: string) => { onChange(v); setValue(v); }, id: "dt1" });
    }
    const r = renderWithMantine(createElement(Controlled3));
    const input = r.host.querySelector("#dt1") as HTMLInputElement;
    await act(async () => {
      setNativeValue(input, "2026-10-01 21:45:37");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();
    expect(onChange).toHaveBeenLastCalledWith("2026-10-01 21:45:37");
    r.unmount();
  });

  it("읽을 수 없는 글자는 값을 바꾸지 않고, 포커스를 벗어나면 원래 값으로 되돌린다", async () => {
    const onChange = vi.fn();
    const r = renderWithMantine(createElement(DateTimePicker, { value: "2026-10-01 21:45:37", onChange, id: "dt1" }));
    const input = r.host.querySelector("#dt1") as HTMLInputElement;
    for (const bad of ["2026-10-01 25:00:00", "2026-13-01 00:00:00", "2026-10-32 00:00:00", "2026-10-01 21:45"]) {
      await act(async () => {
        setNativeValue(input, bad);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await flush();
      // 글자 자체는 보이지만 값은 그대로다.
      expect(input.value).toBe(bad);
      expect(onChange).not.toHaveBeenCalled();
      // 포커스를 벗어나면 원래 값으로 되돌린다(DateInput 의 fixOnBlur 와 같다).
      await act(async () => {
        fireBlur(input);
      });
      await flush();
      expect(input.value).toBe("2026-10-01 21:45:37");
    }
    r.unmount();
  });

  it("빈 칸은 해제다 — 값을 빈 문자열로 돌려준다", async () => {
    const onChange = vi.fn();
    const r = renderWithMantine(createElement(DateTimePicker, { value: "2026-10-01 21:45:37", onChange, id: "dt1" }));
    const input = r.host.querySelector("#dt1") as HTMLInputElement;
    await act(async () => {
      setNativeValue(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();
    expect(onChange).toHaveBeenLastCalledWith("");
    r.unmount();
  });

  it("Enter 는 확정해 닫고, Escape 는 되돌리고 닫는다", async () => {
    const r = renderWithMantine(createElement(Controlled));
    const input = r.host.querySelector("#dt1") as HTMLElement;
    await act(async () => {
      input.click();
    });
    await flush();
    expect(document.body.querySelector("[data-dates-dropdown]")).not.toBeNull();
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await waitPanelGone();
    expect(document.body.querySelector("[data-dates-dropdown]")).toBeNull();

    await act(async () => {
      input.click();
    });
    await flush();
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await waitPanelGone();
    expect(document.body.querySelector("[data-dates-dropdown]")).toBeNull();
    expect((input as HTMLInputElement).value).toBe("");
    r.unmount();
  });

  it("달력 버튼과 시·분·초 칸이 그대로 있다 — 클릭하면 패널이 열린다", async () => {
    const r = renderWithMantine(createElement(Controlled));
    const input = r.host.querySelector("#dt1") as HTMLElement;
    await act(async () => {
      input.click();
    });
    await flush();
    const p = panel();
    expect(p.querySelector("select[data-select='year']")).not.toBeNull();
    expect(p.querySelectorAll("button").length).toBeGreaterThan(20);
    r.unmount();
  });

  it("패널 폭이 순환해 화면을 덮지 않는다 — 드롭다운은 max-content, 달력 표는 전체 폭을 받지 않는다", async () => {
    // 회귀 근거(실제 Chromium 실측): 드롭다운 인라인 폭이 `max-content` 인데 달력 `<table>` 이
    // `width: 100%` 를 받으면(max-content 상자 안의 백분율이라 상자와 표가 서로를 재는 순환이 된다)
    // 상자·levelsGroup·표가 모두 666693px 로 무한히 커져 화면 전체를 덮는 흰 상자가 된다.
    // happy-dom 은 레이아웃을 재지 않으므로 폭 수치가 아니라 이 조합(prop 이 DOM 에 실렸는지)을 본다.
    const r = renderWithMantine(createElement(Controlled));
    const input = r.host.querySelector("#dt1") as HTMLElement;
    await act(async () => {
      input.click();
    });
    await flush();
    const dropdown = panel();
    expect(dropdown.style.width).toBe("max-content");
    const table = dropdown.querySelector("table");
    expect(table, "달력 표가 있어야 한다").not.toBeNull();
    // 설치 CSS 의 `[data-full-width]{width:100%}` 가 붙지 않아야 표가 부모에 맞춰 늘어나지 않는다.
    expect(table!.hasAttribute("data-full-width")).toBe(false);
    expect((table as HTMLElement).style.width).toBe("");
    r.unmount();
  });

  it("입력 칸에서 포커스가 패널로 넘어가도 닫히지 않는다 — 고르는 길이 막히면 안 된다", async () => {
    const r = renderWithMantine(createElement(Controlled));
    const input = r.host.querySelector("#dt1") as HTMLElement;
    await act(async () => {
      input.click();
    });
    await flush();
    // 달력·시간 칸을 누르면 입력 칸의 포커스가 빠져 나간다(happy-dom 의 click() 은 blur 를 안 부르므로 직접 보낸다).
    await act(async () => {
      fireBlur(input);
    });
    await flush();
    expect(document.body.querySelector("[data-dates-dropdown]")).not.toBeNull();
    r.unmount();
  });

  it("패널의 확인(✓) 을 누르면 정규화하고 닫는다", async () => {
    const r = renderWithMantine(createElement(Controlled));
    const input = () => r.host.querySelector("#dt1") as HTMLElement;
    await pick(input, "2026-10-01 21:45:37");
    expect((input() as HTMLInputElement).value).toBe("2026-10-01 21:45:37");
    // 시간 영역의 마지막 버튼이 확인(✓) 이다(달력 다음에 온다).
    const buttons = Array.from(panel().querySelectorAll("button"));
    await act(async () => {
      (buttons[buttons.length - 1] as HTMLElement).click();
    });
    await waitPanelGone();
    expect(document.body.querySelector("[data-dates-dropdown]")).toBeNull();
    expect((input() as HTMLInputElement).value).toBe("2026-10-01 21:45:37");
    r.unmount();
  });

  it("시·분·초 세 칸(24시간제)만 있고 오전/오후 select 는 없다", async () => {
    const r = renderWithMantine(createElement(Controlled));
    const input = r.host.querySelector("#dt1") as HTMLElement;
    await act(async () => {
      input.click();
    });
    await flush();
    const p = panel();
    expect(p.querySelectorAll('input[aria-label="시"], input[aria-label="분"], input[aria-label="초"]')).toHaveLength(3);
    // select 은 달력의 연·월 2개뿐이다(AmPmInput 의 오전/오후 select 가 없다는 뜻).
    expect(p.querySelectorAll("select")).toHaveLength(2);
    expect(p.textContent).not.toMatch(/AM|PM/);
    r.unmount();
  });

  it("달력에서 고른 값도 입력 칸에 24시간제·초까지 보인다", async () => {
    const r = renderWithMantine(createElement(Controlled));
    const input = () => r.host.querySelector("#dt1") as HTMLElement;
    await pick(input, "2026-10-01 21:45:37");
    expect((input() as HTMLInputElement).value).toBe("2026-10-01 21:45:37");
    r.unmount();
  });

  it("날짜를 고른 직후 시간을 빠르게 연속 입력해도 앞 글자가 사라지지 않는다", async () => {
    const r = renderWithMantine(createElement(Controlled));
    const input = () => r.host.querySelector("#dt1") as HTMLElement;
    // 연·월·날짜까지는 천천히, 시간은 리렌더 없이 한 번에 연속 입력한다(= 빠르게 치는 손).
    await act(async () => {
      input().click();
    });
    await flush();
    for (const [which, v] of [["year", "2026"], ["month", "9"]] as const) {
      await act(async () => {
        const sel = panel().querySelector(`select[data-select="${which}"]`) as HTMLSelectElement;
        setNativeValue(sel, v);
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await flush();
    }
    const day = Array.from(panel().querySelectorAll("button"))
      .find((b) => b.textContent?.trim() === "1" && !b.hasAttribute("data-outside"))!;
    await act(async () => {
      (day as HTMLElement).click();
    });
    await flush();

    const hours = panel().querySelector('input[aria-label="시"]') as HTMLInputElement;
    const minutes = panel().querySelector('input[aria-label="분"]') as HTMLInputElement;
    const seconds = panel().querySelector('input[aria-label="초"]') as HTMLInputElement;
    // 칸을 누르면 전체 선택 → "1" 이 0 을 치환한다.
    for (const [field, digits] of [[hours, "14"], [minutes, "30"], [seconds, "15"]] as const) {
      await act(async () => {
        field.click();
        field.setSelectionRange?.(0, field.value.length);
        for (const ch of digits) typeChar(field, ch);
      });
      await flush();
    }
    expect((input() as HTMLInputElement).value).toBe("2026-10-01 14:30:15");
    r.unmount();
  });

  it("시간 칸에 한 글자씩 치면 칸에 들어갈 때 선택된 기존 값을 덮어쓴다(14 30 15 → 14:30:15)", async () => {
    // 칸을 누르면 Mantine 이 그 칸의 값을 전체 선택한다(`SpinInput` 의 onFocus/onClick). 그래서 시 칸에
    // `1` 을 치면 10 이 아니라 1 이 되고, `4` 를 이어 치면 14 가 되어 분 칸으로 넘어간다. 분 칸도 다시
    // 선택된 상태라 `3` 이 04 뒤에 붙지 않고 03 이 된다. (캐럿을 만지면 실제 사람이 못 치게 된다.)
    const r = renderWithMantine(createElement(Controlled));
    const text = () => r.host.querySelector("#dt1") as HTMLInputElement;
    await pick(text, "2026-10-01 10:04:15");
    expect(text().value).toBe("2026-10-01 10:04:15");

    const hours = panel().querySelector('input[aria-label="시"]') as HTMLInputElement;
    const minutes = panel().querySelector('input[aria-label="분"]') as HTMLInputElement;
    const seconds = panel().querySelector('input[aria-label="초"]') as HTMLInputElement;

    // 칸에 들어갈 때의 전체 선택을 흉내낸다(브라우저의 select() 와 같다).
    const typeField = async (field: HTMLInputElement, digits: string) => {
      await act(async () => {
        field.click();
        field.setSelectionRange?.(0, field.value.length);
      });
      for (const ch of digits) {
        await act(async () => {
          typeChar(field, ch);
        });
        await flush();
      }
    };

    await typeField(hours, "14");
    expect(text().value).toBe("2026-10-01 14:04:15");
    await typeField(minutes, "30");
    expect(text().value).toBe("2026-10-01 14:30:15");
    await typeField(seconds, "15");
    expect(text().value).toBe("2026-10-01 14:30:15");
    r.unmount();
  });

  it("읽을 수 없는 값 prop 은 빈 칸으로 본다", () => {
    const r = renderWithMantine(createElement(DateTimePicker, { value: "잘못된 값", onChange: vi.fn(), id: "dt1" }));
    const input = r.host.querySelector("#dt1") as HTMLInputElement;
    expect(input.value).toBe("");
    r.unmount();
  });

  it("error 는 role=alert 메시지를 렌더하고 입력 칸에 aria-invalid/aria-describedby 를 건다", () => {
    const r = renderWithMantine(createElement(DateTimePicker, { value: "", error: "필수", id: "dt1" }));
    expect(r.host.querySelector('[role="alert"]')?.textContent).toContain("필수");
    const input = r.host.querySelector("#dt1") as HTMLInputElement;
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("dt1-error");
    r.unmount();
  });

  it("disabled/readOnly 는 입력 칸에 그대로 실리고 readOnly 는 패널이 열리지 않는다", async () => {
    const disabled = renderWithMantine(createElement(DateTimePicker, { value: "", disabled: true, id: "dt1" }));
    expect((disabled.host.querySelector("#dt1") as HTMLInputElement).disabled).toBe(true);
    disabled.unmount();

    const ro = renderWithMantine(createElement(DateTimePicker, { value: "", readOnly: true, id: "dt1" }));
    const input = ro.host.querySelector("#dt1") as HTMLElement;
    expect((input as HTMLInputElement).readOnly).toBe(true);
    await act(async () => {
      input.click();
    });
    await flush();
    expect(document.body.querySelector("[data-dates-dropdown]")).toBeNull();
    ro.unmount();
  });
});

describe("parseDateTime", () => {
  it("공백 구분자를 정규화해 벽시계 문자열로 돌려준다", () => {
    expect(parseDateTime("2026-10-01 21:45:37")).toBe("2026-10-01 21:45:37");
    expect(parseDateTime("2026-10-01T21:45:37")).toBe("2026-10-01 21:45:37");
    expect(parseDateTime("  2026-10-01 21:45:37  ")).toBe("2026-10-01 21:45:37");
  });

  it.each([
    ["빈 값", ""],
    ["공백뿐", "   "],
    ["null", null],
    ["undefined", undefined],
    ["초 없는 분 단위", "2026-10-01 21:45"],
    ["날짜만", "2026-10-01"],
    ["글자", "not a date"],
    ["존재하지 않는 달", "2026-13-01 00:00:00"],
    ["존재하지 않는 날", "2026-10-32 00:00:00"],
    ["윤년이 아닌 2월 29일", "2026-02-29 00:00:00"],
    ["윤년이 아닌 2월 30일", "2025-02-30 00:00:00"],
    ["25시", "2026-10-01 25:00:00"],
    ["60분", "2026-10-01 10:60:00"],
    ["60초", "2026-10-01 10:00:60"],
  ])("%s → null", (_name, input) => {
    expect(parseDateTime(input as string | null | undefined)).toBeNull();
  });

  it("윤년 2월 29일은 받아들인다", () => {
    expect(parseDateTime("2028-02-29 00:00:00")).toBe("2028-02-29 00:00:00");
  });

  it.each(["00:00:00", "09:30:15", "13:05:09", "23:59:59"])("자정~23시 59분 59초의 경계값 %s 을 보존한다", (time) => {
    expect(parseDateTime(`2026-10-01 ${time}`)).toBe(`2026-10-01 ${time}`);
  });
});
