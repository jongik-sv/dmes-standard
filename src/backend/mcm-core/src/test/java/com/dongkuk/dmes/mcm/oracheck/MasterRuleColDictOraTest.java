package com.dongkuk.dmes.mcm.oracheck;

import com.dongkuk.dmes.mcm.repository.MasterRuleColListRepository;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link MasterRuleColListRepository} 의 Oracle 사전 뷰 조회(oracle-1007 c2: {@code ALL_TAB_COLUMNS}·{@code ALL_COL_COMMENTS}·
 * {@code ALL_CONSTRAINTS}·{@code ALL_CONS_COLUMNS}, OWNER='MCAAPUSER')를 실제 Oracle 에서 확인한다.
 *
 * <p>시험 표는 MCAAPUSER 접속으로 만든다(PK·칸 설명 포함) — 표 {@code TB_MCA_T_C4X} 는 MCMAPUSER 에게 SELECT 를 주고,
 * {@code TB_MCA_T_C4N} 은 주지 않는다. 조회는 앱 접속(MCMAPUSER)으로 한다. 시험마다 만들고 끝에서 DROP 한다(GRANT 도 함께 사라진다).
 */
@SpringJUnitConfig(OraCheckJpaConfig.class)
class MasterRuleColDictOraTest {

    private static final String GRANTED = "TB_MCA_T_C4X";
    private static final String NOT_GRANTED = "TB_MCA_T_C4N";

    @Autowired MasterRuleColListRepository repo;
    @Autowired JdbcTemplate appJdbc;

    private HikariDataSource mcaDs;
    private JdbcTemplate mca;

    @BeforeEach
    void createTables() {
        mcaDs = McmCoreOraTestDb.dataSource("MCAAPUSER", "oracheck-dict");
        mcaDs.setMaximumPoolSize(2);
        mca = new JdbcTemplate(mcaDs);
        for (String t : List.of(GRANTED, NOT_GRANTED)) {
            OraCheckDdl.dropTable(mca, "MCAAPUSER." + t);
            createTable(t);
        }
        mca.execute("GRANT SELECT ON MCAAPUSER." + GRANTED + " TO MCMAPUSER");
        cleanRuleRows();
    }

    @AfterEach
    void dropTables() {
        try {
            cleanRuleRows();
            for (String t : List.of(GRANTED, NOT_GRANTED)) OraCheckDdl.dropTable(mca, "MCAAPUSER." + t);
        } finally {
            mcaDs.close();
        }
    }

    private void cleanRuleRows() {
        mca.update("DELETE FROM MCAAPUSER.TB_MCA_RULE_COL_LIST WHERE RULE_ID IN ('T_C4X', 'T_C4N')");
        mca.update("DELETE FROM MCAAPUSER.TB_MCA_RULE_MASTER WHERE RULE_ID IN ('T_C4X', 'T_C4N')");
    }

    /** 문자·숫자·날짜·시각·CLOB 칸 + 감사/키 칸(RULE_VER·RULE_SEQ·C_AT·VER — 조회에서 빠져야 한다) + 복합 PK(CURR_CD, BASE_DT) + 칸 설명. */
    private void createTable(String table) {
        mca.execute("CREATE TABLE MCAAPUSER." + table + " ("
                + " RULE_VER NUMBER(8,2), RULE_SEQ NUMBER(10) NOT NULL,"
                + " CURR_CD VARCHAR2(20 CHAR) NOT NULL, AMT NUMBER(10,2), BASE_DT DATE NOT NULL,"
                + " TS_COL TIMESTAMP(6), MEMO CLOB, C_AT TIMESTAMP(6), VER NUMBER(19,0),"
                + " CONSTRAINT PK_" + table + " PRIMARY KEY (CURR_CD, BASE_DT))");
        mca.execute("COMMENT ON COLUMN MCAAPUSER." + table + ".CURR_CD IS '통화코드'");
        mca.execute("COMMENT ON COLUMN MCAAPUSER." + table + ".AMT IS '금액'");
        mca.execute("COMMENT ON COLUMN MCAAPUSER." + table + ".BASE_DT IS '기준일'");
        mca.execute("COMMENT ON COLUMN MCAAPUSER." + table + ".MEMO IS '메모'");
    }

    private void ruleWithColDefs(String ruleId) {
        mca.update("INSERT INTO MCAAPUSER.TB_MCA_RULE_MASTER (RULE_ID, RULE_NM) VALUES (?, ?)", ruleId, ruleId + "-nm");
        // COL_ID 를 소문자로 둔 칸(base_dt) — 사전은 대문자로 보관하므로 UPPER(COL_ID) 비교가 필요하다
        Object[][] cols = {{1, "CURR_CD", "VARCHAR2"}, {2, "base_dt", "DATE"}, {3, "AMT", "NUMBER"}};
        for (Object[] c : cols) {
            mca.update("INSERT INTO MCAAPUSER.TB_MCA_RULE_COL_LIST (COL_SEQ, RULE_ID, COL_ID, COL_NM, COL_TYPE, IO_FLAG, MASTER_CODE_DIV) "
                    + "VALUES (?, ?, ?, ?, ?, 'OUT', 'N')", c[0], ruleId, c[1], c[1] + "-nm", c[2]);
        }
    }

    /** MCMAPUSER 가 SELECT ANY TABLE 을 가지면(로컬 시험 PDB 는 교차 스키마 접근용으로 준다) GRANT 없이도 ALL_* 뷰에 보인다. */
    private boolean appUserHasSelectAnyTable() {
        Integer n = appJdbc.queryForObject("SELECT COUNT(*) FROM SESSION_PRIVS WHERE PRIVILEGE = 'SELECT ANY TABLE'", Integer.class);
        return n != null && n > 0;
    }

    private static String s(Object o) {
        return o == null ? null : o.toString();
    }

    private static Integer i(Object o) {
        return o == null ? null : ((Number) o).intValue();
    }

    /** c2: searchSourceTableColumns — 칸·형 묶음·길이·설명·칸 순서, 감사/키 칸 제외, 표 이름은 소문자로 줘도 UPPER 로 비교. */
    @Test
    @DisplayName("searchSourceTableColumns — GRANT 한 표: 칸 순서·형(VARCHAR2·NUMBER·DATE 로 묶음)·길이·설명이 나오고 RULE_VER·RULE_SEQ·C_AT·VER 는 빠진다")
    void sourceTableColumns_granted() {
        List<Object[]> rows = repo.searchSourceTableColumns("T_C4X", GRANTED.toLowerCase());

        assertThat(rows).extracting(r -> s(r[2])).containsExactly("CURR_CD", "AMT", "BASE_DT", "TS_COL", "MEMO");
        // {ruleVer, ruleId, colId, colNm, colType, colLen, colPrecLen, ioFlag, masterCodeDiv}
        assertThat(rows).extracting(r -> s(r[4])).containsExactly("VARCHAR2", "NUMBER", "DATE", "DATE", "VARCHAR2");
        assertThat(rows.subList(0, 4)).extracting(r -> i(r[5])).as("COL_LEN(문자 20 글자·NUMBER 정밀도·DATE 7·TIMESTAMP 11)").containsExactly(20, 10, 7, 11);
        assertThat(i(rows.get(4)[5])).as("CLOB 도 COL_LEN 이 비지 않는다(공란이면 저장 불가)").isPositive();
        assertThat(rows).extracting(r -> i(r[6])).as("COL_PREC_LEN").containsExactly(null, 10, null, null, null);
        assertThat(rows).extracting(r -> s(r[3])).containsExactly("통화코드", "금액", "기준일", null, "메모");
        Object[] first = rows.get(0);
        assertThat(s(first[0])).isEqualTo("1");
        assertThat(s(first[1])).isEqualTo("T_C4X");
        assertThat(s(first[7])).isEqualTo("OUT");
        assertThat(s(first[8])).isEqualTo("N");
    }

    /** c2: GRANT 가 없으면 ALL_* 뷰가 그 표를 빼서 0건(권한 없음과 표 없음을 구분 못 한다는 안내와 같은 동작). */
    @Test
    @DisplayName("searchSourceTableColumns — GRANT 없는 표는 0건(오류 없이)")
    void sourceTableColumns_notGranted() {
        Assumptions.assumeFalse(appUserHasSelectAnyTable(),
                "MCMAPUSER 에 SELECT ANY TABLE 이 있으면(로컬 시험 PDB 기본) GRANT 없이도 보인다 — 운영 최소 권한 PDB 에서만 확인");

        assertThat(repo.searchSourceTableColumns("T_C4N", NOT_GRANTED)).isEmpty();
    }

    @Test
    @DisplayName("searchSourceTableColumns — 없는 표는 0건")
    void sourceTableColumns_missingTable() {
        assertThat(repo.searchSourceTableColumns("T_C4X", "TB_MCA_NO_SUCH_TABLE")).isEmpty();
    }

    /** c2: searchRuleColDefsWithPk — ALL_CONSTRAINTS(P)+ALL_CONS_COLUMNS EXISTS 로 PK_YN, 칸 ID 는 UPPER 비교. */
    @Test
    @DisplayName("searchRuleColDefsWithPk — GRANT 한 표: 복합 PK(CURR_CD·BASE_DT) 칸은 PK_YN='Y'(소문자 COL_ID 포함), 그 밖은 'N'")
    void ruleColDefsWithPk_granted() {
        ruleWithColDefs("T_C4X");

        List<Object[]> rows = repo.searchRuleColDefsWithPk("T_C4X");

        // {RULE_ID, COL_SEQ, COL_ID, COL_NM, COL_LEN, COL_PREC_LEN, MES_COL_ID, CODE_YN, PK_YN, COL_TYPE, IO_FLAG}
        assertThat(rows).extracting(r -> s(r[2])).containsExactly("CURR_CD", "base_dt", "AMT");
        assertThat(rows).extracting(r -> s(r[8])).containsExactly("Y", "Y", "N");
        assertThat(rows).extracting(r -> s(r[9])).containsExactly("VARCHAR2", "DATE", "NUMBER");
        assertThat(rows).extracting(r -> i(r[1])).containsExactly(1, 2, 3);
        assertThat(s(rows.get(0)[7])).isEqualTo("N");
    }

    /** c2: GRANT 없는 표는 PK 사전이 안 보여 모두 'N' (권한 없음과 PK 없음을 구분 못 한다). */
    @Test
    @DisplayName("searchRuleColDefsWithPk — GRANT 없는 표는 PK 가 있어도 모두 PK_YN='N'")
    void ruleColDefsWithPk_notGranted() {
        Assumptions.assumeFalse(appUserHasSelectAnyTable(),
                "MCMAPUSER 에 SELECT ANY TABLE 이 있으면(로컬 시험 PDB 기본) GRANT 없이도 보인다 — 운영 최소 권한 PDB 에서만 확인");
        ruleWithColDefs("T_C4N");

        assertThat(repo.searchRuleColDefsWithPk("T_C4N")).extracting(r -> s(r[8])).containsExactly("N", "N", "N");
    }

    /** c2: PK 판정 대상 표가 아예 없어도 오류 없이 모두 'N'. */
    @Test
    @DisplayName("searchRuleColDefsWithPk — 표가 없는 업무기준은 오류 없이 모두 PK_YN='N'")
    void ruleColDefsWithPk_noTable() {
        OraCheckDdl.dropTable(mca, "MCAAPUSER." + NOT_GRANTED);
        ruleWithColDefs("T_C4N");

        assertThat(repo.searchRuleColDefsWithPk("T_C4N")).extracting(r -> s(r[8])).containsExactly("N", "N", "N");
    }
}
