/** @vitest-environment happy-dom */
/**
 * useDetailDraft(상세 폼 초안)·useBusy(키별 busy):
 *  - 폼 안 입력은 부모(루트)를 다시 그리지 않고, blur 에만 onCommit 으로 알린다.
 *  - 행 전환 때 미반영 초안을 이전 행 기준으로 먼저 반영한 뒤 새 행으로 바꾼다.
 *  - busy 는 키별이라 조회 키와 저장 키가 서로 영향을 주지 않는다.
 */
import { act, createElement, forwardRef, memo, useImperativeHandle, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBusy, useDetailDraft, type DetailDraftHandle } from "../../src/components/form";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

let r: Rendered | null = null;
afterEach(() => {
  r?.unmount();
  r = null;
});

type Row = { id: number; name: string };

const Form = memo(
  forwardRef<DetailDraftHandle<Row>, { row: Row | null; onCommit: (d: Row, base: Row) => void }>(function Form(
    { row, onCommit },
    ref
  ) {
    const { draft, setField, containerProps, handle } = useDetailDraft(row, { onCommit, rowKey: (x) => x.id });
    useImperativeHandle(ref, () => handle, [handle]);
    return createElement(
      "div",
      { ...containerProps, "data-testid": "form" },
      createElement("input", {
        value: draft?.name ?? "",
        onChange: (e: { target: { value: string } }) => setField("name", e.target.value),
      }),
      createElement("button", { id: "outside" })
    );
  })
);

function setup(initial: Row | null) {
  const onCommit = vi.fn();
  const renders = { root: 0 };
  let handle: DetailDraftHandle<Row> | null = null;
  let setRow: (row: Row | null) => void = () => undefined;
  function Root() {
    renders.root++;
    const [row, set] = useState<Row | null>(initial);
    setRow = set;
    return createElement(
      "div",
      null,
      createElement(Form, {
        row,
        onCommit,
        ref: (h: DetailDraftHandle<Row> | null) => {
          handle = h;
        },
      }),
      createElement("button", { id: "outside-root" })
    );
  }
  r = renderWithMantine(createElement(Root));
  return { onCommit, renders, handle: () => handle!, setRow: (x: Row | null) => act(() => setRow(x)) };
}

const input = () => r!.host.querySelector("input") as HTMLInputElement;
function type(text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input(), text);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function blurOut() {
  act(() => {
    input().dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
  });
}

describe("useDetailDraft", () => {
  it("입력 중에는 부모(루트)를 다시 그리지 않고 blur 에 한 번 반영한다", () => {
    const s = setup({ id: 1, name: "가" });
    const before = s.renders.root;
    type("가나");
    type("가나다");
    expect(input().value).toBe("가나다");
    expect(s.renders.root).toBe(before);
    expect(s.onCommit).not.toHaveBeenCalled();
    expect(s.handle().isDirty()).toBe(true);
    expect(s.handle().getDraft()).toEqual({ id: 1, name: "가나다" });
    blurOut();
    expect(s.onCommit).toHaveBeenCalledTimes(1);
    expect(s.onCommit).toHaveBeenCalledWith({ id: 1, name: "가나다" }, { id: 1, name: "가" });
    expect(s.handle().isDirty()).toBe(false);
  });

  it("행 전환 때 이전 행 초안을 먼저 반영한 뒤 새 행으로 바꾼다", () => {
    const s = setup({ id: 1, name: "가" });
    type("수정");
    s.setRow({ id: 2, name: "다른 행" });
    expect(s.onCommit).toHaveBeenCalledTimes(1);
    expect(s.onCommit).toHaveBeenCalledWith({ id: 1, name: "수정" }, { id: 1, name: "가" });
    expect(input().value).toBe("다른 행");
    expect(s.handle().isDirty()).toBe(false);
  });

  it("같은 행이 밖에서 새로 와도 고치는 중이면 입력을 지키고, 고치지 않았으면 새 값을 쓴다", () => {
    const s = setup({ id: 1, name: "가" });
    s.setRow({ id: 1, name: "서버값" });
    expect(input().value).toBe("서버값");
    type("내 입력");
    s.setRow({ id: 1, name: "또 서버값" });
    expect(input().value).toBe("내 입력");
    expect(s.onCommit).not.toHaveBeenCalled();
  });

  it("commit() 은 고친 칸이 없으면 부르지 않고, reset 은 반영 없이 초안을 바꾼다", () => {
    const s = setup({ id: 1, name: "가" });
    act(() => s.handle().commit());
    expect(s.onCommit).not.toHaveBeenCalled();
    type("나");
    act(() => s.handle().reset({ id: 1, name: "저장됨" }));
    expect(input().value).toBe("저장됨");
    expect(s.onCommit).not.toHaveBeenCalled();
    expect(s.handle().isDirty()).toBe(false);
  });
});

describe("useBusy", () => {
  it("키별로 진행 상태를 나누고 끝나면 풀린다(실패해도)", async () => {
    let busy: ReturnType<typeof useBusy> | null = null;
    function Probe() {
      busy = useBusy();
      return null;
    }
    r = renderWithMantine(createElement(Probe));
    let release!: () => void;
    let p!: Promise<string>;
    await act(async () => {
      p = busy!.run("list", () => new Promise<string>((res) => (release = () => res("ok"))));
    });
    expect(busy!.isBusy("list")).toBe(true);
    expect(busy!.isBusy("save")).toBe(false);
    expect(busy!.isBusy()).toBe(true);
    await act(async () => {
      release();
      await p;
    });
    expect(busy!.isBusy("list")).toBe(false);
    await act(async () => {
      await expect(busy!.run("save", () => Promise.reject(new Error("x")))).rejects.toThrow("x");
    });
    expect(busy!.isBusy()).toBe(false);
  });
});
