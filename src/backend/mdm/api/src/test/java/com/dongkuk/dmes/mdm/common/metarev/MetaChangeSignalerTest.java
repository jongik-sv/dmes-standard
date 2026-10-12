package com.dongkuk.dmes.mdm.common.metarev;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 메타 변경 신호(ADR-0007 D2 개정) — 커밋 뒤에만·트랜잭션마다 한 번·대상마다 보낸다, 롤백·꺼짐이면 보내지 않는다, 실패는 올리지 않고 첫 실패만 WARN.
 * 스프링 컨텍스트·DB 없이 로컬 HTTP 서버 둘과 가짜 트랜잭션 관리자로 돈다.
 */
class MetaChangeSignalerTest {

    private final List<HttpServer> servers = new CopyOnWriteArrayList<>();
    /** 대상 주소 → 받은 요청의 헤더(X-Client-Key, X-Authenticated-User, X-Authenticated-Role, 경로). */
    private final Map<String, List<List<String>>> received = new ConcurrentHashMap<>();
    private final Logger signalerLog = (Logger) LoggerFactory.getLogger(MetaChangeSignaler.class);
    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
    private MetaChangeSignaler signaler;
    private TransactionTemplate tx;

    @BeforeEach
    void setUp() {
        logs.start();
        signalerLog.addAppender(logs);
        tx = new TransactionTemplate(new NoopTransactionManager());
    }

    @AfterEach
    void tearDown() {
        signalerLog.detachAppender(logs);
        if (signaler != null) {
            signaler.close();
        }
        servers.forEach(s -> s.stop(0));
    }

    @Test
    void 커밋_뒤에_대상마다_한_번_보내고_트랜잭션_안의_여러_기록은_하나로_합친다() throws Exception {
        String a = server(204);
        String b = server(202);
        signaler = new MetaChangeSignaler(props(true, a, b + "/"), "secret-key");

        tx.executeWithoutResult(status -> {
            signaler.afterCommit();
            signaler.afterCommit();
            tx.executeWithoutResult(inner -> signaler.afterCommit()); // 합류한 안쪽 트랜잭션
            sleep(300); // 커밋 전 — 아무것도 가지 않는다
            assertThat(total()).as("커밋 전").isZero();
        });

        assertThat(waitUntil(() -> total() == 2, 3_000)).as("커밋 뒤 대상마다").isTrue();
        sleep(300);
        assertThat(received.get(a)).hasSize(1);
        assertThat(received.get(b)).hasSize(1);
        assertThat(received.get(a).get(0)).containsExactly("secret-key", "system:mdm", "SYSTEM", "POST /internal/mdm/metaSignal");
    }

    @Test
    void 롤백이면_보내지_않는다() throws Exception {
        String a = server(204);
        signaler = new MetaChangeSignaler(props(true, a), "k");

        tx.executeWithoutResult(status -> {
            signaler.afterCommit();
            status.setRollbackOnly();
        });
        assertThatThrownBy(() -> tx.executeWithoutResult(status -> {
            signaler.afterCommit();
            throw new IllegalStateException("원장 쓰기 실패");
        })).isInstanceOf(IllegalStateException.class);

        sleep(400);
        assertThat(total()).isZero();
    }

    @Test
    void 꺼져_있거나_대상이_없으면_보내지_않는다() throws Exception {
        String a = server(204);
        signaler = new MetaChangeSignaler(props(false, a), "k");
        tx.executeWithoutResult(status -> signaler.afterCommit());
        signaler.afterCommit();
        MetaChangeSignaler noTargets = new MetaChangeSignaler(props(true, " "), "k");
        try {
            assertThat(noTargets.enabled()).isFalse();
            noTargets.afterCommit();
        } finally {
            noTargets.close();
        }

        sleep(400);
        assertThat(total()).isZero();
    }

    @Test
    void 트랜잭션_밖에서는_바로_보낸다() throws Exception {
        String a = server(204);
        signaler = new MetaChangeSignaler(props(true, a), "k");

        signaler.afterCommit();

        assertThat(waitUntil(() -> total() == 1, 3_000)).isTrue();
    }

    @Test
    void 실패는_트랜잭션에_올리지_않고_대상마다_첫_실패만_WARN_이다() throws Exception {
        String ok = server(204);
        String denied = server(403);
        String down = "http://127.0.0.1:" + freePort(); // 연결 거부
        signaler = new MetaChangeSignaler(props(true, down, denied, ok), "k");

        for (int i = 0; i < 2; i++) {
            Boolean committed = tx.execute(status -> {
                signaler.afterCommit();
                return true;
            });
            assertThat(committed).isTrue();
            int want = i + 1;
            assertThat(waitUntil(() -> received.get(ok).size() == want, 3_000)).isTrue();
            sleep(300); // 실패 응답·연결 거부 처리를 기다린다
        }

        assertThat(received.get(denied)).hasSize(2);
        List<ILoggingEvent> warns = logs.list.stream().filter(e -> e.getLevel() == Level.WARN).toList();
        assertThat(warns).hasSize(2); // down·denied 각 첫 실패 한 줄
        assertThat(warns).extracting(ILoggingEvent::getFormattedMessage)
                .anySatisfy(m -> assertThat(m).contains(down)).anySatisfy(m -> assertThat(m).contains(denied).contains("HTTP 403"));
    }

    // ------------------------------------------------------------------ 도우미

    private static MetaSignalProperties props(boolean enabled, String... targets) {
        MetaSignalProperties p = new MetaSignalProperties();
        p.setEnabled(enabled);
        p.setTargets(List.of(targets));
        p.setDebounce(Duration.ofMillis(20));
        p.setConnectTimeout(Duration.ofMillis(500));
        p.setReadTimeout(Duration.ofSeconds(1));
        return p;
    }

    private String server(int status) throws IOException {
        HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        String base = "http://127.0.0.1:" + s.getAddress().getPort();
        received.put(base, new CopyOnWriteArrayList<>());
        s.createContext("/", ex -> {
            ex.getRequestBody().readAllBytes();
            received.get(base).add(List.of(String.valueOf(ex.getRequestHeaders().getFirst("X-Client-Key")),
                    String.valueOf(ex.getRequestHeaders().getFirst("X-Authenticated-User")),
                    String.valueOf(ex.getRequestHeaders().getFirst("X-Authenticated-Role")),
                    ex.getRequestMethod() + " " + ex.getRequestURI().getPath()));
            ex.sendResponseHeaders(status, -1);
            ex.close();
        });
        s.start();
        servers.add(s);
        return base;
    }

    private int total() {
        return received.values().stream().mapToInt(List::size).sum();
    }

    private static int freePort() throws IOException {
        try (ServerSocket s = new ServerSocket(0)) {
            return s.getLocalPort();
        }
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static boolean waitUntil(BooleanSupplier cond, long timeoutMs) {
        long end = System.nanoTime() + Duration.ofMillis(timeoutMs).toNanos();
        while (System.nanoTime() < end) {
            if (cond.getAsBoolean()) {
                return true;
            }
            sleep(20);
        }
        return cond.getAsBoolean();
    }

    /** 자원 없는 트랜잭션 관리자 — 트랜잭션 동기화(afterCommit)만 실제처럼 돈다. */
    private static final class NoopTransactionManager extends AbstractPlatformTransactionManager {

        @Override
        protected Object doGetTransaction() {
            return new Object();
        }

        @Override
        protected boolean isExistingTransaction(Object transaction) {
            return TransactionSynchronizationManager.isActualTransactionActive(); // 안쪽 REQUIRED 가 합류하게
        }

        @Override
        protected void doBegin(Object transaction, TransactionDefinition definition) {
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
        }
    }
}
