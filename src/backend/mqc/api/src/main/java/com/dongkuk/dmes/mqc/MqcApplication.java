package com.dongkuk.dmes.mqc;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

/**
 * Mqc 애플리케이션 진입점.
 *
 * <p><b>@EnableJpaRepositories / @EntityScan 을 명시하는 이유</b> — cactus-core 의
 * {@code MasterCodeJpaAutoConfiguration} 이 자체 {@code @EnableJpaRepositories} 를 선언하고 있어,
 * 그 순간 Spring Boot 의 {@code JpaRepositoriesAutoConfiguration}(기본 패키지 자동 스캔)이 물러난다.
 * 그대로 두면 본 모듈의 Repository 가 하나도 등록되지 않아
 * "required a bean of type ...Repository that could not be found" 로 기동이 실패한다.
 *
 * <p>스캔 범위는 본 모듈 패키지로 한정한다. 공유 라이브러리(mcm-core / aps-core)의 엔티티까지
 * 쓰려면 그 패키지를 아래 목록에 명시적으로 추가한다.
 * <ul>
 *   <li>{@code com.dongkuk.dmes.cactus.security.auth} — CactusAuthAutoConfiguration 이 단독 소유. 추가 금지.</li>
 *   <li>{@code com.dongkuk.dmes.cactus.mastercode} — MasterCodeJpaAutoConfiguration 이 단독 소유. 추가 금지.</li>
 * </ul>
 */
@SpringBootApplication
@EnableJpaRepositories(basePackages = "com.dongkuk.dmes.mqc")
@EntityScan(basePackages = "com.dongkuk.dmes.mqc")
public class MqcApplication {

    public static void main(String[] args) {
        SpringApplication.run(MqcApplication.class, args);
    }
}
