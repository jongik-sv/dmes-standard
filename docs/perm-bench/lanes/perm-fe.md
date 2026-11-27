# perm-fe 정본 메모

## perm-fe-a (Mac `dmes-perm-mac`, 브랜치 `perm/perm-fe`)

### 할 일

f0a 계약 타입·가짜 자료 → f1 shared 부품 3개 → f1-merge → f2 작업대 1단계 → f4 3단계 링크 → f3 2단계 → f8 vitest → f9 렌더 점검·screens.mjs → fa-merge

### 진행

| 항목 | 상태 | 커밋 | 비고 |
|---|---|---|---|
| f0a | 끝 | c6d2fb326 | `commPermBench/types.ts`·`mock.ts`·`mock.test.ts`(4 통과). m-mcm tsc = 기존 무관 TS2307 23건만(m-mdm·m-analog dist 없음), commPermBench 오류 0 |
| f1 | 끝(리뷰 1회·지적 14건 수정) | 1712d9f50 | shared 부품 3개 + unit 시험 3파일(11 통과) + 스킬 문서 3개 + 색인. shared tsc 0, build 통과, aggrid audit 0, ui_docs coverage·check-examples 통과. 브라우저 확인 안 함(끌기·IME 런타임 미확인) |
| f1-merge | 다음 | - | f0a+f1 squash 1커밋. 통합 tip = 1c263a0f5(c0+c1) 위로 fetch·squash·rebase |
| f2 | 대기 | - | f1-merge 요청 뒤 시작 |

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

### 남은 일(순서)

1. f1-merge: `git fetch origin` → `origin/claude/perm-bench`(1c263a0f5) 합치기·tsc·shared 시험 → `node .claude/skills/_shared/node/squash-branch.mjs --onto origin/claude/perm-bench --subject "feat(perm-fe): 작업대 계약 타입·shared 부품 3개를 둔다" --rebase` → 머지 요청(SHA·겹칠 파일·시험·렌더 점검=shared 부품 audit 0)
2. f2(opus/high agent): 시안 mock-v16.html 렌더 함수 colPeople 1263·colGroups 1273·colRoles 1284·colRoleAll 1295·colMenu 1329·colPerm 1368·rolePick 1394·openRoles 1406·btnWhy 1440·rightPreview 1461·render 1545, CSS 1~494. 파일 나눔 = page.tsx·api.ts(실연결, PermBenchApi)·상태 훅·칸 부품(사람·그룹·역할·메뉴)·미리보기(사람/역할 기준)·퍼미션 칸. 지금은 mock 사용 상수로 전환. 렌더 규칙 = `.claude/skills/dflow-dev/references/e2e.md` 「화면 렌더 최적화」. f3 가 편집을 붙이기 쉽게 단계 표시(1·2·3) 구조
3. f4 → f3 → f8 → f9(screens.mjs 등록: commPermBench·commPermMng·commRoleMng·commObjMng) → fa-merge. 실연결 = Mac 조정이 b1·b5 머지를 알린 뒤
