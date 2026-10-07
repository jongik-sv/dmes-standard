# mcm

MES 전체의 **앱 호스트**다. 인증(JWT)·권한(RBAC)·메뉴 트리를 소유하고, `mcm-core` 의 공통관리 도메인을
OASIS BPMN 서비스로 노출한다. Spring Boot **`lib` + `api` 2 서브프로젝트** 패턴이며, Gradle composite build 로
루트 `settings.gradle` 에서 `includeBuild` 로 물린다.

## 구조

| 서브프로젝트 | 역할 |
| --- | --- |
| `lib` | cactus 어댑터(비밀번호 해셔·계정 리포지토리)·인증 컨트롤러·권한키 API. `cactus-core` + `mcm-core` + `caravan-console` 에 의존한다. |
| `api` | WAR 로 배포되는 Spring Boot 기동 모듈. 시큐리티 필터체인·JPA 설정·`DataInitializer`·BPMN 서비스 정의를 가진다. |

패키지 루트는 `com.dongkuk.dmes.mcm` 으로 `mcm-core` 와 동일하다. `api` 의 `McmApplication` 이 그 루트에 있어
컴포넌트 스캔 한 벌이 라이브러리와 런처를 함께 덮는다.

## 핵심 구성요소 (`api`)

| 클래스 | 역할 |
| --- | --- |
| `McmApplication` | 컴포넌트/엔티티/리포지토리 스캔 범위, 프로파일 폴백(local) |
| `config/SecurityConfig` | 필터 사슬 txId → requestId → clientKey → jwt → revokedToken → endpointPerm. `McmSecurityDefaults` 로 기본 URL 매처 적용 |
| `config/JpaConfig` | primary EMF 명시 빌드 (cactus 의 secondary EMF 와 책임 분리) |
| `config/RevokedTokenFilter` | 로그아웃/강제 로그아웃된 JWT `jti` 블랙리스트 검사 |
| `init/DataInitializer` | **멱등** RBAC/메뉴/부서 시드. `dmes.init.enabled=false` 로 전체 skip |
| `config/McmFlywayConfig` | 스키마별 Flyway(MCMAPUSER·MCM_SOURCE·MCM_BACKUP·MCAAPUSER, 각 주인 접속). `dmes.flyway.enabled`(local 만 true) |
| `listener/RoleChangedEventListener` | 역할 변경 시 BFF 권한 캐시 무효화 통지 |

### DataInitializer 가 만드는 것

부팅 때마다 **존재하면 skip** 하는 멱등 적재다. 표는 만들지 않는다 — 스키마는 mcm-core `db/migration/oracle/<스키마>/` 의 V 파일이 정본이고,
local 은 `McmFlywayConfig` 가, WildFly(dev/prod)는 DBA 가 적용한다. Flyway 로 표가 선 빈 DB 에서도 관리자 계정과 메뉴가 선다.

- RBAC 시드: `admin` 사용자 / `ROLE_GROUP_SYSADMIN` / `SYSADMIN` 역할 / `PERM_ALL`
- 메뉴 트리: 공통관리(mcm) 루트 + `cma`(마스터관리 원장) · `csa`(시스템관리) · `cme`(마스터관리 가동) ·
  `cmb`(업무기준관리 원장) · `cmz`(팝업 전용, 사이드바 숨김) · `lsh`(공지관리, 2026-10-07 mls 에서 이전), 그리고 로그 분석(analog) 루트 + `anl` 그룹
- 부서(`TB_MCM_DEPT_INFO`) 예시 7행, 업무기준 조회 검증용 샘플 데이터

업무 모듈(mpn/mpp/mls/mqc)을 붙일 때는 `seed/ModuleMenuSeeder` 에 `seed{모듈}Menus()` 를 만들고,
`DataInitializer.seedMcmSecRbac()` 안의 표시된 확장 지점에서 부른다. PERM_ALL action 목록은 `seed/CoreRbacSeeder` 에 있다.

## OASIS 서비스 (BPMN)

화면 진입점은 `api/src/main/resources/services/{그룹}/{화면}.bpmn` 이다. `camunda:class` 가 `mcm-core` 의
서비스 빈을 호출한다. 이관돼 있는 것:

`cma` 4 · `cmb` 7 · `cme` 1 · `csa` 8 · `code` 2 · `security`(secUser — 내 메뉴/권한) · `roleManagement`(secFavorite — 즐겨찾기 · secStartPgm — 포털 기본 화면) · `audit`(감사 로그) · `lsh`(noticeMgmt 공지사항 관리 · noticeBoard 포털 홈 공지 목록)

공지사항(`noticeMgmt`·`noticeBoard`)은 2026-10-07 에 mls 에서 이 모듈로 옮겼다. Java 는 `lib` 의 `com.dongkuk.dmes.mcm.notice.*`, 테이블은 `TB_MCM_NOTICE`·`TB_MCM_NOTICE_TARGET`(로컬은 `McmFlywayConfig` 가 mcm-core V 파일로 생성, 운영은 DBA 가 같은 V 파일을 적용. 표 설명은 [notice-tables.md](../../../docs/mcm/erd/notice-tables.md))이다. 근거는 [DEC-001](../../../docs/ai-build-log/DEC-001_noticeMgmt-on-mls.md) 이다.

BPMN 을 추가·수정한 뒤에는 커밋 전에 `oasis-contract-check` 스킬을 돌린다.

## sample/ 은 자리표시자다

`sample/` 아래의 `SampleNotice`(공지사항) 수직 슬라이스는 **패턴 예시일 뿐 실제 업무 도메인이 아니다.**
실제 프로젝트를 시작할 때는 이 슬라이스를 지우고 같은 모양으로 업무 도메인을 채운다.

- 조회: `GET /api/mcm/sample-notices`
- 등록: `POST /api/mcm/sample-notices`

## 프로파일

| 프로파일 | 용도 |
| --- | --- |
| `local` (기본) | 로컬 Oracle PDB 직결(기본 `L_ORA_MCM_APP`, `dmes.ora.*` 또는 env `DMES_ORA_*` 로 바꿈). 프로파일 미지정 기동 시 폴백. 스키마별 Flyway 켬 |
| `dev` / `prod` | WildFly WAR 배포. datasource 는 `wildfly` 프로파일의 JNDI 논리명이 담당 |

`wildfly` 프로파일(`application-wildfly.yml`)은 `OracleDialect` 와 중립 JNDI 이름 `java:/jdbc/mcm/{dsBiz,dsCmn,dsIF,dsCaravan}` 을 쓴다
(`JNDI_DS_BIZ` 등 env·-D 로 바꿈). Flyway 는 끈다 — DBA 가 같은 V 파일을 적용한다. 옛 `local-db`(SQL Server 직결)는 `archive/` 로 옮겼다.

`dev`/`prod` 는 `dmes.init.enabled=false` 로 `DataInitializer` 를 끈다 — 운영 계정에 시드가 도는 사고를 막기
위해서다. 개발계에 시드가 필요하면 `-Ddmes.init.enabled=true` 로 한 번 띄우고 원복한다.

## 실행

```bash
../gradlew :api:bootRun
```

로컬 Oracle 컨테이너와 PDB 준비는 `scripts/oracle/README.md` 를 따른다. 첫 기동 때 `McmFlywayConfig` 가 네 스키마를 마이그레이션한다.

기동 후 초기 계정은 `admin` 이다. **운영 전에 반드시 비밀번호와 `cactus.jwt.secret` 을 바꾼다.**
`application.yml` 의 비밀번호 정책(만료·이력·길이·복잡도)은 템플릿 기본값이 전부 꺼져 있으니 함께 켠다.

실제 데이터소스(JNDI · 다중 DB) 와 보안 설정의 상세는 `docs/framework/`, `docs/cactus/` 의 패턴을 따른다.
