package com.dongkuk.dmes.mls.testdb;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * mls 서비스 시험용 Oracle 접속 — 시험 하니스(build-logic OraTestPdbService)가 복제한 시험 PDB 에 MLSAPUSER 로 붙는다.
 *
 * <p>접속값은 하니스가 넘기는 시스템 속성 {@code dmes.ora.url}·{@code dmes.ora.password} 이다(없으면 yml 기본값을 그대로 쓴다).
 * 이 클래스를 상속한 시험끼리 컨텍스트 하나를 나눠 쓰며, 각 시험은 {@code @Transactional} 롤백으로 서로 격리한다.
 * 컨텍스트가 처음 뜰 때 Flyway 가 V1 기준선을 시험 PDB 의 MLSAPUSER 스키마에 적용한다.
 *
 * <p>MDM 메타 캐시({@code cactus.mdm.enabled})는 끈다 — 켜 두면 로컬에 떠 있는 MDM(8096)을 부르고, 저장 검증({@code MdmValidator})이
 * 그 서버의 정의·가동 여부에 따라 결과가 달라진다.
 */
public abstract class MlsTestDb {

    @DynamicPropertySource
    static void mlsTestDatasource(DynamicPropertyRegistry registry) {
        String url = System.getProperty("dmes.ora.url");
        if (url != null && !url.isBlank()) {
            registry.add("spring.datasource.url", () -> url);
            registry.add("spring.datasource.username", () -> "MLSAPUSER");
            registry.add("spring.datasource.password", () -> System.getProperty("dmes.ora.password", "dmes_password_123"));
        }
        registry.add("spring.datasource.hikari.maximum-pool-size", () -> "3");
        registry.add("cactus.mdm.enabled", () -> "false");
    }
}
