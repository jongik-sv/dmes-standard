/**
 * 검사증명서 엔진 — 목업 시뮬레이터 함수로 만든 기준(oracle.json, scripts/mqc-demo/mtc/oracle.mjs)과 화면 TS 엔진 결과를 비교한다.
 * 시드(seed.json)는 scripts/mqc-demo/mtc/extract.mjs 가 같은 엔진으로 만든다.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import PAPER from "@/qpr/inspectionCertificate/data/paper-assets.json";
import { formDiff, snapDiff } from "@/qpr/inspectionCertificate/engine/diff";
import { paperHtml, sumLines } from "@/qpr/inspectionCertificate/engine/paper";
import { condText, matchRule, resolve, rivals } from "@/qpr/inspectionCertificate/engine/resolve";
import { freshIssued, seedState, type SeedBase } from "@/qpr/inspectionCertificate/engine/seed";
import { clone } from "@/qpr/inspectionCertificate/engine/text";
import type { EngineState, Snap } from "@/qpr/inspectionCertificate/engine/types";

const ROOT = path.resolve(__dirname, "../../../../../..");
const ORACLE = JSON.parse(fs.readFileSync(path.join(__dirname, "oracle.json"), "utf8"));
const BASE = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/mqc-demo/mtc/base.json"), "utf8")) as SeedBase;
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, "src/backend/mqc/lib/src/main/resources/mqc/mtc/seed.json"), "utf8"));

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const json = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T; // 목업 쪽도 JSON 으로 왔다(undefined 키 없음)

function state(): EngineState {
  return seedState(BASE);
}
function paper(st: EngineState, R: Snap, copy: "원본" | "사본") {
  const imgSrc = (n: string) => st.imgs.find((x) => x.name === n)?.data || "";
  return paperHtml(R, { copy }, { imgs: PAPER.imgs as Record<string, string>, imgSrc });
}

describe("검사증명서 엔진 — 목업과 같은 결과", () => {
  const st = state();
  const { issued } = freshIssued(st);

  it("처음 발행본 5건(목업 fresh)이 같다", () => {
    for (const it of issued) expect(json(it.snap)).toEqual(ORACLE.snaps[it.certId]);
  });

  it("종이 HTML(원본·사본)이 글자 하나까지 같다", () => {
    for (const it of issued) {
      expect(sha(paper(st, it.snap, "원본")), `${it.certId} 원본`).toBe(ORACLE.papers[it.certId].orig.sha);
      expect(sha(paper(st, it.snap, "사본")), `${it.certId} 사본`).toBe(ORACLE.papers[it.certId].copy.sha);
    }
  });

  it("양식 기본값과 규칙 순서가 같다", () => {
    expect(json(st.forms)).toEqual(ORACLE.forms);
    expect(st.rules.map((r) => r.id)).toEqual(ORACLE.rules);
  });

  it("재발행 차이(C5: 양식 v2 → v3)가 같다", () => {
    const c5 = issued.find((x) => x.certId === "C5")!.snap;
    expect(snapDiff(c5, resolve(st, "C5"))).toEqual(ORACLE.diffs.C5);
  });

  it("단건 수정(머리 항목·REMARK·코일 값·양식 변경)이 같다", () => {
    const s1 = clone(st);
    s1.ovr.C4 = { head: { po: "PO-2026-118" }, remark: "Packing : Export standard", coil: { "0.net": "3,000\n6,614" }, reason: "고객 요청" };
    s1.ovr.C3 = { form: "en", head: {} };
    const c4 = resolve(s1, "C4");
    expect(json(c4)).toEqual(ORACLE.ovr.C4);
    expect(json(resolve(s1, "C3"))).toEqual(ORACLE.ovr.C3);
    expect(sha(paper(s1, c4, "원본"))).toBe(ORACLE.papers.ovrC4.orig.sha);
  });

  it("시드 발행본은 같은 엔진 결과다", () => {
    expect(SEED.issued.map((x: { certId: string }) => x.certId)).toEqual(["C5", "C1", "C2", "C3", "C4"]);
    for (const it of SEED.issued) expect(it.snap).toEqual(ORACLE.snaps[it.certId]);
  });
});

describe("검사증명서 엔진 — 규칙", () => {
  it("날짜 조건은 ≥ / < 로 비교한다", () => {
    const r = { cond: [["date", "≥", "251229"]] } as never;
    expect(matchRule(r, { date: "261101" }).ok).toBe(true);
    expect(matchRule(r, { date: "251228" }).ok).toBe(false);
    expect(matchRule({ cond: [["date", "<", "251229"]] } as never, { date: "251228" }).ok).toBe(true);
  });

  it("같은 대상 규칙끼리는 우선순위가 작은 쪽이 이기고, 같으면 경고한다", () => {
    const st = state();
    const r14 = st.rules.find((r) => r.id === "R14")!;
    st.rules.push({ ...clone(r14), id: "U1", cond: [["nat", "=", "MX"]], val: "hide", prio: 10 });
    const rv = rivals(st.rules, "U1");
    expect(rv).toHaveLength(1);
    expect(rv[0].o.id).toBe("R14");
    expect(rv[0].tie).toBe(true);
    expect(rv[0].win).toBe(true); // 목록 뒤쪽이 이김
    expect(condText(st.rules.find((r) => r.id === "S9")!)).toBe("증명서 날짜 ≥ 2025.12.29");
  });

  it("양식 초안의 바뀐 곳을 찾는다", () => {
    const st = state();
    const a = st.forms.en.applied;
    const b = clone(a);
    b.cols.find((c) => c.k === "hcl")!.on = false;
    const [heat] = b.cols.splice(b.cols.findIndex((c) => c.k === "heat"), 1);
    b.cols.splice(1, 0, heat);
    b.statement = "hereby";
    expect(formDiff(a, b).map((d) => d.name)).toEqual(["하단 증명 문구", "칸 숨기기 (HCL)", "칸 순서"]);
  });

  it("합계는 줄별로 더한다", () => {
    expect(sumLines(["3,320\n7,320", "3,480\n7,673"])).toBe("6,800\n14,993");
    expect(sumLines(["5,850", "5,690"], true)).toBe("11,540");
  });
});
