import { afterEach, describe, expect, it, vi } from "vitest";

import {
  compareDbDiff, decideRelation, importFromDb, rejectionText, searchModels, setViewState, viewChanges, viewStatus,
} from "../../../pages/dma/erdEdit/api";

const originalFetch = globalThis.fetch;
let calls: Array<{ url: string; body: { meta: { menuId: string }; params: Record<string, unknown> } }> = [];

function stub(result: unknown, success = true) {
  calls = [];
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    const meta = success ? { success: true } : { success: false, message: "이미 표가 있습니다" };
    return new Response(JSON.stringify({ meta, data: { result } }), { status: 200 });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("erdEdit api", () => {
  it("search 는 data.result 배열을 돌려준다", async () => {
    stub([{ modelId: "mcm", moduleId: "mcm", schemaName: "MCMAPUSER", modelName: "MCM 스키마", rev: 3, draftVer: "1.000", ownerId: "tester" }]);
    const rows = await searchModels();
    expect(rows.map((r) => r.modelId)).toEqual(["mcm"]);
    expect(calls[0].url).toBe("/api/mdm/oasis/erdEdit/search");
    expect(calls[0].body.meta.menuId).toBe("erdEdit");
  });

  it("SET_VIEW 는 view 액션에 viewJson 문자열로 보낸다", async () => {
    stub({ ok: true });
    await setViewState("mcm", "ui-abc", { diagramId: "d-1", selectedTables: ["t-1"] });
    expect(calls[0].url).toBe("/api/mdm/oasis/erdEdit/view");
    expect(calls[0].body.params).toEqual({
      modelId: "mcm", session: "ui-abc", kind: "SET_VIEW", viewJson: '{"diagramId":"d-1","selectedTables":["t-1"]}',
    });
  });

  it("STATUS·DB_DIFF·sinceRev 는 kind 와 숫자 0 을 그대로 싣는다", async () => {
    stub({});
    await viewStatus("mcm");
    await compareDbDiff("mcm");
    await viewChanges("mcm", 0);
    expect(calls.map((c) => [c.url.split("/").pop(), c.body.params])).toEqual([
      ["view", { modelId: "mcm", kind: "STATUS" }],
      ["compare", { modelId: "mcm", kind: "DB_DIFF" }],
      ["view", { modelId: "mcm", sinceRev: 0 }],
    ]);
  });

  it("관계 확정은 save 에 commandsJson 문자열을 보내고, 거절은 던지지 않고 applied=false 로 돌려준다", async () => {
    const rejection = { code: "NOT_EDITOR", commandIndex: 0, message: "이 DRAFT 를 고칠 권한이 없습니다", hint: "소유자에게 공동 편집자 등록을 요청하세요",
      elementId: null, property: null, byRev: null, bySession: null, current: null, choices: null, ownerId: "owner" };
    stub({ applied: false, rev: 0, changes: [], warnings: [], rejection });
    const r = await decideRelation("mcm", 0, "ui-abc", "confirmRelation", "r-1");
    expect(calls[0].url).toBe("/api/mdm/oasis/erdEdit/save");
    expect(calls[0].body.params).toEqual({
      modelId: "mcm", baseRev: 0, session: "ui-abc", source: "UI", commandsJson: '[{"op":"confirmRelation","id":"r-1"}]',
    });
    expect(r.applied).toBe(false);
    expect(rejectionText(r.rejection)).toBe("이 DRAFT 를 고칠 권한이 없습니다 — 소유자에게 공동 편집자 등록을 요청하세요");
  });

  it("가져오기는 import 액션에 kind=FROM_DB 와 baseRev 를 보내고, 업무 거부는 Error 로 던진다", async () => {
    stub({ applied: true, rev: 1, changes: [], warnings: [], rejection: null, summary: null });
    await importFromDb("mcm", 0, "ui-abc");
    expect(calls[0].url).toBe("/api/mdm/oasis/erdEdit/import");
    expect(calls[0].body.params).toEqual({ modelId: "mcm", baseRev: 0, session: "ui-abc", source: "UI", kind: "FROM_DB" });
    stub(null, false);
    await expect(importFromDb("mcm", 0, "ui-abc")).rejects.toThrow("이미 표가 있습니다");
  });
});
