package com.dongkuk.dmes.mdm.dme.ruleMng;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleMngSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewResult;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleVersionRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleEditService;
import com.dongkuk.dmes.mdm.dme.ruleMng.service.RuleHeaderService;
import com.dongkuk.dmes.mdm.dme.ruleMng.service.RuleVersionService;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleListRow;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleSearchResult;
import com.dongkuk.dmes.mdm.dme.ruleMng.service.RuleMngService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-08-05 design §3.2 「RuleEffectiveStatusTest」(I19·I20·I21) — 룰의 계산 상태(ADR-0002 D6). 미래 apply_from 으로 첫 확정한 룰은 저장
 * CREATED 로 남고, 조회(ruleMng 목록·필터, ruleEdit view)는 계산 상태를 보이며, 쓰기 경로(헤더 저장·폐기·새 버전)는 같은 트랜잭션에서
 * 저장값을 INUSE 로 올린다. 저장값은 늘 JDBC 로 읽어 단언한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleEffectiveStatusTest extends AbstractMdmSharedDbTest {

    private static final String ID = "FUT_JDG";
    private static final LocalDateTime APPLY_FROM = LocalDateTime.of(2026, 7, 1, 0, 0, 0);

    @Autowired
    RuleMngService ruleMngService;
    @Autowired
    RuleEditService ruleEditService;
    @Autowired
    RuleHeaderService headerService;
    @Autowired
    RuleVersionService versionService;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    MutableClock clock;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        clock.setLocal(DmeTestSupport.NOW);
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
        DmeTestSupport.sampleRule(jdbc);
        // 저장 CREATED — v1 을 미래(2026-07-01) apply_from 으로 확정했다(공통 서비스가 저장 상태를 올리지 않은 경우).
        DmeTestSupport.rule(jdbc, ID, "미래 판정", "DECISION", "CREATED");
        DmeTestSupport.released(jdbc, ID, 1, "FIRST", "2026-07-01 00:00:00", null);
        DmeTestSupport.sampleDefinition(jdbc, ID, 1);
        AuditHolder.setAudit(new CactusAudit("kim", "ruleEditMenu", "ruleEdit"));
    }

    @AfterEach
    void reset() {
        AuditHolder.remove();
        clock.setLocal(DmeTestSupport.NOW);
    }

    private String stored() {
        return jdbc.queryForObject("SELECT STATUS FROM TB_MDM_RULE WHERE MARU_RULE_ID = ?", String.class, ID);
    }

    private RuleSearchResult search(String status) {
        RuleSearchRequest r = new RuleSearchRequest();
        r.setStatus(status);
        return ruleMngService.search(r);
    }

    private static List<String> ids(RuleSearchResult r) {
        return r.getList().stream().map(RuleListRow::getMaruRuleId).toList();
    }

    private String listStatus() {
        RuleSearchRequest r = new RuleSearchRequest();
        r.setKeyword(ID);
        List<RuleListRow> rows = ruleMngService.search(r).getList();
        assertEquals(1, rows.size());
        return rows.get(0).getStatus();
    }

    private RuleEditViewResult view() {
        RuleEditViewRequest r = new RuleEditViewRequest();
        r.setMaruRuleId(ID);
        return ruleEditService.view(r);
    }

    /** 헤더 저장 — D-105 로 {@code ruleMng save target HEADER}. 감사 카운터(D-105 (5))를 지금 값으로 채운다. */
    private RuleMngSaveRequest header(String name) {
        RuleMngSaveRequest r = new RuleMngSaveRequest();
        r.setTarget(RuleMngSaveRequest.TARGET_HEADER);
        r.setMaruRuleId(ID);
        r.setMaruRuleName(name);
        // 서버와 같이 null 카운터를 0 으로 본다(requireAuditVer 규칙).
        List<Long> found = jdbc.queryForList("SELECT VER FROM TB_MDM_RULE WHERE MARU_RULE_ID = ?", Long.class, ID);
        r.setAuditVer(found.isEmpty() || found.get(0) == null ? 0L : found.get(0));
        return r;
    }

    private static RuleVersionRequest ruleTarget() {
        RuleVersionRequest r = new RuleVersionRequest();
        r.setMaruRuleId(ID);
        r.setTarget("RULE");
        return r;
    }

    private static String mdm(org.junit.jupiter.api.function.Executable call) {
        BusinessException e = assertThrows(BusinessException.class, call);
        return e.getErrors() == null || e.getErrors().isEmpty() ? e.getErrorCode().name() : e.getErrors().get(0).code();
    }

    // ── EF1 조회는 계산 상태 ──

    @Test
    void EF1_적용_전에는_CREATED_적용_시각부터_INUSE_로_보이고_저장값은_그대로다() {
        assertEquals("CREATED", listStatus());
        assertEquals("CREATED", view().getRule().getStatus());

        clock.setLocal(APPLY_FROM); // 경계: applyFrom == now 는 적용된 것이다(I18)
        assertEquals("INUSE", listStatus());
        assertEquals("INUSE", view().getRule().getStatus());
        assertEquals("CREATED", stored(), "조회는 저장값을 바꾸지 않는다");
    }

    // ── EF2 상태 필터 = 표시와 같은 계산 상태(I19) ──

    @Test
    void EF2_적용_시각부터_INUSE_필터에_나오고_CREATED_필터에서_빠진다() {
        clock.setLocal(APPLY_FROM);
        RuleSearchResult inuse = search("INUSE");
        assertTrue(ids(inuse).contains(ID));
        assertTrue(ids(inuse).contains("QLTY_GRD_JDG"), "저장 INUSE 룰도 INUSE 필터에 남는다");
        assertEquals(inuse.getList().size(), inuse.getTotalCount(), "건수 쿼리도 같은 조건이다");
        RuleSearchResult created = search("CREATED");
        assertFalse(ids(created).contains(ID));
        assertEquals(created.getList().size(), created.getTotalCount());
    }

    @Test
    void EF2_적용_1초_전에는_CREATED_필터에_나오고_INUSE_필터에서_빠진다() {
        clock.setLocal(APPLY_FROM.minusSeconds(1));
        RuleSearchResult created = search("CREATED");
        assertEquals(List.of(ID), ids(created));
        assertEquals(1, created.getTotalCount());
        RuleSearchResult inuse = search("INUSE");
        assertEquals(List.of("QLTY_GRD_JDG"), ids(inuse));
        assertEquals(1, inuse.getTotalCount());
        assertEquals("CREATED", listStatus(), "필터와 표시가 어긋나지 않는다");
    }

    @Test
    void EF2_DEPRECATED_필터는_저장값이다() {
        jdbc.update("UPDATE TB_MDM_RULE SET STATUS = 'DEPRECATED' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG'");
        clock.setLocal(APPLY_FROM);
        assertEquals(List.of("QLTY_GRD_JDG"), ids(search("DEPRECATED")));
        assertEquals(List.of(ID), ids(search("INUSE")));
    }

    // ── EF3 폐기는 계산 상태 INUSE 기준(I20) ──

    @Test
    void EF3_저장_CREATED_계산_INUSE_인_룰을_폐기하면_DEPRECATED_다() {
        clock.setLocal(APPLY_FROM.plusDays(1));
        headerService.deprecate(ruleTarget());
        assertEquals("DEPRECATED", stored());
    }

    @Test
    void EF3_계산_상태가_CREATED_면_폐기하지_않는다() {
        assertEquals("MDM009", mdm(() -> headerService.deprecate(ruleTarget())));
        assertEquals("CREATED", stored());
    }

    // ── EF4 쓰기 경로 승격(I20) ──

    @Test
    void EF4_헤더_저장은_계산_INUSE_인_룰의_저장값을_INUSE_로_올린다() {
        clock.setLocal(APPLY_FROM.plusDays(1));
        headerService.saveHeader(header("미래 판정 바꿈"));
        assertEquals("INUSE", stored());
        assertEquals("미래 판정 바꿈", jdbc.queryForObject("SELECT MARU_RULE_NAME FROM TB_MDM_RULE WHERE MARU_RULE_ID = ?", String.class, ID));
    }

    @Test
    void EF4_새_버전은_계산_INUSE_인_룰의_저장값을_INUSE_로_올린다() {
        clock.setLocal(APPLY_FROM.plusDays(1));
        RuleVersionRequest r = new RuleVersionRequest();
        r.setMaruRuleId(ID);
        assertEquals("2.000", versionService.newVersion(r).getVer());
        assertEquals("INUSE", stored());
    }

    @Test
    void EF4_계산_상태가_CREATED_면_헤더_저장_뒤에도_CREATED_다() {
        headerService.saveHeader(header("적용 전 바꿈"));
        assertEquals("CREATED", stored());
        assertEquals("CREATED", view().getRule().getStatus());
    }

    // ── EF5 ──

    @Test
    void EF5_확정_화면이_준비되었다() {
        assertTrue(view().isConfirmScreenReady());
    }
}
