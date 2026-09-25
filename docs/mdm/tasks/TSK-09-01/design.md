# TSK-09-01 설계 — 영역 통합: 평가 엔진·용어 사전·레이아웃

## 0. 조사 요약 (다음 Phase 가 컨텍스트로 삼는다)

이 작업은 `category: itest`·`domain: test`·`entry-point: -` 다. 새 기능을 만들지 않고, 이미 완료·머지된
9개 선행 작업(TSK-03-02~03-04 평가·판정 엔진, TSK-04-02~04-05 용어·도메인·컬럼, TSK-05-02~05-03 헤더·레이아웃)이
서로 맞물리는 지점에서 **개별 화면·서비스 단위 시험이 못 보는 이음매**를 찾아 새 시험으로 메우는 것이 일이다.
조사(Explore 서브에이전트 + 직접 grep)로 아래 세 요구사항 각각의 기존 자산과 갭을 확인했다.

### 0.1 "코퍼스 전체·샘플 룰 4종을 서버 엔진·JS 평가기에서 같은 결과로 판정"
- **코퍼스 전체 = 이미 됨.** `engine-corpus.json`(169건)을 백엔드 `CorpusConformanceTest`와 프런트 `evalex-corpus.test.ts`가
  같은 파일로 읽어 동치를 본다(TSK-03-04 산출물). 새로 만들 것 없음 — 수용 기준 매핑에 "기존 자산"으로만 건다.
- **샘플 룰 4종 = 서버만 됨.** `QLTY_GRD_JDG`(DECISION/FIRST)·`COIL_WGT_CALC`(DERIVE)·`PROD_WGT_CALC`(DECISION/UNIQUE)·
  `BASE_SPD_LKP`(DECISION/UNIQUE + 결과 열 그룹)는 `maru-mdm-engine`의 `SampleRules.java`(픽스처) +
  `SampleRuleValueTest.java`(값 테스트, 클래스 주석 "수용 기준 1")로 서버 쪽만 검증되어 있다. `grep`으로 확인한바 프런트
  어디에도 이 4개 이름이 없다 — **이것이 이 작업이 메울 갭**이다.
- JS 쪽 한계(설계 그대로 유지): `rule-preview.ts`(`previewRule`)는 조건 셀만 계산해 **행 고르기**(hits·trace·defaultApplied·
  fallback)만 낸다. 결과 값 계산·집계(`PRC_FCT`·`COIL_WGT` 등)는 "서버 값 테스트 몫"이라고 코드 주석에 명시되어 있다
  (TSK-03-04 설계 결정, 이 작업이 바꾸지 않는다). 그래서 "같은 결과"의 실제 비교 대상은 **행 선택(hitRows)과 폴백/오류
  분류**이지 결과 값이 아니다. `COIL_WGT_CALC`(DERIVE)는 `previewRule`이 조건 없이 항상 첫 행을 고르는 구조라 입력 의존
  분기가 없다 — 구조(행 1개·seq)만 확인하면 된다.

### 0.2 "용어 → 도메인(상속·검증식) → 컬럼(자동 생성·매핑)이 한 흐름으로 등록·검증"
- 세 화면(`mdt/termMng`·`mdt/domainMng`·`mdt/columnMng`)은 각자 독립 Playwright E2E(`mdm-termMng.spec.ts` 등)와 백엔드
  HTTP 시험(`DmaOasisHttpTest`·`DomainMngOasisFlowTest`)을 갖고 있지만, 각자 자기 STAMP로 새 데이터를 만들어 **서로
  이어받지 않는다**. `mdm-columnMng.spec.ts` 주석은 "이 spec 은 용어·컬럼을 만들기 때문에 같은 mdm.db 로 다시 돌릴 수
  없다"고 명시한다 — 즉 세 기능을 잇는 시험이 원래 없다.
- DB 상 용어와 도메인은 **직접 연결되지 않는다**(설계 문서 §「도메인 ↔ 구성 용어」: "도메인명은 용어 조합으로 만들지만
  `TB_MDM_DOMAIN`에 구성 용어를 저장하지 않는다. 생성할 때만 참고한다. **컬럼에만 `term_ids`가 있다**"). 따라서 두
  흐름(용어 하나, 도메인 하나)은 **컬럼에서 합류한다** — 컬럼이 `domain_id`(FK, 필수)와 `term_ids`(용어 배열, 물리명 분해
  결과)를 동시에 갖는 지점이 유일한 통합점이다.
- `DmaOasisHttpTest`(P3·P4·P6)를 보면 `columnMng.save`가 이미 "새 용어 등록 + 물리명 분해 + 저장"을 한 트랜잭션으로
  다룬다. 이 작업이 새로 만들 것은 termMng 로 **먼저** 새 용어를 등록하고, domainMng 로 **새 도메인**(부모 상속 포함)을
  등록한 뒤, 그 둘을 columnMng 저장 한 번에 물리는 시나리오다.

### 0.3 "헤더·레이아웃 등록 → 등록 검증 → 스냅샷 생성 → 직렬화·파싱 왕복 일치"
- `LayoutOasisFlowTest`(`@SpringBootTest`, HTTP)가 `http201()` 헬퍼로 등록한 뒤 `validate`(7행 표)·`execute`(샘플 인코딩)·
  `export`(스냅샷 JSON)를 **각각 별도 `@Test`로 한 단계씩만** 확인한다.
- `LayoutSerializerRoundTripTest`(mdm/lib)는 클래스 주석에 "입력은 손으로 조립한 M201 스냅샷뿐이다 — DB 가 없다"고
  명시한다 — **등록·검증을 거쳐 DB 에 실제로 저장된 스냅샷으로 왕복을 확인하는 시험이 없다.** 이것이 갭이다.
- 해결 경로 확인함: `LayoutOasisFlowTest`는 `@SpringBootTest`라 스프링 빈을 그대로 주입받을 수 있다.
  `LayoutSnapshotAssembler`(`@Component`, `mdm/lib`)의 `public MdmLayoutSnapshot read(Long messageId)`가 DB 에서 실제
  스냅샷 객체를 조립해 돌려준다. `LayoutSerializer`·`LayoutParser`(`mdm/lib`, `codec` 패키지)는 이미 `mdm/api`가 실행 시
  의존하는 클래스라 테스트에서 바로 `new`할 수 있다. `http201()`은 `private`이라 다른 클래스에서 재사용하지 못하므로,
  새 시험은 **같은 파일**(`LayoutOasisFlowTest.java`) 안에 `@Test`로 추가해 그대로 호출한다.

## 1. 접근 방식

세 갭 모두 **프로덕션 코드를 고치지 않고 시험만 추가**한다(itest 범위 — 선행 WP 의 구현을 바꾸는 것은 이 작업 몫이
아니다). 세 갭은 서로 다른 파일·다른 러너에 있어 파일이 겹치지 않는 독립 구현 단위 셋(B1~B3)으로 나눈다. 시험 도중
기존 코드의 결함을 발견해도 고치지 않고 완료 보고에 재현 절차와 함께 올린다(수용 기준 2 — defect Task 등록은
오케스트레이터·사람의 몫).

**결함 발견 시 처리(오케스트레이터 보강)**: 게이트는 기준선 대비 신규 실패 0 이므로 결함을 드러내는 실패 테스트는
커밋하지 않는다. `@Disabled`·skip·기대값 완화도 쓰지 않는다. 대신 `docs/mdm/tasks/TSK-09-01/defects.md` 에 결함마다
`DF-<n>` 번호, 대상 기능 WP(TSK), 재현 절차(실패한 단언 코드 조각 포함), 기대 결과와 실제 결과를 적어 커밋하고, 그 단언만
빼고 나머지 체인을 검증한다. 테스트 코드의 해당 자리에는 `// DF-<n>: defects.md 참조` 주석을 남긴다. 결함이 없으면
defects.md 를 만들지 않는다.

**itest 관통 시나리오의 브라우저 요구와 기준선 제한의 충돌**: `references/e2e.md`는 "통합 작업(itest)의 관통 시나리오도
API 가 아니라 브라우저로 돈다"고 정하지만, 이 작업 프롬프트의 검증 명령(기준선 5개)에는 `pnpm test:e2e`(Playwright)가
없고 "검증 명령은 기준선 명령 줄만 쓴다"는 제약이 있다. 새 Playwright spec 을 만들어도 Build·Verify 게이트가 그것으로
합격·불합격을 가릴 수 없다(선례: TSK-08-03 은 E2E 시나리오를 추가했지만 그중 하나(C2c)는 "미실행"으로 남겼다). 이
충돌은 아래 「담당자 확인 필요 결정」 D2 에 올리고, 기본값으로는 **게이트 안(기준선 5개 명령)에서 도는 백엔드
`@SpringBootTest`·프런트 vitest 로 관통 시나리오를 확인**하고 새 Playwright spec 은 이번 회차에서 만들지 않는다(각
화면의 기존 독립 E2E 가 화면별 등록·검증·인코딩 확인은 이미 하고 있다).

## 2. 변경 파일 목록

**생성**
- `docs/mdm/tasks/TSK-09-01/design.md` — 이 문서
- `src/frontend/m-mdm/tests/evalex-sample-rule-parity.test.ts` — B1
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/TermDomainColumnChainOasisFlowTest.java` — B3

**수정**
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/LayoutOasisFlowTest.java` — B2. 새 `@Test` 메서드 1개 +
  `LayoutSnapshotAssembler` 필드 주입(`@Autowired`) + `LayoutSerializer`·`LayoutParser` import 를 더한다. 기존 메서드는
  건드리지 않는다.

## 3. 테스트 전략

세 단위 모두 기존 게이트 명령 안에서 돈다 — 새 게이트 명령을 추가하지 않는다.

| 단위 | 새 시험 | 도는 명령(기준선 5개 중) |
|---|---|---|
| B1 | `evalex-sample-rule-parity.test.ts` | `cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test` |
| B2 | `LayoutOasisFlowTest` 신규 `@Test` | `cd src/backend && … ./gradlew testAll …` |
| B3 | `TermDomainColumnChainOasisFlowTest` | `cd src/backend && … ./gradlew testAll …` |

### B1 — 샘플 룰 4종 서버·JS 행 고르기 동치
- 각 샘플 룰(`QLTY_GRD_JDG`·`COIL_WGT_CALC`·`PROD_WGT_CALC`·`BASE_SPD_LKP`)의 변수·행·셀 구조를
  `StoredVar`·`StoredRow`·`CellObj`(TS, `grid-model.ts`) 모양으로 새 테스트 파일 안에 옮겨 적는다. **원천은
  `SampleRules.java`(변수 ID·seq·표시 타입·셀 값)이고, 파일 머리 주석에 그 클래스가 인용하는 원 설계 줄 번호(06:1295-1329
  등)를 그대로 옮겨 적어 대조 가능하게 한다**(`SampleRules.java` 자신의 인용 방식을 그대로 따름).
  **Build 착수 시 먼저 할 일**: `dme/ruleMng`·`dme/ruleEdit`의 `view` OASIS 액션이나 다른 HTTP/직렬화 경로로 이
  4개 룰의 실제 저장된(DB) 표현을 그대로 가져올 방법이 있는지 grep 한 번 더 확인한다(TSK-08-03 언급 "06 샘플 INSERT"가
  실제 DB 시드로 존재하면 그것이 더 안전한 원천이다). 있으면 그 경로로 값을 받아 쓰고, 없으면(비용이 커 새 시드·API를
  만들 필요가 생기면) 위 수기 전사 방식을 쓰되 이 사실을 build-log.md 「설계 이탈」에 남긴다.
- 각 케이스는 `SampleRuleValueTest.java`의 실제 `@Test` 메서드(예 `QLTY_Q1_...`)가 쓰는 입력 레코드와, 그 메서드가
  `hitRows(r)`로 단언하는 값을 **그대로 기대값으로 가져온다**(새로 계산하지 않는다 — Java 테스트 결과가 정답).
- 비교 함수는 `ruleDefFromStored` + `previewRule`(`kind: "ok"`이면 `hits.map(h => h.rowId)`, `kind: "fallback"`이면
  그 자체가 기대 응답 — MASTER·codeSets 등 화면이 판정 못 하는 셀은 허용 목록으로 명시, 조용히 skip 하지 않는다).
- `COIL_WGT_CALC`(DERIVE)는 입력 분기가 없으므로 "행 1개·`defaultApplied=false`" 구조만 확인한다.
- 파일명에 `corpus`를 넣지 않는다(넣으면 `rule-analysis-corpus.test.ts`의 "m-mdm 안에 코퍼스 사본이 없다" 사본 검사와
  `evalex-corpus.test.ts`의 같은 검사 양쪽에 걸린다).

### B2 — 레이아웃 등록→검증→스냅샷→왕복 단일 체인
`LayoutOasisFlowTest`에 새 `@Test`(예 `register_validate_export_직렬화_파싱_왕복이_일치한다`)를 추가한다:
1. `http201()`로 헤더+레이아웃을 등록한다(기존 헬퍼 재사용, 그대로 둔다).
2. `validate` HTTP 호출로 7행 표가 모두 통과하는지 확인한다(기존 `validate_는...` 테스트와 같은 방식).
3. `@Autowired LayoutSnapshotAssembler`로 `read(m.message())`를 불러 **DB 에서 나온** `MdmLayoutSnapshot`을 받는다(손
   조립 아님 — `LayoutSerializerRoundTripTest`의 갭을 정확히 여기서 닫는다).
4. `LayoutSerializer.serialize(snapshot, record, ctx)`로 인코딩하고 `LayoutParser.parse(bytes, snapshot)`(또는 동급
   메서드 — Build 가 실제 시그니처 확인)로 다시 파싱해, 넣은 값과 파싱된 값이 같은지 단언한다.
- 레코드 값은 기존 `m201Items()`/`rows(m201Items(), false)`가 쓰는 값(`COIL_THK=3.5` 등, 이미 187바이트·`0035` 인코딩이
  검증돼 있다)과 맞춘다 — 새 기대값을 만들지 않고 기존 상수와 대조한다.

### B3 — 용어→도메인→컬럼 등록·검증 한 흐름
새 파일 `TermDomainColumnChainOasisFlowTest.java`(패키지 `com.dongkuk.dmes.mdm.dma`, `DmaOasisHttpTest`·
`DomainMngOasisFlowTest`와 같은 `@SpringBootTest` + HTTP 패턴, `DmaTestSupport`의 직접 삽입 헬퍼는 쓰지 않는다 —
`DmaOasisHttpTest`도 그렇게 한다. 등록 흐름 자체를 시험하는 게 목적이라 지름길을 쓰면 의미가 없다):
1. `termMng.save`로 새 용어(약어 포함, 예: 표기·의미·영문 약어)를 등록한다.
2. `domainMng.save`로 새 도메인을 등록한다 — 부모 도메인이 있는 종류를 골라 **상속**(길이·소수 좁히기 등)과
   **표준식**(`std_rule`)이 저장 시 파싱·테스트 케이스 자동 실행을 통과하는지 함께 확인한다(TSK-04-03 자체 검증 재사용,
   새 검증 로직을 만들지 않는다).
3. `columnMng.compare`로 1번 용어의 약어가 들어간 한국어 논리명을 분해해 **`***`(미해결 표시) 없이** 물리명이 나오는지
   확인한다(용어 등록이 실제로 분해기에 반영됨을 증명).
4. `columnMng.save`로 2번 도메인을 참조하는 컬럼을 저장한다 — 응답에 `domain_id`가 2번 도메인이고 `term_ids`에 1번
   용어가 들어있는지 확인한다.
5. (된다면) 저장된 컬럼의 유효 검증식(도메인에서 상속)이 실제로 값 하나는 통과시키고 하나는 거부하는지 확인한다 —
   다만 이 단계를 공개 API 로 어떻게 부르는지 먼저 grep 필요(도메인 화면의 테스트 케이스 자동 실행 자체가 저장 시점의
   검증이라, 별도 런타임 값 검증 API 가 없으면 이 항목은 "해당 없음 — 도메인 저장 시 test_cases 자동 실행으로 갈음"으로
   적고 넘어간다).

## 4. 수용 기준 매핑

spec 의 수용 기준은 두 줄뿐이라, spec 「요구사항」 절의 세 항목까지 함께 매핑한다.

| 항목 | 검증 방법 |
|---|---|
| 코퍼스 전체 서버·JS 동치 | 기존 자산 — `CorpusConformanceTest`(백엔드) + `evalex-corpus.test.ts`(프런트), 이미 기준선 testAll·m-mdm test 안에서 통과 중. 이 작업은 손대지 않는다 |
| 샘플 룰 4종 서버·JS 동치 | B1 `evalex-sample-rule-parity.test.ts`(신규) ↔ `SampleRuleValueTest.java`(기존, 불변) |
| 용어→도메인→컬럼 한 흐름 등록·검증 | B3 `TermDomainColumnChainOasisFlowTest`(신규) |
| 헤더·레이아웃 등록→검증→스냅샷→왕복 일치 | B2 `LayoutOasisFlowTest` 신규 `@Test`(신규) |
| 수용 기준 "시나리오 통과" | 위 네 항목이 모두 기준선 5개 명령 중 하나 이상에서 통과 |
| 수용 기준 "발견 결함은 WP 에 defect Task 등록" | 코드 대상 아님. B1~B3 실행 중 기존 코드 결함을 발견하면 완료 보고에 대상 WP 추정과 재현 절차를 적어 올린다(defect Task 생성 자체는 오케스트레이터·사람 몫) |
| B3 §3.5(값 하나 통과·하나 거부) | 공개 검증 API 유무에 따라 "해당 없음" 처리 가능 — Build 가 확인 후 design 을 고치지 않고 build-log.md 에 기록 |

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

| 규칙 | 대상 테스트 |
|---|---|
| `previewRule`은 결과 값을 계산하지 않고 행 고르기(hits·trace·defaultApplied·fallback)만 낸다 | `evalex-sample-rule-parity.test.ts`(신규) + `evalex-rule-preview.test.ts`(기존, 안 바꿈) |
| `ALLOWED_FALLBACK_IDS`는 4건 고정 목록이다 | `evalex-corpus.test.ts`(기존, 안 바꿈) |
| 정합성 코퍼스(`engine-corpus.json`·`analysis-corpus.json`)는 한 벌만 존재한다(사본 금지) | `evalex-corpus.test.ts`·`rule-analysis-corpus.test.ts`의 "사본이 없다" 검사(기존) — 새 파일명에 `corpus` 를 쓰지 않는다 |
| 레이아웃 등록 거부 조건은 7종이다 | `LayoutRegistrationSqliteTest`(기존, 안 바꿈) + B2 신규 `@Test`(7행 표 재확인) |
| 직렬화·파싱 왕복은 DB 에서 나온 스냅샷 그대로 값이 같아야 한다 | B2 신규 `@Test`(`LayoutOasisFlowTest`) |
| 도메인 상속은 부모→자식 AND 누적이고, 값 검증은 그 누적식을 쓴다 | `DomainMngOasisFlowTest`(기존, 안 바꿈) + B3 신규 파일의 §3.2·3.5 |
| 용어 사전에 없는 조각은 컬럼 물리명에서 `***`로 표시하고 무단 치환하지 않는다 | `DmaOasisHttpTest`(기존, 안 바꿈, P2 사례) + B3 신규 파일의 §3.3 |
| 이 작업은 선행 WP 의 프로덕션 소스(`src/**/main/**`, `pages/**`, `src/frontend/m-mdm/src/**`)를 고치지 않는다 — 시험 파일만 만든다 | 커밋 diff 로 확인(`git show --stat`) |

## 구현 단위

| 단위 | 범위(파일·기능) | 새 테스트 | 담당 불변 규칙 |
|---|---|---|---|
| B1 | `src/frontend/m-mdm/tests/evalex-sample-rule-parity.test.ts`(신규) | 샘플 룰 4종 서버·JS 행 고르기 동치 | `previewRule` 결과 값 미계산, 코퍼스 사본 금지 |
| B2 | `src/backend/.../dmb/LayoutOasisFlowTest.java`(수정) | 등록→검증→스냅샷→왕복 단일 체인 | 등록 거부 7종, DB 스냅샷 왕복 일치 |
| B3 | `src/backend/.../dma/TermDomainColumnChainOasisFlowTest.java`(신규) | 용어→도메인→컬럼 한 흐름 | 도메인 상속 AND 누적, `***` 미해결 표시 |

세 단위는 서로 다른 파일을 다루므로 병렬로 진행할 수 있다. 순서를 둘 필요는 없다(마지막 단위가 앞 단위를 잇는
구조가 아니다 — 세 갭이 원래 독립적이다).

## 도커 금지로 생략한 검증

- 금지 모드 출처: 워커 기본(DOCKER=allow 아님)
- 도커 금지로 생략: 해당 없음 — 기준선 `testAll`은 이미 `mssqlMigrationTest`를 포함하지 않는다(baseline 기록:
  "testAll 은 mssqlMigrationTest 를 포함하지 않아 제외 없이 사용"). B1~B3 는 모두 `mssqlTest` 소스셋이 아니라 기본
  `test` 소스셋(SQLite)에 둔다 — 새 mssqlTest 클래스를 만들지 않는다.
- 확인하지 못한 수용 기준: 없음. B1~B3 는 모두 기준선 5개 명령(SQLite·vitest) 안에서 확인한다. MSSQL 방언에서
  같은 동작이 나오는지는 이 작업 범위가 아니고, 머지 뒤 팀장 `dialect_check` 스윕이 맡는다(레포 공용 관례).

## 담당자 확인 필요 결정

근거의 강약: spec 본문 > 승인된 선행 산출물 > 리포 기존 관례 > 미승인 선행 산출물.

### D1 — 샘플 룰 4종 JS 픽스처의 원천을 수기 전사로 할지, 서버 view API 로 할지
- **질문**: B1 의 룰 구조(`StoredVar`/`StoredRow`/`CellObj`)를 `SampleRules.java`에서 사람이 옮겨 적으면(수기 전사) 전사
  실수가 "엔진 불일치"로 오인될 위험이 있다. 반대로 실제 `dme/ruleEdit view` HTTP 응답(만약 이 4개 룰이 DB 에 시드돼
  있다면)을 그대로 받아쓰면 전사 위험이 없지만, 그 시드 존재 여부·API 모양 확인에 추가 조사가 든다(TSK-08-03 언급
  "06 샘플 INSERT" 가 실마리이나 이번 조사에서 실제 확인은 못 했다).
- **선택지**: (a) `SampleRules.java` 원문 줄 번호를 주석으로 남기고 수기 전사(빠름, 전사 위험 있음) / (b) 먼저 view API·
  DB 시드 존재를 확인해 있으면 그 경로로 받아쓰기(느림, 안전함)
- **택한 것**: (a)를 기본으로 하되, Build 착수 시 (b) 가능 여부를 먼저 5분 이내로 확인하고 어렵지 않으면 (b)로 바꾼다
  (design.md §3 B1 에 이미 이 순서로 적어 뒀다)
- **근거와 강약**: spec 은 "같은 결과로 판정"만 요구하고 방법을 정하지 않았다(중립). 이 작업은 itest 로 새 인프라(시드·
  API)를 만드는 비용이 크면 범위를 벗어난다 — 기존 관례(`engine-corpus.json`도 수기 저작)가 (a)를 정당화한다.
- **반려되면 재작업 방향**: (b)를 강제하면 B1 은 먼저 06 샘플 INSERT 시드가 실제로 있는지, `view` HTTP 응답이
  `ruleDefFromStored` 입력과 바로 맞는지부터 확인하는 조사 단계를 먼저 밟고, 안 맞으면 변환 어댑터를 추가한다.

### D2 — itest 관통 시나리오를 브라우저(Playwright)로도 만들 것인가
- **질문**: `e2e.md`는 itest 의 관통 시나리오를 브라우저로 돌리라고 하지만, 기준선 5개 명령에 Playwright 가 없어
  새 spec 을 만들어도 게이트가 그것으로 합격을 가릴 수 없다.
- **선택지**: (a) 이번 회차는 백엔드 `@SpringBootTest`·프런트 vitest 로만 관통 시나리오를 확인하고 새 Playwright spec 은
  만들지 않는다(각 화면의 기존 독립 E2E 가 화면별 동작은 이미 본다) / (b) 새 Playwright spec(`mdm-term-domain-column-chain.spec.ts`
  등)을 추가로 만들어 **게이트 밖(정보 제공용)**으로 한 번 실행하고 결과만 보고한다 / (c) 기준선에 `pnpm test:e2e`를
  추가하도록 오케스트레이터에게 요청한다(이 Task 범위를 넘는 결정)
- **택한 것**: (a)
- **근거와 강약**: 프롬프트 규칙("검증 명령은 기준선 명령 줄만 쓴다")이 spec 본문보다 이 세션에서는 더 강하게 작용한다
  (도커 금지 모드 절차의 명시적 제약). e2e.md 의 itest 규칙과 정면으로 충돌하므로 사람 판단이 필요하다.
- **반려되면 재작업 방향**: (b)로 바뀌면 B3 완료 뒤 새 구현 단위 B4 를 만들어 Playwright spec 하나를 추가하고, 완료
  보고에 "게이트 밖, 실행 결과: …"를 명시한다. (c)면 오케스트레이터가 기준선을 다시 재는 별도 절차를 밟아야 한다.

### D3 — 발견 결함의 defect Task 등록을 이 작업에서 할 것인가
- **질문**: 수용 기준 2 는 "발견 결함은 해당 기능 WP 에 defect Task 로 등록됨" 이다. 팀원(워커)은 서버 쓰기가 자기 주문
  하나로 제한되어 다른 WP 에 Task 를 만들 수 없다.
- **선택지**: (a) 결함을 `defects.md` 에 WP·재현 절차와 함께 기록하고 완료 보고에 건수를 실어, 등록은 팀장·사람이 한다 /
  (b) 이 작업에서 D'Flow 에 defect Task 를 직접 만든다
- **택한 것**: (a)
- **근거와 강약**: 팀원 서버 쓰기 범위 규칙(worker-prompt 「5」)이 (b)를 금지한다. spec 은 등록 주체를 정하지 않았다.
- **반려되면 재작업 방향**: 팀장·사람이 `defects.md` 의 항목을 그대로 해당 WP 의 defect Task 로 옮긴다(코드 재작업 없음).
