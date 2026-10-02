import { describe, expect, it, vi } from "vitest";

import { mergeWidgetRegistry, toWidgetDefRow } from "../../src/widget/widget-registry";
import type {
  WidgetDefRow,
  WidgetMeta,
  WidgetProps,
  WidgetRegistry,
  WidgetTypeRegistry,
} from "../../src/widget/types";

const meta = (id: string, extra: Partial<WidgetMeta> = {}): WidgetMeta => ({
  id,
  title: `코드 ${id}`,
  defaultSize: { w: 6, h: 6 },
  ...extra,
});
const codeLoad = async () => ({ default: () => null });
const CODE: WidgetRegistry = {
  "home.a": { meta: meta("home.a", { minSize: { w: 4, h: 4 }, refreshSec: 60 }), load: codeLoad },
  "home.b": { meta: meta("home.b"), load: codeLoad },
};

const renderer = vi.fn((props: WidgetProps) => props.definition as never);
const TYPES: WidgetTypeRegistry = {
  "query-table": {
    meta: { id: "query-table", title: "쿼리 표", defaultSize: { w: 12, h: 12 }, minSize: { w: 6, h: 6 }, bodyPadding: false, initialConfig: { sql: "" } },
    loadRenderer: async () => ({ default: renderer }),
    loadEditor: async () => ({ default: () => null }),
  },
};

const row = (extra: Partial<WidgetDefRow>): WidgetDefRow => ({
  widgetId: "home.a",
  srcTp: "C",
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
  ...extra,
});

describe("mergeWidgetRegistry", () => {
  it("DB 행이 없으면 코드 등록부의 entry 객체를 그대로 돌려준다(지연 로딩 캐시 유지)", () => {
    const out = mergeWidgetRegistry(CODE, TYPES, []);
    expect(out["home.a"]).toBe(CODE["home.a"]);
    expect(out["home.b"]).toBe(CODE["home.b"]);
  });

  it("코드 위젯 덮어쓰기: 비어 있지 않은 칸만 덮고 나머지는 코드 값", () => {
    const out = mergeWidgetRegistry(CODE, TYPES, [row({ title: "새 이름", defW: 10, refreshSec: null })]);
    const m = out["home.a"].meta;
    expect(m.title).toBe("새 이름");
    expect(m.defaultSize).toEqual({ w: 10, h: 6 });
    expect(m.minSize).toEqual({ w: 4, h: 4 });
    expect(m.refreshSec).toBe(60);
    expect(m.kind).toBe("code");
    expect(m.disabled).toBe(false);
    expect(out["home.a"].load).toBe(CODE["home.a"].load);
    expect(out["home.b"]).toBe(CODE["home.b"]);
  });

  it("코드 위젯 사용 중지: 등록부에 남고 disabled", () => {
    const out = mergeWidgetRegistry(CODE, TYPES, [row({ useYn: "N" })]);
    expect(out["home.a"].meta.disabled).toBe(true);
  });

  it("코드에서 사라진 위젯의 덮어쓰기 행은 무시한다", () => {
    const out = mergeWidgetRegistry(CODE, TYPES, [row({ widgetId: "home.gone", title: "x" })]);
    expect(out["home.gone"]).toBeUndefined();
  });

  it("정의 위젯: 행 값 + 유형 기본값, 본체는 definition 을 받는다", async () => {
    const def = row({ widgetId: "def.k3x9q2ab", srcTp: "D", typeId: "query-table", title: "월별 불량", config: { sql: "SELECT 1" } });
    const out = mergeWidgetRegistry(CODE, TYPES, [def]);
    const e = out["def.k3x9q2ab"];
    expect(e.meta).toMatchObject({
      id: "def.k3x9q2ab",
      title: "월별 불량",
      defaultSize: { w: 12, h: 12 },
      minSize: { w: 6, h: 6 },
      bodyPadding: false,
      kind: "def",
      typeId: "query-table",
      multiple: true,
      disabled: false,
    });
    const mod = await e.load();
    const Body = mod.default as (p: WidgetProps) => unknown;
    const el = Body({ instanceId: "i1", size: { w: 12, h: 12 }, config: null, refreshKey: 0, definition: null, widgetId: "def.k3x9q2ab" }) as {
      props: WidgetProps;
    };
    expect(el.props.definition).toEqual({ sql: "SELECT 1" });
    expect(el.props.instanceId).toBe("i1");
  });

  it("유형이 없는 정의 위젯은 건너뛴다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = mergeWidgetRegistry(CODE, TYPES, [row({ widgetId: "def.zz", srcTp: "D", typeId: "nope", title: "x" })]);
    expect(out["def.zz"]).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("사용 중지 정의 위젯은 disabled 로 남는다", () => {
    const out = mergeWidgetRegistry(CODE, TYPES, [row({ widgetId: "def.off", srcTp: "D", typeId: "query-table", title: "x", useYn: "N" })]);
    expect(out["def.off"].meta.disabled).toBe(true);
  });
});

describe("toWidgetDefRow", () => {
  it("서버 행의 configJson 문자열과 숫자 문자열을 바꾼다", () => {
    const r = toWidgetDefRow({ widgetId: "def.a1", srcTp: "D", typeId: "markdown", title: "안내", defW: "8", defH: 10, useYn: "Y", configJson: '{"markdown":"# hi"}' });
    expect(r).toMatchObject({ widgetId: "def.a1", srcTp: "D", defW: 8, defH: 10, minW: null, config: { markdown: "# hi" }, multipleYn: null });
  });

  it("깨진 configJson 은 null, srcTp 가 이상하면 null", () => {
    expect(toWidgetDefRow({ widgetId: "def.a1", srcTp: "D", configJson: "{" })?.config).toBeNull();
    expect(toWidgetDefRow({ widgetId: "def.a1", srcTp: "X" })).toBeNull();
  });
});
