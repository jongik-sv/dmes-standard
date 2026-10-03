package com.dongkuk.dmes.mcm.widget.query;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import javax.sql.DataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

/**
 * 빈 연결 확인 — mcm 런처처럼 {@code widget.query} 패키지를 스캔해 실행기·{@link WidgetQueryConfig}·설정 바인딩이 함께 뜨는지,
 * 전용 설정이 없으면 앱 기본(@Primary) DataSource, 있으면 전용 풀을 쓰는지 본다. 전용 DataSource 는 DataSource 형 빈이 아니다.
 */
class WidgetQueryWiringTest {

    @Configuration
    @ComponentScan(basePackageClasses = WidgetQueryExecutor.class,
            excludeFilters = @ComponentScan.Filter(type = FilterType.REGEX, pattern = ".*Test.*"))
    static class Config {

        @Bean
        @Primary
        DataSource dataSource() {
            DriverManagerDataSource ds = new DriverManagerDataSource();
            ds.setDriverClassName("org.h2.Driver");
            ds.setUrl("jdbc:h2:mem:widgetquerywiring;DB_CLOSE_DELAY=-1");
            return ds;
        }

        /** 다른 DataSource 빈이 있어도 @Primary 를 고른다(mcm 은 cactus cmn·if·caravan DataSource 가 함께 뜬다). */
        @Bean
        DataSource otherDataSource() {
            return new DriverManagerDataSource("jdbc:h2:mem:widgetquerywiring-other;DB_CLOSE_DELAY=-1");
        }

        @Bean
        WidgetDefRepository widgetDefRepository() {
            return mock(WidgetDefRepository.class);
        }

        @Bean
        WidgetUserContextResolver widgetUserContextResolver() {
            return mock(WidgetUserContextResolver.class);
        }
    }

    @Nested
    @SpringJUnitConfig(Config.class)
    class WithoutDedicatedSettings {

        @Autowired WidgetQueryDataSource queryDataSource;
        @Autowired DataSource primary;
        @Autowired WidgetQueryRunner runner;

        @Test
        @DisplayName("전용 설정이 없으면 앱 기본(@Primary) DataSource 로 실행한다")
        void usesPrimaryDataSource() {
            assertThat(queryDataSource.dedicated()).isFalse();
            assertThat(queryDataSource.dataSource()).isSameAs(primary);
            assertThat(runner.preview("mcm", "SELECT 1 AS A", 50).rows()).hasSize(1);
        }
    }

    @Nested
    @SpringJUnitConfig(Config.class)
    @TestPropertySource(properties = {
            "dmes.widget.query.datasource.url=jdbc:h2:mem:widgetquerywiring-ro;DB_CLOSE_DELAY=-1;INIT=CREATE TABLE IF NOT EXISTS RO_ONLY (ID INT)",
            "dmes.widget.query.datasource.driver-class-name=org.h2.Driver",
            "dmes.widget.query.datasource.username=sa",
            "dmes.widget.query.datasource.maximum-pool-size=2"
    })
    class WithDedicatedSettings {

        @Autowired WidgetQueryDataSource queryDataSource;
        @Autowired WidgetQueryProperties properties;
        @Autowired WidgetQueryRunner runner;

        @Test
        @DisplayName("dmes.widget.query.datasource.* 가 바인딩되고 실행기는 전용 풀로 실행한다")
        void usesDedicatedPool() {
            assertThat(properties.getDatasource().getMaximumPoolSize()).isEqualTo(2);
            assertThat(queryDataSource.dedicated()).isTrue();
            assertThat(runner.preview("mcm", "SELECT COUNT(*) AS CNT FROM RO_ONLY", 50).rows()).hasSize(1);
        }
    }
}
