// TSK-08-04 design §2.5·§3.3·I21 — 값 테스트 입력 줄 모델. 입력 줄은 화면 입력 계약 경로(`computeContract`)의 이름 합집합이고,
// `buildInputJson` 은 키 보냄 끔 = 키 없음, 빈 칸 = null, 값은 문자열 그대로 싣는다.
import fs from "node:fs";
import { describe, expect, it } from "vitest";

import type { AstNode } from "../../../src/contract/engine-contract.generated";
import type { ContractSource } from "../../../pages/dme/ruleEdit/sections/contract/contract-view";
import { contractSourceOfView } from "../../../pages/dme/ruleEdit/sections/contract/contract-view";
import type { ResolvedVar } from "../../../pages/dme/ruleEdit/types";
import { buildInputJson, fieldsOfContract, inputFields, inputFromCase } from "../../../pages/dme/ruleEdit/value-test/test-input";
import { INPUT_CONTRACT_CORPUS_PATH } from "../../helpers/engine-paths";
import { draftView } from "./fixtures";

interface CorpusCase {
  id: string;
  rule: Omit<ContractSource, "vars"> & { vars: Array<Omit<ResolvedVar, "dateString" | "typeSource">> };
  asts: Record<string, AstNode>;
}

const corpus = JSON.parse(fs.readFileSync(INPUT_CONTRACT_CORPUS_PATH, "utf8")) as { cases: CorpusCase[] };

function corpusSource(id: string): { src: ContractSource; asts: Record<string, AstNode> } {
  const c = corpus.cases.find((x) => x.id === id)!;
  const vars = c.rule.vars.map((v) => ({ ...v, dateString: false, typeSource: "COLUMN" }) as ResolvedVar);
  return { src: { ...c.rule, vars }, asts: c.asts };
}

describe("inputFields", () => {
  it("조건 변수는 '조건·키 필수' 이고 룰 열의 라벨·타입·도메인·설명을 싣는다", () => {
    const src = contractSourceOfView(draftView("e2e_mdm_steward"), "current")!;
    const { fields, failure } = inputFields(src, {});
    expect(failure).toBeNull();
    expect(fields.map((f) => f.name)).toEqual(["COIL_THK", "COIL_WID", "SURF_GRD"]);
    expect(fields[0]).toEqual({
      name: "COIL_THK",
      label: "두께",
      typeBadge: "Number(2)",
      contractBadge: "조건·키 필수",
      always: true,
      domain: "코일 두께",
      description: "코일 한 개의 두께",
    });
    expect(fields[2].typeBadge).toBe("String");
  });

  it("입력 줄은 always 뒤에 행별 필수·선택 이름을 처음 나온 순서로 한 번씩 잇고, 배지는 행 수를 센다", () => {
    const { src, asts } = corpusSource("prod-wgt-pv2-coalesce");
    const { fields } = inputFields(src, asts);
    expect(fields.map((f) => f.name)).toEqual([
      "PROD_TYPE",
      "CALC_BASIS",
      "COIL_THK",
      "COIL_WID",
      "COIL_LEN",
      "SPEC_GRAV",
      "COIL_OUT_DIA",
      "COIL_IN_DIA",
      "COIL_VOID_RT",
      "SHEET_LEN",
      "SHEET_CNT",
    ]);
    const badge = Object.fromEntries(fields.map((f) => [f.name, f.contractBadge]));
    expect(badge.PROD_TYPE).toBe("조건·키 필수");
    expect(badge.COIL_WID).toBe("3행 필수");
    expect(badge.COIL_THK).toBe("2행 필수");
    expect(badge.SPEC_GRAV).toBe("3행 선택");
    expect(badge.COIL_LEN).toBe("1행 필수");
  });

  it("행 순서대로 필수 뒤 선택 이름을 잇는다", () => {
    const { src, asts } = corpusSource("null-coalesce");
    const { fields } = inputFields(src, asts);
    expect(fields.map((f) => [f.name, f.contractBadge])).toEqual([
      ["SURF_GRD", "조건·키 필수"],
      ["B", "1행 필수"],
      ["A", "1행 선택"],
      ["X", "1행 선택"],
      ["Y", "1행 선택"],
      ["R", "1행 필수"],
      ["P", "1행 선택"],
      ["Q", "1행 선택"],
    ]);
  });

  it("한 이름이 어떤 행에선 필수, 다른 행에선 선택이면 둘 다 적고, 대소문자가 달라도 한 줄이다", () => {
    const t = (name: string) => ({ name, dataType: "NUMBER" as const, scale: null, domainId: null });
    const fields = fieldsOfContract(
      {
        always: [],
        rows: [
          { rowId: 1, cond: "", required: [t("K")], optional: [] },
          { rowId: 2, cond: "", required: [], optional: [t("k")] },
          { rowId: 3, cond: "", required: [t("K")], optional: [] },
        ],
      },
      [],
    );
    expect(fields.map((f) => [f.name, f.contractBadge, f.typeBadge])).toEqual([["K", "2행 필수 · 1행 선택", "Number"]]);
  });

  it("룰 열이 아닌 이름은 후보 라벨을 쓰고 타입은 계약 타입으로 적는다", () => {
    const { src, asts } = corpusSource("qlty-grd-jdg-v1");
    const { fields } = inputFields(src, asts, [{ name: "BASE_FCT", label: "기준 계수", kind: "RULE_RESULT" }]);
    const f = fields.find((x) => x.name === "BASE_FCT")!;
    expect(f).toMatchObject({ label: "기준 계수", contractBadge: "1행 필수", always: false, domain: null, description: null });
    expect(f.typeBadge).toBe("String");
  });

  it("계약 계산이 던지면 입력 줄 없이 사유를 돌려준다", () => {
    const src = contractSourceOfView(draftView("e2e_mdm_steward"), "current")!;
    const broken = { ...src, rows: [{ rowId: 1, seq: 1, rowKind: "NORMAL" as const, cells: "{깨진" }] };
    const r = inputFields(broken, {});
    expect(r.fields).toEqual([]);
    expect(r.failure).not.toBeNull();
  });
});

describe("buildInputJson", () => {
  const fields = [{ name: "COIL_THK" }, { name: "COIL_WID" }, { name: "SURF_GRD" }];

  it("키 보냄 끔 = 키 없음, 빈 칸 = null, 값은 문자열 그대로", () => {
    const json = buildInputJson(fields, { COIL_THK: "01.50", COIL_WID: "", SURF_GRD: "A" }, { SURF_GRD: false });
    expect(json).toBe('{"COIL_THK":"01.50","COIL_WID":null}');
    expect(JSON.parse(json)).not.toHaveProperty("SURF_GRD");
  });

  it("값을 한 번도 넣지 않은 칸도 키 보냄이 켜져 있으면 null 로 보낸다", () => {
    expect(buildInputJson(fields, {}, {})).toBe('{"COIL_THK":null,"COIL_WID":null,"SURF_GRD":null}');
  });

  it("케이스 입력을 불러오면 없는 키는 키 보냄 끔, null 은 빈 칸, 나머지는 문자열로 채운다", () => {
    const r = inputFromCase(fields, '{"COIL_THK":1.05,"COIL_WID":null,"EXTRA":"x"}');
    expect(r.values).toEqual({ COIL_THK: "1.05", COIL_WID: "" });
    expect(r.keySent).toEqual({ COIL_THK: true, COIL_WID: true, SURF_GRD: false });
    expect(buildInputJson(fields, r.values, r.keySent)).toBe('{"COIL_THK":"1.05","COIL_WID":null}');
  });
});
