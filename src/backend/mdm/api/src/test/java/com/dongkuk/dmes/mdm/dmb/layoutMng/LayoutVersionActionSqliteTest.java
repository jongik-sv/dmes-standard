package com.dongkuk.dmes.mdm.dmb.layoutMng;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.FakeStewardDirectory;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dmb.LayoutServiceTestSupport;
import com.dongkuk.dmes.mdm.dmb.headerMng.dto.HeaderMngViewRequest;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionService;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionStore;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersions;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngViewRequest;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutVersionRequest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/** D-144 3단계 — 레이아웃 새 버전 major/minor(직전 RELEASED 복사), 미적용 하나(MDM006), DRAFT 삭제는 그 버전 행만. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class LayoutVersionActionSqliteTest extends LayoutServiceTestSupport {

    @Autowired
    LayoutVersionService versions;
    @Autowired
    FakeStewardDirectory stewards;
    @Autowired
    LayoutVersionStore versionStore;

    @BeforeEach
    void setUp() {
        dictionary();
    }

    private static LayoutVersionRequest req(long id, String ver, String kind, Long rowVersion) {
        LayoutVersionRequest r = new LayoutVersionRequest();
        r.setLayoutId(id);
        r.setVer(ver);
        r.setVerKind(kind);
        r.setRowVersion(rowVersion);
        return r;
    }

    /** MdmErrors 는 코드를 message 가 아니라 첫 detail 에 싣는다(LayoutDraftSaveSqliteTest 와 같은 비교). */
    private static String code(BusinessException e) {
        return e.getErrors() == null || e.getErrors().isEmpty() ? e.getErrorCode().name() : e.getErrors().get(0).code();
    }

    @Test
    void minorCopiesLatestReleasedRowsAndRecordsKind() {
        M201 m = m201(List.of(l100Const(2, "B1")));             // 상수 재정의 1행 — 복사가 0 == 0 으로 통과하지 않게
        var out = versions.newVersion(req(m.message(), null, "MINOR", null), "MESSAGE");
        assertThat(out.getVer()).isEqualTo("1.001");
        assertThat(out.getVerKind()).isEqualTo("MINOR");
        assertThat(out.getRowVersion()).isZero();
        assertThat(itemRows(m.message(), "1.001")).hasSameSizeAs(itemRows(m.message(), "1"));
        assertThat(constCount(m.message(), "1")).isEqualTo(1);
        assertThat(constCount(m.message(), "1.001")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT CONST_VALUE FROM TB_MDM_LAYOUT_CONST WHERE LAYOUT_ID = ? AND VER = 1.001", String.class,
                m.message())).isEqualTo("B1");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_LAYOUT_HEADER WHERE LAYOUT_ID = ? AND VER = 1.001", Integer.class,
                m.message())).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT TO_CHAR(BASE_VER, 'FM9990.000') FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = 1.001",
                String.class, m.message())).isEqualTo("1.000");
        assertThat(jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = 1.001", String.class,
                m.message())).isEqualTo(KIM);
    }

    @Test
    void secondUnappliedVersionIsRejectedAndFlagsTurnOff() {
        M201 m = m201();
        LayoutMngViewRequest v = new LayoutMngViewRequest();
        v.setLayoutId(m.message());
        Map<String, Object> before = layoutService.view(v);
        assertThat(before.get("canNewMajor")).isEqualTo(true);
        assertThat(before.get("canNewMinor")).isEqualTo(true);
        assertThat(before.get("nextMajor")).isEqualTo("2.000");
        assertThat(before.get("nextMinor")).isEqualTo("1.001");

        versions.newVersion(req(m.message(), null, "MAJOR", null), "MESSAGE");
        BusinessException e = rejected(() -> versions.newVersion(req(m.message(), null, "MINOR", null), "MESSAGE"));
        assertThat(code(e)).isEqualTo("MDM006");
        Map<String, Object> view = layoutService.view(v);
        assertThat(view.get("canNewMajor")).isEqualTo(false);
        assertThat(view.get("canNewMinor")).isEqualTo(false);
        assertThat(view.get("nextMajor")).isNull();
        assertThat(view.get("nextMinor")).isNull();
        assertThat(((Map<?, ?>) view.get("selected")).get("VER")).isEqualTo("2.000");
    }

    @Test
    void versionInApprovalBlocksNewVersionWithMdm006() {
        M201 m = m201();
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, OWN_LENGTH) "
                + "VALUES (?, ?, 'MAJOR', 'REQUESTED', 'kim', TIMESTAMP '2026-01-01 00:00:00', TIMESTAMP '9999-12-31 00:00:00', 0)", m.l110(),
                new BigDecimal("2.000"));
        BusinessException e = rejected(() -> versions.newVersion(req(m.l110(), null, "MAJOR", null), "HEADER"));
        assertThat(code(e)).isEqualTo("MDM006");
        HeaderMngViewRequest v = new HeaderMngViewRequest();
        v.setLayoutId(m.l110());
        v.setVer("1.000");
        Map<String, Object> view = headerService.view(v);
        assertThat(view.get("canNewMajor")).isEqualTo(false);
        assertThat(view.get("canNewMinor")).isEqualTo(false);
    }

    @Test
    void deletingDraftRemovesOnlyThatVersionsRows() {
        M201 m = m201(List.of(l100Const(2, "B1")));
        versions.newVersion(req(m.message(), null, "MINOR", null), "MESSAGE");
        assertThat(constCount(m.message(), "1.001")).isEqualTo(1);
        var out = versions.deleteDraft(req(m.message(), "1.001", null, 0L), "MESSAGE");
        assertThat(out.getVer()).isEqualTo("1.001");
        assertThat(versionRows(m.message())).hasSize(1);
        assertThat(itemRows(m.message(), "1.001")).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_LAYOUT_HEADER WHERE LAYOUT_ID = ? AND VER = 1.001", Integer.class,
                m.message())).isZero();
        assertThat(itemRows(m.message(), "1")).isNotEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_LAYOUT_HEADER WHERE LAYOUT_ID = ? AND VER = 1", Integer.class,
                m.message())).isPositive();
        assertThat(constCount(m.message(), "1.001")).as("DRAFT 의 상수 재정의도 지운다(CONST → HEADER → ITEM)").isZero();
        assertThat(constCount(m.message(), "1")).as("확정본의 상수 재정의는 그대로").isEqualTo(1);
    }

    private int constCount(long layoutId, String ver) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_LAYOUT_CONST WHERE LAYOUT_ID = ? AND VER = ?", Integer.class, layoutId,
                new BigDecimal(ver));
    }

    @Test
    void headerNewVersionWorksTooAndLockNeedsSteward() {
        M201 m = m201();
        var h = versions.newVersion(req(m.l110(), null, "MAJOR", null), "HEADER");
        assertThat(h.getVer()).isEqualTo("2.000");
        assertThat(versions.unlock(req(m.l110(), "2.000", null, 0L), "HEADER").getRowVersion()).isEqualTo(1L);
        user.set("lee", Set.of(MdmRoles.STD_ADMIN));
        BusinessException e = rejected(() -> versions.lock(req(m.l110(), "2.000", null, 1L), "HEADER"));
        assertThat(code(e)).isEqualTo("MDM013");
        assertThat(jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = 2", String.class, m.l110()))
                .isNull();
    }

    @Test
    void lockThenHandoverMovesOwnershipThroughCommonService() {
        M201 m = m201();
        versions.newVersion(req(m.l110(), null, "MINOR", null), "HEADER");
        versions.unlock(req(m.l110(), "1.001", null, 0L), "HEADER");
        assertThat(versions.lock(req(m.l110(), "1.001", null, 1L), "HEADER").getRowVersion()).isEqualTo(2L);
        LayoutVersionRequest handover = req(m.l110(), "1.001", null, 2L);
        handover.setNewOwnerId("nobody");
        BusinessException e = rejected(() -> versions.handover(handover, "HEADER"));
        assertThat(code(e)).isEqualTo("MDM005");
        assertThat(jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = 1.001", String.class,
                m.l110())).isEqualTo(KIM);
        stewards.set(Set.of("park"));
        handover.setNewOwnerId("park");
        assertThat(versions.handover(handover, "HEADER").getRowVersion()).isEqualTo(3L);
        assertThat(jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = 1.001", String.class,
                m.l110())).isEqualTo("park");
    }

    @Test
    void kindMismatchIsRejectedAsNotFound() {
        M201 m = m201();
        BusinessException e = rejected(() -> versions.newVersion(req(m.l110(), null, "MAJOR", null), "MESSAGE"));
        assertThat(e.getMessage()).startsWith("전문 저장 거부: L11");
    }

    @Test
    void cancelConfirmReturnsFutureReleasedToDraftAndReopensPrevious() {
        M201 m = m201();
        versions.newVersion(req(m.message(), null, "MAJOR", null), "MESSAGE");
        release(m.message(), "2.000", "2026-12-01 00:00:00");
        assertThat(versionStore.find(m.message(), new BigDecimal("1.000")).orElseThrow().getApplyTo())
                .isEqualTo(LocalDateTime.of(2026, 12, 1, 0, 0));
        // 화면 위임 경로(layoutMng delete target CONFIRM)
        LayoutVersionRequest cancel = req(m.message(), "2.000", null, 0L);
        cancel.setTarget("CONFIRM");
        var out = layoutService.delete(cancel);
        assertThat(out.getVer()).isEqualTo("2.000");
        assertThat(jdbc.queryForObject("SELECT STATUS FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = 2", String.class,
                m.message())).isEqualTo("DRAFT");
        assertThat(versionStore.find(m.message(), new BigDecimal("1.000")).orElseThrow().getApplyTo())
                .as("직전 RELEASED 의 적용 구간을 다시 연다").isEqualTo(LocalDateTime.of(9999, 12, 31, 0, 0));
        assertThat(LayoutVersions.releasedAt(versionStore.versions(m.message()), DmeTestSupport.NOW).orElseThrow().getVer())
                .isEqualByComparingTo("1.000");
    }

    @Test
    void layoutTargetRejectionsGoThroughCommonEngineWithIntegerObjectId() {
        M201 m = m201();
        versions.newVersion(req(m.message(), null, "MINOR", null), "MESSAGE");      // 1.001 DRAFT, 소유자 kim, rowVersion 0
        // 낡은 rowVersion — MDM001
        assertThat(code(rejected(() -> versions.unlock(req(m.message(), "1.001", null, 5L), "MESSAGE")))).isEqualTo("MDM001");
        LayoutVersionRequest staleHandover = req(m.message(), "1.001", null, 5L);
        staleHandover.setNewOwnerId("park");
        assertThat(code(rejected(() -> versions.handover(staleHandover, "MESSAGE")))).isEqualTo("MDM001");
        // 소유자가 있는 DRAFT 선점 — MDM004(낡은 rowVersion 이면 MDM001)
        assertThat(code(rejected(() -> versions.lock(req(m.message(), "1.001", null, 0L), "MESSAGE")))).isEqualTo("MDM004");
        assertThat(code(rejected(() -> versions.lock(req(m.message(), "1.001", null, 5L), "MESSAGE")))).isEqualTo("MDM001");
        // 소유자가 아닌 사람 — 해제·넘기기·삭제 MDM003
        user.set("lee", Set.of(MdmRoles.STEWARD, MdmRoles.STD_ADMIN));
        assertThat(code(rejected(() -> versions.unlock(req(m.message(), "1.001", null, 0L), "MESSAGE")))).isEqualTo("MDM003");
        LayoutVersionRequest foreignHandover = req(m.message(), "1.001", null, 0L);
        foreignHandover.setNewOwnerId("lee");
        assertThat(code(rejected(() -> versions.handover(foreignHandover, "MESSAGE")))).isEqualTo("MDM003");
        assertThat(code(rejected(() -> versions.deleteDraft(req(m.message(), "1.001", null, 0L), "MESSAGE")))).isEqualTo("MDM003");
        assertThat(jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = 1.001", String.class,
                m.message())).isEqualTo(KIM);
        assertThat(rowVersion(m.message(), "1.001")).isZero();
        // 미래 RELEASED 가 있으면 새 버전 MDM006
        user.set(KIM, Set.of(MdmRoles.STEWARD, MdmRoles.STD_ADMIN));
        versions.deleteDraft(req(m.message(), "1.001", null, 0L), "MESSAGE");
        versions.newVersion(req(m.message(), null, "MAJOR", null), "MESSAGE");
        release(m.message(), "2.000", "2026-12-01 00:00:00");
        assertThat(code(rejected(() -> versions.newVersion(req(m.message(), null, "MINOR", null), "MESSAGE")))).isEqualTo("MDM006");
        LayoutMngViewRequest v = new LayoutMngViewRequest();
        v.setLayoutId(m.message());
        assertThat(layoutService.view(v).get("canNewMajor")).isEqualTo(false);
    }

    @Test
    void minorBoundaryAt999() {
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_ITEM WHERE LAYOUT_ID = 900200");
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = 900200");
        jdbc.update("DELETE FROM TB_MDM_LAYOUT WHERE LAYOUT_ID = 900200");
        jdbc.update("INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, STATUS, VER) VALUES (900200, 'HEADER', 'H999', 'INUSE', 0)");
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, APPLY_FROM, APPLY_TO, OWN_LENGTH) "
                + "VALUES (900200, ?, 'MINOR', 'RELEASED', TIMESTAMP '2026-01-01 00:00:00', TIMESTAMP '9999-12-31 00:00:00', 5)", new BigDecimal("1.999"));
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, VER, SEQ, FILL_KIND, FILLER_LENGTH, \"OFFSET\", \"LENGTH\") "
                + "VALUES (900200, ?, 1, 'FILLER', 5, 0, 5)", new BigDecimal("1.999"));
        BusinessException e = rejected(() -> versions.newVersion(req(900200L, null, "MINOR", null), "HEADER"));
        assertThat(e.getMessage()).contains("major 를 올리십시오");
        assertThat(versions.newVersion(req(900200L, null, "MAJOR", null), "HEADER").getVer()).isEqualTo("2.000");
        assertThat(itemRows(900200L, "2")).hasSize(1);
    }

    // ── Fix round 0 — Ruling P3-11(버전 0개면 빈 1.000)·P3-12(delete target) ──

    @Test
    @SuppressWarnings("unchecked")
    void 유일한_DRAFT_를_지우면_major_1_000_만_켜지고_새_버전은_빈_1_000_DRAFT_다() {
        long header = ((Number) headerService.save(headerReq(uniq("빈 헤더 "), r -> {}), l110Items()).get("layoutId")).longValue();
        versions.deleteDraft(req(header, "1.000", null, 0L), "HEADER");
        assertThat(versionRows(header)).isEmpty();
        assertThat(itemRows(header, "1")).isEmpty();

        HeaderMngViewRequest hv = new HeaderMngViewRequest();
        hv.setLayoutId(header);
        Map<String, Object> empty = headerService.view(hv);
        assertThat(empty.get("selected")).isNull();
        assertThat(empty.get("editable")).isEqualTo(false);
        assertThat((List<?>) empty.get("items")).isEmpty();
        assertThat(empty.get("canNewMajor")).isEqualTo(true);
        assertThat(empty.get("nextMajor")).isEqualTo("1.000");
        assertThat(empty.get("canNewMinor")).isEqualTo(false);
        assertThat(empty.get("nextMinor")).isNull();

        BusinessException minor = rejected(() -> versions.newVersion(req(header, null, "MINOR", null), "HEADER"));
        assertThat(code(minor)).isEqualTo("MDM021");
        var out = versions.newVersion(req(header, null, "MAJOR", null), "HEADER");
        assertThat(out.getVer()).isEqualTo("1.000");
        assertThat(out.getVerKind()).isEqualTo("MAJOR");
        assertThat(versionRows(header)).singleElement().satisfies(r -> {
            assertThat(r.get("STATUS")).isEqualTo("DRAFT");
            assertThat(r.get("OWNER_ID")).isEqualTo(KIM);
            assertThat(((Number) r.get("OWN_LENGTH")).intValue()).isZero();
        });
        assertThat(jdbc.queryForObject("SELECT BASE_VER FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ?", Object.class, header)).isNull();
        assertThat(itemRows(header, "1")).isEmpty();
        Map<String, Object> after = headerService.view(hv);
        assertThat(after.get("editable")).isEqualTo(true);
        assertThat(((Map<String, Object>) after.get("selected")).get("VER")).isEqualTo("1.000");

        // 전문도 같다 — 버전이 없으면 빈 화면과 major 1.000
        long msg = saveLayout(layoutReq(uniq("빈 전문 "), null, r -> {}), List.of(), List.of(), m201Items());
        versions.deleteDraft(req(msg, "1.000", null, 0L), "MESSAGE");
        LayoutMngViewRequest lv = new LayoutMngViewRequest();
        lv.setLayoutId(msg);
        Map<String, Object> emptyMsg = layoutService.view(lv);
        assertThat(emptyMsg.get("selected")).isNull();
        assertThat((List<?>) emptyMsg.get("items")).isEmpty();
        assertThat(emptyMsg.get("canNewMajor")).isEqualTo(true);
        assertThat(emptyMsg.get("nextMajor")).isEqualTo("1.000");
        assertThat(versions.newVersion(req(msg, null, null, null), "MESSAGE").getVer()).isEqualTo("1.000");
        assertThat(itemRows(msg, "1")).isEmpty();
    }

    @Test
    void delete_target_은_VERSION_CONFIRM_만_받고_그_밖은_INVALID_VALUE_다() {
        M201 m = m201();
        versions.newVersion(req(m.l110(), null, "MINOR", null), "HEADER");
        LayoutVersionRequest bad = req(m.l110(), "1.001", null, 0L);
        bad.setTarget("SET");
        BusinessException e = rejected(() -> headerService.delete(bad));
        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE);
        assertThat(draftVer(m.l110())).isEqualTo("1.001");
        LayoutVersionRequest ok = req(m.l110(), "1.001", null, 0L);
        ok.setTarget("VERSION");
        assertThat(headerService.delete(ok).getVer()).isEqualTo("1.001");
        assertThat(draftVer(m.l110())).isNull();
        // target 이 비면 VERSION(기본) — 화면 위임 경로(layoutMng)
        versions.newVersion(req(m.message(), null, "MINOR", null), "MESSAGE");
        LayoutVersionRequest blank = req(m.message(), "1.001", null, 0L);
        assertThat(layoutService.delete(blank).getVer()).isEqualTo("1.001");
        assertThat(draftVer(m.message())).isNull();
    }

    // ── 팀장 메모(Task 5 보고) — 프런트 계약 맞춤 ──

    @Test
    void headerSaveReturnsOwnLengthAndLayoutViewHeadersCarryHeaderVersion() {
        Map<String, Object> saved = headerService.save(headerReq(uniq("길이 헤더 "), r -> {}), l110Items());
        assertThat(saved.get("ownLength")).isEqualTo(saved.get("totalLength"));
        assertThat(((Number) saved.get("ownLength")).intValue()).isPositive();

        M201 m = m201();
        LayoutMngViewRequest v = new LayoutMngViewRequest();
        v.setLayoutId(m.message());
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> headers = (List<Map<String, Object>>) layoutService.view(v).get("headers");
        assertThat(headers).isNotEmpty().allSatisfy(row -> {
            assertThat(row.get("HEADER_VER")).isEqualTo("1.000");
            assertThat(row.get("HEADER_STATE")).isEqualTo("CURRENT");
        });
    }
}
