package com.dongkuk.caravan.hub.poc;

import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;

/**
 * WAR(WildFly) 배포 진입점 (PoC-2b). serai ServletInitializer 와 동일 패턴.
 * 컨테이너 부트 시점에 SQLite 데이터 디렉터리를 먼저 생성.
 */
public class ServletInitializer extends SpringBootServletInitializer {

    @Override
    protected SpringApplicationBuilder configure(SpringApplicationBuilder builder) {
        PocApplication.ensureDataDir();
        return builder.sources(PocApplication.class);
    }
}
