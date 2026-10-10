# ERD 도구 단계 2 — Task 14~15: 그리드 편집·다시 가져오기 반영

> 공통 제약(Global Constraints)·단계 2 에서 정한 점(S2-1~S2-28)·Review Focus·인터페이스는 [README](README.md) 에 있다. 이 문서의 모든 Task 는 README 의 Global Constraints 를 따른다.
> 이전: [05-frontend-canvas.md](05-frontend-canvas.md) · [README](README.md) · 다음: [07-close.md](07-close.md)

레인 FE3 이 Task 14 → 15 를 차례로 한다. 브랜치는 `erd-stage2-fe3` 이다. FE1 의 Task 9(화면 뼈대)가 dev 에 합쳐진 뒤 rebase 하고 시작한다([FE1:Task 9 → FE3:Task 14]). 이 레인은 아래 다섯 화면 파일과 자기 시험 파일만 고친다(S2-19). `ErdViewer.tsx`·`api.ts`·`types.ts`·`edit-context.ts`·`state/*`·`canvas/*` 는 읽기만 한다.

- 고치는 파일: `panels/ColumnGrid.tsx`, `panels/GridInputBar.tsx`(새), `panels/TokenChoiceModal.tsx`(새), `panels/ColumnJump.tsx`, `panels/DbDiffApply.tsx`
- 시험 파일: `tests/dma/erdEdit/grid-fixtures.ts`(새, FE3 전용 공용), `grid-edit.test.ts`, `column-grid.test.ts`, `column-jump.test.ts`, `db-diff-apply.test.ts`

shared `AgDataGrid` 의 props 는 바꾸지 않는다(S2-6). 그리드 키는 그리드를 감싼 div 의 `onKeyDownCapture` 로 받는다. 논리명 입력과 미리보기는 그리드 아래 입력 칸에서 한다. 스타일은 인라인 객체와 토큰만 쓴다. `canvas/erd-styles.ts`(FE2 소유)의 `ERD_CSS` 에 클래스를 더하지 않는다. 대기 행의 흐림 규칙 한 줄은 `ColumnGrid` 가 자기 `<style href precedence>` 로 넣는다(Local-Rules §17).

README Review Focus 1~7 에는 Task 14·15 의 시험이 없다. 이 문서는 다른 Task 의 Review Focus 시험을 빌려 쓰지 않는다. 서버 새 계약(`APPLY_DIFF`, `compare` 의 `tokens`)은 README "인터페이스 (정본)" 의 JSON 으로 만든 가짜 응답으로 시험한다(S2-1). 실제 서버와의 연결은 Task 16 이 확인한다.

공통 명령(모두 `src/frontend` 에서 부른다):

```bash
# 의존 패키지(shared 포함) 빌드 — m-mdm 시험은 @dk-oasis/shared/* 를 shared dist 로 푼다
pnpm --filter "@dk-oasis/m-mdm^..." build
# 이 문서의 시험만
pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/
# 타입 검사(lint = tsc --noEmit, 시험 폴더는 검사 범위 밖이다)
pnpm --filter @dk-oasis/m-mdm lint
```

### 화면 시험·마감이 쓰는 `data-testid` (정본)

Task 14·15 가 아래 이름을 그대로 단다. 마감(07, Task 16)의 브라우저 확인과 이 문서의 시험이 이 이름을 쓴다. 이름을 바꾸려면 조정 세션을 거친다. 포털(body)로 뜨는 창 안의 이름은 `document` 에서 찾는다.

| 자리 | `data-testid` / 선택자 | 부품 | 비고 |
|---|---|---|---|
| 컬럼 그리드 전체(키 받는 감싼 칸) | `erd-colgrid` | ColumnGrid | Ctrl/⌘+Enter·Ctrl/⌘+Shift+Enter 를 여기서 받는다 |
| 그리드 몸통 / 빈 표 안내 | `erd-columns` / `erd-columns-empty` | ColumnGrid | 단계 1 이름 그대로. 행은 `.ag-row[row-id="<컬럼 id>"]`, 칸은 `[col-id="logical\|phys\|type\|nn"]` |
| 입력 칸 묶음 | `erd-grid-bar` | GridInputBar | 그리드 아래, GridPanel 밖 |
| 새 컬럼 논리명 입력 칸 | `erd-grid-input` | GridInputBar | Enter 로 추가. 비어 있을 때 Ctrl+Enter 는 이 칸으로 초점을 옮긴다 |
| [추가]·[PK 추가] 단추 | `erd-grid-add` | GridInputBar | 글이 PK 모드면 "PK 추가" |
| 논리명 미리보기 줄 | `erd-grid-preview` | GridInputBar | 300ms 뒤 `compare{logical}` 결과 |
| 미리보기 물리명 | `erd-grid-phys` | GridInputBar | 미리보기가 지금 글자의 것일 때만 있다 |
| 미리보기 [토막 고르기] | `erd-grid-tokens` | GridInputBar | 하나로 정해지지 않은 토막이 있을 때만 |
| 거절 칸 문구(이 표·방금 추가한 컬럼) | `erd-grid-error` | GridInputBar | `ctx.highlight.message`. 그리드 칸에는 `cell-mdm-invalid` 클래스 |
| 읽기 전용·표 없음 이유 | `erd-grid-reason` | GridInputBar | `ctx.rights.model.reason` |
| 고른 컬럼 물리명 | `erd-grid-target` | GridInputBar | 그리드에서 행을 고르거나 컬럼 점프로 왔을 때 |
| [논리명 바꾸기] | `erd-grid-rename` | GridInputBar | 옆 확인란 aria-label "물리명도 바꾸기" |
| 도메인 적용 입력 칸 / [찾기] / 찾기 창 | `erd-grid-domain` / `erd-grid-domain-find` / `erd-grid-domain-box` | GridInputBar(`@/domain` DomainField) | Enter·칸 떠남 → `applyDomain`. 찾기 창 줄은 `erd-grid-domain-box-pick-<표준명>` |
| [추천] 도메인 | `erd-grid-recommend` | GridInputBar | `compare{phys}` 의 추천 도메인 → `applyDomain` |
| 토막 고르기 창 본문 | `erd-token-choice` | TokenChoiceModal | NEEDS_CHOICE·[토막 고르기] 둘 다 |
| 토막별 약어 고르기 / 직접 입력 | `erd-token-<seq>` (`<select>`) / `erd-token-input-<seq>` | TokenChoiceModal | 후보가 없는 토막만 직접 입력 |
| 만든 물리명 / [적용] | `erd-token-phys` / `erd-token-apply` | TokenChoiceModal | 약어가 다 차야 [적용] 이 켜진다 |
| 컬럼 점프 열림 표시 | `erd-column-jump` | ColumnJump | 열렸을 때만 화면 안(포털 밖)에 숨은 요소로 있다. FE1 Task 9 뼈대 계약 6, Task 9 의 Alt+O 시험과 마감 6-7 이 본다 |
| 컬럼 점프 창 본문 / 찾기 칸 | `erd-jump` / `erd-jump-input` | ColumnJump | ↑/↓·Enter 로 고른다. 목록 행은 `.ag-row[row-id="<컬럼 id>"]` |
| 컬럼 점프 빈 결과 / 상한 넘침 | `erd-jump-empty` / `erd-jump-more` | ColumnJump | 상한 200건 |
| 다시 가져오기 반영 본문 | `erd-diff-apply` | DbDiffApply | 검토 패널 "DB 차이" 탭 안 |
| 차이 항목 고르기 칸 | `[data-testid="erd-diff-apply"] .ag-row[row-id="<항목 id>"] .ag-selection-checkbox input` | DbDiffApply | ag-grid 고르기 칸이라 testid 를 달 수 없다(shared props 불변, S2-6). 항목 id 는 `compare kind=DB_DIFF` 의 `items[].id` |
| [고른 항목 반영] | `erd-diff-apply-run` | DbDiffApply | 막힌 이유는 아래 안내 줄 |
| 고른 건수·막힌 이유 줄 | `erd-diff-apply-note` | DbDiffApply | 예 "고른 2건: 컬럼 다름 1 · DB 에 생긴 FK 1" |
| 결과 요약 | `erd-diff-apply-result` | DbDiffApply | 예 "rev 231 에 2건을 반영했습니다 — 컬럼 바뀜 1 · DB FK 표시 1" |
| 낡은 항목 안내 | `erd-diff-apply-stale` | DbDiffApply | INVALID(itemsJson) 거절 뒤. 부모·자식을 풀 수 없는 FK_ADDED 도 여기로 온다 |
| 지우는 항목 확인창 | 포털 [확인] 단추(글 "확인") | DbDiffApply(`useMessage` confirm) | TABLE_REMOVED·COLUMN_REMOVED 를 골랐을 때 |

화면 시험은 `.test.ts` 로 쓰고 `createElement` 로 그린다(m-mdm vitest 는 `tests/**/*.test.ts` 만 모은다). 렌더 시험은 머리 주석 `/** @vitest-environment happy-dom */` 을 단다. 그리드가 준비될 때까지는 `tests/dme/helpers/render.ts` 의 `settleGrid` 로 기다린다.

---

### Task 14: 그리드 편집 — 칸 편집·그리드 키·입력 칸 미리보기·토막 고르기·도메인·행 끌기·컬럼 점프

**Files:**
- Modify: `src/frontend/m-mdm/pages/dma/erdEdit/panels/ColumnGrid.tsx` (파일 전체를 바꾼다. Task 9 의 읽기 그리드 자리)
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/panels/GridInputBar.tsx`
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/panels/TokenChoiceModal.tsx`
- Modify: `src/frontend/m-mdm/pages/dma/erdEdit/panels/ColumnJump.tsx` (파일 전체를 바꾼다. Task 9 의 빈 부품 자리)
- Test: `src/frontend/m-mdm/tests/dma/erdEdit/grid-fixtures.ts` (FE3 시험 공용, 시험 파일이 아니다)
- Test: `src/frontend/m-mdm/tests/dma/erdEdit/{grid-edit,column-grid,column-jump}.test.ts`

**Interfaces:**
- Consumes (FE1 Task 9, README "화면 내부 계약"):
  - `edit-context.ts`: `ErdEditContext`(`modelId`·`session`·`state`·`status`·`rights.model`·`selectedTableId`·`selectedColumnId`·`highlight`·`pendingIds`·`apply`·`exclusive`·`clearHighlight`·`notify`·`nav.selectColumn`), `ApplyOutcome`, `ErdNotice`, `ErdHighlight`, `EditRights`.
  - 시험 도구: `tests/dma/erdEdit/erd-fixtures.ts` 의 `fakeEditContext(state, over)`(FE1 Task 9). `grid-fixtures.ts` 의 가짜 문맥은 이것 위에 이 레인 기본값만 얹는다.
  - `api.ts`: `previewName({ logical?, phys? }): Promise<ErdNamePreview>`(`compare`).
  - `types.ts`: `ErdNamePreview`, `ErdNameToken`, `ErdCommandJson`, `ErdModelJson`, `ErdStatusView`, `ErdColumnStatus`.
  - 단계 1 그대로 쓰는 것: `canvas/erd-flow.ts` 의 `keyMarks`, `canvas/erd-geometry.ts` 의 `typeText`, 시험 공용 `erd-fixtures.ts` 의 `menuModel`·`stateOf`·`MENU_DIAGRAMS`·`bigState`.
  - m-mdm 공용: `@/domain` 의 `DomainField`·`DomainRow`, `@/oasis-screen` 의 `MDM_OASIS_BASE`·`plainError`. shared: `@dk-oasis/shared/grid`(`AgDataGrid`·`GridPanel`·`GridColumn`·`AgDataGridFieldError`), `form`(`Badge`·`Button`·`Checkbox`·`Input`·`Select`), `modal`(`Modal`), `http`(`callOasisAt`).
  - 엔진 사실(조사 A, `ErdCommandEngine.addColumn`·`ErdColumnFill`): `phys` 가 없을 때만 서버가 논리명으로 물리명·도메인을 채운다. 후보가 여럿이면 `NEEDS_CHOICE`(`property:"phys"`, `elementId` = 새 컬럼 id, `choices` = 토막별 `{seq, surface, status, candidates:[{termId, termName, senseNo, engAbbr, via}]}`)다. 물리명은 토막 약어를 `_` 로 잇는다(`ColumnNameComposer.forward`). 이름 규칙은 `^[A-Z][A-Z0-9_$#]{0,127}$`(`ErdIds`)다.
- Produces (FE1 이 `ErdViewer`·`ReviewPanel` 에서 그리고, Task 16 이 브라우저에서 확인한다):
  - `ColumnGrid.tsx`: `ColumnGrid({ ctx, tableId })`, `ColumnGridProps`, `STATUS_LABEL`, `statusBadge`, `columnRows`(단계 1 모양 그대로), `gridRows`, `pendingKeyOf`, `GRID_COLUMNS`, `cellEditCommand`, `parseTypeText`, `orderChangeCommand`, `gridKeyAction`, 형 `GridKey`, `highlightErrors`, `requestColumnFocus`, `subscribeColumnFocus`, `GRID_STYLE_HREF`.
  - `GridInputBar.tsx`: `GridInputBar`, `GridInputBarProps`, 형 `AddKind`·`BarHandle`·`NewColumn`, `PREVIEW_DEBOUNCE_MS = 300`, `newElementId`, `addColumnBatch`, `withPhys`, `searchErdDomains`.
  - `TokenChoiceModal.tsx`: `TokenChoiceModal`, 형 `TokenChoice`, `toTokenChoices`, `composePhys`, `ORACLE_ID_RE`, `TOKEN_STATUS_LABEL`, `tokenTone`.
  - `ColumnJump.tsx`: `ColumnJump({ ctx, opened, onClose })`, `jumpRows`, `JUMP_LIMIT = 200`, 형 `JumpRow`.

동작 규칙(스펙 2.2·4.1·4.4·8절, S2-6·S2-18·S2-27):
1. 칸 편집은 ag-grid 기본(F2·더블클릭)이다. 논리명·물리명·타입·NN 칸을 고칠 수 있다. 칸을 떠날 때(Enter·Tab·다른 칸) `updateColumn` 한 건을 `ctx.apply` 로 보낸다. 값이 같으면 보내지 않는다. 물리명은 대문자로 바꾸고 이름 규칙·같은 표 중복을 화면에서 먼저 본다. 타입 칸은 `VARCHAR2(50)`·`NUMBER(10,2)`·`DATE`·`TIMESTAMP(6)` 글을 받아 `dataType`·`length`·`scale` 로 푼다.
2. 화면에서 틀린 값이거나 서버가 거절하면(`ApplyOutcome.ok=false`) 행 객체를 새로 만들어 원래 값으로 돌린다. ag-grid 는 받은 행 객체에 편집 값을 써 두고, 행 끌기는 그리드 안 순서를 먼저 바꾸기 때문이다(`epoch`).
3. 거절 알림·강조는 `ctx.apply` 가 올린다. 그리드는 `ctx.highlight` 가 이 표의 컬럼이면 그 칸에 `fieldErrors` 로 서버 문구를 단다.
4. 대기 행(`ctx.pendingIds` 에 든 컬럼)은 흐리게 그리고 고치거나 끌지 못한다. 응답이 오면 풀린다(S2-18).
5. 행 끌기(키 칸 손잡이)는 옮긴 한 컬럼의 `moveColumn{id, position}` 한 건이다. 두 개 이상이 움직인 순서는 보내지 않는다.
6. 그리드 키는 그리드와 입력 칸을 함께 감싼 div 의 `onKeyDownCapture` 에서 받는다. Ctrl/⌘+Enter 는 컬럼 추가, Ctrl/⌘+Shift+Enter 는 PK 컬럼 추가다. 한글 조합 중(`isComposing`, keyCode 229)이거나 칸 편집기가 열려 있으면 넘긴다. 포털로 뜬 창의 키는 React 트리로는 이 div 를 지나므로, DOM 으로 이 div 안일 때만 받는다.
7. 입력 칸이 비어 있으면 Ctrl+Enter 는 입력 칸으로 초점을 옮기고 추가 종류(PK 여부)를 기억한다. 글자가 있으면 바로 보낸다. 입력 칸의 Enter 도 같다. 새 컬럼은 화면이 `c-` id 를 정하고 논리명만 보낸다. 물리명·도메인은 서버가 채운다(스펙 4.1). PK 추가는 `[addColumn{id, position: 마지막 PK 컬럼 다음}, setPrimaryKey{table, columns:[...기존 PK, id]}]` 한 묶음이다.
8. 서버가 `NEEDS_CHOICE`(`property:"phys"`)로 거절하면 토막 고르기 창을 띄운다. 고른 약어로 물리명을 만들고, `previewName({phys})` 의 `recommendedDomainId` 를 도메인으로 넣어 같은 묶음(같은 `c-` id)을 다시 보낸다. 추천 도메인을 못 읽으면 도메인 없이 보낸다. 미리보기에 하나로 정해지지 않은 토막이 있으면 [토막 고르기] 로 미리 고를 수도 있다.
9. 논리명 미리보기는 입력이 300ms 멈춘 뒤 `compare{logical}` 을 한 번 부른다. 요청 순번으로 늦은 응답을 버린다(Local-Rules §20·§34·§37). 미리보기는 물리명·표준 상태·토막별 약어·추천 도메인을 보인다. 그리드 밖 아래 줄에 둔다(§38·§45).
10. 그리드에서 고른 컬럼이 있으면 입력 칸 아래에서 [논리명 바꾸기](미리보기 물리명도 함께, 끌 수 있다)와 도메인 적용(`DomainField` → `applyDomain`, 비우면 `domainId:null`, [추천] → 추천 도메인 `applyDomain`)을 한다.
11. 컬럼 점프(Ctrl/⌘+O·Alt+O, 키는 FE1)는 지금 표(없으면 모든 표)의 컬럼을 물리명·논리명으로 찾는다. ↑/↓ 와 Enter 로 고른다. 고르면 `ctx.nav.selectColumn(id)` 를 부르고 `requestColumnFocus(id)` 로 그리드에 알린다. `nav.selectColumn` 은 FE1 이 그 컬럼의 표를 고르고 `ctx.selectedColumnId` 를 둔다(README 정본). 그리드 행으로 옮겨 초점을 주는 일은 표가 바뀌어 그리드가 다시 그려진 뒤여야 해서 FE3 파일 안의 알림(`requestColumnFocus`·`subscribeColumnFocus`)으로 한다(조정자 판정으로 유지).

- [ ] **Step 0: Task 9 뼈대 확인 (rebase 직후)**

Run: `cd src/frontend/m-mdm/pages/dma/erdEdit && grep -n "export" edit-context.ts && grep -n "export function \(previewName\|applyDbDiff\|erdCall\)" api.ts && grep -n "export interface \(ErdNamePreview\|ErdNameToken\|ErdDiffApplyResult\|ErdDiffApplySummary\)\|export type ErdCommandJson" types.ts && grep -n "export function ColumnGrid\|export function ColumnJump\|export function DbDiffApply" panels/*.tsx && grep -n "export" panels/ColumnGrid.tsx && grep -n "export function fakeEditContext" ../../../tests/dma/erdEdit/erd-fixtures.ts`
Expected:
- `edit-context.ts` 가 `ErdEditContext`(`selectedColumnId`·`exclusive` 포함)·`ApplyOutcome`·`ErdNotice`·`ErdHighlight`·`EditRights` 를 내보낸다. `erd-fixtures.ts` 에 `fakeEditContext` 가 있다.
- `api.ts` 에 `previewName`·`applyDbDiff`·`erdCall` 이 있다.
- `types.ts` 에 네 인터페이스와 `ErdCommandJson` 이 있다.
- `ColumnGrid` 는 `{ ctx, tableId }`, `ColumnJump` 는 `{ ctx, opened, onClose }` 를 받는다.
- `ColumnGrid.tsx` 가 `STATUS_LABEL`·`statusBadge`·`columnRows` 를 내보낸다(`ReviewPanel`·`panel-rows.test.ts` 가 쓴다).

하나라도 다르면 멈추고 조정 세션에 알린다(README 화면 내부 계약과 다르다). `ColumnGrid.tsx` 에 위 셋 말고 다른 export 가 더 있으면 그 이름도 Step 8 의 새 파일에 같은 뜻으로 남긴다.

- [ ] **Step 1: FE3 시험 공용 작성**

`src/frontend/m-mdm/tests/dma/erdEdit/grid-fixtures.ts`:

```ts
// FE3(그리드·차이) 시험 공용 — 가짜 편집 문맥·가짜 OASIS·그리기 도우미. 시험 파일이 아니다(vitest 는 *.test.ts 만 모은다).
// FE1 의 erd-fixtures.ts 는 고치지 않고 모델과 fakeEditContext 를 빌려 쓴다(README "화면 내부 계약" 시험 도구).
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { vi } from "vitest";

import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import type { ApplyOutcome, EditRights, ErdEditContext, ErdNotice } from "../../../pages/dma/erdEdit/edit-context";
import type { ErdCommandJson, ErdNamePreview } from "../../../pages/dma/erdEdit/types";
import { MENU_DIAGRAMS, fakeEditContext, menuModel, stateOf } from "./erd-fixtures";

const OK = { ok: true, reason: null };
export const ALL_RIGHTS: EditRights = { model: OK, diagram: OK, confirm: OK, manageEditors: OK, owner: true };
export const READ_ONLY = "확정된 버전이라 모델을 고칠 수 없습니다. [새 버전]으로 DRAFT 를 만드세요.";
export const NO_MODEL_RIGHTS: EditRights = { ...ALL_RIGHTS, model: { ok: false, reason: READ_ONLY } };

export const APPLIED: ApplyOutcome = { ok: true, rev: 4, warnings: [] };
export type Respond = (commands: ErdCommandJson[], label: string) => ApplyOutcome;

/** 가짜 편집 문맥 — 메뉴·오브젝트 두 표(erd-fixtures menuModel), 고른 표 t-1, 모든 권한. apply 는 respond 결과를 돌려준다. */
export function fakeCtx(over: Partial<ErdEditContext> = {}, respond: Respond = () => APPLIED) {
  const apply = vi.fn(async (commands: ErdCommandJson[], label: string): Promise<ApplyOutcome> => respond(commands, label));
  const notify = vi.fn();
  const clearHighlight = vi.fn();
  const nav = { selectTable: vi.fn(), selectColumn: vi.fn(), openTableFind: vi.fn(), openColumnJump: vi.fn() };
  const ctx: ErdEditContext = fakeEditContext(stateOf(menuModel(), MENU_DIAGRAMS), {
    modelId: "mcm", session: "ui-test0001", me: "tester",
    rights: ALL_RIGHTS, diagramId: "d-all", selectedTableId: "t-1",
    apply, clearHighlight, notify, nav, ...over,
  });
  return { ctx, apply, notify, clearHighlight, nav };
}

function notice(over: Partial<ErdNotice>): ErdNotice {
  return { code: "INVALID", label: "", message: "", hint: null, commandIndex: 0, elementId: null, property: null, byRev: null,
    byUserId: null, bySession: null, current: null, mine: null, choices: null, ...over };
}

/** 서버 NEEDS_CHOICE choices(ErdColumnFill 모양 — 후보가 평평하다). 둘째 토막 "설명" 의 후보가 둘이다. */
export const DESC_CHOICES = [
  { seq: 1, surface: "메뉴", status: "MATCHED", candidates: [{ termId: 1, termName: "메뉴", senseNo: 1, engAbbr: "MENU", via: "NAME" }] },
  { seq: 2, surface: "설명", status: "AMBIGUOUS", candidates: [
    { termId: 5, termName: "설명", senseNo: 1, engAbbr: "DESC", via: "NAME" },
    { termId: 6, termName: "설명", senseNo: 2, engAbbr: "EXPL", via: "SYNONYM" },
  ] },
];

export function needsChoice(columnId: string): ApplyOutcome {
  return { ok: false, notice: notice({ code: "NEEDS_CHOICE", label: "토막 고르기", elementId: columnId, property: "phys",
    message: "논리명 '메뉴설명' 의 물리명을 하나로 정할 수 없습니다", hint: "choices 에서 토막별 약어를 골라 phys 를 직접 넣으세요",
    choices: DESC_CHOICES }) };
}

export function conflict(elementId: string, property: string): ApplyOutcome {
  return { ok: false, notice: notice({ code: "CONFLICT", label: "충돌", elementId, property, byRev: 5, byUserId: "41000207",
    bySession: "ui-other001", message: "다른 세션이 먼저 바꾼 값입니다", current: "역할설명" }) };
}

/** compare(kind 없음) 응답 — README ErdNamePreview 모양. 토막은 "메뉴"·"명" 둘이고 모두 MATCHED 다. */
export function previewOf(phys: string, over: Partial<ErdNamePreview> = {}): ErdNamePreview {
  const term = (termId: number, termName: string, engAbbr: string) => ({ termId, termName, engAbbr });
  return {
    physName: phys, logicalName: "메뉴 명", recommendedDomainId: null, status: "NEW",
    tokens: [
      { seq: 1, surface: "메뉴", status: "MATCHED", selected: term(1, "메뉴", "MENU"), abbr: "MENU", candidates: [{ term: term(1, "메뉴", "MENU"), via: "NAME" }] },
      { seq: 2, surface: "명", status: "MATCHED", selected: term(2, "명", "NM"), abbr: "NM", candidates: [{ term: term(2, "명", "NM"), via: "NAME" }] },
    ],
    ...over,
  };
}

export interface OasisCall { service: string; action: string; params: Record<string, unknown> }
type Handler = (params: Record<string, unknown>) => unknown;

/** fetch 가짜 — `/api/mdm/oasis/{service}/{action}` 을 handlers["service/action"] 로 답한다. 값은 data.result 로 싼다. */
export function stubOasis(handlers: Record<string, Handler>): OasisCall[] {
  const calls: OasisCall[] = [];
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u === "/api/auth/me") return new Response(JSON.stringify({ user: { id: "tester" } }), { status: 200 });
    const m = /^\/api\/mdm\/oasis\/([^/]+)\/([^/?]+)/.exec(u);
    if (!m) return new Response("{}", { status: 401 });
    const params = (JSON.parse(String(init?.body ?? "{}")).params ?? {}) as Record<string, unknown>;
    calls.push({ service: m[1], action: m[2], params });
    const h = handlers[`${m[1]}/${m[2]}`];
    const result = h ? await h(params) : {};
    return new Response(JSON.stringify({ meta: { success: true }, data: { result } }), { status: 200 });
  }) as typeof fetch;
  return calls;
}

/** Node 22+ 의 전역 localStorage 가 happy-dom 것을 가려 callOasis 의 토큰 읽기가 던진다(page-render.test 와 같은 갈음). */
export function installStorage(): void {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
}

export interface Mounted { host: HTMLDivElement; rerender(node: ReactElement): Promise<void>; unmount(): void }

export async function mount(node: ReactElement): Promise<Mounted> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const draw = async (n: ReactElement) => {
    await act(async () => {
      root.render(createElement(DmesUiProvider, null, n));
    });
  };
  await draw(node);
  return { host, rerender: draw, unmount: () => { act(() => root.unmount()); host.remove(); } };
}

export const inDoc = <T extends HTMLElement = HTMLElement>(id: string): T | null => document.querySelector<T>(`[data-testid="${id}"]`);

export async function key(el: Element, init: KeyboardEventInit): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
}

export async function wait(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

/** 포털(body)의 [확인] 단추 — 공용 확인창(useMessage confirm). */
export function confirmButton(): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim() === "확인");
}
```

- [ ] **Step 2: 실패하는 시험 작성 — 순수 함수**

`src/frontend/m-mdm/tests/dma/erdEdit/grid-edit.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { typeText } from "../../../pages/dma/erdEdit/canvas/erd-geometry";
import {
  GRID_COLUMNS, cellEditCommand, columnRows, gridKeyAction, gridRows, highlightErrors, orderChangeCommand, parseTypeText, pendingKeyOf,
  type GridKey,
} from "../../../pages/dma/erdEdit/panels/ColumnGrid";
import { addColumnBatch, newElementId, withPhys } from "../../../pages/dma/erdEdit/panels/GridInputBar";
import { composePhys, toTokenChoices } from "../../../pages/dma/erdEdit/panels/TokenChoiceModal";
import { menuModel } from "./erd-fixtures";
import { DESC_CHOICES, previewOf } from "./grid-fixtures";

describe("그리드 칸 정의", () => {
  it("열 최소 폭 합은 오른쪽 칸 400px 에서 세로 스크롤바 몫 17px 을 뺀 383px 이하다(Local-Rules §30)", () => {
    const sum = GRID_COLUMNS.reduce((n, c) => n + (c.minWidth ?? Number(c.width)), 0);
    expect(sum).toBeLessThanOrEqual(383);
    expect(GRID_COLUMNS.filter((c) => c.editable).map((c) => c.key)).toEqual(["logical", "phys", "type", "nn"]);
  });
});

describe("편집 행", () => {
  it("대기 중 행은 pending 이고 고칠 수 없다. 권한이 없으면 모든 행을 고칠 수 없다. 단계 1 행 모양은 그대로다", () => {
    const rows = gridRows(menuModel(), "t-1", null, new Set(["c-2"]), true);
    expect(rows.map((r) => [r.id, r.pending, r.editable])).toEqual([["c-1", false, true], ["c-2", true, false], ["c-4", false, true]]);
    expect(gridRows(menuModel(), "t-1", null, new Set(), false).every((r) => !r.editable)).toBe(true);
    expect(Object.keys(columnRows(menuModel(), "t-1", null)[0]).sort()).toEqual(["domain", "id", "key", "logical", "nn", "phys", "status", "type"]);
  });

  it("pendingKeyOf 는 이 표의 대기 컬럼 id 만 정렬해 잇는다(새 Set 이어도 같은 글이면 행을 다시 만들지 않는다)", () => {
    expect(pendingKeyOf(menuModel(), "t-1", new Set(["c-4", "c-3", "c-1", "r-1"]))).toBe("c-1,c-4");
    expect(pendingKeyOf(menuModel(), "t-1", new Set())).toBe("");
    expect(pendingKeyOf(menuModel(), null, new Set(["c-1"]))).toBe("");
  });
});

describe("칸 편집 → 명령(스펙 4.4: 칸을 떠날 때 한 번)", () => {
  const m = menuModel();

  it("논리명·물리명·타입·NN 은 updateColumn 한 건이고, 같은 값이면 보내지 않는다", () => {
    expect(cellEditCommand(m, "c-4", "logical", " 메뉴이름 ")).toEqual({ command: { op: "updateColumn", id: "c-4", set: { logical: "메뉴이름" } } });
    expect(cellEditCommand(m, "c-4", "logical", "메뉴명")).toBeNull();
    expect(cellEditCommand(m, "c-4", "phys", "menu_name")).toEqual({ command: { op: "updateColumn", id: "c-4", set: { phys: "MENU_NAME" } } });
    expect(cellEditCommand(m, "c-4", "type", "varchar2( 300 )")).toEqual({
      command: { op: "updateColumn", id: "c-4", set: { dataType: "VARCHAR2", length: 300, scale: null } },
    });
    expect(cellEditCommand(m, "c-4", "type", "VARCHAR2(200)")).toBeNull();
    expect(cellEditCommand(m, "c-4", "nn", "Y")).toEqual({ command: { op: "updateColumn", id: "c-4", set: { notNull: true } } });
    expect(cellEditCommand(m, "c-1", "nn", "Y")).toBeNull();
    expect(cellEditCommand(m, "c-1", "nn", "N")).toEqual({ command: { op: "updateColumn", id: "c-1", set: { notNull: false } } });
    expect(cellEditCommand(m, "c-4", "domain", "아이디")).toBeNull();
  });

  it("틀린 값은 명령 대신 오류 문구다", () => {
    expect(cellEditCommand(m, "c-4", "logical", "  ")).toEqual({ error: "논리명을 비울 수 없습니다." });
    expect(cellEditCommand(m, "c-4", "phys", "1MENU")).toEqual({ error: "물리명은 영문 대문자로 시작하고 영문 대문자·숫자·_ 만 씁니다(128자까지)." });
    expect(cellEditCommand(m, "c-4", "phys", "menu_id")).toEqual({ error: "같은 표에 MENU_ID 컬럼이 있습니다." });
    expect(cellEditCommand(m, "c-4", "type", "VARCHAR2(")).toEqual({ error: "타입은 VARCHAR2(50)·NUMBER(10,2)·DATE·TIMESTAMP(6) 처럼 씁니다." });
    expect(cellEditCommand(m, "c-9", "logical", "x")).toEqual({ error: "컬럼이 없습니다. 다른 세션이 지웠을 수 있습니다." });
  });

  it("타입 글은 typeText 와 왕복한다", () => {
    for (const t of ["VARCHAR2(50)", "NUMBER(10,2)", "NUMBER", "DATE", "TIMESTAMP(6)", "CLOB", "NUMBER(38,0)"]) {
      expect(typeText(parseTypeText(t)!)).toBe(t);
    }
    expect(parseTypeText("timestamp(3)")).toEqual({ dataType: "TIMESTAMP(3)", length: null, scale: null });
    expect(parseTypeText(" ")).toEqual({ dataType: null, length: null, scale: null });
    expect(parseTypeText("VARCHAR2(a)")).toBeNull();
    expect(parseTypeText("NUMBER(10,2,1)")).toBeNull();
  });

  it("행 끌기는 옮긴 한 컬럼의 moveColumn 이다. 둘 이상이 움직였거나 목록이 다르면 null", () => {
    expect(orderChangeCommand(["a", "b", "c"], ["b", "c", "a"])).toEqual({ op: "moveColumn", id: "a", position: 2 });
    expect(orderChangeCommand(["a", "b", "c"], ["c", "a", "b"])).toEqual({ op: "moveColumn", id: "c", position: 0 });
    expect(orderChangeCommand(["a", "b", "c"], ["a", "c", "b"])).toEqual({ op: "moveColumn", id: "b", position: 2 });
    expect(orderChangeCommand(["a", "b", "c"], ["a", "b", "c"])).toBeNull();
    expect(orderChangeCommand(["a", "b", "c", "d"], ["b", "a", "d", "c"])).toBeNull();
    expect(orderChangeCommand(["a", "b"], ["a", "b", "x"])).toBeNull();
  });
});

describe("그리드 키(S2-6·S2-27)", () => {
  const k = (o: Partial<GridKey>) => gridKeyAction({ key: "Enter", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
    isComposing: false, keyCode: 13, inEditor: false, ...o });

  it("Ctrl/⌘+Enter 는 추가, Shift 를 더하면 PK 추가. 조합 중·Alt·칸 편집 중·다른 키는 넘긴다", () => {
    expect(k({ ctrlKey: true })).toBe("add");
    expect(k({ metaKey: true })).toBe("add");
    expect(k({ ctrlKey: true, shiftKey: true })).toBe("addPk");
    expect(k({})).toBeNull();
    expect(k({ ctrlKey: true, altKey: true })).toBeNull();
    expect(k({ ctrlKey: true, isComposing: true })).toBeNull();
    expect(k({ ctrlKey: true, keyCode: 229 })).toBeNull();
    expect(k({ ctrlKey: true, inEditor: true })).toBeNull();
    expect(k({ ctrlKey: true, key: "a" })).toBeNull();
  });
});

describe("거절 칸 강조", () => {
  it("마지막 거절 칸이 이 표의 컬럼이면 그 칸에 서버 문구를 단다. 아니면 같은 빈 배열이다", () => {
    const rows = [{ id: "c-1" }, { id: "c-4" }];
    const h = { code: "CONFLICT" as const, elementId: "c-4", property: "logical", message: "다른 세션이 먼저 바꾼 값입니다", mine: "메뉴이름" };
    expect(highlightErrors(h, rows)).toEqual([{ rowKey: "c-4", field: "logical", message: "다른 세션이 먼저 바꾼 값입니다" }]);
    expect(highlightErrors({ ...h, property: "length" }, rows)[0].field).toBe("type");
    expect(highlightErrors({ ...h, property: "domainId" }, rows)[0].field).toBe("domain");
    expect(highlightErrors({ ...h, property: null }, rows)[0].field).toBe("logical");
    expect(highlightErrors({ ...h, elementId: "c-3" }, rows)).toBe(highlightErrors(null, rows));
    expect(highlightErrors(null, rows)).toEqual([]);
  });
});

describe("컬럼 추가 묶음", () => {
  it("새 컬럼은 화면이 정한 c- id 로 논리명만 보낸다. PK 추가는 마지막 PK 다음 자리와 setPrimaryKey 를 한 묶음에 넣는다", () => {
    const m = menuModel();
    expect(addColumnBatch(m, "t-1", { id: "c-new", logical: "메뉴설명" }, false)).toEqual([
      { op: "addColumn", id: "c-new", table: "t-1", logical: "메뉴설명" },
    ]);
    expect(addColumnBatch(m, "t-1", { id: "c-new", logical: "메뉴설명" }, true)).toEqual([
      { op: "addColumn", id: "c-new", table: "t-1", logical: "메뉴설명", position: 1 },
      { op: "setPrimaryKey", table: "t-1", columns: ["c-1", "c-new"] },
    ]);
    const noPk = menuModel();
    delete noPk.keys["k-1"];
    expect(addColumnBatch(noPk, "t-1", { id: "c-new", logical: "x" }, true)).toEqual([
      { op: "addColumn", id: "c-new", table: "t-1", logical: "x", position: 0 },
      { op: "setPrimaryKey", table: "t-1", columns: ["c-new"] },
    ]);
  });

  it("withPhys 는 같은 id 의 addColumn 에만 phys 와 (비어 있으면) domainId 를 넣고 다른 명령은 같은 참조로 둔다", () => {
    const batch = addColumnBatch(menuModel(), "t-1", { id: "c-new", logical: "메뉴설명" }, true);
    const out = withPhys(batch, "c-new", "MENU_DESC", 7);
    expect(out[0]).toEqual({ ...batch[0], phys: "MENU_DESC", domainId: 7 });
    expect(out[1]).toBe(batch[1]);
    expect(withPhys(batch, "c-new", "MENU_DESC", null)[0]).not.toHaveProperty("domainId");
  });

  it("newElementId 는 서버 ErdIds 규칙(^[a-z]-[0-9a-zA-Z-]{1,48}$)을 지키고 부를 때마다 다르다", () => {
    const a = newElementId("c");
    expect(a).toMatch(/^c-[0-9a-zA-Z-]{1,48}$/);
    expect(newElementId("c")).not.toBe(a);
  });
});

describe("토막 고르기", () => {
  it("서버 NEEDS_CHOICE 의 평평한 후보와 미리보기의 term 후보를 같은 모양으로 푼다", () => {
    expect(toTokenChoices(DESC_CHOICES)).toEqual([
      { seq: 1, surface: "메뉴", status: "MATCHED", current: "MENU", candidates: [{ abbr: "MENU", label: "MENU · 메뉴" }] },
      { seq: 2, surface: "설명", status: "AMBIGUOUS", current: "",
        candidates: [{ abbr: "DESC", label: "DESC · 설명" }, { abbr: "EXPL", label: "EXPL · 설명" }] },
    ]);
    expect(toTokenChoices(previewOf("MENU_NM").tokens).map((t) => t.current)).toEqual(["MENU", "NM"]);
    expect(toTokenChoices([{ seq: 1, surface: "뭐", status: "UNKNOWN", candidates: [] }])).toEqual([
      { seq: 1, surface: "뭐", status: "UNKNOWN", current: "", candidates: [] },
    ]);
    expect(toTokenChoices(null)).toEqual([]);
  });

  it("고른 약어를 대문자로 _ 로 잇고 Oracle 이름 규칙을 지킬 때만 물리명이다", () => {
    expect(composePhys(["menu", "DESC"])).toBe("MENU_DESC");
    expect(composePhys(["MENU", ""])).toBeNull();
    expect(composePhys(["1X", "Y"])).toBeNull();
    expect(composePhys(["MENU", "DE SC"])).toBeNull();
    expect(composePhys([])).toBeNull();
  });
});
```

- [ ] **Step 3: 실패하는 시험 작성 — 그리드·입력 칸 그리기**

`src/frontend/m-mdm/tests/dma/erdEdit/column-grid.test.ts`:

```ts
/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ErdEditContext } from "../../../pages/dma/erdEdit/edit-context";
import { ColumnGrid, requestColumnFocus } from "../../../pages/dma/erdEdit/panels/ColumnGrid";
import { flush, selectValue, settleGrid, typeInto } from "../../dme/helpers/render";
import {
  APPLIED, NO_MODEL_RIGHTS, READ_ONLY, conflict, fakeCtx, inDoc, installStorage, key, mount, needsChoice, previewOf, stubOasis, wait,
  type Mounted,
} from "./grid-fixtures";

const originalFetch = globalThis.fetch;
let view: Mounted | null = null;

beforeEach(() => installStorage());
afterEach(() => {
  view?.unmount();
  view = null;
  globalThis.fetch = originalFetch;
  vi.unstubAllGlobals();
});

async function open(ctx: ErdEditContext) {
  view = await mount(createElement(ColumnGrid, { ctx, tableId: "t-1" }));
  await settleGrid(inDoc("erd-columns")!);
}
const input = () => inDoc<HTMLInputElement>("erd-grid-input")!;
const cell = (rowId: string, colId: string) => view!.host.querySelector<HTMLElement>(`.ag-row[row-id="${rowId}"] [col-id="${colId}"]`);

/**
 * 칸 편집기를 연다 — ag-grid 기본(더블클릭, 안 되면 초점 칸의 F2). happy-dom 에서 어느 쪽이 도는지는 Step 10 이 정한다.
 * 둘 다 편집기를 열지 못하면 실패 문구로 알린다.
 */
async function openEditor(rowId: string, colId: string): Promise<HTMLInputElement> {
  await act(async () => {
    cell(rowId, colId)!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await flush();
  let editor = cell(rowId, colId)!.querySelector("input");
  if (!editor) {
    await act(async () => {
      cell(rowId, colId)!.focus();
      cell(rowId, colId)!.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
    });
    await flush();
    editor = cell(rowId, colId)!.querySelector("input");
  }
  expect(editor, "더블클릭·F2 둘 다 칸 편집기를 열지 못했다(Step 10)").not.toBeNull();
  return editor!;
}

describe("컬럼 그리드 편집", () => {
  it("그리드에서 Ctrl+Enter 는 입력 칸으로 초점을 옮기고, 논리명을 넣고 Enter 하면 addColumn 한 건을 보낸다", async () => {
    stubOasis({ "erdEdit/compare": () => previewOf("MENU_DESC") });
    const f = fakeCtx();
    await open(f.ctx);
    await key(inDoc("erd-columns")!, { key: "Enter", ctrlKey: true });
    expect(document.activeElement).toBe(input());
    expect(f.apply).not.toHaveBeenCalled();
    await typeInto(input(), "메뉴설명");
    await key(input(), { key: "Enter" });
    await flush();
    expect(f.apply).toHaveBeenCalledTimes(1);
    const [commands, label] = f.apply.mock.calls[0];
    expect(label).toBe("컬럼 추가");
    expect(commands).toEqual([{ op: "addColumn", id: expect.stringMatching(/^c-/), table: "t-1", logical: "메뉴설명" }]);
    expect(input().value).toBe("");
    expect(document.activeElement).toBe(input()); // 이어서 다음 컬럼을 넣는다
  });

  it("Ctrl+Shift+Enter 는 [addColumn, setPrimaryKey] 한 묶음을 같은 새 id 로 보낸다", async () => {
    stubOasis({ "erdEdit/compare": () => previewOf("MENU_SEQ") });
    const f = fakeCtx();
    await open(f.ctx);
    await typeInto(input(), "메뉴순번");
    await key(input(), { key: "Enter", ctrlKey: true, shiftKey: true });
    await flush();
    const [commands, label] = f.apply.mock.calls[0];
    expect(label).toBe("PK 컬럼 추가");
    expect(commands).toEqual([
      { op: "addColumn", id: expect.stringMatching(/^c-/), table: "t-1", logical: "메뉴순번", position: 1 },
      { op: "setPrimaryKey", table: "t-1", columns: ["c-1", commands[0].id] },
    ]);
  });

  it("NEEDS_CHOICE 면 토막 고르기 창을 띄우고, 고른 약어로 phys·추천 도메인을 넣어 같은 묶음을 다시 보낸다", async () => {
    const calls = stubOasis({
      "erdEdit/compare": (p) => (p.phys === "MENU_EXPL" ? previewOf("MENU_EXPL", { recommendedDomainId: 7, status: "OK" }) : previewOf("MENU_DESC")),
    });
    let n = 0;
    const f = fakeCtx({}, (commands) => (n++ === 0 ? needsChoice(String(commands[0].id)) : APPLIED));
    await open(f.ctx);
    await typeInto(input(), "메뉴설명");
    await key(input(), { key: "Enter" });
    await flush();
    expect(inDoc("erd-token-choice")).not.toBeNull();
    expect(inDoc<HTMLButtonElement>("erd-token-apply")!.disabled).toBe(true); // 둘째 토막을 아직 고르지 않았다
    await selectValue(inDoc<HTMLSelectElement>("erd-token-2")!, "EXPL");
    expect(inDoc("erd-token-phys")!.textContent).toBe("MENU_EXPL");
    await act(async () => inDoc<HTMLButtonElement>("erd-token-apply")!.click());
    await flush();
    await flush();
    expect(calls.some((c) => c.action === "compare" && c.params.phys === "MENU_EXPL")).toBe(true);
    expect(f.apply).toHaveBeenCalledTimes(2);
    const first = f.apply.mock.calls[0][0];
    expect(f.apply.mock.calls[1][0]).toEqual([{ ...first[0], phys: "MENU_EXPL", domainId: 7 }]);
    expect(inDoc("erd-token-choice")).toBeNull();
  });

  it("미리보기는 입력이 300ms 멈춘 뒤 한 번 부르고, 늦게 온 옛 응답은 버린다", async () => {
    let release: (() => void) | null = null;
    const calls = stubOasis({
      "erdEdit/compare": (p) =>
        p.logical === "메뉴"
          ? new Promise((r) => { release = () => r(previewOf("MENU", { logicalName: "메뉴" })); })
          : previewOf("MENU_NM"),
    });
    await open(fakeCtx().ctx);
    const compares = () => calls.filter((c) => c.action === "compare").map((c) => c.params.logical);
    await typeInto(input(), "메");
    await wait(100);
    await typeInto(input(), "메뉴");
    await wait(400);
    expect(compares()).toEqual(["메뉴"]);
    await typeInto(input(), "메뉴명");
    await wait(400);
    expect(compares()).toEqual(["메뉴", "메뉴명"]);
    expect(inDoc("erd-grid-phys")!.textContent).toBe("MENU_NM");
    await act(async () => release!());
    await wait(20);
    expect(inDoc("erd-grid-phys")!.textContent).toBe("MENU_NM");
  });

  it("고른 컬럼의 논리명을 바꾸면서 미리보기 물리명도 함께 바꾼다", async () => {
    stubOasis({ "erdEdit/compare": () => previewOf("MENU_NAME", { logicalName: "메뉴 이름" }) });
    const f = fakeCtx();
    await open(f.ctx);
    await act(async () => requestColumnFocus("c-4"));
    await flush();
    expect(inDoc("erd-grid-target")!.textContent).toBe("MENU_NM");
    await typeInto(input(), "메뉴이름");
    await wait(400);
    await act(async () => inDoc<HTMLButtonElement>("erd-grid-rename")!.click());
    await flush();
    expect(f.apply).toHaveBeenCalledWith([{ op: "updateColumn", id: "c-4", set: { logical: "메뉴이름", phys: "MENU_NAME" } }], "논리명 바꾸기");
  });

  it("도메인 칸에 도메인명을 넣고 Enter 하면 룰 편집 도메인 검색으로 찾아 applyDomain 을 보낸다", async () => {
    const calls = stubOasis({
      "ruleEdit/search": () => ({ rows: [{ domainId: 7, stdName: "NM_100", domainName: "이름100", dataType: "STRING", length: 100 }] }),
    });
    const f = fakeCtx();
    await open(f.ctx);
    await act(async () => requestColumnFocus("c-4"));
    await flush();
    const dom = inDoc<HTMLInputElement>("erd-grid-domain")!;
    await typeInto(dom, "이름100");
    await key(dom, { key: "Enter" });
    await flush();
    await flush();
    expect(calls.find((c) => c.service === "ruleEdit")?.params).toEqual({ target: "DOMAIN", keyword: "이름100" });
    expect(f.apply).toHaveBeenCalledWith([{ op: "applyDomain", id: "c-4", domainId: 7 }], "도메인 적용");
  });

  it("모델을 고칠 수 없으면 입력 칸을 막고 이유를 보이며, Ctrl+Enter 가 아무것도 보내지 않는다", async () => {
    stubOasis({});
    const f = fakeCtx({ rights: NO_MODEL_RIGHTS });
    await open(f.ctx);
    expect(input().disabled).toBe(true);
    expect(inDoc("erd-grid-reason")!.textContent).toBe(READ_ONLY);
    await key(inDoc("erd-columns")!, { key: "Enter", ctrlKey: true });
    expect(f.apply).not.toHaveBeenCalled();
  });

  it("거절된 칸 편집은 원래 값으로 돌아오고, 마지막 거절 칸에 서버 문구를 단다", async () => {
    stubOasis({});
    const f = fakeCtx({}, () => conflict("c-4", "logical"));
    await open(f.ctx);
    const editor = await openEditor("c-4", "logical");
    await typeInto(editor, "메뉴이름");
    await key(editor, { key: "Enter" });
    await flush();
    await flush();
    expect(f.apply).toHaveBeenCalledWith([{ op: "updateColumn", id: "c-4", set: { logical: "메뉴이름" } }], "논리명 편집");
    expect(cell("c-4", "logical")!.textContent).toBe("메뉴명");
    // FE1 의 apply 는 거절 칸을 ctx.highlight 로 올린다 — 그 문맥으로 다시 그린다.
    await view!.rerender(createElement(ColumnGrid, {
      ctx: { ...f.ctx, highlight: { code: "CONFLICT", elementId: "c-4", property: "logical", message: "다른 세션이 먼저 바꾼 값입니다", mine: "메뉴이름" } },
      tableId: "t-1",
    }));
    await flush();
    expect(cell("c-4", "logical")!.classList.contains("cell-mdm-invalid")).toBe(true);
  });
});
```

- [ ] **Step 4: 실패하는 시험 작성 — 컬럼 점프**

`src/frontend/m-mdm/tests/dma/erdEdit/column-jump.test.ts`:

```ts
/** @vitest-environment happy-dom */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { subscribeColumnFocus } from "../../../pages/dma/erdEdit/panels/ColumnGrid";
import { ColumnJump, JUMP_LIMIT, jumpRows } from "../../../pages/dma/erdEdit/panels/ColumnJump";
import { flush, typeInto } from "../../dme/helpers/render";
import { bigState, menuModel } from "./erd-fixtures";
import { fakeCtx, inDoc, installStorage, key, mount, stubOasis, type Mounted } from "./grid-fixtures";

const originalFetch = globalThis.fetch;
let view: Mounted | null = null;

beforeEach(() => {
  installStorage();
  stubOasis({});
});
afterEach(() => {
  view?.unmount();
  view = null;
  globalThis.fetch = originalFetch;
  vi.unstubAllGlobals();
});

describe("컬럼 점프(Ctrl/⌘+O·Alt+O)", () => {
  it("고른 표의 컬럼만, 표가 없으면 모든 표를 물리명 순으로 찾고, 상한을 넘으면 남은 수를 센다", () => {
    const m = menuModel();
    expect(jumpRows(m, "t-1", "메뉴").rows.map((r) => r.id)).toEqual(["c-1", "c-4"]);
    expect(jumpRows(m, "t-1", "object").rows.map((r) => r.id)).toEqual(["c-2"]);
    expect(jumpRows(m, null, "OBJECT_ID").rows.map((r) => [r.table, r.column])).toEqual([
      ["TB_MCM_SEC_MENU", "OBJECT_ID"], ["TB_MCM_SEC_OBJ", "OBJECT_ID"],
    ]);
    const big = jumpRows(bigState(3, 100).model, null, "");
    expect(big.rows).toHaveLength(JUMP_LIMIT);
    expect(big.more).toBe(300 - JUMP_LIMIT);
  });

  it("입력 칸에서 ↓ 로 고르고 Enter 하면 그 컬럼으로 가고, 그리드에 알리고, 창을 닫는다", async () => {
    const f = fakeCtx();
    const onClose = vi.fn();
    const heard: string[] = [];
    const off = subscribeColumnFocus((id) => heard.push(id));
    view = await mount(createElement(ColumnJump, { ctx: f.ctx, opened: true, onClose }));
    await flush();
    const box = inDoc<HTMLInputElement>("erd-jump-input")!;
    await typeInto(box, "메뉴");
    await key(box, { key: "ArrowDown" });
    await key(box, { key: "Enter" });
    off();
    expect(f.nav.selectColumn).toHaveBeenCalledWith("c-4");
    expect(heard).toEqual(["c-4"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("닫혀 있으면 아무것도 그리지 않는다", async () => {
    view = await mount(createElement(ColumnJump, { ctx: fakeCtx().ctx, opened: false, onClose: () => {} }));
    expect(inDoc("erd-jump")).toBeNull();
  });
});
```

- [ ] **Step 5: 시험이 실패하는지 확인**

Run: `cd src/frontend && pnpm --filter "@dk-oasis/m-mdm^..." build && pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/grid-edit.test.ts tests/dma/erdEdit/column-grid.test.ts tests/dma/erdEdit/column-jump.test.ts`
Expected: FAIL.
- `grid-edit.test.ts` 는 `Failed to resolve import "../../../pages/dma/erdEdit/panels/GridInputBar"`(그리고 `panels/TokenChoiceModal`)로 파일 전체가 실패한다.
- `column-grid.test.ts` 는 Task 9 의 `ColumnGrid.tsx` 만 가져오므로 불러오기는 된다. 실행에서 실패한다. Ctrl+Enter·PK·NEEDS_CHOICE·읽기 전용 시험은 `erd-grid-input` 이 없어 `Cannot read properties of null` 로, 논리명 바꾸기·도메인 시험은 `requestColumnFocus is not a function` 으로, 미리보기 시험은 `typeInto` 대상이 null 이라 실패한다. 거절 칸 편집 시험은 `apply` 가 불리지 않아(`onCellValueChanged` 없음) 실패한다.
- `column-jump.test.ts` 는 Task 9 의 빈 `ColumnJump.tsx` 에 `jumpRows`·`JUMP_LIMIT` 이 없고, `ColumnGrid.tsx` 에 `subscribeColumnFocus` 가 없어서 `jumpRows is not a function`·`subscribeColumnFocus is not a function` 으로 실패한다.

- [ ] **Step 6: 구현 — `panels/TokenChoiceModal.tsx`**

`src/frontend/m-mdm/pages/dma/erdEdit/panels/TokenChoiceModal.tsx`:

```tsx
"use client";

/**
 * 물리명 토막 고르기 창(스펙 4.1 NEEDS_CHOICE) — 논리명의 토막마다 약어를 하나씩 골라 물리명을 만든다.
 * 후보는 두 모양으로 온다. 서버 거절(ErdColumnFill)의 choices 는 후보가 평평하다({termId, termName, engAbbr, via}).
 * 미리보기(compare)의 tokens 는 후보가 {term:{…}, via} 다. toTokenChoices 가 둘을 같은 모양으로 푼다.
 * 후보가 없는 토막(NO_ABBR·UNKNOWN)은 약어를 직접 넣는다. 물리명은 약어를 대문자로 `_` 로 잇고(ColumnNameComposer.forward 와 같다),
 * Oracle 이름 규칙(ErdIds)을 지킬 때만 [적용] 을 켠다.
 */
import { useEffect, useState, type CSSProperties } from "react";

import { Badge, Button, Input, Select, type BadgeTone } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

/** 서버 ErdIds.ORACLE_ID 와 같은 규칙. */
export const ORACLE_ID_RE = /^[A-Z][A-Z0-9_$#]{0,127}$/;
const ABBR_RE = /^[A-Z0-9_$#]+$/;

export interface TokenChoice {
  seq: number;
  surface: string;
  status: string;
  /** 처음 고른 약어 — 미리보기의 selected, 아니면 MATCHED·SYNONYM 의 첫 후보, 아니면 빈 글. */
  current: string;
  candidates: { abbr: string; label: string }[];
}

export const TOKEN_STATUS_LABEL: Record<string, string> = {
  MATCHED: "일치", SYNONYM: "동의어", AMBIGUOUS: "후보 여럿", NO_ABBR: "약어 없음", UNKNOWN: "사전 없음",
};

export function tokenTone(status: string): BadgeTone {
  if (status === "MATCHED" || status === "SYNONYM") return "success";
  return status === "AMBIGUOUS" ? "warning" : "danger";
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export function toTokenChoices(raw: unknown): TokenChoice[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, i) => {
    const t = obj(item);
    const candidates: TokenChoice["candidates"] = [];
    for (const c of Array.isArray(t.candidates) ? t.candidates : []) {
      const co = obj(c);
      const term = co.term ? obj(co.term) : co;
      const abbr = typeof term.engAbbr === "string" ? term.engAbbr.trim().toUpperCase() : "";
      if (abbr === "" || candidates.some((x) => x.abbr === abbr)) continue;
      candidates.push({ abbr, label: `${abbr} · ${String(term.termName ?? "")}` });
    }
    const status = String(t.status ?? "UNKNOWN");
    const selected = obj(t.selected).engAbbr;
    const fixed = status === "MATCHED" || status === "SYNONYM";
    const current = typeof selected === "string" && selected !== "" ? selected.toUpperCase() : fixed && candidates[0] ? candidates[0].abbr : "";
    return { seq: typeof t.seq === "number" ? t.seq : i + 1, surface: String(t.surface ?? ""), status, current, candidates };
  });
}

export function composePhys(picks: readonly string[]): string | null {
  if (picks.length === 0) return null;
  const parts = picks.map((p) => p.trim().toUpperCase());
  if (parts.some((p) => !ABBR_RE.test(p))) return null;
  const phys = parts.join("_");
  return ORACLE_ID_RE.test(phys) ? phys : null;
}

const BODY: CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--spacing-sm)" };
const ROW: CSSProperties = { display: "grid", gridTemplateColumns: "160px minmax(0, 1fr)", alignItems: "center", gap: "var(--spacing-sm)" };
const MUTED: CSSProperties = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };

export interface TokenChoiceModalProps {
  opened: boolean;
  logical: string;
  tokens: TokenChoice[];
  onPick(phys: string): void;
  onClose(): void;
}

export function TokenChoiceModal({ opened, logical, tokens, onPick, onClose }: TokenChoiceModalProps) {
  const [picks, setPicks] = useState<string[]>(() => tokens.map((t) => t.current));
  useEffect(() => {
    setPicks(tokens.map((t) => t.current));
  }, [tokens]);
  const phys = composePhys(picks);
  const setAt = (i: number, v: string) => setPicks((cur) => cur.map((x, j) => (j === i ? v.toUpperCase() : x)));
  return (
    <Modal open={opened} title="물리명 토막 고르기" size="md" onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" data-testid="erd-token-apply" disabled={phys === null} onClick={() => phys && onPick(phys)}>
            적용
          </Button>
        </>
      }>
      {opened && (
        <div data-testid="erd-token-choice" style={BODY}>
          <div style={MUTED}>논리명 「{logical}」 의 토막마다 약어를 고르세요. 고른 약어를 _ 로 이어 물리명을 만듭니다.</div>
          {tokens.map((t, i) => (
            <div key={`${t.seq}-${i}`} style={ROW}>
              <span>
                {t.surface} <Badge label={TOKEN_STATUS_LABEL[t.status] ?? t.status} tone={tokenTone(t.status)} />
              </span>
              {t.candidates.length > 0 ? (
                <Select data-testid={`erd-token-${t.seq}`} aria-label={`${t.surface} 약어`} value={picks[i] ?? ""} placeholder="약어 고르기"
                  options={t.candidates.map((c) => ({ value: c.abbr, label: c.label }))} onChange={(v) => setAt(i, v)} />
              ) : (
                <Input data-testid={`erd-token-input-${t.seq}`} aria-label={`${t.surface} 약어`} value={picks[i] ?? ""}
                  placeholder="약어 입력(영문 대문자)" onChange={(v) => setAt(i, v)} />
              )}
            </div>
          ))}
          <div>
            물리명: <span className="erd-mono" data-testid="erd-token-phys">{phys ?? "약어를 모두 고르세요"}</span>
          </div>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 7: 구현 — `panels/GridInputBar.tsx`**

`src/frontend/m-mdm/pages/dma/erdEdit/panels/GridInputBar.tsx`:

```tsx
"use client";

/**
 * 컬럼 그리드 아래 입력 칸(S2-6) — 새 컬럼 논리명·논리명 미리보기(300ms)·고른 컬럼의 논리명 바꾸기·도메인 적용.
 * shared AgDataGrid 의 칸 편집기는 글자마다 콜백을 주지 않으므로, 입력 중 미리보기가 필요한 입력을 그리드 밖에 둔다(조사 A E4).
 * - Enter(그리드·입력 칸의 Ctrl/⌘+Enter 와 같다): 새 컬럼. 논리명만 보내고 물리명·도메인은 서버가 채운다(스펙 4.1).
 *   Ctrl/⌘+Shift+Enter 로 연 경우 PK 컬럼이다. 새 컬럼 id 는 화면이 정한다(같은 묶음의 setPrimaryKey 가 가리킨다).
 * - 서버가 NEEDS_CHOICE 로 거절하면 토막 고르기 창을 띄우고, 고른 물리명과 그 추천 도메인을 넣어 같은 묶음을 다시 보낸다.
 * - 미리보기는 입력이 300ms 멈춘 뒤 한 번 부르고, 요청 순번으로 늦은 응답을 버린다(Local-Rules §20·§34·§37).
 * - 도메인 찾기는 erdEdit 에 목록 액션이 없어 컬럼 사전 화면(columnMng)처럼 룰 편집의 도메인 검색(target=DOMAIN)을 쓴다.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from "react";

import { Badge, Button, Checkbox, Input } from "@dk-oasis/shared/form";
import { callOasisAt, type OasisCallOptions } from "@dk-oasis/shared/http";

import { DomainField, type DomainRow } from "@/domain";
import { MDM_OASIS_BASE, plainError } from "@/oasis-screen";

import { previewName } from "../api";
import type { ErdEditContext } from "../edit-context";
import type { ErdColumnStatus, ErdCommandJson, ErdModelJson, ErdNamePreview } from "../types";
import { TOKEN_STATUS_LABEL, TokenChoiceModal, toTokenChoices, tokenTone, type TokenChoice } from "./TokenChoiceModal";

export type AddKind = "add" | "addPk";
/** ColumnGrid 의 그리드 키가 부른다. 글자가 있으면 보내고, 없으면 입력 칸으로 초점을 옮긴다. */
export interface BarHandle { trigger(kind: AddKind): void }

export const PREVIEW_DEBOUNCE_MS = 300;

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** 화면이 정하는 요소 id — 서버 ErdIds 규칙(^[a-z]-[0-9a-zA-Z-]{1,48}$)을 지킨다. crypto.randomUUID 는 http 내부 주소에서 없을 수 있어 쓰지 않는다. */
export function newElementId(prefix: "c", random: () => number = Math.random, now: () => number = Date.now): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += Math.floor(random() * 36).toString(36);
  return `${prefix}-${now().toString(36)}-${s}`;
}

export interface NewColumn { id: string; logical: string; phys?: string; domainId?: number | null }

/** 새 컬럼 묶음. PK 면 마지막 PK 컬럼 다음 자리에 넣고 같은 묶음에서 PK 에 더한다(키 이름은 서버가 둔다). */
export function addColumnBatch(model: ErdModelJson, tableId: string, col: NewColumn, pk: boolean): ErdCommandJson[] {
  const add: ErdCommandJson = { op: "addColumn", id: col.id, table: tableId, logical: col.logical };
  if (col.phys) add.phys = col.phys;
  if (col.domainId != null) add.domainId = col.domainId;
  if (!pk) return [add];
  const key = Object.values(model.keys).find((k) => k.table === tableId && k.kind === "PK");
  const pkCols = key?.columns ?? [];
  const order = model.tables[tableId]?.columnOrder ?? [];
  add.position = Math.max(-1, ...pkCols.map((c) => order.indexOf(c))) + 1;
  return [add, { op: "setPrimaryKey", table: tableId, columns: [...pkCols, col.id] }];
}

/** NEEDS_CHOICE 뒤 다시 보낼 묶음 — 같은 id 의 addColumn 에만 phys 와 (비어 있으면) domainId 를 넣는다. */
export function withPhys(commands: ErdCommandJson[], columnId: string, phys: string, domainId: number | null): ErdCommandJson[] {
  return commands.map((c) => {
    if (c.op !== "addColumn" || c.id !== columnId) return c;
    const next: ErdCommandJson = { ...c, phys };
    if (domainId != null && c.domainId == null) next.domainId = domainId;
    return next;
  });
}

const DOMAIN_OASIS: OasisCallOptions = { merge: "result", errorFactory: plainError };

/** 도메인 찾기 — columnMng 과 같이 룰 편집(ruleEdit)의 도메인 검색(target=DOMAIN, 8건)을 쓴다. */
export async function searchErdDomains(keyword: string): Promise<DomainRow[]> {
  const kw = keyword.trim();
  const res = await callOasisAt<{ rows?: DomainRow[] }>(MDM_OASIS_BASE, "ruleEdit", "search", { target: "DOMAIN", keyword: kw === "" ? null : kw },
    undefined, DOMAIN_OASIS);
  return res.rows ?? [];
}

interface PreviewState { forText: string; preview: ErdNamePreview | null; error: string | null }

/** 300ms 멈춘 뒤 compare{logical}. 순번이 바뀐 뒤 온 응답(옛 글자·닫힌 칸)은 버린다. */
function useNamePreview(text: string, enabled: boolean): PreviewState | null {
  const [state, setState] = useState<PreviewState | null>(null);
  const seq = useRef(0);
  const want = enabled ? text.trim() : "";
  useEffect(() => {
    const mine = ++seq.current;
    if (want === "") {
      setState(null);
      return;
    }
    const timer = setTimeout(() => {
      previewName({ logical: want })
        .then((p) => {
          if (seq.current === mine) setState({ forText: want, preview: p, error: null });
        })
        .catch((e) => {
          if (seq.current === mine) setState({ forText: want, preview: null, error: errText(e) });
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [want]);
  useEffect(() => () => {
    seq.current += 1;
  }, []);
  return state;
}

const settledStatus = (s: string) => s === "MATCHED" || s === "SYNONYM";

interface Choice { tokens: TokenChoice[]; logical: string; label: string; newId: string; build(phys: string, domainId: number | null): ErdCommandJson[] }

const BAR: CSSProperties = { flex: "none", display: "flex", flexDirection: "column", gap: "var(--spacing-xs)",
  padding: "var(--spacing-xs) var(--spacing-sm)", borderTop: "1px solid var(--color-border)", background: "var(--color-bg)" };
const ROW: CSSProperties = { display: "flex", alignItems: "center", gap: "var(--spacing-xs)", minWidth: 0 };
const GROW: CSSProperties = { flex: 1, minWidth: 0 };
const LINE: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--spacing-xs)", minHeight: 20,
  fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" };
const MUTED: CSSProperties = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" };
const ERROR: CSSProperties = { fontSize: "var(--font-size-xs)", color: "var(--color-danger)" };
const TARGET: CSSProperties = { ...GROW, fontSize: "var(--font-size-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

export interface GridInputBarProps {
  ctx: ErdEditContext;
  tableId: string | null;
  /** 그리드에서 고른 컬럼(커서 행). */
  focusColumnId: string | null;
  handle: MutableRefObject<BarHandle | null>;
  /** 새 컬럼을 반영했다 — 그리드가 그 행을 고른다. */
  onAdded(columnId: string): void;
  renderStatus(status: ErdColumnStatus): ReactNode;
}

export function GridInputBar({ ctx, tableId, focusColumnId, handle, onAdded, renderStatus }: GridInputBarProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const [text, setText] = useState("");
  const [kind, setKind] = useState<AddKind>("add");
  const [withPhysName, setWithPhysName] = useState(true);
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const lastNewId = useRef<string | null>(null);
  const live = useRef({ text, tableId, busy });
  live.current = { text, tableId, busy };

  const model = ctx.state.model;
  const canEdit = ctx.rights.model.ok && tableId !== null;
  const preview = useNamePreview(text, canEdit);
  const shown = preview && preview.forText === text.trim() ? preview : null;
  const settled = shown?.preview && shown.preview.tokens.every((t) => settledStatus(t.status)) ? shown.preview : null;
  const focusCol = focusColumnId && model.columns[focusColumnId]?.table === tableId ? model.columns[focusColumnId] : undefined;
  const focusLocked = !canEdit || !focusCol || (focusColumnId !== null && ctx.pendingIds.has(focusColumnId));

  const focusInput = useCallback(() => {
    boxRef.current?.querySelector<HTMLInputElement>('[data-testid="erd-grid-input"]')?.focus();
  }, []);

  const send = useCallback(
    async (commands: ErdCommandJson[], label: string, newId: string | null, logical: string) => {
      setBusy(true);
      live.current.busy = true;
      lastNewId.current = newId;
      try {
        const out = await ctxRef.current.apply(commands, label);
        if (out.ok) {
          setText("");
          setKind("add");
          if (newId) onAdded(newId);
          focusInput();
          return;
        }
        const n = out.notice;
        if (n.code === "NEEDS_CHOICE" && n.property === "phys" && newId !== null && n.elementId === newId) {
          setChoice({ tokens: toTokenChoices(n.choices), logical, label, newId, build: (phys, domainId) => withPhys(commands, newId, phys, domainId) });
        }
      } finally {
        setBusy(false);
      }
    },
    [onAdded, focusInput],
  );

  const add = useCallback(
    (k: AddKind) => {
      const { text: t, tableId: table, busy: b } = live.current;
      const c = ctxRef.current;
      if (!c.rights.model.ok || !table || b) return;
      const logical = t.trim();
      if (logical === "") {
        setKind(k);
        focusInput();
        return;
      }
      const id = newElementId("c");
      void send(addColumnBatch(c.state.model, table, { id, logical }, k === "addPk"), k === "addPk" ? "PK 컬럼 추가" : "컬럼 추가", id, logical);
    },
    [send, focusInput],
  );

  useEffect(() => {
    handle.current = { trigger: add };
    return () => {
      handle.current = null;
    };
  }, [handle, add]);

  /** 미리보기에 하나로 정해지지 않은 토막이 있을 때 보내기 전에 고른다. */
  const openTokens = () => {
    const table = tableId;
    const logical = text.trim();
    const k = kind;
    if (!shown?.preview || !table || logical === "") return;
    const id = newElementId("c");
    setChoice({
      tokens: toTokenChoices(shown.preview.tokens), logical, newId: id, label: k === "addPk" ? "PK 컬럼 추가" : "컬럼 추가",
      build: (phys, domainId) => addColumnBatch(ctxRef.current.state.model, table, { id, logical, phys, domainId }, k === "addPk"),
    });
  };

  const onPick = async (phys: string) => {
    const c = choice;
    if (!c) return;
    setChoice(null);
    let domainId: number | null = null;
    try {
      domainId = (await previewName({ phys })).recommendedDomainId;
    } catch {
      domainId = null; // 추천 도메인을 못 읽으면 도메인 없이 보낸다(나중에 도메인 칸에서 고른다)
    }
    await send(c.build(phys, domainId), c.label, c.newId, c.logical);
  };

  const rename = () => {
    if (focusLocked || !focusCol || !focusColumnId) return;
    const logical = text.trim();
    if (logical === "") {
      focusInput();
      return;
    }
    const set: Record<string, unknown> = {};
    if (logical !== focusCol.logical) set.logical = logical;
    if (withPhysName && settled && settled.physName !== focusCol.phys) set.phys = settled.physName;
    if (Object.keys(set).length === 0) {
      ctx.notify("바뀐 값이 없습니다.", "info");
      return;
    }
    void send([{ op: "updateColumn", id: focusColumnId, set }], "논리명 바꾸기", null, logical);
  };

  const onDomain = (row: DomainRow | null) => {
    if (focusLocked || !focusColumnId) return;
    const cmd: ErdCommandJson = row
      ? { op: "applyDomain", id: focusColumnId, domainId: row.domainId }
      : { op: "updateColumn", id: focusColumnId, set: { domainId: null } };
    void ctxRef.current.apply([cmd], row ? "도메인 적용" : "도메인 해제");
  };

  const recommend = async () => {
    if (focusLocked || !focusCol || !focusColumnId) return;
    const id = focusColumnId;
    try {
      const p = await previewName({ phys: focusCol.phys });
      const c = ctxRef.current;
      if (p.recommendedDomainId == null) {
        c.notify(`${focusCol.phys} 에 맞는 추천 도메인이 없습니다.`, "info");
        return;
      }
      if (p.recommendedDomainId === c.state.model.columns[id]?.domainId) {
        c.notify("이미 추천 도메인입니다.", "info");
        return;
      }
      void c.apply([{ op: "applyDomain", id, domainId: p.recommendedDomainId }], "추천 도메인 적용");
    } catch (e) {
      ctxRef.current.notify(errText(e), "error");
    }
  };

  const domainName = (domainId: number | null | undefined): string =>
    domainId == null ? "" : ctx.status?.domains[String(domainId)]?.name ?? `도메인 ${domainId}`;
  const h = ctx.highlight;
  const hText = h && (model.columns[h.elementId]?.table === tableId || h.elementId === lastNewId.current) ? h.message : null;
  const reason = tableId === null ? "표를 고르면 컬럼을 더할 수 있습니다." : ctx.rights.model.ok ? null : ctx.rights.model.reason ?? "모델을 고칠 수 없습니다.";
  const needTokens = shown?.preview?.tokens.some((t) => !settledStatus(t.status)) ?? false;

  return (
    <div ref={boxRef} data-testid="erd-grid-bar" style={BAR}>
      <div style={ROW}>
        <Input data-testid="erd-grid-input" aria-label="새 컬럼 논리명" style={GROW} value={text} disabled={!canEdit}
          placeholder={kind === "addPk" ? "PK 컬럼 논리명 — Enter 로 추가" : "새 컬럼 논리명 — Enter·Ctrl+Enter 로 추가"}
          onChange={setText}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229 && !e.ctrlKey && !e.metaKey && !e.altKey) {
              e.preventDefault();
              add(kind);
            } else if (e.key === "Escape") {
              setText("");
              setKind("add");
            }
          }} />
        <Button size="sm" data-testid="erd-grid-add" disabled={!canEdit || busy || text.trim() === ""} onClick={() => add(kind)}>
          {kind === "addPk" ? "PK 추가" : "추가"}
        </Button>
      </div>
      <div data-testid="erd-grid-preview" style={LINE}>
        {shown?.error ? (
          <span style={ERROR}>{shown.error}</span>
        ) : shown?.preview ? (
          <>
            <span data-testid="erd-grid-phys" className="erd-mono">{shown.preview.physName}</span>
            {renderStatus(shown.preview.status)}
            {shown.preview.tokens.map((t) => (
              <Badge key={t.seq} label={`${t.surface} ${t.abbr}`} tone={tokenTone(t.status)} title={TOKEN_STATUS_LABEL[t.status] ?? t.status} />
            ))}
            {shown.preview.recommendedDomainId != null && <span>추천 도메인 {domainName(shown.preview.recommendedDomainId)}</span>}
            {needTokens && (
              <Button size="mini" data-testid="erd-grid-tokens" onClick={openTokens}>
                토막 고르기
              </Button>
            )}
          </>
        ) : (
          <span style={MUTED}>{canEdit && text.trim() !== "" ? "미리보기를 읽는 중입니다." : "논리명을 넣으면 물리명·표준 상태를 미리 봅니다."}</span>
        )}
      </div>
      {hText && (
        <div data-testid="erd-grid-error" role="alert" style={ERROR}>
          {hText}
        </div>
      )}
      {reason && (
        <div data-testid="erd-grid-reason" style={MUTED}>
          {reason}
        </div>
      )}
      {focusCol && (
        <>
          <div style={ROW}>
            <span data-testid="erd-grid-target" className="erd-mono" style={TARGET}>{focusCol.phys}</span>
            <Button size="sm" data-testid="erd-grid-rename" disabled={focusLocked || busy || text.trim() === ""} onClick={rename}>
              논리명 바꾸기
            </Button>
            <Checkbox aria-label="물리명도 바꾸기" label="물리명도" checked={withPhysName} disabled={focusLocked} onChange={setWithPhysName} />
          </div>
          <div style={ROW}>
            <span style={MUTED}>도메인</span>
            <DomainField testId="erd-grid-domain" ariaLabel="고른 컬럼 도메인" domainId={focusCol.domainId} label={domainName(focusCol.domainId)}
              search={searchErdDomains} onChange={onDomain} disabled={focusLocked} />
            <Button size="sm" data-testid="erd-grid-recommend" disabled={focusLocked} onClick={() => void recommend()}>
              추천
            </Button>
          </div>
        </>
      )}
      {choice && (
        <TokenChoiceModal opened logical={choice.logical} tokens={choice.tokens} onPick={(phys) => void onPick(phys)} onClose={() => setChoice(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 8: 구현 — `panels/ColumnGrid.tsx`**

`src/frontend/m-mdm/pages/dma/erdEdit/panels/ColumnGrid.tsx` 를 아래로 바꾼다. Step 0 에서 본 Task 9 의 다른 export 가 있으면 같은 뜻으로 남긴다.

```tsx
"use client";

/**
 * 오른쪽 컬럼 그리드(단계 2 편집, 스펙 2.2·4.4·8절) — 고른 표의 컬럼: 키|논리명|물리명|도메인|타입|NN|표준.
 * - 칸 편집은 ag-grid 기본(F2·더블클릭)이다. 칸을 떠날 때 updateColumn 한 건을 보내고, 같은 값이면 보내지 않는다.
 * - 행 끌기(키 칸 손잡이)는 moveColumn 한 건이다.
 * - 그리드 키는 그리드와 입력 칸을 감싼 div 의 onKeyDownCapture 로 받는다(S2-6·S2-27). shared AgDataGrid 의 props 는 바꾸지 않는다.
 *   Ctrl/⌘+Enter 컬럼 추가, Ctrl/⌘+Shift+Enter PK 컬럼 추가. 한글 조합 중·칸 편집 중이면 넘긴다.
 * - 논리명 입력·미리보기·도메인은 그리드 아래 입력 칸(GridInputBar)에서 한다. 입력 칸은 GridPanel 밖에 둔다(Local-Rules §45).
 * - 응답 전인 대기 행은 흐리게 그리고 고치지 못하게 한다(S2-18). 화면에서 틀린 값이거나 거절되면 행을 새로 만들어 원래 값으로 돌린다.
 * - 마지막 거절 칸(ctx.highlight)이 이 표의 컬럼이면 그 칸에 서버 문구를 단다(fieldErrors).
 * - ctx 는 렌더마다 새 객체일 수 있다. 열 정의는 모듈 상수, 행은 그리는 값만 deps 로, 콜백은 ref 로 최신 ctx 를 읽는다(§16·§20·§31).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { Badge, type BadgeTone } from "@dk-oasis/shared/form";
import { AgDataGrid, GridPanel, type AgDataGridFieldError, type GridColumn } from "@dk-oasis/shared/grid";

import { keyMarks } from "../canvas/erd-flow";
import { typeText } from "../canvas/erd-geometry";
import type { ErdEditContext, ErdHighlight } from "../edit-context";
import type { ErdColumnStatus, ErdCommandJson, ErdModelJson, ErdStatusView } from "../types";
import { GridInputBar, type AddKind, type BarHandle } from "./GridInputBar";
import { ORACLE_ID_RE } from "./TokenChoiceModal";

export const STATUS_LABEL: Record<ErdColumnStatus, string> = {
  OK: "표준", ALIAS: "별칭", NEW: "새 이름", TYPE: "타입 불일치", DOMAIN: "도메인 다름", MISS: "사전 없음",
};
const STATUS_TONE: Record<ErdColumnStatus, BadgeTone> = {
  OK: "success", ALIAS: "success", NEW: "primary", TYPE: "warning", DOMAIN: "warning", MISS: "danger",
};

export function statusBadge(value: unknown) {
  const s = value as ErdColumnStatus | null;
  return s && STATUS_LABEL[s] ? <Badge label={STATUS_LABEL[s]} tone={STATUS_TONE[s]} /> : null;
}

// ── 행 ──

/** 단계 1 행 모양 그대로(panel-rows.test 가 toEqual 로 본다). */
export function columnRows(model: ErdModelJson, tableId: string | null, status: ErdStatusView | null): Record<string, unknown>[] {
  const t = tableId ? model.tables[tableId] : undefined;
  if (!t) return [];
  const marks = keyMarks(model);
  return t.columnOrder
    .filter((cid) => model.columns[cid])
    .map((cid) => {
      const c = model.columns[cid];
      return {
        id: cid,
        key: marks.get(cid) ?? "",
        logical: c.logical,
        phys: c.phys,
        domain: c.domainId != null ? status?.domains[String(c.domainId)]?.name ?? String(c.domainId) : "",
        type: typeText(c),
        nn: c.notNull ? "Y" : "",
        status: status?.statuses[cid] ?? null,
      };
    });
}

export interface GridRow extends Record<string, unknown> { id: string; pending: boolean; editable: boolean }

/** 편집 그리드 행 — 단계 1 행에 대기 여부와 고칠 수 있는지를 더한다. */
export function gridRows(model: ErdModelJson, tableId: string | null, status: ErdStatusView | null, pending: ReadonlySet<string>, canEdit: boolean): GridRow[] {
  return columnRows(model, tableId, status).map((r) => {
    const id = String(r.id);
    const isPending = pending.has(id);
    return { ...r, id, pending: isPending, editable: canEdit && !isPending };
  });
}

/** 이 표의 대기 컬럼 id 를 정렬해 이은 글. ctx.pendingIds 가 새 Set 이어도 같은 글이면 행을 다시 만들지 않는다. */
export function pendingKeyOf(model: ErdModelJson, tableId: string | null, pending: ReadonlySet<string>): string {
  const t = tableId ? model.tables[tableId] : undefined;
  if (!t || pending.size === 0) return "";
  return t.columnOrder.filter((id) => pending.has(id)).sort().join(",");
}

// ── 칸 정의(모듈 상수, §20·§31). 최소 폭 합 380px ≤ 400px − 세로 스크롤바 17px(§30) ──

const isEditableRow = (row: Record<string, unknown>) => row.editable === true;

export const GRID_COLUMNS: GridColumn[] = [
  { key: "key", header: "키", width: 44, minWidth: 32, align: "center", meta: false },
  { key: "logical", header: "논리명", width: 110, minWidth: 70, meta: false, editable: isEditableRow },
  { key: "phys", header: "물리명", width: 120, minWidth: 80, meta: false, editable: isEditableRow },
  { key: "domain", header: "도메인", width: 80, minWidth: 50, meta: false },
  { key: "type", header: "타입", width: 100, minWidth: 60, meta: false, editable: isEditableRow },
  { key: "nn", header: "NN", width: 40, minWidth: 32, align: "center", meta: false, editable: isEditableRow, cellEditor: "select", cellEditorValues: ["Y", "N"] },
  { key: "status", header: "표준", width: 90, minWidth: 56, align: "center", meta: false, tooltip: false, render: statusBadge },
];

// ── 칸 편집 → 명령 ──

export interface TypeSpec { dataType: string | null; length: number | null; scale: number | null }

const TYPE_RE = /^([A-Z][A-Z0-9_]*)(?:\((\d+)(?:,(\d+))?\))?$/;
const TIMESTAMP_RE = /^TIMESTAMP(?:\(\d\))?$/;
const TYPE_HINT = "타입은 VARCHAR2(50)·NUMBER(10,2)·DATE·TIMESTAMP(6) 처럼 씁니다.";

/** typeText 의 거꿀. TIMESTAMP(n) 은 가져오기 표현대로 dataType 한 글이다(README S2-3 표). 빈 글은 타입 없음. */
export function parseTypeText(text: string): TypeSpec | null {
  const t = text.replace(/\s+/g, "").toUpperCase();
  if (t === "") return { dataType: null, length: null, scale: null };
  if (TIMESTAMP_RE.test(t)) return { dataType: t, length: null, scale: null };
  const m = TYPE_RE.exec(t);
  if (!m) return null;
  return { dataType: m[1], length: m[2] === undefined ? null : Number(m[2]), scale: m[3] === undefined ? null : Number(m[3]) };
}

export type CellEdit = { command: ErdCommandJson } | { error: string } | null;

const update = (id: string, set: Record<string, unknown>): CellEdit => ({ command: { op: "updateColumn", id, set } });

export function cellEditCommand(model: ErdModelJson, columnId: string, field: string, value: unknown): CellEdit {
  const col = model.columns[columnId];
  if (!col) return { error: "컬럼이 없습니다. 다른 세션이 지웠을 수 있습니다." };
  const text = value == null ? "" : String(value).trim();
  switch (field) {
    case "logical":
      if (text === "") return { error: "논리명을 비울 수 없습니다." };
      return text === col.logical ? null : update(columnId, { logical: text });
    case "phys": {
      const phys = text.toUpperCase();
      if (!ORACLE_ID_RE.test(phys)) return { error: "물리명은 영문 대문자로 시작하고 영문 대문자·숫자·_ 만 씁니다(128자까지)." };
      if (phys === col.phys) return null;
      const dup = model.tables[col.table]?.columnOrder.some((id) => id !== columnId && model.columns[id]?.phys === phys);
      return dup ? { error: `같은 표에 ${phys} 컬럼이 있습니다.` } : update(columnId, { phys });
    }
    case "type": {
      const t = parseTypeText(text);
      if (!t) return { error: TYPE_HINT };
      if (t.dataType === col.dataType && t.length === col.length && t.scale === col.scale) return null;
      return update(columnId, { dataType: t.dataType, length: t.length, scale: t.scale });
    }
    case "nn": {
      const notNull = text === "Y";
      return notNull === col.notNull ? null : update(columnId, { notNull });
    }
    default:
      return null;
  }
}

/** 행 끌기 결과 순서 → 옮긴 한 컬럼의 moveColumn. 서버는 빼고 position 자리에 넣는다. 한 번 옮긴 것으로 설명되지 않으면 null. */
export function orderChangeCommand(before: readonly string[], after: readonly string[]): ErdCommandJson | null {
  if (before.length !== after.length) return null;
  let i = 0;
  while (i < before.length && before[i] === after[i]) i++;
  if (i === before.length) return null;
  let j = before.length - 1;
  while (j > i && before[j] === after[j]) j--;
  const cand = after[j] === before[i] ? { id: before[i], position: j } : after[i] === before[j] ? { id: before[j], position: i } : null;
  if (!cand) return null;
  const sim = before.filter((x) => x !== cand.id);
  sim.splice(cand.position, 0, cand.id);
  return sim.every((x, k) => x === after[k]) ? { op: "moveColumn", id: cand.id, position: cand.position } : null;
}

// ── 그리드 키 ──

export interface GridKey { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; isComposing: boolean; keyCode: number; inEditor: boolean }

export function gridKeyAction(k: GridKey): AddKind | null {
  if (k.key !== "Enter" || !(k.ctrlKey || k.metaKey) || k.altKey) return null;
  // 한글 조합 중 Enter 는 마지막 글자를 확정하는 키다. 칸 편집기가 열려 있으면 편집을 먼저 마칠 길이 없어 넘긴다.
  if (k.isComposing || k.keyCode === 229 || k.inEditor) return null;
  return k.shiftKey ? "addPk" : "add";
}

// ── 거절 칸 강조 ──

const NO_ERRORS: AgDataGridFieldError[] = [];
const PROP_FIELD: Record<string, string> = {
  logical: "logical", phys: "phys", domainId: "domain", dataType: "type", length: "type", scale: "type", notNull: "nn",
};

export function highlightErrors(h: ErdHighlight | null, rows: readonly { id: string }[]): AgDataGridFieldError[] {
  if (!h || !rows.some((r) => r.id === h.elementId)) return NO_ERRORS;
  return [{ rowKey: h.elementId, field: PROP_FIELD[h.property ?? ""] ?? "logical", message: h.message }];
}

// ── 컬럼 점프 → 그리드 알림. 편집 문맥에 고른 컬럼 칸이 없어 FE3 파일 안에서 잇는다(계획 작성자 메모). ──

type FocusListener = (columnId: string) => void;
const focusListeners = new Set<FocusListener>();

export function requestColumnFocus(columnId: string): void {
  for (const l of [...focusListeners]) l(columnId);
}

export function subscribeColumnFocus(l: FocusListener): () => void {
  focusListeners.add(l);
  return () => {
    focusListeners.delete(l);
  };
}

// ── 화면 ──

export const GRID_STYLE_HREF = "dmes-erd-grid";
const GRID_CSS = `.erd-grid-row--pending { opacity: 0.55; font-style: italic; }`;
const CELL_LABEL: Record<string, string> = { logical: "논리명 편집", phys: "물리명 편집", type: "타입 편집", nn: "NN 편집" };
const pendingRowClass = (row: Record<string, unknown>) => (row.pending === true ? "erd-grid-row--pending" : undefined);
const WRAP: CSSProperties = { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 };
const GRID_BOX: CSSProperties = { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, position: "relative" };
const FILL: CSSProperties = { position: "absolute", inset: 0 };

export interface ColumnGridProps {
  ctx: ErdEditContext;
  tableId: string | null;
}

export function ColumnGrid({ ctx, tableId }: ColumnGridProps) {
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const tableRef = useRef(tableId);
  tableRef.current = tableId;
  const wrapRef = useRef<HTMLDivElement>(null);
  const barHandle = useRef<BarHandle | null>(null);

  const model = ctx.state.model;
  const status = ctx.status;
  const canEdit = ctx.rights.model.ok;
  const pendingKey = pendingKeyOf(model, tableId, ctx.pendingIds);
  // 거절·틀린 값 뒤 값이 같아도 새 행 객체를 만든다(ag-grid 가 받은 행 객체에 편집 값·끌기 순서를 먼저 써 둔다).
  const [epoch, setEpoch] = useState(0);
  const rows = useMemo(
    () => (epoch >= 0 ? gridRows(model, tableId, status, new Set(pendingKey ? pendingKey.split(",") : []), canEdit) : []),
    [model, tableId, status, pendingKey, canEdit, epoch],
  );
  const fieldErrors = useMemo(() => highlightErrors(ctx.highlight, rows), [ctx.highlight, rows]);
  const table = tableId ? model.tables[tableId] : undefined;
  const reject = useCallback(() => setEpoch((n) => n + 1), []);

  // ── 고른 행(커서). 컬럼 점프·새 컬럼은 그 행이 나타날 때 고른다. ──
  const [focusId, setFocusId] = useState<string | null>(null);
  const wantFocus = useRef<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const focusColumn = useCallback((columnId: string) => {
    wantFocus.current = columnId;
    setFocusTick((n) => n + 1);
  }, []);
  useEffect(() => subscribeColumnFocus(focusColumn), [focusColumn]);
  useEffect(() => {
    setFocusId(null);
  }, [tableId]);
  useEffect(() => {
    const want = wantFocus.current;
    if (want && rows.some((r) => r.id === want)) {
      wantFocus.current = null;
      setFocusId(want);
    }
  }, [rows, focusTick]);
  const onRow = useCallback((row: Record<string, unknown>) => setFocusId(String(row.id)), []);

  const onCellValueChanged = useCallback(
    (p: { rowKey: string | number; field: string; newValue: unknown }) => {
      const c = ctxRef.current;
      const edit = cellEditCommand(c.state.model, String(p.rowKey), p.field, p.newValue);
      if (edit === null) return;
      if ("error" in edit) {
        c.notify(edit.error, "warn");
        reject();
        return;
      }
      c.clearHighlight();
      void c.apply([edit.command], CELL_LABEL[p.field] ?? "컬럼 편집").then((out) => {
        if (!out.ok) reject();
      });
    },
    [reject],
  );

  const onRowOrderChange = useCallback(
    (keys: (string | number)[]) => {
      const c = ctxRef.current;
      const t = tableRef.current;
      const order = t ? (c.state.model.tables[t]?.columnOrder ?? []).filter((id) => c.state.model.columns[id]) : [];
      const cmd = orderChangeCommand(order, keys.map(String));
      if (!cmd) {
        reject();
        return;
      }
      void c.apply([cmd], "컬럼 순서").then((out) => {
        if (!out.ok) reject();
      });
    },
    [reject],
  );

  const onKeyDownCapture = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // 포털로 뜬 창(토막 고르기·도메인 찾기)의 키도 React 트리로는 여기를 지난다 — DOM 으로 이 칸 안일 때만 받는다.
    if (!wrapRef.current?.contains(target)) return;
    const kind = gridKeyAction({
      key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey,
      isComposing: e.nativeEvent.isComposing, keyCode: e.keyCode, inEditor: target.closest(".ag-cell-inline-editing") !== null,
    });
    if (!kind) return;
    e.preventDefault();
    e.stopPropagation();
    barHandle.current?.trigger(kind);
  }, []);

  return (
    <div ref={wrapRef} data-testid="erd-colgrid" style={WRAP} onKeyDownCapture={onKeyDownCapture}>
      {/* 대기 행 흐림 — 포털이 page.css 를 싣지 않으므로 href 로 한 번만 넣는다(Local-Rules §17). */}
      <style href={GRID_STYLE_HREF} precedence="default">
        {GRID_CSS}
      </style>
      <div style={GRID_BOX}>
        <GridPanel title={table ? table.logical || table.phys : "컬럼"} count={rows.length}
          titleExtra={table ? <span className="erd-mono">{table.phys}</span> : undefined}>
          <div data-testid="erd-columns" style={FILL}>
            <AgDataGrid gridId="erdColumns" columnSizing="fit" columns={GRID_COLUMNS} data={rows} rowKey="id"
              emptyMessage="캔버스나 검토 목록에서 표를 고르세요." emptyTestId="erd-columns-empty"
              onCellValueChanged={onCellValueChanged}
              rowDragField="key" isRowDraggable={isEditableRow} onRowOrderChange={onRowOrderChange}
              highlightedRowKey={focusId} scrollToRow={focusId} onRowClick={onRow} onFocusedRowChange={onRow}
              getRowClassExtra={pendingRowClass} rowClassRefreshToken={pendingKey} fieldErrors={fieldErrors} />
          </div>
        </GridPanel>
      </div>
      <GridInputBar ctx={ctx} tableId={tableId} focusColumnId={focusId} handle={barHandle} onAdded={focusColumn} renderStatus={statusBadge} />
    </div>
  );
}
```

`epoch >= 0 ?` 는 `epoch` 를 계산식이 실제로 읽게 해 deps 에 둔 뜻을 분명히 한다. 값은 늘 0 이상이다.

- [ ] **Step 9: 구현 — `panels/ColumnJump.tsx`**

`src/frontend/m-mdm/pages/dma/erdEdit/panels/ColumnJump.tsx` 를 아래로 바꾼다.

```tsx
"use client";

/**
 * 컬럼 점프(Ctrl/⌘+O·Alt+O, 스펙 8절) — 지금 표(없으면 모든 표)의 컬럼을 물리명·논리명으로 찾아 고른 컬럼으로 간다.
 * 키는 ErdViewer(FE1)가 window 캡처로 받아 ctx.nav.openColumnJump 로 이 창을 연다. 고르면 ctx.nav.selectColumn 과 컬럼 그리드 알림을 함께 부른다.
 * 목록은 AgDataGrid 로 그린다(데이터 목록 규칙). ↑/↓ 는 입력 칸에서 커서를 옮기고 Enter 로 고른다. 더블클릭도 고른다.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { Input } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Modal } from "@dk-oasis/shared/modal";

import type { ErdEditContext } from "../edit-context";
import type { ErdModelJson, ErdTable } from "../types";
import { requestColumnFocus } from "./ColumnGrid";

export const JUMP_LIMIT = 200;

export interface JumpRow extends Record<string, unknown> { id: string; table: string; column: string; logical: string }

export function jumpRows(model: ErdModelJson, tableId: string | null, text: string): { rows: JumpRow[]; more: number } {
  const q = text.trim().toLowerCase();
  const tables: [string, ErdTable][] = tableId && model.tables[tableId]
    ? [[tableId, model.tables[tableId]]]
    : Object.entries(model.tables).sort(([, a], [, b]) => a.phys.localeCompare(b.phys));
  const rows: JumpRow[] = [];
  let total = 0;
  for (const [, t] of tables) {
    for (const cid of t.columnOrder) {
      const c = model.columns[cid];
      if (!c) continue;
      if (q !== "" && !c.phys.toLowerCase().includes(q) && !(c.logical ?? "").toLowerCase().includes(q)) continue;
      total += 1;
      if (rows.length < JUMP_LIMIT) rows.push({ id: cid, table: t.phys, column: c.phys, logical: c.logical });
    }
  }
  return { rows, more: total - rows.length };
}

const JUMP_COLUMNS: GridColumn[] = [
  { key: "table", header: "표", width: 140, meta: false },
  { key: "column", header: "컬럼", width: 140, meta: false },
  { key: "logical", header: "논리명", width: 140, meta: false },
];
const EMPTY: { rows: JumpRow[]; more: number } = { rows: [], more: 0 };
const BODY: CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--spacing-xs)" };
// 모달 안 그리드는 기준 높이가 있어야 한다(Local-Rules §25).
const GRID_BOX: CSSProperties = { position: "relative", height: 320 };
const FILL: CSSProperties = { position: "absolute", inset: 0 };
const MORE: CSSProperties = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" };

export interface ColumnJumpProps {
  ctx: ErdEditContext;
  opened: boolean;
  onClose(): void;
}

export function ColumnJump({ ctx, opened, onClose }: ColumnJumpProps) {
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const model = ctx.state.model;
  const tableId = ctx.selectedTableId && model.tables[ctx.selectedTableId] ? ctx.selectedTableId : null;
  const found = useMemo(() => (opened ? jumpRows(model, tableId, text) : EMPTY), [opened, model, tableId, text]);
  const rowsRef = useRef(found.rows);
  rowsRef.current = found.rows;
  const navRef = useRef(ctx.nav);
  navRef.current = ctx.nav;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (opened) setText("");
  }, [opened]);
  useEffect(() => {
    setCursor(0);
  }, [text, opened]);

  const pick = useCallback((columnId: string) => {
    navRef.current.selectColumn(columnId);
    requestColumnFocus(columnId);
    closeRef.current();
  }, []);
  const onRowClick = useCallback((row: Record<string, unknown>) => {
    const i = rowsRef.current.findIndex((r) => r.id === row.id);
    if (i >= 0) setCursor(i);
  }, []);
  const onRowDoubleClick = useCallback((row: Record<string, unknown>) => pick(String(row.id)), [pick]);

  const current = found.rows.length > 0 ? found.rows[Math.min(cursor, found.rows.length - 1)].id : null;
  const title = tableId ? `컬럼 점프 — ${model.tables[tableId].phys}` : "컬럼 점프 — 모든 표";

  // 열렸다는 표시(FE1 Task 9 뼈대 계약 6). 창 본문은 포털(body)로 뜨므로, 화면 host 안에서 찾는 Task 9 의 Alt+O 시험을 위해 제자리에 숨은 표시를 둔다.
  return (
    <>
    {opened && <div data-testid="erd-column-jump" hidden />}
    <Modal open={opened} title={title} size="md" onClose={onClose}>
      {opened && (
        <div data-testid="erd-jump" style={BODY}>
          <Input data-testid="erd-jump-input" data-autofocus aria-label="컬럼 찾기" value={text} placeholder="물리명·논리명" onChange={setText}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const n = found.rows.length;
                if (n > 0) setCursor((c) => Math.max(0, Math.min(n - 1, c + (e.key === "ArrowDown" ? 1 : -1))));
              } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (current) pick(current);
              }
            }} />
          <div style={GRID_BOX}>
            <div style={FILL}>
              <AgDataGrid gridId="modal-erdColumnJump" title="컬럼" columnSizing="fit" columns={JUMP_COLUMNS} data={found.rows} rowKey="id"
                highlightedRowKey={current} scrollToRow={current} onRowClick={onRowClick} onRowDoubleClick={onRowDoubleClick}
                emptyMessage="맞는 컬럼이 없습니다." emptyTestId="erd-jump-empty" personalize={false} />
            </div>
          </div>
          {found.more > 0 && (
            <div data-testid="erd-jump-more" style={MORE}>
              {JUMP_LIMIT}건까지 보입니다. {found.more}건이 더 있으니 더 좁혀 찾으세요.
            </div>
          )}
        </div>
      )}
    </Modal>
    </>
  );
}
```

- [ ] **Step 10: 칸 편집 시험 방법 확정 (happy-dom 의 더블클릭·F2)**

happy-dom 에서 ag-grid 칸 편집을 연 선례는 `singleClickEdit` + mousedown·click 뿐이다(`tests/dme/ruleEdit/value-test-cards.test.ts` 의 `setVtValue`). 이 그리드는 `singleClickEdit` 을 켜지 않는다(ag-grid 기본 F2·더블클릭, 스펙 8절). 그래서 `openEditor` 가 쓰는 방법을 실행으로 정한다.

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/column-grid.test.ts -t "거절된 칸 편집"`
Expected: PASS. `openEditor` 는 더블클릭을 먼저 쓰고, 편집기가 없으면 초점 칸 F2 를 쓴다.

결과에 따라 다음을 한다.
- PASS: 그대로 둔다. 어느 쪽으로 열렸는지 보려면 `openEditor` 의 첫 `if (!editor)` 안에 `console.log("F2")` 를 잠깐 넣어 한 번 돌리고 지운다. 레인 보고에 "칸 편집 시험: 더블클릭" 또는 "F2" 를 적는다.
- FAIL `expected '메뉴이름' to be '메뉴명'`(편집기는 열렸고 `apply` 도 불렸는데 칸이 돌아오지 않음): shared `AgDataGrid` 는 `data` 를 원소 참조로만 비교하고(`grid-stable-input.ts` 의 `useStableArray(dataProp)`, `Object.is`) 행 객체를 그대로 ag-grid `rowData` 로 넘긴다. 그래서 `epoch` 로 만든 새 행 객체는 ag-grid 에 닿는다. 그래도 칸이 그대로면 ag-grid 가 새 값과 칸에 보인 값을 비교하지 않은 것이다. 이때는 `ColumnGrid` 의 `<AgDataGrid …>` 에 `key={epoch}` 를 더해 거절 뒤 그리드를 다시 마운트한다(거절은 드물어 비용이 작다). 그 뒤 같은 명령으로 다시 돌려 PASS 를 본다. 레인 보고에 "거절 되돌림: key 다시 마운트" 를 적는다.
- FAIL `더블클릭·F2 둘 다 칸 편집기를 열지 못했다(Step 10)`: 이 `it` 하나를 지우고, 같은 확인(논리명 칸 편집 → CONFLICT 거절 → 칸이 "메뉴명" 으로 돌아오고 `cell-mdm-invalid` 가 붙음)을 Task 16 브라우저 확인 항목으로 넘긴다. 레인 보고와 이 문서의 "계획 작성자 메모" 에 한 줄로 적는다. 거절 뒤 행을 새로 만드는 계산 자체(`epoch`)는 같은 파일의 다른 시험이 덮지 않으므로 조정 세션에 알린다.

- [ ] **Step 11: 시험 통과·타입 검사·UI 점검 확인**

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/`
Expected: PASS — `grid-edit.test.ts` 14건, `column-grid.test.ts` 8건(Step 10 에서 지웠으면 7건), `column-jump.test.ts` 3건, 기존 `panel-rows.test.ts` 의 `columnRows` 시험과 FE1 의 erdEdit 시험이 그대로 통과한다.

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint`
Expected: 오류 0(`tsc --noEmit` 이 출력 없이 끝난다).

Run(리포 루트): `node .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.mjs audit src/frontend/m-mdm/pages/dma/erdEdit/panels/ColumnGrid.tsx src/frontend/m-mdm/pages/dma/erdEdit/panels/GridInputBar.tsx src/frontend/m-mdm/pages/dma/erdEdit/panels/TokenChoiceModal.tsx src/frontend/m-mdm/pages/dma/erdEdit/panels/ColumnJump.tsx`
Run(리포 루트): `node .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.mjs audit src/frontend/m-mdm/pages/dma/erdEdit/panels/ColumnGrid.tsx src/frontend/m-mdm/pages/dma/erdEdit/panels/GridInputBar.tsx src/frontend/m-mdm/pages/dma/erdEdit/panels/TokenChoiceModal.tsx src/frontend/m-mdm/pages/dma/erdEdit/panels/ColumnJump.tsx`
Expected: 두 audit 모두 지적 0. 지적이 나오면 스킬 문서로 확인하고, 오탐이면 이유를 레인 보고에 적는다.

Run: `cd src/frontend && grep -rn "<AgDataGrid" m-mdm/pages/dma/erdEdit/panels/ColumnGrid.tsx m-mdm/pages/dma/erdEdit/panels/ColumnJump.tsx | grep -c gridId`
Expected: `2`(두 그리드 모두 `gridId` 가 있다, Local-Rules §39).

- [ ] **Step 12: 커밋**

```bash
/usr/bin/git add src/frontend/m-mdm/pages/dma/erdEdit/panels/ColumnGrid.tsx src/frontend/m-mdm/pages/dma/erdEdit/panels/GridInputBar.tsx \
  src/frontend/m-mdm/pages/dma/erdEdit/panels/TokenChoiceModal.tsx src/frontend/m-mdm/pages/dma/erdEdit/panels/ColumnJump.tsx \
  src/frontend/m-mdm/tests/dma/erdEdit/grid-fixtures.ts src/frontend/m-mdm/tests/dma/erdEdit/grid-edit.test.ts \
  src/frontend/m-mdm/tests/dma/erdEdit/column-grid.test.ts src/frontend/m-mdm/tests/dma/erdEdit/column-jump.test.ts
/usr/bin/git commit -m "$(cat <<'MSG'
feat(mdm): ERD 단계 2 그리드 편집 — 칸 편집·그리드 키·논리명 미리보기·토막 고르기·도메인·컬럼 점프

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
MSG
)"
```

---

### Task 15: 다시 가져오기 반영 — 차이 항목 고르기·결과 요약

**Files:**
- Modify: `src/frontend/m-mdm/pages/dma/erdEdit/panels/DbDiffApply.tsx` (파일 전체를 바꾼다. Task 9 의 단계 1 차이 목록 자리)
- Test: `src/frontend/m-mdm/tests/dma/erdEdit/db-diff-apply.test.ts`

**Interfaces:**
- Consumes:
  - FE1 Task 9: `api.ts` 의 `applyDbDiff(modelId, baseRev, session, itemIds): Promise<ErdDiffApplyResult>`(`import kind=APPLY_DIFF`, `itemsJson` = 항목 id JSON 배열 글, `source:"UI"`), `types.ts` 의 `ErdDiffApplyResult`·`ErdDiffApplySummary`·`ErdRejection`·`ErdDbDiffView`·`ErdDbDiffItem`·`ErdColumnSpec`, `edit-context.ts` 의 `ErdEditContext`(`modelId`·`session`·`state.rev`·`rights.model`·`pendingIds`·`exclusive`·`notify`).
  - README "다시 가져오기 반영" 정본: 응답 `summary`, 낡은 id 거절(`code:"INVALID"`, `property:"itemsJson"`, `choices` = 낡은 id 전부), 항목 1~500개.
  - Task 14 의 `grid-fixtures.ts`(`fakeCtx`·`stubOasis`·`mount`·`confirmButton`).
  - shared: `@dk-oasis/shared/grid`(`AgDataGrid`), `form`(`Button`), `message-provider`(`useMessage` 확인창).
- Produces (FE1 의 `ReviewPanel` "DB 차이" 탭이 `<DbDiffApply ctx diff onReload />` 로 그린다. Task 16 이 마감 10번에서 쓴다):
  - `DbDiffApply({ ctx, diff, onReload })`, `DbDiffApplyProps`, `diffRows`·`DIFF_LABEL`(단계 1 과 같은 값. Task 9 가 `ReviewPanel` 에서 이 파일로 옮겼고 `panel-rows.test.ts` 가 여기서 가져온다), `APPLY_LIMIT = 500`, `orderedSelection`, `withFkCompanions`, `selectionSummary`, `removingCount`, `applySummaryText`, `applyBlockReason`, `rejectionLine`, `staleIdsOf`.

동작 규칙(D10, S2-14):
1. 차이 목록은 단계 1 과 같은 칸(종류·표·컬럼·모델·DB)이고, 행마다 고르기 칸을 둔다. 여럿을 고를 수 있다.
2. [고른 항목 반영] 은 고른 항목 id 를 차이 목록 순서로 `import kind=APPLY_DIFF` 에 보낸다. `baseRev` 는 보낼 때의 `ctx.state.rev` 다. `FK_ADDED` 를 골랐으면 그 FK 의 부모 표 `TABLE_ADDED` 와 부모·자식 컬럼 `COLUMN_ADDED` 가 차이 목록에 있을 때 함께 보낸다(`withFkCompanions`). 서버는 부모·자식을 풀 수 없는 `FK_ADDED` 를 낡은 항목으로 거절하기 때문이다(README "다시 가져오기 반영"). 함께 보낸 수는 안내 줄에 적고, 500건 상한은 함께 보낸 항목까지 센다.
3. 이 요청은 `ctx.apply` 의 명령 줄을 거치지 않고 `ctx.exclusive(() => applyDbDiff(…))` 안에서 보낸다(README 정본). 내 쓰기 줄이 빌 때까지 기다린 뒤 보내고, HTTP 호출이 도는 동안 다음 묶음을 보내지 않는다. 그래서 그 사이 온 같은 세션의 SSE 에코가 다른 묶음의 에코로 읽히지 않는다. 그리고 다음 다섯 경우에 단추를 막고 이유를 보인다.
   - 모델을 고칠 수 없을 때(`ctx.rights.model`)
   - 고른 항목이 없을 때
   - 고른 항목이 500건을 넘을 때
   - 보내는 중인 묶음이 있을 때(`ctx.pendingIds` 가 비어 있지 않음). 그 묶음의 결과를 본 뒤 고르게 한다.
   - 반영하는 중일 때
4. 반영 결과는 SSE `change` 로 모델에 들어온다. 이 부품은 델타를 얹지 않는다. 이 rev 는 Ctrl+Z(내 마지막 명령)의 대상이 아니다. 되돌리기는 변경 기록 탭에서 그 rev 를 고른다.
5. 고른 항목에 `TABLE_REMOVED`·`COLUMN_REMOVED` 가 있으면 확인창(`useMessage` confirm)에서 지우는 건수를 보이고, [확인] 뒤에만 보낸다.
6. 반영되면 결과 요약 한 줄을 보인다. 그리고 고르기를 비우고 `onReload()` 로 차이를 다시 읽는다.
7. 거절되면 서버 문구(`message — hint`)를 `ctx.notify(…, "error")` 로 알린다. 낡은 항목 거절이면 낡은 건수를 보이고 `onReload()` 한다.
8. 모델이 바뀌면 고르기·결과를 비우고, 날아오는 옛 응답을 요청 순번으로 버린다(Local-Rules §37).
9. 결과·이유 글은 단추 줄 아래 줄에 둔다(§38). 그리드는 그 아래 남는 높이를 채운다.

- [ ] **Step 0: Task 9 자리 확인**

Run: `cd src/frontend/m-mdm/pages/dma/erdEdit && grep -n "export" panels/DbDiffApply.tsx && grep -n "DbDiffApply\|diffRows" panels/ReviewPanel.tsx && grep -rn "diffRows" ../../../tests/dma/erdEdit/`
Expected: `DbDiffApply` 가 `{ ctx, diff, onReload }` 를 받고 `diffRows` 를 내보낸다(Task 9 가 `ReviewPanel` 에서 옮겼다. `DIFF_LABEL` 은 내보내지 않는 상수다). `ReviewPanel` 의 DB 차이 탭이 ctx 가 있을 때 `<DbDiffApply …>` 를 그리고, `ReviewPanel.tsx` 에는 `diffRows` 가 없다. `panel-rows.test.ts` 가 `diffRows` 를 `panels/DbDiffApply` 에서 가져온다.
- `DbDiffApply.tsx` 에 `diffRows` 말고 다른 export 가 있으면 Step 3 의 새 파일에 같은 뜻으로 남긴다.
- 위와 다르면(예: `ReviewPanel.tsx` 에 `diffRows` 가 남음) 멈추고 조정 세션에 알린다. 그 파일은 FE1 소유다.

- [ ] **Step 1: 실패하는 시험 작성**

`src/frontend/m-mdm/tests/dma/erdEdit/db-diff-apply.test.ts`:

```ts
/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  APPLY_LIMIT, DbDiffApply, applyBlockReason, applySummaryText, diffRows, orderedSelection, removingCount, rejectionLine, selectionSummary,
  staleIdsOf, withFkCompanions,
} from "../../../pages/dma/erdEdit/panels/DbDiffApply";
import type { ErdDbDiffView, ErdDiffApplyResult, ErdRejection } from "../../../pages/dma/erdEdit/types";
import { flush, settleGrid } from "../../dme/helpers/render";
import { ALL_RIGHTS, NO_MODEL_RIGHTS, READ_ONLY, confirmButton, fakeCtx, inDoc, installStorage, mount, stubOasis, type Mounted } from "./grid-fixtures";

const COL = "COLUMN_CHANGED:TB_MCM_SEC_MENU.MENU_NM";
const DROP = "TABLE_REMOVED:TB_MCM_SEC_OBJ";
const FK = "FK_ADDED:TB_MCM_SEC_MENU(OBJECT_ID)>TB_MCM_SEC_OBJ(OBJECT_ID)";
const DIFF: ErdDbDiffView = {
  modelId: "mcm", rev: 3, schema: "MCMAPUSER",
  items: [
    { id: COL, kind: "COLUMN_CHANGED", table: "TB_MCM_SEC_MENU", column: "MENU_NM",
      before: { dataType: "VARCHAR2", length: 200, scale: null, notNull: false }, after: { dataType: "VARCHAR2", length: 300, scale: null, notNull: false } },
    { id: DROP, kind: "TABLE_REMOVED", table: "TB_MCM_SEC_OBJ", column: null, before: null, after: null },
    { id: FK, kind: "FK_ADDED", table: "TB_MCM_SEC_MENU", column: null, before: null, after: null },
  ],
};
const SUMMARY = { items: 2, tablesAdded: 0, tablesRemoved: 0, columnsAdded: 0, columnsRemoved: 0, columnsChanged: 1, relationsAdded: 0,
  dbFkSet: 1, dbFkCleared: 0, removedIds: [] as string[] };
const APPLY_OK: ErdDiffApplyResult = { applied: true, rev: 4, rowVersion: 2, changes: [], warnings: [], rejection: null, summary: SUMMARY };
const STALE: ErdRejection = { code: "INVALID", commandIndex: 0, message: "차이 목록에 없거나 함께 골라야 할 항목이 빠진 항목 1개가 있습니다",
  hint: "compare kind=DB_DIFF 로 차이를 다시 읽고 고르세요", elementId: COL, property: "itemsJson", byRev: null, bySession: null,
  byUserId: null, current: null, choices: [COL], ownerId: null };

const originalFetch = globalThis.fetch;
let view: Mounted | null = null;

beforeEach(() => installStorage());
afterEach(() => {
  view?.unmount();
  view = null;
  globalThis.fetch = originalFetch;
  vi.unstubAllGlobals();
});

const runBtn = () => inDoc<HTMLButtonElement>("erd-diff-apply-run")!;
const box = (id: string) => view!.host.querySelector<HTMLInputElement>(`.ag-row[row-id="${id}"] .ag-selection-checkbox input`)!;
async function check(id: string) {
  await act(async () => box(id).click());
  await flush();
}
async function open(ctx: Parameters<typeof DbDiffApply>[0]["ctx"], onReload = vi.fn()) {
  view = await mount(createElement(DbDiffApply, { ctx, diff: DIFF, onReload }));
  await settleGrid(inDoc("erd-diff-apply")!);
  return onReload;
}

describe("다시 가져오기 반영 — 순수 함수", () => {
  it("차이 행은 단계 1 과 같다", () => {
    expect(diffRows({ ...DIFF, items: [DIFF.items[0]] })).toEqual([
      { id: COL, kind: "컬럼 다름", table: "TB_MCM_SEC_MENU", column: "MENU_NM", before: "VARCHAR2(200)", after: "VARCHAR2(300)" },
    ]);
    expect(diffRows(null)).toEqual([]);
  });

  it("고른 항목은 차이 목록 순서로 보내고, 종류별 수로 줄이고, 지우는 항목을 센다", () => {
    expect(orderedSelection(DIFF, [FK, "GONE:X", COL])).toEqual([COL, FK]);
    expect(selectionSummary(DIFF, [COL, FK])).toBe("컬럼 다름 1 · DB 에 생긴 FK 1");
    expect(removingCount(DIFF, [COL, DROP])).toBe(1);
    expect(orderedSelection(null, [COL])).toEqual([]);
  });

  it("FK_ADDED 를 고르면 차이 목록에 있는 부모 표 TABLE_ADDED 와 부모·자식 컬럼 COLUMN_ADDED 를 함께 보낸다", () => {
    const NEW_FK = "FK_ADDED:TB_A(P_ID,P_SEQ)>TB_NEW(ID,SEQ)";
    const v: ErdDbDiffView = { ...DIFF, items: [
      ...DIFF.items,
      { id: "COLUMN_ADDED:TB_A.P_SEQ", kind: "COLUMN_ADDED", table: "TB_A", column: "P_SEQ", before: null, after: null },
      { id: NEW_FK, kind: "FK_ADDED", table: "TB_A", column: null, before: null, after: null },
      { id: "TABLE_ADDED:TB_NEW", kind: "TABLE_ADDED", table: "TB_NEW", column: null, before: null, after: null },
      { id: "TABLE_ADDED:TB_OTHER", kind: "TABLE_ADDED", table: "TB_OTHER", column: null, before: null, after: null },
    ] };
    expect(withFkCompanions(v, [NEW_FK])).toEqual([NEW_FK, "TABLE_ADDED:TB_NEW", "COLUMN_ADDED:TB_A.P_SEQ"]);
    expect(orderedSelection(v, withFkCompanions(v, [NEW_FK]))).toEqual(["COLUMN_ADDED:TB_A.P_SEQ", NEW_FK, "TABLE_ADDED:TB_NEW"]);
    expect(withFkCompanions(v, [COL, FK])).toEqual([COL, FK]); // 부모 표가 이미 모델에 있으면 더할 것이 없다
    expect(withFkCompanions(null, [FK])).toEqual([FK]);
  });

  it("결과 요약은 0 이 아닌 칸만 적고, 지운 요소 수를 붙인다", () => {
    expect(applySummaryText(4, SUMMARY)).toBe("rev 4 에 2건을 반영했습니다 — 컬럼 바뀜 1 · DB FK 표시 1");
    expect(applySummaryText(9, { ...SUMMARY, items: 1, columnsChanged: 0, dbFkSet: 0, tablesRemoved: 1, removedIds: ["t-2", "c-3", "k-2"] }))
      .toBe("rev 9 에 1건을 반영했습니다 — 표 삭제 1 · 지운 요소 3개");
  });

  it("단추를 막는 이유는 권한 → 고른 수 → 상한 → 대기 묶음 순서다", () => {
    const none = new Set<string>();
    expect(applyBlockReason({ rights: NO_MODEL_RIGHTS, pendingIds: none }, 3)).toBe(READ_ONLY);
    expect(applyBlockReason({ rights: ALL_RIGHTS, pendingIds: none }, 0)).toBe("반영할 항목을 고르세요.");
    expect(applyBlockReason({ rights: ALL_RIGHTS, pendingIds: none }, APPLY_LIMIT + 1)).toBe("한 번에 500건까지 반영합니다. 나눠서 고르세요.");
    expect(applyBlockReason({ rights: ALL_RIGHTS, pendingIds: new Set(["c-1"]) }, 1)).toBe("보내는 중인 변경이 끝난 뒤 반영하세요.");
    expect(applyBlockReason({ rights: ALL_RIGHTS, pendingIds: none }, 1)).toBeNull();
  });

  it("거절 문구는 message — hint 이고, 낡은 항목 거절이면 낡은 id 를 꺼낸다", () => {
    expect(rejectionLine(STALE)).toBe("차이 목록에 없거나 함께 골라야 할 항목이 빠진 항목 1개가 있습니다 — compare kind=DB_DIFF 로 차이를 다시 읽고 고르세요");
    expect(staleIdsOf(STALE)).toEqual([COL]);
    expect(staleIdsOf({ ...STALE, code: "CONFLICT" })).toEqual([]);
    expect(rejectionLine(null)).toBe("반영이 거절되었습니다.");
  });
});

describe("다시 가져오기 반영 — 화면", () => {
  it("고른 항목만 목록 순서로 APPLY_DIFF 로 보내고, 결과 요약을 보이고, 고르기를 비우고 차이를 다시 읽는다", async () => {
    const calls = stubOasis({ "erdEdit/import": () => APPLY_OK });
    const f = fakeCtx();
    const onReload = await open(f.ctx);
    expect(runBtn().disabled).toBe(true);
    expect(inDoc("erd-diff-apply-note")!.textContent).toBe("반영할 항목을 고르세요.");
    await check(FK);
    await check(COL);
    expect(inDoc("erd-diff-apply-note")!.textContent).toBe("고른 2건: 컬럼 다름 1 · DB 에 생긴 FK 1");
    await act(async () => runBtn().click());
    await flush();
    await flush();
    const req = calls.find((c) => c.action === "import")!.params;
    expect(req).toMatchObject({ modelId: "mcm", kind: "APPLY_DIFF", baseRev: 3, session: "ui-test0001", source: "UI" });
    expect(JSON.parse(String(req.itemsJson))).toEqual([COL, FK]);
    expect(inDoc("erd-diff-apply-result")!.textContent).toBe("rev 4 에 2건을 반영했습니다 — 컬럼 바뀜 1 · DB FK 표시 1");
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(box(COL).checked).toBe(false);
  });

  it("표를 지우는 항목을 고르면 확인을 받은 뒤에만 보낸다", async () => {
    const calls = stubOasis({ "erdEdit/import": () => ({ ...APPLY_OK, summary: { ...SUMMARY, items: 1, columnsChanged: 0, dbFkSet: 0, tablesRemoved: 1 } }) });
    await open(fakeCtx().ctx);
    await check(DROP);
    await act(async () => runBtn().click());
    await flush();
    expect(calls.filter((c) => c.action === "import")).toHaveLength(0);
    expect(document.body.textContent).toContain("고른 항목 중 1건은 모델에서 표·컬럼을 지웁니다");
    await act(async () => confirmButton()!.click());
    await flush();
    await flush();
    expect(calls.filter((c) => c.action === "import")).toHaveLength(1);
  });

  it("낡은 항목이면 서버 문구를 알리고, 낡은 건수를 보이고, 차이를 다시 읽는다", async () => {
    stubOasis({ "erdEdit/import": () => ({ applied: false, rev: 3, rowVersion: null, changes: [], warnings: [], summary: null, rejection: STALE }) });
    const f = fakeCtx();
    const onReload = await open(f.ctx);
    await check(COL);
    await act(async () => runBtn().click());
    await flush();
    await flush();
    expect(f.notify).toHaveBeenCalledWith("차이 목록에 없거나 함께 골라야 할 항목이 빠진 항목 1개가 있습니다 — compare kind=DB_DIFF 로 차이를 다시 읽고 고르세요", "error");
    expect(inDoc("erd-diff-apply-stale")!.textContent).toBe("고른 항목 중 1건을 넣을 수 없습니다(차이 목록에 없거나 함께 고를 항목이 빠짐). 차이를 다시 읽었으니 다시 고르세요.");
    expect(inDoc("erd-diff-apply-result")).toBeNull();
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("보내는 중인 묶음이 있거나 모델을 고칠 수 없으면 단추를 막고 이유를 보인다", async () => {
    stubOasis({});
    await open(fakeCtx({ pendingIds: new Set(["c-1"]) }).ctx);
    await check(COL);
    expect(runBtn().disabled).toBe(true);
    expect(inDoc("erd-diff-apply-note")!.textContent).toBe("고른 1건: 컬럼 다름 1 — 보내는 중인 변경이 끝난 뒤 반영하세요.");
    view!.unmount();
    view = null;
    await open(fakeCtx({ rights: NO_MODEL_RIGHTS }).ctx);
    expect(runBtn().disabled).toBe(true);
    expect(inDoc("erd-diff-apply-note")!.textContent).toBe(READ_ONLY);
  });

  it("모델을 바꾼 뒤 늦게 온 응답은 버린다", async () => {
    let release: (() => void) | null = null;
    stubOasis({ "erdEdit/import": () => new Promise((r) => { release = () => r(APPLY_OK); }) });
    const f = fakeCtx();
    const onReload = await open(f.ctx);
    await check(COL);
    await act(async () => runBtn().click());
    await flush();
    await view!.rerender(createElement(DbDiffApply, { ctx: { ...f.ctx, modelId: "mdm" }, diff: DIFF, onReload }));
    await act(async () => release!());
    await flush();
    await flush();
    expect(inDoc("erd-diff-apply-result")).toBeNull();
    expect(onReload).not.toHaveBeenCalled();
    expect(f.notify).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 확인**

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/db-diff-apply.test.ts`
Expected: FAIL — Task 9 의 `DbDiffApply.tsx` 에 `APPLY_LIMIT`·`orderedSelection`·`applySummaryText` 등이 없어 순수 함수 시험이 `… is not a function` 으로 실패한다. 화면 시험은 `erd-diff-apply-run` 단추가 없어 `Cannot read properties of null (reading 'disabled')` 로 실패한다.

- [ ] **Step 3: 구현 — `panels/DbDiffApply.tsx`**

`src/frontend/m-mdm/pages/dma/erdEdit/panels/DbDiffApply.tsx` 를 아래로 바꾼다. Step 0 에서 본 다른 export 가 있으면 같은 뜻으로 남긴다.

```tsx
"use client";

/**
 * 다시 가져오기 반영(D10, S2-14) — 검토 패널 "DB 차이" 탭. DB 와 모델의 차이 목록에서 사람이 고른 항목만 DRAFT 에 넣는다.
 * - 요청은 import kind=APPLY_DIFF(itemsJson = 고른 항목 id, 차이 목록 순서)다. 서버가 잠금 안에서 차이를 다시 계산해 restore 하나로 넣고,
 *   확정·기각한 관계 상태를 지킨다. 모델 변화는 SSE change 로 들어온다. 이 부품은 델타를 얹지 않는다.
 * - 이 요청은 편집 문맥의 명령 줄(ctx.apply)을 거치지 않고 ctx.exclusive 안에서 보낸다(같은 세션 에코를 다른 묶음의 에코로 잘못 읽지 않게). 보내는 중인 묶음이 있으면 단추를 막는다.
 * - FK_ADDED 를 고르면 그 FK 에 딸린 TABLE_ADDED·COLUMN_ADDED 를 함께 보낸다(withFkCompanions).
 *   이 rev 는 Ctrl+Z(내 마지막 명령) 대상이 아니다. 되돌리기는 변경 기록 탭에서 그 rev 를 고른다.
 * - 표·컬럼을 지우는 항목(TABLE_REMOVED·COLUMN_REMOVED)이 있으면 확인을 받는다.
 * - 거절은 서버 문구를 알림으로 보인다. 낡은 항목이면 차이를 다시 읽는다. 모델이 바뀌면 늦은 응답을 순번으로 버린다(Local-Rules §37).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { applyDbDiff } from "../api";
import { typeText } from "../canvas/erd-geometry";
import type { ErdEditContext } from "../edit-context";
import type { ErdColumnSpec, ErdDbDiffItem, ErdDbDiffView, ErdDiffApplySummary, ErdRejection } from "../types";

export const DIFF_LABEL: Record<ErdDbDiffItem["kind"], string> = {
  TABLE_ADDED: "DB 에 생긴 표", TABLE_REMOVED: "DB 에서 사라진 표", COLUMN_ADDED: "DB 에 생긴 컬럼", COLUMN_REMOVED: "DB 에서 사라진 컬럼",
  COLUMN_CHANGED: "컬럼 다름", FK_ADDED: "DB 에 생긴 FK", FK_REMOVED: "DB 에서 사라진 FK",
};
const KIND_ORDER = Object.keys(DIFF_LABEL) as ErdDbDiffItem["kind"][];

const specText = (s: ErdColumnSpec | null): string => (s ? `${typeText(s)}${s.notNull ? " NN" : ""}` : "");

/** 단계 1 차이 행(검토 패널 읽기 목록과 같은 값). */
export function diffRows(view: ErdDbDiffView | null): Record<string, unknown>[] {
  if (!view) return [];
  return view.items.map((i) => ({ id: i.id, kind: DIFF_LABEL[i.kind], table: i.table, column: i.column ?? "", before: specText(i.before), after: specText(i.after) }));
}

export const APPLY_LIMIT = 500;
const REMOVING: ReadonlySet<ErdDbDiffItem["kind"]> = new Set<ErdDbDiffItem["kind"]>(["TABLE_REMOVED", "COLUMN_REMOVED"]);

/** 고른 id 를 차이 목록 순서로. 목록에 없는 id 는 뺀다. */
export function orderedSelection(view: ErdDbDiffView | null, selected: readonly string[]): string[] {
  if (!view) return [];
  const want = new Set(selected);
  return view.items.filter((i) => want.has(i.id)).map((i) => i.id);
}

/** FK_ADDED 항목 id: `FK_ADDED:<자식>(<컬럼,…>)><부모>(<컬럼,…>)`(ErdDbDiff.fkKey). */
const FK_ID_RE = /^FK_ADDED:([^(]+)\(([^)]*)\)>([^(]+)\(([^)]*)\)$/;

/**
 * FK_ADDED 를 고르면 그 FK 의 부모 표 TABLE_ADDED 와 부모·자식 컬럼 COLUMN_ADDED 가 차이 목록에 있을 때 함께 고른다.
 * 서버는 부모·자식 표나 컬럼을 풀 수 없는 FK_ADDED 를 낡은 항목(INVALID itemsJson)으로 거절한다(README "다시 가져오기 반영").
 * 고른 순서를 지키고 더한 id 를 뒤에 붙인다. 보낼 때는 orderedSelection 으로 차이 목록 순서로 다시 줄 세운다.
 */
export function withFkCompanions(view: ErdDbDiffView | null, ids: readonly string[]): string[] {
  const out = [...ids];
  if (!view) return out;
  const present = new Set(view.items.map((i) => i.id));
  const seen = new Set(ids);
  const add = (id: string) => {
    if (present.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  for (const id of ids) {
    const m = FK_ID_RE.exec(id);
    if (!m) continue;
    const [, child, childCols, parent, parentCols] = m;
    add(`TABLE_ADDED:${parent}`);
    for (const c of parentCols.split(",")) add(`COLUMN_ADDED:${parent}.${c}`);
    for (const c of childCols.split(",")) add(`COLUMN_ADDED:${child}.${c}`);
  }
  return out;
}

export function selectionSummary(view: ErdDbDiffView | null, ids: readonly string[]): string {
  if (!view) return "";
  const want = new Set(ids);
  const counts = new Map<ErdDbDiffItem["kind"], number>();
  for (const i of view.items) if (want.has(i.id)) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
  return KIND_ORDER.filter((k) => counts.has(k)).map((k) => `${DIFF_LABEL[k]} ${counts.get(k)}`).join(" · ");
}

export function removingCount(view: ErdDbDiffView | null, ids: readonly string[]): number {
  if (!view) return 0;
  const want = new Set(ids);
  return view.items.filter((i) => want.has(i.id) && REMOVING.has(i.kind)).length;
}

type CountKey = Exclude<keyof ErdDiffApplySummary, "items" | "removedIds">;
const SUMMARY_LABEL: [CountKey, string][] = [
  ["tablesAdded", "표 추가"], ["tablesRemoved", "표 삭제"], ["columnsAdded", "컬럼 추가"], ["columnsRemoved", "컬럼 삭제"],
  ["columnsChanged", "컬럼 바뀜"], ["relationsAdded", "관계 추가"], ["dbFkSet", "DB FK 표시"], ["dbFkCleared", "DB FK 해제"],
];

export function applySummaryText(rev: number, s: ErdDiffApplySummary): string {
  const parts = SUMMARY_LABEL.filter(([k]) => s[k] > 0).map(([k, label]) => `${label} ${s[k]}`);
  if (s.removedIds.length > 0) parts.push(`지운 요소 ${s.removedIds.length}개`);
  return `rev ${rev} 에 ${s.items}건을 반영했습니다${parts.length > 0 ? ` — ${parts.join(" · ")}` : ""}`;
}

export function applyBlockReason(ctx: Pick<ErdEditContext, "rights" | "pendingIds">, count: number): string | null {
  if (!ctx.rights.model.ok) return ctx.rights.model.reason ?? "모델을 고칠 수 없습니다.";
  if (count === 0) return "반영할 항목을 고르세요.";
  if (count > APPLY_LIMIT) return `한 번에 ${APPLY_LIMIT}건까지 반영합니다. 나눠서 고르세요.`;
  if (ctx.pendingIds.size > 0) return "보내는 중인 변경이 끝난 뒤 반영하세요.";
  return null;
}

export function rejectionLine(r: ErdRejection | null): string {
  if (!r) return "반영이 거절되었습니다.";
  return r.hint ? `${r.message} — ${r.hint}` : r.message;
}

/** 낡은 항목 거절(README: INVALID, property itemsJson, choices = 낡은 id 전부)이면 그 id. */
export function staleIdsOf(r: ErdRejection | null): string[] {
  return r?.code === "INVALID" && r.property === "itemsJson" && Array.isArray(r.choices) ? r.choices.map(String) : [];
}

const DIFF_COLUMNS: GridColumn[] = [
  { key: "kind", header: "종류", width: 150, meta: false },
  { key: "table", header: "표", width: 200, meta: false },
  { key: "column", header: "컬럼", width: 160, meta: false },
  { key: "before", header: "모델", width: 160, meta: false },
  { key: "after", header: "DB", width: 160, meta: false },
];
const WRAP: CSSProperties = { position: "absolute", inset: 0, display: "flex", flexDirection: "column" };
const BAR: CSSProperties = { flex: "none", display: "flex", alignItems: "center", gap: "var(--spacing-xs)", padding: "var(--spacing-xs) var(--spacing-sm)" };
const NOTE: CSSProperties = { flex: "none", minHeight: 18, padding: "0 var(--spacing-sm)", fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" };
const RESULT: CSSProperties = { ...NOTE, color: "var(--color-success)" };
const STALE: CSSProperties = { ...NOTE, color: "var(--color-danger)" };
const GRID_BOX: CSSProperties = { position: "relative", flex: 1, minHeight: 0 };
const FILL: CSSProperties = { position: "absolute", inset: 0 };

export interface DbDiffApplyProps {
  ctx: ErdEditContext;
  diff: ErdDbDiffView | null;
  onReload(): void;
}

export function DbDiffApply({ ctx, diff, onReload }: DbDiffApplyProps) {
  const { showMessage } = useMessage();
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const reloadRef = useRef(onReload);
  reloadRef.current = onReload;
  const seq = useRef(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [stale, setStale] = useState(0);
  const rows = useMemo(() => diffRows(diff), [diff]);

  // 모델이 바뀌면 고르기·결과를 비우고, 날아오는 옛 응답을 버린다.
  useEffect(() => {
    seq.current += 1;
    setSelected([]);
    setResult(null);
    setStale(0);
    setBusy(false);
  }, [ctx.modelId]);
  // 차이를 다시 읽으면 목록에 없는 고르기를 뺀다.
  useEffect(() => {
    const present = new Set(diff?.items.map((i) => i.id) ?? []);
    setSelected((cur) => {
      const next = cur.filter((id) => present.has(id));
      return next.length === cur.length ? cur : next;
    });
  }, [diff]);

  const picked = useMemo(() => orderedSelection(diff, selected), [diff, selected]);
  // FK_ADDED 에 딸린 TABLE_ADDED·COLUMN_ADDED 를 함께 보낸다. 상한·안내 줄도 이 목록으로 센다.
  const ids = useMemo(() => orderedSelection(diff, withFkCompanions(diff, picked)), [diff, picked]);
  const extra = ids.length - picked.length;
  const block = busy ? "반영하는 중입니다." : applyBlockReason(ctx, ids.length);
  const onRowSelect = useCallback((keys: (string | number)[]) => setSelected(keys.map(String)), []);

  const send = useCallback(async (itemIds: string[]) => {
    const c = ctxRef.current;
    const mine = ++seq.current;
    setBusy(true);
    setResult(null);
    setStale(0);
    try {
      // 내 쓰기 줄이 빈 뒤 보낸다(README: apply 밖의 쓰기는 ctx.exclusive 안). baseRev 는 보낼 때의 rev 다.
      const r = await c.exclusive(() => applyDbDiff(c.modelId, ctxRef.current.state.rev, c.session, itemIds));
      if (seq.current !== mine) return;
      if (r.applied) {
        setResult(r.summary ? applySummaryText(r.rev, r.summary) : `rev ${r.rev} 에 반영했습니다`);
        setSelected([]);
        reloadRef.current();
        return;
      }
      ctxRef.current.notify(rejectionLine(r.rejection), "error");
      const staleIds = staleIdsOf(r.rejection);
      if (staleIds.length > 0) {
        setStale(staleIds.length);
        reloadRef.current();
      }
    } catch (e) {
      if (seq.current === mine) ctxRef.current.notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      if (seq.current === mine) setBusy(false);
    }
  }, []);

  const onApply = () => {
    if (block) return;
    const itemIds = ids;
    const n = removingCount(diff, itemIds);
    if (n === 0) {
      void send(itemIds);
      return;
    }
    showMessage({
      alertType: "confirm",
      title: "다시 가져오기 반영",
      message: `고른 항목 중 ${n}건은 모델에서 표·컬럼을 지웁니다. 그 표·컬럼에 걸린 키·관계도 함께 지워집니다. 반영할까요?`,
      onConfirm: () => void send(itemIds),
    });
  };

  const note = ids.length > 0
    ? `고른 ${ids.length}건${extra > 0 ? `(FK 에 딸린 ${extra}건 포함)` : ""}: ${selectionSummary(diff, ids)}${block ? ` — ${block}` : ""}`
    : block ?? "";

  return (
    <div data-testid="erd-diff-apply" style={WRAP}>
      <div style={BAR}>
        <Button size="sm" variant="primary" data-testid="erd-diff-apply-run" disabled={block !== null} onClick={onApply}>
          고른 항목 반영
        </Button>
      </div>
      <div data-testid="erd-diff-apply-note" style={NOTE}>
        {note}
      </div>
      {result && (
        <div data-testid="erd-diff-apply-result" role="status" style={RESULT}>
          {result}
        </div>
      )}
      {stale > 0 && (
        <div data-testid="erd-diff-apply-stale" role="alert" style={STALE}>
          고른 항목 중 {stale}건을 넣을 수 없습니다(차이 목록에 없거나 함께 고를 항목이 빠짐). 차이를 다시 읽었으니 다시 고르세요.
        </div>
      )}
      <div style={GRID_BOX}>
        <div style={FILL}>
          <AgDataGrid gridId="erdDbDiff" title="DB 차이" columnSizing="fit" columns={DIFF_COLUMNS} data={rows} rowKey="id"
            selectable multiSelect selectedRows={selected} onRowSelect={onRowSelect}
            emptyMessage={diff ? "DB 와 모델이 같습니다." : "DB 차이를 읽는 중입니다."} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 시험 통과·타입 검사·UI 점검 확인**

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/`
Expected: PASS — `db-diff-apply.test.ts` 11건, Task 14 의 세 파일, FE1 의 erdEdit 시험(검토 패널 DB 차이 탭 렌더 포함)이 그대로 통과한다.

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint`
Expected: 오류 0.

Run(리포 루트): `node .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.mjs audit src/frontend/m-mdm/pages/dma/erdEdit/panels/DbDiffApply.tsx && node .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.mjs audit src/frontend/m-mdm/pages/dma/erdEdit/panels/DbDiffApply.tsx`
Expected: 지적 0. 오탐이면 이유를 레인 보고에 적는다.

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm test`
Expected: m-mdm 전체 시험 통과(레인 머지 전 확인. 성능 묶음 `vitest.perf.config.ts` 도 `scripts/test.mjs` 가 함께 돈다).

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/frontend/m-mdm/pages/dma/erdEdit/panels/DbDiffApply.tsx src/frontend/m-mdm/tests/dma/erdEdit/db-diff-apply.test.ts
/usr/bin/git commit -m "$(cat <<'MSG'
feat(mdm): ERD 단계 2 다시 가져오기 반영 — 차이 항목 고르기·APPLY_DIFF·결과 요약

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
MSG
)"
```

레인 머지 전에는 Global Constraints 대로 레인 커밋을 하나로 합친다(`node .claude/skills/_shared/node/squash-branch.mjs --onto dev --rebase`). 레인 보고에는 다음을 적는다. 이 항목은 Task 16 의 브라우저 확인에 넘긴다.
- Step 10 의 칸 편집 방법(더블클릭·F2)
- 행 끌기 실제 동작
- Chrome 에서 Ctrl+Enter·Ctrl+Shift+Enter 가 그리드 칸에서 먹는지
- 오른쪽 칸 400px 에서 가로 스크롤이 없는지(`.erd-area-grid .ag-body-viewport` 의 `scrollWidth - clientWidth`, §30)
- 입력 칸이 그리드에 가리지 않는지(§45)
- `ruleEdit` 도메인 검색이 ERD 사용자 권한으로 되는지

---

## 계획 작성자 메모

- README 화면 내부 계약의 `ErdEditContext` 에는 고른 컬럼 칸이 없다. 그래서 컬럼 점프 → 그리드 행 고르기를 FE3 파일 안의 모듈 알림(`ColumnGrid.tsx` 의 `requestColumnFocus`·`subscribeColumnFocus`)으로 잇는다. `ctx.nav.selectColumn` 도 함께 부른다. FE1 의 `selectColumn` 이 그 컬럼의 표를 고르는(`selectedTableId` 를 바꾸는) 일을 한다고 가정한다. (정합 검토: FE1 Task 9 가 `ctx.selectedColumnId` 를 더했고 `nav.selectColumn` 이 표와 컬럼을 함께 고른다. 행 초점 알림은 조정자 판정으로 그대로 둔다.)
- 도메인 찾기는 `erdCall` 이 아니라 `callOasisAt(MDM_OASIS_BASE, "ruleEdit", "search", {target:"DOMAIN"})` 다. erdEdit 에는 도메인 목록 액션이 없다. columnMng 이 같은 길을 쓰고, `@/domain` 의 `DomainField` 를 다시 쓴다. ERD 사용자에게 `ruleEdit` 검색 권한이 없으면 찾기가 실패한다. Task 16 이 확인하고, 막히면 [추천](erdEdit `compare`)만 남는다.
- `APPLY_DIFF` 는 `ctx.apply` 의 명령 줄을 거치지 않는다. 그래서 `myRevs` 에 들지 않고(Ctrl+Z 대상 아님), 모델은 SSE 로만 바뀐다. 대기 묶음이 있으면 단추를 막는다.
- 스타일: `canvas/erd-styles.ts` 는 FE2 소유라 고치지 않는다. 인라인 토큰 스타일과 `ColumnGrid` 의 자기 `<style href="dmes-erd-grid">` 한 줄(대기 행 흐림)로 둔다.
- Local-Rules §30: 단계 1 의 컬럼 그리드는 fit 모드에서 `minWidth` 가 없어 최소 폭 합이 584px(> 400px 칸)이었다. 이 계획은 열마다 `minWidth` 를 주어 합을 380px 로 낮추고 시험으로 고정한다.
- Task 14·15 에는 README Review Focus 시험이 없다. 다른 Task 의 Review Focus 시험을 빌려 쓰지 않았다.
- 칸 편집(더블클릭·F2)이 happy-dom 에서 열리는지는 확인한 선례가 없다. Step 10 이 실행으로 정하고, 안 되면 그 시험 하나를 Task 16 브라우저 확인으로 넘긴다.
- 행 끌기 동작 자체는 happy-dom 에서 재현할 수 없다. 순서 → `moveColumn` 계산만 순수 함수로 시험하고, 끌기는 Task 16 에서 본다.
- `diffRows` 는 Task 9 가 `ReviewPanel` 에 남겼는지 `DbDiffApply` 로 옮겼는지 몰랐다. 정합 검토에서 확인: Task 9 가 `DbDiffApply` 로 옮기고 `ReviewPanel` 에서 지운다. 이 Task 는 같은 이름·값으로 내보낸다.
- 미리보기 디바운스 시험은 가짜 타이머 대신 실제 시간(100ms·400ms)으로 잰다. 가짜 타이머는 fetch 응답 처리 경로의 타이머까지 멈출 수 있어서다.
- Task 14 는 다섯 부품을 한 번에 다루어 이 문서가 브리프의 Task 크기(250~700줄)보다 길다. 그대로 두었다.
- 조정자 요청으로 `data-testid` 정본 표를 문서 앞(공통 명령 아래)에 두었다. 차이 항목 고르기 칸만 ag-grid 고르기 칸이라 testid 대신 선택자다.
- `DbDiffApply` 는 대기 묶음이 있으면 스스로 막지만, `APPLY_DIFF` 가 날아가는 동안 그리드·캔버스 편집은 막지 않는다. 그 사이 보낸 묶음이 "보내는 중" 일 때 `APPLY_DIFF` 의 SSE 에코(같은 세션)가 오면 FE1 `pending.ts` 규칙상 그 묶음의 에코로 잘못 볼 수 있다는 우려가 있었다. 조정자 판정으로 `APPLY_DIFF` 를 `ctx.exclusive` 안에서 보내게 고쳤다(따로 된 `-diff` 세션 이름은 쓰지 않는다). HTTP 호출이 도는 동안에는 그 사이 고친 묶음이 줄에서 기다리므로 "보내는 중" 묶음이 없다. 응답이 SSE 에코보다 먼저 오면 다음 묶음이 "보내는 중" 이 된 뒤 늦은 에코에 잠깐 가려질 수 있다(데이터 손실 없음, README "화면 내부 계약").
