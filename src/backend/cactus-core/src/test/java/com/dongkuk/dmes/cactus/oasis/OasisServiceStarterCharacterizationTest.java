package com.dongkuk.dmes.cactus.oasis;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.util.ReflectionTestUtils.getField;

import com.dongkuk.dmes.cactus.oasis.provider.CactusCachingServiceProvider;
import com.dongkuk.dmes.cactus.oasis.provider.DefaultTxInjectingServiceProvider;
import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
import com.dongkuk.oasis.NonModifyClassNameResolver;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.SpringApplicationContext;
import com.dongkuk.oasis.executors.CoreElementExecutor;
import com.dongkuk.oasis.executors.CoreExecutorResolver;
import com.dongkuk.oasis.executors.StopWatchElementExecutor;
import com.dongkuk.oasis.exceptions.UserException;
import com.dongkuk.oasis.process.CoreProcessStarter;
import com.dongkuk.oasis.process.StopWatchProcessStarter;
import com.dongkuk.oasis.provider.SimpleServiceProvider;
import com.dongkuk.oasis.service.CoreServiceStarter;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.service.SpringServiceStarter;
import com.dongkuk.oasis.service.StopWatchServiceStarter;
import com.dongkuk.oasis.transaction.SpringTransactionHandler;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;

/**
 * {@link OasisAutoConfiguration#serviceStarter} 의 transactional 분기가 만드는 ServiceStarter 특성 테스트
 * (refactor/framework-tx 3a, 2026-10-04).
 *
 * <p>oasis {@code SpringServiceStarterFactory} 로 만들던 객체 그래프를 cactus 쪽에서 직접 조립해도
 * 래퍼 순서·provider·트랜잭션 매니저 이름·기본값(클래스 이름 결정자, 스레드 10, 타임아웃 50초)과
 * 실제 BPMN 실행 결과(성공 커밋, 업무 예외·일반 예외 롤백)가 바뀌지 않음을 고정한다.
 * 조립 방식과 무관하게 빈 메서드만 거쳐 검증하므로 변경 전 코드로도 통과해야 한다.
 *
 * <p>BPMN 은 {@code cactus-starter-char/} 아래 charOk·charUserError·charSystemError 3개 — 다른 jar 의 {@code /services} 와
 * 섞이지 않게 별도 경로를 쓴다. 같은 폴더의 charBusinessErrors 는 {@link CactusResponseConverterBusinessErrorsTest} 몫이다.
 * 트랜잭션 매니저는 DB 없이 begin·commit·rollback 만 기록하는 가짜다.
 */
@Execution(ExecutionMode.SAME_THREAD)
class OasisServiceStarterCharacterizationTest {

    private static final String SERVICE_PATH = "/cactus-starter-char";

    private final List<GenericApplicationContext> contexts = new ArrayList<>();

    @AfterEach
    void closeContexts() {
        contexts.forEach(GenericApplicationContext::close);
    }

    // ── 객체 그래프 ──────────────────────────────────────────────

    @Test
    void multi_tx_모드_그래프는_StopWatch_Spring_Core_순서이고_provider_와_tm_이름을_그대로_넘긴다() {
        GenericApplicationContext ctx = context(new RecordingTxManager(), new RecordingTxManager());
        ServiceStarter starter = new OasisAutoConfiguration().serviceStarter(props(), multiTx(), ctx);

        CoreServiceStarter core = assertWrapperChain(starter, ctx);

        CactusCachingServiceProvider caching =
                (CactusCachingServiceProvider) getField(core, "serviceProvider");
        DefaultTxInjectingServiceProvider injecting =
                (DefaultTxInjectingServiceProvider) getField(caching, "delegate");
        assertThat(getField(injecting, "defaultTxMgr")).isEqualTo("txBiz");
        assertSimpleProvider(getField(injecting, "delegate"));

        SpringTransactionHandler handler = (SpringTransactionHandler) getField(core, "transactionHandler");
        assertThat((String[]) getField(handler, "transactionManagerNames")).containsExactly("txBiz", "txCmn");
        assertThat(getField(getField(handler, "applicationContext"), "ac")).isSameAs(ctx);

        assertProcessStarterChain(core);
    }

    @Test
    @SuppressWarnings("deprecation") // legacy 모드 설정(transaction-manager-name)을 일부러 쓴다
    void legacy_모드_그래프는_단일_tm_이름과_tx_주입_없는_provider_를_쓴다() {
        GenericApplicationContext ctx = context(new RecordingTxManager(), new RecordingTxManager());
        OasisProperties props = props();
        props.setTransactionManagerName("txBiz");
        ServiceStarter starter = new OasisAutoConfiguration().serviceStarter(props, new CactusTxProperties(), ctx);

        CoreServiceStarter core = assertWrapperChain(starter, ctx);

        CactusCachingServiceProvider caching =
                (CactusCachingServiceProvider) getField(core, "serviceProvider");
        assertSimpleProvider(getField(caching, "delegate"));

        SpringTransactionHandler handler = (SpringTransactionHandler) getField(core, "transactionHandler");
        assertThat((String[]) getField(handler, "transactionManagerNames")).containsExactly("txBiz");
        assertThat(getField(getField(handler, "applicationContext"), "ac")).isSameAs(ctx);

        assertProcessStarterChain(core);
    }

    // ── BPMN 실행 ───────────────────────────────────────────────

    @Test
    void 성공하면_기본_tm_하나만_시작해_커밋한다() {
        RecordingTxManager biz = new RecordingTxManager();
        RecordingTxManager cmn = new RecordingTxManager();
        GenericApplicationContext ctx = context(biz, cmn);
        ServiceStarter starter = new OasisAutoConfiguration().serviceStarter(props(), multiTx(), ctx);

        DefaultServiceContext sc = serviceContext(ctx);
        ServiceResult result = starter.start("charOk", sc);

        assertThat(result.serviceResultCode()).isEqualTo(ServiceResultCode.SUCCESS);
        assertThat(result.exception()).isNull();
        assertThat(result.path()).isNotEmpty();
        assertThat(biz.events).containsExactly("begin", "commit");
        assertThat(cmn.events).isEmpty();
        // SpringServiceStarter 가 실행 전에 ServiceContext 의 애플리케이션 컨텍스트를 같은 Spring ctx 로 바꿔 넣는다(현재 동작).
        Object appCtx = getField(sc, "applicationContext");
        assertThat(appCtx).isInstanceOf(SpringApplicationContext.class);
        assertThat(getField(appCtx, "ac")).isSameAs(ctx);
    }

    @Test
    void 업무_예외는_USER_ERROR_이고_롤백한다() {
        RecordingTxManager biz = new RecordingTxManager();
        RecordingTxManager cmn = new RecordingTxManager();
        GenericApplicationContext ctx = context(biz, cmn);
        ServiceStarter starter = new OasisAutoConfiguration().serviceStarter(props(), multiTx(), ctx);

        ServiceResult result = starter.start("charUserError", serviceContext(ctx));

        assertThat(result.serviceResultCode()).isEqualTo(ServiceResultCode.USER_ERROR);
        assertThat(result.exception()).isInstanceOf(UserException.class);
        assertThat(result.serviceResultMessage()).isEqualTo("업무 예외");
        assertThat(biz.events).containsExactly("begin", "rollback");
        assertThat(cmn.events).isEmpty();
    }

    @Test
    void 일반_예외는_SYSTEM_ERROR_이고_롤백한다() {
        RecordingTxManager biz = new RecordingTxManager();
        RecordingTxManager cmn = new RecordingTxManager();
        GenericApplicationContext ctx = context(biz, cmn);
        ServiceStarter starter = new OasisAutoConfiguration().serviceStarter(props(), multiTx(), ctx);

        ServiceResult result = starter.start("charSystemError", serviceContext(ctx));

        assertThat(result.serviceResultCode()).isEqualTo(ServiceResultCode.SYSTEM_ERROR);
        assertThat(result.exception()).isNotNull().isNotInstanceOf(UserException.class);
        assertThat(biz.events).containsExactly("begin", "rollback");
        assertThat(cmn.events).isEmpty();
    }

    @Test
    @SuppressWarnings("deprecation") // legacy 모드 설정(transaction-manager-name)을 일부러 쓴다
    void legacy_모드는_설정한_단일_tm_으로_실행한다() {
        RecordingTxManager biz = new RecordingTxManager();
        RecordingTxManager cmn = new RecordingTxManager();
        GenericApplicationContext ctx = context(biz, cmn);
        OasisProperties props = props();
        props.setTransactionManagerName("txCmn");
        ServiceStarter starter = new OasisAutoConfiguration().serviceStarter(props, new CactusTxProperties(), ctx);

        assertThat(starter.start("charOk", serviceContext(ctx)).serviceResultCode())
                .isEqualTo(ServiceResultCode.SUCCESS);
        assertThat(starter.start("charUserError", serviceContext(ctx)).serviceResultCode())
                .isEqualTo(ServiceResultCode.USER_ERROR);

        assertThat(cmn.events).containsExactly("begin", "commit", "begin", "rollback");
        assertThat(biz.events).isEmpty();
    }

    // ── 도우미 ──────────────────────────────────────────────────

    private static CoreServiceStarter assertWrapperChain(ServiceStarter starter, GenericApplicationContext ctx) {
        assertThat(starter).isInstanceOf(StopWatchServiceStarter.class);
        Object spring = getField(starter, "serviceStarter");
        assertThat(spring).isInstanceOf(SpringServiceStarter.class);
        assertThat(getField(spring, "applicationContext")).isSameAs(ctx);
        Object core = getField(spring, "serviceStarter");
        assertThat(core).isInstanceOf(CoreServiceStarter.class);
        return (CoreServiceStarter) core;
    }

    private static void assertSimpleProvider(Object provider) {
        assertThat(provider).isInstanceOf(SimpleServiceProvider.class);
        assertThat(getField(provider, "serviceDocumentDirectory")).isEqualTo(SERVICE_PATH);
        assertThat(getField(provider, "fileExtension")).isEqualTo("bpmn");
        assertThat(getField(provider, "fileDescriptionDelimiter")).isEqualTo("^^");
    }

    private static void assertProcessStarterChain(CoreServiceStarter core) {
        Object stopWatch = getField(core, "processStarter");
        assertThat(stopWatch).isInstanceOf(StopWatchProcessStarter.class);
        Object coreProcess = getField(stopWatch, "processStarter");
        assertThat(coreProcess).isInstanceOf(CoreProcessStarter.class);
        assertThat(getField(coreProcess, "executionLimitCount")).isEqualTo(1000);
        Object stopWatchElement = getField(coreProcess, "elementExecutor");
        assertThat(stopWatchElement).isInstanceOf(StopWatchElementExecutor.class);
        Object coreElement = getField(stopWatchElement, "elementExecutor");
        assertThat(coreElement).isInstanceOf(CoreElementExecutor.class);
        Object resolver = getField(coreElement, "executorResolver");
        assertThat(resolver).isInstanceOf(CoreExecutorResolver.class);
        assertThat(getField(resolver, "classNameResolver")).isInstanceOf(NonModifyClassNameResolver.class);
        assertThat(getField(resolver, "maxThreads")).isEqualTo(10);
        assertThat(getField(resolver, "timeoutSecond")).isEqualTo(50);
        // 하위 프로세스·병렬 실행이 같은 팩토리로 다시 조립되도록 두 팩토리는 한 인스턴스다.
        assertThat(getField(resolver, "processStarterFactory"))
                .isNotNull()
                .isSameAs(getField(resolver, "elementExecutorFactory"));
    }

    private static OasisProperties props() {
        OasisProperties props = new OasisProperties();
        props.setTransactional(true);
        props.setServicePath(SERVICE_PATH);
        return props;
    }

    private static CactusTxProperties multiTx() {
        CactusTxProperties tx = new CactusTxProperties();
        tx.getManagers().put("txBiz", new CactusTxProperties.TxMgrConfig());
        tx.getManagers().put("txCmn", new CactusTxProperties.TxMgrConfig());
        tx.setDefaultManager("txBiz");
        return tx;
    }

    private GenericApplicationContext context(RecordingTxManager biz, RecordingTxManager cmn) {
        GenericApplicationContext ctx = new GenericApplicationContext();
        ctx.registerBean("txBiz", PlatformTransactionManager.class, () -> biz);
        ctx.registerBean("txCmn", PlatformTransactionManager.class, () -> cmn);
        ctx.refresh();
        contexts.add(ctx);
        return ctx;
    }

    /** {@link OasisServiceExecutor} 와 같은 방식으로 ServiceContext 를 만든다. */
    private static DefaultServiceContext serviceContext(GenericApplicationContext ctx) {
        return new DefaultServiceContext(new CactusUnwrappingApplicationContext(ctx), new HashMap<>());
    }

    /** DB 없이 begin·commit·rollback 순서만 기록하는 트랜잭션 매니저. */
    static final class RecordingTxManager extends AbstractPlatformTransactionManager {
        final List<String> events = new ArrayList<>();

        @Override
        protected Object doGetTransaction() {
            return new Object();
        }

        @Override
        protected void doBegin(Object transaction, TransactionDefinition definition) {
            events.add("begin");
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
            events.add("commit");
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            events.add("rollback");
        }
    }
}
