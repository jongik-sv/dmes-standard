package com.dongkuk.dmes.mcm;

import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;

/**
 * 외장 WAS(WildFly) WAR 배포 진입점.
 *
 * <p>메인 클래스({@link McmApplication})에 직접 {@code SpringBootServletInitializer} 를 상속하면
 * 로컬 {@code main()}/bootRun 실행 시에도 JVM 이 슈퍼인터페이스 {@code WebApplicationInitializer}(spring-web)를
 * 로드하려다 깨지므로, 컨테이너 진입점은 이렇게 별도 클래스로 분리한다(Spring Boot war 표준 패턴).
 * 로컬 실행은 이 클래스를 참조하지 않으므로 영향이 없고, WildFly 배포 시에만 컨테이너가 찾아 호출한다.</p>
 *
 * <p>main() 의 LocalSqliteDataSource / cactusExtrasLocalSqlite 초기화와 spring.profiles.default=local
 * 폴백은 모두 main() 경로 전용 — 본 클래스(WAR 경로)에는 적용되지 않으므로, WildFly(dev/prod JNDI) 는
 * JAVA_OPTS 의 -Dspring.profiles.active 지정이 의무이며 누락 시 datasource 미설정으로 fail-fast 한다
 * (SQLite 오기동 방지 — 2026-07-07 JNDI 전환 설계).</p>
 */
public class ServletInitializer extends SpringBootServletInitializer {

    @Override
    protected SpringApplicationBuilder configure(SpringApplicationBuilder builder) {
        return builder.sources(McmApplication.class);
    }
}
