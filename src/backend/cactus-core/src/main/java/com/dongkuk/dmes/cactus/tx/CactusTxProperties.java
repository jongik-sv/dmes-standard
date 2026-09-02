package com.dongkuk.dmes.cactus.tx;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Multi-TxMgr 설정 (1.0.21-SNAPSHOT 신규).
 *
 * <pre>
 * cactus:
 *   datasource:
 *     primary-alias: biz                   # 옵션 β — Spring Boot dataSource 빈을 'biz' alias
 *   tx:
 *     managers:                            # 옵션 δ — 표준 3개 (txBiz/txCmn/txIF) 명시 의무
 *       txBiz: { data-source: biz }        # 자체 DB
 *       txCmn: { data-source: cmn }        # 공통 DB (모듈이 cmn 안 쓰면 biz 로 매핑)
 *       txIF:  { data-source: if }         # 인터페이스 송수신 DB (모듈이 if 안 쓰면 biz)
 *     default-manager: txBiz               # 필수 — yml `default` 는 Java 예약어라 매핑 불가, `default-manager` 사용
 * </pre>
 *
 * <p>옵션 δ — dmes 표준 DS 패턴 (1.0.21+): biz / cmn / if. 모든 cactus 사용 모듈은
 * cactus.tx.managers 에 표준 3개 (txBiz/txCmn/txIF) 명시 의무 (CactusTxConfigValidator fail-fast).
 * DS 매핑은 자유 — 사용 안 하는 TxMgr 는 biz alias 로 매핑하여 yml 에 의도 명시.
 *
 * <p>JPA Repository 만 사용하고 OASIS 안 호출 안 되는 DS 는 cactus.tx.managers 에 등록 안 함
 * (cactus.datasource.extras + cactus.jpa.extras 까지만).
 */
@ConfigurationProperties(prefix = "cactus.tx")
public class CactusTxProperties {

    /** Tier 1 화이트리스트 — yml key 가 곧 Spring 빈 alias + BPMN 안 tx="..." 의 value */
    private Map<String, TxMgrConfig> managers = new LinkedHashMap<>();

    /**
     * 필수. Tier 2 미명시 시 DefaultTxInjectingServiceProvider 가 inject 할 TxMgr 이름.
     * managers 의 key 중 하나여야 함 (CactusTxConfigValidator 가 fail-fast 검증).
     *
     * <p>yml 키는 {@code default-manager} 사용 의무 — yml `default` 는 Java 예약어로 setter
     * 명을 {@code setDefault} 로 만들 수 없어 Spring Boot binding 실패 (Phase 6 검증 발견,
     * 2026-05-15). relaxed binding 은 kebab-case ↔ camelCase 변환만 처리, 임의 alias 매핑 안 함.
     */
    private String defaultManager;

    public Map<String, TxMgrConfig> getManagers() { return managers; }
    public void setManagers(Map<String, TxMgrConfig> managers) { this.managers = managers; }

    public String getDefaultManager() { return defaultManager; }
    public void setDefaultManager(String defaultManager) { this.defaultManager = defaultManager; }

    public static class TxMgrConfig {
        /**
         * 매핑할 DataSource 이름 (옵션 β).
         * <ul>
         *   <li>cactus.datasource.primary-alias 의 값 (예: "biz") → Spring Boot 의 dataSource 빈</li>
         *   <li>그 외 → cactus.datasource.extras.{name} 의 entry 이름</li>
         * </ul>
         *
         * <p>옵션 δ — 모듈이 cmn/if 사용 안 하면 같은 값 (예: "biz") 으로 매핑하여 alias 통합.
         */
        private String dataSource;

        public String getDataSource() { return dataSource; }
        public void setDataSource(String dataSource) { this.dataSource = dataSource; }
    }
}
