package com.dongkuk.dmes.mcm.widget.ext;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import javax.sql.DataSource;

/**
 * 시험용 MDM 항목 표 — mcm-core 시험 PDB 에는 MDM 스키마가 없으므로, 앱 사용자(MCMAPUSER) 스키마에 {@code TB_MDM_DATA_ITEM} 과
 * 같은 모양(읽기에 쓰는 칸만)의 표를 만들고 {@code dmes.widget.ext.exchange.mdm-schema=MCMAPUSER} 로 읽게 한다.
 * 표는 시험이 끝나면 지운다({@link #drop}) — 스키마 준비({@code McmCoreOraTestDb.ensureMigrated})가 JVM 당 한 번 clean 하므로
 * 그 뒤(데이터 소스를 받은 뒤)에 만들어야 한다.
 */
final class FxMasterTestTable {

    static final String SCHEMA = "MCMAPUSER";
    static final Timestamp OPEN_END = Timestamp.valueOf("9999-12-31 00:00:00");

    private FxMasterTestTable() {
    }

    /** 표가 없으면 만들고, 있으면 행만 지운다. */
    static void createOrClear(DataSource ds) {
        try (Connection c = ds.getConnection(); Statement st = c.createStatement()) {
            if (exists(c)) {
                st.executeUpdate("DELETE FROM TB_MDM_DATA_ITEM");
            } else {
                st.execute("CREATE TABLE TB_MDM_DATA_ITEM ("
                        + " MARU_DATA_ID VARCHAR2(50 CHAR) NOT NULL"
                        + ", CODE VARCHAR2(50 CHAR) NOT NULL"
                        + ", VALID_FROM TIMESTAMP(6) NOT NULL"
                        + ", VALID_TO TIMESTAMP(6) DEFAULT TIMESTAMP '9999-12-31 00:00:00' NOT NULL"
                        + ", ATTR01 VARCHAR2(4000 BYTE)"
                        + ", ATTR02 VARCHAR2(4000 BYTE)"
                        + ", ATTR03 VARCHAR2(4000 BYTE)"
                        + ", ATTR04 VARCHAR2(4000 BYTE)"
                        + ", ATTR05 VARCHAR2(4000 BYTE)"
                        + ", CONSTRAINT PK_FX_TEST_ITEM PRIMARY KEY (MARU_DATA_ID, CODE, VALID_FROM))");
            }
            if (!c.getAutoCommit()) c.commit();
        } catch (SQLException e) {
            throw new IllegalStateException("시험 표 준비 실패: " + e.getMessage(), e);
        }
    }

    static void drop(DataSource ds) {
        try (Connection c = ds.getConnection(); Statement st = c.createStatement()) {
            if (exists(c)) st.execute("DROP TABLE TB_MDM_DATA_ITEM PURGE");
        } catch (SQLException e) {
            throw new IllegalStateException("시험 표 삭제 실패: " + e.getMessage(), e);
        }
    }

    /** 열린 {@code FX_RATE} 행 하나(키는 통화+기준일, 기준 통화 KRW). */
    static void fxRate(DataSource ds, String cur, String ymd, String rate) {
        insert(ds, "FX_RATE", cur + ymd, OPEN_END, cur, ymd, rate, "KRW");
    }

    static void insert(DataSource ds, String maruDataId, String code, Timestamp validTo,
                       String attr01, String attr02, String attr03, String attr04) {
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("INSERT INTO TB_MDM_DATA_ITEM"
                     + " (MARU_DATA_ID, CODE, VALID_FROM, VALID_TO, ATTR01, ATTR02, ATTR03, ATTR04, ATTR05)"
                     + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'koreaexim')")) {
            ps.setString(1, maruDataId);
            ps.setString(2, code);
            ps.setTimestamp(3, Timestamp.valueOf("2026-10-01 00:00:00"));
            ps.setTimestamp(4, validTo);
            ps.setString(5, attr01);
            ps.setString(6, attr02);
            ps.setString(7, attr03);
            ps.setString(8, attr04);
            ps.executeUpdate();
            if (!c.getAutoCommit()) c.commit();
        } catch (SQLException e) {
            throw new IllegalStateException("시험 행 넣기 실패: " + e.getMessage(), e);
        }
    }

    private static boolean exists(Connection c) throws SQLException {
        try (Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME = 'TB_MDM_DATA_ITEM'")) {
            rs.next();
            return rs.getInt(1) > 0;
        }
    }
}
