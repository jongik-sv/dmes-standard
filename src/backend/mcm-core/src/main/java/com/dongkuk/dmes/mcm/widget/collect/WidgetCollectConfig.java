package com.dongkuk.dmes.mcm.widget.collect;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * 정시 수집 설정 바인딩. mcm-core 의 다른 위젯 빈처럼 사이트가 {@code com.dongkuk.dmes.mcm} 을 스캔할 때만 켜진다
 * ({@code widget.ext.WidgetExtConfig} 와 같은 방식).
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(WidgetCollectProperties.class)
public class WidgetCollectConfig {
}
