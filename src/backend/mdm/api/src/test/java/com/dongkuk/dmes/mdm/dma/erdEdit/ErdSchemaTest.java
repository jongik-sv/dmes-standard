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

/** ERD 스키마(V6·V7)·버전 대상 시험 — 표 8개, 모델 JSON 제약, 버전 레지스트리 항목. */
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
                "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM_ROUTE", "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL", "TB_MDM_ERD_MODEL_VER");
    }

    @Test
    void modelJsonMustBeJson() {
        jdbc.update("INSERT INTO TB_MDM_ERD_MODEL (ERD_MODEL_ID, MODULE_ID, SCHEMA_NAME, MODEL_NAME) VALUES ('t1','schema-t1','MCMAPUSER','시험')");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO TB_MDM_ERD_MODEL_VER (ERD_MODEL_ID, VER, MODEL_JSON) VALUES ('t1', 1, 'not json')"))
                .hasMessageContaining("CK_TB_MDM_ERD_MODEL_VER_JSON");
    }

    /** V7: 꺾임점 POINTS_JSON 은 IS JSON STRICT 제약을 받는다. */
    @Test
    void routePointsMustBeStrictJson() {
        jdbc.update("DELETE FROM TB_MDM_ERD_DIAGRAM_ROUTE WHERE DIAGRAM_ID = 'd-schema'");
        jdbc.update("DELETE FROM TB_MDM_ERD_DIAGRAM WHERE DIAGRAM_ID = 'd-schema'");
        jdbc.update("DELETE FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = 'r1'");
        jdbc.update("INSERT INTO TB_MDM_ERD_MODEL (ERD_MODEL_ID, MODULE_ID, SCHEMA_NAME, MODEL_NAME) VALUES ('r1','schema-r1','MCMAPUSER','시험')");
        jdbc.update("INSERT INTO TB_MDM_ERD_DIAGRAM (DIAGRAM_ID, ERD_MODEL_ID, AREA_NAME, DIAGRAM_NAME) VALUES ('d-schema','r1','a','b')");
        try {
            for (String bad : List.of("not json", "{x:1}", "[{'x':1,'y':2}]")) {
                org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update(
                                "INSERT INTO TB_MDM_ERD_DIAGRAM_ROUTE (DIAGRAM_ID, REL_UUID, POINTS_JSON) VALUES ('d-schema', 'r-1', ?)", bad))
                        .as(bad).hasMessageContaining("CK_TB_MDM_ERD_DIAGRAM_ROUTE_POINTS");
            }
            jdbc.update("INSERT INTO TB_MDM_ERD_DIAGRAM_ROUTE (DIAGRAM_ID, REL_UUID, POINTS_JSON) VALUES ('d-schema', 'r-1', ?)",
                    "[{\"x\":1,\"y\":2}]");
        } finally {
            jdbc.update("DELETE FROM TB_MDM_ERD_DIAGRAM_ROUTE WHERE DIAGRAM_ID = 'd-schema'");
            jdbc.update("DELETE FROM TB_MDM_ERD_DIAGRAM WHERE DIAGRAM_ID = 'd-schema'");
            jdbc.update("DELETE FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = 'r1'");
        }
    }

    /** V7: 꺾임점 표와 칼럼 12개 모두 주석이 있다(V5 관례). */
    @Test
    void routeTableAndColumnsHaveComments() {
        assertThat(jdbc.queryForObject("SELECT COMMENTS FROM USER_TAB_COMMENTS WHERE TABLE_NAME = 'TB_MDM_ERD_DIAGRAM_ROUTE'", String.class))
                .isNotBlank();
        List<String> columns = jdbc.queryForList(
                "SELECT C.COLUMN_NAME FROM USER_TAB_COLUMNS C WHERE C.TABLE_NAME = 'TB_MDM_ERD_DIAGRAM_ROUTE' ORDER BY C.COLUMN_ID", String.class);
        assertThat(columns).containsExactly("DIAGRAM_ID", "REL_UUID", "POINTS_JSON", "C_USR_ID", "C_AT", "C_SVC_ID", "C_PGM_ID",
                "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID", "VER");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM USER_COL_COMMENTS WHERE TABLE_NAME = 'TB_MDM_ERD_DIAGRAM_ROUTE' "
                + "AND COMMENTS IS NOT NULL", Integer.class)).isEqualTo(12);
    }

    /** V8: 다이어그램 노드의 표 크기 칸 SIZE_W·SIZE_H 는 NULL 허용(자동 크기)이고 주석이 있다. */
    @Test
    void nodeSizeColumnsAreNullableWithComments() {
        assertThat(jdbc.queryForList("SELECT COLUMN_NAME || ':' || NULLABLE FROM USER_TAB_COLUMNS WHERE TABLE_NAME = 'TB_MDM_ERD_DIAGRAM_NODE' "
                + "AND COLUMN_NAME IN ('SIZE_W', 'SIZE_H') ORDER BY COLUMN_NAME", String.class)).containsExactly("SIZE_H:Y", "SIZE_W:Y");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM USER_COL_COMMENTS WHERE TABLE_NAME = 'TB_MDM_ERD_DIAGRAM_NODE' "
                + "AND COLUMN_NAME IN ('SIZE_W', 'SIZE_H') AND COMMENTS IS NOT NULL", Integer.class)).isEqualTo(2);
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
