package com.dongkuk.dmes.cactus.oasis;

import com.dongkuk.oasis.NonModifyClassNameResolver;
import com.dongkuk.oasis.factories.ProcessStaterAndElementExecutorFactory;
import com.dongkuk.oasis.provider.ServiceProvider;
import com.dongkuk.oasis.service.CoreServiceStarter;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.service.SpringServiceStarter;
import com.dongkuk.oasis.service.StopWatchServiceStarter;
import com.dongkuk.oasis.transaction.TransactionHandler;
import org.springframework.context.ApplicationContext;

/**
 * transactional 모드의 OASIS {@link ServiceStarter} 를 cactus 에서 직접 조립한다 (refactor/framework-tx 3a, 2026-10-04).
 *
 * <p>oasis {@code SpringServiceStarterFactory.generateServiceStarter()} 와 같은 객체 그래프를 공개 생성자로 만든다.
 * <pre>
 * StopWatchServiceStarter
 *   └ SpringServiceStarter(ctx)
 *       └ CoreServiceStarter(provider, processStarter, transactionHandler)
 * </pre>
 * 달라진 점은 트랜잭션 핸들러를 안에서 만들지 않고 주입받는 것 하나다. 지금은 호출부가 oasis
 * {@code SpringTransactionHandler} 를 그대로 넘긴다.
 *
 * <p>프로세스 실행기 기본값은 oasis {@code SpringServiceStarterFactory} 2인자 생성자와 같다 —
 * 클래스 이름 결정자 {@link NonModifyClassNameResolver}, 병렬 최대 스레드 {@value #MAX_THREADS},
 * 스레드 타임아웃 {@value #TIMEOUT_SECONDS}초.
 *
 * <p>Spring 빈으로 등록하지 않는다 — {@link OasisAutoConfiguration#serviceStarter} 안에서만 쓴다.
 */
public final class CactusServiceStarterFactory {

    /** 병렬 수행 시 최대 스레드 수 — oasis SpringServiceStarterFactory 기본값. */
    static final int MAX_THREADS = 10;

    /** 병렬 수행 시 스레드 타임아웃(초) — oasis SpringServiceStarterFactory 기본값. */
    static final int TIMEOUT_SECONDS = 50;

    private final ApplicationContext applicationContext;
    private final ServiceProvider serviceProvider;
    private final TransactionHandler transactionHandler;

    /**
     * @param applicationContext 스프링 애플리케이션 컨텍스트 — 실행 때 ServiceContext 에 넣는다
     * @param serviceProvider    서비스 프로바이더
     * @param transactionHandler 트랜잭션 핸들러
     */
    public CactusServiceStarterFactory(ApplicationContext applicationContext,
                                       ServiceProvider serviceProvider,
                                       TransactionHandler transactionHandler) {
        if (applicationContext == null)
            throw new IllegalArgumentException("org.springframework.context.ApplicationContext is null.");
        this.applicationContext = applicationContext;
        this.serviceProvider = serviceProvider;
        this.transactionHandler = transactionHandler;
    }

    /** 조립한 ServiceStarter 를 돌려준다. 부를 때마다 새 그래프를 만든다. */
    public ServiceStarter generateServiceStarter() {
        // 하위 프로세스·병렬 실행도 같은 팩토리로 다시 조립되도록 ProcessStarter·ElementExecutor 팩토리를 한 인스턴스로 쓴다.
        ProcessStaterAndElementExecutorFactory processStarterFactory =
                new ProcessStaterAndElementExecutorFactory(new NonModifyClassNameResolver(), MAX_THREADS, TIMEOUT_SECONDS);

        return new StopWatchServiceStarter(
                new SpringServiceStarter(
                        new CoreServiceStarter(
                                serviceProvider,
                                processStarterFactory.generateProcessStarter(),
                                transactionHandler),
                        applicationContext));
    }
}
