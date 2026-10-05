# srv 진행 기록

조정 세션: dmes-standard-90. 브랜치 `feat/rule-set-subset-server`, 워크트리 `/Users/jji/project/dmes-standard-wt/rssc-srv`.

## 기준선
- 착수 커밋: dev c12e99a4(plan:0 반영) / 시험: srv:3 대상 묶음은 아래 항목에 적는다.

## 지금 상태·다음 단계
- srv:3 구현·시험 끝, 리뷰 중.
- 다음: srv:5(eng:2 dev 반영 뒤 구현, 그 전에는 설계·시험 초안) → srv:6(srv:3·srv:5·eng:4 뒤).
- 메모: eng:1 이 `RuleSetRunner` 의 `new Violation(…FLOW_INVALID…)` 에 `List.of()` 인자를 더한다. srv:6 은 그 뒤 모양을 기준으로 고친다.

## srv:3. DB — `TB_MDM_RULE_SET_VER.CALL_SET_IDS`(V23)
- 커밋: (커밋 뒤 적는다)
- 시험 결과: `../gradlew :api:test --max-workers=2 --tests '*MdmBusinessRuleMigrationTest' --tests '*MdmRuleSetVerCallSetIdsMigrationTest' --tests '*MdmSharedContractMigrationTest' --tests '*MdmLocalSample*' --tests '*RuleSetEdit*' --tests '*RuleSetMng*' --tests '*RuleSetVersion*'` → 12 클래스 104건 통과, 실패 0.
- 결정:
  - 새 버전 복사 단언은 `RuleSetVersionOpsSqliteTest.minorCopiesLatestReleasedFlowAndRecordsKindAndOwner` 에 더했다(시드에서 1.000 에 `["S_B"]` 를 넣고 1.001 을 읽는다). 이를 위해 `DmeTestSupport.setVerValue` 의 허용 칼럼에 `CALL_SET_IDS` 를 더했다.
- 계획 조정:
  - 샘플 SQL 의 `SHIP_PLAN`(SET 노드 시연 세트)은 srv:6 으로 미뤘다. 샘플 적재 시험은 흐름을 해석하지 않지만, eng:1 전에 dev 에 `"kind":"SET"` 흐름이 들어가면 로컬 서버가 이 세트를 읽을 때 알 수 없는 노드 종류로 실패할 수 있다(계획 Step 6 의 미룸 조건을 넓혀 적용). 기존 세트 적재 블록은 VER 행 INSERT 가 `CALL_SET_IDS` 를 적지 않아 기본값 `'[]'` 가 들어가므로 이번에는 고치지 않았다(임시 표 칸 추가는 `SHIP_PLAN` 과 함께 srv:6 에서 한다).
  - `RuleSetMngServiceTest` 등록 행 단언은 계획 새 판 Files 에 없어 더하지 않았다. 등록 1.000 DRAFT 의 `'[]'` 는 엔티티 기본값이 지키며, `MdmBusinessRuleMigrationTest` 기본값 시험이 DB 기본값을 확인한다.
