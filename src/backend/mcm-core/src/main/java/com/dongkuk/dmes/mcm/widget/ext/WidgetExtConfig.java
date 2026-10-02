package com.dongkuk.dmes.mcm.widget.ext;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * 환율·날씨 설정 바인딩. mcm-core 의 다른 위젯 빈처럼 사이트가 {@code com.dongkuk.dmes.mcm} 을 스캔할 때만 켜진다
 * (이름이 {@code *AutoConfiguration} 이면 mcm 런처 스캔에서 빠지므로 쓰지 않는다).
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(WidgetExtProperties.class)
public class WidgetExtConfig {
}
