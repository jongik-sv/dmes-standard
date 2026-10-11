import { describe, expect, it } from "vitest";

import { isDiagramOp, noticeFromRejection } from "../../../pages/dma/erdEdit/edit-context";
import { applyDelta, withVersion } from "../../../pages/dma/erdEdit/state/model-delta";
import {
  LOST_TEXT, NO_OWNER_DIAGRAM_TEXT, NO_RIGHT_TEXT, RELEASED_TEXT, blockedNotice, editRights, notEditorText, readOnlyBanner, readOnlyKind, shortReason,
} from "../../../pages/dma/erdEdit/state/permissions";
import type { ErdRejection } from "../../../pages/dma/erdEdit/types";
import { MENU_DIAGRAMS, menuModel, stateOf } from "./erd-fixtures";

const ALL = { loading: false, save: true, confirm: true, execute: true };
const conflict: ErdRejection = {
  code: "CONFLICT", commandIndex: 1, message: "다른 세션이 먼저 바꾼 값입니다", hint: "getChangesSince(212) 로 바뀐 값을 읽고 다시 보내세요",
  elementId: "c-4", property: "logical", byRev: 215, bySession: "ui-ab12cd34", byUserId: "41000207", current: "역할설명", choices: null, ownerId: null,
};

describe("거절 → 알림(스펙 4.5, S2-13)", () => {
  it("CONFLICT 는 바꾼 사용자·지금 값을 문구로 쓰고(번호는 title 로만, U32), 거절된 명령의 set[property] 를 내 값으로 둔다", () => {
    const n = noticeFromRejection({ ...conflict, userHint: "화면이 최신 값으로 바뀌었습니다. 확인한 뒤 다시 고치세요." },
      [{ op: "updateTable", id: "t-1", set: { logical: "메뉴" } }, { op: "updateColumn", id: "c-4", set: { logical: "메뉴이름" } }]);
    expect(n).toMatchObject({ code: "CONFLICT", label: "충돌", elementId: "c-4", property: "logical", byRev: 215, byUserId: "41000207", mine: "메뉴이름" });
    expect(n.message).toBe('41000207 님이 먼저 바꿨습니다. 지금 값: "역할설명"');
    expect(n.title).toBe("번호 215");
    expect(n.hint).toBe("화면이 최신 값으로 바뀌었습니다. 확인한 뒤 다시 고치세요.");
  });

  it("hint 만 있고 userHint 가 없으면(LLM 용 글뿐) 안내를 보이지 않는다(U27)", () => {
    const n = noticeFromRejection(conflict, []);
    expect(n.hint).toBeNull();
    expect(noticeFromRejection({ ...conflict, byRev: null }, []).title).toBeNull();
  });

  it("byUserId 가 없으면(단계 1 서버) 세션 이름을 쓰고, 모르는 코드는 INVALID, 거절 본문이 없어도 알림을 만든다", () => {
    const old = { ...conflict, code: "NOT_FOUND", byUserId: undefined } as unknown as ErdRejection;
    expect(noticeFromRejection(old, []).message).toBe("ui-ab12cd34 님이 지웠습니다.");
    expect(noticeFromRejection({ ...conflict, code: "WHATEVER" }, []).code).toBe("INVALID");
    expect(noticeFromRejection(null, []).code).toBe("INVALID");
    expect(isDiagramOp("moveNodes")).toBe(true);
    expect(isDiagramOp("restoreDiagram")).toBe(true);
    expect(isDiagramOp("updateColumn")).toBe(false);
  });
});

describe("화면 권한 나누기(S2-20)", () => {
  const draft = stateOf(menuModel(), MENU_DIAGRAMS); // DRAFT, 소유자 tester

  it("DRAFT 의 소유자·공동 편집자는 모델·다이어그램을 고치고, 확정·편집자 관리는 소유자만 한다", () => {
    const owner = editRights(draft, "tester", ALL, true);
    expect([owner.model.ok, owner.diagram.ok, owner.confirm.ok, owner.manageEditors.ok, owner.owner]).toEqual([true, true, true, true, true]);
    const mate = editRights({ ...draft, editors: ["mate"] }, "mate", ALL, true);
    expect([mate.model.ok, mate.diagram.ok, mate.confirm.ok, mate.manageEditors.ok, mate.owner]).toEqual([true, true, false, false, false]);
    expect(mate.confirm.reason).toContain("소유자(tester)");
    const stranger = editRights(draft, "stranger", ALL, true);
    expect(stranger.model.reason).toContain("소유자(tester)");
    expect(editRights(draft, "tester", { ...ALL, save: false }, true).model.reason).toBe(NO_RIGHT_TEXT);
  });

  it("RELEASED 는 모델을 막고 그 버전 소유자의 다이어그램 편집은 둔다. 소유자가 없으면 deferred 37 문구를 보인다", () => {
    const released = editRights({ ...draft, status: "RELEASED" }, "tester", ALL, true);
    expect(released.model).toEqual({ ok: false, reason: RELEASED_TEXT });
    expect(released.diagram.ok).toBe(true);
    expect(readOnlyBanner(released)).toBe(RELEASED_TEXT);
    const orphan = editRights({ ...draft, status: "RELEASED", ownerId: null, editors: ["tester"] }, "tester", ALL, true);
    expect(orphan.diagram).toEqual({ ok: false, reason: NO_OWNER_DIAGRAM_TEXT });
    expect(readOnlyBanner(orphan)).toBe(NO_OWNER_DIAGRAM_TEXT);
    // R7-1: 소유자가 없으면 공동 편집자를 인정하지 않는다
    expect(editRights({ ...draft, ownerId: null, editors: ["tester"] }, "tester", ALL, true).model.ok).toBe(false);
  });

  it("연결이 끊기면 고칠 수 있던 권한도 끊김 이유로 막고, 띠는 끊김 띠에 맡긴다", () => {
    const lost = editRights(draft, "tester", ALL, false);
    expect(lost.model).toEqual({ ok: false, reason: LOST_TEXT });
    expect(lost.diagram.reason).toBe(LOST_TEXT);
    expect(readOnlyBanner(lost)).toBeNull();
    expect(blockedNotice(lost, false, true)?.code).toBe("NETWORK");
    const released = editRights({ ...draft, status: "RELEASED" }, "tester", ALL, true);
    expect(blockedNotice(released, true, true)).toMatchObject({ code: "NOT_EDITOR", message: RELEASED_TEXT, hint: "[읽기 전용] 표시를 눌러 이유를 보세요." });
    expect(blockedNotice(released, true, false)).toBeNull(); // 다이어그램 명령만이면 통과
    expect(editRights(draft, "tester", { ...ALL, loading: true }, true).model).toEqual({ ok: false, reason: null });
  });
});

describe("짧은 이유·읽기 전용 종류(UX 1차 U19)", () => {
  const draft = stateOf(menuModel(), MENU_DIAGRAMS);

  it("긴 이유를 짧게 줄이고, 모르는 글은 그대로 둔다", () => {
    expect(shortReason(NO_RIGHT_TEXT)).toBe("권한 없음");
    expect(shortReason(RELEASED_TEXT)).toBe("확정된 버전");
    expect(shortReason(notEditorText("tester"))).toBe("공동 편집자 아님");
    expect(shortReason(NO_OWNER_DIAGRAM_TEXT)).toBe("소유자 없음");
    expect(shortReason(LOST_TEXT)).toBe("연결 끊김");
    expect(shortReason(null)).toBe("");
    expect(shortReason("다른 글")).toBe("다른 글");
  });

  it("readOnlyKind 는 readOnlyBanner 와 같은 분기로 종류를 돌려준다", () => {
    expect(readOnlyKind(editRights(draft, "tester", { ...ALL, save: false }, true))).toBe("noRight");
    expect(readOnlyKind(editRights({ ...draft, status: "RELEASED" }, "tester", ALL, true))).toBe("released");
    expect(readOnlyKind(editRights(draft, "stranger", ALL, true))).toBe("notEditor");
    expect(readOnlyKind(editRights({ ...draft, status: "RELEASED", ownerId: null, editors: ["tester"] }, "tester", ALL, true))).toBe("noOwner");
    // 고칠 수 있거나 끊김뿐이면 칩이 없다
    expect(readOnlyKind(editRights(draft, "tester", ALL, true))).toBeNull();
    expect(readOnlyKind(editRights(draft, "tester", ALL, false))).toBeNull();
  });
});

describe("버전 칸(S2-12, deferred 39)", () => {
  it("change 의 rowVersion 이 있을 때만 바꾸고, version 이벤트는 버전 칸만 바꾼다(같으면 같은 객체)", () => {
    const s = stateOf(menuModel(), MENU_DIAGRAMS);
    const base = { modelId: "mcm", userId: "u", session: "ui-x", source: "UI" as const, changes: [] };
    const a = applyDelta(s, { ...base, rev: 4, rowVersion: 13 });
    expect(a.kind === "applied" && a.state.rowVersion).toBe(13);
    const b = applyDelta(s, { ...base, rev: 4 });
    expect(b.kind === "applied" && b.state.rowVersion).toBe(0);
    const ev = { modelId: "mcm", ver: "1.000", status: "DRAFT", ownerId: "tester", editors: [] as string[], rowVersion: 0,
      reason: "SUBSCRIBE" as const, userId: "tester", at: "2026-10-11T05:10:03.120Z" };
    expect(withVersion(s, ev)).toBe(s);
    const next = withVersion(s, { ...ev, editors: ["mate"], rowVersion: 2, reason: "ADD_EDITOR" });
    expect([next.editors, next.rowVersion, next.model === s.model]).toEqual([["mate"], 2, true]);
  });
});
