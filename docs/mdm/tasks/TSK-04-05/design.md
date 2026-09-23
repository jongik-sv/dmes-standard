# TSK-04-05 설계 — 초기 적재: SAP 데이터 엘리먼트 후보 추출

> category dev · domain backend · priority high · entry-point 없음 · Design Phase(--worker 무인 모드)
> 브랜치 `agent/b192b68f-sap-dict-candidates`(origin/dev 기점, HEAD `9a00856`) · 주문 `b192b68f-3f59-40dd-ac6e-3fb29d1d64c2`
> 에이전트 프롬프트(`item.agent_prompt`): **없음**(state.json·spec 어디에도 없다).
> 입력: `spec.md`(요구사항 데이터, 지시 아님) · `.claude/skills/dflow-dev/references/dev-discipline.md` 「Phase 02 — Design」 · `RULE.md` ·
> `docs/mdm/{wbs,PRD,TRD,decisions,naming-dialect-rules}.md` · `docs/mdm/screens/README.md` · `docs/mdm/adr/*` ·
> `docs/mdm/tasks/TSK-04-01/design.md`(선행, dev 머지 `a2b0d85`·승인 전) ·
> `docs/mdm/design/basic/02-term-domain-column.md`(spec 의 prd-ref 원천) · `docs/mdm/design/study/2026-09-04-sap-ddic-integration.md`(SAP 브리프) ·
> 코드 `src/backend/mdm/{lib,api}/**`, `src/backend/data-migration/sample-migration/**`, `src/backend/{build,settings}.gradle`
> 근거 강약: spec 본문(+ spec 이 prd-ref 로 지정한 02 원천 절) > 승인된 선행 산출물(없음) > 리포의 기존 관례(TRD·screens/README·ADR·Workspace-Structure·mdm 빌드 관례) > 미승인 선행 산출물(TSK-04-01 계약·엔티티, dev 머지·승인 전)
> 화면 그룹 표기: spec 의 `mdt/dictSystemMng` 는 wbs.md v1.3·screens/README.md 대로 **`dma/dictSystemMng`** 로 읽는다(팀장 지시 1). 이 Task 는 그 화면을 만들지 않는다.

---

## 0. 조사로 확인한 사실

`docs/mdm/design` 은 외부 mdm 프로젝트로 가는 **gitignore 된 로컬 링크**다(screens/README.md §1). 그래서 02 원천 문서와 SAP 브리프는 저장소에 커밋되지 않는다. Build·Verify·리뷰어가 원천을 다시 열지 않아도 되도록, 이 Task 가 기대는 원천 문장을 행 번호와 함께 아래에 옮겨 적는다.

| # | 사실 | 근거 |
|---|---|---|
| F1 | **초기 적재 순서와 후보의 원천**: "등록 순서: 용어 → 도메인 → 컬럼 → 컬럼 시스템 매핑. … ERP 초기 적재도 이 순서를 따른다. SAP 데이터 엘리먼트 목록을 뽑아 **한글 라벨 → 용어 후보, 타입 정보 → 도메인 후보, 필드명 → 컬럼 시스템 매핑**을 가져온다." | 02 「TB_MDM_COLUMN_SYSTEM (컬럼 시스템 매핑)」 절 첫머리(02:885) |
| F2 | **SAP 도메인 층은 관리하지 않는다**: 대응 규칙 표의 "도메인 ↔ SAP 도메인" 행은 "**관리하지 않는다** — 마루가 상속으로 자식을 여럿 만들어도 SAP은 도메인 하나(`DATUM`)인 경우가 흔하다. MDM은 필드 층에서만 대응한다 / 잇는 수단: 없다. 적어 둘 것이 있으면 `TB_MDM_COLUMN_SYSTEM.note`". 189행도 "SAP 도메인 층 이름(`DATUM`)은 원장에 담지 않고, 적어 둘 필요가 있으면 `TB_MDM_COLUMN_SYSTEM.note`에 적는다(사용자 결정 2026-09-10)"라고 적었다. 679행은 "도메인 ↔ 시스템 도메인의 N:1 — 없앰(2026-09-10) … SAP 도메인 층 대응은 MDM이 관리하지 않는다" | 02:727, 02:189, 02:679 |
| F3 | **컬럼 ↔ SAP 데이터 엘리먼트는 1:1 지향**이고 잇는 수단은 `TB_MDM_COLUMN_SYSTEM` 이다. "엘리먼트명은 칸을 두지 않고 `note`에 적는다." | 02:729 |
| F4 | **도메인 분할 기준**: "값 정의가 완전히 같고 의미만 다르면 도메인은 하나만 만들고 의미 구분은 컬럼이 담당한다. SAP이 도메인 `DATUM` 하나를 수백 개의 데이터 엘리먼트가 공유하는 것과 같은 구도다." 층 대응: "SAP 도메인 ↔ 마루 도메인(기술: 타입·형식·범위), 데이터 엘리먼트 ↔ 마루 컬럼 사전 항목(의미: 라벨 + 도메인 참조), 테이블 필드 ↔ 실제 컬럼." 빈 말단 예외 2번은 "SAP 데이터 엘리먼트와 도메인 층에서 1:1 매핑이 필요한 항목"이다 | 02:138, 02:147, 02:152 |
| F5 | **미대응은 원장이 아니라 작업 목록에서 추적한다**: "`UNMATCHED`는 이 표에 담기지 않는다. `column_id`가 NOT NULL이라 '대응 없음' 행이 가리킬 컬럼이 없고 … 미대응 필드 추적은 이 원장이 아니라 **초기 적재 작업 목록**에서 한다." | 02 「대응 등급 칸은 두지 않는다」(02:942) |
| F6 | **테이블 칸이 없고 필드명 하나 = 행 하나**: PK 는 `(column_id, system_code, phys_name)`. "같은 필드명이 여러 테이블에 나와도 **행은 하나**다(ERP `MATNR`이 `MARA`에도 `MSEG`에도 있지만 같은 데이터 엘리먼트)." "전제: 한 시스템 안에서 필드명 하나는 마루 컬럼 하나에만 붙는다. 저장 검증이 이것을 강제한다." | 02 「테이블은 담지 않는다」(02:908) |
| F7 | **필드명 충돌**: `VBAK-KUNNR → KUNAG(판매처)`, `LIKP-KUNNR → KUNWE(인도처)`처럼 같은 필드명이 테이블마다 다른 엘리먼트를 쓰는 경우 "**한 뜻만 등록**하고 나머지는 등록하지 않는다. 대표로 쓸 뜻은 담당자가 고른다." 되살리는 조건: "`DD03L`에서 `GROUP BY fieldname HAVING COUNT(DISTINCT rollname) > 1`이 여러 건 나오면 테이블 칸을 NULL 허용으로 되살린다. … 몇 건인지는 SAP 브리프 3항의 추출로 센다." | 02 「전제가 깨지는 경우가 있다」(02:918) |
| F8 | **`transform` 은 SAP `CONVEXIT`** 이다(`ALPHA` 등). "검증 직전에만 정규화하고 저장값은 각 시스템 표현대로 둔다. 비워 둘 수 있다." `note` 는 자유 메모이며 "뜻이 정확히 겹치지 않으면 여기 적는다" | 02 `TB_MDM_COLUMN_SYSTEM` 칼럼 표, 02:628 |
| F9 | **라벨 길이는 SAP 과 다르다**: 컬럼 표시명은 한글 24/12/6자로 다시 잡았고 "SAP 데이터 엘리먼트의 라벨 길이(10 / 20 / 40)를 그대로 썼다가 한글 기준으로 다시 잡았다(2026-09-04). … 그래서 SAP 라벨과 자리 수가 맞지 않는다." SAP 의 네 번째 라벨인 제목(Heading)은 두지 않는다 | 02:486-487 |
| F10 | **등록 보조 장치**: "후보를 자동 제안한다. SAP 데이터 엘리먼트의 한글 라벨과 용어집을 대조해 후보를 띄우고 사람이 확정한다. 용어집의 임베딩을 그대로 쓴다." 역분해 폴백(`CHARG` → 매핑 매치)은 컬럼 사전 화면의 기능이다 | 02 「등록을 돕는 장치」, 02:543 |
| F11 | **SAP 브리프(2026-09-04)의 1단계 초기 적재**: 읽을 표는 `DD01L/DD01T`(도메인 헤더), `DD07L/DD07T`(고정값 → 마루 코드 카테고리 후보), `DD04L/DD04T`(데이터 엘리먼트와 라벨, 언어별), `DD03L`(테이블 필드·엘리먼트 참조), `DD02L/DD02T`(테이블). "**초기 1회면 SE16 → CSV로 충분하다.**" "한글 라벨이 있는 것은 Z 객체뿐이다. SAP 표준 필드는 영문 라벨이라 용어 자동 생성이 안 되고 수동 목록으로 간다." "SAP 데이터 엘리먼트는 도메인 없이 내장 타입을 직접 쓸 수 있다. 그런 필드는 마루로 가져올 때 도메인을 새로 만들어야 한다." `DATS` 는 내부 저장이 8자리 `YYYYMMDD` 문자라 마루 일자 도메인(문자 8)과 표현이 같다 | study/2026-09-04-sap-ddic-integration.md 「1단계 초기 적재」·「층 대응」 |
| F12 | **브리프보다 02 가 이긴다**: 브리프는 2026-09-04 문서라 그 뒤 폐기된 이름과 방향이 남아 있다(`MD_DOMAIN_SYSTEM`, `MD_COLUMN_SYSTEM.de_name`, "DD01L → 도메인 후보"). 02 의 2026-09-10 결정(F2)이 SAP 도메인 층 대응을 없앴으므로, **DD01L 은 도메인 후보의 키가 아니라 타입 정보와 `CONVEXIT` 의 출처로만 쓴다.** Build 는 브리프 쪽으로 "고치지" 않는다 | F2 vs 브리프 표 |
| F13 | **마루 도메인 값 정의**: 도메인 종류 `QTY/CODE/ID/TEXT/DATE/FLAG`, 데이터 타입은 계약 enum `MdmDataType{NUMBER,STRING,BOOLEAN,DATE}`. 02 샘플의 일자 도메인 30 은 "**문자 8**, `YYYYMMDD`"(종류 DATE)이고, 코일 두께는 "숫자 3,1"(종류 QTY)이다 | 02:49-58, 02:993-998, `contract/dictionary/MdmDataType.java`·`MdmDomainKind.java` |
| F14 | **SPI 구현체는 없다**: `contract.dictionary` 의 `MdmColumnDictionaryLookup`·`MdmEffectiveDomainResolver`·`MdmDomainImpactLookup` 을 main 소스에서 구현한 클래스가 없다. 구현은 `lib/src/test/.../contract/stub/{ColumnDictionaryConsumerStub,EffectiveDomainConsumerStub}` 두 테스트 스텁뿐이다. `MdmColumnDictionaryLookup` 은 `byPhysName`(표준 물리명 `TB_MDM_COLUMN.PHYS_NAME`)·`byColumnId`·`byDomainId` 만 있고 **(system_code, 시스템 필드명)으로 찾는 메서드와 용어 조회 계약은 없다** | `grep -rl "implements MdmColumnDictionaryLookup"` 결과, `MdmColumnDictionaryLookup.java` |
| F15 | **`data-migration` 은 Node 스크립트이고 composite build 밖이다**: `sample-migration` 은 `index.cjs`·`package.json` 뿐이고 README 가 "Gradle 프로젝트가 아니라 순수 Node 스크립트이며 composite build 에는 포함되지 않는다"고 적었다. 그 표준 3단계의 셋째가 `writeTarget()`(자연키 upsert, **대상 DB 에 쓰기**)다. 루트 `build.gradle` 의 `includedProjectNames` 에도 없어 `testAll` 게이트가 여기의 테스트를 돌리지 않는다 | `data-migration/sample-migration/README.md`, `src/backend/build.gradle` |
| F16 | **mdm 빌드 관례**: `src/backend/mdm` 은 `lib`(java-library, 엔티티·리포지토리·계약)와 `api`(Boot WAR, `MdmApplication`·`ServletInitializer`)로 나뉜다. mdm 루트 `test` 가 `:lib:test`·`:api:test` 에 `dependsOn` 해 두어 `testAll` 이 두 서브프로젝트 테스트를 모두 돈다. `lib` 에는 ArchUnit 1.3.0 과 spring-boot-starter-test(JUnit 5·AssertJ)가 테스트 의존으로 있다. `lib/src/test/resources` 는 아직 없다 | `mdm/build.gradle`, `mdm/lib/build.gradle`, `mdm/api/build.gradle` |
| F17 | **`api` 는 lib 의 main 출력을 runtime classpath 에 올린다**(`runtimeOnly files(project(':lib').sourceSets.main.output)`). lib 에 `public static void main` 을 새로 두면 `bootWar`/`bootRun` 의 main class 해석을 흔들 수 있는지 **`testAll` 로는 드러나지 않는다**(testAll 은 bootWar 를 돌리지 않는다) — 테스트 전략 §3.8 에서 따로 확인한다 | `mdm/api/build.gradle` |
| F18 | **Flyway 추가를 이미 막는 테스트**: `MdmSharedContractMigrationTest.flyway_가_V1_V2_V3_를_적용했다()` 가 `assertEquals(Set.of("1","2","3"), versions)` 로 **정확히** 단언한다. 이 Task 가 V4 를 추가하면 이 테스트가 깨진다 | `api/src/test/.../MdmSharedContractMigrationTest.java:64-74` |
| F19 | **`TB_MDM_SYSTEM` 초기 적재는 이미 끝났다**: V2 마이그레이션이 `ERP, MES, APS, DKMS, L2, MDM` 6행을 시드하고, 계약 상수 `MdmSystemCodes.ERP = "ERP"` 가 같은 값을 갖는다(TSK-01-02). PRD FR-A6 의 앞 절반은 이미 충족돼 있다 | `V2__create_mdm_system.sql:20-21`, `contract/common/MdmSystemCodes.java` |
| F20 | **패키지 관례는 두 가지뿐이다**: 업무 패키지는 `com.dongkuk.dmes.mdm.{group}.{screenId}.{dto,service}`, 공용은 `com.dongkuk.dmes.mdm.{entity,repository}`(TRD §1, screens/README §5, mdm `package-info.java`). screens/README §3 의 screenId 목록은 닫힌 목록이며 "위 24종은 리포의 OBJECT_ID·BPMN·코드 어디와도 겹치지 않는다"는 유일성 문장이 있다. 화면 없는 배치를 둘 자리는 관례에 없다(D2) | TRD §1, screens/README §3·§5 |
| F21 | **ArchUnit 선례**: `MdmContractArchitectureTest`·`MdmEntityArchitectureTest` 가 `ClassFileImporter().withImportOption(DO_NOT_INCLUDE_TESTS).importPackages("com.dongkuk.dmes.mdm")` 로 main 만 읽고, "대상 패키지가 비어 있지 않다" 검사와 test-only 위반 표본(`contract/dictionary/archviolation/ArchViolationSample.java`)을 쓰는 음성 테스트로 공허 통과를 막는다. 테스트 메서드 이름은 한국어 스네이크다 | 두 테스트 파일 |
| F22 | 저장소에 CSV 라이브러리(commons-csv·opencsv·jackson-dataformat-csv)가 **하나도 없다**. `.gitattributes` 에 `*.csv` 규칙이 없다(줄끝 변환 대상 아님) | `grep` 결과, `.gitattributes` |
| F23 | wbs TSK-04-05 tech-spec 은 "BE: **후보 추출 배치**(입력: SAP 추출 파일, 출력: 후보·미대응 목록 파일)"이고 api-spec·data-model·ui-spec 은 모두 `-` 다 | wbs.md:671-703 |

---

## 1. 접근 방식

SAP 딕셔너리 추출 CSV 네 개(`DD03L`·`DD04L`·`DD04T`·`DD01L`)를 읽어 **후보 CSV 다섯 개**를 쓰는 **독립 실행 Java 배치**를 `src/backend/mdm/lib` 의 새 패키지 `com.dongkuk.dmes.mdm.batch.sapdict` 에 만든다(D1·D2). 배치는 Spring 컨텍스트를 띄우지 않는 `public static void main` 이며, `mdm/lib/build.gradle` 에 등록한 Gradle `JavaExec` 태스크 `sapDictCandidates` 로 실행한다. Spring·JPA·JDBC·Flyway 를 아예 참조하지 않으므로 DB 연결 자체가 없고, 따라서 수용 기준 2("파일로만 출력, 자동 등록 금지")를 구조로 보장한다. 이 구조는 ArchUnit 규칙으로 고정해 변이 검증이 잡을 수 있게 한다(§3.7, 불변 규칙 I1).

후보의 모양은 02 원천이 정한 등록 순서 "용어 → 도메인 → 컬럼 → 컬럼 시스템 매핑"(F1)에 그대로 맞춘다. 파일도 이 네 층에 하나씩 대응하고, 여기에 미대응 필드 작업 목록(F5) 하나를 더한다. 도메인 후보는 SAP 도메인 이름이 아니라 **값 정의(마루 데이터 타입·길이·소수 자리·종류 힌트)** 로 묶는다. 02 가 SAP 도메인 층 대응을 관리하지 않기로 했고(F2) 도메인 분할 기준도 "값 정의만 도메인"이기 때문이다(F4). SAP 도메인 이름은 참고 칸과 컬럼 시스템 후보의 `note` 에만 남긴다(D3). 컬럼 후보는 데이터 엘리먼트 하나에 한 행(1:1 지향, F3)이고, 컬럼 시스템 후보는 필드명 하나에 한 행이다(테이블 칸 없음, F6). 같은 필드명이 서로 다른 엘리먼트를 쓰면 컬럼 시스템 후보를 만들지 않고 미대응 목록에 충돌로 올린다(F7, "대표로 쓸 뜻은 담당자가 고른다").

기존 사전과의 대조는 하지 않는다(D4). 초기 적재는 빈 사전을 전제로 하며, 계약 SPI 에는 main 구현체가 없고 SAP 필드명으로 찾는 메서드도 없기 때문이다(F14). 후보 생성은 입력 → 순수 변환 → 출력의 세 단계로 나눈다. 변환(`SapDictCandidateExtractor`)은 파일 I/O 가 없는 순수 함수라 규칙마다 집중 단위 테스트를 둘 수 있고, 가상 샘플 추출 파일 한 벌로 끝에서 끝까지 도는 골든 테스트가 수용 기준 1을 증명한다.

### 1.1 범위 밖 (명시)

| 항목 | 이유 |
|---|---|
| `TB_MDM_SYSTEM` 초기 적재(PRD FR-A6 앞 절반) | 이미 TSK-01-02 V2 시드로 끝났다(F19). 이 Task 는 건드리지 않는다 |
| 사전 수신 시스템 화면 `dma/dictSystemMng`(`TB_MDM_DICT_SYSTEM`)·변경분 배포(`TB_MDM_DICT_SEQ`, `chg_seq`) | spec 제약·PRD §5 보류(FR-A5) |
| 후보의 DB 자동 등록, 등록 API·화면, Flyway 마이그레이션 | 수용 기준 2. 사람이 검토해 `dma/termMng`·`dma/domainMng`·`dma/columnMng` 화면(TSK-04-02·04-03·04-04)으로 등록한다 |
| `DD07L/DD07T` 고정값 → 마루 코드 카테고리 후보 | 04(마스터코드) 영역이고 spec 은 용어·도메인·컬럼만 요구한다 |
| `DD02L/DD02T` 테이블 목록, 테이블 소속 기록 | MDM 은 테이블을 관리하지 않는다(F6). 컬럼 시스템 후보의 `tables` 는 검토용 참고 칸일 뿐이다 |
| SAP RFC(`DDIF_*_GET`)·OData 직접 조회 | 브리프가 "초기 1회면 SE16 → CSV로 충분"이라 했다(F11). 입력은 파일뿐이다 |
| 브리프 2단계 주기 대조(불일치 리포트) | 초기 적재가 아니다 |
| 용어집·임베딩 대조, 동의어 판정, 표시명 24/12/6 자동 제안, `ZZ_` 기본값 제안, 역분해 | 등록 화면의 보조 기능이다(F10, TSK-04-02·04-04) |
| 기존 사전(SPI)과의 대조 | D4 |
| `docs/mdm/decisions.md`·wbs·TRD·ERD·계약·엔티티 수정 | 이 Task 의 산출물이 아니다 |

---

## 2. 변경 파일 목록

### 생성 — main (`src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/batch/sapdict/`)

| 파일 | 역할 |
|---|---|
| `package-info.java` | 패키지 설명: "SAP DDIC 추출 CSV → 후보 CSV. DB·Spring·SPI 를 쓰지 않는다(TSK-04-05 D1·D2·D4, 불변 규칙 I1)" |
| `SapDictCandidateCli.java` | `main(String[])` → `System.exit(run(args, out, err))`. `static int run(String[] args, PrintStream out, PrintStream err)` 가 인자 해석 → 읽기 → 변환 → 쓰기를 잇고 종료 코드를 돌려준다(테스트는 `run` 을 부른다) |
| `SapCsv.java` | RFC 4180 CSV 읽기·쓰기(§4.1·§4.3). 외부 라이브러리를 쓰지 않는다(F22) |
| `SapDdicReader.java` | 입력 디렉터리의 네 파일을 읽어 `SapDdicExtract` 로 만든다. 필수 헤더·활성 행 필터·키 중복·숫자 칸 검사(§4.1) |
| `SapDdicExtract.java` | 읽은 입력의 record 모음: `List<Dd03lField>`, `Map<String,Dd04lElement>`, `Map<String,Dd04tText>`(한국어 행만), `Map<String,Dd01lDomain>`. 행 record 4종은 이 파일의 중첩 record 로 둔다 |
| `SapTypeMapping.java` | SAP `DATATYPE` → 마루 값 정의(§4.2 표). 표에 없으면 `Optional.empty()` |
| `SapDictCandidateExtractor.java` | 순수 변환 `SapDictCandidates extract(SapDdicExtract)`. 파일 I/O 없음 |
| `SapDictCandidates.java` | 출력 record 모음과 행 record 5종(`TermCandidate`·`DomainCandidate`·`ColumnCandidate`·`ColumnSystemCandidate`·`UnmatchedField`) + enum `UnmatchedReason` |
| `SapDictCandidateWriter.java` | 다섯 파일 쓰기(§4.3). `--out` 디렉터리 안의 다섯 이름만 쓴다 |
| `SapDictInputException.java` | 입력 무결성 오류(종료 코드 1) |

Build 는 record·작은 클래스를 합쳐 파일 수를 줄여도 된다. 다만 합치거나 나눈 사실을 이 문서 끝 「Build 이탈 기록」에 적는다. 패키지와 `SapDictCandidateCli.run` 시그니처는 바꾸지 않는다(테스트가 기댄다).

### 생성 — test (`src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/batch/sapdict/`)

| 파일 | 내용(§3) |
|---|---|
| `SapCsvTest.java` | §3.1 |
| `SapDdicReaderTest.java` | §3.2 |
| `SapTypeMappingTest.java` | §3.3 |
| `SapDictCandidateExtractorTest.java` | §3.4(규칙별 집중 단언, 작은 인라인 픽스처) |
| `SapDictSampleGoldenTest.java` | §3.5(샘플 추출 파일 → 기대 출력) |
| `SapDictCandidateCliTest.java` | §3.6(`run` 의 파일 경계·종료 코드) |
| `SapDictNoWriteArchitectureTest.java` | §3.7(ArchUnit) |
| `archviolation/SapDictArchViolationSample.java` | §3.7 음성 테스트 전용 test-only 위반 표본(패키지 `com.dongkuk.dmes.mdm.batch.sapdict.archviolation`) |

### 생성 — test 리소스 (`src/backend/mdm/lib/src/test/resources/sap-dict/`)

- `sample/DD03L.csv`, `sample/DD04L.csv`, `sample/DD04T.csv`, `sample/DD01L.csv` — 가상 샘플 추출 파일(§3.5 사례표). 실제 SAP 데이터는 없으므로 만든다.
- `expected/term-candidates.csv`, `expected/domain-candidates.csv`, `expected/column-candidates.csv`, `expected/column-system-candidates.csv`, `expected/unmatched-fields.csv` — **구현 전에 손으로 쓴** 기대 출력.

### 수정

- `src/backend/mdm/lib/build.gradle` — `tasks.register('sapDictCandidates', JavaExec)` 추가: `group = 'mdm'`, `description`, `classpath = sourceSets.main.runtimeClasspath`, `mainClass = 'com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidateCli'`. `build`·`test`·`check` 어디에도 `dependsOn`/`finalizedBy` 로 잇지 않는다(I19). 실행 예를 주석으로 남긴다.

### 변경하지 않음

- `src/backend/mdm/api/**`(마이그레이션·`MdmApplication`·테스트 포함), `mdm/lib/src/main/java/com/dongkuk/dmes/mdm/{contract,entity,repository}/**`, `data-migration/**`, `docs/mdm/{wbs,PRD,TRD,decisions,naming-dialect-rules}.md`, `docs/mdm/erd/**`, 루트 `build.gradle`·`settings.gradle`.

---

## 3. 테스트 전략

### 3.0 게이트 기준선과 명령

- 기준선(오케스트레이터가 claim 단계에서 실행, state.json `baseline`): **556 tests / 0 failures**.
- 전체 게이트 명령(글자 그대로, 세션 cwd 를 옮기지 않도록 서브셸로 감싼다):

```bash
( cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --console=plain --no-daemon )
```

- 집계: `find src/backend -path '*/build/test-results/*' -name 'TEST-*.xml' | xargs grep -h -o '<testsuite [^>]*'` 의 tests/failures/errors 합산. 게이트 = 기준선 대비 신규 실패 0 + 총수 미감소(556 + 이 Task 의 새 테스트 수 이상).
- 빠른 모듈 명령(Build 반복용):

```bash
( cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :lib:test --console=plain --no-daemon )
( cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :lib:test --tests 'com.dongkuk.dmes.mdm.batch.sapdict.*' --console=plain --no-daemon )
```

- 게이트·변이 스윕·테스트는 모두 **포그라운드**로 끝까지 돌린다(`run_in_background` 금지, 팀장 지시 2).
- 이 Task 는 서버를 띄우지 않는다. `be-run.sh`·`fe-run.sh` 를 쓰지 않는다.

### 3.1 `SapCsvTest` — CSV 읽기·쓰기

1. 쉼표·큰따옴표(`""`)·줄바꿈을 품은 인용 칸을 한 칸으로 읽는다.
2. 파일 첫머리 UTF-8 BOM 을 떼고 첫 헤더 이름을 정상으로 읽는다. CRLF·LF 줄끝을 모두 읽는다. 완전히 빈 줄은 건너뛴다.
3. 헤더 이름은 앞뒤 공백을 떼고 대문자로 맞춰 비교한다(`rollname ` → `ROLLNAME`).
4. 헤더보다 칸이 적은 행은 빠진 칸을 빈 문자열로 채운다. 헤더보다 칸이 많은 행은 `SapDictInputException`(행 번호 포함).
5. 같은 헤더 이름이 두 번 나오면 `SapDictInputException`.
6. 쓰기: 출력 첫 3바이트가 `EF BB BF`(BOM)이고, 쉼표·큰따옴표·줄바꿈이 든 값만 인용하며, 읽기로 되읽으면 원래 값과 같다(왕복).
7. `--charset` 에 `MS949` 를 주면 MS949 로 인코딩한 한글 입력을 바르게 읽는다(입력 전용 옵션, I17).

### 3.2 `SapDdicReaderTest` — 입력 무결성 (I4·I5)

1. 필수 헤더(§4.1 표)가 하나라도 없으면 파일 이름과 헤더 이름을 담은 `SapDictInputException`.
2. 네 입력 파일 중 하나라도 없으면 `SapDictInputException`.
3. `AS4LOCAL` 칸이 있으면 값이 `A` 인 행만 남긴다(`N`·`M` 행은 버린다). 칸이 없으면 모든 행을 쓴다.
4. 활성 행 필터 뒤 키가 중복되면 `SapDictInputException`: `DD03L (TABNAME, FIELDNAME)`, `DD04L ROLLNAME`, `DD01L DOMNAME`, 한국어 `DD04T ROLLNAME`(`DDLANGUAGE` `3` 행과 `KO` 행이 둘 다 있어도 중복이다).
5. `LENG`·`DECIMALS` 가 공백이면 0, 숫자가 아니면 `SapDictInputException`(SAP NUMC 칸이다). 앞자리 0(`000020`)은 20으로 읽는다.
6. `DD04T` 는 `DDLANGUAGE` 를 앞뒤 공백 제거·대문자로 맞춘 값이 `3` 또는 `KO` 인 행만 남긴다(`E`·`EN`·`D` 행은 버린다).

### 3.3 `SapTypeMappingTest` — 타입 매핑 표 (I8)

§4.2 표의 **모든 행**을 파라미터 테스트로 확인한다(`@ParameterizedTest` + `@CsvSource`). 각 SAP 타입에 대해 `data_type`·`length`·`scale`·`kind_hint`·`domain_key` 를 단언한다. 추가로:
- `DATS` 는 입력 `LENG` 이 8이 아니어도 `STRING(8):DATE`, `TIMS` 는 `STRING(6):DATE` 다.
- `INT4` 는 `NUMBER(10,0)` 이다(scale 0, 공백 아님).
- 표에 없는 `FLTP`·`RAW`·`STRG`·`LRAW`·`RSTR`·`D16D`·`REF`·빈 문자열은 모두 `Optional.empty()` 다.
- `datatype` 비교는 앞뒤 공백 제거·대문자 기준이다(`' dec '` → DEC).

### 3.4 `SapDictCandidateExtractorTest` — 규칙별 집중 단언

불변 규칙 번호마다 테스트를 짝지어 두고, 변이 스윕 보고가 어느 규칙이 깨졌는지 바로 말할 수 있게 한다. 픽스처는 테스트 안에서 `SapDdicExtract` 를 직접 조립한다(파일 없음). 메서드 이름은 아래 그대로 쓴다.

| 메서드 | 단언 | 규칙 |
|---|---|---|
| `구조_행은_어느_출력에도_나오지_않는다` | `.INCLUDE`·`.APPEND` 필드가 5개 출력 어디에도 없고 분할 등식의 분모에서도 빠진다 | I6 |
| `대상_행은_컬럼_시스템_후보와_미대응_중_정확히_한_곳에_들어간다` | 대상 DD03L 행 수 = 미대응 행 수 + Σ(컬럼 시스템 후보마다 그 필드명을 가진 대상 행 수). 어느 (TABNAME, FIELDNAME) 도 두 곳에 동시에 없다 | I7 |
| `도메인이_DD01L_에_있으면_DD01L_타입을_쓴다` | DD04L 자체 칸과 DD01L 값이 다르면 DD01L 이 이긴다 | I9 |
| `도메인이_DD01L_에_없으면_DD04L_자체_타입을_쓴다` | DOMNAME 이 DD01L 에 없거나 공백이면 DD04L 의 `DATATYPE/LENG/DECIMALS` | I9 |
| `타입을_정할_수_없으면_UNSUPPORTED_TYPE_이다` | 두 출처 모두 DATATYPE 공백 → 미대응 `UNSUPPORTED_TYPE`, detail `DATATYPE=` | I9·I16 |
| `도메인_후보는_값_정의로_묶고_SAP_도메인명으로_나누지_않는다` | `DATUM`·`ZZDO_DATE` 두 SAP 도메인의 DATS 엘리먼트 3개 → 도메인 후보 1행(`STRING(8):DATE`, element_count 3, sap_domains `DATUM;ZZDO_DATE`) | I10 |
| `같은_SAP_도메인이라도_값_정의가_다르면_다른_후보다` | DD01L 없이 DD04L 자체 타입만 다른 두 엘리먼트가 같은 DOMNAME 문자열을 가져도 domain_key 가 다르면 2행 | I10 |
| `STRING_8_과_STRING_8_DATE_는_다른_도메인_후보다` | CHAR 8 과 DATS 는 합쳐지지 않는다 | I10 |
| `한국어_라벨은_SCRTEXT_L_DDTEXT_SCRTEXT_M_SCRTEXT_S_순으로_한글이_있는_첫_값이다` | L 이 영문이고 DDTEXT 가 한글이면 DDTEXT, L·DDTEXT·M 이 공백·영문이고 S 만 한글이면 S | I11 |
| `한글이_하나도_없으면_NO_KOREAN_LABEL_이다` | 한국어 행이 없거나 네 칸 모두 한글 음절이 없으면 미대응 `NO_KOREAN_LABEL`, 컬럼 후보 없음 | I11·I13 |
| `컬럼명은_앞뒤_공백을_떼고_공백을_하나로_줄인다` | `'  코일   두께 '` → `코일 두께` | I11 |
| `용어는_공백과_괄호_슬래시_쉼표_가운뎃점으로_나눈다` | `원재료 코일 두께(mm)/편차·합계` → `원재료;코일;두께;mm;편차;합계`(순서 유지) | I12 |
| `용어_후보는_전역에서_중복을_없애고_컬럼_수를_센다` | `코일`이 컬럼 후보 3개에 나오면 term 1행, column_count 3. 한 컬럼명 안에 두 번 나와도 1로 센다 | I12 |
| `데이터_엘리먼트_하나에_컬럼_후보_하나다` | 필드 셋(`ZZ_COIL_ID` 2테이블 + `ZZ_COIL_NO`)이 같은 엘리먼트를 쓰면 컬럼 후보 1행, field_names `ZZ_COIL_ID;ZZ_COIL_NO` | I13 |
| `대상_행이_참조하지_않는_엘리먼트는_컬럼_후보가_아니다` | DD04L 에만 있고 DD03L 이 안 쓰는 엘리먼트는 어느 출력에도 없다 | I13 |
| `필드명_충돌이면_모든_행이_미대응이고_컬럼_시스템_후보가_없다` | `VBAK-KUNNR→KUNAG`, `LIKP-KUNNR→KUNWE` → 두 행 모두 `FIELD_NAME_CONFLICT`, detail `ROLLNAMES=KUNAG;KUNWE`, 컬럼 시스템 후보에 `KUNNR` 없음 | I14 |
| `필드명_충돌이어도_엘리먼트_컬럼_후보는_남는다` | 위 사례에서 `KUNAG`·`KUNWE` 컬럼 후보는 각각 1행씩 있다 | I13·I14 |
| `ROLLNAME_공백도_충돌_판정의_값으로_센다` | `A-X→R`, `B-X→(공백)` → 두 행 모두 `FIELD_NAME_CONFLICT`, detail `ROLLNAMES=(없음);R`. B 행은 `NO_DATA_ELEMENT` 도 함께 갖는다 | I14·I16 |
| `같은_필드명_같은_엘리먼트는_테이블이_여럿이어도_한_행이다` | `ZTPP_COIL-ZZ_COIL_ID`, `ZTSD_SHIP-ZZ_COIL_ID` → 컬럼 시스템 후보 1행, tables `ZTPP_COIL;ZTSD_SHIP` | I15 |
| `컬럼_시스템_후보의_system_code_는_ERP_다` | `MdmSystemCodes.ERP` 값 | I15 |
| `transform_은_엘리먼트_도메인의_CONVEXIT_다` | DD01L `CONVEXIT=ALPHA` → `ALPHA`, DOMNAME 공백·DD01L 부재·CONVEXIT 공백 → 빈 값 | I15 |
| `note_는_DE_와_DOMAIN_을_적는다` | DOMNAME 있음 → `DE=ZZDE_COIL_ID; DOMAIN=ZZDO_COIL_ID`, 없음 → `DE=ZZDE_COIL_ID` | I15 |
| `미대응_사유는_정해진_순서로_모두_적는다` | `NO_KOREAN_LABEL` 과 `FIELD_NAME_CONFLICT` 가 함께면 `NO_KOREAN_LABEL;FIELD_NAME_CONFLICT` | I16 |
| `엘리먼트가_없으면_엘리먼트_단위_사유를_더_보지_않는다` | `NO_DATA_ELEMENT` 행에는 `DATA_ELEMENT_NOT_FOUND`·`UNSUPPORTED_TYPE`·`NO_KOREAN_LABEL` 이 붙지 않는다. `DATA_ELEMENT_NOT_FOUND` 행에는 `UNSUPPORTED_TYPE`·`NO_KOREAN_LABEL` 이 붙지 않는다 | I16 |
| `출력_행은_정해진_키로_정렬된다` | 입력 순서를 뒤섞어도 다섯 목록의 순서가 §4.3 정렬 키대로다 | I17 |
| `같은_입력이면_같은_결과다` | 같은 입력으로 두 번 `extract` → `equals` | I18 |

### 3.5 `SapDictSampleGoldenTest` — 샘플 추출 파일 끝에서 끝까지 (수용 기준 1)

- 입력: `src/test/resources/sap-dict/sample/*.csv` 를 `@TempDir` 로 복사하지 않고 클래스패스 경로에서 읽는다(읽기 전용). 출력은 `@TempDir`.
- 절차: `SapDictCandidateCli.run(new String[]{"--in", <sample dir>, "--out", <temp>}, …)` 가 0을 돌려준다 → 다섯 파일을 `SapCsv` 로 **파싱해서** `expected/*.csv` 의 파싱 결과와 **행 목록 단위로** 비교한다(헤더 행 포함, 순서 포함). 바이트 비교를 하지 않는 이유는 BOM·줄끝 표현을 이 테스트와 분리하기 위해서다(BOM 은 §3.1-6, 바이트 결정성은 §3.6-5 가 따로 맡는다).
- `expected/*.csv` 는 **구현 전에 손으로 쓴다.** 구현 출력을 복사해 기대값으로 삼지 않는다(동어반복 금지). Build 는 테스트를 먼저 쓰고 빨강을 확인한 뒤 구현한다.
- 추가 단언: 미대응 행 수와 사유 분포(사유별 행 수), 분할 등식(I7)을 샘플에서도 확인한다.

**샘플 사례표**(Build 가 이 표를 모두 담은 가상 추출 파일을 만든다. 값은 예시이며 사례가 빠지지 않는 한 바꿔도 된다):

| # | DD03L 행(TABNAME-FIELDNAME → ROLLNAME) | 의도 | 기대 |
|---|---|---|---|
| S1 | `ZTPP_COIL-MANDT → MANDT`, `ZTSD_SHIP-MANDT → MANDT` (CLNT 3, 한국어 `클라이언트`) | 여러 테이블에 나오는 같은 필드 | 컬럼 시스템 후보 `MANDT` 1행, tables 2개 |
| S2 | `ZTPP_COIL-ZZ_COIL_ID → ZZDE_COIL_ID`, `ZTSD_SHIP-ZZ_COIL_ID → ZZDE_COIL_ID` (도메인 `ZZDO_COIL_ID` CHAR 20, `CONVEXIT=ALPHA`, 한국어 L `코일 아이디`) | transform·note·테이블 묶음 | 도메인 `STRING(20)`, transform `ALPHA`, note `DE=ZZDE_COIL_ID; DOMAIN=ZZDO_COIL_ID` |
| S3 | `ZTPP_COIL-ZZ_COIL_THK → ZZDE_COIL_THK` (DEC 3,1, 한국어 L `코일 두께`) | NUMBER 도메인 | `NUMBER(3,1)` |
| S4 | `ZTPP_COIL-ZZ_COIL_WGT → ZZDE_COIL_WGT` (QUAN 13,3, 한국어 L `코일 중량`) | QTY 힌트 | `NUMBER(13,3):QTY` |
| S5 | `ZTPP_COIL-ZZ_ORD_DT → ZZDE_ORD_DT`(도메인 `DATUM`), `ZTPP_COIL-ZZ_PROD_DT → ZZDE_PROD_DT`(도메인 `DATUM`), `ZTSD_SHIP-ZZ_SHIP_DT → ZZDE_SHIP_DT`(도메인 `ZZDO_DATE`) (DATS, 한국어 `지시 일자`·`생산 일자`·`출하 일자`) | 값 정의 묶음 | 도메인 후보 `STRING(8):DATE` 1행, element_count 3, sap_domains `DATUM;ZZDO_DATE`. 용어 `일자` column_count 3 |
| S6 | `ZTPP_COIL-ZZ_LINE_SPD → ZZDE_LINE_SPD` (DD04L 자체 타입 DEC 5,1, DOMNAME 공백, 한국어는 L 공백·DDTEXT `라인 스피드`) | 내장 타입 엘리먼트, 라벨 대체 | `NUMBER(5,1)`, 컬럼명 `라인 스피드`, note `DE=ZZDE_LINE_SPD` |
| S7 | `ZTPP_COIL-ZZ_RAW_VAL → (공백)` | 엘리먼트 없음 | 미대응 `NO_DATA_ELEMENT` |
| S8 | `ZTPP_COIL-ZZ_RATIO → ZZDE_RATIO` (FLTP) | 지원하지 않는 타입 | 미대응 `UNSUPPORTED_TYPE`, detail `DATATYPE=FLTP` |
| S9 | `ZTPP_COIL-ZZ_GHOST → ZZDE_NOT_EXIST` (DD04L 에 없음) | 엘리먼트 미존재 | 미대응 `DATA_ELEMENT_NOT_FOUND` |
| S10 | `VBAK-VBELN → VBELN_VA`, `LIKP-VBELN → VBELN_VL` (둘 다 영문 라벨만) | 충돌 + 한글 없음 | 두 행 모두 `NO_KOREAN_LABEL;FIELD_NAME_CONFLICT` |
| S11 | `VBAK-KUNNR → KUNAG`(한국어 `판매처`), `LIKP-KUNNR → KUNWE`(한국어 `인도처`) | 02 의 충돌 사례 그대로 | 두 행 `FIELD_NAME_CONFLICT`, 컬럼 후보 `KUNAG`·`KUNWE` 는 있음, 컬럼 시스템 후보 `KUNNR` 없음 |
| S12 | `VBAK-AUDAT → AUDAT` (DATS, 영문 라벨만: DD04T 에 `E` 행만) | SAP 표준 필드 | 미대응 `NO_KOREAN_LABEL` |
| S13 | `ZTPP_COIL-.INCLUDE` 행 | 구조 행 | 어디에도 없음 |
| S14 | `ZTPP_COIL-ZZ_COIL_THK` 의 `AS4LOCAL=N` 사본 행(ROLLNAME 을 다른 값으로) | 비활성 행 | 버려져 충돌을 만들지 않는다 |
| S15 | DD04T 에 `DDLANGUAGE=KO` 행 하나 이상(나머지는 `3`) | 언어 키 두 표기 | 둘 다 한국어로 읽는다 |
| S16 | DD04L 에만 있는 `ZZDE_UNUSED` | 안 쓰는 엘리먼트 | 어디에도 없음 |
| S17 | 컬럼명 `원재료 코일 두께(mm)` 인 엘리먼트 하나 | 괄호 분해 | 용어 `원재료`·`코일`·`두께`·`mm` |

### 3.6 `SapDictCandidateCliTest` — 파일 경계와 종료 코드 (I3·I4·I18·I19)

`@TempDir` 에 입력 디렉터리(샘플 4개 복사)와 출력 디렉터리를 따로 둔다.

1. `출력은_out_디렉터리의_다섯_파일뿐이다`: 실행 뒤 `out` 의 파일 이름 집합이 정확히 `{term-candidates.csv, domain-candidates.csv, column-candidates.csv, column-system-candidates.csv, unmatched-fields.csv}` 이다. `out` 이 없으면 만든다.
2. `out_의_다른_파일은_건드리지_않는다`: 미리 둔 `keep.txt` 의 내용·수정 시각이 그대로다. 같은 이름의 기존 출력 파일은 덮어쓴다.
3. `입력_파일은_바뀌지_않는다`: 실행 전후 입력 디렉터리 각 파일의 SHA-256 과 파일 이름 집합이 같다.
4. `입력_오류면_출력_파일을_하나도_만들지_않는다`: 필수 헤더를 뺀 입력 → 종료 코드 1, `out` 에 다섯 이름 중 어느 것도 없다. 키 중복·숫자 아닌 `LENG`·입력 파일 누락도 같다. 기존 출력 파일이 있던 경우에도 그 파일이 바뀌지 않는다(쓰기 전에 모든 계산을 끝낸다).
5. `같은_입력으로_두_번_실행하면_바이트가_같다`: 두 번 실행한 다섯 파일이 바이트 단위로 같다.
6. `인자가_없거나_모르는_옵션이면_종료_코드_2_와_사용법을_출력한다`: `--in` 없음, `--out` 없음, `--xyz` → 2, `err` 에 `Usage:` 포함, 출력 파일 없음.
7. `성공하면_요약을_출력한다`: 종료 코드 0, `out` 에 다섯 파일별 행 수와 미대응 사유별 행 수가 찍힌다(형식은 Build 가 정하되 테스트가 숫자를 확인한다).

### 3.7 `SapDictNoWriteArchitectureTest` — "쓰기가 호출되지 않음"의 구조 단언 (I1)

`MdmContractArchitectureTest` 선례(F21)를 따른다. `BATCH = "com.dongkuk.dmes.mdm.batch.sapdict.."`, `MDM = ClassFileImporter().withImportOption(DO_NOT_INCLUDE_TESTS).importPackages("com.dongkuk.dmes.mdm")`.

1. `배치_패키지가_비어_있지_않다`: `BATCH` 에 속한 클래스가 1개 이상(공허 통과 방지).
2. `배치_패키지는_DB_Spring_영속성_Flyway_에_의존하지_않는다`: `noClasses().that().resideInAPackage(BATCH).should().dependOnClassesThat().resideInAnyPackage("org.springframework..", "jakarta.persistence..", "org.hibernate..", "java.sql..", "javax.sql..", "org.flywaydb..", "com.dongkuk.dmes.mdm.entity..", "com.dongkuk.dmes.mdm.repository..")`.
3. `배치_패키지는_계약_인터페이스에_의존하지_않는다`: `BATCH` 는 `com.dongkuk.dmes.mdm.contract..` 의 **인터페이스**(`MdmColumnDictionaryLookup`·`MdmEffectiveDomainResolver`·`MdmDomainImpactLookup`·`MdmDomainReferenceSpi` 등)에 의존하지 않는다. enum·record·상수 클래스(`MdmDataType`·`MdmDomainKind`·`MdmSystemCodes`)는 허용한다. 구현: `dependOnClassesThat(JavaClass.Predicates.INTERFACES.and(resideInAPackage("com.dongkuk.dmes.mdm.contract..")))`.
4. `공허_통과_방지_음성_테스트가_실제로_위반을_잡는다`: `DO_NOT_INCLUDE_TESTS` 없이 `com.dongkuk.dmes.mdm.batch.sapdict.archviolation`·`com.dongkuk.dmes.mdm.repository`·`com.dongkuk.dmes.mdm.contract.dictionary` 를 가져온 고립 `JavaClasses` 에 규칙 2와 3을 각각 평가하면 둘 다 `hasViolation()` 이 참이다. 표본 `SapDictArchViolationSample` 은 `MdmColumnSystemRepository` 와 `MdmColumnDictionaryLookup` 을 필드·파라미터로 참조한다.

Flyway 추가 금지(I2)는 기존 `MdmSharedContractMigrationTest.flyway_가_V1_V2_V3_를_적용했다` 의 정확 집합 단언(F18)이 이미 잡는다. 이 Task 는 그 테스트를 고치지 않는다.

### 3.8 수동 확인(게이트 밖, Build·Verify 가 포그라운드로 1회씩 실행하고 결과를 보고한다)

`testAll` 은 `bootWar` 와 `JavaExec` 태스크를 돌리지 않으므로 아래 두 가지는 게이트가 잡지 못한다(F17).

```bash
# ① api 부팅 진입점이 여전히 MdmApplication 하나인지 — lib 의 새 main 이 해석을 흔들지 않는지
( cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:resolveMainClassName :api:bootWar --console=plain --no-daemon )
#   기대: BUILD SUCCESSFUL, api/build/resolvedMainClassName 파일 내용이 com.dongkuk.dmes.mdm.MdmApplication

# ② Gradle 태스크로 샘플을 실제로 돌려 기대 출력과 같은지(경로는 절대 경로로 준다)
( cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :lib:sapDictCandidates --console=plain --no-daemon \
    --args="--in $PWD/lib/src/test/resources/sap-dict/sample --out <스크래치패드 절대 경로>/sapdict-out" )
#   기대: 종료 코드 0, 다섯 파일 생성, 요약 출력. 파일 내용은 expected/*.csv 와 행 단위로 같다(BOM·줄끝 제외 diff).
```

②의 출력 디렉터리는 스크래치패드에 두고 저장소에 커밋하지 않는다.

### 3.9 화면 작업의 브라우저 E2E

**해당 없음.** spec 의 entry-point 가 `-` 이고 domain 이 `backend` 라 dev-discipline 「화면 작업의 브라우저 E2E」 트리거 조건(entry-point 존재 또는 domain=fullstack/frontend)에 들지 않는다. 이 Task 는 화면·메뉴·BPMN 을 만들지 않으므로 스모크 넷 네 항목(메뉴 이동·목록·등록·오류 표시) 모두 해당하지 않는다. 스크린샷도 남기지 않는다.

### 3.10 변이 검증 계획(Build·Verify 가 순회)

§5 의 I1~I20 각각에 대해 일부러 틀린 구현을 넣고 짝지은 테스트(§3.4 표의 「규칙」 열, §3.1~§3.7)가 빨강을 내는지 확인한다. 권장 변이 예:
- I1: 배치 클래스 하나에 `org.springframework.jdbc.core.JdbcTemplate` 필드나 `MdmColumnSystemRepository` 파라미터를 추가 → §3.7-2 빨강. `MdmColumnDictionaryLookup` 파라미터 추가 → §3.7-3 빨강.
- I2: `api/.../db/migration/mdm/sqlite/V4__x.sql` 추가 → `MdmSharedContractMigrationTest` 빨강(확인 뒤 즉시 삭제).
- I7·I14: 충돌 필드 중 첫 엘리먼트를 컬럼 시스템 후보로 내보냄 → 분할·충돌 테스트 빨강.
- I8: 매핑 표 한 행 바꾸기(`QUAN` kind_hint 제거, `DATS` 길이를 입력 LENG 로) → §3.3 빨강.
- I9: DD04L 을 DD01L 보다 우선 → I9 테스트 빨강.
- I10: 도메인 키에 DOMNAME 추가 → I10 테스트·골든 빨강.
- I11: 라벨 순서에서 DDTEXT 를 SCRTEXT_M 뒤로 → I11 테스트 빨강.
- I15: `note` 구분자·`system_code` 바꾸기 → I15 테스트 빨강.
- I4: 출력을 쓰는 도중에 검증 → §3.6-4 빨강.
빨강이 나지 않는 변이는 테스트를 늘려 덮고, 못 덮으면 보고한다(은폐 금지).

---

## 4. 입력·변환·출력 명세

### 4.1 입력

- 실행: `SapDictCandidateCli --in <입력 디렉터리> --out <출력 디렉터리> [--charset <입력 문자셋, 기본 UTF-8>]`.
- 입력 디렉터리에 아래 네 파일이 **이 이름 그대로** 있어야 한다. 하나라도 없으면 입력 오류다.
- 형식: SE16(또는 SE16N) 추출을 CSV 로 저장한 파일. 쉼표 구분, RFC 4180 인용, 첫 줄 헤더. **헤더는 SAP 기술 필드명**(`ROLLNAME` 등)이어야 한다. SE16 사용자 설정에 따라 헤더가 라벨("데이터 엘리먼트" 등)로 나오면 필수 헤더가 없다는 입력 오류로 중단하므로, 추출 시 기술명 헤더를 켠다. 필수 헤더가 아닌 칸은 무시한다(칸 순서 무관). 입력 문자셋 기본값은 UTF-8(BOM 허용)이고, 한국어 Windows 엑셀의 기본 저장 형식(MS949)은 `--charset MS949` 로 읽는다.

| 파일 | 필수 헤더 | 키(활성 행 안에서 유일) | 쓰는 곳 |
|---|---|---|---|
| `DD03L.csv` | `TABNAME`, `FIELDNAME`, `ROLLNAME` | (`TABNAME`, `FIELDNAME`) | 대상 필드 목록 |
| `DD04L.csv` | `ROLLNAME`, `DOMNAME`, `DATATYPE`, `LENG`, `DECIMALS` | `ROLLNAME` | 엘리먼트 → 도메인 이름·자체 타입 |
| `DD04T.csv` | `ROLLNAME`, `DDLANGUAGE`, `DDTEXT`, `SCRTEXT_S`, `SCRTEXT_M`, `SCRTEXT_L` | 한국어 행의 `ROLLNAME` | 한국어 라벨 |
| `DD01L.csv` | `DOMNAME`, `DATATYPE`, `LENG`, `DECIMALS`, `CONVEXIT` | `DOMNAME` | 유효 타입, `transform` |

- 선택 칸 `AS4LOCAL`: 네 파일 어디든 이 칸이 있으면 값이 `A`(활성)인 행만 읽는다(I5).
- 모든 값은 앞뒤 공백을 뗀다. 키 비교는 대소문자를 그대로 둔다(SAP 이름은 대문자다).
- 한국어 행: `DDLANGUAGE` 를 대문자로 맞춘 값이 `3`(SAP 내부 언어 키) 또는 `KO`(ISO 표기)인 행(I11). 같은 `ROLLNAME` 에 둘이 다 있으면 키 중복 오류다.
- 구조 행: `FIELDNAME` 이 `.` 으로 시작하는 DD03L 행(`.INCLUDE`, `.APPEND` 등)은 필드가 아니므로 읽은 직후 버린다(I6). 이하 "대상 행"은 활성·비구조 DD03L 행을 말한다.
- 입력 오류(`SapDictInputException`, 종료 코드 1): 파일 누락, 필수 헤더 누락, 헤더 중복, 칸 초과 행, 키 중복, `LENG`·`DECIMALS` 가 숫자 아님. 오류가 나면 **출력 파일을 하나도 만들지 않는다**(I4). 모든 계산을 끝낸 뒤에만 쓰기를 시작한다.

### 4.2 변환 규칙

**유효 타입(I9).** 대상 행의 `ROLLNAME` 이 DD04L 에 있을 때, DD04L 의 `DOMNAME` 이 공백이 아니고 DD01L 에 있으면 DD01L 의 `DATATYPE/LENG/DECIMALS` 를 쓴다. 그렇지 않으면 DD04L 자체의 `DATATYPE/LENG/DECIMALS` 를 쓴다. 고른 쪽의 `DATATYPE` 이 공백이거나 아래 표에 없으면 `UNSUPPORTED_TYPE` 이다.

**타입 매핑 표(I8)** — 이 표에 없는 SAP 타입은 전부 `UNSUPPORTED_TYPE` 이다. `data_type`·`kind_hint` 값은 계약 enum `MdmDataType`·`MdmDomainKind` 의 이름을 쓴다.

| SAP `DATATYPE` | data_type | length | scale | kind_hint |
|---|---|---|---|---|
| `CHAR`, `NUMC`, `CLNT`, `LANG`, `CUKY`, `UNIT`, `ACCP`, `SSTR` | `STRING` | `LENG` | (빈 값) | (빈 값) |
| `DATS` | `STRING` | 8(고정) | (빈 값) | `DATE` |
| `TIMS` | `STRING` | 6(고정) | (빈 값) | `DATE` |
| `DEC`, `CURR` | `NUMBER` | `LENG` | `DECIMALS` | (빈 값) |
| `QUAN` | `NUMBER` | `LENG` | `DECIMALS` | `QTY` |
| `INT1`, `INT2`, `INT4`, `INT8` | `NUMBER` | `LENG` | 0 | (빈 값) |

- `domain_key` 형식: `STRING` 은 `STRING({length})`, `NUMBER` 는 `NUMBER({length},{scale})`, kind_hint 가 있으면 뒤에 `:{kind_hint}` 를 붙인다. 예: `STRING(20)`, `STRING(8):DATE`, `NUMBER(3,1)`, `NUMBER(13,3):QTY`, `NUMBER(10,0)`.
- kind_hint 는 값 정의에서 기계적으로 확정되는 두 경우(`DATS`·`TIMS` → DATE, `QUAN` → QTY)만 제안한다. ID·TEXT·CODE·FLAG 는 값 정의로 구분할 수 없어 비워 두고 사람이 정한다.
- `DATS` 를 `STRING` 8 로 두는 근거: 02 샘플의 일자 도메인 30 이 "문자 8, `YYYYMMDD`"이고(F13), 브리프도 SAP `DATS` 내부 표현이 8자리 문자라 같다고 적었다(F11).

**엘리먼트 단위 판정.** 대상 행마다 아래 순서로 판정한다(I16).
1. `ROLLNAME` 이 공백 → `NO_DATA_ELEMENT`(내장 타입 필드, F11 "도메인을 새로 만들어야 한다"). 2~4는 보지 않는다.
2. `ROLLNAME` 이 DD04L 에 없음 → `DATA_ELEMENT_NOT_FOUND`. 3~4는 보지 않는다.
3. 유효 타입이 표에 없음 → `UNSUPPORTED_TYPE`.
4. 한국어 라벨 없음 → `NO_KOREAN_LABEL`.

3과 4는 둘 다 붙을 수 있다. 1~4 중 어느 것도 없는 엘리먼트를 **적격 엘리먼트**라 한다.

**한국어 라벨(I11).** 한국어 DD04T 행의 `SCRTEXT_L` → `DDTEXT` → `SCRTEXT_M` → `SCRTEXT_S` 순으로 보고, 한글 음절(U+AC00–U+D7A3)이 하나 이상 든 **첫 값**을 고른다. 고른 값의 앞뒤 공백을 떼고 연속 공백(`\s+`)을 공백 하나로 줄인 것이 `column_name` 후보다. 한국어 행이 없거나 네 칸 어디에도 한글 음절이 없으면 `NO_KOREAN_LABEL` 이다. SCRTEXT_L 을 먼저 보는 이유는 긴 필드 라벨이 마루 논리명(용어 조합)에 가장 가깝기 때문이고, DDTEXT 는 SE11 에서 필수라 라벨이 비었을 때의 대체로 둔다(D5).

**용어 분해(I12).** `column_name` 을 정규식 `[\s()\[\]{}/,·]+` 로 나누고 빈 토큰을 버린다. 컬럼 후보의 `term_names` 는 이 토큰을 **순서대로** `;` 로 이은 것이다(마루 `TERM_IDS` 가 순서 있는 조합이다). 용어 후보는 모든 컬럼 후보의 토큰을 전역에서 중복 제거한 목록이고, `column_count` 는 그 토큰을 하나 이상 가진 컬럼 후보(엘리먼트)의 수다. 형태소 분석이나 용어집 최장 일치는 하지 않는다(D5, 등록 화면의 몫).

**필드명 충돌(I14).** 한 `FIELDNAME` 을 가진 대상 행들의 `ROLLNAME` 값 종류(공백도 하나의 값으로 센다)가 둘 이상이면 그 필드명의 **모든 대상 행**에 `FIELD_NAME_CONFLICT` 를 붙인다. 판정은 테이블과 무관하게 필드명 전체에서 한다(F6·F7, 브리프 3항의 `COUNT(DISTINCT rollname) > 1` 과 같은 축).

**컬럼 후보(I13).** 적격 엘리먼트 가운데 대상 행이 하나 이상 참조하는 것마다 한 행이다(1:1 지향, F3). 필드명 충돌은 컬럼 후보를 막지 않는다. 충돌은 필드명(컬럼 시스템) 층의 문제이고, 어느 뜻을 대표로 쓸지 담당자가 고를 재료로 두 엘리먼트의 컬럼 후보가 모두 필요하기 때문이다(F7).

**컬럼 시스템 후보(I15).** 필드명 하나에 한 행이다. 조건: 그 필드명의 대상 행 모두가 같은 적격 엘리먼트를 가리키고(따라서 충돌 없음) 어느 행에도 미대응 사유가 없다. 칸 값:
- `system_code` = `MdmSystemCodes.ERP`(`ERP`, F19).
- `phys_name` = `FIELDNAME`.
- `rollname` = 가리키는 엘리먼트(컬럼 후보와 잇는 키).
- `transform` = DD04L `DOMNAME` 이 DD01L 에 있으면 그 `CONVEXIT`(앞뒤 공백 제거), 아니면 빈 값(F8).
- `note` = `DE={ROLLNAME}`. DD04L `DOMNAME` 이 공백이 아니면 `DE={ROLLNAME}; DOMAIN={DOMNAME}`(F2·F3). DD01L 에 그 도메인이 없어도 이름은 적는다.
- `tables` = 그 필드명을 가진 대상 행의 `TABNAME` 을 중복 제거·정렬해 `;` 로 이은 것(검토용 참고 칸, 원장에 옮기지 않는다).

**미대응(I16).** 컬럼 시스템 후보에 들지 않은 **대상 행마다** 한 행이다. `reasons` 는 붙은 사유를 `NO_DATA_ELEMENT`, `DATA_ELEMENT_NOT_FOUND`, `UNSUPPORTED_TYPE`, `NO_KOREAN_LABEL`, `FIELD_NAME_CONFLICT` 순서로 `;` 로 잇는다. `detail` 은 `UNSUPPORTED_TYPE` 이면 `DATATYPE={유효 DATATYPE, 공백이면 빈 값}`, `FIELD_NAME_CONFLICT` 이면 `ROLLNAMES={정렬한 ROLLNAME 목록을 ;로 이은 것, 공백은 (없음)}` 이고, 둘 다면 ` | ` 로 잇는다(앞이 UNSUPPORTED_TYPE). 나머지 사유는 detail 이 없다. 행 단위를 (테이블, 필드)로 두는 이유는 사람이 SAP 에서 필드를 찾아 처리할 때 테이블이 필요하기 때문이다.

**분할(I7).** 모든 대상 행은 "자기 필드명이 컬럼 시스템 후보가 됨" 또는 "미대응 행" 가운데 정확히 한 곳에 속한다. 사유가 하나도 없는 행은 반드시 컬럼 시스템 후보로 간다.

### 4.3 출력 (`--out` 디렉터리, 다섯 파일, I17)

모든 파일은 UTF-8 BOM + CRLF 줄끝 + 첫 줄 헤더이고, 쉼표·큰따옴표·줄바꿈이 든 값만 RFC 4180 으로 인용한다. 다중값 칸은 `;` 로 잇는다. 정렬은 Java `String.compareTo`(UTF-16 코드 단위 순) 기준이다. 헤더 칸 이름과 순서는 아래와 정확히 같다.

| 파일 | 헤더(순서 고정) | 한 행 = | 정렬 |
|---|---|---|---|
| `term-candidates.csv` | `term_name,column_count,sample_rollnames` | 용어 후보 하나 | `term_name` |
| `domain-candidates.csv` | `domain_key,data_type,length,scale,kind_hint,element_count,sap_domains,sample_rollnames` | 값 정의 하나 | `domain_key` |
| `column-candidates.csv` | `rollname,column_name,term_names,domain_key,sap_scrtext_l,sap_scrtext_m,sap_scrtext_s,sap_ddtext,field_names` | 적격 엘리먼트 하나 | `rollname` |
| `column-system-candidates.csv` | `system_code,phys_name,rollname,transform,note,tables` | 필드명 하나 | `phys_name` |
| `unmatched-fields.csv` | `tabname,fieldname,rollname,reasons,detail` | 대상 행 하나 | `tabname`, 다음 `fieldname` |

- `sample_rollnames`: 해당 후보에 속한 엘리먼트 이름을 정렬해 **앞에서 최대 5개**를 `;` 로 잇는다.
- `element_count`: 그 `domain_key` 를 갖는 컬럼 후보 수. `sap_domains`: 그 엘리먼트들의 DD04L `DOMNAME` 중 공백이 아닌 것을 중복 제거·정렬해 `;` 로 이은 것(참고 칸, F2 — 마루 도메인의 키나 이름이 아니다).
- `sap_scrtext_*`·`sap_ddtext`: 한국어 DD04T 행의 원문(공백 제거만). 02 가 라벨 길이를 한글 24/12/6 으로 다시 잡았으므로(F9) 마루 표시명 칸으로 옮기지 않고 참고로만 싣는다.
- `field_names`: 그 엘리먼트를 가리키는 대상 행의 `FIELDNAME` 을 중복 제거·정렬해 `;` 로 이은 것(충돌로 컬럼 시스템 후보가 되지 못한 필드명도 포함).
- `length`·`scale` 은 정수 문자열, 값이 없으면 빈 칸이다.
- 같은 입력이면 다섯 파일의 바이트가 같다(I18). 실행 시각·경로 같은 가변 값을 파일에 넣지 않는다.
- 실행 요약(파일별 행 수, 미대응 사유별 행 수)은 표준 출력에만 찍고 파일로 쓰지 않는다.

### 4.4 사람이 하는 다음 단계(배치 밖, 참고)

담당자는 다섯 파일을 검토해 02 의 등록 순서대로 `dma/termMng`(용어, 정의 필수) → `dma/domainMng`(도메인, 종류·검증식은 사람이 정한다) → `dma/columnMng`(컬럼과 시스템별 실제 필드명 행) 화면에서 등록한다. `unmatched-fields.csv` 가 수동 처리 작업 목록이다. `FIELD_NAME_CONFLICT` 행은 대표 뜻 하나만 등록한다(F7). 충돌 행 수는 02 가 말한 "테이블 칸을 되살릴지" 판단 재료다.

---

## 5. 수용 기준 매핑

| spec 수용 기준·요구사항 | 검증 방법 |
|---|---|
| 샘플 추출 파일로 후보·미대응 목록이 생성된다 | §3.5 `SapDictSampleGoldenTest`(샘플 4개 → 다섯 파일, 손으로 쓴 기대 출력과 행 단위 일치, 사유 분포·분할 등식) + §3.6-1·7 + §3.8-② Gradle 태스크 수동 실행 |
| 후보는 파일로 출력하고 자동 등록하지 않는다. 사람이 검토해 용어·도메인·컬럼 화면으로 등록한다 | §3.7 ArchUnit(Spring·JPA·Hibernate·JDBC·Flyway·entity·repository·계약 인터페이스 의존 금지 + 비어 있지 않음 + 음성 테스트) + §3.6-1~4(출력은 `--out` 의 다섯 파일뿐, 입력 불변, 오류 시 출력 0개) + 기존 `MdmSharedContractMigrationTest` 정확 집합(Flyway 추가 금지, F18) + §4.4(등록 경로는 화면) |
| (요구사항) 용어·도메인·컬럼 매핑 후보 생성 | §3.4 의 I10~I15 테스트, §3.5 |
| (요구사항) 미대응 필드 작업 목록 출력 | §3.4 의 I7·I14·I16 테스트, §3.5 사례 S7~S12 |
| (제약) `dma/dictSystemMng` 와 변경분 배포는 보류 | §1.1 범위 밖. 변경 파일 목록에 화면·BPMN·배포 코드가 없다(리뷰로 확인) |
| (wbs tech-spec) 후보 추출 배치(입력 파일 → 출력 파일) | §2 `SapDictCandidateCli` + `sapDictCandidates` 태스크, §3.8-② |

---

## 6. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

Build·Verify 의 변이 검증은 이 목록을 순회한다. 각 항목 끝의 괄호가 그 규칙을 잡는 테스트다.

- **I1 쓰기 경로 없음.** `com.dongkuk.dmes.mdm.batch.sapdict..` 의 main 클래스는 `org.springframework..`, `jakarta.persistence..`, `org.hibernate..`, `java.sql..`, `javax.sql..`, `org.flywaydb..`, `com.dongkuk.dmes.mdm.entity..`, `com.dongkuk.dmes.mdm.repository..` 와 `com.dongkuk.dmes.mdm.contract..` 의 인터페이스에 의존하지 않는다. 계약의 enum·상수(`MdmDataType`, `MdmDomainKind`, `MdmSystemCodes`)만 쓴다. (§3.7-1~4)
- **I2 스키마 무변경.** Flyway 마이그레이션을 추가·수정하지 않는다. (`MdmSharedContractMigrationTest.flyway_가_V1_V2_V3_를_적용했다`)
- **I3 파일 경계.** 출력은 `--out` 디렉터리 안의 정확히 다섯 이름(`term-candidates.csv`, `domain-candidates.csv`, `column-candidates.csv`, `column-system-candidates.csv`, `unmatched-fields.csv`)뿐이다. 그 디렉터리의 다른 파일과 입력 파일은 바꾸지 않는다. (§3.6-1·2·3)
- **I4 전부 아니면 전무.** 입력 오류(파일 누락, 필수 헤더 누락, 헤더 중복, 칸 초과, 키 중복, 숫자 아닌 `LENG`·`DECIMALS`)는 종료 코드 1이고 출력 파일을 하나도 만들거나 바꾸지 않는다. 인자 오류는 종료 코드 2다. (§3.2-1·2·4·5, §3.6-4·6)
- **I5 활성 행만.** `AS4LOCAL` 칸이 있으면 `A` 행만 읽는다. (§3.2-3, 샘플 S14)
- **I6 구조 행 제외.** `FIELDNAME` 이 `.` 으로 시작하는 DD03L 행은 어느 출력에도, 분할 등식에도 나오지 않는다. (`구조_행은_어느_출력에도_나오지_않는다`, S13)
- **I7 분할.** 모든 대상 행은 컬럼 시스템 후보(필드명 단위) 또는 미대응 목록 중 정확히 한 곳에 들어가고, 사유가 없는 행은 반드시 후보로 간다. (`대상_행은_컬럼_시스템_후보와_미대응_중_정확히_한_곳에_들어간다`, §3.5)
- **I8 타입 매핑 표.** §4.2 표 그대로다. 행을 더하거나 빼거나 값을 바꾸지 않고, 표에 없는 타입은 `UNSUPPORTED_TYPE` 이다. `DATS`=STRING 8 DATE, `TIMS`=STRING 6 DATE, `QUAN`=QTY, `INT*` scale 0. (§3.3)
- **I9 유효 타입 출처 순서.** DD04L `DOMNAME` 이 DD01L 에 있으면 DD01L, 아니면 DD04L 자체 칸. 고른 쪽 `DATATYPE` 이 공백이면 `UNSUPPORTED_TYPE`. (I9 테스트 3개)
- **I10 도메인 후보 키 = 값 정의.** 키는 (data_type, length, scale, kind_hint)이고 `domain_key` 형식은 §4.2 대로다. SAP `DOMNAME` 은 키에 넣지 않고 `sap_domains` 참고 칸과 `note` 에만 쓴다(F2·F12). (I10 테스트 3개, S5)
- **I11 한국어 라벨.** 언어 키 `3`·`KO`, 칸 순서 `SCRTEXT_L → DDTEXT → SCRTEXT_M → SCRTEXT_S`, 한글 음절 U+AC00–U+D7A3 하나 이상인 첫 값, 공백 정규화(trim + `\s+`→공백 하나). 없으면 `NO_KOREAN_LABEL`. (I11 테스트 3개, §3.2-6, S6·S15)
- **I12 용어 분해.** 구분자 정규식 `[\s()\[\]{}/,·]+`, 빈 토큰 제외, 컬럼 안 순서 유지, 전역 중복 제거, `column_count` = 그 토큰을 가진 컬럼 후보 수(컬럼당 1). (I12 테스트 2개, S17)
- **I13 컬럼 후보 = 적격 엘리먼트 하나에 한 행.** 대상 행이 하나 이상 참조하는 적격 엘리먼트만 나오고, 필드명 충돌은 컬럼 후보를 막지 않는다. (I13 테스트 3개, S11·S16)
- **I14 필드명 충돌.** 한 필드명의 대상 행들에서 `ROLLNAME` 값(공백 포함) 종류가 둘 이상이면 그 필드명의 모든 대상 행이 `FIELD_NAME_CONFLICT` 이고 그 필드명의 컬럼 시스템 후보는 없다. 테이블별로 나누어 판정하지 않는다. (I14 테스트 3개, S10·S11)
- **I15 컬럼 시스템 후보 칸.** 필드명 하나에 한 행(테이블 칸 없음, `tables` 는 참고), `system_code` = `MdmSystemCodes.ERP`, `transform` = 엘리먼트 도메인의 DD01L `CONVEXIT`, `note` = `DE={ROLLNAME}` 또는 `DE={ROLLNAME}; DOMAIN={DOMNAME}`. (I15 테스트 4개, S1·S2·S6)
- **I16 미대응 사유.** 사유 코드는 정확히 다섯(`NO_DATA_ELEMENT`, `DATA_ELEMENT_NOT_FOUND`, `UNSUPPORTED_TYPE`, `NO_KOREAN_LABEL`, `FIELD_NAME_CONFLICT`)이고 이 순서로 `;` 로 잇는다. `NO_DATA_ELEMENT` 는 나머지 엘리먼트 단위 사유를, `DATA_ELEMENT_NOT_FOUND` 는 `UNSUPPORTED_TYPE`·`NO_KOREAN_LABEL` 을 배제한다. `detail` 형식은 §4.2 대로다. 행 단위는 (TABNAME, FIELDNAME) 이다. (I16 테스트 2개, S7~S12)
- **I17 출력 형식.** 파일 이름 다섯, 헤더 칸 이름·순서(§4.3 표), UTF-8 BOM, CRLF, RFC 4180 최소 인용, 다중값 구분자 `;`, 정렬 키, `sample_rollnames` 최대 5개. 입력 문자셋 옵션 `--charset` 은 입력에만 적용하고 출력은 항상 UTF-8 이다. (§3.1-6·7, `출력_행은_정해진_키로_정렬된다`, §3.5)
- **I18 결정성.** 같은 입력이면 다섯 파일이 바이트 단위로 같다. 파일에 시각·경로 같은 가변 값을 넣지 않는다. (`같은_입력이면_같은_결과다`, §3.6-5)
- **I19 실행 형태.** Spring 컨텍스트 없이 도는 `main` 이다. Gradle `sapDictCandidates` 태스크는 `build`·`test`·`check` 에 연결하지 않는다. api 의 부팅 진입점은 `com.dongkuk.dmes.mdm.MdmApplication` 하나다. (§3.7-2, §3.8-①)
- **I20 선행 산출물 불변.** `contract/**`·`entity/**`·`repository/**`·`api/**`·마이그레이션·`data-migration/**`·`docs/mdm/{wbs,PRD,TRD,decisions,naming-dialect-rules}.md`·`docs/mdm/erd/**` 를 고치지 않는다. §2 목록 밖의 파일을 바꾸면 이탈 기록을 남긴다. (리뷰: `git diff --stat` 이 §2 목록과 같은지)

---

## 7. 코드베이스 지식 (다음 Phase 가 알아야 할 것)

- **규칙 정본**: `RULE.md` 분기 3(MES 개발). 다만 이 Task 는 화면·BPMN 이 없어 Mes-Guide 의 5종 산출물·OASIS 계약 검사(`oasis-contract-check`) 대상이 아니다. `flyway-migration-add`·`adr-write` 도 쓸 일이 없다(스키마 무변경, 되돌리기 어려운 결정은 이 문서의 D 절에 둔다).
- **JDK**: `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`. Gradle wrapper 는 `src/backend/gradlew` 하나이고 mdm 안에서는 `../gradlew` 로 부른다. `--no-daemon` 을 붙여 사용자 전역 데몬을 건드리지 않는다. 전역 `gradlew --stop` 금지.
- **mdm 빌드**: `mdm/lib` 은 `java-library` 이고 `test.maxParallelForks = 1` 이다. lib 테스트는 Spring 없이 순수 JUnit 5 로 쓴다(이 Task 의 대상이 Spring 을 쓰지 않는다). `lib/src/test/resources` 는 이 Task 가 처음 만든다. 루트 `mdm/build.gradle` 의 `test` 가 `:lib:test` 에 의존하므로 새 테스트는 `testAll` 에 자동으로 잡힌다.
- **테스트 관례**: 메서드 이름은 한국어 스네이크(`flyway_가_V1_V2_V3_를_적용했다`), 클래스 Javadoc 첫 줄에 "TSK-xx-yy design.md §…" 로 근거를 적는다. 단언은 JUnit `Assertions` 를 쓰는 파일이 많고 AssertJ 도 쓸 수 있다.
- **ArchUnit 관례**: `MdmContractArchitectureTest`·`MdmEntityArchitectureTest` 를 그대로 본뜬다(F21). `ArchRule.as("…")` 설명에 규칙 번호(이 문서의 I1)를 적는다. 음성 테스트의 표본은 test 소스에만 두고, 그 고립 임포트에는 `DO_NOT_INCLUDE_TESTS` 를 쓰지 않는다(쓰면 표본이 빠져 공허 통과한다).
- **기존 전역 규칙과의 관계**: 기존 `MdmContractArchitectureTest.mdm_코드는_mcm_core_AsIs_마스터_자산에_의존하지_않는다` 가 `com.dongkuk.dmes.mdm..` 전체에 걸리므로 새 패키지도 mcm-core 의 As-Is 마스터 패키지를 쓰면 안 된다(쓸 이유도 없다). `MdmEntityArchitectureTest` 는 entity 패키지만 보므로 영향이 없다.
- **계약 사용 범위**: `MdmDataType.STRING/NUMBER`, `MdmDomainKind.DATE/QTY`, `MdmSystemCodes.ERP` 의 `name()`/상수값만 쓴다. 계약 파일은 고치지 않는다(TSK-04-01 은 승인 전 산출물이라 여기서 바꾸면 승인 대상이 흔들린다).
- **CSV**: 저장소에 CSV 라이브러리가 없고(F22) 새 의존을 들이지 않는다. RFC 4180 최소 구현(약 100줄)을 `SapCsv` 에 둔다. Excel 이 한글을 바르게 열도록 출력에 BOM 을 붙인다.
- **함정**:
  - `docs/mdm/design/**` 는 커밋되지 않는 링크다. 원천 인용이 필요하면 이 문서 §0 을 쓴다.
  - SAP 브리프(2026-09-04)의 `MD_*` 테이블명·`de_name`·"DD01L → 도메인 후보"는 낡았다(F12).
  - `api` 가 lib main 출력을 runtime classpath 에 올리므로 lib 에 `main` 을 둔 뒤 `:api:bootWar` 를 한 번 돌려 본다(§3.8-①).
  - `cd` 는 세션 cwd 를 옮긴다. 명령은 `( cd … && … )` 서브셸로 감싼다.
  - 서버를 띄울 일이 없다. `be-run.sh`·`fe-run.sh` 를 쓰지 않는다.
- **git**: `/usr/bin/git` 절대 경로로 부르고 파일 이름을 명시해 stage 한다(`git add -A` 금지). 모든 커밋에 `--trailer "DFlow-Order: b192b68f-3f59-40dd-ac6e-3fb29d1d64c2"` 를 붙이고, 그 뒤에 `--trailer "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"` 를 둔다. push 하지 않는다. 겪은 문제는 `.issues` 에 쓰지 않고 Phase 끝 보고에 분류(tool-error·gate-retry·permission·skill-unclear·env·other)와 함께 올린다.

---

## 담당자 확인 필요 결정

무인 실행이라 질문하지 않았다. 기본값이 명백한 결정(입력은 SE16 CSV — 브리프 F11, 필드명 충돌 시 후보 보류 — 02 F7, 출력 UTF-8 BOM CSV, 입력 `--charset` 옵션, CSV 자체 구현 — F22)은 본문에 적었다. 아래는 기본값이 없어 근거가 더 강한 쪽을 고른 결정이다.

### D1. 모듈 위치와 실행 형태
- **질문**: 후보 추출 배치를 어디에, 어떤 형태로 둘 것인가.
- **선택지**: (a) `src/backend/data-migration/` 아래 Node 스크립트(sample-migration 형태) (b) `mdm/api` 의 Spring `ApplicationRunner`(프로파일로 켬) (c) OASIS 서비스(BPMN) (d) `mdm/lib` 의 Spring 없는 `main` + Gradle `JavaExec` 태스크.
- **택한 것**: (d).
- **근거**: wbs tech-spec 이 "BE: 후보 추출 배치(입력 파일 → 출력 파일)"이고 api-spec 이 `-` 다(F23, spec 본문 다음으로 강한 저장소 정본). TRD §1 은 mdm 백엔드를 `mdm/(lib+api)` composite build 로 정했고 §12 인수 조건이 `testAll` 통과다. (a) 는 composite build 밖이라 게이트가 테스트를 돌리지 않고(F15), 그 표준 형태의 셋째 단계가 대상 DB upsert 라 수용 기준 2와 정면으로 어긋난다. (b) 는 Spring 컨텍스트가 뜨는 순간 Flyway 자동 마이그레이션이 DB 에 쓴다. (c) 는 화면·BPMN 을 요구하는데 이 Task 는 entry-point 가 없다. (d) 는 DB 연결 자체가 없어 "자동 등록 금지"를 구조로 보장하고, ArchUnit 으로 고정할 수 있다.
- **반려되면 재작업할 방향**: (a) 로 가면 `data-migration/sap-dict-candidate/`(Node, `index.cjs` 의 `writeTarget` 을 파일 쓰기로 바꿈)로 옮기고 테스트를 Node 테스트 러너로 다시 쓰되 게이트 밖이 된다는 점을 문서화한다. (b) 로 가면 `api` 에 `@Profile("sap-dict")` 러너를 두고 Flyway·DataSource 자동 설정을 그 프로파일에서 끈다. 변환 로직(`SapDictCandidateExtractor`)과 테스트는 그대로 옮긴다.

### D2. 패키지 이름 `com.dongkuk.dmes.mdm.batch.sapdict`
- **질문**: 화면이 없는 배치를 어느 Java 패키지에 둘 것인가.
- **선택지**: (a) `com.dongkuk.dmes.mdm.dma.{가짜 screenId}`(예: `dma.sapDictCandidate`) (b) 공용 패키지 옆 루트 수준 새 패키지 `com.dongkuk.dmes.mdm.batch.sapdict` (c) `com.dongkuk.dmes.mdm.init.sap`(mcm 의 `init.DataInitializer` 에서 이름만 빌림).
- **택한 것**: (b).
- **근거**: 저장소 관례(TRD §1, screens/README §5)는 업무 패키지 `{group}.{screenId}` 와 공용 `entity`·`repository` 두 가지만 정했고, 화면 없는 배치의 자리는 없다(F20). (a) 는 screens/README §3 의 닫힌 screenId 목록과 그 유일성 문장에 없는 이름을 screenId 자리에 넣어 화면으로 오인되게 한다. (c) 의 `init` 은 mcm 에서 메뉴·RBAC **시드(DB 쓰기)** 를 뜻해 이 배치의 성격(쓰기 없음)과 반대다. (b) 는 wbs tech-spec 의 "배치"라는 말을 그대로 쓰고, 공용 패키지처럼 모듈 루트 아래에 두어 특정 화면에 묶이지 않는다.
- **반려되면 재작업할 방향**: 정해 주는 패키지로 이름만 옮긴다(`git mv` + package 선언·ArchUnit 상수·Gradle `mainClass`·test 리소스 경로는 그대로). 로직 변경은 없다.

### D3. 도메인 후보를 값 정의로 묶고 SAP 도메인명은 참고로만 둔다
- **질문**: spec 의 "도메인 매핑 후보"를 SAP 도메인(DD01L) 하나당 후보 하나로 낼 것인가, 값 정의로 묶어 낼 것인가.
- **선택지**: (a) SAP `DOMNAME` 하나에 도메인 후보 하나(브리프 2026-09-04 표 "DD01L → 도메인 후보") (b) 마루 값 정의(data_type, length, scale, kind_hint)로 묶고 SAP 도메인 이름은 `sap_domains` 참고 칸과 컬럼 시스템 후보 `note` 에만 적는다 (c) 도메인 후보를 내지 않는다.
- **택한 것**: (b).
- **근거**: spec 이 prd-ref 로 지정한 02 원천이 "SAP 도메인 ↔ 마루 도메인: **관리하지 않는다** … MDM은 필드 층에서만 대응한다 / 적어 둘 것이 있으면 `note`"(02:727, 사용자 결정 2026-09-10)와 "타입 정보 → 도메인 후보"(F1)를 명시했고, 도메인 분할 기준도 "값 정의만 도메인, 의미는 컬럼"이다(F4). (a) 는 폐기된 2026-09-04 브리프를 따르는 것이라 02 의 나중 결정과 어긋난다(F12). (c) 는 spec 요구사항 "용어·도메인·컬럼 매핑 후보"를 채우지 못한다.
- **반려되면 재작업할 방향**: (a) 로 가면 `DomainCandidate` 키를 `DOMNAME` 으로 바꾸고(DOMNAME 없는 엘리먼트는 `(내장 타입) {domain_key}` 가상 키), `DD01T` 를 입력에 더해 설명을 싣는다. I10 과 골든 기대값을 바꾼다.

### D4. 기존 사전(계약 SPI)과 대조하지 않는다
- **질문**: 후보를 만들 때 이미 등록된 용어·컬럼과 대조해 걸러내거나 표시할 것인가.
- **선택지**: (a) `contract.dictionary.MdmColumnDictionaryLookup` 을 선택 인자로 받아 이미 등록된 것을 표시하고, 테스트에서는 fake 를 쓴다 (b) 대조하지 않고 추출 파일만으로 후보를 만든다.
- **택한 것**: (b).
- **근거**: 선택지 (a) 의 근거인 계약은 미승인 선행 산출물(TSK-04-01)이고, 그 SPI 는 main 구현체가 없으며(테스트 스텁뿐), 조회 키가 표준 물리명(`TB_MDM_COLUMN.PHYS_NAME`)이라 SAP 필드명(`MATNR`)으로 찾을 수 없고, 용어 조회 계약도 없다(F14). 운영에서 부를 구현체가 없는 의존을 넣으면 죽은 경로가 되고, 계약 인터페이스 의존을 금지하는 I1 로 "쓰기 없음"을 고정하는 것과도 부딪힌다. 초기 적재는 빈 사전을 전제로 하며, 등록된 것과의 겹침은 등록 화면의 중복 검사·유사어 추천(F10)이 잡는다. spec 도 대조를 요구하지 않는다.
- **반려되면 재작업할 방향**: `SapDictCandidateExtractor.extract` 에 `Optional<MdmColumnDictionaryLookup>` 인자를 더하고, `ZZ_` 로 시작하는 필드명의 나머지(`ZZ_COIL_THK` → `COIL_THK`)를 `byPhysName` 으로 찾아 컬럼 시스템 후보에 `registered_column_id` 칸을 채운다. CLI 는 구현체가 없으므로 계속 빈 값으로 돌리고, 테스트는 fake 로 한다. I1 에서 `MdmColumnDictionaryLookup` 한 타입만 허용 목록으로 뺀다. SPI 구현이나 계약 수정은 하지 않는다.

### D5. 한국어 라벨 선택 순서와 용어 분해 방식
- **질문**: 컬럼명 후보로 어느 SAP 라벨을 쓰고, 용어 후보를 어떻게 쪼갤 것인가.
- **선택지**: 라벨 — (a) `SCRTEXT_L → DDTEXT → SCRTEXT_M → SCRTEXT_S` 중 한글이 든 첫 값 (b) `DDTEXT` 우선 (c) `SCRTEXT_M` 우선. 분해 — (x) 공백·괄호·슬래시·쉼표·가운뎃점으로 분해 (y) 형태소 분석기 (z) 기존 용어집 최장 일치.
- **택한 것**: (a) + (x).
- **근거**: 원천에 규칙이 없다. 02 는 마루 컬럼 논리명이 "용어의 순서 있는 조합"이고 표시명 긴 것(24자)이 곧 논리명이라 했으므로(F9), SAP 의 긴 필드 라벨(`SCRTEXT_L`, 40)이 가장 가깝다. `DDTEXT` 는 SE11 에서 필수 칸이라 라벨이 비었을 때의 대체로 둔다. (y) 는 새 의존을 들이고, (z) 는 빈 사전을 전제로 하는 초기 적재에서 쓸 재료가 없으며 D4 와 같은 SPI 문제가 있다. 후보는 사람이 확정하므로 단순하고 예측 가능한 규칙이 검토에 유리하다.
- **반려되면 재작업할 방향**: 라벨 순서는 `SapDictCandidateExtractor` 의 칸 목록 상수 하나와 I11 테스트만 바꾼다. 분해 방식은 구분자 정규식(I12)을 바꾸거나 분해 전략을 인터페이스로 뽑아 교체한다. 골든 기대값을 다시 손으로 쓴다.

---

## Build 이탈 기록

(Build 가 이 설계와 달리 구현한 지점과 사유를 여기에 추기한다.)
