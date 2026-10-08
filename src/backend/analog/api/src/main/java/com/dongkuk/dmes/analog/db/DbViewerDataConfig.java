package com.dongkuk.dmes.analog.db;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;

/**
 * DB 뷰어 데이터소스 — {@code analog.db.url} 설정 시에만 활성화된다 (ADR-0002 D5).
 * 읽기전용 유저 사용이 전제이며, 서버 측에서도 SELECT 단문·건수 상한을 강제한다.
 */
@Configuration
@EnableConfigurationProperties(DbViewerProperties.class)
@Conditional(DbViewerEnabledCondition.class)
public class DbViewerDataConfig {

    @Bean
    public DataSource dbViewerDataSource(DbViewerProperties properties) {
        return DataSourceBuilder.create()
                .driverClassName("oracle.jdbc.OracleDriver")
                .url(properties.getUrl())
                .username(properties.getUsername())
                .password(properties.getPassword())
                .build();
    }

    @Bean
    public JdbcTemplate dbViewerJdbcTemplate(DataSource dbViewerDataSource, DbViewerProperties properties) {
        JdbcTemplate jdbcTemplate = new JdbcTemplate(dbViewerDataSource);
        jdbcTemplate.setQueryTimeout(properties.getQueryTimeoutSeconds());
        // SQL 텍스트 우회 시에도 드라이버 단계에서 행 수를 차단한다 (추출 단계 상한과 이중화).
        jdbcTemplate.setMaxRows(properties.getMaxRows());
        return jdbcTemplate;
    }
}
