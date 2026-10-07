package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.metarev.MetaChangeKind;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevisionRecorder;
import com.dongkuk.dmes.mdm.common.metarev.MetaTargetType;
import com.dongkuk.dmes.mdm.common.rule.RuleSetTestCaseWrites;
import com.dongkuk.dmes.mdm.common.rule.RuleSetVersionQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleTestCaseWrites;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionStore;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetWrites;
import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
import com.dongkuk.dmes.mdm.repository.MdmColumnRepository;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/**
 * Oracle 전환 실측(oracle-1007 m3, docs/oracle-1007/memo-ora-mdm.md 「m3 에서 실측할 것」). 단언은 모두 SQLite 때 동작과 같아야 통과한다 —
 * 정렬은 BINARY, boolean 은 0/1 왕복, 4000바이트를 넘는 문자열은 CLOB 칸에 그대로, CLOB LIKE 는 대소문자 무시, 메타 기록은 여러 행 한 문장.
 *
 * <p>데이터는 메서드마다 넣고 메서드 트랜잭션을 되돌린다({@code @Transactional}). 네이티브 쓰기는 호출자 트랜잭션이 있어야 하고, 같은
 * 트랜잭션의 {@link JdbcTemplate} 는 같은 연결이라 방금 쓴 값을 읽는다. 고정 ID 는 다른 시험 픽스처와 겹치지 않게 크게(99xxxx) 둔다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Transactional
class MdmOracleDialectProbeOraTest extends AbstractMdmSharedDbTest {

    private static final Logger log = LoggerFactory.getLogger(MdmOracleDialectProbeOraTest.class);

    private static final BigDecimal V1 = new BigDecimal("1.000");
    private static final String OPEN_RANGE = "TIMESTAMP '2026-01-01 00:00:00', TIMESTAMP '9999-12-31 00:00:00'";

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    EntityManager entityManager;
    @Autowired
    MdmDomainRepository domainRepository;
    @Autowired
    MdmColumnRepository columnRepository;
    @Autowired
    LayoutVersionStore layoutVersionStore;
    @Autowired
    RuleSetWrites ruleSetWrites;
    @Autowired
    RuleTestCaseWrites ruleTestCaseWrites;
    @Autowired
    RuleSetTestCaseWrites ruleSetTestCaseWrites;
    @Autowired
    RuleSetVersionQueries ruleSetVersionQueries;
    @Autowired
    MetaRevisionRecorder metaRevisionRecorder;

    // ── ① 정렬 ──

    @Test
    void 앱_연결의_ORDER_BY_는_BINARY_정렬이다() {
        String nlsSort = jdbc.queryForObject("SELECT SYS_CONTEXT('USERENV', 'NLS_SORT') FROM DUAL", String.class);
        String nlsComp = jdbc.queryForObject("SELECT VALUE FROM NLS_SESSION_PARAMETERS WHERE PARAMETER = 'NLS_COMP'", String.class);
        String nlsLanguage = jdbc.queryForObject("SELECT VALUE FROM NLS_SESSION_PARAMETERS WHERE PARAMETER = 'NLS_LANGUAGE'", String.class);
        log.info("[probe] NLS_SORT={} NLS_COMP={} NLS_LANGUAGE={} JVM Locale={}", nlsSort, nlsComp, nlsLanguage, Locale.getDefault());

        // 바인드 값(VARCHAR2)으로 비교한다 — 문자 리터럴은 CHAR 라 UNION ALL 에서 공백이 붙는다.
        List<String> values = List.of("b", "B", "_x", "a", "A", "Z", "1", "가", "a_", "aB", "ab");
        StringBuilder sql = new StringBuilder("SELECT V FROM (");
        for (int i = 0; i < values.size(); i++) {
            sql.append(i == 0 ? "" : " UNION ALL ").append("SELECT ? V FROM DUAL");
        }
        sql.append(") ORDER BY V");
        List<String> actual = jdbc.queryForList(sql.toString(), String.class, values.toArray());

        // SQLite 기본 BINARY(memcmp) = UTF-8 바이트 순 = 이 값들(BMP)에서 Java String 자연 순서. 'B' < '_' < 'a', 한글은 끝.
        List<String> expected = new ArrayList<>(values);
        expected.sort(null);
        assertEquals(expected, actual, "NLS_SORT=" + nlsSort + " NLS_COMP=" + nlsComp + " — BINARY 가 아니면 Hikari "
                + "connection-init-sql(ALTER SESSION SET NLS_SORT=BINARY)로 맞춘다");
    }

    // ── ② boolean ──

    @Test
    void TB_MDM_COLUMN_REQUIRED_는_엔티티로_true_false_를_왕복하고_DB_에는_1_0_이다() {
        MdmDomain domain = domainRepository.save(new MdmDomain("프로브도메인", "PROBE_REQ_DOMAIN", "TEXT", "STRING"));
        entityManager.flush();

        MdmColumn yes = new MdmColumn("프로브필수", "PROBE_REQ_Y", domain.getDomainId());
        yes.setRequired(true);
        Long yesId = columnRepository.save(yes).getColumnId();
        MdmColumn no = new MdmColumn("프로브선택", "PROBE_REQ_N", domain.getDomainId());
        no.setRequired(false);
        Long noId = columnRepository.save(no).getColumnId();
        entityManager.flush();
        entityManager.clear();

        assertTrue(columnRepository.findById(yesId).orElseThrow().isRequired());
        assertFalse(columnRepository.findById(noId).orElseThrow().isRequired());
        assertEquals(1, jdbc.queryForObject("SELECT REQUIRED FROM TB_MDM_COLUMN WHERE COLUMN_ID = ?", Integer.class, yesId));
        assertEquals(0, jdbc.queryForObject("SELECT REQUIRED FROM TB_MDM_COLUMN WHERE COLUMN_ID = ?", Integer.class, noId));
    }

    // ── ③ 4000바이트를 넘는 문자열 → CLOB 네이티브 UPDATE ──

    @Test
    void LayoutVersionStore_recordConfirm_은_큰_SNAPSHOT_JSON_을_쓴다() {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME) VALUES (990001, 'MESSAGE', '프로브 전문')");
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, STATUS, APPLY_FROM, APPLY_TO) VALUES (990001, ?, 'RELEASED', "
                + OPEN_RANGE + ")", V1);
        for (String json : bigJsonPayloads()) {
            assertEquals(1, layoutVersionStore.recordConfirm(990001L, V1, "SEQUENTIAL", "ITEM", "프로브 요약", json, stamp()));
            assertClob(json, "SELECT SNAPSHOT_JSON FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = 990001");
        }
    }

    @Test
    void RuleSetWrites_updateDraft_는_큰_RULE_IDS_FLOW_JSON_CALL_SET_IDS_를_쓴다() {
        insertRuleSet("PROBE_SET_W");
        jdbc.update("INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, RULE_IDS) VALUES ('PROBE_SET_W', ?, '[]')", V1);
        for (String json : bigJsonPayloads()) {
            assertEquals(1, ruleSetWrites.updateDraft("PROBE_SET_W", V1, json, json, json));
            String where = " FROM TB_MDM_RULE_SET_VER WHERE MARU_RULE_SET_ID = 'PROBE_SET_W'";
            assertClob(json, "SELECT RULE_IDS" + where);
            assertClob(json, "SELECT FLOW_JSON" + where);
            assertClob(json, "SELECT CALL_SET_IDS" + where);
        }
    }

    @Test
    void RuleTestCaseWrites_update_는_큰_INPUT_EXPECTED_JSON_을_쓴다() {
        jdbc.update("INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, SOURCE_KIND) "
                + "VALUES ('PROBE_RULE', '프로브 룰', 'DECISION', 'MDM')");
        jdbc.update("INSERT INTO TB_MDM_RULE_TEST_CASE (MARU_RULE_ID, CASE_ID, INPUT_JSON) VALUES ('PROBE_RULE', 1, '{}')");
        String where = " FROM TB_MDM_RULE_TEST_CASE WHERE MARU_RULE_ID = 'PROBE_RULE' AND CASE_ID = 1";
        for (String json : bigJsonPayloads()) {
            long rowVersion = jdbc.queryForObject("SELECT ROW_VERSION" + where, Long.class);
            assertEquals(1, ruleTestCaseWrites.update("PROBE_RULE", 1, rowVersion, "프로브 케이스", json, json, "설명"));
            assertClob(json, "SELECT INPUT_JSON" + where);
            assertClob(json, "SELECT EXPECTED_JSON" + where);
        }
    }

    @Test
    void RuleSetTestCaseWrites_update_는_큰_INPUT_EXPECTED_JSON_을_쓴다() {
        insertRuleSet("PROBE_SET_C");
        jdbc.update("INSERT INTO TB_MDM_RULE_SET_TEST_CASE (MARU_RULE_SET_ID, CASE_ID, INPUT_JSON) VALUES ('PROBE_SET_C', 1, '{}')");
        String where = " FROM TB_MDM_RULE_SET_TEST_CASE WHERE MARU_RULE_SET_ID = 'PROBE_SET_C' AND CASE_ID = 1";
        for (String json : bigJsonPayloads()) {
            long rowVersion = jdbc.queryForObject("SELECT ROW_VERSION" + where, Long.class);
            assertEquals(1, ruleSetTestCaseWrites.update("PROBE_SET_C", 1, rowVersion, "프로브 케이스", json, "2026-10-07 00:00:00",
                    json, "설명"));
            assertClob(json, "SELECT INPUT_JSON" + where);
            assertClob(json, "SELECT EXPECTED_JSON" + where);
        }
    }

    // ── ④ JPQL UPPER(@Lob) LIKE ──

    @Test
    void RuleSetVersionQueries_mayBeCalled_는_CLOB_CALL_SET_IDS_를_대소문자_무시로_찾는다() {
        insertRuleSet("PROBE_CALLER");
        insertRuleSet("PROBE_CALLER_BIG");
        String releasedVer = "INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, STATUS, APPLY_FROM, APPLY_TO, RULE_IDS, CALL_SET_IDS) "
                + "VALUES (?, ?, 'RELEASED', " + OPEN_RANGE + ", '[]', ?)";
        jdbc.update(releasedVer, "PROBE_CALLER", V1, "[\"Probe_Callee\"]");
        // 4000바이트 뒤에 있는 ID 도 찾는다(CLOB 전체에 LIKE).
        jdbc.update(releasedVer, "PROBE_CALLER_BIG", V1, "[\"" + "x".repeat(5_000) + "\",\"PROBE_FAR\"]");

        assertTrue(ruleSetVersionQueries.mayBeCalled("PROBE_CALLEE"));
        assertTrue(ruleSetVersionQueries.mayBeCalled("probe_callee"));
        assertTrue(ruleSetVersionQueries.mayBeCalled("PROBE_FAR"));
        assertFalse(ruleSetVersionQueries.mayBeCalled("PROBE_NOBODY"));
    }

    // ── ⑤ INSERT … SELECT … FROM DUAL UNION ALL ──

    @Test
    void MetaRevisionRecorder_는_여러_행을_한_문장으로_넣고_REV_SEQ_를_IDENTITY_로_채운다() {
        List<String> keys = List.of("PROBE_A", "PROBE_B", "PROBE_C");
        MetaRevisionRecorder.MetaRevisionRange range = metaRevisionRecorder.force(MetaTargetType.COLUMN, keys, MetaChangeKind.SAVE);

        assertEquals(3, range.count());
        assertEquals(2, range.toSeq() - range.fromSeq(), range.toString());
        Set<String> written = new HashSet<>(jdbc.queryForList("SELECT TARGET_KEY FROM TB_MDM_META_REV WHERE REV_SEQ BETWEEN ? AND ? "
                + "AND TARGET_TYPE = 'COLUMN' AND CHANGE_KIND = 'SAVE'", String.class, range.fromSeq(), range.toSeq()));
        assertEquals(Set.copyOf(keys), written);
    }

    // ── 도우미 ──

    private void insertRuleSet(String setId) {
        jdbc.update("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME) VALUES (?, '프로브 세트')", setId);
    }

    private void assertClob(String expected, String sql) {
        String actual = jdbc.queryForObject(sql, String.class);
        assertEquals(expected.length(), actual == null ? -1 : actual.length(), sql);
        assertEquals(expected, actual, sql);
    }

    private static AuditStamp stamp() {
        return new AuditStamp("probe", "probe", "probe", Instant.now());
    }

    /**
     * 5,000바이트 이상인 유효 JSON 두 벌({@code IS JSON STRICT} 검사를 통과해야 바인딩만 본다) — ASCII(5,000자)와 한글(약 1,700자, 4000자
     * 미만이지만 4000바이트 초과).
     */
    private static List<String> bigJsonPayloads() {
        return List.of(padJson("x", 5_000), padJson("가", 5_000));
    }

    private static String padJson(String unit, int minBytes) {
        String head = "{\"pad\":\"";
        String tail = "\"}";
        int fixed = (head + tail).getBytes(StandardCharsets.UTF_8).length;
        int unitBytes = unit.getBytes(StandardCharsets.UTF_8).length;
        int count = (minBytes - fixed + unitBytes - 1) / unitBytes;
        String json = head + unit.repeat(count) + tail;
        assertTrue(json.getBytes(StandardCharsets.UTF_8).length > 4_000);
        return json;
    }
}
