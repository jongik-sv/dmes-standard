package com.dongkuk.dmes.mdm.common.segment;

import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.T0;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.count;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.insertCateRow;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.insertItemRow;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.itemRows;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.value;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.Events;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.oasis.audit.AuditHolder;
import jakarta.persistence.EntityManager;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * TSK-07-03 design.md §3.2 T-L — 행 잠금(L1~L3·S12) 중 SQLite 로 잡을 수 있는 부분.
 *
 * <p>SQLite 는 쓰기 잠금이 DB 전체 단위라 "잠금을 빼면 동시 저장이 겹친다"는 드러낼 수 없다(F10). 대신 호출 순서 기록,
 * 다른 연결의 {@code BEGIN IMMEDIATE} 탐침, 값 불변, 잠금 뒤 재조회를 본다. 실제 동시 직렬화는 mssqlTest
 * {@code DataSegmentConcurrencyMssqlTest}(도커 금지로 워커 미실행)가 맡는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import({DmdSegmentTestSupport.Config.class, DataSegmentLockSqliteTest.RecordingConfig.class})
class DataSegmentLockSqliteTest {

    private static final String MD = "PORT";

    @TempDir
    static Path tempDir;

    @Autowired
    DataItemSaveCore core;
    @Autowired
    DataCategorySegmentCore cateCore;
    @Autowired
    DataSegmentLock lock;
    @Autowired
    RecordingDataSegmentLock recordingLock;
    @Autowired
    Events events;
    @Autowired
    MutableClock clock;
    @Autowired
    DataSource dataSource;
    @Autowired
    PlatformTransactionManager transactionManager;

    private JdbcTemplate jdbc;
    private TransactionTemplate tx;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile());
    }

    private static Path dbFile() {
        return tempDir.resolve("mdm-dmd-segment-lock.db");
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class RecordingConfig {

        @Bean
        Events segmentEvents() {
            return new Events();
        }

        @Bean
        @Primary
        RecordingDataSegmentLock recordingDataSegmentLock(EntityManager entityManager, Events events) {
            return new RecordingDataSegmentLock(entityManager, events);
        }

        @Bean
        @Primary
        RecordingDataSegmentRowStore recordingDataSegmentRowStore(EntityManager entityManager, MdmTemporalBinder temporal,
                                                                  Events events) {
            return new RecordingDataSegmentRowStore(entityManager, temporal, events);
        }
    }

    /** 잠금 호출을 기록하고, 한 번만 실행할 훅을 {@code super.lock()} 직전에 돈다. */
    static class RecordingDataSegmentLock extends DataSegmentLock {
        private final Events events;
        private final AtomicReference<Runnable> beforeLock = new AtomicReference<>();

        RecordingDataSegmentLock(EntityManager entityManager, Events events) {
            super(entityManager);
            this.events = events;
        }

        void beforeLockOnce(Runnable hook) {
            beforeLock.set(hook);
        }

        @Override
        public LockedMaruData lock(String maruDataId) {
            events.add("LOCK:" + maruDataId);
            Runnable hook = beforeLock.getAndSet(null);
            if (hook != null) {
                hook.run();
            }
            return super.lock(maruDataId);
        }
    }

    /** 선분 행 읽기를 기록한다. */
    static class RecordingDataSegmentRowStore extends DataSegmentRowStore {
        private final Events events;

        RecordingDataSegmentRowStore(EntityManager entityManager, MdmTemporalBinder temporal, Events events) {
            super(entityManager, temporal);
            this.events = events;
        }

        @Override
        public List<ItemSegmentRow> itemRows(String maruDataId, String code) {
            events.add("READ:itemRows");
            return super.itemRows(maruDataId, code);
        }

        @Override
        public List<ItemSegmentRow> latestItemRows(String maruDataId) {
            events.add("READ:latestItemRows");
            return super.latestItemRows(maruDataId);
        }

        @Override
        public List<CateSegmentRow> cateRows(String maruDataId, String cateId) {
            events.add("READ:cateRows");
            return super.cateRows(maruDataId, cateId);
        }

        @Override
        public List<CateSegmentRow> openCateRows(String maruDataId) {
            events.add("READ:openCateRows");
            return super.openCateRows(maruDataId);
        }

        @Override
        public List<CateItemSegmentRow> cateItemRows(String maruDataId, String cateId, String code) {
            events.add("READ:cateItemRows");
            return super.cateItemRows(maruDataId, cateId, code);
        }
    }

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        tx = new TransactionTemplate(transactionManager);
        DmdSegmentTestSupport.clear(jdbc);
        DmdSegmentTestSupport.insertMdm(jdbc, MD, 1, "국가");
        clock.setLocal(T0);
        events.clear();
        recordingLock.beforeLockOnce(null);
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @AfterEach
    void clearThreadLocals() {
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @Test
    void L1_모든_쓰기_사건은_첫_사건으로_잠금을_정확히_한_번_부른다() {
        insertItemRow(jdbc, MD, "KRPUS", "부산", T0.minusDays(1), DmdSegmentTestSupport.OPEN, 0, null, null);
        insertCateRow(jdbc, MD, "MAJOR", "TABLE", null, null, T0.minusDays(1), DmdSegmentTestSupport.OPEN);

        assertLockFirst("register", () -> core.register(MD, "KRINC", value("인천")));
        assertLockFirst("modify", () -> core.modify(MD, "KRINC", value("인천항"), 0));
        assertLockFirst("close", () -> core.close(MD, "KRINC", 1));
        assertLockFirst("reopen", () -> core.reopen(MD, "KRINC", 2));
        assertLockFirst("upsert", () -> core.upsert(MD, DataSavePath.CSV, null,
                List.of(new UpsertRow("CNSHA", value("상하이"))), false));
        assertLockFirst("registerCate", () -> cateCore.registerCate(MD, "KR",
                new DataCateValue("한국", "REGEX", "^KR$", "ATTR01", null)));
        assertLockFirst("modifyCate", () -> cateCore.modifyCate(MD, "KR",
                new DataCateValue("한국 항구", "REGEX", "^KR$", "ATTR01", null)));
        assertLockFirst("closeCate", () -> cateCore.closeCate(MD, "KR"));
        assertLockFirst("reopenCate", () -> cateCore.reopenCate(MD, "KR"));
        assertLockFirst("addMember", () -> cateCore.addMember(MD, "MAJOR", "KRPUS"));
        assertLockFirst("removeMember", () -> cateCore.removeMember(MD, "MAJOR", "KRPUS"));
    }

    @Test
    void L2_잠금은_쓰기_잠금이라_다른_연결의_BEGIN_IMMEDIATE_가_막힌다() throws Exception {
        tx.executeWithoutResult(status -> {
            lock.lock(MD);
            assertTrue(probeBusy(), "잠금 문이 쓰기 잠금을 쥐지 않았다(SELECT 로 바뀐 변이)");
        });
        assertFalse(probeBusy(), "트랜잭션이 끝나면 잠금이 풀린다");
    }

    @Test
    void L2_S12_잠금과_사건은_TB_MDM_DATA_의_순번_감사_칼럼을_바꾸지_않는다() {
        Map<String, Object> before = maruRow();
        insertCateRow(jdbc, MD, "MAJOR", "TABLE", null, null, T0.minusDays(1), DmdSegmentTestSupport.OPEN);

        core.register(MD, "KRPUS", value("부산"));
        clock.setLocal(T0.plusSeconds(10));
        core.modify(MD, "KRPUS", value("부산항"), 0);
        core.close(MD, "KRPUS", 1);
        core.reopen(MD, "KRPUS", 2);
        core.upsert(MD, DataSavePath.CSV, null, List.of(new UpsertRow("KRINC", value("인천"))), false);
        cateCore.registerCate(MD, "KR", new DataCateValue("한국", "REGEX", "^KR$", "ATTR01", null));
        cateCore.addMember(MD, "MAJOR", "KRPUS");

        assertEquals(before, maruRow());
    }

    @Test
    void L3_없는_마루_데이터는_거부하고_아무것도_쓰지_않는다() {
        BusinessException direct = assertThrows(BusinessException.class,
                () -> tx.executeWithoutResult(status -> lock.lock("NOPE")));
        assertTrue(direct.getMessage().contains(DataItemMessages.NO_MARU_DATA), direct.getMessage());

        BusinessException viaCore = assertThrows(BusinessException.class, () -> core.register("NOPE", "KRPUS", value("x")));
        assertTrue(viaCore.getMessage().contains(DataItemMessages.NO_MARU_DATA), viaCore.getMessage());
        assertEquals(0, count(jdbc, "TB_MDM_DATA_ITEM"));
    }

    @Test
    void L1_S4_잠금_뒤에_다시_읽은_row_version_으로_판정한다() throws Exception {
        core.register(MD, "KRPUS", value("부산"));
        clock.setLocal(T0.plusSeconds(10));
        AtomicReference<Throwable> hookError = new AtomicReference<>();
        recordingLock.beforeLockOnce(() -> {
            Thread other = new Thread(() -> {
                try {
                    core.modify(MD, "KRPUS", value("다른 사용자"), 0);
                } catch (Throwable t) {
                    hookError.set(t);
                }
            });
            other.start();
            try {
                other.join(15_000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            if (other.isAlive()) {
                hookError.set(new AssertionError("다른 스레드의 수정이 끝나지 않았다"));
            }
        });

        BusinessException e = assertThrows(BusinessException.class, () -> core.modify(MD, "KRPUS", value("나"), 0));

        assertNull(hookError.get(), "다른 스레드의 수정은 막히지 않아야 한다: " + hookError.get());
        assertTrue(e.getMessage().startsWith(MdmErrorCode.ROW_VERSION_CONFLICT.defaultMessage()), e.getMessage());
        List<Map<String, Object>> rows = itemRows(jdbc, MD, "KRPUS");
        assertEquals(2, rows.size());
        assertEquals("다른 사용자", rows.get(1).get("NAME"));
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private void assertLockFirst(String op, Runnable call) {
        events.clear();
        call.run();
        List<String> log = events.snapshot();
        assertFalse(log.isEmpty(), op + ": 기록 없음");
        assertEquals("LOCK:" + MD, log.get(0), op + ": 첫 사건이 잠금이 아니다 " + log);
        assertEquals(1, log.stream().filter(s -> s.startsWith("LOCK:")).count(), op + ": 잠금 횟수 " + log);
        assertTrue(log.stream().anyMatch(s -> s.startsWith("READ:")), op + ": 잠금 뒤 선분 재조회가 없다 " + log);
    }

    private Map<String, Object> maruRow() {
        return jdbc.queryForMap("SELECT LAST_CHG_SEQ, CHG_SEQ, VER, U_AT, U_USR_ID FROM TB_MDM_DATA WHERE MARU_DATA_ID = ?",
                MD);
    }

    /** 같은 DB 파일을 스프링 풀 밖의 새 연결로 열어 쓰기 잠금을 시도한다. busy 면 true. */
    private static boolean probeBusy() {
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + dbFile()); Statement s = c.createStatement()) {
            s.execute("PRAGMA busy_timeout = 0");
            try {
                s.execute("BEGIN IMMEDIATE");
            } catch (SQLException e) {
                if (String.valueOf(e.getMessage()).contains("SQLITE_BUSY")) {
                    return true;
                }
                throw e;
            }
            s.execute("ROLLBACK");
            return false;
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
    }
}
