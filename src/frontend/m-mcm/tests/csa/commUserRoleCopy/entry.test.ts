import { describe, expect, it, vi } from "vitest";

import { runEntrySearch } from "@/page-components/csa/commUserRoleCopy/entry";

describe("runEntrySearch — 사용자 권한 일괄 등록 진입 조회 분기", () => {
  it("source 사용자 칸이 비면 조회 없이 전체 사용자 List 를 불러온다", async () => {
    const search = vi.fn(async () => true);
    const loadUserList = vi.fn(async () => {});
    await runEntrySearch("", search, loadUserList);
    await runEntrySearch("   ", search, loadUserList);
    expect(search).not.toHaveBeenCalled();
    expect(loadUserList).toHaveBeenCalledTimes(2);
  });

  it("기본값이 들어와 있으면 조회 단추와 같은 조회를 타고, 찾으면 전체 List 로 물러서지 않는다", async () => {
    const search = vi.fn(async () => true);
    const loadUserList = vi.fn(async () => {});
    await runEntrySearch("U001", search, loadUserList);
    expect(search).toHaveBeenCalledTimes(1);
    expect(loadUserList).not.toHaveBeenCalled();
  });

  it("조회가 0건이면 사용자 List 가 비지 않게 전체 List 로 물러선다", async () => {
    const order: string[] = [];
    const search = vi.fn(async () => {
      order.push("search");
      return false;
    });
    const loadUserList = vi.fn(async () => {
      order.push("load");
    });
    await runEntrySearch("NOBODY", search, loadUserList);
    expect(order).toEqual(["search", "load"]);
  });
});
