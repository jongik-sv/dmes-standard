import { describe, expect, it } from "vitest";

import type { WidgetDefRow, WidgetRegistry, WidgetTypeRegistry } from "@dk-oasis/shared/widget";

import {
  buildAdminRows,
  codeForm,
  filterAdminRows,
  formToRow,
  isFormDirty,
  newDefForm,
  previewBox,
  rowToForm,
  stripScreenOnlyKeys,
  toSaveParams,
  validateDefForm,
} from "./form-model";
import type { DefForm } from "./types";

const load = async () => ({ default: () => null });

const CODE: WidgetRegistry = {
  "home.notice": { meta: { id: "home.notice", title: "공지", defaultSize: { w: 8, h: 10 } }, load },
  "home.kpi": { meta: { id: "home.kpi", title: "주요 지표", defaultSize: { w: 24, h: 7 } }, load },
};

const TYPES: WidgetTypeRegistry = {
  "query-table": {
    meta: {
      id: "query-table",
      title: "쿼리 표",
      description: "SQL 결과를 표로",
      defaultSize: { w: 12, h: 12 },
      minSize: { w: 4, h: 4 },
      initialConfig: { sql: "", columns: [] },
    },
    loadRenderer: load,
    loadEditor: load,
  },
  markdown: {
    meta: { id: "markdown", title: "글(md)", defaultSize: { w: 8, h: 10 }, initialConfig: { markdown: "" } },
    loadRenderer: load,
    loadEditor: load,
  },
};

function defRow(p: Partial<WidgetDefRow> & Pick<WidgetDefRow, "widgetId" | "srcTp">): WidgetDefRow {
  return {
    typeId: null,
    title: null,
    subtitle: null,
    description: null,
    defW: null,
    defH: null,
    minW: null,
    minH: null,
    maxW: null,
    maxH: null,
    refreshSec: null,
    linkPageId: null,
    multipleYn: null,
    useYn: "Y",
    dataSrc: null,
    config: null,
    ...p,
  };
}

function dForm(p: Partial<DefForm> = {}): DefForm {
  return { ...newDefForm(TYPES.markdown.meta), ...p };
}

describe("buildAdminRows", () => {
  it("DB 행이 없는 코드 위젯도 코드 메타 그대로 전부 보인다", () => {
    const rows = buildAdminRows(CODE, TYPES, [], {});
    expect(rows.map((r) => r.widgetId)).toEqual(["home.kpi", "home.notice"]);
    const notice = rows.find((r) => r.widgetId === "home.notice")!;
    expect(notice).toMatchObject({
      title: "공지",
      kind: "코드",
      typeId: null,
      typeTitle: "",
      unknownType: false,
      useYn: "Y",
      defaultSize: "8×10",
      userCount: 0,
      overridden: false,
    });
    expect(notice.def).toBeUndefined();
  });

  it("덮어쓴 코드 위젯은 덮어쓴 이름·크기와 덮어씀 표시, def 행을 갖는다", () => {
    const c = defRow({ widgetId: "home.notice", srcTp: "C", title: "사내 공지", defW: 12 });
    const rows = buildAdminRows(CODE, TYPES, [c], {});
    const notice = rows.find((r) => r.widgetId === "home.notice")!;
    expect(notice).toMatchObject({ title: "사내 공지", defaultSize: "12×10", overridden: true });
    expect(notice.def).toBe(c);
  });

  it("사용 중지 — 코드 덮어쓰기·정의 모두 useYn N 을 그대로 보인다", () => {
    const rows = buildAdminRows(
      CODE,
      TYPES,
      [
        defRow({ widgetId: "home.kpi", srcTp: "C", useYn: "N" }),
        defRow({ widgetId: "def.a1234567", srcTp: "D", typeId: "markdown", title: "안내", useYn: "N" }),
      ],
      {}
    );
    expect(rows.find((r) => r.widgetId === "home.kpi")!.useYn).toBe("N");
    expect(rows.find((r) => r.widgetId === "def.a1234567")!.useYn).toBe("N");
  });

  it("정의 위젯은 코드 위젯 뒤에 유형 이름·기본 크기(행 > 유형)로 보인다", () => {
    const rows = buildAdminRows(
      CODE,
      TYPES,
      [
        defRow({ widgetId: "def.b0000001", srcTp: "D", typeId: "query-table", title: "출하 현황", defH: 8 }),
        defRow({ widgetId: "def.a0000001", srcTp: "D", typeId: "markdown", title: null }),
      ],
      {}
    );
    expect(rows.map((r) => r.widgetId)).toEqual(["home.kpi", "home.notice", "def.a0000001", "def.b0000001"]);
    expect(rows[2]).toMatchObject({ title: "글(md)", kind: "정의", typeId: "markdown", typeTitle: "글(md)", defaultSize: "8×10" });
    expect(rows[3]).toMatchObject({ title: "출하 현황", typeTitle: "쿼리 표", defaultSize: "12×8", overridden: false });
  });

  it("유형이 등록부에 없는 정의 위젯도 「알 수 없는 유형」으로 보인다(지울 수 있게)", () => {
    const rows = buildAdminRows(
      CODE,
      TYPES,
      [defRow({ widgetId: "def.z0000001", srcTp: "D", typeId: "gone-type", title: "옛 위젯" })],
      {}
    );
    const r = rows.find((x) => x.widgetId === "def.z0000001")!;
    expect(r).toMatchObject({ title: "옛 위젯", typeTitle: "알 수 없는 유형", unknownType: true, defaultSize: "-" });
  });

  it("코드에서 사라진 위젯의 덮어쓰기 행은 넣지 않는다(mergeWidgetRegistry 와 같은 규칙)", () => {
    const rows = buildAdminRows(CODE, TYPES, [defRow({ widgetId: "home.gone", srcTp: "C", title: "없음" })], {});
    expect(rows.some((r) => r.widgetId === "home.gone")).toBe(false);
  });

  it("사용자 수는 usage 맵에서 — 행 없는 코드 위젯 포함, 없으면 0", () => {
    const rows = buildAdminRows(
      CODE,
      TYPES,
      [defRow({ widgetId: "def.a0000001", srcTp: "D", typeId: "markdown" })],
      { "home.notice": 5, "def.a0000001": 2 }
    );
    expect(rows.find((r) => r.widgetId === "home.notice")!.userCount).toBe(5);
    expect(rows.find((r) => r.widgetId === "home.kpi")!.userCount).toBe(0);
    expect(rows.find((r) => r.widgetId === "def.a0000001")!.userCount).toBe(2);
  });
});

describe("filterAdminRows", () => {
  const rows = buildAdminRows(
    CODE,
    TYPES,
    [
      defRow({ widgetId: "home.kpi", srcTp: "C", useYn: "N" }),
      defRow({ widgetId: "def.a0000001", srcTp: "D", typeId: "markdown", title: "생산 안내" }),
    ],
    {}
  );

  it("검색어는 이름·ID 앞뒤 공백 무시, 대소문자 무시로 찾는다", () => {
    expect(filterAdminRows(rows, { keyword: " 안내 ", kind: "", useYn: "" }).map((r) => r.widgetId)).toEqual(["def.a0000001"]);
    expect(filterAdminRows(rows, { keyword: "HOME.N", kind: "", useYn: "" }).map((r) => r.widgetId)).toEqual(["home.notice"]);
  });

  it("구분·사용 필터", () => {
    expect(filterAdminRows(rows, { keyword: "", kind: "def", useYn: "" }).map((r) => r.widgetId)).toEqual(["def.a0000001"]);
    expect(filterAdminRows(rows, { keyword: "", kind: "code", useYn: "" })).toHaveLength(2);
    expect(filterAdminRows(rows, { keyword: "", kind: "", useYn: "N" }).map((r) => r.widgetId)).toEqual(["home.kpi"]);
    expect(filterAdminRows(rows, { keyword: "", kind: "", useYn: "Y" })).toHaveLength(2);
  });
});

describe("validateDefForm", () => {
  it("정상 값은 오류가 없다", () => {
    expect(validateDefForm(dForm())).toEqual([]);
    expect(validateDefForm(codeForm("home.notice"))).toEqual([]);
  });

  it("정의 위젯은 이름 필수, 코드 위젯은 비워도 된다(코드 값)", () => {
    expect(validateDefForm(dForm({ title: "  " }))).toContain("이름을 입력하세요.");
    expect(validateDefForm({ ...codeForm("home.notice"), title: "" })).toEqual([]);
  });

  it("이름 50자 초과는 거절", () => {
    expect(validateDefForm(dForm({ title: "가".repeat(51) }))).toContain("이름은 50자 이하여야 합니다.");
    expect(validateDefForm(dForm({ title: "가".repeat(50) }))).toEqual([]);
  });

  it("정의 위젯은 유형이 있어야 한다", () => {
    expect(validateDefForm(dForm({ typeId: null }))).toContain("유형을 고르세요.");
  });

  it("크기 칸은 비우거나 1 이상 정수", () => {
    expect(validateDefForm(dForm({ defW: "0" }))).toContain("기본 너비는 1 이상 정수여야 합니다.");
    expect(validateDefForm(dForm({ minH: "1.5" }))).toContain("최소 높이는 1 이상 정수여야 합니다.");
    expect(validateDefForm(dForm({ maxW: "abc" }))).toContain("최대 너비는 1 이상 정수여야 합니다.");
    expect(validateDefForm(dForm({ defW: "", defH: "" }))).toEqual([]);
  });

  it("같은 축 MIN ≤ DEF ≤ MAX (둘 다 있을 때만)", () => {
    expect(validateDefForm(dForm({ minW: "10", defW: "8" }))).toContain("최소 너비는 기본 너비 이하여야 합니다.");
    expect(validateDefForm(dForm({ defH: "12", maxH: "10" }))).toContain("기본 높이는 최대 높이 이하여야 합니다.");
    expect(validateDefForm(dForm({ defH: "", minH: "12", maxH: "10" }))).toContain("최소 높이는 최대 높이 이하여야 합니다.");
    expect(validateDefForm(dForm({ defW: "", minW: "10" }))).toEqual([]);
  });

  it("기본 너비 25 는 거절(24칸 격자)", () => {
    expect(validateDefForm(dForm({ defW: "25" }))).toContain("기본 너비는 24 이하여야 합니다.");
    expect(validateDefForm(dForm({ defW: "24" }))).toEqual([]);
  });

  it("새로 고침 주기 10 은 거절, 30~86400 만", () => {
    const msg = "새로 고침 주기는 30~86400초여야 합니다.";
    expect(validateDefForm(dForm({ refreshSec: "10" }))).toContain(msg);
    expect(validateDefForm(dForm({ refreshSec: "86401" }))).toContain(msg);
    expect(validateDefForm(dForm({ refreshSec: "30" }))).toEqual([]);
    expect(validateDefForm(dForm({ refreshSec: "86400" }))).toEqual([]);
  });

  it("문자열 길이는 컬럼 길이 이하", () => {
    const errs = validateDefForm(dForm({ subtitle: "a".repeat(101), description: "a".repeat(401), linkPageId: "a".repeat(201) }));
    expect(errs).toContain("부제는 100자 이하여야 합니다.");
    expect(errs).toContain("설명은 400자 이하여야 합니다.");
    expect(errs).toContain("화면 열기 pageId 는 200자 이하여야 합니다.");
  });

  it("정의 설정은 200KB 이하(화면 전용 키 제외)", () => {
    expect(validateDefForm(dForm({ config: { markdown: "a".repeat(205_000) } }))).toContain(
      "유형 설정은 200KB 이하여야 합니다."
    );
    expect(validateDefForm(dForm({ config: { markdown: "", __preview: { rows: "a".repeat(205_000) } } }))).toEqual([]);
  });
});

describe("stripScreenOnlyKeys", () => {
  it("최상위 __ 키(__preview)를 지우고 나머지는 그대로", () => {
    const cfg = { sql: "select 1", __preview: { columns: ["A"], rows: [], truncated: false }, __x: 1 };
    expect(stripScreenOnlyKeys(cfg)).toEqual({ sql: "select 1" });
    expect(cfg.__preview).toBeDefined(); // 원본은 고치지 않는다
  });

  it("중첩 객체 안의 __ 키는 유지한다", () => {
    const cfg = { items: [{ __id: "a", label: "x" }], nested: { __keep: true } };
    expect(stripScreenOnlyKeys(cfg)).toEqual(cfg);
  });

  it("객체가 아니면 그대로", () => {
    expect(stripScreenOnlyKeys(null)).toBeNull();
    expect(stripScreenOnlyKeys([1, 2])).toEqual([1, 2]);
    expect(stripScreenOnlyKeys("s")).toBe("s");
  });
});

describe("폼 ↔ 행 변환", () => {
  it("빈 칸은 NULL, 숫자 칸은 숫자로", () => {
    const row = formToRow({
      ...codeForm("home.notice"),
      title: " 사내 공지 ",
      defW: "12",
      refreshSec: "60",
      multipleYn: "",
    });
    expect(row).toEqual(
      defRow({ widgetId: "home.notice", srcTp: "C", title: "사내 공지", defW: 12, refreshSec: 60 })
    );
  });

  it("코드 위젯은 typeId·dataSrc·config 를 늘 NULL 로 만든다", () => {
    const row = formToRow({ ...codeForm("home.notice"), typeId: "markdown", dataSrc: "mcm", config: { a: 1 } });
    expect(row).toMatchObject({ typeId: null, dataSrc: null, config: null });
  });

  it("행 → 폼 → 행이 같다", () => {
    const d = defRow({
      widgetId: "def.a0000001",
      srcTp: "D",
      typeId: "query-table",
      title: "출하",
      subtitle: "전일",
      description: "설명",
      defW: 12,
      defH: 8,
      minW: 4,
      minH: 4,
      maxW: 24,
      maxH: 20,
      refreshSec: 300,
      linkPageId: "mls:lsh/noticeMgmt",
      multipleYn: "N",
      useYn: "N",
      dataSrc: "mcm",
      config: { sql: "select 1" },
    });
    const form = rowToForm(d);
    expect(form).toMatchObject({ defW: "12", refreshSec: "300", multipleYn: "N", useYn: "N", title: "출하" });
    expect(formToRow(form)).toEqual(d);
  });

  it("정의 위젯의 multipleYn NULL 은 폼에서 Y(기본 허용)", () => {
    expect(rowToForm(defRow({ widgetId: "def.a0000001", srcTp: "D", typeId: "markdown" })).multipleYn).toBe("Y");
    expect(rowToForm(defRow({ widgetId: "home.notice", srcTp: "C" })).multipleYn).toBe("");
  });

  it("코드 위젯 덮어쓰기가 없으면 빈 폼(전부 코드 값)", () => {
    expect(codeForm("home.notice")).toMatchObject({
      widgetId: "home.notice",
      srcTp: "C",
      title: "",
      defW: "",
      multipleYn: "",
      useYn: "Y",
      config: null,
    });
    const c = defRow({ widgetId: "home.notice", srcTp: "C", title: "사내 공지" });
    expect(codeForm("home.notice", c).title).toBe("사내 공지");
  });
});

describe("newDefForm", () => {
  it("제목·기본 크기는 유형 값, config 는 initialConfig 깊은 복사, 사용 Y", () => {
    const form = newDefForm(TYPES.markdown.meta);
    expect(form).toMatchObject({
      widgetId: "",
      srcTp: "D",
      typeId: "markdown",
      title: "글(md)",
      defW: "8",
      defH: "10",
      minW: "",
      maxW: "",
      multipleYn: "Y",
      useYn: "Y",
      dataSrc: null,
      config: { markdown: "" },
    });
    expect(form.config).not.toBe(TYPES.markdown.meta.initialConfig);
  });

  it("쿼리 유형은 실행 모듈을 mcm 으로 둔다(서버가 mcm 만 받는다)", () => {
    const form = newDefForm(TYPES["query-table"].meta);
    expect(form.dataSrc).toBe("mcm");
    expect(formToRow(form).dataSrc).toBe("mcm");
    expect(formToRow({ ...form, dataSrc: null }).dataSrc).toBe("mcm");
  });
});

describe("toSaveParams", () => {
  it("신규 정의 위젯 — widgetId 빈 값, configJson 은 화면 전용 키를 뺀 JSON", () => {
    const form = { ...newDefForm(TYPES["query-table"].meta), config: { sql: "select 1", __preview: { rows: [] } } };
    expect(toSaveParams(form)).toEqual({
      widgetId: "",
      srcTp: "D",
      typeId: "query-table",
      title: "쿼리 표",
      subtitle: null,
      description: null,
      defW: 12,
      defH: 12,
      minW: null,
      minH: null,
      maxW: null,
      maxH: null,
      refreshSec: null,
      linkPageId: null,
      multipleYn: "Y",
      useYn: "Y",
      dataSrc: "mcm",
      configJson: '{"sql":"select 1"}',
    });
  });

  it("코드 위젯은 configJson NULL", () => {
    expect(toSaveParams({ ...codeForm("home.notice"), useYn: "N" })).toMatchObject({
      widgetId: "home.notice",
      srcTp: "C",
      typeId: null,
      dataSrc: null,
      configJson: null,
      useYn: "N",
    });
  });
});

describe("isFormDirty", () => {
  it("값이 바뀌면 true, 같으면 false, 둘 중 하나가 없으면 false", () => {
    const a = dForm();
    expect(isFormDirty(a, { ...a })).toBe(false);
    expect(isFormDirty(a, { ...a, title: "x" })).toBe(true);
    expect(isFormDirty(a, { ...a, config: { markdown: "x" } })).toBe(true);
    expect(isFormDirty(null, a)).toBe(false);
  });
});

describe("previewBox", () => {
  it("폭 = 영역 × w/24, 높이 = h×20 + (h−1)×8", () => {
    expect(previewBox(480, { w: 12, h: 10 })).toEqual({ width: 240, height: 272 });
    expect(previewBox(480, { w: 30, h: 1 })).toEqual({ width: 480, height: 20 });
    expect(previewBox(0, { w: 8, h: 6 })).toEqual({ width: 0, height: 160 });
  });
});
