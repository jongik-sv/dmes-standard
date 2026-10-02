package com.dongkuk.dmes.mdm.dma.columnMng;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dma.columnMng.dto.ColumnMngSearchRequest;
import com.dongkuk.dmes.mdm.dma.columnMng.dto.ColumnMngViewRequest;
import com.dongkuk.dmes.mdm.dma.columnMng.service.ColumnMngService;
import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.repository.MdmColumnRepository;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import com.dongkuk.oasis.audit.AuditHolder;
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

/**
 * 구성 용어(TERM_IDS)의 매칭 안 된 자리 — JSON {@code null} 은 목록·상세에서 {@code ***} 로 보인다(D-140).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmaTestSupport.Config.class)
class ColumnTermPlaceholderTest extends AbstractMdmSharedDbTest {

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
    DataSource dataSource;

    private MdmTerm coil;
    private Long columnId;

    @BeforeEach
    void setUp() {
        DmaTestSupport.clear(new JdbcTemplate(dataSource));
        currentUser.set("admin1", Set.of(MdmRoles.STD_ADMIN));
        AuditHolder.remove();
        UserContextHolder.clear();
        coil = DmaTestSupport.term(terms, "코일", "COIL", "Coil", null);
        MdmDomain domain = DmaTestSupport.domain(domains, "코일 공극률", "COIL_PRS");
        MdmColumn column = DmaTestSupport.column(columns, "코일 공극률", "COIL_PRS", domain.getDomainId());
        column.setTermIds("[" + coil.getTermId() + ",null]");
        columnId = columns.save(column).getColumnId();
    }

    @AfterEach
    void clearThreadLocals() {
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @Test
    void 목록의_구성_용어는_매칭_안_된_자리를_별표로_보인다() {
        ColumnMngSearchRequest req = new ColumnMngSearchRequest();
        req.setKeyword("공극률");
        List<Map<String, Object>> list = maps(service.search(req).get("list"));

        assertEquals("코일 + ***", list.get(0).get("termNames"));
    }

    @Test
    void 상세의_구성_용어도_자리를_지키며_별표로_보인다() {
        ColumnMngViewRequest req = new ColumnMngViewRequest();
        req.setColumnId(columnId);
        List<Map<String, Object>> rows = maps(service.view(req).get("terms"));

        assertEquals(2, rows.size());
        assertEquals("코일", rows.get(0).get("termName"));
        assertEquals("***", rows.get(1).get("termName"));
        assertEquals(true, rows.get(1).get("missing"));
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> maps(Object value) {
        return (List<Map<String, Object>>) value;
    }
}
