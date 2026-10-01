// TSK-08-06 design §3.3·§6.8·I9 — 세트 계산 코퍼스 동치(TS 쪽). 한 벌 코퍼스(mdm/lib test resources)를 화면 즉시 계산 `set-model.ts` 로 돌려
// `io`·`deps`·`checks`(message 포함)가 expect 와 순서까지 같은지 본다. Java 짝은 mdm/lib `RuleSetCorpusTest`(같은 파일·같은 하한).
// 파일이 없으면 실패한다 — 건너뛰지 않는다.
// 읽기 규칙(두 러너 공통): `rules` 원소의 빠진 칸은 null·false·빈 목록(`exists` 를 빠뜨리면 없는 룰, `hitPolicy`·`hasDefault` 가 빠지면 null·false),
// `rules` 에 키가 없는 ID 는 없는 룰, `checks` 의 빠진 칸과 null 은 같다. 실제 값은 투영하지 않고 그대로 비교한다(구현이 undefined 를 내면 드러난다).
// 흐름 사례(`flow`)는 노드·선의 빠진 칸을 null(`otherwise` 는 false)로 채우고, `ids` 가 흐름을 펼친 룰 목록과 같은지 먼저 본다. `checks` 의 `nodeId`·`edgeId` 도 비교한다.
// 같은 형식의 퍼즈 파일 `rule-set-fuzz.json`(코퍼스 옆, Java `RuleSetFlowFuzz` 가 시드로 만들고 expect 는 Java 분석기 결과)도 돌린다 — 두 언어 차분.
// 퍼즈 사례가 어긋나면 작은 흐름으로 줄여 코퍼스 사례로 옮기고 원인을 고친다.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { FlowEdge, FlowNode, RuleSetFlow } from "../../../src/contract/engine-contract.generated";
import { flowRuleIds } from "../../../pages/dme/ruleSetEdit/flow-model";
import { flowChecks, flowDeps, flowIo, setChecks, setDeps, setIo } from "../../../pages/dme/ruleSetEdit/set-model";
import type { CondIo, IoName, IoSource, RuleIo } from "../../../pages/dme/ruleSetEdit/types";
import { PACKAGE_ROOT, RULE_SET_CORPUS_PATH } from "../../helpers/engine-paths";

/** Java `RuleSetCorpusTest.MIN_CASES` 와 같아야 한다(I9). 사례를 더하면 두 러너를 함께 올린다. */
const MIN_CASES = 78;
/** Java `RuleSetCorpusTest.MIN_FUZZ_CASES` 와 같아야 한다. */
const MIN_FUZZ_CASES = 200;
/** 퍼즈 파일 — 코퍼스와 같은 폴더(mdm/lib test resources). */
const RULE_SET_FUZZ_PATH = path.join(path.dirname(RULE_SET_CORPUS_PATH), "rule-set-fuzz.json");

type Nullable<T> = { [K in keyof T]?: T[K] | null };

interface CorpusRule {
  exists?: boolean;
  status?: string | null;
  releasedVer?: number | null;
  hitPolicy?: string | null;
  hasDefault?: boolean;
  conds?: Array<{ name: string; source?: IoSource | null }>;
  results?: Array<{ name: string }>;
}

interface CorpusFlowNode {
  id: string;
  kind: FlowNode["kind"];
  ruleId?: string | null;
  splitId?: string | null;
  label?: string | null;
  attachTo?: string | null;
  catches?: string[] | null;
}

interface CorpusFlowEdge {
  id: string;
  from: string;
  to: string;
  order?: number | null;
  cond?: string | null;
  otherwise?: boolean;
  label?: string | null;
}

interface CorpusCondIo {
  ok: boolean;
  message?: string | null;
  vars?: Array<{ name: string; source?: IoSource | null }>;
}

interface CorpusCase {
  name: string;
  ids: string[];
  flow?: { version: number; nodes: CorpusFlowNode[]; edges: CorpusFlowEdge[] };
  condIo?: Record<string, CorpusCondIo>;
  rules?: Record<string, CorpusRule>;
  expect: {
    io: {
      inputs: Array<{ name: string; source?: string | null; users: string[] }>;
      results: Array<{ name: string; by: string[]; readers: string[] }>;
    };
    deps: Record<string, string[]>;
    checks: Array<
      Nullable<{ code: string; severity: string; ruleId: string; otherRuleId: string; varName: string; message: string; nodeId: string; edgeId: string }>
    >;
  };
}

/** 코퍼스 흐름의 빠진 칸을 null(otherwise 는 false)로 채운다 — Java 러너와 같은 읽기 규칙. */
function flowOf(f: NonNullable<CorpusCase["flow"]>): RuleSetFlow {
  const nodes: FlowNode[] = f.nodes.map((n) => {
    const base: FlowNode = { id: n.id, kind: n.kind, ruleId: n.ruleId ?? null, splitId: n.splitId ?? null, label: n.label ?? null };
    return n.kind === "CATCH" ? { ...base, attachTo: n.attachTo ?? null, catches: n.catches ?? null } : base;
  });
  const edges: FlowEdge[] = f.edges.map((e) => ({
    id: e.id,
    from: e.from,
    to: e.to,
    order: e.order ?? null,
    cond: e.cond ?? null,
    otherwise: e.otherwise ?? false,
    label: e.label ?? null,
  }));
  return { version: f.version, nodes, edges };
}

function condIoOf(m: CorpusCase["condIo"]): Record<string, CondIo> {
  const out: Record<string, CondIo> = {};
  for (const [edgeId, c] of Object.entries(m ?? {})) {
    out[edgeId] = { ok: c.ok, message: c.message ?? null, vars: (c.vars ?? []).map((v) => ioName(v.name, v.source ?? null)) };
  }
  return out;
}

const ioName = (name: string, source: IoSource | null): IoName => ({
  name,
  source,
  label: null,
  dataType: null,
  scale: null,
  dateString: false,
  maruCodeId: null,
});

function rule(id: string, r: CorpusRule): RuleIo {
  return {
    ruleId: id,
    ruleName: null,
    ruleKind: null,
    status: r.status ?? null,
    exists: r.exists ?? false,
    releasedVer: r.releasedVer ?? null,
    hitPolicy: r.hitPolicy ?? null,
    conds: (r.conds ?? []).map((c) => ioName(c.name, c.source ?? null)),
    results: (r.results ?? []).map((x) => ioName(x.name, null)),
    hasDefault: r.hasDefault ?? false,
  };
}

const corpus = JSON.parse(fs.readFileSync(RULE_SET_CORPUS_PATH, "utf8")) as { version: number; cases: CorpusCase[] };
const fuzz = JSON.parse(fs.readFileSync(RULE_SET_FUZZ_PATH, "utf8")) as { version: number; cases: CorpusCase[] };

describe("세트 계산 코퍼스 동치(TS)", () => {
  it("코퍼스·퍼즈는 version 1 이고 사례 수가 하한 이상이며 이름이 겹치지 않는다", () => {
    expect(corpus.version).toBe(1);
    expect(fuzz.version).toBe(1);
    expect(corpus.cases.length).toBeGreaterThanOrEqual(MIN_CASES);
    expect(fuzz.cases.length).toBeGreaterThanOrEqual(MIN_FUZZ_CASES);
    const names = [...corpus.cases, ...fuzz.cases].map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each([...corpus.cases, ...fuzz.cases].map((c) => [c.name, c] as const))("%s", (name, c) => {
    const rules: Record<string, RuleIo> = {};
    for (const [id, r] of Object.entries(c.rules ?? {})) rules[id] = rule(id, r);
    const flow = c.flow ? flowOf(c.flow) : null;
    if (flow) expect(flowRuleIds(flow), `${name} ids = 흐름을 펼친 룰 목록`).toEqual(c.ids);

    const io = flow ? flowIo(flow, rules) : setIo(c.ids, rules);
    expect(
      io.inputs.map((i) => ({ name: i.name, source: i.source, users: i.users })),
      `${name} io.inputs`,
    ).toEqual(c.expect.io.inputs.map((i) => ({ name: i.name, source: i.source ?? null, users: i.users })));
    expect(
      io.results.map((r) => ({ name: r.name, by: r.by, readers: r.readers })),
      `${name} io.results`,
    ).toEqual(c.expect.io.results.map((r) => ({ name: r.name, by: r.by, readers: r.readers })));

    const deps = flow ? flowDeps(flow, rules) : setDeps(c.ids, rules);
    expect(Object.entries(deps), `${name} deps`).toEqual(Object.entries(c.expect.deps));

    const checks = flow ? flowChecks(flow, rules, condIoOf(c.condIo)) : setChecks(c.ids, rules);
    expect(checks, `${name} checks`).toStrictEqual(
      c.expect.checks.map((k) => ({
        code: k.code ?? null,
        severity: k.severity ?? null,
        ruleId: k.ruleId ?? null,
        otherRuleId: k.otherRuleId ?? null,
        varName: k.varName ?? null,
        message: k.message ?? null,
        nodeId: k.nodeId ?? null,
        edgeId: k.edgeId ?? null,
      })),
    );
  });

  it("m-mdm 안에 코퍼스 사본이 없다(한 벌, I9)", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/corpus.*\.json$/i.test(e.name)) hits.push(path.relative(PACKAGE_ROOT, p));
      }
    };
    walk(PACKAGE_ROOT);
    expect(hits).toEqual([]);
  });
});
