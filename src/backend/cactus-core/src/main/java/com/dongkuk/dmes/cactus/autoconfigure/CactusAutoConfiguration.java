package com.dongkuk.dmes.cactus.autoconfigure;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.dongkuk.dmes.cactus.datasource.CactusDataSourceProperties;
import com.dongkuk.dmes.cactus.oasis.OasisProperties;
import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;

/**
 * Cactus 프레임워크 자동 구성 클래스.
 * 컴포넌트 스캔 및 프로퍼티 바인딩을 수행한다.
 *
 * <p>2026-05-20 — ComponentScan 범위 축소.
 *   cactus 패키지 안의 @AutoConfiguration / *AutoConfiguration 클래스들은
 *   META-INF/spring/AutoConfiguration.imports 메커니즘으로만 등록되어야 한다.
 *   ComponentScan 으로 같이 잡히면 Boot 의 auto-config sorter 순서가 깨져
 *   @ConditionalOnBean 조건 평가에 부작용 발생 (예: sqlSessionFactoryBiz timing).
 */
@AutoConfiguration
@EnableConfigurationProperties({
        CactusProperties.class,
        CactusTxProperties.class,
        CactusDataSourceProperties.class,
        OasisProperties.class
})
@ComponentScan(
        basePackages = "com.dongkuk.dmes.cactus",
        excludeFilters = {
                @ComponentScan.Filter(type = FilterType.ANNOTATION, classes = AutoConfiguration.class),
                @ComponentScan.Filter(type = FilterType.REGEX, pattern = ".*AutoConfiguration$")
        }
)
public class CactusAutoConfiguration {

    /** 로거 */
    private static final Logger log = LoggerFactory.getLogger(CactusAutoConfiguration.class);

    /** 기본 생성자. 자동 구성 로드 시 로그를 출력한다. */
    public CactusAutoConfiguration() {
        log.info("[Cactus] AutoConfiguration loaded");
    }
}
