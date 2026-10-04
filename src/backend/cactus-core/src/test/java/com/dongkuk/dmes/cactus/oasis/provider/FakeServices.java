package com.dongkuk.dmes.cactus.oasis.provider;

import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.PropertyNames;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.provider.ServiceProvider;

import java.lang.reflect.Proxy;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;

/**
 * 캐시 래퍼 테스트용 가짜 {@link Service}·{@link ServiceProvider}.
 *
 * <p>Mockito 목은 여러 스레드가 동시에 부르면 호출 기록이 흔들릴 수 있어, 동시성 테스트에서도 쓰도록
 * {@link Proxy} 로 만든 최소 {@link Process} 와 직접 구현한 {@link Service} 를 쓴다.
 */
final class FakeServices {

    private FakeServices() {
    }

    /** 처음 프로세스의 {@link PropertyContainer} 만 의미 있는 가짜 서비스. 만들 때마다 새 인스턴스다. */
    static Service newService(String serviceId) {
        return new FakeService(serviceId, new PropertyContainer());
    }

    /** 미리 채운 속성 컨테이너를 쓰는 가짜 서비스. */
    static Service newService(String serviceId, PropertyContainer pc) {
        return new FakeService(serviceId, pc);
    }

    /** 서비스의 처음 프로세스에 들어간 tx 값. */
    static String txOf(Service svc) {
        return svc.getInitialProcess().properties().getValue(PropertyNames.TRANSACTION_MANAGER_NAME);
    }

    /**
     * 호출마다 새 서비스를 만들어 주고 키별 호출 횟수를 센다. {@code SimpleServiceProvider} 처럼 매번 BPMN 을
     * 새로 파싱하는 실제 프로바이더를 흉내 낸다.
     */
    static class CountingProvider implements ServiceProvider {
        private final AtomicInteger total = new AtomicInteger();
        private final Map<String, AtomicInteger> perKey = new ConcurrentHashMap<>();
        private final Function<String, Service> factory;

        CountingProvider() {
            this(FakeServices::newService);
        }

        CountingProvider(Function<String, Service> factory) {
            this.factory = factory;
        }

        @Override
        public Service service(String serviceId) {
            total.incrementAndGet();
            perKey.computeIfAbsent(serviceId, k -> new AtomicInteger()).incrementAndGet();
            beforeReturn(serviceId);
            return factory.apply(serviceId);
        }

        /** 하위 클래스가 로드 도중 멈추게 하는 자리(동시성 테스트용). */
        void beforeReturn(String serviceId) {
        }

        int total() {
            return total.get();
        }

        int count(String serviceId) {
            AtomicInteger c = perKey.get(serviceId);
            return c == null ? 0 : c.get();
        }
    }

    private static final class FakeService implements Service {
        private final String serviceId;
        private final Process process;

        FakeService(String serviceId, PropertyContainer pc) {
            this.serviceId = serviceId;
            this.process = (Process) Proxy.newProxyInstance(
                    Process.class.getClassLoader(),
                    new Class<?>[]{Process.class},
                    (proxy, method, args) -> switch (method.getName()) {
                        case "properties" -> pc;
                        case "getId" -> "process-" + serviceId;
                        case "getName" -> serviceId;
                        case "getProperty" -> pc.get((String) args[0]);
                        case "hashCode" -> System.identityHashCode(proxy);
                        case "equals" -> proxy == args[0];
                        case "toString" -> "FakeProcess(" + serviceId + ")";
                        default -> throw new UnsupportedOperationException(method.getName());
                    });
        }

        @Override
        public String getServiceId() {
            return serviceId;
        }

        @Override
        public String getServiceName() {
            return serviceId;
        }

        @Override
        public Process getInitialProcess() {
            return process;
        }

        @Override
        public Process getProcess(String processId) {
            return process;
        }

        @Override
        public String toString() {
            return "FakeService(" + serviceId + ")@" + Integer.toHexString(System.identityHashCode(this));
        }
    }
}
