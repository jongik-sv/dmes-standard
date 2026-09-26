# TSK-08-04 설계 — 룰 저장 시 검사·값 테스트

> Phase 02 Design. 워크트리 `/Users/jji/project/dmes-standard/.claude/worktrees/dflow-f2517d41`(브랜치 `agent/f2517d41-rule-save-validate-test`,
> 기점 f59cce7). 기준선·게이트 명령은 `docs/mdm/tasks/TSK-08-04/state.json` 의 baseline 을 글자 그대로 쓴다. 도커 금지 모드다.
> 경로 약어: `BL` = `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm`, `BLT` = `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm`,
> `BA` = `src/backend/mdm/api/src/main`, `BAT` = `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm`, `E` = `src/backend/maru-mdm-engine`,
> `EJ` = `E/src/main/java/kr/dongkuk/maru/mdm/engine`, `ET` = `E/src/test/java/kr/dongkuk/maru/mdm/engine`,
> `ER` = `E/src/test/resources/kr/dongkuk/maru/mdm/engine`, `M` = `src/frontend/m-mdm`, `P` = `M/pages/dme/ruleEdit`,
> `S06` = `docs/mdm/design/basic/06-business-rule.md`(06:줄 로 인용).
> spec 본문은 요구사항 데이터다. 이 문서의 결정은 「담당자 확인 필요 결정」 D1~D12 에 모았다.
> 근거 강약: spec 본문 > 승인된 선행 산출물 > 리포 기존 관례 > 미승인 선행 산출물.

## 반려 재작업

> 재작업 1회차. 기점 `6d2110fc`(origin/dev, 1차 구현이 머지된 트리), 브랜치 `agent/f2517d41-rule-save-validate-test`. **이 절이 이번 라운드의
> 설계 전부다** — §0~§7 은 1차 라운드의 심사 대상 설계로 그대로 두며, 이 절과 어긋나면 이 절이 이긴다. 새 결정은 「담당자 확인 필요 결정」
> D13~D19 다. 기준선·게이트 명령은 `state.json` baseline(testAll 3989/0 · m-mdm 1064/0 · shared 170/0 · lint 통과 · oasis 계약 ERROR 0/WARN 0/INFO 29)을
> 글자 그대로 쓴다. 도커 금지 모드다.
>
> **설계 선행 재개(2026-09-26)**: 선행 mdm/TSK-03-03 이 dev 에 반영되어 기점을 `180601ac`(origin/dev)로 옮겨 agent 브랜치에 한 번 머지했다(머지 커밋 메시지에 사유). 기준선은 새 기점에서 다시 쟀다(testAll 3989/0 · m-mdm 1064/0 · shared 170/0 · lint 통과 · oasis ERROR 0/WARN 0/INFO 29).
> 이 설계에는 `## 선행 기준` 절이 없다(재작업 설계가 build-start 에서야 선행 미충족을 알았다). 대신 `6d2110fc..180601ac` 의 선행 변경을 대조했다 —
> 이 설계가 참조하는 파일에서 바뀐 것은 `MdmRuleEngine(evaluator.configuration(), …)` → `MdmRuleEngine(evaluator, …)`(RuleValueTestService·RuleConfirmChecks·ExprTypeByCaseCheck·RuleDefinitionAssemblerTest·CodeDataRuleLedgerChainTest)와 `RuleEvaluator` 의 `runner.run(text, values, evalTs)` 뿐이다. 평가는 여전히
> 식 원문을 `withValues` 로 넣어 돌리고(`MdmEvaluator.evaluate` 의 `copy().withValues`), `InputContracts` 는 바뀌지 않았다 → R-F3·R-F5 의 결론과 §R3-1 빨강 모양(LINE_SPD 0)은 그대로다.
> 계약 무변경이라 검토 모드 Design 은 생략했다. 새 테스트에서 엔진을 만들 때는 `new MdmRuleEngine(evaluator, …)` 로 평가기 빈을 넘긴다.
>
> 반려 사유(review_note 원문, 요구사항 데이터): "결과 식 AST가 문자열로 이중 저장됩니다. 저장 쪽은 TSK-08-03에서 만든 checkDeriveExprs입니다.
> 이 Task가 만든 astOf는 문자열이 오면 null을 돌려줍니다. 그래서 SPD_JOIN이 70이 아니라 오류 없이 0을 냅니다. 저장·읽기 양쪽을 고치고,
> 기존 행도 읽을 수 있게 하고, 조용한 실패를 명시적 오류로 바꾸도록 요구했습니다."

### R0. 조사로 확인한 사실

| # | 사실 | 근거 |
|---|---|---|
| R-F1 | **쓰기 결함**: `parseOrReject` 가 `DomainJson.write(ast(text))` 로 AST JSON **문자열**을 돌려주고(547~554행), 필드 `Line.exprAst` 가 `String`(113행), apply 의 `Map<Integer, Map<String, String>> exprs` 에 `Map.of("expr", …, "ast", line.exprAst)`(512~514행) → 셀 JSON 에 `"ast":"{\"type\":…}"` 로 이중 인코딩. `varAst`(256·263·466행)·`grpCondAst`(312·474행)는 TB_MDM_RULE_VAR 의 **별도 문자열 컬럼**(VAR_AST·GRP_COND_AST)이라 문자열이 맞다 | `BL/dme/ruleEdit/service/RuleColumnsService.java` |
| R-F2 | **읽기 결함**: 셀 `ast` 독자 6곳이 전부 `instanceof Map` 이라 문자열을 조용히 버린다 — `RuleDefinitionAssembler.astOf`(215행, 158행에서 호출) · `RuleAnalysisInputMapper.cell`(70행) · `RuleIoReader.collect`(138행 호출, 204행 정의 — Map 아니면 return) · `check/RuleDefinitionReads.of`(50행) · `check/RuleGenerateTry.toRuleCell`(57행) · `check/ledger/MasterReferenceCheck.check`(49행). grep `"ast"`(main) 으로 재확인한 결과 이 6곳 + 쓰기 2곳(`RuleColumnsService:513`, `RuleExpressionChecks:101`) + `RuleCellsCodec.CELL_KEYS` 뿐이다 | grep |
| R-F3 | **증상 경로**: 엔진은 결과 식을 `cell.text()`(식 원문)로 평가하고(`RuleEvaluator.evaluateRow`), AST 는 **입력 계약**에만 쓴다(`InputContracts.rowContract`: `cell.ast() == null → continue`). AST 가 null 이면 SPD_JOIN 행 계약 required/optional 이 비어 `resultCheck` 가 `BASE_SPD`·`EXC_SPD` 를 NUMBER 로 바꾸지 않고, 문자열 `"90"`·`"70"` 이 `MIN` 에 들어가 **오류 없이 0**. IF 참 분기(EXC_SPD NULL)만 결과 열 자체 변환으로 90 이 되어 결함을 비켜 간다(TSK-09-02 defects.md DF-3 과 같은 분석) | `EJ/rule/RuleEvaluator.java:317-390`, `EJ/rule/InputContracts.java:109-135` |
| R-F4 | **다른 쓰기 경로는 정상**: TABLE 저장·값 테스트 본문(TEST_BODY)은 `RuleSaveValidator.cells` → `RuleExpressionChecks.check` 가 식 셀(판정식은 `RuleSaveValidator.cell` 106~113행: 조건 = `Expression` 열·`op` 없음·`expr` 있음, 결과 = `Expression` 열·`op`·`val` 없음·`expr` 있음)의 `ast` 를 **서버 AST Map 으로 덮어쓴다**(101행). 식 셀에 문제가 있으면 오류 이슈 → TABLE 은 거부, TEST_BODY 는 그 행을 `brokenRowIds` 로 빼고 조립한다. 즉 앱의 모든 쓰기 경로는 식 셀에 ast 를 채운다 — 결함은 COLUMNS apply 한 곳뿐이다 | `BL/common/rule/check/RuleSaveValidator.java:78-113`, `RuleValueTestService.java:112-125` |
| R-F5 | 조립(`RuleDefinitionAssembler.assemble`) 호출자: 값 테스트(`RuleValueTestService:126`, failures 를 cellErrors 로 싣는다) · `StoredRuleDefinitions.assemble`(→ `RuleConfirmChecks.cases:132`, `ContractChangeCheck:57`) · `ContractChangeCheck:58` · `ExprTypeByCaseCheck:71`. **값 테스트 밖 넷은 `failures()` 를 버린다** → 셀 실패로 처리하면 거기서 다시 조용해진다. 조립의 셀 루프는 `catch (RuntimeException)` 으로 셀 실패(D5)를 만든다(103~121행) | 코드 |
| R-F6 | 셀 파싱 진입점은 `RuleCellsCodec.parse` 하나다 — DB 행 독자(`StoredRuleDefinitions.draftRow:77`, `RuleIoReader:134`, `RuleUsageFinder:70`, `RuleSetOrderCheck:67`, `AxisCoverageCheck:35`, `LedgerCells:35·46·50`, `RuleAnalysisInputMapper:45`, `RuleColumnsService:407·419·525`)와 저장 입력(`RuleTableService.checkRows:276` → `validateShape:277`)이 모두 이것을 부른다. 예외: `RuleViewService.rowInfo`(204행)는 CELLS 원문을 그대로 응답에 싣고, `RuleVersionDiffs.canonicalCells`(64행)는 Jackson 으로 직접 읽는다 | grep |
| R-F7 | `RuleCellsCodec.validateShape` 는 `ast` 가 Map 이 아니면 INVALID_VALUE(94~96행, 테스트 `RuleCellsCodecTest.ast_는_객체여야_한다` 는 `validateShape(parse(json))` 로 부른다). 화면은 view 가 준 셀 객체를 **그대로** 되돌려 보낸다(`grid-model.ts` `parseCells`/`writeCells`, `CellObj.ast?: unknown`; Expression 셀은 읽기 전용이라 편집으로 ast 가 빠지지도 않는다, `applyCellEdit` 128행) → **지금 트리에서 COLUMNS 로 결과 식을 넣은 산출 룰 DRAFT 는 TABLE 저장이 INVALID_VALUE 로 막힌다**(레거시 문자열이 그대로 돌아온다). `diff.ts` 는 ast 를 빼고 견주므로 표시 diff 는 영향 없다 | `M/pages/dme/ruleEdit/decision-table/grid-model.ts`, `diff.ts:22-26` |
| R-F8 | 화면 evalex 도 셀 AST 를 걷는다 — `M/src/evalex/input-contract.ts:42·138`(`usedVariables(cell.ast)`·`nullSafety(cell.ast)`), `rule-analysis.ts:397`, `rule-preview.ts:209`. 레거시 문자열이 view 로 내려오면 화면 입력 계약도 같은 식으로 틀린다 → **view 응답을 정규화하면 FE 코드는 바꿀 필요가 없다**. `M/tests/dme/ruleEdit/column-draft.test.ts:70` 의 `"ast":"{}"` 는 `draftFromView` 가 `expr` 만 읽는지 보는 픽스처로, FE 코드가 문자열을 가정한다는 뜻은 아니다(표기만 버그 모양을 흉내 냈다) | 코드 |
| R-F9 | `RuleVersionDiffs.canonicalCells` 는 ast 를 포함한 셀 JSON 전체를 정렬 비교한다(확정 화면 diff, `RuleConfirmService:362-373` 칸 비교도 이것). 레거시 RELEASED(문자열 ast) 와 수정 뒤 DRAFT(객체 ast)는 식이 같아도 CHANGED 가 된다 | `BL/common/rule/confirm/RuleVersionDiffs.java:64-72` |
| R-F10 | 데이터: 픽스처·샘플 SQL(`e2e/fixtures/mdm-ruleEdit-data.sql` 식 셀 7·`mdm/sample/mdm-local-sample.sql` 16)은 모두 객체 ast, 문자열 ast 0건. 엔진 입력 계약 코퍼스(`ER/contract/input-contract-corpus.json`) 식 셀 58개 모두 객체 ast(없음 0). 테스트 시드: `RuleColumnsServiceTest:398` 이 `"ast":""`(DRAFT, apply 가 덮어쓴다), `MdmBusinessRuleMigrationTest:477-482` 가 `"ast":{}`(마이그레이션 제약 시험, 조립 안 함), `CodeDataRuleLedgerChainTest:210` 은 ast 없이 TABLE 저장(검사기가 채운다) | 스크립트 확인 |
| R-F11 | 세트 구조 검사(`RuleSetEditService` → `RuleIoReader.read`)도 셀 AST 로 읽는 이름을 모은다. 결함 때문에 지금은 SPD_JOIN 이 아무것도 읽지 않는 것으로 계산된다 — 수정 뒤에는 `BASE_SPD`·`EXC_SPD` 를 읽는다(LS_A3 순서상 앞 룰이 만들므로 통과가 기대값) | 코드 |
| R-F12 | 새 버전 만들기(`RuleVersionService:136`)는 CELLS 원문을 복사한다 — 레거시 RELEASED 에서 만든 DRAFT 는 다음 COLUMNS·TABLE 저장 전까지 문자열 ast 를 그대로 갖는다(읽기 쪽 디코드가 받는다) | 코드 |

### R1. 접근 방식

쓰기는 **결과 식 셀의 ast 를 Map 으로 저장**하도록 `RuleColumnsService` 한 곳을 고친다(TABLE 저장과 같은 모양, `RuleCellsCodec` 주석 "ast 는 객체" 정본). 읽기는
디코드를 **`RuleCellsCodec` 한 곳**에 모은다 — `parse` 가 셀을 읽을 때 레거시 문자열 ast 를 JSON 객체로 풀고(빈 문자열은 키 제거, 깨진 값은 INVALID_VALUE),
독자 6곳의 `instanceof Map ? … : null` 은 새 헬퍼 `RuleCellsCodec.ast(Object)`(Map 은 그대로·문자열은 풀기·그 밖은 예외)로 바꿔 "문자열이면 null" 이라는
조용한 분기를 코드에서 없앤다. `parse` 가 DB 행과 저장 입력의 공통 진입점이라(R-F6) 디코드를 거기 두면 지금 독자와 앞으로 생길 독자가 빠짐없이 받고, 화면이
레거시 셀을 되돌려 보내도 TABLE 저장이 막히지 않는다(R-F7). parse 를 거치지 않는 두 곳(view 응답·확정 diff)은 같은 헬퍼로 정규화한다. 엔진 조립 경계에서는
"식 셀인데 ast 가 없음"을 명시적 오류로 만든다 — 앱의 모든 쓰기 경로가 식 셀에 ast 를 채우므로(R-F4) 없음은 손상된 데이터뿐이다. 깨진 ast·없는 ast 오류는
셀 실패(D5)로 삼키지 않고 `BusinessException(INVALID_VALUE)` 로 던진다 — 조립 호출자 넷이 `failures()` 를 버리기 때문이다(R-F5). RELEASED 는 불변이라 다시
쓸 수 없으므로 데이터 마이그레이션은 하지 않고 관대한 읽기로 받는다(D17). 엔진 `InputContracts`(JUnit·Vitest 공용 코퍼스)와 TS evalex 는 건드리지 않는다(D18).

### R2. 변경 파일 목록

경로 약어는 문서 머리와 같다. 모두 **수정**이며 새 파일은 없다.

| 파일 | 바꾸는 것 |
|---|---|
| `BL/common/rule/RuleCellsCodec.java` | ① `public static Map<String, Object> ast(Object raw)` — null → null, `Map` → 그대로, `String` 이 공백뿐 → null, 그 밖 `String` → Jackson 으로 JSON **객체**로 읽기(객체가 아니거나 JSON 이 아니면 예외), 그 밖 타입 → 예외. 예외는 `BusinessException(ErrorCode.INVALID_VALUE, "셀의 ast 를 읽을 수 없습니다: …")`(`parse` 의 기존 오류와 같은 종류). ② `parse` 가 셀마다 `ast` 키를 보면: 문자열이면 `ast()` 로 풀어 **Map 으로 바꿔 넣고**, 공백뿐이면 **키를 지운다**. 깨진 값이면 `"var_id N 셀의 ast 를 읽을 수 없습니다(JSON 객체가 아님): <앞 40자>"` INVALID_VALUE. 이미 Map 이면 손대지 않는다. ③ `public static String normalizeStored(String json)` — 셀 중 문자열 ast 가 하나라도 있으면 `write(parse(json))`, 없으면 **원문 그대로**(바이트 동일, 화면의 "손대지 않은 행은 바이트 단위로 같다" 가정 유지). ④ 클래스 javadoc 에 "ast 표현 정규화(레거시 문자열 → 객체)는 값 변경이 아니다 — 08-02 I17 의 '값을 고치지 않는다'는 op·left·right·list·expr·val 에 대한 것" 을 적는다. `validateShape` 는 **바꾸지 않는다**(Map 수준 호출자에게 계속 객체만 허용) |
| `BL/dme/ruleEdit/service/RuleColumnsService.java` | `Line.exprAst` 를 `Map<String, Object>` 로. `parseOrReject` 가 `Map<String, Object>` 를 돌려주고(javadoc "AST 를 돌려준다" 로), `varAst`·`grpCondAst` 대입 자리(256·312행)는 `DomainJson.write(parseOrReject(…))` 로 감싸 **컬럼 값은 바이트 동일**. apply 의 `exprs` 를 `Map<Integer, Map<String, Object>>` 로(512~514·532~535행) |
| `BL/common/rule/definition/RuleDefinitionAssembler.java` | `astOf` 삭제 → `RuleCellsCodec.ast(c.get("ast"))`. **식 셀**(아래 `RuleExpressionChecks.exprCell` 판정)인데 디코드한 ast 가 null 이면 `BusinessException(INVALID_VALUE, "<ruleId> 버전 <ver> row <rowId> var_id <varId>: 식 셀에 AST 가 없습니다 — 열 설정 또는 표를 다시 저장하세요")`. 이 두 오류(디코드·없음)는 셀 루프의 `catch (RuntimeException)`(셀 실패 D5)에 **먹히지 않게** 한다 — 판정과 디코드를 try 밖에서 하거나 `catch (BusinessException ex) { throw ex; }` 를 앞에 둔다. `CellTextGenerator` 의 IAE 는 지금처럼 셀 실패다. 클래스 javadoc 에 이 규칙 한 줄 |
| `BL/common/rule/check/RuleExpressionChecks.java` | `public static boolean exprCell(String varKind, String dispType, Map<String, Object> cell)` — `RuleSaveValidator.cell`(106~113행)의 식 셀 판정을 **글자 그대로** 옮긴다(조건: `Expression`·`op` 없음·`expr` 있음 / 결과: `Expression`·`op`·`val` 없음·`expr` 있음) |
| `BL/common/rule/check/RuleSaveValidator.java` | `cell()` 의 `exprCell` 계산을 `RuleExpressionChecks.exprCell(var.varKind(), var.dispType(), cell)` 로 바꾼다(동작 불변) |
| `BL/common/rule/RuleAnalysisInputMapper.java` · `BL/common/rule/check/RuleGenerateTry.java` | `c.get("ast") instanceof Map<?, ?> ast ? (Map) ast : null` → `RuleCellsCodec.ast(c.get("ast"))` |
| `BL/common/rule/RuleIoReader.java` | 138행 `collect(cell.get("ast"), conds)` → `collect(RuleCellsCodec.ast(cell.get("ast")), conds)`(`collect(Object…)` 의 Map 검사는 AST 내부 노드용이라 둔다) |
| `BL/common/rule/check/RuleDefinitionReads.java` · `BL/common/rule/check/ledger/MasterReferenceCheck.java` | `if (cell.get("ast") instanceof Map<?, ?> ast)` → `Map<String, Object> ast = RuleCellsCodec.ast(cell.get("ast")); if (ast != null)` |
| `BL/dme/ruleEdit/service/RuleViewService.java` | `rowInfo`(204행 — rows·baseRows 가 함께 쓴다)가 `RuleCellsCodec.normalizeStored(r.getCells())` 를 싣는다. 114행 분석 입력(`StoredRow`)은 mapper 가 parse 로 받으므로 그대로 둔다 |
| `BL/common/rule/confirm/RuleVersionDiffs.java` | `canonicalCells` 가 정렬 쓰기 전에 **셀 객체의 문자열 ast 만** 객체로 푼다(최상위가 var_id→셀 객체 모양일 때만. 풀리지 않는 문자열은 그대로 두고 — diff 는 판정이 아니며 이 메서드는 원래 "JSON 이 아니면 원문" 으로 관대하다). javadoc 에 한 줄 |
| `BAT/dme/RuleSetLifecycleOasisFlowTest.java` (TSK-09-02 산출물) | 155~163행 DF-3 우회 주석을 지우고(156~157행의 "키는 두고 값만 NULL" 설명은 남긴다) MIN 분기 케이스를 더한다(§R3) |
| `BAT/dme/ruleEdit/RuleColumnsServiceTest.java` (TSK-08-03 산출물) | 457~458행 `String.valueOf` 비교(문자열 저장을 굳힌 기대)를 **원문 CELLS** 기준 검사로 바꾼다(§R3). 398행 시드 `"ast":""` 는 둔다(D15 로 "없음" — apply 가 덮어쓴다) |
| `BAT/dme/ruleEdit/RuleValueTestServiceTest.java` · `RuleEditViewTest.java` · `RuleTableServiceTest.java` | 새 사례(§R3) |
| `BLT/common/rule/RuleCellsCodecTest.java` · `BLT/common/rule/definition/RuleDefinitionAssemblerTest.java` · `BLT/common/rule/confirm/RuleVersionDiffsTest.java` | 새 사례(§R3) |
| `M/tests/dme/ruleEdit/column-draft.test.ts` | 70행 픽스처 `"ast":"{}"` → `"ast":{}`(계약 모양에 맞춘 표기 정정, 기대값 불변) |
| `docs/mdm/tasks/TSK-09-02/defects.md` (TSK-09-02 산출물) | DF-3 절 끝에 `- **해소**: TSK-08-04 반려 재작업(1회차)에서 저장(객체 ast)·읽기(레거시 문자열 디코드)·명시 오류를 고쳤다. `RuleSetLifecycleOasisFlowTest` 가 MIN 분기(90·70 → 70)를 OASIS 경로로 확인한다.` 한 줄(본문은 고치지 않는다) |

**수정하지 않는 것**: 엔진 `E/**`(특히 `InputContracts`·코퍼스 JSON), `M/src/evalex/**`, FE 화면 코드(`P/**`), `RuleExpressionChecks.check` 본문, `RuleVersionService`(복사는 원문 그대로), `RuleCellsCodec.validateShape`, 마이그레이션·DDL, 1차 라운드 설계 §0~§7·D1~D12.

**다른 Task 산출물 변경(done 요약에 싣는다)**: TSK-08-03 — 결과 식 셀 AST 저장 형식(문자열 → 객체)과 `RuleColumnsServiceTest` 의 그 기대. TSK-08-02 —
`RuleCellsCodec.parse` 가 레거시 문자열 ast 를 객체로 푼다(I17 해석 명시). TSK-08-05 — `RuleVersionDiffs.canonicalCells` 가 문자열 ast 를 풀어 비교한다.
TSK-09-02 — `RuleSetLifecycleOasisFlowTest` 우회 주석 정리·MIN 케이스 추가, defects.md DF-3 해소 줄.

### R3. 테스트 전략 (빨강 먼저)

Build 는 아래 새·바뀐 테스트를 **먼저** 써서 지금 트리에서 실패하는 것을 확인하고(빨강 기록은 build-log.md) 구현한다. 모두 SQLite·순수 JUnit·Vitest 이며 도커를 쓰지 않는다.

1. `BAT/dme/RuleSetLifecycleOasisFlowTest`(RANDOM_PORT, 실제 BPMN) — 3단계에서 `saveCase("SPD_JOIN", "예외_있음_MIN", "{\"BASE_SPD\":\"90\",\"EXC_SPD\":\"70\"}", "{\"LINE_SPD\":70}")` 를
   더하고 기존 `assertCasePasses("SPD_JOIN", 1, …)` 가 두 케이스를 모두 통과시키는지 본다(헬퍼는 케이스 전부를 돈다). 4단계 `confirm` 이 케이스를 다시 돌리므로
   확정 경로(`StoredRuleDefinitions` → `RuleConfirmChecks`)도 70 으로 통과해야 한다. **빨강**: 지금 트리에서 `pass:false`(LINE_SPD 0). 5단계 세트 저장이 R-F11 대로
   계속 통과하는지도 이 시험이 본다(깨지면 세트 검사가 새로 드러낸 사실이므로 build-log 「설계 이탈」에 올리고 오케스트레이터에 인계).
2. `BAT/dme/ruleEdit/RuleValueTestServiceTest` — (a) **레거시 행 70**: jdbc 로 DERIVE 룰(예 `SPD_JOIN_OLD`)을 VER 1 **RELEASED** 로 심고(`DmeTestSupport.rule`·`pending` 과 같은
   방식), 결과 열 `LINE_SPD`(RESULT·Expression·NUMBER 도메인), 컬럼 사전 `BASE_SPD`·`EXC_SPD`(NUMBER), 행 CELLS 는
   `{"<id>":{"expr":"IF(EXC_SPD == NULL, BASE_SPD, MIN(BASE_SPD, EXC_SPD))","ast":"<AstExporter.export 결과를 JSON 문자열로 한 번 더 인코딩>"}}` — 1차 결함이 만든 모양 그대로.
   `runTest(target VERSION, ver 1, {"BASE_SPD":"90","EXC_SPD":"70"})` → outcome OK, `LINE_SPD` = 70, 계약 행 required/optional 에 두 이름. (b) **깨진 ast**: 같은 행의 ast 를 `"x"`
   로 심으면 `runTest` 가 `BusinessException(INVALID_VALUE)`(메시지에 `ast`)를 던진다 — 0 이나 OK 가 나오면 안 된다. (c) **식 셀 ast 없음**: ast 키 없이 심으면 같은 예외(메시지에 `AST 가 없`).
   빨강: (a) 0, (b)(c) 예외 없이 OK.
3. `BAT/dme/ruleEdit/RuleColumnsServiceTest.DERIVE_결과_식은_셀에_저장되고_AST_는_파싱_결과와_같다` — 457~458행을 바꾼다: 원문 `cells` 에 `"ast":{` 가 있고 `"ast":"` 가 **없음**을
   `assertTrue/assertFalse` 로 보고, 값은 **`RuleCellsCodec.parse` 를 거치지 않고**(parse 가 이제 문자열도 풀어 주므로 회귀를 못 잡는다) 평범한 `ObjectMapper.readTree(cells)` 로 읽어
   `get("1").get("ast")` 가 객체 노드이고 `AstExporter.export(expr, …)` 를 `valueToTree` 한 것과 같은지 본다. 빨강: 지금 문자열 노드.
   같은 클래스에 VAR_AST 단언을 하나 더한다 — 식 변수 조건 열(COND·`Expression`, varName 이 식)을 COLUMNS 로 저장한 뒤 `SELECT VAR_AST` 가
   `DomainJson.write(AstExporter.export(varName, …))` 와 **문자열로** 같다(RR2 — `parseOrReject` 반환형을 바꾸며 컬럼 쪽이 흔들리지 않는지. 지금 트리에서도 초록이며 변이 검증용이다).
4. `BAT/dme/ruleEdit/RuleEditViewTest` — DRAFT(또는 RELEASED) 행 CELLS 에 문자열 ast 를 jdbc 로 심고 `view` 를 부르면 그 행 `cells` 원문에 `"ast":{` 가 있고 `"ast":"` 가 없다.
   문자열 ast 가 없는 행의 `cells` 는 DB 원문과 **바이트 동일**. 빨강: 문자열 그대로.
5. `BAT/dme/ruleEdit/RuleTableServiceTest` — 산출 룰 DRAFT 에 문자열 ast 행을 심고, 그 CELLS 원문을 그대로 TABLE 저장 요청으로 보내면(오래된 화면이 되돌려 보내는 모양) 성공하고
   저장된 CELLS 는 객체 ast 다. 빨강: 지금 INVALID_VALUE(`validateShape`).
6. `BLT/common/rule/RuleCellsCodecTest` — `parse`: 문자열 ast(객체 JSON) → Map, 공백·빈 문자열 → 키 없음, `"x"`·`"[1]"`·`"1"` → INVALID_VALUE(메시지 `ast`), 숫자·배열 타입 ast → INVALID_VALUE.
   `ast(Object)`: null·Map·문자열·기타 각 1건. `normalizeStored`: 문자열 ast 없는 입력은 **같은 String**(공백 포함 원문 그대로), 있는 입력은 객체로. `validateShape` 에 **손으로 만든**
   `Map`(ast = 문자열)을 넣으면 여전히 INVALID_VALUE(parse 를 거치지 않는 호출자 보호). 기존 `ast_는_객체여야_한다` 는 그대로 통과해야 한다(이제 parse 단계에서 같은 코드·`ast` 메시지로 난다).
7. `BLT/common/rule/definition/RuleDefinitionAssemblerTest` — 결과 Expression 셀 `{expr, ast:"<문자열 JSON>"}` 은 조립되고 계약 행에 식의 변수가 든다. 식 셀 ast 없음·깨진 문자열은
   `BusinessException` 이 `assemble` 밖으로 나온다(**`failures()` 로 삼켜지지 않는다**). `op` 가 있는 Expression 조건 셀(식 셀 아님)은 ast 가 없어도 오류가 아니다. 기존 코퍼스 동적 테스트는 그대로 통과.
8. `BLT/common/rule/confirm/RuleVersionDiffsTest` — 같은 식의 셀이 한쪽은 문자열 ast, 한쪽은 객체 ast 면 `canonicalCells` 가 같고 diff 가 SAME(변경 없음).
9. FE — `column-draft.test.ts` 픽스처 정정만. 새 FE 테스트는 없다(FE 코드 불변, R-F8).

화면 스모크 넷(e2e.md): 이번 라운드는 화면 코드를 바꾸지 않고, e2e 픽스처에 문자열 ast 행이 없으며(R-F10) view 응답이 바뀌는 것은 레거시 행뿐이라 e2e
`src/frontend/e2e/mdm-ruleEdit.spec.ts` 의 동작이 달라지지 않는다 — e2e 는 다시 돌리지 않는다(1차 라운드 통과 결과를 유지, 게이트 명령에도 없다). 보고에 "e2e 미실행(화면 무변경)" 으로 올린다.

게이트: `state.json` baseline 명령 5개를 글자 그대로. 기대 — testAll 3989 + 새 사례(감소 없음)·실패 0, m-mdm 1064/0(픽스처 정정만, 수 불변), shared 170/0, lint 통과, oasis 계약 ERROR 0/WARN 0.

### R4. 수용 기준 매핑 (이번 라운드가 닿는 것)

spec 수용 기준 5건의 1차 매핑(§4)은 그대로다. 이번 라운드는 반려 사유 네 요구와, 그것이 걸친 spec 항목을 아래로 확인한다.

| 요구 | 검증 |
|---|---|
| 저장 쪽 수정(결과 식 AST 객체 저장) — spec 「Expression 파싱·AST 저장」 | §R3-3 `RuleColumnsServiceTest`(원문 CELLS `"ast":{`), §R3-1 lifecycle |
| 읽기 쪽 수정(SPD_JOIN 70) — spec 「대상: 편집본/저장 버전」·「결과 표시」 | §R3-1 `RuleSetLifecycleOasisFlowTest`(OASIS execute·confirm), §R3-7 `RuleDefinitionAssemblerTest` |
| 기존 행도 읽는다 | §R3-2(a) `RuleValueTestServiceTest`(RELEASED 레거시 → 70, `StoredRuleDefinitions` 경로), §R3-4 view, §R3-5 TABLE 재저장, §R3-6 codec, §R3-8 diff |
| 조용한 실패 → 명시적 오류 | §R3-2(b)(c) `RuleValueTestServiceTest`, §R3-6 codec, §R3-7 조립(failures 로 삼키지 않음) |
| 06 「저장 시 검사」·UNIQUE·원장 미기록·요청 크기·e2e(1차 기준) | 1차 테스트 전부가 게이트 testAll·m-mdm 에서 그대로 통과(기대값 불변). e2e 는 미실행(화면 무변경, §R3 끝) |

### R5. 불변 규칙 — 이번 라운드에서 바꾸면 안 되는 것

변이 검증은 규칙마다 적힌 대상 테스트만 돌린다.

| # | 규칙 | 대상 테스트 |
|---|---|---|
| RR1 | COLUMNS apply 가 쓰는 결과 식 셀의 `ast` 는 JSON **객체**다(원문에 `"ast":"` 없음) | `RuleColumnsServiceTest`(DERIVE AST 사례) |
| RR2 | VAR_AST·GRP_COND_AST 는 문자열 JSON 컬럼 그대로다(값 = `DomainJson.write(AST)`, 바이트 동일) | `RuleColumnsServiceTest.grp_cond_는_파싱과_참조_변수_해결이_되어야_하고_AST_를_한_번_만든다` 와 새 VAR_AST 단언(§R3-3) |
| RR3 | `parse` 는 문자열 ast 를 객체로 풀고, 공백뿐이면 키를 지우며, Map ast 와 다른 키 값은 바꾸지 않는다 | `RuleCellsCodecTest` |
| RR4 | 풀 수 없는 ast(JSON 아님·객체 아님·문자열·Map 밖 타입)는 INVALID_VALUE 다 — null 로 떨어지지 않는다 | `RuleCellsCodecTest`, `RuleValueTestServiceTest`(깨진 ast) |
| RR5 | `validateShape` 는 Map 수준에서 문자열 ast 를 계속 거부한다 | `RuleCellsCodecTest` |
| RR6 | 식 셀(`exprCell` 판정)에 ast 가 없으면 조립이 `BusinessException` 을 던지고, 이 오류와 디코드 오류는 `failures()` 로 삼켜지지 않는다. 식 셀이 아닌 셀은 이 규칙에 걸리지 않는다 | `RuleDefinitionAssemblerTest`, `RuleValueTestServiceTest`(ast 없음) |
| RR7 | 식 셀 판정은 검사기와 조립이 같은 함수(`RuleExpressionChecks.exprCell`)를 쓴다 — 검사기가 ast 를 채우는 셀 집합 = 조립이 ast 를 요구하는 셀 집합 | `RuleDefinitionAssemblerTest`, `RuleSaveValidatorTest`, `RuleValueTestServiceTest`(TEST_BODY 기존 사례 `키를_보내지_않으면_MISSING_KEY…`) |
| RR8 | SPD_JOIN(`IF(EXC_SPD == NULL, BASE_SPD, MIN(BASE_SPD, EXC_SPD))`)은 90·70 → 70, 90·NULL → 90 이다(OASIS 저장 → execute → confirm) | `RuleSetLifecycleOasisFlowTest` |
| RR9 | 레거시 문자열 ast 를 가진 RELEASED 버전의 값 테스트는 객체 ast 와 같은 결과·계약을 낸다 | `RuleValueTestServiceTest`(레거시 70) |
| RR10 | view 는 문자열 ast 행만 객체로 바꿔 내려주고, 그 밖 행의 CELLS 는 원문 바이트 그대로다 | `RuleEditViewTest`, `RuleCellsCodecTest`(`normalizeStored`) |
| RR11 | 레거시 문자열 ast 셀을 되돌려 보낸 TABLE 저장은 성공하고 객체 ast 로 저장된다 | `RuleTableServiceTest` |
| RR12 | 확정 diff 는 ast 표현(문자열·객체)만 다른 같은 셀을 같은 것으로 본다 | `RuleVersionDiffsTest` |
| RR13 | 검사기는 식 셀 ast 를 서버 AST 로 덮어쓴다(화면이 보낸 AST 를 믿지 않는다 — 1차 I11) | `RuleExpressionChecksTest` |
| RR14 | 엔진 입력 계약 계산과 공용 코퍼스는 바뀌지 않는다 | `ET/rule/InputContractCorpusTest`, `RuleDefinitionAssemblerTest`(코퍼스 동적 사례), `M/tests/evalex-input-contract-corpus.test.ts` |

### R6. Build 가 주의할 함정

1. 조립 셀 루프의 `catch (RuntimeException)` 은 `BusinessException` 도 잡는다 — RR6 의 두 오류를 try 밖에서 내거나 먼저 다시 던진다.
2. `RuleColumnsServiceTest` 의 값 비교를 `RuleCellsCodec.parse` 로 하면 이제 문자열도 객체로 풀려 RR1 회귀를 못 잡는다 — 원문 문자열·평범한 Jackson 으로 본다(§R3-3).
3. 레거시 시드의 ast 문자열은 **JSON 문자열 안의 JSON 문자열**이다 — Java 에서 `mapper.writeValueAsString(mapper.writeValueAsString(astMap))` 처럼 두 번 인코딩해 셀 JSON 에 넣는다(손으로 이스케이프하지 않는다).
4. `normalizeStored` 는 문자열 ast 가 없으면 **입력 String 을 그대로** 돌려준다 — `write(parse(x))` 는 공백·이스케이프를 바꿔 화면 diff·바이트 동일 가정을 흔든다.
5. `RuleCellsCodec` 는 08-02 공용 클래스다 — `parse` 의 기존 오류 메시지(객체 아님·정수 키·셀 객체 아님)와 순서를 바꾸지 않는다.
6. lifecycle 시험 5단계(세트 저장)가 새로 실패하면 결함 수정으로 SPD_JOIN 이 읽는 이름이 생겨서다(R-F11). 기대값을 바꾸지 말고 원인을 build-log 에 적어 인계한다.
7. 겪은 문제는 `.issues` 에 쓰지 않고 보고에 분류와 함께 올린다.

## 0. 조사로 확인한 사실 (Build 가 다시 조사하지 않도록 적는다)

### 0.1 entry-point

spec 의 `mdr/ruleEdit` 는 낡은 값이다. 화면 그룹 코드는 `dme` 로 확정됐고 메뉴 `마루 MDM 〉 업무기준 〉 룰 화면`, pageId `mdm:dme/ruleEdit`,
FE `P/page.tsx` 다(TSK-08-02 design §0, D1). 이 설계는 `dme/ruleEdit` 를 쓴다.

### 0.2 백엔드 — 룰 화면 저장 경로 (08-02·08-03 산출물)

| # | 사실 | 근거 |
|---|---|---|
| F1 | `RuleTableService.save`(part TABLE): `tx.execute{ beginDraftWrite → hitPolicy → checkRows(행 종류·기본 행·row_id·`RuleCellsCodec.validateShape`) → issue(ROW) → deleteRows → INSERT → updateHitPolicy }` 뒤, **트랜잭션 밖**(148~155행)에서 `resolver.resolve` → `RuleAnalyzer.analyze` → `RuleIssueMaps.of` → `RuleSaveContext` → `saveChecks.orderedStream().forEach(check -> issues.addAll(check.check(ctx)))`. 커밋 뒤라 `RuleSaveCheck` 로는 거부할 수 없다. 현재 `RuleSaveCheck` 구현 빈은 0개 | `BL/dme/ruleEdit/service/RuleTableService.java:93-155` |
| F2 | `interface RuleSaveCheck { List<Map<String,Object>> check(RuleSaveContext context); }`, `record RuleSaveContext(String ruleId, int ver, String ruleKind, String hitPolicy, List<ResolvedVar> vars, List<StoredRow> rows, List<RuleIssue> analysis)`. 둘 다 `RuleTableService` 만 쓴다. 이 Task 는 둘을 `BL/common/rule/check/` 로 옮긴다(§2.2) — 공용 검사기가 화면 패키지 타입에 기대지 않게 한다. 패키지 순환을 막는 ArchUnit 규칙은 없다(grep `beFreeOfCycles`·`slices()` 0건) | `BL/dme/ruleEdit/service/RuleSaveCheck.java`, `RuleSaveContext.java` |
| F3 | `RuleColumnsService`(part COLUMNS, 08-03)는 이미 거부(`BusinessException(ErrorCode.INVALID_VALUE)`, 트랜잭션 롤백)로: 프로그램 변수 타입 선언(263행), 결과 열 그룹 규칙(`checkGroups` 284~350), DERIVE 산출 순서(`checkDeriveExprs` 352~379), 변수명 예약어(`ExpressionChecker.checkVariableName`, 226행), 식 파싱·AST 저장(`parseOrReject` 556~563, `AstExporter.export`, var_ast·grp_cond_ast·DERIVE 결과 셀 expr/ast)을 한다. 경고는 `pivotCoverWarning`(382~425, 코드 `PIVOT_COVER_INCOMPLETE`, WARNING) 하나 | `BL/dme/ruleEdit/service/RuleColumnsService.java` |
| F4 | `RuleEditService` action 메서드: `search·searchRules·view·save(part→RuleEditSavePart 빈)·delete(target VERSION|RULE)·newVersion·lock·unlock·handover·parseExpr·searchDomains`. BPMN `validate` → `parseExpr`(`RuleExprParseRequest`), target 분기 없음 | `RuleEditService.java:76-202`, `BA/resources/services/dme/ruleEdit.bpmn` |
| F5 | `ruleEdit.bpmn` actionGateway 갈래 9개(search·view·save·delete·copy·lock·unlock·handover·validate), 전부 `camunda:class="ruleEditService"`. 두 번째 게이트웨이 금지(주석 17~18행). `DmeBpmnActionTest.ruleEdit_는_search_view_save_delete_copy_lock_unlock_handover_validate`(35~48행)가 액션 집합·readOnly 를 고정한다. 어휘 16종 `MdmActions`(`VALIDATE`·`EXECUTE`·`COMPARE` 포함), `MdmOasisActionVocabularyTest` | 코드 |
| F6 | 권한 세트(`DataInitializer.java:1061-1067`): READ=`search,view,export,compare`, EDIT=READ+`save,delete,reg,import,validate,execute,copy,restore,lock,unlock,handover`, CONFIRM=EDIT+`confirm`. dme 매트릭스: `MDM_STD_ADMIN→READ`, `MDM_STEWARD→CONFIRM` | `src/backend/mcm/api/.../init/DataInitializer.java` |
| F7 | `RuleEditViewResult` 필드: `me, editable, headerEditable, unappliedVersionExists, confirmScreenReady, rule, versions, selectedVer, vars(List<ResolvedVar>), rows, baseRows, baseVars, varCandidates, varMeta, baseVarMeta, issues, usage`. 테스트 케이스 필드 없음 | `BL/dme/ruleEdit/dto/RuleEditViewResult.java:11-29` |
| F8 | `BL/common/rule/`: `RuleCellsCodec.parse/write/validateShape`(모양만, 값 무변경 — 08-02 I17), `RuleVarTypeResolver.resolve(ruleId, ver, List<MdmRuleVar>)`, `record ResolvedVar(varId, varKind, dispType, seq, varName, exprVar, label, dataType, scale, dateString, maruCodeId, domainId, domainName, typeSource, description)`(**칼럼 고정, 필드 추가 금지**), `RuleAnalysisInputMapper.toAnalysisRule(...)`·`record StoredRow(rowId, seq, rowKind, cells)`, `RuleQueries`(vars·rows·rowIds·deleteRows·allSets·latestReleasedVers·latestReleasedResultVarsExcept …), `RuleUsageFinder.find(ruleId, fallbackVer)`(세트별 dependsOn/dependedBy — 순환 검출 없음), `RuleIssueMaps.of`, `RuleNativeWrites`, `RuleStewardCheck`, `DefaultMdmRuleIdIssuer`. 셀 값 정규화 클래스는 **없다** | 코드 |
| F9 | 엔티티 `MdmRuleTestCase`(PK `MARU_RULE_ID`+`CASE_ID`, `CASE_NAME`, `INPUT_JSON` NOT NULL, `EXPECTED_JSON`, `DESCRIPTION`, `ROW_VERSION` NOT NULL·`updatable=false`), 생성자 `MdmRuleTestCase(String maruRuleId, Integer caseId, String inputJson)`. 운영 사용처 0. `MdmRuleTestCaseRepository` 는 메서드 없음(가드 `MdmRuleContractOnlyArchitectureTest._06_리포지토리는_메서드를_선언하지_않는다` 유지 — 조회는 JPQL/네이티브 조회 클래스로). DDL: `BA/resources/db/migration/mdm/sqlite/V8__create_mdm_business_rule.sql:165-184`, mssql 같은 파일 167~188. CHECK `json_valid(INPUT_JSON)`·`EXPECTED_JSON IS NULL OR json_valid(...)`(mssql `ISJSON`). 발급은 `MdmRuleIdIssuer.issue(ruleId, MdmRuleIdKind.CASE, n)`(카운터 `LAST_CASE_ID`) — 운영 첫 사용 | 코드 |
| F10 | `MdmErrorCode` 23종(MDM001~MDM023). 룰 전용 거부 코드는 없다. `MDM021 INVALID_INPUT(400, INVALID_VALUE)`. 선례 `DomainRejections.reject`: **OASIS 예외는 `meta.message` 만 화면에 가고 `errors[]` 는 오지 않는다(B0 실측)** → 메시지 본문에 이슈 코드·요약을 잇고 details 는 `ErrorDetail.of(code)` + `ErrorDetail.ofGrid(...)`. D-096 은 공유 파일 충돌 때문에 새 MdmErrorCode 를 만들지 않고 우산 코드를 재사용했다 | `BL/dma/domainMng/service/DomainRejections.java`, decisions.md D-096 |
| F11 | 요청 크기 상한을 보는 코드·설정은 mdm·cactus 설정 어디에도 없다 | grep 결과 |
| F12 | 운영 `CodeLookup` 빈은 없다(D-077). `MdmEngineConfig` 의 `mdmEvaluator` 빈은 `EMPTY_CODES`·`MasterLookup.NONE` 을 쓴다 → 운영 평가기로 `MASTER`·`CODE_IN` 을 부르면 늘 빈 결과. 원장 구현 `BL/common/mastercode/MdmCodeLookup`(04 표 다섯 개, `MasterCodeLedgerQueries`)은 빈이 아니다 | 코드, D-077 |
| F13 | 컬럼 사전: `MdmColumnRepository.findByPhysName`, `MdmColumn.required`(boolean) 있음, **예시 값 칼럼 없음**. 유효 도메인 `MdmEffectiveDomainResolver.resolve(domainId) → MdmEffectiveDomain(domainId, effectiveStdExpr, effectiveStdAstJson, effectiveBizExpr, …, effectiveCodeRef …)` | 코드 |
| F14 | 테스트 관례: `BAT/dme/ruleEdit/*ServiceTest` 는 `@SpringBootTest(webEnvironment=MOCK)`·`@ActiveProfiles("local")`·`@Import(DmeTestSupport.Config.class)`·`@TempDir` SQLite + `@DynamicPropertySource`, `@BeforeEach` 에서 `DmeTestSupport.clear/clearDictionary/sampleRule/sampleDefinition`(JDBC 직접 INSERT, `QLTY_GRD_JDG` VER1 RELEASED + VER2 DRAFT). HTTP 는 `BAT/dme/DmeOasisHttpTest`(RANDOM_PORT, 실제 BPMN) | 코드 |
| F15 | 서비스 클래스 `@Transactional` 금지(OASIS 파라미터 이름 손실) → `TransactionTemplate`. 네이티브 UPDATE 뒤 엔티티 재조회. 네이티브 쓰기 감사 = `MdmNativeAuditSupport.currentStamp()`, 감사 카운터 `VER`(TEST_CASE 는 `VER` — Build 가 V8 로 확인). FE null 은 `omitNullish` 로 뺀다. 셀 JSON 은 문자열로 보낸다. 표 배열은 `grids.rows`(B4) | 08-02 design 「코드베이스 지식·함정」 |

### 0.3 엔진 (`maru-mdm-engine`)

| # | 사실 | 근거 |
|---|---|---|
| G1 | 생성기 `EJ/rule/CellTextGenerator`: `subject(RuleVar)`, `conditionText(RuleCell, subject, DataType, maruCodeId)`, `resultText(RuleCell, DataType)`, `patternRegex(String)`, `withTexts(RuleDefinition, Function<String,String> maruCodeIdByDomainId)`. 오류는 전부 `IllegalArgumentException`. **구간 op 는 양쪽 값이 필수**(`range()`·`required()` — 한쪽이 비면 IAE), IN 은 비면 IAE 이고 중복 제거·정렬은 하지 않는다. `withTexts` 는 첫 실패에서 멈춘다 → 셀별 이슈를 모으려면 셀마다 `conditionText`/`resultText` 를 따로 부른다. 숫자 리터럴 `NUMBER_LITERAL = ^[+-]?\d+(\.\d+)?$`(지수·16진 불허), BOOLEAN 은 `TRUE`/`FALSE`(대소문자 무시) | `CellTextGenerator.java:29-383` |
| G2 | 판정: `RuleEngine.evaluate(ruleId, record, evalTs)`, 구현 `MdmRuleEngine(ExpressionConfiguration, DefinitionLookup)`. 내부 `RuleEvaluator` 는 package-private → 메모리 정의 판정은 **DefinitionLookup 구현을 요청마다 만들어** `MdmRuleEngine` 에 넣는 길뿐이다(06:1079 "DefinitionLookup 구현체만 바꿔 운영 판정과 같은 엔진 경로") | `EJ/rule/RuleEngine.java`, `MdmRuleEngine.java:42-57` |
| G3 | `RuleResult(ruleId, ver, evalTs, hits[Hit(rowId, seq, groupChoices{res_grp→varId})], defaultApplied, results{name→BigDecimal|String|Boolean|null|List}, trace[RowTrace(rowId, seq, evaluated, hit, firstFalseVarId)], warnings[EngineWarning(EXPR_CELL_NULL|GRP_COND_NULL …)])` | `EJ/rule/RuleResult.java` |
| G4 | 판정 오류는 `EngineEvaluationException.violations()` → `Violation(Stage{SET_CHECK,INPUT_CHECK,ROW_SELECT,RESULT_CHECK,RESULT_EVAL}, Code{…MISSING_KEY, REQUIRED_NULL, TYPE_CONVERSION, UNIQUE_MULTIPLE_HITS, ANY_CONFLICT, EVALUATION_ERROR…}, ruleId, rowId, name, message)`. 예외가 나면 trace 는 잃는다(엔진은 고치지 않는다) | `EJ/expr/EngineEvaluationException.java` |
| G5 | 입력 계약: 엔진은 `def.contract()` 를 소비만 한다. 비면 `EMPTY_CONTRACT` 라 MISSING_KEY 단계가 돌지 않는다. 1단계 `always` 키 없음 → MISSING_KEY, 3단계 필수 키 없음 → MISSING_KEY / 값 null → REQUIRED_NULL(**키 없음과 NULL 을 구분**). 행 셀이 **없으면 NA 로 본다**(`firstFalse`: `cell == null → continue`) | `EJ/rule/RuleEvaluator.java:98,125-134,243-258,317-347` |
| G6 | **Java 입력 계약 계산은 없다**. TS `M/src/evalex/input-contract.ts`(157줄) `computeInputContract(rule: RuleDef, resolveType)` 만 있다. 06:458 패키지표는 입력 계약 계산을 `engine.rule` 에 둔다 | TSK-03-04 design:124, 코드 |
| G7 | `spi/DefinitionLookup`: `column(table, column)`, `rule(ruleId, evalTs)`, `ruleSet(setId)` + record `RuleDefinition(ruleId, ver, RuleKind, HitPolicy, applyFrom, applyTo, engineVersion, vars, InputContract contract, rows)`, `RuleVar(varId, VarKind, DispType, varName, exprText, exprAst, refVars, DataType, scale, domainId(String), CollectAgg, prioList, resGrp, grpCond, grpCondAst, seq)`, `RuleRow(rowId, seq, RowKind, Map<Integer,RuleCell> cells)`, `RuleCell(op, left, right, list, expr, ast, val, text)`, `InputContract(always, rows[RowContract(rowId, cond, required, optional)])`, `VarType(name, DataType, scale, domainId)`. main 구현 없음. 06 표기↔엔진 enum 대응은 TSK-08-01 design §6.4(571행)와 decisions.md:417(`Equal→EQUAL, 1→ONE, 2→TWO, Expression→EXPRESSION, Value→VALUE`). 스텁: `ET/rule/fixture/InMemoryDefinitionLookup`, `BLT/contract/stub/RuleDefinitionLookupStub`. 마커 enum `BL/contract/rule/MdmRuleDefinitionSource{STORED_VERSION, REQUEST_BODY}`("구현 TSK-08-04") | 코드 |
| G8 | `expr`: `ExpressionChecker(MdmEvaluator)`·`check(text, Slot) → List<Problem>`(예외 없음, PARSE·함수 화이트리스트·`STR_MATCHES` 리터럴+`RegexPolicy`·`MASTER`/`MASTER_AT` 인자 수·리터럴·`attr01`~`attr10`·식 안 예약 변수), `checkVariableName(name)`(상수 8개·`EVAL_TS`·`_` 접두). `Slot{DOMAIN_STD, DOMAIN_BIZ, RULE_COND_EXPR, RULE_RESULT_EXPR, RULE_EXPR_VAR, RULE_GRP_COND}` — 룰 칸은 표준 칸용 `FunctionSets.STANDARD`. `AstExporter.export(text, config)`. `MdmEvaluator.compile(text)`·`usedVariables(text)`·`evaluate(text, values, evalTs)`·`configuration()`. 상수 사전 회귀는 이미 `ET/expr/MdmExpressionConfigTest.상수_사전이_남고_상수_이름_값_넣기가_거부된다`·`create_설정이_고정값_14개와_같다` 가 잡는다 | 코드 |
| G9 | **없는 것**: Expression 셀 AST 에서 같은 변수를 대소 비교로 두 번 이상 견주는지 보는 검사, 저장 시 룰 세트 순서 검사(판정 시 `MdmRuleEngine.missingInputKeys` 만 있다), 셀 값 정규화 | grep 결과 |
| G10 | 분석기 `EJ/rule/RuleAnalyzer.analyze(AnalysisRule) → List<RuleIssue>`(08-02 §6.6.3 고정 API). `RuleIssueCode{ALL_NA_ROW(항상 ERROR), UNRESOLVED_CELL, OVERLAP(UNIQUE 만 ERROR), OVERLAP_UNRESOLVED, UNREACHABLE, VALUE_GAP, NULL_GAP}`. 코퍼스 `ER/analysis/analysis-corpus.json`(45건), 러너 `BLT/common/rule/RuleAnalysisCorpusTest`(`MIN_CASES = 30`) + TS `M/tests/dme/ruleEdit/rule-analysis-corpus.test.ts`. TS 에만 `DERIVE_ORDER` 코드가 더 있다(`analyzeDeriveOrder`) | 코드 |
| G11 | 아키텍처: 엔진은 EvalEx·`java.lang/util/math/time/text` 밖에 의존하지 못한다(Jackson·`java.io` 금지). 코퍼스 JSON 은 테스트에서만 읽는다 | `ET/arch/MaruMdmEngineArchitectureTest` |
| G12 | 도메인 표준 유효 식 평가 자리: `DefaultDomainValidator` 가 `ctx.put(ReservedNames.DOMAIN_VALUE, value)` 뒤 `evalBoolean(std, ctx, evalTs)`(87~88행). 룰 검사는 도메인 검증기를 통째로 부르지 않고 같은 방식(`value` 예약 키 + `MdmEvaluator.evaluate`)으로 표준 식만 돌린다 | `EJ/domain/DefaultDomainValidator.java` |

### 0.4 프런트

| # | 사실 | 근거 |
|---|---|---|
| H1 | `RULE_EDIT_CARDS`(`P/cards.ts:56-61`) = header(8)·versions(8)·table(16, `TableCardSlot` → `DecisionTableCard` + `RULE_TABLE_SECTIONS`)·usage(16). `RuleEditCardProps{view, me, editable, reload, selectVer, notify, runWrite, setDirty, canDo, busy}`. `page.tsx:162-175` 가 16칸 grid 로 순서대로 렌더. 카드 사이 공유는 props 뿐이고 context 가 없다 | 코드 |
| H2 | 표 편집 상태는 `DecisionTableCard` 의 로컬 `useReducer(tableReducer)`(`table-state.ts`)에만 있다. `saveRowsOf(state)`·`tableStoredRows(state)` 는 순수 함수다. 표 아래 섹션과는 `ColumnDraftSharedContext`(`P/sections/column-draft-context.tsx`: `colDirty, tableDirty, pivotDirty, setPivotDirty, setColDirty, highlightVarId, setHighlightVarId`)로만 나눈다 → **카드 밖에서 편집 중인 행을 읽을 길이 없다** | 코드 |
| H3 | 셀 칠하기: `columns.ts` 의 `CellMark{e,w,c,h}`·`TableMarks{diff, split, selectedRowId, serverShown}`·`displayRows()`·`cellRules(varId)`(`cell-light-pink`·`cell-warning`·`cell-edited`·`cell-emphasis`), 행 클래스 `getRowClassExtra`(`ag-row-inserted`). 값 테스트 표시용 자리는 없다 | `columns.ts:118-248`, `DecisionTableCard.tsx:99-199` |
| H4 | 저장 뒤 동치 배지: `handleSave` 가 `sameIssues(mapRowIds(before.issues, res.rowIdMap), server)` 로 **서버 이슈 전체**를 화면 분석 결과와 견준다(`analysis.ts:77`). 서버가 새 코드의 이슈를 더하면 배지가 깨진다 | `DecisionTableCard.tsx:140-150`, `analysis.ts` |
| H5 | `previewRule`(TS)은 결과 값을 계산하지 않는다(`rule-preview.ts:20-22` "결과 값 계산·집계는 서버 값 테스트 몫"). `computeInputContract(rule, resolveType)`·`alwaysNames(rule)` 는 있다. `ruleDefFromStored`(`grid-model.ts`)로 저장 형태 → `RuleDef` | 코드 |
| H6 | API: `P/api.ts`(serviceId `ruleEdit`)의 `callOasis<T>(serviceId, action, params, grids?)`(`M/src/dme/oasis-call.ts`). `viewRule(ruleId, ver?)` 는 상태를 바꾸지 않는 순수 호출이라 카드가 다른 버전의 정의를 따로 받아 둘 수 있다 | 코드 |
| H7 | 시안 카드 ④⑤⑥(`docs/mdm/design/basic/html/06-business-rule.html:248-260`, 스크립트 `renderTest` 2004~2026·`showResult` 2031~2042·`renderCases` 2055~2062·`tRun` 2279~2284·`tSaveCase` 2285~2291): ④ 제목 "값 테스트"+배지 "값 테스트 API", `대상` 선택(`편집본 · 버전 N 저장 전` 선두 + `버전 N · 상태`), 모드 설명, 입력 줄(라벨·물리명·타입 배지·입력 계약 배지 "조건·키 필수"/"N행 필수/선택"·**키 보냄** 확인란·값 칸 placeholder "비우면 NULL"·설명·도메인·도메인 표준 식·예시), 버튼 "돌리기"·"케이스로 저장". ⑤ "테스트 결과": 결과 변수 표(그룹이면 "그룹 열 N개 가운데 **라벨** `물리명`"), 적중 행, 참인 행·정책, 경고, 다른 버전이면 그 버전 표(초록 행 = 적중, 붉은 칸 = 첫 거짓 셀), 같은 버전이면 "적중 행은 위 의사결정표에 칠했다". ⑥ "테스트 케이스"+설명 "TB_MDM_RULE_TEST_CASE · 버전과 무관": 열 `case_id, 이름, 입력, 기대, 결과(대상), 동작`, 결과 배지 "돌려 보기만"/"통과"/"실패", 동작 "불러오기" | 시안 |
| H8 | e2e `src/frontend/e2e/mdm-ruleEdit.spec.ts`: serial, S1~S11(08-02)·C1~C6(08-03), 헬퍼 `login`·`openRuleEdit`·`pickRule`·`openRule`, 스크린샷 `screenshot()`(TSK-08-02)·`screenshot03()`(TSK-08-03). **S5 는 "오류가 있어도 저장된다(D3)"**(ALL_NA_ROW 행 저장), **S6 은 UNIQUE 로 바꾼 뒤 저장해 `dt-check-same`**을 확인한다. 픽스처 `e2e/fixtures/mdm-ruleEdit-data.sql` 에 TEST_CASE INSERT 없음, 룰마다 `LAST_CASE_ID = 0`. 룰: QLTY_GRD_JDG(v1 RELEASED FIRST — S4 가 v2 DRAFT 를 만든다, 세트 LS_E2E 에 담김)·E2E_LOCK_JDG·BASE_SPD_LKP·COIL_WGT_CALC·PROD_WGT_CALC·E2E_PVT_LKP | 코드 |
| H9 | Vitest 렌더 관례: 첫 줄 `/** @vitest-environment happy-dom */`, `createRoot`+`act`, `DmesUiProvider`, `../helpers/render` 의 `findButton, flush, installDomStorage, jsonResponse, visibleText`, 픽스처 `./fixtures` 의 `SAMPLE_VARS, draftView`. `M/tests/helpers/engine-paths.ts` 에 코퍼스 경로 상수 | `M/tests/dme/ruleEdit/decision-table-card.test.ts` |

## 1. 접근 방식

저장 시 검사는 **저장 경로 밖의 공용 검사기**로 만든다. `BL/common/rule/check/` 에 "정의(변수·행·적중 정책) + 적용 지점 → 정규화된 행 + 이슈"를
돌려주는 `RuleSaveValidator` 를 두고, TABLE 저장·COLUMNS 적용·값 테스트 BODY·뒤 Task(08-05 상신 시 검사 "저장 시 검사 전부")가 같은
검사기를 부른다(wbs:1829 "확정이 이 검사를 그대로 호출한다"). 검사는 두 층이다. 원장을 읽지 않는 셀·식 검사(타입·op·범위·경계·목록·패턴·
미완성·Expression·생성해 보기)는 검사기 안의 순수 클래스가 하고, 원장을 읽는 검사(도메인 범위·코드 참조·MDM 참조·필수 컬럼·세트 순서·
계약 변경·축 조합·식 결과 타입)는 08-02 가 남긴 확장점 `RuleSaveCheck` 빈으로 더한다. 거부는 **쓰기 전에** 일어나야 하므로 `RuleTableService`
의 흐름을 "읽기 → 정규화·검사 → ERROR 면 예외(롤백) → 정규화된 행 쓰기"로 바꾼다(D10, 08-02 I12 이탈). 분석기(08-02 이식본)는 다시 만들지
않고 그대로 불러 ERROR(ALL_NA_ROW·UNIQUE OVERLAP)를 거부로 올린다. 값 테스트는 엔진의 공개 경로 `MdmRuleEngine(config, DefinitionLookup)` 을
**요청마다 만든 DefinitionLookup**(저장된 버전 / 요청 본문 두 방식, `MdmRuleDefinitionSource`)으로 돌리고, 엔진이 비어 있으면 키 검사를 하지 않는
입력 계약을 채우려고 TS `computeInputContract` 를 `engine.rule.InputContracts` 로 옮긴다(분석기 이식과 같은 방식으로 한 벌 코퍼스를 JUnit·Vitest 가
함께 읽는다). 값 테스트는 원장에 한 줄도 쓰지 않는다. 테스트 케이스는 `TB_MDM_RULE_TEST_CASE` 에 저장 파트(part `CASE`)로 쓰고, 일괄 실행은
값 테스트 요청의 `runCases` 로 같은 정의에 돌린다. 화면은 카드 ④ 값 테스트·⑤ 테스트 결과·⑥ 테스트 케이스를 `RULE_EDIT_CARDS` 에 더하고,
편집 중인 표와 값 테스트 표시를 나누려고 페이지 단위 context 하나를 둔다. 적중 행·첫 거짓 셀·그룹에서 고른 열은 서버 판정 결과로만 칠한다
(06:731 "정식 판정은 서버").

## 2. 변경 파일 목록

### 2.1 생성 — 엔진

- `EJ/rule/InputContracts.java` — `public static InputContract compute(List<RuleVar> vars, List<RuleRow> rows, RuleKind kind, Function<String, VarType> resolveType)`.
  TS `input-contract.ts` 의 함수 경계·순회 순서·이름 정렬을 그대로 옮긴다(TS 파일은 고치지 않는다, 이상해 보여도 그대로 옮기고 보고).
  입력 모양은 엔진 `RuleVar`·`RuleRow`(셀 `ast` 는 `Map`). Jackson·Spring 금지(G11).
  (B1 이 더함) 라벨 오버로드 `compute(vars, rows, kind, resolveType, Map<Integer, String> labels)` — 엔진 `RuleVar` 에 라벨이 없어 cond 요약의
  이름 없는 열(식 변수) 이름을 TS 처럼 `label ?? _V<varId>` 로 적으려면 var_id → 라벨을 따로 받는다. `kind` 는 계산에 쓰지 않는다(TS 와 같은 경계).
- `ER/contract/input-contract-corpus.json` — `{"version":1, "cases":[{"id", "rule":{저장 형태 — analysis-corpus 의 rule 과 같은 모양 + 변수 타입 표}, "expect":{"always":[…], "rows":[{rowId, cond, required, optional}]}}]}`.
  사례: `M/tests/evalex-input-contract.test.ts` 의 사례 전부 + `QLTY_GRD_JDG`(06:1324 "row 3 만 BASE_FCT 필수") + 식 변수·Expression 조건 열·DERIVE seq 참조·결과 열 그룹 열 조건 각 1건 이상. 하한 **12**.
- `ET/rule/InputContractCorpusTest.java` — 엔진 test classpath 에 이미 `jackson-databind`(`E/build.gradle:39`, 선례 `ET/corpus/CorpusConformanceTest`)가 있으므로 엔진 모듈 안에서 코퍼스를 읽는다. 코퍼스의 저장 형태(06 표기 DISP_TYPE·셀 JSON 문자열)를 엔진 `RuleVar`·`RuleRow` 로 바꾸는 변환은 이 테스트 안의 도우미로 둔다(엔진 main 에 Jackson 금지, G11). 운영 변환 경로(`RuleDefinitionAssembler`)의 계약 결과는 B4 의 `RuleDefinitionAssemblerTest` 가 코퍼스 사례 하나 이상으로 따로 확인한다.
- `M/tests/evalex-input-contract-corpus.test.ts` — 같은 코퍼스를 운영 `ruleDefFromStored` + `computeInputContract` 로 돌려 전부 일치. `M/tests/helpers/engine-paths.ts` 에 `INPUT_CONTRACT_CORPUS_PATH` 추가.

### 2.2 생성 — 백엔드 검사기 (`BL/common/rule/check/`)

| 파일 | 내용 |
|---|---|
| `RuleLimits.java` | 상한 상수 한 곳(D6). 저장·값 테스트·케이스가 함께 쓴다 |
| `RuleSaveIssueCode.java` | 이슈 코드 enum(§6.2). 분석기 코드(`RuleIssueCode`)와 겹치지 않는 이름 |
| `RuleSaveTarget.java` | 적용 지점 enum `TABLE, COLUMNS, TEST_BODY, STORED`(STORED = 08-05 상신 검사가 저장된 DRAFT 를 다시 볼 때) |
| `RuleCheckInput.java` | record: `ruleId, ver, ruleKind, hitPolicy, List<MdmRuleVar> rawVars, List<ResolvedVar> vars, List<DraftRow> rows, RuleSaveTarget target`. `record DraftRow(int rowId, int seq, String rowKind, Map<Integer, Map<String,Object>> cells)`(rowId 는 새 행이면 음수) |
| `RuleCheckReport.java` | record: `List<DraftRow> normalizedRows`, `List<Map<String,Object>> issues`(이슈 맵 모양 §6.2), `boolean hasErrors()`, `Set<Integer> brokenRowIds()`(TEST_BODY 에서 판정에서 뺄 행) |
| `RuleCellRules.java` | 셀 하나의 정규화 + 검사(§6.3 표의 타입·op 허용·범위 자리·경계 순서·목록·`=` 패턴·CONTAINS·INSTR·결과 Value 타입). 원장을 읽지 않는 순수 static |
| `RuleExpressionChecks.java` | Expression 조건 셀·결과 식 셀: `ExpressionChecker.check`(Slot `RULE_COND_EXPR`/`RULE_RESULT_EXPR`) → 참조 변수 집합 검사 → 같은 변수 대소 비교 2회 이상 AST 검사 → **서버 AST 로 `ast` 를 덮어쓴다**(화면이 보낸 `ast` 는 믿지 않는다). DERIVE 결과 식의 자기·뒤 seq 참조 거부 |
| `RuleCompleteness.java` | 미완성(NORMAL 행 × 조건 열 키 없음, 결과 셀 없음 — 기본 행 포함) |
| `RuleGenerateTry.java` | 생성해 보기: 셀마다 `CellTextGenerator.conditionText`/`resultText` 를 따로 부르고 `MdmEvaluator.compile(text)`, `=` 패턴은 `CellTextGenerator.patternRegex` 결과를 `Pattern.compile`. 텍스트는 버린다 |
| `RuleSaveValidator.java` | `@Component`. `RuleCheckReport validate(RuleCheckInput in)`: 순서 = 모양(이미 통과한 입력) → `RuleCellRules`(정규화) → `RuleExpressionChecks` → `RuleCompleteness` → `RuleGenerateTry` → 분석기(`RuleAnalyzer` + `RuleAnalysisInputMapper`, 정규화된 행으로) → `RuleSaveCheck` 빈(`targets()` 에 입력의 적용 지점이 든 것만). **기본 단계(셀·식·미완성·생성·분석)도 §6.1 적용 지점 표를 따른다** — COLUMNS 에서는 기본 단계를 하나도 돌리지 않고(열 추가가 가능해야 한다, I18), TEST_BODY 에서는 셀·식·생성만 돌려 실패 셀을 `brokenRowIds` 로 모으고 미완성·분석은 돌리지 않는다. §6.1 표가 정본이다. `validateStored` 는 만들지 않는다 — 08-05 가 원장에서 읽어 `validate(… STORED)` 를 부른다(이 Task 는 `STORED` 적용 지점 값과 빈의 `targets()` 만 준비한다) |
| `RuleSaveCheck.java`·`RuleSaveContext.java`(이동) | 08-02 의 `BL/dme/ruleEdit/service/RuleSaveCheck`·`RuleSaveContext` 를 이 패키지로 **옮긴다**(구현 빈 0개, 사용처 `RuleTableService` 하나 — B3 가 다시 엮는다). 화면 패키지(`dme.ruleEdit`)와 공용 패키지(`common.rule.check`)가 서로를 가리키지 않게 하고, 08-05(다른 화면 패키지)가 `dme.ruleEdit` 타입을 끌고 가지 않게 한다. `RuleSaveCheck { List<Map<String,Object>> check(RuleSaveContext ctx); default Set<RuleSaveTarget> targets() { return EnumSet.of(TABLE, STORED); } }`. `RuleSaveContext` 에 `RuleSaveTarget target`·`List<MdmRuleVar> rawVars` 칼럼을 더한다. javadoc: "쓰기 전에 부른다. ERROR 가 하나라도 있으면 거부한다" |
| `RuleSaveRejections.java` | `BusinessException reject(List<Map<String,Object>> issues)`: `MdmErrorCode.INVALID_INPUT`(MDM021, D2) + 메시지 `"룰 저장 거부: " + ERROR 이슈 요약("CODE[행 r·열 v] 메시지; …")` + details `ErrorDetail.of(MDM021)` 뒤 이슈마다 `ErrorDetail.ofGrid(null, "row:"+r, "var:"+v, code, message)`. `DomainRejections` 모양을 따르고 공유 파일 `MdmErrors` 는 고치지 않는다 |
| `RuleDefinitionReads.java` | 룰 하나가 **읽는 이름**(COND `var_name` 중 식 변수가 아닌 것 + 식 변수 `var_ast` + Expression 셀·결과 식 `ast` 의 `VARIABLE_OR_CONSTANT` 노드)과 **만드는 이름**(RESULT `var_name`, 그룹이면 `res_grp`). `RuleUsageFinder` 의 같은 계산을 이 클래스로 옮기고 `RuleUsageFinder` 는 이것을 부르게 한다(동작 불변 — `RuleUsageServiceTest` 가 지킨다) |
| `AxisCoverage.java` | 축 조합 완전성 경고(`PIVOT_COVER_INCOMPLETE`). `RuleColumnsService.pivotCoverWarning`(382~425)을 옮긴 것. COLUMNS·TABLE 이 함께 쓴다 |

`RuleSaveCheck` 빈(원장을 읽는 검사, `BL/common/rule/check/ledger/`):

| 빈 | 검사(06 「저장 시 검사」 행) | 심각도 | 적용 지점 |
|---|---|---|---|
| `DomainRangeCheck` | 도메인 범위: 셀 리터럴 값마다 도메인 유효 표준 식을 `value` 하나로 평가(G12). CODE 종류는 건너뛴다. 비즈니스 식은 평가하지 않는다 | WARNING | TABLE, STORED |
| `CodeReferenceCheck` | 코드 참조: 코드 도메인 변수의 `EQ`·`NE`·`IN`·`NOT_IN` 값이 그 마루 코드에 있는지 `MASTER(id, cate, key)`(등록 시각) — 없으면 WARNING. `CODE_IN` 값이 그 마루 코드의 카테고리가 아니면 ERROR. **원장 조회는 검사 안에서만**(D7) | WARNING / ERROR | TABLE, STORED |
| `MasterReferenceCheck` | MDM 참조: Expression 셀·결과 식·식 변수·열 조건 AST 의 `MASTER`·`MASTER_AT` 첫 인자 ID 가 TB_MDM_CODE 또는 TB_MDM_DATA 에 있고, 둘째 인자 카테고리가 그 아래 있고, `attr` 이 있으면 그 대상의 그 번호에 라벨이 있어야 한다(인자 수·리터럴 모양은 `ExpressionChecker` 가 이미 본다) | ERROR | TABLE, COLUMNS, STORED |
| `RequiredColumnNullCheck` | 필수 컬럼(`MdmColumn.required`)에 `IS_NULL`·`NOT_NULL` 셀 | WARNING | TABLE, STORED |
| `RuleSetOrderCheck` | 룰 세트 순서(§6.4) | ERROR(순서·순환) / WARNING(같은 결과 변수 중복 대입) | TABLE, COLUMNS, STORED |
| `ContractChangeCheck` | 입력 계약 변경: 지금 RELEASED 버전과 `InputContracts` 로 견준다. 필요 변수 늘음·선택→필수 | WARNING | TABLE, COLUMNS |
| `AxisCoverageCheck` | 축 조합 완전성(`AxisCoverage`) | WARNING | TABLE, STORED(COLUMNS 는 08-03 기존 자리에서 그대로) |
| `ExprTypeByCaseCheck` | Expression 결과 타입: 저장된 테스트 케이스로 새 정의를 돌려 조건 식이 boolean 이 아니거나 결과 타입 변환에 실패하면 경고(D9) | WARNING | TABLE, COLUMNS |

(B6 이 더함) 원장 조회 도우미 빈 `RuleLedgerReads`(TB_MDM_CODE·TB_MDM_DATA·카테고리·`ATTRnn_NAME`)와 셀 순회 도우미 `LedgerCells` 를 같은 패키지에 둔다. 빈 순서(`@Order`)는 §6.1 표 순서다.

### 2.3 생성 — 백엔드 값 테스트·테스트 케이스

- `BL/common/rule/definition/RuleDefinitionAssembler.java` — (규칙 헤더, `List<MdmRuleVar>`, `List<ResolvedVar>`, 행) → 엔진 `RuleDefinition`.
  매핑은 TSK-08-01 design §6.4 그대로(`DISP_TYPE` 06 표기 → enum, `DOMAIN_ID Long → String`, `VAR_KIND`·`ROW_KIND`·`HIT_POLICY` valueOf,
  식 변수 `exprText`·`exprAst`·`refVars`, 결과 열 `collectAgg`·`prioList`·`resGrp`·`grpCond`·`grpCondAst`). 셀 텍스트는 셀마다
  `CellTextGenerator` 로 채우고(`withTexts` 를 쓰지 않는다 — 첫 실패에서 멈추므로), 계약은 `InputContracts.compute`. 타입 해석은
  `ResolvedVar`(`dataType`·`scale`·`domainId`)를 쓴다. 화면 계약(`contract-view.ts` `computeContract`)과 같아지려면(B1 기록): 라벨 오버로드에
  `ResolvedVar.label` 을 var_id 별로 넘기고, 식 변수 `refVars` 는 **null** 로 둔다(`InputContracts` 는 null 일 때만 `exprAst` 를 걷는다 — 화면은
  AST 가 있으면 참조 변수 목록을 쓰지 않는다). (B4 가 바꿈) 실제로는 `refVars = InputContracts.usedVariables(exprAst)`(AST 가 없으면 null)다 — 엔진이 `refVars` 로 참조 변수 NULL 가드를
  돌기 때문이고, 같은 값·순서라 계약은 그대로다(build-log 「B4」 이탈 1). `resGrp` 는 공백뿐이면 null·아니면 저장값 그대로. `RuleDefinitionAssemblerTest` 는 QLTY_GRD_JDG 와
  함께 라벨 있는 식 변수 사례(코퍼스 `expr-var-label-default-row` 모양)로 계약을 확인한다.
- `BL/common/rule/definition/SingleRuleDefinitionLookup.java` — `implements DefinitionLookup`. 정의 하나를 들고 `rule(id, ts)` 는 id 가 같으면 그 정의,
  `column`·`ruleSet` 는 `Optional.empty()`. **스프링 빈으로 등록하지 않는다**(요청마다 `new`) → `BAT/.../MdmBusinessRuleMigrationTest` 의
  `계약_전용_06_확정_검사와_정의_조회_빈이_없다` 가 그대로 통과한다.
- `BL/common/rule/definition/StoredRuleDefinitions.java` — 원장에서 (ruleId, ver) 의 변수·행을 읽어 조립(STORED_VERSION).
- `BL/common/rule/RuleTestCaseQueries.java` — `TB_MDM_RULE_TEST_CASE` 조회(JPQL/네이티브, 리포지토리 메서드 선언 금지 F9).
- `BL/dme/ruleEdit/service/RuleValueTestService.java` — `@Service`. `RuleTestResult run(RuleTestRequest)`(§6.5).
- `BL/dme/ruleEdit/service/RuleTestCaseService.java` — `implements RuleEditSavePart`, `part() = "CASE"`(§6.6).
- `BL/common/rule/RuleTestCaseWrites.java` — 조건부 네이티브 UPDATE/DELETE(`ROW_VERSION` 조건, 감사 칼럼).
- DTO: `BL/dme/ruleEdit/dto/RuleTestRequest.java`, `RuleTestResult.java`(§6.5 모양).

### 2.4 수정 — 백엔드

| 파일 | 바꾸는 것 | 담당 |
|---|---|---|
| `BL/dme/ruleEdit/service/RuleTableService.java` | 흐름 재배치(§6.1): 트랜잭션 안에서 `beginDraftWrite` → `checkRows` → `RuleSaveValidator.validate(TABLE)` → ERROR 면 `RuleSaveRejections.reject` → 정규화된 행을 발급·삭제·INSERT. 트랜잭션 밖 분석(I12)은 그대로 두고, 응답 issues = 커밋 뒤 분석 이슈 + 검사기의 비분석 이슈(임시 row_id 를 `rowIdMap` 으로 바꿔서). `ObjectProvider<RuleSaveCheck>` 주입을 `RuleSaveValidator` 주입으로 바꾼다. 클래스 javadoc 의 D3 문장을 고친다 | B3 |
| `BL/dme/ruleEdit/service/RuleSaveCheck.java`, `RuleSaveContext.java`(삭제) | B2 가 `BL/common/rule/check/` 에 새 계약을 만든다(§2.2). 옛 두 파일은 B2 가 남겨 두어 빌드를 초록으로 유지하고, B3 가 `RuleTableService` 를 새 검사기로 엮으면서 지운다 | B3 |
| `BL/dme/ruleEdit/service/RuleColumnsService.java` | 원자 적용 트랜잭션 안, 커밋 직전에 `RuleSaveValidator.validate(COLUMNS)` 를 적용 뒤 정의로 부르고 ERROR 면 거부(롤백), WARNING 은 응답 issues 에 잇는다. `pivotCoverWarning` 은 `AxisCoverage` 호출로 바꾼다(동작 불변) | B6 |
| `BL/common/rule/RuleUsageFinder.java` | 이름 계산을 `RuleDefinitionReads` 호출로 바꾼다(동작 불변) | B6 |
| `BL/dme/ruleEdit/service/RuleEditService.java` | `public RuleTestResult runTest(RuleTestRequest)`(→ `RuleValueTestService`) 추가. 클래스 주석의 "08-04 는 validate 를 값 테스트에도…" 를 "값 테스트는 execute action(D3)" 으로 고친다 | B4 |
| `BA/resources/services/dme/ruleEdit.bpmn` | actionGateway 에 `execute` 갈래 + `executeTask`(`camunda:class="ruleEditService"`, `method=runTest`, `output=result`, `dto=…RuleTestRequest`). 두 번째 게이트웨이 금지. `bpmn-skill`·`oasis-project-support` 스킬로 작성·검증 | B4 |
| `BL/dme/ruleEdit/dto/RuleEditSaveRequest.java` | part CASE 용 칸 추가: `caseId(Integer)`, `caseName`, `inputJson`, `expectedJson`, `description`, `caseDeleted(Boolean)`. 기존 칸 불변 | B5 |
| `BL/dme/ruleEdit/dto/RuleEditSaveResult.java` | `caseId`(Integer, CASE 파트만) 칸 추가 | B5 |
| `BL/dme/ruleEdit/service/RuleViewService.java`, `dto/RuleEditViewResult.java` | `testCases[{caseId, caseName, inputJson, expectedJson, description, rowVersion}]`(case_id 오름차순) 추가. **`issues` 는 지금처럼 분석기 결과만**(D11) | B5 |
| `BAT/dme/DmeBpmnActionTest.java` | `ruleEdit` 액션 집합에 `execute`(readOnly 아님 — 쓰기는 없지만 EDIT 권한 액션) 추가, 메서드 이름에 `_execute` | B4 |
| `BAT/dme/DmeOasisHttpTest.java` | `execute` HTTP 경로(담당자 성공, 비소유 담당자도 성공, READ 전용 사용자는 BFF 권한에서 막히므로 이 테스트 범위 밖) 1건 | B4 |

### 2.5 생성·수정 — 프런트

| 파일 | 내용 | 담당 |
|---|---|---|
| `P/state/workbench-context.tsx`(생성) | `RuleWorkbenchContext{ tableDraft: {ver, hitPolicy, rows: StoredRow[] (saveRowsOf 모양), dirty, rev} \| null, publishTableDraft, testRun: TestRunView \| null, setTestRun, colDirty }`. `page.tsx` 가 카드 목록을 감싼다. (B7 이 바꿈) `tableDraft` 에 `ruleId`, 값에 `testRunCleared`·`setColDirty`, `TestRunView{ruleId, target, ver, rowVersion, rev, result}` — build-log 「B7」 인계. (B8 이 더함) ④ 가 고른 대상·입력 `valueTestInput`·`publishValueTestInput`, 케이스 불러오기 `caseLoad`·`loadCase` — build-log 「B8」 | B7 |
| `P/page.tsx` | 위 Provider 로 카드 목록을 감싼다 | B7 |
| `P/decision-table/DecisionTableCard.tsx` | ① 표 상태가 바뀔 때 `publishTableDraft`(rev 증가) ② `testRun` 이 이 카드가 보이는 정의(BODY 또는 `view.selectedVer` 와 같은 버전)의 결과면 `TableMarks.test` 로 넘긴다 ③ BODY 결과를 받은 뒤 표가 바뀌면(rev 가 다르면) 표시를 지우고 안내 ④ 저장 실패(거부) 때 메시지를 보이고 편집 상태를 유지 | B7 |
| `P/decision-table/columns.ts` | `TableMarks.test?: {hitRowIds, firstFalse: Map<rowId,varId>, chosenVarIds, dimmedVarIds}`, `CellMark` 에 `t`(`hit`\|`false`\|`chosen`\|`dim`), `cellRules` 에 클래스 4개, 행 클래스(적중 행). (B7 이 바꿈) `TableMarks.test` 는 `{hitRowIds, firstFalse, chosen: Map<rowId,Set<varId>>, dimmed: Map<rowId,Set<varId>>}`(행마다) | B7 |
| `P/decision-table/analysis.ts` | `sameIssues` 비교 범위를 분석기 코드(`ALL_NA_ROW, UNRESOLVED_CELL, OVERLAP, OVERLAP_UNRESOLVED, UNREACHABLE, VALUE_GAP, NULL_GAP, DERIVE_ORDER`)로 좁힌다(`ANALYZER_CODES` 상수). 나머지 서버 이슈는 "서버 저장 검사" 목록으로 따로 보인다 | B7 |
| `P/value-test/test-input.ts`(생성) | 입력 줄 모델: `inputFields(rule: RuleDef, view, varMeta) → {name, label, typeBadge, contractBadge, domainDef, description}[]`(이름 = `always` ∪ 행별 필수·선택, `computeInputContract` 재사용), `buildInputJson(fields, values, keySent) → string`(키 보냄 끔 = 키 없음, 빈 칸 = `null`). (B7 이 바꿈) `inputFields(src: ContractSource, asts, candidates?)`·`fieldsOfContract(contract, vars, candidates)`·`inputFromCase` | B7 |
| `P/value-test/test-marks.ts`(생성) | 서버 결과 → `TableMarks.test` 변환, 그룹 고른 열·흐린 열 계산. (B7 이 더함) `testMarksOf(result, vars, meta, defaultRowId)`·`runShownOnTable`(VERSION 은 같은 row_version·변경 없음일 때만)·`testRunAfterTableChange` | B7 |
| `P/value-test/case-model.ts`(생성) | 결과 → 기대 JSON(`expectedFromResult`, §6.5 hit 표현), 케이스 결과 배지 문구. (B7 이 바꿈) `expectedFromResult(result, vars, defaultRowId)`(기본 행 적용 때 엔진 hits 가 비어 기본 행 row_id 를 받는다)·`hitValue`·`caseBadge` | B7 |
| `P/api.ts`, `P/types.ts` | `runValueTest(req)`(action `execute`, 본문 행은 `grids.rows`), `saveTestCase`·`deleteTestCase`(action `save`, part `CASE`), 타입 `ValueTestResult`·`TestCaseView`·`RuleEditView.testCases` | B7 |
| `P/value-test/run-request.ts`(생성, B8 이 더함) | 대상 선택지·값 테스트 요청·`TestRunView` 의 rev·rowVersion·다른 버전 정의 캐시(`useTargetView`) — ④⑤⑥ 공용 | B8 |
| `P/cards/ValueTestCard.tsx`(생성) | 카드 ④(§6.7) | B8 |
| `P/cards/TestResultCard.tsx`(생성) | 카드 ⑤ | B8 |
| `P/cards/TestCaseCard.tsx`(생성) | 카드 ⑥ | B8 |
| `P/cards.ts` | `RULE_EDIT_CARDS` 를 header·versions·table·**valueTest(8)·testResult(8)·testCases(16)**·usage 순으로(06:749 카드 순서). 배열 항목만 더한다 | B8 |
| shared 그리드 셀 클래스 | 값 테스트 칠하기 클래스가 shared 토큰에 없으면 shared 그리드 테마에 더한다(`mantine-aggrid-ui` 스킬, 색 값 직접 금지, audit 0) | B7 |

### 2.6 생성·수정 — 테스트·e2e·문서

- Vitest(`M/tests/dme/ruleEdit/`): `value-test-input.test.ts`, `value-test-marks.test.ts`, `case-model.test.ts`, `analysis-same.test.ts`(또는 기존 파일에 사례 추가), `value-test-cards.test.ts`(렌더, happy-dom).
- JUnit: `BLT/common/rule/check/RuleCellRulesTest.java`, `RuleExpressionChecksTest.java`, `RuleCompletenessTest.java`, `RuleGenerateTryTest.java`(순수),
  `BAT/dme/ruleEdit/RuleTableSaveCheckTest.java`, `RuleLedgerChecksTest.java`, `RuleValueTestServiceTest.java`, `RuleTestCaseServiceTest.java`,
  `BAT/common/rule/RuleDefinitionAssemblerTest.java`.
- e2e: `src/frontend/e2e/mdm-ruleEdit.spec.ts`(V1~V6 추가, S5·S6 수정 §3.4), `e2e/fixtures/mdm-ruleEdit-data.sql`(E2E_VT_JDG·테스트 케이스), 스크린샷 `docs/mdm/tasks/TSK-08-04/screens/`.
- 문서: `docs/mdm/screens/ruleEdit/ruleEdit_기능설계서.md` 에 카드 ④⑤⑥ 절과 「저장 시 검사」 절(§6.1 표 요약)을 더한다(08-02 가 카드별 절로 나눠 두었다).

### 2.7 수정하지 않는 것 (명시)

- `RuleAnalyzer`·`AnalysisRule`·`AnalysisVar`·`RuleIssue`·`RuleIssueCode`(08-02 §6.6.3 고정), TS `rule-analysis.ts`·`value-set.ts`·`pattern.ts`·`input-contract.ts`·`rule-preview.ts`.
- `RuleCellsCodec`(모양 검사만, I17 유지 — 정규화는 `RuleCellRules`), `ResolvedVar` record, `CellTextGenerator`·`RuleEvaluator`·`MdmRuleEngine` 등 엔진 평가 경로.
- `MdmErrorCode`·`MdmErrors`(공유 파일, D-096 원칙), `DataInitializer` 권한 세트(`mdm-rbac-seed-check.expected.txt` 불변), `MdmActions`.
- Flyway 마이그레이션(테이블이 이미 있다), `MdmCodeLookup` 의 빈 등록(D-077 유지).
- 룰 세트 편집 화면·세트 값 테스트·상신·배포 대상 카드 ⑦(08-05·08-06·보류).

## 구현 단위

반려 재작업(1회차) 단위 표다. 1차 라운드 표(B1~B9, 모두 머지됨)는 `0d27c254:docs/mdm/tasks/TSK-08-04/design.md` 에 있으며 다시 돌리지 않는다.

| 단위 | 묶음 | 범위(파일·기능) | 새 테스트 | 담당 불변 규칙 |
|---|---|---|---|---|
| B1 | 1 | §R2 표 전부 — `BL/common/rule/RuleCellsCodec.java`, `BL/dme/ruleEdit/service/RuleColumnsService.java`, `BL/common/rule/definition/RuleDefinitionAssembler.java`, `BL/common/rule/check/RuleExpressionChecks.java`, `BL/common/rule/check/RuleSaveValidator.java`, `BL/common/rule/RuleAnalysisInputMapper.java`, `BL/common/rule/check/RuleGenerateTry.java`, `BL/common/rule/RuleIoReader.java`, `BL/common/rule/check/RuleDefinitionReads.java`, `BL/common/rule/check/ledger/MasterReferenceCheck.java`, `BL/dme/ruleEdit/service/RuleViewService.java`, `BL/common/rule/confirm/RuleVersionDiffs.java`, 테스트 `BAT/dme/RuleSetLifecycleOasisFlowTest.java`·`BAT/dme/ruleEdit/{RuleColumnsServiceTest,RuleValueTestServiceTest,RuleEditViewTest,RuleTableServiceTest}.java`·`BLT/common/rule/{RuleCellsCodecTest,definition/RuleDefinitionAssemblerTest,confirm/RuleVersionDiffsTest}.java`, `M/tests/dme/ruleEdit/column-draft.test.ts`, `docs/mdm/tasks/TSK-09-02/defects.md` | §R3 1~9 | RR1~RR14 |

- 단위 하나다 — 도구 호출 약 60~100회로 보이고 백엔드 한 모듈(mdm) 안이라 나눌 이득이 없다(FE 는 픽스처 한 줄).

## 3. 테스트 전략

모든 백엔드 테스트는 testAll 안에서 SQLite 로만 돈다(도커 금지). 순수 검사 클래스는 `BLT` 단위 테스트(스프링 없이), 원장을 읽는 것은 `BAT` 의 F14 관례.

### 3.1 백엔드 — 검사기 (B2·B3·B6)

- `RuleCellRulesTest`: §6.3 표의 **행마다 거부 1건 + 통과 1건**(정규화가 있는 행은 정규화 결과까지). 예: `<= 변수 <` 상한 빈칸 → `GE`, `<` 하한 → `GT`, 하한 빈칸 `<=` 상한 → `LE`, `<` → `LT`; `1.10`·`1.1` 같음 → BOUND_EQUAL; `2.5`·`1.6` → BOUND_ORDER; 양쪽 빈칸 → BOUND_EMPTY; IN `["B","A","B"]` → `["A","B"]`, NUMBER IN `["10","9","9.0"]` → 값 정렬 `["9","10"]`(같은 값 `9`·`9.0` 은 첫 원소를 남긴다); `SGC%%` → `SGC%`; `%` 단독 거부; `%` 4개 거부; `\%` 는 개수에 넣지 않음; 일자 도메인 `2026%` 거부; NUMBER `1e3`·`0x1F` 거부; BOOLEAN `yes` 거부·`true` → `TRUE`; CONTAINS 빈 값 거부; 상한 경계(같으면 통과·+1 거부); op 허용 행렬(06:130-176)의 모든 (disp, 데이터 타입) 조합 파라미터 테스트; 1 열에 구간 op 거부.
- `RuleExpressionChecksTest`: 파싱 실패, 화이트리스트 밖 함수, `STR_MATCHES` Java 전용 문법(`(?i)`), `MASTER` 인자 수, 모르는 변수, 같은 변수 `COIL_THK > 1 && COIL_THK < 3` 거부(`COIL_THK > 1 && COIL_WID < 3` 통과), 화면이 보낸 틀린 `ast` 를 서버 AST 로 덮어씀, DERIVE 결과 식 자기·뒤 seq 참조 거부.
- `RuleCompletenessTest`: NORMAL 행 조건 키 없음 거부, 결과 셀 없음(기본 행 포함) 거부, `{"op":"NA"}` 는 통과.
- `RuleGenerateTryTest`: 생성 실패 셀(엔진 IAE) → GENERATE_FAILED 이슈에 행·열, 정상 셀 텍스트는 버리고 이슈 없음, 패턴 정규식 컴파일.
- `RuleTableSaveCheckTest`(B3, SQLite): ① ALL_NA_ROW 행 저장 거부 → `TB_MDM_RULE_ROW`·`HIT_POLICY`·`ROW_VERSION`·`LAST_ROW_ID` 무변경(네이티브 조회로 전후 비교), 오류 코드 MDM021·메시지 접두 "룰 저장 거부:" ② UNIQUE 겹침 거부, 같은 표 FIRST 는 저장되고 OVERLAP WARNING ③ 미완성 거부 ④ 경고만이면 저장되고 응답 issues 에 경고(새 행의 임시 row_id 가 발급 번호로 바뀜) ⑤ 한쪽 빈 구간이 GE 로 저장되고 응답 `rows` 도 정규화된 값 ⑥ 비소유자는 검사보다 먼저 MDM003(순서 불변) ⑦ 저장 행 수·셀 길이 상한 +1 거부.
- `RuleLedgerChecksTest`(B6, SQLite): 도메인 범위 경고(표준 식 `value >= 0` 도메인에 `-1`), CODE 도메인 건너뜀, 코드 값 없음 경고·카테고리 없음 거부(원장에 코드·카테고리 픽스처 INSERT), `MASTER("없는ID", …)` 거부·카테고리 없음 거부·라벨 없는 attr 거부, 필수 컬럼 `IS_NULL` 경고, 세트 순서(뒤 룰 결과 읽기 거부 — 메시지에 세트 ID·옮길 룰, 앞 룰이 새 결과 읽기 거부, 서로 읽기 순환 거부, 같은 결과 변수 중복 대입 경고, DEPRECATED 세트는 보지 않음), 계약 변경 경고(필요 변수 늘음), COLUMNS 적용에서 세트 순서 거부 시 롤백·미완성 검사 미적용(열 추가 적용이 성공), 테스트 케이스로 조건 식 비불린 경고.
- 기존 가드: `RuleUsageServiceTest`(이름 계산 이동 뒤 동작 불변), `RuleColumnsServiceTest`(축 조합 이동 뒤 불변), `RuleAnalysisCorpusTest`(코퍼스 불변).

### 3.2 백엔드 — 값 테스트·테스트 케이스 (B1·B4·B5)

- `InputContractCorpusTest` + `evalex-input-contract-corpus.test.ts`: 한 벌 코퍼스 전부 일치, 하한 12.
- `RuleDefinitionAssemblerTest`: `QLTY_GRD_JDG` v1 → 엔진 정의(DISP 대응·셀 텍스트가 06:1326-1328 예와 같음·계약 "row 3 만 BASE_FCT").
- `RuleValueTestServiceTest`(SQLite): ① VERSION(v1 RELEASED) 판정 = 06:1322 케이스(`QLTY_GRD` A, `PRC_FCT` 1.05, hit 1) ② BODY(음수 새 행 포함, 미완성 행 포함)로 판정되고 **원장 무변경**(VER·VAR·ROW·TEST_CASE 행 수와 해시, `TB_MDM_RULE.LAST_ROW_ID`·`LAST_CASE_ID`, `ROW_VERSION` 전후 동일, 발급기 미호출 — 발급기를 `@SpyBean` 으로 감싸 0회) ③ 키 보냄 끔 → MISSING_KEY(INPUT_CHECK), 키 있고 null → 필수 변수면 REQUIRED_NULL ④ 트레이스의 `firstFalseVarId` ⑤ 깨진 셀 행은 빠지고 `cellErrors`·`skippedRows` ⑥ 빠진 셀은 NA 로 보고 경고(D5) ⑦ UNIQUE 다중 적중은 `errors` 에 `UNIQUE_MULTIPLE_HITS`(trace 없음) ⑧ `runCases` — 통과·실패(불일치 키)·기대값 없음 ⑨ 상한: 본문 행 수·셀 길이 합·`inputJson` 길이·키 수 — 같으면 통과·+1 거부(MDM021) ⑩ 비소유 담당자·DRAFT 아닌 버전도 VERSION 판정 가능.
- `RuleTestCaseServiceTest`(SQLite): 새 케이스 → `LAST_CASE_ID` 발급 번호, 수정은 `ROW_VERSION` 조건(틀리면 MDM001), 삭제(`caseDeleted`), JSON 아닌 입력은 DB CHECK 전에 INVALID_VALUE, 상한(이름·JSON 길이·룰당 케이스 수) 거부, 비담당자 MDM013, EXTERNAL 룰 거부, 폐기 룰 거부, 버전과 무관(DRAFT 없이도 저장).
- `DmeBpmnActionTest`(execute 추가), `DmeOasisHttpTest`(execute 한 건: 실제 BPMN 을 태워 결과 모양 확인), `MdmOasisActionVocabularyTest`(불변 통과).

### 3.3 프런트 단위 (Vitest, B7·B8)

- `value-test-input.test.ts`: 입력 줄 = 계약 이름 합집합, 배지 문구("조건·키 필수", "N행 필수"/"N행 선택"), `buildInputJson` 이 키 보냄 끔 → 키 없음, 빈 칸 → `null`, 값은 문자열 그대로.
- `value-test-marks.test.ts`: 적중 행·첫 거짓 셀·그룹 고른 열·흐린 열, BODY 결과 뒤 rev 변경 → 표시 없음.
- `case-model.test.ts`: `expectedFromResult`(단일 적중 = 숫자, 여러 행 = 배열, 기본 행 = 기본 행 row_id, 없음 = null), 배지 문구.
- `analysis-same.test.ts`: 서버 이슈에 비분석 코드(`CODE_REF_MISSING` 등)가 더 있어도 `sameIssues` 가 참, 분석 코드가 다르면 거짓.
- `value-test-cards.test.ts`(happy-dom): 카드 셋 렌더, 편집본 대상은 `editable` 일 때만, "돌리기" 가 `execute` 요청 본문(`target`, `grids.rows`, `inputJson`)을 만든다, 결과 카드가 결과 변수·적중 행을 보인다, 케이스 목록 빈 상태 문구, "케이스로 저장" 요청 본문(part CASE), "모두 돌리기" 결과 배지.
- 기존 파일에 영향: `rule-edit-page.test.ts` 가 카드 수·순서를 고정하면 7개로 바꾼다(의도한 변경, §3.5).

### 3.4 브라우저 E2E (e2e.md 「스모크 넷」 포함, B9)

`src/frontend/e2e/mdm-ruleEdit.spec.ts` 에 `screenshot04(name)` = `docs/mdm/tasks/TSK-08-04/screens/<name>` 헬퍼를 두고 C6 뒤에 붙인다(serial).
픽스처에 `E2E_VT_JDG`(DECISION, INUSE, UNIQUE, v1 RELEASED + v2 DRAFT 소유 `e2e_mdm_steward`, 조건 COIL_THK(2)·SURF_GRD(1), 결과 QLTY_GRD Value,
행 3 + 기본 행)와 테스트 케이스 2건(1: 기대값 맞음, 2: 기대값 틀림 — 실패 시연)을 넣고 `TB_MDM_RULE.LAST_CASE_ID = 2` 로 맞춘다
(0 이면 화면 케이스 저장이 PK 충돌). QLTY_GRD_JDG 는 S4~S6 이 바꾸므로 값 테스트는 E2E_VT_JDG 로만 한다.

| 시나리오 | 조작과 확인 | 스모크 넷 |
|---|---|---|
| V1 메뉴·목록 | 담당자가 메뉴로 룰 화면을 열고 E2E_VT_JDG 를 고른다 → 카드 ④⑤⑥ 이 보이고 케이스 표에 서버 케이스 2건. QLTY_GRD_JDG 로 바꾸면 케이스 표가 빈 상태 문구 | 1·2 |
| V2 저장된 버전 | 대상 `버전 1 · RELEASED`, 값 입력 → 돌리기 → 결과 카드에 결과 값·적중 행, 보이는 표(v2)와 달라 결과 카드에 v1 표가 따로(적중 행·첫 거짓 칸 클래스) | — |
| V3 편집본 | v2 그리드 칸을 저장하지 않고 고친 뒤 대상 `편집본` 으로 돌리기 → 의사결정표에 적중 행·첫 거짓 칸 클래스. 칸을 다시 고치면 표시가 지워지고 "다시 돌리세요". 한 입력의 키 보냄을 끄고 돌리면 판정 오류(MISSING_KEY) 표시 | — |
| V4 케이스 | "케이스로 저장"(이름 입력) → 케이스 표에 새 줄. "모두 돌리기" → 케이스 1 통과·2 실패(불일치 키 표시)·새 케이스 통과 | 3 |
| V5 서버 오류 | 입력 칸에 상한을 넘는 긴 값을 넣고 돌리기 → 카드에 서버 오류(MDM021 메시지) | 4 |
| V6 저장 거부 | v2 에서 두 행을 겹치게 고치고(UNIQUE) 표 저장 → "룰 저장 거부" 와 `OVERLAP` 이 보이고 표는 dirty 유지, 다시 불러오면 바뀌지 않음 | (수용 2·3) |

기존 시나리오 수정(의도한 강화, §3.5): **S5** — ALL_NA_ROW 새 행 저장이 거부되는 것을 확인하고(메시지에 `ALL_NA_ROW`), 조건 칸 하나를
채운 뒤 저장해 `dt-row-5` 가 남는지 본다(08-02 D3 「반려되면 재작업 방향」 그대로). 이어지는 `[ALL_NA_ROW] 행 5` 확인은 없앤다(그 행은 더 이상
ALL_NA 가 아니다). **S6** — FIRST 에서 겹침 저장 → 경고와 "화면·서버 검사 일치"; UNIQUE 로 바꾸면 화면에 오류 → 저장 → 거부 메시지와
`OVERLAP`, 적중 정책이 서버에서 FIRST 로 남음. 08-03 C 시나리오가 표 저장에서 거부되면 먼저 픽스처·시나리오 데이터가 06 규칙상 틀린지
본다 — 틀렸으면 데이터를 고치고 build-log 「설계 이탈」 에 적는다. 검사를 느슨하게 하지 않는다.

### 3.5 의도해서 뒤집는 기존 기대값 (기대값 완화가 아니다)

spec 수용 기준 1·2(06 「저장 시 검사」 거부, UNIQUE 겹침 오류)와 06:338-341(미완성·도달 불가 거부)에 따라 08-02 D3 의 "ERROR 가 있어도
저장한다"를 뒤집는다. Build 는 `grep -rn 'D3\|ALL_NA_ROW\|오류가 있어도' BAT/dme/ruleEdit src/frontend/e2e/mdm-ruleEdit.spec.ts M/tests/dme/ruleEdit`
로 대상을 확정하고, 바꾼 테스트마다 build-log 에 "원래 기대 → 새 기대 · 근거(수용 기준 번호/06 줄)" 를 한 줄 적는다. 알려진 대상:
e2e S5·S6, `RuleTableServiceTest` 의 ERROR 저장 성공 사례, `RuleTableService` javadoc. 서버 응답 issues 를 분석기 결과와 **전부 같다**고
비교하는 기존 테스트는 분석기 코드만 비교하도록 좁히지 않는다 — 새 검사 이슈는 분석 이슈 **뒤에** 붙으므로 앞부분 비교로 바꾼다(그 테스트의
픽스처에 새 경고가 실제로 나오는 경우만). 새 경고가 나오면 그 경고가 06 상 맞는지 먼저 확인한다.

### 3.6 E2E 서버 절차

TSK-08-02 design.md 「E2E 서버 절차」(613~666행)를 그대로 따르되 값만 바꾼다: `W=/Users/jji/project/dmes-standard/.claude/worktrees/dflow-f2517d41`,
슬롯 `e2e-TSK-08-04`, 포트는 실행 시점 빈 번호. 스모크 명령은
`e2e/mdm-shell-rbac-smoke.spec.ts e2e/mdm-ruleMng.spec.ts e2e/mdm-ruleEdit.spec.ts --workers=1`. 실행 뒤 다른 Task 스크린샷을 되돌린다:
`/usr/bin/git checkout -- docs/mdm/tasks/TSK-01-03/screens/ docs/mdm/tasks/TSK-08-02/screens/ docs/mdm/tasks/TSK-08-03/screens/`(이 스펙이 08-02·08-03 스크린샷도
다시 쓴다). stage 는 `docs/mdm/tasks/TSK-08-04/screens/*.png` 만. 서버는 자기 PID·자기 포트만 거두고 슬롯을 푼다.

### 3.7 게이트 (커밋 전)

- 기준선 명령 5개(state.json) — 신규 실패 0, 총수 미감소.
- BPMN 을 고친 단위(B4)와 마지막 단위(B9): `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` ERROR 0.
- FE 를 고친 단위(B7·B8·B9): `mantine-aggrid-ui` 스킬의 audit 두 개가 바꾼 파일에서 0건, `pnpm --filter @dk-oasis/m-mdm lint` 통과. shared 를 고치면 `pnpm test:unit:shared`.
- 백엔드 단일 테스트·testAll 은 `heavy.sh` 로 감싼다.

## 4. 수용 기준 매핑

| # | 수용 기준 | 검증 방법 |
|---|---|---|
| 1 | 06 「저장 시 검사」 항목별 거부/경고 테스트 | §6.1 표의 24행마다 대상 테스트를 둔다: 셀·식·미완성·생성 → `RuleCellRulesTest`·`RuleExpressionChecksTest`·`RuleCompletenessTest`·`RuleGenerateTryTest`; 도달 불가·겹침·빈틈 → `RuleTableSaveCheckTest`(분석기 ERROR 거부·WARNING 통과); 원장 검사 → `RuleLedgerChecksTest`; 변수·결과 열 그룹·산출 룰 순서·변수명 → 기존 `RuleColumnsServiceTest`(08-03, 회귀 확인); 상수 사전 회귀 → 기존 `MdmExpressionConfigTest`; 저장 경로 연결 → `RuleTableSaveCheckTest`·e2e V6 |
| 2 | UNIQUE 겹침은 오류 | `RuleTableSaveCheckTest` ②(UNIQUE 거부·FIRST 경고 저장), e2e S6(수정)·V6 |
| 3 | 원장에 쓰지 않는다 | `RuleValueTestServiceTest` ②(BODY·VERSION 전후 행·카운터·row_version 동일, 발급기 0회), `RuleTableSaveCheckTest` ①(거부된 저장도 쓰지 않음) |
| 4 | 요청 크기 상한 초과 거부 | `RuleValueTestServiceTest` ⑨(같으면 통과·+1 거부), `RuleTableSaveCheckTest` ⑦, `RuleTestCaseServiceTest`(상한), e2e V5 |
| 5 | 포털 메뉴에서 화면이 열리고 e2e `mdm-ruleEdit.spec.ts` 가 통과 | e2e 스모크 넷: 1 메뉴 이동(V1), 2 목록 서버 데이터·빈 상태(V1 케이스 표), 3 화면 조작만으로 등록 반영(V4 케이스로 저장), 4 서버 오류 표시(V5). 스펙 전체(S·C·V) passed, skipped·failed 0 |

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

| # | 규칙 | 대상 테스트 |
|---|---|---|
| I1 | **거부는 쓰기 전이다.** 검사 ERROR 가 하나라도 있으면 TABLE 저장은 예외로 끝나고 `TB_MDM_RULE_ROW`·`HIT_POLICY`·`ROW_VERSION`·`LAST_ROW_ID` 가 그대로다 | `BAT/dme/ruleEdit/RuleTableSaveCheckTest` |
| I2 | WARNING 만 있으면 저장되고 경고가 응답 issues 에 실린다(분석 이슈 뒤, 발급 번호로 바뀐 row_id) | `RuleTableSaveCheckTest` |
| I3 | 분석기 ERROR(ALL_NA_ROW, UNIQUE 의 OVERLAP)는 거부, 나머지 분석 코드는 경고. UNIQUE 가 아닌 표의 OVERLAP 은 저장된다 | `RuleTableSaveCheckTest` |
| I4 | 미완성: NORMAL 행의 조건 열 키 없음·결과 셀 없음(기본 행 포함)은 거부, `{"op":"NA"}` 는 완성이다 | `BLT/common/rule/check/RuleCompletenessTest` |
| I5 | 경계: 구간 op 한쪽 빈칸은 하한 `<=`→GE·`<`→GT, 상한 `<=`→LE·`<`→LT 로 바꿔 저장한다. 양쪽 빈칸 거부, 하한=상한(값 비교, `1.10`=`1.1`) 거부, 하한>상한 거부. 비교는 NUMBER 는 BigDecimal, 일자 String 은 문자열 | `RuleCellRulesTest` |
| I6 | 목록: 빈 목록 거부, 원소를 타입대로 정규화한 뒤 중복 제거(같은 값이면 앞 원소), NUMBER 는 값 순서·String 은 UTF-16 사전순 정렬, 원소 수 상한 | `RuleCellRulesTest` |
| I7 | `=` 패턴: String 변수만, `%` 단독 거부, 연속 `%` 하나로 접기, 막지 않은 `%` 3개 초과 거부(`\%` 는 세지 않음), 일자 도메인은 `%`·`_` 거부, 길이 상한. 코드 도메인은 패턴 해석 대상이 아니다(글자 그대로) | `RuleCellRulesTest` |
| I8 | CONTAINS·INSTR: 빈 값 거부, 길이 상한, 값은 글자 그대로(정규화하지 않는다), 일자 도메인 거부 | `RuleCellRulesTest` |
| I9 | 타입: NUMBER 리터럴은 `^[+-]?\d+(\.\d+)?$` 만(지수·16진 거부), BOOLEAN 은 TRUE/FALSE(대소문자 무시, `TRUE`/`FALSE` 로 정규화), 결과 Value 도 결과 변수 타입으로 같은 검사. 숫자 텍스트는 다시 쓰지 않는다(`01.50` 을 `1.5` 로 바꾸지 않는다) | `RuleCellRulesTest` |
| I10 | op 허용 행렬 = 06:130-176 표(표시 타입 × 데이터 타입 × 일자·코드 여부). 서버가 다시 본다 | `RuleCellRulesTest`(파라미터) |
| I11 | 범위 자리: 구간 op 넷은 `2` 열에서만. Expression 셀 AST 에서 같은 변수를 `<`·`<=`·`>`·`>=` 로 두 번 이상 견주면 거부 | `RuleCellRulesTest`·`RuleExpressionChecksTest` |
| I12 | Expression: 서버가 다시 파싱해 `ast` 를 덮어쓴다(화면 AST 불신), 함수는 표준 칸용(`FunctionSets.STANDARD`), 참조 변수 ⊆ 컬럼 사전 ∪ 다른 룰의 최신 RELEASED 결과 변수 ∪ 이 룰의 COND 변수(프로그램 변수 포함) ∪ (DERIVE 결과 식) 앞 seq 결과 변수, `STR_MATCHES` 정규식 정책·`MASTER` 인자 모양 | `RuleExpressionChecksTest` |
| I13 | 생성해 보기: NA 가 아닌 op-code 셀과 결과 Value 셀마다 생성·컴파일, 패턴 정규식은 `Pattern.compile`. 실패는 셀 단위 ERROR. 텍스트는 저장하지 않는다 | `RuleGenerateTryTest` |
| I14 | 세트 순서: 이 룰을 담은 INUSE 세트마다 이 룰은 새 정의, 나머지는 최신 RELEASED. 이 룰이 뒤 룰 결과를 읽거나 앞 룰이 이 룰 결과를 읽으면 거부(메시지에 세트 ID·옮길 룰), 서로 읽으면 순환 거부, 같은 결과 변수 두 룰 대입은 경고 | `BAT/dme/ruleEdit/RuleLedgerChecksTest` |
| I15 | 계약 변경은 경고만 한다(필요 변수 늘음·선택→필수). 막지 않는다 | `RuleLedgerChecksTest` |
| I16 | 코드 값 없음·도메인 범위 실패·필수 컬럼 IS NULL 은 경고, `CODE_IN` 카테고리 없음은 거부, 도메인 범위는 CODE 종류를 건너뛴다 | `RuleLedgerChecksTest` |
| I17 | `MASTER`·`MASTER_AT` 대상 ID·카테고리·attr 라벨이 원장에 없으면 거부 | `RuleLedgerChecksTest` |
| I18 | 적용 지점 표(§6.1)를 지킨다: COLUMNS 적용은 셀·미완성·생성·분석 거부를 돌리지 않고(열 추가가 가능해야 한다) 세트 순서·MDM 참조로 거부, 계약 변경·축 조합으로 경고 | `RuleLedgerChecksTest`, 기존 `RuleColumnsServiceTest` |
| I19 | 값 테스트는 원장에 쓰지 않는다(06 표 여섯·`TB_MDM_RULE` 카운터·row_version 불변, 발급기 미호출) | `BAT/dme/ruleEdit/RuleValueTestServiceTest` |
| I20 | 값 테스트 판정은 `MdmRuleEngine` + 요청마다 만든 `DefinitionLookup` 경로다. `DefinitionLookup` 스프링 빈은 등록하지 않는다 | `RuleValueTestServiceTest`, 기존 `MdmBusinessRuleMigrationTest.계약_전용_06_확정_검사와_정의_조회_빈이_없다` |
| I21 | 키 보냄 끔 = 레코드에 키 없음(MISSING_KEY), 빈 칸 = 키 있고 값 null(필수면 REQUIRED_NULL) | `RuleValueTestServiceTest`, `value-test-input.test.ts` |
| I22 | BODY: 깨진 셀(정규화·식·생성 실패)이 든 행은 판정에서 빼고 `cellErrors`·`skippedRows` 로 돌려준다. 키가 없는 셀은 NA 로 판정하고 경고(D5). 미완성·겹침은 BODY 를 막지 않는다 | `RuleValueTestServiceTest` |
| I23 | 상한(D6)은 `RuleLimits` 한 곳이고, 상한과 같으면 통과·1 넘으면 MDM021 거부 | `RuleValueTestServiceTest`·`RuleTableSaveCheckTest`·`RuleTestCaseServiceTest` |
| I24 | 케이스 비교: 기대 JSON 의 키마다 결과 변수 타입으로 견준다(NUMBER BigDecimal `compareTo`, BOOLEAN, STRING, null), `hit` 는 §6.5 표현, 기대값 null 은 "돌려 보기만"(통과·실패 없음), 기대에 모르는 키가 있으면 실패 | `RuleValueTestServiceTest`, `case-model.test.ts` |
| I25 | 케이스 쓰기: 담당자(MDM013)·MDM 원천·폐기 아님, 버전·DRAFT 소유와 무관, 새 id 는 `issue(CASE)`, 수정·삭제는 `ROW_VERSION` 조건(MDM001), JSON 은 DB 전에 검사 | `BAT/dme/ruleEdit/RuleTestCaseServiceTest` |
| I26 | `sameIssues` 는 분석기 코드(7종 + `DERIVE_ORDER`)만 견준다 | `M/tests/dme/ruleEdit/analysis-same.test.ts` |
| I27 | 분석기·분석 코퍼스·TS 분석 파일 무변경 | 기존 `RuleAnalysisCorpusTest`·`rule-analysis-corpus.test.ts`·`RuleAnalyzerTest` |
| I28 | Java `InputContracts` 와 TS `computeInputContract` 는 한 벌 코퍼스에서 같다. TS `input-contract.ts` 는 고치지 않는다 | `InputContractCorpusTest`·`evalex-input-contract-corpus.test.ts` |
| I29 | EXTERNAL 룰은 저장 시 검사를 돌리지 않는다(저장 자체가 `requireMdm` 으로 막힌다 — 순서 불변). 케이스 쓰기도 MDM 원천만 | `RuleTestCaseServiceTest`, 기존 `RuleTableServiceTest` |
| I30 | `RuleCellsCodec` 은 값을 고치지 않는다(정규화는 `RuleCellRules`) | 기존 `RuleCellsCodecTest` |
| I31 | `ResolvedVar` record 칼럼 불변(검사기가 더 필요한 값은 `RuleCheckInput.rawVars` 로 받는다) | 기존 `BAT/dme/ruleEdit/RuleEditViewTest`(view 의 vars 모양) |
| I32 | 액션은 `execute` 하나만 더한다. 권한 세트·어휘 불변 | `DmeBpmnActionTest`, `MdmOasisActionVocabularyTest`, e2e `mdm-shell-rbac-smoke`(시드 대조) |
| I33 | 값 테스트 칠하기는 서버 결과로만 하고, 이 카드가 보이는 정의(BODY 또는 같은 버전)일 때만 표에 칠한다. BODY 결과 뒤 표가 바뀌면 칠한 것을 지운다 | `value-test-marks.test.ts`, e2e V3 |
| I34 | 카드 순서 = header·versions·table·valueTest·testResult·testCases·usage. 편집본 대상은 `editable` 일 때만 고를 수 있다 | `value-test-cards.test.ts`, `rule-edit-page.test.ts` |

## 6. 상세 설계

### 6.1 검사 × 적용 지점

`E` = 거부(ERROR), `W` = 경고, `—` = 돌리지 않음, `셀오류` = 값 테스트 BODY 에서 그 셀의 오류로 돌려주고 그 행을 판정에서 뺀다.

| 06 검사 | 구현 | TABLE | COLUMNS | TEST_BODY | STORED(08-05) |
|---|---|---|---|---|---|
| 타입 | `RuleCellRules` | E | — | 셀오류 | E |
| 변수(프로그램 변수 선언·경고) | 08-03 `RuleColumnsService` | — | E/W(기존) | — | — |
| 룰 세트 순서 | `RuleSetOrderCheck` | E/W | E/W | — | E/W |
| 입력 계약 변경 | `ContractChangeCheck` | W | W | — | — |
| 결과 열 그룹 | 08-03 `checkGroups` | — | E(기존) | — | — |
| 산출 룰 순서 | 08-03 `checkDeriveExprs` + `RuleExpressionChecks`(DERIVE 결과 셀) | E | E(기존) | 셀오류 | E |
| op 허용 | `RuleCellRules` | E | — | 셀오류 | E |
| 범위 자리 | `RuleCellRules`·`RuleExpressionChecks` | E | — | 셀오류 | E |
| 경계 순서 | `RuleCellRules`(정규화 포함) | E | — | 셀오류 | E |
| 목록 | `RuleCellRules`(정규화 포함) | E | — | 셀오류 | E |
| `=` 패턴 | `RuleCellRules`(정규화 포함) | E | — | 셀오류 | E |
| CONTAINS·INSTR | `RuleCellRules` | E | — | 셀오류 | E |
| 도메인 범위 | `DomainRangeCheck` | W | — | — | W |
| 코드 참조 | `CodeReferenceCheck` | W/E | — | — | W/E |
| MDM 참조 | `MasterReferenceCheck` | E | E | —(BODY 는 `ExpressionChecker` 의 인자 모양·화이트리스트만, 06:1077) | E |
| 필수 컬럼 | `RequiredColumnNullCheck` | W | — | — | W |
| 미완성 | `RuleCompleteness` | E | — | —(NA 로 판정 + 경고) | E |
| 도달 불가 행 | 분석기 ALL_NA_ROW(E)·UNREACHABLE(W) | E/W | — | — | E/W |
| 겹침·빈틈 | 분석기 OVERLAP(UNIQUE E)·나머지 W | E/W | — | — | E/W |
| 축 조합 완전성 | `AxisCoverageCheck` / 08-03 기존 | W | W(기존) | — | W |
| 생성해 보기 | `RuleGenerateTry` | E | — | 셀오류 | E |
| Expression | `RuleExpressionChecks` + `ExprTypeByCaseCheck`(W) | E(+W) | E(기존 파싱)+W | 셀오류 | E |
| 변수명 | 08-03 `checkVariableName` | — | E(기존) | — | — |
| 상수 사전 회귀 | 기존 `MdmExpressionConfigTest` | 테스트 | 테스트 | 테스트 | 테스트 |

TABLE 저장 흐름(B3):

```
save(req):
  rule = loadRule; requireMdm; ver; expected; me
  tx {
    rv = beginDraftWrite(ref, expected, me)          // 비소유·DRAFT 아님·충돌이 먼저(I29 순서)
    hit = hitPolicy(...); rawVars = queries.vars(id, ver)
    rows = checkRows(...)                            // 모양 — 그대로
    limits(rows)                                     // RuleLimits: 행 수·셀 길이 → E(LIMIT_EXCEEDED)
    vars = resolver.resolve(id, ver, rawVars)
    report = validator.validate(new RuleCheckInput(id, ver, kind, hit, rawVars, vars, draftRows(rows), TABLE))
    if report.hasErrors(): throw RuleSaveRejections.reject(report.issues())   // 롤백 → rv+1 도 되돌아간다
    issue(ROW) → deleteRows → INSERT(report.normalizedRows 의 cells 를 RuleCellsCodec.write 로) → updateHitPolicy
  }
  analysis = RuleAnalyzer(커밋된 행)                  // 08-02 I12 그대로
  issues = RuleIssueMaps.of(analysis) + mapRowIds(report 의 비분석 이슈, rowIdMap)
```

### 6.2 이슈 맵 모양과 코드

이슈 맵은 화면 `RuleIssueView` 와 같은 모양이다: `{code, severity: "ERROR"|"WARNING", rowIds: [int], varId: int|null, lower: null, upper: null, message}`.
`RuleSaveIssueCode`: `LIMIT_EXCEEDED, TYPE_LITERAL, OP_NOT_ALLOWED, RANGE_OP_PLACE, RANGE_IN_EXPR, BOUND_EMPTY, BOUND_EQUAL, BOUND_ORDER, LIST_EMPTY,
LIST_TOO_LONG, PATTERN_NOT_STRING, PATTERN_ONLY_PERCENT, PATTERN_TOO_MANY_PERCENT, PATTERN_TOO_LONG, PATTERN_DATE_WILDCARD, TEXT_EMPTY, TEXT_TOO_LONG,
TEXT_DATE_DOMAIN, INCOMPLETE_COND, INCOMPLETE_RESULT, GENERATE_FAILED, EXPR_PARSE, EXPR_PROBLEM(ExpressionChecker 의 Problem 종류를 message 에),
EXPR_UNKNOWN_VAR, EXPR_DERIVE_ORDER, MASTER_TARGET_MISSING, MASTER_CATE_MISSING, MASTER_ATTR_LABEL_MISSING, CODE_VALUE_MISSING, CODE_CATE_MISSING,
DOMAIN_RANGE, REQUIRED_NULL_CHECK, SET_ORDER, SET_CYCLE, SET_DUP_RESULT, CONTRACT_CHANGED, EXPR_TYPE_BY_CASE`, 축 조합은 기존 `PIVOT_COVER_INCOMPLETE`.
메시지는 한국어이고 셀 이슈는 "행 {row_id}·{열 라벨}" 을 앞에 둔다. 세트 순서 메시지는 06:327 대로 세트 ID 와 앞으로 옮길 룰을 적는다.

### 6.3 셀 규칙 (`RuleCellRules`)

- 입력: 열(`ResolvedVar` + raw `MdmRuleVar`), 셀 맵. 판별: 데이터 타입 = `ResolvedVar.dataType`, 일자 = `dateString`, 코드 = `maruCodeId != null`.
- op 허용(06:130-176): Equal 은 `EQ`·`NA` 만, 1 은 단항 12종 + NA, 2 는 1 의 12종 + 구간 넷 + NA, Expression 은 `expr` 또는 NA. 데이터 타입 제한 —
  `NE`·`IN`·`NOT_IN`: String·Number; `LT/LE/GT/GE`·구간: Number·일자 String; `CODE_IN`: 코드 도메인 String 만; `CONTAINS`·`INSTR`: String(코드 허용,
  일자 제외); `EQ`·`IS_NULL`·`NOT_NULL`·`NA`: 전부; Boolean 은 Equal 또는 1 의 `EQ`·`IS_NULL`·`NOT_NULL` 만.
- 식 변수(`exprVar`) 열은 선언 타입을 따른다(`ResolvedVar` 가 이미 해석). Expression 조건 열(`typeSource=EXPRESSION_COLUMN`)은 op 검사 대상이 아니다.
- 결과 Value 셀 `val`: 결과 변수 타입으로 타입 검사. 결과 Expression 셀은 `RuleExpressionChecks`.
- 정규화 결과는 새 셀 맵으로 돌려준다(입력 맵을 바꾸지 않는다). 키 일곱(`op,left,right,list,expr,ast,val`) 밖을 만들지 않는다.

### 6.4 룰 세트 순서 (`RuleSetOrderCheck`)

- 대상 세트: `RuleQueries.allSets()` 중 status INUSE 이고 `rule_ids` 에 이 룰이 있는 것.
- 이름 계산: `RuleDefinitionReads.reads/produces`. 이 룰은 저장하려는 정의, 세트의 다른 룰은 그 룰의 최신 RELEASED 버전(없으면 그 룰은 건너뛴다 — 판정 시 입력 키 확인이 잡는다, 06:327).
- 이 룰의 위치 i 에 대해: `reads(this) ∩ produces(rule_j), j > i` → SET_ORDER("세트 {S}: {이 룰}이 뒤에 있는 {rule_j}의 결과 {X}를 읽는다. {rule_j}를 앞으로 옮긴다");
  `produces(this) ∩ reads(rule_j), j < i` → SET_ORDER("세트 {S}: 앞에 있는 {rule_j}가 이 룰의 결과 {X}를 읽는다. 이 룰을 {rule_j} 앞으로 옮긴다");
  같은 j 에서 두 방향이 다 걸리면 둘 대신 SET_CYCLE 하나("순서로 풀리지 않는 순환"). `produces(this) ∩ produces(rule_j)` → SET_DUP_RESULT(W).
  (B6 이 바꿈) 두 방향 조건(j > i·j < i)은 한 j 에서 함께 참일 수 없으므로, 서로의 결과를 읽으면 j 의 위치와 무관하게 SET_CYCLE 하나로 알리고 SET_ORDER 는 내지 않는다(build-log 「B6」 이탈 1).

### 6.5 값 테스트 (`execute` → `RuleValueTestService.run`)

요청 `RuleTestRequest`: `maruRuleId`, `target`(`BODY`|`VERSION`), `ver`, `hitPolicy`(BODY), `rows`(BODY, `grids.rows` — TABLE 저장과 같은 모양),
`inputJson`(문자열, JSON 객체), `runCases`(Boolean).

1. 상한(D6): `rows` 수, 행마다 `cells` 문자열 길이와 합, `inputJson` 길이·키 수 → 넘으면 MDM021.
2. 정의: VERSION 은 `StoredRuleDefinitions`(원장 읽기, DRAFT 포함, 누구나). BODY 는 변수만 `ver`(DRAFT)의 저장된 열에서 읽고(D4) 행·적중 정책은 본문.
   BODY 행은 `RuleCellsCodec.parse`·`validateShape`(모양이 틀리면 요청 거부) → `RuleSaveValidator.validate(TEST_BODY)` → `brokenRowIds` 는 빼고
   `cellErrors` 로, 빠진 셀은 NA 로 판정하되 `warnings` 에 `MISSING_CELL_AS_NA`(행·열).
3. `RuleDefinitionAssembler` → `InputContracts` 로 계약 → `new MdmRuleEngine(mdmEvaluator.configuration(), new SingleRuleDefinitionLookup(def))`.
   평가 시각 = 공통 `Clock` 의 now(초 단위). 입력은 Jackson(`USE_BIG_DECIMAL_FOR_FLOATS`)으로 `Map<String,Object>` — 키 없음과 null 을 그대로 둔다.
4. `evaluate` 성공 → `RuleResult` 를 결과로, `EngineEvaluationException` → `errors[{stage, code, rowId, name, message}]`(trace 없음 — G4 한계).
5. `runCases` 면 `RuleTestCaseQueries` 로 이 룰의 케이스(상한 D6)를 같은 정의로 하나씩 돌려 비교(I24).

응답 `RuleTestResult`: `target, ver, evalTs("yyyy-MM-dd HH:mm:ss"), outcome("OK"|"ERROR"), results{name → 문자열(BigDecimal 은 toPlainString)|boolean|null|목록},
hits[{rowId, seq, groupChoices}], defaultApplied, trace[{rowId, seq, evaluated, hit, firstFalseVarId}], errors[…], warnings[{code, rowId, varId, message}],
cellErrors[{rowId, varId, code, message}], skippedRows[rowId], contract{always[name], rows[{rowId, required[], optional[]}]},
cases[{caseId, caseName, outcome, pass(true|false|null), mismatches[{key, expected, actual}], results, hit, errors}]`.

`hit` 표현(기대 JSON·비교 공통): 적중 행 하나 → 그 row_id 숫자, 여럿(COLLECT·ANY·PRIORITY 순서) → row_id 배열(엔진 hits 순서), 기본 행 적용 →
기본 행 row_id, 적중도 기본 행도 없음 → null. 기대 JSON 에 `hit` 키가 없으면 적중 행은 견주지 않는다.

### 6.6 테스트 케이스 (`save` part `CASE`)

- 새 케이스: `caseId` 없음 → `issue(ruleId, CASE, 1)` → 엔티티 INSERT(`rowVersion` 0). 수정: `caseId`+`rowVersion` → 조건부 네이티브 UPDATE
  (`… , ROW_VERSION = ROW_VERSION + 1, VER = VER + 1, 감사 WHERE MARU_RULE_ID=? AND CASE_ID=? AND ROW_VERSION=?`, 0행이면 MDM001). 삭제:
  `caseDeleted=true` → 조건부 DELETE(0행이면 MDM001). 모두 `TransactionTemplate`.
- 검사: 룰 원천 MDM, 상태 DEPRECATED 아님, `RuleStewardCheck.requireSteward()`, 이름 필수·길이, `inputJson` 은 JSON 객체(Jackson 파싱), `expectedJson` 은 없거나 JSON 객체,
  길이 상한, 룰당 케이스 수 상한.
- 응답 `RuleEditSaveResult{part:"CASE", rowVersion(케이스의 새 값, 삭제면 null), caseId}`. 화면은 저장 뒤 `reload`(view 의 `testCases` 로 다시 그린다).

### 6.7 화면 (카드 ④⑤⑥, 시안 H7)

- **④ 값 테스트**(`ValueTestCard`): 제목 "값 테스트" + 배지 "값 테스트 API". `대상` 선택 — `editable` 이고 선택 버전이 DRAFT 면 첫 항목
  `편집본 · 버전 N 저장 전`(기본값), 그 뒤 `버전 N · 상태` 전부. 모드 설명 문장은 시안 문구. 입력 줄은 `test-input.ts`: 라벨·물리명·타입 배지·계약 배지·
  **키 보냄** 확인란(기본 켬)·값 칸(placeholder "비우면 NULL")·설명·도메인 이름·도메인 표준 식(varMeta). 컬럼 사전에 예시 값 칼럼이 없으므로 예시는
  보이지 않는다(F13, 보고에 올린다). 다른 버전 대상의 입력 줄·결과 표는 `viewRule(ruleId, ver)` 를 카드가 따로 불러 캐시한 정의로 만든다(H6).
  열 설정 초안이 dirty 면 편집본 대상 옆에 "열 설정 초안은 반영하지 않는다(적용 뒤 다시 돌린다)" 를 보인다(D4). 버튼 "돌리기"(`canDo("execute")`),
  "케이스로 저장"(이름 입력 칸, 결과가 있으면 기대값 = `expectedFromResult`, 없으면 기대값 없이). 편집본을 돌린 뒤 표가 바뀌면 "표가 바뀌어 결과를 지웠다. 다시 돌린다" 안내.
- **⑤ 테스트 결과**(`TestResultCard`): 결과 변수 표(그룹이면 "그룹 열 N개 가운데 {라벨} `{물리명}`"), 적중 행("{seq}행 (row_id {id})", 기본 행이면
  "어느 행도 참이 아니어서 기본 행"), 판정 오류 목록(단계·코드·메시지), 경고·`cellErrors`·빠진 행. 대상이 보이는 표와 다르면 그 버전의 읽기 전용 표
  (행 = 셀 요약, 적중 행 초록·첫 거짓 칸 붉음 — 같은 shared 클래스), 같으면 "적중 행은 위 의사결정표에 칠했다".
- **⑥ 테스트 케이스**(`TestCaseCard`): 설명 "TB_MDM_RULE_TEST_CASE · 버전과 무관". 열 `case_id · 이름 · 입력 · 기대 · 결과({대상 라벨}) · 동작`. 결과 배지
  "돌려 보기만"/"통과"/"실패"(실패면 불일치 키). 동작 "불러오기"(④ 입력 칸 채움 — 키가 없는 변수는 키 보냄 끔), "기대값 갱신"(마지막 결과로, 담당자),
  "삭제"(확인 한 번 더, 담당자). 카드 머리 버튼 "모두 돌리기"(현재 ④ 대상으로 `runCases=true`). 케이스가 없으면 "테스트 케이스가 없습니다" 빈 상태.
- 표 칠하기(B7): 적중 행 = 행 클래스, 첫 거짓 칸 = 셀 클래스, 그룹 고른 열 = 강조, 같은 그룹 나머지 열 = 흐림(06:306).

## 7. Build 가 주의할 함정

1. 정규화는 생성해 보기보다 **먼저** 한다. 한쪽 빈 구간을 그대로 생성기에 넣으면 IAE 다(G1).
2. `CellTextGenerator.withTexts` 를 쓰지 말고 셀마다 부른다(첫 실패에서 멈춘다).
3. 거부 트랜잭션 안에서 예외를 던지면 `beginDraftWrite` 의 rv+1 도 롤백된다 — 테스트는 row_version 이 그대로인지도 본다.
4. 검사기는 임시 row_id(음수)로 이슈를 만든다. 응답에 실을 때 `rowIdMap` 으로 바꾼다. 거부 메시지에는 "새 행 -1" 로 적는다.
5. 운영 `mdmEvaluator` 빈은 `MASTER`·`CODE_IN` 을 늘 빈 결과로 판정한다(F12). 코드 참조·MDM 참조 **검사**는 평가기가 아니라 원장 조회로 한다(D7).
   값 테스트는 운영 평가기를 그대로 쓴다 — 코드 셀이 든 룰의 값 테스트 결과가 거짓으로 나오는 것은 D-077 의 알려진 한계로 보고에 올린다.
6. `MdmRuleTestCase.rowVersion` 은 `updatable=false` — 엔티티 setter 로 올리지 않는다. INSERT 는 엔티티, UPDATE·DELETE 는 네이티브.
7. SQLite CHECK(`json_valid`) 에 걸리면 `DataIntegrityViolationException` 으로 나온다 — 서버가 먼저 Jackson 으로 검사해 INVALID_VALUE 로 돌려준다.
8. 입력 JSON 의 숫자는 `BigDecimal` 로 읽는다(Double 로 읽으면 `1.05` 비교가 흔들린다).
9. OASIS `params` 의 null 은 FE 가 뺀다. `inputJson` 은 문자열로 보낸다(중첩 Map 바인딩 회피). BODY 행은 `grids.rows`.
10. e2e 스펙 실행은 TSK-08-02·08-03·01-03 스크린샷을 다시 쓴다 — §3.6 대로 되돌린다.
11. 기존 저장 테스트에서 새 경고가 나오면(예: 테스트 DB 에 코드가 없어 CODE_VALUE_MISSING) 그 경고가 06 상 맞는지 확인한다. 맞으면 기대에 더하고, 틀리면 검사를 고친다.
12. 분석기는 편집 중 셀에서 예외를 던질 수 있다(08-02 B8). 검사기 안에서는 분석기를 `RuleCellRules` 정규화와 `RuleCompleteness` 통과 뒤에만 부르고,
    그래도 예외가 나면 `ANALYSIS_FAILED` ERROR 하나로 바꿔 저장을 막는다(조용히 통과시키지 않는다).

## 도커 금지로 생략한 검증

- 금지 모드 출처: 워커 기본(DOCKER=allow 아님)
- 반려 재작업(1회차, 기점 6d2110fc): 이번 라운드에 도커 때문에 생략하는 검증은 없다. 1차 라운드가 적었던 `:api:mssqlMigrationTest` 는 기점 트리에
  태스크가 없다(MDM MSSQL 폐지, `docs/mdm/adr/0004-drop-mssql-production-assumption.md`, mdm 마이그레이션은 `sqlite/` 만). 이번 수정은 마이그레이션·방언 SQL 을
  만들지 않고, 새 테스트는 모두 SQLite·순수 JUnit·Vitest 다. 이 절 때문에 확인하지 못하는 수용 기준은 없다.

## 담당자 확인 필요 결정

### D1 — entry-point `mdr` 인가 `dme` 인가
- **질문**: spec 은 `/portal → mdr/ruleEdit` 라고 적었다.
- **선택지**: (a) `dme/ruleEdit` (b) `mdr/ruleEdit`
- **택한 것**: (a)
- **근거와 강약**: TRD §9 T2 가 그룹 코드를 `dme` 로 확정했고 화면 목록 정본(`docs/mdm/screens/README.md`)·wbs:1393·08-02 D1 이 모두 `dme/ruleEdit` 다(승인된 선행 산출물). 화면은 이미 그 경로에 있다.
- **반려되면 재작업 방향**: 메뉴 시드·componentPath·e2e 메뉴 경로를 `mdr` 로 옮기는 별도 작업이 필요하다(이 Task 범위 밖).

### D2 — 저장 거부를 어떻게 전하나
- **질문**: 06 은 ERROR 를 저장 거부로 본다. OASIS 는 예외의 `meta.message` 만 화면에 보낸다(F10). 구조화된 이슈를 어떻게 전하나.
- **선택지**: (a) 예외 — `MdmErrorCode.INVALID_INPUT`(MDM021) + 메시지 "룰 저장 거부: 코드[행·열] 메시지; …" + details(`DomainRejections` 모양) (b) 새 `MdmErrorCode.RULE_SAVE_REJECTED`(MDM024) 예외 (c) 성공 응답에 `rejected: true` 와 구조화된 issues 를 싣고 트랜잭션만 되돌린다
- **택한 것**: (a)
- **근거와 강약**: 저장 거부를 예외로 전하는 것이 리포 선례다(`DomainRejections`·`MasterCodeRejections`, 리포 관례). 새 코드는 공유 파일 충돌 때문에 만들지 않는다는 D-096 원칙이 있다(승인된 선행 결정). (c) 는 셀 단위 칠하기가 가능하지만 `meta.success=true` 인 거부라 다른 호출자(자동화·08-05)가 실패를 놓칠 수 있다. 분석기 ERROR 는 화면이 저장 전에 이미 칠하므로(08-02) 서버에서만 나는 ERROR 만 메시지로 읽게 된다.
- **반려되면 재작업 방향**: (b) 면 `MdmErrorCode` 한 줄 추가와 `RuleSaveRejections` 코드 교체뿐이다. (c) 면 `RuleEditSaveResult` 에 `rejected` 를 더하고 `DecisionTableCard` 가 거부 이슈를 칠하게 하며 e2e S5·S6·V6 의 확인 문구를 바꾼다.

### D3 — 값 테스트 액션과 권한
- **질문**: 값 테스트를 어느 RBAC 액션으로 여나. 06:764 "값 테스트 — 언제나. 저장된 버전은 누구나".
- **선택지**: (a) 새 갈래 `execute`(EDIT 이상 — 담당자) (b) 기존 `validate` 에 target 으로 가른다(08-03 주석의 확장 방향, EDIT) (c) `compare`(READ — 표준 관리자도 가능)
- **택한 것**: (a)
- **근거와 강약**: `validate` 는 08-03 이 `parseExpr` + `RuleExprParseRequest` 로 이미 쓰고 있어 DTO 하나에 두 모양을 싣게 된다(BPMN serviceTask 는 dto 하나, F5). `execute` 는 어휘 16종 안에 있어 권한 세트·시드를 바꾸지 않는다(I32, `mdm-rbac-seed-check` 불변). `compare` 는 뜻이 달라 액션 어휘를 흐린다. 06 의 "누구나"는 DRAFT 소유 여부를 뜻하는 문맥이다(06:997 "다른 사용자 — 읽기와 값 테스트만") — 비소유 담당자는 (a) 로도 된다. 표준 관리자(READ)는 값 테스트를 못 한다.
- **반려되면 재작업 방향**: (c) 면 BPMN 갈래 이름을 `compare` 로 바꾸고 `DmeBpmnActionTest` 의 readOnly 집합에 넣는다. 서비스는 그대로다.

### D4 — 값 테스트 "편집본"의 변수는 어디서 오나
- **질문**: 06:1073 은 본문 정의 방식이 "화면이 편집 중인 변수·행 JSON" 을 싣고 원장을 읽지 않는다고 한다. 화면에서 열(변수) 편집은 08-03 의 별도 초안(적용 전 sessionStorage)이다.
- **선택지**: (a) 본문 = 편집 중인 행 + 적중 정책, 변수는 그 DRAFT 의 저장된 열(원장 읽기) (b) 본문에 변수도 싣는다(열 설정 저장 모양, 서버가 저장 없이 해석)
- **택한 것**: (a)
- **근거와 강약**: 08-03 은 열 초안을 원자 적용으로만 DRAFT 에 반영하고, 초안이 dirty 면 표 저장을 막는다(리포 기존 관례). 따라서 "편집 중인 표"의 열은 늘 저장된 열이다. (b) 는 열 설정 줄 → 변수 해석을 `RuleColumnsService` 밖으로 떼어야 해 08-03 코드를 크게 흔든다. 원장에 **쓰지 않는다**(spec 수용 기준 3)는 (a) 도 지킨다.
- **반려되면 재작업 방향**: `RuleColumnsService` 의 줄 → 변수 변환을 공용 클래스로 떼고, 요청에 `vars`(열 설정 모양, `draftFromView` 또는 열 초안)를 싣는다. 화면은 열 초안을 context 로 올린다.

### D5 — 본문 정의의 깨진 셀·빠진 셀 판정
- **질문**: 06 은 "파싱에 실패한 셀만 그 셀의 오류로 돌려주고 나머지로 판정한다" 고 한다. 엔진은 셀이 없으면 NA 로 본다(G5). 깨진 셀을 지우면 그 셀이 NA 가 되어 행 뜻이 바뀐다.
- **선택지**: (a) 깨진 셀이 든 행을 판정에서 빼고 `cellErrors`·`skippedRows` 로 알린다. 키가 없는 셀은 NA 로 판정하고 경고한다 (b) 깨진 셀을 NA 로 보고 판정한다 (c) 깨진 셀이 하나라도 있으면 판정하지 않는다
- **택한 것**: (a)
- **근거와 강약**: 06 원문 "나머지로 판정"을 지키면서 뜻이 바뀐 행이 조용히 적중하는 일을 막는다. (b) 는 거짓 적중을 만든다. (c) 는 원문과 어긋난다. 빠진 셀은 06 이 미완성 표도 돌리라고 했고(06:1077) 엔진의 기본 동작이 NA 라서 경고만 붙인다.
- **반려되면 재작업 방향**: (b) 면 `brokenRowIds` 대신 그 셀을 `{"op":"NA"}` 로 바꿔 판정하고 경고 코드를 바꾼다.

### D6 — 상한값
- **질문**: 06 미결 「상한값」(06:385)이 정하지 않은 IN 원소 수·패턴 길이·CONTAINS·INSTR 길이·요청 크기를 얼마로 하나.
- **선택지**: (a) 아래 값 (b) 운영 설정(yml)으로 빼고 기본값만 (a)
- **택한 것**: (a) — `RuleLimits` 상수. 행 500 / 행 `cells` 문자열 16,384자 / 행 `cells` 합 1,048,576자 / `inputJson` 16,384자·키 200 / IN·NOT IN 원소 100 / `=` 패턴 100자·`%` 3개(06 고정) / CONTAINS·INSTR 값 100자 / 식 2,000자 / 룰당 케이스 100건·케이스 이름 100자·입력·기대 JSON 각 16,384자.
- **근거와 강약**: 06 은 `%` 3개만 정했고 나머지는 미결이다. 샘플 룰(BASE_SPD_LKP 등)의 최대 크기보다 한 자리 이상 크게 잡아 정상 사용을 막지 않는다. 06 은 원소 수 상한을 "운영 설정" 으로 두라고 했으나(06:167) 설정 키 명명 선례가 mdm 에 없어 상수로 먼저 둔다.
- **반려되면 재작업 방향**: `RuleLimits` 를 `@ConfigurationProperties` 로 바꾸고 기본값을 유지한다. 테스트는 경계 값을 상수에서 읽으므로 그대로다.

### D7 — 코드 참조·MDM 참조 검사가 원장을 어떻게 읽나
- **질문**: 운영 `CodeLookup` 빈이 없어(D-077) 운영 평가기로 `MASTER` 를 부르면 늘 빈 결과다. 검사는 무엇으로 하나.
- **선택지**: (a) 검사 안에서만 원장을 읽는다(`MdmCodeLookup` 을 검사가 직접 만들어 쓰거나 TB_MDM_CODE·카테고리·TB_MDM_DATA 를 조회) — 빈 등록은 하지 않는다 (b) `MdmCodeLookup` 을 `@Component` 로 등록한다
- **택한 것**: (a)
- **근거와 강약**: (b) 는 D-077 이 막은 부작용(도메인 저장 R10 거부·MASTER 판정 동작 변경)을 TSK-04-03 테스트까지 끌고 온다(승인된 선행 결정). (a) 는 룰 검사에만 닿는다. 값 테스트는 운영 판정과 같은 평가기를 써야 하므로 운영 평가기를 그대로 쓰고, 코드 셀 판정 한계는 보고에 올린다.
- **반려되면 재작업 방향**: TSK-06-05 이후 빈 등록이 결정되면 검사를 평가기 호출로 바꾸고 원장 직접 조회를 지운다.

### D8 — 테스트 케이스 쓰기 권한과 단위
- **질문**: 06 은 케이스가 "버전과 무관" 이라고만 한다. 누가 어떤 잠금으로 쓰나.
- **선택지**: (a) 담당자(MDM013)면 DRAFT 소유와 무관하게 쓴다. 케이스마다 `ROW_VERSION` 조건 (b) DRAFT 소유자만 쓴다
- **택한 것**: (a)
- **근거와 강약**: 케이스 PK 에 버전이 없고 06:1058 "버전과 무관하게 유지한다" 다. (b) 면 DRAFT 가 없을 때(모두 RELEASED) 케이스를 못 쓴다. 테이블에 `ROW_VERSION` 이 있어 동시 수정은 행 단위로 막는다.
- **반려되면 재작업 방향**: `RuleTestCaseService` 에 `beginDraftWrite` 대신 "미적용 DRAFT 소유자" 검사를 더한다.

### D9 — Expression 결과 타입 검사
- **질문**: 06 은 "결과 타입은 테스트 케이스로 확인한다" 고만 한다(06:346·446). 저장 때 무엇을 하나.
- **선택지**: (a) 저장된 케이스로 새 정의를 돌려 조건 식 비불린·결과 타입 변환 실패를 경고한다 (b) 저장 때는 하지 않고 값 테스트·상신(08-05)에 맡긴다 (c) (a) 를 거부로 한다
- **택한 것**: (a)
- **근거와 강약**: 정적으로 알 수 없는 타입을 저장 시점에 알릴 유일한 방법이다. 케이스가 낡았을 수 있어 거부하지 않는다(상신 검사가 "기대값 있는 케이스 전부 통과" 로 막는다, 06:1132).
- **반려되면 재작업 방향**: (b) 면 `ExprTypeByCaseCheck` 빈을 지운다. (c) 면 심각도만 바꾼다.

### D10 — `RuleSaveCheck` 호출 시점을 커밋 뒤에서 쓰기 전으로 옮긴다
- **질문**: 08-02 는 `RuleSaveCheck` 를 트랜잭션 밖 커밋 뒤에 부른다(F1). 거부하려면 쓰기 전에 불러야 한다.
- **선택지**: (a) 쓰기 전(트랜잭션 안)으로 옮기고 계약 javadoc 을 고친다 (b) 커밋 뒤에 돌리고 ERROR 면 보상 트랜잭션으로 되돌린다
- **택한 것**: (a)
- **근거와 강약**: 08-02 §6.8 이 "08-04 가 거부 정책을 이 자리에서 켠다" 고 적었는데 커밋 뒤로는 켤 수 없다 — 설계 의도(승인된 선행 산출물)를 코드 위치보다 앞에 둔다. (b) 는 이중 쓰기다. 08-02 I12(분석은 트랜잭션 밖)는 응답용 분석으로 그대로 남는다.
- **반려되면 재작업 방향**: 없음에 가깝다 — 거부가 수용 기준이다.

### D11 — `view` 도 새 검사를 돌리나
- **질문**: 읽기 전용 화면에서도 서버 검사 경고(코드 참조 등)를 보이나.
- **선택지**: (a) `view.issues` 는 지금처럼 분석기 결과만 (b) view 도 원장에서 읽은 정의로 `validate(… STORED)` 를 돌려 싣는다
- **택한 것**: (a)
- **근거와 강약**: (b) 는 08-02 `RuleEditViewTest` 의 issues 기대와 화면 즉시 검사 동치(`sameIssues`)를 흔들고, 조회마다 원장 조회가 는다. 저장 응답과 상신 검사(08-05)가 경고를 보인다.
- **반려되면 재작업 방향**: `RuleViewService` 가 선택 버전으로 `validate(… STORED)` 를 불러 `serverIssues` 새 칸으로 싣고, 화면은 그 칸을 표 아래 "서버 검사" 로 보인다.

### D12 — 기대 JSON 의 `hit` 표현
- **질문**: 06 예 `{"…","hit":1}` 은 단일 적중만 보인다. 여러 행 적중·기본 행·적중 없음은 어떻게 적나.
- **선택지**: (a) 하나 = 숫자, 여럿 = 배열(엔진 hits 순서), 기본 행 = 기본 행 row_id, 없음 = null (b) 늘 배열
- **택한 것**: (a)
- **근거와 강약**: 06 샘플(06:1063·1322)이 숫자 하나를 쓰므로 그 모양을 그대로 받는다. 여러 행은 COLLECT·ANY·PRIORITY 에서만 나온다.
- **반려되면 재작업 방향**: 비교기와 `expectedFromResult` 만 배열로 바꾸고, 기존 케이스의 숫자를 한 원소 배열로 읽는다.

### D13 — 결과 식 셀 `ast` 의 저장 형식 (반려 재작업)
- **질문**: COLUMNS apply 가 결과 식 셀 `ast` 에 AST JSON 문자열을 넣어 왔다(R-F1). 무엇으로 저장하나.
- **선택지**: (a) JSON 객체(Map) — TABLE 저장·검사기와 같은 모양 (b) 문자열로 두고 독자가 늘 푼다
- **택한 것**: (a)
- **근거와 강약**: `RuleCellsCodec` javadoc(08-02)과 06 셀 JSON 이 "ast 는 객체" 라고 정했고(승인된 선행 산출물), TABLE 저장 경로는 이미 객체를 쓴다(리포 기존 관례). (b) 는 한 셀 JSON 안에 두 표현을 영구히 남긴다. VAR_AST·GRP_COND_AST 는 별도 문자열 컬럼이라 이 결정과 무관하게 문자열 그대로다.
- **반려되면 재작업 방향**: 없음에 가깝다 — 반려 사유가 이것을 요구했다.

### D14 — 디코드를 어디에 모으나 (반려 재작업)
- **질문**: 레거시 문자열 ast 를 읽는 곳이 여섯이고(R-F2) 화면 되돌림(R-F7)·view(R-F8)·확정 diff(R-F9)도 걸린다.
- **선택지**: (a) `RuleCellsCodec.parse` 가 문자열 ast 를 객체로 풀고, 독자는 `RuleCellsCodec.ast(Object)` 헬퍼로 읽으며, parse 를 거치지 않는 view·diff 는 같은 헬퍼로 정규화한다 (b) 독자 여섯만 헬퍼로 바꾸고 parse 는 그대로 (c) view 응답과 저장 입력만 정규화
- **택한 것**: (a)
- **근거와 강약**: parse 는 DB 행 독자와 저장 입력의 공통 진입점이라(R-F6) 거기 두면 빠지는 독자가 없고, 오래된 화면이 레거시 셀을 되돌려 보내도 TABLE 저장이 막히지 않는다(지금은 막힌다, R-F7). (b) 는 저장 입력 막힘과 앞으로 생길 독자를 못 막는다. (c) 는 원장 독자(값 테스트·확정)의 결함을 남긴다. parse 가 값을 고치지 않는다는 08-02 I17 은 셀 값(op·left·right·list·expr·val)에 대한 것으로 해석해 javadoc 에 적는다(ast 는 expr 에서 파생된 표현). `validateShape` 는 그대로 둬 Map 수준 호출자에게는 객체만 허용한다.
- **반려되면 재작업 방향**: (b) 면 parse 디코드를 빼고 `RuleTableService.checkRows` 에서 validateShape 전에 셀마다 `ast()` 로 정규화한다. 독자 헬퍼 교체는 그대로다.

### D15 — 빈 문자열 `ast` (반려 재작업)
- **질문**: `"ast":""`(예 `RuleColumnsServiceTest:398` 시드)를 어떻게 읽나.
- **선택지**: (a) 없음 — parse 가 키를 지운다 (b) 깨진 값으로 보고 INVALID_VALUE
- **택한 것**: (a)
- **근거와 강약**: 빈 문자열은 정보가 없고, 같은 레포의 VAR_AST·GRP_COND_AST 독자(`RuleDefinitionAssembler.map`)가 공백을 null 로 읽는 관례와 같다(리포 기존 관례). 식 셀이면 D16 의 "ast 없음" 오류가 따로 걸리므로 조용히 통과하지 않는다. 키를 지우는 것은 null 값이 `validateShape` 에 걸리지 않게 하려는 것이다.
- **반려되면 재작업 방향**: (b) 면 `ast()` 의 공백 분기를 예외로 바꾸고 398행 시드를 객체 ast 로 고친다.

### D16 — 깨진 ast·식 셀 ast 없음을 어떻게 알리나 (반려 재작업)
- **질문**: 반려 사유는 조용한 실패를 명시적 오류로 바꾸라고 한다. 조립(`RuleDefinitionAssembler`)의 셀 실패(D5)로 돌릴까, 예외로 던질까.
- **선택지**: (a) `BusinessException(INVALID_VALUE)` 를 던지고 셀 실패로 삼키지 않는다 (b) 셀 실패(`CellFailure`)로 행을 빼고 `failures()` 로 알린다 (c) 식 셀 ast 가 없으면 조립이 식 원문에서 AST 를 새로 만든다
- **택한 것**: (a)
- **근거와 강약**: 조립 호출자 다섯 가운데 넷(확정 케이스 재실행·계약 변경 검사 두 곳·케이스 결과 타입 검사)이 `failures()` 를 버린다(R-F5) — (b) 면 그 경로에서 다시 조용해진다. D5 의 셀 실패는 편집 중인 표의 셀을 위한 것이고, 저장된 AST 를 못 읽는 것은 데이터 손상이다. (c) 는 앱의 모든 쓰기 경로가 식 셀에 AST 를 채우므로(R-F4) 채우지 않는 경로가 없어 필요 없고, 손상을 가린다. 예외 종류는 저장된 셀 JSON 이 깨졌을 때 `RuleCellsCodec.parse` 가 이미 던지는 `INVALID_VALUE` 와 같게 해 OASIS 응답 `meta.message` 로 화면에 뜬다(F10). "식 셀" 판정은 검사기가 AST 를 채우는 판정과 같은 함수(`RuleExpressionChecks.exprCell`)라 값 테스트 본문의 정상 행은 걸리지 않는다.
- **반려되면 재작업 방향**: (b) 면 예외를 셀 루프 안으로 옮기고 `failures()` 를 버리는 네 호출자가 실패가 있으면 오류·경고를 내게 고친다.

### D17 — 기존 행 데이터 마이그레이션 (반려 재작업)
- **질문**: 이미 저장된 문자열 ast 행을 고쳐 쓸까.
- **선택지**: (a) 하지 않는다 — 관대한 읽기(D14)로 받는다 (b) Flyway 데이터 마이그레이션으로 CELLS 의 문자열 ast 를 객체로 바꾼다
- **택한 것**: (a)
- **근거와 강약**: RELEASED 버전은 불변이라 다시 쓰면 안 된다(06 버전 규칙, 확정 이력의 diff 기준). DRAFT 는 다음 COLUMNS·TABLE 저장 때 parse → write 로 저절로 객체가 된다. 읽기 디코드는 어차피 필요하므로 (b) 는 불변 원칙만 깨고 얻는 것이 없다.
- **반려되면 재작업 방향**: DRAFT 행만 대상으로 하는 반복 가능 마이그레이션(또는 기동 시 일회 작업)을 더하고, RELEASED 는 읽기 디코드로 남긴다.

### D18 — 엔진 `InputContracts` 를 고치나 (반려 재작업)
- **질문**: 명시적 오류를 엔진(AST 없는 결과 셀에서 계약 계산을 거부)에 둘까, mdm 에 둘까.
- **선택지**: (a) mdm 조립 경계(`RuleDefinitionAssembler`)에서 막고 엔진은 그대로 (b) 엔진 `InputContracts.rowContract` 가 AST 없는 결과 셀을 오류로
- **택한 것**: (a)
- **근거와 강약**: `InputContracts` 는 JUnit·Vitest 공용 코퍼스로 TS 포팅과 동치가 고정돼 있고(1차 B1·I28), 엔진은 AST 가 없는 정의(식 원문만 있는 외부 호출자)도 받아야 한다. 결함은 mdm 저장·재조립 경로에만 있다(DF-3 분석과 같다).
- **반려되면 재작업 방향**: 엔진·TS 양쪽 `rowContract` 에 같은 검사를 넣고 코퍼스에 사례를 더한다(엔진 라운드가 따로 필요).

### D19 — view 응답과 확정 diff 도 정규화하나 (반려 재작업)
- **질문**: view 는 CELLS 원문을, 확정 diff 는 ast 까지 포함한 JSON 을 쓴다(R-F6·R-F9). 레거시 행을 여기서도 바꿀까.
- **선택지**: (a) view 는 문자열 ast 가 든 행만 객체로 다시 써서 내려주고(나머지는 원문 바이트), diff 는 문자열 ast 를 풀어 비교한다 (b) 둘 다 원문 그대로 두고 FE 가 문자열 ast 를 푼다
- **택한 것**: (a)
- **근거와 강약**: 화면 evalex(입력 계약·분석·미리보기)가 셀 AST 를 걷으므로(R-F8) 서버가 한 번 정규화하면 FE 코드를 바꾸지 않아도 된다. 문자열 ast 가 없는 행을 원문 그대로 두는 것은 "손대지 않은 행은 바이트 단위로 같다"(grid-model.ts) 가정을 지키기 위해서다. diff 를 풀지 않으면 레거시 RELEASED 와 수정된 DRAFT 가 식이 같아도 CHANGED 로 보인다. (b) 는 FE 여러 곳(evalex 세 파일)을 고쳐야 하고 코퍼스 동치 대상인 evalex 를 흔든다.
- **반려되면 재작업 방향**: (b) 면 `M/src/evalex` 에 셀 ast 디코드를 넣고 `RuleViewService`·`RuleVersionDiffs` 수정을 되돌린다.
