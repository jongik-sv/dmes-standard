import { describe, expect, it } from "vitest";
import type { SqlCompletionContext } from "@dk-oasis/shared/code-editor";
import { createDbSqlCompletion } from "../../src/anl/db-viewer/sql-completion";

/** 커서가 글 끝인 맥락(문장 하나, 한 줄)을 만든다. */
function ctxOf(text: string): SqlCompletionContext {
  const line = text.slice(text.lastIndexOf("\n") + 1);
  return { textBefore: text, statement: text, lineBefore: line, word: /[\w$#]*$/.exec(text)?.[0] ?? "" };
}

const provider = createDbSqlCompletion({
  getTables: () => ({ HR: ["EMP", "DEPT"], MCM: ["JOB"] }),
  loadColumns: async (_schema, table) => (table === "EMP" ? ["EMP_NO", "ENAME"] : ["DEPT_NO"]),
});
const labels = async (text: string) => (await provider.provide(ctxOf(text))).map((i) => `${i.kind}:${i.label}`);

describe("DB 뷰어 자동 완성 공급자", () => {
  it("FROM 뒤 — 스키마와 표 이름만 보이고 키워드는 뺀다", async () => {
    const ctx = ctxOf("SELECT * FROM ");
    const items = await provider.provide(ctx);
    expect(items.filter((i) => i.kind === "module").map((i) => i.label).sort()).toEqual(["HR", "MCM"]);
    expect(items.filter((i) => i.kind === "table").map((i) => `${i.detail}.${i.label}`).sort()).toEqual(["HR.DEPT", "HR.EMP", "MCM.JOB"]);
    expect(items.find((i) => i.label === "HR")).toMatchObject({ insertText: "HR.", retrigger: true });
    expect(provider.keywords!(ctx)).toBe(false);
  });

  it("별칭 뒤 — 그 표의 칸만 보이고 키워드는 뺀다", async () => {
    const ctx = ctxOf("SELECT e. FROM EMP e");
    // 커서를 `e.` 뒤로 두려면 앞부분만 잘라 맥락을 만든다.
    const before = "SELECT e.";
    const c = { ...ctx, textBefore: before, lineBefore: before, word: "" };
    const items = await provider.provide(c);
    expect(items.map((i) => `${i.kind}:${i.label}`)).toEqual(["column:EMP_NO", "column:ENAME"]);
    expect(provider.keywords!(c)).toBe(false);
  });

  it("스키마 접두 뒤 — 그 스키마의 표를 낸다", async () => {
    const c = { ...ctxOf("SELECT * FROM HR."), word: "" };
    const items = await provider.provide(c);
    expect(items.map((i) => i.label).sort()).toEqual(["DEPT", "EMP"]);
    expect(items.find((i) => i.label === "EMP")!.insertText).toBe("EMP");
  });

  it("알 수 없는 접두 뒤 — 비운다", async () => {
    expect(await labels("SELECT x.")).toEqual([]);
  });

  it("그 밖 — FROM 표의 칸과 표 이름을 내고 키워드를 허용한다", async () => {
    const text = "SELECT  FROM EMP e";
    const ctx = { ...ctxOf(text), textBefore: "SELECT ", lineBefore: "SELECT ", word: "" };
    const items = await provider.provide(ctx);
    expect(items.filter((i) => i.kind === "column").map((i) => i.label)).toEqual(["EMP_NO", "ENAME"]);
    expect(items.some((i) => i.kind === "table" && i.label === "JOB")).toBe(true);
    expect(provider.keywords!(ctx)).toBe(true);
  });

  it("칸을 못 불러오면 칸 없이 나머지를 낸다", async () => {
    const failing = createDbSqlCompletion({ getTables: () => ({ HR: ["EMP"] }), loadColumns: async () => Promise.reject(new Error("x")) });
    const ctx = { ...ctxOf("SELECT  FROM EMP"), textBefore: "SELECT ", lineBefore: "SELECT ", word: "" };
    const items = await failing.provide(ctx);
    expect(items.some((i) => i.kind === "column")).toBe(false);
    expect(items.some((i) => i.kind === "table")).toBe(true);
  });
});
