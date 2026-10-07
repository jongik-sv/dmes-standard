/** @vitest-environment happy-dom */
/**
 * 조회 칸 기본값 저장소(설계 2026-10-07-search-defaults-design §5.3·§5.4) — 거울·서버 응답 꼴·실패·저장 요청 본문.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SEARCH_DEFAULTS_MIRROR_PREFIX,
  getPageSearchDefaults,
  getSearchDefaultsSource,
  getSearchDefaultsStatus,
  preloadSearchDefaults,
  resetSearchDefaults,
  resetSearchDefaultsStore,
  saveSearchDefaults,
  setSearchDefaultsTransportForTest,
} from "../../src/layout/search-defaults/store";
import { installMemoryLocalStorage } from "./grid-personalize-test-env";

const flush = async () => {
  for (let i = 0; i < 3; i++) await Promise.resolve();
};

beforeEach(() => {
  installMemoryLocalStorage();
  resetSearchDefaultsStore();
});
afterEach(() => {
  setSearchDefaultsTransportForTest();
  vi.restoreAllMocks();
});

describe("preloadSearchDefaults", () => {
  it("거울이 없으면 loading → 서버 행(data.result.rows)으로 ready, 거울을 쓴다. 모르는 규칙은 버린다", async () => {
    const calls: unknown[] = [];
    setSearchDefaultsTransportForTest(async (action, body) => {
      calls.push([action, body]);
      return {
        meta: { success: true },
        data: {
          result: {
            rows: [
              { pageId: "mcm:a/b", fieldKey: "itemCd", ruleJson: '{"kind":"fixed","value":"X"}' },
              { pageId: "mcm:a/b", fieldKey: "bad", ruleJson: '{"kind":"weekly"}' },
            ],
          },
        },
      };
    });
    preloadSearchDefaults("u1");
    expect(getSearchDefaultsStatus("u1")).toBe("loading");
    await flush();
    expect(getSearchDefaultsStatus("u1")).toBe("ready");
    expect(getSearchDefaultsSource("u1")).toBe("server");
    expect(getPageSearchDefaults("u1", "mcm:a/b")).toEqual({ itemCd: { kind: "fixed", value: "X" } });
    expect(JSON.parse(localStorage.getItem(`${SEARCH_DEFAULTS_MIRROR_PREFIX}u1`)!)).toEqual({
      "mcm:a/b": { itemCd: { kind: "fixed", value: "X" } },
    });
    expect(calls).toEqual([["search", { meta: { menuId: "HOME" }, params: {} }]]);
    // 두 번째 부름은 서버에 다시 묻지 않는다.
    preloadSearchDefaults("u1");
    expect(calls).toHaveLength(1);
  });

  it("grids.rows.rows 꼴도 읽는다", async () => {
    setSearchDefaultsTransportForTest(async () => ({
      grids: { rows: { rows: [{ pageId: "p", fieldKey: "k", ruleJson: '{"kind":"last"}' }] } },
    }));
    preloadSearchDefaults("u1");
    await flush();
    expect(getPageSearchDefaults("u1", "p")).toEqual({ k: { kind: "last" } });
  });

  it("거울이 있으면 바로 ready(mirror), 서버 실패면 거울 값을 유지한다", async () => {
    localStorage.setItem(`${SEARCH_DEFAULTS_MIRROR_PREFIX}u1`, JSON.stringify({ p: { k: { kind: "fixed", value: "M" } } }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    setSearchDefaultsTransportForTest(async () => {
      throw new Error("down");
    });
    preloadSearchDefaults("u1");
    expect(getSearchDefaultsStatus("u1")).toBe("ready");
    expect(getSearchDefaultsSource("u1")).toBe("mirror");
    expect(getPageSearchDefaults("u1", "p")).toEqual({ k: { kind: "fixed", value: "M" } });
    await flush();
    expect(getSearchDefaultsSource("u1")).toBe("mirror");
    expect(getPageSearchDefaults("u1", "p")).toEqual({ k: { kind: "fixed", value: "M" } });
  });

  it("거울도 없고 서버도 실패하면 ready(empty)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    setSearchDefaultsTransportForTest(async () => ({ meta: { success: false, message: "거절" } }));
    preloadSearchDefaults("u1");
    await flush();
    expect(getSearchDefaultsStatus("u1")).toBe("ready");
    expect(getSearchDefaultsSource("u1")).toBe("empty");
  });
});

describe("리뷰 지적 회귀(2026-10-07)", () => {
  it("서버 실패 뒤에는 간격 안에 다시 묻지 않고 loading 으로 되돌아가지 않는다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const transport = vi.fn(async () => {
      throw new Error("down");
    });
    setSearchDefaultsTransportForTest(transport);
    preloadSearchDefaults("u1");
    await flush();
    preloadSearchDefaults("u1");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(getSearchDefaultsStatus("u1")).toBe("ready");
  });

  it("미리 받기 응답이 저장보다 늦게 와도 저장한 화면 규칙을 덮지 않는다", async () => {
    let resolveSearch: (v: unknown) => void = () => {};
    setSearchDefaultsTransportForTest(async (action) => {
      if (action === "search") return new Promise((r) => (resolveSearch = r));
      return { meta: { success: true } };
    });
    preloadSearchDefaults("u1");
    await saveSearchDefaults("u1", "p", [{ fieldKey: "k", rule: { kind: "fixed", value: "NEW" } }]);
    resolveSearch({ data: { result: { rows: [{ pageId: "p", fieldKey: "k", ruleJson: '{"kind":"fixed","value":"OLD"}' }] } } });
    await flush();
    expect(getPageSearchDefaults("u1", "p")).toEqual({ k: { kind: "fixed", value: "NEW" } });
  });
});

describe("saveSearchDefaults·resetSearchDefaults", () => {
  it("savePage 본문(grids.rows.rows, ruleJson 문자열)을 보내고 성공하면 메모리·거울을 바꾼다", async () => {
    const calls: unknown[] = [];
    setSearchDefaultsTransportForTest(async (action, body) => {
      calls.push([action, body]);
      return { meta: { success: true } };
    });
    await saveSearchDefaults("u1", "p", [{ fieldKey: "k", rule: { kind: "relative", base: "monthStart", months: -1 }, fieldLabel: "기간" }]);
    expect(calls[0]).toEqual([
      "savePage",
      {
        meta: { menuId: "HOME" },
        params: { pageId: "p" },
        grids: {
          rows: {
            rows: [{ fieldKey: "k", ruleJson: '{"kind":"relative","base":"monthStart","months":-1}', fieldMeta: null, fieldLabel: "기간" }],
          },
        },
      },
    ]);
    expect(getPageSearchDefaults("u1", "p")).toEqual({ k: { kind: "relative", base: "monthStart", months: -1 } });
    await resetSearchDefaults("u1", "p");
    expect(calls[1]).toEqual(["resetPage", { meta: { menuId: "HOME" }, params: { pageId: "p" } }]);
    expect(getPageSearchDefaults("u1", "p")).toEqual({});
    expect(JSON.parse(localStorage.getItem(`${SEARCH_DEFAULTS_MIRROR_PREFIX}u1`)!)).toEqual({});
  });

  it("서버가 거절하면 던지고 값을 바꾸지 않는다", async () => {
    setSearchDefaultsTransportForTest(async () => ({ meta: { success: false, message: "행이 너무 많습니다" } }));
    await expect(saveSearchDefaults("u1", "p", [{ fieldKey: "k", rule: { kind: "last" } }])).rejects.toThrow("행이 너무 많습니다");
    expect(getPageSearchDefaults("u1", "p")).toEqual({});
  });
});
