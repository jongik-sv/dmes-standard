import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateEngineContract, OUTPUT_PATH, SCHEMA_PATH } from "../scripts/gen-engine-contract.mjs";

/**
 * TSK-03-01 design.md §3.2·§5 I23-I26 — 엔진 공유 계약 TS 타입은 엔진 resources 의 스키마 정본 한 벌에서 생성된다.
 *
 * 수용 기준 "Java·TS 타입이 같은 JSON 스키마에서 나온다" 의 TS 쪽 증거다. Java 쪽은 엔진 EngineContractSchemaTest 가 본다.
 */
const PACKAGE_ROOT = path.resolve(__dirname, "..");

/** design §6.4 「생성 TS export 목록」(53개). 스키마 $defs 이름 + 루트 EngineContract. */
const EXPECTED_EXPORTS = [
  "EngineContract",
  "AstNode",
  "AstNumberLiteral",
  "AstStringLiteral",
  "AstVariable",
  "AstPrefix",
  "AstInfix",
  "AstFunction",
  "InfixOperator",
  "PrefixOperator",
  "DataType",
  "TypedValue",
  "CellOp",
  "NoValueOp",
  "SingleValueOp",
  "ListOp",
  "RangeOp",
  "CellJson",
  "ErrorCode",
  "CorpusFile",
  "CorpusCase",
  "ExprCase",
  "ExprSlot",
  "CellCase",
  "CodeSets",
  "Expect",
  "LocalDateTime",
  "VarType",
  "RowContract",
  "InputContract",
  "RuleResult",
  "RuleHit",
  "RowTrace",
  "EngineWarning",
  "EngineWarningCode",
  "RuleSetResult",
  "SetCall",
  "EngineError",
  "Violation",
  "ViolationStage",
  "RuleSetFlow",
  "FlowNode",
  "FlowEdge",
  "FlowNodeKind",
  "PathStep",
  "RunTrace",
  "NodeTrace",
  "BranchTrace",
  "TraceEdit",
  "NodeStatus",
  "CatchKind",
  "CaughtException",
  "BranchOutcome",
];

/** node_modules·dist 를 뺀 m-mdm 트리에서 *.schema.json 을 찾는다. */
function findSchemaCopies(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findSchemaCopies(full));
    } else if (entry.name.endsWith(".schema.json")) {
      found.push(path.relative(PACKAGE_ROOT, full));
    }
  }
  return found;
}

describe("엔진 공유 계약 TS 생성물", { timeout: 30_000 }, () => {
  it("스키마로 다시 생성한 결과가 커밋된 생성 파일과 같다", async () => {
    const regenerated = await generateEngineContract();
    expect(regenerated).toBe(readFileSync(OUTPUT_PATH, "utf8"));
  });

  it("생성 스크립트는 엔진 resources 의 스키마 정본을 읽는다", () => {
    const canonical = path.resolve(
      __dirname,
      "../../../backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json",
    );
    expect(SCHEMA_PATH).toBe(canonical);
    expect(existsSync(canonical)).toBe(true);
  });

  it("m-mdm 안에 스키마 사본이 없다", () => {
    expect(findSchemaCopies(PACKAGE_ROOT)).toEqual([]);
  });

  it("생성 파일의 export 이름이 설계 목록과 같다", () => {
    const source = readFileSync(OUTPUT_PATH, "utf8");
    const names = [...source.matchAll(/^export (?:type|interface) (\w+)/gm)].map((m) => m[1]);
    expect([...names].sort()).toEqual([...EXPECTED_EXPORTS].sort());
  });

  it("index.ts 가 생성 파일을 타입으로 재수출한다", () => {
    const index = readFileSync(path.join(PACKAGE_ROOT, "src/index.ts"), "utf8");
    expect(index).toContain('export type * from "./contract/engine-contract.generated";');
  });
});
