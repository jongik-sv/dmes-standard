package com.dongkuk.dmes.mqc.testdb;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * mqc 서비스 시험용 Oracle 접속 — 시험 하니스(build-logic OraTestPdbService)가 복제한 시험 PDB 에 MQCAPUSER 로 붙는다.
 *
 * <p>접속값은 하니스가 넘기는 시스템 속성 {@code dmes.ora.url}·{@code dmes.ora.password} 이다(없으면 yml 기본값을 그대로 쓴다).
 * 이 클래스를 상속한 시험끼리 컨텍스트 하나를 나눠 쓴다. 컨텍스트가 처음 뜰 때 Flyway 가 V1 기준선을 시험 PDB 의 MQCAPUSER 스키마에 적용한다.
 *
 * <p>MDM 메타 캐시({@code cactus.mdm.enabled})는 끈다 — 켜 두면 로컬에 떠 있는 MDM(8096)을 부른다.
 */
public abstract class MqcTestDb {

    @DynamicPropertySource
    static void mqcTestDatasource(DynamicPropertyRegistry registry) {
        String url = System.getProperty("dmes.ora.url");
        if (url != null && !url.isBlank()) {
            registry.add("spring.datasource.url", () -> url);
            registry.add("spring.datasource.username", () -> "MQCAPUSER");
            registry.add("spring.datasource.password", () -> System.getProperty("dmes.ora.password", "dmes_password_123"));
        }
        registry.add("spring.datasource.hikari.maximum-pool-size", () -> "3");
        registry.add("cactus.mdm.enabled", () -> "false");
    }
}
