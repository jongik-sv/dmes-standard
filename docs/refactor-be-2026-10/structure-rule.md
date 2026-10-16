# BE 리팩토링 2회차 — rule 레인 구조 변경 기록

레인 rule(브랜치 `refactor-be/mdm-rule`, 세션 rbe-mdm-rule-78)의 구조 변경을 적는다. 형식은 1회차 [README §6.1](../refactor-2026-10/README.md) 을 따르고, 항목 ID 는 [README.md](./README.md) 의 표를 따른다.

## 기준선 (2026-10-16, 태그 `refactor-be-2026-10-base` = 40fa5061a)

| 대상 | 명령 | 결과 |
|---|---|---|
| maru-mdm-engine | `./gradlew -p maru-mdm-engine test --continue` | 1686건, 실패 0, 건너뜀 1 |
| mdm lib | `./gradlew -p mdm :lib:test :api:test -Pdmes.ora.test=clone --continue` | 2279건, 실패 0 |
| mdm api | 위와 같은 명령 | 2081건, 실패 1, 건너뜀 13. 실패는 `CodeCateEditPerformanceSqliteTest#AC4_1000건_소속_이동_저장은_중앙값이_800ms_미만이다`(중앙값 2476ms, 부하 추정, rule 영역 밖) |
| shared | `npx tsup` 뒤 `npx vitest run tests/unit` | 3099건, 실패 1. `grid-header.unit.test.ts` 5초 시간 초과(부하, evalex 무관) |
| m-mdm | `node scripts/test.mjs` | 4452건, 실패 3. `debug-subset.test.ts`·`node-desc-debug.test.ts` 5초 시간 초과(부하), `ui-meta-lock.test.ts` 기록 불일치(기존) |
| m-mcm rule-calc | `npx vitest run widget-types/rule-calc` | 125건, 실패 0 |

## S1. C5 — common/rule 의 화면 하나만 쓰는 클래스 5개를 그 화면으로

- 커밋: b74219f57
- 바뀌기 전: `common/rule` 에 `RunTraceJson`·`RuleSetGuide`·`RuleSetTestCaseWrites`(ruleSetEdit 만 씀)와 `RuleTestCaseWrites`·`RuleHitPolicies`(ruleEdit 만 씀)가 있었다.
- 바뀐 뒤: 앞의 셋은 `dme/ruleSetEdit/service`, 뒤의 둘은 `dme/ruleEdit/service` 에 있다. 시험 `RunTraceJsonTest`·`RuleSetGuideTest` 도 lib 시험의 같은 패키지로 옮겼다. `RuleSetGuideTest` 는 common.rule 패키지 전용 도우미(`RuleSetAnalyzerTest.cond`·`rule`)를 쓸 수 없게 되어, 같은 값을 만드는 도우미 두 개를 자기 안에 둔다.
- 바꾼 이유: common 에는 여러 화면이 함께 쓰는 것만 둔다. 한 화면 전용 클래스가 common 에 있으면 그 화면을 고칠 때 common 까지 건드리게 된다.
- 동작 보존 근거: 클래스 본문은 바꾸지 않았다(package·import 줄만). 시험 결과는 머지 요청에 적는다.
- 영향 범위: import 줄만 바뀐다. 대상은 `RuleSetEditService`·`RuleSetTestCaseService`·`RuleSetGuideResult`·`RuleTableService`·`RuleTestCaseService`·`RuleValueTestService` 와 api 시험 `MdmOracleDialectProbeOraTest`·`RuleSetEditServiceTest` 다. `RuleIo` Javadoc 의 `{@link RuleSetGuide}` 는 `{@code RuleSetGuide}(dme/ruleSetEdit)` 로 바꿨다.
- 되돌리는 방법: 이 커밋을 revert 한다.
- 감사 정정: findings C5 의 「`confirm/RuleConfirmQueries` 는 ruleConfirm 만 쓴다」는 틀렸다. `common/rule/confirm/RuleConfirmChecks:61·67` 이 쓰므로 옮기지 않았다.
- 결정 기록과의 관계: `docs/mdm/decisions.md:985` 는 `RuleHitPolicies` 를 `common/rule` 에 둔다고 적는다(D-105 때 쓰는 곳이 셋이었다). D-133 뒤 쓰는 곳이 둘 다 룰 편집 화면이 되어 화면 패키지로 옮겼고, 판정이 한 클래스에 있다는 뜻은 그대로다. 클래스 Javadoc 을 이에 맞게 고쳤다.
- 남은 점: `dme/ruleSetEdit/dto/RuleSetGuideResult` 가 `RuleSetGuide.Ambiguity` 때문에 같은 화면의 `service` 패키지를 import 한다(화면 안 dto ↔ service 순환). 컴파일·동작 문제는 없고, 「dto 는 service 에 기대지 않는다」 규칙을 둘 때 다시 본다.

## S2. C5 — `NamingRules` 를 dma/naming 에서 common/naming 으로

- 커밋: 26da574f2
- 바뀌기 전: `dma/naming` 의 19개 클래스 가운데 `NamingRules` 만 dma 밖(`common/rule/RuleIdRules`, dmc `CodeMngService`, dmd `DataMngService`, dme `RuleSetIdRules`)에서 쓰였다. 그래서 common·dmc·dmd·dme 가 dma 화면 그룹에 기댔다.
- 바뀐 뒤: `NamingRules` 는 `common/naming` 에 있다. 나머지 18개는 dma 안(columnMng·erdEdit·termRegPop·support)에서만 쓰므로 dma 안 라이브러리로 그대로 둔다.
- 바꾼 이유: 여러 화면 그룹이 함께 쓰는 ID·이름 형식 규칙을 common 에 둬서, 화면 그룹 사이의 의존을 없앤다.
- 동작 보존 근거: 클래스 본문은 바꾸지 않았다. 시험 결과는 머지 요청에 적는다.
- 영향 범위: import 줄만 바뀐다. 다른 레인 파일(dmc `CodeMngService`·dmd `DataMngService` = version, dma `ColumnMngService`·`TermRegPopService` = erd-term)도 import 줄만 고쳤다(조정자 승인). 같은 패키지였던 `dma/naming` 의 5개 파일과 `LabelSuggesterTest` 에는 import 를 더했다.
- 되돌리는 방법: 이 커밋을 revert 한다. 그 사이에 다른 레인이 `common.naming.NamingRules` 를 import 했으면 그 줄도 되돌린다.
- `dma/naming/package-info.java` 에 `NamingRules` 가 `common.naming` 에 있다는 한 줄을 더했다.

## C5 에서 하지 않은 것

- `DomainTestCaseRunner` 를 common 으로 옮기는 일: 이 클래스는 dma/domainMng/service 의 `DomainDraft`·`DomainIssue`·`DomainIssueCode`·`DomainTestCase` 를 쓰므로, 그대로 옮기면 common → dma 의존이 새로 생긴다. `dmb/layout/LayoutConstJudge` 는 `preview` 하나만 쓴다. 조정자 결정(2026-10-16)으로 옮기지 않고 ArchUnit 예외로 둔다. `preview` 계열(판정·정의 만들기)을 common 으로 추출하는 것을 다음 후보로 둔다.

## S3. F4 — 숫자 글자를 NUMBER 로 바꾸는 규칙을 도메인 검증과 같게

- 커밋: 875c5bcd5(fix, 동작 변경, squash 머지. 원래 커밋 4f2ecb140)
- 바뀌기 전: 글자 값 → 선언 타입 NUMBER 변환이 곳마다 달랐다. 도메인 검증(엔진 `expr.ValueConverter`)은 `^[+-]?[0-9]+(\.[0-9]+)?$` 만 받았고, 룰 판정(엔진 `rule.ValueConverter`)·룰 계산기(`RuleCalcService.toNumber`)·코퍼스 하네스는 `new BigDecimal(s)` 로 지수(`1e3`)·`.5`·`5.`·ASCII 밖 숫자까지 받았다. TS `convertForType` 은 `BIGDECIMAL_TEXT` 로 Java `new BigDecimal` 을 흉내 냈다.
- 바뀐 뒤: 모두 `expr.ValueConverter` 의 숫자 글자 규칙을 쓴다. Java 는 `rule.ValueConverter`·`RuleCalcService`·하네스가 `expr.ValueConverter.convert(s, NUMBER)` 에 맡기고, TS 는 `ENGINE_NUMBER_TEXT`(shared evalex 새 export)를 쓴다. `BIGDECIMAL_TEXT` 는 지웠다. `RuleCalcService` 의 앞뒤 공백 제거·크기 방어(2000자·1000자리)와 `rejectOversizedText` 는 그대로다.
- 화면 쪽 같이 고친 곳(조정자 승인): m-mdm 열 설정 미리보기 입력(`preview-input.ts`)은 치는 도중의 `1.` 을 글자로 두어 render 예외를 내지 않는다. 경계값 생성기(`boundary-cases.ts`)는 식 상수·초안 셀의 `.5`·`5.` 를 `0.5`·`5` 로 바꿔 쓴다. m-mcm 룰 계산기 입력 검사(`isValidNumberText`)는 서버와 같은 모양만 받는다. mdm-meta `validate.ts` 의 정규식 사본은 shared export 를 쓴다.
- 바꾼 이유: 같은 값이 도메인 검증에서는 거부되고 룰 판정에서는 숫자로 읽혀 결과가 갈렸다. 조정자 결정(지수 표기 전면 거부, 도메인 검증과 같게)을 따른다.
- 동작 보존 근거: 동작 변경 커밋이다. 바뀐 동작은 시험으로 고정했다. engine `ValueConverterTest`(거부 9건)·`RuleEngineStageTest`(입력·결과 지수 2건)·`RuleSetFlowEvaluationTest`(갈래 지수 1건), `engine-corpus.json` 셀 거부 5건·`+2.50` 수락 1건(Java·TS 함께), shared `convert-for-type.test.ts`·`contract-parity`(Java·TS 정규식 대조), `RuleCalcServiceValueTest`(거부 10건, 크기 방어는 평문 큰 수로), m-mdm `preview-input.test.ts`·`boundary-cases.test.ts` 2건, m-mcm `rule-calc-model.test.ts`. 시험 결과는 머지 요청에 적는다.
- 영향 범위: 룰·룰 세트 판정, 룰 계산기 `execute`(문서 `docs/widget-2026-10/rule-calc-api.md` 갱신), 화면 EvalEx 평가기, 룰 편집 화면(미리보기·경계값 생성), 룰 계산기 위젯. **미확인**: 이미 저장된 데이터(룰 시험 케이스 입력, 화면·외부가 보내는 레코드 값)에 지수 표기 숫자 글자가 있는지 확인하지 않았다. 있으면 이 변경 뒤 `TYPE_CONVERSION`·`INPUT_INVALID` 가 된다.
- 되돌리는 방법: 875c5bcd5 를 revert 한다(문서·D4 기록이 같이 되돌아간다).

## S4. C5 — 식 파싱을 `common/rule/RuleExprParser` 로 추출

- 커밋: C5 나머지 squash 머지 커밋 1개(S4·S5 함께). 원래 커밋은 그 본문에 적는다.
- 바뀌기 전: 룰 세트 편집 화면의 `RuleSetEditService.condIo`(조건식 IO, P-D1)가 룰 편집 화면 서비스 `RuleEditService.parseExpr` 를 불렀다. 응답 DTO `RuleSetCondIoResult` 도 `dme/ruleEdit/dto/RuleExprParseResult` 를 썼다. 그래서 ruleSetEdit 화면이 ruleEdit 화면에 기댔다.
- 바뀐 뒤: 파싱 본문(빈 식·칸 종류 검사, `ExpressionChecker` 문제 거르기, AST 내보내기, 화면 평가 가능 여부)은 `common/rule/RuleExprParser.parse(text, slot)`(`@Component`)에 있다. `RuleExprParseResult` 는 `common/rule/dto` 로 옮겼다. `RuleEditService.parseExpr` 는 위임만 하고, `RuleSetEditService` 는 `RuleExprParser` 를 직접 쓴다. `RuleExprParseRequest` 는 `ruleEdit.bpmn` 이 dto FQCN 으로 쓰므로 `dme/ruleEdit/dto` 에 그대로 둔다.
- 바꾼 이유: 두 화면이 함께 쓰는 식 파싱을 common 에 둬서, 화면 사이의 의존을 없앤다.
- 동작 보존 근거: 파싱 본문은 옮기기만 했다. 입력 꺼내기(`request == null` 이면 null)와 오류 순서·문구가 같다. 시험 `RuleEditViewTest`(parseExpr)·`RuleSetEditServiceTest`(condIo) 를 그대로 통과한다. 시험 결과는 머지 요청에 적는다.
- 영향 범위: `RuleEditService`·`RuleSetEditService` 생성자 인자가 바뀐다(Spring 주입). import 줄은 `RuleSetCondIoResult`·`RuleEditViewTest` 도 바뀐다. 화면 응답 JSON 모양은 같다.
- 되돌리는 방법: C5 나머지 squash 커밋을 revert 한다(S4·S5 가 같이 되돌아간다). S4 만 되돌리려면 S5 시험 예외 목록에 `dme.ruleSetEdit -> dme.ruleEdit` 를 더한다.

## S5. C5 — 화면 패키지 경계를 ArchUnit 으로 고정

- 커밋: S4 와 같은 squash 머지 커밋.
- 바뀐 뒤: mdm lib 시험 `MdmScreenPackageArchitectureTest` 가 두 규칙을 검사한다. (1) `common` 은 화면 그룹(`dma`·`dmb`·`dmc`·`dmd`·`dme`)에 기대지 않는다. (2) 화면 패키지(`<그룹>.<화면>`)는 다른 화면 패키지에 기대지 않는다. 같은 그룹의 라이브러리 패키지(`dma.naming`·`dma.support`·`dmb.layout`)는 쓸 수 있다.
- 남은 의존은 예외 목록에 줄마다 항목 ID 와 함께 둔다. 예외가 더는 쓰이지 않으면 두 번째 시험이 실패하므로, 의존을 없앤 레인이 그 줄을 지운다.

| 예외 | 남은 까닭 | 정리할 곳 |
|---|---|---|
| `dmb.layout -> dmb.layoutMng` | layout 코어가 layoutMng 화면 DTO 를 내부 모델로 쓴다 | C5 layout 코어 부분(version 레인) |
| `dmb.headerMng -> dmb.layoutMng` | `HeaderMngService` 가 layoutMng 화면 DTO(`LayoutVersionRequest`·`LayoutVersionResult`)를 쓴다 | C5 layout 코어 부분(version 레인) |
| `dmb.layout -> dma.domainMng` | `LayoutConstJudge` 가 `DomainTestCaseRunner.preview` 를 쓴다 | `preview` 계열 common 추출 후보 |
| `dmd.dataHistory -> dmd.dataItemMng` | 목록 조회·행 모델을 쓴다 | C7 뒤 후보 |
| `common.version -> dmb.layout` | `DefaultVersionStateService` 가 `LayoutQueries` 로 레이아웃 버전 상태를 읽는다 | 범위 밖(version 레인 영역) |

- 바꾼 이유: C5 로 정리한 경계가 다시 무너지지 않게 한다.
- 영향 범위: 시험만 더한다. 다른 레인이 예외 목록 밖의 화면 사이 의존을 새로 만들면 이 시험이 실패한다.
- 한계: 예외는 단위 쌍으로 두므로, 예외로 둔 두 단위 사이에 클래스 의존을 더 만들면 잡지 못한다. 다른 화면의 컴파일 상수만 읽는 의존도 클래스 파일에 참조가 남지 않아 잡지 못한다.
- 머지 순서: 예외 5줄 가운데 3줄(`dmb.layout -> dmb.layoutMng`·`dmb.headerMng -> dmb.layoutMng`·`common.version -> dmb.layout`)은 version 레인 코드다. version 레인이 그 의존을 먼저 없애고 머지하면, 이 시험은 머지 뒤 「쓰이지 않는 예외」로 실패한다. 그 경우 그 줄을 지운다.
- 되돌리는 방법: 시험 파일 `MdmScreenPackageArchitectureTest` 를 archive 로 옮긴다(`git mv`). squash 커밋 전체를 revert 하면 S4 도 같이 되돌아간다.

## D4 — `RuleSetRunner` OASIS 진입을 보관하지 않음 (ADR-0005 D2)

- 결정: 보관하지 않고 그대로 둔다(조정자 2026-10-16). 「쓸 계획 없음」 전제가 ADR-0005(ACCEPTED) D2 와 맞지 않아 앞 결정을 뒤집었다.
- 근거: ADR-0005 D2 는 `RuleSetRunner`(`@Service("ruleSetRunner")`)의 `run(setId, record, evalTs)`·`execute(RuleSetRunRequest)` 를 OASIS 업무 서비스와 Java 호출자가 룰 세트를 부르는 경계로 정한다. ADR D4 는 1단계에서 운영 BPMN 에 action 을 넣지 않고 시험 BPMN 하나로 경로만 검증한다고 적었다. 그래서 지금 부르는 업무 서비스가 없을 뿐, 설계로 정해 둔 입구다.
- 확인한 것(저장소 전체, 대소문자 무시): 운영 BPMN·FE·다른 모듈에서 `ruleSetRunner`·`RuleSetRunRequest`·`RuleSetRunResult` 를 쓰는 곳은 없다. 시험 BPMN `mdm/api/src/test/resources/services/probe/ruleSetRunProbe.bpmn` 하나가 `execute` 를 부른다. 운영 코드는 `session()`·`trace` 말고도 `parseKst`(RuleCalcService·RuleSetEditService·RuleSetTestCaseService·RuleSetConfirmChecks), `warning()`(RuleSetEditService), `RULE_DEPRECATED`·`deprecatedWarnings(List)`(RuleCalcService)를 쓴다.
- 보관했다면 들었을 일: `execute`·`run` 을 부르는 시험 7개 파일(RuleSetRunnerTest 22개 가운데 약 15개, RuleSetRunnerSubsetTest·RuleSetRunnerSetPathSqliteTest·RuleSetRunnerOasisTest·RuleSetRunnerMappingTest·SetCallIoEngineAgreementTest 1개, RuleSetDraftRunTest·RuleSetSimulateTest 단언 1개씩)을 나누거나 옮겨야 해서 크기가 S 가 아니라 M 이었다. ADR 개정도 필요했다.

## 후보 (이번에 하지 않음)

- F4 범위 밖: 엔진 `rule/RecordKeys` 는 `CATCH_*` 를 검사하고 `expr/RecordKeys` 는 검사하지 않는다. `ExpressionFailure` 가 `rule`·`expr` 두 패키지에 같은 이름으로 있다.
- F4 범위 밖(설계 시점 셀 글자·분석 경로, 레코드 값 변환이 아님): 엔진 `rule/RuleAnalyzer` 의 `PLAIN_DECIMAL`(`.5`·`5.` 받음)·`rule/ResultAggregator:66` 우선순위 원소 `new BigDecimal(element)`(지수 받음)·`rule/CellTextGenerator:269`, mdm `common/rule/check/ledger/DomainRangeCheck:119` `new BigDecimal(value.trim())`(지수·`.5` 받음 — 도메인 검증은 거부), TS `evalex/cell-compare.ts:51`·`rule-analysis.ts`·`interpreter.ts` 숫자 리터럴, m-mdm `boundary-cases.ts` 의 STRING 갈래 숫자 상수. 셀 값을 저장할 때 도메인 검증이 먼저 거르므로 지금 결과 차이는 확인하지 못했다.
- F4 뒤: `RuleCalcService.rejectOversizedText` 는 「엔진이 지수 글자를 NUMBER 로 바꿀 수 있다」는 근거가 약해졌다(엔진이 이제 거부한다). 평문 긴 숫자 방어로는 여전히 필요해 그대로 둔다.
- F4 뒤(UI): m-mcm 룰 계산기 `contextFill` 은 화면의 JS 숫자를 `String(n)` 으로 옮겨 `1e+21`·`1e-7` 이 되면 입력 검사에서 막힌다(전에도 막혔다). 지수를 펼쳐 채우는 것을 후보로 둔다.
- dmd/dataHistory → dmd/dataItemMng(`DataItemListQuery`·`DataItemRows`·dto) 의존은 C7(version 레인) 뒤의 후보다.
- `DomainTestCaseRunner.preview` 추출(위 「C5 에서 하지 않은 것」).
