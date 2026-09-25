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
| I9(TS, B5) | TS CYCLE 문구만 바꿈("결과 변수"→"결과변수", `set-model.ts`) | `rule-set-corpus.test.ts` | 잡힘 |
| I9(TS, B5) | TS 검사 순서 뒤집음(`setChecks` 결과 reverse) | `rule-set-corpus.test.ts` | 잡힘 |
| I9(TS, B5) | ORDER 문구에 뒤 생산자 첫 룰만(`later.join` → `later[0]`) | `rule-set-corpus.test.ts` | 잡힘 |
| I9(TS, B5) | DUP_RESULT 심각도 WARN→REJECT | `rule-set-corpus.test.ts` | 잡힘 |
| I9(TS, B5) | 순환 겹침에서 상대의 DICT 조건 제외 | `rule-set-corpus.test.ts` | 잡힘 |
| I10(TS, B5) | readers 계산에 뒤 룰 포함(결과 행을 목록 전체에서 먼저 만듦) | `set-model.test.ts` "앞 룰이 만든 이름만 readers …" | 잡힘 |
| I10(TS, B5) | 같은 변이 — 코퍼스만 | `rule-set-corpus.test.ts` | 잡힘 |
| I10(TS, B5) | 최종 결과 판정 바꿈(`isFinalResult`: readers 비었음 → by 1개) | `set-model.test.ts` | 잡힘 |
| I11(TS, B5) | `setDeps` 의 DICT 제외 삭제 | `rule-set-corpus.test.ts`("DICT 이름을 만드는 룰" 사례) | 잡힘 |
| I11(TS, B5) | 같은 변이 — `set-model.test.ts` 만(보강: DICT 이름만 만드는 룰 `K` 를 더한 뒤 다시 돌려 잡힘) | `set-model.test.ts` "의존은 DICT 가 아닌 …" | 안 잡힘(보강함) |
| I11(TS, B5) | `setDeps` 의 자기 제외 삭제 | `set-model.test.ts` | 잡힘 |
| I11(TS, B5) | 뒤에 있음 비교 반대로(`laterDeps` `>` → `<`) | `set-model.test.ts` "뒤에 있음은 …" | 잡힘 |
| I8(TS, B5) | 순환을 직접 의존·겹침으로만 봄(`reaches` 삭제) | `set-model.test.ts` 세 룰 고리 | 잡힘 |
| I8(TS, B5) | PROG 통과 삭제(PROG 도 UNKNOWN_INPUT) | `set-model.test.ts` | 잡힘 |
| §6.9 condMarks(B5) | "앞에 없음" 을 붉은 칩 전부에 붙임 | `set-model.test.ts` | 잡힘 |
| §6.9 condMarks(B5) | 앞에서 이미 만든 PROG 도 보통 칩 | `set-model.test.ts` | 잡힘 |
| I21(B6) | 검사 목록을 편집 중 목록 대신 불러온 목록으로 계산(`RuleSetCard` `setChecks(view.set.ruleIds, …)`) | `rule-set-edit-page.test.ts` "▼·▲·✕ 는 서버를 부르지 않고 …" | 잡힘 |
| I21(B6) | 입출력 표를 불러온 목록으로 계산(`setIo(view.set.ruleIds, …)`) | 같은 테스트 | 잡힘 |
| I21(B6) | 드래그(`reorder`)에 서버 호출(view) 추가 | `rule-set-edit-page.test.ts` "행을 끌어 놓으면 …" | 잡힘 |
| I21(B6) | 지침 적용(`applyGuide`)에 서버 호출(view) 추가 | `rule-set-edit-page.test.ts` "구성 지침 — … 적용하면 서버 호출 없이 …" | 잡힘 |
| I21·D9(B6) | 화면 검사에 REJECT 가 있으면 세트 저장 버튼을 막음 | `rule-set-edit-page.test.ts` "화면 검사에 거부가 있어도 …" | 잡힘 |
| I22(받는 쪽, B6) | 받는 경로 `dme/ruleSetEdit` → `dme/ruleSetEdt`(`page.tsx` `COMPONENT_PATH`) | `rule-set-edit-page.test.ts` "넘겨받은 setId 로 view 를 …" | 잡힘 |
| I22(받는 쪽, B6) | 받는 키 `params.setId` → `params.id` | 같은 테스트 | 잡힘 |
| I22(받는 쪽, B6) | 세트를 바꿀 때 dirty 확인 생략(`open` 의 `confirmLeave`) | `rule-set-edit-page.test.ts` "탭이 다시 활성화될 때 …" | 잡힘 |
| I14(화면 쪽, B6) | 폐기를 한 번에(`set-deprecate` 가 곧바로 delete) | `rule-set-edit-page.test.ts` "폐기는 두 단계다 …" | 잡힘 |
| §6.9 편집 게이트(B6) | DEPRECATED·비담당자도 목록 편집 허용(`canEditList` 를 RBAC 만으로) | `rule-set-edit-page.test.ts` "DEPRECATED 세트는 …" | 잡힘 |
| §6.10 룰 링크(B6) | `openRule` 이 다른 룰 ID 로 이동 | `rule-set-edit-page.test.ts` "룰 ID 링크는 …" | 잡힘 |
| D15 화면(B6) | 이미 담은 룰도 목록에 더함 | `rule-set-edit-page.test.ts` "룰 추가 — …" | 잡힘 |
| §2.3 저장 grids(B6) | `grids.rules.rows` 순서를 뒤집음(`api.ts`) | `rule-set-edit-page.test.ts` "세트 저장은 params 에 …" | 잡힘 |
| §6.9 ▲▼(B6) | 동작 칸 값(`actions`) 제거 — ag-grid 가 끝 자리 바뀐 ▲▼ 칸을 다시 그리지 않음 | `rule-set-edit-page.test.ts` "▼·▲·✕ …" | 잡힘 |
| I4(B2) | 자기 결과 이름 제외 삭제(`Names.add` 의 `selfResults` 조건) | `RuleIoReaderTest` "읽는 이름은 …" | 잡힘 |
| I4(B2) | `GRP_COND_AST` 참조 누락 | `RuleIoReaderTest` "읽는 이름은 …" | 잡힘 |
| I4(B2) | Expression 조건 열의 이름을 conds 에 넣음 | `RuleIoReaderTest` "타입과 표시명은 …" | 잡힘 |
| I4(B2) | 결과 열 그룹에서 `varName` 도 results 에 넣음 | `RuleIoReaderTest` "타입과 표시명은 …" | 잡힘 |
| I5(B2) | EvalEx 상수 필터 삭제 | `RuleIoReaderTest` "읽는 이름은 …"(`IF(C_IN = NULL, TRUE, PI)`) | 잡힘 |
| I6(B2) | 선언(DECLARED)을 컬럼 사전보다 먼저 봄(resolver typeSource 순서) | `RuleIoReaderTest` "타입과 표시명은 …"(사전에 있고 DATA_TYPE 도 선언한 `COIL_THK`) | 잡힘 |
| I7(B2) | 적용 시작이 지난 RELEASED 가운데 VER 최대로 고름 | `RuleIoReaderTest` "지금 RELEASED 는 …" | 잡힘 |
| I16(B2) | 생산자 쿼리에서 DEPRECATED 조건 삭제 | `RuleIoReaderTest` "생산자는 …" | 잡힘 |
| I16(B2) | 생산자 정렬 뒤집음(룰 ID 내림차순) | `RuleIoReaderTest` "생산자는 …" | 잡힘 |
| I16(B2) | 생산자 쿼리의 최신 RELEASED 조건 삭제(예전 RELEASED 결과 포함) | `RuleIoReaderTest` "생산자는 …" | 잡힘 |

B7 변이는 작업 트리에서만 넣고 규칙마다 `git checkout -- <파일>` 로 되돌렸다(`trap`). 대상 테스트 한 파일을 `vitest run … --bail=1` 로 돌렸다.

B1 변이는 스크립트 하나(변이 넣기 → `:lib:test --fail-fast --tests <대상 클래스>` → `git checkout --` 로 되돌리기)를 `heavy.sh` 로 감싸 두 번(분석기·지침) 돌렸다. 모든 변이는 컴파일되는 형태다.
B1 담당 범위 밖: I8 의 "REJECT 가 있으면 저장·되살리기 거부"는 B3, I9 의 TS 쪽과 I11 의 "뒤에 있음 비교 반대로"는 B5, I16 의 "생산자에서 DEPRECATED·RELEASED 없는 룰 제외·룰 ID 순 정렬"(`producersOfActiveRules`)은 B2 가 돈다.

B2 변이는 python 스크립트 하나(변이 넣기 → `:api:test --fail-fast --tests RuleIoReaderTest` → scratchpad 사본으로 되돌리기, 시그널·`finally` 에서도 되돌림)를 `heavy.sh` 로 감싸 두 번(M1~M5, M6~M10) 돌렸다.
`RuleQueries.java` 의 추가분이 아직 커밋 전이라 `git checkout --` 대신 사본 복원을 썼다. 모든 변이는 컴파일되는 형태이고, 끝난 뒤 두 파일이 사본과 같음을 `cmp` 로 확인했다.

## 설계 이탈

- B7 `set-reg-id-error`: shared `Input` 의 `error` prop 은 testid 를 붙일 수 없어, `Input` 에는 `aria-invalid` 만 주고 오류 문구는 그 아래 `span.form-error-message`(`data-testid="set-reg-id-error"`, `role="alert"`)로 따로 그린다. 오류가 없을 때는 같은 자리에 시안 설명 "컬럼 물리명 규칙을 따르는 전역 이름"을 보인다(오류 문구와 동시에 보이지 않는다).
- B7 상태 조회 조건: `SearchField type="select"` 는 `data-testid` 를 넘기지 않아 `SearchField` 의 자식으로 `Select data-testid="set-search-status"` 를 둔다.
- B7 세트 검사 칸 문구: 거부·경고가 함께 있으면 `거부 N · 경고 N`, 경고만 있으면 `통과 · 경고 N`(§6.11 "뒤에 경고 N" 의 구분자를 ` · ` 로 정했다). 계산은 `types.ts` 의 `setCheckText` 한 곳이다. 상태 배지는 코드 그대로(`INUSE`·`DEPRECATED`, 시안 선택지와 같다) 보인다.
- B1 `RuleSetCheck` 에 편의 메서드 `rejected()`(= severity 가 REJECT)를 더했다. B3 서비스가 거부 여부를 가를 때 쓴다. 레코드 컴포넌트가 아니므로 JSON 에 나가지 않는다.
  `RuleIo` 에 출처 상수 `DICT`·`PROG`·`NONE`, `RuleSetCheck` 에 코드·심각도 상수를 두었다(§6.3 표의 값 그대로).
- B5 `set-model.ts` 에 설계 목록 밖 공개 함수 `isFinalResult(row)`(Java `ResultRow.finalResult()` 짝)와 타입 `CondMark` 를 더했다. 설계가 모양을 정하지 않은 두 함수는
  `condMarks` 가 ids 와 같은 자리의 `CondMark[][]`, `laterDeps` 가 ids 를 키로 삼는 `Record<룰 ID, 뒤에 있는 의존 룰[]>` 을 돌려주도록 정했다.
- B5 `types.ts` 에 §2.3 의 열 타입 밖으로 search 응답 `RuleSetPick`·`RuleSetPickResult`·`RuleSetRuleSearchResult`, view 의 `set` 칸 `RuleSetHeader`, 입력 맵 `RuleIoMap` 을 더했다(B6 가 이 파일을 고치지 않게).
- B6 거부 배지: `@/shell` `badgeStyle` 에 위험 톤이 없어 `RuleSetCard` 가 `badgeStyle("neutral")` 모양에 `var(--color-danger)`·`var(--color-danger-soft)` 토큰을 입혀 쓴다(셸은 B6 범위 밖이라 고치지 않았다).
  "앞에 없음"·"뒤에 있음"·"덮어씀"·"고르기" 배지는 `warning` 톤이다.
- B6 목록 편집 게이트: 세트명·설명 입력, ▲▼✕·드래그, 룰 추가, 지침 적용은 `canEditList` = `view.editable && status === INUSE && canDo("save")` 한 값으로 켠다(§6.9 는
  "editable=false 거나 DEPRECATED 면 드래그·▲▼✕ 가 없다"만 정했다 — 저장 권한 없이 목록을 바꿔도 저장할 수 없으므로 RBAC 도 함께 본다). 세트 저장·폐기·되살리기는 §6.9 그대로.
- B6 파일 구성: 카드 틀은 08-02 의 `ruleEdit/cards/CardFrame`(`CardFrame`·`MutedText`)을 가져다 쓴다(고치지 않음). 타입 표시 `typeText` 는 `SetIoTables.tsx` 에 둔다.
  세트 고르기 후보·현재 세트 표시는 `ID · 세트명`(`set-edit-current`), 룰 후보는 `ID · 룰명 · 상태` 다. 테스트·e2e 용 testid 를 더했다: 입출력 표 행 `set-io-input-{이름}`·`set-io-result-{이름}`,
  입출력 표의 변수 링크 `set-var-link-{이름}`(DICT 입력 → 컬럼 화면, 결과 → 만드는 첫 룰), 머리 `set-card-id`·`set-row-version`, 빈 목록 `set-rules-empty`, 추가 알림 `set-rule-add-notice`, 후보 묶음 `set-rule-cands`·`set-pick-list`.
- B6 그리드 칸 값: 조건 변수·결과 변수·의존 룰 칸은 배열 대신 문자열 서명(JSON)을 칸 값으로 싣고 그리는 데는 행의 `condChips`·`resultNames`·`depCells` 를 쓴다. 배열 값은 ag-grid 가
  object 로 추론해 오류 #48 을 내고, ag-grid 는 값이 바뀐 칸만 다시 그리므로 ▲▼ 동작 칸에도 끝 자리 값(`actions`)을 싣는다.
- B6 메시지: 저장·폐기·되살리기 결과와 서버 거부(`meta.message`)·MDM001 안내는 모두 `set-message` 한 줄에 보인다(ErrorModal 은 view·찾기 실패에만). 폐기 확인 단계에서는 같은 자리에 폐기 경고 문구가 보인다.
  거부 때는 view 를 다시 불러오지 않고 편집 중 목록을 둔다. 되살리기 성공 문구에도 서버가 준 WARN 을 붙인다.
- B2 Expression 셀 조회: §6.1-5 는 `RuleCellsCodec.parse(...).get(String.valueOf(varId))` 라고 적었지만 `parse` 는 `Map<Integer, …>` 를 돌려주므로 `get(v.getVarId())`(정수 키)로 읽는다. 문자열 키로는 한 번도 맞지 않아 셀 참조가 조용히 빠진다.
- B2 `RuleQueries` 추가는 하나(`latestReleasedResultVarsOfActiveRules`)다. 구현 단위 표의 "조회 두 개" 가운데 나머지 하나가 맡을 `hitPolicy` 는 기존 `versionsOf(ids)` 로 한 번에 읽는다(기존 메서드는 고치지 않았다).
- B2 PROG 판정·이름 비교: 같은 이름의 조건 열은 대소문자를 무시해 찾는다(conds 중복 제거가 대소문자 무시라서). 컬럼 사전(DICT) 판정은 `findByPhysName(name)` 정확 일치이고, 한 번의 `read` 안에서 이름마다 한 번만 조회한다.

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

## B5 — FE 세트 계산 TS 이식 (`set-model.ts`·타입·코퍼스 Vitest 러너)

- 파일: `M/pages/dme/ruleSetEdit/{types,set-model}.ts`, `M/tests/dme/ruleSetEdit/{set-model,rule-set-corpus}.test.ts`, `M/tests/helpers/engine-paths.ts`(`RULE_SET_CORPUS_PATH` 한 줄).
- TDD: 시그니처만 둔 스텁(빈 값 반환)으로 두 파일을 먼저 돌려 32건 중 29건 실패를 확인한 뒤 구현했다(스텁에서 통과한 셋은 빈 목록 입출력 표·코퍼스 version/하한·사본 없음). 구현 뒤 32건 통과,
  `vitest related <바꾼 파일> --run` 8파일 286건 통과, m-mdm lint(`tsc --noEmit`) 통과.
- 이식 기준은 Java `RuleSetAnalyzer`(d21125f) 코드다 — 1단계는 ids 를 중복 제거 없이 훑고, `setDeps` 만 첫 자리 하나를 키로 둔다. `reaches` 는 시작점을 방문 집합에 먼저 넣고 `b === target` 을 방문 여부보다 먼저 본다.
  UNKNOWN_INPUT 은 `source !== "PROG"`(source 가 null 인 조건도 거부)다. 비어 있는 칸은 null 로 낸다(코퍼스 러너는 기대값만 `?? null` 로 채우고 실제 값은 그대로 `toStrictEqual`).
- 코퍼스 러너: Java 러너와 같은 단언(version 1·하한 `MIN_CASES = 14`·name 중복 없음·빠진 칸 채우기)에 더해, 08-02 선례대로 "m-mdm 안에 코퍼스 사본이 없다" 를 본다. `deps` 는 `Object.entries` 로 키 순서까지 비교한다.
- 변이 검증: 원본을 scratchpad 로 복사해 두고, 변이 넣기 → 대상 한 파일 `vitest run … --bail=1` → 사본으로 되돌리기를 규칙마다 반복하는 스크립트 하나를 `heavy.sh` 로 감싸 돌렸다(SIGTERM·예외에도 되돌림).
  보강한 한 건(I11 DICT 제외, `set-model.test.ts`)은 테스트를 고친 뒤 그 변이 하나만 다시 돌려 잡힘을 확인하고 되돌렸다.

### B6 가 쓰는 공개 함수·타입

- `setIo(ids, rules)`·`setDeps(ids, rules)`·`setChecks(ids, rules)`: 서버와 같은 결과. `rules` 는 `RuleIoMap`(= `Record<룰 ID, RuleIo | undefined>`, 없는 키는 없는 룰).
- `isFinalResult(row)`: 결과 표의 최종/중간 구분(readers 가 비면 최종).
- `condMarks(ids, rules)`: ids 와 같은 자리의 `CondMark[]` 배열. `red` = 붉은 칩, `missingBefore` = "앞에 없음" 배지. 시안 H:2196 그대로 앞 룰이 이미 만든 이름도 DICT 가 아니면 붉은 칩(배지 없음)이다.
- `laterDeps(ids, setDeps(...))`: 룰 ID → 목록에서 그 룰보다 뒤에 있는 의존 룰(= "뒤에 있음" 배지 `set-dep-later-{id}-{dep}` 를 달 대상).
- `types.ts` 에 §6.5 view·save·status 응답과 search 세 갈래(SET `RuleSetPickResult`·RULE `RuleSetRuleSearchResult`·GUIDE `GuideResult`) 모양을 모두 두었다 — B6 는 이 파일을 고치지 않고 쓴다.

## B2 — BE DB 읽기 (`RuleIoReader`·`RuleQueries` 추가·`DmeTestSupport.ruleSet`)

- 파일: `BL/common/rule/RuleIoReader.java`(새), `BL/common/rule/RuleQueries.java`(`latestReleasedResultVarsOfActiveRules()` 추가만), `BAT/dme/DmeTestSupport.java`(`ruleSet(...)` 추가만),
  `BAT/common/rule/RuleIoReaderTest.java`(새, 9건).
- TDD: `read`·`producersOfActiveRules` 가 빈 맵, 새 쿼리가 `List.of()` 인 스텁으로 먼저 돌려 9건 중 8건 실패(나머지 1건은 세트 헬퍼 확인)를 본 뒤 구현했다.
  구현 뒤 `RuleIoReaderTest` 9건·`RuleVarTypeResolverTest` 14건·`MdmRuleContractOnlyArchitectureTest` 통과.

### B3·B4 가 쓸 것

- `RuleIoReader.read(ids)`: 입력 순서를 지킨 `LinkedHashMap`(같은 ID 는 첫 자리 하나, null ID 는 건너뜀). 없는 룰 `exists=false`·나머지 null·빈 목록,
  RELEASED 없는 룰은 룰명·종류·상태만 싣고 `releasedVer`·`hitPolicy` null·빈 목록. DEPRECATED 룰도 계산한다. 목록은 불변 리스트다.
- 이름 표기는 처음 나온 표기 그대로다(대소문자를 정규화하지 않는다). 결과 이름은 결과 열 그룹이면 `RES_GRP`, 아니면 `VAR_NAME`(같은 이름은 한 번).
- 타입: DICT 는 컬럼의 도메인(표시명 = 컬럼 중간명, 없으면 긴 이름), PROG 는 선언한 조건 열, 결과는 그 결과 열(그룹이면 첫 열)을 `RuleVarTypeResolver` 로 푼다. NONE 은 표시명·타입이 null.
  결과의 `source` 는 null.
- `producersOfActiveRules()`: 결과 이름 → 룰 ID 목록(룰 ID 순, 중복 없음). 그룹 열은 그룹 이름만 키가 되고 열의 `VAR_NAME` 은 키가 아니다.
  `RuleSetGuide.suggest(target, n -> producers.getOrDefault(n, List.of()), io)` 모양으로 넘기면 된다.
- 조회 경로에 쓰기가 없다. DICT 이름의 타입 해석용 합성 `MdmRuleVar` 는 영속화하지 않고, `vars()` 로 읽은 엔티티는 바꾸지 않는다(B3 가 트랜잭션 안에서 불러도 flush 로 DB 가 바뀌지 않는다).
- `DmeTestSupport.ruleSet(jdbc, id, name, ruleIdsJson, status, rowVersion)`: 감사 칼럼을 `'fixture'`·`'2026-01-01 00:00:00'`, `VER=0` 으로 채운다 — 쓰기 뒤 `U_USR_ID`(예: `kim`)·`VER+1` 변화를 단언할 수 있다.

## B6 — FE `ruleSetEdit` 화면 (세트 고르기·룰 세트 카드·구성 지침 카드·api)

- 파일: `M/pages/dme/ruleSetEdit/{api,links,page}.ts(x)`, `state/useRuleSetEdit.ts`, `cards/{RuleSetCard,RuleListGrid,SetIoTables,GuideCard}.tsx`,
  `M/tests/dme/ruleSetEdit/rule-set-edit-page.test.ts`(17건), `M/tsup.config.ts`(ruleSetEdit 한 줄), `src/frontend/m-mcm/lib/generated/page-registry.ts`(생성기로 재생성, `dme/ruleSetEdit` 한 줄).
  B5 의 `set-model.ts`·`types.ts` 는 고치지 않고 그대로 썼다(어긋난 곳 없음).
- TDD: 레이아웃만 그리는 `page.tsx` 스텁으로 새 테스트 17건 모두 실패를 확인한 뒤 구현했다. 구현 뒤 17건 통과, `vitest related <바꾼 파일> --run` 1파일 17건 통과,
  m-mdm lint(`tsc --noEmit`) 통과, mantine·aggrid audit 두 명령 모두 `pages/dme/ruleSetEdit` 10파일 의심 0건, `heavy.sh pnpm build:libs` 가 새 entry(`dist/pages/dme/ruleSetEdit/page.js`)까지 빌드했다.
- 드래그는 `@dk-oasis/shared/grid` 를 부분 모의해 룰 목록 그리드(rowKey `ruleId`)의 props 를 잡고 `onRowOrderChange` 를 직접 불러 모사한다(실제 그리드는 그대로 그린다).
  브라우저의 실제 끌어 놓기는 B8 e2e E3 가 본다.
- 변이 검증: 원본을 scratchpad 로 복사해 두고 변이 넣기 → 대상 한 파일 `vitest run … --bail=1` → 사본으로 되돌리기를 규칙마다 반복하는 스크립트를 `heavy.sh` 로 감싸 두 번(7건씩) 돌렸다(예외·SIGTERM 에도 되돌림).
  14건 모두 잡혔다. 끝난 뒤 `git status` 로 작업 트리가 커밋과 같음을 확인했다.
- B8 에 넘길 것: e2e 가 쓸 testid 는 §6.9 그대로이고 위 「설계 이탈」 B6 항목의 것이 더 있다. 현재 세트 표시(`set-edit-current`)는 `ID · 세트명` 이라 e2e 는 `toContainText` 로 본다.
  서버 거부 문구(E4)와 MDM001 안내(E8)는 `set-message` 에, MDM001 의 "다시 불러오기" 버튼은 카드 버튼 줄에 있다.
