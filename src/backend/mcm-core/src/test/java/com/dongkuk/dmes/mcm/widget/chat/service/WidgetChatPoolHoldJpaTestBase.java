package com.dongkuk.dmes.mcm.widget.chat.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.widget.chat.dto.WidgetChatRequest;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmClient;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmReply;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmToolCall;
import com.dongkuk.dmes.mcm.widget.chat.repository.WidgetChatMessageRepository;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContext;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryRunner;
import com.zaxxer.hikari.HikariDataSource;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 채팅 send 가 LLM 을 기다리는 동안 앱 기본 풀에서 쥐는 연결 수(oracle-1007 ③c 후속, docs/oracle-1007/design-mcm-lazy-ds.md).
 * OASIS 처럼 바깥 트랜잭션(REQUIRED·READ_COMMITTED — 시작할 때 연결을 잡는다)을 연 채 send 를 부르고, 가짜 LLM 이 불릴 때마다
 * Hikari {@code activeConnections} 를 잰다. 첫 LLM 호출은 대화 문맥을 읽은 뒤, 둘째 호출은 도구(find_screen) 실행 뒤다 — 도구는
 * 운영의 내 메뉴 찾기처럼 트랜잭션 없이 파생 쿼리를 하나 돈다. 하위 클래스가 앱 기본 DataSource 를 그대로 쓰는지(Raw),
 * {@code LazyConnectionDataSourceProxy} 로 감싸는지(Lazy)와 그때 기대하는 연결 수를 정한다.
 */
abstract class WidgetChatPoolHoldJpaTestBase {

    static final String DEF_ID = "def.chatpool";
    private static final String CONFIG = "{\"systemPrompt\":\"\",\"pageGuide\":true,\"dataQueryDefIds\":[]}";

    @Autowired WidgetChatWriter writer;
    @Autowired WidgetChatMessageRepository repository;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired HikariDataSource hikari;

    private WidgetDefRepository defRepository;
    private WidgetUserContextResolver userContextResolver;
    private ChatScreenFinder screenFinder;
    private final Map<Thread, String> users = new ConcurrentHashMap<>();
    private SecurityIdentity securityIdentity;

    /** LLM 을 기다리는 동안 이 풀에서 쥔 연결 수 — 기대값. */
    abstract int expectedHeldDuringLlm();

    /** {@link #otherRequestWhileChatsWait} 결과 판정 — 구성마다 다르다. */
    abstract void assertConcurrent(ConcurrentRun run);

    @BeforeEach
    void setUp() {
        repository.deleteAllInBatch();
        defRepository = mock(WidgetDefRepository.class);
        WidgetDef d = new WidgetDef();
        d.setWidgetId(DEF_ID);
        d.setSrcTp(WidgetDef.SRC_DEF);
        d.setTypeId("chat");
        d.setTitle("도우미");
        d.setUseYn("Y");
        d.setConfigJson(CONFIG);
        when(defRepository.findById(DEF_ID)).thenReturn(Optional.of(d));
        userContextResolver = mock(WidgetUserContextResolver.class);
        when(userContextResolver.current()).thenAnswer(inv -> new WidgetUserContext(user(), "홍길동", "D100", "생산팀", List.of("D100")));
        securityIdentity = mock(SecurityIdentity.class);
        when(securityIdentity.currentUserId()).thenAnswer(inv -> user());
        // 내 메뉴 찾기(getMyMenus)처럼 트랜잭션 없이 파생 쿼리를 하나 돈다.
        screenFinder = mock(ChatScreenFinder.class);
        when(screenFinder.find(anyString(), anyInt())).thenAnswer(inv -> {
            repository.findByUserIdAndInstIdOrderByMsgSeqAsc(user(), "i1");
            return List.of();
        });
    }

    private String user() {
        return users.getOrDefault(Thread.currentThread(), "userA");
    }

    private WidgetChatService service(LlmClient llm) {
        return new WidgetChatService(repository, writer, defRepository, mock(WidgetQueryRunner.class), userContextResolver, screenFinder,
                llm, securityIdentity, transactionManager, Duration.ofSeconds(60), Clock.systemDefaultZone(), 1000);
    }

    /** OASIS txBiz 흉내 — oasis SpringTransactionHandler.startTransaction 과 같은 정의. */
    private TransactionTemplate oasis() {
        TransactionTemplate t = new TransactionTemplate(transactionManager);
        t.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRED);
        t.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        return t;
    }

    private static WidgetChatRequest req(String message) {
        WidgetChatRequest r = new WidgetChatRequest();
        r.setInstId("i1");
        r.setDefId(DEF_ID);
        r.setMessage(message);
        return r;
    }

    private int active() {
        return hikari.getHikariPoolMXBean().getActiveConnections();
    }

    @Test
    @DisplayName("LLM 을 기다리는 동안(문맥 읽기 뒤·도구 실행 뒤) 앱 기본 풀에서 쥔 연결 수")
    void connectionsHeldWhileWaitingForLlm() {
        List<Integer> heldPerCall = new ArrayList<>();
        int[] round = {0};
        LlmClient llm = (system, messages, tools) -> {
            heldPerCall.add(active());
            return round[0]++ == 0
                    ? LlmReply.ofToolCalls("", List.of(new LlmToolCall("t1", "find_screen", Map.of("keyword", "위젯"))))
                    : LlmReply.ofText("답");
        };
        WidgetChatService svc = service(llm);

        Map<String, Object> result = oasis().execute(st -> svc.send(req("안녕")));

        System.out.println("[chat-pool] " + getClass().getSimpleName() + " LLM 호출마다 쥔 연결 수=" + heldPerCall
                + " (풀 상한 " + WidgetChatPoolJpaTestConfig.POOL_SIZE + ")");
        assertThat(result).containsKey("reply");
        assertThat(heldPerCall).as("LLM 호출마다 쥔 연결 수(문맥 읽기 뒤, 도구 실행 뒤)")
                .containsExactly(expectedHeldDuringLlm(), expectedHeldDuringLlm());
        assertThat(repository.findByUserIdAndInstIdOrderByMsgSeqAsc("userA", "i1")).hasSize(2);
    }

    @Test
    @DisplayName("풀 크기만큼의 채팅이 LLM 을 기다리는 동안 다른 요청 하나 — 쥔 연결 수·다른 요청 결과·채팅 실패")
    void otherRequestWhileChatsWaitForLlm() throws Exception {
        assertConcurrent(otherRequestWhileChatsWait());
    }

    /**
     * 풀 크기만큼의 채팅이 바깥 트랜잭션 안에서 LLM 을 기다리는 동안 다른 요청(같은 바깥 트랜잭션 흉내 안에서 채팅 기록 조회)이
     * connectionTimeout 전에 끝나는지. 채팅이 LLM 대기에 모두 들어가기를 connectionTimeout 의 두 배까지 기다린다(못 들어가면 연결을
     * 못 받아 실패한 것이다). 결과(성공·실패·소요 시간·쥔 연결 수)를 돌려준다 — 판정은 하위 클래스가 한다.
     */
    ConcurrentRun otherRequestWhileChatsWait() throws Exception {
        int n = WidgetChatPoolJpaTestConfig.POOL_SIZE;
        CountDownLatch waiting = new CountDownLatch(n);
        CountDownLatch release = new CountDownLatch(1);
        LlmClient llm = (system, messages, tools) -> {
            waiting.countDown();
            try {
                if (!release.await(30, TimeUnit.SECONDS)) throw new IllegalStateException("풀리지 않았다");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(e);
            }
            return LlmReply.ofText("답");
        };
        WidgetChatService svc = service(llm);
        ExecutorService pool = Executors.newFixedThreadPool(n);
        List<String> chatFailures = new CopyOnWriteArrayList<>();
        try {
            List<Future<?>> chats = new ArrayList<>();
            for (int i = 1; i <= n; i++) {
                String u = "chat" + i;
                chats.add(pool.submit(() -> {
                    users.put(Thread.currentThread(), u);
                    try {
                        oasis().execute(st -> svc.send(req("안녕")));
                    } catch (RuntimeException e) {
                        chatFailures.add(u + ": " + e);
                    } finally {
                        users.remove(Thread.currentThread());
                    }
                }));
            }
            boolean allWaiting = waiting.await(2 * WidgetChatPoolJpaTestConfig.CONNECTION_TIMEOUT_MS, TimeUnit.MILLISECONDS);
            int heldWhileWaiting = active();
            long t0 = System.nanoTime();
            String otherFailure = null;
            try {
                oasis().execute(st -> svc.history(req(null)));
            } catch (RuntimeException e) {
                Throwable root = e;
                while (root.getCause() != null) root = root.getCause();
                otherFailure = e + " ← " + root;
            }
            long otherMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - t0);
            release.countDown();
            for (Future<?> f : chats) f.get(60, TimeUnit.SECONDS);
            ConcurrentRun run = new ConcurrentRun(allWaiting, heldWhileWaiting, otherFailure == null, otherFailure, otherMs,
                    chatFailures.size(), List.copyOf(chatFailures));
            System.out.println("[chat-pool] " + getClass().getSimpleName() + " 동시 채팅 " + n + "개 LLM 대기 중: " + run);
            return run;
        } finally {
            release.countDown();
            pool.shutdownNow();
        }
    }

    record ConcurrentRun(boolean allWaiting, int heldWhileWaiting, boolean otherOk, String otherFailure, long otherMs,
                         int chatFailureCount, List<String> chatFailures) {}
}
