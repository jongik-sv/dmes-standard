# mcm

원본 프로젝트의 Spring Boot **`lib` + `api` 2 서브프로젝트** 패턴을 그대로 옮긴 골격 모듈이다.
Gradle composite build 로 구성되며, 루트 `settings.gradle` 에서 `includeBuild` 로 물린다.

## 구조

| 서브프로젝트 | 역할 |
| --- | --- |
| `lib` | 도메인 · 리포지토리 · 서비스 계층. `cactus-core` + `mcm-core` + `caravan-console` 에 의존한다. |
| `api` | WAR 로 배포되는 Spring Boot 기동 모듈. `lib` 에 의존하며 컨트롤러와 설정 리소스를 가진다. |

패키지 루트는 `com.dongkuk.dmes.mcm` 이다. `api` 의 `McmApplication` 이 패키지 루트에 있어
컴포넌트 스캔이 `lib` 의 `com.dongkuk.dmes.mcm.sample.*` 까지 자연히 덮는다.

## sample/ 은 자리표시자다

`sample/` 아래의 `SampleNotice`(공지사항) 수직 슬라이스는 **패턴 예시일 뿐 실제 업무 도메인이 아니다.**
엔티티 → 리포지토리 → 서비스 → DTO → 컨트롤러 → Flyway 마이그레이션 → 서비스 단위 테스트로
한 벌이 어떻게 이어지는지만 보여준다. 실제 프로젝트를 시작할 때는 이 슬라이스를 지우고
같은 모양으로 업무 도메인을 채운다.

- 조회: `GET /api/mcm/sample-notices`
- 등록: `POST /api/mcm/sample-notices`

## 실행

```bash
../gradlew :api:bootRun
```

`bootRun` 의 작업 디렉터리는 모듈 루트로 고정돼 있고, `application.yml` 의 SQLite 경로
`../data/mcm.db` 는 `src/backend/data/` 를 가리킨다. 최초 실행 전에 해당 디렉터리가 있어야 한다.

`application.yml` 은 골격이 뜨는 데 필요한 최소 구성만 담았다.
**실제 데이터소스(JNDI · 다중 DB) 와 보안 설정은 `docs/framework/`, `docs/cactus/` 의 패턴을 따른다.**
