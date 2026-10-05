# srv 진행 기록

조정 세션: dmes-standard-90. 브랜치 `feat/rule-set-subset-server`, 워크트리 `/Users/jji/project/dmes-standard-wt/rssc-srv`.

## 기준선
- 착수 커밋: dev c12e99a4(plan:0 반영) / 시험: srv:3 대상 묶음은 아래 항목에 적는다.

## 지금 상태·다음 단계
- srv:3 dev 머지 끝(2b638315, 머지 뒤 :api 마이그레이션 시험 15클래스 88건 통과).
- srv:5 설계·코퍼스 초안 중(아래 「srv:5」 계획 조정), 구현은 eng:2 dev 반영 뒤.
- 다음: srv:5(eng:2 dev 반영 뒤 구현, 그 전에는 설계·시험 초안) → srv:6(srv:3·srv:5·eng:4 뒤).
- 메모: dev c12e99a4 의 m-mdm `tests/ui-meta-lock.test.ts` 1건 실패는 기존 실패이고 dev 14ec1124 에서 고쳐졌다. 머지 요청 전에 dev 를 합친다.
- 메모: eng:1 이 `RuleSetRunner` 의 `new Violation(…FLOW_INVALID…)` 에 `List.of()` 인자를 더한다. srv:6 은 그 뒤 모양을 기준으로 고친다.

## srv:5. 서버 분석기·코퍼스 (진행 중 — eng:2 dev 반영 대기)
- 계획 조정(조정 답 srv-2·srv-3로 확정):
  - **`FlowTree.callSteps()` 를 엔진에 두지 않는다(조정 답 (b)).** 분석기가 흐름 트리를 직접 걸어 RULE·SET 단계를 모은다. 거르는 규칙(ui:5t TS 짝도 같게): 루트 `Seq` 부터 깊이 우선으로, `RuleStep`·`SetStep` 은 그대로 담고 `TaskStep` 은 건너뛴다. `Guarded` 는 자기 `step()`(RULE·SET 일 때만) → 정상 갈래 `normal` → 처리 갈래 `handlers` 를 배열 순서로 각 `body`. `Split` 은 `branches` 를 배열 순서로. 같은 노드는 한 번만 담는다. 시험에서 이 목록의 RULE 부분이 `FlowTree.ruleSteps()` 와 같은 순서인지 코퍼스 전체로 단언한다.
  - eng:2 에 기대하는 이름: `SetStep(nodeId, setId)`(`Step permits` 에 추가), `NodeKind.SET`, `FlowNode.setId`(8번째), `FlowTree.setSteps()`·`setIds()`, `FlowTree.relation` 이 SET 노드 ID 를 받음, `CatchKind.SUBSET_ENDED`, `ReservedNames.CATCH_NAMES` 에 `CATCH_SET`, `FlowParser.catchable` 에 SET. 이름이 다르면 eng:2 머지 뒤 맞춘다. `RuleSetFlowJson`(SET `setId` 읽기·쓰기)은 eng 소유.
  - 계획 본문을 그대로 옮기면 깨지는 세 곳을 고친다: `PathWalk.step()` 에 받는 노드 예약 이름(R13) 처리 되살림, `never()` 분기 순서 SET → TASK → RULE(TASK 캐스트 없앰, 기존 TASK `CATCH_NEVER` 문구 유지), `SetCallIo.asRuleIo` 의 `releasedVer` 는 String.
  - `RuleSetInterface`: 끝내는 IF 갈래(`Branch.ends`)는 합치기에서 빼고 END 지점에 넣는다(편차 8). `endsEarly` 는 편차 10 정의(처리 갈래가 END 로 감 + 처리 갈래 안 IF 갈래가 END 로 감)로 쓴다. `RuleSetPathState.Walk.guarded` 에도 SET 정상 갈래 출력을 더한다.
  - `CALL_MISSING` 수준은 WARN(편차 13). 확정·되살리기에서 거부로 올리는 것은 srv:6.
  - TASK 노드에 `SUBSET_ENDED` 받는 노드: FLOW_CATCH REJECT, `ruleId` null, `nodeId` = 받는 노드, 문구 "받는 노드 {catchId}: 빈 단계 노드에는 하위 세트 예외 끝(SUBSET_ENDED)을 붙일 수 없다". 그 뒤 기존 TASK `CATCH_NEVER` 줄은 그대로 낸다(조정 경유 ui 합의).
  - `MIN_CASES` 는 90 + 계획 사례 9 + 구조 사례 수(Java·TS 같은 값, TS 러너는 그 한 줄만 srv 가 고침).

## 머지 1 — srv:3 단독(조정 지시 srv-2, V23 번호 선점)
- 머지 전: dev 14ec1124 합침, 마지막 마이그레이션 V22 확인(V23 겹침 없음).
- 시험: `heavy.sh ../gradlew :lib:test :api:test --max-workers=2`(src/backend/mdm) → lib 1684건·api 1740건 통과, 실패 0.

## srv:3. DB — `TB_MDM_RULE_SET_VER.CALL_SET_IDS`(V23)
- 커밋: 83dfe81b(구현), 리뷰 지적 수정 커밋(ERD 문서 `docs/mdm/erd/06-business-rule.{sqlite.sql,mmd}`·`verify/expected-columns.json` 에 칸 추가, 시험 띄어쓰기)
- 리뷰: sonnet/high 1회 — 낮음 3건(ERD 문서 미반영·기록 커밋 칸·띄어쓰기) 모두 고침, 그 밖 clean(V18 대조·FK/인덱스 없음·호출부 1곳·운영 방언 폴더 없음 확인)
- 시험 결과: `../gradlew :api:test --max-workers=2 --tests '*MdmBusinessRuleMigrationTest' --tests '*MdmRuleSetVerCallSetIdsMigrationTest' --tests '*MdmSharedContractMigrationTest' --tests '*MdmLocalSample*' --tests '*RuleSetEdit*' --tests '*RuleSetMng*' --tests '*RuleSetVersion*'` → 12 클래스 104건 통과, 실패 0.
- 결정:
  - 새 버전 복사 단언은 `RuleSetVersionOpsSqliteTest.minorCopiesLatestReleasedFlowAndRecordsKindAndOwner` 에 더했다(시드에서 1.000 에 `["S_B"]` 를 넣고 1.001 을 읽는다). 이를 위해 `DmeTestSupport.setVerValue` 의 허용 칼럼에 `CALL_SET_IDS` 를 더했다.
- 계획 조정:
  - 샘플 SQL 의 `SHIP_PLAN`(SET 노드 시연 세트)은 srv:6 으로 미뤘다. 샘플 적재 시험은 흐름을 해석하지 않지만, eng:1 전에 dev 에 `"kind":"SET"` 흐름이 들어가면 로컬 서버가 이 세트를 읽을 때 알 수 없는 노드 종류로 실패할 수 있다(계획 Step 6 의 미룸 조건을 넓혀 적용). 기존 세트 적재 블록은 VER 행 INSERT 가 `CALL_SET_IDS` 를 적지 않아 기본값 `'[]'` 가 들어가므로 이번에는 고치지 않았다(임시 표 칸 추가는 `SHIP_PLAN` 과 함께 srv:6 에서 한다).
  - `RuleSetMngServiceTest` 등록 행 단언은 계획 새 판 Files 에 없어 더하지 않았다. 등록 1.000 DRAFT 의 `'[]'` 는 엔티티 기본값이 지키며, `MdmBusinessRuleMigrationTest` 기본값 시험이 DB 기본값을 확인한다.
