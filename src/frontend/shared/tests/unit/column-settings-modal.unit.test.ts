/** @vitest-environment happy-dom */
/**
 * ColumnSettingsModal 단독 시험(C3) — 그리드를 모르는 제어형 창.
 * 내부 컬럼 숨김, 잠긴 컬럼, 순서 이동(고정 구역 경계), 적용 상태(colId·hide·순서·너비 없음·내부 컬럼 제자리), 모두 숨김 방지, 복원·취소.
 */
import { act, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ColumnSettingsModal,
  type ColumnSettingsColumn,
  type ColumnSettingsModalProps,
} from "../../src/components/grid/ColumnSettingsModal";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

const COLS: ColumnSettingsColumn[] = [
  { colId: "__select", header: "", hide: false, locked: true, internal: true },
  { colId: "code", header: "코드", hide: false, locked: true },
  { colId: "name", header: "이름", hide: false },
  { colId: "secret", header: "내부", hide: true, internal: true },
  { colId: "qty", header: "수량", hide: true },
  { colId: "note", header: "비고", hide: false },
];

let r: Rendered | null = null;

function show(props: Partial<ModalPropsLoose> = {}) {
  const onApply = vi.fn();
  const onReset = vi.fn();
  const onClose = vi.fn();
  const el = createElement(ColumnSettingsModal, { opened: true, columns: COLS, onApply, onReset, onClose, ...props } as ColumnSettingsModalProps);
  if (r) rerender(r, el);
  else r = renderWithMantine(el);
  return { onApply, onReset, onClose };
}
type ModalPropsLoose = ColumnSettingsModalProps;

afterEach(() => {
  r?.unmount();
  r = null;
});

const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="column-settings-${id}"]`);
const btn = (id: string) => q(id) as HTMLButtonElement;
const click = (el: HTMLElement | null) => act(() => void el!.click());
const rowIds = () =>
  Array.from(document.querySelectorAll('[data-testid^="column-settings-row-"]')).map((e) =>
    e.getAttribute("data-testid")!.replace("column-settings-row-", ""),
  );
const checkbox = (colId: string) => q(`check-${colId}`)!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;

describe("ColumnSettingsModal — 표시", () => {
  it("닫혀 있으면 아무것도 그리지 않는다", () => {
    show({ opened: false });
    expect(document.querySelector('[data-testid="column-settings"]')).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("내부 컬럼은 보이지 않고 나머지를 지금 순서로 한 줄씩 보인다", () => {
    show();
    expect(rowIds()).toEqual(["code", "name", "qty", "note"]);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("표시 체크는 숨김의 반대이고, 잠긴 컬럼은 체크가 켜져 비활성이며 이유 툴팁이 있다", () => {
    show();
    expect(checkbox("name").checked).toBe(true);
    expect(checkbox("qty").checked).toBe(false);
    expect(checkbox("code").checked).toBe(true);
    expect(checkbox("code").disabled).toBe(true);
    expect(q("check-code")!.getAttribute("title")).toBe("숨길 수 없는 컬럼");
    expect(q("check-name")!.getAttribute("title")).toBeNull();
  });
});

describe("ColumnSettingsModal — 순서 이동", () => {
  it("위로·아래로 단추가 줄을 옮기고 맨 위·맨 아래에서는 비활성이다", () => {
    show();
    expect(btn("up-code").disabled).toBe(true);
    expect(btn("down-note").disabled).toBe(true);
    click(q("down-code"));
    expect(rowIds()).toEqual(["name", "code", "qty", "note"]);
    click(q("up-note"));
    expect(rowIds()).toEqual(["name", "code", "note", "qty"]);
  });

  it("잠긴 컬럼도 순서는 옮길 수 있다", () => {
    show();
    expect(btn("down-code").disabled).toBe(false);
  });

  it("고정 컬럼은 같은 구역 안에서만 옮긴다 — 구역별로 모아 보이고 경계에서 단추가 비활성이다", () => {
    show({
      columns: [
        { colId: "a", header: "A", hide: false },
        { colId: "l1", header: "L1", hide: false, pinned: "left" },
        { colId: "b", header: "B", hide: false },
        { colId: "l2", header: "L2", hide: false, pinned: "left" },
        { colId: "r1", header: "R1", hide: false, pinned: "right" },
      ],
    });
    // 왼쪽 고정 → 일반 → 오른쪽 고정, 구역 안 순서는 그리드 순서
    expect(rowIds()).toEqual(["l1", "l2", "a", "b", "r1"]);
    expect(q("zone-left")!.textContent).toBe("왼쪽 고정");
    expect(q("zone-center")!.textContent).toBe("일반");
    expect(q("zone-right")!.textContent).toBe("오른쪽 고정");
    // 경계: 왼쪽 고정의 끝은 아래로, 일반의 첫째는 위로, 일반의 끝은 아래로 못 간다
    expect(btn("down-l2").disabled).toBe(true);
    expect(btn("up-a").disabled).toBe(true);
    expect(btn("down-b").disabled).toBe(true);
    expect(btn("up-r1").disabled).toBe(true);
    click(q("down-l1"));
    expect(rowIds()).toEqual(["l2", "l1", "a", "b", "r1"]);
  });

  it("옮긴 뒤 같은 방향 단추에 초점이 남는다(키보드로 이어서 옮긴다)", () => {
    show();
    const down = btn("down-code");
    down.focus();
    click(down);
    expect((document.activeElement as HTMLElement | null)?.getAttribute("data-testid")).toBe("column-settings-down-code");
  });
});

describe("ColumnSettingsModal — 적용·복원·취소", () => {
  it("적용 — 모든 컬럼을 colId·hide 만으로 넘긴다(너비 없음). 내부 컬럼은 원래 자리·값 그대로이고 창은 닫힌다", () => {
    const { onApply, onClose } = show();
    click(q("check-name")!.querySelector("input"));
    click(q("down-code"));
    click(btn("apply"));
    expect(onApply).toHaveBeenCalledTimes(1);
    const state = onApply.mock.calls[0][0] as Array<Record<string, unknown>>;
    // 보이는 순서가 name, code, qty, note 로 바뀌고 내부 컬럼 __select(맨 앞)·secret(name 뒤)은 제자리
    expect(state).toEqual([
      { colId: "__select", hide: false },
      { colId: "name", hide: true },
      { colId: "code", hide: false },
      { colId: "secret", hide: true },
      { colId: "qty", hide: true },
      { colId: "note", hide: false },
    ]);
    for (const s of state) expect(Object.keys(s).sort()).toEqual(["colId", "hide"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("잠긴 컬럼은 체크를 눌러도 숨겨지지 않는다", () => {
    const { onApply } = show();
    click(checkbox("code"));
    click(btn("apply"));
    const state = onApply.mock.calls[0][0] as Array<{ colId: string; hide: boolean }>;
    expect(state.find((s) => s.colId === "code")!.hide).toBe(false);
  });

  it("보이는 컬럼이 하나도 없게는 못 한다 — 적용 비활성", () => {
    const { onApply } = show({
      columns: [
        { colId: "a", header: "A", hide: false },
        { colId: "b", header: "B", hide: false },
        { colId: "x", header: "X", hide: false, internal: true },
      ],
    });
    expect(btn("apply").disabled).toBe(false);
    click(checkbox("a"));
    expect(btn("apply").disabled).toBe(false);
    click(checkbox("b"));
    expect(btn("apply").disabled).toBe(true);
    click(btn("apply"));
    expect(onApply).not.toHaveBeenCalled();
    click(checkbox("b"));
    expect(btn("apply").disabled).toBe(false);
  });

  it("숨길 수 없는 컬럼이 있으면 나머지를 모두 숨겨도 적용된다", () => {
    show();
    click(checkbox("name"));
    click(checkbox("note"));
    expect(btn("apply").disabled).toBe(false);
  });

  it("기본값 복원 — onReset 을 부르고 닫는다(적용은 부르지 않는다)", () => {
    const { onApply, onReset, onClose } = show();
    click(btn("reset"));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("취소 — 닫기만 한다", () => {
    const { onApply, onReset, onClose } = show();
    click(q("check-name")!.querySelector("input"));
    click(btn("cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
    expect(onReset).not.toHaveBeenCalled();
  });

  it("다시 열면 새 columns 로 처음부터 시작한다", () => {
    show();
    click(q("check-name")!.querySelector("input"));
    expect(checkbox("name").checked).toBe(false);
    show({ opened: false });
    show({ opened: true });
    expect(checkbox("name").checked).toBe(true);
  });
});
