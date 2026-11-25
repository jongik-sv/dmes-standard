// 기준정보관리(qdb) 순수 함수 시험 — 마스터코드 묶음 목록·항목 열, 칼라부재료 읽기·견본, 칼라BOM 묶기·도막 합계·단면 배치.
// 데이터는 실제 Maru 항목(live-codes.json — MDM 8096 의 RELEASED 1.000 을 qcdRule/codes 응답 모양으로 옮긴 것)이다.
import { describe, expect, it } from "vitest";

import { CATALOG, type CodeSet } from "@/common/rule";
import {
  bomsOf,
  filterBoms,
  prdLabel,
  prdNamesOf,
  prdOptions,
  umText,
  usagesOf,
  BOM_ATTR,
  EMPTY_BOM_FILTER,
} from "@/qdb/common/bom";
import {
  EMPTY_SUBMAT_FILTER,
  SUBMAT_ATTR,
  SUBMAT_KINDS,
  distinctOptions,
  filterSubmats,
  kindCounts,
  parseRange,
  submatsOf,
  swatchOf,
} from "@/qdb/common/color";
import { STACK, stackLayout } from "@/qdb/colorBom/stack";
import {
  CATEGORIES,
  EMPTY_GROUP_FILTER,
  categoryOf,
  categoryOptions,
  groupRows,
  itemColumnSpec,
  itemColumns,
  itemRows,
  usedByScreens,
} from "@/qdb/masterCode/groups";

import live from "./live-codes.json";

const CODES = live.codes as CodeSet[];
const codeSet = (id: string) => CODES.find((c) => c.codeId === id)!;

describe("catalog 계약", () => {
  it("칼라부재료 속성 칸 번호가 catalog 라벨과 맞는다", () => {
    const names = CATALOG.CODES.QC_COLOR_SUBMAT.attrNames!;
    expect(names[SUBMAT_ATTR.kind]).toBe("구분");
    expect(names[SUBMAT_ATTR.resin]).toBe("수지계");
    expect(names[SUBMAT_ATTR.maker]).toBe("제조사");
    expect(names[SUBMAT_ATTR.colorCode]).toBe("색상코드");
    expect(names[SUBMAT_ATTR.colorName]).toBe("색상명");
    expect(names[SUBMAT_ATTR.thicknessUm]).toBe("건조도막두께(㎛)");
    expect(names[SUBMAT_ATTR.gloss]).toBe("광택(GU)");
    expect(names[SUBMAT_ATTR.pmt]).toBe("PMT(℃)");
  });

  it("칼라BOM 속성 칸 번호가 catalog 라벨과 맞는다", () => {
    const names = CATALOG.CODES.QC_COLOR_BOM.attrNames!;
    expect(names[BOM_ATTR.bomName]).toBe("BOM 이름");
    expect(names[BOM_ATTR.prdCode]).toBe("적용 품명");
    expect(names[BOM_ATTR.layerName]).toBe("층");
    expect(names[BOM_ATTR.submatCode]).toBe("부재료코드");
    expect(names[BOM_ATTR.submatName]).toBe("부재료명");
    expect(names[BOM_ATTR.thicknessUm]).toBe("도막두께(㎛)");
    expect(names[BOM_ATTR.colorName]).toBe("색상명");
    expect(names[BOM_ATTR.colorCode]).toBe("색상코드");
    expect(CATALOG.CODES.QC_COLOR_BOM.lvlNames).toEqual(["BOM 번호"]);
  });

  it("마스터코드 화면의 코드 묶음은 모두 분류에 든다(「기타」 없음)", () => {
    for (const id of CATALOG.SCREEN_CODES.masterCode)
      expect(categoryOf(id).key, id).not.toBe("other");
    const defined = CATEGORIES.flatMap((c) => c.codeIds);
    expect(new Set(defined).size).toBe(defined.length);
  });
});

describe("마스터코드 묶음 목록", () => {
  const ids = CATALOG.SCREEN_CODES.masterCode;

  it("화면의 코드 묶음을 순서대로 모두 행으로 두고, 응답에 없는 묶음은 항목 0·버전 없음", () => {
    const rows = groupRows(ids, CODES, EMPTY_GROUP_FILTER);
    expect(rows.map((r) => r.codeId)).toEqual(ids);
    const prd = rows.find((r) => r.codeId === "QC_PRD_NM_CD")!;
    expect(prd).toMatchObject({
      title: "품명코드",
      category: "AS-IS 마스터코드",
      ver: "1.000",
      itemCount: 28,
      matchCount: null,
    });
    expect(prd.usedBy).toContain("폭수축량관리");
    expect(prd.usedBy).not.toContain("마스터코드");
    const spec = rows.find((r) => r.codeId === "QC_SPEC_STATUS")!;
    expect(spec).toMatchObject({ ver: null, itemCount: 0 });
  });

  it("분류로 거른다", () => {
    const rows = groupRows(ids, CODES, { category: "asis", keyword: "" });
    expect(rows.map((r) => r.codeId)).toEqual(CATEGORIES[0].codeIds);
    expect(categoryOptions(ids).map((o) => o.label)).toEqual([
      "전체",
      ...CATEGORIES.map((c) => c.label),
    ]);
  });

  it("통합 검색은 항목 코드·이름·속성까지 보고, 맞은 항목 수를 센다", () => {
    const rows = groupRows(ids, CODES, { category: "", keyword: "ccgi" });
    expect(rows.map((r) => r.codeId)).toEqual(["QC_PRD_NM_CD"]);
    expect(rows[0].matchCount).toBe(1);
    // 머리(이름)만 맞아도 남는다 — 항목이 없어도.
    const byTitle = groupRows(ids, CODES, {
      category: "",
      keyword: "Tag 상태",
    });
    expect(byTitle.map((r) => r.codeId)).toEqual(["QC_TAG_STATUS"]);
    expect(byTitle[0].matchCount).toBe(0);
    // 속성 값(카테고리명)으로도 찾는다.
    const byAttr = groupRows(ids, CODES, {
      category: "asis",
      keyword: "SZ0000",
    });
    expect(byAttr.map((r) => r.codeId)).toEqual(["QC_PRD_NM_CD"]);
    expect(byAttr[0].matchCount).toBe(28);
  });

  it("마스터코드를 쓰는 화면 목록은 catalog SCREEN_CODES 에서 뒤집어 만든다", () => {
    expect(usedByScreens("QC_USE_YN")).toEqual([]);
    expect(usedByScreens("QC_COLOR_BOM")).toEqual([
      "폭마진량관리",
      "칼라BOM관리",
      "품질설계결과",
    ]);
  });
});

describe("마스터코드 항목 열", () => {
  it("catalog 라벨이 있는 칸만, 라벨 없는 묶음은 속성 열이 없다", () => {
    const yn = itemColumnSpec("QC_USE_YN", codeSet("QC_USE_YN").items);
    expect(yn).toEqual({ hasAlter: false, lvls: [], attrs: [] });
    const prd = itemColumnSpec("QC_PRD_NM_CD", codeSet("QC_PRD_NM_CD").items);
    expect(prd.attrs).toEqual(["카테고리 ID", "카테고리명"]);
    const grp = itemColumnSpec(
      "QC_FEAS_MATL_GRP",
      codeSet("QC_FEAS_MATL_GRP").items,
    );
    expect(grp.lvls).toEqual(["시트"]);
    expect(grp.attrs).toHaveLength(7);
    expect(itemColumns(grp).map((c) => c.key)).toEqual([
      "seq",
      "code",
      "name",
      "lvl0",
      ...grp.attrs.map((_, i) => `attr${i}`),
    ]);
  });

  it("라벨이 없는데 값이 든 칸은 「속성 n」 으로 보인다", () => {
    const items = [
      {
        code: "A",
        name: "a",
        alterName: "에이",
        seq: 1,
        lvl: [],
        attrs: [null, "x"],
      },
    ];
    expect(itemColumnSpec("QC_NOPE", items)).toEqual({
      hasAlter: true,
      lvls: [],
      attrs: ["속성 1", "속성 2"],
    });
    expect(itemRows(items)[0]).toMatchObject({
      code: "A",
      attr0: "",
      attr1: "x",
    });
  });
});

describe("칼라부재료", () => {
  const subs = submatsOf(CODES);

  it("실제 16건을 구분 순(프라이머·상도·백코트·보호필름)으로 읽는다", () => {
    expect(subs).toHaveLength(16);
    expect([...new Set(subs.map((s) => s.kind))]).toEqual([...SUBMAT_KINDS]);
    expect(kindCounts(subs, EMPTY_SUBMAT_FILTER)).toEqual({
      "": 16,
      프라이머: 3,
      상도: 8,
      백코트: 3,
      보호필름: 2,
    });
  });

  it("속성 — RAL·도막·광택·PMT, 빈 칸(null)은 빈 글·null", () => {
    const tc = subs.find((s) => s.code === "TC-PE-9002")!;
    expect(tc).toMatchObject({
      kind: "상도",
      resin: "Polyester",
      maker: "도료사 A",
      colorCode: "RAL9002",
      colorName: "회백색",
      thicknessUm: 15,
      gloss: 30,
      pmtRange: { min: 224, max: 232 },
    });
    const pm = subs.find((s) => s.code === "PM-EP05")!;
    expect(pm).toMatchObject({ colorCode: "", gloss: null, thicknessUm: 5 });
    const pf = subs.find((s) => s.code === "PF-PE50")!;
    expect(pf).toMatchObject({ pmt: "", pmtRange: null, thicknessUm: 50 });
  });

  it("거르기 — 구분 막대 숫자는 구분을 뺀 조건으로 센다", () => {
    const f = { ...EMPTY_SUBMAT_FILTER, resin: "Polyester" };
    expect(filterSubmats(subs, f).map((s) => s.code)).toEqual([
      "PM-PE07",
      "TC-PE-9002",
      "TC-PE-7035",
      "TC-PE-5015",
      "TC-PE-9010",
      "TC-PE-6005",
      "BC-PE-WH07",
      "BC-PE-WH12",
    ]);
    expect(kindCounts(subs, { ...f, kind: "상도" })).toMatchObject({
      "": 8,
      프라이머: 1,
      상도: 5,
      백코트: 2,
      보호필름: 0,
    });
    expect(
      filterSubmats(subs, { ...EMPTY_SUBMAT_FILTER, keyword: "ral70" }).map(
        (s) => s.code,
      ),
    ).toEqual(["TC-PE-7035", "TC-HDP-7016"]);
    expect(
      distinctOptions(subs.map((s) => s.maker)).map((o) => o.value),
    ).toEqual(["", "도료사 A", "도료사 B", "도료사 C", "필름사 A"]);
  });

  it("견본 — RAL 은 근사색, 없으면 색상명, 「투명」 은 반투명", () => {
    for (const s of subs.filter((x) => x.colorCode))
      expect(swatchOf(s.colorCode, s.colorName).source, s.code).toBe("ral");
    for (const s of subs)
      expect(swatchOf(s.colorCode, s.colorName).source, s.code).not.toBe(
        "none",
      );
    expect(swatchOf("", "황색 투명")).toMatchObject({
      source: "name",
      translucent: true,
    });
    expect(swatchOf("ral 9002", "")).toMatchObject({
      source: "ral",
      color: "#E7EBDA",
    });
    expect(swatchOf("", "")).toMatchObject({
      source: "none",
      color: "transparent",
    });
  });

  it("PMT 범위 글", () => {
    expect(parseRange("216~224")).toEqual({ min: 216, max: 224 });
    expect(parseRange("230")).toEqual({ min: 230, max: 230 });
    expect(parseRange("약 220")).toBeNull();
  });
});

describe("칼라BOM", () => {
  const boms = bomsOf(CODES);
  const bom = (no: string) => boms.find((b) => b.bomNo === no)!;

  it("실제 33항목을 BOM 10개로 묶고, 층을 단면 순서로 둔다", () => {
    expect(boms.map((b) => b.bomNo)).toEqual([
      "S00001",
      "A60041",
      "CB7-0001",
      "VL0001",
      "VP0001",
      "VG001A",
      "VT002A",
      "US004L",
      "UT0C6S",
      "K9060L",
    ]);
    expect(bom("S00001").layers.map((l) => l.layerCode)).toEqual([
      "FT",
      "FP",
      "BC",
    ]);
    expect(bom("VL0001").layers.map((l) => l.layerCode)).toEqual([
      "PF",
      "FT",
      "FP",
      "BC",
    ]);
    // BOM 번호에 「-」 가 든 경우(CB7-0001-FP)도 층코드를 바르게 뗀다.
    expect(bom("CB7-0001").layers.map((l) => l.layerCode)).toEqual([
      "FT",
      "FP",
      "BC",
    ]);
    for (const b of boms) {
      expect(b.missingSubmats, b.bomNo).toEqual([]);
      expect(b.unknownThickness, b.bomNo).toEqual([]);
      expect(
        b.layers.some((l) => l.thicknessDiffers),
        b.bomNo,
      ).toBe(false);
    }
  });

  it("도막 합계는 전면 + 후면, 보호필름은 따로", () => {
    expect(bom("S00001")).toMatchObject({
      frontUm: 20,
      backUm: 7,
      coatUm: 27,
      filmUm: 0,
      hasFilm: false,
    });
    expect(bom("VL0001")).toMatchObject({
      frontUm: 23,
      backUm: 12,
      coatUm: 35,
      filmUm: 50,
      hasFilm: true,
    });
    expect(bom("VT002A")).toMatchObject({ coatUm: 37, filmUm: 60 });
    expect(bom("VL0001").topCoat?.colorCode).toBe("RAL9010");
    expect(bom("VL0001").layers[1].submat?.gloss).toBe(70);
    expect(umText(bom("VL0001").coatUm)).toBe("35 ㎛");
  });

  it("품명 이름·선택지, 거르기", () => {
    const names = prdNamesOf(CODES);
    expect(prdLabel("3", names)).toBe("3 · CCGI");
    expect(prdLabel("Q", names)).toBe("Q");
    expect(prdOptions(boms, names).map((o) => o.label)).toEqual([
      "전체",
      "3 · CCGI",
      "4 · CCLI",
      "7 · CCUS",
    ]);
    const f = EMPTY_BOM_FILTER;
    expect(filterBoms(boms, { ...f, film: "Y" }).map((b) => b.bomNo)).toEqual([
      "VL0001",
      "VT002A",
      "K9060L",
    ]);
    expect(filterBoms(boms, { ...f, film: "N" })).toHaveLength(7);
    expect(filterBoms(boms, { ...f, prd: "4" }).map((b) => b.bomNo)).toEqual([
      "VL0001",
      "VG001A",
      "VT002A",
      "K9060L",
    ]);
    expect(
      filterBoms(boms, { ...f, keyword: "ral7016" }).map((b) => b.bomNo),
    ).toEqual(["VG001A"]);
  });

  it("부재료 사용처 — 칼라부재료관리 「사용 BOM」", () => {
    expect(usagesOf(boms, "BC-EP-GR07").map((u) => u.bomNo)).toEqual([
      "S00001",
      "A60041",
      "VP0001",
      "VG001A",
      "US004L",
      "UT0C6S",
    ]);
    expect(usagesOf(boms, "PF-PE60BW")).toEqual([
      {
        bomNo: "VT002A",
        bomName: "외장 PVDF 메탈릭",
        layerName: "보호필름",
        thicknessUm: 60,
      },
    ]);
  });

  it("기준에 없는 부재료·기준과 다른 도막·모르는 층코드", () => {
    const base = codeSet("QC_COLOR_BOM").items[0];
    const items = [
      {
        ...base,
        code: "X1-FT",
        lvl: ["X1"],
        attrs: ["시험", "3", "전면 상도", "TC-PE-9002", "", "18", "", ""],
      },
      {
        ...base,
        code: "X1-FM",
        lvl: ["X1"],
        attrs: ["시험", "3", "전면 중도", "NOPE", "없는 도료", "", "", ""],
      },
      {
        ...base,
        code: "X1-BM",
        lvl: ["X1"],
        attrs: ["시험", "3", "후면 중도", "BC-PE-WH07", "", "", "", ""],
      },
    ];
    const [x] = bomsOf([
      codeSet("QC_COLOR_SUBMAT"),
      { codeId: "QC_COLOR_BOM", ver: "1", items },
    ]);
    expect(x.layers.map((l) => l.layerCode)).toEqual(["FT", "FM", "BM"]);
    expect(x.layers[0]).toMatchObject({
      thicknessUm: 18,
      stdThicknessUm: 15,
      thicknessDiffers: true,
      colorCode: "RAL9002",
    });
    expect(x.missingSubmats).toEqual(["NOPE"]);
    expect(x.unknownThickness).toEqual(["FM"]);
    // 두께가 비면 부재료 기준값을 쓴다.
    expect(x.layers[2]).toMatchObject({
      side: "back",
      thicknessUm: 7,
      bomThicknessUm: null,
    });
    expect(x).toMatchObject({ frontUm: 18, backUm: 7, coatUm: 25 });
  });
});

describe("도장 단면 배치", () => {
  const boms = bomsOf(CODES);

  it("보호필름 · 전면 상도 · 전면 프라이머 · 강판 · 후면 백코트 순서", () => {
    const vl = boms.find((b) => b.bomNo === "VL0001")!;
    const lay = stackLayout(vl);
    expect(lay.bands.map((b) => b.key)).toEqual([
      "VL0001-PF",
      "VL0001-FT",
      "VL0001-FP",
      "steel",
      "VL0001-BC",
    ]);
    expect(lay.braces).toEqual([
      expect.objectContaining({ side: "front", text: "전면 23 ㎛" }),
      expect.objectContaining({ side: "back", text: "후면 12 ㎛" }),
    ]);
    expect(lay.summary).toContain("도막 합계 35 ㎛");
    expect(lay.summary).toContain("보호필름 50 ㎛(별도)");
  });

  it("층은 겹치지 않고 이어지며, 글은 간격을 지키고 그림 안에 든다", () => {
    for (const b of boms) {
      const lay = stackLayout(b);
      for (let i = 1; i < lay.bands.length; i++) {
        const prev = lay.bands[i - 1];
        const cur = lay.bands[i];
        expect(cur.y).toBe(prev.y + prev.height);
        expect(cur.labelY - prev.labelY).toBeGreaterThanOrEqual(STACK.labelGap);
      }
      const last = lay.bands[lay.bands.length - 1];
      expect(lay.height).toBeGreaterThan(
        Math.max(last.y + last.height, last.labelY + 14),
      );
      for (const band of lay.bands)
        expect(band.height).toBeGreaterThanOrEqual(22);
    }
  });
});
