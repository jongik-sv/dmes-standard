# ui 진행 기록

조정 세션: dmes-standard-90 / 회차 rule-set-subset-call-2026-10-06 / 브랜치 `feat/rule-set-subset-ui` / 워크트리 `/Users/jji/project/dmes-standard-wt/rssc-ui`

## 기준선
- 착수 커밋: dev `c12e99a4`(plan:0 포함)를 합친 상태
- 시험: `node scripts/test.mjs`(m-mdm, workers 2) — Test Files 232 · Tests 3603 (passed 3602 · failed 1). 실패 1건은 `tests/ui-meta-lock.test.ts`「화면 소스의 컬럼 사전 연결 고정 > 기록과 같다」(m-mcm `commWidgetMng` 위젯 화면의 잠금 기록 차이, 이 레인과 무관, 조정 세션에 보고)
- lint(`tsc --noEmit`): 0
- 의존성: 워크트리에 node_modules 가 없어 `deps.sh` 로 워크트리 안에만 새로 설치(심링크 아님), 형제 패키지 `pnpm --filter "@dk-oasis/m-mdm^..." build` 통과
- Mantine 9.6.0 `Tabs`: `keepMounted?: boolean`, `keepMountedMode?: 'activity' | 'display-none'`(기본 `'activity'`) — 계획 Task 7 Step 1 과 같다. 기본 `'activity'` 는 숨은 패널의 효과를 내리므로 쓰지 않는다

## 남은 순서
ui:7 → (eng:1·srv:5 머지 뒤) ui:5t → (srv:6 머지 뒤) ui:8 → ui:9 (ui:9 화면 몫은 srv:6 전에 먼저 했다 — 아래 ui:9)

## ui:7. 편집 화면 안 세트 탭
- 상태: 구현·리뷰 완료(리뷰 2회 clean), 결정 12 는 조정 세션이 스펙 §10.3 대로 승인(2026-10-06, ui-3)
- 계획 조정:
  1. 세트 열기가 `open(setId, ver)` 로 바뀌었다 → 열기 요청(`OpenRequest`)에 `ver` 를 더하고 포털 파라미터의 `normVer(params.ver)` 를 넘긴다.
  2. 세트 고르기(`IdPicker`)는 위 바가 아니라 `FlowToolbar` 의 `lead` 로 들어가 있다 → 고르기는 편집기 안에 두고, 고른 세트가 다른 탭에 이미 열려 있으면 그 탭으로 옮기고 아니면 지금 탭에서 연다(같은 세트를 두 탭이 편집하지 않게). 탭 틀의 위 바는 만들지 않는다(조정 세션 승인).
  3. 편차 6 대신 탭 머리·닫기 단추·dirty 점·숨김 패널(`display:none` 마운트 유지)을 shared 새 컴포넌트 `closable-tabs` 로 등록하고 화면 `RuleSetTabs` 가 감싼다(Part B §18). 기존 shared `Tabs` 는 고치지 않는다. Part B §1 표 한 줄 추가는 조정 세션 승인.
  4. `SetVersionRow`·`useAutoSave`·`ViewportGuard` 는 훅·컴포넌트 인스턴스 상태라 편집기로 그대로 옮기면 탭마다 독립한다.
  5. 새 시험 도우미(`activateTab`·`inPanel`)는 소유 밖인 `tests/dme/helpers/rule-set-page.ts` 대신 `tests/dme/ruleSetEdit/` 아래 새 파일에 둔다.
- 커밋: `965c1b26`(tabs-model), `e507a2b7`(탭 틀·편집기·숨은 탭 처리·시험), 리뷰 후속 `67d91a13`(shared Delete 제거)·`c07d1f82`(실패 탭·포털 대화 상자·고르기 칸)·`b3f56e1c`(스킬 문서) — 결정 14. shared 는 `d735c02e`(closable-tabs 등록)·`464fda75`(스킬 문서·색인)
- 시험 결과(dev `8192debe`·`14ec1124` 합친 `a779f8a4` 위): m-mdm `node scripts/test.mjs` 235파일 3636 통과·0 실패(기준선 3602+1 실패 → ui-meta-lock 은 dev 갱신으로 통과, 새 시험 +34), m-mdm `tsc --noEmit` 0, shared `vitest run tests/unit` 136파일 1883 통과, shared `tsc --noEmit` 0, mantine·aggrid audit 0. shared 는 기존 export·props 변경 없음(package.json exports·tsup entry 에 `closable-tabs` 추가만)
- 결정:
  1. **파일 나눔** — `page.tsx`(얇은 기본 내보내기) → `RuleSetTabs.tsx`(`<style>`·`MdmPageLayout`·shared `ClosableTabs`·포털 파라미터) → `RuleSetEditor.tsx`(옛 page 본문). 탭 사이 연동 틀은 `tabs-context.ts` 에 두고 `RuleSetTabs.tsx` 가 다시 내보낸다(편집기·탭 틀이 서로 import 하지 않게). `styles/tabs.ts` 는 만들지 않았다(탭 틀 스타일은 shared 가 가진다).
  2. **`TabStatus`·`SetTab` 에 `ver` 를 더했다** — "포털 파라미터가 다른 버전을 넘기면 그 탭에서 다시 연다" 를 가리려면 탭이 연 버전이 필요하다. 비교는 `sameVer`(`@/shell/version-format`, 순수 함수). 알림 전 탭은 마지막 요청의 버전과 견준다. `draft` 는 버전 줄과 같이 `versions` 의 선택 버전 상태(없으면 `set.verStatus`)가 `DRAFT` 인가.
  3. **고르기(`pickInTab`)** — 같은 탭에서 같은 세트를 다시 고르면 새 요청(다시 불러오기, 지금 동작 유지). 다른 탭에 열린 세트면 그 탭을 고르기만 한다(요청 없음). 탭 틀 밖 기본 컨텍스트의 `pickSet` 은 아무것도 하지 않는다(편집기는 탭 틀 안에서만 쓴다).
  4. **`onWritten` 범위** — `runWrite`(저장·폐기·되살리기) 성공 뒤와 `versionWrite`(새 버전·DRAFT 삭제·확정 취소·선점·해제·넘기기) 성공 뒤, 다시 불러오기를 시도한 다음 그 세트 ID 로 한 번. 버전 조작은 다시 불러오기가 실패해도 부른다(쓰기 자체는 성공). 자동 저장(`saveQuiet`)·`reloadDraftGone`·거부는 부르지 않는다 — DRAFT 저장은 겉모양(지금 유효한 RELEASED 기준)을 바꾸지 않는다. [확정] 은 확정 화면(`ruleSetConfirm`)으로 넘어가므로 이 화면의 `onWritten` 대상이 아니다(확정 뒤 알림은 남은 위험).
  5. **숨은 탭 위험 a — document·window 리스너**: 캔버스 밖 ⌘Z(`outsideUndo`)는 기존 `isShown(canvasHostRef)` 그대로. 캔버스 단축키(`onCanvasKeyDown` — ⌘F·Delete·Esc 등)에도 같은 판정을 더했다(숨은 패널 안에 초점이 남은 경우). 도움말(`FlowToolbar`)의 Esc 캡처 리스너는 `stopPropagation` 을 하므로 숨은 탭에 도움말이 열려 있으면 보이는 탭의 Esc 를 삼켰다 → `isShown(helpAnchorRef)` 판정을 더했다. 우클릭 메뉴(`ContextMenu`)는 탭이 숨으면 편집기가 닫는다(`active` 거짓 → `setMenu(null)`). 즉석 편집 칸(`EdgeTextInput`)의 바깥 누르기는 탭 머리를 누를 때 편집을 끝내는 것이 맞아 그대로. `IdPicker` 의 mousedown(목록 닫기)은 해가 없어 그대로.
  6. **b — 포털**: 탭 틀이 편집기에 `active` 를 넘기고 편집기는 `active` 일 때만 `ErrorModal` 을 그린다. 숨은 탭의 오류(불러오기·조건식 확인 실패 등)는 `state.error` 로 남았다가 탭을 고르면 뜬다. 찾기 위젯·우클릭 메뉴·도움말은 포털이 아니라 패널 안에 그려져 `display:none` 을 따른다.
  7. **c — 분할 크기**: shared `ContentBody` 는 끌기 끝·화살표 키·두 번 누르기 때만 저장한다(측정 때 저장하지 않음) → 숨은 패널이 0 크기로 저장값을 덮지 않는다. 화면 쪽 처리·shared 수정 없음.
  8. **d — 캔버스**: React Flow 는 숨은 컨테이너(0 크기)를 500×500 으로 적는다 → `ViewportGuard` 의 화면 한계 재맞춤(`recheck`)이 그 크기로 화면을 옮길 수 있었다 → 캔버스(`store.domNode`)가 보이지 않으면 건너뛴다(다시 보이면 크기가 바뀌어 다시 본다). 노드 크기는 0 측정을 React Flow 가 버리므로 그대로. 화면 맞춤(fitSignal·fitKey)은 보이는 탭에서만 생긴다.
  9. **e — 자동 저장·선점**: `useAutoSave`·`SetVersionRow` 는 인스턴스 상태뿐이다. 모듈 변수는 `flow-layout` 의 배치 캐시(내용 키, 안전)뿐. localStorage 는 세트별 키(`rsf:bp:<setId>` 등)와 보는 사람 설정(`rsf:autoSave`·`rsf:minimap`·`rsf:varDisplay`)이다 — 자동 저장 켜짐은 보는 사람 설정이라 새로 여는 탭이 따른다(열린 탭끼리 실시간으로 맞추지는 않음). 시험으로 한 탭의 자동 저장·선점이 다른 탭 세트로 요청을 보내지 않음을 고정했다.
  10. **f — beforeunload**: 탭마다의 `useRuleSetEdit` 가 각자 건다(패널을 `display:none` 으로만 숨겨 효과가 내려가지 않는다). 숨은 탭이 dirty 여도 막는 것을 시험으로 고정했다.
  11. **보는 사람 설정(Ruling 22)** — 변수 표시·미니맵은 `publishPrefs` 로 알리고 다른 탭이 따른다. 디버그 모드 탭은 변수 표시를 따르지 않는다(P-D16). 분할 크기는 같은 `storageKey` 라 새로 여는 탭이 따른다.
  12. **기존 시험 4건을 옮겼다(조정 승인 받음 — 스펙 §10.3 은 사용자 승인 내용)** — spec §10.3 의 "포털 파라미터는 링크와 같다(세트 없는 빈 탭 하나뿐일 때만 그 탭)" 와, 포털 넘김이 같은 탭의 세트를 바꾼다고 고정한 기존 시험이 정면으로 어긋났다. 계획 Step 7 의 "단일 탭 동작은 바뀌지 않는다" 가 이 4건을 놓쳤다. ui:7 의 탭 화면 시험(상한·닫기·숨은 탭 등)은 두 번째 탭이 필요하고, ui:7 에서 두 번째 탭을 여는 길은 포털 파라미터뿐이라(`openLinked` 는 Task 8 이 부른다) spec 을 따랐다.
     - `rule-set-edit-page.test.ts`「탭이 다시 활성화될 때 …」: 옛 기대 = dirty 면 확인, 확인하면 같은 탭에서 E2S_OTHER. 새 기대 = 확인 없이 새 탭으로 열고 고름(보기 모드), 원래 탭의 변경·dirty 점은 그대로, 이미 열린 E2S_CHAIN 을 다시 넘기면 그 탭으로 감(새 view 요청 없음).
     - `seams.test.ts` 5번(dirty 면 다른 세트 열기 전 확인)·`undo.test.ts` 4번(다른 세트를 열면 되돌리기 꺼짐)·`flow-menu.test.ts` 5번(다른 세트를 열어도 클립보드가 남음): 기대는 그대로 두고, 다른 세트를 여는 길만 포털 넘김에서 툴바 세트 고르기(`pickInActive`, 같은 탭)로 바꿨다.
     - 되돌리기(spec 대신 옛 동작): `tabs-model.ts` `openFromParams` 를 지금 탭의 `pickInTab` 으로 바꾸고 위 4개 시험 파일을 `e507a2b7^` 로 되돌린다. 그러면 `set-tabs.test.ts` 의 두 번째 탭을 여는 시험은 Task 8 링크가 생길 때까지 쓸 수 없다.
  13. **남은 위험** — (1) 클립보드는 편집기(탭)마다라 탭 사이 복사·붙여넣기는 안 된다(같은 탭에서 세트를 바꾸면 남는다). (2) 포털 넘김이 탭을 바꾸는 순간 지금 탭에 열려 있던 대화 상자는 결정 14 가 처리했다(케이스 편집 창은 고른 탭일 때만 그린다). shared 안에서 포털하는 창은 고칠 수 없어 남는다 — 결정 14-b. (3) 세트를 고른 직후 불러오기가 끝나기 전에 다른 탭으로 옮기면 그 세트의 첫 화면 맞춤이 숨은 동안 대기열에 오른다(React Flow 는 노드를 잴 때까지 기다리므로 다시 보일 때 맞춘다고 보지만 브라우저 확인 전). (4) `flow-layout` 배치 캐시는 4칸이라 8탭을 오가면 캐시가 밀려 dagre 를 다시 돈다(성능만). (5) 열린 탭끼리 분할 크기·자동 저장 켜짐은 실시간으로 맞추지 않는다.
  14. **리뷰 후속(minor 지적 반영)**
      - a. **실패한 탭 판정** — `SetTab`·`TabStatus` 에 `settledSeq`(편집기가 처리를 끝낸 마지막 요청 번호)를 더했다. 편집기는 `open` 이 끝나면(불러왔든 실패했든 저장 안 한 변경 확인에서 물렸든) 올려 알린다. `currentOf` 는 불러온 `setId` 가 먼저이고, 요청만 있는 탭은 그 요청이 아직 처리 중(`request.seq !== settledSeq`)일 때만 그 세트를 연 탭으로 본다. 그래서 첫 빈 탭의 불러오기가 실패하면 그 탭은 빈 탭(머리 「새 탭」)이라 포털 파라미터가 그 탭을 다시 쓰고, 실패한 탭은 링크·고르기가 '열린 탭' 으로 찾지 않는다(그 탭으로 가기만 하고 다시 불러오지 않는 일이 없다). 두 번째 이후 탭이 실패하면 그 탭은 빈 탭으로 남고 같은 세트의 링크는 새 탭을 연다(빈 탭 재사용은 spec 대로 세트 없는 탭 하나뿐일 때만).
      - b. **포털 대화 상자 목록** — `RuleSetEditor` 트리의 portal 후보를 점검했다. ① 오류 창 `ErrorModal`: `active` 일 때만 그림(기존). ② 테스트 케이스 편집 창 `CaseEditModal`(shared `Modal`, body 포털): 새 `EditorActiveContext`(편집기가 알림, 기본 참)가 거짓이면 `open` 을 끈다. 작성 중 칸은 이 부품 상태라 남고 탭을 다시 고르면 이어진다(시험 `set-tabs-dialog.test.ts`). ③ 우클릭 메뉴·찾기 위젯·도움말·`IdPicker` 목록·케이스 삭제 확인: 패널 안에 그려져 `display:none` 을 따른다(메뉴는 `active` 거짓이면 닫음). 고치지 않은 것(shared 안이라 이 레인이 못 고친다) — ④ 버전 줄 [삭제]·[확정 취소] 의 확인창은 `useMessage().showMessage` 가 만드는 전역 `MessageModal` 이라 편집기가 닫을 수 없다(확인하면 시작한 탭의 세트에 적용되므로 대상이 틀어지지는 않는다). ⑤ 마크다운 도식 크게 보기(`MermaidViewer`, 화면 전체 덮개)는 열려 있는 동안 탭 머리를 누를 수 없고 포털 넘김으로만 탭이 바뀐다. ⑥ 호버 툴팁(`MdmFieldLabel`·`MdmHeaderLabel`·`HoverTipPortal`)은 마우스가 벗어나면 닫힌다. ⑦ `window.confirm`(저장 안 한 변경 확인)은 브라우저가 막는다. ④⑤⑥ 은 드문 길이라 남은 위험으로 둔다.
      - c. **고르기 칸 잔여** — `pickSet` 이 고른 뒤 지금 탭의 key 를 돌려주고(탭 틀 밖 기본값은 null), 편집기는 그 key 가 자기 탭이 아니면 `IdPicker` 를 `key` 로 다시 마운트한다(props 를 바꾸지 않음) — 시작한 탭의 칸이 그 탭의 세트 ID 로 돌아온다.
      - d. **ClosableTabs Delete 제거** — 정본 API 에 없어 Delete 키 닫기를 뺐다. 키보드만으로 닫을 수 있게 지금 탭의 닫기 단추만 `tabIndex=0`(나머지 -1, roving)으로 두어 Tab 으로 지금 탭 단추 다음에 닫기 단추에 가 Enter·Space 로 닫는다(Tab 정지는 지금 탭 기준 하나 늘 뿐이다). `closable-tabs.md`·`llms-full.txt`·단위 시험도 맞췄고 Mantine 대응표에 `Tabs keepMounted` 줄을 이었다.
      - e. **시험** — `tabs-model.test.ts`(처리 중·실패·불러온 세트 우선·알림 같은 값), `set-tabs.test.ts`(첫 빈 탭 실패·두 번째 탭 실패·고르기 칸 되돌림·DRAFT 탭이 `unconfirmedSetIds`·`dirtySetIds` 에 드는 화면 경로 — `ChecksPanel` 을 감싼 소비자로 컨텍스트를 읽음), `set-tabs-dialog.test.ts`(케이스 편집 창), shared `closable-tabs.unit.test.ts`.

## ui:5t. TS 흐름·분석기 짝
- 상태: 구현 끝, TS 코퍼스 러너 초록(srv:5 `10fb5284` 를 합친 `dae06a22` 위). srv:5 와 짝 머지 대기.
- 커밋(`6d4f04ca` 혼자는 `set-model.ts` 가 옛 `Step` 합에 맞춰 있어 tsc 가 깨진다 — `7aff5fed` 까지가 초록 단위): `6d4f04ca`(흐름 해석 — `flow-model.ts`·`flow-edit.ts` addCatch 종류·`PropertyPanel.tsx` 받을 예외 목록·`trace-view.ts`, 시험 `flow-model.test.ts`·`catch-edit.test.ts`·`catch-panel.test.ts`), `7aff5fed`(분석기 — `set-model.ts`·`types.ts`, 시험 `set-model.test.ts`·`rule-set-corpus.test.ts`)
- 시험 결과(m-mdm, workers 2):
  - 착수 기준은 조정 지시의 "하위 세트 사례 18건 실패"이고 직접 돌리지는 않았다. 정적으로는 calls·SET·SUBSET_ENDED 사례 17건과 h2 사례 1건(코퍼스의 기대 문구가 새 h2 문구 — grep 1건)으로 수가 맞는다. 조정 지시의 합계(18 + 368 = 386)와 이 러너의 시험 수(310 = 코퍼스 108 + 퍼즈 200 + 머리 2)는 다르다 — 다른 코퍼스·퍼즈 판(srv:6 등)을 센 것인지 조정 세션이 확인한다.
  - 구현 뒤 같은 명령 → 310 통과·0 실패(코퍼스 108·퍼즈 200·머리 2).
  - `vitest run tests/dme/ruleSetEdit` → 97파일 1855 통과·0 실패.
  - `vitest run tests/dme` → 130파일 2488 통과·0 실패.
  - `tsc --noEmit` → 0.
  - `node scripts/test.mjs`(m-mdm 전체)는 무거워 돌리지 않았다(조정 지시).
- 조정 메모에서 옮긴 규칙(srv:5 원문·조정 ui-2·ui-4 알림, Ruling 9 합의) — TS 가 서버와 같게 한 것:
  1. **RULE·SET 단계 모으기** — 루트 `Seq` 부터 깊이 우선. RULE·SET 은 담고 TASK 는 건너뛴다. `Guarded` 는 자기 step(RULE·SET 일 때만) → normal → handlers 배열 순서로 각 body, `Split` 은 branches 순서. 같은 노드는 한 번만. TS 는 `set-model.ts` `callSteps(tree)`(서버 `RuleSetAnalyzer.callSteps`, 엔진·TS `FlowTree` 에 callSteps 를 두지 않는다).
  2. **never 분기 순서 SET → TASK → RULE** — TASK·RULE 은 SUBSET_ENDED 를 받는 처리 갈래마다 `FLOW_CATCH`(REJECT, ruleId null, nodeId = 받는 노드)를 먼저 모두 낸 뒤 기존 `CATCH_NEVER`. 문구 RULE "받는 노드 {catchId}: 룰 노드에는 하위 세트 예외 끝(SUBSET_ENDED)을 붙일 수 없다", TASK "받는 노드 {catchId}: 빈 단계 노드에는 하위 세트 예외 끝(SUBSET_ENDED)을 붙일 수 없다". RULE 의 FLOW_CATCH 는 룰 존재·RELEASED 검사(조기 return) 앞에서 낸다. SET 은 처리 갈래 → 받는 종류 저장 순서로 NO_RESULT `FLOW_CATCH` "받는 노드 {c}: 세트 노드에는 결과 없음(NO_RESULT)을 붙일 수 없다", SUBSET_ENDED + 겉모양 있음 + `endsEarly=false` 면 `CATCH_NEVER`(ruleId = setId) "받는 노드 {c}: 세트 {setId}에는 END 로 가는 처리 갈래가 없어 하위 세트 예외 끝이 일어나지 않는다".
  3. **CALL_MISSING 은 WARN**(편차 13) — 룰 존재 검사 바로 뒤·EMPTY 앞, 노드 배열 순서, 같은 세트 ID 는 첫 노드에만, 빈 ID 는 노드마다. `callRuleIo` 의 releasedVer 는 문자열 `"1.000"`(서버 `SetCallIo.RELEASED_MARK`).
  4. **flow-model.ts** — `CATCH_NAMES` 다섯(`CATCH_SET` 포함), `CATCHABLE` 에 SET, h2 문구 "받는 노드 {c}는 룰·빈 단계·룰 세트 노드에만 붙일 수 있다({t}는 {KIND})"(엔진 `FlowParser.checkCatchNodes` 와 글자 대조).
  5. **`SetCallIo.inputs` 는 예약 이름 `CATCH_*` 를 뺀다**(편차 11) — 서버가 계산해 주는 값이고 화면은 받기만 한다(TS 는 계산하지 않음, 타입 주석에 적음).
  6. **구조 d1** — SET 들어오는 선은 0개일 때만 오류(1개 이상 정상, 모이는 자리·돌아오는 자리 2개도 정상). SET 나가는 선 1. (`IN_DEGREE.SET = AT_LEAST_ONE`·`OUT_DEGREE.SET = ONE` 은 eng:1 이 넣었다.)
  7. 그 밖에 서버와 같게 한 것: SET 노드는 키 `set:{setId}` 의 룰 입출력으로 돈다(Ruling 6 — 입출력 표 `users`·`by`·`readers` 와 `deps` 키에 그대로, 문구는 "세트 {setId}", 칸은 세트 ID). always=false 출력은 이미 defined 가 아니면 maybe(Ruling 7, prodBy 는 always 와 무관하게 갱신). EMPTY 는 RULE·TASK·SET 이 하나도 없을 때(Ruling 18). COND_UNTYPED 선언 이름은 이 세트의 룰만(Ruling 20). R13(받는 노드 예약 이름) ORDER 는 SET 에도 같은 갈래로(문구 이름 `disp`, 칸 세트 ID). 옛 형식 돌아오는 MERGE 의 splitId 가 SET 이면 "합류 {m}의 짝 분기 {s}가 없다"(implicit-join spec §13). 빈·공백 setId 는 구조 오류가 아니다.
- 결정:
  1. **새 TS 이름** — `flow-model.ts`: `SetStep { type: "SET"; nodeId; setId: string | null }`(`Step` 합에), `FlowTree.setSteps()`·`setIds()`, `flowSetIds(flow, parsed?)`(서버 `RuleSetFlowJson.setIds` 짝), `CATCH_KINDS_FOR`·`catchKindsFor(kind)`. `set-model.ts`: `setKey`·`isSetKey`·`setIdOfKey`·`keyOf`·`callRuleIo`·`callSteps`·`flowCallKeys`·`CallStep`, `flowIo`·`flowDeps`·`flowChecks` 끝 인자 `calls: SetCallIoMap = {}`. `types.ts`: `SetCallOutput`·`SetCallIo`·`SetCallIoMap`, `RuleSetCheckCode` 에 `CALL_MISSING`·`CALL_CYCLE`·`CALL_DEPTH`·`CALLER_BROKEN`.
  2. **calls 를 넘기지 않으면** SET 노드는 모두 없는 세트(CALL_MISSING WARN)다 — Ruling 8 "화면은 callIo 응답이 오기 전에도 같은 규칙". 지금 화면(`useRuleSetEdit`)은 calls 를 넘기지 않는다 — callIo 조회·전달은 ui:8. RULE 만 있는 흐름은 calls 가 있어도 결과가 같다(시험 고정).
  3. **`CATCH_KINDS` 는 다섯(구조 검사가 아는 키 전부), 고르기는 노드 종류별** — 계획 Task 2 의 `CATCH_KINDS_FOR` 에 TASK 를 더해(RULE 과 같은 넷) `addCatch` 와 속성 패널 받을 예외 목록이 `catchKindsFor(붙은 노드 종류)` 를 쓴다. RULE·TASK 의 화면·편집 동작은 그대로다. SET 에 붙이면 INPUT_ERROR → EVAL_ERROR → HIT_CONFLICT → SUBSET_ENDED 순으로 고른다(시험). `setCatchKinds` 정렬은 `CATCH_KINDS` 그대로.
  4. **`CATCH_ONLY_RULE` 문구** — `CATCHABLE` 이 SET 을 받으므로 "룰·빈 단계·룰 세트 노드에만 예외 받기를 붙인다" 로 바꿨다(eng:2 가 넘긴 TS 문구 일).
  5. **trace-view** — `scopePaths` 가 SET 단계에 경로를 적고, 받는 노드가 붙은 SET 단계 직전 CATCH_* 를 적어(outerCatch) 돌아오는 자리에서 되돌린다. `debug-model` 은 `CATCH_NAMES` 를 쓰므로 `CATCH_SET` 도 "받는 노드가 넣는 값" 으로 고치지 않게 된다(코드 변경 없음). `Record<FlowNodeKind|CatchKind>` 맵 누락은 없었다(eng:1 이 `catch-text`·`NODE_SIZE`·차수표·KIND_TEXT 를 채웠다, tsc 0).
- 계획 조정(본문과 다르게 한 것):
  1. 본문 `FlowTree.callSteps()`·`CallStep`(flow-model) → 엔진·srv 와 같이 `FlowTree` 에 두지 않고 `set-model.ts` `callSteps(tree)` 로 분석기 안에서 모은다(`CallStep` 타입도 set-model 에). 순서 단언은 `set-model.test.ts` 가 코퍼스·퍼즈 전체로(RULE 부분 = `ruleSteps()`, SET 부분 = `setSteps()`, 세트 키를 뺀 `flowCallKeys` = `flowRuleIds`) 한다 — srv `RuleSetCorpusTest` 단언과 같다. 본문의 새 시험 파일 `flow-model-set.test.ts` 대신 `flow-model.test.ts` 끝에 SET 묶음을 더했다.
  2. 본문 `CALL_MISSING` 수준 REJECT → WARN(편차 13·서버·코퍼스), 본문 `callRuleIo.releasedVer: 1` → `"1.000"`, 본문 `step()` 에 없던 R13 예약 이름 처리를 되살렸다(srv 와 같음), 본문 `never` 의 RULE 캐스트 대신 SET → TASK → RULE 분기.
  3. 본문 `CATCH_KINDS_FOR` 는 RULE·SET 두 키 → TASK 키를 더했다(TASK 받는 노드도 지금 네 종류를 고른다).
  4. **기존 시험 2건 기대값을 바꿨다**(소유 시험, 동작이 정본대로 바뀐 것): `catch-panel.test.ts`「처리 갈래 첫 선의 변수 칩」 넷 → 다섯(`CATCH_SET`, Ruling 3·4 — RULE 처리 갈래에도 CATCH_SET 이 있다), `catch-edit.test.ts` 의 `CATCH_ONLY_RULE` 문구(결정 4).
     - RULE 만 있는 흐름의 동작이 바뀐 곳 하나 더(코퍼스 사례는 없음, 서버와 같음): 처리 갈래 밖에서 `CATCH_SET` 을 읽는 룰은 이제 R13 ORDER("…는 받는 노드의 처리 갈래 안에서만 있다")다.
     - 위 세 가지는 조정 세션 승인 대상으로 올린다.
  5. **`trace-view.catchValues` 는 넷 그대로** — `NodeTrace` 에 CATCH_SET 값을 읽을 칸이 없다. CATCH 노드 기록의 CATCH_SET 표시·값 흐름은 엔진 실행(eng:4)과 디버거(ui:9, Task 9 의 `frames`·`chipOf`·`valueTable` SET 갈래)에서 정한다. `frames`·`valueTable` 의 SET `outputs` 반영도 Task 9 몫이라 하지 않았다.
  6. 속성 패널 안내 문구("CATCH_KIND·CATCH_RULE·CATCH_CODE·CATCH_MSG 를 읽을 수 있다")·"붙은 룰" 라벨·SET 노드 그리기·속성 패널·flow-edit SET 붙여넣기(`isStep`·`NODE_PREFIX`)는 화면 표시라 ui:8 에 남긴다.
  7. `tests/helpers/engine-paths.ts` 는 고치지 않았다(코퍼스 경로가 이미 있다).
- 리뷰 반영(minor 2건):
  1. 정본 갈래 두 개가 시험에 없었다 → `98b68f3d` 로 `set-model.test.ts`「하위 세트(SET 노드) 분석」에 둘을 더했다. (a) 겉모양 exists=true·status DEPRECATED → `CALL_MISSING` WARN "SP는 폐기된 세트다"(nodeId s1). (b) RULE 에 붙은 SUBSET_ENDED 받는 노드 → 룰이 없으면 `RULE_NOT_FOUND` 바로 뒤, RELEASED 가 없으면 `NO_RELEASED` 바로 뒤에 `FLOW_CATCH`(REJECT, ruleId null, nodeId c1) 하나(조기 return 앞에서 낸다는 순서 고정). 구현 변경은 없다(Java `RuleSetAnalyzer.never`·`callMissing` 과 이미 같다). 같은 두 사례를 srv:6 코퍼스에도 넣을지는 조정 세션이 srv 에 정한다.
  2. 속성 패널 받을 예외 목록이 `catchKindsFor(붙은 노드 종류)` 라 RULE·TASK 에 이미 저장된 SUBSET_ENDED 키는 칩이 없어 패널에서 풀 수 없다 → 화면 표시라 ui:8 몫(저장됐지만 목록 밖인 종류도 칩으로 보여 해제할 수 있게). ui:5t 에서는 고치지 않았다 — 분석기는 이 키를 `FLOW_CATCH` 로 알린다.
  - 리뷰 반영 뒤 시험: `vitest run tests/dme/ruleSetEdit/set-model.test.ts` → 33 통과, `vitest run tests/dme` → 130파일 2490 통과·0 실패, `tsc --noEmit` → 0.
- 넘긴 일: srv:6 묶음 A 코퍼스 사례(setId "" + 받는 노드, PARALLEL 형제 SET, SET 낀 CYCLE)가 머지되면 TS 러너를 다시 돌린다(조정 ui-4).

## 머지 2 — srv:5 + ui:5t 짝 머지(조정 지시 ui-6)
- ui 브랜치에 srv:5(10fb5284)가 들어 있어 한 머지로 넣는다. dev 최신 `136ec85b`(eng:4·eng:c·문서)를 합쳤다(충돌 없음, 프론트 소스 변경 없음).
- 시험: m-mdm `node scripts/test.mjs` 235파일 3670 중 3669 통과·1 실패 — 실패는 `tests/dma/domainMng/page-render.test.ts`「행이 있으면 들여쓴 이름이 보인다」로, 단독 3회 재실행에서 1회 실패·2회 통과한 간헐 실패(타이밍, ruleSetEdit 무관, 이번 합치기의 프론트 변경 없음). m-mdm `tsc --noEmit` 0. `src/backend/mdm` 에서 `heavy.sh ../gradlew :lib:test --max-workers=2` → 116 클래스 2027건 통과·0 실패.

## ui:9. 디버거 안으로 들어가기
- 상태: 화면 쪽 구현(일부) 끝. srv:6(`execute` 응답의 `calledFlows`·연쇄 재검사)이 아직 dev 에 없어 서버가 `calledFlows` 를 주지 않아도 깨지지 않게 했다(아래 결정 3). 계획 Task 9 와 Task 8 의 디버거 경고 몫(조정 지시)을 했다.
- 커밋: `e08b2e20`(순수 함수 `call-stack.ts`·`trace-view` SET 값 흐름·`types.CalledFlow`, 시험 `call-stack.test.ts`), `c4e48c89`(훅·패널·편집기 연결·경로 표시 줄, 시험 `debug-subset.test.ts`), `fca4a865`(확정 안 한 하위 세트 경고·`copyNode` setId), `cd2e8ab2`(리뷰 반영 — 프레임 안 찾기 끔, 결정 6)
- 시험 결과(리뷰 반영 뒤): `vitest run tests/dme/ruleSetEdit` → 99파일 1881 통과·0 실패(찾기 시험 1건 더함). 처음 구현: 99파일 1880 통과·0 실패(기준 = ui:5t 기록 97파일 1855 + ui:5t 리뷰 반영 `98b68f3d` 의 2건 = 1857 — 이 세션에서 기준을 다시 돌리지는 않았다. 새 시험 23 = call-stack 10 + debug-subset 13, 새 파일 2), m-mdm `tsc --noEmit` 0, 바꾼 화면 파일 mantine·aggrid audit 0건.
- 계획 조정(본문과 다르게 한 것):
  1. **`SEAM(T9)`** — `grep -rn "SEAM(T9)" src/frontend/m-mdm/pages` 가 착수 때 이미 0건이었다(ui:5t 가 `scopePaths`·`frames` 에 SET 을 넣었다). 바꿀 것 없음.
  2. **`enterFrame` 은 `calledFlows` 에 그 세트 항목이 없으면 null** — 본문은 항목이 없으면 `toEditFlow(null, [])`(START→END) 로 들어갔다. 서버가 아직 주지 않는 지금 빈 흐름을 그리면 틀린 그림이라 들어가지 않는다. 항목이 있고 `flow` 가 null 이면 본문대로 `ruleIds` 한 줄 흐름. 라벨은 SET 노드 라벨(공백이면 없음으로 봄) → 세트명 → 세트 ID.
  3. **`TraceDetail` 에 `calledFlows` prop** — 본문은 `onEnter` 만. 하위 기록(`sub`)이 있는데 그 세트 흐름을 받지 못했으면 [안으로 들어가기](`sim-detail-enter`)를 끄고 `sim-detail-enter-off` "하위 세트 흐름을 받지 못해 안으로 들어갈 수 없다" 를 보인다(`ENTER_OFF_NOTE`). 세트 ID 칸은 `sub` 가 없으면(하위 세트 전에 멈춤) 흐름 노드의 `setId` 로.
  4. **`useCallStack` 은 프레임을 만든 기록(`owner`)에 묶는다** — 본문은 `useEffect(() => setFrames([]), [last])`. 효과로 지우면 새 기록 첫 렌더에 옛 프레임이 보이므로 `owner !== last` 면 같은 렌더에서 빈 목록으로 본다. 돌려주는 객체는 `useMemo`.
  5. **`FrameDetail`** — 본문의 기록 상세 위에 프레임 상태 한 줄(`frame-detail-status`, `debugStatus(하위 기록, 프레임 커서, 0, 하위 흐름)`)을 두었다 — 끝내는 IF 갈래로 끝난 하위 기록의 "IF {제목}의 「{갈래}」 갈래에서 끝냈다"(스펙 §11)가 여기 보인다. END 상세에도 `endedBranchText(하위 기록, 하위 흐름)` 을 넘긴다. 고른 노드가 프레임 커서 뒤면 변수 패널과 같은 "아직 실행하지 않은 노드다". 손주 세트 들어가기를 위해 `calledFlows` prop(최상위 실행 응답 것, 서버가 재귀로 모은다).
  6. **`RunCompare`** — 경로 키를 글자로 묶어 메모(본문 eslint 끄기 대신). 이전 실행에 같은 경로의 하위 기록이 없으면 `NO_PREVIOUS_SUB_NOTE` "이전 실행에는 이 하위 세트 기록이 없다".
  7. **편집기 연결(`RuleSetEditor.tsx`)** — 본문의 넘기는 값에 더해: 선택 정리 효과가 프레임 안이면 하위 흐름으로 본다(아니면 하위 노드를 고르자마자 풀린다). `isFlowNode` 는 프레임 안이면 거짓(노드 ID 가 부모·하위에서 겹친다 — 툴바 [여기까지]·F9 가 부모 노드에 닿지 않게). 프레임 안이면 `onContextMenu`·`onToggleBreakpoint` 가 아무것도 하지 않고 중단점 점은 CSS(`.rsf-body[data-frame] .rsf-bp`)로 숨긴다. 변수 칩 라벨은 하위 룰 입출력(`varLabelsOf(top.rules)`). 들어가기·경로로 돌아가기는 선택을 푼다.
  8. **경로 표시 줄** — 본문 `.rsf-link` 는 캔버스 손잡이 클래스와 이름이 겹쳐 `.rsf-callpath-link`·`.rsf-callpath-sep`·`.rsf-callpath-crumbs` 를 새로 썼다. `.rsf-body` 가 가로 flex 라 프레임일 때 `data-frame` 으로 세로로 쌓는다. 마지막 조각은 `aria-current="location"`.
  9. **값 표 탭(`ValuesTab`)** — 프레임이면 실행 경고(`SimWarnings`)는 최상위 실행 것이라 보이지 않는다.
  10. **`flow-edit.copyNode` 가 SET 노드의 `setId` 를 버렸다** — 편집 흐름(`toEditFlow`)에서 `setId` 가 사라져 `flowSetIds(편집 흐름)` 이 비고, 실행 요청(`flowJsonOf`)에도 `setId` 가 빠졌다. 경고에 필요한 최소로 SET 노드에만 label 뒤 `setId` 를 남긴다(다른 종류에는 칸을 더하지 않는다 — 기존 흐름 JSON 은 한 글자도 안 바뀜). 계획 Task 8 은 `node()` 에 `setId` 를 더해 모든 노드에 `setId: null` 을 싣는 방식이다 — ui:8 이 서버 정규 JSON 키 순서와 맞춰 고를 일로 넘긴다. 리뷰(minor)도 같은 판단 — 서버 `DefinitionLookup.FlowNode` 순서(id, kind, ruleId, splitId, label, attachTo, catches, setId)와 맞출지·모든 노드에 `setId: null` 을 실을지는 **ui:8 착수 전에 조정 세션이 정한다**. 지금 코드는 그대로 둔다.
- 결정:
  1. **툴바·단축키 단계 실행(Ruling 21)** — 프레임 안에서 [한 단계]·[이전]·F10 등을 쓰면 최상위 기록의 커서가 움직이므로, 최상위 커서(`sim.cursor`)가 바뀌면 최상위로 돌아온다(`backTo(0)`). 새 기록·[중지]도 기록이 바뀌어 프레임이 비워진다. 프레임 커서는 경로 줄 ‹ ›(`dbg-frame-prev`·`dbg-frame-next`, `dbg-frame-status` = `{커서}/{n}`)만 옮긴다.
  2. **디버그 모드를 나가면** 편집기 효과가 `backTo(0)` — 다시 들어와도 최상위.
  3. **`calledFlows` 가 없을 때** — `RuleSetSimulateResult.calledFlows?`(선택), `SimResult.calledFlows` 는 늘 있고 없으면 빈 객체(모듈 상수). SET 노드 상세·칩·값 흐름·값 표는 `outputs`·`sub` 만 쓰므로 그대로 보이고, 들어가기만 꺼진다(결정 위 계획 조정 3).
  4. **확정 안 한 하위 세트 경고(C-D18, 조정 지시)** — 계획 Task 8 의 `sim-dirty-subsets`("저장된 정의로 한다", `dirtySetIds`)를 대신한다. 조건: 디버그 모드 ∧ 편집 흐름의 `flowSetIds` 가운데 자기 세트가 아니고 `tabsApi.unconfirmedSetIds`(저장 안 함 또는 DRAFT 를 엶, ui:7)에 든 세트. 자리: `DebugToolbar` 바로 아래 줄(`.rsf-dbg-subset-warn`, `role="status"`). **세트마다 한 줄** — 묶음 `dbg-subset-unconfirmed` 안에 `dbg-subset-unconfirmed-{setId}` 마다 "하위 세트 {S}에 확정하지 않은 변경이 있다. 실행은 판정 시각의 RELEASED 로 한다."(`subsetUnconfirmedText`). 문구의 {S} 가 하나라 쉼표로 묶지 않았다. 순서는 흐름 순서. 손주 세트(하위 흐름 안의 SET)는 세지 않는다(이 탭 흐름의 SET 노드만). ui:8 은 `sim-dirty-subsets` 를 따로 더하지 않는다.
  5. **하위 흐름 그리기** — `toEditFlow` 를 거치므로 옛 형식 IF 합류는 D-136 새 형식으로 바뀐다(시험). 이때 엔진은 저장된 옛 흐름으로 돌았으므로 하위 기록에 없어진 합류 노드 기록이 있을 수 있다 — 겹침은 흐름에 없는 노드 기록을 무시한다(남은 위험: 그 합류 단계에서 프레임 커서가 "지금" 표시 없이 한 칸 지나간다).
  6. **프레임 안 찾기(리뷰 minor 반영)** — 찾기(`useFind(flow, state.rules, reveal)`)는 최상위 편집 흐름만 찾으므로, 프레임 안에서 결과를 고르면 부모 노드 ID 가 `selectedId` 로 들어가 선택이 곧 풀리거나(ID 없음) 하위 캔버스의 엉뚱한 노드가 골라졌다(ID 겹침). 계획 조정 7(우클릭·F9 막기)과 같은 규칙으로 프레임 안에서는 찾기를 끈다: `findShown = findOpen && !top` 으로 위젯·`data-find-open`·툴바 `aria-expanded` 를 정하고, 단축키 `find` 손잡이를 비워(키를 쓰지 않아 브라우저 찾기 그대로) 툴바 [노드 찾기]를 `findDisabled` 로 끈다. 최상위에서 열어 둔 위젯은 프레임 안에서 숨었다가 돌아오면 다시 보인다(`findOpen` 은 그대로). 하위 흐름 찾기(`useFind(shownFlow, top.rules)`)는 하지 않았다 — 결과를 고르면 접힘 펴기·이동이 최상위 상태에 묶여 있어 고칠 곳이 커진다.
- 시험: 새 `call-stack.test.ts`(10 — 들어가기·없는 흐름·라벨·옛 형식 변환·경로·커서 값·받은 예외 수·setId 보존·값 흐름·칩·오류 SET), 새 `debug-subset.test.ts`(13 — SET 상세·칩, 들어가기·경로·‹ ›·돌아오기, 중지·새 실행에 비움, 툴바 단계에 최상위로, 모드 나가기, calledFlows 없음 안내, 프레임 실행 비교, 손주 세트·가운데 조각, 우클릭·F9·중단점 점이 부모에 닿지 않음, 프레임 안 찾기 끔(리뷰 반영 1건 더해 14), 프레임 값 표, 경고 — 저장 안 함·탭 닫기·모드 밖·DRAFT·부르지 않는 세트).
- srv:6 머지 뒤 남은 일(실제 `calledFlows` 로 확인):
  1. 서버 `calledFlows` 키·모양이 `CalledFlow`(`setId·setName·flow(view 포함)·ruleIds·rules`)와 같은지, 손주 세트까지 재귀로 모으는지 — `debug-subset.test.ts` 의 목 응답을 실제 응답 한 건과 대조한다.
  2. `flow` 의 `view.positions` 가 오면 하위 캔버스가 저장된 배치로 그려지는지(목은 `flow: null`·빈 view 뿐), 옛 형식 하위 흐름의 기록 노드와 변환 흐름이 어긋나는 자리(결정 5).
  3. 하위 `RuleIo`(`rules`)로 룰 노드 제목·칩이 나오는지, 하위 세트 안 오류·CAUGHT·끝내는 IF 갈래 끝의 상태 줄 문구를 엔진 실제 기록으로 본다.
  4. 브라우저 확인(조정 세션, 사용자 승인 뒤): 경로 줄 모양·좁은 폭 줄바꿈, 프레임 전환 때 화면 맞춤(`fitKey`), 경고 줄 색.

## ui:8. SET 노드 화면
- 상태: 1단계(모델·상태)·2단계(화면·e2e 시나리오) 끝. e2e E19 는 `--list` 까지만 했다(실행은 사용자 승인 뒤 조정 세션).
- 리뷰 반영(`cb51cc01`): major 1(구성 지침이 SET 노드를 지움 → 결정 9)·minor 2(세트 검색 잘림 안내 → 결정 10, 부르는 세트 다시 묻기 → 결정 11) 모두 고쳤다. 시험: `vitest run tests/dme/ruleSetEdit tests/ui-meta-lock.test.ts` → 104파일 1946 통과·0 실패(새 시험 5 = set-node-model 1·rule-set-edit-page 1·set-node-canvas 1·set-node-page 2), m-mdm `tsc --noEmit` 0, 바꾼 파일 mantine·aggrid audit 0건.
- 리뷰 2차 반영: minor 2(목록 밖 종류가 유일한 종류 → 결정 7 보탬, CALL_IO 실패 표시·다시 묻기 → 계획 조정 4 고침·결정 12) 모두 고쳤다. 시험: `vitest run tests/dme/ruleSetEdit tests/ui-meta-lock.test.ts` → 104파일 1950 통과·0 실패(새 시험 4 = set-node-page 2·set-calls-state 2), m-mdm `tsc --noEmit` 0, 바꾼 파일 6개 mantine·aggrid audit 0건. e2e 는 바꾸지 않았다.
- 커밋(1단계): `7209d80e`(types·api), `243e189f`(flow-edit·flow-vars·caller-links, 시험 `set-node-model.test.ts`), `eb3375f7`(useRuleSetEdit·편집기 한 줄, 시험 `set-calls-state.test.ts`·이 절)
- 커밋(2단계): `2898a285`(캔버스 — SET 노드 그리기·도구 상자·메뉴·세트 검색 팝업·`styles/set.ts`·편집 동작), `48c47800`(오른쪽 패널 — 머리글 CALL·SET 속성·받는 노드 SET 종류·목록 밖 종류 풀기·입출력 표 세트 키, 시험 `set-node-canvas.test.ts`), `33b305e0`(편집기·툴바·디버거 연결, 시험 `set-node-page.test.ts`·`debug-subset.test.ts` 한 줄), `5f678e29`(e2e E19·고정 데이터), `e8947b7f`(다른 세트를 열면 편집 모드여도 팝업 닫기)
- 시험 결과(1단계): `vitest run tests/dme/ruleSetEdit` → 101파일 1911 통과·0 실패(새 시험 27 = set-node-model 13 + set-calls-state 14), m-mdm `tsc --noEmit` 0, 바꾼 파일 mantine·aggrid audit 0건. `vitest run tests/dme tests/ui-meta-lock.test.ts` → 135파일 2549 통과·0 실패.
- 시험 결과(2단계): `vitest run tests/dme/ruleSetEdit tests/ui-meta-lock.test.ts` → 104파일 1940 통과·0 실패(새 시험 24 = set-node-page 13 + set-node-canvas 11, 기존 시험 기대 갱신 2파일 — 계획 조정 10). 그 뒤 하위 프레임 SET 노드 줄 한 건(계획 조정 14)을 더해 세 파일 38건 통과. `vitest run tests/dme tests/ui-meta-lock.test.ts` → 137파일 2573 통과·0 실패(팝업 닫기 fix `e8947b7f` 앞에서 돌렸고, fix 뒤 `set-node-page`·`set-tabs` 30건을 다시 돌려 통과). 디버그 입력 폼은 겉모양을 다시 받아도 이름이 같은 칸의 값을 남긴다(`fieldsOf` 가 이름으로 합친다). 새 고정 데이터는 세 e2e 스펙의 개수 단언(넓은 검색어 건수·목록 행 수)에 걸리지 않음을 grep 으로 확인했다. m-mdm `tsc --noEmit` 0, 바꾼 화면 파일 20개 mantine·aggrid audit 0건, `.css` import 0. `playwright test e2e/mdm-ruleSetEdit.spec.ts --list` → 19건(E19 포함), `mdm-ruleSetMng`·`mdm-ruleSetConfirm` `--list` 8건 그대로. 고정 데이터는 Flyway V1~V23 을 sqlite3 로 빈 DB(스크래치)에 깐 뒤 넣어 오류 없이 들어가는 것을 확인했다(서버 기동 없음).
- 1단계가 넘긴 자리(2단계에서 모두 처리했다): `FlowCanvas` 의 `edgeChips(vflow, rules)` 에 `calls`·memo 의존성, `BREAKABLE` 세 곳(FlowCanvas·debug-menu·useSimulation)에 SET, `nodes.tsx` 받는 노드 연결점·메뉴 조건(RULE·TASK)에 SET, `FlowCanvas` 이동 한계 종류 목록(RULE·TASK·IF·PARALLEL)에 SET, `flow-layout` 자동 배치(D-140)·받는 노드 자리(D-142·D-143)에서 SET 단계 확인, ui:5t 리뷰 넘김(목록 밖 저장 종류 칩 해제). `ASSIGNABLE_KINDS` 는 SET 을 빼는 것이 맞다.
- 계획 조정(본문과 다르게 한 것):
  1. **`node()` 는 그대로, setId 는 SET 노드에만** — 조정 확정(모든 노드 `setId: null` 방식 안 씀). `copyNode`(ui:9)와 같이 label 뒤에 둔다. 본문이 놓친 붙여넣기(`instantiate`)도 SET 이면 setId 를 옮긴다(안 하면 붙여 넣은 SET 이 세트를 잃는다).
  2. **`caller-links.ts` 정규식** — 본문은 `CALLER_BROKEN 세트 {P}:` 만 봤다. 서버를 읽어 보니 (a) 저장의 CALLER_BROKEN 은 거부가 아니라 WARN 사본(`callWarnings`)이라 경고 줄로 오고, 화면 경고 줄(`warnLines`)은 코드 없이 문구만이라 `세트 P: …` 꼴이다. (b) 부르는 행이 여럿이면 `세트 P v1.001: …`(`SetCallerRecheck`). 그래서 문구(거부) 쪽은 `CALLER_BROKEN 세트 P( vN.NNN)?: `·`CALLER_BROKEN 사용 중인 세트 P1, P2가 `(폐기 거부), 줄 쪽은 `^세트 P( vN.NNN)?: `·`^부르는 세트에 경고가 생겼다: P1, P2$` 를 본다. ID 는 서버 `STD_PHYS_NAME` 이 대문자로 시작하므로 `세트 호출이 순환한다`·`세트 노드 s1에` 같은 다른 경고는 걸리지 않는다(시험 고정). 이 화면에서 문구 쪽 CALLER_BROKEN 이 실제로 나는 길은 폐기 거부뿐이다(저장은 경고, 되살리기는 연쇄 재검사를 하지 않는다).
  3. **늦은 응답 판정** — 본문 `setIdRef` 비교 대신 겉모양 맵 세대(`callEpoch`, 불러오기 성공마다 1 증가)로 버린다. 같은 세트를 다시 불러와도(다시 불러오기·자기 쓰기 뒤) 떠나 있던 응답이 서버 새 값(`view.calls`)을 덮지 않는다. 불러올 때 물은 ID 집합·요청 번호 맵을 새 객체로 바꿔 옛 요청이 새 세대를 건드리지 않게 했다.
  4. **한 번 물은 ID 는 다시 묻지 않는다(빈 응답 포함)** — 본문은 받는 중인 ID 만 걸러 맵에 키가 없으면 다시 묻는다. 서버가 그 ID 를 주지 않거나(목 서버의 빈 응답 `ok({})`) 다른 ID 응답으로 맵이 바뀌면 되풀이해 묻는다. 그래서 이번 세대에 물은 ID 는 다시 묻지 않고(그 SET 노드는 CALL_MISSING 경고로 남는다), 빈 응답이면 맵을 새 객체로 바꾸지 않는다.
     - 받기에 실패하면(리뷰 2차 minor 고침 — 결정 12) 그 ID 를 물은 집합에서 풀고 `callsFailed` 에 둔다. 다시 묻는 계기는 세트 ID 목록 변경, 실행에 영향을 주는 편집(`flowVersion` — 노드·선 구조, 위치·라벨·메모만 바꾸면 아니다), 다시 불러오기·다른 탭 쓰기 알림이다. 처음 적은 「다음 흐름 변경 때」 는 효과 의존성이 `[setIdsKey, calls]` 뿐이라 실제로는 세트 ID 목록이 바뀔 때만이었다.
  5. **모르는 ID 고르기는 노드 훑기** — 본문 `flowSetIds(flow)` 는 흐름 해석(parseFlow)을 해 끌기마다 돈다. 훅은 노드를 한 번 훑어(SET·공백 아닌 setId, 중복 없음) ID 목록 글자를 효과 키로 쓴다 — 위치만 바뀌는 편집에는 효과가 다시 돌지 않는다.
  6. **`written` 반응은 훅 안에** — 본문은 편집기 효과(`flowSetIds(flowRef.current)`). 훅 옵션 `written`(탭 틀의 `RuleSetTabsApi.written`)을 받아 seq 가 바뀌면 판정한다(편집기는 넘기기만, 한 줄). 마운트 때 값은 새 알림이 아니다. 자기 세트 알림은 무시. 흐름이 부르면 이미 받았거나 받는 중이어도 다시 묻고(`refreshCalls` 와 같은 강제), 앞 요청의 응답은 그 ID 에 쓰지 않는다(ID 별 마지막 요청 번호). 흐름이 부르지 않으면 들고 있던 그 세트의 겉모양을 버린다(되돌리기로 SET 노드가 돌아오면 새로 묻게).
  7. **`checks`** — 본문의 plain `useMemo` 대신 기존 같은-참조 캐시(`checksMemo`)를 두고 비교에 `calls` 를 더했다.
  8. **`sim-dirty-subsets` 는 만들지 않는다** — ui:9 결정 4 의 `dbg-subset-unconfirmed`(C-D18 문구·조건)가 대신한다(조정 확정).
  9. **「세트 탭으로 열기」 는 보기 메뉴(`view-menu`)에 둔다** — 본문은 편집 메뉴 SET 갈래 맨 앞 `set-open` 이다. 룰 노드 `open-rule` 처럼 모든 모드에서 열려야 보기 모드에서도 하위 세트로 갈 수 있어 보기 메뉴로 옮겼다. id·testid(`flow-menu-item-set-open`)는 그대로다. 편집 메뉴 SET 갈래는 복사·복제·예외 받기 추가·삭제다. 본문에 없던 `catch-add` 는 과제(받는 노드 UI 를 SET 에도)대로 더했다. 색상은 없다(스펙 §9).
  10. **선 메뉴 「룰 세트 넣기」 는 「룰 넣기」 바로 뒤에 둔다** — 기존 `flow-menu.test.ts` 의 선 메뉴 정확 배열 4건에 `insert-set` 을 넣었다. `toolbox.test.ts` 이름표에는 「룰 세트」를 더했다(요소 여섯). 소유 시험이고 동작이 본문대로 바뀐 것이다.
  11. **SET 노드 속성 패널 testid 는 `flow-prop-set-node`** — 본문의 `flow-prop-set` 은 이미 세트 전체 패널(`SetPanel`)의 testid 다. 섹션 id 는 `call-basic`·`call-inputs`·`call-outputs`·`call-callers` 다.
     - 표 머리는 `MdmFieldLabel` 대신 글자로 둔다. `MdmFieldLabel` 을 더하면 `tests/fixtures/ui-meta-lock.json` 의 PropertyPanel 기록이 바뀌어 잠금 시험이 깨진다(시험·기록 파일은 이 레인 소유 밖).
     - 같은 까닭으로 받는 노드의 「붙은 룰/붙은 노드」 식은 기록 글자(`onTask ? …`) 그대로 두고, `onTask` 를 TASK·SET 으로 넓혔다.
  12. **`NO_RULE_LIST_KINDS` 에 `CALL` 을, `SetPanel` 에 `calls` 를 더했다** — 둘 다 본문에 없다. 없으면 SET 노드를 골라도 룰 목록 섹션이 붙는다(`ruleListMode` = insert). 또 `flowIo` 가 겉모양 없이 계산해 세트 입출력 표의 「세트 {ID}」 표시가 화면에 나오지 않는다.
  13. **CSS** — 링크 단추는 `.rsf-set-link`(묶음 `.rsf-set-links`)다. 본문의 `.rsf-link` 는 연결 손잡이 클래스(`styles/connect.ts`)와 겹친다.
     - 본문 토큰 `--color-bg-subtle` 은 없어 `--color-bg-header` 를 썼다.
     - `SET_CSS` 는 `border-width` 만 둔다. `TASK_CSS` 뒤·`CATCH_CSS` 앞에 이어 caught 점선(2px)·상태 색이 이긴다.
  14. **SetBody** — 본문 `TitleRow` 대신 같은 클래스로 직접 그린다(외관 아이콘이 없어 세트 아이콘을 고정한다). 작은 줄(`flow-set-sub-{id}`)은 다음과 같다.
     - 겉모양 있음: 「룰 세트 {ID}」
     - exists=false: 「없는 세트(확정 버전 없음)」
     - 맵에 없음: 「세트 정보를 받는 중」
     - 캔버스가 맵을 받지 않으면(디버거 하위 프레임 — `calls` 를 넘기지 않음) 받는 중 대신 「룰 세트 {ID}」 다(`FlowNodeData.callsGiven`).
  15. **팝업** — 끼울 선은 편집기 상태(`pickEdge`, undefined 가 아니면 열림)다.
     - 편집 모드를 나가거나 다른 세트를 열면 닫는다. 다시 편집 모드가 되어도 저절로 뜨지 않는다.
     - 숨은 탭에서는 그리지 않고(`EditorActiveContext`), 그 탭을 다시 고르면 다시 보인다.
     - 후보 거르기는 순수 함수 `setPickRows` 로 두고 시험했다.
     - 계획 시험의 `typeInto(…"")`+`settle` 은 [찾기] 단추로 바꿨다. `IdPicker` 는 글자를 쳐도 찾지 않는다.
  16. **편집기의 `written` 효과는 넣지 않았다** — 1단계 계획 조정 6 대로 훅이 처리한다. 넣으면 같은 요청이 두 번 나간다.
  17. **디버그 입력 폼·조사식에 `calls` 를 넣었다** — 본문에 없다. `useSimulation` 다섯째 인자와 `VariablePanel` prop `calls` 로 `flowIo` 에 겉모양을 넣는다. 없으면 SET 노드가 부르는 세트의 입력을 디버그 입력 폼에서 받을 수 없다(엔진은 부모 입력 사전 검사에 하위 입력을 넣는다, 스펙 §12).
  18. **e2e 는 E16 이 아니라 E19 다** — E16~E18 이 이미 있다(받는 노드·옛 형식·끝내는 갈래).
  19. **e2e 시나리오를 서버 사실에 맞춰 바꿨다** — 본문 E16 은 A DRAFT 에 SET 을 넣어 저장한 뒤 B DRAFT 를 저장하고, B 메시지의 CALLER_WARN 과 A 탭 검사 변화를 단언했다.
     - Java 를 읽어 보니 겉모양은 기준 시각의 RELEASED 로 계산한다(`SetCallIoReader.read`). 부르는 세트·연쇄 재검사는 부모 **RELEASED 행의 CALL_SET_IDS** 만 센다(`SetCallIoReader` Ruling 25, `RuleSetEditService.callWarnings`). 그래서 본문 순서로는 CALLER_WARN 도 A 탭 검사 변화도 생기지 않는다.
     - 스펙 §12 의 "확정된 고정 데이터" 로 바꿨다. E2S_SUBB 를 부르는 확정 부모 E2S_SUBP(SET 노드 흐름, `CALL_SET_IDS ["E2S_SUBB"]`)를 고정 데이터로 둔다.
     - (1) A(E2S_SUBA)에 SET 노드를 넣는 순간 E2S_SUBB RELEASED 겉모양으로 A 검사가 바뀐다(중복 대입 경고 1건).
     - (2) 링크로 연 B 탭에서 E2S_TAG 를 더해 저장하면 A 탭이 CALL_IO 를 다시 묻는다(쓰기 알림). 겉모양은 RELEASED 라 A 검사가 그대로인 것도 단언한다. B 메시지에는 "부르는 세트에 경고가 생겼다: E2S_SUBP" 와 링크가 온다.
     - (3) 링크로 연 E2S_SUBP 탭의 SET 노드 속성 패널에 부르는 세트로 E2S_SUBP 자신이 보인다.
     - B 를 확정까지 하는 길은 확정 화면(다른 화면 폴더)을 거쳐야 해서 쓰지 않았다.
  20. **고정 데이터는 새 문장만 더했다** — 기존 VALUES 목록과 DRAFT 문장(WHERE IN)은 그대로 둔다. 파일 끝에 룰 1(E2S_TAG)·세트 3(E2S_SUBA·E2S_SUBB·E2S_SUBP)·RELEASED 3·담당자 DRAFT 2 를 따로 넣었다.
     - 머리 주석의 룰 수(8 → 9)와 세트 목록 줄을 고쳤다.
     - `mdm-ruleSetMng.spec` 의 건수 단언(`ruleId: E2S_OLD` → 1건)은 새 세트가 E2S_OLD 를 담지 않아 그대로다. S_GRD 결과 변수 검색은 건수를 보지 않는다.
- 결정:
  1. **새 API(다음 단계가 쓴다)** — `api.callIo(setIds)`·`api.callers(setId)`, `RuleSetEditState.calls`·`refreshCalls(ids)`, 훅 옵션 `written`, `flow-edit.insertSet(f, edgeId, setId, label?)`, `flow-vars.edgeChips(f, rules, calls?)`, `caller-links.callerSetIds(text, lines?)`, `types.RuleSetCallIoResult`·`RuleSetView.calls?`·`"CALLER_WARN"`.
  2. **SET 노드 = 단계** — `isStep` 에 SET: 지우기(붙은 받는 노드 같이)·옮기기·복사·복제·붙여넣기(접두어 `s`)·돌아오는 자리 걷기가 RULE·TASK 와 같다. 룰 지정(`assignRule`)은 그대로 빈 단계·룰만. 외관(`setNodeStyle`·`setNodesColor`)은 `STYLED_KINDS`(RULE·TASK)만이라 SET 은 거부·건너뜀(스펙 §9).
  3. **겉모양 받기 실패** — 오류 창(`state.error`, 조건식 IO 실패와 같은 길). 숨은 탭이면 탭을 고를 때 뜬다(ui:7 결정 6).
  4. **캔버스에서 SET 노드는 RULE·TASK 와 같은 단계다**
     - 손댄 자리: `BREAKABLE` 세 곳(캔버스·디버그 메뉴·`useSimulation`), 선 위로 옮기기(`isMovable`), 예외 연결점(`CatchHandle`·`handlesOf` — `CATCHABLE`). 노드 크기는 이미 `NODE_SIZE.SET` = 룰이다.
     - 자동 배치(D-140)·받는 노드 자리(D-142·D-143)는 종류를 가리지 않거나 `CATCHABLE` 을 써서 고칠 것이 없었다. 같은 새 형식 흐름에서 SET 자리를 RULE 로 바꿔도 `autoLayout` 결과가 같음을 시험으로 고정했다. 옛 형식 MERGE 의 짝이 SET 이면 구조 오류라 배치가 달라지는 것은 ui:5t 규칙대로다.
     - 이동 한계(`aac858aa`, 화면 범위 translateExtent)는 종류를 보지 않는다.
  5. **링크로 열기는 `tabsApi.openSet` 한 길이다** — 노드 링크 아이콘·보기 메뉴 「세트 탭으로 열기」·속성 패널 [세트 탭으로 열기]·부르는 세트 목록·메시지 링크가 모두 이 길을 쓴다.
     - 콜백은 탭 틀의 `useCallback` 이라 참조가 안정해 캔버스 노드 memo 를 다시 돌리지 않는다(§16).
     - 겉모양 맵은 상태 참조라 바뀔 때만 새 객체다. 없으면 모듈 상수를 쓴다.
  6. **부르는 세트 목록(CALLERS)** — SET 노드 속성 패널이 세트 ID 가 바뀔 때마다 묻고, 다른 노드로 옮긴 뒤 온 응답은 버린다(`alive`, §11).
     - 실패하면 「부르는 세트를 받지 못했다」 한 줄만 보인다. 보조 정보라 오류 창을 띄우지 않는다.
     - 확정 버전 기준이라 빈 목록은 「없음(확정 버전 기준)」 이다.
  7. **받는 노드의 목록 밖 종류** — `catchKindsFor(붙은 노드 종류)` 밖인데 저장된 종류는 체크된 칸으로 보인다. 옆에 「이 노드에는 받을 수 없는 종류다. 풀어서 지운다」(`flow-prop-catch-outside-{k}`)를 단다.
     - 풀면 칸이 사라지고 다시 켤 수 없다.
     - 그 종류가 유일한 받을 종류면 풀 수 없다(`setCatchKinds` 가 빈 목록을 `CATCH_KINDS_EMPTY` 로 거부한다 — 리뷰 2차 minor 고침). 칸을 끄고 안내를 「유일한 종류라 풀 수 없다 — 받을 종류를 먼저 켜고 풀거나 [지우기]로 받는 노드를 지운다」(`CATCH_KIND_OUTSIDE_LAST`)로 바꾼다. 붙은 노드의 종류를 모두 다른 받는 노드가 받고 있으면 「[지우기]로 받는 노드를 지운다」 만 보인다. 빈 목록 거부(flow-edit)는 그대로 둔다 — 받을 종류가 없는 받는 노드는 분석기가 거부하는 모양이다.
     - 받는 노드 안내 문구는 붙은 노드가 SET 이면 하위 세트 문장, 아니면 기존 문장이다. 둘 다 CATCH_SET 을 적는다.
  8. **SET 노드 설명(`view.descs`)은 이번에 열지 않았다** — `DESC_KINDS` 에 SET 이 없다. 외관을 열지 않는 스펙 §9 와 같은 판단이고, 필요하면 후속으로 한다.
  9. **구성 지침은 SET 노드가 있는 흐름에 적용하지 않는다**(리뷰 major) — 적용은 흐름을 `linearFlow(order)`(룰 ID 만)로 통째로 바꾸므로 SET 노드가 말없이 사라지고, 저장하면 CALL_SET_IDS 가 비워진다. `guideBlockReason` 에 「룰 세트 노드가 있는 흐름에는 적용하지 않는다」 를 더했다(받는 노드 판정 뒤). 분기·빈 단계·받는 노드와 같은 불변식이다.
  10. **세트 검색 팝업의 잘림 안내**(리뷰 minor) — 서버 `search target SET` 은 거르기 전에 20건(`PICK_LIMIT`)에서 자른다. 화면이 INUSE·지금 세트가 아닌 것만 남기면 줄이 20건보다 적어 `IdPicker` 의 「20건까지」 안내가 뜨지 않는다. 그러면 21번째 뒤의 사용 중 세트가 말없이 빠진다.
     - 서버 건수가 20건에 닿았는데 거르며 줄이 빠졌으면(`pickCut`) 팝업이 칸 위에 「앞 20건에서 사용 중이 아니거나 지금 세트인 줄을 뺐다 … 더 좁혀 검색하세요」(`set-pick-modal-cut`)를 보인다. 찾기 목록이 칸 아래에 겹쳐 뜨므로 칸 위에 둔다.
     - 빠진 줄이 없으면(20건 그대로) `IdPicker` 가 스스로 안내하므로 겹쳐 알리지 않는다. 거른 뒤 0건이어도 안내가 뜬다(「찾은 세트가 없습니다」 만 보이면 오해한다).
     - `IdPicker`(`src/shell`, 다른 화면도 쓴다)의 limit 판정은 고치지 않았다. limit 를 거른 건수로 바꿔 넘기는 방법은 0건일 때 안내가 안 뜨고 숫자가 20 이 아니어서 쓰지 않았다.
     - 늦은 찾기 응답은 찾기 순번으로 버리고, 글자를 바꾸면(`IdPicker` 가 목록을 닫는다) 안내도 거둔다. 팝업 본문(`SetPickBody`)은 열 때마다 새로 그려 지난 안내가 남지 않는다.
  11. **부르는 세트(CALLERS)는 쓰기 알림마다 다시 묻는다**(리뷰 minor, 결정 6 보탬) — 속성 패널이 열린 동안 어느 탭이든 세트를 쓰면(탭 틀 `written.seq`) 다시 묻는다. 그동안은 지난 목록을 보이고, 늦은 응답은 `alive` 로 버린다.
     - 리뷰 제안은 「그 하위 세트에 쓰기 알림이 오면」 이었다. 하지만 목록은 그 세트를 부르는 **다른** 세트(부모)의 RELEASED 행·상태(`SetCallIoReader.callers`)라, 바뀌는 쪽은 부모다. 그래서 알림의 세트 ID 로 거르지 않는다.
     - 패널은 탭 틀 문맥(`RuleSetTabsContext`)에서 seq 를 읽는다 — `SidePanel`·편집기 prop 을 늘리지 않는다.
  12. **겉모양 받기 실패를 「받는 중」 과 가른다**(리뷰 2차 minor, 지적이 낸 (a)+(c)) — 상태 훅이 `callsFailed`(세트 ID 집합, 없으면 모듈 상수 — 같은 참조라 캔버스 노드 memo 를 다시 돌리지 않는다, §16)를 둔다.
     - 노드 작은 줄은 「세트 정보를 받지 못했다」(`SET_FAILED_TEXT`), 속성 패널 세트명·상태 칸은 「세트 정보를 받지 못했다 — 흐름을 고치거나 다시 불러오면 다시 묻는다」(`flow-prop-set-failed`, 경고 배지)다. CALL_MISSING 경고는 그대로 남는다(맵에 없는 ID 는 없는 세트로 검사 — Ruling 8).
     - 다시 묻기 시작하면 그 ID 를 집합에서 빼(「받는 중」), 실패하면 이 요청이 마지막으로 물은 ID 만 다시 넣는다. 다시 불러오면 비우고, 흐름에서 빠진 세트의 쓰기 알림이면 그 ID 를 뺀다.
     - 다시 묻는 효과 의존성에 `flowVersion` 을 더했다. 받는 중·받은 ID 는 `fetchCalls` 가 건너뛰므로 실패한 ID 만 다시 묻는다. 디버거 하위 프레임 캔버스에는 넘기지 않는다(`calls` 와 같이 `top` 이면 undefined).
- 남은 일(조정 세션)
  - e2e E19 실행: 새 mcm.db·mdm.db, 고정 데이터 적재, 서버 기동이 필요하다(사용자 승인 뒤).
  - 브라우저 확인: SET 노드 굵은 테두리와 칩 줄바꿈, 세트 검색 팝업 목록이 모달 안에서 잘리지 않는지(`IdPicker` 목록은 절대 위치 560px), 메시지 줄 링크 모양.
- 확인만 한 것: 확정 보고서의 CALLER_WARN·CALLER_BROKEN 항목 키 `SET:<setId>` 는 확정 화면(`ruleSetConfirm`) 몫이다. 이 화면이 받는 서버 응답(view·save·restore·delete·search)에는 그 키가 없다(Java 대조) — 이 레인은 다른 화면 폴더를 고치지 않으므로 조정 세션이 확정 화면 쪽에 넘긴다.

## 머지 3 — ui:8 + ui:9 함께(조정 지시 ui-8)
- dev `bd482996`(srv:6 A~E·srv 완료 기록)를 합쳤다(충돌 없음). srv:6 A~D(`442be439`)·E(`fc204ec6`) TS 확인은 둘 다 초록으로 보고했다.
- e2e 고정 데이터(조정 답 ui-8 조건): 기존 행 변경 없음(삭제 줄 0), 새 행은 `E2S_TAG`·`E2S_SUBA`·`E2S_SUBB`·`E2S_SUBP`(E2S_ 접두·파일 끝 자체 완결 문장), 머리 주석 세트 목록에 적음. `mdm-ruleSetMng.spec` 의 건수 단언(키워드 `E2S_`+룰 `E2S_OLD` → 1건, `NO_SUCH_SET` → 0건)은 새 세트와 겹치지 않는다(grep 확인).
- 시험: m-mdm `node scripts/test.mjs` 241파일 3758 통과·0 실패, m-mdm `tsc --noEmit` 0, `playwright test --list mdm-ruleSetEdit mdm-ruleSetMng mdm-ruleSetConfirm` 27건(E19 포함). e2e 실제 실행·브라우저 확인은 머지 뒤 조정 세션.
- 확정 보고 itemKey `SET:<setId>` 는 확정 화면(ruleSetConfirm) 몫이라 이 화면 응답에는 없다(ui:8 1단계에서 Java 대조). CALLERS 자기 행 제외는 서버가 하므로 화면 변경 없음.
