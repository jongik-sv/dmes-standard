package com.dongkuk.dmes.mcm.oracheck;

import com.dongkuk.dmes.mcm.csa.commSyncMng.service.CommSyncMngService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * commSyncMng 가 INSERT·SELECT 에 이름으로 적은 컬럼 목록이 세 스키마(MCM_SOURCE·MCMAPUSER·MCM_BACKUP)의
 * TB_MCM_CODE_* 실제 컬럼 집합과 같은지 확인한다(MCM_BACKUP 은 DETAIL 표가 없어 제외). 컬럼 순서는 보지 않는다(순서 규칙은 별도 시험).
 */
@SpringJUnitConfig(OraCheckJpaConfig.class)
class CommSyncMngColumnSetOraTest {

    @Autowired JdbcTemplate jdbc;

    private static final List<String> SCHEMAS = List.of("MCM_SOURCE", "MCMAPUSER", "MCM_BACKUP");

    @SuppressWarnings("unchecked")
    private static Map<String, String> tableColumns() {
        return (Map<String, String>) ReflectionTestUtils.getField(CommSyncMngService.class, "TABLE_COLUMNS");
    }

    private Set<String> actualColumns(String schema, String table) {
        return new TreeSet<>(jdbc.queryForList(
                "SELECT COLUMN_NAME FROM ALL_TAB_COLS WHERE OWNER = ? AND TABLE_NAME = ? AND HIDDEN_COLUMN = 'NO'",
                String.class, schema, table));
    }

    @Test
    @DisplayName("TABLE_COLUMNS — 세 스키마의 TB_MCM_CODE_MASTER·DETAIL·CATEGORY 컬럼 집합과 일치")
    void columnListMatchesAllSchemas() {
        Map<String, String> declared = tableColumns();
        assertThat(declared).containsOnlyKeys("TB_MCM_CODE_MASTER", "TB_MCM_CODE_DETAIL", "TB_MCM_CODE_CATEGORY");
        declared.forEach((table, cols) -> {
            Set<String> expected = new TreeSet<>(Arrays.stream(cols.split(",")).map(String::trim).toList());
            for (String schema : SCHEMAS) {
                // MCM_BACKUP 에는 DETAIL 표가 없다(서비스도 건너뜀).
                if ("MCM_BACKUP".equals(schema) && "TB_MCM_CODE_DETAIL".equals(table)) continue;
                assertThat(actualColumns(schema, table))
                        .as("%s.%s 컬럼 집합", schema, table)
                        .isEqualTo(expected);
            }
        });
    }
}
