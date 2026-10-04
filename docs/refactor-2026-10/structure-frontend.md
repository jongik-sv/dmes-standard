# 프론트 레인 구조 변경 기록

레인은 프론트(`src/frontend`), 브랜치는 `refactor/frontend`, 기준 태그는 `refactor-2026-10-base`(b557ccbd), 분기점은 af572b93 이다.
이 문서는 README.md §6.1 형식에 따라, 이 레인이 머지한 구조 변경(S)과 구조 변경이 아닌 항목(P)을 기록한다. 성능 수치는 `perf-frontend.md` 에 둔다.

## S1. portal-shell 거대 컴포넌트를 훅 4개로 나눔
- 커밋: 특성 시험 bb6124d2·ef7df8e2, 구현 c07e63ca, 머지 6aee0212
- 바뀌기 전: `shared/src/portal-shell/portal-shell.tsx` 한 파일(1218줄)에 탭 복원·저장, 전체 화면, 인증 사용자 조회, 즐겨찾기 처리가 모두 들어 있었다.
- 바뀐 뒤: portal-shell.tsx(681줄)가 아래 훅 4개를 호출한다.
  - `use-portal-tabs.ts`: 탭 상태와 복원·저장·제목 동기화·기본 화면·빈 목록 대체 effect
  - `use-portal-fullscreen.ts`: 전체 화면 진입·종료·Esc
  - `use-portal-auth-user.ts`: `/api/auth/me` 조회와 props 우선 규칙
  - `use-portal-shell-favorites.ts`: 즐겨찾기 해제·추가·폴더 처리와 탭 표시
- 바꾼 이유: 한 컴포넌트에 상태와 effect 19개가 섞여 있어 고치기 어렵고, effect 선언 순서에 기대는 동작이 문서와 시험 어디에도 고정돼 있지 않았다.
- 동작 보존 근거:
  - portal-shell-characterization 18건. 분리 전 코드에서 먼저 통과시킨 뒤 분리했다. 뮤테이션 확인에서 복원 순서를 바꾸면 해당 시험이 실패했다(r5 지도 §4). 예를 들어 저장 effect 를 복원 effect 앞으로 옮기면 `storageKey 가 바뀌면…` 1건, 제목 동기화를 복원 앞으로 옮기면 4건(ef7df8e2 뒤 5건), 기본 화면을 복원 앞으로 옮기면 ef7df8e2 에서 더한 1건이 실패한다.
  - 관련 portal-shell 시험 13파일 107건 통과
  - shared 전체 1403건 통과
- effect 순서. 탭 묶음 안의 순서(E8 → E9 → E10 → E11 → E12 → E13 → E14 → E15 → E19)와 각 effect 의 의존성 배열은 원본과 같다. 아래 순서는 c07e63ca 의 `portal-shell.tsx` 와 `use-portal-*.ts` 를 직접 읽어 확인했다.

| 구분 | 순서 |
|---|---|
| 원래 | E1 → H2 → E2 → E3 → H3 → E4 → E5 → E6 → E7 → E8 → … → E15 → E16 → E17 → E18 → E19 |
| 지금 | E1 → E7 → [H1 layout] E6 → E8 → E9 → E10 → E11 → E12 → E13 → E14 → E15 → E19 → H2 → E2 → E3 → H3 → E4 → E5 → E16 → E17 → E18 |

  E1 은 인증 사용자, E2~E4 와 H2·H3 은 전체 화면, E5 는 F3 단축키, E6 은 portal-open-tab 이벤트 등록, E7 은 최근 메뉴 저장, E8~E15 는 탭 복원부터 활성화 이벤트까지, E16~E18 은 화면 사용 추적, E19 는 탭 저장이다. H1 은 탭 기록의 layout effect 로, 모든 일반 effect 보다 먼저 돈다.

  위치가 바뀐 세 가지와 결과가 같은 이유는 다음과 같다.
  - (a) E7(최근 메뉴 저장)이 E6(portal-open-tab 등록)보다 먼저 돌지만 둘이 같이 쓰는 상태가 없다.
  - (b) 전체 화면 effect(H2·E2·E3·H3·E4)와 F3(E5)가 탭 묶음 뒤로 갔지만 이들은 isTabFullscreen 과 슬라이딩 메뉴 상태만 건드린다.
  - (c) E19(저장)가 E16~E18(화면 사용) 앞으로 갔지만 E16~E18 은 ref 와 추적기만 읽고 저장소를 건드리지 않는다.
- 영향 범위: 공개 export 는 그대로다. 훅 4개는 `portal-shell` 폴더 안에서만 쓰고 shared 루트에서 내보내지 않는다. 호출부·설정 변경 없음.
- 되돌리는 방법: c07e63ca 를 revert 한다. 특성 시험(bb6124d2·ef7df8e2)은 그대로 둬도 통과한다.

## S2. m-mdm 타입 선언 생성을 tsup dts 에서 tsc 로 전환
- 커밋: e8cd73b3, ccbcfa10, 머지 4f335f12
- 바뀌기 전: tsup 의 dts 옵션이 타입 선언을 번들로 만들었다. `package.json` exports 는 `./pages/*` 와일드카드였다.
- 바뀐 뒤: `tsconfig.build.json`(`emitDeclarationOnly`)으로 `tsc` 가 `dist/types/` 아래에 파일별 선언을 만든다. exports 는 화면별 명시 항목으로 바뀌었다. 빌드 순서는 tsup(JS) 뒤 tsc(선언)이며 `scripts/lib-dev.mjs` 가 돌린다(shared 와 같은 방식).
- 바꾼 이유: shared 에 같은 방식을 먼저 적용한 커밋 0abcbb46 의 메시지에 따르면 타입 정보 생성 단계가 메모리를 너무 많이 써서 빌드가 멈추던 문제를 고친 것이다. `src/frontend/scripts/lib-dev.mjs` 머리 주석에는 2026-10-02 실측으로 tsup 의 rollup-plugin-dts 가 RSS 3.1~3.5GB, 12~13초에 4GB 힙에서 OOM 이 났고 tsc 는 RSS 약 650MB, 1.9초라고 적혀 있다. 효과는 `perf-frontend.md` P2 에서 잰다.
- 동작 보존 근거:
  - 진입점 21개의 export 이름을 전환 전후로 비교해 차이 0건
  - m-mcm 의 tsc 통과
  - `tests/package-exports.test.ts`: tsup 진입점이 package.json exports 에서 빠지면 실패한다.
- 영향 범위: 새 화면을 추가할 때 tsup entry 와 package.json exports 두 곳에 모두 넣어야 한다. 이 규칙은 FE Local-Rules 에 갱신했다. 표준 문서 01·03·04 와 배포 가이드에는 2차 머지에서 같은 규칙을 적었다(`docs(guide)` 커밋).
- 되돌리는 방법: e8cd73b3·ccbcfa10 을 revert 한다. 그 사이 새 화면 진입점을 추가했다면 와일드카드 exports 로 돌아가므로 진입점 목록을 확인한다.

## S3. shared 루트 index 를 이름 나열 export 로 바꾸고 deprecated 표시
- 커밋: b35518a6, f8441edc, 95bac294, a521f0f6, 머지 924a7337
- 바뀌기 전: `shared/src/index.ts` 가 `export *` 5줄이었다. `/lib`·`/utils` 의 미사용 export 에는 표시가 없었다.
- 바뀐 뒤: 루트 index 가 이름 나열 export 126개이고 각각 `@deprecated` 를 단다. 이로써 deprecated 진입점이 지금의 이름 집합으로 고정된다. `/lib` 155개와 `/utils` 의 미사용 export 에도 `@deprecated` 와 대신 쓸 경로를 적었다.
- 정책(lane-decisions 「7번 정책」):
  - `/lib` 의 항목은 대신 쓸 `/utils` 정식 이름을 백틱으로 적는다.
  - 대체 대상이 되는 항목과 살아 있는 API 가 쓰는 심볼에는 표시하지 않는다.
  - `gfn_` 별칭은 정식 이름을 가리킨다.
  - 그 밖의 미사용 항목은 「사용처 없음.」으로 적고 archive 약속 문구는 쓰지 않는다.
  - 예외: 정식 이름도 미사용인 `gfn_postJson`·`gfn_getTextSize` 는 「저장소 안 사용처 없음.」으로 적는다(a521f0f6).
  - 새 이름마다 깨지는 시험은 만들지 않는다.
- 바꾼 이유: 사용처가 없는 공개 이름을 눈에 띄게 하고, 이후 루트에 이름이 말없이 늘지 않게 하려는 것이다.
- 동작 보존 근거:
  - JSDoc 외 코드 변화 0건(주석을 제거한 뒤 printer 출력 비교)
  - 루트 이름 집합 126/126, 심볼 동일(TS checker)
- 머지 전 확인(2026-10-04 완료):
  - 기준 태그 refactor-2026-10-base 와 브랜치의 루트 dist `Object.keys` 이름 집합이 같다(기준 80개, 브랜치 80개, 빠진 것 0, 더한 것 0).
  - 기준 루트의 타입 전용 이름 46개를 모두 import 하는 임시 파일(커밋 안 함)이 브랜치 shared 기준 tsc 를 통과했다(종료 코드 0, 오류 0).
- 영향 범위: 런타임 변화 없음. 에디터와 lint 에서 취소선과 deprecated 경고가 새로 보인다.
- 되돌리는 방법: 네 커밋을 revert 한다. 루트 index 를 `export *` 로 되돌리면 이름 집합이 고정되지 않는다.

## S4. shared ErrorModal 본문이 메시지의 줄바꿈을 줄로 나눠 보임
- 커밋: ab0d5d5d, 4946711f, 45688c2a(문서), b123a551(llms-full 동기화), 머지 5700f860
- 바뀌기 전: ErrorModal 본문이 `\n` 을 공백처럼 이어 붙여 한 줄로 보였다.
- 바뀐 뒤: 본문에 `white-space: pre-line` 을 적용해 `\n` 마다 줄이 나뉜다. 포털이 실제로 싣는 `m-mcm/app/page-layout.css` 사본에도 같은 규칙을 넣었다(4946711f).
- 바꾼 이유: 오류 상세를 `\n- 항목: 메시지` 로 이어 붙이는 문구가 있어 읽기 어려웠다. 추가 A(오류 문구 통일)의 전제이기도 하다. 모습 변경은 사용자가 승인했다.
- 동작 보존 근거: 동작 변화 없이 표시만 바뀐다. `\n` 이 없는 문구는 그대로다. 여러 줄 표시는 화면에서 확인했다.
- 영향 범위: 표시가 바뀌는 곳(ErrorModal 경유)은 네 곳이다.
  1. unitMng `api.ts:45` → `page.tsx:300`
  2. termMng `api.ts:50` → `page.tsx:416`
  3. m-mcm commSyncMng `page.tsx:168` → `:302`
  4. `m-mdm/src/dme/oasis-call.ts:67`: `errors[]` 상세가 올 때. ruleEdit 등 같은 공통본을 쓰는 ErrorModal 화면이 해당한다.
  - noticeMgmt 는 ErrorModal 이 아니라 MessageModal 경유(이미 pre-line)라 바뀌지 않는다.
  - 서버 예외 메시지에 `\n` 을 넣은 곳은 없다.
- 되돌리는 방법: ab0d5d5d 와 4946711f 를 revert 한다. 문서 커밋(45688c2a·b123a551)은 함께 되돌리거나 문구를 고친다.

## P로 적는 항목 (구조 변경 아님)
- MessageProvider context 값 고정(46b21c9b·e0f3fa54): 구조는 그대로이고 렌더 횟수만 줄인다. `perf-frontend.md` P1 에 적는다.

## S5. OASIS 호출 계층을 @dk-oasis/shared/http 로 모음
- 커밋: 계약 4ba726ca, 특성 시험 9fc315e4(m-mdm)·b9ada77f(m-mls), 이전 2ba3f9f4(m-mdm)·02e22365(m-mls), 머지 edc60561(S6·S7 과 함께)
- 분류: 리팩토링. 사용자에게 보이는 문구는 바뀌지 않는다(문구 변경은 S7 에서 따로 한다).
- 바뀌기 전: 요청 조립, 응답 봉투 해제, `meta.success=false` 거부 판정을 화면마다 복사해 갖고 있었다. m-mdm 화면 `api.ts` 15개, 공통본 `m-mdm/src/dme/oasis-call.ts`, m-mls `noticeMgmt/api.ts` 가 각자 `fetch` 결과를 풀고 오류를 만들었다. 복사본끼리 null 제거 범위, 응답 펼치기, 오류 문구가 조금씩 달랐다.
- 바뀐 뒤:
  - `@dk-oasis/shared/http` 가 `callOasisAt`, `unwrapOasis`, `omitParams`, `OasisCallError`, `isOasisCallError` 와 타입을 내보낸다(`shared/src/http/oasis-call.ts`, 기존 export 는 그대로이고 추가만 했다).
  - `callOasisAt(basePath, serviceId, action, params, grids?, options?)` 는 `POST ${basePath}/${serviceId}/${action}`, 본문 `{ meta:{menuId}, params, grids? }` 를 만든다. `basePath` 는 필수이고 기본값이 없다. 이 계약은 다른 모듈의 경로를 스스로 조립하지 않는다.
  - `OasisCallError` 는 `/http` 진입점에만 둔다. shared 는 tsup `splitting:false` 라서 다른 진입점이 이 파일을 가져가면 클래스 사본이 둘이 되어 `instanceof` 가 깨진다. 그래서 shared 의 다른 모듈은 이 파일을 import 하지 않고, 판정에는 `isOasisCallError` 를 쓴다(전역 심볼 표시). 이 조건은 번들 시험이 지킨다.
  - `m-mdm/src/oasis-screen.ts` 가 `MDM_OASIS_BASE`(`/api/mdm/oasis`)와 `plainError`(기존처럼 code 없는 일반 `Error`)를 둔다. 시험이 `@/dme/oasis-call` 을 통째로 mock 하는 경우에도 이 값이 사라지지 않게 별도 파일에 뒀다.
  - `m-mdm/src/dme/oasis-call.ts` 는 얇은 층이 된다. 호출은 `callOasisAt` 에 맡기고, MDM 업무 코드 판정(`isRowVersionConflict` MDM001, `isDraftGone` MDM002·003)과 `writeFailure`, `CONFLICT_MESSAGE`, `omitNullish` 만 남는다.
  - m-mdm `api.ts` 15개와 m-mls `noticeMgmt` 는 화면마다 옵션 조합만 다르게 줘서 지금까지의 동작을 그대로 재현한다.
- 화면별 옵션(이전 시점 2ba3f9f4·02e22365 기준. `details` 는 S7 에서 바뀐다):

| 화면 | merge | details | omit | 그 밖 |
|---|---|---|---|---|
| dme/oasis-call.ts (공통본) | data+result | 기본(append-dedup) | nullish | OasisCallError |
| dme/ruleConfirm | result | none | nullish | |
| dmb/layoutMng | data+result | none | nullish+blank | grids |
| dmb/headerMng | data+result | none | nullish+blank | grids |
| dmb/layoutConfirm | result | none | nullish | |
| dmc/codeItemEdit | result | none | nullish | grids |
| dmc/codeItemEdit/cate | result | none | nullish | grids |
| dmc/codeMng | data+result | none | nullish | |
| dmc/codeConfirm | result | none | nullish | |
| dmd/dataMng | result | none | nullish+empty | |
| dmd/dataItemMng | result | none | nullish+empty | |
| dmd/dataItemMng/cate | result | none | nullish | grids |
| dma/columnMng | result | none | nullish | grids |
| dma/unitMng | data+result | append | nullish | |
| dma/termMng | data+result | append | nullish | signal 전달 |
| dma/domainMng | data+result | none | nullish+blank | grids |
| m-mls noticeMgmt | data+result, includeGrids | append | 걸러내지 않음 | 로컬 `post()` 가 `apiRequest` 로 보내고 응답만 `unwrapOasis`. isUserSentence·`NoticeApiError` 팩토리 |

  - `details: none` 은 기존에 `meta.message` 만 쓰던 화면, `append` 는 기존에 errors[] 를 그대로 붙이던 화면(unitMng·termMng·noticeMgmt)이다. 공통본은 기존에 base 와 같은 상세를 빼던 동작이라 기본값이 됐다.
- 화면별 최종 URL 전후 대조(17곳). 전환 뒤에도 모든 URL 이 같고, 모두 `callOasisAt` 가 `${basePath}/${serviceId}/${action}` 으로 붙인다. menuId 는 m-mdm 은 serviceId, m-mls 는 화면 ID 다.

| 파일 | 최종 URL 형식 | menuId | 확인한 시험 |
|---|---|---|---|
| m-mdm/src/dme/oasis-call.ts | /api/mdm/oasis/{serviceId}/{action} | serviceId | dme/oasis-call.test.ts (ruleEdit/view) |
| dme/ruleConfirm | /api/mdm/oasis/ruleConfirm/{action} | ruleConfirm | ruleConfirm/api.test.ts (search) |
| dmb/layoutMng | /api/mdm/oasis/layoutMng/{action} | layoutMng | layoutMng/api.test.ts (view, search, save, validate, execute, export, copy) |
| dmb/headerMng | /api/mdm/oasis/headerMng/{action} | headerMng | headerMng/api.test.ts (view, search, save) |
| dmb/layoutConfirm | /api/mdm/oasis/layoutConfirm/{action} | layoutConfirm | layoutConfirm/api.test.ts (search) |
| dmc/codeItemEdit | /api/mdm/oasis/codeItemEdit/{action} | codeItemEdit | codeItemEdit/api.test.ts (search, save) |
| dmc/codeItemEdit/cate | /api/mdm/oasis/codeCateEdit/{action} | codeCateEdit | cate/api.test.ts (view) |
| dmc/codeMng | /api/mdm/oasis/{serviceId}/{action} | serviceId | codeMng/api.test.ts (codeMng/search, codeEdit/view) |
| dmc/codeConfirm | /api/mdm/oasis/codeConfirm/{action} | codeConfirm | codeConfirm/api.test.ts (search) |
| dmd/dataMng | /api/mdm/oasis/dataMng/{action} | dataMng | dataMng/api.test.ts (search) |
| dmd/dataItemMng | /api/mdm/oasis/{serviceId}/{action} | serviceId | data-item-api.test.ts (dataItemMng/view, dataItemHistory/search) |
| dmd/dataItemMng/cate | /api/mdm/oasis/dataCateEdit/{action} | dataCateEdit | cate/api.test.ts (search, reg, save) |
| dma/columnMng | /api/mdm/oasis/{serviceId}/{action} | serviceId | columnMng/api.test.ts (columnMng/view·save·compare, ruleEdit/search, termMng/save) |
| dma/unitMng | /api/mdm/oasis/unitMng/{action} | unitMng | unitMng/api.test.ts (search, save) |
| dma/termMng | /api/mdm/oasis/termMng/{action} | termMng | termMng/api.test.ts (search, save, compare, AbortSignal 전달) |
| dma/domainMng | /api/mdm/oasis/domainMng/{action} | domainMng | domainMng/api.test.ts (view, search, validate) |
| m-mls lsh/noticeMgmt (공지) | /api/mls/oasis/noticeMgmt/{action} | noticeMgmt | notice-api.test.ts (search, changeStatus) |
| m-mls lsh/noticeMgmt (역할 목록) | /api/mcm/oasis/commRoleMng/search | noticeMgmt | notice-api.test.ts (역할 목록은 다른 서비스 경로지만 menuId 는 화면 ID) |

- 다른 파일이 import 하던 export 는 이름 그대로 얇게 위임해 유지했다.
  - `unwrap`: ruleConfirm(ruleSetConfirm/api 가 import), layoutConfirm, codeItemEdit, codeItemEdit/cate, codeConfirm, codeMng, dataMng(dataMng/edit-api 가 import), dataItemMng/cate, columnMng
  - `callMdmOasis`(codeMng, edit-api 가 import), `callOasis`(columnMng: termRegPop/api, dataItemMng: dataCsvUploadPop/api·history/api)
  - `omitNullish`(dataItemMng, nullish+empty), `cleanParams`(layoutMng·headerMng, nullish+blank), `itemRows`(headerMng)
  - 공통본: `OasisCallError`, `isRowVersionConflict`, `isDraftGone`, `writeFailure`, `CONFLICT_MESSAGE`, `omitNullish`, `callOasis`
  - dataItemMng/columns.tsx 의 `isRowVersionConflict`(문자열 접두 판정)는 공통본 동명 함수와 별개라 합치지 않았다.
- 바꾼 이유: 같은 판정을 17곳에 복사해 두면 한 곳만 고치고 나머지가 어긋난다. 복사본 사이의 차이(빈 문자열 제거, 응답 펼치기, 상세 붙이기)를 옵션으로 이름 붙여 한곳에 모으면 차이가 보이고, 이후 문구 통일(S7)을 한 곳에서 할 수 있다.
- 동작 보존 근거:
  - 이전 전에 특성 시험을 먼저 고정했다. m-mdm 화면별 `api.test.ts` 와 `tests/helpers/oasis-envelope.ts` 의 `describeOasisEnvelope`(요청은 POST 해당 URL, meta 는 menuId 하나, 거부 문구 등)를 9fc315e4 에서, m-mls `notice-api.test.ts` 의 특성 시험을 b9ada77f 에서 더했다.
  - 이전 커밋 2ba3f9f4·02e22365 는 이 시험을 고치지 않은 채 통과했다. 작성 당시 기록은 m-mdm 215파일 3383건, m-mls 5파일 58건이다.
  - 공통 계약 자체는 `shared/tests/unit/http-oasis-call.unit.test.ts` 가 요청 조립, 펼치기, 거부 판정을 시험하고, `http-oasis-call-bundle.unit.test.ts` 가 `dist/*.js` 에서 `OasisCallError` 클래스가 `http.js` 한 곳에만 있는지 검사한다.
  - 시험 파일 변경은 `m-mls/tests/lsh/noticeMgmt/notice-api.test.ts` 의 mock 팩토리 한 줄뿐이다. 기존에는 `@dk-oasis/shared/http` 를 통째로 가짜로 바꿔 `apiRequest`·`HttpError` 만 돌려줬는데, 화면이 이제 진짜 `unwrapOasis` 를 import 하므로 가짜에 그 이름이 없어진다. 그래서 팩토리를 `async (importOriginal)` 로 바꿔 나머지 export 는 진짜를 쓰고 `apiRequest`·`HttpError` 만 덮어쓴다.
- 영향 범위: m-mdm 화면 15개, 공통본, m-mls noticeMgmt. 위 export 를 import 하는 화면(ruleSetConfirm, dataMng/edit-api, codeMng/edit-api, termRegPop, dataCsvUploadPop, history 등)은 코드 변경 없이 같은 이름을 쓴다. shared 에는 export 가 추가될 뿐 기존 이름은 바뀌지 않는다.
- 이번 범위 밖: m-mcm 의 복사본 20개는 다음 단계에서 공통화한다(대조표 `r2-mcm-table.md`를 레인 보고에 남겼다).
- 되돌리는 방법: S7(102c6073·bb85f89d)과 S6(c5d35b37)이 이 구조 위에 쌓였으므로 그 둘을 먼저 revert 한 뒤 02e22365, 2ba3f9f4, 4ba726ca 순으로 revert 한다. 특성 시험(9fc315e4·b9ada77f)은 그대로 둬도 통과한다.

## S6. OASIS 오류 상세에서 message 가 없는 errors 항목을 버림 (결함 수정)
- 커밋: c5d35b37 (fix), 머지 edc60561
- 바뀌기 전: 공통 계약이 `field` 만 있고 `message` 가 없는 `errors[]` 항목을 `"field: undefined"` 문구로 만들었다. 기존 unitMng·termMng 복사본에서 물려받은 결함이다.
- 바뀐 뒤: `message` 가 없거나 빈 문자열이거나 공백뿐인 항목은 `field` 가 있어도 문구에 붙이지 않는다. 오류 객체의 `errors`·`field` 에는 원본 그대로 남는다. `details` 모드가 무엇이든 같다.
- 바꾼 이유: 사용자에게 "undefined" 가 보이는 것을 막는다. S5 조사에서 발견해 별도 fix 커밋으로 분리했다.
- 동작 보존 근거(재현 시험): `shared/tests/unit/http-oasis-call.unit.test.ts` 에 `message 가 없거나 빈·공백인 항목은 field 가 있어도 문구에 붙이지 않는다(어느 방식·항목명 사전이든)…` 시험을 더했다. `m-mdm/tests/dma/unitMng/api.test.ts`, `dme/oasis-call.test.ts`, `helpers/oasis-envelope.ts` 의 기대값도 같이 맞췄다.
- 영향 범위: errors[] 에 message 없는 항목이 오는 경우에만 문구가 바뀐다(`field: undefined` 줄이 사라진다). 현재 서버는 그런 항목을 보내지 않는다.
- 되돌리는 방법: c5d35b37 을 revert 한다.

## S7. OASIS 오류 문구 통일 (추가 A, 동작 변경)
- 커밋: 5a435e4c(shared 옵션), 102c6073(m-mdm), a26f736b(표시처 pre-line), bb85f89d(m-mls), 머지 edc60561
- 분류: 사용자가 선택한 안 C. 문구가 바뀌는 feat 다(S5 와 분리했다).
- 바뀌기 전: 화면마다 오류 문구가 달랐다. 13개 화면은 `meta.message` 만 보였고(errors[] 는 버림), unitMng·termMng·noticeMgmt 는 errors[] 를 `field: 메시지` 로 붙였다. 서버 필드 코드가 사용자 문장에 노출될 수 있었다.
- 바뀐 뒤:
  - 형식은 기본 문구 다음에 `\n- 항목명: 메시지` 를 항목마다 한 줄씩 붙인다.
  - 필드 코드는 문구에 쓰지 않는다. 항목명 맵에 없는 field 는 `메시지` 만 보인다. `message` 가 없는 항목은 버린다(S6).
  - 포함 판정 중복 제거: 상세 메시지가 기본 문구 안에 이미 들어 있으면(완전 일치가 아니라 포함) 뺀다. 서버가 `기본 문구: 상세` 를 `meta.message` 에 이어 붙이고 errors[] 에도 같은 글을 싣는 경로(`MdmErrors.of` 모양)에서 같은 글이 두 번 보이지 않게 한다. 이 모양을 모의 `errors[]` 로 만든 단위 시험으로 고정했다.
  - `fieldLabel` 옵션(field 코드를 항목명으로 바꾸는 함수)과 `labelsFrom(map)` 을 shared 에 더했다. `labelsFrom` 은 field 를 trim 한 뒤 원문, 대문자, camelCase 를 대문자 snake 로 바꾼 값 순으로 맵을 찾는다. 그래서 맵 키는 대문자 snake 하나(`APPLY_FROM`)면 `applyFrom`·`APPLY_FROM` 이 모두 찾아진다. shared/http 는 mdm-meta 를 import 하지 않고 함수를 주입받는다.
  - 화면별 항목명 맵 위치: `m-mdm/pages/<영역>/<화면>/fieldLabels.ts`(columnMng, domainMng, headerMng, layoutMng, codeItemEdit, dataItemMng 에 새로 둠. layoutConfirm 은 layoutMng 맵, codeConfirm·codeItemEdit/cate 는 codeItemEdit 맵, dataItemMng/cate 는 dataItemMng 맵을 쓴다). 공통 항목(`APPLY_FROM` 희망 적용 시작 일시)은 `m-mdm/src/oasis-screen.ts` 의 `MDM_COMMON_FIELD_LABELS` 와 `mdmFieldLabel(화면 맵)` 이 더한다(같은 키는 화면 맵이 이긴다).
  - m-mls noticeMgmt 는 기존 `FIELD_LABEL` 을 `labelsFrom` 으로 감싸 쓴다. mdm-meta 캡션을 보조로 쓰는 안은 생략했다. 이유는 `FIELD_LABEL` 이 서버가 보내는 field 11개를 모두 덮기 때문이다.
  - 화면 로컬 표시처 8곳(termRegPop, layoutConfirm, codeConfirm, dataCsvUploadPop, ruleConfirm, ValueTestCard, ruleSetConfirm, ColumnPickModal)의 오류 문단에 `white-space: pre-line` 을 적용했다(a26f736b). 줄바꿈이 줄로 나뉘어 보이게 하기 위해서다. ErrorModal 은 S4 에서 이미 했다.
- 현재 서버는 `errors[]` 를 싣지 않으므로 화면에 보이는 문구는 그대로다. a8 8번(errors[] 보강)이 머지된 뒤에 상세 줄이 보인다.
- 바꾼 이유: 필드 코드가 사용자에게 보이지 않게 하고, 화면마다 다른 문구 형식을 하나로 맞춘다.
- 동작 보존 근거: 기본 문구는 맨 앞에 그대로이고 상세만 뒤에 붙으므로 접두 판정(`startsWith("다른 사용자가 수정했습니다")` 등)과 `includes` 판정은 유지된다. 단위 시험은 `shared/tests/unit/http-oasis-call.unit.test.ts`(fieldLabel, labelsFrom 정규화, 포함 판정, `MdmErrors.of` 모양)와 m-mdm 화면별 `api.test.ts`, m-mls `notice-api.test.ts` 에 있다.
- e2e 변경은 없다(`rA-e2e-changes.md`). 전체 일치 단언 중 서버 문구가 걸린 것은 dmc.user.ts:1143·dme.user.ts:1400 의 "적용 시작 일시를 입력하세요" 둘뿐인데, 프론트가 같은 문구를 먼저 띄우고 서버가 같은 문구를 errors[] 로 실어도 포함 판정으로 빠진다. 부분 일치 단언은 기본 문구가 맨 앞이라 통과한다.
- 주의: 5a435e4c 단독으로는 m-mdm 시험이 깨진다. 102c6073 까지 함께 있어야 통과하므로 중간 커밋으로 이등분할 때 유의한다.
- 알려진 제약: 포함 판정이라 짧은 상세가 기본 문구의 일부이면 상세가 빠질 수 있다.
- 영향 범위: m-mdm 화면 15개의 오류 문구(서버가 errors[] 를 싣기 시작하면), m-mls noticeMgmt, 위 표시처 8곳, shared/http 옵션.
- 되돌리는 방법: bb85f89d, a26f736b, 102c6073, 5a435e4c 를 함께 revert 한다(일부만 되돌리면 시험이 깨진다).

## S8. shared 새 컴포넌트 등록과 화면 교체 (Part B §18)
- 커밋: card ddc420cf(등록)·9ad11b3f(특성 시험)·bf9ae363(교체), transfer-list 4b1a8cd3(등록)·221ed024(특성 시험)·f17a273d(교체), html-editor b0f1a510(등록)·6f1e4196(특성 시험)·26dc4867(교체), 문서 0bae6011, 머지 a69d98d9
- 주의: bf9ae363 은 머리가 `feat(shared)` 이지만 실제 내용은 m-mdm 화면 교체다(`CardFrame`·`CardGroup` 사본을 archive 로 옮기고 ruleEdit·ruleSetEdit 이 shared 를 쓰게 함). 이력을 유지하려고 그대로 뒀고 머지 메시지에 알렸다.
- 바뀌기 전: 도메인에 묶이지 않는 UI 부품이 m-mdm 화면 폴더에 있었다. 카드 틀과 접는 묶음은 `ruleEdit/cards/`, 전송 목록은 dmc·dmd cate 두 곳의 사본, 글/HTML 형식 전환 설명 칸은 columnMng 안에 있었다.
- 바뀐 뒤:
  - `card`: `CardFrame`·`CardGroup`·`MutedText` 를 `@dk-oasis/shared/card` 로 등록했다. ruleEdit·ruleSetEdit 이 이를 쓴다. 화면 사본은 `m-mdm/archive/pages/dme/ruleEdit/cards/` 로 `git mv` 했다.
  - `transfer-list`: `TransferList` 와 집합 함수(`transfer-set.ts`)를 `@dk-oasis/shared/transfer-list` 로 등록했다. dmc cate `TransferListPanel` 은 이를 감싸는 얇은 래퍼가 되고(testId 접두어 `cate-transfer`, 분류 접미 lvl1, `1차 전체`, 미저장·삭제 예정 배지를 prop 으로 넘김), dmc `transfer.ts` 는 도메인 함수(`transferCandidates`·`memberChangesOf`·`CodeRowLike`·`MARK`)만 두고 옛 export 이름은 얇은 위임으로 유지한다(정렬은 `localeCompare` 그대로). dmd `transfer.ts` 는 집합 연산만 shared 에 맡기고 반환 모양 `{addCodes, removeCodes}` 와 기본 `.sort()` 정렬을 지킨다. dmc 의 미사용 `RegexEditPanel` 은 `m-mdm/archive/` 로 옮겼다.
  - `html-editor`: `HtmlFormatField`(글·HTML 형식 전환과 글자 수 칸)를 등록했다. columnMng `DescriptionField` 는 이를 감싸는 얇은 래퍼가 되어 문구·testid·상한·접근성 이름을 그대로 낸다.
  - testid 는 접두어 prop 으로 받아 기존 값이 그대로 나온다. 스킬 `mantine-aggrid-ui` 의 컴포넌트 문서·색인(llms, 카탈로그, `ui_docs.py`)과 Part B §1 표를 같은 작업에서 갱신했다.
  - 판정만 하고 등록하지 않은 것: `DomainTreeGrid`(domainMng 한 곳, AgDataGrid 조합), `DeptPicker`(shared `LookupModal` 의 얇은 어댑터), `NoticeBodyEditor`(공지 도메인 조합)는 화면에 둔다. m-mcm `grid-badge` 는 shared `GridBadge` 의 얇은 래퍼라 대체 대상이 아니다.
- 바꾼 이유: 새 공통 부품은 화면 폴더가 아니라 shared 에 둔다는 Part B §18 규칙을 따른다. 사본 두 개로 갈라진 전송 목록은 하나로 모은다.
- 동작 보존 근거: 교체 전에 특성 시험을 먼저 고정했다. `m-mdm/tests/dme/ruleEdit/rule-edit-page.test.ts`(카드 틀·카드 묶음의 testid, 접어도 내리지 않는 hidden, 16칸 격자), dmc `tests/dmc/codeItemEdit/cate/transfer-characterize.test.ts`·`transfer-list-panel.test.ts`, `tests/dma/columnMng/description-field.test.ts`. 교체 커밋은 이 시험과 기존 시험을 고치지 않고 통과했다. 새 shared 부품 시험은 `shared/tests/unit/card.unit.test.ts`, `transfer-list.unit.test.ts`, `html-format-field.unit.test.ts` 다.
- 영향 범위: m-mdm ruleEdit·ruleSetEdit·dmc cate·dmd cate(transfer.ts)·columnMng, shared 서브패스 3개 추가(package.json exports·tsup entry 포함), 스킬 문서. 기존 shared 컴포넌트의 props·동작·모습은 바꾸지 않았다(새 컴포넌트 등록이라 승인 대상 아님).
- 되돌리는 방법: 화면 교체 커밋(26dc4867, f17a273d, bf9ae363)을 먼저 revert 하면 archive 로 옮긴 파일이 제자리로 돌아온다. 그 뒤 등록 커밋(b0f1a510, 4b1a8cd3, ddc420cf)과 문서 커밋 0bae6011 을 되돌린다. S9·S10 이 transfer-list 위에 쌓였으므로 그 둘을 먼저 되돌려야 한다.

## S9. 전송 목록 행 안 체크박스를 직접 눌러도 선택되게 함 (결함 수정, 동작 변경)
- 커밋: 00abb649 (fix), 부수 정리 2ba88c1a(refactor), 머지 a69d98d9
- 바뀌기 전: 체크박스 `onChange` 가 토글한 뒤 같은 클릭이 행 `onClick` 으로 올라가 다시 토글했다. 그래서 체크박스 input 을 직접 누르면 선택이 지워졌다. 옛 dmc 패널부터 있던 결함이다.
- 바뀐 뒤: 토글은 행 `onClick` 한 곳에서만 한다(행 체크박스의 `onChange` 를 뺐다). 체크박스를 Shift 로 눌러도 행과 같이 범위 선택이 된다. DOM 구조와 testid 는 같다.
- 부수 정리: 2ba88c1a 는 열 머리 체크박스에서 DOM 에 닿지 않던 `data-testid`(shared Checkbox 가 받지 않아 처음부터 그려지지 않았다)를 뺐다. 화면 변화는 없다.
- 영향 범위: dmc 코드 편집 카테고리 탭과 dmd 데이터 항목 소속 편집(S10)이 모두 이 수정으로 동작이 바뀐다. 행 클릭과 열 머리 전체선택은 그대로다. 사용자에게 보이는 변화는 "체크박스를 직접 누르면 이제 선택된다" 뿐이다.
- 동작 보존 근거: 체크박스 input 을 직접 누르는 단위 시험을 `shared/tests/unit/transfer-list.unit.test.ts` 에 더했다.
- 되돌리는 방법: 00abb649 를 revert 한다(결함이 돌아온다). 2ba88c1a 는 독립이다.

## S10. dmd 소속 편집 패널을 shared TransferList 로 교체 (추가 B, 모습 변경)
- 커밋: 63b78968, 문서 a0d76872, 머지 a69d98d9
- 분류: 사용자가 선택한 안 B. 모습과 testid 가 바뀐다.
- 바뀌기 전: dmd 데이터 항목 [카테고리 편집] 탭의 TABLE 소속 팝업이 구판 `TransferListPanel`(검색, 항목 단건 토글, `>`·`<`, [적용])을 썼다.
- 바뀐 뒤: shared `TransferList`(dmc 와 같은 모습)를 제어형으로 쓴다. `value={cate.memberCodes}`, `onChange={cate.setMemberCodes}`, `editable` 은 지금 조건(`canEdit && open && 새 상세 도착`) 그대로이고 분류 필터는 넣지 않았다. [적용](`transfer-apply`)은 패널 밖 아래에 dmd 가 두고 지금처럼 `applyMembers` 를 부른다. 바깥 래퍼 `transfer-list-panel` 은 유지한다.
- 반영 시점은 그대로다. 이동은 훅 상태(`memberCodes`)만 바꾸고 서버 저장은 [적용] 때 diff 로 한 번 간다. 훅(`useDataCategories`)과 api, `diffMembers` 는 수정하지 않았다. 근거 시험은 `m-mdm/tests/dmd/dataItemMng/data-item-page.test.ts` 의 "소속 이동은 화면 상태만 바꾸고, 서버 저장은 [적용] 을 눌렀을 때 diff 로 한 번 간다"와, 새 상세를 기다리는 동안 `>` 가 잠기는 단언이다.
- 모습 변경 3가지(사용자 승인):
  1. 선택이 체크박스가 된다(행 클릭 토글, Shift 범위 선택, 전체 선택).
  2. `>`·`<` 는 선택이 있어야 켜진다(전에는 선택 없이도 켜졌다).
  3. `>>`·`<<` 와 건수 표시가 생긴다.
- testid 변경 3종: `transfer-query` 는 `transfer-search`, `transfer-available-{code}` 는 `transfer-item-available-{code}`, `transfer-member-{code}` 는 `transfer-item-member-{code}` 로 바뀐다. 래퍼 `transfer-list-panel`, `transfer-apply`, `transfer-move-right`, `transfer-move-left`, 열 `transfer-available`·`transfer-member` 는 그대로다.
- e2e `e2e/mdm-user/dmd.user.ts` 는 이번에 고치지 않았다. 1b 8번 머지 뒤 dev 를 합치고 고친다(`rB-e2e-changes.md`).
  - testid 이름 16줄(1218~1237, 1412~1419)을 위 대응대로 바꾼다.
  - 1287행 `transfer-move-right` `toBeEnabled` 단언은 선택이 없으면 `>` 가 꺼지므로 실패한다. 항목 하나(`transfer-item-available-KRPUS`)를 먼저 클릭한 뒤 단언하게 바꾼다.
- 쓰지 않게 된 dmd `TransferListPanel` 과 그 특성 시험(`transfer-list-panel.test.ts`)은 `m-mdm/archive/` 로 옮겼다. 그만큼 m-mdm 시험 수가 줄어든다(tsc·tsup·vitest 대상 밖).
- 문서: a0d76872 가 스킬 전송 목록 문서의 dmd [적용] 흐름과 행 체크박스 선택 규칙을 바로잡았다.
- 영향 범위: dmd CategoryTab, 단위 시험 `data-item-page.test.ts`(testid 한 곳), e2e dmd.user.ts(미수정, 위 참고).
- 되돌리는 방법: 63b78968 을 revert 한다(archive 파일이 돌아온다). 그 전에 dmd.user.ts 를 고쳤다면 그 수정도 함께 되돌린다.

## 진행 중 (다음 머지에 추가)
- `e2e/mdm-user/dmd.user.ts` 수정(S10): 1b 8번 머지 뒤 dev 를 합치고 testid 16줄과 1287행 단언을 고친다.
- P2 측정: 조정 세션이 「측정 시작」을 알린 뒤 `perf-frontend.md` 절차대로 잰다.
- m-mcm 복사본 20개 공통화(S5 후속): 다음 단계에서 한다(대조표 `r2-mcm-table.md`).
- 오류 문구 화면 확인(S7): a8 8번(errors[] 보강) 머지 뒤 상세 줄이 보이는지 확인한다.
