/** @vitest-environment happy-dom */

// 공통 ID 고르기(IdPicker) — 룰·세트·마루 코드·마루 데이터 고르기가 함께 쓴다. Enter 로 찾고 ↑↓·Enter 로 고르며,
// 글자를 바꾼 뒤 늦게 온 옛 검색 결과는 목록을 다시 열지 않는다(Local-Rules §11·§15). 화면 거르기(filterIdPicks)는
// 서버 검색이 없는 마루 데이터 고르기가 쓴다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { IdPicker, filterIdPicks, type IdPickRow } from "@/shell";

let container: HTMLDivElement;
let root: Root | null = null;

const ROWS: IdPickRow[] = [
  { id: "PORT", name: "항구", status: "INUSE" },
  { id: "CUST", name: "거래처", external: true, status: "DEPRECATED" },
];

async function flush() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function render(props: Partial<Parameters<typeof IdPicker>[0]> & Pick<Parameters<typeof IdPicker>[0], "search">) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const onPick = props.onPick ?? vi.fn();
  const onError = props.onError ?? vi.fn();
  await act(async () => {
    root!.render(
      createElement(
        DmesUiProvider,
        null,
        createElement(IdPicker, { placeholder: "ID·이름", noun: "세트", testId: "t-pick", limit: 2, onPick, onError, ...props }),
      ),
    );
  });
  return { onPick, onError };
}

const input = () => container.querySelector('[data-testid="t-pick-keyword"]') as HTMLInputElement;
const list = () => container.querySelector('[data-testid="t-pick-list"]');

async function key(k: string) {
  await act(async () => {
    input().dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  });
  await flush();
}

async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
  await flush();
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
});

describe("IdPicker", () => {
  it("currentId 를 주면 처음부터 칸에 채우고, 다른 ID 로 바뀌면 그 ID 로 바꾼다(링크로 열린 화면)", async () => {
    const search = vi.fn(async () => ROWS);
    await render({ search, currentId: "PORT" });
    expect(input().value).toBe("PORT");
    const rerender = async (currentId: string | null) => {
      await act(async () => {
        root!.render(
          createElement(
            DmesUiProvider,
            null,
            createElement(IdPicker, { placeholder: "ID·이름", noun: "세트", testId: "t-pick", limit: 2, onPick: vi.fn(), onError: vi.fn(), search, currentId }),
          ),
        );
      });
      await flush();
    };
    await type("CU");
    await rerender("PORT");
    expect(input().value).toBe("CU"); // 같은 ID 인 동안은 친 글자를 덮지 않는다
    await rerender("CUST");
    expect(input().value).toBe("CUST");
    await rerender(null);
    expect(input().value).toBe("CUST"); // 닫혀도 칸은 비우지 않는다
    expect(search).not.toHaveBeenCalled();
  });

  it("Enter 로 찾아 ID·이름·외부·상태 배지를 보이고, 건수가 차면 좁혀 검색하라고 안내한다", async () => {
    const search = vi.fn(async () => ROWS);
    await render({ search });
    await type("  P ");
    await key("Enter");
    expect(search).toHaveBeenCalledWith("P");
    const text = list()?.textContent ?? "";
    expect(text).toContain("PORT");
    expect(text).toContain("거래처 · 외부");
    expect(text).toContain("사용 중");
    expect(text).toContain("폐기");
    expect(text).toContain("2건까지 보입니다. 더 좁혀 검색하세요.");
  });

  it("↓ 로 옮기고 Enter 로 그 줄을 고르면 목록을 닫는다", async () => {
    const { onPick } = await render({ search: async () => ROWS });
    await key("Enter");
    await key("ArrowDown");
    await key("Enter");
    expect(onPick).toHaveBeenCalledWith("CUST");
    expect(list()).toBeNull();
  });

  it("찾은 것이 없으면 받침에 맞는 조사로 안내한다", async () => {
    await render({ search: async () => [] });
    await key("Enter");
    expect(list()?.textContent).toBe("찾은 세트가 없습니다.");
  });

  it("글자를 바꾼 뒤 늦게 온 옛 검색 결과는 목록을 다시 열지 않는다", async () => {
    let release!: (rows: IdPickRow[]) => void;
    const search = vi.fn(() => new Promise<IdPickRow[]>((r) => (release = r)));
    await render({ search });
    await key("Enter");
    await type("C");
    await act(async () => {
      release(ROWS);
    });
    await flush();
    expect(list()).toBeNull();
  });

  it("[찾기] 뒤에 화면 인계로 연 ID 가 바뀌어도(사용자 조작 없음) 늦게 온 찾기 결과를 보인다", async () => {
    let release!: (rows: IdPickRow[]) => void;
    const search = vi.fn(() => new Promise<IdPickRow[]>((r) => (release = r)));
    await render({ search });
    await type("PORT");
    await key("Enter");
    await act(async () => {
      root!.render(
        createElement(
          DmesUiProvider,
          null,
          createElement(IdPicker, { placeholder: "ID·이름", noun: "세트", testId: "t-pick", limit: 2, onPick: vi.fn(), onError: vi.fn(), search, currentId: "PORT" }),
        ),
      );
    });
    await flush();
    await act(async () => {
      release(ROWS);
    });
    await flush();
    expect(list()?.textContent ?? "").toContain("PORT");
  });

  it("[찾기] 뒤 응답 전에 바깥을 누르면(사용자가 다른 일로 옮김) 늦게 온 결과가 목록을 열지 않는다", async () => {
    let release!: (rows: IdPickRow[]) => void;
    const search = vi.fn(() => new Promise<IdPickRow[]>((r) => (release = r)));
    await render({ search });
    await key("Enter");
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await act(async () => {
      release(ROWS);
    });
    await flush();
    expect(list()).toBeNull();
  });

  it("검색 실패는 onError 로 문구를 넘긴다", async () => {
    const { onError } = await render({
      search: async () => {
        throw new Error("요청이 거부되었습니다.");
      },
    });
    await key("Enter");
    expect(onError).toHaveBeenCalledWith("요청이 거부되었습니다.");
  });
});

describe("filterIdPicks", () => {
  it("ID·이름 부분 일치(대소문자 무시)로 거르고 앞에서 limit 건만 준다", () => {
    expect(filterIdPicks(ROWS, "ust", 20).map((r) => r.id)).toEqual(["CUST"]);
    expect(filterIdPicks(ROWS, "항", 20).map((r) => r.id)).toEqual(["PORT"]);
    expect(filterIdPicks(ROWS, " ", 1).map((r) => r.id)).toEqual(["PORT"]);
  });
});
