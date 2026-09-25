package com.dongkuk.dmes.mdm.common.dictionary;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainImpact;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainImpactLookup;
import com.dongkuk.dmes.mdm.dma.domainMng.dto.DomainMngViewRequest;
import com.dongkuk.dmes.mdm.dma.domainMng.service.DomainMngService;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * design.md §4.2 — 재귀 CTE(하위 트리·참조 컬럼·조상 체인)와 03·06 참조 0건(수용 기준 6). 이 컨텍스트에는
 * {@code MdmDomainReferenceSpi} 빈이 없다 — 03·06 테이블이 있든 없든(이 브랜치엔 없다) 참조는 0건이다.
 * 스텁 SPI 집계는 {@link DomainImpactSpiAggregationTest}.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class DomainImpactQueriesSqliteTest extends AbstractMdmSharedDbTest {

    @Autowired
    DomainImpactQueries queries;
    @Autowired
    MdmDomainImpactLookup lookup;
    @Autowired
    DomainMngService service;
    @Autowired
    JdbcTemplate jdbc;

    /** 1 ─ 2 ─ 3, 1 ─ 4 / 컬럼: 2(COL_B), 3(COL_C1, COL_C2). 5 ↔ 6 은 순환 데이터. */
    static void tree(JdbcTemplate jdbc) {
        if (jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_DOMAIN", Integer.class) > 0) {
            return;
        }
        String ins = "INSERT INTO TB_MDM_DOMAIN (DOMAIN_ID, DOMAIN_NAME, STD_NAME, PARENT_DOMAIN_ID, DOMAIN_KIND, DATA_TYPE, CHG_SEQ, VER) "
                + "VALUES (?, ?, ?, ?, 'TEXT', 'STRING', 0, 0)";
        jdbc.update(ins, 1, "뿌리", "ROOT", null);
        jdbc.update(ins, 2, "가지", "BRANCH", 1);
        jdbc.update(ins, 3, "잎", "LEAF", 2);
        jdbc.update(ins, 4, "옆가지", "SIDE", 1);
        jdbc.update(ins, 5, "순환A", "LOOP_A", null);
        jdbc.update(ins, 6, "순환B", "LOOP_B", 5);
        jdbc.update("UPDATE TB_MDM_DOMAIN SET PARENT_DOMAIN_ID = 6 WHERE DOMAIN_ID = 5");
        String col = "INSERT INTO TB_MDM_COLUMN (COLUMN_ID, COLUMN_NAME, PHYS_NAME, DOMAIN_ID, REQUIRED, CHG_SEQ) VALUES (?, ?, ?, ?, 0, 0)";
        jdbc.update(col, 11, "가지 컬럼", "COL_B", 2);
        jdbc.update(col, 12, "잎 컬럼1", "COL_C1", 3);
        jdbc.update(col, 13, "잎 컬럼2", "COL_C2", 3);
    }

    @Test
    void 하위_트리와_깊이_참조_컬럼을_정확히_읽는다() {
        tree(jdbc);
        List<DomainImpactQueries.SubtreeRow> rows = queries.subtree(1L);
        assertEquals(List.of("1:0:-", "2:1:11", "4:1:-", "3:2:12", "3:2:13"),
                rows.stream().map(r -> r.domainId() + ":" + r.depth() + ":" + (r.columnId() == null ? "-" : r.columnId())).toList());
        MdmDomainImpact impact = lookup.impact(1L);
        assertEquals(List.of(2L, 4L, 3L), impact.descendantDomainIds());
        assertEquals(List.of(11L, 12L, 13L), impact.referencingColumnIds());
        assertEquals(List.of(), impact.affectedSystemCodes());
    }

    @Test
    void 말단은_하위_0건이다() {
        tree(jdbc);
        MdmDomainImpact leaf = lookup.impact(4L);
        assertEquals(List.of(), leaf.descendantDomainIds());
        assertEquals(List.of(), leaf.referencingColumnIds());
    }

    @Test
    void SPI_구현이_없으면_03_06_참조는_0건이다() {
        tree(jdbc);
        assertEquals(List.of(), lookup.impact(1L).externalReferences());
        Map<String, Object> view = service.view(viewReq(1L));
        @SuppressWarnings("unchecked")
        Map<String, Object> impact = (Map<String, Object>) view.get("impact");
        assertEquals(List.of(), impact.get("ruleVars"));
        assertEquals(List.of(), impact.get("layoutItems"));
        assertEquals(Boolean.TRUE, impact.get("deployHeld"));
        assertEquals(3, ((List<?>) impact.get("columns")).size(), "하위 트리 컬럼 3건");
    }

    @Test
    void 조상_체인을_위로_읽는다() {
        tree(jdbc);
        assertEquals(List.of("3:0", "2:1", "1:2"),
                queries.ancestors(3L).stream().map(r -> r.domainId() + ":" + r.depth()).toList());
    }

    @Test
    @Timeout(value = 10, unit = TimeUnit.SECONDS)
    void 순환_데이터에서도_끝난다() {
        tree(jdbc);
        List<DomainImpactQueries.SubtreeRow> rows = queries.subtree(5L);
        assertTrue(rows.stream().anyMatch(r -> r.depth() >= DomainTreeSnapshot.MAX_DEPTH), "깊이 가드에 닿아야 한다");
        assertTrue(rows.size() <= DomainTreeSnapshot.MAX_DEPTH + 1);
        assertTrue(queries.ancestors(5L).size() <= DomainTreeSnapshot.MAX_DEPTH + 1);
    }

    @Test
    void 물리명으로_컬럼_사전을_대소문자_무시로_찾는다() {
        tree(jdbc);
        assertEquals(Map.of("COL_B", "가지 컬럼"), queries.columnNamesByPhysName(List.of("col_b", "NOPE")));
        assertEquals(Map.of(), queries.columnNamesByPhysName(List.of()));
    }

    static DomainMngViewRequest viewReq(Long id) {
        DomainMngViewRequest r = new DomainMngViewRequest();
        r.setDomainId(id);
        return r;
    }
}
