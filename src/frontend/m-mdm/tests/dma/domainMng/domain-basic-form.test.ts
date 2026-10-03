/** @vitest-environment happy-dom */

// 편집 폼 「부모 도메인」 — 검색형 칸. 참고: 화면에서 부모 칸이 열리는 건 신규 모드뿐이고 거기엔 selfId 가 없어 자기·하위 제외는 실제로
// 거를 것이 없다(방어용 규칙). 아래 selfId 가 있는 시험은 규칙이 칸에 연결됐는지만 본다. 이름 입력으로 부모가 정해지고, 자기·하위는 막히며, 비우면 해제되고, 읽기 전용이면 잠긴다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { DomainBasicForm } from "../../../pages/dma/domainMng/components/DomainBasicForm";
import { parentCandidates } from "../../../pages/dma/domainMng/domain-tree";
import { makeParentSearch } from "../../../pages/dma/domainMng/parent-search";
import type { DomainRow } from "../../../pages/dma/domainMng/types";

function row(id: number, parent: number | null, name: string, extra: Partial<DomainRow> = {}): DomainRow {
  return {
    DOMAIN_ID: id, PARENT_DOMAIN_ID: parent, DEPTH: 0, DOMAIN_NAME: name, STD_NAME: `D${id}`, DOMAIN_KIND: "QTY",
    DATA_TYPE: "NUMBER", LENGTH: null, SCALE: null, UNIT_CODE: null, MARU_CODE_ID: null, CATE_ID: null, STD_RULE: null,
    BIZ_RULE: null, VER: 0, EFF_LENGTH: null, EFF_SCALE: null, EFF_UNIT_CODE: null, EFF_MARU_CODE_ID: null, EFF_CATE_ID: null,
    EFF_STD_EXPR: null, EFF_STD_AST: null, EFF_BIZ_EXPR: null, BIZ_REQUIRED_VARS: [], HAS_BIZ: false, CHILD_COUNT: 0,
    MATCHED: true, ...extra,
  };
}

const TREE = [row(1, null, "중량"), row(2, 1, "코일 중량"), row(3, 2, "GROSS 중량"), row(4, null, "두께")];
const FIELD = "[data-testid='domain-parent']";

let container: HTMLDivElement;
let root: Root | null = null;
let fetched: string[];

/** 서버 검색 흉내 — 부분 일치만 MATCHED, 맞은 행의 조상은 MATCHED=false 로 함께 준다. */
async function fakeFetch(keyword: string): Promise<DomainRow[]> {
  fetched.push(keyword);
  const hit = new Set(TREE.filter((r) => keyword === "" || r.DOMAIN_NAME.includes(keyword)).map((r) => r.DOMAIN_ID));
  const keep = new Set(hit);
  for (const id of hit) for (let p = TREE.find((r) => r.DOMAIN_ID === id)!.PARENT_DOMAIN_ID; p !== null; p = TREE.find((r) => r.DOMAIN_ID === p)!.PARENT_DOMAIN_ID) keep.add(p);
  return TREE.filter((r) => keep.has(r.DOMAIN_ID)).map((r) => ({ ...r, MATCHED: hit.has(r.DOMAIN_ID) }));
}

async function render(selfId: number | null, parentId: number | null, onChange = vi.fn(), readOnly = false) {
  const search = makeParentSearch(fakeFetch, (found) => parentCandidates(found, selfId));
  const draft = { parentDomainId: parentId, domainName: "x", stdName: "X" } as never;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(DomainBasicForm, {
      draft, structureLocked: false, parentLocked: false, readOnly, parentSearch: search,
      parentRow: TREE.find((r) => r.DOMAIN_ID === parentId) ?? null, examplesText: "", onChange, onExamplesChange: () => {},
    })));
  });
  return onChange;
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

async function typeAndEnter(text: string) {
  const input = document.querySelector<HTMLInputElement>(FIELD)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await settle();
}

describe("DomainBasicForm 부모 도메인 검색형 칸", () => {
  beforeEach(() => {
    fetched = [];
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    vi.unstubAllGlobals();
  });

  it("이름을 넣고 Enter 하면 그 도메인이 부모로 정해진다 — 그려질 때는 서버를 부르지 않는다", async () => {
    const onChange = await render(null, null);
    expect(fetched).toEqual([]);
    await typeAndEnter("두께");
    expect(onChange).toHaveBeenCalledWith({ parentDomainId: 4 });
  });

  it("지금 부모 이름이 칸에 보인다", async () => {
    await render(3, 1);
    expect(document.querySelector<HTMLInputElement>(FIELD)!.value).toBe("중량");
  });

  it("(방어용 — 신규 모드에선 selfId 가 없다) 자기 자신·하위 도메인은 이름을 정확히 넣어도 정해지지 않고 팝업이 열리되 목록에 없다", async () => {
    const onChange = await render(2, null);
    for (const name of ["코일 중량", "GROSS 중량"]) {
      await typeAndEnter(name);
      expect(onChange, name).not.toHaveBeenCalled();
      const box = document.querySelector("[data-testid='domain-parent-box']");
      expect(box, `${name} 팝업`).not.toBeNull();
      expect(box!.querySelectorAll("li")).toHaveLength(0);
      expect(box!.textContent).toContain("검색 결과가 없습니다");
      await act(async () => {
        Array.from(box!.querySelectorAll("button")).find((b) => b.textContent === "닫기")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }
  });

  it("자기 하위가 아닌 같은 이름 계열(중량)은 후보에 남는다 — 조상 행은 MATCHED 가 아니면 나오지 않는다", async () => {
    // "중량" 은 1·2·3 에 모두 맞는다. 자기가 2 면 2·3 이 빠져 1 하나만 남아 바로 정해진다.
    const onChange = await render(2, null);
    await typeAndEnter("중량");
    expect(onChange).toHaveBeenCalledWith({ parentDomainId: 1 });
  });

  it("칸을 비우면 부모가 해제된다", async () => {
    const onChange = await render(3, 1);
    await typeAndEnter("");
    expect(onChange).toHaveBeenCalledWith({ parentDomainId: null });
  });

  it("읽기 전용이면 입력 칸과 찾기가 잠긴다", async () => {
    await render(3, 1, vi.fn(), true);
    expect(document.querySelector<HTMLInputElement>(FIELD)!.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>("[data-testid='domain-parent-find']")!.disabled).toBe(true);
  });
});
