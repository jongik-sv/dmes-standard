package com.dongkuk.dmes.mdm.dmb.layoutConfirm;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dmb.LayoutServiceTestSupport;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutComposer;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionService;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto.LayoutConfirmRequest;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto.LayoutConfirmSearchRequest;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto.LayoutConfirmValidateRequest;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto.LayoutConfirmViewRequest;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.service.LayoutConfirmService;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutVersionRequest;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * D-144 3단계 — 확정 때 변경 분류·전환 방식·본문 스냅샷을 남기고, 동시 전환은 확인해야 확정된다.
 *
 * <p>확정은 운영에서 OASIS action 한 건의 트랜잭션 안에서 돈다(F11 — dmb 는 {@code TransactionTemplate} 을 쓰지 않는다, I19). 서비스를 직접
 * 부르는 이 시험은 같은 경계를 시험 쪽 {@link TransactionTemplate} 으로 만든다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class LayoutConfirmSqliteTest extends LayoutServiceTestSupport {

    static final String JUL1 = "2026-07-01 00:00:00";

    @Autowired LayoutConfirmService confirmService;
    @Autowired LayoutVersionService versions;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired LayoutComposer composer;

    @BeforeEach
    void setUp() {
        dictionary();
    }

    /** MdmErrors 의 코드는 message 가 아니라 첫 detail 에 있다(message 는 기본 문구로 시작 — TSK-04-04 I25). */
    private static String code(BusinessException e) {
        return e.getErrors() == null || e.getErrors().isEmpty() ? e.getErrorCode().name() : e.getErrors().get(0).code();
    }

    private String newMinor(long id, String kind) {
        LayoutVersionRequest r = new LayoutVersionRequest();
        r.setLayoutId(id);
        r.setVerKind("MINOR");
        return versions.newVersion(r, kind).getVer();
    }

    /** M201 본문 마지막 여분 25 를 추가 항목 3 + 여분 22 로 쪼갠다(순차 전환). */
    private void saveFillerSplit(M201 m, String ver) {
        List<Map<String, Object>> items = new ArrayList<>(m201Items().subList(0, 3));
        items.add(item("DATA", "EXTRA_3", null));
        items.add(filler(22));
        layoutService.save(layoutReq("출측검사 실적 수신", m.eai(), r -> {
            r.setLayoutId(m.message());
            r.setVer(ver);
            r.setRowVersion(rowVersion(m.message(), ver));
        }), List.of(headerRow(m.l110())), List.of(), numbered(items));
    }

    private Map<String, Object> validate(long id, String ver, String applyFrom) {
        LayoutConfirmValidateRequest r = new LayoutConfirmValidateRequest();
        r.setLayoutId(id);
        r.setVer(ver);
        r.setApplyFrom(applyFrom);
        return confirmService.validate(r);
    }

    /** OASIS action 한 건처럼 한 트랜잭션 — 확정·분류·본문 스냅샷 기록이 함께 커밋되거나 함께 되돌아간다. */
    private Map<String, Object> confirm(long id, String ver, String applyFrom, boolean ack) {
        LayoutConfirmRequest r = new LayoutConfirmRequest();
        r.setLayoutId(id);
        r.setVer(ver);
        r.setRowVersion(rowVersion(id, ver));
        r.setApplyFrom(applyFrom);
        r.setWarningsAcknowledged(ack);
        return new TransactionTemplate(transactionManager).execute(s -> confirmService.confirm(r));
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> checks(Map<String, Object> validated) {
        return (List<Map<String, Object>>) validated.get("checks");
    }

    @Test
    void fillerSplitConfirmsSequentiallyAndStoresBodyOnlySnapshot() {
        M201 m = m201();
        String ver = newMinor(m.message(), "MESSAGE");
        saveFillerSplit(m, ver);
        Map<String, Object> checked = validate(m.message(), ver, JUL1);
        assertThat(checked.get("simultaneous")).isEqualTo(false);
        assertThat(checks(checked)).isEmpty();
        Map<String, Object> out = confirm(m.message(), ver, JUL1, false);
        assertThat(out.get("switchMode")).isEqualTo("SEQUENTIAL");
        assertThat(out.get("changeKinds")).isEqualTo("FILLER_SPLIT");
        assertThat(out.get("closedPreviousVer")).isEqualTo("1.000");
        assertThat(out.get("ver")).isEqualTo("1.001");
        Map<String, Object> row = jdbc.queryForMap("SELECT STATUS, APPLY_FROM, SWITCH_MODE, CHANGE_KINDS, SNAPSHOT_JSON FROM TB_MDM_LAYOUT_VER "
                + "WHERE LAYOUT_ID = ? AND VER = 1.001", m.message());
        assertThat(row.get("STATUS")).isEqualTo("RELEASED");
        assertThat(row.get("APPLY_FROM")).isEqualTo(JUL1);
        assertThat(row.get("SWITCH_MODE")).isEqualTo("SEQUENTIAL");
        assertThat(row.get("CHANGE_KINDS")).isEqualTo("FILLER_SPLIT");
        assertThat((String) row.get("SNAPSHOT_JSON")).contains("\"headerIds\"").doesNotContain("\"headers\"");
        assertThat(jdbc.queryForObject("SELECT APPLY_TO FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = 1", String.class, m.message()))
                .isEqualTo(JUL1);
    }

    @Test
    void itemLengthChangeNeedsSimultaneousAcknowledgement() {
        M201 m = m201();
        String ver = newMinor(m.message(), "MESSAGE");
        List<Map<String, Object>> items = new ArrayList<>(m201Items());
        items.set(3, filler(30));
        layoutService.save(layoutReq("출측검사 실적 수신", m.eai(), r -> {
            r.setLayoutId(m.message());
            r.setVer(ver);
            r.setRowVersion(0L);
        }), List.of(headerRow(m.l110())), List.of(), numbered(items));
        Map<String, Object> checked = validate(m.message(), ver, JUL1);
        assertThat(checked.get("simultaneous")).isEqualTo(true);
        assertThat(checks(checked)).anySatisfy(c -> {
            assertThat(c.get("severity")).isEqualTo("WARNING");
            assertThat(c.get("code")).isEqualTo("SIMULTANEOUS_SWITCH");
            assertThat((String) c.get("message")).contains("송신·수신").contains(JUL1);
        });
        @SuppressWarnings("unchecked")
        Map<String, Object> change = (Map<String, Object>) checked.get("change");
        assertThat(change.get("switchMode")).isEqualTo("SIMULTANEOUS");
        assertThat((List<?>) change.get("kinds")).isNotEmpty();
        // 경고를 확인하지 않으면 공통 엔진이 MDM014 로 막는다 — 확정은 되돌아가 DRAFT 그대로
        BusinessException e = rejected(() -> confirm(m.message(), ver, JUL1, false));
        assertThat(code(e)).isEqualTo("MDM014");
        assertThat(jdbc.queryForObject("SELECT STATUS FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = 1.001", String.class,
                m.message())).isEqualTo("DRAFT");
        assertThat(confirm(m.message(), ver, JUL1, true).get("switchMode")).isEqualTo("SIMULTANEOUS");
    }

    @Test
    void stackedHeaderWithoutReleaseAtApplyFromBlocksConfirm() {
        M201 m = m201();
        long h = saveHeader(headerReq(uniq("확정 전 헤더 "), r -> {}), l110Items()); // 1.000 DRAFT 그대로
        Map<String, Object> out = layoutService.save(layoutReq(uniq("새 헤더 쓰는 전문 "), m.eai(), r -> {}),
                List.of(headerRow(m.l110())), List.of(), m201Items());
        long id = ((Number) out.get("layoutId")).longValue();
        // 저장 시점 검사는 지금 시각 기준이라 통과했다 — 쌓은 헤더를 확정 안 된 헤더로 바꿔 넣는다
        jdbc.update("UPDATE TB_MDM_LAYOUT_HEADER SET HEADER_LAYOUT_ID = ? WHERE LAYOUT_ID = ? AND HEADER_LAYOUT_ID = ?", h, id, m.l110());
        Map<String, Object> checked = validate(id, "1.000", JUL1);
        assertThat(checks(checked)).anySatisfy(c -> {
            assertThat(c.get("severity")).isEqualTo("ERROR");
            assertThat(c.get("code")).isEqualTo("L09");
        });
        assertThat(checked.get("change")).isNull();
        assertThat(code(rejected(() -> confirm(id, "1.000", JUL1, true)))).isEqualTo("MDM010");
    }

    @Test
    void firstConfirmPromotesParentAndOnlyStewardsConfirm() {
        M201 m = m201();
        Map<String, Object> out = layoutService.save(layoutReq(uniq("첫 확정 "), m.eai(), r -> {}), List.of(headerRow(m.l110())),
                List.of(), m201Items());
        long id = ((Number) out.get("layoutId")).longValue();
        user.set(KIM, Set.of(MdmRoles.STD_ADMIN));
        assertThat(code(rejected(() -> confirm(id, "1.000", "2026-06-01 00:00:00", true)))).isEqualTo("MDM013");
        user.set(KIM, Set.of(MdmRoles.STEWARD));
        Map<String, Object> done = confirm(id, "1.000", "2026-06-01 00:00:00", true);
        assertThat(done.get("closedPreviousVer")).isNull();
        assertThat(done.get("changeKinds")).isEqualTo("INITIAL");
        assertThat(layoutRow(id).get("STATUS")).isEqualTo("INUSE");
    }

    @Test
    void headerConstDefaultOnlyChangeIsSequential() {
        M201 m = m201();
        String ver = newMinor(m.l110(), "HEADER");
        List<Map<String, Object>> items = l110Items();
        items.get(0).put("DEFAULT_VALUE", "B2");
        headerService.save(headerReq("L2 구간 헤더", r -> {
            r.setLayoutId(m.l110());
            r.setVer(ver);
            r.setRowVersion(0L);
        }), items);
        Map<String, Object> checked = validate(m.l110(), ver, JUL1);
        assertThat(checks(checked)).isEmpty();
        assertThat(confirm(m.l110(), ver, JUL1, false).get("switchMode")).isEqualTo("SEQUENTIAL");
        assertThat(versionRows(m.message())).hasSize(1); // 헤더 확정은 전문 버전을 만들지 않는다(I18 폐지)
    }

    // ── Ruling P3-15 — EAI 표준 헤더는 시각 T 에 RELEASED 인 헤더 버전의 EAI_CODE 로 해석한다(확정이 TB_MDM_EAI 연결을 옮기지 않는다) ──

    static final String AUG1 = "2026-08-01 00:00:00";

    /** 새 전문을 저장(지금 시각 = 시계)하고 저장된 헤더 구성(SEQ 순) — I14 가 끼운 EAI 표준 헤더를 본다. */
    private List<Long> stackOfNewMessage(M201 m) {
        Map<String, Object> out = layoutService.save(layoutReq(uniq("표준 헤더 확인 "), m.eai(), r -> {}), List.of(headerRow(m.l110())),
                List.of(), m201Items());
        long id = ((Number) out.get("layoutId")).longValue();
        return jdbc.queryForList("SELECT HEADER_LAYOUT_ID FROM TB_MDM_LAYOUT_HEADER WHERE LAYOUT_ID = ? ORDER BY SEQ", Long.class, id);
    }

    private Long eaiColumn(String eai) {
        return jdbc.queryForObject("SELECT HEADER_LAYOUT_ID FROM TB_MDM_EAI WHERE EAI_CODE = ?", Long.class, eai);
    }

    @Test
    @SuppressWarnings("unchecked")
    void futureHeaderClaimBecomesEaiStandardHeaderOnlyFromApplyFrom() {
        M201 m = m201();
        long claimer = saveHeader(headerReq(uniq("새 표준 헤더 "), r -> r.setEaiCode(m.eai())), l100Items());
        Map<String, Object> checked = validate(claimer, "1.000", AUG1);
        assertThat((List<Object>) checked.get("eais")).containsExactly(m.eai()); // 이 버전이 apply_from 부터 표준 헤더가 될 EAI
        confirm(claimer, "1.000", AUG1, true);

        assertThat(composer.eaiHeaderAt(m.eai(), LocalDateTime.of(2026, 7, 31, 23, 59, 59))).contains(m.l100());
        assertThat(composer.eaiHeaderAt(m.eai(), LocalDateTime.of(2026, 8, 1, 0, 0, 0))).contains(claimer);
        assertThat(eaiColumn(m.eai())).isNull(); // 옛 칼럼은 확정도 시험 도우미도 쓰지 않는다
        // 실제 소비자(I14) — 적용 시각 전 저장은 옛 헤더를, 뒤 저장은 새 헤더를 맨 앞에 끼운다
        assertThat(stackOfNewMessage(m)).containsExactly(m.l100(), m.l110());
        clock.setLocal(LocalDateTime.of(2026, 8, 2, 9, 0, 0));
        assertThat(stackOfNewMessage(m)).containsExactly(claimer, m.l110());
    }

    @Test
    void cancelConfirmOfFutureHeaderClaimLeavesOldStandardHeader() {
        M201 m = m201();
        long claimer = saveHeader(headerReq(uniq("취소할 표준 헤더 "), r -> r.setEaiCode(m.eai())), l100Items());
        confirm(claimer, "1.000", AUG1, true);
        assertThat(composer.eaiHeaderAt(m.eai(), LocalDateTime.of(2026, 8, 1, 0, 0, 0))).contains(claimer);

        LayoutVersionRequest cancel = new LayoutVersionRequest();
        cancel.setLayoutId(claimer);
        cancel.setVer("1.000");
        cancel.setRowVersion(rowVersion(claimer, "1.000"));
        versions.cancelConfirm(cancel, "HEADER");

        assertThat(composer.eaiHeaderAt(m.eai(), LocalDateTime.of(2026, 8, 1, 0, 0, 0))).contains(m.l100());
        assertThat(eaiColumn(m.eai())).isNull();
        clock.setLocal(LocalDateTime.of(2026, 8, 2, 9, 0, 0));
        assertThat(stackOfNewMessage(m)).containsExactly(m.l100(), m.l110());
    }

    /** 헤더 minor 새 버전에서 EAI 를 바꿔(비우면 null) 저장한다. */
    private String headerMinorWithEai(long headerId, String eai) {
        String ver = newMinor(headerId, "HEADER");
        Map<String, Object> current = layoutRow(headerId);
        headerService.save(headerReq((String) current.get("LAYOUT_NAME"), r -> {
            r.setLayoutId(headerId);
            r.setVer(ver);
            r.setRowVersion(0L);
            r.setEaiCode(eai);
        }), l100Items());
        return ver;
    }

    /** 검토 ③ — 표준 헤더가 EAI 를 내려놓으면 그 시각부터 앞서 주장하던 RELEASED 헤더로 돌아가고, 그 확정을 취소하면 다시 돌아온다. */
    @Test
    void headerDroppingEaiFallsBackToPreviousClaimerAndCancelRestoresIt() {
        M201 m = m201();
        long claimer = saveHeader(headerReq(uniq("넘겨받는 헤더 "), r -> r.setEaiCode(m.eai())), l100Items());
        confirm(claimer, "1.000", "2026-06-01 00:00:00", true); // 지금(06-15) 적용 중 — 새 버전을 만들 수 있게
        String dropped = headerMinorWithEai(claimer, null);
        Map<String, Object> out = confirm(claimer, dropped, AUG1, true);
        // 헤더의 EAI 바꿈은 변경 분류 META(순차)로 남는다(Ruling P3-18)
        assertThat(out.get("switchMode")).isEqualTo("SEQUENTIAL");
        assertThat(out.get("changeKinds")).isEqualTo("META");
        assertThat((String) out.get("changeSummary")).contains("EAI 표준 헤더 주장 " + m.eai() + " → 없음");

        assertThat(composer.eaiHeaderAt(m.eai(), LocalDateTime.of(2026, 7, 31, 23, 59, 59))).contains(claimer);
        assertThat(composer.eaiHeaderAt(m.eai(), LocalDateTime.of(2026, 8, 1, 0, 0, 0))).contains(m.l100());

        LayoutVersionRequest cancel = new LayoutVersionRequest();
        cancel.setLayoutId(claimer);
        cancel.setVer(dropped);
        cancel.setRowVersion(rowVersion(claimer, dropped));
        versions.cancelConfirm(cancel, "HEADER");
        assertThat(composer.eaiHeaderAt(m.eai(), LocalDateTime.of(2026, 8, 1, 0, 0, 0))).contains(claimer);
        clock.setLocal(LocalDateTime.of(2026, 8, 2, 9, 0, 0));
        assertThat(stackOfNewMessage(m)).containsExactly(claimer, m.l110());
    }

    @Test
    @SuppressWarnings("unchecked")
    void headerEaiChangeIsClassifiedAsMeta() {
        M201 m = m201();
        String other = uniq("H");
        jdbc.update("INSERT INTO TB_MDM_EAI (EAI_CODE, EAI_NAME, ENCODING) VALUES (?, ?, 'UTF-8')", other, "다른 EAI " + other);
        String ver = headerMinorWithEai(m.l100(), other);
        Map<String, Object> change = (Map<String, Object>) validate(m.l100(), ver, JUL1).get("change");
        assertThat(change.get("switchMode")).isEqualTo("SEQUENTIAL");
        assertThat((List<Object>) change.get("kinds")).containsExactly("META"); // 인코딩이 달라도 헤더 쪽 FORMAT 은 아니다
        assertThat((String) change.get("summary")).contains("EAI 표준 헤더 주장 " + m.eai() + " → " + other);
    }

    @Test
    void blankApplyFromIsRejectedBeforeChecks() {
        M201 m = m201();
        String ver = newMinor(m.message(), "MESSAGE");
        for (String blank : new String[] {null, "", "  "}) {
            BusinessException e = rejected(() -> validate(m.message(), ver, blank));
            assertThat(e.getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE);
            assertThat(e.getErrors()).anySatisfy(d -> assertThat(d.field()).isEqualTo("applyFrom"));
        }
        assertThat(rejected(() -> validate(m.message(), ver, "2026/07/01")).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE);
        assertThat(rejected(() -> confirm(m.message(), ver, "", true)).getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE);
    }

    @Test
    void confirmOutsideActionTransactionIsRefusedBeforeEngine() {
        M201 m = m201();
        String ver = newMinor(m.message(), "MESSAGE");
        LayoutConfirmRequest r = new LayoutConfirmRequest();
        r.setLayoutId(m.message());
        r.setVer(ver);
        r.setRowVersion(rowVersion(m.message(), ver));
        r.setApplyFrom(JUL1);
        r.setWarningsAcknowledged(true);
        // 엔진이 제 트랜잭션을 먼저 커밋하면 분류·스냅샷 없는 RELEASED 가 남는다 — 트랜잭션 밖 호출은 아무것도 바꾸기 전에 막는다
        org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class, () -> confirmService.confirm(r));
        assertThat(jdbc.queryForObject("SELECT STATUS FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = 1.001", String.class,
                m.message())).isEqualTo("DRAFT");
    }

    @Test
    void validateReportsApplyFromOrderAndFutureFlag() {
        M201 m = m201();
        String ver = newMinor(m.message(), "MESSAGE");
        @SuppressWarnings("unchecked")
        Map<String, Object> early = (Map<String, Object>) validate(m.message(), ver, "2026-01-15 00:00:00").get("applyFromCheck");
        assertThat(early.get("ok")).isEqualTo(false);
        assertThat(early.get("message")).isNotNull();
        Map<String, Object> later = validate(m.message(), ver, JUL1);
        assertThat(((Map<?, ?>) later.get("applyFromCheck")).get("ok")).isEqualTo(true);
        assertThat(later.get("futureApplyFrom")).isEqualTo(true);
        assertThat(validate(m.message(), ver, "2026-06-01 00:00:00").get("futureApplyFrom")).isEqualTo(false);
    }

    @Test
    @SuppressWarnings("unchecked")
    void searchListsDraftsAndViewPicksDraftWithPrevious() {
        M201 m = m201();
        String ver = newMinor(m.message(), "MESSAGE");
        LayoutConfirmSearchRequest s = new LayoutConfirmSearchRequest();
        s.setKeyword("출측검사");
        List<Map<String, Object>> rows = (List<Map<String, Object>>) confirmService.search(s).get("rows");
        assertThat(rows).anySatisfy(r -> {
            assertThat(((Number) r.get("LAYOUT_ID")).longValue()).isEqualTo(m.message());
            assertThat(r.get("LAYOUT_KIND")).isEqualTo("MESSAGE");
            assertThat(r.get("VER")).isEqualTo("1.001");
            assertThat(r.get("VER_KIND")).isEqualTo("MINOR");
            assertThat(r.get("OWNER_ID")).isEqualTo(KIM);
            assertThat(r.get("BASE_VER")).isEqualTo("1.000");
            assertThat(r).containsKeys("LAYOUT_NAME", "ROW_VERSION");
        });
        assertThat(rows).noneSatisfy(r -> assertThat(((Number) r.get("LAYOUT_ID")).longValue()).isEqualTo(m.l100()));

        LayoutConfirmViewRequest v = new LayoutConfirmViewRequest();
        v.setLayoutId(m.message());
        Map<String, Object> view = confirmService.view(v);
        assertThat(((Map<String, Object>) view.get("layout")).get("LAYOUT_KIND")).isEqualTo("MESSAGE");
        assertThat(((Map<String, Object>) view.get("version")).get("VER")).isEqualTo(ver);
        assertThat(((Map<String, Object>) view.get("version")).get("STATUS")).isEqualTo("DRAFT");
        Map<String, Object> previous = (Map<String, Object>) view.get("previous");
        assertThat(previous.get("VER")).isEqualTo("1.000");
        assertThat(previous.get("APPLY_FROM")).isEqualTo(MESSAGE_FROM);
        assertThat(view.get("firstVersion")).isEqualTo(false);

        v.setLayoutId(m.l110());
        v.setVer("1.000");
        Map<String, Object> header = confirmService.view(v);
        assertThat(((Map<String, Object>) header.get("layout")).get("LAYOUT_KIND")).isEqualTo("HEADER");
        assertThat(header.get("previous")).isNull();
        assertThat(header.get("firstVersion")).isEqualTo(true);
    }
}
