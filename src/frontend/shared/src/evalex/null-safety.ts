import type { AstNode } from "./engine-contract.generated";
import { RESERVED_CONSTANTS } from "./contract-constants";
import { FUNCTION_TABLE, type ArgContext, type NullPolicy } from "./functions";

/**
 * AST NULL 안전 분석(TSK-03-04 design §6.7, 06:208). NULL 이 들어오면 식이 깨지는 자리의 변수는 필수, 그렇지 않은 자리에만
 * 쓰인 변수는 선택이다. 애매하면 필수(뿌리 문맥 FAIL). 결과는 대문자·첫 등장 순·상수 제외, 필수 ∩ 선택 = ∅.
 */
type Ctx = "FAIL" | "SAFE";

const CONSTANTS: ReadonlySet<string> = new Set<string>(RESERVED_CONSTANTS);
const FAIL_INFIX = new Set(["+", "-", "*", "/", "%", "^", "<", "<=", ">", ">="]);
const EQ_INFIX = new Set(["==", "=", "!=", "<>"]);

function isNullConst(n: AstNode): boolean {
  return n.type === "VARIABLE_OR_CONSTANT" && n.value.toUpperCase() === "NULL";
}

function varName(n: AstNode): string | undefined {
  if (n.type !== "VARIABLE_OR_CONSTANT") return undefined;
  const u = n.value.toUpperCase();
  return CONSTANTS.has(u) ? undefined : u;
}

/** `X op NULL`·`NULL op X` 의 X. */
function nullCompared(n: AstNode, ops: ReadonlySet<string>): string | undefined {
  if (n.type !== "INFIX_OPERATOR" || !ops.has(n.value)) return undefined;
  const [a, b] = n.params;
  if (isNullConst(b)) return varName(a);
  if (isNullConst(a)) return varName(b);
  return undefined;
}

const NE_OPS = new Set(["!=", "<>"]);
const EQ_OPS = new Set(["==", "="]);

/** 조건이 참이면 NULL 이 아님이 보장되는 변수. */
function nonNullIfTrue(c: AstNode): Set<string> {
  const x = nullCompared(c, NE_OPS);
  if (x) return new Set([x]);
  if (c.type === "INFIX_OPERATOR" && c.value === "&&") return new Set([...nonNullIfTrue(c.params[0]), ...nonNullIfTrue(c.params[1])]);
  return new Set();
}

/** 조건이 거짓이면 NULL 이 아님이 보장되는 변수. */
function nonNullIfFalse(c: AstNode): Set<string> {
  const x = nullCompared(c, EQ_OPS);
  if (x) return new Set([x]);
  if (c.type === "INFIX_OPERATOR" && c.value === "||") return new Set([...nonNullIfFalse(c.params[0]), ...nonNullIfFalse(c.params[1])]);
  return new Set();
}

function union(g: ReadonlySet<string>, extra: ReadonlySet<string>): ReadonlySet<string> {
  return extra.size === 0 ? g : new Set([...g, ...extra]);
}

function ctxOf(a: ArgContext, parent: Ctx): Ctx {
  return a === "inherit" ? parent : a === "fail" ? "FAIL" : "SAFE";
}

export function nullSafety(ast: AstNode): { required: string[]; optional: string[] } {
  const seen: string[] = [];
  const seenSet = new Set<string>();
  const required = new Set<string>();

  const visit = (n: AstNode, ctx: Ctx, g: ReadonlySet<string>): void => {
    switch (n.type) {
      case "NUMBER_LITERAL":
      case "STRING_LITERAL":
        return;
      case "VARIABLE_OR_CONSTANT": {
        const name = varName(n);
        if (!name) return;
        if (!seenSet.has(name)) {
          seenSet.add(name);
          seen.push(name);
        }
        if (ctx === "FAIL" && !g.has(name)) required.add(name);
        return;
      }
      case "PREFIX_OPERATOR":
        visit(n.params[0], "FAIL", g);
        return;
      case "INFIX_OPERATOR": {
        const [l, r] = n.params;
        if (EQ_INFIX.has(n.value)) {
          visit(l, "SAFE", g);
          visit(r, "SAFE", g);
        } else if (n.value === "&&") {
          visit(l, "FAIL", g);
          visit(r, "FAIL", union(g, nonNullIfTrue(l)));
        } else if (n.value === "||") {
          visit(l, "FAIL", g);
          visit(r, "FAIL", union(g, nonNullIfFalse(l)));
        } else if (FAIL_INFIX.has(n.value)) {
          visit(l, "FAIL", g);
          visit(r, "FAIL", g);
        } else {
          visit(l, "FAIL", g);
          visit(r, "FAIL", g);
        }
        return;
      }
      case "FUNCTION": {
        const params = n.params ?? [];
        const name = n.value.toUpperCase();
        const policy: NullPolicy = FUNCTION_TABLE.get(name)?.nullPolicy ?? "fail";
        if (name === "IF" && params.length === 3) {
          const [c, a, b] = params;
          visit(c, "SAFE", g);
          visit(a, ctx, union(g, nonNullIfTrue(c)));
          visit(b, ctx, union(g, nonNullIfFalse(c)));
          return;
        }
        params.forEach((p, i) => visit(p, argContext(policy, i, params.length, ctx), g));
        return;
      }
      default:
        return;
    }
  };

  visit(ast, "FAIL", new Set());
  return { required: seen.filter((x) => required.has(x)), optional: seen.filter((x) => !required.has(x)) };
}

function argContext(policy: NullPolicy, i: number, count: number, parent: Ctx): Ctx {
  if (typeof policy === "string") return ctxOf(policy, parent);
  if ("args" in policy) return ctxOf(policy.args[Math.min(i, policy.args.length - 1)], parent);
  if ("notLast" in policy) return ctxOf(i < count - 1 ? policy.notLast : policy.last, parent);
  // SWITCH(v, m1, r1, m2, r2, …[, 기본값]) — 첫 인자와 비교 값은 SAFE, 결과·기본값은 바깥 문맥.
  if (i === 0) return ctxOf(policy.first, parent);
  const isDefault = count % 2 === 0 && i === count - 1;
  return ctxOf(!isDefault && i % 2 === 1 ? policy.matchValues : policy.results, parent);
}
