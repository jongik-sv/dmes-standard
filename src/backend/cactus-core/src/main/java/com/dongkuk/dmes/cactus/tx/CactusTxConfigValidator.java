package com.dongkuk.dmes.cactus.tx;

import com.dongkuk.dmes.cactus.datasource.CactusDataSourceProperties;
import com.dongkuk.dmes.cactus.oasis.OasisProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationContext;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

/**
 * cactus.tx.* 설정의 부팅 시 fail-fast 검증 (1.0.21-SNAPSHOT 신규).
 *
 * <p>시점: {@link ContextRefreshedEvent} (web server start 전, 빈 그래프 완성 직후).
 *
 * <p>1.0.21 호환성: {@code cactus.tx.managers} 가 비어있고 {@code cactus.oasis.transactional=true}
 * 인 경우 warn 로그만 출력 (legacy mode). 1.0.22 부터 fail-fast 강제.
 *
 * <p>검증 항목:
 * <ul>
 *   <li>1: transactional=true 인데 managers 비어있음 — 1.0.21 warn, 1.0.22 fail</li>
 *   <li>1-bis (옵션 δ): 표준 3개 (txBiz/txCmn/txIF) 누락</li>
 *   <li>1-ter (R-multi-25): 같은 DS 에 여러 alias 매핑 시 warn</li>
 *   <li>1-quater (R-multi-28): extras key 가 reserved/primary-alias/cactus prefix 와 충돌</li>
 *   <li>2: default 가 managers 에 없음</li>
 *   <li>3: 각 manager 의 data-source 가 primary-alias 또는 extras 에 정의됨</li>
 *   <li>3-bis: primary-alias 명시 시 Spring Boot 의 dataSource 빈 존재</li>
 *   <li>4: alias 의 대상 빈이 ApplicationContext 에 존재</li>
 * </ul>
 */
@Component
public class CactusTxConfigValidator {

    private static final Logger log = LoggerFactory.getLogger(CactusTxConfigValidator.class);

    private static final Set<String> STANDARD_TX_NAMES = Set.of("txBiz", "txCmn", "txIF");
    private static final Set<String> RESERVED_BEAN_NAMES = Set.of(
            "dataSource", "transactionManager", "entityManagerFactory",
            "sqlSessionFactory", "sqlSessionTemplate"
    );

    private final CactusTxProperties txProps;
    private final OasisProperties oasisProps;
    private final CactusDataSourceProperties dsProps;
    private final ApplicationContext appContext;

    public CactusTxConfigValidator(CactusTxProperties txProps,
                                   OasisProperties oasisProps,
                                   CactusDataSourceProperties dsProps,
                                   ApplicationContext appContext) {
        this.txProps = txProps;
        this.oasisProps = oasisProps;
        this.dsProps = dsProps;
        this.appContext = appContext;
    }

    @EventListener(ContextRefreshedEvent.class)
    public void validate() {
        // 검증 1-quater (R-multi-28): extras key 충돌 — managers 유무와 무관, 항상 검증
        validateExtrasKeyConflicts();

        if (txProps.getManagers().isEmpty()) {
            if (oasisProps.isTransactional()) {
                log.warn("[Cactus Tx] cactus.oasis.transactional=true 인데 cactus.tx.managers 미정의 — " +
                        "1.0.20 호환 모드. 1.0.22 부터 fail. cactus.tx.managers 마이그레이션 권장.");
            }
            return;
        }

        // 검증 1-bis (옵션 δ): 표준 3개 모두 명시
        if (oasisProps.isTransactional()) {
            Set<String> missing = new TreeSet<>(STANDARD_TX_NAMES);
            missing.removeAll(txProps.getManagers().keySet());
            if (!missing.isEmpty()) {
                throw new IllegalStateException(String.format(
                        "cactus.tx.managers 에 표준 3개 중 누락: %s. " +
                                "cactus 사용 모듈은 biz/cmn/if 3개 모두 명시 의무. " +
                                "모듈이 사용 안 하면 data-source 를 biz alias 로 매핑하여 명시. " +
                                "예: txCmn: { data-source: biz }",
                        missing));
            }
        }

        // 검증 1-ter (R-multi-25): 같은 DS 매핑 시 warn
        Map<String, List<String>> dsToAliases = txProps.getManagers().entrySet().stream()
                .collect(Collectors.groupingBy(
                        e -> e.getValue().getDataSource(),
                        Collectors.mapping(Map.Entry::getKey, Collectors.toList())));
        dsToAliases.forEach((ds, aliases) -> {
            if (aliases.size() > 1) {
                log.warn("[Cactus Tx] 같은 DS '{}' 에 여러 alias 매핑: {}. " +
                                "BPMN 의 commitTx 비대칭 commit/rollback 의도는 같은 트랜잭션이라 깨질 수 있음 (R-multi-25). " +
                                "다른 DS 로 분리 또는 비대칭 정책 사용 금지.",
                        ds, aliases);
            }
        });

        // 검증 2: default 가 managers 에 있음
        String def = txProps.getDefaultManager();
        if (def == null || def.isBlank()) {
            throw new IllegalStateException(
                    "cactus.tx.default 키 필수. cactus.tx.managers 의 key 중 하나로 명시. " +
                            "사용 가능: " + txProps.getManagers().keySet());
        }
        if (!txProps.getManagers().containsKey(def)) {
            throw new IllegalStateException(String.format(
                    "cactus.tx.default='%s' 이 cactus.tx.managers 에 없습니다. 사용 가능: %s",
                    def, txProps.getManagers().keySet()));
        }

        // 검증 3: 각 manager 의 data-source 가 primary-alias 또는 extras 에 있음
        String primaryAlias = dsProps.getPrimaryAlias();
        for (Map.Entry<String, CactusTxProperties.TxMgrConfig> e : txProps.getManagers().entrySet()) {
            String name = e.getKey();
            String ds = e.getValue().getDataSource();
            if (ds == null || ds.isBlank()) {
                throw new IllegalStateException(String.format(
                        "cactus.tx.managers.%s.data-source 키 필수.", name));
            }
            boolean isPrimary = primaryAlias != null && primaryAlias.equals(ds);
            boolean isExtra = dsProps.getExtras().containsKey(ds);
            if (!isPrimary && !isExtra) {
                String available = (primaryAlias != null ? primaryAlias + ", " : "")
                        + String.join(", ", dsProps.getExtras().keySet());
                throw new IllegalStateException(String.format(
                        "TxMgr '%s' 의 data-source='%s' 가 cactus.datasource.primary-alias 또는 extras 에 정의 안 됨. " +
                                "사용 가능: [%s]",
                        name, ds, available));
            }
        }

        // 검증 3-bis (옵션 β): primary-alias 명시 시 Spring Boot 의 dataSource 빈 존재
        if (primaryAlias != null && !primaryAlias.isBlank()) {
            if (!appContext.containsBean("dataSource")) {
                throw new IllegalStateException(String.format(
                        "cactus.datasource.primary-alias='%s' 명시했지만 Spring Boot 의 dataSource 빈이 " +
                                "ApplicationContext 에 없음. spring.datasource.* 정의 확인.", primaryAlias));
            }
        }

        // 검증 4: alias 의 대상 빈이 ApplicationContext 에 존재
        for (String aliasName : txProps.getManagers().keySet()) {
            if (!appContext.containsBean(aliasName)) {
                throw new IllegalStateException(String.format(
                        "TxMgr alias '%s' 의 대상 빈이 ApplicationContext 에 없음. " +
                                "CactusMultiTransactionManagerAutoConfiguration 의 alias 등록 실패 가능.",
                        aliasName));
            }
        }

        log.info("[Cactus Tx] config validated — managers={}, default={}, primary-alias={}",
                txProps.getManagers().keySet(), def, primaryAlias);
    }

    private void validateExtrasKeyConflicts() {
        String primaryAlias = dsProps.getPrimaryAlias();
        for (String extrasKey : dsProps.getExtras().keySet()) {
            List<String> conflicts = new ArrayList<>();
            if (primaryAlias != null && primaryAlias.equals(extrasKey)) {
                conflicts.add("cactus.datasource.primary-alias");
            }
            if (RESERVED_BEAN_NAMES.contains(extrasKey)) conflicts.add("Spring Boot 표준 빈 이름");
            if (extrasKey.startsWith("cactus")) conflicts.add("cactus 자체 빈 prefix");
            if (!conflicts.isEmpty()) {
                throw new IllegalStateException(String.format(
                        "cactus.datasource.extras.%s 의 key '%s' 가 다음과 충돌: %s. " +
                                "alias 등록이 silent overwrite 또는 IllegalStateException 가능. " +
                                "다른 이름 사용.",
                        extrasKey, extrasKey, conflicts));
            }
        }
    }
}
