package com.dongkuk.dmes.cactus.oasis;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * OASIS 설정 프로퍼티.
 *
 * <pre>
 * cactus:
 *   oasis:
 *     service-group: production
 *     service-path: /services                # ClassPathFileServiceLoader 의 검색 prefix (classpath* 기준)
 *     service-loader-url:                    # 명시 시 HttpServiceDocumentLoader 사용 (transactional=true 필수)
 *     transactional: false                   # true 면 SpringServiceStarterFactory + JpaTransactionManager
 *     transaction-manager-name: transactionManager
 *     dialect:                                # mssql | sqlite | none. 명시 시 ColumnConverter 빈 등록
 * </pre>
 *
 * <p>Phase 1 (2026-05-12) — 미결 #6/#7/#8 + R-11 결정 반영. {@code dialect},
 * {@code transactionManagerName}, {@code serviceLoaderUrl} 필드 신규 추가.
 *
 * <p>1.0.20-SNAPSHOT (2026-05-14) — {@code servicePath} 디폴트값을 {@code "resources/services"}
 * 에서 {@code "/services"} 로 변경. 이전 디폴트는 oasis-core 5.1.0 의
 * {@code ClassPathFileServiceLoader} 검색 패턴 {@code classpath*:{path}**} 와 호환되지
 * 않아 BPMN 매칭 0건 → {@code ServiceNotFoundException} 발생. film 의 검증된
 * 컨벤션 {@code "/services"} 으로 정정 (classpath root 의 {@code services/} 디렉토리 매칭).
 */
@ConfigurationProperties(prefix = "cactus.oasis")
public class OasisProperties {

    /** 서비스 그룹 (URL prefix, Nginx 라우팅 키) */
    private String serviceGroup = "app";

    /**
     * BPMN 서비스 정의 파일의 classpath prefix.
     * <p>{@code ClassPathFileServiceLoader} 가 {@code classpath*:{servicePath}**} 패턴으로
     * 검색하므로, 빌드 산출물의 {@code build/resources/main/services/} 위치를 기준으로
     * 매칭하려면 {@code "/services"} 를 사용한다. (film 검증 컨벤션과 동일)
     */
    private String servicePath = "/services";

    /** HTTP 원격 BPMN 로더 URL. {@code {serviceId}} 토큰 치환. {@code transactional=true} 필수. */
    private String serviceLoaderUrl;

    /** 트랜잭션 사용 여부 — true 면 {@code SpringServiceStarterFactory} + JpaTxMgr. */
    private boolean transactional = false;

    /** 트랜잭션 매니저 빈 이름 (기본 Spring Boot 의 "transactionManager"). */
    private String transactionManagerName = "transactionManager";

    /**
     * DB dialect — {@code ColumnConverter} 빈 등록 분기.
     * 허용값: {@code mssql} | {@code sqlite} | {@code none} 또는 미설정.
     */
    private String dialect;

    /**
     * BPMN parsing cache 설정 (1.0.21 신규 — R-multi-22 해소).
     * {@code CactusCachingServiceProvider} 가 사용. oasis-core 디폴트 캐시 미동작 대체.
     */
    private final Cache cache = new Cache();

    public String getServiceGroup() { return serviceGroup; }
    public void setServiceGroup(String serviceGroup) { this.serviceGroup = serviceGroup; }

    public String getServicePath() { return servicePath; }
    public void setServicePath(String servicePath) { this.servicePath = servicePath; }

    public String getServiceLoaderUrl() { return serviceLoaderUrl; }
    public void setServiceLoaderUrl(String serviceLoaderUrl) { this.serviceLoaderUrl = serviceLoaderUrl; }

    public boolean isTransactional() { return transactional; }
    public void setTransactional(boolean transactional) { this.transactional = transactional; }

    /**
     * @deprecated 1.0.21 부터 {@code cactus.tx.managers} (CactusTxProperties) 사용. 1.0.22 에서 제거.
     */
    @Deprecated
    public String getTransactionManagerName() { return transactionManagerName; }
    @Deprecated
    public void setTransactionManagerName(String transactionManagerName) {
        this.transactionManagerName = transactionManagerName;
    }

    public String getDialect() { return dialect; }
    public void setDialect(String dialect) { this.dialect = dialect; }

    public Cache getCache() { return cache; }

    /**
     * BPMN parsing cache 설정 (1.0.21 신규).
     */
    public static class Cache {
        /**
         * Cache 크기 (default 100). 모듈의 BPMN 개수 기준 조절.
         * mcm 38개 BPMN 기준 100 충분.
         */
        private int size = 100;

        public int getSize() { return size; }
        public void setSize(int size) { this.size = size; }
    }
}
