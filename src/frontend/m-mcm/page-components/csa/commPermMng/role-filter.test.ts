/** @vitest-environment happy-dom */
/** z2 F4 — 조회 조건 「역할」 콤보: 입력으로 이름·ID 거르기, 고르면 ROLE_ID, 「전체」 = 빈 값. JSX 없이 createElement 로 쓴다. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { ComboBox } from "@dk-oasis/shared/form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { roleFilterOptions } from "./role-filter";
import { RoleFilterCombo } from "./RoleFilterCombo";
import type { PermRoleLov } from "./types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const ROLES: PermRoleLov[] = [
  { ROLE_ID: "role_MN_MPP_WORK_VIEW", ROLE_NM: "작업 조회" },
  { ROLE_ID: "role_MN_MQC_INSP", ROLE_NM: "검사 담당" },
  { ROLE_ID: "SYSADMIN", ROLE_NM: "시스템 관리자" },
  { ROLE_ID: "role_NO_NAME" },
];

let host: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = null;
  root = null;
});

function render(onChange: (v: string) => void) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(createElement(MantineProvider, null, createElement(ComboBox, { data: roleFilterOptions(ROLES), value: "", onChange, "aria-label": "역할" })));
  });
}

const input = () => host!.querySelector("input") as HTMLInputElement;
const options = () => [...host!.querySelectorAll("[role='option']")].map((o) => o.textContent ?? "");

function type(text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => input().focus());
  act(() => input().click());
  act(() => {
    setter.call(input(), text);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("roleFilterOptions", () => {
  it("맨 앞 「전체」(빈 값), 표시 글 = 「이름 (ID)」, 이름 없으면 ID", () => {
    expect(roleFilterOptions(ROLES)).toEqual([
      { value: "", label: "전체" },
      { value: "role_MN_MPP_WORK_VIEW", label: "작업 조회 (role_MN_MPP_WORK_VIEW)" },
      { value: "role_MN_MQC_INSP", label: "검사 담당 (role_MN_MQC_INSP)" },
      { value: "SYSADMIN", label: "시스템 관리자 (SYSADMIN)" },
      { value: "role_NO_NAME", label: "role_NO_NAME" },
    ]);
  });
});

describe("역할 콤보 — 입력으로 거르고 고른다", () => {
  it("ID 일부로 거르고, 이름 일부로 거르고, 고르면 ROLE_ID 를 넘긴다", () => {
    const onChange = vi.fn();
    render(onChange);

    type("mqc");
    expect(options()).toEqual(["검사 담당 (role_MN_MQC_INSP)"]);

    type("관리자");
    expect(options()).toEqual(["시스템 관리자 (SYSADMIN)"]);

    const opt = host!.querySelector("[role='option']") as HTMLElement;
    act(() => {
      opt.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      opt.click();
    });
    expect(onChange).toHaveBeenLastCalledWith("SYSADMIN", expect.objectContaining({ value: "SYSADMIN" }));
  });
});

describe("역할 콤보 지우기 단추(z2fix2 F4b)", () => {
  const mountCombo = (value: string, onChange: (v: string) => void) => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(createElement(MantineProvider, null, createElement(RoleFilterCombo, { options: roleFilterOptions(ROLES), value, onChange })));
    });
  };
  const clearBtn = () => host!.querySelector("button[aria-label='역할 조건 지우기']") as HTMLButtonElement | null;

  it("값이 있으면 지우기 단추가 보이고, 누르면 빈 값(전체)을 넘긴다", () => {
    const onChange = vi.fn();
    mountCombo("SYSADMIN", onChange);
    expect(clearBtn()).not.toBeNull();
    act(() => clearBtn()!.click());
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("빈 값(전체)이면 지우기 단추가 없다", () => {
    mountCombo("", vi.fn());
    expect(clearBtn()).toBeNull();
  });
});
