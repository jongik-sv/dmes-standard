// SQL 편집기 자동 완성 분배 — 전역 제공자는 한 번만 등록하고, attach 한 모델에만 후보를 준다.
import type * as Monaco from "monaco-editor";
import { describe, expect, it } from "vitest";

import { attachCompletion, SQL_KEYWORDS, type SqlCompletionContext } from "../../src/components/code-editor";

type Provider = { provideCompletionItems(model: unknown, position: unknown): Promise<{ suggestions: Array<{ label: unknown; kind: number; insertText: string }> }> };

function fakeMonaco() {
  const registered: Array<{ lang: string; provider: Provider }> = [];
  const monaco = {
    languages: {
      CompletionItemKind: { Keyword: 1, Struct: 2, Field: 3, Variable: 4, Module: 5, Text: 6 },
      registerCompletionItemProvider: (lang: string, provider: Provider) => {
        registered.push({ lang, provider });
        return { dispose() {} };
      },
    },
  } as unknown as typeof Monaco;
  return { monaco, registered };
}

/** 한 줄짜리 가짜 모델 — 커서는 글 끝. */
function fakeModel(text: string) {
  const model = {
    getValue: () => text,
    getOffsetAt: () => text.length,
    getValueInRange: () => text,
    getWordUntilPosition: () => ({ word: text.split(/\W/).pop() ?? "", startColumn: 1, endColumn: text.length + 1 }),
  };
  return { model: model as unknown as Monaco.editor.ITextModel, position: { lineNumber: 1, column: text.length + 1 } };
}

const labelOf = (l: unknown) => (typeof l === "string" ? l : (l as { label: string }).label);

describe("attachCompletion — 전역 제공자 분배", () => {
  it("monaco 당 sql 제공자를 한 번만 등록한다", () => {
    const { monaco, registered } = fakeMonaco();
    attachCompletion(monaco, fakeModel("a").model, undefined);
    attachCompletion(monaco, fakeModel("b").model, undefined);
    expect(registered.map((r) => r.lang)).toEqual(["sql"]);
  });

  it("attach 하지 않은 모델에는 빈 목록을 준다", async () => {
    const { monaco, registered } = fakeMonaco();
    attachCompletion(monaco, fakeModel("x").model, undefined);
    const other = fakeModel("SEL");
    const r = await registered[0].provider.provideCompletionItems(other.model, other.position);
    expect(r.suggestions).toEqual([]);
  });

  it("attach 한 모델에는 키워드와 공급자 후보를 준다", async () => {
    const { monaco, registered } = fakeMonaco();
    const m = fakeModel("SELECT FR");
    attachCompletion(monaco, m.model, {
      provide: (ctx: SqlCompletionContext) => [{ label: "EMP", kind: "table", detail: "HR", insertText: "HR.EMP" }, { label: ctx.word, kind: "other" }],
    });
    const r = await registered[0].provider.provideCompletionItems(m.model, m.position);
    const labels = r.suggestions.map((s) => labelOf(s.label));
    expect(labels).toContain("EMP");
    expect(labels).toContain("FR");
    expect(labels).toContain(SQL_KEYWORDS[0]);
    const emp = r.suggestions.find((s) => labelOf(s.label) === "EMP")!;
    expect(emp.insertText).toBe("HR.EMP");
    expect(emp.kind).toBe(2);
  });

  it("keywords 가 false 를 돌려주면 키워드를 뺀다", async () => {
    const { monaco, registered } = fakeMonaco();
    const m = fakeModel("SELECT e.");
    attachCompletion(monaco, m.model, { provide: () => [{ label: "ENAME", kind: "column" }], keywords: (ctx) => !ctx.lineBefore.endsWith(".") });
    const r = await registered[0].provider.provideCompletionItems(m.model, m.position);
    expect(r.suggestions.map((s) => labelOf(s.label))).toEqual(["ENAME"]);
  });

  it("공급자가 던지면 키워드만 준다", async () => {
    const { monaco, registered } = fakeMonaco();
    const m = fakeModel("S");
    attachCompletion(monaco, m.model, {
      provide: () => {
        throw new Error("boom");
      },
    });
    const r = await registered[0].provider.provideCompletionItems(m.model, m.position);
    expect(r.suggestions).toHaveLength(SQL_KEYWORDS.length);
  });

  it("떼면 그 모델은 다시 빈 목록이다", async () => {
    const { monaco, registered } = fakeMonaco();
    const m = fakeModel("S");
    const detach = attachCompletion(monaco, m.model, undefined);
    expect((await registered[0].provider.provideCompletionItems(m.model, m.position)).suggestions.length).toBeGreaterThan(0);
    detach();
    expect((await registered[0].provider.provideCompletionItems(m.model, m.position)).suggestions).toEqual([]);
  });
});
