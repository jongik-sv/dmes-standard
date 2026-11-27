# perm-fe 정본 메모

## perm-fe-a (Mac `dmes-perm-mac`, 브랜치 `perm/perm-fe`)

### 할 일

f0a 계약 타입·가짜 자료 → f1 shared 부품 3개 → f1-merge → f2 작업대 1단계 → f4 3단계 링크 → f3 2단계 → f8 vitest → f9 렌더 점검·screens.mjs → fa-merge

### 진행

| 항목 | 상태 | 커밋 | 비고 |
|---|---|---|---|
| f0a | 끝 | c6d2fb326 | `commPermBench/types.ts`·`mock.ts`·`mock.test.ts`(4 통과). m-mcm tsc = 기존 무관 TS2307 23건만(m-mdm·m-analog dist 없음), commPermBench 오류 0 |
| f1 | 끝(리뷰 1회·지적 14건 수정) | 1712d9f50 | shared 부품 3개 + unit 시험 3파일(11 통과) + 스킬 문서 3개 + 색인. shared tsc 0, build 통과, aggrid audit 0, ui_docs coverage·check-examples 통과. 브라우저 확인 안 함(끌기·IME 런타임 미확인) |
| f1-merge | 머지 완료(11-27) | 12cd7bd23 | f0a+f1 squash 1커밋, base 1c263a0f5. shared vitest 212/3134·m-mcm vitest 95/1823 통과. 이 SHA 는 바꾸지 않는다 |
| f4·f4b | 끝(1차 머지) | fa7e04b59 squash | `nav.ts`(openLegacy·readOpenWith·useReloadOnReturn·useOpenWith)·nav.test 13. pageId = `mcm:csa/<screenId>`. 받는 쪽 3화면 훅 = 이 레인 |
| f2 | 끝(1차 머지 a2276717d) | fa7e04b59 squash | 13파일 ~2,600줄. 메뉴 칸 = AgDataGrid 가상 스크롤. phase(1·2·3)·편집 자리 no-op. bench-be ①~⑤ 반영(PERM_ERROR_CODES·DraftChange camelCase). 보고 `task-f2-report.md`(미커밋, 열린 질문 8) |
| f3 | 끝(2차 머지 요청 998f1fec7, push perm/perm-fe-5) | 998f1fec7 squash | 2단계 편집·초안 자동 저장 0.6초·막대·현재/초안·영향·되돌리기·잃는 사람·충돌·이력. BENCH_PHASE=3. USE_MOCK=true. 리뷰 14건 중 13 고침·#7 부분(NOT_FOUND 줄 강조 없음). bench-be 7·9·10·11번 반영. commPermBench 11파일/133, m-mcm 108/2013 |
| f8 | 끝(2차) | 998f1fec7 squash | 시험 3파일 58건, commPermBench 8파일/97 |
| f9 | 등록 끝(2차) | 998f1fec7 squash | screens.mjs commPermBench·commPermMng·commRoleMng·commObjMng(새 설계). 브라우저 렌더 점검 = 사용자 승인 대기(Mac 조정 통합 확인 몫) |
| f10 | 끝(3차 머지 요청, 부모 5c9075d4b) | 머지 요청 SHA | 실연결: USE_MOCK·mock 분기 삭제, `mock.ts` → 시험 고정 자료 `bench.fixture.ts`(시험만 import). isSysadmin = searchBench `data.result.me[0].ME_SYSADMIN` 만. BE 5c9075d4b 대조 차이 8건 고침(보고 `task-f10-contract-diff.md`, 미커밋). commPermBench 11/140, m-mcm 108/2020, tsc 기준선 외 0, eslint 0, audit 0 |

### 결정

- D36(win30): 목록 입력은 grids 로. saveDraft 요청 = `grids.changes.rows`(TP·KEY1·KEY2·OP·BTN_PERM·POPUP_PERM), 응답 = `grids.draft`. OASIS params 배열 금지. types.ts 에 반영함
- shared 노출(조정 답 (a)): `shared/tsup.config.ts` entry·`shared/package.json` exports·Part B §1 허용 목록 표에 새 서브패스 3개 줄만 추가함. 색인 생성용 `.claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs` 목록에도 줄만 추가함(소유 밖 — 머지 요청에 적는다). 머지 요청 「겹칠 수 있는 파일」 = 이 4파일 + `llms.txt`·`llms-full.txt`(생성기 재생성, 추가만 확인)
- 칸 폭 끌기: 시안 = 한 칸만 늘고 가로 스크롤(zero-sum 아님) → ContentBody `resizable` 재사용 불가. `resizable-columns` 새 부품, `split-sizing.ts` 의 `loadSplit`/`saveSplit` 만 import(수정 없음). 모두 처음 폭 = `ref.resetAll()`, 기본 min 150 / max 2200(시안 값)
- root `shared/src/index.ts` 는 건드리지 않음(부품은 서브패스로만 노출하는 관례)
- 가짜 API = `types.ts` 의 `PermBenchApi` 모양. 실연결 `api.ts` 도 같은 모양 → 화면은 인터페이스만 안다. `createMockPermBenchApi({ latencyMs, conflictOnNextApply })`, `forceConflictOnce()`
- 가짜 표본 사례(1단계 끝 기준): SYSADMIN(RG_ADMIN)·역할 사용 안 함(ROLE_OLD_REPORT)·그룹 사용 안 함(RG_MDM_PARTNER)·메뉴 숨김(mcm0014)·오브젝트 사용 안 함(냉연 마지막 화면)·오브젝트에 없는 값(ROLE_QC_MANAGER 품질 보고 approve)·여러 그룹 같은 역할(ROLE_VIEWER, 품질팀 6명 RG_LEGACY). 메뉴 ID = 모듈 `mpp`, 폴더 `mpp-1`, 화면 `MN_<OBJECT_ID>`
- `m-mcm/lib/generated/page-registry.ts`(금지 경로, 생성물) = 커밋하지 않고 머지 요청에 적는다
- f4 조사 결과: 기존 화면 이동 = `window.dispatchEvent(new CustomEvent("portal-open-tab", { detail: { pageId } }))`(shared `widget/frame-context.ts` `openPortalPage`, `m-mcm/page-components/home/types.ts`). pageId 만 넘기고 항목 ID 넘기는 기존 규칙은 없음 → 보내는 쪽 계약(예: sessionStorage `dmes:open-with:<pageId>` 에 ID)을 commPermBench 에 두고, 받는 쪽(commMenuMng 등 금지 파일)은 조정에 요청. 돌아오면 다시 읽기 = `portal-tab-activated` 이벤트 `detail.tabId` 를 `TabPageContext.tabId` 와 비교(선례 `m-mdm/pages/dma/erdEdit/state/useErdStream.ts:198`)
- 실API 모양: `createJsonApiClient` 로 POST `/api/mcm/oasis/commPermBench/{action}`, body `{ meta, params, grids }`, 응답 envelope 풀기 = `commRoleGrpMng/api.ts` `unwrapPayload` 패턴(meta.success=false 면 throw)

- f3 규칙(Mac 결정 11-27): 퍼미션 줄에 오브젝트 밖 값(예 print)이 남으면 고친 줄만 초안·저장 때 밖 값을 빼고 보낸다. 그 줄에 「오브젝트에 없는 값 <코드> 는 저장 때 빠진다」 한 줄 표시. 근거 D15(저장 = ⊆ 검사, 서버 엄격). commPermMng 도 같음
- f4b(결정 15): commUserMng·commRoleGrpMng·commMenuMng 받는 쪽 훅 = 이 레인(훅 줄 추가만). `useOpenWith` 는 nav.ts. commRoleMng = perm-fe-b, commObjMng = perm-legacy-be. 계약 = `/Users/jji/.coord/perm-bench-mac/contracts/open-with.md`
- 결정(11-27): api.ts 는 shared json-api-client 대신 같은 헤더·credentials 의 얇은 fetch 래퍼(client 가 non-2xx 때 meta.message 를 버림 — 다음 회차 후보). SYSADMIN = searchBench data.result.me[0].ME_SYSADMIN(실연결 때), 그전 상수 false. apply 캐시 무효화 = BE b4 몫. 작업대 머지 2회 분할(조정 승인)

- f10 실응답 대조(BE 5c9075d4b): 그리드 하나 action = 맨 위 `grids.<칸>.rows`(data.grids 아님), 여러 칸 = `data.result.<칸>` 줄 배열. 실패 = HTTP 200 + meta.success=false "CODE: 상세". PERM_CONFLICT 범위 = 상세 「group:G,role:R,user:U」(따로 칸 없음) → scopes 접두째, scopeNames 가 종류별로 찾음. 이력 기간 = 양 끝 포함 366일(BE between+1). U_AT = 「yyyy-MM-dd HH:mm:ss」. 새 코드 VALIDATION_ERROR·PERM_REQUIRED·PERM_BAD_SOURCE·PERM_NOT_READY·PERM_DRAFT_NOT_READY. PERM_NEED_CONFIRM 상세 = 잃는 사람 수 → 「잃는 사람 N명」. SORT_SEQ = 글, explain ROLES·GROUPS = null 가능, impact GAINED·LOST 없으면 ""
- contracts/bench-be.md 와 BE 다른 곳(조정에 보고): 4(data.grids → 맨 위 grids), 7(HTTP 400 → 200), 9(양 끝 포함), 5(U_AT 형식), 2(퍼미션 없는 오브젝트 줄 = menuFolderId 줄 때만), 11(USE_TP=N 폴더·화면 = VISIBLE=N·MENU_HIDDEN 누락), 12(쓰기 단계 충돌도 범위 옴)

### 남은 일(순서)

1. f10(3차) 머지 완료 알림 대기. 요청 뒤 그 SHA 는 바꾸지 않는다
2. 열린 것(bench-be 에 전함): 이력 366일 경계 셈, 탭 닫기 직전 0.6초 편집 keepalive(후속 후보). 브라우저 렌더 점검 = 사용자 승인 뒤 Mac 조정 통합 확인 몫. 재개 자료 = 워크트리 task-f2/f3/f4/f8-*.md(미커밋 보고)

## perm-fe-b (Mac, 브랜치 perm/perm-fe-b, 워크트리 dmes-perm-fe-b)

- 착수 지시: `~/.coord/perm-bench-mac/lanes/perm-fe-b/brief.md`(지시 perm-fe-b-1). 공통 = `~/.coord/perm-bench-mac/lanes/common.md`
- 몫: f0b 옛 화면 계약 타입·가짜 자료 → f5 commPermMng · f6 commRoleMng 새 설계 → 머지(두 화면 한 번, 실연결 포함) → f7 「작업대에서 열기」(작업대 머지 뒤 다음 머지 몫)
- 갱신: 2026-11-27 머지 2 완료(e3d5cf33c). 작업대 머지(aec22600c) 뒤 f7 머지 요청 3

### 진행

| 항목 | 상태 | 커밋 | 비고 |
|---|---|---|---|
| f0b | 끝 | d02b2254f 안 | types.ts 2개 + 가짜 자료(실연결 때 삭제) |
| f5 | 끝 | d02b2254f 안 | 리뷰 12건 → 11 고침, 1 건너뜀(새 창으로 분리 때 저장 안 한 값 사라짐 = 후속 후보) |
| f6 | 끝 | d02b2254f 안 | 리뷰 14건 → 12 고침, 2 건너뜀(밖 값 안내 = 조정 결정대로 유지, 공용 확인 상자 = 새 shared 부품이라 메모만) |
| 머지 요청 1 | 보류 | d02b2254f | origin/claude/perm-bench d06ddda7c 위 squash 1커밋. 조정 접수, BE l1·l2 머지 뒤 push |
| 실연결 | 끝(커밋만) | 9866a76d1 | d02b2254f 위 새 커밋. USE_MOCK·mock 분기 11곳·mock.ts 2개 삭제. vitest csa 295/0, tsc 기준선 외 0, eslint 0 |
| bk-l1 대조 | 끝 | - | 메모 §3·실제 BE 코드와 칸·키·action 전부 일치. 차이 = searchFolderObj 응답에 MENU_FOLDER_ID 없음(조정이 l2 에 한 줄 요청) |
| 머지 2 | 완료 | e3d5cf33c | 91535e95b 합침 뒤 mcm test 1872/0, tsc 기준선 외 0, audit 0 |
| f7 | 끝 | 머지 요청 3 | aec22600c 위 74811d100 cherry-pick + 작업대 열기를 nav.ts `openBench` 로 바꿈(bench-link.ts 삭제). mcm test·tsc·audit 통과 |

### 결정

- 저장 목록 = `grids.perms.rows`(D36). 줄 = ROLE_ID·OBJECT_ID·BTN_PERM·POPUP_PERM·DATA_PERM·OP_TP(MERGE|DEL)
- commPermMng action = 기존 `search`·`save` + 새 `lov`·`searchPermOne`. commRoleMng = 기존 `lov`·`search`·`save`·`searchCmRoleMap`·`saveCmRoleMap` + 새 `searchRoleGroups`·`searchFolderObj`
- D15 식(조정 확정): 바뀐 줄 저장 때 BTN_PERM ∖ OBJ_BTN_PERM, POPUP_PERM ∖ OBJ_POPUP_PERM 을 뺀다. 안 바뀐 줄은 보내지 않는다. 서버 ⊆ 검사는 엄격. 밖 값이 있는 줄에 「오브젝트에 없는 값 … 는 저장 때 빠진다」 한 줄. 두 화면 시험 있음(팝업만 고친 줄 포함)
- 거절 = 메시지 "CODE: 상세". 코드가 meta.code·errors[].code 에만 오면 앞에 붙인다. PERM_NOT_IN_OBJ·PERM_EMPTY_BTN 만 쉬운 말, 나머지 코드는 메시지 그대로
- searchFolderObj 폴더 = MENU_FOLDER_ID 있으면 그것, 없으면 MENU_PATH 로 lov menus 에서 찾기
- 칩 = shared ToggleChipGroup·TokenChipInput(f1, 12cd7bd23). 줄 그음·찾기 강조 = 화면 안 얇은 래퍼
- 머지 단위(조정 승인) = commPermMng+commRoleMng 한 번, BE l1·l2 머지 뒤. 실연결을 같은 squash 에 넣는다. f7 은 다음 머지
- 브라우저 확인 = Mac 조정 통합 확인 몫(레인은 서버를 띄우지 않음). 머지 요청 「시험」 칸에 적는다
- ui-meta-lock.json = 내 4개 파일 항목만 다시 씀. m-mdm 항목 3개 기존 어긋남(시험 1 실패)은 고치지 않음 — Mac 이 win30 에 보고
- screens.mjs 등록 = perm-fe-a 에 넘김(조정)

### 다음 단계(재개용)

1. 머지 요청 3(f7) 의 `머지 완료` 대기. 그 뒤 남은 일 = 후속 후보 2개(조정 판단)
2. f7 내용: commRoleMng = `useOpenWith("commRoleMng")` 받기(순수 판정 `openWithStep`, role-perm.ts·시험 2), ready = `(searched || restored) && !isSearching`. 두 화면 「권한 작업대에서 보기」 = nav.ts `openBench(from, roleId, objectId?)`. commPermMng 받는 쪽 없음(작업대가 보내지 않음, 조정 확인)

### 후속 후보

- commPermMng 새 창으로 분리 때 저장 안 한 퍼미션 값 넘기기
- commRoleMng 진입 호출 4건(기준 3) — BE 가 searchCmRoleMap 응답에 그룹을 실으면 3건
