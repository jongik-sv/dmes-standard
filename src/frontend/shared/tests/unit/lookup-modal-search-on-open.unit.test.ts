/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { LookupModal, type LookupFetchFn } from "../../src/components/lookup/LookupModal";
import { renderWithMantine, rerender } from "./mantine-test-utils";

// 사용자 관리 부서 LoV 실측(2026-09-28): 모달이 빈 목록으로 열려 "부서가 없다"로 보였다.
// searchOnOpen 을 켠 호출처는 열리는 즉시 initialKeyword 로 1페이지를 조회해야 한다.
describe("LookupModal searchOnOpen", () => {
  const makeFetch = () =>
    vi.fn<LookupFetchFn>(async () => ({ rows: [{ code: "DEPT_001", name: "경영지원본부" }], totalElements: 1 }));

  it("searchOnOpen 이면 열릴 때 initialKeyword 로 첫 페이지를 조회한다", async () => {
    const fetchFn = makeFetch();
    const props = { title: "부서 검색", fetchFn, onSelect: () => {}, onClose: () => {}, searchOnOpen: true, initialKeyword: "D" };
    const r = renderWithMantine(createElement(LookupModal, { ...props, open: false }));
    expect(fetchFn).not.toHaveBeenCalled();

    rerender(r, createElement(LookupModal, { ...props, open: true }));
    await act(async () => {});

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toMatchObject({ keyword: "D", page: 0, size: 50 });
    expect(document.body.textContent).toContain("총 1건");
    r.unmount();
  });

  it("searchOnOpen 이 없으면 조회 버튼 전까지 조회하지 않는다", async () => {
    const fetchFn = makeFetch();
    const r = renderWithMantine(
      createElement(LookupModal, { open: true, title: "T", fetchFn, onSelect: () => {}, onClose: () => {} }),
    );
    await act(async () => {});
    expect(fetchFn).not.toHaveBeenCalled();
    r.unmount();
  });
});
