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
- effect 순서(탭 묶음 안의 상대 순서는 원래와 같다).

| 구분 | 원래 | 지금 |
|---|---|---|
| 탭 effect | 복원(E8) → 기본 화면(E9) → 화면 불러오기(E10) → 제목 동기화(E11) → 빈 목록 대체(E12) → 순서 부여(E13) → E14 → E15 → 저장(E19), 한 컴포넌트 안에서 선언 순서대로 | `usePortalTabs` 안에서 같은 순서. 저장(E19)은 탭 훅의 맨 마지막 effect |
| 인증 사용자(E1)와 최근 메뉴(E7) 등 | 탭 effect 보다 앞 | 인증 사용자 훅은 탭 훅보다 먼저 호출. 일부는 탭 effect 뒤로 이동 |
| 저장(E19)과 화면 사용(E16~E18) | 저장이 화면 사용 effect 뒤 | 저장이 화면 사용 effect 앞으로 이동 |

  상대 순서가 달라진 두 곳은 서로 같은 상태·저장소를 건드리지 않는다(r5 지도 §3).
- 영향 범위: 공개 export 는 그대로다. 훅 4개는 `portal-shell` 폴더 안에서만 쓰고 shared 루트에서 내보내지 않는다. 호출부·설정 변경 없음.
- 되돌리는 방법: c07e63ca 를 revert 한다. 특성 시험(bb6124d2·ef7df8e2)은 그대로 둬도 통과한다.

## S2. m-mdm 타입 선언 생성을 tsup dts 에서 tsc 로 전환
- 커밋: e8cd73b3, ccbcfa10, 머지 4f335f12
- 바뀌기 전: tsup 의 dts 옵션이 타입 선언을 번들로 만들었다. `package.json` exports 는 `./pages/*` 와일드카드였다.
- 바뀐 뒤: `tsconfig.build.json`(`emitDeclarationOnly`)으로 `tsc` 가 `dist/types/` 아래에 파일별 선언을 만든다. exports 는 화면별 명시 항목으로 바뀌었다. 빌드 순서는 tsup(JS) 뒤 tsc(선언)이며 `scripts/lib-dev.mjs` 가 돌린다(shared 와 같은 방식).
- 바꾼 이유: tsup dts 가 오래 걸리고 메모리를 많이 쓴다. 증분 빌드도 되지 않았다. 효과는 `perf-frontend.md` P2 에서 잰다.
- 동작 보존 근거:
  - 진입점 21개의 export 이름을 전환 전후로 비교해 차이 0건
  - m-mcm 의 tsc 통과
  - `tests/package-exports.test.ts`: tsup 진입점이 package.json exports 에서 빠지면 실패한다.
- 영향 범위: 새 화면을 추가할 때 tsup entry 와 package.json exports 두 곳에 모두 넣어야 한다. 이 규칙은 FE Local-Rules 에 갱신했다. 표준 문서 03 체크리스트와 배포 가이드는 후속 갱신이 필요하다(리뷰 minor).
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
- 머지 전 확인(머지 요청에 덧붙일 근거, 아직 안 함):
  - dev 와 브랜치의 루트 dist `Object.keys` 이름 집합 비교
  - dev 루트 타입 이름을 모두 import 하는 임시 파일(커밋 안 함)의 tsc 통과
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

## 진행 중 (다음 머지에 추가)
- 2번: OASIS 호출 계층을 shared/http 로 이전한다(m-mdm 15개와 m-mls 1개, callOasisAt, 화면별 최종 URL 전후 대조 목록을 머지 요청에 붙인다).
- 3번: shared 새 컴포넌트 card(CardFrame·CardGroup·MutedText)와 transfer-list(TransferList)를 등록한다.
- 4번: 형식 전환 설명 칸(DescriptionField)을 등록하고 dmc RegexEditPanel 을 archive 한다.
- 추가 A: 오류 문구 통일(기본 문구와 「- 항목명: 메시지」 형식, 필드 코드 노출 금지).
- 추가 B: dmd 전송 패널을 shared TransferList(제어형)로 교체한다. e2e testid 수정이 따른다.
