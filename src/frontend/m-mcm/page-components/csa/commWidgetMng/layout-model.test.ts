import { describe, expect, it } from "vitest";

import {
  COMPANY_LAYOUT_KEY,
  addPendingDept,
  boardTitle,
  buildLayoutList,
  buildTypeTitles,
  deleteConfirmMessage,
  inheritNotice,
  layoutDisplayName,
  layoutItemsFromRows,
  layoutItemsToRows,
  pageDeptLookupRows,
  prunePending,
  tabsFromLayout,
  type DeptRow,
  type LayoutSummary,
  type LoadedLayout,
} from "./layout-model";

const S = (layoutKey: string, deptNm: string, count: number): LayoutSummary => ({ layoutKey, deptNm, count });
const DEPT = (deptCd: string, deptNm: string, upperDeptCd: string | null = null): DeptRow => ({ deptCd, deptNm, upperDeptCd });

describe("buildLayoutList — 배치 목록 정렬", () => {
  it("전사(*)는 행이 없어도 늘 첫 줄이고 「코드 기본값 사용 중」으로 보인다", () => {
    const rows = buildLayoutList([], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ layoutKey: "*", deptNm: "전사", count: 0, saved: false });
    expect(rows[0].label).toBe("전사(*) · 코드 기본값 사용 중");
  });

  it("전사 행이 있으면 개수를 보인다", () => {
    const rows = buildLayoutList([S("*", "전사", 11)], []);
    expect(rows[0]).toMatchObject({ layoutKey: "*", count: 11, saved: true });
    expect(rows[0].label).toBe("전사(*) · 11개");
  });

  it("서버가 부서 행을 먼저 줘도 전사가 첫 줄이고 부서는 이름 순이다", () => {
    // 이름 순: 생산팀 < 품질팀 (코드 순이 아니다 — D200 이 먼저 와도 생산팀(D100)이 앞)
    const rows = buildLayoutList([S("D200", "품질팀", 3), S("*", "전사", 11), S("D100", "생산팀", 5)], []);
    expect(rows.map((r) => r.layoutKey)).toEqual(["*", "D100", "D200"]);
    // 이름이 코드 순과 반대인 경우
    const reversed = buildLayoutList([S("D100", "품질팀", 3), S("D200", "생산팀", 5)], []);
    expect(reversed.map((r) => r.layoutKey)).toEqual(["*", "D200", "D100"]);
  });

  it("부서 줄은 「부서명(코드) · n개」", () => {
    const rows = buildLayoutList([S("D100", "생산팀", 5)], []);
    expect(rows[1].label).toBe("생산팀(D100) · 5개");
    expect(rows[1].saved).toBe(true);
  });

  it("이름이 같으면 코드 순", () => {
    const rows = buildLayoutList([S("D2", "같은팀", 1), S("D1", "같은팀", 1)], []);
    expect(rows.map((r) => r.layoutKey)).toEqual(["*", "D1", "D2"]);
  });

  it("[부서 추가]로 고른 부서(저장 전)는 목록에 끼고 「저장 전」으로 보인다", () => {
    const rows = buildLayoutList([S("D200", "품질팀", 3)], [{ layoutKey: "D100", deptNm: "생산팀" }]);
    expect(rows.map((r) => r.layoutKey)).toEqual(["*", "D100", "D200"]);
    expect(rows[1]).toMatchObject({ saved: false, count: 0 });
    expect(rows[1].label).toBe("생산팀(D100) · 저장 전");
  });

  it("저장 전 부서가 서버 목록에도 있으면 서버 행을 쓴다(중복 없음)", () => {
    const rows = buildLayoutList([S("D100", "생산팀", 5)], [{ layoutKey: "D100", deptNm: "생산팀" }]);
    expect(rows.filter((r) => r.layoutKey === "D100")).toHaveLength(1);
    expect(rows.find((r) => r.layoutKey === "D100")?.saved).toBe(true);
  });

  it("부서 이름이 비어 있으면 코드만 보인다", () => {
    const rows = buildLayoutList([S("D100", "", 5)], []);
    expect(rows[1].label).toBe("D100 · 5개");
  });
});

describe("addPendingDept · prunePending", () => {
  it("새 부서는 저장 전 목록 끝에 더한다", () => {
    expect(addPendingDept([], [], DEPT("D100", "생산팀"))).toEqual([{ layoutKey: "D100", deptNm: "생산팀" }]);
  });

  it("이미 배치가 있는 부서·이미 고른 부서·전사 키는 더하지 않는다(같은 참조를 돌려준다)", () => {
    const pending = [{ layoutKey: "D100", deptNm: "생산팀" }];
    expect(addPendingDept(pending, [], DEPT("D100", "생산팀"))).toBe(pending);
    expect(addPendingDept([], [S("D200", "품질팀", 2)], DEPT("D200", "품질팀"))).toEqual([]);
    expect(addPendingDept([], [], DEPT("*", "전사"))).toEqual([]);
    expect(addPendingDept([], [], DEPT("", "이름만"))).toEqual([]);
  });

  it("목록을 새로 받아 서버에 생긴 부서는 저장 전 목록에서 뺀다 — 나중에 지워져도 되살아나지 않게", () => {
    const pending = [
      { layoutKey: "D100", deptNm: "생산팀" },
      { layoutKey: "D300", deptNm: "설비팀" },
    ];
    expect(prunePending(pending, [S("D100", "생산팀", 4)])).toEqual([{ layoutKey: "D300", deptNm: "설비팀" }]);
  });
});

describe("pageDeptLookupRows — 부서 검색 팝업 한 페이지", () => {
  const depts = [DEPT("D1", "가"), DEPT("D2", "나"), DEPT("D3", "다")];

  it("부서코드·부서명을 code·name 으로 바꾸고 전체 건수를 알린다", () => {
    expect(pageDeptLookupRows(depts, 0, 2)).toEqual({
      rows: [
        { code: "D1", name: "가" },
        { code: "D2", name: "나" },
      ],
      totalElements: 3,
    });
  });

  it("다음 페이지·범위를 넘은 페이지·빈 목록", () => {
    expect(pageDeptLookupRows(depts, 1, 2).rows).toEqual([{ code: "D3", name: "다" }]);
    expect(pageDeptLookupRows(depts, 5, 2)).toEqual({ rows: [], totalElements: 3 });
    expect(pageDeptLookupRows([], 0, 10)).toEqual({ rows: [], totalElements: 0 });
  });
});

describe("표시 이름·제목·안내 문구", () => {
  const rows = buildLayoutList([S("D100", "생산팀", 5)], []);

  it("layoutDisplayName — 전사 / 부서명 / 목록에 없으면 코드", () => {
    expect(layoutDisplayName("*", rows)).toBe("전사");
    expect(layoutDisplayName("D100", rows)).toBe("생산팀");
    expect(layoutDisplayName("D999", rows)).toBe("D999");
  });

  it("boardTitle — 「전사 기본 배치」·「{부서명} 기본 배치」", () => {
    expect(boardTitle("*", rows)).toBe("전사 기본 배치");
    expect(boardTitle("D100", rows)).toBe("생산팀 기본 배치");
  });

  it("inheritNotice — 물려받은 배치(sourceKey ≠ layoutKey)일 때만", () => {
    const withParent = buildLayoutList([S("D10", "생산본부", 8)], []);
    expect(inheritNotice("D100", "D10", withParent)).toBe(
      "생산본부 배치를 물려받아 보이는 중입니다. 저장하면 이 부서 배치가 생깁니다"
    );
    expect(inheritNotice("D100", COMPANY_LAYOUT_KEY, withParent)).toBe(
      "전사 배치를 물려받아 보이는 중입니다. 저장하면 이 부서 배치가 생깁니다"
    );
    expect(inheritNotice("D100", "D100", withParent)).toBeNull();
    expect(inheritNotice("D100", null, withParent)).toBeNull();
    expect(inheritNotice("*", "*", withParent)).toBeNull();
  });

  it("deleteConfirmMessage — 지우면 어떤 배치가 적용되는지 알린다", () => {
    expect(deleteConfirmMessage("*", rows)).toBe("전사 기본 배치를 삭제하시겠습니까? 삭제하면 코드 기본값이 적용됩니다.");
    expect(deleteConfirmMessage("D100", rows)).toBe(
      "생산팀 기본 배치를 삭제하시겠습니까? 삭제하면 상위 부서 또는 전사 배치가 적용됩니다."
    );
  });

  it("buildTypeTitles — 유형 등록부에서 ID → 이름", () => {
    expect(
      buildTypeTitles({
        "query-table": { meta: { title: "쿼리 표" } },
        markdown: { meta: { title: "글(md)" } },
      })
    ).toEqual({ "query-table": "쿼리 표", markdown: "글(md)" });
    expect(buildTypeTitles({})).toEqual({});
  });
});

describe("서버 줄 ↔ 위젯 항목", () => {
  it("layoutItemsFromRows — 문자열 숫자를 바꾸고 lockYn Y → locked, config 는 null", () => {
    expect(
      layoutItemsFromRows([
        { instId: "default-kpi", widgetId: "home.kpi", posX: "0", posY: 0, sizeW: "24", sizeH: 7, lockYn: "Y" },
        { instId: "i2", widgetId: "home.notice", posX: 0, posY: 7, sizeW: 10, sizeH: 16, lockYn: "N" },
      ])
    ).toEqual([
      { instId: "default-kpi", widgetId: "home.kpi", x: 0, y: 0, w: 24, h: 7, locked: true, config: null },
      { instId: "i2", widgetId: "home.notice", x: 0, y: 7, w: 10, h: 16, locked: false, config: null },
    ]);
  });

  it("layoutItemsFromRows — instId·widgetId 가 빈 줄과 객체가 아닌 줄은 건너뛴다", () => {
    const out = layoutItemsFromRows([
      { instId: "", widgetId: "home.kpi", posX: 0, posY: 0, sizeW: 4, sizeH: 4 },
      { instId: "a", widgetId: "", posX: 0, posY: 0, sizeW: 4, sizeH: 4 },
      { widgetId: "home.kpi" },
      null,
      "x",
      { instId: "ok", widgetId: "home.kpi", posX: 1, posY: 2, sizeW: 3, sizeH: 4 },
    ]);
    expect(out.map((i) => i.instId)).toEqual(["ok"]);
  });

  it("layoutItemsFromRows — 좌표·크기가 숫자가 아니면 NaN 대신 0", () => {
    const [it] = layoutItemsFromRows([{ instId: "a", widgetId: "home.kpi", posX: "abc", posY: null, sizeW: undefined, sizeH: "" }]);
    expect(it).toMatchObject({ x: 0, y: 0, w: 0, h: 0 });
    expect(Object.values(it).some((v) => typeof v === "number" && Number.isNaN(v))).toBe(false);
  });

  it("layoutItemsFromRows — 배열이 아니면 빈 배열", () => {
    expect(layoutItemsFromRows(undefined)).toEqual([]);
    expect(layoutItemsFromRows(null)).toEqual([]);
  });

  it("layoutItemsToRows — 서버가 받는 모양(posX·sizeW·lockYn)으로, config 는 보내지 않는다", () => {
    expect(
      layoutItemsToRows([{ instId: "a", widgetId: "home.kpi", x: 1, y: 2, w: 3, h: 4, locked: true, config: { a: 1 } }])
    ).toEqual([{ instId: "a", widgetId: "home.kpi", posX: 1, posY: 2, sizeW: 3, sizeH: 4, lockYn: "Y" }]);
    expect(
      layoutItemsToRows([{ instId: "b", widgetId: "home.kpi", x: 0, y: 0, w: 4, h: 6, locked: false, config: null }])[0].lockYn
    ).toBe("N");
  });
});

describe("tabsFromLayout — loadLayout 결과 → WidgetStore.load 결과", () => {
  const item = { instId: "a", widgetId: "home.kpi", x: 0, y: 0, w: 24, h: 7, locked: false, config: null };

  it("items 가 있으면 「홈」 탭 하나", () => {
    const layout: LoadedLayout = { layoutKey: "*", sourceKey: "*", items: [item] };
    expect(tabsFromLayout(layout)).toEqual([{ tabId: "home", name: "홈", seq: 0, locked: false, items: [item] }]);
  });

  it("items 가 없으면 빈 배열 — WidgetWorkspace 가 코드 기본 배치를 쓴다", () => {
    expect(tabsFromLayout({ layoutKey: "*", sourceKey: null, items: [] })).toEqual([]);
  });

  it("상속 배치(sourceKey ≠ layoutKey)도 항목이 있으면 홈 탭으로 보인다", () => {
    const layout: LoadedLayout = { layoutKey: "D100", sourceKey: "*", items: [item] };
    expect(tabsFromLayout(layout)).toHaveLength(1);
    expect(tabsFromLayout(layout)[0].tabId).toBe("home");
  });
});
