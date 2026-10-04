package com.dongkuk.dmes.cactus.oasis.aop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.util.ArrayList;
import java.util.List;
import org.aopalliance.intercept.MethodInterceptor;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@link OasisAopAnnotationChecker} — BPMN 이 부르는 빈만 검사하고, warn/fail/off 에 따라 동작하며,
 * 기동 시 BPMN 목록이 없는 HTTP 로더 모드에서는 검사할 수 없다는 안내만 남긴다.
 *
 * <p>테스트 BPMN 은 {@code src/test/resources/aopcheck-services/**} 에 있다.
 */
class OasisAopAnnotationCheckerTest {

    private static final String SERVICE_PATH = "/aopcheck-services";

    @Retention(RetentionPolicy.RUNTIME)
    @Target({ElementType.TYPE, ElementType.METHOD})
    @Transactional
    public @interface BpmnTx {
    }

    /** BPMN 이 빈 이름으로 부른다 — 클래스 레벨 위반 */
    @Transactional
    public static class ClassTxService {
        public void search() {
        }
    }

    /** BPMN 이 클래스 이름으로 부른다 — 메서드 레벨 위반 */
    public static class MethodCacheService {
        @Cacheable("codes")
        public String find() {
            return "x";
        }
    }

    /** BPMN 이 빈 이름으로 부른다 — 메타 어노테이션 위반 */
    public static class MetaTxService {
        @BpmnTx
        public void run() {
        }
    }

    /** BPMN 이 부르지만 어노테이션이 없다 */
    public static class CleanService {
        public void run() {
        }
    }

    /** BPMN 이 부르지 않는 일반 빈 — 컨트롤러 경유라 프록시가 정상 동작하므로 검사 대상이 아니다 */
    @Transactional
    public static class PlainTxService {
        public void create() {
        }
    }

    private ListAppender<ILoggingEvent> appender;
    private Logger checkerLogger;

    @BeforeEach
    void attachAppender() {
        checkerLogger = (Logger) LoggerFactory.getLogger(OasisAopAnnotationChecker.class);
        appender = new ListAppender<>();
        appender.start();
        checkerLogger.addAppender(appender);
    }

    @AfterEach
    void detachAppender() {
        checkerLogger.detachAppender(appender);
    }

    private static Object cglibProxy(Object target) {
        ProxyFactory pf = new ProxyFactory(target);
        pf.setProxyTargetClass(true);
        pf.addAdvice((MethodInterceptor) inv -> inv.proceed());
        return pf.getProxy();
    }

    /**
     * 테스트 빈과 검사기를 등록한 컨텍스트 (refresh 전). {@code classTxService} 는 실제 운영처럼
     * CGLIB 프록시로 등록해 원본 클래스 기준으로 검사하는지도 함께 본다.
     */
    private static GenericApplicationContext context(OasisAopCheckMode mode, boolean classpathLoader,
                                                     boolean transactional) {
        return context(mode, classpathLoader, transactional, SERVICE_PATH);
    }

    private static GenericApplicationContext context(OasisAopCheckMode mode, boolean classpathLoader,
                                                     boolean transactional, String servicePath) {
        GenericApplicationContext ctx = new GenericApplicationContext();
        ctx.getBeanFactory().registerSingleton("classTxService", cglibProxy(new ClassTxService()));
        ctx.registerBean("methodCacheService", MethodCacheService.class);
        ctx.registerBean("metaTxService", MetaTxService.class);
        ctx.registerBean("cleanService", CleanService.class);
        ctx.registerBean("plainTxService", PlainTxService.class);
        ctx.registerBean(OasisAopAnnotationChecker.class,
                () -> new OasisAopAnnotationChecker(ctx, mode, servicePath, classpathLoader, transactional));
        return ctx;
    }

    private List<String> logs(Level level) {
        List<String> out = new ArrayList<>();
        for (ILoggingEvent e : appender.list) {
            if (e.getLevel() == level) {
                out.add(e.getFormattedMessage());
            }
        }
        return out;
    }

    @Test
    void warn_모드는_BPMN_이_부르는_빈의_위반만_경고하고_기동은_계속한다() {
        try (GenericApplicationContext ctx = context(OasisAopCheckMode.WARN, true, false)) {
            ctx.refresh();

            List<String> warnings = logs(Level.WARN);
            assertThat(warnings).hasSize(3);
            assertThat(warnings).anySatisfy(w -> assertThat(w)
                    .contains("빈 'classTxService'")
                    .contains(ClassTxService.class.getName())
                    .contains("@Transactional(클래스)")
                    .contains("오류 없이 무시")
                    .contains("aopCheckSample.bpmn").contains("aopCheckNested.bpmn")
                    .contains("대안").contains("트랜잭션 매니저"));
            assertThat(warnings).anySatisfy(w -> assertThat(w)
                    .contains("빈 'methodCacheService'")
                    .contains("@Cacheable(메서드 find)")
                    .contains("캐시: "));
            assertThat(warnings).anySatisfy(w -> assertThat(w)
                    .contains("빈 'metaTxService'")
                    .contains("@Transactional(메서드 run)"));
            assertThat(warnings).noneSatisfy(w -> assertThat(w).contains("plainTxService"));
            assertThat(warnings).noneSatisfy(w -> assertThat(w).contains("cleanService"));
            assertThat(logs(Level.INFO)).anySatisfy(i -> assertThat(i)
                    .contains("BPMN 2개").contains("참조 빈 4개").contains("위반 3건"));
        }
    }

    @Test
    void 트랜잭션_모드의_경고는_프록시_호출_실패를_알린다() {
        try (GenericApplicationContext ctx = context(OasisAopCheckMode.WARN, true, true)) {
            ctx.refresh();

            assertThat(logs(Level.WARN)).hasSize(3).allSatisfy(w -> assertThat(w)
                    .contains("ParameterName must not be null")
                    .doesNotContain("오류 없이 무시"));
        }
    }

    @Test
    void 검사는_위반을_빈_이름별로_한_번씩만_모은다() {
        try (GenericApplicationContext ctx = context(OasisAopCheckMode.OFF, true, false)) {
            ctx.refresh();
            OasisAopAnnotationChecker checker = ctx.getBean(OasisAopAnnotationChecker.class);

            assertThat(checker.check()).extracting(OasisAopAnnotationChecker.Violation::beanName)
                    .containsExactlyInAnyOrder("classTxService", "methodCacheService", "metaTxService");
        }
    }

    /**
     * 같은 빈을 한 BPMN 은 빈 이름으로, 다른 BPMN 은 클래스 이름으로 불러도 위반은 빈별 1건이고,
     * 경고의 '부르는 BPMN' 에는 두 파일이 모두 들어간다 (테스트 BPMN 은 {@code src/test/resources/aopcheck-mixed}).
     */
    @Test
    void 빈_이름과_클래스_이름으로_나눠_부르는_BPMN_을_한_위반에_모두_모은다() {
        try (GenericApplicationContext ctx = context(OasisAopCheckMode.OFF, true, false, "/aopcheck-mixed")) {
            ctx.refresh();
            OasisAopAnnotationChecker checker = ctx.getBean(OasisAopAnnotationChecker.class);

            List<OasisAopAnnotationChecker.Violation> violations = checker.check();

            assertThat(violations).singleElement().satisfies(v -> {
                assertThat(v.beanName()).isEqualTo("classTxService");
                assertThat(v.bpmnFiles()).containsExactly("mixedByClass.bpmn", "mixedByName.bpmn");
                assertThat(v.message(false)).contains("부르는 BPMN: [mixedByClass.bpmn, mixedByName.bpmn]");
            });
            assertThat(logs(Level.INFO)).anySatisfy(i -> assertThat(i)
                    .contains("BPMN 2개").contains("참조 빈 1개").contains("위반 1건"));
        }
    }

    @Test
    void fail_모드는_위반이_있으면_기동을_멈춘다() {
        GenericApplicationContext ctx = context(OasisAopCheckMode.FAIL, true, false);

        assertThatThrownBy(ctx::refresh).satisfies(e -> assertThat(NestedExceptionUtils.getMostSpecificCause(e))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("cactus.oasis.aop-check=fail")
                .hasMessageContaining("classTxService")
                .hasMessageContaining("methodCacheService")
                .hasMessageContaining("metaTxService")
                .message().doesNotContain("plainTxService"));
        ctx.close();
    }

    @Test
    void off_모드는_검사하지_않는다() {
        try (GenericApplicationContext ctx = context(OasisAopCheckMode.OFF, true, false)) {
            ctx.refresh();

            assertThat(appender.list).isEmpty();
        }
    }

    @Test
    void HTTP_로더_모드는_fail_이어도_기동을_멈추지_않고_검사할_수_없다고_한_번_안내한다() {
        try (GenericApplicationContext ctx = context(OasisAopCheckMode.FAIL, false, true)) {
            ctx.refresh();

            assertThat(logs(Level.WARN)).singleElement().asString()
                    .contains("HTTP 로더 모드")
                    .contains("검사하지 않는다")
                    .contains("mode=fail");
            assertThat(logs(Level.INFO)).isEmpty();
        }
    }

    @Test
    void BPMN_스캔은_camunda_class_의_샵_앞부분만_모으고_하위_폴더도_읽는다() {
        BpmnServiceClassScanner.Scan scan =
                new BpmnServiceClassScanner(getClass().getClassLoader()).scan(SERVICE_PATH);

        assertThat(scan.bpmnCount()).isEqualTo(2);
        assertThat(scan.refs().keySet()).containsExactlyInAnyOrder(
                "classTxService", "cleanService", "noSuchService", "metaTxService",
                MethodCacheService.class.getName());
        assertThat(scan.refs().get("classTxService"))
                .containsExactlyInAnyOrder("aopCheckSample.bpmn", "aopCheckNested.bpmn");
        assertThat(BpmnServiceClassScanner.pattern("/services/")).isEqualTo("classpath*:services/**/*.bpmn");
        assertThat(BpmnServiceClassScanner.pattern("classpath:services")).isEqualTo("classpath*:services/**/*.bpmn");
    }
}
