package com.dongkuk.dmes.mqc.testdb;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

/**
 * mqc 표의 실제 컬럼 순서(COLUMN_ID 순, INVISIBLE 제외)가 컬럼 순서 규칙과 같은지 확인한다 — 시험 PDB(-Pdmes.ora.test=clone,
 * 시스템 속성 dmes.ora.url)에서만 돈다. 나중에 표를 더하는 V 파일도 이 시험에 걸린다.
 *
 * <p>규칙 데이터 = {@code scripts/db-order/column-order.json}(생성기 {@code gen.mjs rules} 출력)의 {@code schemas.mqc}.
 * 배열 순서 = 기대 COLUMN_ID 순서. 스키마는 이 모듈의 V 파일을 {@code MQCAPUSER} 로 적용해 만든다(이미 적용돼 있으면 그대로).
 */
class MqcColumnOrderOraTest {

    private static final String URL = System.getProperty("dmes.ora.url");
    private static final String USER = "MQCAPUSER";
    private static final String PASSWORD = System.getProperty("dmes.ora.password", "dmes_password_123");

    /** 저장소 루트까지 올라가며 규칙 파일을 찾는다. */
    private static Path rulesFile() {
        for (Path dir = Path.of("").toAbsolutePath(); dir != null; dir = dir.getParent()) {
            Path f = dir.resolve("scripts/db-order/column-order.json");
            if (Files.isRegularFile(f)) return f;
        }
        throw new IllegalStateException("scripts/db-order/column-order.json 을 찾지 못했다");
    }

    /** 표 이름 → 기대 컬럼 순서. */
    private static Map<String, List<String>> expectedOrder() throws Exception {
        JsonNode tables = new ObjectMapper().readTree(rulesFile().toFile())
                .path("schemas").path("mqc").path("tables");
        if (!tables.isObject()) throw new IllegalStateException("규칙 파일에 스키마 mqc 없음");
        Map<String, List<String>> result = new LinkedHashMap<>();
        tables.fields().forEachRemaining(e -> {
            List<String> cols = new ArrayList<>();
            e.getValue().forEach(c -> cols.add(c.path("col").asText()));
            result.put(e.getKey(), cols);
        });
        return result;
    }

    @Test
    void 표_컬럼_순서가_규칙_순서와_같다() throws Exception {
        assumeTrue(URL != null && !URL.isBlank(), "시험 PDB 접속값(dmes.ora.url)이 없어 건너뜀");

        Flyway.configure().dataSource(URL, USER, PASSWORD)
                .locations("classpath:db/migration/mqc").load().migrate();

        Map<String, List<String>> actual = new LinkedHashMap<>();
        try (Connection c = DriverManager.getConnection(URL, USER, PASSWORD);
                PreparedStatement ps = c.prepareStatement("SELECT TABLE_NAME, COLUMN_NAME FROM USER_TAB_COLS "
                        + "WHERE HIDDEN_COLUMN = 'NO' AND VIRTUAL_COLUMN = 'NO' ORDER BY TABLE_NAME, COLUMN_ID");
                ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                actual.computeIfAbsent(rs.getString(1), k -> new ArrayList<>()).add(rs.getString(2));
            }
        }

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
