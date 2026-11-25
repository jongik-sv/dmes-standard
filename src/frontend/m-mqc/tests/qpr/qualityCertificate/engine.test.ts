// 품질보증서 엔진 — 변수 바꾸기, 조항 번호(순서·끄기), 변경 분석·글자 단위 비교, 양식 선택 규칙, 찾기·바꾸기, 종이 HTML.
import { describe, expect, it } from "vitest";

import { DEF, parseDoc, type WtyDoc } from "@/qpr/qualityCertificate/engine/data";
import {
  analyze,
  clauseOf,
  docHtml,
  findHits,
  inlineDiff,
  matchRule,
  moveBlock,
  numbering,
  plainSub,
  replaceAllText,
  subHtml,
} from "@/qpr/qualityCertificate/engine/doc";

const doc = (patch: Partial<WtyDoc> = {}): WtyDoc => ({ ...DEF(), ...patch });

describe("변수 바꾸기", () => {
  it("브랜드·적용지역·기준값을 브랜드별 값으로 바꾸고, 모르는 변수는 그대로 둔다", () => {
    const d = doc();
    expect(plainSub("{{브랜드명}} {{천공보증기간}}년 {{적용지역}}", d)).toBe("LUXTEEL 10년 대한민국");
    expect(plainSub("{{ 해안거리 }}m {{없는변수}}", { ...d, brand: "UNICORE" })).toBe("1500m {{없는변수}}");
    expect(plainSub("{{적용지역}}", { ...d, lang: "en" })).toBe("the Republic of Korea");
  });

  it("값이 비면 [값 없음], 종이 HTML 은 이스케이프하고 찾는 문구를 형광펜으로 칠한다", () => {
    const d = doc();
    d.vals.PERFORATION.LUXTEEL = "";
    expect(plainSub("{{천공보증기간}}년", d)).toBe("[값 없음]년");
    const h = subHtml("<b>{{브랜드명}}</b> 천공", doc(), "천공");
    expect(h).toContain("&lt;b&gt;LUXTEEL&lt;/b&gt;");
    expect(h).toContain("<mark>천공</mark>");
  });
});

describe("조항 번호", () => {
  it("기본 순서: 도입문은 번호 없음, 1단계 1. 2. …, 2단계 가. 나. …", () => {
    const n = numbering(doc());
    expect(n.intro).toBe("");
    expect(n.scope).toBe("1.");
    expect([n.perf, n.peel, n.fade, n.chalk]).toEqual(["가.", "나.", "다.", "라."]);
    expect([n.coast, n.excl, n.trans, n.color]).toEqual(["2.", "3.", "4.", "5."]);
  });

  it("끈 조항은 null 이고 뒤 번호가 당겨지며, 순서를 바꾸면 다시 매긴다. 영문은 A. B.", () => {
    const d = doc();
    clauseOf(d, "peel")!.on = false;
    clauseOf(d, "coast")!.on = false;
    d.order = ["intro", "scope", "chalk", "perf", "peel", "fade", "excl", "coast", "trans", "color"];
    const n = numbering(d);
    expect(n.peel).toBeNull();
    expect(n.coast).toBeNull();
    expect([n.chalk, n.perf, n.fade]).toEqual(["가.", "나.", "다."]);
    expect([n.excl, n.trans, n.color]).toEqual(["2.", "3.", "4."]);
    expect(numbering({ ...d, lang: "en" }).chalk).toBe("A.");
  });
});

describe("변경 분석", () => {
  it("같은 문서면 변경이 없다", () => {
    const d = doc();
    expect(analyze(d, doc()).rows).toEqual([]);
    expect(analyze(d, null).pairs).toEqual([]);
  });

  it("문단 하나를 고치면 그 블록만 '고쳐짐'으로 짝짓고, 글자 단위로 지운·넣은 부분을 표시한다", () => {
    const base = doc();
    const d = doc();
    const b = clauseOf(d, "fade")!.b[1] as { c: { ko: string } };
    b.c.ko = b.c.ko.replace("변하지 않습니다", "넘지 않습니다");
    const an = analyze(d, base);
    expect(an.rows).toEqual([["내용 수정", "변색 — 문단 블록"]]);
    expect(an.pairs).toEqual([{ ka: "fade|1", kb: "fade|1", lb: "변색 — 문단 고쳐짐" }]);
    expect([...an.b]).toEqual(["fade|1"]);
    expect(inlineDiff("ΔE가 7 이상 변하지 않습니다.", "ΔE가 7 이상 넘지 않습니다.", "a")).toContain("<del>변하지</del>");
    expect(inlineDiff("ΔE가 7 이상 변하지 않습니다.", "ΔE가 7 이상 넘지 않습니다.", "b")).toContain("<ins>넘지</ins>");
  });

  it("중간에 블록을 끼워 넣으면 그 블록만 새로 생김, 조항 끄기·순서·기준값·레이아웃도 목록에 오른다", () => {
    const base = doc();
    const d = doc();
    clauseOf(d, "fade")!.b.splice(1, 0, { t: "text", c: { ko: "새 문단", en: "New" } });
    clauseOf(d, "trans")!.on = false;
    d.order = [...d.order.slice(0, 2), d.order[3], d.order[2], ...d.order.slice(4)];
    d.vals.COAST_DIST.APPEAL = 1200;
    d.layout.fontSize = 12;
    const an = analyze(d, base);
    expect(an.pairs.filter((p) => p.kb?.startsWith("fade|"))).toEqual([{ kb: "fade|1", ka: null, lb: "변색 — 문단 새로 생김" }]);
    const tags = an.rows.map((r) => r[0]);
    expect(tags).toEqual(expect.arrayContaining(["블록 추가", "조항 제외", "순서 변경", "기준값", "레이아웃"]));
    expect(an.rows.find((r) => r[0] === "기준값")![1]).toBe("APPEAL · 해안가 무보증 거리 1000 → 1200 m");
    expect(an.a.has("trans|0")).toBe(true);
  });

  it("비교 종이는 고친 블록에 chg 표시와 글자 단위 표시를 싣는다", () => {
    const base = doc();
    const d = doc();
    (clauseOf(d, "perf")!.b[0] as { c: { ko: string } }).c.ko += " 추가 문장.";
    const an = analyze(d, base);
    const ctx = { map: an, txa: {} as Record<string, string>, txb: {} as Record<string, string> };
    ctx.txa["perf|0|"] = plainSub((clauseOf(base, "perf")!.b[0] as { c: { ko: string } }).c.ko, base);
    ctx.txb["perf|0|"] = plainSub((clauseOf(d, "perf")!.b[0] as { c: { ko: string } }).c.ko, d);
    const html = docHtml(d, { ver: 1, diff: an.b, cmp: { side: "b", ...ctx } });
    expect(html).toMatch(/class="\s*chg"[^>]*data-c="perf"/);
    expect(html).toContain("<ins> 추가 문장.</ins>");
  });
});

describe("양식 선택 규칙", () => {
  it("우선이 작은 규칙부터 먼저 걸리는 것", () => {
    expect(matchRule({ brand: "LUXTEEL", lang: "en", grade: "PREMIUM" }).tpl).toBe("럭스틸 프리미엄 영문");
    expect(matchRule({ brand: "LUXTEEL", lang: "ko", grade: "PREMIUM" }).tpl).toBe("럭스틸 한글");
    expect(matchRule({ brand: "APPEAL", lang: "en", grade: "PREMIUM" }).tpl).toBe("표준 프리미엄 영문");
    expect(matchRule({ brand: "APPEAL", lang: "en", grade: "일반" }).tpl).toBe("표준 기본 양식");
  });
});

describe("찾기·바꾸기·블록 옮기기", () => {
  it("꺼둔 조항과 반대 언어까지 찾고, 모두 바꾸기는 바꾼 곳 수를 돌려준다", () => {
    const d = doc();
    clauseOf(d, "excl")!.on = false;
    const hits = findHits(d, "astm");
    expect(hits.map((h) => `${h.id}:${h.lg}`)).toEqual(["fade:ko", "fade:en", "chalk:ko", "chalk:en"]);
    expect(findHits(d, "천재지변")[0].id).toBe("excl");
    expect(replaceAllText(d, "ASTM", "KS")).toBe(4);
    expect(findHits(d, "ASTM")).toEqual([]);
  });

  it("블록을 놓은 자리의 위·아래 절반에 따라 옮긴다", () => {
    const arr = [1, 2, 3, 4].map((n) => ({ t: "text" as const, c: { ko: String(n), en: "" } }));
    expect(moveBlock(arr, 0, 2, false)).toBe(2);
    expect(arr.map((b) => b.c.ko)).toEqual(["2", "3", "1", "4"]);
    expect(moveBlock(arr, 3, 0, true)).toBe(0);
    expect(arr.map((b) => b.c.ko)).toEqual(["4", "2", "3", "1"]);
  });
});

describe("문서 본문", () => {
  it("서버 본문을 읽고 빠진 칸은 기본값으로 채운다. 깨진 본문은 null", () => {
    const d = parseDoc(JSON.stringify({ ...DEF(), sigH: undefined, brand: "APPEAL" }))!;
    expect(d.brand).toBe("APPEAL");
    expect(parseDoc("{")).toBeNull();
    expect(parseDoc(JSON.stringify({ a: 1 }))).toBeNull();
  });

  it("종이 HTML 에 제목·조항 번호·서명자·적용 기준 버전이 실린다", () => {
    const html = docHtml(doc(), { ver: 3 });
    expect(html).toContain("10년 품질보증서");
    expect(html).toContain("럭스틸 한글");
    expect(html).toContain('<span class="n">가.</span>');
    expect(html).toContain("변○○");
    expect(html).toContain("적용 기준 v3");
    expect(docHtml(doc({ lang: "en" }), { ver: 1 })).toContain("10 YEAR LIMITED WARRANTY");
  });
});
