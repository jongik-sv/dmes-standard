/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { localNotice, noticeFromRejection } from "../../../pages/dma/erdEdit/edit-context";
import { historyRows } from "../../../pages/dma/erdEdit/panels/ChangeLog";
import { IssueList, groupIssues } from "../../../pages/dma/erdEdit/panels/ConfirmDialog";
import { ModelRegisterModal } from "../../../pages/dma/erdEdit/panels/ModelRegisterModal";
import { NoticeBar } from "../../../pages/dma/erdEdit/panels/NoticeBar";
import { StartPanel, type StartPanelProps } from "../../../pages/dma/erdEdit/panels/StartPanel";
import { presenceAvatars } from "../../../pages/dma/erdEdit/panels/TopBar";
import type { ErdClaim, ErdDelta, ErdPresence } from "../../../pages/dma/erdEdit/types";
import { column, menuModel } from "./erd-fixtures";

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

  it("noticeShowsUserHintOnly — LLM 용 hint 는 보이지 않고 사람용 userHint 만 보인다. 번호(rev)는 title 로만(U27·U32)", async () => {
    const n = noticeFromRejection({
      code: "CONFLICT", commandIndex: 0, message: "다른 세션이 먼저 바꾼 값입니다", hint: "getChangesSince(212) 로 최신 값을 읽고 다시 보내세요",
      userHint: "화면이 최신 값으로 바뀌었습니다. 확인한 뒤 다시 고치세요.",
      elementId: "c-4", property: "logical", byRev: 215, bySession: "ui-peer", byUserId: "41000207", current: "역할설명", choices: null, ownerId: null,
    }, [{ op: "updateColumn", id: "c-4", set: { logical: "메뉴이름" } }]);
    await render(createElement(NoticeBar, { notice: n, onClose: () => undefined }));
    const text = byTestId("erd-notice")?.textContent ?? "";
    expect(text).not.toContain("getChangesSince");
    expect(text).not.toContain("rev ");
    expect(text).toContain("화면이 최신 값으로 바뀌었습니다. 확인한 뒤 다시 고치세요.");
    expect(byTestId("erd-notice")?.getAttribute("title")).toBe("번호 215");
  });
});

describe("확정 창 항목(U29·U30)", () => {
  it("묶음 머리는 한국어 이름 · 건수(title 은 코드), 감사 컬럼 항목에 '· 감사 컬럼', 검토 안 한 추정 관계 묶음은 그리지 않는다", async () => {
    const m = menuModel();
    m.tables["t-1"].columnOrder.push("c-a1");
    m.columns["c-a1"] = column("t-1", "C_AT", "생성일시");
    const issues = [
      { code: "ERD_STD_DOMAIN", message: "TB_MCM_SEC_MENU.C_AT 표준 위반(DOMAIN)", field: "column", itemKey: "c-a1" },
      { code: "ERD_STD_DOMAIN", message: "TB_MCM_SEC_MENU.MENU_ID 표준 위반(DOMAIN)", field: "column", itemKey: "c-1" },
      { code: "ERD_STD_MISS", message: "모르는 컬럼 표준 위반(MISS)", field: "column", itemKey: "c-gone" },
      { code: "ERD_INFERRED_LEFT", message: "검토하지 않은 추정 관계 1개", field: "relation", itemKey: null },
    ];
    await render(createElement(IssueList, { title: "경고", groups: groupIssues(issues), testId: "w", model: m }));
    const dom = byTestId("w-ERD_STD_DOMAIN");
    expect(dom?.querySelector(".erd-confirm__code")?.textContent).toBe("도메인 다름 · 2건");
    expect(dom?.querySelector(".erd-confirm__code")?.getAttribute("title")).toBe("ERD_STD_DOMAIN");
    expect([...(dom?.querySelectorAll("li") ?? [])].map((li) => li.textContent)).toEqual([
      "TB_MCM_SEC_MENU.C_AT (생성일시) · 감사 컬럼", "TB_MCM_SEC_MENU.MENU_ID (메뉴아이디)",
    ]);
    expect(byTestId("w-ERD_STD_MISS")?.querySelector("li")?.textContent).toBe("모르는 컬럼 표준 위반(MISS)");
    expect(byTestId("w-ERD_INFERRED_LEFT")).toBeNull();
    expect(byTestId("w")?.textContent).not.toContain("ERD_STD_");
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

describe("빈 상태 시작 화면(U45)", () => {
  const base: StartPanelProps = {
    models: [], modelId: null, loading: false, error: null, empty: false, canReg: true, canImport: true, importLocked: false,
    onPick: () => undefined, onRegister: () => undefined, onImport: () => undefined,
  };

  it("모델이 하나도 없으면 [새 모델 등록] 만, 권한이 없으면 그 단추를 끄고 이유를 단다", async () => {
    const onRegister = vi.fn();
    await render(createElement(StartPanel, { ...base, onRegister }));
    expect(byTestId("erd-start")?.textContent).toContain("등록된 모델이 없습니다.");
    await act(async () => {
      byTestId("erd-start-reg")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRegister).toHaveBeenCalledTimes(1);
    act(() => root?.unmount());
    await render(createElement(StartPanel, { ...base, canReg: false }));
    expect((byTestId("erd-start-reg") as HTMLButtonElement).disabled).toBe(true);
    expect(byTestId("erd-start-reg")?.closest("[title]")?.getAttribute("title")).toBe("권한 없음");
  });

  it("표가 없는 모델은 [DB 에서 가져오기] 를 보이고, 막혀 있으면 끄고 이유를 단다", async () => {
    await render(createElement(StartPanel, { ...base, modelId: "mcm", empty: true, importLocked: true }));
    expect(byTestId("erd-start")?.textContent).toContain("표가 없습니다. DB 스키마를 가져오면 표·관계를 만듭니다.");
    const btn = byTestId("erd-start-import") as HTMLButtonElement;
    expect(btn.textContent).toBe("DB 에서 가져오기");
    expect(btn.disabled).toBe(true);
    expect(btn.closest("[title]")?.getAttribute("title")).toBeTruthy();
  });
});

describe("모델 등록 창", () => {
  it("칸마다 라벨이 있고, 등록이 실패하면 창을 열어 둔다", async () => {
    const onClose = vi.fn();
    const onRegister = vi.fn(async () => false);
    await render(createElement(ModelRegisterModal, { opened: true, onClose, onRegister }));
    const modal = document.querySelector<HTMLElement>('[data-testid="erd-reg-modal"]');
    expect(modal).not.toBeNull();
    const labels = [...(modal?.querySelectorAll("label") ?? [])].map((l) => l.textContent);
    expect(labels).toEqual(["모델 ID", "모듈", "스키마", "모델 이름"]);
    const input = modal!.querySelector<HTMLInputElement>('[data-testid="erd-reg-modelId"]');
    expect(input?.id).toBeTruthy();
    expect(modal!.querySelector(`label[for="${input!.id}"]`)?.textContent).toBe("모델 ID");
    await act(async () => {
      document.querySelector<HTMLElement>('[data-testid="erd-reg-submit"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRegister).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("변경 기록 행", () => {
  it("최근 rev 부터 쓰고 내 세션 행에 '나' 를 단다", () => {
    const d = (rev: number, session: string): ErdDelta => ({ modelId: "mcm", rev, userId: "u", session, source: "UI", changes: [] });
    const rows = historyRows({ rev: 5, reload: false, deltas: [d(4, "ui-me"), d(5, "ui-peer")] }, "ui-me");
    expect(rows.map((r) => [r.rev, r.who, r.whoTitle])).toEqual([[5, "u", "ui-peer · 화면"], [4, "나", "ui-me · 화면"]]);
  });
});
