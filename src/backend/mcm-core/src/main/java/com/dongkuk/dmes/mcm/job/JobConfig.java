package com.dongkuk.dmes.mcm.job;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/** 예약 작업 설정 바인딩. {@code McmCoreAutoConfiguration} 이 올린다(다른 앱은 이것만 얻는다). 빈 조립은 Task 5·6·7 이 {@code @Import} 로 더한다. */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(JobProperties.class)
public class JobConfig {
}
