package com.dongkuk.dmes.mdm.dma.termRegPop;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
import com.dongkuk.dmes.mdm.dma.columnMng.dto.ColumnMngCompareRequest;
import com.dongkuk.dmes.mdm.dma.columnMng.service.ColumnMngService;
import com.dongkuk.dmes.mdm.dma.termRegPop.dto.TermRegPopRegRequest;
import com.dongkuk.dmes.mdm.dma.termRegPop.dto.TermRegPopSearchRequest;
import com.dongkuk.dmes.mdm.dma.termRegPop.service.TermRegPopService;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import com.dongkuk.oasis.audit.AuditHolder;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
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
import org.springframework.transaction.support.TransactionTemplate;

/**
 * TSK-04-04 design.md §3.3 R1~R7 — 용어 인라인 등록 팝업 서비스(유사어·약어 제안·등록)를 Oracle 시험 PDB 로 돌린다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmaTestSupport.Config.class)
class TermRegPopServiceSqliteTest extends AbstractMdmSharedDbTest {

    @Autowired
    TermRegPopService service;
    @Autowired
    ColumnMngService columnMngService;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    MdmTermRepository terms;
    @Autowired
    MdmDomainRepository domains;
    @Autowired
    DataSource dataSource;
    @Autowired
    PlatformTransactionManager transactionManager;

    private JdbcTemplate jdbc;
    private TransactionTemplate tx;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        tx = new TransactionTemplate(transactionManager);
        DmaTestSupport.clear(jdbc);
        currentUser.set("admin1", Set.of(MdmRoles.STD_ADMIN));
        AuditHolder.remove();
        UserContextHolder.clear();
        DmaTestSupport.term(terms, "원재료", "RMTL", "Raw Material", null);
        DmaTestSupport.term(terms, "코일", "COIL", "Coil", null);
        DmaTestSupport.term(terms, "두께", "THK", "Thickness", null);
        DmaTestSupport.term(terms, "오차", "ERR", "Error", null);
    }

    @AfterEach
    void clearThreadLocals() {
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @Test
    void R1_표준_관리자가_등록한다() {
        Map<String, Object> result = reg(valid());

        @SuppressWarnings("unchecked")
        Map<String, Object> term = (Map<String, Object>) result.get("term");
        long termId = ((Number) term.get("termId")).longValue();
        assertEquals("편차", term.get("termName"));
        assertEquals(1, term.get("senseNo"));
        assertEquals("DEV", term.get("engAbbr"));
        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM TB_MDM_TERM WHERE TERM_ID = ?", termId);
        assertEquals("MDM:columnMng", row.get("SRC_ORIGIN"));
        assertEquals("기준값과의 차이", row.get("DEFINITION"));
        assertEquals("품질", row.get("CONTEXT"));
        assertEquals("Deviation", row.get("ENG_NAME"));
        assertNull(row.get("SYNONYMS"));
        assertNull(row.get("ALIASES"));
        assertNull(row.get("SYSTEMS"));
        assertNull(row.get("EMBEDDING"));
        assertEquals(5, count());
    }

    @Test
    void R2_담당자_SYSADMIN_역할_없음은_MDM016() {
        for (Set<String> roles : List.of(Set.of(MdmRoles.STEWARD), Set.of("SYSADMIN"), Set.<String>of())) {
            currentUser.set("u", roles);
            assertCode(MdmErrorCode.STD_ADMIN_ROLE_REQUIRED, () -> reg(valid()));
            TermRegPopRegRequest empty = new TermRegPopRegRequest();
            assertCode(MdmErrorCode.STD_ADMIN_ROLE_REQUIRED, () -> reg(empty));
        }
        assertEquals(4, count());
    }

    @Test
    void R3_같은_표기_의미_번호는_MDM020() {
        TermRegPopRegRequest req = valid();
        req.setTermName("코일");
        req.setEngAbbr("COIL2");

        assertCode(MdmErrorCode.TERM_DUPLICATED, () -> reg(req));
        req.setSenseNo(2);
        reg(req);
        assertEquals(5, count());
    }

    @Test
    void R4_약어는_대소문자를_무시해_중복을_보고_대안을_알려준다() {
        jdbc.update("UPDATE TB_MDM_TERM SET ENG_ABBR = 'dev' WHERE TERM_NAME = '오차'");

        BusinessException e = assertCode(MdmErrorCode.TERM_DUPLICATED, () -> reg(valid()));

        assertTrue(e.getMessage().contains("DEVI"), e.getMessage());
        assertEquals(4, count());
    }

    @Test
    void R5_입력_형식이_틀리면_MDM021() {
        assertInvalid(r -> r.setTermName("두께 편차"));
        assertInvalid(r -> r.setTermName("편차!"));
        assertInvalid(r -> r.setTermName(" "));
        assertInvalid(r -> r.setTermName("가".repeat(101)));
        assertInvalid(r -> r.setEngAbbr("dev"));
        assertInvalid(r -> r.setEngAbbr("_DEV"));
        assertInvalid(r -> r.setEngAbbr(null));
        assertInvalid(r -> r.setEngAbbr("D".repeat(51)));
        assertInvalid(r -> r.setDefinition("  "));
        assertInvalid(r -> r.setSenseNo(0));
        assertInvalid(r -> r.setSenseNo(null));
        assertInvalid(r -> r.setContext("가".repeat(101)));
        assertInvalid(r -> r.setEngName("E".repeat(101)));
        assertEquals(4, count());
    }

    @Test
    void R6_유사어_다음_의미_번호_약어_제안() {
        TermRegPopSearchRequest req = new TermRegPopSearchRequest();
        req.setTermName("편차");
        req.setEngName("Deviation");

        Map<String, Object> result = service.search(req);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> similar = (List<Map<String, Object>>) result.get("similar");
        Map<String, Object> error = similar.stream().filter(m -> "오차".equals(m.get("termName"))).findFirst().orElseThrow();
        assertEquals("NAME_SIMILAR", error.get("reason"));
        assertEquals("ERR", error.get("engAbbr"));
        assertEquals(1, result.get("nextSenseNo"));
        @SuppressWarnings("unchecked")
        Map<String, Object> abbr = (Map<String, Object>) result.get("abbr");
        assertEquals("DEV", abbr.get("suggested"));
        assertEquals(Boolean.FALSE, abbr.get("baseTaken"));

        req.setTermName("코일");
        req.setEngName(" ");
        Map<String, Object> second = service.search(req);
        assertEquals(2, second.get("nextSenseNo"));
        assertNull(second.get("abbr"));
    }

    @Test
    void R7_등록_직후_분해에_바로_반영된다() {
        ColumnMngCompareRequest req = new ColumnMngCompareRequest();
        req.setDirection("FORWARD");
        req.setInput("원재료 코일두께 편차");
        // 등록 전에 한 번 분해해 둔다 — 사전을 캐시하면 등록 뒤 분해가 옛 사전을 쓰게 된다(I26).
        assertEquals("RMTL_COIL_THK_***", columnMngService.compare(req).get("physName"));

        reg(valid());
        Map<String, Object> result = columnMngService.compare(req);

        assertEquals("RMTL_COIL_THK_DEV", result.get("physName"));
        assertEquals(Boolean.FALSE, result.get("placeholder"));
    }

    private TermRegPopRegRequest valid() {
        TermRegPopRegRequest req = new TermRegPopRegRequest();
        req.setTermName("편차");
        req.setSenseNo(1);
        req.setDefinition("기준값과의 차이");
        req.setContext("품질");
        req.setEngName("Deviation");
        req.setEngAbbr("DEV");
        return req;
    }

    private void assertInvalid(Consumer<TermRegPopRegRequest> mutate) {
        TermRegPopRegRequest req = valid();
        mutate.accept(req);
        assertCode(MdmErrorCode.INVALID_INPUT, () -> reg(req));
    }

    private Map<String, Object> reg(TermRegPopRegRequest req) {
        return tx.execute(s -> service.reg(req));
    }

    private int count() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_TERM", Integer.class);
    }

    private static BusinessException assertCode(MdmErrorCode code, org.junit.jupiter.api.function.Executable call) {
        BusinessException e = assertThrows(BusinessException.class, call);
        assertTrue(e.getMessage().startsWith(code.defaultMessage()), code + " 기대, 실제: " + e.getMessage());
        return e;
    }
}
