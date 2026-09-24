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
| F1 | **팀장 배정 V7.** V5·V6 이 아직 없어도 V7 을 쓴다(팀장 지시). Flyway 파일은 두 방언 모두 `V7__create_mdm_master_data.sql`(위치 `src/backend/mdm/api/src/main/resources/db/migration/mdm/{sqlite,mssql}/`). 현재 dev 는 V1(baseline)·V2(`TB_MDM_SYSTEM`)·V3(02 용어·도메인·컬럼)·V4(03 인터페이스 레이아웃)까지다. **위험**: V5·V6 없이 V7 이 적용된 영속 DB 는, 나중에 V5 가 들어오면 Flyway 기본값 `outOfOrder=false` 때문에 `validate` 단계에서 실패한다 — 이 순서 문제는 팀장이 머지 때 처리하므로 **이 Task 는 Flyway 설정(`outOfOrder` 등)을 건드리지 않는다** | 팀장 지시, `find .../db/migration/mdm/{sqlite,mssql}` 직접 확인 |
| F2 | **Flyway 버전 하드코딩 단정 테스트 4개**가 V7 추가로 깨진다(Explore 서브에이전트 실측): `MdmSharedContractMigrationTest`(sqlite, `assertEquals(Set.of("1","2","3","4"), versions)` 64·75행), `MdmMssqlMigrationTest`(mssql, `migrationsExecuted==4`·`targetSchemaVersion=="4"`·`Set.of("1","2","3","4")` 78·81·82·91행), `MdmInterfaceLayoutMssqlMigrationTest`(mssql, 82·91행), `MdmTermDomainColumnMssqlMigrationTest`(mssql, 87·96행) — 넷 다 `assertEquals(Set, Set)` **완전 일치** 비교라 V7 이 집합에 더해지면 실패한다. **`MdmFlywayVersionParityTest` 는 `containsAll(Set.of("1","2"))`만 보는 부분집합 검사라 수정 불필요**(V7 이 sqlite·mssql 양쪽에 같이 있기만 하면 통과) | Explore 서브에이전트 실측(파일:라인 인용) |
| F3 | **PRD §2 규칙 7 이 배포 순번·수신 로그 칼럼/표를 DDL 에 넣으라고 명시한다**: "DDL 은 원천 설계 그대로 만든다. 배포 대상 표(`*_SYSTEM`)... 배포 순번 칸·표(`chg_seq`, `last_chg_seq`)... 수신 로그 표(`*_RECV`)는 만들되 이번 범위의 코드는 쓰지 않는다. 동작과 화면만 뺀다." → 7테이블 전부(`TB_MDM_DATA_SYSTEM`·`TB_MDM_DATA_RECV`·`TB_MDM_DATA_RECV_ITEM` 포함)를 DDL 로 만드는 근거가 spec 데이터모델 절보다도 위인 PRD 원문에 있다 | `PRD.md:62` |
| F4 | **`decisions.md` D-019 는 "보류 테이블(배포 대상·배포 순번·수신 로그)은 DDL-only — 엔티티·리포지토리·서비스·BPMN·화면 없음"과 "활성 테이블 배포 칸(`CHG_SEQ`·`LAST_CHG_SEQ`)은 DEFAULT 0·엔티티 미매핑"이라고 정했다(두 조항).** **spec 본문**(요구사항: "05 테이블 7개 Flyway 두 방언, **엔티티**" — `spec.md:8`)이 "테이블 7개"와 "엔티티"를 한 문장에 나란히 적어, 문언상 "엔티티"가 보류 3테이블(`DATA_SYSTEM`·`DATA_RECV`·`DATA_RECV_ITEM`)까지 포함하는 7개를 가리키는 것으로 읽을 수 있다 — 다만 숫자를 "엔티티"에 직접 붙이지 않아 **문언이 모호하다**(활성 4테이블만 가리킬 여지도 있다). 이는 D-019 첫 조항과 충돌할 수 있다. 이 모호성 판단은 **D2 로 남긴다**(담당자 확인 필요 결정). D2 에서 spec 문언을 "7개 전부"로 읽기로 택했고(반려 시 재작업 경로는 D2 참고), 그 전제 위에서 **리포지토리는 활성 4테이블(`DATA`·`DATA_ITEM`·`DATA_CATE`·`DATA_CATE_ITEM`)에만 만든다** — spec 이 명시적으로 요구한 것은 "엔티티"뿐이고 리포지토리는 언급하지 않았으므로, 지시가 없는 부분은 D-019 원칙(보류 테이블엔 리포지토리를 두지 않는다)을 그대로 따른다. D-019 의 "엔티티 없음"은 배포·수신 **로직**을 위한 엔티티(서비스가 실제로 읽고 쓰는 것)를 만들지 않는다는 취지였는데, 이 Task 는 애초에 로직을 넣지 않으므로(수용 기준 "실행 로직 없음") 엔티티 존재 자체가 D-019 가 막으려던 위험(때 이른 로직 결합)을 일으키지 않는다. **둘째 조항("배포 칸 엔티티 미매핑")은 실제 코드와 어긋난다** — `MdmUnit.java`(TSK-04-01 산출, dev 머지)가 `CHG_SEQ`를 이미 plain `long chgSeq` 필드로 매핑하고 있다(직접 확인). 문서(D-019)보다 실제로 동작 중인 코드 관례가 더 강한 증거이므로, 이 Task 도 `CHG_SEQ`·`LAST_CHG_SEQ`를 `MdmUnit` 과 같은 방식(plain `long` 필드)으로 매핑한다 — **이 둘째 판단은 D-항목으로 올리지 않는다**: 실제 dev 에 머지된 코드가 D-019 문서 문구와 직접 어긋나는 명백한 사실이라 "기본값이 없는 결정"이 아니다(모호한 문언 해석이 필요한 첫 조항과 성격이 다르다) | `spec.md:8`(요구사항 원문), `decisions.md` D-019, `MdmUnit.java:36-37,51,57`(`chgSeq` 매핑 직접 확인) |
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
| F20 | **[갱신] 도커를 띄우는 모든 검증이 금지됐다(사용자 결정, 오케스트레이터 추가 지시).** Design Phase 국한이 아니라 **기준선·Build·Verify 어디에서도** `mssqlMigrationTest`·Testcontainers·docker 명령을 실행하지 않는다. 기준선은 `testAll` 1878/0 하나뿐이다(mssql 기준선 측정 자체가 없어졌다). MSSQL 방언 정확성은 (1) SQLite 쪽 §3.1·§3.2 가 testAll 로 통과하는 것과 (2) §3.3′-A(자동화 텍스트 비교, DB 불필요, testAll 포함)·§3.3′-B(사람 DDL 리뷰 체크리스트)로 대신한다. 이 design.md 의 MSSQL 관련 결정(F5·F16 등)도 코드·문서 정적 대조로만 확인했다(TSK-02-03 F4 와 같은 처지). `docker`·`OrbStack`·`Testcontainers` 를 쓰는 명령이나 설정 파일 변경으로 우회하지 않는다 | 팀장 지시, TSK-02-03 F4 |
| F21 | **MSSQL 테스트 파일(`MdmMasterDataMssqlMigrationTest.java`)은 작성하되 실행하지 않는다.** `compileMssqlTestJava`(컴파일 전용, docker 불필요)로 컴파일만 확인하고 `:api:mssqlMigrationTest`(Testcontainers 실행)는 호출하지 않는다 — 도커 금지 정책이 바뀌면 즉시 쓸 수 있게 남겨 둔다. 이미 dev 에 있는 3개 기존 mssqlTest 파일(`MdmMssqlMigrationTest`·`MdmInterfaceLayoutMssqlMigrationTest`·`MdmTermDomainColumnMssqlMigrationTest`)의 V7 버전 집합 수정(F2)도 같은 방식 — 텍스트 수정은 하되(V7 이 머지되면 어차피 필요한 정정) 컴파일 확인만 하고 실행은 하지 않는다. **테스트 파일 추가·수정은 컴파일 유지 목적일 뿐, 게이트·수용 기준 근거로 쓰지 않는다**(§3.3′ 로 대체) | 팀장 지시 |

---

## 1. 접근 방식

05 원장 7테이블(`TB_MDM_DATA`·`DATA_SYSTEM`·`DATA_ITEM`·`DATA_CATE`·`DATA_CATE_ITEM`·`DATA_RECV`·`DATA_RECV_ITEM`)의 **Flyway V7**(두 방언, F1)을 새로 작성한다. 모든 FK 는 `TB_MDM_DATA`(이 파일이 먼저 만든다) 또는 이미 존재하는 `TB_MDM_SYSTEM`(V2, F5)만 가리키므로 TSK-05-01 의 03 영역과 달리 **순환 FK 가 없다** — 두 방언 모두 단순 순서(DATA → DATA_SYSTEM → DATA_ITEM → DATA_CATE → DATA_CATE_ITEM → DATA_RECV → DATA_RECV_ITEM)로 인라인 FK 를 걸면 된다. DDL 은 TSK-02-03 ERD 초안(`erd/05-master-data.{sqlite,mssql}.sql`)을 1차 텍스트로 삼되 F15(SQLite `VER BIGINT` 정정)·F18(`DEF_TARGET` CHECK 추가) 두 지점만 갈라 적용한다.

7개 엔티티 전부를 `lib/entity` 평면 패키지에 두고(spec 본문 요구사항, F4), 복합 PK 테이블(`DATA_SYSTEM`·`DATA_ITEM`·`DATA_CATE`·`DATA_CATE_ITEM`·`DATA_RECV_ITEM`, 5개)은 `MdmColumnSystem`/`MdmLayoutItem` 선례(`@IdClass`, `Serializable`)를 따른다. 감사 9칼럼은 `CactusAuditEntity` 상속으로 얻는다. FK 칼럼은 전부 원시 필드(`@ManyToOne` 금지, 불변 규칙). 낙관적 잠금 칼럼 `ROW_VERSION`(`TB_MDM_DATA_ITEM`)은 `@Version` 이 아닌 plain `int` 필드로 매핑한다(F9) — PK 가 바뀌는 "수정"(닫기+새 행) 모델과 JPA `@Version` 의미론이 맞지 않기 때문이다.

계약(contract-only) 부분은 새 서브패키지 `com.dongkuk.dmes.mdm.contract.data`(TSK-05-01 의 `contract.layout` 과 대칭되는 영역별 명명)에 로직 없는 상수 클래스(`MdmTemporalSegmentRules`, 열린 끝 센티넬)·enum(`MdmTemporalSegmentAction`)·record(`MdmTemporalSegmentResult`)·interface(`MdmTemporalSegmentStore`, 추상 메서드만)를 선언한다 — 항목·카테고리·소속 세 테이블이 공유하는 "일시 선분 저장 코어"를 제네릭 SPI 하나로 표현한다(§6.1). 카테고리·ID 이름공간은 **전사 계약을 재사용만** 한다(F10) — `contract.category` 의 어떤 파일도 고치지 않고, DDL·테스트가 그 계약의 값(enum 이름·허용 target 집합)과 정확히 같은지 대조하는 방식으로 "재사용"을 증명한다(F11·F18).

기존 ArchUnit 테스트(`MdmContractArchitectureTest`·`MdmEntityArchitectureTest`, `mdm/lib`)는 패키지 접두사 전체를 스캔하므로 새 서브패키지·엔티티에 수정 없이 자동 적용된다(F17). 다만 "저장 코어 인터페이스의 실 구현체가 `src/main` 에 없다"는 이 Task 만의 수용 기준("실행 로직 없음")을 증명하려면 `lib`+`api` 양쪽 main 클래스를 함께 스캔하는 **새** ArchUnit 테스트가 필요하고, 이는 `api/src/test`에 두며 `api/build.gradle` 에 archunit 의존성을 새로 추가한다(F17).

이 Task 는 일시 `LocalDateTime` 칼럼을 mdm 에서 처음 매핑하므로(F7·F8), mcm 의 알려진 SQLite temporal 라운드트립 결함 선례를 그대로 재현하지 않도록 **mdm 전용 SQLite 컨버터를 처음부터 함께 만든다**(F8) — "실측해 보고 깨지면 고친다"가 아니라 "이미 알려진 결함을 선제적으로 우회한다." Build 는 §3.2 의 `typeof()` 단정 테스트로 그 결과를 실제로 검증한다. 경계 시각의 반개구간 규칙(F6)과 방언별 정밀도(MSSQL `DATETIME2(0)`, 초 단위)는 §5 불변 규칙에 직접 명시하고, 네이티브 SQL 경계 질의 테스트(§3.1)로 검증한다.

**사용자 결정: 도커 금지로 MSSQL 실측 생략, DDL 리뷰로 대체**(F20 — 담당자 확인 필요 결정 절이 아니라 이미 정해진 사항으로 여기 기록한다).

---

## 2. 변경 파일 목록

### 생성

- `src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V7__create_mdm_master_data.sql`
- `src/backend/mdm/api/src/main/resources/db/migration/mdm/mssql/V7__create_mdm_master_data.sql`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmData.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmDataSystem.java`(복합 PK, F4 — spec 본문 요구사항대로 보류 테이블도 엔티티를 만든다)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmDataSystemId.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmDataItem.java`(`ROW_VERSION` → plain `int rowVersion`, F9)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmDataItemId.java`(필드 `maruDataId`·`code`·`validFrom`)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmDataCate.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmDataCateId.java`(필드 `maruDataId`·`cateId`·`validFrom`)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmDataCateItem.java`(F13 — `CATE_ID`·`CODE` FK 없음, 원시 필드만)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmDataCateItemId.java`(필드 `maruDataId`·`cateId`·`code`·`validFrom`)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmDataRecv.java`(F4 — 보류 테이블도 엔티티 생성, spec 본문 요구사항)
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
- `src/backend/mdm/api/src/mssqlTest/java/com/dongkuk/dmes/mdm/MdmMasterDataMssqlMigrationTest.java`(MSSQL, `@SpringBootTest`+`local-db`, §3.3′-B — 작성·컴파일만, 실행하지 않는다, F21)
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmMasterDataDdlParityTest.java`(자동화, SQLite/DB 불필요, `testAll` 포함, §3.3′-A)

### 수정

- `src/backend/mdm/api/build.gradle` — `dependencies` 블록에 `testImplementation 'com.tngtech.archunit:archunit-junit5:1.3.0'` 추가(F17, 현재 미선언 확인됨)
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmSharedContractMigrationTest.java` — `Set.of("1","2","3","4")` → `Set.of("1","2","3","4","7")`, 메서드명 `flyway_가_V1_V2_V3_V4_를_적용했다()`(64행) → `flyway_가_V1_V2_V3_V4_V7_를_적용했다()`. **새 버전(V7) 반영이지 기대값 완화가 아니다**(F2)
- `src/backend/mdm/api/src/mssqlTest/java/com/dongkuk/dmes/mdm/MdmMssqlMigrationTest.java` — `migrationsExecuted==4`→`5`, `targetSchemaVersion=="4"`→`"7"`, `Set.of("1","2","3","4")`→`Set.of("1","2","3","4","7")`, 메서드명 `..._V1_V2_V3_V4_가_적용된다()`(78행) → `..._V1_V2_V3_V4_V7_가_적용된다()`(F2, 새 버전 반영)
- `src/backend/mdm/api/src/mssqlTest/java/com/dongkuk/dmes/mdm/MdmInterfaceLayoutMssqlMigrationTest.java` — `Set.of("1","2","3","4")`→`+"7"`(82·91행), 메서드명에 `_V7_` 추가(F2)
- `src/backend/mdm/api/src/mssqlTest/java/com/dongkuk/dmes/mdm/MdmTermDomainColumnMssqlMigrationTest.java` — `Set.of("1","2","3","4")`→`+"7"`(87·96행), 메서드명에 `_V7_` 추가(F2)

**위 3개 mssqlTest 파일 수정과 신규 `MdmMasterDataMssqlMigrationTest.java`(§2 생성) 공통 사항(F20·F21)**: 텍스트 수정은 하되(V7 이 dev 에 머지되면 어차피 필요한 정정이다), `:api:compileMssqlTestJava`(컴파일 전용, docker 불필요)로 컴파일만 확인한다. `:api:mssqlMigrationTest`(Testcontainers 실행)는 기준선·Build·Verify 어디에서도 호출하지 않는다.
- `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/ContractStubCompileTest.java` — `MdmTemporalSegmentStoreConsumerStub`을 예시하는 `@Test` 메서드 1개 추가(기존 파일이 계약 스텁 컴파일 검증의 단일 진입점이라 TSK-05-01 선례를 따른다). `MaruIdNamespace`/`MASTER_DATA` 재사용 증명은 이미 있는 `MasterDataIdNamespaceStub` 케이스를 인용만 하고 새로 추가하지 않는다(F10)
- `src/backend/mdm/api/src/main/resources/application-local.yml` — `spring.jpa.properties.hibernate.metadata_builder_contributor: com.dongkuk.dmes.mdm.persistence.MdmSqliteTemporalConverterContributor` 추가(F8, SQLite 전용 프로파일 파일이라 MSSQL 에는 영향 없음)
- `docs/mdm/naming-dialect-rules.md` — §3 #16(업무 LocalDateTime) 행은 **SQLite 쪽만** 이 Task 실측 결과로 갱신 가능하다(F7, §3.2 가 도커 없이 실행되므로 — Build 완료 시 "확인(TSK-07-01 실측, SQLite)"으로). §3 #2(recv_id AUTOINCREMENT)·#19(BIN2 대소문자 구분)의 05 해당분은 **"확인"으로 닫지 않는다**(F20·F21) — 정적 DDL 텍스트 확인만 했다는 문구를 추가하고 "실측 필요"는 그대로 남긴다(도커 정책이 바뀌면 §3.3′-B 의 작성해 둔 MSSQL 테스트 파일로 닫을 수 있다는 인계도 남긴다). §6.1 인계 표의 "TSK-07-01(05)" 행은 완료로 표시하지 않는다 — **Build 가 실제 테스트 결과를 확인한 뒤에 이 파일을 고친다**(Design 은 무엇을 어떻게 고칠지만 예고한다)
- `docs/mdm/decisions.md` — Build 완료 시 D1(저장 코어 인터페이스 시그니처, 이 design.md 확정분을 그대로 append)과, SQLite LocalDateTime 컨버터(F8) 실측 결과를 새 번호로 append(Build 시점 작업, 이 design.md 가 무엇을 append 할지만 예고)

### 변경하지 않음(참고만)

- `docs/mdm/erd/05-master-data.{mmd,sqlite.sql,mssql.sql}` — TSK-02-03 소유 문서. 이 Task 는 갈라지는 지점(F15·F18)을 명시했을 뿐 ERD 자체를 고치지 않는다.
- `docs/mdm/design/basic/05-master-data.md` — 원천 문서. 원문을 고치지 않는다.
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/category/*` — 전사 공유 계약. 이 Task 는 재사용만 한다(F10, 불변 규칙).

---

## 3. 테스트 전략

**기준선**(오케스트레이터 실측, 팀장 지시 원문): `testAll` 1878 tests / 0 failures / 0 errors — **이것이 유일한 기준선이다.** `mssqlMigrationTest` 는 기준선·게이트 비교 대상이 아니다.

**사용자 결정: 도커 금지로 MSSQL 실측 생략, DDL 리뷰로 대체**(F20 — `mssqlMigrationTest`·Testcontainers·docker 명령은 기준선·Build·Verify 어디에서도 실행하지 않는다).

게이트 판정 = `testAll` 기준선 대비 신규 실패 0 + 테스트 총수 미감소(신규 테스트는 늘어난다). MSSQL 방언은 게이트가 아니라 §3.3′ 의 DDL 대조 체크리스트(정적 리뷰, 일부는 §3.3′-A 자동화 텍스트 비교 테스트로 testAll 안에서 돈다)로 확인한다.

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

### 3.3′ MSSQL 방언 검증 — DDL 줄 대조 리뷰(도커 금지, 실행하지 않는다, F20)

**사용자 결정: 도커 금지로 MSSQL 실측 생략, DDL 리뷰로 대체.** `mssqlMigrationTest`(Testcontainers)는 기준선·Build·Verify 어디에서도 실행하지 않는다. mssqlTest 소스셋에 새 테스트 파일을 추가하거나 기존 mssqlTest 파일의 기대 버전(V7)을 고치는 것은 **컴파일이 깨지지 않게 유지하는 목적으로만** 한다 — **실행하지 않으며 게이트·수용 기준 근거로 쓰지 않는다**(F21). MSSQL 방언의 정확성은 (A) 아래 §3.3′-A 자동화 텍스트 비교 테스트(도커 불필요, `testAll` 안에서 돈다)와 (B) §3.3′-B 사람 리뷰 체크리스트 둘로 나눠 확인한다.

#### 3.3′-A `MdmMasterDataDdlParityTest`(자동화, SQLite/DB 불필요, `api/src/test`, `testAll` 포함)

두 V7 DDL 파일을 **DB 에 적용하지 않고 클래스패스 리소스 텍스트로 읽어** 파싱·대조한다(도커는 물론 SQLite 커넥션도 필요 없다 — 순수 문자열 처리). 이 테스트는 §3.3′-B 체크리스트 항목 1·2·6·7(이름 부분)·8·10 을 자동화해 "사람이 놓치는" 위험을 없앤다.

파싱 절차(괄호 깊이를 추적해 `VARCHAR(50)`·`CHECK (...)` 같은 중첩 괄호를 안전하게 건너뛴다):
1. `--` 로 시작하는 줄 주석을 제거한다.
2. `CREATE TABLE (\w+)\s*\(` 로 각 테이블 시작을 찾고, 그 뒤로 괄호 깊이가 열림 1에서 다시 0 으로 돌아오는 지점까지를 그 테이블의 본문으로 잡는다(중첩 괄호 안전).
3. 테이블 본문을 괄호 깊이 0 인 콤마로만 분리해 항목 목록을 얻는다. 각 항목이 `CONSTRAINT (\w+)`로 시작하면 그 이름을 그 테이블의 제약 이름 집합에 넣고, 아니면(칼럼 선언) 첫 토큰을 칼럼 이름으로 삼되 예약어 인용(`"RESULT"`/`[RESULT]`, `` `X` ``)의 따옴표·대괄호·백틱은 벗겨서 정규화한다(`RESULT`로 통일).
4. `CREATE (UNIQUE )?INDEX (\w+) ON (\w+)` 로 파일 전체에서 인덱스 선언을 찾아 (인덱스 이름, 대상 테이블) 목록을 얻는다.

단언(두 방언 파일에서 얻은 값을 비교):
- 테이블 이름 **순서 있는 목록**이 정확히 같다(7개, DATA→DATA_SYSTEM→DATA_ITEM→DATA_CATE→DATA_CATE_ITEM→DATA_RECV→DATA_RECV_ITEM).
- 테이블마다 칼럼 이름 **순서 있는 목록**이 정확히 같다(§6.0 칼럼표와도 대조).
- 테이블마다 제약 이름(PK_/FK_/CK_/UX_ 전부) **집합**이 정확히 같다.
- 인덱스 이름 **집합**과 각 인덱스의 대상 테이블이 정확히 같다.
- **F13 직접 증거**: `TB_MDM_DATA_CATE_ITEM`의 제약 이름 집합에 `CATE_ID`·`CODE`를 참조하는 FK 가 없다(두 방언 모두).

**변이**: 어느 한쪽 방언 파일에서 칼럼·제약·인덱스 이름을 하나 빠뜨리거나 순서를 바꾸면 이 테스트가 빨개진다 — 이 부분은 도커 없이도 자동으로 잡힌다(§5 불변 규칙 갱신).

**이 자동화가 못 잡는 것(그래서 §3.3′-B 가 남는다)**: 칼럼의 실제 타입 텍스트(예: `VARCHAR(50)` vs `VARCHAR(50) COLLATE Latin1_General_100_BIN2`, §6.0 토큰표가 다른 게 당연하다), NULL/NOT NULL, DEFAULT 리터럴 값, CHECK `IN(...)` 값 목록의 내용, 예약어 인용 문자 종류(`"..."` vs `[...]`), IDENTITY/AUTOINCREMENT 실제 동작. 이름 집합만 같아도 타입·기본값이 어긋날 수 있으므로 자동화가 리뷰를 완전히 대체하지 않는다.

#### 3.3′-B 사람 리뷰 체크리스트(정적, 자동 빨간불 아님)

Build·Verify 가 `sqlite/V7__create_mdm_master_data.sql`과 `mssql/V7__create_mdm_master_data.sql`을 나란히 놓고 §6.0 최종 칼럼표 대비 줄 단위로 대조한다. **대조 결과표를 design.md 「Build/Verify Phase 기록」 절(§2 이탈 추기 방식과 동일하게, Build·Verify 가 각자 완료 시 추가)에 남긴다** — 항목별 PASS/FAIL 과 발견한 불일치를 표로 적는다.

1. **테이블 존재·순서** — §3.3′-A 가 자동 확인(참고만).
2. **칼럼 이름·순서** — §3.3′-A 가 자동 확인(참고만).
3. **타입 매핑** — 각 칼럼이 §6.0 토큰표(`CD20`·`CD50`·`NM100`·`TXT`·`TXT_A`·`INT4`·`BIGI`·`DTS`·`ATTR500`·`ID_AI`)와 정확히 대응하는지, 특히 코드성 칼럼(`MARU_DATA_ID`·`CODE`·`CATE_ID`·`SYSTEM_CODE`·`SOURCE_SYSTEM`·`STATUS`·`SOURCE_KIND`·`DEF_KIND`·`DEF_TARGET`·`LVL1-5`)에 MSSQL `COLLATE Latin1_General_100_BIN2`가 빠짐없이 붙었는지(F5·naming-dialect-rules §3 #19). **사람 리뷰 전용.**
4. **NULL/NOT NULL** — §6.0 표의 NULL 칸과 일치. **사람 리뷰 전용.**
5. **기본값** — 리터럴 텍스트까지 일치(`'9999-12-31 00:00:00'`, `0`, `'INUSE'`, `'^[0-9A-Z]{1,20}$'` 등). SQLite `VER`는 F15 대로 `BIGINT` 리터럴인지도 확인. **사람 리뷰 전용.**
6. **PK/FK 이름** — §3.3′-A 가 이름 집합을 자동 확인(참고만); **대상 칼럼·참조 테이블이 맞는지는 사람 리뷰**(F5, §3.3′-A 는 텍스트만 보지 의미를 모른다).
7. **`TB_MDM_DATA_CATE_ITEM.CATE_ID`·`CODE` FK 없음** — §3.3′-A 가 자동 확인(F13, 참고만).
8. **UNIQUE/INDEX** — §3.3′-A 가 이름·대상 테이블을 자동 확인(참고만); 대상 **칼럼**까지는 사람 리뷰.
9. **CHECK 값 목록** — 제약 이름은 §3.3′-A 가 확인하지만, `IN(...)` 값 집합의 내용은 **사람 리뷰**로 두 방언이 같은지 확인한다(`CK_TB_MDM_DATA_CATE_TARGET`, F18 포함 — SQLite 쪽은 §3.1-9 에서 이미 `CategoryOwner.MASTER_DATA.allowedDefTargets()`와 자동 대조되므로, 여기서는 "MSSQL 파일의 값 목록이 SQLite 파일과 문자열로 같다"만 확인하면 간접적으로 같이 보장된다).
10. **예약어 칼럼 인용** — `RESULT`·`ACTION`이 SQLite `"..."`, MSSQL `[...]`로 일관되게 감싸졌는지. **사람 리뷰 전용**(§3.3′-A 는 인용 문자를 벗기고 이름만 비교하므로 인용 여부 자체는 못 잡는다).
11. **IDENTITY/AUTOINCREMENT** — `RECV_ID`가 SQLite `INTEGER PRIMARY KEY AUTOINCREMENT`, MSSQL `BIGINT IDENTITY(1,1)`로 선언됐는지 텍스트만 확인한다. **알려진 커버리지 갭**: 실제 단조 증가 동작(naming-dialect-rules §3 #2 05 해당분)과 콜레이션의 실제 대소문자 구분 동작(§3 #19 05 해당분)은 도커 없이 검증할 수 없다 — 두 행은 이 Task 완료 후에도 "실측 필요"로 남는다(정적 확인만 했다는 사실을 naming-dialect-rules.md 에 기록한다, §2).

**MSSQL 테스트 파일은 작성하되 실행하지 않는다**(F21) — `MdmMasterDataMssqlMigrationTest.java`(§2 생성)는 `MdmInterfaceLayoutMssqlMigrationTest` 패턴을 그대로 따라 위 11개 항목에 대응하는 테스트 메서드를 작성해 도커 정책이 바뀌면 즉시 쓸 수 있게 남겨 두되, 컴파일 유지 목적일 뿐 이번 Task 의 게이트·수용 기준 근거가 아니다. Build 는 `:api:compileMssqlTestJava`(컴파일 전용, docker 불필요)로 컴파일만 확인하고 `:api:mssqlMigrationTest`는 호출하지 않는다.

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
| 05 테이블 7개 Flyway 두 방언 | §3.1, §3.3′-A(자동), §3.3′-B(리뷰) |
| 엔티티(7개, spec 본문 요구사항 — `spec.md:8`) | §3.2 |
| 일시 선분 저장 코어 인터페이스 | §3.4, §6.1 |
| 카테고리·ID 이름 공간은 전사 계약 재사용 | §3.1-9(DDL CHECK ↔ `CategoryOwner`/`CategoryKind` 대조), §3.4(스텁이 `contract.category` 무변경으로 컴파일) |
| naming-dialect-rules §6.1 인계 #2·#19(05 해당분) | **닫지 못함**(F20·F21) — §3.3′-B 체크리스트 항목 3·11 로 DDL 텍스트만 정적 확인했고, 실제 동작(단조 증가·대소문자 구분)은 도커 금지로 실측하지 못해 naming-dialect-rules.md 에 "실측 필요"로 남긴다 |

---

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것 (규칙 · 변이 · 빨개지는 테스트)

1. **7테이블 전부(보류 대상 3개 포함)를 만든다** — `TB_MDM_DATA_SYSTEM`·`TB_MDM_DATA_RECV`·`TB_MDM_DATA_RECV_ITEM`을 빼지 않는다(PRD §2 규칙 7, F3). **변이**: 3테이블 제거 → §3.1-1(7테이블 생성 확인)·§3.2(엔티티 왕복)이 빨개진다. 한쪽 방언 파일에서만 3테이블을 빼면 §3.3′-A(자동, 테이블 이름 목록 불일치)가 빨개진다.
2. **선분 PK 는 `원래 키 + valid_from`이다**(F6) — `DATA_ITEM`·`DATA_CATE`·`DATA_CATE_ITEM` 세 테이블 모두. **변이**: `VALID_FROM`을 PK 에서 빼고 별도 대리키로 바꿈 → §3.1-6(같은 키·다른 VALID_FROM 공존 확인)이 빨개진다.
2-1. **경계는 `valid_from`(포함)–`valid_to`(배타)인 반개구간이다**(F6, `[T1,T2)`). 방언별 칼럼 타입은 SQLite `TEXT`(포맷 `yyyy-MM-dd HH:mm:ss`, F7·F8), MSSQL `DATETIME2(0)`(초 단위, 불변 규칙 9)이다. **변이**: 경계 비교를 `<=`/`<`가 아니라 둘 다 `<=`(폐구간)로 바꿈 → §3.1-11(경계 산술 테스트, `t=T2`일 때 0건이어야 하는데 1건이 되어) 빨개진다.
3. **열린 행의 `VALID_TO`는 `'9999-12-31 00:00:00'`이다**(F6). **변이**: 다른 센티넬(예: NULL)로 바꿈 → §3.1-7(DDL 텍스트 확인)·§3.2-4(`OPEN_END` 상수와 왕복 값 비교)가 빨개진다.
4. **`CATE_ITEM`은 `CATE_ID`·`CODE`에 FK 를 걸지 않는다**(F13, 선분 때문에 앱이 검사한다). **변이**: SQLite 파일에 FK 를 추가 → §3.1-5(존재하지 않는 조합 INSERT 가 더 이상 성공하지 못함)가 빨개지고, §3.3′-A(자동, F13 제약 이름 집합 확인)도 빨개진다. MSSQL 파일에만 FK 를 추가하면(SQLite 는 그대로) §3.3′-A 가 두 방언 제약 이름 집합 불일치로 빨개진다 — 실행 기반 대조군은 없다(도커 금지, F20).
5. **`TB_MDM_DATA_ITEM.ROW_VERSION`은 `@Version`으로 매핑하지 않는다**(F9). **변이**: `@Version`으로 바꿈 → §3.2(더티 업데이트 후 `rowVersion` 불변·`VER`과 독립 확인)가 빨개진다.
6. **`contract.data.MdmTemporalSegmentStore`의 `src/main` 구현체를 이 Task 에 넣지 않는다**(TSK-07-03 몫). **변이**: 실 구현체를 `api` 또는 `lib` main 에 추가 → §3.5(ArchUnit `노_구현체_테스트`)가 빨개진다.
7. **`contract/category/*` 파일을 고치지 않는다**(F10, 카테고리·ID 이름공간은 재사용만). **알려진 커버리지 갭**: 이 규칙을 어겨 그 패키지 파일을 몰래 고쳐도 이를 직접 잡는 테스트는 없다(공유 계약이라 이 Task 의 ArchUnit 대상이 아니다) — Build·Verify 가 `/usr/bin/git diff --name-only`로 그 패키지 경로 변경 여부만 확인할 수 있다는 점을 보고에 남긴다.
8. **일시 칼럼(`VALID_FROM`·`VALID_TO`·`CLOSED_AT`·`RECEIVED_AT`·`PROCESSED_AT`)은 SQLite 에 `TEXT`(포맷 `yyyy-MM-dd HH:mm:ss`, 소수초 없음)로 저장돼야 한다**(F7·F8, `MdmSqliteTemporalConverterContributor`가 이를 강제한다) — `typeof()` 단정(§3.2)이 이를 직접 증명한다. **변이**: `application-local.yml`의 `metadata_builder_contributor` 등록을 빼거나 컨버터의 출력 포맷에 소수초(`.SSS`)를 남김 → §3.2(F7·F8 단정)가 빨개진다.
9. **경계 시각은 초 단위로 절삭해 다룬다**(MSSQL `DATETIME2(0)` 정밀도, TSK-07-03 인계). **알려진 커버리지 갭(F20)**: 도커 금지로 MSSQL `DATETIME2(0)`의 실제 반올림·절삭 동작은 이 Task 가 검증하지 못한다 — SQLite 쪽(§3.1-11·§3.2)은 초 단위 값만 써서 픽스처 자체가 이 문제를 드러내지 않는다. 이 규칙은 **코드 리뷰로만** 지킨다: TSK-07-03 구현이 저장 전 `LocalDateTime.truncatedTo(ChronoUnit.SECONDS)`(또는 동등한 절삭)를 거치는지 Build·Verify 가 코드를 직접 읽어 확인하고, 자동 빨간불이 없다는 사실을 보고에 남긴다.
10. **SQLite `VER` 칼럼은 7테이블 전부 `BIGINT`로 선언한다**(F15, ERD 초안의 `INTEGER`가 아니다). **변이**: `INTEGER`로 되돌림 → §3.1-8(DDL 텍스트 확인)이 빨개진다.
11. **`CK_TB_MDM_DATA_CATE_TARGET`(F18)의 허용값 집합은 `CategoryOwner.MASTER_DATA.allowedDefTargets()`와 정확히 같다**(`CODE`를 포함하지 않는다). **변이**: CHECK 목록에 `'CODE'`를 끼워 넣음 → §3.1-9(리플렉션 대조)가 빨개진다.
12. **두 방언의 Flyway V 번호 집합은 항상 같다**(`{"1","2","3","4","7"}`). **변이**: 한쪽에만 V7 추가 → `MdmFlywayVersionParityTest`(기존, F2 확인상 이 Task 수정 없이도 이미 이 불변식을 검사한다)가 빨개진다.
13. **예약어 칼럼(`RESULT`·`ACTION`)은 방언별 인용 문자로 DDL 을 쓰고 엔티티는 방언-중립 백틱으로 인용한다**(naming-dialect-rules §1, TSK-05-01 D1 선례). **변이**: 인용을 제거 → SQLite 쪽은 §3.1 에서 Build 가 실제로 변이를 넣어 빨개지는지 실측해야 한다(**알려진 커버리지 갭**: TSK-05-01 D-047 실측대로 SQLite community dialect 가 이 정도 이름을 예약어로 취급하지 않을 가능성이 높다 — 안 빨개지면 은폐하지 않고 보고한다). MSSQL 쪽은 §3.3′-B 체크리스트 항목 10(정적 텍스트 확인)만 가능하다 — §3.3′-A 는 인용 문자를 정규화(벗김)해서 비교하므로 인용 누락 자체를 잡지 못한다(자동화 설계상 한계, 의도적). 인용 여부가 MSSQL 파싱·매핑에 실제로 영향을 주는지는 도커 금지로 이 Task 가 검증하지 못한다(추가 알려진 갭, F20).

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

### D2 — spec 본문 "엔티티"가 보류 3테이블(`DATA_SYSTEM`·`DATA_RECV`·`DATA_RECV_ITEM`)까지 포함하는가
- **질문**: `spec.md:8`의 요구사항 "05 테이블 7개 Flyway 두 방언, **엔티티**"는 "테이블 7개"와 "엔티티"를 한 문장에 나란히 적었을 뿐 "엔티티 7개"라고 숫자를 명시하지 않는다. `decisions.md` D-019(보류 테이블은 DDL-only, 엔티티 없음)와 문면이 충돌할 수 있는 이 자리에서, "엔티티"를 7테이블 전부로 읽을지 활성 4테이블로 좁혀 읽을지 spec 문언만으로는 확정할 수 없다.
- **선택지**: (1) "엔티티"를 7테이블 전부로 읽는다 — `TB_MDM_DATA_SYSTEM`·`TB_MDM_DATA_RECV`·`TB_MDM_DATA_RECV_ITEM` 포함 7개 엔티티를 만든다(현재 design.md 의 §2·§6.0 이 이 전제로 작성돼 있다). (2) "엔티티"를 활성 4테이블(`DATA`·`DATA_ITEM`·`DATA_CATE`·`DATA_CATE_ITEM`)로 좁혀 읽는다 — D-019 원칙대로 보류 3테이블은 DDL 만 만들고 엔티티는 만들지 않는다. (3) 활성 4테이블 + `TB_MDM_DATA_SYSTEM`(배포 대상, 07-02 가 곧 쓸 가능성이 높다)만 엔티티로 만들고 `DATA_RECV`·`DATA_RECV_ITEM`(수신 로그, PRD §2 규칙 7 로 더 확실히 보류)은 제외한다(근거가 spec·D-019 어디에도 없는 임의 절충이라 약함).
- **택한 것**: (1).
- **근거**: `wbs.md:1079`(TSK-07-01 PRD 요구사항 절)도 spec 과 똑같은 문구 "05 테이블 7개 Flyway 두 방언, 엔티티"를 쓴다 — 두 문서가 독립적으로 같은 병렬 구조를 반복하는 것은 "테이블"과 "엔티티"가 같은 스코프(7개)를 가리키는 의도적 서술일 가능성을 높인다. 05 원문(`05-master-data.md:601`)도 "원장 테이블 7개"라고 못박아 이 Task 의 대상 자체가 7개임을 거듭 확인한다. `PRD.md:62`(§2 규칙 7)도 "DDL 은 원천 설계 그대로 만든다... 배포 순번 칸·표... 수신 로그 표는 만들되 이번 범위의 코드는 쓰지 않는다"고 해서, 보류 테이블도 **스키마 계층**(DDL+엔티티는 스키마를 코드로 옮긴 것)은 만들고 **동작 계층**(서비스·화면)만 뺀다는 원칙을 시사한다 — 이는 D-019 의 "엔티티도 없음"보다 이 Task(스키마 확정 Task)의 문맥에 더 맞는다. 근거 순위상 spec 본문(및 이를 반복하는 wbs)이 D-019(다른 Task 의 미승인 일반 원칙)보다 세다. **근거 강도: 중**(spec 문언 자체는 여전히 모호하고, D-019 명문과 정면으로 충돌하는 선택이라 사람 확인이 필요하다).
- **반려 시 재작업**: 선택지 (2)로 되돌리면 `MdmDataSystem.java`·`MdmDataSystemId.java`·`MdmDataRecv.java`·`MdmDataRecvItem.java`·`MdmDataRecvItemId.java`(엔티티 3개+Id 2개)를 §2 생성 목록·§6.0 에서 제거하고, §3.2(JPA 왕복)에서 이 세 테이블 관련 항목을 빼며, §3.3′-A(자동 파싱 테스트)·§3.3′-B(리뷰 체크리스트)는 DDL 만 남으므로 영향 없다. `TB_MDM_DATA`·`TB_MDM_DATA_ITEM`·`TB_MDM_DATA_CATE`·`TB_MDM_DATA_CATE_ITEM`(활성 4테이블) 관련 결정(F5~F19 대부분)은 그대로 유지된다 — 이 반려는 엔티티 파일 3+2개 삭제로 국한된다.

### D3(Build 신설) — 선분 PK 인 LocalDateTime(`VALID_FROM`) 을 Hibernate 7 에서 어떻게 매핑할 것인가
- **질문**: design.md F8 은 mcm `SqliteTemporalConverterContributor` 선례(JPA `AttributeConverter` + `MetadataBuilderContributor` auto-apply)를 그대로 이식할 계획이었다. Build 1단계 실제 구현·테스트 과정에서, `MdmDataItem.validFrom`(F6 — 선분 PK 구성 요소, `@Id`)에 이 방식을 그대로 적용하자 `org.hibernate.AnnotationException: 'AttributeConverter' not allowed for attribute 'validFrom' annotated '@jakarta.persistence.Id'`(Hibernate 7.2.12.Final 실측)가 발생했다 — Hibernate 7 은 `@Id` 속성에 JPA `AttributeConverter`(auto-apply 여부와 무관)를 거는 것 자체를 하드 금지한다. `MdmDataCate.validFrom`·`MdmDataCateItem.validFrom` 도 같은 처지다(F6, 세 테이블 모두 `valid_from` 이 PK). 이 문제는 design.md 작성 시점에는 드러나지 않았다(F8 은 "실측 후 대응이 아니라 선제 우회"라고 적었지만, 우회 메커니즘 자체가 Id 필드에는 물리적으로 적용 불가능하다는 사실은 실제 컴파일·부팅 전에는 드러나지 않는다).
- **선택지**: (1) `@Convert(disableConversion=true)` 로 auto-apply 대상에서 이 필드를 빼고, Hibernate 네이티브 `UserType<LocalDateTime>`(`org.hibernate.usertype.UserType`, JPA `AttributeConverter` 와 다른 코드 경로라 이 제약을 받지 않음 — 실측 확인)을 만들어 `@org.hibernate.annotations.Type` 으로 명시 적용한다. `UserType` 안에서 `SharedSessionContractImplementor.getJdbcServices().getDialect()` 로 런타임에 SQLite 인지 감지해 텍스트/네이티브 바인딩을 가른다. (2) `VALID_FROM` 자체를 엔티티에서 `String` 필드로 선언해(포맷은 애플리케이션이 직접 관리) 컨버터·UserType 어느 쪽도 쓰지 않는다 — 그러나 MSSQL 에 문자열을 `DATETIME2` 칼럼으로 바인딩하는 신뢰성이 떨어지고, `contract.data.MdmTemporalSegmentRules.OPEN_END`(`LocalDateTime` 상수, §6.1) 와 타입이 어긋나 §3.2-4(`VALID_TO` ↔ `OPEN_END` 비교) 테스트도 다시 설계해야 한다. (3) 낙관을 버리고 세 테이블의 PK 에서 `VALID_FROM` 을 빼고 대리키(surrogate key)를 두는 방향으로 전체 스키마를 다시 설계한다 — design.md F6 의 "원래 키 + valid_from" PK 원칙(05 원문 근거) 자체를 깨므로 Build 권한 밖의 재설계다.
- **택한 것**: (1).
- **근거**: 선택지 3 은 이미 승인 경계에 있는 F6(05 원문 직접 근거)을 건드리므로 Build 가 판단할 사안이 아니다(배제). 선택지 2 는 `LocalDateTime` 타입을 포기해 계약(`MdmTemporalSegmentRules.OPEN_END`)과의 정합을 스스로 깨고, MSSQL 네이티브 `DATETIME2` 바인딩을 문자열 경유로 우회해야 해 F7(MSSQL 은 네이티브 사용) 원칙과도 어긋난다. 선택지 1 은 실제로 컴파일·부팅·왕복 테스트(§3.2, `VALID_FROM_과_VALID_TO_가_SQLite_에_naming_dialect_rules_형식_TEXT_로_저장된다()`)까지 통과함을 실측으로 확인했고, `LocalDateTime` 타입·계약 정합·MSSQL 네이티브 바인딩(방언 감지로 유지) 셋 다 지킨다. **근거 강도: 강**(대안이 사실상 없다 — Hibernate 프레임워크 제약이지 이 Task 의 설계 취향이 아니다).
- **반려 시 재작업**: 선택지 2 로 바꾸려면 `MdmDataItemId`·`MdmDataCateId`·`MdmDataCateItemId` 의 `validFrom` 필드 타입을 `String`(naming-dialect-rules §3 #16 형식 문자열)으로 바꾸고, `MdmTemporalSegmentRules.OPEN_END` 를 문자열 상수로 바꾸거나 엔티티 쪽에서만 변환 계층을 하나 더 둬야 한다 — 계약(§6.1)·§3.2 테스트 다시 작성.
- **Source**: 실측(Hibernate 7.2.12.Final `BasicValueBinder.disallowConverter`), `decisions.md` D-TSK-07-01-2

---

## Build Phase 기록

Build 가 design.md 원안에서 이탈하거나(파싱 로직 등), 원안에 없던 새 사실을 발견한 지점을 여기 남긴다(D3 는 위에 별도 절로 이미 남겼다).

### 이탈 1 — §3.3′-A DDL 파싱 절차 보완(RECV_ID 인라인 PK·문자열 리터럴 내 콤마)
design.md §3.3′-A 원안의 파싱 절차 3번("각 항목이 `CONSTRAINT (\w+)`로 시작하면 그 이름을...")은 두 가지를 놓친다:
1. SQLite `TB_MDM_DATA_RECV.RECV_ID` 는 V4 선례대로 `RECV_ID INTEGER CONSTRAINT PK_TB_MDM_DATA_RECV PRIMARY KEY AUTOINCREMENT` 로 PK 를 칼럼 선언 **안에** 인라인으로 건다(AUTOINCREMENT 제약상 필수). 이 항목은 "CONSTRAINT 로 시작"하지 않으므로 원안 절차로는 PK 이름을 놓친다 — **advisor 재검토로 발견**.
2. `TB_MDM_DATA.CODE_PATTERN` 의 기본값 리터럴 `'^[0-9A-Z]{1,20}$'` 안의 콤마(`{1,20}`)가 괄호 밖에 있어 괄호 깊이만 추적하는 콤마 분리 로직이 이 항목을 둘로 잘못 쪼갠다 — **Build 가 첫 실행에서 직접 발견**(테스트가 `TB_MDM_DATA` 칼럼 목록을 `{1`·`20}$'` 두 개로 잘못 쪼개는 것으로 실패하는 것을 실측).

**조치**: `MdmMasterDataDdlParityTest` 는 (1) 각 항목에서 위치와 무관하게 `CONSTRAINT (\w+)` 를 전부 찾아 `PK_`/`FK_`/`CK_`/`UX_` 접두만 제약 집합에 담고(MSSQL 전용 `DF_...` 기본값 이름은 제외), 칼럼 이름은 항목의 첫 토큰으로 별도로 판정한다. (2) 콤마·괄호 깊이 추적 모두 작은따옴표 문자열 리터럴 안에서는 무시하도록 `inQuote` 상태를 추가했다. 두 수정 모두 실제 V7 DDL 로 실행해 정상 동작을 확인했다.

### 이탈 2 — `ArchUnit` `noClasses().should(customCondition)` 조합 대신 직접 스트림 필터링
`MdmTemporalSegmentStoreNoImplementationTest`(§3.5)를 처음에는 `noClasses().should(커스텀 ArchCondition)` fluent DSL 로 작성했으나, 공허 통과 방지 음성 테스트에서 `FakeSegmentStoreImpl`(고립 클래스, 실제로 인터페이스를 구현)을 두고도 `rule.evaluate(isolated).hasViolation()` 이 `false` 를 돌려주는 것을 실측했다(**Build 가 직접 발견** — 커스텀 조건의 `check()` 안에서 `events.add(SimpleConditionEvent.violated(...))` 가 호출되는 것을 디버그 로그로 직접 확인했음에도 최종 결과가 위반 없음으로 나옴). **원인은 프레임워크 결함이 아니라 이 조건의 극성이었다**: ArchUnit 의 `noClasses().should(condition)` 은 내부적으로 `condition` 을 `never(...)`로 감싸 이벤트를 반전시킨다 — `classes().should(condition)` 에서 "`condition.check()` 가 `violated` 를 낸 클래스 = 규칙 위반" 이던 것이, `noClasses()` 아래서는 "`condition.check()` 가 `violated` 를 **내지 않은** 클래스(=조건을 만족하지 못한, 즉 인터페이스를 구현하지 **않은** 클래스) = `never` 규칙 위반" 으로 뒤집힌다. 이 테스트의 조건은 "인터페이스를 구현하면 violated" 로 짰으므로 `noClasses()` 와 결합하면 의미가 반대로 뒤집혀, 실제 구현체(`FakeSegmentStoreImpl`)가 있어도 위반으로 잡히지 않았다. 조건의 극성을 고치는 대신(다음에 같은 실수를 반복하지 않도록), `JavaClasses`/`JavaClass` API(`isAssignableTo`·`isInterface`·`isEquivalentTo`)로 직접 스트림 필터링하는 방식으로 바꿔 재작성했고, 공허 통과 방지 테스트가 실제로 통과함을 확인했다. 이 방식도 ArchUnit 의 공식 API 를 쓴다는 점에서 "ArchUnit 테스트"라는 design.md 의도(§3.5)를 그대로 만족한다.

### 이탈 3 — `MdmSqliteTemporalConverterContributor` 의 `autoApply` 값은 design.md 원안(true) 유지, 별도 UserType 신설로 Id 필드만 우회
design.md §2 가 예고한 두 파일(`LocalDateTimeAttributeConverter.java`·`MdmSqliteTemporalConverterContributor.java`)은 원안 그대로 만들었다(`autoApply=true`, 비-Id 필드 전용). D3 에서 다룬 Id 필드 문제는 새 파일 `MdmLocalDateTimeIdUserType.java`(design.md §2 에 없던 파일, 이 이탈로 추가)로 해결했다 — §2 파일 목록에 이 파일이 없었던 것은 design.md 가 D3 의 존재 자체를 몰랐기 때문이다(Build 신설 사실).

### 이탈 4 — §3.1-11(반개구간 경계) 은 네이티브 리터럴을 써서 컨버터를 거치지 않는다
design.md §3.1-11 은 "이 테스트가 §5 불변 규칙 8(저장 형식)도 함께 검증한다"고 적었지만, 실제 구현은 두 값 모두 JDBC `PreparedStatement` 로 SQLite TEXT 리터럴을 직접 INSERT 한다 — JPA 엔티티·컨버터를 전혀 거치지 않는다. 따라서 규칙 8(SQLite TEXT 저장 형식)의 실질 커버리지는 §3.2 의 `VALID_FROM_과_VALID_TO_가_SQLite_에_naming_dialect_rules_형식_TEXT_로_저장된다()`(typeof 단정) 하나뿐이다 — 아래 불변 규칙 변이 검증표 8행 참고.

### 이탈 5 — origin/dev(6855c6c, MdmMssqlServer 공유 서버) 반영
Build 완료 후 팀장 지시로 origin/dev 의 6855c6c(mssqlTest 가 서버 하나를 같이 쓰게 `MdmMssqlServer` 신설)를 `--no-ff` 머지했다(충돌 없음, auto-merge — 이 Task 가 바꾼 버전 집합 `{1,2,3,4,7}`과 dev 의 `MdmMssqlServer` 패턴이 서로 다른 줄이라 자동 병합됨). 머지 후 이 Task 가 새로 만든 `MdmMasterDataMssqlMigrationTest`(dev 는 이 파일의 존재를 몰랐다)만 수동으로 `@Testcontainers`/`@Container`/`MSSQLServerContainer` 직접 기동 방식에서 `MdmMssqlServer.newDatabase("masterdata")` 공유 서버 방식으로 다시 썼다 — 실행은 여전히 하지 않는다(F20·F21, `:api:compileMssqlTestJava` 로만 확인). 머지 커밋 sha 는 끝 보고에 적는다.

---

## 불변 규칙 변이 검증(Build)

design.md §5 의 13개 규칙(2-1 포함) 전부 실제로 변이를 넣어 빨간불을 확인했다(각 변이는 확인 직후 원복, `/usr/bin/git status`로 작업 트리 복원을 확인했다).

| 규칙 | 넣은 변이 | 빨개진 테스트 | 결과 |
|---|---|---|---|
| 1(7테이블 전부) | sqlite V7 에서 `TB_MDM_DATA_RECV_ITEM` 테이블 블록 삭제 | `_7테이블_전부_생성되고_칼럼_집합이_기대값과_같다`·`PK_이름이_규칙표를_따른다`·`CHECK_제약들이_위반을_거부한다`·`F15_직접_증거_VER_칼럼_모두_BIGINT_로_선언됐다`(이상 `MdmMasterDataMigrationTest`)·`MdmDataRecvItem_은_IdClass_복합_PK_로_EntityManager_로_직접_저장_조회_왕복한다`(`MdmMasterDataEntityJpaRoundtripTest`)(5건, XML 실측으로 이름 확정) | 빨강 확인 |
| 2(선분 PK) | sqlite V7 `TB_MDM_DATA_ITEM` PK 에서 `VALID_FROM` 제거 | `F6_직접_증거_같은_키_다른_VALID_FROM_행이_공존하고_완전_중복은_거부된다`(PK 위반 대신 성공) | 빨강 확인 |
| 2-1(반개구간 경계) | 경계 테스트 쿼리의 `? < VALID_TO` 를 `? <= VALID_TO` 로 변경(앱 비교 연산자 자리의 대리 변이 — TSK-07-03 코드가 아직 없어 픽스처 쿼리로 대신함) | `반개구간_경계_산술이_T1_포함_T2_배타이다`(T2 에서도 1건) | 빨강 확인 |
| 3(VALID_TO=9999-12-31) | sqlite V7 세 테이블의 DEFAULT 를 `'2099-12-31 00:00:00'` 로 변경 | `VALID_TO_기본값이_9999_12_31_이다`(§3.1-7)·`VALID_TO_DDL_기본값으로_INSERT_된_행을_JPA_로_읽으면_OPEN_END_와_같다`(§3.2-4, 네이티브 INSERT 로 VALID_TO 생략 후 JPA 로 읽어 컨버터 읽기 경로까지 거친다) 둘 다 | 빨강 확인(design.md §5 규칙 3 이 요구한 §3.1-7·§3.2-4 둘 다 실측) |
| 4(CATE_ITEM FK 없음) | sqlite V7 에 `FK_TB_MDM_DATA_CATE_ITEM_CATE`(CATE_ID,VALID_FROM 참조) 추가 | `F13_직접_증거_CATE_ITEM_은_CATE_ID_CODE_에_FK_가_없다`·`MdmMasterDataDdlParityTest`(제약 집합 불일치) | 빨강 확인 |
| 5(ROW_VERSION ≠ @Version) | `MdmDataItem.rowVersion` 에 `@jakarta.persistence.Version` 추가 | `ROW_VERSION_은_Version_이_아니라_더티_업데이트에도_자동_증가하지_않는다` | 빨강 확인 |
| 6(src/main 구현체 없음) | `lib/persistence` 에 `TempMutationSegmentStoreImpl implements MdmTemporalSegmentStore` 임시 추가 | `MdmTemporalSegmentStore_의_실_구현체가_com_dongkuk_dmes_mdm_에_없다` | 빨강 확인(확인 후 파일 삭제) |
| 7(contract/category 무변경) | — | (자동 테스트 없음) | **알려진 갭**: `/usr/bin/git diff --name-only` 로 그 패키지 경로 변경 여부만 사람/Verify 가 확인할 수 있다(design.md 원안 그대로) |
| 8(SQLite TEXT 저장 형식) | (a) `application-local.yml` 의 `metadata_builder_contributor` 등록 제거(비-Id 컨버터 경로만 끔) → `VALID_TO`(row[2]/row[3])만 깨지고 `VALID_FROM`(row[0]/row[1])은 그대로 통과(두 메커니즘이 독립임을 실측 증명, 실제 저장값 `253402182000000` epoch millis). (b) `MdmLocalDateTimeIdUserType` 의 `WRITE_FORMATTER` 에 `.SSS` 추가(Id UserType 경로만 깨짐) → 이번엔 `VALID_FROM` 쪽만 형식 불일치로 깨짐 | `VALID_FROM_과_VALID_TO_가_SQLite_에_naming_dialect_rules_형식_TEXT_로_저장된다`(a·b 둘 다), `VALID_TO_DDL_기본값으로_INSERT_된_행을_JPA_로_읽으면_OPEN_END_와_같다`(b) | 빨강 확인(둘 다 재실측, §3.1-11 은 네이티브 리터럴이라 이 규칙을 검증하지 않는다 — 이탈 4 참고). 초기 TDD 단계(컨버터 신설 전)에도 같은 typeof 테스트가 `ParseException`으로 빨강이었다(부가 증거) |
| 9(MSSQL 초 단위 절삭) | — | (자동 빨간불 없음) | **알려진 갭(F20)**: 도커 금지로 `DATETIME2(0)` 실제 반올림·절삭 동작을 검증 못함. TSK-07-03 코드 리뷰로만 지킨다(design.md 원안 그대로). **추가 갭(D3 신설 코드)**: `MdmLocalDateTimeIdUserType` 의 MSSQL 분기(`setTimestamp`/`getTimestamp`)는 이 Task 의 어떤 테스트도 실행하지 않는다(도커 금지로 실행 불가) — mock 기반 단위 테스트도 만들지 않았다(그 분기 자체가 실질적으로 "Hibernate 기본 Timestamp 왕복"이라 테스트 가치가 낮다고 판단했으나, TSK-07-03 이 실 서비스 코드를 얹기 전에는 미검증 상태로 남는다). **TSK-07-03 인계 사항**: `getSqlType()`이 방언과 무관하게 항상 `Types.VARCHAR`를 돌려준다 — MSSQL 에서 Hibernate 가 `VALID_FROM`을 VARCHAR 로, `VALID_TO`(비-Id, 네이티브 매핑)는 실제 `TIMESTAMP` 로 타입 힌트를 매길 것이므로 두 칼럼을 HQL 에서 직접 비교하는 쿼리(예: `WHERE i.validFrom <= i.validTo`)는 이 Task 가 검증하지 못했다 |
| 10(SQLite VER BIGINT) | sqlite V7 전체 `VER BIGINT,` → `VER INTEGER,` | `F15_직접_증거_VER_칼럼_모두_BIGINT_로_선언됐다` | 빨강 확인 |
| 11(CK_TARGET = CategoryOwner) | sqlite V7 `CK_TB_MDM_DATA_CATE_TARGET` IN 목록에 `'CODE'` 추가 | `F18_직접_증거_CATE_CHECK_값_목록이_계약과_정확히_같다`·`CHECK_제약들이_위반을_거부한다` | 빨강 확인 |
| 12(V 번호 집합 일치) | sqlite 디렉터리에 더미 `V8__mutation_test_only.sql` 추가 | `MdmFlywayVersionParityTest`(기존, 수정 없이도 잡음) | 빨강 확인(확인 후 파일 삭제) |
| 13(예약어 칼럼 인용) | sqlite V7 의 `"RESULT"`/`"ACTION"` 인용 제거 | (없음 — 전체 초록 유지) | **확인된 갭(은폐하지 않음)**: TSK-05-01 D-047 선례대로 SQLite community dialect 는 `RESULT`·`ACTION` 을 실제 예약어로 취급하지 않는다 — 인용을 빼도 DDL 생성·INSERT·CHECK 모두 그대로 동작해 자동 빨간불이 없다. MSSQL 쪽은 §3.3′-B 항목 10(정적 텍스트 확인)만 가능하고 §3.3′-A 는 인용 문자를 정규화해서 비교하므로 인용 누락 자체를 잡지 못한다(design.md 가 이미 예견한 대로) |

---

## §3.3′-B DDL 대조 결과표(Build·Verify 가 완료 시 채운다)

Build 는 §3.3′-B 11개 항목을 실제로 대조한 뒤 아래 표를 채우고, Verify 는 재대조한 결과를 별도 표로 덧붙인다(불일치를 발견하면 그 사실과 조치를 함께 적는다 — 은폐하지 않는다).

### Build 대조 결과

| 항목 | PASS/FAIL | 비고 |
|---|---|---|
| 1 테이블 존재·순서 | PASS | §3.3′-A(`MdmMasterDataDdlParityTest`) 자동 확인 — 7테이블 순서 일치, `MdmMasterDataExpectations.TABLES` 와도 일치 |
| 2 칼럼 이름·순서 | PASS | §3.3′-A 자동 확인 — 7테이블 전부 칼럼 순서 있는 목록 일치 |
| 3 타입 매핑(§6.0 토큰표) | PASS | 사람 리뷰: `CD50`(VARCHAR(50)/VARCHAR(50) COLLATE BIN2)·`CD20`·`NM100`·`TXT`·`TXT_A`·`INT4`·`BIGI`·`DTS`·`ATTR500`·`ID_AI` 전부 §6.0 표대로 적용됨을 두 파일 나란히 대조해 확인. 코드성 칼럼(MARU_DATA_ID·CODE·CATE_ID·SYSTEM_CODE·SOURCE_SYSTEM·STATUS·SOURCE_KIND·DEF_KIND·DEF_TARGET·LVL1-5)에 MSSQL `COLLATE Latin1_General_100_BIN2` 빠짐없이 붙음 |
| 4 NULL/NOT NULL | PASS | 두 파일 칼럼별 NULL/NOT NULL 이 §6.0 표와 일치 |
| 5 기본값 | PASS | 리터럴까지 일치 확인: `'9999-12-31 00:00:00'`·`0`·`'INUSE'`·`'^[0-9A-Z]{1,20}\$'`. SQLite `VER` 는 F15 대로 `BIGINT`(ERD 초안의 `INTEGER` 아님) |
| 6 PK/FK 이름·대상 | PASS | §3.3′-A 가 이름 집합 자동 확인 + 사람 리뷰로 대상 칼럼·참조 테이블 확인(F5: SOURCE_SYSTEM·SYSTEM_CODE→TB_MDM_SYSTEM, 나머지→TB_MDM_DATA) |
| 7 CATE_ITEM FK 없음 | PASS | §3.3′-A 자동 확인(F13) — 제약 이름 집합에 `{PK_TB_MDM_DATA_CATE_ITEM, FK_TB_MDM_DATA_CATE_ITEM_DATA}` 만 있음, mutation 으로 FK 추가 시 실제로 빨개짐을 확인(아래 불변 규칙 4 행) |
| 8 UNIQUE/INDEX | PASS | §3.3′-A 가 이름·대상 테이블 자동 확인(`IX_TB_MDM_DATA_ITEM_NAME` on `TB_MDM_DATA_ITEM`) + 사람 리뷰로 대상 칼럼(MARU_DATA_ID,NAME) 확인 |
| 9 CHECK 값 목록 | PASS | 사람 리뷰로 두 방언 문자열 일치 확인(`CK_TB_MDM_DATA_CATE_TARGET` 포함) + SQLite 쪽은 §3.1-9 가 `CategoryOwner.MASTER_DATA` 와 자동 대조(mutation 확인, 아래 불변 규칙 11 행) |
| 10 예약어 칼럼 인용 | PASS | SQLite `"RESULT"`/`"ACTION"`, MSSQL `[RESULT]`/`[ACTION]` 로 일관되게 인용됨을 사람 리뷰로 확인 |
| 11 IDENTITY/AUTOINCREMENT(텍스트만) | PASS | `RECV_ID`가 SQLite `INTEGER ... PRIMARY KEY AUTOINCREMENT`, MSSQL `BIGINT IDENTITY(1,1)` 로 선언됨을 텍스트로 확인. **실제 단조 증가·콜레이션 대소문자 구분 동작은 도커 금지로 검증 못함**(알려진 갭, F20 — naming-dialect-rules.md 에 반영) |

### Verify 재대조 결과

| 항목 | PASS/FAIL | 비고 |
|---|---|---|
| 1 테이블 존재·순서 | PASS | §3.3′-A 자동 확인 재실행 — Build 와 동일 |
| 2 칼럼 이름·순서 | PASS | §3.3′-A 자동 확인 재실행 — Build 와 동일 |
| 3 타입 매핑(§6.0 토큰표) | PASS | 사람 리뷰 재확인: 코드성 칼럼 CD20/CD50 에 BIN2 빠짐없음(SOURCE_REF 포함) |
| 4 NULL/NOT NULL | PASS | 재대조: RECV.CHG_SEQ NULL 기본값 없음 ✓, RECV_ITEM.RECV_ID 타입 일치 ✓ |
| 5 기본값 | PASS | 리터럴 재확인 — 모두 일치 |
| 6 PK/FK 이름·대상 | PASS | 재확인 — 모두 일치 |
| 7 CATE_ITEM FK 없음 | PASS | §3.3′-A 재실행 + Rule 1 & 4 MSSQL 변이 시 parity 빨강 확인 |
| 8 UNIQUE/INDEX | PASS | 재확인 — 일치 |
| 9 CHECK 값 목록 | PASS | 두 방언 일치 확인 + Rule 11 변이 시 빨강 확인 |
| 10 예약어 칼럼 인용 | PASS | 재확인 — SQLite `"..."`, MSSQL `[...]` 일관됨 |
| 11 IDENTITY/AUTOINCREMENT(텍스트만) | PASS | 텍스트 재확인 — 도커 금지로 실제 동작 미검증(Build 와 동일) |

---

## Verify Phase 기록

### 변이 검증(강화된 방식)

design.md §5 의 규칙들을 Build 와 다른 방식으로 재검증:

| 규칙 | 변이 | 결과 |
|---|---|---|
| Rule 6 (src/main 구현체 없음) | **api** main 에 임시 `TempMutationSegmentStoreImpl implements MdmTemporalSegmentStore` 추가 | `MdmTemporalSegmentStore_의_실_구현체가_com_dongkuk_dmes_mdm_에_없다()` 빨강 ✓ |
| Rule 1 & 4 (테이블/FK) | **MSSQL 파일만** `TB_MDM_DATA_RECV_ITEM` 테이블 제거 | `MdmMasterDataDdlParityTest` 테이블 목록 불일치 빨강 ✓ |
| Rule 11 (CHECK 값) | `CK_TB_MDM_DATA_CATE_TARGET` 에서 `'ATTR10'` 제거 | 테스트 빨강 ✓ |
| 나머지 규칙 | Build 에서 확인됨 | — |

### testAll 최종 결과

- compileMssqlTestJava: BUILD SUCCESSFUL
- testAll: tests=1906, failures=0, errors=0, skipped=0
- 기준선(Build: 1906, 0, 0) 과 일치 ✓

### 계약 전용(contract-only) 최종 확인

1. `contract/category/*` 무변경: `/usr/bin/git diff --name-only 78813e9 HEAD | grep contract/category` → 없음 ✓
2. src/main 구현체 없음: Rule 6 변이 빨강 확인 ✓
3. `MdmTemporalSegmentStore` 인터페이스만: 확인 ✓

### 발견사항

**Unverified risk (MSSQL)**: `MdmLocalDateTimeIdUserType.getSqlType()` 이 방언 구분 없이 항상 `Types.VARCHAR` 반환 — Hibernate 가 VALID_FROM(VARCHAR)과 VALID_TO(DATETIME2) 타입 불일치로 직접 HQL 비교 시 예상 밖 결과 가능 (도커 금지로 검증 불가). TSK-07-03 서비스 코드에서 현장 검증 필요 (수정하지 않고 보고만 함).

---

---

## Phase 06 직전 dev 재머지·Flyway 재채번 기록(오케스트레이터)

- **팀장 지시로 Flyway 버전을 V7 → V10 으로 재채번했다.** 팀장이 번호 배정표를 폐기했다(dev 에 V8(TSK-08-01)·V9(TSK-06-01)가 먼저 머지되어 V7 은 역순 도착이라 머지 관문 migration-check 에 걸린다). done 직전에 origin/dev 를 이 브랜치에 머지한 뒤 `mdm/{sqlite,mssql}` 의 최대 버전(V9)+1 로 두 파일을 `V10__create_mdm_master_data.sql` 로 옮겼다. 본문(F1·§2·§3·§5)의 「V7」은 모두 이 V10 을 가리킨다. F1 의 순서 위험(V5·V6 공백)은 재채번으로 사라졌다.
- 버전을 기대하는 테스트를 함께 고쳤다: `MdmSharedContractMigrationTest`(SQLite, `{1,2,3,4,8,9,10}`), `MdmMasterDataMigrationTest`(`version = '10'`), `MdmMasterDataDdlParityTest`(리소스 경로 V10), mssqlTest 4개(`MdmMssqlMigrationTest` 7건·target `"10"`, `MdmInterfaceLayoutMssqlMigrationTest`·`MdmTermDomainColumnMssqlMigrationTest`·`MdmMasterDataMssqlMigrationTest` 버전 집합). 완화가 아니라 새 버전 반영이다. mssqlTest 는 여전히 컴파일만 확인한다(사용자 결정: 도커 금지로 MSSQL 실측 생략, DDL 리뷰로 대체).
- **SQLite 일시 컨버터를 dev 쪽 한 벌로 합쳤다.** dev 에 TSK-08-01·06-01 이 먼저 넣은 `common.support.MdmSqliteLocalDateTimeConverter`+`MdmSqliteTemporalContributor`(`application-local.yml` 등록, 형식 `yyyy-MM-dd HH:mm:ss`·초 절삭)가 이 Task 의 `persistence.LocalDateTimeAttributeConverter`+`MdmSqliteTemporalConverterContributor`(§2 생성, 이탈 3)와 목적·형식이 같다. `metadata_builder_contributor` 는 하나만 등록되므로 dev 쪽을 남기고 이 Task 의 두 파일을 지웠다. 불변 규칙 8 의 검증(§3.2 `typeof` 단정)은 합친 컨버터로 그대로 돈다. `@Id` 인 `VALID_FROM` 은 여전히 `MdmLocalDateTimeIdUserType`(D3)을 쓴다.
- **decisions.md 결정 번호를 임시 ID 로 바꿨다(팀장 지시).** Build 가 쓴 전역 번호 D-050·D-051·D-052 는 dev 의 다른 Task 와 겹치므로 `D-TSK-07-01-1`·`-2`·`-3` 으로 바꿨다. 머지 때 decisions.sh 가 다음 전역 번호를 매긴다. 이 문서의 참조도 같이 바꿨다.
- naming-dialect-rules.md 는 dev 판을 기준으로 삼고, 이 Task 의 05 기록(§3 #2·#16·#19)을 V10·합친 컨버터·임시 결정 ID 에 맞게 고쳐 각 행 끝에 덧붙였다.

