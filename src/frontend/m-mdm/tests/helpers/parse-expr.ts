import type { AstNode, InfixOperator, PrefixOperator } from "../../src/contract/engine-contract.generated";

/**
 * 테스트 전용 식 파서 — 식 텍스트를 EvalEx 3.7.0 이 만드는 AST 모양으로 바꾼다(TSK-03-04 design §8 Build 이탈 B1).
 *
 * 제품 코드는 AST 를 서버에서 받으므로 파서를 두지 않는다. 테스트가 식 텍스트로 룰·식을 적기 위한 도우미다.
 * 문법은 EvalEx 를 실측해 맞췄다(전위 > `^`(오른쪽 결합) > `* / %` > `+ -` > `< <= > >=` > `== = != <>` > `&&` > `||`,
 * 함수 이름은 적은 대로). `evalex-test-parser.test.ts` 가 코퍼스 식 82건의 서버 AST 와 같은지 확인한다.
 */
const PRECEDENCE: Record<string, number> = {
  "||": 2,
  "&&": 4,
  "==": 7,
  "=": 7,
  "!=": 7,
  "<>": 7,
  "<": 10,
  "<=": 10,
  ">": 10,
  ">=": 10,
  "+": 20,
  "-": 20,
  "*": 30,
  "/": 30,
  "%": 30,
  "^": 40,
};

type Tok = { k: "num" | "str" | "id" | "op"; v: string };

function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const num = /^(0[xX][0-9A-Fa-f]+|(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?)/.exec(s.slice(i));
    if (num && (/\d/.test(c) || (c === "." && /\d/.test(s[i + 1] ?? "")))) {
      out.push({ k: "num", v: num[0] });
      i += num[0].length;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let v = "";
      while (j < s.length && s[j] !== '"') {
        if (s[j] === "\\") {
          const n = s[j + 1];
          const map: Record<string, string> = { "\\": "\\", '"': '"', "'": "'", n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" };
          if (!(n in map)) throw new Error(`문자열 안의 \\${n}`);
          v += map[n];
          j += 2;
        } else {
          v += s[j++];
        }
      }
      if (j >= s.length) throw new Error("문자열이 닫히지 않았다");
      out.push({ k: "str", v });
      i = j + 1;
      continue;
    }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (id) {
      out.push({ k: "id", v: id[0] });
      i += id[0].length;
      continue;
    }
    const two = s.substr(i, 2);
    if (["&&", "||", "==", "!=", "<>", "<=", ">="].includes(two)) {
      out.push({ k: "op", v: two });
      i += 2;
      continue;
    }
    if ("+-*/%^<>=!(),".includes(c)) {
      out.push({ k: "op", v: c });
      i++;
      continue;
    }
    throw new Error(`알 수 없는 글자 ${c}`);
  }
  return out;
}

/** 식 텍스트 → AstNode. */
export function ast(text: string): AstNode {
  const t = tokenize(text);
  let p = 0;
  const peek = (): Tok | undefined => t[p];

  function primary(): AstNode {
    const k = t[p++];
    if (!k) throw new Error("식이 중간에 끝났다");
    if (k.k === "num") return { type: "NUMBER_LITERAL", value: k.v };
    if (k.k === "str") return { type: "STRING_LITERAL", value: k.v };
    if (k.k === "op" && (k.v === "-" || k.v === "+" || k.v === "!")) {
      return { type: "PREFIX_OPERATOR", value: k.v as PrefixOperator, params: [primary()] };
    }
    if (k.k === "op" && k.v === "(") {
      const e = expr(0);
      if (peek()?.v !== ")") throw new Error(") 가 없다");
      p++;
      return e;
    }
    if (k.k === "id") {
      if (peek()?.v === "(") {
        p++;
        const args: AstNode[] = [];
        if (peek()?.v === ")") {
          p++;
        } else {
          for (;;) {
            args.push(expr(0));
            const n = t[p++];
            if (!n) throw new Error(") 가 없다");
            if (n.v === ")") break;
            if (n.v !== ",") throw new Error(`${n.v} 자리에 , 가 와야 한다`);
          }
        }
        return args.length > 0
          ? { type: "FUNCTION", value: k.v, params: args as [AstNode, ...AstNode[]] }
          : { type: "FUNCTION", value: k.v };
      }
      return { type: "VARIABLE_OR_CONSTANT", value: k.v };
    }
    throw new Error(`${k.v} 가 올 자리가 아니다`);
  }

  function expr(min: number): AstNode {
    let left = primary();
    for (;;) {
      const o = peek();
      if (!o || o.k !== "op" || !(o.v in PRECEDENCE) || PRECEDENCE[o.v] < min) break;
      p++;
      const right = expr(o.v === "^" ? PRECEDENCE[o.v] : PRECEDENCE[o.v] + 1);
      left = { type: "INFIX_OPERATOR", value: o.v as InfixOperator, params: [left, right] };
    }
    return left;
  }

  const e = expr(0);
  if (p < t.length) throw new Error(`${t[p].v} 부터 남는다`);
  return e;
}
