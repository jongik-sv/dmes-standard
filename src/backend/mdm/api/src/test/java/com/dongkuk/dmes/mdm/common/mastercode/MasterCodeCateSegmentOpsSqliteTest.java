package com.dongkuk.dmes.mdm.common.mastercode;

import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures.OPEN;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures.OPEN_END;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefinition;
import com.dongkuk.dmes.mdm.contract.category.CategoryKind;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentKey;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentService;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentTable;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
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
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-06-04 design.md §5 불변 규칙 1·2·3·5·7·9·10·11·12·13·14 — 카테고리·TABLE 소속 선분 조작({@link MasterCodeCateSegmentOps},
 * {@link MasterCodeSegmentService} 의 06-04 몫)을 실제 V9 표로 local(SQLite) 컨텍스트에서 돌린다.
 * {@link MasterCodeItemSegmentOpsSqliteTest} 자매 — 계약 인터페이스로 주입해 부르고(계약 경유 증명), 트랜잭션 없이 부른다.
 *
 * <p>기본 시드: 마루 코드 {@code M}(lvl_cnt 2), 1.000 RELEASED(행 A·B·C), 1.001 DRAFT(소유자 kim, row_version 5).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(MasterCodeTestConfig.class)
class MasterCodeCateSegmentOpsSqliteTest {

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
        Path dbFile = tempDir.resolve("mdm-master-code-cate-segment-ops-test.db");
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

    // ── 카테고리 추가·수정 ──────────────────────────────────────────────

    @Test
    void 추가는_from_V_to_9999_새_행() {
        segments.addCategory(DRAFT, def("T1", "표1", CategoryKind.TABLE, null, null));

        assertEquals(List.of("T1@1.001-9999"), fx.cateSegments("M"));
    }

    @Test
    void 이미_있는_cate_id_addCategory_거부() {
        fx.seedCate("M", "T1", "1.000", OPEN, "표1", "TABLE", null, null);

        BusinessException e = assertThrows(BusinessException.class,
                () -> segments.addCategory(DRAFT, def("T1", "표1 재추가", CategoryKind.TABLE, null, null)));

        assertMdm(MdmErrorCode.CODE_SAVE_REJECTED, e);
        assertTrue(e.getMessage().contains("CATE_ID_OVERLAP"), e.getMessage());
        assertEquals(List.of("T1@1.000-9999"), fx.cateSegments("M"));
    }

    @Test
    void cate_id_금지문자_거부() {
        BusinessException e = assertThrows(BusinessException.class,
                () -> segments.addCategory(DRAFT, def("T 1", "표1", CategoryKind.TABLE, null, null)));

        assertMdm(MdmErrorCode.CODE_SAVE_REJECTED, e);
        assertTrue(e.getMessage().contains("CATE_ID_FORBIDDEN_CHAR"), e.getMessage());
        assertEquals(List.of(), fx.cateSegments("M"));
    }

    @Test
    void 허용되지_않는_defTarget_은_거부한다() {
        BusinessException e = assertThrows(BusinessException.class,
                () -> segments.addCategory(DRAFT, def("R1", "정규식", CategoryKind.REGEX, ".*", CategoryDefTarget.KEY)));

        assertMdm(MdmErrorCode.CODE_SAVE_REJECTED, e);
        assertTrue(e.getMessage().contains("DEF_TARGET_NOT_ALLOWED"), e.getMessage());
        assertEquals(List.of(), fx.cateSegments("M"));
    }

    @Test
    void 정규식_문법_오류는_addCategory_도_거부한다() {
        BusinessException e = assertThrows(BusinessException.class,
                () -> segments.addCategory(DRAFT, def("R1", "정규식", CategoryKind.REGEX, "(", CategoryDefTarget.CODE)));

        assertMdm(MdmErrorCode.CODE_SAVE_REJECTED, e);
        assertTrue(e.getMessage().contains("INVALID_REGEX"), e.getMessage());
    }

    @Test
    void defKind_변경은_거부한다() {
        fx.seedCate("M", "T1", "1.000", OPEN, "표1", "TABLE", null, null);

        BusinessException e = assertThrows(BusinessException.class, () -> segments.changeCategory(DRAFT,
                def("T1", "표1", CategoryKind.REGEX, ".*", CategoryDefTarget.CODE)));

        assertMdm(MdmErrorCode.CODE_SAVE_REJECTED, e);
        assertTrue(e.getMessage().contains("DEF_KIND_IMMUTABLE"), e.getMessage());
        assertEquals(List.of("T1@1.000-9999"), fx.cateSegments("M"));
    }

    @Test
    void 정상_changeCategory_는_옛_행을_닫고_새_행을_연다() {
        fx.seedCate("M", "T1", "1.000", OPEN, "표1", "TABLE", null, null);

        segments.changeCategory(DRAFT, def("T1", "새 표1", CategoryKind.TABLE, null, null));

        assertEquals(List.of("T1@1.000-1.001", "T1@1.001-9999"), fx.cateSegments("M"));
    }

    // ── BASE 보호 ───────────────────────────────────────────────────────

    @Test
    void BASE_는_모든_조작에_MDM012() {
        fx.seedCate("M", "BASE", "1.000", OPEN, "전체", "REGEX", ".*", "CODE");

        assertMdm(MdmErrorCode.RESERVED_CATEGORY, assertThrows(BusinessException.class, () -> segments.addCategory(
                DRAFT, def("BASE", "전체", CategoryKind.REGEX, ".*", CategoryDefTarget.CODE))));
        assertMdm(MdmErrorCode.RESERVED_CATEGORY, assertThrows(BusinessException.class, () -> segments.changeCategory(
                DRAFT, def("BASE", "새 이름", CategoryKind.REGEX, ".*", CategoryDefTarget.CODE))));
        assertMdm(MdmErrorCode.RESERVED_CATEGORY,
                assertThrows(BusinessException.class, () -> segments.closeCategory(DRAFT, "BASE")));
        assertMdm(MdmErrorCode.RESERVED_CATEGORY,
                assertThrows(BusinessException.class, () -> segments.addCategoryMembers(DRAFT, "BASE", Set.of("A"))));
        assertMdm(MdmErrorCode.RESERVED_CATEGORY,
                assertThrows(BusinessException.class, () -> segments.removeCategoryMembers(DRAFT, "BASE", Set.of("A"))));
        assertMdm(MdmErrorCode.RESERVED_CATEGORY,
                assertThrows(BusinessException.class, () -> segments.revert(DRAFT, cateKey("BASE"))));
        assertEquals(List.of("BASE@1.000-9999"), fx.cateSegments("M"));
    }

    // ── DRAFT 전용 ─────────────────────────────────────────────────────

    @Test
    void RELEASED_CANCELLED_버전은_MDM002() {
        fx.seedVersion("M", "1.002", "CANCELLED", "kim", "2026-08-01 00:00:00", "2026-09-01 00:00:00", 0);
        fx.seedCate("M", "T1", "1.000", OPEN, "표1", "TABLE", null, null);

        for (VersionRef v : List.of(RELEASED, ref(V1_002))) {
            assertMdm(MdmErrorCode.NOT_DRAFT, assertThrows(BusinessException.class,
                    () -> segments.addCategory(v, def("T2", "표2", CategoryKind.TABLE, null, null))));
            assertMdm(MdmErrorCode.NOT_DRAFT, assertThrows(BusinessException.class,
                    () -> segments.changeCategory(v, def("T1", "새이름", CategoryKind.TABLE, null, null))));
            assertMdm(MdmErrorCode.NOT_DRAFT,
                    assertThrows(BusinessException.class, () -> segments.closeCategory(v, "T1")));
            assertMdm(MdmErrorCode.NOT_DRAFT,
                    assertThrows(BusinessException.class, () -> segments.addCategoryMembers(v, "T1", Set.of("A"))));
            assertMdm(MdmErrorCode.NOT_DRAFT,
                    assertThrows(BusinessException.class, () -> segments.removeCategoryMembers(v, "T1", Set.of("A"))));
            assertMdm(MdmErrorCode.NOT_DRAFT,
                    assertThrows(BusinessException.class, () -> segments.revert(v, cateKey("T1"))));
        }
        assertEquals(List.of("T1@1.000-9999"), fx.cateSegments("M"));
    }

    // ── TABLE 소속 ─────────────────────────────────────────────────────

    @Test
    void 없는_코드_addCategoryMembers_거부() {
        fx.seedCate("M", "T1", "1.000", OPEN, "표1", "TABLE", null, null);

        BusinessException e = assertThrows(BusinessException.class,
                () -> segments.addCategoryMembers(DRAFT, "T1", Set.of("A", "ZZ")));

        assertMdm(MdmErrorCode.CODE_SAVE_REJECTED, e);
        assertTrue(e.getMessage().contains("MEMBER_CODE_NOT_FOUND"), e.getMessage());
        assertEquals(List.of(), fx.cateItemSegments("M"));
    }

    @Test
    void 없는_코드도_removeCategoryMembers_허용() {
        fx.seedCate("M", "T1", "1.000", OPEN, "표1", "TABLE", null, null);
        fx.seedCateItem("M", "T1", "ZZ", "1.000", OPEN);

        segments.removeCategoryMembers(DRAFT, "T1", Set.of("ZZ"));

        assertEquals(List.of("T1 ZZ@1.000-1.001"), fx.cateItemSegments("M"));
    }

    @Test
    void addCategoryMembers_로_넣은_소속_행의_to_ver_는_9999다() {
        fx.seedCate("M", "T1", "1.000", OPEN, "표1", "TABLE", null, null);

        segments.addCategoryMembers(DRAFT, "T1", Set.of("A", "B"));

        assertEquals(List.of("T1 A@1.001-9999", "T1 B@1.001-9999"), fx.cateItemSegments("M"));
    }

    // ── V 안 추가 삭제 vs 이전 닫기 ─────────────────────────────────────

    @Test
    void V_에서_추가한_것은_삭제되고_이전_것은_닫힌다() {
        fx.seedCate("M", "T1", "1.000", OPEN, "표1", "TABLE", null, null);
        fx.seedCateItem("M", "T1", "B", "1.000", OPEN);
        segments.addCategory(DRAFT, def("T2", "표2", CategoryKind.TABLE, null, null));
        segments.addCategoryMembers(DRAFT, "T1", Set.of("A"));

        segments.closeCategory(DRAFT, "T2");
        segments.removeCategoryMembers(DRAFT, "T1", Set.of("A", "B"));

        assertEquals(List.of("T1@1.000-9999"), fx.cateSegments("M"));
        assertEquals(List.of("T1 B@1.000-1.001"), fx.cateItemSegments("M"));
    }

    // ── 카테고리 닫기 연쇄 ──────────────────────────────────────────────

    @Test
    void closeCategory_는_열린_소속을_연쇄로_닫는다() {
        seedCascade();

        segments.closeCategory(DRAFT, "T1");

        assertEquals(List.of("T1@1.000-1.001", "T2@1.000-9999"), fx.cateSegments("M"));
        assertEquals(List.of("T1 A@1.000-1.001", "T1 B@1.000-1.001", "T2 B@1.000-9999"), fx.cateItemSegments("M"));
    }

    @Test
    void 카테고리_되돌리기는_연쇄로_닫힌_소속을_다시_연다() {
        seedCascade();
        segments.closeCategory(DRAFT, "T1");

        segments.revert(DRAFT, cateKey("T1"));

        assertEquals(List.of("T1@1.000-9999", "T2@1.000-9999"), fx.cateSegments("M"));
        assertEquals(List.of("T1 A@1.000-9999", "T1 B@1.000-9999", "T2 B@1.000-9999"), fx.cateItemSegments("M"));
    }

    @Test
    void CATE_되돌리기는_새로_추가한_카테고리를_지운다() {
        segments.addCategory(DRAFT, def("T1", "표1", CategoryKind.TABLE, null, null));

        segments.revert(DRAFT, cateKey("T1"));

        assertEquals(List.of(), fx.cateSegments("M"));
    }

    @Test
    void 되돌릴_변경이_없으면_MDM021() {
        fx.seedCate("M", "T1", "1.000", OPEN, "표1", "TABLE", null, null);

        BusinessException e = assertThrows(BusinessException.class, () -> segments.revert(DRAFT, cateKey("T1")));

        assertMdm(MdmErrorCode.INVALID_INPUT, e);
        assertEquals(List.of("T1@1.000-9999"), fx.cateSegments("M"));
    }

    // ── ROW_VERSION 불변 ────────────────────────────────────────────────

    @Test
    void 카테고리_조작은_ROW_VERSION_을_바꾸지_않는다() {
        seedCascade();

        segments.addCategory(DRAFT, def("T3", "표3", CategoryKind.TABLE, null, null));
        segments.changeCategory(DRAFT, def("T1", "새 표1", CategoryKind.TABLE, null, null));
        segments.addCategoryMembers(DRAFT, "T1", Set.of("C"));
        segments.removeCategoryMembers(DRAFT, "T2", Set.of("B"));
        segments.closeCategory(DRAFT, "T3");
        segments.revert(DRAFT, cateKey("T1"));

        assertEquals(SEED_ROW_VERSION, fx.rowVersion("M", "1.001"));
        assertEquals(0L, fx.rowVersion("M", "1.000"));
    }

    // ── helpers ─────────────────────────────────────────────────────────

    /** TABLE T1(A·B@1.000), T2(B@1.000). */
    private void seedCascade() {
        fx.seedCate("M", "T1", "1.000", OPEN, "표1", "TABLE", null, null);
        fx.seedCate("M", "T2", "1.000", OPEN, "표2", "TABLE", null, null);
        fx.seedCateItem("M", "T1", "A", "1.000", OPEN);
        fx.seedCateItem("M", "T1", "B", "1.000", OPEN);
        fx.seedCateItem("M", "T2", "B", "1.000", OPEN);
    }

    private static CategoryDefinition def(String cateId, String cateName, CategoryKind kind, String expr,
                                          CategoryDefTarget target) {
        return new CategoryDefinition(cateId, cateName, kind, expr, target, null);
    }

    private static MasterCodeSegmentKey cateKey(String cateId) {
        return new MasterCodeSegmentKey(MasterCodeSegmentTable.CATE, cateId, null);
    }

    private static VersionRef ref(BigDecimal ver) {
        return new VersionRef(VersionTarget.MASTER_CODE, "M", ver);
    }

    private static void assertMdm(MdmErrorCode code, BusinessException e) {
        assertEquals(code.code(), e.getErrors().get(0).code(), e.getMessage());
    }
}
