package com.dongkuk.dmes.mdm.dmd.dataItemMng;

import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.OPEN;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.T0;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.insertCateRow;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.insertItemRow;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.insertMaruData;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.insertMemberRow;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.text;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.AttrLabel;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.CategoryOption;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemHeader;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemKeyRequest;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemRow;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemSaveRequest;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemSaveResult;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemSearchRequest;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemSearchResult;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemViewRequest;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemViewResult;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.MaruDataOption;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.service.DataItemMngService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.nio.file.Path;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
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
 * TSK-07-03 design.md §3.2 T-Q — 항목 관리 목록·머리(Q1~Q6)와 쓰기 위임.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmdSegmentTestSupport.Config.class)
class DataItemMngServiceSqliteTest {

    private static final String MD = "PORT";

    @TempDir
    static Path tempDir;

    @Autowired
    DataItemMngService service;
    @Autowired
    MutableClock clock;
    @Autowired
    DataSource dataSource;

    private JdbcTemplate jdbc;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + tempDir.resolve("mdm-dmd-item-mng.db"));
    }

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        DmdSegmentTestSupport.clear(jdbc);
        DmdSegmentTestSupport.insertMdm(jdbc, MD, 1, "국가", null, "비고");
        insertCateRow(jdbc, MD, "BASE", "REGEX", ".*", "KEY", T0.minusDays(10), OPEN);
        clock.setLocal(T0);
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @AfterEach
    void clearThreadLocals() {
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    // ── Q2·Q3 페이징·정렬 ──────────────────────────────────────────────────

    @Test
    void Q2_Q3_서버_페이징은_0부터_50건씩이고_seq_NULL_은_뒤_같으면_code_순() {
        seed120();

        DataItemSearchResult p0 = service.search(search(0, null));
        DataItemSearchResult p1 = service.search(search(1, null));
        DataItemSearchResult p2 = service.search(search(2, null));

        assertEquals(50, p0.getList().size());
        assertEquals(50, p1.getList().size());
        assertEquals(20, p2.getList().size());
        assertEquals(120, p0.getTotalCount());
        assertEquals(50, p0.getSize());
        assertEquals(2, p2.getPage());
        assertEquals("K001", p0.getList().get(0).getCode());
        assertEquals(1, p0.getList().get(0).getSeq());
        // seq 가 있는 80건(3의 배수 아님) 뒤에 seq NULL 40건이 code 순으로 온다.
        assertEquals("K119", p1.getList().get(29).getCode(), "seq 있는 마지막");
        assertEquals("K003", p1.getList().get(30).getCode(), "seq NULL 첫 행");
        assertNull(p1.getList().get(30).getSeq());
        assertEquals("K120", p2.getList().get(19).getCode());
    }

    @Test
    void Q3_size_는_기본_50_상한_200() {
        seed120();
        DataItemSearchRequest big = search(0, null);
        big.setSize(1000);
        DataItemSearchRequest none = search(0, null);
        none.setSize(null);
        none.setPage(null);

        assertEquals(200, service.search(big).getSize());
        assertEquals(120, service.search(big).getList().size());
        assertEquals(50, service.search(none).getSize());
        assertEquals(0, service.search(none).getPage());
    }

    @Test
    void Q3_키는_대소문자_무시_부분_일치_이름은_부분_일치_totalCount_는_필터_뒤_수() {
        seed120();
        DataItemSearchRequest byCode = search(0, null);
        byCode.setCode("k00");
        DataItemSearchRequest byName = search(0, null);
        byName.setName("항목1");

        assertEquals(9, service.search(byCode).getTotalCount());
        assertEquals(32, service.search(byName).getTotalCount());
    }

    @Test
    void Q3_퍼센트_밑줄_역슬래시는_와일드카드가_아니다() {
        insertItemRow(jdbc, MD, "A_B", "밑줄", T0, OPEN, 0, null, null);
        insertItemRow(jdbc, MD, "AXB", "엑스", T0, OPEN, 0, null, null);
        insertItemRow(jdbc, MD, "A%B", "퍼센트", T0, OPEN, 0, null, null);

        assertEquals(List.of("A_B"), codes(filterCode("_")));
        assertEquals(List.of("A%B"), codes(filterCode("%")));
        assertEquals(List.of(), codes(filterCode("\\")));
        DataItemSearchRequest name = search(0, null);
        name.setName("%");
        assertEquals(List.of(), codes(service.search(name)));
    }

    // ── Q1 ──────────────────────────────────────────────────────────────────

    @Test
    void Q1_목록은_키별_마지막_행이고_닫힌_키는_showClosed_일_때만() {
        insertItemRow(jdbc, MD, "KRPUS", "부산", T0.minusDays(3), text(T0.minusDays(2)), 0, null, null);
        insertItemRow(jdbc, MD, "KRPUS", "부산항", T0.minusDays(2), text(T0.minusDays(1)), 1, null, null);
        insertItemRow(jdbc, MD, "KRPUS", "부산신항", T0, OPEN, 3, null, null);
        insertItemRow(jdbc, MD, "KRINC", "인천", T0.minusDays(3), text(T0.minusDays(1)), 1, null, null);

        DataItemSearchResult open = service.search(search(0, null));
        assertEquals(List.of("KRPUS"), codes(open));
        DataItemRow row = open.getList().get(0);
        assertEquals("부산신항", row.getName());
        assertEquals(3, row.getRowVersion());
        assertTrue(row.isOpen());
        assertEquals(text(T0), row.getValidFrom());
        assertEquals(OPEN, row.getValidTo());

        DataItemSearchRequest closed = search(0, null);
        closed.setShowClosed(true);
        DataItemSearchResult all = service.search(closed);
        assertEquals(List.of("KRINC", "KRPUS"), codes(all));
        assertFalse(all.getList().get(0).isOpen());
        assertEquals(text(T0.minusDays(1)), all.getList().get(0).getValidTo());
    }

    // ── Q4 ──────────────────────────────────────────────────────────────────

    @Test
    void Q4_카테고리_REGEX_는_서버_정규식_대상_NULL_불일치_TABLE_은_열린_소속_BASE_는_전체() {
        insertItemRow(jdbc, MD, "KRPUS", "부산", T0, OPEN, 0, null, List.of("KR", "", "x"));
        insertItemRow(jdbc, MD, "KRINC", "인천", T0, OPEN, 0, null, List.of("KR"));
        insertItemRow(jdbc, MD, "CNSHA", "상하이", T0, OPEN, 0, null, List.of("CN"));
        insertItemRow(jdbc, MD, "NOATTR", "빈칸", T0, OPEN, 0, null, null);
        insertItemRow(jdbc, MD, "CLOSED", "닫힘", T0.minusDays(2), text(T0.minusDays(1)), 1, null, List.of("CN"));
        insertCateRow(jdbc, MD, "KR", "REGEX", "^KR$", "ATTR01", T0.minusDays(5), OPEN);
        insertCateRow(jdbc, MD, "ANY3", "REGEX", ".*", "ATTR03", T0.minusDays(5), OPEN);
        insertCateRow(jdbc, MD, "MAJOR", "TABLE", null, null, T0.minusDays(5), OPEN);
        insertMemberRow(jdbc, MD, "MAJOR", "KRPUS", T0.minusDays(4), OPEN);
        insertMemberRow(jdbc, MD, "MAJOR", "CNSHA", T0.minusDays(4), text(T0.minusDays(3)));

        assertEquals(List.of("CNSHA", "KRINC", "KRPUS", "NOATTR"), codes(byCate("BASE", false)));
        assertEquals(List.of("CNSHA", "KRINC", "KRPUS", "NOATTR"), codes(byCate(null, false)), "카테고리 없음 = BASE");
        assertEquals(List.of("KRINC", "KRPUS"), codes(byCate("KR", false)));
        assertEquals(List.of("KRPUS"), codes(byCate("ANY3", false)), "대상 칸이 NULL 이면 불일치");
        assertEquals(List.of("KRPUS"), codes(byCate("MAJOR", false)), "열린 소속만");
        assertEquals(List.of("CLOSED", "KRINC", "KRPUS"), codes(byCate("KR", true)), "닫힌 키는 카테고리 필터를 거치지 않는다");

        DataItemSearchRequest paged = search(0, "KR");
        paged.setSize(1);
        DataItemSearchResult page = service.search(paged);
        assertEquals(1, page.getList().size());
        assertEquals(2, page.getTotalCount(), "REGEX 카테고리의 totalCount 는 필터 뒤 수");
    }

    // ── I5·I6 트리·노드 필터(TSK-07-04) ────────────────────────────────────────

    @Test
    void I5_노드_필터는_코드_자신_또는_lvl1_5_어딘가의_값이_같은_행만_열림_닫힘_무관() {
        insertItemRow(jdbc, MD, "KRPUS", "부산", T0, OPEN, 0, List.of("KR", "BUSAN"), null);
        insertItemRow(jdbc, MD, "KRINC", "인천", T0, OPEN, 0, List.of("KR", "INCHEON"), null);
        insertItemRow(jdbc, MD, "CNSHA", "상하이", T0, OPEN, 0, List.of("CN", "SHANGHAI"), null);
        insertItemRow(jdbc, MD, "KR", "대한민국", T0, OPEN, 0, null, null);
        insertItemRow(jdbc, MD, "KRCLOSED", "닫힌부산권", T0.minusDays(2), text(T0.minusDays(1)), 0, List.of("KR"), null);

        assertEquals(List.of("KR", "KRCLOSED", "KRINC", "KRPUS"), codes(nodeFilter("KR", true)),
                "코드 자신(KR) 또는 lvl1(KR)이 일치, 닫힌 키도 포함");
        assertEquals(List.of("KR", "KRINC", "KRPUS"), codes(nodeFilter("KR", false)), "showClosed 아니면 열린 행만");
        assertEquals(List.of("KRPUS"), codes(nodeFilter("BUSAN", false)), "코드 자신이 아니라 lvl2 에 있어도 잡힌다");
        assertEquals(List.of(), codes(nodeFilter("NONE", false)));
    }

    @Test
    void I6_withTree_는_열린_행만_기존_ORDER_로_돌려준다() {
        insertItemRow(jdbc, MD, "KRPUS", "부산", T0, OPEN, 0, null, null);
        insertItemRow(jdbc, MD, "KRINC", "인천", T0, OPEN, 0, null, null);
        insertItemRow(jdbc, MD, "KRCLOSED", "닫힘", T0.minusDays(2), text(T0.minusDays(1)), 0, null, null);

        DataItemSearchResult withTree = service.search(withTree(true));
        assertEquals(List.of("KRINC", "KRPUS"), withTree.getTree().stream().map(DataItemRow::getCode).toList(),
                "seq 없으면 기존 ORDER 대로 code 순, 닫힌 KRCLOSED 는 트리에 없다(I6)");
        assertFalse(withTree.isTreeTruncated());

        DataItemSearchResult noTree = service.search(withTree(false));
        assertNull(noTree.getTree(), "withTree 아니면 tree 를 채우지 않는다");
    }

    @Test
    void I6_withTree_는_상한_TREE_MAX_에_걸리면_treeTruncated() {
        seedOpenItems(2000);

        DataItemSearchResult withTree = service.search(withTree(true));

        assertEquals(2000, withTree.getTree().size());
        assertTrue(withTree.isTreeTruncated());
    }

    // ── Q5·Q6 머리 ──────────────────────────────────────────────────────────

    @Test
    void Q5_Q6_머리는_계층_칸_수_라벨_있는_번호만_편집_가능_여부를_준다() {
        insertMaruData(jdbc, "CUST", "EXTERNAL", "ERP", "INUSE", DmdSegmentTestSupport.DEFAULT_PATTERN, 0, "사업자번호");
        insertMaruData(jdbc, "OLD", "MDM", null, "DEPRECATED", DmdSegmentTestSupport.DEFAULT_PATTERN, 2);
        insertCateRow(jdbc, MD, "KR", "REGEX", "^KR$", "ATTR01", T0.minusDays(5), OPEN);
        insertCateRow(jdbc, MD, "AAA", "TABLE", null, null, T0.minusDays(5), OPEN);
        insertCateRow(jdbc, MD, "GONE", "TABLE", null, null, T0.minusDays(5), text(T0.minusDays(1)));

        DataItemViewResult list = service.view(new DataItemViewRequest());
        assertNull(list.getHeader());
        assertEquals(List.of("CUST", "OLD", "PORT"), list.getMaruDataOptions().stream().map(MaruDataOption::getMaruDataId)
                .toList());

        DataItemHeader port = view(MD);
        assertEquals(1, port.getLvlCnt());
        assertEquals(List.of("attr01:국가", "attr03:비고"), port.getAttrLabels().stream()
                .map((AttrLabel a) -> a.getField() + ":" + a.getLabel()).toList());
        assertTrue(port.isEditable());
        assertEquals("MDM", port.getSourceKind());
        assertEquals(List.of("BASE", "AAA", "KR"), port.getCategories().stream().map(CategoryOption::getCateId).toList(),
                "열린 카테고리만, BASE 먼저");
        assertFalse(view("CUST").isEditable(), "EXTERNAL 은 조회 전용");
        assertEquals("ERP", view("CUST").getSourceSystem());
        assertFalse(view("OLD").isEditable(), "DEPRECATED 는 조회 전용");
    }

    // ── 쓰기 위임 ───────────────────────────────────────────────────────────

    @Test
    void 쓰기_넷은_저장_코어에_위임하고_마지막_행을_돌려준다() {
        DataItemSaveRequest reg = saveRequest("KRPUS", "부산");
        reg.setLvl1("KR");
        reg.setAttr01("KR");
        DataItemSaveResult inserted = service.register(reg);
        assertEquals("INSERT", inserted.getAction());
        assertEquals("KR", inserted.getRow().getLvl1());
        assertEquals(0, inserted.getRow().getRowVersion());
        assertEquals(text(T0), inserted.getAt());

        clock.setLocal(T0.plusMinutes(1));
        DataItemSaveRequest mod = saveRequest("KRPUS", "부산항");
        mod.setExpectedRowVersion(0);
        DataItemSaveResult updated = service.modify(mod);
        assertEquals("UPDATE", updated.getAction());
        assertEquals("부산항", updated.getRow().getName());
        assertNull(updated.getRow().getLvl1(), "빠진 칸은 NULL 이다(05 페이로드)");
        assertEquals(1, updated.getRow().getRowVersion());

        clock.setLocal(T0.plusMinutes(2));
        DataItemSaveResult closed = service.close(key("KRPUS", 1));
        assertEquals("CLOSE", closed.getAction());
        assertFalse(closed.getRow().isOpen());

        clock.setLocal(T0.plusMinutes(3));
        DataItemSaveResult reopened = service.reopen(key("KRPUS", 2));
        assertEquals("REOPEN", reopened.getAction());
        assertTrue(reopened.getRow().isOpen());
        assertEquals(3, reopened.getRow().getRowVersion());
    }

    @Test
    void 수정_닫기_다시_열기는_expectedRowVersion_이_필수다() {
        service.register(saveRequest("KRPUS", "부산"));
        BusinessException e = assertThrows(BusinessException.class, () -> service.modify(saveRequest("KRPUS", "x")));
        assertTrue(e.getMessage().startsWith(MdmErrorCode.INVALID_INPUT.defaultMessage()), e.getMessage());
        assertThrows(BusinessException.class, () -> service.close(key("KRPUS", null)));
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    /** K001~K120. seq 는 3의 배수면 NULL, 아니면 번호. 이름은 항목{번호}. */
    private void seed120() {
        for (int i = 1; i <= 120; i++) {
            jdbc.update("INSERT INTO TB_MDM_DATA_ITEM (MARU_DATA_ID, CODE, VALID_FROM, VALID_TO, NAME, SEQ, ROW_VERSION, "
                    + "CHG_SEQ, VER) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0)", MD, String.format("K%03d", i), text(T0), OPEN,
                    "항목" + i, i % 3 == 0 ? null : i);
        }
    }

    private DataItemSearchResult filterCode(String code) {
        DataItemSearchRequest r = search(0, null);
        r.setCode(code);
        return service.search(r);
    }

    private DataItemSearchResult byCate(String cateId, boolean showClosed) {
        DataItemSearchRequest r = search(0, cateId);
        r.setShowClosed(showClosed);
        return service.search(r);
    }

    private DataItemSearchResult nodeFilter(String node, boolean showClosed) {
        DataItemSearchRequest r = search(0, null);
        r.setNodeFilter(node);
        r.setShowClosed(showClosed);
        return service.search(r);
    }

    private DataItemSearchRequest withTree(boolean v) {
        DataItemSearchRequest r = search(0, null);
        r.setWithTree(v);
        return r;
    }

    /** N개 열린 항목, 코드 T00001~T000N(계층 칸 없음) — I6 상한(TREE_MAX) 검증용. */
    private void seedOpenItems(int n) {
        for (int i = 1; i <= n; i++) {
            jdbc.update("INSERT INTO TB_MDM_DATA_ITEM (MARU_DATA_ID, CODE, VALID_FROM, VALID_TO, NAME, ROW_VERSION, "
                    + "CHG_SEQ, VER) VALUES (?, ?, ?, ?, ?, 0, 0, 0)", MD, String.format("T%05d", i), text(T0), OPEN,
                    "항목" + i);
        }
    }

    private DataItemHeader view(String md) {
        DataItemViewRequest r = new DataItemViewRequest();
        r.setMaruDataId(md);
        return service.view(r).getHeader();
    }

    private static DataItemSearchRequest search(Integer page, String cateId) {
        DataItemSearchRequest r = new DataItemSearchRequest();
        r.setMaruDataId(MD);
        r.setPage(page);
        r.setSize(50);
        r.setCateId(cateId);
        return r;
    }

    private static DataItemSaveRequest saveRequest(String code, String name) {
        DataItemSaveRequest r = new DataItemSaveRequest();
        r.setMaruDataId(MD);
        r.setCode(code);
        r.setName(name);
        return r;
    }

    private static DataItemKeyRequest key(String code, Integer rv) {
        DataItemKeyRequest r = new DataItemKeyRequest();
        r.setMaruDataId(MD);
        r.setCode(code);
        r.setExpectedRowVersion(rv);
        return r;
    }

    private static List<String> codes(DataItemSearchResult result) {
        return result.getList().stream().map(DataItemRow::getCode).toList();
    }
}
