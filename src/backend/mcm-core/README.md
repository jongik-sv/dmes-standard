# mcm-core

MES 공통(마스터데이터·공통 서비스) 도메인을 담는 **공유 코어 라이브러리** 모듈이다.

## 모듈 성격

- `mcm`, `mls`, `mqc`, `mpp` 등 MES 계열 애플리케이션 모듈이 공통으로 의존하는 라이브러리다.
  의존 방향은 항상 `MES 애플리케이션 모듈 → mcm-core` 한 방향이며, 반대 방향 참조는 두지 않는다.
- 실행 가능한 Spring Boot 애플리케이션이 아니라 `java-library` 다. 스프링 스타터·MyBatis 스타터는 `compileOnly`
  로만 참조하고, 데이터소스·트랜잭션 매니저·시큐리티 필터체인 같은 런타임 빈은 **호스트 애플리케이션**(cactus-core
  기반 모듈)이 제공한다.
- JPA 를 기본으로 하되, 복잡한 조회는 MyBatis 매퍼를 함께 쓰는 하이브리드 패턴을 허용한다.
  그래서 `mybatis-spring-boot-starter` 가 `compileOnly` 로 들어 있다.
- `com.dongkuk.dmes:mcm-core` 아티팩트로 발행된다. 발행 저장소 설정은 `build.gradle` 하단에 주석으로 준비돼 있으며,
  자격증명은 반드시 환경변수(`NEXUS_USERNAME` / `NEXUS_PASSWORD`)로 주입한다. **자격증명을 파일에 적지 않는다.**

## 들어 있는 것 — 공통관리 실동작 코드

아래는 예시가 아니라 **그대로 쓰는 실동작 구현**이다. 새 고객사 프로젝트에서 로그인·권한·메뉴·마스터코드·
업무기준이 첫날부터 동작한다. 화면 그룹 코드(`cma` 등)의 의미는 `docs/guide/design/01_Agent부속_가이드.md` 를 따른다.

| 패키지 | 메뉴 위치 | 화면 |
| --- | --- | --- |
| `cma` | 공통관리 › 마스터관리(원장) | 카테고리 관리 · Master Code 관리 (+ 코드선택·엑셀업로드 팝업) |
| `cme` | 공통관리 › 마스터관리(가동) | Master Code 상세조회 |
| `cmb` | 공통관리 › 업무기준관리(원장) | 업무기준 목록조회 · Data관리 · 상세조회 · 구조관리 (+ 팝업 3종) |
| `csa` | 공통관리 › 시스템관리 | OBJECT · 메뉴 · 역할 · 역할그룹 · 사용자 · PERMISSION · 사용자 권한 일괄 등록 · 동기화 관리 |

이들을 떠받치는 공통 계층:

| 패키지 | 역할 |
| --- | --- |
| `entity` · `repository` | SEC_* (사용자·역할·역할그룹·권한·메뉴·OBJECT) 와 마스터코드 엔티티/리포지토리 |
| `security` | 권한키(PermKey) 산출, 사용자 권한 캐시, 메뉴 트리 조립 |
| `code` | 코드그룹·코드값 서비스 |
| `favorite` | 포털 즐겨찾기 |
| `screenusage` | 포털 화면 사용 구간 기록(`screenUsage/record`, AUTH_ONLY) · 02:00 일별 집계·1년 보관(`ScreenUsageRollup`) · 통계 6종(`screenUsageStat` — 퍼사드 `ScreenUsageStatService` 가 탭별 `ScreenUsage*Query` 로 넘기고 공통 합산은 `ScreenUsageStatSupport`) |
| `audit` · `common.audit` | 감사 로그 + native SQL 에 audit 9 컬럼을 주입하는 Hibernate StatementInspector |
| `common` | 예외·이벤트·보안 신원·클라이언트 IP·날짜 유틸 등 공통 부품 |
| `config` | `McmCoreAutoConfiguration` · `McmSecurityDefaults` (호스트가 쓰는 기본 URL 매처) |

화면 진입점은 REST 컨트롤러가 아니라 **OASIS BPMN** 이다. `mcm/api/src/main/resources/services/{그룹}/{화면}.bpmn`
의 `camunda:class` 가 위 `service` 빈을 호출한다. BPMN 을 만지면 `oasis-contract-check` 스킬로 계약을 검사한다.

## sample 패키지는 플레이스홀더다

`com.dongkuk.dmes.mcm.sample` 는 실제 업무 코드가 아니라 **계층 구조 예시**다. 위 실동작 패키지들이 이미 같은
구조를 따르므로, 신규 도메인을 만들 때는 `sample` 보다 `cma` / `cmb` 를 참고하는 편이 낫다.

```
com.dongkuk.dmes.mcm.<그룹>.<화면>
├── dto/          요청·응답 record. 응답은 엔티티를 노출하지 않고 정적 from() 으로 변환
└── service/      트랜잭션 경계. 클래스는 readOnly, 쓰기 메서드에만 @Transactional
com.dongkuk.dmes.mcm
├── entity/       JPA 엔티티 (Lombok @Getter/@Builder, 기본 생성자는 PROTECTED)
└── repository/   Spring Data JPA 리포지토리 (복잡 조회는 MyBatis 매퍼 병용)
```

## 스키마 관리

Oracle 단일화(oracle-1007, 2026-10-07)부터 mcm 스키마의 정본은 `src/main/resources/db/migration/oracle/` 의
스키마별 기준선이다. 스키마 폴더마다 Flyway 하나가 그 스키마를 `defaultSchema` 로 두고 돈다.

| 폴더 | 스키마 | 내용 |
| --- | --- | --- |
| `oracle/mcmapuser/` | MCMAPUSER | mcm 기본 영속성 단위의 MCMAPUSER·접두 없는 엔티티, `TB_MCM_SEC_MENU_FLD`, 마스터코드 조회 사본 3표, `VI_MCM_CODE_ACCESS` |
| `oracle/mcm_source/` | MCM_SOURCE | 마스터코드 원장 3표(`MasterCode*` 엔티티) + mcm 앱 사용자 권한 |
| `oracle/mcm_backup/` | MCM_BACKUP | 마스터코드 백업 2표(동기화 화면이 원장에서 `SELECT *` 로 복사 — 열 순서가 원장과 같아야 한다) + 권한 |
| `oracle/mcaapuser/` | MCAAPUSER | 업무기준 2표(`RuleMaster`·`MasterRuleColList`) + mcm 앱 사용자 권한 |

- DDL 은 스키마 접두 없이 쓴다. 런타임 SQL 의 접두(`MCMAPUSER.` 등)는 그대로 둔다.
- `${app_user}` 는 Flyway 자리표시자다. mcm 앱이 접속하는 사용자(로컬·운영 모두 MCMAPUSER)로 넣는다.
- 스키마 폴더마다 Flyway 는 **그 스키마의 주인으로 접속**한다(GRANT 는 표 주인만 줄 수 있다). `locations` 는 그 폴더 하나로
  좁힌다 — `classpath:db/migration/oracle` 처럼 넓히면 V1 네 벌이 한 이력에 섞여 부팅이 실패한다.
- 전제는 Oracle 12.2 이상이다(30자 넘는 제약 이름, IDENTITY). boolean 칸은 `NUMBER(1)` 이고 앱 설정에
  `hibernate.type.preferred_boolean_jdbc_type=BIT` 가 있어야 validate 가 맞는다(`docs/oracle-1007/schema-owners.md` §3.1.1).
- CARAVANUSER·EAIUSER·IFUSER 기준선은 caravan-hub 가 갖는다(mcm-core 에 두지 않는다).
- 운영(WildFly)은 Flyway 를 끄고 DBA 가 같은 파일을 적용한다.
- 다음 번호는 **바꾸려는 스키마 폴더의 최대 V + 1** 로 직접 정한다. `/flyway-migration-add` 스킬의 `status` 는 아직
  `oracle/<스키마>/` 한 단 아래 폴더를 보지 못해 늘 V1 을 권한다(2026-10-07 확인).

옛 `db/migration/sqlite/`(V1~V18, 실행되지 않던 이력)·`db/migration/mcm-core/`(샘플 플레이스홀더)·`db/seed/oasis/`
(옛 `TB_SEC_OBJ` 대상 시드), SQLite 치환기 `McmSqliteMybatisInterceptor`(`archive/main/audit/`), SQLite 날짜 변환기 `SqliteTemporalConverterContributor`·`LocalDate(Time)AttributeConverter`(`archive/main/persistence/`, ③e)는 `archive/` 로 옮겼다. 빌드·시험 대상이 아니다.

화면 사용 통계 테이블(`TB_SEC_SCREEN_USAGE_LOG`·`TB_SEC_SCREEN_USAGE_DAY`)은 감사 계열처럼 schema 접두가 없다.
Oracle DDL 은 `oracle/mcmapuser/V1__baseline.sql` 에 있다. dmes-ksm 이관 시절의 MSSQL 판 `ScreenUsageMssqlDdl` 은
`archive/main/screenusage/` 로 옮겼다(oracle-1007 ③b).

## 새 도메인을 추가할 때

1. 여러 MES 모듈이 함께 쓰는 것만 이 모듈에 둔다. 한 모듈 전용 로직은 해당 애플리케이션 모듈에 둔다.
2. 화면 단위 패키지는 `{그룹}/{화면}/{dto,service}` 구조를 지킨다 (`cma`·`cmb`·`csa` 가 표준 예시).
3. 엔티티를 추가·변경하면 스키마 반영 경로(ddl-auto 로 충분한지, `DataInitializer` 멱등 DDL 이 필요한지)를
   같은 커밋에서 함께 정한다.
4. 공유 라이브러리인 만큼 계층 의존 규칙이 무너지기 쉽다. `McmCoreArchitectureTest`(ArchUnit) 가 패키지 의존
   규칙을 고정하고 있으니, 새 규칙이 필요하면 그 테스트에 추가한다.

## 빌드

```bash
../gradlew :test        # 단위 테스트
../gradlew :build       # 컴파일 + 테스트 + jar
```

JDK 21 로 빌드한다.
