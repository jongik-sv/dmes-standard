package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.dmb.layout.LayoutQueries;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-05-02 design.md §2·§5 I18 — {@link LayoutQueries} 의 네이티브 SQL(컬럼 검색·물리명 IN·시스템·단위)을 실제 SQL Server 에서
 * 실행한다. 행 수 제한은 {@code setMaxResults} 가 방언별 문법으로 바꾼다. 공용 서버({@link MdmMssqlServer})를 쓴다 —
 * {@code :api:mssqlMigrationTest} 로만 돈다(도커 금지 워커는 돌리지 않는다, design.md 「도커 금지로 생략한 검증」).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local-db")
class LayoutQueriesMssqlTest {

    static final String DB_URL = MdmMssqlServer.newDatabase("layoutqueries");

    @Autowired
    LayoutQueries queries;
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

    @Test
    void 네이티브_SQL_이_MSSQL_에서_돈다() {
        long domain = repository.saveAndFlush(new MdmDomain("코일 두께", "COIL_THK_M", "QTY", "NUMBER")).getDomainId();
        String col = "INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, PHYS_NAME, DOMAIN_ID, REQUIRED, CHG_SEQ) VALUES (?, ?, ?, ?, 0, 0)";
        jdbc.update(col, "코일 두께", "코일 두께(mm)", "COIL_THK_M", domain);
        jdbc.update(col, "코일 아이디", null, "COIL_ID_M", domain);
        for (int i = 0; i < 105; i++) {
            jdbc.update(col, "대량 " + i, null, String.format("BULK_%03d", i), domain);
        }

        List<Object[]> coil = queries.searchColumns("coil");
        assertEquals(List.of("COIL_ID_M", "COIL_THK_M"), coil.stream().map(r -> (String) r[0]).toList());
        assertEquals("코일 두께", coil.get(1)[4]);
        assertEquals(1, queries.searchColumns("두께(mm)").size(), "표시명(LABEL_LONG)으로도 찾는다");
        assertEquals(LayoutQueries.COLUMN_SEARCH_LIMIT, queries.searchColumns(null).size(), "setMaxResults 100");
        assertEquals(List.of("COIL_THK_M"), queries.columnsByPhys(List.of("COIL_THK_M", "NOPE")).stream()
                .map(r -> (String) r[0]).toList());
        assertTrue(queries.systems().stream().anyMatch(r -> "L2".equals(r[0])));
        queries.units();
    }
}
