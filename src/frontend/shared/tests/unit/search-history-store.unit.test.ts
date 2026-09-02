/**
 * 검색칸 "최근 입력값" localStorage 저장소 단위 테스트.
 *
 * 검증 대상:
 *  - 키 생성 / APS 화면 게이트
 *  - add: 트림 · 빈값/초과길이 무시 · 중복제거(move-to-front) · 상한 8
 *  - read: 없음/형식오류 시 빈 배열
 *  - remove / clear / clearAll
 *  - SSR(window 부재) 가드 — throw 없이 no-op
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SEARCH_HISTORY_MAX_ENTRIES,
  SEARCH_HISTORY_MAX_VALUE_LENGTH,
  addSearchHistory,
  buildSearchHistoryKey,
  clearAllSearchHistory,
  clearSearchHistory,
  isSearchHistoryPage,
  readSearchHistory,
  removeSearchHistory,
} from "../../src/layout/search-history-store";

/** Map 기반 가짜 localStorage (node 환경엔 window/localStorage 가 없음) */
function makeFakeLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
  } as Storage;
}

const PAGE = "mpn:mpc/orders";
const FIELD = "자재코드";

describe("search-history-store", () => {
  beforeEach(() => {
    (globalThis as any).window = { localStorage: makeFakeLocalStorage() };
  });
  afterEach(() => {
    delete (globalThis as any).window;
  });

  describe("buildSearchHistoryKey", () => {
    it("prefix + pageId + fieldKey 로 조합한다", () => {
      expect(buildSearchHistoryKey(PAGE, FIELD)).toBe(
        `dmes:search-history:${PAGE}:${FIELD}`
      );
    });
    it("인자가 비면 빈 문자열(비활성)", () => {
      expect(buildSearchHistoryKey("", FIELD)).toBe("");
      expect(buildSearchHistoryKey(PAGE, "")).toBe("");
    });
  });

  describe("isSearchHistoryPage", () => {
    it("mpn: 화면만 활성", () => {
      expect(isSearchHistoryPage("mpn:mpc/orders")).toBe(true);
      expect(isSearchHistoryPage("cmm:xxx")).toBe(false);
      expect(isSearchHistoryPage("")).toBe(false);
      expect(isSearchHistoryPage(undefined)).toBe(false);
    });
  });

  describe("add / read", () => {
    it("값이 없으면 빈 배열", () => {
      expect(readSearchHistory(PAGE, FIELD)).toEqual([]);
    });

    it("추가한 값이 맨 앞에 온다", () => {
      addSearchHistory(PAGE, FIELD, "A");
      addSearchHistory(PAGE, FIELD, "B");
      expect(readSearchHistory(PAGE, FIELD)).toEqual(["B", "A"]);
    });

    it("중복 값은 제거 후 맨 앞으로(move-to-front)", () => {
      addSearchHistory(PAGE, FIELD, "A");
      addSearchHistory(PAGE, FIELD, "B");
      addSearchHistory(PAGE, FIELD, "A");
      expect(readSearchHistory(PAGE, FIELD)).toEqual(["A", "B"]);
    });

    it("앞뒤 공백은 트림 후 저장", () => {
      const next = addSearchHistory(PAGE, FIELD, "  A  ");
      expect(next).toEqual(["A"]);
    });

    it("트림 후 빈 값은 저장하지 않는다", () => {
      addSearchHistory(PAGE, FIELD, "   ");
      expect(readSearchHistory(PAGE, FIELD)).toEqual([]);
    });

    it("최대 길이 초과 값은 저장하지 않는다", () => {
      const tooLong = "x".repeat(SEARCH_HISTORY_MAX_VALUE_LENGTH + 1);
      addSearchHistory(PAGE, FIELD, tooLong);
      expect(readSearchHistory(PAGE, FIELD)).toEqual([]);
    });

    it(`상한 ${SEARCH_HISTORY_MAX_ENTRIES} 건을 넘기면 오래된 값이 밀려난다`, () => {
      for (let i = 1; i <= SEARCH_HISTORY_MAX_ENTRIES + 3; i++) {
        addSearchHistory(PAGE, FIELD, `V${i}`);
      }
      const list = readSearchHistory(PAGE, FIELD);
      expect(list).toHaveLength(SEARCH_HISTORY_MAX_ENTRIES);
      expect(list[0]).toBe(`V${SEARCH_HISTORY_MAX_ENTRIES + 3}`); // 최신
      expect(list).not.toContain("V1"); // 가장 오래된 건 밀려남
    });

    it("화면/필드가 다르면 분리 저장된다", () => {
      addSearchHistory(PAGE, "자재코드", "A");
      addSearchHistory(PAGE, "제목", "B");
      addSearchHistory("mpn:other", "자재코드", "C");
      expect(readSearchHistory(PAGE, "자재코드")).toEqual(["A"]);
      expect(readSearchHistory(PAGE, "제목")).toEqual(["B"]);
      expect(readSearchHistory("mpn:other", "자재코드")).toEqual(["C"]);
    });

    it("형식오류(JSON 아님)면 빈 배열", () => {
      (globalThis as any).window.localStorage.setItem(
        buildSearchHistoryKey(PAGE, FIELD),
        "{not-json"
      );
      expect(readSearchHistory(PAGE, FIELD)).toEqual([]);
    });
  });

  describe("remove / clear / clearAll", () => {
    it("특정 값 1건 제거", () => {
      addSearchHistory(PAGE, FIELD, "A");
      addSearchHistory(PAGE, FIELD, "B");
      const next = removeSearchHistory(PAGE, FIELD, "A");
      expect(next).toEqual(["B"]);
      expect(readSearchHistory(PAGE, FIELD)).toEqual(["B"]);
    });

    it("한 필드 전체 삭제", () => {
      addSearchHistory(PAGE, FIELD, "A");
      clearSearchHistory(PAGE, FIELD);
      expect(readSearchHistory(PAGE, FIELD)).toEqual([]);
    });

    it("clearAll 은 dmes:search-history:* 키만 제거하고 무관 키는 보존", () => {
      addSearchHistory(PAGE, "자재코드", "A");
      addSearchHistory(PAGE, "제목", "B");
      (globalThis as any).window.localStorage.setItem("unrelated", "keep");
      clearAllSearchHistory();
      expect(readSearchHistory(PAGE, "자재코드")).toEqual([]);
      expect(readSearchHistory(PAGE, "제목")).toEqual([]);
      expect((globalThis as any).window.localStorage.getItem("unrelated")).toBe("keep");
    });
  });

  describe("SSR(window 부재) 가드", () => {
    beforeEach(() => {
      delete (globalThis as any).window;
    });
    it("throw 없이 빈 배열/ no-op", () => {
      expect(() => addSearchHistory(PAGE, FIELD, "A")).not.toThrow();
      expect(readSearchHistory(PAGE, FIELD)).toEqual([]);
      expect(() => removeSearchHistory(PAGE, FIELD, "A")).not.toThrow();
      expect(() => clearSearchHistory(PAGE, FIELD)).not.toThrow();
      expect(() => clearAllSearchHistory()).not.toThrow();
    });
  });
});
