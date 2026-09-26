package com.dongkuk.dmes.mdm.common.version;

import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * TSK-01-03 design.md §3.2 — seed-only 픽스처 테이블(백엔드 가이드: 생성 API 가 없을 때만 직접 INSERT).
 *
 * <p>실제 이름(TB_MDM_CODE_VER 등, TSK-06-01·08-01 이 만든다)과 겹치지 않게 {@code TB_MDM_TC_*} 로 만든다.
 * 칼럼은 원천 04·06 의 공통 칼럼과 감사 U_* 이다. 감사 카운터는 실제 DDL(decisions D-034)과 같게 버전 테이블은
 * {@code AUD_VER}, 부모 테이블은 {@code VER} 로 둬 두 카운터 경로를 따로 시험한다.
 */
public final class VersionFixtureTables {

    public static final VersionTableSpec CODE_SPEC = new VersionTableSpec(
            "TB_MDM_TC_CODE_VER", "MARU_CODE_ID", "VER", "TB_MDM_TC_CODE", "MARU_CODE_ID", "AUD_VER", "VER");
    public static final VersionTableSpec RULE_SPEC = new VersionTableSpec(
            "TB_MDM_TC_RULE_VER", "MARU_RULE_ID", "VER", "TB_MDM_TC_RULE", "MARU_RULE_ID", "AUD_VER", "VER");

    private VersionFixtureTables() {
    }

    public static VersionTableSpec spec(VersionTarget target) {
        return target == VersionTarget.MASTER_CODE ? CODE_SPEC : RULE_SPEC;
    }

    /** SQLite 문안. 업무 일시는 TEXT(규칙표 #16), 04 VER 는 NUMERIC(7,3), 06 VER 는 INTEGER. */
    public static List<String> sqliteDdl() {
        return List.of(
                parent("TB_MDM_TC_CODE", "MARU_CODE_ID", "VARCHAR(50)", "TEXT"),
                version("TB_MDM_TC_CODE_VER", "MARU_CODE_ID", "VARCHAR(50)", "NUMERIC(7,3)", "TEXT"),
                parent("TB_MDM_TC_RULE", "MARU_RULE_ID", "VARCHAR(50)", "TEXT"),
                version("TB_MDM_TC_RULE_VER", "MARU_RULE_ID", "VARCHAR(50)", "INTEGER", "TEXT"),
                // S14 원자성: ATOMIC_FAIL 의 RELEASED 행 APPLY_TO 변경을 막아 확정 7단계를 실패시킨다.
                "CREATE TRIGGER IF NOT EXISTS TR_TB_MDM_TC_CODE_VER_ATOMIC BEFORE UPDATE OF APPLY_TO ON TB_MDM_TC_CODE_VER "
                        + "WHEN OLD.MARU_CODE_ID = 'ATOMIC_FAIL' AND OLD.STATUS = 'RELEASED' "
                        + "BEGIN SELECT RAISE(ABORT, 'TSK-01-03 S14 atomic failure'); END");
    }

    public static void clear(JdbcTemplate jdbc) {
        jdbc.update("DELETE FROM TB_MDM_TC_CODE_VER");
        jdbc.update("DELETE FROM TB_MDM_TC_CODE");
        jdbc.update("DELETE FROM TB_MDM_TC_RULE_VER");
        jdbc.update("DELETE FROM TB_MDM_TC_RULE");
    }

    private static String parent(String table, String idColumn, String idType, String timeType) {
        return "CREATE TABLE " + (timeType.equals("TEXT") ? "IF NOT EXISTS " : "") + table + " ("
                + idColumn + " " + idType + " NOT NULL PRIMARY KEY, "
                + "STATUS VARCHAR(20) NOT NULL, "
                + "U_USR_ID VARCHAR(50), U_AT " + timeType + ", U_SVC_ID VARCHAR(100), U_PGM_ID VARCHAR(100), "
                + "VER BIGINT)";
    }

    private static String version(String table, String idColumn, String idType, String verType, String timeType) {
        return "CREATE TABLE " + (timeType.equals("TEXT") ? "IF NOT EXISTS " : "") + table + " ("
                + idColumn + " " + idType + " NOT NULL, "
                + "VER " + verType + " NOT NULL, "
                + "STATUS VARCHAR(20) NOT NULL, "
                + "OWNER_ID VARCHAR(50), "
                + "APPLY_FROM " + timeType + ", APPLY_TO " + timeType + ", "
                + "REQUESTED_BY VARCHAR(50), REQUESTED_AT " + timeType + ", "
                + "APPROVED_BY VARCHAR(50), APPROVED_AT " + timeType + ", "
                + "RELEASED_AT " + timeType + ", "
                + "ROW_VERSION BIGINT NOT NULL DEFAULT 0, "
                + "U_USR_ID VARCHAR(50), U_AT " + timeType + ", U_SVC_ID VARCHAR(100), U_PGM_ID VARCHAR(100), "
                + "AUD_VER BIGINT, "
                + "PRIMARY KEY (" + idColumn + ", VER))";
    }
}
