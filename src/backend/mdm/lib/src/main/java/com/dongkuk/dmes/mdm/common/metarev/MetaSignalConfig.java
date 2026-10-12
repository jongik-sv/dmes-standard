package com.dongkuk.dmes.mdm.common.metarev;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 메타 변경 신호 빈(ADR-0007 D2 개정). 꺼져 있어도 빈은 만든다 — {@link MetaChangeSignaler#afterCommit()} 이 아무것도 하지 않는다.
 * 키는 ClientKeyFilter·예약 작업 호출과 같은 우선순위(환경 변수 {@code BACKEND_CLIENT_KEY} > {@code cactus.security.client-key}).
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(MetaSignalProperties.class)
public class MetaSignalConfig {

    @Bean(destroyMethod = "close")
    public MetaChangeSignaler metaChangeSignaler(MetaSignalProperties props, @Value("${cactus.security.client-key:}") String configuredKey) {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        return new MetaChangeSignaler(props, env != null && !env.isBlank() ? env : configuredKey);
    }
}
