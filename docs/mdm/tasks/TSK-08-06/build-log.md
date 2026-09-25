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
| I8(B1) | 순환을 직접 의존·겹침으로만 봄(`reaches` 삭제) | `RuleSetAnalyzerTest`(세 룰 고리) | 잡힘 |
| I8(B1) | DUP_RESULT 심각도 WARN→REJECT | `RuleSetAnalyzerTest` "세 번 대입하면 경고가 두 건…" | 잡힘 |
| I8(B1) | RULE_DEPRECATED 문구 바꿈 | `RuleSetAnalyzerTest` "DEPRECATED 룰은 RULE_DEPRECATED 한 건이다" | 잡힘 |
| I8(B1) | 검사 순서 뒤집음(`checks` 결과 reverse) | `RuleSetAnalyzerTest` "없는 룰은 RULE_NOT_FOUND 한 건이다" | 잡힘 |
| I8(B1) | 순환 겹침에서 상대의 DICT 조건 제외 | `RuleSetAnalyzerTest` "순환 겹침은 상대 조건의 출처와 무관하게 본다" | 잡힘 |
| I8(B1) | PROG 통과 삭제(PROG 도 UNKNOWN_INPUT) | `RuleSetAnalyzerTest` | 잡힘 |
| I9(Java, B1) | Java ORDER 문구만 바꿈("결과 변수"→"결과변수") | `RuleSetCorpusTest` | 잡힘 |
| I10(B1) | 뒤 룰이 만드는 이름을 앞 룰이 읽어도 readers 로 넣음 | `RuleSetAnalyzerTest` "뒤 룰이 만드는 이름을 앞 룰이 읽으면 입력으로…" | 잡힘 |
| I10(B1) | 같은 변이 — 코퍼스만 | `RuleSetCorpusTest` | 잡힘 |
| I10(B1) | 최종 결과 판정 바꿈(readers 비었음 → by 1개) | `RuleSetAnalyzerTest` | 잡힘 |
| I11(B1) | deps 의 DICT 제외 삭제 | `RuleSetAnalyzerTest` | 잡힘 |
| I11(B1) | 같은 변이 — 코퍼스만("DICT 이름을 만드는 룰" 사례) | `RuleSetCorpusTest` | 잡힘 |
| I11(B1) | deps 의 자기 제외 삭제 | `RuleSetAnalyzerTest` | 잡힘 |
| I16(B1) | 생산자 목록의 첫 룰 대신 마지막 룰을 고름 | `RuleSetGuideTest` | 잡힘 |
| I16(B1) | DFS 후위 순서를 전위로 바꿈 | `RuleSetGuideTest` | 잡힘 |
| I16(B1) | DICT·PROG 이름도 거슬러 찾음 | `RuleSetGuideTest` | 잡힘 |
| I16(B1) | 생산자 없는 NONE 이름 오류를 건너뜀 | `RuleSetGuideTest` | 잡힘 |
| I16(B1) | 순환 검출 삭제 | `RuleSetGuideTest` | 잡힘 |

B7 변이는 작업 트리에서만 넣고 규칙마다 `git checkout -- <파일>` 로 되돌렸다(`trap`). 대상 테스트 한 파일을 `vitest run … --bail=1` 로 돌렸다.

B1 변이는 스크립트 하나(변이 넣기 → `:lib:test --fail-fast --tests <대상 클래스>` → `git checkout --` 로 되돌리기)를 `heavy.sh` 로 감싸 두 번(분석기·지침) 돌렸다. 모든 변이는 컴파일되는 형태다.
B1 담당 범위 밖: I8 의 "REJECT 가 있으면 저장·되살리기 거부"는 B3, I9 의 TS 쪽과 I11 의 "뒤에 있음 비교 반대로"는 B5, I16 의 "생산자에서 DEPRECATED·RELEASED 없는 룰 제외·룰 ID 순 정렬"(`producersOfActiveRules`)은 B2 가 돈다.

## 설계 이탈

- B7 `set-reg-id-error`: shared `Input` 의 `error` prop 은 testid 를 붙일 수 없어, `Input` 에는 `aria-invalid` 만 주고 오류 문구는 그 아래 `span.form-error-message`(`data-testid="set-reg-id-error"`, `role="alert"`)로 따로 그린다. 오류가 없을 때는 같은 자리에 시안 설명 "컬럼 물리명 규칙을 따르는 전역 이름"을 보인다(오류 문구와 동시에 보이지 않는다).
- B7 상태 조회 조건: `SearchField type="select"` 는 `data-testid` 를 넘기지 않아 `SearchField` 의 자식으로 `Select data-testid="set-search-status"` 를 둔다.
- B7 세트 검사 칸 문구: 거부·경고가 함께 있으면 `거부 N · 경고 N`, 경고만 있으면 `통과 · 경고 N`(§6.11 "뒤에 경고 N" 의 구분자를 ` · ` 로 정했다). 계산은 `types.ts` 의 `setCheckText` 한 곳이다. 상태 배지는 코드 그대로(`INUSE`·`DEPRECATED`, 시안 선택지와 같다) 보인다.
- B1 `RuleSetCheck` 에 편의 메서드 `rejected()`(= severity 가 REJECT)를 더했다. B3 서비스가 거부 여부를 가를 때 쓴다. 레코드 컴포넌트가 아니므로 JSON 에 나가지 않는다.
  `RuleIo` 에 출처 상수 `DICT`·`PROG`·`NONE`, `RuleSetCheck` 에 코드·심각도 상수를 두었다(§6.3 표의 값 그대로).

## B1 — BE 순수 계산 (`RuleIo`·`RuleSetCheck`·`RuleSetAnalyzer`·`RuleSetGuide`·코퍼스)

- 파일: `BL/common/rule/{RuleIo,RuleSetCheck,RuleSetAnalyzer,RuleSetGuide}.java`, `BLT/common/rule/{RuleSetAnalyzerTest,RuleSetGuideTest,RuleSetCorpusTest}.java`,
  `BLR/common/rule/rule-set-corpus.json`(사례 18, 하한 `MIN_CASES = 14`).
- TDD: 시그니처만 둔 스텁(빈 목록 반환)으로 세 클래스를 먼저 돌려 48건 중 46건 실패를 확인한 뒤 구현했다. 구현 뒤 48건 통과, `:lib:test` 전체 통과.
- 코퍼스 기대값은 §6.2·§6.3 의사코드에서 손으로 유도했다(Java 출력을 복사하지 않았다).

### B5 가 따를 구현·코퍼스 규칙 (TS `set-model.ts`·`rule-set-corpus.test.ts` 가 Java 와 같게)

- 이름 비교는 대소문자를 구분한다(정규화하지 않는다). `RuleIoReader` 가 정한 표기를 그대로 쓴다.
- `rules` 에 없거나 `exists=false` 인 룰, `conds`·`results` 가 null 인 룰은 조건·결과가 빈 것으로 본다.
- `io`: 의사코드 그대로다. `users`·`readers`·`by` 는 중복을 거르지 않는다(같은 ID 를 두 번 담는 목록은 서버가 MDM021 로 막는다).
- `deps`: 목록의 모든 ID 가 키다(빈 목록도 넣는다, 같은 ID 가 두 번이면 첫 자리 하나). 값은 ids 순서·중복 없음.
- `checks` 의 ORDER `later` 는 의사코드 그대로 위치 k > i 인 `j != id` 를 모으며 중복을 거르지 않는다.
- CYCLE 판정의 겹침(`rules[id].results ∩ rules[j].conds`)은 j 의 조건을 **출처와 무관하게** 전부 본다(코퍼스 "순환 — 겹침은 상대 조건의 출처와 무관").
- DEPRECATED 룰의 조건도 2단계 검사에 참여한다(코퍼스 "DEPRECATED 룰 — 조건도 2단계에 참여").
- 코퍼스 읽기: `rules` 원소의 빠진 칸은 null·false·빈 목록(`exists` 를 빠뜨리면 없는 룰), `rules` 에 키가 없는 ID 는 없는 룰, `checks` 의 빠진 칸과 null 은 같다.
  사례 이름 필드는 `name` 이고 겹치지 않는다. `deps` 는 키 순서까지 비교한다(Java 러너는 entry 목록으로 비교).

### RuleSetGuide 구현 메모

- 중간 이름의 "`{x}`를 만드는 룰이 없다" 오류는 곧바로 돌려준다(`order`·`ambiguous` 빈 목록).
- `cyc` 는 의사코드대로 방문 중(state 1)인 노드를 만날 때마다 덮어쓴다. 두 룰 순환(`E2S_CYA`↔`E2S_CYB`, 대상 `S_CYA`)의 메시지는 "순환이 있다(E2S_CYA). …" 다.
- `producers` 가 null 을 돌려주면 빈 목록으로 본다. 화면 이식은 없다(서버 전용).
