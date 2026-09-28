package com.dongkuk.dmes.mdm.common.segment;

import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.OPEN;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.T0;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.count;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.insertMaruData;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.insertMdm;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.itemRows;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.text;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateRegRequest;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateSaveRequest;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.service.DataCateEditService;
import com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.dto.DataCsvSaveRequest;
import com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.service.DataCsvUploadPopService;
import com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.service.Rfc4180Csv;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemKeyRequest;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemSaveRequest;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.service.DataItemMngService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import javax.sql.DataSource;
import kr.dongkuk.maru.mdm.engine.code.MasterDataResolver;
import kr.dongkuk.maru.mdm.engine.code.MasterDataRows;
import kr.dongkuk.maru.mdm.engine.code.MasterDataRows.DataCateItemRow;
import kr.dongkuk.maru.mdm.engine.code.MasterDataRows.DataCateRow;
import kr.dongkuk.maru.mdm.engine.code.MasterDataRows.DataHeader;
import kr.dongkuk.maru.mdm.engine.code.MasterDataRows.DataItemRow;
import kr.dongkuk.maru.mdm.engine.spi.MasterLookup;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-09-02 design.md B2 — PORT·ORG 화면·CSV 선분 규칙 + 05 「판정 참고 구현」 원장 판정 7케이스, CUST 음성 케이스.
 *
 * <p>05 마루 데이터 판정(MASTER_AT)은 MDM 서버 자신이 운영 빈으로 켜는 기능이 아니다({@link MasterLookup}, D-077/D5,
 * "04 원장 미구축" D2 — 05 도 같다). {@link MasterDataResolver} 는 이미 "행 공급 함수"를 인자로 받는 일반 구현이라, 이
 * 함수 인자에 이 시험 코드 안에서만 조립한 {@link JdbcTemplate} 조회를 꽂아 원장(SQLite 테스트 DB)을 직접 읽는다 —
 * 운영 {@code MasterLookup} 빈은 새로 등록하지 않는다(G0).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmdSegmentTestSupport.Config.class)
class MasterDataLedgerJudgmentSqliteTest extends AbstractMdmSharedDbTest {

    private static final String PORT = "PORT";
    private static final String ORG = "ORG";
    private static final String CUST = "CUST";
    private static final DateTimeFormatter TEXT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Autowired
    DataItemMngService itemService;
    @Autowired
    DataCsvUploadPopService csvService;
    @Autowired
    DataCateEditService cateService;
    @Autowired
    MutableClock clock;
    @Autowired
    DataSource dataSource;
    @Autowired
    ApplicationContext context;

    private JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        DmdSegmentTestSupport.clear(jdbc);
        clock.setLocal(T0);
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @AfterEach
    void clearThreadLocals() {
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    // ── G0 — 운영 빈 미등록(불변 규칙) ─────────────────────────────────────────

    @Test
    void G0_운영_MasterLookup_빈은_없다() {
        assertTrue(context.getBeansOfType(MasterLookup.class).isEmpty(), "MasterLookup 은 아직 운영 빈이 아니다(05 D2, D-077/D5)");
    }

    // ── PORT — 05 「판정 참고 구현」 7케이스(원장, 화면 경로로 쌓은 데이터) ──────

    @Test
    void PORT_화면_경로로_쌓은_원장이_05_판정_참고_구현_7케이스와_일치한다() {
        buildPortLedger();
        MasterDataResolver resolver = resolver();

        assertAll(
                () -> assertTrue(resolver.isValid(PORT, "BASE", "KRPUS", dt("2026-09-06T00:00")), "BASE, 열린 항목"),
                () -> assertTrue(resolver.isValid(PORT, "BASE", "KRPUS", dt("2026-08-22T00:00")), "첫 선분 행(이름 수정 전)"),
                () -> assertTrue(resolver.isValid(PORT, "BASE", "KRINC", dt("2026-08-15T00:00")), "등록 전 기준일 — 최초 행 소급"),
                () -> assertFalse(resolver.isValid(PORT, "BASE", "KRINC", dt("2026-09-06T00:00")), "닫힌 뒤"),
                () -> assertFalse(resolver.isValid(PORT, "KR", "CNSHA", dt("2026-09-06T00:00")), "country 가 CN"),
                () -> assertTrue(resolver.isValid(PORT, "MAJOR", "KRPUS", dt("2026-09-06T00:00")), "TABLE 소속"),
                () -> assertFalse(resolver.isValid(PORT, "MAJOR", "KRINC", dt("2026-08-15T00:00")), "소속 행이 없다"));
    }

    /** 05:705-760 PORT 원천(화면 경로로 재현) — 등록·수정·닫기·카테고리 등록·TABLE 소속 적용을 그 사건 시각대로 쌓는다. */
    private void buildPortLedger() {
        insertMdm(jdbc, PORT, 0, "국가");

        clock.setLocal(dt("2026-08-19T09:00"));
        cateService.register(cateReg(PORT, "BASE", "기준", "REGEX", ".*", "KEY"));

        clock.setLocal(dt("2026-08-20T09:00"));
        itemService.register(itemReg(PORT, "KRPUS", "부산", "KR"));
        itemService.register(itemReg(PORT, "KRINC", "인천", "KR"));
        itemService.register(itemReg(PORT, "CNSHA", "상하이", "CN"));

        clock.setLocal(dt("2026-08-21T09:00"));
        cateService.register(cateReg(PORT, "KR", "국가", "REGEX", "^KR$", "ATTR01"));

        clock.setLocal(dt("2026-08-25T09:00"));
        DataItemSaveRequest mod = itemReg(PORT, "KRPUS", "부산항", "KR");
        mod.setExpectedRowVersion(0);
        itemService.modify(mod);

        clock.setLocal(dt("2026-09-01T09:00"));
        itemService.close(key(PORT, "KRINC", 0));

        clock.setLocal(dt("2026-09-02T09:00"));
        cateService.register(cateReg(PORT, "MAJOR", "주요항만", "TABLE", null, null));

        clock.setLocal(dt("2026-09-03T09:00"));
        CateSaveRequest member = new CateSaveRequest();
        member.setMaruDataId(PORT);
        member.setCateId("MAJOR");
        cateService.save(member, codeRows("KRPUS", "CNSHA"), null);
    }

    // ── ORG — 05:71-77 계층 5행(화면 경로) ──────────────────────────────────

    @Test
    void ORG_화면_경로_등록은_05_계층_5행과_일치한다() {
        insertMaruData(jdbc, ORG, "MDM", null, "INUSE", "^[0-9A-Z-]{1,20}$", 2);

        itemService.register(orgReg("HQ-PLN", "기획팀", 1, "HQ", null));
        itemService.register(orgReg("PH-B", "B공장", 1, "PH", null));
        itemService.register(orgReg("PH-A-PRD", "A공장 생산팀", 1, "PH", "PH-A"));
        itemService.register(orgReg("PH-A-MNT", "A공장 정비팀", 2, "PH", "PH-A"));
        itemService.register(orgReg("PH-A", "A공장", 2, "PH", null));

        assertEquals(5, count(jdbc, "TB_MDM_DATA_ITEM"));
        assertOrgRow("HQ-PLN", "기획팀", 1, "HQ", null);
        assertOrgRow("PH-B", "B공장", 1, "PH", null);
        assertOrgRow("PH-A-PRD", "A공장 생산팀", 1, "PH", "PH-A");
        assertOrgRow("PH-A-MNT", "A공장 정비팀", 2, "PH", "PH-A");
        assertOrgRow("PH-A", "A공장", 2, "PH", null, "PH-A 는 항목이자 그룹이다 — 자기 행은 lvl2 가 없다");
    }

    private void assertOrgRow(String code, String name, int seq, String lvl1, String lvl2) {
        assertOrgRow(code, name, seq, lvl1, lvl2, code);
    }

    private void assertOrgRow(String code, String name, int seq, String lvl1, String lvl2, String msg) {
        List<Map<String, Object>> rows = itemRows(jdbc, ORG, code);
        assertEquals(1, rows.size(), msg);
        assertEquals(name, rows.get(0).get("NAME"), msg);
        assertEquals(seq, ((Number) rows.get(0).get("SEQ")).intValue(), msg);
        assertEquals(lvl1, rows.get(0).get("LVL1"), msg);
        assertEquals(lvl2, rows.get(0).get("LVL2"), msg);
    }

    // ── 화면·CSV 경로가 같은 선분 모양을 낸다(수정·등록) ──────────────────────

    @Test
    void PORT_화면_CSV_수정_경로는_같은_선분_모양을_낸다() {
        insertMdm(jdbc, PORT, 0, "국가");
        itemService.register(itemReg(PORT, "KRPUS", "부산", "KR"));
        itemService.register(itemReg(PORT, "KRINC", "인천", "KR"));

        clock.setLocal(T0.plusDays(1));
        DataItemSaveRequest mod = itemReg(PORT, "KRPUS", "부산항", "KR");
        mod.setExpectedRowVersion(0);
        itemService.modify(mod);

        clock.setLocal(T0.plusDays(2));
        csvService.save(csvSave(PORT, csv(dataLine("KRINC", "인천항", "", "", "", "", "", "", "", "", "KR"))));

        List<Map<String, Object>> screenRows = itemRows(jdbc, PORT, "KRPUS");
        List<Map<String, Object>> csvRows = itemRows(jdbc, PORT, "KRINC");
        assertEquals(2, screenRows.size(), "화면 수정 — 옛 행 닫힘 + 새 행");
        assertEquals(2, csvRows.size(), "CSV 수정 — 옛 행 닫힘 + 새 행");
        assertEquals(screenRows.get(0).get("VALID_TO"), screenRows.get(1).get("VALID_FROM"),
                "화면 — 닫힌 시각 = 새 행 시작(같은 선분 모양)");
        assertEquals(csvRows.get(0).get("VALID_TO"), csvRows.get(1).get("VALID_FROM"),
                "CSV — 닫힌 시각 = 새 행 시작(화면과 같은 모양)");
        assertEquals(text(T0.plusDays(1)), screenRows.get(0).get("VALID_TO"));
        assertEquals(text(T0.plusDays(2)), csvRows.get(0).get("VALID_TO"));
        assertEquals(1, ((Number) screenRows.get(1).get("ROW_VERSION")).intValue());
        assertEquals(1, ((Number) csvRows.get(1).get("ROW_VERSION")).intValue());
    }

    @Test
    void ORG_화면_CSV_등록_경로는_같은_선분_모양을_낸다() {
        insertMaruData(jdbc, ORG, "MDM", null, "INUSE", "^[0-9A-Z-]{1,20}$", 2);

        itemService.register(orgReg("PH-B", "B공장", 1, "PH", null));
        csvService.save(csvSave(ORG, csv(dataLine("PH-C", "C공장", "", "", "", "PH"))));

        List<Map<String, Object>> screenRow = itemRows(jdbc, ORG, "PH-B");
        List<Map<String, Object>> csvRow = itemRows(jdbc, ORG, "PH-C");
        assertEquals(1, screenRow.size());
        assertEquals(1, csvRow.size());
        assertEquals(0, ((Number) screenRow.get(0).get("ROW_VERSION")).intValue(), "화면 INSERT — rowVersion 0");
        assertEquals(0, ((Number) csvRow.get(0).get("ROW_VERSION")).intValue(), "CSV INSERT — rowVersion 0(같은 모양)");
        assertEquals(OPEN, screenRow.get(0).get("VALID_TO"));
        assertEquals(OPEN, csvRow.get(0).get("VALID_TO"));
        assertEquals("PH", csvRow.get(0).get("LVL1"), "CSV 경로도 화면과 같은 계층 칸을 채운다");
    }

    // ── CUST — EXTERNAL 원천은 화면·CSV 양쪽 다 거부한다(음성 케이스, D3·DF-2) ──

    @Test
    void CUST_화면_경로는_원천_불일치로_거부한다() {
        insertMaruData(jdbc, CUST, "EXTERNAL", "ERP", "INUSE", DmdSegmentTestSupport.DEFAULT_PATTERN, 0, "사업자번호");

        BusinessException e = assertThrows(BusinessException.class,
                () -> itemService.register(itemReg(CUST, "C001", "거래처", null)));
        assertTrue(e.getMessage().contains(DataItemMessages.SOURCE_MISMATCH), e.getMessage());
        assertEquals(0, count(jdbc, "TB_MDM_DATA_ITEM"));
    }

    /** DF-2 대상 — CUST 의 정규 경로(수신 API)는 프로덕션 구현이 없어(D3) 다루지 않는다. 화면·CSV 거부만 확인한다. */
    @Test
    void CUST_CSV_경로도_원천_불일치로_거부한다() {
        insertMaruData(jdbc, CUST, "EXTERNAL", "ERP", "INUSE", DmdSegmentTestSupport.DEFAULT_PATTERN, 0, "사업자번호");

        BusinessException e = assertThrows(BusinessException.class,
                () -> csvService.save(csvSave(CUST, csv(dataLine("C001", "거래처")))));
        assertTrue(e.getMessage().contains(DataItemMessages.SOURCE_MISMATCH), e.getMessage());
        assertEquals(0, count(jdbc, "TB_MDM_DATA_ITEM"));
    }

    // ── 원장 직접 읽기(시험 코드 안에서만 조립, 운영 빈 아님) ─────────────────

    private MasterDataResolver resolver() {
        return new MasterDataResolver(id -> Optional.ofNullable(fetchRows(id)));
    }

    private MasterDataRows fetchRows(String maruDataId) {
        List<Map<String, Object>> hdr =
                jdbc.queryForList("SELECT STATUS, CLOSED_AT FROM TB_MDM_DATA WHERE MARU_DATA_ID = ?", maruDataId);
        if (hdr.isEmpty()) {
            return null;
        }
        String status = (String) hdr.get(0).get("STATUS");
        String closedAtText = (String) hdr.get(0).get("CLOSED_AT");
        LocalDateTime closedAt = closedAtText == null ? null : parse(closedAtText);

        List<DataItemRow> items = jdbc.query(
                "SELECT CODE, NAME, ALTER_NAME, SEQ, LVL1, LVL2, LVL3, LVL4, LVL5, "
                        + "ATTR01, ATTR02, ATTR03, ATTR04, ATTR05, ATTR06, ATTR07, ATTR08, ATTR09, ATTR10, "
                        + "VALID_FROM, VALID_TO FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = ?",
                (rs, n) -> new DataItemRow(rs.getString("CODE"), rs.getString("NAME"), rs.getString("ALTER_NAME"),
                        rs.getObject("SEQ") == null ? null : ((Number) rs.getObject("SEQ")).intValue(),
                        Arrays.asList(rs.getString("LVL1"), rs.getString("LVL2"), rs.getString("LVL3"),
                                rs.getString("LVL4"), rs.getString("LVL5")),
                        Arrays.asList(rs.getString("ATTR01"), rs.getString("ATTR02"), rs.getString("ATTR03"),
                                rs.getString("ATTR04"), rs.getString("ATTR05"), rs.getString("ATTR06"),
                                rs.getString("ATTR07"), rs.getString("ATTR08"), rs.getString("ATTR09"),
                                rs.getString("ATTR10")),
                        parse(rs.getString("VALID_FROM")), parse(rs.getString("VALID_TO"))),
                maruDataId);

        List<DataCateRow> categories = jdbc.query(
                "SELECT CATE_ID, DEF_KIND, DEF_EXPR, DEF_TARGET, VALID_FROM, VALID_TO FROM TB_MDM_DATA_CATE "
                        + "WHERE MARU_DATA_ID = ?",
                (rs, n) -> new DataCateRow(rs.getString("CATE_ID"), rs.getString("DEF_KIND"), rs.getString("DEF_EXPR"),
                        rs.getString("DEF_TARGET"), parse(rs.getString("VALID_FROM")), parse(rs.getString("VALID_TO"))),
                maruDataId);

        List<DataCateItemRow> cateItems = jdbc.query(
                "SELECT CATE_ID, CODE, VALID_FROM, VALID_TO FROM TB_MDM_DATA_CATE_ITEM WHERE MARU_DATA_ID = ?",
                (rs, n) -> new DataCateItemRow(rs.getString("CATE_ID"), rs.getString("CODE"),
                        parse(rs.getString("VALID_FROM")), parse(rs.getString("VALID_TO"))),
                maruDataId);

        return new MasterDataRows(new DataHeader(maruDataId, status, closedAt), items, categories, cateItems);
    }

    private static LocalDateTime parse(String text) {
        return LocalDateTime.parse(text, TEXT);
    }

    private static LocalDateTime dt(String iso) {
        return LocalDateTime.parse(iso);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private static DataItemSaveRequest itemReg(String md, String code, String name, String attr01) {
        DataItemSaveRequest r = new DataItemSaveRequest();
        r.setMaruDataId(md);
        r.setCode(code);
        r.setName(name);
        r.setAttr01(attr01);
        return r;
    }

    private static DataItemSaveRequest orgReg(String code, String name, int seq, String lvl1, String lvl2) {
        DataItemSaveRequest r = new DataItemSaveRequest();
        r.setMaruDataId(ORG);
        r.setCode(code);
        r.setName(name);
        r.setSeq(seq);
        r.setLvl1(lvl1);
        r.setLvl2(lvl2);
        return r;
    }

    private static DataItemKeyRequest key(String md, String code, int rowVersion) {
        DataItemKeyRequest r = new DataItemKeyRequest();
        r.setMaruDataId(md);
        r.setCode(code);
        r.setExpectedRowVersion(rowVersion);
        return r;
    }

    private static CateRegRequest cateReg(String md, String cateId, String name, String defKind, String defExpr,
                                          String defTarget) {
        CateRegRequest r = new CateRegRequest();
        r.setMaruDataId(md);
        r.setCateId(cateId);
        r.setCateName(name);
        r.setDefKind(defKind);
        r.setDefExpr(defExpr);
        r.setDefTarget(defTarget);
        return r;
    }

    private static DataCsvSaveRequest csvSave(String md, String text) {
        DataCsvSaveRequest r = new DataCsvSaveRequest();
        r.setMaruDataId(md);
        r.setCsvText(text);
        return r;
    }

    /** 20 고정 컬럼 수만큼 뒤를 빈 칸으로 채운 데이터 행(DataCsvUploadPopServiceSqliteTest 와 같은 패턴). */
    private static String dataLine(String... firstFields) {
        List<String> fields = new ArrayList<>(List.of(firstFields));
        while (fields.size() < Rfc4180Csv.HEADER.size()) {
            fields.add("");
        }
        return String.join(",", fields);
    }

    private static String header() {
        return String.join(",", Rfc4180Csv.HEADER);
    }

    private static String csv(String... dataLines) {
        StringBuilder sb = new StringBuilder(header());
        for (String line : dataLines) {
            sb.append("\r\n").append(line);
        }
        return sb.toString();
    }

    /** grids 행 모양(행마다 code) — dataCateEdit save 는 소속 목록을 grids 로 받는다. */
    private static java.util.List<java.util.Map<String, Object>> codeRows(String... codes) {
        return java.util.Arrays.stream(codes).map(c -> java.util.Map.<String, Object>of("code", c)).toList();
    }
}
