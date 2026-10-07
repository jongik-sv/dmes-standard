package com.dongkuk.dmes.mdm.common.version;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-01-03 design.md §3.2 — 버전 상태 서비스 시나리오를 local 프로파일의 실제 컨텍스트(Oracle 시험 PDB)로 돌린다.
 * 테이블은 실제 이름과 겹치지 않는 픽스처(TB_MDM_TC_*)다. 시나리오 S14(원자성)·S24(저장 형식)를 더한다.
 * DB 접속은 키트({@link AbstractVersionStateScenarioTest})가 공용 기반으로 받는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import({VersionScenarioTestConfig.class, VersionStateServiceSqliteTest.FixtureRegistry.class})
class VersionStateServiceSqliteTest extends AbstractVersionStateScenarioTest {

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
    void S24_네이티브_쓰기는_KST_초_단위_TIMESTAMP_로_저장한다() {
        at("2026-06-20 09:08:07");
        seedObject(VersionTarget.MASTER_CODE, "PROC_CD", "INUSE");
        VersionRef v1 = code("PROC_CD", "1.000");
        seedVersion(v1, "DRAFT", KIM, null, null, 0);

        confirm(v1, 0, "2026-07-01 00:00:00");

        // 칸 형은 TIMESTAMP(6) — 문자열이 아니라 일시로 저장된다(SQLite 때는 TEXT 였다)
        List<String> types = jdbc.queryForList("SELECT DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME = 'TB_MDM_TC_CODE_VER' "
                + "AND COLUMN_NAME IN ('APPLY_FROM', 'APPLY_TO', 'U_AT', 'RELEASED_AT')", String.class);
        assertEquals(List.of("TIMESTAMP(6)", "TIMESTAMP(6)", "TIMESTAMP(6)", "TIMESTAMP(6)"), types);
        Map<String, Object> stored = jdbc.queryForMap("SELECT APPLY_FROM, APPLY_TO, U_AT, RELEASED_AT "
                + "FROM TB_MDM_TC_CODE_VER WHERE MARU_CODE_ID = 'PROC_CD'");
        assertEquals("2026-07-01 00:00:00|9999-12-31 00:00:00", text(stored.get("APPLY_FROM")) + "|" + text(stored.get("APPLY_TO")));
        assertEquals("2026-06-20 09:08:07", text(stored.get("U_AT")));
        assertEquals("2026-06-20 09:08:07", text(stored.get("RELEASED_AT")));
    }
}
