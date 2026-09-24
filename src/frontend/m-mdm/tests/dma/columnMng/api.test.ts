import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compareName,
  saveColumn,
  searchColumns,
  unwrap,
} from "../../../pages/dma/columnMng/api";

/**
 * TSK-04-04 design.md §3.4·§6.17 — OASIS 봉투 해제. BPMN 안 업무 오류는 HTTP 200 + meta.success=false +
 * meta.message 로만 온다(F12). FE 저장 요청은 systems·terms 두 그리드를 항상 보낸다(I16, Build 이탈 B1).
 */
describe("unwrap", () => {
  it("meta.success=false 면 meta.message 로 throw 한다", () => {
    expect(() =>
      unwrap({
        meta: {
          success: false,
          code: "S001",
          message: "미등록 용어(***)가 남아 있어 저장할 수 없습니다: 편차",
        },
      }),
    ).toThrow("미등록 용어(***)가 남아 있어 저장할 수 없습니다: 편차");
  });

  it("message 가 비면 기본 문구로 throw 한다", () => {
    expect(() => unwrap({ meta: { success: false, message: "  " } })).toThrow(
      "요청이 거부되었습니다.",
    );
  });

  it("성공이면 data.result 를 펼친다", () => {
    expect(
      unwrap({
        meta: { success: true },
        data: { result: { columnId: 7, list: [] } },
      }),
    ).toEqual({
      columnId: 7,
      list: [],
    });
  });
});

describe("api 호출", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(result: Record<string, unknown>) {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ meta: { success: true }, data: { result } }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("saveColumn 은 빈 그리드여도 systems·terms 를 항상 보낸다", async () => {
    const fetchMock = stubFetch({ columnId: 3 });

    const result = await saveColumn({ columnName: "원재료 코일 두께" }, [], []);

    expect(result.columnId).toBe(3);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/mdm/oasis/columnMng/save");
    const body = JSON.parse(String(init.body));
    expect(body.meta).toEqual({ menuId: "columnMng" });
    expect(body.grids).toEqual({ systems: { rows: [] }, terms: { rows: [] } });
    expect(body.params.columnName).toBe("원재료 코일 두께");
  });

  it("compareName 은 compare 액션으로 방향과 입력을 보낸다", async () => {
    const fetchMock = stubFetch({ physName: "RMTL" });

    await compareName("REVERSE", "RMTL");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/mdm/oasis/columnMng/compare");
    expect(JSON.parse(String(init.body)).params).toEqual({
      direction: "REVERSE",
      input: "RMTL",
    });
  });

  it("params 의 null·undefined 값은 빼고 보낸다(OASIS 가 null 의 타입을 정하지 못해 실패한다)", async () => {
    const fetchMock = stubFetch({ list: [] });

    await searchColumns("", "");
    await saveColumn(
      {
        columnId: null,
        columnName: "코일",
        usageNote: undefined,
        required: false,
      },
      [],
      [],
    );

    const search = JSON.parse(
      String(
        (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body,
      ),
    );
    expect(search.params).toEqual({ keyword: "" });
    const save = JSON.parse(
      String(
        (fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body,
      ),
    );
    expect(save.params).toEqual({ columnName: "코일", required: false });
  });
});
