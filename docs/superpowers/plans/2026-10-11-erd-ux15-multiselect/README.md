# ERD 도구 UX 정비 1.5 — 여러 표 동시 처리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ERD 설계 화면(m-mdm `erdEdit`)에서 고른 표 여러 개에 정렬·간격 맞추기, 다른 다이어그램에 넣기, 같은 컬럼 한 번에 넣기를 더한다. 이미 되는 일괄 동작(함께 끌기·접기·빼기·삭제)은 시험과 도움말로 고정한다. 다이어그램을 바꿔도 옛 선택이 남는 결함(staleSelectionAcrossDiagram)을 고친다.

**Architecture:** 화면만 바꾼다. 서버 명령은 이미 표 목록을 받는다(`moveNodes`·`placeTables`·`setFold`·`removeFromDiagram`, `deleteTable`·`addColumn` 여러 건). apply 한 번 = rev 하나 = 되돌리기 한 번이다. 모델·다이어그램 명령이 섞인 묶음도 같다(`ErdCommandService` `newRev`). 명령 만들기는 새 순수 모듈 `canvas/erd-multi.ts` 에 둔다. 창 2개는 새 `canvas/MultiDialogs.tsx` 에 둔다. 연결은 `useCanvasEditing`·`ErdToolbar` 가 한다. 선택 고침은 `ErdViewer` 가 한다.

**Tech Stack:** React 19, `@xyflow/react` 12.12.0, shared `/react-flow`(`ContextMenu`·`TextToolButton`·`ToolButton`·`dispatchShortcut`)·`/form`(`Select`·`Input`·`Button`)·`/modal`, vitest(happy-dom). 서버 변경 없음.

**입력(범위 정본):** 사용자 결정 10-11 "여러 표 동시 처리 = 이동·정렬, 접기 보기, 다이어그램 안팎, 삭제·속성 일괄(4개 모두)"(조정 메모 `~/.coord/erd-ux1-1011/coordinator-memo.md` 14:3x). 1차 마감 브라우저 확인 D9·D9.delete(아래 "확인된 사실"). 앞 계획: [UX 1차 README](../2026-10-11-erd-ux1/README.md)(U1-U54). 미룬 기능: [deferred.md](../../../erd-tool/deferred.md).

**착수 전:**
- 1차 마감(`erd-ux1-close`)이 dev 에 머지된 뒤 시작. 마감이 도움말·기능설계서(§7)·deferred(§8)를 아직 고치는 중(미커밋). 이 계획은 줄 번호·deferred 번호를 쓰지 않고 절 이름으로 가리킨다.
- 라우팅 = RULE.md 분기 3 아님. mdm 화면 FE 작업 → 공통 [FrontEnd README](../../../guide/FrontEnd/README.md)·[Local-Rules](../../../guide/FrontEnd/Local-Rules.md)·[Part B](../../../guide/FrontEnd/standard-v2/part-b-shared-policy.md)·`mantine-aggrid-ui` 스킬(무조건 적용).

**완료 기준:**
- 고른 표 2개 이상 → [정렬 ▾] 맞춤 6종, 3개 이상 → 간격 2종. 결과 = `moveNodes` 한 건. ⌘Z(Ctrl+Z) 한 번에 모두 제자리.
- 고른 표 → [다른 다이어그램에 넣기] → 대상에 없는 표만 `placeTables` 한 건. 대상에 이미 있던 표 자리는 안 바뀜.
- 고른 표 2개 이상 → [컬럼 추가] → 창 → 같은 물리명 컬럼이 없는 표마다 `addColumn` 한 묶음. 한 표라도 거절되면 아무것도 안 바뀜. ⌘Z 한 번에 모두 사라짐.
- 접기·빼기·삭제 여러 표 = 한 묶음(시험으로 고정).
- 다이어그램을 바꾸면 속성 패널이 옛 다이어그램 표를 보이지 않음.
- m-mdm `tests/dma/erdEdit/` 전부 통과(알려진 흔들림 deferred 50·80 제외), `lint` 0.

**문서 구성:** README = 결정·제약·인터페이스 정본·레인. Task 파일 2개: [01-multiselect.md](01-multiselect.md)(Task 1-4, 레인 UX15), [02-close.md](02-close.md)(Task 5, 마감). Task 맡은 사람은 README + 자기 파일을 읽는다. 이름·모양·testid 는 아래 "인터페이스 (정본)" 이 정본.

---

## 확인된 사실 (1차 마감 기록, `tmp/erd-ux1-close/record.tsv` — 미커밋 폴더라 여기에 옮김)

- `ui.D9`: ⌘+클릭으로 더해 고름, Shift+빈 곳 끌기 = 사각형 고르기. xyflow 기본값이다(`ErdViewer.tsx` ReactFlow 에 `multiSelectionKeyCode`·`selectionKeyCode` 지정 없음). xyflow 12.12.0 코드: `multiSelectionKeyCode = isMacOs() ? 'Meta' : 'Control'`, `selectionKeyCode = 'Shift'` → Windows Ctrl+클릭은 코드로 확인, 실측 안 함.
- `ui.D9`: 고른 5개 함께 끌기 = rev 하나(diagramNode upsert 5건), ⌘Z 한 번(rev 33)에 5개 제자리.
- `ui.D9`: 여러 개면 [컬럼 추가]·[PK 추가] 꺼짐(tip "… — 표를 하나만 고르세요"), [다이어그램에서 빼기]·[삭제] 켜짐. 속성 패널은 첫 표만(`ErdViewer.tsx` `focusTable = [...selected][0]`).
- `ui.D9.delete`(앞 `ui.D9` 의 "Delete 키 무동작" 정정 — 초점을 캔버스 밖에 두고 눌렀던 시험 잘못): 표에 초점이 있을 때 Delete = 다이어그램에서 빼기. 2개 고름 → rev 36 하나에 2건 delete, ⌘Z 한 번(rev 37)에 2건 upsert. 단위 시험 `Delete 는 고른 표를 이 다이어그램에서 뺀다` 와 도움말 §4.4·§5 도 같다.
- `defect.staleSelectionAcrossDiagram`(중간): 컬럼 점프로 TB_MCM_JOB_DEF 고름 → 그 표가 없는 다이어그램 염 → 다른 표 누름 → 캔버스 선택은 새 표인데 속성 패널은 JOB_DEF. 원인 추정: `onSelect` 는 지금 다이어그램 노드 변경만 받고, `onSelectDiagram` 이 `selected` 를 안 비움.
- `defect.disabledNoReason`(낮음): 고른 표 없을 때 접기 3·빼기·삭제 단추 "title 에 이유 없음". 코드 판정: 이 5개는 `ToolButton` 이라 title 이 없고(설계) 툴팁은 `span[data-tip]` CSS 다. `tipOf(label, r, none)` 가 이미 `"… — 표를 먼저 고르세요"` 를 넣는다 → 마감 검사가 title·aria-label 을 읽은 탓 추정, 미확인.
- 서버 `ErdDiagramStore.mergeNode`(`placeTables`): `MERGE … WHEN MATCHED THEN UPDATE SET POS_X, POS_Y` → 대상에 이미 있는 표를 다시 보내면 자리를 덮어씀. 화면이 걸러야 함.

---

## 1.5 에서 정한 점

1차 U1-U54 는 바꾸지 않는다. 번호는 U55 부터.

| # | 결정 | 이유 |
|---|---|---|
| U55 | 회차 1개, 레인 1개(UX15) + 마감 Task. 서버·MCP·Flyway 변경 없음 | 모든 명령이 표 목록을 받고 apply 한 번 = rev 하나(조사). 화면 파일만 바뀐다. 레인 2개 분해는 아래 "레인" 절 참고(선택) |
| U56 | **이미 되는 것은 시험·도움말만:** 함께 끌기(D9), 접기(도구 막대 `FOLDS`·표 메뉴 `targets` → `setFoldCommand`), 다이어그램에서 빼기(Delete·⌫·도구 막대·메뉴), 모델에서 삭제(⌥⌫·도구 막대·메뉴, 확인 창 "표 n개", 200개 상한). 새 시험 = 표 3개 접기(이미 그 모드인 표 뺌), 관계로 이은 표 2개 삭제 = `deleteTable` 2건 한 묶음 | 코드가 이미 `selectedIds()` 를 넘긴다. 기존 시험은 표 1개만 본다 |
| U57 | **Delete 키 = 그대로.** Delete·⌫ = 고른 표 모두 이 다이어그램에서 빼기, ⌥⌫(Alt+Delete) = 모델에서 삭제(확인 창). 사용자 확인 Q1 | D9.delete 로 이미 일괄·되돌리기 한 번 확인. 모델 삭제를 Delete 로 바꾸면 실수 비용이 크다(컬럼·키·관계까지 지움) |
| U58 | **정렬·간격(순수 `erd-multi.ts`):** 맞춤 6 = 왼쪽·가운데·오른쪽·위쪽·중간·아래쪽(PowerPoint 한국어 이름). 간격 2 = 가로 간격 같게·세로 간격 같게. 기준 = 고른 표 경계 상자. 맞춤 2개 이상, 간격 3개 이상. 간격: 축 좌표 → 표 id 순으로 늘어놓고 양 끝 표 고정, 표 사이 빈 칸 같게. 빈 칸 < 40 이면 40(첫 표에서 펼침, 마지막 표가 옮겨짐). 좌표는 정수 반올림만(격자 10 맞춤 안 함 — 가운데 맞춤이 어긋나지 않게). 결과 = `moveNodesCommand` 한 건(안 바뀐 표 뺌). 모두 그대로면 알림 "이미 맞춰져 있습니다." 권한 `rights.diagram`. 라벨 `"<이름>(표 n개)"` | 사용자 범위 1번 "left/top/center". 6+2 는 순수 함수 몇 줄이라 비용 차이 없음. 크기만큼 사용자 결정 Q3 |
| U59 | **크기·자리는 누를 때 읽는다.** `layout()` 의 잰 크기 코드를 `measuredSizes()` 로 빼서 자동 배치·정렬이 같이 쓴다(이름만 배율이면 `initialHeight`). 자리 = `rf.getNode(id).position`(끄는 중 덮개 포함, 보이는 자리) | 도구 막대가 자리를 구독하지 않는다(Local-Rules §19, Screen-Performance R16 취지) |
| U60 | **진입점(정렬):** 도구 막대 [정렬 ▾] = shared `TextToolButton menu` + `ContextMenu`([관계 ▾] 와 같은 방식, shared props 안 바꿈). 고른 표 2개 미만이면 꺼짐, tip "정렬 — 표를 2개 이상 고르세요". 간격 항목은 3개 미만이면 꺼짐, title "표를 3개 이상 고르세요". 표 메뉴(대상 2개 이상)에 "정렬" 묶음. 단축키 없음 | 새 shared 부품 없음 |
| U61 | **다른 다이어그램에 넣기:** 창 `PlaceIntoDialog`(대상 = shared `Select`, 지금 다이어그램 뺌). 명령 = `placeTables` 한 건. 대상에 이미 있는 표는 뺀다(`mergeNode` 가 자리를 덮어씀). 자리 = 고른 표들의 상대 배치 유지, 대상 경계 상자 오른쪽 + 80, 위 = 대상 최소 y, 대상이 비면 (0,0). 넣은 뒤 지금 다이어그램에 머문다. 알림 `표 n개를 「업무영역 / 이름」에 넣었습니다(이미 있던 m개 뺌).` 진입점 = 도구 막대 아이콘 [다른 다이어그램에 넣기](빼기 앞), 표 메뉴 "… 다른 다이어그램에 넣기…". 표 1개 이상. 다른 다이어그램이 없으면 꺼짐, tip "다른 다이어그램에 넣기 — 다른 다이어그램이 없습니다". 권한 `rights.diagram` | 사용자 범위 3번 |
| U62 | 고른 표로 **새 다이어그램 만들기는 안 함**(마법사 [새 다이어그램] 이 있음). 사용자 확인 Q5 | 창에 업무영역·이름 칸이 더 든다. 범위 밖 |
| U63 | **같은 컬럼 여러 표에:** [컬럼 추가] 가 고른 표 2개 이상이면 창 `BulkColumnModal`. 논리명 → 300ms 뒤 `previewName({logical})` → 물리명 칸 채움(고칠 수 있음, 사전 없는 토막이면 직접 넣음). 보낼 때 물리명이 미리보기와 다르면 `previewName({phys})` 로 추천 도메인(실패면 null). 모든 `addColumn` 에 `phys`·`domainId` 를 넣어 보낸다 → 서버 NEEDS_CHOICE 없음. 대상 = 고른 표 중 같은 물리명(대소문자 무시) 컬럼이 없는 표. 있는 표 = "건너뜀" 목록. 감사 컬럼 이름 막음. 대상 0 이면 [추가] 꺼짐. 표 수 ≤ `MAX_BATCH`(200). 위치 = 끝(서버 규칙: 감사 블록 앞). PK 아님. 한 apply, 라벨 `컬럼 추가(표 n개)`. 거절이면 창 안 문구, 묶음 전부 거절이라 아무것도 안 바뀜 | 사용자 범위 4번 "add the same column to multiple tables". 같은 이름 하나가 묶음 전체를 거절시키므로 미리 거른다 |
| U64 | **[PK 추가] 는 표 하나만**(그대로). 여러 표 PK 는 사용자 확인 Q4 | PK 바꾸기는 관계·자식 표에 번진다 |
| U65 | **속성 패널(여러 개):** 패널은 지금처럼 첫 표(살아 있는 선택의 첫 값)를 보이고, 머리 글을 `속성 · 고른 표 n개 중 <물리명>`(`erd-props-multi`)으로 바꾼다. 요약 목록 패널은 사용자 확인 Q2 | 가장 싼 안내. 패널 모양은 그대로 |
| U66 | **staleSelection 고침:** `onSelectDiagram`(왼쪽 목록·`nav.selectDiagram`)이 다른 다이어그램으로 갈 때 `selected`·`selectedColumnId` 를 비운다(같은 다이어그램이면 그대로). 늘 거르는 방식은 안 씀 — 컬럼 점프·표 찾기가 다이어그램에 없는 표를 `selected` 에 둔다. `selectTable` 의 다른 다이어그램 길은 `onSelectDiagram` 을 안 거쳐 그대로(시험). 모델에서 지운 표는 `focusTable` 계산에서 뺀다(파생, 새 상태 없음) | 1차 마감 결함 후보(중간). 같은 파일 |
| U67 | **Ctrl/⌘+A = 이 다이어그램 표 모두 고르기**(ERD 키 표 `selectAll`, `key: "a"` + 물리 키 `code: "KeyA"` — 한글 자판, 캔버스 초점일 때만, 입력 칸이면 shared `dispatchShortcut` 이 넘김). 표가 없으면 넘김. 사용자 확인 Q6 | 일괄 동작의 짝. 키 한 줄 + 손잡이 한 줄 |
| U68 | **도구 막대 툴팁 개수:** 고른 표 2개 이상이면 접기 3·빼기·삭제·넣기 툴팁 끝에 ` (표 n개)`. disabledNoReason = 시험으로 `data-tip` 이유 고정 + 마감에서 꺼진 아이콘 단추 위 툴팁이 실제로 보이는지 스크린샷. 안 보이면 결함으로 적고 deferred(shared `ToolButton` 변경 = 승인 사항) | 같은 파일. 원인 판정만 싸게 |
| U69 | **결함 후보 범위:** 넣음 = staleSelectionAcrossDiagram(U66), disabledNoReason(U68 판정). 안 넣음(사용자 확인 Q7) = propsFocusKeep, violationRowFirstClick, newTableEnterPhys, prefsMultiTab | 여러 표 처리와 같은 코드인 것만. 나머지는 Q7 표 |
| U70 | **성능:** 화면 루트 새 상태 없음(`selected` 만 씀). 창 입력 상태는 창 안(`NewTableModal` 방식). 창 열림 상태는 `useCanvasEditing` 안, 창은 열린 동안만 모델을 받는다(`SplitDialog` 방식). 도구 막대 새 props 는 숫자·불리언·안정 콜백 | Screen-Performance-Guide R5·R16, Local-Rules §19 |
| U71 | 새 컬럼 id = `erd-commands` 의 `newElementId("c")`(crypto, 32자리) | 서버 ErdIds 규칙. GridInputBar 의 다른 `newElementId` 와 섞지 않음 |
| U72 | 레인 모델 opus 하나, 서브에이전트 동시 상한 10 | 창 2개·정렬 판정이 있음. 일 크기 약 반나절 |
| U73 | 마감 브라우저 확인 = 1차 복제 PDB `L_UX1C`(닫힘, 안 지움)를 다시 연다. L_MAIN 쓰기 금지 | 1차 U7 과 같음. 열린 PDB 상한 3 |

---

## 사용자 확인 필요 (Q)

마감 보고 "사용자 확인 목록" 에 그대로 옮긴다. 레인은 기본값으로 진행한다.

| # | 질문 | 기본값(이번 처리) | 바꾸면 |
|---|---|---|---|
| Q1 | Delete 키 동작 | 그대로: Delete·⌫ = 다이어그램에서 빼기, ⌥⌫ = 모델에서 삭제(U57) | `erd-shortcuts.ts` 키 표 두 줄 |
| Q2 | 여러 개 고를 때 속성 패널 | 첫 표 + 머리 글 "고른 표 n개 중"(U65) | 요약 목록 패널(표 이름·컬럼 수, 행 누르면 그 표만 고름) 새 부품, 약 1시간 |
| Q3 | 정렬 종류 | 맞춤 6 + 간격 2(U58) | 왼쪽·위·가운데 3개로 줄임(메뉴 항목만 뺌) |
| Q4 | 여러 표에 PK 컬럼 추가 | 안 함(U64) | `bulkColumnCommands` 에 pk 인자(표마다 2건, MAX_BATCH 반으로) |
| Q5 | 고른 표로 새 다이어그램 | 안 함(U62) | 넣기 창에 "새 다이어그램" 선택 + `wizardCommands` |
| Q6 | Ctrl/⌘+A 모두 고르기 | 넣음(U67) | 키 표 한 줄 지움 |
| Q7 | 1차 마감 결함 후보 4건 | 이번에 안 함 | 아래 표 |

Q7 결함 후보(1차 마감 `record.tsv`):

| 후보 | 등급 | 내용 | 안 넣은 이유 · 넣으면 비용 |
|---|---|---|---|
| propsFocusKeep | 중간 | 입력 칸 초점 → 캔버스 빈 곳 클릭 → 초점이 `erd-canvas-host` 로 가서 패널이 바로 사라짐(happy-dom 시험은 통과) | U12 "초점이 나갈 때까지" 의 기대 동작부터 정해야 함(빈 곳 클릭 = 편집 끝으로 볼지). 정하면 `ErdViewer` 의 blur 판정 수정, 약 30분 |
| violationRowFirstClick | 중간 | 다른 표 속성이 열린 상태에서 위반 행 첫 클릭 → 입력 칸 대상 비어 있음, 두 번째 클릭에 잡힘 | `ColumnGrid` 영역. 가설: `onSelect` 가 select 변경마다 `selectedColumnId(null)` — 또는 그리드가 다른 표로 다시 붙을 때 고른 행을 잃음. 원인 조사 먼저, 다음 회차 |
| newTableEnterPhys | 낮음 | 새 표 창 물리명 칸 Enter 무동작, 물리명 넣은 뒤에도 "사전에 없는 단어…" 줄 남음 | 여러 표와 무관. `CanvasDialogs.tsx` 몇 줄 + 시험 1개, 약 10분 |
| prefsMultiTab | 낮음-중간 | 같은 사용자 탭 둘이 prefs 키를 서로 덮어씀 | `state/prefs.ts` 저장 방식(storage 이벤트·필드 병합) 설계 필요 → deferred |

---

## Global Constraints

- 작업은 1차 마감 머지 뒤 dev 에서 딴 worktree branch. lane branch `erd-ux15`, 마감 `erd-ux15-close`. git 은 `/usr/bin/git`. 복합 셸 명령이 거절되면 나눠 부른다.
- 프런트 명령(`src/frontend` 에서):
  ```bash
  pnpm --filter "@dk-oasis/m-mdm^..." build                      # m-mdm 시험은 shared dist 를 쓴다
  pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/
  pnpm --filter @dk-oasis/m-mdm lint                              # tsc --noEmit (tests 폴더는 안 봄)
  ```
  m-mdm vitest 는 `tests/**/*.test.ts` 만 모은다. 렌더 시험도 `.test.ts` + `createElement`.
- 바꾼 화면 파일마다 커밋 전 `node .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.mjs audit <파일>` 와 `node .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.mjs audit <파일>` = 0건(오탐이면 보고에 이유).
- 화면 모듈은 Mantine·AG Grid 직접 import 금지(shared 래퍼만). 로컬 `.css` import 금지(Local-Rules §17, TS 문자열 + `<style href precedence>`, 새 규칙은 `canvas/erd-edit-styles.ts`). 색은 `--color-*`·`--spacing-*`·`--font-size-*` 토큰만(§8). React Flow §19·§33. 늦은 응답 버리기 §37.
- 기존 shared 부품 props·동작·모양 변경 금지(승인 사항). 새 shared 부품 없음(창 2개는 업무 도메인 부품이라 화면 폴더). 필요해지면 Part B §18-3 절차 전부를 같은 Task 에서 하고 보고.
- 서버·MCP·`scripts/erd` 안 바꿈. 새 Flyway V 파일 없음. 머지된 V 파일 안 고침.
- 모든 쓰기는 `ctx.apply` 한 번(묶음 = 전부 반영 또는 전부 거절, rev 하나, 되돌리기 한 번). 권한: 정렬·넣기 `rights.diagram`, 같은 컬럼 `rights.model`(RELEASED 버전·남의 DRAFT·끊김이면 `blockedNotice` 가 막음). CONFLICT·CLAIMED 는 `apply` 가 알림.
- 한 묶음 명령 수 ≤ `MAX_BATCH`(200, `canvas/erd-commands.ts`).
- 브라우저 확인은 ego-browser 스킬(사용자 전역 지침). 사용자 프로필 고르지 않음. TaskSpace 는 끝나면 `finish({ keep: [] })`.
- 주석·문서·커밋 제목은 한국어. 커밋 형식 `type(scope): 제목`, 끝에:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  ```
- push 금지. dev 머지는 조정 세션 허가 뒤(조정 세션이 없으면 사용자에게 묻는다). 머지 전 lane commit 1개로 합침(`node .claude/skills/_shared/node/squash-branch.mjs --onto dev --rebase`), 머지 `--ff-only`. 머지한 worktree 는 `git worktree remove`(`--force` 금지), branch `git branch -d`.
- 시험 시간 예산: 바뀐 범위만, 항목마다 15분 상한. 전체는 마감에서 한 번.

## Review Focus

1. 고른 표 3개 중 하나가 이미 대상 다이어그램에 있다 → `placeTables` 에 그 표가 없고, 대상에 있던 자리는 안 바뀐다. 3개 모두 있으면 [넣기] 꺼짐. 시험: Task 1 `placeIntoSkipsAlreadyPlaced`, Task 3 `placeDialogDisablesWhenAllPresent`.
2. 같은 컬럼 창 — 고른 표 2개 모두 `OBJECT_ID` 가 있다 → [추가] 꺼짐, 건너뜀 2. 하나만 있으면 1개 표에만 보내고 건너뜀 1. 물리명 칸에 `c_at` → 칸이 `C_AT` 로 바꾸고 감사 컬럼이라 막음. 서버가 묶음을 거절하면 창이 남고 문구가 보이며 아무것도 안 바뀜. 시험: Task 1 `bulkColumnPlanSkipsSamePhysCaseInsensitive`·`columnPhysErrorBlocksAudit`, Task 3 `bulkColumnSkipsAndSendsOneBatch`·`bulkColumnRejectKeepsDialog`.
3. 정렬 — 이름만 배율(0.4)에서 가운데 맞춤 → 잰 높이 대신 `initialHeight` 를 쓴다(자동 배치와 같은 `measuredSizes`). 겹친 표 3개 간격 → 빈 칸 40. 같은 입력 같은 결과(id 순 동률). 시험: Task 1 `distributeOverlapUsesMinGap`·`distributeTieBreaksById`, Task 2 `alignUsesNodeHeights`(happy-dom 은 잰 값이 없어 `initialHeight` 길만 본다. 이름만 배율 길은 자동 배치와 같은 `measuredSizes` 를 써서 기존 [자동 배치] 시험이 지킨다).
4. 표 A 를 고른 채 다른 다이어그램을 연다 → 속성 패널 없음. 그 다이어그램에 없는 표를 컬럼 점프로 고르면 그 표의 다이어그램으로 가고 패널이 그 표를 보인다(비우지 않음). 시험: Task 4 `staleSelectionClearedOnDiagramSwitch`·`crossDiagramSelectKeepsTable`.
5. 확정된 버전(RELEASED)에서 소유자 → [정렬 ▾]·[넣기] 켜짐(다이어그램 권한), [컬럼 추가] 꺼짐 tip "컬럼 추가 — 확정된 버전". 시험: Task 3 `releasedAllowsDiagramOpsOnly`.
6. 고른 표 201개에 같은 컬럼 → 창을 열지 않고 알림 `한 번에 200개 표까지 넣을 수 있습니다.` 시험: Task 3 `bulkColumnOverBatchRefuses`.

---

## 파일 구조

화면 `S/` = `src/frontend/m-mdm/pages/dma/erdEdit/`, 시험 `T/` = `src/frontend/m-mdm/tests/dma/erdEdit/`.

```
S/canvas/erd-multi.ts(새, 순수: 정렬·간격·넣기·같은 컬럼), T/erd-multi.test.ts(새)                              (Task 1)
S/canvas/useCanvasEditing.ts(measuredSizes·정렬·selectAll·표 메뉴), S/canvas/ErdToolbar.tsx([정렬 ▾]·툴팁 개수),
S/canvas/erd-shortcuts.ts(selectAll), T/erd-canvas-multi.test.ts(새, 하네스)                                       (Task 2)
S/canvas/MultiDialogs.tsx(새: PlaceIntoDialog·BulkColumnModal), S/canvas/CanvasDialogs.tsx(usablePhys export),
S/canvas/useCanvasEditing.ts·ErdToolbar.tsx(창 연결·[넣기]·[컬럼 추가] 여러 개), S/canvas/erd-edit-styles.ts(창 목록),
T/multi-dialogs.test.ts(새), T/erd-canvas-multi.test.ts(더함), T/erd-canvas-editing.test.ts(기대 1곳)            (Task 3)
S/ErdViewer.tsx(선택 비우기·focusTable·머리 글), T/page-render.test.ts(시험 3개 더함)                            (Task 4)
docs/mdm/screens/erdEdit/erdEdit_사용자도움말.md, erdEdit_기능설계서.md, docs/erd-tool/deferred.md,
이 README "1.5 구현 결정"                                                                                          (Task 5, 마감)
```

---

## 인터페이스 (정본)

### `S/canvas/erd-multi.ts`(새, 순수)

```ts
import type { ErdCommandJson, ErdModelJson, ErdState } from "../types";
import type { PlacedNode } from "./erd-commands";

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export type DistributeAxis = "x" | "y";
export type ArrangeKind = { align: AlignMode } | { distribute: DistributeAxis };
export interface NodeBox { table: string; x: number; y: number; width: number; height: number }

export const ALIGN_MIN = 2;
export const DISTRIBUTE_MIN = 3;
export const DISTRIBUTE_MIN_GAP = 40;
export const PLACE_GAP = 80;
export const ALIGN_MODES: readonly AlignMode[];            // left, hcenter, right, top, vcenter, bottom
export const ALIGN_LABEL: Readonly<Record<AlignMode, string>>;   // 왼쪽 맞춤·가운데 맞춤·오른쪽 맞춤·위쪽 맞춤·중간 맞춤·아래쪽 맞춤
export const DISTRIBUTE_LABEL: Readonly<Record<DistributeAxis, string>>; // 가로 간격 같게·세로 간격 같게

export function arrangeLabel(kind: ArrangeKind): string;
export function alignBoxes(boxes: readonly NodeBox[], mode: AlignMode): PlacedNode[];          // < ALIGN_MIN 이면 []
export function distributeBoxes(boxes: readonly NodeBox[], axis: DistributeAxis, minGap?: number): PlacedNode[]; // < DISTRIBUTE_MIN 이면 []

export interface PlaceIntoPlan { command: ErdCommandJson | null; placed: string[]; skipped: string[] }
export function placeIntoCommand(state: ErdState, from: string, to: string, tables: readonly string[], showAudit: boolean): PlaceIntoPlan;
/** 대상 다이어그램에 이미 있는 고른 표 수. */
export function alreadyIn(state: ErdState, to: string, tables: readonly string[]): number;

export interface BulkColumnPlan { targets: string[]; skipped: string[] }
export interface BulkColumnInput { logical: string; phys: string; domainId: number | null }
export function bulkColumnPlan(model: ErdModelJson, tables: readonly string[], phys: string): BulkColumnPlan;
export function columnPhysError(phys: string): string | null;
export function bulkColumnCommands(model: ErdModelJson, targets: readonly string[], col: BulkColumnInput, newId: () => string): ErdCommandJson[];
```

### `S/canvas/MultiDialogs.tsx`(새)

```ts
export interface PlaceTarget { id: string; label: string; already: number }   // label = "업무영역 / 이름"
export interface PlaceIntoDialogProps {
  open: boolean;
  count: number;                         // 고른 표 수
  targets: readonly PlaceTarget[];       // 지금 다이어그램 뺀 다이어그램, sortSeq 순
  onSubmit(to: string): Promise<string | null>;   // 거절이면 창에 보일 문구
  onClose(): void;
}
export interface BulkColumnModalProps {
  open: boolean;
  model: ErdModelJson;                   // 열린 동안만 의미 있음(건너뜀 계산)
  tables: readonly string[];
  onSubmit(col: BulkColumnInput): Promise<string | null>;
  onClose(): void;
}
export function PlaceIntoDialog(p: PlaceIntoDialogProps): JSX.Element;
export function BulkColumnModal(p: BulkColumnModalProps): JSX.Element;
```

### `S/canvas/CanvasDialogs.tsx` 더함

```ts
/** 미리보기 응답이 쓸 만한가 — 사전에 없는 토막(`***` 포함)이 있으면 null. (지금 파일 안 함수를 export 만) */
export function usablePhys(p: ErdNamePreview): string | null;
```

### `S/canvas/ErdToolbar.tsx` props 더함

```ts
onArrange(kind: ArrangeKind): void;
onPlaceInto(): void;
/** 지금 다이어그램 밖 다이어그램 수. 0 이면 [다른 다이어그램에 넣기] 꺼짐. */
otherDiagrams: number;
```
`onAddColumn(pk)` 는 그대로. `useCanvasEditing` 의 `addColumn(false)` 가 고른 표 2개 이상이면 같은 컬럼 창을 연다.

### `S/canvas/erd-shortcuts.ts` 더함

`ErdCanvasKey` 에 `"selectAll"`, `ERD_CANVAS_SHORTCUTS` 에 `{ id: "selectAll", key: "a", mod: true }` 와 `{ id: "selectAll", code: "KeyA", mod: true }`(한글 자판, `...CANVAS_SHORTCUTS` 앞).

### testid

| testid | 뜻 | Task |
|---|---|---|
| `erd-tool-align` | [정렬 ▾] 글자 단추 | 2 |
| `erd-alignmenu`, 항목 `erd-alignmenu-item-{align-left,align-hcenter,align-right,align-top,align-vcenter,align-bottom,dist-x,dist-y}` | 정렬 메뉴(ContextMenu testId 규칙 `${testId}-item-${id}`) | 2 |
| 표 메뉴 항목 id `align`(묶음, 자식 = 위 8개 id), `place`, `bulkcol` | `erd-menu-item-*` | 2·3 |
| `erd-tool-place` | [다른 다이어그램에 넣기] 아이콘 단추 | 3 |
| `erd-place-dialog`, `erd-place-target`, `erd-place-info`, `erd-place-ok`, `erd-place-cancel`, `erd-place-error` | 넣기 창 | 3 |
| `erd-bulkcol-dialog`, `erd-bulkcol-logical`, `erd-bulkcol-phys`, `erd-bulkcol-preview`, `erd-bulkcol-targets`, `erd-bulkcol-skip`, `erd-bulkcol-ok`, `erd-bulkcol-cancel`, `erd-bulkcol-error` | 같은 컬럼 창 | 3 |
| `erd-props-multi` | 속성 패널 머리 글(고른 표 2개 이상일 때만) | 4 |

### 알림·라벨 글(정본)

| 때 | 글 |
|---|---|
| 정렬 apply 라벨 | `왼쪽 맞춤(표 3개)` 꼴(`arrangeLabel(kind)` + `(표 n개)`) |
| 정렬 모두 그대로 | `이미 맞춰져 있습니다.`(info) |
| 정렬 표 부족 | `표를 2개 이상 고르세요.` / `표를 3개 이상 고르세요.`(info) |
| 넣기 apply 라벨 | `다른 다이어그램에 넣기(표 n개)` |
| 넣기 성공 | `표 n개를 「업무영역 / 이름」에 넣었습니다.` + 뺀 것이 있으면 `(이미 있던 m개 뺌)` 를 마침표 앞에 |
| 넣기 모두 있음(창 안) | `고른 표가 모두 그 다이어그램에 이미 있습니다.` |
| 같은 컬럼 apply 라벨 | `컬럼 추가(표 n개)` |
| 같은 컬럼 성공 | `<물리명> 컬럼을 표 n개에 더했습니다.` + `(이미 있던 m개 건너뜀)` |
| 같은 컬럼 상한 | `한 번에 200개 표까지 넣을 수 있습니다.`(warn) |
| 같은 컬럼 감사 이름 | `감사 컬럼은 표마다 저절로 붙습니다. 다른 물리명을 쓰세요.` |

---

## Task 문서

| Task | 파일 | 내용 | 레인 | 선행 |
|---|---|---|---|---|
| 1 | [01-multiselect.md](01-multiselect.md) | 순수 `erd-multi.ts`: 맞춤·간격·넣기·같은 컬럼 명령 | UX15 | 없음 |
| 2 | [01-multiselect.md](01-multiselect.md) | 정렬 연결: `measuredSizes`, [정렬 ▾], 표 메뉴 정렬, Ctrl/⌘+A, 툴팁 개수, 이미 되는 일괄 동작 고정 시험 | UX15 | Task 1 |
| 3 | [01-multiselect.md](01-multiselect.md) | 창 2개: 다른 다이어그램에 넣기, 같은 컬럼 여러 표에 + 연결 | UX15 | Task 1·2 |
| 4 | [01-multiselect.md](01-multiselect.md) | `ErdViewer` 선택: 다이어그램 바꾸면 비움, 지운 표 뺌, 머리 글 | UX15 | 없음(언제든) |
| 5 | [02-close.md](02-close.md) | 마감: 전체 시험, 복제 PDB 브라우저 확인, 도움말·기능설계서·deferred·결정 기록 | 마감 | Task 1-4·6 머지 |
| 6 | 이 README "Task 6" 절 | 추정 관계 점선 클릭 → 검토 패널 [추정 관계 검토] 탭의 그 행 고름(사용자 10-11 추가 요청) | UX15 | 없음(언제든) |

### Task 6: 추정 관계 점선 클릭 → 추정 관계 행 고르기 (10-11 사용자 추가 요청)

- 요청 원문: "점선을 누르면 추정관계에서 선택이 되도록 해줘."
- 지금: 관계선은 `canvas/erd-flow.ts:314` 에서 `selectable: false, focusable: false` 다. 이름표 층은 `pointer-events:none`(Local-Rules §19). 점선 = `state` 가 추정(INFERRED)인 관계(`erd-rel` 의 `data-state`).
- 할 일:
  1. 추정 관계선만 누를 수 있게 한다. 선이 가늘어 누르기 어려우므로 보이지 않는 넓은 누름 경로(예: 투명 stroke 12px)를 본선 위에 겹친다. 확정 관계선은 지금처럼 누르지 않는다(이번 범위 밖).
  2. 누르면: 검토 패널이 접혀 있으면 펼치고, 탭을 `inferred`(`panels/ReviewPanel.tsx` `ReviewTab`)로 바꾸고, 그 관계 id 행(`AgDataGrid gridId="erdInferred" rowKey="id"`)을 고르고 보이게 굴린다. 같은 후보 묶음(`isRankedCandidate`·`candidateGroup`)의 1순위 선을 누르면 그 1순위 행을 고른다.
  3. 표 선택·끌기와 겹치지 않게 한다: 선 누름은 노드 선택을 바꾸지 않는다. 캔버스 빈 곳 누름(선택 해제) 동작은 그대로.
  4. 탭 바꾸기·행 고르기 상태는 ErdViewer 루트를 다시 그리지 않는 경로로(화면 성능 규칙 R7·R16 — 관계선은 노드 x 숫자만 구독하는 지금 구조 유지).
- 시험: 추정 선 클릭 → 탭 `inferred`·그 행 선택(실제 ErdEditPage 띄우는 시험), 확정 선 클릭 → 변화 없음, 접힌 검토 패널 → 펼침. 마감 Task 5 브라우저 확인에 한 항목(M14) 추가.
- 도움말: §4.1 추정 관계 검토에 "캔버스의 점선을 누르면 그 관계 행이 골라집니다" 한 줄.

## 레인

기본 = 레인 1개.

| 레인 | 모델 | Task | 고치는 파일(소유) |
|---|---|---|---|
| UX15 | opus | 1 → 2 → 3, 4(언제든) | `S/canvas/{erd-multi.ts(새),MultiDialogs.tsx(새),useCanvasEditing.ts,ErdToolbar.tsx,erd-shortcuts.ts,CanvasDialogs.tsx,erd-edit-styles.ts}`, `S/ErdViewer.tsx`, 시험 `T/{erd-multi,erd-canvas-multi,multi-dialogs}.test.ts`(새)·`T/{erd-canvas-editing,page-render}.test.ts` |
| 마감 | opus | 5 | 문서, `tmp/erd-ux15-close/`(커밋 안 함) |

나눌 때(선택, 레인 2개): `UX15-A` = Task 4(`S/ErdViewer.tsx`, `T/page-render.test.ts`), `UX15-B` = Task 1-3(나머지 파일 전부). 두 레인 파일이 겹치지 않는다. 기대는 곳은 하나: Task 4 Step 5(머리 글 시험)가 Task 2 의 Ctrl/⌘+A 를 쓴다 → A 는 Step 1-4 를 먼저 머지하고, Step 5 는 B 의 Task 2 머지 뒤 rebase 해서 한다. 일이 작아(반나절) 기본은 1개.

- 레인은 `S/types.ts`·`S/api.ts`·`S/edit-context.ts`·`S/state/*`·`S/panels/*` 를 고치지 않는다. 빠진 것이 있으면 레인 보고 → 조정자.
- 띄운 pane·레인·이름 붙인 에이전트는 끝나면 바로 닫는다.

## 레인 분해 안내

| 레인 | 항목 | 범위 | 통과 확인 | 비고 |
|---|---|---|---|---|
| UX15 | t1 | Task 1 전부 | Task 1 Step 6 | 커밋 |
| UX15 | t2 | Task 2 전부 | Task 2 Step 8 | 커밋 |
| UX15 | t3a | Task 3 Step 1-4(창 2개 부품) | Step 4 | 커밋 |
| UX15 | t3b | Task 3 Step 5-9(연결·도구 막대·표 메뉴) | Step 9 | 커밋 |
| UX15 | t4 | Task 4 전부 | Task 4 Step 6 | 언제든 |
| 마감 | t5 | Task 5 | — | 레인 머지 뒤 |

---

## 도움말 반영 표(마감 Task 5 시작점)

`docs/mdm/screens/erdEdit/erdEdit_사용자도움말.md`. 1차 마감 뒤 절 이름 기준(줄 번호 안 씀). 레인 보고의 "도움말 반영 메모" 로 덧붙인다.

| 절 | 바꿀 것 |
|---|---|
| §4.4 다이어그램 만들기와 배치 — 새 소절 "여러 표 한 번에 다루기" | 고르기(⌘+클릭 / Windows Ctrl+클릭, Shift+빈 곳 끌기, Ctrl/⌘+A). 함께 끌기 = 한 번에 저장·되돌리기 한 번. [정렬 ▾] 8종과 개수 조건(2개·3개). 접기 단추·[다이어그램에서 빼기]·[모델에서 삭제] 는 고른 표 모두. [다른 다이어그램에 넣기](이미 있는 표는 그대로, 자리는 대상 오른쪽). 속성 패널은 첫 표 + "고른 표 n개 중" |
| §4.2 표와 컬럼 고치기 | 표 여러 개를 고르고 [컬럼 추가] → 같은 컬럼 창(논리명 → 물리명 미리보기, 같은 물리명이 있는 표는 건너뜀, PK 는 표 하나씩) |
| §4.4 표 지우기 표 | "고른 표 모두" 를 명시 |
| §5 단축키 | `Ctrl+A`/`⌘A` = 이 다이어그램 표 모두 고르기(캔버스). Delete 줄에 "고른 표 모두" |
| §4.7 되돌리기 | 정렬·넣기·같은 컬럼 = 되돌리기 한 번에 모두 |

기능설계서 `erdEdit_기능설계서.md` 에는 1차 절(§7) 뒤에 "## 8. UX 정비 1.5 — 여러 표 동시 처리" 절을 더한다(U55-U73 요약, 명령 모양, `placeTables` 걸러 보내기 이유, 서버 변경 없음).

---

## 1.5 구현 결정

(마감 Task 5 가 채운다. 1차 README "1차 구현 결정" 과 같은 표.)

---

## 계획 작성자 메모

- 조정자 입력의 "Delete key does nothing" 은 1차 마감 `ui.D9.delete` 가 정정했다(시험 잘못). Delete 는 이미 일괄 빼기다 → 새 동작 없음, Q1 만.
- 범위 4개 중 2·3(빼기)·4(삭제) 는 코드가 이미 `selectedIds()` 를 넘긴다. 새 일은 정렬·넣기·같은 컬럼·선택 고침이다. 그래서 반나절 레인 1개.
- 넣기는 `placeTables` 가 upsert(`mergeNode`)라서 화면이 걸러야 한다. 서버에 "이미 있으면 건너뛰기" 칸을 더하는 안은 서버·MCP 계약 변경이라 버렸다.
- 같은 컬럼은 서버 NEEDS_CHOICE(토막 고르기)가 표마다 오지 않게 물리명·도메인을 화면이 정해서 보낸다. 토막 고르기 창(`TokenChoiceModal`)을 이 창에 넣는 안은 비용이 커서 "물리명 직접 넣기" 로 갈음했다.
- 속성 패널 요약 목록(Q2)은 사용자에게 묻는다. 지금은 머리 글 한 줄이 가장 싸다.
- staleSelection 은 "다이어그램 바꿀 때만 비움" 이다. 늘 거르면 컬럼 점프로 다이어그램에 없는 표를 고르는 길이 깨진다.
