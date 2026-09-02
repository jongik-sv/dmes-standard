# D1 PoC — Camel 4.20 × Spring Boot 4.0.6 × WildFly(WAR)

caravan-hub(구 serai) 리네이밍+Camel 전환 착수 **전**, 우리 실제 스택에서 Camel 동작을 검증하는 스파이크.

## ✅ 실행 결과 (2026-07-02, `bootRun`)
| # | 항목 | 결과 |
|---|---|---|
| **PoC-1** | Camel 4.20.0 × SB 4.0.6 × Java 21 기동·의존성 정합 | **PASS** — 충돌 없이 컴파일·기동, Camel 4.20 started, 라우트 2개 started |
| **PoC-2a** | camel-servlet HTTP 인바운드 (내장 톰캣) | **PASS** — `POST /caravanHubApi/v1/send` → **HTTP 200** `{"resultCode":"SUCCESS",...}` |
| **PoC-3** | camel-sql 폴링 + 듀얼DS(`#ifDataSource`) + onConsume | **PASS** — 정확히 3건 폴링·**반복 없음**(onConsume `N→Y`), `C_AT ASC` 순서, 단일 스레드 |
| **PoC-2b** | camel-servlet WAR → **WildFly 배포** | ⏳ 미실시 (WildFly 필요, 아래 참고) |

→ **프레임워크·camel-servlet·camel-sql/듀얼DS 검증 완료. 남은 건 WildFly 실배포(PoC-2b)뿐.**

## 실행 (PoC-1/2a/3)
```bash
# JDK 21 필요 (기본 java 가 17/8 이면 JAVA_HOME 지정)
export JAVA_HOME="/c/Program Files/Java/jdk-21.0.6"
mkdir -p data                       # ★ SQLite 는 부모 디렉터리를 안 만든다
./gradlew bootRun --console=plain    # (wrapper 는 caravan 것 복사됨)
# 기동 후:
curl -i -X POST http://localhost:8080/caravanHubApi/v1/send \
  -H 'Content-Type: application/json' -d '{"INTERFACE_ID":"T1","TRANSACTION_CODE":"TC1","INTERFACE_MSG":"hi"}'
# → 200. 로그의 "PoC-3 polled ... " 3줄(반복 없음) 확인.
```

## ★ 이번 PoC 에서 확정된 구성/함정 5가지 (실제 마이그레이션에 그대로 적용)
1. **진입점 2분리 필수** — 메인 클래스(`PocApplication`)는 `SpringBootServletInitializer` 를 **상속하지 않는다**.
   상속하면 bootRun 시 `NoClassDefFoundError: WebApplicationInitializer`. WAR 진입점은 별도 `ServletInitializer`.
   (serai 가 이미 이 패턴 — 그 주석이 근거였음.)
2. **`DataSourceAutoConfiguration` 제외** — 듀얼 DataSource 를 `@Bean` 수동 구성하므로.
3. **bootRun 에선 톰캣을 providedRuntime 으로 두지 말 것** — 두면 서블릿 스택(`StandardServletEnvironment`)이 빠져
   웹서버가 안 뜬다. **PoC-2b(WildFly WAR) 시에만** `providedRuntime 'org.apache.tomcat.embed:tomcat-embed-core|-el|-websocket'`
   추가(내장 톰캣 제외 → WildFly 제공, serai 패턴).
4. **CamelServlet 은 camel-servlet-starter 가 자동 등록** — 수동 `ServletRegistrationBean` 을 또 만들면
   "servlet CamelServlet already registered" 로 톰캣 기동 실패. 매핑은 프로퍼티로:
   `camel.servlet.mapping.context-path: /caravanHubApi/*` → REST `rest("/v1").post("/send")` = `/caravanHubApi/v1/send`.
5. **SQLite `data/` 디렉터리 선생성** — 부모 디렉터리를 자동 생성하지 않음.

## PoC-2b — WildFly 배포 (남은 항목)
```bash
# build.gradle 에 providedRuntime tomcat-embed-* 3개 추가(위 3번) 후:
./gradlew bootWar          # build/libs/camel-hub-poc.war
# WildFly deployments/ 에 배포 → context-root=/ (jboss-web.xml)
curl -i -X POST http://<wildfly>:8080/caravanHubApi/v1/send -H 'Content-Type: application/json' -d '{...}'
```
camel-servlet 은 표준 `jakarta` 서블릿이라 Undertow 가 그대로 서빙 → 정석적으로 동작 예상. 경로 해석만 실측.

## 구성 요약
- `PocApplication`(plain @SpringBootApplication, main) + `ServletInitializer`(WAR 전용)
- `DataSourceConfig`(mst @Primary + if 듀얼) · `IfDbInitializer`(테스트 테이블 seed)
- `HttpInboundRoute`(REST DSL, component "servlet") · `DbInboundRoute`(camel-sql, onConsume)
- `build.gradle`(Camel 4.20 BOM) · `application.yml`(servlet 강제 + camel.servlet 매핑 + 듀얼DS) · `jboss-web.xml`(context-root /)
