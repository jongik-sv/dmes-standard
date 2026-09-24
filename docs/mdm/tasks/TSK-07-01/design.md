# TSK-07-01 설계 — 마스터데이터 공유 계약 (계약 전용)

> category infra · domain database · priority critical · 복잡도 점수 3(depends 2개 +1, "마이그레이션" 키워드 +2 → opus 판정)이나 spec 머리의 `model: sonnet` 오버라이드로 sonnet 이 이 Design Phase 를 담당한다.
> 에이전트 프롬프트 없음 — spec.md 에 `item.agent_prompt` 필드 없음(`entry-point: -`만 있음).
> 입력: `spec.md` · `.claude/skills/dflow-dev/references/dev-discipline.md` §"Phase 02 — Design"·"병렬 조사와 단일 작성자"·"공통 금지" ·
> `docs/mdm/design/basic/05-master-data.md`(원천, 전체) · `docs/mdm/wbs.md` TSK-07-01~07-04 절 · `docs/mdm/PRD.md` FR-D·§2 규칙 7 ·
> `docs/mdm/TRD.md` · `docs/mdm/naming-dialect-rules.md`(전체) · 리포 루트 `RULE.md` ·
> `docs/mdm/tasks/{TSK-05-01,TSK-01-02,TSK-02-03}/design.md`(참고 틀) · `docs/mdm/erd/05-master-data.{mmd,sqlite.sql,mssql.sql}`(TSK-02-03 산출, 미승인) ·
> 코드 `src/backend/mdm/{lib,api}/**`(읽기 확인, Explore 서브에이전트 3개 위임) · `docs/mdm/decisions.md` D-019·D-030·D-038
> 근거 강도: spec 본문(및 팀장 지시) > PRD §2 규칙 7 > 승인된 선행 산출물(없음, 04·05·06 모두 미승인) > 리포 기존 관례(V2~V4 마이그레이션·naming-dialect-rules) > 미승인 선행 산출물(TSK-02-03 ERD·design, TSK-01-02 계약 — 둘 다 dev 머지·서버 승인 전)

---

## 0. 조사로 확인한 사실 (Build 가 원천 문서를 다시 읽지 않아도 되게 적는다)

| # | 사실 | 근거 |
|---|---|---|
| F1 | **팀장 배정 V7.** V5·V6 이 아직 없어도 V7 을 쓴다(팀장 지시, 위임자 원문). Flyway 파일은 두 방언 모두 `V7__create_mdm_master_data.sql`(위치 `src/backend/mdm/api/src/main/resources/db/migration/mdm/{sqlite,mssql}/`). 현재 dev 는 V1(baseline)·V2(`TB_MDM_SYSTEM`)·V3(02 용어·도메인·컬럼)·V4(03 인터페이스 레이아웃)까지다. **위험**: V5·V6 없이 V7 이 적용된 영속 DB 는, 나중에 V5 가 들어오면 Flyway 기본값 `outOfOrder=false` 때문에 `validate` 단계에서 실패한다 — 이 순서 문제는 팀장이 머지 때 처리하므로 **이 Task 는 Flyway 설정(`outOfOrder` 등)을 건드리지 않는다** | 팀장 지시, `find .../db/migration/mdm/{sqlite,mssql}` 직접 확인 |
| F2 | **Flyway 버전 하드코딩 단정 테스트 4개**가 V7 추가로 깨진다(Explore 서브에이전트 실측): `MdmSharedContractMigrationTest`(sqlite, `assertEquals(Set.of("1","2","3","4"), versions)` 64·75행), `MdmMssqlMigrationTest`(mssql, `migrationsExecuted==4`·`targetSchemaVersion=="4"`·`Set.of("1","2","3","4")` 78·81·82·91행), `MdmInterfaceLayoutMssqlMigrationTest`(mssql, 82·91행), `MdmTermDomainColumnMssqlMigrationTest`(mssql, 87·96행) — 넷 다 `assertEquals(Set, Set)` **완전 일치** 비교라 V7 이 집합에 더해지면 실패한다. **`MdmFlywayVersionParityTest` 는 `containsAll(Set.of("1","2"))`만 보는 부분집합 검사라 수정 불필요**(V7 이 sqlite·mssql 양쪽에 같이 있기만 하면 통과) | Explore 서브에이전트 실측(파일:라인 인용) |
| F3 | **PRD §2 규칙 7 이 배포 순번·수신 로그 칼럼/표를 DDL 에 넣으라고 명시한다**: "DDL 은 원천 설계 그대로 만든다. 배포 대상 표(`*_SYSTEM`)... 배포 순번 칸·표(`chg_seq`, `last_chg_seq`)... 수신 로그 표(`*_RECV`)는 만들되 이번 범위의 코드는 쓰지 않는다. 동작과 화면만 뺀다." → 7테이블 전부(`TB_MDM_DATA_SYSTEM`·`TB_MDM_DATA_RECV`·`TB_MDM_DATA_RECV_ITEM` 포함)를 DDL 로 만드는 근거가 spec 데이터모델 절보다도 위인 PRD 원문에 있다 | `PRD.md:62` |
| F4 | **`decisions.md` D-019 는 "보류 테이블(배포 대상·배포 순번·수신 로그)은 DDL-only — 엔티티·리포지토리·서비스·BPMN·화면 없음"과 "활성 테이블 배포 칸(`CHG_SEQ`·`LAST_CHG_SEQ`)은 DEFAULT 0·엔티티 미매핑"이라고 정했다(두 조항).** 이 Task 의 위임자 지시("엔티티도 7개 모두 만듭니다")는 첫 조항과 정면으로 충돌한다. **판단: 엔티티는 위임자 지시를 따라 7개(보류 3테이블 포함) 전부 만들되, 리포지토리는 활성 4테이블(`DATA`·`DATA_ITEM`·`DATA_CATE`·`DATA_CATE_ITEM`)에만 만든다** — 위임자 지시가 명시적으로 요구한 것은 "엔티티"뿐이고 리포지토리는 언급하지 않았으므로, 지시가 없는 부분은 D-019 원칙(보류 테이블엔 리포지토리를 두지 않는다)을 그대로 따른다. 근거 순위상 위임자 지시(이 Task 전용, 팀장이 spec 을 직접 읽고 낸 지시)가 D-019(다른 Task 의 일반 원칙)보다 세지만, 지시가 미치는 범위(엔티티)를 넘어 리포지토리까지 확대 해석하지 않는다. D-019 의 "엔티티 없음"은 배포·수신 **로직**을 위한 엔티티(서비스가 실제로 읽고 쓰는 것)를 만들지 않는다는 취지였는데, 이 Task 는 애초에 로직을 넣지 않으므로(수용 기준 "실행 로직 없음") 엔티티 존재 자체가 D-019 가 막으려던 위험(때 이른 로직 결합)을 일으키지 않는다. **둘째 조항("배포 칸 엔티티 미매핑")은 실제 코드와 어긋난다** — `MdmUnit.java`(TSK-04-01 산출, dev 머지)가 `CHG_SEQ`를 이미 plain `long chgSeq` 필드로 매핑하고 있다(직접 확인). 문서(D-019)보다 실제로 동작 중인 코드 관례가 더 강한 증거이므로, 이 Task 도 `CHG_SEQ`·`LAST_CHG_SEQ`를 `MdmUnit` 과 같은 방식(plain `long` 필드)으로 매핑한다 | 위임자 지시 원문, `decisions.md` D-019, `MdmUnit.java:36-37,51,57`(`chgSeq` 매핑 직접 확인) |
| F5 | **`TB_MDM_DATA` 원장 FK 대상 `TB_MDM_SYSTEM`(V2, 이미 dev 존재)**: PK `SYSTEM_CODE VARCHAR(20)`(MSSQL `COLLATE Latin1_General_100_BIN2`). 이 Task 의 `SOURCE_SYSTEM`(TB_MDM_DATA)·`SYSTEM_CODE`(TB_MDM_DATA_SYSTEM)·`SOURCE_SYSTEM`(TB_MDM_DATA_RECV) 모두 이 타입 그대로 인라인 FK 를 건다(F1·F20 류 대조군과 같은 패턴, TSK-05-01·TSK-02-03 선례) | Explore 서브에이전트 실측(`sqlite/V2:16`, `mssql/V2:17` 등) |
| F6 | **05-master-data.md 「선분과 닫기」가 일시 선분의 의미를 확정한다**: 경계는 `valid_from`(포함)–`valid_to`(배타)인 **반개구간**. 열린 행의 `valid_to`는 센티넬 `9999-12-31 00:00:00`. PK 는 "원래 키 + `valid_from`". 수정 = 옛 행 `valid_to` 를 저장 시각으로 닫고 같은 시각을 `valid_from`으로 하는 새 행 생성(두 행에 같은 `chg_seq`). 닫기 = 새 행 없이 `valid_to`만 적음. 다시 열기 = 마지막 행 값을 복사한 새 행. 최초 행보다 앞선 기준시각은 최초 행으로 소급 | `05-master-data.md:220-236` |
| F7 | **일시 칼럼의 방언별 타입은 이미 naming-dialect-rules §3 #16(`DTS` 토큰)이 정해 뒀다** — SQLite `TEXT`(`'YYYY-MM-DD HH:MM:SS'`), MSSQL `DATETIME2(0)`, Java `LocalDateTime`(KST, 시간대 없음). "현재 시각은 애플리케이션이 파라미터로 넘긴다"(DB 시각 함수 금지). 열린 끝 센티넬 `'9999-12-31 00:00:00'`도 이 행이 이미 명시한다. **다만 mdm 의 기존 마이그레이션(V1~V4)에는 업무 `LocalDateTime` 칼럼 사례가 전혀 없다**(Explore 실측: valid_from/valid_to·9999 패턴 0건) — 이 Task 가 mdm 에서 처음으로 업무 `LocalDateTime` 칼럼(`VALID_FROM`·`VALID_TO`·`CLOSED_AT`·`RECEIVED_AT`·`PROCESSED_AT`)을 엔티티에 매핑한다. §3 #16 원문은 "실측 필요 → TSK-06-01(04)"로 04 를 지목했지만(04 가 아직 없어 그렇게 추정했을 뿐), **실제로는 이 Task(05)가 시간상 먼저 업무 LocalDateTime 을 매핑**하므로 이 Task 가 실측 의무를 대신 진다(사실로 기록, §2 naming-dialect-rules.md 수정 항목) | `naming-dialect-rules.md` §3 #16, Explore 서브에이전트 실측(grep "9999"·"valid_from" 0건) |
| F8 | **mdm 은 mcm 의 `SqliteTemporalConverterContributor`(LocalDate/LocalDateTime 전용 컨버터)를 등록하지 않는다** — mcm `JpaConfig` 전용 경로라 mdm EntityManagerFactory 에는 적용되지 않는다(TSK-04-01 코드 확인, `naming-dialect-rules.md` §3 #16 재인용). **mcm 자신의 주석이 "SQLite 커뮤니티 dialect + xerial 드라이버는 네이티브 temporal 라운드트립에 결함이 있어 저장 datetime 이 epoch millis(정수)로 샌다"고 명시한다** — 즉 `LocalDateTime`을 아무 조치 없이 그대로 매핑하면 이 결함이 재현될 가능성이 이미 선례로 경고돼 있다("실측해서 될지 안 될지 보자"가 아니라 "결함이 있다고 알려진 것을 모른 척 넘기지 않는다"). `mdm 에는 커스텀 JpaConfig 가 없고(grep 확인) 표준 Spring Boot JPA 자동설정을 쓰므로, mcm 처럼 방언별 분기 Java 코드 없이 `application-local.yml`(SQLite 전용 프로파일 파일)에만 `spring.jpa.properties.hibernate.metadata_builder_contributor` 를 추가하면 SQLite 프로파일에만 스코프된다(`application-local-db.yml`은 MSSQL 전용이라 건드리지 않으면 자동으로 영향 없음 — mcm 의 방언 조건 분기를 파일 분리로 대신한다). **이 Task 는 실측 후 대응(사후 조치)이 아니라, mdm 전용 SQLite 컨버터(`LocalDateTimeAttributeConverter`+`MdmSqliteTemporalConverterContributor`, mcm 선례를 모델로 하되 형식은 naming-dialect-rules §3 #16(`'yyyy-MM-dd HH:mm:ss'`, 소수초 없음)에 맞춘 mdm 자체 파일)를 §2 생성 목록에 처음부터 포함**하고, §3.2 의 `typeof()` 테스트는 "관찰 후 분기"가 아니라 "텍스트 형식이어야 통과하는 단정"으로 둔다(§5 불변 규칙 8 갱신). `CactusAuditEntity.C_AT`(Instant)는 이 컨버터 대상이 아니다(mcm 컨버터도 LocalDate/LocalDateTime 전용이라 Instant 를 건드리지 않는 것과 같은 이유) — 기존 `C_AT_의_SQLite_저장_형식을_typeof_로_관찰한다()` 테스트는 이 변경으로 깨지지 않는다 | `decisions.md` D-038, `MdmEntityJpaRoundtripTest.java:210-234`, `SqliteTemporalConverterContributor.java`·`LocalDateTimeAttributeConverter.java`(mcm, 전문 확인), `mdm/api/build.gradle`·전체 grep(커스텀 JpaConfig 없음 확인) |
| F9 | **`row_version`(낙관적 잠금)은 `@Version` 으로 매핑하지 않는다.** naming-dialect-rules §2: "`row_version` 은 원천이 정한 낙관적 잠금 칼럼... 서버가 요청의 값과 저장값을 비교해 다르면 409로 거부하고, 같으면 저장·상태 전이 때 1 올린다... `VER` 는 감사용 변경 횟수이며 잠금 판정에 쓰지 않는다(`@Version` 이 아니라 수정마다 1 올리는 카운터)." 이 문장은 `VER`가 `@Version`이 아니라는 것이고, `row_version` 자체가 `@Version` 이어야 한다는 뜻도 아니다. §3 #13 은 행 잠금 대신 "조건부 UPDATE(`WHERE ROW_VERSION = :v`, 갱신 0행이면 409)"를 공통 작성 규칙으로 못박는다 — 이는 애플리케이션(TSK-07-03)이 수동으로 비교·증가하는 절차이지 JPA 선언적 `@Version` 이 아니다. 결정적으로 **"수정" 자체가 PK(`valid_from` 포함)가 바뀌는 새 행 INSERT**이므로(F6), 같은 PK 인스턴스에 대한 UPDATE 로 버전을 자동 검사·증가하는 `@Version` 의미론이 애초에 이 모델과 맞지 않는다(옛 행을 "닫는" UPDATE 한 번만 같은 PK 위에서 일어나고, 그 UPDATE 는 `valid_to`만 바꾸며 `row_version` 비교·증가는 그 UPDATE 의 WHERE 절과 새 행의 초깃값 계산으로 앱이 직접 한다) | `naming-dialect-rules.md` §2·§3 #13, `05-master-data.md:220-236`(F6), TSK-02-03 F17(`row_version`이 04 CODE_VER·06 RULE_VER 류와 같은 원천 개념임을 재확인) |
| F10 | **`contract/category` 패키지에 카테고리·ID 이름공간 공유 계약이 이미 있다**(TSK-01-02 산출, dev 머지) — `CategoryKind`(REGEX,TABLE), `CategoryDefTarget`(CODE,KEY,LVL1-5,ATTR01-10), `CategoryOwner`(`MASTER_DATA` 값이 `baseDefTarget=KEY`, `allowedDefTargets={KEY,LVL1-5,ATTR01-10}` — **05:157 의 def_target 허용값과 정확히 일치**, `CODE`는 포함 안 됨), `CategoryConventions`(`BASE_CATE_ID="BASE"`), `MaruIdKind`(`MASTER_CODE`,`MASTER_DATA`), `MaruIdNamespace`(SPI, `kind()`+`contains(String)`), `MaruIdRules`(`FORBIDDEN_CHAR_PATTERN="[.,\\s]"`). 이 Task 는 **이 타입들을 재사용만 한다** — 새로 만들거나 고치지 않는다(spec 요구사항 "카테고리·ID 이름 공간은 전사 계약 재사용"). `MaruIdNamespace`(05 쪽 실제 구현체, 등록 서비스가 `TB_MDM_CODE`·`TB_MDM_DATA` 상대 표를 대조하는 로직)와 `wbs.md` TSK-07-02 수용 기준 "마루 코드와 ID 중복 거부"는 **이 Task 밖**(TSK-07-02)이다 — "실행 로직 없음" 수용 기준과 일치. **`MASTER_DATA` 쪽 재사용 증명은 이미 `ContractStubCompileTest`(TSK-01-02 산출)의 `MasterDataIdNamespaceStub`(51-52행, `NAMESPACES` 목록의 두 번째 원소, `Set.of("ITEM","CUSTOMER")`로 생성)가 하고 있다** — 이 Task 가 새 스텁을 또 만들 필요가 없다(직접 확인, 중복 방지) | Explore 서브에이전트 실측(전문 인용), `wbs.md:1116`, `ContractStubCompileTest.java:50-52,120-122` 직접 확인 |
| F11 | **기존 엔티티는 계약 enum 을 JPA `@Enumerated` 로 직접 매핑하지 않는다.** `MdmLayoutItem.fillKind` 는 `contract.layout.MdmFillKind` 가 있음에도 plain `String`(`@Column(name="FILL_KIND", length=20)`)으로 매핑돼 있다(선례 확인, `MdmLayoutItem.java:31-32`). 이 Task 도 `TB_MDM_DATA_CATE.DEF_KIND`·`DEF_TARGET` 을 plain `String` 필드로 매핑한다 — "계약 재사용"은 **DDL 의 CHECK 허용값 목록이 계약 enum 의 상수 이름과 정확히 같다는 것을 테스트로 증명하는 방식**으로 한다(엔티티 필드 타입이 아니라) | `MdmLayoutItem.java:31-32` 직접 확인 |
| F12 | **`TB_MDM_DATA_CATE_EFF`(사본 전용 REGEX 캐시)는 이 Task 범위 밖이다** — 05 문서 자신이 "원장에는 없다"고 명시하고(05:703), TSK-02-03 도 "spec 대상 밖, 원장 DDL 에 포함하지 않는다"고 이미 판단했다(05-master-data.sqlite.sql 헤더 주석). 원장 테이블 7개만 만든다(spec "05 테이블 7개") | `05-master-data.md:699-703`, `docs/mdm/erd/05-master-data.sqlite.sql:1-3` |
| F13 | **`CATE_ITEM → CATE`·`CATE_ITEM → ITEM`, `CATE → ITEM`류 선분 참조에는 FK 를 걸지 않는다**(05:162 "원장 FK... CATE_ITEM → CATE·ITEM은 선분 때문에 FK가 아니고 앱이 검사한다"). `valid_from` 이 행마다 달라 PK 로 FK 를 만들 수 없기 때문이다(TSK-02-03 F12 와 같은 이유, 04 의 같은 패턴과 대칭). `TB_MDM_DATA_CATE_ITEM` 은 `MARU_DATA_ID → TB_MDM_DATA` FK **하나만** 걸고 `CATE_ID`·`CODE` 는 FK 없음 | `05-master-data.md:162,188,594`, TSK-02-03/design.md F12 |
| F14 | **TSK-02-03(`docs/mdm/tasks/TSK-02-03/design.md` §6.4, `docs/mdm/erd/05-master-data.{sqlite,mssql}.sql`)가 이 영역의 칼럼·타입·제약을 이미 상세히 설계해 뒀다**(미승인이지만 이 영역을 전담해 만든 산출물이라 리포 기존 관례보다는 위, 승인된 산출물보다는 아래). §6.0 타입 토큰(`CD50`=`VARCHAR(50)`/`VARCHAR(50) COLLATE BIN2`, `NM100`=`TEXT`/`NVARCHAR(100)`, `DTS`=`TEXT`/`DATETIME2(0)`, `BIGI`=`INTEGER`/`BIGINT`, `ATTR500`=`TEXT`/`NVARCHAR(500)`, `TXT_A`=`TEXT`/`VARCHAR(MAX)` 등)과 §6.4 칼럼표를 DDL·엔티티의 1차 텍스트로 삼는다. §6.4 는 이미 05 원문(05-master-data.md)과 정확히 대응하는지 이 Task 가 직접 재확인했다(F6·F9·F13 교차 검증 완료, 불일치 없음) | `docs/mdm/tasks/TSK-02-03/design.md:138-167,504-620`, `docs/mdm/erd/05-master-data.sqlite.sql`, `.mssql.sql` 전문 확인 |
| F15 | **TSK-02-03 ERD 초안의 SQLite `VER` 칼럼 타입이 실제 dev 관례와 다르다(드리프트).** ERD 초안(`05-master-data.sqlite.sql`)은 감사 `VER` 를 `VER INTEGER`로 적었지만, 실제 dev 에 머지된 V2~V4 마이그레이션은 SQLite 에서도 전부 `VER BIGINT`(리터럴 그대로, SQLite 타입 친화도상 결과는 같지만 DDL 텍스트가 다르다) — TSK-05-01 F6 과 같은 종류의 이탈이다. **이 Task 의 V7 SQLite DDL 은 `VER BIGINT`로 쓴다**(ERD 초안이 아니라 V2~V4 실제 파일을 따른다 — 리포 기존 관례가 미승인 산출물보다 근거가 세다) | Explore 서브에이전트 실측(`sqlite/V2:15`,`V3:23,52,85,120,141,170`,`V4:27,49,74,97,118` 전부 `VER BIGINT`), `docs/mdm/erd/05-master-data.sqlite.sql`(`VER INTEGER`, 드리프트) |
| F16 | **예약어 충돌 없음.** 05 의 7테이블 칼럼명 중 SQLite/MSSQL 예약어와 충돌하는 것은 `TB_MDM_DATA_RECV."RESULT"`/`[RESULT]`, `TB_MDM_DATA_RECV_ITEM."ACTION"`/`[ACTION]` 둘뿐이다(TSK-02-03 F18 이미 확인). `VERSION`류 충돌은 없다(이 Task 의 낙관적 잠금 칼럼명은 `ROW_VERSION`이라 예약어가 아니다) | TSK-02-03/design.md F18, `naming-dialect-rules.md` §1 예약어 칼럼 행 |
| F17 | **`ArchUnit` 은 `mdm/lib` 모듈에만 `testImplementation`으로 있다**(`lib/build.gradle:50`). `MdmContractArchitectureTest`·`MdmEntityArchitectureTest`(둘 다 `mdm/lib/src/test/java/.../{contract,entity}/`)는 `com.dongkuk.dmes.mdm` 패키지를 스캔하므로 이 Task 의 새 엔티티 7개·`contract.data` 서브패키지에 **수정 없이 자동 적용**된다(TSK-05-01 F13 과 같은 패턴). 다만 "저장 코어 인터페이스의 `src/main` 구현체가 없다"를 증명하려면 `lib` 와 `api` 양쪽 main 클래스를 함께 스캔해야 하는데(TSK-07-03 의 서비스 구현체는 `api` 모듈에 생긴다, `com.dongkuk.dmes.mdm.dmd.*` 패턴), `lib` 모듈 테스트 클래스패스는 `api` 메인 클래스를 보지 못한다(의존 방향이 `api → lib`이지 반대가 아니다). **새 ArchUnit 테스트는 `api/src/test`에 둬야 하고, `api/build.gradle` 에 `archunit-junit5` `testImplementation` 을 새로 추가해야 한다**(현재 `api/build.gradle` 에 선언 없음, 직접 확인) | `lib/build.gradle:50`, `api/build.gradle` 전문 확인(archunit 없음), TSK-05-01 F13 |
| F18 | **`TB_MDM_DATA_CATE` 의 DEF_TARGET 허용값을 DB CHECK 로 한 번 더 못박으면 "계약 재사용"을 DDL 수준에서 증명할 수 있다.** TSK-02-03 ERD 초안은 `DEF_KIND`(REGEX/TABLE) CHECK 와 "REGEX면 EXPR·TARGET 둘 다 NOT NULL" CHECK 만 두고 `DEF_TARGET` 의 허용값 나열 CHECK 는 두지 않았다. 05:157 이 "def_target 허용값은 KEY, LVL1-LVL5, ATTR01-ATTR10"이라고 명시하고 이는 정확히 `CategoryOwner.MASTER_DATA.allowedDefTargets()`(F10)와 같다 — 이 Task 가 `CK_TB_MDM_DATA_CATE_TARGET`(`DEF_TARGET IS NULL OR DEF_TARGET IN ('KEY','LVL1'...'ATTR10')`)을 **추가**하고, 그 IN 목록 문자열 집합이 `CategoryOwner.MASTER_DATA.allowedDefTargets()`의 `name()` 집합과 정확히 같은지 테스트로 대조한다(TSK-02-03 ERD 대비 추가이므로 이탈 기록) | `05-master-data.md:157`, `CategoryOwner.java`(F10) |
| F19 | **`TB_MDM_DATA.CODE_PATTERN`·`TB_MDM_DATA_CATE.DEF_EXPR`(정규식 원문)은 `TXT_A` 토큰(ASCII 전용, MSSQL `VARCHAR(MAX)`)이다** — naming-dialect-rules §6.0 자신이 "EvalEx 식·정규식 원문"을 `TXT_A` 의 대표 쓰임으로 명시해 뒀다. `ATTR01-10`(항목 값)은 반대로 `NVARCHAR(500)`(한글 허용, ATTR500)이라 정규식이 한글 값을 대조할 수 있는 데는 문제가 없다(정규식 자체가 ASCII 라는 것과 대조 대상 값이 한글이라는 것은 별개다) | `naming-dialect-rules.md:151`, `docs/mdm/erd/05-master-data.mssql.sql:92`(`DEF_EXPR VARCHAR(MAX)`) |
| F20 | **MSSQL `mssqlTest` 소스셋 실행은 Docker(Testcontainers) 가 필요하고 Design Phase 에서 실행하지 않는다**(오케스트레이터 지시, 같은 워크트리에서 팀장의 기준선 측정과 경합). 이 design.md 의 MSSQL 관련 결정(F5·F16 등)은 코드·문서 정적 대조로만 확인했다(TSK-02-03 F4 와 같은 처지) | 위임자 지시, TSK-02-03 F4 |

---

## 1. 접근 방식

05 원장 7테이블(`TB_MDM_DATA`·`DATA_SYSTEM`·`DATA_ITEM`·`DATA_CATE`·`DATA_CATE_ITEM`·`DATA_RECV`·`DATA_RECV_ITEM`)의 **Flyway V7**(두 방언, F1)을 새로 작성한다. 모든 FK 는 `TB_MDM_DATA`(이 파일이 먼저 만든다) 또는 이미 존재하는 `TB_MDM_SYSTEM`(V2, F5)만 가리키므로 TSK-05-01 의 03 영역과 달리 **순환 FK 가 없다** — 두 방언 모두 단순 순서(DATA → DATA_SYSTEM → DATA_ITEM → DATA_CATE → DATA_CATE_ITEM → DATA_RECV → DATA_RECV_ITEM)로 인라인 FK 를 걸면 된다. DDL 은 TSK-02-03 ERD 초안(`erd/05-master-data.{sqlite,mssql}.sql`)을 1차 텍스트로 삼되 F15(SQLite `VER BIGINT` 정정)·F18(`DEF_TARGET` CHECK 추가) 두 지점만 갈라 적용한다.

7개 엔티티 전부를 `lib/entity` 평면 패키지에 두고(위임자 지시, F4), 복합 PK 테이블(`DATA_SYSTEM`·`DATA_ITEM`·`DATA_CATE`·`DATA_CATE_ITEM`·`DATA_RECV_ITEM`, 5개)은 `MdmColumnSystem`/`MdmLayoutItem` 선례(`@IdClass`, `Serializable`)를 따른다. 감사 9칼럼은 `CactusAuditEntity` 상속으로 얻는다. FK 칼럼은 전부 원시 필드(`@ManyToOne` 금지, 불변 규칙). 낙관적 잠금 칼럼 `ROW_VERSION`(`TB_MDM_DATA_ITEM`)은 `@Version` 이 아닌 plain `int` 필드로 매핑한다(F9) — PK 가 바뀌는 "수정"(닫기+새 행) 모델과 JPA `@Version` 의미론이 맞지 않기 때문이다.

계약(contract-only) 부분은 새 서브패키지 `com.dongkuk.dmes.mdm.contract.data`(TSK-05-01 의 `contract.layout` 과 대칭되는 영역별 명명)에 로직 없는 상수 클래스(`MdmTemporalSegmentRules`, 열린 끝 센티넬)·enum(`MdmTemporalSegmentAction`)·record(`MdmTemporalSegmentResult`)·interface(`MdmTemporalSegmentStore`, 추상 메서드만)를 선언한다 — 항목·카테고리·소속 세 테이블이 공유하는 "일시 선분 저장 코어"를 제네릭 SPI 하나로 표현한다(§6.1). 카테고리·ID 이름공간은 **전사 계약을 재사용만** 한다(F10) — `contract.category` 의 어떤 파일도 고치지 않고, DDL·테스트가 그 계약의 값(enum 이름·허용 target 집합)과 정확히 같은지 대조하는 방식으로 "재사용"을 증명한다(F11·F18).

기존 ArchUnit 테스트(`MdmContractArchitectureTest`·`MdmEntityArchitectureTest`, `mdm/lib`)는 패키지 접두사 전체를 스캔하므로 새 서브패키지·엔티티에 수정 없이 자동 적용된다(F17). 다만 "저장 코어 인터페이스의 실 구현체가 `src/main` 에 없다"는 이 Task 만의 수용 기준("실행 로직 없음")을 증명하려면 `lib`+`api` 양쪽 main 클래스를 함께 스캔하는 **새** ArchUnit 테스트가 필요하고, 이는 `api/src/test`에 두며 `api/build.gradle` 에 archunit 의존성을 새로 추가한다(F17).

이 Task 는 일시 `LocalDateTime` 칼럼을 mdm 에서 처음 매핑하므로(F7·F8), mcm 의 알려진 SQLite temporal 라운드트립 결함 선례를 그대로 재현하지 않도록 **mdm 전용 SQLite 컨버터를 처음부터 함께 만든다**(F8) — "실측해 보고 깨지면 고친다"가 아니라 "이미 알려진 결함을 선제적으로 우회한다." Build 는 §3.2 의 `typeof()` 단정 테스트로 그 결과를 실제로 검증한다. 경계 시각의 반개구간 규칙(F6)과 방언별 정밀도(MSSQL `DATETIME2(0)`, 초 단위)는 §5 불변 규칙에 직접 명시하고, 네이티브 SQL 경계 질의 테스트(§3.1)로 검증한다.

---

## 2. 변경 파일 목록

### 생성

- `src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V7__create_mdm_master_data.sql`
- `src/backend/mdm/api/src/main/resources/db/migration/mdm/mssql/V7__create_mdm_master_data.sql`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmData.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmDataSystem.java`(복합 PK, F4 — 위임자 지시로 보류 테이블도 엔티티를 만든다)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmDataSystemId.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmDataItem.java`(`ROW_VERSION` → plain `int rowVersion`, F9)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmDataItemId.java`(필드 `maruDataId`·`code`·`validFrom`)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmDataCate.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmDataCateId.java`(필드 `maruDataId`·`cateId`·`validFrom`)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmDataCateItem.java`(F13 — `CATE_ID`·`CODE` FK 없음, 원시 필드만)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmDataCateItemId.java`(필드 `maruDataId`·`cateId`·`code`·`validFrom`)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmDataRecv.java`(F4 — 보류 테이블도 엔티티 생성, 위임자 지시)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmDataRecvItem.java`(F4, 예약어 칼럼 `ACTION` 백틱 인용)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmDataRecvItemId.java`(필드 `recvId`·`seq`)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/repository/MdmDataRepository.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/repository/MdmDataItemRepository.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/repository/MdmDataCateRepository.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/repository/MdmDataCateItemRepository.java`(활성 4테이블만 리포지토리를 만든다 — `DataSystem`·`DataRecv`·`DataRecvItem`은 D-019 원칙대로 리포지토리를 두지 않는다, F4)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/persistence/LocalDateTimeAttributeConverter.java`(F8, SQLite 전용, 포맷 `'yyyy-MM-dd HH:mm:ss'` — mcm 선례를 모델로 하되 naming-dialect-rules §3 #16 형식에 맞춘 mdm 자체 파일)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/persistence/MdmSqliteTemporalConverterContributor.java`(F8, `MetadataBuilderContributor`, `applyAttributeConverter(LocalDateTimeAttributeConverter.class, true)`)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/data/package-info.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/data/MdmTemporalSegmentRules.java`(상수 클래스: `OPEN_END = LocalDateTime.of(9999,12,31,0,0,0)`, F6)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/data/MdmTemporalSegmentAction.java`(enum: INSERT, UPDATE, CLOSE, REOPEN, NONE — `TB_MDM_DATA_RECV_ITEM.ACTION` CHECK 목록과 이름을 맞춘다, 05:213·697)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/data/MdmTemporalSegmentResult.java`(record, §6.1)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/data/MdmTemporalSegmentStore.java`(interface, §6.1, D1)
- `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/MdmTemporalSegmentStoreConsumerStub.java`(TSK-07-03 역, `MdmTemporalSegmentStore<String,String>` 최소 구현 — 컴파일 증명용 스텁, src/test 라 "실행 로직 없음"과 무관)
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmMasterDataExpectations.java`(공유 헬퍼, `MdmInterfaceLayoutExpectations`/`MdmDictionaryExpectations` 선례와 같은 패턴 — SQLite·MSSQL 두 마이그레이션 테스트가 같은 테이블·칼럼 기대값을 본다)
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmMasterDataMigrationTest.java`(SQLite, §3.1)
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmMasterDataEntityJpaRoundtripTest.java`(SQLite, JPA 왕복 + LocalDateTime 저장 형식 관찰, §3.2)
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmTemporalSegmentStoreNoImplementationTest.java`(ArchUnit, `lib`+`api` 교차 스캔, §3.5, F17)
- `src/backend/mdm/api/src/mssqlTest/java/com/dongkuk/dmes/mdm/MdmMasterDataMssqlMigrationTest.java`(MSSQL, `@SpringBootTest`+`local-db`, §3.3)

### 수정

- `src/backend/mdm/api/build.gradle` — `dependencies` 블록에 `testImplementation 'com.tngtech.archunit:archunit-junit5:1.3.0'` 추가(F17, 현재 미선언 확인됨)
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmSharedContractMigrationTest.java` — `Set.of("1","2","3","4")` → `Set.of("1","2","3","4","7")`, 메서드명 `flyway_가_V1_V2_V3_V4_를_적용했다()`(64행) → `flyway_가_V1_V2_V3_V4_V7_를_적용했다()`. **새 버전(V7) 반영이지 기대값 완화가 아니다**(F2)
- `src/backend/mdm/api/src/mssqlTest/java/com/dongkuk/dmes/mdm/MdmMssqlMigrationTest.java` — `migrationsExecuted==4`→`5`, `targetSchemaVersion=="4"`→`"7"`, `Set.of("1","2","3","4")`→`Set.of("1","2","3","4","7")`, 메서드명 `..._V1_V2_V3_V4_가_적용된다()`(78행) → `..._V1_V2_V3_V4_V7_가_적용된다()`(F2, 새 버전 반영)
- `src/backend/mdm/api/src/mssqlTest/java/com/dongkuk/dmes/mdm/MdmInterfaceLayoutMssqlMigrationTest.java` — `Set.of("1","2","3","4")`→`+"7"`(82·91행), 메서드명에 `_V7_` 추가(F2)
- `src/backend/mdm/api/src/mssqlTest/java/com/dongkuk/dmes/mdm/MdmTermDomainColumnMssqlMigrationTest.java` — `Set.of("1","2","3","4")`→`+"7"`(87·96행), 메서드명에 `_V7_` 추가(F2)
- `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/ContractStubCompileTest.java` — `MdmTemporalSegmentStoreConsumerStub`을 예시하는 `@Test` 메서드 1개 추가(기존 파일이 계약 스텁 컴파일 검증의 단일 진입점이라 TSK-05-01 선례를 따른다). `MaruIdNamespace`/`MASTER_DATA` 재사용 증명은 이미 있는 `MasterDataIdNamespaceStub` 케이스를 인용만 하고 새로 추가하지 않는다(F10)
- `src/backend/mdm/api/src/main/resources/application-local.yml` — `spring.jpa.properties.hibernate.metadata_builder_contributor: com.dongkuk.dmes.mdm.persistence.MdmSqliteTemporalConverterContributor` 추가(F8, SQLite 전용 프로파일 파일이라 MSSQL 에는 영향 없음)
- `docs/mdm/naming-dialect-rules.md` — §3 #16(업무 LocalDateTime) 행을 "실측 필요 → TSK-06-01" 에서 이 Task 실측 결과로 갱신(F7, Build 완료 시 실제 관찰 결과 반영), §3 #2(recv_id AUTOINCREMENT)·#19(BIN2 대소문자 구분) 05 해당분을 "확인(TSK-07-01 실측)"으로 갱신, §6.1 인계 표의 "TSK-07-01(05)" 행을 완료로 갱신 — **Build 가 실제 테스트 결과를 확인한 뒤에 이 파일을 고친다**(Design 은 무엇을 고칠지만 예고한다)
- `docs/mdm/decisions.md` — Build 완료 시 D1(저장 코어 인터페이스 시그니처, 이 design.md 확정분을 그대로 append)과, SQLite LocalDateTime 컨버터(F8) 실측 결과를 새 번호로 append(Build 시점 작업, 이 design.md 가 무엇을 append 할지만 예고)

### 변경하지 않음(참고만)

- `docs/mdm/erd/05-master-data.{mmd,sqlite.sql,mssql.sql}` — TSK-02-03 소유 문서. 이 Task 는 갈라지는 지점(F15·F18)을 명시했을 뿐 ERD 자체를 고치지 않는다.
- `docs/mdm/design/basic/05-master-data.md` — 원천 문서. 원문을 고치지 않는다.
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/category/*` — 전사 공유 계약. 이 Task 는 재사용만 한다(F10, 불변 규칙).

---

## 3. 테스트 전략

**기준선**(오케스트레이터 실측, 팀장 지시 원문): testAll 1878 tests / 0 failures / 0 errors. mssqlMigrationTest 는 오케스트레이터가 측정 중(Design 은 실행하지 않는다).

게이트 판정 = 기준선 대비 신규 실패 0 + 테스트 총수 미감소(신규 테스트는 늘어난다).

### 3.1 `MdmMasterDataMigrationTest`(SQLite, `api/src/test`)

`MdmInterfaceLayoutMigrationTest`와 같은 패턴(`@SpringBootTest(webEnvironment=MOCK)`, `@ActiveProfiles("local")`, `@TempDir`). 확인 항목:

1. `flyway_schema_history`에 버전 `"7"`이 `success=1`로 있다.
2. 7테이블 전부 생성, PK·FK·UX·CK 제약명이 규칙표 패턴을 따른다(`MdmMasterDataExpectations`로 테이블·칼럼 목록 공유).
3. **F5 대조군** — `TB_MDM_DATA.SOURCE_SYSTEM`·`TB_MDM_DATA_SYSTEM.SYSTEM_CODE`·`TB_MDM_DATA_RECV.SOURCE_SYSTEM`에 `TB_MDM_SYSTEM`에 없는 값으로 INSERT 하면 거부됨을 확인.
4. `CK_TB_MDM_DATA_STATUS`(INUSE/DEPRECATED 외 거부), `CK_TB_MDM_DATA_SRC_KIND`(MDM/EXTERNAL 외 거부), `CK_TB_MDM_DATA_SRC_SYS`(EXTERNAL 인데 SOURCE_SYSTEM NULL, 또는 MDM 인데 NOT NULL — 둘 다 거부), `CK_TB_MDM_DATA_LVL_CNT`(0-5 밖 거부), `CK_TB_MDM_DATA_CATE_KIND`(REGEX/TABLE 외 거부), `CK_TB_MDM_DATA_CATE_DEF`(REGEX 인데 EXPR 또는 TARGET NULL, TABLE 인데 EXPR·TARGET 비NULL — 거부), **`CK_TB_MDM_DATA_CATE_TARGET`(F18 신설, `DEF_TARGET`이 KEY/LVL1-5/ATTR01-10 밖이면 거부, CODE 도 거부됨을 확인 — 04 전용값이 05 에 섞이지 않는다는 직접 증거)**, `CK_TB_MDM_DATA_RECV_RESULT`(OK/REJECTED/FAILED 또는 NULL 외 거부), `CK_TB_MDM_DATA_RECV_ITEM_ACTION`(다섯 값 또는 NULL 외 거부) 각각 위반 INSERT 거부를 확인.
5. **F13(FK 없음) 직접 증거** — `TB_MDM_DATA_CATE_ITEM`에 존재하지 않는 `CATE_ID`·`CODE` 값으로 INSERT 해도 **성공**함을 확인(FK 를 실수로 추가하는 변이가 있으면 이 서브 단언이 거부로 바뀌어 빨개진다).
6. **F6(선분 PK) 직접 증거** — 같은 `(MARU_DATA_ID,CODE)`에 `VALID_FROM`만 다른 두 행이 공존 가능함(PK 에 `VALID_FROM`이 들어 있다는 증거), 같은 `(MARU_DATA_ID,CODE,VALID_FROM)` 중복 INSERT 는 PK 위반으로 거부.
7. `VALID_TO` 기본값이 DDL 텍스트에 `'9999-12-31 00:00:00'` 로 있는지 `sqlite_master.sql` 텍스트로 확인(F6).
8. **F15(SQLite `VER BIGINT`) 직접 증거** — 7테이블 전부의 `VER` 칼럼 DDL 텍스트가 `BIGINT`인지 `sqlite_master.sql` 텍스트로 확인.
9. **F18(계약 재사용) 직접 증거** — `CK_TB_MDM_DATA_CATE_TARGET`의 `IN (...)` 목록을 DDL 텍스트에서 파싱해, `CategoryOwner.MASTER_DATA.allowedDefTargets()`(`contract.category`)의 `name()` 집합과 정확히 같은지 리플렉션으로 대조. `CK_TB_MDM_DATA_CATE_KIND`의 `IN (...)` 목록도 `CategoryKind.values()`의 `name()` 집합과 대조.
10. **ADR-0002(DEFAULT 0)** — `TB_MDM_DATA`(`LAST_CHG_SEQ`·`CHG_SEQ`)·`TB_MDM_DATA_ITEM`·`TB_MDM_DATA_CATE`·`TB_MDM_DATA_CATE_ITEM`(각 `CHG_SEQ`)에 그 칼럼을 생략한 INSERT 가 `0`으로 채워짐을 확인(§6.4 근거, ADR-0002).
11. **반개구간 경계 산술(F6, §5 불변 규칙 2)** — 네이티브 SQL 로 `TB_MDM_DATA_ITEM`에 `VALID_FROM='2026-09-24 10:00:00'`, `VALID_TO='2026-09-24 11:00:00'`인 행 하나를 INSERT 하고, `SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE VALID_FROM <= :t AND :t < VALID_TO`를 세 값으로 각각 돌린다: `t='2026-09-24 10:00:00'`(=T1, 1건 — 포함), `t='2026-09-24 10:59:59'`(T2 직전, 1건 — 포함), `t='2026-09-24 11:00:00'`(=T2, 0건 — 배타). SQLite TEXT 칼럼에서 이 비교가 사전식으로 올바른 것은 `DTS` 포맷(`yyyy-MM-dd HH:mm:ss`, 고정 폭 ISO)이 사전식 순서와 시간 순서가 같기 때문이다 — 이 테스트는 동시에 §5 불변 규칙 8(저장 형식이 `TEXT`가 아니거나 형식이 다르면 이 비교 자체가 깨진다, 예를 들어 SQLite `INTEGER` 값과 `TEXT` 리터럴이 섞이면 타입 친화도 규칙상 INTEGER 가 항상 TEXT 보다 작다고 비교돼 경계 판정이 무너진다)을 함께 검증한다.

### 3.2 `MdmMasterDataEntityJpaRoundtripTest`(SQLite, `api/src/test`)

`ddl-auto: none`이라 부팅이 매핑 오류를 잡지 못하므로, 7개 엔티티 각각 최소 1건 저장→조회 왕복을 수행한다. 복합키(`@IdClass`) 왕복(`MdmDataSystem`·`MdmDataItem`·`MdmDataCate`·`MdmDataCateItem`·`MdmDataRecvItem`, 5개)을 포함한다. 리포지토리가 없는 `MdmDataSystem`·`MdmDataRecv`·`MdmDataRecvItem`(F4, D-019)은 `EntityManager`로 직접 저장·조회한다.

**F7·F8 단정(가장 중요, §5 불변 규칙 8)** — `MdmSqliteTemporalConverterContributor`(F8, §2 생성)가 SQLite 프로파일에 이미 등록돼 있다는 전제로, `MdmEntityJpaRoundtripTest.C_AT_의_SQLite_저장_형식을_typeof_로_관찰한다()`(기존 선례, `Instant`용)와 같은 방식을 `LocalDateTime`에 적용해 **관찰이 아니라 단정**한다:
1. `MdmDataItem`을 `validFrom = LocalDateTime.of(2026,9,24,10,0,0)`으로 저장한다.
2. 같은 트랜잭션에서 `SELECT typeof(VALID_FROM), VALID_FROM FROM TB_MDM_DATA_ITEM WHERE ...` 네이티브 쿼리로 확인한다.
3. **`typeof`가 `'text'`이고 값이 정확히 `'2026-09-24 10:00:00'`(naming-dialect-rules §3 #16 형식, `T` 구분자 아님, 소수초 없음)임을 `assertEquals`로 단정한다** — 컨버터가 제대로 등록되지 않았거나 형식이 어긋나면(예: `C_AT`처럼 정수 epoch 로 새거나 mcm 선례처럼 `.SSS` 소수초가 붙으면) 이 테스트가 실패로 Build 에게 알린다. **변이**: `application-local.yml`에서 `metadata_builder_contributor` 설정을 빼면 이 테스트가 빨개진다(컨버터 미등록의 직접 증거).
4. `VALID_TO` 기본값(DDL `'9999-12-31 00:00:00'`)으로 INSERT 된 행을 JPA 로 읽으면 `MdmTemporalSegmentRules.OPEN_END`(`contract.data`)와 `.equals()`로 같아야 한다(§5 불변 규칙 3).

**F9(`row_version` ≠ `@Version`) 실측** — TSK-05-01 §3.3 의 `layoutVersion` 절차(더티 업데이트 후 값 불변 확인)와 같은 모양:
1. `MdmDataItem`을 저장(`rowVersion=0`).
2. `name`(감사 대상 아닌 업무 필드)을 바꾸고 `flush()`+`clear()`.
3. 같은 PK 로 재조회 — `rowVersion`이 저장 시점 값과 같음을 단언(자동 증가하지 않음), 감사 `getVersion()`(`VER`)은 UPDATE 가 있었으므로 증가했는지 별도 확인 — `rowVersion`과 `VER`이 서로 독립임을 증명한다. `rowVersion`을 `@Version`으로 바꾸는 변이를 넣으면 이 절차의 2번째 save 이후 `rowVersion`이 예상과 다르게 증가해 이 테스트가 빨개진다.

### 3.3 `MdmMasterDataMssqlMigrationTest`(MSSQL, `api/src/mssqlTest`)

`MdmInterfaceLayoutMssqlMigrationTest` 패턴(`@SpringBootTest`+`local-db`+Testcontainers, Hibernate 매핑까지 실제로 거친다). naming-dialect-rules §6.1 인계 지목분(05 의 #2·#19)을 닫는다:

1. 마이그레이션 5건 적용, `flyway_schema_history`에 `{"1","2","3","4","7"}`.
2. **#2(F5류)**: `TB_MDM_DATA_RECV.RECV_ID`의 `IDENTITY(1,1)`이 연속 증가함을 확인한다 — `TB_MDM_DATA_RECV`는 리포지토리가 없으므로(F4, D-019) `EntityManager.persist()`+`flush()`를 연속 호출하거나 네이티브 INSERT 를 연속 실행해 확인한다.
3. **#19**: `MARU_DATA_ID`·`CODE`·`CATE_ID`·`SYSTEM_CODE`·`SOURCE_SYSTEM`·`STATUS`·`SOURCE_KIND`·`DEF_KIND`·`DEF_TARGET`·`LVL1-5` 등 BIN2 콜레이션 칼럼에 `sys.columns.collation_name='Latin1_General_100_BIN2'`을 확인하고, 대소문자만 다른 두 `MARU_DATA_ID`('PORTx'/'portx') 값이 서로 다른 행으로 INSERT 됨을 실제로 확인한다.
4. `TB_MDM_DATA.SOURCE_SYSTEM`·`TB_MDM_DATA_SYSTEM.SYSTEM_CODE`·`TB_MDM_DATA_RECV.SOURCE_SYSTEM` FK 가 MSSQL 에서도 강제됨을 확인(F5 대조군).
5. **F7·F8 재확인(MSSQL 쪽)** — `DATETIME2(0)`에 초 단위 미만 값을 넣었을 때 반올림·절삭 동작을 실측하고, `MdmDataItem` 왕복이 SQLite 결과(§3.2)와 논리적으로 같은 시각을 돌려주는지 확인(§5 불변 규칙 9, 정밀도).
6. 예약어 칼럼 `[RESULT]`·`[ACTION]` 매핑 왕복 — 엔티티로 저장 후 조회한 값이 저장한 값과 일치.
7. **복합키 왕복** — 복합 PK 엔티티 5개(`MdmDataSystem`·`MdmDataItem`·`MdmDataCate`·`MdmDataCateItem`·`MdmDataRecvItem`)를 저장하고 `*Id`로 조회해 값이 일치함을 확인한다. 리포지토리가 있는 `MdmDataItem`·`MdmDataCate`·`MdmDataCateItem`은 `save()`/`findById()`로, 리포지토리가 없는 `MdmDataSystem`·`MdmDataRecvItem`(F4, D-019)은 `EntityManager.persist()`+`flush()`+`find(Class, id)`로 확인한다.
8. **F13(FK 없음) MSSQL 대조군** — `TB_MDM_DATA_CATE_ITEM`에 존재하지 않는 `CATE_ID`·`CODE` 로 INSERT 가 MSSQL 에서도 성공함을 확인(SQLite §3.1-5 와 대조).

### 3.4 계약 스텁 컴파일 테스트(`ContractStubCompileTest` 확장)

- `MdmTemporalSegmentStoreConsumerStub`(TSK-07-03 역): `MdmTemporalSegmentStore<String,String>`만 구현해 `register`/`modify`/`close`/`reopen` 네 메서드가 **컴파일**됨을 확인. 반환값은 `MdmTemporalSegmentResult`가 `action`·`value` 를 함께 담을 수 있음을 생성자 호출로 증명.
- `MaruIdNamespace`/`MASTER_DATA` 재사용 증명은 **새 스텁을 만들지 않는다** — 이미 있는 `ContractStubCompileTest.MasterDataIdNamespaceStub`(F10)가 `contract.category`의 파일을 하나도 고치지 않고 `MaruIdKind.MASTER_DATA`를 구현할 수 있음을 이미 증명하고 있으므로 그 기존 테스트를 그대로 인용한다.

### 3.5 `MdmTemporalSegmentStoreNoImplementationTest`(ArchUnit, `api/src/test`, F17)

`com.dongkuk.dmes.mdm..`(`DO_NOT_INCLUDE_TESTS`, `lib`+`api` main 양쪽이 `api` 테스트 클래스패스에서 함께 보인다) 안에 `MdmTemporalSegmentStore`를 구현하는 클래스가 없음을 확인한다("실행 로직 없음" 수용 기준의 직접 증거). 기존 ArchUnit 테스트들과 같은 패턴으로 **공허 통과 방지 음성 테스트**를 짝지어 둔다 — 고립된 `JavaClasses`(테스트 전용 샘플 `FakeSegmentStoreImpl implements MdmTemporalSegmentStore<String,String>`을 그 고립 컨텍스트 안에서만 정의)로 규칙이 실제로 위반을 잡는지 확인한다. **TSK-07-03 이 실 구현체를 `api` 모듈에 추가하는 순간 이 테스트는 뒤집힌다**(인계 사항, §5 불변 규칙 6 참고).

### 3.6 ArchUnit(기존, 자동 적용)

`MdmContractArchitectureTest`·`MdmEntityArchitectureTest`(`mdm/lib`)는 수정 없이 그대로 실행되며(F17) `contract.data`·새 엔티티 7개에 자동 적용된다.

### 3.7 브라우저 E2E

**해당 없음** — `entry-point: -`, `domain: database`(화면이 없는 계약 전용 작업). dev-discipline "화면 작업의 브라우저 E2E" 트리거(entry-point 존재 또는 domain=fullstack/frontend)에 해당하지 않는다.

---

## 4. 수용 기준 매핑

| spec 수용 기준 / 요구사항 | 검증 방법 |
|---|---|
| 실행 로직 없음(contract-only) | §3.4·§3.5(로직 없이 컴파일·구조만 확인, 신설 ArchUnit) + `MdmContractArchitectureTest` 자동 적용(F17) |
| 05 테이블 7개 Flyway 두 방언 | §3.1, §3.3 |
| 엔티티(7개, 위임자 지시) | §3.2 |
| 일시 선분 저장 코어 인터페이스 | §3.4, §6.1 |
| 카테고리·ID 이름 공간은 전사 계약 재사용 | §3.1-9(DDL CHECK ↔ `CategoryOwner`/`CategoryKind` 대조), §3.4(스텁이 `contract.category` 무변경으로 컴파일) |
| naming-dialect-rules §6.1 인계 #2·#19(05, F5·F9) | §3.3-2·3 |

---

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것 (규칙 · 변이 · 빨개지는 테스트)

1. **7테이블 전부(보류 대상 3개 포함)를 만든다** — `TB_MDM_DATA_SYSTEM`·`TB_MDM_DATA_RECV`·`TB_MDM_DATA_RECV_ITEM`을 빼지 않는다(PRD §2 규칙 7, F3). **변이**: 3테이블 제거 → §3.1-1(7테이블 생성 확인)·§3.2(엔티티 왕복)·§3.3 전부 빨개진다.
2. **선분 PK 는 `원래 키 + valid_from`이다**(F6) — `DATA_ITEM`·`DATA_CATE`·`DATA_CATE_ITEM` 세 테이블 모두. **변이**: `VALID_FROM`을 PK 에서 빼고 별도 대리키로 바꿈 → §3.1-6(같은 키·다른 VALID_FROM 공존 확인)이 빨개진다.
2-1. **경계는 `valid_from`(포함)–`valid_to`(배타)인 반개구간이다**(F6, `[T1,T2)`). 방언별 칼럼 타입은 SQLite `TEXT`(포맷 `yyyy-MM-dd HH:mm:ss`, F7·F8), MSSQL `DATETIME2(0)`(초 단위, 불변 규칙 9)이다. **변이**: 경계 비교를 `<=`/`<`가 아니라 둘 다 `<=`(폐구간)로 바꿈 → §3.1-11(경계 산술 테스트, `t=T2`일 때 0건이어야 하는데 1건이 되어) 빨개진다.
3. **열린 행의 `VALID_TO`는 `'9999-12-31 00:00:00'`이다**(F6). **변이**: 다른 센티넬(예: NULL)로 바꿈 → §3.1-7(DDL 텍스트 확인)·§3.2-4(`OPEN_END` 상수와 왕복 값 비교)가 빨개진다.
4. **`CATE_ITEM`은 `CATE_ID`·`CODE`에 FK 를 걸지 않는다**(F13, 선분 때문에 앱이 검사한다). **변이**: FK 를 추가 → §3.1-5·§3.3-8(존재하지 않는 조합 INSERT 가 더 이상 성공하지 못함)이 빨개진다.
5. **`TB_MDM_DATA_ITEM.ROW_VERSION`은 `@Version`으로 매핑하지 않는다**(F9). **변이**: `@Version`으로 바꿈 → §3.2(더티 업데이트 후 `rowVersion` 불변·`VER`과 독립 확인)가 빨개진다.
6. **`contract.data.MdmTemporalSegmentStore`의 `src/main` 구현체를 이 Task 에 넣지 않는다**(TSK-07-03 몫). **변이**: 실 구현체를 `api` 또는 `lib` main 에 추가 → §3.5(ArchUnit `노_구현체_테스트`)가 빨개진다.
7. **`contract/category/*` 파일을 고치지 않는다**(F10, 카테고리·ID 이름공간은 재사용만). **알려진 커버리지 갭**: 이 규칙을 어겨 그 패키지 파일을 몰래 고쳐도 이를 직접 잡는 테스트는 없다(공유 계약이라 이 Task 의 ArchUnit 대상이 아니다) — Build·Verify 가 `/usr/bin/git diff --name-only`로 그 패키지 경로 변경 여부만 확인할 수 있다는 점을 보고에 남긴다.
8. **일시 칼럼(`VALID_FROM`·`VALID_TO`·`CLOSED_AT`·`RECEIVED_AT`·`PROCESSED_AT`)은 SQLite 에 `TEXT`(포맷 `yyyy-MM-dd HH:mm:ss`, 소수초 없음)로 저장돼야 한다**(F7·F8, `MdmSqliteTemporalConverterContributor`가 이를 강제한다) — `typeof()` 단정(§3.2)이 이를 직접 증명한다. **변이**: `application-local.yml`의 `metadata_builder_contributor` 등록을 빼거나 컨버터의 출력 포맷에 소수초(`.SSS`)를 남김 → §3.2(F7·F8 단정)가 빨개진다.
9. **경계 시각은 초 단위로 절삭해 다룬다**(MSSQL `DATETIME2(0)` 정밀도, TSK-07-03 인계). **변이**: 밀리초·나노초가 남은 `LocalDateTime`을 PK 값으로 저장 → MSSQL `DATETIME2(0)` 반올림으로 SQLite 와 다른 값이 되어 §3.3-5(SQLite·MSSQL 논리적 동치 확인)가 빨개진다(왕복 테스트가 초 단위 값만 쓰므로 이 변이는 테스트 픽스처 자체를 바꿔야 재현된다 — Build 가 픽스처에 나노초 있는 값을 한 번 추가해 이 규칙을 실측하길 권장한다).
10. **SQLite `VER` 칼럼은 7테이블 전부 `BIGINT`로 선언한다**(F15, ERD 초안의 `INTEGER`가 아니다). **변이**: `INTEGER`로 되돌림 → §3.1-8(DDL 텍스트 확인)이 빨개진다.
11. **`CK_TB_MDM_DATA_CATE_TARGET`(F18)의 허용값 집합은 `CategoryOwner.MASTER_DATA.allowedDefTargets()`와 정확히 같다**(`CODE`를 포함하지 않는다). **변이**: CHECK 목록에 `'CODE'`를 끼워 넣음 → §3.1-9(리플렉션 대조)가 빨개진다.
12. **두 방언의 Flyway V 번호 집합은 항상 같다**(`{"1","2","3","4","7"}`). **변이**: 한쪽에만 V7 추가 → `MdmFlywayVersionParityTest`(기존, F2 확인상 이 Task 수정 없이도 이미 이 불변식을 검사한다)가 빨개진다.
13. **예약어 칼럼(`RESULT`·`ACTION`)은 방언별 인용 문자로 DDL 을 쓰고 엔티티는 방언-중립 백틱으로 인용한다**(naming-dialect-rules §1, TSK-05-01 D1 선례). **변이**: 인용을 제거 → **알려진 커버리지 갭**: TSK-05-01 D-047 실측대로 SQLite community dialect·MSSQL dialect 모두 이 정도 이름을 예약어로 취급하지 않을 가능성이 높다(둘 다 SQL-99 예약어이지 방언 고유 예약어가 아닐 수 있다). Build 가 실제로 변이를 넣어 §3.1·§3.3 이 빨개지는지 반드시 실측하고, 안 빨개지면 은폐하지 않고 보고한다.

---

## 6. 결정 상세

### 6.0 테이블 설계 (Build 가 그대로 옮길 최종 칼럼표)

DDL 은 TSK-02-03 ERD(`erd/05-master-data.{sqlite,mssql}.sql`, F14)를 1차 텍스트로 삼고, F15(SQLite `VER BIGINT`)·F18(`CK_TB_MDM_DATA_CATE_TARGET` 추가) 두 지점만 갈라 적용한다. 그 외 칼럼·제약·콜레이션·기본값은 ERD 그대로 옮긴다. 타입 토큰은 `docs/mdm/tasks/TSK-02-03/design.md` §6.0 을 그대로 인용한다: `CD20`=SQLite`VARCHAR(20)`/MSSQL`VARCHAR(20) COLLATE Latin1_General_100_BIN2`, `CD50`=`VARCHAR(50)`/`VARCHAR(50) COLLATE BIN2`, `NM100`=`TEXT`/`NVARCHAR(100)`, `TXT`=`TEXT`/`NVARCHAR(MAX)`, `TXT_A`=`TEXT`/`VARCHAR(MAX)`, `INT4`=`INTEGER`/`INT`, `BIGI`=`INTEGER`/`BIGINT`(단, 감사 `VER`은 SQLite 도 리터럴 `BIGINT`로 쓴다, F15), `DTS`=`TEXT('YYYY-MM-DD HH:MM:SS')`/`DATETIME2(0)`, `ATTR500`=`TEXT`/`NVARCHAR(500)`, `ID_AI`=`INTEGER PRIMARY KEY AUTOINCREMENT`/`BIGINT IDENTITY(1,1)`.

**TB_MDM_DATA** — PK `PK_TB_MDM_DATA`(MARU_DATA_ID) · FK `FK_TB_MDM_DATA_SYSTEM_SRC`(SOURCE_SYSTEM→TB_MDM_SYSTEM, F5) · CK `CK_TB_MDM_DATA_STATUS` IN('INUSE','DEPRECATED'), `CK_TB_MDM_DATA_SRC_KIND` IN('MDM','EXTERNAL'), `CK_TB_MDM_DATA_SRC_SYS`(EXTERNAL↔SOURCE_SYSTEM NOT NULL 쌍), `CK_TB_MDM_DATA_LVL_CNT`(0-5)

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| MARU_DATA_ID | CD50 | NOT NULL(PK) | - |
| MARU_DATA_NAME | NM100 | NOT NULL | - |
| STATUS | CD20 | NOT NULL | 'INUSE' |
| SOURCE_KIND | CD20 | NOT NULL | - |
| SOURCE_SYSTEM | CD20(FK) | NULL | - |
| CODE_PATTERN | TXT_A | NOT NULL | `'^[0-9A-Z]{1,20}$'` |
| DESCRIPTION | TXT | NULL | - |
| ATTR01_NAME..ATTR10_NAME | NM100 ×10 | NULL | - |
| LVL_CNT | INT4 | NOT NULL | 0 |
| CLOSED_AT | DTS | NULL | - |
| LAST_CHG_SEQ | BIGI | NOT NULL | 0 |
| CHG_SEQ | BIGI | NOT NULL | 0 |

`+AUDIT9`(VER 는 SQLite 도 `BIGINT`, F15)

**TB_MDM_DATA_SYSTEM**(보류, F3·F4 — DDL·엔티티는 만들되 서비스·화면은 없음) — PK `PK_TB_MDM_DATA_SYSTEM`(MARU_DATA_ID,SYSTEM_CODE) · FK `FK_TB_MDM_DATA_SYSTEM_DATA`(→DATA), `FK_TB_MDM_DATA_SYSTEM_SYSTEM`(→SYSTEM, F5)

| 칼럼 | 타입 | NULL |
|---|---|---|
| MARU_DATA_ID | CD50(FK) | NOT NULL(PK) |
| SYSTEM_CODE | CD20(FK) | NOT NULL(PK) |
| DESCRIPTION | TXT | NULL |

`+AUDIT9`

**TB_MDM_DATA_ITEM** — PK `PK_TB_MDM_DATA_ITEM`(MARU_DATA_ID,CODE,VALID_FROM) · FK `FK_TB_MDM_DATA_ITEM_DATA`(→DATA) · IX `IX_TB_MDM_DATA_ITEM_NAME`(MARU_DATA_ID,NAME)

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| MARU_DATA_ID | CD50(FK) | NOT NULL(PK) | - |
| CODE | CD50 | NOT NULL(PK) | - |
| VALID_FROM | DTS | NOT NULL(PK) | - |
| NAME | NM100 | NOT NULL | - |
| ALTER_NAME | NM100 | NULL | - |
| SEQ | INT4 | NULL | - |
| DESCRIPTION | TXT | NULL | - |
| VALID_TO | DTS | NOT NULL | `'9999-12-31 00:00:00'` |
| ROW_VERSION | INT4 | NOT NULL | 0 |
| CHG_SEQ | BIGI | NOT NULL | 0 |
| LVL1..LVL5 | CD50 ×5 | NULL | - |
| ATTR01..ATTR10 | ATTR500 ×10 | NULL | - |

`+AUDIT9`

**TB_MDM_DATA_CATE** — PK `PK_TB_MDM_DATA_CATE`(MARU_DATA_ID,CATE_ID,VALID_FROM) · FK `FK_TB_MDM_DATA_CATE_DATA`(→DATA) · CK `CK_TB_MDM_DATA_CATE_KIND` IN('REGEX','TABLE'), `CK_TB_MDM_DATA_CATE_DEF`(조건부 NOT NULL 쌍), **`CK_TB_MDM_DATA_CATE_TARGET`(F18 신설)** `DEF_TARGET IS NULL OR DEF_TARGET IN ('KEY','LVL1','LVL2','LVL3','LVL4','LVL5','ATTR01','ATTR02','ATTR03','ATTR04','ATTR05','ATTR06','ATTR07','ATTR08','ATTR09','ATTR10')`

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| MARU_DATA_ID | CD50(FK) | NOT NULL(PK) | - |
| CATE_ID | CD50 | NOT NULL(PK) | - |
| VALID_FROM | DTS | NOT NULL(PK) | - |
| CATE_NAME | NM100 | NULL | - |
| DEF_KIND | CD20 | NOT NULL | - |
| DEF_EXPR | TXT_A | NULL | - |
| DEF_TARGET | CD20 | NULL | - |
| DESCRIPTION | TXT | NULL | - |
| VALID_TO | DTS | NOT NULL | `'9999-12-31 00:00:00'` |
| CHG_SEQ | BIGI | NOT NULL | 0 |

`+AUDIT9`

**TB_MDM_DATA_CATE_ITEM**(F13, FK 없음 대상) — PK `PK_TB_MDM_DATA_CATE_ITEM`(MARU_DATA_ID,CATE_ID,CODE,VALID_FROM) · FK `FK_TB_MDM_DATA_CATE_ITEM_DATA`(→DATA)만 — CATE_ID·CODE 는 FK 없음

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| MARU_DATA_ID | CD50(FK) | NOT NULL(PK) | - |
| CATE_ID | CD50 | NOT NULL(PK) | - |
| CODE | CD50 | NOT NULL(PK) | - |
| VALID_FROM | DTS | NOT NULL(PK) | - |
| VALID_TO | DTS | NOT NULL | `'9999-12-31 00:00:00'` |
| CHG_SEQ | BIGI | NOT NULL | 0 |

`+AUDIT9`

**TB_MDM_DATA_RECV**(보류, F3·F4) — PK `PK_TB_MDM_DATA_RECV`(RECV_ID, `ID_AI`) · FK `FK_TB_MDM_DATA_RECV_DATA`(→DATA), `FK_TB_MDM_DATA_RECV_SYSTEM`(→SYSTEM, F5) · CK `CK_TB_MDM_DATA_RECV_RESULT`(`"RESULT"`/`[RESULT]` IS NULL OR IN('OK','REJECTED','FAILED'))

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| RECV_ID | ID_AI | NOT NULL(PK) | - |
| MARU_DATA_ID | CD50(FK) | NULL | - |
| SOURCE_SYSTEM | CD20(FK) | NOT NULL | - |
| SOURCE_REF | CD50 | NULL | - |
| RECEIVED_AT | DTS | NOT NULL | - |
| BODY | TXT | NOT NULL | - |
| ROW_COUNT | INT4 | NOT NULL | 0 |
| `"RESULT"`/`[RESULT]` | CD20 | NULL | - |
| RESULT_DETAIL | TXT | NULL | - |
| CHG_SEQ | BIGI | NULL | - |
| PROCESSED_AT | DTS | NULL | - |

`+AUDIT9`. `BODY`에는 JSON 유효성 CHECK 를 걸지 않는다(05 「수신 로그」 1단계는 형식 검사 전에 원문을 그대로 커밋하므로, 형식 오류 요청도 RECV 행으로 남아야 한다 — naming-dialect-rules §3 #3 의 JSON CHECK 패턴을 이 칼럼에는 적용하지 않는다).

**TB_MDM_DATA_RECV_ITEM**(보류, F3·F4) — PK `PK_TB_MDM_DATA_RECV_ITEM`(RECV_ID,SEQ) · FK `FK_TB_MDM_DATA_RECV_ITEM_RECV`(→RECV) · CK `CK_TB_MDM_DATA_RECV_ITEM_ACTION`(`"ACTION"`/`[ACTION]` IS NULL OR IN('INSERT','UPDATE','CLOSE','REOPEN','NONE'))

| 칼럼 | 타입 | NULL |
|---|---|---|
| RECV_ID | BIGINT(FK) | NOT NULL(PK) |
| SEQ | INT4 | NOT NULL(PK) |
| CODE | CD50 | NULL |
| `"ACTION"`/`[ACTION]` | CD20 | NULL |

`+AUDIT9`

**MSSQL 파일 순서**: 순환 FK 가 없으므로(§1) `TB_MDM_DATA` → `TB_MDM_DATA_SYSTEM` → `TB_MDM_DATA_ITEM` → `TB_MDM_DATA_CATE` → `TB_MDM_DATA_CATE_ITEM` → `TB_MDM_DATA_RECV` → `TB_MDM_DATA_RECV_ITEM` 순서로 전부 인라인 FK 를 걸면 된다(TSK-05-01 §6.6 류의 후행 ALTER 불필요). SQLite 도 같은 순서.

### 6.1 계약 record/enum/interface/상수 (`com.dongkuk.dmes.mdm.contract.data`)

패키지 규칙(F17, 05 자신의 관례)을 그대로 따른다 — 인터페이스는 추상 메서드만, record 는 접근자만, 외부 의존은 `java.*`만(엔티티·JPA·Spring 비의존, `MdmContractArchitectureTest`가 강제).

```java
/** 일시 선분 경계 규칙 — 05 「선분과 닫기」(design/basic/05-master-data.md:220-236). */
public final class MdmTemporalSegmentRules {
    /** 열린 행의 valid_to 센티넬. */
    public static final java.time.LocalDateTime OPEN_END = java.time.LocalDateTime.of(9999, 12, 31, 0, 0, 0);
    private MdmTemporalSegmentRules() {}
}

/** 일시 선분 저장 행위 — TB_MDM_DATA_RECV_ITEM.ACTION CHECK 목록과 이름이 같다(05:213,697). */
public enum MdmTemporalSegmentAction { INSERT, UPDATE, CLOSE, REOPEN, NONE }

/** 일시 선분 저장 결과. value 는 바뀐 뒤의 값(NONE 이면 호출 전 값 그대로 돌려줘도 된다 — 계약은 강제하지 않는다). */
public record MdmTemporalSegmentResult<V>(MdmTemporalSegmentAction action, V value) {}

/**
 * 일시 선분 저장 코어 SPI — 항목(TB_MDM_DATA_ITEM)·카테고리(TB_MDM_DATA_CATE)·소속(TB_MDM_DATA_CATE_ITEM)
 * 공통(05 「선분과 닫기」). 05:230-233 의 네 연산 그대로다. 구현은 이 Task 밖(TSK-07-03).
 * @param <K> 키(예: maru_data_id+code)
 * @param <V> 값(그 시점의 업무 필드 스냅샷)
 */
public interface MdmTemporalSegmentStore<K, V> {

    /** 등록 — 새 행 하나, valid_from = at(05:230). 키가 이미 있으면(닫힌 키 포함) 거부하고 "다시 열기"를 안내한다
     *  (05:186 검사 순서 6, 05:245 "닫힌 키로는 새로 등록할 수 없다. 다시 연다" — 거부 판정 자체는 이 Task 밖). */
    MdmTemporalSegmentResult<V> register(K key, V value, java.time.LocalDateTime at);

    /** 수정 — 열린 행의 valid_to 를 at 으로 닫고, 같은 at 을 valid_from 으로 하는 새 행을 만든다(05:231).
     *  값이 현재 값과 같으면 아무 행도 만들지 않고 NONE 을 돌린다(05 「값이 같은 행」). */
    MdmTemporalSegmentResult<V> modify(K key, V value, java.time.LocalDateTime at);

    /** 닫기 — 열린 행의 valid_to 를 at 으로 적는다. 새 행은 없다(05:232). */
    MdmTemporalSegmentResult<V> close(K key, java.time.LocalDateTime at);

    /** 다시 열기 — 마지막 행의 값을 복사한 새 행, valid_from = at(05:233). */
    MdmTemporalSegmentResult<V> reopen(K key, java.time.LocalDateTime at);
}
```

저장 시각은 매 연산 인자 `at`으로 명시적으로 받는다(naming-dialect-rules §3 #16 "현재 시각은 애플리케이션이 파라미터로 넘긴다"·TSK-05-01 D8 과 같은 원칙 — 구현이 시계를 직접 읽지 않는다).

---

## 담당자 확인 필요 결정

### D1 — `MdmTemporalSegmentStore`의 정확한 메서드 시그니처(제네릭 `<K,V>` 방식 채택 여부)
- **질문**: 05 문서 어디에도 "일시 선분 저장 코어"의 Java API 모양을 정하지 않았다(테이블 설계·검사 순서·선분 규칙만 있다). 이 Task 는 인터페이스만 두므로 정확한 시그니처를 지금 확정해야 하는가, TSK-07-03 에 완전히 미룰 것인가.
- **선택지**: (1) §6.1 처럼 제네릭 `<K,V>` 네 메서드(register/modify/close/reopen) 인터페이스 하나로 항목·카테고리·소속 세 테이블을 공통 표현. (2) 단일 메서드 `apply(SegmentCommand<K,V>)`로 네 행위를 한 데 모으고 `MdmTemporalSegmentAction`으로 분기(더 작은 계약 표면, 그러나 "무엇을 저장하는지"가 커맨드 레코드 안에 숨는다). (3) 이 Task 는 `OPEN_END` 상수와 `MdmTemporalSegmentAction` enum 만 두고 인터페이스 자체는 TSK-07-03 이 처음 정의하게 미룬다(계약 표면 최소화, 그러나 spec 요구사항 "저장 코어 인터페이스"를 이 Task 가 충족하지 못할 위험).
- **택한 것**: (1).
- **근거**: spec 요구사항이 "일시 선분 저장 코어 **인터페이스**"라고 명시해 이 Task 가 인터페이스 자체를 내놓아야 한다(선택지 3 배제). 05 문서가 선분 연산을 등록·수정·닫기·다시 열기 네 개로 명확히 이름 붙였고(F6), 기존 계약 인터페이스 선례(`MdmLayoutSerializer`/`MdmLayoutParser`, TSK-05-01)도 "구체적으로 이름 붙인 메서드" 스타일을 따른다 — 선택지 2 의 커맨드-패턴은 이 리포에 선례가 없다. 세 테이블(ITEM·CATE·CATE_ITEM)이 구조는 다르지만(키 구성·값 필드 수) 선분 생애주기는 동일하므로 제네릭 하나로 묶는 쪽이 "같은 개념 하나"임을 코드로도 보여준다. **근거 강도: 중**(연산 이름은 05 원문 직접 근거이나, 제네릭 vs 커맨드 선택 자체는 이 Task 의 설계 판단이다).
- **반려 시 재작업**: 선택지 2 로 바꾸려면 `MdmTemporalSegmentStore`를 `apply(SegmentCommand<K,V>)` 단일 메서드로 줄이고 `SegmentCommand`(action, key, value, at) record 를 추가한다 — 스텁(§3.4)·ArchUnit 테스트(§3.5)는 새 시그니처에 맞춰 다시 쓴다. 선택지 3 이면 인터페이스 자체를 빼고 상수·enum 만 남긴다(수용 기준 재검토 필요).
