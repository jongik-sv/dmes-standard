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
- 상태: 진행 중
- 계획 조정:
  1. 세트 열기가 `open(setId, ver)` 로 바뀌었다 → 열기 요청(`OpenRequest`)에 `ver` 를 더하고 포털 파라미터의 `normVer(params.ver)` 를 넘긴다.
  2. 세트 고르기(`IdPicker`)는 위 바가 아니라 `FlowToolbar` 의 `lead` 로 들어가 있다 → 고르기는 편집기 안에 두고, 고른 세트가 다른 탭에 이미 열려 있으면 그 탭으로 옮기고 아니면 지금 탭에서 연다(같은 세트를 두 탭이 편집하지 않게). 탭 틀의 위 바는 만들지 않는다(조정 세션 승인).
  3. 편차 6 대신 탭 머리·닫기 단추·dirty 점·숨김 패널(`display:none` 마운트 유지)을 shared 새 컴포넌트 `closable-tabs` 로 등록하고 화면 `RuleSetTabs` 가 감싼다(Part B §18). 기존 shared `Tabs` 는 고치지 않는다. Part B §1 표 한 줄 추가는 조정 세션 승인.
  4. `SetVersionRow`·`useAutoSave`·`ViewportGuard` 는 훅·컴포넌트 인스턴스 상태라 편집기로 그대로 옮기면 탭마다 독립한다.
  5. 새 시험 도우미(`activateTab`·`inPanel`)는 소유 밖인 `tests/dme/helpers/rule-set-page.ts` 대신 `tests/dme/ruleSetEdit/` 아래 새 파일에 둔다.
