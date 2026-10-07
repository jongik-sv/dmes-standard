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

    /** 3단계 — 객체 ID 가 INTEGER 인 대상(레이아웃)의 친화도 확인용. */
    public static final VersionTableSpec LAYOUT_SPEC = new VersionTableSpec(
            "TB_MDM_TC_LAYOUT_VER", "LAYOUT_ID", "VER", "TB_MDM_TC_LAYOUT", "LAYOUT_ID", "AUD_VER", "VER");

    private VersionFixtureTables() {
    }

    public static VersionTableSpec spec(VersionTarget target) {
        return target == VersionTarget.MASTER_CODE ? CODE_SPEC : RULE_SPEC;
    }

    /**
     * Oracle 문안(메서드 이름은 이력 추적용으로 그대로 둔다). 업무 일시는 TIMESTAMP(6)(규칙표 #16), 04 VER 는 NUMBER(7,3), 06 VER 도
     * NUMBER(7,3)(V17). 시나리오 시험이 {@code @BeforeEach} 마다 부르므로 {@code IF NOT EXISTS}(Oracle 23ai 이상)로 만든다.
     * 시험이 만든 표·트리거는 공용 기반({@code AbstractMdmSharedDbTest})이 클래스마다 지운다.
     */
    public static List<String> sqliteDdl() {
        return List.of(
                parent("TB_MDM_TC_CODE", "MARU_CODE_ID", "VARCHAR2(50 CHAR)"),
                version("TB_MDM_TC_CODE_VER", "MARU_CODE_ID", "VARCHAR2(50 CHAR)", "NUMBER(7,3)"),
                parent("TB_MDM_TC_RULE", "MARU_RULE_ID", "VARCHAR2(50 CHAR)"),
                version("TB_MDM_TC_RULE_VER", "MARU_RULE_ID", "VARCHAR2(50 CHAR)", "NUMBER(7,3)"),
                // S14 원자성: ATOMIC_FAIL 의 RELEASED 행 APPLY_TO 변경을 막아 확정 7단계를 실패시킨다.
                // PL/SQL 블록이라 END; 까지가 한 문장이다(JDBC 에는 끝에 / 를 붙이지 않는다).
                "CREATE OR REPLACE TRIGGER TR_TB_MDM_TC_CODE_VER_ATOMIC BEFORE UPDATE OF APPLY_TO ON TB_MDM_TC_CODE_VER "
                        + "FOR EACH ROW WHEN (OLD.MARU_CODE_ID = 'ATOMIC_FAIL' AND OLD.STATUS = 'RELEASED') "
                        + "BEGIN RAISE_APPLICATION_ERROR(-20001, 'TSK-01-03 S14 atomic failure'); END;");
    }

    /** INTEGER 객체 ID 픽스처 두 표(Oracle). {@link #sqliteDdl()} 과 따로 둔다 — 기존 키트 상속 시험의 스키마를 바꾸지 않는다. */
    public static List<String> integerIdSqliteDdl() {
        return List.of(
                parent("TB_MDM_TC_LAYOUT", "LAYOUT_ID", "NUMBER(10)"),
                version("TB_MDM_TC_LAYOUT_VER", "LAYOUT_ID", "NUMBER(10)", "NUMBER(7,3)"));
    }

    public static void clearIntegerId(JdbcTemplate jdbc) {
        jdbc.update("DELETE FROM TB_MDM_TC_LAYOUT_VER");
        jdbc.update("DELETE FROM TB_MDM_TC_LAYOUT");
    }

    public static void clear(JdbcTemplate jdbc) {
        jdbc.update("DELETE FROM TB_MDM_TC_CODE_VER");
        jdbc.update("DELETE FROM TB_MDM_TC_CODE");
        jdbc.update("DELETE FROM TB_MDM_TC_RULE_VER");
        jdbc.update("DELETE FROM TB_MDM_TC_RULE");
    }

    private static String parent(String table, String idColumn, String idType) {
        return "CREATE TABLE IF NOT EXISTS " + table + " ("
                + idColumn + " " + idType + " NOT NULL PRIMARY KEY, "
                + "STATUS VARCHAR2(20 CHAR) NOT NULL, "
                + "U_USR_ID VARCHAR2(50 CHAR), U_AT TIMESTAMP(6), U_SVC_ID VARCHAR2(100 CHAR), U_PGM_ID VARCHAR2(100 CHAR), "
                + "VER NUMBER(19))";
    }

    private static String version(String table, String idColumn, String idType, String verType) {
        return "CREATE TABLE IF NOT EXISTS " + table + " ("
                + idColumn + " " + idType + " NOT NULL, "
                + "VER " + verType + " NOT NULL, "
                + "STATUS VARCHAR2(20 CHAR) NOT NULL, "
                + "OWNER_ID VARCHAR2(50 CHAR), "
                + "APPLY_FROM TIMESTAMP(6), APPLY_TO TIMESTAMP(6), "
                + "REQUESTED_BY VARCHAR2(50 CHAR), REQUESTED_AT TIMESTAMP(6), "
                + "APPROVED_BY VARCHAR2(50 CHAR), APPROVED_AT TIMESTAMP(6), "
                + "RELEASED_AT TIMESTAMP(6), "
                + "ROW_VERSION NUMBER(19) DEFAULT 0 NOT NULL, "
                + "U_USR_ID VARCHAR2(50 CHAR), U_AT TIMESTAMP(6), U_SVC_ID VARCHAR2(100 CHAR), U_PGM_ID VARCHAR2(100 CHAR), "
                + "AUD_VER NUMBER(19), "
                + "PRIMARY KEY (" + idColumn + ", VER))";
    }
}
