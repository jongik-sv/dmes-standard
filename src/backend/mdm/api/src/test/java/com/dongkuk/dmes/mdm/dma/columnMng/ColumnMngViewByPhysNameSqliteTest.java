package com.dongkuk.dmes.mdm.dma.columnMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dma.columnMng.dto.ColumnMngViewRequest;
import com.dongkuk.dmes.mdm.dma.columnMng.service.ColumnMngService;
import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.entity.MdmUnit;
import com.dongkuk.dmes.mdm.repository.MdmColumnRepository;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import com.dongkuk.dmes.mdm.repository.MdmUnitRepository;
import com.dongkuk.oasis.audit.AuditHolder;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 컬럼 정보 팝오버용 {@code columnMng.view} 물리명 조회 — 표준 물리명으로 찾고, 상속 체인으로 조립한 도메인 상세(이름·표준명·타입·길이·
 * 소수·단위)를 싣는다. columnId 조회는 기존 응답 모양 그대로(도메인 상세 없음)다. Oracle 시험 PDB 의 실제 컨텍스트로 돌린다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmaTestSupport.Config.class)
class ColumnMngViewByPhysNameSqliteTest extends AbstractMdmSharedDbTest {

    @Autowired
    ColumnMngService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    MdmTermRepository terms;
    @Autowired
    MdmDomainRepository domains;
    @Autowired
    MdmColumnRepository columns;
    @Autowired
    MdmUnitRepository units;
    @Autowired
    DataSource dataSource;
    @Autowired
    PlatformTransactionManager transactionManager;

    private static final String UNIT = "MM-CIV";

    private JdbcTemplate jdbc;
    private TransactionTemplate tx;
    private MdmDomain child;
    private MdmColumn column;
    private MdmColumn other;
    private MdmTerm rmtl;
    private MdmTerm thk;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        tx = new TransactionTemplate(transactionManager);
        DmaTestSupport.clear(jdbc);
        currentUser.set("viewer1", Set.of(MdmRoles.STD_ADMIN));
        AuditHolder.remove();
        UserContextHolder.clear();

        // 단위는 FK(TB_MDM_UNIT) — 다른 테스트의 단위 개수에 끼지 않게 끝나면 지운다(@AfterEach).
        if (units.findById(UNIT).isEmpty()) {
            MdmUnit unit = new MdmUnit(UNIT);
            unit.setDimension("LEN");
            unit.setBaseUnit(UNIT);
            unit.setFactor(BigDecimal.ONE);
            unit.setChgSeq(0L);
            units.save(unit);
        }
        // 부모가 길이·소수·단위를 정하고 자식은 길이만 덮어쓴다 — 자식의 유효값은 길이 12(자기)·소수 3·단위(부모)이다.
        MdmDomain parent = new MdmDomain("두께", "THK", "QTY", "NUMBER");
        parent.setLength(10);
        parent.setScale(3);
        parent.setUnitCode(UNIT);
        parent = domains.save(parent);
        MdmDomain c = new MdmDomain("코일 두께", "COIL_THK", "QTY", "NUMBER");
        c.setParentDomainId(parent.getDomainId());
        c.setLength(12);
        child = domains.save(c);

        rmtl = DmaTestSupport.term(terms, "원재료", "RMTL", "Raw Material", null);
        thk = DmaTestSupport.term(terms, "두께", "THK", "Thickness", null);

        MdmColumn col = new MdmColumn("원재료 코일 두께", "RMTL_COIL_THK", child.getDomainId());
        col.setLabelLong("원재료 코일 두께");
        col.setDescription("<p>코일 <b>두께</b></p>");
        col.setUsageNote("메모");
        col.setRequired(true);
        col.setTermIds("[" + rmtl.getTermId() + "," + thk.getTermId() + "]");
        column = columns.save(col);
        other = DmaTestSupport.column(columns, "도메인 없는 컬럼", "NO_DOMAIN_COL", null);
    }

    @AfterEach
    void clearThreadLocals() {
        DmaTestSupport.clear(jdbc);
        jdbc.update("DELETE FROM TB_MDM_UNIT WHERE UNIT_CODE = ?", UNIT);
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @Test
    void 물리명으로_찾고_상속_조립한_도메인_상세를_싣는다() {
        Map<String, Object> out = view(null, "RMTL_COIL_THK", null);

        Map<String, Object> col = map(out.get("column"));
        assertEquals(column.getColumnId(), ((Number) col.get("columnId")).longValue());
        assertEquals("원재료 코일 두께", col.get("columnName"));
        assertEquals("RMTL_COIL_THK", col.get("physName"));
        assertEquals("<p>코일 <b>두께</b></p>", col.get("description"));
        assertEquals("메모", col.get("usageNote"));
        assertEquals(Boolean.TRUE, col.get("required"));

        Map<String, Object> domain = map(out.get("domain"));
        assertEquals(child.getDomainId(), ((Number) domain.get("domainId")).longValue());
        assertEquals("코일 두께", domain.get("domainName"));
        assertEquals("COIL_THK", domain.get("stdName"));
        assertEquals("QTY", domain.get("domainKind"));
        assertEquals("NUMBER", domain.get("dataType"));
        assertEquals(12, domain.get("length"), "자기 길이가 부모 길이를 덮는다");
        assertEquals(3, domain.get("scale"), "소수는 부모에게서 물려받는다");
        assertEquals(UNIT, domain.get("unitCode"), "단위는 부모에게서 물려받는다");

        List<Map<String, Object>> termRows = maps(out.get("terms"));
        assertEquals(2, termRows.size());
        assertEquals("원재료", termRows.get(0).get("termName"));
        assertEquals("THK", termRows.get(1).get("engAbbr"));
    }

    @Test
    void 물리명은_앞뒤_공백을_떼고_소문자여도_찾는다() {
        Map<String, Object> out = view(null, "  rmtl_coil_thk ", null);
        assertEquals("RMTL_COIL_THK", map(out.get("column")).get("physName"));
    }

    @Test
    void 도메인이_없는_컬럼은_domain_이_null() {
        Map<String, Object> out = view(null, "NO_DOMAIN_COL", null);
        assertTrue(out.containsKey("domain"));
        assertNull(out.get("domain"));
    }

    @Test
    void 없는_물리명과_빈_물리명은_MDM021() {
        assertInvalid(() -> view(null, "NOT_EXISTS", null));
        assertInvalid(() -> view(null, "  ", null));
        assertInvalid(() -> view(null, null, null));
    }

    @Test
    void columnId_조회는_도메인_상세를_싣지_않는다_withDomain_이면_싣는다() {
        Map<String, Object> plain = view(column.getColumnId(), null, null);
        assertFalse(plain.containsKey("domain"), "기존 columnMng 화면 응답 모양 유지");

        Map<String, Object> withDomain = view(column.getColumnId(), null, Boolean.TRUE);
        assertEquals("COIL_THK", map(withDomain.get("domain")).get("stdName"));

        Map<String, Object> physWithout = view(null, "RMTL_COIL_THK", Boolean.FALSE);
        assertFalse(physWithout.containsKey("domain"));
    }

    @Test
    void columnId_와_물리명이_같이_오면_columnId_가_이긴다() {
        Map<String, Object> out = view(other.getColumnId(), "RMTL_COIL_THK", null);
        assertEquals("NO_DOMAIN_COL", map(out.get("column")).get("physName"));
    }

    private Map<String, Object> view(Long columnId, String physName, Boolean withDomain) {
        ColumnMngViewRequest req = new ColumnMngViewRequest();
        req.setColumnId(columnId);
        req.setPhysName(physName);
        req.setWithDomain(withDomain);
        return tx.execute(s -> service.view(req));
    }

    private static void assertInvalid(Executable call) {
        BusinessException e = assertThrows(BusinessException.class, call);
        assertTrue(e.getMessage().startsWith(MdmErrorCode.INVALID_INPUT.defaultMessage()), e.getMessage());
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object value) {
        return (Map<String, Object>) value;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> maps(Object value) {
        return (List<Map<String, Object>>) value;
    }
}
