package com.dongkuk.dmes.cactus.mybatis;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * cactus MyBatis 자동 설정 프로퍼티. application.yml 의 {@code cactus.mybatis.*} 바인딩.
 *
 * <pre>
 * cactus:
 *   mybatis:
 *     enabled: true                                   # 디폴트 true
 *     mapper-locations: classpath*:persistence/**\/*.xml   # 디폴트 (multi-DS 공유 패턴)
 *     config-location: classpath:cactus-mybatis-config.xml  # 디폴트 (cactus 제공)
 *     master-code-decoding:
 *       enabled: true                                 # MasterCodeMybatisInterceptor 활성 여부
 * </pre>
 *
 * <p>Phase 3 (2026-05-12) — 본 클래스는 {@link CactusMybatisAutoConfiguration} 에서 바인딩.
 *
 * <p>1.0.22-SNAPSHOT (2026-05-19) — {@link CactusMultiMybatisAutoConfiguration} 도입.
 * {@code enabled}, {@code mapper-locations}, {@code config-location} 추가.
 * 자세한 내용은 {@code docs/cactus/cactus-mybatis-multi-ds-design.md} §5-2 참고.
 */
@ConfigurationProperties(prefix = "cactus.mybatis")
public class CactusMybatisProperties {

    /** mybatis 자동 활성 여부 (디폴트 true). false 면 multi-DS SqlSessionFactory 등록 안 함. */
    private boolean enabled = true;

    /**
     * mapper.xml location 패턴. 디폴트 = {@code classpath*:persistence/**\/*.xml}.
     *
     * <p>★ {@code classpath*:} 필수 — {@code classpath:} 사용 시 base 디렉토리 (persistence/) 미존재 환경에서
     * Spring PathMatchingResourcePatternResolver 가 FileNotFoundException throw.
     * film 의 검증된 패턴 ({@code classpath*:/mappers/**\/*.xml}) 동일 전략.
     */
    private String mapperLocations = "classpath*:persistence/**/*.xml";

    /** mybatis-config.xml 위치 (cactus 제공 기본 설정). */
    private String configLocation = "classpath:cactus-mybatis-config.xml";

    private final MasterCodeDecoding masterCodeDecoding = new MasterCodeDecoding();

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public String getMapperLocations() { return mapperLocations; }
    public void setMapperLocations(String mapperLocations) { this.mapperLocations = mapperLocations; }

    public String getConfigLocation() { return configLocation; }
    public void setConfigLocation(String configLocation) { this.configLocation = configLocation; }

    public MasterCodeDecoding getMasterCodeDecoding() {
        return masterCodeDecoding;
    }

    public static class MasterCodeDecoding {
        /** MasterCode 디코딩 인터셉터 활성화 여부 (기본 true). */
        private boolean enabled = true;

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
    }
}
