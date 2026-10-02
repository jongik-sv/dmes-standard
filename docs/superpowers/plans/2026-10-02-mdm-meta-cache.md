# MDM 메타 제공과 업무 모듈 캐시(하위 프로젝트 A) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MDM 서버가 원장 쓰기마다 변경 기록(`TB_MDM_META_REV`)을 남기고 OASIS `metaFeed` 로 정의를 내주며, 업무 모듈(mcm·mls·mqc·mpp·mpn)은 cactus-core `com.dongkuk.dmes.cactus.mdm` 으로 그 정의를 받아 로컬 캐시에 두고 10초마다 변경 기록을 확인해 바뀐 키만 지운다. 포털 시스템관리에 "MDM 캐시 관리" 화면을 둔다.

**Architecture:** MDM 쪽은 각 원장 쓰기 서비스 본문에서 `MetaRevisionRecorder` 를 불러 같은 트랜잭션에 기록(키 펼침 포함)하고, `services/feed/metaFeed.bpmn` + `MetaFeedService` 가 변경 목록(search)·정의 묶음(view)·강제 기록(save)을 준다. 업무 모듈 쪽은 cactus-core 의 자동 설정(기본 꺼짐)이 `MdmMetaClient`(RestClient) → `MdmMetaService`(묶음 조회·동시 적재 1회·장애 건너뛰기) → `MdmMetaCache`(대상별 맵·상한·수명·지움 기록) → `MdmRevisionPoller`(리비전 규칙 다섯 가지) → `MdmDefinitionLookup`(엔진 spi) → `MdmMetaController`(`/api/{module}/mdmMeta/*`) 를 엮는다. 포털 화면(m-mcm `csa/mdmCacheMng`)은 모듈별 상태·항목을 보고, 삭제·재등록은 MDM `metaFeed/save` 로 강제 기록을 남긴다.

**Tech Stack:** Java 21, Spring Boot 4.0.6(Spring 7 · RestClient · MockRestServiceServer · ApplicationContextRunner), OASIS(BPMN), JPA + 네이티브 쿼리, SQLite + Flyway, Jackson 2(`com.fasterxml`), JUnit 5 + AssertJ/Mockito(cactus-core) + JUnit Assertions(mdm), maru-mdm-engine(EvalEx), Next.js + React 19 + `@dk-oasis/shared`(Mantine 9·ag-grid 33 래퍼), Vitest(happy-dom).

**Spec:** `docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md`(커밋 e7401253, 결정 D1~D9). 이 계획은 스펙을 정본으로 따르되, 코드와 어긋나는 곳은 코드 사실을 따른다 — 문서 끝 「스펙과 다른 점」 표가 근거(파일:줄)와 처리를 적는다.

**작업 위치:** 워크트리 `/Users/jji/project/dmes-standard/.claude/worktrees/mdm-meta-cache`(이하 `$W`), 브랜치 `feat/mdm-meta-cache`. 모든 명령은 `$W` 기준이다. git 은 `/usr/bin/git` 으로 부른다(셸 훅이 `git` 을 다른 도구로 바꿔 워크트리 가드에 막힌다).

---

## 병렬 순서

경로 약어: `L` = `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm`, `LT` = `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm`, `A` = `src/backend/mdm/api/src/main`, `AT` = `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm`, `C` = `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm`, `CT` = `src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm`, `P` = `src/frontend/m-mcm`. 모델 등급: cheap(정해진 내용 옮기기) · standard(정해진 설계를 코드로) · capable(동시성·여러 파일 정합).

| 태스크 | 등급 | 먼저 끝나야 할 태스크 | 고치는 곳(요약) |
|---|---|---|---|
| 0 빌드 배선 실측 | standard | — | cactus-core `build.gradle`·`settings.gradle`, 업무 모듈 5곳 `settings.gradle` |
| 1 변경 기록 표·기록기 | standard | 0 | V17, `L/entity/MdmMetaRev`, `L/repository/MdmMetaRevRepository`, `L/common/metarev/*` |
| 2 기록 지점 1(컬럼·도메인·전문) | standard | 1 | `ColumnMngService`·`DomainMngService`·`LayoutMngService`·`HeaderMngService` + 시험, `HeaderMngQueryCountTest` |
| 3 기록 지점 2(룰·룰세트·코드·확정) | standard | 1 | `DefaultVersionStateService`·`RuleHeaderService`·`RuleSetMngService`·`RuleSetEditService`·`CodeEditService`·`CodeItemEditService` + 시험 |
| 4 metaFeed 1(BPMN·search·view COLUMN/DOMAIN) | capable | 1 | `A/resources/services/feed/metaFeed.bpmn`, `L/feed/metaFeed/**`, `MdmOasisActionVocabularyTest` |
| 5 metaFeed 2(view RULE·RULE_SET·CODE·LAYOUT, save) | standard | 4 | `L/feed/metaFeed/**`, BPMN save, `MdmErrorCode` MDM027, `CommonContractTest` |
| 6 cactus 클라이언트 | standard | 0 | `C/{MdmClientProperties,MdmTargetType,MdmUnavailableException,MdmMetaFeed,MdmMetaClient,MdmJson,MdmChange*,MdmFetchResult,MdmColumnMeta,MdmDomainMeta}` |
| 7 cactus 캐시·서비스 | capable | 6 | `C/MdmMetaCache`·`C/MdmMetaService`, `CT/FakeMetaFeed`·`CT/MutableClock` |
| 8 cactus 폴러 | capable | 7 | `C/MdmRevisionPoller` |
| 9 엔진 spi 구현·계약 시험 | capable | 5, 8 | `C/MdmNames`·`C/MdmDefinitionLookup`, `AT/feed/MdmMetaFeedContractHttpTest` |
| 10 엔드포인트·자동 설정 | standard | 9 | `C/MdmMetaController`·`C/MdmScreenColumn`·`C/MdmAutoConfiguration`, imports |
| 11 업무 모듈 켜기·권한 | standard | 10 | 모듈 5곳 `application.yml`, mcm `DataInitializer`, mcm-core `EndpointPermissionFilter`, `P/proxy.ts`, shared rbac 시험, `MdmOasisActionVocabularyTest` |
| 12 캐시 관리 화면 | standard | 11 | `P/page-components/csa/mdmCacheMng/*`, `P/tests/**`, `P/package.json`, page-registry |
| 13 문서(ADR·가이드·인덱스) | cheap | 0~12 | `docs/mdm/adr/0006-*`, `docs/mdm/adr/README.md`, `docs/guide/BackEnd/Backend-Implementation-Guide.md`, `docs/mdm/README.md` |
| 14 통합 수동 검증 | standard | 0~13 | (코드 변경 없음) |

물결: **①** 0 단독. **②** 1 과 6 을 함께 연다(1 = mdm, 6 = cactus-core — 겹치는 파일 없음). **③** 1 뒤 2·3 을 함께(서로 다른 서비스 파일), 6 뒤 7. **④** 4(1 뒤), 8(7 뒤). **⑤** 5(4 뒤). **⑥** 9(5·8 뒤). **⑦** 10 → 11 → 12 순서. **⑧** 13·14. gradle 을 쓰는 태스크는 동시에 둘까지만 돈다(16GB 노트북 — gradle 두 벌이 한계). 같은 파일을 고치는 짝: 4→5(`MetaFeedService`·BPMN·`MdmOasisActionVocabularyTest`), 4→11(`MdmOasisActionVocabularyTest`), 2→3 없음.

---

## 공통 명령

- JDK: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home PATH=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin:$PATH` (시스템 기본 java 는 17 이라 컴파일이 안 된다). 아래 모든 gradle 명령 앞에 이 환경이 있다고 본다.
- mdm: `src/backend/mdm` 에는 gradlew 가 없다 — `(cd src/backend/mdm && ../gradlew :api:test --tests '<패턴>' --console=plain)`, lib 은 `:lib:test`.
- cactus-core: 자체 gradlew 가 있다 — `(cd src/backend/cactus-core && ./gradlew test --tests '<패턴>' --console=plain)`.
- mcm-core: `(cd src/backend/mcm-core && ../gradlew test --tests '<패턴>' --console=plain)`.
- 업무 모듈 컴파일: `(cd src/backend/<모듈> && ../gradlew :lib:compileJava :api:compileJava --console=plain -q)`.
- OASIS 계약 검사(커밋 전, ERROR 0): `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root . --module mdm` 와 기본 범위 `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .`(기본 모듈 목록에 mdm 이 없다 — 스크립트 `:20`).
- FE: 워크트리에는 `node_modules` 와 shared `dist` 가 없다. Task 12 첫 단계에서 `pnpm -C src/frontend install` 과 `pnpm -C src/frontend --filter @dk-oasis/shared build` 를 한 번 한다(로컬 서버가 떠 있을 때 `pnpm build` 금지 — 메모 local-run-mac-setup).
- 도커는 쓰지 않는다. DB 는 SQLite 만 쓴다.

---

## Global Constraints

- 배포 구조는 하이브리드다: 정의는 MDM 서버에 HTTP 로 요청해 받고, 업무 모듈은 받은 정의를 자기 로컬 캐시에 두고 엔진 jar 로 직접 검증한다(D1).
- 무효화는 리비전 확인이다: MDM 이 증가 순번 변경 기록을 남기고, 업무 모듈은 짧은 주기로 "순번 N 이후 변경"을 받아 해당 키만 지운다(D2).
- MDM 서버에는 캐시를 두지 않는다. 늘 DB 최신 값을 돌려준다(D4).
- 클라이언트는 cactus-core 의 `com.dongkuk.dmes.cactus.mdm` 패키지에 둔다(D9). 새 모듈을 만들지 않는다.
- mdm 서비스는 `@Transactional` 을 쓰지 않는다(CGLIB 프록시가 OASIS 파라미터 이름을 지운다). 기록은 각 쓰기 메서드 본문에서 원장 쓰기 직후 `MetaRevisionRecorder` 를 직접 부르고, 같은 트랜잭션에 합류해 원장이 롤백되면 기록도 롤백된다.
- 판정에 쓰이는 값(RELEASED 버전, 유효 도메인, 컬럼 속성, 룰세트 정의, 전문)이 바뀌는 쓰기에만 기록을 건다. DRAFT 편집·선점·테스트 케이스 저장은 걸지 않는다. 의심스러우면 거는 쪽을 택한다.
- 로컬 샘플 적재(`MdmLocalSampleLoader`)는 기록하지 않는다.
- `MdmCodeLookup`·`StoredDefinitionLookup` 을 빈으로 만들지 않는다(D-077, ADR-0005 가드 — `MdmBusinessRuleMigrationTest:566-569` 의 `DefinitionLookup` 빈 0개). 서비스 안에서 `new` 로 쓴다.
- `cactus.mdm.enabled` 기본값은 `false` 다. 업무 모듈이 켠다. MDM 서버 자신은 켜지 않는다.
- 설정 기본값(스펙 §5.1 그대로): `poll-interval: 10s`, `max-entries: 20000`(대상 합계 상한), `max-age: 60m`, `connect-timeout: 2s`, `read-timeout: 5s`, `base-url: ${MDM_WAS_URL:http://localhost:8096}`.
- 캐시는 Caffeine 을 쓰지 않고 자체 구현한다. `CacheManager` 빈을 만들지 않는다(`MasterCodeCacheAutoConfiguration` 이 켜지거나 꺼지는 일을 막는다).
- `com.dongkuk.dmes.cactus.mdm` 의 클래스에는 `@Component`·`@Service`·`@Controller`·`@RestController`·`@Configuration` 을 붙이지 않는다. 빈은 모두 `MdmAutoConfiguration` 의 `@Bean` 으로 만든다(업무 앱이 `com.dongkuk.dmes` 를 스캔해도 꺼진 상태에서 빈이 생기지 않게). 컨트롤러는 `DmomReceiveController` 선례대로 클래스 수준 `@RequestMapping` + `@ResponseBody` 만 단다.
- MDM 호출 헤더: `X-Client-Key`(설정값), `X-Authenticated-User: system:{module}`, `X-Authenticated-Role: SYSTEM`, `X-Tx-Id`(요청마다 UUID). `X-Authenticated-User` 가 없으면 JWT 흐름으로 빠져 401 이므로 늘 넣는다.
- MDM 장애 시: 캐시에 있는 항목은 계속 쓴다. 캐시에 없는 키는 `MdmUnavailableException`(엔드포인트는 `unavailable[]`)이고 "없음"으로 캐시하지 않는다. 같은 오류가 반복되면 30초 동안 MDM 호출을 건너뛰고 바로 예외를 던진다. 폴링이 계속 실패해도 캐시를 비우지 않는다.
- 리비전 규칙(스펙 §5.3) 다섯 가지 — 기동·정상·truncated·역행·적재와 경합 — 를 그대로 지킨다.
- 이름 정규화: 소문자가 섞인 이름은 camelCase 로 보고 `UPPER_SNAKE` 로 바꾼다(`codeNm` → `CODE_NM`). 이미 대문자면 그대로 쓴다.
- OASIS 계약: `params` 에 배열을 넣지 않는다(키 목록은 `grids.keys.rows[{key}]`), serviceTask 는 `output=result`, `grid` 속성 금지, grids 키 = 파라미터 이름(`keys`). 계약 검사 ERROR 0.
- 화면은 shared 컴포넌트만 쓴다. 바꾼 FE 파일은 커밋 전 audit 2종이 0건이어야 한다. 삭제·재등록은 확인 대화 상자를 거친다(Local-Rules §9 중요 액션 UX).
- 브라우저 확인은 ego-browser 스킬로 하고, 확인이 끝나면 보고 전에 연 작업 공간을 닫는다.
- 커밋 메시지는 `type(scope): 한국어 요약`(저장소 관례 — `feat(mdm)`·`feat(cactus-core)`·`feat(m-mcm)`·`feat(mcm)`·`feat(mcm-core)`·`docs(mdm)` 등)이고 마지막 줄에 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` 를 둔다.

## Review Focus

- **피드↔클라이언트 JSON 표류** — MDM 이 직렬화한 `LocalDateTime`·`BigDecimal`(코드 버전 `1.000`)·`Map<Integer, RuleCell>` 키(`"1"`)·enum·null 을 cactus 쪽이 같은 값으로 되읽어야 한다. 기대: 실제 MDM HTTP 로 받은 룰을 적용 기간 경계 양쪽에서 고르고, CODE 도메인 컬럼을 `DomainValidator` 로 검증한 결과가 MDM 원장과 같다. → Task 9 `MdmMetaFeedContractHttpTest`.
- **물리명 변경** — 컬럼 물리명을 `COIL_THK` → `RMTL_COIL_THK` 로 바꾸면 옛 이름 캐시가 남지 않아야 한다. 기대: 두 이름이 모두 기록된다. → Task 2 `META_물리명을_바꾸면_옛_이름과_새_이름을_모두_기록한다`.
- **적재 중 변경 경합(§5.3-5)** — 적재 요청이 MDM 에 다녀오는 사이 그 키의 변경을 폴링이 먼저 처리하면, 늦게 도착한 옛 값이 캐시에 남으면 안 된다. 기대: 그 적재 결과는 호출자에게만 돌아가고 캐시에 들어가지 않는다. → Task 7 `적재_시작_뒤_폴링이_지운_키는_캐시에_넣지_않는다`, Task 8 `규칙5_경합_적재_결과는_캐시에_남지_않고_다음_조회가_다시_받는다`.
- **MDM 꺼짐·느림** — MDM 이 응답하지 않거나 5초를 넘기면 업무 처리가 멈추지 않아야 한다. 기대: 캐시에 있는 키는 그대로 답하고, 없는 키는 `unavailable` 로 즉시 돌려주며 두 번 연속 실패 뒤 30초는 호출하지 않는다. → Task 6 `읽기_시간_초과는_MdmUnavailableException`, Task 7 `연속_두_번_실패하면_30초_동안_MDM_을_부르지_않는다`, Task 8 `폴링_실패는_캐시를_비우지_않고_실패_수와_마지막_오류만_남긴다`.
- **service-group 없는 모듈·권한** — mqc·mpp·mpn 에는 `cactus:` 블록이 없어 `service-group` 이 `app` 이고 ClientKeyFilter 도 없다. mcm BE 의 3-segment 권한키는 serviceId 가 `""` 라 권한 데이터로 맞출 수 없다. 기대: 다섯 모듈 모두 `/api/{module}/mdmMeta/columns` 가 로그인 사용자에게 열리고, status·entries·load 는 SYSADMIN 만 받는다. → Task 10 `module_설정이_없으면_service_group_을_쓰고_그것도_없으면_app_이다`·`status_는_SYSADMIN_이_아니면_403_이고_SYSADMIN_이면_상태를_준다`, Task 11 `mdmMeta_는_AUTH_ONLY_다`·shared `T12`, Task 14 Step 3(mqc 실기동).

---

## 계약 표(태스크 사이 이름 — 글자 그대로)

### MDM 변경 기록 `TB_MDM_META_REV`

| 칼럼 | 값 |
|---|---|
| `TARGET_TYPE` | `COLUMN`·`DOMAIN`·`RULE`·`RULE_SET`·`CODE`·`LAYOUT` |
| `TARGET_KEY` | COLUMN = 대문자 `PHYS_NAME`, DOMAIN = `DOMAIN_ID` 문자열, RULE = `MARU_RULE_ID`, RULE_SET = `MARU_RULE_SET_ID`, CODE = `MARU_CODE_ID`, LAYOUT = `LAYOUT_ID` 문자열 |
| `CHANGE_KIND` | `SAVE`(원장 변경) · `EVICT`(화면 삭제) · `RELOAD`(화면 재등록) |

### OASIS `metaFeed`(`POST /oasis/metaFeed/{action}`)

| action | params | grids | `data.result` |
|---|---|---|---|
| `search`(= 스펙 changes) | `since`(정수, 기본 0), `limit`(기본 1000, 최대 5000) | `keys.rows` 빈 배열(늘 보낸다) | `{latestSeq, items:[{seq, type, key, kind}], truncated}` |
| `view`(= 스펙 columns·domains·rules·ruleSets·codes·layouts) | `type`(위 6종) | `keys.rows:[{key}]`(최대 500) | `{items:[{key, value}], failed:[{key, message}]}` — 없는 키는 빠진다 |
| `save`(= 스펙 force, SYSADMIN 만) | `type`, `kind`(`EVICT`·`RELOAD`) | `keys.rows:[{key}]` | `{fromSeq, toSeq, count}` |

`view` 의 `value` 모양(필드 이름 그대로, mdm `MetaFeedPayloads` ↔ cactus `MdmColumnMeta`·`MdmDomainMeta`):

| type | value |
|---|---|
| COLUMN | `{physName, columnName, labelLong, labelMid, labelShort, description, usageNote, dataType, length, scale, required, defaultValue, refKind, refTarget, refCateId, domain:{domainId, domainName, domainKind}|null, stdExpr:{text, ast}|null, bizExpr:{text}|null, bizRequiredVars:[], codeRef:{maruCodeId, cateId}|null}` |
| DOMAIN | `{domainId, domainName, stdName, domainKind, dataType, length, scale, unitCode, description, stdExpr:{text, ast}|null, bizRuleOnServer, codeRef:{maruCodeId, cateId}|null}` |
| RULE | 엔진 `DefinitionLookup.RuleDefinition` 의 배열 — RELEASED 버전 전체, `ver` 오름차순. RELEASED 가 없으면 빈 배열 |
| RULE_SET | 엔진 `DefinitionLookup.RuleSetDefinition` |
| CODE | 엔진 `CodeLookup.CodeRows`(해석 전 원본) |
| LAYOUT | 최신 `TB_MDM_LAYOUT_VER.SNAPSHOT_JSON` 의 `MdmLayoutSnapshot` 을 맵으로 |

직렬화는 MDM 이 `MetaFeedJson.plain(...)` 으로 먼저 평범한 맵·리스트로 바꾼다(`JavaTimeModule`, `WRITE_DATES_AS_TIMESTAMPS` 끔, `USE_BIG_DECIMAL_FOR_FLOATS` 켬) — `LocalDateTime` 은 `"2026-01-01T00:00:00"`, `BigDecimal` 은 숫자 그대로(`1.000`).

### 업무 모듈 엔드포인트 `/api/{module}/mdmMeta`

| action | 메서드 | 입력 | 출력 | 권한 |
|---|---|---|---|---|
| `columns` | POST | `{names:[]}` | `{items:{요청이름: MdmScreenColumn}, missing:[], unavailable:[]}` | 로그인 사용자 |
| `domains` | POST | `{domainIds:[]}` | `{items:{id: MdmDomainMeta}, missing:[], unavailable:[]}` | 로그인 사용자 |
| `status` | GET | — | `{module, instanceId, appliedSeq, latestSeq, lastSuccessAt, consecutiveFailures, lastError, counts:{TYPE:n}, maxEntries, maxAgeSeconds}` | SYSADMIN(헤더) |
| `entries` | GET | `type`, `q`, `page`(0부터), `size`(기본 50) | `{total, page, size, items:[{type, key, absent, value, loadedAt, hits, remainingSeconds, loadSeq}]}` | SYSADMIN(헤더) |
| `load` | POST | `{type, keys:[]}` | `{loaded:[], missing:[], unavailable:[]}` | SYSADMIN(헤더) |

`{module}` 이 이 인스턴스 모듈과 다르면 404. SYSADMIN 판정은 요청 헤더 `X-Authenticated-Role`(콤마 목록, `ROLE_` 접두 무시)로 한다.

## Rulings(스펙이 정하지 않은 세부 — 이 계획이 정했다)

- **R1 기록 쓰기:** `MetaRevisionRecorder` 는 여러 행 `VALUES` 네이티브 INSERT 한 문장(200행씩)으로 쓴다. 키 수와 무관하게 SQL 문이 하나라 기존 SQL 문 수 가드(`*QueryCountTest`)가 키 수만큼 늘지 않는다. 감사 9칼럼은 `MdmNativeAuditSupport.currentStamp()`·`MdmTemporalBinder.toDb` 로 채운다(`RuleSetTestCaseWrites` 선례). 읽기는 JPA 엔티티 `MdmMetaRev`·`MdmMetaRevRepository`.
- **R2 COLUMN 키는 대문자다:** 기록기·피드·클라이언트 모두 `PHYS_NAME` 을 `toUpperCase(Locale.ROOT)` 로 맞춘다.
- **R3 순환·깨진 도메인 체인:** 컬럼 메타는 도메인 칸·식·코드 참조를 비운다(`LayoutDictionary.derive` 선례). 도메인 키 자체가 순환이면 `failed` 로 돌려준다(클라이언트가 "없음"으로 캐시하지 않게).
- **R4 손상된 저장 정의:** 룰 행 셀·FLOW_JSON 이 깨져 정의를 만들 수 없으면 그 키만 `failed` 에 담고 나머지는 정상으로 준다. 클라이언트는 `failed` 키를 `unavailable` 로 다룬다(캐시하지 않음, MDM 장애 수로는 세지 않음).
- **R5 피드 클라이언트 인터페이스:** cactus 의 `MdmMetaService`·`MdmRevisionPoller` 는 인터페이스 `MdmMetaFeed`(changes·fetch)에 기대고, `MdmMetaClient` 가 그것을 HTTP 로 구현한다. 시험은 `FakeMetaFeed` 를 쓴다.
- **R6 30초 건너뛰기:** 연속 2번 실패하면 그 시각부터 30초 동안 fetch 를 부르지 않는다. 건너뛴 호출은 실패 수에 더하지 않는다. 성공하면 실패 수를 0 으로 되돌린다.
- **R7 지움 기록(tombstone):** 폴링이 키를 지울 때 (키, 순번, 시각)을 남긴다. 적재는 시작할 때 `Ticket(generation, appliedSeq)` 을 받고, 넣을 때 캐시가 통째로 비워졌거나(generation 이 다름) 그 키의 지움 순번이 `ticket.appliedSeq` 보다 크면 넣지 않는다. 지움 기록은 5분 뒤 `markApplied` 때 정리한다(읽기 시간 초과 5초보다 충분히 길다).
- **R8 기동 첫 폴링:** `changes(since=0, limit=1)` 로 `latestSeq` 만 받아 캐시를 비우고 `appliedSeq` 로 삼는다(받은 항목은 버린다).
- **R9 전문 키:** 헤더 레이아웃은 자기 버전 스냅샷이 없다(`HeaderMngService.save:281-284` 는 사용 전문만 `recordAll`). 피드 `view LAYOUT` 은 최신 `TB_MDM_LAYOUT_VER` 가 있는 전문만 돌려주고 헤더 ID 는 빠진다(missing). 헤더 변경은 사용 전문 키로 무효화된다.
- **R10 SYSADMIN 확인 위치:** 업무 모듈 컨트롤러는 `X-Authenticated-Role` 헤더로 확인한다(mqc·mpp·mpn 에는 ClientKeyFilter·사용자 문맥이 없다 — 「스펙과 다른 점」 S10). MDM `metaFeed/save` 는 `MdmCurrentUser.roleIds()` 에 `SYSADMIN` 이 없으면 `MDM027` 이다.
- **R11 화면 버튼:** 표준 골격(screen-patterns §상단 버튼)대로 조회(`search`)·신규(`save`, 등록 팝업 = load)·삭제(`delete`)·재등록(`btn_reload`, action `reload`)이다. `reload` 토큰은 PERM_ALL `allActions` 에 더한다.
- **R12 폴러 로그:** 첫 실패만 WARN, 이어지는 실패는 DEBUG, 복구 때 INFO 한 줄(MDM 이 꺼진 개발 PC 에서 10초마다 WARN 이 쌓이지 않게).

---
### Task 0: 빌드 배선 실측 — cactus-core 가 maru-mdm-engine 을 api 로 물고 업무 모듈이 엔진 빌드를 찾게 한다

**Files:**
- Modify: `src/backend/cactus-core/build.gradle:84-86`(Jackson 블록 뒤)
- Modify: `src/backend/cactus-core/settings.gradle`(끝)
- Modify: `src/backend/{mcm,mls,mqc,mpp,mpn}/settings.gradle`(`include 'lib'` 앞)
- Create: `src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmEngineDependencyTest.java`

**Interfaces:**
- Consumes: 없음.
- Produces: cactus-core main·test 컴파일 클래스패스에 `kr.dongkuk.maru.mdm.engine.*`(spi·code·domain·expr). 업무 모듈 5곳과 mdm 이 그대로 컴파일된다. 실측 결과(중첩 includeBuild 전달 여부)를 커밋 본문에 남긴다 — Task 13 ADR 이 인용한다.

- [ ] **Step 1: 지금 상태가 컴파일되는지 확인한다(기준선)**

Run: `(cd src/backend/mls && ../gradlew :lib:compileJava --console=plain -q) && (cd src/backend/cactus-core && ./gradlew compileJava --console=plain -q)`
Expected: 두 명령 모두 오류 없이 끝난다. 실패하면 이 작업과 무관한 깨짐이므로 멈추고 보고한다.

- [ ] **Step 2: 실패하는 시험을 쓴다**

`src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmEngineDependencyTest.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import kr.dongkuk.maru.mdm.engine.code.DefaultCodeResolver;
import kr.dongkuk.maru.mdm.engine.domain.DefaultDomainValidator;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;
import org.junit.jupiter.api.Test;

/** spec 2026-10-02-mdm-meta-cache-design §5.1 — cactus-core 가 엔진을 api 의존으로 문다(업무 모듈이 엔진 spi·검증기를 쓴다). */
class MdmEngineDependencyTest {

    @Test
    void 엔진_spi_와_검증기가_cactus_core_클래스패스에_있다() {
        assertThat(DefinitionLookup.class.getPackageName()).isEqualTo("kr.dongkuk.maru.mdm.engine.spi");
        assertThat(CodeLookup.class).isInterface();
        assertThat(DefaultDomainValidator.class).isNotNull();
        assertThat(DefaultCodeResolver.class).isNotNull();
    }
}
```

- [ ] **Step 3: 실패를 확인한다**

Run: `(cd src/backend/cactus-core && ./gradlew test --tests 'com.dongkuk.dmes.cactus.mdm.MdmEngineDependencyTest' --console=plain)`
Expected: FAIL — `compileTestJava` 에서 `package kr.dongkuk.maru.mdm.engine.spi does not exist`.

- [ ] **Step 4: cactus-core 에 의존과 엔진 빌드를 더한다**

`src/backend/cactus-core/build.gradle` 의 Jackson 두 줄 바로 아래에 넣는다:

```groovy
    // ── MDM 메타 캐시(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.1, 2026-10-02) ──
    //   업무 모듈이 엔진 spi(DefinitionLookup·CodeLookup)와 검증기를 쓴다. 엔진 main 의존은 EvalEx 하나다.
    //   버전은 POM 에 빠지지 않게 적는다(maven-publish). 소스 빌드는 settings.gradle 의 includeBuild 가 치환한다.
    api 'kr.dongkuk.maru.mdm:maru-mdm-engine:0.1.0-SNAPSHOT'
```

`src/backend/cactus-core/settings.gradle` 끝에 더한다(단독 빌드는 mavenCentral 만 보므로 늘 필요하다):

```groovy

// MDM 메타 캐시(2026-10-02) — cactus-core 가 엔진을 api 로 문다. group 은 kr.dongkuk.maru.mdm(엔진 D7).
includeBuild('../maru-mdm-engine') {
    dependencySubstitution {
        substitute module('kr.dongkuk.maru.mdm:maru-mdm-engine') using project(':')
    }
}
```

- [ ] **Step 5: cactus-core 시험이 통과하는지 확인한다**

Run: `(cd src/backend/cactus-core && ./gradlew test --tests 'com.dongkuk.dmes.cactus.mdm.MdmEngineDependencyTest' --console=plain)`
Expected: PASS.

- [ ] **Step 6: 중첩 includeBuild 전달을 실측한다(업무 모듈 settings 를 고치기 전)**

Run: `(cd src/backend/mls && ../gradlew :lib:compileJava --console=plain 2>&1 | tail -20)`
Expected(둘 중 하나 — 결과 문장을 그대로 메모해 커밋 본문에 쓴다):
- 통과 → "중첩 includeBuild 가 전달된다(mls 가 cactus-core 의 엔진 includeBuild 를 따라 찾았다)".
- `Could not find kr.dongkuk.maru.mdm:maru-mdm-engine:0.1.0-SNAPSHOT` → "중첩 includeBuild 가 전달되지 않는다".

- [ ] **Step 7: cactus-core 를 포함하는 모든 빌드에 엔진 빌드를 명시한다(실측 결과와 무관하게 — mdm 선례와 같은 모양으로 고정)**

먼저 대상을 데이터로 정한다:

Run: `grep -ln "includeBuild('../cactus-core')" src/backend/*/settings.gradle; grep -Ln "maru-mdm-engine" $(grep -ln "includeBuild('../cactus-core')" src/backend/*/settings.gradle)`
Expected: 첫 목록은 `mcm`·`mdm`·`mls`·`mpn`·`mpp`·`mqc`(2026-10-02 기준 — mcm-core·aps-core·analog·caravan-* 는 cactus-core 를 포함하지 않는다), 둘째 목록(엔진 블록이 없는 것)은 `mdm` 을 뺀 다섯이다. 목록이 다르면 둘째 목록의 **모든** 파일에 아래 블록을 넣고 Step 8 에서 그 빌드도 컴파일한다.

둘째 목록의 각 `settings.gradle`(지금은 `src/backend/mcm`·`mls`·`mqc`·`mpp`·`mpn`) `include 'lib'` 바로 앞에 같은 블록을 넣는다:

```groovy
// MDM 메타 캐시(2026-10-02) — cactus-core 가 maru-mdm-engine 을 api 로 문다. 중첩 includeBuild 전달에 기대지 않고
// mdm/settings.gradle 과 같이 명시한다(Task 0 실측은 커밋 메시지 참고).
includeBuild('../maru-mdm-engine') {
    dependencySubstitution {
        substitute module('kr.dongkuk.maru.mdm:maru-mdm-engine') using project(':')
    }
}

```

명시하는 이유: 실측이 "전달된다"여도 전달은 Gradle 내부 동작이라 버전이 바뀌면 조용히 깨질 수 있고, 같은 폴더를 겹쳐 선언하는 것은 mdm·루트 composite 가 이미 쓰는 모양이다(`src/backend/mdm/settings.gradle:13-18`, 루트 `settings.gradle:73-78`).

- [ ] **Step 8: 모든 소비 빌드가 컴파일되는지 확인한다**

Run(한 줄씩, 차례로):
```bash
(cd src/backend/mls && ../gradlew :lib:compileJava :api:compileJava --console=plain -q)
(cd src/backend/mcm && ../gradlew :lib:compileJava :api:compileJava --console=plain -q)
(cd src/backend/mqc && ../gradlew :lib:compileJava :api:compileJava --console=plain -q)
(cd src/backend/mpp && ../gradlew :lib:compileJava :api:compileJava --console=plain -q)
(cd src/backend/mpn && ../gradlew :lib:compileJava :api:compileJava --console=plain -q)
(cd src/backend/mdm && ../gradlew :lib:compileJava :api:compileJava --console=plain -q)
(cd src/backend && ./gradlew help --console=plain -q)
```
Expected: 모두 오류 없이 끝난다(Step 7 의 첫 목록에 다른 빌드가 있었으면 그 빌드도 같은 명령으로 컴파일한다). 마지막 줄은 루트 composite(cactus-core·mdm·엔진이 함께 포함되는 빌드)가 설정 단계를 통과하는지 본다. 이 단계가 끝나면 Step 6 의 실측 결과는 ADR 문구에만 쓰이고 어떤 빌드도 그 결과에 기대지 않는다. `Included build ... has the same root project name` 류 오류가 나면 멈추고 그 메시지를 보고한다(중첩 중복 포함이 sibling 중복과 다르게 동작한 경우다).

- [ ] **Step 9: 커밋**

```bash
/usr/bin/git add src/backend/cactus-core/build.gradle src/backend/cactus-core/settings.gradle \
  src/backend/mcm/settings.gradle src/backend/mls/settings.gradle src/backend/mqc/settings.gradle \
  src/backend/mpp/settings.gradle src/backend/mpn/settings.gradle \
  src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmEngineDependencyTest.java
/usr/bin/git commit -m "$(cat <<'EOF'
build(cactus-core): maru-mdm-engine 을 api 의존으로 붙이고 업무 모듈이 엔진 빌드를 찾게 한다

실측(Step 6): <여기에 "중첩 includeBuild 가 전달된다" 또는 "전달되지 않는다" 와 그 근거 한 줄>.
업무 모듈 5곳은 결과와 무관하게 mdm 처럼 엔진 includeBuild 를 명시한다.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1: MDM 변경 기록 표 `TB_MDM_META_REV` 와 기록기 `MetaRevisionRecorder`

**Files:**
- Create: `A/resources/db/migration/mdm/sqlite/V17__create_mdm_meta_rev.sql`(flyway-migration-add 스킬로 채번)
- Create: `L/entity/MdmMetaRev.java`
- Create: `L/repository/MdmMetaRevRepository.java`
- Create: `L/common/metarev/MetaTargetType.java`, `L/common/metarev/MetaChangeKind.java`, `L/common/metarev/MetaRevisionRecorder.java`
- Test: `AT/common/metarev/MetaRevTestSupport.java`, `AT/common/metarev/MetaRevisionRecorderTest.java`

**Interfaces:**
- Consumes: `DomainImpactQueries.subtree(Long)` → `List<SubtreeRow(Long domainId, int depth, Long columnId, String columnName, String physName)>`(`L/common/dictionary/DomainImpactQueries.java:63`), `MasterCodeRemoval.referencingDomainIds(String)` → `List<String>`(`L/common/mastercode/MasterCodeRemoval.java:55`), `MdmNativeAuditSupport.currentStamp()` → `AuditStamp(userId, serviceId, programId, Instant at)`, `MdmTemporalBinder.toDb(Instant)`.
- Produces:
  - `enum MetaTargetType { COLUMN, DOMAIN, RULE, RULE_SET, CODE, LAYOUT; static Optional<MetaTargetType> parse(String) }`
  - `enum MetaChangeKind { SAVE, EVICT, RELOAD; static Optional<MetaChangeKind> parse(String) }`
  - `MetaRevisionRecorder`(빈): `void column(String oldPhysName, String newPhysName)`, `void domain(Long domainId)`, `void rule(String ruleId)`, `void ruleSet(String setId)`, `void code(String maruCodeId)`, `void layouts(Collection<Long> layoutIds)`, `MetaRevisionRange force(MetaTargetType type, Collection<String> keys, MetaChangeKind kind)`, `record MetaRevisionRange(long fromSeq, long toSeq, int count)`
  - `MdmMetaRev`(엔티티 getter `getRevSeq()`·`getTargetType()`·`getTargetKey()`·`getChangeKind()`)
  - `MdmMetaRevRepository`: `List<MdmMetaRev> findByRevSeqGreaterThanOrderByRevSeqAsc(Long since, Pageable page)`, `long latestSeq()`
  - 시험 도우미 `MetaRevTestSupport`: `clear(JdbcTemplate)`, `rows(JdbcTemplate) → List<String>`("TYPE:KEY:KIND", 순번 순), `keys(JdbcTemplate, String type) → Set<String>`, `domain(JdbcTemplate, String stdName, String kind, Long parentId, String maruCodeId) → long`, `column(JdbcTemplate, String physName, long domainId)`

- [ ] **Step 1: 채번하고 마이그레이션 파일을 만든다**

Run: `python3 .claude/skills/flyway-migration-add/scripts/migration_tool.py status --module mdm`
Expected: `sqlite [방언] 13 개, 최대 V16` · `다음 안전 번호: V17`. 다른 번호가 나오면 그 번호를 쓰고 이 태스크의 파일 이름을 모두 바꾼다.

Run: `python3 .claude/skills/flyway-migration-add/scripts/migration_tool.py scaffold --module mdm --slug create_mdm_meta_rev --title "MDM 메타 변경 기록 테이블"`
Expected: `src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V17__create_mdm_meta_rev.sql` 이 생긴다. 생긴 본문을 아래로 통째로 바꾼다:

```sql
-- 2026-10-02 — MDM 메타 변경 기록(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §3.1).
--
-- 왜: 업무 모듈 캐시가 "순번 N 이후 바뀐 키"만 받아 지운다(D2). 원장 쓰기 서비스가 같은 트랜잭션에서 한 행씩 쌓는다
-- (MetaRevisionRecorder). 조회는 늘 REV_SEQ > :since 라 인덱스는 PK 하나로 충분하다.
-- REV_SEQ 는 AUTOINCREMENT — 지운 최댓값을 다시 쓰지 않아 순번이 되돌지 않는다. DB 를 새로 만들면 1 부터 다시 시작하고,
-- 클라이언트는 latestSeq 가 자기 appliedSeq 보다 작아진 것(역행, §5.3-4)을 보고 캐시를 비운다.
-- 감사 9칼럼은 다른 TB_MDM_* 와 같다(ADR-0001). 스펙 표의 REG_DT·REG_ID 는 C_AT·C_USR_ID 가 맡는다.
-- 보관 정리(30일)는 이번 범위가 아니다.
-- 되돌리려면: DROP TABLE TB_MDM_META_REV (변경 기록이 사라진다 — 업무 모듈은 역행으로 보고 캐시를 비운다).

CREATE TABLE TB_MDM_META_REV (
    REV_SEQ INTEGER CONSTRAINT PK_TB_MDM_META_REV PRIMARY KEY AUTOINCREMENT,
    TARGET_TYPE VARCHAR(20) NOT NULL,
    TARGET_KEY VARCHAR(100) NOT NULL,
    CHANGE_KIND VARCHAR(10) NOT NULL,
    C_USR_ID VARCHAR(100),
    C_AT TIMESTAMP,
    C_SVC_ID VARCHAR(100),
    C_PGM_ID VARCHAR(100),
    U_USR_ID VARCHAR(100),
    U_AT TIMESTAMP,
    U_SVC_ID VARCHAR(100),
    U_PGM_ID VARCHAR(100),
    VER BIGINT,
    CONSTRAINT CK_TB_MDM_META_REV_TYPE CHECK (TARGET_TYPE IN ('COLUMN','DOMAIN','RULE','RULE_SET','CODE','LAYOUT')),
    CONSTRAINT CK_TB_MDM_META_REV_KIND CHECK (CHANGE_KIND IN ('SAVE','EVICT','RELOAD'))
);
```

- [ ] **Step 2: 실패하는 시험을 쓴다**

`AT/common/metarev/MetaRevTestSupport.java`:

```java
package com.dongkuk.dmes.mdm.common.metarev;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;

/** TB_MDM_META_REV 시험 도우미(spec 2026-10-02-mdm-meta-cache-design §7) — 기록 단언과 도메인·컬럼 픽스처. */
public final class MetaRevTestSupport {

    private MetaRevTestSupport() {
    }

    public static void clear(JdbcTemplate jdbc) {
        jdbc.update("DELETE FROM TB_MDM_META_REV");
    }

    /** 기록 행을 순번 순으로 {@code TYPE:KEY:KIND}. */
    public static List<String> rows(JdbcTemplate jdbc) {
        return jdbc.queryForList("SELECT TARGET_TYPE || ':' || TARGET_KEY || ':' || CHANGE_KIND FROM TB_MDM_META_REV ORDER BY REV_SEQ",
                String.class);
    }

    /** 대상 종류 하나의 키 집합. */
    public static Set<String> keys(JdbcTemplate jdbc, String type) {
        return new LinkedHashSet<>(jdbc.queryForList(
                "SELECT TARGET_KEY FROM TB_MDM_META_REV WHERE TARGET_TYPE = ? ORDER BY REV_SEQ", String.class, type));
    }

    /** 도메인 한 행. CODE 면 STRING, 그 밖에는 NUMBER. 돌려주는 값은 DOMAIN_ID. */
    public static long domain(JdbcTemplate jdbc, String stdName, String kind, Long parentId, String maruCodeId) {
        jdbc.update("INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, PARENT_DOMAIN_ID, MARU_CODE_ID, VER) "
                        + "VALUES (?, ?, ?, ?, ?, ?, 0)",
                stdName, stdName, kind, "CODE".equals(kind) ? "STRING" : "NUMBER", parentId, maruCodeId);
        return jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = ?", Long.class, stdName);
    }

    public static void column(JdbcTemplate jdbc, String physName, long domainId) {
        jdbc.update("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID) VALUES (?, ?, ?)", physName, physName, domainId);
    }
}
```

`AT/common/metarev/MetaRevisionRecorderTest.java`:

```java
package com.dongkuk.dmes.mdm.common.metarev;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.mdm.common.metarev.MetaRevisionRecorder.MetaRevisionRange;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds;
import com.dongkuk.dmes.mdm.entity.MdmMetaRev;
import com.dongkuk.dmes.mdm.repository.MdmMetaRevRepository;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** spec 2026-10-02-mdm-meta-cache-design §3.2·§7 「MDM 기록」 — 대상별 키 펼침과 트랜잭션 합류. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class MetaRevisionRecorderTest extends AbstractMdmSharedDbTest {

    @Autowired
    MetaRevisionRecorder recorder;
    @Autowired
    MdmMetaRevRepository repository;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    PlatformTransactionManager transactionManager;

    private TransactionTemplate tx;

    @BeforeEach
    void setUp() {
        tx = new TransactionTemplate(transactionManager);
        MetaRevTestSupport.clear(jdbc);
        jdbc.update("DELETE FROM TB_MDM_COLUMN_SYSTEM");
        jdbc.update("DELETE FROM TB_MDM_COLUMN");
        jdbc.update("DELETE FROM TB_MDM_DOMAIN");
        new MasterCodeSeeds(jdbc).clear();
    }

    @Test
    void 컬럼_신규는_새_물리명_하나를_대문자로_기록한다() {
        recorder.column(null, "coil_thk");
        assertEquals(List.of("COLUMN:COIL_THK:SAVE"), MetaRevTestSupport.rows(jdbc));
    }

    @Test
    void 컬럼_물리명이_바뀌면_옛_이름과_새_이름을_모두_기록하고_같으면_하나다() {
        recorder.column("COIL_THK", "RMTL_COIL_THK");
        recorder.column("COIL_WID", "COIL_WID");
        assertEquals(List.of("COLUMN:COIL_THK:SAVE", "COLUMN:RMTL_COIL_THK:SAVE", "COLUMN:COIL_WID:SAVE"),
                MetaRevTestSupport.rows(jdbc));
    }

    @Test
    void 도메인은_하위_도메인과_그_도메인들을_참조하는_컬럼까지_펼친다() {
        long p = MetaRevTestSupport.domain(jdbc, "MR_P", "QTY", null, null);
        long c = MetaRevTestSupport.domain(jdbc, "MR_C", "QTY", p, null);
        long g = MetaRevTestSupport.domain(jdbc, "MR_G", "QTY", c, null);
        long u = MetaRevTestSupport.domain(jdbc, "MR_U", "QTY", null, null);
        MetaRevTestSupport.column(jdbc, "MR_COL_P", p);
        MetaRevTestSupport.column(jdbc, "MR_COL_G", g);
        MetaRevTestSupport.column(jdbc, "MR_COL_U", u);

        recorder.domain(p);

        assertEquals(Set.of(String.valueOf(p), String.valueOf(c), String.valueOf(g)), MetaRevTestSupport.keys(jdbc, "DOMAIN"));
        assertEquals(Set.of("MR_COL_P", "MR_COL_G"), MetaRevTestSupport.keys(jdbc, "COLUMN"));
    }

    @Test
    void 코드는_직접_참조하는_도메인을_도메인처럼_하위와_컬럼까지_펼친다() {
        new MasterCodeSeeds(jdbc).seedCode("MR_CD", "INUSE", "MDM");
        long k = MetaRevTestSupport.domain(jdbc, "MR_K", "CODE", null, "MR_CD");
        long k2 = MetaRevTestSupport.domain(jdbc, "MR_K2", "CODE", k, null);
        long other = MetaRevTestSupport.domain(jdbc, "MR_O", "QTY", null, null);
        MetaRevTestSupport.column(jdbc, "MR_COL_K2", k2);
        MetaRevTestSupport.column(jdbc, "MR_COL_O", other);

        recorder.code("MR_CD");

        assertEquals(Set.of("MR_CD"), MetaRevTestSupport.keys(jdbc, "CODE"));
        assertEquals(Set.of(String.valueOf(k), String.valueOf(k2)), MetaRevTestSupport.keys(jdbc, "DOMAIN"));
        assertEquals(Set.of("MR_COL_K2"), MetaRevTestSupport.keys(jdbc, "COLUMN"));
    }

    @Test
    void 룰_룰세트_전문은_받은_키만_중복_없이_기록한다() {
        recorder.rule("R1");
        recorder.ruleSet("S1");
        recorder.layouts(List.of(3L, 5L, 3L));
        assertEquals(List.of("RULE:R1:SAVE", "RULE_SET:S1:SAVE", "LAYOUT:3:SAVE", "LAYOUT:5:SAVE"), MetaRevTestSupport.rows(jdbc));
    }

    @Test
    void 강제_기록은_펼치지_않고_순번_범위를_돌려준다() {
        long p = MetaRevTestSupport.domain(jdbc, "MR_FP", "QTY", null, null);
        MetaRevTestSupport.domain(jdbc, "MR_FC", "QTY", p, null);
        recorder.rule("R0");

        MetaRevisionRange range = recorder.force(MetaTargetType.DOMAIN, List.of(String.valueOf(p), "77"), MetaChangeKind.EVICT);

        assertEquals(2, range.count());
        assertEquals(range.fromSeq() + 1, range.toSeq());
        assertEquals(List.of("RULE:R0:SAVE", "DOMAIN:" + p + ":EVICT", "DOMAIN:77:EVICT"), MetaRevTestSupport.rows(jdbc));
    }

    @Test
    void 호출자_트랜잭션이_롤백되면_기록도_사라진다() {
        tx.executeWithoutResult(s -> {
            recorder.rule("R_ROLLBACK");
            s.setRollbackOnly();
        });
        assertEquals(List.of(), MetaRevTestSupport.rows(jdbc));
    }

    @Test
    void 저장소는_순번_뒤_기록을_오름차순으로_읽고_최신_순번을_준다() {
        assertEquals(0L, repository.latestSeq());
        recorder.rule("A");
        recorder.rule("B");
        recorder.rule("C");
        long latest = repository.latestSeq();

        List<MdmMetaRev> after = repository.findByRevSeqGreaterThanOrderByRevSeqAsc(latest - 2, PageRequest.of(0, 10));

        assertEquals(List.of("B", "C"), after.stream().map(MdmMetaRev::getTargetKey).toList());
        assertEquals(List.of("RULE", "RULE"), after.stream().map(MdmMetaRev::getTargetType).toList());
    }
}
```

- [ ] **Step 3: 실패를 확인한다**

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*MetaRevisionRecorderTest' --console=plain)`
Expected: FAIL — `cannot find symbol: class MetaRevisionRecorder`(컴파일 오류).

- [ ] **Step 4: 엔티티·저장소·열거형·기록기를 만든다**

`L/entity/MdmMetaRev.java`:

```java
package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * MDM 메타 변경 기록 — {@code TB_MDM_META_REV}(spec 2026-10-02-mdm-meta-cache-design §3.1, V17). 쓰기는
 * {@code MetaRevisionRecorder} 의 네이티브 INSERT 가 하고, 이 엔티티는 읽기(metaFeed search)에만 쓴다.
 * {@code REV_SEQ} 는 IDENTITY(불변 규칙 10).
 */
@Entity
@Table(name = "TB_MDM_META_REV")
public class MdmMetaRev extends CactusAuditEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "REV_SEQ")
    private Long revSeq;

    @Column(name = "TARGET_TYPE", length = 20, nullable = false)
    private String targetType;

    @Column(name = "TARGET_KEY", length = 100, nullable = false)
    private String targetKey;

    @Column(name = "CHANGE_KIND", length = 10, nullable = false)
    private String changeKind;

    protected MdmMetaRev() {
        // JPA 기본 생성자
    }

    public Long getRevSeq() { return revSeq; }
    public String getTargetType() { return targetType; }
    public String getTargetKey() { return targetKey; }
    public String getChangeKind() { return changeKind; }
}
```

`L/repository/MdmMetaRevRepository.java`:

```java
package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmMetaRev;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

/** {@code TB_MDM_META_REV} 읽기(spec 2026-10-02-mdm-meta-cache-design §3.4 search). 쓰기는 MetaRevisionRecorder 가 한다. */
public interface MdmMetaRevRepository extends JpaRepository<MdmMetaRev, Long> {

    /** 순번 {@code since} 뒤의 기록, 순번 오름차순. 클라이언트 폴링 한 번. */
    List<MdmMetaRev> findByRevSeqGreaterThanOrderByRevSeqAsc(Long since, Pageable page);

    /** 가장 큰 순번. 기록이 없으면 0. */
    @Query("SELECT COALESCE(MAX(r.revSeq), 0) FROM MdmMetaRev r")
    long latestSeq();
}
```

`L/common/metarev/MetaTargetType.java`:

```java
package com.dongkuk.dmes.mdm.common.metarev;

import java.util.Locale;
import java.util.Optional;

/** 캐시 대상 종류(spec 2026-10-02-mdm-meta-cache-design §4.1) — {@code TB_MDM_META_REV.TARGET_TYPE}·metaFeed {@code type}. */
public enum MetaTargetType {
    COLUMN, DOMAIN, RULE, RULE_SET, CODE, LAYOUT;

    public static Optional<MetaTargetType> parse(String text) {
        if (text == null || text.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(valueOf(text.trim().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
```

`L/common/metarev/MetaChangeKind.java`:

```java
package com.dongkuk.dmes.mdm.common.metarev;

import java.util.Locale;
import java.util.Optional;

/** 변경 종류(spec §3.1) — SAVE 원장 변경, EVICT 화면 삭제, RELOAD 화면 재등록. */
public enum MetaChangeKind {
    SAVE, EVICT, RELOAD;

    public static Optional<MetaChangeKind> parse(String text) {
        if (text == null || text.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(valueOf(text.trim().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
```

`L/common/metarev/MetaRevisionRecorder.java`:

```java
package com.dongkuk.dmes.mdm.common.metarev;

import com.dongkuk.dmes.mdm.common.dictionary.DomainImpactQueries;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeRemoval;
import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import jakarta.persistence.EntityManager;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.hibernate.query.NativeQuery;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * MDM 메타 변경 기록기(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §3.2). 원장 쓰기 서비스가 쓰기 직후
 * "무엇이 바뀌었는지"만 넘기면, 업무 모듈 캐시 키로 펼쳐 {@code TB_MDM_META_REV} 에 쌓는다.
 *
 * <p>트랜잭션: {@link TransactionTemplate}(REQUIRED) 로 감싸 호출자 트랜잭션(OASIS action·서비스 TransactionTemplate)에 합류한다 —
 * 원장이 롤백되면 기록도 롤백된다. 호출자 트랜잭션이 없으면(서비스 직접 호출 시험) 스스로 연다. {@code @Transactional} 은 쓰지 않는다.
 *
 * <p>쓰기는 여러 행 VALUES 네이티브 INSERT 한 문장이다({@link #CHUNK} 행씩). 키 수와 무관하게 SQL 문이 하나라 서비스의 SQL 문 수 가드가
 * 키 수만큼 늘지 않는다(Ruling R1). SQLite·PostgreSQL·MSSQL·Oracle 23ai 가 받는 문법이다(운영 DB 미정 — ADR-0004).
 */
@Component
public class MetaRevisionRecorder {

    static final int CHUNK = 200;
    private static final String INSERT_HEAD = "INSERT INTO TB_MDM_META_REV (TARGET_TYPE, TARGET_KEY, CHANGE_KIND, "
            + "C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER) VALUES ";

    private final EntityManager entityManager;
    private final DomainImpactQueries domainQueries;
    private final MasterCodeRemoval codeRemoval;
    private final MdmNativeAuditSupport audit;
    private final MdmTemporalBinder temporal;
    private final TransactionTemplate tx;

    public MetaRevisionRecorder(EntityManager entityManager, DomainImpactQueries domainQueries, MasterCodeRemoval codeRemoval,
                                MdmNativeAuditSupport audit, MdmTemporalBinder temporal, PlatformTransactionManager transactionManager) {
        this.entityManager = entityManager;
        this.domainQueries = domainQueries;
        this.codeRemoval = codeRemoval;
        this.audit = audit;
        this.temporal = temporal;
        this.tx = new TransactionTemplate(transactionManager);
    }

    /** 강제 기록이 더한 순번 범위. */
    public record MetaRevisionRange(long fromSeq, long toSeq, int count) {
    }

    /** 컬럼 저장 — 두 물리명 모두(같으면 하나). 신규는 {@code oldPhysName} 이 null. */
    public void column(String oldPhysName, String newPhysName) {
        Set<Key> keys = new LinkedHashSet<>();
        add(keys, MetaTargetType.COLUMN, oldPhysName);
        add(keys, MetaTargetType.COLUMN, newPhysName);
        write(keys, MetaChangeKind.SAVE);
    }

    /** 도메인 저장 — 그 도메인 + 하위 도메인 전부 + 그 도메인들을 참조하는 컬럼 전부. */
    public void domain(Long domainId) {
        tx.executeWithoutResult(status -> {
            Set<Key> keys = new LinkedHashSet<>();
            expandDomain(domainId, keys);
            insert(keys, MetaChangeKind.SAVE);
        });
    }

    public void rule(String ruleId) {
        Set<Key> keys = new LinkedHashSet<>();
        add(keys, MetaTargetType.RULE, ruleId);
        write(keys, MetaChangeKind.SAVE);
    }

    public void ruleSet(String setId) {
        Set<Key> keys = new LinkedHashSet<>();
        add(keys, MetaTargetType.RULE_SET, setId);
        write(keys, MetaChangeKind.SAVE);
    }

    /** 마스터코드 — 그 코드 + {@code MARU_CODE_ID} 로 직접 참조하는 도메인 각각의 도메인 펼침. */
    public void code(String maruCodeId) {
        tx.executeWithoutResult(status -> {
            Set<Key> keys = new LinkedHashSet<>();
            add(keys, MetaTargetType.CODE, maruCodeId);
            if (maruCodeId != null && !maruCodeId.isBlank()) {
                for (String domainId : codeRemoval.referencingDomainIds(maruCodeId)) {
                    expandDomain(Long.valueOf(domainId), keys);
                }
            }
            insert(keys, MetaChangeKind.SAVE);
        });
    }

    public void layouts(Collection<Long> layoutIds) {
        Set<Key> keys = new LinkedHashSet<>();
        for (Long id : layoutIds) {
            add(keys, MetaTargetType.LAYOUT, id == null ? null : String.valueOf(id));
        }
        write(keys, MetaChangeKind.SAVE);
    }

    /** 화면 삭제·재등록(spec §3.4 force) — 펼치지 않는다. */
    public MetaRevisionRange force(MetaTargetType type, Collection<String> keys, MetaChangeKind kind) {
        return tx.execute(status -> {
            Set<Key> set = new LinkedHashSet<>();
            for (String k : keys) {
                add(set, type, k);
            }
            int written = insert(set, kind);
            Number max = (Number) entityManager.createNativeQuery("SELECT MAX(REV_SEQ) FROM TB_MDM_META_REV").getSingleResult();
            long to = max == null ? 0L : max.longValue();
            return new MetaRevisionRange(written == 0 ? to : to - written + 1, to, written);
        });
    }

    private void expandDomain(Long domainId, Set<Key> keys) {
        if (domainId == null) {
            return;
        }
        add(keys, MetaTargetType.DOMAIN, String.valueOf(domainId));
        for (DomainImpactQueries.SubtreeRow r : domainQueries.subtree(domainId)) {
            add(keys, MetaTargetType.DOMAIN, String.valueOf(r.domainId()));
            add(keys, MetaTargetType.COLUMN, r.physName());
        }
    }

    private static void add(Set<Key> keys, MetaTargetType type, String key) {
        if (key == null || key.isBlank()) {
            return;
        }
        String k = key.trim();
        keys.add(new Key(type, type == MetaTargetType.COLUMN ? k.toUpperCase(Locale.ROOT) : k));
    }

    private void write(Set<Key> keys, MetaChangeKind kind) {
        if (keys.isEmpty()) {
            return;
        }
        tx.executeWithoutResult(status -> insert(keys, kind));
    }

    /** 호출자 트랜잭션 안에서만 부른다. 돌려주는 값은 넣은 행 수. */
    private int insert(Collection<Key> keys, MetaChangeKind kind) {
        if (keys.isEmpty()) {
            return 0;
        }
        AuditStamp stamp = audit.currentStamp();
        Object at = temporal.toDb(stamp.at());
        List<Key> all = List.copyOf(keys);
        int written = 0;
        for (int from = 0; from < all.size(); from += CHUNK) {
            List<Key> chunk = all.subList(from, Math.min(all.size(), from + CHUNK));
            StringBuilder sql = new StringBuilder(INSERT_HEAD);
            for (int i = 0; i < chunk.size(); i++) {
                sql.append(i == 0 ? "" : ", ").append("(:t").append(i).append(", :k").append(i)
                        .append(", :kind, :usr, :at, :svc, :pgm, :usr, :at, :svc, :pgm, 0)");
            }
            NativeQuery<?> q = entityManager.createNativeQuery(sql.toString()).unwrap(NativeQuery.class);
            for (int i = 0; i < chunk.size(); i++) {
                q.setParameter("t" + i, chunk.get(i).type().name());
                q.setParameter("k" + i, chunk.get(i).key());
            }
            q.setParameter("kind", kind.name());
            q.setParameter("usr", stamp.userId(), String.class);
            q.setParameter("svc", stamp.serviceId(), String.class);
            q.setParameter("pgm", stamp.programId(), String.class);
            q.setParameter("at", at);
            written += q.executeUpdate();
        }
        return written;
    }

    private record Key(MetaTargetType type, String key) {
    }
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*MetaRevisionRecorderTest' --tests '*MdmBusinessRuleMigrationTest' --console=plain)`
Expected: PASS. 두 번째는 V17 이 기존 마이그레이션 시험(빈 DB 전체 적용)을 깨지 않음을 본다.

- [ ] **Step 6: 정적 가드가 그대로인지 확인한다**

Run: `(cd src/backend/mdm && ../gradlew :lib:test --tests '*ArchitectureTest' --tests '*StaticGuardTest' --console=plain)`
Expected: PASS(기록기는 `common.metarev` 에 있어 `DomainMngStaticGuardTest` 의 TransactionTemplate 금지 패키지 밖이다).

- [ ] **Step 7: 커밋**

```bash
/usr/bin/git add src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V17__create_mdm_meta_rev.sql \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmMetaRev.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/repository/MdmMetaRevRepository.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/metarev \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/metarev
/usr/bin/git commit -m "$(cat <<'EOF'
feat(mdm): 메타 변경 기록 표 TB_MDM_META_REV 와 키를 펼쳐 쌓는 기록기를 더한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 기록 지점 1 — 컬럼(물리명 변경 전후)·도메인·전문(레이아웃·헤더)

**Files:**
- Modify: `L/dma/columnMng/service/ColumnMngService.java:74-92`(필드·생성자), `:303-324`(save 7단계)
- Modify: `L/dma/domainMng/service/DomainMngService.java:65-94`(필드·생성자), `:262-263`(save 반환 앞)
- Modify: `L/dmb/layoutMng/service/LayoutMngService.java:78-103`(필드·생성자), `:315`(versioner.record 뒤)
- Modify: `L/dmb/headerMng/service/HeaderMngService.java:63-83`(필드·생성자), `:283-285`(recordAll 뒤)
- Test: `AT/dma/columnMng/ColumnMngServiceSqliteTest.java`(시험 3개 추가), `AT/dma/domainMng/DomainMngMetaRevisionTest.java`(새), `AT/dmb/layoutMng/LayoutMngServiceSqliteTest.java`(1개 추가), `AT/dmb/headerMng/HeaderMngServiceSqliteTest.java`(1개 추가)
- Modify: `AT/dmb/headerMng/HeaderMngQueryCountTest.java:121`(상한 +1)

**Interfaces:**
- Consumes: Task 1 `MetaRevisionRecorder.column(String, String)`·`domain(Long)`·`layouts(Collection<Long>)`, `MetaRevTestSupport.clear/rows/keys`.
- Produces: 컬럼·도메인·전문 저장이 같은 트랜잭션에 기록을 남긴다(다음 태스크가 기대는 공개 시그니처 변화 없음 — 생성자에 `MetaRevisionRecorder recorder` 가 마지막 인자로 붙는다).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`AT/dma/columnMng/ColumnMngServiceSqliteTest.java` — import 에 `import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;` 를 더하고, `// ── save ──` 절 끝(`C2_` 앞이 아니라 클래스의 save 시험 묶음 마지막)에 넣는다:

```java
    // ── 메타 변경 기록(spec 2026-10-02-mdm-meta-cache-design §3.3) ──────────

    @Test
    void META_신규_저장은_새_물리명을_기록한다() {
        MetaRevTestSupport.clear(jdbc);
        save(valid(), List.of(), List.of());
        assertEquals(List.of("COLUMN:RMTL_COIL_THK:SAVE"), MetaRevTestSupport.rows(jdbc));
    }

    @Test
    void META_물리명을_바꾸면_옛_이름과_새_이름을_모두_기록한다() {
        Long id = save(other("코일 두께", "COIL_THK"), List.of(), List.of());
        MetaRevTestSupport.clear(jdbc);
        ColumnMngSaveRequest renamed = other("원재료 코일 두께", "RMTL_COIL_THK");
        renamed.setColumnId(id);

        save(renamed, List.of(), List.of());

        assertEquals(List.of("COLUMN:COIL_THK:SAVE", "COLUMN:RMTL_COIL_THK:SAVE"), MetaRevTestSupport.rows(jdbc));
    }

    @Test
    void META_원장이_롤백되면_기록도_남지_않는다() {
        MetaRevTestSupport.clear(jdbc);
        tx.executeWithoutResult(s -> {
            service.save(valid(), List.of(), List.of());
            s.setRollbackOnly();
        });
        assertEquals(0, count("TB_MDM_COLUMN"));
        assertEquals(List.of(), MetaRevTestSupport.rows(jdbc));
    }
```

`AT/dma/domainMng/DomainMngMetaRevisionTest.java`(새):

```java
package com.dongkuk.dmes.mdm.dma.domainMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.dma.domainMng.dto.DomainDraftRequest;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** spec 2026-10-02-mdm-meta-cache-design §3.3 — 도메인 저장이 그 도메인·하위 도메인·참조 컬럼을 같은 트랜잭션에 기록한다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import({DomainMngTestConfig.Functions.class, DomainMngTestConfig.Codes.class})
class DomainMngMetaRevisionTest extends DomainMngApiSupport {

    @Autowired
    PlatformTransactionManager transactionManager;

    @BeforeEach
    void setUp() {
        fixtures();
    }

    private Long qty(Consumer<DomainDraftRequest> edit) {
        return saveOk(req(r -> {
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setUnitCode("mm");
            r.setLength(10);
            edit.accept(r);
        }));
    }

    /** 저장된 행 그대로의 초안 + edit(DomainMngParentLinkTest.stored 와 같은 모양). */
    private DomainDraftRequest stored(Long id, Consumer<DomainDraftRequest> edit) {
        Map<String, Object> row = row(id);
        DomainDraftRequest r = new DomainDraftRequest();
        r.setDomainId(id);
        r.setVer(ver(id));
        r.setDomainName((String) row.get("DOMAIN_NAME"));
        r.setStdName((String) row.get("STD_NAME"));
        r.setParentDomainId(row.get("PARENT_DOMAIN_ID") == null ? null : ((Number) row.get("PARENT_DOMAIN_ID")).longValue());
        r.setDomainKind((String) row.get("DOMAIN_KIND"));
        r.setDataType((String) row.get("DATA_TYPE"));
        r.setLength(row.get("LENGTH") == null ? null : ((Number) row.get("LENGTH")).intValue());
        r.setScale(row.get("SCALE") == null ? null : ((Number) row.get("SCALE")).intValue());
        r.setUnitCode((String) row.get("UNIT_CODE"));
        r.setMaruCodeId((String) row.get("MARU_CODE_ID"));
        r.setCateId((String) row.get("CATE_ID"));
        r.setStdRule((String) row.get("STD_RULE"));
        r.setBizRule((String) row.get("BIZ_RULE"));
        r.setDescription((String) row.get("DESCRIPTION"));
        edit.accept(r);
        return r;
    }

    @Test
    void 새_도메인_저장은_그_도메인을_기록한다() {
        MetaRevTestSupport.clear(jdbc);
        Long id = qty(r -> { });
        assertEquals(List.of("DOMAIN:" + id + ":SAVE"), MetaRevTestSupport.rows(jdbc));
    }

    @Test
    void 부모를_다시_저장하면_하위_도메인과_참조_컬럼까지_기록한다() {
        Long parent = qty(r -> r.setStdRule("value >= 0"));
        Long child = saveOk(req(r -> {
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setParentDomainId(parent);
        }));
        String phys = uniq("MRD_COL");
        jdbc.update("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID, REQUIRED, CHG_SEQ) VALUES (?, ?, ?, 0, 0)",
                phys, phys, child);
        MetaRevTestSupport.clear(jdbc);

        service.save(stored(parent, r -> r.setDescription("설명 바꿈")), List.of(), List.of());

        assertEquals(Set.of(String.valueOf(parent), String.valueOf(child)), MetaRevTestSupport.keys(jdbc, "DOMAIN"));
        assertTrue(MetaRevTestSupport.keys(jdbc, "COLUMN").contains(phys), MetaRevTestSupport.rows(jdbc).toString());
    }

    @Test
    void 원장이_롤백되면_도메인_기록도_남지_않는다() {
        MetaRevTestSupport.clear(jdbc);
        int before = rowCount();
        new TransactionTemplate(transactionManager).executeWithoutResult(s -> {
            service.save(req(r -> {
                r.setDomainKind("QTY");
                r.setDataType("NUMBER");
                r.setUnitCode("mm");
                r.setLength(10);
            }), List.of(), List.of());
            s.setRollbackOnly();
        });
        assertEquals(before, rowCount());
        assertEquals(List.of(), MetaRevTestSupport.rows(jdbc));
    }
}
```

`AT/dmb/layoutMng/LayoutMngServiceSqliteTest.java` — import `com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport` 를 더하고 시험 하나를 넣는다:

```java
    @Test
    void META_전문_저장은_그_전문을_기록한다() {
        MetaRevTestSupport.clear(jdbc);
        M201 m = m201();
        assertTrue(MetaRevTestSupport.keys(jdbc, "LAYOUT").contains(String.valueOf(m.message())), MetaRevTestSupport.rows(jdbc).toString());
    }
```

`AT/dmb/headerMng/HeaderMngServiceSqliteTest.java` — import `com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport` 와 (없으면) `java.util.Set` 을 더하고 시험 하나를 넣는다:

```java
    @Test
    void META_헤더_저장은_헤더와_그_헤더를_쌓은_전문을_모두_기록한다() {
        M201 m = m201();
        MetaRevTestSupport.clear(jdbc);

        headerService.save(resave(m.l110()), numbered(l110Items()));

        assertEquals(Set.of(String.valueOf(m.l110()), String.valueOf(m.message())), MetaRevTestSupport.keys(jdbc, "LAYOUT"));
    }
```

- [ ] **Step 2: 실패를 확인한다**

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*ColumnMngServiceSqliteTest' --tests '*DomainMngMetaRevisionTest' --tests '*LayoutMngServiceSqliteTest' --tests '*HeaderMngServiceSqliteTest' --console=plain)`
Expected: FAIL — 새 `META_*`·`DomainMngMetaRevisionTest` 시험이 `expected: <[COLUMN:RMTL_COIL_THK:SAVE]> but was: <[]>` 같은 빈 기록으로 실패한다. 기존 시험은 통과한다.

- [ ] **Step 3: 기록 호출을 넣는다**

`ColumnMngService` — import `com.dongkuk.dmes.mdm.common.metarev.MetaRevisionRecorder;`, 필드 `private final MetaRevisionRecorder recorder;`, 생성자 마지막 인자로 받는다:

```java
    public ColumnMngService(MdmColumnRepository columnRepository, MdmColumnSystemRepository columnSystemRepository,
                            MdmDomainRepository domainRepository, MdmTermRepository termRepository, JdbcTemplate jdbc,
                            MdmStdAdminGuard guard, ObjectProvider<MaruIdNamespace> maruIdNamespaces,
                            MetaRevisionRecorder recorder) {
        this.columnRepository = columnRepository;
        this.columnSystemRepository = columnSystemRepository;
        this.domainRepository = domainRepository;
        this.termRepository = termRepository;
        this.jdbc = jdbc;
        this.guard = guard;
        this.maruIdNamespaces = maruIdNamespaces;
        this.recorder = recorder;
    }
```

save 7단계를 바꾼다(변경 전 물리명은 setter 앞에서 읽는다 — `:309` 뒤에는 관리 엔티티가 이미 바뀌어 있다):

```java
        // 7. 컬럼 저장
        MdmColumn column;
        String oldPhysName = null;
        if (selfId == null) {
            column = new MdmColumn(columnName, physName, req.getDomainId());
        } else {
            column = columnRepository.findById(selfId).orElseThrow(() -> invalid("컬럼을 찾을 수 없습니다"));
            oldPhysName = column.getPhysName(); // 메타 캐시 무효화 — 물리명 변경 전 이름(spec 2026-10-02 §3.3)
            column.setColumnName(columnName);
            column.setPhysName(physName);
            column.setDomainId(req.getDomainId());
        }
```

`Long columnId = column.getColumnId();` 바로 아래에:

```java
        recorder.column(oldPhysName, physName);
```

`DomainMngService` — import `com.dongkuk.dmes.mdm.common.metarev.MetaRevisionRecorder;`, 필드 `private final MetaRevisionRecorder recorder;`, 생성자 마지막 인자 `MetaRevisionRecorder recorder` + `this.recorder = recorder;`. save 에서 하위 재검사 블록 뒤(`Map<String, Object> out = new LinkedHashMap<>();` 바로 앞)에:

```java
        // 5 메타 캐시 무효화 — 이 도메인·하위 도메인·참조 컬럼(spec 2026-10-02 §3.2). 같은 트랜잭션이라 위에서 던지면 남지 않는다
        recorder.domain(entity.getDomainId());
```

`LayoutMngService` — import, 필드, 생성자 마지막 인자 `MetaRevisionRecorder recorder`. save 의 `LayoutVersioner.Outcome v = versioner.record(messageId);` 바로 아래에:

```java
        recorder.layouts(List.of(messageId)); // 메타 캐시 무효화(spec 2026-10-02 §3.3)
```

`HeaderMngService` — import, 필드, 생성자 마지막 인자 `MetaRevisionRecorder recorder`. `List<LayoutVersioner.Outcome> outcomes = versioner.recordAll(...);` 문장 바로 아래에:

```java
        // 메타 캐시 무효화 — 헤더 자신과 recalculateUsers 가 돌려준 사용 전문 전부(spec 2026-10-02 §3.3)
        List<Long> touched = new ArrayList<>();
        touched.add(headerId);
        recalculated.forEach(r -> touched.add(((Number) r.get("LAYOUT_ID")).longValue()));
        recorder.layouts(touched);
```

(`ArrayList` 는 이미 import 돼 있다 — `versioned` 가 쓴다.)

`AT/dmb/headerMng/HeaderMngQueryCountTest.java:121` — 기록 INSERT 한 문장이 늘었다(키 수와 무관, Ruling R1). 차이 단언(`4 * 11`·`4 * 3`)은 그대로 두고 상한만 1씩 올린다:

```java
        // 2026-10-02 메타 변경 기록 INSERT 1문(헤더 + 사용 전문, 키 수와 무관 — MetaRevisionRecorder Ruling R1)
        assertTrue(counts.get("len2") <= 64 && counts.get("phys2") <= 65 && counts.get("same2") <= 47, counts::toString);
```

- [ ] **Step 4: 통과를 확인한다**

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*ColumnMng*' --tests '*DomainMng*' --tests '*LayoutMng*' --tests '*HeaderMng*' --console=plain && ../gradlew :lib:test --tests '*StaticGuardTest' --tests '*ArchitectureTest' --console=plain)`
Expected: PASS(기존 시험 포함 — 서비스 생성자 인자가 늘어도 스프링이 주입한다. `new …Service(` 를 쓰는 곳은 없다). lib 의 정적 가드(`DomainMngStaticGuardTest`·`LayoutStaticGuardTest` 등)는 고친 `dma.domainMng`·`dmb` 클래스가 `TransactionTemplate`·`@Transactional` 에 기대지 않음을 본다 — 기록기 의존은 허용된다.

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/columnMng/service/ColumnMngService.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/domainMng/service/DomainMngService.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layoutMng/service/LayoutMngService.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/headerMng/service/HeaderMngService.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/columnMng/ColumnMngServiceSqliteTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/domainMng/DomainMngMetaRevisionTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/layoutMng/LayoutMngServiceSqliteTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/headerMng/HeaderMngServiceSqliteTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/headerMng/HeaderMngQueryCountTest.java
/usr/bin/git commit -m "$(cat <<'EOF'
feat(mdm): 컬럼·도메인·전문 저장이 메타 변경 기록을 같은 트랜잭션에 남긴다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 기록 지점 2 — 룰·룰세트·마스터코드(공통 확정·확정 취소 포함)

**Files:**
- Modify: `L/common/version/DefaultVersionStateService.java:48-66`(필드·생성자), `:113`(confirm 반환 앞), `:161`(cancelConfirm 끝)
- Modify: `L/dme/ruleMng/service/RuleHeaderService.java:55-75`(필드·생성자), `:95-104`(saveHeader 람다), `:158-161`(deprecate 람다)
- Modify: `L/dme/ruleSetMng/service/RuleSetMngService.java:50-63`, `:170-174`
- Modify: `L/dme/ruleSetEdit/service/RuleSetEditService.java:89-114`, `:243-247`(save), `:259-263`(delete), `:289-291`(restore)
- Modify: `L/dmc/codeEdit/service/CodeEditService.java:79-108`, `:186-188`(saveHeader), `:212-214`(deprecate), `:331-332`(deleteCode)
- Modify: `L/dmc/codeItemEdit/service/CodeItemEditService.java:92-110`, `:407`(patch)
- Test: `AT/dme/ruleConfirm/RuleConfirmServiceTest.java`, `AT/dme/ruleMng/RuleHeaderServiceTest.java`, `AT/dme/ruleSetMng/RuleSetMngServiceTest.java`, `AT/dme/ruleSetEdit/RuleSetEditServiceTest.java`, `AT/dmc/codeConfirm/CodeConfirmServiceSqliteTest.java`, `AT/dmc/codeEdit/CodeEditHeaderSqliteTest.java`, `AT/dmc/codeItemEdit/CodeItemEditServiceSqliteTest.java`

**Interfaces:**
- Consumes: Task 1 `MetaRevisionRecorder.rule(String)`·`ruleSet(String)`·`code(String)`, `MetaRevTestSupport`. `VersionRef(VersionTarget target, String objectId, BigDecimal ver)`, `VersionTarget { MASTER_CODE, BUSINESS_RULE }`(`L/contract/version/`).
- Produces: 룰·룰세트·코드의 RELEASED 에 영향을 주는 모든 쓰기가 기록을 남긴다. 기록하지 않는 경로(근거): `CodeCateEditService.save·revert`(DRAFT 전용 — `beginDraftWrite`, `CodeCateEditService.java:235·254`), `RuleVersionService`(RELEASED 경로는 `cancelConfirm` 하나이고 `DefaultVersionStateService` 로 위임 — 이중 기록 방지, `RuleVersionService.java:162-168`), `RuleMngService.register`·ruleEdit 표 저장(DRAFT 만).

- [ ] **Step 1: 실패하는 시험을 쓴다**

각 파일에 import `com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;` 를 더한다.

`AT/dme/ruleConfirm/RuleConfirmServiceTest.java` — 필드 `@Autowired org.springframework.transaction.PlatformTransactionManager transactionManager;` 를 더하고 S6_S9 시험 아래에 넣는다:

```java
    // ------------------------------------------------------------------ 메타 변경 기록(spec 2026-10-02 §3.3)

    @Test
    void META_확정은_룰을_기록한다() {
        MetaRevTestSupport.clear(jdbc);
        service.confirm(confirm(Q, 2, 0L, "2026-03-01 00:00:00", true));
        assertEquals(List.of("RULE:" + Q + ":SAVE"), MetaRevTestSupport.rows(jdbc));
    }

    @Test
    void META_확정이_바깥_트랜잭션과_함께_롤백되면_기록도_없다() {
        MetaRevTestSupport.clear(jdbc);
        new org.springframework.transaction.support.TransactionTemplate(transactionManager).executeWithoutResult(s -> {
            service.confirm(confirm(NEW, 1, 0L, "2026-06-15 09:00:00", true));
            s.setRollbackOnly();
        });
        assertEquals("DRAFT", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = ? AND VER = 1", String.class, NEW));
        assertEquals(List.of(), MetaRevTestSupport.rows(jdbc));
    }
```

`AT/dme/ruleMng/RuleHeaderServiceTest.java` — 헤더 저장 시험 묶음 끝에:

```java
    @Test
    void META_헤더_저장과_폐기는_룰을_기록한다() {
        MetaRevTestSupport.clear(jdbc);
        service.saveHeader(header(jdbc, "QLTY_GRD_JDG", "메타 기록"));
        service.deprecate(ruleTarget("QLTY_GRD_JDG"));
        assertEquals(List.of("RULE:QLTY_GRD_JDG:SAVE", "RULE:QLTY_GRD_JDG:SAVE"), MetaRevTestSupport.rows(jdbc));
    }
```

`AT/dme/ruleSetMng/RuleSetMngServiceTest.java` — 등록 시험 묶음 끝에:

```java
    @Test
    void META_등록은_룰_세트를_기록한다() {
        MetaRevTestSupport.clear(jdbc);
        service.register(regReq("S_META", "메타 세트", null));
        assertEquals(List.of("RULE_SET:S_META:SAVE"), MetaRevTestSupport.rows(jdbc));
    }
```

`AT/dme/ruleSetEdit/RuleSetEditServiceTest.java` — 되살리기 절 끝에:

```java
    @Test
    void META_저장_폐기_되살리기는_룰_세트를_기록한다() {
        MetaRevTestSupport.clear(jdbc);
        service.save(saveReq("S_CHAIN", "사슬 세트", null, 3L, "R_GRD", "R_DUP", "R_FCT"));
        service.delete(statusReq("S_CYC", 1L));
        service.restore(statusReq("S_OLD", 2L));
        assertEquals(List.of("RULE_SET:S_CHAIN:SAVE", "RULE_SET:S_CYC:SAVE", "RULE_SET:S_OLD:SAVE"), MetaRevTestSupport.rows(jdbc));
    }

    @Test
    void META_거부된_저장은_기록하지_않는다() {
        MetaRevTestSupport.clear(jdbc);
        refuse(() -> service.save(saveReq("S_CHAIN", "사슬 세트", null, 2L, "R_GRD")));
        assertEquals(List.of(), MetaRevTestSupport.rows(jdbc));
    }
```

`AT/dmc/codeConfirm/CodeConfirmServiceSqliteTest.java` — 확정 성공 시험(`:384` 부근) 아래에:

```java
    @Test
    void META_코드_확정은_코드를_기록한다() {
        seedM();
        MetaRevTestSupport.clear(jdbc);
        service.confirm(confirm("M", "1.001", RV, "2026-08-01 00:00:00", false));
        assertEquals(List.of("CODE:M:SAVE"), MetaRevTestSupport.rows(jdbc));
    }
```

`AT/dmc/codeEdit/CodeEditHeaderSqliteTest.java` — E7 아래에:

```java
    @Test
    void META_폐기는_코드를_기록한다() {
        seeds.seedCode("PROC_CD", "INUSE", "MDM");
        seeds.released("PROC_CD", "1.000", PAST, OPEN_END);
        seeds.seedItem("PROC_CD", "A", "1.000", OPEN, "a", 1);
        seeds.seedBase("PROC_CD");
        MetaRevTestSupport.clear(jdbc);

        tx.execute(s -> service.deprecate(deprecateReq("PROC_CD", 0L)));

        assertEquals(List.of("CODE:PROC_CD:SAVE"), MetaRevTestSupport.rows(jdbc));
    }
```

`AT/dmc/codeItemEdit/CodeItemEditServiceSqliteTest.java` — `S13_경미_수정은_이름_약칭_순서_설명만_바꾼다`(`:300-314`) 아래에(같은 픽스처·요청):

```java
    @Test
    void META_경미_수정은_코드를_기록한다() {
        seedM();
        MetaRevTestSupport.clear(jdbc);
        service.patch(patch("M", "A", "1.000", "고친 에이", "약칭", 11, "설명"));
        assertEquals(List.of("CODE:M:SAVE"), MetaRevTestSupport.rows(jdbc));
    }
```

- [ ] **Step 2: 실패를 확인한다**

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleConfirmServiceTest' --tests '*RuleHeaderServiceTest' --tests '*RuleSetMngServiceTest' --tests '*RuleSetEditServiceTest' --tests '*CodeConfirmServiceSqliteTest' --tests '*CodeEditHeaderSqliteTest' --tests '*CodeItemEditServiceSqliteTest' --console=plain)`
Expected: FAIL — `META_*` 시험이 빈 기록으로 실패(`META_거부된_저장은_기록하지_않는다`·`META_확정이_바깥_트랜잭션과_함께_롤백되면_기록도_없다` 는 지금도 통과할 수 있다 — 구현 뒤에도 통과해야 한다).

- [ ] **Step 3: 기록 호출을 넣는다**

`DefaultVersionStateService` — import `com.dongkuk.dmes.mdm.common.metarev.MetaRevisionRecorder;`, 필드 `private final MetaRevisionRecorder recorder;`, 생성자:

```java
    public DefaultVersionStateService(PlatformTransactionManager transactionManager, VersionRowStore store,
                                      MdmCurrentUser currentUser, ApplyFromOrderCheck applyFromOrderCheck,
                                      VersionSpiRegistry spis, MdmNativeAuditSupport audit, Clock clock,
                                      MetaRevisionRecorder recorder) {
        this.tx = new TransactionTemplate(transactionManager);
        this.store = store;
        this.pre = new VersionPreconditions(currentUser, store);
        this.applyFromOrderCheck = applyFromOrderCheck;
        this.spis = spis;
        this.audit = audit;
        this.clock = clock;
        this.recorder = recorder;
    }
```

confirm 람다의 `return new ConfirmResult(...)` 바로 앞에 `record(ref);`, cancelConfirm 람다 끝(`// D8-8` 주석 다음 줄)에 `record(released);` 를 넣고, 클래스 끝에 메서드를 더한다:

```java
    /** 메타 캐시 무효화(spec 2026-10-02 §3.3) — 확정·확정 취소는 룰·코드 공통이라 여기 한 곳에서 기록한다. 호출하는 쪽에 또 걸면 이중 기록이다. */
    private void record(VersionRef ref) {
        switch (ref.target()) {
            case BUSINESS_RULE -> recorder.rule(ref.objectId());
            case MASTER_CODE -> recorder.code(ref.objectId());
        }
    }
```

`RuleHeaderService` — import·필드·생성자 마지막 인자 `MetaRevisionRecorder recorder`. saveHeader 람다:

```java
        MdmRule saved = tx.execute(status -> {
            MdmRule target = ruleRepository.findById(rule.getMaruRuleId()).orElseThrow();
            requireAuditVer(target, expected); // 잠금 확인은 트랜잭션 안, 쓰기 앞에서
            target.setMaruRuleName(name);
            target.setDescription(blankToNull(request.getDescription()));
            target.setUsageNote(blankToNull(request.getUsageNote()));
            MdmRule out = ruleRepository.saveAndFlush(target);
            promoteIfApplied(rule, versions, now);
            recorder.rule(rule.getMaruRuleId()); // 메타 캐시 무효화(spec 2026-10-02 §3.3)
            return out;
        });
```

deprecate 람다:

```java
        Integer changed = tx.execute(status -> {
            promoteIfApplied(rule, versions, now); // 폐기 UPDATE 가 STATUS = 'INUSE' 를 조건으로 쓴다
            int n = writes.deprecate(rule.getMaruRuleId());
            if (n > 0) {
                recorder.rule(rule.getMaruRuleId()); // 메타 캐시 무효화(spec 2026-10-02 §3.3)
            }
            return n;
        });
```

`RuleSetMngService` — import·필드·생성자 마지막 인자. register 람다:

```java
        tx.executeWithoutResult(status -> {
            MdmRuleSet set = new MdmRuleSet(id, name, "[]");
            set.setDescription(blankToNull(request.getDescription()));
            setRepository.saveAndFlush(set);
            recorder.ruleSet(id); // 메타 캐시 무효화(spec 2026-10-02 §3.3)
        });
```

`RuleSetEditService` — import·필드·생성자 마지막 인자. save·delete 람다:

```java
        tx.executeWithoutResult(status -> {
            if (writes.update(setId, name, DomainJson.write(ids), flowJson, description, rv) == 0) {
                throw writeMissed(setId, rv, INUSE);
            }
            recorder.ruleSet(setId); // 메타 캐시 무효화(spec 2026-10-02 §3.3)
        });
```

```java
        tx.executeWithoutResult(status -> {
            if (writes.deprecate(setId, rv) == 0) {
                throw writeMissed(setId, rv, INUSE);
            }
            recorder.ruleSet(setId); // 메타 캐시 무효화(spec 2026-10-02 §3.3)
        });
```

restore 람다의 `if (writes.restore(setId, rv) == 0) { throw writeMissed(setId, rv, DEPRECATED); }` 바로 아래에:

```java
            recorder.ruleSet(setId); // 메타 캐시 무효화(spec 2026-10-02 §3.3)
```

`CodeEditService` — import·필드·생성자 마지막 인자 `MetaRevisionRecorder recorder`. saveHeader 의 `markInUseIfApplied(code, summary); // I18` 다음 줄, deprecate 의 `code.setStatus(MaruObjectStatus.DEPRECATED.name());` 다음 줄에 각각:

```java
        recorder.code(code.getMaruCodeId()); // 메타 캐시 무효화(spec 2026-10-02 §3.3)
```

deleteCode 의 `entityManager.flush();` 다음 줄에:

```java
        recorder.code(id); // 메타 캐시 무효화 — 지운 코드의 "없음" 캐시도 다시 확인하게 한다
```

`CodeItemEditService` — import·필드·생성자 마지막 인자. patch 의 `MdmCodeItem saved = itemRepository.saveAndFlush(target);` 다음 줄에:

```java
        recorder.code(id); // RELEASED 행 제자리 수정 — 메타 캐시 무효화(spec 2026-10-02 §3.3)
```

- [ ] **Step 4: 통과를 확인한다**

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleConfirm*' --tests '*RuleHeader*' --tests '*RuleVersion*' --tests '*RuleSetMng*' --tests '*RuleSetEdit*' --tests '*CodeConfirm*' --tests '*CodeEdit*' --tests '*CodeItemEdit*' --tests '*VersionStateService*' --console=plain && ../gradlew :lib:test --tests '*StaticGuardTest' --tests '*ArchitectureTest' --console=plain)`
Expected: PASS(기존 SQL 문 수 가드 `RuleConfirmQueryCountTest`(validate)·`CodeItemEditQueryCountTest`(save = DRAFT)·`RuleSetEditQueryCountTest`(view·validate·execute)는 기록 경로를 지나지 않는다).

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/version/DefaultVersionStateService.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleMng/service/RuleHeaderService.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetMng/service/RuleSetMngService.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetEditService.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmc/codeEdit/service/CodeEditService.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmc/codeItemEdit/service/CodeItemEditService.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmc
/usr/bin/git commit -m "$(cat <<'EOF'
feat(mdm): 룰·룰 세트·마스터코드 확정과 원장 쓰기가 메타 변경 기록을 남긴다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 4: metaFeed 1 — BPMN `feed/metaFeed`(search·view)와 컬럼·도메인 메타 조립

**Files:**
- Create: `A/resources/services/feed/metaFeed.bpmn`
- Create: `L/feed/metaFeed/dto/MetaFeedSearchRequest.java`, `L/feed/metaFeed/dto/MetaFeedViewRequest.java`
- Create: `L/feed/metaFeed/service/MetaFeedService.java`, `MetaFeedDictionary.java`, `MetaFeedPayloads.java`, `MetaFeedResult.java`, `MetaFeedJson.java`
- Modify: `AT/MdmOasisActionVocabularyTest.java`(BPMN 수 23 → 24, metaFeed 는 화면 RBAC 대상에서 뺀다, metaFeed action 어휘 시험)
- Test: `AT/feed/MetaFeedOasisHttpTest.java`(새)

**Interfaces:**
- Consumes: Task 1 `MdmMetaRevRepository.findByRevSeqGreaterThanOrderByRevSeqAsc(Long, Pageable)`·`latestSeq()`, `MetaTargetType.parse(String)`, `MetaRevTestSupport`. 조립 재사용: `DomainTreeReader.load()` → `DomainTreeSnapshot`, `DomainTreeSnapshot.find(Long)`·`chainRootFirst(Long)`(순환이면 `DomainTreeSnapshot.CycleException`), `DomainChainAssembler.assemble(List<DomainNode>)` → `EffectiveDomainView(domainId, domainKind, dataType, length, scale, unitCode, codeRef, chainStdExpr, stdExpr, stdAst, bizExpr, bizAst, bizRequiredVars)`, `EffectiveExpressions.ast(List<Map<String,Object>>)`, `MdmColumnRepository.findByPhysNameIn(Collection<String>)`, `MdmErrors.of(MdmErrorCode, String, List)`.
- Produces:
  - 빈 `metaFeedService`(`MetaFeedService`): `Map<String,Object> search(MetaFeedSearchRequest)`, `Map<String,Object> view(MetaFeedViewRequest, List<Map<String,Object>> keys)`, 패키지 메서드 `MetaFeedResult fetch(MetaTargetType, List<String>)`(Task 5 가 RULE·RULE_SET·CODE·LAYOUT 분기를 채운다)
  - `MetaFeedResult(Map<String,Object> found, Map<String,String> failed)` + `toResponse()` + `static empty()`
  - `MetaFeedJson.plain(Object) → Object`
  - `MetaFeedPayloads.ColumnMeta`·`DomainRef`·`Expr`·`BizExpr`·`CodeRefMeta`·`DomainMeta`(계약 표의 필드 이름 그대로)
  - 빈 `MetaFeedDictionary`: `MetaFeedResult columns(Collection<String> physNames)`, `MetaFeedResult domains(Collection<String> domainIds)`
  - 시험 도우미(MetaFeedOasisHttpTest 안): `post(String action, String role, ObjectNode body)`, `body(ObjectNode params, String... keys)`, `view(String type, String... keys)`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`AT/feed/MetaFeedOasisHttpTest.java`:

```java
package com.dongkuk.dmes.mdm.feed;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import javax.sql.DataSource;
import kr.dongkuk.maru.mdm.engine.expr.AstExporter;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * spec 2026-10-02-mdm-meta-cache-design §3.4·§7 「MDM metaFeed」 — BPMN 까지 태우는 HTTP 파이프(DmeOasisHttpTest 형식). 업무 모듈
 * 클라이언트와 같은 헤더(system:{module}, SYSTEM)로 부른다. 키 목록은 params 가 아니라 grids.keys.rows 다(params 배열 금지).
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + MetaFeedOasisHttpTest.TEST_CLIENT_KEY)
@ActiveProfiles("local")
class MetaFeedOasisHttpTest {

    static final String TEST_CLIENT_KEY = "mdm-feed-test-client-key";

    @TempDir
    static Path tempDir;

    @LocalServerPort
    int port;

    @Autowired
    DataSource dataSource;
    @Autowired
    MdmEvaluator evaluator;

    private final HttpClient client = HttpClient.newHttpClient();
    private final ObjectMapper json = new ObjectMapper();
    private JdbcTemplate jdbc;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-feed-http-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        MetaRevTestSupport.clear(jdbc);
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        new MasterCodeSeeds(jdbc).clear();
    }

    // ------------------------------------------------------------------ search(changes)

    @Test
    void search_는_순번_뒤_변경을_limit_만큼_주고_넘치면_truncated_다() throws Exception {
        for (String key : new String[] {"A", "B", "C"}) {
            jdbc.update("INSERT INTO TB_MDM_META_REV (TARGET_TYPE, TARGET_KEY, CHANGE_KIND) VALUES ('COLUMN', ?, 'SAVE')", key);
        }
        long first = jdbc.queryForObject("SELECT MIN(REV_SEQ) FROM TB_MDM_META_REV", Long.class);

        JsonNode page = result(post("search", "SYSTEM", body(json.createObjectNode().put("since", first - 1).put("limit", 2))));

        assertEquals(first + 2, page.path("latestSeq").asLong(), page.toString());
        assertTrue(page.path("truncated").asBoolean(), page.toString());
        assertEquals(2, page.path("items").size());
        JsonNode item = page.path("items").get(0);
        assertEquals(first, item.path("seq").asLong());
        assertEquals("COLUMN", item.path("type").asText());
        assertEquals("A", item.path("key").asText());
        assertEquals("SAVE", item.path("kind").asText());

        JsonNode rest = result(post("search", "SYSTEM", body(json.createObjectNode().put("since", first + 1))));
        assertFalse(rest.path("truncated").asBoolean(true), rest.toString());
        assertEquals(1, rest.path("items").size());
        assertEquals("C", rest.path("items").get(0).path("key").asText());
    }

    @Test
    void search_는_기록이_없으면_latestSeq_0_과_빈_목록이다() throws Exception {
        JsonNode page = result(post("search", "SYSTEM", body(json.createObjectNode().put("since", 0))));
        assertEquals(0L, page.path("latestSeq").asLong(), page.toString());
        assertEquals(0, page.path("items").size());
        assertFalse(page.path("truncated").asBoolean(true));
    }

    // ------------------------------------------------------------------ view COLUMN·DOMAIN

    @Test
    void view_COLUMN_은_컬럼_속성과_상속된_파생값과_유효_표준식을_주고_없는_키는_뺀다() throws Exception {
        long parent = domain("FD_THK_P", "QTY", "NUMBER", 10, 2, null, "value >= 0");
        long child = domain("FD_THK_C", "QTY", "NUMBER", null, null, parent, "value <= 100");
        jdbc.update("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID, LABEL_MID, DESCRIPTION, REQUIRED, DEFAULT_VALUE) "
                + "VALUES ('코일 두께', 'COIL_THK', ?, '두께', '설명', 1, '0')", child);
        jdbc.update("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID) VALUES ('도메인 없는 칼럼', 'NO_DOMAIN_COL', NULL)");

        JsonNode r = view("COLUMN", "COIL_THK", "no_domain_col", "NO_SUCH");

        assertEquals(2, r.path("items").size(), r.toString());
        assertEquals(0, r.path("failed").size(), r.toString());
        JsonNode coil = item(r, "COIL_THK");
        assertEquals("COIL_THK", coil.path("physName").asText());
        assertEquals("코일 두께", coil.path("columnName").asText());
        assertEquals("두께", coil.path("labelMid").asText());
        assertEquals("설명", coil.path("description").asText());
        assertEquals("NUMBER", coil.path("dataType").asText());
        assertEquals(10, coil.path("length").asInt());
        assertEquals(2, coil.path("scale").asInt());
        assertTrue(coil.path("required").asBoolean());
        assertEquals("0", coil.path("defaultValue").asText());
        assertEquals(String.valueOf(child), coil.path("domain").path("domainId").asText());
        assertEquals("QTY", coil.path("domain").path("domainKind").asText());
        assertEquals("(value >= 0) && (value <= 100)", coil.path("stdExpr").path("text").asText());
        assertEquals("INFIX_OPERATOR", coil.path("stdExpr").path("ast").path("type").asText());
        assertEquals("&&", coil.path("stdExpr").path("ast").path("value").asText());
        assertTrue(coil.path("bizExpr").isNull(), coil.toString());
        assertTrue(coil.path("codeRef").isNull(), coil.toString());

        JsonNode bare = item(r, "NO_DOMAIN_COL");
        assertTrue(bare.path("domain").isNull(), bare.toString());
        assertTrue(bare.path("dataType").isNull(), bare.toString());
        assertTrue(bare.path("stdExpr").isNull(), bare.toString());
    }

    @Test
    void view_DOMAIN_은_유효_도메인_메타를_주고_비즈니스식은_있다는_표시만_준다() throws Exception {
        long parent = domain("FD_D_P", "QTY", "NUMBER", 8, 1, null, "value >= 0");
        long child = domain("FD_D_C", "QTY", "NUMBER", null, null, parent, null);
        jdbc.update("UPDATE TB_MDM_DOMAIN SET BIZ_RULE = 'value <= COIL_WID', DESCRIPTION = '자식 설명' WHERE DOMAIN_ID = ?", child);

        JsonNode r = view("DOMAIN", String.valueOf(child), "abc", "999999");

        assertEquals(1, r.path("items").size(), r.toString());
        JsonNode d = item(r, String.valueOf(child));
        assertEquals("FD_D_C 도메인", d.path("domainName").asText());
        assertEquals("FD_D_C", d.path("stdName").asText());
        assertEquals("QTY", d.path("domainKind").asText());
        assertEquals(8, d.path("length").asInt());
        assertEquals(1, d.path("scale").asInt());
        assertEquals("자식 설명", d.path("description").asText());
        assertEquals("value >= 0", d.path("stdExpr").path("text").asText());
        assertTrue(d.path("bizRuleOnServer").asBoolean(), d.toString());
        assertFalse(d.has("bizExpr"), "도메인 메타는 비즈니스식 원문을 싣지 않는다");
    }

    @Test
    void view_는_대상_종류가_없거나_틀리면_MDM021_이다() throws Exception {
        JsonNode r = post("view", "SYSTEM", body(json.createObjectNode().put("type", "TABLE"), "X"));
        assertFalse(r.path("meta").path("success").asBoolean(true), r.toString());
        assertTrue(r.path("meta").path("message").asText().startsWith(MdmErrorCode.INVALID_INPUT.defaultMessage()), r.toString());
    }

    @Test
    void view_는_키가_없으면_빈_결과다() throws Exception {
        JsonNode r = view("COLUMN");
        assertEquals(0, r.path("items").size());
        assertEquals(0, r.path("failed").size());
    }

    // ------------------------------------------------------------------ 도우미

    /** 자기 행 한 줄. STD_AST 는 엔진 AstExporter 로 만든다(도메인 저장 경로와 같은 모양). */
    long domain(String std, String kind, String type, Integer length, Integer scale, Long parent, String stdRule) {
        jdbc.update("INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE, PARENT_DOMAIN_ID, "
                        + "STD_RULE, STD_AST, VER) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
                std + " 도메인", std, kind, type, length, scale, parent, stdRule, stdRule == null ? null : ast(stdRule));
        return jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = ?", Long.class, std);
    }

    String ast(String text) {
        try {
            return DomainJson.write(AstExporter.export(text, evaluator.configuration()));
        } catch (com.ezylang.evalex.parser.ParseException e) {
            throw new IllegalStateException(e);
        }
    }

    ObjectNode body(ObjectNode params, String... keys) {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", "metaFeed");
        body.set("params", params);
        ArrayNode rows = body.putObject("grids").putObject("keys").putArray("rows");
        for (String k : keys) {
            rows.addObject().put("key", k);
        }
        return body;
    }

    JsonNode post(String action, String role, ObjectNode body) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/oasis/metaFeed/" + action))
                .header("Content-Type", "application/json")
                .header("X-Client-Key", effectiveClientKey())
                .header("X-Authenticated-User", "system:mls")
                .header("X-Authenticated-Role", role)
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)))
                .build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode(), response.body());
        return json.readTree(response.body());
    }

    JsonNode result(JsonNode response) {
        assertTrue(response.path("meta").path("success").asBoolean(false), response.toString());
        return response.path("data").path("result");
    }

    JsonNode view(String type, String... keys) throws IOException, InterruptedException {
        return result(post("view", "SYSTEM", body(json.createObjectNode().put("type", type), keys)));
    }

    static JsonNode item(JsonNode result, String key) {
        for (JsonNode i : result.path("items")) {
            if (key.equals(i.path("key").asText())) {
                return i.path("value");
            }
        }
        throw new AssertionError("키가 없다: " + key + " in " + result);
    }

    static String effectiveClientKey() {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        return (env != null && !env.isBlank()) ? env : TEST_CLIENT_KEY;
    }
}
```

`AT/MdmOasisActionVocabularyTest.java` — 세 군데를 고친다.

(1) `dme_ruleSetEdit_bpmn_…` 시험 아래에 새 시험:

```java
    /** spec 2026-10-02-mdm-meta-cache-design §3.4 — 메타 제공은 화면이 아니라 업무 모듈 캐시가 부르는 서비스다. action 은 기존 어휘(search·view)를 쓴다. */
    @Test
    void feed_metaFeed_bpmn_의_액션은_어휘_안의_search_view_다() throws Exception {
        Path path = bpmnPath("feed", "metaFeed.bpmn");
        assertActionsWithinVocabulary(path);
        assertEquals(Set.of("search", "view"), actionsFromGateway(path));
    }
```

(2) `mcm_시드가_BPMN_23개_화면을_모두_커버한다` 의 수와 문구를 바꾼다:

```java
        assertEquals(24, bpmnScreens.size(), "BPMN 수가 24개가 아니다(늘거나 줄었으면 이 상수를 갱신한다): " + bpmnScreens);
        // metaFeed(services/feed) 는 화면이 아니라 업무 모듈 캐시가 부르는 서비스다 — 그룹 RBAC(seedMdmObjectRbac)를 받지 않고
        // SYSADMIN 전용 OBJECT 로만 시드한다(Task 11 의 seedMdmCacheMenus). spec 2026-10-02-mdm-meta-cache-design §5.5·§9.
        bpmnScreens.remove("metaFeed");
```

(시험 이름의 `23개` 는 그대로 둔다 — 화면 BPMN 은 여전히 23개다.)

- [ ] **Step 2: 실패를 확인한다**

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*MetaFeedOasisHttpTest' --tests '*MdmOasisActionVocabularyTest' --console=plain)`
Expected: FAIL — `services/feed/metaFeed.bpmn 가 없다`, BPMN 수 23, HTTP 시험은 `meta.success=false`(서비스 없음).

- [ ] **Step 3: DTO·결과·직렬화 도우미·메타 레코드를 만든다**

`L/feed/metaFeed/dto/MetaFeedSearchRequest.java`:

```java
package com.dongkuk.dmes.mdm.feed.metaFeed.dto;

/** metaFeed action=search params(spec 2026-10-02-mdm-meta-cache-design §3.4 changes). since 기본 0, limit 기본 1000(최대 5000). */
public class MetaFeedSearchRequest {

    private Long since;
    private Integer limit;

    public Long getSince() { return since; }
    public Integer getLimit() { return limit; }
    public void setSince(Long v) { this.since = v; }
    public void setLimit(Integer v) { this.limit = v; }
}
```

`L/feed/metaFeed/dto/MetaFeedViewRequest.java`:

```java
package com.dongkuk.dmes.mdm.feed.metaFeed.dto;

/** metaFeed action=view params — 대상 종류 하나(COLUMN·DOMAIN·RULE·RULE_SET·CODE·LAYOUT). 키는 grids.keys.rows[{key}]. */
public class MetaFeedViewRequest {

    private String type;

    public String getType() { return type; }
    public void setType(String v) { this.type = v; }
}
```

`L/feed/metaFeed/service/MetaFeedJson.java`:

```java
package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

/**
 * 피드 값 직렬화를 한 곳에 고정한다(spec 2026-10-02 §3.4). 엔진 레코드를 MVC 직렬화기(Boot 기본 설정)에 맡기지 않고 여기서 평범한
 * 맵·리스트·문자열·숫자로 바꾼다 — {@code LocalDateTime} 은 ISO 문자열({@code 2026-01-01T00:00:00}), {@code BigDecimal} 은 자리수 그대로,
 * {@code Map<Integer,…>} 키는 문자열. cactus {@code MdmJson} 이 같은 설정으로 되읽는다.
 */
public final class MetaFeedJson {

    private static final ObjectMapper MAPPER = JsonMapper.builder()
            .addModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .build();

    private MetaFeedJson() {
    }

    public static Object plain(Object value) {
        return value == null ? null : MAPPER.convertValue(value, Object.class);
    }
}
```

`L/feed/metaFeed/service/MetaFeedResult.java`:

```java
package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * view 한 번의 결과(spec 2026-10-02 §3.4). {@code found} 값은 {@link MetaFeedJson#plain} 을 거친 평범한 값이다. {@code failed} 는 저장 정의가
 * 깨져 만들 수 없던 키와 이유다(Ruling R4). 없는 키는 둘 다에 없다.
 */
public record MetaFeedResult(Map<String, Object> found, Map<String, String> failed) {

    public static MetaFeedResult empty() {
        return new MetaFeedResult(Map.of(), Map.of());
    }

    /** {@code {items:[{key, value}], failed:[{key, message}]}}. */
    public Map<String, Object> toResponse() {
        List<Map<String, Object>> items = new ArrayList<>();
        found.forEach((key, value) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("key", key);
            row.put("value", value);
            items.add(row);
        });
        List<Map<String, Object>> fails = new ArrayList<>();
        failed.forEach((key, message) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("key", key);
            row.put("message", message);
            fails.add(row);
        });
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("failed", fails);
        return out;
    }
}
```

`L/feed/metaFeed/service/MetaFeedPayloads.java`:

```java
package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import java.util.List;
import java.util.Map;

/**
 * metaFeed view 값 모양(spec 2026-10-02-mdm-meta-cache-design §4.2·§4.3). 필드 이름은 cactus {@code MdmColumnMeta}·{@code MdmDomainMeta}
 * 와 글자 그대로 같다 — 바꾸면 두 쪽과 계약 시험(MdmMetaFeedContractHttpTest)을 함께 고친다.
 */
public final class MetaFeedPayloads {

    private MetaFeedPayloads() {
    }

    /** 컬럼 메타. 도메인 칸(dataType·length·scale·domain·stdExpr·bizExpr·bizRequiredVars·codeRef)은 유효 도메인에서 온다. */
    public record ColumnMeta(
            String physName,
            String columnName,
            String labelLong,
            String labelMid,
            String labelShort,
            String description,
            String usageNote,
            String dataType,
            Integer length,
            Integer scale,
            boolean required,
            String defaultValue,
            String refKind,
            String refTarget,
            String refCateId,
            DomainRef domain,
            Expr stdExpr,
            BizExpr bizExpr,
            List<String> bizRequiredVars,
            CodeRefMeta codeRef) {
    }

    public record DomainRef(String domainId, String domainName, String domainKind) {
    }

    /** 유효 표준식 — {@code chainStdExpr}(조상~자신, CODE 의 MASTER 식 제외)과 그 AST. */
    public record Expr(String text, Map<String, Object> ast) {
    }

    /** 서버 전용 유효 비즈니스식. 화면 응답에는 존재 여부만 싣는다(cactus 가 뺀다). */
    public record BizExpr(String text) {
    }

    public record CodeRefMeta(String maruCodeId, String cateId) {
    }

    /** 도메인 메타(툴팁). 비즈니스식 원문은 싣지 않고 {@code bizRuleOnServer} 만 싣는다. */
    public record DomainMeta(
            String domainId,
            String domainName,
            String stdName,
            String domainKind,
            String dataType,
            Integer length,
            Integer scale,
            String unitCode,
            String description,
            Expr stdExpr,
            boolean bizRuleOnServer,
            CodeRefMeta codeRef) {
    }
}
```

- [ ] **Step 4: 컬럼·도메인 조립기를 만든다**

`L/feed/metaFeed/service/MetaFeedDictionary.java`:

```java
package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import com.dongkuk.dmes.mdm.common.dictionary.DomainChainAssembler;
import com.dongkuk.dmes.mdm.common.dictionary.DomainNode;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeReader;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeSnapshot;
import com.dongkuk.dmes.mdm.common.dictionary.EffectiveDomainView;
import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.feed.metaFeed.service.MetaFeedPayloads.BizExpr;
import com.dongkuk.dmes.mdm.feed.metaFeed.service.MetaFeedPayloads.CodeRefMeta;
import com.dongkuk.dmes.mdm.feed.metaFeed.service.MetaFeedPayloads.ColumnMeta;
import com.dongkuk.dmes.mdm.feed.metaFeed.service.MetaFeedPayloads.DomainMeta;
import com.dongkuk.dmes.mdm.feed.metaFeed.service.MetaFeedPayloads.DomainRef;
import com.dongkuk.dmes.mdm.feed.metaFeed.service.MetaFeedPayloads.Expr;
import com.dongkuk.dmes.mdm.repository.MdmColumnRepository;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.domain.EffectiveExpressions;
import org.springframework.stereotype.Component;

/**
 * 컬럼·도메인 메타 조립(spec 2026-10-02-mdm-meta-cache-design §3.4·§4.2·§4.3) — 컬럼 하나의 운영 조립은 이것이 처음이다.
 * 규칙은 {@code DomainTestCaseRunner.definition} 을 따른다: 표준식은 {@code chainStdExpr}(CODE 의 MASTER 식은 엔진 검증기가 스스로 붙인다),
 * 비즈니스식·요구 변수·코드 참조·타입·소수 자리는 {@link EffectiveDomainView}. 테이블 칼럼(REQUIRED·DEFAULT_VALUE·REF_*·표시명·설명)을 더한다.
 * 도메인이 없거나(V16 이후 nullable) 체인이 순환이면 도메인 칸을 비운다(Ruling R3, {@code LayoutDictionary.derive} 선례).
 */
@Component
public class MetaFeedDictionary {

    private final MdmColumnRepository columns;
    private final DomainTreeReader reader;
    private final DomainChainAssembler assembler;

    public MetaFeedDictionary(MdmColumnRepository columns, DomainTreeReader reader, DomainChainAssembler assembler) {
        this.columns = columns;
        this.reader = reader;
        this.assembler = assembler;
    }

    /** 키 = 대문자 물리명. 없는 컬럼은 빠진다. */
    public MetaFeedResult columns(Collection<String> physNames) {
        if (physNames.isEmpty()) {
            return MetaFeedResult.empty();
        }
        DomainTreeSnapshot snapshot = reader.load();
        Map<String, Object> found = new LinkedHashMap<>();
        for (MdmColumn c : columns.findByPhysNameIn(physNames)) {
            found.put(c.getPhysName().toUpperCase(Locale.ROOT), MetaFeedJson.plain(columnMeta(c, chain(snapshot, c.getDomainId()))));
        }
        return new MetaFeedResult(found, Map.of());
    }

    /** 키 = DOMAIN_ID 문자열. 숫자가 아니거나 없는 키는 빠지고, 상속이 순환이면 failed 다. */
    public MetaFeedResult domains(Collection<String> domainIds) {
        if (domainIds.isEmpty()) {
            return MetaFeedResult.empty();
        }
        DomainTreeSnapshot snapshot = reader.load();
        Map<String, Object> found = new LinkedHashMap<>();
        Map<String, String> failed = new LinkedHashMap<>();
        for (String key : domainIds) {
            Long id = parseId(key);
            if (id == null || snapshot.find(id).isEmpty()) {
                continue;
            }
            Chain chain = chain(snapshot, id);
            if (chain == null) {
                failed.put(key, "도메인 상속이 순환합니다: " + key);
                continue;
            }
            found.put(key, MetaFeedJson.plain(domainMeta(chain)));
        }
        return new MetaFeedResult(found, failed);
    }

    /** 최상위 조상부터 자신까지와 그 조립 결과. */
    record Chain(List<DomainNode> nodes, EffectiveDomainView view) {

        DomainNode self() {
            return nodes.get(nodes.size() - 1);
        }

        /** {@code chainStdExpr} 의 AST — 조상~자신의 자기 AST 를 왼쪽 중첩 AND 로(엔진 조립과 같다, 다시 파싱하지 않는다). */
        Map<String, Object> chainStdAst() {
            return EffectiveExpressions.ast(nodes.stream().map(n -> n.stdRule() == null ? null : n.stdAst()).toList());
        }
    }

    private Chain chain(DomainTreeSnapshot snapshot, Long domainId) {
        if (domainId == null || snapshot.find(domainId).isEmpty()) {
            return null;
        }
        try {
            List<DomainNode> nodes = snapshot.chainRootFirst(domainId);
            return new Chain(nodes, assembler.assemble(nodes));
        } catch (DomainTreeSnapshot.CycleException | IllegalArgumentException e) {
            return null;
        }
    }

    static ColumnMeta columnMeta(MdmColumn c, Chain chain) {
        EffectiveDomainView v = chain == null ? null : chain.view();
        return new ColumnMeta(
                c.getPhysName().toUpperCase(Locale.ROOT),
                c.getColumnName(),
                c.getLabelLong(),
                c.getLabelMid(),
                c.getLabelShort(),
                c.getDescription(),
                c.getUsageNote(),
                v == null ? null : v.dataType(),
                v == null ? null : v.length(),
                v == null ? null : v.scale(),
                c.isRequired(),
                c.getDefaultValue(),
                c.getRefKind(),
                c.getRefTarget(),
                c.getRefCateId(),
                chain == null ? null : new DomainRef(String.valueOf(chain.self().domainId()), chain.self().domainName(), v.domainKind()),
                v == null || v.chainStdExpr() == null ? null : new Expr(v.chainStdExpr(), chain.chainStdAst()),
                v == null || v.bizExpr() == null ? null : new BizExpr(v.bizExpr()),
                v == null || v.bizRequiredVars() == null ? List.of() : v.bizRequiredVars(),
                v == null || v.codeRef() == null ? null : new CodeRefMeta(v.codeRef().maruCodeId(), v.codeRef().cateId()));
    }

    static DomainMeta domainMeta(Chain chain) {
        EffectiveDomainView v = chain.view();
        DomainNode self = chain.self();
        return new DomainMeta(
                String.valueOf(self.domainId()),
                self.domainName(),
                self.stdName(),
                v.domainKind(),
                v.dataType(),
                v.length(),
                v.scale(),
                v.unitCode(),
                self.description(),
                v.chainStdExpr() == null ? null : new Expr(v.chainStdExpr(), chain.chainStdAst()),
                v.bizExpr() != null,
                v.codeRef() == null ? null : new CodeRefMeta(v.codeRef().maruCodeId(), v.codeRef().cateId()));
    }

    private static Long parseId(String key) {
        try {
            return key == null ? null : Long.valueOf(key.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
```

- [ ] **Step 5: 서비스와 BPMN 을 만든다**

`L/feed/metaFeed/service/MetaFeedService.java`:

```java
package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.metarev.MetaTargetType;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.entity.MdmMetaRev;
import com.dongkuk.dmes.mdm.feed.metaFeed.dto.MetaFeedSearchRequest;
import com.dongkuk.dmes.mdm.feed.metaFeed.dto.MetaFeedViewRequest;
import com.dongkuk.dmes.mdm.repository.MdmMetaRevRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * MDM 메타 제공(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §3.4) — {@code services/feed/metaFeed.bpmn}.
 * 업무 모듈 cactus 캐시가 부른다. 캐시를 두지 않고 늘 DB 최신 값을 돌려준다(D4).
 *
 * <p>{@code @Transactional} 을 쓰지 않는다(OASIS 파라미터 이름, F11). 조회는 읽기 전용 {@link TransactionTemplate} 으로 읽는다
 * (DataHistoryService 선례). 키 목록은 {@code grids.keys.rows[{key}]} 로 받는다 — params 배열 금지(oasis-contract-check 6-E-2).
 */
@Service("metaFeedService")
public class MetaFeedService {

    static final int DEFAULT_LIMIT = 1000;
    static final int MAX_LIMIT = 5000;
    static final int MAX_KEYS = 500;

    private final MdmMetaRevRepository revisions;
    private final MetaFeedDictionary dictionary;
    private final TransactionTemplate readTx;

    public MetaFeedService(MdmMetaRevRepository revisions, MetaFeedDictionary dictionary, PlatformTransactionManager transactionManager) {
        this.revisions = revisions;
        this.dictionary = dictionary;
        this.readTx = new TransactionTemplate(transactionManager);
        this.readTx.setReadOnly(true);
    }

    /** action search(= 스펙 changes) — {@code {latestSeq, items:[{seq, type, key, kind}], truncated}}. */
    public Map<String, Object> search(MetaFeedSearchRequest request) {
        long since = request == null || request.getSince() == null ? 0L : Math.max(0L, request.getSince());
        int limit = request == null || request.getLimit() == null ? DEFAULT_LIMIT : Math.min(MAX_LIMIT, Math.max(1, request.getLimit()));
        return readTx.execute(status -> {
            List<MdmMetaRev> rows = revisions.findByRevSeqGreaterThanOrderByRevSeqAsc(since, PageRequest.of(0, limit + 1));
            boolean truncated = rows.size() > limit;
            List<Map<String, Object>> items = new ArrayList<>();
            for (MdmMetaRev r : truncated ? rows.subList(0, limit) : rows) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("seq", r.getRevSeq());
                item.put("type", r.getTargetType());
                item.put("key", r.getTargetKey());
                item.put("kind", r.getChangeKind());
                items.add(item);
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("latestSeq", revisions.latestSeq());
            out.put("items", items);
            out.put("truncated", truncated);
            return out;
        });
    }

    /** action view(= 스펙 columns·domains·rules·ruleSets·codes·layouts) — {@code {items:[{key, value}], failed:[{key, message}]}}. */
    public Map<String, Object> view(MetaFeedViewRequest request, List<Map<String, Object>> keys) {
        MetaTargetType type = requireType(request == null ? null : request.getType());
        List<String> wanted = keyList(type, keys);
        if (wanted.isEmpty()) {
            return MetaFeedResult.empty().toResponse();
        }
        return readTx.execute(status -> fetch(type, wanted)).toResponse();
    }

    MetaFeedResult fetch(MetaTargetType type, List<String> keys) {
        return switch (type) {
            case COLUMN -> dictionary.columns(keys);
            case DOMAIN -> dictionary.domains(keys);
            case RULE, RULE_SET, CODE, LAYOUT -> throw invalid("아직 제공하지 않는 대상 종류입니다: " + type);
        };
    }

    /** grids.keys.rows 의 key — 공백을 빼고 중복 없이, COLUMN 은 대문자(Ruling R2). 최대 {@link #MAX_KEYS}. */
    static List<String> keyList(MetaTargetType type, List<Map<String, Object>> rows) {
        Set<String> out = new LinkedHashSet<>();
        if (rows != null) {
            for (Map<String, Object> row : rows) {
                Object v = row == null ? null : row.get("key");
                if (v == null || String.valueOf(v).isBlank()) {
                    continue;
                }
                String k = String.valueOf(v).trim();
                out.add(type == MetaTargetType.COLUMN ? k.toUpperCase(Locale.ROOT) : k);
            }
        }
        if (out.size() > MAX_KEYS) {
            throw invalid("키는 한 번에 " + MAX_KEYS + "개까지 받습니다: " + out.size());
        }
        return List.copyOf(out);
    }

    static MetaTargetType requireType(String text) {
        return MetaTargetType.parse(text).orElseThrow(() ->
                invalid("대상 종류(type)는 COLUMN·DOMAIN·RULE·RULE_SET·CODE·LAYOUT 중 하나여야 합니다: " + text));
    }

    static BusinessException invalid(String detail) {
        return MdmErrors.of(MdmErrorCode.INVALID_INPUT, detail, List.of());
    }
}
```

`A/resources/services/feed/metaFeed.bpmn`(dataHistory.bpmn 과 같은 골격 — `bpmn-skill` 의 bpmn-tool 로 만들어도 되고 그대로 써도 된다. 결과 XML 이 아래와 같으면 된다):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:modeler="http://camunda.org/schema/modeler/1.0" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_metaFeed" targetNamespace="http://bpmn.io/schema/bpmn" exporter="bpmn-tool" exporterVersion="1.3.0" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.15.0">
  <bpmn:process id="metaFeed" name="MDM 메타 제공" isExecutable="true">
    <bpmn:documentation>metaFeed — MDM 메타 제공(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §3.4). 업무 모듈 cactus 캐시가 부른다.

action=search -&gt; searchTask (metaFeedService.search) — 순번 since 뒤의 변경(스펙 changes)
action=view   -&gt; viewTask   (metaFeedService.view)   — params.type 하나의 키 묶음(grids.keys) 정의

화면이 아니다. 캐시를 두지 않고 늘 DB 최신 값을 준다(D4).</bpmn:documentation>
    <bpmn:startEvent id="start" name="시작">
      <bpmn:outgoing>flow_to_gw</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:exclusiveGateway id="actionGateway" name="action 분기">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="input" value="action" />
        </camunda:properties>
      </bpmn:extensionElements>
      <bpmn:incoming>flow_to_gw</bpmn:incoming>
      <bpmn:outgoing>flow_search</bpmn:outgoing>
      <bpmn:outgoing>flow_view</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:serviceTask id="searchTask" name="변경 목록" camunda:class="metaFeedService">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="method" value="search" />
          <camunda:property name="output" value="result" />
          <camunda:property name="dto" value="com.dongkuk.dmes.mdm.feed.metaFeed.dto.MetaFeedSearchRequest" />
        </camunda:properties>
      </bpmn:extensionElements>
      <bpmn:incoming>flow_search</bpmn:incoming>
      <bpmn:outgoing>flow_search_end</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:endEvent id="end_search" name="변경 목록 완료">
      <bpmn:incoming>flow_search_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:serviceTask id="viewTask" name="정의 묶음" camunda:class="metaFeedService">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="method" value="view" />
          <camunda:property name="output" value="result" />
          <camunda:property name="dto" value="com.dongkuk.dmes.mdm.feed.metaFeed.dto.MetaFeedViewRequest" />
        </camunda:properties>
      </bpmn:extensionElements>
      <bpmn:incoming>flow_view</bpmn:incoming>
      <bpmn:outgoing>flow_view_end</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:endEvent id="end_view" name="정의 묶음 완료">
      <bpmn:incoming>flow_view_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="flow_to_gw" sourceRef="start" targetRef="actionGateway" />
    <bpmn:sequenceFlow id="flow_search" name="search" sourceRef="actionGateway" targetRef="searchTask" />
    <bpmn:sequenceFlow id="flow_search_end" sourceRef="searchTask" targetRef="end_search" />
    <bpmn:sequenceFlow id="flow_view" name="view" sourceRef="actionGateway" targetRef="viewTask" />
    <bpmn:sequenceFlow id="flow_view_end" sourceRef="viewTask" targetRef="end_view" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="metaFeed">
      <bpmndi:BPMNShape id="start_di" bpmnElement="start">
        <dc:Bounds x="152" y="112" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="actionGateway_di" bpmnElement="actionGateway" isMarkerVisible="true">
        <dc:Bounds x="245" y="105" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="searchTask_di" bpmnElement="searchTask">
        <dc:Bounds x="380" y="60" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="end_search_di" bpmnElement="end_search">
        <dc:Bounds x="560" y="82" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="viewTask_di" bpmnElement="viewTask">
        <dc:Bounds x="380" y="180" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="end_view_di" bpmnElement="end_view">
        <dc:Bounds x="560" y="202" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="flow_to_gw_di" bpmnElement="flow_to_gw">
        <di:waypoint x="188" y="130" />
        <di:waypoint x="245" y="130" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="flow_search_di" bpmnElement="flow_search">
        <di:waypoint x="270" y="105" />
        <di:waypoint x="270" y="100" />
        <di:waypoint x="380" y="100" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="flow_search_end_di" bpmnElement="flow_search_end">
        <di:waypoint x="480" y="100" />
        <di:waypoint x="560" y="100" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="flow_view_di" bpmnElement="flow_view">
        <di:waypoint x="270" y="155" />
        <di:waypoint x="270" y="220" />
        <di:waypoint x="380" y="220" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="flow_view_end_di" bpmnElement="flow_view_end">
        <di:waypoint x="480" y="220" />
        <di:waypoint x="560" y="220" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
```

- [ ] **Step 6: 통과를 확인한다**

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*MetaFeedOasisHttpTest' --tests '*MdmOasisActionVocabularyTest' --tests '*DmaBpmnActionTest' --console=plain)`
Expected: PASS.

- [ ] **Step 7: OASIS 계약 검사**

Run: `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root . --module mdm`
Expected: `ERROR 0`(BPMN 수 25 / 진입점 bean 25 — 테스트 probe 포함 수는 바뀔 수 있다, ERROR 만 본다).

- [ ] **Step 8: 커밋**

```bash
/usr/bin/git add src/backend/mdm/api/src/main/resources/services/feed/metaFeed.bpmn \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/feed \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/feed/MetaFeedOasisHttpTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmOasisActionVocabularyTest.java
/usr/bin/git commit -m "$(cat <<'EOF'
feat(mdm): 메타 제공 OASIS metaFeed 로 변경 목록과 컬럼·도메인 메타를 내준다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: metaFeed 2 — 룰·룰세트·코드·전문 정의와 강제 기록(save, SYSADMIN)

**Files:**
- Create: `L/feed/metaFeed/service/MetaFeedDefinitions.java`, `L/feed/metaFeed/dto/MetaFeedSaveRequest.java`
- Modify: `L/feed/metaFeed/service/MetaFeedService.java`(생성자·`fetch`·`save`)
- Modify: `A/resources/services/feed/metaFeed.bpmn`(saveTask 더함 — 아래 전문으로 바꾼다)
- Modify: `L/contract/common/MdmErrorCode.java:63`(MDM027 더함)
- Modify: `LT/contract/common/CommonContractTest.java:48`(26 → 27)과 시험 하나
- Modify: `AT/MdmOasisActionVocabularyTest.java`(metaFeed 액션 {search, view, save})
- Test: `AT/feed/MetaFeedOasisHttpTest.java`(시험 추가)

**Interfaces:**
- Consumes: Task 4 `MetaFeedService.fetch`·`keyList`·`requireType`·`invalid`, `MetaFeedResult`, `MetaFeedJson.plain`; Task 1 `MetaRevisionRecorder.force(MetaTargetType, Collection<String>, MetaChangeKind)` → `MetaRevisionRange(fromSeq, toSeq, count)`, `MetaChangeKind.parse`. 재사용: `RuleQueries.versions(String)` → `List<MdmRuleVer>`, `StoredRuleDefinitions.scope()`·`read(String, MdmRuleVer, RuleVarTypeResolver.Scope)`·`assemble(String, String, Stored, Scope)` → `RuleDefinitionAssembler.Assembled(definition, failures, skippedRows)`, `new StoredDefinitionLookup(RuleQueries, StoredRuleDefinitions, MdmRuleRepository, MdmRuleSetRepository).ruleSet(String)`(손상 시 `StoredDefinitionException`), `new MdmCodeLookup(MasterCodeLedgerQueries).code(String)`, `LayoutVersionStore.latest(Long)` → `Optional<MdmLayoutVer>`, `LayoutSnapshotJson.toMap(LayoutSnapshotJson.read(String))`, `MdmCurrentUser.roleIds()`.
- Produces: `MetaFeedService.save(MetaFeedSaveRequest, List<Map<String,Object>> keys)` → `{fromSeq, toSeq, count}`; `MetaFeedDefinitions`(빈): `rules`·`ruleSets`·`codes`·`layouts`(각 `Collection<String>` → `MetaFeedResult`); `MdmErrorCode.SYSADMIN_ROLE_REQUIRED`("MDM027", 403). BPMN action 은 `search`·`view`·`save` — Task 11 이 `save` 를 BFF 권한키 `mdm/metafeed/save` 로 연다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`AT/feed/MetaFeedOasisHttpTest.java` 에 import `com.dongkuk.dmes.mdm.dmb.layout.LayoutSnapshotJson;`, `com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;`, `java.math.BigDecimal;`, `java.util.List;` 를 더하고 시험을 넣는다:

```java
    // ------------------------------------------------------------------ view RULE·RULE_SET·CODE·LAYOUT

    @Test
    void view_RULE_은_RELEASED_버전_전체를_ver_순으로_주고_DRAFT_는_빼며_확정이_없으면_빈_배열이다() throws Exception {
        DmeTestSupport.sampleRule(jdbc);
        jdbc.update("UPDATE TB_MDM_RULE_VER SET APPLY_TO = '2026-07-01 00:00:00' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 1");
        DmeTestSupport.released(jdbc, "QLTY_GRD_JDG", 2, "FIRST", "2026-07-01 00:00:00", null);
        DmeTestSupport.sampleDefinition(jdbc, "QLTY_GRD_JDG", 2);
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 3, "DRAFT", "kim", "FIRST", 2);
        DmeTestSupport.rule(jdbc, "NOREL_JDG", "확정 없음", "DECISION", "CREATED");
        DmeTestSupport.pending(jdbc, "NOREL_JDG", 1, "DRAFT", "kim", "FIRST", null);

        JsonNode r = view("RULE", "QLTY_GRD_JDG", "NOREL_JDG", "NO_SUCH_JDG");

        assertEquals(2, r.path("items").size(), r.toString());
        JsonNode versions = item(r, "QLTY_GRD_JDG");
        assertEquals(2, versions.size(), versions.toString());
        assertEquals(1, versions.get(0).path("ver").asInt());
        assertEquals("2026-01-01T00:00:00", versions.get(0).path("applyFrom").asText());
        assertEquals("2026-07-01T00:00:00", versions.get(0).path("applyTo").asText());
        assertEquals(2, versions.get(1).path("ver").asInt());
        assertEquals("DECISION", versions.get(1).path("ruleKind").asText());
        assertEquals("FIRST", versions.get(1).path("hitPolicy").asText());
        boolean varKey = false;
        for (JsonNode row : versions.get(1).path("rows")) {
            varKey |= row.path("cells").has("1");
        }
        assertTrue(varKey, "셀 키는 var_id 문자열이다: " + versions.get(1).path("rows"));
        assertEquals(0, item(r, "NOREL_JDG").size());
    }

    @Test
    void view_RULE_은_저장값이_깨진_룰만_failed_로_돌려준다() throws Exception {
        DmeTestSupport.sampleRule(jdbc);
        DmeTestSupport.rule(jdbc, "BROKEN_JDG", "깨진 판정", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "BROKEN_JDG", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.sampleDefinition(jdbc, "BROKEN_JDG", 1);
        jdbc.update("UPDATE TB_MDM_RULE_ROW SET CELLS = '{\"x\":1}' WHERE MARU_RULE_ID = 'BROKEN_JDG' AND VER = 1 AND ROW_ID = 1");

        JsonNode r = view("RULE", "QLTY_GRD_JDG", "BROKEN_JDG");

        assertEquals(1, r.path("items").size(), r.toString());
        assertEquals(1, r.path("failed").size(), r.toString());
        assertEquals("BROKEN_JDG", r.path("failed").get(0).path("key").asText());
        assertFalse(r.path("failed").get(0).path("message").asText().isBlank());
    }

    @Test
    void view_RULE_SET_은_세트_정의를_주고_흐름이_깨진_세트는_failed_다() throws Exception {
        DmeTestSupport.ruleSet(jdbc, "FEED_SET", "피드 세트", "[\"QLTY_GRD_JDG\"]", "INUSE", 0);
        DmeTestSupport.ruleSet(jdbc, "FEED_BAD", "깨진 세트", "[]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "FEED_BAD", "{\"version\":1,\"nodes\":\"x\",\"edges\":[]}");

        JsonNode r = view("RULE_SET", "FEED_SET", "FEED_BAD", "NO_SET");

        JsonNode set = item(r, "FEED_SET");
        assertEquals("FEED_SET", set.path("setId").asText());
        assertEquals("QLTY_GRD_JDG", set.path("ruleIds").get(0).asText());
        assertEquals("INUSE", set.path("status").asText());
        assertTrue(set.path("flow").isNull(), set.toString());
        assertEquals("FEED_BAD", r.path("failed").get(0).path("key").asText(), r.toString());
    }

    @Test
    void view_CODE_는_다섯_표_원본을_버전_자리수와_적용_구간_그대로_준다() throws Exception {
        MasterCodeSeeds seeds = new MasterCodeSeeds(jdbc);
        seeds.seedCode("FEED_CD", "INUSE", "MDM");
        seeds.released("FEED_CD", "1.000", "2026-01-01 00:00:00", MasterCodeSeeds.OPEN_END);
        seeds.seedItem("FEED_CD", "A", "1.000", MasterCodeSeeds.OPEN, "에이", 1);
        seeds.seedBase("FEED_CD");

        JsonNode code = item(view("CODE", "FEED_CD", "NO_CD"), "FEED_CD");

        assertEquals("FEED_CD", code.path("header").path("maruCodeId").asText());
        assertEquals("INUSE", code.path("header").path("status").asText());
        JsonNode ver = code.path("versions").get(0);
        assertEquals(0, ver.path("ver").decimalValue().compareTo(new BigDecimal("1.000")), ver.toString());
        assertEquals("RELEASED", ver.path("status").asText());
        assertEquals("2026-01-01T00:00:00", ver.path("applyFrom").asText());
        assertEquals("A", code.path("items").get(0).path("code").asText());
        assertEquals("BASE", code.path("categories").get(0).path("cateId").asText());
    }

    @Test
    void view_LAYOUT_은_최신_버전_스냅샷을_주고_버전이_없는_ID_는_뺀다() throws Exception {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT (LAYOUT_KIND, LAYOUT_NAME, TOTAL_LENGTH) VALUES ('MESSAGE', '피드 전문', 10)");
        long id = jdbc.queryForObject("SELECT LAYOUT_ID FROM TB_MDM_LAYOUT WHERE LAYOUT_NAME = '피드 전문'", Long.class);
        String snapshot = LayoutSnapshotJson.write(new MdmLayoutSnapshot(id, "피드 전문", null, null, null, null, null, 1L, 10,
                List.of(), List.of()));
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, LAYOUT_VERSION, TOTAL_LENGTH, SNAPSHOT_JSON) VALUES (?, 1, 10, ?)", id, snapshot);

        JsonNode r = view("LAYOUT", String.valueOf(id), "999999", "abc");

        assertEquals(1, r.path("items").size(), r.toString());
        assertEquals("피드 전문", item(r, String.valueOf(id)).path("layoutName").asText());
    }

    // ------------------------------------------------------------------ save(force)

    @Test
    void save_는_SYSADMIN_만_펼치지_않고_강제_기록을_남긴다() throws Exception {
        ObjectNode params = json.createObjectNode().put("type", "COLUMN").put("kind", "RELOAD");

        JsonNode denied = post("save", "SYSTEM", body(params, "coil_thk"));
        assertFalse(denied.path("meta").path("success").asBoolean(true), denied.toString());
        assertTrue(denied.path("meta").path("message").asText().startsWith(MdmErrorCode.SYSADMIN_ROLE_REQUIRED.defaultMessage()),
                denied.toString());
        assertEquals(List.of(), MetaRevTestSupport.rows(jdbc));

        JsonNode ok = result(post("save", "SYSADMIN", body(params, "coil_thk", "COIL_WID")));
        assertEquals(2, ok.path("count").asInt(), ok.toString());
        assertEquals(ok.path("fromSeq").asLong() + 1, ok.path("toSeq").asLong());
        assertEquals(List.of("COLUMN:COIL_THK:RELOAD", "COLUMN:COIL_WID:RELOAD"), MetaRevTestSupport.rows(jdbc));
    }

    @Test
    void save_는_kind_가_EVICT_RELOAD_가_아니거나_키가_없으면_MDM021_이다() throws Exception {
        JsonNode badKind = post("save", "SYSADMIN", body(json.createObjectNode().put("type", "RULE").put("kind", "SAVE"), "R1"));
        assertTrue(badKind.path("meta").path("message").asText().startsWith(MdmErrorCode.INVALID_INPUT.defaultMessage()), badKind.toString());
        JsonNode noKeys = post("save", "SYSADMIN", body(json.createObjectNode().put("type", "RULE").put("kind", "EVICT")));
        assertTrue(noKeys.path("meta").path("message").asText().startsWith(MdmErrorCode.INVALID_INPUT.defaultMessage()), noKeys.toString());
        assertEquals(List.of(), MetaRevTestSupport.rows(jdbc));
    }
```

`LT/contract/common/CommonContractTest.java` — `assertEquals(26, MdmErrorCode.values().length);` 를 `27` 로 바꾸고 시험을 더한다:

```java
    @Test
    void 메타_캐시가_더한_SYSADMIN_전용_코드() {
        // spec 2026-10-02-mdm-meta-cache-design §3.4 force — 화면 삭제·재등록 강제 기록은 SYSADMIN 만.
        assertCode(MdmErrorCode.SYSADMIN_ROLE_REQUIRED, "MDM027", 403,
                com.dongkuk.dmes.cactus.common.ErrorCode.ACCESS_DENIED, "시스템 관리자만 할 수 있습니다");
    }
```

`AT/MdmOasisActionVocabularyTest.java` — Task 4 시험의 이름과 기대를 바꾼다:

```java
    @Test
    void feed_metaFeed_bpmn_의_액션은_어휘_안의_search_view_save_다() throws Exception {
        Path path = bpmnPath("feed", "metaFeed.bpmn");
        assertActionsWithinVocabulary(path);
        assertEquals(Set.of("search", "view", "save"), actionsFromGateway(path));
    }
```

- [ ] **Step 2: 실패를 확인한다**

Run: `(cd src/backend/mdm && ../gradlew :lib:test --tests '*CommonContractTest' --console=plain) ; (cd src/backend/mdm && ../gradlew :api:test --tests '*MetaFeedOasisHttpTest' --tests '*MdmOasisActionVocabularyTest' --console=plain)`
Expected: FAIL — `SYSADMIN_ROLE_REQUIRED` 컴파일 오류(lib), view RULE 등은 `아직 제공하지 않는 대상 종류` 로 실패.

- [ ] **Step 3: 오류 코드·DTO·정의 조립기를 만든다**

`L/contract/common/MdmErrorCode.java` — `STORED_DEFINITION_CORRUPT(...)` 줄의 `;` 를 `,` 로 바꾸고 그 아래에 더한다:

```java
    /**
     * MDM 메타 캐시(spec 2026-10-02-mdm-meta-cache-design §3.4 force) — 화면 삭제·재등록은 모든 모듈·인스턴스 캐시를 지우는 강제 기록이라
     * 시스템 관리자만 한다. BFF 권한(1차)과 별도로 서비스가 요청 역할을 다시 본다.
     */
    SYSADMIN_ROLE_REQUIRED("MDM027", 403, ErrorCode.ACCESS_DENIED, "시스템 관리자만 할 수 있습니다");
```

`L/feed/metaFeed/dto/MetaFeedSaveRequest.java`:

```java
package com.dongkuk.dmes.mdm.feed.metaFeed.dto;

/** metaFeed action=save(= 스펙 force) params — 대상 종류와 EVICT·RELOAD. 키는 grids.keys.rows[{key}]. SYSADMIN 만. */
public class MetaFeedSaveRequest {

    private String type;
    private String kind;

    public String getType() { return type; }
    public String getKind() { return kind; }
    public void setType(String v) { this.type = v; }
    public void setKind(String v) { this.kind = v; }
}
```

`L/feed/metaFeed/service/MetaFeedDefinitions.java`:

```java
package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries;
import com.dongkuk.dmes.mdm.common.mastercode.MdmCodeLookup;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleVarTypeResolver;
import com.dongkuk.dmes.mdm.common.rule.definition.RuleDefinitionAssembler;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionException;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionLookup;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutSnapshotJson;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionStore;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import org.springframework.stereotype.Component;

/**
 * 룰·룰세트·마스터코드·전문 정의 묶음(spec 2026-10-02-mdm-meta-cache-design §3.4). {@link StoredDefinitionLookup}·{@link MdmCodeLookup} 은
 * 빈이 아니다(D-077, ADR-0005 — {@code DefinitionLookup} 빈 0개 가드) — 호출마다 {@code new} 로 만든다.
 *
 * <p>룰은 RELEASED 버전 <b>전체</b>를 준다 — 적용 시작일 도래는 쓰기가 없어 기록이 남지 않으므로 업무 모듈이 판정 시각으로 그때그때 고른다(§4.1).
 * 저장값이 깨져 정의를 만들 수 없는 키는 그 키만 failed 로 준다(Ruling R4).
 */
@Component
public class MetaFeedDefinitions {

    private static final String RELEASED = "RELEASED";

    private final RuleQueries ruleQueries;
    private final StoredRuleDefinitions stored;
    private final MdmRuleRepository rules;
    private final MdmRuleSetRepository sets;
    private final MasterCodeLedgerQueries ledger;
    private final LayoutVersionStore layoutVersions;

    public MetaFeedDefinitions(RuleQueries ruleQueries, StoredRuleDefinitions stored, MdmRuleRepository rules, MdmRuleSetRepository sets,
                               MasterCodeLedgerQueries ledger, LayoutVersionStore layoutVersions) {
        this.ruleQueries = ruleQueries;
        this.stored = stored;
        this.rules = rules;
        this.sets = sets;
        this.ledger = ledger;
        this.layoutVersions = layoutVersions;
    }

    public MetaFeedResult rules(Collection<String> ruleIds) {
        Map<String, Object> found = new LinkedHashMap<>();
        Map<String, String> failed = new LinkedHashMap<>();
        RuleVarTypeResolver.Scope scope = stored.scope();
        for (String id : ruleIds) {
            Optional<MdmRule> rule = rules.findById(id);
            if (rule.isEmpty()) {
                continue;
            }
            try {
                List<RuleDefinition> released = new ArrayList<>();
                for (MdmRuleVer v : ruleQueries.versions(id)) {
                    if (!RELEASED.equals(v.getStatus()) || v.getApplyFrom() == null) {
                        continue;
                    }
                    StoredRuleDefinitions.Stored s = stored.read(id, v, scope);
                    RuleDefinitionAssembler.Assembled a = stored.assemble(id, rule.get().getRuleKind(), s, scope);
                    if (!a.failures().isEmpty() || !a.skippedRows().isEmpty()) {
                        throw new IllegalStateException("룰 " + id + " 버전 " + v.getVer() + " 의 저장된 행을 조립할 수 없습니다");
                    }
                    released.add(a.definition());
                }
                released.sort(Comparator.comparingInt(RuleDefinition::ver));
                found.put(id, MetaFeedJson.plain(released));
            } catch (BusinessException | IllegalArgumentException | IllegalStateException e) {
                failed.put(id, e.getMessage());
            }
        }
        return new MetaFeedResult(found, failed);
    }

    public MetaFeedResult ruleSets(Collection<String> setIds) {
        StoredDefinitionLookup lookup = new StoredDefinitionLookup(ruleQueries, stored, rules, sets);
        Map<String, Object> found = new LinkedHashMap<>();
        Map<String, String> failed = new LinkedHashMap<>();
        for (String id : setIds) {
            try {
                lookup.ruleSet(id).ifPresent(d -> found.put(id, MetaFeedJson.plain(d)));
            } catch (StoredDefinitionException e) {
                failed.put(id, e.getMessage());
            }
        }
        return new MetaFeedResult(found, failed);
    }

    public MetaFeedResult codes(Collection<String> maruCodeIds) {
        MdmCodeLookup lookup = new MdmCodeLookup(ledger);
        Map<String, Object> found = new LinkedHashMap<>();
        for (String id : maruCodeIds) {
            lookup.code(id).ifPresent(rows -> found.put(id, MetaFeedJson.plain(rows)));
        }
        return new MetaFeedResult(found, Map.of());
    }

    /** 최신 TB_MDM_LAYOUT_VER 스냅샷. 버전이 없는 ID(헤더 레이아웃·숫자가 아닌 키)는 빠진다(Ruling R9). */
    public MetaFeedResult layouts(Collection<String> layoutIds) {
        Map<String, Object> found = new LinkedHashMap<>();
        Map<String, String> failed = new LinkedHashMap<>();
        for (String key : layoutIds) {
            Long id;
            try {
                id = Long.valueOf(key.trim());
            } catch (NumberFormatException e) {
                continue;
            }
            try {
                layoutVersions.latest(id).ifPresent(v ->
                        found.put(key, MetaFeedJson.plain(LayoutSnapshotJson.toMap(LayoutSnapshotJson.read(v.getSnapshotJson())))));
            } catch (IllegalArgumentException | IllegalStateException e) {
                failed.put(key, e.getMessage());
            }
        }
        return new MetaFeedResult(found, failed);
    }
}
```

- [ ] **Step 4: 서비스를 넓히고 BPMN 에 save 를 더한다**

`MetaFeedService` — import `com.dongkuk.dmes.mdm.common.metarev.MetaChangeKind;`, `com.dongkuk.dmes.mdm.common.metarev.MetaRevisionRecorder;`, `com.dongkuk.dmes.mdm.common.metarev.MetaRevisionRecorder.MetaRevisionRange;`, `com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;`, `com.dongkuk.dmes.mdm.feed.metaFeed.dto.MetaFeedSaveRequest;` 를 더하고, 필드·생성자·`fetch` 를 바꾸고 `save` 를 더한다:

```java
    static final String SYSADMIN = "SYSADMIN";

    private final MdmMetaRevRepository revisions;
    private final MetaFeedDictionary dictionary;
    private final MetaFeedDefinitions definitions;
    private final MetaRevisionRecorder recorder;
    private final MdmCurrentUser currentUser;
    private final TransactionTemplate readTx;

    public MetaFeedService(MdmMetaRevRepository revisions, MetaFeedDictionary dictionary, MetaFeedDefinitions definitions,
                           MetaRevisionRecorder recorder, MdmCurrentUser currentUser, PlatformTransactionManager transactionManager) {
        this.revisions = revisions;
        this.dictionary = dictionary;
        this.definitions = definitions;
        this.recorder = recorder;
        this.currentUser = currentUser;
        this.readTx = new TransactionTemplate(transactionManager);
        this.readTx.setReadOnly(true);
    }
```

```java
    MetaFeedResult fetch(MetaTargetType type, List<String> keys) {
        return switch (type) {
            case COLUMN -> dictionary.columns(keys);
            case DOMAIN -> dictionary.domains(keys);
            case RULE -> definitions.rules(keys);
            case RULE_SET -> definitions.ruleSets(keys);
            case CODE -> definitions.codes(keys);
            case LAYOUT -> definitions.layouts(keys);
        };
    }

    /**
     * action save(= 스펙 force) — 화면 삭제(EVICT)·재등록(RELOAD). 펼치지 않는다. SYSADMIN 만(MDM027) — BFF 권한(mdm/metafeed/save)과 별도로
     * 여기서 다시 본다. 모든 모듈·인스턴스가 다음 폴링에서 반영한다(D6).
     */
    public Map<String, Object> save(MetaFeedSaveRequest request, List<Map<String, Object>> keys) {
        if (!currentUser.roleIds().contains(SYSADMIN)) {
            throw MdmErrors.of(MdmErrorCode.SYSADMIN_ROLE_REQUIRED);
        }
        MetaTargetType type = requireType(request == null ? null : request.getType());
        String kindText = request == null ? null : request.getKind();
        MetaChangeKind kind = MetaChangeKind.parse(kindText).filter(k -> k != MetaChangeKind.SAVE)
                .orElseThrow(() -> invalid("변경 종류(kind)는 EVICT·RELOAD 중 하나여야 합니다: " + kindText));
        List<String> wanted = keyList(type, keys);
        if (wanted.isEmpty()) {
            throw invalid("강제 기록할 키가 없습니다");
        }
        MetaRevisionRange range = recorder.force(type, wanted, kind);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("fromSeq", range.fromSeq());
        out.put("toSeq", range.toSeq());
        out.put("count", range.count());
        return out;
    }
```

`A/resources/services/feed/metaFeed.bpmn` — 통째로 바꾼다(save 흐름·도형 추가):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:modeler="http://camunda.org/schema/modeler/1.0" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_metaFeed" targetNamespace="http://bpmn.io/schema/bpmn" exporter="bpmn-tool" exporterVersion="1.3.0" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.15.0">
  <bpmn:process id="metaFeed" name="MDM 메타 제공" isExecutable="true">
    <bpmn:documentation>metaFeed — MDM 메타 제공(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §3.4). 업무 모듈 cactus 캐시와 포털 MDM 캐시 관리 화면이 부른다.

action=search -&gt; searchTask (metaFeedService.search) — 순번 since 뒤의 변경(스펙 changes)
action=view   -&gt; viewTask   (metaFeedService.view)   — params.type 하나의 키 묶음(grids.keys) 정의
action=save   -&gt; saveTask   (metaFeedService.save)   — 화면 삭제·재등록 강제 기록(스펙 force). SYSADMIN 만(MDM027)

화면이 아니다. 캐시를 두지 않고 늘 DB 최신 값을 준다(D4).</bpmn:documentation>
    <bpmn:startEvent id="start" name="시작">
      <bpmn:outgoing>flow_to_gw</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:exclusiveGateway id="actionGateway" name="action 분기">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="input" value="action" />
        </camunda:properties>
      </bpmn:extensionElements>
      <bpmn:incoming>flow_to_gw</bpmn:incoming>
      <bpmn:outgoing>flow_search</bpmn:outgoing>
      <bpmn:outgoing>flow_view</bpmn:outgoing>
      <bpmn:outgoing>flow_save</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:serviceTask id="searchTask" name="변경 목록" camunda:class="metaFeedService">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="method" value="search" />
          <camunda:property name="output" value="result" />
          <camunda:property name="dto" value="com.dongkuk.dmes.mdm.feed.metaFeed.dto.MetaFeedSearchRequest" />
        </camunda:properties>
      </bpmn:extensionElements>
      <bpmn:incoming>flow_search</bpmn:incoming>
      <bpmn:outgoing>flow_search_end</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:endEvent id="end_search" name="변경 목록 완료">
      <bpmn:incoming>flow_search_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:serviceTask id="viewTask" name="정의 묶음" camunda:class="metaFeedService">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="method" value="view" />
          <camunda:property name="output" value="result" />
          <camunda:property name="dto" value="com.dongkuk.dmes.mdm.feed.metaFeed.dto.MetaFeedViewRequest" />
        </camunda:properties>
      </bpmn:extensionElements>
      <bpmn:incoming>flow_view</bpmn:incoming>
      <bpmn:outgoing>flow_view_end</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:endEvent id="end_view" name="정의 묶음 완료">
      <bpmn:incoming>flow_view_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:serviceTask id="saveTask" name="강제 기록" camunda:class="metaFeedService">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="method" value="save" />
          <camunda:property name="output" value="result" />
          <camunda:property name="dto" value="com.dongkuk.dmes.mdm.feed.metaFeed.dto.MetaFeedSaveRequest" />
        </camunda:properties>
      </bpmn:extensionElements>
      <bpmn:incoming>flow_save</bpmn:incoming>
      <bpmn:outgoing>flow_save_end</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:endEvent id="end_save" name="강제 기록 완료">
      <bpmn:incoming>flow_save_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="flow_to_gw" sourceRef="start" targetRef="actionGateway" />
    <bpmn:sequenceFlow id="flow_search" name="search" sourceRef="actionGateway" targetRef="searchTask" />
    <bpmn:sequenceFlow id="flow_search_end" sourceRef="searchTask" targetRef="end_search" />
    <bpmn:sequenceFlow id="flow_view" name="view" sourceRef="actionGateway" targetRef="viewTask" />
    <bpmn:sequenceFlow id="flow_view_end" sourceRef="viewTask" targetRef="end_view" />
    <bpmn:sequenceFlow id="flow_save" name="save" sourceRef="actionGateway" targetRef="saveTask" />
    <bpmn:sequenceFlow id="flow_save_end" sourceRef="saveTask" targetRef="end_save" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="metaFeed">
      <bpmndi:BPMNShape id="start_di" bpmnElement="start">
        <dc:Bounds x="152" y="192" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="actionGateway_di" bpmnElement="actionGateway" isMarkerVisible="true">
        <dc:Bounds x="245" y="185" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="searchTask_di" bpmnElement="searchTask">
        <dc:Bounds x="380" y="60" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="end_search_di" bpmnElement="end_search">
        <dc:Bounds x="560" y="82" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="viewTask_di" bpmnElement="viewTask">
        <dc:Bounds x="380" y="170" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="end_view_di" bpmnElement="end_view">
        <dc:Bounds x="560" y="192" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="saveTask_di" bpmnElement="saveTask">
        <dc:Bounds x="380" y="280" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="end_save_di" bpmnElement="end_save">
        <dc:Bounds x="560" y="302" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="flow_to_gw_di" bpmnElement="flow_to_gw">
        <di:waypoint x="188" y="210" />
        <di:waypoint x="245" y="210" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="flow_search_di" bpmnElement="flow_search">
        <di:waypoint x="270" y="185" />
        <di:waypoint x="270" y="100" />
        <di:waypoint x="380" y="100" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="flow_search_end_di" bpmnElement="flow_search_end">
        <di:waypoint x="480" y="100" />
        <di:waypoint x="560" y="100" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="flow_view_di" bpmnElement="flow_view">
        <di:waypoint x="295" y="210" />
        <di:waypoint x="380" y="210" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="flow_view_end_di" bpmnElement="flow_view_end">
        <di:waypoint x="480" y="210" />
        <di:waypoint x="560" y="210" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="flow_save_di" bpmnElement="flow_save">
        <di:waypoint x="270" y="235" />
        <di:waypoint x="270" y="320" />
        <di:waypoint x="380" y="320" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="flow_save_end_di" bpmnElement="flow_save_end">
        <di:waypoint x="480" y="320" />
        <di:waypoint x="560" y="320" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
```

- [ ] **Step 5: 통과를 확인한다**

Run: `(cd src/backend/mdm && ../gradlew :lib:test --tests '*CommonContractTest' --console=plain && ../gradlew :api:test --tests '*MetaFeedOasisHttpTest' --tests '*MdmOasisActionVocabularyTest' --tests '*MdmBusinessRuleMigrationTest' --tests '*MasterCodeDeprecateEngineSqliteTest' --console=plain)`
Expected: PASS. 마지막 둘은 `DefinitionLookup`·`MdmCodeLookup` 운영 빈이 여전히 0개임을 본다(`StoredDefinitionLookup`·`MdmCodeLookup` 을 `new` 로만 쓴다).

- [ ] **Step 6: OASIS 계약 검사**

Run: `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root . --module mdm`
Expected: `ERROR 0`.

- [ ] **Step 7: 커밋**

```bash
/usr/bin/git add src/backend/mdm/api/src/main/resources/services/feed/metaFeed.bpmn \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/feed \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/common/MdmErrorCode.java \
  src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/common/CommonContractTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/feed/MetaFeedOasisHttpTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmOasisActionVocabularyTest.java
/usr/bin/git commit -m "$(cat <<'EOF'
feat(mdm): metaFeed 가 룰·룰 세트·코드·전문 정의를 주고 SYSADMIN 강제 기록을 받는다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 6: cactus 클라이언트 — 설정·대상 종류·DTO·`MdmMetaClient`(RestClient, 헤더 3종, OASIS 봉투 해석)

**Files:**
- Create: `C/MdmClientProperties.java`, `C/MdmTargetType.java`, `C/MdmUnavailableException.java`, `C/MdmMetaFeed.java`, `C/MdmChange.java`, `C/MdmChanges.java`, `C/MdmFetchResult.java`, `C/MdmColumnMeta.java`, `C/MdmDomainMeta.java`, `C/MdmJson.java`, `C/MdmMetaClient.java`
- Test: `CT/MdmMetaClientTest.java`

**Interfaces:**
- Consumes: Task 0 엔진 타입 `DefinitionLookup.RuleDefinition`·`RuleSetDefinition`, `CodeLookup.CodeRows`. 계약 표의 metaFeed 요청·응답 모양.
- Produces:
  - `MdmClientProperties`(`@ConfigurationProperties("cactus.mdm")`): `isEnabled()`, `getModule()`, `getBaseUrl()`, `getClientKey()`, `getPollInterval()`, `getMaxEntries()`, `getMaxAge()`, `getConnectTimeout()`, `getReadTimeout()`, `getPageLimit()` + setter
  - `enum MdmTargetType { COLUMN, DOMAIN, RULE, RULE_SET, CODE, LAYOUT; static Optional<MdmTargetType> parse(String) }`
  - `MdmUnavailableException extends RuntimeException`(`(String)`, `(String, Throwable)`)
  - `interface MdmMetaFeed { MdmChanges changes(long since, int limit); MdmFetchResult fetch(MdmTargetType type, Collection<String> keys); }`
  - `record MdmChange(long seq, String type, String key, String kind)`, `record MdmChanges(long latestSeq, List<MdmChange> items, boolean truncated)`, `record MdmFetchResult(Map<String,Object> found, Map<String,String> failed)`
  - `record MdmColumnMeta(...)`(계약 표 COLUMN 필드 + 중첩 `DomainRef`·`Expr`·`BizExpr`·`CodeRefMeta`), `record MdmDomainMeta(...)`
  - `MdmJson.MAPPER`(ObjectMapper), `MdmJson.plain(Object) → Object`
  - `MdmMetaClient(RestClient restClient, String baseUrl, String module) implements MdmMetaFeed` — fetch 값 타입: COLUMN `MdmColumnMeta`, DOMAIN `MdmDomainMeta`, RULE `List<RuleDefinition>`, RULE_SET `RuleSetDefinition`, CODE `CodeRows`, LAYOUT `Map<String,Object>`. 모든 실패는 `MdmUnavailableException`.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`CT/MdmMetaClientTest.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.math.BigDecimal;
import java.net.SocketTimeoutException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** spec 2026-10-02-mdm-meta-cache-design §5.2·§7 「cactus 클라이언트」 — 헤더 3종, OASIS 봉투 해석, 시간 초과. */
class MdmMetaClientTest {

    private MockRestServiceServer server;
    private MdmMetaClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().defaultHeader("X-Client-Key", "k");
        server = MockRestServiceServer.bindTo(builder).build();
        client = new MdmMetaClient(builder.build(), "http://mdm.test/", "mls");
    }

    private static String ok(String resultJson) {
        return "{\"meta\":{\"txId\":\"t\",\"success\":true,\"code\":\"0000\"},\"data\":{\"result\":" + resultJson + "}}";
    }

    @Test
    void changes_는_헤더_세_가지와_OASIS_봉투로_search_를_부르고_결과를_푼다() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/search"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Client-Key", "k"))
                .andExpect(header("X-Authenticated-User", "system:mls"))
                .andExpect(header("X-Authenticated-Role", "SYSTEM"))
                .andExpect(header("X-Tx-Id", matchesPattern("[0-9a-f-]{36}")))
                .andExpect(jsonPath("$.meta.menuId").value("metaFeed"))
                .andExpect(jsonPath("$.params.since").value(5))
                .andExpect(jsonPath("$.params.limit").value(1000))
                .andExpect(jsonPath("$.grids.keys.rows").isArray())
                .andRespond(withSuccess(ok("{\"latestSeq\":9,\"items\":[{\"seq\":6,\"type\":\"COLUMN\",\"key\":\"COIL_THK\","
                        + "\"kind\":\"SAVE\"}],\"truncated\":false}"), MediaType.APPLICATION_JSON));

        MdmChanges c = client.changes(5, 1000);

        assertThat(c.latestSeq()).isEqualTo(9);
        assertThat(c.truncated()).isFalse();
        assertThat(c.items()).containsExactly(new MdmChange(6, "COLUMN", "COIL_THK", "SAVE"));
        server.verify();
    }

    @Test
    void fetch_는_키를_grids_로_보내고_COLUMN_값을_레코드로_읽으며_모르는_칸은_무시한다() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andExpect(jsonPath("$.params.type").value("COLUMN"))
                .andExpect(jsonPath("$.grids.keys.rows[0].key").value("COIL_THK"))
                .andExpect(jsonPath("$.grids.keys.rows[1].key").value("NO_SUCH"))
                .andRespond(withSuccess(ok("""
                        {"items":[{"key":"COIL_THK","value":{"physName":"COIL_THK","columnName":"코일 두께","labelMid":"두께",
                         "dataType":"NUMBER","length":10,"scale":2,"required":true,
                         "domain":{"domainId":"7","domainName":"두께","domainKind":"QTY"},
                         "stdExpr":{"text":"value >= 0","ast":{"type":"INFIX_OPERATOR"}},"bizExpr":{"text":"value <= COIL_WID"},
                         "bizRequiredVars":["COIL_WID"],"codeRef":null,"newField":1}}],"failed":[]}"""), MediaType.APPLICATION_JSON));

        MdmFetchResult r = client.fetch(MdmTargetType.COLUMN, List.of("COIL_THK", "NO_SUCH"));

        MdmColumnMeta m = (MdmColumnMeta) r.found().get("COIL_THK");
        assertThat(m.columnName()).isEqualTo("코일 두께");
        assertThat(m.scale()).isEqualTo(2);
        assertThat(m.required()).isTrue();
        assertThat(m.domain().domainKind()).isEqualTo("QTY");
        assertThat(m.stdExpr().ast()).containsEntry("type", "INFIX_OPERATOR");
        assertThat(m.bizRequiredVars()).containsExactly("COIL_WID");
        assertThat(r.found()).doesNotContainKey("NO_SUCH");
        assertThat(r.failed()).isEmpty();
    }

    @Test
    void fetch_RULE_은_LocalDateTime_과_정수_셀_키를_엔진_레코드로_되읽고_failed_를_돌려준다() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andRespond(withSuccess(ok("""
                        {"items":[{"key":"QLTY","value":[{"ruleId":"QLTY","ver":1,"ruleKind":"DECISION","hitPolicy":"FIRST",
                         "applyFrom":"2026-01-01T00:00:00","applyTo":"2026-07-01T00:00:00","engineVersion":"1","vars":[],
                         "contract":{"always":[],"rows":[]},
                         "rows":[{"rowId":1,"seq":1,"rowKind":"NORMAL","cells":{"1":{"op":"GT","left":"1000","right":null,"list":null,
                         "expr":null,"ast":null,"val":null,"text":"COIL_WID > 1000"}}}]}]}],
                         "failed":[{"key":"BROKEN","message":"셀 키는 var_id 정수여야 합니다"}]}"""), MediaType.APPLICATION_JSON));

        MdmFetchResult r = client.fetch(MdmTargetType.RULE, List.of("QLTY", "BROKEN"));

        @SuppressWarnings("unchecked")
        List<RuleDefinition> versions = (List<RuleDefinition>) r.found().get("QLTY");
        assertThat(versions).hasSize(1);
        assertThat(versions.get(0).applyFrom()).isEqualTo(LocalDateTime.of(2026, 1, 1, 0, 0));
        assertThat(versions.get(0).applyTo()).isEqualTo(LocalDateTime.of(2026, 7, 1, 0, 0));
        assertThat(versions.get(0).rows().get(0).cells().get(1).text()).isEqualTo("COIL_WID > 1000");
        assertThat(r.failed()).containsEntry("BROKEN", "셀 키는 var_id 정수여야 합니다");
    }

    @Test
    void fetch_CODE_는_버전_번호의_자리수를_잃지_않는다() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andRespond(withSuccess(ok("""
                        {"items":[{"key":"PROC_CD","value":{"header":{"maruCodeId":"PROC_CD","status":"INUSE"},
                         "versions":[{"ver":1.000,"status":"RELEASED","applyFrom":"2026-01-01T00:00:00","applyTo":"9999-12-31T00:00:00"}],
                         "items":[{"code":"A","fromVer":1.000,"toVer":9999.000,"name":"에이","alterName":null,"seq":1,
                          "lvl":[null,null,null,null,null],"attrs":[null,null,null,null,null,null,null,null,null,null]}],
                         "categories":[{"cateId":"BASE","fromVer":1.000,"toVer":9999.000,"defKind":"REGEX","defExpr":".*","defTarget":"CODE"}],
                         "cateItems":[]}}],"failed":[]}"""), MediaType.APPLICATION_JSON));

        CodeRows rows = (CodeRows) client.fetch(MdmTargetType.CODE, List.of("PROC_CD")).found().get("PROC_CD");

        assertThat(rows.header().status()).isEqualTo("INUSE");
        assertThat(rows.versions().get(0).ver()).isEqualByComparingTo(new BigDecimal("1.000"));
        assertThat(rows.versions().get(0).ver().scale()).isEqualTo(3);
        assertThat(rows.items().get(0).toVer()).isEqualByComparingTo(new BigDecimal("9999"));
    }

    @Test
    void meta_success_false_는_MdmUnavailableException_에_서버_메시지를_싣는다() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andRespond(withSuccess("{\"meta\":{\"success\":false,\"code\":\"E001\",\"message\":\"입력값이 올바르지 않습니다\"}}",
                        MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> client.fetch(MdmTargetType.DOMAIN, List.of("1")))
                .isInstanceOf(MdmUnavailableException.class).hasMessageContaining("입력값이 올바르지 않습니다");
    }

    @Test
    void 인증_실패_401_도_MdmUnavailableException() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/search")).andRespond(withStatus(HttpStatus.UNAUTHORIZED));
        assertThatThrownBy(() -> client.changes(0, 1)).isInstanceOf(MdmUnavailableException.class).hasMessageContaining("MDM 호출 실패");
    }

    @Test
    void 읽기_시간_초과는_MdmUnavailableException() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/search")).andRespond(request -> {
            throw new SocketTimeoutException("Read timed out");
        });
        assertThatThrownBy(() -> client.changes(0, 1)).isInstanceOf(MdmUnavailableException.class).hasMessageContaining("Read timed out");
    }

    @Test
    void 값을_엔진_모양으로_읽을_수_없으면_MdmUnavailableException() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andRespond(withSuccess(ok("{\"items\":[{\"key\":\"S1\",\"value\":\"문자열\"}],\"failed\":[]}"), MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> client.fetch(MdmTargetType.RULE_SET, List.of("S1"))).isInstanceOf(MdmUnavailableException.class);
    }

    @Test
    void LAYOUT_값은_맵_그대로다() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andRespond(withSuccess(ok("{\"items\":[{\"key\":\"3\",\"value\":{\"layoutName\":\"전문\",\"totalLength\":10}}],\"failed\":[]}"),
                        MediaType.APPLICATION_JSON));
        @SuppressWarnings("unchecked")
        Map<String, Object> layout = (Map<String, Object>) client.fetch(MdmTargetType.LAYOUT, List.of("3")).found().get("3");
        assertThat(layout).containsEntry("layoutName", "전문");
    }
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `(cd src/backend/cactus-core && ./gradlew test --tests 'com.dongkuk.dmes.cactus.mdm.MdmMetaClientTest' --console=plain)`
Expected: FAIL — `cannot find symbol: class MdmMetaClient`.

- [ ] **Step 3: 설정·타입·DTO 를 만든다**

`C/MdmClientProperties.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 업무 모듈의 MDM 메타 캐시 설정 {@code cactus.mdm.*}(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.1).
 * 기본은 꺼짐이다 — 업무 모듈이 켠다. MDM 서버 자신은 켜지 않는다. 선례는 {@code CaravanHubClientProperties}.
 */
@ConfigurationProperties(prefix = "cactus.mdm")
public class MdmClientProperties {

    private boolean enabled = false;
    /** 이 모듈 코드(mcm·mls·mqc·mpp·mpn). 비면 {@code cactus.oasis.service-group}. 엔드포인트 {@code /api/{module}/mdmMeta} 와 호출자 이름에 쓴다. */
    private String module;
    private String baseUrl = "http://localhost:8096";
    private String clientKey;
    private Duration pollInterval = Duration.ofSeconds(10);
    /** 대상 합계 상한. 넘으면 적재가 오래된 순으로 지운다. */
    private int maxEntries = 20_000;
    /** 기록 누락에 대비한 안전망 — 이 수명이 지난 항목은 조회 때 버린다. */
    private Duration maxAge = Duration.ofMinutes(60);
    private Duration connectTimeout = Duration.ofSeconds(2);
    private Duration readTimeout = Duration.ofSeconds(5);
    /** 한 번 폴링에서 받는 변경 수 상한. 넘으면(truncated) 캐시를 비운다(§5.3-3). */
    private int pageLimit = 1000;

    public boolean isEnabled() { return enabled; }
    public String getModule() { return module; }
    public String getBaseUrl() { return baseUrl; }
    public String getClientKey() { return clientKey; }
    public Duration getPollInterval() { return pollInterval; }
    public int getMaxEntries() { return maxEntries; }
    public Duration getMaxAge() { return maxAge; }
    public Duration getConnectTimeout() { return connectTimeout; }
    public Duration getReadTimeout() { return readTimeout; }
    public int getPageLimit() { return pageLimit; }

    public void setEnabled(boolean v) { this.enabled = v; }
    public void setModule(String v) { this.module = v; }
    public void setBaseUrl(String v) { this.baseUrl = v; }
    public void setClientKey(String v) { this.clientKey = v; }
    public void setPollInterval(Duration v) { this.pollInterval = v; }
    public void setMaxEntries(int v) { this.maxEntries = v; }
    public void setMaxAge(Duration v) { this.maxAge = v; }
    public void setConnectTimeout(Duration v) { this.connectTimeout = v; }
    public void setReadTimeout(Duration v) { this.readTimeout = v; }
    public void setPageLimit(int v) { this.pageLimit = v; }
}
```

`C/MdmTargetType.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import java.util.Locale;
import java.util.Optional;

/** 캐시 대상 종류(spec §4.1). MDM {@code TB_MDM_META_REV.TARGET_TYPE}·metaFeed {@code type} 과 같은 이름이다. */
public enum MdmTargetType {
    COLUMN, DOMAIN, RULE, RULE_SET, CODE, LAYOUT;

    public static Optional<MdmTargetType> parse(String text) {
        if (text == null || text.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(valueOf(text.trim().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
```

`C/MdmUnavailableException.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

/** MDM 에서 정의를 받을 수 없다(꺼짐·시간 초과·거부·손상된 응답). "없음"이 아니다 — 캐시하지 않는다(spec §5.4). */
public class MdmUnavailableException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public MdmUnavailableException(String message) {
        super(message);
    }

    public MdmUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
```

`C/MdmMetaFeed.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import java.util.Collection;

/** MDM metaFeed 두 action(spec §3.4) — 운영은 {@link MdmMetaClient}(HTTP), 시험은 가짜 구현. 실패는 {@link MdmUnavailableException}. */
public interface MdmMetaFeed {

    /** search — 순번 {@code since} 뒤의 변경을 {@code limit} 개까지. */
    MdmChanges changes(long since, int limit);

    /** view — 대상 종류 하나의 키 묶음. 없는 키는 결과에 없다. */
    MdmFetchResult fetch(MdmTargetType type, Collection<String> keys);
}
```

`C/MdmChange.java`, `C/MdmChanges.java`, `C/MdmFetchResult.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

/** 변경 기록 한 줄. {@code type}·{@code kind} 는 MDM 이 준 글자 그대로다(모르는 종류는 폴러가 건너뛴다). */
public record MdmChange(long seq, String type, String key, String kind) {
}
```

```java
package com.dongkuk.dmes.cactus.mdm;

import java.util.List;

/** metaFeed search 결과 — {@code truncated} 면 limit 를 넘어 다 받지 못했다. */
public record MdmChanges(long latestSeq, List<MdmChange> items, boolean truncated) {
}
```

```java
package com.dongkuk.dmes.cactus.mdm;

import java.util.Map;

/** metaFeed view 결과 — 찾은 키의 값(대상 종류별 타입)과 MDM 이 정의를 만들지 못한 키·이유. 없는 키는 둘 다에 없다. */
public record MdmFetchResult(Map<String, Object> found, Map<String, String> failed) {
}
```

`C/MdmColumnMeta.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import java.util.List;
import java.util.Map;

/**
 * 컬럼 메타(spec 2026-10-02-mdm-meta-cache-design §4.2) — MDM {@code MetaFeedPayloads.ColumnMeta} 와 필드 이름이 같다.
 * 엔진용 {@code ColumnDefinition} 과 화면 메타는 이 값에서 만든다({@link MdmDefinitionLookup}, {@link MdmScreenColumn}).
 */
public record MdmColumnMeta(
        String physName,
        String columnName,
        String labelLong,
        String labelMid,
        String labelShort,
        String description,
        String usageNote,
        String dataType,
        Integer length,
        Integer scale,
        boolean required,
        String defaultValue,
        String refKind,
        String refTarget,
        String refCateId,
        DomainRef domain,
        Expr stdExpr,
        BizExpr bizExpr,
        List<String> bizRequiredVars,
        CodeRefMeta codeRef) {

    public record DomainRef(String domainId, String domainName, String domainKind) {
    }

    /** 유효 표준식(chainStdExpr)과 AST. */
    public record Expr(String text, Map<String, Object> ast) {
    }

    /** 서버 전용 유효 비즈니스식 — 화면 응답에는 싣지 않는다. */
    public record BizExpr(String text) {
    }

    public record CodeRefMeta(String maruCodeId, String cateId) {
    }
}
```

`C/MdmDomainMeta.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

/** 도메인 메타(spec §4.3, 툴팁) — MDM {@code MetaFeedPayloads.DomainMeta} 와 필드 이름이 같다. 비즈니스식 원문은 없다. */
public record MdmDomainMeta(
        String domainId,
        String domainName,
        String stdName,
        String domainKind,
        String dataType,
        Integer length,
        Integer scale,
        String unitCode,
        String description,
        MdmColumnMeta.Expr stdExpr,
        boolean bizRuleOnServer,
        MdmColumnMeta.CodeRefMeta codeRef) {
}
```

`C/MdmJson.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

/**
 * MDM 메타 JSON 설정 한 곳 — MDM {@code MetaFeedJson} 과 같은 설정이다(spec §3.4). 모르는 칸은 무시하고(MDM 이 먼저 넓어져도 깨지지 않게),
 * 소수는 {@code BigDecimal} 로 읽어 코드 버전 자리수를 지킨다.
 */
public final class MdmJson {

    public static final ObjectMapper MAPPER = JsonMapper.builder()
            .addModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .build();

    private MdmJson() {
    }

    /** 응답 본문으로 내보낼 평범한 값 — 엔진 레코드의 {@code LocalDateTime} 을 ISO 문자열로 바꾼다. */
    public static Object plain(Object value) {
        return value == null ? null : MAPPER.convertValue(value, Object.class);
    }
}
```

- [ ] **Step 4: 클라이언트를 만든다**

`C/MdmMetaClient.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * MDM metaFeed HTTP 클라이언트(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.2). {@code POST {base-url}/oasis/metaFeed/{action}}.
 * 헤더: {@code X-Client-Key}(RestClient 기본 헤더 — 자동 설정이 넣는다), {@code X-Authenticated-User: system:{module}},
 * {@code X-Authenticated-Role: SYSTEM}, 요청마다 {@code X-Tx-Id}. 사용자 헤더가 없으면 MDM 이 JWT 흐름으로 빠져 401 이다.
 *
 * <p>OASIS 는 BPMN 안 오류도 HTTP 200 + {@code meta.success=false} 로 준다 — 성공 여부는 {@code meta.success} 로 판정한다.
 * 모든 실패는 {@link MdmUnavailableException} 이다. 선례는 caravan-hub 클라이언트.
 */
public class MdmMetaClient implements MdmMetaFeed {

    static final String SERVICE_PATH = "/oasis/metaFeed/";
    static final String SYSTEM_ROLE = "SYSTEM";
    private static final TypeReference<List<RuleDefinition>> RULE_VERSIONS = new TypeReference<>() {
    };
    private static final TypeReference<Map<String, Object>> PLAIN_MAP = new TypeReference<>() {
    };

    private final RestClient restClient;
    private final String baseUrl;
    private final String module;

    public MdmMetaClient(RestClient restClient, String baseUrl, String module) {
        this.restClient = restClient;
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.module = module;
    }

    @Override
    public MdmChanges changes(long since, int limit) {
        ObjectNode params = MdmJson.MAPPER.createObjectNode().put("since", since).put("limit", limit);
        JsonNode result = call("search", params, List.of());
        List<MdmChange> items = new ArrayList<>();
        for (JsonNode n : result.path("items")) {
            items.add(new MdmChange(n.path("seq").asLong(), n.path("type").asText(null), n.path("key").asText(null),
                    n.path("kind").asText(null)));
        }
        return new MdmChanges(result.path("latestSeq").asLong(0L), items, result.path("truncated").asBoolean(false));
    }

    @Override
    public MdmFetchResult fetch(MdmTargetType type, Collection<String> keys) {
        JsonNode result = call("view", MdmJson.MAPPER.createObjectNode().put("type", type.name()), keys);
        Map<String, Object> found = new LinkedHashMap<>();
        for (JsonNode n : result.path("items")) {
            found.put(n.path("key").asText(), convert(type, n.path("value")));
        }
        Map<String, String> failed = new LinkedHashMap<>();
        for (JsonNode n : result.path("failed")) {
            failed.put(n.path("key").asText(), n.path("message").asText(""));
        }
        return new MdmFetchResult(found, failed);
    }

    static Object convert(MdmTargetType type, JsonNode value) {
        try {
            return switch (type) {
                case COLUMN -> MdmJson.MAPPER.treeToValue(value, MdmColumnMeta.class);
                case DOMAIN -> MdmJson.MAPPER.treeToValue(value, MdmDomainMeta.class);
                case RULE -> MdmJson.MAPPER.readerFor(RULE_VERSIONS).readValue(value);
                case RULE_SET -> MdmJson.MAPPER.treeToValue(value, RuleSetDefinition.class);
                case CODE -> MdmJson.MAPPER.treeToValue(value, CodeRows.class);
                case LAYOUT -> MdmJson.MAPPER.convertValue(value, PLAIN_MAP);
            };
        } catch (IOException | IllegalArgumentException e) {
            throw new MdmUnavailableException("MDM 응답의 " + type + " 값을 읽을 수 없습니다: " + e.getMessage(), e);
        }
    }

    private JsonNode call(String action, ObjectNode params, Collection<String> keys) {
        ObjectNode body = MdmJson.MAPPER.createObjectNode();
        body.putObject("meta").put("menuId", "metaFeed");
        body.set("params", params);
        ArrayNode rows = body.putObject("grids").putObject("keys").putArray("rows");
        keys.forEach(k -> rows.addObject().put("key", k));
        String text;
        try {
            text = restClient.post()
                    .uri(baseUrl + SERVICE_PATH + action)
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .header("X-Authenticated-User", "system:" + module)
                    .header("X-Authenticated-Role", SYSTEM_ROLE)
                    .header("X-Tx-Id", UUID.randomUUID().toString())
                    .body(MdmJson.MAPPER.writeValueAsString(body))
                    .retrieve()
                    .body(String.class);
        } catch (RestClientException | JsonProcessingException e) {
            throw new MdmUnavailableException("MDM 호출 실패(" + action + "): " + e.getMessage(), e);
        }
        JsonNode root;
        try {
            root = MdmJson.MAPPER.readTree(text == null ? "" : text);
        } catch (JsonProcessingException e) {
            throw new MdmUnavailableException("MDM 응답이 JSON 이 아닙니다(" + action + ")", e);
        }
        if (!root.path("meta").path("success").asBoolean(false)) {
            throw new MdmUnavailableException("MDM 이 거부했습니다(" + action + "): " + root.path("meta").path("message").asText(""));
        }
        return root.path("data").path("result");
    }
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `(cd src/backend/cactus-core && ./gradlew test --tests 'com.dongkuk.dmes.cactus.mdm.*' --console=plain)`
Expected: PASS(`MdmEngineDependencyTest` 포함). 시간 초과 시험에서 RestClient 가 `SocketTimeoutException` 을 `ResourceAccessException` 으로 감싸 메시지에 `Read timed out` 이 남는다 — 남지 않으면 단언을 `hasRootCauseInstanceOf(SocketTimeoutException.class)` 로 바꾼다(동작 기대는 같다).

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm
/usr/bin/git commit -m "$(cat <<'EOF'
feat(cactus-core): MDM metaFeed 를 부르는 클라이언트와 메타 DTO 를 더한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: cactus 캐시·조회 서비스 — `MdmMetaCache`·`MdmMetaService`

**Files:**
- Create: `C/MdmMetaCache.java`, `C/MdmMetaService.java`
- Test: `CT/MutableClock.java`, `CT/FakeMetaFeed.java`, `CT/MdmMetaCacheTest.java`, `CT/MdmMetaServiceTest.java`

**Interfaces:**
- Consumes: Task 6 `MdmMetaFeed`, `MdmTargetType`, `MdmFetchResult`, `MdmUnavailableException`.
- Produces:
  - `MdmMetaCache(int maxEntries, Duration maxAge, Clock clock)`: `Optional<Entry> get(MdmTargetType, String)`, `boolean put(MdmTargetType, String, Object valueOrNull, Ticket)`, `void evict(MdmTargetType, String, long seq)`, `void evictLocal(MdmTargetType, String)`, `void clear(long newAppliedSeq)`, `void markApplied(long seq)`, `long appliedSeq()`(첫 폴링 전 -1), `Ticket ticket()`, `Map<MdmTargetType,Integer> sizes()`, `List<EntryView> entries(MdmTargetType typeOrNull, String q)`, `int maxEntries()`, `Duration maxAge()`; `Entry`(`value()`, `absent()`, `loadedAt()`, `loadSeq()`, `hits()`), `record Ticket(long generation, long appliedSeq)`, `record EntryView(MdmTargetType type, String key, boolean absent, Object value, Instant loadedAt, long hits, long remainingSeconds, long loadSeq)`
  - `MdmMetaService(MdmMetaFeed feed, MdmMetaCache cache, Clock clock)`: `MdmLookup lookup(MdmTargetType, Collection<String>)`(던지지 않는다), `Optional<Object> one(MdmTargetType, String)`(받을 수 없으면 `MdmUnavailableException`), `MdmLookup reload(MdmTargetType, Collection<String>)`, `int consecutiveFailures()`; `record MdmLookup(Map<String,Object> found, List<String> missing, List<String> unavailable)`
  - 시험 도우미 `MutableClock(Instant)`·`advance(Duration)`, `FakeMetaFeed`(`put(type,key,value)`, `failedKeys`, `fetchError`, `fetchGate`, `fetchEntered`, `fetchCalls`, `fetchedKeys`, `changes`(큐), `changesSince`) — Task 8·9·10 이 쓴다

- [ ] **Step 1: 시험 도우미와 실패하는 시험을 쓴다**

`CT/MutableClock.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/** 시험용 시계 — 손으로 넘긴다. */
final class MutableClock extends Clock {

    private volatile Instant now;

    MutableClock(Instant start) {
        this.now = start;
    }

    void advance(Duration d) {
        now = now.plus(d);
    }

    @Override
    public ZoneId getZone() {
        return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        return this;
    }

    @Override
    public Instant instant() {
        return now;
    }
}
```

`CT/FakeMetaFeed.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import java.util.ArrayDeque;
import java.util.Collection;
import java.util.Deque;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/** 시험용 피드 — 값·실패·변경 응답을 손으로 정하고 호출을 센다. */
final class FakeMetaFeed implements MdmMetaFeed {

    final Map<MdmTargetType, Map<String, Object>> values = new EnumMap<>(MdmTargetType.class);
    final Map<String, String> failedKeys = new ConcurrentHashMap<>();
    final AtomicInteger fetchCalls = new AtomicInteger();
    final List<List<String>> fetchedKeys = new CopyOnWriteArrayList<>();
    /** {@link MdmChanges} 또는 던질 {@link RuntimeException} 을 차례로. */
    final Deque<Object> changes = new ArrayDeque<>();
    final List<Long> changesSince = new CopyOnWriteArrayList<>();
    final CountDownLatch fetchEntered = new CountDownLatch(1);
    volatile RuntimeException fetchError;
    /** null 이 아니면 fetch 가 이 래치가 풀릴 때까지(최대 5초) 기다린다. */
    volatile CountDownLatch fetchGate;

    FakeMetaFeed() {
        for (MdmTargetType t : MdmTargetType.values()) {
            values.put(t, new ConcurrentHashMap<>());
        }
    }

    FakeMetaFeed put(MdmTargetType type, String key, Object value) {
        values.get(type).put(key, value);
        return this;
    }

    @Override
    public synchronized MdmChanges changes(long since, int limit) {
        changesSince.add(since);
        Object next = changes.poll();
        if (next instanceof RuntimeException e) {
            throw e;
        }
        if (next == null) {
            throw new MdmUnavailableException("준비된 변경 응답이 없다");
        }
        return (MdmChanges) next;
    }

    @Override
    public MdmFetchResult fetch(MdmTargetType type, Collection<String> keys) {
        fetchCalls.incrementAndGet();
        fetchedKeys.add(List.copyOf(keys));
        fetchEntered.countDown();
        CountDownLatch gate = fetchGate;
        if (gate != null) {
            try {
                gate.await(5, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        RuntimeException error = fetchError;
        if (error != null) {
            throw error;
        }
        Map<String, Object> found = new LinkedHashMap<>();
        Map<String, String> failed = new LinkedHashMap<>();
        for (String k : keys) {
            if (failedKeys.containsKey(k)) {
                failed.put(k, failedKeys.get(k));
            } else if (values.get(type).containsKey(k)) {
                found.put(k, values.get(type).get(k));
            }
        }
        return new MdmFetchResult(found, failed);
    }
}
```

`CT/MdmMetaCacheTest.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** spec §5.2·§5.3-5·§7 「cactus 캐시」 — 적재·없음·상한·max-age·지움 기록. */
class MdmMetaCacheTest {

    private MutableClock clock;
    private MdmMetaCache cache;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-10-02T00:00:00Z"));
        cache = new MdmMetaCache(3, Duration.ofMinutes(60), clock);
        cache.clear(5);
    }

    @Test
    void 값과_없음을_돌려주고_조회_수를_센다() {
        cache.put(MdmTargetType.COLUMN, "A", "값", cache.ticket());
        cache.put(MdmTargetType.COLUMN, "X", null, cache.ticket());

        assertThat(cache.get(MdmTargetType.COLUMN, "A").orElseThrow().value()).isEqualTo("값");
        assertThat(cache.get(MdmTargetType.COLUMN, "X").orElseThrow().absent()).isTrue();
        assertThat(cache.get(MdmTargetType.COLUMN, "A").orElseThrow().hits()).isEqualTo(2L);
        assertThat(cache.get(MdmTargetType.DOMAIN, "A")).isEmpty();
        assertThat(cache.get(MdmTargetType.COLUMN, "A").get().loadSeq()).isEqualTo(5);
    }

    @Test
    void max_age_가_지난_항목은_조회_때_버린다() {
        cache.put(MdmTargetType.RULE, "R", "v", cache.ticket());
        clock.advance(Duration.ofMinutes(59));
        assertThat(cache.get(MdmTargetType.RULE, "R")).isPresent();
        clock.advance(Duration.ofMinutes(1));
        assertThat(cache.get(MdmTargetType.RULE, "R")).isEmpty();
        assertThat(cache.sizes().get(MdmTargetType.RULE)).isZero();
    }

    @Test
    void max_entries_를_넘으면_적재가_오래된_순으로_지운다() {
        cache.put(MdmTargetType.COLUMN, "A", "a", cache.ticket());
        clock.advance(Duration.ofSeconds(1));
        cache.put(MdmTargetType.DOMAIN, "B", "b", cache.ticket());
        clock.advance(Duration.ofSeconds(1));
        cache.put(MdmTargetType.RULE, "C", "c", cache.ticket());
        clock.advance(Duration.ofSeconds(1));
        cache.put(MdmTargetType.CODE, "D", "d", cache.ticket());

        assertThat(cache.get(MdmTargetType.COLUMN, "A")).isEmpty();
        assertThat(cache.get(MdmTargetType.CODE, "D")).isPresent();
        Map<MdmTargetType, Integer> sizes = cache.sizes();
        assertThat(sizes.values().stream().mapToInt(Integer::intValue).sum()).isEqualTo(3);
    }

    @Test
    void 적재_시작_뒤_폴링이_지운_키는_캐시에_넣지_않는다() {
        MdmMetaCache.Ticket ticket = cache.ticket();
        cache.evict(MdmTargetType.COLUMN, "A", 6);
        cache.markApplied(6);

        assertThat(cache.put(MdmTargetType.COLUMN, "A", "옛 값", ticket)).isFalse();
        assertThat(cache.get(MdmTargetType.COLUMN, "A")).isEmpty();
        assertThat(cache.put(MdmTargetType.COLUMN, "B", "b", ticket)).isTrue();
        assertThat(cache.put(MdmTargetType.COLUMN, "A", "새 값", cache.ticket())).isTrue();
    }

    @Test
    void 캐시를_통째로_비우면_그_전에_시작한_적재는_넣지_않는다() {
        MdmMetaCache.Ticket ticket = cache.ticket();
        cache.clear(9);
        assertThat(cache.put(MdmTargetType.DOMAIN, "1", "v", ticket)).isFalse();
        assertThat(cache.appliedSeq()).isEqualTo(9);
    }

    @Test
    void 지움_기록은_5분이_지나면_markApplied_때_정리된다() {
        cache.evict(MdmTargetType.COLUMN, "A", 6);
        cache.markApplied(6);
        assertThat(cache.tombstoneCount()).isEqualTo(1);
        clock.advance(Duration.ofMinutes(6));
        cache.markApplied(6);
        assertThat(cache.tombstoneCount()).isZero();
    }

    @Test
    void entries_는_대상_종류와_키_부분_일치로_거르고_남은_수명을_준다() {
        cache.put(MdmTargetType.COLUMN, "COIL_THK", "t", cache.ticket());
        cache.put(MdmTargetType.COLUMN, "COIL_WID", null, cache.ticket());
        cache.put(MdmTargetType.DOMAIN, "COIL", "d", cache.ticket());
        clock.advance(Duration.ofMinutes(10));

        var rows = cache.entries(MdmTargetType.COLUMN, "coil_t");

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).key()).isEqualTo("COIL_THK");
        assertThat(rows.get(0).remainingSeconds()).isEqualTo(50 * 60);
        assertThat(cache.entries(null, null)).hasSize(3);
    }
}
```

`CT/MdmMetaServiceTest.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** spec §5.2·§5.4·§7 「cactus 캐시」 — 묶음 조회, 없음 캐시, 동시 적재 1회, 장애 시 유지·건너뛰기. */
class MdmMetaServiceTest {

    private MutableClock clock;
    private FakeMetaFeed feed;
    private MdmMetaCache cache;
    private MdmMetaService service;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-10-02T00:00:00Z"));
        feed = new FakeMetaFeed().put(MdmTargetType.COLUMN, "A", "a").put(MdmTargetType.COLUMN, "B", "b");
        cache = new MdmMetaCache(100, Duration.ofMinutes(60), clock);
        cache.clear(0);
        service = new MdmMetaService(feed, cache, clock);
    }

    @Test
    void 캐시에_없는_키만_묶어_한_번에_요청하고_없는_키는_없음으로_캐시한다() {
        MdmMetaService.MdmLookup first = service.lookup(MdmTargetType.COLUMN, List.of("A", "B", "X"));

        assertThat(first.found()).containsEntry("A", "a").containsEntry("B", "b");
        assertThat(first.missing()).containsExactly("X");
        assertThat(first.unavailable()).isEmpty();
        assertThat(feed.fetchedKeys).containsExactly(List.of("A", "B", "X"));

        MdmMetaService.MdmLookup second = service.lookup(MdmTargetType.COLUMN, List.of("A", "X"));
        assertThat(second.found()).containsOnlyKeys("A");
        assertThat(second.missing()).containsExactly("X");
        assertThat(feed.fetchCalls.get()).isEqualTo(1);
    }

    @Test
    void 같은_키_동시_적재는_한_번만_한다() throws Exception {
        feed.fetchGate = new CountDownLatch(1);
        CompletableFuture<MdmMetaService.MdmLookup> t1 = CompletableFuture.supplyAsync(() -> service.lookup(MdmTargetType.COLUMN, List.of("A")));
        assertThat(feed.fetchEntered.await(5, TimeUnit.SECONDS)).isTrue();
        CompletableFuture<MdmMetaService.MdmLookup> t2 = CompletableFuture.supplyAsync(() -> service.lookup(MdmTargetType.COLUMN, List.of("A")));
        Thread.sleep(200);
        feed.fetchGate.countDown();

        assertThat(t1.get(5, TimeUnit.SECONDS).found()).containsEntry("A", "a");
        assertThat(t2.get(5, TimeUnit.SECONDS).found()).containsEntry("A", "a");
        assertThat(feed.fetchCalls.get()).isEqualTo(1);
    }

    @Test
    void MDM_실패는_unavailable_이고_없음으로_캐시하지_않는다() {
        feed.fetchError = new MdmUnavailableException("꺼짐");
        assertThat(service.lookup(MdmTargetType.COLUMN, List.of("A")).unavailable()).containsExactly("A");

        feed.fetchError = null;
        assertThat(service.lookup(MdmTargetType.COLUMN, List.of("A")).found()).containsEntry("A", "a");
        assertThat(feed.fetchCalls.get()).isEqualTo(2);
    }

    @Test
    void 연속_두_번_실패하면_30초_동안_MDM_을_부르지_않는다() {
        feed.fetchError = new MdmUnavailableException("꺼짐");
        service.lookup(MdmTargetType.COLUMN, List.of("A"));
        service.lookup(MdmTargetType.COLUMN, List.of("A"));
        assertThat(feed.fetchCalls.get()).isEqualTo(2);

        assertThat(service.lookup(MdmTargetType.COLUMN, List.of("A")).unavailable()).containsExactly("A");
        assertThat(feed.fetchCalls.get()).isEqualTo(2);
        assertThat(service.consecutiveFailures()).isEqualTo(2);

        clock.advance(Duration.ofSeconds(31));
        feed.fetchError = null;
        assertThat(service.lookup(MdmTargetType.COLUMN, List.of("A")).found()).containsEntry("A", "a");
        assertThat(feed.fetchCalls.get()).isEqualTo(3);
        assertThat(service.consecutiveFailures()).isZero();
    }

    @Test
    void 캐시에_있는_키는_MDM_이_죽어도_답한다() {
        service.lookup(MdmTargetType.COLUMN, List.of("A"));
        feed.fetchError = new MdmUnavailableException("꺼짐");
        assertThat(service.lookup(MdmTargetType.COLUMN, List.of("A")).found()).containsEntry("A", "a");
        assertThat(feed.fetchCalls.get()).isEqualTo(1);
    }

    @Test
    void MDM_이_만들지_못한_키는_unavailable_이지만_장애로_세지_않는다() {
        feed.failedKeys.put("B", "저장값 손상");
        for (int i = 0; i < 3; i++) {
            assertThat(service.lookup(MdmTargetType.COLUMN, List.of("B")).unavailable()).containsExactly("B");
        }
        assertThat(feed.fetchCalls.get()).isEqualTo(3);
        assertThat(service.consecutiveFailures()).isZero();
    }

    @Test
    void one_은_받을_수_없으면_MdmUnavailableException_이고_없으면_빈_값이다() {
        assertThat(service.one(MdmTargetType.COLUMN, "X")).isEmpty();
        assertThat(service.one(MdmTargetType.COLUMN, "A")).contains("a");
        feed.fetchError = new MdmUnavailableException("꺼짐");
        assertThatThrownBy(() -> service.one(MdmTargetType.COLUMN, "B")).isInstanceOf(MdmUnavailableException.class);
    }

    @Test
    void reload_는_이_인스턴스_캐시를_지우고_다시_받는다() {
        service.lookup(MdmTargetType.COLUMN, List.of("A"));
        feed.put(MdmTargetType.COLUMN, "A", "a2");

        assertThat(service.reload(MdmTargetType.COLUMN, List.of("A")).found()).containsEntry("A", "a2");
        assertThat(feed.fetchCalls.get()).isEqualTo(2);
    }
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `(cd src/backend/cactus-core && ./gradlew test --tests 'com.dongkuk.dmes.cactus.mdm.MdmMetaCacheTest' --tests 'com.dongkuk.dmes.cactus.mdm.MdmMetaServiceTest' --console=plain)`
Expected: FAIL — `cannot find symbol: class MdmMetaCache`.

- [ ] **Step 3: 캐시를 만든다**

`C/MdmMetaCache.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * MDM 메타 캐시(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.2) — 대상 종류별 {@code ConcurrentHashMap}. 항목은 값 또는
 * "없음", 적재 시각, 적재 직전 {@code appliedSeq}, 조회 수를 가진다. 합계가 {@code max-entries} 를 넘으면 적재가 오래된 순으로 지우고,
 * {@code max-age} 가 지난 항목은 조회 때 버린다. Caffeine 을 쓰지 않는다(§5.1).
 *
 * <p>적재와 경합(§5.3-5, Ruling R7): 적재는 시작할 때 {@link Ticket} 을 받는다. 넣을 때 캐시가 통째로 비워졌거나(generation 다름) 그 키가
 * {@code ticket.appliedSeq} 뒤의 변경으로 지워졌으면 넣지 않는다 — 늦게 도착한 옛 값이 남지 않는다. 지움 기록은 5분 뒤 정리한다.
 */
public final class MdmMetaCache {

    static final Duration TOMBSTONE_TTL = Duration.ofMinutes(5);

    private final int maxEntries;
    private final Duration maxAge;
    private final Clock clock;
    private final Map<MdmTargetType, ConcurrentHashMap<String, Entry>> maps = new EnumMap<>(MdmTargetType.class);
    private final ConcurrentHashMap<String, Tombstone> tombstones = new ConcurrentHashMap<>();
    private final AtomicLong generation = new AtomicLong();
    private volatile long appliedSeq = -1L;

    public MdmMetaCache(int maxEntries, Duration maxAge, Clock clock) {
        this.maxEntries = Math.max(1, maxEntries);
        this.maxAge = maxAge;
        this.clock = clock;
        for (MdmTargetType t : MdmTargetType.values()) {
            maps.put(t, new ConcurrentHashMap<>());
        }
    }

    /** 캐시 한 칸. {@code value} 가 null 이면 "MDM 에 없음"이다. */
    public static final class Entry {
        private final Object value;
        private final Instant loadedAt;
        private final long loadSeq;
        private final AtomicLong hits = new AtomicLong();

        Entry(Object value, Instant loadedAt, long loadSeq) {
            this.value = value;
            this.loadedAt = loadedAt;
            this.loadSeq = loadSeq;
        }

        public Object value() { return value; }
        public boolean absent() { return value == null; }
        public Instant loadedAt() { return loadedAt; }
        public long loadSeq() { return loadSeq; }
        public long hits() { return hits.get(); }
    }

    /** 적재 시작 때의 캐시 세대와 적용 순번. */
    public record Ticket(long generation, long appliedSeq) {
    }

    /** 관리 화면용 항목 한 줄. */
    public record EntryView(MdmTargetType type, String key, boolean absent, Object value, Instant loadedAt, long hits,
                            long remainingSeconds, long loadSeq) {
    }

    private record Tombstone(long seq, Instant at) {
    }

    public int maxEntries() {
        return maxEntries;
    }

    public Duration maxAge() {
        return maxAge;
    }

    /** 첫 폴링 전에는 -1. */
    public long appliedSeq() {
        return appliedSeq;
    }

    public Ticket ticket() {
        return new Ticket(generation.get(), appliedSeq);
    }

    public Optional<Entry> get(MdmTargetType type, String key) {
        ConcurrentHashMap<String, Entry> map = maps.get(type);
        Entry e = map.get(key);
        if (e == null) {
            return Optional.empty();
        }
        if (expired(e, clock.instant())) {
            map.remove(key, e);
            return Optional.empty();
        }
        e.hits.incrementAndGet();
        return Optional.of(e);
    }

    /** 적재 결과를 넣는다. 넣지 않았으면 false(경합 — 호출자는 값을 돌려주되 캐시하지 않은 것이다). */
    public synchronized boolean put(MdmTargetType type, String key, Object value, Ticket ticket) {
        if (ticket.generation() != generation.get()) {
            return false;
        }
        Tombstone t = tombstones.get(id(type, key));
        if (t != null && t.seq() > ticket.appliedSeq()) {
            return false;
        }
        maps.get(type).put(key, new Entry(value, clock.instant(), ticket.appliedSeq()));
        trim();
        return true;
    }

    /** 폴링이 받은 변경 하나 — 지우고 지움 기록을 남긴다. */
    public synchronized void evict(MdmTargetType type, String key, long seq) {
        maps.get(type).remove(key);
        tombstones.put(id(type, key), new Tombstone(seq, clock.instant()));
    }

    /** 이 인스턴스만 지운다(관리 화면 load). 지움 기록을 남기지 않는다. */
    public void evictLocal(MdmTargetType type, String key) {
        maps.get(type).remove(key);
    }

    /** 통째로 비운다(기동·truncated·역행, §5.3). 그 전에 시작한 적재는 넣지 않는다. */
    public synchronized void clear(long newAppliedSeq) {
        maps.values().forEach(Map::clear);
        tombstones.clear();
        generation.incrementAndGet();
        appliedSeq = newAppliedSeq;
    }

    public synchronized void markApplied(long seq) {
        appliedSeq = seq;
        Instant limit = clock.instant().minus(TOMBSTONE_TTL);
        tombstones.values().removeIf(t -> t.at().isBefore(limit));
    }

    public Map<MdmTargetType, Integer> sizes() {
        Map<MdmTargetType, Integer> out = new EnumMap<>(MdmTargetType.class);
        maps.forEach((t, m) -> out.put(t, m.size()));
        return out;
    }

    /** 대상 종류(null 이면 전체)·키 부분 일치(대소문자 무시)로 거른 항목. 종류·키 순. */
    public List<EntryView> entries(MdmTargetType type, String q) {
        Instant now = clock.instant();
        String needle = q == null || q.isBlank() ? null : q.trim().toUpperCase(Locale.ROOT);
        List<EntryView> out = new ArrayList<>();
        for (MdmTargetType t : MdmTargetType.values()) {
            if (type != null && type != t) {
                continue;
            }
            maps.get(t).forEach((k, e) -> {
                if (expired(e, now) || (needle != null && !k.toUpperCase(Locale.ROOT).contains(needle))) {
                    return;
                }
                long remaining = Math.max(0L, Duration.between(now, e.loadedAt().plus(maxAge)).getSeconds());
                out.add(new EntryView(t, k, e.absent(), e.value(), e.loadedAt(), e.hits(), remaining, e.loadSeq()));
            });
        }
        out.sort(Comparator.comparing((EntryView v) -> v.type().ordinal()).thenComparing(EntryView::key));
        return out;
    }

    int tombstoneCount() {
        return tombstones.size();
    }

    private void trim() {
        int over = maps.values().stream().mapToInt(Map::size).sum() - maxEntries;
        if (over <= 0) {
            return;
        }
        record Slot(MdmTargetType type, String key, Instant at) {
        }
        List<Slot> all = new ArrayList<>();
        maps.forEach((t, m) -> m.forEach((k, e) -> all.add(new Slot(t, k, e.loadedAt()))));
        all.sort(Comparator.comparing(Slot::at));
        for (int i = 0; i < over && i < all.size(); i++) {
            maps.get(all.get(i).type()).remove(all.get(i).key());
        }
    }

    private boolean expired(Entry e, Instant now) {
        return !e.loadedAt().plus(maxAge).isAfter(now);
    }

    private static String id(MdmTargetType type, String key) {
        return type.name() + ':' + key;
    }
}
```

- [ ] **Step 4: 조회 서비스를 만든다**

`C/MdmMetaService.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * MDM 메타 조회 입구(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.2·§5.4). 여러 키를 받아 캐시에 없는 키만 모아 MDM 에
 * 한 번 요청하고, 응답에 없는 키는 "없음"으로 캐시한다. 같은 키 동시 적재는 한 번만 한다(진행 중인 적재를 기다린다).
 *
 * <p>MDM 장애: 캐시에 있는 항목은 계속 답한다. 캐시에 없는 키는 {@code unavailable}({@link #one} 은 {@link MdmUnavailableException})이고
 * "없음"으로 캐시하지 않는다. 연속 {@value #SKIP_AFTER_FAILURES}번 실패하면 30초 동안 MDM 을 부르지 않고 바로 실패로 답한다(Ruling R6).
 * MDM 이 정의를 만들지 못한 키(failed)도 unavailable 이지만 장애로 세지 않는다(Ruling R4).
 */
public class MdmMetaService {

    static final Duration SKIP_FOR = Duration.ofSeconds(30);
    static final int SKIP_AFTER_FAILURES = 2;
    /** 다른 요청의 진행 중 적재를 기다리는 한도 — 연결·읽기 시간 초과 합보다 길다. */
    static final Duration WAIT_LIMIT = Duration.ofSeconds(30);

    private final MdmMetaFeed feed;
    private final MdmMetaCache cache;
    private final Clock clock;
    private final ConcurrentHashMap<String, CompletableFuture<Optional<Object>>> inflight = new ConcurrentHashMap<>();
    private final AtomicInteger failures = new AtomicInteger();
    private volatile Instant skipUntil;

    public MdmMetaService(MdmMetaFeed feed, MdmMetaCache cache, Clock clock) {
        this.feed = feed;
        this.cache = cache;
        this.clock = clock;
    }

    /** 찾은 키의 값, MDM 에 없는 키, 지금 받을 수 없는 키. 요청 순서를 지킨다. */
    public record MdmLookup(Map<String, Object> found, List<String> missing, List<String> unavailable) {
    }

    public MdmLookup lookup(MdmTargetType type, Collection<String> keys) {
        Map<String, Object> found = new LinkedHashMap<>();
        List<String> missing = new ArrayList<>();
        List<String> unavailable = new ArrayList<>();
        Map<String, CompletableFuture<Optional<Object>>> mine = new LinkedHashMap<>();
        Map<String, CompletableFuture<Optional<Object>>> waiting = new LinkedHashMap<>();
        for (String key : new LinkedHashSet<>(keys)) {
            if (key == null || key.isBlank()) {
                continue;
            }
            Optional<MdmMetaCache.Entry> hit = cache.get(type, key);
            if (hit.isPresent()) {
                if (hit.get().absent()) {
                    missing.add(key);
                } else {
                    found.put(key, hit.get().value());
                }
                continue;
            }
            CompletableFuture<Optional<Object>> f = new CompletableFuture<>();
            CompletableFuture<Optional<Object>> running = inflight.putIfAbsent(id(type, key), f);
            if (running == null) {
                mine.put(key, f);
            } else {
                waiting.put(key, running);
            }
        }
        if (!mine.isEmpty()) {
            load(type, mine);
        }
        Map<String, CompletableFuture<Optional<Object>>> all = new LinkedHashMap<>(mine);
        all.putAll(waiting);
        all.forEach((key, f) -> {
            try {
                Optional<Object> v = f.get(WAIT_LIMIT.toMillis(), TimeUnit.MILLISECONDS);
                if (v.isPresent()) {
                    found.put(key, v.get());
                } else {
                    missing.add(key);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                unavailable.add(key);
            } catch (ExecutionException | TimeoutException e) {
                unavailable.add(key);
            }
        });
        return new MdmLookup(found, missing, unavailable);
    }

    /** 키 하나. 없으면 빈 값, 받을 수 없으면 {@link MdmUnavailableException}. */
    public Optional<Object> one(MdmTargetType type, String key) {
        MdmLookup r = lookup(type, List.of(key));
        if (!r.unavailable().isEmpty()) {
            throw new MdmUnavailableException("MDM 정의를 받을 수 없습니다: " + type + " " + key);
        }
        return Optional.ofNullable(r.found().get(key));
    }

    /** 이 인스턴스 캐시에서 지우고 다시 받는다(관리 화면 load). */
    public MdmLookup reload(MdmTargetType type, Collection<String> keys) {
        for (String k : keys) {
            if (k != null) {
                cache.evictLocal(type, k);
            }
        }
        return lookup(type, keys);
    }

    public int consecutiveFailures() {
        return failures.get();
    }

    private void load(MdmTargetType type, Map<String, CompletableFuture<Optional<Object>>> mine) {
        MdmMetaCache.Ticket ticket = cache.ticket();
        try {
            Instant until = skipUntil;
            if (until != null && clock.instant().isBefore(until)) {
                MdmUnavailableException skipped = new MdmUnavailableException("MDM 연속 실패로 " + until + " 까지 호출을 건너뜁니다");
                mine.values().forEach(f -> f.completeExceptionally(skipped));
                return;
            }
            MdmFetchResult result;
            try {
                result = feed.fetch(type, mine.keySet());
            } catch (RuntimeException e) {
                if (failures.incrementAndGet() >= SKIP_AFTER_FAILURES) {
                    skipUntil = clock.instant().plus(SKIP_FOR);
                }
                mine.values().forEach(f -> f.completeExceptionally(e));
                return;
            }
            failures.set(0);
            skipUntil = null;
            mine.forEach((key, f) -> {
                String failed = result.failed().get(key);
                if (failed != null) {
                    f.completeExceptionally(new MdmUnavailableException(failed));
                    return;
                }
                Object value = result.found().get(key);
                cache.put(type, key, value, ticket);
                f.complete(Optional.ofNullable(value));
            });
        } finally {
            mine.forEach((key, f) -> {
                f.completeExceptionally(new MdmUnavailableException("적재가 끝나지 않았습니다: " + key)); // 이미 끝났으면 무시된다
                inflight.remove(id(type, key), f);
            });
        }
    }

    private static String id(MdmTargetType type, String key) {
        return type.name() + ':' + key;
    }
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `(cd src/backend/cactus-core && ./gradlew test --tests 'com.dongkuk.dmes.cactus.mdm.*' --console=plain)`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm
/usr/bin/git commit -m "$(cat <<'EOF'
feat(cactus-core): MDM 메타 캐시와 묶음 조회·동시 적재 1회·장애 건너뛰기 서비스를 더한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: cactus 폴러 — `MdmRevisionPoller`(리비전 규칙 다섯 가지, RELOAD, 실패 시 유지)

**Files:**
- Create: `C/MdmRevisionPoller.java`
- Test: `CT/MdmRevisionPollerTest.java`

**Interfaces:**
- Consumes: Task 6 `MdmMetaFeed.changes`, `MdmChanges`, `MdmChange`, `MdmTargetType.parse`; Task 7 `MdmMetaCache.appliedSeq()`·`clear(long)`·`evict(type,key,seq)`·`markApplied(long)`, `MdmMetaService.lookup`, 시험 도우미 `FakeMetaFeed`·`MutableClock`.
- Produces: `MdmRevisionPoller(MdmMetaFeed feed, MdmMetaCache cache, MdmMetaService service, Clock clock, Duration interval, int pageLimit) implements AutoCloseable`: `void pollOnce()`(던지지 않는다), `void start()`, `void close()`, `Status status()`; `record Status(long appliedSeq, long latestSeq, Instant lastSuccessAt, int consecutiveFailures, String lastError)`.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`CT/MdmRevisionPollerTest.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** spec §5.3 리비전 규칙 다섯 가지 + RELOAD + 장애 시 유지(§5.4) — 가짜 피드·가짜 시계. */
class MdmRevisionPollerTest {

    private MutableClock clock;
    private FakeMetaFeed feed;
    private MdmMetaCache cache;
    private MdmMetaService service;
    private MdmRevisionPoller poller;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-10-02T00:00:00Z"));
        feed = new FakeMetaFeed().put(MdmTargetType.COLUMN, "A", "a").put(MdmTargetType.COLUMN, "B", "b")
                .put(MdmTargetType.DOMAIN, "3", "d3");
        cache = new MdmMetaCache(100, Duration.ofMinutes(60), clock);
        service = new MdmMetaService(feed, cache, clock);
        poller = new MdmRevisionPoller(feed, cache, service, clock, Duration.ofSeconds(10), 1000);
    }

    private static MdmChanges changes(long latest, boolean truncated, MdmChange... items) {
        return new MdmChanges(latest, List.of(items), truncated);
    }

    private void started(long latest) {
        feed.changes.add(changes(latest, false));
        poller.pollOnce();
    }

    @Test
    void 규칙1_첫_폴링은_latestSeq_를_appliedSeq_로_삼고_그_전에_적재한_항목을_비운다() {
        service.lookup(MdmTargetType.COLUMN, List.of("A"));
        assertThat(cache.sizes().get(MdmTargetType.COLUMN)).isEqualTo(1);

        started(5);

        assertThat(feed.changesSince).containsExactly(0L);
        assertThat(cache.appliedSeq()).isEqualTo(5);
        assertThat(cache.sizes().get(MdmTargetType.COLUMN)).isZero();
        assertThat(poller.status().latestSeq()).isEqualTo(5);
        assertThat(poller.status().lastSuccessAt()).isEqualTo(clock.instant());
    }

    @Test
    void 규칙1_MDM_이_꺼져_첫_폴링이_실패하면_처음_성공할_때_같은_규칙을_적용한다() {
        feed.changes.add(new MdmUnavailableException("꺼짐"));
        poller.pollOnce();
        assertThat(cache.appliedSeq()).isEqualTo(-1);
        assertThat(poller.status().consecutiveFailures()).isEqualTo(1);

        started(7);
        assertThat(cache.appliedSeq()).isEqualTo(7);
        assertThat(poller.status().consecutiveFailures()).isZero();
    }

    @Test
    void 규칙2_정상_폴링은_받은_키만_지우고_appliedSeq_를_마지막_seq_로_올린다() {
        started(5);
        service.lookup(MdmTargetType.COLUMN, List.of("A", "B"));
        service.lookup(MdmTargetType.DOMAIN, List.of("3"));

        feed.changes.add(changes(7, false, new MdmChange(6, "COLUMN", "A", "SAVE"), new MdmChange(7, "DOMAIN", "3", "SAVE")));
        poller.pollOnce();

        assertThat(feed.changesSince).containsExactly(0L, 5L);
        assertThat(cache.appliedSeq()).isEqualTo(7);
        assertThat(cache.get(MdmTargetType.COLUMN, "A")).isEmpty();
        assertThat(cache.get(MdmTargetType.DOMAIN, "3")).isEmpty();
        assertThat(cache.get(MdmTargetType.COLUMN, "B")).isPresent();
    }

    @Test
    void 규칙3_truncated_면_캐시를_비우고_appliedSeq_를_latestSeq_로_둔다() {
        started(5);
        service.lookup(MdmTargetType.COLUMN, List.of("B"));

        feed.changes.add(changes(5000, true, new MdmChange(6, "COLUMN", "A", "SAVE")));
        poller.pollOnce();

        assertThat(cache.appliedSeq()).isEqualTo(5000);
        assertThat(cache.get(MdmTargetType.COLUMN, "B")).isEmpty();
    }

    @Test
    void 규칙4_latestSeq_가_appliedSeq_보다_작으면_역행으로_보고_비운다() {
        started(50);
        service.lookup(MdmTargetType.COLUMN, List.of("B"));

        feed.changes.add(changes(2, false));
        poller.pollOnce();

        assertThat(cache.appliedSeq()).isEqualTo(2);
        assertThat(cache.get(MdmTargetType.COLUMN, "B")).isEmpty();
    }

    @Test
    void 규칙5_경합_적재_결과는_캐시에_남지_않고_다음_조회가_다시_받는다() {
        started(5);
        MdmMetaCache.Ticket before = cache.ticket(); // 적재가 이 시점에 시작했다고 친다
        feed.changes.add(changes(6, false, new MdmChange(6, "COLUMN", "A", "SAVE")));
        poller.pollOnce();

        assertThat(cache.put(MdmTargetType.COLUMN, "A", "옛 값", before)).isFalse();
        assertThat(service.lookup(MdmTargetType.COLUMN, List.of("A")).found()).containsEntry("A", "a");
        assertThat(feed.fetchCalls.get()).isEqualTo(1);
    }

    @Test
    void RELOAD_는_지운_뒤_바로_다시_적재한다() {
        started(5);
        service.lookup(MdmTargetType.COLUMN, List.of("A"));
        feed.put(MdmTargetType.COLUMN, "A", "a2");

        feed.changes.add(changes(6, false, new MdmChange(6, "COLUMN", "A", "RELOAD")));
        poller.pollOnce();

        assertThat(cache.get(MdmTargetType.COLUMN, "A").orElseThrow().value()).isEqualTo("a2");
        assertThat(feed.fetchCalls.get()).isEqualTo(2);
    }

    @Test
    void EVICT_와_모르는_종류() {
        started(5);
        service.lookup(MdmTargetType.COLUMN, List.of("A"));
        feed.changes.add(changes(7, false, new MdmChange(6, "COLUMN", "A", "EVICT"), new MdmChange(7, "TABLE", "Z", "SAVE")));
        poller.pollOnce();

        assertThat(cache.get(MdmTargetType.COLUMN, "A")).isEmpty();
        assertThat(cache.appliedSeq()).isEqualTo(7);
        assertThat(feed.fetchCalls.get()).isEqualTo(1);
    }

    @Test
    void 폴링_실패는_캐시를_비우지_않고_실패_수와_마지막_오류만_남긴다() {
        started(5);
        service.lookup(MdmTargetType.COLUMN, List.of("A"));
        Instant lastOk = poller.status().lastSuccessAt();
        clock.advance(Duration.ofSeconds(10));

        feed.changes.add(new MdmUnavailableException("꺼짐"));
        poller.pollOnce();
        feed.changes.add(new MdmUnavailableException("꺼짐"));
        poller.pollOnce();

        assertThat(cache.get(MdmTargetType.COLUMN, "A")).isPresent();
        assertThat(cache.appliedSeq()).isEqualTo(5);
        assertThat(poller.status().consecutiveFailures()).isEqualTo(2);
        assertThat(poller.status().lastError()).contains("꺼짐");
        assertThat(poller.status().lastSuccessAt()).isEqualTo(lastOk);
    }
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `(cd src/backend/cactus-core && ./gradlew test --tests 'com.dongkuk.dmes.cactus.mdm.MdmRevisionPollerTest' --console=plain)`
Expected: FAIL — `cannot find symbol: class MdmRevisionPoller`.

- [ ] **Step 3: 폴러를 만든다**

`C/MdmRevisionPoller.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * MDM 변경 기록 폴러(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.3) — {@code poll-interval} 마다
 * {@code changes(since=appliedSeq)} 를 받아 키를 지운다. 규칙: ① 기동 — 첫 성공에서 latestSeq 를 appliedSeq 로 삼고 그 전 항목을 비운다
 * (첫 폴링이 실패하면 처음 성공할 때 같은 규칙) ② 정상 — 받은 키를 지우고 appliedSeq = 마지막 seq ③ truncated — 전부 비우고 appliedSeq = latestSeq
 * ④ 역행(latestSeq < appliedSeq) — 전부 비우고 appliedSeq = latestSeq ⑤ 경합 — {@link MdmMetaCache} 의 Ticket 이 막는다. RELOAD 는 지운 뒤
 * 바로 다시 적재한다. 폴링이 계속 실패해도 캐시를 비우지 않는다(§5.4).
 *
 * <p>스케줄러는 자체 단일 데몬 스레드다(cactus-core 에 스케줄링 선례가 없고, mcm-core 의 {@code @EnableScheduling} 에 기대지 않는다).
 * 로그는 첫 실패만 WARN, 복구 때 INFO 한 줄(Ruling R12).
 */
public class MdmRevisionPoller implements AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(MdmRevisionPoller.class);
    static final String RELOAD = "RELOAD";

    private final MdmMetaFeed feed;
    private final MdmMetaCache cache;
    private final MdmMetaService service;
    private final Clock clock;
    private final Duration interval;
    private final int pageLimit;
    private final AtomicInteger consecutiveFailures = new AtomicInteger();
    private volatile long latestSeq = -1L;
    private volatile Instant lastSuccessAt;
    private volatile String lastError;
    private ScheduledExecutorService executor;

    public MdmRevisionPoller(MdmMetaFeed feed, MdmMetaCache cache, MdmMetaService service, Clock clock, Duration interval, int pageLimit) {
        this.feed = feed;
        this.cache = cache;
        this.service = service;
        this.clock = clock;
        this.interval = interval;
        this.pageLimit = Math.max(1, pageLimit);
    }

    public record Status(long appliedSeq, long latestSeq, Instant lastSuccessAt, int consecutiveFailures, String lastError) {
    }

    public Status status() {
        return new Status(cache.appliedSeq(), latestSeq, lastSuccessAt, consecutiveFailures.get(), lastError);
    }

    public synchronized void start() {
        if (executor != null) {
            return;
        }
        executor = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "mdm-revision-poller");
            t.setDaemon(true);
            return t;
        });
        executor.scheduleWithFixedDelay(this::pollQuietly, 0L, interval.toMillis(), TimeUnit.MILLISECONDS);
    }

    @Override
    public synchronized void close() {
        if (executor != null) {
            executor.shutdownNow();
            executor = null;
        }
    }

    /** 한 번 확인한다. 예외를 던지지 않는다 — 실패는 상태에 남긴다. */
    public synchronized void pollOnce() {
        try {
            long applied = cache.appliedSeq();
            if (applied < 0) {
                MdmChanges first = feed.changes(0L, 1);
                latestSeq = first.latestSeq();
                cache.clear(first.latestSeq());
                succeeded();
                return;
            }
            MdmChanges c = feed.changes(applied, pageLimit);
            latestSeq = c.latestSeq();
            if (c.truncated() || c.latestSeq() < applied) {
                log.info("[mdm] 캐시를 비운다 — {} (applied {}, latest {})", c.truncated() ? "변경이 한 번에 받을 수를 넘었다" : "순번 역행",
                        applied, c.latestSeq());
                cache.clear(c.latestSeq());
                succeeded();
                return;
            }
            long last = applied;
            Map<MdmTargetType, Set<String>> reload = new EnumMap<>(MdmTargetType.class);
            for (MdmChange ch : c.items()) {
                last = Math.max(last, ch.seq());
                Optional<MdmTargetType> type = MdmTargetType.parse(ch.type());
                if (type.isEmpty() || ch.key() == null) {
                    log.debug("[mdm] 모르는 변경 기록을 건너뛴다: {}", ch);
                    continue;
                }
                cache.evict(type.get(), ch.key(), ch.seq());
                if (RELOAD.equals(ch.kind())) {
                    reload.computeIfAbsent(type.get(), t -> new LinkedHashSet<>()).add(ch.key());
                }
            }
            cache.markApplied(last);
            succeeded();
            reload.forEach(service::lookup); // 받을 수 없는 키는 unavailable 로 돌아오고 캐시에 남지 않는다
        } catch (RuntimeException e) {
            lastError = e.getMessage();
            if (consecutiveFailures.incrementAndGet() == 1) {
                log.warn("[mdm] 변경 기록 확인 실패 — 캐시는 그대로 쓴다: {}", e.getMessage());
            } else {
                log.debug("[mdm] 변경 기록 확인 실패 {}회째: {}", consecutiveFailures.get(), e.getMessage());
            }
        }
    }

    private void pollQuietly() {
        try {
            pollOnce();
        } catch (Throwable t) {
            log.error("[mdm] 폴러 오류", t);
        }
    }

    private void succeeded() {
        if (consecutiveFailures.getAndSet(0) > 0) {
            log.info("[mdm] 변경 기록 확인 복구 (applied {})", cache.appliedSeq());
        }
        lastSuccessAt = clock.instant();
        lastError = null;
    }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `(cd src/backend/cactus-core && ./gradlew test --tests 'com.dongkuk.dmes.cactus.mdm.*' --console=plain)`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmRevisionPoller.java \
  src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmRevisionPollerTest.java
/usr/bin/git commit -m "$(cat <<'EOF'
feat(cactus-core): MDM 변경 기록을 10초마다 확인해 바뀐 키만 지우는 폴러를 더한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 9: 엔진 spi 구현 `MdmDefinitionLookup`·이름 정규화와 피드↔클라이언트 계약 시험

**Files:**
- Create: `C/MdmNames.java`, `C/MdmDefinitionLookup.java`
- Test: `CT/MdmNamesTest.java`, `CT/MdmDefinitionLookupTest.java`, `AT/feed/MdmMetaFeedContractHttpTest.java`(mdm — 실제 MDM HTTP ↔ 실제 cactus 클라이언트)

**Interfaces:**
- Consumes: Task 7 `MdmMetaService.one(MdmTargetType, String)`, Task 6 `MdmColumnMeta`·`MdmMetaClient`, Task 7 `MdmMetaCache`, 시험 도우미 `FakeMetaFeed`·`MutableClock`. 엔진 `DefinitionLookup`(`column(String table, String column)`, `rule(String ruleId, Instant evalTs)`, `ruleSet(String setId)`), `CodeLookup.code(String)`, `DefaultDomainValidator(DefinitionLookup, MdmEvaluator)`, `MdmEvaluator(EngineLookups)`, `EngineLookups(DefinitionLookup, CodeLookup, CodeEffLookup, MasterLookup, FunctionProvider)`. mdm 시험 쪽: Task 5 피드, `DmeTestSupport.sampleRule/released/sampleDefinition/ruleSet`, `MasterCodeSeeds`, `StoredDefinitionLookup`(비교 기준).
- Produces:
  - `MdmNames.toPhysName(String) → String`(camelCase → UPPER_SNAKE, 이미 대문자면 그대로, 비면 null)
  - `MdmDefinitionLookup(MdmMetaService) implements DefinitionLookup, CodeLookup` + `static Optional<RuleDefinition> select(List<RuleDefinition>, Instant)` + `static ColumnDefinition toColumnDefinition(MdmColumnMeta, String table)` + `static final ZoneId KST`
  - MDM 정의를 실제 HTTP 로 받은 엔진 판정이 MDM 원장 판정과 같다는 계약(Review Focus 1)

- [ ] **Step 1: 실패하는 시험을 쓴다**

`CT/MdmNamesTest.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** spec §5.5 이름 정규화 — 소문자가 섞이면 camelCase 로 보고 UPPER_SNAKE, 이미 대문자면 그대로. */
class MdmNamesTest {

    @Test
    void camelCase_는_UPPER_SNAKE_로_바꾸고_대문자는_그대로_둔다() {
        assertThat(MdmNames.toPhysName("codeNm")).isEqualTo("CODE_NM");
        assertThat(MdmNames.toPhysName("coilThk")).isEqualTo("COIL_THK");
        assertThat(MdmNames.toPhysName("item2Cd")).isEqualTo("ITEM2_CD");
        assertThat(MdmNames.toPhysName("lvl1")).isEqualTo("LVL1");
        assertThat(MdmNames.toPhysName("Code_nm")).isEqualTo("CODE_NM");
        assertThat(MdmNames.toPhysName("CODE_NM")).isEqualTo("CODE_NM");
        assertThat(MdmNames.toPhysName(" COIL_THK ")).isEqualTo("COIL_THK");
    }

    @Test
    void 비거나_null_이면_null() {
        assertThat(MdmNames.toPhysName(null)).isNull();
        assertThat(MdmNames.toPhysName("  ")).isNull();
    }
}
```

`CT/MdmDefinitionLookupTest.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.domain.DefaultDomainValidator;
import kr.dongkuk.maru.mdm.engine.domain.DomainValidator;
import kr.dongkuk.maru.mdm.engine.domain.DomainValidator.Step;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.ColumnDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DomainKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.InputContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import kr.dongkuk.maru.mdm.engine.spi.MasterLookup;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** spec §5.2·§7 「엔진 연동」 — MdmDefinitionLookup 으로 DomainValidator 가 돌고, 룰은 적용 기간 경계에서 판정 시각으로 고른다. */
class MdmDefinitionLookupTest {

    private static final Instant NOW = Instant.parse("2026-10-02T00:00:00Z");

    private FakeMetaFeed feed;
    private MdmDefinitionLookup lookup;
    private DomainValidator validator;

    @BeforeEach
    void setUp() {
        MutableClock clock = new MutableClock(NOW);
        feed = new FakeMetaFeed();
        MdmMetaCache cache = new MdmMetaCache(100, Duration.ofMinutes(60), clock);
        cache.clear(0);
        lookup = new MdmDefinitionLookup(new MdmMetaService(feed, cache, clock));
        MdmEvaluator evaluator = new MdmEvaluator(new EngineLookups(lookup, lookup, CodeEffLookup.NONE, MasterLookup.NONE, FunctionProvider.NONE));
        validator = new DefaultDomainValidator(lookup, evaluator);
    }

    static MdmColumnMeta qty(String phys, String stdExpr, Integer scale) {
        return new MdmColumnMeta(phys, "이름", null, null, null, null, null, "NUMBER", 10, scale, true, null, null, null, null,
                new MdmColumnMeta.DomainRef("7", "두께", "QTY"), stdExpr == null ? null : new MdmColumnMeta.Expr(stdExpr, null),
                null, List.of(), null);
    }

    static RuleDefinition rule(int ver, LocalDateTime from, LocalDateTime to) {
        return new RuleDefinition("R", ver, RuleKind.DECISION, HitPolicy.FIRST, from, to, "1", List.of(),
                new InputContract(List.of(), List.of()), List.of());
    }

    @Test
    void column_은_camelCase_이름도_물리명으로_찾아_ColumnDefinition_을_만든다() {
        feed.put(MdmTargetType.COLUMN, "COIL_THK", qty("COIL_THK", "value >= 0", 2));

        ColumnDefinition d = lookup.column("TB_ANY", "coilThk").orElseThrow();

        assertThat(d.table()).isEqualTo("TB_ANY");
        assertThat(d.column()).isEqualTo("COIL_THK");
        assertThat(d.domainKind()).isEqualTo(DomainKind.QTY);
        assertThat(d.dataType()).isEqualTo(DataType.NUMBER);
        assertThat(d.scale()).isEqualTo(2);
        assertThat(d.required()).isTrue();
        assertThat(d.effectiveStdExpr()).isEqualTo("value >= 0");
        assertThat(d.bizRequiredVars()).isEmpty();
        assertThat(lookup.column("TB_ANY", "NO_SUCH")).isEmpty();
    }

    @Test
    void 도메인_없는_컬럼은_TEXT_STRING_으로_본다() {
        feed.put(MdmTargetType.COLUMN, "MEMO", new MdmColumnMeta("MEMO", "메모", null, null, null, null, null, null, null, null, false,
                null, null, null, null, null, null, null, null, null));
        ColumnDefinition d = lookup.column("T", "MEMO").orElseThrow();
        assertThat(d.domainKind()).isEqualTo(DomainKind.TEXT);
        assertThat(d.dataType()).isEqualTo(DataType.STRING);
        assertThat(d.bizRequiredVars()).isEmpty();
    }

    @Test
    void DomainValidator_가_캐시된_정의로_필수와_표준식을_검증한다() {
        feed.put(MdmTargetType.COLUMN, "COIL_THK", qty("COIL_THK", "value >= 0", 2));

        assertThat(validator.validate("TB_ANY", "COIL_THK", Map.of("COIL_THK", "1.5"), NOW).valid()).isTrue();
        DomainValidator.ValidationResult bad = validator.validate("TB_ANY", "COIL_THK", Map.of("COIL_THK", "-1"), NOW);
        assertThat(bad.valid()).isFalse();
        assertThat(bad.failures().get(0).step()).isEqualTo(Step.STD_EXPR);
        Map<String, Object> blank = new HashMap<>();
        blank.put("COIL_THK", null);
        assertThat(validator.validate("TB_ANY", "COIL_THK", blank, NOW).failures().get(0).step()).isEqualTo(Step.REQUIRED);
    }

    @Test
    void CODE_도메인_컬럼은_캐시된_코드_원본으로_MASTER_를_판정한다() {
        CodeRows rows = new CodeRows(new CodeHeader("PROC_CD", "INUSE"),
                List.of(new CodeVersionRow(new BigDecimal("1.000"), "RELEASED", LocalDateTime.of(2026, 1, 1, 0, 0),
                        LocalDateTime.of(9999, 12, 31, 0, 0))),
                List.of(new CodeItemRow("A", new BigDecimal("1.000"), new BigDecimal("9999.000"), "에이", null, 1,
                        Arrays.asList(new String[5]), Arrays.asList(new String[10]))),
                List.of(new CodeCateRow("BASE", new BigDecimal("1.000"), new BigDecimal("9999.000"), "REGEX", ".*", "CODE")),
                List.of());
        feed.put(MdmTargetType.CODE, "PROC_CD", rows);
        feed.put(MdmTargetType.COLUMN, "PROC_COL", new MdmColumnMeta("PROC_COL", "공정", null, null, null, null, null, "STRING", 10, null,
                false, null, null, null, null, new MdmColumnMeta.DomainRef("8", "공정", "CODE"), null, null, List.of(),
                new MdmColumnMeta.CodeRefMeta("PROC_CD", "BASE")));

        assertThat(validator.validate("T", "PROC_COL", Map.of("PROC_COL", "A"), NOW).valid()).isTrue();
        assertThat(validator.validate("T", "PROC_COL", Map.of("PROC_COL", "Z"), NOW).valid()).isFalse();
        assertThat(lookup.code("PROC_CD")).contains(rows);
    }

    @Test
    void rule_은_판정_시각이_적용_기간에_든_RELEASED_버전을_고른다_경계() {
        feed.put(MdmTargetType.RULE, "R", List.of(
                rule(1, LocalDateTime.of(2026, 1, 1, 0, 0), LocalDateTime.of(2026, 7, 1, 0, 0)),
                rule(2, LocalDateTime.of(2026, 7, 1, 0, 0), LocalDateTime.of(9999, 12, 31, 0, 0))));

        Instant beforeSwitch = LocalDateTime.of(2026, 6, 30, 23, 59, 59).atZone(MdmDefinitionLookup.KST).toInstant();
        Instant atSwitch = LocalDateTime.of(2026, 7, 1, 0, 0).atZone(MdmDefinitionLookup.KST).toInstant();
        Instant beforeAll = LocalDateTime.of(2025, 12, 31, 23, 59, 59).atZone(MdmDefinitionLookup.KST).toInstant();

        assertThat(lookup.rule("R", beforeSwitch).orElseThrow().ver()).isEqualTo(1);
        assertThat(lookup.rule("R", atSwitch).orElseThrow().ver()).isEqualTo(2);
        assertThat(lookup.rule("R", beforeAll)).isEmpty();
        assertThat(lookup.rule("NO", atSwitch)).isEmpty();
    }

    @Test
    void ruleSet_은_캐시_값을_그대로_준다() {
        RuleSetDefinition set = new RuleSetDefinition("S", List.of("R"), SetStatus.INUSE, null);
        feed.put(MdmTargetType.RULE_SET, "S", set);
        assertThat(lookup.ruleSet("S")).contains(set);
    }

    @Test
    void MDM_을_받을_수_없으면_엔진_호출이_MdmUnavailableException_을_받는다() {
        feed.fetchError = new MdmUnavailableException("꺼짐");
        assertThatThrownBy(() -> lookup.column("T", "COIL_THK")).isInstanceOf(MdmUnavailableException.class);
    }
}
```

`AT/feed/MdmMetaFeedContractHttpTest.java`:

```java
package com.dongkuk.dmes.mdm.feed;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.mdm.MdmDefinitionLookup;
import com.dongkuk.dmes.cactus.mdm.MdmMetaCache;
import com.dongkuk.dmes.cactus.mdm.MdmMetaClient;
import com.dongkuk.dmes.cactus.mdm.MdmMetaService;
import com.dongkuk.dmes.cactus.mdm.MdmTargetType;
import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionLookup;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;
import javax.sql.DataSource;
import kr.dongkuk.maru.mdm.engine.domain.DefaultDomainValidator;
import kr.dongkuk.maru.mdm.engine.domain.DomainValidator;
import kr.dongkuk.maru.mdm.engine.expr.AstExporter;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import kr.dongkuk.maru.mdm.engine.spi.MasterLookup;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.client.RestClient;

/**
 * Review Focus 1 — 피드(MDM)와 클라이언트(cactus)를 실제 HTTP 로 잇는 계약 시험(spec 2026-10-02 §3.4·§5.2). 양쪽 단위 시험은 각자 가짜를
 * 쓰므로 JSON 표류(LocalDateTime 형식·BigDecimal·Map&lt;Integer,…&gt; 키·enum·null)를 못 잡는다. MDM 원장에서 직접 만든 정의
 * ({@link StoredDefinitionLookup}, 빈이 아니라 new)와 HTTP 로 받아 되읽은 정의가 같은 판정을 내는지 본다.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + MdmMetaFeedContractHttpTest.TEST_CLIENT_KEY)
@ActiveProfiles("local")
class MdmMetaFeedContractHttpTest {

    static final String TEST_CLIENT_KEY = "mdm-feed-contract-test-key";
    private static final String Q = "QLTY_GRD_JDG";

    @TempDir
    static Path tempDir;

    @LocalServerPort
    int port;

    @Autowired
    DataSource dataSource;
    @Autowired
    MdmEvaluator mdmEvaluator;
    @Autowired
    RuleQueries ruleQueries;
    @Autowired
    StoredRuleDefinitions storedRuleDefinitions;
    @Autowired
    MdmRuleRepository ruleRepository;
    @Autowired
    MdmRuleSetRepository ruleSetRepository;

    private JdbcTemplate jdbc;
    private MdmMetaService service;
    private MdmDefinitionLookup lookup;
    private DomainValidator validator;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-feed-contract-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        MetaRevTestSupport.clear(jdbc);
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        new MasterCodeSeeds(jdbc).clear();

        RestClient restClient = RestClient.builder().defaultHeader("X-Client-Key", effectiveClientKey()).build();
        MdmMetaClient client = new MdmMetaClient(restClient, "http://127.0.0.1:" + port, "mls");
        MdmMetaCache cache = new MdmMetaCache(1000, Duration.ofMinutes(60), Clock.systemUTC());
        cache.clear(0);
        service = new MdmMetaService(client, cache, Clock.systemUTC());
        lookup = new MdmDefinitionLookup(service);
        validator = new DefaultDomainValidator(lookup,
                new MdmEvaluator(new EngineLookups(lookup, lookup, CodeEffLookup.NONE, MasterLookup.NONE, FunctionProvider.NONE)));

        // 사전: sampleRule 의 COIL_THK(QTY NUMBER scale 2)에 표준식을 단다. 두 버전 룰: v1 [2026-01-01, 2026-07-01), v2 [2026-07-01, 열린 끝)
        DmeTestSupport.sampleRule(jdbc);
        jdbc.update("UPDATE TB_MDM_DOMAIN SET STD_RULE = 'value >= 0', STD_AST = ? WHERE STD_NAME = 'COIL_THK_D'", ast("value >= 0"));
        jdbc.update("UPDATE TB_MDM_COLUMN SET REQUIRED = 1 WHERE PHYS_NAME = 'COIL_THK'");
        jdbc.update("UPDATE TB_MDM_RULE_VER SET APPLY_TO = '2026-07-01 00:00:00' WHERE MARU_RULE_ID = ? AND VER = 1", Q);
        DmeTestSupport.released(jdbc, Q, 2, "FIRST", "2026-07-01 00:00:00", null);
        DmeTestSupport.sampleDefinition(jdbc, Q, 2);
        DmeTestSupport.ruleSet(jdbc, "CT_SET", "계약 세트", "[\"" + Q + "\"]", "INUSE", 0);

        // 코드: CT_CD 1.000 RELEASED(A), CODE 도메인 + 컬럼 CT_CODE_COL
        MasterCodeSeeds seeds = new MasterCodeSeeds(jdbc);
        seeds.seedCode("CT_CD", "INUSE", "MDM");
        seeds.released("CT_CD", "1.000", "2026-01-01 00:00:00", MasterCodeSeeds.OPEN_END);
        seeds.seedItem("CT_CD", "A", "1.000", MasterCodeSeeds.OPEN, "에이", 1);
        seeds.seedBase("CT_CD");
        jdbc.update("INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, MARU_CODE_ID, CATE_ID, VER) "
                + "VALUES ('계약 코드', 'CT_CODE_D', 'CODE', 'STRING', 'CT_CD', 'BASE', 0)");
        long codeDomain = jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'CT_CODE_D'", Long.class);
        DmeTestSupport.column(jdbc, "CT_CODE_COL", codeDomain);
    }

    @Test
    void 컬럼_검증이_MDM_HTTP_로_받은_정의로_돈다() {
        Instant now = Instant.now();
        assertTrue(validator.validate("TB_ANY", "COIL_THK", Map.of("COIL_THK", "1.5"), now).valid());
        DomainValidator.ValidationResult bad = validator.validate("TB_ANY", "COIL_THK", Map.of("COIL_THK", "-1"), now);
        assertFalse(bad.valid());
        assertEquals(DomainValidator.Step.STD_EXPR, bad.failures().get(0).step());
    }

    @Test
    void CODE_도메인_컬럼이_MDM_HTTP_로_받은_코드_원본으로_MASTER_를_판정한다() {
        Instant now = Instant.now();
        assertTrue(validator.validate("T", "CT_CODE_COL", Map.of("CT_CODE_COL", "A"), now).valid());
        assertFalse(validator.validate("T", "CT_CODE_COL", Map.of("CT_CODE_COL", "Z"), now).valid());
        CodeRows rows = (CodeRows) service.one(MdmTargetType.CODE, "CT_CD").orElseThrow();
        assertEquals(0, rows.versions().get(0).ver().compareTo(new BigDecimal("1.000")));
        assertEquals(LocalDateTime.of(2026, 1, 1, 0, 0), rows.versions().get(0).applyFrom());
    }

    @Test
    void 룰은_적용_기간_경계_양쪽에서_MDM_원장과_같은_버전과_내용을_고른다() {
        StoredDefinitionLookup stored = new StoredDefinitionLookup(ruleQueries, storedRuleDefinitions, ruleRepository, ruleSetRepository);
        for (LocalDateTime at : new LocalDateTime[] {LocalDateTime.of(2026, 6, 30, 23, 59, 59), LocalDateTime.of(2026, 7, 1, 0, 0)}) {
            Instant ts = at.atZone(MdmDefinitionLookup.KST).toInstant();
            RuleDefinition viaHttp = lookup.rule(Q, ts).orElseThrow();
            RuleDefinition direct = stored.rule(Q, ts).orElseThrow();
            assertEquals(fingerprint(direct), fingerprint(viaHttp), "판정 시각 " + at);
        }
        assertEquals(stored.ruleSet("CT_SET").orElseThrow(), lookup.ruleSet("CT_SET").orElseThrow());
    }

    /** 판정에 쓰이는 칸 — ver·적용 구간·종류·적중·변수·행 셀 텍스트(키는 var_id 정수). AST Map 은 숫자 타입이 왕복에서 바뀔 수 있어 뺀다. */
    static String fingerprint(RuleDefinition d) {
        String vars = d.vars().stream().map(v -> v.varId() + ":" + v.varKind() + ":" + v.varName() + ":" + v.dataType() + ":" + v.scale())
                .collect(Collectors.joining(","));
        String rows = d.rows().stream().map(r -> r.rowId() + ":" + r.seq() + ":" + r.rowKind() + ":"
                + new TreeMap<>(r.cells()).entrySet().stream().map(e -> e.getKey() + "=" + e.getValue().text()).collect(Collectors.joining("|")))
                .collect(Collectors.joining(","));
        return d.ruleId() + "/" + d.ver() + "/" + d.applyFrom() + "/" + d.applyTo() + "/" + d.ruleKind() + "/" + d.hitPolicy()
                + "/" + d.contract().always().size() + "/" + vars + "/" + rows;
    }

    String ast(String text) {
        try {
            return DomainJson.write(AstExporter.export(text, mdmEvaluator.configuration()));
        } catch (com.ezylang.evalex.parser.ParseException e) {
            throw new IllegalStateException(e);
        }
    }

    static String effectiveClientKey() {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        return (env != null && !env.isBlank()) ? env : TEST_CLIENT_KEY;
    }
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `(cd src/backend/cactus-core && ./gradlew test --tests 'com.dongkuk.dmes.cactus.mdm.MdmNamesTest' --tests 'com.dongkuk.dmes.cactus.mdm.MdmDefinitionLookupTest' --console=plain)`
Expected: FAIL — `cannot find symbol: class MdmNames`.

- [ ] **Step 3: 이름 정규화와 spi 구현을 만든다**

`C/MdmNames.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import java.util.Locale;

/** 화면 키 → 컬럼사전 물리명(spec 2026-10-02-mdm-meta-cache-design §5.5, D7). */
public final class MdmNames {

    private MdmNames() {
    }

    /** 소문자가 섞인 이름은 camelCase 로 보고 UPPER_SNAKE 로 바꾼다({@code codeNm} → {@code CODE_NM}). 이미 대문자면 그대로. 비면 null. */
    public static String toPhysName(String name) {
        if (name == null) {
            return null;
        }
        String t = name.trim();
        if (t.isEmpty()) {
            return null;
        }
        if (t.equals(t.toUpperCase(Locale.ROOT))) {
            return t;
        }
        StringBuilder out = new StringBuilder(t.length() + 4);
        for (int i = 0; i < t.length(); i++) {
            char c = t.charAt(i);
            if (i > 0 && Character.isUpperCase(c)) {
                char prev = t.charAt(i - 1);
                if (Character.isLowerCase(prev) || Character.isDigit(prev)) {
                    out.append('_');
                }
            }
            out.append(Character.toUpperCase(c));
        }
        return out.toString();
    }
}
```

`C/MdmDefinitionLookup.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;

/**
 * 엔진 spi 의 업무 모듈 구현(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.2) — 정의를 {@link MdmMetaService}(로컬 캐시,
 * 없으면 MDM)에서 꺼낸다. 받을 수 없으면 {@link MdmUnavailableException} 이 엔진 호출자까지 올라간다(정책은 하위 프로젝트 C).
 *
 * <p>룰은 캐시된 RELEASED 버전 가운데 판정 시각(KST 벽시계)이 {@code APPLY_FROM <= t < APPLY_TO} 인 것, 여럿이면 VER 가 가장 큰 것을 고른다
 * — MDM {@code RuleVersions.currentReleased} 와 같은 규칙. "현재 버전"을 캐시하지 않는다(적용 시작일 도래는 쓰기가 없어 기록이 남지 않는다).
 */
public class MdmDefinitionLookup implements DefinitionLookup, CodeLookup {

    public static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final MdmMetaService service;

    public MdmDefinitionLookup(MdmMetaService service) {
        this.service = service;
    }

    @Override
    public Optional<ColumnDefinition> column(String table, String column) {
        String phys = MdmNames.toPhysName(column);
        if (phys == null) {
            return Optional.empty();
        }
        return service.one(MdmTargetType.COLUMN, phys).map(v -> toColumnDefinition((MdmColumnMeta) v, table));
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) {
        return service.one(MdmTargetType.RULE, ruleId).flatMap(v -> select((List<RuleDefinition>) v, evalTs));
    }

    @Override
    public Optional<RuleSetDefinition> ruleSet(String setId) {
        return service.one(MdmTargetType.RULE_SET, setId).map(RuleSetDefinition.class::cast);
    }

    @Override
    public Optional<CodeRows> code(String maruCodeId) {
        return service.one(MdmTargetType.CODE, maruCodeId).map(CodeRows.class::cast);
    }

    /** RELEASED 버전 목록에서 판정 시각에 적용되는 것. */
    public static Optional<RuleDefinition> select(List<RuleDefinition> released, Instant evalTs) {
        LocalDateTime now = LocalDateTime.ofInstant(evalTs, KST);
        return released.stream()
                .filter(d -> d.applyFrom() != null && !d.applyFrom().isAfter(now) && (d.applyTo() == null || now.isBefore(d.applyTo())))
                .max(Comparator.comparingInt(RuleDefinition::ver));
    }

    /**
     * 컬럼 메타 → 엔진 정의(spec §4.2). 테이블 인자는 그대로 싣지만 판정에 쓰지 않는다 — 컬럼사전은 테이블과 무관한 표준 컬럼이다.
     * 도메인이 없으면 TEXT·STRING(DomainTestCaseRunner 와 같은 기본값). CODE 종류의 MASTER 식은 엔진 검증기가 codeRef 로 스스로 붙인다.
     */
    public static ColumnDefinition toColumnDefinition(MdmColumnMeta m, String table) {
        DomainKind kind = m.domain() == null ? DomainKind.TEXT : parse(DomainKind.class, m.domain().domainKind(), DomainKind.TEXT);
        DataType type = parse(DataType.class, m.dataType(), DataType.STRING);
        return new ColumnDefinition(table, m.physName(), kind, type, m.scale(), m.required(),
                m.stdExpr() == null ? null : m.stdExpr().text(),
                m.bizExpr() == null ? null : m.bizExpr().text(),
                m.bizRequiredVars() == null ? List.of() : m.bizRequiredVars(),
                m.codeRef() == null ? null : new CodeRef(m.codeRef().maruCodeId(), m.codeRef().cateId()),
                m.refKind(), m.refTarget(), m.refCateId());
    }

    private static <E extends Enum<E>> E parse(Class<E> type, String text, E fallback) {
        if (text == null || text.isBlank()) {
            return fallback;
        }
        try {
            return Enum.valueOf(type, text.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }
}
```

- [ ] **Step 4: cactus 시험 통과를 확인한다**

Run: `(cd src/backend/cactus-core && ./gradlew test --tests 'com.dongkuk.dmes.cactus.mdm.*' --console=plain)`
Expected: PASS.

- [ ] **Step 5: 계약 시험을 돌린다**

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*MdmMetaFeedContractHttpTest' --tests '*MdmBusinessRuleMigrationTest' --console=plain)`
Expected: PASS. 실패하면 표류가 난 것이다 — 실패 메시지(fingerprint 차이 또는 Jackson 오류)를 그대로 보고하고, 고치는 쪽은 MDM `MetaFeedJson`·cactus `MdmJson` 설정 한 곳이다(두 설정은 같아야 한다). `MdmBusinessRuleMigrationTest` 는 mdm 컨텍스트에 `DefinitionLookup` 빈이 여전히 0개임을 본다(cactus 자동 설정은 Task 10 에서 생기고 기본 꺼짐이다).

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmNames.java \
  src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmDefinitionLookup.java \
  src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmNamesTest.java \
  src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmDefinitionLookupTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/feed/MdmMetaFeedContractHttpTest.java
/usr/bin/git commit -m "$(cat <<'EOF'
feat(cactus-core): 캐시된 MDM 정의로 엔진 spi 를 구현하고 피드와의 HTTP 계약을 시험한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: 엔드포인트 `MdmMetaController` 와 자동 설정 `MdmAutoConfiguration`(기본 꺼짐)

**Files:**
- Create: `C/MdmScreenColumn.java`, `C/MdmMetaController.java`, `C/MdmAutoConfiguration.java`
- Modify: `src/backend/cactus-core/src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`(끝에 한 줄)
- Test: `CT/MdmMetaControllerTest.java`, `CT/MdmAutoConfigurationTest.java`

**Interfaces:**
- Consumes: Task 6~9 전부(`MdmClientProperties`, `MdmMetaClient`, `MdmMetaCache`, `MdmMetaService`, `MdmRevisionPoller`, `MdmDefinitionLookup`, `MdmNames`, `MdmJson`), `com.dongkuk.dmes.cactus.web.inbound.CactusRequestMappingHandlerMapping`(시험), 엔진 `DefaultCodeResolver(CodeLookup, CodeEffLookup)`·`CodeResolver.codeList(String, String, LocalDateTime)`.
- Produces:
  - `MdmMetaController(String module, String instanceId, MdmMetaService service, MdmMetaCache cache, MdmRevisionPoller poller, Clock clock)`: `String module()`; HTTP 는 계약 표 그대로(`/api/{module}/mdmMeta/{columns,domains,status,entries,load}`)
  - `record MdmScreenColumn(...)`(COLUMN 메타에서 `bizExpr` 를 빼고 `bizRuleOnServer`·`allowedCodes[{code,name}]` 를 더한 모양) + `static MdmScreenColumn of(MdmColumnMeta, List<AllowedCode>)`
  - `MdmAutoConfiguration`(`@ConditionalOnProperty(prefix="cactus.mdm", name="enabled", havingValue="true")`) — 빈 6개. `static String module(MdmClientProperties, Environment)`(module → `cactus.oasis.service-group` → `"app"`)
  - Task 11 이 기대는 것: 업무 모듈 yml 의 `cactus.mdm.*` 만으로 켜진다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`CT/MdmMetaControllerTest.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dongkuk.dmes.cactus.web.inbound.CactusRequestMappingHandlerMapping;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** spec §5.5 엔드포인트 — 화면 메타·이름 정규화·모듈 404·SYSADMIN 헤더 판정·항목·미리 적재. */
class MdmMetaControllerTest {

    private FakeMetaFeed feed;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        MutableClock clock = new MutableClock(Instant.parse("2026-10-02T00:00:00Z"));
        feed = new FakeMetaFeed();
        MdmMetaCache cache = new MdmMetaCache(100, Duration.ofMinutes(60), clock);
        cache.clear(0);
        MdmMetaService service = new MdmMetaService(feed, cache, clock);
        MdmRevisionPoller poller = new MdmRevisionPoller(feed, cache, service, clock, Duration.ofSeconds(10), 1000);
        MdmMetaController controller = new MdmMetaController("mls", "123@host", service, cache, poller, clock);
        mvc = MockMvcBuilders.standaloneSetup(controller).setCustomHandlerMapping(CactusRequestMappingHandlerMapping::new).build();

        feed.put(MdmTargetType.COLUMN, "COIL_THK", new MdmColumnMeta("COIL_THK", "코일 두께", null, "두께", null, "설명", null, "NUMBER", 10, 2,
                true, null, null, null, null, new MdmColumnMeta.DomainRef("7", "두께", "QTY"),
                new MdmColumnMeta.Expr("value >= 0", null), new MdmColumnMeta.BizExpr("value <= COIL_WID"), List.of("COIL_WID"), null));
    }

    @Test
    void columns_는_camelCase_요청_이름으로_화면_메타를_주고_비즈니스식_원문은_싣지_않는다() throws Exception {
        mvc.perform(post("/api/mls/mdmMeta/columns").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"names\":[\"coilThk\",\"NO_SUCH\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.coilThk.physName").value("COIL_THK"))
                .andExpect(jsonPath("$.items.coilThk.labelMid").value("두께"))
                .andExpect(jsonPath("$.items.coilThk.stdExpr.text").value("value >= 0"))
                .andExpect(jsonPath("$.items.coilThk.bizRuleOnServer").value(true))
                .andExpect(jsonPath("$.items.coilThk.bizExpr").doesNotExist())
                .andExpect(jsonPath("$.missing[0]").value("NO_SUCH"))
                .andExpect(jsonPath("$.unavailable").isEmpty());
    }

    @Test
    void 코드_참조가_있으면_허용_코드를_풀어서_더한다() throws Exception {
        feed.put(MdmTargetType.CODE, "PROC_CD", new CodeRows(new CodeHeader("PROC_CD", "INUSE"),
                List.of(new CodeVersionRow(new BigDecimal("1.000"), "RELEASED", LocalDateTime.of(2026, 1, 1, 0, 0),
                        LocalDateTime.of(9999, 12, 31, 0, 0))),
                List.of(new CodeItemRow("A", new BigDecimal("1.000"), new BigDecimal("9999.000"), "에이", null, 1,
                        Arrays.asList(new String[5]), Arrays.asList(new String[10]))),
                List.of(new CodeCateRow("BASE", new BigDecimal("1.000"), new BigDecimal("9999.000"), "REGEX", ".*", "CODE")),
                List.of()));
        feed.put(MdmTargetType.COLUMN, "PROC_COL", new MdmColumnMeta("PROC_COL", "공정", null, null, null, null, null, "STRING", 10, null,
                false, null, null, null, null, new MdmColumnMeta.DomainRef("8", "공정", "CODE"), null, null, List.of(),
                new MdmColumnMeta.CodeRefMeta("PROC_CD", "BASE")));

        mvc.perform(post("/api/mls/mdmMeta/columns").contentType(MediaType.APPLICATION_JSON).content("{\"names\":[\"procCol\"]}"))
                .andExpect(jsonPath("$.items.procCol.allowedCodes[0].code").value("A"))
                .andExpect(jsonPath("$.items.procCol.allowedCodes[0].name").value("에이"))
                .andExpect(jsonPath("$.items.procCol.bizRuleOnServer").value(false));
    }

    @Test
    void MDM_을_받을_수_없는_이름은_unavailable_이다() throws Exception {
        feed.fetchError = new MdmUnavailableException("꺼짐");
        mvc.perform(post("/api/mls/mdmMeta/columns").contentType(MediaType.APPLICATION_JSON).content("{\"names\":[\"coilThk\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unavailable[0]").value("coilThk"));
    }

    @Test
    void 다른_모듈_경로는_404() throws Exception {
        mvc.perform(post("/api/mqc/mdmMeta/columns").contentType(MediaType.APPLICATION_JSON).content("{\"names\":[\"coilThk\"]}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void domains_는_도메인_메타를_준다() throws Exception {
        feed.put(MdmTargetType.DOMAIN, "7", new MdmDomainMeta("7", "두께", "THK", "QTY", "NUMBER", 10, 2, "mm", "설명",
                new MdmColumnMeta.Expr("value >= 0", null), true, null));
        mvc.perform(post("/api/mls/mdmMeta/domains").contentType(MediaType.APPLICATION_JSON).content("{\"domainIds\":[\"7\",\"8\"]}"))
                .andExpect(jsonPath("$.items['7'].stdName").value("THK"))
                .andExpect(jsonPath("$.missing[0]").value("8"));
    }

    @Test
    void status_는_SYSADMIN_이_아니면_403_이고_SYSADMIN_이면_상태를_준다() throws Exception {
        mvc.perform(get("/api/mls/mdmMeta/status")).andExpect(status().isForbidden());
        mvc.perform(get("/api/mls/mdmMeta/status").header("X-Authenticated-Role", "MCM_VIEWER")).andExpect(status().isForbidden());
        mvc.perform(get("/api/mls/mdmMeta/status").header("X-Authenticated-Role", "MCM_VIEWER, ROLE_SYSADMIN"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.module").value("mls"))
                .andExpect(jsonPath("$.instanceId").value("123@host"))
                .andExpect(jsonPath("$.appliedSeq").value(0))
                .andExpect(jsonPath("$.counts.COLUMN").value(0))
                .andExpect(jsonPath("$.maxEntries").value(100))
                .andExpect(jsonPath("$.maxAgeSeconds").value(3600));
    }

    @Test
    void entries_는_대상_종류와_키로_거르고_잘못된_종류는_400() throws Exception {
        mvc.perform(post("/api/mls/mdmMeta/columns").contentType(MediaType.APPLICATION_JSON).content("{\"names\":[\"COIL_THK\",\"NOPE\"]}"));

        mvc.perform(get("/api/mls/mdmMeta/entries").param("type", "COLUMN").param("q", "coil").header("X-Authenticated-Role", "SYSADMIN"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].type").value("COLUMN"))
                .andExpect(jsonPath("$.items[0].key").value("COIL_THK"))
                .andExpect(jsonPath("$.items[0].absent").value(false))
                .andExpect(jsonPath("$.items[0].remainingSeconds").value(3600));
        mvc.perform(get("/api/mls/mdmMeta/entries").param("type", "TABLE").header("X-Authenticated-Role", "SYSADMIN"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void load_는_이_인스턴스에_다시_적재하고_결과를_나눠_준다() throws Exception {
        mvc.perform(post("/api/mls/mdmMeta/load").contentType(MediaType.APPLICATION_JSON).header("X-Authenticated-Role", "SYSADMIN")
                        .content("{\"type\":\"COLUMN\",\"keys\":[\"coilThk\",\"nope\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.loaded[0]").value("COIL_THK"))
                .andExpect(jsonPath("$.missing[0]").value("NOPE"));
        mvc.perform(post("/api/mls/mdmMeta/load").contentType(MediaType.APPLICATION_JSON).content("{\"type\":\"COLUMN\",\"keys\":[\"x\"]}"))
                .andExpect(status().isForbidden());
    }
}
```

`CT/MdmAutoConfigurationTest.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.cache.CacheManager;

/** spec §5.1·§7 「cactus 자동 설정」 — 기본 꺼짐, 켰을 때 빈 구성, 꺼진 상태에서 DefinitionLookup 이 생기지 않음. */
class MdmAutoConfigurationTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(MdmAutoConfiguration.class));

    private static final String[] ON = {
            "cactus.mdm.enabled=true", "cactus.mdm.base-url=http://127.0.0.1:9", "cactus.mdm.connect-timeout=200ms", "cactus.mdm.client-key=k"};

    @Test
    void 기본은_꺼짐이라_빈이_하나도_없다() {
        runner.run(ctx -> {
            assertThat(ctx).doesNotHaveBean(MdmMetaService.class);
            assertThat(ctx).doesNotHaveBean(MdmRevisionPoller.class);
            assertThat(ctx).doesNotHaveBean(MdmMetaController.class);
            assertThat(ctx).doesNotHaveBean(DefinitionLookup.class);
        });
        runner.withPropertyValues("cactus.mdm.enabled=false").run(ctx -> assertThat(ctx).doesNotHaveBean(DefinitionLookup.class));
    }

    @Test
    void 켜면_구성_요소가_모두_생기고_DefinitionLookup_은_MdmDefinitionLookup_이며_CacheManager_는_없다() {
        runner.withPropertyValues(ON).withPropertyValues("cactus.mdm.module=mls").run(ctx -> {
            assertThat(ctx).hasSingleBean(MdmMetaClient.class).hasSingleBean(MdmMetaCache.class).hasSingleBean(MdmMetaService.class)
                    .hasSingleBean(MdmRevisionPoller.class).hasSingleBean(MdmMetaController.class);
            assertThat(ctx.getBean(DefinitionLookup.class)).isInstanceOf(MdmDefinitionLookup.class);
            assertThat(ctx.getBeansOfType(CacheManager.class)).isEmpty();
            assertThat(ctx.getBean(MdmMetaController.class).module()).isEqualTo("mls");
            MdmClientProperties p = ctx.getBean(MdmClientProperties.class);
            assertThat(p.getPollInterval()).isEqualTo(Duration.ofSeconds(10));
            assertThat(p.getMaxEntries()).isEqualTo(20_000);
            assertThat(p.getMaxAge()).isEqualTo(Duration.ofMinutes(60));
            assertThat(p.getReadTimeout()).isEqualTo(Duration.ofSeconds(5));
            assertThat(p.getConnectTimeout()).isEqualTo(Duration.ofMillis(200));
        });
    }

    @Test
    void module_설정이_없으면_service_group_을_쓰고_그것도_없으면_app_이다() {
        runner.withPropertyValues(ON).withPropertyValues("cactus.oasis.service-group=mqc")
                .run(ctx -> assertThat(ctx.getBean(MdmMetaController.class).module()).isEqualTo("mqc"));
        runner.withPropertyValues(ON).run(ctx -> assertThat(ctx.getBean(MdmMetaController.class).module()).isEqualTo("app"));
    }

    @Test
    void 다른_DefinitionLookup_빈이_있으면_그것을_두고_나머지만_만든다() {
        DefinitionLookup other = new DefinitionLookup() {
            @Override
            public Optional<ColumnDefinition> column(String table, String column) {
                return Optional.empty();
            }

            @Override
            public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) {
                return Optional.empty();
            }

            @Override
            public Optional<RuleSetDefinition> ruleSet(String setId) {
                return Optional.empty();
            }
        };
        runner.withPropertyValues(ON).withBean(DefinitionLookup.class, () -> other).run(ctx -> {
            assertThat(ctx).doesNotHaveBean(MdmDefinitionLookup.class);
            assertThat(ctx).hasSingleBean(MdmMetaService.class);
            assertThat(ctx.getBean(DefinitionLookup.class)).isSameAs(other);
        });
    }
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `(cd src/backend/cactus-core && ./gradlew test --tests 'com.dongkuk.dmes.cactus.mdm.MdmMetaControllerTest' --tests 'com.dongkuk.dmes.cactus.mdm.MdmAutoConfigurationTest' --console=plain)`
Expected: FAIL — `cannot find symbol: class MdmMetaController`.

- [ ] **Step 3: 화면 컬럼 모양과 컨트롤러를 만든다**

`C/MdmScreenColumn.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import java.util.List;

/**
 * 화면용 컬럼 메타(spec 2026-10-02-mdm-meta-cache-design §4.2) — 컬럼 메타에서 비즈니스식 원문을 빼고 존재 여부({@code bizRuleOnServer})만,
 * 코드 참조가 있으면 오늘 기준 허용 코드({@code allowedCodes})를 더한다. 허용 코드를 풀 수 없으면 null.
 */
public record MdmScreenColumn(
        String physName,
        String columnName,
        String labelLong,
        String labelMid,
        String labelShort,
        String description,
        String usageNote,
        String dataType,
        Integer length,
        Integer scale,
        boolean required,
        String defaultValue,
        String refKind,
        String refTarget,
        String refCateId,
        MdmColumnMeta.DomainRef domain,
        MdmColumnMeta.Expr stdExpr,
        boolean bizRuleOnServer,
        List<String> bizRequiredVars,
        MdmColumnMeta.CodeRefMeta codeRef,
        List<AllowedCode> allowedCodes) {

    public record AllowedCode(String code, String name) {
    }

    public static MdmScreenColumn of(MdmColumnMeta m, List<AllowedCode> allowedCodes) {
        return new MdmScreenColumn(m.physName(), m.columnName(), m.labelLong(), m.labelMid(), m.labelShort(), m.description(),
                m.usageNote(), m.dataType(), m.length(), m.scale(), m.required(), m.defaultValue(), m.refKind(), m.refTarget(),
                m.refCateId(), m.domain(), m.stdExpr(), m.bizExpr() != null && m.bizExpr().text() != null,
                m.bizRequiredVars() == null ? List.of() : m.bizRequiredVars(), m.codeRef(), allowedCodes);
    }
}
```

`C/MdmMetaController.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.code.CodeResolver;
import kr.dongkuk.maru.mdm.engine.code.DefaultCodeResolver;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

/**
 * 업무 모듈 MDM 메타 엔드포인트 {@code /api/{module}/mdmMeta/*}(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.5). 포털 BFF
 * catch-all 이 경로를 그대로 넘기므로 BE 경로가 {@code /api/{module}/...} 로 시작한다. {@code {module}} 이 이 인스턴스 모듈과 다르면 404.
 *
 * <p>권한: columns·domains 는 로그인 사용자(BFF AUTH_ONLY). status·entries·load 는 SYSADMIN 만 — 요청 헤더 {@code X-Authenticated-Role}
 * 로 판정한다(Ruling R10 — mqc·mpp·mpn 에는 ClientKeyFilter·사용자 문맥이 없다). {@code DmomReceiveController} 처럼 {@code @Controller} 없이
 * 클래스 수준 {@code @RequestMapping} + {@code @ResponseBody} 로 두고 자동 설정이 {@code @Bean} 으로 만든다.
 */
@ResponseBody
@RequestMapping("/api/{module}/mdmMeta")
public class MdmMetaController {

    static final String ROLE_HEADER = "X-Authenticated-Role";
    static final String SYSADMIN = "SYSADMIN";
    static final int MAX_PAGE_SIZE = 500;

    private final String module;
    private final String instanceId;
    private final MdmMetaService service;
    private final MdmMetaCache cache;
    private final MdmRevisionPoller poller;
    private final CodeResolver codes;
    private final Clock clock;

    public MdmMetaController(String module, String instanceId, MdmMetaService service, MdmMetaCache cache, MdmRevisionPoller poller,
                             Clock clock) {
        this.module = module;
        this.instanceId = instanceId;
        this.service = service;
        this.cache = cache;
        this.poller = poller;
        this.clock = clock;
        this.codes = new DefaultCodeResolver(new MdmDefinitionLookup(service), CodeEffLookup.NONE);
    }

    public record NamesRequest(List<String> names) {
    }

    public record DomainIdsRequest(List<String> domainIds) {
    }

    public record LoadRequest(String type, List<String> keys) {
    }

    public String module() {
        return module;
    }

    /** 화면 메타 — 요청 이름(물리명 또는 camelCase) 그대로 키를 쓴다. */
    @PostMapping("/columns")
    public ResponseEntity<Map<String, Object>> columns(@PathVariable("module") String module,
                                                       @RequestBody(required = false) NamesRequest body) {
        if (!this.module.equals(module)) {
            return ResponseEntity.notFound().build();
        }
        Map<String, String> physByName = new LinkedHashMap<>();
        for (String name : body == null || body.names() == null ? List.<String>of() : body.names()) {
            String phys = MdmNames.toPhysName(name);
            if (phys != null) {
                physByName.putIfAbsent(name, phys);
            }
        }
        MdmMetaService.MdmLookup r = service.lookup(MdmTargetType.COLUMN, new LinkedHashSet<>(physByName.values()));
        Map<String, Object> items = new LinkedHashMap<>();
        List<String> missing = new ArrayList<>();
        List<String> unavailable = new ArrayList<>();
        physByName.forEach((name, phys) -> {
            Object v = r.found().get(phys);
            if (v instanceof MdmColumnMeta m) {
                items.put(name, MdmJson.plain(screen(m)));
            } else if (r.unavailable().contains(phys)) {
                unavailable.add(name);
            } else {
                missing.add(name);
            }
        });
        return ResponseEntity.ok(result(items, missing, unavailable));
    }

    @PostMapping("/domains")
    public ResponseEntity<Map<String, Object>> domains(@PathVariable("module") String module,
                                                       @RequestBody(required = false) DomainIdsRequest body) {
        if (!this.module.equals(module)) {
            return ResponseEntity.notFound().build();
        }
        List<String> ids = new ArrayList<>(new LinkedHashSet<>(trimmed(body == null ? null : body.domainIds())));
        MdmMetaService.MdmLookup r = service.lookup(MdmTargetType.DOMAIN, ids);
        Map<String, Object> items = new LinkedHashMap<>();
        r.found().forEach((k, v) -> items.put(k, MdmJson.plain(v)));
        return ResponseEntity.ok(result(items, r.missing(), r.unavailable()));
    }

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> status(@PathVariable("module") String module,
                                                      @RequestHeader(value = ROLE_HEADER, required = false) String roles) {
        ResponseEntity<Map<String, Object>> denied = guard(module, roles);
        if (denied != null) {
            return denied;
        }
        MdmRevisionPoller.Status s = poller.status();
        Map<String, Integer> counts = new LinkedHashMap<>();
        cache.sizes().forEach((t, n) -> counts.put(t.name(), n));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("module", this.module);
        out.put("instanceId", instanceId);
        out.put("appliedSeq", s.appliedSeq());
        out.put("latestSeq", s.latestSeq());
        out.put("lastSuccessAt", s.lastSuccessAt() == null ? null : s.lastSuccessAt().toString());
        out.put("consecutiveFailures", s.consecutiveFailures());
        out.put("lastError", s.lastError());
        out.put("counts", counts);
        out.put("maxEntries", cache.maxEntries());
        out.put("maxAgeSeconds", cache.maxAge().getSeconds());
        return ResponseEntity.ok(out);
    }

    @GetMapping("/entries")
    public ResponseEntity<Map<String, Object>> entries(@PathVariable("module") String module,
                                                       @RequestHeader(value = ROLE_HEADER, required = false) String roles,
                                                       @RequestParam(value = "type", required = false) String type,
                                                       @RequestParam(value = "q", required = false) String q,
                                                       @RequestParam(value = "page", defaultValue = "0") int page,
                                                       @RequestParam(value = "size", defaultValue = "50") int size) {
        ResponseEntity<Map<String, Object>> denied = guard(module, roles);
        if (denied != null) {
            return denied;
        }
        MdmTargetType t = null;
        if (type != null && !type.isBlank()) {
            Optional<MdmTargetType> parsed = MdmTargetType.parse(type);
            if (parsed.isEmpty()) {
                return badRequest("대상 종류가 올바르지 않습니다: " + type);
            }
            t = parsed.get();
        }
        int pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, size));
        int pageNo = Math.max(0, page);
        List<MdmMetaCache.EntryView> all = cache.entries(t, q);
        List<Map<String, Object>> items = all.stream().skip((long) pageNo * pageSize).limit(pageSize).map(MdmMetaController::entryRow).toList();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", all.size());
        out.put("page", pageNo);
        out.put("size", pageSize);
        out.put("items", items);
        return ResponseEntity.ok(out);
    }

    /** 이 인스턴스에 미리 적재(관리 화면 신규). 이미 있으면 지우고 다시 받는다. */
    @PostMapping("/load")
    public ResponseEntity<Map<String, Object>> load(@PathVariable("module") String module,
                                                    @RequestHeader(value = ROLE_HEADER, required = false) String roles,
                                                    @RequestBody(required = false) LoadRequest body) {
        ResponseEntity<Map<String, Object>> denied = guard(module, roles);
        if (denied != null) {
            return denied;
        }
        Optional<MdmTargetType> type = MdmTargetType.parse(body == null ? null : body.type());
        if (type.isEmpty()) {
            return badRequest("대상 종류가 올바르지 않습니다: " + (body == null ? null : body.type()));
        }
        LinkedHashSet<String> keys = new LinkedHashSet<>();
        for (String k : trimmed(body.keys())) {
            keys.add(type.get() == MdmTargetType.COLUMN ? MdmNames.toPhysName(k) : k);
        }
        MdmMetaService.MdmLookup r = service.reload(type.get(), keys);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("loaded", new ArrayList<>(r.found().keySet()));
        out.put("missing", r.missing());
        out.put("unavailable", r.unavailable());
        return ResponseEntity.ok(out);
    }

    static boolean isSysadmin(String roles) {
        if (roles == null) {
            return false;
        }
        for (String role : roles.split(",")) {
            String t = role.trim();
            if (t.regionMatches(true, 0, "ROLE_", 0, 5)) {
                t = t.substring(5);
            }
            if (SYSADMIN.equalsIgnoreCase(t)) {
                return true;
            }
        }
        return false;
    }

    private ResponseEntity<Map<String, Object>> guard(String module, String roles) {
        if (!this.module.equals(module)) {
            return ResponseEntity.notFound().build();
        }
        if (!isSysadmin(roles)) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("message", "시스템 관리자만 할 수 있습니다");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body);
        }
        return null;
    }

    private MdmScreenColumn screen(MdmColumnMeta m) {
        List<MdmScreenColumn.AllowedCode> allowed = null;
        if (m.codeRef() != null && m.codeRef().maruCodeId() != null) {
            try {
                LocalDateTime now = LocalDateTime.ofInstant(clock.instant(), MdmDefinitionLookup.KST);
                allowed = codes.codeList(m.codeRef().maruCodeId(), m.codeRef().cateId(), now).stream()
                        .map(e -> new MdmScreenColumn.AllowedCode(e.code(), e.name())).toList();
            } catch (MdmUnavailableException e) {
                allowed = null;
            }
        }
        return MdmScreenColumn.of(m, allowed);
    }

    private static Map<String, Object> entryRow(MdmMetaCache.EntryView v) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("type", v.type().name());
        row.put("key", v.key());
        row.put("absent", v.absent());
        row.put("value", MdmJson.plain(v.value()));
        row.put("loadedAt", v.loadedAt().toString());
        row.put("hits", v.hits());
        row.put("remainingSeconds", v.remainingSeconds());
        row.put("loadSeq", v.loadSeq());
        return row;
    }

    private static List<String> trimmed(List<String> values) {
        List<String> out = new ArrayList<>();
        if (values != null) {
            for (String v : values) {
                if (v != null && !v.isBlank()) {
                    out.add(v.trim());
                }
            }
        }
        return out;
    }

    private static Map<String, Object> result(Map<String, Object> items, List<String> missing, List<String> unavailable) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("missing", missing);
        out.put("unavailable", unavailable);
        return out;
    }

    private static ResponseEntity<Map<String, Object>> badRequest(String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", message);
        return ResponseEntity.badRequest().body(body);
    }
}
```

- [ ] **Step 4: 자동 설정과 등록 줄을 만든다**

`C/MdmAutoConfiguration.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import java.lang.management.ManagementFactory;
import java.net.http.HttpClient;
import java.time.Clock;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * 업무 모듈 MDM 메타 캐시 자동 설정(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.1·§5.2). 기본 꺼짐 —
 * {@code cactus.mdm.enabled=true} 인 업무 모듈만 켠다. MDM 서버는 켜지 않으므로 mdm 의 {@code DefinitionLookup} 빈 0개 가드
 * ({@code MdmBusinessRuleMigrationTest})에 영향이 없다. {@code CacheManager} 를 만들지 않는다.
 *
 * <p>{@code com.dongkuk.dmes.cactus.mdm} 의 빈은 모두 여기서만 만든다(스테레오타입 어노테이션 금지 — 스캔으로 생기지 않게).
 */
@AutoConfiguration
@ConditionalOnClass(RestClient.class)
@ConditionalOnProperty(prefix = "cactus.mdm", name = "enabled", havingValue = "true")
@EnableConfigurationProperties(MdmClientProperties.class)
public class MdmAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public MdmMetaClient mdmMetaClient(MdmClientProperties props, Environment env) {
        HttpClient http = HttpClient.newBuilder().connectTimeout(props.getConnectTimeout()).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(props.getReadTimeout());
        RestClient.Builder builder = RestClient.builder().requestFactory(factory);
        if (props.getClientKey() != null && !props.getClientKey().isBlank()) {
            builder.defaultHeader("X-Client-Key", props.getClientKey());
        }
        return new MdmMetaClient(builder.build(), props.getBaseUrl(), module(props, env));
    }

    @Bean
    @ConditionalOnMissingBean
    public MdmMetaCache mdmMetaCache(MdmClientProperties props) {
        return new MdmMetaCache(props.getMaxEntries(), props.getMaxAge(), Clock.systemUTC());
    }

    @Bean
    @ConditionalOnMissingBean
    public MdmMetaService mdmMetaService(MdmMetaClient client, MdmMetaCache cache) {
        return new MdmMetaService(client, cache, Clock.systemUTC());
    }

    @Bean(initMethod = "start", destroyMethod = "close")
    @ConditionalOnMissingBean
    public MdmRevisionPoller mdmRevisionPoller(MdmMetaClient client, MdmMetaCache cache, MdmMetaService service, MdmClientProperties props) {
        return new MdmRevisionPoller(client, cache, service, Clock.systemUTC(), props.getPollInterval(), props.getPageLimit());
    }

    @Bean
    @ConditionalOnMissingBean(DefinitionLookup.class)
    public MdmDefinitionLookup mdmDefinitionLookup(MdmMetaService service) {
        return new MdmDefinitionLookup(service);
    }

    @Bean
    @ConditionalOnMissingBean
    public MdmMetaController mdmMetaController(MdmClientProperties props, Environment env, MdmMetaService service, MdmMetaCache cache,
                                               MdmRevisionPoller poller) {
        return new MdmMetaController(module(props, env), ManagementFactory.getRuntimeMXBean().getName(), service, cache, poller,
                Clock.systemUTC());
    }

    /** {@code cactus.mdm.module} → {@code cactus.oasis.service-group} → {@code app}. mqc·mpp·mpn 은 service-group 이 없어 module 을 꼭 둔다. */
    static String module(MdmClientProperties props, Environment env) {
        if (props.getModule() != null && !props.getModule().isBlank()) {
            return props.getModule().trim();
        }
        return env.getProperty("cactus.oasis.service-group", "app");
    }
}
```

`src/backend/cactus-core/src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` 끝에 한 줄:

```
com.dongkuk.dmes.cactus.mdm.MdmAutoConfiguration
```

- [ ] **Step 5: 통과를 확인한다**

Run: `(cd src/backend/cactus-core && ./gradlew test --console=plain)`
Expected: PASS(cactus-core 전체 — 기존 자동 설정 시험 포함).

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*MdmBusinessRuleMigrationTest' --tests '*MasterCodeDeprecateEngineSqliteTest' --tests '*MetaFeedOasisHttpTest' --console=plain)`
Expected: PASS — mdm 은 `cactus.mdm.enabled` 를 켜지 않으므로 `DefinitionLookup`·`CodeLookup` 운영 빈이 생기지 않는다.

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm \
  src/backend/cactus-core/src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports \
  src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm
/usr/bin/git commit -m "$(cat <<'EOF'
feat(cactus-core): 업무 모듈 /api/{module}/mdmMeta 엔드포인트와 기본 꺼짐 자동 설정을 더한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 11: 업무 모듈 켜기와 권한 — 모듈 yml, mcm 시드, mcm-core AUTH_ONLY, BFF 로그인 전용 경로

**Files:**
- Modify: `src/backend/mls/api/src/main/resources/application.yml`(끝 — `cactus:` 블록 안에 `mdm:`)
- Modify: `src/backend/mcm/api/src/main/resources/application.yml:69-73`(`oasis.cache` 아래, `caravan-hub` 주석 위에 `mdm:`)
- Modify: `src/backend/{mqc,mpp,mpn}/api/src/main/resources/application.yml`(끝 — 새 최상위 `cactus:` 블록)
- Modify: `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java:326-327`(allActions `reload`), `:426`(호출), `seedMlsMenus` 뒤(새 메서드), `:671`(FULL_SEQ 행)
- Modify: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/security/endpoint/EndpointPermissionFilter.java:75-93`(AUTH_ONLY `mdmmeta/`, `isAuthOnly` 패키지 공개)
- Modify: `src/frontend/m-mcm/proxy.ts:42-57`(authOnlyPrefixes 5줄)
- Modify: `src/frontend/shared/tests/unit/rbac-policy.unit.test.ts`(CFG 한 줄 + T12)
- Modify: `AT/MdmOasisActionVocabularyTest.java`(metaFeed OBJECT 시드 단언)
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/security/endpoint/EndpointPermissionFilterAuthOnlyTest.java`(새)

**Interfaces:**
- Consumes: Task 10 자동 설정(`cactus.mdm.*`), Task 5 BPMN action `save`(BFF 권한키 `mdm/metafeed/save`), `insertMcmSecObjIfAbsent(String objectId, String objectNm, String systemCode)`(`DataInitializer.java:1873`), `insertMcmSecMenuIfAbsent(String menuId, String menuSeq, String fullSeq, String menuNm, String parentMenuId, String objectId)`(`:1620`), `insertIfAbsentComposite(String table, String[] cols, String[] vals, String insertSql)`, `PermKey.parseUrl(String)`.
- Produces: 다섯 모듈이 기동하면 `/api/{module}/mdmMeta/*` 가 산다. 포털 로그인 사용자는 BFF·mcm BE 를 통과해 `columns`·`domains` 를 부르고, SYSADMIN 은 `status`·`entries`·`load` 와 MDM `metaFeed/save` 를 부른다. 화면 OBJECT `mdmCacheMng`(csa 메뉴 1020180)과 버튼 action `search`·`save`·`delete`·`reload` 가 SYSADMIN PERM_ALL 에 든다 — Task 12 화면이 쓴다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/security/endpoint/EndpointPermissionFilterAuthOnlyTest.java`:

```java
package com.dongkuk.dmes.mcm.security.endpoint;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * spec 2026-10-02-mdm-meta-cache-design §5.5 — 업무 모듈 cactus 엔드포인트 /api/{module}/mdmMeta/* 는 3-segment 라 PermKey 의 serviceId 가 ""
 * 이고(PermKey.java:62-66) UserPermCache 키는 "oasis" 라(UserPermCache.java:219) 권한 데이터로 맞출 수 없다. 인증만 보는 AUTH_ONLY 로 두고,
 * 관리 action(status·entries·load)은 cactus MdmMetaController 가 SYSADMIN 을 다시 본다.
 */
class EndpointPermissionFilterAuthOnlyTest {

    @Test
    void mdmMeta_는_AUTH_ONLY_다() {
        for (String action : new String[] {"columns", "domains", "status", "entries", "load"}) {
            PermKey k = PermKey.parseUrl("/api/mcm/mdmMeta/" + action);
            assertNotNull(k, action);
            assertTrue(EndpointPermissionFilter.isAuthOnly(k), action);
        }
        assertFalse(EndpointPermissionFilter.isAuthOnly(PermKey.parseUrl("/api/mcm/oasis/commUserMng/search")));
    }
}
```

`src/frontend/shared/tests/unit/rbac-policy.unit.test.ts` — CFG 의 `authOnlyPrefixes` 끝에 한 줄을 더하고(`"/api/mls/mdmMeta/", // m-mcm proxy.ts 와 같은 값 — MDM 메타 캐시(2026-10-02)`), T11 아래에 시험을 넣는다:

```ts
  it("T12 업무 모듈 mdmMeta(MDM 메타 캐시) → AUTH_ONLY pass, loader 미호출 (2026-10-02)", async () => {
    expect(await evaluateApiPolicy("/api/mls/mdmMeta/columns", viewer, CFG, loadThrow)).toBe("pass");
    expect(await evaluateApiPolicy("/api/mls/mdmMeta/entries?type=COLUMN", viewer, CFG, loadThrow)).toBe("pass");
    expect(await evaluateApiPolicy("/api/mls/mdmMeta/status", null, CFG, loadThrow)).toBe("unauthorized");
  });
```

`AT/MdmOasisActionVocabularyTest.java` — `mcm_시드가_BPMN_23개_화면을_모두_커버한다` 의 `bpmnScreens.remove("metaFeed");` 바로 아래에:

```java
        assertTrue(source.contains("insertMcmSecObjIfAbsent(\"metaFeed\", "),
                "metaFeed OBJECT(SYSTEM_CODE=mdm, SYSADMIN 전용) 시드가 없다 — BFF 권한키 mdm/metafeed/save 가 없어 화면 삭제·재등록이 403 이다");
```

- [ ] **Step 2: 실패를 확인한다**

Run: `(cd src/backend/mcm-core && ../gradlew test --tests '*EndpointPermissionFilterAuthOnlyTest' --console=plain)`
Expected: FAIL — `isAuthOnly(PermKey) has private access`.

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*MdmOasisActionVocabularyTest' --console=plain)`
Expected: FAIL — `metaFeed OBJECT … 시드가 없다`.

Run: `pnpm -C src/frontend install && pnpm -C src/frontend --filter @dk-oasis/shared test:unit -- rbac-policy`
Expected: T12 는 이 시험 파일의 CFG 를 쓰므로 CFG 한 줄을 더한 뒤 바로 통과한다 — 이 시험은 proxy.ts 와 같은 값을 유지하는 거울이다(실제 경로는 Step 3 의 proxy.ts).

- [ ] **Step 3: 권한·시드·설정을 넣는다**

`EndpointPermissionFilter.java` — 목록 끝(`"noticeboard/search"` 줄)을 바꾸고 `isAuthOnly` 의 `private` 을 뺀다:

```java
            "noticeboard/search",       // 포털 홈 공지 목록(mls) — 서비스가 현재 사용자 역할로 게시 대상을 거른다 (2026-10-02)
            // MDM 메타 캐시(2026-10-02, spec 2026-10-02-mdm-meta-cache-design §5.5) — cactus /api/{module}/mdmMeta/*. 3-segment 라 권한 데이터로
            // 맞출 수 없다(serviceId ""). 화면 메타는 로그인 사용자, 관리 action 은 MdmMetaController 가 SYSADMIN 을 다시 본다. BFF proxy.ts 와 동기화.
            "mdmmeta/"
    );

    static boolean isAuthOnly(PermKey k) {
```

`src/frontend/m-mcm/proxy.ts` — `"/api/mls/oasis/noticeBoard/search",` 줄 아래에:

```ts
    // MDM 메타 캐시(2026-10-02) — 업무 모듈 cactus 엔드포인트 /api/{module}/mdmMeta/*. 화면 메타(columns·domains)는 로그인한 모든 사용자,
    // 관리(status·entries·load)는 각 모듈 MdmMetaController 가 X-Authenticated-Role 로 SYSADMIN 을 다시 본다. BE EndpointPermissionFilter 와 동기화.
    "/api/mcm/mdmMeta/",
    "/api/mls/mdmMeta/",
    "/api/mqc/mdmMeta/",
    "/api/mpp/mdmMeta/",
    "/api/mpn/mdmMeta/",
```

`DataInitializer.java` — (1) allActions 의 `"changeStatus"` 를 `"changeStatus",` 로 바꾸고 그 아래에 더한다(주석에 큰따옴표·`);` 를 쓰지 않는다 — `MdmOasisActionVocabularyTest` 가 이 구간을 문자열로 읽는다):

```java
                // 2026-10-02 — MDM 캐시 관리(csa/mdmCacheMng) 재등록 버튼. 이미 시드된 DB 는 ensurePermAllActions 가 덧붙인다.
                "reload"
```

(2) `seedMlsMenus();` 호출 아래에:

```java

        // 2026-10-02 — MDM 캐시 관리(csa/mdmCacheMng) 화면과 MDM 메타 제공(mdm metaFeed) 강제 기록 권한. seedMdmCacheMenus javadoc 참고.
        seedMdmCacheMenus();
```

(3) `seedMlsMenus()` 메서드 바로 뒤에 새 메서드:

```java
    /**
     * 2026-10-02 — MDM 캐시 관리(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.5·§6).
     *
     * <p>mdmCacheMng — 포털(mcm) 화면 OBJECT + csa 메뉴 leaf(1020180, commSyncMng 다음) + SYSADMIN 전체 권한. 화면이 부르는 업무 모듈
     * /api/{m}/mdmMeta/* 는 AUTH_ONLY(proxy.ts·EndpointPermissionFilter)이고 관리 action 은 각 모듈 컨트롤러가 SYSADMIN 을 다시 본다.
     *
     * <p>metaFeed — 화면의 삭제·재등록은 MDM OASIS /api/mdm/oasis/metaFeed/save 다. BFF 권한키 mdm/metafeed/save 를 위해 OBJECT(SYSTEM_CODE=mdm)와
     * SYSADMIN 매핑을 둔다(없으면 SYSADMIN 도 403). 업무 그룹 권한(seedMdmObjectRbac)은 주지 않는다 — 강제 기록은 SYSADMIN 만이고 MDM 서비스가
     * MDM027 로 다시 막는다. 메뉴는 없다(화면이 아니다). 모두 멱등.
     */
    private void seedMdmCacheMenus() {
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";

        insertMcmSecObjIfAbsent("mdmCacheMng", "MDM 캐시 관리", "mcm");
        insertMcmSecMenuIfAbsent("mdmCacheMng", "001", "1020180", "MDM 캐시 관리", "csa", "mdmCacheMng");
        insertMcmSecObjIfAbsent("metaFeed", "MDM 메타 제공", "mdm");
        for (String objId : new String[]{"mdmCacheMng", "metaFeed"}) {
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLE_MAPPING",
                    new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                    new String[]{"SYSADMIN", objId,       "PERM_ALL"},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                    "VALUES ('SYSADMIN', '" + escapeSql(objId) + "', 'PERM_ALL'" + AUDIT_VALS + ")");
        }
        log.info("[DataInitializer] MDM 캐시 관리 시드 — OBJECT 2(mdmCacheMng=mcm, metaFeed=mdm) + 메뉴 leaf 1(csa/mdmCacheMng) + RBAC(SYSADMIN 2)");
    }
```

(4) `applyR3FullSeqEncoding` 의 `{"commSyncMng", "1020170", "csa"},` 아래에:

```java
            {"mdmCacheMng",               "1020180", "csa"},   // 2026-10-02 MDM 캐시 관리 — 빠지면 잔존 DB 의 FULL_SEQ 가 매 부팅 어긋난다
```

업무 모듈 yml — 블록 내용은 다섯 곳이 같고 `module:` 만 다르다.

`src/backend/mls/api/src/main/resources/application.yml` 끝(`cactus.oasis` 블록 다음, 같은 들여쓰기 2칸)에:

```yaml
  # ── MDM 메타 캐시(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.1) ──
  #   MDM(8096)에서 컬럼·도메인·룰·룰세트·코드·전문 정의를 받아 이 인스턴스에 캐시하고 10초마다 변경 기록을 확인한다.
  #   끄려면 MDM_CACHE_ENABLED=false. client-key 는 MDM 이 받는 BACKEND_CLIENT_KEY 와 같아야 한다.
  mdm:
    enabled: ${MDM_CACHE_ENABLED:true}
    module: mls
    base-url: ${MDM_WAS_URL:http://localhost:8096}
    client-key: ${BACKEND_CLIENT_KEY:dmes-bff-local-client-key-2026}
    poll-interval: 10s
    max-entries: 20000
    max-age: 60m
    connect-timeout: 2s
    read-timeout: 5s
```

`src/backend/mcm/api/src/main/resources/application.yml` — `cactus.oasis.cache.size` 줄 다음, `# ── caravan-hub 통합 클라이언트` 주석 앞에 같은 블록(들여쓰기 2칸, `module: mcm`).

`src/backend/mqc/api/src/main/resources/application.yml`·`mpp`·`mpn` — 이 셋에는 `cactus:` 블록이 없다(ClientKeyFilter·service-group 없음). 파일 끝에 새 최상위 블록을 붙인다(`module:` 은 각각 `mqc`·`mpp`·`mpn` — service-group 이 없어 module 이 꼭 있어야 `/api/{module}/mdmMeta` 가 404 가 아니다):

```yaml

# ── MDM 메타 캐시(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.1) ──
#   이 모듈에는 cactus.oasis.service-group 이 없어 module 을 직접 둔다. 끄려면 MDM_CACHE_ENABLED=false.
cactus:
  mdm:
    enabled: ${MDM_CACHE_ENABLED:true}
    module: mqc
    base-url: ${MDM_WAS_URL:http://localhost:8096}
    client-key: ${BACKEND_CLIENT_KEY:dmes-bff-local-client-key-2026}
    poll-interval: 10s
    max-entries: 20000
    max-age: 60m
    connect-timeout: 2s
    read-timeout: 5s
```

- [ ] **Step 4: 통과를 확인한다**

Run: `(cd src/backend/mcm-core && ../gradlew test --tests '*EndpointPermissionFilterAuthOnlyTest' --tests '*PermKeyTest' --tests '*UserPermCacheTest' --console=plain)`
Expected: PASS.

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*MdmOasisActionVocabularyTest' --console=plain)`
Expected: PASS(allActions 에 `reload` 가 더해져도 mdm BPMN action ⊆ allActions 단언은 그대로다).

Run: `(cd src/backend/mcm && ../gradlew :lib:compileJava :api:compileJava --console=plain -q)`
Expected: 오류 없음.

Run: `(cd src/backend/mls && ../gradlew :lib:test :api:test --console=plain) ; (cd src/backend/mcm && ../gradlew :lib:test :api:test --console=plain) ; (cd src/backend/mpn && ../gradlew :lib:test --console=plain)`
Expected: PASS. 이제 이 모듈들의 스프링 시험 컨텍스트는 `cactus.mdm.enabled=true` 로 뜬다 — 컨트롤러 매핑 충돌·빈 충돌이 있으면 여기서 드러난다. MDM 이 떠 있지 않아 폴러가 `[mdm] 변경 기록 확인 실패` WARN 을 한 번 남기는 것은 정상이다(Ruling R12). 시험 소스가 없는 모듈(mqc·mpp, mcm `:api`)은 `NO-SOURCE` 로 끝난다.

Run: `pnpm -C src/frontend --filter @dk-oasis/shared test:unit -- rbac-policy && pnpm -C src/frontend/m-mcm exec eslint proxy.ts`
Expected: PASS, eslint 오류 0.

Run: `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .`
Expected: `ERROR 0`(MES OASIS 는 바꾸지 않았다 — 확인만).

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/backend/mls/api/src/main/resources/application.yml src/backend/mcm/api/src/main/resources/application.yml \
  src/backend/mqc/api/src/main/resources/application.yml src/backend/mpp/api/src/main/resources/application.yml \
  src/backend/mpn/api/src/main/resources/application.yml \
  src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java \
  src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/security/endpoint/EndpointPermissionFilter.java \
  src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/security/endpoint/EndpointPermissionFilterAuthOnlyTest.java \
  src/frontend/m-mcm/proxy.ts src/frontend/shared/tests/unit/rbac-policy.unit.test.ts \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmOasisActionVocabularyTest.java
/usr/bin/git commit -m "$(cat <<'EOF'
feat(mcm): 업무 모듈 다섯에 MDM 메타 캐시를 켜고 mdmMeta·metaFeed 권한과 캐시 관리 메뉴를 시드한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: 포털 MDM 캐시 관리 화면 `csa/mdmCacheMng`

**Files:**
- Create: `P/page-components/csa/mdmCacheMng/types.ts`, `api.ts`, `RegisterModal.tsx`, `page.tsx`
- Create: `P/tests/csa/mdmCacheMng/api.test.ts`
- Modify: `P/package.json`(`test` 스크립트, devDependencies `vitest`·`happy-dom` — m-mls 와 같은 버전), `src/frontend/pnpm-lock.yaml`(설치 결과)
- Modify: `P/lib/generated/page-registry.ts`(재생성 — git 추적 파일)

**Interfaces:**
- Consumes: Task 10 엔드포인트(계약 표 `/api/{module}/mdmMeta`), Task 5 `POST /api/mdm/oasis/metaFeed/save`(봉투 `{meta:{menuId}, params:{type, kind}, grids:{keys:{rows:[{key}]}}}`), Task 11 OBJECT `mdmCacheMng`·action `search`·`save`·`delete`·`reload`. shared: `apiRequest`(`@dk-oasis/shared/http` — JSON Content-Type 기본), `PageLayout`·`SearchArea`·`SearchField`·`ContentBody`·`ContentPanel`·`DETAIL_*`(`/layout`), `AgDataGrid`·`GridPanel`·`GridBadge`·`GridColumn`(`/grid`), `Button`·`Select`·`Textarea`(`/form`), `Modal`(`/modal`), `useMessage`(`/message-provider`).
- Produces: 화면 `csa/mdmCacheMng`(page-registry 키 `"csa/mdmCacheMng"`). `api.ts` 공개 함수: `fetchStatus(module)`, `fetchAllStatus(modules) → {rows, latestSeq}`, `fetchEntries(module, filters, page?, size?)`, `loadKeys(module, type, keys)`, `forceKeys(type, keys, kind)`, `parseKeys(text)`, `groupByType(rows)`, `formatInstant(iso)`.

- [ ] **Step 1: 의존을 설치하고 Vitest 를 붙인다**

`P/package.json` — scripts 의 `"lint": "eslint"` 를 `"lint": "eslint",` 로 바꾸고 아래 줄을 더한다:

```json
    "test": "vitest run tests"
```

devDependencies 에 더한다(m-mls 와 같은 버전 — `src/frontend/m-mls/package.json:45·49`):

```json
    "happy-dom": "^20.10.6",
    "vitest": "^3.2.4"
```

Run: `pnpm -C src/frontend install && pnpm -C src/frontend --filter @dk-oasis/shared build`
Expected: 설치·shared 빌드 성공(`pnpm-lock.yaml` 이 m-mcm 두 의존만큼 바뀐다). 로컬 서버(local-run)가 떠 있으면 shared build 를 하지 않는다 — dist 를 지워 떠 있는 watch 가 죽는다.

- [ ] **Step 2: 실패하는 시험을 쓴다**

`P/tests/csa/mdmCacheMng/api.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();

vi.mock("@dk-oasis/shared/http", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

import * as api from "../../../page-components/csa/mdmCacheMng/api";

const bodyOf = (call: unknown[]) => JSON.parse((call[1] as { body: string }).body);

const status = (module: string, appliedSeq: number, latestSeq: number, consecutiveFailures = 0) => ({
  module,
  instanceId: `${module}@host`,
  appliedSeq,
  latestSeq,
  lastSuccessAt: "2026-10-02T00:00:00Z",
  consecutiveFailures,
  lastError: null,
  counts: { COLUMN: 2, DOMAIN: 1 },
  maxEntries: 20000,
  maxAgeSeconds: 3600,
});

describe("mdmCacheMng api", () => {
  beforeEach(() => apiRequest.mockReset());

  it("상태 — 모듈 다섯을 부르고 응답 없는 모듈은 DOWN, 뒤처지면 LAGGING, 실패 중이면 FAILING", async () => {
    apiRequest.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/mqc/")) throw new Error("502");
      if (url.startsWith("/api/mls/")) return status("mls", 5, 9);
      if (url.startsWith("/api/mpp/")) return status("mpp", 9, 9, 2);
      return status(url.split("/")[2], 9, 9);
    });

    const { rows, latestSeq } = await api.fetchAllStatus(["mcm", "mls", "mqc", "mpp", "mpn"]);

    expect(apiRequest.mock.calls.map((c) => c[0])).toEqual([
      "/api/mcm/mdmMeta/status",
      "/api/mls/mdmMeta/status",
      "/api/mqc/mdmMeta/status",
      "/api/mpp/mdmMeta/status",
      "/api/mpn/mdmMeta/status",
    ]);
    expect(latestSeq).toBe(9);
    expect(rows.map((r) => [r.module, r.state])).toEqual([
      ["mcm", "OK"],
      ["mls", "LAGGING"],
      ["mqc", "DOWN"],
      ["mpp", "FAILING"],
      ["mpn", "OK"],
    ]);
    expect(rows[0].total).toBe(3);
    expect(rows[2].appliedSeq).toBeNull();
  });

  it("항목 — 종류·검색어·쪽을 쿼리로 보내고 행 키를 만든다", async () => {
    apiRequest.mockResolvedValue({
      total: 1,
      page: 0,
      size: 200,
      items: [{ type: "COLUMN", key: "COIL_THK", absent: false, loadedAt: "2026-10-02T00:00:00Z", hits: 3, remainingSeconds: 3000 }],
    });

    const page = await api.fetchEntries("mls", { type: "COLUMN", q: " coil " });

    expect(apiRequest.mock.calls[0][0]).toBe("/api/mls/mdmMeta/entries?type=COLUMN&q=coil&page=0&size=200");
    expect(page.items[0].rowId).toBe("COLUMN:COIL_THK");
    expect(page.items[0].hits).toBe(3);
  });

  it("등록 — 고른 모듈에 type·keys 를 POST 한다", async () => {
    apiRequest.mockResolvedValue({ loaded: ["COIL_THK"], missing: [], unavailable: [] });

    const r = await api.loadKeys("mcm", "COLUMN", ["coilThk"]);

    expect(apiRequest.mock.calls[0][0]).toBe("/api/mcm/mdmMeta/load");
    expect((apiRequest.mock.calls[0][1] as { method: string }).method).toBe("POST");
    expect(bodyOf(apiRequest.mock.calls[0])).toEqual({ type: "COLUMN", keys: ["coilThk"] });
    expect(r.loaded).toEqual(["COIL_THK"]);
  });

  it("삭제·재등록 — MDM metaFeed/save 에 OASIS 봉투로 보내고 키는 grids.keys.rows 다", async () => {
    apiRequest.mockResolvedValue({ meta: { success: true }, data: { result: { fromSeq: 10, toSeq: 11, count: 2 } } });

    const r = await api.forceKeys("RULE", ["R1", "R2"], "RELOAD");

    expect(apiRequest.mock.calls[0][0]).toBe("/api/mdm/oasis/metaFeed/save");
    expect(bodyOf(apiRequest.mock.calls[0])).toEqual({
      meta: { menuId: "mdmCacheMng" },
      params: { type: "RULE", kind: "RELOAD" },
      grids: { keys: { rows: [{ key: "R1" }, { key: "R2" }] } },
    });
    expect(r.count).toBe(2);
  });

  it("강제 기록이 거부되면(meta.success=false) 서버 메시지로 throw", async () => {
    apiRequest.mockResolvedValue({ meta: { success: false, message: "시스템 관리자만 할 수 있습니다" } });
    await expect(api.forceKeys("COLUMN", ["A"], "EVICT")).rejects.toThrow("시스템 관리자만 할 수 있습니다");
  });

  it("키 입력은 쉼표·공백·줄바꿈으로 나누고, 강제 기록은 대상 종류별로 묶는다", () => {
    expect(api.parseKeys("A, B\nC  A")).toEqual(["A", "B", "C"]);
    expect(
      api.groupByType([
        { rowId: "COLUMN:A", type: "COLUMN", key: "A", absent: false, loadedAt: "", hits: 0, remainingSeconds: 0 },
        { rowId: "RULE:R", type: "RULE", key: "R", absent: false, loadedAt: "", hits: 0, remainingSeconds: 0 },
        { rowId: "COLUMN:B", type: "COLUMN", key: "B", absent: true, loadedAt: "", hits: 0, remainingSeconds: 0 },
      ]),
    ).toEqual([
      ["COLUMN", ["A", "B"]],
      ["RULE", ["R"]],
    ]);
  });
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `pnpm -C src/frontend --filter @dk-oasis/mcm test`
Expected: FAIL — `Failed to resolve import "../../../page-components/csa/mdmCacheMng/api"`.

- [ ] **Step 4: 타입·호출 모듈을 만든다**

`P/page-components/csa/mdmCacheMng/types.ts`:

```ts
/** mdmCacheMng 타입·상수(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.5·§6). */

/** 캐시를 켠 업무 모듈. 응답하지 않는 모듈은 "연결 안 됨" 으로 보인다. */
export const MDM_CACHE_MODULES = ["mcm", "mls", "mqc", "mpp", "mpn"] as const;

export const MDM_TARGET_TYPES = ["COLUMN", "DOMAIN", "RULE", "RULE_SET", "CODE", "LAYOUT"] as const;
export type MdmTargetType = (typeof MDM_TARGET_TYPES)[number];

export const TARGET_TYPE_LABELS: Record<MdmTargetType, string> = {
  COLUMN: "컬럼",
  DOMAIN: "도메인",
  RULE: "룰",
  RULE_SET: "룰 세트",
  CODE: "마스터코드",
  LAYOUT: "전문",
};

export const TARGET_TYPE_OPTIONS = [
  { value: "", label: "전체" },
  ...MDM_TARGET_TYPES.map((value) => ({ value, label: TARGET_TYPE_LABELS[value] })),
];

export const REGISTER_TYPE_OPTIONS = MDM_TARGET_TYPES.map((value) => ({ value, label: TARGET_TYPE_LABELS[value] }));

/** 업무 모듈 GET /api/{module}/mdmMeta/status 응답. */
export interface ModuleStatus {
  module: string;
  instanceId: string;
  appliedSeq: number;
  latestSeq: number;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  lastError: string | null;
  counts: Record<string, number>;
  maxEntries: number;
  maxAgeSeconds: number;
}

export type ModuleState = "OK" | "LAGGING" | "FAILING" | "DOWN";

export const MODULE_STATE_LABELS: Record<ModuleState, string> = {
  OK: "정상",
  LAGGING: "최신 아님",
  FAILING: "확인 실패",
  DOWN: "연결 안 됨",
};

export interface ModuleStatusRow extends Record<string, unknown> {
  module: string;
  state: ModuleState;
  instanceId: string;
  appliedSeq: number | null;
  latestSeq: number | null;
  lastSuccessAt: string;
  consecutiveFailures: number | null;
  total: number | null;
}

export interface CacheEntryRow extends Record<string, unknown> {
  rowId: string;
  type: MdmTargetType;
  key: string;
  absent: boolean;
  loadedAt: string;
  hits: number;
  remainingSeconds: number;
}

export interface CacheEntryPage {
  total: number;
  page: number;
  size: number;
  items: CacheEntryRow[];
}

export interface EntryFilters {
  type: "" | MdmTargetType;
  q: string;
}

export const emptyFilters = (): EntryFilters => ({ type: "", q: "" });

export interface LoadResult {
  loaded: string[];
  missing: string[];
  unavailable: string[];
}

export type ForceKind = "EVICT" | "RELOAD";

export interface ForceResult {
  fromSeq: number;
  toSeq: number;
  count: number;
}
```

`P/page-components/csa/mdmCacheMng/api.ts`:

```ts
/**
 * mdmCacheMng 호출 — 업무 모듈 cactus 엔드포인트 /api/{module}/mdmMeta/*(GET status·entries, POST load)와 MDM OASIS metaFeed/save(강제 기록).
 * spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.5·§6. 강제 기록 봉투의 키 목록은 grids.keys.rows 다(params 배열 금지).
 */
import { apiRequest } from "@dk-oasis/shared/http";

import type {
  CacheEntryPage,
  CacheEntryRow,
  EntryFilters,
  ForceKind,
  ForceResult,
  LoadResult,
  MdmTargetType,
  ModuleState,
  ModuleStatus,
  ModuleStatusRow,
} from "./types";

const SCREEN_ID = "mdmCacheMng";
const FEED_BASE = "/api/mdm/oasis/metaFeed";
const metaBase = (module: string) => `/api/${module}/mdmMeta`;

interface CactusEnvelope<T> {
  meta?: { success?: boolean; message?: string };
  data?: { result?: T };
}

interface EntryPayload {
  total: number;
  page: number;
  size: number;
  items: Array<{ type: MdmTargetType; key: string; absent: boolean; loadedAt: string; hits: number; remainingSeconds: number }>;
}

/** ISO 시각을 로컬 "yyyy-MM-dd HH:mm:ss" 로. 비면 빈 문자열. */
export function formatInstant(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 키 입력(쉼표·공백·줄바꿈 구분)을 중복 없는 목록으로. */
export function parseKeys(text: string): string[] {
  return Array.from(new Set(text.split(/[\s,]+/).map((k) => k.trim()).filter(Boolean)));
}

export async function fetchStatus(module: string): Promise<ModuleStatus> {
  return apiRequest<ModuleStatus>(`${metaBase(module)}/status`, { method: "GET" });
}

function stateOf(s: ModuleStatus, latestSeq: number): ModuleState {
  if (s.consecutiveFailures > 0) return "FAILING";
  if (s.appliedSeq < latestSeq) return "LAGGING";
  return "OK";
}

/**
 * 모듈을 함께 부른다. 응답하지 않는 모듈은 "연결 안 됨" 행이다. MDM 최신 순번은 응답한 모듈들의 latestSeq(마지막 폴링 값) 최댓값이고,
 * appliedSeq 가 그보다 뒤처진 모듈은 LAGGING 이다 — 화면이 MDM 을 따로 부르지 않는다(spec §6).
 */
export async function fetchAllStatus(modules: readonly string[]): Promise<{ rows: ModuleStatusRow[]; latestSeq: number }> {
  const settled = await Promise.allSettled(modules.map((m) => fetchStatus(m)));
  const latestSeq = settled.reduce((max, s) => (s.status === "fulfilled" ? Math.max(max, s.value.latestSeq) : max), -1);
  const rows = settled.map((s, i): ModuleStatusRow => {
    if (s.status === "rejected") {
      return {
        module: modules[i],
        state: "DOWN",
        instanceId: "",
        appliedSeq: null,
        latestSeq: null,
        lastSuccessAt: "",
        consecutiveFailures: null,
        total: null,
      };
    }
    const v = s.value;
    return {
      module: modules[i],
      state: stateOf(v, latestSeq),
      instanceId: v.instanceId,
      appliedSeq: v.appliedSeq,
      latestSeq: v.latestSeq,
      lastSuccessAt: formatInstant(v.lastSuccessAt),
      consecutiveFailures: v.consecutiveFailures,
      total: Object.values(v.counts ?? {}).reduce((a, b) => a + b, 0),
    };
  });
  return { rows, latestSeq };
}

export async function fetchEntries(module: string, filters: EntryFilters, page = 0, size = 200): Promise<CacheEntryPage> {
  const q = new URLSearchParams();
  if (filters.type) q.set("type", filters.type);
  if (filters.q.trim()) q.set("q", filters.q.trim());
  q.set("page", String(page));
  q.set("size", String(size));
  const res = await apiRequest<EntryPayload>(`${metaBase(module)}/entries?${q.toString()}`, { method: "GET" });
  const items: CacheEntryRow[] = res.items.map((e) => ({
    rowId: `${e.type}:${e.key}`,
    type: e.type,
    key: e.key,
    absent: e.absent,
    loadedAt: formatInstant(e.loadedAt),
    hits: e.hits,
    remainingSeconds: e.remainingSeconds,
  }));
  return { total: res.total, page: res.page, size: res.size, items };
}

/** 고른 모듈 인스턴스에 미리 적재(신규 = 등록). */
export async function loadKeys(module: string, type: MdmTargetType, keys: string[]): Promise<LoadResult> {
  return apiRequest<LoadResult>(`${metaBase(module)}/load`, { method: "POST", body: JSON.stringify({ type, keys }) });
}

/** MDM 변경 기록에 강제 기록(삭제 EVICT·재등록 RELOAD) — 모든 모듈·인스턴스가 다음 확인 때 반영한다(D6). */
export async function forceKeys(type: MdmTargetType, keys: string[], kind: ForceKind): Promise<ForceResult> {
  const env = await apiRequest<CactusEnvelope<ForceResult>>(`${FEED_BASE}/save`, {
    method: "POST",
    body: JSON.stringify({
      meta: { menuId: SCREEN_ID },
      params: { type, kind },
      grids: { keys: { rows: keys.map((key) => ({ key })) } },
    }),
  });
  if (env?.meta?.success === false) throw new Error(env.meta.message || "요청이 거부되었습니다.");
  return env?.data?.result ?? { fromSeq: 0, toSeq: 0, count: 0 };
}

/** 선택한 항목을 대상 종류별로 묶는다(강제 기록은 종류 하나씩 부른다). */
export function groupByType(rows: CacheEntryRow[]): Array<[MdmTargetType, string[]]> {
  const map = new Map<MdmTargetType, string[]>();
  for (const r of rows) {
    const list = map.get(r.type) ?? [];
    list.push(r.key);
    map.set(r.type, list);
  }
  return Array.from(map.entries());
}
```

- [ ] **Step 5: 시험 통과를 확인한다**

Run: `pnpm -C src/frontend --filter @dk-oasis/mcm test`
Expected: PASS(6 tests).

- [ ] **Step 6: 등록 팝업과 화면을 만든다**

`P/page-components/csa/mdmCacheMng/RegisterModal.tsx`:

```tsx
"use client";

/**
 * mdmCacheMng 등록 팝업 — 고른 모듈 인스턴스에 대상 종류·키를 미리 적재한다(load). 화면 유형 E.
 * 규칙 정본: .claude/skills/mantine-aggrid-ui/references/screen-patterns.md §E
 */
import { useEffect, useState } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Button, Select, Textarea } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { loadKeys, parseKeys } from "./api";
import { REGISTER_TYPE_OPTIONS, type MdmTargetType } from "./types";

export interface RegisterModalProps {
  open: boolean;
  /** 적재할 모듈(위 그리드에서 고른 행). */
  module: string;
  onClose: () => void;
  /** 등록이 끝나면 부모가 항목을 다시 조회한다. */
  onRegistered: () => void;
}

export function RegisterModal({ open, module, onClose, onRegistered }: RegisterModalProps) {
  const { showMessage } = useMessage();
  const [type, setType] = useState<MdmTargetType>("COLUMN");
  const [keysText, setKeysText] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  // 열 때마다 빈 폼으로 시작한다.
  useEffect(() => {
    if (open) {
      setType("COLUMN");
      setKeysText("");
    }
  }, [open]);

  const handleSubmit = async () => {
    const keys = parseKeys(keysText);
    if (keys.length === 0) {
      showMessage({ message: "키을(를) 입력하세요.", alertType: "warning" });
      return;
    }
    setIsBusy(true);
    try {
      const r = await loadKeys(module, type, keys);
      if (r.missing.length > 0 || r.unavailable.length > 0) {
        showMessage({
          title: "확인",
          message:
            `적재 ${r.loaded.length}건, MDM 에 없음 ${r.missing.length}건(${r.missing.join(", ")}), ` +
            `받을 수 없음 ${r.unavailable.length}건(${r.unavailable.join(", ")})`,
          alertType: "warning",
        });
      } else {
        showMessage({ message: "저장되었습니다.", alertType: "success", toast: true });
      }
      onRegistered();
      onClose();
    } catch (e) {
      showMessage({ title: "오류", message: e instanceof Error ? e.message : String(e), alertType: "error" });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`캐시 등록 — ${module}`}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={isBusy}>
            등록
          </Button>
        </>
      }
    >
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>대상 종류 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Select value={type} options={REGISTER_TYPE_OPTIONS} disabled={isBusy} onChange={(v) => setType(v as MdmTargetType)} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>키 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Textarea value={keysText} disabled={isBusy} onChange={setKeysText} />
            </td>
          </tr>
        </tbody>
      </table>
    </Modal>
  );
}
```

`P/page-components/csa/mdmCacheMng/page.tsx`:

```tsx
"use client";

/**
 * mdmCacheMng — MDM 캐시 관리(시스템관리 > MDM 캐시 관리). 화면 유형 D(마스터-디테일) + E(등록 팝업).
 * 위: 업무 모듈별 캐시 상태, 아래: 고른 모듈의 캐시 항목. 신규 = 고른 모듈 인스턴스에 미리 적재, 삭제·재등록 = MDM 변경 기록에 강제 기록
 * (모든 모듈·인스턴스가 다음 확인 때 반영). spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §6,
 * 규칙 정본: .claude/skills/mantine-aggrid-ui/references/screen-patterns.md §D·§E, docs/guide/FrontEnd/Local-Rules.md §9(중요 액션).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { ContentBody, ContentPanel, PageLayout, SearchArea, SearchField } from "@dk-oasis/shared/layout";
import { AgDataGrid, GridBadge, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { fetchAllStatus, fetchEntries, forceKeys, groupByType } from "./api";
import { RegisterModal } from "./RegisterModal";
import {
  MDM_CACHE_MODULES,
  MODULE_STATE_LABELS,
  TARGET_TYPE_LABELS,
  TARGET_TYPE_OPTIONS,
  emptyFilters,
  type CacheEntryRow,
  type EntryFilters,
  type ForceKind,
  type MdmTargetType,
  type ModuleState,
  type ModuleStatusRow,
} from "./types";

const SCREEN_ID = "mdmCacheMng";

/** 상태 배지 색: 의미 토큰만 쓴다(screen-patterns.md §배지 색). */
const STATE_BADGE: Record<ModuleState, { bg?: string; color?: string; muted?: boolean }> = {
  OK: { bg: "var(--color-success-soft)", color: "var(--color-success)" },
  LAGGING: { bg: "var(--color-warning-soft)", color: "var(--color-warning)" },
  FAILING: { bg: "var(--color-danger-soft)", color: "var(--color-danger)" },
  DOWN: { muted: true },
};

const MODULE_COLUMNS: GridColumn[] = [
  { key: "module", header: "모듈", width: 80, align: "left" },
  {
    key: "state",
    header: "상태",
    width: 80,
    align: "center",
    render: (v) => <GridBadge label={MODULE_STATE_LABELS[v as ModuleState] ?? String(v)} {...STATE_BADGE[v as ModuleState]} />,
  },
  { key: "instanceId", header: "인스턴스", width: 180, align: "left" },
  { key: "appliedSeq", header: "적용 순번", width: 100, align: "right", type: "number" },
  { key: "latestSeq", header: "MDM 순번", width: 100, align: "right", type: "number" },
  { key: "lastSuccessAt", header: "마지막 확인", width: 140, align: "center" },
  { key: "consecutiveFailures", header: "연속 실패", width: 100, align: "right", type: "number" },
  { key: "total", header: "항목 수", width: 100, align: "right", type: "number" },
];

const ENTRY_COLUMNS: GridColumn[] = [
  { key: "type", header: "대상", width: 100, align: "left", render: (v) => TARGET_TYPE_LABELS[v as MdmTargetType] ?? String(v) },
  { key: "key", header: "키", width: 180, minWidth: 180, align: "left" },
  {
    key: "absent",
    header: "값",
    width: 80,
    align: "center",
    render: (v) =>
      v ? <GridBadge label="없음" muted /> : <GridBadge label="있음" bg="var(--color-success-soft)" color="var(--color-success)" />,
  },
  { key: "loadedAt", header: "적재 시각", width: 140, align: "center" },
  { key: "hits", header: "조회 수", width: 100, align: "right", type: "number" },
  { key: "remainingSeconds", header: "남은 수명(초)", width: 100, align: "right", type: "number" },
];

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function MdmCacheMngPage() {
  const { showMessage } = useMessage();
  const [filters, setFilters] = useState<EntryFilters>(emptyFilters);
  const [modules, setModules] = useState<ModuleStatusRow[]>([]);
  const [latestSeq, setLatestSeq] = useState(-1);
  const [entries, setEntries] = useState<CacheEntryRow[]>([]);
  const [selectedModule, setSelectedModule] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<(string | number)[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [isDetailBusy, setIsDetailBusy] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);

  const selectedEntries = useMemo(() => entries.filter((e) => selectedKeys.includes(e.rowId)), [entries, selectedKeys]);

  const loadEntries = useCallback(
    async (module: string, f: EntryFilters) => {
      setIsDetailBusy(true);
      try {
        setEntries((await fetchEntries(module, f)).items);
        setSelectedKeys([]);
      } catch (e) {
        setEntries([]);
        showMessage({ title: "오류", message: errorText(e), alertType: "error" });
      } finally {
        setIsDetailBusy(false);
      }
    },
    [showMessage],
  );

  const handleSearch = useCallback(async () => {
    setIsBusy(true);
    try {
      const { rows, latestSeq: latest } = await fetchAllStatus(MDM_CACHE_MODULES);
      setModules(rows);
      setLatestSeq(latest);
      const keep = rows.find((r) => r.module === selectedModule && r.state !== "DOWN");
      if (keep) {
        await loadEntries(keep.module, filters);
      } else {
        setSelectedModule("");
        setEntries([]);
        setSelectedKeys([]);
      }
    } catch (e) {
      showMessage({ title: "오류", message: errorText(e), alertType: "error" });
    } finally {
      setIsBusy(false);
    }
  }, [filters, loadEntries, selectedModule, showMessage]);

  useEffect(() => {
    void handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 위 행을 누르면 그 모듈의 항목을 조회한다. 연결 안 된 모듈은 항목을 비운다. */
  const handleModuleClick = useCallback(
    async (row: Record<string, unknown>) => {
      const module = String(row.module ?? "");
      setSelectedModule(module);
      if (row.state === "DOWN") {
        setEntries([]);
        setSelectedKeys([]);
        return;
      }
      await loadEntries(module, filters);
    },
    [filters, loadEntries],
  );

  const openRegister = () => {
    const row = modules.find((r) => r.module === selectedModule);
    if (!row || row.state === "DOWN") {
      showMessage({ message: "모듈을(를) 선택하세요.", alertType: "warning" });
      return;
    }
    setRegisterOpen(true);
  };

  const runForce = useCallback(
    async (kind: ForceKind) => {
      setIsBusy(true);
      try {
        for (const [type, keys] of groupByType(selectedEntries)) {
          await forceKeys(type, keys, kind);
        }
        showMessage({ message: kind === "EVICT" ? "삭제되었습니다." : "재등록을 요청했습니다.", alertType: "success", toast: true });
        setSelectedKeys([]);
      } catch (e) {
        showMessage({ title: "오류", message: errorText(e), alertType: "error" });
      } finally {
        setIsBusy(false);
      }
    },
    [selectedEntries, showMessage],
  );

  /** 중요 액션(Local-Rules §9) — 영향 범위(모든 모듈·인스턴스, 다음 확인 약 10초)를 보여 주고 확인을 받는다. */
  const confirmForce = (kind: ForceKind) =>
    showMessage({
      title: "확인",
      message:
        kind === "EVICT"
          ? `선택한 ${selectedEntries.length}건을 모든 모듈 캐시에서 삭제하시겠습니까? 각 모듈이 다음 확인(약 10초) 때 지웁니다.`
          : `선택한 ${selectedEntries.length}건을 모든 모듈에서 다시 적재하시겠습니까? 각 모듈이 다음 확인(약 10초) 때 지우고 다시 받습니다.`,
      alertType: "confirm",
      onConfirm: () => void runForce(kind),
    });

  const setFilter = (key: keyof EntryFilters, value: string) => setFilters((prev) => ({ ...prev, [key]: value }));

  return (
    <PageLayout
      title="MDM 캐시 관리"
      breadcrumb="시스템관리 > MDM 캐시 관리"
      screenId={SCREEN_ID}
      objId={SCREEN_ID}
      buttons={[
        { id: "btn_search", label: "조회", onClick: () => void handleSearch(), type: "primary", disabled: isBusy, action: "search" },
        { id: "btn_new", label: "신규", onClick: openRegister, disabled: isBusy, action: "save" },
        { id: "btn_delete", label: "삭제", onClick: () => confirmForce("EVICT"), disabled: isBusy || selectedEntries.length === 0, action: "delete" },
        { id: "btn_reload", label: "재등록", onClick: () => confirmForce("RELOAD"), disabled: isBusy || selectedEntries.length === 0, action: "reload" },
      ]}
    >
      <SearchArea onSearch={() => void handleSearch()}>
        <SearchField label="대상 종류" type="select" options={TARGET_TYPE_OPTIONS} value={filters.type} onChange={(v) => setFilter("type", v)} />
        <SearchField label="키" value={filters.q} onChange={(v) => setFilter("q", v)} />
      </SearchArea>

      <ContentBody root direction="column" resizable storageKey="mcm.csa.mdmCacheMng">
        <ContentPanel>
          <GridPanel title={latestSeq >= 0 ? `모듈 상태 (MDM 최신 순번 ${latestSeq})` : "모듈 상태"} count={modules.length}>
            <AgDataGrid
              rowKey="module"
              columns={MODULE_COLUMNS}
              data={modules}
              columnSizing="fit"
              highlightedRowKey={selectedModule}
              onRowClick={(row) => void handleModuleClick(row)}
              loading={isBusy}
            />
          </GridPanel>
        </ContentPanel>
        <ContentPanel height="40%">
          <GridPanel title={selectedModule ? `캐시 항목 — ${selectedModule}` : "캐시 항목"} count={entries.length}>
            <AgDataGrid
              rowKey="rowId"
              columns={ENTRY_COLUMNS}
              data={entries}
              columnSizing="fit"
              selectable
              multiSelect
              selectedRows={selectedKeys}
              onRowSelect={(ids) => setSelectedKeys(ids)}
              loading={isDetailBusy}
            />
          </GridPanel>
        </ContentPanel>
      </ContentBody>

      <RegisterModal
        open={registerOpen}
        module={selectedModule}
        onClose={() => setRegisterOpen(false)}
        onRegistered={() => void loadEntries(selectedModule, filters)}
      />
    </PageLayout>
  );
}
```

- [ ] **Step 7: 레지스트리를 다시 만들고 검사 세 가지를 돌린다**

Run: `pnpm -C src/frontend --filter @dk-oasis/mcm generate:page-registry && /usr/bin/git diff --stat src/frontend/m-mcm/lib/generated/page-registry.ts`
Expected: `"csa/mdmCacheMng": () => import("@/page-components/csa/mdmCacheMng/page"),` 한 줄이 더해진다.

Run:
```bash
python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mcm/page-components/csa/mdmCacheMng
python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/m-mcm/page-components/csa/mdmCacheMng
```
Expected: 두 audit 모두 0건. 걸리면 shared 래퍼·props 를 스킬 문서(`references/components/*.md`)대로 고친다 — `@mantine/*`·`ag-grid-*` 를 화면에서 import 하지 않는다.

Run: `pnpm -C src/frontend/m-mcm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "mdmCacheMng|tests/csa" ; pnpm -C src/frontend/m-mcm exec eslint page-components/csa/mdmCacheMng tests/csa`
Expected: tsc 출력에 새 파일 줄이 없고(기존 파일의 오류는 이 작업 범위가 아니다), eslint 오류 0. `Select`·`Textarea` 의 `disabled`·`options` prop 이 타입 오류면 `references/components/select.md`·`textarea.md` 의 props 표대로 맞춘다.

- [ ] **Step 8: 커밋**

```bash
/usr/bin/git add src/frontend/m-mcm/page-components/csa/mdmCacheMng src/frontend/m-mcm/tests/csa/mdmCacheMng \
  src/frontend/m-mcm/package.json src/frontend/pnpm-lock.yaml src/frontend/m-mcm/lib/generated/page-registry.ts
/usr/bin/git commit -m "$(cat <<'EOF'
feat(m-mcm): 시스템관리에 모듈별 MDM 캐시 상태·항목과 등록·삭제·재등록 화면을 더한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 13: 문서 — ADR-0006(하이브리드 배포와 리비전 무효화), 백엔드 가이드 절, mdm 인덱스

**Files:**
- Create: `docs/mdm/adr/0006-mdm-meta-hybrid-cache-revision.md`
- Modify: `docs/mdm/adr/README.md`(인덱스 표 한 줄)
- Modify: `docs/guide/BackEnd/Backend-Implementation-Guide.md`(끝에 `## 11. 업무 모듈에서 MDM 메타 켜기`)
- Modify: `docs/mdm/README.md`(목록 한 줄)

**Interfaces:**
- Consumes: Task 0 커밋 본문의 실측 결과(중첩 includeBuild 전달 여부), Task 1~12 의 이름·경로·설정값.
- Produces: 문서만. 코드 변경 없음.

- [ ] **Step 1: 번호를 확인한다**

mdm ADR 은 `docs/mdm/adr/` 에 손으로 채번한다 — `adr_tool.py` 는 경로를 `docs/{module}/design/adr` 로 고정해 mdm 에서는 `new`·`status`·`index` 를 쓰지 않는다(`docs/mdm/adr/README.md` 「위치·발행 방식 이탈」).

Run: `ls docs/mdm/adr/`
Expected: `0001`~`0005` 와 `README.md`. 다음 번호는 `0006`.

- [ ] **Step 2: ADR 을 쓴다**

`docs/mdm/adr/0006-mdm-meta-hybrid-cache-revision.md`(Task 0 실측 문장을 「Context」 의 빈 자리에 넣는다):

```markdown
# ADR-0006: MDM 메타는 업무 모듈이 받아 캐시하고 변경 기록 순번으로 무효화한다

- **Status**: PROPOSED
- **Date**: 2026-10-02
- **Decision Date**: 2026-10-02
- **Context Tags**: MDM, CACHE, CACTUS, MES_MODULES, OASIS

## 쉬운 설명 (현업용 요약)

MDM 에는 컬럼 사전·도메인·업무기준(룰)·룰 세트·마스터코드·전문 같은 기준 정보가 모여 있다. 업무 화면과 업무 서버가
이 기준 정보로 라벨을 붙이고 입력값을 검사하려면 매번 MDM 에 물어볼 수도, 기준 정보를 받아 두고 쓸 수도 있다.

**업무 모듈이 받아 두고 쓰기로 했다.** 매번 물으면 MDM 이 잠깐 멈출 때 업무도 같이 멈추고, 화면 하나를 열 때마다 MDM 을
여러 번 부르게 된다. 대신 받아 둔 기준 정보가 오래되지 않게, MDM 은 기준 정보를 바꿀 때마다 "몇 번째 변경에서 무엇이
바뀌었는지"를 적어 두고, 업무 모듈은 10초마다 그 기록을 확인해 바뀐 것만 지운다. 지운 것은 다음에 필요할 때 다시 받는다.

관리자는 포털 시스템관리의 "MDM 캐시 관리" 화면에서 모듈별로 받아 둔 기준 정보와 확인 상태를 보고, 필요하면 특정 항목을
모든 모듈에서 지우거나 다시 받게 할 수 있다.

## Context (배경)

- 업무 모듈(mcm·mls·mqc·mpp·mpn)은 MDM 을 참조하지 않았다. MDM(8096, 전용 SQLite)은 메타를 다른 모듈에 내주는 API 가 없었다.
- 하위 프로젝트 B(UI 캡션·툴팁)와 C(화면·BE 값 검증)가 같은 메타를 쓴다. 화면 검사와 서버 검사가 같은 정의를 봐야 한다.
- 엔진(maru-mdm-engine)은 EvalEx 하나만 의존하는 순수 Java 라 업무 모듈이 직접 실행할 수 있다.
- 빌드: cactus-core 는 업무 모듈의 includeBuild 다. 엔진을 api 로 물리면서 중첩 includeBuild 전달을 실측했다 — <Task 0 실측 결과 문장>.
  업무 모듈 다섯 곳 settings.gradle 에 엔진 includeBuild 를 명시했다(mdm 선례).
- 설계 정본: [spec](../../superpowers/specs/2026-10-02-mdm-meta-cache-design.md), 구현 계획:
  [plan](../../superpowers/plans/2026-10-02-mdm-meta-cache.md).

## Decision (결정)

- **D1 하이브리드 배포**: 정의는 MDM 서버에 HTTP(OASIS `metaFeed`)로 요청해 받고, 업무 모듈은 받은 정의를 자기 로컬 캐시에 두고
  엔진 jar 로 직접 검증한다. MDM 서버에는 캐시를 두지 않는다 — 늘 DB 최신 값을 준다.
- **D2 리비전 무효화**: MDM 원장 쓰기 서비스는 같은 트랜잭션에서 `TB_MDM_META_REV`(증가 순번·대상 종류·키·변경 종류)에 기록을
  남긴다(`MetaRevisionRecorder`, 키 펼침 — 도메인 → 하위 도메인·참조 컬럼, 코드 → 참조 도메인 펼침, 헤더 → 사용 전문, 물리명 변경 → 두 이름).
  업무 모듈은 `poll-interval`(기본 10초)마다 `search(since=appliedSeq)` 로 받은 키만 지운다. 규칙 다섯 가지(기동·정상·truncated·역행·경합)를 둔다.
- **D3 클라이언트 위치**: cactus-core `com.dongkuk.dmes.cactus.mdm`(자동 설정, 기본 꺼짐). 업무 모듈은 `cactus.mdm.enabled: true`
  와 `cactus.mdm.module` 로 켠다. 엔드포인트 `/api/{module}/mdmMeta/{columns,domains,status,entries,load}`.
- **D4 장애 시**: 캐시에 있는 항목은 계속 쓴다. 없는 키는 "받을 수 없음"이고 캐시하지 않는다. 연속 실패면 30초 동안 MDM 을 부르지 않는다.
  기록 누락에 대비해 항목 최대 수명(기본 60분)을 둔다.
- **D5 화면 삭제·재등록**: MDM 변경 기록에 강제 기록(EVICT·RELOAD, SYSADMIN 만)을 더하는 방식이다. 모든 모듈·인스턴스가 다음 확인에서 반영한다.

## Consequences (결과)

- 업무 처리는 MDM 이 멈춰도 이미 받은 정의로 계속된다. 대신 최대 10초(확인 주기) 동안 옛 정의가 보일 수 있다.
- **순번 순서 = 커밋 순서 가정**: SQLite 는 쓰기 트랜잭션이 하나뿐이라 작은 순번이 먼저 커밋된다. 쓰기 동시성이 있는 운영 DB 에서는 긴
  트랜잭션이 순번 10 을 받은 채 늦게 커밋되는 사이 업무 모듈이 순번 11 까지 적용하면 10 의 변경을 영영 보지 못한다. 그때의 안전망은 항목
  최대 수명(60분)뿐이다. 운영 DB 를 정할 때(ADR-0004) 기록 시각 기준 겹침 재조회나 커밋 뒤 순번 발급으로 보강한다.
- 기록 쓰기는 여러 행 `VALUES` 네이티브 INSERT 한 문장이다(SQLite·PostgreSQL·MSSQL·Oracle 23ai). 더 옛 Oracle 로 가면 고친다.
- 운영 DDL 은 Flyway 가 꺼진 프로필(`application-wildfly.yml`)에서 운영 DB 확정 때 수동으로 맞춘다(V17 `TB_MDM_META_REV`).
- 변경 기록 보관 정리(30일)는 아직 없다. 정리로 생긴 공백은 클라이언트가 역행·truncated 규칙으로만 다룬다.
- 업무 모듈 mqc·mpp·mpn 에는 ClientKeyFilter 가 없어 관리 엔드포인트의 SYSADMIN 확인을 BFF 가 넘긴 `X-Authenticated-Role` 헤더로 한다.
  이 모듈들의 다른 엔드포인트와 같은 신뢰 수준이다.

## Alternatives Considered (대안)

- **업무 모듈이 매번 MDM 에 묻기**: 캐시 정합 문제는 없지만 MDM 장애가 업무 장애가 되고, 화면 하나에 MDM 호출이 여러 번이다.
- **MDM 서버 캐시 + 모듈 반영 상태 관리**: 이전에 고른 안. 캐시가 두 겹이 되고, 모듈 인스턴스마다 반영 상태를 MDM 이 알아야 한다. D1 로 대체했다.
- **푸시(메시지 큐) 무효화**: 즉시 반영되지만 새 인프라(Kafka 등)를 운영해야 하고, 놓친 메시지를 다시 맞추는 장치가 결국 순번 기록과 같다.
- **TTL 만 두기**: 단순하지만 바뀐 정의가 수명만큼 남는다. 수명은 안전망으로만 남겼다.

## Trigger (PROPOSED 인 경우만)

- 업무 모듈 한 곳 이상에서 하위 프로젝트 B(캡션·툴팁) 또는 C(검증)가 이 캐시로 동작하고, 통합 확인(구현 계획 Task 14)이 통과하면 ACCEPTED 로 올린다.
- 운영 DB 가 정해지면(ADR-0004) 「Consequences」 의 순번 순서 가정을 다시 본다.

## References

- [spec 2026-10-02-mdm-meta-cache-design](../../superpowers/specs/2026-10-02-mdm-meta-cache-design.md)
- [ADR-0004 운영 DB 미정](0004-drop-mssql-production-assumption.md), [ADR-0005 룰 세트 실행은 엔진](0005-rule-set-runs-in-engine.md)
- 코드: `src/backend/mdm/lib/.../common/metarev/MetaRevisionRecorder.java`, `.../feed/metaFeed/service/MetaFeedService.java`,
  `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/`
```

- [ ] **Step 3: 린트**

Run: `python3 .claude/skills/adr-write/scripts/adr_tool.py lint docs/mdm/adr/0006-mdm-meta-hybrid-cache-revision.md`
Expected: ERROR 0.

- [ ] **Step 4: 적대적 검토(adr-write §8)**

Run: 서브에이전트 하나에 "docs/mdm/adr/0006-mdm-meta-hybrid-cache-revision.md 를 spec·구현 코드(MetaRevisionRecorder·MetaFeedService·cactus mdm 패키지)와 대조해 논리·정합 결함을 찾아라. 고치지 말고 결함만 보고"를 맡긴다.
Expected: 확인된 결함을 본문에 반영한다(Status 는 PROPOSED 그대로).

- [ ] **Step 5: 인덱스·가이드·mdm 목록을 고친다**

`docs/mdm/adr/README.md` 표 끝에 한 줄:

```markdown
| [0006](0006-mdm-meta-hybrid-cache-revision.md) | MDM 메타는 업무 모듈이 받아 캐시하고 변경 기록 순번으로 무효화한다 | PROPOSED | 2026-10-02 | 하이브리드 배포(정의는 MDM HTTP `metaFeed`, 판정은 업무 모듈 엔진), `TB_MDM_META_REV` 증가 순번 + 10초 폴링으로 바뀐 키만 지움(규칙 5가지), cactus-core `com.dongkuk.dmes.cactus.mdm`(기본 꺼짐), 장애 시 캐시 유지·30초 건너뛰기·60분 수명, 화면 삭제·재등록 = SYSADMIN 강제 기록. 순번 순서 = 커밋 순서 가정은 SQLite 단일 쓰기에 기댄다. |
```

`docs/guide/BackEnd/Backend-Implementation-Guide.md` 끝에:

````markdown

## 11. 업무 모듈에서 MDM 메타 켜기

MDM(8096)의 컬럼 사전·도메인·룰·룰 세트·마스터코드·전문 정의를 업무 모듈이 받아 캐시하고 엔진으로 직접 쓴다. 결정은
[mdm ADR-0006](../../mdm/adr/0006-mdm-meta-hybrid-cache-revision.md), 설계는
[spec](../../superpowers/specs/2026-10-02-mdm-meta-cache-design.md).

- 켜기: 모듈 `api/src/main/resources/application.yml` 의 `cactus:` 아래(없으면 최상위 `cactus:` 를 만든다)에 둔다. 기본은 꺼짐이고 MDM 서버 자신은 켜지 않는다.

  ```yaml
  cactus:
    mdm:
      enabled: ${MDM_CACHE_ENABLED:true}
      module: mls                       # /api/{module}/mdmMeta 의 module. 비면 cactus.oasis.service-group
      base-url: ${MDM_WAS_URL:http://localhost:8096}
      client-key: ${BACKEND_CLIENT_KEY:dmes-bff-local-client-key-2026}
      poll-interval: 10s
      max-entries: 20000
      max-age: 60m
      connect-timeout: 2s
      read-timeout: 5s
  ```

- 빌드: cactus-core 가 `maru-mdm-engine` 을 api 로 문다. 새 업무 모듈은 settings.gradle 에 `includeBuild('../maru-mdm-engine')` +
  `substitute module('kr.dongkuk.maru.mdm:maru-mdm-engine') using project(':')` 를 둔다(기존 다섯 모듈 선례).
- 코드에서 쓰기: `MdmDefinitionLookup`(엔진 `DefinitionLookup`·`CodeLookup` 빈)을 주입해 `DefaultDomainValidator`·룰 엔진에 넘긴다.
  MDM 을 받을 수 없으면 `MdmUnavailableException` 이다. 여러 키는 `MdmMetaService.lookup(type, keys)` 로 한 번에 받는다.
- 엔드포인트 `/api/{module}/mdmMeta/`: `columns`·`domains`(POST, 로그인 사용자 — 화면 메타·툴팁), `status`·`entries`(GET)·`load`(POST)는
  SYSADMIN 만(`X-Authenticated-Role`). 새 모듈은 BFF `m-mcm/proxy.ts` 의 authOnlyPrefixes 에 `/api/{module}/mdmMeta/` 를 더하고,
  포털 화면 `csa/mdmCacheMng` 의 `MDM_CACHE_MODULES` 에 모듈을 더한다.
- 무효화: MDM 원장 쓰기 서비스는 같은 트랜잭션에서 `MetaRevisionRecorder` 를 부른다(판정 값이 바뀌는 쓰기만, 의심스러우면 건다). 새 원장
  쓰기 경로를 만들면 기록 호출을 함께 넣는다.
````

`docs/mdm/README.md` — `- [adr/](adr/README.md) — mdm ADR(설계 결정 기록)` 줄 아래에:

```markdown
- 메타 제공·업무 모듈 캐시 — OASIS `metaFeed`(`services/feed/`)와 변경 기록 `TB_MDM_META_REV`, 업무 모듈 cactus 캐시. 결정 [adr/0006](adr/0006-mdm-meta-hybrid-cache-revision.md), 설계 [spec](../superpowers/specs/2026-10-02-mdm-meta-cache-design.md)
```

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add docs/mdm/adr/0006-mdm-meta-hybrid-cache-revision.md docs/mdm/adr/README.md \
  docs/guide/BackEnd/Backend-Implementation-Guide.md docs/mdm/README.md
/usr/bin/git commit -m "$(cat <<'EOF'
docs(mdm): MDM 메타 하이브리드 캐시 ADR-0006 과 업무 모듈에서 켜는 법을 적는다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: 통합 수동 검증 — 로컬 mdm + mls(+ mqc·mcm·포털)에서 10초 안 반영과 화면 재등록

**Files:** 없음(코드 변경 없음). 로그는 `$W/logs/`.

**Interfaces:**
- Consumes: Task 0~13 전부.
- Produces: 확인 결과 보고(각 단계의 실제 출력 한 줄씩). 실패하면 그 단계 출력과 로그 끝 50줄을 보고한다.

- [ ] **Step 1: 사전 조건과 포트를 확인한다**

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home PATH=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin:$PATH
mkdir -p src/backend/data logs
lsof -nP -iTCP:8096 -iTCP:8092 -iTCP:8093 -iTCP:8094 -iTCP:8095 -iTCP:8100 -iTCP:5100 -sTCP:LISTEN
```
Expected: 아무것도 듣지 않는다. 떠 있으면 `lsof -a -p <pid> -d cwd` 로 어느 체크아웃인지 본다 — 이 워크트리가 아니면 **끄지 말고** 팀장(요청한 세션)에게 알리고 멈춘다(다른 체크아웃 서버를 내리면 사용자 작업이 끊긴다).

- [ ] **Step 2: 서버를 띄운다(각자 nohup — be-run.sh 는 체크아웃당 하나라 쓰지 않는다)**

```bash
T=$(date +%H%M)
(cd src/backend/mdm && nohup ../gradlew :api:bootRun --args='--spring.profiles.active=local --mdm.sample.path=sample/mdm-local-sample.sql' --console=plain > ../../../logs/mdm-bootrun-$T.log 2>&1 &)
(cd src/backend/mls && nohup ../gradlew :api:bootRun --console=plain > ../../../logs/mls-bootrun-$T.log 2>&1 &)
(cd src/backend/mqc && nohup ../gradlew :api:bootRun --console=plain > ../../../logs/mqc-bootrun-$T.log 2>&1 &)
(cd src/backend/mcm && nohup ../gradlew :api:bootRun --args='--spring.profiles.active=local' --console=plain > ../../../logs/mcm-bootrun-$T.log 2>&1 &)
```
기다리기(백그라운드 Bash 로 끝날 때 알림): `until lsof -nP -iTCP:8096 -sTCP:LISTEN >/dev/null && lsof -nP -iTCP:8092 -sTCP:LISTEN >/dev/null && lsof -nP -iTCP:8093 -sTCP:LISTEN >/dev/null && lsof -nP -iTCP:8100 -sTCP:LISTEN >/dev/null; do sleep 5; done`
Expected: 네 포트가 듣는다.

mpp·mpn 은 yml 블록이 손으로 붙인 최상위 `cactus:` 라 한 번은 실제로 띄워 본다(16GB 노트북 — 위 넷과 동시에 띄우지 말고 Step 3 뒤에 차례로 띄우고 확인 뒤 바로 내린다):

```bash
(cd src/backend/mpp && nohup ../gradlew :api:bootRun --console=plain > ../../../logs/mpp-bootrun-$T.log 2>&1 &)
until lsof -nP -iTCP:8094 -sTCP:LISTEN >/dev/null; do sleep 5; done
curl -s http://localhost:8094/api/mpp/mdmMeta/status -H 'X-Authenticated-User: admin' -H 'X-Authenticated-Role: SYSADMIN'
lsof -t -nP -iTCP:8094 -sTCP:LISTEN | xargs -r kill
(cd src/backend/mpn && nohup ../gradlew :api:bootRun --console=plain > ../../../logs/mpn-bootrun-$T.log 2>&1 &)
until lsof -nP -iTCP:8095 -sTCP:LISTEN >/dev/null; do sleep 5; done
curl -s http://localhost:8095/api/mpn/mdmMeta/status -H 'X-Authenticated-User: admin' -H 'X-Authenticated-Role: SYSADMIN'
lsof -t -nP -iTCP:8095 -sTCP:LISTEN | xargs -r kill
```
Expected: 두 status 의 `module` 이 각각 `mpp`·`mpn` 이고 `appliedSeq == latestSeq`. (이 확인은 Step 3 의 MDM 이 떠 있는 동안 한다.) 빈 `src/backend/data/mdm.db` 라 MDM 로컬 샘플이 한 번 들어간다(`MdmLocalSampleLoader` — 기록은 남기지 않는다).

- [ ] **Step 3: MDM 피드와 모듈 상태를 확인한다**

```bash
KEY=${BACKEND_CLIENT_KEY:-dmes-bff-local-client-key-2026}
curl -s -X POST http://localhost:8096/oasis/metaFeed/search -H 'Content-Type: application/json' -H "X-Client-Key: $KEY" \
  -H 'X-Authenticated-User: system:manual' -H 'X-Authenticated-Role: SYSTEM' \
  -d '{"meta":{"menuId":"metaFeed"},"params":{"since":0,"limit":5},"grids":{"keys":{"rows":[]}}}'
curl -s http://localhost:8092/api/mls/mdmMeta/status -H "X-Client-Key: $KEY" -H 'X-Authenticated-User: admin' -H 'X-Authenticated-Role: SYSADMIN'
curl -s http://localhost:8093/api/mqc/mdmMeta/status -H 'X-Authenticated-User: admin' -H 'X-Authenticated-Role: SYSADMIN'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8093/api/mqc/mdmMeta/status -H 'X-Authenticated-Role: MCM_VIEWER'
```
Expected: 피드 `meta.success:true`·`latestSeq` 숫자. mls·mqc status 의 `module` 이 각각 `mls`·`mqc`, `appliedSeq == latestSeq`, `consecutiveFailures: 0`. 마지막 줄 `403`.

- [ ] **Step 4: 컬럼 하나를 mls 에 적재하고 MDM 에서 표시명을 바꾼 뒤 10초 안 반영을 본다**

```bash
read CID PHYS <<<"$(sqlite3 src/backend/data/mdm.db "SELECT COLUMN_ID, PHYS_NAME FROM TB_MDM_COLUMN WHERE DOMAIN_ID IS NOT NULL ORDER BY COLUMN_ID LIMIT 1" | tr '|' ' ')"
A=(-H 'Content-Type: application/json' -H "X-Client-Key: $KEY" -H 'X-Authenticated-User: admin' -H 'X-Authenticated-Role: SYSADMIN')
curl -s -X POST http://localhost:8092/api/mls/mdmMeta/columns "${A[@]}" -d "{\"names\":[\"$PHYS\"]}"

M=(-H 'Content-Type: application/json' -H "X-Client-Key: $KEY" -H 'X-Authenticated-User: admin' -H 'X-Authenticated-Role: MDM_STD_ADMIN')
VIEW=$(curl -s -X POST http://localhost:8096/oasis/columnMng/view "${M[@]}" -d "{\"meta\":{\"menuId\":\"columnMng\"},\"params\":{\"columnId\":$CID}}")
BODY=$(python3 - "$VIEW" <<'PY'
import json, sys
r = json.loads(sys.argv[1])["data"]["result"]
c = dict(r["column"])
c["labelMid"] = (c.get("labelMid") or "") + "-변경"
print(json.dumps({"meta": {"menuId": "columnMng"}, "params": c,
                  "grids": {"systems": {"rows": r["systems"]}, "terms": {"rows": [{"termId": t["termId"]} for t in r["terms"]]}}},
                 ensure_ascii=False))
PY
)
date +%T; curl -s -X POST http://localhost:8096/oasis/columnMng/save "${M[@]}" -d "$BODY"
for i in $(seq 1 15); do
  printf '%s ' "$(date +%T)"
  curl -s "http://localhost:8092/api/mls/mdmMeta/entries?type=COLUMN&q=$PHYS" "${A[@]}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["total"])'
  sleep 1
done
curl -s -X POST http://localhost:8092/api/mls/mdmMeta/columns "${A[@]}" -d "{\"names\":[\"$PHYS\"]}"
```
Expected: 첫 columns 응답의 `labelMid` 는 원래 값. save 응답 `meta.success:true`. 반복 출력의 `total` 이 저장 시각부터 10초 안에 `1` → `0` 으로 바뀐다(폴러가 지웠다). 마지막 columns 응답의 `labelMid` 가 `…-변경` 이다.

- [ ] **Step 5: 포털 화면에서 재등록을 확인한다(ego-browser)**

```bash
[ -f src/frontend/m-mcm/.env ] || cp src/frontend/m-mcm/.env.example src/frontend/m-mcm/.env
for p in m-analog m-mls m-mpn m-mpp m-mqc m-mdm; do (cd src/frontend/$p && npx tsup); done
(cd src/frontend/m-mcm && nohup pnpm dev > ../../../logs/portal-$T.log 2>&1 &)
```
(포털이 모든 m-* 패키지를 import 하므로 dist 가 없으면 /portal 이 빈 화면이다 — 메모 local-run-mac-setup 2026-10-02. `npx tsup` 단발 빌드는 떠 있는 서버를 내리지 않는다.)

ego-browser 스킬로 `http://localhost:5100` 에 `admin` / `admin123` 으로 로그인 → 시스템관리 > MDM 캐시 관리.
Expected:
- 위 그리드: mcm·mls·mqc 는 `정상`(또는 막 뒤처지면 `최신 아님`), mpp·mpn 은 `연결 안 됨`. 제목에 `MDM 최신 순번 N`.
- mls 행을 누르면 아래 그리드에 Step 4 에서 다시 적재한 컬럼이 보인다.
- 그 행을 체크하고 [재등록] → 확인 대화 문구에 "모든 모듈 … 약 10초" 가 보인다 → 확인 → 토스트 "재등록을 요청했습니다." → 10초 뒤 [조회] 하면 그 행의 `적재 시각` 이 바뀌어 있다.
- [신규] 로 대상 종류 `컬럼`, 키 `NO_SUCH_COL` 을 등록하면 "MDM 에 없음 1건" 안내가 뜨고 아래 그리드에 `값 = 없음` 행이 생긴다.

확인이 끝나면 **보고 전에** 이 단계에서 연 ego-browser 작업 공간을 닫는다.

- [ ] **Step 6: 띄운 서버를 내린다**

```bash
for port in 5100 8100 8093 8092 8096; do lsof -t -nP -iTCP:$port -sTCP:LISTEN | xargs -r kill; done
```
(Step 1 에서 포트가 비어 있었음을 확인했으므로 지금 듣는 프로세스는 모두 이 태스크가 띄운 것이다.)
Expected: 다섯 포트가 비었다.

---

## 최종 검증(컨트롤러)

모든 태스크를 병합한 뒤 한 번 더 돌린다(gradle 은 동시에 둘까지).

```bash
(cd src/backend/cactus-core && ./gradlew test --console=plain)
(cd src/backend/mcm-core && ../gradlew test --console=plain)
(cd src/backend/mdm && ../gradlew :lib:test :api:test --console=plain)
for m in mcm mls mqc mpp mpn; do (cd src/backend/$m && ../gradlew :lib:test :api:test --console=plain -q) || echo "FAIL $m"; done
python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .
python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root . --module mdm
pnpm -C src/frontend --filter @dk-oasis/shared test:unit
pnpm -C src/frontend --filter @dk-oasis/mcm test
python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mcm/page-components/csa/mdmCacheMng
python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/m-mcm/page-components/csa/mdmCacheMng
python3 .claude/skills/adr-write/scripts/adr_tool.py lint docs/mdm/adr/0006-mdm-meta-hybrid-cache-revision.md
```
Expected: 모든 시험 PASS, 컴파일 FAIL 줄 없음, 계약 검사 ERROR 0(두 번), audit 0건(두 번), 린트 ERROR 0. mdm `:api:test` 는 오래 걸린다(1000건 이상) — 백그라운드로 돌리고 끝날 때 알림을 받는다.

---

## 스펙과 다른 점(코드로 확인한 근거) — 이 계획의 처리

| # | 스펙 | 코드 사실(근거) | 이 계획의 처리 |
|---|---|---|---|
| S1 | §3.1 `TB_MDM_META_REV` 칼럼 `REG_DT`·`REG_ID` | 모든 `TB_MDM_*` 는 감사 9칼럼(`C_USR_ID`·`C_AT`…`VER`)을 `CactusAuditEntity` 로 채운다(`docs/mdm/adr/README.md:27` 0001 행 "감사 9칼럼을 `CactusAuditEntity` 로", `A/resources/db/migration/mdm/sqlite/V15__create_mdm_rule_set_test_case.sql:19-27`, `L/entity/MdmDataRecv.java:23`) | 감사 9칼럼을 두고 `C_AT`·`C_USR_ID` 가 기록 시각·사용자를 맡는다(Task 1) |
| S2 | §3.4 서비스 그룹 `dmf`("MDM 메타 제공") | `dmf` 는 결재 그룹 자리로 예약돼 있다(`docs/mdm/adr/0003-module-boundary-screens-roles.md:30`, `L/contract/screen/MdmScreenGroup.java:5` "결재 그룹(dmf)은 보류") | BPMN 은 `services/feed/metaFeed.bpmn`, 자바 패키지 `com.dongkuk.dmes.mdm.feed.metaFeed`. URL 은 폴더와 무관하게 `/oasis/metaFeed/{action}`(`OasisController.java:29-50`) — 스펙 경로와 같다(Task 4) |
| S3 | §3.4 action `changes`·`columns`·`domains`·`rules`·`ruleSets`·`codes`·`layouts`·`force` | mdm BPMN action 은 16개 어휘 안이어야 하고(`AT/MdmOasisActionVocabularyTest.java:34` `ALLOWED_ACTIONS`) mcm PERM_ALL `allActions` 에 없는 action 은 SYSADMIN 도 403 이다(`DataInitializer.java:298-334` 주석, 같은 시험 `:118` 의 `allActions ⊆` 단언) | `search`(= changes), `view`+`params.type`(= 여섯 조회), `save`(= force) 세 action 으로 둔다. 응답 모양은 스펙과 같다(계약 표, Task 4·5) |
| S4 | §3.4 params `physNames[]`·`keys[]` 등 배열 | OASIS params 에 배열을 넣으면 안 된다(oasis-contract-check 6-E-2, `AT/dme/DmeOasisHttpTest.java:38` 주석 "params 배열은 OASIS 가 받지 않는다") | 키 목록은 `grids.keys.rows[{key}]`, 서비스 메서드 인자 이름 `keys`(Task 4·5·6·12) |
| S5 | §3.4 응답 "찾은 컬럼의 메타 목록" | 저장 정의가 깨지면 정의를 만들 수 없다(`L/common/rule/definition/StoredDefinitionLookup.java:42-45` 주석 P-D9 — 손상은 `StoredDefinitionException`) | `{items:[{key,value}], failed:[{key,message}]}`. failed 는 클라이언트가 unavailable 로 다룬다(Ruling R4, Task 5·7) |
| S6 | §3.3 `CodeCateEditService` 의 RELEASED 영향 경로에 기록 | 이 서비스의 쓰기(save·revert)는 모두 `beginDraftWrite` 를 거쳐 DRAFT 가 아니면 거부한다(`L/dmc/codeCateEdit/service/CodeCateEditService.java:235·254`, `L/common/version/DefaultVersionWriteGuard.java:62`) | 기록하지 않는다(카테고리의 RELEASED 반영은 공통 확정이 기록한다, Task 3) |
| S7 | §3.3 `RuleVersionService` 의 RELEASED 영향 경로 | RELEASED 에 닿는 것은 `cancelConfirm` 하나이고 `DefaultVersionStateService` 로 위임한다(`L/dme/ruleMng/service/RuleVersionService.java:162-168`). `newVersion` 은 DRAFT 를 만들고 부모 STATUS 만 올린다(`:115-117` — 캐시 값 `RuleDefinition` 에 STATUS 가 없다) | `DefaultVersionStateService` 에서만 기록한다 — 호출부에도 걸면 이중 기록이다(Task 3) |
| S8 | §3.3 컬럼 "물리명 변경 가능, :308-310" | 변경 전 물리명은 `findById` 직후·setter 앞(`ColumnMngService.java:307-309`)에서만 읽을 수 있고, 컬럼 삭제 경로는 없다(columnMng BPMN 은 search·view·compare·save) | setter 앞에서 읽어 `recorder.column(old, new)`(Task 2) |
| S9 | §4.1 전문 "최신 스냅샷" | 헤더 레이아웃은 자기 버전 스냅샷이 없다 — 헤더 저장은 사용 전문만 `recordAll` 한다(`L/dmb/headerMng/service/HeaderMngService.java:281-284`) | `view LAYOUT` 은 최신 `TB_MDM_LAYOUT_VER` 가 있는 전문만 준다. 헤더 변경은 사용 전문 키로 무효화된다(Ruling R9, Task 2·5) |
| S10 | §5.5 "두 objId(mdmMeta, mdmCacheMng)의 판정을 실측하고 맞춘다" | 3-segment 경로의 PermKey serviceId 는 `""`(`mcm-core/.../PermKey.java:62-66`)이고 UserPermCache 키는 `"oasis"`(`UserPermCache.java:219`)라 권한 데이터로 맞출 수 없다. OBJECT_ID 는 단독 PK 라 모듈 다섯의 키를 한 OBJECT 로 열 수 없다(`SecObj.java:49-50`). mls·mqc·mpp·mpn BE 에는 EndpointPermissionFilter 가 없다(필터는 mcm `SecurityConfig.java:66·92` 만) | `/api/{m}/mdmMeta/` 는 BFF authOnlyPrefixes + mcm-core `AUTH_ONLY` `mdmmeta/`, 관리 action 은 각 모듈 컨트롤러가 `X-Authenticated-Role` 로 SYSADMIN 을 본다(Ruling R10, Task 10·11). `mdmCacheMng` OBJECT 는 메뉴·버튼 권한용이다 |
| S11 | §5.5 "`{module}` 은 `cactus.oasis.service-group` 과 같아야 한다" | mqc·mpp·mpn yml 에는 `cactus:` 블록이 없어 service-group 이 기본값 `app` 이다(`OasisProperties.java:32`) — 그대로면 `/api/mqc/mdmMeta` 가 404 다 | `cactus.mdm.module` 을 더하고(비면 service-group) 다섯 모듈 yml 에 명시한다(Task 6·10·11) |
| S12 | §9 "포털 BFF 의 /api/mdm/oasis/metaFeed/force 경로와 MDM 쪽 SYSADMIN 확인" | BFF 는 권한키 `mdm/metafeed/{action}` 을 사용자 권한 목록에서 찾는다(`shared/src/auth/rbac-policy.ts:96`) — OBJECT·매핑이 없으면 SYSADMIN 도 403 | mcm 시드에 `metaFeed`(SYSTEM_CODE=mdm) OBJECT 와 SYSADMIN PERM_ALL 매핑을 더하고, MDM 은 `MDM027` 로 다시 막는다(Task 5·11) |
| S13 | §7 "화면 — Vitest" | m-mcm 에는 Vitest 설정·스크립트·의존이 없다(`src/frontend/m-mcm/package.json:5-18` scripts 에 `test` 가 없고 `:43-56` devDependencies 에 vitest 가 없다) | m-mls 와 같은 버전으로 `vitest`·`happy-dom` devDependency 와 `test` 스크립트를 더한다(lockfile 변경, Task 12) |
| S14 | §6 버튼 "등록·삭제·재등록" | 표준 골격은 신규(`save`)·삭제(`delete`)·업무 고유 `btn_<동사>` 이고, `objId` 를 주면 action 이 PERM_ALL 에 없는 버튼은 영구 비활성이다(screen-patterns.md §상단 버튼) | 신규(= 등록 팝업, load)·삭제·재등록(`btn_reload`, action `reload` — allActions 에 더함). 라벨 "신규" 는 표준을 따른다(Ruling R11, Task 11·12) |
| S15 | §1.3 D9 "모듈별 빌드 배선이 필요 없다" | cactus-core 는 업무 모듈의 includeBuild 이고(각 `settings.gradle`) 저장소가 mavenCentral 뿐이라(`cactus-core/build.gradle:9-23`) 엔진을 찾을 빌드가 필요하다 | cactus-core·업무 모듈 다섯 settings.gradle 에 엔진 includeBuild 를 둔다 — 실측 결과와 무관하게 명시(Task 0) |
| S16 | §8 ADR 을 `adr-write` 로 발행 | `adr_tool.py` 는 경로를 `docs/{module}/design/adr` 로 고정한다(`adr_tool.py:19`). mdm 은 `docs/mdm/adr/` 에 손으로 채번하고 린트만 쓴다(`docs/mdm/adr/README.md` 「위치·발행 방식 이탈」) | 0006 을 손으로 만들고 `lint` 와 적대적 검토만 돌린다(Task 13) |
| S17 | §3.2 "각 쓰기 메서드 본문에서 직접 호출 — 같은 트랜잭션에 합류" | 기존 서비스 시험 다수가 서비스를 트랜잭션 없이 부른다(`AT/dmb/LayoutTestSupport.java:22`, `DomainMngApiSupport.java:20`) — 네이티브 INSERT 는 트랜잭션이 없으면 실패한다 | 기록기가 `TransactionTemplate`(REQUIRED)로 감싼다 — 호출자 트랜잭션이 있으면 합류(롤백도 같이), 없으면 스스로 연다(Task 1) |
| S18 | (스펙에 없음) 기록 SQL 문 수 | SQL 문 수 가드가 헤더 저장의 전문 수당 문 수를 단언한다(`AT/dmb/headerMng/HeaderMngQueryCountTest.java:117-121`) | 기록은 여러 행 VALUES 한 문장(Ruling R1). 가드의 상한만 1 올린다(Task 2) |
| S19 | §5.4 "같은 오류가 반복되면 30초 건너뛰기" | 반복 횟수 정의가 없다 | 연속 2번(Ruling R6, Task 7) |
| S20 | §7 "MES OASIS 를 건드리면 oasis-contract-check" | 이 검사는 기본 대상에 mdm 이 없다(`.claude/skills/oasis-contract-check/scripts/check_oasis_contract.py:20`) | mdm 은 `--module mdm` 으로 따로 돌린다(Task 4·5, 최종 검증) |
| S21 | §5.2 `MdmMetaClient` 클래스 | 캐시·폴러 시험에 가짜 피드가 필요하다 | 인터페이스 `MdmMetaFeed`(changes·fetch)를 두고 `MdmMetaClient` 가 구현한다(Ruling R5, Task 6) |

## Self-review 메모

- 스펙 대응: §3.1(Task 1) · §3.2(Task 1) · §3.3(Task 2·3, 예외 S6·S7) · §3.4(Task 4·5) · §4(계약 표, Task 4·5·6·10) · §5.1(Task 0·6·10·11) · §5.2(Task 6~10) · §5.3(Task 7·8) · §5.4(Task 7·8) · §5.5(Task 10·11) · §6(Task 11·12) · §7(각 태스크 시험 + Task 14) · §8(Task 1·13).
- 이름 맞춤: `MdmMetaService.MdmLookup`·`MdmMetaCache.Ticket/Entry/EntryView`·`MdmRevisionPoller.Status`·`MetaRevisionRecorder.MetaRevisionRange`·`MetaFeedResult` 는 정의한 태스크와 쓰는 태스크의 글자가 같다. 피드 값 필드 이름은 `MetaFeedPayloads`(mdm) ↔ `MdmColumnMeta`·`MdmDomainMeta`(cactus) 가 같고 Task 9 계약 시험이 묶는다.
- 실측 대기: Task 0 Step 6(중첩 includeBuild 전달), Task 6 Step 5(시간 초과 예외 메시지 모양), Task 9 Step 5(Boot 4 MVC 직렬화 왕복), Task 12 Step 7(`Select`·`Textarea` props 타입).

## 검토 반영 추가 요구 (2026-10-02, 계획 검토자)

### A1 (Task 8 에 포함) 순번 역전 대비 되돌아보기

**문제.** 리비전 규칙은 "순번 순서 = 커밋 순서"를 가정한다. SQLite 는 쓰기가 하나라 맞지만, 운영 DB(Oracle·PostgreSQL)에서는 순번 5 를 받은 트랜잭션이 순번 6 보다 늦게 커밋될 수 있다. 폴러가 6 을 처리해 `appliedSeq=6` 이 된 뒤 5 가 커밋되면, `since=6` 요청에는 5 가 영영 나오지 않아 옛 값이 `max-age`(60분)까지 남는다.

**요구.**
- 설정 `cactus.mdm.revision-lookback`(기본 `100`, 0 이면 끔)을 `MdmClientProperties` 에 더한다(Task 6 의 설정 클래스에 필드 하나 추가 — Task 8 에서 함께 고친다).
- 폴러는 `changes(since = max(0, appliedSeq - lookback), limit)` 로 요청한다.
- 폴러는 `appliedSeq - lookback` 보다 큰 순번 중 이미 처리한 순번 집합을 기억한다. 응답 항목 중 이미 처리한 순번은 건너뛰고, 처음 보는 순번(늦게 커밋된 낮은 순번 포함)만 지움·RELOAD 를 적용한다. 집합은 구간 밖으로 밀려난 순번을 버려 크기를 `lookback` 근처로 유지한다.
- `appliedSeq` 는 지금처럼 받은 최대 순번으로 올린다. 규칙 3(truncated)·4(역행)는 그대로이고, 캐시를 비울 때 처리한 순번 집합도 비운다.
- 규칙 3 의 truncated 판정은 되돌아보기 구간을 포함한 응답 기준이다. `limit`(기본 1000)이 `lookback` 보다 충분히 커야 하므로, 설정 검증에서 `limit <= lookback` 이면 기동 시 예외를 던진다.

**시험(Task 8 에 추가).**
- `늦게_커밋된_낮은_순번은_다음_폴링에서_지운다`: 첫 폴링에 순번 6(키 B)만 오고, 다음 폴링에 순번 5(키 A)·6(키 B)이 오면 A 는 지워지고 B 는 두 번째로 지워지지 않는다(B 를 다시 적재해 둔 뒤 남아 있는지로 확인).
- `되돌아보기_구간_밖_순번은_기억에서_버린다`: lookback=3 에서 순번 1~10 을 처리한 뒤 기억 집합 크기가 3 근처(구간 안 순번만)다.
- `lookback_0_이면_since_는_appliedSeq_그대로다`.

**ADR(Task 13).** ADR-0006 Consequences 의 "순번 순서가 커밋 순서와 같다는 가정" 문장을 "가정하지 않는다 — 폴러가 최근 `lookback` 개 순번을 다시 훑어 늦게 커밋된 기록을 잡는다. 단 lookback 구간보다 더 늦게 커밋된 기록은 `max-age` 안전망이 잡는다"로 바꾼다.
