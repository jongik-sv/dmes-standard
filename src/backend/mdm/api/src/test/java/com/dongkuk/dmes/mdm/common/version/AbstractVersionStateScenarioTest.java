package com.dongkuk.dmes.mdm.common.version;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.Events;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.FakeConfirmCheck;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.FakeCurrentUser;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.FakeDraftDeletion;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.FakeStewardDirectory;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCommand;
import com.dongkuk.dmes.mdm.contract.version.ConfirmResult;
import com.dongkuk.dmes.mdm.contract.version.DraftOwnershipService;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStateService;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.contract.version.VersionWriteGuard;
import com.dongkuk.oasis.audit.AuditHolder;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * TSK-01-03 design.md §3.2 — 버전 상태 서비스 시나리오 키트(S1~S13, S15~S23). 04 「버전 상태와 적용시점」 예시를
 * 테스트로 옮긴다(§3.7). 방언 전용 시나리오(S14 트리거, S24 저장 형식)는 상속 클래스에 둔다.
 *
 * <p>인계(§7): TSK-06-01·08-01 은 이 클래스를 실제 Flyway 테이블로 상속해 같은 시나리오를 돌린다.
 * 상속 클래스는 {@link VersionTableRegistry} 빈(명세)과 {@link #createSchema(JdbcTemplate)} 를 주고,
 * 부모 FK·NOT NULL 칼럼이 있으면 {@link #seedObject}·{@link #seedVersion}·{@link #clearTables} 를 재정의한다.
 *
 * <p>서비스는 자기 트랜잭션을 열고 커밋하므로, 단언은 모두 {@link JdbcTemplate}(새 연결)로 커밋된 행을 읽는다.
 * 기본 행위자 kim, 역할 {MDM_STEWARD}.
 */
public abstract class AbstractVersionStateScenarioTest {

    protected static final String KIM = "kim";
    protected static final String LEE = "lee";
    protected static final String OPEN_END = "9999-12-31 00:00:00";
    private static final DateTimeFormatter TEXT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Autowired
    protected VersionStateService versionStateService;
    @Autowired
    protected DraftOwnershipService ownershipService;
    @Autowired
    protected VersionWriteGuard writeGuard;
    @Autowired
    protected VersionTableRegistry registry;
    @Autowired
    protected DataSource dataSource;
    @Autowired
    protected EntityManager entityManager;
    @Autowired
    protected MutableClock clock;
    @Autowired
    protected FakeCurrentUser currentUser;
    @Autowired
    protected FakeStewardDirectory stewards;
    @Autowired
    protected Events events;
    @Autowired
    protected List<FakeConfirmCheck> confirmChecks;
    @Autowired
    protected List<FakeDraftDeletion> draftDeletions;

    protected JdbcTemplate jdbc;

    /** 픽스처(또는 실제) 테이블을 만든다. 여러 번 불려도 안전해야 한다. */
    protected abstract void createSchema(JdbcTemplate jdbc);

    /** 모든 시나리오 앞에서 테이블을 비운다. */
    protected abstract void clearTables(JdbcTemplate jdbc);

    @BeforeEach
    void resetScenario() {
        jdbc = new JdbcTemplate(dataSource);
        createSchema(jdbc);
        clearTables(jdbc);
        clock.setLocal(LocalDateTime.of(2026, 6, 1, 0, 0, 0));
        currentUser.set(KIM, Set.of(MdmRoles.STEWARD));
        stewards.set(Set.of());
        events.clear();
        confirmChecks.forEach(FakeConfirmCheck::reset);
        draftDeletions.forEach(FakeDraftDeletion::reset);
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @AfterEach
    void clearThreadLocals() {
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    // ── S1~S3: 04 샘플 데이터 PROC_CD 이력 재현(04:1061-1066) ────────────────────────────────

    @Test
    void S1_최초_버전은_과거_일시로도_확정되고_열린_구간과_결재_칸과_부모_INUSE_를_쓴다() {
        at("2026-06-01 00:00:00");
        seedObject(VersionTarget.MASTER_CODE, "PROC_CD", "CREATED");
        VersionRef v1 = code("PROC_CD", "1.000");
        seedVersion(v1, "DRAFT", KIM, null, null, 0);

        ConfirmResult result = confirm(v1, 0, "2024-01-01 00:00:00");

        assertEquals(v1, result.confirmed());
        assertEquals(1, result.rowVersion());
        assertNull(result.closedPrevious());
        assertTrue(result.warnings().isEmpty());
        Map<String, Object> row = readVersion(v1);
        assertEquals("RELEASED", row.get("STATUS"));
        assertEquals("2024-01-01 00:00:00", text(row.get("APPLY_FROM")));
        assertEquals(OPEN_END, text(row.get("APPLY_TO")));
        assertEquals(1L, number(row.get("ROW_VERSION")));
        assertEquals(KIM, row.get("REQUESTED_BY"));
        assertEquals("2026-06-01 00:00:00", text(row.get("REQUESTED_AT")));
        assertEquals("2026-06-01 00:00:00", text(row.get("RELEASED_AT")));
        assertNull(row.get("APPROVED_BY"));
        assertNull(row.get("APPROVED_AT"));
        assertEquals(KIM, row.get("OWNER_ID"), "확정 뒤 OWNER_ID 는 기록으로 남는다(ADR-0002 D3)");
        assertEquals("INUSE", parentStatus(VersionTarget.MASTER_CODE, "PROC_CD"));

        List<ConfirmCheckRequest> calls = confirmCheck(VersionTarget.MASTER_CODE).calls();
        assertEquals(1, calls.size());
        assertEquals(v1, calls.get(0).draft());
        assertNull(calls.get(0).previousReleasedApplyFrom());
        assertEquals(KIM, calls.get(0).confirmerId());
        assertEquals(LocalDateTime.of(2026, 6, 1, 0, 0, 0), calls.get(0).now());
        assertEquals(LocalDateTime.of(2024, 1, 1, 0, 0, 0), calls.get(0).requestedApplyFrom());
    }

    @Test
    void S2_둘째_버전_확정은_직전_RELEASED_의_APPLY_TO_를_새_APPLY_FROM_으로_닫는다() {
        at("2026-06-20 00:00:00");
        seedObject(VersionTarget.MASTER_CODE, "PROC_CD", "INUSE");
        VersionRef v1000 = code("PROC_CD", "1.000");
        VersionRef v1001 = code("PROC_CD", "1.001");
        seedVersion(v1000, "RELEASED", KIM, "2024-01-01 00:00:00", OPEN_END, 1);
        seedVersion(v1001, "DRAFT", KIM, null, null, 0);
        // 검사 순서(I2·I8·I10): SPI 는 DRAFT 확정·직전 닫기 UPDATE 보다 먼저 불린다. 롤백이 최종 상태를 되돌리므로
        // 순서는 같은 트랜잭션 안에서 SPI 가 보는 행으로 확인한다.
        List<String> seenBySpi = new ArrayList<>();
        confirmCheck(VersionTarget.MASTER_CODE).during(request ->
                seenBySpi.add(statusAndApplyToInCurrentTransaction(v1001) + " / " + statusAndApplyToInCurrentTransaction(v1000)));

        ConfirmResult result = confirm(v1001, 0, "2026-07-01 00:00:00");

        assertEquals(List.of("DRAFT|null / RELEASED|" + OPEN_END), seenBySpi, "SPI 가 본 draft / 직전 행");
        assertEquals(v1000, result.closedPrevious());
        assertEquals("2026-07-01 00:00:00", text(readVersion(v1000).get("APPLY_TO")));
        Map<String, Object> row = readVersion(v1001);
        assertEquals("RELEASED", row.get("STATUS"));
        assertEquals("2026-07-01 00:00:00", text(row.get("APPLY_FROM")));
        assertEquals(OPEN_END, text(row.get("APPLY_TO")));
        assertEquals("INUSE", parentStatus(VersionTarget.MASTER_CODE, "PROC_CD"));
        assertEquals(LocalDateTime.of(2024, 1, 1, 0, 0, 0),
                confirmCheck(VersionTarget.MASTER_CODE).calls().get(0).previousReleasedApplyFrom());
    }

    @Test
    void S3_미래_RELEASED_는_미적용이라_새_버전을_막고_적용_시작_경계에서_풀린다() {
        at("2026-09-03 00:00:00");
        seedObject(VersionTarget.MASTER_CODE, "PROC_CD", "INUSE");
        VersionRef v1000 = code("PROC_CD", "1.000");
        VersionRef v1001 = code("PROC_CD", "1.001");
        VersionRef v2000 = code("PROC_CD", "2.000");
        seedVersion(v1000, "RELEASED", KIM, "2024-01-01 00:00:00", "2026-07-01 00:00:00", 1);
        seedVersion(v1001, "RELEASED", KIM, "2026-07-01 00:00:00", OPEN_END, 1);
        seedVersion(v2000, "DRAFT", KIM, null, null, 0);

        // 04:1082 "새 버전 버튼: DRAFT v2.000이 있으므로 비활성"
        assertMdm("MDM006", () -> writeGuard.checkCanCreateVersion(VersionTarget.MASTER_CODE, "PROC_CD"));

        ConfirmResult result = confirm(v2000, 0, "2026-10-01 00:00:00");

        assertEquals(v1001, result.closedPrevious(), "직전 = draft 보다 VER 가 작은 RELEASED 중 최대");
        assertEquals("2026-10-01 00:00:00", text(readVersion(v1001).get("APPLY_TO")));
        assertEquals("2026-07-01 00:00:00", text(readVersion(v1000).get("APPLY_TO")), "더 앞선 버전은 그대로");
        assertEquals("2026-10-01 00:00:00", text(readVersion(v2000).get("APPLY_FROM")));
        assertEquals(OPEN_END, text(readVersion(v2000).get("APPLY_TO")));

        assertMdm("MDM006", () -> writeGuard.checkCanCreateVersion(VersionTarget.MASTER_CODE, "PROC_CD"));
        at("2026-09-30 23:59:59");
        assertMdm("MDM006", () -> writeGuard.checkCanCreateVersion(VersionTarget.MASTER_CODE, "PROC_CD"));
        at("2026-10-01 00:00:00");
        writeGuard.checkCanCreateVersion(VersionTarget.MASTER_CODE, "PROC_CD");
    }

    // ── S4~S5: apply_from 순서(ADR-0002 D4-3, 04:1091-1094) ──────────────────────────────────

    @Test
    void S4_직전보다_앞선_apply_from_은_MDM008_이고_아무것도_바뀌지_않는다() {
        at("2026-09-03 00:00:00");
        seedObject(VersionTarget.MASTER_CODE, "EQP_CD", "INUSE");
        VersionRef v1 = code("EQP_CD", "1.000");
        VersionRef v2 = code("EQP_CD", "2.000");
        seedVersion(v1, "RELEASED", KIM, "2026-08-01 00:00:00", OPEN_END, 1);
        seedVersion(v2, "DRAFT", KIM, null, null, 0);

        BusinessException e = assertMdm("MDM008", () -> confirm(v2, 0, "2026-07-15 00:00:00"));

        assertTrue(detailCodes(e).size() >= 2, "순서 이슈가 detail 로 실린다: " + detailCodes(e));
        assertDraftUntouched(v2, 0);
        assertEquals(OPEN_END, text(readVersion(v1).get("APPLY_TO")));
        assertTrue(confirmCheck(VersionTarget.MASTER_CODE).calls().isEmpty(), "순서 검사는 SPI 앞이다");
    }

    @Test
    void S5_직전과_같은_일시는_거부하고_1초_뒤는_통과한다() {
        seedObject(VersionTarget.MASTER_CODE, "PROC_CD", "INUSE");
        VersionRef v1 = code("PROC_CD", "1.000");
        VersionRef v2 = code("PROC_CD", "1.001");
        seedVersion(v1, "RELEASED", KIM, "2026-01-01 00:00:00", OPEN_END, 1);
        seedVersion(v2, "DRAFT", KIM, null, null, 0);

        assertMdm("MDM008", () -> confirm(v2, 0, "2026-01-01 00:00:00"));
        assertDraftUntouched(v2, 0);
        // 초 단위로 자른 뒤 비교한다(I15): 0.5초 뒤는 저장하면 직전과 같은 초라 거부해야 한다.
        assertMdm("MDM008", () -> versionStateService.confirm(new ConfirmCommand(v2, 0,
                LocalDateTime.of(2026, 1, 1, 0, 0, 0, 500_000_000), KIM, false)));
        assertDraftUntouched(v2, 0);

        confirm(v2, 0, "2026-01-01 00:00:01");
        assertEquals("2026-01-01 00:00:01", text(readVersion(v1).get("APPLY_TO")));
    }

    // ── S6: 미적용 2개(04:293-301) ─────────────────────────────────────────────────────────

    @Test
    void S6_미적용_버전이_둘이면_확정과_저장을_거부하고_삭제는_허용한다() {
        seedObject(VersionTarget.MASTER_CODE, "PROC_CD", "INUSE");
        VersionRef v1 = code("PROC_CD", "1.000");
        VersionRef v2000 = code("PROC_CD", "2.000");
        VersionRef v2001 = code("PROC_CD", "2.001");
        seedVersion(v1, "RELEASED", KIM, "2024-01-01 00:00:00", OPEN_END, 1);
        seedVersion(v2000, "DRAFT", KIM, null, null, 0);
        seedVersion(v2001, "DRAFT", KIM, null, null, 0);

        assertMdm("MDM007", () -> confirm(v2000, 0, "2026-07-01 00:00:00"));
        assertMdm("MDM007", () -> writeGuard.beginDraftWrite(v2000, 0, KIM));
        assertDraftUntouched(v2000, 0);

        versionStateService.deleteDraft(v2001, 0, KIM);
        assertNull(readVersionOrNull(v2001));

        confirm(v2000, 0, "2026-07-01 00:00:00");
        assertEquals("RELEASED", readVersion(v2000).get("STATUS"));
    }

    // ── S7~S8: 소유자·역할 ────────────────────────────────────────────────────────────────

    @Test
    void S7_소유자가_아니면_확정할_수_없다() {
        seedObject(VersionTarget.MASTER_CODE, "PROC_CD", "CREATED");
        VersionRef owned = code("PROC_CD", "1.000");
        seedVersion(owned, "DRAFT", LEE, null, null, 0);
        assertMdm("MDM003", () -> confirm(owned, 0, "2026-01-01 00:00:00"));
        assertDraftUntouched(owned, 0);

        clearTables(jdbc);
        seedObject(VersionTarget.MASTER_CODE, "PROC_CD", "CREATED");
        seedVersion(owned, "DRAFT", null, null, null, 0);
        assertMdm("MDM003", () -> confirm(owned, 0, "2026-01-01 00:00:00"));
        assertDraftUntouched(owned, 0);
        assertEquals("CREATED", parentStatus(VersionTarget.MASTER_CODE, "PROC_CD"));
    }

    @Test
    void S8_담당자_역할만_확정할_수_있고_역할_검사는_SPI_보다_먼저다() {
        seedObject(VersionTarget.MASTER_CODE, "PROC_CD", "CREATED");
        VersionRef v1 = code("PROC_CD", "1.000");
        seedVersion(v1, "DRAFT", KIM, null, null, 0);

        currentUser.set(KIM, Set.of("SYSADMIN"));
        assertMdm("MDM013", () -> confirm(v1, 0, "2026-01-01 00:00:00"));
        currentUser.set(KIM, Set.of(MdmRoles.STD_ADMIN));
        assertMdm("MDM013", () -> confirm(v1, 0, "2026-01-01 00:00:00"));
        assertDraftUntouched(v1, 0);
        assertFalse(events.snapshot().stream().anyMatch(e -> e.startsWith("spi:")),
                "역할이 없으면 SPI 를 부르지 않는다(검사 순서 I10): " + events.snapshot());

        events.clear();
        currentUser.set(KIM, Set.of("SYSADMIN", MdmRoles.STEWARD));
        confirm(v1, 0, "2026-01-01 00:00:00");
        List<String> order = events.snapshot();
        assertTrue(order.indexOf("roles") >= 0 && order.indexOf("roles") < order.indexOf("spi:MASTER_CODE"),
                "역할 조회가 SPI 보다 먼저다: " + order);
        assertEquals("RELEASED", readVersion(v1).get("STATUS"));
    }

    // ── S9~S10: 확정 검사 SPI ─────────────────────────────────────────────────────────────

    @Test
    void S9_확정_검사가_실패하면_MDM010_이고_DRAFT_직전_부모가_그대로다() {
        seedObject(VersionTarget.MASTER_CODE, "PROC_CD", "CREATED");
        VersionRef v1 = code("PROC_CD", "1.000");
        VersionRef v2 = code("PROC_CD", "1.001");
        seedVersion(v1, "RELEASED", KIM, "2026-01-01 00:00:00", OPEN_END, 1);
        seedVersion(v2, "DRAFT", KIM, null, null, 0);
        confirmCheck(VersionTarget.MASTER_CODE).errors(List.of(
                new MdmCheckIssue("CHK-1", "코드명 누락", "codeName", "P01"),
                new MdmCheckIssue("CHK-7", "카테고리 불일치", null, "P02")));

        BusinessException e = assertMdm("MDM010", () -> confirm(v2, 0, "2026-05-01 00:00:00"));

        assertEquals(List.of("MDM010", "CHK-1", "CHK-7"), detailCodes(e));
        assertDraftUntouched(v2, 0);
        assertEquals(OPEN_END, text(readVersion(v1).get("APPLY_TO")));
        assertEquals("CREATED", parentStatus(VersionTarget.MASTER_CODE, "PROC_CD"));
    }

    @Test
    void S10_경고는_확인해야_확정되고_결과에_경고가_실린다() {
        seedObject(VersionTarget.MASTER_CODE, "PROC_CD", "INUSE");
        VersionRef v1 = code("PROC_CD", "1.000");
        seedVersion(v1, "DRAFT", KIM, null, null, 0);
        MdmCheckIssue warning = new MdmCheckIssue("W2-1", "사용 중인 코드가 삭제됩니다", null, "P01");
        confirmCheck(VersionTarget.MASTER_CODE).warnings(List.of(warning));

        BusinessException e = assertMdm("MDM014", () -> versionStateService.confirm(
                new ConfirmCommand(v1, 0, dt("2026-01-01 00:00:00"), KIM, false)));
        assertEquals(List.of("MDM014", "W2-1"), detailCodes(e));
        assertDraftUntouched(v1, 0);

        ConfirmResult result = versionStateService.confirm(new ConfirmCommand(v1, 0, dt("2026-01-01 00:00:00"), KIM, true));
        assertEquals(List.of(warning), result.warnings());
        assertEquals("RELEASED", readVersion(v1).get("STATUS"));
    }

    // ── S11~S13: row_version(04:305) — "동시 확정 충돌 시 row_version 409" ─────────────────

    @Test
    void S11_낡은_row_version_은_MDM001_이다() {
        seedObject(VersionTarget.MASTER_CODE, "PROC_CD", "INUSE");
        VersionRef v1 = code("PROC_CD", "1.000");
        seedVersion(v1, "DRAFT", KIM, null, null, 1);
        assertMdm("MDM001", () -> confirm(v1, 0, "2026-01-01 00:00:00"));
        assertDraftUntouched(v1, 1);
    }

    @Test
    void S12_같은_요청의_두_번째_확정은_MDM002_가_아니라_MDM001_이다() {
        seedObject(VersionTarget.MASTER_CODE, "PROC_CD", "INUSE");
        VersionRef v1 = code("PROC_CD", "1.000");
        seedVersion(v1, "DRAFT", KIM, null, null, 0);

        confirm(v1, 0, "2026-01-01 00:00:00");
        BusinessException second = assertThrows(BusinessException.class, () -> confirm(v1, 0, "2026-02-01 00:00:00"));

        assertEquals("MDM001", mdmCode(second), "상태 검사가 row_version 보다 뒤라 충돌은 409(MDM001)로 보인다");
        assertEquals(ErrorCode.BUSINESS_ERROR, second.getErrorCode());
        Map<String, Object> row = readVersion(v1);
        assertEquals("RELEASED", row.get("STATUS"));
        assertEquals(1L, number(row.get("ROW_VERSION")));
        assertEquals("2026-01-01 00:00:00", text(row.get("APPLY_FROM")));
    }

    @Test
    void S13_검사와_UPDATE_사이에_다른_사용자가_먼저_쓰면_조건부_UPDATE_가_0행이라_MDM001_이다() {
        seedObject(VersionTarget.MASTER_CODE, "PROC_CD", "INUSE");
        VersionRef v1 = code("PROC_CD", "1.000");
        VersionRef v2 = code("PROC_CD", "1.001");
        seedVersion(v1, "RELEASED", KIM, "2024-01-01 00:00:00", OPEN_END, 1);
        seedVersion(v2, "DRAFT", KIM, null, null, 0);
        // 같은 트랜잭션 안에서 ROW_VERSION 을 올려 "다른 사용자가 먼저 커밋한" 상태를 재현한다.
        confirmCheck(VersionTarget.MASTER_CODE).during(request -> bumpRowVersionInCurrentTransaction(v2));

        assertMdm("MDM001", () -> confirm(v2, 0, "2026-07-01 00:00:00"));

        assertDraftUntouched(v2, 0);
        assertEquals(OPEN_END, text(readVersion(v1).get("APPLY_TO")));
    }

    // ── S15~S16 ───────────────────────────────────────────────────────────────────────────

    @Test
    void S15_06_정수_버전도_같은_경로로_확정한다() {
        seedObject(VersionTarget.BUSINESS_RULE, "RULE-1", "INUSE");
        VersionRef v1 = rule("RULE-1", "1");
        VersionRef v2 = rule("RULE-1", "2");
        seedVersion(v1, "RELEASED", KIM, "2026-01-01 00:00:00", OPEN_END, 1);
        seedVersion(v2, "DRAFT", KIM, null, null, 0);

        ConfirmResult result = confirm(v2, 0, "2026-07-01 00:00:00");

        assertEquals(0, result.confirmed().ver().scale());
        assertEquals(new BigDecimal("2"), result.confirmed().ver());
        assertEquals(v1, result.closedPrevious());
        assertEquals("2026-07-01 00:00:00", text(readVersion(v1).get("APPLY_TO")));
        assertEquals("RELEASED", readVersion(v2).get("STATUS"));
        assertEquals(1, confirmCheck(VersionTarget.BUSINESS_RULE).calls().size());
        assertTrue(confirmCheck(VersionTarget.MASTER_CODE).calls().isEmpty());
    }

    @Test
    void S16_apply_from_은_필수이고_초_단위로_저장한다() {
        seedObject(VersionTarget.MASTER_CODE, "PROC_CD", "INUSE");
        VersionRef v1 = code("PROC_CD", "1.000");
        seedVersion(v1, "DRAFT", KIM, null, null, 0);

        BusinessException missing = assertThrows(BusinessException.class,
                () -> versionStateService.confirm(new ConfirmCommand(v1, 0, null, KIM, false)));
        assertEquals(ErrorCode.REQUIRED_VALUE, missing.getErrorCode());
        assertEquals("E001", missing.getErrors().get(0).code());
        assertEquals("applyFrom", missing.getErrors().get(0).field());

        BusinessException openEnd = assertThrows(BusinessException.class,
                () -> versionStateService.confirm(new ConfirmCommand(v1, 0, dt(OPEN_END), KIM, false)));
        assertEquals(ErrorCode.INVALID_VALUE, openEnd.getErrorCode());
        assertDraftUntouched(v1, 0);

        versionStateService.confirm(new ConfirmCommand(v1, 0,
                LocalDateTime.of(2024, 1, 1, 0, 0, 0, 999_000_000), KIM, false));
        assertEquals("2024-01-01 00:00:00", text(readVersion(v1).get("APPLY_FROM")));
    }

    // ── S17: DRAFT 삭제(04:280·303, I13) ─────────────────────────────────────────────────

    @Test
    void S17_소유자만_DRAFT_를_지우고_삭제_훅은_DELETE_전에_불린다() {
        seedObject(VersionTarget.MASTER_CODE, "PROC_CD", "INUSE");
        VersionRef v2 = code("PROC_CD", "2.000");
        seedVersion(v2, "DRAFT", KIM, null, null, 0);
        List<Integer> rowsSeenByHook = new ArrayList<>();
        FakeDraftDeletion hook = draftDeletion(VersionTarget.MASTER_CODE);
        hook.during(ref -> rowsSeenByHook.add(countInCurrentTransaction(ref)));

        versionStateService.deleteDraft(v2, 0, KIM);

        assertNull(readVersionOrNull(v2));
        assertEquals(List.of(v2), hook.calls());
        assertEquals(List.of(1), rowsSeenByHook, "훅이 불릴 때 VER 행이 아직 있어야 한다");

        // 번호 재사용(04:280): 지운 VER 로 다시 만들 수 있다.
        seedVersion(v2, "DRAFT", LEE, null, null, 0);
        assertMdm("MDM003", () -> versionStateService.deleteDraft(v2, 0, KIM));
        assertNotNull(readVersionOrNull(v2));

        clearTables(jdbc);
        seedVersion(v2, "DRAFT", KIM, null, null, 3);
        assertMdm("MDM001", () -> versionStateService.deleteDraft(v2, 2, KIM));

        clearTables(jdbc);
        seedVersion(v2, "RELEASED", KIM, "2024-01-01 00:00:00", OPEN_END, 1);
        assertMdm("MDM002", () -> versionStateService.deleteDraft(v2, 1, KIM));

        clearTables(jdbc);
        seedVersion(v2, "DRAFT", KIM, null, null, 0);
        hook.reset();
        hook.failWith(new IllegalStateException("정리 실패"));
        assertThrows(IllegalStateException.class, () -> versionStateService.deleteDraft(v2, 0, KIM));
        assertDraftUntouched(v2, 0);
    }

    // ── S18~S20: 선점·해제·넘기기(04:303, ADR-0002 D3) ──────────────────────────────────────

    @Test
    void S18_빈_DRAFT_만_담당자가_선점한다() {
        VersionRef v1 = code("PROC_CD", "1.000");
        seedVersion(v1, "DRAFT", null, null, null, 0);

        assertEquals(1, ownershipService.acquire(v1, 0, KIM));
        assertEquals(KIM, readVersion(v1).get("OWNER_ID"));
        assertEquals(1L, number(readVersion(v1).get("ROW_VERSION")));

        assertMdm("MDM004", () -> ownershipService.acquire(v1, 1, KIM), "자기 자신이어도 선점할 수 없다");
        clearTables(jdbc);
        seedVersion(v1, "DRAFT", LEE, null, null, 0);
        assertMdm("MDM004", () -> ownershipService.acquire(v1, 0, KIM));

        clearTables(jdbc);
        seedVersion(v1, "DRAFT", null, null, null, 0);
        currentUser.set(KIM, Set.of("SYSADMIN"));
        assertMdm("MDM013", () -> ownershipService.acquire(v1, 0, KIM));
        currentUser.set(KIM, Set.of(MdmRoles.STEWARD));
        assertMdm("MDM001", () -> ownershipService.acquire(v1, 5, KIM));
        assertNull(readVersion(v1).get("OWNER_ID"));
    }

    @Test
    void S19_소유자만_해제하고_역할은_요구하지_않으며_관리자_대행은_없다() {
        VersionRef v1 = code("PROC_CD", "1.000");
        seedVersion(v1, "DRAFT", KIM, null, null, 0);

        currentUser.set(KIM, Set.of());
        assertEquals(1, ownershipService.release(v1, 0, KIM));
        assertNull(readVersion(v1).get("OWNER_ID"));
        assertEquals(1L, number(readVersion(v1).get("ROW_VERSION")));

        clearTables(jdbc);
        seedVersion(v1, "DRAFT", LEE, null, null, 0);
        currentUser.set(KIM, Set.of("SYSADMIN", MdmRoles.STEWARD));
        assertMdm("MDM003", () -> ownershipService.release(v1, 0, KIM));
        assertEquals(LEE, readVersion(v1).get("OWNER_ID"));
    }

    @Test
    void S20_소유자만_담당자에게_넘긴다() {
        VersionRef v1 = code("PROC_CD", "1.000");
        seedVersion(v1, "DRAFT", KIM, null, null, 0);
        stewards.set(Set.of(LEE, KIM));

        assertMdm("MDM005", () -> ownershipService.handover(v1, 0, KIM, "park"), "대상이 담당자가 아니다");
        assertMdm("MDM005", () -> ownershipService.handover(v1, 0, KIM, " "));
        assertMdm("MDM005", () -> ownershipService.handover(v1, 0, KIM, KIM), "자기 자신에게는 넘길 수 없다");
        assertEquals(KIM, readVersion(v1).get("OWNER_ID"));

        assertEquals(1, ownershipService.handover(v1, 0, KIM, LEE));
        assertEquals(LEE, readVersion(v1).get("OWNER_ID"));
        assertEquals(1L, number(readVersion(v1).get("ROW_VERSION")));

        assertMdm("MDM003", () -> ownershipService.handover(v1, 1, KIM, "park"));
        assertEquals(LEE, readVersion(v1).get("OWNER_ID"));
    }

    // ── S21: DRAFT 저장 가드 ──────────────────────────────────────────────────────────────

    @Test
    void S21_DRAFT_저장_가드는_소유자_rv_상태를_보고_rv_를_1_올린다() {
        at("2026-06-20 10:00:00");
        VersionRef v1 = code("PROC_CD", "1.000");
        seedVersion(v1, "DRAFT", KIM, null, null, 0);

        assertEquals(1, writeGuard.beginDraftWrite(v1, 0, KIM));
        assertEquals(1L, number(readVersion(v1).get("ROW_VERSION")));
        assertEquals("2026-06-20 10:00:00", text(readVersion(v1).get("U_AT")));

        assertMdm("MDM003", () -> writeGuard.beginDraftWrite(v1, 1, LEE));
        assertMdm("MDM001", () -> writeGuard.beginDraftWrite(v1, 0, KIM));

        clearTables(jdbc);
        seedVersion(v1, "RELEASED", KIM, "2024-01-01 00:00:00", OPEN_END, 1);
        assertMdm("MDM002", () -> writeGuard.beginDraftWrite(v1, 1, KIM));
    }

    // ── S22~S23 ───────────────────────────────────────────────────────────────────────────

    @Test
    void S22_부모_INUSE_는_apply_from_이_now_이하일_때만이고_이미_INUSE_면_손대지_않는다() {
        at("2026-06-01 00:00:00");
        seedObject(VersionTarget.MASTER_CODE, "NOW_CD", "CREATED");
        seedVersion(code("NOW_CD", "1.000"), "DRAFT", KIM, null, null, 0);
        confirm(code("NOW_CD", "1.000"), 0, "2026-06-01 00:00:00");
        assertEquals("INUSE", parentStatus(VersionTarget.MASTER_CODE, "NOW_CD"), "경계(= now)는 적용됨");

        seedObject(VersionTarget.MASTER_CODE, "LATER_CD", "CREATED");
        seedVersion(code("LATER_CD", "1.000"), "DRAFT", KIM, null, null, 0);
        confirm(code("LATER_CD", "1.000"), 0, "2026-06-01 00:00:01");
        assertEquals("CREATED", parentStatus(VersionTarget.MASTER_CODE, "LATER_CD"));

        seedObject(VersionTarget.MASTER_CODE, "USED_CD", "INUSE", "seed", 5);
        seedVersion(code("USED_CD", "1.000"), "DRAFT", KIM, null, null, 0);
        confirm(code("USED_CD", "1.000"), 0, "2026-01-01 00:00:00");
        Map<String, Object> parent = readObject(VersionTarget.MASTER_CODE, "USED_CD");
        assertEquals("INUSE", parent.get("STATUS"));
        assertEquals("seed", parent.get("U_USR_ID"), "이미 INUSE 면 감사 칼럼도 그대로");
        assertEquals(5L, number(parent.get(parentAuditCounter())));
    }

    @Test
    void S23_모든_네이티브_쓰기가_감사_칼럼을_명시하고_카운터를_올린다() {
        at("2026-06-20 10:11:12");
        AuditHolder.setAudit(new CactusAudit(KIM, "codeConfirmMenu", "codeConfirm"));
        seedObject(VersionTarget.MASTER_CODE, "PROC_CD", "CREATED", null, 0);
        VersionRef v1 = code("PROC_CD", "1.000");
        VersionRef v2 = code("PROC_CD", "1.001");
        seedVersion(v1, "RELEASED", KIM, "2024-01-01 00:00:00", OPEN_END, 1);
        seedVersion(v2, "DRAFT", KIM, null, null, 0);

        confirm(v2, 0, "2026-06-01 00:00:00");

        Map<String, Object> parent = readObject(VersionTarget.MASTER_CODE, "PROC_CD");
        for (Map<String, Object> row : List.of(readVersion(v2), readVersion(v1), parent)) {
            assertEquals(KIM, row.get("U_USR_ID"), row.toString());
            assertEquals("codeConfirm", row.get("U_SVC_ID"), "U_SVC_ID ← serviceId: " + row);
            assertEquals("codeConfirmMenu", row.get("U_PGM_ID"), "U_PGM_ID ← menuId: " + row);
            assertEquals("2026-06-20 10:11:12", text(row.get("U_AT")), "U_AT = 애플리케이션 시각: " + row);
        }
        // 감사 카운터는 테이블마다 칼럼이 다르다(D-034): 버전 테이블 AUD_VER, 부모 VER. 업무 VER 는 그대로다.
        assertEquals(1L, number(readVersion(v2).get(auditCounter())));
        assertEquals(1L, number(readVersion(v1).get(auditCounter())));
        assertEquals(1L, number(parent.get(parentAuditCounter())));
        assertEquals(0, new BigDecimal(readVersion(v2).get("VER").toString()).compareTo(v2.ver()),
                "업무 버전 칼럼 VER 는 감사 카운터로 오르지 않는다");
    }

    // ── 도우미 ────────────────────────────────────────────────────────────────────────────

    protected VersionTableSpec spec(VersionTarget target) {
        return registry.spec(target);
    }

    /** 버전 테이블의 감사 카운터 칼럼(D-034: AUD_VER). */
    protected String auditCounter() {
        return spec(VersionTarget.MASTER_CODE).auditCounterColumn();
    }

    /** 부모 테이블의 감사 카운터 칼럼(D-034: VER). */
    protected String parentAuditCounter() {
        return spec(VersionTarget.MASTER_CODE).parentAuditCounterColumn();
    }

    protected static VersionRef code(String id, String ver) {
        return new VersionRef(VersionTarget.MASTER_CODE, id, new BigDecimal(ver));
    }

    protected static VersionRef rule(String id, String ver) {
        return new VersionRef(VersionTarget.BUSINESS_RULE, id, new BigDecimal(ver));
    }

    protected void at(String local) {
        clock.setLocal(dt(local));
    }

    protected static LocalDateTime dt(String local) {
        return LocalDateTime.parse(local, TEXT);
    }

    protected ConfirmResult confirm(VersionRef ref, long rowVersion, String applyFrom) {
        return versionStateService.confirm(new ConfirmCommand(ref, rowVersion, dt(applyFrom), KIM, false));
    }

    protected FakeConfirmCheck confirmCheck(VersionTarget target) {
        return confirmChecks.stream().filter(c -> c.target() == target).findFirst().orElseThrow();
    }

    protected FakeDraftDeletion draftDeletion(VersionTarget target) {
        return draftDeletions.stream().filter(c -> c.target() == target).findFirst().orElseThrow();
    }

    protected static BusinessException assertMdm(String code, Executable call) {
        return assertMdm(code, call, null);
    }

    protected static BusinessException assertMdm(String code, Executable call, String message) {
        BusinessException e = assertThrows(BusinessException.class, call, message);
        assertEquals(code, mdmCode(e), (message == null ? "" : message + " — ") + e.getMessage());
        return e;
    }

    protected static String mdmCode(BusinessException e) {
        return e.getErrors() == null || e.getErrors().isEmpty() ? null : e.getErrors().get(0).code();
    }

    protected static List<String> detailCodes(BusinessException e) {
        return e.getErrors().stream().map(ErrorDetail::code).toList();
    }

    /** 실패한 전이 뒤 DRAFT 가 그대로인지(상태·rv·적용 구간). */
    protected void assertDraftUntouched(VersionRef ref, long rowVersion) {
        Map<String, Object> row = readVersion(ref);
        assertEquals("DRAFT", row.get("STATUS"), row.toString());
        assertEquals(rowVersion, number(row.get("ROW_VERSION")), row.toString());
        assertNull(row.get("APPLY_FROM"), row.toString());
        assertNull(row.get("APPLY_TO"), row.toString());
        assertNull(row.get("RELEASED_AT"), row.toString());
    }

    protected void seedObject(VersionTarget target, String objectId, String status) {
        seedObject(target, objectId, status, null, null);
    }

    protected void seedObject(VersionTarget target, String objectId, String status, String uUsrId, Integer auditCounter) {
        VersionTableSpec spec = spec(target);
        jdbc.update("INSERT INTO " + spec.parentTable() + " (" + spec.parentObjectIdColumn() + ", STATUS, U_USR_ID, "
                + spec.parentAuditCounterColumn() + ") VALUES (?, ?, ?, ?)", objectId, status, uUsrId, auditCounter);
    }

    protected void seedVersion(VersionRef ref, String status, String ownerId, String applyFrom, String applyTo,
                               long rowVersion) {
        VersionTableSpec spec = spec(ref.target());
        jdbc.update("INSERT INTO " + spec.versionTable() + " (" + spec.objectIdColumn() + ", " + spec.versionColumn()
                        + ", STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, ROW_VERSION, " + spec.auditCounterColumn()
                        + ") VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
                ref.objectId(), ref.ver().setScale(ref.target().versionScale()), status, ownerId, applyFrom, applyTo,
                rowVersion);
    }

    protected Map<String, Object> readVersion(VersionRef ref) {
        Map<String, Object> row = readVersionOrNull(ref);
        assertNotNull(row, "버전 행이 없다: " + ref);
        return row;
    }

    protected Map<String, Object> readVersionOrNull(VersionRef ref) {
        VersionTableSpec spec = spec(ref.target());
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM " + spec.versionTable() + " WHERE "
                        + spec.objectIdColumn() + " = ? AND " + spec.versionColumn() + " = ?",
                ref.objectId(), ref.ver().setScale(ref.target().versionScale()));
        return rows.isEmpty() ? null : rows.get(0);
    }

    protected Map<String, Object> readObject(VersionTarget target, String objectId) {
        VersionTableSpec spec = spec(target);
        return jdbc.queryForMap("SELECT * FROM " + spec.parentTable() + " WHERE " + spec.parentObjectIdColumn() + " = ?",
                objectId);
    }

    protected String parentStatus(VersionTarget target, String objectId) {
        return (String) readObject(target, objectId).get("STATUS");
    }

    /** 서비스 트랜잭션 안(SPI·훅 호출 중)에서 같은 연결로 ROW_VERSION 을 올린다. */
    protected void bumpRowVersionInCurrentTransaction(VersionRef ref) {
        VersionTableSpec spec = spec(ref.target());
        entityManager.createNativeQuery("UPDATE " + spec.versionTable() + " SET ROW_VERSION = ROW_VERSION + 1 WHERE "
                        + spec.objectIdColumn() + " = ?1 AND " + spec.versionColumn() + " = ?2")
                .setParameter(1, ref.objectId())
                .setParameter(2, ref.ver().setScale(ref.target().versionScale()))
                .executeUpdate();
    }

    /** 서비스 트랜잭션 안(훅 호출 중)에서 같은 연결로 VER 행 수를 센다. */
    protected int countInCurrentTransaction(VersionRef ref) {
        VersionTableSpec spec = spec(ref.target());
        Object count = entityManager.createNativeQuery("SELECT COUNT(*) FROM " + spec.versionTable() + " WHERE "
                        + spec.objectIdColumn() + " = ?1 AND " + spec.versionColumn() + " = ?2")
                .setParameter(1, ref.objectId())
                .setParameter(2, ref.ver().setScale(ref.target().versionScale()))
                .getSingleResult();
        return ((Number) count).intValue();
    }

    /** 서비스 트랜잭션 안(SPI 호출 중)에서 같은 연결로 STATUS·APPLY_TO 를 읽는다. */
    protected String statusAndApplyToInCurrentTransaction(VersionRef ref) {
        VersionTableSpec spec = spec(ref.target());
        Object[] row = (Object[]) entityManager.createNativeQuery("SELECT STATUS, CAST(APPLY_TO AS VARCHAR(40)) FROM "
                        + spec.versionTable() + " WHERE " + spec.objectIdColumn() + " = ?1 AND " + spec.versionColumn() + " = ?2")
                .setParameter(1, ref.objectId())
                .setParameter(2, ref.ver().setScale(ref.target().versionScale()))
                .getSingleResult();
        return row[0] + "|" + row[1];
    }

    /** SQLite TEXT 일시를 같은 문자열로 읽는다. */
    protected static String text(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Timestamp timestamp) {
            return TEXT.format(timestamp.toLocalDateTime());
        }
        if (value instanceof LocalDateTime local) {
            return TEXT.format(local);
        }
        return value.toString();
    }

    protected static long number(Object value) {
        return ((Number) value).longValue();
    }
}
