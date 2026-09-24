package com.dongkuk.dmes.mdm.common.segment;

import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.OPEN;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.T0;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.insertCateRow;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.insertItemRow;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.text;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentAction;
import com.dongkuk.oasis.audit.AuditHolder;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-07-03 design.md §3.2 T-K — 카테고리·소속 선분(S1·S6·S7 을 CATE 에), BASE 가드(S14), 소속 검사 7(C7).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmdSegmentTestSupport.Config.class)
class DataCategorySegmentCoreSqliteTest {

    private static final String MD = "PORT";
    private static final DataCateValue KR = new DataCateValue("한국 항구", "REGEX", "^KR$", "ATTR01", null);
    private static final DataCateValue BASE = new DataCateValue("전체", "REGEX", ".*", "KEY", null);
    private static final DataCateValue TABLE = new DataCateValue("주요 항구", "TABLE", null, null, null);

    @TempDir
    static Path tempDir;

    @Autowired
    DataCategorySegmentCore core;
    @Autowired
    MutableClock clock;
    @Autowired
    DataSource dataSource;

    private JdbcTemplate jdbc;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + tempDir.resolve("mdm-dmd-segment-cate.db"));
    }

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        DmdSegmentTestSupport.clear(jdbc);
        DmdSegmentTestSupport.insertMdm(jdbc, MD, 1, "국가");
        insertItemRow(jdbc, MD, "KRPUS", "부산", T0.minusDays(3), OPEN, 0, null, List.of("KR"));
        insertItemRow(jdbc, MD, "KRINC", "인천", T0.minusDays(3), text(T0.minusDays(1)), 1, null, List.of("KR"));
        clock.setLocal(T0);
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @AfterEach
    void clearThreadLocals() {
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @Test
    void 카테고리_등록_수정_닫기_다시_열기_선분() {
        assertEquals(MdmTemporalSegmentAction.INSERT, core.registerCate(MD, "KR", KR).action());
        LocalDateTime t2 = T0.plusMinutes(1);
        clock.setLocal(t2);
        DataCateValue renamed = new DataCateValue("한국 항구들", "REGEX", "^KR$", "ATTR01", null);
        assertEquals(MdmTemporalSegmentAction.UPDATE, core.modifyCate(MD, "KR", renamed).action());
        clock.setLocal(t2.plusMinutes(1));
        assertEquals(MdmTemporalSegmentAction.NONE, core.modifyCate(MD, "KR", renamed).action(), "값이 같으면 새 행 없음");
        LocalDateTime t3 = T0.plusMinutes(3);
        clock.setLocal(t3);
        assertEquals(MdmTemporalSegmentAction.CLOSE, core.closeCate(MD, "KR").action());
        LocalDateTime t4 = T0.plusMinutes(4);
        clock.setLocal(t4);
        assertEquals(MdmTemporalSegmentAction.REOPEN, core.reopenCate(MD, "KR").action());

        List<Map<String, Object>> rows = cateRows("KR");
        assertEquals(3, rows.size());
        assertEquals(text(T0), rows.get(0).get("VALID_FROM"));
        assertEquals(text(t2), rows.get(0).get("VALID_TO"));
        assertEquals(text(t2), rows.get(1).get("VALID_FROM"));
        assertEquals(text(t3), rows.get(1).get("VALID_TO"), "닫힌 구간 보존");
        assertEquals(text(t4), rows.get(2).get("VALID_FROM"));
        assertEquals(OPEN, rows.get(2).get("VALID_TO"));
        assertEquals("한국 항구들", rows.get(2).get("CATE_NAME"), "다시 열기는 마지막 값 복사");
        assertEquals(0, ((Number) rows.get(2).get("CHG_SEQ")).intValue());
    }

    @Test
    void 카테고리_등록은_열린_키_닫힌_키를_거부한다() {
        core.registerCate(MD, "KR", KR);
        assertRejected(DataItemMessages.KEY_EXISTS, () -> core.registerCate(MD, "KR", KR));
        clock.setLocal(T0.plusMinutes(1));
        core.closeCate(MD, "KR");
        assertRejected(DataItemMessages.CLOSED_KEY_REOPEN, () -> core.registerCate(MD, "KR", KR));
    }

    @Test
    void 카테고리_정의_형식을_검사한다() {
        assertRejected(DataItemMessages.CATE_DEF_INVALID,
                () -> core.registerCate(MD, "R1", new DataCateValue("x", "REGEX", null, "KEY", null)));
        assertRejected(DataItemMessages.CATE_DEF_INVALID,
                () -> core.registerCate(MD, "R2", new DataCateValue("x", "REGEX", "[", "KEY", null)));
        assertRejected(DataItemMessages.CATE_DEF_INVALID,
                () -> core.registerCate(MD, "R3", new DataCateValue("x", "TABLE", ".*", "KEY", null)));
        assertRejected(DataItemMessages.CATE_DEF_INVALID,
                () -> core.registerCate(MD, "R4", new DataCateValue("x", "LIST", null, null, null)));
        assertEquals(0, DmdSegmentTestSupport.count(jdbc, "TB_MDM_DATA_CATE"));
    }

    @Test
    void S14_BASE_는_수정_닫기를_거부한다() {
        core.registerCate(MD, "BASE", BASE);
        clock.setLocal(T0.plusMinutes(1));

        assertReserved(() -> core.modifyCate(MD, "BASE", new DataCateValue("바꿈", "REGEX", ".*", "KEY", null)));
        assertReserved(() -> core.closeCate(MD, "BASE"));
        List<Map<String, Object>> rows = cateRows("BASE");
        assertEquals(1, rows.size());
        assertEquals(OPEN, rows.get(0).get("VALID_TO"));
    }

    @Test
    void C7_소속은_항목_열림_카테고리_열림_TABLE_일_때만() {
        core.registerCate(MD, "MAJOR", TABLE);
        core.registerCate(MD, "KR", KR);
        insertCateRow(jdbc, MD, "OLD", "TABLE", null, null, T0.minusDays(3), text(T0.minusDays(1)));
        clock.setLocal(T0.plusMinutes(1));

        assertRejected(DataItemMessages.MEMBER_NOT_ALLOWED, () -> core.addMember(MD, "MAJOR", "KRINC"));
        assertRejected(DataItemMessages.MEMBER_NOT_ALLOWED, () -> core.addMember(MD, "MAJOR", "NOPE"));
        assertRejected(DataItemMessages.MEMBER_NOT_ALLOWED, () -> core.addMember(MD, "KR", "KRPUS"));
        assertRejected(DataItemMessages.MEMBER_NOT_ALLOWED, () -> core.addMember(MD, "OLD", "KRPUS"));
        assertRejected(DataItemMessages.MEMBER_NOT_ALLOWED, () -> core.addMember(MD, "NONE", "KRPUS"));
        assertEquals(0, DmdSegmentTestSupport.count(jdbc, "TB_MDM_DATA_CATE_ITEM"));

        assertEquals(MdmTemporalSegmentAction.INSERT, core.addMember(MD, "MAJOR", "KRPUS").action());
        assertRejected(DataItemMessages.ALREADY_OPEN, () -> core.addMember(MD, "MAJOR", "KRPUS"));
    }

    @Test
    void 소속_해제는_닫기_다시_소속은_새_행_닫힌_카테고리의_소속은_그대로() {
        core.registerCate(MD, "MAJOR", TABLE);
        LocalDateTime t1 = T0.plusMinutes(1);
        clock.setLocal(t1);
        core.addMember(MD, "MAJOR", "KRPUS");
        LocalDateTime t2 = T0.plusMinutes(2);
        clock.setLocal(t2);
        assertEquals(MdmTemporalSegmentAction.CLOSE, core.removeMember(MD, "MAJOR", "KRPUS").action());
        assertRejected(DataItemMessages.NOT_OPEN, () -> core.removeMember(MD, "MAJOR", "KRPUS"));
        LocalDateTime t3 = T0.plusMinutes(3);
        clock.setLocal(t3);
        assertEquals(MdmTemporalSegmentAction.REOPEN, core.addMember(MD, "MAJOR", "KRPUS").action());

        List<Map<String, Object>> members = memberRows("MAJOR", "KRPUS");
        assertEquals(2, members.size());
        assertEquals(text(t2), members.get(0).get("VALID_TO"));
        assertEquals(text(t3), members.get(1).get("VALID_FROM"));
        assertEquals(OPEN, members.get(1).get("VALID_TO"));

        clock.setLocal(T0.plusMinutes(4));
        core.closeCate(MD, "MAJOR");
        assertEquals(OPEN, memberRows("MAJOR", "KRPUS").get(1).get("VALID_TO"), "닫힌 카테고리의 소속 행은 그대로(05)");
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private List<Map<String, Object>> cateRows(String cateId) {
        return jdbc.queryForList("SELECT * FROM TB_MDM_DATA_CATE WHERE MARU_DATA_ID = ? AND CATE_ID = ? ORDER BY VALID_FROM",
                MD, cateId);
    }

    private List<Map<String, Object>> memberRows(String cateId, String code) {
        return jdbc.queryForList("SELECT * FROM TB_MDM_DATA_CATE_ITEM WHERE MARU_DATA_ID = ? AND CATE_ID = ? AND CODE = ? "
                + "ORDER BY VALID_FROM", MD, cateId, code);
    }

    private static void assertReserved(Executable call) {
        BusinessException e = assertThrows(BusinessException.class, call);
        assertTrue(e.getMessage().startsWith(MdmErrorCode.RESERVED_CATEGORY.defaultMessage()), e.getMessage());
    }

    private static void assertRejected(String text, Executable call) {
        BusinessException e = assertThrows(BusinessException.class, call);
        assertTrue(e.getMessage().contains(text), "기대 문구 [" + text + "] 실제: " + e.getMessage());
    }
}
