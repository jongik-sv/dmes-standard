package com.dongkuk.dmes.mdm.dma.columnMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.perf.QueryCountProbe;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dma.columnMng.dto.ColumnMngViewRequest;
import com.dongkuk.dmes.mdm.dma.columnMng.service.ColumnMngService;
import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.repository.MdmColumnRepository;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
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
import org.springframework.transaction.PlatformTransactionManager;

/**
 * 컬럼 상세({@code columnMng.view}) 서버 부하 가드 — 컬럼이 가리키는 용어 수 t 에 따라 SQL 문 수가 어떻게 느는지 본다. 용어 목록에는 중복·없는 용어가 섞여 있다(순서·missing 확인).
 *
 * <p>2026-10-01 고치기 전 2+(서로 다른 용어 수)(용어마다 findById), 고친 뒤 3(상수 — 용어를 IN 한 번에 읽어 TERM_IDS 순서로 늘어놓는다).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmaTestSupport.Config.class)
class ColumnMngQueryCountTest extends AbstractMdmSharedDbTest {

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
    @Autowired
    PlatformTransactionManager tm;
    @Autowired
    EntityManager em;
    @Autowired
    EntityManagerFactory emf;

    QueryCountProbe probe;
    JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        currentUser.set("admin1", Set.of(MdmRoles.STD_ADMIN));
        probe = new QueryCountProbe(tm, em, emf, "columnMng");
        probe.start();
    }

    @AfterEach
    void tearDown() {
        probe.stop();
    }

    private final List<Long> lastIds = new ArrayList<>();

    /** 용어 t 개를 만들고 [t..1 역순, 첫 용어 한 번 더, 없는 용어 99999] 를 가리키는 컬럼 하나. */
    private long seed(int t) {
        DmaTestSupport.clear(jdbc);
        MdmDomain d = DmaTestSupport.domain(domains, "도메인 " + t, "DOM_" + t);
        List<Long> ids = new ArrayList<>();
        for (int i = 0; i < t; i++) {
            MdmTerm term = DmaTestSupport.term(terms, "용어" + t + "_" + i, "AB" + t + "_" + i, "Eng " + i, null);
            ids.add(term.getTermId());
        }
        lastIds.clear();
        lastIds.addAll(ids);
        List<Long> ref = new ArrayList<>(ids.reversed());
        ref.add(ids.get(0));
        ref.add(99999L);
        MdmColumn c = DmaTestSupport.column(columns, "컬럼 " + t, "COL_" + t, d.getDomainId());
        c.setTermIds(ref.toString().replace(" ", ""));
        return columns.save(c).getColumnId();
    }

    @Test
    void view_SQL_문_수() {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (int t : new int[] {3, 10}) {
            long id = seed(t);
            ColumnMngViewRequest r = new ColumnMngViewRequest();
            r.setColumnId(id);
            QueryCountProbe.Measured<Map<String, Object>> m = probe.measureInTx("view-t" + t, () -> service.view(r));
            counts.put("view" + t, m.count());
            assertTerms(t, m.result());
        }
        assertEquals(counts.get("view3"), counts.get("view10"), counts::toString);
        assertTrue(counts.get("view10") <= 3, counts::toString);
    }

    /**
     * 고치기 전(0afccb3e)과 같은 응답 — 용어마다 [termId, termName, senseNo, engAbbr, missing] 한 행씩, TERM_IDS 순서대로(t..1 역순, 첫 용어 반복, 없는 99999).
     */
    @SuppressWarnings("unchecked")
    private void assertTerms(int t, Map<String, Object> out) {
        List<Map<String, Object>> rows = (List<Map<String, Object>>) out.get("terms");
        List<Long> expected = new ArrayList<>(lastIds.reversed());
        expected.add(lastIds.get(0));
        expected.add(99999L);
        assertEquals(expected, rows.stream().map(x -> (Long) x.get("termId")).toList(), "TERM_IDS 순서·반복 유지");
        for (int i = 0; i < rows.size(); i++) {
            Map<String, Object> row = rows.get(i);
            boolean missing = expected.get(i) == 99999L;
            assertEquals(missing, row.get("missing"), "행 " + i);
            if (missing) {
                assertEquals(null, row.get("termName"));
                assertEquals(null, row.get("senseNo"));
                assertEquals(null, row.get("engAbbr"));
            } else {
                int idx = lastIds.indexOf(expected.get(i));
                assertEquals("용어" + t + "_" + idx, row.get("termName"), "행 " + i);
                assertEquals("AB" + t + "_" + idx, row.get("engAbbr"), "행 " + i);
                assertEquals(terms.findById(expected.get(i)).orElseThrow().getSenseNo(), row.get("senseNo"), "행 " + i);
            }
        }
        assertEquals(t + 2, rows.size());
    }
}
