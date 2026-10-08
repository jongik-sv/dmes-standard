package com.dongkuk.dmes.mcm.job;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

class JobPropertiesTest {

    /** 설정 바인딩만 본다 — {@link JobConfig} 가 얹는 에이전트·내장 서비스·판정 빈은 모듈 판정·DataSource 가 필요해 이 시험의 대상이 아니다. */
    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(JobProperties.class)
    static class PropertiesOnly {
    }

    private final ApplicationContextRunner runner = new ApplicationContextRunner().withUserConfiguration(PropertiesOnly.class);

    @Test
    @DisplayName("기본값 — agent 켜짐, server 꺼짐(배치 50), 스키마 MCMAPUSER, 풀 4, collect 켜짐, 허용 호스트 없음")
    void defaults() {
        runner.run(ctx -> {
            JobProperties p = ctx.getBean(JobProperties.class);
            assertThat(p.getAgent().isEnabled()).isTrue();
            assertThat(p.getServer().isEnabled()).isFalse();
            assertThat(p.getServer().getBatchSize()).isEqualTo(50);
            assertThat(p.getSchema()).isEqualTo("MCMAPUSER");
            assertThat(p.getPoolSize()).isEqualTo(4);
            assertThat(p.getCollect().isEnabled()).isTrue();
            assertThat(p.getHttp().getAllowedHosts()).isEmpty();
            assertThat(p.getModules()).isEmpty();
            assertThat(p.getModule()).isNull();
        });
    }

    @Test
    @DisplayName("yml 키 바인딩 — module·server.enabled·modules.<모듈>.base-url·http.allowed-hosts·collect.enabled")
    void binding() {
        runner.withPropertyValues(
                "dmes.job.module=mdm", "dmes.job.server.enabled=true", "dmes.job.server.batch-size=20",
                "dmes.job.modules.mdm.base-url=http://localhost:18096", "dmes.job.http.allowed-hosts[0]=api.example.com",
                "dmes.job.collect.enabled=false", "dmes.job.schema=MCMAPUSER2", "dmes.job.pool-size=2", "dmes.job.server-name=n1")
                .run(ctx -> {
                    JobProperties p = ctx.getBean(JobProperties.class);
                    assertThat(p.getModule()).isEqualTo("mdm");
                    assertThat(p.getServer().isEnabled()).isTrue();
                    assertThat(p.getServer().getBatchSize()).isEqualTo(20);
                    assertThat(p.getModules().get("mdm").getBaseUrl()).isEqualTo("http://localhost:18096");
                    assertThat(p.getHttp().getAllowedHosts()).containsExactly("api.example.com");
                    assertThat(p.getCollect().isEnabled()).isFalse();
                    assertThat(p.getSchema()).isEqualTo("MCMAPUSER2");
                    assertThat(p.getPoolSize()).isEqualTo(2);
                    assertThat(p.getServerName()).isEqualTo("n1");
                });
    }
}
