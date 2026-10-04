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
 * <p>Race condition (R-multi-21): 이 주입기는 캐시 <em>안쪽</em>에 둔다 — 조립 순서
 * {@code CactusCachingServiceProvider( DefaultTxInjecting( SimpleServiceProvider ) )}. 그래서
 * <ul>
 *   <li>cache hit 은 이 주입기를 거치지 않는다 → 이미 공유된 인스턴스를 mutate 하지 않는다.</li>
 *   <li>miss 는 {@link CactusCachingServiceProvider} 가 키별 한 번으로 묶고, 묶이지 않는 경우(로드 실패 뒤 재시도·
 *       evict 직후 등)에도 delegate 가 매번 새로 파싱한 새 Process 인스턴스에만 add 한다 → 두 스레드가 같은
 *       {@link PropertyContainer} 를 고치는 일이 없다.</li>
 * </ul>
 * 이 주입기를 캐시 <em>바깥</em>에 두면 hit 마다 공유 인스턴스를 검사·수정하게 되어 경합이 생기므로 순서를 바꾸지 않는다.
 * 고정 테스트: {@code DefaultTxInjectingServiceProviderCharacterizationTest}.
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
