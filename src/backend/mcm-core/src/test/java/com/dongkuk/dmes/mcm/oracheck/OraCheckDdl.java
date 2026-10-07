package com.dongkuk.dmes.mcm.oracheck;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * oracheck 시험이 만드는 시험 표의 DDL 도우미 — 만들기 전에 지우고(없으면 무시), 끝에서 지운다.
 * {@code PURGE} 로 지워 휴지통({@code BIN$…}) 표가 남지 않게 한다(남으면 {@code McmCoreOraTestDb.resetData} 의 DELETE 반복이 실패한다).
 */
final class OraCheckDdl {

    private OraCheckDdl() {
    }

    /** {@code owner.table} 이 있으면 지운다(ORA-00942 만 무시). 표와 함께 그 표에 준 GRANT 도 사라진다. */
    static void dropTable(JdbcTemplate jdbc, String qualifiedTable) {
        jdbc.execute("BEGIN EXECUTE IMMEDIATE 'DROP TABLE " + qualifiedTable + " PURGE'; "
                + "EXCEPTION WHEN OTHERS THEN IF SQLCODE != -942 THEN RAISE; END IF; END;");
    }
}
