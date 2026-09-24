package com.dongkuk.dmes.mdm.dmc;

import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.OPEN;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.OPEN_END;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.PAST;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeDraftDeletion;
import com.dongkuk.dmes.mdm.contract.version.VersionDraftDeletionSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStateService;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.oasis.audit.AuditHolder;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * TSK-06-02 design.md §3.2 D1~D3 — DRAFT 삭제 때 세 선분 표 복구(불변 규칙 I14, I20·I29).
 *
 * <p>운영 삭제 훅({@link MasterCodeDraftDeletion})을 공통 {@link VersionStateService#deleteDraft} 경로로 태운다. 이 컨텍스트는
 * 시나리오 가짜 설정을 import 하지 않으므로 운영 훅이 그대로 쓰인다(공용 부품 P2 의 반대편). SQLite 에는 1.000(INTEGER)과
 * 1.001(REAL)이 섞여 저장된다 — 등호 조건과 {@code setScale(3)} 바인딩이 둘 다 맞아야 한다(I20).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmaTestSupport.Config.class)
class MasterCodeDraftDeletionSqliteTest {

    private static final String ID = "PROC_CD";

    @TempDir
    static Path tempDir;

    @Autowired
    VersionStateService versionState;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    DataSource dataSource;
    @Autowired
    PlatformTransactionManager transactionManager;
    @Autowired
    ApplicationContext context;

    private JdbcTemplate jdbc;
    private TransactionTemplate tx;
    private MasterCodeSeeds seeds;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-code-draft-deletion-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        tx = new TransactionTemplate(transactionManager);
        seeds = new MasterCodeSeeds(jdbc);
        seeds.clear();
        currentUser.set("stw1", Set.of("MDM_STEWARD"));
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @Test
    void D0_운영_MASTER_CODE_삭제_훅은_하나다() {
        List<VersionDraftDeletionSpi> hooks = context.getBeansOfType(VersionDraftDeletionSpi.class).values().stream()
                .filter(h -> h.target() == VersionTarget.MASTER_CODE).toList();
        assertEquals(1, hooks.size());
        assertTrue(hooks.get(0) instanceof MasterCodeDraftDeletion);
    }

    @Test
    void D1_DRAFT_를_지우면_세_표가_DRAFT_만들기_전과_같아진다() {
        seeds.seedCode(ID, "INUSE", "MDM");
        seeds.released(ID, "1.000", PAST, OPEN_END);
        seeds.seedItem(ID, "A", "1.000", OPEN, "a1", 1);
        seeds.seedItem(ID, "B", "1.000", OPEN, "b1", 2);
        seeds.seedItem(ID, "C", "1.000", OPEN, "c1", 3);
        seeds.seedBase(ID);
        seeds.seedCate(ID, "T", "1.000", OPEN, "TABLE", null, null, "t1");
        seeds.seedCateItem(ID, "T", "A", "1.000", OPEN);
        seeds.seedCateItem(ID, "T", "B", "1.000", OPEN);
        List<String> before = seeds.segments(ID);

        // DRAFT 1.001 — A 수정, B 삭제, D 추가, T 이름 수정, (T,B) 닫기, (T,D) 추가, R(REGEX) 추가
        seeds.draft(ID, "1.001", "stw1");
        jdbc.update("UPDATE TB_MDM_CODE_ITEM SET TO_VER = 1.001 WHERE MARU_CODE_ID = ? AND CODE IN ('A', 'B')", ID);
        seeds.seedItem(ID, "A", "1.001", OPEN, "a2", 1);
        seeds.seedItem(ID, "D", "1.001", OPEN, "d1", 4);
        jdbc.update("UPDATE TB_MDM_CODE_CATE SET TO_VER = 1.001 WHERE MARU_CODE_ID = ? AND CATE_ID = 'T'", ID);
        seeds.seedCate(ID, "T", "1.001", OPEN, "TABLE", null, null, "t2");
        seeds.seedCate(ID, "R", "1.001", OPEN, "REGEX", "^D", "CODE", "r1");
        jdbc.update("UPDATE TB_MDM_CODE_CATE_ITEM SET TO_VER = 1.001 WHERE MARU_CODE_ID = ? AND CODE = 'B'", ID);
        seeds.seedCateItem(ID, "T", "D", "1.001", OPEN);
        assertNotEquals(before, seeds.segments(ID));

        tx.executeWithoutResult(s -> versionState.deleteDraft(ref("1.001"), 0L, "stw1"));

        assertEquals(0, seeds.touching(ID, "FROM_VER", "1.001"));
        assertEquals(0, seeds.touching(ID, "TO_VER", "1.001"));
        assertEquals(before, seeds.segments(ID), "세 표 행 집합이 DRAFT 만들기 전과 같다");
        assertEquals(1, seeds.count("TB_MDM_CODE_VER", ID));
        assertEquals("RELEASED", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_CODE_VER", String.class));
        assertEquals(1, jdbc.queryForObject("SELECT VER FROM TB_MDM_CODE_ITEM WHERE CODE = 'A'", Integer.class),
                "되돌린 행은 감사 카운터를 올린다");
        assertTrue(jdbc.queryForObject("SELECT U_AT FROM TB_MDM_CODE_ITEM WHERE CODE = 'A'", String.class) != null);
    }

    @Test
    void D2_첫_DRAFT_를_지우면_BASE_도_사라지고_코드_헤더는_남는다() {
        seeds.seedCode(ID, "CREATED", "MDM");
        seeds.draft(ID, "1.000", "stw1");
        seeds.seedBase(ID);
        seeds.seedItem(ID, "A", "1.000", OPEN, "a1", 1);

        tx.executeWithoutResult(s -> versionState.deleteDraft(ref("1.000"), 0L, "stw1"));

        assertEquals(0, seeds.count("TB_MDM_CODE_CATE", ID));
        assertEquals(0, seeds.count("TB_MDM_CODE_ITEM", ID));
        assertEquals(0, seeds.count("TB_MDM_CODE_VER", ID));
        assertEquals(1, seeds.count("TB_MDM_CODE", ID));
    }

    @Test
    void D3_훅이_실패하면_VER_행과_선분이_모두_원상이다() {
        seeds.seedCode(ID, "INUSE", "MDM");
        seeds.released(ID, "1.000", PAST, OPEN_END);
        seeds.seedItem(ID, "A", "1.000", OPEN, "a1", 1);
        seeds.seedBase(ID);
        seeds.seedCate(ID, "T", "1.000", OPEN, "TABLE", null, null, "t1");
        seeds.draft(ID, "1.001", "stw1");
        jdbc.update("UPDATE TB_MDM_CODE_ITEM SET TO_VER = 1.001 WHERE MARU_CODE_ID = ?", ID);
        seeds.seedItem(ID, "A", "1.001", OPEN, "a2", 1);
        jdbc.update("UPDATE TB_MDM_CODE_CATE SET TO_VER = 1.001 WHERE MARU_CODE_ID = ? AND CATE_ID = 'T'", ID);
        seeds.seedCate(ID, "T", "1.001", OPEN, "TABLE", null, null, "t2");
        List<String> before = seeds.segments(ID);
        jdbc.execute("CREATE TRIGGER TR_D3_FAIL BEFORE UPDATE ON TB_MDM_CODE_CATE BEGIN SELECT RAISE(ABORT, 'D3 forced'); END");
        try {
            assertThrows(RuntimeException.class,
                    () -> tx.executeWithoutResult(s -> versionState.deleteDraft(ref("1.001"), 0L, "stw1")));
        } finally {
            jdbc.execute("DROP TRIGGER IF EXISTS TR_D3_FAIL");
        }
        assertEquals(before, seeds.segments(ID), "선분이 그대로다(같은 트랜잭션 롤백)");
        assertEquals(2, seeds.count("TB_MDM_CODE_VER", ID), "VER 1.001 이 남아 있다");
    }

    @Test
    void D4_두_DRAFT_중_하나를_지우면_다른_DRAFT_의_선분은_그대로다() {
        seeds.seedCode(ID, "INUSE", "MDM");
        seeds.released(ID, "1.000", PAST, OPEN_END);
        seeds.seedItem(ID, "A", "1.000", OPEN, "a1", 1);
        seeds.seedItem(ID, "B", "1.000", OPEN, "b1", 2);
        seeds.seedBase(ID);
        // 1.001(stw1)이 A 를, 1.002(stw2)가 B 를 고친 상태 — 동시 클릭으로 생긴 미적용 2개
        seeds.draft(ID, "1.001", "stw1");
        seeds.draft(ID, "1.002", "stw2");
        jdbc.update("UPDATE TB_MDM_CODE_ITEM SET TO_VER = 1.001 WHERE MARU_CODE_ID = ? AND CODE = 'A'", ID);
        seeds.seedItem(ID, "A", "1.001", OPEN, "a2", 1);
        jdbc.update("UPDATE TB_MDM_CODE_ITEM SET TO_VER = 1.002 WHERE MARU_CODE_ID = ? AND CODE = 'B'", ID);
        seeds.seedItem(ID, "B", "1.002", OPEN, "b2", 2);

        tx.executeWithoutResult(s -> versionState.deleteDraft(ref("1.001"), 0L, "stw1"));

        assertEquals(0, seeds.touching(ID, "FROM_VER", "1.001"));
        assertEquals(1, seeds.touching(ID, "FROM_VER", "1.002"), "1.002 의 새 행이 남는다");
        assertEquals(1, seeds.touching(ID, "TO_VER", "1.002"), "1.002 가 닫은 행도 그대로다");
        assertEquals("a1", jdbc.queryForObject("SELECT NAME FROM TB_MDM_CODE_ITEM WHERE CODE = 'A'", String.class));
    }

    private static VersionRef ref(String ver) {
        return new VersionRef(VersionTarget.MASTER_CODE, ID, new BigDecimal(ver));
    }
}
