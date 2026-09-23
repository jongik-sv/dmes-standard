package com.dongkuk.dmes.mdm.common.dictionary;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainImpact;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainImpactLookup;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainReference;
import com.dongkuk.dmes.mdm.dma.domainMng.DomainMngTestConfig;
import com.dongkuk.dmes.mdm.dma.domainMng.DomainMngTestConfig.RecordingSpi;
import com.dongkuk.dmes.mdm.dma.domainMng.service.DomainMngService;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** design.md §4.2 대조군 — 스텁 SPI 두 개(03 LAYOUT_ITEM·06 RULE_VAR)를 켜면 영향도에 합쳐지고 SPI 는 자기+하위 id·물리명을 받는다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DomainMngTestConfig.ReferenceSpis.class)
class DomainImpactSpiAggregationTest {

    @TempDir
    static Path tempDir;

    @Autowired
    MdmDomainImpactLookup lookup;
    @Autowired
    DomainMngService service;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    List<RecordingSpi> spis;

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        Path db = tempDir.resolve("domain-impact-spi.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + db);
    }

    @Test
    @SuppressWarnings("unchecked")
    void 스텁_SPI_두_개의_참조가_합쳐진다() {
        DomainImpactQueriesSqliteTest.tree(jdbc);
        MdmDomainImpact impact = lookup.impact(2L);
        assertEquals(Set.of(new MdmDomainReference("LAYOUT_ITEM", "LAYOUT-7:ITEM-1"),
                new MdmDomainReference("RULE_VAR", "RULE-3:VAR-2")), Set.copyOf(impact.externalReferences()));
        for (RecordingSpi spi : spis) {
            assertEquals(Set.of(2L, 3L), spi.domainIdCalls.get(spi.domainIdCalls.size() - 1));
            assertEquals(Set.of("COL_B", "COL_C1", "COL_C2"), spi.physNameCalls.get(spi.physNameCalls.size() - 1));
        }
        Map<String, Object> view = service.view(DomainImpactQueriesSqliteTest.viewReq(2L));
        Map<String, Object> table = (Map<String, Object>) view.get("impact");
        assertEquals(1, ((List<?>) table.get("ruleVars")).size());
        assertEquals(1, ((List<?>) table.get("layoutItems")).size());
        assertEquals(1, ((List<?>) table.get("descendants")).size());
        assertEquals(3, ((List<?>) table.get("columns")).size());
    }
}
