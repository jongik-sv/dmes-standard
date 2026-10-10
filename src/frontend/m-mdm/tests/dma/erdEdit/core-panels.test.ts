/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { localNotice, noticeFromRejection } from "../../../pages/dma/erdEdit/edit-context";
import { historyRows } from "../../../pages/dma/erdEdit/panels/ChangeLog";
import { NoticeBar } from "../../../pages/dma/erdEdit/panels/NoticeBar";
import { presenceAvatars } from "../../../pages/dma/erdEdit/panels/TopBar";
import type { ErdClaim, ErdDelta, ErdPresence } from "../../../pages/dma/erdEdit/types";

let host: HTMLDivElement;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});
async function render(el: ReturnType<typeof createElement>) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, el));
  });
}
const byTestId = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe("알림 띠(스펙 4.5)", () => {
  it("CONFLICT 에 내 값이 있으면 [내 값 복사] 를 보이고, 끊김 알림에는 없다", async () => {
    const n = noticeFromRejection({
      code: "CONFLICT", commandIndex: 0, message: "다른 세션이 먼저 바꾼 값입니다", hint: "getChangesSince(3) 로 읽고 다시 보내세요",
      elementId: "c-4", property: "logical", byRev: 4, bySession: "ui-peer", byUserId: "41000207", current: "역할설명", choices: null, ownerId: null,
    }, [{ op: "updateColumn", id: "c-4", set: { logical: "메뉴이름" } }]);
    await render(createElement(NoticeBar, { notice: n, onClose: () => undefined }));
    expect(byTestId("erd-notice")?.dataset.code).toBe("CONFLICT");
    expect(byTestId("erd-notice-mine")?.textContent).toContain('"메뉴이름"');
    expect(byTestId("erd-notice-copy")?.textContent).toContain("내 값 복사");
    act(() => root?.unmount());
    await render(createElement(NoticeBar, { notice: localNotice("NETWORK", "끊겼습니다"), onClose: () => undefined }));
    expect(byTestId("erd-notice-copy")).toBeNull();
  });
});

describe("접속자 동그라미(D17, S2-11)", () => {
  it("나 → 사람 → Claude·CLI 순서로 보이고, 만료된 시한 항목은 빼며, 살아 있는 작업 중 표 수를 적는다", () => {
    const now = Date.parse("2026-10-11T05:15:00Z");
    const p = (session: string, userId: string, source: ErdPresence["source"], expiresAt: string | null = null): ErdPresence =>
      ({ session, userId, source, diagramId: null, selectedTables: [], at: "2026-10-11T05:10:00Z", expiresAt });
    const list = [
      p("claude-1a2b3c4d", "erd-mcp-a", "MCP", "2026-10-11T05:21:40Z"), p("cli-old", "erd-cli", "CLI", "2026-10-11T05:10:00Z"),
      p("ui-peer", "41000207", "UI"), p("ui-me", "tester", "UI"),
    ];
    const claims: ErdClaim[] = [
      { tableId: "t-1", session: "claude-1a2b3c4d", userId: "erd-mcp-a", expiresAt: "2026-10-11T05:20:00Z" },
      { tableId: "t-2", session: "claude-1a2b3c4d", userId: "erd-mcp-a", expiresAt: "2026-10-11T05:00:00Z" },
    ];
    const a = presenceAvatars(list, claims, "ui-me", now);
    expect(a.map((x) => [x.session, x.label, x.source])).toEqual([
      ["ui-me", "나", "ui"], ["ui-peer", "41000207", "ui"], ["claude-1a2b3c4d", "claude-1a2b3c4d", "llm"],
    ]);
    expect(a[2].title).toContain("erd-mcp-a");
    expect(a[2].title).toContain("까지");
    expect(a[2].title).toContain("작업 중 표 1개");
  });
});

describe("변경 기록 행", () => {
  it("최근 rev 부터 쓰고 내 세션 행에 '나' 를 단다", () => {
    const d = (rev: number, session: string): ErdDelta => ({ modelId: "mcm", rev, userId: "u", session, source: "UI", changes: [] });
    const rows = historyRows({ rev: 5, reload: false, deltas: [d(4, "ui-me"), d(5, "ui-peer")] }, "ui-me");
    expect(rows.map((r) => [r.rev, r.who])).toEqual([[5, ""], [4, "나"]]);
  });
});
