package com.dongkuk.dmes.mcm.oracheck;

import com.dongkuk.dmes.mcm.cmb.masterRuleData.dto.MasterRuleDataSearchRequest;
import com.dongkuk.dmes.mcm.cmb.masterRuleData.service.MasterRuleDataService;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * masterRuleData 의 동적 테이블 경로(CTE + ROW_NUMBER 페이징·동적 WHERE·INSERT/UPDATE/DELETE)를 실제 Oracle 에서 돌린다 —
 * oracle-1007 c2 가 바꾼 {@code CURRENT_TIMESTAMP}·{@code COALESCE(MAX(RULE_SEQ), 0)} 와 Oracle 에서 깨지기 쉬운 곳
 * (DATE 칸에 14자 글자 바인드·CLOB 칸 {@code =} 비교·CLOB 칸 값 읽기).
 *
 * <p>시험 표 {@code MCAAPUSER.TB_MCA_C4RD}(RULE_ID {@code C4RD})는 MCAAPUSER 접속으로 만들어 MCMAPUSER 에 SELECT·INSERT·UPDATE·DELETE 를
 * GRANT 하고, 컬럼정의(TB_MCA_RULE_COL_LIST)·업무기준(TB_MCA_RULE_MASTER) 행을 넣는다. 시험마다 만들고 끝에서 DROP·삭제한다.
 *
 * <p>DATE 칸·CLOB {@code =} 시험은 <b>정상 동작을 기대</b>하도록 썼다(기대값을 실패로 바꾸지 않는다). 실제로 실패하면 main 결함이다.
 * 메인 경로 시험은 문자·숫자 칸만 쓰므로 그 결함에 가려지지 않는다.
 */
@SpringJUnitConfig(OraCheckJpaConfig.class)
class MasterRuleDataDynamicTableOraTest {

    private static final String RULE_ID = "C4RD";
    private static final String TABLE = "MCAAPUSER.TB_MCA_C4RD";

    @Autowired MasterRuleDataService service;
    @Autowired JdbcTemplate appJdbc;
    @Autowired TransactionTemplate tx;

    private HikariDataSource mcaDs;
    private JdbcTemplate mca;

    @BeforeEach
    void createTable() {
        mcaDs = McmCoreOraTestDb.dataSource("MCAAPUSER", "oracheck-rule-data");
        mca = new JdbcTemplate(mcaDs);
        OraCheckDdl.dropTable(mca, TABLE);
        mca.execute("CREATE TABLE " + TABLE + " ("
                + " RULE_VER NUMBER(8,2), RULE_SEQ NUMBER(10) NOT NULL,"
                + " CURR_CD VARCHAR2(10 CHAR), AMT NUMBER(12,2), BASE_DT DATE, MEMO CLOB,"
                + " C_USR_ID VARCHAR2(100 CHAR), C_AT TIMESTAMP(6), C_SVC_ID VARCHAR2(100 CHAR), C_PGM_ID VARCHAR2(100 CHAR),"
                + " U_USR_ID VARCHAR2(100 CHAR), U_AT TIMESTAMP(6), U_SVC_ID VARCHAR2(100 CHAR), U_PGM_ID VARCHAR2(100 CHAR),"
                + " VER NUMBER(19,0), CONSTRAINT PK_TB_MCA_C4RD PRIMARY KEY (RULE_SEQ))");
        mca.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON " + TABLE + " TO MCMAPUSER");
        cleanRuleRows();
        mca.update("INSERT INTO MCAAPUSER.TB_MCA_RULE_MASTER (RULE_ID, RULE_NM) VALUES (?, 'c4 rule data')", RULE_ID);
        Object[][] cols = {{1, "CURR_CD", "VARCHAR2"}, {2, "AMT", "NUMBER"}, {3, "BASE_DT", "DATE"}, {4, "MEMO", "VARCHAR2"}};
        for (Object[] c : cols) {
            mca.update("INSERT INTO MCAAPUSER.TB_MCA_RULE_COL_LIST (COL_SEQ, RULE_ID, COL_ID, COL_NM, COL_TYPE, IO_FLAG, MASTER_CODE_DIV) "
                    + "VALUES (?, ?, ?, ?, ?, 'OUT', 'N')", c[0], RULE_ID, c[1], c[1] + "-nm", c[2]);
        }
    }

    @AfterEach
    void dropTable() {
        try {
            cleanRuleRows();
            OraCheckDdl.dropTable(mca, TABLE);
        } finally {
            mcaDs.close();
        }
    }

    private void cleanRuleRows() {
        mca.update("DELETE FROM MCAAPUSER.TB_MCA_RULE_COL_LIST WHERE RULE_ID = ?", RULE_ID);
        mca.update("DELETE FROM MCAAPUSER.TB_MCA_RULE_MASTER WHERE RULE_ID = ?", RULE_ID);
    }

    // ───────────────────────── 픽스처·도우미 ─────────────────────────

    private void row(int seq, String curr, Integer amt, LocalDateTime baseDt, String memo) {
        mca.update("INSERT INTO " + TABLE + " (RULE_VER, RULE_SEQ, CURR_CD, AMT, BASE_DT, MEMO) VALUES (1, ?, ?, ?, ?, ?)",
                seq, curr, amt, baseDt == null ? null : Timestamp.valueOf(baseDt), memo);
    }

    /** 5행: seq 1..5 = USD/usd2/EUR/JPY/GBP, AMT 10..50, 날짜 10-01..10-05 12:00, MEMO 'memo-n'. */
    private void fiveRows() {
        String[] curr = {"USD", "usd2", "EUR", "JPY", "GBP"};
        for (int i = 1; i <= 5; i++) {
            row(i, curr[i - 1], i * 10, LocalDateTime.of(2026, 10, i, 12, 0, 0), "memo-" + i);
        }
    }

    private MasterRuleDataSearchRequest req() {
        MasterRuleDataSearchRequest r = new MasterRuleDataSearchRequest();
        r.setPRuleId(RULE_ID);
        r.setPTable("TB_MCA_" + RULE_ID);
        return r;
    }

    private MasterRuleDataSearchRequest cond(String col, String op, String val) {
        MasterRuleDataSearchRequest r = req();
        r.setPWhere1(col);
        r.setPOperator1(op);
        r.setPVal1(val);
        return r;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> rows(Map<String, Object> out, String key) {
        return (List<Map<String, Object>>) out.get(key);
    }

    private static List<Long> seqs(List<Map<String, Object>> rows) {
        return rows.stream().map(r -> ((Number) r.get("RULE_SEQ")).longValue()).toList();
    }

    private Map<String, Object> saveInTx(List<Map<String, Object>> saveRows) {
        return tx.execute(status -> service.save(req(), saveRows));
    }

    /**
     * 조회도 운영(OASIS process 트랜잭션)처럼 트랜잭션 안에서 부른다 — 응답 행의 CLOB(MEMO)은 조회한 연결로 읽어 글자로 바꾸므로
     * 트랜잭션 밖(EntityManager 가 조회 직후 닫힘)에서 부르면 운영과 다른 조건이 된다(oracle-1007 c4).
     */
    private Map<String, Object> searchTx(MasterRuleDataSearchRequest r) {
        return tx.execute(status -> service.search(r));
    }

    private Map<String, Object> exportTx(MasterRuleDataSearchRequest r) {
        return tx.execute(status -> service.searchExport(r));
    }

    private static Map<String, Object> saveRow(String status, Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rowStatus", status);
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    /** Oracle DATE 는 드라이버 설정에 따라 Timestamp·java.sql.Date·LocalDateTime 으로 올 수 있어 모두 받는다. */
    private static LocalDateTime toLocalDateTime(Object v) {
        if (v instanceof Timestamp t) return t.toLocalDateTime();
        if (v instanceof LocalDateTime l) return l;
        if (v instanceof java.util.Date d) return new Timestamp(d.getTime()).toLocalDateTime();
        throw new AssertionError("날짜 값이 아니다: " + v);
    }

    private Map<String, Object> dbRow(long seq) {
        return appJdbc.queryForMap("SELECT RULE_VER, CURR_CD, AMT, BASE_DT, C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID "
                + "FROM " + TABLE + " WHERE RULE_SEQ = ?", seq);
    }

    // ───────────────────────── lov ─────────────────────────

    /** c2(사전 뷰 조회)로 읽은 컬럼정의가 서비스 응답(11키 대문자)으로 나온다. */
    @Test
    @DisplayName("lov — 컬럼정의 4칸이 11키 대문자 행으로 COL_SEQ 순서대로 나온다(PK 는 RULE_SEQ 라 PK_YN 모두 'N')")
    void lov() {
        Map<String, Object> out = service.lov(req());

        List<Map<String, Object>> list = rows(out, "ds_GetRuleColList");
        assertThat(list).extracting(r -> r.get("COL_ID")).containsExactly("CURR_CD", "AMT", "BASE_DT", "MEMO");
        assertThat(list).extracting(r -> r.get("PK_YN")).containsOnly("N");
        assertThat(list.get(0).keySet()).containsExactly("RULE_ID", "COL_SEQ", "COL_ID", "COL_NM", "COL_LEN", "COL_PREC_LEN",
                "MES_COL_ID", "CODE_YN", "PK_YN", "COL_TYPE", "IO_FLAG");
        assertThat(out.get("cnt")).isEqualTo(4);
    }

    // ───────────────────────── search (문자·숫자 칸만) ─────────────────────────

    /** c2: search 의 CTE(ROW_NUMBER)+BETWEEN 페이징이 Oracle 에서 돌고 TOTALCOUNT·SEQ 가 붙는다. */
    @Test
    @DisplayName("search — 한 쪽 2건 2쪽: RULE_SEQ 3·4, SEQ 3·4, TOTALCOUNT 5, 키는 대문자")
    void search_paging() {
        fiveRows();
        MasterRuleDataSearchRequest r = req();
        r.setCountPerPage(2);
        r.setCurrentPage(2);

        Map<String, Object> out = searchTx(r);

        List<Map<String, Object>> list = rows(out, "ds_GetMasterRuleData");
        assertThat(seqs(list)).containsExactly(3L, 4L);
        assertThat(list).extracting(x -> ((Number) x.get("SEQ")).intValue()).containsExactly(3, 4);
        assertThat(list.get(0)).containsKeys("TOTALCOUNT", "SEQ", "RULE_SEQ", "CURR_CD", "AMT", "BASE_DT");
        assertThat(list.get(0)).containsEntry("CURR_CD", "EUR");
        assertThat(out.get("cnt")).isEqualTo(2);
        assertThat(out.get("totalCount")).isEqualTo(5L);
    }

    /** c2: 마지막(짧은) 쪽과 범위 밖 쪽(빈 결과여도 실제 건수로 보정하는 COUNT 경로). */
    @Test
    @DisplayName("search — 마지막 쪽은 남은 1건, 범위 밖 쪽은 0건이지만 totalCount 는 5")
    void search_lastAndOutOfRangePage() {
        fiveRows();
        MasterRuleDataSearchRequest last = req();
        last.setCountPerPage(2);
        last.setCurrentPage(3);
        assertThat(seqs(rows(searchTx(last), "ds_GetMasterRuleData"))).containsExactly(5L);

        MasterRuleDataSearchRequest beyond = req();
        beyond.setCountPerPage(2);
        beyond.setCurrentPage(4);
        Map<String, Object> out = searchTx(beyond);
        assertThat(rows(out, "ds_GetMasterRuleData")).isEmpty();
        assertThat(out.get("totalCount")).isEqualTo(5L);
    }

    /** c2: 문자 칸 조건 {@code UPPER(col) LIKE UPPER(:v)} — 대소문자 무시(BR-008). */
    @Test
    @DisplayName("search — 문자 칸 LIKE 는 대소문자를 무시한다('us%' → USD·usd2)")
    void search_varcharLikeUpper() {
        fiveRows();

        Map<String, Object> out = searchTx(cond("CURR_CD", "LIKE", "us%"));

        assertThat(seqs(rows(out, "ds_GetMasterRuleData"))).containsExactly(1L, 2L);
        assertThat(out.get("totalCount")).isEqualTo(2L);
    }

    /** sargable-1008 s2: DATE 칸 LIKE 숫자 앞 일치는 반열린 범위로, 그 밖의 패턴은 TO_CHAR LIKE 로 — 결과가 같다. */
    @Test
    @DisplayName("search — DATE 칸 LIKE: 숫자 앞 일치(연·월·일·시, 구분자 포함)는 범위, %1003%·없는 날짜는 현행 경로")
    void search_dateLikePrefix() {
        fiveRows();   // 날짜 10-01..10-05 12:00

        assertThat(seqs(rows(searchTx(cond("BASE_DT", "LIKE", "2026%")), "ds_GetMasterRuleData"))).containsExactly(1L, 2L, 3L, 4L, 5L);
        assertThat(seqs(rows(searchTx(cond("BASE_DT", "LIKE", "202610%")), "ds_GetMasterRuleData"))).containsExactly(1L, 2L, 3L, 4L, 5L);
        assertThat(seqs(rows(searchTx(cond("BASE_DT", "LIKE", "202611%")), "ds_GetMasterRuleData"))).isEmpty();
        assertThat(seqs(rows(searchTx(cond("BASE_DT", "LIKE", "20261003%")), "ds_GetMasterRuleData"))).containsExactly(3L);
        assertThat(seqs(rows(searchTx(cond("BASE_DT", "LIKE", "2026-10-03 12%")), "ds_GetMasterRuleData"))).containsExactly(3L);
        assertThat(seqs(rows(searchTx(cond("BASE_DT", "LIKE", "2026100313%")), "ds_GetMasterRuleData"))).isEmpty();
        assertThat(seqs(rows(searchTx(cond("BASE_DT", "LIKE", "%1003%")), "ds_GetMasterRuleData"))).containsExactly(3L);
        assertThat(seqs(rows(searchTx(cond("BASE_DT", "LIKE", "20260231%")), "ds_GetMasterRuleData"))).isEmpty();
        assertThat(seqs(rows(searchTx(cond("BASE_DT", "LIKE", "2026100324%")), "ds_GetMasterRuleData"))).isEmpty();
    }

    /** c2: 숫자 칸 조건 — 문자열 값이 NUMBER 칸과 비교되고(>=) 문자 칸 = 도 대소문자 무시. */
    @Test
    @DisplayName("search — 숫자 칸 AMT >= '30'(문자열 바인드) → seq 3..5, 문자 칸 CURR_CD = 'eur' → seq 3")
    void search_numberAndEquals() {
        fiveRows();

        assertThat(seqs(rows(searchTx(cond("AMT", ">=", "30")), "ds_GetMasterRuleData"))).containsExactly(3L, 4L, 5L);
        assertThat(seqs(rows(searchTx(cond("CURR_CD", "=", "eur")), "ds_GetMasterRuleData"))).containsExactly(3L);
    }

    /** c2: 전건 조회(searchExport) — {@code SELECT * … ORDER BY RULE_SEQ}. */
    @Test
    @DisplayName("searchExport — 전건 5건이 RULE_SEQ 순")
    void searchExport() {
        fiveRows();

        Map<String, Object> out = exportTx(req());

        assertThat(seqs(rows(out, "ds_GetMasterRuleDataExport"))).containsExactly(1L, 2L, 3L, 4L, 5L);
        assertThat(out.get("cnt")).isEqualTo(5);
    }

    // ───────────────────────── save (문자·숫자 칸만) ─────────────────────────

    /** c2: INSERT 의 {@code COALESCE(MAX(RULE_SEQ), 0)} 채번과 {@code CURRENT_TIMESTAMP} audit — 기존 5행 뒤에 6번. */
    @Test
    @DisplayName("save(C) — RULE_SEQ = MAX+1(6), RULE_VER=1, audit(C_·U_ 계열, CURRENT_TIMESTAMP) 세팅, 재조회 동봉")
    void save_insertNumbersAfterMax() {
        fiveRows();

        Map<String, Object> out = saveInTx(List.of(saveRow("C", "CURR_CD", "KRW", "AMT", 60)));

        assertThat(out.get("cnt_save")).isEqualTo(1);
        assertThat(((Number) out.get("totalCount")).longValue()).isEqualTo(6L);
        Map<String, Object> db = dbRow(6);
        assertThat(db.get("CURR_CD")).isEqualTo("KRW");
        assertThat(((Number) db.get("AMT")).intValue()).isEqualTo(60);
        assertThat(((Number) db.get("RULE_VER")).intValue()).isEqualTo(1);
        assertThat(db.get("C_USR_ID")).isEqualTo("system");
        assertThat(db.get("U_USR_ID")).isEqualTo("system");
        assertThat(db.get("C_SVC_ID")).isEqualTo("masterRuleData");
        assertThat(db.get("U_PGM_ID")).isEqualTo("masterRuleData");
        assertThat(db.get("C_AT")).isNotNull();
        assertThat(db.get("U_AT")).isNotNull();
    }

    /** c2: 빈 표에서 COALESCE(MAX,0)+1 → 1번부터, 한 번의 저장에 둘이면 연속 번호. */
    @Test
    @DisplayName("save(C) — 빈 표에서는 1번부터, 한 번에 두 행이면 1·2")
    void save_insertIntoEmptyTable() {
        saveInTx(List.of(saveRow("C", "CURR_CD", "A"), saveRow("C", "CURR_CD", "B")));

        assertThat(appJdbc.queryForList("SELECT RULE_SEQ FROM " + TABLE + " ORDER BY RULE_SEQ", Long.class)).containsExactly(1L, 2L);
        assertThat(appJdbc.queryForList("SELECT CURR_CD FROM " + TABLE + " ORDER BY RULE_SEQ", String.class)).containsExactly("A", "B");
    }

    /** c2: UPDATE 의 {@code U_AT = CURRENT_TIMESTAMP} audit, 키 칸(RULE_VER·RULE_SEQ)은 SET 에서 제외. */
    @Test
    @DisplayName("save(U) — 값이 바뀌고 U_ 계열 audit 만 갱신, C_ 계열·RULE_VER 은 그대로")
    void save_update() {
        fiveRows();

        saveInTx(List.of(saveRow("U", "RULE_SEQ", 2, "CURR_CD", "XXX", "AMT", 99)));

        Map<String, Object> db = dbRow(2);
        assertThat(db.get("CURR_CD")).isEqualTo("XXX");
        assertThat(((Number) db.get("AMT")).intValue()).isEqualTo(99);
        assertThat(((Number) db.get("RULE_VER")).intValue()).isEqualTo(1);
        assertThat(db.get("U_SVC_ID")).isEqualTo("masterRuleData");
        assertThat(db.get("U_AT")).isNotNull();
        assertThat(db.get("C_USR_ID")).isNull();
        assertThat(dbRow(3).get("CURR_CD")).isEqualTo("EUR");
    }

    @Test
    @DisplayName("save(D) — RULE_SEQ 로 지운다")
    void save_delete() {
        fiveRows();

        saveInTx(List.of(saveRow("D", "RULE_SEQ", 4)));

        assertThat(appJdbc.queryForList("SELECT RULE_SEQ FROM " + TABLE + " ORDER BY RULE_SEQ", Long.class)).containsExactly(1L, 2L, 3L, 5L);
    }

    // ───────────────────────── 실패하기 쉬운 곳 — 정상 동작을 기대 ─────────────────────────

    /**
     * DATE 칸 조건에 14자 글자(yyyyMMddHHmmss)를 바인드한다. Oracle 은 DATE 와 글자를 비교할 때 세션 NLS_DATE_FORMAT 으로
     * 글자를 날짜로 바꾸는데 14자 숫자는 그 형식과 맞지 않아 ORA-01861 등으로 실패할 수 있다(main 결함 후보).
     */
    @Test
    @DisplayName("search — DATE 칸 BASE_DT >= '20261003000000' (14자 글자) → seq 3..5")
    void search_dateCondition_14charString() {
        fiveRows();

        Map<String, Object> out = searchTx(cond("BASE_DT", ">=", "20261003000000"));

        assertThat(seqs(rows(out, "ds_GetMasterRuleData"))).containsExactly(3L, 4L, 5L);
    }

    /** DATE 칸 INSERT 값 14자 글자 바인드(BR-009 절단 후) — 같은 원인으로 실패할 수 있다(main 결함 후보). */
    @Test
    @DisplayName("save(C) — DATE 칸에 14자 글자 '20261007123456' 을 넣으면 2026-10-07 12:34:56 으로 저장된다")
    void save_insertDate_14charString() {
        saveInTx(List.of(saveRow("C", "CURR_CD", "D", "BASE_DT", "20261007123456")));

        assertThat(toLocalDateTime(dbRow(1).get("BASE_DT"))).isEqualTo(LocalDateTime.of(2026, 10, 7, 12, 34, 56));
    }

    /** DATE 칸 UPDATE 값 14자 글자 바인드. */
    @Test
    @DisplayName("save(U) — DATE 칸을 14자 글자로 바꾸면 그 날짜로 저장된다")
    void save_updateDate_14charString() {
        fiveRows();

        saveInTx(List.of(saveRow("U", "RULE_SEQ", 1, "BASE_DT", "20271231235959")));

        assertThat(toLocalDateTime(dbRow(1).get("BASE_DT"))).isEqualTo(LocalDateTime.of(2027, 12, 31, 23, 59, 59));
    }

    /** CLOB 칸(COL_TYPE VARCHAR2 로 묶임)의 LIKE — {@code UPPER(MEMO) LIKE UPPER(:v)} 는 Oracle 에서 CLOB 에도 된다. */
    @Test
    @DisplayName("search — CLOB 칸 MEMO LIKE 'MEMO-3%' → seq 3")
    void search_clobLike() {
        fiveRows();

        Map<String, Object> out = searchTx(cond("MEMO", "LIKE", "MEMO-3%"));

        assertThat(seqs(rows(out, "ds_GetMasterRuleData"))).containsExactly(3L);
    }

    /** CLOB 칸 {@code =} 비교 — {@code UPPER(MEMO) = UPPER(:v)} 는 Oracle 에서 ORA-00932(CLOB 비교 불가)로 실패할 수 있다(main 결함 후보). */
    @Test
    @DisplayName("search — CLOB 칸 MEMO = 'memo-3' → seq 3")
    void search_clobEquals() {
        fiveRows();

        Map<String, Object> out = searchTx(cond("MEMO", "=", "memo-3"));

        assertThat(seqs(rows(out, "ds_GetMasterRuleData"))).containsExactly(3L);
    }

    /** CLOB 칸 값 INSERT·조회 — 글자 바인드가 CLOB 에 들어가고 search 응답의 MEMO 값을 글자로 읽을 수 있다. */
    @Test
    @DisplayName("save(C)·search — CLOB 칸 MEMO 에 긴 글(5000자)이 저장되고 응답 MEMO 로 읽힌다")
    void save_and_search_clobValue() {
        String longText = "가".repeat(5000);

        saveInTx(List.of(saveRow("C", "CURR_CD", "L", "MEMO", longText)));

        assertThat(appJdbc.queryForObject("SELECT MEMO FROM " + TABLE + " WHERE RULE_SEQ = 1", String.class)).isEqualTo(longText);
        Object memo = rows(searchTx(req()), "ds_GetMasterRuleData").get(0).get("MEMO");
        assertThat(memo).as("응답 MEMO").isNotNull();
        assertThat(memo).as("응답에 java.sql.Clob 같은 비글자 형이 아니라 글자로 실린다").isInstanceOf(String.class);
        assertThat(memo).as("잘리지 않은 글 전체").isEqualTo(longText);
    }
}
