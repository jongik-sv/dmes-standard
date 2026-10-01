package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
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
 * 로컬 샘플을 {@code INSERT OR IGNORE} 없이 넣어 본다. 샘플은 재실행을 위해 OR IGNORE 를 쓰는데, 그러면 스키마가 바뀌어
 * UNIQUE·CHECK·NOT NULL 에 걸린 행도 조용히 빠진다. 평범한 INSERT 로 넣어 그런 행이 하나라도 있으면 실패하게 한다.
 * {@code mdm.sample.path} 를 주지 않으므로 기동 때 자동 적재는 꺼져 있다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class MdmLocalSampleStrictTest {

    @TempDir
    static Path tempDir;

    @Autowired
    DataSource dataSource;
    @Autowired
    JdbcTemplate jdbc;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        Path db = tempDir.resolve("mdm-sample-strict.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + db);
    }

    @Test
    void 샘플의_모든_행이_제약에_걸리지_않고_들어간다() throws Exception {
        assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_TERM", Long.class), "자동 적재가 켜져 있으면 안 된다");
        String strict = Files.readString(MdmLocalSampleLoaderTest.SAMPLE, StandardCharsets.UTF_8)
                .replace("INSERT OR IGNORE", "INSERT");
        Path strictFile = tempDir.resolve("mdm-local-sample.strict.sql");
        Files.writeString(strictFile, strict, StandardCharsets.UTF_8);

        assertTrue(new MdmLocalSampleLoader(dataSource, strictFile.toString()).loadIfEmpty());
        assertTrue(jdbc.queryForList("PRAGMA foreign_key_check").isEmpty(), "외래키 위반 행이 있다");
    }
}
