# B. ERD tool UX complexity audit (dev 08f20794b)

- Scope: read-only audit of `src/frontend/m-mdm/pages/dma/erdEdit/**`. I also read the help doc (`docs/mdm/screens/erdEdit/erdEdit_사용자도움말.md`), the spec (`docs/superpowers/specs/2026-10-10-erd-tool-design.md`), the stage 2 plan README (S2-1 to S2-30), `docs/erd-tool/deferred.md`, the coordinator memo (`~/.coord/erd-stage2-1011/coordinator-memo.md`), and the server message strings under `src/backend/mdm/lib/.../dma/erdEdit`.
- Method: everything comes from reading the code. I did no browser work, and the sibling walkthrough `ux/C-walkthrough.md` did not exist yet when I wrote this. The first-screen descriptions and click counts are therefore **code-derived**. C should confirm them.
- Where the numbers come from:
  - **L_MAIN** (coordinator memo, 07:5x): mcm has 57 tables, 891 columns and 113 inferred relations. mdm has 46 tables, 855 columns, 59 DB FKs and 38 inferred relations.
  - **L_ERD12** (spec section 5, deferred 16 and 41): the status breakdown. MCM: OK 7, ALIAS 82, NEW 65, TYPE 27, DOMAIN 550, MISS 160. MDM: OK 13, ALIAS 171, NEW 14, TYPE 0, DOMAIN 634, MISS 23. On MCM, 67 of 108 inferred table pairs are drawn and 43 candidate rows are folded.
  - **First-confirm warnings** (S2-28 and help section 4.8): MCM 737 and MDM 657 `ERD_STD_*` warnings, plus 1 `ERD_INFERRED_LEFT` row. That makes about 738 rows for MCM.
- Ranking rule (section 5): (1) blocks finishing a task. (2) Silent divergence or irreversible loss. (3) Frequent friction. (4) Jargon. (5) Cosmetic.
  - Each problem is tagged with the users it hits: **V** viewer, **E** editor (owner or co-editor), **O** DRAFT owner, **C** Claude/CLI user.
  - Fix ideas marked **[approval]** touch a shared component or `VersionActionBar` props, or change an agreed rule. CLAUDE.md and S2-6 require user approval for these.

---

## 1. Concept inventory

The user needs about 9 concepts just to read a model. Editing alone adds about 15 more. Almost a third of the concepts that show up on screen are internal mechanics.

Verdicts:
- **E (essential):** the user really needs this concept.
- **A (advanced):** keep it, but show it only on demand.
- **L (leak):** an internal detail that appears in the UI.

| # | Concept | Where the user meets it (verbatim UI text) | Needed for | Verdict |
|---|---|---|---|---|
| 1 | Model (모델) | Top bar model buttons ("MCM 스키마"), "위 막대에서 모델을 고르거나 등록하세요." | everything | E |
| 2 | Module / schema / model ID / model name | [모델 등록] form has 4 fields ("모델 ID", "모듈", "스키마", "모델 이름"). Button tooltip `mcm · MCMAPUSER` | registering only | A. Three names for one thing; model ID and module are always equal (one model per module) |
| 3 | Diagram + business area (다이어그램 / 업무영역) | Left tree "기본 / 전체", wizard step "1. 이름" | reading | E (the two-level grouping is A) |
| 4 | Remove from diagram vs delete from model | `Delete` vs `Alt+Delete`/`⌥⌫`, toolbar "다이어그램에서 빼기 (Delete)" / "모델에서 삭제 (Alt+Delete)" | editing | E (exERD has it too), but the two actions differ only by a modifier key |
| 5 | Logical / physical mode + 3 presets + names-only below 50% zoom | [논리]/[물리], `F3`, "기본" / "E-R 개요" / "논리+물리 동시" | reading | E |
| 6 | Fold (3 modes) + audit toggle | "컬럼 모두 보이기" / "키 컬럼만" / "표 이름만", "감사 컬럼 보기", badges "감사 n", "접힘 · 컬럼 n개 숨김" | reading | A. With the preset and zoom rules there are **4 separate mechanisms** that hide columns |
| 7 | Version DRAFT / RELEASED + version number | Top bar `1.000` + status badge, banner "확정된 버전이라 모델을 고칠 수 없습니다. [새 버전]으로 DRAFT 를 만드세요." | editing | E for O. Viewers only need "can I edit or not" |
| 8 | Major / minor version | Two buttons [새 버전(major)] [새 버전(minor)] | O | A. A forced choice with no guidance |
| 9 | Owner (소유자) | Banner "소유자(41000207)에게 공동 편집자 등록을 요청하세요." | editing | E |
| 10 | Co-editor (공동 편집자), per version | [공동 편집자(n)] modal, free-text "사용자 ID" | team editing | E. "Per version" is a leak: the list must be entered again after every new version |
| 11 | Lock / unlock / handover (선점 / 해제 / 넘기기) | Version bar. [넘기기] is always disabled: "담당자 조회가 아직 없어 넘기기를 쓸 수 없습니다" | O | L (version-engine mechanics) |
| 12 | Version confirm + apply-from time | [확정] dialog, "적용 시작" text field `yyyy-MM-dd HH:mm:ss`, "(MDM006)" | O | E (confirm) / A (apply-from) / L (MDM006) |
| 13 | rev | Top bar "rev 12". Change log column "rev". Messages "rev 215 를 되돌렸습니다(rev 216).", "rev 216 에 12건을 반영했습니다", "41000207 님이 rev 215 에서 먼저 바꿨습니다." | none for humans | L |
| 14 | baseRev / getChangesSince | Server hints are shown as-is in the notice bar (section 2e) | none | L |
| 15 | Session (`ui-xxxx`, `claude-1a2b3c4d`, `cli-…`) | Change log "세션" column, avatar labels for LLM sessions, CONFLICT fallback text | none | L. S2-13 itself says UI session names "뜻이 없다" |
| 16 | Standard status, 6 levels | Grid "표준" badges: 표준 / 별칭 / 새 이름 / 타입 불일치 / 도메인 다름 / 사전 없음. Row colours | fixing standards | E (but 3 levels would carry the same decision: OK / 확인 필요 / 고칠 것) |
| 17 | Token statuses, 5 levels (토막) | Preview badges: 일치 / 동의어 / 후보 여럿 / 약어 없음 / 사전 없음. [토막 고르기] | adding columns | A. "사전 없음" means a different thing here than in #16 |
| 18 | Domain (도메인) and domain/type matching rules | Grid column, [추천], help section 6 matching table | fixing standards | E |
| 19 | Relation state DB / INFERRED / CONFIRMED / REJECTED | Solid vs yellow dashed line. Key marks `FK` vs `FK?`. REJECTED relations are invisible but still block a redraw | reviewing relations | E (inferred vs real). REJECTED-as-blocker is L |
| 20 | Evidence kinds DOC / SQL_JOIN / NAME_RULE | "근거" column shows raw codes, e.g. `NAME_RULE PK 이름 일치` | reviewing relations | A, shown as L (English codes) |
| 21 | Candidate rank / folding | "1순위", "후보 2", line label "다른 후보 n개" | reviewing relations | L (`candidateRank`) |
| 22 | Identifying vs non-identifying | Tools 4 / 5 | modelling | E |
| 23 | Presence / claim (작업 중 표시) | Avatars (raw user IDs or session names), canvas tag "· 작업 중", avatar tooltip "작업 중 표 n개" | collaboration | A (presence) / L (claim, TTL 600 s) |
| 24 | Two-layer pending model | Faded rows/nodes ("흐린 표·행"), "보내는 중인 변경이 끝난 뒤 반영하세요." | none | L (acceptable as "저장 중") |
| 25 | Reload markers (다시 읽기 지점) | Change log note "rev 300 에 다시 읽기 지점이 있어 그 앞의 기록은 보이지 않습니다.", RELOAD notice "모델을 다시 읽어 보내지 않은 변경 n건을 버렸습니다." | none | L |
| 26 | Model edit vs diagram edit permission | You can move or fold tables in a RELEASED version but not edit them. "이 버전에 소유자가 없어 아무도 다이어그램을 고칠 수 없습니다." | editing | L (S2-20 split leaks into banners) |
| 27 | Batch / CONFLICT / NOT_FOUND / INVALID / NEEDS_CHOICE | Notice labels 충돌 / 이미 지워짐 / 규칙 위반 / 선택 필요. Hints are LLM-oriented | editing | A (labels are fine, hints leak) |
| 28 | DB diff / re-import | Review tab [DB 차이], [고른 항목 반영], 7 kinds of differences | O, E | A |
| 29 | Two undo systems | `Ctrl+Z` (this tab, my changes) vs change log [되돌리기] (any rev in the last 100) | editing | E (undo) / L (two scopes, rev-based) |
| 30 | Audit columns (8) | Hidden by default, badge "감사 n", "감사 n 숨김" | none | A (hiding is good, but the count still leaks into red numbers, section 3) |
| 31 | MCP / ERD_USER / ERD_SESSION / dryRun | Only in the help doc and in [공동 편집자] ("Claude 세션은 ERD_USER 값을 넣습니다.") | C | L on the screen |

Tally: a viewer opening a model meets about 9 concepts (1, 3, 5, 7, 13, 16, 19, 21, 23). An editor making a first column change meets about 22. Of the 31 concepts, 9 are pure leaks (L) and about 6 more leak in part (rated A/L or E/L).

---

## 2. Task walkthroughs

Step counts are code-derived minimums, counting clicks and key presses. Ranges cover the common branches.

### (a) Open an existing schema and understand it

1. Portal menu `마루 MDM > 용어·도메인 > ERD 설계` (2 to 3 clicks).
2. The centre shows "위 막대에서 모델을 고르거나 등록하세요." No model is preselected, and the last model is not remembered (`ErdViewer.tsx:171`, `useState<string|null>(null)`). The user clicks [MCM 스키마] (1 click).
3. The canvas opens diagram "기본 / 전체" with **all 57 tables** and runs `fitView` at max zoom 1 (`ErdViewer.tsx:54,145`). With 57 tables and 891 columns the fit probably lands below 50% zoom, so only names show (code-derived; C should confirm).
4. At the same time the screen shows:
   - 113 inferred relations as yellow dashed lines. About two thirds are drawn; the rest are folded under "다른 후보 n개" labels.
   - A red number in every table header.
   - A red "737" next to "전체" in the left tree.
   - The bottom panel opens on **"표준 위반(802)"** (MCM: NEW 65 + TYPE 27 + DOMAIN 550 + MISS 160).
5. To understand one relation the user must find it in [추정 관계 검토(113)]. Relation lines can't be clicked: `edgesFocusable={false}`, and the label layer is `pointer-events:none` (`ErdRelationEdge.tsx:6`).
6. To understand one table: click it, then read the right-hand grid (7 columns). Comments are never shown.

- Decision points: which model; which of the 3 presets; which of 3 "find" keys (`Ctrl+K`, `Ctrl+T`, `Ctrl+F` with canvas focus only).
- Friction:
  - There is no model summary. The user never sees something like "표 57 · 관계 DB 0 / 추정 113 · 위반 737" together with "무엇부터 보라".
  - The legend (`DiagramTree.tsx:178-182`) explains 3 of the about 10 visual codes.
- Jargon: `rev 12` in the top bar, "1순위 / 후보 2", `FK?`, `NAME_RULE`.
- Steps to a first readable view: 4 to 6. Steps to understand one relation: 2 to 4, and only via the bottom panel.

### (b) Add a table with columns

1. Click an empty spot on the canvas to give it focus, then press `2` (or the toolbar [표 추가]). Click an empty spot again (2 to 3 actions).
2. Modal "새 표":
   - **Physical name first** ("물리명"), forced to upper case, with no dictionary help or preview.
   - Logical name second, optional.
   - Then [만들기].
   - This is the reverse of the column flow, which asks for the logical name and lets the server derive the physical name.
3. The server silently adds 8 audit columns, which are hidden.
4. Select the table. Below the grid, type the logical name in the input placeholder "새 컬럼 논리명 — Enter·Ctrl+Enter 로 추가", wait 0.3 s for the preview, then press `Enter`.
5. If a token is ambiguous: [토막 고르기] opens the modal "물리명 토막 고르기", where the user picks an abbreviation per token, then [적용].
6. PK column: there is no visible PK button. The user must know `Ctrl+Shift+Enter`. The button label changes to "PK 추가" only after that key is pressed with an empty input (`GridInputBar.tsx:196,313`).
7. Type and NN: edit the cell by double-click. The help says `F2` also works, but the coordinator memo says "그리드 F2 안 열림(더블클릭은 됨)".
8. Domain: select the row, then use the domain field or [추천] in the input bar. The domain column in the grid is not editable.

- Steps: 5 to 7 for the table, plus 2 to 4 per column, plus 2 to 3 per type/NN/domain change.
- Dead ends:
  - **No column delete.** A typo in a new column can be removed only by an immediate `Ctrl+Z` or by Claude/CLI `deleteColumn`.
  - **No table rename** (`updateTable`) and no comment editing anywhere.
- Silent divergence: the same input box does double duty. With a row selected, typing a new name and pressing `Enter` adds a **new** column instead of renaming. The help has to warn: "이때 `Enter` 를 누르지 마세요."

### (c) Add a relation

1. Give the canvas focus, then press `4` (non-identifying) or `5` (identifying).
2. Click the **parent first**, then the child. Nothing on screen says which order is right.
3. If a child column has the same name, modal "같은 이름의 컬럼" offers [있는 컬럼 쓰기] / [새 컬럼 만들기]. The choice applies to every column of the relation.

- Steps: 3 to 5.
- Dead ends:
  - **Self-reference** (e.g. `TB_MCM_SEC_MENU.PARENT_MENU_ID`) is **silently ignored**. `onConnect` returns early when `conn.source === conn.target` and shows no message (`useCanvasEditing.ts:223,228`).
  - **Identifying toggle, relation delete, column-pair edit:** not available on screen (help section 10.1).
  - **A relation that was rejected earlier** can't be drawn again. The server answers "규칙 위반" (duplicate rule, deferred 30). To revive it the user must find the reject rev in the change log. The log shows only counts per kind such as "관계 1", with no names (`ChangeLog.tsx:25`), so in practice the user can't find it.
- Reversed inferred relations (deferred 44): the user must reject the inferred one and then draw the correct one.

### (d) Fix a standard violation

1. Open the [표준 위반(n)] tab. Clicking a row **selects the table, not the column** (`ReviewPanel.tsx:135-137` passes `tableId`; the row also holds the column id, and `nav.selectColumn` exists and is used by `ColumnJump`).
2. Find the column in the grid yourself (scroll, or `Alt+O`).
3. The fix depends on the status:
   - **MISS:** type a new logical name in the input. Click [논리명 바꾸기]; pressing Enter would add a column instead. [물리명도] is **on by default** (`GridInputBar.tsx:137`), so the **physical name changes too**, and the model now differs from the DB. The help notes this, but the click gives no warning.
   - **DOMAIN:** use [추천], the domain field, or the type cell. Of these, 550 (MCM) and 634 (MDM) are dictionary-vs-schema gaps (deferred 41) that the modeller can't really fix. They are noise in this tab.
   - **TYPE:** "같은 물리명을 쓰는 다른 표의 컬럼과 타입을 같게 맞추세요". The screen has no way to list those other columns.
   - **NEW:** can't be fixed on this screen ("이 화면에서는 등록하지 않습니다").
4. Trap (help section 4.8): editing only the logical name of an old violating column makes it a "changed" column. Its warning then becomes a **confirm-blocking error**.

- Steps: 4 to 8 per column.
- Decision points: 6 statuses × 3 counting rules (section 4).

### (e) Undo a mistake

- `Ctrl+Z` works only with focus outside text inputs; inside an input it undoes text. It covers only "my changes in this tab". The list is lost on page reload or on a model reload.
- **After two edits in a row to the same property (A, then B), the first `Ctrl+Z` (undo B) works and the second (undo A) fails with CONFLICT.** The restore conflict check has no same-session test (`ErdCommandEngine.java:581`: `if (pr != null && pr.rev() > since) throw restoreConflict`). Undoing B stamps the property with a newer rev, so undoing A conflicts. Undoing edits to different properties works. Help section 9.3 confirms the rule: "내 변경 포함".
- The resulting notice shows the server hint as-is, followed by the screen hint: "getChangesSince 로 확인한 뒤 직접 고치세요 변경 기록에서 다른 변경을 고르세요." (`ErdCommandEngine.java:594`, `ErdViewer.tsx:60,425`).
- The change log columns are `rev | 나 | 사용자 | 세션 | 출처 | 변경`, where 변경 is only a count per kind (for example `표 1·컬럼 n·배치 1`). There are no element names and no before→after values, so the user can't tell which row to undo.
  - Adding one table from the canvas includes "컬럼 8" from the hidden audit columns.
- DB-diff applies are not undoable with `Ctrl+Z`.
- There is no redo. The help suggests "되돌린 rev 를 변경 기록에서 다시 되돌리세요".
- The success message is "rev 215 를 되돌렸습니다(rev 216)."
- Steps: 1 if the shortcut works; otherwise 3 to 5 plus guessing in the log.

### (f) Confirm a version (owner only)

1. Version bar [확정]. The same label is used for relation confirm in the inferred-review grid.
2. The dialog runs the check. The summary reads "오류 0건 · 경고 738건 · 남은 추정 관계 113건(확정을 막지 않습니다)".
3. Groups are headed by **raw codes**: "ERD_STD_DOMAIN · 550건", "ERD_STD_MISS · 160건", "ERD_STD_TYPE · 27건", "ERD_INFERRED_LEFT · 1건".
   - "ERD_INFERRED_LEFT" repeats what the summary already says.
   - Items read "TB_X.COL 표준 위반(DOMAIN)", with English status names, while the grid shows "도메인 다름".
   - Each group shows the first 50 items, then "… 500건 더 있습니다."
4. Tick "경고 738건을 확인했습니다".
5. Check "적용 시작" (free-text `yyyy-MM-dd HH:mm:ss`). A future time shows "…새 버전을 만들 수 없습니다(MDM006)."
6. Click [확정].

- Steps: 4 clicks minimum, plus reading.
- Second confirm onwards: added or changed columns with TYPE/DOMAIN/MISS are **errors that block confirm**.
- **Likely trap (unverified):** new tables get 8 hidden audit columns.
  - The engine fills their domain from the dictionary (`ErdCommandEngine.java:100-106`, `fillByPhys`) but keeps the DB type (`TIMESTAMP(6)`, `VARCHAR2(100)`).
  - deferred 41 lists `TIMESTAMP(6)` vs 일시 DATE and `VARCHAR2(100)` vs STRING(150) as the most common DOMAIN mismatches.
  - `ErdConfirmCheck` has no audit exemption.
  - If those domains resolve, every new table blocks the next confirm through columns the user can't see. The help (section 4.11) says "이 경고는 그대로 받아들입니다", which contradicts this.
  - I could not find close evidence to confirm or rule this out. It should be tested before the stage 3 design.

### (g) Start editing again after a confirm

1. Banner: "확정된 버전이라 모델을 고칠 수 없습니다. [새 버전]으로 DRAFT 를 만드세요."
2. Choose [새 버전(major)] or [새 버전(minor)]; nothing on screen says which to pick.
3. Possible failure: "새 버전: … MDM006 …" if the apply-from time is still in the future.
4. The new DRAFT starts with **no co-editors**. Each one is re-added by hand: [공동 편집자(0)], type the ID, [더하기]. That is 3 actions per person, including Claude's `ERD_USER`.
5. The change log shows the reload-marker note. The `Ctrl+Z` history is gone.

- Steps: 2 + 3n.
- If someone else must own the new draft: [해제] → they [선점]. [넘기기] stays disabled.

### (h) Re-import DB changes

1. Bottom tab [DB 차이]. The count appears only after the tab is opened (`ReviewPanel.tsx:141`).
2. [다시 읽기] if the DB changed just now.
3. Tick rows. There are 7 kinds: "DB 에 생긴 표", "DB 에서 사라진 표", … , "DB 에서 사라진 FK".
4. [고른 항목 반영].
5. If anything removes tables or columns, a confirm dialog appears.
6. The result reads "rev 216 에 12건을 반영했습니다 — 표 추가 1 · 컬럼 추가 3".

- Steps: 4 to 6.
- Friction:
  - Picking an FK adds dependent items silently (shown only as "(FK 에 딸린 n건 포함)").
  - **Re-imported new tables are not placed on any diagram** (coordinator memo, T16 deferred candidate), so nothing shows up on the canvas.
  - The apply is not undoable with `Ctrl+Z` (log only).
  - Three names for one feature: [DB 가져오기] (disappears after the first import), tab "DB 차이", dialog title "다시 가져오기 반영".
  - This can't be done through Claude/MCP ("DB 차이 반영은 화면에서만 됩니다").

### (i) Work with a colleague at the same time

1. The owner opens [공동 편집자(n)], types the colleague's **user ID** (e.g. `41000207`), then [더하기]. There is no search and no existence check ("사용자 ID 는 서버가 있는지 보지 않는다", `EditorsModal.tsx:5`).
2. The colleague opens the screen and picks the model; the last model is not remembered.
3. Both see avatars labelled with raw user IDs. Claude shows up as `claude-1a2b3c4d`.
4. On a clash the notice bar shows: "충돌 41000207 님이 rev 215 에서 먼저 바꿨습니다. 지금 값: "메뉴명" getChangesSince(212) 로 최신 값을 읽고 다시 보내세요 내 값 "메뉴 이름" [내 값 복사] [닫기]" (`Ctx.java:90-91`, `edit-context.ts:98`).

- Steps: 3 to set up, plus a list to re-enter every version.
- Friction:
  - Only the owner can confirm.
  - Co-editors can't manage co-editors.
  - A dropped stream blocks all editing with "실시간 연결이 끊겨 편집을 멈췄습니다…".
  - **Fold state is stored on the server per diagram node.** If I fold a table, it changes my colleague's view too. By contrast, the audit toggle is per-browser.
- The help doc still marks the two-person browser test as "(확인 예정)".

### (j) Ask Claude to help

Setup (help section 7.1):
1. `pnpm install` at the repo root.
2. MDM server running.
3. Start `ERD_USER=<내 ID> claude` **at the repo root**.
4. Approve the `.mcp.json` server.
5. Check `/mcp`.
6. Make sure the owner has added `ERD_USER` as a co-editor. Otherwise every write fails with `NOT_EDITOR`.

- That is 6 setup steps, none of them on the screen. There is no "Claude 에게 맡기기" button (deferred 21).
- **Observed in this very session:** the `erd` MCP server failed to connect ("CONNECTION_CLOSED"). I did not investigate the cause.
- At work time:
  - Claude reads the user's selection through `getCurrentView`.
  - Its writes appear live, with the avatar `claude-xxxxxxxx` and the tag "· 작업 중".
  - The change log shows source `MCP`.
- Structural issue: Claude/CLI can do things the screen can't (column/relation delete, rename, keys, identifying toggle, self-reference). So **Claude is the workaround for missing basic features**, not an optional helper.
- The CLI path requires hand-written JSON batches with `baseRev` and `--apply` (help section 8.1).

---

## 3. Information overload

| What | Size | Source |
|---|---|---|
| First screen before any click | Empty canvas with "위 막대에서 모델을 고르거나 등록하세요." No preselection | `ErdViewer.tsx:171,584` |
| First model screen | One diagram with every table (57 / 46). Likely names-only zoom | import creates "기본 / 전체" |
| Inferred lines | 113 (mcm, L_MAIN). On L_ERD12, 67 of 108 table pairs are drawn, plus "다른 후보 n개" labels | memo, deferred 16 |
| Default bottom tab | "표준 위반(802)" MCM / "(671)" MDM. The count includes NEW, which needs no action on this screen | `ErdViewer.tsx:195`, `ReviewPanel.tsx:42` |
| Left tree red number | 737 next to "전체" | `DiagramTree.tsx:45` |
| Table header red numbers | Count **hidden audit columns** too (`erd-flow.ts:337` uses the full `columnOrder`), so the red number can be larger than the red rows the user can see | code |
| DOMAIN on audit columns | Part of DOMAIN 550 / 634. In MCM/MDM, 69 / 82 come from `TIMESTAMP(6)` vs 일시 DATE, likely mostly `C_AT`/`U_AT` (not verified column by column). The help tells users to ignore them | deferred 41, help 4.11 |
| First confirm dialog | About 738 rows in 4 code groups, the first 50 of each listed, plus one acknowledgement checkbox | S2-28 |
| Controls on screen at once | Top bar: model buttons + [모델 등록] + ver + badge + rev + avatars + 2 mode + 3 preset (about 12). Version bar: 8. Canvas toolbar: 12 icons. Left: 2 buttons + legend. Grid: 7 columns + input bar with up to 2 buttons, checkbox, domain field, [추천]. Review: 4 tabs + reload. **About 45 controls**, before any modal | code |
| Shortcuts | 20 rows in the help table, 6 of them OS-dependent | help section 5 |
| Help doc | 668 lines. "먼저 알아 둘 말은 네 가지" but the glossary has 25 terms | help |
| Colour overload | See below | `canvas/erd-styles.ts:12-47` |

Colour overload in detail:
- **Red** means four things: physical-mode canvas background (`--color-danger-soft`), MISS rows (same token), header violation count, and the danger delete icon.
- **Yellow/warning** means five things: inferred dashed lines, TYPE/DOMAIN rows, the PK key mark, the "다른 후보" label, and human presence name tags (`.erd-viewer`).
- In physical mode a MISS row is drawn with the same tint as the whole canvas.

---

## 4. Inconsistencies

**Keys and OS:**
- Find table has three keys (`Ctrl/⌘+K`, `Ctrl/⌘+T`, `Ctrl/⌘+F`), each with different focus rules. Chrome may take `Ctrl+T` first.
- Column jump: `Ctrl+O` or `Alt+O` (`⌥O`). Parent/child table: `Ctrl+↑` or `Alt+↑`; macOS takes `Ctrl+↑`.
- Delete from model: Windows `Alt+Delete`/`Alt+Backspace` vs Mac `⌥⌫`. Plain `Backspace` = remove from diagram.
- Number keys work only when the canvas has focus. `Ctrl+Z` means text undo inside inputs and model undo elsewhere. `Esc` has three layered meanings.

**F2:** the help (sections 4.2 and 5) says `F2` opens the cell editor. The coordinator memo (T16) says it doesn't; double-click works. This is a doc/behaviour mismatch, and the fix probably lives in shared `AgDataGrid` **[approval]**.

**What the screen remembers:**

| Setting | Remembered? |
|---|---|
| Audit toggle | Yes, per browser (localStorage) |
| Positions and fold | Yes, on the server, **shared with everyone** |
| Mode, preset, model, diagram, review tab, find options | No. Reset on every open (`ErdViewer.tsx:171-195`) |

**Same word, different meaning:**
- [확정] = relation confirm and version confirm.
- "사전 없음" = column MISS and token UNKNOWN.
- "다시 읽기" = reload button, plus "다시 읽기 지점" (reload marker), plus the RELOAD notice label "다시 읽음".

**Three definitions of "violation":**

| Place | NEW | TYPE | DOMAIN | MISS |
|---|---|---|---|---|
| Tab "표준 위반" | counted | counted | counted | counted |
| Node / tree red number | — | counted | counted | counted |
| Confirm check | — | counted | counted | counted |

**Naming direction:** a new table asks for the physical name first with no preview. A new column asks for the logical name first, and the server fills the physical name.

**Where a property is edited:**
- In the grid: logical, physical, type, NN.
- In the input bar: domain and logical rename.
- Nowhere: comment.

**Row click target:** violation-row click → table. Column-jump pick → column.

**Undo has three scopes:** `Ctrl+Z` (tab, mine, since load), change log (any, last 100 revs, stops at the reload marker), DB-diff apply (log only).

**Permissions:** on a RELEASED version you can move and fold but not edit. On an owner-less version you can do neither. The banner wording differs for each case.

**Error tone:**
- Most refusals show a notice.
- Self-reference shows nothing.
- `Ctrl+Z` with nothing to undo shows a warn-tone message line: "되돌릴 내 변경이 없습니다."
- Version-bar failures show the raw server text with an MDM code.

**Language mix:**
- Korean labels: "도메인 다름".
- English codes in the same flows: `(DOMAIN)`, `ERD_STD_DOMAIN`, `NAME_RULE`, `SQL_JOIN`, `DOC`, `MCP`, `UI`.
- API names in hints: `getChangesSince`, `view`, `baseRev`, `restore`.
- Server strings that reach humans: `Ctx.java:91`, `Ctx.java:197`, `ErdCommandEngine.java:594`, `ErdIntegrity.java:102`, `ErdDiagramStore.java:223`, `ErdCommandService.java:236-239`.

**Dead UI:** [넘기기] is always shown and always disabled. Its removal needs a `VersionActionBar` prop change **[approval]**.

**Hidden mode:** the "PK 추가" mode appears only after pressing `Ctrl+Shift+Enter` with an empty input.

---

## 5. Top 15 complexity / UX problems (ranked)

Severity: **H** high / **M** medium / **L** low. Users: V viewer, E editor, O owner, C Claude/CLI user.

Order: by the ranking rule in the header (category first: dead ends, then silent divergence, then frequent friction, then jargon, then cosmetic), and by breadth of users within a category. So #3 (silent physical-name change) and #4 (rejected-relation dead end) rank above jargon (#6) and first-open overload (#7).

| # | Problem | Sev | Who | One-line simplification idea |
|---|---|---|---|---|
| 1 | **Basic edits are dead ends on screen:** column delete, relation delete, table rename, comment edit, identifying toggle, key edit, self-reference (silently ignored). Users are sent to Claude/CLI | H | E | Fill the gaps with context-menu and grid-row actions. The engine already has `deleteColumn`, `deleteRelation`, `updateRelation`, `updateTable`, `addKey`/`updateKey`. Let `source === target` open a "자기 참조 관계" flow instead of returning silently |
| 2 | **Confirm is overloaded and has traps:** about 738 raw-code rows, a meaningless ack checkbox, a free-text apply-from, MDM006. On the 2nd confirm, touching an old column or adding a table (hidden audit columns, likely) blocks confirm | H | O | Summary-first dialog ("이번 버전에서 바꾼 것 0건 문제 · 기존 위반 737건(이번 확정과 무관, 펼쳐 보기)"). Apply-from defaults to now under "고급". Exempt audit columns or give them matching domains. Korean status names. **[approval for rule change]** |
| 3 | **The input box is dual-purpose and changes physical names silently:** `Enter` always adds a column, even when the user meant to rename. [물리명도] is on by default and makes the model diverge from the DB | H | E | Add new columns through a blank last grid row (exERD style). Rename in place with a preview popover. Default [물리명도] to off for imported columns, with the warning "DB 와 달라집니다" |
| 4 | **Rejected relations block redraws and can be revived only through an unnamed change-log row** | H | E | Add a "기각한 관계" filter with [되살리기]. On a duplicate refusal, offer "기각한 관계를 되살릴까요?" |
| 5 | **Undo is unreliable:** after two edits to the same property, the 2nd `Ctrl+Z` gives CONFLICT. It is tab-local and lost on reload. The log has no element names or values. No redo. | H | E | Let one session's consecutive undos pass. Show "표.컬럼 논리명 '가'→'나'" in the log. Hide the session column. Add redo. **[approval: S2-5 rule]** |
| 6 | **Internal terms reach humans:** rev, `getChangesSince(212)`, baseRev, MDM006, `ERD_STD_*`, `NAME_RULE`/`SQL_JOIN`, `ui-` sessions, "다시 읽기 지점", `candidateRank` "후보 2" | H | V E O | Split server `hint` into `hint` (LLM) and a human message. Map codes to Korean sentences in `edit-context.ts`. Move rev into a tooltip. Translate evidence kinds ("이름 규칙", "SQL 조인", "설계 문서") |
| 7 | **First open is overloaded:** no model preselected, the whole schema in one diagram, 113 dashed lines, default tab "표준 위반(802)", red numbers everywhere, partial legend | H | V | Remember the last model and diagram. Open on a model summary card. Make "추정 관계 보기(113)" a toggle, off by default once reviewed. Default the violations filter to TYPE/DOMAIN/MISS, with dictionary-gap DOMAIN grouped |
| 8 | **Fixing a violation is indirect:** row click selects the table, not the column. No per-status action. TYPE has no "same name elsewhere" list. NEW can't be fixed here. 550/634 DOMAIN rows are dictionary gaps the modeller can't fix | M | E | Row click → `nav.selectColumn` (cheap). Per-row quick-fix button ([추천 도메인 적용], [같은 이름 컬럼 보기]). Separate "사전 정비 필요" from "모델에서 고칠 것" |
| 9 | **Relations aren't interactive on the canvas:** the user can't click a line to see, confirm, reject, delete or toggle it. "다른 후보 n개" can't be clicked. Draw direction depends on click order with no cue | M | V E | Clicking a line opens a popover (부모 / 자식 / 근거 / [확정] [기각] [삭제] [식별 전환]). Show the direction while drawing |
| 10 | **Version and ownership machinery is shown to everyone:** 8 version buttons (major/minor, 선점/해제, a dead 넘기기). Co-editors must be re-entered every version as free-text IDs | M | O E | Collapse into a "버전" menu with a single [새 버전] (minor by default). Carry co-editors forward. Pick users from a search. Hide 넘기기 **[approval: VersionActionBar]** |
| 11 | **Re-import is fragmented:** new tables aren't placed on any diagram. The apply can't be undone with `Ctrl+Z`. Three names (가져오기 / 차이 / 다시 가져오기). The count is hidden until the tab opens. Not available through MCP | M | O E | Auto-place new tables on "기본 / 전체". Put a [되돌리기] button in the result line. One name ("DB 와 맞추기"). Show the count badge after load |
| 12 | **Shortcuts depend on OS and focus, and some are broken:** 3 find keys, Ctrl/Alt pairs, number keys only on the canvas, F2 doesn't work, `Ctrl+Z` means text undo in inputs | M | E | One key per action, a "?" cheat-sheet overlay, focus hints. Fix F2 **[approval: shared AgDataGrid]**. Fix the doc |
| 13 | **What is remembered is inconsistent:** the audit toggle is remembered; mode, preset, model, diagram and tab are not. Fold is shared on the server, so one user's fold changes everyone's view | M | V E | Store per-user view state in localStorage. Make fold per-user, or label it "모두에게 보입니다". **[approval: diagram data rule]** |
| 14 | **Two permission layers and four read-only banners:** move/fold allowed on RELEASED but edit not; owner-less versions block both; different wording each time | L | V E | One state chip ("읽기 전용 · 이유") with a single call to action ([새 버전 만들기] / [편집 요청]) |
| 15 | **Claude setup is fragile and outside the screen:** 6 setup steps, a mandatory `ERD_USER` + co-editor pairing, `pnpm install`. The MCP connection failed in this session. Sessions show as `claude-1a2b3c4d` | L | C | A screen panel "Claude 연결" with a copyable command (ERD_USER prefilled from login) and a one-click "이 버전에 Claude 허용". Label avatars "Claude (홍길동)" |

Below the cut, worth noting:
- Colour overload (physical-mode red = MISS red; yellow = 5 meanings).
- The new-table modal has no dictionary preview.
- PK add is hidden behind a hotkey.
- The change log counts 8 columns for one new table.
- Node red counts include hidden audit columns.
- The model-register form has 4 fields where 2 would do.
- The registered model can't be deleted (deferred 40).

### Cross-cutting simplification themes (for the coordinator synthesis)

1. **Hide the machinery.** rev, sessions, claims, reload markers, candidate ranks and lock/unlock are system state. Show them only in tooltips or in an "자세히" drawer.
2. **One scoreboard.** Use one violation definition and one number. Split "모델에서 고칠 것" from "사전 정비 필요" and "참고(NEW)".
3. **Progressive disclosure for owners.** Version actions, apply-from and co-editors go in one menu. Viewers and editors never see them.
4. **Close the screen gaps before adding new features.** Claude should be an accelerator, not the only path for delete or rename.
5. **Plain-language messages.** Every refusal should say what happened, whose change it was (by name) and what to click next. The LLM hints stay in MCP output only.
