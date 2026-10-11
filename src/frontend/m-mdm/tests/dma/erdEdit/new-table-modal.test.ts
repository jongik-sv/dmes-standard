/** @vitest-environment happy-dom */
// 새 표 창(U40) — 논리명 먼저, 300ms 멈추면 물리명 미리보기, 접두 붙임, 사용자가 고친 물리명 보존, 늦은 응답 버리기(§37).
import { act, createElement as h } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { previewName } from "../../../pages/dma/erdEdit/api";
import { NEWTABLE_UNKNOWN_TEXT, NewTableModal } from "../../../pages/dma/erdEdit/canvas/CanvasDialogs";
import type { ErdModelJson, ErdNamePreview } from "../../../pages/dma/erdEdit/types";
import { typeInto } from "../../dme/helpers/render";
import { mcmModel } from "./erd-canvas-fixtures";
import { emptyModel } from "./erd-fixtures";
import { inDoc, installStorage, key, mount, previewOf, wait, type Mounted } from "./grid-fixtures";

vi.mock("../../../pages/dma/erdEdit/api", () => ({ previewName: vi.fn() }));
const preview = vi.mocked(previewName);

let view: Mounted | null = null;
const onSubmit = vi.fn(async (): Promise<string | null> => null);
const onClose = vi.fn();

beforeEach(() => {
  installStorage();
  preview.mockReset();
  onSubmit.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  view?.unmount();
  view = null;
});

/** 토막이 모두 사전에 있는 미리보기. */
const found = (phys: string): ErdNamePreview => previewOf(phys);
const unknownTokens = (phys: string): ErdNamePreview => {
  const p = previewOf(phys);
  p.tokens = [{ ...p.tokens[0], seq: 1, surface: "ㅋㅋ", status: "UNKNOWN", selected: null, abbr: "", candidates: [] }];
  return p;
};

async function open(model: ErdModelJson = mcmModel()) {
  view = await mount(h(NewTableModal, { open: true, model, onSubmit, onClose }));
  await wait(100); // Mantine 초점 가두개가 타이머로 초점을 옮긴다 — 가짜 시계 전에 끝낸다.
  vi.useFakeTimers();
}
const logicalInput = () => inDoc<HTMLInputElement>("erd-newtable-logical")!;
const physInput = () => inDoc<HTMLInputElement>("erd-newtable-phys")!;
const previewLine = () => inDoc("erd-newtable-preview");
/** 가짜 시계를 ms 만큼 돌리고 풀린 Promise 를 반영한다. */
const tick = (ms: number) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms);
});

describe("새 표 창 — 논리명 먼저(U40)", () => {
  it("칸 순서는 논리명 → 물리명, 논리명에 처음 초점이 간다", async () => {
    await open();
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-testid^="erd-newtable-"]'));
    expect(inputs.map((e) => e.dataset.testid)).toEqual(["erd-newtable-logical", "erd-newtable-phys"]);
    expect(document.activeElement).toBe(logicalInput());
  });

  it("논리명이 300ms 멈추면 previewName({ logical }) 을 부르고 접두를 붙여 물리명 칸을 채운다", async () => {
    preview.mockResolvedValue(found("MENU_AUTH"));
    await open();
    await typeInto(logicalInput(), "메뉴 권한");
    await tick(299);
    expect(preview).not.toHaveBeenCalled();
    await tick(1);
    expect(preview).toHaveBeenCalledTimes(1);
    expect(preview).toHaveBeenCalledWith({ logical: "메뉴 권한" });
    expect(physInput().value).toBe("TB_MCM_MENU_AUTH");
    expect(previewLine()?.textContent).toBe("물리명 미리보기 TB_MCM_MENU_AUTH — 사전 기준, 고칠 수 있습니다");
  });

  it("글자를 계속 치면 디바운스가 밀리고 마지막 글자만 묻는다", async () => {
    preview.mockResolvedValue(found("MENU"));
    await open();
    await typeInto(logicalInput(), "메뉴");
    await tick(200);
    await typeInto(logicalInput(), "메뉴 권");
    await tick(200);
    expect(preview).not.toHaveBeenCalled();
    await tick(100);
    expect(preview).toHaveBeenCalledTimes(1);
    expect(preview).toHaveBeenCalledWith({ logical: "메뉴 권" });
  });

  it("접두가 없는 모델은 접두 없이 채운다", async () => {
    preview.mockResolvedValue(found("MENU_AUTH"));
    await open(emptyModel());
    await typeInto(logicalInput(), "메뉴 권한");
    await tick(300);
    expect(physInput().value).toBe("MENU_AUTH");
  });

  it("사용자가 물리명을 고친 뒤에는 논리명이 바뀌어도 물리명을 덮지 않는다(미리보기 줄은 새로 바뀐다)", async () => {
    preview.mockResolvedValueOnce(found("MENU_AUTH")).mockResolvedValueOnce(found("ROLE"));
    await open();
    await typeInto(logicalInput(), "메뉴 권한");
    await tick(300);
    expect(physInput().value).toBe("TB_MCM_MENU_AUTH");
    await typeInto(physInput(), "tb_mcm_mine");
    expect(physInput().value).toBe("TB_MCM_MINE");
    await typeInto(logicalInput(), "역할");
    await tick(300);
    expect(preview).toHaveBeenCalledTimes(2);
    expect(physInput().value).toBe("TB_MCM_MINE");
    expect(previewLine()?.textContent).toContain("TB_MCM_ROLE");
  });

  it("늦게 온 옛 응답은 버린다(§37)", async () => {
    const pending: Array<(p: ErdNamePreview) => void> = [];
    preview.mockImplementation(() => new Promise<ErdNamePreview>((resolve) => pending.push(resolve)));
    await open();
    await typeInto(logicalInput(), "메뉴");
    await tick(300);
    await typeInto(logicalInput(), "역할");
    await tick(300);
    expect(pending).toHaveLength(2);
    await act(async () => pending[1](found("ROLE")));
    expect(physInput().value).toBe("TB_MCM_ROLE");
    await act(async () => pending[0](found("MENU")));
    expect(physInput().value).toBe("TB_MCM_ROLE");
    expect(previewLine()?.textContent).toContain("TB_MCM_ROLE");
  });

  it("논리명을 지우면 자동으로 채운 물리명도 비우고, 그 뒤 온 응답은 버린다", async () => {
    let late: (p: ErdNamePreview) => void = () => {};
    preview.mockImplementation(() => new Promise<ErdNamePreview>((resolve) => { late = resolve; }));
    await open();
    await typeInto(logicalInput(), "메뉴");
    await tick(300);
    await typeInto(logicalInput(), "");
    await act(async () => late(found("MENU")));
    expect(physInput().value).toBe("");
    expect(previewLine()).toBeNull();
  });

  it("사전에 없는 단어가 있으면 안내를 보이고 물리명 칸은 비워 둔다", async () => {
    preview.mockResolvedValue(unknownTokens("***"));
    await open();
    await typeInto(logicalInput(), "ㅋㅋ");
    await tick(300);
    expect(previewLine()?.textContent).toBe(NEWTABLE_UNKNOWN_TEXT);
    expect(NEWTABLE_UNKNOWN_TEXT).toBe("사전에 없는 단어가 있어 물리명을 직접 넣으세요.");
    expect(physInput().value).toBe("");
    expect(inDoc<HTMLButtonElement>("erd-newtable-ok")!.disabled).toBe(true);
  });

  it("물리명에 *** 표식이 있으면 토막 상태가 일치여도 안내한다", async () => {
    preview.mockResolvedValue(found("MENU_***"));
    await open();
    await typeInto(logicalInput(), "메뉴 ㅋㅋ");
    await tick(300);
    expect(previewLine()?.textContent).toBe(NEWTABLE_UNKNOWN_TEXT);
    expect(physInput().value).toBe("");
  });

  it("논리명에서 Enter — 물리명이 맞으면 onSubmit(물리명, 논리명), 비었으면 보내지 않는다", async () => {
    preview.mockResolvedValue(found("MENU_AUTH"));
    await open();
    await key(logicalInput(), { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    await typeInto(logicalInput(), " 메뉴 권한 ");
    await tick(300);
    await key(logicalInput(), { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("TB_MCM_MENU_AUTH", "메뉴 권한");
  });

  it("논리명을 더 친 뒤 새 미리보기가 오기 전에는 앞 물리명으로 만들지 않는다 — Enter·[만들기] 모두 막고, 응답이 오면 새 물리명으로 보낸다", async () => {
    preview.mockResolvedValueOnce(found("MENU")).mockResolvedValueOnce(found("MENU_AUTH"));
    await open();
    await typeInto(logicalInput(), "메뉴");
    await tick(300);
    expect(physInput().value).toBe("TB_MCM_MENU");
    expect(inDoc<HTMLButtonElement>("erd-newtable-ok")!.disabled).toBe(false);
    await typeInto(logicalInput(), "메뉴 권한");
    // 디바운스 대기 중 — 칸에는 앞 값이 남아 있어도 보내지 않는다
    expect(physInput().value).toBe("TB_MCM_MENU");
    expect(inDoc<HTMLButtonElement>("erd-newtable-ok")!.disabled).toBe(true);
    await key(logicalInput(), { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    await tick(299);
    await key(logicalInput(), { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    await tick(1);
    expect(physInput().value).toBe("TB_MCM_MENU_AUTH");
    expect(inDoc<HTMLButtonElement>("erd-newtable-ok")!.disabled).toBe(false);
    await key(logicalInput(), { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("TB_MCM_MENU_AUTH", "메뉴 권한");
  });

  it("물리명을 직접 고쳤으면 논리명이 바뀐 직후에도 막지 않는다", async () => {
    preview.mockResolvedValue(found("MENU"));
    await open();
    await typeInto(logicalInput(), "메뉴");
    await tick(300);
    await typeInto(physInput(), "tb_mcm_mine");
    await typeInto(logicalInput(), "메뉴 권한");
    await key(logicalInput(), { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("TB_MCM_MINE", "메뉴 권한");
  });

  it("글자를 쳐도 부모(화면 루트 쪽)는 다시 그려지지 않는다", async () => {
    preview.mockResolvedValue(found("MENU_AUTH"));
    let parentRenders = 0;
    const model = mcmModel();
    const Parent = () => {
      parentRenders += 1;
      return h(NewTableModal, { open: true, model, onSubmit, onClose });
    };
    view = await mount(h(Parent));
    await wait(100);
    vi.useFakeTimers();
    const before = parentRenders;
    await typeInto(logicalInput(), "메뉴 권한");
    await tick(300);
    await typeInto(physInput(), "TB_MCM_X");
    expect(parentRenders).toBe(before);
  });
});
