package com.dongkuk.dmes.mdm.contract.version;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dmc.codeConfirm.dto.CodeConfirmRequest;
import com.dongkuk.dmes.mdm.dmc.codeConfirm.service.CodeConfirmService;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.ruleConfirm.dto.RuleConfirmRequest;
import com.dongkuk.dmes.mdm.dme.ruleConfirm.service.RuleConfirmService;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-09-03 design.md §3 B2(§0.2 조사) — dmc({@code CodeConfirmService})·dme({@code RuleConfirmService})가 같은 공용
 * {@code VersionStateService}/{@code VersionWriteGuard}/{@code DraftOwnershipService}(mdm/lib/contract/version, 실제 판정은
 * {@code DefaultVersionStateService}→{@code VersionPreconditions.requireOwner}·{@code MdmStewardGuard.requireSteward}
 * 한 곳)로 DRAFT 확정을 판정한다는 교차 사실을 한 시험에서 나란히 확인한다. 새 판정 로직은 만들지 않고 기존
 * {@code CodeConfirmService.confirm}·{@code RuleConfirmService.confirm}을 그대로 호출한다(불변 규칙 — dmc·dme는 같은
 * 공용 서비스로 판정한다).
 *
 * <p>{@code domainMng}(dma)·{@code dataItemMng}(dmd)는 대상에서 뺀다 — {@code TB_MDM_DOMAIN}·{@code TB_MDM_DATA_ITEM}에
 * {@code OWNER_ID}/{@code STATUS} 컬럼이 없어 DRAFT 소유권 개념 자체가 없다({@link #domainMng_dataItemMng_스키마에는_DRAFT_소유권_컬럼이_없다()}가
 * 그 사실을 고정한다 — 지어내지 않는다).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class DraftOwnershipCrossModuleTest extends AbstractMdmSharedDbTest {

    private static final String CODE_ID = "DFT_CODE";
    private static final String RULE_ID = "DFT_RULE";
    private static final String OWNER = "kim";
    private static final String NON_OWNER = "lee";
    private static final String NO_STEWARD_ROLE_USER = "park";

    @Autowired
    CodeConfirmService codeConfirmService;
    @Autowired
    RuleConfirmService ruleConfirmService;
    @Autowired
    DmeTestSupport.MutableCurrentUser currentUser;
    @Autowired
    MutableClock clock;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        MasterCodeFixtures fx = new MasterCodeFixtures(jdbc);
        fx.clear();
        DmeTestSupport.clear(jdbc);
        clock.setLocal(DmeTestSupport.NOW);
        currentUser.set(OWNER, Set.of(MdmRoles.STEWARD));

        // dmc — MDM 원천 코드 하나, DRAFT v1.000 소유자 kim(§3 B2, MasterCodeFixtures 시드 패턴 재사용).
        fx.seedCode(CODE_ID, "교차 시험 코드", "MDM", 0);
        fx.seedVersion(CODE_ID, "1.000", "DRAFT", OWNER, null, null, 0L);

        // dme — MDM 원천 룰 하나, DRAFT v1 소유자 kim(§3 B2, DmeTestSupport 시드 패턴 재사용).
        DmeTestSupport.rule(jdbc, RULE_ID, "교차 시험 룰", "DECISION", "CREATED");
        DmeTestSupport.pending(jdbc, RULE_ID, 1, "DRAFT", OWNER, "FIRST", null);
    }

    private static CodeConfirmRequest codeConfirm() {
        CodeConfirmRequest r = new CodeConfirmRequest();
        r.setMaruCodeId(CODE_ID);
        r.setVer("1.000");
        r.setRowVersion(0L);
        r.setApplyFrom("2026-07-01 00:00:00");
        r.setWarningsAcknowledged(true);
        return r;
    }

    private static RuleConfirmRequest ruleConfirm() {
        RuleConfirmRequest r = new RuleConfirmRequest();
        r.setMaruRuleId(RULE_ID);
        r.setVer(1);
        r.setRowVersion(0L);
        r.setApplyFrom("2026-07-01 00:00:00");
        r.setWarningsAcknowledged(true);
        return r;
    }

    /** dmc·dme 가 오류 계열이 같은지 코드 하나로 나란히 비교하는 도우미(기존 RuleConfirmServiceTest 의 code() 와 같은 모양). */
    private static String code(Executable call) {
        BusinessException e = assertThrows(BusinessException.class, call);
        return e.getErrors() == null || e.getErrors().isEmpty() ? e.getErrorCode().name() : e.getErrors().get(0).code();
    }

    private String codeDraftState() {
        return jdbc.queryForObject(
                "SELECT STATUS || '|' || OWNER_ID || '|' || ROW_VERSION FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID = ?",
                String.class, CODE_ID);
    }

    private String ruleDraftState() {
        return jdbc.queryForObject(
                "SELECT STATUS || '|' || OWNER_ID || '|' || ROW_VERSION FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = ?",
                String.class, RULE_ID);
    }

    // ── 담당자 역할 가드(MDM013) — MdmStewardGuard 한 곳을 dmc(CodeConfirmService)·dme(RuleStewardCheck→MdmStewardGuard) 모두가 부른다 ──

    @Test
    void 담당자_역할이_없으면_dmc_dme_모두_입력을_보기_전에_MDM013() {
        currentUser.set(NO_STEWARD_ROLE_USER, Set.of(MdmRoles.STD_ADMIN));
        String codeBefore = codeDraftState();
        String ruleBefore = ruleDraftState();

        assertEquals(MdmErrorCode.STEWARD_ROLE_REQUIRED.code(), code(() -> codeConfirmService.confirm(codeConfirm())));
        assertEquals(MdmErrorCode.STEWARD_ROLE_REQUIRED.code(), code(() -> ruleConfirmService.confirm(ruleConfirm())));

        assertEquals(codeBefore, codeDraftState(), "거부 경로에서 dmc DRAFT 가 그대로다");
        assertEquals(ruleBefore, ruleDraftState(), "거부 경로에서 dme DRAFT 가 그대로다");
    }

    // ── 소유자 가드(MDM003) — DefaultVersionStateService.confirm()→VersionPreconditions.requireOwner 한 곳을 둘 다 부른다 ──

    @Test
    void 소유자가_아니면_dmc_dme_모두_MDM003_같은_공용_VersionStateService_판정() {
        currentUser.set(NON_OWNER, Set.of(MdmRoles.STEWARD));
        String codeBefore = codeDraftState();
        String ruleBefore = ruleDraftState();

        assertEquals(MdmErrorCode.NOT_DRAFT_OWNER.code(), code(() -> codeConfirmService.confirm(codeConfirm())));
        assertEquals(MdmErrorCode.NOT_DRAFT_OWNER.code(), code(() -> ruleConfirmService.confirm(ruleConfirm())));

        assertEquals(codeBefore, codeDraftState(), "거부 경로에서 dmc DRAFT 가 그대로다");
        assertEquals(ruleBefore, ruleDraftState(), "거부 경로에서 dme DRAFT 가 그대로다");
    }

    // ── domainMng·dataItemMng 해당 없음(§3 B2) — 지어내지 않고 스키마 부재 자체를 고정한다 ──

    @Test
    void domainMng_dataItemMng_스키마에는_DRAFT_소유권_컬럼이_없다() {
        assertFalse(columnNames("TB_MDM_DOMAIN").contains("OWNER_ID"), "TB_MDM_DOMAIN 에 OWNER_ID 가 생기면 domainMng 도 이 시험 대상에 넣어야 한다");
        assertFalse(columnNames("TB_MDM_DOMAIN").contains("STATUS"));
        assertFalse(columnNames("TB_MDM_DATA_ITEM").contains("OWNER_ID"), "TB_MDM_DATA_ITEM 에 OWNER_ID 가 생기면 dataItemMng 도 이 시험 대상에 넣어야 한다");
        assertFalse(columnNames("TB_MDM_DATA_ITEM").contains("STATUS"));
    }

    private List<String> columnNames(String table) {
        return jdbc.query("PRAGMA table_info(" + table + ")", (rs, i) -> rs.getString("name"));
    }
}
