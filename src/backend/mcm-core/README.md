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
| `audit` · `common.audit` | 감사 로그 + native SQL 에 audit 9 컬럼을 주입하는 Hibernate StatementInspector |
| `common` | 예외·이벤트·SQLite temporal 컨버터 등 공통 유틸 |
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

mcm 의 스키마는 **Flyway 가 아니라** hibernate `ddl-auto`(local) 와 `mcm/api` 의 `DataInitializer`(멱등 DDL·시드)
가 관리한다. `mcm/api/src/main/resources/application.yml` 에서 `spring.flyway.enabled=false` 로 명시했다.

`src/main/resources/db/migration/sqlite/` 의 `V*.sql` 은 SEC 테이블이 어떤 순서로 만들어졌는지 남긴
**이력 참고용**이며 런타임 적용 대상이 아니다. 신규 프로젝트에서 mcm 도 Flyway 로 관리하기로 하면
`enabled=true` 로 바꾸고 번호를 재채번한다 — 버전 채번은 방언 간 드리프트를 막기 위해
`/flyway-migration-add` 스킬을 쓴다.

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
