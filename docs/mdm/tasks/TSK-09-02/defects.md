# TSK-09-02 defects

design.md 「1. 접근 방식」의 결함 발견 처리 절차대로 기록한다 — 게이트는 기준선 대비 신규 실패 0이므로 결함을 드러내는
실패 테스트는 커밋하지 않고, 여기 기록만 남긴 뒤 그 단언만 빼고 나머지 체인을 검증한다. 대상 WP는 06/07 시리즈 spec
어디에도 수신 API 구현 요구가 없어 불명이다 — 오케스트레이터·사람이 정한다(design.md §4 수용 기준 매핑).

## DF-1 — EQP_CD(EXTERNAL/MES 수신) 백엔드 구현 자체가 없다

- **대상 기능 WP**: 불명(추정 06 시리즈, `TB_MDM_CODE_RECV` 관련) — 06/07 spec 어디에도 수신 API 구현 요구가 없다.
- **재현 절차**: `grep EQP_CD src/backend --include 프로덕션 소스` → 0건. `TB_MDM_CODE_RECV`는 마이그레이션 DDL·샘플
  SQL에만 있고 이를 채우는 서비스가 없다.
- **기대 결과**: 04 「샘플 데이터」의 EQP_CD 수신 로그 3건(recv 1/2/3) 예제를 등록→편집→확정 흐름과 원장 판정으로
  재현할 수 있어야 한다(spec 요구사항 1).
- **실제 결과**: 수신 API 프로덕션 서비스가 없어 재현 자체가 불가능하다. `CodeItemEditSampleDataTest.SD7`은 "조회
  전용"만 확인한다.
- **범위 처리**: B1(design.md §3 B1-6)이 이 단위에서 다루지 않기로 확정했다. B1의 STEEL_STD·PROC_CD 시험은 이 결함과
  무관하게 통과한다.

## DF-2 — CUST(EXTERNAL/ERP 수신) 백엔드 구현 자체가 없다

- **대상 기능 WP**: 불명(추정 07 시리즈, `TB_MDM_DATA_RECV`/`TB_MDM_DATA_RECV_ITEM` 관련) — 06/07 spec 어디에도 수신
  API 구현 요구가 없다.
- **재현 절차**: `TB_MDM_DATA_RECV`·`TB_MDM_DATA_RECV_ITEM`은 마이그레이션 DDL과 엔티티(`MdmDataRecv`/
  `MdmDataRecvItem`)만 있고 이를 채우는 서비스가 없다.
- **기대 결과**: CUST의 정규 등록 경로(수신 API)로 거래처 데이터를 적재하고 원장 기준 판정을 확인할 수 있어야 한다
  (spec 요구사항 2).
- **실제 결과**: 수신 API 프로덕션 서비스가 없어 재현 자체가 불가능하다. `source_kind=EXTERNAL`이므로 화면·CSV
  경로는 검사 2(원천 불일치)로 거부되는 것이 정상 동작이다 — 이 음성 케이스만
  `MasterDataLedgerJudgmentSqliteTest.CUST_화면_경로는_원천_불일치로_거부한다`·
  `CUST_CSV_경로도_원천_불일치로_거부한다`(B2)로 확인했다.
- **범위 처리**: B2(design.md §3 B2-6)가 화면·CSV 거부(음성 케이스)만 확인하고 수신 API·판정은 범위 밖으로 남긴다.

## DF-3 — DERIVE 룰의 결과 식이 참조하는 외부 변수는 실제로 원장에 심어 값 테스트를 돌리면 조용히 틀린 값을 낸다

- **대상 기능 WP**: TSK-08-04(`RuleColumnsService`/`RuleDefinitionAssembler`, `mdm/lib`).
- **재현 절차**: DERIVE 룰(예 SPD_JOIN)을 `ruleEdit.save`(part COLUMNS)로 등록하며 결과 열에 자기 자신이 선언하지 않은 이름
  (예 `BASE_SPD`·`EXC_SPD`, 다른 룰의 결과나 컬럼 사전 물리명)을 참조하는 식(`IF(EXC_SPD == NULL, BASE_SPD, MIN(BASE_SPD, EXC_SPD))`)을
  저장한다. `TB_MDM_RULE_ROW.CELLS`를 읽으면 `"ast"` 값이 중첩 JSON 객체가 아니라 이스케이프된 **문자열**로 이중 인코딩돼 있다
  (`RuleColumnsService.checkDeriveExprs`의 `line.exprAst` 필드가 `String`이라 `Map.of("expr", ..., "ast", line.exprAst)`에 문자열이
  그대로 들어간다 — `RuleCellsCodec` 주석 "ast 는 객체"를 어긴다). `ruleEdit.execute`(target VERSION, runCases=true)로 그 값을
  숫자로 참조하는 케이스(`EXC_SPD`가 NULL이 아닌 분기, 예 `{"BASE_SPD":"90","EXC_SPD":"70"}` → 기대 `MIN(90,70)=70`)를 돌린다.
- **기대 결과**: `BASE_SPD`·`EXC_SPD`가 선언 타입(NUMBER)으로 변환돼 `MIN`이 70을 낸다.
- **실제 결과**: `RuleDefinitionAssembler.astOf(Object)`가 `instanceof Map` 검사에서 실패해 `null`을 돌려주고,
  `InputContracts.compute`의 널 안전 분석이 그 결과 셀의 AST를 못 읽어 `RowContract.required()`·`optional()`이 **빈 리스트**가
  된다. 그래서 `RuleEvaluator.resultCheck()`가 `BASE_SPD`·`EXC_SPD`를 선언 타입으로 변환하지 않고, 원시 JSON 문자열/배열이
  그대로 EvalEx `MIN`에 들어가 **조용히 0**을 낸다(오류를 던지지 않는다 — `outcome:"OK"`, `pass:false`). `IF`의 참 분기(NULL
  가드로 `EXC_SPD`를 참조하지 않는 경로)만 이 결함을 비켜 간다 — 식 결과가 `BASE_SPD` 값 그대로라 결과 열 자기 자신의 선언 타입
  변환(`evaluateRow`의 바깥 `ValueConverter.toDeclared`)이 뒤늦게 문자열을 되돌리기 때문이다.
- **범위 처리**: B3(design.md §3 B3-2)의 `RuleSetLifecycleOasisFlowTest`가 SPD_JOIN을 실제 화면 경로로 등록·확정하다 이 결함과
  마주쳐, `MIN` 분기의 값 검증을 이 OASIS 시험에서 뺐다(참 분기만 케이스로 남긴다). `MIN` 분기의 값 자체는
  `SampleRuleSetValueTest`(엔진 레벨 `evaluateSet`, 시험 코드 안에서 손으로 조립한 `RuleDefinition`)가 이미 확정했다 — 이 결함은
  엔진 로직이 아니라 mdm/api의 저장·재조립 경로에만 있다. 재현·수정은 `RuleColumnsService.checkDeriveExprs`가 `exprAst`를
  `Map<String,Object>`로 들고 있다가(또는 `RuleCellsCodec.write` 전에 역직렬화해) 저장하도록 고치는 별도 dev Task가 맡는다.
