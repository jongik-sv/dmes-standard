package com.dongkuk.dmes.mcm.widget.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.entity.DeptInfo;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetSearchRequest;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidget;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTab;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultLayoutRepository;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabItemRepository;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetTabRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 위젯 탭 조회의 연결 풀 고갈 교착 재현(oracle-1007 ③c, ora-mdm E2E 실측 — 풀 3·active 3·waiting 5·30초 connectionTimeout).
 * OASIS({@code cactus.oasis.transactional: true})는 서비스 호출 전체를 txBiz 로 감싸며 READ_COMMITTED 를 지정하므로, 바깥
 * 트랜잭션이 시작될 때 이미 물리 연결 하나를 쥔다({@code HibernateJpaDialect.beginTransaction} 의 격리 수준 준비). 이 시험은
 * oasis {@code SpringTransactionHandler.startTransaction} 과 같은 정의(REQUIRED·READ_COMMITTED)로 바깥 트랜잭션을 연 채
 * {@link SecWidgetService#search} 를 동시에 부른다. 요청 하나가 풀의 연결을 둘 이상 쥐면, 풀 크기만큼의 요청이 바깥 연결을 모두 쥔 채
 * 서로의 연결을 기다려 connectionTimeout 까지 멈춘다.
 * <p>바깥 트랜잭션 안에서 풀 크기만큼 모일 때까지 기다린 뒤(래치) 함께 조회해 「우연히 줄을 서서 통과」하지 않게 한다. 풀보다 많은
 * 나머지 요청은 바깥 연결을 기다리다 앞 요청이 끝나면 들어온다.
 */
@SpringJUnitConfig(SecWidgetPoolJpaTestConfig.class)
class SecWidgetPoolExhaustionJpaTest {

    private static final String DEPT = "D100";

    @Autowired SecWidgetService service;
    @Autowired SecUserWidgetTabRepository userTabRepository;
    @Autowired SecUserWidgetRepository userWidgetRepository;
    @Autowired WidgetDefaultLayoutRepository layoutRepository;
    @Autowired WidgetDefaultTabRepository tabRepository;
    @Autowired WidgetDefaultTabItemRepository itemRepository;
    @Autowired PlatformTransactionManager txManager;
    @PersistenceContext EntityManager em;

    @BeforeEach
    void clean() {
        layoutRepository.deleteAllInBatch();
        itemRepository.deleteAllInBatch();
        tabRepository.deleteAllInBatch();
        userWidgetRepository.deleteAllInBatch();
        userTabRepository.deleteAllInBatch();
        new TransactionTemplate(txManager).executeWithoutResult(s -> {
            em.createQuery("delete from McmSecUser").executeUpdate();
            em.createQuery("delete from DeptInfo").executeUpdate();
            DeptInfo d = new DeptInfo();
            d.setDeptCd(DEPT);
            d.setDeptNm("생산1팀");
            d.setUseTp("Y");
            em.persist(d);
        });
    }

    @Test
    @DisplayName("조회만 — 풀 크기보다 많은 동시 search 가 바깥 트랜잭션 안에서 모두 connectionTimeout 전에 끝난다")
    void concurrentSearchWithinOuterTransactions() throws Exception {
        List<String> users = users("pa", 5);
        for (String u : users) {
            userTab(u, "tab-1", "내 탭");
            userWidget(u, "tab-1", "w-" + u);
        }

        Run run = searchConcurrently(users, SecWidgetPoolJpaTestConfig.POOL_SIZE, null);

        assertNoTimeout(run, users);
        for (String u : users) {
            assertThat(tabIds(run.result(u))).as(u).containsExactly("tab-1");
        }
    }

    @Test
    @DisplayName("옛 행 이전 — 이전할 사용자 둘이 동시에 조회하면 한 번에 하나씩 이전해 둘 다 옮겨지고 connectionTimeout 전에 끝난다")
    void concurrentLegacyMigrationWithinOuterTransactions() throws Exception {
        // 이전은 계약상 자기 트랜잭션으로 커밋한다(바깥이 롤백돼도 남는다) — 이전하는 동안만 바깥 + 이전 트랜잭션 2개를 쓴다.
        // 둘이면 먼저 잡은 쪽이 이전하는 동안 다른 쪽은 건너뛸 수도 있으므로(이전은 한 번에 하나) 행은 「이번에 옮겼거나 다음 조회에 옮긴다」로 본다.
        int concurrent = SecWidgetPoolJpaTestConfig.POOL_SIZE - 1;
        List<String> users = users("pm", concurrent);
        for (String u : users) {
            userTab(u, "home", "홈");
            userWidget(u, "home", "h-" + u);
        }

        Run run = searchConcurrently(users, concurrent, null);

        assertNoTimeout(run, users);
        for (String u : users) {
            if (tabIds(run.result(u)).isEmpty()) {
                // 건너뛴 요청 — 옛 행은 숨기고, 다음 조회(이번에는 혼자)가 옮긴다.
                assertThat(widgets(run.result(u))).as(u + " 건너뛴 응답").isEmpty();
                SecWidgetPoolJpaTestConfig.CURRENT_USER.set(u);
                try {
                    service.search(new SecWidgetSearchRequest());
                } finally {
                    SecWidgetPoolJpaTestConfig.CURRENT_USER.remove();
                }
            } else {
                assertThat(tabIds(run.result(u))).as(u + " 응답").containsExactly("tab-1");
                assertThat(widgets(run.result(u))).as(u + " 응답 위젯")
                        .extracting(w -> w.get("tabId") + "/" + w.get("instId")).containsExactly("tab-1/h-" + u);
            }
            assertThat(userTabRepository.findByUserIdOrderByTabSeqAsc(u)).as(u + " 행")
                    .extracting(SecUserWidgetTab::getTabId).containsExactly("tab-1");
            assertThat(userWidgetRepository.findByUserIdAndTabId(u, "tab-1")).extracting(SecUserWidget::getInstId)
                    .containsExactly("h-" + u);
        }
    }

    @Test
    @DisplayName("옛 행 이전 — 풀 크기보다 많은 사용자가 동시에 처음 조회해도 이전은 하나만 하고 나머지는 건너뛰어(옛 행 숨김) connectionTimeout 전에 끝난다")
    void concurrentLegacyMigrationBeyondPoolSize() throws Exception {
        // 결정(oracle-1007 ③c 조정): 이전 쓰기는 한 번에 하나만, 못 잡으면 기다리지 않고 건너뛴다. 「이전한 요청은 1개」를
        // 흔들림 없이 보려고 이전 writer 가 나머지 요청이 모두 끝날 때까지 기다리게 한다(그동안 이전 자리를 쥐고 있다).
        int concurrent = SecWidgetPoolJpaTestConfig.POOL_SIZE + 1;
        List<String> users = users("pz", concurrent);
        for (String u : users) {
            userTab(u, "home", "홈");
            userWidget(u, "home", "h-" + u);
        }
        CountDownLatch othersDone = new CountDownLatch(concurrent - 1);
        SecWidgetPoolJpaTestConfig.BEFORE_MOVE.set(() -> {
            try {
                if (!othersDone.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("다른 요청이 끝나지 않았다");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(e);
            }
        });
        Run run;
        try {
            run = searchConcurrently(users, SecWidgetPoolJpaTestConfig.POOL_SIZE, othersDone);
        } finally {
            SecWidgetPoolJpaTestConfig.BEFORE_MOVE.set(null);
        }

        assertNoTimeout(run, users);
        List<String> migrated = new ArrayList<>();
        for (String u : users) {
            List<String> rows = userTabRepository.findByUserIdOrderByTabSeqAsc(u).stream().map(SecUserWidgetTab::getTabId).toList();
            if (rows.equals(List.of("tab-1"))) {
                migrated.add(u);
                assertThat(tabIds(run.result(u))).as(u + " 응답").containsExactly("tab-1");
                assertThat(widgets(run.result(u))).as(u + " 응답 위젯")
                        .extracting(w -> w.get("tabId") + "/" + w.get("instId")).containsExactly("tab-1/h-" + u);
            } else {
                assertThat(rows).as(u + " 행(건너뜀 — 옛 행 그대로)").containsExactly("home");
                assertThat(tabIds(run.result(u))).as(u + " 응답(옛 행 숨김)").isEmpty();
                assertThat(widgets(run.result(u))).as(u + " 응답 위젯(옛 행 숨김)").isEmpty();
            }
        }
        assertThat(migrated).as("실제로 이전한 요청").hasSize(1);
    }

    // ── 동시 실행 ─────────────────────────────────────────────────

    /** 사용자별 응답·실패·search 소요 시간(ms). */
    private record Run(Map<String, Map<String, Object>> results, List<String> failures, Map<String, Long> searchMs) {
        Map<String, Object> result(String userId) {
            return results.get(userId);
        }
    }

    /** 요청마다 실패가 없고, search 가 연결을 기다리다 connectionTimeout 까지 멈추지 않았다. */
    private static void assertNoTimeout(Run run, List<String> users) {
        assertThat(run.failures).as("요청별 실패").isEmpty();
        assertThat(run.searchMs.keySet()).as("search 를 마친 요청").containsExactlyInAnyOrderElementsOf(users);
        run.searchMs.forEach((u, ms) -> assertThat(ms).as(u + " search 소요(ms)")
                .isLessThan(SecWidgetPoolJpaTestConfig.CONNECTION_TIMEOUT_MS));
    }

    /**
     * users 마다 스레드 하나로 OASIS 처럼 바깥 트랜잭션(REQUIRED·READ_COMMITTED)을 열고 search 를 부른다. 바깥 안에 inside 명이 모일
     * 때까지 기다린 뒤 함께 조회한다(나머지는 바깥 연결을 얻는 대로 들어와 바로 지나간다). finished 가 있으면 요청이 끝날 때마다(실패 포함) 센다.
     */
    private Run searchConcurrently(List<String> users, int inside, CountDownLatch finished) throws Exception {
        int n = users.size();
        CyclicBarrier start = new CyclicBarrier(n);
        CountDownLatch together = new CountDownLatch(inside);
        Map<String, Long> searchMs = new ConcurrentHashMap<>();
        TransactionTemplate outer = new TransactionTemplate(txManager);
        outer.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRED);
        outer.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        ExecutorService pool = Executors.newFixedThreadPool(n);
        try {
            Map<String, Future<Map<String, Object>>> futures = new LinkedHashMap<>();
            for (String u : users) {
                futures.put(u, pool.submit(() -> {
                    SecWidgetPoolJpaTestConfig.CURRENT_USER.set(u);
                    try {
                        start.await(10, TimeUnit.SECONDS);
                        return outer.execute(status -> {
                            together.countDown();
                            try {
                                if (!together.await(10, TimeUnit.SECONDS)) {
                                    throw new IllegalStateException("바깥 트랜잭션 안에 " + inside + "명이 모이지 않았다");
                                }
                            } catch (InterruptedException e) {
                                Thread.currentThread().interrupt();
                                throw new IllegalStateException(e);
                            }
                            long t0 = System.nanoTime();
                            Map<String, Object> r = service.search(new SecWidgetSearchRequest());
                            searchMs.put(u, TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - t0));
                            return r;
                        });
                    } finally {
                        SecWidgetPoolJpaTestConfig.CURRENT_USER.remove();
                        if (finished != null) finished.countDown();
                    }
                }));
            }
            Map<String, Map<String, Object>> results = new LinkedHashMap<>();
            List<String> failures = new ArrayList<>();
            for (Map.Entry<String, Future<Map<String, Object>>> f : futures.entrySet()) {
                try {
                    results.put(f.getKey(), f.getValue().get(60, TimeUnit.SECONDS));
                } catch (Exception e) {
                    Throwable root = e;
                    while (root.getCause() != null) root = root.getCause();
                    failures.add(f.getKey() + ": " + e + " ← " + root);
                }
            }
            return new Run(results, failures, searchMs);
        } finally {
            pool.shutdownNow();
        }
    }

    // ── fixtures ───────────────────────────────────────────────────

    /** prefix1..prefixN 사용자(부서 D100)를 넣는다. */
    private List<String> users(String prefix, int n) {
        List<String> ids = new ArrayList<>();
        for (int i = 1; i <= n; i++) ids.add(prefix + i);
        new TransactionTemplate(txManager).executeWithoutResult(s -> {
            for (String id : ids) {
                SecUser u = new SecUser();
                u.setUserId(id);
                u.setUserNm(id);
                u.setDeptCd(DEPT);
                u.setUseTp("Y");
                em.persist(u);
            }
        });
        return ids;
    }

    private void userTab(String userId, String tabId, String nm) {
        SecUserWidgetTab t = new SecUserWidgetTab();
        t.setUserId(userId);
        t.setTabId(tabId);
        t.setTabNm(nm);
        t.setTabSeq(1);
        t.setLockYn("N");
        userTabRepository.saveAndFlush(t);
    }

    private void userWidget(String userId, String tabId, String instId) {
        SecUserWidget w = new SecUserWidget();
        w.setUserId(userId);
        w.setTabId(tabId);
        w.setInstId(instId);
        w.setWidgetId("home.notice");
        w.setPosX(0);
        w.setPosY(0);
        w.setSizeW(6);
        w.setSizeH(6);
        w.setLockYn("N");
        userWidgetRepository.saveAndFlush(w);
    }

    @SuppressWarnings("unchecked")
    private static List<Object> tabIds(Map<String, Object> result) {
        return ((List<Map<String, Object>>) result.get("tabs")).stream().map(t -> t.get("tabId")).toList();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> widgets(Map<String, Object> result) {
        return (List<Map<String, Object>>) result.get("widgets");
    }
}
