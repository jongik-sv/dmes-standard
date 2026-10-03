package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.sun.net.httpserver.HttpServer;
import java.io.OutputStream;
import java.lang.reflect.Proxy;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import kr.dongkuk.maru.mdm.engine.domain.DomainValidator;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.rule.RuleEngine;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.cache.CacheManager;

/** spec §5.1·§7 「cactus 자동 설정」 — 기본 꺼짐, 켰을 때 빈 구성, 꺼진 상태에서 DefinitionLookup 이 생기지 않음. */
class MdmAutoConfigurationTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(MdmAutoConfiguration.class));

    private static final String[] ON = {
            "cactus.mdm.enabled=true", "cactus.mdm.base-url=http://127.0.0.1:9", "cactus.mdm.connect-timeout=200ms", "cactus.mdm.client-key=k"};

    @Test
    void 기본은_꺼짐이라_빈이_하나도_없다() {
        runner.run(ctx -> {
            assertThat(ctx).doesNotHaveBean(MdmClientProperties.class); // 설정 클래스 자체가 건너뛰어졌다
            assertThat(ctx).doesNotHaveBean(MdmMetaClient.class);
            assertThat(ctx).doesNotHaveBean(MdmMetaService.class);
            assertThat(ctx).doesNotHaveBean(MdmRevisionPoller.class); // 폴러가 없으니 스케줄도 없다
            assertThat(ctx).doesNotHaveBean(MdmMetaController.class);
            assertThat(ctx).doesNotHaveBean(MdmDefinitionLookup.class);
            assertThat(ctx).doesNotHaveBean(DefinitionLookup.class);
            assertThat(ctx).doesNotHaveBean(CodeLookup.class);
        });
        runner.withPropertyValues("cactus.mdm.enabled=false").run(ctx -> {
            assertThat(ctx).doesNotHaveBean(DefinitionLookup.class);
            assertThat(ctx).doesNotHaveBean(CodeLookup.class);
            assertThat(ctx).doesNotHaveBean(MdmRevisionPoller.class);
            assertThat(ctx).doesNotHaveBean(MdmMetaController.class);
        });
    }

    @Test
    void 켜면_구성_요소가_모두_생기고_DefinitionLookup_은_MdmDefinitionLookup_이며_CacheManager_는_없다() {
        runner.withPropertyValues(ON).withPropertyValues("cactus.mdm.module=mls").run(ctx -> {
            assertThat(ctx).hasSingleBean(MdmMetaClient.class).hasSingleBean(MdmMetaCache.class).hasSingleBean(MdmMetaService.class)
                    .hasSingleBean(MdmRevisionPoller.class).hasSingleBean(MdmMetaController.class);
            assertThat(ctx.getBean(DefinitionLookup.class)).isInstanceOf(MdmDefinitionLookup.class);
            assertThat(ctx.getBean(CodeLookup.class)).isInstanceOf(MdmDefinitionLookup.class);
            assertThat(ctx.getBeansOfType(CacheManager.class)).isEmpty();
            assertThat(ctx.getBean(MdmMetaController.class).module()).isEqualTo("mls");
            MdmClientProperties p = ctx.getBean(MdmClientProperties.class);
            assertThat(p.getPollInterval()).isEqualTo(Duration.ofSeconds(10));
            assertThat(p.getMaxEntries()).isEqualTo(20_000);
            assertThat(p.getMaxAge()).as("적재 뒤 절대 상한").isEqualTo(Duration.ofHours(24));
            assertThat(p.getMaxIdle()).as("마지막 조회 뒤 유휴 수명").isEqualTo(Duration.ofMinutes(60));
            MdmMetaCache cache = ctx.getBean(MdmMetaCache.class);
            assertThat(cache.maxAge()).isEqualTo(Duration.ofHours(24));
            assertThat(cache.maxIdle()).isEqualTo(Duration.ofMinutes(60));
            assertThat(p.getReadTimeout()).isEqualTo(Duration.ofSeconds(5));
            assertThat(p.getConnectTimeout()).isEqualTo(Duration.ofMillis(200));
            assertThat(p.getRevisionLookback()).isEqualTo(MdmRevisionPoller.DEFAULT_LOOKBACK);
            // 하위 프로젝트 C §6.3 — 검증기만 빈이다. 캐시 전용 엔진(평가기·도메인 검증기·룰 엔진)은 검증기 안에서 만들고 일반 엔진 타입으로 내놓지 않는다
            // (업무 코드가 RuleEngine·DomainValidator 를 주입받아 캐시 전용 엔진을 얻거나, 모듈이 만든 엔진 빈이 검증기에 끼어들지 않게)
            assertThat(ctx).hasSingleBean(MdmValidator.class).hasSingleBean(DefinitionLookup.class).hasSingleBean(CodeLookup.class);
            assertThat(ctx).doesNotHaveBean(MdmEvaluator.class).doesNotHaveBean(DomainValidator.class).doesNotHaveBean(RuleEngine.class);
            assertThat(p.getValidation().getOnUnavailable()).isEqualTo(MdmValidator.OnUnavailable.REJECT);
            assertThat(ctx.getBean(MdmValidator.class).onUnavailable()).isEqualTo(MdmValidator.OnUnavailable.REJECT);
        });
    }

    @Test
    void validation_on_unavailable_PASS_설정이_검증기에_닿는다() {
        runner.withPropertyValues(ON).withPropertyValues("cactus.mdm.validation.on-unavailable=PASS").run(ctx -> {
            assertThat(ctx.getBean(MdmClientProperties.class).getValidation().getOnUnavailable()).isEqualTo(MdmValidator.OnUnavailable.PASS);
            assertThat(ctx.getBean(MdmValidator.class).onUnavailable()).isEqualTo(MdmValidator.OnUnavailable.PASS);
        });
    }

    @Test
    void 꺼져_있으면_검증기도_엔진_빈도_없다() {
        runner.run(ctx -> {
            assertThat(ctx).doesNotHaveBean(MdmValidator.class);
            assertThat(ctx).doesNotHaveBean(MdmEvaluator.class);
            assertThat(ctx).doesNotHaveBean(DomainValidator.class);
            assertThat(ctx).doesNotHaveBean(RuleEngine.class);
        });
    }

    /**
     * 모듈이 자기 업무 룰용으로 만든 엔진 빈(예: {@code MdmDefinitionLookup} 위의 룰 엔진 — 평가 중 MDM 을 부를 수 있다)이 있어도 검증기에 닿지 않는다.
     * 검증기는 캐시 전용 엔진을 스스로 만든다(평가 중 MDM 호출 금지 C6, 캐시 부재 = 검증 불가 C7). 덫 빈은 불리면 센다.
     */
    @Test
    void 사용자_RuleEngine_DomainValidator_빈은_MdmValidator_에_닿지_않는다() {
        AtomicInteger trapCalls = new AtomicInteger();
        RuleEngine trapRules = trap(RuleEngine.class, trapCalls);
        DomainValidator trapDomains = trap(DomainValidator.class, trapCalls);
        MutableClock clock = new MutableClock(Instant.parse("2026-10-03T00:00:00Z"));
        FakeMetaFeed feed = new FakeMetaFeed();
        feed.put(MdmTargetType.COLUMN, "TITLE", MdmValidatorTest.str("TITLE", "제목", 3, true));
        feed.put(MdmTargetType.RULE_SET, "S1", List.of(MdmValidatorTest.set("S1", "R1")));
        feed.put(MdmTargetType.RULE, "R1", List.of(MdmValidatorTest.contractRule("R1", "TITLE", DataType.STRING)));
        MdmMetaCache cache = new MdmMetaCache(100, Duration.ofMinutes(60), clock);
        cache.clear(0);
        MdmMetaService service = new MdmMetaService(feed, cache, clock);

        runner.withPropertyValues(ON).withBean(MdmMetaService.class, () -> service).withBean(RuleEngine.class, () -> trapRules)
                .withBean(DomainValidator.class, () -> trapDomains).run(ctx -> {
                    assertThat(ctx).hasNotFailed();
                    assertThat(ctx.getBean(RuleEngine.class)).isSameAs(trapRules);
                    assertThat(ctx.getBean(DomainValidator.class)).isSameAs(trapDomains);
                    MdmValidator validator = ctx.getBean(MdmValidator.class);
                    MdmValidationResult r = validator.validate(MdmValidationRequest.rows("g", List.<Map<String, Object>>of(
                            Map.of("TITLE", ""))).columns("TITLE").ruleSet("S1").evalTs(clock.instant()).build());

                    assertThat(trapCalls).as("덫 엔진이 불렸다").hasValue(0);
                    assertThat(r.errors()).containsExactly(new ErrorDetail("g", null, 0, "TITLE", "E001", "제목은(는) 필수입니다"));
                    assertThat(r.unavailable()).isEmpty();
                    assertThat(r.ruleSetResults().get(0)).singleElement().satisfies(s -> assertThat(s.setId()).isEqualTo("S1"));
                    int fetches = feed.fetchCalls.get();
                    validator.validate(MdmValidationRequest.rows("g", List.<Map<String, Object>>of(Map.of("TITLE", "ab"))).columns("TITLE")
                            .ruleSet("S1").evalTs(clock.instant()).build());
                    assertThat(feed.fetchCalls.get()).as("받아 둔 정의만으로 평가했다(평가 중 MDM 호출 없음)").isEqualTo(fetches);
                });
    }

    @SuppressWarnings("unchecked")
    private static <T> T trap(Class<T> type, AtomicInteger calls) {
        return (T) Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, (proxy, method, args) -> {
            if (method.getDeclaringClass() == Object.class) {
                return switch (method.getName()) {
                    case "hashCode" -> System.identityHashCode(proxy);
                    case "equals" -> proxy == args[0];
                    default -> "trap " + type.getSimpleName();
                };
            }
            calls.incrementAndGet();
            throw new IllegalStateException("덫 " + type.getSimpleName() + "." + method.getName() + " 이 불렸다");
        });
    }

    @Test
    void max_idle_과_max_age_설정이_캐시에_닿는다() {
        runner.withPropertyValues(ON).withPropertyValues("cactus.mdm.max-idle=15m", "cactus.mdm.max-age=2h").run(ctx -> {
            assertThat(ctx.getBean(MdmClientProperties.class).getMaxIdle()).isEqualTo(Duration.ofMinutes(15));
            MdmMetaCache cache = ctx.getBean(MdmMetaCache.class);
            assertThat(cache.maxIdle()).isEqualTo(Duration.ofMinutes(15));
            assertThat(cache.maxAge()).isEqualTo(Duration.ofHours(2));
        });
    }

    @Test
    void old_version_max_idle_기본은_10분이고_설정이_캐시에_닿는다() {
        runner.withPropertyValues(ON).run(ctx ->
                assertThat(ctx.getBean(MdmMetaCache.class).oldVersionMaxIdle()).isEqualTo(Duration.ofMinutes(10)));
        runner.withPropertyValues(ON).withPropertyValues("cactus.mdm.old-version-max-idle=3m").run(ctx ->
                assertThat(ctx.getBean(MdmMetaCache.class).oldVersionMaxIdle()).isEqualTo(Duration.ofMinutes(3)));
    }

    @Test
    void system_code_기본은_없고_설정하면_속성에_닿는다() {
        runner.withPropertyValues(ON).run(ctx -> assertThat(ctx.getBean(MdmClientProperties.class).getSystemCode()).isNull());
        runner.withPropertyValues(ON).withPropertyValues("cactus.mdm.system-code=MES")
                .run(ctx -> assertThat(ctx.getBean(MdmClientProperties.class).getSystemCode()).isEqualTo("MES"));
    }

    @Test
    void module_설정이_없으면_service_group_을_쓰고_그것도_없으면_app_이다() {
        runner.withPropertyValues(ON).withPropertyValues("cactus.oasis.service-group=mqc")
                .run(ctx -> assertThat(ctx.getBean(MdmMetaController.class).module()).isEqualTo("mqc"));
        runner.withPropertyValues(ON).run(ctx -> assertThat(ctx.getBean(MdmMetaController.class).module()).isEqualTo("app"));
    }

    /**
     * 되돌아보기 설정이 폴러에 닿는다 — 폴러는 {@code page-limit <= lookback} 이면 생성 때 예외다. page-limit 50 에서 lookback 7 은 기동되고
     * 60 은 기동되지 않는다. 설정을 버리는 6인자 생성자(늘 100)였다면 둘 다 실패하고, 설정이 아예 안 닿았다면(0) 둘 다 성공한다 — 두 결과가 갈리는
     * 것 자체가 설정값이 생성자에 전달된다는 증거라 private 필드를 읽지 않는다.
     */
    @Test
    void revision_lookback_설정이_폴러에_전달된다() {
        runner.withPropertyValues(ON).withPropertyValues("cactus.mdm.revision-lookback=7", "cactus.mdm.page-limit=50").run(ctx -> {
            assertThat(ctx).hasNotFailed();
            assertThat(ctx).hasSingleBean(MdmRevisionPoller.class);
        });
        runner.withPropertyValues(ON).withPropertyValues("cactus.mdm.revision-lookback=60", "cactus.mdm.page-limit=50")
                .run(ctx -> assertThat(ctx).hasFailed());
    }

    @Test
    void MDM_호출에_X_Client_Key_를_싣고_읽기_시간_초과를_지킨다() throws Exception {
        List<String> clientKeys = new CopyOnWriteArrayList<>();
        HttpServer server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        ExecutorService pool = Executors.newCachedThreadPool();
        server.setExecutor(pool);
        server.createContext("/fast/oasis/metaFeed/search", ex -> {
            clientKeys.add(String.valueOf(ex.getRequestHeaders().getFirst("X-Client-Key")));
            byte[] body = "{\"meta\":{\"success\":true},\"data\":{\"result\":{\"latestSeq\":3,\"items\":[],\"truncated\":false}}}"
                    .getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(200, body.length);
            try (OutputStream out = ex.getResponseBody()) {
                out.write(body);
            }
        });
        server.createContext("/slow/oasis/metaFeed/search", ex -> {
            try {
                Thread.sleep(3_000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            ex.sendResponseHeaders(500, -1);
            ex.close();
        });
        server.start();
        String base = "http://127.0.0.1:" + server.getAddress().getPort();
        try {
            runner.withPropertyValues("cactus.mdm.enabled=true", "cactus.mdm.client-key=secret-key", "cactus.mdm.base-url=" + base + "/fast")
                    .run(ctx -> {
                        assertThat(ctx.getBean(MdmMetaClient.class).changes(0, 1).latestSeq()).isEqualTo(3);
                        assertThat(clientKeys).isNotEmpty().allMatch("secret-key"::equals); // 폴러 호출을 포함한 모든 요청
                    });
            runner.withPropertyValues("cactus.mdm.enabled=true", "cactus.mdm.client-key=k", "cactus.mdm.read-timeout=300ms",
                    "cactus.mdm.base-url=" + base + "/slow").run(ctx -> {
                long t0 = System.nanoTime();
                assertThatThrownBy(() -> ctx.getBean(MdmMetaClient.class).changes(0, 1)).isInstanceOf(MdmUnavailableException.class);
                assertThat(Duration.ofNanos(System.nanoTime() - t0)).isLessThan(Duration.ofMillis(2_500));
            });
        } finally {
            server.stop(0);
            pool.shutdownNow();
        }
    }

    @Test
    void 다른_DefinitionLookup_빈이_있으면_그것을_두고_나머지만_만든다() {
        DefinitionLookup other = new DefinitionLookup() {
            @Override
            public Optional<ColumnDefinition> column(String table, String column) {
                return Optional.empty();
            }

            @Override
            public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) {
                return Optional.empty();
            }

            @Override
            public Optional<RuleSetDefinition> ruleSet(String setId, Instant evalTs) {
                return Optional.empty();
            }
        };
        runner.withPropertyValues(ON).withBean(DefinitionLookup.class, () -> other).run(ctx -> {
            assertThat(ctx).doesNotHaveBean(MdmDefinitionLookup.class);
            assertThat(ctx).hasSingleBean(MdmMetaService.class);
            assertThat(ctx.getBean(DefinitionLookup.class)).isSameAs(other);
        });
    }
}
