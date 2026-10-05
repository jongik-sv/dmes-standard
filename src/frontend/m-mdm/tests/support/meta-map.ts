/**
 * 화면 소스에서 「컬럼 사전 연결(meta)」 지정을 정적으로 뽑는다 — 열 정의(`{ key: ... }`)·`cell("키", ...)` 호출·`<MdmFieldLabel>` 마다 효과 meta 값을 적는다.
 * 효과 값: `false`(연결 끔) · `"문자열"`(명시 물리명) · `-`(지정 없음 → key·name 을 물리명으로 바꿔 찾는다).
 * 열 도우미 `uiCols(열 배열, 사전 key 목록)` 안의 열은 meta 를 따로 적지 않았으면 key 가 목록에 있을 때만 `-`, 아니면 `false` 다(도우미의 규칙).
 * 라벨 상수 `DESCRIPTION_LABEL`·`SOURCE_LABEL` 의 펼침은 상수가 정한 값으로 푼다.
 * 결과는 파일마다 정렬한 문자열 목록이다 — 순서가 아니라 「어떤 칸이 어떤 meta 로 이어지는가」를 비교한다.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/** 라벨 상수 — 소스의 상수 정의와 같은 값이어야 한다(상수가 바뀌면 이 표도 함께 고친다). */
const LABEL_CONSTANTS: Record<string, { name: string; label: string; meta: string }> = {
  DESCRIPTION_LABEL: { name: "description", label: "설명", meta: "false" },
  SOURCE_LABEL: { name: "source", label: "원천", meta: "false" },
};

/** 여러 줄 식을 한 줄로. */
const squash = (t: string) => t.replace(/\s+/g, " ");

function literalText(node: ts.Node | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteralLike(node)) return node.text;
  return null;
}

function metaOfExpr(expr: ts.Expression | undefined): string {
  if (!expr) return "-";
  while (ts.isAsExpression(expr) || ts.isParenthesizedExpression(expr) || ts.isSatisfiesExpression(expr)) expr = expr.expression;
  if (expr.kind === ts.SyntaxKind.FalseKeyword) return "false";
  const text = literalText(expr);
  if (text != null) return JSON.stringify(text);
  return `(식:${squash(expr.getText())})`;
}

function propOf(obj: ts.ObjectLiteralExpression, name: string): ts.PropertyAssignment | undefined {
  return obj.properties.find(
    (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name
  );
}

/** `uiCols(...)` 호출의 첫 인자 안에 있으면 그 호출의 사전 key 목록, 아니면 null. */
function uiColsContext(node: ts.Node): Set<string> | null {
  for (let cur: ts.Node | undefined = node.parent, child: ts.Node = node; cur; child = cur, cur = cur.parent) {
    if (ts.isCallExpression(cur) && ts.isIdentifier(cur.expression) && cur.expression.text === "uiCols" && cur.arguments[0] === child) {
      const dict = new Set<string>();
      const second = cur.arguments[1];
      if (second && ts.isArrayLiteralExpression(second)) {
        for (const el of second.elements) {
          const t = literalText(el);
          if (t != null) dict.add(t);
        }
      }
      return dict;
    }
  }
  return null;
}

export function metaEntriesOf(source: string, fileName = "x.tsx"): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const keyText = literalText(propOf(node, "key")?.initializer);
      if (keyText != null) {
        const explicit = propOf(node, "meta");
        const dict = uiColsContext(node);
        let meta = explicit ? metaOfExpr(explicit.initializer) : "-";
        if (!explicit && dict && !dict.has(keyText)) meta = "false";
        out.push(`col|${keyText}|${meta}`);
      }
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "uiCols") {
      // 추출기는 열 배열·사전 key 목록이 리터럴일 때만 효과 meta 를 정확히 안다 — 변수·펼침이면 소리 내어 멈춘다(조용히 어긋나지 않게).
      const [cols, dict] = node.arguments;
      const literalDict = !dict || (ts.isArrayLiteralExpression(dict) && dict.elements.every((e) => ts.isStringLiteralLike(e)));
      if (!cols || !ts.isArrayLiteralExpression(cols) || !literalDict) {
        throw new Error(`${fileName}: uiCols 의 인자는 배열 리터럴(열)·문자열 리터럴 배열(사전 key)이어야 한다 — ${node.getText().slice(0, 60)}`);
      }
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "cell") {
      const keyText = literalText(node.arguments[0]);
      if (keyText != null) {
        const extra = node.arguments[3];
        const explicit = extra && ts.isObjectLiteralExpression(extra) ? propOf(extra, "meta") : undefined;
        out.push(`cell|${keyText}|${explicit ? metaOfExpr(explicit.initializer) : "-"}`);
      }
    } else if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      if (node.tagName.getText() === "MdmFieldLabel") {
        const attrs: Record<string, string> = { name: "", label: "", meta: "-" };
        for (const a of node.attributes.properties) {
          if (ts.isJsxAttribute(a)) {
            const n = a.name.getText();
            if (n !== "name" && n !== "label" && n !== "meta") continue;
            const init = a.initializer;
            if (n === "meta") {
              if (init && ts.isJsxExpression(init)) attrs.meta = metaOfExpr(init.expression);
              else if (init && ts.isStringLiteral(init)) attrs.meta = JSON.stringify(init.text);
              else attrs.meta = "-";
            } else if (init && ts.isStringLiteral(init)) attrs[n] = init.text;
            else if (init && ts.isJsxExpression(init) && init.expression) attrs[n] = `(식:${squash(init.expression.getText())})`;
          } else if (ts.isJsxSpreadAttribute(a)) {
            const c = LABEL_CONSTANTS[a.expression.getText()];
            if (c) Object.assign(attrs, c);
            else attrs.name = `(펼침:${a.expression.getText()})`;
          }
        }
        out.push(`label|${attrs.name}|${attrs.label}|${attrs.meta}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out.sort();
}

const SKIP_DIRS = new Set(["node_modules", "dist", ".next", "tests", "archive", "scripts", ".turbo"]);

/** 추출 대상이 아닌 파일 — D2 로 공급자가 meta 를 끈 편집기(별도 렌더 시험이 고정한다)와 도우미 정의. */
const EXCLUDED = new Set([
  "m-mcm/widget-types/chat/editor.tsx",
  "m-mcm/widget-types/query-chart/editor.tsx",
  "m-mcm/widget-types/query-number/editor.tsx",
  "m-mcm/widget-types/query-table/editor.tsx",
  // 도우미 정의 자신(안쪽 재귀 호출은 인자가 변수다).
  "m-mcm/lib/ui-meta.ts",
  "m-mdm/src/ui-meta.ts",
]);

function walk(dir: string, out: string[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out);
    } else if (/\.tsx?$/.test(e.name) && !/\.(test|d)\.tsx?$/.test(e.name)) out.push(path.join(dir, e.name));
  }
}

/** 모듈 폴더들의 소스에서 meta 를 한 번이라도 지정했거나 도우미(uiCols)를 쓴 파일의 효과 meta 목록. 키 = src/frontend 기준 상대 경로. */
export function collectMetaMap(frontendRoot: string, modules: string[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const m of modules) {
    const files: string[] = [];
    walk(path.join(frontendRoot, m), files);
    for (const f of files) {
      const rel = path.relative(frontendRoot, f).split(path.sep).join("/");
      if (EXCLUDED.has(rel)) continue;
      const src = fs.readFileSync(f, "utf8");
      if (!/meta\s*[:=]|uiCols|_LABEL\b/.test(src)) continue;
      const entries = metaEntriesOf(src, f);
      if (entries.length > 0) result[rel] = entries;
    }
  }
  return result;
}
