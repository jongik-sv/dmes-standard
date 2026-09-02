package com.dongkuk.caravan.hub.poc.config;

import javax.sql.DataSource;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

/**
 * PoC-3 핵심 — serai 듀얼 DataSource 미러: MST({@code @Primary}) + IF.
 *
 * <p>검증 포인트: camel-sql 라우트의 {@code dataSource=#ifDataSource} 가
 * <b>{@code @Primary} 가 아닌 IF DataSource 를 정확히 잡는지</b>.
 * Camel 레지스트리는 스프링 빈 이름으로 참조하므로 {@code "ifDataSource"} 로 조회된다.</p>
 *
 * <p>PoC 는 로컬 자족 실행을 위해 두 DS 모두 SQLite(별도 파일)로 둔다.
 * (실제 caravan-hub 은 MST=CARAVANUSER / IF=EAIUSER.)</p>
 */
@Configuration
public class DataSourceConfig {

    @Primary
    @Bean(name = "mstDataSource")
    @ConfigurationProperties(prefix = "app.datasource.mst")
    public DataSource mstDataSource() {
        return DataSourceBuilder.create().build();
    }

    @Bean(name = "ifDataSource")
    @ConfigurationProperties(prefix = "app.datasource.if")
    public DataSource ifDataSource() {
        return DataSourceBuilder.create().build();
    }
}
