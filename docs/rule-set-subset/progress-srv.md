# srv 진행 기록

조정 세션: dmes-standard-90. 브랜치 `feat/rule-set-subset-server`, 워크트리 `/Users/jji/project/dmes-standard-wt/rssc-srv`.

## 기준선
- 착수 커밋: dev c12e99a4(plan:0 반영) / 시험: srv:3 대상 묶음은 아래 항목에 적는다.

## 지금 상태·다음 단계
- srv:3 dev 머지 끝(2b638315, 머지 뒤 :api 마이그레이션 시험 15클래스 88건 통과).
- srv:5 구현·코퍼스 끝(b89509f3·80d0a74b, 아래 「srv:5」). ui:5t 가 이 브랜치를 합쳐 TS 초록을 알리면 머지 요청한다(짝 머지).
- srv:6 묶음 A 끝(아래 「srv:6」). 다음: 묶음 B(확정 검사 연결)·C(편집 서비스) — A 의 상수·읽기기를 읽기만 한다. ui 에 코퍼스 111건(`MIN_CASES` 111)을 알린다.
- srv:5 리뷰(opus/high 1회) clean, 낮음 3건은 srv:6 으로 넘긴다:
  1. `RuleSetPathState.before` 3인자는 SET always 출력만 defined 로 센다. always=false 출력을 maybe 에 넣는 분석기와 갈린다. srv:6 이 `RuleSetOrderCheck` 에 연결할 때 partial 출력도 받게 넓히고 사례를 더한다(예: SET G(P always=false) → IF [R1 이 P 만듦][R2 가 P 읽음]).
  2. 코퍼스 보강: setId `""` SET 노드 + 받는 노드, PARALLEL 형제 SET 출력 읽기(PAR_SIBLING), SET 이 낀 CYCLE 문구, `RuleSetInterfaceTest` 구조 오류 흐름. 더하면 Java·TS `MIN_CASES` 를 함께 올리고 ui 에 알린다.
  3. 편차 13 의 네 코드 모음 상수와 확정·되살리기 검사 연결(그 전까지 WARN 인 CALL_MISSING 은 확정을 막지 않는다 — srv:5 전보다 나빠진 것은 아니다).
- 메모: dev c12e99a4 의 m-mdm `tests/ui-meta-lock.test.ts` 1건 실패는 기존 실패이고 dev 14ec1124 에서 고쳐졌다. 머지 요청 전에 dev 를 합친다.
- 메모: eng:1 이 `RuleSetRunner` 의 `new Violation(…FLOW_INVALID…)` 에 `List.of()` 인자를 더한다. srv:6 은 그 뒤 모양을 기준으로 고친다.

## srv:6. 서비스·연쇄 재검사 (진행 중)
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

### 묶음 B — 확정·되살리기 검사 연결 (끝)
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
