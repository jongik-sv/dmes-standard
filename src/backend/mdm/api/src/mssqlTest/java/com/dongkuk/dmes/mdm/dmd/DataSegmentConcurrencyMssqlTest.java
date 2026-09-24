package com.dongkuk.dmes.mdm.dmd;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.MdmMssqlServer;
import com.dongkuk.dmes.mdm.common.segment.DataItemMessages;
import com.dongkuk.dmes.mdm.common.segment.DataItemSaveCore;
import com.dongkuk.dmes.mdm.common.segment.DataItemValue;
import com.dongkuk.dmes.mdm.common.segment.DataSegmentLock;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * TSK-07-03 design.md §3.3 M1~M5 — 같은 마루 데이터의 동시 저장이 TB_MDM_DATA 행 잠금으로 직렬화되어 선분이 겹치지 않는지
 * (수용 기준 「동시 저장에서 선분 겹침 0」)를 실제 SQL Server 에서 확인한다. SQLite 는 쓰기 잠금이 DB 전체 단위라 이
 * 효과를 드러내지 못한다(F10, S11·L1·L2 의 "SQLite 로 못 잡음").
 *
 * <p><b>작성만 하고 워커는 실행하지 않는다(도커 금지 정책).</b> 머지 뒤 팀장 방언 검증(dialect_check)에서
 * {@code :api:mssqlMigrationTest} 로 처음 컴파일·실행된다. {@link MdmMssqlServer} 공용 서버를 쓴다.
 *
 * <p>스레드는 {@link CountDownLatch} 로 모두 준비된 뒤 동시에 출발한다. 각 스레드는 코어 공개 메서드를 그대로 부른다(코어가
 * 자기 트랜잭션을 연다). 끝나면 겹침 질의로 확인한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local-db")
class DataSegmentConcurrencyMssqlTest {

    private static final String MD = "PORT";
    private static final String OPEN = "9999-12-31 00:00:00";

    @Autowired
    DataSource dataSource;
    @Autowired
    DataItemSaveCore core;
    @Autowired
    DataSegmentLock lock;
    @Autowired
    PlatformTransactionManager transactionManager;

    private JdbcTemplate jdbc;

    @DynamicPropertySource
    static void registerMssql(DynamicPropertyRegistry registry) throws SQLException {
        String mdmUrl = MdmMssqlServer.newDatabase("dataseg");
        registry.add("spring.datasource.url", () -> mdmUrl);
        registry.add("spring.datasource.username", MdmMssqlServer::user);
        registry.add("spring.datasource.password", MdmMssqlServer::password);
    }

    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        jdbc.update("DELETE FROM TB_MDM_DATA_CATE_ITEM");
        jdbc.update("DELETE FROM TB_MDM_DATA_CATE");
        jdbc.update("DELETE FROM TB_MDM_DATA_ITEM");
        jdbc.update("DELETE FROM TB_MDM_DATA");
        jdbc.update("INSERT INTO TB_MDM_DATA (MARU_DATA_ID, MARU_DATA_NAME, STATUS, SOURCE_KIND, CODE_PATTERN, LVL_CNT, "
                + "LAST_CHG_SEQ, CHG_SEQ, VER) VALUES (?, '항구', 'INUSE', 'MDM', '^[0-9A-Z]{1,20}$', 0, 0, 0, 0)", MD);
    }

    @Test
    void M1_같은_키_동시_등록_8개는_하나만_성공하고_나머지는_KEY_EXISTS() throws Exception {
        List<Outcome> results = race(8, i -> () -> core.register(MD, "KRPUS", value("부산" + i)));

        assertEquals(1, successes(results), results.toString());
        assertTrue(results.stream().filter(r -> r.error != null)
                .allMatch(r -> r.error.contains(DataItemMessages.KEY_EXISTS)), results.toString());
        assertEquals(1, openRows("KRPUS"));
        assertEquals(0, overlaps());
    }

    @Test
    void M2_같은_키_같은_expected_동시_수정_8개는_하나만_성공하고_나머지는_충돌() throws Exception {
        core.register(MD, "KRPUS", value("부산"));

        List<Outcome> results = race(8, i -> () -> core.modify(MD, "KRPUS", value("수정" + i), 0));

        assertEquals(1, successes(results), results.toString());
        assertTrue(results.stream().filter(r -> r.error != null)
                .allMatch(r -> r.error.startsWith(MdmErrorCode.ROW_VERSION_CONFLICT.defaultMessage())), results.toString());
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE CODE = 'KRPUS'", Integer.class));
        assertEquals(0, overlaps());
    }

    @Test
    void M3_같은_닫힌_키_동시_다시_열기_8개는_하나만_성공() throws Exception {
        core.register(MD, "KRPUS", value("부산"));
        core.close(MD, "KRPUS", 0);

        List<Outcome> results = race(8, i -> () -> core.reopen(MD, "KRPUS", 1));

        assertEquals(1, successes(results), results.toString());
        assertEquals(1, openRows("KRPUS"));
        assertEquals(0, overlaps());
    }

    @Test
    void M4_같은_마루_데이터의_서로_다른_키_20개_동시_수정은_직렬화돼도_모두_성공() throws Exception {
        for (int i = 0; i < 20; i++) {
            core.register(MD, "K" + i, value("처음" + i));
        }

        List<Outcome> results = race(20, i -> () -> core.modify(MD, "K" + i, value("수정" + i), 0));

        assertEquals(20, successes(results), results.toString());
        assertEquals(0, overlaps());
        assertEquals(20, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE VALID_TO = '" + OPEN + "'",
                Integer.class));
    }

    @Test
    void M5_잠금은_커밋까지_행_X_잠금을_쥔다() throws Exception {
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService pool = Executors.newSingleThreadExecutor();
        try {
            Future<?> holder = pool.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                lock.lock(MD);
                locked.countDown();
                try {
                    release.await(30, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }));
            assertTrue(locked.await(30, TimeUnit.SECONDS));

            try (Connection c = dataSource.getConnection(); Statement s = c.createStatement()) {
                s.execute("SET LOCK_TIMEOUT 500");
                SQLException timeout = null;
                try {
                    s.executeUpdate(DataSegmentLock.LOCK_SQL.replace(":id", "'" + MD + "'"));
                } catch (SQLException e) {
                    timeout = e;
                }
                assertTrue(timeout != null && timeout.getErrorCode() == 1222,
                        "잠금을 쥔 동안 같은 행 UPDATE 는 1222(잠금 시간 초과)여야 한다: " + timeout);

                release.countDown();
                holder.get(30, TimeUnit.SECONDS);
                assertEquals(1, s.executeUpdate(DataSegmentLock.LOCK_SQL.replace(":id", "'" + MD + "'")),
                        "커밋 뒤에는 잠금이 풀린다");
            }
        } finally {
            release.countDown();
            pool.shutdownNow();
        }
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    record Outcome(boolean ok, String error) {
    }

    interface Task {
        Callable<Object> of(int index);
    }

    private static List<Outcome> race(int threads, Task task) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch ready = new CountDownLatch(threads);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<Outcome>> futures = new ArrayList<>();
        try {
            for (int i = 0; i < threads; i++) {
                Callable<Object> call = task.of(i);
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    go.await();
                    try {
                        call.call();
                        return new Outcome(true, null);
                    } catch (BusinessException e) {
                        return new Outcome(false, e.getMessage());
                    }
                }));
            }
            assertTrue(ready.await(30, TimeUnit.SECONDS));
            go.countDown();
            List<Outcome> out = new ArrayList<>();
            for (Future<Outcome> f : futures) {
                out.add(f.get(60, TimeUnit.SECONDS));
            }
            return out;
        } finally {
            pool.shutdownNow();
        }
    }

    private static long successes(List<Outcome> results) {
        return results.stream().filter(Outcome::ok).count();
    }

    private int openRows(String code) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = ? AND CODE = ? "
                + "AND VALID_TO = '" + OPEN + "'", Integer.class, MD, code);
    }

    /** 두 방언 공용 겹침 질의(design.md §3.3). */
    private int overlaps() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM a JOIN TB_MDM_DATA_ITEM b "
                + "ON a.MARU_DATA_ID = b.MARU_DATA_ID AND a.CODE = b.CODE AND a.VALID_FROM < b.VALID_FROM "
                + "AND b.VALID_FROM < a.VALID_TO", Integer.class);
    }

    private static DataItemValue value(String name) {
        return new DataItemValue(name, null, null, null, List.of(), List.of());
    }
}
