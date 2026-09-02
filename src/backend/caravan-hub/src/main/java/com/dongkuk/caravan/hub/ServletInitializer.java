package com.dongkuk.caravan.hub;

import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;

/**
 * 외장 WAS(WildFly) WAR 배포 진입점.
 *
 * <p>메인 클래스({@link CaravanHubApplication})에 직접 {@code SpringBootServletInitializer} 를 상속하면
 * 로컬 {@code main()}/bootRun 실행 시에도 JVM 이 슈퍼인터페이스 {@code WebApplicationInitializer}(spring-web)를
 * 로드하려다 깨지므로, 컨테이너 진입점은 이렇게 별도 클래스로 분리한다(Spring Boot war 표준 패턴).
 * 듀얼 DataSource / Kafka 설정은 모두 어노테이션·@Configuration 기반이라 그대로 적용된다.</p>
 */
public class ServletInitializer extends SpringBootServletInitializer {

    @Override
    protected SpringApplicationBuilder configure(SpringApplicationBuilder builder) {
        return builder.sources(CaravanHubApplication.class);
    }
}
