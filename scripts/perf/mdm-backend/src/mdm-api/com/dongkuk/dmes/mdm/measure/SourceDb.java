package com.dongkuk.dmes.mdm.measure;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * P3·P4 데이터 — 로컬 MDM DB 사본(SQLite, {@code MDM_MEASURE_SOURCE_DB})의 용어·도메인·컬럼·시스템 매핑을 원래 ID 그대로 시험 DB 로 옮긴다.
 *
 * <p>합성 데이터를 쓰지 않는 이유: 변경 쪽 DB 1차 거름(LIKE)의 후보 행 수는 글자 모양(JSON 원문의 역슬래시·null, 약어·동의어 분포)에 달려
 * 있어 합성 분포로는 실제 후보 수를 재현하지 못한다(예: perf-mdm-backend.md P3 의 'coil' 후보 249행 대 실제 일치 29행).
 * 사본이 없으면 실패한다(합성으로 몰래 바꾸지 않는다). 사본은 Flyway V22 스키마이고 시험 DB 도 V22 라 칸 이름을 명시해 옮긴다.
 *
 * <p>한 연결에서 외래키 강제를 끄고 ATTACH → INSERT … SELECT(한 트랜잭션) → DETACH → 외래키를 다시 켠다(기존 시험의
 * {@code withForeignKeysOff} 와 같은 방식). EMBEDDING 은 엔티티에 매핑되지 않지만 행 크기(4,096바이트)가 표 훑기 비용에 들어가므로 함께 옮긴다.
 */
final class SourceDb {

    static final String TERM_COLS = "TERM_ID, TERM_NAME, SENSE_NO, DEFINITION, CONTEXT, ENG_NAME, ENG_ABBR, SYNONYMS, ALIASES, "
            + "SYSTEMS, STD_BASIS, OWNER_DEPT, OWNER_ID, SRC_ORIGIN, EMBEDDING, EMBEDDING_MODEL, VER";
    static final String DOMAIN_COLS = "DOMAIN_ID, DOMAIN_NAME, STD_NAME, PARENT_DOMAIN_ID, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE, "
            + "UNIT_CODE, MARU_CODE_ID, CATE_ID, STD_RULE, STD_AST, BIZ_RULE, BIZ_AST, DESCRIPTION, EXAMPLES, TEST_CASES, CHG_SEQ, VER";
    static final String COLUMN_COLS = "COLUMN_ID, COLUMN_NAME, LABEL_LONG, LABEL_MID, LABEL_SHORT, PHYS_NAME, DESCRIPTION, DOMAIN_ID, "
            + "REQUIRED, DEFAULT_VALUE, REF_KIND, REF_TARGET, REF_CATE_ID, TERM_IDS, USAGE_NOTE, CHG_SEQ, VER";
    static final String MAPPING_COLS = "COLUMN_ID, SYSTEM_CODE, PHYS_NAME, TRANSFORM, NOTE, VER";

    /** P4 의 저장 시나리오가 새로 만드는 컬럼 — 사본에 이미 있으므로 옮기지 않는다(있으면 save 가 COLUMN_DUPLICATED 로 일찍 끝난다). */
    static final String SAVE_COLUMN_NAME = "원재료 코일 두께";
    static final String SAVE_PHYS_NAME = "RMTL_COIL_THK";

    /** 마른 실행(dry-run)에서 옮기는 행 수 상한. */
    static final int DRY_LIMIT = 50;

    private SourceDb() {
    }

    static Path path() {
        String p = System.getenv("MDM_MEASURE_SOURCE_DB");
        if (p == null || p.isBlank()) {
            throw new IllegalStateException("MDM_MEASURE_SOURCE_DB(로컬 MDM DB 사본 경로)가 필요하다 — run-measure.sh 가 넣는다");
        }
        Path path = Path.of(p);
        if (!Files.isRegularFile(path)) {
            throw new IllegalStateException("MDM_MEASURE_SOURCE_DB 파일이 없다: " + path);
        }
        return path;
    }

    /**
     * 네 표를 비우고(용어만이면 용어 표만 채운다) 사본에서 옮긴다. 돌려주는 값은 표별 행 수.
     *
     * @param dictionary false 면 용어만(P3), true 면 용어·도메인·컬럼·매핑(P4)
     */
    static Map<String, Integer> load(DataSource dataSource, boolean dictionary) {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.update("DELETE FROM TB_MDM_COLUMN_SYSTEM");
        jdbc.update("DELETE FROM TB_MDM_COLUMN");
        jdbc.update("DELETE FROM TB_MDM_TERM");
        jdbc.update("DELETE FROM TB_MDM_DOMAIN");
        String lim = MeasureSupport.dry() ? " LIMIT " + DRY_LIMIT : "";
        String file = path().toAbsolutePath().toString().replace("'", "''");
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            boolean auto = c.getAutoCommit();
            c.setAutoCommit(true);
            st.execute("PRAGMA foreign_keys = OFF");
            try {
                st.execute("ATTACH DATABASE '" + file + "' AS msrc");
                try {
                    c.setAutoCommit(false);
                    try {
                        st.executeUpdate("INSERT INTO main.TB_MDM_TERM (" + TERM_COLS + ") SELECT " + TERM_COLS
                                + " FROM msrc.TB_MDM_TERM ORDER BY TERM_ID" + lim);
                        if (dictionary) {
                            st.executeUpdate("INSERT INTO main.TB_MDM_DOMAIN (" + DOMAIN_COLS + ") SELECT " + DOMAIN_COLS
                                    + " FROM msrc.TB_MDM_DOMAIN ORDER BY DOMAIN_ID");
                            st.executeUpdate("INSERT INTO main.TB_MDM_COLUMN (" + COLUMN_COLS + ") SELECT " + COLUMN_COLS
                                    + " FROM msrc.TB_MDM_COLUMN WHERE COLUMN_NAME <> '" + SAVE_COLUMN_NAME + "' AND PHYS_NAME <> '"
                                    + SAVE_PHYS_NAME + "' ORDER BY COLUMN_ID" + lim);
                            st.executeUpdate("INSERT INTO main.TB_MDM_COLUMN_SYSTEM (" + MAPPING_COLS + ") SELECT " + MAPPING_COLS
                                    + " FROM msrc.TB_MDM_COLUMN_SYSTEM WHERE COLUMN_ID IN (SELECT COLUMN_ID FROM main.TB_MDM_COLUMN)");
                        }
                        c.commit();
                    } catch (SQLException e) {
                        c.rollback();
                        throw e;
                    } finally {
                        c.setAutoCommit(true);
                    }
                } finally {
                    st.execute("DETACH DATABASE msrc");
                }
            } finally {
                st.execute("PRAGMA foreign_keys = ON");
                c.setAutoCommit(auto);
            }
        } catch (SQLException e) {
            throw new IllegalStateException("사본 옮기기 실패: " + e.getMessage(), e);
        }
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (String t : new String[] {"TB_MDM_TERM", "TB_MDM_DOMAIN", "TB_MDM_COLUMN", "TB_MDM_COLUMN_SYSTEM"}) {
            counts.put(t, jdbc.queryForObject("SELECT COUNT(*) FROM " + t, Integer.class));
        }
        return counts;
    }
}
