# C — ERD screen first-time-user walkthrough (read-only)

- Target: http://localhost:5100 (L_MAIN, dev 08f20794b), login admin/admin123, 2026-10-11.
- Route: 마루 MDM > 용어·도메인 > ERD 설계. Models: MCM 스키마 (mcm · MCMAPUSER, 57 tables, 113 inferred relations), MDM 스키마 (mdm · MDMAPUSER, 45+1 tables).
- Browser: ego-browser TaskSpace 19, window 2560x1164 (DPR 1). The layout section also emulates 1440x900 and 1920x1080.
- No writes: I did not save, confirm, lock, copy, import, add an editor or undo anything. I opened dialogs and then closed or cancelled them. I did not press ⌘Z, Delete or ⌘D, because they are bound to server writes.
- Screenshots: `shots/` next to this file.

## Findings

1. **[high] The canvas opens at 10 % zoom, so the first view is unreadable.** I opened MCM 스키마, and the viewport came up at `scale(0.1)` (MDM: 0.118). The 57 tables show as specks in a narrow vertical band in the middle of a 1658 px wide canvas, and the ~113 dashed lines show as hairlines (`04-mcm-open.png`, `08-canvas-default-zoom.png`, `37-mdm-open.png`). The cause is the layout: the rendered nodes span about 1700 px wide but about 6000 px tall (y 2762–8794), a tall single column. Fit-to-view clamps at the 0.1 minimum zoom. "화면 맞춤" and "E-R 개요" + 화면 맞춤 give the same 0.1 view (`26-er-overview-fit.png`). A first-time user sees an empty-looking canvas and cannot tell that a model loaded.
2. **[high] Admin is read-only, and the screen gives no usable way out.** A yellow banner says "공동 편집자가 아니어서 읽기만 할 수 있습니다. 소유자(41000132)에게 공동 편집자 등록을 요청하세요." The owner is shown only as a raw employee number, with no name or contact. A system admin gets no override. In the 공동 편집자 dialog, the user-ID field and the 더하기 button are disabled (`34b-coeditors-crop.png`). The same sentence appears in up to three places at once (top banner, right panel footer, DB 차이 tab) and in every disabled-icon tooltip (`05-mcm-toolbar-crop.png`, `07-disabled-icon-hover.png`, `13-right-panel-crop.png`, `32-dbdiff-loaded.png`).
   - What admin can do: open models, pan/zoom, F3, presets, the audit toggle, ⌘K find, Alt+O/Alt+↑↓, read all four bottom tabs, open the 공동 편집자 dialog, and open the 모델 등록 inline form. Its 등록 submit is **enabled** for this read-only admin: in `panels/TopBar.tsx` the opener is shown when `canReg` is true, and the submit is disabled only while a request is pending. I did not click it.
   - What admin cannot do: new version, delete, 확정, 선점/해제, add or delete tables or relations, column edits, 확정/기각 in review, DB-diff apply, 되돌리기, and the view-only icons 컬럼 모두 보이기/키 컬럼만/표 이름만 (see 15).
3. **[high] The canvas gets a small share of the screen.** See "Space / layout" below: the canvas is 16 % of a 1440x900 screen and 28 % of a 1920x1080 screen, and nothing in the ERD area can be resized or collapsed.
4. **[med] The disabled "확정" button looks active.** In the version bar, every disabled button is grey except "확정", which keeps a filled blue primary style. It reads as "selected" or "already confirmed" (`05-mcm-toolbar-crop.png`).
5. **[med] The version bar has no explanations.** 새 버전(major)/새 버전(minor)/삭제/확정/선점/해제 have no tooltips. "넘기기(준비 중)" ships as a visible "coming soon" button. The meta "1.000 · 작성 중 · rev 2" has no tooltip, except "작성 중", whose tooltip is the English "DRAFT" (`06c-hover-rev.png`).
6. **[med] ⌘K find works but is easy to miss.** ⌘K (also the "표 찾기 (⌘K)" button) opens a VS-Code-style find bar in the far top-right corner, away from the button on the left (`09-cmdk.png`). On the first open, the left button vanished and the panel content shifted. While you type, the counter reads "0/2" and nothing moves until Enter, so "0" looks like "no match" (`10b-find-typed-crop.png`). The exact name "TB_MCM_SEC_MENU" also gives 0/2 because it is a substring match (it also hits _FLD) (`27a-find-exact.png`). After Enter, the canvas jumps to zoom 0.8, centres the table and selects it (`11-find-enter.png`). Korean logical-name search works ("코드" → 7 hits, `38-find-korean.png`).
   - Steps from login to TB_MCM_SEC_MENU on screen: 3 menu clicks + 1 model click + ⌘K + type + Enter = 7 actions, about 15 s for someone who already knows ⌘K. Without ⌘K there is no way to find it visually at 10 % zoom.
7. **[low] The menu location is not obvious.** ERD 설계 sits under 마루 MDM > 용어·도메인, three levels deep, next to 컬럼 사전. A designer would not look for an ERD tool under "terms/domains" (`03-erd-initial.png`).
8. **[med] The empty and initial states mislead.** Before you pick a model, the bottom grid shows the loading message "표준 상태를 읽는 중입니다.", although nothing is loading (`03-erd-initial.png`). After a page reload the portal reopens the ERD tab, but the model, the bottom tab and the zoom are forgotten, and the empty state returns (`L5-after-reload.png`).
9. **[med] The legend and colour coding are weak.** The left legend is three plain text lines without swatches. "노란 파선: 추정 관계" does not match the lines, which render dark amber or brown. The legend does not explain the red number in each table header (tooltip: "표준 위반 n건"), the "감사 8" chip, "FK?", "PK", or the "다른 후보 1개" edge labels (no tooltip, `41-candidate-label-hover.png`). Most rows are yellow ("타입·도메인 다름"), so the canvas becomes a wall of yellow and pink, and the colour stops working as a signal (`12-sec-menu-zoom-crop.png`).
10. **[med] Many logical names cannot be read.** Unknown words show as "***", for example "*** ***", "*** 아이디", "*** JSON" and "이비즈 *** ***". Mixed generated names like "작업 Kind", "Next 운전 AT" and "요청 User 아이디" also appear. In logical mode, TB_MCM_SEC_MENU shows three identical rows "메뉴 파라미터", and TB_MDM_CODE shows "속성 명" twice, so you cannot tell those columns apart without F3 (`12-sec-menu-zoom-crop.png`, `30-review-row-click.png`, `39-mdm-wheel.png`).
11. **[med] The column order breaks ERD convention.** The PK is not first: MENU_ID (PK) is row 8 of 16 in TB_MCM_SEC_MENU. When "감사 컬럼 보기" is on, the 8 audit columns are mixed into the middle (등록 일시 is row 3, 최종 변경 일시 row 6) instead of grouped at the end (`27-audit-on.png`).
12. **[med] The right panel (400 px) truncates most of its content.** The table's logical name shows as "메...". "감사 8 숨김" wraps onto two lines. The 키 column is so narrow that "PK" is not visible: the DOM has "PK", but the cell renders blank. 논리명, 물리명, 타입 and the 표준 badges ("도메인 다…") are cut off, and the NN header shows "N.." (`13-right-panel-crop.png`).
13. **[med] The violation counts disagree, and the bottom list ignores the selection.** The left tree shows 737 (tooltip "표준 위반 컬럼 수"), the tab shows 표준 위반(802), and each node shows its own count (for example 21). The relationship between these numbers is not explained. The 표준 위반 grid does not filter or scroll to the selected table; it always starts at SAMPLE_MASTER_CODE (`11-find-enter.png`, `14-alt-up.png`, `35-left-diagram-list.png`).
14. **[med] Presets drop the selection and do not re-fit.** "E-R 개요" and "논리+물리 동시" clear the selected table, and the right panel goes back to "0건". "E-R 개요" shrinks boxes to their names but keeps the full-size spacing, so small boxes float in large gaps with no re-fit (`24-preset-er.png`). With "논리+물리 동시" on, the separate "논리" toggle also stays highlighted, so two mode indicators are lit at once (`25-preset-both.png`).
15. **[low] Toolbar tooltips are partly helpful.** Enabled icons have good tooltips with keys, for example "선택 (1)" and "감사 컬럼 보기 — 꺼짐 (켜면 C_/U_ 8개가 보임)" (`06-icon-hover.png`, `06b-icon-hover-audit.png`). Every disabled icon shows the same long read-only sentence instead of its own name, so a viewer cannot learn what the icons do (`07-disabled-icon-hover.png`, `07b-disabled-keyonly-hover.png`). The view-only icons 컬럼 모두 보이기/키 컬럼만/표 이름만 are disabled for read-only users, although the presets do the same thing and are enabled.
16. **[low] The zoom controls mix languages.** The tooltips are "Zoom In"/"Zoom Out" (English) next to "화면 맞춤" (Korean). The control cluster also sits over table nodes (`39-mdm-wheel.png`).
17. **[low] Shortcuts are hard to discover.** Only ⌘K appears in the UI. F3 appears only in the title of the 논리/물리 buttons. Alt+O, Alt+↑/↓ and Shift+1/2 appear nowhere, and there is no shortcut help (?) panel.
   - Alt+↑/↓ works: TB_MCM_SEC_MENU → TB_MCM_SEC_MENU_FLD and back (`14-alt-up.png`).
   - Alt+O opens "컬럼 점프 — TB_MCM_SEC_MENU" (the word "점프" is jargon); typing MENU_NM and pressing Enter selects the column in the right grid (`17-alt-o-typed.png`). A stray "컬럼" header tooltip stays floating over the dialog grid.
   - Shift+1 and Shift+2 changed nothing in two tries. They are **bound but not wired**: `ERD_CANVAS_SHORTCUTS` includes the shared `fitView`/`fitSelection` keys, but the handler map in `canvas/useCanvasEditing.ts` has no entry for them. Ctrl/⌘+F is wired to table find.
   - ⌘Z is bound to a **server-side undo of my last revision**. A user who expects local undo could revert a saved change. I did not test it.
18. **[low] The physical-mode cue is unexplained.** F3 switches in about 0.2 s, and the canvas background changes from blue-grey to pink. That is a nice cue, but nothing says pink means physical mode. During the switch, both 논리 and 물리 dim for a moment (`19-f3-physical.png`, `22-physical-settled.png`).
19. **[med] The 추정 관계 검토 (113) tab is hard to act on.** The 근거 column shows raw repository paths, cut off: "SQL_JOIN src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/V1__baseline.sql:1108". The 후보 column values "1순위" and "후보 2" are unexplained, and the action column has no header. For read-only users, 확정/기각 are disabled without a tooltip. Clicking a row selects the child table and pans to it, but the relation line itself is not highlighted (`29b-review-crop.png`, `30-review-row-click.png`). Only about 6 rows fit in the fixed 260 px panel.
20. **[low] The DB 차이 tab is mostly fine.** The empty state "DB 와 모델이 같습니다." is clear (spacing typo: "DB와"). The tab's count only appears after you open it, while the other tabs always show counts. "다시 읽기" appears next to the tab strip only on some tabs. "고른 항목 반영" is disabled (`32-dbdiff-loaded.png`).
21. **[med] The 변경 기록 tab lacks basic information.** There is no date/time column. One column has a blank header (col-id "who"). The user shows as raw "41000132", and the session shows as ids like "ui-rue1jj0f" or "sample-import". The summary "배치 57" is ambiguous: 배치 can mean "layout placement" or "batch". Each row has a 되돌리기 button, disabled without a reason (`33b-history-crop.png`).
22. **[low] The presence chips are confusing.** "나" plus a second "admin" chip appear, the second being another session of the same account. The tooltips show session ids ("admin · ui-iws2061i · UI") (`27-audit-on.png` header).
23. **[low] The 공동 편집자 dialog layout is broken.** The grey footer band with 닫기 floats in the middle of a fixed-height dialog, with a large empty white area below it. The owner id is repeated twice in one sentence (`34b-coeditors-crop.png`).
24. **[low] 모델 등록 is a bare inline form.** It opens a row of four inputs that have placeholders only (모델 ID / 모듈 / 스키마 / 모델 이름), with no labels, format hints or validation help. The whole screen shifts down by 26 px. The 등록 submit is enabled for this read-only admin: `canReg` gates the opener, and the submit is disabled only while a request is pending (`36b-model-register-crop.png`).
25. **[low] One hint leads nowhere.** The MDM model's left panel says "다이어그램에 없는 표 1개 — [새 다이어그램]에서 놓을 수 있습니다", but the [새 다이어그램] button is disabled for this user (`37-mdm-open.png`).
26. **[low] Resizing loses the selected table.** At 1440x900 the selected table ended up outside the 538 px canvas, and the canvas looked blank (`40-laptop-1440.png`).
27. **[low] Responsiveness was good, and nothing broke** (`04-mcm-open.png`, `11-find-enter.png`, `32-dbdiff-loaded.png`).
    - The MCM model rendered nodes about 0.7 s after the click, and switching models was similar.
    - ⌘K → Enter jumps in under 1 s. F3 takes about 0.2 s.
    - Each bottom tab loaded within the 1.5–2.5 s fixed wait I used, so their real latency is no worse than that.
    - The DB 차이 tab showed "DB 차이를 읽는 중입니다." briefly.
    - No crash, blank screen or error toast during the session.

## Space / layout

Measured with `getBoundingClientRect` (script: `scripts/measure.js`). The ERD grid is fixed in CSS (`erd-styles.ts`): `grid-template-columns: 220px 1fr 400px; grid-template-rows: auto minmax(360px,1fr) 260px`. Below 1180 px it stacks into one column.

| Region (px, default state) | 1440x900 | 1920x1080 |
|---|---|---|
| Portal top bar | 1440x34 (3.8 %) | 1920x34 (3.2 %) |
| Portal left menu | 280x866 (18.7 %) | 280x1046 (14.1 %) |
| Portal tab bar | 1160x34 (3.0 %) | 1640x34 (2.7 %) |
| Page title "ERD 설계" + footer breadcrumb | 37 + 24 px high | 37 + 24 px high |
| ERD bar (model row + banner + empty message row + version bar) | 1158x115 (10.2 %) | 1638x115 (9.1 %) |
| Left tree/legend | 220x394 (6.7 %) | 220x574 (6.1 %) |
| **Canvas** | **538x394 (16.4 %)** | **1018x574 (28.2 %)** |
| Right property panel | 400x394 (12.2 %) | 400x574 (11.1 %) |
| …of which column grid | 399x297 (9.1 %) | 399x477 (9.2 %) |
| Bottom review panel | 1158x260 (23.2 %) | 1638x260 (20.5 %) |
| Table nodes that fit at zoom 1 (avg node ≈240x245, 60 px gap) | **1** (1x1) | **6** (3x2) |

Canvas share with the controls that exist:

| State | 1440x900 | 1920x1080 |
|---|---|---|
| Default | 16.4 % | 28.2 % (`L1-default-1920x1080.png`) |
| Portal menu collapsed (◀) | ≈ 24.9 %, 818x394, fits 2 (computed from the CSS, not measured) | 35.9 %, 1298x574, fits 8 (`L2-menu-collapsed-1920.png`) |
| Menu and header collapsed | — | 38.1 %, 1298x609, fits 8 (`L3-menu-header-collapsed-1920.png`) |
| Portal tab fullscreen (⛶) | 27.1 %, 818x429, fits 2 (`L6-tab-fullscreen-1440.png`) | 38.1 %, 1298x609, fits 8 (`L4-tab-fullscreen-1920.png`) |

Even in the best state, about 60 % of the screen is not canvas. At 1920 in fullscreen, 471 of 1080 px of height go to the tab bar, the page title, the 115 px ERD bar, the 260 px review panel and the footer.

What can be collapsed, resized or maximised:
- **Portal menu:** collapse (◀) works. It is not remembered: a reload expands it again, because it is React `useState`. The menu width can be dragged, and only the width is saved (`localStorage oasis.sidebar.width`).
- **Portal header:** "헤더 접기" works (+35 px height). It is not remembered.
- **Portal tab fullscreen** ("전체 화면으로 보기"): hides the header and menu and uses the browser fullscreen API. It is not remembered. The page title, ERD bar and review panel stay.
- **Inside the ERD screen: nothing.** There is no splitter between canvas, right panel and bottom panel. The only resize handles are AG-Grid column-resize handles. The tree, the right panel and the review panel cannot be collapsed, and there is no canvas-maximise toggle. The review panel stays 260 px tall even when it shows 2 rows (변경 기록), which leaves about 150 px empty (`L1-default-1920x1080.png`).
- **Remembered across reload:** only the open portal tab and the audit-column toggle (`localStorage dmes.erdEdit.showAudit`). The model, mode, preset, zoom/viewport and selected table are all forgotten.

Suggested layout fixes, in rough order of payoff:
1. **Canvas-maximise toggle**, a button in the canvas toolbar plus a key such as `F11`/`⌘.`. It would hide the tree, the right panel and the review panel at once and keep a small floating mini property card. This gives about 85 % of the screen in tab-fullscreen.
2. **Collapsible bottom review panel**, collapsed by default to a 29 px tab strip with counts. It would open when a tab is clicked and could be resized by a splitter. It would remember its height per user in localStorage. This alone gives +230 px of canvas height.
3. **Collapsible/resizable right panel.** Options: a splitter (min 320, max 50 %), auto-hide when nothing is selected (it shows "0건 / 캔버스나 검토 목록에서 표를 고르세요" most of the time), or a floating panel docked near the selected node. Widening it would also fix the truncation in finding 12.
4. **Fold the left tree** into a collapsible 32 px rail, or into a dropdown in the toolbar. Today it holds one item ("전체") and a legend. The legend could become a "?" popover.
5. **Compress the ERD bar from 115 px to about 40 px.**
   - Merge the model row and the version bar into one row; the version actions could go in a "버전 ▾" menu.
   - Make the read-only banner a small "읽기 전용" chip with a tooltip.
   - Drop the always-empty 18 px `erd-message` row and show messages as toasts.
   - Drop the page title "ERD 설계", which duplicates the tab label (37 px).
6. **Persist the layout state** (menu collapse, panel sizes and collapsed flags, last model, mode, preset, viewport) per user in localStorage, so a reload restores the working view.
7. **Fix the default zoom** (finding 1): open at zoom 1 centred on the first table, or on the last viewport. A proper 2-D auto-layout would fill the wide canvas instead of a 1700x8800 column.
