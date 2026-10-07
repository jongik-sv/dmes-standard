package com.dongkuk.dmes.mls.testdb;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

/**
 * mls Oracle 기준선 smoke 시험 — 시험 PDB(-Pdmes.ora.test=clone, 시스템 속성 dmes.ora.url)에서만 돈다.
 *
 * <p>V1 기준선을 MLSAPUSER 로 적용하고 sample_inventory_item 에 한 건을 넣어 읽는다. 풀 없이 연결 하나만 쓴다(Oracle 인스턴스를
 * 모든 레인이 공유한다). 컨텍스트를 띄우는 시험은 {@link MlsTestDb} 를 상속한다.
 */
class MlsOracleSmokeTest {

    private static final String URL = System.getProperty("dmes.ora.url");
    private static final String USER = "MLSAPUSER";
    private static final String PASSWORD = System.getProperty("dmes.ora.password", "dmes_password_123");

    @Test
    void flyway_v1_creates_sample_inventory_item_and_a_row_round_trips() throws Exception {
        assumeTrue(URL != null && !URL.isBlank(), "시험 PDB 접속값(dmes.ora.url)이 없어 건너뜀");

        Flyway.configure().dataSource(URL, USER, PASSWORD)
                .locations("classpath:db/migration/mls").load().migrate();

        try (Connection connection = DriverManager.getConnection(URL, USER, PASSWORD)) {
            connection.setAutoCommit(false);
            try {
                try (PreparedStatement insert = connection.prepareStatement(
                        "INSERT INTO sample_inventory_item (item_code, item_name, qty, location) VALUES (?, ?, ?, ?)")) {
                    insert.setString(1, "SMOKE-1");
                    insert.setString(2, "스모크 품목");
                    insert.setBigDecimal(3, new BigDecimal("12.5000"));
                    insert.setString(4, "A-01");
                    assertEquals(1, insert.executeUpdate());
                }
                try (PreparedStatement select = connection.prepareStatement(
                        "SELECT id, item_name, qty FROM sample_inventory_item WHERE item_code = ?")) {
                    select.setString(1, "SMOKE-1");
                    try (ResultSet rs = select.executeQuery()) {
                        assertTrue(rs.next(), "넣은 행을 읽어야 한다");
                        assertTrue(rs.getLong("id") > 0, "IDENTITY 로 id 가 채워져야 한다");
                        assertEquals("스모크 품목", rs.getString("item_name"));
                        assertEquals(0, new BigDecimal("12.5").compareTo(rs.getBigDecimal("qty")));
                    }
                }
            } finally {
                connection.rollback();
            }
        }
    }
}
