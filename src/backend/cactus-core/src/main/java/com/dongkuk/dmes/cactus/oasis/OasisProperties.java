package com.dongkuk.dmes.cactus.oasis;

import com.dongkuk.dmes.cactus.oasis.aop.OasisAopCheckMode;
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
 *     transactional: false                   # true 면 CactusServiceStarterFactory + JpaTransactionManager
 *     transaction-manager-name: transactionManager
 *     aop-check: warn                         # warn | fail | off. BPMN 빈의 프록시 의존 어노테이션 기동 검사
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

    /** 트랜잭션 사용 여부 — true 면 {@code CactusServiceStarterFactory} + JpaTxMgr. */
    private boolean transactional = false;

    /** 트랜잭션 매니저 빈 이름 (기본 Spring Boot 의 "transactionManager"). */
    private String transactionManagerName = "transactionManager";

    /**
     * BPMN 이 부르는 빈의 프록시 의존 어노테이션 검사 방식 ({@code warn} | {@code fail} | {@code off}).
     * OASIS 서비스 태스크 경로에서는 {@code @Transactional}·{@code @Cacheable} 등이 기대대로 동작하지 않으므로
     * (비트랜잭션 모드는 언랩으로 무시, 트랜잭션 모드는 프록시 호출이 실패할 수 있음) 기동 시 알린다. HTTP 로더 모드는 검사하지 못한다.
     * 기본 {@code warn} — 다른 모듈이 먼저 깨지지 않게 fail 을 기본으로 두지 않는다.
     */
    private OasisAopCheckMode aopCheck = OasisAopCheckMode.WARN;

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


    public OasisAopCheckMode getAopCheck() { return aopCheck; }
    public void setAopCheck(OasisAopCheckMode aopCheck) { this.aopCheck = aopCheck; }

    public Cache getCache() { return cache; }

    /**
     * BPMN parsing cache 설정 (1.0.21 신규).
     */
    public static class Cache {
        /**
         * Cache 크기 (default 100, 1 이상 — transactional 모드에서 0 이하이면 기동 때 IllegalArgumentException). 모듈의 BPMN 개수 기준 조절.
         * mcm 35개·mdm 52개 BPMN 기준 100 충분. 넘치면 가장 먼저 넣은 BPMN 부터 내보낸다
         * ({@code CactusConcurrentCacheService}).
         */
        private int size = 100;

        public int getSize() { return size; }
        public void setSize(int size) { this.size = size; }
    }
}
