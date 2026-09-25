package com.dongkuk.dmes.mdm.common.segment;

import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.OPEN;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.T0;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.count;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.insertItemRow;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.insertMaruData;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.itemRows;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.text;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.value;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentAction;
import com.dongkuk.oasis.audit.AuditHolder;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-07-03 design.md §3.2 T-C — 05 「저장 경로와 검증」 검사 순서 1~7 을 경로(SCREEN·CSV·API)별로 확인한다(C0~C6).
 * 검사 7(소속)은 {@code DataCategorySegmentCoreSqliteTest} 가 덮는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmdSegmentTestSupport.Config.class)
class DataItemChecksSqliteTest extends AbstractMdmSharedDbTest {

    private static final String PORT = "PORT";
    private static final String CUST = "CUST";
    private static final String DEP = "DEPR";
    private static final String HIER = "HIER";

    @Autowired
    DataItemSaveCore core;
    @Autowired
    MutableClock clock;
    @Autowired
    DataSource dataSource;

    private JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        DmdSegmentTestSupport.clear(jdbc);
        DmdSegmentTestSupport.insertMdm(jdbc, PORT, 1, "국가");
        insertMaruData(jdbc, CUST, "EXTERNAL", "ERP", "INUSE", DmdSegmentTestSupport.DEFAULT_PATTERN, 0, "사업자번호");
        clock.setLocal(T0);
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @AfterEach
    void clearThreadLocals() {
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    // ── C1 ──────────────────────────────────────────────────────────────────

    @Test
    void C1_DEPRECATED_마루_데이터는_모든_쓰기를_거부한다() {
        insertMaruData(jdbc, DEP, "MDM", null, "DEPRECATED", DmdSegmentTestSupport.DEFAULT_PATTERN, 0, "국가");
        insertMaruData(jdbc, "DEPX", "EXTERNAL", "ERP", "DEPRECATED", DmdSegmentTestSupport.DEFAULT_PATTERN, 0);
        insertItemRow(jdbc, DEP, "OPENK", "열림", T0.minusDays(1), OPEN, 0, null, null);
        insertItemRow(jdbc, DEP, "CLOSEDK", "닫힘", T0.minusDays(2), text(T0.minusDays(1)), 1, null, null);
        int before = count(jdbc, "TB_MDM_DATA_ITEM");

        assertRejected(DataItemMessages.DEPRECATED, () -> core.register(DEP, "NEWK", value("새")));
        assertRejected(DataItemMessages.DEPRECATED, () -> core.modify(DEP, "OPENK", value("바뀜"), 0));
        assertRejected(DataItemMessages.DEPRECATED, () -> core.close(DEP, "OPENK", 0));
        assertRejected(DataItemMessages.DEPRECATED, () -> core.reopen(DEP, "CLOSEDK", 1));
        assertRejected(DataItemMessages.DEPRECATED,
                () -> core.upsert(DEP, DataSavePath.CSV, null, List.of(new UpsertRow("NEWK", value("새"))), false));
        assertRejected(DataItemMessages.DEPRECATED,
                () -> core.upsert("DEPX", DataSavePath.API, "ERP", List.of(new UpsertRow("C9", value("새"))), false));
        assertEquals(before, count(jdbc, "TB_MDM_DATA_ITEM"));
    }

    @Test
    void C1_C2_는_즉시_거부라_다른_검사_이슈가_섞이지_않는다() {
        insertMaruData(jdbc, DEP, "MDM", null, "DEPRECATED", DmdSegmentTestSupport.DEFAULT_PATTERN, 0);
        BusinessException dep = assertThrows(BusinessException.class, () -> core.register(DEP, "bad key", value(null)));
        assertFalse(dep.getMessage().contains(DataItemMessages.KEY_PATTERN), dep.getMessage());
        assertFalse(dep.getMessage().contains(DataItemMessages.NAME_REQUIRED), dep.getMessage());

        BusinessException src = assertThrows(BusinessException.class, () -> core.register(CUST, "bad key", value(null)));
        assertTrue(src.getMessage().contains(DataItemMessages.SOURCE_MISMATCH), src.getMessage());
        assertFalse(src.getMessage().contains(DataItemMessages.NAME_REQUIRED), src.getMessage());
    }

    // ── C2 ──────────────────────────────────────────────────────────────────

    @Test
    void C2_경로와_원천이_맞아야_한다() {
        assertRejected(DataItemMessages.SOURCE_MISMATCH,
                () -> core.upsert(PORT, DataSavePath.API, null, List.of(new UpsertRow("KRPUS", value("부산"))), false));
        assertRejected(DataItemMessages.SOURCE_MISMATCH, () -> core.register(CUST, "C1", value("거래처")));
        assertRejected(DataItemMessages.SOURCE_MISMATCH,
                () -> core.upsert(CUST, DataSavePath.CSV, null, List.of(new UpsertRow("C1", value("거래처"))), false));
        assertRejected(DataItemMessages.SOURCE_MISMATCH,
                () -> core.upsert(CUST, DataSavePath.API, "MES", List.of(new UpsertRow("C1", value("거래처"))), false));
        assertEquals(0, count(jdbc, "TB_MDM_DATA_ITEM"));

        UpsertResult ok = core.upsert(CUST, DataSavePath.API, "ERP", List.of(new UpsertRow("C1", value("거래처"))), false);
        assertTrue(ok.written());
        assertEquals(List.of(MdmTemporalSegmentAction.INSERT), ok.actions());
    }

    // ── C3 ──────────────────────────────────────────────────────────────────

    @Test
    void C3_MDM_원천_키는_code_pattern_전체_일치() {
        core.register(PORT, "KRPUS", value("부산"));
        assertRejected(DataItemMessages.KEY_PATTERN, () -> core.register(PORT, "krpus", value("부산")));
        assertRejected(DataItemMessages.KEY_PATTERN, () -> core.register(PORT, "KR PUS", value("부산")));
        assertRejected(DataItemMessages.KEY_PATTERN, () -> core.register(PORT, "A".repeat(21), value("부산")));

        insertMaruData(jdbc, "KRP", "MDM", null, "INUSE", "KR.*", 0);
        core.register("KRP", "KRX", value("통과"));
        assertRejected(DataItemMessages.KEY_PATTERN, () -> core.register("KRP", "A-KRPUS", value("부분 일치")));
        assertEquals(1, count(jdbc, "TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'KRP'"));
    }

    @Test
    void C3_EXTERNAL_원천은_키_패턴을_검사하지_않는다() {
        UpsertResult r = core.upsert(CUST, DataSavePath.API, "ERP",
                List.of(new UpsertRow("c-001 x", value("소문자 키"))), false);
        assertTrue(r.written());
        assertEquals(1, itemRows(jdbc, CUST, "c-001 x").size());
    }

    // ── C4 ──────────────────────────────────────────────────────────────────

    @Test
    void C4_화면_CSV_는_이름이_필수다() {
        assertRejected(DataItemMessages.NAME_REQUIRED, () -> core.register(PORT, "KRPUS", value(null)));
        assertRejected(DataItemMessages.NAME_REQUIRED, () -> core.register(PORT, "KRPUS", value("   ")));
        core.register(PORT, "KRINC", value("인천"));
        assertRejected(DataItemMessages.NAME_REQUIRED, () -> core.modify(PORT, "KRINC", value(""), 0));

        UpsertResult csv = core.upsert(PORT, DataSavePath.CSV, null, List.of(new UpsertRow("KRPUS", value(null))), false);
        assertFalse(csv.written());
        assertTrue(hasIssue(csv.issues(), "CHK4"), csv.issues().toString());
        assertEquals(1, count(jdbc, "TB_MDM_DATA_ITEM"));
    }

    @Test
    void C4_API_는_이름을_검사하지_않지만_NOT_NULL_이라_요청_전체가_저장_오류다() {
        RuntimeException e = assertThrows(RuntimeException.class, () -> core.upsert(CUST, DataSavePath.API, "ERP",
                List.of(new UpsertRow("C1", value("정상")), new UpsertRow("C2", value(null))), false));
        assertFalse(e instanceof BusinessException, "검사 이슈가 아니라 저장 오류다: " + e);
        assertTrue(causeChain(e).contains("NAME"), "NAME NOT NULL 제약 오류여야 한다: " + causeChain(e));
        assertEquals(0, count(jdbc, "TB_MDM_DATA_ITEM"), "요청 단위로 롤백된다");
    }

    @Test
    void C6_API_는_닫힌_키를_받은_값으로_다시_연다_D12() {
        insertItemRow(jdbc, CUST, "C5", "닫힘", T0.minusDays(2), text(T0.minusDays(1)), 1, null, null);

        UpsertResult r = core.upsert(CUST, DataSavePath.API, "ERP", List.of(new UpsertRow("C5", value("다시 받음"))), false);

        assertTrue(r.written());
        assertEquals(List.of(MdmTemporalSegmentAction.REOPEN), r.actions());
        var rows = itemRows(jdbc, CUST, "C5");
        assertEquals(2, rows.size());
        assertEquals(text(T0.minusDays(1)), rows.get(0).get("VALID_TO"), "닫힌 구간 보존");
        assertEquals(text(T0), rows.get(1).get("VALID_FROM"));
        assertEquals("다시 받음", rows.get(1).get("NAME"));
        assertEquals(2, ((Number) rows.get(1).get("ROW_VERSION")).intValue());
    }

    // ── C5 ──────────────────────────────────────────────────────────────────

    @Test
    void C5_라벨_없는_칸의_값은_화면_CSV_거부_API_통과() {
        assertRejected(DataItemMessages.ATTR_NO_LABEL,
                () -> core.register(PORT, "KRPUS", value("부산", List.of(), List.of("KR", "35.1"))));
        UpsertResult csv = core.upsert(PORT, DataSavePath.CSV, null,
                List.of(new UpsertRow("KRPUS", value("부산", List.of(), List.of("KR", "35.1")))), false);
        assertFalse(csv.written());
        assertTrue(hasIssue(csv.issues(), "CHK5"), csv.issues().toString());

        UpsertResult api = core.upsert(CUST, DataSavePath.API, "ERP",
                List.of(new UpsertRow("C4", value("거래처", List.of(), java.util.Arrays.asList("123", null, "S")))), false);
        assertTrue(api.written());
        assertEquals("S", itemRows(jdbc, CUST, "C4").get(0).get("ATTR03"));
    }

    // ── C5-1 ────────────────────────────────────────────────────────────────

    @Test
    void C5_1_중간_칸_비움과_콤마_공백을_거부한다() {
        hierarchy();
        assertRejected(DataItemMessages.LVL_GAP, () -> core.register(HIER, "X1", value("x", listOf(null, "PH-A"), null)));
        assertRejected(DataItemMessages.LVL_FORMAT, () -> core.register(HIER, "X2", value("x", List.of("A,B"), null)));
        assertRejected(DataItemMessages.LVL_FORMAT, () -> core.register(HIER, "X3", value("x", List.of("A B"), null)));
    }

    @Test
    void C5_1_같은_그룹_값이_다른_앞_칸_아래면_거부_같으면_통과() {
        hierarchy();
        insertItemRow(jdbc, HIER, "PH-A-PRD", "A공장 생산팀", T0.minusDays(1), OPEN, 0, List.of("PH", "PH-A"), null);

        assertRejected(DataItemMessages.LVL_CONFLICT,
                () -> core.register(HIER, "QH-A-PRD", value("x", List.of("QH", "PH-A"), null)));
        core.register(HIER, "PH-A-MNT", value("A공장 정비팀", List.of("PH", "PH-A"), null));
        assertEquals(1, itemRows(jdbc, HIER, "PH-A-MNT").size());
    }

    @Test
    void C5_1_닫힌_키의_마지막_행도_비교한다() {
        hierarchy();
        insertItemRow(jdbc, HIER, "PH-A-PRD", "닫힌 팀", T0.minusDays(2), text(T0.minusDays(1)), 1, List.of("PH", "PH-A"),
                null);

        assertRejected(DataItemMessages.LVL_CONFLICT,
                () -> core.register(HIER, "QH-A-PRD", value("x", List.of("QH", "PH-A"), null)));
    }

    @Test
    void C5_1_내_키가_다른_행의_그룹이면_앞_칸이_같아야_한다() {
        hierarchy();
        insertItemRow(jdbc, HIER, "PH-A-PRD", "A공장 생산팀", T0.minusDays(1), OPEN, 0, List.of("PH", "PH-A"), null);

        assertRejected(DataItemMessages.LVL_CONFLICT, () -> core.register(HIER, "PH-A", value("A공장", List.of("QH"), null)));
        core.register(HIER, "PH-A", value("A공장", List.of("PH"), null));
        assertEquals(1, itemRows(jdbc, HIER, "PH-A").size());
    }

    @Test
    void C5_1_그룹_값이_다른_항목의_키면_그_항목의_상위와_같아야_한다() {
        hierarchy();
        insertItemRow(jdbc, HIER, "PH-B", "B공장", T0.minusDays(1), OPEN, 0, List.of("PH"), null);

        assertRejected(DataItemMessages.LVL_CONFLICT,
                () -> core.register(HIER, "PH-B-PRD", value("x", List.of("QH", "PH-B"), null)));
        core.register(HIER, "PH-B-PRD", value("B공장 생산팀", List.of("PH", "PH-B"), null));
    }

    @Test
    void C5_1_다시_열기도_계층_검사를_돈다() {
        hierarchy();
        insertItemRow(jdbc, HIER, "PH-A-PRD", "열린 팀", T0.minusDays(1), OPEN, 0, List.of("PH", "PH-A"), null);
        insertItemRow(jdbc, HIER, "QH-A-PRD", "닫힌 팀", T0.minusDays(3), text(T0.minusDays(2)), 1, List.of("QH", "PH-A"),
                null);

        assertRejected(DataItemMessages.LVL_CONFLICT, () -> core.reopen(HIER, "QH-A-PRD", 1));
        assertEquals(1, itemRows(jdbc, HIER, "QH-A-PRD").size());
    }

    // ── C5-2 ────────────────────────────────────────────────────────────────

    @Test
    void C5_2_lvl_cnt_보다_뒤_칸의_값은_거부한다() {
        core.register(PORT, "KRPUS", value("부산", List.of("KR"), null));
        assertRejected(DataItemMessages.LVL_OVER_COUNT,
                () -> core.register(PORT, "KRINC", value("인천", List.of("KR", "KR-S"), null)));
    }

    // ── C6 ──────────────────────────────────────────────────────────────────

    @Test
    void C6_CSV_upsert_는_INSERT_UPDATE_NONE_을_가른다() {
        insertItemRow(jdbc, PORT, "AAA", "같음", T0.minusDays(1), OPEN, 0, null, List.of("KR"));
        insertItemRow(jdbc, PORT, "BBB", "옛 이름", T0.minusDays(1), OPEN, 0, null, null);

        UpsertResult r = core.upsert(PORT, DataSavePath.CSV, null, List.of(
                new UpsertRow("AAA", value("같음", List.of(), List.of("KR"))),
                new UpsertRow("BBB", value("새 이름")),
                new UpsertRow("DDD", value("신규"))), false);

        assertTrue(r.written());
        assertEquals(List.of(MdmTemporalSegmentAction.NONE, MdmTemporalSegmentAction.UPDATE,
                MdmTemporalSegmentAction.INSERT), r.actions());
        assertEquals(1, itemRows(jdbc, PORT, "AAA").size());
        assertEquals(2, itemRows(jdbc, PORT, "BBB").size());
        assertEquals(1, itemRows(jdbc, PORT, "DDD").size());
    }

    @Test
    void C6_CSV_는_닫힌_키를_다시_열지_않고_거부한다() {
        insertItemRow(jdbc, PORT, "CCC", "닫힘", T0.minusDays(2), text(T0.minusDays(1)), 1, null, null);

        UpsertResult r = core.upsert(PORT, DataSavePath.CSV, null, List.of(new UpsertRow("CCC", value("다시"))), false);

        assertFalse(r.written());
        assertTrue(hasIssue(r.issues(), "CHK6"), r.issues().toString());
        assertEquals(1, itemRows(jdbc, PORT, "CCC").size());
    }

    // ── 순서·원자성 ──────────────────────────────────────────────────────────

    @Test
    void C3_C6_은_모아서_한_번에_거부한다() {
        BusinessException e = assertThrows(BusinessException.class,
                () -> core.register(PORT, "bad key", value(null, List.of(), List.of("KR", "위도"))));
        assertTrue(e.getMessage().contains(DataItemMessages.KEY_PATTERN), e.getMessage());
        assertTrue(e.getMessage().contains(DataItemMessages.NAME_REQUIRED), e.getMessage());
        assertTrue(e.getMessage().contains(DataItemMessages.ATTR_NO_LABEL), e.getMessage());
    }

    @Test
    void upsert_는_한_행이라도_이슈가_있으면_아무_행도_쓰지_않는다() {
        List<UpsertRow> rows = new ArrayList<>();
        for (int i = 0; i < 9; i++) {
            rows.add(new UpsertRow("P" + i, value("항구" + i)));
        }
        rows.add(new UpsertRow("bad", value("나쁜 키")));

        UpsertResult r = core.upsert(PORT, DataSavePath.CSV, null, rows, false);

        assertFalse(r.written());
        assertEquals(1, r.issues().size(), r.issues().toString());
        assertEquals("CHK3", r.issues().get(0).code());
        assertEquals(0, count(jdbc, "TB_MDM_DATA_ITEM"));
    }

    @Test
    void upsert_dryRun_은_이슈가_없어도_쓰지_않고_예정_동작만_돌려준다() {
        UpsertResult r = core.upsert(PORT, DataSavePath.CSV, null,
                List.of(new UpsertRow("P1", value("a")), new UpsertRow("P2", value("b"))), true);

        assertFalse(r.written());
        assertTrue(r.issues().isEmpty());
        assertEquals(List.of(MdmTemporalSegmentAction.INSERT, MdmTemporalSegmentAction.INSERT), r.actions());
        assertEquals(0, count(jdbc, "TB_MDM_DATA_ITEM"));
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    /** 계층 3칸, 키 패턴이 '-' 를 허용하는 마루 데이터(05 ORG 예). */
    private void hierarchy() {
        insertMaruData(jdbc, HIER, "MDM", null, "INUSE", "^[0-9A-Z-]{1,20}$", 3);
    }

    private static List<String> listOf(String... values) {
        return new ArrayList<>(java.util.Arrays.asList(values));
    }

    private static String causeChain(Throwable e) {
        StringBuilder sb = new StringBuilder();
        for (Throwable t = e; t != null; t = t.getCause()) {
            sb.append(t.getMessage()).append(" | ");
        }
        return sb.toString();
    }

    private static boolean hasIssue(List<MdmCheckIssue> issues, String code) {
        return issues.stream().anyMatch(i -> code.equals(i.code()));
    }

    private static void assertRejected(String text, Executable call) {
        BusinessException e = assertThrows(BusinessException.class, call);
        assertTrue(e.getMessage().contains(text), "기대 문구 [" + text + "] 실제: " + e.getMessage());
    }
}
