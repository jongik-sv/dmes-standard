package com.dongkuk.dmes.mcm.widget.ext;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.List;
import javax.sql.DataSource;

/**
 * 시험용 MDM 표 — mcm-core 시험 PDB 에는 MDM 스키마가 없으므로, 앱 사용자(MCMAPUSER) 스키마에 {@code TB_MDM_DATA}(통화 라벨)와
 * {@code TB_MDM_DATA_ITEM}(날짜 한 행, 통화는 칼럼)과 같은 모양(읽기에 쓰는 칸만)의 표를 만들고
 * {@code dmes.widget.ext.exchange.mdm-schema=MCMAPUSER} 로 읽게 한다.
 * 표는 시험이 끝나면 지운다({@link #drop}) — 스키마 준비({@code McmCoreOraTestDb.ensureMigrated})가 JVM 당 한 번 clean 하므로
 * 그 뒤(데이터 소스를 받은 뒤)에 만들어야 한다.
 */
final class FxMasterTestTable {

    static final String SCHEMA = "MCMAPUSER";
    static final Timestamp OPEN_END = Timestamp.valueOf("9999-12-31 00:00:00");
    /** FX_RATE 정의의 추가 컬럼 라벨(ATTR01~10 순서) — 통화 코드. */
    static final List<String> LABELS = List.of("USD", "EUR", "JPY", "CNY", "GBP", "AUD", "CAD", "CHF", "HKD", "SGD");

    private FxMasterTestTable() {
    }

    /** 표가 없으면 만들고, 있으면 행만 지운다. 정의 표에는 FX_RATE 한 행(라벨 = {@link #LABELS})을 넣는다. */
    static void createOrClear(DataSource ds) {
        try (Connection c = ds.getConnection(); Statement st = c.createStatement()) {
            if (exists(c, "TB_MDM_DATA_ITEM")) {
                st.executeUpdate("DELETE FROM TB_MDM_DATA_ITEM");
            } else {
                st.execute("CREATE TABLE TB_MDM_DATA_ITEM ("
                        + " MARU_DATA_ID VARCHAR2(50 CHAR) NOT NULL"
                        + ", CODE VARCHAR2(50 CHAR) NOT NULL"
                        + ", VALID_FROM TIMESTAMP(6) NOT NULL"
                        + ", VALID_TO TIMESTAMP(6) DEFAULT TIMESTAMP '9999-12-31 00:00:00' NOT NULL"
                        + attrColumns("ATTR%02d")
                        + ", CONSTRAINT PK_FX_TEST_ITEM PRIMARY KEY (MARU_DATA_ID, CODE, VALID_FROM))");
            }
            if (exists(c, "TB_MDM_DATA")) {
                st.executeUpdate("DELETE FROM TB_MDM_DATA");
            } else {
                st.execute("CREATE TABLE TB_MDM_DATA ("
                        + " MARU_DATA_ID VARCHAR2(50 CHAR) NOT NULL PRIMARY KEY"
                        + attrColumns("ATTR%02d_NAME") + ")");
            }
            insertDefinition(c, LABELS);
            if (!c.getAutoCommit()) c.commit();
        } catch (SQLException e) {
            throw new IllegalStateException("시험 표 준비 실패: " + e.getMessage(), e);
        }
    }

    private static String attrColumns(String pattern) {
        StringBuilder sb = new StringBuilder();
        for (int i = 1; i <= 10; i++) sb.append(", ").append(String.format(pattern, i)).append(" VARCHAR2(4000 BYTE)");
        return sb.toString();
    }

    private static void insertDefinition(Connection c, List<String> labels) throws SQLException {
        StringBuilder cols = new StringBuilder("MARU_DATA_ID");
        StringBuilder marks = new StringBuilder("'FX_RATE'");
        for (int i = 1; i <= 10; i++) {
            cols.append(String.format(", ATTR%02d_NAME", i));
            marks.append(", ?");
        }
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO TB_MDM_DATA (" + cols + ") VALUES (" + marks + ")")) {
            for (int i = 0; i < 10; i++) ps.setString(i + 1, i < labels.size() ? labels.get(i) : null);
            ps.executeUpdate();
        }
    }

    /** FX_RATE 정의의 라벨을 바꾼다(통화 → 칼럼 대응 시험). */
    static void relabel(DataSource ds, List<String> labels) {
        try (Connection c = ds.getConnection(); Statement st = c.createStatement()) {
            st.executeUpdate("DELETE FROM TB_MDM_DATA");
            insertDefinition(c, labels);
            if (!c.getAutoCommit()) c.commit();
        } catch (SQLException e) {
            throw new IllegalStateException("시험 정의 바꾸기 실패: " + e.getMessage(), e);
        }
    }

    static void drop(DataSource ds) {
        try (Connection c = ds.getConnection(); Statement st = c.createStatement()) {
            if (exists(c, "TB_MDM_DATA_ITEM")) st.execute("DROP TABLE TB_MDM_DATA_ITEM PURGE");
            if (exists(c, "TB_MDM_DATA")) st.execute("DROP TABLE TB_MDM_DATA PURGE");
        } catch (SQLException e) {
            throw new IllegalStateException("시험 표 삭제 실패: " + e.getMessage(), e);
        }
    }

    /** 열린 {@code FX_RATE} 날짜 행(키 = 기준일)의 그 통화 칼럼에 환율을 넣는다. 날짜 행이 없으면 만든다. */
    static void fxRate(DataSource ds, String cur, String ymd, String rate) {
        int column = LABELS.indexOf(cur);
        if (column < 0) throw new IllegalArgumentException("시험 라벨에 없는 통화: " + cur);
        String col = String.format("ATTR%02d", column + 1);
        try (Connection c = ds.getConnection()) {
            int updated;
            try (PreparedStatement ps = c.prepareStatement("UPDATE TB_MDM_DATA_ITEM SET " + col + " = ?"
                    + " WHERE MARU_DATA_ID = 'FX_RATE' AND CODE = ? AND VALID_TO = ?")) {
                ps.setString(1, rate);
                ps.setString(2, ymd);
                ps.setTimestamp(3, OPEN_END);
                updated = ps.executeUpdate();
            }
            if (updated == 0) {
                String[] attrs = new String[10];
                attrs[column] = rate;
                insert(ds, "FX_RATE", ymd, OPEN_END, attrs);
            } else if (!c.getAutoCommit()) {
                c.commit();
            }
        } catch (SQLException e) {
            throw new IllegalStateException("시험 행 넣기 실패: " + e.getMessage(), e);
        }
    }

    /** 항목 행 하나. {@code attrs} 는 ATTR01~10 순서(10개 미만이면 나머지는 NULL). */
    static void insert(DataSource ds, String maruDataId, String code, Timestamp validTo, String... attrs) {
        StringBuilder cols = new StringBuilder("MARU_DATA_ID, CODE, VALID_FROM, VALID_TO");
        StringBuilder marks = new StringBuilder("?, ?, ?, ?");
        for (int i = 1; i <= 10; i++) {
            cols.append(String.format(", ATTR%02d", i));
            marks.append(", ?");
        }
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("INSERT INTO TB_MDM_DATA_ITEM (" + cols + ") VALUES (" + marks + ")")) {
            ps.setString(1, maruDataId);
            ps.setString(2, code);
            ps.setTimestamp(3, Timestamp.valueOf("2026-10-01 00:00:00"));
            ps.setTimestamp(4, validTo);
            for (int i = 0; i < 10; i++) ps.setString(5 + i, i < attrs.length ? attrs[i] : null);
            ps.executeUpdate();
            if (!c.getAutoCommit()) c.commit();
        } catch (SQLException e) {
            throw new IllegalStateException("시험 행 넣기 실패: " + e.getMessage(), e);
        }
    }

    private static boolean exists(Connection c, String table) throws SQLException {
        try (Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME = '" + table + "'")) {
            rs.next();
            return rs.getInt(1) > 0;
        }
    }
}
