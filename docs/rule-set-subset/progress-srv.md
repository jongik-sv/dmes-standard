# srv 진행 기록

조정 세션: dmes-standard-90. 브랜치 `feat/rule-set-subset-server`, 워크트리 `/Users/jji/project/dmes-standard-wt/rssc-srv`.

## 기준선
- 착수 커밋: dev c12e99a4(plan:0 반영) / 시험: srv:3 대상 묶음은 아래 항목에 적는다.

## 지금 상태·다음 단계
- srv:3 dev 머지 끝(2b638315, 머지 뒤 :api 마이그레이션 시험 15클래스 88건 통과).
- srv:5 구현·코퍼스 끝(b89509f3·80d0a74b, 아래 「srv:5」). ui:5t 가 이 브랜치를 합쳐 TS 초록을 알리면 머지 요청한다(짝 머지).
- srv:6 묶음 A·B·C·D 끝(아래 「srv:6」). ui 에 코퍼스 111건(`MIN_CASES` 111), C 응답 모양(`search CALL_IO/CALLERS`·`view.calls`·`save.checks` WARN 네 코드·폐기 거부 문구), D 응답 모양(`execute` 의 `calls`·`path.callIndex`·`caught.setPath`, 디버거 `calledFlows`)을 알린다. eng:4 뒤 남은 시험: SET 실행·SetShape 일치(묶음 D 절) → 묶음 E1 에서 끝(코퍼스 112건 `MIN_CASES` 112, itemKey `SET:`, 하위 세트 폐기 룰 경고 — ui·eng 에 알릴 것은 E1 결정에 굵게). 묶음 E2(리뷰 낮은 지적 정리) 끝 — ui 에 알릴 것: `search CALLERS` 는 자기 자신을 부르는 행을 뺀다.
- srv:5 리뷰(opus/high 1회) clean, 낮음 3건은 srv:6 으로 넘긴다:
  1. `RuleSetPathState.before` 3인자는 SET always 출력만 defined 로 센다. always=false 출력을 maybe 에 넣는 분석기와 갈린다. srv:6 이 `RuleSetOrderCheck` 에 연결할 때 partial 출력도 받게 넓히고 사례를 더한다(예: SET G(P always=false) → IF [R1 이 P 만듦][R2 가 P 읽음]).
  2. 코퍼스 보강: setId `""` SET 노드 + 받는 노드, PARALLEL 형제 SET 출력 읽기(PAR_SIBLING), SET 이 낀 CYCLE 문구, `RuleSetInterfaceTest` 구조 오류 흐름. 더하면 Java·TS `MIN_CASES` 를 함께 올리고 ui 에 알린다.
  3. 편차 13 의 네 코드 모음 상수와 확정·되살리기 검사 연결(그 전까지 WARN 인 CALL_MISSING 은 확정을 막지 않는다 — srv:5 전보다 나빠진 것은 아니다).
- 메모: dev c12e99a4 의 m-mdm `tests/ui-meta-lock.test.ts` 1건 실패는 기존 실패이고 dev 14ec1124 에서 고쳐졌다. 머지 요청 전에 dev 를 합친다.
- 메모: eng:1 이 `RuleSetRunner` 의 `new Violation(…FLOW_INVALID…)` 에 `List.of()` 인자를 더한다. srv:6 은 그 뒤 모양을 기준으로 고친다.

## srv:6. 서비스·연쇄 재검사 (구현 끝 — eng:4 뒤 SET 실행·SetShape 일치 시험은 묶음 E1, 리뷰 낮은 지적 정리는 묶음 E2 에서 끝)
- 기준선: srv:5 기록의 `:lib:test` 2027건 통과(HEAD 10fb5284 는 그 뒤 문서 커밋뿐이라 다시 돌리지 않았다).
- 조정 세션이 준 판단 ①~⑤(srv6-adapt 메모)를 따른다. 묶음 A → (B ∥ C) → D.

### 묶음 A — 그래프·읽기기·공용 상수 (끝)
- 커밋:
  - 47b40551 `RuleSetCallGraph`(MAX_DEPTH=5, Ruling 10 문구, 늘 REJECT)·`RuleSetCheck.CALL_CODES`·`CALLER_WARN`·`asWarn()`·`asReject()`·`RuleSaveIssueCode.SET_CALLER_BROKEN`, 시험 `RuleSetCallGraphTest` 7건.
  - 77a22ab1 `RuleSetPathState.before` 3인자를 `Function<String, SetOut>`(`SetOut(always, partial)`, `SetOut.of(SetCallIo)`)로 넓힘(srv:5 넘김 1). 분석기는 같은 도우미 `RuleSetPathState.define` 을 쓸 뿐 동작은 그대로. `RuleSetPathStateTest` +4.
  - 31a94a1e `SetCallIoReader`(read·callsOf·of·callers·edges, 모두 `at`)·`Snapshot`·`SetCallerRecheck.recheck(setId, newIo, at)`·`RuleIoReader.draft`, `DmeTestSupport` 흐름 도우미(`ruleNode`·`setNode`·`line`), 시험 `SetCallIoReaderSqliteTest` 12건·`SetCallerRecheckSqliteTest` 6건·`RuleIoReaderTest` +1.
  - ef8c9088 코퍼스 108 → 111건(srv:5 넘김 2)·Java/TS `MIN_CASES` 111·`RuleSetInterfaceTest` 구조 오류 흐름 +1.
- 시험(src/backend/mdm, JDK 21, `--max-workers=2`):
  - `../gradlew :lib:test` → 2045건 통과, 실패 0(2027 + 그래프 7 + 경로 상태 4 + 코퍼스 3사례×2 + 겉모양 1).
  - `../gradlew :api:test --tests '*RuleLedgerChecksTest' --tests '*RuleSetEdit*' --tests '*RuleSetConfirm*' --tests '*SetCallIoReaderSqliteTest' --tests '*SetCallerRecheckSqliteTest' --tests '*RuleIoReaderTest' --tests '*RuleSetVersion*'` → 13클래스 146건 통과, 실패 0.
  - TS 러너는 돌리지 않았다(ui:5t 몫 — 새 사례 3건이 TS 분석기와 같은지 ui 가 확인한다).
- 결정:
  - `SetCallIoReader` 는 시계를 갖지 않고 모든 질의가 `at` 을 받는다. 겉모양 = `at` 에 적용 중인 RELEASED(`currentReleased`) 의 흐름·`readAt(at)` 룰·손주(재귀), 상태 = `effectiveStatus(parent, vers, at)`. DRAFT 만·적용 전·부모 없음 = `SetCallIo.missing`. 흐름이 깨진 버전 = 입출력이 빈 겉모양(exists=true).
  - 부르는 쪽(`callers`·`edges`) = 저장 상태가 DEPRECATED 가 아닌 부모(CREATED 포함)의 `releasedValidFrom(vers, at)` 행 중 CALL_SET_IDS 에 든 것. `callers` 는 `Caller(parent, ver)` 로 세트 ID 순·VER 오름차순. `edges` 는 행들의 합집합, 부르는 것이 없는 세트는 키에서 뺀다.
  - 원장 읽기는 `Snapshot` 하나가 `allSets()` + `versionsOf(전부)` 두 문장으로 하고 룰 타입 해석 범위 하나를 같이 쓴다. 빈 입력의 `read`·SET 없는 `callsOf` 는 원장을 읽지 않는다(C 의 `RuleSetEditQueryCountTest` 가드용).
  - 연쇄 재검사 문구 머리: 부모의 부르는 행이 하나면 `"세트 P: "`, 여럿(지금 + 미래 RELEASED)이면 `"세트 P v1.001: "`. 같은 문구는 한 번. 부모 흐름에 새로 생긴 `CALL_CODES` 는 WARN 이어도 거부(CALLER_BROKEN)로 센다(조정 ②와 같은 기준).
  - 위로 이어 갈 부모 겉모양은 `at` 에 적용 중인 행의 것(조부모의 `read(at)` 이 보는 것), 없으면 첫 행. 바뀐 세트 자신이 자기를 부르는 행은 건너뛴다(순환은 그래프 검사 몫).
  - `RuleSetCheck.asWarn()`·`asReject()` 는 위치(nodeId·edgeId)를 지킨 사본. B 의 확정·C 의 되살리기는 `asReject`, C 의 DRAFT 저장은 `asWarn` 을 쓴다.
  - 코퍼스 새 사례 셋(ui 가 TS 로 맞출 것): ① 세트 ID `""` SET + 받는 노드(SUBSET_ENDED·NO_RESULT) — CALL_MISSING(s1) 뒤 NO_RESULT FLOW_CATCH 만, SUBSET_ENDED 는 판정 없음, 처리 갈래가 END 로 끝나 정상 갈래 룰은 블록 뒤라 ids 가 `[R_H, R_A]`. ② PARALLEL 형제의 SET 출력·룰 결과 서로 읽기 → PAR_SIBLING 둘(SET 쪽 문구 "세트 SP가 병렬 형제 갈래의 R_USE가 만드는 Q를 읽는다…"). ③ SET → 룰 순환 → CYCLE "세트 SP와 R_B가 서로의 결과 변수를 읽는다(순환)…".
- 계획 조정(본문과 다르게 한 것):
  - 본문 `read(Collection)`·`callsOf(flow)`·`of(…)`·`callers(setId): List<MdmRuleSet>`·`inuseEdges()`·`flowOf(MdmRuleSet)` → 모두 `at` 인자, `callers` 는 `List<Caller>`, `inuseEdges` → `edges(at)`(Ruling 25 — INUSE 부모 행이 아니라 폐기 안 한 부모의 `at` 이후 유효한 RELEASED VER 행), `flowOf` 는 두지 않고 `RuleSetVersionQueries.flow(ver)` 를 쓴다. 생성자는 `(RuleQueries, RuleSetVersionQueries, RuleIoReader)`.
  - 본문 `recheck(setId, newIo)` → `recheck(setId, newIo, at)`. 부모 룰은 최신 RELEASED(`read`)가 아니라 `readAt(at)`(스펙 §6.4).
  - 본문 `RuleIoReader.compute` 분리(`fromVars`) 대신 private `collect` 가 행 CELLS 문자열 목록을 받게 하고 `draft(rule, BigDecimal ver, hitPolicy, vars, List<StoredRow>, scope)` 가 `collect` → `compute` 를 부른다.
  - `RuleSetPathState.before` 3인자의 setProduces 형을 `Function<String, Set<String>>` → `Function<String, SetOut>` 로 바꿨다(호출자는 시험뿐이었다).
  - `RuleSetCallerCheck`·`RuleSetCallIoResult`·`RuleSetOrderCheck` 연결은 B·C 로 둔다.

### 묶음 B — 확정 검사 연결 (끝)
- 범위 메모: 되살리기(`restore`)의 `CALL_CODES` 거부·그래프 검사와 폐기 거부는 `RuleSetEditService` 라 C 몫이다. B 는 손대지 않았다.
- 커밋:
  - 8f236d63 `RuleSetConfirmChecks.report` — `SetCallIoReader` 스냅샷 하나로 SET 노드 겉모양(apply_from, 경계 시각은 그 시각)을 분석기 4인자에 넘기고, 항목 1(FLOW_STRUCTURE)에 호출 그래프(`edges(applyFrom)` 의 이 세트 자리를 확정하려는 흐름의 SET 목록으로 덮음)·연쇄 재검사(`SetCallerRecheck`, 새 경고 부모가 있으면 `CALLER_WARN` 한 건)를 더한다. `RuleSetConfirmReport` 는 apply_from 검사의 `CALL_CODES` 를 수준과 상관없이 ERROR 로 올린다(`rejects`). 시험 `RuleSetSubsetConfirmSqliteTest` 5건.
  - ae61e370 `RuleSetCallerCheck`(@Order(9), TABLE·COLUMNS·STORED, `SET_CALLER_BROKEN` — STORED 는 ERROR, TABLE·COLUMNS 는 WARNING), 시험 `RuleSetCallerCheckTest` 5건(열 저장 경고·겉모양 그대로면 없음·룰 확정 보고서 ERROR·부르는 세트 폐기면 없음·적용 지점별 수준). `RuleConfirmQueryCountTest` 상한 36 → 37.
  - e0a2a328 `RuleSetOrderCheck` 에 `SetCallIoReader` 주입, `RuleSetPathState.before` 3인자(`id -> SetOut.of(calls.get(id))`, 기준 시각 `at`). 시험 `RuleLedgerChecksTest` +1(IF 앞 SET 노드가 반드시 만드는 이름은 SET_IF_SIBLING 이 아니다 — 연결을 `SetOut.NONE` 으로 되돌리면 실패하는 것을 확인했다).
- 시험(src/backend/mdm, JDK 21, `--max-workers=2`):
  - `../gradlew :lib:test` → 2045건 통과, 실패 0(lib 시험은 더하지 않았다).
  - `../gradlew :api:test --tests 'com.dongkuk.dmes.mdm.dme.ruleConfirm.*' --tests 'com.dongkuk.dmes.mdm.dme.ruleSetConfirm.*' --tests 'com.dongkuk.dmes.mdm.dme.ruleEdit.*' --tests 'com.dongkuk.dmes.mdm.dme.ruleSetEdit.*' --tests 'com.dongkuk.dmes.mdm.common.rule.*' --tests 'com.dongkuk.dmes.mdm.common.version.*'` → 43클래스 517건 통과, 실패 0. (상한 수정 전 첫 실행은 `RuleConfirmQueryCountTest` 1건 실패 — validate2=37.)
- 필수 시험(확정 쪽): `두_DRAFT_가_순환을_반씩_만들면_먼저_확정은_통과하고_나중_확정이_CALL_CYCLE_로_막힌다`(A·B DRAFT 에 흐름·CALL_SET_IDS 를 직접 넣는다 — C 의 저장 전이라서), `부르는_세트를_깨는_확정은_CALLER_BROKEN_으로_막힌다`(목록 세트 C 가 OUT_X 를 더 내지 않으면 P 의 R_P 가 못 읽음). 저장 쪽 짝(같은 상황이 DRAFT 저장에서는 경고)은 C 몫이다. 룰 쪽은 열 저장 WARNING·룰 확정 ERROR 를 서비스·보고서 경로로 확인했다.
- 결정:
  - 세트 확정 연쇄 재검사는 앞에 확정을 막는 검사(흐름 검사 REJECT·`CALL_CODES`·그래프)가 없고, 이 세트를 부르는 쪽 행이 있고, apply_from 에 적용 중인 겉모양이 있으며(첫 확정이면 하지 않는다), 확정하려는 겉모양과 다를 때만 돈다. FLOW_JSON 이 없는 세트는 `FlowParser.linear(ids)` 로 겉모양을 계산한다. **C 의 DRAFT 저장 경고도 같은 조건으로 맞춘다.**
  - `CALLER_WARN` 은 세트 ID 를 ruleId 로 둔 WARN 한 건, 문구 "부르는 세트에 경고가 생겼다: P1, P2". 확정은 경고 확인(`warningsAcknowledged`)을 요구한다.
  - 경계 시각(멤버 룰 RELEASED 시작) 검사는 그 시각의 하위 세트 겉모양으로 돌리고 지금처럼 모두 WARNING 이다(`CALL_CODES` 승격은 apply_from 검사에만).
  - 룰 쪽 `RuleSetCallerCheck` 는 룰을 담은 세트의 **기준 시각에 적용 중인** RELEASED 버전만 본다(부르는 세트가 `read(at)` 으로 보는 겉모양과 견줘야 버전 차이가 깨짐으로 잡히지 않는다). 부르는 쪽 행이 없으면 저장하려는 정의의 입출력(`RuleIoReader.draft`)을 계산하지 않는다. 문구는 "세트 S 를 부르는 세트 P: …", 같은 문구는 한 번. 새 경고만 생긴 부모는 룰 쪽에서 내지 않는다.
  - 룰 쪽 기준 시각 = `referenceTime`(룰 확정의 apply_from), 없으면 지금(초 단위, `RuleSetOrderCheck` 와 같은 식).
- 계획 조정(본문과 다르게 한 것):
  - 본문 `RuleSetCallerCheck` 의 `MdmRuleSet.getRuleIds()`·`"INUSE"`·`reader.callers(sid)`·`ioReader.read` → 폐기 안 한 부모의 적용 중 VER 행 `members`, `snap.callers(sid, at)`, `readAt(at)`. 본문 시험(`RuleSaveContext` 직접 호출만)에 열 저장·룰 확정 보고서 경로 시험을 더했다. 시험은 C 의 `RuleSetSubsetServiceTest` 와 겹치지 않게 `ruleSetConfirm/RuleSetSubsetConfirmSqliteTest` 로 따로 두었다.
  - `RuleConfirmQueryCountTest` 의 validate 상한을 36 → 37 로 올렸다(새 검사의 세트 목록 1문, 변수 수와 무관 — n 당 증가 6×4 는 그대로).

### 묶음 C — 편집 서비스(저장·폐기·되살리기·조회) (끝)
- 커밋: baf800fd `RuleSetEditService`(생성자에 `SetCallIoReader`·`SetCallerRecheck`, save·delete(SET)·restore·search·view)·DTO(`RuleSetEditSearchRequest` 에 `setId`·`setIdsJson`, `RuleSetViewResult.calls`, 새 `RuleSetCallIoResult`)·`ruleSetEdit.bpmn` documentation 두 줄(target CALL_IO·CALLERS, 폐기 거부 — dto·action 은 그대로). 시험 `dme/ruleSetEdit/RuleSetSubsetServiceTest` 15건.
- 시험(src/backend/mdm, JDK 21, `--max-workers=2`):
  - `../gradlew :api:test --tests '*RuleSetSubsetServiceTest'` → 15건 통과, 실패 0(첫 실행부터 통과). 뒤 커밋에서 `readAt` 결정을 묶는 시험 1건을 더해 16건 통과(`readAt` 을 `read` 로 바꾸면 그 시험만 실패하는 것을 확인하고 되돌렸다).
  - ruleSetEdit 를 부르는 다른 시험 `../gradlew :api:test --tests '*MdmOasisActionVocabularyTest' --tests '*DmeOasisHttpTest' --tests '*RuleSetLifecycleOasisFlowTest'` → 15·18·1건 통과, 실패 0.
  - `../gradlew :lib:test :api:test --tests 'com.dongkuk.dmes.mdm.dme.ruleSetEdit.*' --tests 'com.dongkuk.dmes.mdm.dme.ruleSetMng.*' --tests 'com.dongkuk.dmes.mdm.dme.ruleSetConfirm.*' --tests 'com.dongkuk.dmes.mdm.dme.ruleEdit.*' --tests 'com.dongkuk.dmes.mdm.dme.ruleConfirm.*' --tests 'com.dongkuk.dmes.mdm.common.rule.*' --tests '*DmeBpmnActionTest'` → lib 117클래스 2045건, api 42클래스 445건 통과, 실패 0(`RuleSetEditQueryCountTest` view·execute 상한 그대로 통과).
  - `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` → ERROR 0 / WARN 0(INFO 42 는 기존 baseline).
- 필수 시험(저장 쪽): `두_DRAFT_가_순환을_반씩_만들면_각자_저장은_경고로_통과하고_먼저_확정은_통과하고_나중_확정이_CALL_CYCLE_로_막힌다` — A(→B)·B(→A) 저장은 통과(지금 RELEASED 행만 세어 순환 경고도 없음)·CALL_SET_IDS `["B"]`·`["A"]` → A 확정 통과 → B 다시 저장은 `WARN CALL_CYCLE 세트 호출이 순환한다: B › A › B` 로 저장됨 → B 확정 거부(DRAFT 유지). `부르는_세트를_깨는_저장은_CALLER_BROKEN_경고로_통과하고_확정은_거부한다` — 목록 세트 C 저장은 `WARN CALLER_BROKEN 세트 P: …` 로 저장, 확정 검사는 같은 문구 ERROR·확정 거부. 둘 다 저장 서비스 → 확정 서비스로 이어 본다.
- 결정:
  - DRAFT 저장 순서: 기존 분석기 검사(SET 노드는 지금 기준 겉모양 = 4인자) → `rejectIfAny`(다른 흐름 거부만) → 호출 그래프(`edges(지금)` 에서 이 세트 자리를 흐름의 SET 목록으로 덮음, 목록 저장은 빈 목록)·연쇄 재검사 결과를 `asWarn()` 사본으로 `checks` 에 더함 → CALL_SET_IDS 쓰기. 연쇄 재검사 조건은 B 의 확정 검사와 같다(분석기·그래프에 네 코드가 없음, 부르는 쪽 행 있음, 지금 겉모양 있음, 겉모양 다름). 목록 저장은 `FlowParser.linear(ids)` 로 겉모양을 계산한다. 원장 읽기는 저장 한 번에 `Snapshot` 하나(재검사기는 자기 스냅샷을 따로 연다).
  - 저장하려는 겉모양의 룰 입출력은 `readAt(ids, 지금)` 로 읽는다. 지금 겉모양(`read(at)`)과 같은 기준이라야 미래 RELEASED 룰 버전이 겉모양 차이(헛 CALLER_BROKEN)로 잡히지 않는다. 화면에 돌려주는 분석기 검사의 룰 입출력은 지금처럼 `read`(최신 RELEASED) 그대로 둔다(기존 저장 동작을 바꾸지 않는다). 부르는 쪽 행이 없으면 `readAt` 을 하지 않는다.
  - `CALLER_WARN` 은 B 와 같이 ruleId = 세트 ID(계획 본문은 null), 문구 "부르는 세트에 경고가 생겼다: P1, P2".
  - 폐기 거부: 트랜잭션 안 INUSE·MDM006 검사 뒤, 쓰기 전에 `callers(setId, 지금)`. 한 부모의 여러 행(지금 + 미래 RELEASED)은 한 번만, 세트 ID 순. 자기 자신을 부르는 행은 세지 않는다(같이 폐기된다). DRAFT 행·폐기된 부모는 세지 않는다. 문구는 Ruling 10 그대로 `"사용 중인 세트 M, P가 이 세트를 불러 폐기할 수 없다. 부르는 세트를 먼저 고치거나 폐기한다"`(MDM024, ruleId = 세트 ID — ui 가 `C[-] CALLER_BROKEN 사용 중인 세트 …` 에서 목록을 읽는다). "사용 중인" 은 CREATED 부모도 포함한다(폐기 안 한 부모).
  - 되살리기: 표시 버전(지금 적용 중 RELEASED, 없으면 VER 최대)의 흐름을 분석기 4인자 + 호출 그래프(지금)로 보고, 거부와 네 코드를 `asReject()` 로 모아 MDM024 로 던진다. 연쇄 재검사는 하지 않는다(spec §6.3). 돌려주는 경고에는 네 코드가 남지 않는다(있으면 거부라서).
  - `search CALL_IO`: `setIdsJson` 을 `RuleCaseJudge.array` 로 읽고(배열이 아니면 INVALID_VALUE, 비면 빈 결과) `read(ids, 지금)` — 요청 순서·중복/빈 ID 제외·지금 RELEASED 없으면 `exists=false`. `search CALLERS`: `callers(setId, 지금)` 를 부모당 한 번·세트 ID 순으로, 상태는 `searchSets` 와 같은 계산 상태(`effectiveStatus`, 부모 버전 1문 더 읽음 — 부르는 세트가 있을 때만).
  - `view.calls`: 흐름이 있으면 `callsOf(flow, 지금)`(SET 노드 없으면 원장을 읽지 않는다), 목록 세트는 빈 맵. 검사도 같은 겉모양으로 4인자.
- 계획 조정(본문과 다르게 한 것):
  - 본문 save 는 네 코드를 거부(`rejectIfAny` 에 그래프·연쇄 포함)했으나 U2·조정 ④로 경고 사본이다. 본문 `writes.update` 7인자·`rv + 1`·`writeMissed(setId, rv, INUSE)` 는 D-144 뒤 모양(`writeGuard.beginDraftWrite` + `updateDraft` 5인자)을 그대로 쓴다. 본문 `callIoReader.read(ids)`·`callers(setId): List<MdmRuleSet>`·`inuseEdges()` → `at` 인자·`Caller`·`edges(at)`.
  - 본문 시험 본문은 옮기지 않았다: 저장 거부 단언(CALL_MISSING·CALL_CYCLE·CALLER_BROKEN)은 경고 단언으로, 부모 표의 `ROW_VERSION`·`CALL_SET_IDS` 는 VER 행(`setVerValue`)으로, 폐기 요청은 `RuleSetStatusRequest` 가 아니라 `RuleSetVersionRequest(target SET)` 로 바꿨다. 연쇄로 조부모까지·부모에 원래 있던 거부는 A 의 `SetCallerRecheckSqliteTest` 가 이미 보므로 서비스 시험에서는 빼고, 폐기 통과(부르는 세트 폐기)·되살리기 통과·CALL_MISSING 되살리기 거부·DRAFT 만 있는 세트 CALL_IO·DRAFT 행은 부르는 쪽이 아님을 더했다.
  - 본문 `simulate` calledFlows 는 D 몫으로 남겼다.
- 절차: `RuleSetViewResult` 칸 추가 한 번을 지시와 달리 python heredoc 으로 고쳤다(그 밖은 Edit·Write). 결과는 diff 로 확인했다.

### 묶음 D — 실행 응답 매핑(조정 ⑤) (끝)
- 커밋:
  - c442a805 `RuleSetRunner.execute` — 매핑을 `result(RuleSetResult)` 로 떼어 경로 맵 `callIndex`, 응답 `calls`(`{nodeId, setId, endedBy}`), `caught` 맵 끝 `setPath` 를 싣는다. 엔진 경고는 `engineWarnings` 가 세트 경고 → 룰 경고 → `calls` 순서로 하위 결과를 재귀해 모은다. 위반 문구는 `violationText(pathText(…), v, userText(v))` — `setPath` 가 있으면 `"세트 {최상위} › {label 또는 세트 ID}({노드 ID}) › "` 를 앞에 붙인다. `RuleErrorText.withSetPath`, `SET_CALL_CYCLE`·`SET_CALL_DEPTH` 문구. `RuleSetRunResult.calls`. 시험 `RuleSetRunnerMappingTest`(lib, 엔진 결과 객체를 손으로 만든 6건)·`RuleErrorTextTest` +2·`RuleSetRunnerSetPathSqliteTest`(api 2건)·`RuleSetRunnerTest` caught 키 목록에 `setPath`.
  - 38d1e7cc 새 `RuleSetCalledFlows`(스프링 빈)·`RuleSetSimulateResult.calledFlows`·`RuleSetEditService.simulate` 연결. 시험 `RuleSetCalledFlowsSqliteTest` 3건(손으로 만든 기록 — 중첩 sub·중복·판정 시각에 적용 전인 세트·한 줄 세트, SET 없는 디버거 실행은 빈 맵).
- 시험(src/backend/mdm, JDK 21, `--max-workers=2`):
  - 묶음 시험: `../gradlew :lib:test --tests '*RuleSetRunnerMappingTest' --tests '*RuleErrorTextTest'` → 6·17건 통과. `../gradlew :api:test --tests '*RuleSetCalledFlowsSqliteTest' --tests '*RuleSetRunnerSetPathSqliteTest' --tests '*RuleSetRunnerTest' --tests '*RuleSetEditQueryCountTest' --tests '*RuleSetRunnerOasisTest'` → 3·2·22·3·4건 통과, 실패 0(`RuleSetEditQueryCountTest` execute 상한 그대로).
  - 전체(마지막 묶음): `../gradlew :lib:test :api:test --continue` → lib 118클래스 2053건(2045 + 매핑 6 + 문구 2), api 185클래스 1791건 통과, 실패·오류·건너뜀 0(BUILD SUCCESSFUL, 결과 파일 모두 이번 실행 것).
  - `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` → ERROR 0 / WARN 0(INFO 42 는 기존 baseline). BPMN·action·dto 이름은 바꾸지 않았다(응답 칸만 늘었다).
- 결정:
  - `calls` 는 이 세트의 SET 노드만 싣는다(손주는 `calls` 에 없고 엔진 하위 결과 안에 있다). `endedBy` 가 null 이어도 키를 둔다. 하위 세트의 `endedBy` 는 `calls[i].endedBy` 에만 있고 최상위 `endedBy` 와 섞지 않는다(spec §4.3). `caught` 의 `setPath` 는 엔진 값 사본, 이 세트에서 받았으면 빈 목록.
  - 위반 문구 경로는 위반 시점에 결과가 없으므로 `execute` 가 판정 시각을 먼저 정하고(`ts(...)`, 전과 같은 값) 단계마다 그 시각에 적용된 세트 버전의 흐름(`RuleVersions.currentReleased` + `RuleSetVersionQueries.flow`)에서 노드를 찾는다. label 이 비면(공백 포함) 세트 ID. 흐름·노드를 못 찾거나 저장값을 읽지 못하면 그 단계부터 노드 ID 만 쓰고 던지지 않는다(문구 만들기가 원래 위반을 가리지 않게). 위반 하나에 단계마다 버전 목록 1문 — 실패 경로라 캐시하지 않았다.
  - 폐기 룰 경고(`RULE_DEPRECATED`)는 지금처럼 최상위 세트의 룰만 본다(하위 세트 룰까지 넓힐지는 본문·스펙에 없다 — 넓히려면 조정 세션 결정). 엔진 경고만 하위까지 모은다.
  - `SET_CALL_CYCLE`·`SET_CALL_DEPTH` 사용자 문구는 엔진 원문을 괄호 안에 그대로 둔다(원문 모양은 eng:4 가 정한다). 하위 세트 폐기·없음 코드(`SET_NOT_FOUND`·`SET_DEPRECATED`)는 기존 문구 그대로.
  - `calledFlows` 는 버전 행을 직접 읽는다 — 엔진 정의(`RuleSetDefinition.flow`)는 화면 `view` 를 버리고 스펙 §8 은 "view 포함" 이라서 `Session.ruleSet` 노출 대신 `versionsOf`·`findAllById` 각 1문 + 모든 세트 룰의 `readAt` 한 번. `rules` 는 판정 시각에 적용된 룰 버전(`readAt`, 실행한 버전과 맞는 노드 제목) — `view` 의 `rules` 는 최신 RELEASED(`read`)라 다르다. 부른 세트가 없으면 읽지 않는다. 판정 시각에 RELEASED 가 없는 세트는 뺀다. FLOW_JSON 을 읽지 못한 버전은 `flow=null`·읽을 수 있는 `ruleIds`.
  - `calledFlows` 는 단건 실행만 채운다. 케이스 일괄 실행(`runCases`)은 빈 맵이다.
- 계획 조정(본문과 다르게 한 것):
  - 본문 `pathText` 의 `sets.findById(cur).getFlowJson()`(부모 행) → 판정 시각 버전 행의 흐름. 본문 `calledFlows` 의 `setRepository.findById(id)` 의 `getFlowJson()`·`getRuleIds()` → 판정 시각 버전 행, `ioReader.read` → `readAt`. 서비스 안 private 도우미 대신 따로 빈 `RuleSetCalledFlows` 로 두어 손으로 만든 기록으로 시험한다(`RuleSetEditService` 생성자에 한 인자 — 직접 new 하는 곳 없음).
  - 본문 `StoredDefinitionLookup` 세트 캐시는 D-144 2단계가 이미 (세트, 판정 시각) 캐시를 두어 고칠 것이 없다.
  - 본문 시험 `RuleSetRunnerSubsetTest`·`SetCallIoEngineAgreementTest` 는 만들지 않았다(조정 ⑤). 대신 매핑 단위 시험(위 커밋).
- **eng:4 뒤 남은 시험: SET 실행·SetShape 일치** — `RuleSetRunnerSubsetTest`(SET 이 든 세트를 엔진으로 실행해 `calls`·`path.callIndex`·하위 위반 문구 `"세트 RS_PARENT › 품질 판정(s1) › [QLTY_GRD_JDG] "` 확인), `SetCallIoEngineAgreementTest`(서버 `SetCallIo` 입출력 = 엔진 `SetShape`, 입력에서 `CATCH_*` 제외 — srv:5 결정), 디버거 `calledFlows` 를 실제 실행 기록으로 확인. 하위 세트 폐기·없음 위반 코드가 eng:4 에서 새로 생기면 `RuleErrorText` 케이스도 그때.
- ui 에 알릴 응답 모양(ui:8·ui:9):
  - `execute`(ruleSetRunner) 응답: `path[].callIndex`(SET 만 정수), `calls[{nodeId, setId, endedBy}]`, `caught[].setPath`(바깥부터 SET 노드 ID, 이 세트면 `[]`). 오류 문구 머리 `"세트 A › 단가 결정(s1) › "`.
  - `ruleSetEdit` action `execute`(디버거) 응답: `calledFlows: {[setId]: {setId, setName, flow: object|null, ruleIds: string[], rules: RuleIo[]}}`(부른 세트가 없으면 `{}`).

### 묶음 E1 — eng:4 뒤 SET 실행·SetShape 일치·코퍼스 보강·D 리뷰·조정 기본안 (끝)
- 커밋:
  - 0d239dfe `RuleSetCallGraph.MAX_DEPTH = SetShape.MAX_CALL_DEPTH`(엔진 공개 상수 참조). 새 `SetCallIoEngineAgreementTest`(api 7건)·시험 도우미 `kr.dongkuk.maru.mdm.engine.rule.SetShapeProbe`(api 테스트 소스, `FlowKeysProbe` 와 같은 방식 — 엔진 main 은 안 바꿈). `RuleSetPathStateTest` +1(룰 받는 노드 처리 갈래에서 `CATCH_SET`·`CATCH_RULE` 읽기는 분석기 검사가 없다)·룰 처리 갈래 상태에 다섯 이름 단언.
  - fa3bb129 `RuleSetRunner` — (e) 폐기 룰 경고를 하위 세트까지, (d) 문구 만들기 예외 가림 방지. 새 `RuleSetRunnerSubsetTest`(api 8건), `RuleSetRunnerMappingTest` +1, 지난 `SEAM T4` 주석 넷 고침.
  - aeeb3c94 `RuleSetConfirmReport.itemKey` — `CALLER_WARN`·`CALLER_BROKEN` 은 `SET:<ruleId>`(노드·선보다 먼저). `RuleSetConfirmReportTest` +1.
  - 6afd6ed2 코퍼스 111 → 112건, Java `RuleSetCorpusTest.MIN_CASES`·TS `rule-set-corpus.test.ts` `MIN_CASES` 112.
- 시험(src/backend/mdm, JDK 21, `--max-workers=2`):
  - 묶음 시험: `../gradlew :api:test --tests '*SetCallIoEngineAgreementTest'` → 7건 통과(첫 실행 2건 실패 — 대조 하한 300 이 실제 269 보다 컸고, R_DRV 읽는 이름 순서가 달랐다 → 아래 결정 ③으로 단언을 고침). `--tests '*RuleSetRunnerSubsetTest'` → 8건 통과(첫 실행 2건 실패 — `OPT > 0` 은 null 비교가 NULL 이 아니라 평가 오류라 조건을 `OPT` 로, 부모가 SET 노드에서 받은 위반의 `setPath` 는 엔진 계약대로 `[]` 라 하위 세트가 스스로 받는 사례를 더함).
  - 코퍼스 대조가 헛돌지 않는지: 엔진 쪽 SET 겉모양을 빈 맵으로 바꾸면 14건 어긋남으로 실패하는 것을 확인하고 되돌렸다.
  - 마지막: `../gradlew :lib:test :api:test --tests 'com.dongkuk.dmes.mdm.common.rule.*' --tests 'com.dongkuk.dmes.mdm.dme.ruleSetEdit.*' --tests 'com.dongkuk.dmes.mdm.dme.ruleSetConfirm.*' --tests '*RuleLedgerChecksTest' --continue` → lib 118클래스 2058건(2053 + 매핑 1 + 보고서 1 + 경로 상태 1 + 코퍼스 1사례×2), api 30클래스 289건 통과, 실패·오류·건너뜀 0.
  - TS 러너는 돌리지 않았다(새 사례 1건이 TS 분석기와 같은지는 ui 가 확인한다).
- 결정:
  - **SetShape 일치(조정 항목 1·2)**: 코퍼스·퍼즈의 구조가 올바른 흐름 269건(SET 노드 든 것 15건 이상)에서, 룰 입출력과 같은 이름을 읽고 만드는 합성 엔진 정의로 만든 `SetShape` 의 inputs(순서 포함)·outputs(순서 포함)·always 가 서버 `RuleSetInterface.of` 와 모두 같았다(REJECT 흐름 포함). 엔진 재료는 엔진 준비와 같게 — 있고 RELEASED 가 있는 룰만, SET 노드는 있고 폐기 아닌 하위 세트만 노드 ID 로. 저장 세트(한 줄 세트·손주 + 끝내는 IF 갈래)는 `StoredDefinitionLookup` 로 엔진 겉모양을 직접 만들어 서버 `SetCallIoReader.read` 와 견주고, 실행 기록의 SET 노드 `outputs` 키와도 견준다.
  - **endsEarly**: 엔진 `SetShape` 에는 없는 칸이다. 실제 실행의 `calls[].endedBy` 로 견준다 — 처리 갈래가 END 로 끝내는 하위 세트는 서버 endsEarly=true·실행 `endedBy="c1"`, 처리 갈래 밖 끝내는 IF 갈래만 있는 하위 세트·한 줄 세트는 endsEarly=false·`endedBy=null`. 처리 갈래 안 IF 의 한 갈래가 END·나머지는 정상 경로로 돌아오는 하위 세트(N11 의 RULE 판)는 서버 endsEarly=true, 실행은 END 갈래면 `endedBy="c1"`(엔진이 받는 노드 끝냄으로 바꾼다)·돌아오는 갈래면 null — 어긋남 없음.
  - **편차 11(조정 항목 3) — 엔진은 CATCH_* 를 빼지 않는다**: 엔진 `SetShape.inputs` 는 `FlowKeys.needed` 그대로라 처리 갈래 룰이 읽는 `CATCH_*` 가 남는다. 서버는 겉모양 inputs 에서 뺀다(빼지 않으면 부모 분석기가 SET 노드에 헛 R13 ORDER 를 낸다). 엔진 inputs 는 부모 겉모양 계산에만 쓰이고 입력 키 사전 검사(mustInputs)는 처리 갈래 안을 보지 않아 판정은 같다. 서버를 엔진에 맞추지 않고 시험으로 두 사실을 묶었다. **eng 에 알릴 것**(엔진도 빼면 두 벌이 완전히 같아진다 — 엔진 몫).
  - **이름 출처(조정 항목 3)**: 만드는 이름(`resultNames` ↔ results)은 같다. 읽는 이름은 이름 조건 열에서 같고 세 곳이 어긋난다 — ① DECISION 의 Expression 결과 셀이 읽는 이름: 서버 conds 에는 있고(`D_LOW`) 엔진 `needed` 에는 없다(DERIVE 만 행 required·optional 을 더한다) — 엔진 사전 검사가 그 키를 요구하지 않을 뿐 판정 때 식이 읽는다. 서버가 더 정확해 서버는 그대로 둔다. **eng 에 알릴 것**. ② 식에 쓴 표기: 엔진 대문자(`InputContracts.usedVariables`), 서버 처음 표기(`d_low`) — 대소문자 무시로 같다. ③ DERIVE 식 이름 순서: 엔진 행마다 required → optional(`D_REQ, D_OPT`), 서버 AST 첫 등장 순(`D_OPT, D_REQ`) — 겉모양 inputs 순서만 갈릴 수 있다. 서버 `RuleIo` 출처 표시(DICT·PROG·NONE)는 엔진에 없는 화면용 칸이라 견주지 않는다.
  - **CATCH_SET(조정 항목 4)**: 서버 분석기·`RuleSetPathState` 는 RULE·TASK·SET 받는 노드 모두 처리 갈래 상태에 `ReservedNames.CATCH_NAMES`(다섯, `CATCH_SET` 포함)를 정의로 넣는다 — 시험으로 묶었다. 코퍼스 사례로는 두지 않았다(TS 짝 합의 밖).
  - **코퍼스(조정 c)**: ② "하위 세트 — 없는 룰·RELEASED 없는 룰의 노드에 SUBSET_ENDED 를 받아도 FLOW_CATCH 는 나온다(룰 존재 검사의 조기 return 앞)" 한 건을 더했다 — 기대: `RULE_NOT_FOUND`(r1) → `NO_RELEASED`(r2) → `FLOW_CATCH`(c1) → `FLOW_CATCH`(c2), `CATCH_NEVER` 없음. ①(폐기 세트를 부를 때 CALL_MISSING)은 기존 사례 "하위 세트 — 세트 ID 없음·없는 세트·폐기 세트는 CALL_MISSING 경고, 같은 세트는 첫 노드에만"(`OLD는 폐기된 세트다`, s3)에 있어 더하지 않았다. **새 `MIN_CASES` = 112 — ui 에 알린다.**
  - **(d) D 리뷰**: `flowAt` 은 `RuntimeException` 전부를 null 로, `pathText` 는 흐름 조회가 던지면 그 단계부터 노드 ID 만(경고 로그 한 줄), `userText` 의 세트 원장 조회(`SET_NOT_FOUND` 문구 가르기)가 던지면 엔진 원문 문구 쪽(세트 있음)으로 본다. 원래 판정 위반 문구가 늘 응답으로 나간다.
  - **(e) 조정 기본안(답이 다르면 고친다)**: ① `RULE_DEPRECATED` 는 최상위 세트 룰 다음에 엔진 결과 `calls` 를 깊이 우선(손주 포함)으로 따라 각 하위 세트의 판정 시각 RELEASED 버전 룰을 더해 룰마다 한 번 낸다. 세트 버전 목록은 세트마다 한 번 읽고 룰 헤더는 한 번에 읽는다. `calls` 는 실제로 실행한 SET 노드뿐이라, 타지 않은 IF 갈래의 하위 세트 룰은 경고하지 않는다(최상위 룰은 탄 갈래와 무관하게 경고 — 비대칭, 조정 답에서 정할 것). 디버거(`simulate`)의 폐기 룰 경고는 지금처럼 최상위 흐름의 룰만 본다(엔진 경고도 최상위만 모은다 — 넓히려면 `calledFlows` 의 `ruleIds` 를 쓰면 된다, 조정 결정 대기). ② `RuleSetConfirmReport.itemKey` 는 `CALLER_WARN`·`CALLER_BROKEN` 이면 `SET:<ruleId>`(CALLER_WARN = 이 세트, CALLER_BROKEN = 부르는 부모 세트) — **ui 에 알린다**(화면이 RULE: 로 짚던 두 코드가 SET: 으로 바뀐다).
  - 실행 응답 확인(끝에서 끝): 부모가 SET 노드의 받는 노드로 하위 세트 위반을 받으면 `caught[].ruleNodeId = SET 노드`·`setPath = []`(이 세트에서 받음), 하위 세트가 스스로 받으면 부모 `caught` 에 `ruleNodeId = 하위 룰 노드`·`setPath = ["s1"]` 로 올라오고 부모 `endedBy` 는 null·`calls[0].endedBy = "c1"`. 손주 위반 문구 `"세트 RS_TOP › 가운데 호출(s1) › RS_LINE(s2) › [QLTY_GRD_JDG] "`. 하위 세트 IF 조건 NULL 의 `BRANCH_COND_NULL` 이 부모 응답 경고에 모인다.
- 계획 조정(본문과 다르게 한 것):
  - 본문 `SetCallIoEngineAgreementTest` 의 `reader.read(List.of(…))`·`runner.trace(parent, …)` 한 건 → `read(ids, at)`, 코퍼스 전수 대조·저장 세트 엔진 겉모양·endsEarly 실행·이름 출처·`CATCH_*` 편차 시험을 더했다. 엔진 겉모양 접근은 시험 도우미(엔진 패키지)로.
  - 본문 `RuleSetRunnerSubsetTest` 의 `ruleSet(…, "INUSE", 0)`·`ruleSetFlow`·`ruleSetCalls` 그대로, `assertThrows` 대신 AssertJ. 본문 두 건에 손주 경로·caught setPath 두 갈래·하위 세트 경고·하위 세트 폐기 룰 경고·simulate calledFlows(실제 기록)를 더했다.

### 묶음 E2 — 앞 묶음 리뷰의 낮은 지적 정리 (끝)
- 커밋:
  - 9a983b0c `SetCallIoReader` — 순환·깊이 방어가 아래에서 걸린 세트의 겉모양은 memo 에 넣지 않는다(`Computed(io, cut)`). `callIds` 는 깨진 CALL_SET_IDS(JSON 배열 아님)를 빈 목록으로, 배열 안 null·빈 값은 뺀다(javadoc 에 정책). `Snapshot.sets()`·`versions(setId)` 접근자. 시험 `SetCallIoReaderSqliteTest` +3(깊이 방어 memo·다이아몬드 한 번 계산·깨진 CALL_SET_IDS).
  - 299e666d `SetCallerRecheck` — 미래 RELEASED 만 있는 부모는 위로 잇지 않음, 다이아몬드 순서, `shapeChanged`(입출력 또는 endsEarly), `recheck(Snapshot, …)` 오버로드. `RuleSetConfirmChecks`·`RuleSetEditService.callWarnings`·`RuleSetCallerCheck` 가 자기 스냅샷을 넘기고 진입 조건을 `shapeChanged` 로. `RuleSetCallerCheck` 는 원장을 스냅샷 하나로만 읽는다(생성자에서 `RuleQueries`·`RuleSetVersionQueries` 뺌). 시험 `SetCallerRecheckSqliteTest` +3·`RuleSetSubsetServiceTest` +1(endsEarly 만 바뀐 DRAFT 저장의 CALLER_WARN).
  - 38f1c01c `RuleSetEditService` — `search CALLERS` 자기 행 제외, `RuleSetVersionQueries.mayBeCalled` 로 SET 노드 없는 저장·폐기의 원장 전체 읽기 건너뜀. 시험 `RuleSetEditQueryCountTest` save 상한 13, `SetCallIoReaderSqliteTest` +1(`mayBeCalled`), `RuleSetSubsetServiceTest` CALLERS 자기 행 단언.
  - cefd3d8a 시험 보강 — `RuleSetCallerCheckTest` +1(`RuleConfirmService.confirm` MDM010·v2 DRAFT 유지, 보고서 ERROR 는 SET_CALLER_BROKEN 뿐), `RuleLedgerChecksTest` +1(always=false 하위 세트 출력은 maybe — SET_IF_SIBLING 아님), `DmeOasisHttpTest` +1(search CALL_IO·CALLERS).
- 시험(src/backend/mdm, JDK 21, `--max-workers=2`):
  - 묶음 시험마다 고친 클래스를 돌렸다. 새 시험이 헛돌지 않는지 변이로 확인하고 되돌렸다: memo 를 늘 넣으면 깊이 방어 memo 시험 1건 실패, `orElse(null)` → 첫 행·준비 조건 없앰·`shapeChanged` 에서 endsEarly 뺌을 한꺼번에 넣으면 새 시험 4건 모두 실패, `SetOut.of` 가 partial 을 버리면 새 형제 읽기 시험 실패.
  - save SQL 문 수: 13. 걸러내기 결과를 무시하고 원장을 읽게 바꿔 같은 시험으로 재면 15(`mayBeCalled` 1문 포함) — 걸러내기가 없던 때로 치면 14다. `RuleConfirmQueryCountTest` validate2 = 37 그대로(상한 37).
  - 마지막: `../gradlew :lib:test :api:test --tests 'com.dongkuk.dmes.mdm.common.rule.*' --tests 'com.dongkuk.dmes.mdm.dme.ruleSetEdit.*' --tests 'com.dongkuk.dmes.mdm.dme.ruleSetConfirm.*' --tests 'com.dongkuk.dmes.mdm.dme.ruleEdit.*' --tests 'com.dongkuk.dmes.mdm.dme.ruleConfirm.*' --tests '*DmeOasisHttpTest' --continue` → lib 118클래스 2058건, api 45클래스 475건 통과, 실패·오류·건너뜀 0(BUILD SUCCESSFUL, 쿼리 수 시험 `RuleSetEditQueryCountTest`·`RuleConfirmQueryCountTest` 포함).
  - 전체(생성자·폐기·search 가 바뀌어 넓혀 돌림): `../gradlew :lib:test :api:test --continue` → lib 118클래스 2058건, api 187클래스 1818건 통과, 실패·오류·건너뜀 0(BUILD SUCCESSFUL, 결과 파일 모두 이번 실행 것).
- 결정:
  - **위로 잇기(A 결정 바꿈)**: 부모의 행 가운데 기준 시각에 적용 중인 행이 없으면(미래 RELEASED 만) 그 부모 행들은 검사하되 위로 잇지 않는다 — 조부모의 `read(at)` 에서 그 부모는 없는 세트라 겉모양이 바뀌지 않는다. A 의 "없으면 첫 행" 은 조부모에 헛 깨짐을 냈다.
  - **endsEarly**: `SetCallerRecheck.shapeChanged(before, after)` = `!sameShape || endsEarly 다름`(`sameShape` 는 그대로). 분석기는 SET 노드의 SUBSET_ENDED 받는 노드를 endsEarly 로 판정(CATCH_NEVER)하므로 확정 검사·DRAFT 저장 경고·룰 저장 검사의 진입 조건과 위로 잇기 네 곳 모두 이것을 쓴다(위로 잇기만 바꾸면 첫 단계에서 재검사가 아예 돌지 않는다). endsEarly 는 흐름 구조로만 정해져 하위 세트가 바뀌어도 부모의 endsEarly 는 그대로라, 실제로 차이가 나는 곳은 진입 조건이다.
  - **다이아몬드(고침, 한계 아님)**: 바뀐 세트에서 위로 `MAX_DEPTH` 단계까지 부르는 세트(자기를 부르는 행 제외)를 먼저 모으고, 아래에서 모은 세트를 모두 끝낸 부모부터(같이 준비되면 찾은 순서 = 단계, 그 안에서 세트 ID 순) 한 번씩 검사한다. 부모의 행 가운데 지금까지 바뀐 세트를 부르는 행만 검사하고(문구 머리의 행 수도 이 행들로 센다) 그런 행이 없으면 건너뛴다. 저장된 순환으로 준비된 부모가 없으면 찾은 순서의 첫 부모부터 한다(순환은 그래프 검사가 막는다). 기존 시험의 문구 순서(P, G / M, P, P, G)는 그대로다.
  - **CALL_SET_IDS 깨짐**: FLOW_JSON 과 같은 정책 — 그 행은 아무 세트도 부르지 않는다(던지지 않음). SQLite 는 `json_valid` CHECK 가 있어 시험은 배열 아닌 JSON(`{}`)과 엔티티 직접 값으로 했다.
  - **memo**: 방어(순환·깊이)가 걸린 결과와 그 위쪽 세트들은 부른 자리마다 달라 memo 에 넣지 않는다. 방어가 없는 세트는 한 read 안에서 한 번만 계산한다(다이아몬드 시험이 `readAt` 호출 수로 확인).
  - **원장 읽기**: `recheck(Snapshot, setId, newIo, at)` 오버로드 — 세트 확정 검사·DRAFT 저장·`RuleSetCallerCheck` 가 자기 스냅샷을 넘긴다(C 의 "재검사기는 자기 스냅샷을 따로 연다" 를 바꿈). `RuleSetCallerCheck` 는 세트 목록·버전도 스냅샷에서 읽어 원장을 두 문장으로 한 번만 읽는다.
  - **save·폐기 원장 읽기**: `RuleSetVersionQueries.mayBeCalled(setId)` — RELEASED 행 CALL_SET_IDS 에 `"세트 ID"` 가 든 행이 있는지 한 문장(1행)으로 본다. LIKE 의 `_` 거짓 양성은 원장 읽기가 정확히 가린다. 흐름에 SET 노드가 없고 불릴 수 없으면 DRAFT 저장의 호출 검사를 건너뛴다 — 그래프에 이 세트를 지나는 선이 없고 연쇄 재검사할 부모도 없어 결과가 같다. 폐기 거부도 불릴 수 없으면 원장을 읽지 않는다.
  - **search CALLERS**: 폐기 거부와 같게 자기 자신을 부르는 행을 뺀다. **ui 에 알린다.**
  - **한계(룰 쪽)**: `RuleSetCallerCheck` 는 룰을 담은 세트 S 의 기준 시각에 적용 중인 버전만 보고 S 의 미래 RELEASED 는 보지 않는다 — 그 버전이 적용될 때 부르는 세트가 깨지는지는 룰 저장·확정에서 잡지 않는다.
- 계획 조정(지시와 다르게 한 것):
  - 다이아몬드는 한계로 남기지 않고 고쳤다(위 결정).
  - `RuleSetEditService.callWarnings` 도 진입 조건을 `shapeChanged` 로, 재검사에 자기 스냅샷을 넘기게 바꿨다(지시는 `RuleSetCallerCheck`·`RuleSetConfirmChecks` 만 적었다 — 같은 계산이라 맞췄다).
  - 다이아몬드 한 번 계산 시험은 새 스프링 문맥을 만들지 않게 `@MockitoSpyBean` 대신 `Mockito.spy(ioReader)` 로 만든 `SetCallIoReader` 를 썼다.

## srv:5. 서버 분석기·코퍼스 (구현 끝 — ui:5t 짝 머지 대기)
- 커밋: b89509f3(분석기 `SetCallIo`·`RuleSetInterface`·`RuleSetAnalyzer`·`RuleSetPathState`·`RuleSetCheck` 상수 넷, 시험 `RuleSetInterfaceTest`·`RuleSetPathStateTest` 3건), 80d0a74b(코퍼스 18건·`RuleSetCorpusTest` calls 읽기·단계 순서 단언, TS `MIN_CASES` 한 줄).
- 시험(src/backend/mdm, JDK 21):
  - 기준선 `../gradlew :lib:test --max-workers=2` → 1689건 통과, 실패 0(dev 8192debe 합친 e4bedd0d).
  - 구현 뒤 같은 명령 → 2027건 통과, 실패 0(코퍼스 러너 +326 = 새 사례 18·순서 단언 308, `RuleSetInterfaceTest` 9, `RuleSetPathStateTest` +3).
  - 코퍼스 둘째 소비자 `../gradlew :api:test --max-workers=2 --tests '*RuleLedgerChecksTest' --tests '*RuleSetEdit*' --tests '*RuleSetConfirm*'` → 6클래스 96건 통과, 실패 0.
  - TS 러너는 돌리지 않았다(ui:5t 전까지 calls 를 못 읽어 새 사례가 실패하는 것이 정상).
- 결정:
  - 코퍼스 사례 수 90 → 108(계획 9 + 구조 9). Java `RuleSetCorpusTest.MIN_CASES`·TS `rule-set-corpus.test.ts` `MIN_CASES` 모두 108.
  - 구조 사례 9건: SET 이 모이는 자리(새 형식 IF 두 갈래 → SET)·SET 이 돌아오는 자리(룰 처리 갈래 → SET)·d1(SET 들어오는 선 0개, N17 판 — SET 은 들어오는 선 "1개 이상" 규칙이라 2개는 1단계 오류가 아니다)·SET 받는 노드 처리 갈래 돌아옴(정상 경로 중간, 처리 갈래 안에서 `CATCH_SET` 읽기 통과)·끝냄(SUBSET_ENDED, endsEarly=true)·처리 갈래 안 IF 한 갈래 END(N11 판)·끝내는 IF 갈래 안 SET(출력이 IF 뒤에 없어 UNKNOWN_INPUT, N19 판)·h2 문구(받는 노드를 START 에 — 엔진 `FlowParser` 문구 그대로)·TASK 에 SUBSET_ENDED.
  - TASK 받는 노드 순서(ui:5t 가 같게 한다): 처리 갈래마다 SUBSET_ENDED 를 받으면 `FLOW_CATCH` REJECT "받는 노드 {c}: 빈 단계 노드에는 하위 세트 예외 끝(SUBSET_ENDED)을 붙일 수 없다"(ruleId null, nodeId=c)를 먼저 모두 낸 뒤, 기존 `CATCH_NEVER` 를 처리 갈래마다 낸다. RULE 도 같은 두 단계이고, SUBSET_ENDED `FLOW_CATCH` 는 룰 존재·RELEASED 검사(조기 return) 앞에서 낸다. SET 은 처리 갈래 → 받는 종류 저장 순서로 NO_RESULT `FLOW_CATCH`, SUBSET_ENDED+exists+!endsEarly `CATCH_NEVER`(ruleId=setId). `never()` 분기 순서 SET → TASK → RULE.
  - `RuleSetInterface.of` 의 입력에서 예약 이름 `CATCH_*`(대소문자 무시)를 뺀다 — 하위 세트 입력은 부모 ctx 에서 `CATCH_*` 를 뺀 사본이다(편차 11). 하위 세트 처리 갈래 안 룰이 `CATCH_*` 를 읽으면 그 세트의 io 입력에 나오므로, 빼지 않으면 부모 분석기가 SET 노드에 R13 ORDER 를 잘못 낸다. 엔진 `SetShape`(eng:4) 입력도 같게 해야 한다 — srv:6 `SetCallIoEngineAgreementTest` 에서 확인.
  - `SetCallIo.asRuleIo` 의 releasedVer 는 문자열 표시 `"1.000"`(상수 `RELEASED_MARK`, 분석기는 null 여부만 본다). TS `callRuleIo` 는 같은 값(문자열)을 쓰면 된다.
  - 단계 모으기는 `RuleSetAnalyzer.callSteps(FlowTree)`(패키지 전용)로 `PathWalk` 생성 때 한 번 모아 `producers`·`parallelEarlier` 가 쓴다. `callKeys` 의 트리 없는 경우는 `RuleSetFlowJson.ruleIds` 의 노드 ID 중복·빈 ID 규칙을 그대로 따른다. 시험(`분석기가_모은_RULE_단계는_FlowTree_ruleSteps_와_순서가_같다`)이 코퍼스·퍼즈 전체로 (a) RULE 부분 = `ruleSteps()`, SET 부분 = `setSteps()`, (b) `callKeys` 의 룰 부분 = `RuleSetFlowJson.ruleIds` 를 단언한다.
  - `RuleSetPathState.before` 3인자: SET 노드는 키로 적지 않는다(RULE 노드만). 받는 노드가 붙은 SET 은 정상 갈래가 `setProduces` 출력 뒤에서 시작한다. 2인자는 빈 집합 함수로 위임(`RuleSetOrderCheck` 연결은 srv:6).
  - `RuleSetCheck` 에는 코드 상수 넷(`CALL_MISSING`·`CALL_CYCLE`·`CALL_DEPTH`·`CALLER_BROKEN`)만 더했다. "네 코드 모음" 상수는 srv:6.
- 계획 조정(본문과 다르게 한 것):
  - 본문 `CallStep`·`FlowTree.callSteps()`·`g.rule()` → `Step`·분석기 안 트리 걷기·`g.step()`. `keyOf` 는 TASK·빈 세트 ID 에 null.
  - 본문 `step()` 에 없던 받는 노드 예약 이름(R13) 처리를 되살렸다(문구의 이름은 `disp(id)`, 칸은 `idOf(id)` — RULE 은 그대로).
  - 본문 `never()` 의 `(RuleStep) g.rule()` 캐스트를 없애고 TASK 갈래를 따로 뒀다(기존 TASK `CATCH_NEVER` 문구 유지, 위 결정).
  - 본문 `RuleSetInterface.walk` 는 끝내는 IF 갈래(`Branch.ends`)를 합치기에 넣었으나, 합치기에서 빼고 END 지점에 넣었다(편차 8·Ruling 16). 이어지는 갈래가 없으면 블록 뒤 상태를 그대로 둔다. TASK 는 반드시 만드는 이름이 없다.
  - 본문 `endsEarly` 는 처리 갈래 안 IF 갈래의 END 를 세지 않았다 → `endsEarly(seq, inHandler)` 로 처리 갈래 안(중첩 포함) `Branch.ends` 를 센다. 처리 갈래 밖 끝내는 IF 갈래는 세지 않는다(편차 10).
  - 본문 `Walk.seq` 의 SET 갈래 외에 `Walk.guarded` 의 정상 갈래에도 SET 출력을 더했다.
  - 본문 `asRuleIo` 의 `exists ? 1 : null`(int) → 문자열. 본문 사례 4(옛 MERGE IF) → 새 형식 IF(두 갈래가 RULE 노드 j 로 모임). 본문 사례 5 severity REJECT → WARN. 사례의 releasedVer 는 지금 코퍼스처럼 `"1.000"`.
  - 본문 `RuleSetInterfaceTest` 3건에 편차를 묶는 6건을 더했다(끝내는 IF 갈래 END 지점·처리 갈래 END endsEarly·처리 갈래 안 IF END endsEarly·돌아오는 처리 갈래·입력 `CATCH_*` 빼기·세트 키). 본문 둘째 시험의 흐름도 새 형식 IF 로 바꿨다.

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
