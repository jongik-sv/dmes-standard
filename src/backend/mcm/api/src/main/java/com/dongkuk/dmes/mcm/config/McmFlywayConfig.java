package com.dongkuk.dmes.mcm.config;

import com.dongkuk.dmes.mcm.db.McmSchemaMigrator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import java.util.Map;

/**
 * mcm 의 스키마별 Flyway 실행 (oracle-1007 a1, 2026-10-07) — 본문은 {@link McmSchemaMigrator}.
 *
 * <p>Spring Boot 의 {@code spring.flyway} 자동 구성은 접속 하나만 지원해 꺼 두고({@code application.yml}), 이 구성이
 * {@code dmes.flyway.enabled=true} 일 때 MCMAPUSER·MCM_SOURCE·MCM_BACKUP·MCAAPUSER 를 각 주인으로 접속해 마이그레이션한다.
 * 기본 EMF({@link JpaConfig#entityManagerFactory})는 {@link #MIGRATOR_BEAN} 에 {@code @DependsOn} 을 걸어 마이그레이션 뒤에 뜬다.
 *
 * <ul>
 *   <li>{@code dmes.flyway.url} — 기본값 {@code spring.datasource.url}(같은 PDB, 사용자만 다르다)</li>
 *   <li>{@code dmes.flyway.password} — 스키마 주인 비밀번호. 기본값 {@code spring.datasource.password}(로컬은 모든 사용자가 같다)</li>
 *   <li>{@code dmes.flyway.app-user} — 자리표시자 {@code app_user}. 기본값 MCMAPUSER</li>
 * </ul>
 *
 * <p>WildFly(dev·prod)에서는 끈다 — DBA 가 같은 V 파일을 적용한다.
 */
@Configuration
public class McmFlywayConfig {

    private static final Logger log = LoggerFactory.getLogger(McmFlywayConfig.class);

    /** 기본 EMF 가 {@code @DependsOn} 으로 기다리는 빈 이름. */
    public static final String MIGRATOR_BEAN = "mcmSchemaMigration";

    /** 마이그레이션 결과(스키마별 이번 적용 수). 꺼져 있으면 빈 맵. */
    public record Result(Map<String, Integer> applied) {
    }

    @Bean(MIGRATOR_BEAN)
    public Result mcmSchemaMigration(Environment env) {
        if (!env.getProperty("dmes.flyway.enabled", Boolean.class, false)) {
            log.info("[McmFlywayConfig] dmes.flyway.enabled=false — 스키마 마이그레이션 건너뜀(스키마는 DBA·PDB 템플릿이 관리).");
            return new Result(Map.of());
        }
        String url = env.getProperty("dmes.flyway.url", env.getProperty("spring.datasource.url", ""));
        String password = env.getProperty("dmes.flyway.password", env.getProperty("spring.datasource.password", ""));
        String appUser = env.getProperty("dmes.flyway.app-user", McmSchemaMigrator.DEFAULT_APP_USER);
        if (url.isBlank()) {
            throw new IllegalStateException("dmes.flyway.enabled=true 인데 dmes.flyway.url·spring.datasource.url 이 비어 있다.");
        }
        return new Result(McmSchemaMigrator.migrate(url, password, appUser));
    }
}
