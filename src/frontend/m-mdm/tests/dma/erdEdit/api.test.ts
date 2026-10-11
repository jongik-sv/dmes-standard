import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addEditor, applyCommands, applyDbDiff, claimTable, compareDbDiff, confirmVersion, decideRelation, deleteDraft, importFromDb,
  lockDraft, newVersion, previewName, rejectionText, releaseTable, removeEditor, searchModels, setViewState, undoRev, unlockDraft,
  validateConfirm, viewChanges, viewStatus,
} from "../../../pages/dma/erdEdit/api";

const originalFetch = globalThis.fetch;
let calls: Array<{ url: string; body: { meta: { menuId: string }; params: Record<string, unknown> } }> = [];

/** 응답 본문을 그대로 돌려주는 fetch. */
function stubBody(body: unknown) {
  calls = [];
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}

/** 객체 결과 — 서버는 `data.result` 로 준다. */
function stub(result: unknown, success = true) {
  const meta = success ? { success: true } : { success: false, message: "이미 표가 있습니다" };
  stubBody({ meta, data: { result } });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("erdEdit api", () => {
  it("search 는 서버가 grids.result.rows 로 준 목록을 돌려준다", async () => {
    // 실제 서버 모양: 서비스가 List 를 돌려주면 OASIS 는 data 가 아니라 grids.<output>.rows 로 싣는다(data 는 빈 객체).
    const row = { modelId: "mcm", moduleId: "mcm", schemaName: "MCMAPUSER", modelName: "MCM 스키마", rev: 3, draftVer: "1.000", ownerId: "tester" };
    stubBody({ meta: { success: true }, data: {}, grids: { result: { rows: [row, { ...row, modelId: "mdm", modelName: "MDM 스키마" }] } } });
    const rows = await searchModels();
    expect(rows.map((r) => r.modelId)).toEqual(["mcm", "mdm"]);
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
      userHint: "소유자에게 공동 편집자 등록을 요청하세요",
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

  it("단계 2 함수는 README 정본 params 로 보낸다(배열은 JSON 문자열, false·0 은 그대로)", async () => {
    stub({});
    await applyCommands("mcm", 212, "ui-a", [{ op: "updateColumn", id: "c-1", set: { logical: "메뉴명" } }]);
    await undoRev("mcm", 215, "ui-a");
    await previewName({ logical: "메뉴명" });
    await applyDbDiff("mcm", 230, "ui-a", ["COLUMN_CHANGED:TB_A.B", "FK_ADDED:TB_A(X)>TB_B(X)"]);
    await claimTable("mcm", "t-1", "ui-a");
    await releaseTable("mcm", "t-1", "ui-a");
    await addEditor("mcm", "erd-mcp-a");
    await removeEditor("mcm", "erd-mcp-a");
    await newVersion("mcm", "MINOR");
    await deleteDraft("mcm", "1.001", 0);
    await lockDraft("mcm", "1.001", 3);
    await unlockDraft("mcm", "1.001", 4);
    await validateConfirm("mcm");
    await confirmVersion("mcm", "1.001", 5, false, "2026-10-11 14:20:00");
    expect(calls.map((c) => [c.url.split("/").pop(), c.body.params])).toEqual([
      ["save", { modelId: "mcm", baseRev: 212, session: "ui-a", source: "UI", commandsJson: '[{"op":"updateColumn","id":"c-1","set":{"logical":"메뉴명"}}]' }],
      ["restore", { modelId: "mcm", rev: 215, session: "ui-a", source: "UI" }],
      ["compare", { logical: "메뉴명" }],
      ["import", { modelId: "mcm", baseRev: 230, session: "ui-a", source: "UI", kind: "APPLY_DIFF",
        itemsJson: '["COLUMN_CHANGED:TB_A.B","FK_ADDED:TB_A(X)>TB_B(X)"]' }],
      ["execute", { modelId: "mcm", kind: "CLAIM", tableId: "t-1", session: "ui-a", source: "UI" }],
      ["execute", { modelId: "mcm", kind: "RELEASE", tableId: "t-1", session: "ui-a", source: "UI" }],
      ["execute", { modelId: "mcm", kind: "ADD_EDITOR", userId: "erd-mcp-a" }],
      ["execute", { modelId: "mcm", kind: "REMOVE_EDITOR", userId: "erd-mcp-a" }],
      ["copy", { modelId: "mcm", verKind: "MINOR" }],
      ["delete", { modelId: "mcm", ver: "1.001", rowVersion: 0 }],
      ["lock", { modelId: "mcm", ver: "1.001", rowVersion: 3 }],
      ["unlock", { modelId: "mcm", ver: "1.001", rowVersion: 4 }],
      ["validate", { modelId: "mcm" }],
      ["confirm", { modelId: "mcm", ver: "1.001", rowVersion: 5, warningsAcknowledged: false, applyFrom: "2026-10-11 14:20:00" }],
    ]);
  });
});
