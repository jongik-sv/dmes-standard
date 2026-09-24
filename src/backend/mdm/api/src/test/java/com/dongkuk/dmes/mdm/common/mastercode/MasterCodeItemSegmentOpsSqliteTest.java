package com.dongkuk.dmes.mdm.common.mastercode;

import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures.OPEN;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures.OPEN_END;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefinition;
import com.dongkuk.dmes.mdm.contract.category.CategoryKind;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCateItemRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCateRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemValues;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentKey;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentService;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentTable;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeVersionView;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-06-03 design.md §4.3 G1~G20 — 선분 조작({@link MasterCodeSegmentService} 의 06-03 몫)을 실제 V9 표로 local(SQLite)
 * 컨텍스트에서 돌린다. 서비스는 계약 인터페이스 타입으로 주입해 부르고(계약 경유 증명), 트랜잭션 없이 부른다 — 쓰기는
 * 리포지토리 save·delete 를 명시적으로 불러야 반영된다(§6.2). 단언은 JdbcTemplate(새 연결)으로 표를 직접 읽는다.
 *
 * <p>기본 시드: 마루 코드 {@code M}(lvl_cnt 2), 1.000 RELEASED(행 A·B·C), 1.001 DRAFT(소유자 kim, row_version 5).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(MasterCodeTestConfig.class)
class MasterCodeItemSegmentOpsSqliteTest {

    private static final BigDecimal V1_000 = new BigDecimal("1.000");
    private static final BigDecimal V1_001 = new BigDecimal("1.001");
    private static final BigDecimal V1_002 = new BigDecimal("1.002");
    private static final VersionRef RELEASED = ref(V1_000);
    private static final VersionRef DRAFT = ref(V1_001);
    private static final long SEED_ROW_VERSION = 5L;

    @TempDir
    static Path tempDir;

    @Autowired
    MasterCodeSegmentService segments;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    DataSource dataSource;

    private MasterCodeFixtures fx;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-master-code-segment-ops-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void seed() {
        fx = new MasterCodeFixtures(new JdbcTemplate(dataSource));
        fx.clear();
        currentUser.set("kim", Set.of(MdmRoles.STEWARD));
        fx.seedCode("M", "시험 코드", "MDM", 2);
        fx.seedVersion("M", "1.000", "RELEASED", "kim", "2026-01-01 00:00:00", OPEN_END, 0);
        fx.seedVersion("M", "1.001", "DRAFT", "kim", null, null, SEED_ROW_VERSION);
        fx.seedItem("M", "A", "1.000", OPEN, "에이", null, 1, null, "G");
        fx.seedItem("M", "B", "1.000", OPEN, "비", null, 2, null, "G");
        fx.seedItem("M", "C", "1.000", OPEN, "씨", null, 3, null, "H");
    }

    // ── G1~G6 행 조작 ────────────────────────────────────────────────────

    @Test
    void G1_추가는_from_V_to_9999_새_행() {
        segments.addItem(DRAFT, "D", values("디", 4, "G"));

        assertEquals(List.of("A@1.000-9999", "B@1.000-9999", "C@1.000-9999", "D@1.001-9999"), fx.itemSegments("M"));
        assertEquals("디", name("D", "1.001"));
    }

    @Test
    void G1b_V_에_이미_있는_코드를_addItem_으로_다시_넣으면_SEGMENT_OVERLAP() {
        BusinessException e = assertThrows(BusinessException.class, () -> segments.addItem(DRAFT, "A", values("x", 1, "G")));

        assertMdm(MdmErrorCode.CODE_SAVE_REJECTED, e);
        assertTrue(e.getMessage().contains("SEGMENT_OVERLAP"), e.getMessage());
        assertEquals(List.of("A@1.000-9999", "B@1.000-9999", "C@1.000-9999"), fx.itemSegments("M"));
    }

    @Test
    void G2_수정은_옛_행을_V_로_닫고_새_행을_넣으며_옛_값은_그대로다() {
        segments.changeItem(DRAFT, "A", values("새 에이", 1, "G"));

        assertEquals(List.of("A@1.000-1.001", "A@1.001-9999", "B@1.000-9999", "C@1.000-9999"), fx.itemSegments("M"));
        assertEquals("에이", name("A", "1.000"));
        assertEquals("새 에이", name("A", "1.001"));
    }

    @Test
    void G3_V_에서_두_번_고치면_from_V_행을_직접_갱신한다() {
        segments.changeItem(DRAFT, "A", values("새 에이", 1, "G"));
        segments.changeItem(DRAFT, "A", values("또 새 에이", 1, "G"));

        assertEquals(List.of("A@1.000-1.001", "A@1.001-9999", "B@1.000-9999", "C@1.000-9999"), fx.itemSegments("M"));
        assertEquals("또 새 에이", name("A", "1.001"));
        assertEquals("에이", name("A", "1.000"));
    }

    @Test
    void G4_삭제는_to_V_로_닫고_행_수는_그대로다() {
        List<String> closed = segments.removeItem(DRAFT, "B");

        assertEquals(List.of(), closed);
        assertEquals(List.of("A@1.000-9999", "B@1.000-1.001", "C@1.000-9999"), fx.itemSegments("M"));
    }

    @Test
    void G5_V_에서_추가한_행을_삭제하면_지운다() {
        segments.addItem(DRAFT, "D", values("디", 4, "G"));
        segments.removeItem(DRAFT, "D");

        assertEquals(List.of("A@1.000-9999", "B@1.000-9999", "C@1.000-9999"), fx.itemSegments("M"));
    }

    @Test
    void G6_수정_뒤_삭제는_V_행을_지우고_옛_행은_닫힌_채_둔다() {
        segments.changeItem(DRAFT, "A", values("새 에이", 1, "G"));
        segments.removeItem(DRAFT, "A");

        assertEquals(List.of("A@1.000-1.001", "B@1.000-9999", "C@1.000-9999"), fx.itemSegments("M"));
    }

    // ── G7~G10 되돌리기 ──────────────────────────────────────────────────

    @Test
    void G7_추가_되돌리기는_V_행을_지운다() {
        segments.addItem(DRAFT, "D", values("디", 4, "G"));
        segments.revert(DRAFT, itemKey("D"));

        assertEquals(List.of("A@1.000-9999", "B@1.000-9999", "C@1.000-9999"), fx.itemSegments("M"));
    }

    @Test
    void G8_수정_되돌리기는_V_행을_지우고_옛_행을_9999_로_연다() {
        segments.changeItem(DRAFT, "A", values("새 에이", 1, "G"));
        segments.revert(DRAFT, itemKey("A"));

        assertEquals(List.of("A@1.000-9999", "B@1.000-9999", "C@1.000-9999"), fx.itemSegments("M"));
        assertEquals("에이", name("A", "1.000"));
    }

    @Test
    void G9_삭제_되돌리기는_9999_로_연다() {
        segments.removeItem(DRAFT, "B");
        segments.revert(DRAFT, itemKey("B"));

        assertEquals(List.of("A@1.000-9999", "B@1.000-9999", "C@1.000-9999"), fx.itemSegments("M"));
    }

    @Test
    void G10_되돌릴_변경이_없으면_MDM021_이고_아무것도_바꾸지_않는다() {
        BusinessException e = assertThrows(BusinessException.class, () -> segments.revert(DRAFT, itemKey("C")));

        assertMdm(MdmErrorCode.INVALID_INPUT, e);
        assertEquals(List.of("A@1.000-9999", "B@1.000-9999", "C@1.000-9999"), fx.itemSegments("M"));
    }

    // ── G11~G15 카테고리 연쇄 ─────────────────────────────────────────────

    @Test
    void G11_코드_삭제는_V_에_유효한_CATE_ITEM_을_닫거나_지우고_영향_카테고리를_돌려준다() {
        seedCascade(false);

        List<String> closed = segments.removeItem(DRAFT, "B");

        assertEquals(List.of("T1", "T2", "T3"), closed);
        assertEquals(List.of("T1 A@1.000-9999", "T1 B@1.000-1.001", "T2 B@1.000-1.001"), fx.cateItemSegments("M"));
    }

    @Test
    void G12_코드_수정은_CATE_ITEM_을_건드리지_않는다() {
        seedCascade(false);
        List<String> before = fx.cateItemSegments("M");

        segments.changeItem(DRAFT, "B", values("새 비", 2, "G"));

        assertEquals(before, fx.cateItemSegments("M"));
    }

    @Test
    void G13_삭제_되돌리기는_카테고리가_V_에_유효한_CATE_ITEM_만_다시_연다() {
        seedCascade(false);
        segments.removeItem(DRAFT, "B");

        segments.revert(DRAFT, itemKey("B"));

        assertEquals(List.of("T1 A@1.000-9999", "T1 B@1.000-9999", "T2 B@1.000-9999"), fx.cateItemSegments("M"),
                "T3 의 B@1.001 은 지워졌으므로 되살리지 않는다");
        assertEquals(List.of("A@1.000-9999", "B@1.000-9999", "C@1.000-9999"), fx.itemSegments("M"));
    }

    @Test
    void G13b_카테고리가_V_에서_닫혔으면_그_소속은_다시_열지_않는다() {
        seedCascade(true);
        segments.removeItem(DRAFT, "B");

        segments.revert(DRAFT, itemKey("B"));

        assertEquals(List.of("T1 A@1.000-9999", "T1 B@1.000-9999", "T2 B@1.000-1.001"), fx.cateItemSegments("M"));
    }

    @Test
    void G14_CATE_ITEM_되돌리기는_추가_삭제_규칙대로다() {
        seedCascade(false);
        segments.removeItem(DRAFT, "B");

        segments.revert(DRAFT, new MasterCodeSegmentKey(MasterCodeSegmentTable.CATE_ITEM, "T1", "B"));

        assertEquals(List.of("T1 A@1.000-9999", "T1 B@1.000-9999", "T2 B@1.000-1.001"), fx.cateItemSegments("M"));
        assertEquals(List.of("A@1.000-9999", "B@1.000-1.001", "C@1.000-9999"), fx.itemSegments("M"),
                "코드 행은 닫힌 채다");

        fx.seedCateItem("M", "T1", "C", "1.001", OPEN);
        segments.revert(DRAFT, new MasterCodeSegmentKey(MasterCodeSegmentTable.CATE_ITEM, "T1", "C"));
        assertEquals(List.of("T1 A@1.000-9999", "T1 B@1.000-9999", "T2 B@1.000-1.001"), fx.cateItemSegments("M"),
                "V 에서 넣은 소속은 지운다");
    }

    // ── G16·G17 DRAFT 전용·ROW_VERSION 불변 ───────────────────────────────

    @Test
    void G16_RELEASED_와_CANCELLED_버전에는_모든_조작이_MDM002_이고_행이_그대로다() {
        fx.seedVersion("M", "1.002", "CANCELLED", "kim", "2026-08-01 00:00:00", "2026-09-01 00:00:00", 0);
        List<String> before = fx.itemSegments("M");

        for (VersionRef v : List.of(RELEASED, ref(V1_002))) {
            assertMdm(MdmErrorCode.NOT_DRAFT, assertThrows(BusinessException.class,
                    () -> segments.addItem(v, "D", values("디", 4, "G"))));
            assertMdm(MdmErrorCode.NOT_DRAFT, assertThrows(BusinessException.class,
                    () -> segments.changeItem(v, "A", values("x", 1, "G"))));
            assertMdm(MdmErrorCode.NOT_DRAFT, assertThrows(BusinessException.class,
                    () -> segments.removeItem(v, "B")));
            assertMdm(MdmErrorCode.NOT_DRAFT, assertThrows(BusinessException.class,
                    () -> segments.revert(v, itemKey("A"))));
        }
        assertEquals(before, fx.itemSegments("M"));
    }

    @Test
    void G17_선분_조작은_ROW_VERSION_을_바꾸지_않는다() {
        seedCascade(false);

        segments.addItem(DRAFT, "D", values("디", 4, "G"));
        segments.changeItem(DRAFT, "A", values("새 에이", 1, "G"));
        segments.changeItem(DRAFT, "A", values("또 새 에이", 1, "G"));
        segments.removeItem(DRAFT, "B");
        segments.removeItem(DRAFT, "D");
        segments.revert(DRAFT, itemKey("A"));
        segments.revert(DRAFT, itemKey("B"));
        segments.removeItem(DRAFT, "C");
        segments.revert(DRAFT, itemKey("C"));

        assertEquals(SEED_ROW_VERSION, fx.rowVersion("M", "1.001"));
        assertEquals(0L, fx.rowVersion("M", "1.000"));
    }

    // ── G18 모습 ─────────────────────────────────────────────────────────

    @Test
    void G18_V_의_모습은_from_이하_V_미만_to_인_행이다() {
        seedCascade(false);
        segments.removeItem(DRAFT, "B");
        segments.addItem(DRAFT, "D", values("디", 4, "G"));

        MasterCodeVersionView at1000 = segments.viewAt(RELEASED);
        MasterCodeVersionView at1001 = segments.viewAt(DRAFT);

        assertEquals(List.of("A", "B", "C"), at1000.items().stream().map(MasterCodeItemRow::code).toList());
        assertEquals(List.of("A", "C", "D"), at1001.items().stream().map(MasterCodeItemRow::code).toList());
        assertEquals(List.of("T1 A", "T1 B", "T2 B"), cateItems(at1000));
        assertEquals(List.of("T1 A"), cateItems(at1001));
        assertEquals(List.of("R", "T1", "T2", "T3"),
                at1001.categories().stream().map(c -> c.definition().cateId()).sorted().toList());
        MasterCodeCateRow r = at1001.categories().stream().filter(c -> c.definition().cateId().equals("R")).findFirst()
                .orElseThrow();
        assertEquals(new CategoryDefinition("R", "정규식", CategoryKind.REGEX, "[AB]",
                com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget.CODE, null), r.definition());
        assertEquals(0, at1001.items().get(0).fromVer().compareTo(V1_000));
    }

    @Test
    void G18b_코드는_seq_null_마지막_그다음_코드_순이다() {
        fx.seedItem("M", "0", "1.000", OPEN, "영", null, null, null, "G");
        fx.seedItem("M", "Z", "1.000", OPEN, "제트", null, 1, null, "G");

        assertEquals(List.of("A", "Z", "B", "C", "0"),
                segments.viewAt(RELEASED).items().stream().map(MasterCodeItemRow::code).toList());
    }

    // ── G19 값이 같은 수정 ───────────────────────────────────────────────

    @Test
    void G19_값이_같은_수정은_선분을_만들지_않고_옛_값으로_돌아오면_수정을_되돌린다() {
        segments.changeItem(DRAFT, "A", values("에이", 1, "G"));
        assertEquals(List.of("A@1.000-9999", "B@1.000-9999", "C@1.000-9999"), fx.itemSegments("M"));

        segments.changeItem(DRAFT, "A", values("새 에이", 1, "G"));
        segments.changeItem(DRAFT, "A", values("에이", 1, "G"));
        assertEquals(List.of("A@1.000-9999", "B@1.000-9999", "C@1.000-9999"), fx.itemSegments("M"));
    }

    // ── G20 남의 메서드 ──────────────────────────────────────────────────

    @Test
    void G20_남의_메서드는_담당_Task_를_적은_UnsupportedOperationException() {
        assertUnsupported("TSK-06-02", () -> segments.createBaseCategory(DRAFT));
        assertUnsupported("TSK-06-02", () -> segments.fillFrom(DRAFT, V1_000));
    }

    @Test
    void 값_목록_길이가_틀리면_IllegalArgumentException() {
        MasterCodeItemValues bad = new MasterCodeItemValues("x", null, 1, null, Arrays.asList(new String[4]),
                Arrays.asList(new String[10]));

        assertThrows(IllegalArgumentException.class, () -> segments.addItem(DRAFT, "D", bad));
    }

    // ── helpers ─────────────────────────────────────────────────────────

    /**
     * TABLE T1(A·B@1.000), T2(B@1.000), T3(B@1.001 — 이 DRAFT 에서 넣은 소속), REGEX R. closeT2 면 T2 의 CATE 행을
     * 1.001 로 닫아 둔다(G13b).
     */
    private void seedCascade(boolean closeT2) {
        fx.seedCate("M", "T1", "1.000", OPEN, "표1", "TABLE", null, null);
        fx.seedCate("M", "T2", "1.000", closeT2 ? "1.001" : OPEN, "표2", "TABLE", null, null);
        fx.seedCate("M", "T3", "1.000", OPEN, "표3", "TABLE", null, null);
        fx.seedCate("M", "R", "1.000", OPEN, "정규식", "REGEX", "[AB]", "CODE");
        fx.seedCateItem("M", "T1", "A", "1.000", OPEN);
        fx.seedCateItem("M", "T1", "B", "1.000", OPEN);
        fx.seedCateItem("M", "T2", "B", "1.000", OPEN);
        fx.seedCateItem("M", "T3", "B", "1.001", OPEN);
    }

    private String name(String code, String from) {
        return new JdbcTemplate(dataSource).query("SELECT FROM_VER, NAME FROM TB_MDM_CODE_ITEM WHERE MARU_CODE_ID = 'M' "
                                + "AND CODE = ?", (rs, i) -> new Object[]{rs.getBigDecimal(1), rs.getString(2)}, code)
                .stream().filter(r -> MasterCodeFixtures.fmt((BigDecimal) r[0]).equals(from)).map(r -> (String) r[1])
                .findFirst().orElseThrow(() -> new AssertionError(code + "@" + from + " 없음"));
    }

    private static List<String> cateItems(MasterCodeVersionView view) {
        return view.cateItems().stream().map((MasterCodeCateItemRow r) -> r.cateId() + " " + r.code()).sorted().toList();
    }

    private static MasterCodeItemValues values(String name, Integer seq, String lvl1) {
        List<String> lvls = new ArrayList<>(Arrays.asList(new String[5]));
        lvls.set(0, lvl1);
        return new MasterCodeItemValues(name, null, seq, null, lvls, Arrays.asList(new String[10]));
    }

    private static MasterCodeSegmentKey itemKey(String code) {
        return new MasterCodeSegmentKey(MasterCodeSegmentTable.ITEM, null, code);
    }

    private static VersionRef ref(BigDecimal ver) {
        return new VersionRef(VersionTarget.MASTER_CODE, "M", ver);
    }

    private static void assertMdm(MdmErrorCode code, BusinessException e) {
        assertEquals(code.code(), e.getErrors().get(0).code(), e.getMessage());
    }

    private static void assertUnsupported(String task, org.junit.jupiter.api.function.Executable call) {
        UnsupportedOperationException e = assertThrows(UnsupportedOperationException.class, call);
        assertTrue(e.getMessage() != null && e.getMessage().contains(task), String.valueOf(e.getMessage()));
    }
}
