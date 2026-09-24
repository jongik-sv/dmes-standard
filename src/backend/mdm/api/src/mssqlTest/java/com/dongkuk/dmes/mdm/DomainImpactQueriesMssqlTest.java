package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.dictionary.DomainImpactQueries;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeSnapshot;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-04-03 design.md §4.4 — 영향도 재귀 CTE 두 개(RECURSIVE 없는 공통 문안)와 물리명 조회를 실제 SQL Server 에서 실행해
 * SQLite 와 같은 결과(행·깊이·순서)를 낸다. 순환 데이터에서 깊이 가드 50 이 MAXRECURSION 100 전에 끊는다.
 * 공용 서버({@link MdmMssqlServer})를 쓴다 — {@code :api:mssqlMigrationTest} 로만 돈다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local-db")
class DomainImpactQueriesMssqlTest {

    static final String DB_URL = MdmMssqlServer.newDatabase("domainimpact");

    @Autowired
    DomainImpactQueries queries;
    @Autowired
    MdmDomainRepository repository;
    @Autowired
    JdbcTemplate jdbc;

    @DynamicPropertySource
    static void registerMssql(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DB_URL);
        registry.add("spring.datasource.username", MdmMssqlServer::user);
        registry.add("spring.datasource.password", MdmMssqlServer::password);
    }

    private long save(String name, String std, Long parent) {
        MdmDomain d = new MdmDomain(name, std, "TEXT", "STRING");
        d.setParentDomainId(parent);
        return repository.saveAndFlush(d).getDomainId();
    }

    @Test
    void 하위_트리_조상_체인_물리명_조회가_SQLite_와_같은_모양이다() {
        long root = save("뿌리", "ROOT_M", null);
        long branch = save("가지", "BRANCH_M", root);
        long leaf = save("잎", "LEAF_M", branch);
        long side = save("옆가지", "SIDE_M", root);
        String col = "INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID, REQUIRED, CHG_SEQ) VALUES (?, ?, ?, 0, 0)";
        jdbc.update(col, "가지 컬럼 M", "COL_BM", branch);
        jdbc.update(col, "잎 컬럼 M1", "COL_CM1", leaf);

        List<DomainImpactQueries.SubtreeRow> rows = queries.subtree(root);
        assertEquals(List.of(root + ":0", branch + ":1", side + ":1", leaf + ":2"),
                rows.stream().map(r -> r.domainId() + ":" + r.depth()).toList());
        assertEquals(List.of("COL_BM", "COL_CM1"),
                rows.stream().filter(r -> r.physName() != null).map(DomainImpactQueries.SubtreeRow::physName).toList());
        assertEquals(List.of(leaf + ":0", branch + ":1", root + ":2"),
                queries.ancestors(leaf).stream().map(r -> r.domainId() + ":" + r.depth()).toList());
        assertEquals(Map.of("COL_BM", "가지 컬럼 M"), queries.columnNamesByPhysName(List.of("col_bm", "NOPE")));
    }

    @Test
    void 순환_데이터에서도_깊이_가드로_끝난다() {
        long a = save("순환A", "LOOP_AM", null);
        long b = save("순환B", "LOOP_BM", a);
        jdbc.update("UPDATE TB_MDM_DOMAIN SET PARENT_DOMAIN_ID = ? WHERE DOMAIN_ID = ?", b, a);
        List<DomainImpactQueries.SubtreeRow> rows = queries.subtree(a);
        assertTrue(rows.stream().anyMatch(r -> r.depth() >= DomainTreeSnapshot.MAX_DEPTH));
        assertTrue(queries.ancestors(a).size() <= DomainTreeSnapshot.MAX_DEPTH + 1);
    }
}
