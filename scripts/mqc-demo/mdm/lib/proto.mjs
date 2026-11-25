// 프로토타입(mes-to-be) 읽기 도우미 — HTML 안 JS 상수를 괄호 짝으로 잘라 vm 으로 값만 읽는다(함수 실행 없음).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

export const PROTO = process.env.MES_TO_BE || "/Users/donseok/orca/mes-to-be";

export function readModule(name) {
  return readFileSync(join(PROTO, "modules", name), "utf8");
}

export function readBuildJson(name) {
  return JSON.parse(readFileSync(join(PROTO, "build", name), "utf8"));
}

/** src 의 from 위치부터 첫 여는 괄호([ 또는 {)와 짝이 맞는 닫는 괄호까지 자른다(문자열·주석 건너뜀). */
export function sliceBalanced(src, from) {
  let i = from;
  while (i < src.length && src[i] !== "[" && src[i] !== "{") i++;
  const start = i;
  let depth = 0;
  let quote = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") { quote = c; continue; }
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i) + 1; continue; }
    if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("괄호 짝이 맞지 않는다");
}

/** `var|const|let NAME =` 다음 리터럴 값. */
export function literal(src, name) {
  const m = new RegExp(`(?:var|const|let)\\s+${name}\\s*=`).exec(src);
  if (!m) throw new Error(`상수 ${name} 를 찾지 못했다`);
  return evalLiteral(sliceBalanced(src, m.index + m[0].length));
}

/** 리터럴 텍스트를 값으로. helpers 로 리터럴 안에서 부르는 작은 함수(rule 등)를 넘긴다. */
export function evalLiteral(text, helpers = {}) {
  return vm.runInNewContext(`(${text})`, { ...helpers }, { timeout: 1000 });
}

/** 정규식 첫 일치 다음 리터럴. */
export function literalAfter(src, re, helpers = {}) {
  const m = re.exec(src);
  if (!m) throw new Error(`패턴 ${re} 를 찾지 못했다`);
  return evalLiteral(sliceBalanced(src, m.index + m[0].length), helpers);
}
