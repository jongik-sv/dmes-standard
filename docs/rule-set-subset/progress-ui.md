# ui 진행 기록

조정 세션: dmes-standard-90 / 회차 rule-set-subset-call-2026-10-06 / 브랜치 `feat/rule-set-subset-ui` / 워크트리 `/Users/jji/project/dmes-standard-wt/rssc-ui`

## 기준선
- 착수 커밋: dev `c12e99a4`(plan:0 포함)를 합친 상태
- 시험: `node scripts/test.mjs`(m-mdm, workers 2) — Test Files 232 · Tests 3603 (passed 3602 · failed 1). 실패 1건은 `tests/ui-meta-lock.test.ts`「화면 소스의 컬럼 사전 연결 고정 > 기록과 같다」(m-mcm `commWidgetMng` 위젯 화면의 잠금 기록 차이, 이 레인과 무관, 조정 세션에 보고)
- lint(`tsc --noEmit`): 0
- 의존성: 워크트리에 node_modules 가 없어 `deps.sh` 로 워크트리 안에만 새로 설치(심링크 아님), 형제 패키지 `pnpm --filter "@dk-oasis/m-mdm^..." build` 통과
- Mantine 9.6.0 `Tabs`: `keepMounted?: boolean`, `keepMountedMode?: 'activity' | 'display-none'`(기본 `'activity'`) — 계획 Task 7 Step 1 과 같다. 기본 `'activity'` 는 숨은 패널의 효과를 내리므로 쓰지 않는다

## 남은 순서
ui:7 → (eng:1·srv:5 머지 뒤) ui:5t → (srv:6 머지 뒤) ui:8 → ui:9

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
- 커밋: `6d4f04ca`(흐름 해석 — `flow-model.ts`·`flow-edit.ts` addCatch 종류·`PropertyPanel.tsx` 받을 예외 목록·`trace-view.ts`, 시험 `flow-model.test.ts`·`catch-edit.test.ts`·`catch-panel.test.ts`), `7aff5fed`(분석기 — `set-model.ts`·`types.ts`, 시험 `set-model.test.ts`·`rule-set-corpus.test.ts`)
- 시험 결과(m-mdm, workers 2):
  - 착수 때 `vitest run tests/dme/ruleSetEdit/rule-set-corpus.test.ts` → 하위 세트 사례 18건 실패(SET 사례 17 + h2 문구 1).
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
  5. **`trace-view.catchValues` 는 넷 그대로** — `NodeTrace` 에 CATCH_SET 값을 읽을 칸이 없다. CATCH 노드 기록의 CATCH_SET 표시·값 흐름은 엔진 실행(eng:4)과 디버거(ui:9, Task 9 의 `frames`·`chipOf`·`valueTable` SET 갈래)에서 정한다. `frames`·`valueTable` 의 SET `outputs` 반영도 Task 9 몫이라 하지 않았다.
  6. 속성 패널 안내 문구("CATCH_KIND·CATCH_RULE·CATCH_CODE·CATCH_MSG 를 읽을 수 있다")·"붙은 룰" 라벨·SET 노드 그리기·속성 패널·flow-edit SET 붙여넣기(`isStep`·`NODE_PREFIX`)는 화면 표시라 ui:8 에 남긴다.
  7. `tests/helpers/engine-paths.ts` 는 고치지 않았다(코퍼스 경로가 이미 있다).
- 넘긴 일: srv:6 묶음 A 코퍼스 사례(setId "" + 받는 노드, PARALLEL 형제 SET, SET 낀 CYCLE)가 머지되면 TS 러너를 다시 돌린다(조정 ui-4).
