package com.dongkuk.dmes.mcm.oracheck;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 복제 PDB 의 실제 컬럼 순서(USER_TAB_COLUMNS 의 COLUMN_ID 순, INVISIBLE 제외)가 컬럼 순서 규칙과 같은지 확인한다.
 * 나중에 표를 더하는 V 파일도 이 시험에 걸린다.
 *
 * <p>규칙 데이터 = {@code scripts/db-order/column-order.json}(생성기 {@code gen.mjs rules} 출력).
 * 모양: {@code {"schemas":{"<key>":{"tables":{"TB_X":[{"col":"A","group":"pk"},…]}}}}}, 배열 순서 = 기대 COLUMN_ID 순서.
 */
@SpringJUnitConfig(OraCheckJpaConfig.class)
class ColumnOrderOraTest {

    @Autowired JdbcTemplate jdbc;

    /** mcm-core 가 다루는 스키마(규칙 파일 key). 오라클 스키마 이름은 대문자. */
    private static final List<String> SCHEMA_KEYS = List.of("mcmapuser", "mcaapuser", "mcm_source", "mcm_backup");

    /** 저장소 루트까지 올라가며 규칙 파일을 찾는다. */
    private static Path rulesFile() {
        Path dir = Path.of("").toAbsolutePath();
        for (; dir != null; dir = dir.getParent()) {
            Path f = dir.resolve("scripts/db-order/column-order.json");
            if (Files.isRegularFile(f)) return f;
        }
        throw new IllegalStateException("scripts/db-order/column-order.json 을 찾지 못했다");
    }

    /** 표 이름 → 기대 컬럼 순서. */
    static Map<String, List<String>> expectedOrder(String schemaKey) throws IOException {
        JsonNode tables = new ObjectMapper().readTree(rulesFile().toFile())
                .path("schemas").path(schemaKey).path("tables");
        if (tables.isMissingNode() || !tables.isObject()) {
            throw new IllegalStateException("규칙 파일에 스키마 " + schemaKey + " 없음");
        }
        Map<String, List<String>> result = new LinkedHashMap<>();
        tables.fields().forEachRemaining(e -> {
            List<String> cols = new ArrayList<>();
            e.getValue().forEach(c -> cols.add(c.path("col").asText()));
            result.put(e.getKey(), cols);
        });
        return result;
    }

    /** 스키마의 표별 실제 컬럼 순서(보이는 컬럼만, COLUMN_ID 순). */
    private Map<String, List<String>> actualOrder(String schema) {
        Map<String, List<String>> result = new LinkedHashMap<>();
        jdbc.query("SELECT TABLE_NAME, COLUMN_NAME FROM ALL_TAB_COLS WHERE OWNER = ? AND HIDDEN_COLUMN = 'NO' "
                        + "AND VIRTUAL_COLUMN = 'NO' ORDER BY TABLE_NAME, COLUMN_ID",
                rs -> {
                    result.computeIfAbsent(rs.getString(1), k -> new ArrayList<>()).add(rs.getString(2));
                }, schema);
        return result;
    }

    @Test
    @DisplayName("스키마별 표 컬럼 순서 = 규칙 순서 (실패 시 표·기대 순서·실제 순서 출력)")
    void actualMatchesRule() throws IOException {
        List<String> violations = new ArrayList<>();
        for (String key : SCHEMA_KEYS) {
            String schema = key.toUpperCase();
            Map<String, List<String>> expected = expectedOrder(key);
            Map<String, List<String>> actual = actualOrder(schema);
            expected.forEach((table, exp) -> {
                List<String> act = actual.get(table);
                if (!exp.equals(act)) {
                    violations.add(schema + "." + table + "\n  기대: " + exp + "\n  실제: " + act);
                }
            });
        }
        assertThat(violations).as("컬럼 순서 규칙 위반 표").isEmpty();
    }
}
