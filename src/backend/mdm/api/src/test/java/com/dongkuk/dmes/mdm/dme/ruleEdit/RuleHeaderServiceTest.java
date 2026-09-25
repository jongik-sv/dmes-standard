package com.dongkuk.dmes.mdm.dme.ruleEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STD_ADMIN;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleVersionRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleHeaderService;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleVersionService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-08-02 design §3.1 「RuleHeaderServiceTest」 — 카드 ① 헤더 저장(D6: 미적용 버전에 소유자가 있으면 그 소유자만, 없으면 담당자)과
 * 폐기(I9: 원천 MDM·INUSE·미적용 버전 없음, 네이티브 UPDATE 감사 칼럼 포함, 폐기 뒤 새 버전 거부).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleHeaderServiceTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleHeaderService service;
    @Autowired
    RuleVersionService versions;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
        DmeTestSupport.sampleRule(jdbc);
        AuditHolder.setAudit(new CactusAudit("kim", "ruleEditMenu", "ruleEdit"));
    }

    @AfterEach
    void clearAudit() {
        AuditHolder.remove();
    }

    static RuleEditSaveRequest header(String id, String name) {
        RuleEditSaveRequest r = new RuleEditSaveRequest();
        r.setPart("HEADER");
        r.setMaruRuleId(id);
        r.setMaruRuleName(name);
        r.setDescription("새 설명");
        r.setUsageNote("새 메모");
        return r;
    }

    static RuleVersionRequest ruleTarget(String id) {
        RuleVersionRequest r = new RuleVersionRequest();
        r.setMaruRuleId(id);
        r.setTarget("RULE");
        return r;
    }

    static String mdm(Executable call) {
        BusinessException e = assertThrows(BusinessException.class, call);
        return e.getErrors() == null || e.getErrors().isEmpty() ? e.getErrorCode().name() : e.getErrors().get(0).code();
    }

    private Map<String, Object> rule(String id) {
        return jdbc.queryForMap("SELECT * FROM TB_MDM_RULE WHERE MARU_RULE_ID = ?", id);
    }

    // ── 헤더 저장(D6) ──

    @Test
    void 미적용_버전이_없으면_담당자가_헤더를_바로_저장한다() {
        RuleEditSaveResult r = service.save(header("QLTY_GRD_JDG", "품질 등급 판정 E2E"));
        assertEquals("HEADER", r.getPart());
        Map<String, Object> row = rule("QLTY_GRD_JDG");
        assertEquals("품질 등급 판정 E2E", row.get("MARU_RULE_NAME"));
        assertEquals("새 설명", row.get("DESCRIPTION"));
        assertEquals("새 메모", row.get("USAGE_NOTE"));
    }

    @Test
    void 미적용_버전이_없을_때_담당자가_아니면_MDM013_이다() {
        currentUser.set("stdadmin", STD_ADMIN);
        assertEquals("MDM013", mdm(() -> service.save(header("QLTY_GRD_JDG", "바꿈"))));
        assertEquals("품질 등급 판정", rule("QLTY_GRD_JDG").get("MARU_RULE_NAME"));
    }

    @Test
    void 미적용_버전에_소유자가_있으면_그_소유자만_저장한다() {
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", "lee", "FIRST", 1);
        assertEquals("MDM003", mdm(() -> service.save(header("QLTY_GRD_JDG", "김이 바꿈"))));
        assertEquals("품질 등급 판정", rule("QLTY_GRD_JDG").get("MARU_RULE_NAME"));
        currentUser.set("lee", STEWARD);
        service.save(header("QLTY_GRD_JDG", "이가 바꿈"));
        assertEquals("이가 바꿈", rule("QLTY_GRD_JDG").get("MARU_RULE_NAME"));
    }

    @Test
    void 미적용_버전의_소유자가_비었으면_담당자가_저장한다() {
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", null, "FIRST", 1);
        service.save(header("QLTY_GRD_JDG", "비선점 중 바꿈"));
        assertEquals("비선점 중 바꿈", rule("QLTY_GRD_JDG").get("MARU_RULE_NAME"));
    }

    @Test
    void 외부_원천_룰의_헤더는_거부한다() {
        DmeTestSupport.externalRule(jdbc, "EXT_JDG", "외부");
        assertEquals("BUSINESS_ERROR", mdm(() -> service.save(header("EXT_JDG", "바꿈"))));
        assertEquals("외부", rule("EXT_JDG").get("MARU_RULE_NAME"));
    }

    @Test
    void 룰명은_필수이고_100자_이하다() {
        assertEquals("REQUIRED_VALUE", mdm(() -> service.save(header("QLTY_GRD_JDG", " "))));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(header("QLTY_GRD_JDG", "가".repeat(101)))));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(header("NO_SUCH", "이름"))));
    }

    // ── 폐기(I9) ──

    @Test
    void 폐기는_INUSE_를_DEPRECATED_로_바꾸고_감사_칼럼과_카운터를_쓴다() {
        jdbc.update("UPDATE TB_MDM_RULE SET VER = 3 WHERE MARU_RULE_ID = 'QLTY_GRD_JDG'");
        service.deprecate(ruleTarget("QLTY_GRD_JDG"));
        Map<String, Object> row = rule("QLTY_GRD_JDG");
        assertEquals("DEPRECATED", row.get("STATUS"));
        assertEquals("kim", row.get("U_USR_ID"));
        assertEquals("ruleEdit", row.get("U_SVC_ID"));
        assertEquals(4, ((Number) row.get("VER")).intValue());
    }

    @Test
    void 미적용_버전이_있으면_폐기하지_않는다() {
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", null, "FIRST", 1);
        assertEquals("MDM006", mdm(() -> service.deprecate(ruleTarget("QLTY_GRD_JDG"))));
        assertEquals("INUSE", rule("QLTY_GRD_JDG").get("STATUS"));
    }

    @Test
    void 결재_중_버전이_있어도_폐기하지_않는다() {
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "REQUESTED", null, "FIRST", 1);
        assertEquals("MDM006", mdm(() -> service.deprecate(ruleTarget("QLTY_GRD_JDG"))));
        assertEquals("INUSE", rule("QLTY_GRD_JDG").get("STATUS"));
    }

    @Test
    void INUSE_가_아니면_폐기하지_않는다() {
        DmeTestSupport.rule(jdbc, "NEW_JDG", "신규", "DECISION", "CREATED");
        assertEquals("MDM009", mdm(() -> service.deprecate(ruleTarget("NEW_JDG"))));
        assertEquals("CREATED", rule("NEW_JDG").get("STATUS"));
    }

    @Test
    void 폐기는_담당자만_하고_외부_원천은_거부한다() {
        currentUser.set("stdadmin", STD_ADMIN);
        assertEquals("MDM013", mdm(() -> service.deprecate(ruleTarget("QLTY_GRD_JDG"))));
        currentUser.set("kim", STEWARD);
        DmeTestSupport.externalRule(jdbc, "EXT_JDG", "외부");
        assertEquals("BUSINESS_ERROR", mdm(() -> service.deprecate(ruleTarget("EXT_JDG"))));
        assertEquals("INUSE", rule("EXT_JDG").get("STATUS"));
    }

    @Test
    void 폐기한_룰은_새_버전을_거부한다() {
        service.deprecate(ruleTarget("QLTY_GRD_JDG"));
        RuleVersionRequest copy = new RuleVersionRequest();
        copy.setMaruRuleId("QLTY_GRD_JDG");
        assertEquals("MDM009", mdm(() -> versions.newVersion(copy)));
    }
}
