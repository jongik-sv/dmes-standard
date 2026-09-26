# TSK-09-03 defects

design.md §4(수용 기준 매핑)·§0.3 이 이미 코드로 확인한 결함이다. B1~B3 실행 중 판정을 새로 막은 결함은 없었다
(B3 의 CODE→코드확정→데이터등록→룰 MASTER 확정→판정 시나리오는 6단계까지 전부 통과했다 — 「담당자 확인 필요 결정」
D1 의 (a) 안대로 시험 전용 wiring 으로 완성됨, build-log.md 참조). 아래 DF-1 은 이 작업이 "성능 기준 충족"을 완전히
"충족"으로 판정할 수 없게 하는, design §0.3·D2 가 이미 짚은 기존 결함이다.

## DF-1 — `ExpressionRunner`/`RuleEvaluator` 에 컴파일 캐시가 없다(PRD NFR-1 미구현)

- **대상 WP**: D17 을 배정받은 WP(design.md D2 제안 — TSK-03-02 계열). 이 작업(TSK-09-03)은 itest 범위라 프로덕션
  코드를 고치지 않으므로 직접 고치지 않는다.
- **재현 절차**:
  1. `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/expr/`(또는 `RuleEvaluator` 호출부)에서
     평가마다 `new Expression(...)`(또는 동등한 파싱)을 호출하는 지점을 확인한다(design.md §0.3 에서 코드로 확인).
  2. 같은 식을 반복 평가해도 캐시를 재사용하지 않고 매번 새로 파싱·컴파일한다.
- **기대 결과**: PRD NFR-1 "서버 룰 판정은 컴파일 캐시를 쓴다" — 같은 식은 한 번만 컴파일하고 이후 평가는 캐시를
  재사용해야 한다.
- **실제 결과**: 컴파일 캐시가 전혀 없다(D17 미연결). B3 의 `CodeDataRuleLedgerChainTest` 가 1만 건을 판정하는 데
  걸린 시간(로그 참조, 시간 예산 단언은 두지 않았다 — design §0.3·D2)도 이 캐시 부재를 그대로 반영한다.
- **처리**: design.md 「담당자 확인 필요 결정」 D2 가 (a)를 택했다 — 이 결함을 DF 로만 기록하고 "성능 기준 충족"의
  서버 캐시 부분은 "확인 불가"로 남긴다(화면 NFR-1·1만 행 판정 정확성은 B3 가 별도로 충족을 확인했다). 새 ms 기준
  시험은 만들지 않는다(캐시 없는 상태에서는 측정 대상 자체가 구조적으로 의미가 없다, D2 근거).

## DF-2 — mcm 포함 빌드의 서브프로젝트 테스트가 `testAll` 게이트에서 돌지 않는다(게이트 사각지대)

- **대상**: mcm 모듈 빌드 구성(공용 게이트). MDM 기능 WP 가 아니라 리포 게이트 설정 문제라 담당은 팀장·사람이 정한다.
  design.md D5 가 "별도 DF 로 남긴다"고 적은 항목이다(오케스트레이터 보강).
- **재현 절차**:
  1. `src/backend/mdm/build.gradle:63-64` 에는 `tasks.named('test') { dependsOn(subprojects.collect { "${it.path}:test" }) }`
     집계 줄이 있지만 `src/backend/mcm/build.gradle` 에는 없다.
  2. `cd src/backend && ./gradlew testAll --dry-run` 의 태스크 그래프에 `:mcm:test`(소스 없음)만 있고 `:mcm:api:test`·
     `:mcm:lib:test` 가 없다(Design 단계 실측).
- **기대 결과**: `testAll`(= `.dflow-gates` 의 `full`)이 mcm 의 서브프로젝트 테스트도 돌린다.
- **실제 결과**: `mcm/lib/src/test` 의 테스트(예: `SampleNoticeServiceTest`)는 어느 게이트에서도 돌지 않는다. 그래서
  이 작업은 권한 시드 대조(B1)를 mcm 쪽 `@SpringBootTest` 대신 mdm/api 의 소스 텍스트 대조로 두었다(D5 (a)).
- **처리**: 이 작업은 공유 게이트 구성을 바꾸지 않는다. 집계 줄을 더하면 그동안 돌지 않던 mcm 테스트가 처음 게이트에
  들어오므로, 그 결과를 누가 책임질지 먼저 정해야 한다.
