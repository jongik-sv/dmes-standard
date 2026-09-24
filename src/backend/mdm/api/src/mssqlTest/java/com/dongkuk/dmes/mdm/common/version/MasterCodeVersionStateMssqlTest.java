package com.dongkuk.dmes.mdm.common.version;

import com.dongkuk.dmes.mdm.MdmMssqlServer;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.math.BigDecimal;
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
 * TSK-06-01 design.md §3.7 — 버전 상태 서비스 시나리오 키트를 실제 V6 테이블로 SQL Server 2022(Testcontainers)에서 돌린다
 * ({@code MasterCodeVersionStateSqliteTest} 의 MSSQL 판, 공용 {@code MdmMssqlServer} 에 실행마다 새 DB).
 *
 * <p><b>사용자 결정(2026-09-24, 도커 금지)으로 이 테스트는 게이트에서 실행하지 않는다.</b> {@code :api:mssqlMigrationTest}
 * 로만 돌고 test·testAll 에 들어가지 않는다. Build 는 {@code :api:compileMssqlTestJava} 로 컴파일만 확인했다. 방언 전용
 * 시나리오(S14·S24)는 옮기지 않는다(키트 본체만).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local-db")
@Import({VersionScenarioTestConfig.class, MasterCodeVersionStateMssqlTest.RealMasterCodeRegistry.class})
class MasterCodeVersionStateMssqlTest extends AbstractVersionStateScenarioTest {

    // Spring 컨텍스트(Flyway 포함)가 뜨기 전에 서버와 DB 가 있어야 한다. 공용 서버에 실행마다 새 DB 를 만든다
    // (dev 6855c6c MdmMssqlServer, 팀장 공지 2026-09-24).
    static final String DB_URL = MdmMssqlServer.newDatabase("code_version");

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DB_URL);
        registry.add("spring.datasource.username", MdmMssqlServer::user);
        registry.add("spring.datasource.password", MdmMssqlServer::password);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class RealMasterCodeRegistry {
        @Bean
        @Primary
        VersionTableRegistry realMasterCodeVersionTableRegistry() {
            DefaultVersionTableRegistry real = new DefaultVersionTableRegistry();
            return target -> target == VersionTarget.MASTER_CODE ? real.spec(target) : VersionFixtureTables.RULE_SPEC;
        }
    }

    /** 픽스처 RULE 두 표만 만든다(MASTER_CODE 는 Flyway V6 표). */
    @Override
    protected void createSchema(JdbcTemplate jdbc) {
        VersionFixtureTables.mssqlDdl().stream().filter(sql -> sql.contains("TB_MDM_TC_RULE")).forEach(jdbc::execute);
    }

    @Override
    protected void clearTables(JdbcTemplate jdbc) {
        jdbc.update("DELETE FROM TB_MDM_CODE_CATE_ITEM");
        jdbc.update("DELETE FROM TB_MDM_CODE_CATE");
        jdbc.update("DELETE FROM TB_MDM_CODE_ITEM");
        jdbc.update("DELETE FROM TB_MDM_CODE_VER");
        jdbc.update("DELETE FROM TB_MDM_CODE");
        jdbc.update("DELETE FROM TB_MDM_TC_RULE_VER");
        jdbc.update("DELETE FROM TB_MDM_TC_RULE");
    }

    @Override
    protected void seedObject(VersionTarget target, String objectId, String status, String uUsrId, Integer auditCounter) {
        if (target != VersionTarget.MASTER_CODE) {
            super.seedObject(target, objectId, status, uUsrId, auditCounter);
            return;
        }
        jdbc.update("INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, SOURCE_KIND, STATUS, U_USR_ID, VER) "
                + "VALUES (?, ?, 'MDM', ?, ?, ?)", objectId, objectId, status, uUsrId, auditCounter);
    }

    @Override
    protected void seedVersion(VersionRef ref, String status, String ownerId, String applyFrom, String applyTo,
                               long rowVersion) {
        if (ref.target() != VersionTarget.MASTER_CODE) {
            super.seedVersion(ref, status, ownerId, applyFrom, applyTo, rowVersion);
            return;
        }
        jdbc.update("INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, SOURCE_KIND) SELECT ?, ?, 'MDM' "
                + "WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_CODE WHERE MARU_CODE_ID = ?)", ref.objectId(), ref.objectId(),
                ref.objectId());
        BigDecimal ver = ref.ver().setScale(ref.target().versionScale());
        String verKind = ver.stripTrailingZeros().scale() <= 0 ? "MAJOR" : "MINOR";
        jdbc.update("INSERT INTO TB_MDM_CODE_VER (MARU_CODE_ID, VER, VER_KIND, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, "
                        + "ROW_VERSION, AUD_VER) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
                ref.objectId(), ver, verKind, status, ownerId, applyFrom, applyTo, rowVersion);
    }
}
