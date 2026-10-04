package com.dongkuk.dmes.cactus.oasis.provider;

import static com.dongkuk.dmes.cactus.oasis.provider.FakeServices.txOf;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.oasis.provider.FakeServices.CountingProvider;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.PropertyNames;
import com.dongkuk.oasis.model.Service;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

/**
 * {@link DefaultTxInjectingServiceProvider} 특성 테스트(리팩토링 항목 5a).
 *
 * <p>기본 TxMgr 주입 조건과, 운영 조립 {@code Caching(DefaultTxInjecting(매번 새로 파싱하는 프로바이더))} 에서
 * R-multi-21 경합(두 스레드가 같은 PropertyContainer 에 tx 를 넣어 "[tx] is a duplicate attribute")이 생기지 않는
 * 근거를 고정한다.
 */
class DefaultTxInjectingServiceProviderCharacterizationTest {

    private static final String TX = PropertyNames.TRANSACTION_MANAGER_NAME;

    @Test
    void tx_속성이_없으면_기본_TxMgr_를_넣고_delegate_가_준_같은_인스턴스를_준다() {
        Service loaded = FakeServices.newService("a");
        DefaultTxInjectingServiceProvider provider =
                new DefaultTxInjectingServiceProvider(id -> loaded, "mainTx");

        Service svc = provider.service("a");

        assertThat(svc).isSameAs(loaded);
        assertThat(txOf(svc)).isEqualTo("mainTx");
    }

    @Test
    void tx_속성이_이미_있으면_건드리지_않는다() {
        PropertyContainer pc = new PropertyContainer().add(new Property(TX, "subTx"));
        Service loaded = FakeServices.newService("a", pc);
        DefaultTxInjectingServiceProvider provider =
                new DefaultTxInjectingServiceProvider(id -> loaded, "mainTx");

        assertThat(txOf(provider.service("a"))).isEqualTo("subTx");
    }

    @Test
    void 다른_속성만_있으면_tx_를_넣고_다른_속성은_그대로_둔다() {
        PropertyContainer pc = new PropertyContainer().add(new Property("commitTx", "logTx"));
        Service loaded = FakeServices.newService("a", pc);
        DefaultTxInjectingServiceProvider provider =
                new DefaultTxInjectingServiceProvider(id -> loaded, "mainTx");

        Service svc = provider.service("a");

        assertThat(txOf(svc)).isEqualTo("mainTx");
        assertThat(svc.getInitialProcess().properties().getValue("commitTx")).isEqualTo("logTx");
    }

    @Test
    void 자체_캐시는_없어서_호출마다_delegate_를_부른다() {
        CountingProvider delegate = new CountingProvider();
        DefaultTxInjectingServiceProvider provider = new DefaultTxInjectingServiceProvider(delegate, "mainTx");

        Service first = provider.service("a");
        Service second = provider.service("a");

        assertThat(delegate.count("a")).isEqualTo(2);
        assertThat(second).isNotSameAs(first);
        assertThat(txOf(first)).isEqualTo("mainTx");
        assertThat(txOf(second)).isEqualTo("mainTx");
    }

    @Test
    void 같은_인스턴스를_다시_받아도_hasProperty_가드로_중복_추가_예외가_나지_않는다() {
        // R-multi-19: PropertyContainer.add 는 같은 이름이면 IllegalStateException — 가드가 필요한 까닭.
        PropertyContainer raw = new PropertyContainer().add(new Property(TX, "x"));
        assertThatThrownBy(() -> raw.add(new Property(TX, "y")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("[tx] is a duplicate attribute");

        Service shared = FakeServices.newService("a");
        DefaultTxInjectingServiceProvider provider =
                new DefaultTxInjectingServiceProvider(id -> shared, "mainTx");

        provider.service("a");
        provider.service("a");

        assertThat(txOf(shared)).isEqualTo("mainTx");
    }

    @Test
    void 생성자는_null_delegate_와_비어있는_기본_TxMgr_를_거절한다() {
        assertThatThrownBy(() -> new DefaultTxInjectingServiceProvider(null, "mainTx"))
                .isInstanceOf(NullPointerException.class)
                .hasMessage("delegate ServiceProvider null");
        assertThatThrownBy(() -> new DefaultTxInjectingServiceProvider(new CountingProvider(), null))
                .isInstanceOf(NullPointerException.class)
                .hasMessage("defaultTxMgr null/blank");
        assertThatThrownBy(() -> new DefaultTxInjectingServiceProvider(new CountingProvider(), "  "))
                .isInstanceOf(NullPointerException.class)
                .hasMessage("defaultTxMgr null/blank");
    }

    @Test
    void 운영_조립에서_캐시_적중은_주입기를_거치지_않아_캐시된_인스턴스를_다시_고치지_않는다() {
        // OasisAutoConfiguration 조립 순서: Caching( DefaultTxInjecting( SimpleServiceProvider ) )
        CountingProvider parser = new CountingProvider();
        CountingInjector injector = new CountingInjector(parser);
        CactusCachingServiceProvider provider = new CactusCachingServiceProvider(injector, 100);

        Service first = provider.service("a");
        Service again = provider.service("a");

        assertThat(again).isSameAs(first);
        assertThat(injector.calls).isEqualTo(1);
        assertThat(parser.count("a")).isEqualTo(1);
        assertThat(txOf(first)).isEqualTo("mainTx");
    }

    @Test
    void 운영_조립에서_같은_키를_동시에_처음_불러도_중복_tx_예외가_없고_모두_tx_가_한_번_들어간_서비스를_받는다()
            throws Exception {
        int threads = 8;
        CountingProvider parser = new CountingProvider() {
            @Override
            void beforeReturn(String serviceId) {
                CactusCachingServiceProviderCharacterizationTest.sleepQuietly(10);
            }
        };
        CactusCachingServiceProvider provider = new CactusCachingServiceProvider(
                new DefaultTxInjectingServiceProvider(parser, "mainTx"), 100);

        CountDownLatch ready = new CountDownLatch(threads);
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            List<Future<Service>> futures = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    go.await(5, TimeUnit.SECONDS);
                    return provider.service("a");
                }));
            }
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            for (Future<Service> f : futures) {
                Service svc = f.get(10, TimeUnit.SECONDS);
                assertThat(svc.getServiceId()).isEqualTo("a");
                assertThat(svc.getInitialProcess().properties().exportProperties())
                        .containsEntry(TX, "mainTx")
                        .hasSize(1);
            }
        } finally {
            pool.shutdownNow();
            assertThat(pool.awaitTermination(10, TimeUnit.SECONDS)).isTrue();
        }
    }

    /** 주입기 호출 횟수를 세는 래퍼. */
    private static final class CountingInjector extends DefaultTxInjectingServiceProvider {
        private int calls;

        CountingInjector(CountingProvider delegate) {
            super(delegate, "mainTx");
        }

        @Override
        public synchronized Service service(String serviceId) {
            calls++;
            return super.service(serviceId);
        }
    }
}
