package com.dongkuk.dmes.mdm.dma.columnMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mdm.common.dictionary.ColumnDescriptionSanitizer;
import com.dongkuk.dmes.mdm.common.perf.QueryCountProbe;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dma.columnMng.dto.ColumnMngCompareRequest;
import com.dongkuk.dmes.mdm.dma.columnMng.dto.ColumnMngSaveRequest;
import com.dongkuk.dmes.mdm.dma.columnMng.service.ColumnMngService;
import com.dongkuk.dmes.mdm.dma.naming.TermDictionary;
import com.dongkuk.dmes.mdm.dma.naming.TermEntry;
import com.dongkuk.dmes.mdm.dma.termRegPop.dto.TermRegPopRegRequest;
import com.dongkuk.dmes.mdm.dma.termRegPop.dto.TermRegPopSearchRequest;
import com.dongkuk.dmes.mdm.dma.termRegPop.service.TermRegPopService;
import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.repository.MdmColumnRepository;
import com.dongkuk.dmes.mdm.repository.MdmColumnSystemRepository;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import com.dongkuk.oasis.audit.AuditHolder;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 항목 4(컬럼 검색·조회 정리) 1단계 특성 테스트 — 반복문 안 단건 조회 세 곳과 용어 사전 읽기 사본 둘의 지금 동작을 실제 SQLite 스키마로 고정한다.
 *
 * <ul>
 *   <li>{@code save} 의 {@code resolveTermIds} — terms 그리드 행마다 {@code existsById}.</li>
 *   <li>{@code save} 의 {@code validateMappings} — 충돌 행마다 소유 컬럼 {@code findById}(컬럼명).</li>
 *   <li>{@code compare(REVERSE)} 의 {@code duplicates} — 시스템 필드명이 걸린 매핑마다 {@code findById}.</li>
 *   <li>{@code ColumnMngService.loadDictionary} 와 {@code TermRegPopService.loadDictionary} — 글자 그대로 같은 사본이다(차이 없음을 고정).</li>
 * </ul>
 *
 * <p>사본 비교 시험은 두 private 메서드를 이름으로 부른다 — 2단계가 둘을 하나로 합치면 그 시험은 합친 곳을 부르게 고쳐 써야 한다.
 * 공개 경로(분해·용어 등록 팝업)로 보는 시험과 사전은 요청마다 새로 읽는다(I26) 시험은 그대로 남는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmaTestSupport.Config.class)
class ColumnMngLookupCharacterizationTest extends AbstractMdmSharedDbTest {

    private static final String MDM017 = MdmErrorCode.NAME_PLACEHOLDER_REMAINS.defaultMessage();
    private static final String MDM018 = MdmErrorCode.SYSTEM_FIELD_ALREADY_MAPPED.defaultMessage();

    @Autowired
    ColumnMngService service;
    @Autowired
    TermRegPopService termRegPop;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    MdmTermRepository terms;
    @Autowired
    MdmDomainRepository domains;
    @Autowired
    MdmColumnRepository columns;
    @Autowired
    MdmColumnSystemRepository mappings;
    @Autowired
    DataSource dataSource;
    @Autowired
    PlatformTransactionManager tm;
    @Autowired
    EntityManager em;
    @Autowired
    EntityManagerFactory emf;

    private JdbcTemplate jdbc;
    private TransactionTemplate tx;
    private QueryCountProbe probe;
    private MdmTerm rmtl;
    private MdmTerm coil;
    private MdmTerm thk;
    private MdmDomain rmtlCoilThk;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        tx = new TransactionTemplate(tm);
        DmaTestSupport.clear(jdbc);
        currentUser.set("admin1", Set.of(MdmRoles.STD_ADMIN));
        AuditHolder.remove();
        UserContextHolder.clear();
        probe = new QueryCountProbe(tm, em, emf, "columnMng.lookup");
        probe.start();
        rmtl = DmaTestSupport.term(terms, "원재료", "RMTL", "Raw Material", "[\"원자재(ERP)\"]");
        coil = DmaTestSupport.term(terms, "코일", "COIL", "Coil", null);
        thk = DmaTestSupport.term(terms, "두께", "THK", "Thickness", null);
        rmtlCoilThk = DmaTestSupport.domain(domains, "원재료 코일 두께", "RMTL_COIL_THK");
    }

    @AfterEach
    void tearDown() {
        probe.stop();
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    // ── ① save.resolveTermIds — 행마다 existsById ──────────────────────────

    @Test
    void 용어_일부만_없으면_없는_ID_만_입력_순서대로_MDM017_이고_아무것도_저장하지_않는다() {
        BusinessException e = assertThrows(BusinessException.class,
                () -> save(valid(), List.of(), termRows(rmtl.getTermId(), 987654L, coil.getTermId(), 987653L)));

        assertEquals(MDM017 + ": 용어 ID 987654, 용어 ID 987653", e.getMessage());
        assertEquals(List.of(MdmErrorCode.NAME_PLACEHOLDER_REMAINS.code()), codes(e), "상세는 기본 문구 한 줄뿐");
        assertEquals(0, count("TB_MDM_COLUMN"));
    }

    @Test
    void 용어가_전부_없으면_모두_적는다() {
        BusinessException e = assertThrows(BusinessException.class,
                () -> save(valid(), List.of(), termRows(222222L, 111111L)));

        assertEquals(MDM017 + ": 용어 ID 222222, 용어 ID 111111", e.getMessage(), "정렬하지 않고 입력 순서");
    }

    @Test
    void 없는_ID_가_두_번_오면_두_번_적는다() {
        BusinessException e = assertThrows(BusinessException.class,
                () -> save(valid(), List.of(), termRows(987654L, rmtl.getTermId(), 987654L)));

        assertEquals(MDM017 + ": 용어 ID 987654, 용어 ID 987654", e.getMessage());
    }

    @Test
    void 비거나_숫자가_아닌_termId_는_별표로_적는다() {
        List<Map<String, Object>> rows = new ArrayList<>();
        rows.add(null);
        rows.add(termRow(null));
        rows.add(termRow("abc"));
        rows.add(termRow("  "));
        rows.add(new LinkedHashMap<>());
        rows.add(termRow(987654L));

        BusinessException e = assertThrows(BusinessException.class, () -> save(valid(), List.of(), rows));

        assertEquals(MDM017 + ": ***, ***, ***, ***, ***, 용어 ID 987654", e.getMessage());
    }

    @Test
    void 있는_ID_는_중복도_그대로_두고_문자열_숫자_형식도_받는다() {
        List<Map<String, Object>> rows = new ArrayList<>();
        rows.add(termRow(rmtl.getTermId()));
        rows.add(termRow(" " + rmtl.getTermId() + " "));
        rows.add(termRow(coil.getTermId().intValue()));
        rows.add(termRow(thk.getTermId() + 0.9d));

        save(valid(), List.of(), rows);

        assertEquals("[" + rmtl.getTermId() + "," + rmtl.getTermId() + "," + coil.getTermId() + "," + thk.getTermId() + "]",
                termIdsOf("RMTL_COIL_THK"), "중복 유지·문자열은 trim 뒤 parseLong·Number 는 longValue(소수는 버림)");
    }

    @Test
    void 논리명과_상관없는_용어_목록도_있기만_하면_받는다() {
        save(valid(), List.of(), termRows(thk.getTermId()));

        assertEquals("[" + thk.getTermId() + "]", termIdsOf("RMTL_COIL_THK"));
    }

    @Test
    void 없는_용어는_물리명_형식_도메인_존재_검사보다_먼저다() {
        ColumnMngSaveRequest req = valid();
        req.setPhysName("rmtl_coil_thk");
        req.setDomainId(999999L);

        BusinessException e = assertThrows(BusinessException.class, () -> save(req, List.of(), termRows(987654L)));

        assertEquals(MDM017 + ": 용어 ID 987654", e.getMessage());
    }

    // ── ② save.validateMappings — 충돌 행마다 소유 컬럼 findById ──────────

    @Test
    void 서로_다른_두_컬럼과_충돌하면_요청_행_순서대로_적고_이슈도_같은_순서다() {
        MdmColumn ga = DmaTestSupport.column(columns, "가 컬럼", "GA_COL", null);
        DmaTestSupport.mapping(mappings, ga.getColumnId(), "ERP", "MATNR", null);
        MdmColumn na = DmaTestSupport.column(columns, "나 컬럼", "NA_COL", null);
        DmaTestSupport.mapping(mappings, na.getColumnId(), "MES", "AMB", null);

        BusinessException e = assertThrows(BusinessException.class, () -> save(valid(),
                List.of(sys("MES", "amb"), sys("ERP", "CHARG"), sys("ERP", "MATNR")), List.of()));

        String first = "MES·amb → 컬럼 '나 컬럼'(AMB)";
        String second = "ERP·MATNR → 컬럼 '가 컬럼'";
        assertEquals(MDM018 + ": " + first + ", " + second, e.getMessage());
        List<ErrorDetail> details = e.getErrors();
        assertEquals(3, details.size());
        assertEquals(new ErrorDetail(null, null, null, null, "MDM018", MDM018), details.get(0));
        assertEquals(new ErrorDetail(null, "MES", null, "physName", "MDM018", first), details.get(1));
        assertEquals(new ErrorDetail(null, "ERP", null, "physName", "MDM018", second), details.get(2));
        assertEquals(2, count("TB_MDM_COLUMN"), "저장된 것 없음");
        assertEquals(2, count("TB_MDM_COLUMN_SYSTEM"));
    }

    @Test
    void 대소문자만_다른_요청_두_행이_같은_컬럼과_충돌하면_소유_컬럼명이_두_번_나온다() {
        MdmColumn na = DmaTestSupport.column(columns, "나 컬럼", "NA_COL", null);
        DmaTestSupport.mapping(mappings, na.getColumnId(), "MES", "AMB", null);

        BusinessException e = assertThrows(BusinessException.class,
                () -> save(valid(), List.of(sys("MES", "Amb"), sys("MES", "AMB")), List.of()));

        assertEquals(MDM018 + ": MES·Amb → 컬럼 '나 컬럼'(AMB), MES·AMB → 컬럼 '나 컬럼'", e.getMessage());
        assertEquals(3, e.getErrors().size());
    }

    @Test
    void 다른_컬럼이_대소문자만_다른_매핑_두_개를_가지면_요청_한_행에_충돌_두_개다() {
        MdmColumn na = DmaTestSupport.column(columns, "나 컬럼", "NA_COL", null);
        DmaTestSupport.mapping(mappings, na.getColumnId(), "MES", "AMB", null);
        DmaTestSupport.mapping(mappings, na.getColumnId(), "MES", "amb", null);

        BusinessException e = assertThrows(BusinessException.class,
                () -> save(valid(), List.of(sys("MES", "Amb")), List.of()));

        // 조회에 ORDER BY 가 없다 — 두 문장의 순서는 단언하지 않는다
        assertTrue(e.getMessage().startsWith(MDM018 + ": "), e.getMessage());
        assertTrue(e.getMessage().contains("MES·Amb → 컬럼 '나 컬럼'(AMB)"), e.getMessage());
        assertTrue(e.getMessage().contains("MES·Amb → 컬럼 '나 컬럼'(amb)"), e.getMessage());
        assertEquals(3, e.getErrors().size());
    }

    @Test
    void 가리키는_컬럼_행이_없는_매핑과_충돌하면_컬럼_ID_숫자를_이름_자리에_적는다() throws SQLException {
        withForeignKeysOff("INSERT INTO TB_MDM_COLUMN_SYSTEM (COLUMN_ID, SYSTEM_CODE, PHYS_NAME) VALUES (999999, 'ERP', 'ORPHAN')");

        BusinessException e = assertThrows(BusinessException.class,
                () -> save(valid(), List.of(sys("ERP", "orphan")), List.of()));

        assertEquals(MDM018 + ": ERP·orphan → 컬럼 '999999'(ORPHAN)", e.getMessage());
        assertEquals(0, count("TB_MDM_COLUMN"));
    }

    // ── ③ compare(REVERSE).duplicates — 매핑마다 findById ─────────────────

    @Test
    void 역분해_중복은_한_컬럼의_매핑_둘이_걸리면_두_행이고_매핑_순서다() {
        MdmColumn x = DmaTestSupport.column(columns, "엑스 컬럼", "X_COL", rmtlCoilThk.getDomainId());
        x.setUsageNote("<p>메모 <b>굵게</b></p>");
        x = columns.save(x);
        DmaTestSupport.mapping(mappings, x.getColumnId(), "MES", "CHARG", null);
        DmaTestSupport.mapping(mappings, x.getColumnId(), "ERP", "CHARG", null);

        List<Map<String, Object>> dups = maps(service.compare(compare("REVERSE", "charg")).get("duplicates"));

        assertEquals(List.of("ERP", "MES"), dups.stream().map(m -> m.get("systemCode")).toList(), "중복을 합치지 않는다");
        assertEquals(List.of("columnId", "columnName", "physName", "usageNote", "domainId", "domainName", "matchedBy",
                "systemCode"), new ArrayList<>(dups.get(0).keySet()));
        Map<String, Object> row = dups.get(0);
        assertEquals(x.getColumnId(), row.get("columnId"));
        assertEquals("엑스 컬럼", row.get("columnName"));
        assertEquals("X_COL", row.get("physName"));
        assertEquals(ColumnDescriptionSanitizer.plainText("<p>메모 <b>굵게</b></p>"), row.get("usageNote"), "글자만");
        assertEquals(rmtlCoilThk.getDomainId(), row.get("domainId"));
        assertEquals("원재료 코일 두께", row.get("domainName"));
        assertEquals("SYSTEM_FIELD", row.get("matchedBy"));
    }

    @Test
    void 역분해_중복은_입력_그대로와_대문자만_찾고_매핑_순서로_늘어놓는다() {
        MdmColumn a = DmaTestSupport.column(columns, "가", "A_COL", null);
        MdmColumn b = DmaTestSupport.column(columns, "나", "B_COL", null);
        MdmColumn c = DmaTestSupport.column(columns, "다", "C_COL", null);
        DmaTestSupport.mapping(mappings, a.getColumnId(), "ERP", "Charg", null);
        DmaTestSupport.mapping(mappings, b.getColumnId(), "ERP", "CHARG", null);
        DmaTestSupport.mapping(mappings, c.getColumnId(), "ERP", "charg", null);
        DmaTestSupport.mapping(mappings, c.getColumnId(), "APS", "CHARG", null);

        List<Map<String, Object>> dups = maps(service.compare(compare("REVERSE", "Charg")).get("duplicates"));

        assertEquals(List.of("APS/다", "ERP/나", "ERP/가"),
                dups.stream().map(m -> m.get("systemCode") + "/" + m.get("columnName")).toList(),
                "Charg·CHARG 만 — charg 는 빠지고, 시스템 코드 → 필드명(대문자 먼저) 순서");
        assertTrue(dups.stream().allMatch(m -> "SYSTEM_FIELD".equals(m.get("matchedBy"))));
        assertEquals(null, dups.get(0).get("domainId"));
        assertEquals(null, dups.get(0).get("domainName"));
    }

    @Test
    void 역분해_중복은_같은_컬럼이_표준_물리명과_시스템_필드명으로_모두_걸리면_두_행이다() {
        MdmColumn x = DmaTestSupport.column(columns, "엑스", "CHARG", null);
        DmaTestSupport.mapping(mappings, x.getColumnId(), "ERP", "CHARG", null);

        List<Map<String, Object>> dups = maps(service.compare(compare("REVERSE", "charg")).get("duplicates"));

        assertEquals(List.of("PHYS_NAME", "SYSTEM_FIELD"), dups.stream().map(m -> m.get("matchedBy")).toList());
        assertEquals(List.of(x.getColumnId(), x.getColumnId()), dups.stream().map(m -> m.get("columnId")).toList());
        assertEquals(null, dups.get(0).get("systemCode"));
    }

    @Test
    void 역분해_중복은_가리키는_컬럼_행이_없는_매핑을_조용히_건너뛴다() throws SQLException {
        MdmColumn x = DmaTestSupport.column(columns, "엑스", "X_COL", null);
        DmaTestSupport.mapping(mappings, x.getColumnId(), "MES", "GHOST", null);
        withForeignKeysOff("INSERT INTO TB_MDM_COLUMN_SYSTEM (COLUMN_ID, SYSTEM_CODE, PHYS_NAME) VALUES (999999, 'ERP', 'GHOST')");

        List<Map<String, Object>> dups = maps(service.compare(compare("REVERSE", "ghost")).get("duplicates"));

        assertEquals(List.of("MES"), dups.stream().map(m -> m.get("systemCode")).toList());
    }

    // ── ④ 용어 사전 읽기 사본 둘 ──────────────────────────────────────────

    @Test
    void 두_서비스의_사전_읽기는_같은_입력에서_같은_사전을_만든다() {
        seedDictionaryVariants();

        TermDictionary a = loadDictionary(service);
        TermDictionary b = loadDictionary(termRegPop);

        assertEquals(a.all(), b.all());
        assertEquals(terms.count(), a.all().size(), "용어 표 전체를 읽는다");
        assertEquals(a.usedAbbrUpper(), b.usedAbbrUpper());
        assertEquals(Set.of("RMTL", "COIL", "THK", "SAME", "MIXED"), a.usedAbbrUpper(), "약어 없는 용어는 빠지고 대문자로 접는다");
        assertEquals(a.maxSurfaceLength(), b.maxSurfaceLength());
        assertEquals(a.maxAbbrParts(), b.maxAbbrParts());
        for (String surface : List.of("원재료", "원자재", "원료", "소재", "코일재", "코일", "두께", "같은약어1", "같은약어2",
                "섞인약어", "약어없음", "배열아님", "객체하나", "없는말")) {
            assertEquals(a.candidates(surface), b.candidates(surface), surface);
        }
        for (String abbr : List.of("rmtl", "SAME", "same", "Mixed", "MIXED", "NONE")) {
            assertEquals(a.byAbbr(abbr), b.byAbbr(abbr), abbr);
        }
        for (TermEntry term : a.all()) {
            assertEquals(a.synonymAliasKeys(term), b.synonymAliasKeys(term), term.termName());
        }
        assertEquals(a.byAbbr("SAME").termId(), Math.min(id("같은약어1"), id("같은약어2")), "같은 약어는 작은 ID 가 이긴다");
    }

    @Test
    void 컬럼_분해는_동의어와_별칭을_사전에서_찾는다() {
        seedDictionaryVariants();

        List<Map<String, Object>> tokens = maps(service.compare(compare("FORWARD", "원자재 코일재 두께")).get("tokens"));

        assertEquals(List.of(rmtl.getTermId(), coil.getTermId(), thk.getTermId()),
                tokens.stream().map(t -> t.get("termId")).toList());
    }

    @Test
    void 용어_등록_팝업은_약어를_대소문자_무시로_사용_중이라고_본다() {
        DmaTestSupport.term(terms, "섞인약어", "Mixed", "Mixed", null);

        BusinessException e = assertThrows(BusinessException.class, () -> termRegPop.reg(reg("새용어", "MIXED")));

        assertTrue(e.getMessage().startsWith(MdmErrorCode.TERM_DUPLICATED.defaultMessage() + ": 약어 MIXED 사용 중"),
                e.getMessage());
    }

    @Test
    void 두_서비스_모두_사전을_요청마다_새로_읽는다() {
        assertFalse(baseTaken(), "처음엔 XYL 이 비어 있다");
        assertEquals(List.of("UNKNOWN"), statuses("실로폰"));

        DmaTestSupport.term(terms, "실로폰", "xyl", "Xylophone", null);

        assertTrue(baseTaken(), "용어 등록 팝업 — 사이에 넣은 용어(소문자 약어)를 다음 호출이 본다");
        assertEquals(List.of("MATCHED"), statuses("실로폰"), "컬럼 분해 — 사이에 넣은 용어를 다음 호출이 본다");
    }

    // ── 쿼리 수(기록용) ───────────────────────────────────────────────────

    /**
     * 지금 Hibernate 문 수를 남긴다(단언하지 않는다 — 2단계가 바꿀 값이다). 결과는 {@code [query-count] columnMng.lookup ...} 줄로 찍힌다.
     * existsById 는 1차 캐시를 거치지 않아 행마다 문 하나다. findById 는 같은 트랜잭션에서 이미 읽은 컬럼이면 문이 나가지 않는다.
     */
    @Test
    void 쿼리_수_기록() {
        probe.measureInTx("save-terms-0(compose)", () -> service.save(valid(), List.of(), List.of()));
        probe.measureInTx("save-terms-3", () -> service.save(valid(), List.of(),
                termRows(rmtl.getTermId(), coil.getTermId(), thk.getTermId())));
        probe.measureInTx("save-terms-6(dup)", () -> service.save(valid(), List.of(),
                termRows(rmtl.getTermId(), coil.getTermId(), thk.getTermId(), rmtl.getTermId(), coil.getTermId(),
                        thk.getTermId())));

        List<Map<String, Object>> conflictRows = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            MdmColumn c = DmaTestSupport.column(columns, "충돌 " + i, "CONF_" + i, null);
            DmaTestSupport.mapping(mappings, c.getColumnId(), "ERP", "CF" + i, null);
            conflictRows.add(sys("ERP", "CF" + i));
        }
        QueryCountProbe.Measured<Map<String, Object>> conflict1 = probe.inTxCatching("save-conflict-1",
                () -> service.save(valid(), conflictRows.subList(0, 1), List.of()));
        assertTrue(conflict1.error() instanceof BusinessException);
        QueryCountProbe.Measured<Map<String, Object>> conflict3 = probe.inTxCatching("save-conflict-3",
                () -> service.save(valid(), conflictRows, List.of()));
        assertTrue(conflict3.error() instanceof BusinessException);

        for (int i = 0; i < 3; i++) {
            MdmColumn c = DmaTestSupport.column(columns, "역 " + i, "REV_" + i, null);
            DmaTestSupport.mapping(mappings, c.getColumnId(), "ERP", i == 0 ? "ONE" : "MANY", null);
            DmaTestSupport.mapping(mappings, c.getColumnId(), "MES", "MANY", null);
        }
        probe.measureInTx("compare-reverse-1col-1map", () -> service.compare(compare("REVERSE", "one")));
        probe.measureInTx("compare-reverse-3col-5map", () -> service.compare(compare("REVERSE", "many")));
        probe.measureInTx("compare-forward", () -> service.compare(compare("FORWARD", "원재료 코일 두께")));

        TermRegPopSearchRequest q = new TermRegPopSearchRequest();
        q.setTermName("원재료");
        q.setEngName("Raw Material");
        probe.measureInTx("termRegPop-search", () -> termRegPop.search(q));
    }

    // ── helpers ───────────────────────────────────────────────────────────

    /** 동의어·별칭 JSON 모양(문자열+괄호, name, term, 숫자, 다른 키, 배열 아닌 JSON — 깨진 JSON 은 표의 json_valid 검사로 못 넣는다)·같은 약어·대소문자 섞인 약어·약어 없음. */
    private void seedDictionaryVariants() {
        rmtl.setSynonyms("[\"원자재(ERP)\", {\"name\":\"원료\"}, {\"term\":\"소재\"}, 3, {\"x\":1}, \"  \"]");
        terms.save(rmtl);
        coil.setAliases("[\"코일재 (MES)\"]");
        terms.save(coil);
        DmaTestSupport.term(terms, "같은약어1", "SAME", "Same One", null);
        DmaTestSupport.term(terms, "같은약어2", "same", "Same Two", null);
        DmaTestSupport.term(terms, "섞인약어", "Mixed", "Mixed", null);
        DmaTestSupport.term(terms, "약어없음", null, null, null);
        DmaTestSupport.term(terms, "배열아님", "  ", null, "{\"name\":\"객체하나\"}");
    }

    private long id(String termName) {
        return terms.findByTermName(termName).get(0).getTermId();
    }

    private static TermDictionary loadDictionary(Object bean) {
        Object target = AopTestUtils.getUltimateTargetObject(bean);
        return ReflectionTestUtils.invokeMethod(target, "loadDictionary");
    }

    private boolean baseTaken() {
        TermRegPopSearchRequest q = new TermRegPopSearchRequest();
        q.setTermName("실로폰");
        q.setEngName("Xylophone");
        Map<String, Object> abbr = map(termRegPop.search(q).get("abbr"));
        assertEquals("XYL", abbr.get("base"));
        return (Boolean) abbr.get("baseTaken");
    }

    private List<Object> statuses(String input) {
        return maps(service.compare(compare("FORWARD", input)).get("tokens")).stream().map(t -> t.get("status")).toList();
    }

    private static TermRegPopRegRequest reg(String termName, String engAbbr) {
        TermRegPopRegRequest req = new TermRegPopRegRequest();
        req.setTermName(termName);
        req.setSenseNo(1);
        req.setDefinition(termName + " 정의");
        req.setEngAbbr(engAbbr);
        return req;
    }

    private ColumnMngSaveRequest valid() {
        ColumnMngSaveRequest req = new ColumnMngSaveRequest();
        req.setColumnName("원재료 코일 두께");
        req.setPhysName("RMTL_COIL_THK");
        req.setDomainId(rmtlCoilThk.getDomainId());
        return req;
    }

    private Long save(ColumnMngSaveRequest req, List<Map<String, Object>> systems, List<Map<String, Object>> termIds) {
        Map<String, Object> result = tx.execute(s -> service.save(req, systems, termIds));
        return ((Number) result.get("columnId")).longValue();
    }

    private String termIdsOf(String physName) {
        return jdbc.queryForObject("SELECT TERM_IDS FROM TB_MDM_COLUMN WHERE PHYS_NAME = ?", String.class, physName);
    }

    /** 풀 연결은 외래키 강제가 켜져 있다 — 한 autocommit 연결에서만 끄고 넣은 뒤 반드시 다시 켠다. */
    private void withForeignKeysOff(String sql) throws SQLException {
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            c.setAutoCommit(true);
            st.execute("PRAGMA foreign_keys = OFF");
            try {
                st.execute(sql);
            } finally {
                st.execute("PRAGMA foreign_keys = ON");
            }
        }
    }

    private static List<String> codes(BusinessException e) {
        return e.getErrors().stream().map(ErrorDetail::code).toList();
    }

    private static Map<String, Object> sys(String system, String phys) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("systemCode", system);
        row.put("physName", phys);
        return row;
    }

    private static Map<String, Object> termRow(Object termId) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("termId", termId);
        return row;
    }

    private static List<Map<String, Object>> termRows(Long... ids) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Long id : ids) {
            rows.add(termRow(id));
        }
        return rows;
    }

    private static ColumnMngCompareRequest compare(String direction, String input) {
        ColumnMngCompareRequest req = new ColumnMngCompareRequest();
        req.setDirection(direction);
        req.setInput(input);
        return req;
    }

    private int count(String table) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> maps(Object value) {
        return (List<Map<String, Object>>) value;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object value) {
        return (Map<String, Object>) value;
    }
}
