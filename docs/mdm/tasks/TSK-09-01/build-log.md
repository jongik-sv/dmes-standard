# TSK-09-01 build-log

## 구현 단위 진행

| 단위 | 상태 |
|---|---|
| B1 | UNIT_DONE |
| B2 | 미착수 |
| B3 | 미착수 |

## B1 — 샘플 룰 4종 서버·JS 행 고르기 동치

산출물: `src/frontend/m-mdm/tests/evalex-sample-rule-parity.test.ts`(신규, 15개 `it`).

### 설계 이탈 — D1 (b) 채택 방식

design.md D1은 "Build 착수 시 view API·DB 시드 존재를 5분 이내로 확인하고 어렵지 않으면 (b)로 바꾼다"고 정했다. 확인
결과:
- `ruleEditService.view` OASIS 액션(`src/backend/mdm/api/src/main/resources/services/dme/ruleEdit.bpmn`)이 실제로
  이 4개 룰을 조회할 수 있다. 다만 이것은 `@SpringBootTest`(HTTP) 경로라 서버가 떠 있어야 하므로, 서버를 띄우지 않는
  순수 vitest 단위 테스트에서는 그대로 쓸 수 없다.
- 대신 **`src/backend/mdm/sample/mdm-local-sample.sql`**(TB_MDM_RULE_VAR·TB_MDM_RULE_ROW, VER=1)에 이 4개 룰의 실제
  DB 시드가 있다. 이 SQL 파일의 INSERT 문에 있는 `op`·`left`·`right`·`list`·`val`·`expr` 값을 `SampleRules.java`
  (06:1295-1329·H:440-461·465-497·520-531)의 리터럴과 육안으로 대조해 같음을 확인했다(자동 바이트 비교는 하지
  않았다). 그 뒤 SQL의 변수·행 값을 **그대로 옮겨** 테스트 픽스처(`QLTY_VARS`/`QLTY_ROWS` 등)를 만들었다 —
  `SampleRules.java`를 손으로 다시 읽고 옮기지 않았다. 이는 D1 (b)의 취지(전사 위험 회피)를 실제 저장 표현으로
  달성한 것이고, HTTP 호출 대신 정적 시드 파일을 원천으로 쓴 점만 design.md D1 문구("view HTTP 응답")와 다르다.
- 예외: `StoredVar.dataType`(필수 필드)은 DB 상 대부분 NULL(런타임에 `RuleVarTypeResolver`가 해석)이라 시드에서
  가져올 수 없다. `SampleRules.java`가 명시한 해석된 타입(NUMBER/STRING)을 그대로 썼다 — 기존 `evalex-rule-preview.test.ts`
  픽스처(`tests/fixtures/evalex-rules.ts`)도 같은 방식(해석된 타입을 직접 명시)이라 관례와 맞는다.

### 설계 이탈 — 입력 레코드에서 결과 전용 필드를 뺀다

design.md §3 B1은 "각 케이스는 `SampleRuleValueTest.java`가 쓰는 입력 레코드를 그대로 가져온다"고 정했지만, 이
테스트의 레코드는 Java 원본에서 `BASE_FCT`(QLTY)·`COIL_LEN`/`SPEC_GRAV`(COIL_WGT·PROD)·`SHEET_CNT`(PROD)·
`TOP_RESIN_CD`/`COAT_SIDE`(BASE_SPD)를 뺐다. 이 필드들은 모두 RESULT 변수의 식(`expr`/`ast`) 또는 결과 열 그룹
조건에서만 쓰이고, `previewRule`의 행 선택 경로(`alwaysNames`가 뽑는 COND 변수·`grpCondAst`)에는 들어오지 않는다
— 불변 규칙 1("결과 값 계산 안 함")을 그대로 따른 자연스러운 결과다. 오히려 이 필드들을 넣지 않은 채로 두는 편이
"previewRule 이 결과 값을 계산하면" 실패하도록 만들어 변이 검증(아래 표)의 가드 역할도 한다. `QLTY_Q6`·`PROD_P4`는
이 차이를 조용히 넘기지 않고 명시적 경계 테스트로 남겼다(Java 는 이 필드 없이는 RESULT_CHECK 로 던지지만
`previewRule` 은 결과 계약을 보지 않으므로 통과한다 — 결함 아님).

### 결과 열 그룹(BASE_SPD) 범위 확인

`ruleDefFromStored`(`src/frontend/m-mdm/pages/dme/ruleEdit/decision-table/grid-model.ts:93-109`)는 변환 시
`resGrp`·`grpCondAst`를 결과로 옮기지 않는다. `alwaysNames`(`input-contract.ts:33-54`)는 조건 변수와 결과 변수의
`grpCondAst`에서만 필수 레코드 키를 뽑으므로, 그룹 조건이 애초에 비어 있는 이 변환 경로에서는 `TOP_RESIN_CD`·
`COAT_SIDE`가 필요 없다. 따라서 `BASE_SPD_LKP` 테스트는 조건 변수 `COIL_THK` 하나로만 정해지는 행 선택만 검증한다 —
design.md §5 불변 규칙("previewRule은 결과 값을 계산하지 않는다")과 §0.1의 스코프 설명(행 선택·폴백 분류만 비교
대상)에 부합하는 자연스러운 결과이며, 이 작업이 새로 만든 제약이 아니다. 발견된 결함이 아니므로 defects.md는
만들지 않았다.

## 변이 검증 기록

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| `previewRule`은 결과 값을 계산하지 않고 행 고르기(hits·trace·defaultApplied·fallback)만 낸다 | `rule-preview.ts` DERIVE 분기 직전·`UNIQUE`/`FIRST` 정책 분기 끝(기본 행 처리 전)에 각각 적중 행의 RESULT 변수 `ast` 셀을 `evaluate()`로 계산해 보는 코드를 추가(`mutateComputeResults`) — 실제로 "결과 값을 계산하는" 위반을 재현했다 | `evalex-sample-rule-parity.test.ts` + `evalex-rule-preview.test.ts`(`--bail=1`, `--` 없이) | 잡힘 — Q3(`BASE_FCT` 없음)에서 1건째로 즉시 `MISSING_KEY` 오류로 빨강, bail 로 중단 |
| 정합성 코퍼스(`engine-corpus.json`)는 한 벌만 존재한다(사본 금지) | `src/frontend/m-mdm/tests/fixtures/engine-corpus-copy.json`(빈 JSON) 신규 생성 | `evalex-corpus.test.ts`(`--bail=1`) | 잡힘 — "코퍼스 사본이 없다" 검사 실패 |

두 변이 모두 확인 뒤 `git checkout -- <파일>`(rule-preview.ts) / `rm`(사본 파일)으로 되돌렸다. 커밋에 변이는
포함되지 않는다. (첫 시도에서는 `else if (t.hit)` 반전 변이를 썼으나, 이는 "행 선택이 틀린다"만 증명하고 "결과
값을 계산한다"는 위반을 재현하지 않아 advisor 검토에서 지적받고 위 표의 변이로 다시 만들었다.)

## 돈 명령과 결과

- `cd src/frontend && pnpm build:libs` — 성공
- `cd src/frontend && pnpm --filter @dk-oasis/m-mdm test tests/evalex-sample-rule-parity.test.ts` — 15 passed
- `cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint` — 통과(`tsc --noEmit`, 오류 없음)
- 위 변이 검증용 임시 실행 2회(각각 되돌림) — 본문 표 참고
- 전체 `pnpm --filter @dk-oasis/m-mdm test`(기준선 명령)는 이 Build 단위에서 돌리지 않았다 — dev-discipline 규율상
  전체 회귀는 오케스트레이터의 Build 게이트 몫이다.
- 이 작업은 itest(프로덕션 코드 변경 없음)라 새 테스트는 작성 즉시 초록이었다 — "실패 확인 뒤 구현"이라는 통상의
  TDD 빨강 단계가 없고, 대신 위 변이 검증으로 테스트가 실제로 무언가를 검증함을 증명했다.

## 인계

없음 — B1은 이 세션에서 완료했다(도구 호출 상한 이내). B2·B3는 각각 새 서브에이전트가 design.md §3 그대로 진행하면
된다(파일이 겹치지 않아 병렬 가능).

## B2 — 레이아웃 등록→검증→스냅샷→왕복 단일 체인

산출물: `LayoutOasisFlowTest.java`(수정) — 새 `@Test register_validate_export_직렬화_파싱_왕복이_일치한다()` 1개,
`@Autowired LayoutSnapshotAssembler`·`LayoutCodecs` 필드 2개, import 4개(`MdmLayoutSnapshot`·`MdmLayoutSerializeContext`·
`LayoutCodecs`·`LayoutSnapshotAssembler`) 추가. 기존 메서드는 건드리지 않았다(design.md §2 변경 파일 목록 그대로).

design.md 대로 `http201()`(등록) → `validate` HTTP(7행 표 재확인) → `export` HTTP(스냅샷 총 길이 187 재확인) →
`snapshotAssembler.read(m.message())`(DB 스냅샷 조립, 손 조립 아님 — `LayoutSerializerRoundTripTest`의 갭을 정확히
닫는 지점) → `layoutCodecs.serializer().serialize(...)`로 인코딩 → `layoutCodecs.parser().parse(...)`로 재파싱 →
넣은 값(`COIL_ID=C26A0012345`·`PROD_DT=20260922`·`COIL_THK=3.5`, 기존 `execute`·`LayoutSerializerRoundTripTest`가 이미
검증해 둔 상수와 동일)과 파싱 값이 같은지 단언하는 순서로 짰다.

### 설계 이탈 — 없음, 다만 세부 시그니처 확정

- `LayoutSerializer`·`LayoutParser`를 직접 `new`하지 않고, 이미 `@Component`로 등록되어 `HeaderMngService` 등
  프로덕션 경로가 실제로 쓰는 `LayoutCodecs`(`mdm/lib`)를 `@Autowired`해 `.serializer()`/`.parser()`로 얻었다.
  design.md는 "테스트에서 바로 new 할 수 있다"고 적었지만, `LayoutCodecs`를 통하면 단위 마스터(`TB_MDM_UNIT`)를
  실제 배포 경로와 같은 방식(DB 조회)으로 채운 상태로 얻어 손으로 `LayoutUnitTable`을 구성하는 것보다 실행 시
  의존 관계에 더 가깝다. 결과(직렬화·파싱 값)에는 차이가 없다 — 설계 의도(§0.3 "이미 mdm/api가 실행 시 의존하는
  클래스") 그대로다.
- `LayoutParser.parse`의 실제 시그니처는 `parse(MdmLayoutSnapshot snapshot, byte[] message)`(design.md 초안의
  `parse(bytes, snapshot)`과 인자 순서만 다름) — design.md가 이미 "Build 가 실제 시그니처 확인"이라고 열어 둔 부분이라
  이탈로 기록하지 않는다.

## 변이 검증 기록 (B2)

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| 직렬화·파싱 왕복은 DB 에서 나온 스냅샷 그대로 값이 같아야 한다 | `LayoutSnapshotAssembler.java` `item()`의 `MdmLayoutItemType type = filler ? null : col != null && NUMBER.equals(col.dataType()) ? MdmLayoutItemType.NUM : MdmLayoutItemType.CHAR;` → 늘 `MdmLayoutItemType.CHAR`(DB 스냅샷의 숫자 칸 판정 무력화) | `LayoutOasisFlowTest.register_validate_export_직렬화_파싱_왕복이_일치한다`(단독 실행) | 잡힘 — `ClassCastException`(COIL_THK 가 String 으로 파싱됨) |
| 레이아웃 등록 거부 조건은 7종이다(L12 — CONST 값이 도메인 유효 식을 위반) | `LayoutRegistrationRules.java` `constValue()`의 `if (Judgement.FAIL.equals(j.result()))` → `if (Judgement.PASS.equals(j.result()))`(유효 식 위반 판정 무력화) | `LayoutRegistrationSqliteTest.거부_2_CONST_값이_도메인_유효_식을_위반하면_L12`(단독 실행) | 잡힘 — `AssertionFailedError`(거부되지 않고 저장됨) |

두 변이 모두 확인 뒤 `git checkout -- <파일>`로 되돌렸다(`git status --porcelain` 로 두 파일 모두 원상태 확인). 커밋에
변이는 포함되지 않는다. "등록 거부 7종"은 `LayoutRegistrationSqliteTest`(기존, 안 바꿈)가 전담하고 B2 신규 `@Test`는
"7행 표" 구조(개수·PASS 여부)만 재확인하므로, 변이도 `LayoutRegistrationSqliteTest`(거부 7종 중 하나, L12)를 대상으로
돌렸다 — design.md §5 매핑 그대로.

## 돈 명령과 결과 (B2)

- `cd src/backend/mdm && JAVA_HOME=.../openjdk@21/... ../gradlew :api:test --tests 'com.dongkuk.dmes.mdm.dmb.LayoutOasisFlowTest' --no-daemon --console=plain`(heavy.sh 로 감쌈) — `tests="9" failures="0" errors="0"`(기존 8개 + 신규 1개, 전부 통과)
- 변이 검증용 좁힌 실행 2회(각각 되돌림) — 본문 표 참고. `register_validate_export_직렬화_파싱_왕복이_일치한다`
  단독 1회, `거부_2_CONST_값이_도메인_유효_식을_위반하면_L12` 단독 1회
- 전체 `testAll`(기준선 명령)은 이 Build 단위에서 돌리지 않았다 — 전체 회귀는 오케스트레이터의 Build 게이트 몫이다.

## 인계 (B2)

없음 — B2는 이 세션에서 완료했다(도구 호출 상한 이내).

## B3 — 용어→도메인→컬럼 등록·검증 한 흐름

산출물: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/TermDomainColumnChainOasisFlowTest.java`(신규,
`@SpringBootTest` HTTP 파이프 시험 1개, `DmaOasisHttpTest`·`DomainMngOasisFlowTest`와 같은 패턴 — `DmaTestSupport`
직접 삽입 헬퍼는 쓰지 않았다). design.md §3 B3 의 1~5단계를 한 `@Test` 메서드 안에서 순서대로 확인한다:
termMng.save(새 용어) → domainMng.save(부모 길이20·`value<=30` → 자식 길이15·`value>=0`, AND 누적) →
columnMng.compare(새 용어가 분해기에 반영됨, `***` 없음) → columnMng.save(자식 도메인 참조, terms 그리드를 비워
서버 자동 재분해로 term_ids 채움) → domainMng.validate(부모·자식 누적 규칙이 값 하나는 통과·하나는 거부).

### 설계 이탈 — B3.4 "응답에 domain_id·term_ids" 문구

design.md §3 B3.4 는 "columnMng.save 응답에 domain_id 가 2번 도메인이고 term_ids 에 1번 용어가 들어있는지 확인"이라고
적었지만, 실제 `ColumnMngService.save`(`src/backend/mdm/lib/.../columnMng/service/ColumnMngService.java:329-331`) 의
응답 DTO 는 `{columnId}` 뿐이다(domain_id·term_ids 필드 없음). save 직후 `columnMng.view`를 한 번 더 호출해 그 응답의
`column.domainId`와 `terms[].termId`로 반영을 확인했다 — 값 자체는 design 의도(2번 도메인·1번 용어가 실제로
붙었는지)와 정확히 같고, 확인에 쓰는 API 호출 하나만 늘었다.

### 설계 이탈 — B3.5 "공개 API 로 값 검증" 방법 확정

design.md §3 B3.5 는 "공개 API 로 어떻게 부르는지 먼저 grep 필요 없으면 해당 없음으로 넘어간다"고 열어 뒀다. 확인
결과: `domainMng.execute`(`DomainMngService.execute`)는 요청에 실린 `stdRule`·`parentDomainId`만 평가해 **저장된
도메인의 부모 체인을 타지 않는다**(즉석 미리보기 전용, `DomainMngOasisFlowTest.B6`가 쓰는 방식과 같다) — 이 경로로는
"저장된 컬럼의 상속된 유효식"을 검증할 수 없다. 대신 **`domainMng.validate`**(쓰기 없음, `DomainDraftRequest` +
`grids.testCases`)에 자식의 실제 `domainId`·`parentDomainId`·자기 `stdRule`을 그대로 실어 호출하면, 저장 때와 같은
`DomainChainAssembler`로 부모 체인을 다시 조립해 테스트 케이스를 판정한다(`DomainMngService.validate` →
`check()` → `assembler.assemble(snapshot.withDraft(node).chainRootFirst(...))`). 이것이 "해당 없음"을 쓰지 않고도
찾은 공개 API 다 — `value=25`(부모·자식 모두 통과) · `value=50`(자식 규칙만으론 통과하지만 부모 `value<=30`에 걸림)
두 케이스의 `testResults[].ACTUAL`이 각각 true/false 로 나와, 부모 규칙이 실제로 누적 적용됨을 확인했다.

## 변이 검증 기록 (B3)

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| 도메인 상속은 부모→자식 AND 누적이다 | `EffectiveExpressions.java:37`(`maru-mdm-engine`) `sb.append(" && ")` → `sb.append(" || ")` | `TermDomainColumnChainOasisFlowTest`(`--fail-fast`) | 잡힘 — B3.5 의 "50 은 부모 규칙에 걸려 거부" 단언이 실패(OR 로는 50 이 통과) |
| 용어 사전에 없는 조각은 `***`로 표시하고 무단 치환하지 않는다 | `ColumnMngService.java:262`(`src/backend/mdm/lib/.../columnMng/service`) `physName.contains("*") \|\| columnName.contains("*") \|\| !unresolved.isEmpty()` → `unresolved` 절 삭제 | `TermDomainColumnChainOasisFlowTest`(`--fail-fast`) | 1차: 안 잡힘(보강함) — `DmaOasisHttpTest`의 P2 는 physName 자체에 리터럴 `*`가 있어 이 분기를 안 거친다. 2차: B3.3b(신규, `columnName`엔 미등록 토큰을 섞고 `physName`엔 `*`를 안 넣는 케이스)를 추가하고 응답 메시지가 `MdmErrorCode.NAME_PLACEHOLDER_REMAINS` 로 시작하는지까지 단언해 잡힘 |

두 변이 모두 확인 뒤 `git checkout -- <파일>`로 되돌렸다(`git diff --stat`로 두 파일 모두 diff 없음 확인). 커밋에
변이는 포함되지 않는다. 첫 번째 표 행의 "안 잡힘" 은닉 없이 보강한 테스트(B3.3b)를 그대로 커밋에 포함했다.

## 돈 명령과 결과 (B3)

- `cd src/backend/mdm && JAVA_HOME=... ../gradlew :api:test --tests 'com.dongkuk.dmes.mdm.dma.TermDomainColumnChainOasisFlowTest' --no-daemon --console=plain` — 1 test, 0 failed
- 같은 명령에 `--tests 'com.dongkuk.dmes.mdm.dma.DmaOasisHttpTest'` `--tests 'com.dongkuk.dmes.mdm.dma.domainMng.DomainMngOasisFlowTest'` 를 더해 함께 — 전부 통과(새 시험이 기존 두 시험과 같은 서버 인스턴스에서 상태 간섭 없이 돈다)
- 위 변이 검증용 임시 실행 3회(각각 되돌림) — 본문 표 참고
- 전체 `testAll`(기준선 명령)은 이 Build 단위에서 돌리지 않았다 — 전체 회귀는 오케스트레이터의 Build 게이트 몫이다

## 인계 (B3)

없음 — B3는 이 세션에서 완료했다(도구 호출 상한 이내). 세 단위(B1·B2·B3) 모두 완료됐다 — design.md 대로 서로 다른
파일이라 병렬로 끝났다.

## Build 게이트 (오케스트레이터)
- HEAD 7215f68. 백엔드 testAll 3122/0, shared 168/0, m-mdm lint 통과, oasis ERROR 0 / WARN 0 / INFO 29.
- m-mdm test 775 중 `evalex-perf.test.ts` NFR-1 성능 2~3건 실패(중앙값 137~154ms > 100ms). 4회 실행(최초 1회·확인 1회·팀장 지시 재측정 2회) 모두 NFR-1 만 실패. 부하 평균 11~27(다른 워커 동시 실행).
- 진단: 새 파일(evalex-sample-rule-parity.test.ts)을 뺀 760건에서도 같은 실패, `evalex-perf.test.ts` 단독 실행은 4/4 통과 → 코드 원인 아님(환경). 성능 기준 완화·skip 없음. 팀장 지시로 blocked.
- 팀장 결정(blocked 응답, (B)): 환경 불안정으로 인정하고 Verify 진행. 증적: 2026-09-26 01:18 KST heavy.sh 슬롯(slot-1)을 잡고 `cd src/frontend && pnpm --filter @dk-oasis/m-mdm test tests/evalex-perf.test.ts` 단독 실행 — 4/4 통과(R2 387ms·BASE_SPD_LKP 532ms·QLTY_GRD_JDG 405ms 파일 전체, 부하 평균 30.81).
- Build 게이트 판정 기록: m-mdm 775 중 2 실패(env: evalex-perf NFR-1 부하 민감, 기준선 동일 실패·단독 통과).

## Verify 감사 (Verify 서브에이전트, 오케스트레이터 요약)
- 변이 검증 표 6행 재현 모두 잡힘. 표에 없던 불변 규칙 2건(ALLOWED_FALLBACK_IDS 4건 고정, analysis-corpus 사본 금지)도 기존 테스트가 잡음을 확인.
- 재현 주석: B1 변이는 `evaluate()` 가 실패를 throw 하지 않고 `{kind:"error"}` 로 돌려주므로, 결과가 error 일 때 throw 하도록 넣어야 표대로 잡힌다.
- 프로덕션 소스 변경 없음(`git diff --stat f59cce7..HEAD -- src/` = 테스트 파일 3개). 결함 0건 → defects.md 없음.
- Verify 게이트: Build 게이트 sha 7215f68 이후 변경은 Task 문서뿐, 작업 트리 깨끗 → build_gate 재사용.
