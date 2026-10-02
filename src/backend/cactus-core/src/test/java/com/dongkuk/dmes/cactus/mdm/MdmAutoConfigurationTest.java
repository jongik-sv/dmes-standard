package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sun.net.httpserver.HttpServer;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;
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
            assertThat(p.getMaxAge()).isEqualTo(Duration.ofMinutes(60));
            assertThat(p.getReadTimeout()).isEqualTo(Duration.ofSeconds(5));
            assertThat(p.getConnectTimeout()).isEqualTo(Duration.ofMillis(200));
            assertThat(p.getRevisionLookback()).isEqualTo(MdmRevisionPoller.DEFAULT_LOOKBACK);
        });
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
