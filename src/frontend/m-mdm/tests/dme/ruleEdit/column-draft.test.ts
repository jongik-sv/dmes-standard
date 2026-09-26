// TSK-08-03 design §3.2 — 열 설정 초안(순수 함수). 줄별 검사표·알림 3종·원자 적용·seq 이동 경계·초안 dirty 차단.
// 서버 RuleColumnsService 의 검사 목록과 같은 목록인지는 마지막 describe 가 Java 소스와 대조한다(수용 1).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  COLUMN_RULES,
  applyColumnDraft,
  checkColumnDraft,
  columnDragBlocked,
  columnDraftStorageKey,
  draftFromView,
  isColumnDraftDirty,
  moveColumn,
  newColumn,
  parsedKey,
  tableSaveBlocked,
  type ColumnDraftContext,
  type ColumnDraftRow,
} from "../../../pages/dme/ruleEdit/sections/columns/column-draft";
import type { RuleEditView, VarCandidate } from "../../../pages/dme/ruleEdit/types";
import { SAMPLE_VARS, draftView } from "./fixtures";

const CANDIDATES: VarCandidate[] = [
  { name: "COIL_THK", label: "두께", kind: "COLUMN" },
  { name: "COIL_WID", label: "폭", kind: "COLUMN" },
  { name: "SURF_GRD", label: "표면등급", kind: "COLUMN" },
  { name: "TOP_RESIN_CD", label: "상면수지", kind: "COLUMN" },
  { name: "PREV_GRADE", label: "앞 룰", kind: "RULE_RESULT" },
];

function ctxOf(view: RuleEditView, over: Partial<ColumnDraftContext> = {}): ColumnDraftContext {
  return {
    ruleKind: view.rule.ruleKind,
    hitPolicy: "FIRST",
    candidates: CANDIDATES,
    baseline: draftFromView(view),
    storedRows: view.rows,
    parsed: {},
    ...over,
  };
}

const view = () => draftView("e2e_mdm_steward");
const load = () => draftFromView(view());

function edit(rows: ColumnDraftRow[], key: string, patch: Partial<ColumnDraftRow>): ColumnDraftRow[] {
  return rows.map((r) => (r.key === key ? { ...r, ...patch } : r));
}
const keyOf = (rows: ColumnDraftRow[], name: string) => rows.find((r) => r.varName === name)!.key;
const codes = (rows: ColumnDraftRow[], ctx: ColumnDraftContext) =>
  checkColumnDraft(rows, ctx).rejects.map((c) => c.code);

describe("draftFromView", () => {
  it("조건 열 다음에 결과 열, 각 묶음은 seq 순이고 저장 원값(axis·도메인)을 싣는다", () => {
    const v = { ...view(), varMeta: [{ varId: 1, axis: "ROW" as const, domainId: null, dataType: null }] };
    const rows = draftFromView(v);
    expect(rows.map((r) => r.varName)).toEqual(["COIL_THK", "COIL_WID", "SURF_GRD", "QLTY_GRD", "PRC_FCT"]);
    expect(rows[0].axis).toBe("ROW");
    expect(rows[1].axis).toBe("NONE");
    expect(rows[0].domainId).toBeNull();
    expect(rows[3].axis).toBeNull();
  });

  it("산출 룰 결과 열은 첫 NORMAL 행의 결과 식을 초안 expr 로 가져온다", () => {
    const v = draftView("e2e_mdm_steward", "e2e_mdm_steward", {
      rule: { ...draftView(null).rule, ruleKind: "DERIVE" },
      vars: [{ ...SAMPLE_VARS[3], dispType: "Expression", varId: 1, seq: 1, varName: "WGT" }],
      rows: [{ rowId: 1, seq: 1, rowKind: "NORMAL", cells: '{"1":{"expr":"A * 2","ast":{}}}', note: null }],
    });
    expect(draftFromView(v)[0].expr).toBe("A * 2");
  });
});

describe("줄별 검사표 — 거부(서버와 같은 목록)", () => {
  it("값 타입 없는 프로그램 변수는 거부하고, 사전 컬럼·앞 룰 결과 이름이면 허용한다", () => {
    const rows = load();
    const ctx = ctxOf(view());
    expect(codes(rows, ctx)).toEqual([]);
    const prog = edit(rows, keyOf(rows, "COIL_WID"), { varName: "MY_PROG_VAR" });
    expect(codes(prog, ctx)).toContain("PROG_TYPE");
    expect(codes(edit(prog, keyOf(prog, "MY_PROG_VAR"), { dataType: "NUMBER" }), ctx)).not.toContain("PROG_TYPE");
    expect(codes(edit(rows, keyOf(rows, "COIL_WID"), { varName: "PREV_GRADE" }), ctx)).not.toContain("PROG_TYPE");
  });

  it("결과 열은 도메인 또는 기본 타입이 필수다", () => {
    const rows = load();
    const bad = edit(rows, keyOf(rows, "QLTY_GRD"), { dataType: null, domainId: null });
    expect(codes(bad, ctxOf(view()))).toContain("RESULT_TYPE_REQUIRED");
  });

  it("Expression 조건 열은 표시명이 필수다", () => {
    const rows = edit(load(), keyOf(load(), "COIL_WID"), { dispType: "Expression", varName: "COIL_WID * 2", label: "" });
    expect(codes(rows, ctxOf(view()))).toContain("EXPR_LABEL");
  });

  it("결과 변수명은 버전 안에서 유일하다", () => {
    const rows = load();
    const dup = edit(rows, keyOf(rows, "PRC_FCT"), { varName: "QLTY_GRD" });
    expect(codes(dup, ctxOf(view()))).toContain("RESULT_NAME_DUP");
  });

  it("변수명 _ 접두·EvalEx 상수·EVAL_TS 는 예약어로 거부한다(대소문자 무시)", () => {
    const rows = load();
    for (const bad of ["_X", "true", "PI", "eval_ts", "DT_FORMAT_LOCAL_DATE"]) {
      const r = edit(rows, keyOf(rows, "COIL_WID"), { varName: bad, dataType: "NUMBER" });
      expect(codes(r, ctxOf(view())), bad).toContain("RESERVED_NAME");
    }
  });

  it("표시 타입은 조건 Equal·1·2·Expression, 결과 Value·Expression 만 허용한다", () => {
    const rows = load();
    expect(codes(edit(rows, keyOf(rows, "COIL_THK"), { dispType: "Value" }), ctxOf(view()))).toContain("DISP_TYPE");
    expect(codes(edit(rows, keyOf(rows, "QLTY_GRD"), { dispType: "2" }), ctxOf(view()))).toContain("DISP_TYPE");
  });

  it("axis 는 조건 열에만, 그룹·열 조건은 결과 열에만, 집계·순위는 적중 정책에 맞을 때만", () => {
    const rows = load();
    const ctx = ctxOf(view());
    expect(codes(edit(rows, keyOf(rows, "QLTY_GRD"), { axis: "ROW" }), ctx)).toContain("AXIS_COND_ONLY");
    expect(codes(edit(rows, keyOf(rows, "COIL_THK"), { axis: "DIAG" as never }), ctx)).toContain("AXIS_VALUE");
    expect(codes(edit(rows, keyOf(rows, "COIL_THK"), { resGrp: "G" }), ctx)).toContain("GRP_RESULT_ONLY");
    expect(codes(edit(rows, keyOf(rows, "QLTY_GRD"), { collectAgg: "SUM" }), ctx)).toContain("AGG_COLLECT");
    expect(codes(edit(rows, keyOf(rows, "QLTY_GRD"), { prioList: ["A"] }), ctx)).toContain("PRIO_PRIORITY");
    expect(codes(edit(rows, keyOf(rows, "QLTY_GRD"), { collectAgg: "SUM" }), ctxOf(view(), { hitPolicy: "COLLECT" }))).not.toContain("AGG_COLLECT");
  });

  it("식이 없는 이름·구분 오류도 거부한다", () => {
    const rows = load();
    expect(codes(edit(rows, keyOf(rows, "COIL_THK"), { varName: "" }), ctxOf(view()))).toContain("NAME_REQUIRED");
    expect(codes(edit(rows, keyOf(rows, "COIL_THK"), { varKind: "X" as never }), ctxOf(view()))).toContain("KIND");
  });
});

/** BASE_SPD_LKP 모양 — 그룹 BASE_SPD 결과 열 3개. */
function groupedView(): RuleEditView {
  const res = (varId: number, seq: number, name: string) => ({
    ...SAMPLE_VARS[3],
    varId,
    seq,
    varName: name,
    label: name,
    dataType: "NUMBER" as const,
  });
  return draftView("e2e_mdm_steward", "e2e_mdm_steward", {
    vars: [SAMPLE_VARS[0], res(10, 1, "SPD_A"), res(11, 2, "SPD_B"), res(12, 3, "SPD_C")],
    rows: [],
    baseRows: [],
    varMeta: [
      { varId: 1 },
      { varId: 10, resGrp: "BASE_SPD", grpCond: "TOP_RESIN_CD == \"A\"", dataType: "NUMBER" },
      { varId: 11, resGrp: "BASE_SPD", grpCond: "TOP_RESIN_CD == \"B\"", dataType: "NUMBER" },
      { varId: 12, resGrp: "BASE_SPD", grpCond: null, dataType: "NUMBER" },
    ],
  });
}

describe("결과 열 그룹 검사(불변 5)", () => {
  const gv = groupedView();
  const rows = () => draftFromView(gv);
  const ctx = (over: Partial<ColumnDraftContext> = {}) => ctxOf(gv, over);

  it("정상 그룹은 통과한다", () => {
    expect(codes(rows(), ctx())).toEqual([]);
  });

  it("FIRST·UNIQUE 밖 적중 정책은 거부한다", () => {
    for (const hit of ["PRIORITY", "COLLECT", "ANY"] as const) {
      expect(codes(rows(), ctx({ hitPolicy: hit })), hit).toContain("GRP_POLICY");
    }
    expect(codes(rows(), ctx({ hitPolicy: "UNIQUE" }))).toEqual([]);
  });

  it("그룹 열이 2개 미만이면 거부한다", () => {
    const r = edit(rows(), keyOf(rows(), "SPD_B"), { resGrp: "" , grpCond: ""});
    const r2 = edit(r, keyOf(r, "SPD_C"), { resGrp: "", grpCond: "" });
    expect(codes(r2, ctx())).toContain("GRP_MIN2");
  });

  it("그룹 안 데이터 타입이 다르면 거부한다", () => {
    const r = edit(rows(), keyOf(rows(), "SPD_B"), { domainId: null, dataType: "STRING" });
    expect(codes(r, ctx())).toContain("GRP_TYPE");
  });

  it("기본 열(열 조건 없음)은 하나뿐이고 그룹의 마지막이어야 한다", () => {
    const first = edit(rows(), keyOf(rows(), "SPD_A"), { grpCond: "" });
    expect(codes(first, ctx())).toContain("GRP_DEFAULT_ONE");
    const notLast = edit(edit(rows(), keyOf(rows(), "SPD_C"), { grpCond: 'X == "Z"' }), keyOf(rows(), "SPD_A"), { grpCond: "" });
    expect(codes(notLast, ctx())).toContain("GRP_DEFAULT_LAST");
  });

  it("그룹 이름이 그룹 밖 결과 변수명과 같으면 거부한다", () => {
    const r = [...rows(), { ...newColumn("RESULT", "n1"), varName: "BASE_SPD", dataType: "NUMBER" as const }];
    expect(codes(r, ctx())).toContain("GRP_NAME_CLASH");
  });

  it("그룹 아닌 열의 열 조건은 거부한다", () => {
    const r = edit(rows(), keyOf(rows(), "SPD_A"), { resGrp: "", grpCond: 'X == "1"' });
    expect(codes(r, ctx())).toContain("GRP_COND_NO_GROUP");
  });

  it("열 조건의 참조 변수는 서버 파싱 결과(refVars)로 컬럼 사전·앞 룰 결과 여부를 본다 — 화면이 식을 파싱하지 않는다", () => {
    const text = 'PROG_ONLY == "A"';
    const parsed = { [parsedKey("RULE_GRP_COND", text)]: { refVars: ["PROG_ONLY"] } };
    const r = edit(rows(), keyOf(rows(), "SPD_A"), { grpCond: text });
    expect(codes(r, ctx({ parsed }))).toContain("GRP_COND_REF");
    const ok = { [parsedKey("RULE_GRP_COND", text)]: { refVars: ["TOP_RESIN_CD"] } };
    expect(codes(r, ctx({ parsed: ok }))).not.toContain("GRP_COND_REF");
    // 아직 서버 파싱 결과가 없으면 화면은 판정하지 않는다(서버가 저장 때 기준).
    expect(codes(r, ctx({ parsed: {} }))).not.toContain("GRP_COND_REF");
    // 파싱 오류는 서버 오류 문구 그대로 거부 사유가 된다.
    const err = { [parsedKey("RULE_GRP_COND", text)]: { error: "식을 파싱할 수 없습니다" } };
    expect(codes(r, ctx({ parsed: err }))).toContain("EXPR_PARSE");
  });
});

describe("산출(DERIVE) 룰 검사(불변 4)", () => {
  const derive = (): RuleEditView => {
    const res = (varId: number, seq: number, name: string) => ({
      ...SAMPLE_VARS[3],
      varId,
      seq,
      varName: name,
      dispType: "Expression" as const,
      dataType: "NUMBER" as const,
    });
    return draftView("e2e_mdm_steward", "e2e_mdm_steward", {
      rule: { ...draftView(null).rule, ruleKind: "DERIVE" },
      vars: [res(1, 1, "VOL"), res(2, 2, "WGT")],
      rows: [{ rowId: 1, seq: 1, rowKind: "NORMAL", cells: '{"1":{"expr":"A * B"},"2":{"expr":"VOL * 7.85"}}', note: null }],
      baseRows: [],
      varMeta: [{ varId: 1, dataType: "NUMBER" }, { varId: 2, dataType: "NUMBER" }],
    });
  };
  const dctx = (v: RuleEditView, parsed: ColumnDraftContext["parsed"]) => ctxOf(v, { hitPolicy: null, parsed });

  it("앞 순서 결과 참조는 허용하고 자기 자신·뒤 순서 참조는 거부한다(서버 파싱 refVars 기준)", () => {
    const v = derive();
    const rows = draftFromView(v);
    const parsedOf = (refs: Record<string, string[]>) =>
      Object.fromEntries(Object.entries(refs).map(([t, r]) => [parsedKey("RULE_RESULT_EXPR", t), { refVars: r }]));
    expect(codes(rows, dctx(v, parsedOf({ "A * B": ["A", "B"], "VOL * 7.85": ["VOL"] })))).toEqual([]);
    const selfRef = edit(rows, keyOf(rows, "VOL"), { expr: "VOL + 1" });
    expect(codes(selfRef, dctx(v, parsedOf({ "VOL + 1": ["VOL"], "VOL * 7.85": ["VOL"] })))).toContain("DERIVE_SELF_REF");
    const later = edit(rows, keyOf(rows, "VOL"), { expr: "WGT / 2" });
    expect(codes(later, dctx(v, parsedOf({ "WGT / 2": ["WGT"], "VOL * 7.85": ["VOL"] })))).toContain("DERIVE_SELF_REF");
  });

  it("산출 룰에 조건 열을 두거나 결과 열이 Expression 이 아니거나 결과 식을 둘 행이 없으면 거부한다", () => {
    const v = derive();
    const rows = draftFromView(v);
    expect(codes([...rows, { ...newColumn("COND", "n1"), varName: "X", dataType: "NUMBER" as const }], dctx(v, {}))).toContain("DERIVE_NO_COND");
    expect(codes(edit(rows, keyOf(rows, "VOL"), { dispType: "Value" }), dctx(v, {}))).toContain("DERIVE_EXPR_ONLY");
    expect(codes(rows, ctxOf({ ...v, rows: [] }, { hitPolicy: null, storedRows: [], parsed: {} }))).toContain("DERIVE_NO_ROWS");
  });

  it("결과 식은 산출 룰에서만 둘 수 있다", () => {
    const rows = load();
    expect(codes(edit(rows, keyOf(rows, "QLTY_GRD"), { expr: "1 + 1" }), ctxOf(view()))).toContain("EXPR_DERIVE_ONLY");
  });
});

describe("원자 적용(불변 2)과 알림 3종(불변 8)", () => {
  it("거부 줄이 하나라도 있으면 요청 본문을 만들지 않는다", () => {
    const rows = load();
    const bad = edit(rows, keyOf(rows, "COIL_WID"), { varName: "MY_PROG_VAR" });
    const res = applyColumnDraft(bad, ctxOf(view()));
    expect(res.ok).toBe(false);
    expect(res).not.toHaveProperty("request");
    if (!res.ok) expect(res.rejects.map((c) => c.code)).toContain("PROG_TYPE");
  });

  it("검사를 통과하면 새 열은 임시 음수 ID·기존 열은 원래 var_id 로 보내고 빈 칸은 뺀다", () => {
    const rows = [...load(), { ...newColumn("RESULT", "n1"), varName: "NEW_RES", label: "새 결과", dataType: "STRING" as const }];
    const res = applyColumnDraft(rows, ctxOf(view()));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const fresh = res.request.find((r) => r.varName === "NEW_RES")!;
    expect(fresh.varId).toBeLessThan(0);
    expect(fresh).not.toHaveProperty("resGrp");
    expect(fresh.deleted).toBeUndefined();
    expect(res.request.find((r) => r.varName === "COIL_THK")!.varId).toBe(1);
    expect(res.request.find((r) => r.varName === "COIL_THK")!.axis).toBe("NONE");
    expect(res.request.map((r) => r.varName)).toEqual(["COIL_THK", "COIL_WID", "SURF_GRD", "QLTY_GRD", "PRC_FCT", "NEW_RES"]);
    expect(res.notices).toEqual([{ kind: "NEW_COL", varName: "NEW_RES", count: 0 }]);
  });

  it("표시 타입을 바꾼 열은 셀을 비운다는 알림(칸 수)을 낸다", () => {
    const rows = load();
    const changed = edit(rows, keyOf(rows, "COIL_WID"), { dispType: "Equal" });
    const res = applyColumnDraft(changed, ctxOf(view()));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.notices).toEqual([{ kind: "CELLS_CLEARED", varName: "COIL_WID", count: 3 }]);
  });

  it("조건 변수를 바꾼 열도 셀을 비우지만 변수명이 같으면 알림이 없다", () => {
    const rows = load();
    const renamed = edit(rows, keyOf(rows, "COIL_WID"), { varName: "COIL_LEN" });
    const res = applyColumnDraft(renamed, ctxOf(view(), { candidates: [...CANDIDATES, { name: "COIL_LEN", kind: "COLUMN" }] }));
    expect(res.ok && res.notices.map((n) => n.kind)).toEqual(["CELLS_CLEARED"]);
    const same = applyColumnDraft(edit(rows, keyOf(rows, "COIL_WID"), { label: "폭2" }), ctxOf(view()));
    expect(same.ok && same.notices).toEqual([]);
  });

  it("삭제한 열은 삭제 알림(셀 수)을 내고 요청에는 deleted 줄로 원래 칸을 모두 싣는다", () => {
    const rows = load();
    const res = applyColumnDraft(edit(rows, keyOf(rows, "SURF_GRD"), { deleted: true }), ctxOf(view()));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.notices).toEqual([{ kind: "COL_DELETED", varName: "SURF_GRD", count: 3 }]);
    const line = res.request.find((r) => r.varName === "SURF_GRD")!;
    expect(line).toMatchObject({ varId: 3, varKind: "COND", dispType: "1", deleted: true });
  });

  it("새로 만든 뒤 지운 열은 요청에 넣지 않는다", () => {
    const rows = [...load(), { ...newColumn("COND", "n1"), varName: "GONE", dataType: "NUMBER" as const, deleted: true }];
    const res = applyColumnDraft(rows, ctxOf(view()));
    expect(res.ok && res.request.some((r) => r.varName === "GONE")).toBe(false);
  });

  it("삭제 열은 그룹·이름 중복 검사에서 빠진다", () => {
    const rows = load();
    const dupOk = edit(edit(rows, keyOf(rows, "PRC_FCT"), { varName: "QLTY_GRD" }), keyOf(rows, "QLTY_GRD"), { deleted: true });
    expect(codes(dupOk, ctxOf(view()))).not.toContain("RESULT_NAME_DUP");
  });
});

describe("seq 이동 경계", () => {
  it("같은 묶음 안에서만 위·아래로 움직이고 조건↔결과 묶음은 넘지 못한다", () => {
    const rows = load();
    const up = moveColumn(rows, keyOf(rows, "COIL_WID"), -1);
    expect(up.moved).toBe(true);
    expect(up.rows.map((r) => r.varName).slice(0, 3)).toEqual(["COIL_WID", "COIL_THK", "SURF_GRD"]);
    expect(moveColumn(rows, keyOf(rows, "COIL_THK"), -1).moved).toBe(false);
    expect(moveColumn(rows, keyOf(rows, "SURF_GRD"), 1).moved).toBe(false); // 마지막 조건 열이 결과 묶음으로 못 내려간다
    expect(moveColumn(rows, keyOf(rows, "QLTY_GRD"), -1).moved).toBe(false); // 첫 결과 열이 조건 묶음으로 못 올라간다
    const down = moveColumn(rows, keyOf(rows, "QLTY_GRD"), 1);
    expect(down.rows.map((r) => r.varName).slice(3)).toEqual(["PRC_FCT", "QLTY_GRD"]);
  });

  it("삭제 표시된 열은 건너뛰지 않고 옆 열과 자리를 바꾼다(seq 는 배열 순서)", () => {
    const rows = edit(load(), keyOf(load(), "COIL_WID"), { deleted: true });
    const res = moveColumn(rows, keyOf(rows, "SURF_GRD"), -1);
    expect(res.rows.map((r) => r.varName).slice(0, 3)).toEqual(["COIL_THK", "SURF_GRD", "COIL_WID"]);
  });
});

describe("초안 dirty 와 차단(불변 13)", () => {
  it("baseline 과 같으면 dirty 가 아니고 한 칸이라도 바뀌면 dirty 다", () => {
    const rows = load();
    expect(isColumnDraftDirty(rows, load())).toBe(false);
    expect(isColumnDraftDirty(edit(rows, keyOf(rows, "COIL_THK"), { label: "다른 이름" }), load())).toBe(true);
    expect(isColumnDraftDirty([...rows, newColumn("COND", "n1")], load())).toBe(true);
  });

  it("초안이 dirty 면 표 저장과 열 머리 드래그를 막는다", () => {
    expect(tableSaveBlocked(true)).toBe(true);
    expect(tableSaveBlocked(false)).toBe(false);
    expect(columnDragBlocked(true)).toBe(true);
    expect(columnDragBlocked(false)).toBe(false);
  });

  it("초안 sessionStorage 키는 룰·버전별이다(시안 ST.cd 관례)", () => {
    expect(columnDraftStorageKey("QLTY_GRD_JDG", 2)).toBe("mdm-ruleEdit-colDraft:QLTY_GRD_JDG:2");
  });
});

describe("서버 검사 목록과의 대조(수용 1)", () => {
  const javaPath = path.resolve(
    __dirname,
    "../../../../../backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleEdit/service/RuleColumnsService.java",
  );
  const java = readFileSync(javaPath, "utf8");

  it("화면 검사 규칙마다 서버 RuleColumnsService 가 같은 문구의 reject 를 갖는다", () => {
    for (const rule of COLUMN_RULES) {
      expect(java, `${rule.code} → ${rule.serverMessage}`).toContain(rule.serverMessage);
    }
  });

  it("서버가 reject 하는 문구는 모두 화면 규칙에 있거나 화면이 다루지 않는다고 명시한 목록에 있다", () => {
    // reject( 인자 전체의 문자열 리터럴을 이어 붙인다(문구가 변수와 이어 붙여져 있다).
    const rejects = [...java.matchAll(/reject\(([^;]*)\);/gs)].map((m) => [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((l) => l[1]).join("\u0000")).filter((m) => m !== "");
    expect(rejects.length).toBeGreaterThan(20);
    const known = [...COLUMN_RULES.map((r) => r.serverMessage), ...SERVER_ONLY_MESSAGES];
    for (const message of rejects) {
      expect(known.some((k) => message.includes(k) || message.split("\u0000").some((frag) => frag.length > 1 && k.includes(frag))), `화면에 없는 서버 검사: ${message}`).toBe(true);
    }
  });
});

/** 화면 초안이 만들 수 없는 상황이라 화면에는 없고 서버만 지키는 검사(design 검사표 「서버 전용」). */
const SERVER_ONLY_MESSAGES = [
  "이 초안에 없는 var_id 입니다",
  "var_id 가 중복됩니다",
  "산출 룰에는 적중 정책을 두지 않습니다",
  "없는 도메인입니다",
  "결과 열의 값 타입을 확인할 수 없습니다",
  "식을 파싱할 수 없습니다",
  "검사 실패(",
];
