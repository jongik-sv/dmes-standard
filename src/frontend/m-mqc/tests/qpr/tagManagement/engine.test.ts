// Tag관리 화면 엔진 — 규칙 칸 판정, 값과 출처, 규칙 줄(이 칸에 나올 수 있는 값), 바꾼 것 · 되돌리기, 겹침, 사용 범위를 목업 자료로 본다.
import { describe, expect, it } from "vitest";

import data from "@/qpr/tagManagement/data/tag-data.json";
import { NONE, cellMatch, evalTable, fill, substr } from "@/qpr/tagManagement/engine/rules";
import { createSim, initDoc } from "@/qpr/tagManagement/engine/sim";
import type { SimState, TagData } from "@/qpr/tagManagement/engine/types";

const D = { ...(data as unknown as Omit<TagData, "images">), images: {} } as TagData;

function make() {
  const doc = initDoc(D);
  const S: SimState = {
    ...JSON.parse(JSON.stringify(doc)),
    base: JSON.parse(JSON.stringify(doc)),
    view: { coil: D.first, pick: "p0", size: "std", media: "unknown", res: "screen", diff: true, names: false, tint: false, lay: false, gsel: null, gfid: null, zoom: "fit", itab: "field", sel: "STD_MRK_DESC_BIS", baseTab: "lic", lmode: "coil", role: "all", fmf: "all" },
    review: {},
    wit: {},
  };
  return { S, sim: createSim(D, S) };
}

describe("규칙 칸 판정(엔진)", () => {
  it("SQL 처럼 값이 없으면 거짓, orNull 이면 참, 자리 키 · 숫자 비교를 따른다", () => {
    expect(cellMatch("NAT_CD", { in: ["IN"] }, { NAT_CD: "IN" })).toBe(true);
    expect(cellMatch("NAT_CD", { notin: ["IN"] }, {})).toBe(false);
    expect(cellMatch("NAT_CD", { notin: ["IN"], orNull: true }, {})).toBe(true);
    expect(cellMatch("MTL_CD@4,2", { in: ["1A"] }, { MTL_CD: "F2B1ANE" })).toBe(true);
    expect(cellMatch("THK", { ge: 0.4, lt: 1 }, { THK: "0.45" })).toBe(true);
    expect(cellMatch("ANY_CUS", { in: ["200454"] }, { FNL_CUS_CD: "200454" })).toBe(true);
    expect(substr("TAG", -1)).toBe("G");
  });
  it("처음 일치 1행은 그 행 결과 전체, 일치 행 모두는 항목마다 앞선 행", () => {
    const rows = [
      { uid: "a", prio: 1, c: { X: { in: ["1"] } }, r: { V: "A", W: "" } },
      { uid: "b", prio: 2, c: {}, r: { V: "B", W: "B" } },
    ];
    expect(evalTable({ mode: "first", rows }, rows, { X: "1" }).vals).toEqual({ V: "A" });
    expect(evalTable({ mode: "all", rows }, rows, { X: "1" }).vals).toEqual({ V: "A", W: "B" });
    expect(fill("{NAT_CD}-{고객명:1}", { NAT_CD: "IN", __cus: { "1": "수요가 A" } })).toBe("IN-수요가 A");
  });
});

describe("TAG 한 장(목업 자료)", () => {
  it("첫 코일은 BIS 인증서 번호를 인증 · 규격에서, 코일번호를 MES 에서 가져온다", () => {
    const { sim } = make();
    const { CUR } = sim.compute();
    expect(CUR.fid).toBeTruthy();
    expect(CUR.R.ce.lic?.r.SCHEME).toBe("BIS");
    const n = sim.curNode("STD_MRK_DESC_BIS")!;
    expect(n.info.src).toBe("disp");
    expect(n.v).toBe(CUR.R.ce.lic!.r.NO);
    expect(sim.curNode("COIL_ID")!.info.src).toBe("fact");
    const svg = sim.tagSvg(CUR, { k: 1, hit: true });
    expect(svg).toContain('data-f="STD_MRK_DESC_BIS"');
  });

  it("이 칸에 나올 수 있는 값은 고객 요청 → 인증 · 규격 → 그 외 순서다", () => {
    const { sim } = make();
    sim.compute();
    const rows = sim.decisionRows("STD_MRK_DESC_BIS");
    expect(rows[rows.length - 1].src).toBe("else");
    const order = rows.map((r) => r.src);
    expect(order.indexOf("cus")).toBeLessThan(order.indexOf("disp"));
    expect(sim.refText("{인증:번호}")).toBe("‹인증서의 번호›");
  });

  it("인증서 번호를 고치면 바뀐 칸 · 바꾼 것에 잡히고, 하나 되돌리기로 적용본과 같아진다", () => {
    const { S, sim } = make();
    const { CUR } = sim.compute();
    const id = CUR.R.ce.lic!.r.ID;
    S.data.lic.find((r) => r.r.ID === id)!.r.NO = "CML/TEST";
    const m = sim.compute();
    expect([...m.CUR.chg!]).toContain("STD_MRK_DESC_BIS");
    expect(sim.curNode("STD_MRK_DESC_BIS")!.v).toBe("CML/TEST");
    const ch = sim.changes();
    expect(ch).toHaveLength(1);
    expect(ch[0]).toMatchObject({ who: "인증서 · 품질", to: "CML/TEST" });
    expect(sim.sameAsBase()).toBe(false);
    sim.revertChange(ch[0].id);
    expect(sim.changes()).toEqual([]);
    expect(sim.sameAsBase()).toBe(true);
  });

  it("고객 요청 줄을 넣으면 그 칸은 고객 요청이 먼저 정하고, 비우면 숨김으로 찍는다", () => {
    const { S, sim } = make();
    const c = sim.coilOf(D.first);
    S.data.cus.push({ uid: "t1", prio: -99, c: { CUS_CD: { in: [c.CUS_CD] } }, r: { STD_MRK_DESC_BIS: NONE }, note: "" });
    sim.compute();
    const n = sim.curNode("STD_MRK_DESC_BIS")!;
    expect(n.info.src).toBe("cus");
    expect(n.info.hidden).toBe(true);
    expect(sim.changes()[0].id).toBe("cusadd|t1");
  });

  it("칸을 옮기면 배치 변경으로 잡히고, 겹침 점검은 같이 찍힘 · 확인 필요 · 안 찍힘으로 가른다", () => {
    const { S, sim } = make();
    const { CUR } = sim.compute();
    const fid = CUR.fid!;
    const before = sim.clashScan(fid, "std");
    expect(before.fresh).toEqual([]);
    // 바코드 칸을 인증번호 칸 자리로 옮겨 본다.
    const a = sim.layGroups(CUR).find((g) => CUR.nodes.some((n) => n.gid === g.gid && n.t === "barcode"))!;
    const b = sim.layGroups(CUR).find((g) => CUR.nodes.some((n) => n.gid === g.gid && n.n === "COIL_ID"))!;
    sim.setGeo(fid, a.gid, { x: b.x, y: b.y, w: a.w, h: a.h });
    sim.compute();
    expect(sim.changes().some((c) => c.id.startsWith("geo|"))).toBe(true);
    const after = sim.clashScan(fid, "std");
    expect(after.fresh.length).toBeGreaterThan(0);
    expect(after.fresh.every((e) => e.st === "yes" || e.st === "maybe")).toBe(true);
    expect(Object.keys(S.geo)).toEqual([fid]);
  });

  it("칸 목록은 칸마다 언제 찍히나를 정하고, 사용 범위는 가상 코일 1,367건으로 센다", () => {
    const { sim } = make();
    const { CUR } = sim.compute();
    const rows = sim.fmapRows(CUR);
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.some((r) => r.w.k === "rule")).toBe(true);
    expect(rows.some((r) => r.w.k === "fact")).toBe(true);
    const u = sim.usage();
    expect(u.n).toBe(D.coils.length + 1200);
    expect(Object.values(u.lic).reduce((x, y) => x + y, 0)).toBeGreaterThan(0);
    expect(Object.keys(sim.formCoils()).length).toBeGreaterThan(5);
  });
});
