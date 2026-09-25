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
