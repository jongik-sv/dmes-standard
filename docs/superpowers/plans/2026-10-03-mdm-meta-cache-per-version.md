# MDM 메타 캐시 버전별 적재(정의@버전 + 목차 + 코드 색인) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 업무 모듈(cactus) MDM 메타 캐시의 코드·룰·룰 세트·전문 값을 "정의 전 이력 한 키"에서 "목차 키 + 버전 본문 키"로 나누고, 코드 본문에는 MDM 이 미리 계산한 카테고리 소속을 실어 업무 모듈이 해시 색인으로 판정하게 한다.

**Architecture:** 엔진에 코드 버전 고르기(`CodeVersions.select`)·버전 본문 조회(`CodeLookup.codeAt` default)·버전 자르기(`CodeVersionSlicer`)를 공개해 판정 의미를 엔진 한 곳에 둔다. MDM 피드 `metaFeed/view` 에 `part=TOC|BODY`·`at` 을 더하고 `part` 없는 요청은 지금 응답을 바이트 단위로 그대로 준다. cactus 는 `MdmMetaService.lookupAt(type, keys, t)` 로 목차 → 버전 선택 → 본문을 받고, 캐시는 정의 키 아래 묶음(목차 + 본문들)으로 두며 지움 기록·무효화는 정의 키 단위로 한다. 옛 MDM(모르는 `part` 를 무시·거부)과 `versioned-feed: off` 는 같은 소비자 경로를 쓰도록 물러남 변환으로 처리한다.

**Tech Stack:** Java 21, Spring Boot(OASIS BPMN 서비스), JUnit 5·AssertJ·ArchUnit, SQLite(시험), Jackson, Next.js·React·Mantine 9·ag-grid 33(shared `AgDataGrid`), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-03-mdm-meta-cache-per-version-design.md`(사용자 승인, 결정 P1~P13). 현행 스펙 `docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md` 를 함께 읽는다. 스펙 줄 번호는 dev 27451909 기준이다.

## Global Constraints

- 도커 금지. DB 는 SQLite 시험만 쓴다(MDM MSSQL 폐지, ADR-0004).
- `gradlew --stop`·서버 기동/중지 금지. 포트 5100·8092·8096·8100 은 사용자 서버다. Spring 시험은 `RANDOM_PORT` 만 쓴다.
- git 은 `/usr/bin/git` 으로 부른다(rtk 훅이 `git` 을 바꿔 써서 워크트리에서 거절된다). 변수·`$(…)`·heredoc 이 섞인 복합 명령을 피하고 경로는 리터럴로 쓴다.
- 작업 디렉터리는 워크트리 `/Users/jji/project/dmes-standard/.claude/worktrees/mdm-meta-cache-per-version`(브랜치 `feat/mdm-meta-cache-per-version`)다. 메인 체크아웃 `/Users/jji/project/dmes-standard` 은 건드리지 않고, 메인 체크아웃에서 shared·m-* 를 빌드하지 않는다.
- 새 커밋만 만든다(amend·rebase 금지). dev 머지 금지(조정 세션이 한다). 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` 를 붙인다.
- 기존 shared 컴포넌트의 props·동작은 바꾸지 않는다. 필요하면 멈추고 "사용자 승인 필요"로 보고한다.
- gradle 은 늘 `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` 를 앞에 붙인다(시스템 java 17 이면 툴체인 오류).
- 시험 명령(작업마다 이 가운데 해당하는 것을 돌린다):
  - 엔진: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :maru-mdm-engine:test`
  - MDM 피드: `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mdm.feed.*'`
  - MDM 코드 원장 판정: `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mdm.dmc.*'`
  - MDM lib 단위: `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :lib:test --tests '<클래스>'`
  - cactus: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :cactus-core:test --tests 'com.dongkuk.dmes.cactus.mdm.*'`
  - mls(cactus 공개 API 를 쓰는 시험): `cd src/backend/mls && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mls.lsh.noticeMgmt.NoticeMgmtMdmRealValidatorTest'`
  - 화면(워크트리에는 node_modules 가 없다. 처음 한 번 준비한다): `cd src/frontend && pnpm install --frozen-lockfile && pnpm build:libs`. 그 뒤 `cd src/frontend/m-mcm && npx vitest run tests/csa/mdmCacheMng && npx tsc --noEmit -p tsconfig.json`. audit 는 저장소 루트에서 `python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit <바꾼 파일>` 과 `python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit <바꾼 파일>`(둘 다 0건).
- **모든 작업은 끝날 때 위 시험 가운데 그 작업이 건드린 모듈의 시험이 전부 통과해야 한다.** cactus 공개 API 를 쓰는 바깥 시험(`mdm/api` 의 `MdmMetaFeedContractHttpTest`, mls 의 `NoticeMgmtMdmRealValidatorTest`)은 cactus 를 바꾼 작업마다 함께 돌린다. 그래서 cactus 의 기존 생성자·메서드(`MdmMetaService(feed, cache, clock)`·`lookup`·`one`·`cached`·`MdmMetaCache` 의 3·4 인자 생성자·`MdmMetaFeed.fetch`)는 지우거나 의미를 바꾸지 않는다. 새 경로는 새 생성자·새 메서드로 더하고, 마지막 자동 설정 작업(Task 17)에서만 운영 배선을 새 경로로 돌린다.
- 버전 문자열은 어디서나 scale 3 이다. MDM 은 `VersionNumbers.scaled`·`VersionNumbers.plain` 을, cactus 는 `MdmVersions.key`(Task 8) 하나만 쓴다. SQLite 는 1.000 을 INTEGER, 1.001 을 REAL 로 저장한다.
- 패키지·명명은 저장소 규칙(RULE.md)을 따른다. 엔진은 `kr.dongkuk.maru.mdm.engine.*`, MDM 은 `com.dongkuk.dmes.mdm.*`, cactus 는 `com.dongkuk.dmes.cactus.mdm`. cactus mdm 패키지의 빈은 `MdmAutoConfiguration` 에서만 만든다(스테레오타입 어노테이션 금지).

## Review Focus

스펙이 암시하지만 개별 작업의 기본 시험이 다루지 않기 쉬운 입력·조건이다. 가장 물리기 쉬운 것부터 적는다. 각 줄의 시험은 괄호 안 작업에 넣었다.

1. **버전 자리수가 섞인 원장**(SQLite 의 1.000 INTEGER·1.001 REAL·2 처럼 scale 이 다른 BigDecimal): 목차 ver, 본문 요청 키, 본문 응답 ver, cactus 본문 키, `current.ver` 비교가 모두 같은 scale 3 문자열이 되어 같은 버전을 한 키로 찾아야 한다. 어긋나면 조회마다 미스나 `NOT_RELEASED` 가 난다(Task 5·7 HTTP 시험, Task 8 `MdmVersions` 시험, Task 18 실제 HTTP 계약 시험).
2. **예약 버전의 적용 시작 도래**(쓰기 없이 시각만 지남): 다음 조회부터 새 버전이 선택되고, 그 본문은 최종 수명(60분)을, 직전 최종 본문은 옛 수명(10분)을 따라야 한다. 묶음에 기억한 다음 경계 직전·직후에 판정이 바뀌어야 한다(Task 10 캐시 시험, Task 11 서비스 시험).
3. **폴링 지움과 늦게 도착한 본문 적재의 경합**: 지움 전에 Ticket 을 받은 본문 적재는 지운 뒤 도착해도 넣지 않고, 지운 뒤 시작한 적재는 넣어야 한다. 지움 기록은 정의 키 하나로 남는다(Task 10 캐시 시험).
4. **옛 MDM(모르는 `part` 를 무시하거나 거부)과 `versioned-feed: off`**: 옛 MDM 응답에서 cactus 가 직접 목차·본문을 만들어 판정이 같아야 하고, 일시적 거부 한 번이 프로세스 전체를 물러남으로 굳히지 않아야 한다. off 에서는 `part` 를 보내지 않고 CODE 를 호출마다 자르지 않는다(Task 9 클라이언트 시험, Task 11 서비스 시험, Task 16 동치 시험).
5. **`MASTER_AT` 의 base_dt 가 행마다 다른 형식**(8자리, 14자리, 달력에 없는 날짜, 숫자, 빈 값, 칸 이름이 겹치는 행): 해석할 수 있는 값만 그 시각의 본문을 미리 받고, 나머지는 엔진 평가에 맡겨 지금과 같은 결과(평가 오류·검증 불가)를 내야 한다(Task 15 시험).

## 스펙과 다르게 정한 점·실측 항목

- **`codeAt` 본문 행의 cateItems**: 스펙 §5.4 는 `codeAt` 이 `cateItems = []` 인 행을 준다고 적었다. 이 계획은 TABLE 카테고리 소속을 `CodeCateItemRow(cateId, code, effVer, 9999.000)` 한 줄씩 **합성**해 싣는다(Task 3 `CodeVersionSlice.rows`). 그러면 `CodeEffLookup` 이 빈 값을 줘도 `compute(codeAt 행)` 이 미리 계산한 소속과 같아진다. 스펙의 불변식(cactus `CodeEffLookup` 은 본문이 있는 코드에 빈 값을 주지 않는다)은 그대로 지키고, 합성 행은 그 불변식이 깨졌을 때 "조용히 false" 가 되는 것을 막는 이중 안전장치다. 동치 시험이 두 경로(색인 있음·`CodeEffLookup.NONE`)를 모두 고정한다.
- **"최종 버전" 재판정 비용**: 스펙 §5.5 는 조회·쓸기마다 목차로 다시 고른다고 적었다. 이 계획은 묶음에 `currentVer`·`nextBoundary`(다음 applyFrom·applyTo 경계)를 기억하고 `now >= nextBoundary` 일 때만 다시 고른다. 두 선택 규칙 모두 결과가 경계에서만 바뀌므로 판정은 같고, 10초 쓸기의 비용이 항목 수 × 버전 수가 되지 않는다.
- **목차 ver 직렬화**: 목차의 versions[].ver 는 네 대상 모두 JSON number(scale 3, 예 `1.000`)로 싣는다. 전문 본문의 `ver` 는 지금 전문 값과 같이 문자열 `"1.000"` 이다. `current.ver`·BODY 응답 `ver`·BODY 요청 키 `ver` 는 문자열 `"1.000"` 이다.
- **`@` 를 포함한 정의 ID**: 코드·룰·룰 세트 ID 는 등록 검증(`NamingRules.STD_PHYS_NAME` = `^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$`, `CodeMngService`·`RuleIdRules`·`RuleSetIdRules`)으로 `@` 가 막혀 있다. 다만 `MaruIdRules.FORBIDDEN_CHAR_PATTERN` 은 `[.,\s]` 만 막으므로 다른 경로로 들어올 가능성을 닫지 않는다. cactus 는 논리 키를 "마지막 `@` + scale 3 숫자"(`^(.+)@(\d{1,4}\.\d{3})$`)로만 풀어 ID 에 `@` 가 있어도 깨지지 않게 한다(Task 8). 화면도 같은 규칙을 쓴다(Task 19).
- **옛 MDM 의 모르는 params 처리**: 스펙 §4.1 이 확인하지 못했다고 적었다. Task 1 에서 앞으로도 생기지 않을 칸(`zzUnknownParam`)으로 지금 MDM 을 실측해 결과를 시험으로 고정한다. 결과와 상관없이 cactus 는 무시 신호(가)·거부 신호(나)를 모두 처리한다(Task 9).
- **코드 → 행 색인(스펙 §5.3 표 첫 줄)**: 두지 않는다. 엔진 해석기가 attr·codeList 에서 `codeAt` 행을 훑으므로 쓰는 곳이 없다(ns 급 확장은 범위 밖, 결정 P7). 카테고리 → 소속 집합 색인과 items 코드 집합(공유)만 둔다.
- **cactus 공개 API 전환 순서**: `MdmMetaService` 의 3인자 생성자는 지금 경로(`versioned-feed: off` 와 같다)로 남긴다. 새 경로는 4인자 생성자(`versioned=true`)로만 켜지고, 운영 배선(자동 설정)은 모든 소비자를 바꾼 뒤 Task 17 에서 전환한다. 그래서 중간 작업마다 mls·MDM 의 cactus 사용 시험이 그대로 통과한다.
- **룰 세트 버전 하나 생성 메서드(스펙 §4.2 미결)**: 1차는 `StoredDefinitionLookup.releasedSets(id)` 에서 ver 로 고른다. 새 메서드는 더하지 않는다.
- **상태 응답 `bodyCounts` 의 화면 표시(스펙 §7.1 미결)**: API 에만 더하고, 화면은 상단 그리드 "항목 수" 열 머리 툴팁에 "목차 + 본문 합계"를 적는다. 본문 수 열은 두지 않는다.
- **`versioned-feed` 반영 시점(스펙 §8 미결)**: 1차는 재기동해 반영한다.

## 파일 구조

| 구분 | 파일 | 책임 |
|---|---|---|
| 엔진 새 파일 | `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/code/CodeVersions.java` | 코드 버전 고르기(공개) |
| 엔진 새 파일 | `…/engine/code/CodeVersionSlice.java` | 코드 버전 본문 값(§3.3 JSON 모양)과 `rows`·`membersOf` |
| 엔진 새 파일 | `…/engine/code/CodeVersionSlicer.java` | 투영된 전 이력 → 버전 본문 |
| 엔진 새 파일 | `…/engine/expr/MasterBaseDt.java` | `MASTER_AT` base_dt 문자열 해석(공개) |
| 엔진 수정 | `…/engine/spi/CodeLookup.java`, `…/engine/code/DefaultCodeResolver.java`, `…/engine/expr/MasterQuery.java` | `codeAt` default, 해석기 연결, base_dt 위임 |
| 엔진 시험 | `…/test/…/engine/code/CodeVersionsTest.java`, `DefaultCodeResolverCodeAtTest.java`, `CodeVersionSlicerTest.java`, `CodeVersionSliceGeneratedTest.java`, `testsupport/CodeHistoryGenerator.java`, `testsupport/SlicedCodeLookups.java`, `expr/MasterBaseDtTest.java`, `arch/ContractTypeShapeTest.java`(허용 목록) | |
| MDM 새 파일 | `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/feed/metaFeed/service/MetaFeedPart.java` | `part` 해석 |
| MDM 새 파일 | `…/service/MetaFeedVersioned.java` | 목차·본문 생성(네 대상) |
| MDM 새 파일 | `…/service/MetaFeedVersionedResult.java` | TOC·BODY 응답 봉투 |
| MDM 새 파일 | `…/service/MetaFeedVersionSelect.java` | MDM 쪽 `current` 버전 고르기 |
| MDM 수정 | `…/dto/MetaFeedViewRequest.java`, `…/service/MetaFeedService.java`, `…/service/MetaFeedDefinitions.java` | 칸 추가, 분기, 조립 코드 재사용 |
| MDM 시험 | `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/feed/MetaFeedLegacyGoldenTest.java`, `MetaFeedVersionedHttpTest.java`, `MetaFeedOasisHttpTest.java`(모르는 params), `MdmMetaFeedContractHttpTest.java`(새 경로), 골든 파일 `src/backend/mdm/api/src/test/resources/feed/golden/view-*.json` | |
| cactus 새 파일 | `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmVersions.java` | ver 정규화·논리 키 |
| cactus 새 파일 | `MdmToc.java`, `MdmTocVersion.java`, `MdmVersionSelector.java`, `MdmCodeVersion.java`, `MdmBodyKey.java`, `MdmTocResult.java`, `MdmBodyResult.java`, `MdmLegacyValues.java` | 값 타입·선택·색인·물러남 변환 |
| cactus 수정 | `MdmMetaFeed.java`, `MdmMetaClient.java`, `MdmMetaCache.java`, `MdmMetaService.java`, `MdmRevisionPoller.java`, `MdmDefinitionLookup.java`, `MdmCachedDefinitions.java`, `MdmValidator.java`, `MdmExprRefs.java`, `MdmMetaController.java`, `MdmClientProperties.java`, `MdmAutoConfiguration.java` | |
| cactus 시험 | 새 파일: `MdmVersionsTest`, `MdmVersionSelectorTest`, `MdmCodeVersionTest`, `MdmMetaClientVersionedTest`, `MdmMetaCacheVersionedTest`, `MdmMetaServiceVersionedTest`, `MdmDefinitionLookupVersionedTest`, `MdmCachedDefinitionsTest`, `MdmValidatorVersionedTest`, `MdmValidatorMasterAtTest`, `MdmVersionedEquivalenceTest`. 고치는 파일: `FakeMetaFeed`(새 MDM 흉내), `MdmRevisionPollerTest`, `MdmMetaControllerTest`, `MdmAutoConfigurationTest` | |
| 화면 수정 | `src/frontend/m-mcm/page-components/csa/mdmCacheMng/{types.ts,api.ts,utils.ts,page.tsx}`, 시험 `src/frontend/m-mcm/tests/csa/mdmCacheMng/{api.test.ts,utils.test.ts}` | 구분 열·논리 키 |
| 문서 | `docs/mdm/decisions.md`(D-154), `docs/mdm/adr/0007-mdm-meta-hybrid-cache-revision.md`(개정 절), `docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md`(링크), `docs/guide/BackEnd/Backend-Implementation-Guide.md` §11 | |

## 작업 사이 인터페이스 요약

뒤 작업의 구현자는 자기 작업만 본다. 이름과 타입은 아래가 정본이다.

**엔진** (`kr.dongkuk.maru.mdm.engine`)
- `code.CodeVersions.select(List<CodeVersionRow> versions, LocalDateTime at) : Optional<BigDecimal>` — RELEASED 만 본다. covering(여럿이면 applyFrom 최소) → 없으면 ver 최소 RELEASED.
- `spi.CodeLookup.codeAt(String maruCodeId, BigDecimal ver) : Optional<CodeRows>` — default 는 `code(maruCodeId)`.
- `code.CodeVersionSlice(String maruCodeId, BigDecimal ver, List<CodeItemRow> items, List<CodeVersionSlice.SlicedCategory> categories)`
  - `SlicedCategory(String cateId, BigDecimal fromVer, BigDecimal toVer, String defKind, String defExpr, String defTarget, boolean all, List<String> members)` — `all` 이면 `members == null`.
  - `CodeRows rows(CodeHeader header, CodeVersionRow version)` — `(header, [version], items, 고른 정의들, 합성 cateItems)`.
  - `Set<String> membersOf(String cateId)` — cateId 는 호출자가 BASE 정규화한 값. 본문에 없으면 빈 집합, `all` 이면 items 코드 집합.
- `code.CodeVersionSlicer.slice(CodeRows projected, BigDecimal ver) : CodeVersionSlice` — `projected` 는 `CodeRowsProjection.releasedOnly` 결과, `ver` 는 그 안의 RELEASED 버전(아니면 `IllegalArgumentException`).
- `expr.MasterBaseDt.parse(String text) : Optional<LocalDateTime>` — 8자리 → 그날 00:00, 14자리 → 그 시각, 그 밖·달력에 없음 → 빈 값.

**MDM 피드 계약** (`metaFeed/view`)
- 요청 params: `type`, 선택 `part`(`TOC`|`BODY`, 대소문자 무시), 선택 `at`(`yyyy-MM-dd'T'HH:mm:ss`, KST). BODY 키 행은 `{key, ver}`(ver 문자열 `"1.000"`).
- TOC 응답 `data.result`: `{part:"TOC", items:[{key, value:{header, versions:[{ver(number), status, applyFrom, applyTo}]}, current:{ver:"1.000", value} | null}], failed:[{key, message}]}`.
- BODY 응답 `data.result`: `{part:"BODY", items:[{key, ver:"1.000", value}], failed:[{key, ver, message}]}`. 메시지 상수 `NOT_RELEASED`·`INVALID_VER`.
- 묶음 전체 거부(`meta.success=false`)는 type 오류·`part`·`at` 형식 오류·키 500개 초과뿐이다. 키 하나의 잘못은 그 키의 `failed` 다.

**cactus** (`com.dongkuk.dmes.cactus.mdm`)
- `MdmVersions.key(BigDecimal) : String`(scale 3 plain, 소수 넷째 자리 이상이면 `IllegalArgumentException`), `MdmVersions.parse(String logical) : MdmVersions.LogicalKey`, `record LogicalKey(String key, String ver)`(ver null = 정의 키), `MdmVersions.logical(String key, String ver) : String`, `MdmVersions.isVersioned(MdmTargetType) : boolean`(RULE·RULE_SET·CODE·LAYOUT).
- `record MdmTocVersion(BigDecimal ver, String status, LocalDateTime applyFrom, LocalDateTime applyTo)`.
- `final class MdmToc(CodeHeader header, List<MdmTocVersion> versions)` — 접근자 `header()`·`versions()`, 만들 때 한 번 계산하는 `CodeRows codeRows()`, `Optional<MdmTocVersion> version(String verKey)`. JSON 은 `{header, versions}`.
- `MdmVersionSelector.select(MdmTargetType, MdmToc, LocalDateTime t) : Optional<String>`(ver 키), `MdmVersionSelector.nextBoundary(MdmToc, LocalDateTime t) : LocalDateTime`(없으면 `LocalDateTime.MAX`).
- `MdmCodeVersion` — `static sliced(CodeVersionSlice, CodeHeader, MdmTocVersion)`, `static full(CodeRows)`, `CodeRows rows()`, `Optional<Set<String>> members(String cateId)`(full → 빈 값), `boolean isSliced()`, `@JsonValue Object json()`.
- `record MdmBodyKey(String key, String ver)`.
- `record MdmCurrent(String ver, Object body)`.
- `record MdmTocResult(Map<String, MdmToc> tocs, Map<String, MdmCurrent> current, Map<String, Object> legacy, Map<String, String> failed)` — `static MdmTocResult legacy(MdmFetchResult)`.
- `record MdmBodyResult(Map<MdmBodyKey, Object> found, Map<MdmBodyKey, String> failed, Map<String, Object> legacy, Map<String, String> legacyFailed, Set<String> legacyAsked)` — `static MdmBodyResult legacy(MdmFetchResult r, Set<String> asked)`. `legacyAsked` 안에 있는데 `legacy`·`legacyFailed` 에 없으면 MDM 에 없는 정의다.
- `MdmMetaFeed` 의 default 메서드 `fetchToc(MdmTargetType, Collection<String>, LocalDateTime at) : MdmTocResult`, `fetchBodies(MdmTargetType, Collection<MdmBodyKey>) : MdmBodyResult`.
- `MdmLegacyValues.toc(MdmTargetType, Object full) : MdmToc`, `MdmLegacyValues.rawBody(MdmTargetType, Object full, String ver) : Optional<Object>`(CODE 는 `CodeVersionSlice`, 나머지는 목록 원소), `MdmLegacyValues.body(MdmTargetType, Object full, String ver) : Optional<Object>`(CODE 는 `MdmCodeVersion.sliced`).
- `MdmMetaCache.Part { VALUE, TOC, BODY }`, 5인자 생성자 `(int maxEntries, Duration maxAge, Duration maxIdle, Duration oldVersionMaxIdle, Clock clock)`, `putTocs`, `getBody`, `putBodies`, `evictLocalBody`, `bodySizes`, `oldVersionMaxIdle`, `EntryView` 끝에 `Part part, String ver, Boolean current`.
- `MdmMetaService` 4인자 생성자 `(MdmMetaFeed, MdmMetaCache, Clock, boolean versioned)`, `record MdmAt(MdmToc toc, String ver, Object body)`, `record MdmAtLookup(Map<String, MdmAt> found, List<String> missing, List<String> unavailable)`, `record CachedRead(boolean cached, Object value)`, `lookupAt`, `oneAt`, `toc`, `body`, `cachedToc`, `cachedBody`, `reloadAt`, `versioned()`, `now()`.
- `MdmClientProperties.oldVersionMaxIdle`(기본 10m), `MdmClientProperties.versionedFeed`(`AUTO` 기본 | `OFF`).

---

### Task 1: 실측 — 지금 MDM 의 모르는 params 처리와 `part` 없는 응답 골든 고정

스펙 §4.1 이 "확인하지 못했다"고 남긴 옛 MDM 의 모르는 params 처리를 지금 MDM 으로 실측해 시험으로 고정한다. 또 MDM 피드를 바꾸기 **전에** 여섯 type 의 `part` 없는 응답을 골든 파일로 떠 둔다. 뒤 작업(5~7)은 이 파일과 비교해 "지금 응답과 바이트 단위로 같다"(스펙 §6.2 MDM 피드)를 증명한다. 이 작업은 제품 코드를 바꾸지 않는다.

**Files:**
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/feed/MetaFeedOasisHttpTest.java`(시험 하나 추가)
- Create: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/feed/MetaFeedLegacyGoldenTest.java`
- Create(시험이 만든다): `src/backend/mdm/api/src/test/resources/feed/golden/view-COLUMN.json`, `view-DOMAIN.json`, `view-RULE.json`, `view-RULE_SET.json`, `view-CODE.json`, `view-LAYOUT.json`

**Interfaces:**
- Consumes: 없음(지금 코드).
- Produces: 골든 파일 여섯 개와 `MetaFeedLegacyGoldenTest`(Task 5·6·7 이 늘 함께 돌린다). 실측 결과 "무시" 또는 "거부"(Task 9 의 클라이언트 시험 문구와 D-154 에 적는다).

- [ ] **Step 1: 모르는 params 실측 시험을 쓴다**

`MetaFeedOasisHttpTest` 의 `view_는_키가_없으면_빈_결과다` 아래에 넣는다. 가설은 "무시한다"이다.

```java
    /**
     * D-154 실측(스펙 2026-10-03-mdm-meta-cache-per-version §4.1) — DTO({@code MetaFeedViewRequest})에 없는 params 칸을 만나면 이 MDM 은
     * 그 칸을 무시하고 지금 응답을 그대로 준다. 옛 MDM 이 새 cactus 의 {@code part}·{@code at} 을 만났을 때와 같은 상황이다. 칸 이름은 앞으로도
     * DTO 에 생기지 않을 {@code zzUnknownParam} 이다({@code part} 로 재면 칸을 더한 뒤 실측이 아니게 된다).
     */
    @Test
    void view_는_DTO_에_없는_params_칸을_무시하고_지금_응답을_준다() throws Exception {
        MasterCodeSeeds seeds = new MasterCodeSeeds(jdbc);
        seeds.seedCode("PROBE_CD", "INUSE", "MDM");
        seeds.released("PROBE_CD", "1.000", "2026-01-01 00:00:00", MasterCodeSeeds.OPEN_END);
        seeds.seedItem("PROBE_CD", "A", "1.000", MasterCodeSeeds.OPEN, "에이", 1);
        seeds.seedBase("PROBE_CD");

        JsonNode plain = view("CODE", "PROBE_CD");
        JsonNode probed = result(post("view", "SYSTEM",
                body(json.createObjectNode().put("type", "CODE").put("zzUnknownParam", "TOC").put("zzUnknownAt", "2026-10-03T00:00:00"),
                        "PROBE_CD")));

        assertEquals(plain, probed, "모르는 칸이 있어도 응답이 같다");
        assertTrue(probed.path("part").isMissingNode(), "모르는 칸을 되울리지 않는다: " + probed);
    }
```

- [ ] **Step 2: 실측한다**

Run: `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mdm.feed.MetaFeedOasisHttpTest'`

- PASS 면 결과는 **무시**다. 다음 단계로 간다.
- 실패하고 응답이 `meta.success=false` 였다면 결과는 **거부**다. 시험을 아래로 바꿔 거부를 고정한다(이름·주석의 "무시"를 "거부"로 고친다).

```java
    @Test
    void view_는_DTO_에_없는_params_칸이_있으면_요청을_거부한다() throws Exception {
        JsonNode r = post("view", "SYSTEM",
                body(json.createObjectNode().put("type", "CODE").put("zzUnknownParam", "TOC"), "PROBE_CD"));
        assertFalse(r.path("meta").path("success").asBoolean(true), r.toString());
    }
```

어느 쪽이든 결과를 이 작업 커밋 메시지 본문 첫 줄에 `실측: 모르는 params = 무시` 또는 `실측: 모르는 params = 거부` 로 적는다.

- [ ] **Step 3: 골든 시험을 쓴다**

`MetaFeedLegacyGoldenTest` 는 자기 DB 파일을 쓰는 별도 클래스이고 시험 메서드는 하나다. 그래야 자동 증가 ID 가 실행마다 같다. 도메인 ID 는 명시한다.

```java
package com.dongkuk.dmes.mdm.feed;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.cfg.JsonNodeFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
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
 * D-154 — {@code part} 없는 {@code metaFeed/view} 응답의 골든 고정(스펙 2026-10-03-mdm-meta-cache-per-version §6.2 「MDM 피드」, §8 "새 MDM + 옛
 * cactus 는 안 깨진다"). 피드를 바꾸기 전에 떠 둔 파일과 {@code data.result} 를 글자 그대로 비교한다. 파일이 없으면 지금 응답으로 만들고 실패한다 —
 * 만든 파일을 눈으로 확인한 뒤 다시 돌린다. 자동 증가 ID 가 실행마다 같도록 DB 파일을 따로 쓰고 시험 메서드는 하나만 둔다.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + MetaFeedLegacyGoldenTest.TEST_CLIENT_KEY)
@ActiveProfiles("local")
class MetaFeedLegacyGoldenTest {

    static final String TEST_CLIENT_KEY = "mdm-feed-golden-test-key";
    private static final Path GOLDEN = Path.of("src/test/resources/feed/golden");

    @TempDir
    static Path tempDir;

    @LocalServerPort
    int port;

    @Autowired
    DataSource dataSource;

    private final HttpClient client = HttpClient.newHttpClient();
    private final ObjectMapper json = JsonMapper.builder()
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .disable(JsonNodeFeature.STRIP_TRAILING_BIGDECIMAL_ZEROES)
            .build();

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-feed-golden-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @Test
    void part_없는_view_응답은_골든_파일과_글자_그대로_같다() throws Exception {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        MetaRevTestSupport.clear(jdbc);
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        new MasterCodeSeeds(jdbc).clear();
        seed(jdbc);

        Map<String, List<String>> keys = new LinkedHashMap<>();
        keys.put("COLUMN", List.of("GOLD_THK", "NO_COL"));
        keys.put("DOMAIN", List.of("99001", "99999"));
        keys.put("RULE", List.of("QLTY_GRD_JDG", "NO_RULE"));
        keys.put("RULE_SET", List.of("GOLD_SET", "NO_SET"));
        keys.put("CODE", List.of("GOLD_CD", "NO_CD"));
        keys.put("LAYOUT", List.of("9801", "9804", "abc"));
        boolean created = false;
        for (Map.Entry<String, List<String>> e : keys.entrySet()) {
            String actual = json.writerWithDefaultPrettyPrinter().writeValueAsString(view(e.getKey(), e.getValue()));
            Path file = GOLDEN.resolve("view-" + e.getKey() + ".json");
            if (!Files.exists(file)) {
                Files.createDirectories(GOLDEN);
                Files.writeString(file, actual + "\n", StandardCharsets.UTF_8);
                created = true;
                continue;
            }
            assertEquals(Files.readString(file, StandardCharsets.UTF_8).stripTrailing(), actual, "골든과 다르다: " + file);
        }
        if (created) {
            fail("골든 파일을 새로 만들었다 — 내용을 확인하고 다시 돌린다: " + GOLDEN.toAbsolutePath());
        }
    }

    private static void seed(JdbcTemplate jdbc) {
        // 컬럼·도메인 — 도메인 ID 를 명시한다(자동 증가 값이 응답에 실린다)
        jdbc.update("INSERT INTO TB_MDM_DOMAIN (DOMAIN_ID, DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, SCALE, STD_RULE, VER) "
                + "VALUES (99001, '골든 두께', 'GOLD_THK_D', 'QTY', 'NUMBER', 2, 'value >= 0', 0)");
        DmeTestSupport.column(jdbc, "GOLD_THK", 99001L);
        // 룰 — 1.000(SQLite INTEGER)·1.001(REAL) 두 저장 형태
        DmeTestSupport.sampleRule(jdbc);
        jdbc.update("UPDATE TB_MDM_RULE_VER SET APPLY_TO = '2026-07-01 00:00:00' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 1");
        DmeTestSupport.released(jdbc, "QLTY_GRD_JDG", new BigDecimal("1.001"), "MINOR", "FIRST", "2026-07-01 00:00:00", null);
        DmeTestSupport.sampleDefinition(jdbc, "QLTY_GRD_JDG", new BigDecimal("1.001"));
        // 룰 세트
        DmeTestSupport.ruleSet(jdbc, "GOLD_SET", "골든 세트", "[\"QLTY_GRD_JDG\"]", "CREATED", 0);
        // 코드 — RELEASED 1.000·1.001, DRAFT 1.002(투영이 덜어 낸다), BASE + TABLE
        MasterCodeSeeds seeds = new MasterCodeSeeds(jdbc);
        seeds.seedCode("GOLD_CD", "INUSE", "MDM");
        seeds.released("GOLD_CD", "1.000", "2026-01-01 00:00:00", "2026-07-01 00:00:00");
        seeds.released("GOLD_CD", "1.001", "2026-07-01 00:00:00", MasterCodeSeeds.OPEN_END);
        seeds.draft("GOLD_CD", "1.002", "kim");
        seeds.seedItem("GOLD_CD", "A", "1.000", MasterCodeSeeds.OPEN, "에이", 1, null, null, null, null, null, "X");
        seeds.seedItem("GOLD_CD", "B", "1.001", MasterCodeSeeds.OPEN, "비", 2);
        seeds.seedItem("GOLD_CD", "C", "1.002", MasterCodeSeeds.OPEN, "씨(초안)", 3);
        seeds.seedBase("GOLD_CD");
        seeds.seedCate("GOLD_CD", "TB", "1.001", MasterCodeSeeds.OPEN, "TABLE", null, null, "표");
        seeds.seedCateItem("GOLD_CD", "TB", "B", "1.001", MasterCodeSeeds.OPEN);
        // 전문 — 헤더 9890 두 버전, 전문 9801(헤더 쌓음, 두 버전), 9804(헤더 없음)
        jdbc.update("INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, STATUS, VER) VALUES "
                + "(9890, 'HEADER', '골든 헤더', 'INUSE', 0), (9801, 'MESSAGE', '골든 전문', 'INUSE', 0), "
                + "(9804, 'MESSAGE', '헤더 없는 골든 전문', 'INUSE', 0)");
        layoutVer(jdbc, 9890, "1.000", "2000-01-01 00:00:00", "2026-04-01 00:00:00", 7);
        layoutVer(jdbc, 9890, "2.000", "2026-04-01 00:00:00", "9999-12-31 00:00:00", 9);
        layoutVer(jdbc, 9801, "1.000", "2000-01-01 00:00:00", "2026-07-01 00:00:00", 10);
        layoutVer(jdbc, 9801, "2.000", "2026-07-01 00:00:00", "9999-12-31 00:00:00", 12);
        layoutVer(jdbc, 9804, "1.000", "2000-01-01 00:00:00", "9999-12-31 00:00:00", 5);
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_HEADER (LAYOUT_ID, VER, SEQ, HEADER_LAYOUT_ID) VALUES (9801, 1, 1, 9890)");
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_HEADER (LAYOUT_ID, VER, SEQ, HEADER_LAYOUT_ID) VALUES (9801, 2, 1, 9890)");
    }

    private static void layoutVer(JdbcTemplate jdbc, long id, String ver, String from, String to, int own) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, OWN_LENGTH) "
                + "VALUES (?, ?, 'MAJOR', 'RELEASED', NULL, ?, ?, ?)", id, new BigDecimal(ver), from, to, own);
    }

    private JsonNode view(String type, List<String> keys) throws Exception {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", "metaFeed");
        body.putObject("params").put("type", type);
        ArrayNode rows = body.putObject("grids").putObject("keys").putArray("rows");
        keys.forEach(k -> rows.addObject().put("key", k));
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/oasis/metaFeed/view"))
                .header("Content-Type", "application/json")
                .header("X-Client-Key", effectiveClientKey())
                .header("X-Authenticated-User", "system:mls")
                .header("X-Authenticated-Role", "SYSTEM")
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)))
                .build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode(), response.body());
        JsonNode root = json.readTree(response.body());
        assertTrue(root.path("meta").path("success").asBoolean(false), root.toString());
        return root.path("data").path("result");
    }

    static String effectiveClientKey() {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        return (env != null && !env.isBlank()) ? env : TEST_CLIENT_KEY;
    }
}
```

`TB_MDM_DOMAIN`·`TB_MDM_LAYOUT_*` 의 칸 이름이 시드와 다르면(NOT NULL 칸 누락 등) `DmeTestSupport.domain` 과 `MetaFeedOasisHttpTest#layoutVer`·`#stack` 의 INSERT 를 기준으로 맞춘다. 그 두 곳이 정본이다.

- [ ] **Step 4: 골든 파일을 만든다**

Run: `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mdm.feed.MetaFeedLegacyGoldenTest'`
Expected: FAIL "골든 파일을 새로 만들었다". 여섯 파일을 열어 확인한다. CODE 파일에 DRAFT 1.002 와 C 행이 없어야 하고, RULE 파일에 버전 둘이 있어야 하고, LAYOUT 파일에 `abc` 가 없어야 한다.

- [ ] **Step 5: 결정적인지 두 번 돌려 확인한다**

`cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:cleanTest :api:test --tests 'com.dongkuk.dmes.mdm.feed.MetaFeedLegacyGoldenTest'` 를 두 번 돌린다(`cleanTest` 가 없으면 Gradle 이 UP-TO-DATE 로 건너뛰어 아무것도 확인하지 않는다).
Expected: 두 번 모두 PASS. 한 번이라도 실패하면 다른 값(자동 증가 ID·시각)을 찾아 시드에서 명시하고 Step 4 부터 다시 한다.

- [ ] **Step 6: 피드 시험 전체를 돌린다**

Run: `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mdm.feed.*'`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
/usr/bin/git add src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/feed/MetaFeedOasisHttpTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/feed/MetaFeedLegacyGoldenTest.java src/backend/mdm/api/src/test/resources/feed/golden
/usr/bin/git commit -m "test(mdm): 모르는 params 처리를 실측하고 part 없는 metaFeed/view 응답을 골든으로 고정한다" -m "실측: 모르는 params = 무시(또는 거부 — Step 2 결과로 고친다)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 엔진 — 코드 버전 고르기 공개와 `CodeLookup.codeAt` default

스펙 §3.2(코드 선택 함수를 엔진 공개 함수로)·§5.4(결정 P7, `codeAt` default·해석기가 items·카테고리를 `codeAt` 으로 읽음·`effectiveCodes` 도 `codeEff` 먼저). 기본 구현이 전체 행이므로 원장·옛 구현의 동작은 바뀌지 않는다.

**Files:**
- Create: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/code/CodeVersions.java`
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/spi/CodeLookup.java:16-19`
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/code/DefaultCodeResolver.java:46-150`
- Modify: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/arch/ContractTypeShapeTest.java:90-92`
- Create: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/code/CodeVersionsTest.java`
- Create: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/code/DefaultCodeResolverCodeAtTest.java`

**Interfaces:**
- Consumes: 없음.
- Produces: `CodeVersions.select(List<CodeVersionRow>, LocalDateTime) : Optional<BigDecimal>`, `CodeLookup.codeAt(String, BigDecimal) : Optional<CodeRows>`(default = `code(id)`), `DefaultCodeResolver.validItems(CodeRows, BigDecimal)` 를 package-private static 으로 연다(Task 3 이 쓴다).

- [ ] **Step 1: 실패하는 시험을 쓴다 — 버전 고르기**

```java
package kr.dongkuk.maru.mdm.engine.code;

import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.OPEN_DT;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.dt;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.ver;
import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;
import org.junit.jupiter.api.Test;

/** D-154 — 코드 버전 고르기를 엔진 공개 함수로 꺼냈다(스펙 §3.2). 해석기·MDM 목차·업무 모듈 캐시가 같은 함수를 쓴다. */
class CodeVersionsTest {

    private static final List<CodeVersionRow> V = List.of(
            new CodeVersionRow(ver("1.000"), "RELEASED", dt("2026-01-01T00:00"), dt("2026-04-01T00:00")),
            new CodeVersionRow(ver("1.001"), "CANCELLED", null, null),
            // 빈틈 [2026-04-01, 2026-05-01)
            new CodeVersionRow(ver("2.000"), "RELEASED", dt("2026-05-01T00:00"), dt("2026-08-01T00:00")),
            new CodeVersionRow(ver("3.000"), "DRAFT", null, null));

    @Test
    void 덮는_RELEASED_를_고르고_경계는_시작_포함_끝_제외다() {
        assertEquals(Optional.of(ver("1.000")), CodeVersions.select(V, dt("2026-01-01T00:00")));
        assertEquals(Optional.of(ver("1.000")), CodeVersions.select(V, dt("2026-03-31T23:59:59")));
        assertEquals(Optional.of(ver("2.000")), CodeVersions.select(V, dt("2026-05-01T00:00")));
    }

    @Test
    void 첫_버전_앞_빈틈_닫힌_끝_뒤는_가장_작은_RELEASED_로_소급한다() {
        assertEquals(Optional.of(ver("1.000")), CodeVersions.select(V, dt("2025-06-01T00:00")));
        assertEquals(Optional.of(ver("1.000")), CodeVersions.select(V, dt("2026-04-15T00:00")));
        assertEquals(Optional.of(ver("1.000")), CodeVersions.select(V, dt("2026-09-01T00:00")));
    }

    @Test
    void 겹치면_적용_시작이_가장_이른_것이고_RELEASED_가_없으면_빈_값이다() {
        List<CodeVersionRow> overlap = List.of(
                new CodeVersionRow(ver("1.000"), "RELEASED", dt("2026-01-01T00:00"), OPEN_DT),
                new CodeVersionRow(ver("2.000"), "RELEASED", dt("2026-02-01T00:00"), OPEN_DT));
        assertEquals(Optional.of(ver("1.000")), CodeVersions.select(overlap, dt("2026-03-01T00:00")));
        assertEquals(Optional.<BigDecimal>empty(),
                CodeVersions.select(List.of(new CodeVersionRow(ver("1.000"), "DRAFT", null, null)), dt("2026-03-01T00:00")));
    }
}
```

- [ ] **Step 2: 실패하는 시험을 쓴다 — 해석기의 `codeAt` 사용**

```java
package kr.dongkuk.maru.mdm.engine.code;

import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.PROC_CD;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.V1_000;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.V1_001;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.dt;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures;
import kr.dongkuk.maru.mdm.engine.testsupport.InMemoryLookups;
import org.junit.jupiter.api.Test;

/** D-154(결정 P7) — 해석기는 버전 선택·DEPRECATED 에만 {@code code(id)} 를, items·카테고리 계산에는 {@code codeAt(id, ver)} 를 쓴다. */
class DefaultCodeResolverCodeAtTest {

    /** {@code code(id)} 는 목차(헤더·버전)만, {@code codeAt(id, ver)} 는 전체 행을 준다 — 해석기가 items 를 {@code code(id)} 에서 읽으면 판정이 틀린다. */
    private static final class TocAndAt implements CodeLookup {
        final CodeRows full;
        final List<BigDecimal> atCalls = new ArrayList<>();

        TocAndAt(CodeRows full) {
            this.full = full;
        }

        @Override
        public Optional<CodeRows> code(String id) {
            return Optional.of(new CodeRows(full.header(), full.versions(), List.of(), List.of(), List.of()));
        }

        @Override
        public Optional<CodeRows> codeAt(String id, BigDecimal ver) {
            atCalls.add(ver);
            return Optional.of(full);
        }
    }

    @Test
    void 해석기는_items_와_카테고리를_codeAt_으로_읽고_고른_버전을_넘긴다() {
        CodeRows full = CodeFixtures.procCd();
        TocAndAt split = new TocAndAt(full);
        DefaultCodeResolver viaAt = new DefaultCodeResolver(split, CodeEffLookup.NONE);
        DefaultCodeResolver reference = new DefaultCodeResolver(InMemoryLookups.codeLookup(full), CodeEffLookup.NONE);
        List<LocalDateTime> times = List.of(dt("2024-01-01T00:00"), dt("2026-08-01T00:00"), dt("2026-10-01T00:00"));
        List<String> cates = Arrays.asList(null, "BASE", "COATING", "NONE");
        List<String> codes = Arrays.asList("81", "82", "83", "84", "99", null);
        for (LocalDateTime t : times) {
            assertEquals(reference.selectVersion(PROC_CD, t), viaAt.selectVersion(PROC_CD, t));
            for (String cate : cates) {
                assertEquals(reference.codeList(PROC_CD, cate, t), viaAt.codeList(PROC_CD, cate, t), cate + " " + t);
                for (String code : codes) {
                    assertEquals(reference.isMember(PROC_CD, cate, code, t), viaAt.isMember(PROC_CD, cate, code, t));
                    assertEquals(reference.attr(PROC_CD, cate, code, t, 1), viaAt.attr(PROC_CD, cate, code, t, 1));
                }
            }
        }
        assertTrue(viaAt.isMember(PROC_CD, "COATING", "84", dt("2026-08-01T00:00")));
        assertTrue(split.atCalls.contains(V1_001), "고른 버전(1.001)으로 codeAt 을 부른다: " + split.atCalls);
    }

    @Test
    void effectiveCodes_도_미리_계산한_집합을_먼저_보고_없는_코드는_빈_집합이다() {
        CodeEffLookup eff = (id, ver, cate) -> Optional.of(Set.of("ZZ"));
        DefaultCodeResolver r = new DefaultCodeResolver(InMemoryLookups.codeLookup(CodeFixtures.procCd()), eff);
        assertEquals(Set.of("ZZ"), r.effectiveCodes(PROC_CD, V1_001, "COATING"));
        assertEquals(Set.of(), r.effectiveCodes("NO_CD", V1_001, "COATING"));
    }

    @Test
    void codeAt_기본_구현은_code_와_같은_행이다() {
        CodeLookup l = InMemoryLookups.codeLookup(CodeFixtures.procCd());
        assertSame(l.code(PROC_CD).orElseThrow(), l.codeAt(PROC_CD, V1_000).orElseThrow());
    }
}
```

- [ ] **Step 3: 실패를 확인한다**

Run: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :maru-mdm-engine:test --tests 'kr.dongkuk.maru.mdm.engine.code.*'`
Expected: 컴파일 실패 — `CodeVersions` 가 없고 `codeAt` 이 `@Override` 할 메서드가 아니다.

- [ ] **Step 4: `CodeVersions` 를 만든다**

```java
package kr.dongkuk.maru.mdm.engine.code;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;

/**
 * 마루 코드 버전 고르기(D-154, 스펙 2026-10-03-mdm-meta-cache-per-version §3.2). {@link DefaultCodeResolver}·MDM 메타 피드 목차·업무 모듈 캐시가 같은
 * 함수를 써 판정 의미를 엔진 한 곳에 둔다.
 */
public final class CodeVersions {

    private static final String RELEASED = "RELEASED";

    private CodeVersions() {}

    /**
     * RELEASED 중 {@code applyFrom <= at < applyTo}(여럿이면 applyFrom 이 가장 이른 것), 없으면 ver 가 가장 작은 RELEASED(버전 소급 — 첫 버전
     * 앞·빈틈·닫힌 끝 뒤 모두). CANCELLED·DRAFT 는 보지 않는다. RELEASED 가 없으면 빈 값.
     */
    public static Optional<BigDecimal> select(List<CodeVersionRow> versions, LocalDateTime at) {
        List<CodeVersionRow> released = versions.stream().filter(v -> RELEASED.equals(v.status())).toList();
        return Segments.covering(released, CodeVersionRow::applyFrom, CodeVersionRow::applyTo, at)
                .or(() -> released.stream().min(Comparator.comparing(CodeVersionRow::ver)))
                .map(CodeVersionRow::ver);
    }
}
```

- [ ] **Step 5: `CodeLookup.codeAt` default 를 더한다**

`CodeLookup.java` 의 `code` 선언 바로 아래:

```java
    /**
     * 버전 {@code ver} 판정에 필요한 행(D-154, 결정 P7). 기본은 {@link #code} 의 전체 행 — 원장·옛 구현은 바꿀 것이 없다. 업무 모듈 캐시는 버전 본문
     * 하나(그 버전 1행·유효 items·고른 카테고리 정의)를 준다. {@code engine.code} 는 버전 선택·DEPRECATED 판단에만 {@link #code} 를 쓰고 items·카테고리
     * 계산에는 이것을 쓴다.
     */
    default Optional<CodeRows> codeAt(String maruCodeId, BigDecimal ver) {
        return code(maruCodeId);
    }
```

- [ ] **Step 6: 계약 형태 시험이 실패하는지 본다**

Run: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :maru-mdm-engine:test --tests 'kr.dongkuk.maru.mdm.engine.arch.ContractTypeShapeTest'`
Expected: FAIL `계약_interface_의_몸체_있는_메서드는_RuleEngine_text_textAndAst_뿐이다` — `spi.CodeLookup.codeAt` 이 몸체를 가졌다.

- [ ] **Step 7: 허용 목록을 고친다**

`ContractTypeShapeTest.java` 의 `INTERFACE_BODY_ALLOWED` 와 그 주석, 시험 메서드 이름을 바꾼다.

```java
    /**
     * 몸체 있는 interface 메서드 허용 목록 — 원천 06:480 이 정한 default 위임 두 개(design §6.1 허용 예외)와 {@code CodeLookup.codeAt}(D-154, 결정
     * P7: 기본 구현이 {@code code(id)} 위임이라 원장·옛 구현이 바뀌지 않는다).
     */
    private static final Set<String> INTERFACE_BODY_ALLOWED = Set.of(
            PREFIX + "rule.RuleEngine.text", PREFIX + "rule.RuleEngine.textAndAst", PREFIX + "spi.CodeLookup.codeAt");
```

시험 메서드 이름은 `계약_interface_의_몸체_있는_메서드는_허용_목록뿐이다` 로 바꾼다.

- [ ] **Step 8: 해석기를 고친다**

`DefaultCodeResolver.java` 의 다섯 공개 메서드·`selectVersion`(private)·`resolve` 를 아래로 바꾼다. private `selectVersion(CodeRows, LocalDateTime)` 은 지운다. `validItems` 는 package-private 으로 연다. `compute`·`target`·`cate` 는 그대로 둔다.

```java
    @Override
    public Optional<BigDecimal> selectVersion(String maruCodeId, LocalDateTime baseDt) {
        return codes.code(maruCodeId).flatMap(rows -> CodeVersions.select(rows.versions(), baseDt));
    }

    @Override
    public boolean isMember(String maruCodeId, String cateId, String code, LocalDateTime baseDt) {
        if (code == null) {
            return false;
        }
        Optional<BigDecimal> ver = selectVersion(maruCodeId, baseDt);
        return ver.isPresent() && resolve(maruCodeId, cate(cateId), ver.get()).contains(code);
    }

    @Override
    public Optional<String> attr(String maruCodeId, String cateId, String code, LocalDateTime baseDt, int attrNo) {
        if (!isMember(maruCodeId, cateId, code, baseDt)) {
            return Optional.empty();
        }
        BigDecimal ver = selectVersion(maruCodeId, baseDt).orElseThrow();
        return codes.codeAt(maruCodeId, ver).stream()
                .flatMap(rows -> validItems(rows, ver).stream())
                .filter(i -> i.code().equals(code))
                .findFirst()
                .map(i -> i.attrs().get(attrNo - 1));
    }

    @Override
    public List<CodeListEntry> codeList(String maruCodeId, String cateId, LocalDateTime baseDt) {
        Optional<CodeRows> toc = codes.code(maruCodeId);
        if (toc.isEmpty() || DEPRECATED.equals(toc.get().header().status())) {
            return List.of();
        }
        Optional<BigDecimal> ver = CodeVersions.select(toc.get().versions(), baseDt);
        if (ver.isEmpty()) {
            return List.of();
        }
        Set<String> members = resolve(maruCodeId, cate(cateId), ver.get());
        return codes.codeAt(maruCodeId, ver.get()).stream()
                .flatMap(rows -> validItems(rows, ver.get()).stream())
                .filter(i -> members.contains(i.code()))
                .sorted(Comparator.comparing(CodeItemRow::seq, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(CodeItemRow::code))
                .map(i -> new CodeListEntry(i.code(), i.name(), i.alterName(), i.seq()))
                .toList();
    }

    @Override
    public Set<String> effectiveCodes(String maruCodeId, BigDecimal ver, String cateId) {
        return codes.code(maruCodeId).isPresent() ? resolve(maruCodeId, cate(cateId), ver) : Set.of();
    }

    /** ① 사본·캐시의 미리 계산한 집합(빈 집합 = 소속 없음) ② 없으면 {@code codeAt(id, ver)} 행으로 계산. */
    private Set<String> resolve(String maruCodeId, String cateId, BigDecimal ver) {
        return codeEff.codes(maruCodeId, ver, cateId)
                .orElseGet(() -> codes.codeAt(maruCodeId, ver).map(rows -> compute(rows, cateId, ver)).orElse(Set.of()));
    }
```

`validItems` 선언을 `static List<CodeItemRow> validItems(CodeRows rows, BigDecimal ver)`(private 제거)로 바꾼다. 쓰이지 않게 된 import(`CodeVersionRow`)를 지운다.

- [ ] **Step 9: 엔진 시험 전체를 돌린다**

Run: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :maru-mdm-engine:test`
Expected: PASS(기존 `DefaultCodeResolverTest`·`CodeRowsProjectionTest`·`MasterFunctionTest` 포함)

- [ ] **Step 10: 기본 구현 = 지금 동작임을 바깥 시험으로 확인한다**

Run:
- `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mdm.dmc.*' --tests 'com.dongkuk.dmes.mdm.feed.*'`
- `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :cactus-core:test --tests 'com.dongkuk.dmes.cactus.mdm.*'`

Expected: 둘 다 PASS(원장 `MdmCodeLookup`·cactus `MdmDefinitionLookup` 은 `codeAt` 을 구현하지 않아 기본 구현을 쓴다).

- [ ] **Step 11: 커밋**

```bash
/usr/bin/git add src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/code/CodeVersions.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/spi/CodeLookup.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/code/DefaultCodeResolver.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/arch/ContractTypeShapeTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/code/CodeVersionsTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/code/DefaultCodeResolverCodeAtTest.java
/usr/bin/git commit -m "feat(mdm-engine): 코드 버전 고르기를 공개하고 CodeLookup.codeAt default 로 해석기가 버전 본문을 읽게 한다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 엔진 — `CodeVersionSlicer`·`CodeVersionSlice` 와 손 사례 동치 시험

스펙 §3.3(본문 모양)·§4.2-3(자르기 함수를 엔진에)·§6.1·§6.2「엔진 단위」「엔진 데이터」의 손 사례. 본문은 그 버전에 유효한 items, cateId 마다 `Segments.coveringOrEarliest` 로 고른 정의 하나와 `effectiveCodes` 소속, "전체" 표시를 담는다. `rows` 는 TABLE 소속을 합성 cateItems 로 실어 `CodeEffLookup` 없이도 같은 판정이 나게 한다(이 계획의 「스펙과 다르게 정한 점」).

**Files:**
- Create: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/code/CodeVersionSlice.java`
- Create: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/code/CodeVersionSlicer.java`
- Create: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/testsupport/SlicedCodeLookups.java`
- Create: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/testsupport/CodeEquivalence.java`
- Create: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/code/CodeVersionSlicerTest.java`

**Interfaces:**
- Consumes: Task 2 의 `CodeVersions.select`, `CodeLookup.codeAt`, `DefaultCodeResolver.validItems`(package-private), 기존 `CodeRowsProjection.releasedOnly`, `Segments.coveringOrEarliest`.
- Produces: `CodeVersionSlice`(record 와 `rows`·`membersOf`), `CodeVersionSlice.SlicedCategory`, `CodeVersionSlicer.slice(CodeRows, BigDecimal)`. 시험 보조 `SlicedCodeLookups.resolver(CodeRows full, boolean withEff)`, `CodeEquivalence.assertEquivalent(CodeRows full, List<LocalDateTime>, List<String> cates, List<String> codes, int[] attrNos) : int`, `CodeEquivalence.boundaryTimes(CodeRows)`, `CodeEquivalence.cates(CodeRows)`, `CodeEquivalence.codes(CodeRows)`(Task 4 가 쓴다).

- [ ] **Step 1: 시험 보조 — 새 경로 흉내와 동치 단언을 쓴다**

`SlicedCodeLookups.java`:

```java
package kr.dongkuk.maru.mdm.engine.testsupport;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import kr.dongkuk.maru.mdm.engine.code.CodeRowsProjection;
import kr.dongkuk.maru.mdm.engine.code.CodeVersionSlice;
import kr.dongkuk.maru.mdm.engine.code.CodeVersionSlicer;
import kr.dongkuk.maru.mdm.engine.code.DefaultCodeResolver;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;

/**
 * 업무 모듈 새 경로(D-154)를 엔진 안에서 흉내 낸다 — 원장 → RELEASED 투영 → 목차({@code code}: 헤더·버전만)·버전 본문({@code codeAt}: 자른 본문의
 * {@code rows})·소속({@code codeEff}: 본문의 {@code membersOf}). {@code withEff} 가 거짓이면 {@link CodeEffLookup#NONE} 으로 합성 cateItems 경로를 본다.
 */
public final class SlicedCodeLookups {

    private SlicedCodeLookups() {}

    public static DefaultCodeResolver resolver(CodeRows full, boolean withEff) {
        CodeRows projected = CodeRowsProjection.releasedOnly(full);
        String id = projected.header().maruCodeId();
        Map<BigDecimal, CodeVersionSlice> slices = new ConcurrentHashMap<>();
        CodeLookup lookup = new CodeLookup() {
            @Override
            public Optional<CodeRows> code(String maruCodeId) {
                return id.equals(maruCodeId)
                        ? Optional.of(new CodeRows(projected.header(), projected.versions(), List.of(), List.of(), List.of()))
                        : Optional.empty();
            }

            @Override
            public Optional<CodeRows> codeAt(String maruCodeId, BigDecimal ver) {
                if (!id.equals(maruCodeId)) {
                    return Optional.empty();
                }
                CodeVersionRow row = projected.versions().stream().filter(v -> v.ver().compareTo(ver) == 0).findFirst().orElseThrow();
                return Optional.of(slice(ver).rows(projected.header(), row));
            }

            private CodeVersionSlice slice(BigDecimal ver) {
                return slices.computeIfAbsent(ver.stripTrailingZeros(), k -> CodeVersionSlicer.slice(projected, ver));
            }
        };
        CodeEffLookup eff = withEff
                ? (maruCodeId, ver, cateId) -> lookup.codeAt(maruCodeId, ver).isEmpty() ? Optional.empty()
                        : Optional.of(slices.get(ver.stripTrailingZeros()).membersOf(cateId))
                : CodeEffLookup.NONE;
        return new DefaultCodeResolver(lookup, eff);
    }
}
```

`CodeEquivalence.java`:

```java
package kr.dongkuk.maru.mdm.engine.testsupport;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.code.CodeRowsProjection;
import kr.dongkuk.maru.mdm.engine.code.DefaultCodeResolver;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;

/**
 * 판정 동치(D-154, 스펙 §6.1) — 기준은 투영된 전 이력의 {@code new DefaultCodeResolver(id -> projected, NONE)}. 새 경로 두 벌(색인 있음·NONE)이
 * {@code CodeResolver} 다섯 메서드 전부에서 기준과 같아야 한다.
 */
public final class CodeEquivalence {

    private static final LocalDateTime OPEN_DT = LocalDateTime.parse("9999-12-31T00:00:00");

    private CodeEquivalence() {}

    /** @return 비교한 (시각, 카테고리, 코드) 조합 수 — 빈 시험을 막으려고 호출자가 하한을 단언한다 */
    public static int assertEquivalent(CodeRows full, List<LocalDateTime> times, List<String> cates, List<String> codes, int[] attrNos) {
        CodeRows projected = CodeRowsProjection.releasedOnly(full);
        String id = projected.header().maruCodeId();
        DefaultCodeResolver reference = new DefaultCodeResolver(InMemoryLookups.codeLookup(projected), CodeEffLookup.NONE);
        int checks = 0;
        for (boolean withEff : new boolean[] {true, false}) {
            DefaultCodeResolver sliced = SlicedCodeLookups.resolver(full, withEff);
            String mode = withEff ? "[색인] " : "[NONE] ";
            for (LocalDateTime t : times) {
                assertEquals(reference.selectVersion(id, t), sliced.selectVersion(id, t), mode + "selectVersion " + t);
                for (String cate : cates) {
                    assertEquals(reference.codeList(id, cate, t), sliced.codeList(id, cate, t), mode + "codeList " + cate + " " + t);
                    for (String code : codes) {
                        String at = mode + cate + "/" + code + " " + t;
                        assertEquals(reference.isMember(id, cate, code, t), sliced.isMember(id, cate, code, t), "isMember " + at);
                        for (int n : attrNos) {
                            assertEquals(reference.attr(id, cate, code, t, n), sliced.attr(id, cate, code, t, n), "attr" + n + " " + at);
                        }
                        checks++;
                    }
                }
            }
            for (CodeVersionRow v : projected.versions()) {
                for (String cate : cates) {
                    assertEquals(reference.effectiveCodes(id, v.ver(), cate), sliced.effectiveCodes(id, v.ver(), cate),
                            mode + "effectiveCodes " + v.ver() + " " + cate);
                }
            }
        }
        return checks;
    }

    /** RELEASED 버전마다 applyFrom·applyTo 의 ±1초(열린 끝 제외), 첫 버전 하루 전, 열린 끝 직전. */
    public static List<LocalDateTime> boundaryTimes(CodeRows full) {
        Set<LocalDateTime> out = new LinkedHashSet<>();
        LocalDateTime first = null;
        for (CodeVersionRow v : CodeRowsProjection.releasedOnly(full).versions()) {
            for (LocalDateTime b : new LocalDateTime[] {v.applyFrom(), v.applyTo()}) {
                if (b != null && !b.equals(OPEN_DT)) {
                    out.add(b.minusSeconds(1));
                    out.add(b);
                    out.add(b.plusSeconds(1));
                }
            }
            if (v.applyFrom() != null && (first == null || v.applyFrom().isBefore(first))) {
                first = v.applyFrom();
            }
        }
        if (first != null) {
            out.add(first.minusDays(1));
        }
        out.add(OPEN_DT.minusSeconds(1));
        return new ArrayList<>(out);
    }

    /** 투영에 남은 cateId 전부 + BASE + 없는 cateId + null + 빈 문자열. */
    public static List<String> cates(CodeRows full) {
        Set<String> out = new LinkedHashSet<>();
        CodeRowsProjection.releasedOnly(full).categories().stream().map(CodeCateRow::cateId).forEach(out::add);
        out.add("BASE");
        out.add("NO_SUCH_CATE");
        List<String> list = new ArrayList<>(out);
        list.addAll(Arrays.asList(null, ""));
        return list;
    }

    /** 투영 items 의 코드 전부 + 없는 코드 + null. */
    public static List<String> codes(CodeRows full) {
        Set<String> out = new LinkedHashSet<>();
        CodeRowsProjection.releasedOnly(full).items().stream().map(CodeItemRow::code).forEach(out::add);
        out.add("NO_SUCH_CODE");
        List<String> list = new ArrayList<>(out);
        list.add(null);
        return list;
    }

    public static int[] allAttrs() {
        return new int[] {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};
    }

    /** RELEASED 버전 ver 목록. */
    public static List<BigDecimal> releasedVers(CodeRows full) {
        return CodeRowsProjection.releasedOnly(full).versions().stream().map(CodeVersionRow::ver).toList();
    }
}
```

`InMemoryLookups.codeLookup` 은 이미 있다(public static).

- [ ] **Step 2: 실패하는 시험을 쓴다**

`CodeVersionSlicerTest.java`. `CodeRowsProjectionTest.equivalenceFixture()` 는 같은 패키지의 package-private static 이라 그대로 쓴다.

```java
package kr.dongkuk.maru.mdm.engine.code;

import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.OPEN_DT;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.OPEN_VER;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.attrs;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.dt;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.lvl;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.ver;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;
import kr.dongkuk.maru.mdm.engine.testsupport.CodeEquivalence;
import kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures;
import org.junit.jupiter.api.Test;

/**
 * D-154 — 코드 버전 본문 자르기(스펙 §3.3·§4.2)와 판정 동치(§6.1·§6.2 「엔진 단위」「엔진 데이터」 손 사례). 기준은 투영된 전 이력이고, 새 경로는
 * 색인({@code CodeEffLookup}) 있음·없음 두 벌이다.
 */
class CodeVersionSlicerTest {

    private static final BigDecimal V1 = ver("1.000");
    private static final BigDecimal V2 = ver("2.000");
    private static final BigDecimal V3 = ver("3.000");

    // ---- 동치 ----

    @Test
    void 동치_D152_동등성_고정_데이터의_모든_경계_시각_카테고리_코드에서_전_이력과_같다() {
        CodeRows full = CodeRowsProjectionTest.equivalenceFixture();
        int checks = CodeEquivalence.assertEquivalent(full, CodeEquivalence.boundaryTimes(full), CodeEquivalence.cates(full),
                CodeEquivalence.codes(full), CodeEquivalence.allAttrs());
        assertTrue(checks >= 500, "비교 수 " + checks);
    }

    @Test
    void 동치_PROC_CD_와_DEPRECATED_헤더() {
        for (CodeRows full : List.of(CodeFixtures.procCd(), CodeFixtures.withHeaderStatus(CodeFixtures.procCd(), "DEPRECATED"))) {
            int checks = CodeEquivalence.assertEquivalent(full, CodeEquivalence.boundaryTimes(full), CodeEquivalence.cates(full),
                    CodeEquivalence.codes(full), CodeEquivalence.allAttrs());
            assertTrue(checks > 0);
        }
    }

    @Test
    void 동치_손_사례_묶음() {
        CodeRows full = handCases();
        int checks = CodeEquivalence.assertEquivalent(full, CodeEquivalence.boundaryTimes(full), CodeEquivalence.cates(full),
                CodeEquivalence.codes(full), CodeEquivalence.allAttrs());
        assertTrue(checks >= 300, "비교 수 " + checks);
    }

    @Test
    void 동치_RELEASED_가_없는_코드는_새_경로도_모두_빈_판정이다() {
        CodeRows full = new CodeRows(new CodeHeader("NR_CD", "CREATED"), List.of(new CodeVersionRow(V1, "DRAFT", null, null)),
                List.of(new CodeItemRow("A", V1, OPEN_VER, "에이", null, 1, lvl(), attrs())),
                List.of(new CodeCateRow("BASE", V1, OPEN_VER, "REGEX", ".*", "CODE")), List.of());
        CodeEquivalence.assertEquivalent(full, List.of(dt("2026-01-01T00:00")), CodeEquivalence.cates(full),
                List.of("A"), new int[] {1});
    }

    // ---- 본문 모양 ----

    @Test
    void 본문은_그_버전에_유효한_items_만_담고_fromVer_toVer_는_원본_그대로다() {
        CodeVersionSlice s = CodeVersionSlicer.slice(CodeRowsProjection.releasedOnly(handCases()), V2);
        assertEquals(List.of("A", "B", "C"), s.items().stream().map(CodeItemRow::code).toList());
        CodeItemRow a = s.items().get(0);
        assertEquals(0, a.fromVer().compareTo(V1));
        assertEquals(0, a.toVer().compareTo(OPEN_VER));
        assertEquals(0, s.ver().compareTo(V2));
        assertEquals("HC_CD", s.maruCodeId());
    }

    @Test
    void 뒤_버전에만_정의가_있는_카테고리도_최초_소급으로_고른_정의와_소속을_싣는다() {
        CodeVersionSlice s = CodeVersionSlicer.slice(CodeRowsProjection.releasedOnly(handCases()), V1);
        CodeVersionSlice.SlicedCategory late = category(s, "LATE");
        assertEquals(0, late.fromVer().compareTo(V3), "정의 fromVer(3.000)가 본문 ver(1.000)보다 뒤");
        assertEquals(List.of("A"), late.members());
        assertFalse(late.all());
    }

    @Test
    void TABLE_소속은_effVer_max_정의_fromVer_v_기준으로_계산한다() {
        // TBL_LATE 정의는 2.000 부터, 소속 행 B 는 [2.000, 열린 끝) — 1.000 판정은 effVer 2.000 의 행을 읽는다
        CodeVersionSlice s = CodeVersionSlicer.slice(CodeRowsProjection.releasedOnly(handCases()), V1);
        assertEquals(List.of("B"), category(s, "TBL_LATE").members());
    }

    @Test
    void 결과가_items_전체면_all_이고_members_는_null_이다_REGEX_와_TABLE_둘_다() {
        CodeVersionSlice s = CodeVersionSlicer.slice(CodeRowsProjection.releasedOnly(handCases()), V2);
        assertTrue(category(s, "BASE").all());
        assertNull(category(s, "BASE").members());
        assertTrue(category(s, "TBL_ALL").all(), "TABLE 이 우연히 전부 담는 경우도 집합 비교로 전체다");
        assertNull(category(s, "TBL_ALL").members());
        assertEquals(Set.of("A", "B", "C"), s.membersOf("TBL_ALL"));
    }

    @Test
    void 정의는_있는데_소속이_없으면_all_false_members_빈_목록이고_정의가_없는_cateId_는_싣지_않는다() {
        CodeVersionSlice s = CodeVersionSlicer.slice(CodeRowsProjection.releasedOnly(handCases()), V2);
        assertFalse(category(s, "NOPE").all());
        assertEquals(List.of(), category(s, "NOPE").members());
        assertTrue(s.categories().stream().noneMatch(c -> c.cateId().equals("CLOSED")), "2.000 을 덮지 않고 소급 대상도 아닌 정의");
        assertEquals(Set.of(), s.membersOf("CLOSED"));
        assertEquals(Set.of(), s.membersOf("NO_SUCH_CATE"));
    }

    @Test
    void REGEX_의_LVL_과_ATTR_대상() {
        CodeVersionSlice s = CodeVersionSlicer.slice(CodeRowsProjection.releasedOnly(handCases()), V2);
        assertEquals(List.of("A", "C"), category(s, "LVL_P").members());
        assertEquals(List.of("B"), category(s, "ATTR_X").members());
    }

    @Test
    void rows_는_그_버전_1행_고른_정의_합성_cateItems_를_준다() {
        CodeRows projected = CodeRowsProjection.releasedOnly(handCases());
        CodeVersionRow v2 = projected.versions().stream().filter(v -> v.ver().compareTo(V2) == 0).findFirst().orElseThrow();
        CodeVersionSlice s = CodeVersionSlicer.slice(projected, V2);
        CodeRows rows = s.rows(projected.header(), v2);
        assertEquals(List.of(v2), rows.versions());
        assertEquals(s.items(), rows.items());
        assertEquals(s.categories().size(), rows.categories().size());
        Map<String, List<CodeCateItemRow>> byCate = rows.cateItems().stream().collect(Collectors.groupingBy(CodeCateItemRow::cateId));
        assertEquals(List.of("B"), byCate.get("TBL_LATE").stream().map(CodeCateItemRow::code).toList());
        assertEquals(0, byCate.get("TBL_LATE").get(0).fromVer().compareTo(V2), "effVer = max(2.000, 2.000)");
        assertTrue(rows.cateItems().stream().allMatch(ci -> ci.toVer().compareTo(OPEN_VER) == 0));
    }

    @Test
    void RELEASED_가_아닌_버전은_자를_수_없다() {
        CodeRows projected = CodeRowsProjection.releasedOnly(CodeRowsProjectionTest.equivalenceFixture());
        assertThrows(IllegalArgumentException.class, () -> CodeVersionSlicer.slice(projected, ver("1.001"))); // CANCELLED
        assertThrows(IllegalArgumentException.class, () -> CodeVersionSlicer.slice(projected, ver("2.001"))); // DRAFT
        assertThrows(IllegalArgumentException.class, () -> CodeVersionSlicer.slice(projected, ver("7.000"))); // 없음
    }

    @Test
    void JSON_으로_직렬화하고_되읽어도_같다_스펙_3_3_칸_이름() throws Exception {
        ObjectMapper mapper = JsonMapper.builder().enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS).build();
        CodeVersionSlice s = CodeVersionSlicer.slice(CodeRowsProjection.releasedOnly(handCases()), V2);
        String text = mapper.writeValueAsString(s);
        assertTrue(text.contains("\"maruCodeId\":\"HC_CD\""), text);
        assertTrue(text.contains("\"all\":true"), text);
        assertTrue(text.contains("\"members\":null"), text);
        assertFalse(text.contains("membersOf"), text);
        assertEquals(s, mapper.readValue(text, CodeVersionSlice.class));
    }

    // ---- 보조 ----

    /**
     * 손 사례 — RELEASED 1.000 [2026-01-01, 2026-04-01)·2.000 [2026-04-01, 2026-07-01)·3.000 [2026-07-01, 열린 끝), CANCELLED 2.500.
     * items: A(1.000~, LVL P), B(1.000~2.000 ATTR01 Y → 2.000~ ATTR01 X), C(2.000~, LVL P), D(2.500 취소 전용).
     * 카테고리: BASE(.*), LVL_P(REGEX LVL1 P), ATTR_X(REGEX ATTR01 X), LATE(3.000~ REGEX A — 최초 소급), TBL_LATE(TABLE 2.000~, 소속 B),
     * TBL_ALL(TABLE 1.000~, 소속 A·B·C), NOPE(REGEX 아무것도 맞지 않음), CLOSED(REGEX 1.000~2.000 — 2.000 이후 소급 대상 아님).
     */
    static CodeRows handCases() {
        BigDecimal v25 = ver("2.500");
        return new CodeRows(new CodeHeader("HC_CD", "INUSE"),
                List.of(new CodeVersionRow(V1, "RELEASED", dt("2026-01-01T00:00"), dt("2026-04-01T00:00")),
                        new CodeVersionRow(V2, "RELEASED", dt("2026-04-01T00:00"), dt("2026-07-01T00:00")),
                        new CodeVersionRow(v25, "CANCELLED", null, null),
                        new CodeVersionRow(V3, "RELEASED", dt("2026-07-01T00:00"), OPEN_DT)),
                List.of(new CodeItemRow("A", V1, OPEN_VER, "에이", null, 2, lvl("P"), attrs()),
                        new CodeItemRow("B", V1, V2, "비", "비옛", 1, lvl("Q"), attrs("Y")),
                        new CodeItemRow("B", V2, OPEN_VER, "비(2)", null, 1, lvl("Q"), attrs("X", "b2")),
                        new CodeItemRow("C", V2, OPEN_VER, "씨", null, null, lvl("P"), attrs()),
                        new CodeItemRow("D", v25, V3, "디(취소)", null, 4, lvl("P"), attrs("X"))),
                List.of(new CodeCateRow("BASE", V1, OPEN_VER, "REGEX", ".*", "CODE"),
                        new CodeCateRow("LVL_P", V1, OPEN_VER, "REGEX", "P", "LVL1"),
                        new CodeCateRow("ATTR_X", V1, OPEN_VER, "REGEX", "X", "ATTR01"),
                        new CodeCateRow("LATE", V3, OPEN_VER, "REGEX", "A", "CODE"),
                        new CodeCateRow("TBL_LATE", V2, OPEN_VER, "TABLE", null, null),
                        new CodeCateRow("TBL_ALL", V1, OPEN_VER, "TABLE", null, null),
                        new CodeCateRow("NOPE", V1, OPEN_VER, "REGEX", "ZZZ", "CODE"),
                        new CodeCateRow("CLOSED", V1, V2, "REGEX", ".*", "CODE")),
                List.of(new CodeCateItemRow("TBL_LATE", "B", V2, OPEN_VER),
                        new CodeCateItemRow("TBL_ALL", "A", V1, OPEN_VER),
                        new CodeCateItemRow("TBL_ALL", "B", V1, OPEN_VER),
                        new CodeCateItemRow("TBL_ALL", "C", V2, OPEN_VER),
                        new CodeCateItemRow("TBL_ALL", "D", v25, V3)));
    }

    private static CodeVersionSlice.SlicedCategory category(CodeVersionSlice s, String cateId) {
        return s.categories().stream().filter(c -> c.cateId().equals(cateId)).findFirst()
                .orElseThrow(() -> new AssertionError("카테고리 없음: " + cateId + " in " + s.categories().stream()
                        .map(CodeVersionSlice.SlicedCategory::cateId).collect(Collectors.toList())));
    }
}
```

`REGEX_의_LVL_과_ATTR_대상` 의 기대값은 2.000 기준이다: LVL1 이 P 인 코드는 A·C, ATTR01 이 X 인 코드는 B(2.000 행) 이다. 3.000 판정에서 `LATE` 는 covering 으로 고르고 1.000·2.000 은 소급으로 고른다.

- [ ] **Step 3: 실패를 확인한다**

Run: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :maru-mdm-engine:test --tests 'kr.dongkuk.maru.mdm.engine.code.CodeVersionSlicerTest'`
Expected: 컴파일 실패 — `CodeVersionSlice`·`CodeVersionSlicer` 가 없다.

- [ ] **Step 4: `CodeVersionSlice` 를 만든다**

```java
package kr.dongkuk.maru.mdm.engine.code;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;

/**
 * 마루 코드 버전 본문 하나(D-154, 스펙 2026-10-03-mdm-meta-cache-per-version §3.3) — MDM 메타 피드 {@code CODE:X@ver} 값이자 업무 모듈 캐시 본문.
 * JSON 칸 이름은 record 구성 요소 그대로다({@code maruCodeId, ver, items, categories[{cateId, fromVer, toVer, defKind, defExpr, defTarget, all,
 * members}]}). {@link #rows}·{@link #membersOf} 는 인자를 받으므로 Jackson 속성이 아니다.
 *
 * @param items      이 버전에 유효한 코드 행({@code fromVer <= ver < toVer}) — fromVer·toVer 는 원본 그대로
 * @param categories cateId 마다 {@code Segments.coveringOrEarliest} 로 고른 정의 하나와 소속. 고른 정의가 없는 cateId 는 없다
 */
public record CodeVersionSlice(String maruCodeId, BigDecimal ver, List<CodeItemRow> items, List<SlicedCategory> categories) {

    private static final String TABLE = "TABLE";
    private static final BigDecimal OPEN_VER = new BigDecimal("9999.000");

    /**
     * 고른 정의 하나와 소속. {@code all} 이면 소속이 이 본문 items 의 코드 전체이고 {@code members} 는 null 이다(이름이 아니라 집합 비교로 판단).
     * 정의는 있는데 소속이 없으면 {@code all=false, members=[]}.
     */
    public record SlicedCategory(String cateId, BigDecimal fromVer, BigDecimal toVer, String defKind, String defExpr, String defTarget,
                                 boolean all, List<String> members) {
    }

    /**
     * 엔진 {@code CodeLookup.codeAt} 이 줄 행 — {@code (header, [version], items, 고른 정의들, 합성 cateItems)}. TABLE 소속은
     * {@code CodeCateItemRow(cateId, code, max(정의 fromVer, ver), 9999.000)} 한 줄씩 합성한다. 그래서 {@code CodeEffLookup} 이 빈 값을 줘도 해석기가
     * 이 행으로 계산한 소속이 미리 계산한 소속과 같다(REGEX 는 items 와 정의로 다시 계산해도 같다).
     */
    public CodeRows rows(CodeHeader header, CodeVersionRow version) {
        List<CodeCateRow> defs = new ArrayList<>(categories.size());
        List<CodeCateItemRow> synthesized = new ArrayList<>();
        for (SlicedCategory c : categories) {
            defs.add(new CodeCateRow(c.cateId(), c.fromVer(), c.toVer(), c.defKind(), c.defExpr(), c.defTarget()));
            if (TABLE.equals(c.defKind())) {
                BigDecimal effVer = c.fromVer().max(ver);
                for (String code : membersOf(c.cateId())) {
                    synthesized.add(new CodeCateItemRow(c.cateId(), code, effVer, OPEN_VER));
                }
            }
        }
        return new CodeRows(header, List.of(version), items, defs, synthesized);
    }

    /** 소속 코드(순서 유지). {@code cateId} 는 호출자가 BASE 로 정규화한 값이다. 본문에 없는 cateId 는 빈 집합, {@code all} 이면 items 코드 전체. */
    public Set<String> membersOf(String cateId) {
        for (SlicedCategory c : categories) {
            if (c.cateId().equals(cateId)) {
                if (c.all()) {
                    Set<String> codes = new LinkedHashSet<>();
                    items.forEach(i -> codes.add(i.code()));
                    return codes;
                }
                return new LinkedHashSet<>(c.members());
            }
        }
        return Set.of();
    }
}
```

- [ ] **Step 5: `CodeVersionSlicer` 를 만든다**

```java
package kr.dongkuk.maru.mdm.engine.code;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;

/**
 * 투영된 전 이력에서 버전 본문 하나를 자른다(D-154, 스펙 §4.2-3). MDM 피드 본문 생성과 업무 모듈 물러남(옛 MDM 응답, 스펙 §5.8)이 이 함수 하나를
 * 쓰고, 동치 시험의 기준도 여기 있다. 소속은 {@link DefaultCodeResolver#effectiveCodes} 로 계산한다 — 판정 규칙을 두 벌로 만들지 않는다.
 */
public final class CodeVersionSlicer {

    private static final String RELEASED = "RELEASED";

    private CodeVersionSlicer() {}

    /**
     * @param projected {@link CodeRowsProjection#releasedOnly} 결과
     * @param ver       {@code projected} 안의 RELEASED 버전(수 비교). 아니면 {@link IllegalArgumentException}
     */
    public static CodeVersionSlice slice(CodeRows projected, BigDecimal ver) {
        CodeVersionRow version = projected.versions().stream()
                .filter(v -> RELEASED.equals(v.status()) && v.ver().compareTo(ver) == 0)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "RELEASED 버전이 아니다: " + projected.header().maruCodeId() + " " + ver));
        BigDecimal v = version.ver();
        String id = projected.header().maruCodeId();
        List<CodeItemRow> items = DefaultCodeResolver.validItems(projected, v);
        Set<String> itemCodes = new LinkedHashSet<>();
        items.forEach(i -> itemCodes.add(i.code()));
        DefaultCodeResolver resolver = new DefaultCodeResolver(maruCodeId -> Optional.of(projected), CodeEffLookup.NONE);
        Map<String, List<CodeCateRow>> byCate = new LinkedHashMap<>();
        projected.categories().forEach(c -> byCate.computeIfAbsent(c.cateId(), k -> new ArrayList<>()).add(c));
        List<CodeVersionSlice.SlicedCategory> categories = new ArrayList<>();
        byCate.forEach((cateId, defs) -> Segments.coveringOrEarliest(defs, CodeCateRow::fromVer, CodeCateRow::toVer, v).ifPresent(def -> {
            Set<String> members = resolver.effectiveCodes(id, v, cateId);
            boolean all = !itemCodes.isEmpty() && members.equals(itemCodes);
            categories.add(new CodeVersionSlice.SlicedCategory(def.cateId(), def.fromVer(), def.toVer(), def.defKind(), def.defExpr(),
                    def.defTarget(), all, all ? null : List.copyOf(members)));
        }));
        return new CodeVersionSlice(id, v, items, categories);
    }
}
```

- [ ] **Step 6: 시험을 돌린다**

Run: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :maru-mdm-engine:test`
Expected: PASS. 동치 시험이 실패하면 기대값을 고치지 말고 자르기·합성 규칙을 고친다(기준은 전 이력이다).

- [ ] **Step 7: 커밋**

```bash
/usr/bin/git add src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/code/CodeVersionSlice.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/code/CodeVersionSlicer.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/testsupport/SlicedCodeLookups.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/testsupport/CodeEquivalence.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/code/CodeVersionSlicerTest.java
/usr/bin/git commit -m "feat(mdm-engine): 코드 버전 본문 자르기와 미리 계산한 카테고리 소속을 더하고 전 이력 판정과의 동치를 고정한다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 엔진 — 생성 데이터 동치 시험

스펙 §6.2「엔진 데이터」— 부록 A.1 생성기를 시험용으로 옮긴다. 측정에 쓴 생성기는 지워졌으므로 결정적 seed 로 새로 쓴다. 단위 시험 시간 때문에 크기는 A(10버전·코드 100개·5%)와 줄인 B′(60버전·코드 200개·2%)로 둔다. C(10만 행)는 돌리지 않는다.

**Files:**
- Create: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/testsupport/CodeHistoryGenerator.java`
- Create: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/code/CodeVersionSliceGeneratedTest.java`

**Interfaces:**
- Consumes: Task 3 의 `CodeEquivalence.*`, `SlicedCodeLookups.resolver`.
- Produces: `CodeHistoryGenerator.generate(String id, int releasedCount, int codeCount, double changeRatio, long seed) : CodeRows`.

- [ ] **Step 1: 생성기를 쓴다**

```java
package kr.dongkuk.maru.mdm.engine.testsupport;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Random;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;

/**
 * 코드 이력 생성기(D-154 스펙 부록 A.1 의 시험판, 결정적 seed). 첫 버전에 코드마다 열린 행 하나, 버전마다 {@code changeRatio} 만큼의 코드가 이전
 * 행을 닫고 새 행을 연다(ATTR01 은 약 25% 가 "X"). TABLE {@code TB} 소속도 바뀐 코드만 구간을 끊는다. 적용 구간은 하루씩 연속이고 마지막 RELEASED
 * 는 열린 끝, 그 뒤 초안(DRAFT) 하나가 열린 행 전체를 사본으로 만든다. 카테고리는 BASE(.*), RX(REGEX ATTR01 X), TB(TABLE) 셋이다.
 */
public final class CodeHistoryGenerator {

    private static final BigDecimal OPEN_VER = new BigDecimal("9999.000");
    private static final LocalDateTime OPEN_DT = LocalDateTime.parse("9999-12-31T00:00:00");
    private static final LocalDateTime START = LocalDateTime.parse("2025-01-01T00:00:00");

    private CodeHistoryGenerator() {}

    public static CodeRows generate(String id, int releasedCount, int codeCount, double changeRatio, long seed) {
        Random rnd = new Random(seed);
        List<CodeVersionRow> versions = new ArrayList<>();
        List<CodeItemRow> items = new ArrayList<>();
        List<CodeCateItemRow> cateItems = new ArrayList<>();
        BigDecimal v1 = ver(1);
        String[] attr = new String[codeCount];
        BigDecimal[] itemFrom = new BigDecimal[codeCount];
        boolean[] inTb = new boolean[codeCount];
        BigDecimal[] tbFrom = new BigDecimal[codeCount];
        for (int c = 0; c < codeCount; c++) {
            attr[c] = rnd.nextInt(4) == 0 ? "X" : "Y";
            itemFrom[c] = v1;
            inTb[c] = rnd.nextBoolean();
            tbFrom[c] = v1;
        }
        for (int n = 1; n <= releasedCount; n++) {
            BigDecimal v = ver(n);
            versions.add(new CodeVersionRow(v, "RELEASED", START.plusDays(n - 1L), n == releasedCount ? OPEN_DT : START.plusDays(n)));
            if (n == 1) {
                continue;
            }
            for (int c = 0; c < codeCount; c++) {
                if (rnd.nextDouble() >= changeRatio) {
                    continue;
                }
                items.add(item(c, itemFrom[c], v, attr[c]));
                attr[c] = rnd.nextInt(4) == 0 ? "X" : "Y";
                itemFrom[c] = v;
                if (inTb[c]) {
                    cateItems.add(new CodeCateItemRow("TB", code(c), tbFrom[c], v));
                }
                inTb[c] = rnd.nextBoolean();
                tbFrom[c] = v;
            }
        }
        BigDecimal draft = ver(releasedCount + 1);
        versions.add(new CodeVersionRow(draft, "DRAFT", null, null));
        for (int c = 0; c < codeCount; c++) {
            items.add(item(c, itemFrom[c], draft, attr[c]));
            items.add(item(c, draft, OPEN_VER, attr[c]));
            if (inTb[c]) {
                cateItems.add(new CodeCateItemRow("TB", code(c), tbFrom[c], draft));
                cateItems.add(new CodeCateItemRow("TB", code(c), draft, OPEN_VER));
            }
        }
        List<CodeCateRow> cates = List.of(
                new CodeCateRow("BASE", v1, OPEN_VER, "REGEX", ".*", "CODE"),
                new CodeCateRow("RX", v1, OPEN_VER, "REGEX", "X", "ATTR01"),
                new CodeCateRow("TB", v1, OPEN_VER, "TABLE", null, null));
        return new CodeRows(new CodeHeader(id, "INUSE"), versions, items, cates, cateItems);
    }

    public static String code(int c) {
        return String.format("C%04d", c);
    }

    private static CodeItemRow item(int c, BigDecimal from, BigDecimal to, String attr01) {
        String[] attrs = new String[10];
        attrs[0] = attr01;
        attrs[1] = "a" + c;
        return new CodeItemRow(code(c), from, to, "코드" + c, null, c % 7, Arrays.asList(c % 2 == 0 ? "A" : "B", null, null, null, null),
                Arrays.asList(attrs));
    }

    private static BigDecimal ver(int n) {
        return new BigDecimal(n).setScale(3);
    }
}
```

- [ ] **Step 2: 실패하는 시험을 쓴다**

```java
package kr.dongkuk.maru.mdm.engine.code;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.testsupport.CodeEquivalence;
import kr.dongkuk.maru.mdm.engine.testsupport.CodeHistoryGenerator;
import org.junit.jupiter.api.Test;

/**
 * D-154 — 생성 데이터의 판정 동치(스펙 §6.2 「엔진 데이터」, 부록 A.1). 크기는 A(10버전·코드 100개·5%)와 줄인 B′(60버전·코드 200개·2%) — C(10만 행)는
 * 단위 시험 시간 때문에 돌리지 않는다(측정 때 1,200건 동치를 이미 확인).
 */
class CodeVersionSliceGeneratedTest {

    @Test
    void 시나리오_A_모든_경계_시각_모든_코드() {
        CodeRows full = CodeHistoryGenerator.generate("GEN_A", 10, 100, 0.05, 20261003L);
        assertEquals(10 + 1, full.versions().size());
        int checks = CodeEquivalence.assertEquivalent(full, CodeEquivalence.boundaryTimes(full), CodeEquivalence.cates(full),
                CodeEquivalence.codes(full), new int[] {1, 2, 10});
        assertTrue(checks >= 2 * 30 * 6 * 100, "비교 수 " + checks);
    }

    @Test
    void 시나리오_B_줄임_여섯_버전마다_경계와_다섯_번째_코드마다() {
        CodeRows full = CodeHistoryGenerator.generate("GEN_B", 60, 200, 0.02, 7L);
        List<LocalDateTime> all = CodeEquivalence.boundaryTimes(full);
        List<LocalDateTime> times = new ArrayList<>();
        for (int i = 0; i < all.size(); i += 6) {
            times.add(all.get(i));
        }
        times.add(all.get(all.size() - 1));
        List<String> codes = new ArrayList<>();
        for (int c = 0; c < 200; c += 5) {
            codes.add(CodeHistoryGenerator.code(c));
        }
        codes.add("NO_SUCH_CODE");
        codes.add(null);
        int checks = CodeEquivalence.assertEquivalent(full, times, CodeEquivalence.cates(full), codes, new int[] {1, 2});
        assertTrue(checks >= 2 * 30 * 6 * 42, "비교 수 " + checks);
    }

    @Test
    void 생성기는_같은_seed_면_같은_데이터다() {
        assertEquals(CodeHistoryGenerator.generate("G", 10, 50, 0.1, 1L), CodeHistoryGenerator.generate("G", 10, 50, 0.1, 1L));
    }
}
```

- [ ] **Step 3: 시험을 돌린다**

Run: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :maru-mdm-engine:test --tests 'kr.dongkuk.maru.mdm.engine.code.CodeVersionSliceGeneratedTest'`
Expected: PASS(생성기를 먼저 쓰고 시험이 바로 통과하는 경우다. 동치 단언이 의미 있는지 보려고 Step 4 를 한다).

- [ ] **Step 4: 변이로 시험이 잡는지 확인하고 되돌린다**

`CodeVersionSlice.rows` 의 `BigDecimal effVer = c.fromVer().max(ver);` 를 잠시 `BigDecimal effVer = ver;` 로 바꾸고 Step 3 을 돌린다.
Expected: 이 시험은 PASS 일 수 있다(생성 데이터의 TABLE 정의는 1.000 부터라 effVer 가 같다). 대신 `CodeVersionSlicerTest#동치_손_사례_묶음` 이 FAIL 이어야 한다. 확인한 뒤 원래대로 되돌린다. 두 번째 변이로 `CodeVersionSlicer` 의 `boolean all = …` 를 `boolean all = false;` 로 바꾸면 `결과가_items_전체면_all_…` 이 FAIL 이어야 한다. 되돌린다.

- [ ] **Step 5: 엔진 시험 전체를 돌린다**

Run: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :maru-mdm-engine:test`
Expected: PASS. 이 클래스 실행 시간이 30초를 넘으면 B′ 의 코드 간격을 5 → 10 으로 늘리고 하한 단언을 같이 줄인다.

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/testsupport/CodeHistoryGenerator.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/code/CodeVersionSliceGeneratedTest.java
/usr/bin/git commit -m "test(mdm-engine): 생성한 코드 이력으로 버전 본문 판정이 전 이력과 같은지 고정한다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: MDM 피드 — `part`·`at` 요청 해석, TOC·BODY 봉투, 룰(RULE)

스펙 §4.1(피드 API 변경)·§4.2「룰」. `part` 없는 요청은 지금 코드를 그대로 지나야 한다(골든 시험). 묶음 전체 거부는 type·`part`·`at` 형식 오류와 키 500개 초과뿐이고, 키 하나의 잘못(형식이 틀린 ver, RELEASED 가 아닌 ver)은 그 키의 `failed` 다(옛 MDM 신호 (나)가 잘못 걸리지 않게). 이 작업에서는 RULE 만 구현하고 RULE_SET·LAYOUT·CODE 의 TOC·BODY 는 입력 오류로 거부한다(Task 6·7 이 채운다).

**Files:**
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/feed/metaFeed/dto/MetaFeedViewRequest.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/feed/metaFeed/service/MetaFeedPart.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/feed/metaFeed/service/MetaFeedVersionedResult.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/feed/metaFeed/service/MetaFeedVersionSelect.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/feed/metaFeed/service/MetaFeedVersioned.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/feed/metaFeed/service/MetaFeedService.java:51-110`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/feed/metaFeed/service/MetaFeedDefinitions.java:70-99`(룰 조립을 메서드로 꺼낸다)
- Create: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/feed/MetaFeedVersionedHttpTest.java`

**Interfaces:**
- Consumes: Task 1 골든 시험.
- Produces:
  - `MetaFeedViewRequest.getPart()/setPart(String)`, `getAt()/setAt(String)`.
  - `enum MetaFeedPart { NONE, TOC, BODY }`, `static MetaFeedPart of(String text, MetaTargetType type)`.
  - `record MetaFeedService.BodyKey(String key, BigDecimal ver, String rawVer)`(ver null = 형식 오류), `static List<BodyKey> bodyKeyList(List<Map<String, Object>> rows)`, `static LocalDateTime parseAt(String text)`.
  - `MetaFeedVersioned`(@Component) `MetaFeedVersionedResult toc(MetaTargetType type, List<String> keys, LocalDateTime at)`, `MetaFeedVersionedResult bodies(MetaTargetType type, List<MetaFeedService.BodyKey> keys)`, 상수 `NOT_RELEASED = "NOT_RELEASED"`, `INVALID_VER = "INVALID_VER"`.
  - `MetaFeedVersionedResult` 의 `Builder`(`toc(key, tocValue, current)`·`tocFailed(key, message)`·`body(BodyKey, value)`·`bodyFailed(BodyKey, message)`·`build()`), `toResponse()`.
  - `MetaFeedVersionSelect.releasedAt(List<T>, Function<T, BigDecimal>, Function<T, LocalDateTime> from, Function<T, LocalDateTime> to, LocalDateTime at) : Optional<T>`.
  - `MetaFeedDefinitions.assembleRule(String id, MdmRule rule, MdmRuleVer v, RuleVarTypeResolver.Scope scope) : RuleDefinition`(package-private).

- [ ] **Step 1: 실패하는 HTTP 시험을 쓴다**

`MetaFeedVersionedHttpTest` 는 `MetaFeedOasisHttpTest` 와 같은 틀(같은 어노테이션·`@TempDir`·`DynamicPropertySource`·`post`·`body`·`result`·`item`·`effectiveClientKey`)을 쓴다. DB 파일 이름만 `mdm-feed-versioned-test.db` 로 한다. 아래는 이 작업의 시험과 보조 메서드다.

```java
package com.dongkuk.dmes.mdm.feed;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.cfg.JsonNodeFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import javax.sql.DataSource;
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
 * D-154 — {@code metaFeed/view} 의 {@code part=TOC|BODY}·{@code at}(스펙 2026-10-03-mdm-meta-cache-per-version §4.1·§4.2). 목차는 RELEASED
 * 버전 목록(ver scale 3 number)과 {@code at} 시각의 본문 하나({@code current}), 본문은 (키, ver) 쌍마다 하나다. 본문 값은 {@code part} 없는 응답의
 * 목록 원소와 같아야 한다.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + MetaFeedVersionedHttpTest.TEST_CLIENT_KEY)
@ActiveProfiles("local")
class MetaFeedVersionedHttpTest {

    static final String TEST_CLIENT_KEY = "mdm-feed-versioned-test-key";
    private static final String Q = "QLTY_GRD_JDG";

    @TempDir
    static Path tempDir;

    @LocalServerPort
    int port;

    @Autowired
    DataSource dataSource;

    private final HttpClient client = HttpClient.newHttpClient();
    private final ObjectMapper json = JsonMapper.builder()
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .disable(JsonNodeFeature.STRIP_TRAILING_BIGDECIMAL_ZEROES)
            .build();
    private JdbcTemplate jdbc;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-feed-versioned-test.db");
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

    /** 룰 세 버전: 1.000(SQLite INTEGER) [2026-01-01, 2026-07-01), 1.001(REAL) [2026-07-01, 2027-01-01), 2.000 DRAFT. */
    private void seedRule() {
        DmeTestSupport.sampleRule(jdbc);
        jdbc.update("UPDATE TB_MDM_RULE_VER SET APPLY_TO = '2026-07-01 00:00:00' WHERE MARU_RULE_ID = ? AND VER = 1", Q);
        DmeTestSupport.released(jdbc, Q, new BigDecimal("1.001"), "MINOR", "FIRST", "2026-07-01 00:00:00", "2027-01-01 00:00:00");
        DmeTestSupport.sampleDefinition(jdbc, Q, new BigDecimal("1.001"));
    }

    // ------------------------------------------------------------------ RULE

    @Test
    void RULE_목차는_RELEASED_버전을_ver_순_scale_3_으로_주고_at_시각의_본문을_current_로_싣는다() throws Exception {
        seedRule();
        JsonNode legacy = item(view("RULE", Q), Q);

        JsonNode r = toc("RULE", "2026-08-01T00:00:00", Q, "NO_RULE");

        assertEquals("TOC", r.path("part").asText(), r.toString());
        assertEquals(1, r.path("items").size(), "없는 룰은 빠진다: " + r);
        JsonNode it = r.path("items").get(0);
        JsonNode versions = it.path("value").path("versions");
        assertEquals(2, versions.size(), versions.toString());
        assertEquals("1.000", versions.get(0).path("ver").decimalValue().toPlainString(), "INTEGER 로 저장된 1 도 scale 3");
        assertEquals("1.001", versions.get(1).path("ver").decimalValue().toPlainString());
        assertEquals("RELEASED", versions.get(1).path("status").asText());
        assertEquals("2026-07-01T00:00:00", versions.get(1).path("applyFrom").asText());
        assertTrue(it.path("value").path("header").isNull(), "룰 목차의 header 는 null");
        assertEquals("1.001", it.path("current").path("ver").asText());
        assertEquals(legacy.get(1), it.path("current").path("value"), "current 본문 = part 없는 목록의 그 원소");
    }

    @Test
    void RULE_at_이_없거나_적용_버전이_없으면_current_는_null_이다() throws Exception {
        seedRule();
        assertTrue(toc("RULE", null, Q).path("items").get(0).path("current").isNull());
        assertTrue(toc("RULE", "2025-01-01T00:00:00", Q).path("items").get(0).path("current").isNull(), "룰은 소급하지 않는다");
    }

    @Test
    void RULE_본문은_키_ver_쌍마다_주고_ver_는_scale_3_으로_되돌린다() throws Exception {
        seedRule();
        JsonNode legacy = item(view("RULE", Q), Q);

        JsonNode r = bodies("RULE", Q, "1", Q, "1.001", Q, "1.000");

        assertEquals("BODY", r.path("part").asText(), r.toString());
        assertEquals(2, r.path("items").size(), "1 과 1.000 은 같은 쌍이라 하나: " + r);
        assertEquals("1.000", r.path("items").get(0).path("ver").asText());
        assertEquals(legacy.get(0), r.path("items").get(0).path("value"));
        assertEquals("1.001", r.path("items").get(1).path("ver").asText());
        assertEquals(legacy.get(1), r.path("items").get(1).path("value"));
        assertEquals(0, r.path("failed").size());
    }

    @Test
    void RULE_본문_RELEASED_가_아닌_ver_와_없는_룰은_NOT_RELEASED_형식이_틀린_ver_는_INVALID_VER_이고_묶음은_거부하지_않는다() throws Exception {
        seedRule();
        DmeTestSupport.draft(jdbc, Q, new BigDecimal("2.000"));

        JsonNode r = bodies("RULE", Q, "2.000", "NO_RULE", "1.000", Q, "x.y", Q, "1.000");

        assertEquals(1, r.path("items").size(), r.toString());
        assertEquals(3, r.path("failed").size(), r.toString());
        assertEquals("NOT_RELEASED", failed(r, Q, "2.000").path("message").asText());
        assertEquals("NOT_RELEASED", failed(r, "NO_RULE", "1.000").path("message").asText());
        assertEquals("INVALID_VER", failed(r, Q, "x.y").path("message").asText());
    }

    // ------------------------------------------------------------------ 공통

    @Test
    void COLUMN_DOMAIN_은_part_를_무시하고_지금_응답을_준다() throws Exception {
        seedRule();
        JsonNode plain = view("COLUMN", "COIL_THK");
        JsonNode withPart = result(post(body(json.createObjectNode().put("type", "COLUMN").put("part", "TOC"), "COIL_THK")));
        assertEquals(plain, withPart);
        assertTrue(withPart.path("part").isMissingNode());
    }

    @Test
    void part_at_형식_오류와_키_500개_초과만_묶음을_거부한다() throws Exception {
        JsonNode badPart = post(body(json.createObjectNode().put("type", "RULE").put("part", "XYZ"), Q));
        assertFalse(badPart.path("meta").path("success").asBoolean(true), badPart.toString());
        assertTrue(badPart.path("meta").path("message").asText().startsWith(MdmErrorCode.INVALID_INPUT.defaultMessage()));
        JsonNode badAt = post(body(json.createObjectNode().put("type", "RULE").put("part", "TOC").put("at", "2026/10/03"), Q));
        assertFalse(badAt.path("meta").path("success").asBoolean(true), badAt.toString());
        ObjectNode many = json.createObjectNode();
        many.putObject("meta").put("menuId", "metaFeed");
        many.putObject("params").put("type", "RULE").put("part", "BODY");
        ArrayNode rows = many.putObject("grids").putObject("keys").putArray("rows");
        for (int i = 0; i < 501; i++) {
            rows.addObject().put("key", "R" + i).put("ver", "1.000");
        }
        assertFalse(post(many).path("meta").path("success").asBoolean(true));
    }

    @Test
    void 키가_없으면_part_를_되울린_빈_결과다() throws Exception {
        JsonNode r = toc("RULE", null);
        assertEquals("TOC", r.path("part").asText());
        assertEquals(0, r.path("items").size());
        assertEquals(0, r.path("failed").size());
    }

    // ------------------------------------------------------------------ 보조

    JsonNode toc(String type, String at, String... keys) throws IOException, InterruptedException {
        ObjectNode params = json.createObjectNode().put("type", type).put("part", "TOC");
        if (at != null) {
            params.put("at", at);
        }
        return result(post(body(params, keys)));
    }

    /** {@code keyVers} 는 키·ver 를 번갈아 적는다. */
    JsonNode bodies(String type, String... keyVers) throws IOException, InterruptedException {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", "metaFeed");
        body.putObject("params").put("type", type).put("part", "BODY");
        ArrayNode rows = body.putObject("grids").putObject("keys").putArray("rows");
        for (int i = 0; i < keyVers.length; i += 2) {
            rows.addObject().put("key", keyVers[i]).put("ver", keyVers[i + 1]);
        }
        return result(post(body));
    }

    JsonNode view(String type, String... keys) throws IOException, InterruptedException {
        return result(post(body(json.createObjectNode().put("type", type), keys)));
    }

    static JsonNode failed(JsonNode result, String key, String ver) {
        for (JsonNode f : result.path("failed")) {
            if (key.equals(f.path("key").asText()) && ver.equals(f.path("ver").asText())) {
                return f;
            }
        }
        throw new AssertionError("failed 에 없다: " + key + "@" + ver + " in " + result);
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

    JsonNode post(ObjectNode body) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/oasis/metaFeed/view"))
                .header("Content-Type", "application/json")
                .header("X-Client-Key", effectiveClientKey())
                .header("X-Authenticated-User", "system:mls")
                .header("X-Authenticated-Role", "SYSTEM")
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

`DmeTestSupport.draft(jdbc, id, ver)` 가 없으면 `DmeTestSupport` 의 버전 INSERT(`released` 의 몸체)를 기준으로 `STATUS='DRAFT', APPLY_FROM/APPLY_TO NULL, OWNER_ID='kim'` 인 `draft(JdbcTemplate, String, BigDecimal)` 를 같은 파일에 더한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mdm.feed.MetaFeedVersionedHttpTest'`
Expected: FAIL — 응답에 `part` 가 없고 TOC 대신 전 이력 목록이 온다(Task 1 실측이 "거부"였다면 `meta.success=false`).

- [ ] **Step 3: 요청 DTO 에 칸을 더한다**

```java
package com.dongkuk.dmes.mdm.feed.metaFeed.dto;

/**
 * metaFeed action=view params — 대상 종류 하나(COLUMN·DOMAIN·RULE·RULE_SET·CODE·LAYOUT). 키는 grids.keys.rows[{key}](BODY 는 [{key, ver}]).
 * {@code part}(TOC·BODY)·{@code at}(KST {@code yyyy-MM-ddTHH:mm:ss})은 D-154 — 없으면 지금 응답(전 이력)이다. COLUMN·DOMAIN 은 part 를 무시한다.
 */
public class MetaFeedViewRequest {

    private String type;
    private String systemCode;
    private String part;
    private String at;

    public String getType() { return type; }
    public String getSystemCode() { return systemCode; }
    public String getPart() { return part; }
    public String getAt() { return at; }
    public void setType(String v) { this.type = v; }
    public void setSystemCode(String v) { this.systemCode = v; }
    public void setPart(String v) { this.part = v; }
    public void setAt(String v) { this.at = v; }
}
```

- [ ] **Step 4: `MetaFeedPart`·`MetaFeedVersionSelect`·`MetaFeedVersionedResult` 를 만든다**

```java
package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import com.dongkuk.dmes.mdm.common.metarev.MetaTargetType;
import java.util.Locale;

/** metaFeed view 의 {@code part}(D-154, 스펙 §4.1). COLUMN·DOMAIN 은 버전이 없어 늘 NONE 이다(응답에도 part 를 싣지 않는다). */
public enum MetaFeedPart {
    NONE, TOC, BODY;

    static MetaFeedPart of(String text, MetaTargetType type) {
        if (type == MetaTargetType.COLUMN || type == MetaTargetType.DOMAIN || text == null || text.isBlank()) {
            return NONE;
        }
        return switch (text.trim().toUpperCase(Locale.ROOT)) {
            case "TOC" -> TOC;
            case "BODY" -> BODY;
            default -> throw MetaFeedService.invalid("part 는 TOC·BODY 중 하나여야 합니다: " + text);
        };
    }
}
```

```java
package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;

/**
 * MDM 쪽 {@code current} 버전 고르기(D-154, 스펙 §3.2·§4.1) — 룰·룰 세트·전문 규칙: RELEASED 중 {@code applyFrom <= at < applyTo}(applyFrom null 제외,
 * applyTo null 은 열린 끝), 여럿이면 ver 최대, 소급 없음. cactus {@code MdmDefinitionLookup.select} 와 같은 규칙이고, 고른 결과는 cactus 가 목차로
 * 다시 확인한다. 코드는 엔진 {@code CodeVersions.select} 를 쓴다.
 */
final class MetaFeedVersionSelect {

    private MetaFeedVersionSelect() {
    }

    static <T> Optional<T> releasedAt(List<T> released, Function<T, BigDecimal> ver, Function<T, LocalDateTime> from,
                                      Function<T, LocalDateTime> to, LocalDateTime at) {
        if (at == null) {
            return Optional.empty();
        }
        return released.stream()
                .filter(d -> from.apply(d) != null && !from.apply(d).isAfter(at) && (to.apply(d) == null || at.isBefore(to.apply(d))))
                .max(Comparator.comparing(ver));
    }
}
```

```java
package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * view {@code part=TOC|BODY} 의 결과(D-154, 스펙 §4.1). TOC: {@code {part, items:[{key, value, current}], failed:[{key, message}]}},
 * BODY: {@code {part, items:[{key, ver, value}], failed:[{key, ver, message}]}}. ver 는 늘 scale 3 문자열이다({@link VersionNumbers#plain}).
 */
public record MetaFeedVersionedResult(String part, List<Map<String, Object>> items, List<Map<String, Object>> failed) {

    public Map<String, Object> toResponse() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("part", part);
        out.put("items", items);
        out.put("failed", failed);
        return out;
    }

    static Builder builder(MetaFeedPart part) {
        return new Builder(part.name());
    }

    static final class Builder {

        private final String part;
        private final List<Map<String, Object>> items = new ArrayList<>();
        private final List<Map<String, Object>> failed = new ArrayList<>();

        private Builder(String part) {
            this.part = part;
        }

        /** @param current {@link #current} 결과, 없으면 null */
        Builder toc(String key, Map<String, Object> toc, Map<String, Object> current) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("key", key);
            row.put("value", toc);
            row.put("current", current);
            items.add(row);
            return this;
        }

        Builder tocFailed(String key, String message) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("key", key);
            row.put("message", message);
            failed.add(row);
            return this;
        }

        Builder body(MetaFeedService.BodyKey key, Object value) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("key", key.key());
            row.put("ver", VersionNumbers.plain(key.ver()));
            row.put("value", value);
            items.add(row);
            return this;
        }

        Builder bodyFailed(MetaFeedService.BodyKey key, String message) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("key", key.key());
            row.put("ver", key.ver() == null ? key.rawVer() : VersionNumbers.plain(key.ver()));
            row.put("message", message);
            failed.add(row);
            return this;
        }

        MetaFeedVersionedResult build() {
            return new MetaFeedVersionedResult(part, items, failed);
        }
    }

    /** 목차 값 {@code {header, versions:[{ver, status, applyFrom, applyTo}]}} — ver 는 scale 3 BigDecimal(JSON number), 시각은 ISO 문자열. */
    static Map<String, Object> toc(Object header, List<Map<String, Object>> versions) {
        Map<String, Object> toc = new LinkedHashMap<>();
        toc.put("header", header);
        toc.put("versions", versions);
        return toc;
    }

    static Map<String, Object> tocVersion(java.math.BigDecimal ver, String status, java.time.LocalDateTime applyFrom,
                                          java.time.LocalDateTime applyTo) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("ver", VersionNumbers.scaled(ver));
        row.put("status", status);
        row.put("applyFrom", MetaFeedJson.plain(applyFrom));
        row.put("applyTo", MetaFeedJson.plain(applyTo));
        return row;
    }

    static Map<String, Object> current(java.math.BigDecimal ver, Object body) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("ver", VersionNumbers.plain(ver));
        row.put("value", body);
        return row;
    }
}
```

정리할 때 `java.math.BigDecimal`·`java.time.LocalDateTime` 은 import 로 올린다.

- [ ] **Step 5: 룰 조립을 메서드로 꺼낸다**

`MetaFeedDefinitions.rules` 의 루프 몸체를 아래 메서드로 옮기고 `rules` 는 이것을 부른다(동작 불변 — 골든 시험이 지킨다).

```java
    /** RELEASED 룰 버전 하나의 정의(D-154 — 피드 전 이력·목차 current·본문이 같은 조립을 쓴다). 저장값이 깨지면 IllegalStateException. */
    RuleDefinition assembleRule(String id, MdmRule rule, MdmRuleVer v, RuleVarTypeResolver.Scope scope) {
        StoredRuleDefinitions.Stored s = stored.read(id, v, scope);
        RuleDefinitionAssembler.Assembled a = stored.assemble(id, rule.getRuleKind(), s, scope);
        if (!a.failures().isEmpty() || !a.skippedRows().isEmpty()) {
            throw new IllegalStateException("룰 " + id + " 버전 " + v.getVer() + " 의 저장된 행을 조립할 수 없습니다");
        }
        return a.definition();
    }

    /** RELEASED·적용 시작 있는 룰 버전, ver 오름차순. */
    List<MdmRuleVer> releasedRuleVersions(String id) {
        return ruleQueries.versions(id).stream()
                .filter(v -> RELEASED.equals(v.getStatus()) && v.getApplyFrom() != null)
                .sorted(Comparator.comparing(MdmRuleVer::getVer))
                .toList();
    }

    RuleVarTypeResolver.Scope ruleScope() {
        return stored.scope();
    }

    Optional<MdmRule> rule(String id) {
        return rules.findById(id);
    }
```

`rules(...)` 의 루프는 `for (MdmRuleVer v : releasedRuleVersions(id)) released.add(assembleRule(id, rule.get(), v, scope));` 로 바꾸고, 뒤의 `released.sort(...)` 는 이미 정렬되어 있으므로 지운다.

- [ ] **Step 6: `MetaFeedVersioned` 를 만든다(룰만)**

```java
package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.metarev.MetaTargetType;
import com.dongkuk.dmes.mdm.common.rule.RuleVarTypeResolver;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * 메타 피드 목차·본문(D-154, 스펙 2026-10-03-mdm-meta-cache-per-version §4.1·§4.2). 본문 값은 {@code part} 없는 응답의 목록 원소와 같은 조립을
 * 쓴다({@link MetaFeedDefinitions}). 목차와 {@code current} 본문은 같은 읽기 트랜잭션에서 만든다(호출자 {@code MetaFeedService.view}).
 */
@Component
public class MetaFeedVersioned {

    static final String NOT_RELEASED = "NOT_RELEASED";
    static final String INVALID_VER = "INVALID_VER";

    private final MetaFeedDefinitions definitions;

    public MetaFeedVersioned(MetaFeedDefinitions definitions) {
        this.definitions = definitions;
    }

    public MetaFeedVersionedResult toc(MetaTargetType type, List<String> keys, LocalDateTime at) {
        MetaFeedVersionedResult.Builder b = MetaFeedVersionedResult.builder(MetaFeedPart.TOC);
        switch (type) {
            case RULE -> rulesToc(keys, at, b);
            default -> throw MetaFeedService.invalid("part=TOC 를 아직 받지 않는 대상입니다: " + type);
        }
        return b.build();
    }

    public MetaFeedVersionedResult bodies(MetaTargetType type, List<MetaFeedService.BodyKey> keys) {
        MetaFeedVersionedResult.Builder b = MetaFeedVersionedResult.builder(MetaFeedPart.BODY);
        switch (type) {
            case RULE -> ruleBodies(keys, b);
            default -> throw MetaFeedService.invalid("part=BODY 를 아직 받지 않는 대상입니다: " + type);
        }
        return b.build();
    }

    private void rulesToc(List<String> ids, LocalDateTime at, MetaFeedVersionedResult.Builder b) {
        RuleVarTypeResolver.Scope scope = definitions.ruleScope();
        for (String id : ids) {
            Optional<MdmRule> rule = definitions.rule(id);
            if (rule.isEmpty()) {
                continue;
            }
            List<MdmRuleVer> released = definitions.releasedRuleVersions(id);
            try {
                Map<String, Object> current = MetaFeedVersionSelect
                        .releasedAt(released, MdmRuleVer::getVer, MdmRuleVer::getApplyFrom, MdmRuleVer::getApplyTo, at)
                        .map(v -> MetaFeedVersionedResult.current(v.getVer(),
                                MetaFeedJson.plain(definitions.assembleRule(id, rule.get(), v, scope))))
                        .orElse(null);
                b.toc(id, MetaFeedVersionedResult.toc(null, released.stream()
                        .map(v -> MetaFeedVersionedResult.tocVersion(v.getVer(), v.getStatus(), v.getApplyFrom(), v.getApplyTo()))
                        .toList()), current);
            } catch (BusinessException | IllegalArgumentException | IllegalStateException e) {
                b.tocFailed(id, e.getMessage());
            }
        }
    }

    private void ruleBodies(List<MetaFeedService.BodyKey> keys, MetaFeedVersionedResult.Builder b) {
        RuleVarTypeResolver.Scope scope = definitions.ruleScope();
        Map<String, Optional<MdmRule>> rules = new HashMap<>();
        Map<String, List<MdmRuleVer>> versions = new HashMap<>();
        for (MetaFeedService.BodyKey k : keys) {
            if (k.ver() == null) {
                b.bodyFailed(k, INVALID_VER);
                continue;
            }
            Optional<MdmRule> rule = rules.computeIfAbsent(k.key(), definitions::rule);
            Optional<MdmRuleVer> v = rule.isEmpty() ? Optional.empty()
                    : versions.computeIfAbsent(k.key(), definitions::releasedRuleVersions).stream()
                            .filter(x -> x.getVer().compareTo(k.ver()) == 0).findFirst();
            if (v.isEmpty()) {
                b.bodyFailed(k, NOT_RELEASED);
                continue;
            }
            try {
                b.body(k, MetaFeedJson.plain(definitions.assembleRule(k.key(), rule.get(), v.get(), scope)));
            } catch (BusinessException | IllegalArgumentException | IllegalStateException e) {
                b.bodyFailed(k, e.getMessage());
            }
        }
    }
}
```

- [ ] **Step 7: `MetaFeedService` 를 분기한다**

생성자에 `MetaFeedVersioned versioned` 를 더하고(필드 `private final MetaFeedVersioned versioned;`), `view` 와 보조 함수를 아래로 바꾼다. 클래스 Javadoc 에 "D-154 — part=TOC·BODY 는 {@link MetaFeedVersioned}" 를 한 줄 더한다.

```java
    public Map<String, Object> view(MetaFeedViewRequest request, List<Map<String, Object>> keys) {
        MetaTargetType type = requireType(request == null ? null : request.getType());
        MetaFeedPart part = MetaFeedPart.of(request.getPart(), type);
        if (part == MetaFeedPart.TOC) {
            List<String> wanted = keyList(type, keys);
            LocalDateTime at = parseAt(request.getAt());
            return readTx.execute(status -> versioned.toc(type, wanted, at)).toResponse();
        }
        if (part == MetaFeedPart.BODY) {
            List<BodyKey> wanted = bodyKeyList(keys);
            return readTx.execute(status -> versioned.bodies(type, wanted)).toResponse();
        }
        List<String> wanted = keyList(type, keys);
        if (wanted.isEmpty()) {
            return MetaFeedResult.empty().toResponse();
        }
        String systemCode = request.getSystemCode();
        return readTx.execute(status -> fetch(type, wanted, systemCode)).toResponse();
    }

    /** BODY 키 한 줄 — {@code ver} 가 null 이면 형식이 틀린 버전({@code rawVer} 가 원문)이다. 그 키만 failed(INVALID_VER)로 돌린다. */
    public record BodyKey(String key, BigDecimal ver, String rawVer) {
    }

    /** grids.keys.rows 의 {key, ver} — 공백 제거, (key, 수로 비교한 ver) 쌍으로 중복 제거, 최대 {@link #MAX_KEYS}. keyList 와 달리 같은 키의 여러 버전을 지킨다. */
    static List<BodyKey> bodyKeyList(List<Map<String, Object>> rows) {
        Map<String, BodyKey> out = new LinkedHashMap<>();
        if (rows != null) {
            for (Map<String, Object> row : rows) {
                Object k = row == null ? null : row.get("key");
                if (k == null || String.valueOf(k).isBlank()) {
                    continue;
                }
                String key = String.valueOf(k).trim();
                Object v = row.get("ver");
                String raw = v == null ? "" : String.valueOf(v).trim();
                BigDecimal ver;
                try {
                    ver = VersionNumbers.parse(raw);
                } catch (IllegalArgumentException e) {
                    ver = null;
                }
                String dedupe = key + '\u0000' + (ver == null ? "?" + raw : ver.toPlainString());
                out.putIfAbsent(dedupe, new BodyKey(key, ver, raw));
            }
        }
        if (out.size() > MAX_KEYS) {
            throw invalid("키는 한 번에 " + MAX_KEYS + "개까지 받습니다: " + out.size());
        }
        return List.copyOf(out.values());
    }

    /** {@code at} — 비면 null(current 를 싣지 않는다). KST {@code yyyy-MM-ddTHH:mm:ss}, 초 미만은 자른다. 형식이 틀리면 입력 오류(묶음 거부). */
    static LocalDateTime parseAt(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        try {
            return LocalDateTime.parse(text.trim()).truncatedTo(ChronoUnit.SECONDS);
        } catch (DateTimeParseException e) {
            throw invalid("at 은 yyyy-MM-ddTHH:mm:ss 형식이어야 합니다: " + text);
        }
    }
```

import 를 더한다: `java.math.BigDecimal`, `java.time.LocalDateTime`, `java.time.format.DateTimeParseException`, `java.time.temporal.ChronoUnit`, `com.dongkuk.dmes.mdm.common.version.VersionNumbers`.

- [ ] **Step 8: 시험을 돌린다**

Run: `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mdm.feed.*'`
Expected: PASS(`MetaFeedVersionedHttpTest`·`MetaFeedLegacyGoldenTest`·`MetaFeedOasisHttpTest`·`MdmMetaFeedContractHttpTest`). 골든이 깨지면 이 작업의 변경이 `part` 없는 경로를 건드린 것이다 — 골든을 다시 만들지 말고 코드를 고친다.

- [ ] **Step 9: 커밋**

```bash
/usr/bin/git add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/feed/metaFeed src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/feed/MetaFeedVersionedHttpTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/DmeTestSupport.java
/usr/bin/git commit -m "feat(mdm): 메타 피드 view 에 part=TOC|BODY 와 at 을 더하고 룰 목차·본문을 준다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: MDM 피드 — 룰 세트(RULE_SET)·전문(LAYOUT) 목차·본문

스펙 §3.5·§3.6·§4.2「룰 세트」「전문」. 1차는 `StoredDefinitionLookup.releasedSets(id)`·`LayoutReleaseTimeline.released(id)` 에서 ver 로 고른다(새 단건 메서드 없음). 전문 키 규칙(숫자가 아니거나 헤더·없는 ID 는 없음)은 지금과 같다.

**Files:**
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/feed/metaFeed/service/MetaFeedVersioned.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/feed/metaFeed/service/MetaFeedDefinitions.java:101-179`(세트 목록·전문 키·전문 버전 행을 메서드로 꺼낸다)
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/feed/MetaFeedVersionedHttpTest.java`

**Interfaces:**
- Consumes: Task 5 의 `MetaFeedVersionedResult`·`MetaFeedVersionSelect`·`BodyKey`.
- Produces: `MetaFeedDefinitions.releasedSets(String id) : Optional<List<RuleSetDefinition>>`(StoredDefinitionException 그대로 던짐), `MetaFeedDefinitions.messageLayoutId(String key) : Optional<Long>`, `static Map<String, Object> layoutVersion(LayoutReleaseTimeline.ReleasedVersion v)`, `MetaFeedDefinitions.releasedLayouts(long id) : List<LayoutReleaseTimeline.ReleasedVersion>`.

- [ ] **Step 1: 실패하는 시험을 더한다**

`MetaFeedVersionedHttpTest` 에 더한다. 전문 시드 보조(`layoutVer`·`stack`)는 Task 1 의 골든 시험과 같은 INSERT 를 쓴다.

```java
    // ------------------------------------------------------------------ RULE_SET

    /** 세트 두 버전: 1.000 [2000-01-01, 2026-07-01), 1.001 [2026-07-01, 9999-12-31) — 버전마다 ruleIds 를 달리 해 내용으로 가른다. */
    private void seedSet() {
        DmeTestSupport.ruleSet(jdbc, "VS_SET", "버전 세트", "[\"" + Q + "\"]", "CREATED", 0);
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET APPLY_TO = '2026-07-01 00:00:00' WHERE MARU_RULE_SET_ID = 'VS_SET' AND VER = 1");
        DmeTestSupport.ruleSetVersion(jdbc, "VS_SET", "1.001", "MINOR", "RELEASED", null, "[\"" + Q + "\",\"R2\"]",
                "2026-07-01 00:00:00", "9999-12-31 00:00:00", 0);
        DmeTestSupport.ruleSetDraft(jdbc, "VS_SET", "2.000", "kim", "[\"DRAFT_R\"]", 0);
    }

    @Test
    void RULE_SET_목차와_current_와_본문은_part_없는_목록_원소와_같다() throws Exception {
        seedSet();
        JsonNode legacy = item(view("RULE_SET", "VS_SET"), "VS_SET");

        JsonNode t = toc("RULE_SET", "2026-08-01T00:00:00", "VS_SET", "NO_SET");
        assertEquals(1, t.path("items").size(), t.toString());
        JsonNode versions = t.path("items").get(0).path("value").path("versions");
        assertEquals(2, versions.size(), "DRAFT 2.000 은 빠진다: " + versions);
        assertEquals("1.001", t.path("items").get(0).path("current").path("ver").asText());
        assertEquals(legacy.get(1), t.path("items").get(0).path("current").path("value"));
        assertEquals("INUSE", t.path("items").get(0).path("current").path("value").path("status").asText(), "부모 계산 상태는 본문에 남는다");

        JsonNode b = bodies("RULE_SET", "VS_SET", "1.000", "VS_SET", "2.000");
        assertEquals(legacy.get(0), b.path("items").get(0).path("value"));
        assertEquals("NOT_RELEASED", failed(b, "VS_SET", "2.000").path("message").asText());
    }

    // ------------------------------------------------------------------ LAYOUT

    private void seedLayouts() {
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_HEADER WHERE LAYOUT_ID IN (9601, 9603, 9690, 9691)");
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID IN (9601, 9603, 9690, 9691)");
        jdbc.update("DELETE FROM TB_MDM_LAYOUT WHERE LAYOUT_ID IN (9601, 9603, 9690, 9691)");
        jdbc.update("INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, STATUS, VER) VALUES "
                + "(9690, 'HEADER', '버전 헤더', 'INUSE', 0), (9691, 'HEADER', '초안 헤더', 'CREATED', 0), "
                + "(9601, 'MESSAGE', '버전 전문', 'INUSE', 0), (9603, 'MESSAGE', '깨진 전문', 'INUSE', 0)");
        layoutVer(9690, "1.000", "RELEASED", "2000-01-01 00:00:00", "9999-12-31 00:00:00", 7);
        layoutVer(9691, "1.000", "DRAFT", null, null, 3);
        layoutVer(9601, "1.000", "RELEASED", "2000-01-01 00:00:00", "2026-07-01 00:00:00", 10);
        layoutVer(9601, "2.000", "RELEASED", "2026-07-01 00:00:00", "9999-12-31 00:00:00", 12);
        layoutVer(9603, "1.000", "RELEASED", "2000-01-01 00:00:00", "9999-12-31 00:00:00", 4);
        stack(9601, "1.000", 9690);
        stack(9601, "2.000", 9690);
        stack(9603, "1.000", 9691);
    }

    @Test
    void LAYOUT_목차와_current_와_본문은_part_없는_목록_원소와_같고_합성이_깨진_전문은_그_키만_failed_다() throws Exception {
        seedLayouts();
        JsonNode legacy = item(view("LAYOUT", "9601"), "9601");

        JsonNode t = toc("LAYOUT", "2026-08-01T00:00:00", "9601", "9603", "9690", "abc");
        assertEquals(1, t.path("items").size(), "헤더·숫자 아닌 키는 빠진다: " + t);
        assertEquals(1, t.path("failed").size(), t.toString());
        assertEquals("9603", t.path("failed").get(0).path("key").asText());
        JsonNode it = t.path("items").get(0);
        assertEquals("2.000", it.path("value").path("versions").get(1).path("ver").decimalValue().toPlainString());
        assertEquals("2.000", it.path("current").path("ver").asText());
        assertEquals(legacy.get(1), it.path("current").path("value"), "전문 본문 = 목록 원소(ver 문자열·segments 포함)");

        JsonNode b = bodies("LAYOUT", "9601", "1.000", "abc", "1.000", "9601", "3.000");
        assertEquals(1, b.path("items").size(), b.toString());
        assertEquals(legacy.get(0), b.path("items").get(0).path("value"));
        assertEquals("NOT_RELEASED", failed(b, "abc", "1.000").path("message").asText());
        assertEquals("NOT_RELEASED", failed(b, "9601", "3.000").path("message").asText());
    }

    private void layoutVer(long id, String ver, String status, String from, String to, int own) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, OWN_LENGTH) "
                + "VALUES (?, ?, 'MAJOR', ?, ?, ?, ?, ?)", id, new BigDecimal(ver), status, "DRAFT".equals(status) ? "kim" : null,
                from, to, own);
    }

    private void stack(long messageId, String ver, long headerId) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_HEADER (LAYOUT_ID, VER, SEQ, HEADER_LAYOUT_ID) VALUES (?, ?, 1, ?)",
                messageId, new BigDecimal(ver), headerId);
    }
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mdm.feed.MetaFeedVersionedHttpTest'`
Expected: 새 두 시험이 FAIL — `part=TOC 를 아직 받지 않는 대상입니다: RULE_SET`(MDM021).

- [ ] **Step 3: `MetaFeedDefinitions` 에서 재사용할 메서드를 꺼낸다**

```java
    /** 세트의 RELEASED 버전 정의(ver 오름차순). 세트가 없으면 빈 값. 저장값이 깨지면 StoredDefinitionException. */
    Optional<List<RuleSetDefinition>> releasedSets(String id) {
        return new StoredDefinitionLookup(ruleQueries, stored, rules, setVersions, sets).releasedSets(id);
    }

    /** MESSAGE 전문 키 → ID. 숫자가 아니거나 없는 ID·헤더면 빈 값(Ruling R9). */
    Optional<Long> messageLayoutId(String key) {
        Long id;
        try {
            id = Long.valueOf(key.trim());
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
        boolean message = layouts.findById(id).map(l -> MESSAGE.equals(l.getLayoutKind())).orElse(false);
        return message ? Optional.of(id) : Optional.empty();
    }

    List<LayoutReleaseTimeline.ReleasedVersion> releasedLayouts(long id) {
        return timeline.released(id);
    }

    /** 전문 RELEASED 버전 하나의 피드 값 — {@code {ver:"1.000", applyFrom, applyTo, segments[{applyFrom, applyTo, snapshot}]}}. */
    static Map<String, Object> layoutVersion(LayoutReleaseTimeline.ReleasedVersion v) {
        List<Object> segments = new ArrayList<>();
        for (LayoutReleaseTimeline.Segment s : v.segments()) {
            Map<String, Object> seg = new LinkedHashMap<>();
            seg.put("applyFrom", MetaFeedJson.plain(s.applyFrom()));
            seg.put("applyTo", MetaFeedJson.plain(s.applyTo()));
            seg.put("snapshot", MetaFeedJson.plain(s.snapshot()));
            segments.add(seg);
        }
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("ver", VersionNumbers.plain(v.ver()));
        row.put("applyFrom", MetaFeedJson.plain(v.applyFrom()));
        row.put("applyTo", MetaFeedJson.plain(v.applyTo()));
        row.put("segments", segments);
        return row;
    }
```

`ruleSets(...)` 는 `releasedSets(id)` 를, `layouts(...)` 는 `messageLayoutId(key)` 와 `releasedLayouts(id)` 를, `layoutVersions(...)` 는 `layoutVersion(v)` 를 부르게 바꾼다(동작 불변).

- [ ] **Step 4: `MetaFeedVersioned` 에 두 대상을 더한다**

`toc`·`bodies` 의 switch 에 `case RULE_SET -> setsToc(keys, at, b);`·`case LAYOUT -> layoutsToc(keys, at, b);` 와 BODY 쪽 `case RULE_SET -> setBodies(keys, b);`·`case LAYOUT -> layoutBodies(keys, b);` 를 더한다.

```java
    private void setsToc(List<String> ids, LocalDateTime at, MetaFeedVersionedResult.Builder b) {
        for (String id : ids) {
            try {
                Optional<List<RuleSetDefinition>> released = definitions.releasedSets(id);
                if (released.isEmpty()) {
                    continue;
                }
                List<RuleSetDefinition> list = released.get();
                Map<String, Object> current = MetaFeedVersionSelect
                        .releasedAt(list, RuleSetDefinition::ver, RuleSetDefinition::applyFrom, RuleSetDefinition::applyTo, at)
                        .map(d -> MetaFeedVersionedResult.current(d.ver(), MetaFeedJson.plain(d)))
                        .orElse(null);
                b.toc(id, MetaFeedVersionedResult.toc(null, list.stream()
                        .map(d -> MetaFeedVersionedResult.tocVersion(d.ver(), RELEASED, d.applyFrom(), d.applyTo())).toList()), current);
            } catch (StoredDefinitionException e) {
                b.tocFailed(id, e.getMessage());
            }
        }
    }

    private void setBodies(List<MetaFeedService.BodyKey> keys, MetaFeedVersionedResult.Builder b) {
        Map<String, Object> memo = new HashMap<>(); // id → List<RuleSetDefinition> 또는 실패 메시지(String)
        for (MetaFeedService.BodyKey k : keys) {
            if (k.ver() == null) {
                b.bodyFailed(k, INVALID_VER);
                continue;
            }
            Object loaded = memo.computeIfAbsent(k.key(), id -> {
                try {
                    return definitions.releasedSets(id).orElse(List.of());
                } catch (StoredDefinitionException e) {
                    return e.getMessage();
                }
            });
            if (loaded instanceof String message) {
                b.bodyFailed(k, message);
                continue;
            }
            @SuppressWarnings("unchecked")
            Optional<RuleSetDefinition> hit = ((List<RuleSetDefinition>) loaded).stream()
                    .filter(d -> d.ver().compareTo(k.ver()) == 0).findFirst();
            if (hit.isEmpty()) {
                b.bodyFailed(k, NOT_RELEASED);
            } else {
                b.body(k, MetaFeedJson.plain(hit.get()));
            }
        }
    }

    private void layoutsToc(List<String> keys, LocalDateTime at, MetaFeedVersionedResult.Builder b) {
        for (String key : keys) {
            Optional<Long> id = definitions.messageLayoutId(key);
            if (id.isEmpty()) {
                continue;
            }
            try {
                List<LayoutReleaseTimeline.ReleasedVersion> released = definitions.releasedLayouts(id.get());
                Map<String, Object> current = MetaFeedVersionSelect
                        .releasedAt(released, LayoutReleaseTimeline.ReleasedVersion::ver, LayoutReleaseTimeline.ReleasedVersion::applyFrom,
                                LayoutReleaseTimeline.ReleasedVersion::applyTo, at)
                        .map(v -> MetaFeedVersionedResult.current(v.ver(), MetaFeedDefinitions.layoutVersion(v)))
                        .orElse(null);
                b.toc(key, MetaFeedVersionedResult.toc(null, released.stream()
                        .map(v -> MetaFeedVersionedResult.tocVersion(v.ver(), RELEASED, v.applyFrom(), v.applyTo())).toList()), current);
            } catch (BusinessException | IllegalArgumentException | IllegalStateException e) {
                b.tocFailed(key, e.getMessage());
            }
        }
    }

    private void layoutBodies(List<MetaFeedService.BodyKey> keys, MetaFeedVersionedResult.Builder b) {
        Map<String, Object> memo = new HashMap<>(); // 키 → List<ReleasedVersion> 또는 실패 메시지(String)
        for (MetaFeedService.BodyKey k : keys) {
            if (k.ver() == null) {
                b.bodyFailed(k, INVALID_VER);
                continue;
            }
            Object loaded = memo.computeIfAbsent(k.key(), key -> {
                Optional<Long> id = definitions.messageLayoutId(key);
                if (id.isEmpty()) {
                    return List.of();
                }
                try {
                    return definitions.releasedLayouts(id.get());
                } catch (BusinessException | IllegalArgumentException | IllegalStateException e) {
                    return e.getMessage() == null ? e.toString() : e.getMessage();
                }
            });
            if (loaded instanceof String message) {
                b.bodyFailed(k, message);
                continue;
            }
            @SuppressWarnings("unchecked")
            Optional<LayoutReleaseTimeline.ReleasedVersion> hit = ((List<LayoutReleaseTimeline.ReleasedVersion>) loaded).stream()
                    .filter(v -> v.ver().compareTo(k.ver()) == 0).findFirst();
            if (hit.isEmpty()) {
                b.bodyFailed(k, NOT_RELEASED);
            } else {
                b.body(k, MetaFeedDefinitions.layoutVersion(hit.get()));
            }
        }
    }
```

상수 `private static final String RELEASED = "RELEASED";` 와 import(`RuleSetDefinition`, `StoredDefinitionException`, `LayoutReleaseTimeline`)를 더한다.

- [ ] **Step 5: 시험을 돌린다**

Run: `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mdm.feed.*'`
Expected: PASS(골든 포함)

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/feed/metaFeed src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/feed/MetaFeedVersionedHttpTest.java
/usr/bin/git commit -m "feat(mdm): 메타 피드에 룰 세트·전문 목차와 버전 본문을 더한다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: MDM 피드 — 코드(CODE) 목차·본문(투영 → 자르기)

스펙 §3.3·§4.2「코드」. 목차는 헤더와 버전 표만 읽는다(RELEASED 필터 = 투영 결과). 본문은 원장 다섯 표 → `CodeRowsProjection.releasedOnly` → `CodeVersionSlicer.slice` 이고, 한 요청에 같은 코드의 버전이 여럿이면 읽기·투영은 한 번만 한다. `current` 는 엔진 `CodeVersions.select` 로 고르므로 RELEASED 가 하나라도 있으면 `at` 이 있을 때 늘 있다(소급). 이 작업으로 네 대상의 TOC·BODY 가 다 채워지므로 "아직 받지 않는 대상" 분기를 지운다.

**Files:**
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/feed/metaFeed/service/MetaFeedVersioned.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/feed/metaFeed/service/MetaFeedDefinitions.java`(원장 쿼리 접근자)
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/feed/MetaFeedVersionedHttpTest.java`

**Interfaces:**
- Consumes: Task 2 `CodeVersions.select`, Task 3 `CodeVersionSlicer.slice`, 기존 `CodeRowsProjection.releasedOnly`, `MdmCodeLookup`, `MasterCodeLedgerQueries.header(id)`·`versions(id)`.
- Produces: CODE 목차 값 `{header:{maruCodeId, status}, versions:[…]}`, CODE 본문 값 = `CodeVersionSlice` JSON. `MetaFeedDefinitions.ledger() : MasterCodeLedgerQueries`(package-private).

- [ ] **Step 1: 실패하는 시험을 더한다**

```java
    // ------------------------------------------------------------------ CODE

    /**
     * 코드 VS_CD: RELEASED 1.000 [2026-01-01, 2026-04-01)·1.001(REAL) [2026-04-01, 2026-07-01)·2.000(INTEGER) [2026-07-01, 열린 끝), DRAFT 2.001.
     * items A(1.000~), B(1.001~), C(2.001~ 초안). TABLE TB(1.001~): B.
     */
    private void seedCode() {
        MasterCodeSeeds seeds = new MasterCodeSeeds(jdbc);
        seeds.seedCode("VS_CD", "INUSE", "MDM");
        seeds.released("VS_CD", "1.000", "2026-01-01 00:00:00", "2026-04-01 00:00:00");
        seeds.released("VS_CD", "1.001", "2026-04-01 00:00:00", "2026-07-01 00:00:00");
        seeds.released("VS_CD", "2.000", "2026-07-01 00:00:00", MasterCodeSeeds.OPEN_END);
        seeds.draft("VS_CD", "2.001", "kim");
        seeds.seedItem("VS_CD", "A", "1.000", MasterCodeSeeds.OPEN, "에이", 1);
        seeds.seedItem("VS_CD", "B", "1.001", MasterCodeSeeds.OPEN, "비", 2);
        seeds.seedItem("VS_CD", "C", "2.001", MasterCodeSeeds.OPEN, "씨(초안)", 3);
        seeds.seedBase("VS_CD");
        seeds.seedCate("VS_CD", "TB", "1.001", MasterCodeSeeds.OPEN, "TABLE", null, null, "표");
        seeds.seedCateItem("VS_CD", "TB", "B", "1.001", MasterCodeSeeds.OPEN);
    }

    @Test
    void CODE_목차는_헤더와_RELEASED_버전만_scale_3_으로_싣고_current_는_소급까지_엔진_규칙으로_고른다() throws Exception {
        seedCode();
        JsonNode t = toc("CODE", "2025-06-01T00:00:00", "VS_CD", "NO_CD");
        assertEquals(1, t.path("items").size(), t.toString());
        JsonNode value = t.path("items").get(0).path("value");
        assertEquals("VS_CD", value.path("header").path("maruCodeId").asText());
        assertEquals("INUSE", value.path("header").path("status").asText());
        JsonNode versions = value.path("versions");
        assertEquals(3, versions.size(), "DRAFT 2.001 은 빠진다: " + versions);
        assertEquals("1.000", versions.get(0).path("ver").decimalValue().toPlainString());
        assertEquals("1.001", versions.get(1).path("ver").decimalValue().toPlainString());
        assertEquals("2.000", versions.get(2).path("ver").decimalValue().toPlainString(), "INTEGER 로 저장된 2 도 scale 3");
        assertEquals("1.000", t.path("items").get(0).path("current").path("ver").asText(), "첫 적용 전 시각은 첫 버전으로 소급");
    }

    @Test
    void CODE_본문은_엔진_자르기와_같고_소속과_전체_표시를_싣는다() throws Exception {
        seedCode();
        JsonNode b = bodies("CODE", "VS_CD", "1.000", "VS_CD", "2", "VS_CD", "2.001", "NO_CD", "1.000");

        assertEquals(2, b.path("items").size(), b.toString());
        JsonNode v1 = b.path("items").get(0).path("value");
        assertEquals("1.000", b.path("items").get(0).path("ver").asText());
        assertEquals(1, v1.path("items").size(), "1.000 의 items 는 A 하나: " + v1);
        JsonNode tb1 = category(v1, "TB");
        assertEquals(false, tb1.path("all").asBoolean(true), "1.000 에서 TB 는 최초 소급으로 1.001 정의를 고르고 소속 B 는 1.000 items 에 없다");
        assertEquals(0, tb1.path("members").size());
        JsonNode v2 = b.path("items").get(1).path("value");
        assertEquals("2.000", b.path("items").get(1).path("ver").asText(), "요청 ver 2 는 2.000 으로 되돌린다");
        assertEquals(2, v2.path("items").size(), "C(초안 행)는 없다: " + v2);
        assertTrue(category(v2, "BASE").path("all").asBoolean());
        assertTrue(category(v2, "BASE").path("members").isNull());
        assertEquals("B", category(v2, "TB").path("members").get(0).asText());
        assertEquals("NOT_RELEASED", failed(b, "VS_CD", "2.001").path("message").asText());
        assertEquals("NOT_RELEASED", failed(b, "NO_CD", "1.000").path("message").asText());
    }

    @Test
    void CODE_current_본문은_같은_시각의_BODY_본문과_같다() throws Exception {
        seedCode();
        JsonNode t = toc("CODE", "2026-08-01T00:00:00", "VS_CD");
        JsonNode b = bodies("CODE", "VS_CD", "2.000");
        assertEquals("2.000", t.path("items").get(0).path("current").path("ver").asText());
        assertEquals(b.path("items").get(0).path("value"), t.path("items").get(0).path("current").path("value"));
    }

    @Test
    void CODE_저장값이_깨진_코드는_그_키만_failed_이고_묶음은_거부하지_않는다() throws Exception {
        seedCode();
        MasterCodeSeeds seeds = new MasterCodeSeeds(jdbc);
        seeds.seedCode("BAD_CD", "INUSE", "MDM");
        seeds.released("BAD_CD", "1.000", "2026-01-01 00:00:00", MasterCodeSeeds.OPEN_END);
        seeds.seedItem("BAD_CD", "A", "1.000", MasterCodeSeeds.OPEN, "에이", 1);
        seeds.seedBase("BAD_CD");
        seeds.seedCate("BAD_CD", "BROKEN", "1.000", MasterCodeSeeds.OPEN, "REGEX", "[", "CODE", "깨진 정규식"); // SQL 로 넣어 저장 검사를 우회한다

        JsonNode t = toc("CODE", "2026-08-01T00:00:00", "VS_CD", "BAD_CD");
        assertEquals(1, t.path("items").size(), t.toString());
        assertEquals("VS_CD", t.path("items").get(0).path("key").asText());
        assertEquals("BAD_CD", t.path("failed").get(0).path("key").asText(), t.toString());

        JsonNode b = bodies("CODE", "VS_CD", "2.000", "BAD_CD", "1.000");
        assertEquals(1, b.path("items").size(), b.toString());
        assertEquals("BAD_CD", b.path("failed").get(0).path("key").asText(), b.toString());
    }

    static JsonNode category(JsonNode body, String cateId) {
        for (JsonNode c : body.path("categories")) {
            if (cateId.equals(c.path("cateId").asText())) {
                return c;
            }
        }
        throw new AssertionError("카테고리 없음: " + cateId + " in " + body);
    }
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mdm.feed.MetaFeedVersionedHttpTest'`
Expected: CODE 시험 넷이 FAIL(MDM021 "아직 받지 않는 대상").

- [ ] **Step 3: 구현한다**

`MetaFeedDefinitions` 에 `MasterCodeLedgerQueries ledger() { return ledger; }` 를 더한다. `MetaFeedVersioned` 에 아래를 더하고 switch 의 `default -> throw …` 를 `case CODE -> codesToc(keys, at, b);`·`case CODE -> codeBodies(keys, b);` 와 `case COLUMN, DOMAIN -> throw new IllegalStateException("COLUMN·DOMAIN 은 part 가 NONE 이다");` 로 바꾼다.

```java
    private void codesToc(List<String> ids, LocalDateTime at, MetaFeedVersionedResult.Builder b) {
        MasterCodeLedgerQueries ledger = definitions.ledger();
        for (String id : ids) {
            Optional<MasterCodeLedgerQueries.Header> header = ledger.header(id);
            if (header.isEmpty()) {
                continue;
            }
            List<CodeVersionRow> released = ledger.versions(id).stream()
                    .filter(v -> RELEASED.equals(v.status()))
                    .map(v -> new CodeVersionRow(VersionNumbers.scaled(v.ver()), v.status(), v.applyFrom(), v.applyTo()))
                    .sorted(Comparator.comparing(CodeVersionRow::ver))
                    .toList();
            try { // 코드 하나의 저장값이 깨져도(잘못된 REGEX·모르는 defTarget) 그 키만 failed — 묶음 거부는 옛 MDM 신호(나)로 읽힌다
                Map<String, Object> current = at == null ? null : CodeVersions.select(released, at)
                        .map(ver -> MetaFeedVersionedResult.current(ver, MetaFeedJson.plain(CodeVersionSlicer.slice(projected(id), ver))))
                        .orElse(null);
                Map<String, Object> head = new LinkedHashMap<>();
                head.put("maruCodeId", header.get().maruCodeId());
                head.put("status", header.get().status());
                b.toc(id, MetaFeedVersionedResult.toc(head, released.stream()
                        .map(v -> MetaFeedVersionedResult.tocVersion(v.ver(), v.status(), v.applyFrom(), v.applyTo())).toList()), current);
            } catch (RuntimeException e) {
                b.tocFailed(id, e.getMessage() == null ? e.toString() : e.getMessage());
            }
        }
    }

    private void codeBodies(List<MetaFeedService.BodyKey> keys, MetaFeedVersionedResult.Builder b) {
        Map<String, Optional<CodeRows>> memo = new HashMap<>(); // 같은 코드의 여러 버전은 읽기·투영을 한 번만
        for (MetaFeedService.BodyKey k : keys) {
            if (k.ver() == null) {
                b.bodyFailed(k, INVALID_VER);
                continue;
            }
            Optional<CodeRows> projected = memo.computeIfAbsent(k.key(),
                    id -> new MdmCodeLookup(definitions.ledger()).code(id).map(CodeRowsProjection::releasedOnly));
            boolean released = projected.isPresent()
                    && projected.get().versions().stream().anyMatch(v -> v.ver().compareTo(k.ver()) == 0);
            if (!released) {
                b.bodyFailed(k, NOT_RELEASED);
                continue;
            }
            try { // 저장값이 깨진 코드는 그 쌍만 failed
                b.body(k, MetaFeedJson.plain(CodeVersionSlicer.slice(projected.get(), k.ver())));
            } catch (RuntimeException e) {
                b.bodyFailed(k, e.getMessage() == null ? e.toString() : e.getMessage());
            }
        }
    }

    private CodeRows projected(String id) {
        return CodeRowsProjection.releasedOnly(new MdmCodeLookup(definitions.ledger()).code(id).orElseThrow());
    }
```

import: `MasterCodeLedgerQueries`, `MdmCodeLookup`, `VersionNumbers`, `CodeRowsProjection`, `CodeVersionSlicer`, `CodeVersions`, `CodeLookup.CodeRows`, `CodeLookup.CodeVersionRow`, `java.util.Comparator`, `java.util.LinkedHashMap`. 클래스 Javadoc 에 "코드 본문은 원장 → 투영(D-152) → 자르기. SQL 버전 거르기 최적화는 후속(스펙 §4.2·§11)" 을 적는다.

- [ ] **Step 4: 시험을 돌린다**

Run: `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mdm.feed.*'`
Expected: PASS(골든 포함)

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/feed/metaFeed src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/feed/MetaFeedVersionedHttpTest.java
/usr/bin/git commit -m "feat(mdm): 메타 피드에 코드 목차와 투영·자르기로 만든 버전 본문을 더한다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: cactus — 값 타입(목차·ver 키·버전 선택·코드 본문 색인)

스펙 §3.1(키 규칙)·§3.2(대상별 선택)·§5.3(코드 색인). 순수 값·함수만 만든다. 버전 문자열 정규화 함수는 이 `MdmVersions.key` 하나뿐이다(Review Focus 1).

**Files:**
- Create: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmVersions.java`
- Create: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmTocVersion.java`
- Create: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmToc.java`
- Create: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmVersionSelector.java`
- Create: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmCodeVersion.java`
- Create: `src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmVersionsTest.java`
- Create: `src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmVersionSelectorTest.java`
- Create: `src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmCodeVersionTest.java`

**Interfaces:**
- Consumes: Task 2 `CodeVersions.select`, Task 3 `CodeVersionSlice`·`CodeVersionSlicer`, 기존 `MdmDefinitionLookup.covers`(package-private static)·`MdmDefinitionLookup.KST`.
- Produces(인터페이스 요약의 cactus 항목): `MdmVersions`, `MdmTocVersion`, `MdmToc`(final class — `header()`·`versions()`·`codeRows()`·`version(String)`, JSON 은 `{header, versions}`), `MdmVersionSelector`, `MdmCodeVersion`.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`MdmVersionsTest.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

/** D-154 — 본문 키의 ver 는 늘 scale 3 문자열(스펙 §3.1). 논리 키는 마지막 {@code @} + scale 3 숫자로만 푼다. */
class MdmVersionsTest {

    @Test
    void key_는_자리수가_달라도_같은_scale_3_문자열이다() {
        assertThat(MdmVersions.key(new BigDecimal("1"))).isEqualTo("1.000");      // SQLite INTEGER
        assertThat(MdmVersions.key(new BigDecimal("1.0"))).isEqualTo("1.000");
        assertThat(MdmVersions.key(new BigDecimal("1.0010"))).isEqualTo("1.001");
        assertThat(MdmVersions.key(new BigDecimal("1.001"))).isEqualTo("1.001");  // SQLite REAL
        assertThat(MdmVersions.key("2")).isEqualTo("2.000");
        assertThat(MdmVersions.key(new BigDecimal("1E+1"))).isEqualTo("10.000");
    }

    @Test
    void key_는_소수_넷째_자리가_있거나_숫자가_아니면_거부한다() {
        assertThatThrownBy(() -> MdmVersions.key(new BigDecimal("1.0001"))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> MdmVersions.key("x.y")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 논리_키는_마지막_골뱅이와_scale_3_숫자로만_푼다() {
        assertThat(MdmVersions.parse("PROC_CD@1.000")).isEqualTo(new MdmVersions.LogicalKey("PROC_CD", "1.000"));
        assertThat(MdmVersions.parse("A@B@2.010")).isEqualTo(new MdmVersions.LogicalKey("A@B", "2.010"));
        assertThat(MdmVersions.parse("A@1")).isEqualTo(new MdmVersions.LogicalKey("A@1", null));
        assertThat(MdmVersions.parse("PROC_CD")).isEqualTo(new MdmVersions.LogicalKey("PROC_CD", null));
        assertThat(MdmVersions.parse("42@1.000").isBody()).isTrue();
        assertThat(MdmVersions.logical("PROC_CD", "1.000")).isEqualTo("PROC_CD@1.000");
        assertThat(MdmVersions.logical("PROC_CD", null)).isEqualTo("PROC_CD");
    }

    @Test
    void 버전_대상은_룰_룰세트_코드_전문이다() {
        assertThat(MdmVersions.isVersioned(MdmTargetType.CODE)).isTrue();
        assertThat(MdmVersions.isVersioned(MdmTargetType.LAYOUT)).isTrue();
        assertThat(MdmVersions.isVersioned(MdmTargetType.COLUMN)).isFalse();
        assertThat(MdmVersions.isVersioned(MdmTargetType.DOMAIN)).isFalse();
    }
}
```

`MdmVersionSelectorTest.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import org.junit.jupiter.api.Test;

/** D-154 — 목차로 버전 고르기(스펙 §3.2)와 다음 경계(선택이 바뀔 수 있는 가장 이른 시각). */
class MdmVersionSelectorTest {

    private static final LocalDateTime OPEN = LocalDateTime.of(9999, 12, 31, 0, 0);

    private static MdmTocVersion v(String ver, String from, String to) {
        return new MdmTocVersion(new BigDecimal(ver), "RELEASED", from == null ? null : LocalDateTime.parse(from),
                to == null ? null : LocalDateTime.parse(to));
    }

    private static final MdmToc TOC = new MdmToc(null, List.of(
            v("1.000", "2026-01-01T00:00:00", "2026-04-01T00:00:00"),
            v("1.001", "2026-03-01T00:00:00", "2026-05-01T00:00:00"),     // 1.000 과 겹친다
            v("2.000", "2026-06-01T00:00:00", null)));                    // 빈틈 [05-01, 06-01), 열린 끝(null)

    @Test
    void 룰_세트_전문은_덮는_것_중_ver_최대이고_소급하지_않는다() {
        for (MdmTargetType t : List.of(MdmTargetType.RULE, MdmTargetType.RULE_SET, MdmTargetType.LAYOUT)) {
            assertThat(MdmVersionSelector.select(t, TOC, LocalDateTime.parse("2026-03-15T00:00:00"))).contains("1.001");
            assertThat(MdmVersionSelector.select(t, TOC, LocalDateTime.parse("2025-12-31T23:59:59"))).isEmpty();
            assertThat(MdmVersionSelector.select(t, TOC, LocalDateTime.parse("2026-05-15T00:00:00"))).isEmpty();
            assertThat(MdmVersionSelector.select(t, TOC, LocalDateTime.parse("2030-01-01T00:00:00"))).contains("2.000");
        }
    }

    @Test
    void 코드는_덮는_것_중_적용_시작이_가장_이른_것이고_없으면_가장_작은_ver_로_소급한다() {
        MdmToc code = new MdmToc(new CodeHeader("C", "INUSE"), List.of(
                v("1.000", "2026-01-01T00:00:00", "2026-04-01T00:00:00"),
                v("1.001", "2026-03-01T00:00:00", "2026-05-01T00:00:00"),
                v("2.000", "2026-06-01T00:00:00", "9999-12-31T00:00:00")));
        assertThat(MdmVersionSelector.select(MdmTargetType.CODE, code, LocalDateTime.parse("2026-03-15T00:00:00"))).contains("1.000");
        assertThat(MdmVersionSelector.select(MdmTargetType.CODE, code, LocalDateTime.parse("2025-01-01T00:00:00"))).contains("1.000");
        assertThat(MdmVersionSelector.select(MdmTargetType.CODE, code, LocalDateTime.parse("2026-05-15T00:00:00"))).contains("1.000");
        assertThat(MdmVersionSelector.select(MdmTargetType.CODE, new MdmToc(new CodeHeader("C", "INUSE"), List.of()),
                LocalDateTime.parse("2026-05-15T00:00:00"))).isEmpty();
    }

    @Test
    void 다음_경계는_t_보다_뒤인_가장_이른_applyFrom_applyTo_이고_없으면_MAX_다() {
        assertThat(MdmVersionSelector.nextBoundary(TOC, LocalDateTime.parse("2025-06-01T00:00:00"))).isEqualTo(LocalDateTime.parse("2026-01-01T00:00:00"));
        assertThat(MdmVersionSelector.nextBoundary(TOC, LocalDateTime.parse("2026-01-01T00:00:00"))).isEqualTo(LocalDateTime.parse("2026-03-01T00:00:00"));
        assertThat(MdmVersionSelector.nextBoundary(TOC, LocalDateTime.parse("2026-04-15T00:00:00"))).isEqualTo(LocalDateTime.parse("2026-05-01T00:00:00"));
        assertThat(MdmVersionSelector.nextBoundary(TOC, LocalDateTime.parse("2030-01-01T00:00:00"))).isEqualTo(LocalDateTime.MAX);
        MdmToc open = new MdmToc(null, List.of(new MdmTocVersion(new BigDecimal("1.000"), "RELEASED",
                LocalDateTime.parse("2026-01-01T00:00:00"), OPEN)));
        assertThat(MdmVersionSelector.nextBoundary(open, LocalDateTime.parse("2026-02-01T00:00:00"))).isEqualTo(OPEN);
    }
}
```

`MdmCodeVersionTest.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.code.CodeRowsProjection;
import kr.dongkuk.maru.mdm.engine.code.CodeVersionSlice;
import kr.dongkuk.maru.mdm.engine.code.CodeVersionSlicer;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;
import org.junit.jupiter.api.Test;

/** D-154 — 코드 본문 값과 색인(스펙 §5.3). 전체(all) 카테고리는 items 코드 집합 한 벌을 공유하고, 본문에 없는 cateId 는 빈 집합이다. */
class MdmCodeVersionTest {

    static final BigDecimal V1 = new BigDecimal("1.000");
    static final BigDecimal OPEN = new BigDecimal("9999.000");

    /** 코드 A·B, BASE(.*)·ALL2(.*)·TB(TABLE: B). */
    static CodeRows rows() {
        return new CodeRows(new CodeHeader("MC_CD", "INUSE"),
                List.of(new CodeVersionRow(V1, "RELEASED", LocalDateTime.of(2026, 1, 1, 0, 0), LocalDateTime.of(9999, 12, 31, 0, 0))),
                List.of(item("A"), item("B")),
                List.of(new CodeCateRow("BASE", V1, OPEN, "REGEX", ".*", "CODE"), new CodeCateRow("ALL2", V1, OPEN, "REGEX", ".*", "CODE"),
                        new CodeCateRow("TB", V1, OPEN, "TABLE", null, null)),
                List.of(new CodeCateItemRow("TB", "B", V1, OPEN)));
    }

    static CodeItemRow item(String code) {
        return new CodeItemRow(code, V1, OPEN, code + " 이름", null, 1, Arrays.asList(new String[5]), Arrays.asList(new String[10]));
    }

    static MdmCodeVersion sliced() {
        CodeRows p = CodeRowsProjection.releasedOnly(rows());
        CodeVersionSlice slice = CodeVersionSlicer.slice(p, V1);
        CodeVersionRow v = p.versions().get(0);
        return MdmCodeVersion.sliced(slice, p.header(), new MdmTocVersion(v.ver(), v.status(), v.applyFrom(), v.applyTo()));
    }

    @Test
    void 색인은_소속_집합을_주고_all_은_한_벌을_공유하며_없는_cateId_는_빈_집합이다() {
        MdmCodeVersion c = sliced();
        assertThat(c.isSliced()).isTrue();
        assertThat(c.members("TB")).contains(Set.of("B"));
        assertThat(c.members("BASE")).contains(Set.of("A", "B"));
        assertThat(c.members("BASE").get()).isSameAs(c.members("ALL2").get());
        assertThat(c.members("NO_SUCH")).contains(Set.of());
    }

    @Test
    void rows_는_그_버전_1행과_합성_cateItems_를_담는다() {
        CodeRows r = sliced().rows();
        assertThat(r.versions()).hasSize(1);
        assertThat(r.cateItems()).extracting(CodeCateItemRow::code).containsExactly("B");
    }

    @Test
    void full_은_전체_행을_그대로_주고_소속은_계산하지_않았다는_빈_값이다() {
        CodeRows rows = rows();
        MdmCodeVersion f = MdmCodeVersion.full(rows);
        assertThat(f.isSliced()).isFalse();
        assertThat(f.rows()).isSameAs(rows);
        assertThat(f.members("TB")).isEmpty();
    }

    @Test
    void JSON_은_본문_slice_모양이다_추정_크기와_관리_화면_상세가_쓴다() throws Exception {
        String json = MdmJson.MAPPER.writeValueAsString(sliced());
        assertThat(json).contains("\"maruCodeId\":\"MC_CD\"").contains("\"categories\"").doesNotContain("cateItems");
        assertThat(MdmJson.MAPPER.writeValueAsString(MdmCodeVersion.full(rows()))).contains("\"cateItems\"");
    }
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :cactus-core:test --tests 'com.dongkuk.dmes.cactus.mdm.MdmVersionsTest' --tests 'com.dongkuk.dmes.cactus.mdm.MdmVersionSelectorTest' --tests 'com.dongkuk.dmes.cactus.mdm.MdmCodeVersionTest'`
Expected: 컴파일 실패(클래스 없음).

- [ ] **Step 3: 구현한다**

`MdmVersions.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 버전 키 규칙 한 곳(D-154, 스펙 2026-10-03-mdm-meta-cache-per-version §3.1). 본문 키 ver 는 늘 scale 3 plain 문자열이다 — SQLite 는 1.000 을
 * INTEGER, 1.001 을 REAL 로 저장하므로 BigDecimal 을 그대로 문자열로 만들면 같은 버전이 두 키가 된다. 논리 키 {@code 정의키@ver} 는 마지막
 * {@code @} 뒤가 scale 3 숫자일 때만 본문 키로 본다(정의 ID 에 {@code @} 가 있어도 깨지지 않는다).
 */
public final class MdmVersions {

    private static final Pattern LOGICAL = Pattern.compile("^(.+)@(\\d{1,4}\\.\\d{3})$");

    private MdmVersions() {
    }

    /** @throws IllegalArgumentException 소수 넷째 자리 이상이 0 이 아니거나 숫자가 아니면 */
    public static String key(BigDecimal ver) {
        try {
            return ver.setScale(3, RoundingMode.UNNECESSARY).toPlainString();
        } catch (ArithmeticException e) {
            throw new IllegalArgumentException("버전은 소수 셋째 자리까지다: " + ver, e);
        }
    }

    public static String key(String text) {
        if (text == null || text.isBlank()) {
            throw new IllegalArgumentException("버전이 비었다");
        }
        return key(new BigDecimal(text.trim()));
    }

    /** {@code ver} 가 null 이면 정의 키(목차·값), 아니면 본문 키. */
    public record LogicalKey(String key, String ver) {
        public boolean isBody() {
            return ver != null;
        }
    }

    public static LogicalKey parse(String logical) {
        Matcher m = LOGICAL.matcher(logical);
        return m.matches() ? new LogicalKey(m.group(1), m.group(2)) : new LogicalKey(logical, null);
    }

    public static String logical(String key, String ver) {
        return ver == null ? key : key + '@' + ver;
    }

    /** 버전이 있는 대상 — 목차·본문으로 나눈다. COLUMN·DOMAIN 은 지금처럼 값 하나다. */
    public static boolean isVersioned(MdmTargetType type) {
        return type == MdmTargetType.RULE || type == MdmTargetType.RULE_SET || type == MdmTargetType.CODE || type == MdmTargetType.LAYOUT;
    }
}
```

`MdmTocVersion.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 목차의 버전 한 줄(D-154, 스펙 §3.1) — status 는 늘 RELEASED(결정 P2 가 칸을 두게 했다). applyTo null 은 열린 끝. */
public record MdmTocVersion(BigDecimal ver, String status, LocalDateTime applyFrom, LocalDateTime applyTo) {
}
```

`MdmToc.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;

/**
 * 목차 값(D-154, 스펙 §3.1) — {@code {header, versions}}. versions 는 RELEASED 만, ver 수 비교 오름차순. header 는 코드만 쓰고 나머지 대상은 null.
 * {@link #codeRows()} 는 엔진 {@code CodeLookup.code(id)} 가 줄 목차 행 {@code (header, versions, [], [], [])} 이고 만들 때 한 번 계산한다(조회마다
 * 버전 수만큼 새로 만들지 않는다). JSON 에는 header·versions 만 나간다.
 */
public final class MdmToc {

    private final CodeHeader header;
    private final List<MdmTocVersion> versions;
    private final CodeRows codeRows;
    /** ver 키(scale 3) → 버전 — {@link #version} 이 판정마다 버전 전체를 훑으며 문자열을 만들지 않게 한 번 만든다. */
    private final Map<String, MdmTocVersion> byKey;

    @JsonCreator
    public MdmToc(@JsonProperty("header") CodeHeader header, @JsonProperty("versions") List<MdmTocVersion> versions) {
        this.header = header;
        this.versions = versions == null ? List.of() : List.copyOf(versions);
        this.codeRows = new CodeRows(header, this.versions.stream()
                .map(v -> new CodeVersionRow(v.ver(), v.status(), v.applyFrom(), v.applyTo())).toList(), List.of(), List.of(), List.of());
        Map<String, MdmTocVersion> index = new HashMap<>();
        this.versions.forEach(v -> index.putIfAbsent(MdmVersions.key(v.ver()), v));
        this.byKey = Collections.unmodifiableMap(index);
    }

    @JsonProperty("header")
    public CodeHeader header() {
        return header;
    }

    @JsonProperty("versions")
    public List<MdmTocVersion> versions() {
        return versions;
    }

    public CodeRows codeRows() {
        return codeRows;
    }

    /** ver 키(scale 3)가 같은 버전. */
    public Optional<MdmTocVersion> version(String verKey) {
        return Optional.ofNullable(byKey.get(verKey));
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof MdmToc t && Objects.equals(header, t.header) && versions.equals(t.versions);
    }

    @Override
    public int hashCode() {
        return Objects.hash(header, versions);
    }

    @Override
    public String toString() {
        return "MdmToc[header=" + header + ", versions=" + versions + "]";
    }
}
```

`MdmVersionSelector.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.code.CodeVersions;

/**
 * 목차로 판정 시각의 버전 고르기(D-154, 스펙 §3.2) — 대상마다 지금 쓰는 함수를 그대로 쓴다. 코드는 엔진 {@link CodeVersions#select}(소급 있음),
 * 룰·룰 세트·전문은 {@link MdmDefinitionLookup#covers} + ver 최대(소급 없음). 시각은 KST 벽시계다.
 */
public final class MdmVersionSelector {

    private MdmVersionSelector() {
    }

    /** @return 고른 버전의 키(scale 3), 없으면 빈 값 — 룰·세트·전문은 "적용 버전 없음"일 수 있다 */
    public static Optional<String> select(MdmTargetType type, MdmToc toc, LocalDateTime t) {
        if (type == MdmTargetType.CODE) {
            return CodeVersions.select(toc.codeRows().versions(), t).map(MdmVersions::key);
        }
        return toc.versions().stream()
                .filter(v -> MdmDefinitionLookup.covers(v.applyFrom(), v.applyTo(), t))
                .max(Comparator.comparing(MdmTocVersion::ver))
                .map(v -> MdmVersions.key(v.ver()));
    }

    /**
     * {@code t} 보다 뒤인 가장 이른 applyFrom·applyTo — 두 선택 규칙 모두 결과가 이 경계에서만 바뀐다. 캐시는 이 시각 전까지 고른 버전을 기억한다
     * (이 계획의 「스펙과 다르게 정한 점」). 없으면 {@link LocalDateTime#MAX}.
     */
    public static LocalDateTime nextBoundary(MdmToc toc, LocalDateTime t) {
        LocalDateTime next = LocalDateTime.MAX;
        for (MdmTocVersion v : toc.versions()) {
            for (LocalDateTime b : new LocalDateTime[] {v.applyFrom(), v.applyTo()}) {
                if (b != null && b.isAfter(t) && b.isBefore(next)) {
                    next = b;
                }
            }
        }
        return next;
    }
}
```

`MdmCodeVersion.java`:

```java
package com.dongkuk.dmes.cactus.mdm;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.code.CodeVersionSlice;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;

/**
 * 코드 버전 본문 캐시 값(D-154, 스펙 §5.3·§5.4). 두 갈래다.
 * <ul>
 *   <li>{@link #sliced} — MDM 본문(또는 물러남으로 자른 본문). 엔진 {@code codeAt} 행({@link CodeVersionSlice#rows})과 카테고리 → 소속 해시 집합
 *       색인을 적재할 때 한 번 만든다. {@code all} 카테고리는 items 코드 집합 한 벌을 공유한다(복사하지 않는다).</li>
 *   <li>{@link #full} — {@code versioned-feed: off} 의 전 이력 행. {@link #members} 는 늘 빈 값(계산해 두지 않음)이라 해석기가 전체 행으로 계산한다
 *       — 지금 동작과 같고, 호출마다 자르지 않는다.</li>
 * </ul>
 * 코드 → 행 색인(스펙 §5.3 표 첫 줄)은 두지 않는다 — 엔진 해석기가 attr·codeList 에서 {@code codeAt} 행을 훑으므로 쓰는 곳이 없다(ns 급 확장은 범위 밖,
 * 결정 P7). JSON 은 본문 모양({@link #json})이다 — 추정 크기·관리 화면 상세가 쓴다.
 */
public final class MdmCodeVersion {

    private final CodeVersionSlice slice;
    private final CodeRows rows;
    private final Map<String, Set<String>> members;

    private MdmCodeVersion(CodeVersionSlice slice, CodeRows rows, Map<String, Set<String>> members) {
        this.slice = slice;
        this.rows = rows;
        this.members = members;
    }

    public static MdmCodeVersion sliced(CodeVersionSlice slice, CodeHeader header, MdmTocVersion version) {
        CodeRows rows = slice.rows(header, new CodeVersionRow(version.ver(), version.status(), version.applyFrom(), version.applyTo()));
        Set<String> itemCodes = new HashSet<>();
        slice.items().forEach(i -> itemCodes.add(i.code()));
        Set<String> shared = Collections.unmodifiableSet(itemCodes);
        Map<String, Set<String>> index = new HashMap<>();
        for (CodeVersionSlice.SlicedCategory c : slice.categories()) {
            index.put(c.cateId(), c.all() ? shared : Set.copyOf(c.members()));
        }
        return new MdmCodeVersion(slice, rows, Collections.unmodifiableMap(index));
    }

    public static MdmCodeVersion full(CodeRows rows) {
        return new MdmCodeVersion(null, rows, null);
    }

    /** 엔진 {@code CodeLookup.codeAt} 이 줄 행. */
    public CodeRows rows() {
        return rows;
    }

    /** 엔진 {@code CodeEffLookup} 이 줄 값 — sliced 면 늘 값이 있다(본문에 없는 cateId 는 빈 집합), full 이면 빈 값. */
    public Optional<Set<String>> members(String cateId) {
        return slice == null ? Optional.empty() : Optional.of(members.getOrDefault(cateId, Set.of()));
    }

    public boolean isSliced() {
        return slice != null;
    }

    @JsonValue
    public Object json() {
        return slice != null ? slice : rows;
    }
}
```

- [ ] **Step 4: 시험을 돌린다**

Run: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :cactus-core:test --tests 'com.dongkuk.dmes.cactus.mdm.*'`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmVersions.java src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmTocVersion.java src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmToc.java src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmVersionSelector.java src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmCodeVersion.java src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmVersionsTest.java src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmVersionSelectorTest.java src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmCodeVersionTest.java
/usr/bin/git commit -m "feat(cactus): MDM 메타 목차·버전 키·버전 선택·코드 본문 색인 값 타입을 더한다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: cactus — 피드 계약(TOC·BODY)과 HTTP 클라이언트, 옛 MDM 신호

스펙 §4.1(하위 호환 신호 (가)·(나))·§5.8. `MdmMetaFeed` 에 default 메서드 두 개를 더해, `fetch` 만 구현한 옛 구현(mls 시험의 익명 피드·시험 가짜)은 옛 MDM 처럼 전 이력을 돌려준다. `MdmMetaClient` 는 `part` 를 보내고, 응답에 `part` 가 되울려 오지 않으면(가) 그 묶음을 전 이력으로 읽고, 업무 거부면(나) 같은 묶음을 `part` 없이 **한 번** 다시 보낸다. 판정은 응답마다 새로 한다(프로세스 상태로 굳히지 않는다).

**Files:**
- Create: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmBodyKey.java`
- Create: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmCurrent.java`
- Create: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmTocResult.java`
- Create: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmBodyResult.java`
- Modify: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmMetaFeed.java`
- Modify: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmMetaClient.java`
- Create: `src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmMetaClientVersionedTest.java`

**Interfaces:**
- Consumes: Task 8 `MdmToc`·`MdmVersions.key`, Task 3 `CodeVersionSlice`(JSON 되읽기), MDM 계약(인터페이스 요약).
- Produces:
  - `record MdmBodyKey(String key, String ver)`(ver 는 scale 3 키).
  - `record MdmCurrent(String ver, Object body)` — 클라이언트가 주는 body 는 변환한 원시 값(`RuleDefinition`·`RuleSetDefinition`·`MdmLayoutVersion`·`CodeVersionSlice`)이다. `MdmCodeVersion` 으로 감싸는 일은 서비스(Task 11)가 한다.
  - `record MdmTocResult(Map<String, MdmToc> tocs, Map<String, MdmCurrent> current, Map<String, Object> legacy, Map<String, String> failed)`, `static MdmTocResult legacy(MdmFetchResult r)`.
  - `record MdmBodyResult(Map<MdmBodyKey, Object> found, Map<MdmBodyKey, String> failed, Map<String, Object> legacy, Map<String, String> legacyFailed, Set<String> legacyAsked)`, `static MdmBodyResult legacy(MdmFetchResult r, Set<String> asked)`. `legacyAsked` 는 전 이력으로 물은 정의 키 — 그 안에 있는데 `legacy`·`legacyFailed` 에 없으면 MDM 에 없는 정의다.
  - `MdmMetaFeed.fetchToc(MdmTargetType, Collection<String>, LocalDateTime at)`, `MdmMetaFeed.fetchBodies(MdmTargetType, Collection<MdmBodyKey>)`(둘 다 default).
  - `MdmMetaClient.convertBody(MdmTargetType, JsonNode) : Object`(package-private static).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`MdmMetaClientTest` 의 준비(`RestClient.Builder` + `MockRestServiceServer.bindTo(builder).build()`, `new MdmMetaClient(builder.build(), "http://mdm.test/", "mls")`)를 그대로 쓴다.

```java
package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.code.CodeVersionSlice;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** D-154 — 목차·본문 요청과 옛 MDM 신호 (가) part 가 되울리지 않음·(나) 업무 거부 → part 없이 한 번 더(스펙 §4.1·§5.8). */
class MdmMetaClientVersionedTest {

    private static final String URL = "http://mdm.test/oasis/metaFeed/view";
    private MockRestServiceServer server;
    private MdmMetaClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        client = new MdmMetaClient(builder.build(), "http://mdm.test/", "mls");
    }

    private static String ok(String result) {
        return "{\"meta\":{\"success\":true},\"data\":{\"result\":" + result + "}}";
    }

    private static final String REJECTED = "{\"meta\":{\"success\":false,\"message\":\"입력값 오류\"}}";

    private static final String RULE_1000 = "{\"ruleId\":\"R\",\"ver\":1.000,\"kind\":\"DECISION\",\"hitPolicy\":\"FIRST\","
            + "\"applyFrom\":\"2026-01-01T00:00:00\",\"applyTo\":null,\"rowsHash\":\"1\",\"vars\":[],"
            + "\"contract\":{\"always\":[],\"rows\":[]},\"rows\":[]}";

    @Test
    void 목차는_part_TOC_와_초까지의_at_을_보내고_목차와_current_를_읽는다() {
        server.expect(requestTo(URL))
                .andExpect(jsonPath("$.params.type").value("RULE"))
                .andExpect(jsonPath("$.params.part").value("TOC"))
                .andExpect(jsonPath("$.params.at").value("2026-10-03T00:00:00"))
                .andExpect(jsonPath("$.grids.keys.rows[0].key").value("R"))
                .andRespond(withSuccess(ok("{\"part\":\"TOC\",\"items\":[{\"key\":\"R\",\"value\":{\"header\":null,\"versions\":["
                        + "{\"ver\":1.000,\"status\":\"RELEASED\",\"applyFrom\":\"2026-01-01T00:00:00\",\"applyTo\":null}]},"
                        + "\"current\":{\"ver\":\"1\",\"value\":" + RULE_1000 + "}}],\"failed\":[]}"), MediaType.APPLICATION_JSON));

        MdmTocResult r = client.fetchToc(MdmTargetType.RULE, List.of("R"), LocalDateTime.of(2026, 10, 3, 0, 0));

        assertThat(r.tocs().get("R").versions()).extracting(MdmTocVersion::ver).containsExactly(new BigDecimal("1.000"));
        assertThat(r.current().get("R").ver()).as("current.ver 도 scale 3 키로").isEqualTo("1.000");
        assertThat(r.current().get("R").body()).isInstanceOf(RuleDefinition.class);
        assertThat(r.legacy()).isEmpty();
        server.verify();
    }

    @Test
    void 신호_가_응답에_part_가_없으면_그_묶음을_전_이력으로_읽는다() {
        server.expect(requestTo(URL)).andExpect(jsonPath("$.params.part").value("TOC"))
                .andRespond(withSuccess(ok("{\"items\":[{\"key\":\"R\",\"value\":[" + RULE_1000 + "]}],\"failed\":[]}"),
                        MediaType.APPLICATION_JSON));

        MdmTocResult r = client.fetchToc(MdmTargetType.RULE, List.of("R"), LocalDateTime.of(2026, 10, 3, 0, 0));

        assertThat(r.tocs()).isEmpty();
        assertThat(r.legacy().get("R")).isInstanceOf(List.class);
        server.verify();
    }

    @Test
    void 신호_나_업무_거부면_part_없이_한_번_더_보내고_그_결과를_전_이력으로_읽는다() {
        server.expect(requestTo(URL)).andExpect(jsonPath("$.params.part").value("TOC"))
                .andRespond(withSuccess(REJECTED, MediaType.APPLICATION_JSON));
        server.expect(requestTo(URL)).andExpect(jsonPath("$.params.part").doesNotExist()).andExpect(jsonPath("$.params.at").doesNotExist())
                .andRespond(withSuccess(ok("{\"items\":[{\"key\":\"R\",\"value\":[" + RULE_1000 + "]}],\"failed\":[]}"),
                        MediaType.APPLICATION_JSON));

        MdmTocResult r = client.fetchToc(MdmTargetType.RULE, List.of("R"), LocalDateTime.of(2026, 10, 3, 0, 0));

        assertThat(r.legacy()).containsKey("R");
        server.verify();
    }

    @Test
    void 두_번_다_거부되면_그_키들은_failed_이고_다음_요청은_다시_part_부터_보낸다() {
        server.expect(requestTo(URL)).andExpect(jsonPath("$.params.part").value("TOC")).andRespond(withSuccess(REJECTED, MediaType.APPLICATION_JSON));
        server.expect(requestTo(URL)).andExpect(jsonPath("$.params.part").doesNotExist()).andRespond(withSuccess(REJECTED, MediaType.APPLICATION_JSON));
        server.expect(requestTo(URL)).andExpect(jsonPath("$.params.part").value("TOC"))
                .andRespond(withSuccess(ok("{\"part\":\"TOC\",\"items\":[],\"failed\":[]}"), MediaType.APPLICATION_JSON));

        MdmTocResult first = client.fetchToc(MdmTargetType.RULE, List.of("R"), null);
        MdmTocResult second = client.fetchToc(MdmTargetType.RULE, List.of("R"), null);

        assertThat(first.failed()).containsKey("R");
        assertThat(second.failed()).isEmpty();
        assertThat(second.tocs()).isEmpty();
        server.verify();
    }

    @Test
    void 본문은_키_ver_행을_보내고_코드_본문을_CodeVersionSlice_로_읽고_NOT_RELEASED_는_그_쌍의_failed_다() {
        String slice = "{\"maruCodeId\":\"C\",\"ver\":1.000,\"items\":[],\"categories\":[{\"cateId\":\"BASE\",\"fromVer\":1.000,"
                + "\"toVer\":9999.000,\"defKind\":\"REGEX\",\"defExpr\":\".*\",\"defTarget\":\"CODE\",\"all\":false,\"members\":[]}]}";
        server.expect(requestTo(URL))
                .andExpect(jsonPath("$.params.part").value("BODY"))
                .andExpect(jsonPath("$.grids.keys.rows[0].key").value("C"))
                .andExpect(jsonPath("$.grids.keys.rows[0].ver").value("1.000"))
                .andExpect(jsonPath("$.grids.keys.rows[1].ver").value("2.000"))
                .andRespond(withSuccess(ok("{\"part\":\"BODY\",\"items\":[{\"key\":\"C\",\"ver\":\"1.000\",\"value\":" + slice + "}],"
                        + "\"failed\":[{\"key\":\"C\",\"ver\":\"2.000\",\"message\":\"NOT_RELEASED\"}]}"), MediaType.APPLICATION_JSON));

        MdmBodyResult r = client.fetchBodies(MdmTargetType.CODE, List.of(new MdmBodyKey("C", "1.000"), new MdmBodyKey("C", "2.000")));

        assertThat(r.found().get(new MdmBodyKey("C", "1.000"))).isInstanceOf(CodeVersionSlice.class);
        assertThat(r.failed()).containsEntry(new MdmBodyKey("C", "2.000"), "NOT_RELEASED");
        assertThat(r.legacyAsked()).isEmpty();
        server.verify();
    }

    @Test
    void 본문_신호_가_는_정의_키로_전_이력을_돌려주고_물은_정의_키를_남긴다() {
        server.expect(requestTo(URL)).andExpect(jsonPath("$.params.part").value("BODY"))
                .andRespond(withSuccess(ok("{\"items\":[{\"key\":\"R\",\"value\":[" + RULE_1000 + "]}],\"failed\":[]}"),
                        MediaType.APPLICATION_JSON));

        MdmBodyResult r = client.fetchBodies(MdmTargetType.RULE, List.of(new MdmBodyKey("R", "1.000"), new MdmBodyKey("NO", "1.000")));

        assertThat(r.legacy()).containsOnlyKeys("R");
        assertThat(r.legacyAsked()).containsExactlyInAnyOrder("R", "NO");
        server.verify();
    }

    @Test
    void 값_하나를_읽을_수_없으면_그_키만_failed_다() {
        server.expect(requestTo(URL)).andRespond(withSuccess(ok("{\"part\":\"TOC\",\"items\":["
                + "{\"key\":\"BAD\",\"value\":{\"versions\":[{\"ver\":\"x\"}]},\"current\":null},"
                + "{\"key\":\"R\",\"value\":{\"header\":null,\"versions\":[]},\"current\":null}],\"failed\":[]}"), MediaType.APPLICATION_JSON));

        MdmTocResult r = client.fetchToc(MdmTargetType.RULE, List.of("BAD", "R"), null);

        assertThat(r.failed()).containsKey("BAD");
        assertThat(r.tocs()).containsOnlyKeys("R");
        server.verify();
    }

    @Test
    void fetch_만_구현한_옛_피드는_default_로_전_이력을_돌려준다() {
        MdmMetaFeed old = new MdmMetaFeed() {
            @Override
            public MdmChanges changes(long since, int limit) {
                throw new UnsupportedOperationException();
            }

            @Override
            public MdmFetchResult fetch(MdmTargetType type, Collection<String> keys) {
                return new MdmFetchResult(Map.of("R", List.of()), Map.of());
            }
        };
        assertThat(old.fetchToc(MdmTargetType.RULE, List.of("R"), null).legacy()).containsKey("R");
        MdmBodyResult body = old.fetchBodies(MdmTargetType.RULE, List.of(new MdmBodyKey("R", "1.000"), new MdmBodyKey("R", "2.000")));
        assertThat(body.legacy()).containsOnlyKeys("R");
        assertThat(body.legacyAsked()).isEqualTo(Set.of("R"));
    }
}
```

`RULE_1000` 의 칸 이름이 엔진 `RuleDefinition` 과 다르면(`MdmMetaClientTest` 가 쓰는 룰 JSON 이 정본이다) 그 JSON 을 옮겨 쓴다.

- [ ] **Step 2: 실패를 확인한다**

Run: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :cactus-core:test --tests 'com.dongkuk.dmes.cactus.mdm.MdmMetaClientVersionedTest'`
Expected: 컴파일 실패.

- [ ] **Step 3: 결과 타입과 default 메서드를 만든다**

```java
package com.dongkuk.dmes.cactus.mdm;

/** 본문 하나의 키(D-154) — 정의 키와 scale 3 ver 키({@link MdmVersions#key}). */
public record MdmBodyKey(String key, String ver) {
}
```

```java
package com.dongkuk.dmes.cactus.mdm;

/** 목차 응답의 {@code current}(D-154, 결정 P11) — {@code at} 시각에 MDM 이 고른 버전과 그 본문. 고른 버전은 cactus 가 목차로 다시 확인한다. */
public record MdmCurrent(String ver, Object body) {
}
```

```java
package com.dongkuk.dmes.cactus.mdm;

import java.util.Map;

/**
 * 목차 요청 결과(D-154). {@code tocs}·{@code current} 는 새 MDM 응답, {@code legacy} 는 옛 MDM(신호 가·나) 응답의 전 이력 값(지금 값 모양), {@code failed}
 * 는 받을 수 없는 키다. 없는 정의는 어디에도 없다.
 */
public record MdmTocResult(Map<String, MdmToc> tocs, Map<String, MdmCurrent> current, Map<String, Object> legacy,
                           Map<String, String> failed) {

    public MdmTocResult {
        tocs = tocs == null ? Map.of() : tocs;
        current = current == null ? Map.of() : current;
        legacy = legacy == null ? Map.of() : legacy;
        failed = failed == null ? Map.of() : failed;
    }

    public static MdmTocResult legacy(MdmFetchResult r) {
        return new MdmTocResult(Map.of(), Map.of(), r.found(), r.failed());
    }
}
```

```java
package com.dongkuk.dmes.cactus.mdm;

import java.util.Map;
import java.util.Set;

/**
 * 본문 요청 결과(D-154). {@code found}·{@code failed}(메시지 {@code NOT_RELEASED} 포함)는 새 MDM 응답, {@code legacy}·{@code legacyFailed} 는 옛 MDM
 * 응답(정의 키 → 전 이력). {@code legacyAsked} 는 전 이력으로 물은 정의 키 — 그 안에 있는데 결과에 없으면 MDM 에 없는 정의다.
 */
public record MdmBodyResult(Map<MdmBodyKey, Object> found, Map<MdmBodyKey, String> failed, Map<String, Object> legacy,
                            Map<String, String> legacyFailed, Set<String> legacyAsked) {

    public MdmBodyResult {
        found = found == null ? Map.of() : found;
        failed = failed == null ? Map.of() : failed;
        legacy = legacy == null ? Map.of() : legacy;
        legacyFailed = legacyFailed == null ? Map.of() : legacyFailed;
        legacyAsked = legacyAsked == null ? Set.of() : legacyAsked;
    }

    public static MdmBodyResult legacy(MdmFetchResult r, Set<String> asked) {
        return new MdmBodyResult(Map.of(), Map.of(), r.found(), r.failed(), asked);
    }
}
```

`MdmMetaFeed.java` 에 더한다(기존 두 메서드는 그대로):

```java
    /**
     * 목차(D-154) — {@code at} 이 있으면 그 시각의 본문도 함께 받는다. 기본 구현은 옛 MDM 과 같다: {@link #fetch} 의 전 이력을 {@code legacy} 로 준다
     * (fetch 만 구현한 시험 가짜·옛 구현이 그대로 돈다).
     */
    default MdmTocResult fetchToc(MdmTargetType type, Collection<String> keys, LocalDateTime at) {
        return MdmTocResult.legacy(fetch(type, keys));
    }

    /** 본문(D-154) — (정의 키, ver) 쌍 묶음. 기본 구현은 정의 키로 {@link #fetch} 한 전 이력을 {@code legacy} 로 준다. */
    default MdmBodyResult fetchBodies(MdmTargetType type, Collection<MdmBodyKey> keys) {
        Set<String> asked = new LinkedHashSet<>();
        keys.forEach(k -> asked.add(k.key()));
        return MdmBodyResult.legacy(fetch(type, asked), asked);
    }
```

import: `java.time.LocalDateTime`, `java.util.LinkedHashSet`, `java.util.Set`.

- [ ] **Step 4: 클라이언트를 구현한다**

`MdmMetaClient` 에서 기존 `fetch` 의 묶음 몸체를 `legacyChunk` 로 꺼내고(동작 불변), `call` 을 행 배열을 받는 형태로 넓힌 뒤 두 메서드를 더한다.

```java
    static final DateTimeFormatter AT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    @Override
    public MdmFetchResult fetch(MdmTargetType type, Collection<String> keys) {
        List<String> all = new ArrayList<>(keys);
        Map<String, Object> found = new LinkedHashMap<>();
        Map<String, String> failed = new LinkedHashMap<>();
        for (int from = 0; from < all.size(); from += MAX_KEYS_PER_VIEW) {
            legacyChunk(type, all.subList(from, Math.min(all.size(), from + MAX_KEYS_PER_VIEW)), found, failed);
        }
        return new MdmFetchResult(found, failed);
    }

    /** part 없는 view 한 묶음(지금 동작). 업무 거부는 그 묶음 키 전부 failed. */
    private void legacyChunk(MdmTargetType type, List<String> chunk, Map<String, Object> found, Map<String, String> failed) {
        JsonNode result;
        try {
            ObjectNode params = MdmJson.MAPPER.createObjectNode().put("type", type.name());
            if (type == MdmTargetType.COLUMN && systemCode != null) {
                params.put("systemCode", systemCode);
            }
            result = call("view", params, keyRows(chunk));
        } catch (MdmRejectedException e) {
            chunk.forEach(k -> failed.put(k, e.getMessage()));
            return;
        }
        readLegacy(type, result, found, failed);
    }

    private static void readLegacy(MdmTargetType type, JsonNode result, Map<String, Object> found, Map<String, String> failed) {
        for (JsonNode n : result.path("items")) {
            String key = n.path("key").asText();
            JsonNode value = n.path("value");
            if (value.isMissingNode() || value.isNull()) {
                failed.put(key, "value 없음");
                continue;
            }
            try {
                found.put(key, convert(type, value));
            } catch (MdmUnavailableException e) {
                failed.put(key, e.getMessage());
            }
        }
        for (JsonNode n : result.path("failed")) {
            failed.put(n.path("key").asText(), n.path("message").asText(""));
        }
    }

    /**
     * 목차(D-154, 스펙 §4.1). 신호 (가): 응답에 {@code part=TOC} 가 되울려 오지 않으면 옛 MDM 이 params 를 무시한 것 — 그 묶음을 전 이력으로 읽는다.
     * 신호 (나): 업무 거부면 같은 묶음을 part 없이 한 번 다시 보낸다(새 MDM 의 묶음 거부는 키 상한 초과 같은 입력 오류뿐이고 500 개씩 나눠 보내므로
     * 해가 없다). 판정은 응답마다 새로 한다 — 일시 거부 한 번이 물러남으로 굳지 않는다.
     */
    @Override
    public MdmTocResult fetchToc(MdmTargetType type, Collection<String> keys, LocalDateTime at) {
        List<String> all = new ArrayList<>(new LinkedHashSet<>(keys));
        Map<String, MdmToc> tocs = new LinkedHashMap<>();
        Map<String, MdmCurrent> current = new LinkedHashMap<>();
        Map<String, Object> legacy = new LinkedHashMap<>();
        Map<String, String> failed = new LinkedHashMap<>();
        for (int from = 0; from < all.size(); from += MAX_KEYS_PER_VIEW) {
            List<String> chunk = all.subList(from, Math.min(all.size(), from + MAX_KEYS_PER_VIEW));
            ObjectNode params = MdmJson.MAPPER.createObjectNode().put("type", type.name()).put("part", "TOC");
            if (at != null) {
                params.put("at", AT.format(at));
            }
            JsonNode result;
            try {
                result = call("view", params, keyRows(chunk));
            } catch (MdmRejectedException e) {
                legacyChunk(type, chunk, legacy, failed); // 신호 (나)
                continue;
            }
            if (!"TOC".equals(result.path("part").asText(null))) {
                readLegacy(type, result, legacy, failed); // 신호 (가)
                continue;
            }
            for (JsonNode n : result.path("items")) {
                String key = n.path("key").asText();
                try {
                    MdmToc toc = MdmJson.MAPPER.treeToValue(n.path("value"), MdmToc.class);
                    JsonNode cur = n.path("current");
                    MdmCurrent c = cur.isObject()
                            ? new MdmCurrent(MdmVersions.key(cur.path("ver").asText()), convertBody(type, cur.path("value")))
                            : null;
                    tocs.put(key, toc);
                    if (c != null) {
                        current.put(key, c);
                    }
                } catch (IOException | IllegalArgumentException | MdmUnavailableException e) {
                    failed.put(key, "MDM 응답의 " + type + " 목차를 읽을 수 없습니다: " + e.getMessage());
                }
            }
            for (JsonNode n : result.path("failed")) {
                failed.put(n.path("key").asText(), n.path("message").asText(""));
            }
        }
        return new MdmTocResult(tocs, current, legacy, failed);
    }

    /** 본문(D-154). 신호 (가)·(나)는 목차와 같다 — 물러나면 그 묶음의 정의 키로 전 이력을 받는다. */
    @Override
    public MdmBodyResult fetchBodies(MdmTargetType type, Collection<MdmBodyKey> keys) {
        List<MdmBodyKey> all = new ArrayList<>(new LinkedHashSet<>(keys));
        Map<MdmBodyKey, Object> found = new LinkedHashMap<>();
        Map<MdmBodyKey, String> failed = new LinkedHashMap<>();
        Map<String, Object> legacy = new LinkedHashMap<>();
        Map<String, String> legacyFailed = new LinkedHashMap<>();
        Set<String> asked = new LinkedHashSet<>();
        for (int from = 0; from < all.size(); from += MAX_KEYS_PER_VIEW) {
            List<MdmBodyKey> chunk = all.subList(from, Math.min(all.size(), from + MAX_KEYS_PER_VIEW));
            ObjectNode params = MdmJson.MAPPER.createObjectNode().put("type", type.name()).put("part", "BODY");
            ArrayNode rows = MdmJson.MAPPER.createArrayNode();
            chunk.forEach(k -> rows.addObject().put("key", k.key()).put("ver", k.ver()));
            JsonNode result;
            try {
                result = call("view", params, rows);
            } catch (MdmRejectedException e) {
                List<String> defKeys = chunk.stream().map(MdmBodyKey::key).distinct().toList();
                asked.addAll(defKeys);
                legacyChunk(type, defKeys, legacy, legacyFailed);
                continue;
            }
            if (!"BODY".equals(result.path("part").asText(null))) {
                chunk.forEach(k -> asked.add(k.key()));
                readLegacy(type, result, legacy, legacyFailed);
                continue;
            }
            for (JsonNode n : result.path("items")) {
                MdmBodyKey key;
                try {
                    key = new MdmBodyKey(n.path("key").asText(), MdmVersions.key(n.path("ver").asText()));
                } catch (IllegalArgumentException e) {
                    continue; // 키를 알 수 없는 줄 — 그 쌍은 응답에 없는 것으로 남아 서비스가 받을 수 없음으로 처리한다
                }
                try {
                    found.put(key, convertBody(type, n.path("value")));
                } catch (MdmUnavailableException e) {
                    failed.put(key, e.getMessage());
                }
            }
            for (JsonNode n : result.path("failed")) {
                String raw = n.path("ver").asText("");
                String ver;
                try {
                    ver = MdmVersions.key(raw);
                } catch (IllegalArgumentException e) {
                    ver = raw;
                }
                failed.put(new MdmBodyKey(n.path("key").asText(), ver), n.path("message").asText(""));
            }
        }
        return new MdmBodyResult(found, failed, legacy, legacyFailed, asked);
    }

    /** 본문 하나 → 엔진 모양. CODE 는 {@code CodeVersionSlice}(감싸기는 서비스). */
    static Object convertBody(MdmTargetType type, JsonNode value) {
        try {
            return switch (type) {
                case RULE -> MdmJson.MAPPER.treeToValue(value, RuleDefinition.class);
                case RULE_SET -> MdmJson.MAPPER.treeToValue(value, RuleSetDefinition.class);
                case LAYOUT -> MdmJson.MAPPER.treeToValue(value, MdmLayoutVersion.class);
                case CODE -> MdmJson.MAPPER.treeToValue(value, CodeVersionSlice.class);
                case COLUMN, DOMAIN -> throw new IllegalArgumentException("버전이 없는 대상입니다: " + type);
            };
        } catch (IOException | IllegalArgumentException e) {
            throw new MdmUnavailableException("MDM 응답의 " + type + " 본문을 읽을 수 없습니다: " + e.getMessage(), e);
        }
    }

    private static ArrayNode keyRows(Collection<String> keys) {
        ArrayNode rows = MdmJson.MAPPER.createArrayNode();
        keys.forEach(k -> rows.addObject().put("key", k));
        return rows;
    }
```

`call(String action, ObjectNode params, Collection<String> keys)` 는 `call(String action, ObjectNode params, ArrayNode rows)` 로 바꾸고 몸체의 `rows` 만드는 두 줄을 `body.putObject("grids").putObject("keys").set("rows", rows);` 로 바꾼다. `changes` 는 `call("search", params, MdmJson.MAPPER.createArrayNode())` 로 부른다. 값 null 이 `"value 없음"` 으로 failed 가 되는 지금 규칙은 `readLegacy` 가 지킨다. 클래스 Javadoc 끝에 "D-154 — 목차·본문(`fetchToc`·`fetchBodies`)과 옛 MDM 신호 (가)·(나)" 를 적는다. import: `java.time.LocalDateTime`, `java.time.format.DateTimeFormatter`, `java.util.LinkedHashSet`, `java.util.Set`, `kr.dongkuk.maru.mdm.engine.code.CodeVersionSlice`.

- [ ] **Step 5: 시험을 돌린다**

Run:
- `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :cactus-core:test --tests 'com.dongkuk.dmes.cactus.mdm.*'`
- `cd src/backend/mls && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mls.lsh.noticeMgmt.NoticeMgmtMdmRealValidatorTest'`
- `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mdm.feed.MdmMetaFeedContractHttpTest'`

Expected: 모두 PASS(`MdmMetaClientTest` 의 기존 사례가 그대로 통과해야 한다).

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmBodyKey.java src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmCurrent.java src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmTocResult.java src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmBodyResult.java src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmMetaFeed.java src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmMetaClient.java src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmMetaClientVersionedTest.java
/usr/bin/git commit -m "feat(cactus): MDM 메타 목차·본문 요청과 옛 MDM 무시·거부 신호 처리를 더한다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: cactus — 캐시 묶음 구조(목차 + 본문), 정의 키 지움 기록, 항목별 수명

스펙 §5.1(저장 구조)·§5.5(수명·용량)·§5.6(무효화와 경합). 정의 키마다 묶음(`Group`) 하나에 머리(값·목차·"없음")와 버전 본문들을 둔다. 지움 기록은 정의 키 하나에 남기고, 본문을 넣을 때도 그 기록을 본다(늦게 도착한 본문을 막는다). 본문의 유휴 수명은 최종 버전이면 `max-idle`, 옛 버전·예약 버전·목차 없는 본문이면 `old-version-max-idle` 이다. 최종 여부는 묶음에 기억한 `Current(ver, until)` 로 판정하고 `until`(다음 경계)이 지나면 다시 고른다. 기존 VALUE 머리 동작(컬럼·도메인, `versioned-feed: off`)은 바뀌지 않는다 — 기존 `MdmMetaCacheTest` 가 그대로 통과해야 한다.

**Files:**
- Modify(전체 교체): `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmMetaCache.java`
- Modify: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmClientProperties.java`(`oldVersionMaxIdle`)
- Modify: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmAutoConfiguration.java:48-52`(5인자 생성자)
- Create: `src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmMetaCacheVersionedTest.java`
- Modify: `src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmAutoConfigurationTest.java`(바인딩 사례 하나)

**Interfaces:**
- Consumes: Task 8 `MdmToc`·`MdmVersions`·`MdmVersionSelector`, Task 9 `MdmBodyKey`.
- Produces: `MdmMetaCache.Part`, 5인자 생성자, `putTocs(MdmTargetType, Map<String, MdmToc>, Ticket) : Set<String>`, `getBody(MdmTargetType, String key, String ver) : Optional<Entry>`, `putBodies(MdmTargetType, Map<MdmBodyKey, Object>, Ticket) : Set<MdmBodyKey>`, `evictLocalBody(MdmTargetType, String key, String ver)`, `bodySizes() : Map<MdmTargetType, Integer>`, `oldVersionMaxIdle() : Duration`, `Entry.part()`·`Entry.ver()`, `EntryView` 끝 칸 `Part part, String ver, Boolean current`(VALUE·TOC 행은 `current == null`, `key` 는 논리 키). `peek(type, key)` 는 버전 대상이면 논리 키(`X@1.000`)를 받는다. `MdmClientProperties.getOldVersionMaxIdle()`(기본 10m).

- [ ] **Step 1: 실패하는 시험을 쓴다**

```java
package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * D-154 — 묶음 구조(스펙 §5.1)·항목별 수명(§5.5)·정의 키 지움 기록(§5.6). 시계 0 시 = KST 2026-10-03 00:00. 목차 R: 1.000 [2026-01-01, 01:00),
 * 2.000 [01:00, 열린 끝) — 예약 버전 2.000 의 적용 시작이 60분 뒤다.
 */
class MdmMetaCacheVersionedTest {

    private static final Instant T0 = Instant.parse("2026-10-02T15:00:00Z"); // KST 2026-10-03 00:00
    private MutableClock clock;
    private MdmMetaCache cache;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(T0);
        cache = new MdmMetaCache(100, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        cache.clear(0);
    }

    static MdmToc toc() {
        return new MdmToc(null, List.of(
                new MdmTocVersion(new BigDecimal("1.000"), "RELEASED", LocalDateTime.parse("2026-01-01T00:00:00"),
                        LocalDateTime.parse("2026-10-03T01:00:00")),
                new MdmTocVersion(new BigDecimal("2.000"), "RELEASED", LocalDateTime.parse("2026-10-03T01:00:00"), null)));
    }

    private static Map<MdmBodyKey, Object> bodies(String key, String... vers) {
        Map<MdmBodyKey, Object> out = new LinkedHashMap<>();
        for (String v : vers) {
            out.put(new MdmBodyKey(key, v), "본문 " + key + "@" + v);
        }
        return out;
    }

    private MdmMetaCache.EntryView view(String logical) {
        return cache.entries(MdmTargetType.RULE, null).stream().filter(v -> v.key().equals(logical)).findFirst().orElseThrow();
    }

    @Test
    void 목차와_본문은_한_묶음이고_entries_에_논리_키_구분_ver_최종_여부로_보인다() {
        cache.putTocs(MdmTargetType.RULE, Map.of("R", toc()), cache.ticket());
        cache.putBodies(MdmTargetType.RULE, bodies("R", "1.000"), cache.ticket());

        assertThat(cache.get(MdmTargetType.RULE, "R").orElseThrow().part()).isEqualTo(MdmMetaCache.Part.TOC);
        assertThat(cache.getBody(MdmTargetType.RULE, "R", "1.000").orElseThrow().value()).isEqualTo("본문 R@1.000");
        assertThat(cache.entries(MdmTargetType.RULE, null)).extracting(MdmMetaCache.EntryView::key).containsExactly("R", "R@1.000");
        assertThat(view("R").part()).isEqualTo(MdmMetaCache.Part.TOC);
        assertThat(view("R").current()).isNull();
        assertThat(view("R@1.000").part()).isEqualTo(MdmMetaCache.Part.BODY);
        assertThat(view("R@1.000").ver()).isEqualTo("1.000");
        assertThat(view("R@1.000").current()).isTrue();
        assertThat(cache.entries(MdmTargetType.RULE, "r@1.0")).extracting(MdmMetaCache.EntryView::key).containsExactly("R@1.000");
        assertThat(cache.peek(MdmTargetType.RULE, "R@1.000").orElseThrow().ver()).isEqualTo("1.000");
        assertThat(cache.sizes().get(MdmTargetType.RULE)).isEqualTo(2);
        assertThat(cache.bodySizes().get(MdmTargetType.RULE)).isEqualTo(1);
    }

    @Test
    void 예약_버전의_적용_시작이_지나면_쓰기_없이_최종이_바뀌고_수명도_바뀐다() {
        cache.putTocs(MdmTargetType.RULE, Map.of("R", toc()), cache.ticket());
        clock.advance(Duration.ofMinutes(55));
        cache.get(MdmTargetType.RULE, "R"); // 목차를 조회해 유휴 수명을 연장한다
        cache.putBodies(MdmTargetType.RULE, bodies("R", "1.000", "2.000"), cache.ticket());

        clock.advance(Duration.ofSeconds(4 * 60 + 59)); // 00:59:59 — 경계 직전
        assertThat(view("R@1.000").current()).isTrue();
        assertThat(view("R@2.000").current()).as("예약 버전은 옛 수명").isFalse();

        clock.advance(Duration.ofSeconds(1)); // 01:00:00 — 경계
        assertThat(view("R@1.000").current()).isFalse();
        assertThat(view("R@2.000").current()).isTrue();

        clock.advance(Duration.ofMinutes(5)); // 01:05 — 1.000 은 마지막 조회(00:55) + 10분에 만료
        assertThat(cache.getBody(MdmTargetType.RULE, "R", "1.000")).isEmpty();
        assertThat(cache.getBody(MdmTargetType.RULE, "R", "2.000")).as("새 최종은 60분").isPresent();
    }

    @Test
    void 목차가_없는_본문은_옛_버전_수명이다() {
        cache.putBodies(MdmTargetType.RULE, bodies("R", "1.000"), cache.ticket());
        clock.advance(Duration.ofMinutes(10));
        assertThat(cache.getBody(MdmTargetType.RULE, "R", "1.000")).isEmpty();
    }

    @Test
    void 없는_정의는_목차_자리에_없음으로_캐시한다() {
        Map<String, MdmToc> tocs = new LinkedHashMap<>();
        tocs.put("NO", null);
        cache.putTocs(MdmTargetType.RULE, tocs, cache.ticket());
        MdmMetaCache.Entry e = cache.get(MdmTargetType.RULE, "NO").orElseThrow();
        assertThat(e.absent()).isTrue();
        assertThat(e.part()).isEqualTo(MdmMetaCache.Part.TOC);
    }

    @Test
    void 폴러_지움은_목차와_본문_전부를_지우고_지움_기록은_정의_키_하나다_그_전에_시작한_본문_적재는_막는다() {
        cache.putTocs(MdmTargetType.CODE, Map.of("X", toc()), cache.ticket());
        cache.putBodies(MdmTargetType.CODE, bodies("X", "1.000", "2.000"), cache.ticket());
        MdmMetaCache.Ticket before = cache.ticket();

        cache.evict(MdmTargetType.CODE, "X", 5);
        cache.markApplied(5);

        assertThat(cache.get(MdmTargetType.CODE, "X")).isEmpty();
        assertThat(cache.getBody(MdmTargetType.CODE, "X", "1.000")).isEmpty();
        assertThat(cache.getBody(MdmTargetType.CODE, "X", "2.000")).isEmpty();
        assertThat(cache.tombstoneCount()).isEqualTo(1);
        assertThat(cache.putBodies(MdmTargetType.CODE, bodies("X", "1.000"), before)).as("늦게 도착한 옛 본문").isEmpty();
        assertThat(cache.putTocs(MdmTargetType.CODE, Map.of("X", toc()), before)).isEmpty();
        MdmMetaCache.Ticket after = cache.ticket();
        assertThat(cache.putBodies(MdmTargetType.CODE, bodies("X", "1.000"), after)).hasSize(1);
        assertThat(cache.putTocs(MdmTargetType.CODE, Map.of("X", toc()), after)).containsExactly("X");
    }

    @Test
    void 본문_하나만_지우면_목차와_다른_버전은_남고_그_버전의_앞선_적재만_막는다() {
        cache.putTocs(MdmTargetType.CODE, Map.of("X", toc()), cache.ticket());
        cache.putBodies(MdmTargetType.CODE, bodies("X", "1.000", "2.000"), cache.ticket());
        MdmMetaCache.Ticket before = cache.ticket();

        cache.evictLocalBody(MdmTargetType.CODE, "X", "1.000");

        assertThat(cache.get(MdmTargetType.CODE, "X")).isPresent();
        assertThat(cache.getBody(MdmTargetType.CODE, "X", "2.000")).isPresent();
        assertThat(cache.getBody(MdmTargetType.CODE, "X", "1.000")).isEmpty();
        assertThat(cache.putBodies(MdmTargetType.CODE, bodies("X", "1.000"), before)).isEmpty();
        assertThat(cache.putBodies(MdmTargetType.CODE, bodies("X", "2.000"), before)).hasSize(1);
        assertThat(cache.putBodies(MdmTargetType.CODE, bodies("X", "1.000"), cache.ticket())).hasSize(1);
    }

    @Test
    void 상한은_목차와_본문을_합해_세고_오래_안_쓴_본문부터_줄인다() {
        MdmMetaCache small = new MdmMetaCache(4, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        small.clear(0);
        small.putTocs(MdmTargetType.RULE, Map.of("R", toc()), small.ticket());
        small.putBodies(MdmTargetType.RULE, bodies("R", "1.000"), small.ticket());
        clock.advance(Duration.ofSeconds(1));
        small.putBodies(MdmTargetType.RULE, bodies("R", "2.000"), small.ticket());
        clock.advance(Duration.ofSeconds(1));
        small.get(MdmTargetType.RULE, "R");
        small.getBody(MdmTargetType.RULE, "R", "1.000");
        clock.advance(Duration.ofSeconds(1));

        small.putTocs(MdmTargetType.RULE, Map.of("S", toc()), small.ticket());
        small.putBodies(MdmTargetType.RULE, bodies("S", "1.000"), small.ticket()); // 5개 → 95%(3개)까지

        assertThat(small.sizes().get(MdmTargetType.RULE)).isEqualTo(3);
        assertThat(small.getBody(MdmTargetType.RULE, "R", "2.000")).as("가장 오래 안 쓴 본문").isEmpty();
    }

    @Test
    void 폴링의_쓸기는_만료된_본문과_빈_묶음을_맵에서_뺀다() {
        cache.putBodies(MdmTargetType.RULE, bodies("R", "1.000"), cache.ticket());
        clock.advance(Duration.ofMinutes(11));
        cache.markApplied(1);
        assertThat(cache.storedCount(MdmTargetType.RULE)).isZero();
        assertThat(cache.bytes().get(MdmTargetType.RULE)).isZero();
    }

    @Test
    void entries_와_peek_은_본문_수명을_연장하지_않는다() {
        cache.putTocs(MdmTargetType.RULE, Map.of("R", toc()), cache.ticket());
        cache.putBodies(MdmTargetType.RULE, bodies("R", "2.000"), cache.ticket()); // 예약 버전 → 10분
        clock.advance(Duration.ofMinutes(9));
        cache.entries(MdmTargetType.RULE, null);
        cache.peek(MdmTargetType.RULE, "R@2.000");
        clock.advance(Duration.ofMinutes(1));
        assertThat(cache.getBody(MdmTargetType.RULE, "R", "2.000")).isEmpty();
        assertThat(view("R").remainingSeconds()).isEqualTo(50 * 60);
    }
}
```

`MdmAutoConfigurationTest` 의 `max_idle_과_max_age_설정이_캐시에_닿는다` 아래에 더한다.

```java
    @Test
    void old_version_max_idle_기본은_10분이고_설정이_캐시에_닿는다() {
        runner.withPropertyValues(ON).run(ctx ->
                assertThat(ctx.getBean(MdmMetaCache.class).oldVersionMaxIdle()).isEqualTo(Duration.ofMinutes(10)));
        runner.withPropertyValues(ON).withPropertyValues("cactus.mdm.old-version-max-idle=3m").run(ctx ->
                assertThat(ctx.getBean(MdmMetaCache.class).oldVersionMaxIdle()).isEqualTo(Duration.ofMinutes(3)));
    }
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :cactus-core:test --tests 'com.dongkuk.dmes.cactus.mdm.MdmMetaCacheVersionedTest'`
Expected: 컴파일 실패(5인자 생성자·`putTocs` 등이 없다).

- [ ] **Step 3: `MdmMetaCache` 를 교체한다**

클래스 Javadoc 은 지금 내용을 두고 끝에 아래 문단을 더한다. 그다음 본문을 아래 코드로 바꾼다. `sizeOf`·`Ticket`·`Tombstone`·`TOMBSTONE_TTL`·`TRIM_TARGET_RATIO`·`clear`·`ticket`·`appliedSeq`·`maxEntries`·`maxAge`·`maxIdle`·`tombstoneCount`·`trimPasses` 는 지금과 같다.

```java
 * <p>묶음 구조(D-154, 스펙 2026-10-03-mdm-meta-cache-per-version §5.1·§5.5·§5.6): 정의 키마다 {@code Group} 하나에 머리({@link Part#VALUE} 값
 * 하나 — 컬럼·도메인과 {@code versioned-feed: off} 의 전 이력, 또는 {@link Part#TOC} 목차, 또는 "없음")와 버전 본문들({@link Part#BODY})을 둔다.
 * 지움 기록은 정의 키 하나에 남기고 본문을 넣을 때도 그 기록을 본다 — 본문 키로 찾으면 지움 전에 시작한 본문 적재가 지운 뒤에 옛 값을 다시 넣는다.
 * 본문만 지울 때(관리 화면 본문 재등록)는 본문 키 기록을 따로 남긴다. 본문 유휴 수명은 최종 버전이면 {@code max-idle}, 아니면(옛·예약 버전,
 * 목차 없음) {@code old-version-max-idle} 이다. 최종 여부는 묶음에 기억한 (고른 버전, 다음 경계)로 판정하고 경계가 지나면 다시 고른다 — 두 선택
 * 규칙 모두 결과가 경계에서만 바뀐다. 시계는 앞으로만 간다고 본다. 상한은 머리와 본문을 합해 센다.
```

```java
    /** 항목 구분(D-154). VALUE 는 값 하나, TOC 는 목차, BODY 는 버전 본문. */
    public enum Part { VALUE, TOC, BODY }

    private final int maxEntries;
    private final int trimTarget;
    private final Duration maxAge;
    private final Duration maxIdle;
    /** 옛 버전·예약 버전·목차 없는 본문의 유휴 수명(결정 P6·P9). */
    private final Duration oldVersionMaxIdle;
    private final Clock clock;
    private final Map<MdmTargetType, ConcurrentHashMap<String, Group>> maps = new EnumMap<>(MdmTargetType.class);
    private final ConcurrentHashMap<String, Tombstone> tombstones = new ConcurrentHashMap<>();
    private final AtomicLong generation = new AtomicLong();
    private final AtomicLong stamps = new AtomicLong();
    private volatile long appliedSeq = -1L;
    private volatile long trimPasses;

    /** 유휴 수명을 절대 상한과 같게 둔다 — 적재 뒤 {@code maxAge} 만 보는 예전 동작이다. */
    public MdmMetaCache(int maxEntries, Duration maxAge, Clock clock) {
        this(maxEntries, maxAge, maxAge, clock);
    }

    /** 옛 버전 본문 수명을 {@code maxIdle} 과 같게 둔다(D-154 전 동작). */
    public MdmMetaCache(int maxEntries, Duration maxAge, Duration maxIdle, Clock clock) {
        this(maxEntries, maxAge, maxIdle, maxIdle, clock);
    }

    /**
     * @param maxAge            적재 뒤 절대 상한
     * @param maxIdle           마지막 조회 뒤 유휴 수명 — 값·목차·최종 본문
     * @param oldVersionMaxIdle 옛 버전·예약 버전·목차 없는 본문의 유휴 수명
     */
    public MdmMetaCache(int maxEntries, Duration maxAge, Duration maxIdle, Duration oldVersionMaxIdle, Clock clock) {
        this.maxEntries = Math.max(1, maxEntries);
        this.trimTarget = Math.max(1, (int) (this.maxEntries * TRIM_TARGET_RATIO));
        this.maxAge = maxAge;
        this.maxIdle = maxIdle;
        this.oldVersionMaxIdle = oldVersionMaxIdle;
        this.clock = clock;
        for (MdmTargetType t : MdmTargetType.values()) {
            maps.put(t, new ConcurrentHashMap<>());
        }
    }

    /** 캐시 한 칸. {@code value} 가 null 이면 "MDM 에 없음"이다(본문은 늘 값이 있다). */
    public static final class Entry {
        private final Object value;
        private final Instant loadedAt;
        private final long loadSeq;
        private final long bytes;
        private final Part part;
        /** 본문의 ver 키(scale 3). 머리는 null. */
        private final String ver;
        private final AtomicLong hits = new AtomicLong();
        private volatile long lastAccessMillis;

        Entry(Object value, Instant loadedAt, long loadSeq, long bytes, Part part, String ver) {
            this.value = value;
            this.loadedAt = loadedAt.truncatedTo(ChronoUnit.MILLIS);
            this.loadSeq = loadSeq;
            this.bytes = bytes;
            this.part = part;
            this.ver = ver;
            this.lastAccessMillis = this.loadedAt.toEpochMilli();
        }

        public Object value() { return value; }
        public boolean absent() { return value == null; }
        public Instant loadedAt() { return loadedAt; }
        public long loadSeq() { return loadSeq; }
        public long hits() { return hits.get(); }
        public long bytes() { return bytes; }
        public Instant lastAccessAt() { return Instant.ofEpochMilli(lastAccessMillis); }
        public Part part() { return part; }
        public String ver() { return ver; }
    }

    /** 정의 키 하나의 묶음 — 머리와 버전 본문들. 머리·본문을 넣고 묶음을 지우는 일은 {@code this} 잠금 안에서만 한다. */
    private static final class Group {
        final AtomicReference<Entry> head = new AtomicReference<>();
        final ConcurrentHashMap<String, Entry> bodies = new ConcurrentHashMap<>();
        /** 목차로 고른 최종 버전과 다시 골라야 하는 시각 — 한 값으로 바꾼다. null 이면 아직 고르지 않았다. */
        volatile Current current;

        boolean isEmpty() {
            return head.get() == null && bodies.isEmpty();
        }
    }

    /** 최종 버전(없으면 null)과 그 판정이 맞는 마지막 시각(이 시각 전까지, KST). */
    private record Current(String ver, LocalDateTime until) {
    }

    /** 관리 화면용 항목 한 줄. {@code key} 는 논리 키(본문은 {@code X@ver}), {@code current} 는 본문만(최종 버전이면 참). */
    public record EntryView(MdmTargetType type, String key, boolean absent, Object value, Instant loadedAt, long hits,
                            long remainingSeconds, long loadSeq, Instant lastAccessAt, long bytes, Part part, String ver, Boolean current) {
    }

    public Duration oldVersionMaxIdle() {
        return oldVersionMaxIdle;
    }

    // ------------------------------------------------------------------ 머리(값·목차)

    public Optional<Entry> get(MdmTargetType type, String key) {
        Group g = maps.get(type).get(key);
        Entry e = g == null ? null : g.head.get();
        if (e == null) {
            return Optional.empty();
        }
        Instant now = clock.instant();
        if (expired(type, g, e, now)) { // 연장하기 전의 마지막 조회 시각으로 판정한다
            g.head.compareAndSet(e, null);
            return Optional.empty();
        }
        touch(e, now);
        return Optional.of(e);
    }

    public boolean put(MdmTargetType type, String key, Object value, Ticket ticket) {
        long bytes = sizeOf(value);
        synchronized (this) {
            boolean put = putHead(type, key, value, Part.VALUE, bytes, ticket, clock.instant());
            trimIfOver();
            return put;
        }
    }

    public Set<String> putAll(MdmTargetType type, Map<String, Object> values, Ticket ticket) {
        return putHeads(type, values, Part.VALUE, ticket);
    }

    /** 목차 묶음(D-154). 값이 null 이면 "MDM 에 없음". 목차를 바꾸면 그 묶음의 최종 버전을 다시 고른다. */
    public Set<String> putTocs(MdmTargetType type, Map<String, MdmToc> tocs, Ticket ticket) {
        return putHeads(type, new LinkedHashMap<>(tocs), Part.TOC, ticket);
    }

    private Set<String> putHeads(MdmTargetType type, Map<String, ?> values, Part part, Ticket ticket) {
        Map<String, Long> sizes = new HashMap<>(); // 직렬화는 잠금 밖에서
        values.forEach((key, value) -> sizes.put(key, sizeOf(value)));
        synchronized (this) {
            Instant now = clock.instant();
            Set<String> put = new LinkedHashSet<>();
            values.forEach((key, value) -> {
                if (putHead(type, key, value, part, sizes.get(key), ticket, now)) {
                    put.add(key);
                }
            });
            trimIfOver();
            return put;
        }
    }

    // ------------------------------------------------------------------ 본문

    public Optional<Entry> getBody(MdmTargetType type, String key, String ver) {
        Group g = maps.get(type).get(key);
        Entry e = g == null ? null : g.bodies.get(ver);
        if (e == null) {
            return Optional.empty();
        }
        Instant now = clock.instant();
        if (expired(type, g, e, now)) {
            g.bodies.remove(ver, e);
            return Optional.empty();
        }
        touch(e, now);
        return Optional.of(e);
    }

    /** 본문 묶음(D-154). 정의 키의 지움 기록과 그 본문 키의 지움 기록을 모두 본다. @return 실제로 넣은 키 */
    public Set<MdmBodyKey> putBodies(MdmTargetType type, Map<MdmBodyKey, Object> bodies, Ticket ticket) {
        Map<MdmBodyKey, Long> sizes = new HashMap<>();
        bodies.forEach((key, value) -> sizes.put(key, sizeOf(value)));
        synchronized (this) {
            Instant now = clock.instant();
            Set<MdmBodyKey> put = new LinkedHashSet<>();
            bodies.forEach((key, value) -> {
                if (putBody(type, key, value, sizes.get(key), ticket, now)) {
                    put.add(key);
                }
            });
            trimIfOver();
            return put;
        }
    }

    // ------------------------------------------------------------------ 지움

    /** 폴링이 받은 변경 하나 — 정의 키의 묶음(머리 + 본문 전부)을 지우고 정의 키에 지움 기록을 남긴다. */
    public synchronized void evict(MdmTargetType type, String key, long seq) {
        maps.get(type).remove(key);
        tombstone(id(type, key), seq);
    }

    /** 이 인스턴스만 묶음째 지운다(관리 화면 load·NOT_RELEASED 재시도). 순번 없는 지움 기록(표지만)을 남긴다. */
    public synchronized void evictLocal(MdmTargetType type, String key) {
        maps.get(type).remove(key);
        tombstone(id(type, key), Long.MIN_VALUE);
    }

    /** 이 인스턴스에서 본문 하나만 지운다(관리 화면 본문 재등록). 그 본문 키에만 순번 없는 지움 기록을 남긴다. */
    public synchronized void evictLocalBody(MdmTargetType type, String key, String ver) {
        Group g = maps.get(type).get(key);
        if (g != null) {
            g.bodies.remove(ver);
            if (g.isEmpty()) {
                maps.get(type).remove(key, g);
            }
        }
        tombstone(bodyId(type, key, ver), Long.MIN_VALUE);
    }

    /** 통째로 비운다(기동·truncated·역행, §5.3). 그 전에 시작한 적재는 넣지 않는다. */
    public synchronized void clear(long newAppliedSeq) {
        maps.values().forEach(Map::clear);
        tombstones.clear();
        generation.incrementAndGet();
        appliedSeq = newAppliedSeq;
    }

    /** 폴링이 순번을 반영한 뒤 부른다. 5분 지난 지움 기록을 정리하고 만료된 머리·본문과 빈 묶음을 쓸어 낸다(본문을 먼저 본다 — 최종 판정에 목차를 쓴다). */
    public synchronized void markApplied(long seq) {
        appliedSeq = seq;
        Instant now = clock.instant();
        Instant limit = now.minus(TOMBSTONE_TTL);
        tombstones.values().removeIf(t -> t.at().isBefore(limit));
        for (Map.Entry<MdmTargetType, ConcurrentHashMap<String, Group>> m : maps.entrySet()) {
            MdmTargetType type = m.getKey();
            m.getValue().forEach((key, g) -> {
                g.bodies.forEach((ver, b) -> {
                    if (expired(type, g, b, now)) {
                        g.bodies.remove(ver, b);
                    }
                });
                Entry h = g.head.get();
                if (h != null && expired(type, g, h, now)) {
                    g.head.compareAndSet(h, null);
                }
                if (g.isEmpty()) {
                    m.getValue().remove(key, g);
                }
            });
        }
    }

    // ------------------------------------------------------------------ 관리 화면(읽기만)

    /** 종류별 살아 있는 항목 수(머리 + 본문). */
    public Map<MdmTargetType, Integer> sizes() {
        return count(true);
    }

    /** 종류별 살아 있는 본문 수(D-154 상태 응답 {@code bodyCounts}). */
    public Map<MdmTargetType, Integer> bodySizes() {
        return count(false);
    }

    private Map<MdmTargetType, Integer> count(boolean withHeads) {
        Instant now = clock.instant();
        Map<MdmTargetType, Integer> out = new EnumMap<>(MdmTargetType.class);
        maps.forEach((t, m) -> {
            int n = 0;
            for (Group g : m.values()) {
                Entry h = g.head.get();
                if (withHeads && h != null && !expired(t, g, h, now)) {
                    n++;
                }
                for (Entry b : g.bodies.values()) {
                    if (!expired(t, g, b, now)) {
                        n++;
                    }
                }
            }
            out.put(t, n);
        });
        return out;
    }

    /** 종류별 추정 크기 합계 — {@link #sizes} 와 같은 항목. 잴 수 없는 항목(-1)은 뺀다. */
    public Map<MdmTargetType, Long> bytes() {
        Instant now = clock.instant();
        Map<MdmTargetType, Long> out = new EnumMap<>(MdmTargetType.class);
        maps.forEach((t, m) -> {
            long sum = 0;
            for (Group g : m.values()) {
                Entry h = g.head.get();
                if (h != null && h.bytes() > 0 && !expired(t, g, h, now)) {
                    sum += h.bytes();
                }
                for (Entry b : g.bodies.values()) {
                    if (b.bytes() > 0 && !expired(t, g, b, now)) {
                        sum += b.bytes();
                    }
                }
            }
            out.put(t, sum);
        });
        return out;
    }

    /** 항목 하나를 읽기만 한다. 버전 대상이면 {@code key} 는 논리 키({@code X} 또는 {@code X@1.000})다. */
    public Optional<EntryView> peek(MdmTargetType type, String key) {
        if (type == null || key == null) {
            return Optional.empty();
        }
        MdmVersions.LogicalKey lk = MdmVersions.isVersioned(type) ? MdmVersions.parse(key) : new MdmVersions.LogicalKey(key, null);
        Group g = maps.get(type).get(lk.key());
        if (g == null) {
            return Optional.empty();
        }
        Entry e = lk.isBody() ? g.bodies.get(lk.ver()) : g.head.get();
        Instant now = clock.instant();
        if (e == null || expired(type, g, e, now)) {
            return Optional.empty();
        }
        return Optional.of(view(type, lk.key(), g, e, now));
    }

    /** 대상 종류(null 이면 전체)·논리 키 부분 일치(대소문자 무시)로 거른 항목. 종류·논리 키 순. 읽기만 한다. */
    public List<EntryView> entries(MdmTargetType type, String q) {
        Instant now = clock.instant();
        String needle = q == null || q.isBlank() ? null : q.trim().toUpperCase(Locale.ROOT);
        List<EntryView> out = new ArrayList<>();
        for (MdmTargetType t : MdmTargetType.values()) {
            if (type != null && type != t) {
                continue;
            }
            maps.get(t).forEach((key, g) -> {
                Entry h = g.head.get();
                if (h != null && !expired(t, g, h, now) && matches(needle, key)) {
                    out.add(view(t, key, g, h, now));
                }
                g.bodies.forEach((ver, b) -> {
                    if (!expired(t, g, b, now) && matches(needle, MdmVersions.logical(key, ver))) {
                        out.add(view(t, key, g, b, now));
                    }
                });
            });
        }
        out.sort(Comparator.comparing((EntryView v) -> v.type().ordinal()).thenComparing(EntryView::key));
        return out;
    }

    private static boolean matches(String needle, String logicalKey) {
        return needle == null || logicalKey.toUpperCase(Locale.ROOT).contains(needle);
    }

    private EntryView view(MdmTargetType type, String key, Group g, Entry e, Instant now) {
        long lastAccess = e.lastAccessMillis;
        long remaining = Math.max(0L, Duration.between(now, expiresAt(e, lastAccess, idle(type, g, e, now))).getSeconds());
        Boolean current = e.part == Part.BODY ? isCurrent(type, g, e.ver, now) : null;
        return new EntryView(type, MdmVersions.logical(key, e.ver), e.absent(), e.value(), e.loadedAt(), e.hits(), remaining, e.loadSeq(),
                Instant.ofEpochMilli(lastAccess), e.bytes(), e.part, e.ver, current);
    }

    int tombstoneCount() {
        return tombstones.size();
    }

    /** 시험용 — 맵에 실제로 남은 칸 수(머리 + 본문, 아직 쓸리지 않은 만료 항목 포함). */
    int storedCount(MdmTargetType type) {
        int n = 0;
        for (Group g : maps.get(type).values()) {
            n += (g.head.get() == null ? 0 : 1) + g.bodies.size();
        }
        return n;
    }

    long trimPasses() {
        return trimPasses;
    }

    // ------------------------------------------------------------------ 내부

    private static void touch(Entry e, Instant now) {
        e.lastAccessMillis = now.toEpochMilli();
        e.hits.incrementAndGet();
    }

    /** 잠금 안에서 부른다. */
    private boolean putHead(MdmTargetType type, String key, Object value, Part part, long bytes, Ticket ticket, Instant now) {
        if (ticket.generation() != generation.get() || blocked(id(type, key), ticket)) {
            return false;
        }
        Group g = maps.get(type).computeIfAbsent(key, k -> new Group());
        g.head.set(new Entry(value, now, ticket.appliedSeq(), bytes, part, null));
        if (part == Part.TOC) {
            g.current = null;
        }
        return true;
    }

    /** 잠금 안에서 부른다. 정의 키 기록과 본문 키 기록 둘 다 본다. */
    private boolean putBody(MdmTargetType type, MdmBodyKey k, Object value, long bytes, Ticket ticket, Instant now) {
        if (ticket.generation() != generation.get() || blocked(id(type, k.key()), ticket) || blocked(bodyId(type, k.key(), k.ver()), ticket)) {
            return false;
        }
        Group g = maps.get(type).computeIfAbsent(k.key(), x -> new Group());
        g.bodies.put(k.ver(), new Entry(value, now, ticket.appliedSeq(), bytes, Part.BODY, k.ver()));
        return true;
    }

    private boolean blocked(String id, Ticket ticket) {
        Tombstone t = tombstones.get(id);
        return t != null && (t.seq() > ticket.appliedSeq() || t.stamp() > ticket.stamp());
    }

    /** 잠금 안에서 부른다. */
    private void tombstone(String id, long seq) {
        long stamp = stamps.incrementAndGet();
        Instant now = clock.instant();
        tombstones.merge(id, new Tombstone(seq, now, stamp),
                (old, fresh) -> new Tombstone(Math.max(old.seq(), fresh.seq()), fresh.at(), fresh.stamp()));
    }

    /** 잠금 안에서 부른다. 머리와 본문을 합해 세고, 넘으면 만료 먼저·그다음 오래 조회되지 않은 순(LRU)으로 목표치까지 줄인다. */
    private void trimIfOver() {
        int total = 0;
        for (ConcurrentHashMap<String, Group> m : maps.values()) {
            for (Group g : m.values()) {
                total += (g.head.get() == null ? 0 : 1) + g.bodies.size();
            }
        }
        if (total <= maxEntries) {
            return;
        }
        trimPasses++;
        Instant now = clock.instant();
        record Slot(Group group, String ver, Entry entry, long lastAccess) {
        }
        List<Slot> live = new ArrayList<>();
        for (Map.Entry<MdmTargetType, ConcurrentHashMap<String, Group>> m : maps.entrySet()) {
            MdmTargetType type = m.getKey();
            for (Group g : m.getValue().values()) {
                g.bodies.forEach((ver, b) -> {
                    if (expired(type, g, b, now)) {
                        g.bodies.remove(ver, b);
                    } else {
                        live.add(new Slot(g, ver, b, b.lastAccessMillis));
                    }
                });
                Entry h = g.head.get();
                if (h != null) {
                    if (expired(type, g, h, now)) {
                        g.head.compareAndSet(h, null);
                    } else {
                        live.add(new Slot(g, null, h, h.lastAccessMillis));
                    }
                }
            }
        }
        int over = live.size() - trimTarget;
        if (over > 0) {
            live.sort(Comparator.comparingLong(Slot::lastAccess));
            for (int i = 0; i < over; i++) {
                Slot s = live.get(i);
                if (s.ver() == null) {
                    s.group().head.compareAndSet(s.entry(), null);
                } else {
                    s.group().bodies.remove(s.ver(), s.entry());
                }
            }
        }
        maps.values().forEach(m -> m.forEach((k, g) -> {
            if (g.isEmpty()) {
                m.remove(k, g);
            }
        }));
    }

    /** 본문이고 최종 버전이 아니면 {@code old-version-max-idle}, 그 밖은 {@code max-idle}. */
    private Duration idle(MdmTargetType type, Group g, Entry e, Instant now) {
        return e.part == Part.BODY && !isCurrent(type, g, e.ver, now) ? oldVersionMaxIdle : maxIdle;
    }

    private boolean expired(MdmTargetType type, Group g, Entry e, Instant now) {
        return !expiresAt(e, e.lastAccessMillis, idle(type, g, e, now)).isAfter(now);
    }

    /** 두 기한 중 이른 쪽 — 마지막 조회 + 유휴 수명, 적재 + maxAge. */
    private Instant expiresAt(Entry e, long lastAccessMillis, Duration idle) {
        Instant byIdle = Instant.ofEpochMilli(lastAccessMillis).plus(idle);
        Instant byAge = e.loadedAt().plus(maxAge);
        return byIdle.isBefore(byAge) ? byIdle : byAge;
    }

    /**
     * 최종 버전인가(스펙 §5.5) — 살아 있는 목차가 있을 때만. 묶음에 기억한 판정이 다음 경계 전이면 그대로 쓰고, 경계를 지났거나 처음이면 목차와 지금
     * 시각(KST)으로 다시 고른다. 목차가 없거나 만료됐으면 옛 버전이다.
     */
    private boolean isCurrent(MdmTargetType type, Group g, String ver, Instant now) {
        Entry head = g.head.get();
        if (head == null || head.part != Part.TOC || !(head.value instanceof MdmToc toc)
                || !expiresAt(head, head.lastAccessMillis, maxIdle).isAfter(now)) {
            return false;
        }
        LocalDateTime t = LocalDateTime.ofInstant(now, MdmDefinitionLookup.KST);
        Current c = g.current;
        if (c == null || !t.isBefore(c.until())) {
            c = new Current(MdmVersionSelector.select(type, toc, t).orElse(null), MdmVersionSelector.nextBoundary(toc, t));
            g.current = c;
        }
        return ver.equals(c.ver());
    }

    static long sizeOf(Object value) {
        if (value == null) {
            return 0L;
        }
        try {
            return MdmJson.MAPPER.writeValueAsBytes(value).length;
        } catch (Exception e) {
            return -1L;
        }
    }

    private static String id(MdmTargetType type, String key) {
        return type.name() + ':' + key;
    }

    private static String bodyId(MdmTargetType type, String key, String ver) {
        return type.name() + ':' + MdmVersions.logical(key, ver);
    }
```

import 에 `java.time.LocalDateTime`, `java.util.LinkedHashMap`, `java.util.concurrent.atomic.AtomicReference` 를 더한다.

- [ ] **Step 4: 설정과 자동 설정을 고친다**

`MdmClientProperties` 에 `maxIdle` 아래로 더한다.

```java
    /** 옛 버전·예약 버전 본문의 유휴 수명(D-154 결정 P6·P9). 목차·최종 본문은 {@code max-idle}. */
    private Duration oldVersionMaxIdle = Duration.ofMinutes(10);

    public Duration getOldVersionMaxIdle() { return oldVersionMaxIdle; }
    public void setOldVersionMaxIdle(Duration v) { this.oldVersionMaxIdle = v; }
```

`MdmAutoConfiguration.mdmMetaCache` 는 `new MdmMetaCache(props.getMaxEntries(), props.getMaxAge(), props.getMaxIdle(), props.getOldVersionMaxIdle(), Clock.systemUTC())` 로 바꾼다.

- [ ] **Step 5: 시험을 돌린다**

Run:
- `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :cactus-core:test --tests 'com.dongkuk.dmes.cactus.mdm.*'`
- `cd src/backend/mls && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mls.lsh.noticeMgmt.NoticeMgmtMdmRealValidatorTest'`
- `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mdm.feed.MdmMetaFeedContractHttpTest'`

Expected: 모두 PASS(기존 `MdmMetaCacheTest` 26건 포함).

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmMetaCache.java src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmClientProperties.java src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmAutoConfiguration.java src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmMetaCacheVersionedTest.java src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmAutoConfigurationTest.java
/usr/bin/git commit -m "feat(cactus): MDM 메타 캐시를 정의 키 묶음(목차 + 버전 본문)으로 바꾸고 옛 버전 본문 수명을 따로 둔다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: cactus — `MdmMetaService.lookupAt`(목차 → 선택 → 본문), 물러남, `versioned-feed: off`

스펙 §5.2(적재 흐름)·§5.6(가)(NOT_RELEASED 재시도)·§5.8(물러남)·§5.9(장애). 버전 대상의 새 입구다. 4인자 생성자의 `versioned` 가 참이면 목차·본문 경로, 거짓이면 지금 전 이력 경로(값 하나)를 쓰되 결과는 같은 `MdmAt` 모양으로 준다 — 소비자 경로는 하나다. 3인자 생성자는 거짓(지금 동작)이라 mls·MDM 시험이 그대로 돈다. 운영 배선은 Task 17 이 바꾼다. 버전 경로에서 `lookup`·`one`·`cached`·`reload` 에 버전 대상을 넘기면 `IllegalStateException` 이다(잘못 쓴 소비자를 일찍 드러낸다).

**Files:**
- Create: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmLegacyValues.java`
- Modify: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmMetaService.java`
- Modify: `src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/FakeMetaFeed.java`(새 MDM 흉내)
- Create: `src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmMetaServiceVersionedTest.java`

**Interfaces:**
- Consumes: Task 8 값 타입, Task 9 `MdmMetaFeed.fetchToc/fetchBodies`·결과 타입, Task 10 캐시 API, Task 3 `CodeVersionSlicer`, 기존 `CodeRowsProjection`.
- Produces:
  - `MdmLegacyValues.toc(MdmTargetType, Object full) : MdmToc`, `rawBody(MdmTargetType, Object full, String ver) : Optional<Object>`(CODE 는 `CodeVersionSlice`), `body(MdmTargetType, Object full, String ver) : Optional<Object>`(CODE 는 `MdmCodeVersion.sliced`).
  - `MdmMetaService(MdmMetaFeed, MdmMetaCache, Clock, boolean versioned)`, `versioned()`, `now()`.
  - `record MdmAt(MdmToc toc, String ver, Object body)` — ver·body null 은 "적용 버전 없음"(룰·세트·전문). body 타입: RULE `RuleDefinition`, RULE_SET `RuleSetDefinition`, LAYOUT `MdmLayoutVersion`, CODE `MdmCodeVersion`.
  - `record MdmAtLookup(Map<String, MdmAt> found, List<String> missing, List<String> unavailable)` — 요청 순서.
  - `record CachedRead(boolean cached, Object value)`.
  - `lookupAt(MdmTargetType, Collection<String> keys, Instant t) : MdmAtLookup`, `oneAt(MdmTargetType, String key, Instant t) : Optional<MdmAt>`(받을 수 없으면 `MdmUnavailableException`), `toc(MdmTargetType, String key) : Optional<MdmToc>`, `body(MdmTargetType, String key, String ver) : Optional<Object>`, `cachedToc(MdmTargetType, String key) : CachedRead`, `cachedBody(MdmTargetType, String key, String ver) : CachedRead`, `reloadAt(MdmTargetType, Collection<String> logicalKeys, Instant t) : MdmAtLookup`(found 의 키는 요청한 논리 키).
  - `FakeMetaFeed.versioned()`(새 MDM 흉내로 바꾼다), `tocCalls`·`bodyCalls`·`tocKeys`·`bodyKeys`·`tocAts`·`notReleasedOnce`·`notReleasedAlways`·`omitCurrent`.

- [ ] **Step 1: 가짜 피드에 새 MDM 흉내를 더한다**

`FakeMetaFeed` 에 필드와 두 메서드를 더하고, 기존 `fetch` 의 문(gate)·오류 부분을 `enterAndMaybeFail()` 로 꺼내 같이 쓴다(동작 불변).

```java
    /** 참이면 새 MDM 처럼 part 를 안다(fetchToc·fetchBodies 를 직접 답한다). 거짓이면 옛 MDM — default 메서드가 fetch 를 부른다. */
    volatile boolean versioned;
    /** 목차 응답에서 current 를 빼는가(본문 요청 경로를 강제한다). */
    volatile boolean omitCurrent;
    final AtomicInteger tocCalls = new AtomicInteger();
    final AtomicInteger bodyCalls = new AtomicInteger();
    final List<List<String>> tocKeys = new CopyOnWriteArrayList<>();
    final List<LocalDateTime> tocAts = new CopyOnWriteArrayList<>();
    final List<List<MdmBodyKey>> bodyKeys = new CopyOnWriteArrayList<>();
    /** 다음 본문 요청에서 한 번 NOT_RELEASED 로 답할 쌍 — 목차가 낡은 상황. */
    final Set<MdmBodyKey> notReleasedOnce = ConcurrentHashMap.newKeySet();
    /** 늘 NOT_RELEASED 로 답할 쌍. */
    final Set<MdmBodyKey> notReleasedAlways = ConcurrentHashMap.newKeySet();

    FakeMetaFeed versioned() {
        this.versioned = true;
        return this;
    }

    @Override
    public MdmTocResult fetchToc(MdmTargetType type, Collection<String> keys, LocalDateTime at) {
        if (!versioned) {
            return MdmMetaFeed.super.fetchToc(type, keys, at);
        }
        tocCalls.incrementAndGet();
        tocKeys.add(List.copyOf(keys));
        tocAts.add(at);
        Map<String, MdmToc> tocs = new LinkedHashMap<>();
        Map<String, MdmCurrent> current = new LinkedHashMap<>();
        Map<String, String> failed = new LinkedHashMap<>();
        for (String k : keys) {
            if (failedKeys.containsKey(k)) {
                failed.put(k, failedKeys.get(k));
                continue;
            }
            Object full = values.get(type).get(k);
            if (full == null) {
                continue;
            }
            MdmToc toc = MdmLegacyValues.toc(type, full);
            tocs.put(k, toc);
            if (at != null && !omitCurrent) {
                MdmVersionSelector.select(type, toc, at)
                        .flatMap(v -> MdmLegacyValues.rawBody(type, full, v).map(b -> new MdmCurrent(v, b)))
                        .ifPresent(c -> current.put(k, c));
            }
        }
        enterAndMaybeFail();
        return new MdmTocResult(tocs, current, Map.of(), failed);
    }

    @Override
    public MdmBodyResult fetchBodies(MdmTargetType type, Collection<MdmBodyKey> keys) {
        if (!versioned) {
            return MdmMetaFeed.super.fetchBodies(type, keys);
        }
        bodyCalls.incrementAndGet();
        bodyKeys.add(List.copyOf(keys));
        Map<MdmBodyKey, Object> found = new LinkedHashMap<>();
        Map<MdmBodyKey, String> failed = new LinkedHashMap<>();
        for (MdmBodyKey k : keys) {
            if (notReleasedOnce.remove(k) || notReleasedAlways.contains(k)) {
                failed.put(k, "NOT_RELEASED");
                continue;
            }
            if (failedKeys.containsKey(k.key())) {
                failed.put(k, failedKeys.get(k.key()));
                continue;
            }
            Object full = values.get(type).get(k.key());
            Optional<Object> body = full == null ? Optional.empty() : MdmLegacyValues.rawBody(type, full, k.ver());
            if (body.isPresent()) {
                found.put(k, body.get());
            } else {
                failed.put(k, "NOT_RELEASED");
            }
        }
        enterAndMaybeFail();
        return new MdmBodyResult(found, failed, Map.of(), Map.of(), Set.of());
    }

    /** MDM 이 값을 읽은 시점 = 호출 시점. 문(gate)에서 기다리는 동안 바뀐 값은 이 응답에 들어가지 않는다. */
    private void enterAndMaybeFail() {
        CountDownLatch gate = fetchGate;
        fetchEntered.countDown();
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
    }
```

import: `java.time.LocalDateTime`, `java.util.Optional`, `java.util.Set`.

- [ ] **Step 2: 실패하는 시험을 쓴다**

```java
package com.dongkuk.dmes.cactus.mdm;

import static com.dongkuk.dmes.cactus.mdm.MdmDefinitionLookupTest.rule;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * D-154 — 버전 대상 적재 흐름(스펙 §5.2·§5.6·§5.8·§5.9). 시계 0 시 = KST 2026-10-03 00:00. 룰 R: 1.000 [2026-01-01, 01:00), 2.000 [01:00, 열린 끝).
 */
class MdmMetaServiceVersionedTest {

    private static final Instant T0 = Instant.parse("2026-10-02T15:00:00Z");
    private static final LocalDateTime KST0 = LocalDateTime.parse("2026-10-03T00:00:00");
    private static final Instant PAST = Instant.parse("2026-05-31T15:00:00Z"); // KST 2026-06-01 — 1.000

    private MutableClock clock;
    private FakeMetaFeed feed;
    private MdmMetaCache cache;
    private MdmMetaService service;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(T0);
        feed = new FakeMetaFeed().versioned();
        feed.put(MdmTargetType.RULE, "R", List.of(
                rule("1.000", LocalDateTime.parse("2026-01-01T00:00:00"), KST0.plusHours(1)),
                rule("2.000", KST0.plusHours(1), null)));
        cache = new MdmMetaCache(1000, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        cache.clear(0);
        service = new MdmMetaService(feed, cache, clock, true);
    }

    private static BigDecimal verOf(MdmMetaService.MdmAt at) {
        return ((RuleDefinition) at.body()).ver();
    }

    @Test
    void 목차_미스는_TOC_at_한_번이고_current_가_맞으면_본문을_따로_받지_않는다() {
        MdmMetaService.MdmAtLookup r = service.lookupAt(MdmTargetType.RULE, List.of("R"), T0);

        assertThat(r.found().get("R").ver()).isEqualTo("1.000");
        assertThat(verOf(r.found().get("R"))).isEqualByComparingTo("1.000");
        assertThat(feed.tocCalls.get()).isEqualTo(1);
        assertThat(feed.tocAts).containsExactly(KST0);
        assertThat(feed.bodyCalls.get()).isZero();
        assertThat(cache.get(MdmTargetType.RULE, "R").orElseThrow().part()).isEqualTo(MdmMetaCache.Part.TOC);
        assertThat(cache.getBody(MdmTargetType.RULE, "R", "1.000")).isPresent();

        service.lookupAt(MdmTargetType.RULE, List.of("R"), T0);
        assertThat(feed.tocCalls.get()).as("두 번째는 캐시").isEqualTo(1);
    }

    @Test
    void 목차가_있고_고른_버전의_본문이_없으면_본문만_묶어_받는다() {
        feed.put(MdmTargetType.RULE, "S", List.of(rule("1.000", LocalDateTime.parse("2026-01-01T00:00:00"), null)));
        service.lookupAt(MdmTargetType.RULE, List.of("R", "S"), clock.instant().plus(Duration.ofHours(2))); // 목차 + 2.000·1.000

        service.lookupAt(MdmTargetType.RULE, List.of("R", "S"), PAST);

        assertThat(feed.tocCalls.get()).isEqualTo(1);
        assertThat(feed.bodyCalls.get()).as("R@1.000 만 미스 — S@1.000 은 current 로 받았다").isEqualTo(1);
        assertThat(feed.bodyKeys.get(0)).containsExactly(new MdmBodyKey("R", "1.000"));
    }

    @Test
    void 적용_버전_없음은_없음과_다르다() {
        feed.put(MdmTargetType.RULE, "LATER", List.of(rule("1.000", LocalDateTime.parse("2027-01-01T00:00:00"), null)));

        MdmMetaService.MdmAtLookup r = service.lookupAt(MdmTargetType.RULE, List.of("LATER", "NO"), T0);

        assertThat(r.found().get("LATER").ver()).isNull();
        assertThat(r.found().get("LATER").body()).isNull();
        assertThat(r.found().get("LATER").toc().versions()).hasSize(1);
        assertThat(r.missing()).containsExactly("NO");
        assertThat(r.unavailable()).isEmpty();
    }

    @Test
    void NOT_RELEASED_면_묶음을_지우고_목차부터_한_번만_다시_받는다() {
        service.lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant().plus(Duration.ofHours(2))); // 목차 + 2.000
        feed.notReleasedOnce.add(new MdmBodyKey("R", "1.000"));

        MdmMetaService.MdmAtLookup r = service.lookupAt(MdmTargetType.RULE, List.of("R"), PAST);

        assertThat(r.found().get("R").ver()).isEqualTo("1.000");
        assertThat(feed.tocCalls.get()).as("처음 + 재시도").isEqualTo(2);
    }

    @Test
    void 두_번째에도_어긋나면_받을_수_없음이고_없음으로_캐시하지_않는다() {
        feed.omitCurrent = true;
        feed.notReleasedAlways.add(new MdmBodyKey("R", "1.000"));

        MdmMetaService.MdmAtLookup r = service.lookupAt(MdmTargetType.RULE, List.of("R"), T0);

        assertThat(r.unavailable()).containsExactly("R");
        assertThat(r.missing()).isEmpty();
        assertThat(feed.tocCalls.get()).isEqualTo(2);
        assertThat(feed.bodyCalls.get()).isEqualTo(2);
    }

    @Test
    void 예약_버전의_적용_시작이_지나면_쓰기_없이_새_버전_본문을_받는다() {
        assertThat(service.lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant()).found().get("R").ver()).isEqualTo("1.000");
        clock.advance(Duration.ofMinutes(30));
        service.lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant()); // 목차 조회 — 유휴 수명(60분)을 연장한다

        clock.advance(Duration.ofMinutes(30)); // KST 01:00 — 2.000 적용 시작
        MdmMetaService.MdmAtLookup r = service.lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant());

        assertThat(r.found().get("R").ver()).isEqualTo("2.000");
        assertThat(feed.tocCalls.get()).as("목차는 캐시").isEqualTo(1);
        assertThat(feed.bodyCalls.get()).isEqualTo(1);
    }

    @Test
    void MDM_이_멈췄는데_고른_버전_본문이_없으면_다른_버전으로_대신하지_않고_받을_수_없음이다() {
        service.lookupAt(MdmTargetType.RULE, List.of("R"), T0); // 목차 + 1.000
        feed.fetchError = new MdmUnavailableException("MDM 연결 실패");

        MdmMetaService.MdmAtLookup r = service.lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant().plus(Duration.ofHours(2)));

        assertThat(r.unavailable()).containsExactly("R");
        assertThat(service.lookupAt(MdmTargetType.RULE, List.of("R"), T0).found().get("R").ver()).as("캐시에 있는 본문은 계속 쓴다").isEqualTo("1.000");
    }

    @Test
    void 같은_목차_동시_적재는_한_번이고_같은_코드의_두_버전_본문은_따로_받는다() throws Exception {
        feed.omitCurrent = true;
        feed.fetchGate = new CountDownLatch(1);
        CompletableFuture<MdmMetaService.MdmAtLookup> a = CompletableFuture.supplyAsync(() -> service.lookupAt(MdmTargetType.RULE, List.of("R"), PAST));
        assertThat(feed.fetchEntered.await(5, TimeUnit.SECONDS)).isTrue();
        CompletableFuture<MdmMetaService.MdmAtLookup> b = CompletableFuture.supplyAsync(() ->
                service.lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant().plus(Duration.ofHours(2))));
        Thread.sleep(100);
        feed.fetchGate.countDown();

        assertThat(a.get(5, TimeUnit.SECONDS).found().get("R").ver()).isEqualTo("1.000");
        assertThat(b.get(5, TimeUnit.SECONDS).found().get("R").ver()).isEqualTo("2.000");
        assertThat(feed.tocCalls.get()).isEqualTo(1);
        assertThat(feed.bodyKeys.stream().flatMap(List::stream).toList())
                .containsExactlyInAnyOrder(new MdmBodyKey("R", "1.000"), new MdmBodyKey("R", "2.000"));
    }

    @Test
    void 옛_MDM_응답이면_전_이력에서_목차와_본문을_만들어_캐시하고_전_이력은_남기지_않는다() {
        FakeMetaFeed old = new FakeMetaFeed(); // versioned 아님 — default 메서드가 fetch 로 전 이력을 받는다
        old.put(MdmTargetType.CODE, "C", codeRows());
        MdmMetaService s = new MdmMetaService(old, cache, clock, true);

        MdmMetaService.MdmAt at = s.oneAt(MdmTargetType.CODE, "C", T0).orElseThrow();

        assertThat(at.ver()).isEqualTo("2.000");
        MdmCodeVersion body = (MdmCodeVersion) at.body();
        assertThat(body.isSliced()).isTrue();
        assertThat(body.members("TB")).contains(java.util.Set.of("B"));
        assertThat(cache.get(MdmTargetType.CODE, "C").orElseThrow().part()).isEqualTo(MdmMetaCache.Part.TOC);
        assertThat(cache.getBody(MdmTargetType.CODE, "C", "2.000")).isPresent();
        assertThat(old.fetchCalls.get()).isEqualTo(1);
        assertThat(at.toc().versions()).as("DRAFT 는 목차에 없다").extracting(MdmTocVersion::ver)
                .containsExactly(new BigDecimal("1.000"), new BigDecimal("2.000"));
    }

    @Test
    void versioned_feed_off_는_전_이력_한_키로_캐시하고_코드는_자르지_않는다() {
        FakeMetaFeed old = new FakeMetaFeed();
        old.put(MdmTargetType.CODE, "C", codeRows());
        old.put(MdmTargetType.RULE, "R", feed.values.get(MdmTargetType.RULE).get("R"));
        MdmMetaService off = new MdmMetaService(old, cache, clock); // 3인자 = off

        MdmMetaService.MdmAt code = off.oneAt(MdmTargetType.CODE, "C", T0).orElseThrow();
        MdmMetaService.MdmAt ruleAt = off.oneAt(MdmTargetType.RULE, "R", T0).orElseThrow();

        assertThat(off.versioned()).isFalse();
        assertThat(((MdmCodeVersion) code.body()).isSliced()).isFalse();
        assertThat(((MdmCodeVersion) code.body()).members("TB")).isEmpty();
        assertThat(ruleAt.ver()).isEqualTo("1.000");
        assertThat(cache.get(MdmTargetType.CODE, "C").orElseThrow().part()).isEqualTo(MdmMetaCache.Part.VALUE);
        assertThat(cache.bodySizes().get(MdmTargetType.CODE)).isZero();
    }

    @Test
    void 버전_경로에서_값_입구에_버전_대상을_넘기면_막는다() {
        assertThatThrownBy(() -> service.lookup(MdmTargetType.RULE, List.of("R"))).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> service.one(MdmTargetType.CODE, "C")).isInstanceOf(IllegalStateException.class);
        assertThat(service.lookup(MdmTargetType.COLUMN, List.of("X")).missing()).containsExactly("X");
    }

    @Test
    void 캐시만_읽기는_목차와_본문을_따로_알린다() {
        assertThat(service.cachedToc(MdmTargetType.RULE, "R").cached()).isFalse();
        service.lookupAt(MdmTargetType.RULE, List.of("R"), T0);
        assertThat(service.cachedToc(MdmTargetType.RULE, "R").value()).isInstanceOf(MdmToc.class);
        assertThat(service.cachedBody(MdmTargetType.RULE, "R", "1.000").cached()).isTrue();
        assertThat(service.cachedBody(MdmTargetType.RULE, "R", "2.000").cached()).isFalse();
        assertThat(feed.tocCalls.get()).isEqualTo(1);
    }

    @Test
    void reloadAt_정의_키는_목차와_최종_본문을_본문_키는_그_본문만_다시_받는다() {
        service.lookupAt(MdmTargetType.RULE, List.of("R"), T0);
        service.lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant().plus(Duration.ofHours(2))); // 2.000 본문
        int tocs = feed.tocCalls.get();
        int bodies = feed.bodyCalls.get();

        MdmMetaService.MdmAtLookup one = service.reloadAt(MdmTargetType.RULE, List.of("R@2.000"), T0);
        assertThat(one.found()).containsOnlyKeys("R@2.000");
        assertThat(feed.tocCalls.get()).isEqualTo(tocs);
        assertThat(feed.bodyCalls.get()).isEqualTo(bodies + 1);
        assertThat(cache.getBody(MdmTargetType.RULE, "R", "1.000")).as("다른 버전은 그대로").isPresent();

        MdmMetaService.MdmAtLookup all = service.reloadAt(MdmTargetType.RULE, List.of("R"), T0);
        assertThat(all.found()).containsOnlyKeys("R");
        assertThat(feed.tocCalls.get()).isEqualTo(tocs + 1);
        assertThat(cache.getBody(MdmTargetType.RULE, "R", "2.000")).as("옛 본문은 다시 받지 않는다").isEmpty();
    }

    /** RELEASED 1.000 [2026-01-01, 2026-07-01)·2.000 [2026-07-01, 열린 끝), DRAFT 2.001(초안 사본 C). TABLE TB(2.000~): B. */
    static CodeRows codeRows() {
        BigDecimal v1 = new BigDecimal("1.000");
        BigDecimal v2 = new BigDecimal("2.000");
        BigDecimal d = new BigDecimal("2.001");
        BigDecimal open = new BigDecimal("9999.000");
        return new CodeRows(new CodeHeader("C", "INUSE"),
                List.of(new CodeVersionRow(v1, "RELEASED", LocalDateTime.parse("2026-01-01T00:00:00"), LocalDateTime.parse("2026-07-01T00:00:00")),
                        new CodeVersionRow(v2, "RELEASED", LocalDateTime.parse("2026-07-01T00:00:00"), LocalDateTime.parse("9999-12-31T00:00:00")),
                        new CodeVersionRow(d, "DRAFT", null, null)),
                List.of(item("A", v1, open), item("B", v2, open), item("C", d, open)),
                List.of(new CodeCateRow("BASE", v1, open, "REGEX", ".*", "CODE"), new CodeCateRow("TB", v2, open, "TABLE", null, null)),
                List.of(new CodeCateItemRow("TB", "B", v2, open)));
    }

    private static CodeItemRow item(String code, BigDecimal from, BigDecimal to) {
        return new CodeItemRow(code, from, to, code + " 이름", null, 1, Arrays.asList(new String[5]), Arrays.asList(new String[10]));
    }
}
```

- [ ] **Step 3: 실패를 확인한다**

Run: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :cactus-core:test --tests 'com.dongkuk.dmes.cactus.mdm.MdmMetaServiceVersionedTest'`
Expected: 컴파일 실패.

- [ ] **Step 4: `MdmLegacyValues` 를 만든다**

```java
package com.dongkuk.dmes.cactus.mdm;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;
import kr.dongkuk.maru.mdm.engine.code.CodeRowsProjection;
import kr.dongkuk.maru.mdm.engine.code.CodeVersionSlice;
import kr.dongkuk.maru.mdm.engine.code.CodeVersionSlicer;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;

/**
 * 전 이력 값(지금 피드 값 모양) → 목차·본문(D-154, 스펙 §5.8 물러남). 옛 MDM 응답과 {@code versioned-feed: off} 가 쓴다. CODE 본문은 엔진
 * {@link CodeRowsProjection#releasedOnly} + {@link CodeVersionSlicer#slice} — MDM 피드 본문 생성과 같은 함수다. CODE 목차는 버전 표만 RELEASED 로
 * 거른다(투영의 versions 와 같은 결과, 행 수에 비례하는 투영을 하지 않는다).
 */
final class MdmLegacyValues {

    private static final String RELEASED = "RELEASED";

    private MdmLegacyValues() {
    }

    @SuppressWarnings("unchecked")
    static MdmToc toc(MdmTargetType type, Object full) {
        return switch (type) {
            case CODE -> {
                CodeRows rows = (CodeRows) full;
                yield new MdmToc(rows.header(), rows.versions().stream()
                        .filter(v -> RELEASED.equals(v.status()))
                        .sorted(Comparator.comparing(v -> v.ver()))
                        .map(v -> new MdmTocVersion(v.ver(), v.status(), v.applyFrom(), v.applyTo()))
                        .toList());
            }
            case RULE -> listToc((List<RuleDefinition>) full, RuleDefinition::ver, RuleDefinition::applyFrom, RuleDefinition::applyTo);
            case RULE_SET -> listToc((List<RuleSetDefinition>) full, RuleSetDefinition::ver, RuleSetDefinition::applyFrom,
                    RuleSetDefinition::applyTo);
            case LAYOUT -> listToc((List<MdmLayoutVersion>) full, MdmLayoutVersion::ver, MdmLayoutVersion::applyFrom, MdmLayoutVersion::applyTo);
            case COLUMN, DOMAIN -> throw new IllegalArgumentException("버전이 없는 대상입니다: " + type);
        };
    }

    /** 고른 ver 의 원시 본문 — CODE 는 {@link CodeVersionSlice}, 나머지는 목록 원소. 그 ver 가 RELEASED 가 아니면 빈 값. */
    @SuppressWarnings("unchecked")
    static Optional<Object> rawBody(MdmTargetType type, Object full, String ver) {
        return switch (type) {
            case CODE -> {
                CodeRows projected = CodeRowsProjection.releasedOnly((CodeRows) full);
                yield projected.versions().stream()
                        .filter(v -> MdmVersions.key(v.ver()).equals(ver))
                        .findFirst()
                        .map(v -> (Object) CodeVersionSlicer.slice(projected, v.ver()));
            }
            case RULE -> pick((List<RuleDefinition>) full, RuleDefinition::ver, ver);
            case RULE_SET -> pick((List<RuleSetDefinition>) full, RuleSetDefinition::ver, ver);
            case LAYOUT -> pick((List<MdmLayoutVersion>) full, MdmLayoutVersion::ver, ver);
            case COLUMN, DOMAIN -> throw new IllegalArgumentException("버전이 없는 대상입니다: " + type);
        };
    }

    /** 캐시 값으로 쓸 본문 — CODE 는 색인을 단 {@link MdmCodeVersion}. */
    static Optional<Object> body(MdmTargetType type, Object full, String ver) {
        return rawBody(type, full, ver).map(raw -> {
            if (type != MdmTargetType.CODE) {
                return raw;
            }
            MdmToc toc = toc(type, full);
            return MdmCodeVersion.sliced((CodeVersionSlice) raw, toc.header(), toc.version(ver).orElseThrow());
        });
    }

    private static <T> MdmToc listToc(List<T> list, Function<T, BigDecimal> ver, Function<T, LocalDateTime> from,
                                      Function<T, LocalDateTime> to) {
        return new MdmToc(null, list.stream()
                .sorted(Comparator.comparing(ver))
                .map(d -> new MdmTocVersion(ver.apply(d), RELEASED, from.apply(d), to.apply(d)))
                .toList());
    }

    private static <T> Optional<Object> pick(List<T> list, Function<T, BigDecimal> ver, String key) {
        return list.stream().filter(d -> MdmVersions.key(ver.apply(d)).equals(key)).findFirst().map(d -> (Object) d);
    }
}
```

- [ ] **Step 5: `MdmMetaService` 를 넓힌다**

클래스 Javadoc 끝에 "D-154 — 버전 대상(룰·룰 세트·코드·전문)은 {@link #lookupAt} 등 버전 입구로 받는다. `versioned` 가 거짓이면(versioned-feed: off) 지금처럼 전 이력 한 키로 캐시하고 결과만 같은 모양으로 준다" 를 더한다. 필드·생성자·레코드·공개 메서드를 아래처럼 더하고, 기존 `lookup`·`one`·`cached`·`reload` 는 첫 줄에 `guardValue(type);` 를 넣은 뒤 몸체를 각각 `lookupValue`·`oneValue`·(그대로)·`reloadValue` 로 옮긴다. 기존 `load` 는 건너뛰기·장애 집계를 아래 `skipping`·`failed` 로 바꿔 쓴다(동작 불변).

```java
    static final String NOT_RELEASED = "NOT_RELEASED";

    private final boolean versioned;
    private final ConcurrentHashMap<String, CompletableFuture<Optional<MdmToc>>> inflightToc = new ConcurrentHashMap<>();
    /** 본문 적재 합류 — 키에 ver 가 들어간다(같은 코드의 두 버전이 합쳐지지 않게). 빈 값 = NOT_RELEASED. */
    private final ConcurrentHashMap<String, CompletableFuture<Optional<Object>>> inflightBody = new ConcurrentHashMap<>();

    /** 지금 동작(versioned-feed: off) — 버전 대상도 전 이력 한 키로 캐시한다. */
    public MdmMetaService(MdmMetaFeed feed, MdmMetaCache cache, Clock clock) {
        this(feed, cache, clock, false);
    }

    /** @param versioned 참이면 버전 대상을 목차·본문으로 적재한다(D-154). 거짓이면 전 이력 한 키(versioned-feed: off) */
    public MdmMetaService(MdmMetaFeed feed, MdmMetaCache cache, Clock clock, boolean versioned) {
        this.feed = feed;
        this.cache = cache;
        this.clock = clock;
        this.versioned = versioned;
    }

    /** 판정 시각 t 의 버전 하나. {@code ver}·{@code body} 가 null 이면 "적용 버전 없음"(룰·세트·전문 — "없음"과 다르다). */
    public record MdmAt(MdmToc toc, String ver, Object body) {
    }

    /** 찾은 키의 결과, MDM 에 없는 키, 지금 받을 수 없는 키. 요청 순서를 지킨다. */
    public record MdmAtLookup(Map<String, MdmAt> found, List<String> missing, List<String> unavailable) {
    }

    /** 캐시만 읽은 결과 — {@code cached} 가 거짓이면 캐시에 없음, 참이면 {@code value}(null = MDM 에 없음으로 캐시됨). */
    public record CachedRead(boolean cached, Object value) {
    }

    private record Tocs(Map<String, MdmToc> tocs, Set<String> unavailable, Map<String, MdmCurrent> current) {
    }

    private record Bodies(Map<MdmBodyKey, Object> found, Set<MdmBodyKey> unavailable, Set<MdmBodyKey> notReleased) {
    }

    public boolean versioned() {
        return versioned;
    }

    public Instant now() {
        return clock.instant();
    }

    // ------------------------------------------------------------------ 버전 입구

    /**
     * 판정 시각 t 의 정의(스펙 §5.2). ① 목차를 캐시에서 찾고 없는 키는 묶어 {@code TOC(at=t)} 한 번 ② 목차로 버전을 고른다 ③ 그 본문을 캐시에서
     * 찾고, 목차 응답의 current 가 같은 버전이면 그것을, 아니면 묶어 {@code BODY} 한 번. 본문이 {@code NOT_RELEASED} 면 그 묶음을 지우고 목차부터
     * 한 번만 다시 받는다(§5.6 가) — 두 번째에도 어긋나면 받을 수 없음이다.
     */
    public MdmAtLookup lookupAt(MdmTargetType type, Collection<String> keys, Instant t) {
        requireVersionedType(type);
        LocalDateTime at = kst(t);
        List<String> wanted = distinct(keys);
        return versioned ? lookupAtVersioned(type, wanted, at, true, true) : legacyAt(type, wanted, at);
    }

    /** 키 하나. 없으면 빈 값, 받을 수 없으면 {@link MdmUnavailableException}. */
    public Optional<MdmAt> oneAt(MdmTargetType type, String key, Instant t) {
        MdmAtLookup r = lookupAt(type, List.of(key), t);
        if (!r.unavailable().isEmpty()) {
            throw new MdmUnavailableException("MDM 정의를 받을 수 없습니다: " + type + " " + key);
        }
        return Optional.ofNullable(r.found().get(key));
    }

    /** 목차 하나(엔진 {@code CodeLookup.code}). 없으면 빈 값, 받을 수 없으면 {@link MdmUnavailableException}. */
    public Optional<MdmToc> toc(MdmTargetType type, String key) {
        requireVersionedType(type);
        if (!versioned) {
            return oneValue(type, key).map(full -> MdmLegacyValues.toc(type, full));
        }
        Tocs s = tocs(type, List.of(key), kst(clock.instant()), true);
        if (s.unavailable().contains(key)) {
            throw new MdmUnavailableException("MDM 목차를 받을 수 없습니다: " + type + " " + key);
        }
        return Optional.ofNullable(s.tocs().get(key));
    }

    /**
     * 버전 본문 하나(엔진 {@code codeAt}·{@code CodeEffLookup}). 목차에 없는 버전이면 빈 값. 받을 수 없으면 {@link MdmUnavailableException} —
     * 다른 버전으로 대신하지 않는다(§5.9). off 면 CODE 는 전 이력을 {@link MdmCodeVersion#full} 로 감싼다(자르지 않는다).
     */
    public Optional<Object> body(MdmTargetType type, String key, String ver) {
        requireVersionedType(type);
        if (!versioned) {
            return oneValue(type, key).flatMap(full -> legacyBody(type, full, ver));
        }
        for (int attempt = 0; attempt < 2; attempt++) {
            Optional<MdmToc> toc = toc(type, key);
            if (toc.isEmpty() || toc.get().version(ver).isEmpty()) {
                return Optional.empty();
            }
            MdmBodyKey bk = new MdmBodyKey(key, ver);
            Bodies b = bodies(type, Map.of(bk, toc.get()), Map.of(), true);
            if (b.found().containsKey(bk)) {
                return Optional.of(b.found().get(bk));
            }
            if (b.unavailable().contains(bk)) {
                throw new MdmUnavailableException("MDM 본문을 받을 수 없습니다: " + type + " " + MdmVersions.logical(key, ver));
            }
            cache.evictLocal(type, key); // NOT_RELEASED — 목차가 낡았다
        }
        throw new MdmUnavailableException("목차와 본문이 두 번 어긋났습니다: " + type + " " + MdmVersions.logical(key, ver));
    }

    /** 캐시만 읽는 목차(평가 중 — MDM 을 부르지 않는다). off 면 전 이력에서 만든다. */
    public CachedRead cachedToc(MdmTargetType type, String key) {
        requireVersionedType(type);
        if (key == null || key.isBlank()) {
            return new CachedRead(false, null);
        }
        Optional<MdmMetaCache.Entry> hit = cache.get(type, key);
        if (hit.isEmpty()) {
            return new CachedRead(false, null);
        }
        Object v = hit.get().value();
        return new CachedRead(true, !versioned && v != null ? MdmLegacyValues.toc(type, v) : v);
    }

    /** 캐시만 읽는 본문. off 면 전 이력에서 고른다(CODE 는 full). */
    public CachedRead cachedBody(MdmTargetType type, String key, String ver) {
        requireVersionedType(type);
        if (key == null || key.isBlank()) {
            return new CachedRead(false, null);
        }
        if (!versioned) {
            Optional<MdmMetaCache.Entry> hit = cache.get(type, key);
            if (hit.isEmpty()) {
                return new CachedRead(false, null);
            }
            Object full = hit.get().value();
            return new CachedRead(true, full == null ? null : legacyBody(type, full, ver).orElse(null));
        }
        return cache.getBody(type, key, ver).map(e -> new CachedRead(true, e.value())).orElse(new CachedRead(false, null));
    }

    /**
     * 이 인스턴스에서 지우고 다시 받는다(관리 화면 load, 스펙 §7.1). 정의 키 {@code X} 는 묶음째 지우고 목차와 t 시각 본문을, 본문 키 {@code X@ver} 는
     * 그 본문만 지우고 다시 받는다. 진행 중 적재에 합류하지 않는다. found 의 키는 요청한 논리 키다.
     */
    public MdmAtLookup reloadAt(MdmTargetType type, Collection<String> logicalKeys, Instant t) {
        requireVersionedType(type);
        LocalDateTime at = kst(t);
        List<String> defKeys = new ArrayList<>();
        Map<String, MdmVersions.LogicalKey> bodyKeys = new LinkedHashMap<>();
        for (String l : distinct(logicalKeys)) {
            MdmVersions.LogicalKey lk = MdmVersions.parse(l);
            if (lk.isBody()) {
                bodyKeys.put(l, lk);
            } else {
                defKeys.add(lk.key());
            }
        }
        Map<String, MdmAt> found = new LinkedHashMap<>();
        List<String> missing = new ArrayList<>();
        List<String> unavailable = new ArrayList<>();
        if (!versioned) {
            Set<String> all = new LinkedHashSet<>(defKeys);
            bodyKeys.values().forEach(lk -> all.add(lk.key()));
            MdmLookup r = reloadValue(type, all);
            missing.addAll(r.missing());
            unavailable.addAll(r.unavailable());
            for (String k : defKeys) {
                Object full = r.found().get(k);
                if (full != null) {
                    MdmToc toc = MdmLegacyValues.toc(type, full);
                    String ver = MdmVersionSelector.select(type, toc, at).orElse(null);
                    found.put(k, new MdmAt(toc, ver, ver == null ? null : legacyBody(type, full, ver).orElse(null)));
                }
            }
            bodyKeys.forEach((l, lk) -> {
                Object full = r.found().get(lk.key());
                if (full != null) {
                    found.put(l, new MdmAt(MdmLegacyValues.toc(type, full), lk.ver(), legacyBody(type, full, lk.ver()).orElse(null)));
                }
            });
            return new MdmAtLookup(found, missing, unavailable);
        }
        defKeys.forEach(k -> cache.evictLocal(type, k));
        MdmAtLookup defs = lookupAtVersioned(type, defKeys, at, true, false);
        found.putAll(defs.found());
        missing.addAll(defs.missing());
        unavailable.addAll(defs.unavailable());
        bodyKeys.forEach((l, lk) -> {
            cache.evictLocalBody(type, lk.key(), lk.ver());
            try {
                Optional<MdmToc> toc = toc(type, lk.key());
                if (toc.isEmpty() || toc.get().version(lk.ver()).isEmpty()) {
                    missing.add(l);
                    return;
                }
                MdmBodyKey bk = new MdmBodyKey(lk.key(), lk.ver());
                Bodies b = bodies(type, Map.of(bk, toc.get()), Map.of(), false);
                if (b.found().containsKey(bk)) {
                    found.put(l, new MdmAt(toc.get(), lk.ver(), b.found().get(bk)));
                } else {
                    unavailable.add(l);
                }
            } catch (MdmUnavailableException e) {
                unavailable.add(l);
            }
        });
        return new MdmAtLookup(found, missing, unavailable);
    }

    // ------------------------------------------------------------------ 버전 경로 내부

    private MdmAtLookup lookupAtVersioned(MdmTargetType type, List<String> keys, LocalDateTime at, boolean retry, boolean join) {
        Tocs s = tocs(type, keys, at, join);
        Map<String, MdmAt> found = new LinkedHashMap<>();
        Set<String> missing = new LinkedHashSet<>();
        Set<String> unavailable = new LinkedHashSet<>(s.unavailable());
        Map<MdmBodyKey, MdmToc> need = new LinkedHashMap<>();
        s.tocs().forEach((key, toc) -> {
            if (toc == null) {
                missing.add(key);
                return;
            }
            Optional<String> ver = MdmVersionSelector.select(type, toc, at);
            if (ver.isEmpty()) {
                found.put(key, new MdmAt(toc, null, null));
            } else {
                need.put(new MdmBodyKey(key, ver.get()), toc);
            }
        });
        Bodies b = bodies(type, need, s.current(), join);
        List<String> stale = new ArrayList<>();
        need.forEach((bk, toc) -> {
            if (b.found().containsKey(bk)) {
                found.put(bk.key(), new MdmAt(toc, bk.ver(), b.found().get(bk)));
            } else if (b.unavailable().contains(bk)) {
                unavailable.add(bk.key());
            } else {
                stale.add(bk.key());
            }
        });
        if (!stale.isEmpty()) {
            if (retry) {
                stale.forEach(k -> cache.evictLocal(type, k));
                MdmAtLookup again = lookupAtVersioned(type, stale, at, false, false);
                found.putAll(again.found());
                missing.addAll(again.missing());
                unavailable.addAll(again.unavailable());
            } else {
                unavailable.addAll(stale);
            }
        }
        Map<String, MdmAt> ordered = new LinkedHashMap<>();
        List<String> orderedMissing = new ArrayList<>();
        List<String> orderedUnavailable = new ArrayList<>();
        for (String k : keys) {
            if (found.containsKey(k)) {
                ordered.put(k, found.get(k));
            } else if (unavailable.contains(k)) {
                orderedUnavailable.add(k);
            } else if (missing.contains(k)) {
                orderedMissing.add(k);
            }
        }
        return new MdmAtLookup(ordered, orderedMissing, orderedUnavailable);
    }

    private Tocs tocs(MdmTargetType type, Collection<String> keys, LocalDateTime at, boolean join) {
        Map<String, MdmToc> tocs = new LinkedHashMap<>();
        Set<String> unavailable = new LinkedHashSet<>();
        Map<String, MdmCurrent> current = new ConcurrentHashMap<>();
        Map<String, CompletableFuture<Optional<MdmToc>>> mine = new LinkedHashMap<>();
        Map<String, CompletableFuture<Optional<MdmToc>>> waiting = new LinkedHashMap<>();
        for (String key : keys) {
            Optional<MdmMetaCache.Entry> hit = cache.get(type, key);
            if (hit.isPresent()) {
                tocs.put(key, (MdmToc) hit.get().value());
                continue;
            }
            CompletableFuture<Optional<MdmToc>> f = new CompletableFuture<>();
            if (!join) {
                inflightToc.put(id(type, key), f);
                mine.put(key, f);
                continue;
            }
            CompletableFuture<Optional<MdmToc>> running = inflightToc.putIfAbsent(id(type, key), f);
            if (running == null) {
                mine.put(key, f);
            } else {
                waiting.put(key, running);
            }
        }
        if (!mine.isEmpty()) {
            loadTocs(type, mine, at, current);
        }
        Map<String, CompletableFuture<Optional<MdmToc>>> all = new LinkedHashMap<>(mine);
        all.putAll(waiting);
        all.forEach((key, f) -> {
            try {
                tocs.put(key, f.get(WAIT_LIMIT.toMillis(), TimeUnit.MILLISECONDS).orElse(null));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                unavailable.add(key);
            } catch (ExecutionException | TimeoutException e) {
                unavailable.add(key);
            }
        });
        return new Tocs(tocs, unavailable, current);
    }

    private void loadTocs(MdmTargetType type, Map<String, CompletableFuture<Optional<MdmToc>>> mine, LocalDateTime at,
                          Map<String, MdmCurrent> current) {
        MdmMetaCache.Ticket ticket = cache.ticket();
        try {
            if (skipping(mine.values())) {
                return;
            }
            MdmTocResult r;
            try {
                r = feed.fetchToc(type, mine.keySet(), at);
            } catch (RuntimeException e) {
                failed(e, mine.values());
                return;
            }
            health.set(Health.OK);
            Map<String, MdmToc> tocs = new LinkedHashMap<>();
            Map<MdmBodyKey, Object> bodies = new LinkedHashMap<>();
            Map<String, String> failed = new LinkedHashMap<>();
            for (String key : mine.keySet()) {
                if (r.failed().containsKey(key)) {
                    failed.put(key, r.failed().get(key));
                    continue;
                }
                try {
                    if (r.tocs().containsKey(key)) {
                        MdmToc toc = r.tocs().get(key);
                        tocs.put(key, toc);
                        MdmCurrent c = r.current().get(key);
                        if (c != null && toc.version(c.ver()).isPresent()) {
                            Object body = wrap(type, toc, c.ver(), c.body());
                            bodies.put(new MdmBodyKey(key, c.ver()), body);
                            current.put(key, new MdmCurrent(c.ver(), body));
                        }
                    } else if (r.legacy().containsKey(key)) { // 옛 MDM — 전 이력에서 목차와 t 시각 본문을 직접 만든다(§5.8)
                        Object full = r.legacy().get(key);
                        MdmToc toc = MdmLegacyValues.toc(type, full);
                        tocs.put(key, toc);
                        Optional<String> ver = at == null ? Optional.empty() : MdmVersionSelector.select(type, toc, at);
                        ver.flatMap(v -> MdmLegacyValues.body(type, full, v)).ifPresent(body -> {
                            bodies.put(new MdmBodyKey(key, ver.get()), body);
                            current.put(key, new MdmCurrent(ver.get(), body));
                        });
                    } else {
                        tocs.put(key, null); // MDM 에 없음
                    }
                } catch (RuntimeException e) { // 값 해석 실패(손상) — 그 키만 받을 수 없음
                    tocs.remove(key);
                    failed.put(key, "MDM 정의를 해석할 수 없습니다: " + e.getMessage());
                }
            }
            cache.putTocs(type, tocs, ticket);
            cache.putBodies(type, bodies, ticket);
            mine.forEach((key, f) -> {
                if (failed.containsKey(key)) {
                    f.completeExceptionally(new MdmUnavailableException(failed.get(key)));
                } else {
                    f.complete(Optional.ofNullable(tocs.get(key)));
                }
            });
        } finally {
            mine.forEach((key, f) -> {
                f.completeExceptionally(new MdmUnavailableException("적재가 끝나지 않았습니다: " + key));
                inflightToc.remove(id(type, key), f);
            });
        }
    }

    private Bodies bodies(MdmTargetType type, Map<MdmBodyKey, MdmToc> need, Map<String, MdmCurrent> prefetched, boolean join) {
        Map<MdmBodyKey, Object> found = new LinkedHashMap<>();
        Set<MdmBodyKey> unavailable = new LinkedHashSet<>();
        Set<MdmBodyKey> notReleased = new LinkedHashSet<>();
        Map<MdmBodyKey, CompletableFuture<Optional<Object>>> mine = new LinkedHashMap<>();
        Map<MdmBodyKey, CompletableFuture<Optional<Object>>> waiting = new LinkedHashMap<>();
        Map<MdmBodyKey, MdmToc> mineTocs = new LinkedHashMap<>();
        need.forEach((bk, toc) -> {
            MdmCurrent c = prefetched.get(bk.key());
            if (c != null && c.ver().equals(bk.ver())) {
                found.put(bk, c.body());
                return;
            }
            Optional<MdmMetaCache.Entry> hit = cache.getBody(type, bk.key(), bk.ver());
            if (hit.isPresent()) {
                found.put(bk, hit.get().value());
                return;
            }
            CompletableFuture<Optional<Object>> f = new CompletableFuture<>();
            String id = id(type, MdmVersions.logical(bk.key(), bk.ver()));
            CompletableFuture<Optional<Object>> running = join ? inflightBody.putIfAbsent(id, f) : inflightBody.put(id, f);
            if (!join || running == null) {
                mine.put(bk, f);
                mineTocs.put(bk, toc);
            } else {
                waiting.put(bk, running);
            }
        });
        if (!mine.isEmpty()) {
            loadBodies(type, mine, mineTocs);
        }
        Map<MdmBodyKey, CompletableFuture<Optional<Object>>> all = new LinkedHashMap<>(mine);
        all.putAll(waiting);
        all.forEach((bk, f) -> {
            try {
                Optional<Object> v = f.get(WAIT_LIMIT.toMillis(), TimeUnit.MILLISECONDS);
                if (v.isPresent()) {
                    found.put(bk, v.get());
                } else {
                    notReleased.add(bk);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                unavailable.add(bk);
            } catch (ExecutionException | TimeoutException e) {
                unavailable.add(bk);
            }
        });
        return new Bodies(found, unavailable, notReleased);
    }

    private void loadBodies(MdmTargetType type, Map<MdmBodyKey, CompletableFuture<Optional<Object>>> mine, Map<MdmBodyKey, MdmToc> tocs) {
        MdmMetaCache.Ticket ticket = cache.ticket();
        try {
            if (skipping(mine.values())) {
                return;
            }
            MdmBodyResult r;
            try {
                r = feed.fetchBodies(type, mine.keySet());
            } catch (RuntimeException e) {
                failed(e, mine.values());
                return;
            }
            health.set(Health.OK);
            Map<MdmBodyKey, Object> toCache = new LinkedHashMap<>();
            Map<MdmBodyKey, Object> outcome = new LinkedHashMap<>(); // Optional<Object>(빈 값 = NOT_RELEASED) 또는 RuntimeException
            for (MdmBodyKey bk : mine.keySet()) {
                try {
                    if (r.found().containsKey(bk)) {
                        Object body = wrap(type, tocs.get(bk), bk.ver(), r.found().get(bk));
                        toCache.put(bk, body);
                        outcome.put(bk, Optional.of(body));
                    } else if (r.failed().containsKey(bk)) {
                        String m = r.failed().get(bk);
                        outcome.put(bk, NOT_RELEASED.equals(m) ? Optional.empty() : new MdmUnavailableException(m));
                    } else if (r.legacy().containsKey(bk.key())) { // 옛 MDM — 전 이력에서 자른다(§5.8)
                        Optional<Object> body = MdmLegacyValues.body(type, r.legacy().get(bk.key()), bk.ver());
                        body.ifPresent(b -> toCache.put(bk, b));
                        outcome.put(bk, body);
                    } else if (r.legacyFailed().containsKey(bk.key())) {
                        outcome.put(bk, new MdmUnavailableException(r.legacyFailed().get(bk.key())));
                    } else if (r.legacyAsked().contains(bk.key())) {
                        outcome.put(bk, Optional.empty()); // 옛 MDM 에도 없는 정의 — 목차가 낡았다
                    } else {
                        outcome.put(bk, new MdmUnavailableException("MDM 응답에 본문이 없습니다: " + bk));
                    }
                } catch (RuntimeException e) {
                    outcome.put(bk, new MdmUnavailableException("MDM 본문을 해석할 수 없습니다: " + e.getMessage()));
                }
            }
            cache.putBodies(type, toCache, ticket);
            mine.forEach((bk, f) -> {
                Object o = outcome.get(bk);
                if (o instanceof RuntimeException e) {
                    f.completeExceptionally(e);
                } else {
                    @SuppressWarnings("unchecked")
                    Optional<Object> v = (Optional<Object>) o;
                    f.complete(v);
                }
            });
        } finally {
            mine.forEach((bk, f) -> {
                f.completeExceptionally(new MdmUnavailableException("적재가 끝나지 않았습니다: " + bk));
                inflightBody.remove(id(type, MdmVersions.logical(bk.key(), bk.ver())), f);
            });
        }
    }

    private MdmAtLookup legacyAt(MdmTargetType type, List<String> keys, LocalDateTime at) {
        MdmLookup r = lookupValue(type, keys);
        Map<String, MdmAt> found = new LinkedHashMap<>();
        r.found().forEach((key, full) -> {
            MdmToc toc = MdmLegacyValues.toc(type, full);
            String ver = MdmVersionSelector.select(type, toc, at).orElse(null);
            found.put(key, new MdmAt(toc, ver, ver == null ? null : legacyBody(type, full, ver).orElse(null)));
        });
        return new MdmAtLookup(found, r.missing(), r.unavailable());
    }

    /** off 경로 — CODE 는 전 이력을 그대로 감싼다(호출마다 자르지 않는다). */
    private static Optional<Object> legacyBody(MdmTargetType type, Object full, String ver) {
        return type == MdmTargetType.CODE ? Optional.of(MdmCodeVersion.full((CodeRows) full)) : MdmLegacyValues.rawBody(type, full, ver);
    }

    /** MDM 본문(원시) → 캐시 값. CODE 는 목차의 헤더·버전 행으로 색인을 단다. */
    private static Object wrap(MdmTargetType type, MdmToc toc, String ver, Object raw) {
        if (type != MdmTargetType.CODE) {
            return raw;
        }
        return MdmCodeVersion.sliced((CodeVersionSlice) raw, toc.header(), toc.version(ver).orElseThrow());
    }

    private boolean skipping(Collection<? extends CompletableFuture<?>> futures) {
        Instant until = health.get().skipUntil();
        if (until != null && clock.instant().isBefore(until)) {
            MdmUnavailableException skipped = new MdmUnavailableException("MDM 연속 실패로 " + until + " 까지 호출을 건너뜁니다");
            futures.forEach(f -> f.completeExceptionally(skipped));
            return true;
        }
        return false;
    }

    private void failed(RuntimeException e, Collection<? extends CompletableFuture<?>> futures) {
        Instant now = clock.instant();
        health.updateAndGet(h -> {
            int n = h.failures() + 1;
            return new Health(n, n >= SKIP_AFTER_FAILURES ? now.plus(SKIP_FOR) : h.skipUntil());
        });
        futures.forEach(f -> f.completeExceptionally(e));
    }

    private void guardValue(MdmTargetType type) {
        if (versioned && MdmVersions.isVersioned(type)) {
            throw new IllegalStateException("버전 대상은 lookupAt·oneAt·toc·body 로 조회한다(D-154): " + type);
        }
    }

    private static void requireVersionedType(MdmTargetType type) {
        if (!MdmVersions.isVersioned(type)) {
            throw new IllegalArgumentException("버전이 없는 대상입니다: " + type);
        }
    }

    private static List<String> distinct(Collection<String> keys) {
        List<String> out = new ArrayList<>();
        for (String k : new LinkedHashSet<>(keys)) {
            if (k != null && !k.isBlank()) {
                out.add(k);
            }
        }
        return out;
    }

    private static LocalDateTime kst(Instant t) {
        return LocalDateTime.ofInstant(t, MdmDefinitionLookup.KST);
    }
```

`oneValue(type, key)` 는 지금 `one` 의 몸체(`lookupValue` 결과에 unavailable 이 있으면 예외)다. import: `java.time.LocalDateTime`, `java.util.Set`, `kr.dongkuk.maru.mdm.engine.code.CodeVersionSlice`, `kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows`.

- [ ] **Step 6: 시험을 돌린다**

Run:
- `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :cactus-core:test --tests 'com.dongkuk.dmes.cactus.mdm.*'`
- `cd src/backend/mls && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mls.lsh.noticeMgmt.NoticeMgmtMdmRealValidatorTest'`
- `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mdm.feed.MdmMetaFeedContractHttpTest'`

Expected: 모두 PASS(기존 `MdmMetaServiceTest`·`MdmDefinitionLookupTest`·`MdmValidatorTest` 는 3인자 생성자라 지금 경로다).

- [ ] **Step 7: 커밋**

```bash
/usr/bin/git add src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmLegacyValues.java src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmMetaService.java src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/FakeMetaFeed.java src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmMetaServiceVersionedTest.java
/usr/bin/git commit -m "feat(cactus): 판정 시각으로 목차·버전 본문을 적재하는 lookupAt 과 옛 MDM 물러남·off 경로를 더한다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: cactus — 폴러의 RELOAD 를 목차 + 지금 시각 본문으로

스펙 §5.6「RELOAD」·「폴러 지움」. 정의 키 X 의 변경 기록은 `cache.evict` 가 이미 묶음째 지운다(Task 10). RELOAD 는 버전 대상이면 `lookupAt(…, now)` 로 목차와 최종 본문만 다시 받고, 지우기 전에 있던 옛 본문은 다시 받지 않는다. off 서비스에서는 `lookupAt` 이 지금 경로로 돌므로 동작이 같다.

**Files:**
- Modify: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmRevisionPoller.java:155`
- Modify: `src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmRevisionPollerTest.java`

**Interfaces:**
- Consumes: Task 11 `MdmMetaService.lookupAt`, Task 8 `MdmVersions.isVersioned`, Task 10 묶음 지움.
- Produces: 없음(동작 변경).

- [ ] **Step 1: 실패하는 시험을 더한다**

```java
    /** D-154 — 정의 키 변경은 목차와 본문 전부를 지우고, RELOAD 는 목차 + 지금 시각 최종 본문만 다시 받는다(옛 본문은 미스 때). */
    @Test
    void 버전_대상_RELOAD_는_묶음을_지우고_목차와_최종_본문만_다시_받는다() {
        FakeMetaFeed vfeed = new FakeMetaFeed().versioned();
        vfeed.put(MdmTargetType.RULE, "R", List.of(
                MdmDefinitionLookupTest.rule("1.000", LocalDateTime.parse("2026-01-01T00:00:00"), LocalDateTime.parse("2026-06-01T00:00:00")),
                MdmDefinitionLookupTest.rule("2.000", LocalDateTime.parse("2026-06-01T00:00:00"), null)));
        MdmMetaCache vcache = new MdmMetaCache(100, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        MdmMetaService vservice = new MdmMetaService(vfeed, vcache, clock, true);
        MdmRevisionPoller vpoller = new MdmRevisionPoller(vfeed, vcache, vservice, clock, Duration.ofSeconds(10), 1000, 0);
        vfeed.changes.add(changes(5, false));
        vpoller.pollOnce();
        vservice.lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant());                             // 목차 + 2.000
        vservice.lookupAt(MdmTargetType.RULE, List.of("R"), Instant.parse("2026-03-01T00:00:00Z"));       // 1.000 본문
        assertThat(vcache.bodySizes().get(MdmTargetType.RULE)).isEqualTo(2);
        int tocs = vfeed.tocCalls.get();

        vfeed.changes.add(changes(6, false, new MdmChange(6, "RULE", "R", "RELOAD")));
        vpoller.pollOnce();

        assertThat(vfeed.tocCalls.get()).isEqualTo(tocs + 1);
        assertThat(vcache.getBody(MdmTargetType.RULE, "R", "2.000")).isPresent();
        assertThat(vcache.getBody(MdmTargetType.RULE, "R", "1.000")).as("옛 본문은 다시 받지 않는다").isEmpty();
    }

    @Test
    void 버전_대상_EVICT_는_목차와_본문을_묶음째_지운다() {
        FakeMetaFeed vfeed = new FakeMetaFeed().versioned();
        vfeed.put(MdmTargetType.RULE, "R", List.of(MdmDefinitionLookupTest.rule("1.000", LocalDateTime.parse("2026-01-01T00:00:00"), null)));
        MdmMetaCache vcache = new MdmMetaCache(100, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        MdmMetaService vservice = new MdmMetaService(vfeed, vcache, clock, true);
        MdmRevisionPoller vpoller = new MdmRevisionPoller(vfeed, vcache, vservice, clock, Duration.ofSeconds(10), 1000, 0);
        vfeed.changes.add(changes(5, false));
        vpoller.pollOnce();
        vservice.lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant());

        vfeed.changes.add(changes(6, false, new MdmChange(6, "RULE", "R", "EVICT")));
        vpoller.pollOnce();

        assertThat(vcache.get(MdmTargetType.RULE, "R")).isEmpty();
        assertThat(vcache.getBody(MdmTargetType.RULE, "R", "1.000")).isEmpty();
        assertThat(vcache.sizes().get(MdmTargetType.RULE)).isZero();
    }
```

import 에 `java.time.LocalDateTime` 을 더한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :cactus-core:test --tests 'com.dongkuk.dmes.cactus.mdm.MdmRevisionPollerTest'`
Expected: 첫 시험 FAIL — 폴러가 `service::lookup` 을 불러 `IllegalStateException`(버전 대상)이 나고, 폴링 실패로 남아 목차를 다시 받지 않는다.

- [ ] **Step 3: 구현한다**

`MdmRevisionPoller.pollOnce` 의 `reload.forEach(service::lookup);` 를 바꾼다.

```java
            // 받을 수 없는 키는 unavailable 로 돌아오고 캐시에 남지 않는다. 버전 대상은 목차 + 지금 시각 최종 본문만 다시 받는다(D-154, 스펙 §5.6 RELOAD)
            reload.forEach((type, keys) -> {
                if (MdmVersions.isVersioned(type)) {
                    service.lookupAt(type, keys, clock.instant());
                } else {
                    service.lookup(type, keys);
                }
            });
```

- [ ] **Step 4: 시험을 돌린다**

Run: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :cactus-core:test --tests 'com.dongkuk.dmes.cactus.mdm.*'`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmRevisionPoller.java src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmRevisionPollerTest.java
/usr/bin/git commit -m "feat(cactus): MDM 메타 폴러의 RELOAD 가 버전 대상은 목차와 최종 본문만 다시 받게 한다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: cactus — 엔진 연결(`code`·`codeAt`·`CodeEffLookup`)과 룰·세트·전문의 목차 → 본문

스펙 §5.4(결정 P7, 불변식)·§5.2-5(캐시만 읽기)·§7.4. `MdmDefinitionLookup`(일반 경로 — 없으면 받는다)과 `MdmCachedDefinitions`(평가 중 — 캐시만 읽는다)가 `CodeEffLookup` 도 구현한다. 불변식: 목차가 있는 코드에 대해 두 구현은 `Optional.empty()` 를 주지 않는다 — 일반 경로는 본문을 받아 집합을 주고, 캐시만 읽는 경로는 부재 기록(`CODE:X@ver`)을 남기고 `MdmUnavailableException` 을 던진다. off(전 이력) 본문은 `MdmCodeVersion.full` 이라 빈 값을 주고 해석기가 전체 행으로 계산한다(지금 동작). 컨트롤러 허용 코드와 검증기 엔진은 `CodeEffLookup.NONE` 대신 이 구현을 쓴다.

**Files:**
- Modify: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmDefinitionLookup.java`
- Modify: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmCachedDefinitions.java:33-129`
- Modify: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmValidator.java:111-116`
- Modify: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmMetaController.java:68-78, 309-321`
- Create: `src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmDefinitionLookupVersionedTest.java`
- Create: `src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmCachedDefinitionsTest.java`
- Modify: `src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmMetaControllerTest.java`(버전 경로 허용 코드 한 건)

**Interfaces:**
- Consumes: Task 11 `oneAt`·`toc`·`body`·`cachedToc`·`cachedBody`·`lookupAt`·`now()`, Task 8 `MdmToc.codeRows`·`MdmCodeVersion`·`MdmVersionSelector`·`MdmVersions`.
- Produces: `MdmDefinitionLookup implements DefinitionLookup, CodeLookup, CodeEffLookup`, `MdmCachedDefinitions implements DefinitionLookup, CodeLookup, CodeEffLookup`, `static Optional<Map<String, Object>> MdmDefinitionLookup.segmentAt(MdmLayoutVersion, LocalDateTime)`.

- [ ] **Step 1: 실패하는 시험을 쓴다 — 일반 경로**

```java
package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.domain.DefaultDomainValidator;
import kr.dongkuk.maru.mdm.engine.domain.DomainValidator;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import kr.dongkuk.maru.mdm.engine.spi.MasterLookup;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** D-154 — 버전 경로의 엔진 연결(스펙 §5.4). 코드 C 는 {@code MdmMetaServiceVersionedTest.codeRows()}(2.000 에서 TB 소속 B). 시계 = KST 2026-10-03 00:00. */
class MdmDefinitionLookupVersionedTest {

    private static final Instant T0 = Instant.parse("2026-10-02T15:00:00Z");
    private FakeMetaFeed feed;
    private MdmMetaService service;
    private MdmDefinitionLookup lookup;

    @BeforeEach
    void setUp() {
        MutableClock clock = new MutableClock(T0);
        feed = new FakeMetaFeed().versioned();
        feed.put(MdmTargetType.CODE, "C", MdmMetaServiceVersionedTest.codeRows());
        MdmMetaCache cache = new MdmMetaCache(1000, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        cache.clear(0);
        service = new MdmMetaService(feed, cache, clock, true);
        lookup = new MdmDefinitionLookup(service);
    }

    private static MdmColumnMeta codeCol(String phys, String maruCodeId, String cateId) {
        return new MdmColumnMeta(phys, phys + " 컬럼", null, phys, null, null, null, "STRING", 10, null, false, null, null, null, null,
                new MdmColumnMeta.DomainRef("8", "코드", "CODE"), null, null, List.of(), new MdmColumnMeta.CodeRefMeta(maruCodeId, cateId),
                null, null, null);
    }

    @Test
    void CODE_도메인_TABLE_카테고리를_목차_본문_색인으로_판정하고_NONE_으로_묶어도_같다() {
        feed.put(MdmTargetType.COLUMN, "TB_COL", codeCol("TB_COL", "C", "TB"));
        for (CodeEffLookup eff : List.of((CodeEffLookup) lookup, CodeEffLookup.NONE)) {
            DomainValidator v = new DefaultDomainValidator(lookup,
                    new MdmEvaluator(new EngineLookups(lookup, lookup, eff, MasterLookup.NONE, FunctionProvider.NONE)));
            assertThat(v.validate("T", "TB_COL", Map.of("TB_COL", "B"), T0).valid()).isTrue();
            assertThat(v.validate("T", "TB_COL", Map.of("TB_COL", "A"), T0).valid()).as("A 는 TB 소속이 아니다").isFalse();
        }
    }

    @Test
    void code_는_목차_행_codeAt_은_본문_행_codes_는_소속_집합이고_빈_값을_주지_않는다() {
        CodeRows toc = lookup.code("C").orElseThrow();
        assertThat(toc.items()).isEmpty();
        assertThat(toc.versions()).hasSize(2);
        CodeRows at = lookup.codeAt("C", new BigDecimal("2")).orElseThrow();
        assertThat(at.versions()).hasSize(1);
        assertThat(at.items()).hasSize(2);
        assertThat(lookup.codes("C", new BigDecimal("2.000"), "TB")).contains(Set.of("B"));
        assertThat(lookup.codes("C", new BigDecimal("2.000"), "NO_SUCH")).contains(Set.of());
        assertThat(lookup.code("NO_CD")).isEmpty();
    }

    @Test
    void 룰_세트_전문은_목차로_버전을_고르고_적용_버전이_없으면_빈_값이다() {
        LocalDateTime b = LocalDateTime.parse("2026-06-01T00:00:00");
        feed.put(MdmTargetType.RULE, "R", List.of(MdmDefinitionLookupTest.rule("1.000", LocalDateTime.parse("2026-01-01T00:00:00"), b),
                MdmDefinitionLookupTest.rule("2.000", b, null)));
        feed.put(MdmTargetType.LAYOUT, "42", List.of(new MdmLayoutVersion(new BigDecimal("1.000"), LocalDateTime.parse("2026-01-01T00:00:00"), null,
                List.of(new MdmLayoutVersion.Segment(LocalDateTime.parse("2026-01-01T00:00:00"), b, Map.of("totalLength", 10)),
                        new MdmLayoutVersion.Segment(b, null, Map.of("totalLength", 12))))));

        assertThat(lookup.rule("R", Instant.parse("2026-05-31T14:59:59Z")).orElseThrow().ver()).isEqualByComparingTo("1.000");
        assertThat(lookup.rule("R", Instant.parse("2026-05-31T15:00:00Z")).orElseThrow().ver()).isEqualByComparingTo("2.000");
        assertThat(lookup.rule("R", Instant.parse("2025-01-01T00:00:00Z"))).isEmpty();
        assertThat(lookup.layout("42", Instant.parse("2026-03-01T00:00:00Z")).orElseThrow()).containsEntry("totalLength", 10);
        assertThat(lookup.layout("42", T0).orElseThrow()).containsEntry("totalLength", 12);
    }

    @Test
    void MDM_을_받을_수_없으면_MdmUnavailableException_이다() {
        feed.fetchError = new MdmUnavailableException("MDM 연결 실패");
        assertThatThrownBy(() -> lookup.rule("R", T0)).isInstanceOf(MdmUnavailableException.class);
        assertThatThrownBy(() -> lookup.code("C")).isInstanceOf(MdmUnavailableException.class);
    }
}
```

`MdmLayoutVersion.Segment` 의 snapshot 이 `Map<String, Object>` 이므로 `Map.of("totalLength", 10)` 은 그대로 맞는다.

- [ ] **Step 2: 실패하는 시험을 쓴다 — 캐시만 읽는 경로와 불변식**

```java
package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.code.DefaultCodeResolver;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * D-154 — 캐시만 읽는 엔진 조회기의 목차·본문(스펙 §5.2-5)과 §5.4 불변식: 목차는 있는데 본문이 없으면 빈 값을 주지 않고 부재 기록({@code CODE:X@ver})을
 * 남긴 뒤 {@link MdmUnavailableException} 을 던진다 — TABLE 소속이 조용히 false 가 되지 않는다.
 */
class MdmCachedDefinitionsTest {

    private static final Instant T0 = Instant.parse("2026-10-02T15:00:00Z");
    private static final LocalDateTime KST0 = LocalDateTime.parse("2026-10-03T00:00:00");
    private FakeMetaFeed feed;
    private MdmMetaCache cache;
    private MdmMetaService service;
    private MdmCachedDefinitions cached;

    @BeforeEach
    void setUp() {
        MutableClock clock = new MutableClock(T0);
        feed = new FakeMetaFeed().versioned();
        feed.put(MdmTargetType.CODE, "C", MdmMetaServiceVersionedTest.codeRows());
        feed.put(MdmTargetType.RULE, "R", List.of(MdmDefinitionLookupTest.rule("1.000", LocalDateTime.parse("2026-01-01T00:00:00"), null)));
        cache = new MdmMetaCache(1000, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        cache.clear(0);
        service = new MdmMetaService(feed, cache, clock, true);
        cached = new MdmCachedDefinitions(service);
    }

    @Test
    void 목차는_있고_본문이_없으면_소속도_행도_빈_값_대신_부재_기록과_예외다() {
        service.lookupAt(MdmTargetType.CODE, List.of("C"), T0);
        cache.evictLocalBody(MdmTargetType.CODE, "C", "2.000");
        MdmCachedDefinitions.MissLog log = new MdmCachedDefinitions.MissLog();

        assertThatThrownBy(() -> MdmCachedDefinitions.recording(log, () -> cached.codes("C", new BigDecimal("2.000"), "TB")))
                .isInstanceOf(MdmUnavailableException.class);
        assertThat(log.since(0)).containsExactly("CODE:C@2.000");
        for (CodeEffLookup eff : List.of((CodeEffLookup) cached, CodeEffLookup.NONE)) {
            DefaultCodeResolver r = new DefaultCodeResolver(cached, eff);
            assertThatThrownBy(() -> r.isMember("C", "TB", "B", KST0)).as("조용히 false 가 아니다").isInstanceOf(MdmUnavailableException.class);
        }
        assertThat(feed.bodyCalls.get()).as("평가 중에는 MDM 을 부르지 않는다").isZero();
    }

    @Test
    void 목차가_없으면_코드_부재_기록과_예외다() {
        MdmCachedDefinitions.MissLog log = new MdmCachedDefinitions.MissLog();
        assertThatThrownBy(() -> MdmCachedDefinitions.recording(log, () -> cached.code("C"))).isInstanceOf(MdmUnavailableException.class);
        assertThat(log.since(0)).containsExactly("CODE:C");
    }

    @Test
    void 룰은_목차로_고른_버전_본문이_없으면_빈_값과_부재_기록이다() {
        service.lookupAt(MdmTargetType.RULE, List.of("R"), T0);
        cache.evictLocalBody(MdmTargetType.RULE, "R", "1.000");
        MdmCachedDefinitions.MissLog log = new MdmCachedDefinitions.MissLog();

        assertThat(MdmCachedDefinitions.recording(log, () -> cached.rule("R", T0))).isEmpty();
        assertThat(log.since(0)).containsExactly("RULE:R@1.000");
    }

    @Test
    void 캐시에_다_있으면_판정하고_MDM_을_부르지_않는다() {
        service.lookupAt(MdmTargetType.CODE, List.of("C"), T0);
        int calls = feed.tocCalls.get() + feed.bodyCalls.get();
        DefaultCodeResolver r = new DefaultCodeResolver(cached, cached);
        assertThat(r.isMember("C", "TB", "B", KST0)).isTrue();
        assertThat(r.isMember("C", "TB", "A", KST0)).isFalse();
        assertThat(feed.tocCalls.get() + feed.bodyCalls.get()).isEqualTo(calls);
    }

    @Test
    void off_전_이력은_소속을_계산해_두지_않았다는_빈_값이고_해석기가_전체_행으로_판정한다() {
        FakeMetaFeed old = new FakeMetaFeed();
        old.put(MdmTargetType.CODE, "C", MdmMetaServiceVersionedTest.codeRows());
        MdmMetaService off = new MdmMetaService(old, cache, new MutableClock(T0));
        off.lookupAt(MdmTargetType.CODE, List.of("C"), T0);
        MdmCachedDefinitions offCached = new MdmCachedDefinitions(off);

        assertThat(offCached.codes("C", new BigDecimal("2.000"), "TB")).isEmpty();
        assertThat(new DefaultCodeResolver(offCached, offCached).isMember("C", "TB", "B", KST0)).isTrue();
    }
}
```

`MdmMetaControllerTest` 에 더한다(버전 경로 허용 코드 — 목차 응답의 current 로 한 번에 받는다).

```java
    @Test
    void 버전_경로에서도_허용_코드를_지금_시각_본문으로_풀고_목차_한_번에_받는다() throws Exception {
        FakeMetaFeed vfeed = new FakeMetaFeed().versioned();
        vfeed.put(MdmTargetType.COLUMN, "PROC_COL", MdmValidatorTest.codeCol("PROC_COL", "공정", "PROC_CD"));
        vfeed.put(MdmTargetType.CODE, "PROC_CD", MdmValidatorTest.codeRows("PROC_CD"));
        MdmMetaCache vcache = new MdmMetaCache(100, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        vcache.clear(0);
        MdmMetaService vservice = new MdmMetaService(vfeed, vcache, clock, true);
        MdmRevisionPoller vpoller = new MdmRevisionPoller(vfeed, vcache, vservice, clock, Duration.ofSeconds(10), 1000);
        MockMvc vmvc = MockMvcBuilders.standaloneSetup(new MdmMetaController("mls", "123@host", vservice, vcache, vpoller, clock))
                .setCustomHandlerMapping(CactusRequestMappingHandlerMapping::new).build();

        vmvc.perform(post("/api/mls/mdmMeta/columns").contentType(MediaType.APPLICATION_JSON).content("{\"names\":[\"procCol\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.procCol.allowedCodes[0].code").value("A"));
        assertThat(vfeed.tocCalls.get()).isEqualTo(1);
        assertThat(vfeed.bodyCalls.get()).isZero();
    }
```

- [ ] **Step 3: 실패를 확인한다**

Run: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :cactus-core:test --tests 'com.dongkuk.dmes.cactus.mdm.MdmDefinitionLookupVersionedTest' --tests 'com.dongkuk.dmes.cactus.mdm.MdmCachedDefinitionsTest' --tests 'com.dongkuk.dmes.cactus.mdm.MdmMetaControllerTest'`
Expected: 컴파일 실패(`codes` 가 없다) 또는 `IllegalStateException`(버전 경로에서 `one` 사용).

- [ ] **Step 4: `MdmDefinitionLookup` 을 고친다**

클래스 선언을 `public class MdmDefinitionLookup implements DefinitionLookup, CodeLookup, CodeEffLookup` 로 바꾸고 Javadoc 에 "D-154 — 버전 대상은 목차로 판정 시각의 버전을 고르고 그 본문을 쓴다({@link MdmMetaService#oneAt}). 코드는 `code`(목차 행)·`codeAt`(본문 행)·`codes`(소속 집합). 불변식: 목차가 있는 코드에 대해 `codes` 는 빈 값을 주지 않는다(본문을 받아 집합을 주거나 받을 수 없으면 던진다). off 의 전 이력 본문만 빈 값이다" 를 더한다. 메서드를 아래로 바꾼다(`select`·`selectSet`·`covers`·`toColumnDefinition`·`parse` 는 그대로).

```java
    @Override
    public Optional<ColumnDefinition> column(String table, String column) {
        String phys = MdmNames.toPhysName(column);
        if (phys == null) {
            return Optional.empty();
        }
        Optional<MdmColumnMeta> meta = service.one(MdmTargetType.COLUMN, phys).map(MdmColumnMeta.class::cast);
        meta.map(MdmColumnMeta::codeRef).map(MdmColumnMeta.CodeRefMeta::maruCodeId).filter(id -> !id.isBlank())
                .ifPresent(id -> service.oneAt(MdmTargetType.CODE, id, service.now())); // 목차 + 지금 시각 본문(스펙 §7.4)
        return meta.map(m -> toColumnDefinition(m, table));
    }

    @Override
    public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) {
        return service.oneAt(MdmTargetType.RULE, ruleId, evalTs).map(MdmMetaService.MdmAt::body).map(RuleDefinition.class::cast);
    }

    @Override
    public Optional<RuleSetDefinition> ruleSet(String setId, Instant evalTs) {
        return service.oneAt(MdmTargetType.RULE_SET, setId, evalTs).map(MdmMetaService.MdmAt::body).map(RuleSetDefinition.class::cast);
    }

    /** 목차 행 {@code (header, versions, [], [], [])} — 버전 선택·DEPRECATED·"마루 코드인가"에 쓴다. */
    @Override
    public Optional<CodeRows> code(String maruCodeId) {
        return service.toc(MdmTargetType.CODE, maruCodeId).map(MdmToc::codeRows);
    }

    /** 버전 본문 행 — 그 버전 1행·유효 items·고른 정의·합성 cateItems(off 면 전 이력 행). */
    @Override
    public Optional<CodeRows> codeAt(String maruCodeId, BigDecimal ver) {
        return service.body(MdmTargetType.CODE, maruCodeId, MdmVersions.key(ver)).map(b -> ((MdmCodeVersion) b).rows());
    }

    /** 소속 집합 색인(결정 P4) — 본문에 없는 cateId 는 빈 집합. off 의 전 이력이면 빈 값(해석기가 계산한다). */
    @Override
    public Optional<Set<String>> codes(String maruCodeId, BigDecimal ver, String cateId) {
        return service.body(MdmTargetType.CODE, maruCodeId, MdmVersions.key(ver)).flatMap(b -> ((MdmCodeVersion) b).members(cateId));
    }

    @SuppressWarnings("unchecked")
    public Optional<Map<String, Object>> layout(String layoutId, Instant evalTs) {
        return service.oneAt(MdmTargetType.LAYOUT, layoutId, evalTs).map(MdmMetaService.MdmAt::body).map(MdmLayoutVersion.class::cast)
                .flatMap(v -> segmentAt(v, LocalDateTime.ofInstant(evalTs, KST)));
    }

    /** 전문 RELEASED 버전 목록에서 판정 시각의 스냅샷 — 버전은 룰과 같은 규칙, 구간은 같은 {@code [from, to)} 판정. */
    public static Optional<Map<String, Object>> selectLayout(List<MdmLayoutVersion> released, Instant evalTs) {
        return select(released, MdmLayoutVersion::ver, MdmLayoutVersion::applyFrom, MdmLayoutVersion::applyTo, evalTs)
                .flatMap(v -> segmentAt(v, LocalDateTime.ofInstant(evalTs, KST)));
    }

    /** 전문 버전 하나 안에서 시각을 담는 합성 구간의 스냅샷. */
    public static Optional<Map<String, Object>> segmentAt(MdmLayoutVersion v, LocalDateTime t) {
        return v.segments().stream().filter(s -> covers(s.applyFrom(), s.applyTo(), t)).findFirst().map(MdmLayoutVersion.Segment::snapshot);
    }
```

`layout` 의 `@SuppressWarnings` 는 필요 없으면 지운다. import: `java.util.Set`, `kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup`.

- [ ] **Step 5: `MdmCachedDefinitions` 를 고친다**

클래스 선언을 `public final class MdmCachedDefinitions implements DefinitionLookup, CodeLookup, CodeEffLookup` 로 바꾸고, Javadoc 의 "캐시에 없는 코드는…" 문단 뒤에 "D-154 — 버전 대상은 캐시에 있는 목차로 판정 시각의 버전을 고르고 그 본문을 읽는다. 목차가 없으면 `종류:키`, 본문이 없으면 `종류:키@ver` 로 부재를 기록한다. 코드는 목차·본문 어느 쪽이 없어도 던진다 — `CodeEffLookup` 에 빈 값을 주면 해석기가 본문 행으로 계산하는데, 그 행마저 없으면 TABLE 소속이 조용히 false 가 되기 때문이다(스펙 §5.4 불변식)" 를 더한다. `Read` 레코드·`read(...)` 는 컬럼만 쓰도록 남기고 아래로 바꾼다.

```java
    @Override
    public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) {
        return at(MdmTargetType.RULE, ruleId, evalTs).map(RuleDefinition.class::cast);
    }

    @Override
    public Optional<RuleSetDefinition> ruleSet(String setId, Instant evalTs) {
        return at(MdmTargetType.RULE_SET, setId, evalTs).map(RuleSetDefinition.class::cast);
    }

    @Override
    public Optional<CodeRows> code(String maruCodeId) {
        MdmMetaService.CachedRead toc = service.cachedToc(MdmTargetType.CODE, maruCodeId);
        if (!toc.cached()) {
            miss(MdmTargetType.CODE, maruCodeId);
            throw new MdmUnavailableException("캐시에 없는 마루 코드입니다(평가 중에는 MDM 을 부르지 않습니다): " + maruCodeId);
        }
        return Optional.ofNullable((MdmToc) toc.value()).map(MdmToc::codeRows);
    }

    @Override
    public Optional<CodeRows> codeAt(String maruCodeId, BigDecimal ver) {
        return Optional.of(cachedCode(maruCodeId, ver).rows());
    }

    @Override
    public Optional<Set<String>> codes(String maruCodeId, BigDecimal ver, String cateId) {
        return cachedCode(maruCodeId, ver).members(cateId);
    }

    /** 코드 버전 본문 — 캐시에 없으면 부재 기록 후 던진다(빈 값을 주지 않는다, 스펙 §5.4 불변식). */
    private MdmCodeVersion cachedCode(String maruCodeId, BigDecimal ver) {
        String v = MdmVersions.key(ver);
        MdmMetaService.CachedRead body = service.cachedBody(MdmTargetType.CODE, maruCodeId, v);
        if (!body.cached() || body.value() == null) {
            miss(MdmTargetType.CODE, MdmVersions.logical(maruCodeId, v));
            throw new MdmUnavailableException("캐시에 없는 코드 버전 본문입니다(평가 중에는 MDM 을 부르지 않습니다): "
                    + MdmVersions.logical(maruCodeId, v));
        }
        return (MdmCodeVersion) body.value();
    }

    /** 룰·세트 — 캐시의 목차로 판정 시각의 버전을 고르고 그 본문. 목차·본문이 캐시에 없으면 부재 기록 후 빈 값, 적용 버전이 없어도 빈 값. */
    private Optional<Object> at(MdmTargetType type, String key, Instant evalTs) {
        MdmMetaService.CachedRead toc = service.cachedToc(type, key);
        if (!toc.cached()) {
            miss(type, key);
            return Optional.empty();
        }
        if (toc.value() == null) {
            return Optional.empty();
        }
        Optional<String> ver = MdmVersionSelector.select(type, (MdmToc) toc.value(), LocalDateTime.ofInstant(evalTs, MdmDefinitionLookup.KST));
        if (ver.isEmpty()) {
            return Optional.empty();
        }
        MdmMetaService.CachedRead body = service.cachedBody(type, key, ver.get());
        if (!body.cached()) {
            miss(type, MdmVersions.logical(key, ver.get()));
            return Optional.empty();
        }
        return Optional.ofNullable(body.value());
    }

    private static void miss(MdmTargetType type, String key) {
        MissLog log = CURRENT.get();
        if (log != null && key != null) {
            log.add(type, key);
        }
    }
```

`read(...)` 안의 부재 기록 세 줄은 `miss(type, key);` 로 바꾼다. import: `java.math.BigDecimal`, `java.time.LocalDateTime`, `kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup`.

- [ ] **Step 6: 검증기·컨트롤러가 `NONE` 대신 이 구현을 쓰게 한다**

`MdmValidator.cacheOnlyEvaluator` 의 `new EngineLookups(cached, cached, CodeEffLookup.NONE, …)` 를 `new EngineLookups(cached, cached, cached, …)` 로 바꾸고, 쓰이지 않게 된 `CodeEffLookup` import 를 지운다.

`MdmMetaController` 생성자:

```java
        MdmDefinitionLookup lookup = new MdmDefinitionLookup(service);
        this.codes = new DefaultCodeResolver(lookup, lookup); // 소속은 본문 색인(D-154), off 면 전 이력으로 계산
```

`prefetchCodes` 의 마지막 줄을 `return new HashSet<>(service.lookupAt(MdmTargetType.CODE, ids, clock.instant()).unavailable());` 로 바꾼다. 쓰이지 않게 된 `CodeEffLookup` import 를 지운다.

- [ ] **Step 7: 시험을 돌린다**

Run:
- `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :cactus-core:test --tests 'com.dongkuk.dmes.cactus.mdm.*'`
- `cd src/backend/mls && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mls.lsh.noticeMgmt.NoticeMgmtMdmRealValidatorTest'`
- `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mdm.feed.MdmMetaFeedContractHttpTest'`

Expected: 모두 PASS. 기존 `MdmDefinitionLookupTest`·`MdmValidatorTest`·`MdmMetaControllerTest` 는 off 경로로 지금과 같은 결과를 내야 한다.

- [ ] **Step 8: 커밋**

```bash
/usr/bin/git add src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmDefinitionLookup.java src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmCachedDefinitions.java src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmValidator.java src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmMetaController.java src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmDefinitionLookupVersionedTest.java src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmCachedDefinitionsTest.java src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmMetaControllerTest.java
/usr/bin/git commit -m "feat(cactus): 엔진 코드 조회를 목차·버전 본문·소속 색인으로 잇고 캐시만 읽는 경로의 본문 부재를 검증 불가로 남긴다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: cactus — 저장 검증 미리 받기를 판정 시각 본문으로

스펙 §7.2. 미리 받는 순서(컬럼 → 룰 세트 → 그 룰 → 식이 참조하는 코드)는 그대로 두고, 세트·룰·코드 단계가 `lookupAt(…, ts)` 로 목차와 판정 시각 본문을 받는다. 세트·룰 버전 선택은 목차로 한다(서비스가 한다). off 서비스에서는 `lookupAt` 이 지금 경로라 결과가 같다.

**Files:**
- Modify: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmValidator.java:224-283`
- Create: `src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmValidatorVersionedTest.java`

**Interfaces:**
- Consumes: Task 11 `lookupAt`·`MdmAt`, Task 13 캐시 전용 조회기.
- Produces: 없음(검증기 동작 — `MdmValidationResult` 모양 그대로).

- [ ] **Step 1: 실패하는 시험을 쓴다**

```java
package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.common.BusinessException;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** D-154 — 버전 경로의 저장 검증 미리 받기(스펙 §7.2). 세트 S: 1.000 [2026-01-01, 2026-06-01) 룰 R1, 2.000 [2026-06-01, 열린 끝) 룰 R2. */
class MdmValidatorVersionedTest {

    private static final Instant T0 = Instant.parse("2026-10-02T15:00:00Z");
    private static final LocalDateTime B = LocalDateTime.parse("2026-06-01T00:00:00");
    private FakeMetaFeed feed;
    private MdmMetaService service;
    private MdmValidator validator;

    @BeforeEach
    void setUp() {
        MutableClock clock = new MutableClock(T0);
        feed = new FakeMetaFeed().versioned();
        feed.put(MdmTargetType.RULE_SET, "S", List.of(
                new RuleSetDefinition("S", new BigDecimal("1.000"), LocalDateTime.parse("2026-01-01T00:00:00"), B, List.of("R1"), SetStatus.INUSE, null),
                new RuleSetDefinition("S", new BigDecimal("2.000"), B, null, List.of("R2"), SetStatus.INUSE, null)));
        feed.put(MdmTargetType.RULE, "R1", List.of(MdmValidatorTest.contractRule("R1", "QTY", DataType.NUMBER)));
        feed.put(MdmTargetType.RULE, "R2", List.of(MdmValidatorTest.contractRule("R2", "QTY", DataType.NUMBER)));
        feed.put(MdmTargetType.COLUMN, "TB_COL", new MdmColumnMeta("TB_COL", "TB 컬럼", null, "TB", null, null, null, "STRING", 10, null, false,
                null, null, null, null, new MdmColumnMeta.DomainRef("8", "코드", "CODE"), null, null, List.of(),
                new MdmColumnMeta.CodeRefMeta("C", "TB"), null, null, null));
        feed.put(MdmTargetType.CODE, "C", MdmMetaServiceVersionedTest.codeRows());
        MdmMetaCache cache = new MdmMetaCache(1000, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        cache.clear(0);
        service = new MdmMetaService(feed, cache, clock, true);
        validator = new MdmValidator(service, FunctionProvider.NONE, MdmValidator.OnUnavailable.REJECT, clock);
    }

    private static Map<String, Object> row(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    @Test
    void 판정_시각에_적용되는_세트_버전의_룰만_미리_받는다() {
        validator.validate(MdmValidationRequest.rows("g", List.of(row("QTY", 1))).ruleSet("S").evalTs(Instant.parse("2026-03-01T00:00:00Z")).build());
        validator.validate(MdmValidationRequest.rows("g", List.of(row("QTY", 1))).ruleSet("S").evalTs(T0).build());

        assertThat(feed.tocKeys.stream().flatMap(List::stream).toList()).contains("R1", "R2");
        assertThat(feed.tocAts).contains(LocalDateTime.parse("2026-03-01T09:00:00"), LocalDateTime.parse("2026-10-03T00:00:00"));
    }

    @Test
    void CODE_도메인_TABLE_카테고리를_판정_시각_본문으로_검증한다() {
        MdmValidationResult ok = validator.validate(MdmValidationRequest.rows("g", List.of(row("TB_COL", "B"))).columns("TB_COL").build());
        MdmValidationResult bad = validator.validate(MdmValidationRequest.rows("g", List.of(row("TB_COL", "A"))).columns("TB_COL").build());

        assertThat(ok.errors()).isEmpty();
        assertThat(ok.unavailable()).isEmpty();
        assertThat(bad.errors()).hasSize(1);
    }

    @Test
    void 판정_시각_본문을_받을_수_없으면_검증_불가이고_REJECT_면_저장을_막는다() {
        feed.failedKeys.put("C", "깨진 코드 정의"); // 컬럼은 받고 코드 목차·본문만 받을 수 없다
        assertThat(validator.validate(MdmValidationRequest.rows("g", List.of(row("TB_COL", "B"))).columns("TB_COL").build()).unavailable())
                .containsExactly("CODE:C");
        MdmValidationRequest req = MdmValidationRequest.rows("g", List.of(row("TB_COL", "B"))).columns("TB_COL").build();
        assertThatThrownBy(() -> validator.check(req)).isInstanceOf(BusinessException.class);
    }
}
```

`MdmValidatorTest.contractRule(...)` 은 `applyFrom = FROM(2026-01-01)`, `applyTo = null` 인 1.000 룰이다. `ruleSetResults` 의 모양은 바꾸지 않는다.

- [ ] **Step 2: 실패를 확인한다**

Run: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :cactus-core:test --tests 'com.dongkuk.dmes.cactus.mdm.MdmValidatorVersionedTest'`
Expected: FAIL — 미리 받기가 `service.lookup(RULE_SET, …)` 를 불러 `IllegalStateException`.

- [ ] **Step 3: 미리 받기를 고친다**

`MdmValidator.prefetch` 의 "룰 세트와 그 룰" 블록과 "식이 참조하는 마루 코드" 블록의 조회를 아래로 바꾼다(컬럼 블록·`skip`·`skipMissing`·Plan 은 그대로).

```java
        // 룰 세트와 그 룰 — 판정 시각 ts 의 버전(목차로 고른다, D-154 스펙 §7.2)
        Set<String> setIds = new LinkedHashSet<>(request.ruleSets());
        if (!setIds.isEmpty()) {
            MdmMetaService.MdmAtLookup sets = service.lookupAt(MdmTargetType.RULE_SET, setIds, ts);
            for (String setId : sets.missing()) {
                skipMissing(item(MdmTargetType.RULE_SET, setId), skipped, missing);
            }
            for (String setId : sets.unavailable()) {
                skip(item(MdmTargetType.RULE_SET, setId), item(MdmTargetType.RULE_SET, setId), skipped, unavailable);
            }
            Map<String, Set<String>> rulesBySet = new LinkedHashMap<>();
            sets.found().forEach((setId, at) -> {
                if (at.body() instanceof RuleSetDefinition set) { // 적용 버전이 없으면 엔진이 SET_NOT_FOUND 로 행 오류를 낸다
                    rulesBySet.put(setId, MdmExprRefs.ruleIds(set));
                    codesByItem.put(item(MdmTargetType.RULE_SET, setId), new LinkedHashSet<>(refs.flowCodes(set)));
                }
            });
            Set<String> ruleIds = new LinkedHashSet<>();
            rulesBySet.values().forEach(ruleIds::addAll);
            if (!ruleIds.isEmpty()) {
                MdmMetaService.MdmAtLookup ruleDefs = service.lookupAt(MdmTargetType.RULE, ruleIds, ts);
                rulesBySet.forEach((setId, ids) -> {
                    String setItem = item(MdmTargetType.RULE_SET, setId);
                    for (String ruleId : ids) {
                        if (ruleDefs.unavailable().contains(ruleId)) {
                            skip(setItem, item(MdmTargetType.RULE, ruleId), skipped, unavailable);
                        }
                        MdmMetaService.MdmAt at = ruleDefs.found().get(ruleId); // MDM 에 없는 룰은 엔진이 RULE_NOT_FOUND 로 행 오류를 낸다
                        if (at != null && at.body() instanceof RuleDefinition rule) {
                            codesByItem.get(setItem).addAll(refs.ruleCodes(rule));
                        }
                    }
                });
            }
        }

        // 식이 참조하는 마루 코드 — 목차 + 판정 시각 본문
        Set<String> codeIds = new LinkedHashSet<>();
        codesByItem.forEach((itemKey, ids) -> {
            if (!skipped.contains(itemKey)) {
                codeIds.addAll(ids);
            }
        });
        if (!codeIds.isEmpty()) {
            MdmMetaService.MdmAtLookup codes = service.lookupAt(MdmTargetType.CODE, codeIds, ts);
            codesByItem.forEach((itemKey, ids) -> {
                for (String id : ids) {
                    if (codes.unavailable().contains(id)) {
                        skip(itemKey, item(MdmTargetType.CODE, id), skipped, unavailable);
                    } else if (codes.missing().contains(id)) {
                        skip(itemKey, "MASTER:" + id, skipped, unavailable); // 마루 데이터 대상 MASTER — 지원하지 않는다(§6.4)
                    }
                }
            });
        }
```

`prefetch` 의 `@SuppressWarnings("unchecked")` 는 더 필요 없으면 지운다.

- [ ] **Step 4: 시험을 돌린다**

Run:
- `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :cactus-core:test --tests 'com.dongkuk.dmes.cactus.mdm.*'`
- `cd src/backend/mls && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mls.lsh.noticeMgmt.NoticeMgmtMdmRealValidatorTest'`

Expected: 둘 다 PASS(기존 `MdmValidatorTest` 는 off 경로로 지금과 같다).

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmValidator.java src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmValidatorVersionedTest.java
/usr/bin/git commit -m "feat(cactus): 저장 검증 미리 받기가 룰 세트·룰·코드의 판정 시각 본문을 받게 한다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: `MASTER_AT` base_dt 미리 받기 — 엔진 base_dt 해석 공개, 식 참조 넷째 인자, 검증기

스펙 §7.3(결정 P8). 미리 받기에서 `MASTER_AT` 의 넷째 인자를 미리 풀어 그 시각의 코드 본문까지 받는다. 문자열 상수는 그 시각, 요청 행에 실제로 있는 칸 하나를 가리키는 변수는 행들의 그 칸 값마다 받는다. 시각 해석은 엔진과 같은 규칙(8자리 → 그날 00:00, 14자리 → 그 시각, 달력에 없으면 안 됨)을 엔진 공개 함수 하나로 쓴다. 해석할 수 없는 값과 그 밖의 식은 미리 받지 않고 엔진 평가에 맡긴다 — 결과는 off(전 이력) 경로와 같아야 한다.

**Files:**
- Create: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/expr/MasterBaseDt.java`
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/expr/MasterQuery.java:13-18, 75-94`
- Create: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/expr/MasterBaseDtTest.java`
- Modify: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmExprRefs.java`
- Modify: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmValidator.java`(prefetch 끝)
- Create: `src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmValidatorMasterAtTest.java`

**Interfaces:**
- Consumes: Task 11 `lookupAt`, Task 14 미리 받기 구조.
- Produces: `MasterBaseDt.isShape(String) : boolean`(8·14자리 숫자), `MasterBaseDt.parse(String) : Optional<LocalDateTime>`. `MdmExprRefs.MasterAtRef(String codeId, LocalDateTime at, String var)`, `Set<MasterAtRef> columnMasterAt(MdmColumnMeta)`, `flowMasterAt(RuleSetDefinition)`, `ruleMasterAt(RuleDefinition)`.

- [ ] **Step 1: 엔진 실패 시험을 쓴다**

```java
package kr.dongkuk.maru.mdm.engine.expr;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** D-154 — {@code MASTER_AT} base_dt 해석을 공개해 업무 모듈 미리 받기가 같은 규칙을 쓴다(engine-contract §7, D-023). */
class MasterBaseDtTest {

    @Test
    void 여덟_자리는_그날_자정_열네_자리는_그_시각이다() {
        assertEquals(Optional.of(LocalDateTime.parse("2026-03-01T00:00:00")), MasterBaseDt.parse("20260301"));
        assertEquals(Optional.of(LocalDateTime.parse("2026-03-01T12:30:15")), MasterBaseDt.parse("20260301123015"));
    }

    @Test
    void 달력에_없거나_모양이_다르면_빈_값이다() {
        assertEquals(Optional.empty(), MasterBaseDt.parse("20261301"));
        assertEquals(Optional.empty(), MasterBaseDt.parse("20260230"));
        assertEquals(Optional.empty(), MasterBaseDt.parse("2026-03-01"));
        assertEquals(Optional.empty(), MasterBaseDt.parse(""));
        assertEquals(Optional.empty(), MasterBaseDt.parse(null));
        assertTrue(MasterBaseDt.isShape("20261301"));
        assertFalse(MasterBaseDt.isShape("2026031"));
    }
}
```

- [ ] **Step 2: 엔진 구현 — `MasterBaseDt` 와 `MasterQuery` 위임**

```java
package kr.dongkuk.maru.mdm.engine.expr;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * {@code MASTER_AT} base_dt 문자열 해석(engine-contract §7, D-023) — 8자리 {@code YYYYMMDD} 는 그날 00:00:00, 14자리 {@code YYYYMMDDHHMMSS} 는 그
 * 시각(KST). 엔진 평가({@link MasterQuery#baseDt})와 업무 모듈 미리 받기(D-154)가 이 한 곳을 쓴다.
 */
public final class MasterBaseDt {

    private static final Pattern DATE_8 = Pattern.compile("[0-9]{8}");
    private static final Pattern DATE_TIME_14 = Pattern.compile("[0-9]{14}");
    private static final DateTimeFormatter YYYYMMDD = DateTimeFormatter.ofPattern("uuuuMMdd").withResolverStyle(ResolverStyle.STRICT);
    private static final DateTimeFormatter YYYYMMDDHHMMSS =
            DateTimeFormatter.ofPattern("uuuuMMddHHmmss").withResolverStyle(ResolverStyle.STRICT);

    private MasterBaseDt() {
    }

    /** 8자리 또는 14자리 숫자 모양인가(달력 검사는 하지 않는다). */
    public static boolean isShape(String s) {
        return s != null && (DATE_8.matcher(s).matches() || DATE_TIME_14.matcher(s).matches());
    }

    /** 모양이 맞고 달력에 있는 일시면 그 값, 아니면 빈 값. */
    public static Optional<LocalDateTime> parse(String s) {
        if (!isShape(s)) {
            return Optional.empty();
        }
        try {
            return Optional.of(s.length() == 8 ? LocalDate.parse(s, YYYYMMDD).atStartOfDay() : LocalDateTime.parse(s, YYYYMMDDHHMMSS));
        } catch (DateTimeParseException e) {
            return Optional.empty();
        }
    }
}
```

`MasterQuery` 의 `DATE_8`·`DATE_TIME_14`·`YYYYMMDD`·`YYYYMMDDHHMMSS` 상수를 지우고 `baseDt` 를 아래로 바꾼다(오류 문구 그대로).

```java
    static LocalDateTime baseDt(Token token, EvaluationValue value) throws EvaluationException {
        if (value.isNullValue()) {
            return null;
        }
        if (value.isStringValue() && MasterBaseDt.isShape(value.getStringValue())) {
            String s = value.getStringValue();
            return MasterBaseDt.parse(s).orElseThrow(() -> new EvaluationException(token, "MASTER_AT base_dt '" + s + "' 는 달력에 없는 일시다"));
        }
        throw new EvaluationException(token,
                "MASTER_AT base_dt 는 YYYYMMDD·YYYYMMDDHHMMSS 문자열이어야 한다: " + value.getValue());
    }
```

`orElseThrow` 람다 안에서 checked `EvaluationException` 을 던질 수 없으면 `Optional<LocalDateTime> dt = MasterBaseDt.parse(s); if (dt.isEmpty()) throw new EvaluationException(...); return dt.get();` 로 쓴다. 쓰이지 않게 된 import 를 지운다.

Run: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :maru-mdm-engine:test`
Expected: PASS(`MasterBaseDtTest` 와 기존 `MasterFunctionTest` 의 base_dt 사례).

- [ ] **Step 3: cactus 실패 시험을 쓴다**

같은 요청을 off 서비스(전 이력 — 어떤 시각도 캐시만으로 판정)와 버전 서비스에 돌려 결과가 같은지 본다. 비즈니스식의 `MASTER_AT` 이 행의 `ORDER_DT` 칸(또는 상수)을 base_dt 로 쓴다. 코드 C: 1.000 [2026-01-01, 2026-07-01) items A, 2.000 [2026-07-01, 열린 끝) items A·B — 판정 시각 ts(2026-10-03)는 2.000 이다.

```java
package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import org.junit.jupiter.api.Test;

/**
 * D-154 — {@code MASTER_AT} 의 base_dt 미리 받기(스펙 §7.3, 결정 P8, Review Focus 5). 버전 경로의 결과가 off(전 이력) 경로와 행마다 같아야 한다.
 * 비즈니스식 {@code MASTER_AT("C", "TB", value, ORDER_DT)} — TB 는 2.000 부터라 1.000 시각에는 최초 소급으로 소속이 빈 집합이다.
 */
class MdmValidatorMasterAtTest {

    private static final Instant T0 = Instant.parse("2026-10-02T15:00:00Z");

    private static MdmColumnMeta col(String bizExpr, List<String> requiredVars) {
        return MdmValidatorTest.withBiz(MdmValidatorTest.str("CODE_VAL", "코드 값", 10, false), bizExpr, requiredVars);
    }

    private static Map<String, Object> row(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    private static MdmValidationResult run(boolean versioned, MdmColumnMeta column, List<Map<String, Object>> rows) {
        MutableClock clock = new MutableClock(T0);
        FakeMetaFeed feed = new FakeMetaFeed();
        if (versioned) {
            feed.versioned();
        }
        feed.put(MdmTargetType.COLUMN, "CODE_VAL", column);
        feed.put(MdmTargetType.CODE, "C", MdmMetaServiceVersionedTest.codeRows());
        MdmMetaCache cache = new MdmMetaCache(1000, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        cache.clear(0);
        MdmMetaService service = versioned ? new MdmMetaService(feed, cache, clock, true) : new MdmMetaService(feed, cache, clock);
        MdmValidator v = new MdmValidator(service, FunctionProvider.NONE, MdmValidator.OnUnavailable.REJECT, clock);
        return v.validate(MdmValidationRequest.rows("g", rows).columns("CODE_VAL").build());
    }

    private static void assertSame(MdmColumnMeta column, List<Map<String, Object>> rows) {
        MdmValidationResult off = run(false, column, rows);
        MdmValidationResult on = run(true, column, rows);
        assertThat(on.errors()).usingRecursiveComparison().isEqualTo(off.errors());
        assertThat(on.unavailable()).isEqualTo(off.unavailable());
    }

    @Test
    void 행_칸의_8자리_14자리_날짜마다_그_시각_본문을_미리_받아_off_와_같다() {
        MdmColumnMeta c = col("MASTER_AT(\"C\", \"TB\", value, ORDER_DT)", List.of("ORDER_DT"));
        List<Map<String, Object>> rows = List.of(
                row("CODE_VAL", "B", "ORDER_DT", "20260301"),          // 1.000 — TB 소속 없음
                row("CODE_VAL", "B", "ORDER_DT", "20260801"),          // 2.000 — B 소속
                row("CODE_VAL", "B", "ORDER_DT", "20260301120000"));   // 14자리
        assertSame(c, rows);
        MdmValidationResult on = run(true, c, rows);
        assertThat(on.unavailable()).as("1.000 본문을 미리 받았다").isEmpty();
        assertThat(on.errors()).hasSize(2);
    }

    @Test
    void 문자열_상수_base_dt_도_미리_받는다() {
        MdmColumnMeta c = col("MASTER_AT(\"C\", \"BASE\", value, \"20260301\")", List.of());
        List<Map<String, Object>> rows = List.of(row("CODE_VAL", "A"), row("CODE_VAL", "B"));
        assertSame(c, rows);
        assertThat(run(true, c, rows).unavailable()).isEmpty();
    }

    @Test
    void 해석할_수_없는_값은_미리_받지_않고_엔진_평가에_맡겨_off_와_같다() {
        MdmColumnMeta c = col("MASTER_AT(\"C\", \"TB\", value, ORDER_DT)", List.of("ORDER_DT"));
        assertSame(c, Arrays.asList(
                row("CODE_VAL", "B", "ORDER_DT", "20261301"),   // 달력에 없음 — 평가 오류
                row("CODE_VAL", "B", "ORDER_DT", 20260301),     // 숫자 — 평가 오류
                row("CODE_VAL", "B", "ORDER_DT", ""),           // 빈 값
                row("CODE_VAL", "B")));                         // 칸 없음(필수 변수 없음)
    }

    @Test
    void 같은_물리명_칸이_겹친_행은_미리_받지_않고_지금과_같은_형식_오류다() {
        MdmColumnMeta c = col("MASTER_AT(\"C\", \"TB\", value, ORDER_DT)", List.of("ORDER_DT"));
        assertSame(c, List.of(row("CODE_VAL", "B", "orderDt", "20260301", "ORDER_DT", "20260801")));
    }
}
```

`MdmValidatorTest.str`·`withBiz` 는 package-private static 이라 그대로 쓴다.

- [ ] **Step 4: 실패를 확인한다**

Run: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :cactus-core:test --tests 'com.dongkuk.dmes.cactus.mdm.MdmValidatorMasterAtTest'`
Expected: 첫 두 시험 FAIL — 버전 경로의 `unavailable` 에 `CODE:C@1.000` 이 있다(1.000 본문을 미리 받지 않았다).

- [ ] **Step 5: `MdmExprRefs` 가 넷째 인자를 함께 모으게 한다**

```java
    /** {@code MASTER_AT} 의 미리 받을 수 있는 기준 시각 — 문자열 상수({@code at})이거나 변수 이름({@code var}, 행 칸으로 푼다). */
    record MasterAtRef(String codeId, LocalDateTime at, String var) {
    }

    /** 식 하나에서 찾은 코드 ID 와 MASTER_AT 기준 시각. */
    private record Refs(Set<String> codeIds, Set<MasterAtRef> masterAt) {
    }
```

`byText` 를 `Map<String, Refs>` 로 바꾸고, `text(String, Set<String>)` 를 `text(String, Set<String> ids, Set<MasterAtRef> at)` 로, `scan(Object, Set<String>)` 을 `scan(Object, Set<String> ids, Set<MasterAtRef> at)` 로 넓힌다. 기존 시그니처 `static void scan(Object node, Set<String> out)` 은 `scan(node, out, new LinkedHashSet<>())` 위임으로 남긴다. `scan` 의 코드 ID 판정 블록 뒤에 아래를 더한다.

```java
            if ("MASTER_AT".equals(fn.toUpperCase(Locale.ROOT)) && args.size() >= 4 && args.get(3) instanceof Map<?, ?> fourth) {
                if ("STRING_LITERAL".equals(fourth.get("type")) && fourth.get("value") instanceof String s) {
                    MasterBaseDt.parse(s).ifPresent(dt -> at.add(new MasterAtRef(id, dt, null)));
                } else if ("VARIABLE_OR_CONSTANT".equals(fourth.get("type")) && fourth.get("value") instanceof String v) {
                    at.add(new MasterAtRef(id, null, v));
                }
            }
```

(위 블록은 첫 인자가 문자열 상수 `id` 로 확인된 if 안에 둔다.) `columnCodes`·`flowCodes`·`ruleCodes` 의 몸체를 `private void column(MdmColumnMeta m, Set<String> ids, Set<MasterAtRef> at)` 같은 수집기로 옮기고, 기존 세 메서드는 `ids` 만, 새 세 메서드 `columnMasterAt`·`flowMasterAt`·`ruleMasterAt` 은 `at` 만 돌려준다. 클래스 Javadoc 에 "D-154 — `MASTER_AT` 의 넷째 인자(문자열 상수는 {@link MasterBaseDt} 로 푼 시각, 변수는 이름)도 모은다(스펙 §7.3)" 를 더한다. import: `java.time.LocalDateTime`, `kr.dongkuk.maru.mdm.engine.expr.MasterBaseDt`.

- [ ] **Step 6: 검증기 미리 받기 끝에 base_dt 단계를 더한다**

`prefetch` 에서 `codesByItem` 을 채우는 세 곳에 같은 항목 키로 `atByItem` 을 채운다.

```java
        Map<String, Set<MdmExprRefs.MasterAtRef>> atByItem = new LinkedHashMap<>(); // codesByItem 선언 바로 아래
        // 컬럼 — found.found().forEach 안, codesByItem.put(...) 다음 줄
        atByItem.put(item(MdmTargetType.COLUMN, phys), new LinkedHashSet<>(refs.columnMasterAt(m)));
        // 룰 세트 — sets.found().forEach 안, codesByItem.put(...) 다음 줄
        atByItem.put(item(MdmTargetType.RULE_SET, setId), new LinkedHashSet<>(refs.flowMasterAt(set)));
        // 룰 — ruleDefs 처리 안, codesByItem.get(setItem).addAll(...) 다음 줄
        atByItem.get(setItem).addAll(refs.ruleMasterAt(rule));
```

그다음 코드 단계 뒤, `return new Plan(...)` 앞에 아래를 넣는다.

```java
        // MASTER_AT 기준 시각의 본문(스펙 §7.3, 결정 P8) — 상수는 그 시각, 행 칸 변수는 행들의 그 칸 값마다. 풀 수 없는 값은 엔진 평가에 맡긴다
        Map<LocalDateTime, Map<String, Set<String>>> byTime = new TreeMap<>(); // 시각 → 코드 → 항목
        atByItem.forEach((itemKey, ats) -> {
            if (skipped.contains(itemKey)) {
                return;
            }
            for (MdmExprRefs.MasterAtRef ref : ats) {
                for (LocalDateTime dt : baseTimes(ref, request.rows())) {
                    byTime.computeIfAbsent(dt, k -> new LinkedHashMap<>()).computeIfAbsent(ref.codeId(), k -> new LinkedHashSet<>()).add(itemKey);
                }
            }
        });
        byTime.forEach((dt, byCode) -> {
            MdmMetaService.MdmAtLookup r = service.lookupAt(MdmTargetType.CODE, byCode.keySet(), dt.atZone(MdmDefinitionLookup.KST).toInstant());
            byCode.forEach((id, items) -> {
                if (r.unavailable().contains(id)) {
                    items.forEach(itemKey -> skip(itemKey, item(MdmTargetType.CODE, id), skipped, unavailable));
                }
            });
        });
```

```java
    /** MASTER_AT 기준 시각 — 상수면 그 시각, 변수면 삭제가 아닌 행마다 그 물리명 칸이 하나뿐이고 문자열이며 풀리는 값. */
    private static Set<LocalDateTime> baseTimes(MdmExprRefs.MasterAtRef ref, List<Map<String, Object>> rows) {
        if (ref.at() != null) {
            return Set.of(ref.at());
        }
        String phys = MdmNames.toPhysName(ref.var());
        Set<LocalDateTime> out = new LinkedHashSet<>();
        if (phys == null) {
            return out;
        }
        for (Map<String, Object> row : rows) {
            if (row == null || deleted(row)) {
                continue;
            }
            Object value = null;
            int n = 0;
            for (Map.Entry<String, Object> e : row.entrySet()) {
                if (phys.equals(MdmNames.toPhysName(e.getKey()))) {
                    n++;
                    value = e.getValue();
                }
            }
            if (n == 1 && value instanceof String s) { // 칸이 겹치면 미리 받지 않는다 — 검사 단계가 형식 오류로 잡는다
                MasterBaseDt.parse(s).ifPresent(out::add);
            }
        }
        return out;
    }
```

import: `java.time.LocalDateTime`, `java.util.TreeMap`, `kr.dongkuk.maru.mdm.engine.expr.MasterBaseDt`.

- [ ] **Step 7: 시험을 돌린다**

Run:
- `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :maru-mdm-engine:test`
- `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :cactus-core:test --tests 'com.dongkuk.dmes.cactus.mdm.*'`
- `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mdm.dmc.*' --tests 'com.dongkuk.dmes.mdm.feed.*'`

Expected: 모두 PASS.

- [ ] **Step 8: 커밋**

```bash
/usr/bin/git add src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/expr/MasterBaseDt.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/expr/MasterQuery.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/expr/MasterBaseDtTest.java src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmExprRefs.java src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmValidator.java src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmValidatorMasterAtTest.java
/usr/bin/git commit -m "feat(cactus): 저장 검증 미리 받기가 MASTER_AT 기준 시각의 코드 본문까지 받게 한다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: cactus — 판정 동치 시험(새 MDM·옛 MDM·off)

스펙 §6.1·§6.2「cactus 판정」「cactus 룰·세트·전문」. 같은 원장(전 이력 값)을 세 가지로 흉내 낸다: 새 MDM(`FakeMetaFeed.versioned()` + 버전 서비스), 옛 MDM(버전 서비스 + `fetch` 만 답하는 가짜 → 물러남), off(3인자 서비스). 같은 요청을 여러 판정 시각에 돌려 `MdmValidator.validate` 결과(오류·검증 불가·없음·세트 결과)가 같은지, 룰·세트·전문 선택이 목록 선택(`select`·`selectSet`·`selectLayout`)과 같은지 본다. 이 작업은 시험만 더한다 — 실패하면 앞 작업의 구현을 고친다.

**Files:**
- Create: `src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmVersionedEquivalenceTest.java`

**Interfaces:**
- Consumes: Task 11~15 전부.
- Produces: 없음.

- [ ] **Step 1: 시험을 쓴다**

```java
package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.code.CodeRowsProjection;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import org.junit.jupiter.api.Test;

/** D-154 — 새 MDM·옛 MDM(물러남)·off(전 이력 한 키) 세 경로의 판정 동치(스펙 §6.1·§6.2). 판정 시각은 경계 ±1초·첫 버전 전·열린 끝 쪽. */
class MdmVersionedEquivalenceTest {

    private static final LocalDateTime B1 = LocalDateTime.parse("2026-06-01T00:00:00");
    private static final LocalDateTime B2 = LocalDateTime.parse("2026-07-01T00:00:00");

    private enum Mode { NEW_MDM, OLD_MDM, OFF }

    private static List<Instant> times() {
        List<Instant> out = new ArrayList<>();
        for (LocalDateTime t : List.of(LocalDateTime.parse("2025-06-01T00:00:00"), B1.minusSeconds(1), B1, B1.plusSeconds(1),
                B2.minusSeconds(1), B2, B2.plusSeconds(1), LocalDateTime.parse("2030-01-01T00:00:00"))) {
            out.add(t.atZone(MdmDefinitionLookup.KST).toInstant());
        }
        return out;
    }

    private static void seed(FakeMetaFeed feed) {
        feed.put(MdmTargetType.CODE, "C", CodeRowsProjection.releasedOnly(MdmMetaServiceVersionedTest.codeRows()));
        feed.put(MdmTargetType.COLUMN, "TB_COL", new MdmColumnMeta("TB_COL", "TB 컬럼", null, "TB", null, null, null, "STRING", 10, null, false,
                null, null, null, null, new MdmColumnMeta.DomainRef("8", "코드", "CODE"), null, null, List.of(),
                new MdmColumnMeta.CodeRefMeta("C", "TB"), null, null, null));
        feed.put(MdmTargetType.COLUMN, "AT_COL", MdmValidatorTest.withBiz(MdmValidatorTest.str("AT_COL", "기준일 코드", 10, false),
                "MASTER_AT(\"C\", \"BASE\", value, ORDER_DT)", List.of("ORDER_DT")));
        feed.put(MdmTargetType.RULE_SET, "S", List.of(
                new RuleSetDefinition("S", new BigDecimal("1.000"), LocalDateTime.parse("2026-01-01T00:00:00"), B1, List.of("R1"), SetStatus.INUSE, null),
                new RuleSetDefinition("S", new BigDecimal("2.000"), B1, null, List.of("R2"), SetStatus.INUSE, null)));
        feed.put(MdmTargetType.RULE, "R1", List.of(MdmValidatorTest.contractRule("R1", "QTY", DataType.NUMBER)));
        feed.put(MdmTargetType.RULE, "R2", List.of(MdmValidatorTest.contractRule("R2", "QTY", DataType.STRING)));
        feed.put(MdmTargetType.LAYOUT, "42", List.of(
                new MdmLayoutVersion(new BigDecimal("1.000"), LocalDateTime.parse("2026-01-01T00:00:00"), B2,
                        List.of(new MdmLayoutVersion.Segment(LocalDateTime.parse("2026-01-01T00:00:00"), B1, Map.of("n", 1)),
                                new MdmLayoutVersion.Segment(B1, B2, Map.of("n", 2)))),
                new MdmLayoutVersion(new BigDecimal("2.000"), B2, null, List.of(new MdmLayoutVersion.Segment(B2, null, Map.of("n", 3))))));
    }

    private static MdmMetaService service(Mode mode, Instant now) {
        MutableClock clock = new MutableClock(now);
        FakeMetaFeed feed = new FakeMetaFeed();
        if (mode == Mode.NEW_MDM) {
            feed.versioned();
        }
        seed(feed);
        MdmMetaCache cache = new MdmMetaCache(1000, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        cache.clear(0);
        return mode == Mode.OFF ? new MdmMetaService(feed, cache, clock) : new MdmMetaService(feed, cache, clock, true);
    }

    private static Map<String, Object> row(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    @Test
    void 저장_검증_결과가_세_경로에서_모든_판정_시각에_같다() {
        List<Map<String, Object>> rows = List.of(
                row("TB_COL", "A", "AT_COL", "A", "ORDER_DT", "20260301", "QTY", 1),
                row("TB_COL", "B", "AT_COL", "B", "ORDER_DT", "20260801", "QTY", "x"),
                row("TB_COL", "Z", "AT_COL", "Z", "ORDER_DT", "20261301", "QTY", 2));
        int compared = 0;
        for (Instant ts : times()) {
            Map<Mode, MdmValidationResult> results = new LinkedHashMap<>();
            for (Mode mode : Mode.values()) {
                MdmValidator v = new MdmValidator(service(mode, ts), FunctionProvider.NONE, MdmValidator.OnUnavailable.REJECT,
                        new MutableClock(ts));
                results.put(mode, v.validate(MdmValidationRequest.rows("g", rows).columns("TB_COL", "AT_COL").ruleSet("S").evalTs(ts).build()));
            }
            for (Mode mode : List.of(Mode.NEW_MDM, Mode.OLD_MDM)) {
                assertThat(results.get(mode)).as(mode + " " + ts).usingRecursiveComparison().isEqualTo(results.get(Mode.OFF));
                compared++;
            }
        }
        assertThat(compared).isEqualTo(times().size() * 2);
    }

    @Test
    @SuppressWarnings("unchecked")
    void 룰_세트_전문_선택은_목록_선택과_같다() {
        for (Instant t : times()) {
            MdmMetaService off = service(Mode.OFF, t);
            List<RuleSetDefinition> sets = (List<RuleSetDefinition>) off.one(MdmTargetType.RULE_SET, "S").orElseThrow();
            List<RuleDefinition> rules = (List<RuleDefinition>) off.one(MdmTargetType.RULE, "R1").orElseThrow();
            List<MdmLayoutVersion> layouts = (List<MdmLayoutVersion>) off.one(MdmTargetType.LAYOUT, "42").orElseThrow();
            for (Mode mode : List.of(Mode.NEW_MDM, Mode.OLD_MDM)) {
                MdmDefinitionLookup lookup = new MdmDefinitionLookup(service(mode, t));
                assertThat(lookup.ruleSet("S", t)).as(mode + " set " + t).isEqualTo(MdmDefinitionLookup.selectSet(sets, t));
                assertThat(lookup.rule("R1", t)).as(mode + " rule " + t).isEqualTo(MdmDefinitionLookup.select(rules, t));
                assertThat(lookup.layout("42", t)).as(mode + " layout " + t).isEqualTo(MdmDefinitionLookup.selectLayout(layouts, t));
            }
        }
    }
}
```

`MdmValidationResult` 의 `ruleSetResults` 에 담긴 엔진 결과가 재귀 비교에서 시각·추적 ID 처럼 실행마다 다른 값을 가지면 `usingRecursiveComparison().ignoringFieldsMatchingRegexes(".*elapsed.*")` 처럼 그 칸만 뺀다(빼는 칸 이름과 이유를 주석으로 남긴다).

- [ ] **Step 2: 시험을 돌린다**

Run: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :cactus-core:test --tests 'com.dongkuk.dmes.cactus.mdm.MdmVersionedEquivalenceTest'`
Expected: PASS. 실패하면 기대값이 아니라 해당 경로의 구현(Task 11·13·14·15)을 고친다.

- [ ] **Step 3: 변이로 시험이 잡는지 확인하고 되돌린다**

`MdmVersionSelector.select` 의 CODE 분기를 잠시 지워 코드도 룰 규칙(소급 없음)으로 고르게 하고 Step 2 를 돌린다.
Expected: FAIL — 2025-06-01(첫 버전 전) 판정에서 NEW_MDM·OLD_MDM 의 코드 판정이 off(소급)와 다르다. 확인한 뒤 되돌린다. 변이가 잡히지 않으면 그 사실을 작업 보고에 적는다.

- [ ] **Step 4: 커밋**

```bash
/usr/bin/git add src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmVersionedEquivalenceTest.java
/usr/bin/git commit -m "test(cactus): 새 MDM·옛 MDM·off 세 경로의 MDM 메타 판정 동치를 고정한다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: cactus — 관리 엔드포인트(구분·논리 키·본문 수)와 `versioned-feed` 설정, 운영 배선 전환

스펙 §5.5 설정 블록·§7.1(항목 목록·상태·등록·상세)·§8(되돌리기). 이 작업에서 자동 설정이 버전 경로(`versioned-feed: auto`, 기본)를 켠다. 그 전에 모든 소비자(Task 12~15)가 `lookupAt` 계열로 바뀌어 있어야 한다. `off` 면 `part` 를 보내지 않고 지금 방식으로 돈다(재기동해 반영).

**Files:**
- Modify: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmClientProperties.java`
- Modify: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmAutoConfiguration.java:54-58`
- Modify: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmMetaController.java`(status·entries 행·entry·load)
- Modify: `src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmMetaControllerTest.java`
- Modify: `src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmAutoConfigurationTest.java`

**Interfaces:**
- Consumes: Task 10 `bodySizes`·`oldVersionMaxIdle`·`EntryView.part/ver/current`, Task 11 `reloadAt`·`versioned()`.
- Produces:
  - `MdmClientProperties.VersionedFeed { AUTO, OFF }`, `getVersionedFeed()`/`setVersionedFeed(...)`(기본 AUTO).
  - status 응답에 `bodyCounts`(종류별 본문 수)·`oldVersionMaxIdleSeconds`·`versionedFeed`(boolean).
  - entries·entry 행에 `part`("VALUE"|"TOC"|"BODY")·`ver`(본문만)·`current`(본문만 boolean, 그 밖 null). `key` 는 논리 키.
  - load: 버전 대상 키는 논리 키(`X` 또는 `X@1.000`)를 받고 `loaded` 에 논리 키를 돌려준다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`MdmMetaControllerTest` 에 버전 경로 컨트롤러를 만드는 보조와 시험을 더한다.

```java
    private record Versioned(FakeMetaFeed feed, MdmMetaService service, MockMvc mvc) {
    }

    private Versioned versioned() {
        FakeMetaFeed vfeed = new FakeMetaFeed().versioned();
        vfeed.put(MdmTargetType.RULE, "R", List.of(
                MdmDefinitionLookupTest.rule("1.000", LocalDateTime.parse("2026-01-01T00:00:00"), LocalDateTime.parse("2026-06-01T00:00:00")),
                MdmDefinitionLookupTest.rule("2.000", LocalDateTime.parse("2026-06-01T00:00:00"), null)));
        vfeed.put(MdmTargetType.CODE, "PROC_CD", MdmValidatorTest.codeRows("PROC_CD"));
        MdmMetaCache vcache = new MdmMetaCache(100, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        vcache.clear(0);
        MdmMetaService vservice = new MdmMetaService(vfeed, vcache, clock, true);
        MdmRevisionPoller vpoller = new MdmRevisionPoller(vfeed, vcache, vservice, clock, Duration.ofSeconds(10), 1000);
        MockMvc vmvc = MockMvcBuilders.standaloneSetup(new MdmMetaController("mls", "123@host", vservice, vcache, vpoller, clock))
                .setCustomHandlerMapping(CactusRequestMappingHandlerMapping::new).build();
        return new Versioned(vfeed, vservice, vmvc);
    }

    @Test
    void 버전_경로_entries_는_구분_ver_최종_여부와_논리_키를_싣는다() throws Exception {
        Versioned v = versioned();
        v.service().lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant());                         // 목차 + 2.000(최종)
        v.service().lookupAt(MdmTargetType.RULE, List.of("R"), Instant.parse("2026-03-01T00:00:00Z"));   // 1.000(옛)

        v.mvc().perform(get("/api/mls/mdmMeta/entries").param("type", "RULE").header("X-Authenticated-Role", "SYSADMIN"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(3))
                .andExpect(jsonPath("$.items[0].key").value("R"))
                .andExpect(jsonPath("$.items[0].part").value("TOC"))
                .andExpect(jsonPath("$.items[0].current").value(nullValue()))
                .andExpect(jsonPath("$.items[1].key").value("R@1.000"))
                .andExpect(jsonPath("$.items[1].part").value("BODY"))
                .andExpect(jsonPath("$.items[1].ver").value("1.000"))
                .andExpect(jsonPath("$.items[1].current").value(false))
                .andExpect(jsonPath("$.items[2].current").value(true));
    }

    @Test
    void 버전_경로_status_는_본문_수_옛_버전_수명_버전_경로_여부를_싣는다() throws Exception {
        Versioned v = versioned();
        v.service().lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant());

        v.mvc().perform(get("/api/mls/mdmMeta/status").header("X-Authenticated-Role", "SYSADMIN"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.counts.RULE").value(2))
                .andExpect(jsonPath("$.bodyCounts.RULE").value(1))
                .andExpect(jsonPath("$.oldVersionMaxIdleSeconds").value(600))
                .andExpect(jsonPath("$.versionedFeed").value(true));
    }

    @Test
    void 버전_경로_entry_는_본문_논리_키로_본문_값을_준다() throws Exception {
        Versioned v = versioned();
        v.service().lookupAt(MdmTargetType.CODE, List.of("PROC_CD"), clock.instant());

        v.mvc().perform(get("/api/mls/mdmMeta/entry").param("type", "CODE").param("key", "PROC_CD@1.000")
                        .header("X-Authenticated-Role", "SYSADMIN"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.part").value("BODY"))
                .andExpect(jsonPath("$.value.maruCodeId").value("PROC_CD"))
                .andExpect(jsonPath("$.value.categories[0].cateId").value("BASE"));
    }

    @Test
    void 버전_경로_load_는_정의_키면_목차와_최종_본문_본문_키면_그_본문만_다시_받는다() throws Exception {
        Versioned v = versioned();
        v.service().lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant());
        int tocs = v.feed().tocCalls.get();

        v.mvc().perform(post("/api/mls/mdmMeta/load").contentType(MediaType.APPLICATION_JSON).header("X-Authenticated-Role", "SYSADMIN")
                        .content("{\"type\":\"RULE\",\"keys\":[\"R@1.000\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.loaded[0]").value("R@1.000"));
        assertThat(v.feed().tocCalls.get()).isEqualTo(tocs);

        v.mvc().perform(post("/api/mls/mdmMeta/load").contentType(MediaType.APPLICATION_JSON).header("X-Authenticated-Role", "SYSADMIN")
                        .content("{\"type\":\"RULE\",\"keys\":[\"R\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.loaded[0]").value("R"));
        assertThat(v.feed().tocCalls.get()).isEqualTo(tocs + 1);
    }
```

이 클래스의 시계는 2026-10-02T00:00Z(KST 09:00)라 R 의 최종 버전은 2.000 이다. import 에 `java.time.LocalDateTime` 을 더한다. 기존 시험의 status 응답 단언에 새 칸이 있어도 깨지지 않는다(off 경로는 `bodyCounts` 가 모두 0, `versionedFeed` false).

`MdmAutoConfigurationTest` 에 더한다.

```java
    @Test
    void versioned_feed_기본은_버전_경로이고_off_면_지금_경로다() {
        runner.withPropertyValues(ON).run(ctx -> assertThat(ctx.getBean(MdmMetaService.class).versioned()).isTrue());
        runner.withPropertyValues(ON).withPropertyValues("cactus.mdm.versioned-feed=off").run(ctx ->
                assertThat(ctx.getBean(MdmMetaService.class).versioned()).isFalse());
    }
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :cactus-core:test --tests 'com.dongkuk.dmes.cactus.mdm.MdmMetaControllerTest' --tests 'com.dongkuk.dmes.cactus.mdm.MdmAutoConfigurationTest'`
Expected: 새 시험이 FAIL(칸 없음·`load` 가 `reload` 로 `IllegalStateException`·설정 없음).

- [ ] **Step 3: 설정과 자동 설정을 고친다**

`MdmClientProperties`:

```java
    /**
     * D-154 버전별 적재 — AUTO(기본): 버전 대상(룰·룰 세트·코드·전문)을 목차·본문으로 받는다(옛 MDM 이면 cactus 가 전 이력에서 만든다). OFF: part 를
     * 보내지 않고 지금처럼 전 이력 한 키로 돈다 — 배포 중 문제가 생기면 되돌리는 스위치이고 재기동해 반영한다. 모든 업무 모듈이 새 cactus 로 바뀐
     * 다음 릴리스에 지운다(결정 P12).
     */
    public enum VersionedFeed { AUTO, OFF }

    private VersionedFeed versionedFeed = VersionedFeed.AUTO;

    public VersionedFeed getVersionedFeed() { return versionedFeed; }
    public void setVersionedFeed(VersionedFeed v) { this.versionedFeed = v; }
```

`MdmAutoConfiguration.mdmMetaService` 를 아래로 바꾼다(빈 메서드 인자에 `MdmClientProperties props` 를 더한다).

```java
    @Bean
    @ConditionalOnMissingBean
    public MdmMetaService mdmMetaService(MdmMetaClient client, MdmMetaCache cache, MdmClientProperties props) {
        return new MdmMetaService(client, cache, Clock.systemUTC(), props.getVersionedFeed() != MdmClientProperties.VersionedFeed.OFF);
    }
```

- [ ] **Step 4: 컨트롤러를 고친다**

`status` 의 `out.put("maxIdleSeconds", …)` 아래에 더한다.

```java
        Map<String, Integer> bodyCounts = new LinkedHashMap<>();
        cache.bodySizes().forEach((t, n) -> bodyCounts.put(t.name(), n));
        out.put("bodyCounts", bodyCounts); // 버전 본문 수(D-154) — counts 는 목차 + 본문 합계
        out.put("oldVersionMaxIdleSeconds", cache.oldVersionMaxIdle().getSeconds()); // 옛·예약 버전 본문 유휴 수명
        out.put("versionedFeed", service.versioned());
```

`entryRow` 끝에 더한다.

```java
        row.put("part", v.part().name());     // VALUE·TOC·BODY(D-154)
        row.put("ver", v.ver());              // 본문만
        row.put("current", v.current());      // 본문만 — 최종 버전이면 true
```

`load` 의 `MdmMetaService.MdmLookup r = service.reload(type.get(), keys);` 와 그 뒤 세 줄을 아래로 바꾼다.

```java
        Map<String, Object> out = new LinkedHashMap<>();
        if (MdmVersions.isVersioned(type.get())) {
            // 정의 키 X: 묶음째 지우고 목차 + 지금 시각 본문, 본문 키 X@ver: 그 본문만(스펙 §7.1)
            MdmMetaService.MdmAtLookup r = service.reloadAt(type.get(), keys, clock.instant());
            out.put("loaded", new ArrayList<>(r.found().keySet()));
            out.put("missing", r.missing());
            out.put("unavailable", r.unavailable());
        } else {
            MdmMetaService.MdmLookup r = service.reload(type.get(), keys);
            out.put("loaded", new ArrayList<>(r.found().keySet()));
            out.put("missing", r.missing());
            out.put("unavailable", r.unavailable());
        }
        return ResponseEntity.ok(out);
```

`entry` 는 `cache.peek(t.get(), k)` 가 논리 키를 받으므로 고칠 것이 없다. Javadoc 에 "버전 대상의 key 는 논리 키(`X`·`X@1.000`)" 를 더한다.

- [ ] **Step 5: 시험을 돌린다**

Run:
- `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :cactus-core:test --tests 'com.dongkuk.dmes.cactus.mdm.*'`
- `cd src/backend/mls && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mls.lsh.noticeMgmt.NoticeMgmtMdmRealValidatorTest'`
- `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mdm.feed.*'`

Expected: 모두 PASS.

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmClientProperties.java src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmAutoConfiguration.java src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmMetaController.java src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmMetaControllerTest.java src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmAutoConfigurationTest.java
/usr/bin/git commit -m "feat(cactus): MDM 메타 관리 엔드포인트에 구분·논리 키·본문 수를 싣고 versioned-feed 설정으로 버전 경로를 켠다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: MDM 계약 시험 — 실제 HTTP 로 새 경로(목차·본문)를 끝까지 잇는다

스펙 §6.2「MDM 피드」「cactus 판정」을 실제 HTTP 로 확인한다(Review Focus 1·3 의 끝단). MDM 원장에서 직접 판정한 결과와, 실제 `MdmMetaClient` → `metaFeed/view?part=TOC|BODY` → 버전 서비스로 판정한 결과가 같아야 한다. 버전 자리수가 섞인 원장(1.000 INTEGER, 1.001 REAL, 2.000 INTEGER)에서 본문 키가 한 벌로만 생기고 두 번째 판정은 HTTP 를 다시 부르지 않아야 한다. 목차가 낡았을 때(원장에서 버전 확정 취소)는 NOT_RELEASED → 목차 재수신으로 새 원장 판정을 따라야 한다.

**Files:**
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/feed/MdmMetaFeedContractHttpTest.java`

**Interfaces:**
- Consumes: Task 5~7 피드, Task 9 클라이언트, Task 11·13 서비스·조회기.
- Produces: 없음.

- [ ] **Step 1: 시험을 더한다**

필드 `MdmMetaClient client` 를 `setUp` 의 지역 변수에서 클래스 필드로 올린다(기존 시험은 그대로 쓴다). 아래 보조와 시험을 더한다.

```java
    /** 실제 클라이언트에 맡기고 목차·본문 HTTP 호출 수를 센다. */
    private static final class CountingFeed implements MdmMetaFeed {
        final MdmMetaClient delegate;
        final java.util.concurrent.atomic.AtomicInteger toc = new java.util.concurrent.atomic.AtomicInteger();
        final java.util.concurrent.atomic.AtomicInteger body = new java.util.concurrent.atomic.AtomicInteger();

        CountingFeed(MdmMetaClient delegate) {
            this.delegate = delegate;
        }

        @Override
        public MdmChanges changes(long since, int limit) {
            return delegate.changes(since, limit);
        }

        @Override
        public MdmFetchResult fetch(MdmTargetType type, java.util.Collection<String> keys) {
            return delegate.fetch(type, keys);
        }

        @Override
        public MdmTocResult fetchToc(MdmTargetType type, java.util.Collection<String> keys, LocalDateTime at) {
            toc.incrementAndGet();
            return delegate.fetchToc(type, keys, at);
        }

        @Override
        public MdmBodyResult fetchBodies(MdmTargetType type, java.util.Collection<MdmBodyKey> keys) {
            body.incrementAndGet();
            return delegate.fetchBodies(type, keys);
        }
    }

    /** CT2: RELEASED 1.000 [2026-01-01, 2026-07-01)·1.001 [2026-07-01, 2027-01-01)·2.000 [2027-01-01, 열린 끝). items A(1.000~), B(1.001~), C(2.000~). TABLE TB(1.001~): B·C. */
    private void seedMixedScaleCode() {
        MasterCodeSeeds seeds = new MasterCodeSeeds(jdbc);
        seeds.seedCode("CT2", "INUSE", "MDM");
        seeds.released("CT2", "1.000", "2026-01-01 00:00:00", "2026-07-01 00:00:00");
        seeds.released("CT2", "1.001", "2026-07-01 00:00:00", "2027-01-01 00:00:00");
        seeds.released("CT2", "2.000", "2027-01-01 00:00:00", MasterCodeSeeds.OPEN_END);
        seeds.seedItem("CT2", "A", "1.000", MasterCodeSeeds.OPEN, "에이", 1);
        seeds.seedItem("CT2", "B", "1.001", MasterCodeSeeds.OPEN, "비", 2);
        seeds.seedItem("CT2", "C", "2.000", MasterCodeSeeds.OPEN, "씨", 3);
        seeds.seedBase("CT2");
        seeds.seedCate("CT2", "TB", "1.001", MasterCodeSeeds.OPEN, "TABLE", null, null, "표");
        seeds.seedCateItem("CT2", "TB", "B", "1.001", MasterCodeSeeds.OPEN);
        seeds.seedCateItem("CT2", "TB", "C", "2.000", MasterCodeSeeds.OPEN);
    }

    @Test
    void 버전_경로_코드_판정은_자리수가_섞인_원장과_같고_본문_키는_한_벌이며_두_번째는_HTTP_를_부르지_않는다() {
        seedMixedScaleCode();
        CountingFeed feed = new CountingFeed(client);
        MdmMetaCache vcache = new MdmMetaCache(1000, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), Clock.systemUTC());
        vcache.clear(0);
        MdmMetaService vservice = new MdmMetaService(feed, vcache, Clock.systemUTC(), true);
        MdmDefinitionLookup vlookup = new MdmDefinitionLookup(vservice);
        DefaultCodeResolver viaHttp = new DefaultCodeResolver(vlookup, vlookup);
        DefaultCodeResolver ledgerResolver = new DefaultCodeResolver(
                id -> new MdmCodeLookup(ledger).code(id).map(CodeRowsProjection::releasedOnly), CodeEffLookup.NONE);
        List<LocalDateTime> times = List.of(LocalDateTime.of(2025, 6, 1, 0, 0), LocalDateTime.of(2026, 3, 1, 0, 0),
                LocalDateTime.of(2026, 8, 1, 0, 0), LocalDateTime.of(2027, 2, 1, 0, 0));
        for (int round = 0; round < 2; round++) {
            for (LocalDateTime t : times) {
                for (String cate : List.of("BASE", "TB")) {
                    assertEquals(ledgerResolver.codeList("CT2", cate, t), viaHttp.codeList("CT2", cate, t), cate + " " + t);
                    for (String code : List.of("A", "B", "C", "Z")) {
                        assertEquals(ledgerResolver.isMember("CT2", cate, code, t), viaHttp.isMember("CT2", cate, code, t), cate + "/" + code + " " + t);
                    }
                }
            }
            if (round == 0) {
                assertTrue(feed.toc.get() >= 1);
            }
        }
        int calls = feed.toc.get() + feed.body.get();
        for (LocalDateTime t : times) {
            viaHttp.isMember("CT2", "TB", "B", t);
        }
        assertEquals(calls, feed.toc.get() + feed.body.get(), "본문 키가 자리수로 갈리면 판정마다 다시 받는다");
        assertEquals(List.of("CT2", "CT2@1.000", "CT2@1.001", "CT2@2.000"),
                vcache.entries(MdmTargetType.CODE, "CT2").stream().map(MdmMetaCache.EntryView::key).toList());
    }

    @Test
    void 버전_경로_목차가_낡으면_NOT_RELEASED_로_목차를_다시_받아_새_원장을_따른다() {
        seedMixedScaleCode();
        CountingFeed feed = new CountingFeed(client);
        MdmMetaCache vcache = new MdmMetaCache(1000, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), Clock.systemUTC());
        vcache.clear(0);
        MdmMetaService vservice = new MdmMetaService(feed, vcache, Clock.systemUTC(), true);
        Instant at2027 = LocalDateTime.of(2027, 2, 1, 0, 0).atZone(MdmDefinitionLookup.KST).toInstant();
        vservice.lookupAt(MdmTargetType.CODE, List.of("CT2"), LocalDateTime.of(2026, 8, 1, 0, 0).atZone(MdmDefinitionLookup.KST).toInstant());
        jdbc.update("UPDATE TB_MDM_CODE_VER SET STATUS = 'CANCELLED' WHERE MARU_CODE_ID = 'CT2' AND VER = 2"); // 캐시의 목차에는 2.000 이 남아 있다
        int tocs = feed.toc.get();

        MdmMetaService.MdmAt r = vservice.oneAt(MdmTargetType.CODE, "CT2", at2027).orElseThrow();

        assertEquals("1.000", r.ver(), "2.000 이 취소돼 2027-02 는 최초 버전으로 소급한다(엔진 규칙)");
        assertEquals(tocs + 1, feed.toc.get(), "NOT_RELEASED → 묶음을 지우고 목차를 한 번 다시 받는다");
    }

    @Test
    void 버전_경로_룰_세트_전문_선택은_원장과_같다() {
        seedLayouts();
        CountingFeed feed = new CountingFeed(client);
        MdmMetaCache vcache = new MdmMetaCache(1000, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), Clock.systemUTC());
        vcache.clear(0);
        MdmDefinitionLookup vlookup = new MdmDefinitionLookup(new MdmMetaService(feed, vcache, Clock.systemUTC(), true));
        StoredDefinitionLookup stored = stored();
        for (LocalDateTime at : List.of(LocalDateTime.of(2026, 6, 30, 23, 59, 59), LocalDateTime.of(2026, 7, 1, 0, 0),
                LocalDateTime.of(2026, 12, 31, 23, 59, 59), LocalDateTime.of(2027, 1, 1, 0, 0))) {
            Instant ts = at.atZone(MdmDefinitionLookup.KST).toInstant();
            RuleDefinition rule = vlookup.rule(Q, ts).orElseThrow();
            assertEquals(stored.rule(Q, ts).orElseThrow().ver(), rule.ver(), "룰 " + at);
            assertEquals(3, rule.ver().scale(), "룰 ver 자리수 " + at);
            assertEquals(fingerprint(stored.rule(Q, ts).orElseThrow()), fingerprint(rule), "룰 " + at);
            assertEquals(stored.ruleSet("CT_SET", ts).orElseThrow(), vlookup.ruleSet("CT_SET", ts).orElseThrow(), "세트 " + at);
        }
        for (LocalDateTime at : List.of(LocalDateTime.of(2026, 3, 31, 23, 59, 59), LocalDateTime.of(2026, 4, 1, 0, 0),
                LocalDateTime.of(2026, 7, 1, 0, 0))) {
            Map<String, Object> snap = vlookup.layout("9801", at.atZone(MdmDefinitionLookup.KST).toInstant()).orElseThrow();
            assertEquals(composer.at(9801L, at).totalLength(), ((Number) snap.get("totalLength")).intValue(), "전문 " + at);
        }
        assertTrue(vlookup.rule(Q, LocalDateTime.of(2025, 12, 31, 23, 59, 59).atZone(MdmDefinitionLookup.KST).toInstant()).isEmpty());
    }
```

import: `com.dongkuk.dmes.cactus.mdm.MdmBodyKey`, `MdmBodyResult`, `MdmChanges`, `MdmFetchResult`, `MdmMetaFeed`, `MdmTocResult`. `TB_MDM_CODE_VER` 의 상태 칼럼 이름이 다르면 `MasterCodeSeeds.seedVer` 의 INSERT 가 정본이다.

- [ ] **Step 2: 시험을 돌린다**

Run: `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:test --tests 'com.dongkuk.dmes.mdm.feed.*'`
Expected: PASS. 실패하면 기대값이 아니라 피드(Task 5~7)·클라이언트(Task 9)·서비스(Task 11)의 해당 부분을 고친다. 본문 키 목록 단언이 `CT2@1` 같은 키로 깨지면 Review Focus 1 의 결함이다.

- [ ] **Step 3: 커밋**

```bash
/usr/bin/git add src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/feed/MdmMetaFeedContractHttpTest.java
/usr/bin/git commit -m "test(mdm): 실제 HTTP 로 메타 목차·버전 본문 경로가 원장 판정과 같은지 고정한다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: 화면 — 캐시 관리(m-mcm `csa/mdmCacheMng`)의 구분 열·논리 키·옛 버전 수명

스펙 §7.1. 항목 그리드에 "구분" 열(값 / 목차 / 본문(최종) / 본문(옛))을 더하고, 삭제·재등록은 본문 행에서 눌러도 정의 키(`X`)로 MDM `force` 를 기록한다(같은 정의의 여러 행은 하나로). 확인 대화 상자에 "이 정의의 목차와 모든 버전 본문"을 적는다. 옛 모듈(새 칸 없음)은 그 칸을 비운다. shared 컴포넌트의 props·동작은 바꾸지 않는다 — `AgDataGrid`·`GridColumn`·`GridBadge` 를 지금처럼 쓴다.

**Files:**
- Modify: `src/frontend/m-mcm/page-components/csa/mdmCacheMng/types.ts`
- Modify: `src/frontend/m-mcm/page-components/csa/mdmCacheMng/utils.ts`
- Modify: `src/frontend/m-mcm/page-components/csa/mdmCacheMng/api.ts`
- Modify: `src/frontend/m-mcm/page-components/csa/mdmCacheMng/page.tsx`
- Modify: `src/frontend/m-mcm/tests/csa/mdmCacheMng/utils.test.ts`
- Modify: `src/frontend/m-mcm/tests/csa/mdmCacheMng/api.test.ts`

**Interfaces:**
- Consumes: Task 17 의 status·entries·entry 응답 칸.
- Produces: `type EntryPart = "VALUE" | "TOC" | "BODY"`, `VERSIONED_TARGET_TYPES`, `CacheEntryRow.part/ver/current`, `CacheEntryDetail.part/ver/current`, `ModuleStatusRow.oldVersionMaxIdleSeconds`, `definitionKey(type, key)`, `entryKindLabel(part, current)`, `describeLifetime(maxIdle, maxAge, oldVersionMaxIdle?)`.

- [ ] **Step 0: 워크트리 프런트 준비(처음 한 번)**

Run: `cd src/frontend && pnpm install --frozen-lockfile && pnpm build:libs`
Expected: 성공. 메인 체크아웃에서는 하지 않는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`utils.test.ts` 에 더한다(import 에 `definitionKey`, `entryKindLabel` 을 더한다).

```ts
  it("definitionKey — 버전 대상의 본문 키는 마지막 @ + 소수 셋째 자리 숫자 앞이 정의 키다(서버와 같은 규칙)", () => {
    expect(definitionKey("CODE", "PROC_CD@1.000")).toBe("PROC_CD");
    expect(definitionKey("RULE", "A@B@2.010")).toBe("A@B");
    expect(definitionKey("LAYOUT", "42@1.000")).toBe("42");
    expect(definitionKey("CODE", "PROC_CD")).toBe("PROC_CD");
    expect(definitionKey("CODE", "X@1")).toBe("X@1");
    expect(definitionKey("COLUMN", "X@1.000")).toBe("X@1.000");
  });

  it("entryKindLabel — 값·목차·본문(최종)·본문(옛), 옛 모듈(구분 없음)은 빈 문자열", () => {
    expect(entryKindLabel("VALUE", null)).toBe("값");
    expect(entryKindLabel("TOC", null)).toBe("목차");
    expect(entryKindLabel("BODY", true)).toBe("본문(최종)");
    expect(entryKindLabel("BODY", false)).toBe("본문(옛)");
    expect(entryKindLabel(null, null)).toBe("");
  });

  it("describeLifetime — 옛 버전 본문 수명을 알면 덧붙인다", () => {
    expect(describeLifetime(3600, 86400, 600)).toBe(
      "마지막 조회 뒤 60분 동안 조회 없으면 만료, 조회될 때마다 연장(적재 뒤 최대 24시간). 옛 버전 본문은 10분",
    );
    expect(describeLifetime(3600, 86400, null)).toBe("마지막 조회 뒤 60분 동안 조회 없으면 만료, 조회될 때마다 연장(적재 뒤 최대 24시간)");
  });
```

`api.test.ts` 에 더한다.

```ts
  it("항목 — 구분·ver·최종 여부를 싣고 옛 모듈 응답이면 null 이다", async () => {
    getJson.mockResolvedValueOnce({
      total: 3,
      page: 0,
      size: 200,
      items: [
        { type: "CODE", key: "PROC_CD", absent: false, loadedAt: "2026-10-02T00:00:00Z", hits: 1, remainingSeconds: 10, part: "TOC", ver: null, current: null },
        { type: "CODE", key: "PROC_CD@1.000", absent: false, loadedAt: "2026-10-02T00:00:00Z", hits: 1, remainingSeconds: 10, part: "BODY", ver: "1.000", current: true },
        { type: "COLUMN", key: "TITLE", absent: false, loadedAt: "2026-10-02T00:00:00Z", hits: 1, remainingSeconds: 10 },
      ],
    });
    const page = await api.fetchEntries("mls", emptyFilters());
    expect(page.items.map((r) => [r.part, r.ver, r.current])).toEqual([
      ["TOC", null, null],
      ["BODY", "1.000", true],
      [null, null, null],
    ]);
  });

  it("삭제·재등록 묶음 — 본문 행은 정의 키로 바꾸고 같은 정의는 하나로 보낸다", () => {
    const base = { absent: false, loadedAt: "", lastAccessAt: "", hits: 0, remainingSeconds: 0, bytes: 1, ver: null, current: null };
    expect(
      api.groupByType([
        { ...base, rowId: "CODE:PROC_CD", type: "CODE", key: "PROC_CD", part: "TOC" },
        { ...base, rowId: "CODE:PROC_CD@1.000", type: "CODE", key: "PROC_CD@1.000", part: "BODY", ver: "1.000", current: true },
        { ...base, rowId: "CODE:PROC_CD@0.900", type: "CODE", key: "PROC_CD@0.900", part: "BODY", ver: "0.900", current: false },
        { ...base, rowId: "COLUMN:TITLE", type: "COLUMN", key: "TITLE", part: "VALUE" },
      ]),
    ).toEqual([
      ["CODE", ["PROC_CD"]],
      ["COLUMN", ["TITLE"]],
    ]);
  });

  it("상태 — 옛 버전 본문 수명을 행에 싣고 옛 모듈이면 null 이다", async () => {
    getJson.mockImplementation(async (url: string) =>
      url.includes("/mls/") ? { ...status("mls", 9, 9), oldVersionMaxIdleSeconds: 600, bodyCounts: { CODE: 1 }, versionedFeed: true } : status(url.split("/")[2], 9, 9),
    );
    const { rows } = await api.fetchAllStatus(["mls", "mqc"]);
    expect(rows.find((r) => r.module === "mls")?.oldVersionMaxIdleSeconds).toBe(600);
    expect(rows.find((r) => r.module === "mqc")?.oldVersionMaxIdleSeconds).toBeNull();
  });
```

기존 시험 `키 입력은 쉼표·공백·줄바꿈으로 나누고, 강제 기록은 대상 종류별로 묶는다` 의 행 객체에 `part: null, ver: null, current: null` 을 더한다(타입이 넓어졌다). 기존 `status()` 보조의 반환에는 새 칸이 없다 — 옛 모듈 응답 역할을 한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `cd src/frontend/m-mcm && npx vitest run tests/csa/mdmCacheMng`
Expected: FAIL(함수·칸 없음).

- [ ] **Step 3: 타입을 넓힌다(`types.ts`)**

```ts
/** 버전이 있는 대상(D-154) — 항목이 목차·본문으로 나뉜다. 본문 키는 `정의키@1.000`. */
export const VERSIONED_TARGET_TYPES: readonly MdmTargetType[] = ["RULE", "RULE_SET", "CODE", "LAYOUT"];

/** 항목 구분(D-154) — VALUE 값 하나(컬럼·도메인, versioned-feed off), TOC 목차, BODY 버전 본문. */
export type EntryPart = "VALUE" | "TOC" | "BODY";
```

`ModuleStatus` 에 `bodyCounts?: Record<string, number>;`(버전 본문 수 — counts 는 목차 + 본문 합계), `oldVersionMaxIdleSeconds?: number;`(옛·예약 버전 본문 유휴 수명), `versionedFeed?: boolean;` 를, `ModuleStatusRow` 에 `oldVersionMaxIdleSeconds: number | null;` 를, `CacheEntryRow`·`CacheEntryDetail` 에 아래 세 칸을 더한다.

```ts
  /** 구분(D-154). 옛 모듈은 null. */
  part: EntryPart | null;
  /** 본문의 버전(scale 3 문자열). 목차·값은 null. */
  ver: string | null;
  /** 본문이 최종 버전인가. 목차·값·옛 모듈은 null. */
  current: boolean | null;
```

- [ ] **Step 4: 순수 함수(`utils.ts`)**

```ts
import { VERSIONED_TARGET_TYPES } from "./types";
import type { EntryPart, MdmTargetType } from "./types";

/** 서버 MdmVersions.parse 와 같은 규칙 — 마지막 `@` 뒤가 소수 셋째 자리 숫자일 때만 본문 키다. */
const LOGICAL_KEY = /^(.+)@(\d{1,4}\.\d{3})$/;

/** 논리 키 → 정의 키. 버전 대상의 본문 키(`X@1.000`)면 `X`, 그 밖은 그대로. 변경 기록·강제 기록은 정의 키 단위다(D-154 결정 P5). */
export function definitionKey(type: MdmTargetType, key: string): string {
  if (!VERSIONED_TARGET_TYPES.includes(type)) return key;
  const m = LOGICAL_KEY.exec(key);
  return m ? m[1] : key;
}

/** "구분" 열 문구. */
export function entryKindLabel(part: EntryPart | null, current: boolean | null): string {
  if (part === "VALUE") return "값";
  if (part === "TOC") return "목차";
  if (part === "BODY") return current ? "본문(최종)" : "본문(옛)";
  return "";
}
```

`describeLifetime` 에 셋째 인자를 더한다.

```ts
export function describeLifetime(
  maxIdleSeconds: number | null | undefined,
  maxAgeSeconds: number | null | undefined,
  oldVersionMaxIdleSeconds?: number | null,
): string {
  if (maxIdleSeconds == null || maxAgeSeconds == null) return "";
  const base = `마지막 조회 뒤 ${trimNumber(maxIdleSeconds / 60)}분 동안 조회 없으면 만료, 조회될 때마다 연장(적재 뒤 최대 ${trimNumber(maxAgeSeconds / 3600)}시간)`;
  return oldVersionMaxIdleSeconds == null ? base : `${base}. 옛 버전 본문은 ${trimNumber(oldVersionMaxIdleSeconds / 60)}분`;
}
```

파일 머리 주석에 "D-154 — 논리 키·구분 문구" 를 더한다.

- [ ] **Step 5: API(`api.ts`)**

`EntryPayload.items` 원소에 `part?: EntryPart; ver?: string | null; current?: boolean | null;` 를 더하고, `fetchEntries` 의 행 매핑에 아래를 더한다.

```ts
    part: e.part ?? null,
    ver: e.ver ?? null,
    current: typeof e.current === "boolean" ? e.current : null,
```

`fetchEntry` 의 상세 매핑에도 같은 세 칸을 더한다. `fetchAllStatus` 의 실패 행에 `oldVersionMaxIdleSeconds: null`, 성공 행에 `oldVersionMaxIdleSeconds: numberOrNull(v.oldVersionMaxIdleSeconds)` 를 더한다. `groupByType` 을 바꾼다.

```ts
/** 선택한 항목을 대상 종류별 정의 키로 묶는다 — 본문 행(`X@1.000`)도 정의 키 `X` 로 기록한다(변경 기록은 정의 키 단위, D-154). 같은 정의는 한 번만. */
export function groupByType(rows: CacheEntryRow[]): Array<[MdmTargetType, string[]]> {
  const map = new Map<MdmTargetType, string[]>();
  for (const r of rows) {
    const list = map.get(r.type) ?? [];
    const key = definitionKey(r.type, r.key);
    if (!list.includes(key)) list.push(key);
    map.set(r.type, list);
  }
  return Array.from(map.entries());
}
```

import: `definitionKey` from `./utils`, `EntryPart` type from `./types`.

- [ ] **Step 6: 화면(`page.tsx`)**

`entryColumns` 의 "키" 열 바로 뒤에 "구분" 열을 더한다.

```tsx
  {
    key: "part",
    header: "구분",
    width: 90,
    align: "center",
    headerTooltip: "목차 = 버전 목록, 본문(최종) = 지금 적용 중인 버전, 본문(옛) = 지난·예약 버전",
    render: (v, row) => entryKindLabel(v as EntryPart | null, row.current as boolean | null),
  },
```

`MODULE_COLUMNS` 의 "항목 수" 열에 `headerTooltip: "목차 + 본문 합계"` 를 더한다. `lifetimeHelpOf` 는 `describeLifetime(row?.maxIdleSeconds, row?.maxAgeSeconds, row?.oldVersionMaxIdleSeconds)` 로 부른다. `confirmForce` 의 문구를 아래로 바꾼다.

```tsx
  const confirmForce = (kind: ForceKind) => {
    const versioned = selectedEntries.some((r) => VERSIONED_TARGET_TYPES.includes(r.type));
    const scope = versioned ? " 룰·룰 세트·코드·전문은 이 정의의 목차와 모든 버전 본문이 함께 처리됩니다." : "";
    showMessage({
      title: "확인",
      message:
        kind === "EVICT"
          ? `선택한 ${selectedEntries.length}건을 모든 모듈 캐시에서 삭제하시겠습니까? 각 모듈이 다음 확인(약 10초) 때 지웁니다.${scope}`
          : `선택한 ${selectedEntries.length}건을 모든 모듈에서 다시 적재하시겠습니까? 각 모듈이 다음 확인(약 10초) 때 지우고 다시 받습니다.${scope}`,
      alertType: "confirm",
      onConfirm: () => void runForce(kind),
    });
  };
```

import: `entryKindLabel` from `./utils`, `VERSIONED_TARGET_TYPES`·`EntryPart` from `./types`. 상세 패널 요약에 구분이 있으면 "구분" 줄을 더한다(`entryKindLabel(detail.part, detail.current)`, 비면 줄을 그리지 않는다). 상세 패널 요약을 그리는 방식(라벨-값 짝)은 지금 코드를 따른다.

- [ ] **Step 7: 시험·타입·audit 를 돌린다**

Run:
- `cd src/frontend/m-mcm && npx vitest run tests/csa/mdmCacheMng && npx tsc --noEmit -p tsconfig.json`
- 저장소 루트에서 `python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mcm/page-components/csa/mdmCacheMng` 과 `python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/m-mcm/page-components/csa/mdmCacheMng`

Expected: vitest PASS, tsc 오류 0, audit 2종 0건. tsc 가 형제 패키지 dist 가 없다는 오류(약 21개)를 내면 Step 0 의 `pnpm build:libs` 를 다시 돌린다.

- [ ] **Step 8: 커밋**

```bash
/usr/bin/git add src/frontend/m-mcm/page-components/csa/mdmCacheMng src/frontend/m-mcm/tests/csa/mdmCacheMng
/usr/bin/git commit -m "feat(mcm): MDM 캐시 관리 화면에 목차·본문 구분 열을 두고 본문 행도 정의 키로 강제 기록한다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: 문서 — D-154, ADR-0007 개정 절, 현행 스펙 링크, 백엔드 가이드

스펙 §10·결정 P13. 코드는 바꾸지 않는다.

**Files:**
- Modify: `docs/mdm/decisions.md`(맨 끝에 D-154)
- Modify: `docs/mdm/adr/0007-mdm-meta-hybrid-cache-revision.md`(개정 절)
- Modify: `docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md`(§3.4·§4.1·§5.1·§5.2·§6 에 링크 한 줄씩)
- Modify: `docs/guide/BackEnd/Backend-Implementation-Guide.md`(§11 설정 블록·수명 설명)

**Interfaces:**
- Consumes: Task 1 실측 결과(커밋 메시지), Task 1~19 의 이름.
- Produces: 없음.

- [ ] **Step 1: 결정 번호와 시각을 확인한다**

Run: `grep -n "^## D-" docs/mdm/decisions.md | tail -3` 와 `date -u +%Y-%m-%dT%H:%M:%SZ`
Expected: 마지막 번호가 D-153 이면 D-154 를 쓴다. 다른 작업이 먼저 D-154 를 썼으면 다음 빈 번호를 쓰고, 이 계획·코드 주석의 "D-154" 를 그 번호로 바꾸는 커밋을 따로 만든다.

- [ ] **Step 2: D-154 를 쓴다**

`docs/mdm/decisions.md` 맨 끝에 D-152 와 같은 형식(Phase·Decision needed·Decision made·Rationale·Reversible·Source)으로 더한다. 담을 내용:
- **Phase**: build(MDM 메타 캐시 — 정의@버전 본문 + 목차 + 코드 색인).
- **Decision needed**: 업무 모듈 캐시가 정의의 RELEASED 전 이력을 키 하나에 담아 코드 1,000개·1,000버전에서 84.6 MB·isMember 2.8 ms(스펙 부록 A).
- **Decision made**: (1) 목차 키 `X` + 본문 키 `X@ver`(scale 3), 네 대상(코드·룰·룰 세트·전문) (2) 피드 `metaFeed/view` 의 `part=TOC|BODY`·`at`·`current`, `part` 없는 응답은 바이트 단위로 그대로(골든 시험) (3) 엔진 `CodeVersions.select` 공개·`CodeLookup.codeAt` default·`CodeVersionSlicer`(합성 cateItems 포함) (4) 코드 본문은 카테고리 소속을 MDM 이 미리 계산(`all`/`members`), cactus 는 해시 색인과 `CodeEffLookup` 으로 판정 — 목차가 있는 코드에 빈 값을 주지 않는 불변식 (5) 무효화는 기록기 그대로·정의 키 묶음 지움, 지움 기록은 정의 키 하나 (6) 수명: 목차·최종 본문 `max-idle`, 옛·예약 본문 `old-version-max-idle`(10분), 최종 판정은 묶음에 기억한 다음 경계까지 (7) 옛 MDM 신호 (가)·(나)와 물러남, `versioned-feed: auto|off`(결정 P12 로 다음 릴리스에 지움) (8) `MASTER_AT` base_dt 미리 받기(결정 P8), 장애 중 적용 경계 통과 후퇴는 받아들임(결정 P9). Task 1 실측 결과(모르는 params = 무시 또는 거부)를 한 줄로 적는다.
- **Rationale**: 스펙 §1.2 벤치(현재 버전 0.83 MB, 색인 6 ns), 판정 의미를 엔진 한 곳에.
- **Reversible**: yes(cactus `versioned-feed: off` + 재기동, MDM 은 `part` 없는 경로 그대로).
- **Source**: 스펙 `docs/superpowers/specs/2026-10-03-mdm-meta-cache-per-version-design.md`(결정 P1~P13), 계획 `docs/superpowers/plans/2026-10-03-mdm-meta-cache-per-version.md`, 시험 이름(`CodeVersionSlicerTest`·`MetaFeedLegacyGoldenTest`·`MetaFeedVersionedHttpTest`·`MdmMetaCacheVersionedTest`·`MdmMetaServiceVersionedTest`·`MdmVersionedEquivalenceTest`·`MdmMetaFeedContractHttpTest`).

- [ ] **Step 3: ADR-0007 개정 절을 더한다**

`adr-write` 스킬을 불러(Skill 도구 `adr-write`) 그 스킬의 개정 절차·린트를 따른다. 개정 절 내용: 날짜 2026-10-03(또는 머지 날짜), "캐시 값 모양을 정의 전 이력 한 키에서 목차 + 버전 본문으로 바꾼다(D-154). 하이브리드 배포·변경 기록 순번 무효화 구조는 그대로다(결정 P13)", 링크 두 개(스펙·D-154). ADR 본문(결정·결과)은 고치지 않는다.

- [ ] **Step 4: 현행 스펙과 가이드를 고친다**

현행 스펙 `2026-10-02-mdm-meta-cache-design.md` 의 다섯 곳에 한 줄씩 더한다: §3.4 피드 표 아래 "D-154(2026-10-03) — RULE·RULE_SET·CODE·LAYOUT 은 `part=TOC|BODY`·`at` 으로 목차와 버전 본문을 따로 준다. [버전별 적재 설계](2026-10-03-mdm-meta-cache-per-version-design.md) §4", §4.1 대상 표 아래 "D-154 — 네 대상의 캐시 값은 목차 키 + 버전 본문 키다(같은 문서 §3)", §5.1 설정 블록에 `old-version-max-idle: 10m`·`versioned-feed: auto` 두 줄과 주석, §5.2 구성 요소 표 아래 "D-154 — `MdmMetaService.lookupAt`·묶음 캐시·`MdmCodeVersion` 색인(같은 문서 §5)", §6 화면 아래 "D-154 — 항목 그리드 '구분' 열, 본문 행 삭제·재등록은 정의 키로(같은 문서 §7.1)".

`Backend-Implementation-Guide.md` §11 의 설정 예(`max-idle: 60m` 줄 아래)에 두 줄을 더한다.

```yaml
      old-version-max-idle: 10m  # 옛·예약 버전 본문 유휴 수명(D-154). 목차·최종 본문은 max-idle
      versioned-feed: auto       # auto(기본) | off — off 면 전 이력 한 키(배포 중 되돌리기, 재기동해 반영)
```

수명 설명 줄(`- 수명: …`) 뒤에 "- 버전 대상(룰·룰 세트·코드·전문)은 목차(`X`)와 버전 본문(`X@1.000`)으로 캐시한다. 지금 적용 중인 버전 본문은 `max-idle`, 지난·예약 버전 본문은 `old-version-max-idle` 이다. 캐시 관리 화면의 '구분' 열로 본다(D-154)." 를 더한다.

- [ ] **Step 5: 링크와 문서 린트를 확인한다**

Run: `grep -n "2026-10-03-mdm-meta-cache-per-version" docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md docs/mdm/decisions.md docs/mdm/adr/0007-mdm-meta-hybrid-cache-revision.md`
Expected: 세 파일 모두 한 줄 이상. `adr-write` 스킬의 린트가 오류 0.

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add docs/mdm/decisions.md docs/mdm/adr/0007-mdm-meta-hybrid-cache-revision.md docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md docs/guide/BackEnd/Backend-Implementation-Guide.md
/usr/bin/git commit -m "docs(mdm): 메타 캐시 버전별 적재 결정(D-154)과 ADR-0007 개정 절, 현행 스펙·가이드 링크를 남긴다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## 이 계획 밖으로 남긴 것

- **통합 수동 E2E**(스펙 §9 마지막 줄 — 로컬 mdm + mls, 코드 새 버전 확정 → 10초 안에 최종 본문 바뀜, 예약 버전 도래, 화면 재등록): 서버 기동·재기동은 작업자 권한 밖이다(Global Constraints). dev 머지 뒤 조정 세션·사용자가 서버를 재기동하고 ego-browser 로 확인한다. 끝나면 브라우저 작업 공간을 닫는다.
- 스펙 §11 범위 밖 항목(CodeReferenceCheck 소급 결함, SQL 버전 거르기, ns 급 엔진 확장, 예약 버전 미리 받기)은 다루지 않는다.
- 물러남 경로·`versioned-feed: off` 삭제(결정 P12)는 모든 업무 모듈이 새 cactus 로 바뀐 다음 릴리스의 일이다.
