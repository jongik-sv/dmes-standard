package com.dongkuk.dmes.mdm.dmd.dataCateEdit;

import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.OPEN;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.T0;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.segment.DataCateItemSegmentStore;
import com.dongkuk.dmes.mdm.common.segment.DataCateSegmentStore;
import com.dongkuk.dmes.mdm.common.segment.DataCategoryResolver;
import com.dongkuk.dmes.mdm.common.segment.DataCategorySegmentCore;
import com.dongkuk.dmes.mdm.common.segment.DataItemChecks;
import com.dongkuk.dmes.mdm.common.segment.DataItemMessages;
import com.dongkuk.dmes.mdm.common.segment.DataSegmentLock;
import com.dongkuk.dmes.mdm.common.segment.DataSegmentRowStore;
import com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateCompareRequest;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateCompareResult;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateRegRequest;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateSaveRequest;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateSearchRequest;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateSearchResult;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateViewRequest;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateViewResult;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.service.DataCateEditService;
import com.dongkuk.oasis.audit.AuditHolder;
import jakarta.persistence.EntityManager;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * TSK-07-02 design.md §3.1 — {@code dataCateEdit} 카테고리 편집. R2′(DataCategorySegmentCore 위임, 이중 잠금 없음)·
 * R4(닫기는 소속에 연쇄하지 않는다)·R5(매칭은 열린 카테고리·열린 항목만)·R6(BASE 거부)·R7(DEPRECATED 거부)·
 * R12(TABLE 일괄 적용 전부-아니면-전무) 를 이 클래스가 담당한다(구현 단위 B3).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmdSegmentTestSupport.Config.class)
class DataCateEditServiceSqliteTest extends AbstractMdmSharedDbTest {

    @Autowired
    DataCateEditService service;
    @Autowired
    DataSegmentRowStore rowStore;
    @Autowired
    DataSegmentLock lock;
    @Autowired
    DataCateSegmentStore cateStore;
    @Autowired
    DataCateItemSegmentStore memberStore;
    @Autowired
    DataItemChecks checks;
    @Autowired
    DataCategoryResolver resolver;
    @Autowired
    PlatformTransactionManager transactionManager;
    @Autowired
    EntityManager entityManager;
    @Autowired
    MutableClock clock;
    @Autowired
    DataSource dataSource;

    private JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        DmdSegmentTestSupport.clear(jdbc);
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @AfterEach
    void clearThreadLocals() {
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    // ── reg — REGEX·TABLE 등록 ─────────────────────────────────────────────

    @Test
    void reg_는_REGEX_카테고리를_만든다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "MD1", 0);

        CateViewResult view = service.register(regRequest("MD1", "C1", "숫자", "REGEX", "^[0-9]+$", "KEY", null));

        assertEquals("C1", view.getCate().getCateId());
        assertEquals("REGEX", view.getCate().getDefKind());
        assertTrue(view.getCate().isOpen());
    }

    /**
     * R8 — 이 Task 는 {@code DataItemChecks.cateDefIssues}(TSK-07-03 소유 공용 코어)를 재검사하지 않지만,
     * {@code reg}/{@code save} 는 그 결과를 그대로 거쳐 거부한다(design.md §5 R8). 통합 단위(I)에서 커버리지
     * 점검 중 이 경로(REGEX 등록의 문법 거부)가 어떤 단위 테스트로도 확인되지 않은 구멍을 찾아 채웠다 —
     * e2e `mdm-dataCateEdit.spec.ts` 스모크 4 는 화면을 거쳐 같은 경로를 확인하지만, 서버 없이 빠르게 도는
     * 단위 테스트가 없으면 다음 변경에서 회귀를 늦게(e2e 에서야) 발견한다.
     */
    @Test
    void reg_는_잘못된_REGEX_문법이면_거부한다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "MD1", 0);

        CateRegRequest req = regRequest("MD1", "C2", "잘못된식", "REGEX", "[", "KEY", null);

        assertThrows(BusinessException.class, () -> service.register(req));
    }

    @Test
    void reg_는_TABLE_카테고리를_만든다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "MD1", 0);

        CateViewResult view = service.register(regRequest("MD1", "GRP", "그룹", "TABLE", null, null, null));

        assertEquals("TABLE", view.getCate().getDefKind());
        assertEquals(0, view.getCate().getMatchCount());
    }

    // ── R6 — BASE 는 수정·닫기를 거부한다 ─────────────────────────────────────

    @Test
    void R6_BASE_수정은_예약_카테고리_문구로_거부된다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "MD1", 0);
        DmdSegmentTestSupport.insertCateRow(jdbc, "MD1", "BASE", "REGEX", ".*", "KEY", DmdSegmentTestSupport.T0,
                DmdSegmentTestSupport.OPEN);

        CateSaveRequest req = new CateSaveRequest();
        req.setMaruDataId("MD1");
        req.setCateId("BASE");
        req.setDefExpr(".+");
        req.setDefTarget("KEY");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.save(req, null, null));
        assertTrue(ex.getMessage().contains("예약 카테고리"), ex.getMessage());
    }

    @Test
    void R6_BASE_닫기는_예약_카테고리_문구로_거부된다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "MD1", 0);
        DmdSegmentTestSupport.insertCateRow(jdbc, "MD1", "BASE", "REGEX", ".*", "KEY", DmdSegmentTestSupport.T0,
                DmdSegmentTestSupport.OPEN);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.close(viewRequest("MD1", "BASE")));
        assertTrue(ex.getMessage().contains("예약 카테고리"), ex.getMessage());
    }

    // ── R7 — DEPRECATED 마루 데이터는 쓰기를 거부한다 ─────────────────────────

    @Test
    void R7_DEPRECATED_마루_데이터는_카테고리_등록을_거부한다() {
        DmdSegmentTestSupport.insertMaruData(jdbc, "MD1", "MDM", null, "DEPRECATED", DmdSegmentTestSupport.DEFAULT_PATTERN,
                0);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.register(regRequest("MD1", "C1", "카테고리", "REGEX", "^A.*$", "KEY", null)));
        assertTrue(ex.getMessage().contains(DataItemMessages.DEPRECATED), ex.getMessage());
    }

    // ── R4 — 닫기는 소속 행에 연쇄하지 않는다(소속 보존), 다시 열면 매칭이 되살아난다 ──

    @Test
    void R4_닫기는_소속_행을_지우지_않고_다시_열면_매칭이_되살아난다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "MD1", 0);
        DmdSegmentTestSupport.insertCateRow(jdbc, "MD1", "GRP", "TABLE", null, null, DmdSegmentTestSupport.T0,
                DmdSegmentTestSupport.OPEN);
        DmdSegmentTestSupport.insertItemRow(jdbc, "MD1", "A", "Alpha", DmdSegmentTestSupport.T0,
                DmdSegmentTestSupport.OPEN, 0, null, null);
        DmdSegmentTestSupport.insertMemberRow(jdbc, "MD1", "GRP", "A", DmdSegmentTestSupport.T0,
                DmdSegmentTestSupport.OPEN);

        CateViewRequest req = viewRequest("MD1", "GRP");
        assertEquals(1, service.view(req).getCate().getMatchCount());

        service.close(req);
        // R4 — 소속 행은 카테고리를 닫아도 "열린 채" 그대로 남는다(연쇄 닫힘이 없다). COUNT(*) 만으로는 연쇄 닫힘
        // (행은 남지만 VALID_TO 가 바뀌는 변이)을 잡지 못하므로 VALID_TO = OPEN_END 로 필터해 확인한다.
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_DATA_CATE_ITEM WHERE MARU_DATA_ID='MD1' "
                + "AND CATE_ID='GRP' AND VALID_TO = '" + DmdSegmentTestSupport.OPEN + "'", Integer.class));
        assertEquals(0, service.view(req).getCate().getMatchCount());

        service.reopen(req);
        assertEquals(1, service.view(req).getCate().getMatchCount());
    }

    // ── R5 — 매칭은 열린 카테고리·열린 항목만 ─────────────────────────────────

    @Test
    void R5_닫힌_REGEX_카테고리는_매칭_건수가_0이다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "MD1", 0);
        DmdSegmentTestSupport.insertCateRow(jdbc, "MD1", "C1", "REGEX", "^A.*$", "KEY", DmdSegmentTestSupport.T0,
                DmdSegmentTestSupport.text(DmdSegmentTestSupport.T0.plusDays(1)));
        DmdSegmentTestSupport.insertItemRow(jdbc, "MD1", "A1", "Alpha", DmdSegmentTestSupport.T0,
                DmdSegmentTestSupport.OPEN, 0, null, null);

        CateSearchResult result = service.search(searchRequest("MD1"));
        assertEquals(0, result.getList().get(0).getMatchCount());
        assertTrue(!result.getList().get(0).isOpen());
    }

    @Test
    void R5_닫힌_항목의_TABLE_소속은_매칭에_들지_않는다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "MD1", 0);
        DmdSegmentTestSupport.insertCateRow(jdbc, "MD1", "GRP", "TABLE", null, null, DmdSegmentTestSupport.T0,
                DmdSegmentTestSupport.OPEN);
        DmdSegmentTestSupport.insertItemRow(jdbc, "MD1", "A", "Alpha", DmdSegmentTestSupport.T0,
                DmdSegmentTestSupport.OPEN, 0, null, null);
        // B 는 항목이 닫혀 있지만(마지막 행이 닫힘) 소속 행은 열려 있다 — R5 는 열린 항목만 센다
        DmdSegmentTestSupport.insertItemRow(jdbc, "MD1", "B", "Bravo", DmdSegmentTestSupport.T0,
                DmdSegmentTestSupport.text(DmdSegmentTestSupport.T0.plusDays(1)), 0, null, null);
        DmdSegmentTestSupport.insertMemberRow(jdbc, "MD1", "GRP", "A", DmdSegmentTestSupport.T0,
                DmdSegmentTestSupport.OPEN);
        DmdSegmentTestSupport.insertMemberRow(jdbc, "MD1", "GRP", "B", DmdSegmentTestSupport.T0,
                DmdSegmentTestSupport.OPEN);

        CateViewResult view = service.view(viewRequest("MD1", "GRP"));
        assertEquals(1, view.getCate().getMatchCount());
        assertEquals(List.of("A"), view.getMemberCodes());
    }

    // ── R12 — TABLE 일괄 적용은 전부-아니면-전무 ──────────────────────────────

    @Test
    void R12_TABLE_일괄_적용은_하나가_실패하면_전체_롤백된다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "MD1", 0);
        DmdSegmentTestSupport.insertCateRow(jdbc, "MD1", "GRP", "TABLE", null, null, DmdSegmentTestSupport.T0,
                DmdSegmentTestSupport.OPEN);
        DmdSegmentTestSupport.insertItemRow(jdbc, "MD1", "A", "Alpha", DmdSegmentTestSupport.T0,
                DmdSegmentTestSupport.OPEN, 0, null, null);
        // "NOPE" 는 존재하지 않는 항목이다 — A(유효, 먼저) 뒤에 와서 실제 부분 삽입이 일어난 뒤 실패해야 한다

        CateSaveRequest req = new CateSaveRequest();
        req.setMaruDataId("MD1");
        req.setCateId("GRP");

        assertThrows(BusinessException.class, () -> service.save(req, codeRows("A", "NOPE"), null));

        assertEquals(0, jdbc.queryForObject(
                "SELECT COUNT(*) FROM TB_MDM_DATA_CATE_ITEM WHERE MARU_DATA_ID='MD1' AND CATE_ID='GRP'", Integer.class));
    }

    @Test
    void save_는_TABLE_소속을_추가하고_해제한다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "MD1", 0);
        DmdSegmentTestSupport.insertCateRow(jdbc, "MD1", "GRP", "TABLE", null, null, DmdSegmentTestSupport.T0,
                DmdSegmentTestSupport.OPEN);
        DmdSegmentTestSupport.insertItemRow(jdbc, "MD1", "A", "Alpha", DmdSegmentTestSupport.T0,
                DmdSegmentTestSupport.OPEN, 0, null, null);
        DmdSegmentTestSupport.insertItemRow(jdbc, "MD1", "B", "Bravo", DmdSegmentTestSupport.T0,
                DmdSegmentTestSupport.OPEN, 0, null, null);
        DmdSegmentTestSupport.insertMemberRow(jdbc, "MD1", "GRP", "A", DmdSegmentTestSupport.T0,
                DmdSegmentTestSupport.OPEN);

        CateSaveRequest req = new CateSaveRequest();
        req.setMaruDataId("MD1");
        req.setCateId("GRP");

        CateViewResult view = service.save(req, codeRows("B"), codeRows("A"));
        assertEquals(List.of("B"), view.getMemberCodes());
    }

    // ── R2′ — dataCateEdit 는 스스로 잠그지 않는다(DataCategorySegmentCore 가 딱 한 번씩) ──

    @Test
    void R2_reg는_잠금을_한_번만_한다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "MD1", 0);
        DataSegmentLock spyLock = spy(lock);
        DataCateEditService spiedService = withSpyLock(spyLock);

        spiedService.register(regRequest("MD1", "C1", "카테고리", "REGEX", "^A.*$", "KEY", null));

        verify(spyLock, times(1)).lock("MD1");
    }

    @Test
    void R2_TABLE_일괄_적용은_addCodes와_removeCodes_수만큼_잠근다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "MD1", 0);
        DmdSegmentTestSupport.insertCateRow(jdbc, "MD1", "GRP", "TABLE", null, null, DmdSegmentTestSupport.T0,
                DmdSegmentTestSupport.OPEN);
        DmdSegmentTestSupport.insertItemRow(jdbc, "MD1", "A", "Alpha", DmdSegmentTestSupport.T0,
                DmdSegmentTestSupport.OPEN, 0, null, null);
        DmdSegmentTestSupport.insertItemRow(jdbc, "MD1", "B", "Bravo", DmdSegmentTestSupport.T0,
                DmdSegmentTestSupport.OPEN, 0, null, null);
        DataSegmentLock spyLock = spy(lock);
        DataCateEditService spiedService = withSpyLock(spyLock);

        CateSaveRequest req = new CateSaveRequest();
        req.setMaruDataId("MD1");
        req.setCateId("GRP");

        spiedService.save(req, codeRows("A", "B"), null);

        verify(spyLock, times(2)).lock("MD1"); // addMember 두 번 — 각자 DataCategorySegmentCore 안에서 한 번씩만 잠근다
    }

    // ── search·view·compare ────────────────────────────────────────────────

    @Test
    void search_는_카테고리_목록과_마루_데이터_머리를_돌려준다() {
        DmdSegmentTestSupport.insertMaruData(jdbc, "MD1", "MDM", null, "INUSE", DmdSegmentTestSupport.DEFAULT_PATTERN, 2,
                "속성1");
        DmdSegmentTestSupport.insertCateRow(jdbc, "MD1", "BASE", "REGEX", ".*", "KEY", DmdSegmentTestSupport.T0,
                DmdSegmentTestSupport.OPEN);

        CateSearchResult result = service.search(searchRequest("MD1"));

        assertEquals(2, result.getLvlCnt());
        assertEquals("속성1", result.getAttrLabels().get(0));
        assertEquals(1, result.getList().size());
    }

    @Test
    void compare_는_문법_오류면_invalid를_돌려준다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "MD1", 0);

        CateCompareRequest req = new CateCompareRequest();
        req.setMaruDataId("MD1");
        req.setDefExpr("[");
        req.setDefTarget("KEY");

        assertTrue(service.compare(req).isInvalid());
    }

    /**
     * compare 응답은 매칭된 항목의 코드·이름을 함께 준다(2026-09-30) — 화면의 REGEX 소속 목록이 이름 칸을 그린다.
     * `dataCateEdit.view` 의 `items` 는 TABLE 카테고리에서만 채워지므로, REGEX 는 여길 통해서만 이름을 얻는다.
     */
    @Test
    void compare_는_매칭된_항목의_코드와_이름을_준다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "MD1", 0);
        DmdSegmentTestSupport.insertItemRow(jdbc, "MD1", "KRPUS", "부산", T0.minusDays(5), OPEN, 0,
                List.of("KR"), List.of());
        DmdSegmentTestSupport.insertItemRow(jdbc, "MD1", "CNSHA", "상하이", T0.minusDays(5), OPEN, 0,
                List.of("CN"), List.of());

        CateCompareRequest req = new CateCompareRequest();
        req.setMaruDataId("MD1");
        req.setDefExpr("^KR$");
        req.setDefTarget("LVL1");

        CateCompareResult out = service.compare(req);

        assertFalse(out.isInvalid());
        assertEquals(List.of("KRPUS"), out.getCodes());
        assertEquals(1, out.getCount());
        assertEquals(List.of(new CateCompareResult.Item("KRPUS", "부산")), out.getItems());
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private DataCateEditService withSpyLock(DataSegmentLock spyLock) {
        DataCategorySegmentCore core = new DataCategorySegmentCore(transactionManager, spyLock, rowStore, cateStore,
                memberStore, checks, clock);
        return new DataCateEditService(entityManager, rowStore, core, resolver, transactionManager);
    }

    private static CateRegRequest regRequest(String md, String cateId, String name, String defKind, String defExpr,
                                             String defTarget, String description) {
        CateRegRequest req = new CateRegRequest();
        req.setMaruDataId(md);
        req.setCateId(cateId);
        req.setCateName(name);
        req.setDefKind(defKind);
        req.setDefExpr(defExpr);
        req.setDefTarget(defTarget);
        req.setDescription(description);
        return req;
    }

    private static CateViewRequest viewRequest(String md, String cateId) {
        CateViewRequest req = new CateViewRequest();
        req.setMaruDataId(md);
        req.setCateId(cateId);
        return req;
    }

    private static CateSearchRequest searchRequest(String md) {
        CateSearchRequest req = new CateSearchRequest();
        req.setMaruDataId(md);
        return req;
    }

    /** grids 행 모양(행마다 code) — dataCateEdit save 는 소속 목록을 grids 로 받는다. */
    private static java.util.List<java.util.Map<String, Object>> codeRows(String... codes) {
        return java.util.Arrays.stream(codes).map(c -> java.util.Map.<String, Object>of("code", c)).toList();
    }
}
