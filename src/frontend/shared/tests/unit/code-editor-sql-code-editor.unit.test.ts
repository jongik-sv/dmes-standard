/** @vitest-environment happy-dom */
// SqlCodeEditor — jsdom 에서는 monaco-editor 를 불러오지 못해(vitest alias 대역) Textarea 대체 칸으로 돈다.
// 대체 칸의 계약(testId·aria-label·값), 제어형·비제어형, 큰 창 적용·취소, 핸들(insertAtCursor)을 본다. Monaco 실제 동작은 브라우저 확인.
import { act, createElement, createRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SqlCodeEditor, type SqlCodeEditorHandle, type SqlCodeEditorProps } from "../../src/components/code-editor";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

let current: Rendered | null = null;
afterEach(() => {
  current?.unmount();
  current = null;
});

async function mount(props: SqlCodeEditorProps & { ref?: React.Ref<SqlCodeEditorHandle> }) {
  current = renderWithMantine(createElement(SqlCodeEditor, props));
  // monaco 불러오기 거절 → 상태 failed 까지 흘려보낸다.
  await act(async () => {
    await Promise.resolve();
  });
  return current;
}
async function rerender(props: SqlCodeEditorProps) {
  const r = current!;
  const { MantineProvider } = await import("@mantine/core");
  const { dmesTheme } = await import("../../src/ui-provider/theme");
  await act(async () => {
    r.root.render(createElement(MantineProvider, { theme: dmesTheme }, createElement(SqlCodeEditor, props)));
  });
}

function typeInto(el: HTMLTextAreaElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const clickByTestId = async (id: string) => {
  await act(async () => q<HTMLElement>(`[data-testid="${id}"]`)!.click());
};

describe("SqlCodeEditor — 대체 칸", () => {
  it("같은 testId·aria-label·값의 Textarea 를 보인다", async () => {
    await mount({ value: "SELECT 1", testId: "sql-a", ariaLabel: "SQL", onChange: () => {} });
    const ta = q<HTMLTextAreaElement>('textarea[data-testid="sql-a"]');
    expect(ta).not.toBeNull();
    expect(ta!.getAttribute("aria-label")).toBe("SQL");
    expect(ta!.value).toBe("SELECT 1");
  });

  it("타이핑하면 onChange 를 부른다", async () => {
    const onChange = vi.fn();
    await mount({ value: "", onChange, testId: "sql-b" });
    typeInto(q<HTMLTextAreaElement>('[data-testid="sql-b"]')!, "SELECT 2");
    expect(onChange).toHaveBeenLastCalledWith("SELECT 2");
  });

  it("제어형은 부모 값이 바뀌면 따라가고 onChange 를 부르지 않는다", async () => {
    const onChange = vi.fn();
    await mount({ value: "A", onChange, testId: "sql-c" });
    await rerender({ value: "B", onChange, testId: "sql-c" });
    expect(q<HTMLTextAreaElement>('[data-testid="sql-c"]')!.value).toBe("B");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("비제어형은 revision 이 오르면 defaultValue 로 되돌린다(같은 값이어도)", async () => {
    const onChange = vi.fn();
    await mount({ defaultValue: "SELECT 1", revision: 0, onChange, testId: "sql-d" });
    typeInto(q<HTMLTextAreaElement>('[data-testid="sql-d"]')!, "edited");
    onChange.mockClear();
    await rerender({ defaultValue: "SELECT 1", revision: 0, onChange, testId: "sql-d" });
    expect(q<HTMLTextAreaElement>('[data-testid="sql-d"]')!.value).toBe("edited");
    await rerender({ defaultValue: "SELECT 1", revision: 1, onChange, testId: "sql-d" });
    expect(q<HTMLTextAreaElement>('[data-testid="sql-d"]')!.value).toBe("SELECT 1");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("expandable=false 면 크게 보기 버튼이 없다", async () => {
    await mount({ value: "", expandable: false, testId: "sql-e", onChange: () => {} });
    expect(q('[data-testid="sql-e-expand"]')).toBeNull();
  });
});

describe("SqlCodeEditor — 큰 창", () => {
  it("[적용] 은 고친 값을 onChange 로 돌려주고 창을 닫는다", async () => {
    const onChange = vi.fn();
    await mount({ value: "SELECT 1", onChange, testId: "sql-f", expandTitle: "쿼리 SQL" });
    await clickByTestId("sql-f-expand");
    expect(document.body.textContent).toContain("쿼리 SQL");
    const big = q<HTMLTextAreaElement>('[data-testid="sql-f-modal"] textarea')!;
    expect(big.value).toBe("SELECT 1");
    typeInto(big, "SELECT 99");
    expect(onChange).not.toHaveBeenCalled();
    await clickByTestId("sql-f-apply");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("SELECT 99");
  });

  it("[취소] 는 고친 값을 버린다", async () => {
    const onChange = vi.fn();
    await mount({ value: "SELECT 1", onChange, testId: "sql-g" });
    await clickByTestId("sql-g-expand");
    typeInto(q<HTMLTextAreaElement>('[data-testid="sql-g-modal"] textarea')!, "DROP");
    await clickByTestId("sql-g-cancel");
    expect(onChange).not.toHaveBeenCalled();
    // Mantine 닫힘 전환이 끝나야 창이 DOM 에서 빠진다.
    await vi.waitFor(() => expect(q('[data-testid="sql-g-modal"]')).toBeNull(), { timeout: 2000 });
  });

  it("readOnly 면 [닫기] 만 있고 [적용] 이 없다", async () => {
    await mount({ value: "SELECT 1", readOnly: true, testId: "sql-h", onChange: () => {} });
    await clickByTestId("sql-h-expand");
    expect(q('[data-testid="sql-h-apply"]')).toBeNull();
    const close = q<HTMLElement>('[data-testid="sql-h-cancel"]')!;
    expect(close.textContent).toContain("닫기");
  });
});

describe("SqlCodeEditor — 핸들", () => {
  it("setValue 는 값을 바꾸고 onChange 를 부른다", async () => {
    const ref = createRef<SqlCodeEditorHandle>();
    const onChange = vi.fn();
    await mount({ defaultValue: "a", onChange, ref, testId: "sql-i" });
    act(() => ref.current!.setValue("b"));
    expect(ref.current!.getValue()).toBe("b");
    expect(onChange).toHaveBeenLastCalledWith("b");
    expect(q<HTMLTextAreaElement>('[data-testid="sql-i"]')!.value).toBe("b");
  });

  it("insertAtCursor(column) 는 칸 이름 앞에 공백·쉼표를 알맞게 붙인다", async () => {
    const ref = createRef<SqlCodeEditorHandle>();
    await mount({ defaultValue: "SELECT EMP_NO FROM T", ref, testId: "sql-j" });
    const ta = q<HTMLTextAreaElement>('[data-testid="sql-j"]')!;
    ta.setSelectionRange("SELECT EMP_NO".length, "SELECT EMP_NO".length);
    let ok = false;
    await act(async () => {
      ok = ref.current!.insertAtCursor("ENAME", "column");
    });
    expect(ok).toBe(true);
    expect(ref.current!.getValue()).toBe("SELECT EMP_NO, ENAME FROM T");
  });

  it("captureInsertPoint 로 잡은 자리는 그 뒤로 내용이 안 바뀌었으면 그 자리에 끼운다", async () => {
    const ref = createRef<SqlCodeEditorHandle>();
    await mount({ defaultValue: "WHERE A = ", ref, testId: "sql-k" });
    const ta = q<HTMLTextAreaElement>('[data-testid="sql-k"]')!;
    ta.setSelectionRange(10, 10);
    const at = ref.current!.captureInsertPoint();
    expect(at).toEqual(expect.objectContaining({ start: 10, end: 10 }));
    ta.setSelectionRange(0, 0);
    await act(async () => {
      ref.current!.insertAtCursor("'X'", "value", at);
    });
    expect(ref.current!.getValue()).toBe("WHERE A = 'X'");
  });
});

describe("SqlCodeEditor — 실행 키·읽기 전용", () => {
  const keyDown = (el: Element, init: KeyboardEventInit) => act(() => void el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init })));

  it("대체 칸에서도 Ctrl+Enter, F8 이 onRun 을 부른다", async () => {
    const onRun = vi.fn();
    await mount({ value: "SELECT 1", onChange: () => {}, onRun, testId: "sql-l" });
    const ta = q<HTMLTextAreaElement>('[data-testid="sql-l"]')!;
    keyDown(ta, { key: "Enter", ctrlKey: true });
    keyDown(ta, { key: "F8" });
    keyDown(ta, { key: "Enter" });
    expect(onRun).toHaveBeenCalledTimes(2);
  });

  it("큰 창에서 Ctrl+Enter 는 방금 고친 SQL 로 적용한 뒤 실행한다(부모가 새 값으로 그린 뒤 onRun)", async () => {
    const ran: string[] = [];
    function Harness() {
      const [sql, setSql] = useState("old");
      return createElement(SqlCodeEditor, { value: sql, onChange: setSql, onRun: () => ran.push(sql), testId: "sql-m" });
    }
    current = renderWithMantine(createElement(Harness));
    await act(async () => {
      await Promise.resolve();
    });
    await clickByTestId("sql-m-expand");
    const big = q<HTMLTextAreaElement>('[data-testid="sql-m-modal"] textarea')!;
    typeInto(big, "new");
    keyDown(big, { key: "Enter", ctrlKey: true });
    expect(ran).toEqual(["new"]);
    expect(q<HTMLTextAreaElement>('textarea[data-testid="sql-m"]')!.value).toBe("new");
  });

  it("readOnly 면 insertAtCursor 가 false 이고 값을 바꾸지 않는다", async () => {
    const ref = createRef<SqlCodeEditorHandle>();
    await mount({ defaultValue: "SELECT", readOnly: true, ref, testId: "sql-n" });
    let ok = true;
    await act(async () => {
      ok = ref.current!.insertAtCursor("X", "raw");
    });
    expect(ok).toBe(false);
    expect(ref.current!.getValue()).toBe("SELECT");
  });
});
