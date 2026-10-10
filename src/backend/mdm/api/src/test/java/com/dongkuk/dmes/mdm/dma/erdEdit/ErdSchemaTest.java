package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.DefaultVersionTableRegistry;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** ERD 단계 0 스키마(V6)·버전 대상 시험 — 표 7개, 모델 JSON 제약, 버전 레지스트리 항목. */
@SpringBootTest
@ActiveProfiles("local")
class ErdSchemaTest extends AbstractMdmSharedDbTest {

    @Autowired JdbcTemplate jdbc;
    @Autowired DefaultVersionTableRegistry registry;

    @Test
    void erdTablesExist() {
        List<String> names = jdbc.queryForList(
                "SELECT TABLE_NAME FROM USER_TABLES WHERE TABLE_NAME LIKE 'TB_MDM_ERD%' ORDER BY TABLE_NAME", String.class);
        assertThat(names).containsExactly("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_CMD_LOG", "TB_MDM_ERD_DIAGRAM",
                "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL", "TB_MDM_ERD_MODEL_VER");
    }

    @Test
    void modelJsonMustBeJson() {
        jdbc.update("INSERT INTO TB_MDM_ERD_MODEL (ERD_MODEL_ID, MODULE_ID, SCHEMA_NAME, MODEL_NAME) VALUES ('t1','schema-t1','MCMAPUSER','시험')");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO TB_MDM_ERD_MODEL_VER (ERD_MODEL_ID, VER, MODEL_JSON) VALUES ('t1', 1, 'not json')"))
                .hasMessageContaining("CK_TB_MDM_ERD_MODEL_VER_JSON");
    }

    @Test
    void registryKnowsErdModel() {
        var spec = registry.spec(VersionTarget.ERD_MODEL);
        assertThat(spec.versionTable()).isEqualTo("TB_MDM_ERD_MODEL_VER");
        assertThat(spec.objectIdColumn()).isEqualTo("ERD_MODEL_ID");
        assertThat(spec.parentTable()).isEqualTo("TB_MDM_ERD_MODEL");
    }

    /** B6: 모듈 하나에 모델 하나(스펙 D2) — MODULE_ID 유일 제약. */
    @Test
    void moduleIdIsUnique() {
        jdbc.update("INSERT INTO TB_MDM_ERD_MODEL (ERD_MODEL_ID, MODULE_ID, SCHEMA_NAME, MODEL_NAME) VALUES ('u1','schema-u','MCMAPUSER','시험')");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO TB_MDM_ERD_MODEL (ERD_MODEL_ID, MODULE_ID, SCHEMA_NAME, MODEL_NAME) VALUES ('u2','schema-u','MCMAPUSER','시험')"))
                .hasMessageContaining("UX_TB_MDM_ERD_MODEL_MODULE");
        jdbc.update("DELETE FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = 'u1'");
    }
}
