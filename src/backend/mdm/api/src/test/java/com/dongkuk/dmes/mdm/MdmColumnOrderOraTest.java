package com.dongkuk.dmes.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 복제 PDB 의 MDMAPUSER 표 컬럼 순서(COLUMN_ID 순, INVISIBLE 제외)가 컬럼 순서 규칙과 같은지 확인한다.
 * 나중에 표를 더하는 V 파일도 이 시험에 걸린다.
 *
 * <p>규칙 데이터 = {@code scripts/db-order/column-order.json}(생성기 {@code gen.mjs rules} 출력)의 {@code schemas.mdm}.
 * 배열 순서 = 기대 COLUMN_ID 순서.
 */
@SpringBootTest
@ActiveProfiles("local")
class MdmColumnOrderOraTest extends AbstractMdmSharedDbTest {

    private static final String SCHEMA_KEY = "mdm";

    @Autowired JdbcTemplate jdbc;

    /** 저장소 루트까지 올라가며 규칙 파일을 찾는다. */
    private static Path rulesFile() {
        for (Path dir = Path.of("").toAbsolutePath(); dir != null; dir = dir.getParent()) {
            Path f = dir.resolve("scripts/db-order/column-order.json");
            if (Files.isRegularFile(f)) return f;
        }
        throw new IllegalStateException("scripts/db-order/column-order.json 을 찾지 못했다");
    }

    /** 표 이름 → 기대 컬럼 순서. */
    private static Map<String, List<String>> expectedOrder() throws IOException {
        JsonNode tables = new ObjectMapper().readTree(rulesFile().toFile())
                .path("schemas").path(SCHEMA_KEY).path("tables");
        if (!tables.isObject()) throw new IllegalStateException("규칙 파일에 스키마 " + SCHEMA_KEY + " 없음");
        Map<String, List<String>> result = new LinkedHashMap<>();
        tables.fields().forEachRemaining(e -> {
            List<String> cols = new ArrayList<>();
            e.getValue().forEach(c -> cols.add(c.path("col").asText()));
            result.put(e.getKey(), cols);
        });
        return result;
    }

    /** 현재 스키마의 표별 실제 컬럼 순서(보이는 컬럼만). */
    private Map<String, List<String>> actualOrder() {
        Map<String, List<String>> result = new LinkedHashMap<>();
        jdbc.query("SELECT TABLE_NAME, COLUMN_NAME FROM USER_TAB_COLS WHERE HIDDEN_COLUMN = 'NO' "
                        + "AND VIRTUAL_COLUMN = 'NO' ORDER BY TABLE_NAME, COLUMN_ID",
                rs -> {
                    result.computeIfAbsent(rs.getString(1), k -> new ArrayList<>()).add(rs.getString(2));
                });
        return result;
    }

    @Test
    void 표_컬럼_순서가_규칙_순서와_같다() throws IOException {
        Map<String, List<String>> actual = actualOrder();
        List<String> violations = new ArrayList<>();
        expectedOrder().forEach((table, exp) -> {
            List<String> act = actual.get(table);
            if (!exp.equals(act)) {
                violations.add(table + "\n  기대: " + exp + "\n  실제: " + act);
            }
        });
        assertThat(violations).as("컬럼 순서 규칙 위반 표(표·기대 순서·실제 순서)").isEmpty();
    }
}
