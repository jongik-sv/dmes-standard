# ERD 도구 단계 2 — Task 9~11: 화면 코어(뼈대·두 층 모델·버전 막대)

> 공통 제약(Global Constraints)·단계 2 에서 정한 점(S2-1~S2-28)·Review Focus·인터페이스(정본)는 [README](README.md) 에 있다. 이 문서의 모든 Task 는 README 의 Global Constraints 를 따른다.
> 이전: [03-scripts.md](03-scripts.md) · [README](README.md) · 다음: [05-frontend-canvas.md](05-frontend-canvas.md)

레인 FE1 이 Task 9 → 10 → 11 을 차례로 한다. Task 9 는 다른 화면 레인(FE2 Task 13, FE3 Task 14)이 기대는 뼈대다. Task 9 를 끝내면 레인 커밋을 하나로 합쳐 **먼저 dev 에 머지**한다(조정 세션 허가). 그 뒤 Task 10·11 을 이어 간다.

공통 명령(모두 `src/frontend` 에서 부른다):

```bash
# 의존 패키지(shared 포함) 빌드 — m-mdm 시험은 @dk-oasis/shared/* 를 shared dist 로 푼다
pnpm --filter "@dk-oasis/m-mdm^..." build
# 이 문서의 화면 시험만
pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/
# 타입 검사(lint = tsc --noEmit). tsconfig 의 include 는 src·pages·app 이라 tests 폴더는 검사하지 않는다
pnpm --filter @dk-oasis/m-mdm lint
```

화면 폴더는 `src/frontend/m-mdm/pages/dma/erdEdit/`, 시험 폴더는 `src/frontend/m-mdm/tests/dma/erdEdit/` 다. m-mdm vitest 는 `tests/**/*.test.ts` 만 모은다. 그래서 렌더 시험도 `.test.ts` 로 쓰고 `createElement` 를 쓴다(`tests/shell/version-action-bar.test.ts` 도 같다, README 파일 구조).

---

### Task 9: 화면 뼈대 — 타입·API 전부, 편집 문맥, 자리 부품, 권한 나누기, 전역 키

**Files:**
- Modify: `src/frontend/m-mdm/pages/dma/erdEdit/types.ts` (README 화면 계약의 새 형 전부)
- Modify: `src/frontend/m-mdm/pages/dma/erdEdit/api.ts` (전부 다시 씀 — `erdCall` 과 단계 2 함수 전부)
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/edit-context.ts`
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/state/permissions.ts`
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/state/pending.ts` (형만. Task 10 이 채운다)
- Modify: `src/frontend/m-mdm/pages/dma/erdEdit/state/model-delta.ts` (`rowVersion`, `withVersion`)
- Modify: `src/frontend/m-mdm/pages/dma/erdEdit/state/useErdModel.ts` (서명·쓰기 줄·`apply`·`undo`·`exclusive`·`onVersion`)
- Modify: `src/frontend/m-mdm/pages/dma/erdEdit/ErdViewer.tsx` (전부 다시 씀)
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/canvas/useCanvasEditing.ts` (FE2 자리, 한 번만 만든다)
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/panels/{ColumnJump,DbDiffApply}.tsx` (FE3 자리, 한 번만 만든다)
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/panels/{NoticeBar,ChangeLog,VersionBar,ConfirmDialog,EditorsModal,core-styles}.tsx|ts`
- Modify (한 번만, 뼈대 연결): `panels/ColumnGrid.tsx`(FE3 소유) props, `panels/DiagramTree.tsx`(FE2 소유) props, `canvas/erd-styles.ts`(FE2 소유) 끝에 `CORE_CSS` 붙이기
- Modify: `panels/ReviewPanel.tsx`, `panels/TopBar.tsx`
- Test: `src/frontend/m-mdm/tests/dma/erdEdit/erd-fixtures.ts` (`fakeEditContext`), `edit-core.test.ts`(새), `api.test.ts`, `page-render.test.ts`, `panel-rows.test.ts`(import 경로), `erd-stream.test.ts`(훅 서명)

**Interfaces:**
- Consumes: README "화면 내부 계약" 전부, OASIS `erdEdit` 액션 표(`save`·`restore`·`compare`·`import kind=APPLY_DIFF`·`execute`·`copy`·`delete`·`lock`·`unlock`·`validate`·`confirm`), 단계 1 화면 코드(`ErdViewer`·`useErdModel`·`useErdStream`·`model-delta`·패널 4개), `@dk-oasis/shared/{http,form,grid,tabs,layout,react-flow,modal}`, `@/oasis-screen`.
- Produces (FE2·FE3·Task 10·11 이 쓴다):
  - `types.ts`: README 의 `ErdApplyResult`(+`rowVersion`·`dryRun`), `ErdRejection`(+`byUserId`), `ErdDelta`(+`rowVersion`), `ErdPresence`(+`expiresAt`), `ErdVersionReason`, `ErdVersionEvent`, `ErdClaimResult`, `ErdDiffApplySummary`, `ErdDiffApplyResult`, `ErdTermRef`, `ErdNameToken`, `ErdNamePreview`, `ErdCheckIssue`, `ErdConfirmCheck`, `ErdCommandJson`.
  - `api.ts`: `erdCall`, `applyCommands`, `undoRev`, `previewName`, `applyDbDiff`, `claimTable`, `releaseTable`, `addEditor`, `removeEditor`, `newVersion`, `deleteDraft`, `lockDraft`, `unlockDraft`, `validateConfirm`, `confirmVersion(modelId, ver, rowVersion, warningsAcknowledged, applyFrom)`(README 정본) + 단계 1 함수 그대로.
  - `edit-context.ts`: README 의 `Right`·`EditRights`·`ErdNotice`·`ApplyOutcome`·`ErdNav`·`ErdHighlight`·`ErdEditContext`(`selectedColumnId`·`exclusive` 포함, README 정본), `isDiagramOp`, `localNotice`, `noticeFromRejection`, `valueText`, `NOTICE_LABEL`.
  - `state/permissions.ts`: `editRights`, `readOnlyReason`, `readOnlyBanner`, `blockedNotice`, `isEditor`, 문구 상수.
  - `state/useErdModel.ts`: `useErdModel(modelId, session, me, load?)` → `ErdModelApi`(README 칸 + `pendingIds`·`exclusive`). Task 9 의 `apply`·`undo` 는 **실제로 보낸다**(한 번에 하나, 응답 델타를 단계 1 `applyDelta` 로 얹음, 거절은 `ErdNotice`). Task 10 이 속을 `pending.ts` 로 바꾸고 서명은 그대로 둔다.
  - `canvas/useCanvasEditing.ts`: `CanvasEditing`, `useCanvasEditing(ctx, rf)` (읽기 캔버스 기본값).
  - 자리 부품: `ColumnJump`, `DbDiffApply`(+`diffRows`), `ChangeLog`(+`historyRows`), `NoticeBar`, `VersionBar`, `ConfirmDialog`, `EditorsModal`.
  - 시험 도구: `fakeEditContext(state, over)`.

뼈대 계약(FE2·FE3 이 이것만 믿고 일한다):
1. 편집 문맥 `ctx` 는 모델을 다 읽은 뒤에만 있다(`ErdViewer` 가 `ready` 일 때 만든다). `ctx.state` 는 투영 값이다. Task 9 에서는 아래층과 같고, Task 10 부터 대기 묶음이 얹힌다.
2. 쓰기는 `ctx.apply(commands, label)` 하나다. 이 함수는 다음 순서로 판정한다.
   - 연결이 끊겼으면 NETWORK 알림으로 바로 거절한다.
   - 묶음에 모델 명령이 하나라도 있으면 `rights.model` 을, 다이어그램 명령만 있으면 `rights.diagram` 을 본다. 권한이 없으면 NOT_EDITOR 로 거절한다. 다이어그램 명령은 `isDiagramOp` 가 판정한다.
   - 거절 알림(NEEDS_CHOICE 밖)은 `ctx.apply` 가 스스로 `NoticeBar` 에 올린다. CONFLICT·NOT_FOUND·INVALID 이고 `elementId` 가 있으면 `ctx.highlight` 도 바꾼다.
   - NEEDS_CHOICE 는 부른 쪽이 `outcome.notice.choices` 로 선택 창을 띄우고 다시 보낸다.
3. apply 밖의 쓰기(`import kind=FROM_DB`·`APPLY_DIFF`)는 `ctx.exclusive(fn)` 안에서 부른다. 내 줄이 빌 때까지 기다렸다가 돌고, 도는 동안 다음 묶음을 보내지 않는다. 그 응답 델타는 얹지 않는다. 같은 rev 의 SSE `change` 나 다시 읽기로 들어온다. 이렇게 해야 내 세션의 다른 쓰기가 보내는 중인 묶음의 에코로 잘못 읽히지 않는다(Task 10).
4. 전역 키는 `ErdViewer` 가 window 캡처 단계에서 받는다. F3, Ctrl/⌘+T·K, Ctrl/⌘+O·Alt+O(`e.code === "KeyO"`), Ctrl/⌘+Z 다. 받은 키는 `preventDefault`·`stopPropagation` 한다. 그래서 캔버스 host 의 `onKeyDown`(FE2)·그리드 div 의 `onKeyDownCapture`(FE3)는 이 키를 받지 않는다. **FE2·FE3 은 Ctrl+Z 를 다시 걸지 않는다.**
5. `useCanvasEditing` 이 돌려주는 함수(`onNodesChange`·`decorateNodes`·`onKeyDown`)는 `useCallback` 으로 안정된 참조여야 한다. `CanvasPane` 이 `decorateNodes` 를 `useMemo` 의존성으로 쓴다(Local-Rules §19).
6. `ColumnJump` 는 열렸을 때 바깥 요소에 `data-testid="erd-column-jump"` 를 단다. Task 9 의 Alt+O 시험이 그 이름을 본다.
7. 화면 스타일: FE1 부품의 규칙은 `panels/core-styles.ts` 의 `CORE_CSS` 에 둔다. Task 9 가 `canvas/erd-styles.ts` 끝에 한 번 붙인다. 그 뒤 FE1 은 `canvas/erd-styles.ts` 를 고치지 않는다.

- [ ] **Step 1: 시험 공용 도구 — `fakeEditContext`**

`src/frontend/m-mdm/tests/dma/erdEdit/erd-fixtures.ts` 맨 위 import 를 바꾸고, 파일 끝에 함수를 더한다.

```ts
// 바꾸기 전
import { fromView } from "../../../pages/dma/erdEdit/state/model-delta";
import type {
  ErdColumn, ErdDiagram, ErdDiagramNode, ErdModelJson, ErdModelView, ErdRelation, ErdState, ErdTable,
} from "../../../pages/dma/erdEdit/types";
```

```ts
// 바꾼 뒤
import { vi } from "vitest";

import type { ApplyOutcome, ErdEditContext } from "../../../pages/dma/erdEdit/edit-context";
import { fromView } from "../../../pages/dma/erdEdit/state/model-delta";
import type {
  ErdColumn, ErdDiagram, ErdDiagramNode, ErdModelJson, ErdModelView, ErdRelation, ErdState, ErdTable,
} from "../../../pages/dma/erdEdit/types";
```

```ts
// 파일 끝에 더한다
const OK_RIGHT = { ok: true, reason: null } as const;

/**
 * 패널·캔버스 시험용 편집 문맥(FE2·FE3 공용). apply 는 vi.fn 이고 기본은 반영(rev+1)이다. over 로 칸을 바꾼다.
 * 예: fakeEditContext(s, { apply: vi.fn(async () => ({ ok: false, notice })) }).
 */
export function fakeEditContext(state: ErdState, over: Partial<ErdEditContext> = {}): ErdEditContext {
  const applied: ApplyOutcome = { ok: true, rev: state.rev + 1, warnings: [] };
  return {
    modelId: state.modelId, session: "ui-test0001", me: "tester", state, status: null,
    rights: { model: OK_RIGHT, diagram: OK_RIGHT, confirm: OK_RIGHT, manageEditors: OK_RIGHT, owner: true },
    diagramId: Object.keys(state.diagrams)[0] ?? null, selectedTableId: null, selectedColumnId: null, highlight: null,
    pendingIds: new Set<string>(),
    apply: vi.fn(async () => applied),
    exclusive: (<T,>(fn: () => Promise<T>) => fn()) as ErdEditContext["exclusive"],
    clearHighlight: vi.fn(), notify: vi.fn(),
    nav: { selectTable: vi.fn(), selectColumn: vi.fn(), openTableFind: vi.fn(), openColumnJump: vi.fn() },
    ...over,
  };
}
```

- [ ] **Step 2: 실패하는 시험 작성 — 알림·권한·버전 칸**

`src/frontend/m-mdm/tests/dma/erdEdit/edit-core.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { isDiagramOp, noticeFromRejection } from "../../../pages/dma/erdEdit/edit-context";
import { applyDelta, withVersion } from "../../../pages/dma/erdEdit/state/model-delta";
import {
  LOST_TEXT, NO_OWNER_DIAGRAM_TEXT, NO_RIGHT_TEXT, RELEASED_TEXT, blockedNotice, editRights, readOnlyBanner,
} from "../../../pages/dma/erdEdit/state/permissions";
import type { ErdRejection } from "../../../pages/dma/erdEdit/types";
import { MENU_DIAGRAMS, menuModel, stateOf } from "./erd-fixtures";

const ALL = { loading: false, save: true, confirm: true, execute: true };
const conflict: ErdRejection = {
  code: "CONFLICT", commandIndex: 1, message: "다른 세션이 먼저 바꾼 값입니다", hint: "getChangesSince(212) 로 바뀐 값을 읽고 다시 보내세요",
  elementId: "c-4", property: "logical", byRev: 215, bySession: "ui-ab12cd34", byUserId: "41000207", current: "역할설명", choices: null, ownerId: null,
};

describe("거절 → 알림(스펙 4.5, S2-13)", () => {
  it("CONFLICT 는 바꾼 사용자·rev·지금 값을 문구로 쓰고, 거절된 명령의 set[property] 를 내 값으로 둔다", () => {
    const n = noticeFromRejection(conflict, [{ op: "updateTable", id: "t-1", set: { logical: "메뉴" } }, { op: "updateColumn", id: "c-4", set: { logical: "메뉴이름" } }]);
    expect(n).toMatchObject({ code: "CONFLICT", label: "충돌", elementId: "c-4", property: "logical", byRev: 215, byUserId: "41000207", mine: "메뉴이름" });
    expect(n.message).toBe('41000207 님이 rev 215 에서 먼저 바꿨습니다. 지금 값: "역할설명"');
    expect(n.hint).toBe(conflict.hint);
  });

  it("byUserId 가 없으면(단계 1 서버) 세션 이름을 쓰고, 모르는 코드는 INVALID, 거절 본문이 없어도 알림을 만든다", () => {
    const old = { ...conflict, code: "NOT_FOUND", byUserId: undefined } as unknown as ErdRejection;
    expect(noticeFromRejection(old, []).message).toBe("ui-ab12cd34 님이 rev 215 에서 지웠습니다.");
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
    expect(blockedNotice(released, true, true)).toMatchObject({ code: "NOT_EDITOR", message: RELEASED_TEXT });
    expect(blockedNotice(released, true, false)).toBeNull(); // 다이어그램 명령만이면 통과
    expect(editRights(draft, "tester", { ...ALL, loading: true }, true).model).toEqual({ ok: false, reason: null });
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
```

- [ ] **Step 3: 실패하는 시험 작성 — 단계 2 API 요청 모양**

`src/frontend/m-mdm/tests/dma/erdEdit/api.test.ts` 의 import 를 바꾸고, `describe("erdEdit api")` 안 끝에 시험 하나를 더한다.

```ts
// 바꾸기 전
import {
  compareDbDiff, decideRelation, importFromDb, rejectionText, searchModels, setViewState, viewChanges, viewStatus,
} from "../../../pages/dma/erdEdit/api";
```

```ts
// 바꾼 뒤
import {
  addEditor, applyCommands, applyDbDiff, claimTable, compareDbDiff, confirmVersion, decideRelation, deleteDraft, importFromDb,
  lockDraft, newVersion, previewName, rejectionText, releaseTable, removeEditor, searchModels, setViewState, undoRev, unlockDraft,
  validateConfirm, viewChanges, viewStatus,
} from "../../../pages/dma/erdEdit/api";
```

```ts
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
```

- [ ] **Step 4: 실패하는 시험 작성 — 화면(Ctrl+Z·Ctrl+K·Alt+O)과 바뀐 서명**

`src/frontend/m-mdm/tests/dma/erdEdit/page-render.test.ts` 를 고친다.

(a) 가짜 서버에 `restore` 를 더한다. `let currentView: ErdModelView;` 아래에 `let restoreResult: unknown;` 을 둔다. `stubFetch` 안 `if (action === "import") {` 바로 앞에 한 줄을 넣는다.

```ts
    if (action === "restore") return ok(restoreResult);
```

`beforeEach` 의 `currentView = viewOf(menuModel(), MENU_DIAGRAMS);` 다음 줄에 넣는다.

```ts
  restoreResult = { applied: true, rev: 5, rowVersion: 2, warnings: [], rejection: null,
    changes: [{ kind: "relation", id: "r-1", op: "patch", value: { state: "INFERRED" } }] };
```

(b) 파일 끝 `describe("erdEdit 화면")` 안에 시험 두 개를 더한다.

```ts
  const key = (target: EventTarget, init: KeyboardEventInit) =>
    act(async () => {
      target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
    });

  it("Ctrl+Z 는 내 마지막 반영을 restore 로 되돌리고, 되돌리기 rev 는 다시 되돌리지 않으며, 입력 칸 안에서는 넘긴다", async () => {
    await openModel();
    await click(byTestId("erd-tab-inferred"));
    await click(await waitFor(() => byTestId("erd-confirm-r-1")));
    expect(byTestId("erd-rev")?.textContent).toBe("rev 4");
    const input = document.createElement("input");
    host.appendChild(input);
    await key(input, { key: "z", ctrlKey: true });
    expect(calls.filter((c) => c.action === "restore")).toHaveLength(0);
    await key(document.body, { key: "z", ctrlKey: true });
    await settle();
    expect(calls.filter((c) => c.action === "restore").map((c) => c.params)).toEqual([
      { modelId: "mcm", rev: 4, session: expect.stringMatching(/^ui-/), source: "UI" },
    ]);
    expect(byTestId("erd-rev")?.textContent).toBe("rev 5");
    await key(document.body, { key: "z", metaKey: true });
    await settle();
    expect(calls.filter((c) => c.action === "restore")).toHaveLength(1);
    expect(byTestId("erd-message")?.textContent).toBe("되돌릴 내 변경이 없습니다.");
  });

  it("Ctrl+K 는 표 찾기 칸을 열고 Alt+O(물리 키 KeyO)는 컬럼 점프를 연다. 입력 칸 안 Ctrl+K 는 넘긴다", async () => {
    await openModel();
    const input = document.createElement("input");
    host.appendChild(input);
    await key(input, { key: "k", ctrlKey: true });
    expect(byTestId("erd-find-widget")).toBeNull();
    await key(document.body, { key: "k", ctrlKey: true });
    expect(byTestId("erd-find-widget")).not.toBeNull();
    expect(byTestId("erd-column-jump")).toBeNull();
    await key(document.body, { key: "ø", code: "KeyO", altKey: true }); // macOS Option+O 는 key 가 바뀐다
    expect(byTestId("erd-column-jump")).not.toBeNull();
  });
```

(c) `src/frontend/m-mdm/tests/dma/erdEdit/erd-stream.test.ts` 의 `Harness` 가 새 서명을 쓰게 한다.

```ts
// 바꾸기 전
    const m = useErdModel("mcm", load);
// 바꾼 뒤
    const m = useErdModel("mcm", "ui-t", "tester", load);
```

(d) `src/frontend/m-mdm/tests/dma/erdEdit/panel-rows.test.ts` 의 import 를 옮긴 파일로 바꾼다.

```ts
// 바꾸기 전
import { diffRows, historyRows, inferredRows, violationRows } from "../../../pages/dma/erdEdit/panels/ReviewPanel";
// 바꾼 뒤
import { historyRows } from "../../../pages/dma/erdEdit/panels/ChangeLog";
import { diffRows } from "../../../pages/dma/erdEdit/panels/DbDiffApply";
import { inferredRows, violationRows } from "../../../pages/dma/erdEdit/panels/ReviewPanel";
```

- [ ] **Step 5: 시험이 실패하는지 확인**

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/`
Expected: FAIL — `edit-context`·`state/permissions`·`panels/ChangeLog`·`panels/DbDiffApply` 모듈이 없다(import 해석 실패). `api.test.ts` 는 `applyCommands` 등이 없어 실패한다.

- [ ] **Step 6: 구현 — `types.ts`**

(a) `ErdPresence` 한 줄(55행)을 바꾼다.

```ts
/** 접속자. expiresAt: SSE 구독자는 null, MCP·CLI 시한 항목은 만료 시각(S2-11). 단계 1 서버는 이 칸을 싣지 않는다. */
export interface ErdPresence {
  session: string; userId: string; source: ErdSource; diagramId: string | null; selectedTables: string[]; at: string; expiresAt?: string | null;
}
```

(b) `ErdDelta` 한 줄(73행)을 바꾼다.

```ts
/** rowVersion: 실시간 발행만 값이 있다. 재전송·getChangesSince·다이어그램만 바꾼 델타는 null 이거나 없다(S2-16). */
export interface ErdDelta {
  modelId: string; rev: number; userId: string; session: string; source: ErdSource; rowVersion?: number | null; changes: ErdChange[];
}
```

(c) `ErdRejection`·`ErdApplyResult`(76~81행, `ErdWarning` 은 그대로)를 바꾼다.

```ts
export interface ErdRejection {
  code: string; commandIndex: number; message: string; hint: string | null; elementId: string | null; property: string | null;
  /** byUserId: byRev 의 명령 기록 USER_ID(S2-13). 단계 1 서버는 싣지 않는다 — 읽을 때 `?? null`. */
  byRev: number | null; bySession: string | null; byUserId: string | null; current: unknown; choices: unknown; ownerId: string | null;
}
export interface ErdWarning { code: string; elementId: string | null; message: string; claimedBy: string | null; expiresAt: string | null }
/** save·restore 응답. rowVersion 은 DRAFT 행 ROW_VERSION 을 올렸을 때만 값이 있다(다이어그램만·거절·dryRun 은 null). */
export interface ErdApplyResult {
  applied: boolean; rev: number; rowVersion: number | null; dryRun?: boolean;
  changes: ErdChange[]; warnings: ErdWarning[]; rejection: ErdRejection | null;
}
```

(d) 파일 끝에 더한다(README 화면 계약 그대로).

```ts
// ── 단계 2(README "화면 내부 계약") ──
export type ErdVersionReason = "SUBSCRIBE" | "CONFIRM" | "LOCK" | "UNLOCK" | "HANDOVER" | "ADD_EDITOR" | "REMOVE_EDITOR";
/** SSE version(S2-12) — rev 를 올리지 않는다. 값은 그 시점 view(ver 없음)가 돌려줄 값과 같다. */
export interface ErdVersionEvent {
  modelId: string; ver: string; status: string; ownerId: string | null; editors: string[];
  rowVersion: number; reason: ErdVersionReason; userId: string; at: string;
}
/** execute kind=CLAIM 응답(S2-26). ok 와 상관없이 지금 그 표를 쥔 세션을 준다. */
export interface ErdClaimResult { ok: boolean; claimedBy: string | null; userId: string | null; expiresAt: string | null }
export interface ErdDiffApplySummary {
  items: number; tablesAdded: number; tablesRemoved: number; columnsAdded: number; columnsRemoved: number;
  columnsChanged: number; relationsAdded: number; dbFkSet: number; dbFkCleared: number; removedIds: string[];
}
/** import kind=APPLY_DIFF 응답(S2-14). summary 는 거절이면 null. */
export interface ErdDiffApplyResult extends ErdApplyResult { summary: ErdDiffApplySummary | null }
export interface ErdTermRef { termId: number; termName: string; engAbbr: string | null }
export interface ErdNameToken {
  seq: number; surface: string; status: "MATCHED" | "SYNONYM" | "AMBIGUOUS" | "NO_ABBR" | "UNKNOWN";
  selected: ErdTermRef | null; abbr: string; candidates: { term: ErdTermRef; via: "NAME" | "SYNONYM" | "ALIAS" }[];
}
/** compare(kind 없음) 응답 — 논리명·물리명 미리보기. */
export interface ErdNamePreview {
  physName: string; logicalName: string; tokens: ErdNameToken[]; recommendedDomainId: number | null; status: ErdColumnStatus;
}
export interface ErdCheckIssue { code: string; message: string; field: string | null; itemKey: string | null }
/** validate 응답(ConfirmCheckResult). errors 가 비면 확정할 수 있다. */
export interface ErdConfirmCheck { errors: ErdCheckIssue[]; warnings: ErdCheckIssue[] }
/** 명령 JSON 한 건(스펙 4.1). 모양은 서버가 판정한다. */
export type ErdCommandJson = { op: string } & Record<string, unknown>;
```

- [ ] **Step 7: 구현 — `api.ts` (전부 다시 씀)**

```ts
/**
 * erdEdit 화면의 OASIS 호출 — `POST /api/mdm/oasis/erdEdit/{action}`(단계 0 BPMN + 단계 1·2 의 kind).
 * - OASIS params 는 배열을 싣지 못하므로 viewJson·commandsJson·itemsJson 은 JSON 문자열로 보낸다.
 * - search 는 서비스가 목록(List)을 돌려주므로 OASIS 가 `data.result` 가 아니라 `grids.result.rows` 로 싣는다.
 *   그래서 search 만 `includeGrids` 로 불러 그 행을 `result` 로 올려 읽는다(다른 액션은 객체라 `data.result` 다).
 * - save·restore·import 의 명령 거절(INVALID·CONFLICT·NOT_EDITOR 등)은 성공 응답의 `applied=false`·`rejection` 으로 온다. 던지지 않는다.
 *   업무 오류(MDM0xx, 권한, 확정 검사 등)는 `meta.success=false` 라 Error 로 던진다.
 * - 화면 레인 FE2·FE3 은 이 파일을 고치지 않는다. 더 필요한 호출은 자기 파일에서 erdCall 로 만든다(S2-19).
 */
import { callOasisAt, type OasisCallOptions } from "@dk-oasis/shared/http";

import { MDM_OASIS_BASE, mdmFieldLabel, plainError } from "@/oasis-screen";

import type {
  ErdApplyResult, ErdChangesView, ErdClaimResult, ErdCommandJson, ErdConfirmCheck, ErdDbDiffView, ErdDiffApplyResult, ErdImportResult,
  ErdModelRow, ErdModelView, ErdNamePreview, ErdRejection, ErdStatusView, ErdViewState,
} from "./types";

export const SCREEN_ID = "erdEdit";

/** 서버 field → 화면 항목명(오류 문구용). */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  MODEL_ID: "모델 ID",
  MODULE_ID: "모듈",
  SCHEMA_NAME: "스키마",
  MODEL_NAME: "모델 이름",
  BASE_REV: "기준 rev",
  VIEW_JSON: "화면 상태",
  ROW_VERSION: "행 버전",
  USER_ID: "사용자 ID",
  TABLE_ID: "표",
};

const OASIS: OasisCallOptions = { omit: "nullish+blank", merge: "data+result", fieldLabel: mdmFieldLabel(FIELD_LABELS), errorFactory: plainError };

/** 목록 응답(`grids.<이름>.rows`)을 결과의 `<이름>` 으로 올린다. */
const OASIS_GRIDS: OasisCallOptions = { ...OASIS, includeGrids: true };

/** erdEdit 액션 하나(객체 결과). 값은 `data.result` 다. */
export function erdCall<T>(action: string, params: object): Promise<T> {
  return callOasisAt<T>(MDM_OASIS_BASE, SCREEN_ID, action, params, undefined, OASIS);
}

/** 모델 목록 — 서버는 `grids.result.rows` 로 준다(BPMN searchTask output=result, 반환형 List). */
export async function searchModels(): Promise<ErdModelRow[]> {
  const out = await callOasisAt<{ result?: unknown }>(MDM_OASIS_BASE, SCREEN_ID, "search", {}, undefined, OASIS_GRIDS);
  return Array.isArray(out.result) ? (out.result as ErdModelRow[]) : [];
}

/** 모델 전체. ver 를 빼면 서버가 DRAFT, 없으면 최신 RELEASED 를 고른다. */
export function viewModel(modelId: string, ver?: string | null): Promise<ErdModelView> {
  return erdCall("view", { modelId, ver });
}

/** sinceRev 뒤의 변경 기록(500건 초과·다시 읽기 지점이면 reload=true). */
export function viewChanges(modelId: string, sinceRev: number): Promise<ErdChangesView> {
  return erdCall("view", { modelId, sinceRev });
}

export function viewStatus(modelId: string, ver?: string | null): Promise<ErdStatusView> {
  return erdCall("view", { modelId, ver, kind: "STATUS" });
}

/** 화면 상태 알리기(S1). SSE 에 연결된 세션만 받는다(아니면 INVALID). */
export function setViewState(modelId: string, session: string, view: ErdViewState): Promise<{ ok: boolean }> {
  return erdCall("view", { modelId, session, kind: "SET_VIEW", viewJson: JSON.stringify(view) });
}

export function compareDbDiff(modelId: string): Promise<ErdDbDiffView> {
  return erdCall("compare", { modelId, kind: "DB_DIFF" });
}

export interface RegInput {
  modelId: string;
  moduleId: string;
  schemaName: string;
  modelName: string;
}

export function regModel(input: RegInput): Promise<{ modelId: string }> {
  return erdCall("reg", input);
}

/** 첫 가져오기(S3). 표가 이미 있으면 applied=false·INVALID. 화면은 ctx.exclusive 안에서 부른다. */
export function importFromDb(modelId: string, baseRev: number, session: string): Promise<ErdImportResult> {
  return erdCall("import", { modelId, baseRev, session, source: "UI", kind: "FROM_DB" });
}

/** 명령 묶음(save). 1~200건, 모델·다이어그램 명령을 섞어도 된다. 화면은 ctx.apply 로만 부른다. */
export function applyCommands(modelId: string, baseRev: number, session: string, commands: ErdCommandJson[]): Promise<ErdApplyResult> {
  return erdCall("save", { modelId, baseRev, session, source: "UI", commandsJson: JSON.stringify(commands) });
}

export type RelationDecision = "confirmRelation" | "rejectRelation";

/** 관계 확정·기각 — 명령 하나짜리 applyCommands(단계 1 이름을 남긴다). */
export function decideRelation(modelId: string, baseRev: number, session: string, op: RelationDecision, relationId: string): Promise<ErdApplyResult> {
  return applyCommands(modelId, baseRev, session, [{ op, id: relationId }]);
}

/** 되돌리기(restore) — 그 rev 의 역명령을 새 rev 로 넣는다. 바뀐 것이 없으면 INVALID(S2-24). */
export function undoRev(modelId: string, rev: number, session: string): Promise<ErdApplyResult> {
  return erdCall("restore", { modelId, rev, session, source: "UI" });
}

/** 논리명 → 물리명(또는 반대) 미리보기. 명령을 보내지 않는다. 300ms 디바운스와 늦은 응답 버리기는 부르는 쪽이 한다(§37). */
export function previewName(input: { logical?: string; phys?: string }): Promise<ErdNamePreview> {
  return erdCall("compare", { logical: input.logical, phys: input.phys });
}

/** 다시 가져오기 반영(S2-14). itemIds 는 compare kind=DB_DIFF 의 items[].id. 화면은 ctx.exclusive 안에서 부른다. */
export function applyDbDiff(modelId: string, baseRev: number, session: string, itemIds: string[]): Promise<ErdDiffApplyResult> {
  return erdCall("import", { modelId, baseRev, session, source: "UI", kind: "APPLY_DIFF", itemsJson: JSON.stringify(itemIds) });
}

/** 작업 중 표시(TTL 600초). 단계 2 서버는 쥔 세션 정보를 돌려준다(S2-26). */
export function claimTable(modelId: string, tableId: string, session: string): Promise<ErdClaimResult> {
  return erdCall("execute", { modelId, kind: "CLAIM", tableId, session, source: "UI" });
}

export function releaseTable(modelId: string, tableId: string, session: string): Promise<{ ok: boolean }> {
  return erdCall("execute", { modelId, kind: "RELEASE", tableId, session, source: "UI" });
}

/** 공동 편집자 더하기·빼기 — DRAFT 소유자만(서버 판정). */
export function addEditor(modelId: string, userId: string): Promise<{ ok: boolean }> {
  return erdCall("execute", { modelId, kind: "ADD_EDITOR", userId });
}

export function removeEditor(modelId: string, userId: string): Promise<{ ok: boolean }> {
  return erdCall("execute", { modelId, kind: "REMOVE_EDITOR", userId });
}

/** 새 버전(copy) — 직전 RELEASED 를 복사한 DRAFT. 서버가 reload 를 보낸다. */
export function newVersion(modelId: string, verKind: "MAJOR" | "MINOR"): Promise<{ ver: string }> {
  return erdCall("copy", { modelId, verKind });
}

export function deleteDraft(modelId: string, ver: string, rowVersion: number): Promise<{ ok: boolean }> {
  return erdCall("delete", { modelId, ver, rowVersion });
}

export function lockDraft(modelId: string, ver: string, rowVersion: number): Promise<{ rowVersion: number }> {
  return erdCall("lock", { modelId, ver, rowVersion });
}

export function unlockDraft(modelId: string, ver: string, rowVersion: number): Promise<{ rowVersion: number }> {
  return erdCall("unlock", { modelId, ver, rowVersion });
}

/** 확정 전 검사(D19) — 확정 때와 같은 검사를 미리 부른다. */
export function validateConfirm(modelId: string): Promise<ErdConfirmCheck> {
  return erdCall("validate", { modelId });
}

/**
 * 확정. 경고가 있으면 warningsAcknowledged=true 여야 한다(아니면 MDM014 를 던진다).
 * applyFrom 은 적용 시작 시각 `yyyy-MM-dd HH:mm:ss`(RuleConfirmService.parseApplyFrom). 서버는 이 값을 요구한다.
 * 미래 시각으로 확정하면 그 시각 전까지 `copy` 가 MDM006 으로 막힌다. 화면 기본값은 지금 시각이다(Task 11).
 */
export function confirmVersion(
  modelId: string, ver: string, rowVersion: number, warningsAcknowledged: boolean, applyFrom: string,
): Promise<{ ok: boolean }> {
  return erdCall("confirm", { modelId, ver, rowVersion, warningsAcknowledged, applyFrom });
}

/** 거절 문구 — 다음에 할 일(hint)까지 붙인다(스펙 4.5). */
export function rejectionText(r: ErdRejection | null): string {
  if (!r) return "요청이 거절되었습니다.";
  return r.hint ? `${r.message} — ${r.hint}` : r.message;
}
```

- [ ] **Step 8: 구현 — `edit-context.ts`**

```ts
/**
 * 편집 문맥(README "화면 내부 계약") — 패널·캔버스가 받는 한 묶음. FE2·FE3 은 이 이름·모양을 그대로 쓴다(S2-19).
 * 거절 → 알림 변환, 다이어그램 명령 판정도 여기 둔다(순수).
 */
import type { ErdCommandJson, ErdRejection, ErdState, ErdStatusView, ErdWarning } from "./types";

export interface Right { ok: boolean; reason: string | null }
export interface EditRights { model: Right; diagram: Right; confirm: Right; manageEditors: Right; owner: boolean }

export type ErdNoticeCode = "CONFLICT" | "NOT_FOUND" | "INVALID" | "NEEDS_CHOICE" | "NOT_EDITOR" | "NETWORK" | "RELOAD";
export interface ErdNotice {
  code: ErdNoticeCode;
  label: string; message: string; hint: string | null; commandIndex: number | null; elementId: string | null;
  property: string | null; byRev: number | null; byUserId: string | null; bySession: string | null;
  current: unknown; mine: unknown; choices: unknown;
}
export type ApplyOutcome = { ok: true; rev: number; warnings: ErdWarning[] } | { ok: false; notice: ErdNotice };

export interface ErdNav {
  selectTable(tableId: string): void;
  /** 그 컬럼의 표를 고르고 selectedColumnId 를 둔다(그리드가 그 행으로 간다, FE3). */
  selectColumn(columnId: string): void;
  openTableFind(): void;
  openColumnJump(): void;
}
export interface ErdHighlight { code: ErdNotice["code"]; elementId: string; property: string | null; message: string; mine: unknown }

export type MessageTone = "info" | "warn" | "error";

export interface ErdEditContext {
  modelId: string; session: string; me: string; state: ErdState; status: ErdStatusView | null;
  rights: EditRights; diagramId: string | null; selectedTableId: string | null;
  /** 고른 컬럼. 표를 바꾸면 null. */
  selectedColumnId: string | null;
  /** 마지막 CONFLICT·NOT_FOUND·INVALID 의 칸(그리드 칸 강조·칸 아래 빨간 문구·노드 강조). 알림을 닫으면 null. */
  highlight: ErdHighlight | null;
  /** queued·sending·held 묶음이 건드리는 요소 id(흐린 자리표시, S2-18). Task 9 에서는 늘 비어 있다. */
  pendingIds: ReadonlySet<string>;
  apply(commands: ErdCommandJson[], label: string): Promise<ApplyOutcome>;
  /** 내 쓰기 줄이 빌 때까지 기다렸다가 fn 을 돌린다. 도는 동안 다음 묶음을 보내지 않는다. import 계열 쓰기(FROM_DB·APPLY_DIFF)용. */
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
  clearHighlight(): void;
  notify(message: string, tone?: MessageTone): void;
  nav: ErdNav;
}

export const NOTICE_LABEL: Readonly<Record<ErdNoticeCode, string>> = {
  CONFLICT: "충돌", NOT_FOUND: "이미 지워짐", INVALID: "규칙 위반", NEEDS_CHOICE: "선택 필요",
  NOT_EDITOR: "편집 권한 없음", NETWORK: "연결 문제", RELOAD: "다시 읽음",
};

const SERVER_CODES: ReadonlySet<string> = new Set(["CONFLICT", "NOT_FOUND", "INVALID", "NEEDS_CHOICE", "NOT_EDITOR"]);

/** 다이어그램 명령(버전 밖, R9-2). Java ErdDiagramCommand.isDiagramOp 와 같은 목록이다. */
const DIAGRAM_OPS: ReadonlySet<string> = new Set([
  "addDiagram", "updateDiagram", "deleteDiagram", "placeTables", "moveNodes", "setFold", "removeFromDiagram", "restoreDiagram",
]);

export function isDiagramOp(op: string): boolean {
  return DIAGRAM_OPS.has(op);
}

/** 알림에 넣을 값 글. 글자는 따옴표로 감싼다. */
export function valueText(v: unknown): string {
  if (v === null || v === undefined) return "(없음)";
  return typeof v === "string" ? `"${v}"` : JSON.stringify(v);
}

/** 서버 거절이 아닌 알림(끊김·권한·다시 읽음). */
export function localNotice(code: ErdNoticeCode, message: string, hint: string | null = null): ErdNotice {
  return {
    code, label: NOTICE_LABEL[code], message, hint, commandIndex: null, elementId: null, property: null,
    byRev: null, byUserId: null, bySession: null, current: null, mine: null, choices: null,
  };
}

/**
 * 서버 거절 → 알림(스펙 4.5). 바꾼 사람은 사용자 ID(byUserId), 없으면 세션 이름이다(S2-13).
 * mine 은 거절된 명령의 set[property] — CONFLICT 의 [내 값 복사] 가 쓴다.
 */
export function noticeFromRejection(r: ErdRejection | null, commands: readonly ErdCommandJson[]): ErdNotice {
  if (!r) return localNotice("INVALID", "서버가 묶음을 받아들이지 않았습니다.", "다시 보내 보세요. 계속되면 모델을 다시 읽으세요.");
  const code: ErdNoticeCode = SERVER_CODES.has(r.code) ? (r.code as ErdNoticeCode) : "INVALID";
  const cmd = commands[r.commandIndex];
  const set = cmd && typeof cmd.set === "object" && cmd.set !== null ? (cmd.set as Record<string, unknown>) : null;
  const mine = r.property && set && r.property in set ? set[r.property] : null;
  const byUserId = r.byUserId ?? null;
  const who = byUserId ?? r.bySession ?? null;
  let message = r.message;
  if (code === "CONFLICT" && r.byRev != null && who) message = `${who} 님이 rev ${r.byRev} 에서 먼저 바꿨습니다. 지금 값: ${valueText(r.current)}`;
  if (code === "NOT_FOUND" && r.byRev != null && who) message = `${who} 님이 rev ${r.byRev} 에서 지웠습니다.`;
  return {
    code, label: NOTICE_LABEL[code], message, hint: r.hint, commandIndex: r.commandIndex, elementId: r.elementId, property: r.property,
    byRev: r.byRev ?? null, byUserId, bySession: r.bySession ?? null, current: r.current, mine, choices: r.choices,
  };
}
```

- [ ] **Step 9: 구현 — `state/permissions.ts` 와 `state/pending.ts`(형만)**

`state/permissions.ts`:

```ts
/**
 * 화면 권한(S2-20) — 모델 편집(DRAFT + 소유자·공동 편집자)과 다이어그램 편집(보이는 버전의 소유자·공동 편집자)을 나눈다. 순수.
 * 서버 판정(R7-1 소유자가 없으면 공동 편집자를 인정하지 않음, R9-2 다이어그램 명령)과 같은 규칙이다. 확정·편집자 관리는 DRAFT 소유자만.
 * 연결이 끊기면 고칠 수 있던 권한도 LOST_TEXT 로 막는다(스펙 4.4 "편집을 멈춘다").
 */
import { localNotice, type EditRights, type ErdNotice, type Right } from "../edit-context";
import type { ErdState } from "../types";

export const NO_RIGHT_TEXT = "이 화면의 편집 권한이 없어 읽기만 할 수 있습니다. 권한은 시스템 관리자에게 요청하세요.";
export const RELEASED_TEXT = "확정된 버전이라 모델을 고칠 수 없습니다. [새 버전]으로 DRAFT 를 만드세요.";
export const NO_OWNER_DIAGRAM_TEXT = "이 버전에 소유자가 없어 아무도 다이어그램을 고칠 수 없습니다. DRAFT 를 [선점]하거나 [새 버전]을 만드세요.";
export const LOST_TEXT = "실시간 연결이 끊겨 편집을 멈췄습니다. 다시 연결되면 이어서 고칠 수 있습니다.";

export const notEditorText = (ownerId: string | null): string =>
  `공동 편집자가 아니어서 읽기만 할 수 있습니다. 소유자(${ownerId ?? "없음"})에게 공동 편집자 등록을 요청하세요.`;

export interface RbacFlags { loading: boolean; save: boolean; confirm: boolean; execute: boolean }

const OK: Right = { ok: true, reason: null };
const no = (reason: string | null): Right => ({ ok: false, reason });

/** 소유자이거나, 소유자가 있는 버전의 공동 편집자(R7-1). */
export function isEditor(state: ErdState, me: string | null): boolean {
  return !!me && state.ownerId !== null && (me === state.ownerId || state.editors.includes(me));
}

/** 단계 1 읽기 전용 이유(시험 호환). 권한 → 확정 버전 → 공동 편집자 순서. */
export function readOnlyReason(state: ErdState, me: string | null, canEdit: boolean): string | null {
  if (!canEdit) return NO_RIGHT_TEXT;
  if (state.status !== "DRAFT") return RELEASED_TEXT;
  if (!isEditor(state, me)) return notEditorText(state.ownerId);
  return null;
}

export function editRights(state: ErdState | null, me: string | null, rbac: RbacFlags, connected: boolean): EditRights {
  if (!state || rbac.loading) {
    const wait = no(null);
    return { model: wait, diagram: wait, confirm: wait, manageEditors: wait, owner: false };
  }
  const owner = !!me && me === state.ownerId;
  const draft = state.status === "DRAFT";
  const editor = isEditor(state, me);
  const live = (r: Right): Right => (r.ok && !connected ? no(LOST_TEXT) : r);
  const ownerName = state.ownerId ?? "없음";
  return {
    model: live(!rbac.save ? no(NO_RIGHT_TEXT) : !draft ? no(RELEASED_TEXT) : !editor ? no(notEditorText(state.ownerId)) : OK),
    diagram: live(!rbac.save ? no(NO_RIGHT_TEXT) : state.ownerId === null ? no(NO_OWNER_DIAGRAM_TEXT)
      : !editor ? no(notEditorText(state.ownerId)) : OK),
    confirm: live(!rbac.confirm ? no("확정 권한이 없습니다. 권한은 시스템 관리자에게 요청하세요.")
      : !draft ? no("확정할 DRAFT 가 없습니다.") : !owner ? no(`확정은 DRAFT 소유자(${ownerName})만 할 수 있습니다.`) : OK),
    manageEditors: live(!rbac.execute ? no(NO_RIGHT_TEXT) : !draft ? no("공동 편집자는 DRAFT 에서만 바꿀 수 있습니다.")
      : !owner ? no(`공동 편집자는 소유자(${ownerName})만 바꿀 수 있습니다.`) : OK),
    owner,
  };
}

/** 위 띠 글. 끊김은 끊김 띠가 따로 보이므로 뺀다. 소유자가 없어 다이어그램도 못 고치면 deferred 37 문구를 보인다. */
export function readOnlyBanner(r: EditRights): string | null {
  if (r.model.ok || r.model.reason === null || r.model.reason === LOST_TEXT) return null;
  if (r.model.reason !== NO_RIGHT_TEXT && r.diagram.reason === NO_OWNER_DIAGRAM_TEXT) return NO_OWNER_DIAGRAM_TEXT;
  return r.model.reason;
}

/** 보내기 전 판정. model: 묶음에 모델 명령이 하나라도 있다. null 이면 보내도 된다. */
export function blockedNotice(r: EditRights, connected: boolean, model: boolean): ErdNotice | null {
  if (!connected) return localNotice("NETWORK", LOST_TEXT);
  const right = model ? r.model : r.diagram;
  return right.ok ? null : localNotice("NOT_EDITOR", right.reason ?? "지금은 고칠 수 없습니다.", "위 띠의 안내를 따르세요.");
}
```

`state/pending.ts`(Task 10 이 이 파일을 전부 다시 쓴다):

```ts
/** 두 층 모델의 형(Task 9 뼈대). 함수는 Task 10 이 채운다. */
import type { ErdCommandJson, ErdDelta, ErdState } from "../types";

export interface PendingBatch {
  id: number; label: string; baseRev: number; commands: ErdCommandJson[]; undoOf?: number;
  state: "queued" | "sending" | "held" | "echoed"; heldRev?: number; heldSince?: number;
}
export interface Layers { server: ErdState; pending: PendingBatch[]; held: ErdDelta[] }
```

- [ ] **Step 10: 구현 — `state/model-delta.ts`**

(a) import 에 `ErdVersionEvent` 를 더한다.

```ts
import type { ErdChange, ErdDelta, ErdModelJson, ErdModelView, ErdState, ErdVersionEvent } from "../types";
```

(b) `applyDelta` 의 마지막 return 을 바꾼다.

```ts
// 바꾸기 전
  return { kind: "applied", state: { ...state, rev: d.rev, model, diagrams, nodes } };
// 바꾼 뒤 — rowVersion 은 값이 있을 때만(재전송·다이어그램만은 null, S2-16)
  return { kind: "applied", state: { ...state, rev: d.rev, rowVersion: d.rowVersion ?? state.rowVersion, model, diagrams, nodes } };
```

(c) 파일 끝에 더한다.

```ts
const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** version 이벤트(S2-12) — 버전 칸만 바꾼다. 같으면 같은 객체. ver 가 다르면 부르는 쪽이 모델을 다시 읽는다. */
export function withVersion(s: ErdState, ev: ErdVersionEvent): ErdState {
  if (s.status === ev.status && s.ownerId === ev.ownerId && s.rowVersion === ev.rowVersion && sameList(s.editors, ev.editors)) return s;
  return { ...s, status: ev.status, ownerId: ev.ownerId, editors: ev.editors, rowVersion: ev.rowVersion };
}
```

- [ ] **Step 11: 구현 — `state/useErdModel.ts`**

Task 9 는 쓰기 줄을 더하고 서명을 README 대로 바꾼다. 응답 델타는 단계 1 처럼 바로 얹는다(남의 rev 가 아직 안 왔으면 gap 이라 다시 읽는다 — Task 10 이 고친다).

(a) 머리 주석·import·`ErdModelApi`(1~27행)를 바꾼다.

```ts
"use client";

/**
 * ERD 모델 상태(스펙 4.4). Task 9 뼈대: 아래층 하나 + 쓰기 줄. 서명은 README 정본이고 Task 10 이 속을 두 층(state/pending.ts)으로 바꾼다.
 * - 다시 읽기는 세대 번호로 늦은 응답을 버린다(Local-Rules §37). 다시 읽는 동안 온 델타는 모았다가 응답 rev 보다 큰 것만 얹는다.
 * - 쓰기 줄: apply·undo·exclusive 는 한 줄로 돈다(S2-17). 응답 델타는 applyDelta 로 얹고 같은 rev 의 SSE 는 stale 로 버린다.
 * - myRevs: 이 화면이 보낸 묶음의 반영 rev(되돌리기 제외, 오래된 순). reload({dropMine:true}) 면 비운다.
 * - presence·claim 이 바뀌지 않았으면 상태를 바꾸지 않는다(Screen-Performance R7).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { applyCommands, undoRev, viewModel } from "../api";
import { localNotice, noticeFromRejection, type ApplyOutcome } from "../edit-context";
import type { ErdApplyResult, ErdClaim, ErdCommandJson, ErdDelta, ErdModelView, ErdPresence, ErdState, ErdVersionEvent } from "../types";
import { applyDelta, fromView, touchesColumns, withVersion } from "./model-delta";
import type { PendingBatch } from "./pending";

export interface ErdModelApi {
  /** 투영 값(아래층 + 위층). 패널·캔버스는 이것만 읽는다. */
  state: ErdState | null;
  /** 아래층 — 서버가 확인한 마지막 rev. */
  server: ErdState | null;
  pending: readonly PendingBatch[];
  pendingIds: ReadonlySet<string>;
  myRevs: readonly number[];
  loading: boolean;
  error: string | null;
  /** 표·컬럼이 바뀔 때(전체 읽기 포함)마다 1 오른다. 화면은 이 값으로 표준 상태(view kind=STATUS)를 다시 읽는다. */
  columnsSeq: number;
  reload(opts?: { dropMine?: boolean }): Promise<void>;
  /** SSE change 입구. */
  applyDelta(delta: ErdDelta): void;
  setPresence(list: ErdPresence[]): void;
  setClaims(list: ErdClaim[]): void;
  onVersion(ev: ErdVersionEvent): void;
  apply(commands: ErdCommandJson[], label: string): Promise<ApplyOutcome>;
  undo(rev: number): Promise<ApplyOutcome>;
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const NO_REVS: readonly number[] = [];
const NO_PENDING: readonly PendingBatch[] = [];
const NO_IDS: ReadonlySet<string> = new Set();
const MY_REVS_MAX = 100;

export const errorNotice = (e: unknown) =>
  localNotice(e instanceof TypeError ? "NETWORK" : "INVALID", e instanceof Error ? e.message : String(e));
```

(b) 함수 서명과 첫 refs 를 바꾼다.

```ts
// 바꾸기 전
export function useErdModel(modelId: string | null, load: (modelId: string) => Promise<ErdModelView> = viewModel): ErdModelApi {
// 바꾼 뒤
export function useErdModel(
  modelId: string | null, session: string, me: string | null, load: (modelId: string) => Promise<ErdModelView> = viewModel,
): ErdModelApi {
  const [myRevs, setMyRevs] = useState<readonly number[]>(NO_REVS);
  const myRevsRef = useRef<readonly number[]>(NO_REVS);
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  const meRef = useRef({ userId: me ?? "", session });
  meRef.current = { userId: me ?? "", session };
  const setRevs = useCallback((next: readonly number[]) => {
    myRevsRef.current = next;
    setMyRevs(next);
  }, []);
```

(c) `reload` 의 첫 두 줄을 바꾸고 의존성에 `setRevs` 를 더한다.

```ts
// 바꾸기 전
  const reload = useCallback(async () => {
    const gen = ++genRef.current;
// 바꾼 뒤
  const reload = useCallback(async (opts?: { dropMine?: boolean }) => {
    if (opts?.dropMine) setRevs(NO_REVS);
    const gen = ++genRef.current;
```

```ts
// 바꾸기 전
  }, [modelId, load, commit]);
// 바꾼 뒤
  }, [modelId, load, commit, setRevs]);
```

(d) 모델이 바뀌는 effect 에서 myRevs 를 비운다.

```ts
// 바꾸기 전
  useEffect(() => {
    if (stateRef.current && stateRef.current.modelId !== modelId) commit(null);
    void reload();
  }, [reload, commit, modelId]);
// 바꾼 뒤
  useEffect(() => {
    if (stateRef.current && stateRef.current.modelId !== modelId) {
      commit(null);
      setRevs(NO_REVS);
    }
    void reload();
  }, [reload, commit, setRevs, modelId]);
```

(e) 마지막 `return useMemo(...)`(134~137행)를 아래로 바꾼다.

```ts
  const onVersion = useCallback((ev: ErdVersionEvent) => {
    const cur = stateRef.current;
    if (!cur || cur.modelId !== ev.modelId) return;
    if (ev.ver !== cur.ver) {
      void reload();
      return;
    }
    const next = withVersion(cur, ev);
    if (next !== cur) commit(next);
  }, [reload, commit]);

  /** 쓰기 줄 — 앞 일이 끝난 뒤 돈다. 앞 일이 실패해도 다음 일은 돈다. */
  const exclusive = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = chainRef.current.then(fn, fn);
    chainRef.current = run.catch(() => undefined);
    return run;
  }, []);

  const send = useCallback((commands: ErdCommandJson[], undoOf: number | null): Promise<ApplyOutcome> =>
    exclusive(async (): Promise<ApplyOutcome> => {
      const cur = stateRef.current;
      if (!cur || bufferRef.current) {
        return { ok: false, notice: localNotice("RELOAD", "모델을 다시 읽는 중이라 보내지 않았습니다.", "모델을 읽은 뒤 다시 하세요.") };
      }
      let r: ErdApplyResult;
      try {
        r = undoOf === null
          ? await applyCommands(cur.modelId, cur.rev, session, commands)
          : await undoRev(cur.modelId, undoOf, session);
      } catch (e) {
        return { ok: false, notice: errorNotice(e) };
      }
      if (!r.applied) return { ok: false, notice: noticeFromRejection(r.rejection, commands) };
      applyDeltaCb({
        modelId: cur.modelId, rev: r.rev, userId: meRef.current.userId, session, source: "UI", rowVersion: r.rowVersion ?? null, changes: r.changes,
      });
      if (undoOf === null) setRevs([...myRevsRef.current, r.rev].slice(-MY_REVS_MAX));
      return { ok: true, rev: r.rev, warnings: r.warnings };
    }), [exclusive, session, applyDeltaCb, setRevs]);

  const apply = useCallback((commands: ErdCommandJson[], _label: string) => send(commands, null), [send]);
  /** 되돌리기. 그 rev 를 먼저 myRevs 에서 뺀다(CONFLICT 여도 다시 꺼내지 않는다). */
  const undo = useCallback((rev: number) => {
    setRevs(myRevsRef.current.filter((x) => x !== rev));
    return send([], rev);
  }, [send, setRevs]);

  return useMemo(
    () => ({
      state, server: state, pending: NO_PENDING, pendingIds: NO_IDS, myRevs, loading, error, columnsSeq, reload,
      applyDelta: applyDeltaCb, setPresence, setClaims, onVersion, apply, undo, exclusive,
    }),
    [state, myRevs, loading, error, columnsSeq, reload, applyDeltaCb, setPresence, setClaims, onVersion, apply, undo, exclusive],
  );
}
```

- [ ] **Step 12: 구현 — 자리 부품·스타일**

`canvas/useCanvasEditing.ts`(FE2 Task 13 이 채운다. 서명·`CanvasEditing` 모양은 README 정본):

```ts
"use client";

/**
 * 캔버스 편집 자리(FE2 Task 13). Task 9 뼈대는 단계 1 과 같은 읽기 캔버스다.
 * 돌려주는 함수는 안정된 참조여야 한다(CanvasPane 이 decorateNodes 를 useMemo 의존성으로 쓴다). Ctrl+Z 는 ErdViewer 가 받으므로 여기서 걸지 않는다.
 */
import type { KeyboardEvent, ReactNode } from "react";

import type { NodeChange, ReactFlowInstance, ReactFlowProps } from "@dk-oasis/shared/react-flow";

import type { ErdEditContext } from "../edit-context";
import type { ErdFlowEdge, ErdFlowNode } from "./erd-flow";

export interface CanvasEditing {
  flowProps: Pick<ReactFlowProps<ErdFlowNode, ErdFlowEdge>, "nodesDraggable" | "nodesConnectable" | "deleteKeyCode"
    | "onNodeDragStop" | "onConnect" | "isValidConnection" | "connectionMode" | "onPaneClick"
    | "onNodeContextMenu" | "onPaneContextMenu" | "snapToGrid" | "snapGrid">;
  /** CanvasPane 이 select 처리 뒤 모든 변경을 넘긴다. */
  onNodesChange(changes: NodeChange<ErdFlowNode>[]): void;
  /** 끄는 중 위치를 덮는다. 바뀌지 않은 노드는 같은 참조. */
  decorateNodes(nodes: ErdFlowNode[]): ErdFlowNode[];
  /** CanvasPane 이 ReactFlow 를 감싼 tabIndex=0 div 에 단다. */
  onKeyDown(e: KeyboardEvent): void;
  toolbar: ReactNode;
  /** 이름 겹침 창·마법사 등. */
  overlay: ReactNode;
}

const READ_ONLY: CanvasEditing = {
  flowProps: { nodesDraggable: false, nodesConnectable: false, deleteKeyCode: null },
  onNodesChange: () => undefined,
  decorateNodes: (nodes) => nodes,
  onKeyDown: () => undefined,
  toolbar: null,
  overlay: null,
};

export function useCanvasEditing(_ctx: ErdEditContext, _rf: ReactFlowInstance<ErdFlowNode, ErdFlowEdge>): CanvasEditing {
  return READ_ONLY;
}
```

`panels/ColumnJump.tsx`(FE3 Task 14 이 채운다):

```tsx
"use client";

/** 컬럼 점프 자리(Ctrl/⌘+O·Alt+O, FE3 Task 14). 열렸을 때 바깥 요소에 data-testid="erd-column-jump" 를 단다(뼈대 계약 6). */
import type { ErdEditContext } from "../edit-context";

export interface ColumnJumpProps { ctx: ErdEditContext; opened: boolean; onClose(): void }

export function ColumnJump({ opened }: ColumnJumpProps) {
  return opened ? <div data-testid="erd-column-jump" hidden /> : null;
}
```

`panels/DbDiffApply.tsx`(FE3 Task 15 가 고르기·반영을 더한다. 뼈대는 단계 1 차이 목록을 `ReviewPanel` 에서 옮긴 것이다):

```tsx
"use client";

/** DB 차이 탭(단계 1 읽기 목록). FE3 Task 15 가 항목 고르기·[반영](import kind=APPLY_DIFF, ctx.exclusive 안)을 더한다. */
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";

import { typeText } from "../canvas/erd-geometry";
import type { ErdEditContext } from "../edit-context";
import type { ErdColumnSpec, ErdDbDiffItem, ErdDbDiffView } from "../types";

const DIFF_LABEL: Record<ErdDbDiffItem["kind"], string> = {
  TABLE_ADDED: "DB 에 생긴 표", TABLE_REMOVED: "DB 에서 사라진 표", COLUMN_ADDED: "DB 에 생긴 컬럼", COLUMN_REMOVED: "DB 에서 사라진 컬럼",
  COLUMN_CHANGED: "컬럼 다름", FK_ADDED: "DB 에 생긴 FK", FK_REMOVED: "DB 에서 사라진 FK",
};

const specText = (s: ErdColumnSpec | null): string => (s ? `${typeText(s)}${s.notNull ? " NN" : ""}` : "");

export function diffRows(view: ErdDbDiffView | null): Record<string, unknown>[] {
  if (!view) return [];
  return view.items.map((i) => ({ id: i.id, kind: DIFF_LABEL[i.kind], table: i.table, column: i.column ?? "", before: specText(i.before), after: specText(i.after) }));
}

const DIFF_COLUMNS: GridColumn[] = [
  { key: "kind", header: "종류", width: 150, meta: false },
  { key: "table", header: "표", width: 200, meta: false },
  { key: "column", header: "컬럼", width: 160, meta: false },
  { key: "before", header: "모델", width: 160, meta: false },
  { key: "after", header: "DB", width: 160, meta: false },
];

export interface DbDiffApplyProps { ctx: ErdEditContext; diff: ErdDbDiffView | null; onReload(): void }

export function DbDiffApply({ diff }: DbDiffApplyProps) {
  return (
    <AgDataGrid gridId="erdDbDiff" columnSizing="fit" columns={DIFF_COLUMNS} data={diffRows(diff)} rowKey="id"
      emptyMessage={diff ? "DB 와 모델이 같습니다." : "DB 차이를 읽는 중입니다."} />
  );
}
```

`panels/ChangeLog.tsx`(변경 기록 탭. Task 10 이 되돌리기 열을 더한다):

```tsx
"use client";

/** 변경 기록 탭(view sinceRev). 최근 rev 부터, 변경은 종류별 수로 줄인다. Task 10 이 행마다 [되돌리기] 를 더한다. */
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";

import type { ErdChangesView } from "../types";

const KIND_LABEL: Record<string, string> = { table: "표", column: "컬럼", key: "키", relation: "관계", diagram: "다이어그램", diagramNode: "배치" };

export function historyRows(view: ErdChangesView | null): Record<string, unknown>[] {
  if (!view) return [];
  return [...view.deltas].reverse().map((d) => {
    const counts = new Map<string, number>();
    for (const c of d.changes) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
    return {
      id: String(d.rev), rev: d.rev, userId: d.userId, session: d.session, source: d.source,
      summary: [...counts].map(([k, n]) => `${KIND_LABEL[k] ?? k} ${n}`).join("·"),
    };
  });
}

const HISTORY_COLUMNS: GridColumn[] = [
  { key: "rev", header: "rev", width: 70, align: "right", meta: false },
  { key: "userId", header: "사용자", width: 120, meta: false },
  { key: "session", header: "세션", width: 160, meta: false },
  { key: "source", header: "출처", width: 70, align: "center", meta: false },
  { key: "summary", header: "변경", width: 260, meta: false },
];

export interface ChangeLogProps { history: ErdChangesView | null }

export function ChangeLog({ history }: ChangeLogProps) {
  return (
    <AgDataGrid gridId="erdHistory" columnSizing="fit" columns={HISTORY_COLUMNS} data={historyRows(history)} rowKey="id"
      emptyMessage={history ? "변경 기록이 없습니다." : "변경 기록을 읽는 중입니다."} />
  );
}
```

`panels/NoticeBar.tsx`(거절 알림 띠. Task 10 이 [내 값 복사] 를 더한다):

```tsx
"use client";

/** 거절 알림 띠(스펙 4.5). ctx.apply 가 올린 마지막 알림 하나를 보인다. 닫으면 칸 강조도 지운다. */
import { Button } from "@dk-oasis/shared/form";

import type { ErdNotice } from "../edit-context";

export interface NoticeBarProps { notice: ErdNotice | null; onClose(): void }

export function NoticeBar({ notice, onClose }: NoticeBarProps) {
  if (!notice) return null;
  return (
    <div className="erd-notice" data-code={notice.code} role="alert" data-testid="erd-notice">
      <strong className="erd-notice__label">{notice.label}</strong>
      <span data-testid="erd-notice-message">{notice.message}</span>
      {notice.hint && <span className="erd-notice__hint" data-testid="erd-notice-hint">{notice.hint}</span>}
      <span className="erd-notice__spacer" />
      <Button size="mini" data-testid="erd-notice-close" onClick={onClose}>
        닫기
      </Button>
    </div>
  );
}
```

`panels/VersionBar.tsx`·`panels/ConfirmDialog.tsx`·`panels/EditorsModal.tsx`(Task 11 이 채운다. props 는 최종 모양):

```tsx
"use client";

/** 버전 막대 자리(Task 11). */
import type { ErdEditContext } from "../edit-context";
import type { ErdVersionEvent } from "../types";

export interface VersionBarProps { ctx: ErdEditContext; onReload(): Promise<void>; onVersion(ev: ErdVersionEvent): void }

export function VersionBar(_p: VersionBarProps) {
  return null;
}
```

```tsx
"use client";

/** 확정 대화상자 자리(Task 11). */
import type { ErdEditContext } from "../edit-context";

export interface ConfirmDialogProps { ctx: ErdEditContext; opened: boolean; onClose(): void; onConfirmed(): void }

export function ConfirmDialog(_p: ConfirmDialogProps) {
  return null;
}
```

```tsx
"use client";

/** 공동 편집자 관리 자리(Task 11). */
import type { ErdEditContext } from "../edit-context";
import type { ErdVersionEvent } from "../types";

export interface EditorsModalProps { ctx: ErdEditContext; opened: boolean; onClose(): void; onVersion(ev: ErdVersionEvent): void }

export function EditorsModal(_p: EditorsModalProps) {
  return null;
}
```

`panels/core-styles.ts`(FE1 부품 스타일. 색은 토큰만, §8):

```ts
/** 화면 코어(FE1) 스타일 — 캔버스 host·알림 띠·메시지 톤·버전 막대·확정·편집자 창. canvas/erd-styles.ts 의 ERD_CSS 끝에 붙는다. */
export const CORE_CSS = `
.erd-canvas__host { position: absolute; inset: 0; outline: none; }
.erd-canvas__host:focus-visible { box-shadow: inset 0 0 0 2px var(--color-primary); }
.erd-message[data-tone="warn"] { color: var(--color-warning); }
.erd-message[data-tone="error"] { color: var(--color-danger); }
.erd-notice { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-sm); padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-sm); color: var(--color-danger); background: var(--color-danger-soft); }
.erd-notice[data-code="RELOAD"], .erd-notice[data-code="NETWORK"] { color: var(--color-warning); background: var(--color-warning-soft); }
.erd-notice__label { font-weight: 600; }
.erd-notice__hint { color: var(--color-text-secondary); }
.erd-notice__spacer { flex: 1; }
.erd-version { border-top: 1px dashed var(--color-border); }
.erd-history__mine { font-weight: 600; }
.erd-confirm__summary { margin-bottom: var(--spacing-sm); font-size: var(--font-size-sm); }
.erd-confirm__group { margin-top: var(--spacing-sm); }
.erd-confirm__code { font-size: var(--font-size-sm); font-weight: 600; }
.erd-confirm__list { max-height: 240px; overflow-y: auto; margin: var(--spacing-xs) 0 0; padding-left: var(--spacing-md); font-size: var(--font-size-xs); }
.erd-confirm__more { font-size: var(--font-size-xs); color: var(--color-text-muted); }
.erd-confirm__error { margin-top: var(--spacing-sm); font-size: var(--font-size-sm); color: var(--color-danger); }
.erd-editors__row { display: flex; align-items: center; gap: var(--spacing-sm); padding: 2px 0; }
`;
```

`canvas/erd-styles.ts`(한 번만 고친다): 머리 주석 다음 줄에 import 를 넣고, 끝을 바꾼다.

```ts
import { CORE_CSS } from "../panels/core-styles";
```

```ts
// 바꾸기 전(파일 끝)
    grid-template-areas: "bar bar" "side center" "grid grid" "review review"; }
}
`;
// 바꾼 뒤
    grid-template-areas: "bar bar" "side center" "grid grid" "review review"; }
}
` + CORE_CSS;
```

- [ ] **Step 13: 구현 — 패널 연결(`ColumnGrid`·`DiagramTree`·`ReviewPanel`·`TopBar`)**

`panels/ColumnGrid.tsx`(FE3 소유, 뼈대 연결만): import 에 `import type { ErdEditContext } from "../edit-context";` 를 더하고, `ErdModelJson` 을 쓰는 `columnRows` 는 그대로 둔다. props 와 부품 머리를 바꾼다.

```tsx
// 바꾸기 전
export interface ColumnGridProps {
  model: ErdModelJson | null;
  tableId: string | null;
  status: ErdStatusView | null;
}

export function ColumnGrid({ model, tableId, status }: ColumnGridProps) {
  const rows = useMemo(() => (model ? columnRows(model, tableId, status) : []), [model, tableId, status]);
  const table = model && tableId ? model.tables[tableId] : undefined;
// 바꾼 뒤
export interface ColumnGridProps {
  /** 편집 문맥(Task 9). FE3 Task 14 가 칸 편집·그리드 키를 더한다. */
  ctx: ErdEditContext;
  tableId: string | null;
}

export function ColumnGrid({ ctx, tableId }: ColumnGridProps) {
  const model = ctx.state.model;
  const status = ctx.status;
  const rows = useMemo(() => columnRows(model, tableId, status), [model, tableId, status]);
  const table = tableId ? model.tables[tableId] : undefined;
```

`panels/DiagramTree.tsx`(FE2 소유, 뼈대 연결만): import 에 `import type { ErdEditContext } from "../edit-context";` 를 더하고 props 에 칸 하나를 더한다(부품 본문은 그대로).

```tsx
// 바꾸기 전
export interface DiagramTreeProps {
  state: ErdState | null;
// 바꾼 뒤
export interface DiagramTreeProps {
  /** 편집 문맥(모델을 읽기 전에는 null). FE2 Task 13 이 마법사·다이어그램 편집에 쓴다. */
  ctx: ErdEditContext | null;
  state: ErdState | null;
```

`panels/ReviewPanel.tsx`:
1. 머리 주석 4행의 `DB 차이(읽기, S4) / 변경 기록(view sinceRev)` 를 `DB 차이(DbDiffApply) / 변경 기록(ChangeLog)` 로 바꾼다.
2. import(8~17행)를 바꾼다.

```tsx
import { useCallback, useMemo } from "react";

import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Tabs, type TabItem } from "@dk-oasis/shared/tabs";

import type { RelationDecision } from "../api";
import type { ErdEditContext } from "../edit-context";
import type { ErdChangesView, ErdColumnStatus, ErdDbDiffView, ErdModelJson, ErdStatusView } from "../types";
import { ChangeLog } from "./ChangeLog";
import { statusBadge } from "./ColumnGrid";
import { DbDiffApply } from "./DbDiffApply";
```

3. `const DIFF_LABEL` 부터 `historyRows` 함수 끝까지(79~104행)와 `DIFF_COLUMNS`·`HISTORY_COLUMNS` 상수(113~126행)를 지운다. 같은 코드는 Step 12 의 `DbDiffApply.tsx`·`ChangeLog.tsx` 로 옮겼다.
4. props 에 `ctx` 를 더하고, 부품 머리에서 받으며, `diffList`·`historyList` 두 줄을 지운다.

```tsx
// 바꾸기 전
export interface ReviewPanelProps {
  model: ErdModelJson | null;
// 바꾼 뒤
export interface ReviewPanelProps {
  ctx: ErdEditContext | null;
  model: ErdModelJson | null;
```

```tsx
// 바꾸기 전
export function ReviewPanel({
  model, status, tab, onTab, diff, history, onReloadDiff, onReloadHistory, onDecide, onSelectTable, locked,
}: ReviewPanelProps) {
  const violations = useMemo(() => (model ? violationRows(model, status) : []), [model, status]);
  const inferred = useMemo(() => (model ? inferredRows(model) : []), [model]);
  const diffList = useMemo(() => diffRows(diff), [diff]);
  const historyList = useMemo(() => historyRows(history), [history]);
// 바꾼 뒤
export function ReviewPanel({
  ctx, model, status, tab, onTab, diff, history, onReloadDiff, onReloadHistory, onDecide, onSelectTable, locked,
}: ReviewPanelProps) {
  const violations = useMemo(() => (model ? violationRows(model, status) : []), [model, status]);
  const inferred = useMemo(() => (model ? inferredRows(model) : []), [model]);
```

5. 차이·기록 탭의 그리드를 부품으로 바꾼다.

```tsx
// 바꾸기 전
          {tab === "diff" && (
            <AgDataGrid gridId="erdDbDiff" columnSizing="fit" columns={DIFF_COLUMNS} data={diffList} rowKey="id"
              emptyMessage={diff ? "DB 와 모델이 같습니다." : "DB 차이를 읽는 중입니다."} />
          )}
          {tab === "history" && (
            <AgDataGrid gridId="erdHistory" columnSizing="fit" columns={HISTORY_COLUMNS} data={historyList} rowKey="id"
              emptyMessage={history ? "변경 기록이 없습니다." : "변경 기록을 읽는 중입니다."} />
          )}
// 바꾼 뒤
          {tab === "diff" && ctx && <DbDiffApply ctx={ctx} diff={diff} onReload={onReloadDiff} />}
          {tab === "history" && <ChangeLog history={history} />}
```

`panels/TopBar.tsx`:
1. `readOnlyReason` 함수(26~34행, 주석 포함)를 지우고 그 자리에 다시 내보내기 한 줄을 둔다(시험 `panel-rows.test.ts` 가 이 경로로 읽는다).

```tsx
/** 읽기 전용 이유 — state/permissions.ts 로 옮겼다(S2-20). 단계 1 경로를 남긴다. */
export { readOnlyReason } from "../state/permissions";
```

2. props 에 메시지 톤을 더하고 메시지 줄에 단다.

```tsx
// 바꾸기 전
  message: string | null;
  canReg: boolean;
// 바꾼 뒤
  message: string | null;
  /** 메시지 줄 색(ctx.notify 의 tone). */
  messageTone?: "info" | "warn" | "error";
  canReg: boolean;
```

```tsx
// 바꾸기 전
      <div className="erd-message" role="status" data-testid="erd-message">
// 바꾼 뒤
      <div className="erd-message" role="status" data-testid="erd-message" data-tone={p.messageTone ?? "info"}>
```

- [ ] **Step 14: 구현 — `ErdViewer.tsx` (전부 다시 씀)**

```tsx
"use client";

/**
 * ERD 설계 화면(단계 2 편집). 정본: 스펙 2.2·4.4·4.5·8절, 단계 2 README "화면 내부 계약".
 * 위 막대·버전 막대·알림 띠 · 왼쪽 다이어그램 목록 · 가운데 캔버스 · 오른쪽 컬럼 그리드 · 아래 검토 패널.
 * - 패널·캔버스는 편집 문맥(ErdEditContext) 하나를 받는다. 쓰기는 ctx.apply 하나다(연결·권한 판정 → 쓰기 줄 → 거절 알림·칸 강조).
 * - 권한은 모델 편집과 다이어그램 편집으로 나눈다(S2-20). 연결이 끊기면 편집을 멈춘다(스펙 4.4).
 * - 전역 키는 window 캡처 단계에서 받는다(S2-27): F3 논리·물리, Ctrl/⌘+T·K 표 찾기, Ctrl/⌘+O·Alt+O 컬럼 점프, Ctrl/⌘+Z 내 마지막 변경 되돌리기.
 *   포털 셸의 document 버블 단계 F3 보다 먼저 받아 끊는다. 입력 칸이면 F3 밖의 키는 넘긴다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBusy } from "@dk-oasis/shared/form";
import { canDoButton, useUserButtonRbac } from "@dk-oasis/shared/layout";
import {
  ControlButton, Controls, ReactFlow, ReactFlowProvider, getViewportForBounds, isTypingTarget, useReactFlow, useStore, useStoreApi,
  type EdgeTypes, type FitViewOptions, type NodeChange, type NodeTypes,
} from "@dk-oasis/shared/react-flow";
import { IconArrowsMaximize } from "@tabler/icons-react";

import {
  SCREEN_ID, compareDbDiff, importFromDb, regModel, rejectionText, searchModels, setViewState, viewChanges, viewStatus,
  type RegInput, type RelationDecision,
} from "./api";
import { ErdRelationEdge } from "./canvas/ErdRelationEdge";
import { ErdTableNode, namesOnlySelector } from "./canvas/ErdTableNode";
import { buildFlow, useStableById, type ErdFlowEdge, type ErdFlowNode, type ErdMode, type ErdPreset } from "./canvas/erd-flow";
import { NODE_WIDTH } from "./canvas/erd-geometry";
import { useCanvasEditing } from "./canvas/useCanvasEditing";
import {
  isDiagramOp, type ApplyOutcome, type ErdEditContext, type ErdHighlight, type ErdNav, type ErdNotice, type MessageTone,
} from "./edit-context";
import { ColumnGrid } from "./panels/ColumnGrid";
import { ColumnJump } from "./panels/ColumnJump";
import { DiagramTree, sortedDiagrams } from "./panels/DiagramTree";
import { NoticeBar } from "./panels/NoticeBar";
import { ReviewPanel, type ReviewTab } from "./panels/ReviewPanel";
import { TopBar, nextMode } from "./panels/TopBar";
import { VersionBar } from "./panels/VersionBar";
import { nodeKey } from "./state/model-delta";
import { blockedNotice, editRights, readOnlyBanner } from "./state/permissions";
import { useErdModel } from "./state/useErdModel";
import { newSession, useErdStream, useTabActive } from "./state/useErdStream";
import { createViewSync, type ViewSync } from "./state/view-sync";
import type { ErdChangesView, ErdColumnStatus, ErdCommandJson, ErdDbDiffView, ErdModelRow, ErdStatusView } from "./types";

const NODE_TYPES: NodeTypes = { erdTable: ErdTableNode };
const EDGE_TYPES: EdgeTypes = { erdRelation: ErdRelationEdge };
const PRO_OPTIONS = { hideAttribution: true };
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;
/** 화면 맞춤(단계 1 마감-화면 맞춤): includeHiddenNodes 로 그리지 않은 노드도 넣고, 맞춤 배율은 1 을 넘지 않는다. */
const FIT_OPTIONS: FitViewOptions = { includeHiddenNodes: true, padding: 0.1, maxZoom: 1 };
const STATUS_DEBOUNCE_MS = 500;
const HISTORY_SPAN = 100;
const NO_STATUSES: Record<string, ErdColumnStatus> = {};
const NO_DOMAINS: Record<string, { name: string }> = {};
const NO_SELECTION: ReadonlySet<string> = new Set();
const UNDO_CONFLICT_HINT = "변경 기록에서 다른 변경을 고르세요.";

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

interface Reveal {
  tableId: string;
  seq: number;
}

interface CanvasPaneProps {
  ctx: ErdEditContext;
  diagramId: string;
  mode: ErdMode;
  preset: ErdPreset;
  selected: ReadonlySet<string>;
  reveal: Reveal | null;
  onSelect(changes: { id: string; selected: boolean }[]): void;
}

/**
 * 캔버스(React Flow 문맥 안). 선택은 여기서 처리하고, 편집(끌기·잇기·도구·캔버스 키)은 useCanvasEditing(FE2)이 맡는다.
 * flowProps 는 정한 키만 받아 아래 다른 props 를 덮지 않는다. 확대율은 "50% 미만인가" 만 구독한다.
 */
function CanvasPane({ ctx, diagramId, mode, preset, selected, reveal, onSelect }: CanvasPaneProps) {
  const { state, status, session } = ctx;
  const namesOnly = useStore(namesOnlySelector);
  const statuses = status?.statuses ?? NO_STATUSES;
  const domains = status?.domains ?? NO_DOMAINS;
  const raw = useMemo(
    () => buildFlow({ state, diagramId, mode, preset, namesOnly, statuses, domains, selected, mySession: session }),
    [state, diagramId, mode, preset, namesOnly, statuses, domains, selected, session],
  );
  const stableNodes = useStableById(raw.nodes);
  const edges = useStableById(raw.edges);
  const rf = useReactFlow<ErdFlowNode, ErdFlowEdge>();
  const editing = useCanvasEditing(ctx, rf);
  const { decorateNodes, onNodesChange: editNodes } = editing;
  const nodes = useMemo(() => decorateNodes(stableNodes), [decorateNodes, stableNodes]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const storeApi = useStoreApi();

  /** [화면 맞춤] — 곧바로 옮긴다(Local-Rules §33). 경계 상자는 잰 크기가 없으면 initialWidth·initialHeight 로 잰다. */
  const fitAll = useCallback(() => {
    const ids = rf.getNodes().map((n) => n.id);
    if (ids.length === 0) return;
    const { width, height, minZoom } = storeApi.getState();
    const vp = getViewportForBounds(rf.getNodesBounds(ids), width, height, minZoom, FIT_OPTIONS.maxZoom ?? MAX_ZOOM, FIT_OPTIONS.padding ?? 0.1);
    void rf.setViewport(vp, { duration: 200 });
  }, [rf, storeApi]);

  useEffect(() => {
    if (!reveal) return;
    const n = stateRef.current.nodes[nodeKey(diagramId, reveal.tableId)];
    if (!n) return;
    void rf.setCenter(n.x + NODE_WIDTH / 2, n.y + 60, { zoom: Math.max(rf.getZoom(), 0.8), duration: 200 });
  }, [reveal, diagramId, rf]);

  const onNodesChange = useCallback(
    (changes: NodeChange<ErdFlowNode>[]) => {
      const picks: { id: string; selected: boolean }[] = [];
      for (const c of changes) if (c.type === "select") picks.push({ id: c.id, selected: c.selected });
      if (picks.length > 0) onSelect(picks);
      editNodes(changes);
    },
    [onSelect, editNodes],
  );

  return (
    <div className="erd-canvas__host" tabIndex={0} onKeyDown={editing.onKeyDown} data-testid="erd-canvas-host">
      {editing.toolbar}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        {...editing.flowProps}
        edgesFocusable={false}
        elementsSelectable
        disableKeyboardA11y
        onlyRenderVisibleElements
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        fitView={reveal === null}
        fitViewOptions={FIT_OPTIONS}
        proOptions={PRO_OPTIONS}
      >
        <Controls position="bottom-right" orientation="horizontal" showInteractive={false} showFitView={false}>
          <ControlButton onClick={fitAll} title="화면 맞춤" aria-label="화면 맞춤" data-testid="erd-fit">
            <IconArrowsMaximize />
          </ControlButton>
        </Controls>
      </ReactFlow>
      {editing.overlay}
    </div>
  );
}

export function ErdViewer() {
  const rbac = useUserButtonRbac();
  const me = rbac.userId;
  const canSave = canDoButton(rbac, SCREEN_ID, "save");
  const canImport = canDoButton(rbac, SCREEN_ID, "import");
  const canReg = canDoButton(rbac, SCREEN_ID, "reg");
  const canConfirm = canDoButton(rbac, SCREEN_ID, "confirm");
  const canExecute = canDoButton(rbac, SCREEN_ID, "execute");
  const active = useTabActive();
  const [session] = useState(() => newSession());
  const [models, setModels] = useState<ErdModelRow[]>([]);
  const [modelId, setModelId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<MessageTone>("info");
  const [notice, setNotice] = useState<ErdNotice | null>(null);
  const [highlight, setHighlight] = useState<ErdHighlight | null>(null);
  const { isBusy, run } = useBusy(); // 가져오기 진행 상태(R5)
  const [mode, setMode] = useState<ErdMode>("logical");
  const [preset, setPreset] = useState<ErdPreset>("basic");
  const [diagramId, setDiagramId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(NO_SELECTION);
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [findSeq, setFindSeq] = useState(0);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [status, setStatus] = useState<ErdStatusView | null>(null);
  const [tab, setTab] = useState<ReviewTab>("violations");
  const [diff, setDiff] = useState<ErdDbDiffView | null>(null);
  const [history, setHistory] = useState<ErdChangesView | null>(null);
  const [reviewEpoch, setReviewEpoch] = useState(0);
  const diffSeq = useRef(0);
  const historySeq = useRef(0);
  const [docShown, setDocShown] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  const statusReadKey = useRef<string | null>(null);

  const erd = useErdModel(modelId, session, me);
  const { state } = erd;
  const stateRef = useRef(state);
  stateRef.current = state;
  const modelIdRef = useRef(modelId);
  modelIdRef.current = modelId;
  const ready = state !== null && state.modelId === modelId;

  const notify = useCallback((text: string, tone: MessageTone = "info") => {
    setMessage(text);
    setMessageTone(tone);
  }, []);

  // ── 실시간 채널 ──
  const handlers = useMemo(
    () => ({
      onHello: (rev: number) => {
        if (rev !== stateRef.current?.rev) void erd.reload();
      },
      onDelta: erd.applyDelta,
      onReload: () => void erd.reload({ dropMine: true }),
      onPresence: erd.setPresence,
      onClaims: erd.setClaims,
    }),
    [erd.applyDelta, erd.reload, erd.setPresence, erd.setClaims],
  );
  const streamStatus = useErdStream({ modelId, session, ready, lastRev: state?.rev ?? null, handlers });
  const connected = streamStatus === "open";

  // ── 권한(S2-20) ──
  const rights = useMemo(
    () => editRights(state, me, { loading: rbac.isLoading, save: canSave, confirm: canConfirm, execute: canExecute }, connected),
    [state, me, rbac.isLoading, canSave, canConfirm, canExecute, connected],
  );
  const rightsRef = useRef(rights);
  rightsRef.current = rights;
  const connectedRef = useRef(connected);
  connectedRef.current = connected;

  // ── 모델 목록(진입 때 한 번) ──
  const loadModels = useCallback(async (): Promise<boolean> => {
    try {
      setModels(await searchModels());
      return true;
    } catch (e) {
      notify(errText(e), "error");
      return false;
    }
  }, [notify]);
  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  // 모델이 바뀌면 모델에 묶인 화면 상태를 비운다.
  useEffect(() => {
    setStatus(null);
    setDiff(null);
    setHistory(null);
    setSelected(NO_SELECTION);
    setSelectedColumnId(null);
    setDiagramId(null);
    setReveal(null);
    setNotice(null);
    setHighlight(null);
    setJumpOpen(false);
    statusReadKey.current = null;
    diffSeq.current += 1;
    historySeq.current += 1;
  }, [modelId]);

  // 포털 탭이 숨겨졌거나 문서가 가려진 동안은 표준 상태를 읽지 않는다(R10).
  useEffect(() => {
    const sync = () => setDocShown(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  const viewing = active && docShown;

  // ── 표준 상태: 모델을 읽은 뒤와 표·컬럼 델타 뒤 0.5초 미뤄 읽는다. 늦은 응답은 버린다(§37). ──
  useEffect(() => {
    if (!ready || !modelId || !viewing) return;
    const key = `${modelId}:${erd.columnsSeq}`;
    if (statusReadKey.current === key) return;
    let alive = true;
    const t = setTimeout(() => {
      viewStatus(modelId)
        .then((s) => {
          if (alive && modelIdRef.current === modelId) {
            statusReadKey.current = key;
            setStatus(s);
          }
        })
        .catch((e) => {
          if (alive) notify(errText(e), "error");
        });
    }, STATUS_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [modelId, ready, erd.columnsSeq, viewing, notify]);

  // ── 다이어그램·선택 ──
  const diagrams = useMemo(() => (state ? sortedDiagrams(state.diagrams) : []), [state]);
  const activeDiagram = diagramId && state?.diagrams[diagramId] ? diagramId : diagrams[0]?.id ?? null;
  const activeRef = useRef(activeDiagram);
  activeRef.current = activeDiagram;
  const focusTable = selected.size > 0 ? [...selected][0] : null;

  const onSelect = useCallback((changes: { id: string; selected: boolean }[]) => {
    setSelected((cur) => {
      const next = new Set(cur);
      for (const c of changes) {
        if (c.selected) next.add(c.id);
        else next.delete(c.id);
      }
      return next.size === cur.size && [...next].every((x) => cur.has(x)) ? cur : next;
    });
    setSelectedColumnId(null);
  }, []);

  const selectTable = useCallback((tableId: string) => {
    const s = stateRef.current;
    if (!s) return;
    setSelected((cur) => (cur.size === 1 && cur.has(tableId) ? cur : new Set([tableId])));
    setSelectedColumnId(null);
    const here = activeRef.current;
    if (!here || !s.nodes[nodeKey(here, tableId)]) {
      const other = Object.values(s.nodes).find((n) => n.table === tableId);
      if (other) setDiagramId(other.diagram);
    }
    setReveal((r) => ({ tableId, seq: (r?.seq ?? 0) + 1 }));
  }, []);

  const onSelectDiagram = useCallback((id: string) => {
    setDiagramId(id);
    setReveal(null);
  }, []);

  const nav = useMemo<ErdNav>(() => ({
    selectTable,
    selectColumn: (columnId: string) => {
      const c = stateRef.current?.model.columns[columnId];
      if (!c) return;
      selectTable(c.table);
      setSelectedColumnId(columnId);
    },
    openTableFind: () => setFindSeq((s) => s + 1),
    openColumnJump: () => setJumpOpen(true),
  }), [selectTable]);
  const closeJump = useCallback(() => setJumpOpen(false), []);

  // ── 화면 상태 알리기(SET_VIEW, 1초에 한 번 이하). 다시 연결되면 서버 화면 상태가 비므로 같은 값도 다시 보낸다. ──
  const syncRef = useRef<ViewSync | null>(null);
  useEffect(() => {
    if (!modelId) return;
    const sync = createViewSync((v) => {
      // 알리기 실패(연결 직후 경합 등)는 화면 동작과 무관하다. 다음 선택 때 다시 보낸다.
      setViewState(modelId, session, v).catch(() => undefined);
    });
    syncRef.current = sync;
    return () => {
      sync.dispose();
      if (syncRef.current === sync) syncRef.current = null;
    };
  }, [modelId, session]);
  const selectedKey = [...selected].sort().join(",");
  useEffect(() => {
    if (connected) syncRef.current?.forget();
  }, [connected]);
  useEffect(() => {
    if (!connected) return;
    syncRef.current?.push({ diagramId: activeDiagram, selectedTables: selectedKey ? selectedKey.split(",") : [] });
  }, [connected, activeDiagram, selectedKey]);

  // ── 알림·칸 강조 ──
  const showNotice = useCallback((n: ErdNotice) => {
    if (n.code === "NEEDS_CHOICE") return; // 부른 쪽이 choices 로 선택 창을 띄운다
    setNotice(n);
    if (n.elementId && (n.code === "CONFLICT" || n.code === "NOT_FOUND" || n.code === "INVALID")) {
      setHighlight({ code: n.code, elementId: n.elementId, property: n.property, message: n.message, mine: n.mine });
    }
  }, []);
  const clearHighlight = useCallback(() => setHighlight(null), []);
  const closeNotice = useCallback(() => {
    setNotice(null);
    setHighlight(null);
  }, []);

  /** 가져오기·관계 결정·되돌리기 뒤: DB 차이·변경 기록을 비우고 다시 읽게 한다. 날아오는 옛 응답은 순번으로 버린다. */
  const invalidateReview = useCallback(() => {
    diffSeq.current += 1;
    historySeq.current += 1;
    setDiff(null);
    setHistory(null);
    setReviewEpoch((n) => n + 1);
  }, []);

  // ── 쓰기(ctx.apply) — 연결·권한 판정 → 쓰기 줄 → 거절 알림 ──
  const apply = useCallback(async (commands: ErdCommandJson[], label: string): Promise<ApplyOutcome> => {
    const blocked = blockedNotice(rightsRef.current, connectedRef.current, commands.some((c) => !isDiagramOp(c.op)));
    const out: ApplyOutcome = blocked ? { ok: false, notice: blocked } : await erd.apply(commands, label);
    if (!out.ok) showNotice(out.notice);
    return out;
  }, [erd.apply, showNotice]);

  /** 되돌리기(변경 기록·Ctrl+Z). Ctrl+Z 가 CONFLICT 면 다른 변경을 고르라고 붙인다(그 rev 는 이미 myRevs 에서 뺐다). */
  const undoRevision = useCallback(async (rev: number, fromKey: boolean): Promise<ApplyOutcome> => {
    const blocked = blockedNotice(rightsRef.current, connectedRef.current, false);
    let out: ApplyOutcome = blocked ? { ok: false, notice: blocked } : await erd.undo(rev);
    if (!out.ok && fromKey && out.notice.code === "CONFLICT") {
      out = { ok: false, notice: { ...out.notice, hint: [out.notice.hint, UNDO_CONFLICT_HINT].filter(Boolean).join(" ") } };
    }
    if (out.ok) {
      invalidateReview();
      notify(`rev ${rev} 를 되돌렸습니다(rev ${out.rev}).`);
    } else showNotice(out.notice);
    return out;
  }, [erd.undo, invalidateReview, notify, showNotice]);

  const undoLast = useCallback(() => {
    const last = erd.myRevs[erd.myRevs.length - 1];
    if (last === undefined) {
      notify("되돌릴 내 변경이 없습니다.", "warn");
      return;
    }
    void undoRevision(last, true);
  }, [erd.myRevs, notify, undoRevision]);

  // ── 전역 키(S2-8·S2-27). 포털 탭이 활성일 때만. 받은 키는 끊어서 캔버스·그리드 처리기가 다시 받지 않게 한다. ──
  const navRef = useRef(nav);
  navRef.current = nav;
  const undoLastRef = useRef(undoLast);
  undoLastRef.current = undoLast;
  useEffect(() => {
    if (!active) return;
    const stop = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "F3" && !e.altKey && !mod) {
        stop(e);
        setMode(nextMode);
        return;
      }
      if (isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      const plainMod = mod && !e.shiftKey && !e.altKey;
      if (plainMod && (k === "t" || k === "k")) {
        stop(e);
        navRef.current.openTableFind();
      } else if ((plainMod && k === "o") || (e.altKey && !mod && !e.shiftKey && e.code === "KeyO")) {
        stop(e);
        navRef.current.openColumnJump();
      } else if (plainMod && k === "z") {
        stop(e);
        undoLastRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active]);

  // ── 읽기 전용 띠·쓰기 단추 막기 ──
  const roBanner = state ? readOnlyBanner(rights) : null;
  const locked = rbac.isLoading || !rights.model.ok || isBusy("import");

  const onDecide = useCallback(async (relationId: string, op: RelationDecision) => {
    const out = await apply([{ op, id: relationId }], op === "confirmRelation" ? "관계 확정" : "관계 기각");
    if (!out.ok) return;
    invalidateReview();
    notify(op === "confirmRelation" ? "관계를 확정했습니다." : "관계를 기각했습니다.");
  }, [apply, invalidateReview, notify]);

  /** 첫 가져오기 — 쓰기 줄을 비운 뒤 돈다(ctx.exclusive). 응답 델타는 얹지 않고 모델을 다시 읽는다. */
  const onImport = useCallback(
    () =>
      run("import", () => erd.exclusive(async () => {
        const s = stateRef.current;
        if (!s) return;
        const startModel = s.modelId;
        try {
          const r = await importFromDb(startModel, s.rev, session);
          if (modelIdRef.current !== startModel) return;
          if (!r.applied) {
            notify(rejectionText(r.rejection), "error");
            return;
          }
          const sm = r.summary;
          notify(sm
            ? `표 ${sm.tables}개·컬럼 ${sm.columns}개·키 ${sm.keys}개, 관계 DB ${sm.relations.DB ?? 0}개·추정 ${sm.relations.INFERRED ?? 0}개를 가져왔습니다.`
            : "가져왔습니다.");
          if (sm) setDiagramId(sm.diagramId);
          await erd.reload();
          if (modelIdRef.current === startModel) invalidateReview();
        } catch (e) {
          if (modelIdRef.current === startModel) notify(errText(e), "error");
        }
      })),
    [erd.exclusive, erd.reload, session, run, invalidateReview, notify],
  );

  /** 등록이 끝나면 true. 단추 쪽이 true 일 때만 입력 칸을 닫는다. */
  const onRegister = useCallback(async (input: RegInput): Promise<boolean> => {
    const before = modelIdRef.current;
    try {
      const r = await regModel(input);
      notify(`모델 ${r.modelId} 를 등록했습니다. [DB 가져오기] 로 스키마를 가져오세요.`);
      const listed = await loadModels();
      // 등록을 기다리는 동안 다른 모델을 골랐으면 그 선택을 둔다.
      if (listed && modelIdRef.current === before) setModelId(r.modelId);
      return true;
    } catch (e) {
      notify(errText(e), "error");
      return false;
    }
  }, [loadModels, notify]);

  // ── 검토 패널의 DB 차이·변경 기록: 탭을 처음 열 때 읽는다. ──
  const loadDiff = useCallback(async () => {
    const id = modelIdRef.current;
    if (!id) return;
    const seq = ++diffSeq.current;
    try {
      const v = await compareDbDiff(id);
      if (modelIdRef.current === id && diffSeq.current === seq) setDiff(v);
    } catch (e) {
      if (diffSeq.current === seq) notify(errText(e), "error");
    }
  }, [notify]);
  const loadHistory = useCallback(async () => {
    const s = stateRef.current;
    if (!s) return;
    const seq = ++historySeq.current;
    try {
      const v = await viewChanges(s.modelId, Math.max(0, s.rev - HISTORY_SPAN));
      if (modelIdRef.current === s.modelId && historySeq.current === seq) setHistory(v);
    } catch (e) {
      if (historySeq.current === seq) notify(errText(e), "error");
    }
  }, [notify]);
  useEffect(() => {
    if (!ready) return;
    if (tab === "diff" && diff === null) void loadDiff();
    if (tab === "history" && history === null) void loadHistory();
  }, [tab, ready, diff, history, reviewEpoch, loadDiff, loadHistory]);

  // ── 편집 문맥 — 모델을 다 읽은 뒤에만 만든다 ──
  const ctx = useMemo<ErdEditContext | null>(() => (ready && state && modelId ? {
    modelId, session, me: me ?? "", state, status, rights, diagramId: activeDiagram, selectedTableId: focusTable, selectedColumnId,
    highlight, pendingIds: erd.pendingIds, apply, exclusive: erd.exclusive, clearHighlight, notify, nav,
  } : null), [ready, state, modelId, session, me, status, rights, activeDiagram, focusTable, selectedColumnId, highlight,
    erd.pendingIds, apply, erd.exclusive, clearHighlight, notify, nav]);

  const emptyText = !modelId
    ? "위 막대에서 모델을 고르거나 등록하세요."
    : !ready
      ? erd.error ?? "모델을 읽는 중입니다."
      : Object.keys(state!.model.tables).length === 0
        ? "표가 없습니다. [DB 가져오기] 로 스키마를 가져오세요."
        : "다이어그램이 없습니다.";

  return (
    <div className="erd-app" data-testid="erd-viewer">
      <div className="erd-area-bar">
        <TopBar
          models={models} modelId={modelId} onModelChange={setModelId} state={state} mySession={session}
          mode={mode} onModeChange={setMode} preset={preset} onPresetChange={setPreset}
          streamStatus={streamStatus} readOnly={roBanner} message={message} messageTone={messageTone}
          canReg={canReg} canImport={canImport} locked={locked} onRegister={onRegister} onImport={onImport}
        />
        {ctx && <VersionBar ctx={ctx} onReload={erd.reload} onVersion={erd.onVersion} />}
        <NoticeBar notice={notice} onClose={closeNotice} />
      </div>
      <div className="erd-area-side">
        <DiagramTree ctx={ctx} state={state} statuses={status?.statuses ?? NO_STATUSES} activeDiagram={activeDiagram}
          onSelectDiagram={onSelectDiagram} onRevealTable={selectTable} findSeq={findSeq} />
      </div>
      <div className="erd-area-center">
        {ctx && activeDiagram ? (
          <ReactFlowProvider key={activeDiagram}>
            <div className="erd-canvas" data-mode={mode}>
              <CanvasPane ctx={ctx} diagramId={activeDiagram} mode={mode} preset={preset} selected={selected} reveal={reveal} onSelect={onSelect} />
            </div>
          </ReactFlowProvider>
        ) : (
          <div className="erd-empty" data-testid="erd-canvas-empty">
            {emptyText}
          </div>
        )}
      </div>
      <div className="erd-area-grid">
        {ctx ? (
          <ColumnGrid ctx={ctx} tableId={focusTable} />
        ) : (
          <div className="erd-empty" data-testid="erd-columns-empty">
            캔버스나 검토 목록에서 표를 고르세요.
          </div>
        )}
        {ctx && <ColumnJump ctx={ctx} opened={jumpOpen} onClose={closeJump} />}
      </div>
      <div className="erd-area-review">
        <ReviewPanel ctx={ctx} model={state?.model ?? null} status={status} tab={tab} onTab={setTab} diff={diff} history={history}
          onReloadDiff={loadDiff} onReloadHistory={loadHistory} onDecide={onDecide} onSelectTable={selectTable} locked={locked} />
      </div>
    </div>
  );
}
```

- [ ] **Step 15: 시험 통과 확인**

Run: `cd src/frontend && pnpm --filter "@dk-oasis/m-mdm^..." build && pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/`
Expected: PASS — 새 시험 9건(`edit-core.test.ts` 6건, `api.test.ts` 1건, `page-render.test.ts` 2건)과 기존 erdEdit 시험 전부(`panel-rows.test.ts` 의 `historyRows` 시험은 고른 칸만 견주므로 Task 10 의 `who` 칸에도 그대로 통과한다). 실패 0.

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint`
Expected: 오류 0.

화면 바깥 영향이 없는지 m-mdm 전체를 한 번 돈다(기준선 실패 `ui-meta-lock.test.ts` 는 새 실패가 아니다, README 조사 D 5.5).

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm test`
Expected: 실패는 기준선 `ui-meta-lock.test.ts` 하나뿐이다.

- [ ] **Step 16: 커밋하고 Task 9 를 먼저 머지한다**

```bash
/usr/bin/git add src/frontend/m-mdm/pages/dma/erdEdit src/frontend/m-mdm/tests/dma/erdEdit
/usr/bin/git commit -m "$(cat <<'MSG'
feat(erd-edit): 화면 뼈대 — 편집 문맥·단계 2 API·권한 나누기·전역 키·자리 부품

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
MSG
)"
```

레인 보고에 "Task 9 머지 준비 끝"을 적고 조정 세션의 머지 허가를 기다린다. 머지 순서와 방법은 README Global Constraints 를 따른다(`squash-branch.mjs --onto dev --rebase` → `--ff-only`). 머지되면 FE2 Task 13·FE3 Task 14 가 rebase 하고 시작한다. FE1 은 머지 뒤 dev 에서 이어 Task 10 을 한다.

---
### Task 10: 두 층 모델 — `state/pending.ts`(시험 8), 거절 알림·내 값 복사, 연결 끊김, 되돌리기, 접속자, `version`

**Files:**
- Modify: `src/frontend/m-mdm/pages/dma/erdEdit/state/pending.ts` (전부 다시 씀 — 순수 두 층 모듈)
- Modify: `src/frontend/m-mdm/pages/dma/erdEdit/state/useErdModel.ts` (전부 다시 씀 — 속을 두 층으로, 서명은 Task 9 그대로)
- Modify: `src/frontend/m-mdm/pages/dma/erdEdit/state/useErdStream.ts` (`version` 이벤트)
- Modify: `src/frontend/m-mdm/pages/dma/erdEdit/panels/{NoticeBar,ChangeLog}.tsx` (전부 다시 씀), `panels/ReviewPanel.tsx`, `panels/TopBar.tsx`
- Modify: `src/frontend/m-mdm/pages/dma/erdEdit/ErdViewer.tsx` (`onVersion` 연결, 변경 기록 되돌리기)
- Test: `src/frontend/m-mdm/tests/dma/erdEdit/pending.test.ts`(새), `core-panels.test.ts`(새), `erd-stream.test.ts`, `page-render.test.ts`

**Interfaces:**
- Consumes: Task 9 의 `edit-context.ts`(`noticeFromRejection`·`localNotice`·`valueText`·`ApplyOutcome`), `model-delta.ts`(`applyDelta`·`nodeKey`·`withVersion`·`touchesColumns`), `permissions.ts`(`LOST_TEXT`), `api.ts`(`applyCommands`·`undoRev`), SSE 정본(README "SSE" 절 — `change.rowVersion`, `version`, `presence[].expiresAt`), 응답 정본(`ErdApplyResult.rowVersion`, `ErdRejection.byUserId`).
- Produces:
  - `state/pending.ts`: README 의 `PendingBatch`·`Layers`·`project`·`projectCommand`·`enqueue`·`onResult`·`onStream`·`onTick`·`onReloaded`·`resultDelta`, 그리고 `initLayers`·`markSending`·`dropBatch`·`pendingIds`·`HOLD_LIMIT_MS`·`PendingMe`·`ResultOutcome`. `onStream` 은 네 번째 인자 `me` 를 받고, `onResult` 결과에 `mine`(myRevs 에 넣을 rev)이 있다(README 정본).
  - `useErdModel` 의 `state`(투영), `server`, `pending`, `pendingIds`, `myRevs`, `onVersion` 이 실제 값을 낸다. FE2·FE3 이 쓰는 `ctx.pendingIds` 가 이때부터 채워진다.
  - `useErdStream` 의 `ErdStreamHandlers.onVersion?`.
  - 패널: `NoticeBar`([내 값 복사]), `ChangeLog`(`historyRows(view, mySession)`, 행마다 [되돌리기]), `TopBar.presenceAvatars`.

두 층 규칙(S2-17·S2-18, README "화면 내부 계약"):
1. 묶음은 `queued` → `sending` → (응답) 빠짐 또는 `held`. 보내는 묶음은 늘 하나 이하다. `baseRev` 는 보낼 때의 아래층 rev 다.
2. 응답 rev 가 아래층 rev + 1 이면 응답 델타를 바로 얹고 묶음을 뺀다. 더 크면 묶음을 `held` 로 두고 델타를 보관한다. SSE 가 그 앞 rev 까지 채우면 얹고 뺀다. 같은 rev 의 SSE 에코는 그 뒤 stale 로 버린다. 5초 안에 못 채우면 모델을 다시 읽는다.
3. `sending` 묶음이 있을 때 내 세션의 SSE 델타가 오면 그 묶음의 에코다. 델타를 아래층에 얹고 묶음을 `echoed` 로 바꿔 투영에서 뺀다. 늦게 온 응답은 결과만 돌려주고 델타를 다시 얹지 않는다.
4. 거절이면 묶음을 빼고 알림을 만든다. 투영이 원래 값으로 돌아간다.
5. 다시 읽으면 대기 묶음·보관 델타를 모두 버린다. 보내지 않은(`queued`) 묶음 수를 RELOAD 알림으로 알린다.
6. `myRevs` 에는 반영 응답 rev 만 넣는다. SSE 에코로는 넣지 않는다. 되돌리기 묶음(`undoOf`)의 rev 는 넣지 않는다.
7. 미리 그리는 명령은 `updateTable`·`updateColumn`·`moveColumn`·`deleteTable`·`deleteColumn`·`confirmRelation`·`rejectRelation`, 다이어그램 명령, 그리고 `id`·`phys` 를 준 `addTable` 이다. 나머지(`addColumn`·`addKey`·`addRelation`·`applyDomain`·`setPrimaryKey` 등)는 투영을 바꾸지 않고 `pendingIds` 로 흐린 자리표시만 한다.

- [ ] **Step 1: 실패하는 시험 작성 — 두 층 모듈(시험 8, Review Focus 1)**

`src/frontend/m-mdm/tests/dma/erdEdit/pending.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  enqueue, initLayers, markSending, onReloaded, onResult, onStream, onTick, pendingIds, project, projectCommand, type Layers,
} from "../../../pages/dma/erdEdit/state/pending";
import type { ErdApplyResult, ErdChange, ErdCommandJson, ErdDelta, ErdRejection } from "../../../pages/dma/erdEdit/types";
import { MENU_DIAGRAMS, menuModel, stateOf } from "./erd-fixtures";

const ME = { userId: "tester", session: "ui-me" };
const base = (): Layers => initLayers(stateOf(menuModel(), MENU_DIAGRAMS)); // rev 3, rowVersion 0
const rename = (logical: string): ErdCommandJson => ({ op: "updateColumn", id: "c-4", set: { logical } });
const colPatch = (id: string, value: Record<string, unknown>): ErdChange => ({ kind: "column", id, op: "patch", value });
const delta = (rev: number, session: string, changes: ErdChange[], userId = "peer"): ErdDelta =>
  ({ modelId: "mcm", rev, userId, session, source: "UI", rowVersion: null, changes });
const applied = (rev: number, changes: ErdChange[], rowVersion: number | null = 1): ErdApplyResult =>
  ({ applied: true, rev, rowVersion, changes, warnings: [], rejection: null });

/** 묶음을 줄에 넣고 보내기 시작한 층. */
function sent(l: Layers, id: number, commands: ErdCommandJson[]): Layers {
  const s = markSending(enqueue(l, { id, label: `묶음 ${id}`, baseRev: l.server.rev, commands }), id);
  if (!s) throw new Error("보내기를 시작하지 못했다");
  return s.layers;
}
const logicalOf = (l: Layers, id: string) => project(l.server, l.pending).model.columns[id]?.logical;

describe("두 층 모델(스펙 4.4, 시험 8)", () => {
  it("반영: 응답 rev 가 아래층 + 1 이면 응답 델타를 얹고 묶음을 뺀다. rowVersion 과 내 rev 를 돌려준다", () => {
    const l = sent(base(), 1, [rename("메뉴이름")]);
    expect(l.pending[0]).toMatchObject({ state: "sending", baseRev: 3 });
    expect(logicalOf(l, "c-4")).toBe("메뉴이름");
    expect(l.server.model.columns["c-4"].logical).toBe("메뉴명");
    const out = onResult(l, 1, applied(4, [colPatch("c-4", { logical: "메뉴이름" })], 7), ME, 0);
    expect(out).toMatchObject({ notice: null, reload: false, mine: 4 });
    expect(out.layers.pending).toEqual([]);
    expect([out.layers.server.rev, out.layers.server.rowVersion, out.layers.server.model.columns["c-4"].logical]).toEqual([4, 7, "메뉴이름"]);
  });

  it("거절: 묶음을 빼서 투영이 원래 값으로 돌아가고, CONFLICT 알림에 바꾼 사람·내 값을 싣는다", () => {
    const l = sent(base(), 1, [rename("메뉴이름")]);
    const rejection: ErdRejection = {
      code: "CONFLICT", commandIndex: 0, message: "다른 세션이 먼저 바꾼 값입니다", hint: "getChangesSince(3) 로 바뀐 값을 읽고 다시 보내세요",
      elementId: "c-4", property: "logical", byRev: 4, bySession: "ui-peer", byUserId: "41000207", current: "역할설명", choices: null, ownerId: null,
    };
    const out = onResult(l, 1, { applied: false, rev: 4, rowVersion: null, changes: [], warnings: [], rejection }, ME, 0);
    expect(out.layers.pending).toEqual([]);
    expect(logicalOf(out.layers, "c-4")).toBe("메뉴명");
    expect(out.notice).toMatchObject({ code: "CONFLICT", elementId: "c-4", property: "logical", mine: "메뉴이름", byUserId: "41000207" });
    expect(out.mine).toBeNull();
  });

  it("다른 세션 변경이 SSE 로 오면 아래층에 얹고 내 대기 묶음을 그 위에 다시 얹는다", () => {
    const l = sent(base(), 1, [rename("메뉴이름")]);
    const peer = onStream(l, delta(4, "ui-peer", [colPatch("c-1", { logical: "메뉴ID" })]), 0, ME);
    expect(peer.reload).toBe(false);
    const view = project(peer.layers.server, peer.layers.pending);
    expect([view.rev, view.model.columns["c-1"].logical, view.model.columns["c-4"].logical]).toEqual([4, "메뉴ID", "메뉴이름"]);
    expect(peer.layers.pending[0].state).toBe("sending");
  });

  it("pendingHoldsResultUntilStreamCatchesUp", () => {
    const l = sent(base(), 1, [rename("메뉴이름")]);
    // 내 응답(rev 5)이 남의 rev 4 SSE 보다 먼저 왔다 — 모델 전체를 다시 읽지 않고 보관한다
    const r = onResult(l, 1, applied(5, [colPatch("c-4", { logical: "메뉴이름" })], 9), ME, 1000);
    expect(r).toMatchObject({ reload: false, mine: 5, notice: null });
    expect(r.layers.server.rev).toBe(3);
    expect(r.layers.pending[0]).toMatchObject({ id: 1, state: "held", heldRev: 5, heldSince: 1000 });
    expect(r.layers.held.map((d) => d.rev)).toEqual([5]);
    expect(logicalOf(r.layers, "c-4")).toBe("메뉴이름"); // 보관하는 동안에도 내 값이 보인다
    expect(onTick(r.layers, 6000).reload).toBe(false);
    // rev 4 가 오면 그 뒤에 보관한 rev 5 를 얹는다
    const s = onStream(r.layers, delta(4, "ui-peer", [colPatch("c-1", { logical: "메뉴ID" })]), 2000, ME);
    expect(s.reload).toBe(false);
    expect([s.layers.server.rev, s.layers.server.rowVersion]).toEqual([5, 9]);
    expect([s.layers.server.model.columns["c-1"].logical, s.layers.server.model.columns["c-4"].logical]).toEqual(["메뉴ID", "메뉴이름"]);
    expect([s.layers.pending, s.layers.held]).toEqual([[], []]);
    // 같은 rev 의 SSE 에코는 stale 로 버린다
    const echo = onStream(s.layers, delta(5, "ui-me", [colPatch("c-4", { logical: "메뉴이름" })], "tester"), 2100, ME);
    expect(echo).toEqual({ layers: s.layers, reload: false });
  });

  it("pendingDropsBatchWhenEchoArrivesFirst", () => {
    const l = sent(base(), 1, [rename("메뉴이름")]);
    // 커밋 뒤 전달 실행기 때문에 내 묶음의 SSE 에코가 응답보다 먼저 왔다
    const e = onStream(l, delta(4, "ui-me", [colPatch("c-4", { logical: "메뉴이름" })], "tester"), 0, ME);
    expect(e.reload).toBe(false);
    expect(e.layers.server.rev).toBe(4);
    expect(e.layers.pending[0].state).toBe("echoed");
    expect(project(e.layers.server, e.layers.pending)).toBe(e.layers.server); // 투영에서 뺐다 — 두 번 그리지 않는다
    expect(pendingIds(e.layers.pending).size).toBe(0);
    const r = onResult(e.layers, 1, applied(4, [colPatch("c-4", { logical: "메뉴이름" })]), ME, 10);
    expect(r.layers.pending).toEqual([]);
    expect(r.layers.server).toBe(e.layers.server); // 늦은 응답의 델타는 다시 얹지 않는다
    expect(r.mine).toBe(4); // 내 rev 는 응답이 온 뒤에만 정해진다
    expect(r.notice).toBeNull();
  });

  it("보관이 5초를 넘거나 rev 가 비면 다시 읽게 하고, 다시 읽으면 보내지 않은 묶음 수만 센다", () => {
    let l = sent(base(), 1, [rename("메뉴이름")]);
    l = enqueue(l, { id: 2, label: "묶음 2", baseRev: 3, commands: [{ op: "confirmRelation", id: "r-1" }] });
    expect(markSending(l, 2)).toBeNull(); // 보내는 묶음이 있으면 다음 묶음은 기다린다
    const r = onResult(l, 1, applied(6, [colPatch("c-4", { logical: "메뉴이름" })]), ME, 0);
    expect(onTick(r.layers, 5000).reload).toBe(false);
    expect(onTick(r.layers, 5001).reload).toBe(true);
    expect(onStream(r.layers, delta(5, "ui-peer", []), 0, ME).reload).toBe(true); // rev 4 를 건너뛰었다
    const fresh = stateOf(menuModel(), { ...MENU_DIAGRAMS, rev: 6 });
    const back = onReloaded(r.layers, fresh);
    expect(back.dropped).toBe(1);
    expect(back.layers).toEqual({ server: fresh, pending: [], held: [] });
  });

  it("미리 그리는 명령만 투영하고, 서버가 결과를 정하는 명령은 자리표시(pendingIds)만 한다(S2-18)", () => {
    const s = stateOf(menuModel(), MENU_DIAGRAMS);
    const dc = projectCommand(s, { op: "deleteColumn", id: "c-2" });
    expect([dc.model.columns["c-2"], dc.model.relations["r-1"]]).toEqual([undefined, undefined]);
    expect(dc.model.tables["t-1"].columnOrder).toEqual(["c-1", "c-4"]);
    const dt = projectCommand(s, { op: "deleteTable", id: "t-2" });
    expect(Object.keys(dt.model.tables)).toEqual(["t-1"]);
    expect([dt.model.columns["c-3"], dt.model.keys["k-2"], dt.model.relations["r-1"]]).toEqual([undefined, undefined, undefined]);
    const mv = projectCommand(s, { op: "moveNodes", diagram: "d-all", nodes: [{ table: "t-2", x: 10, y: 20 }] });
    expect(mv.nodes["d-all:t-2"]).toMatchObject({ x: 10, y: 20 });
    expect(mv.model).toBe(s.model);
    const mc = projectCommand(s, { op: "moveColumn", id: "c-4", position: 0 });
    expect(mc.model.tables["t-1"].columnOrder).toEqual(["c-4", "c-1", "c-2"]);
    expect(projectCommand(s, { op: "addColumn", table: "t-1", logical: "비고" })).toBe(s);
    const ids = pendingIds([{ id: 1, label: "", baseRev: 3, state: "queued", commands: [
      { op: "addColumn", table: "t-1", logical: "비고" }, { op: "setFold", diagram: "d-all", tables: ["t-2"], foldMode: "KEYS" },
    ] }]);
    expect([...ids].sort()).toEqual(["t-1", "t-2"]);
  });
});
```

- [ ] **Step 2: 실패하는 시험 작성 — 알림 띠·접속자·변경 기록 행**

`src/frontend/m-mdm/tests/dma/erdEdit/core-panels.test.ts`:

```ts
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
```

- [ ] **Step 3: 실패하는 시험 작성 — SSE `version` 과 화면 흐름**

(a) `erd-stream.test.ts` 의 `describe("ErdStreamClient")` 안 끝에 더한다.

```ts
  it("version 이벤트를 onVersion 으로 넘긴다(S2-12)", () => {
    const got: string[] = [];
    const c = new ErdStreamClient({
      modelId: "mcm", session: "ui-a", factory, lastRev: () => 5, onStatus: () => undefined,
      handlers: {
        onHello: () => undefined, onDelta: () => undefined, onReload: () => undefined, onPresence: () => undefined, onClaims: () => undefined,
        onVersion: (ev) => got.push(`${ev.reason} ${ev.rowVersion}`),
      },
    });
    c.start();
    FakeES.all[0].emit("version", { modelId: "mcm", ver: "1.000", status: "DRAFT", ownerId: "a", editors: [], rowVersion: 12,
      reason: "LOCK", userId: "a", at: "2026-10-11T05:10:03Z" });
    expect(got).toEqual(["LOCK 12"]);
    c.stop();
  });
```

(b) `page-render.test.ts`: import 에 `import { LOST_TEXT } from "../../../pages/dma/erdEdit/state/permissions";` 를 더한다. `let restoreResult: unknown;` 아래에 `let historyDeltas: unknown[] = [];` 를 두고 `beforeEach` 에서 `historyDeltas = [];` 로 비운다. 가짜 서버의 sinceRev 줄을 바꾼다.

```ts
// 바꾸기 전
    if (action === "view" && params.sinceRev !== undefined) return ok({ rev: currentView.rev, reload: false, deltas: [] });
// 바꾼 뒤
    if (action === "view" && params.sinceRev !== undefined) return ok({ rev: currentView.rev, reload: false, deltas: historyDeltas });
```

`describe("erdEdit 화면")` 안 끝(Task 9 의 `key` 도우미 뒤)에 더한다.

```ts
  it("version 이벤트는 버전 칸만 바꿔 다시 읽지 않고, ver 가 바뀌면 모델을 다시 읽는다", async () => {
    await openModel();
    expect(viewCalls()).toHaveLength(1);
    const ev = { modelId: "mcm", ver: "1.000", status: "RELEASED", ownerId: "tester", editors: [], rowVersion: 9,
      reason: "CONFIRM", userId: "tester", at: "2026-10-11T05:10:03.120Z" };
    await act(async () => {
      FakeES.all[0].emit("version", ev);
    });
    await settle();
    expect(byTestId("erd-banner-readonly")?.textContent).toContain("확정된 버전");
    expect(viewCalls()).toHaveLength(1);
    await act(async () => {
      FakeES.all[0].emit("version", { ...ev, ver: "1.001", status: "DRAFT", reason: "SUBSCRIBE" });
    });
    await settle();
    expect(viewCalls()).toHaveLength(2);
  });

  it("변경 기록 [되돌리기] 는 그 rev 를 restore 하고 CONFLICT 를 알린다. Ctrl+Z 의 CONFLICT 는 다른 변경을 고르라고 덧붙이고 그 rev 를 다시 꺼내지 않는다", async () => {
    historyDeltas = [{ modelId: "mcm", rev: 2, userId: "41000207", session: "ui-peer", source: "UI",
      changes: [{ kind: "column", id: "c-4", op: "patch", value: { logical: "메뉴이름" } }] }];
    restoreResult = { applied: false, rev: 3, rowVersion: null, changes: [], warnings: [], rejection: {
      code: "CONFLICT", commandIndex: 0, message: "다른 세션이 먼저 바꾼 값입니다", hint: "getChangesSince(2) 로 바뀐 값을 읽고 다시 보내세요",
      elementId: "c-4", property: "logical", byRev: 3, bySession: "ui-peer2", byUserId: "41000207", current: "역할설명", choices: null, ownerId: null } };
    await openModel();
    await click(byTestId("erd-tab-history"));
    await click(await waitFor(() => byTestId("erd-undo-2")));
    expect(calls.filter((c) => c.action === "restore").map((c) => c.params.rev)).toEqual([2]);
    expect(byTestId("erd-notice")?.dataset.code).toBe("CONFLICT");
    expect(byTestId("erd-notice-message")?.textContent).toBe('41000207 님이 rev 3 에서 먼저 바꿨습니다. 지금 값: "역할설명"');
    expect(byTestId("erd-notice-hint")?.textContent).not.toContain("다른 변경을 고르세요");
    await click(byTestId("erd-tab-inferred"));
    await click(await waitFor(() => byTestId("erd-confirm-r-1"))); // 내 반영 rev 4
    await key(document.body, { key: "z", ctrlKey: true });
    await settle();
    expect(calls.filter((c) => c.action === "restore").map((c) => c.params.rev)).toEqual([2, 4]);
    expect(byTestId("erd-notice-hint")?.textContent).toContain("변경 기록에서 다른 변경을 고르세요.");
    await key(document.body, { key: "z", ctrlKey: true });
    await settle();
    expect(calls.filter((c) => c.action === "restore")).toHaveLength(2);
    expect(byTestId("erd-message")?.textContent).toBe("되돌릴 내 변경이 없습니다.");
  });

  it("연결이 끊긴 동안 Ctrl+Z 는 보내지 않고 NETWORK 알림을 보이며, 다시 붙으면 같은 rev 를 되돌린다", async () => {
    await openModel();
    await click(byTestId("erd-tab-inferred"));
    await click(await waitFor(() => byTestId("erd-confirm-r-1")));
    await act(async () => {
      FakeES.all[0].emit("error");
    });
    expect(byTestId("erd-banner-lost")?.textContent).toBe(LOST_TEXT);
    await key(document.body, { key: "z", ctrlKey: true });
    await settle();
    expect(calls.filter((c) => c.action === "restore")).toHaveLength(0);
    expect(byTestId("erd-notice")?.dataset.code).toBe("NETWORK");
    await settle(1100); // 1초 뒤 다시 연결
    await act(async () => {
      FakeES.all[1].emit("open");
    });
    await key(document.body, { key: "z", ctrlKey: true });
    await settle();
    expect(calls.filter((c) => c.action === "restore").map((c) => c.params.rev)).toEqual([4]);
  });
```

- [ ] **Step 4: 시험이 실패하는지 확인**

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/`
Expected: FAIL — `pending.test.ts` 는 `initLayers` 등이 없어 실패한다. `core-panels.test.ts` 는 `presenceAvatars`·`erd-notice-copy` 가 없다. `erd-stream.test.ts` 의 version 시험은 `got` 이 비어 실패한다. `page-render.test.ts` 새 시험 3건은 `erd-undo-2`·`version` 처리·`LOST_TEXT` 띠 글이 없어 실패한다.

- [ ] **Step 5: 구현 — `state/pending.ts` (전부 다시 씀)**

```ts
/**
 * 두 층 모델(스펙 4.4, 시험 8, S2-17·S2-18) — 아래층 server(서버가 확인한 마지막 rev)와 위층 pending(응답을 다 맞추지 못한 내 묶음).
 * React 의존이 없고 입력을 바꾸지 않는다. useErdModel 은 이 함수들로만 층을 바꾼다.
 * - 묶음은 한 번에 하나만 보낸다(queued → sending). baseRev 는 보낼 때의 아래층 rev 다.
 * - 응답 rev 가 아래층 rev + 1 이면 응답 델타를 바로 얹는다. 더 크면 남의 앞 rev 가 아직 안 온 것이라 델타를 held 에 보관하고
 *   묶음을 held 로 둔다. SSE 가 그 앞까지 채우면 얹는다. HOLD_LIMIT_MS 안에 못 채우면 부르는 쪽이 모델을 다시 읽는다.
 * - SSE 에코가 응답보다 먼저 올 수 있다(커밋 뒤 전달 실행기, deferred 27). sending 묶음이 있을 때 내 세션 델타가 오면 그 묶음의
 *   에코로 보고 아래층에 얹은 뒤 묶음을 echoed 로 바꿔 투영에서 뺀다. 늦은 응답은 결과만 돌려주고 델타를 다시 얹지 않는다.
 * - 거절이면 묶음을 빼고 알림을 만든다. 다시 읽으면 모든 묶음·보관 델타를 버린다(보내지 않은 queued 수를 센다).
 * - mine: 반영 응답의 rev(되돌리기 제외). 화면은 이 값만 myRevs 에 넣는다. SSE 에코로는 넣지 않는다.
 */
import { noticeFromRejection, type ErdNotice } from "../edit-context";
import type { ErdApplyResult, ErdColumn, ErdCommandJson, ErdDelta, ErdDiagram, ErdFoldMode, ErdModelJson, ErdState, ErdTable } from "../types";
import { applyDelta, nodeKey } from "./model-delta";

export const HOLD_LIMIT_MS = 5000;

export interface PendingBatch {
  id: number; label: string; baseRev: number; commands: ErdCommandJson[]; undoOf?: number;
  state: "queued" | "sending" | "held" | "echoed"; heldRev?: number; heldSince?: number;
}
export interface Layers { server: ErdState; pending: PendingBatch[]; held: ErdDelta[] }
export interface PendingMe { userId: string; session: string }
export interface ResultOutcome { layers: Layers; notice: ErdNotice | null; reload: boolean; mine: number | null }

type Rec = Record<string, unknown>;
const NO_IDS: ReadonlySet<string> = new Set();
const FOLD_MODES: readonly ErdFoldMode[] = ["NONE", "KEYS", "NAME"];
const ID_FIELDS = ["id", "table", "child", "parent"] as const;

const live = (b: PendingBatch): boolean => b.state !== "echoed";
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const rec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const nodeList = (v: unknown): { table: string; x: number; y: number }[] =>
  Array.isArray(v)
    ? v.flatMap((n) => {
      const o = rec(n);
      const t = str(o?.table);
      return o && t && typeof o.x === "number" && typeof o.y === "number" ? [{ table: t, x: o.x, y: o.y }] : [];
    })
    : [];

export function initLayers(server: ErdState): Layers {
  return { server, pending: [], held: [] };
}

/** 투영 — 아래층에 살아 있는 묶음(queued·sending·held)의 명령을 차례로 얹는다. 없으면 아래층 그대로(같은 객체). */
export function project(server: ErdState, pending: readonly PendingBatch[]): ErdState {
  let s = server;
  for (const b of pending) if (live(b)) for (const c of b.commands) s = projectCommand(s, c);
  return s;
}

/** 살아 있는 묶음이 건드리는 요소 id — 흐린 자리표시용. */
export function pendingIds(pending: readonly PendingBatch[]): ReadonlySet<string> {
  if (!pending.some(live)) return NO_IDS;
  const out = new Set<string>();
  for (const b of pending) {
    if (!live(b)) continue;
    for (const c of b.commands) {
      for (const f of ID_FIELDS) {
        const v = str(c[f]);
        if (v) out.add(v);
      }
      for (const t of strList(c.tables)) out.add(t);
      for (const n of nodeList(c.nodes)) out.add(n.table);
    }
  }
  return out;
}

function dropColumns(m: ErdModelJson, ids: ReadonlySet<string>): ErdModelJson {
  const columns = { ...m.columns };
  for (const id of ids) delete columns[id];
  const tables = { ...m.tables };
  for (const [tid, t] of Object.entries(m.tables)) {
    if (t.columnOrder.some((c) => ids.has(c))) tables[tid] = { ...t, columnOrder: t.columnOrder.filter((c) => !ids.has(c)) };
  }
  const keys = { ...m.keys };
  for (const [kid, k] of Object.entries(m.keys)) {
    if (!k.columns.some((c) => ids.has(c))) continue;
    const left = k.columns.filter((c) => !ids.has(c));
    if (left.length === 0) delete keys[kid];
    else keys[kid] = { ...k, columns: left };
  }
  const relations = { ...m.relations };
  for (const [rid, r] of Object.entries(m.relations)) if (r.pairs.some((p) => ids.has(p[0]) || ids.has(p[1]))) delete relations[rid];
  return { ...m, tables, columns, keys, relations };
}

function dropTable(m: ErdModelJson, tableId: string): ErdModelJson {
  const t = m.tables[tableId];
  const cols = new Set([...t.columnOrder, ...Object.keys(m.columns).filter((c) => m.columns[c].table === tableId)]);
  const out = dropColumns(m, cols);
  const tables = { ...out.tables };
  delete tables[tableId];
  const keys = Object.fromEntries(Object.entries(out.keys).filter(([, k]) => k.table !== tableId));
  const relations = Object.fromEntries(Object.entries(out.relations).filter(([, r]) => r.child !== tableId && r.parent !== tableId));
  return { ...out, tables, keys, relations };
}

const withModel = (s: ErdState, model: ErdModelJson): ErdState => ({ ...s, model });

/** 명령 하나를 화면 상태에 미리 얹는다(S2-18). 모르는 명령·없는 대상은 그대로 둔다. */
export function projectCommand(state: ErdState, cmd: ErdCommandJson): ErdState {
  const m = state.model;
  const id = str(cmd.id);
  switch (cmd.op) {
    case "addTable": {
      const phys = str(cmd.phys);
      if (!id || !phys || m.tables[id]) return state;
      const t: ErdTable = { phys, logical: str(cmd.logical) ?? "", comment: str(cmd.comment), columnOrder: [] };
      return withModel(state, { ...m, tables: { ...m.tables, [id]: t } });
    }
    case "updateTable": {
      const t = id ? m.tables[id] : undefined;
      const set = rec(cmd.set);
      if (!id || !t || !set) return state;
      return withModel(state, { ...m, tables: { ...m.tables, [id]: { ...t, ...set } as ErdTable } });
    }
    case "updateColumn": {
      const c = id ? m.columns[id] : undefined;
      const set = rec(cmd.set);
      if (!id || !c || !set) return state;
      return withModel(state, { ...m, columns: { ...m.columns, [id]: { ...c, ...set } as ErdColumn } });
    }
    case "moveColumn": {
      const c = id ? m.columns[id] : undefined;
      const t = c ? m.tables[c.table] : undefined;
      if (!id || !c || !t || typeof cmd.position !== "number") return state;
      const order = t.columnOrder.filter((x) => x !== id);
      order.splice(Math.max(0, Math.min(cmd.position, order.length)), 0, id); // 엔진 moveColumn 과 같은 자리 계산
      return withModel(state, { ...m, tables: { ...m.tables, [c.table]: { ...t, columnOrder: order } } });
    }
    case "deleteTable":
      return id && m.tables[id] ? withModel(state, dropTable(m, id)) : state;
    case "deleteColumn":
      return id && m.columns[id] ? withModel(state, dropColumns(m, new Set([id]))) : state;
    case "confirmRelation":
    case "rejectRelation": {
      const r = id ? m.relations[id] : undefined;
      if (!id || !r) return state;
      const next = cmd.op === "confirmRelation" ? "CONFIRMED" : "REJECTED";
      return withModel(state, { ...m, relations: { ...m.relations, [id]: { ...r, state: next } } });
    }
    case "addDiagram": {
      const areaName = str(cmd.areaName);
      const diagramName = str(cmd.diagramName);
      if (!id || !areaName || !diagramName || state.diagrams[id]) return state;
      const sortSeq = typeof cmd.sortSeq === "number" ? cmd.sortSeq : Math.max(-1, ...Object.values(state.diagrams).map((d) => d.sortSeq)) + 1;
      return { ...state, diagrams: { ...state.diagrams, [id]: { id, areaName, diagramName, sortSeq } } };
    }
    case "updateDiagram": {
      const d = id ? state.diagrams[id] : undefined;
      const set = rec(cmd.set);
      if (!id || !d || !set) return state;
      return { ...state, diagrams: { ...state.diagrams, [id]: { ...d, ...set, id } as ErdDiagram } };
    }
    case "deleteDiagram": {
      if (!id || !state.diagrams[id]) return state;
      const diagrams = { ...state.diagrams };
      delete diagrams[id];
      return { ...state, diagrams, nodes: Object.fromEntries(Object.entries(state.nodes).filter(([, n]) => n.diagram !== id)) };
    }
    case "placeTables":
    case "moveNodes": {
      const diagram = str(cmd.diagram);
      const list = nodeList(cmd.nodes);
      if (!diagram || list.length === 0) return state;
      const nodes = { ...state.nodes };
      for (const n of list) {
        const key = nodeKey(diagram, n.table);
        const prev = nodes[key];
        if (prev) nodes[key] = { ...prev, x: n.x, y: n.y };
        else if (cmd.op === "placeTables") nodes[key] = { diagram, table: n.table, x: n.x, y: n.y, foldMode: "NONE" };
      }
      return { ...state, nodes };
    }
    case "setFold": {
      const diagram = str(cmd.diagram);
      const mode = FOLD_MODES.find((f) => f === cmd.foldMode);
      if (!diagram || !mode) return state;
      const nodes = { ...state.nodes };
      for (const t of strList(cmd.tables)) {
        const key = nodeKey(diagram, t);
        if (nodes[key]) nodes[key] = { ...nodes[key], foldMode: mode };
      }
      return { ...state, nodes };
    }
    case "removeFromDiagram": {
      const diagram = str(cmd.diagram);
      if (!diagram) return state;
      const nodes = { ...state.nodes };
      for (const t of strList(cmd.tables)) delete nodes[nodeKey(diagram, t)];
      return { ...state, nodes };
    }
    default:
      return state; // addColumn·addKey·addRelation·applyDomain·setPrimaryKey 등 — 서버가 결과를 정한다(자리표시만)
  }
}

export function enqueue(l: Layers, b: Omit<PendingBatch, "state">): Layers {
  return { ...l, pending: [...l.pending, { ...b, state: "queued" }] };
}

/** 그 묶음을 보내기 시작한다. 보내는 묶음이 이미 있거나 그 묶음이 없으면(다시 읽어 버렸으면) null. */
export function markSending(l: Layers, batchId: number): { layers: Layers; batch: PendingBatch } | null {
  if (l.pending.some((b) => b.state === "sending")) return null;
  const b = l.pending.find((x) => x.id === batchId && x.state === "queued");
  if (!b) return null;
  const batch: PendingBatch = { ...b, state: "sending", baseRev: l.server.rev };
  return { layers: { ...l, pending: l.pending.map((x) => (x.id === batchId ? batch : x)) }, batch };
}

/** 보내다 실패한(던진) 묶음을 뺀다. */
export function dropBatch(l: Layers, batchId: number): Layers {
  return l.pending.some((b) => b.id === batchId) ? { ...l, pending: l.pending.filter((b) => b.id !== batchId) } : l;
}

export function resultDelta(r: ErdApplyResult, modelId: string, me: PendingMe): ErdDelta {
  return { modelId, rev: r.rev, userId: me.userId, session: me.session, source: "UI", rowVersion: r.rowVersion ?? null, changes: r.changes };
}

/** 보관 델타 가운데 아래층에 이어지는 것을 얹고, 이미 지난 rev 는 버린다. 얹은 rev 의 held 묶음을 뺀다. */
function drain(l: Layers): { layers: Layers; reload: boolean } {
  let { server, pending, held } = l;
  while (held.length > 0 && held[0].rev <= server.rev + 1) {
    const d = held[0];
    held = held.slice(1);
    pending = pending.filter((b) => !(b.state === "held" && b.heldRev === d.rev));
    if (d.rev <= server.rev) continue;
    const out = applyDelta(server, d);
    if (out.kind !== "applied") return { layers: { server, pending, held }, reload: true };
    server = out.state;
  }
  const same = server === l.server && pending === l.pending && held === l.held;
  return { layers: same ? l : { server, pending, held }, reload: false };
}

export function onResult(l: Layers, batchId: number, r: ErdApplyResult, me: PendingMe, now: number): ResultOutcome {
  const b = l.pending.find((x) => x.id === batchId);
  if (!r.applied) return { layers: dropBatch(l, batchId), notice: noticeFromRejection(r.rejection, b?.commands ?? []), reload: false, mine: null };
  if (!b) return { layers: l, notice: null, reload: false, mine: null }; // 다시 읽어 버린 묶음 — 결과는 다시 읽은 모델이나 SSE 에 있다
  const mine = b.undoOf === undefined ? r.rev : null;
  const rest = l.pending.filter((x) => x.id !== batchId);
  if (b.state === "echoed" || r.rev <= l.server.rev) return { layers: { ...l, pending: rest }, notice: null, reload: false, mine };
  const d = resultDelta(r, l.server.modelId, me);
  if (r.rev === l.server.rev + 1) {
    const out = applyDelta(l.server, d);
    if (out.kind !== "applied") return { layers: { ...l, pending: rest }, notice: null, reload: true, mine };
    const drained = drain({ server: out.state, pending: rest, held: l.held });
    return { layers: drained.layers, notice: null, reload: drained.reload, mine };
  }
  const held = [...l.held.filter((h) => h.rev !== d.rev), d].sort((a, c) => a.rev - c.rev);
  const pending = l.pending.map((x) => (x.id === batchId ? { ...x, state: "held" as const, heldRev: r.rev, heldSince: now } : x));
  return { layers: { ...l, pending, held }, notice: null, reload: false, mine };
}

export function onStream(l: Layers, d: ErdDelta, _now: number, me: PendingMe): { layers: Layers; reload: boolean } {
  if (d.rev <= l.server.rev) return { layers: l, reload: false }; // 응답이나 보관 델타로 이미 얹었다
  if (d.rev !== l.server.rev + 1) return { layers: l, reload: true };
  const out = applyDelta(l.server, d);
  if (out.kind !== "applied") return { layers: l, reload: true };
  let pending = l.pending;
  let held = l.held;
  const heldBatch = pending.find((b) => b.state === "held" && b.heldRev === d.rev);
  if (heldBatch || held.some((h) => h.rev === d.rev)) {
    pending = pending.filter((b) => b !== heldBatch);
    held = held.filter((h) => h.rev !== d.rev);
  } else if (d.session === me.session) {
    const sending = pending.find((b) => b.state === "sending");
    if (sending) pending = pending.map((b) => (b === sending ? { ...b, state: "echoed" as const } : b));
  }
  return drain({ server: out.state, pending, held });
}

export function onTick(l: Layers, now: number): { reload: boolean } {
  return { reload: l.pending.some((b) => b.state === "held" && now - (b.heldSince ?? now) > HOLD_LIMIT_MS) };
}

export function onReloaded(l: Layers, server: ErdState): { layers: Layers; dropped: number } {
  return { layers: initLayers(server), dropped: l.pending.filter((b) => b.state === "queued").length };
}
```

- [ ] **Step 6: 구현 — `state/useErdModel.ts` (전부 다시 씀, 서명은 Task 9 그대로)**

```ts
"use client";

/**
 * ERD 모델 상태(스펙 4.4 두 층) — 아래층은 view·SSE 로 맞춘 서버 상태, 위층은 내 대기 묶음(state/pending.ts). state 는 투영 값이다.
 * - 쓰기 줄: apply·undo·exclusive 는 한 줄(chain)로 돈다. 그래서 보내는 묶음은 늘 하나 이하다(S2-17).
 * - 다시 읽기는 세대 번호로 늦은 응답을 버린다(Local-Rules §37). 다시 읽는 동안 온 델타는 모았다가 응답 rev 보다 큰 것만 얹는다.
 *   다시 읽으면 대기 묶음·보관 델타를 버린다. 보내지 않은 묶음의 apply 는 RELOAD 알림으로 끝난다.
 * - reload({dropMine:true})(SSE reload — DRAFT 삭제·새 DRAFT)면 myRevs 도 비운다. 그 앞 rev 는 되돌릴 수 없다.
 * - 보관 델타가 있으면 1초마다 보고 5초를 넘으면 다시 읽는다.
 * - presence·claim 이 바뀌지 않았으면 상태를 바꾸지 않는다(Screen-Performance R7).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { applyCommands, undoRev, viewModel } from "../api";
import { localNotice, noticeFromRejection, type ApplyOutcome } from "../edit-context";
import type { ErdApplyResult, ErdClaim, ErdCommandJson, ErdDelta, ErdModelView, ErdPresence, ErdState, ErdVersionEvent } from "../types";
import { applyDelta, fromView, touchesColumns, withVersion } from "./model-delta";
import {
  dropBatch, enqueue, initLayers, markSending, onReloaded, onResult, onStream, onTick, pendingIds, project, resultDelta,
  type Layers, type PendingBatch,
} from "./pending";

export interface ErdModelApi {
  /** 투영 값(아래층 + 위층). 패널·캔버스는 이것만 읽는다. */
  state: ErdState | null;
  /** 아래층 — 서버가 확인한 마지막 rev. */
  server: ErdState | null;
  pending: readonly PendingBatch[];
  pendingIds: ReadonlySet<string>;
  myRevs: readonly number[];
  loading: boolean;
  error: string | null;
  /** 표·컬럼이 바뀔 때(전체 읽기 포함)마다 1 오른다. 화면은 이 값으로 표준 상태(view kind=STATUS)를 다시 읽는다. */
  columnsSeq: number;
  reload(opts?: { dropMine?: boolean }): Promise<void>;
  /** SSE change 입구. */
  applyDelta(delta: ErdDelta): void;
  setPresence(list: ErdPresence[]): void;
  setClaims(list: ErdClaim[]): void;
  onVersion(ev: ErdVersionEvent): void;
  apply(commands: ErdCommandJson[], label: string): Promise<ApplyOutcome>;
  undo(rev: number): Promise<ApplyOutcome>;
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const NO_REVS: readonly number[] = [];
const NO_PENDING: readonly PendingBatch[] = [];
const MY_REVS_MAX = 100;
const TICK_MS = 1000;

export const errorNotice = (e: unknown) =>
  localNotice(e instanceof TypeError ? "NETWORK" : "INVALID", e instanceof Error ? e.message : String(e));

export function useErdModel(
  modelId: string | null, session: string, me: string | null, load: (modelId: string) => Promise<ErdModelView> = viewModel,
): ErdModelApi {
  const [layers, setLayers] = useState<Layers | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columnsSeq, setColumnsSeq] = useState(0);
  const [myRevs, setMyRevs] = useState<readonly number[]>(NO_REVS);
  const layersRef = useRef<Layers | null>(null);
  const myRevsRef = useRef<readonly number[]>(NO_REVS);
  const genRef = useRef(0);
  /** 다시 읽는 중이면 배열(그동안 온 델타), 아니면 null. */
  const bufferRef = useRef<ErdDelta[] | null>(null);
  const lateRef = useRef<{ presence?: ErdPresence[]; claims?: ErdClaim[] }>({});
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  const batchSeq = useRef(0);
  const droppedRef = useRef(0);
  const meRef = useRef({ userId: me ?? "", session });
  meRef.current = { userId: me ?? "", session };

  const commit = useCallback((next: Layers | null) => {
    layersRef.current = next;
    setLayers(next);
  }, []);
  const setRevs = useCallback((next: readonly number[]) => {
    myRevsRef.current = next;
    setMyRevs(next);
  }, []);

  const reload = useCallback(async (opts?: { dropMine?: boolean }) => {
    if (opts?.dropMine) setRevs(NO_REVS);
    const gen = ++genRef.current;
    if (!modelId) {
      bufferRef.current = null;
      commit(null);
      setLoading(false);
      setError(null);
      return;
    }
    bufferRef.current = [];
    lateRef.current = {};
    setLoading(true);
    try {
      const view = await load(modelId);
      if (gen !== genRef.current) return;
      const prev = layersRef.current;
      const late = lateRef.current;
      let server: ErdState = {
        ...fromView(view),
        presence: late.presence ?? view.presence,
        claims: late.claims ?? (prev?.server.modelId === modelId ? prev.server.claims : []),
      };
      for (const d of bufferRef.current ?? []) {
        const out = applyDelta(server, d);
        if (out.kind === "applied") server = out.state;
        else if (out.kind === "gap") break; // 다음 live 델타가 다시 gap 을 알려 한 번 더 읽는다
      }
      bufferRef.current = null;
      lateRef.current = {};
      if (prev && prev.server.modelId === modelId) {
        const back = onReloaded(prev, server);
        droppedRef.current = back.dropped;
        commit(back.layers);
      } else {
        commit(initLayers(server));
      }
      setError(null);
      setColumnsSeq((s) => s + 1);
    } catch (e) {
      if (gen !== genRef.current) return;
      bufferRef.current = null;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [modelId, load, commit, setRevs]);

  useEffect(() => {
    if (layersRef.current && layersRef.current.server.modelId !== modelId) {
      commit(null);
      setRevs(NO_REVS);
    }
    void reload();
  }, [reload, commit, setRevs, modelId]);

  const applyDeltaCb = useCallback((d: ErdDelta) => {
    if (bufferRef.current) {
      bufferRef.current.push(d);
      return;
    }
    const l = layersRef.current;
    if (!l || l.server.modelId !== d.modelId) return;
    const out = onStream(l, d, Date.now(), meRef.current);
    if (out.reload) {
      void reload();
      return;
    }
    if (out.layers === l) return;
    commit(out.layers);
    if (out.layers.server !== l.server && touchesColumns(d)) setColumnsSeq((s) => s + 1);
  }, [reload, commit]);

  const setPresence = useCallback((list: ErdPresence[]) => {
    if (bufferRef.current) lateRef.current.presence = list;
    const l = layersRef.current;
    if (!l || sameJson(l.server.presence, list)) return;
    commit({ ...l, server: { ...l.server, presence: list } });
  }, [commit]);

  const setClaims = useCallback((list: ErdClaim[]) => {
    if (bufferRef.current) lateRef.current.claims = list;
    const l = layersRef.current;
    if (!l || sameJson(l.server.claims, list)) return;
    commit({ ...l, server: { ...l.server, claims: list } });
  }, [commit]);

  const onVersion = useCallback((ev: ErdVersionEvent) => {
    const l = layersRef.current;
    if (!l || l.server.modelId !== ev.modelId) return;
    if (ev.ver !== l.server.ver) {
      void reload();
      return;
    }
    const server = withVersion(l.server, ev);
    if (server !== l.server) commit({ ...l, server });
  }, [reload, commit]);

  /** 쓰기 줄 — 앞 일이 끝난 뒤 돈다. 앞 일이 실패해도 다음 일은 돈다. */
  const exclusive = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = chainRef.current.then(fn, fn);
    chainRef.current = run.catch(() => undefined);
    return run;
  }, []);

  const submit = useCallback((label: string, commands: ErdCommandJson[], undoOf?: number): Promise<ApplyOutcome> => {
    const l = layersRef.current;
    if (!l) return Promise.resolve<ApplyOutcome>({ ok: false, notice: localNotice("RELOAD", "모델을 아직 읽지 않았습니다.", "모델을 읽은 뒤 다시 하세요.") });
    const id = ++batchSeq.current;
    commit(enqueue(l, { id, label, baseRev: l.server.rev, commands, undoOf }));
    return exclusive(async (): Promise<ApplyOutcome> => {
      const now = layersRef.current;
      const started = now ? markSending(now, id) : null;
      if (!now || !started) {
        return { ok: false, notice: localNotice("RELOAD", `모델을 다시 읽어 보내지 않은 변경 ${Math.max(droppedRef.current, 1)}건을 버렸습니다.`,
          "바뀐 모델을 보고 다시 고치세요.") };
      }
      commit(started.layers);
      const b = started.batch;
      const model = now.server.modelId;
      let r: ErdApplyResult;
      try {
        r = b.undoOf !== undefined ? await undoRev(model, b.undoOf, session) : await applyCommands(model, b.baseRev, session, b.commands);
      } catch (e) {
        const cur = layersRef.current;
        if (cur) commit(dropBatch(cur, id));
        return { ok: false, notice: errorNotice(e) };
      }
      const cur = layersRef.current;
      if (!cur || cur.server.modelId !== model) {
        return r.applied ? { ok: true, rev: r.rev, warnings: r.warnings } : { ok: false, notice: noticeFromRejection(r.rejection, b.commands) };
      }
      const out = onResult(cur, id, r, meRef.current, Date.now());
      commit(out.layers);
      if (out.mine !== null) setRevs([...myRevsRef.current, out.mine].slice(-MY_REVS_MAX));
      if (out.layers.server !== cur.server && touchesColumns(resultDelta(r, model, meRef.current))) setColumnsSeq((s) => s + 1);
      if (out.reload) void reload();
      if (r.applied) return { ok: true, rev: r.rev, warnings: r.warnings };
      return { ok: false, notice: out.notice ?? noticeFromRejection(r.rejection, b.commands) };
    });
  }, [commit, exclusive, session, setRevs, reload]);

  const apply = useCallback((commands: ErdCommandJson[], label: string) => submit(label, commands), [submit]);
  /** 되돌리기. 그 rev 를 먼저 myRevs 에서 뺀다(CONFLICT 여도 다시 꺼내지 않는다). */
  const undo = useCallback((rev: number) => {
    setRevs(myRevsRef.current.filter((x) => x !== rev));
    return submit(`rev ${rev} 되돌리기`, [], rev);
  }, [submit, setRevs]);

  // 보관 델타가 있을 때만 1초마다 5초 초과를 본다.
  const hasHeld = layers?.pending.some((b) => b.state === "held") ?? false;
  useEffect(() => {
    if (!hasHeld) return;
    const t = setInterval(() => {
      const l = layersRef.current;
      if (l && onTick(l, Date.now()).reload) void reload();
    }, TICK_MS);
    return () => clearInterval(t);
  }, [hasHeld, reload]);

  const server = layers?.server ?? null;
  const pending = layers?.pending ?? NO_PENDING;
  const state = useMemo(() => (server ? project(server, pending) : null), [server, pending]);
  const ids = useMemo(() => pendingIds(pending), [pending]);

  return useMemo(
    () => ({
      state, server, pending, pendingIds: ids, myRevs, loading, error, columnsSeq, reload,
      applyDelta: applyDeltaCb, setPresence, setClaims, onVersion, apply, undo, exclusive,
    }),
    [state, server, pending, ids, myRevs, loading, error, columnsSeq, reload, applyDeltaCb, setPresence, setClaims, onVersion, apply, undo, exclusive],
  );
}
```

- [ ] **Step 7: 구현 — `state/useErdStream.ts` 의 `version`**

(a) 머리 주석 6행의 이벤트 목록에 `version`(S2-12)을 더한다: `… reload{rev}·presence·claim·version·ping.`

(b) import 와 처리기 형을 바꾼다.

```ts
// 바꾸기 전
import type { ErdClaim, ErdDelta, ErdPresence } from "../types";
// 바꾼 뒤
import type { ErdClaim, ErdDelta, ErdPresence, ErdVersionEvent } from "../types";
```

```ts
// 바꾸기 전
  onClaims(list: ErdClaim[]): void;
}
// 바꾼 뒤
  onClaims(list: ErdClaim[]): void;
  /** 버전 수명 주기(S2-12). 구독 직후 SUBSCRIBE 가 한 번 온다. 단계 1 서버는 보내지 않는다. */
  onVersion?(ev: ErdVersionEvent): void;
}
```

(c) `ErdStreamClient.connect` 의 `on("claim", …)` 바로 뒤에 더한다.

```ts
    on("version", (e) => {
      this.opened(false);
      h.onVersion?.(JSON.parse(String(e.data)) as ErdVersionEvent);
    });
```

(d) `useErdStream` 안 `handlers` 전달에 한 줄을 더한다.

```ts
// 바꾸기 전
        onClaims: (list) => handlersRef.current.onClaims(list),
      },
// 바꾼 뒤
        onClaims: (list) => handlersRef.current.onClaims(list),
        onVersion: (ev) => handlersRef.current.onVersion?.(ev),
      },
```

- [ ] **Step 8: 구현 — `NoticeBar`·`ChangeLog`(전부 다시 씀)**

`panels/NoticeBar.tsx`:

```tsx
"use client";

/**
 * 거절 알림 띠(스펙 4.5). ctx.apply 가 올린 마지막 알림 하나를 보인다. 닫으면 칸 강조도 지운다.
 * CONFLICT 이고 내 값이 있으면 그 값과 [내 값 복사](shared CopyTextButton)를 보인다 — 바뀐 값을 읽은 뒤 내 값을 다시 넣을 수 있다.
 */
import { Button, CopyTextButton } from "@dk-oasis/shared/form";

import { valueText, type ErdNotice } from "../edit-context";

export interface NoticeBarProps { notice: ErdNotice | null; onClose(): void }

/** 복사할 글 — 글자는 그대로, 다른 값은 JSON. */
export const mineText = (v: unknown): string => (typeof v === "string" ? v : JSON.stringify(v));

export function NoticeBar({ notice, onClose }: NoticeBarProps) {
  if (!notice) return null;
  const hasMine = notice.code === "CONFLICT" && notice.mine !== null && notice.mine !== undefined;
  return (
    <div className="erd-notice" data-code={notice.code} role="alert" data-testid="erd-notice">
      <strong className="erd-notice__label">{notice.label}</strong>
      <span data-testid="erd-notice-message">{notice.message}</span>
      {notice.hint && <span className="erd-notice__hint" data-testid="erd-notice-hint">{notice.hint}</span>}
      {hasMine && (
        <span data-testid="erd-notice-mine">
          내 값 {valueText(notice.mine)}{" "}
          <span data-testid="erd-notice-copy">
            <CopyTextButton text={mineText(notice.mine)} label="내 값 복사" />
          </span>
        </span>
      )}
      <span className="erd-notice__spacer" />
      <Button size="mini" data-testid="erd-notice-close" onClick={onClose}>
        닫기
      </Button>
    </div>
  );
}
```

`panels/ChangeLog.tsx`:

```tsx
"use client";

/**
 * 변경 기록 탭(view sinceRev, 스펙 4.4 되돌리기). 최근 rev 부터, 변경은 종류별 수로 줄인다. 내 세션 행에 "나" 를 단다.
 * 행마다 [되돌리기] — 그 rev 의 역명령을 새 rev 로 넣는다(restore). 뒤에 같은 속성을 바꾼 변경이 있으면 CONFLICT 다(S2-5).
 * 단추 열은 canUndo·onUndo 가 바뀔 때만 다시 만든다(Local-Rules §20).
 */
import { useMemo } from "react";

import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";

import type { ErdChangesView } from "../types";

const KIND_LABEL: Record<string, string> = { table: "표", column: "컬럼", key: "키", relation: "관계", diagram: "다이어그램", diagramNode: "배치" };

export function historyRows(view: ErdChangesView | null, mySession = ""): Record<string, unknown>[] {
  if (!view) return [];
  return [...view.deltas].reverse().map((d) => {
    const counts = new Map<string, number>();
    for (const c of d.changes) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
    return {
      id: String(d.rev), rev: d.rev, who: d.session === mySession ? "나" : "", userId: d.userId, session: d.session, source: d.source,
      summary: [...counts].map(([k, n]) => `${KIND_LABEL[k] ?? k} ${n}`).join("·"),
    };
  });
}

function historyColumns(canUndo: boolean, onUndo: (rev: number) => void): GridColumn[] {
  return [
    { key: "rev", header: "rev", width: 70, align: "right", meta: false },
    { key: "who", header: "", width: 40, align: "center", meta: false },
    { key: "userId", header: "사용자", width: 120, meta: false },
    { key: "session", header: "세션", width: 160, meta: false },
    { key: "source", header: "출처", width: 70, align: "center", meta: false },
    { key: "summary", header: "변경", width: 240, meta: false },
    {
      key: "undo", header: "", width: 100, meta: false, sortable: false, tooltip: false,
      render: (_v, row) => (
        <Button size="mini" data-testid={`erd-undo-${String(row.rev)}`} disabled={!canUndo} onClick={() => onUndo(Number(row.rev))}>
          되돌리기
        </Button>
      ),
    },
  ];
}

export interface ChangeLogProps {
  history: ErdChangesView | null;
  mySession: string;
  canUndo: boolean;
  onUndo(rev: number): void;
}

export function ChangeLog({ history, mySession, canUndo, onUndo }: ChangeLogProps) {
  const rows = useMemo(() => historyRows(history, mySession), [history, mySession]);
  const columns = useMemo(() => historyColumns(canUndo, onUndo), [canUndo, onUndo]);
  return (
    <AgDataGrid gridId="erdHistory" columnSizing="fit" columns={columns} data={rows} rowKey="id"
      emptyMessage={history ? "변경 기록이 없습니다." : "변경 기록을 읽는 중입니다."} />
  );
}
```

- [ ] **Step 9: 구현 — `ReviewPanel`·`TopBar`·`ErdViewer` 연결**

`panels/ReviewPanel.tsx`:

```tsx
// 바꾸기 전
  onSelectTable(tableId: string): void;
  locked: boolean;
}
// 바꾼 뒤
  onSelectTable(tableId: string): void;
  locked: boolean;
  /** 변경 기록 되돌리기(Task 10). */
  mySession: string;
  canUndo: boolean;
  onUndo(rev: number): void;
}
```

```tsx
// 바꾸기 전
  ctx, model, status, tab, onTab, diff, history, onReloadDiff, onReloadHistory, onDecide, onSelectTable, locked,
}: ReviewPanelProps) {
// 바꾼 뒤
  ctx, model, status, tab, onTab, diff, history, onReloadDiff, onReloadHistory, onDecide, onSelectTable, locked, mySession, canUndo, onUndo,
}: ReviewPanelProps) {
```

```tsx
// 바꾸기 전
          {tab === "history" && <ChangeLog history={history} />}
// 바꾼 뒤
          {tab === "history" && <ChangeLog history={history} mySession={mySession} canUndo={canUndo} onUndo={onUndo} />}
```

`panels/TopBar.tsx`:
1. import 를 바꾼다.

```tsx
// 바꾸기 전
import type { ErdModelRow, ErdPresence, ErdState } from "../types";
// 바꾼 뒤
import { LOST_TEXT } from "../state/permissions";
import type { ErdClaim, ErdModelRow, ErdPresence, ErdState } from "../types";
```

2. `avatarLabel` 함수 뒤에 더한다.

```tsx
export interface Avatar { session: string; label: string; source: "ui" | "llm"; title: string }

const hhmm = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * 접속자 동그라미(D17, S2-11) — 나 → 사람 → Claude·CLI 세션 순. 만료 시각이 지난 시한 항목은 뺀다(서버가 15초마다 지우기 전 사이).
 * 제목에 사용자·세션·출처·만료 시각과 살아 있는 작업 중 표 수를 적는다(작업 중 표시 만료는 방송하지 않는다, S2-26).
 */
export function presenceAvatars(list: readonly ErdPresence[], claims: readonly ErdClaim[], mySession: string, now: number): Avatar[] {
  const rank = (p: ErdPresence) => (p.session === mySession ? 0 : p.source === "UI" ? 1 : 2);
  return list
    .filter((p) => !p.expiresAt || Date.parse(p.expiresAt) > now)
    .sort((a, b) => rank(a) - rank(b) || a.session.localeCompare(b.session))
    .map((p) => {
      const held = claims.filter((c) => c.session === p.session && Date.parse(c.expiresAt) > now).length;
      const parts = [p.userId, p.session, p.source];
      if (p.expiresAt) parts.push(`${hhmm(p.expiresAt)}까지`);
      if (held > 0) parts.push(`작업 중 표 ${held}개`);
      return { session: p.session, label: avatarLabel(p, mySession), source: p.source === "UI" ? "ui" : "llm", title: parts.join(" · ") };
    });
}
```

3. 동그라미 그리기를 바꾼다.

```tsx
// 바꾸기 전
              {s.presence.map((x) => (
                <span key={x.session} className="erd-avatar" data-source={x.source === "UI" ? "ui" : "llm"} title={`${x.userId} · ${x.session}`}>
                  {avatarLabel(x, p.mySession)}
                </span>
              ))}
// 바꾼 뒤
              {presenceAvatars(s.presence, s.claims, p.mySession, Date.now()).map((a) => (
                <span key={a.session} className="erd-avatar" data-source={a.source} title={a.title} data-testid={`erd-avatar-${a.session}`}>
                  {a.label}
                </span>
              ))}
```

4. 끊김 띠 글을 권한 문구와 맞춘다.

```tsx
// 바꾸기 전
          연결이 끊겼습니다. 다시 연결하는 중이며, 연결될 때까지 확정·기각·가져오기를 멈춥니다.
// 바꾼 뒤
          {LOST_TEXT}
```

`ErdViewer.tsx`:
1. SSE 처리기에 `version` 을 더한다.

```tsx
// 바꾸기 전
      onPresence: erd.setPresence,
      onClaims: erd.setClaims,
    }),
    [erd.applyDelta, erd.reload, erd.setPresence, erd.setClaims],
// 바꾼 뒤
      onPresence: erd.setPresence,
      onClaims: erd.setClaims,
      onVersion: erd.onVersion,
    }),
    [erd.applyDelta, erd.reload, erd.setPresence, erd.setClaims, erd.onVersion],
```

2. `undoLast` 정의 바로 뒤에 변경 기록 되돌리기를 더한다.

```tsx
  const onUndo = useCallback((rev: number) => void undoRevision(rev, false), [undoRevision]);
```

3. `ReviewPanel` 호출에 props 세 개를 더한다.

```tsx
// 바꾸기 전
          onReloadDiff={loadDiff} onReloadHistory={loadHistory} onDecide={onDecide} onSelectTable={selectTable} locked={locked} />
// 바꾼 뒤
          onReloadDiff={loadDiff} onReloadHistory={loadHistory} onDecide={onDecide} onSelectTable={selectTable} locked={locked}
          mySession={session} canUndo={rights.model.ok || rights.diagram.ok} onUndo={onUndo} />
```

- [ ] **Step 10: 시험 통과 확인**

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/`
Expected: PASS — 새 시험 14건(`pending.test.ts` 7건 — `pendingHoldsResultUntilStreamCatchesUp`·`pendingDropsBatchWhenEchoArrivesFirst` 포함, `core-panels.test.ts` 3건, `erd-stream.test.ts` 1건, `page-render.test.ts` 3건)과 Task 9 까지의 erdEdit 시험 전부. 실패 0.

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint`
Expected: 오류 0.

- [ ] **Step 11: 커밋**

```bash
/usr/bin/git add src/frontend/m-mdm/pages/dma/erdEdit src/frontend/m-mdm/tests/dma/erdEdit
/usr/bin/git commit -m "$(cat <<'MSG'
feat(erd-edit): 두 층 모델 — 대기 묶음·응답 보관·에코 처리, 거절 알림·되돌리기·접속자·version

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
MSG
)"
```

---
### Task 11: 버전 막대·확정 대화상자·공동 편집자 관리

**Files:**
- Modify: `src/frontend/m-mdm/src/shell/VersionActionBar.tsx` (확정취소 props 를 선택으로, S2-10)
- Modify: `src/frontend/m-mdm/pages/dma/erdEdit/panels/{VersionBar,ConfirmDialog,EditorsModal}.tsx` (Task 9 자리를 채움, 전부 다시 씀)
- Modify: `src/frontend/m-mdm/pages/dma/erdEdit/state/model-delta.ts` (`localVersionEvent`)
- Test: `src/frontend/m-mdm/tests/shell/version-action-bar.test.ts`(새), `src/frontend/m-mdm/tests/dma/erdEdit/version-bar.test.ts`(새), `page-render.test.ts`

**Interfaces:**
- Consumes: Task 9 의 `api.ts`(`newVersion`·`deleteDraft`·`lockDraft`·`unlockDraft`·`validateConfirm`·`confirmVersion(…, applyFrom)`·`addEditor`·`removeEditor`), `ErdEditContext`(`rights.confirm`·`rights.manageEditors`·`rights.owner`·`notify`), `useErdModel` 의 `reload`·`onVersion`(Task 10 의 `version` 처리와 같은 길), `@/shell`(`VersionActionBar`·`VersionAction`), `@dk-oasis/shared/{form,modal,layout}`.
- Produces: `VersionActionBar` 선택 props(`cancelConfirm?`·`onCancelConfirm?`·`cancelConfirmMessage?`·`ids.cancelConfirm?`), `versionButtons(ctx, can)`, `groupIssues(issues, limit?)`, `ISSUE_LIMIT = 50`, `applyFromText(date)`, `localVersionEvent(state, userId, reason, over)`, 마감용 testid(아래 표).

버전 규칙(스펙 4.7, D19, S2-10·S2-28, deferred 39):
1. 새 버전(major·minor)은 DRAFT 가 없을 때(보는 버전이 RELEASED)만 켠다. 삭제·해제는 DRAFT 소유자만, 선점은 소유자 없는 DRAFT 에서만 켠다. 확정은 `rights.confirm` 을 따른다. 넘기기는 담당자 조회가 없어 늘 끈다(`HANDOVER_AVAILABLE=false`). 확정취소 단추는 그리지 않는다.
2. 새 버전·삭제 뒤에는 서버가 `reload` 를 보낸다. 단계 2 서버가 머지되기 전에도 맞도록 응답을 받으면 바로 모델을 다시 읽는다.
3. 선점·해제는 응답 `rowVersion` 을 곧바로 반영한다(`localVersionEvent` → `onVersion`). `version` 이벤트를 기다리지 않는다. 같은 값이 다시 오면 `withVersion` 이 같은 객체를 돌려준다.
4. 확정 대화상자는 열 때 `validate` 를 부른다. 오류·경고를 코드별로 묶어 수와 처음 50건만 보인다. 오류가 있으면 확정을 막는다. 경고가 있으면 [경고를 확인했습니다] 를 고른 뒤에만 `warningsAcknowledged=true` 로 확정한다(MDM014 는 메시지만 담은 Error 로 오므로 미리 막는다). 남은 추정 관계 수를 함께 보인다(스펙 4.7).
5. 확정은 `applyFrom` 을 보낸다(조정자 판정). 기본값은 대화상자를 연 때의 지금 시각(`yyyy-MM-dd HH:mm:ss`, 로컬)이고 칸에서 바꿀 수 있다. 미래 시각이면 그 시각 전까지 `copy` 가 MDM006 으로 막힌다는 안내를 칸 아래에 적는다. 형식이 맞지 않으면 확정 단추를 막는다.
6. 공동 편집자 창은 누구나 목록을 본다. 더하기·빼기는 `rights.manageEditors`(DRAFT 소유자)만 한다. 성공하면 편집자 목록을 `localVersionEvent` 로 곧바로 바꾼다(편집자 행은 ROW_VERSION 을 바꾸지 않는다).

- [ ] **Step 1: 실패하는 시험 작성 — `VersionActionBar` 선택 props(S2-10)**

`src/frontend/m-mdm/tests/shell/version-action-bar.test.ts`(vitest 수집 규칙 때문에 `.test.ts`, README 파일 구조와 같다):

```ts
/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { VersionActionBar, type VersionActionBarProps } from "@/shell";

const on = { enabled: true };
function props(over: Partial<VersionActionBarProps> = {}): VersionActionBarProps {
  return {
    ids: { newMajor: "v-major", newMinor: "v-minor", delete: "v-delete", confirm: "v-confirm", lock: "v-lock", unlock: "v-unlock", handover: "v-handover" },
    newVersionMode: "majorMinor", newMajor: on, newMinor: on, delete: on, confirm: on, lock: on, unlock: on, handover: on,
    onNewMajor: vi.fn(), onNewMinor: vi.fn(), onDelete: vi.fn(), onConfirm: vi.fn(), onLock: vi.fn(), onUnlock: vi.fn(), onHandover: vi.fn(),
    deleteMessage: "DRAFT 를 지울까요?", ...over,
  };
}

let host: HTMLDivElement;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});
async function render(p: VersionActionBarProps) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(VersionActionBar, p)));
  });
}
const labels = () => [...host.querySelectorAll("button")].map((b) => b.textContent);

describe("VersionActionBar 확정취소 선택 props(S2-10)", () => {
  it("확정취소 props 를 넘기지 않으면 그 단추를 그리지 않는다(ERD)", async () => {
    await render(props());
    expect(labels()).toEqual(["새 버전(major)", "새 버전(minor)", "삭제", "확정", "선점", "해제", "넘기기(준비 중)"]);
  });

  it("넘기면 지금처럼 확정 바로 뒤에 그리고, 누르면 확인창을 띄운다(기존 화면 6곳)", async () => {
    await render(props({
      ids: { newMajor: "v-major", newMinor: "v-minor", delete: "v-delete", confirm: "v-confirm", cancelConfirm: "v-cancel",
        cancelConfirmWrap: "v-cancel-wrap", lock: "v-lock", unlock: "v-unlock", handover: "v-handover" },
      cancelConfirm: { enabled: true, title: "적용 전에만 취소" }, onCancelConfirm: vi.fn(), cancelConfirmMessage: "확정을 취소할까요?",
    }));
    expect(labels().indexOf("확정취소")).toBe(labels().indexOf("확정") + 1);
    expect(host.querySelector('[data-testid="v-cancel-wrap"]')?.getAttribute("title")).toBe("적용 전에만 취소");
    await act(async () => {
      host.querySelector<HTMLElement>('[data-testid="v-cancel"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("확정을 취소할까요?");
  });
});
```

- [ ] **Step 2: 실패하는 시험 작성 — 단추 판정·검사 묶음(순수)**

`src/frontend/m-mdm/tests/dma/erdEdit/version-bar.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ISSUE_LIMIT, applyFromText, groupIssues } from "../../../pages/dma/erdEdit/panels/ConfirmDialog";
import { versionButtons } from "../../../pages/dma/erdEdit/panels/VersionBar";
import type { ErdCheckIssue } from "../../../pages/dma/erdEdit/types";
import { MENU_DIAGRAMS, fakeEditContext, menuModel, stateOf } from "./erd-fixtures";

const all = () => true;

describe("버전 막대 단추(스펙 4.7)", () => {
  it("DRAFT 소유자는 삭제·확정·해제, 소유자 없는 DRAFT 는 선점, RELEASED 는 새 버전만 켠다", () => {
    const draft = stateOf(menuModel(), MENU_DIAGRAMS);
    const own = versionButtons(fakeEditContext(draft), all);
    expect([own.newVersion.enabled, own.delete.enabled, own.confirm.enabled, own.lock.enabled, own.unlock.enabled]).toEqual([false, true, true, false, true]);
    expect(own.newVersion.title).toContain("이미 DRAFT");
    const orphan = fakeEditContext({ ...draft, ownerId: null });
    const o = versionButtons({ ...orphan, rights: { ...orphan.rights, owner: false } }, all);
    expect([o.delete.enabled, o.lock.enabled, o.unlock.enabled]).toEqual([false, true, false]);
    const rel = versionButtons(fakeEditContext({ ...draft, status: "RELEASED" }), all);
    expect([rel.newVersion.enabled, rel.delete.enabled, rel.lock.enabled]).toEqual([true, false, false]);
    expect(versionButtons(fakeEditContext({ ...draft, status: "RELEASED" }), (a) => a !== "copy").newVersion.enabled).toBe(false);
  });
});

describe("확정 검사 묶음(S2-28)", () => {
  it("코드별로 묶어 많은 것부터 쓰고, 묶음마다 처음 50건만 싣는다", () => {
    const issue = (code: string, i: number): ErdCheckIssue => ({ code, message: `위반 ${i}`, field: null, itemKey: `TB_X.C${i}` });
    const list = [...Array.from({ length: 700 }, (_, i) => issue("STD_DOMAIN", i)), issue("STD_TYPE", 1), issue("STD_TYPE", 2)];
    const g = groupIssues(list);
    expect(g.map((x) => [x.code, x.count, x.items.length])).toEqual([["STD_DOMAIN", 700, ISSUE_LIMIT], ["STD_TYPE", 2, 2]]);
    expect(g[0].items[49].itemKey).toBe("TB_X.C49");
    expect(applyFromText(new Date(2026, 9, 11, 9, 5, 7))).toBe("2026-10-11 09:05:07");
  });
});
```

- [ ] **Step 3: 실패하는 시험 작성 — 화면(선점·해제, 확정, 공동 편집자)**

`page-render.test.ts`:

(a) `let historyDeltas` 아래에 `let validateResult: unknown;` 를 두고 `beforeEach` 에서 `validateResult = { errors: [], warnings: [] };` 로 둔다. 가짜 서버의 `if (action === "restore")` 줄 뒤에 더한다.

```ts
    if (action === "lock" || action === "unlock") return ok({ rowVersion: Number(params.rowVersion) + 1 });
    if (action === "validate") return ok(validateResult);
    if (action === "confirm" || action === "execute") return ok({ ok: true });
```

(b) 모달은 document.body 로 그려지므로 도우미를 하나 더한다(`byTestId` 아래).

```ts
const docTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
async function typeInto(el: HTMLElement | null, value: string) {
  expect(el, "입력 칸이 없다").not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
```

(c) `describe("erdEdit 화면")` 안 끝에 더한다.

```ts
  it("소유자 없는 DRAFT 를 선점하면 lock 에 rowVersion 을 보내고 응답 값으로 바로 바꿔 해제를 켠다", async () => {
    currentView = viewOf(menuModel(), { ...MENU_DIAGRAMS, ownerId: null, rowVersion: 4 });
    await openModel();
    const btn = (id: string) => byTestId(id) as HTMLButtonElement;
    expect([btn("erd-ver-lock").disabled, btn("erd-ver-unlock").disabled, btn("erd-ver-confirm").disabled]).toEqual([false, true, true]);
    await click(btn("erd-ver-lock"));
    expect(calls.find((c) => c.action === "lock")?.params).toEqual({ modelId: "mcm", ver: "1.000", rowVersion: 4 });
    expect([btn("erd-ver-lock").disabled, btn("erd-ver-unlock").disabled, btn("erd-ver-confirm").disabled]).toEqual([true, false, false]);
    await click(btn("erd-ver-unlock"));
    expect(calls.find((c) => c.action === "unlock")?.params).toEqual({ modelId: "mcm", ver: "1.000", rowVersion: 5 });
    expect(viewCalls()).toHaveLength(1); // 다시 읽지 않았다
  });

  it("확정은 검사 경고를 코드별 50건까지 보이고, 확인을 고른 뒤 warningsAcknowledged=true·applyFrom(지금)으로 보낸다", async () => {
    const issue = (code: string, i: number) => ({ code, message: `기존 위반 ${i}`, field: null, itemKey: `TB_MCM_SEC_MENU.C${i}` });
    validateResult = { errors: [], warnings: [...Array.from({ length: 60 }, (_, i) => issue("STD_DOMAIN", i)), issue("STD_TYPE", 0)] };
    await openModel();
    await click(byTestId("erd-ver-confirm"));
    await waitFor(() => docTestId("erd-confirm-summary"));
    expect(docTestId("erd-confirm-summary")?.textContent).toContain("경고 61건");
    expect(docTestId("erd-confirm-summary")?.textContent).toContain("남은 추정 관계 1건");
    expect(docTestId("erd-confirm-warnings-STD_DOMAIN")?.querySelectorAll("li")).toHaveLength(50);
    expect(docTestId("erd-confirm-warnings-STD_DOMAIN")?.textContent).toContain("10건 더 있습니다");
    expect((docTestId("erd-confirm-send") as HTMLButtonElement).disabled).toBe(true);
    expect((docTestId("erd-confirm-apply-from") as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    await click(docTestId("erd-confirm-ack")?.querySelector("input") ?? null);
    expect((docTestId("erd-confirm-send") as HTMLButtonElement).disabled).toBe(false);
    const reads = viewCalls().length;
    await click(docTestId("erd-confirm-send"));
    expect(calls.find((c) => c.action === "confirm")?.params).toEqual({
      modelId: "mcm", ver: "1.000", rowVersion: 0, warningsAcknowledged: true, applyFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
    });
    await waitFor(() => (viewCalls().length > reads ? true : null));
    expect(byTestId("erd-message")?.textContent).toBe("버전 1.000 를 확정했습니다.");
  });

  it("공동 편집자를 더하면 execute ADD_EDITOR 를 보내고 목록에 바로 보이며, 빼면 REMOVE_EDITOR 를 보낸다", async () => {
    await openModel();
    await click(byTestId("erd-editors-open"));
    await typeInto(await waitFor(() => docTestId("erd-editor-input")), "erd-mcp-a");
    await click(docTestId("erd-editor-add"));
    expect(calls.find((c) => c.action === "execute")?.params).toEqual({ modelId: "mcm", kind: "ADD_EDITOR", userId: "erd-mcp-a" });
    await waitFor(() => docTestId("erd-editor-erd-mcp-a"));
    expect(byTestId("erd-editors-open")?.textContent).toBe("공동 편집자(1)");
    await click(docTestId("erd-editor-remove-erd-mcp-a"));
    expect(calls.filter((c) => c.action === "execute").map((c) => c.params.kind)).toEqual(["ADD_EDITOR", "REMOVE_EDITOR"]);
    expect(byTestId("erd-editors-open")?.textContent).toBe("공동 편집자(0)");
  });
```

- [ ] **Step 4: 시험이 실패하는지 확인**

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm exec vitest run tests/shell/version-action-bar.test.ts tests/dma/erdEdit/`
Expected: FAIL — `version-action-bar.test.ts` 첫 시험은 늘 그려지는 "확정취소" 때문에 실패한다. `version-bar.test.ts` 는 `versionButtons`·`groupIssues`·`applyFromText` 가 없다. `page-render.test.ts` 새 시험 3건은 버전 막대가 `null` 이라 `erd-ver-lock` 이 없다.

- [ ] **Step 5: 구현 — `VersionActionBar` 선택 props**

`src/frontend/m-mdm/src/shell/VersionActionBar.tsx`:

(a) 머리 주석 8행을 바꾼다.

```ts
 * 순서: 새 버전(major) · 새 버전(minor) · 삭제 · 확정 · 확정취소(넘길 때만) · 선점 · 해제 · 넘기기 (그 뒤 `trailing`).
 * 확정취소는 그 액션이 있는 화면만 넘긴다. 넘기지 않으면 단추를 그리지 않는다(ERD, 단계 2 S2-10).
```

(b) `VersionActionIds` 의 `cancelConfirm: string;` 를 `cancelConfirm?: string;` 로 바꾼다.

(c) props 세 칸을 선택으로 바꾼다.

```ts
// 바꾸기 전
  cancelConfirm: VersionAction;
// 바꾼 뒤
  /** 확정취소 — 넘기지 않으면 단추를 그리지 않는다. */
  cancelConfirm?: VersionAction;
```

```ts
// 바꾸기 전
  onCancelConfirm: () => void;
// 바꾼 뒤
  onCancelConfirm?: () => void;
```

```ts
// 바꾸기 전
  cancelConfirmMessage: string;
// 바꾼 뒤
  cancelConfirmMessage?: string;
```

(d) 확인창과 단추를 바꾼다.

```tsx
// 바꾸기 전
  const confirmCancel = () =>
    showMessage({ title: "확정취소", message: p.cancelConfirmMessage, alertType: "confirm", onConfirm: p.onCancelConfirm });
// 바꾼 뒤
  const confirmCancel = () =>
    showMessage({ title: "확정취소", message: p.cancelConfirmMessage ?? "", alertType: "confirm", onConfirm: p.onCancelConfirm ?? noop });
```

```tsx
// 바꾸기 전
      <span data-testid={p.ids.cancelConfirmWrap} title={p.cancelConfirm.title}>
        <Button data-testid={p.ids.cancelConfirm} variant="danger" disabled={!p.cancelConfirm.enabled} onClick={confirmCancel}>
          확정취소
        </Button>
      </span>
// 바꾼 뒤
      {p.cancelConfirm && (
        <span data-testid={p.ids.cancelConfirmWrap} title={p.cancelConfirm.title}>
          <Button data-testid={p.ids.cancelConfirm} variant="danger" disabled={!p.cancelConfirm.enabled} onClick={confirmCancel}>
            확정취소
          </Button>
        </span>
      )}
```

`noop` 은 같은 파일 69행에 이미 있다. 기존 화면 6곳(`CodeDetail`·`RuleDetailPanel`·`SetVersionRow`·`TestCaseCard`·`layoutMng/page`·`headerMng/page`)은 네 칸을 모두 넘기므로 바꾸지 않는다.

- [ ] **Step 6: 구현 — `localVersionEvent`**

`state/model-delta.ts`: import 에 `ErdVersionReason` 을 더하고 파일 끝에 더한다.

```ts
import type { ErdChange, ErdDelta, ErdModelJson, ErdModelView, ErdState, ErdVersionEvent, ErdVersionReason } from "../types";
```

```ts
/** 이 화면이 한 버전 동작(선점·해제·편집자)의 결과를 version 이벤트 모양으로 만든다 — onVersion 하나로 반영한다(deferred 39). */
export function localVersionEvent(
  s: ErdState, userId: string, reason: ErdVersionReason, over: Partial<Pick<ErdVersionEvent, "ownerId" | "editors" | "rowVersion" | "status">>,
): ErdVersionEvent {
  return {
    modelId: s.modelId, ver: s.ver, status: s.status, ownerId: s.ownerId, editors: s.editors, rowVersion: s.rowVersion,
    reason, userId, at: new Date().toISOString(), ...over,
  };
}
```

- [ ] **Step 7: 구현 — `panels/VersionBar.tsx`**

```tsx
"use client";

/**
 * 버전 막대(스펙 2.1·4.7, S2-10) — m-mdm VersionActionBar 를 쓴다. 확정취소는 넘기지 않는다(ERD 에 그 액션이 없다).
 * - 새 버전(copy)·삭제 뒤에는 서버가 reload 를 보내지만, 단계 2 서버가 머지되기 전에도 맞도록 응답을 받으면 바로 다시 읽는다.
 * - 선점·해제는 응답 rowVersion 을 곧바로 반영한다(version 이벤트를 기다리지 않는다, deferred 39).
 * - 넘기기는 담당자 조회가 없어 끈다(handover.ts). 확정은 ConfirmDialog, 공동 편집자는 EditorsModal 이 맡는다.
 */
import { useState } from "react";

import { Button } from "@dk-oasis/shared/form";
import { canDoButton, useUserButtonRbac } from "@dk-oasis/shared/layout";

import { VersionActionBar, type VersionAction } from "@/shell";

import { SCREEN_ID, deleteDraft, lockDraft, newVersion, unlockDraft } from "../api";
import type { ErdEditContext } from "../edit-context";
import { localVersionEvent } from "../state/model-delta";
import type { ErdVersionEvent } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";
import { EditorsModal } from "./EditorsModal";

export interface VersionBarProps { ctx: ErdEditContext; onReload(): Promise<void>; onVersion(ev: ErdVersionEvent): void }

export type VersionButtonKey = "newVersion" | "delete" | "confirm" | "lock" | "unlock";

/** 단추 활성 판정(순수). can 은 RBAC 액션 권한(copy·delete·lock·unlock). 확정은 rights.confirm 을 따른다. */
export function versionButtons(ctx: Pick<ErdEditContext, "state" | "rights">, can: (action: string) => boolean): Record<VersionButtonKey, VersionAction> {
  const s = ctx.state;
  const draft = s.status === "DRAFT";
  const owner = ctx.rights.owner;
  const ownerName = s.ownerId ?? "없음";
  const noRight = "권한이 없습니다. 권한은 시스템 관리자에게 요청하세요.";
  return {
    newVersion: !can("copy") ? { enabled: false, title: noRight }
      : draft ? { enabled: false, title: "이미 DRAFT 가 있습니다. DRAFT 를 확정하거나 지운 뒤 새 버전을 만드세요." } : { enabled: true },
    delete: !can("delete") ? { enabled: false, title: noRight } : !draft ? { enabled: false, title: "지울 DRAFT 가 없습니다." }
      : !owner ? { enabled: false, title: `DRAFT 는 소유자(${ownerName})만 지울 수 있습니다.` } : { enabled: true },
    confirm: { enabled: ctx.rights.confirm.ok, title: ctx.rights.confirm.reason ?? undefined },
    lock: !can("lock") ? { enabled: false, title: noRight } : !draft ? { enabled: false, title: "선점할 DRAFT 가 없습니다." }
      : s.ownerId !== null ? { enabled: false, title: `이미 ${ownerName} 이(가) 선점했습니다.` } : { enabled: true },
    unlock: !can("unlock") ? { enabled: false, title: noRight } : !draft || !owner
      ? { enabled: false, title: `해제는 DRAFT 소유자(${ownerName})만 할 수 있습니다.` } : { enabled: true },
  };
}

const noop = () => undefined;
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function VersionBar({ ctx, onReload, onVersion }: VersionBarProps) {
  const rbac = useUserButtonRbac();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editorsOpen, setEditorsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const s = ctx.state;
  const b = versionButtons(ctx, (a) => !rbac.isLoading && canDoButton(rbac, SCREEN_ID, a));
  const off = (a: VersionAction): VersionAction => (busy ? { ...a, enabled: false } : a);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      ctx.notify(`${label}: ${errText(e)}`, "error");
    } finally {
      setBusy(false);
    }
  };
  const newVer = (kind: "MAJOR" | "MINOR") => run("새 버전", async () => {
    const r = await newVersion(ctx.modelId, kind);
    ctx.notify(`새 버전 ${r.ver} DRAFT 를 만들었습니다.`);
    await onReload();
  });
  const del = () => run("삭제", async () => {
    await deleteDraft(ctx.modelId, s.ver, s.rowVersion);
    ctx.notify(`DRAFT ${s.ver} 를 지웠습니다.`);
    await onReload();
  });
  const lock = () => run("선점", async () => {
    const r = await lockDraft(ctx.modelId, s.ver, s.rowVersion);
    onVersion(localVersionEvent(s, ctx.me, "LOCK", { ownerId: ctx.me, rowVersion: r.rowVersion }));
    ctx.notify("DRAFT 를 선점했습니다.");
  });
  const unlock = () => run("해제", async () => {
    const r = await unlockDraft(ctx.modelId, s.ver, s.rowVersion);
    onVersion(localVersionEvent(s, ctx.me, "UNLOCK", { ownerId: null, rowVersion: r.rowVersion }));
    ctx.notify("DRAFT 선점을 풀었습니다.");
  });

  return (
    <div className="erd-bar__row erd-version" data-testid="erd-version-bar">
      <VersionActionBar
        ids={{
          newMajor: "erd-ver-major", newMinor: "erd-ver-minor", delete: "erd-ver-delete", confirm: "erd-ver-confirm",
          lock: "erd-ver-lock", unlock: "erd-ver-unlock", handover: "erd-ver-handover", handoverWrap: "erd-ver-handover-wrap",
        }}
        newVersionMode="majorMinor"
        newMajor={off(b.newVersion)} newMinor={off(b.newVersion)} delete={off(b.delete)} confirm={off(b.confirm)}
        lock={off(b.lock)} unlock={off(b.unlock)} handover={{ enabled: false }}
        onNewMajor={() => void newVer("MAJOR")} onNewMinor={() => void newVer("MINOR")} onDelete={() => void del()}
        onConfirm={() => setConfirmOpen(true)} onLock={() => void lock()} onUnlock={() => void unlock()} onHandover={noop}
        deleteMessage={`DRAFT ${s.ver} 를 지울까요? 이 버전에서 고친 모델·다이어그램이 모두 사라지고 되돌릴 수 없습니다.`}
        trailing={(
          <Button size="sm" data-testid="erd-editors-open" onClick={() => setEditorsOpen(true)}>
            공동 편집자({s.editors.length})
          </Button>
        )}
      />
      <ConfirmDialog ctx={ctx} opened={confirmOpen} onClose={() => setConfirmOpen(false)}
        onConfirmed={() => {
          setConfirmOpen(false);
          void onReload();
        }} />
      <EditorsModal ctx={ctx} opened={editorsOpen} onClose={() => setEditorsOpen(false)} onVersion={onVersion} />
    </div>
  );
}
```

- [ ] **Step 8: 구현 — `panels/ConfirmDialog.tsx`**

```tsx
"use client";

/**
 * 확정 대화상자(스펙 4.7, D19, S2-28). 열면 validate 로 확정 전 검사를 읽는다. 늦은 응답은 버린다(§37).
 * 오류가 있으면 막고, 오류·경고는 코드별로 묶어 수와 처음 50건만 보인다(첫 확정은 약 700건이다).
 * 경고가 있으면 [경고를 확인했습니다] 를 고른 뒤에만 확정한다(MDM014 를 미리 막는다). 남은 추정 관계 수를 함께 보인다.
 * 적용 시작 시각(applyFrom)은 연 때의 지금 시각이 기본이다(조정자 판정). 미래 시각이면 그때까지 새 버전(copy)이 MDM006 으로 막힌다.
 * shared Checkbox 는 data-testid 를 받지 않아 감싼 span 에 둔다(ruleConfirm 선례).
 */
import { useEffect, useMemo, useState } from "react";

import { Button, Checkbox, Input } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import { confirmVersion, validateConfirm } from "../api";
import type { ErdEditContext } from "../edit-context";
import type { ErdCheckIssue, ErdConfirmCheck } from "../types";

export const ISSUE_LIMIT = 50;
const APPLY_FROM_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export interface IssueGroup { code: string; count: number; items: ErdCheckIssue[] }

/** 코드별 묶음 — 많은 것부터, 같으면 코드 순. 묶음마다 처음 limit 건만 싣는다. */
export function groupIssues(issues: readonly ErdCheckIssue[], limit = ISSUE_LIMIT): IssueGroup[] {
  const by = new Map<string, IssueGroup>();
  for (const i of issues) {
    const g = by.get(i.code) ?? { code: i.code, count: 0, items: [] };
    g.count += 1;
    if (g.items.length < limit) g.items.push(i);
    by.set(i.code, g);
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

/** 로컬 시각 → `yyyy-MM-dd HH:mm:ss`(RuleConfirmService.parseApplyFrom 형식). */
export function applyFromText(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function IssueList({ title, groups, testId }: { title: string; groups: IssueGroup[]; testId: string }) {
  return (
    <div data-testid={testId}>
      <div className="erd-confirm__summary">{title}</div>
      {groups.map((g) => (
        <div key={g.code} className="erd-confirm__group" data-testid={`${testId}-${g.code}`}>
          <div className="erd-confirm__code">{g.code} · {g.count}건</div>
          <ul className="erd-confirm__list">
            {g.items.map((i, n) => (
              <li key={`${i.itemKey ?? ""}:${n}`}>{i.itemKey ? `${i.itemKey} — ${i.message}` : i.message}</li>
            ))}
          </ul>
          {g.count > g.items.length && <div className="erd-confirm__more">… {g.count - g.items.length}건 더 있습니다.</div>}
        </div>
      ))}
    </div>
  );
}

export interface ConfirmDialogProps { ctx: ErdEditContext; opened: boolean; onClose(): void; onConfirmed(): void }

export function ConfirmDialog({ ctx, opened, onClose, onConfirmed }: ConfirmDialogProps) {
  const [check, setCheck] = useState<ErdConfirmCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [applyFrom, setApplyFrom] = useState("");
  const [sending, setSending] = useState(false);
  const { modelId } = ctx;

  useEffect(() => {
    if (!opened) return;
    let alive = true;
    setCheck(null);
    setError(null);
    setAck(false);
    setApplyFrom(applyFromText(new Date()));
    validateConfirm(modelId)
      .then((c) => {
        if (alive) setCheck(c);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [opened, modelId]);

  const errors = useMemo(() => groupIssues(check?.errors ?? []), [check]);
  const warnings = useMemo(() => groupIssues(check?.warnings ?? []), [check]);
  const inferred = useMemo(() => Object.values(ctx.state.model.relations).filter((r) => r.state === "INFERRED").length, [ctx.state.model.relations]);
  const nErr = check?.errors.length ?? 0;
  const nWarn = check?.warnings.length ?? 0;
  const applyOk = APPLY_FROM_RE.test(applyFrom);
  const future = applyOk && applyFrom > applyFromText(new Date());
  const canSend = !!check && nErr === 0 && (nWarn === 0 || ack) && applyOk && !sending && ctx.rights.confirm.ok;

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      await confirmVersion(modelId, ctx.state.ver, ctx.state.rowVersion, nWarn > 0, applyFrom);
      ctx.notify(`버전 ${ctx.state.ver} 를 확정했습니다.`);
      onConfirmed();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={opened} title={`버전 ${ctx.state.ver} 확정`} size="lg" onClose={onClose}
      footer={(
        <>
          <Button data-testid="erd-confirm-cancel" onClick={onClose}>닫기</Button>
          <Button variant="primary" data-testid="erd-confirm-send" disabled={!canSend} onClick={() => void send()}>확정</Button>
        </>
      )}>
      <div data-testid="erd-confirm-dialog">
        {!check && !error && <div className="erd-confirm__summary">확정 전 검사를 하는 중입니다.</div>}
        {check && (
          <div className="erd-confirm__summary" data-testid="erd-confirm-summary">
            오류 {nErr}건 · 경고 {nWarn}건 · 남은 추정 관계 {inferred}건(확정을 막지 않습니다)
          </div>
        )}
        {nErr > 0 && (
          <IssueList title="새로 넣거나 바꾼 컬럼이 표준에 맞지 않아 확정할 수 없습니다. 고친 뒤 다시 확정하세요." groups={errors} testId="erd-confirm-errors" />
        )}
        {nWarn > 0 && (
          <IssueList title="기존 위반입니다. 확인했으면 아래를 고르고 확정하세요." groups={warnings} testId="erd-confirm-warnings" />
        )}
        {nWarn > 0 && nErr === 0 && (
          <span data-testid="erd-confirm-ack">
            <Checkbox checked={ack} onChange={setAck} label={`경고 ${nWarn}건을 확인했습니다`} />
          </span>
        )}
        <div className="erd-editors__row">
          <span>적용 시작</span>
          <Input aria-label="적용 시작 시각" value={applyFrom} onChange={setApplyFrom} data-testid="erd-confirm-apply-from"
            error={applyOk ? undefined : "yyyy-MM-dd HH:mm:ss 형식으로 넣으세요."} />
        </div>
        {future && (
          <div className="erd-confirm__more" data-testid="erd-confirm-future">
            미래 시각입니다. 그 시각 전까지는 이 모델의 새 버전을 만들 수 없습니다(MDM006).
          </div>
        )}
        {error && <div className="erd-confirm__error" role="alert" data-testid="erd-confirm-error">{error}</div>}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 9: 구현 — `panels/EditorsModal.tsx`**

```tsx
"use client";

/**
 * 공동 편집자 관리(D15, R7). 누구나 목록을 보고, 더하기·빼기는 DRAFT 소유자만 한다(rights.manageEditors, 서버도 판정).
 * 사용자 ID 는 서버가 있는지 보지 않는다. Claude 세션은 그 세션의 ERD_USER 값을 넣는다(README 마감 3).
 * 성공하면 편집자 목록을 version 이벤트 모양으로 곧바로 바꾼다(편집자 행은 ROW_VERSION 을 바꾸지 않는다).
 */
import { useState } from "react";

import { Button, Input } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import { addEditor, removeEditor } from "../api";
import type { ErdEditContext } from "../edit-context";
import { localVersionEvent } from "../state/model-delta";
import type { ErdVersionEvent } from "../types";

export interface EditorsModalProps { ctx: ErdEditContext; opened: boolean; onClose(): void; onVersion(ev: ErdVersionEvent): void }

export function EditorsModal({ ctx, opened, onClose, onVersion }: EditorsModalProps) {
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = ctx.state;
  const can = ctx.rights.manageEditors;

  const change = async (kind: "ADD" | "REMOVE", raw: string) => {
    const target = raw.trim();
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "ADD") await addEditor(ctx.modelId, target);
      else await removeEditor(ctx.modelId, target);
      const editors = kind === "REMOVE" ? s.editors.filter((x) => x !== target)
        : s.editors.includes(target) || target === s.ownerId ? s.editors : [...s.editors, target];
      onVersion(localVersionEvent(s, ctx.me, kind === "ADD" ? "ADD_EDITOR" : "REMOVE_EDITOR", { editors }));
      if (kind === "ADD") setUserId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={opened} title="공동 편집자" size="md" onClose={onClose}
      footer={<Button data-testid="erd-editors-close" onClick={onClose}>닫기</Button>}>
      <div data-testid="erd-editors">
        <div className="erd-confirm__summary">
          소유자: {s.ownerId ?? "없음"}. {can.ok ? "사용자 ID 를 넣어 더하거나 뺍니다. Claude 세션은 ERD_USER 값을 넣습니다." : can.reason}
        </div>
        {s.editors.length === 0 && <div className="erd-confirm__more">공동 편집자가 없습니다.</div>}
        {s.editors.map((e) => (
          <div key={e} className="erd-editors__row" data-testid={`erd-editor-${e}`}>
            <span className="erd-mono">{e}</span>
            <Button size="mini" variant="danger" data-testid={`erd-editor-remove-${e}`} disabled={!can.ok || busy} onClick={() => void change("REMOVE", e)}>
              빼기
            </Button>
          </div>
        ))}
        <div className="erd-editors__row">
          <Input aria-label="공동 편집자 사용자 ID" placeholder="사용자 ID" value={userId} maxLength={50} disabled={!can.ok || busy}
            data-testid="erd-editor-input" onChange={setUserId} />
          <Button size="sm" variant="primary" data-testid="erd-editor-add" disabled={!can.ok || busy || !userId.trim()}
            onClick={() => void change("ADD", userId)}>
            더하기
          </Button>
        </div>
        {error && <div className="erd-confirm__error" role="alert" data-testid="erd-editors-error">{error}</div>}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 10: 시험 통과 확인**

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm exec vitest run tests/shell/version-action-bar.test.ts tests/dma/erdEdit/`
Expected: PASS — 새 시험 7건(`version-action-bar.test.ts` 2건, `version-bar.test.ts` 2건, `page-render.test.ts` 3건)과 Task 10 까지의 erdEdit 시험 전부.

`VersionActionBar` 를 쓰는 기존 화면 6곳의 시험이 그대로인지 본다(S2-10).

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dmc/codeMng tests/dme/ruleMng tests/dme/ruleSetEdit tests/dme/ruleEdit tests/dmb tests/layout`
Expected: PASS(`rule-mng-page.test.ts` 의 `rule-cancel-confirm`·`version-buttons.test.ts` 의 확정취소 판정 포함). 실패 0.

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint`
Expected: 오류 0.

- [ ] **Step 11: 커밋**

```bash
/usr/bin/git add src/frontend/m-mdm/src/shell/VersionActionBar.tsx src/frontend/m-mdm/pages/dma/erdEdit \
  src/frontend/m-mdm/tests/shell/version-action-bar.test.ts src/frontend/m-mdm/tests/dma/erdEdit
/usr/bin/git commit -m "$(cat <<'MSG'
feat(erd-edit): 버전 막대·확정 대화상자·공동 편집자 관리, VersionActionBar 확정취소 선택 props

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
MSG
)"
```

- [ ] **Step 12: 레인 마감 확인 (FE1 전체)**

Run: `cd src/frontend && pnpm --filter "@dk-oasis/m-mdm^..." build && pnpm --filter @dk-oasis/m-mdm test && pnpm --filter @dk-oasis/m-mdm lint`
Expected: m-mdm 시험 실패는 기준선 `ui-meta-lock.test.ts` 하나뿐이다. lint 오류 0. 결과를 레인 보고에 적고 조정 세션의 머지 허가를 기다린다.

---

## 화면 testid (마감 Task 16 이 쓴다)

마감의 브라우저 확인(ego-browser)은 아래 이름을 쓴다. 모달 안 요소는 `document` 에서 찾는다(포털). FE1 이 아래 이름을 바꾸면 07-close.md 도 함께 고친다.

| 자리 | testid | 내용 |
|---|---|---|
| 위 막대 | `erd-rev`, `erd-ver`, `erd-message`(`data-tone`), `erd-banner-lost`, `erd-banner-readonly` | rev·버전 글, 메시지 줄, 끊김 띠, 읽기 전용 띠 |
| 접속자 | `erd-presence`, `erd-avatar-<세션>`(`data-source="ui"·"llm"`, `title` 에 사용자·세션·출처·만료·작업 중 표 수) | 동그라미 묶음과 한 명 |
| 버전 막대 | `erd-version-bar`, `erd-ver-major`, `erd-ver-minor`, `erd-ver-delete`, `erd-ver-confirm`, `erd-ver-lock`, `erd-ver-unlock`, `erd-ver-handover`(`-wrap`), `erd-editors-open` | 단추. 활성 이유는 단추를 감싼 span 의 `title` |
| 확정 창 | `erd-confirm-dialog`, `erd-confirm-summary`, `erd-confirm-errors`(`-<코드>`), `erd-confirm-warnings`(`-<코드>`), `erd-confirm-ack`(안의 `input` 을 누른다), `erd-confirm-apply-from`, `erd-confirm-future`, `erd-confirm-send`, `erd-confirm-cancel`, `erd-confirm-error` | 검사 결과 묶음·확인·적용 시각·확정 |
| 알림 띠 | `erd-notice`(`data-code`), `erd-notice-message`, `erd-notice-hint`, `erd-notice-mine`, `erd-notice-copy`, `erd-notice-close` | 거절·끊김·다시 읽음 알림과 [내 값 복사] |
| 공동 편집자 창 | `erd-editors`, `erd-editor-<ID>`, `erd-editor-remove-<ID>`, `erd-editor-input`, `erd-editor-add`, `erd-editors-close`, `erd-editors-error` | 목록·더하기·빼기 |
| 변경 기록 | `erd-tab-history`, `erd-review-history`, `erd-history-reload`, `erd-undo-<rev>` | 탭·다시 읽기·행마다 [되돌리기] |
| 캔버스 | `erd-canvas-host`, `erd-fit` | 캔버스 키를 받는 칸, 화면 맞춤 |
| 키 | 본문(입력 칸 밖)에서 Ctrl/⌘+Z, Ctrl/⌘+T·K(`erd-find-widget`), Ctrl/⌘+O·Alt+O(`erd-column-jump`) | 전역 키 |

---

## 계획 작성자 메모

- README 의 화면 함수 `confirmVersion(modelId, ver, rowVersion, warningsAcknowledged)` 에 `applyFrom` 인자를 더했다. 서버 `confirm` 이 `applyFrom`(`yyyy-MM-dd HH:mm:ss`)을 요구하고, 미래 시각이면 `copy` 가 MDM006 으로 막힌다(조정자 판정 반영). README 인터페이스를 고쳐야 한다.
- README 의 시험 파일 `tests/shell/version-action-bar.test.tsx` 는 m-mdm vitest 가 모으지 않는다(`include: tests/**/*.test.ts`). `.test.ts` + `createElement` 로 썼다.
- `ErdEditContext` 에 README 에 없는 칸 두 개를 더했다. `selectedColumnId` 는 컬럼 점프(FE3)가 그리드 행으로 가려고 필요하다. `exclusive(fn)` 은 apply 밖의 쓰기(`import FROM_DB`·`APPLY_DIFF`)가 보내는 중인 묶음과 겹쳐 그 SSE 에코가 묶음의 에코로 잘못 읽히는 것을 막는다. FE3 Task 15 는 `applyDbDiff` 를 `ctx.exclusive` 안에서 불러야 한다.
- `pending.ts` 서명이 README 와 두 군데 다르다. `onStream(l, d, now, me)` 는 에코를 가르려고 내 세션이 필요하다. `onResult` 결과에 `mine`(myRevs 에 넣을 rev)을 더했다. 두 함수는 FE1 안에서만 쓴다.
- `ErdModelApi` 에 `pendingIds`·`exclusive` 를 더했고 `reload` 는 `{ dropMine }` 을 받는다(SSE `reload` 만 myRevs 를 비운다).
- `ColumnGrid`(FE3)·`DiagramTree`(FE2)·`canvas/erd-styles.ts`(FE2)는 Task 9 가 뼈대 연결로 한 번 고친다. FE2·FE3 이 시작하기 전에 머지되므로 겹치지 않는다. FE1 스타일은 그 뒤 `panels/core-styles.ts` 에만 둔다.
- `DiagramTree`·`ReviewPanel` 의 `ctx` 는 `ErdEditContext | null` 이다(모델을 고르기 전에도 그려진다). README 표는 `ErdEditContext` 로 적었다.
- `ColumnJump` 가 열렸을 때 `data-testid="erd-column-jump"` 를 다는 것을 FE3 계약에 더했다. Task 9 의 Alt+O 시험이 그 이름을 본다.
- 투영(S2-18)에 `id`·`phys` 를 준 `addTable` 을 넣었다. README 의 미리 그리는 목록과 서버가 정하는 목록 어디에도 없었고, 결과가 정해져 있어 표 도구(FE2)가 바로 그릴 수 있다.
- 확정 `applyFrom` 기본값은 대화상자를 연 때의 지금 시각이다. 누를 때는 이미 지난 시각이 되지만 서버 `validApplyFrom` 은 필수·상한(OPEN_END)만 보고 지난 시각을 받는다(지난 시각이면 바로 적용, `markParentInUse`). 직전 RELEASED 의 적용 시작보다 뒤여야 한다(`applyFromOrderCheck`).
- FE2·FE3 계획 작성자는 Task 9 의 시험 도구 `fakeEditContext(state, over)`(`erd-fixtures.ts`)를 모를 수 있다. 조정자가 두 레인에 알려 각자 가짜 문맥을 만들지 않게 해 달라.
- S2-28 "처음 50건" 은 코드 묶음마다 50건으로 읽었다. 전체 50건으로 정하면 `groupIssues` 의 자르기 위치만 바꾼다.
- 다시 읽기(gap·5초 초과·reload 이벤트 모두)는 보내지 않은 묶음까지 버린다(README 규칙). 보내는 중인 묶음은 결과가 다시 읽은 모델이나 SSE 로 들어오고, 그 응답 rev 는 myRevs 에 넣지 않는다.
- 분량이 지침(Task 당 250~700줄)을 넘는다. Task 9 약 2,000줄, Task 10 약 1,200줄, Task 11 약 690줄이다. Task 9 는 FE2·FE3 이 기대는 뼈대라 새 파일과 `ErdViewer` 전체 코드를 실었다. 나눈다면 Task 9 를 "타입·API·편집 문맥·권한(순수)" 과 "훅·자리 부품·ErdViewer 연결" 로 가를 수 있다. 조정자가 정한다.
- 조정자 판정(S2-29, 정합 검토 뒤): Task 10 에서 `exclusive` 가 fn 결과의 rev 까지 `state.rev` 가 따라올 때(최대 `HOLD_LIMIT_MS` 5초, 넘으면 다시 읽기) 다음 묶음을 놓는다. 시험 이름 `exclusiveWaitsForOwnEcho` 를 Task 10 에 더한다(README 화면 내부 계약 참조). Task 9 의 `exclusive` 는 지금 코드 그대로 두고 Task 10 이 이 대기를 덧붙인다.
