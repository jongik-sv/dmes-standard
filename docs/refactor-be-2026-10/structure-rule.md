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

## 후보 (이번에 하지 않음)

- F4 범위 밖: 엔진 `rule/RecordKeys` 는 `CATCH_*` 를 검사하고 `expr/RecordKeys` 는 검사하지 않는다. `ExpressionFailure` 가 `rule`·`expr` 두 패키지에 같은 이름으로 있다.
- D4 뒤: `RuleErrorText.withSetPath`·`missingSetId`·`setAbsent` 는 운영 코드에서 쓰는 곳이 없어진다. 이번에는 둔다.
- dmd/dataHistory → dmd/dataItemMng(`DataItemListQuery`·`DataItemRows`·dto) 의존은 C7(version 레인) 뒤의 후보다.
- `DomainTestCaseRunner.preview` 추출(위 「C5 에서 하지 않은 것」).
