package com.dongkuk.dmes.cactus.datasource;

import com.zaxxer.hikari.HikariDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration;
import org.springframework.context.annotation.Bean;

import javax.sql.DataSource;

/**
 * cactus 보조 DataSource 자동 설정. 미결 #5 결정(2026-05-12) — Phase 3 범위:
 * 단일 보조 DS, {@code cactus.datasource.secondary.url} 명시 시에만 활성.
 *
 * <p>활성 조건:
 * <ul>
 *   <li>{@link HikariDataSource} classpath (HikariCP 가용)</li>
 *   <li>{@code cactus.datasource.secondary.url} 프로퍼티 존재</li>
 *   <li>host 의 primary {@link DataSource} 빈이 명시 등록되어 있음 ({@code @ConditionalOnBean})</li>
 * </ul>
 *
 * <p>빈 이름 {@code cactusSecondaryDataSource} — host primary DataSource ({@code dataSource})
 * 와 충돌 없음. {@link CactusSecondaryDataSourceAutoConfiguration} 활성 시 추가 EMF/TxMgr 도
 * {@code cactus.jpa.secondary.enabled=true} 로 별도 활성화 필요.
 *
 * <p><b>책임 분리 (2026-05-13)</b>: cactus 는 secondary 보조 빈만 책임. host 의 primary
 * DataSource / EMF / TxMgr 는 host(소비 모듈) 가 명시 정의 (예: mcm/api/.../config/JpaConfig).
 * 이전 임시 fix 였던 cactus 측의 host primary 자동 등록 코드는 제거됨 (cactus 의 책임 비대화 회피).
 *
 * <p>film {@code BizDataSourceConfig} 의 cactus 동등물 — 단 dev/prd profile 분기는 yml 에서 처리.
 */
@AutoConfiguration(after = DataSourceAutoConfiguration.class)
@ConditionalOnClass(HikariDataSource.class)
@ConditionalOnBean(DataSource.class)
@ConditionalOnProperty(prefix = "cactus.datasource.secondary", name = "url")
@EnableConfigurationProperties(CactusDataSourceProperties.class)
public class CactusSecondaryDataSourceAutoConfiguration {

    private static final Logger log = LoggerFactory.getLogger(CactusSecondaryDataSourceAutoConfiguration.class);

    @Bean(name = "cactusSecondaryDataSource")
    public DataSource cactusSecondaryDataSource(CactusDataSourceProperties props) {
        CactusDataSourceProperties.Secondary sec = props.getSecondary();
        log.info("[Cactus] secondary DataSource — url={}, pool={}", sec.getUrl(), sec.getPoolName());

        HikariDataSource ds = new HikariDataSource();
        ds.setJdbcUrl(sec.getUrl());
        if (sec.getDriverClassName() != null && !sec.getDriverClassName().isBlank()) {
            ds.setDriverClassName(sec.getDriverClassName());
        }
        if (sec.getUsername() != null) {
            ds.setUsername(sec.getUsername());
        }
        if (sec.getPassword() != null) {
            ds.setPassword(sec.getPassword());
        }
        ds.setMaximumPoolSize(sec.getMaximumPoolSize());
        ds.setAutoCommit(sec.isAutoCommit());
        ds.setPoolName(sec.getPoolName());
        return ds;
    }
}
