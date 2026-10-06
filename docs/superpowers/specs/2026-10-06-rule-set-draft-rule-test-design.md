# 룰 세트 디버거·테스트 케이스 — 내 DRAFT 룰로 시험하기 설계

- 작성: 2026-10-06, 레인 draft-test(조정 세션 dmes-standard-90, 지시 draft-test-1)
- 상태: 설계 승인 대기
- 결정 번호: docs/mdm/decisions.md D-156(구현 단계에서 기록)
- 선행 문서: 2026-09-30-rule-set-flow-editor-debugger-design.md(디버거), 2026-10-01-rule-set-flow-phase4-design.md(고친 값),
  2026-10-01-rule-set-flow-subset-call-design.md(하위 세트), D-144 2단계(세트 버전 판정 시각 해석)

## 1. 목적

룰 세트 편집 화면의 디버거와 테스트 케이스 일괄 실행은 지금 룰을 **판정 시각에 적용되는 RELEASED 버전**으로만 돌린다.
룰과 세트를 함께 고치는 사람은 고친 룰(DRAFT)을 먼저 확정하지 않으면 세트에서 그 룰을 시험할 수 없다.
이 설계는 디버거·케이스 일괄 실행에 「룰 버전」 선택을 더해, 내가 고치고 있는 룰 DRAFT·하위 세트 DRAFT 로 세트를 미리 돌려 볼 수 있게 한다.

성공 기준:

1. 「내 DRAFT 우선」 으로 돌리면 내가 소유한 DRAFT 가 있는 룰·하위 세트는 그 DRAFT 로, 나머지는 지금처럼 판정 시각 RELEASED 로 실행된다.
2. 실행 기록에서 어떤 룰·하위 세트가 DRAFT 로 돌았는지 보인다.
3. 「적용 중(기본)」 과 운영 경로(OASIS `ruleSetRunner.execute`)·확정 검사의 결과는 지금과 한 글자도 다르지 않다.

## 2. 범위

### 2.1 안

- 서버: 정의 조회기(`StoredDefinitionLookup`)의 버전 선택 규칙, 실행기 세션(`RuleSetRunner.session`)의 모드 인자,
  디버거 요청·응답 칸(`RuleSetSimulateRequest`·`RuleSetSimulateResult`), 부른 세트 흐름(`RuleSetCalledFlows`),
  확정 검사의 케이스 실패 문구 안내(`RuleSetConfirmReport`, 소유 밖 `RuleSetConfirmChecks` 한 곳 — §6).
- 화면: 디버거 입력 폼의 「룰 버전」 선택 칸, 보는 사람별 기억, 실행 기록의 DRAFT 표시, 검사 기준 안내,
  케이스 일괄 실행·실행 비교·최근 입력과의 관계.
- 문서: D-156, 기능설계서 `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`, BPMN 헤더 documentation 문구.

### 2.2 밖

- 엔진 모듈(`maru-mdm-engine`)·엔진 계약(`RunTrace`·`DefinitionLookup` 타입과 스키마) 변경. DRAFT 구분은 응답 DTO 의 별도 칸으로만 싣는다.
- 화면 검사(`RuleSetAnalyzer`·`RuleIoReader`·`set-model.ts`)를 DRAFT 기준으로 바꾸는 일. 이번에는 안내만 보인다(§7.4). 후속 F1.
- 확정 동작 자체(차단·경고 확인 절차·확정 시 실행 버전). 확정 검사는 계속 RELEASED 로 돌린다.
- 운영 경로(OASIS `ruleSetRunner.execute`)·`RuleSetRunner.run`·`engine()`. 모드 인자를 받지 않는다.
- 남의 DRAFT, 그리고 승인 흐름에 올라간 버전(REQUESTED·APPROVED). 고르지 않는다(§3.2).
- `@dk-oasis/shared` 기존 컴포넌트 변경.

## 3. 모드와 버전 선택 규칙

### 3.1 모드

| 모드 값(요청 `ruleVersions`) | 화면 이름 | 뜻 |
|---|---|---|
| `RELEASED`(기본, 칸 없음·빈 값도 이것) | 적용 중(기본) | 지금과 같다. 룰·하위 세트 모두 판정 시각 RELEASED |
| `MY_DRAFT` | 내 DRAFT 우선 | 룰·하위 세트마다 내 DRAFT 가 있으면 그것, 없으면 판정 시각 RELEASED |

그 밖의 값은 `INVALID_VALUE`("룰 버전은 RELEASED 또는 MY_DRAFT 여야 합니다: {값}")로 거부하고 실행하지 않는다.

### 3.2 「내 DRAFT」 의 정의

- 상태가 정확히 `DRAFT` 이고 `OWNER_ID` 가 현재 사용자(`MdmCurrentUser.userId()`)와 같은 버전 행이다.
  판정식은 기존 `RuleSetEditService.isMyDraft` 와 같다(`"DRAFT".equals(status) && me != null && me.equals(ownerId)`).
- `REQUESTED`·`APPROVED` 는 고르지 않는다. `RuleVersions.PENDING_STATUSES` 에 세 값이 함께 있지만 이 기능은 DRAFT 하나만 본다.
  승인을 요청한 뒤에는 그 버전이 더 이상 「내가 고치는 중」 이 아니고, 승인 요청 회수 전에는 내용이 바뀌지 않으므로 확정을 기다린다(후속 F3 후보).
- 룰·세트당 미적용 버전은 최대 1개다(`DefaultVersionWriteGuard`·`VersionPreconditions`). 그래도 여러 행이 걸리면 VER 가 가장 큰 것을 고른다
  (`RuleQueries.versions` 가 VER 내림차순이므로 첫 행).
- 사용자 ID 는 요청 칸으로 받지 않는다. 서버가 `MdmCurrentUser` 에서만 얻는다.
  `MY_DRAFT` 인데 사용자 ID 가 null·빈 글자이면 `RELEASED` 로 돌리고, 응답 경고에 `DRAFT_USER_UNKNOWN`("로그인 사용자를 알 수 없어 적용 중 버전으로 실행했다")을 싣는다.

### 3.3 선택 규칙과 판정 시각

`MY_DRAFT` 에서 룰 R(또는 하위 세트 S)을 판정 시각 t 로 물으면:

1. R 에 내 DRAFT 가 있으면 그 DRAFT. **판정 시각 t 와 무관하다.** DRAFT 는 적용 기간(`APPLY_FROM`·`APPLY_TO`)이 없으므로 t 와 견줄 수 없다.
2. 없으면 지금처럼 `RuleVersions.currentReleased(versions, t)`.
3. 둘 다 없으면 지금처럼 빈 값(엔진이 `RULE_NOT_FOUND`·`SET_NOT_FOUND` 위반을 기록한다).

경계 사례:

| 사례 | `RELEASED` | `MY_DRAFT` |
|---|---|---|
| RELEASED 없이 내 DRAFT 만 있는 새 룰 | 룰 없음 위반 | DRAFT 로 실행 |
| 내 DRAFT + 판정 시각 RELEASED | RELEASED | DRAFT |
| 남의 DRAFT + 판정 시각 RELEASED | RELEASED | RELEASED |
| 판정 시각이 모든 RELEASED 의 적용 시작보다 이른데 내 DRAFT 있음 | 룰 없음 위반 | DRAFT(시각과 무관) |
| 내가 승인 요청한 버전(REQUESTED) | RELEASED | RELEASED |
| 케이스마다 판정 시각이 다름 | 시각마다 RELEASED | DRAFT 가 있는 룰은 모든 케이스에서 같은 DRAFT, 나머지는 케이스 시각마다 RELEASED |
| 룰 헤더가 폐기(DEPRECATED) | 지금처럼 실행 + 폐기 경고 | 같다(DRAFT 를 골라도 폐기 경고는 헤더 기준 그대로) |

판정 시각은 DRAFT 를 고를 때 쓰이지 않을 뿐, 식 안의 `EVAL_TS` 값과 DRAFT 가 없는 룰·하위 세트의 버전 선택에는 지금처럼 쓰인다.
DRAFT 정의는 `applyFrom`·`applyTo` 가 null 인 채로 엔진에 넘어간다. 엔진은 이 두 칸을 판정 시각과 견주지 않고
(`CellTextGenerator`·`MdmRuleEngine.RuleView` 가 그대로 옮길 뿐이다) 룰 값 시험(`RuleValueTestService`)이 이미 같은 방식으로 DRAFT 를 돌린다.

### 3.4 하위 세트

- 하위 세트(SET 노드)도 같은 규칙으로 고른다. 내 DRAFT 세트가 있으면 그 버전의 흐름(`FLOW_JSON`, 없으면 `RULE_IDS` 한 줄 흐름)으로 실행한다.
- 세트 상태는 지금처럼 부모의 계산 상태(`RuleVersions.effectiveStatus`)다. 한 번도 확정하지 않은 세트는 `CREATED` 이고 엔진 `SetStatus.CREATED` 로 넘어간다.
  폐기 세트는 DRAFT 를 골라도 엔진이 지금처럼 거부한다.
- 하위 세트 안의 룰도 같은 조회기를 쓰므로 같은 모드로 고른다.
- 최상위 흐름은 화면이 보낸 저장 전 흐름이다(지금과 같다). 하위 세트가 다시 편집 중인 세트를 부르면 그 호출은 **저장된** 내 DRAFT 행을 쓴다.
  화면의 저장 전 흐름은 최상위에만 쓰인다. 순환 호출은 지금처럼 엔진이 막는다.

## 4. 서버 변경

### 4.1 버전 선택 모드 — `RuleVersionPick`(새 값 객체, `common/rule/definition`)

```java
/** 정의 조회기의 버전 선택 모드 — RELEASED 는 지금 동작, MY_DRAFT 는 owner 의 DRAFT 우선. */
public record RuleVersionPick(String draftOwner) {
    public static final RuleVersionPick RELEASED = new RuleVersionPick(null);
    public static RuleVersionPick myDraft(String userId) { ... }   // userId 가 null·빈 글자면 RELEASED
    public boolean draftFirst() { return draftOwner != null; }
    <T extends VersionedRow> Optional<T> pick(List<T> versions, Function<T, String> owner, LocalDateTime at) { ... } // §3.3 규칙
}
```

`pick` 은 룰(`MdmRuleVer`)과 세트(`MdmRuleSetVer`)가 같이 쓴다. `VersionedRow` 에는 `getOwnerId()` 가 없으므로
(`getVer`·`getStatus`·`getApplyFrom`·`getApplyTo` 뿐) 소유자는 `MdmRuleVer::getOwnerId`·`MdmRuleSetVer::getOwnerId` 를 인자로 받는다.
공통 인터페이스(`VersionedRow`)는 바꾸지 않는다.

### 4.2 정의 조회기 — `StoredDefinitionLookup`

- 생성자에 `RuleVersionPick pick` 을 더한다. 지금 생성자(인자 5개)는 `RuleVersionPick.RELEASED` 로 위임해 남긴다(운영 `engine()`·다른 호출자 무변경).
- 버전 선택 지점 세 곳을 `pick.pick(versions, now)` 하나로 모은다: `load`(:207), `prefetch`(:117), `loadSet`(:167).
  `prefetch` 도 같은 함수를 써야 미리 읽은 (룰, VER) 와 `load` 가 고른 VER 가 어긋나지 않는다.
- **캐시 키는 바꾸지 않는다.** 모드는 인스턴스마다 고정이고(세션 하나에 모드 하나), 조회기는 빈이 아니라 세션마다 새로 만든다.
  그래서 `ruleId@evalTs`·`setId@evalTs` 키 안에서 모드가 섞일 일이 없다. `definitions`·`prefetched` 는 `ruleId@ver` 라 원래 모드와 무관하다.
- **DRAFT 사용 기록**: `load`·`loadSet` 이 DRAFT 행을 골랐을 때만 `draftRules`(룰 ID → VER)·`draftSets`(세트 ID → 버전 행)에 남긴다.
  `prefetch` 에서는 남기지 않는다. `prefetch` 는 실제로 지나지 않는 갈래의 룰도 읽기 때문이다.
  공개 읽기: `Map<String, BigDecimal> draftRules()`, `Map<String, MdmRuleSetVer> draftSets()`(둘 다 넣은 순서, 읽기 전용 사본).
- **내 DRAFT 가 깨졌을 때**: DRAFT 를 골라 정의를 읽다가 `StoredDefinitionException` 이 나면,
  메시지 앞에 `"룰 {R} 의 내 DRAFT 버전 {x.xxx}: "`(세트는 `"세트 {S} 의 내 DRAFT 버전 {x.xxx}: "`)를 붙여 다시 던진다.
  RELEASED 쪽 손상 문구는 바꾸지 않는다. 캐시하지 않는 규칙도 지금과 같다.

### 4.3 실행기 — `RuleSetRunner`

- `session(RuleVersionPick pick)` 을 더한다. 인자 없는 `session()` 은 `session(RuleVersionPick.RELEASED)` 로 남긴다.
  확정 검사(`RuleSetConfirmChecks.cases`)·운영 `execute`·`run`·`engine()` 은 손대지 않는다.
- `Session` 에 `draftRules()`·`draftSets()` 위임 읽기를 더한다.
- `traceDefinition` 주석의 "룰은 판정 시각의 RELEASED" 는 "세션 모드를 따른다(확정 검사는 RELEASED 세션)" 로 고친다.

### 4.4 요청 칸 — `RuleSetSimulateRequest`

- `String ruleVersions` 를 더한다(`RELEASED`·`MY_DRAFT`, 비면 `RELEASED`). 단건 실행·케이스 일괄 실행(`runCases=true`) 모두 읽는다.
- BPMN(`ruleSetEdit.bpmn`)은 DTO 를 직접 바인딩하므로 바꿀 필요가 없다. 헤더 documentation(:13) 문구에 칸 설명만 더한다.

### 4.5 응답 칸 — `RuleSetSimulateResult`

```json
"draftVersions": {
  "rules": { "R_THK_GRADE": "1.003" },
  "sets":  { "SET_SUB_A": "2.001" }
}
```

- `RELEASED` 모드이거나 DRAFT 를 하나도 안 썼으면 `{ "rules": {}, "sets": {} }`. 키는 늘 둔다(화면이 null 검사를 하지 않게).
- VER 는 `VersionNumbers.plain`(scale 3 글자)이다. 화면은 노드의 `ver` 를 `normVer` 로 맞춰 이 값과 같을 때만 DRAFT 로 표시한다.
  VER 는 룰마다 유일하므로 (룰 ID, VER) 일치가 곧 「이 노드는 DRAFT 로 돌았다」 이다.
- 단건 실행은 그 실행의 조회기 기록, 케이스 일괄 실행은 **일괄 실행 전체에 한 묶음**이다(세션 하나를 같이 쓰고, DRAFT 선택은 판정 시각과 무관해
  케이스마다 달라지지 않는다). 케이스별 칸은 두지 않는다.
- 응답 칸 `ruleVersions`(실제로 쓴 모드, `DRAFT_USER_UNKNOWN` 이면 `RELEASED`)를 함께 싣는다. 화면은 기록 머리 표시에 이 값을 쓴다.

### 4.6 디버거 서비스 — `RuleSetEditService.simulate`·`runCases`

- 요청 `ruleVersions` 를 풀어 `RuleVersionPick` 을 만든다(`MY_DRAFT` → `RuleVersionPick.myDraft(currentUser.userId())`).
- `runner.session(pick)` 으로 실행하고, 응답에 `draftVersions`·`ruleVersions` 를 싣는다.
- 모드를 알리는 경고는 따로 만들지 않는다. 화면이 응답 `ruleVersions`·`draftVersions` 로 안내를 그리기 때문이다.
  새 경고는 `DRAFT_USER_UNKNOWN`(§3.2) 하나이고, 경고 목록 맨 앞에 싣는다.
- `StoredDefinitionException` → MDM026 변환은 지금과 같다. 문구는 §4.2 머리말이 붙은 메시지가 그대로 이어진다.

### 4.7 부른 세트 흐름 — `RuleSetCalledFlows`

- 지금은 부른 세트마다 `currentReleased` 로 따로 고르고, RELEASED 가 없으면 뺀다. `MY_DRAFT` 에서 DRAFT 하위 세트로 들어가면
  실행과 다른 흐름이 그려지거나(내 DRAFT 대신 RELEASED), 새 DRAFT 세트에는 들어갈 수 없다.
- `of(RunTrace trace, Map<String, MdmRuleSetVer> drafts)` 로 바꾼다. 부른 세트 ID 가 `drafts` 에 있으면 그 버전 행을 쓰고, 없으면 지금처럼 고른다.
  `of(trace)` 는 빈 맵으로 위임해 남긴다. 원장 읽기 횟수(`RuleSetEditQueryCountTest`)는 늘지 않는다(DRAFT 행은 조회기가 이미 읽었다).
- 한계: 각 세트의 `rules`(노드 제목용 룰 입출력)는 `RuleIoReader.readAt`(판정 시각 RELEASED)로 계산한다. `RuleIoReader` 는 이번 범위 밖이므로
  **DRAFT 에만 있는 룰은 하위 흐름 노드 제목이 룰 ID 로만 보이고**, DRAFT 에서 입출력이 바뀐 룰은 제목이 RELEASED 기준이다. 후속 F1 에 묶는다.

## 5. 결과가 바뀌지 않음을 지키는 선

- 모드 인자 없는 경로(`session()`·`run`·`execute`·`engine()`·확정 검사)는 `RuleVersionPick.RELEASED` 로만 돈다.
- 회귀 시험(§9.1-6): 같은 원장(내 DRAFT 가 있는 룰 포함)에서 `RELEASED` 디버거 실행·확정 검사 케이스·OASIS `execute` 가 DRAFT 를 읽지 않음을 확인한다.

## 6. 확정 검사 안내

- 확정 검사는 RELEASED 그대로 돈다(동작 무변경).
- 케이스가 실패(`CASE_FAILED`)하거나 일괄 실행이 끝나지 못했고(`CASE_RUN_FAILED`), 확정하려는 세트 버전의 흐름 룰 가운데
  **세트 DRAFT 소유자의 DRAFT 가 있는 룰**이 있으면, 실패 문구 뒤에 안내를 붙인다:
  `" — 룰 R1·R2 에 확정하지 않은 DRAFT 가 있다. 확정 검사는 적용 중 버전으로 돌리므로, 그 DRAFT 로 시험해 통과했다면 룰 DRAFT 를 먼저 확정한다"`.
- **새 이슈(코드)를 만들지 않는다.** 확정 서비스는 WARNING 이 하나라도 있으면 경고 확인(`warningsAcknowledged`)을 요구한다
  (`DefaultVersionStateService`:103). 새 WARNING 을 더하면 확정 절차가 바뀌므로 기존 ERROR 문구만 늘린다. 이슈 수·코드·심각도는 그대로다.
- 「내」 = **확정하려는 세트 DRAFT 버전의 `OWNER_ID`**. 확정 검사를 부르는 사람은 승인자일 수 있으므로 현재 사용자 대신, 디버거에서
  「내 DRAFT 우선」 으로 시험했을 사람인 세트 DRAFT 작성자를 기준으로 한다. 확정 대상이 DRAFT 가 아닌 상태(REQUESTED·APPROVED)여도 행의 `OWNER_ID` 를 쓴다.
- 대상 룰은 그 세트 버전의 흐름 룰(`RuleSetFlowJson.ruleIds`, 한 줄 세트는 `RULE_IDS`)뿐이다. 하위 세트 안의 룰·하위 세트 DRAFT 는 보지 않는다(후속 F2).
- 구현: `RuleSetConfirmChecks.report` 가 이미 읽는 `ruleQueries.versionsOf(ids)`(경계 시각 계산, `boundaries`)와 같은 조회로 DRAFT 룰 ID 목록을 만들어
  `RuleSetConfirmReport.report(..., List<String> ownerDraftRules)` 로 넘긴다. **`RuleSetConfirmChecks` 는 이 레인 소유 밖이다** — 바꾸는 곳은 목록 계산과
  인자 전달 두 줄 안팎이며 승인 요청에 적는다. 기존 `report(...)` 7인자 형은 빈 목록으로 위임해 남긴다.

## 7. 화면 변경(`pages/dme/ruleSetEdit/debugger`)

### 7.1 선택 칸

- 위치: 디버그 입력 폼(`InputForm`)의 「판정 시각」 바로 아래, 「룰 버전」 칸. 두 값 `적용 중(기본)` / `내 DRAFT 우선`.
  부품은 `@dk-oasis/shared/form` 의 기존 `Select`(두 항목)를 props 그대로 쓴다. 새 공통 부품은 만들지 않는다.
- testid: `dbg-rule-versions`. 케이스 일괄 실행(`TestCasePanel` [전체 실행]·선택 실행)도 같은 값을 쓴다. 칸은 하나다.
- 고친 값(4단계 E4)으로 다시 실행할 때는 기록이 만들어진 모드를 그대로 쓴다(판정 시각 고정 `pinnedTs` 와 같은 규칙).

### 7.2 기억

- 보는 사람 설정으로 `localStorage` 키 `rsf:ruleVersions`(세트와 무관, `autoSave` 와 같은 범주)에 둔다. 값이 두 값이 아니면 `RELEASED`.
  `local-store.ts` 의 try/catch 규칙을 그대로 따른다.

### 7.3 실행 입력·최근 입력·실행 비교

- `DebugInput` 에 `ruleVersions?: "RELEASED" | "MY_DRAFT"` 를 더한다. `inputOf` 는 늘 채우고, 없는 값은 `RELEASED` 로 읽는다.
- `sameInput` 이 모드까지 견준다. 그래서 모드를 바꾸면 `needsFresh` 가 참이 되어 다음 [한 단계]·[계속] 이 새로 실행하고,
  모드가 다른 기록에서는 고친 값 편집(`canEditValues`)이 막힌다. 케이스 기대값 채우기의 「같은 입력」 판정도 모드를 포함한다.
- 최근 입력(`rsf:recent:{setId}`)에 모드를 함께 저장한다(조정자 기본안). 예전 항목(모드 없음)은 `RELEASED`. 최근 입력을 불러오면 모드도 함께 바뀌고
  보는 사람 설정에도 저장된다. 최근 입력 목록에서 `MY_DRAFT` 항목은 「DRAFT」 작은 표시를 붙인다.
  케이스 입력을 불러올 때는(케이스에 모드가 없다) 지금 모드를 유지한다.
- 실행 비교(`RunCompare`): 이전·지금 실행의 모드가 다르면 표 위에 안내 `"이전 실행은 {적용 중|내 DRAFT 우선}, 지금은 {…} 으로 돌렸다"` 를 보인다.

### 7.4 DRAFT 표시와 검사 기준 안내

- 룰 노드 상세(`TraceDetail`): `버전 1.003` 옆에 `DRAFT` 표시(`badgeStyle("warning")`, testid `sim-detail-draft`). 조건: 응답 `draftVersions.rules[ruleId]`
  와 노드 `ver` 가 같음. 하위 세트 프레임 머리(`FrameDetail`): `draftVersions.sets[setId]` 가 있으면 `하위 세트 S · DRAFT 2.001`.
  캔버스 노드 위 표시는 이번에 하지 않는다.
- 기록 머리(디버거 도구 막대 상태 줄): 마지막 실행이 `MY_DRAFT` 이면 `내 DRAFT 우선으로 실행 · DRAFT 룰 n개·세트 m개` 를 보인다(testid `dbg-draft-run`).
- 검사 기준 안내: 선택이 `MY_DRAFT` 일 때 선택 칸 아래에 `"검사 결과(거부·경고)는 적용 중 버전 기준이다. 실행만 내 DRAFT 를 쓴다"`(testid `dbg-draft-check-note`).
- 케이스 일괄 실행 결과 머리: `MY_DRAFT` 로 돌렸으면 `내 DRAFT 우선으로 돌렸다 — 확정 검사는 적용 중 버전으로 돌린다` 와 DRAFT 룰 목록을 보인다.
- 새 케이스 기대값 채우기: `MY_DRAFT` 기록으로도 채운다(룰 DRAFT 를 먼저 확정하면 확정 검사가 같은 값을 낸다). 대신 케이스 편집 창에
  `"내 DRAFT 우선으로 돌린 결과다. 룰 DRAFT 를 확정해야 세트 확정 검사가 이 기대값으로 통과한다"` 를 보인다. 고친 값 기록을 막는 규칙(E4)과 달리 막지 않는다.

## 8. 오류 처리

| 상황 | 동작 |
|---|---|
| 요청 `ruleVersions` 가 두 값 밖 | `INVALID_VALUE`, 실행하지 않음 |
| `MY_DRAFT` 인데 사용자 ID 없음 | `RELEASED` 로 실행 + 경고 `DRAFT_USER_UNKNOWN`, 응답 `ruleVersions=RELEASED` |
| 내 DRAFT 룰의 저장 행·AST 가 깨짐 | MDM026, 문구 `룰 세트 흐름의 저장된 룰 정의를 읽을 수 없어 실행하지 않습니다 — 룰 R 의 내 DRAFT 버전 1.003: …` |
| 내 DRAFT 세트의 `FLOW_JSON`·`RULE_IDS` 가 깨짐 | MDM026, 머리말 `세트 S 의 내 DRAFT 버전 2.001: …` |
| 내 DRAFT 룰이 조립은 되나 판정 중 오류(행 겹침 등) | 지금처럼 기록에 위반으로 담김. 노드에 DRAFT 표시가 있으므로 원인이 DRAFT 임을 화면에서 안다 |
| 케이스 일괄 실행 중 깨진 DRAFT | 지금처럼 일괄 실행 전체가 MDM026(케이스별로 나누지 않음) |

화면은 MDM026 을 지금처럼 오류 문구로 보이고 기록·커서를 유지한다. `MY_DRAFT` 에서 MDM026 이 나면 오류 문구 뒤에
`"[적용 중(기본)] 으로 바꾸면 RELEASED 로 돌릴 수 있다"` 를 덧붙인다.

## 9. 시험 계획(SQLite, 도커 금지)

### 9.1 서버

1. `RuleVersionPick` 단위: 내 DRAFT 우선·남의 DRAFT 무시·REQUESTED 무시·DRAFT 없으면 판정 시각 RELEASED·판정 시각이 일러도 DRAFT·userId null → RELEASED.
2. `StoredDefinitionLookup`: `MY_DRAFT` 에서 `rule()`·`prefetch()`·`ruleSet()` 이 같은 VER 를 고름, `draftRules`·`draftSets` 는 `load`·`loadSet` 만 기록
   (prefetch 만 하고 묻지 않은 룰은 없음), 깨진 DRAFT 의 예외 머리말, 기본 생성자는 지금과 같음.
3. `RuleSetEditService.simulate`(서비스 시험): DRAFT 룰을 거친 기록의 결과값이 DRAFT 값, `draftVersions.rules` 에 그 룰, 남의 DRAFT 는 RELEASED,
   RELEASED 없이 DRAFT 만 있는 룰, 하위 DRAFT 세트 실행과 `calledFlows` 가 DRAFT 흐름, 잘못된 모드 값 거부, 사용자 없음 경고.
4. `runCases`: 케이스 시각이 달라도 DRAFT 룰은 같은 DRAFT, `draftVersions` 한 묶음.
5. 확정 안내: 세트 DRAFT 소유자의 룰 DRAFT 가 있고 케이스 실패 → 문구 끝 안내, 남의 DRAFT·DRAFT 없음 → 문구 그대로, 이슈 수·코드·심각도 무변경.
6. 회귀: 내 DRAFT 가 있는 원장에서 `RELEASED` 디버거·확정 검사·OASIS `execute` 결과가 RELEASED 값. 기존 `RuleSetEditQueryCountTest` 통과.

### 9.2 화면(vitest, `tests/dme/ruleSetEdit/**`)

1. `local-store`: `rsf:ruleVersions` 읽기·쓰기·잘못된 값 → RELEASED, 최근 입력의 모드 저장·예전 항목 호환.
2. `useSimulation`: 모드가 요청에 실리고, 모드를 바꾸면 `needsFresh`, 고친 값 재실행은 기록 모드 유지.
3. `InputForm`: 선택 칸·`MY_DRAFT` 일 때 검사 기준 안내.
4. `TraceDetail`·`FrameDetail`: `draftVersions` 와 VER 가 같을 때만 DRAFT 표시(다른 VER 면 표시 없음).
5. `TestCasePanel`/`useTestCases`: 일괄 실행 요청에 모드, 결과 머리 안내, 기대값 채우기 안내.
6. `RunCompare`: 모드가 다르면 안내.

브라우저 확인은 머지 뒤 조정 세션이 한다.

## 10. 문서

- D-156: 「룰 세트 디버거·케이스 일괄 실행의 룰 버전 모드(RELEASED·MY_DRAFT)」 — §3·§6 의 결정(판정 시각 무관 DRAFT, REQUESTED 제외,
  확정 안내는 문구 뒤에 붙이고 기준은 세트 DRAFT 소유자, 검사는 RELEASED 기준 유지).
- 기능설계서: 디버거 입력 칸·표시·안내 문구, 케이스 일괄 실행 모드, 확정 검사 안내.
- BPMN 헤더 documentation: `ruleVersions` 칸 한 줄.

## 11. 후속

- F1 검사 DRAFT 기준: `RuleIoReader` 에 같은 `RuleVersionPick` 을 받는 읽기를 더하고 `set-model.ts`·`RuleSetAnalyzer` 가 모드를 따르게 한다.
  `RuleSetCalledFlows.rules`(하위 흐름 노드 제목)도 여기서 DRAFT 기준이 된다.
- F2 확정 안내를 하위 세트 안의 룰·하위 세트 DRAFT 까지 넓힌다.
- F3 승인 흐름에 올라간 내 버전(REQUESTED·APPROVED)도 고를지 검토한다.
- F4 캔버스 노드 위 DRAFT 표시.
