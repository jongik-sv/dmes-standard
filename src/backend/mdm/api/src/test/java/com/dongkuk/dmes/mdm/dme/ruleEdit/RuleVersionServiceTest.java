package com.dongkuk.dmes.mdm.dme.ruleEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STD_ADMIN;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.count;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.rowVersion;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.FakeStewardDirectory;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleVersionRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleVersionResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleVersionService;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-08-02 design §3.1 「RuleVersionServiceTest」 — 카드 ② 버전: 새 버전(I4 미적용 거부·I5 직전 RELEASED 전수 복사), DRAFT 삭제
 * (실물 훅 경유 CASCADE, I26), 선점·해제·넘기기(I6 공통 서비스, I7 비소유자 MDM003). 현재 시각은 2026-06-15 09:00 KST.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleVersionServiceTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleVersionService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    FakeStewardDirectory stewards;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
        stewards.set(Set.of("kim", "lee"));
        DmeTestSupport.sampleRule(jdbc);
    }

    static RuleVersionRequest req(String id, Integer ver, Long rowVersion) {
        RuleVersionRequest r = new RuleVersionRequest();
        r.setMaruRuleId(id);
        r.setVer(ver);
        r.setRowVersion(rowVersion);
        return r;
    }

    static String mdm(Executable call) {
        BusinessException e = assertThrows(BusinessException.class, call);
        return e.getErrors() == null || e.getErrors().isEmpty() ? e.getErrorCode().name() : e.getErrors().get(0).code();
    }

    // ── 새 버전(copy) ──

    @Test
    void 새_버전은_직전_RELEASED_의_변수와_행을_칼럼_전부_복사하고_번호를_유지한다() {
        // 칼럼 전수 비교를 위해 VAR·ROW 의 선택 칼럼을 모두 채운 행을 하나씩 더한다.
        jdbc.update("INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, AXIS, VAR_NAME, VAR_AST, DOMAIN_ID, DATA_TYPE, "
                + "COLLECT_AGG, PRIO_LIST, RES_GRP, GRP_COND, GRP_COND_AST, SEQ, LABEL, DESCRIPTION) VALUES ('QLTY_GRD_JDG', 1, 9, 'RESULT', "
                + "'Expression', 'COL', 'SPD', '{\"type\":\"VARIABLE_OR_CONSTANT\",\"value\":\"A\"}', "
                + "(SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'COIL_THK_D'), 'NUMBER', 'SUM', '[\"A\",\"B\"]', 'GRP', 'A == 1', "
                + "'{\"type\":\"INFIX_OPERATOR\"}', 3, '속도', '설명9')");
        jdbc.update("INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS, NOTE, TAG) VALUES ('QLTY_GRD_JDG', 1, 7, 4, "
                + "'NORMAL', '{\"1\":{\"op\":\"NA\"}}', '행 설명', 'T1')");

        RuleVersionResult r = service.newVersion(req("QLTY_GRD_JDG", null, null));

        assertEquals(new RuleVersionResultView("QLTY_GRD_JDG", 2, 0L), view(r));
        Map<String, Object> ver = jdbc.queryForMap("SELECT * FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2");
        assertEquals("DRAFT", ver.get("STATUS"));
        assertEquals("kim", ver.get("OWNER_ID"));
        assertEquals(1, ((Number) ver.get("BASE_VER")).intValue());
        assertEquals("FIRST", ver.get("HIT_POLICY"));
        assertEquals(0, ((Number) ver.get("ROW_VERSION")).intValue());
        assertEquals(business("TB_MDM_RULE_VAR", 1), business("TB_MDM_RULE_VAR", 2));
        assertEquals(business("TB_MDM_RULE_ROW", 1), business("TB_MDM_RULE_ROW", 2));
        assertEquals(6, business("TB_MDM_RULE_VAR", 2).size());
        assertEquals(5, business("TB_MDM_RULE_ROW", 2).size());
        assertEquals(5, ((Number) jdbc.queryForObject("SELECT LAST_VAR_ID FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'QLTY_GRD_JDG'", Integer.class))
                .intValue(), "복사는 번호를 발급하지 않는다");
    }

    /** 업무 칼럼 전부(VER·감사 칼럼만 뺀다)를 식별자 순으로. */
    private List<Map<String, Object>> business(String table, int ver) {
        String key = table.equals("TB_MDM_RULE_VAR") ? "VAR_ID" : "ROW_ID";
        return jdbc.queryForList("SELECT * FROM " + table + " WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = ? ORDER BY " + key, ver).stream()
                .map(m -> {
                    Map<String, Object> t = new TreeMap<>(m);
                    List.of("VER", "AUD_VER", "C_USR_ID", "C_AT", "C_SVC_ID", "C_PGM_ID", "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID")
                            .forEach(t::remove);
                    return (Map<String, Object>) t;
                }).toList();
    }

    @Test
    void 새_버전_번호는_모든_버전의_최대값_더하기_1이고_원본은_RELEASED_중_최대다() {
        DmeTestSupport.released(jdbc, "QLTY_GRD_JDG", 2, "UNIQUE", "2026-02-01 00:00:00", null);
        jdbc.update("UPDATE TB_MDM_RULE_VER SET APPLY_TO = '2026-02-01 00:00:00' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 1");
        DmeTestSupport.sampleDefinition(jdbc, "QLTY_GRD_JDG", 2);
        jdbc.update("INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, APPLY_FROM, APPLY_TO) VALUES ('QLTY_GRD_JDG', 3, 'CANCELLED', "
                + "'2026-03-01 00:00:00', '9999-12-31 00:00:00')");

        RuleVersionResult r = service.newVersion(req("QLTY_GRD_JDG", null, null));

        assertEquals(4, r.getVer());
        Map<String, Object> ver = jdbc.queryForMap("SELECT * FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 4");
        assertEquals(2, ((Number) ver.get("BASE_VER")).intValue());
        assertEquals("UNIQUE", ver.get("HIT_POLICY"));
    }

    @Test
    void 번호에_빈_곳이_있어도_새_번호는_최대값_더하기_1이다() {
        jdbc.update("INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, APPLY_FROM, APPLY_TO) VALUES ('QLTY_GRD_JDG', 5, 'CANCELLED', "
                + "'2026-03-01 00:00:00', '9999-12-31 00:00:00')");
        assertEquals(6, service.newVersion(req("QLTY_GRD_JDG", null, null)).getVer());
    }

    @Test
    void 미적용_버전이_있으면_MDM006_이다_DRAFT() {
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", "lee", "FIRST", 1);
        assertEquals("MDM006", mdm(() -> service.newVersion(req("QLTY_GRD_JDG", null, null))));
    }

    @Test
    void 미적용_버전이_있으면_MDM006_이다_REQUESTED() {
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "REQUESTED", null, "FIRST", 1);
        assertEquals("MDM006", mdm(() -> service.newVersion(req("QLTY_GRD_JDG", null, null))));
    }

    @Test
    void 미적용_버전이_있으면_MDM006_이다_APPROVED() {
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "APPROVED", null, "FIRST", 1);
        assertEquals("MDM006", mdm(() -> service.newVersion(req("QLTY_GRD_JDG", null, null))));
    }

    @Test
    void 미적용_버전이_있으면_MDM006_이다_적용_전_RELEASED() {
        DmeTestSupport.released(jdbc, "QLTY_GRD_JDG", 2, "FIRST", "2026-07-01 00:00:00", null);
        assertEquals("MDM006", mdm(() -> service.newVersion(req("QLTY_GRD_JDG", null, null))));
        assertEquals(0, count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 3"));
    }

    @Test
    void 폐기한_룰과_외부_원천_룰은_새_버전을_거부한다() {
        jdbc.update("UPDATE TB_MDM_RULE SET STATUS = 'DEPRECATED' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG'");
        assertEquals("MDM009", mdm(() -> service.newVersion(req("QLTY_GRD_JDG", null, null))));
        DmeTestSupport.externalRule(jdbc, "EXT_JDG", "외부");
        DmeTestSupport.released(jdbc, "EXT_JDG", 1, "FIRST", "2026-01-01 00:00:00", null);
        assertEquals("BUSINESS_ERROR", mdm(() -> service.newVersion(req("EXT_JDG", null, null))));
        assertEquals(1, count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'EXT_JDG'"));
    }

    @Test
    void 버전이_하나도_없으면_빈_VER_1_을_만든다() {
        DmeTestSupport.rule(jdbc, "EMPTY_CALC", "빈 산출", "DERIVE", "CREATED");
        RuleVersionResult r = service.newVersion(req("EMPTY_CALC", null, null));
        assertEquals(1, r.getVer());
        Map<String, Object> ver = jdbc.queryForMap("SELECT * FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'EMPTY_CALC'");
        assertEquals("DRAFT", ver.get("STATUS"));
        assertEquals("kim", ver.get("OWNER_ID"));
        assertNull(ver.get("BASE_VER"));
        assertNull(ver.get("HIT_POLICY"));
        assertEquals(0, count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'EMPTY_CALC'"));
    }

    @Test
    void RELEASED_가_없는데_다른_버전이_있으면_거부한다() {
        DmeTestSupport.rule(jdbc, "CANCEL_JDG", "취소만", "DECISION", "CREATED");
        jdbc.update("INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, APPLY_FROM, APPLY_TO) VALUES ('CANCEL_JDG', 1, 'CANCELLED', "
                + "'2026-03-01 00:00:00', '9999-12-31 00:00:00')");
        assertEquals("BUSINESS_ERROR", mdm(() -> service.newVersion(req("CANCEL_JDG", null, null))));
    }

    @Test
    void 새_버전은_담당자만_만든다() {
        currentUser.set("stdadmin", STD_ADMIN);
        assertEquals("MDM013", mdm(() -> service.newVersion(req("QLTY_GRD_JDG", null, null))));
    }

    @Test
    void 없는_룰은_INVALID_VALUE_다() {
        assertEquals("INVALID_VALUE", mdm(() -> service.newVersion(req("NO_SUCH", null, null))));
    }

    // ── DRAFT 삭제 ──

    @Test
    void DRAFT_삭제는_실물_훅을_지나_변수와_행을_CASCADE_로_지운다() {
        RuleVersionResult created = service.newVersion(req("QLTY_GRD_JDG", null, null));
        assertEquals(5, count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2"));

        service.deleteDraft(req("QLTY_GRD_JDG", created.getVer(), created.getRowVersion()));

        assertEquals(0, count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2"));
        assertEquals(0, count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2"));
        assertEquals(0, count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2"));
        assertEquals(5, count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 1"));
    }

    @Test
    void 비소유자의_DRAFT_삭제는_MDM003_이다() {
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", "lee", "FIRST", 1);
        assertEquals("MDM003", mdm(() -> service.deleteDraft(req("QLTY_GRD_JDG", 2, 0L))));
        assertEquals(1, count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2"));
    }

    // ── 선점·해제·넘기기 ──

    @Test
    void 해제와_선점은_row_version_을_올린다() {
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", "kim", "FIRST", 1);
        RuleVersionResult released = service.unlock(req("QLTY_GRD_JDG", 2, 0L));
        assertEquals(1L, released.getRowVersion());
        assertNull(jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2", String.class));

        currentUser.set("lee", STEWARD);
        RuleVersionResult locked = service.lock(req("QLTY_GRD_JDG", 2, 1L));
        assertEquals(2L, locked.getRowVersion());
        assertEquals("lee", jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2", String.class));
        assertEquals(2L, rowVersion(jdbc, "QLTY_GRD_JDG", 2));
    }

    @Test
    void 선점은_담당자만_하고_이미_소유자가_있으면_MDM004_다() {
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", "lee", "FIRST", 1);
        assertEquals("MDM004", mdm(() -> service.lock(req("QLTY_GRD_JDG", 2, 0L))));
        jdbc.update("UPDATE TB_MDM_RULE_VER SET OWNER_ID = NULL WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2");
        currentUser.set("stdadmin", STD_ADMIN);
        assertEquals("MDM013", mdm(() -> service.lock(req("QLTY_GRD_JDG", 2, 0L))));
    }

    @Test
    void 비소유자의_해제와_넘기기는_MDM003_이다() {
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", "lee", "FIRST", 1);
        assertEquals("MDM003", mdm(() -> service.unlock(req("QLTY_GRD_JDG", 2, 0L))));
        RuleVersionRequest h = req("QLTY_GRD_JDG", 2, 0L);
        h.setNewOwnerId("kim");
        assertEquals("MDM003", mdm(() -> service.handover(h)));
        assertEquals(0L, rowVersion(jdbc, "QLTY_GRD_JDG", 2));
    }

    @Test
    void 넘기기는_대상이_담당자여야_한다() {
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", "kim", "FIRST", 1);
        RuleVersionRequest h = req("QLTY_GRD_JDG", 2, 0L);
        h.setNewOwnerId("park");
        assertEquals("MDM005", mdm(() -> service.handover(h)));
        h.setNewOwnerId("lee");
        RuleVersionResult r = service.handover(h);
        assertEquals(1L, r.getRowVersion());
        assertEquals("lee", jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2", String.class));
    }

    @Test
    void row_version_이_다르면_MDM001_이다() {
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", "kim", "FIRST", 1);
        assertEquals("MDM001", mdm(() -> service.unlock(req("QLTY_GRD_JDG", 2, 5L))));
        assertEquals("MDM001", mdm(() -> service.deleteDraft(req("QLTY_GRD_JDG", 2, 5L))));
    }

    @Test
    void 외부_원천_룰은_선점_삭제를_거부한다() {
        DmeTestSupport.externalRule(jdbc, "EXT_JDG", "외부");
        DmeTestSupport.pending(jdbc, "EXT_JDG", 1, "DRAFT", null, "FIRST", null);
        assertEquals("BUSINESS_ERROR", mdm(() -> service.lock(req("EXT_JDG", 1, 0L))));
        assertEquals(0L, rowVersion(jdbc, "EXT_JDG", 1));
        assertTrue(count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'EXT_JDG'") == 1);
    }

    record RuleVersionResultView(String maruRuleId, Integer ver, Long rowVersion) {}

    private static RuleVersionResultView view(RuleVersionResult r) {
        return new RuleVersionResultView(r.getMaruRuleId(), r.getVer(), r.getRowVersion());
    }
}
