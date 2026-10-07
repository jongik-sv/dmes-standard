/** @vitest-environment happy-dom */
/**
 * 조회 칸 사용자 기본값 — SearchArea 넣기 흐름(설계 2026-10-07-search-defaults-design §6).
 *  - 마운트 때 규칙 값을 넣고 autoSearch 는 넣은 값으로 정확히 한 번 조회한다(emitSearch 없음).
 *  - 이어받은 값(분리 창)·대화 상자·defaults=false 는 넣지 않는다. 화면 effect 가 정한 값(handoff)을 덮지 않는다.
 *  - 저장소가 늦으면 기다렸다 넣되 사용자가 고친 칸은 덮지 않고, 한도를 넘으면 포기한다.
 *  - 초기화 버튼은 사용자 기본값을 다시 넣고(마지막 조회값 칸 제외), 조회는 마지막 조회값을 적는다.
 */
import { StrictMode, act, createElement, useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PageLayout } from "../../src/layout/PageLayout";
import { SearchArea, type SearchAreaProps } from "../../src/layout/SearchArea";
import { SearchField } from "../../src/layout/SearchField";
import { emitSearch } from "../../src/layout/search-history-bus";
import { SEARCH_DEFAULTS_WAIT_MS } from "../../src/layout/search-defaults/area";
import { useState } from "react";
import { readSearchLastValues } from "../../src/layout/search-defaults/last-values";
import type { SearchDefaultRule } from "../../src/layout/search-defaults/rule";
import {
  resetSearchDefaultsStore,
  setSearchDefaultsLocalForDev,
  setSearchDefaultsTransportForTest,
  type PageRules,
} from "../../src/layout/search-defaults/store";
import { CarryStateProvider, createCarryRegistry, useCarryState } from "../../src/portal-shell/carry-state";
import { TabPageContext } from "../../src/portal-shell/tab-page-context";
import { installMemoryLocalStorage } from "./grid-personalize-test-env";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

const PAGE = "mcm:cmz/searchDefaultsSample";
const USER = "u1";

let rendered: Rendered | null = null;

function setUser(id: string | null) {
  (globalThis as Record<string, unknown>).__dkOasisCurrentUserStore__ = {
    user: id ? { id, name: null } : null,
    inflight: null,
    generation: 0,
    listeners: new Set(),
  };
}

/** 서버 search 응답(행 목록). */
function serverRows(rules: Record<string, PageRules>) {
  const rows = Object.entries(rules).flatMap(([pageId, page]) =>
    Object.entries(page).map(([fieldKey, rule]) => ({ pageId, fieldKey, ruleJson: JSON.stringify(rule) })),
  );
  return { meta: { success: true }, data: { result: { rows } } };
}

/** 거울에 규칙을 넣고 서버도 같은 값을 돌려주게 한다(바로 ready). */
function givenRules(page: PageRules) {
  setSearchDefaultsLocalForDev(USER, PAGE, page);
  setSearchDefaultsTransportForTest(async () => serverRows({ [PAGE]: page }));
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

interface Filters {
  item: string;
  status: string;
  from: string;
  to: string;
  memo: string;
}
const DEFAULT: Filters = { item: "", status: "", from: "", to: "", memo: "" };

/** 기록: 조회 호출 때의 조건. */
let searches: Filters[] = [];
/** 마지막 렌더의 조건. */
let latest: Filters = DEFAULT;

function Screen(props: {
  area?: Partial<SearchAreaProps>;
  /** 지난 상태를 복사하는 onChange(경고 시험용). */
  stale?: boolean;
  /** 마운트 effect 가 품번을 비운다(handoff 흉내). */
  handoffClear?: boolean;
  extra?: (f: Filters, set: (k: keyof Filters, v: string) => void) => ReactNode;
  withReset?: boolean;
}) {
  const [f, setF] = useCarryState<Filters>("filters", DEFAULT);
  latest = f;
  const set = (k: keyof Filters, v: string) =>
    props.stale ? setF({ ...f, [k]: v }) : setF((p) => ({ ...p, [k]: v }));
  useEffect(() => {
    if (props.handoffClear) setF((p) => ({ ...p, item: "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const area = createElement(
    SearchArea,
    { onSearch: () => searches.push(f), ...props.area },
    createElement(SearchField, { label: "품번", name: "itemCd", value: f.item, onChange: (v: string) => set("item", v) }),
    createElement(SearchField, {
      label: "상태",
      name: "status",
      type: "select",
      value: f.status,
      onChange: (v: string) => set("status", v),
      options: [
        { value: "", label: "전체" },
        { value: "Y", label: "사용" },
        { value: "N", label: "미사용" },
      ],
    }),
    createElement(SearchField, { label: "조회 기간", name: "fromDt", type: "date", value: f.from, onChange: (v: string) => set("from", v) }),
    createElement(SearchField, { label: "~", type: "date", value: f.to, onChange: (v: string) => set("to", v) }),
    createElement(SearchField, { label: "메모", value: f.memo, onChange: (v: string) => set("memo", v) }),
    props.extra?.(f, set),
  );
  if (!props.withReset) return area;
  return createElement(
    PageLayout,
    {
      title: "샘플",
      buttons: [{ id: "btn_reset", label: "초기화", onClick: () => setF(DEFAULT) }],
    },
    area,
  );
}

function inPage(node: ReactNode, carry?: ReturnType<typeof createCarryRegistry>) {
  const page = createElement(TabPageContext.Provider, { value: { pageId: PAGE, serviceId: "" } }, node);
  return carry ? createElement(CarryStateProvider, { registry: carry }, page) : page;
}

async function mount(node: ReactNode) {
  rendered = renderWithMantine(node as React.ReactElement);
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  installMemoryLocalStorage();
  resetSearchDefaultsStore();
  setSearchDefaultsTransportForTest(async () => serverRows({}));
  setUser(USER);
  searches = [];
  latest = DEFAULT;
});

afterEach(() => {
  rendered?.unmount();
  rendered = null;
  setSearchDefaultsTransportForTest();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const rules = (r: Record<string, SearchDefaultRule>) => r as PageRules;

describe("마운트 때 넣기 + autoSearch", () => {
  it("규칙 값을 넣고, 넣은 값으로 한 번 조회한다(기간 To 키는 {From}~to)", async () => {
    givenRules(
      rules({
        itemCd: { kind: "fixed", value: "P-100" },
        status: { kind: "fixed", value: "Y" },
        fromDt: { kind: "relative", base: "today", days: -6 },
        "fromDt~to": { kind: "relative", base: "today" },
      }),
    );
    const warn = vi.spyOn(console, "warn");
    await mount(inPage(createElement(Screen, { area: { autoSearch: true } })));
    expect(warn).not.toHaveBeenCalled();
    expect(latest.item).toBe("P-100");
    expect(latest.status).toBe("Y");
    expect(latest.to).toBe(today());
    expect(latest.from < latest.to).toBe(true);
    expect(searches).toHaveLength(1);
    expect(searches[0]).toEqual(latest);
  });

  it("StrictMode(effect 두 번 실행)에서도 넣은 값으로 한 번만 조회한다", async () => {
    givenRules(rules({ itemCd: { kind: "fixed", value: "S1" } }));
    await mount(createElement(StrictMode, null, inPage(createElement(Screen, { area: { autoSearch: true } }))));
    expect(latest.item).toBe("S1");
    expect(searches).toHaveLength(1);
    expect(searches[0].item).toBe("S1");
  });

  it("규칙이 없으면 코드 기본값으로 한 번 조회한다", async () => {
    await mount(inPage(createElement(Screen, { area: { autoSearch: true } })));
    expect(searches).toEqual([DEFAULT]);
  });

  it("autoSearch 가 없으면 조회하지 않는다", async () => {
    givenRules(rules({ itemCd: { kind: "fixed", value: "A" } }));
    await mount(inPage(createElement(Screen)));
    expect(latest.item).toBe("A");
    expect(searches).toHaveLength(0);
  });

  it("autoSearch 조회는 마지막 조회값으로 적지 않는다(emitSearch 없음)", async () => {
    givenRules(rules({ itemCd: { kind: "fixed", value: "A" } }));
    await mount(inPage(createElement(Screen, { area: { autoSearch: true } })));
    expect(readSearchLastValues(USER, PAGE)).toEqual({});
  });

  it("선택지에 없는 고정 값·From 이 To 보다 늦은 기간은 넣지 않는다", async () => {
    givenRules(
      rules({
        status: { kind: "fixed", value: "Z" },
        fromDt: { kind: "relative", base: "today", days: 1 },
        "fromDt~to": { kind: "relative", base: "today" },
      }),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await mount(inPage(createElement(Screen)));
    expect(latest.status).toBe("");
    expect(latest.from).toBe("");
    expect(latest.to).toBe("");
  });

  it("키 없는 칸(메모)은 대상이 아니고, defaultKey 를 주면 대상이다", async () => {
    givenRules(rules({ memo: { kind: "fixed", value: "M" }, note: { kind: "fixed", value: "N" } }));
    let note = "";
    await mount(
      inPage(
        createElement(Screen, {
          extra: () =>
            createElement(SearchField, {
              label: "비고",
              defaultKey: "note",
              value: note,
              onChange: (v: string) => {
                note = v;
              },
            }),
        }),
      ),
    );
    expect(latest.memo).toBe("");
    expect(note).toBe("N");
  });

  it("children 칸은 SearchField 에 value·onChange 를 함께 줄 때만 대상이다", async () => {
    givenRules(rules({ bound: { kind: "fixed", value: "B" }, unbound: { kind: "fixed", value: "U" } }));
    let bound = "";
    await mount(
      inPage(
        createElement(Screen, {
          extra: () => [
            createElement(
              SearchField,
              {
                key: "b",
                label: "묶음",
                name: "bound",
                value: bound,
                onChange: (v: string) => {
                  bound = v;
                },
              },
              createElement("input", { readOnly: true, value: bound }),
            ),
            createElement(SearchField, { key: "u", label: "안 묶음", name: "unbound" }, createElement("input", { readOnly: true })),
          ],
        }),
      ),
    );
    expect(bound).toBe("B");
  });

  it("defaultable=false 칸은 넣지 않는다", async () => {
    givenRules(rules({ itemCd: { kind: "fixed", value: "A" } }));
    function NoDefault() {
      const [v, setV] = useCarryState("v", "");
      latest = { ...DEFAULT, item: v };
      return createElement(
        SearchArea,
        { onSearch: () => {} },
        createElement(SearchField, { label: "품번", name: "itemCd", defaultable: false, value: v, onChange: setV }),
      );
    }
    await mount(inPage(createElement(NoDefault)));
    expect(latest.item).toBe("");
  });
});

describe("넣지 않는 경우", () => {
  it("분리 창이 이어받은 값으로 시작하면 넣지도 조회하지도 않는다", async () => {
    givenRules(rules({ itemCd: { kind: "fixed", value: "A" } }));
    const carry = createCarryRegistry({ light: { filters: { ...DEFAULT, item: "carried" } }, bulky: null, hadBulky: false });
    await mount(inPage(createElement(Screen, { area: { autoSearch: true } }), carry));
    expect(latest.item).toBe("carried");
    expect(searches).toHaveLength(0);
  });

  it("defaults=false 면 넣지 않지만 autoSearch 는 한다", async () => {
    givenRules(rules({ itemCd: { kind: "fixed", value: "A" } }));
    await mount(inPage(createElement(Screen, { area: { autoSearch: true, defaults: false } })));
    expect(latest.item).toBe("");
    expect(searches).toEqual([DEFAULT]);
  });

  it("대화 상자(role=dialog) 안이면 넣지 않는다", async () => {
    givenRules(rules({ itemCd: { kind: "fixed", value: "A" } }));
    await mount(inPage(createElement("div", { role: "dialog" }, createElement(Screen, { area: { autoSearch: true } }))));
    expect(latest.item).toBe("");
    expect(searches).toEqual([DEFAULT]);
  });

  it("pageId 가 없으면(포털 밖) 넣지 않는다", async () => {
    givenRules(rules({ itemCd: { kind: "fixed", value: "A" } }));
    await mount(createElement(Screen));
    expect(latest.item).toBe("");
  });

  it("화면 effect 가 정한 값(handoff)을 덮지 않는다", async () => {
    givenRules(rules({ itemCd: { kind: "fixed", value: "A" } }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await mount(inPage(createElement(Screen, { handoffClear: true })));
    await act(async () => {
      await Promise.resolve();
    });
    expect(latest.item).toBe("");
    // 다시 넣지 않고 개발 모드 경고만 한다.
    expect(warn.mock.calls.some((c) => String(c[0]).includes("함수형 갱신"))).toBe(true);
  });

  it("지난 상태를 복사하는 onChange 는 앞 칸 값을 잃고 개발 모드에서 경고한다", async () => {
    givenRules(rules({ itemCd: { kind: "fixed", value: "A" }, status: { kind: "fixed", value: "Y" } }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await mount(inPage(createElement(Screen, { stale: true })));
    expect(latest.item).toBe("");
    expect(latest.status).toBe("Y");
    expect(warn.mock.calls.some((c) => String(c[0]).includes("품번"))).toBe(true);
  });
});

describe("저장소가 늦을 때", () => {
  it("거울이 없으면 서버 응답을 기다렸다 넣고 그 뒤에 조회한다", async () => {
    let resolve: (v: unknown) => void = () => {};
    setSearchDefaultsTransportForTest(() => new Promise((r) => (resolve = r)));
    await mount(inPage(createElement(Screen, { area: { autoSearch: true } })));
    expect(searches).toHaveLength(0);
    await act(async () => {
      resolve(serverRows({ [PAGE]: rules({ itemCd: { kind: "fixed", value: "S" } }) }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latest.item).toBe("S");
    expect(searches).toEqual([latest]);
  });

  it("기다리는 동안 사용자가 고친 칸은 덮지 않는다", async () => {
    let resolve: (v: unknown) => void = () => {};
    setSearchDefaultsTransportForTest(() => new Promise((r) => (resolve = r)));
    await mount(inPage(createElement(Screen)));
    const input = rendered!.host.querySelector("input") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "typed");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(latest.item).toBe("typed");
    await act(async () => {
      resolve(serverRows({ [PAGE]: rules({ itemCd: { kind: "fixed", value: "S" }, status: { kind: "fixed", value: "N" } }) }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latest.item).toBe("typed");
    expect(latest.status).toBe("N");
  });

  it("한도를 넘으면 넣지 않고 코드 기본값으로 조회한다", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    setSearchDefaultsTransportForTest(() => new Promise(() => {}));
    await mount(inPage(createElement(Screen, { area: { autoSearch: true } })));
    expect(searches).toHaveLength(0);
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEFAULTS_WAIT_MS + 10);
    });
    expect(searches).toEqual([DEFAULT]);
  });
});

describe("초기화·조회 이벤트", () => {
  it("btn_reset 은 코드 기본값 위에 사용자 기본값을 다시 넣는다(마지막 조회값 칸 제외)", async () => {
    localStorage.setItem(`dmes:search-last:v1:${USER}:${PAGE}`, JSON.stringify({ status: "N" }));
    givenRules(rules({ itemCd: { kind: "fixed", value: "A" }, status: { kind: "last" } }));
    await mount(inPage(createElement(Screen, { withReset: true })));
    expect(latest.item).toBe("A");
    expect(latest.status).toBe("N");
    const input = rendered!.host.querySelector(".search-area input") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "changed");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(latest.item).toBe("changed");
    const resetBtn = [...rendered!.host.querySelectorAll("button")].find((b) => b.textContent === "초기화")!;
    await act(async () => {
      resetBtn.click();
    });
    expect(latest.item).toBe("A");
    expect(latest.status).toBe("");
  });

  it("조회(emitSearch)는 등록된 칸의 지금 값을 마지막 조회값으로 적는다", async () => {
    givenRules(rules({ itemCd: { kind: "fixed", value: "A" } }));
    await mount(inPage(createElement(Screen)));
    act(() => emitSearch(PAGE));
    expect(readSearchLastValues(USER, PAGE)).toMatchObject({ itemCd: "A", status: "", fromDt: "", "fromDt~to": "" });
  });

  it("마지막 조회값 규칙은 다음 마운트에 그 값을 넣는다", async () => {
    localStorage.setItem(`dmes:search-last:v1:${USER}:${PAGE}`, JSON.stringify({ itemCd: "LAST" }));
    givenRules(rules({ itemCd: { kind: "last" } }));
    await mount(inPage(createElement(Screen)));
    expect(latest.item).toBe("LAST");
  });
});

describe("리뷰 지적 회귀(2026-10-07)", () => {
  it("초기화 — 이미 사용자 기본값이 든(건드리지 않은) 칸도 사용자 기본값으로 남는다", async () => {
    givenRules(rules({ itemCd: { kind: "fixed", value: "A" } }));
    const warn = vi.spyOn(console, "warn");
    await mount(inPage(createElement(Screen, { withReset: true })));
    expect(latest.item).toBe("A");
    const resetBtn = [...rendered!.host.querySelectorAll("button")].find((b) => b.textContent === "초기화")!;
    await act(async () => {
      resetBtn.click();
    });
    expect(latest.item).toBe("A");
    expect(warn).not.toHaveBeenCalled();
  });

  it("저장소가 늦으면 그 사이 화면 effect(handoff)가 정한 값을 덮지 않는다", async () => {
    let resolve: (v: unknown) => void = () => {};
    setSearchDefaultsTransportForTest(() => new Promise((r) => (resolve = r)));
    function Handoff() {
      const [v, setV] = useCarryState("v", "");
      latest = { ...DEFAULT, item: v };
      useEffect(() => setV("HANDOFF"), [setV]);
      return createElement(
        SearchArea,
        { onSearch: () => {} },
        createElement(SearchField, { label: "품번", name: "itemCd", value: v, onChange: setV }),
      );
    }
    await mount(inPage(createElement(Handoff)));
    expect(latest.item).toBe("HANDOFF");
    await act(async () => {
      resolve(serverRows({ [PAGE]: rules({ itemCd: { kind: "fixed", value: "S" } }) }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latest.item).toBe("HANDOFF");
  });

  it("handoff 화면이 기다리는 사이 defaults=false 로 바꾸면 늦게 온 규칙을 넣지 않는다(같은 빈 값으로 비운 경우)", async () => {
    let resolve: (v: unknown) => void = () => {};
    setSearchDefaultsTransportForTest(() => new Promise((r) => (resolve = r)));
    function HandoffSame() {
      const [v, setV] = useCarryState("v", "");
      const [handoff, setHandoff] = useState(false);
      latest = { ...DEFAULT, item: v };
      useEffect(() => {
        setV("");
        setHandoff(true);
      }, [setV]);
      return createElement(
        SearchArea,
        { onSearch: () => {}, defaults: !handoff },
        createElement(SearchField, { label: "품번", name: "itemCd", value: v, onChange: setV }),
      );
    }
    await mount(inPage(createElement(HandoffSame)));
    await act(async () => {
      resolve(serverRows({ [PAGE]: rules({ itemCd: { kind: "fixed", value: "S" } }) }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latest.item).toBe("");
  });

  it("StrictMode 에서도 시작이 끝보다 늦은 기간은 두 칸 모두 넣지 않는다(다시 등록 때 한 칸씩 넣지 않음)", async () => {
    givenRules(
      rules({
        fromDt: { kind: "relative", base: "today", days: 1 },
        "fromDt~to": { kind: "relative", base: "today" },
      }),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await mount(createElement(StrictMode, null, inPage(createElement(Screen))));
    expect(latest.from).toBe("");
    expect(latest.to).toBe("");
  });

  it("넣기가 끝난 뒤 함께 나타난 기간 짝도 시작이 끝보다 늦으면 넣지 않는다", async () => {
    givenRules(rules({ lf: { kind: "relative", base: "today", days: 1 }, "lf~to": { kind: "relative", base: "today" } }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let show: (v: boolean) => void = () => {};
    const vals = { from: "", to: "" };
    function LatePair() {
      const [visible, setVisible] = useState(false);
      const [f, setF] = useState({ from: "", to: "" });
      show = setVisible;
      Object.assign(vals, f);
      return createElement(
        SearchArea,
        { onSearch: () => {} },
        createElement(SearchField, { label: "a", name: "a", value: "", onChange: () => {} }),
        visible ? createElement(SearchField, { key: "lf", label: "기간", name: "lf", type: "date", value: f.from, onChange: (v: string) => setF((p) => ({ ...p, from: v })) }) : null,
        visible ? createElement(SearchField, { key: "lt", label: "~", type: "date", value: f.to, onChange: (v: string) => setF((p) => ({ ...p, to: v })) }) : null,
      );
    }
    await mount(inPage(createElement(LatePair)));
    await act(async () => show(true));
    expect(vals).toEqual({ from: "", to: "" });
  });

  it("선택지가 늦게 오면 보류했다가 선택지가 생길 때 넣는다", async () => {
    givenRules(rules({ status: { kind: "fixed", value: "SYS1" } }));
    let load: () => void = () => {};
    function LateOptions() {
      const [v, setV] = useCarryState("v", "");
      const [opts, setOpts] = useState([{ value: "", label: "전체" }]);
      load = () => setOpts([{ value: "", label: "전체" }, { value: "SYS1", label: "시스템1" }]);
      latest = { ...DEFAULT, status: v };
      return createElement(
        SearchArea,
        { onSearch: () => {} },
        createElement(SearchField, { label: "시스템", name: "status", type: "select", options: opts, value: v, onChange: setV }),
      );
    }
    await mount(inPage(createElement(LateOptions)));
    expect(latest.status).toBe("");
    await act(async () => load());
    expect(latest.status).toBe("SYS1");
  });

  /** 선택지를 서버에서 받는 select 하나와 autoSearch — 조회 때의 값을 적는다. */
  function lateOptionsScreen(searched: string[], setLoad: (fn: () => void) => void) {
    return function LateOptionsAuto() {
      const [v, setV] = useCarryState("v", "");
      const [opts, setOpts] = useState([{ value: "", label: "전체" }]);
      setLoad(() => setOpts([{ value: "", label: "전체" }, { value: "SYS1", label: "시스템1" }]));
      latest = { ...DEFAULT, status: v };
      return createElement(
        SearchArea,
        { autoSearch: true, onSearch: () => searched.push(v) },
        createElement(SearchField, { label: "시스템", name: "status", type: "select", options: opts, value: v, onChange: setV }),
      );
    };
  }

  it("autoSearch 는 선택지를 기다리는 값을 넣은 뒤에 그 값으로 한 번 조회한다", async () => {
    givenRules(rules({ status: { kind: "fixed", value: "SYS1" } }));
    const searched: string[] = [];
    let load: () => void = () => {};
    await mount(inPage(createElement(lateOptionsScreen(searched, (fn) => (load = fn)))));
    expect(searched).toEqual([]);
    await act(async () => load());
    expect(latest.status).toBe("SYS1");
    expect(searched).toEqual(["SYS1"]);
  });

  it("선택지가 한도 안에 오지 않으면 보류를 버리고 지금 값으로 한 번 조회한다", async () => {
    vi.useFakeTimers();
    givenRules(rules({ status: { kind: "fixed", value: "SYS1" } }));
    const searched: string[] = [];
    let load: () => void = () => {};
    await mount(inPage(createElement(lateOptionsScreen(searched, (fn) => (load = fn)))));
    expect(searched).toEqual([]);
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEFAULTS_WAIT_MS + 10);
    });
    expect(searched).toEqual([""]);
    // 조회한 뒤 늦게 온 선택지로 칸을 바꾸지 않는다(조회한 조건과 칸이 달라지지 않게).
    await act(async () => load());
    expect(latest.status).toBe("");
    expect(searched).toEqual([""]);
  });

  it("StrictMode(effect 다시 실행)에서도 미룬 조회의 한도 타이머가 살아 있다", async () => {
    vi.useFakeTimers();
    givenRules(rules({ status: { kind: "fixed", value: "SYS1" } }));
    const searched: string[] = [];
    await mount(createElement(StrictMode, null, inPage(createElement(lateOptionsScreen(searched, () => {})))));
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEFAULTS_WAIT_MS + 10);
    });
    expect(searched).toEqual([""]);
  });

  it("사용자 확인에 실패하면 기다리지 않고 바로 autoSearch 한다", async () => {
    setUser(null);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    await mount(inPage(createElement(Screen, { area: { autoSearch: true } })));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(searches).toEqual([DEFAULT]);
    vi.unstubAllGlobals();
  });
});

describe("영역 키", () => {
  it("defaultsScope 가 있으면 저장 키에 접두가 붙어 다른 영역과 섞이지 않는다", async () => {
    givenRules(rules({ itemCd: { kind: "fixed", value: "MAIN" }, "tab2.itemCd": { kind: "fixed", value: "TAB2" } }));
    let tab2 = "";
    function Two() {
      return [
        createElement(Screen, { key: "a" }),
        createElement(
          SearchArea,
          { key: "b", onSearch: () => {}, defaultsScope: "tab2" },
          createElement(SearchField, {
            label: "품번",
            name: "itemCd",
            value: tab2,
            onChange: (v: string) => {
              tab2 = v;
            },
          }),
        ),
      ];
    }
    await mount(inPage(createElement(Two)));
    expect(latest.item).toBe("MAIN");
    expect(tab2).toBe("TAB2");
  });

  it("넣기가 끝난 뒤 나타난 칸은 등록할 때 한 번 넣는다", async () => {
    givenRules(rules({ memoKey: { kind: "fixed", value: "LATE" } }));
    let show: (v: boolean) => void = () => {};
    let memo = "";
    function Late() {
      const [visible, setVisible] = useCarryState("visible", false);
      show = setVisible;
      return createElement(
        SearchArea,
        { onSearch: () => {} },
        createElement(SearchField, { label: "a", name: "a", value: "", onChange: () => {} }),
        visible
          ? createElement(SearchField, {
              label: "메모",
              defaultKey: "memoKey",
              value: memo,
              onChange: (v: string) => {
                memo = v;
              },
            })
          : null,
      );
    }
    await mount(inPage(createElement(Late)));
    expect(memo).toBe("");
    await act(async () => show(true));
    expect(memo).toBe("LATE");
  });
});
