package com.dongkuk.dmes.mcm.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.zaxxer.hikari.HikariDataSource;
import java.util.Optional;
import javax.sql.DataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.env.MockEnvironment;

/**
 * JOB 전용 연결 고르기·모듈 판정 확인. 연결은 맺지 않는다(더미 주소) — Hikari 풀은 처음 빌릴 때 뜬다.
 */
class JobDataSourceTest {

    private static final String DUMMY_URL = "jdbc:oracle:thin:@//localhost:1/none";

    private static DataSource appDataSource() {
        return new DriverManagerDataSource(DUMMY_URL, "u", "p");
    }

    @Test
    @DisplayName("url 이 있으면 직결 풀(job-ds, 최대 2)을 만들고 전용으로 본다")
    void dedicatedWhenUrl() throws Exception {
        JobProperties props = new JobProperties();
        props.getDatasource().setUrl(DUMMY_URL);
        props.getDatasource().setUsername("MCMAPUSER");
        props.getDatasource().setPassword("pw");

        JobDataSource ds = JobConfig.create(props, JobDataSourceTest::appDataSource);
        try {
            assertThat(ds.isDedicated()).isTrue();
            HikariDataSource h = (HikariDataSource) ds.jdbc().getDataSource();
            assertThat(h.getPoolName()).isEqualTo("job-ds");
            assertThat(h.getMaximumPoolSize()).isEqualTo(2);
            assertThat(h.getMinimumIdle()).isZero();
            assertThat(ds.namedJdbc().getJdbcOperations()).isSameAs(ds.jdbc());
            assertThat(ds.tx()).isNotNull();
        } finally {
            ds.destroy();
        }
    }

    @Test
    @DisplayName("전용 설정이 없으면 앱 DataSource 를 그대로 쓴다")
    void sharedWhenNoUrl() {
        DataSource app = appDataSource();
        JobDataSource ds = JobConfig.create(new JobProperties(), () -> app);
        assertThat(ds.isDedicated()).isFalse();
        assertThat(ds.jdbc().getDataSource()).isSameAs(app);
    }

    @Test
    @DisplayName("계정만 있고 url·jndi 가 없으면 앱 DataSource 로 물러나지 않고 막는다")
    void rejectsPartialDedicated() {
        JobProperties props = new JobProperties();
        props.getDatasource().setUsername("MCMAPUSER");
        assertThatThrownBy(() -> JobConfig.create(props, JobDataSourceTest::appDataSource))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("DataSource 형 빈을 새로 만들지 않는다 — 앱 DataSource 하나뿐")
    void noExtraDataSourceBean() {
        new ApplicationContextRunner()
                .withUserConfiguration(AppDs.class, JobConfig.class)
                .run(ctx -> {
                    assertThat(ctx.getBeansOfType(DataSource.class)).hasSize(1);
                    assertThat(ctx).hasSingleBean(JobDataSource.class);
                    assertThat(ctx.getBean(JobDataSource.class).isDedicated()).isFalse();
                });
        new ApplicationContextRunner()
                .withUserConfiguration(AppDs.class, JobConfig.class)
                .withPropertyValues("dmes.job.datasource.url=" + DUMMY_URL, "dmes.job.datasource.username=MCMAPUSER")
                .run(ctx -> {
                    assertThat(ctx.getBeansOfType(DataSource.class)).hasSize(1);
                    assertThat(ctx.getBean(JobDataSource.class).isDedicated()).isTrue();
                });
    }

    @Test
    @DisplayName("dmes.job.enabled=false 이면 JobDataSource 빈을 만들지 않는다")
    void disabledNoBean() {
        new ApplicationContextRunner()
                .withUserConfiguration(AppDs.class, JobConfig.class)
                .withPropertyValues("dmes.job.enabled=false")
                .run(ctx -> assertThat(ctx).doesNotHaveBean(JobDataSource.class));
    }

    @Test
    @DisplayName("JobProperties 기본값")
    void propertyDefaults() {
        JobProperties p = new JobProperties();
        assertThat(p.isEnabled()).isTrue();
        assertThat(p.getPoolSize()).isEqualTo(4);
        assertThat(p.getMaxClaimPerTick()).isEqualTo(20);
        assertThat(p.getVerPollSec()).isEqualTo(10);
        assertThat(p.getDatasource().getMaximumPoolSize()).isEqualTo(2);
        assertThat(p.getHttp().getAllowedHosts()).isEmpty();
        assertThat(p.getCollect().isEnabled()).isTrue();
    }

    @Test
    @DisplayName("JobModule.of — 대소문자 무시, 모르는 값은 IllegalArgumentException")
    void moduleOf() {
        assertThat(JobModule.of("mdm")).isEqualTo(JobModule.MDM);
        assertThat(JobModule.of(" MPN ")).isEqualTo(JobModule.MPN);
        assertThatThrownBy(() -> JobModule.of("xyz")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> JobModule.of(null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("JobModule.resolve — 설정값 우선, 없으면 spring.application.name 첫 '-' 앞부분")
    void moduleResolve() {
        JobProperties props = new JobProperties();
        assertThat(JobModule.resolve(props, new MockEnvironment().withProperty("spring.application.name", "mdm"))).isEqualTo(JobModule.MDM);
        assertThat(JobModule.resolve(props, new MockEnvironment().withProperty("spring.application.name", "mcm-api"))).isEqualTo(JobModule.MCM);
        props.setModule("mqc");
        assertThat(JobModule.resolve(props, new MockEnvironment().withProperty("spring.application.name", "mdm"))).isEqualTo(JobModule.MQC);

        JobProperties none = new JobProperties();
        assertThat(JobModule.tryResolve(none, new MockEnvironment().withProperty("spring.application.name", "analog"))).isEqualTo(Optional.empty());
        assertThat(JobModule.tryResolve(none, new MockEnvironment())).isEmpty();
        assertThatThrownBy(() -> JobModule.resolve(none, new MockEnvironment().withProperty("spring.application.name", "analog")))
                .isInstanceOf(IllegalStateException.class);
    }

    @Configuration(proxyBeanMethods = false)
    static class AppDs {
        @Bean
        DataSource dataSource() {
            return appDataSource();
        }
    }
}
