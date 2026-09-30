/** @vitest-environment happy-dom */

// 룰 세트 테스트 케이스·디버그 문구(3단계 계획 Task 10 Step 1) — 기대값 JSON(Review Focus 1: 숫자 표기·BOOLEAN·NULL·LIST 왕복),
// 디버그 툴바 상태 문구 다섯 갈래(골든 기록), 케이스 상태 훅(쓰기 뒤 view 로 cases 만 다시 받기 P-D11, MDM001, [모두 실행]·결과 지우기 P-D19).
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TypedValue } from "../../../src/contract/engine-contract.generated";
import { debugStatus, expectedFromFinal } from "../../../pages/dme/ruleSetEdit/debugger/debug-model";
import { useTestCases, type TestCases } from "../../../pages/dme/ruleSetEdit/debugger/useTestCases";
import type { CaseDraft, CaseRunResult, RuleSetCaseView, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { golden } from "../helpers/rule-set-golden";
import { calls, installServer, ok, settle, srv, uninstallServer } from "../helpers/rule-set-page";

describe("expectedFromFinal — 실행 결과 최종 변수 → 기대값 JSON", () => {
  it("NUMBER 는 십진 문자열 그대로, BOOLEAN 은 불린, NULL 은 null, 키 순서 그대로", () => {
    const text = expectedFromFinal({ GT_F: { type: "NUMBER", value: "1.10" }, OK: { type: "BOOLEAN", value: "true" }, X: { type: "NULL" } });
    expect(JSON.parse(text)).toEqual({ GT_F: "1.10", OK: true, X: null });
    expect(Object.keys(JSON.parse(text))).toEqual(["GT_F", "OK", "X"]);
    expect(text).toBe(JSON.stringify({ GT_F: "1.10", OK: true, X: null }, null, 2));
  });

  it("STRING 은 글자, BOOLEAN false 는 false", () => {
    expect(JSON.parse(expectedFromFinal({ G: { type: "STRING", value: "A" }, N: { type: "BOOLEAN", value: "false" } }))).toEqual({ G: "A", N: false });
  });

  it("LIST 는 value 가 아니라 items 를 원소마다 같은 규칙으로 푼다(Task 4 ⚠️ — 기록의 LIST 는 items)", () => {
    const list: TypedValue = { type: "LIST", items: [{ type: "NUMBER", value: "1.10" }, { type: "STRING", value: "a" }, { type: "BOOLEAN", value: "true" }, { type: "NULL" }] };
    expect(JSON.parse(expectedFromFinal({ L: list }))).toEqual({ L: ["1.10", "a", true, null] });
    expect(JSON.parse(expectedFromFinal({ E: { type: "LIST", items: [] } }))).toEqual({ E: [] });
  });

  it("빈 결과는 빈 객체", () => {
    expect(JSON.parse(expectedFromFinal({}))).toEqual({});
  });
});

describe("debugStatus — 디버그 툴바 상태 문구", () => {
  it("기록이 없으면 시작 안내", () => {
    expect(debugStatus(null, -1)).toBe("아직 실행하지 않았다. [한 단계]·[계속]으로 시작한다");
  });

  it("커서 k < n 이면 '{k+1}/{n} · {nodeId} 실행 전'", () => {
    const t = golden("IF_FIRST_TRUE").trace;
    expect(debugStatus(t, 0)).toBe("1/6 · start 실행 전");
    expect(debugStatus(t, 2)).toBe("3/6 · if1 실행 전");
    expect(debugStatus(t, 3)).toBe("4/6 · r2 실행 전");
  });

  it("끝(k = n)이면 '완료 · n단계 · 결과 변수 m개'", () => {
    const t = golden("IF_FIRST_TRUE").trace;
    expect(debugStatus(t, 6)).toBe("완료 · 6단계 · 결과 변수 2개");
  });

  it("끝이고 마지막 노드가 ERROR 면 '오류로 멈춤 — {nodeId}: {첫 위반}'", () => {
    const t = golden("IF_ERROR_STOPS").trace;
    expect(debugStatus(t, 3)).toBe("오류로 멈춤 — if1: IF if1 갈래 e3 조건식을 평가하지 못했다: 식 'GT_THK + 1' 결과가 불린이 아니다: NUMBER");
    expect(debugStatus(t, 2)).toBe("3/3 · if1 실행 전");
  });

  it("기록 노드가 0개면 '실행 전 오류 — {첫 위반}'", () => {
    const t = golden("STRUCTURE_ERROR").trace;
    expect(debugStatus(t, 0)).toBe("실행 전 오류 — 세트 (저장 전) 의 흐름이 올바르지 않다: if1의 나가는 선이 1개다. 2개 이상이어야 한다");
  });
});

// ── useTestCases ──

const CASE_1: RuleSetCaseView = { caseId: 1, caseName: "케이스 1", inputJson: '{"GT_THK":"12"}', evalTs: null, expectedJson: '{"GT_G":"A"}', description: null, rowVersion: 0 };
const CASE_2: RuleSetCaseView = { caseId: 2, caseName: "케이스 2", inputJson: '{"GT_THK":"3"}', evalTs: null, expectedJson: null, description: null, rowVersion: 0 };

function setView(cases: RuleSetCaseView[]): RuleSetView {
  return {
    set: { setId: "GT_SET", setName: "골든", description: null, status: "INUSE", rowVersion: 1, ruleIds: [], flow: null, branched: false },
    rules: [],
    checks: [],
    condIo: {},
    editable: true,
    restorable: false,
    cases,
  };
}

const passResult = (caseId: number, pass: boolean | null): CaseRunResult => ({
  caseId, caseName: `케이스 ${caseId}`, outcome: "OK", pass, mismatches: [], finalValues: { GT_G: "A" }, errors: [],
});

const draft = (over: Partial<CaseDraft> = {}): CaseDraft => ({
  caseId: null, rowVersion: null, caseName: "케이스 2", inputJson: '{"GT_THK":"3"}', evalTs: "", expectedJson: "", description: "", ...over,
});

interface ProbeProps {
  setId: string | null;
  initial: RuleSetCaseView[];
  flowVersion: number;
}

let tests: TestCases | null = null;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

function Probe({ setId, initial, flowVersion }: ProbeProps) {
  tests = useTestCases(setId, initial, flowVersion, () => '{"version":1}');
  return null;
}

async function mount(props: ProbeProps) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(Probe, props));
  });
}

async function rerender(props: ProbeProps) {
  await act(async () => {
    root!.render(createElement(Probe, props));
  });
}

describe("useTestCases — 케이스 목록·쓰기·모두 실행", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
    tests = null;
  });
  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    host?.remove();
    host = null;
    uninstallServer();
  });

  it("initial 을 목록으로 쓰고, 저장이 성공하면 view 를 한 번 불러 cases 만 바꾼다", async () => {
    const initial = [CASE_1];
    await mount({ setId: "GT_SET", initial, flowVersion: 0 });
    expect(tests!.cases).toEqual([CASE_1]);
    srv.replies.save = ok({ setId: "GT_SET", rowVersion: 0, caseId: 2, checks: [] });
    srv.views.GT_SET = setView([CASE_1, CASE_2]);
    let saved = false;
    await act(async () => {
      saved = await tests!.save(draft());
    });
    expect(saved).toBe(true);
    expect(calls("save")).toHaveLength(1);
    const params = calls("save")[0].body.params as Record<string, unknown>;
    expect(params).toMatchObject({ part: "CASE", setId: "GT_SET", caseName: "케이스 2", inputJson: '{"GT_THK":"3"}' });
    expect(calls("view")).toHaveLength(1);
    expect(tests!.cases.map((c) => c.caseId)).toEqual([1, 2]);
    expect(tests!.error).toBeNull();
  });

  it("MDM001 이면 목록을 다시 읽고 '다른 창에서 바뀌었습니다. 다시 불러오세요'", async () => {
    await mount({ setId: "GT_SET", initial: [CASE_1], flowVersion: 0 });
    srv.replies.save = { meta: { success: false, code: "MDM001", message: "다른 사용자가 수정했습니다" } };
    srv.views.GT_SET = setView([{ ...CASE_1, caseName: "다른 창 이름", rowVersion: 1 }]);
    let saved = true;
    await act(async () => {
      saved = await tests!.save(draft({ caseId: 1, rowVersion: 0, caseName: "고친 이름" }));
    });
    expect(saved).toBe(false);
    expect(calls("view")).toHaveLength(1);
    expect(tests!.cases[0].caseName).toBe("다른 창 이름");
    expect(tests!.error).toBe("다른 창에서 바뀌었습니다. 다시 불러오세요");
  });

  it("삭제는 caseDeleted 로 보내고 목록을 다시 받으며 그 케이스의 결과를 지운다", async () => {
    await mount({ setId: "GT_SET", initial: [CASE_1, CASE_2], flowVersion: 0 });
    srv.replies.execute = ok({ cases: [passResult(1, true), passResult(2, null)] });
    await act(async () => {
      await tests!.runAll();
    });
    expect(Object.keys(tests!.results)).toEqual(["1", "2"]);
    srv.replies.save = ok({ setId: "GT_SET", rowVersion: null, caseId: 1, checks: [] });
    srv.views.GT_SET = setView([CASE_2]);
    await act(async () => {
      await tests!.remove(CASE_1);
    });
    expect(calls("save")[0].body.params).toMatchObject({ part: "CASE", setId: "GT_SET", caseId: 1, rowVersion: 0, caseDeleted: true });
    expect(tests!.cases.map((c) => c.caseId)).toEqual([2]);
    expect(Object.keys(tests!.results)).toEqual(["2"]);
  });

  it("runAll 은 지금 흐름으로 runCases 를 부르고 결과를 results 에 넣는다. flowVersion 이 바뀌면 비운다(P-D19)", async () => {
    await mount({ setId: "GT_SET", initial: [CASE_1], flowVersion: 0 });
    srv.replies.execute = ok({ cases: [passResult(1, true)] });
    await act(async () => {
      await tests!.runAll();
    });
    const params = calls("execute")[0].body.params as Record<string, unknown>;
    expect(params).toMatchObject({ setId: "GT_SET", flowJson: '{"version":1}', runCases: true, caseIds: "" });
    expect(tests!.results[1]?.pass).toBe(true);
    expect(tests!.running).toBe(false);
    await rerender({ setId: "GT_SET", initial: [CASE_1], flowVersion: 1 });
    expect(tests!.results).toEqual({});
    expect(tests!.cases).toEqual([CASE_1]);
  });

  it("initial 참조가 바뀌면(열기·다시 불러오기) 목록을 갈아 끼우고 결과를 비운다. 같은 참조면 그대로", async () => {
    const initial = [CASE_1];
    await mount({ setId: "GT_SET", initial, flowVersion: 0 });
    srv.replies.execute = ok({ cases: [passResult(1, false)] });
    await act(async () => {
      await tests!.runAll();
    });
    await rerender({ setId: "GT_SET", initial, flowVersion: 0 });
    expect(tests!.results[1]?.pass).toBe(false);
    const next = [CASE_1, CASE_2];
    await rerender({ setId: "GT_SET", initial: next, flowVersion: 0 });
    expect(tests!.cases).toEqual(next);
    expect(tests!.results).toEqual({});
  });

  it("[모두 실행] 응답이 늦게 오는 사이 흐름이 바뀌면 그 응답은 버린다", async () => {
    await mount({ setId: "GT_SET", initial: [CASE_1], flowVersion: 0 });
    let release!: () => void;
    srv.executeGate = new Promise<void>((r) => {
      release = r;
    });
    srv.replies.execute = ok({ cases: [passResult(1, true)] });
    let pending: Promise<void> | null = null;
    await act(async () => {
      pending = tests!.runAll();
    });
    expect(tests!.running).toBe(true);
    await rerender({ setId: "GT_SET", initial: [CASE_1], flowVersion: 1 });
    await act(async () => {
      release();
      await pending;
    });
    await settle(10);
    expect(tests!.results).toEqual({});
    expect(tests!.running).toBe(false);
  });
});
