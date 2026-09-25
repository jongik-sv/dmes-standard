# TSK-08-06 Build 기록

> Build 단위별 구현 중 기록(변이 검증 기록·설계 이탈·인계). 설계 정본은 `design.md` 다.

## 변이 검증 기록

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| I22(보내는 쪽, B7) | 등록 성공 이동 경로 `dme/ruleSetEdit` → `dme/ruleSetEdt`(`RuleSetRegisterForm.tsx`) | `rule-set-mng-page.test.ts` "등록에 성공하면 … 그 세트로 연다" | 잡힘 |
| I22(보내는 쪽, B7) | 등록 성공 이동 키 `{ setId }` → `{ id: setId }` | 같은 테스트 | 잡힘 |
| I22(보내는 쪽, B7) | 등록 성공 뒤 `openMdmPage` 호출 삭제 | 같은 테스트 | 잡힘 |
| I22(보내는 쪽, B7) | 목록 세트 ID 링크 경로 `EDIT_PAGE` → `dme/ruleSetEdt`(`page.tsx`) | `rule-set-mng-page.test.ts` "목록의 세트 ID 를 누르면 …" | 잡힘 |
| I22(보내는 쪽, B7) | 목록 링크 키 `{ setId }` → `{ id }` | 같은 테스트 | 잡힘 |
| I22(보내는 쪽, B7) | 목록 링크 `onClick` 을 빈 함수로 | 같은 테스트 | 잡힘 |

B7 변이는 작업 트리에서만 넣고 규칙마다 `git checkout -- <파일>` 로 되돌렸다(`trap`). 대상 테스트 한 파일을 `vitest run … --bail=1` 로 돌렸다.

## 설계 이탈

- B7 `set-reg-id-error`: shared `Input` 의 `error` prop 은 testid 를 붙일 수 없어, `Input` 에는 `aria-invalid` 만 주고 오류 문구는 그 아래 `span.form-error-message`(`data-testid="set-reg-id-error"`, `role="alert"`)로 따로 그린다. 오류가 없을 때는 같은 자리에 시안 설명 "컬럼 물리명 규칙을 따르는 전역 이름"을 보인다(오류 문구와 동시에 보이지 않는다).
- B7 상태 조회 조건: `SearchField type="select"` 는 `data-testid` 를 넘기지 않아 `SearchField` 의 자식으로 `Select data-testid="set-search-status"` 를 둔다.
- B7 세트 검사 칸 문구: 거부·경고가 함께 있으면 `거부 N · 경고 N`, 경고만 있으면 `통과 · 경고 N`(§6.11 "뒤에 경고 N" 의 구분자를 ` · ` 로 정했다). 계산은 `types.ts` 의 `setCheckText` 한 곳이다. 상태 배지는 코드 그대로(`INUSE`·`DEPRECATED`, 시안 선택지와 같다) 보인다.
