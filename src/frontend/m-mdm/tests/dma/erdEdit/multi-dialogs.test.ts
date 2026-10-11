/** @vitest-environment happy-dom */
// 여러 표 창(UX 1.5) — 다른 다이어그램에 넣기(U61), 같은 컬럼 여러 표에(U63).
import { act, createElement as h } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { previewName } from "../../../pages/dma/erdEdit/api";
import { BulkColumnModal, PlaceIntoDialog } from "../../../pages/dma/erdEdit/canvas/MultiDialogs";
import { typeInto } from "../../dme/helpers/render";
import { menuModel } from "./erd-fixtures";
import { inDoc, installStorage, mount, previewOf, wait, type Mounted } from "./grid-fixtures";

vi.mock("../../../pages/dma/erdEdit/api", () => ({ previewName: vi.fn() }));
const preview = vi.mocked(previewName);

let view: Mounted | null = null;
beforeEach(() => {
  installStorage();
  preview.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  view?.unmount();
  view = null;
});
const tick = (ms: number) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms);
});
const okBtn = (id: string) => inDoc<HTMLButtonElement>(id)!;
async function choose(sel: HTMLSelectElement, value: string) {
  await act(async () => {
    sel.value = value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("다른 다이어그램에 넣기 창(U61)", () => {
  const targets = [{ id: "d-a", label: "기본 / 가", already: 0 }, { id: "d-b", label: "기본 / 나", already: 3 }];

  it("첫 대상을 고른 채 열리고, [넣기] 는 고른 대상 id 로 onSubmit", async () => {
    const onSubmit = vi.fn(async () => null);
    view = await mount(h(PlaceIntoDialog, { open: true, count: 3, targets, onSubmit, onClose: vi.fn() }));
    expect(inDoc<HTMLSelectElement>("erd-place-target")!.value).toBe("d-a");
    expect(inDoc("erd-place-info")?.textContent).toBe("표 3개를 넣습니다.");
    await act(async () => okBtn("erd-place-ok").click());
    expect(onSubmit).toHaveBeenCalledWith("d-a");
  });

  it("placeDialogDisablesWhenAllPresent — 고른 표가 모두 대상에 있으면 [넣기] 꺼짐", async () => {
    view = await mount(h(PlaceIntoDialog, { open: true, count: 3, targets, onSubmit: vi.fn(), onClose: vi.fn() }));
    await choose(inDoc<HTMLSelectElement>("erd-place-target")!, "d-b");
    expect(inDoc("erd-place-info")?.textContent).toBe("고른 표가 모두 그 다이어그램에 이미 있습니다.");
    expect(okBtn("erd-place-ok").disabled).toBe(true);
  });

  it("거절 문구는 창 안에 보이고 창은 남는다", async () => {
    view = await mount(h(PlaceIntoDialog, { open: true, count: 1, targets, onSubmit: vi.fn(async () => "거절됨"), onClose: vi.fn() }));
    await act(async () => okBtn("erd-place-ok").click());
    expect(inDoc("erd-place-error")?.textContent).toBe("거절됨");
  });
});

describe("같은 컬럼 여러 표에 창(U63)", () => {
  async function open(tables: string[], onSubmit = vi.fn(async () => null)) {
    view = await mount(h(BulkColumnModal, { open: true, model: menuModel(), tables, onSubmit, onClose: vi.fn() }));
    await wait(100); // Mantine 초점 가두개 타이머를 먼저 끝낸다
    vi.useFakeTimers();
    return onSubmit;
  }

  it("논리명 → 300ms 뒤 물리명 미리보기, 추천 도메인과 함께 보낸다", async () => {
    preview.mockResolvedValue(previewOf("USE_YN", { recommendedDomainId: 7 }));
    const onSubmit = await open(["t-1", "t-2"]);
    await typeInto(inDoc<HTMLInputElement>("erd-bulkcol-logical")!, "사용여부");
    await tick(300);
    expect(preview).toHaveBeenCalledWith({ logical: "사용여부" });
    expect(inDoc<HTMLInputElement>("erd-bulkcol-phys")!.value).toBe("USE_YN");
    expect(inDoc("erd-bulkcol-targets")?.textContent).toContain("넣을 표 2개");
    await act(async () => okBtn("erd-bulkcol-ok").click());
    expect(onSubmit).toHaveBeenCalledWith({ logical: "사용여부", phys: "USE_YN", domainId: 7 });
  });

  it("같은 물리명이 모두 있으면 [추가] 꺼짐, 하나만 있으면 건너뜀 1", async () => {
    preview.mockResolvedValue(previewOf("OBJECT_ID"));
    await open(["t-1", "t-2"]);
    await typeInto(inDoc<HTMLInputElement>("erd-bulkcol-logical")!, "오브젝트아이디");
    await tick(300);
    expect(inDoc("erd-bulkcol-skip")?.textContent).toContain("건너뜀 2개");
    expect(okBtn("erd-bulkcol-ok").disabled).toBe(true);
    await typeInto(inDoc<HTMLInputElement>("erd-bulkcol-phys")!, "MENU_NM");
    expect(inDoc("erd-bulkcol-skip")?.textContent).toContain("건너뜀 1개");
    expect(okBtn("erd-bulkcol-ok").disabled).toBe(false);
  });

  it("물리명을 직접 고치면 보낼 때 previewName({phys}) 로 추천 도메인을 읽는다", async () => {
    preview.mockResolvedValueOnce(previewOf("USE_YN", { recommendedDomainId: 7 }));
    const onSubmit = await open(["t-1", "t-2"]);
    await typeInto(inDoc<HTMLInputElement>("erd-bulkcol-logical")!, "사용여부");
    await tick(300);
    preview.mockResolvedValueOnce(previewOf("DEL_YN", { recommendedDomainId: 9 }));
    await typeInto(inDoc<HTMLInputElement>("erd-bulkcol-phys")!, "del_yn");
    expect(inDoc<HTMLInputElement>("erd-bulkcol-phys")!.value).toBe("DEL_YN");
    await act(async () => okBtn("erd-bulkcol-ok").click());
    expect(preview).toHaveBeenLastCalledWith({ phys: "DEL_YN" });
    expect(onSubmit).toHaveBeenCalledWith({ logical: "사용여부", phys: "DEL_YN", domainId: 9 });
  });

  it("감사 컬럼 물리명은 막는다", async () => {
    preview.mockResolvedValue(previewOf("C_AT"));
    await open(["t-1", "t-2"]);
    await typeInto(inDoc<HTMLInputElement>("erd-bulkcol-logical")!, "생성일시");
    await tick(300);
    expect(document.body.textContent).toContain("감사 컬럼은 표마다 저절로 붙습니다.");
    expect(okBtn("erd-bulkcol-ok").disabled).toBe(true);
  });

  it("bulkColumnRejectKeepsDialog — 거절 문구는 창 안에", async () => {
    preview.mockResolvedValue(previewOf("USE_YN"));
    await open(["t-1"], vi.fn(async () => "표 TB_MCM_SEC_MENU 에 같은 물리명의 컬럼이 있습니다: USE_YN"));
    await typeInto(inDoc<HTMLInputElement>("erd-bulkcol-logical")!, "사용여부");
    await tick(300);
    await act(async () => okBtn("erd-bulkcol-ok").click());
    expect(inDoc("erd-bulkcol-error")?.textContent).toContain("같은 물리명의 컬럼");
  });
});
