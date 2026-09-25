# TSK-06-05 build-log — B3 (오케스트레이터가 build-log.md 로 합친다)

## B3 — FE 화면 `dmc/codeConfirm`

- 작업 위치: 별도 워크트리 브랜치 `wip/9656745e-b3`(기점 0747091). B2(백엔드)와 동시에 진행해 서버 응답 모양은 design.md §6.5 를 정본으로 삼았고, vitest 는 `globalThis.fetch` mock 으로 돈다.
- 커밋: 70a3178(화면·시험·tsup·page-registry), 이어서 문서 커밋(기능설계서·식별자 사전·이 기록, `DFlow-Unit: B3 done`)
- 새 시험: `tests/dmc/codeConfirm/checks.test.ts`(33)·`code-confirm-page.test.ts`(21), 합계 54
- 빨강 확인: `checks.ts` 를 `throw` 골격, `page.tsx` 를 `null` 렌더로 두고 두 시험 파일을 돌려 53건 모두 실패를 확인한 뒤 구현했다(`checkTitle` 시험 1건은 뒤에 더했다).
- 관련 시험: `pnpm --filter @dk-oasis/m-mdm exec vitest related <codeConfirm 5개 파일> --run` 54건 통과, `tests/tsup-entries.smoke.test.ts`·`tests/evalex-entry.test.ts` 4건 통과, `pnpm --filter @dk-oasis/m-mdm lint`(tsc) 통과.
- page-registry: `cd src/frontend/m-mcm && node scripts/generate-page-registry.mjs` 로 다시 만들었다. diff 는 `"dmc/codeConfirm"` 한 줄뿐이다.

## 설계 이탈

- **현재 사용자 ID 출처**: §6.5 `view` 응답에는 codeEdit·ruleEdit 의 `me` 같은 현재 사용자 칸이 없다. I30 의 "소유자 본인" 판정은 shared `useUserButtonRbac()` 가 돌려주는 `userId`(`/api/auth/me` 의 `user.id`, `ButtonRbacState` 공개 필드)로 한다. 서버 계약(B2)은 바꾸지 않았다. RBAC 를 아직 불러오지 않았으면 `userId` 가 빈 문자열이라 확정 버튼은 꺼져 있다.
- **검사·확정 버튼 위치**: `MdmPageLayout.buttons` 가 아니라 확정 폼 안의 shared `Button`(`cf-validate`·`cf-confirm`)으로 두었다. RBAC 판정은 `canDoButton(rbac, "codeConfirm", "validate"|"confirm")` 으로 명시해 `canConfirm` 에 넘긴다(PageLayout 자동 비활성에 기대지 않는다). DRAFT 가 아니면 두 버튼을 비활성으로 보인다.
- **오류 표시**: codeCateEdit 의 `ErrorModal` 대신 인라인 오류 영역 `cf-error`(role=alert)만 둔다(§6.7-5, E2E T5 가 이 영역을 본다). 확정이 실패하면 대화상자를 닫고 message 를 이 영역에 보인다.
- **검사 버튼과 빈 입력**: apply_from 이 비어 있어도 검사 버튼을 끄지 않고, 누르면 오류 영역에 "적용 시작 일시를 입력하세요" 를 보인다(서버를 부르지 않는다). 버튼 활성은 DRAFT·`validate` 권한·처리 중 여부로만 정한다.
- **확정 판정의 apply_from 비교**: 서버 `validate` 가 돌려주는 정규화 `applyFrom` 과 비교하지 않고, 검사 때 보낸 `toServerDateTime(입력)` 을 기억해 지금 입력의 변환값과 비교한다(서버 형식 차이로 버튼이 영구히 꺼지는 것을 막는다). 확정 요청의 `applyFrom` 도 이 검사한 값이다.
- **검사 항목 설명**: 검사 표의 "검사" 칸에 04 「상신 시 검사」 문구를 줄인 설명(`checks.ts` 의 `checkTitle`, 번호별)과 서버 `item`(enum 이름)을 함께 보인다. 모르는 번호는 `item` 을 그대로 쓴다.
- **스냅샷 모양**: `{ maruCodeId, ver? }` — handoff 에 ver 가 없으면 ver 를 넣지 않는다.
- **확정 대화상자 testid**: 설계에 없는 `cf-future-warning`(미래 적용 경고 문구)·`cf-modal-warnings`(경고 목록)·`cf-target`·`cf-previous`·`cf-released`(DRAFT 아닌 버전의 확정 결과)·`cf-diff-{key}`·`cf-cate-{cateId}`(`data-reduced`)·`cf-check-{no}` 의 `data-rejected`·`cf-search`(목록 조회 버튼)를 더했다. shared `Checkbox` 는 data-testid 를 받지 않아 `cf-ack` 는 감싼 `span` 에 있다 — E2E 는 `getByTestId("cf-ack").locator("input")` 로 체크한다.

## 변이 검증 기록

B3 담당 I30~I35. 대상 시험 `tests/dmc/codeConfirm`(2파일)만 `vitest run --bail=1` 로 돌렸다. 스크립트 하나(변이 넣기 → 대상 시험 → `git checkout --` 되돌리기, `trap` 으로 중단 시에도 되돌림)를 `heavy.sh` 로 한 번 감싸 70a3178 기준으로 돌렸고, 끝난 뒤 작업 트리가 깨끗한 것을 확인했다. 20개 변이가 모두 적용되었고 모두 잡혔다.

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| I30 | `canConfirm` 의 DRAFT 조건 제거 | `checks.test.ts` "DRAFT 가 아님 → false" | 잡힘 |
| I30 | 소유자 본인 조건 제거 | `checks.test.ts` "소유자가 아님 → false" | 잡힘 |
| I30 | confirm 권한 조건 제거 | `checks.test.ts` "confirm 권한 없음 → false" | 잡힘 |
| I30 | 검사 결과 빈 목록 허용 | `checks.test.ts` "검사 결과가 빈 목록 → false" | 잡힘 |
| I30 | REJECTED 0건 조건 제거 | `checks.test.ts` "REJECTED 1건 → false" | 잡힘 |
| I30 | 검사한 apply_from 일치 조건 제거(`return true`) | `checks.test.ts` "검사한 apply_from 과 입력값이 다름 → false" | 잡힘 |
| I30 | 화면이 현재 사용자 대신 DRAFT `ownerId` 를 `me` 로 넘김 | `code-confirm-page.test.ts` "DRAFT 소유자가 아니면 … 비활성" | 잡힘 |
| I30 | 화면이 confirm RBAC 대신 `true` 를 넘김 | `code-confirm-page.test.ts` P5 confirm 권한 없음 | 잡힘 |
| I30 | 화면이 검사한 apply_from 대신 현재 입력을 넘김 | `code-confirm-page.test.ts` P7 | 잡힘 |
| I31 | 대화상자가 늘 `warningsAcknowledged=true` 를 보냄 | `code-confirm-page.test.ts` P3 경고 없음 → false | 잡힘 |
| I31 | 경고 확인 체크 전에도 확인 버튼 활성 | `code-confirm-page.test.ts` P3 경고 있음 | 잡힘 |
| I32 | 미래 판정을 브라우저 시계(`Date.now()`)로 | `code-confirm-page.test.ts` P4 futureApplyFrom=true·과거 일시 | 잡힘 |
| I33 | `callOasis` 의 null·undefined 필터 제거 | `code-confirm-page.test.ts` P1 ver 없이 넘겨받음 | 잡힘 |
| I33 | `view` 의 ver 를 `Number` 로 | `code-confirm-page.test.ts` 목록 행 선택 → view | 잡힘 |
| I33 | `confirm` 의 ver 를 `Number` 로 | `code-confirm-page.test.ts` P3 경고 있음 | 잡힘 |
| I34 | 초(`:00`)를 붙이지 않음 | `checks.test.ts` toServerDateTime 분 단위 | 잡힘 |
| I34 | `T` 구분자를 그대로 둠 | `checks.test.ts` toServerDateTime 분 단위 | 잡힘 |
| I34 | 화면이 변환 없이 입력값 그대로 `validate` | `code-confirm-page.test.ts` P2 | 잡힘 |
| I35 | 서버 message 대신 고정 문구 | `code-confirm-page.test.ts` P6 | 잡힘 |
| I35 | 오류 영역 testid 제거 | `code-confirm-page.test.ts` P6 | 잡힘 |

- 동등 변이라 싣지 않은 것: I31 "화면이 대화상자의 체크 값 대신 `경고 있음` 여부를 보냄"은 체크 전에는 확인 버튼이 꺼져 있어(위 두 번째 I31 변이가 잡는 조건) 관찰되는 요청이 같다.
- 스윕 뒤 `checkTitle`(검사 항목 설명) 추가로 `page.tsx`·`checks.ts` 가 바뀌었지만 위 변이 대상 줄은 바뀌지 않았다.

## B4 에 넘기는 것

- E2E 에서 쓸 testid 는 §6.7 이름 그대로다(`cf-list`·`cf-keyword`·`cf-search`·`cf-row-{id}-{ver}`·`cf-list-empty`·`cf-form`·`cf-apply-from`·`cf-validate`·`cf-confirm`·`cf-checks`·`cf-check-{no}`·`cf-check-status-{no}`·`cf-diff`·`cf-diff-empty`·`cf-cate-summary`·`cf-error`·`cf-ack`·`cf-modal-ok`). `cf-apply-from` 은 `type="datetime-local" step=1` 이라 Playwright `fill("2026-10-01T00:00:00")` 로 넣는다.
- **B2 실제 응답과 대조할 것**(화면은 §6.5 모양의 fetch mock 으로만 초록이다. 기준 파일 `pages/dmc/codeConfirm/types.ts`):
  1. `confirm` 의 `warningsAcknowledged` 는 JSON boolean 으로 보낸다. B2 가 문자열 `"true"` 가 필요하다고 기록했으면 `api.ts` `confirmDraft` 와 P3 기대값을 바꾼다.
  2. `ver` 는 모든 응답(search 행, `view.version`, `previous`, `confirmed`)에서 문자열이어야 한다. BigDecimal 이 JSON number 로 나오면 `cf-row-{id}-2.000` testid 와 I33 이 깨진다.
  3. search 결과 키는 `rows`, validate 행 `no` 는 문자열(`"2-1"` 등)이다. testid `cf-check-{no}` 가 이 값에 기댄다.
- mantine-aggrid-ui 점검: `grep -rnE "@mantine|ag-grid" src/frontend/m-mdm/pages/dmc/codeConfirm` 0건 — shared 래퍼(`@dk-oasis/shared/form`·`modal`·`layout`)만 쓴다.
- 성공 토스트 문구는 "확정했습니다", 확정 뒤 상태 배지는 `VersionStatusBadge`(RELEASED 이고 apply_from 이 지났으면 "확정", 미래면 "적용 대기")다.
