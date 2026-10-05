import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiLovMaster = vi.fn();
vi.mock("@dk-oasis/shared/http", () => ({ apiLovMaster: (...a: unknown[]) => apiLovMaster(...a) }));

import {
  WIDGET_CATEGORY_TIMEOUT_MS,
  fetchWidgetCategories,
  resetWidgetCategoriesCache,
} from "./use-widget-categories";

const ROWS = {
  data: [
    { value: "TOOL", displayValue: "도구" },
    { value: "INFO", displayValue: "외부 정보" },
  ],
};

beforeEach(() => {
  apiLovMaster.mockReset();
  resetWidgetCategoriesCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchWidgetCategories", () => {
  it("WIDGET_CTG 행을 value/label 로 바꾼다", async () => {
    apiLovMaster.mockResolvedValueOnce(ROWS);
    const out = await fetchWidgetCategories();
    expect(apiLovMaster).toHaveBeenCalledWith("mcm", "WIDGET_CTG");
    expect(out).toEqual([
      { value: "TOOL", label: "도구" },
      { value: "INFO", label: "외부 정보" },
    ]);
  });

  it("성공한 결과는 보관해 다시 조회하지 않는다", async () => {
    apiLovMaster.mockResolvedValueOnce(ROWS);
    await fetchWidgetCategories();
    await fetchWidgetCategories();
    expect(apiLovMaster).toHaveBeenCalledTimes(1);
  });

  it("빈 결과는 보관하지 않아 다음 조회에서 다시 가져온다", async () => {
    apiLovMaster.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce(ROWS);
    expect(await fetchWidgetCategories()).toEqual([]);
    const second = await fetchWidgetCategories();
    expect(apiLovMaster).toHaveBeenCalledTimes(2);
    expect(second).toHaveLength(2);
  });

  it("실패는 빈 목록으로 돌려주고 보관하지 않는다", async () => {
    apiLovMaster.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(ROWS);
    expect(await fetchWidgetCategories()).toEqual([]);
    expect(await fetchWidgetCategories()).toHaveLength(2);
  });

  it("응답이 멈추면 시간 초과로 빈 목록을 돌려주고 다음 조회에서 다시 시도한다", async () => {
    vi.useFakeTimers();
    apiLovMaster.mockReturnValueOnce(new Promise(() => {})).mockResolvedValueOnce(ROWS);
    const first = fetchWidgetCategories();
    await vi.advanceTimersByTimeAsync(WIDGET_CATEGORY_TIMEOUT_MS + 1);
    expect(await first).toEqual([]);
    expect(await fetchWidgetCategories()).toHaveLength(2);
  });
});
