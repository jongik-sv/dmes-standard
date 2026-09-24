package com.dongkuk.dmes.mdm.common.version;

import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.io.TempDir;
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
 * TSK-06-01 design.md §3.7 — TSK-01-03 §7 ③ 인계. 버전 상태 서비스 시나리오 키트를 <b>실제 V9 테이블</b>
 * ({@code TB_MDM_CODE}·{@code TB_MDM_CODE_VER})로 local(SQLite) 컨텍스트에서 돌린다. V9 DDL 이 공통 서비스의 고정 칼럼·이름·
 * CHECK({@code CK_TB_MDM_CODE_VER_APPLY} 포함)를 만족한다는 유일한 직접 증거다(불변 규칙 31).
 *
 * <p>MASTER_CODE 는 {@link DefaultVersionTableRegistry} 의 실제 명세, BUSINESS_RULE 은 06 표가 아직 없어 픽스처
 * {@link VersionFixtureTables#RULE_SPEC} 을 쓴다. 실제 표의 NOT NULL 칼럼(MARU_CODE_NAME·SOURCE_KIND·VER_KIND)은
 * {@link #seedObject}·{@link #seedVersion} 재정의가 채운다. 방언 전용 시나리오(S14·S24)는 옮기지 않는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import({VersionScenarioTestConfig.class, MasterCodeVersionStateSqliteTest.RealMasterCodeRegistry.class})
class MasterCodeVersionStateSqliteTest extends AbstractVersionStateScenarioTest {

    @TempDir
    static Path tempDir;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-master-code-version-scenario-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
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

    /** 픽스처 RULE 두 표만 만든다(MASTER_CODE 는 Flyway V9 표). 트리거 문장은 TC_CODE_VER 를 가리켜 넣지 않는다. */
    @Override
    protected void createSchema(JdbcTemplate jdbc) {
        List<String> ddl = VersionFixtureTables.sqliteDdl();
        ddl.stream().filter(sql -> sql.contains("TB_MDM_TC_RULE")).forEach(jdbc::execute);
    }

    /** FK 역순으로 비운다. 키트는 도메인을 만들지 않으므로 TB_MDM_DOMAIN 의 MARU_CODE_ID 참조 행은 없다. */
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

    /** MASTER_CODE 는 실제 표의 NOT NULL 칼럼 MARU_CODE_NAME·SOURCE_KIND 를 채운다(CK_TB_MDM_CODE_SRC_SYS: MDM 이면 원천 NULL). */
    @Override
    protected void seedObject(VersionTarget target, String objectId, String status, String uUsrId, Integer auditCounter) {
        if (target != VersionTarget.MASTER_CODE) {
            super.seedObject(target, objectId, status, uUsrId, auditCounter);
            return;
        }
        jdbc.update("INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, SOURCE_KIND, STATUS, U_USR_ID, VER) "
                + "VALUES (?, ?, 'MDM', ?, ?, ?)", objectId, objectId, status, uUsrId, auditCounter);
    }

    /**
     * MASTER_CODE 는 실제 표의 NOT NULL 칼럼 VER_KIND 를 채운다(정수 번호는 MAJOR, 그 밖은 MINOR). 키트의 선점·삭제
     * 시나리오(S17~S21)는 부모 없이 버전만 시드하므로, 부모 {@code TB_MDM_CODE} 행이 없으면 CREATED 로 먼저 만든다
     * ({@code FK_TB_MDM_CODE_VER_CODE}, TSK-01-03 §7 ③ "부모 FK 는 seedVersion 이 채운다"). 이미 있으면 건드리지 않는다.
     */
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
