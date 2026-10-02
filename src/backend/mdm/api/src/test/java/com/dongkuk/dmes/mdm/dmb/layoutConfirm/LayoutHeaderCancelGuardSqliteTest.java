package com.dongkuk.dmes.mdm.dmb.layoutConfirm;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dmb.LayoutServiceTestSupport;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutComposer;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutReleaseTimeline;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionService;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto.LayoutConfirmRequest;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.service.LayoutConfirmService;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutVersionRequest;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * D-144 3단계 Ruling P3-22 — 헤더 확정 취소가 그 헤더를 쌓은 RELEASED(현재·미래) 전문 버전의 적용 구간 합성을 깨면 거부한다(MDM028). 그대로
 * 두면 메타 피드가 그 전문 키 전체를 failed 로 낸다(R4). 지금 시계는 2026-06-15 09:00.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class LayoutHeaderCancelGuardSqliteTest extends LayoutServiceTestSupport {

    static final String F_H = "2026-08-01 00:00:00";
    static final String F_M = "2026-09-01 00:00:00";

    @Autowired LayoutConfirmService confirmService;
    @Autowired LayoutVersionService versions;
    @Autowired LayoutReleaseTimeline timeline;
    @Autowired LayoutComposer composer;
    @Autowired PlatformTransactionManager transactionManager;

    @BeforeEach
    void setUp() {
        dictionary();
    }

    private void confirm(long id, String ver, String applyFrom) {
        LayoutConfirmRequest r = new LayoutConfirmRequest();
        r.setLayoutId(id);
        r.setVer(ver);
        r.setRowVersion(rowVersion(id, ver));
        r.setApplyFrom(applyFrom);
        r.setWarningsAcknowledged(true);
        new TransactionTemplate(transactionManager).execute(s -> confirmService.confirm(r));
    }

    private void cancel(long id, String ver, String kind) {
        LayoutVersionRequest r = new LayoutVersionRequest();
        r.setLayoutId(id);
        r.setVer(ver);
        r.setRowVersion(rowVersion(id, ver));
        versions.cancelConfirm(r, kind);
    }

    private String status(long id, String ver) {
        return jdbc.queryForObject("SELECT STATUS FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = ?", String.class, id,
                new java.math.BigDecimal(ver));
    }

    private static String code(BusinessException e) {
        return e.getErrors() == null || e.getErrors().isEmpty() ? e.getErrorCode().name() : e.getErrors().get(0).code();
    }

    /** M201 전문의 새 minor DRAFT 를 판정 시각 asOf 로 저장해 헤더 h 를(L110 대신) 쌓는다. */
    private String messageDraftStacking(M201 m, long h, String asOf) {
        LayoutVersionRequest r = new LayoutVersionRequest();
        r.setLayoutId(m.message());
        r.setVerKind("MINOR");
        String ver = versions.newVersion(r, "MESSAGE").getVer();
        layoutService.save(layoutReq((String) layoutRow(m.message()).get("LAYOUT_NAME"), m.eai(), q -> {
            q.setLayoutId(m.message());
            q.setVer(ver);
            q.setRowVersion(0L);
            q.setAsOf(asOf);
        }), List.of(headerRow(h)), List.of(), m201Items());
        return ver;
    }

    /** 검토 지적 1 의 1~4 경로 — 4(헤더 확정 취소)가 거부되고, 전문 미래 버전을 먼저 취소하면 허용된다. */
    @Test
    void cancellingFutureHeaderUsedByFutureMessageVersionIsRejected() {
        M201 m = m201();
        long h = saveHeader(headerReq(uniq("새 구간 헤더 "), r -> {}), l110Items());
        confirm(h, "1.000", F_H);                                  // 1. 새 헤더 H 1.000 을 미래 F_H 로 확정
        String mv = messageDraftStacking(m, h, F_H);               // 2. M 의 새 DRAFT 를 asOf = F_H 로 저장해 H 를 쌓는다
        confirm(m.message(), mv, F_M);                             // 3. M 을 F_M(≥ F_H)로 확정
        assertThat(timeline.released(m.message())).hasSize(2);    // 피드 기준으로 지금은 전 구간이 합성된다

        BusinessException e = rejected(() -> cancel(h, "1.000", "HEADER")); // 4. H 확정 취소
        assertThat(code(e)).isEqualTo("MDM028");
        assertThat(e.getMessage()).contains("(" + m.message() + ") v" + mv).contains("먼저 그 전문 버전의 확정을 취소하세요");
        assertThat(e.getErrors()).anySatisfy(d -> {
            assertThat(d.code()).isEqualTo("LAYOUT_UNCOMPOSABLE");
            assertThat(d.message()).contains(F_M);
        });
        // 취소 전체가 되돌아갔다 — H 는 그대로 RELEASED, 피드도 그대로 합성된다
        assertThat(status(h, "1.000")).isEqualTo("RELEASED");
        assertThat(timeline.released(m.message())).hasSize(2);

        // 안내대로 전문 미래 버전을 먼저 취소하면 헤더 취소가 된다
        cancel(m.message(), mv, "MESSAGE");
        cancel(h, "1.000", "HEADER");
        assertThat(status(h, "1.000")).isEqualTo("DRAFT");
        assertThat(timeline.released(m.message())).hasSize(1);
    }

    /** 직전 RELEASED 헤더 버전이 있으면 취소가 그 구간을 다시 열어 전문이 계속 합성된다 — 허용. */
    @Test
    void cancellingWhenPreviousHeaderVersionReopensIsAllowed() {
        M201 m = m201();
        LayoutVersionRequest r = new LayoutVersionRequest();
        r.setLayoutId(m.l110());
        r.setVerKind("MINOR");
        String hv = versions.newVersion(r, "HEADER").getVer();
        confirm(m.l110(), hv, F_H);                                // L110 1.001 을 미래 F_H 로(1.000 은 F_H 에 닫힌다)
        String mv = messageDraftStacking(m, m.l110(), F_H);
        confirm(m.message(), mv, F_M);

        cancel(m.l110(), hv, "HEADER");                            // 1.000 이 다시 열린다
        assertThat(status(m.l110(), hv)).isEqualTo("DRAFT");
        assertThat(timeline.released(m.message())).hasSize(2);
        assertThat(composer.headerAt(m.l110(), LocalDateTime.of(2026, 9, 2, 0, 0)).orElseThrow().getVer())
                .isEqualByComparingTo("1.000");
    }

    /** 이 헤더를 쌓은 RELEASED 전문 버전이 없으면 막을 것이 없다 — 허용. DRAFT 전문만 쌓아도 허용(합성은 확정 검사가 다시 본다). */
    @Test
    void cancellingHeaderNoReleasedMessageUsesIsAllowed() {
        M201 m = m201();
        long h = saveHeader(headerReq(uniq("아무도 안 쓰는 헤더 "), r -> {}), l110Items());
        confirm(h, "1.000", F_H);
        messageDraftStacking(m, h, F_H); // DRAFT 로만 쌓는다
        cancel(h, "1.000", "HEADER");
        assertThat(status(h, "1.000")).isEqualTo("DRAFT");
    }
}
