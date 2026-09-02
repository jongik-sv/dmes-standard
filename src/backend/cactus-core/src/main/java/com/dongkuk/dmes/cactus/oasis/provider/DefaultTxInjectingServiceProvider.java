package com.dongkuk.dmes.cactus.oasis.provider;

import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.PropertyNames;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.provider.ServiceProvider;

/**
 * BPMN load 시 {@link PropertyContainer} 에 {@code tx=<default>} 자동 inject (1.0.21-SNAPSHOT 신규).
 *
 * <p>oasis-core 5.1.0 의 {@code SpringTransactionHandler.execute()} 가 Tier 2 (process tx) 가 비어있으면
 * Tier 1 의 *모든* TxMgr 일괄 begin (R-multi-11). cactus 1.0.21 은 default 1개만 begin 정책 (옵션 α) —
 * 본 wrapper 가 BPMN load 단계에서 default 1개를 자동 inject 하여 분기 ④ 도달 자체를 막음.
 *
 * <p>Phase 0-B 검증 결과: {@link PropertyContainer#add(Property)} 가 mutate 가능 (Map 기반,
 * 중복 시 IllegalStateException). 따라서 inject 전 {@link PropertyContainer#hasProperty(String)} 가드 필수
 * (R-multi-19).
 *
 * <p>Race condition (R-multi-21): {@link CactusCachingServiceProvider} 가 정상 동작하면 cache hit 시
 * mutate 없음 → 안전. miss 시 각 thread 가 새 Process 인스턴스 받으므로 안전.
 */
public class DefaultTxInjectingServiceProvider implements ServiceProvider {

    private final ServiceProvider delegate;
    private final String defaultTxMgr;

    public DefaultTxInjectingServiceProvider(ServiceProvider delegate, String defaultTxMgr) {
        if (delegate == null) {
            throw new NullPointerException("delegate ServiceProvider null");
        }
        if (defaultTxMgr == null || defaultTxMgr.isBlank()) {
            throw new NullPointerException("defaultTxMgr null/blank");
        }
        this.delegate = delegate;
        this.defaultTxMgr = defaultTxMgr;
    }

    @Override
    public Service service(String serviceId) {
        Service svc = delegate.service(serviceId);
        Process process = svc.getInitialProcess();
        PropertyContainer pc = process.properties();

        if (!pc.hasProperty(PropertyNames.TRANSACTION_MANAGER_NAME)) {
            pc.add(new Property(PropertyNames.TRANSACTION_MANAGER_NAME, defaultTxMgr));
        }
        return svc;
    }
}
