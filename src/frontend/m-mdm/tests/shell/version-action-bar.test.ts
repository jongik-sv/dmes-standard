/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { VersionActionBar, type VersionActionBarProps } from "@/shell";

const on = { enabled: true };
function props(over: Partial<VersionActionBarProps> = {}): VersionActionBarProps {
  return {
    ids: { newMajor: "v-major", newMinor: "v-minor", delete: "v-delete", confirm: "v-confirm", lock: "v-lock", unlock: "v-unlock", handover: "v-handover" },
    newVersionMode: "majorMinor", newMajor: on, newMinor: on, delete: on, confirm: on, lock: on, unlock: on, handover: on,
    onNewMajor: vi.fn(), onNewMinor: vi.fn(), onDelete: vi.fn(), onConfirm: vi.fn(), onLock: vi.fn(), onUnlock: vi.fn(), onHandover: vi.fn(),
    deleteMessage: "DRAFT 를 지울까요?", ...over,
  };
}

let host: HTMLDivElement;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});
async function render(p: VersionActionBarProps) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(VersionActionBar, p)));
  });
}
const labels = () => [...host.querySelectorAll("button")].map((b) => b.textContent);

describe("VersionActionBar 확정취소 선택 props(S2-10)", () => {
  it("확정취소 props 를 넘기지 않으면 그 단추를 그리지 않는다(ERD)", async () => {
    await render(props());
    expect(labels()).toEqual(["새 버전(major)", "새 버전(minor)", "삭제", "확정", "선점", "해제", "넘기기(준비 중)"]);
  });

  it("넘기면 지금처럼 확정 바로 뒤에 그리고, 누르면 확인창을 띄운다(기존 화면 6곳)", async () => {
    await render(props({
      ids: { newMajor: "v-major", newMinor: "v-minor", delete: "v-delete", confirm: "v-confirm", cancelConfirm: "v-cancel",
        cancelConfirmWrap: "v-cancel-wrap", lock: "v-lock", unlock: "v-unlock", handover: "v-handover" },
      cancelConfirm: { enabled: true, title: "적용 전에만 취소" }, onCancelConfirm: vi.fn(), cancelConfirmMessage: "확정을 취소할까요?",
    }));
    expect(labels().indexOf("확정취소")).toBe(labels().indexOf("확정") + 1);
    expect(host.querySelector('[data-testid="v-cancel-wrap"]')?.getAttribute("title")).toBe("적용 전에만 취소");
    await act(async () => {
      host.querySelector<HTMLElement>('[data-testid="v-cancel"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("확정을 취소할까요?");
  });
});
