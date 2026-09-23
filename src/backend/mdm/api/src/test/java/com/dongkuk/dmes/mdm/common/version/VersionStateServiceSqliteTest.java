package com.dongkuk.dmes.mdm.common.version;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.mdm.contract.common.MdmDialect;
import com.dongkuk.dmes.mdm.contract.common.MdmDialectResolver;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-01-03 design.md §3.2 — 버전 상태 서비스 시나리오를 local(SQLite) 프로파일의 실제 컨텍스트로 돌린다.
 * 테이블은 실제 이름과 겹치지 않는 픽스처(TB_MDM_TC_*)다. SQLite 전용 시나리오 S14(원자성)·S24(저장 형식)와
 * A1(방언 판정)을 더한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import({VersionScenarioTestConfig.class, VersionStateServiceSqliteTest.FixtureRegistry.class})
class VersionStateServiceSqliteTest extends AbstractVersionStateScenarioTest {

    @TempDir
    static Path tempDir;

    @Autowired
    MdmDialectResolver dialectResolver;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-version-scenario-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FixtureRegistry {
        @Bean
        @Primary
        VersionTableRegistry fixtureVersionTableRegistry() {
            return VersionFixtureTables::spec;
        }
    }

    @Override
    protected void createSchema(JdbcTemplate jdbc) {
        VersionFixtureTables.sqliteDdl().forEach(jdbc::execute);
    }

    @Override
    protected void clearTables(JdbcTemplate jdbc) {
        VersionFixtureTables.clear(jdbc);
    }

    @Test
    void A1_local_프로파일의_방언은_SQLITE_다() {
        assertEquals(MdmDialect.SQLITE, dialectResolver.current());
    }

    @Test
    void S14_직전_닫기가_실패하면_이미_실행한_DRAFT_확정_UPDATE_까지_롤백된다() {
        seedObject(VersionTarget.MASTER_CODE, "ATOMIC_FAIL", "CREATED");
        VersionRef v1 = code("ATOMIC_FAIL", "1.000");
        VersionRef v2 = code("ATOMIC_FAIL", "1.001");
        seedVersion(v1, "RELEASED", KIM, "2024-01-01 00:00:00", OPEN_END, 1);
        seedVersion(v2, "DRAFT", KIM, null, null, 0);

        assertThrows(RuntimeException.class, () -> confirm(v2, 0, "2026-05-01 00:00:00"));

        assertDraftUntouched(v2, 0);
        assertEquals(OPEN_END, text(readVersion(v1).get("APPLY_TO")));
        assertEquals("CREATED", parentStatus(VersionTarget.MASTER_CODE, "ATOMIC_FAIL"));
    }

    @Test
    void S24_SQLite_네이티브_쓰기는_KST_초_단위_TEXT_로_저장한다() {
        at("2026-06-20 09:08:07");
        seedObject(VersionTarget.MASTER_CODE, "PROC_CD", "INUSE");
        VersionRef v1 = code("PROC_CD", "1.000");
        seedVersion(v1, "DRAFT", KIM, null, null, 0);

        confirm(v1, 0, "2026-07-01 00:00:00");

        Map<String, Object> stored = jdbc.queryForMap("SELECT typeof(APPLY_FROM) AS F_TYPE, APPLY_FROM, "
                + "typeof(APPLY_TO) AS T_TYPE, APPLY_TO, typeof(U_AT) AS U_TYPE, U_AT, typeof(RELEASED_AT) AS R_TYPE "
                + "FROM TB_MDM_TC_CODE_VER WHERE MARU_CODE_ID = 'PROC_CD'");
        assertEquals("text|2026-07-01 00:00:00|text|9999-12-31 00:00:00",
                stored.get("F_TYPE") + "|" + stored.get("APPLY_FROM") + "|" + stored.get("T_TYPE") + "|" + stored.get("APPLY_TO"));
        assertEquals("text|2026-06-20 09:08:07", stored.get("U_TYPE") + "|" + stored.get("U_AT"));
        assertEquals("text", stored.get("R_TYPE"));
    }
}
