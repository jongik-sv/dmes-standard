package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * 로컬 샘플 자동 적재 — {@code mdm.sample.path} 를 주고 기동하면 Flyway 가 끝난 빈 DB 에 샘플이 들어가고,
 * 이미 데이터가 있으면 다시 넣지 않는다. 마이그레이션이 바뀌어 샘플이 깨지면 이 테스트가 먼저 알린다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class MdmLocalSampleLoaderTest {

    /** 테스트 작업 디렉터리(api/) 기준 샘플 위치. */
    static final Path SAMPLE = Path.of("../sample/mdm-local-sample.sql");

    @TempDir
    static Path tempDir;

    @Autowired
    DataSource dataSource;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    MdmLocalSampleLoader loader;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        Path db = tempDir.resolve("mdm-sample.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + db);
        registry.add("mdm.sample.path", () -> SAMPLE.toAbsolutePath().toString());
    }

    private Map<String, Long> counts() {
        Map<String, Long> m = new LinkedHashMap<>();
        for (String t : List.of("TB_MDM_TERM", "TB_MDM_DOMAIN", "TB_MDM_COLUMN", "TB_MDM_UNIT", "TB_MDM_LAYOUT",
                "TB_MDM_CODE", "TB_MDM_CODE_ITEM", "TB_MDM_DATA", "TB_MDM_RULE", "TB_MDM_RULE_ROW", "TB_MDM_RULE_SET")) {
            m.put(t, jdbc.queryForObject("SELECT COUNT(*) FROM " + t, Long.class));
        }
        return m;
    }

    @Test
    void 기동하면_빈_DB_에_샘플이_들어가고_외래키가_맞는다() {
        counts().forEach((table, n) -> assertTrue(n > 0, table + " 가 비어 있다"));
        assertTrue(jdbc.queryForList("PRAGMA foreign_key_check").isEmpty(), "외래키 위반 행이 있다");
    }

    @Test
    void 이미_데이터가_있으면_다시_넣지_않는다() throws Exception {
        Map<String, Long> before = counts();
        assertFalse(loader.loadIfEmpty());
        assertEquals(before, counts());
    }
}
