# DMES MCM — 멀티 환경 DataSource / WildFly JNDI 전환 설계서

> **DB 전제 안내 (2026-10-07, oracle-1007)**: 운영 DB 는 Oracle 이고, 이 문서의 데이터소스 구성은 Oracle 26ai 이전(oracle-1007) 뒤의 코드와 yml 을 기준으로 갱신했다. JNDI 이름은 `java:/jdbc/{모듈}/{DS}` 이다(mcm 은 `java:/jdbc/mcm/dsBiz`·`dsCmn`·`dsCaravan`·`dsIF`). 이전에는 SQL Server 와 `java:/jdbc/mssql/{모듈}/{DS}` 이름을 썼고, 이름에서 DB 종류를 뺀 결정은 §2-1 에 남겼다. 본문에 남은 MSSQL 언급은 모두 「이전에는 MSSQL 이었다」 는 설계 이력이다. 이 파일은 한때 본문이 깨진 인코딩(UTF-8 이중 변환)으로 저장돼 있었고, 2026-10-07 갱신 때 정상 UTF-8 로 되돌렸다.

> ⚠ **구현 반영 문서**: WildFly JNDI DataSource 전환 설계 + 구현 기록. mcm·caravan-hub(§11)는 코드 적용 완료, mdm 은 §13 에 정리했다. mqc/mpp/mpn/mls(§12)는 2026-07-13 MSSQL 시절 구현 기록이며 이 워크트리 코드로는 확인하지 못했다(§12 안내). 현행 구현과 함께 참고한다.

> 일시: 2026-06-24 11:23 (개정: 2026-07-02 — 6-프로파일 구조로 재설계 / 2026-07-07 — 영향도 분석 결과 반영: cactus-core 보완 2건·mcm 프로파일 리터럴 2곳·드라이버 core→api 이동·init 게이트·기본 프로파일 폴백)
> 프로젝트: dmes-aps (MES 라우터 / cactus-core 공통 인프라)
> 작업 디렉토리: D:\dmes-standard\workspace-ksm\dmes-aps
> 적용 우선순위: **MCM 모듈 먼저 적용**
> 상태: 처음에는 설계(코드 미수정, 승인 후 구현 착수)였고, 지금은 mcm·caravan-hub·mdm 이 구현돼 있다(위 안내 참조).

---

## 0. 문서 목적

**개발서버 2곳(포항·김포) + 운영 1곳** 을 단일 WAR 산출물로 운용하기 위한 DataSource 구성 설계.
로컬 개발(bootRun)은 **JNDI를 쓰지 않고 DataSource 직결**, WildFly 배포 환경만 JNDI를 사용한다.

| profile | 환경 | DB | 실행 방식 | 커넥션 관리 | JNDI |
|---------|------|----|----------|-----------|------|
| **local** | 개발자 로컬 | **Oracle**(로컬 PDB, 이전에는 SQLite) | `bootRun`(내장 Tomcat) | 앱 직접(HikariCP) | ❌ |
| **local-ph** | 개발자 로컬 → **포항 개발 DB** | Oracle(이전에는 SQL Server) | `bootRun`(내장 Tomcat) | 앱 직접(HikariCP) | ❌ |
| **local-kp** | 개발자 로컬 → **김포 개발 DB** | Oracle(이전에는 SQL Server) | `bootRun`(내장 Tomcat) | 앱 직접(HikariCP) | ❌ |
| **dev** | **포항·김포 개발계** | Oracle(이전에는 SQL Server) | WildFly(WAR) | WildFly(IronJacamar) | ✅ |
| **prod** | **김포 운영계** | Oracle(이전에는 SQL Server) | WildFly(WAR) | WildFly(IronJacamar) | ✅ |

핵심 정리
- **local 계열 3개(local / local-ph / local-kp) = 앱 직결(Hikari)**. JNDI 미사용.
  - `local` = 로컬 Oracle PDB 직결(이전에는 SQLite), `local-ph` = 포항 개발 DB 직결, `local-kp` = 김포 개발 DB 직결.
  - local-ph/local-kp 는 개발자가 로컬에서 실제 개발 DB를 보며 개발/디버깅하는 용도.
- **WildFly 계열 2개(dev / prod) = JNDI**.
  - `dev` **하나의 프로파일을 포항·김포 두 WildFly에 공통 배포**한다. 두 개발계는 환경이 거의 동일하므로 프로파일을 나누지 않는다(§1 원칙3).
  - JNDI **논리 이름은 모든 WildFly에서 동일**, **물리 접속정보만 각 WildFly가 다르게** 보유한다.

> **적용 범위(2026-10-07 확인)**: `local-ph`/`local-kp` 는 이 워크트리에서 caravan-hub 에만 yml 이 있다(Oracle 직결, 접속값은 환경변수 필수). mcm 은 `application.yml`·`application-local.yml`·`application-wildfly.yml`·`application-dev.yml`·`application-prod.yml` 만 있고, 옛 `local-db`(SQL Server 직결)는 `src/backend/mcm/archive/` 로 옮겼다. 그래서 mcm 의 local-ph/local-kp 설명(§4-6, §4-7)은 설계 기록이다.

> **왜 로컬은 JNDI를 안 쓰나** — bootRun 내장 Tomcat에는 컨테이너가 등록한 JNDI DataSource(`java:jboss/...`, `java:comp/env/...`)가 **존재하지 않는다**. 억지로 쓰려면 부팅 시 JNDI 컨텍스트를 코드로 등록해야 하며 이득이 없다. 로컬은 Hikari 직결이 단순하고 정답이다.

---

## 1. 설계 4대 원칙

### 원칙 1 — 한 코드, 두 경로 (jndi-name 유무로 분기)
DataSource를 생성하는 단 두 지점에서 `jndi-name` 프로퍼티 존재 여부로 분기한다.
- `jndi-name` **있음** → `JndiDataSourceLookup` (WildFly: dev/prod)
- `jndi-name` **없음** → `HikariDataSource` 직결 (local / local-ph / local-kp)

→ 로컬 개발(bootRun) 3개 프로파일은 **JNDI 무영향**으로 Hikari 직결을 그대로 사용한다.

### 원칙 2 — Build Once, Deploy Anywhere (WAR 한정)
`mcm.war`는 환경에 무관하게 **동일 산출물**이다. **WildFly 배포 환경(dev/prod)** 의 물리 접속정보(서버 IP/계정/비밀번호/풀 크기)는 WAR가 아니라 **각 WildFly의 standalone.xml**이 소유한다. 환경 전환 = 다른 WildFly에 배포 + `-Dspring.profiles.active` 변경뿐.

> local-ph/local-kp 의 직결 접속정보는 **개발자 bootRun 전용**으로 앱 yml에 존재한다. 이는 WAR 산출물이 아니라 로컬 실행 편의값이므로 "Build Once"(WAR) 원칙과 충돌하지 않는다. 단, 실제 계정/비번이 yml에 들어가므로 §10 보안 항목 참조.

### 원칙 3 — 동일 논리명, 환경별 물리 매핑 (dev 단일 프로파일)
JNDI 논리 이름(`java:/jdbc/mcm/dsBiz`)은 **포항·김포·운영 WildFly에서 모두 동일**. 같은 이름이 환경마다 다른 물리 DB를 가리킨다. 논리 이름은 **시스템 프로퍼티/환경변수로 override 가능하되 표준 기본값을 둔다**(§2-1, §4-3).
→ 포항·김포 개발계는 DataSource 관점에서 완전히 동일하고 DB 외 환경 차이도 거의 없으므로 **`dev` 단일 프로파일을 두 WildFly에 공통 배포**한다. 운영만 `prod` 로 분리한다.

### 원칙 4 — 트랜잭션은 resource-local 유지 (`jta=false`)
현행 DataSource별 TxMgr(`txBiz/txCmn/txIF/txCaravan`, resource-local) 구조를 유지한다. WildFly DataSource를 반드시 **`jta="false"`** 로 정의해 컨테이너 JTA enlist를 막는다(미설정 시 Spring resource-local 트랜잭션과 충돌). 분산 2PC는 도입하지 않는다(세 스키마가 동일 물리 DB이고 현행 설계가 이미 비원자 전제).

---

## 2. MCM DataSource 인벤토리

MCM은 4개 DataSource를 사용한다. Oracle 에서 **계정(USER)=스키마로 분리**한다(로컬은 한 PDB 에 사용자만 달리해 붙는다. 스키마 소유표는 `docs/oracle-1007/schema-owners.md`). 이전에는 SQL Server 단일 DB(`ksm_dmes`)였다. `biz/cmn/if` 는 **전 모듈 표준 3종**(표준 tx `txBiz/txCmn/txIF` 대응), `caravan` 은 MCM 확장이다.

| 논리(alias) | 역할 | 계정(스키마) | override 프로퍼티 | JNDI 기본값(WildFly 공통) | local(로컬 Oracle PDB) |
|------|------|-----------|------------------|------------------|---------------|
| **biz** (primary) | MCM 비즈니스 원장 | MCMAPUSER | `JNDI_DS_BIZ` | `java:/jdbc/mcm/dsBiz` | MCMAPUSER 로 접속 |
| **cmn** | 공통(표준 3종) | MCMAPUSER | `JNDI_DS_CMN` | `java:/jdbc/mcm/dsCmn` | MCMAPUSER 로 접속 |
| **if** | 인터페이스 송수신 | EAIUSER | `JNDI_DS_IF` | `java:/jdbc/mcm/dsIF` | EAIUSER 로 접속 |
| **caravan** | Kafka 메타(Serai) | CARAVANUSER | `JNDI_DS_CARAVAN` | `java:/jdbc/mcm/dsCaravan` | CARAVANUSER 로 접속 |

> **cmn 도입(2026-07-02)** — 타 모듈이 cmn 을 표준으로 쓰므로 MCM 도 **통일**한다. 현행의 "`txCmn`→biz alias(cmn 안 씀)" 방식을 폐기하고, cmn 을 독립 DataSource 로 두어 **`txCmn`→cmn** 으로 재배선한다.
> MCM 에서 cmn 의 물리 계정은 **biz 와 동일 `MCMAPUSER`**(공통 데이터가 앱 스키마에 상주). local 도 같은 PDB 에서 biz 와 같은 `MCMAPUSER` 로 붙는다(이전 SQLite 시절에는 biz 와 같은 `mcm.db` 파일을 공유했다). → *cmn 이 별도 계정/DB 를 써야 한다면 이 표와 §4·§5 를 조정.*

### 2-1. JNDI 이름 규약 (override + 표준 기본값)

- **명명 규칙**: `java:/jdbc/{모듈명}/{DS명}` (예: `java:/jdbc/mcm/dsBiz`). DB 종류를 이름에 넣지 않는다(oracle-1007, 2026-10-07 에 옛 `java:/jdbc/mssql/mcm/*` 이름을 이렇게 바꿨다).
  - WildFly 는 datasource `jndi-name` 이 반드시 `java:/` 또는 `java:jboss/` 로 시작해야 한다(미준수 시 부팅 시 `WFLYJCA0117` 거부). → 접두어 `java:/` 필수.
  - Spring `JndiDataSourceLookup` 은 위 절대명을 그대로 조회하므로 앱·컨테이너 양쪽이 동일 이름을 공유.
- **override 방식**: yml 값을 `${PROP:기본값}` 플레이스홀더로 두어, 기본값(표준 이름)으로 그대로 동작하되 필요 시 시스템 프로퍼티/환경변수(`JNDI_DS_BIZ` 등)로만 덮어쓴다. **순수 프로퍼티(기본값 없이) 금지** — 미주입 시 부팅 실패.
- WildFly standalone.xml 의 `jndi-name` 도 동일 규약(기본값)으로 정의한다.
- **모듈 간 통일**: 표준 3종 `dsBiz/dsCmn/dsIF` + (모듈별 확장). override 프로퍼티도 `JNDI_DS_BIZ/JNDI_DS_CMN/JNDI_DS_IF/…` 로 전 모듈 동일 규약을 쓴다. `{모듈명}` 만 바뀐다(mcm → `java:/jdbc/mcm/dsCmn`, 타 모듈 → `java:/jdbc/{그모듈}/dsCmn`).

### 2-2. 앱별 JNDI 이름과 override (oracle-1007 기준, 각 앱 application-wildfly.yml 에서 확인)

| 앱 | alias | JNDI 기본값 | override(`-D` 또는 환경변수) | 계정 |
|----|-------|------------|------------------------------|------|
| mcm | biz (primary) | `java:/jdbc/mcm/dsBiz` | `JNDI_DS_BIZ` | MCMAPUSER |
| mcm | cmn | `java:/jdbc/mcm/dsCmn` | `JNDI_DS_CMN` | MCMAPUSER |
| mcm | if | `java:/jdbc/mcm/dsIF` | `JNDI_DS_IF` | EAIUSER |
| mcm | caravan | `java:/jdbc/mcm/dsCaravan` | `JNDI_DS_CARAVAN` | CARAVANUSER |
| caravan-hub | mst (@Primary) | `java:/jdbc/mcm/dsCaravan` | `JNDI_DS_MST`, 없으면 `JNDI_DS_CARAVAN` | CARAVANUSER |
| caravan-hub | if | `java:/jdbc/mcm/dsIF` | `JNDI_DS_IF` | EAIUSER |
| mdm | biz | `java:/jdbc/mdm/dsBiz` | `JNDI_DS_BIZ` | MDMAPUSER(`schema-owners.md` 기준) |

- caravan-hub 는 전용 데이터소스를 만들지 않고 **mcm 이 WildFly 에 등록한 `dsCaravan`·`dsIF` 를 같이 쓴다**(§11). hub 의 mst 는 dsCaravan(CARAVANUSER), if 는 dsIF(EAIUSER)다. mcm·hub 모두 WildFly datasource 를 `jta="false"` 로 정의한다(원칙 4).
- `JNDI_DS_IF` 는 mcm·hub 공통 이름이고, `JNDI_DS_CARAVAN` 도 두 앱이 모두 읽는다(hub 는 `JNDI_DS_MST` 를 먼저 본다). 같은 JVM(WildFly 인스턴스)에 두 앱을 올리면 시스템 프로퍼티·환경변수를 공유하므로 한쪽 이름만 바꿀 수 없다. 이름을 바꿀 때는 두 앱이 같은 이름을 보게 한다.
- mdm 은 `JNDI_DS_BIZ` 하나이고 기본값은 `java:/jdbc/mdm/dsBiz` 다. mdm 의 wildfly yml 에는 방언 설정이 없고 Hibernate 가 연결 메타데이터로 판정한다(그 yml 주석).

---

## 3. 코드 변경 설계 (3개 변경점)

### 3-1. cactus-core — extras용 JNDI 분기 (재사용 공통 인프라)

**파일**: `src/backend/cactus-core/.../datasource/CactusDataSourceProperties.java`
→ `DataSourceProps`에 필드 추가:
```java
/** WildFly 등 외부 컨테이너 관리 DataSource의 JNDI 이름. 설정 시 url/username/password/driver 무시하고 JNDI lookup. */
private String jndiName;
// getter/setter
```

**파일**: `src/backend/cactus-core/.../datasource/CactusMultiDataSourceAutoConfiguration.java`
→ `buildHikari` 호출부를 분기 메서드로 교체:
```java
private DataSource buildDataSource(CactusDataSourceProperties.DataSourceProps p, String poolName) {
    if (p.getJndiName() != null && !p.getJndiName().isBlank()) {
        // WildFly(dev/prod): 컨테이너 관리 풀을 JNDI로 조회
        return new org.springframework.jdbc.datasource.lookup.JndiDataSourceLookup()
                .getDataSource(p.getJndiName());
    }
    // local / local-ph / local-kp: 기존 HikariCP 직결
    return buildHikari(p, poolName);
}
```
→ `registerExtra()`에서 `buildHikari(...)` 대신 `buildDataSource(...)` 호출. **하위호환**: jndiName 미설정이면 기존 동작 100% 동일(다른 모듈/로컬 무영향).

**⚠️ 영향도 분석(2026-07-07)으로 확인된 추가 수정 2건 — 분기만으론 부족:**

1. **빈 정의 하드코딩 분기**: `CactusMultiDataSourceAutoConfiguration.postProcessBeanDefinitionRegistry` 의 extras 등록부가 `bd.setBeanClass(HikariDataSource.class)`(L76) + `bd.setDestroyMethodName("close")`(L79) 를 하드코딩한다. jndiName 경로에서는:
   - `beanClass` 를 `javax.sql.DataSource` 로 설정
   - **`destroyMethodName` 을 설정하지 않음** (설정 시 앱 셧다운 때 Spring 이 WildFly **컨테이너 관리 풀을 close** 하려 시도 — 컨테이너 풀 파괴/에러)
2. **MyBatis 자동설정 활성 조건 완화**: `CactusMultiMybatisAutoConfiguration` 의 `sqlSessionFactory{If,Cmn,...}`/`sqlSessionTemplate{...}` 빈이 `@ConditionalOnProperty(prefix="cactus.datasource.extras.<alias>", name="url")` 로 게이트되어 있다(L104, L115). **jndi-name 만 설정된 extras 는 url 이 없어 SqlSessionFactory/Template 이 생성되지 않고**, OASIS `CactusMultiMyBatisSqlRunner.resolveSession` 이 "No SqlSessionTemplate matching DataSource" 런타임 예외를 던진다(L122-124). → 조건을 **`url` OR `jndi-name`** 으로 완화(커스텀 Condition 또는 `@ConditionalOnExpression`).

> 참고(수정 불요 확인): cactus-core 에 DataSource 를 Hikari 로 캐스팅/close/메트릭 등록하는 소비 코드는 없음 — 위 2건만 고치면 JNDI DataSource 가 EMF/TxMgr/MyBatis/OASIS 전 소비층에 안전하게 흐른다. `@ConditionalOnClass(HikariDataSource.class)`(L39) 게이트가 있으므로 HikariCP 의존성은 클래스패스에 유지할 것(local 직결에도 필요).

### 3-2. mcm host — primary(biz) JNDI 분기

**파일**: `src/backend/mcm/api/.../config/JpaConfig.java`
```java
@Bean @Primary
public DataSource dataSource(Environment env) {
    String jndiName = env.getProperty("spring.datasource.jndi-name");
    if (jndiName != null && !jndiName.isBlank()) {
        return new JndiDataSourceLookup().getDataSource(jndiName);   // WildFly 경로(dev/prod)
    }
    // 기존 HikariDataSource 빌드 로직 유지 (local / local-ph / local-kp)
    HikariDataSource ds = new HikariDataSource();
    ... // 현행 그대로
    ds.setPoolName("mcm-host-primary");
    return ds;
}
```

### 3-3. build.gradle: JDBC 드라이버 의존성 (이력: core → api 이동)

**이력(영향도 분석 2026-07-07, MSSQL 시절)**: `mssql-jdbc` 를 `:lib`(구 :core)의 `api` 에서 `:api` 의 `providedRuntime` 으로 옮겨 WAR 에서 빼는 설계였다. `:lib` 은 java-library 라 `providedRuntime` 설정이 없어 단순 스코프 변경이 안 됐기 때문이다. `providedRuntime` 은 runtimeClasspath 에는 남으므로 bootRun 직결에는 영향이 없다.

**현재(oracle-1007, 2026-10-07 확인)**: MSSQL·SQLite 드라이버는 빠졌고 Oracle 드라이버만 둔다.
- `mcm/lib/build.gradle`: `api libs.ojdbc11`, `api libs.flyway.database.oracle`.
- `caravan-hub/build.gradle`: `runtimeOnly libs.ojdbc11`, `runtimeOnly libs.flyway.database.oracle`.
- `mcm/api`·`caravan-hub`·`mdm/api` 의 `providedRuntime` 은 tomcat-embed 3종뿐이다. ojdbc11 은 `providedRuntime` 이 아니므로 선언상 WAR 의 WEB-INF/lib 에 들어가는 구성이다(bootWar 산출물은 열어 보지 않았다). WildFly 모듈 드라이버와 WAR 동봉 드라이버를 함께 둘지는 운영 결정이며 이 문서는 정하지 않는다(§5-1).
- war 플러그인(`mcm/api/build.gradle`) + `SpringBootServletInitializer`(`ServletInitializer.java`) + `bootWar → mcm.war` 는 구성돼 있다.

### 3-4. mcm 코드 동반 수정 — 프로파일명 리터럴 2곳 (★ 영향도 분석 발견)

프로파일 개명(`mssql`→`local-ph`, `dev`→`local-kp`/JNDI화)에 하드코딩으로 결합된 **실행 코드**가 2곳 있다. yml 개명과 **반드시 동시에** 수정한다.

1. **`McmApplication.java:71`** — `profiles.contains("local") && !profiles.contains("mssql")` 조건으로 SQLite extras 경로 override 를 게이트. `mssql` 폐기 후 `!contains("mssql")` 이 항상 참 → 프로파일 조합에 따라 MSSQL 실행에 SQLite override 가 오발동 가능. **신 체계 기준으로 재작성**(예: `local` 단독 활성일 때만 override — MSSQL 직결/JNDI 프로파일(`local-ph`/`local-kp`/`dev`/`prod`) 부재 조건).
2. **`DataInitializer.java:2579`** — 샘플 시드(RuleMaster) 게이트가 `p.equals("local") || p.equals("mssql") || p.equals("dev")` 리터럴. 개명 후 `local-ph`/`local-kp` 에서 시드가 **조용히 중단**되고, 신 `dev`(WildFly JNDI)에서는 **의도치 않게 시드 대상**이 된다. → 신 이름으로 재작성 + 시드 허용 티어 재결정(권장: `local`/`local-ph`/`local-kp` 만, WildFly 계열 제외).

> **구현 결과(2026-10-07 코드 확인)**: `McmApplication.main()`(McmApplication.java:60)은 `spring.profiles.default=local` 폴백만 두고, 옛 `!contains("mssql")` 조건과 SQLite 경로 덮어쓰기는 걷어냈다. 시드 게이트는 `acceptsProfiles` 로 바뀌었다(RuleMasterSampleSeeder.java:50 은 `local`·`local-ph`·`local-kp`, DataInitializer.java:208 과 CoreRbacSeeder.java:276 은 `local`).

> 그 외 프로파일 결합 없음(전수 확인): `@Profile` 애너테이션 0건, 테스트 `@ActiveProfiles` 0건, 셸/CI/IDE 런설정 0건. 문서 2건만 갱신 대상(§7 Phase B 참고).

> **변경 범위 요약(개정)**: DataSource 를 *만드는* 2지점(§3-1·§3-2) + cactus-core 보완 2건(§3-1 빈정의/MyBatis 조건) + 드라이버 이동(§3-3) + mcm 프로파일 리터럴 2곳(§3-4). EMF/TxMgr/OASIS 는 완성된 DataSource 빈을 소비만 하므로 무수정.
> **txCmn 재배선 안전성 확인(2026-07-07)**: mcm/mcm-core 전체에 `@Transactional("txCmn")` 및 BPMN `tx="txCmn"` 사용처 **0건**(모든 쓰기는 OASIS default-manager txBiz / 무한정 @Transactional 경유) → §4-2 의 txCmn→cmn 재배선은 기존 비즈니스 로직의 트랜잭션 의미를 바꾸지 않는다.

---

## 4. yml 프로파일 구조 설계

### 4-1. 파일 트리 (mcm/api/src/main/resources)
```
application.yml             # base: cactus 구조 + 프로파일 그룹. 접속정보 없음
application-local.yml       # 로컬 Oracle PDB 직결 (Hikari, oracle-1007). 이전에는 SQLite
application-local-ph.yml    # 포항 개발 DB 직결 (Hikari). ← 이전 application-mssql.yml 을 개명/이관 (mcm 은 현재 파일 없음, caravan-hub 에만 있음)
application-local-kp.yml    # 김포 개발 DB 직결 (Hikari). ← 이전 application-dev.yml 을 개명/이관 (mcm 은 현재 파일 없음, caravan-hub 에만 있음)
application-wildfly.yml     # ★ JNDI datasource 블록 (dev/prod 공통)
application-dev.yml         # 포항·김포 개발계(WildFly): JNDI 환경 차이값만 (log/show-sql 등)
application-prod.yml        # 김포 운영계(WildFly): JNDI 환경 차이값만
```

> **마이그레이션 주의(개명 충돌)**:
> - 이전 `application-mssql.yml`(포항 직결) → **`application-local-ph.yml`** 로 이관 후 `mssql` 프로파일 폐기.
> - 이전 `application-dev.yml`(김포 직결) → **`application-local-kp.yml`** 로 이관. 그리고 **`application-dev.yml` 파일명은 재사용되어 JNDI 개발계 차이값 파일로 의미가 바뀐다.** (직결 → JNDI 로 역할 전환)
> - 설계 의도: JNDI 논리명이 dev/prod 동일하므로 **`application-wildfly.yml` 한 곳**에 datasource를 정의하고, dev/prod 는 datasource를 제외한 **진짜 차이값(로그레벨/show-sql/외부 엔드포인트/feature)** 만 가진다. → DRY + 단일 진실원.

### 4-2. application.yml (base) — 프로파일 그룹으로 wildfly 연결
```yaml
spring:
  application:
    name: mcm
  profiles:
    group:
      dev:  [wildfly]   # 포항·김포 개발계: dev 활성 시 wildfly(JNDI 블록)도 함께 활성
      prod: [wildfly]   # 김포 운영계
    # default active 는 기동 시 -Dspring.profiles.active 로 지정 (아래 §6)
    # ※ local / local-ph / local-kp 는 그룹에 없음 → JNDI 블록 미로딩 → Hikari 직결

cactus:
  datasource:
    primary-alias: biz
  jpa:
    extras:
      cmn:     { packages-to-scan: [], persistence-unit-name: cactus-cmn }   # 표준 3종 — MCM 현재 매핑 엔티티 없음
      if:      { packages-to-scan: [], persistence-unit-name: cactus-if }
      caravan:
        packages-to-scan: [com.dongkuk.dmes.kmc.host, com.dongkuk.dmes.kmc.seraiconfig, com.dongkuk.dmes.kmc.topic]
        persistence-unit-name: cactus-caravan
  tx:
    managers:
      txBiz:     { data-source: biz }
      txCmn:     { data-source: cmn }   # 통일(2026-07-02) — 기존 biz alias → 독립 cmn DS 로 재배선
      txIF:      { data-source: if }
      txCaravan: { data-source: caravan }
    default-manager: txBiz
```
> `txCmn` 을 cmn DS 로 재배선했다(기존엔 biz alias). MCM 에서 cmn 은 물리적으로 biz 와 동일 계정(MCMAPUSER)·동일 DB 를 가리키지만, 논리 DS/JNDI 이름은 표준 규약(`dsCmn`/`JNDI_DS_CMN`)을 따른다.
> ⚠️ **이전의 `active: local,mssql` 조합 제거.** 신 설계에서 local 계열(직결)과 dev/prod(JNDI)는 상호배타다. 로컬은 `local | local-ph | local-kp` 중 하나만, WildFly 환경은 `dev | prod` 중 하나만 활성한다.
> ⚠️ **기본 프로파일 공백 주의(★ 영향도 분석 반영)**: `active:` 를 제거하면 프로파일 없는 bootRun/IDE 기동은 datasource url 미설정으로 **부팅 실패**한다(현행 `bootRun` 태스크는 프로파일을 지정하지 않음 — `mcm/api/build.gradle` 은 workingDir 만 설정). 대응 중 택1:
> **채택(2026-07-07 구현)**: `McmApplication.main()` 에서 `setDefaultProperties(spring.profiles.default=local)`.
> base yml 선언보다 안전 — main() 경로(bootRun/IDE)에만 적용되고 WAR(ServletInitializer) 경로에는 미적용이라,
> WildFly 에서 `-Dspring.profiles.active` 누락 시 조용히 local(로컬 Oracle PDB)로 뜨지 않고 fail-fast 한다.

### 4-3. application-wildfly.yml — JNDI datasource (dev/prod 공통)
```yaml
spring:
  datasource:
    jndi-name: "${JNDI_DS_BIZ:java:/jdbc/mcm/dsBiz}"          # biz (MCMAPUSER)
  jpa:
    database-platform: org.hibernate.dialect.OracleDialect
    hibernate:
      ddl-auto: none                                         # 개발계/운영계 모두 스키마 사전 관리
  flyway:
    enabled: false                                           # §5-5

cactus:
  datasource:
    extras:
      cmn:     { jndi-name: "${JNDI_DS_CMN:java:/jdbc/mcm/dsCmn}" }          # MCMAPUSER (표준 3종)
      if:      { jndi-name: "${JNDI_DS_IF:java:/jdbc/mcm/dsIF}" }            # EAIUSER
      caravan: { jndi-name: "${JNDI_DS_CARAVAN:java:/jdbc/mcm/dsCaravan}" }  # CARAVANUSER
  jpa:
    extras:
      cmn:     { hibernate: { dialect: org.hibernate.dialect.OracleDialect, ddl-auto: none } }
      if:      { hibernate: { dialect: org.hibernate.dialect.OracleDialect, ddl-auto: none, properties: {...} } }
      caravan: { hibernate: { dialect: org.hibernate.dialect.OracleDialect, ddl-auto: none, properties: {...} } }
dmes:
  flyway:
    enabled: false                                           # McmFlywayConfig 도 끈다(§5-5)
```
> `properties: {...}` 는 if/caravan 의 `hibernate.physical_naming_strategy`(`PhysicalNamingStrategyStandardImpl`), `hibernate.type.preferred_instant_jdbc_type: TIMESTAMP`, `hibernate.type.preferred_boolean_jdbc_type: TINYINT` 를 줄인 표기다(local 과 같은 매핑, 공통 규약은 `docs/oracle-1007/schema-owners.md` §3.1). 실제 yml 은 `src/backend/mcm/api/src/main/resources/application-wildfly.yml` 이다.
> url/username/password/driver-class-name **전부 없음** — 물리 접속은 WildFly 소유.
> JNDI 이름은 `${PROP:기본값}` 형태(§2-1). 기본값만으로 동작하며, 특정 WildFly가 다른 이름을 쓸 때만 `JNDI_DS_BIZ`/`JNDI_DS_CMN`/`JNDI_DS_IF`/`JNDI_DS_CARAVAN` 를 `-D` 또는 환경변수로 override. **코드 변경 불필요**(Spring 이 플레이스홀더 자동 해석). 앱별 이름은 §2-2.

### 4-4. application-dev.yml (포항·김포 개발계, WildFly) — JNDI 차이값만
```yaml
spring:
  jpa:
    show-sql: true                 # 개발계: SQL 로깅 ON
logging:
  level:
    com.dongkuk.dmes.mcm: DEBUG
    org.hibernate.SQL: DEBUG
# ── DataInitializer 게이트 — WildFly 계열은 명시적으로 끔 (★ 영향도 분석 반영) ──
# DataInitializer 는 biz DS 로 시드를 수행한다(기본값 true. 스키마 DDL 은 Flyway V 파일 몫이라 DataInitializer 는 돌리지 않는다).
# 미명시 시 기본 true 로 WildFly JNDI 계정에 시드가 실행되는 사고 위험 → dev/prod 모두 명시 필수.
dmes:
  init:
    enabled: false
```
> 포항·김포 개발계는 하나의 `dev` 프로파일을 공유한다. 서버별 물리 DB 차이는 각 WildFly 의 JNDI 매핑(§5-3)이 담당하므로 앱 yml 은 동일해도 된다.
> 개발계에서 시드/스키마 적재가 필요한 시점에만 `enabled: true` 로 일시 전환(또는 `-Ddmes.init.enabled=true`) 후 원복한다.

### 4-5. application-prod.yml (김포 운영계, WildFly) — JNDI 차이값만
```yaml
spring:
  jpa:
    show-sql: false                # 운영: SQL 로깅 OFF
logging:
  level:
    root: WARN
    com.dongkuk.dmes.cactus: INFO
    com.dongkuk.dmes.mcm: INFO
    org.hibernate.SQL: WARN
# ── DataInitializer — 운영은 항상 끔 (★ 영향도 분석 반영) ──
dmes:
  init:
    enabled: false
# (운영 전용 외부 엔드포인트 등)
```

### 4-6. application-local-ph.yml (포항 개발 DB 직결, Hikari): 설계 기록(mcm 은 현재 파일 없음)
이전에는 `jdbc:sqlserver://10.10.80.241:1433;databaseName=ksm_dmes` 로 SQL Server 에 직결했다. Oracle 에서는 같은 구조를 다음 형식으로 쓴다. 접속값과 비밀번호는 환경변수로 받고 저장소에 두지 않는다(caravan-hub 의 `application-local-ph.yml` 이 같은 방식이다: `CARAVAN_HUB_ORA_URL`·`CARAVAN_HUB_MST_PASSWORD`·`CARAVAN_HUB_IF_PASSWORD`).
```yaml
spring:
  datasource:                      # biz → MCMAPUSER
    url: ${PH_ORA_URL}       # jdbc:oracle:thin:@//호스트:1521/서비스
    driver-class-name: oracle.jdbc.OracleDriver
    username: MCMAPUSER
    password: ${PH_ORA_PASSWORD}
  jpa:
    database-platform: org.hibernate.dialect.OracleDialect
    hibernate: { ddl-auto: none }
    show-sql: true
cactus:
  datasource:
    extras:
      cmn:     { url: ${PH_ORA_URL}, username: MCMAPUSER,   password: ..., driver-class-name: oracle.jdbc.OracleDriver, maximum-pool-size: 3 }
      if:      { url: ${PH_ORA_URL}, username: EAIUSER,     password: ..., driver-class-name: oracle.jdbc.OracleDriver, maximum-pool-size: 3 }
      caravan: { url: ${PH_ORA_URL}, username: CARAVANUSER, password: ..., driver-class-name: oracle.jdbc.OracleDriver, maximum-pool-size: 3 }
  jpa:
    extras:
      cmn:     { hibernate: { dialect: org.hibernate.dialect.OracleDialect, ddl-auto: none } }
      if:      { hibernate: { dialect: org.hibernate.dialect.OracleDialect, ddl-auto: none } }
      caravan: { hibernate: { dialect: org.hibernate.dialect.OracleDialect, ddl-auto: none } }
dmes:
  init:
    enabled: false                 # 읽기 전용 기동
```
> 변수 이름과 포항 개발 Oracle 의 호스트·서비스 이름은 이 문서의 예시이며 확인하지 못했다. 풀 상한 3 은 로컬 PDB 규약(`schema-owners.md` §3)을 따른 예시다.
> `jndi-name` 이 없으므로 코드 분기(§3)가 자동으로 Hikari 직결 경로를 선택.

### 4-7. application-local-kp.yml (김포 개발 DB 직결, Hikari): 설계 기록(mcm 은 현재 파일 없음)
구조는 4-6 과 같고 접속 대상만 김포 개발 Oracle 이다. 이전에는 `jdbc:sqlserver://${DB_HOST:172.16.2.154}:${DB_PORT:5010};databaseName=${DB_NAME:ksm_dmes}` 형식에 계정별 `*_DB_URL`·`*_DB_USER`·`*_DB_PASSWORD` 환경변수를 쓰는 SQL Server 직결이었다. 달라지는 값은 다음과 같다.
- 접속 URL 은 `jdbc:oracle:thin:@//호스트:1521/서비스` 형식이고 계정은 MCMAPUSER·EAIUSER·CARAVANUSER 다.
- `hibernate.ddl-auto` 는 `none`(스키마는 Flyway V 파일 몫). 이전의 `update` 는 SQL Server 시절 설정이다.
- `dmes.init.enabled: true`(김포 개발계 초기 시드 적재)는 이전 설계 그대로이며 현재 값은 확인하지 못했다.

### 4-8. application-local.yml (로컬 Oracle PDB): oracle-1007 에서 SQLite 를 대체
```yaml
mcm-local-ora:                     # 이 파일 안에서만 쓰는 줄임 키
  url: ${dmes.ora.url:jdbc:oracle:thin:@//${dmes.ora.host:localhost}:${dmes.ora.port:1521}/${dmes.ora.pdb:L_ORA_MCM_APP}}
  password: ${dmes.ora.password:dmes_password_123}
spring:
  datasource:
    url: ${mcm-local-ora.url}
    username: ${dmes.ora.user:MCMAPUSER}
    password: ${mcm-local-ora.password}
    driver-class-name: oracle.jdbc.OracleDriver
    hikari: { maximum-pool-size: 3 }
  jpa:
    database-platform: org.hibernate.dialect.OracleDialect
    hibernate: { ddl-auto: none }  # 스키마는 Flyway(dmes.flyway)
dmes:
  flyway: { enabled: true, password: "${mcm-local-ora.password}" }   # local 만 켠다. 스키마별 McmFlywayConfig
cactus:
  datasource:
    extras:
      cmn:     { url: ${mcm-local-ora.url}, username: MCMAPUSER,   password: ${mcm-local-ora.password}, driver-class-name: oracle.jdbc.OracleDriver, maximum-pool-size: 2 }
      if:      { url: ${mcm-local-ora.url}, username: EAIUSER,     password: ${mcm-local-ora.password}, driver-class-name: oracle.jdbc.OracleDriver, maximum-pool-size: 2 }
      caravan: { url: ${mcm-local-ora.url}, username: CARAVANUSER, password: ${mcm-local-ora.password}, driver-class-name: oracle.jdbc.OracleDriver, maximum-pool-size: 2 }
  # jpa.extras 는 cmn/if/caravan 모두 OracleDialect·ddl-auto none (if/caravan 은 4-3 의 properties 와 같은 매핑)
```
> 줄여 쓴 발췌이며 실제 파일은 `application-local.yml` 이다. 로컬 접속 규약(호스트·포트·PDB·비밀번호·풀 상한 3 이하)은 `docs/oracle-1007/schema-owners.md` §3 이다.
> 이전에는 `jdbc:sqlite:../data/mcm.db`(cmn 은 같은 파일, if/caravan 은 별도 파일)를 `org.sqlite.JDBC` 로 직결했다. 이 SQLite 직결과 SQLite 방언 클래스는 걷어냈다.
> `jndi-name` 이 없으므로 코드 분기(§3)가 자동으로 Hikari 경로 선택.
> ⚠️ local: biz 와 cmn 은 같은 `MCMAPUSER` 로 풀을 둘 만든다(풀 상한 3, 2). SQLite 시절의 파일 잠금 우려는 없어졌고, 대신 PDB 를 여러 레인이 공유하므로 풀 상한을 낮게 둔다.

> **프로파일 그룹 우선순위 주의**: `application-wildfly.yml`(공통)과 `application-{dev,prod}.yml`(차이값)은 **키가 겹치지 않게** 유지(전자=datasource/dialect/ddl-auto, 후자=log/show-sql/endpoint). 겹치지 않으면 그룹 활성 순서로 인한 override 혼동이 없다.

---

## 5. WildFly 환경별 설정 (포항 개발 / 김포 개발 / 김포 운영)

WildFly 서버는 물리적으로 **3대**(포항 개발, 김포 개발, 김포 운영)다. 이 중 포항·김포 개발 2대는 동일 `dev` 프로파일 WAR 를 배포받고, 김포 운영 1대만 `prod` 를 받는다. **각 WildFly 는 동일 JNDI 논리명에 자기 서버의 물리 DB를 매핑**한다.

### 5-1. Oracle 드라이버 모듈 (3개 WildFly 동일, 설계 예시)
이전에는 `com.microsoft.sqlserver` 모듈에 `mssql-jdbc` 를 올렸다. Oracle 로는 같은 방식으로 다음 모듈을 둔다. 드라이버 버전과 WAR 동봉 여부(§3-3)는 확인하지 못했으며 운영 WildFly 에서 정한다.
```
$WILDFLY/modules/com/oracle/ojdbc/main/
  ├─ ojdbc11-<버전>.jar
  └─ module.xml
```
```xml
<module xmlns="urn:jboss:module:1.9" name="com.oracle.ojdbc">
  <resources><resource-root path="ojdbc11-<버전>.jar"/></resources>
  <dependencies><module name="java.sql"/></dependencies>
</module>
```
```xml
<!-- standalone.xml > datasources > drivers -->
<driver name="oracle" module="com.oracle.ojdbc">
  <driver-class>oracle.jdbc.OracleDriver</driver-class>
</driver>
```

### 5-2. DataSource 정의 — 각 WildFly의 standalone.xml
4개 DataSource(Biz/Cmn/If/Caravan)를 서버마다 **동일 jndi-name**, **다른 물리 접속**으로 정의. (Biz·Cmn 은 MCM 에선 동일 MCMAPUSER 계정을 가리킴)

**예시: 개발계(dsBiz)**, `jdbc:oracle:thin:@//호스트:1521/서비스`:
```xml
<datasource jndi-name="java:/jdbc/mcm/dsBiz" pool-name="dsBiz"
            enabled="true" jta="false" use-ccm="false">
  <connection-url>jdbc:oracle:thin:@//호스트:1521/서비스</connection-url>
  <driver>oracle</driver>
  <pool><min-pool-size>5</min-pool-size><max-pool-size>20</max-pool-size></pool>
  <security>
    <user-name>MCMAPUSER</user-name>
    <credential-reference store="dmesCredStore" alias="mcm.biz.password"/>   <!-- 운영은 credential-store 권장(§5-4) -->
  </security>
  <validation>
    <valid-connection-checker class-name="org.jboss.jca.adapters.jdbc.extensions.oracle.OracleValidConnectionChecker"/>
    <background-validation>true</background-validation>
    <background-validation-millis>30000</background-validation-millis>
  </validation>
</datasource>
<!-- dsCmn(java:/jdbc/mcm/dsCmn, MCMAPUSER, MCM 은 dsBiz 와 동일 계정), dsIF(java:/jdbc/mcm/dsIF, EAIUSER), dsCaravan(java:/jdbc/mcm/dsCaravan, CARAVANUSER) 동일 패턴 -->
<!-- caravan-hub 는 위 dsCaravan·dsIF 를 같이 쓴다(§11), 반드시 jta="false" -->
<!-- jndi-name 은 앱 yml 기본값과 일치. 서버가 다른 이름을 쓰면 앱에 JNDI_DS_* override 필요 -->
```
> 위 XML 은 이전 MSSQL 예시를 Oracle 로 옮긴 설계 예시다. 실제 운영 WildFly 의 풀 크기·검증기·비밀번호 저장 방식은 확인하지 못했다.

### 5-3. 환경별 물리 매핑 표 (★ 핵심 산출물)

| JNDI 논리명(기본값) | 계정 | 포항 개발계(dev) | 김포 개발계(dev) | 김포 운영계(prod) |
|-------------|------|-----------------|-----------------|------------------|
| `java:/jdbc/mcm/dsBiz` | MCMAPUSER | `<Oracle 호스트:1521/서비스>` | `<Oracle 호스트:1521/서비스>` | `<운영 서버:포트/서비스>` |
| `java:/jdbc/mcm/dsCmn` | MCMAPUSER | `<Oracle 호스트:1521/서비스>` | `<Oracle 호스트:1521/서비스>` | `<운영 서버:포트/서비스>` |
| `java:/jdbc/mcm/dsIF` | EAIUSER | `<Oracle 호스트:1521/서비스>` | `<Oracle 호스트:1521/서비스>` | `<운영 서버:포트/서비스>` |
| `java:/jdbc/mcm/dsCaravan` | CARAVANUSER | `<Oracle 호스트:1521/서비스>` | `<Oracle 호스트:1521/서비스>` | `<운영 서버:포트/서비스>` |

> 포항·김포 개발계는 **동일 `dev` WAR** 를 받지만, 위 표대로 각 WildFly standalone.xml 의 물리 접속만 다르다. **앱은 이 표를 알 필요가 없다**(JNDI 논리명만 안다).
> 이전 MSSQL 시절 값(포항 `10.10.80.241:1433/ksm_dmes`, 김포 `172.16.2.154:5010/ksm_dmes`)은 Oracle 이전 뒤의 Oracle 접속 정보로 확인하지 못해 `<…>` 로 비웠다. 서버 IP·포트·서비스 이름·계정 비밀번호는 인프라 담당 확인 후 각 standalone.xml 에 기입.
> 풀 크기 권장: 개발계 max 10~20, **운영계 max 30~50**(부하 기준 조정).

### 5-4. 비밀번호 보안 (운영계 권장)
운영은 standalone.xml 평문 대신 Elytron credential-store 사용 권장:
```xml
<security>
  <user-name>MCMAPUSER</user-name>
  <credential-reference store="dmesCredStore" alias="mcm.biz.password"/>
</security>
```

### 5-5. 스키마 적용: WildFly 에서는 Flyway 를 끈다
WildFly(dev/prod)에서는 앱이 스키마를 만들거나 바꾸지 않는다. `application-wildfly.yml` 이 `spring.flyway.enabled=false` 와 `ddl-auto: none` 을 두고(mcm 은 스키마별 Flyway 를 도는 `McmFlywayConfig` 도 `dmes.flyway.enabled=false` 로 끈다), mdm 도 wildfly yml 에서 `spring.flyway.enabled=false` 로 끈다. 스키마는 **DBA 가 `db/migration` 의 V 파일을 미리 적용**한다. mcm 의 V 파일 정본은 mcm-core 의 `db/migration/oracle/<스키마>/` 이고, caravan-hub 는 `db/migration/caravanuser`(와 IF 용 `ifuser`) 이다. 스키마마다 Flyway 주인 앱이 하나이고 주인이 아닌 앱은 `ddl-auto` 를 `none` 또는 `validate` 로 둔다(소유표는 `docs/oracle-1007/schema-owners.md`). Flyway 가 켜지는 곳은 로컬 `local` 프로파일뿐이다. 운영 접속 계정에 마이그레이션이 도는 사고를 막으려는 결정이다.

---

## 6. 환경별 기동 방법

| 환경 | 기동 | 프로파일 |
|------|------|---------|
| 로컬(Oracle PDB) | `./gradlew :mcm:api:bootRun` | `-Dspring.profiles.active=local` |
| 로컬→포항 DB | `./gradlew :mcm:api:bootRun` | `-Dspring.profiles.active=local-ph` |
| 로컬→김포 DB | `./gradlew :mcm:api:bootRun` | `-Dspring.profiles.active=local-kp` |
| 포항 개발계 | WildFly(포항)에 `mcm.war` 배포 | `-Dspring.profiles.active=dev` |
| 김포 개발계 | WildFly(김포)에 `mcm.war` 배포 | `-Dspring.profiles.active=dev` |
| 김포 운영계 | WildFly(운영)에 `mcm.war` 배포 | `-Dspring.profiles.active=prod` |

WildFly 프로파일 지정(standalone.conf 또는 JAVA_OPTS):
```
JAVA_OPTS="$JAVA_OPTS -Dspring.profiles.active=dev"     # 개발계(포항/김포 공통)
JAVA_OPTS="$JAVA_OPTS -Dspring.profiles.active=prod"    # 운영계
```
> `dev|prod` 활성 시 §4-2 그룹 규칙으로 `wildfly` 프로파일이 자동 추가되어 JNDI 블록이 로딩됨. `local|local-ph|local-kp` 는 그룹에 없어 Hikari 직결로 동작.

---

## 7. 적용 순서 (MCM First) — 체크리스트

**Phase A — cactus-core 공통 인프라 (하위호환)**
- [ ] `DataSourceProps.jndiName` 필드 추가
- [ ] `CactusMultiDataSourceAutoConfiguration` 에 `buildDataSource` 분기 추가 → `registerExtra` 적용
- [ ] ★ jndiName 경로에서 빈 정의 분기: `beanClass=DataSource` + `destroyMethodName` 미설정(§3-1 추가수정 1 — 컨테이너 풀 close 방지)
- [ ] ★ `CactusMultiMybatisAutoConfiguration` 활성 조건 `url` → `url OR jndi-name` 완화(§3-1 추가수정 2 — OASIS SqlRunner 예외 방지)
- [ ] 기존 모듈(mls/mpn 등) 무영향 회귀 확인(jndiName 미설정 시 기존 동작)

**Phase B — mcm 앱 (yml 재구성 + 코드 동반 수정)**
- [ ] `JpaConfig.dataSource()` jndi-name 분기 추가
- [ ] ★ `McmApplication.java:71` 프로파일 조건 재작성 — `!contains("mssql")` 폐기, 신 체계 기준(§3-4)
- [ ] ★ `DataInitializer.java:2579` 시드 게이트 신 프로파일명으로 재작성 + 허용 티어 재결정(§3-4)
- [x] (MSSQL 시절) mssql-jdbc 이동 설계: lib 의 api 스코프 제거 → api 의 providedRuntime(§3-3). 현재는 ojdbc11 만 둔다(§3-3)
- [ ] `application-mssql.yml` → `application-local-ph.yml` 개명/이관, `mssql` 프로파일 폐기
- [ ] 현행 `application-dev.yml`(김포 직결) → `application-local-kp.yml` 로 이관
- [ ] `application-wildfly.yml` 신설(JNDI 블록)
- [ ] `application-dev.yml` 재작성(JNDI 개발계 차이값), `application-prod.yml` JNDI 차이값으로 재작성 — **둘 다 `dmes.init.enabled: false` 명시**(§4-4/4-5)
- [ ] `application.yml` 프로파일 그룹(dev→wildfly, prod→wildfly) 추가 / `active: local,mssql` 기본 조합 제거
- [ ] ★ 기본 프로파일 폴백 마련: `spring.profiles.default: local`(권장) 또는 bootRun systemProperty(§4-2 — 프로파일 공백 부팅 실패 방지)
- [ ] cmn 표준화: cactus `jpa.extras.cmn`(cactus-cmn PU) 추가 + `tx.txCmn` → cmn 재배선 + 각 프로파일 yml 에 cmn DS 추가(§4-3/4-6/4-7/4-8) — 재배선 안전성 확인됨(§3-4 참고: txCmn 사용처 0건)
- [ ] 문서 갱신: `docs/mcm/design/masterRuleList/masterRuleList_개발체크리스트.md:96`(`active=mssql` 기동 안내), `docs/kafka/SERAI-EAI-Phase상세설계-v4.md:1007`(`local,mssql`)

**Phase C — WildFly (환경별)**
- [ ] Oracle 드라이버 모듈 설치(3개 서버: 포항 개발 / 김포 개발 / 김포 운영, §5-1)
- [ ] DBA 가 db/migration 의 V 파일을 3개 서버 DB 에 선적용(§5-5)
- [ ] dsBiz/dsCmn/dsIF/dsCaravan 정의(`jta=false`, jndi-name `java:/jdbc/mcm/ds*`), 포항 개발부터 (dsBiz·dsCmn 은 MCM 에선 동일 MCMAPUSER)
- [ ] 김포 개발계 동일 정의(접속 정보는 §5-3 표)
- [ ] 운영 접속정보 확보 후 동일 정의(+ 운영 credential-store)

**Phase D — 검증/확장**
- [ ] 로컬 회귀(local / local-ph / local-kp) 검증(§8)
- [ ] 포항·김포 개발계(dev) 배포 검증
- [ ] ★ WAR 배포 시 BFF 접점 확인: WildFly HTTP 리스너 8100 + 컨텍스트 패스 루트(`/`) 유지 여부 — 컨텍스트 패스가 `/mcm` 등으로 바뀌면 `src/frontend/m-mcm/.env` 의 `BACKEND_API_URL`/`MCM_WAS_URL`/`NEXT_PUBLIC_OASIS_API_URL` 수정 필요
- [ ] 운영(prod) 순차 적용
- [ ] 성공 후 mls 등 타 모듈 동일 패턴 확산

---

## 8. 검증 시나리오

1. **local 회귀**: `bootRun active=local` → 로컬 Oracle PDB 정상 기동(biz/cmn=MCMAPUSER, if=EAIUSER, caravan=CARAVANUSER / JNDI 미사용 확인)
2. **local-ph 직결**: `bootRun active=local-ph` → 포항 개발 Oracle 4계정(biz/cmn=MCMAPUSER, if=EAIUSER, caravan=CARAVANUSER) Hikari 직결 정상(mcm 은 현재 yml 없음, §0 안내)
3. **local-kp 직결**: `bootRun active=local-kp` → 김포 개발 Oracle Hikari 직결 정상(mcm 은 현재 yml 없음, §0 안내)
4. **개발계 배포**: WildFly `active=dev`(포항/김포) → 부팅 로그에 4개 JNDI lookup 성공(`java:/jdbc/mcm/dsBiz` / dsCmn / dsIF / dsCaravan). 앱 기본값 ↔ standalone.xml jndi-name 일치 확인(불일치 시 JNDI_DS_* override)
5. **트랜잭션 경계**: `txBiz`/`txCmn`/`txIF`/`txCaravan` 각각 커밋·롤백 정상(연결 enlist 충돌 없음 = `jta=false` 검증)
6. **MyBatis**: biz/cmn/if SqlSession 조회·갱신 정상
7. **OASIS ScriptTask**: 데이터소스별 분기 정상
8. **WildFly 콘솔**: 4개 풀(dsBiz/dsCmn/dsIF/dsCaravan) active/idle 카운트 노출, background validation 동작

---

## 9. 롤백 전략

- 코드 분기가 **양방향(Hikari/JNDI) 모두 상존**하므로, yml에서 `jndi-name` 제거 + `url/username/password` 복원만으로 **즉시 Hikari 직결로 복귀**(재배포만 필요, 코드 롤백 불필요).
- local-ph/local-kp 는 직결 프로파일이므로 WildFly 전환과 무관하게 항상 사용 가능(개발자 상시 사용).
- WildFly DataSource는 비활성화(`enabled=false`)로 격리 가능.

---

## 10. 리스크 / 주의사항

| 리스크 | 영향 | 대응 |
|--------|------|------|
| `jta=true` 로 정의 | resource-local 트랜잭션 충돌·이상동작 | **반드시 `jta=false`** (§1 원칙4) |
| ★ extras 빈 `destroyMethod="close"` 잔존 | 셧다운 시 WildFly 컨테이너 풀 close 시도 | jndiName 경로에서 destroyMethod 미설정(§3-1 추가수정 1) |
| ★ MyBatis `url` 조건 게이트 | jndi-only extras 의 SqlSessionTemplate 미생성 → OASIS SqlRunner 런타임 예외 | 조건을 url OR jndi-name 으로 완화(§3-1 추가수정 2) |
| ★ 프로파일 리터럴 코드 2곳 미수정 | SQLite override 오발동 / 시드 중단·오발동 | `McmApplication.java:71`·`DataInitializer.java:2579` 동시 수정(§3-4) |
| ★ 기본 active 제거 후 프로파일 공백 | 프로파일 없는 bootRun/IDE 부팅 실패 | `spring.profiles.default: local` 폴백(§4-2) |
| ★ dev/prod 에 `dmes.init.enabled` 미명시 | 기본 true → WildFly 계정으로 DDL/ALTER/시드 실행 | dev/prod yml 에 `false` 명시(§4-4/4-5) |
| ★ WAR 컨텍스트 패스 변경 | BFF(m-mcm/.env) 8100 루트 가정 붕괴 | 루트 배포 유지 또는 .env 3개 URL 수정(§7 Phase D) |
| Oracle 드라이버가 WAR+모듈 중복 | 클래스로더 충돌 | 현재 ojdbc11 은 providedRuntime 이 아니라 WAR 에 들어가는 구성이다(§3-3). 모듈 드라이버와 함께 쓸지 정해야 한다 |
| (MSSQL 시절) providedRuntime 후 bootRun 드라이버 누락 우려 | local-ph/local-kp 기동 실패 | providedRuntime 는 runtimeClasspath 잔존 → bootRun 정상(§3-3). 현재는 해당 없음 |
| `local,mssql` 조합 잔존 | 직결+JNDI 혼선 | 기본 active를 단일 환경으로, `mssql` 프로파일 폐기(§4-2) |
| 파일 개명 충돌(dev 재사용) | 김포 직결/JNDI 혼동 | 현행 dev→local-kp 이관 후 dev 를 JNDI 로 재작성(§4-1 마이그레이션 주의) |
| local-ph/local-kp yml 평문 계정 | 자격증명 노출 | Git 제외/환경변수 치환 권장(§1 원칙2 각주) |
| JNDI lookup 시점 미존재 | 부팅 실패 | WildFly DS를 배포 전 선등록, 이름 오타 점검 |
| jndi-name 접두어 누락(`java:/` 없음) | WildFly 부팅 거부(WFLYJCA0117) | 기본값에 `java:/` 접두어 필수(§2-1) |
| 앱 기본값 ↔ standalone.xml 이름 불일치 | JNDI lookup 실패 | 동일 규약 유지, 다르면 앱에 JNDI_DS_* override(§4-3, §2-2) |
| WildFly 에서 Flyway 가 켜짐 | 운영 계정에 마이그레이션 실행 | wildfly yml 이 `spring.flyway.enabled=false`·`dmes.flyway.enabled=false` 로 끈다. DBA 가 V 파일 선적용(§5-5) |
| 순수 프로퍼티(기본값 없음) 사용 | 미주입 시 부팅 실패 | 반드시 `${PROP:기본값}` 형태 유지(§2-1) |
| cmn=biz 동일 계정에 2개 풀 | 커넥션 소폭 증가(경미) | MCM 은 cmn 엔티티 없음 → 영향 미미. cmn 이 별도 계정/DB 필요 시 §2·§4·§5 조정 |
| local 에서 레인들이 PDB 를 공유 | 커넥션 부족·인스턴스 종료 | Hikari 상한 3 이하, 동시에 열린 PDB 3개 이하(`schema-owners.md` §3.2, §4-8). 이전 SQLite 시절의 파일 잠금 우려는 없어짐 |
| 운영 접속정보 미확정 | 적용 지연 | 인프라 담당 사전 확보(§5-3 표) |
| 프로파일 그룹 override 혼동 | 설정 충돌 | wildfly.yml과 dev/prod.yml 키 비중첩 유지(§4-8) |

---

## 부록 A — "무엇이 어디에 사는가" 요약

| 정보 | 위치 | 환경별 다름? |
|------|------|------------|
| JNDI 논리명(mcm 기본값 `java:/jdbc/mcm/ds*`, hub 는 같은 이름 재사용, mdm 은 `java:/jdbc/mdm/dsBiz`) | 앱 yml(wildfly.yml), `JNDI_DS_*` 로 override 가능 | ❌ dev/prod 동일 |
| WildFly 서버 IP/포트/DB/계정/비밀번호 | **WildFly standalone.xml** | ✅ 서버별 다름 |
| 커넥션 풀 크기/검증 | WildFly standalone.xml | ✅ (운영 더 큼) |
| dialect / ddl-auto | 앱 yml(wildfly.yml) | ❌ OracleDialect 공통 |
| show-sql / 로그레벨 / 외부 엔드포인트 | 앱 yml(dev/prod.yml) | ✅ 환경별 |
| local-ph/local-kp 직결 접속(포항/김포 DB) | 앱 yml(local-ph/local-kp.yml) | 로컬 개발 전용 |
| 로컬 Oracle PDB 접속 | 앱 yml(local.yml) | local 전용 |

## 부록 B — 프로파일 요약 (한눈에)

| profile | 접속 대상 | 방식 | wildfly 그룹 | 실행 |
|---------|----------|------|-------------|------|
| `local` | 로컬 Oracle PDB | Hikari 직결 | ✗ | bootRun |
| `local-ph` | 포항 개발 Oracle | Hikari 직결 | ✗ | bootRun |
| `local-kp` | 김포 개발 Oracle | Hikari 직결 | ✗ | bootRun |
| `dev` | 각 WildFly 로컬 DB(포항/김포) | JNDI | ✓ | WildFly WAR |
| `prod` | 김포 운영 DB | JNDI | ✓ | WildFly WAR |


---

## 11. 확산 1호 — caravan-hub 적용 (2026-07-09 구현 완료)

mcm 패턴을 caravan-hub(비-cactus, 듀얼 Hikari 직결 구조)에 확산. 사용자 확정(2026-07-09):
**mcm 논리 DS 재사용 / Kafka 는 JVM 프로퍼티 / 컨텍스트 루트 `/` / init 게이트 신설**.

### 11-1. DataSource 매핑 (mcm 논리 DS 재사용)

| alias | 계정 | JNDI (기본값) | override |
|-------|------|---------------|----------|
| **mst** (@Primary) | CARAVANUSER | `java:/jdbc/mcm/dsCaravan` | `JNDI_DS_MST`, 없으면 `JNDI_DS_CARAVAN`(mcm 과 같은 이름) |
| **if** | EAIUSER | `java:/jdbc/mcm/dsIF` | `JNDI_DS_IF`(mcm 과 공통) |

- caravan-hub 전용 DS 를 만들지 않고 **mcm 이 WildFly 에 등록한 dsCaravan/dsIF 를 그대로 lookup** (계정 일치 확인됨). mst 는 dsCaravan(CARAVANUSER), if 는 dsIF(EAIUSER) 이고 두 앱 모두 `jta="false"` 로 정의한다.
- 2026-10-07 oracle-1007 에서 mcm 의 이름이 `java:/jdbc/mssql/mcm/*` 에서 `java:/jdbc/mcm/*` 로 바뀌어 hub 의 yml 기본값도 함께 맞췄다(hub yml 주석).
- caravan-hub 서버그룹이 mcm 과 **같은 domain.xml 프로파일**을 쓰면 추가 등록 불필요, 다른 프로파일이면 동일 정의 복제.
- 컨테이너(서버)가 분리돼 있어 JVM 시스템 프로퍼티 공유 없음 → override 이름도 공용 규약(`JNDI_DS_*`) 유지.
- 풀은 서버(JVM)별 개별 생성 — mcm 과 커넥션 경합 아님.

### 11-2. Kafka 브로커 — JVM 프로퍼티 소유 (JNDI 비대상 유일 항목)

DB 와 달리 Kafka 주소는 JNDI 로 흡수 불가 → **환경 차이값 파일(dev/prod.yml) 소유** (wildfly.yml 은 JNDI 전용 유지):

```yaml
# application-dev.yml  — 기본값 = 포항 개발 브로커. 김포 WildFly 만 -D 로 override
caravan.kafka.bootstrap-servers: ${KAFKA_BOOTSTRAP_SERVERS:10.10.80.241:9092}
# application-prod.yml — 기본값 없음(필수). 미주입 시 부팅 실패 = 개발 브로커 오접속 사고 방지
caravan.kafka.bootstrap-servers: ${KAFKA_BOOTSTRAP_SERVERS}
```

### 11-3. 변경 내역 (구현 완료)

| 구분 | 내용 |
|------|------|
| `DataSourceConfig.java` | mst/if 빈에 `spring.datasource.{mst,if}.jndi-name` 유무 분기 (JndiDataSourceLookup ↔ 기존 DataSourceBuilder) |
| `DataInitializer.java` | **`caravan-hub.init.enabled` 게이트 신설** (기본 true=현행, dev/prod yml 은 false 명시 — DDL skip) |
| `CaravanHubApplication.java` | main() 에 `spring.profiles.default=local` 폴백 (WAR 경로 미적용 → -D 누락 시 fail-fast) |
| `build.gradle` | (2026-07-09, MSSQL 시절) mssql-jdbc `runtimeOnly` → `providedRuntime`. 현재(oracle-1007)는 `runtimeOnly libs.ojdbc11` 과 `runtimeOnly libs.flyway.database.oracle` 이고 ojdbc11 은 providedRuntime 이 아니다(§3-3) |
| `jboss-web.xml` 신설 | `<context-root>/</context-root>` — mcm(/mcm)과 달리 루트 (전용 컨테이너, 사용자 결정) → MCM 의 `CARAVAN_HUB_BASE_URL` 은 컨텍스트 없이 `http://<host>:<port>` |
| yml 재편 | 이전 `mssql`→`local-ph`(+포항 Kafka 명시), 구 `dev`(직결)→`local-kp`, `wildfly` 신설(JNDI 2종), `dev`/`prod` JNDI 차이값 재작성, base 에 group + 이전의 `active: local,mssql` 제거. 현재 local-ph/local-kp/local 은 모두 Oracle 직결이다(oracle-1007) |

### 11-4. 기동 JVM 옵션 (caravan-hub)

| 환경 | 필수 | 선택 |
|------|------|------|
| dev (포항) | `-Dspring.profiles.active=dev` | (기본값으로 동작) |
| dev (김포) | `-Dspring.profiles.active=dev -DKAFKA_BOOTSTRAP_SERVERS=<김포 브로커>` | |
| prod | `-Dspring.profiles.active=prod -DKAFKA_BOOTSTRAP_SERVERS=<운영 브로커>` ★둘 다 필수 | |
| 공통 선택 | | `-DINTEGRATION_DB_ENABLED=false`(DB 인바운드 폴링 off), `-Dcaravan-hub.init.enabled=true`(스키마 적재 일시), `-DJNDI_DS_MST`(또는 `-DJNDI_DS_CARAVAN`)/`-DJNDI_DS_IF`(이름 불일치 시) |

> 폐기된 env: `CARAVAN_HUB_MST_DB_URL/USERNAME/PASSWORD`, `CARAVAN_HUB_IF_DB_*` (구 prod 직결 방식 — JNDI 로 대체).

### 11-5. 검증 상태

- [x] (2026-07-09, MSSQL 시절 확인) bootWar BUILD SUCCESSFUL / WAR 에 mssql-jdbc 미포함(lib-provided)·jboss-web.xml(`/`) 포함 확인. oracle-1007 뒤의 WAR 구성은 확인하지 못했다
- [ ] WildFly(dev) 배포 검증 — mcm 과 동일 프로파일이면 dsCaravan/dsIF lookup 즉시 성공 예상
- [ ] 운영 브로커 주소 확정 후 prod 적용


---

## 12. 확산 2호 — mqc·mpp·mpn·mls 일괄 적용 (2026-07-13 구현 완료)

4개 모듈에 mcm 패턴 확산 + **mqc/mpp 는 멀티DS 표준(biz/cmn/if) 동시 도입** (사용자 확정 2026-07-13).

> **2026-10-07 확인**: 이 절은 MSSQL 시절(2026-07-13) 구현 기록이다. 이 워크트리의 `src/backend/{mqc,mpp,mpn,mls}/api/src/main/resources` 에는 `application.yml` 만 있고 `application-wildfly.yml`·local-ph·local-kp 가 없으며, 그 `application.yml` 은 `DMES_ORA_URL` 로 Oracle 직결(접속 사용자 = 스키마 주인 MQCAPUSER·MLSAPUSER 등)을 쓴다. 따라서 아래 모듈별 JNDI 이름·프로파일 구성이 현재 코드에 있는지는 확인하지 못했다. JNDI 이름은 §2-1 규약(`java:/jdbc/{모듈}/{DS}`)으로 바꿔 적었고, 이전에는 `java:/jdbc/mssql/{모듈}/{DS}` 였다.

### 12-1. 모듈별 DS 계정 매트릭스 (사용자 확정)

| 모듈 | dsBiz (전용 등록 필요) | cmn | if | 컨텍스트 |
|------|----------------------|-----|-----|---------|
| mqc | `java:/jdbc/mqc/dsBiz` = MQCAPUSER | mcm/dsCmn 재사용 | mcm/dsIF 재사용 | /mqc |
| mpp | `java:/jdbc/mpp/dsBiz` = MPPAPUSER | 〃 | 〃 | /mpp |
| mpn | `java:/jdbc/mpn/dsBiz` = MPNAPUSER | 〃 | 〃 | /mpn |
| mls | `java:/jdbc/mls/dsBiz` = MLSAPUSER | 〃 (**dmom 기능 필수**) | 〃 | /mls |

- cmn=MCMAPUSER, if=EAIUSER, 4개 모듈 공통, **mcm 이 등록한 논리 DS(`java:/jdbc/mcm/dsCmn`·`dsIF`) 재사용**.
- WildFly(domain 프로파일)에는 **모듈별 dsBiz 4종만 추가 등록** (`jta=false`). cmn/if 는 기존 것 사용.
- mpn dsBiz 풀 사이징: 장기 플래닝 트랜잭션 대응 min 5 / max 30 권장 (구 hikari max=30 이관).

### 12-2. 공통 적용 내역 (4개 모듈 동일)

- 프로파일 재편: local / local-ph(포항 개발 DB 직결) / local-kp(김포 개발 DB 직결) / dev·prod(JNDI) + `profiles.group` + 구 `active` 기본 조합 폐기 + 이전 `application-mssql.yml` 삭제.
- main(): `spring.profiles.default=local` 폴백 + (당시) extras SQLite 절대경로 override(acceptsProfiles 게이트).
- (MSSQL 시절) mssql-jdbc: `lib`(api) → `api`(providedRuntime). ※ 이들 모듈 서브프로젝트는 core 가 아니라 **lib**. 현재 드라이버 구성은 확인하지 못했다.
- `jboss-web.xml` 신설(모듈별 /{모듈} 컨텍스트 — mcm 선례, NGINX 라우팅 정합).
- 시드/이니셜라이저 `dmes.init.enabled` 게이트(기본 true=현행, local-ph/dev/prod false·local-kp true):
  mqc CommCodeSeeder / mpp 이니셜라이저 6종(Jig*·CommonCode) / mls MlsLovDataInitializer. (mpn 은 기존 @Profile("local") 게이트 유지)

### 12-3. 모듈별 특이 적용

- **mqc/mpp (멀티DS 신규 도입)**: base 에 primary-alias/extras(빈 PU)/tx 표준 3종/`mybatis.enabled: false` 추가.
  primary 는 JpaConfig 없이 Boot 자동설정 — `spring.datasource.jndi-name` 만으로 JNDI 동작(코드 분기 불필요).
  mpp 는 `mpp.common-code.schema: "MCMAPUSER."` 를 local-ph/local-kp/wildfly 에 반영. 구 dev yml 의
  mcm 복붙 기본값(databaseName=MCMAPUSER/mcmapuser) 폐기 — 정 계정으로 정정.
- **mpn**: `MpnJpaConfig.dataSource()` jndi 분기 + `MpnApplication` 프로파일 리터럴 재작성.
  당시 prod 는 MSSQL 마이그레이션 Flyway 와 플레이스홀더 가드를 유지했고 Flyway 는 JNDI primary 로 동작했다(MSSQL 시절 기록. 현재 mpn 의 Flyway·가드 구성은 확인하지 못했고, WildFly 에서는 Flyway 를 끄는 것이 oracle-1007 규약이다, §5-5).
  당시 검증용 프로파일 사용법을 `local-ph` 조합으로 갱신했다.
- **mls**: `JpaConfig.dataSource()` jndi 분기 + `JpaPersistenceProviderEnforcer` 이식(mpn 동일 — cactus 보조 EMF
  의 WildFly NoSuchMethodError 방지) + `default_schema: MLSAPUSER` 를 wildfly.yml 에 명시.
  local-ph 는 신설(구 mssql yml 은 김포 평문 중복이라 폐기), ⚠️ 포항 DB 에 MLSAPUSER 계정 존재 여부 최초 사용 전 확인(Oracle 이전 뒤 상태는 확인하지 못했다).
  (부수 수정) SERAI→caravan-hub 개편 잔재로 컴파일 불가였던 서비스 3종
  (SlitInMgmt/SlitStockIssueMgmt/SlitStockMgmt)의 `SeraiIntegrationClient` → `CaravanHubIntegrationClient` 리네임.

### 12-4. 기동 JVM 옵션 (4개 모듈 공통)

| 환경 | 옵션 |
|------|------|
| dev | `-Dspring.profiles.active=dev` (+ 개발 JWT/클라이언트키 기본값 사용 가능) |
| prod | `-Dspring.profiles.active=prod -DJWT_SECRET=<실키> -DBACKEND_CLIENT_KEY=<키>` (셋 다 필수) |
| 공통 선택 | `-Ddmes.init.enabled=true`(시드 일시), `-DJNDI_DS_BIZ/CMN/IF`(이름 불일치 시), `-DCARAVAN_HUB_BASE_URL` |

### 12-5. 검증 상태

- [x] (2026-07-13, MSSQL 시절 확인) 4개 모듈 bootWar BUILD SUCCESSFUL / WAR 에 mssql-jdbc lib-provided 격리·jboss-web.xml 컨텍스트 확인
- [x] 신규·수정 yml 30종 YAML 파서 검증 통과
- [ ] WildFly(dev) 배포 검증 — 모듈별 dsBiz 4종 등록 후 (cmn/if 는 mcm 것 기등록 전제)
- [ ] mls: 포항 MLSAPUSER 계정 확인 / 운영 접속정보 확정(Oracle 기준)


---

## 13. mdm 적용 현황 (2026-10-07 확인)

mdm 도 같은 패턴이다. `src/backend/mdm/api/src/main/resources/application-wildfly.yml` 은 `spring.datasource.jndi-name` 을 `${JNDI_DS_BIZ:java:/jdbc/mdm/dsBiz}` 로 두고 `ddl-auto: none`, `spring.flyway.enabled=false` 를 둔다(스키마는 DBA 가 V 파일을 선적용, §5-5). `application.yml` 에 `dev`·`prod` → `wildfly` 프로파일 그룹이 있고 `spring.profiles.default: local` 폴백이 있다. mdm 의 스키마 소유 사용자는 MDMAPUSER 다(`docs/oracle-1007/schema-owners.md`). mdm 의 wildfly yml 에는 Hibernate 방언을 두지 않고 연결 메타데이터로 자동 판정한다. 그 yml 의 주석은 「운영 DB 는 미정(ADR-0004)」 이라고 적어 두었으나 이 문서의 전제(운영 DB = Oracle)와 맞는지는 확인하지 못했다.

— 끝 —
