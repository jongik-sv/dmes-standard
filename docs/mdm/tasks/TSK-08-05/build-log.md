# TSK-08-05 build-log

## B1 — 순수 이동(I9)

- `RuleValueTestService` 의 케이스 판정(`Evaluated`·`object`·`evaluate`·`runCase`·`hitValue`·`compare`·`resultKey`·`sameValue`·`sameHit`·`decimal`·`mismatch`·`results`·`value`·`error` 두 개)과 상수 `HIT_KEY`·`INPUT`·`NUMBER_TEXT` 를 `common/rule/RuleCaseJudge` 로 옮겼다. `RuleValueTestService` 는 static import 로 부른다. 옮긴 상수는 다른 테스트가 쓰지 않아 `RuleValueTestService` 에 남기지 않았다.
- 본문에서 바뀐 글자는 접근 제한자(`public`·`public static`), `runCase` 의 `static` 추가(인스턴스 필드를 쓰지 않았다), 메서드 참조 `RuleValueTestService::error`·`::value` → `RuleCaseJudge::error`·`::value` 뿐이다.
- 확인: `./gradlew :mdm:api:test --tests 'com.dongkuk.dmes.mdm.dme.ruleEdit.RuleValueTestServiceTest'` — 12건 통과(실패 0), 테스트 파일 수정 없음.
