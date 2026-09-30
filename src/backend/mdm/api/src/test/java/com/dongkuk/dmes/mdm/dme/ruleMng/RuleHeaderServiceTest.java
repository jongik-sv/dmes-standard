package com.dongkuk.dmes.mdm.dme.ruleMng;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STD_ADMIN;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleMngSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleMngSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleVersionRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.service.RuleHeaderService;
import com.dongkuk.dmes.mdm.dme.ruleMng.service.RuleVersionService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.util.List;
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

    /**
     * 헤더 저장 요청 — D-105 로 {@code ruleMng save target HEADER} 다. {@code auditVer}(TB_MDM_RULE.VER 감사 카운터)를
     * 지금 값으로 채운다. 화면이 읽어 둔 값을 되돌려 보내는 것과 같다.
     */
    static RuleMngSaveRequest header(JdbcTemplate jdbc, String id, String name) {
        RuleMngSaveRequest r = new RuleMngSaveRequest();
        r.setTarget(RuleMngSaveRequest.TARGET_HEADER);
        r.setMaruRuleId(id);
        r.setMaruRuleName(name);
        r.setDescription("새 설명");
        r.setUsageNote("새 메모");
        r.setAuditVer(auditVer(jdbc, id));
        return r;
    }

    /**
     * TB_MDM_RULE.VER 감사 카운터 — 서버와 같이 null 을 0 으로 본다({@code requireAuditVer} 의 규칙과 같은 자리).
     * 카운터가 아직 없는 행이 있어도 첫 저장은 되어야 한다.
     */
    private static Long auditVer(JdbcTemplate jdbc, String id) {
        List<Long> found = jdbc.queryForList("SELECT VER FROM TB_MDM_RULE WHERE MARU_RULE_ID = ?", Long.class, id);
        return found.isEmpty() || found.get(0) == null ? 0L : found.get(0);
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
        RuleMngSaveResult r = service.saveHeader(header(jdbc, "QLTY_GRD_JDG", "품질 등급 판정 E2E"));
        assertEquals(RuleMngSaveRequest.TARGET_HEADER, r.getTarget());
        Map<String, Object> row = rule("QLTY_GRD_JDG");
        assertEquals("품질 등급 판정 E2E", row.get("MARU_RULE_NAME"));
        assertEquals("새 설명", row.get("DESCRIPTION"));
        assertEquals("새 메모", row.get("USAGE_NOTE"));
    }

    @Test
    void 미적용_버전이_없을_때_담당자가_아니면_MDM013_이다() {
        currentUser.set("stdadmin", STD_ADMIN);
        assertEquals("MDM013", mdm(() -> service.saveHeader(header(jdbc, "QLTY_GRD_JDG", "바꿈"))));
        assertEquals("품질 등급 판정", rule("QLTY_GRD_JDG").get("MARU_RULE_NAME"));
    }

    @Test
    void 미적용_버전에_소유자가_있으면_그_소유자만_저장한다() {
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", "lee", "FIRST", 1);
        assertEquals("MDM003", mdm(() -> service.saveHeader(header(jdbc, "QLTY_GRD_JDG", "김이 바꿈"))));
        assertEquals("품질 등급 판정", rule("QLTY_GRD_JDG").get("MARU_RULE_NAME"));
        currentUser.set("lee", STEWARD);
        service.saveHeader(header(jdbc, "QLTY_GRD_JDG", "이가 바꿈"));
        assertEquals("이가 바꿈", rule("QLTY_GRD_JDG").get("MARU_RULE_NAME"));
    }

    @Test
    void 미적용_버전의_소유자가_비었으면_담당자가_저장한다() {
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", null, "FIRST", 1);
        service.saveHeader(header(jdbc, "QLTY_GRD_JDG", "비선점 중 바꿈"));
        assertEquals("비선점 중 바꿈", rule("QLTY_GRD_JDG").get("MARU_RULE_NAME"));
    }

    @Test
    void 외부_원천_룰의_헤더는_거부한다() {
        DmeTestSupport.externalRule(jdbc, "EXT_JDG", "외부");
        assertEquals("BUSINESS_ERROR", mdm(() -> service.saveHeader(header(jdbc, "EXT_JDG", "바꿈"))));
        assertEquals("외부", rule("EXT_JDG").get("MARU_RULE_NAME"));
    }

    @Test
    void 룰명은_필수이고_100자_이하다() {
        assertEquals("REQUIRED_VALUE", mdm(() -> service.saveHeader(header(jdbc, "QLTY_GRD_JDG", " "))));
        assertEquals("INVALID_VALUE", mdm(() -> service.saveHeader(header(jdbc, "QLTY_GRD_JDG", "가".repeat(101)))));
        assertEquals("INVALID_VALUE", mdm(() -> service.saveHeader(header(jdbc, "NO_SUCH", "이름"))));
    }

    // ── 낙관적 잠금(D-105 (5)) ──
    // 원래는 TB_MDM_RULE 에 ROW_VERSION 이 없어 "마지막 저장이 이긴다"(06:913)였다. D-105 로 감사 카운터 VER 를 잠금에 쓴다
    // (CodeEditService.requireAuditVer I19 와 같은 방식, DDL 없음). 아래는 그 계약이 지켜지는지 본다.
    // 주의 — 카운터는 값이 바뀔 때만 오른다(Hibernate dirty checking). 같은 값을 다시 저장하면 UPDATE 가 없어 카운터도
    // 그대로다. 그래서 동시성 시험은 반드시 "서로 다른 값을 두 사람이 들고 있는 상황"으로 해야 한다.

    @Test
    void 헤더_저장은_auditVer_가_어긋나면_MDM001_이다() {
        // 두 사람이 화면을 동시에 열어 같은 auditVer 를 들고 있다.
        RuleMngSaveRequest mine = header(jdbc, "QLTY_GRD_JDG", "김이 바꿈");
        RuleMngSaveRequest theirs = header(jdbc, "QLTY_GRD_JDG", "이도 바꾸려던 것");
        assertEquals(mine.getAuditVer(), theirs.getAuditVer(), "둘 다 같은 시점의 카운터를 읽었다");

        service.saveHeader(mine);
        assertEquals("김이 바꿈", rule("QLTY_GRD_JDG").get("MARU_RULE_NAME"));
        assertEquals(1, ((Number) auditVer(jdbc, "QLTY_GRD_JDG")).intValue(), "값이 바뀌면 카운터가 오른다");

        // 상대는 옛 카운터를 들고 있다 — 덮어쓰지 못한다.
        assertEquals("MDM001", mdm(() -> service.saveHeader(theirs)));
        assertEquals("김이 바꿈", rule("QLTY_GRD_JDG").get("MARU_RULE_NAME"), "거부된 저장은 이름을 바꾸지 않는다");

        // 새로 읽은 값으로는 저장된다.
        service.saveHeader(header(jdbc, "QLTY_GRD_JDG", "이도가 다시 바꿈"));
        assertEquals("이도가 다시 바꿈", rule("QLTY_GRD_JDG").get("MARU_RULE_NAME"));
    }

    @Test
    void 같은_값을_다시_저장해도_쓰지_않는다() {
        // 카운터가 오르지 않는 이유를 못 박아 둔다 — "마지막 저장이 이긴다"가 아니라 "저장할 것이 없으면 저장이 없다"다.
        RuleMngSaveRequest first = header(jdbc, "QLTY_GRD_JDG", "김이 바꿈");
        service.saveHeader(first);
        long after = auditVer(jdbc, "QLTY_GRD_JDG");
        service.saveHeader(header(jdbc, "QLTY_GRD_JDG", "김이 바꿈"));
        assertEquals(after, auditVer(jdbc, "QLTY_GRD_JDG"), "값이 같으면 UPDATE 가 없어 카운터도 그대로다");
    }

    @Test
    void auditVer_가_비면_MDM001_이다() {
        RuleMngSaveRequest r = header(jdbc, "QLTY_GRD_JDG", "이름");
        r.setAuditVer(null);
        assertEquals("MDM001", mdm(() -> service.saveHeader(r)));
        assertEquals("품질 등급 판정", rule("QLTY_GRD_JDG").get("MARU_RULE_NAME"));
    }

    @Test
    void 헤더_저장_응답은_새_auditVer_를_돌려준다() {
        RuleMngSaveResult r = service.saveHeader(header(jdbc, "QLTY_GRD_JDG", "이름"));
        assertEquals(auditVer(jdbc, "QLTY_GRD_JDG"), r.getAuditVer(), "저장 뒤 감사 카운터를 돌려줘야 화면이 이어서 저장한다");
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
