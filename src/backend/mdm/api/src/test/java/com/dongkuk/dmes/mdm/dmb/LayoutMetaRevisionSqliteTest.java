package com.dongkuk.dmes.mdm.dmb;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevisionRecorder;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionService;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto.LayoutConfirmRequest;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.service.LayoutConfirmService;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutVersionRequest;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 레이아웃 메타 변경 기록(spec 2026-10-02-mdm-meta-cache-design §3.3, ADR-0007) — 피드 값이 바뀌는 쓰기에만 한 번 기록한다.
 * 확정·확정 취소는 공통 엔진({@code DefaultVersionStateService.record})의 LAYOUT 분기 한 곳에서 기록하고, 헤더면 그 헤더를 쌓은 전문까지
 * 펼친다. DRAFT 저장·새 버전은 기록하지 않되, 버전 무관 부모 칸(이름·송수신 시스템)이 RELEASED 가 있는 레이아웃에서 바뀌면 기록한다.
 *
 * 컬럼·도메인 저장은 그 물리명을 쓰는 RELEASED 전문(헤더면 쌓은 전문까지)도 LAYOUT 키로 펼친다 — 합성의 타입·단위·소수가 사전에서 온다(검토 I1).
 *
 * <p>확정은 운영에서 OASIS action 한 건의 트랜잭션 안에서 돈다 — 시험은 같은 경계를 {@link TransactionTemplate} 으로 만든다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class LayoutMetaRevisionSqliteTest extends LayoutServiceTestSupport {

    static final String JUL1 = "2026-07-01 00:00:00";
    static final String AUG1 = "2026-08-01 00:00:00";

    @Autowired LayoutConfirmService confirmService;
    @Autowired LayoutVersionService versions;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired MetaRevisionRecorder recorder;

    @BeforeEach
    void setUp() {
        dictionary();
    }

    private String newMinor(long id, String kind) {
        LayoutVersionRequest r = new LayoutVersionRequest();
        r.setLayoutId(id);
        r.setVerKind("MINOR");
        return versions.newVersion(r, kind).getVer();
    }

    private String name(long id) {
        return (String) layoutRow(id).get("LAYOUT_NAME");
    }

    /** 전문 DRAFT 저장 — 본문은 M201 그대로, 이름만 고를 수 있다(송수신 시스템은 layoutReq 기본 L2 → MES). */
    private void saveMessage(M201 m, String ver, String layoutName) {
        saveMessage(m, ver, layoutName, "L2", "MES");
    }

    private void saveMessage(M201 m, String ver, String layoutName, String sndSystem, String rcvSystem) {
        layoutService.save(layoutReq(layoutName, m.eai(), r -> {
            r.setLayoutId(m.message());
            r.setVer(ver);
            r.setRowVersion(rowVersion(m.message(), ver));
            r.setSndSystem(sndSystem);
            r.setRcvSystem(rcvSystem);
        }), List.of(headerRow(m.l110())), List.of(), m201Items());
    }

    private void saveL110Draft(M201 m, String ver, String headerName) {
        List<Map<String, Object>> items = l110Items();
        items.get(0).put("DEFAULT_VALUE", "B2");
        headerService.save(headerReq(headerName, r -> {
            r.setLayoutId(m.l110());
            r.setVer(ver);
            r.setRowVersion(rowVersion(m.l110(), ver));
        }), items);
    }

    private void confirm(long id, String ver, String applyFrom) {
        LayoutConfirmRequest r = new LayoutConfirmRequest();
        r.setLayoutId(id);
        r.setVer(ver);
        r.setRowVersion(rowVersion(id, ver));
        r.setApplyFrom(applyFrom);
        r.setWarningsAcknowledged(true);
        new TransactionTemplate(transactionManager).executeWithoutResult(s -> confirmService.confirm(r));
    }

    private static String row(long layoutId) {
        return "LAYOUT:" + layoutId + ":SAVE";
    }

    @Test
    void 새_버전과_부모_칸이_그대로인_DRAFT_저장은_기록하지_않는다() {
        M201 m = m201();
        MetaRevTestSupport.clear(jdbc);

        String ver = newMinor(m.message(), "MESSAGE");
        saveMessage(m, ver, name(m.message()));
        String headerVer = newMinor(m.l110(), "HEADER");
        saveL110Draft(m, headerVer, name(m.l110()));

        assertThat(MetaRevTestSupport.rows(jdbc)).isEmpty();
    }

    @Test
    void 전문_확정은_그_전문_하나를_한_번_기록한다() {
        M201 m = m201();
        String ver = newMinor(m.message(), "MESSAGE");
        saveMessage(m, ver, name(m.message()));
        MetaRevTestSupport.clear(jdbc);

        confirm(m.message(), ver, JUL1);

        // 확정 서비스(LayoutConfirmService)가 또 기록하면 같은 행이 두 번 남는다
        assertThat(MetaRevTestSupport.rows(jdbc)).containsExactly(row(m.message()));
    }

    @Test
    void 헤더_확정과_확정취소는_헤더와_그_헤더를_쌓은_전문을_기록한다() {
        M201 m = m201();
        String ver = newMinor(m.l110(), "HEADER");
        saveL110Draft(m, ver, name(m.l110()));
        MetaRevTestSupport.clear(jdbc);

        confirm(m.l110(), ver, AUG1);
        assertThat(MetaRevTestSupport.rows(jdbc)).containsExactly(row(m.l110()), row(m.message()));

        MetaRevTestSupport.clear(jdbc);
        LayoutVersionRequest cancel = new LayoutVersionRequest();
        cancel.setLayoutId(m.l110());
        cancel.setVer(ver);
        cancel.setRowVersion(rowVersion(m.l110(), ver));
        versions.cancelConfirm(cancel, "HEADER");
        assertThat(MetaRevTestSupport.rows(jdbc)).containsExactly(row(m.l110()), row(m.message()));
    }

    @Test
    void RELEASED_가_있는_전문의_이름을_바꾸는_DRAFT_저장은_그_전문을_기록한다() {
        M201 m = m201();
        String ver = newMinor(m.message(), "MESSAGE");
        MetaRevTestSupport.clear(jdbc);

        saveMessage(m, ver, uniq("이름 바꾼 전문 "));

        assertThat(MetaRevTestSupport.rows(jdbc)).containsExactly(row(m.message()));
    }

    @Test
    void RELEASED_가_있는_전문의_송수신_시스템을_바꾸는_DRAFT_저장은_한_번_기록하고_같은_값_저장은_기록하지_않는다() {
        M201 m = m201();
        String ver = newMinor(m.message(), "MESSAGE");
        MetaRevTestSupport.clear(jdbc);

        saveMessage(m, ver, name(m.message()), "ERP", "MES"); // 송신 L2 → ERP
        assertThat(MetaRevTestSupport.rows(jdbc)).containsExactly(row(m.message()));

        MetaRevTestSupport.clear(jdbc);
        saveMessage(m, ver, name(m.message()), "ERP", "APS"); // 수신 MES → APS
        assertThat(MetaRevTestSupport.rows(jdbc)).containsExactly(row(m.message()));

        MetaRevTestSupport.clear(jdbc);
        saveMessage(m, ver, name(m.message()), "ERP", "APS"); // 같은 값 다시 저장
        assertThat(MetaRevTestSupport.rows(jdbc)).isEmpty();
    }

    @Test
    void RELEASED_가_있는_헤더의_이름을_바꾸는_DRAFT_저장은_헤더와_쌓은_전문을_기록한다() {
        M201 m = m201();
        String ver = newMinor(m.l110(), "HEADER");
        MetaRevTestSupport.clear(jdbc);

        saveL110Draft(m, ver, uniq("이름 바꾼 헤더 "));

        assertThat(MetaRevTestSupport.rows(jdbc)).containsExactly(row(m.l110()), row(m.message()));
    }

    @Test
    void RELEASED_가_없는_전문의_이름을_바꿔도_기록하지_않는다() {
        dictionary();
        long l110 = saveL110();
        long msg = saveLayout(layoutReq(uniq("확정 전 전문 "), null, r -> {}), List.of(headerRow(l110)), List.of(), m201Items());
        MetaRevTestSupport.clear(jdbc);

        layoutService.save(layoutReq(uniq("확정 전 이름 바꿈 "), null, r -> {
            r.setLayoutId(msg);
            r.setVer("1.000");
            r.setRowVersion(rowVersion(msg, "1.000"));
        }), List.of(headerRow(l110)), List.of(), m201Items());

        assertThat(MetaRevTestSupport.rows(jdbc)).isEmpty();
    }

    // ── 컬럼·도메인 → LAYOUT 펼침(검토 I1, Ruling P3-28). 컬럼 저장 서비스는 용어 사전 준비가 무거워 기록기를 저장 서비스와 같은 인자로 직접
    //    부른다(서비스가 넘기는 펼침 여부 = 신규·물리명 변경·도메인 교체 / 도메인은 COMPATIBLE 이 아닐 때). 한 클래스가 DB 를 함께 쓰므로 다른
    //    시험이 만든 전문도 같은 컬럼을 쓴다 — 포함 여부로 단언한다 ──

    private void inTx(Runnable r) {
        new TransactionTemplate(transactionManager).executeWithoutResult(s -> r.run());
    }

    private long columnDomain(String phys) {
        return jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_COLUMN WHERE PHYS_NAME = ?", Long.class, phys);
    }

    @Test
    void 컬럼의_도메인을_바꾸면_그_컬럼을_쓰는_RELEASED_전문을_한_번_기록하고_DRAFT_만_쓰는_전문은_뺀다() {
        M201 m = m201();
        long draftOnly = saveLayout(layoutReq(uniq("확정 전 전문 "), null, r -> {}), List.of(headerRow(m.l110())), List.of(),
                m201Items());
        long before = columnDomain("COIL_THK");
        long wider = domain("COIL_THK_W", "QTY", "NUMBER", 5, 2, null);
        jdbc.update("UPDATE TB_MDM_COLUMN SET DOMAIN_ID = ? WHERE PHYS_NAME = 'COIL_THK'", wider);
        try {
            MetaRevTestSupport.clear(jdbc);
            inTx(() -> recorder.column("COIL_THK", "COIL_THK", true));

            List<String> rows = MetaRevTestSupport.rows(jdbc);
            assertThat(rows).contains("COLUMN:COIL_THK:SAVE", row(m.message())).doesNotHaveDuplicates();
            // 헤더는 COIL_THK 를 쓰지 않는다. DRAFT 버전은 피드에 없다
            assertThat(rows).doesNotContain(row(m.l100()), row(m.l110()), row(draftOnly));

            MetaRevTestSupport.clear(jdbc);
            inTx(() -> recorder.domain(wider, true));
            assertThat(MetaRevTestSupport.rows(jdbc)).contains("DOMAIN:" + wider + ":SAVE", "COLUMN:COIL_THK:SAVE", row(m.message()))
                    .doesNotHaveDuplicates().doesNotContain(row(draftOnly));
        } finally {
            jdbc.update("UPDATE TB_MDM_COLUMN SET DOMAIN_ID = ? WHERE PHYS_NAME = 'COIL_THK'", before);
        }
    }

    @Test
    void 헤더_항목_컬럼을_바꾸면_그_헤더와_헤더를_쌓은_전문까지_한_번_기록한다() {
        M201 m = m201();
        MetaRevTestSupport.clear(jdbc);

        inTx(() -> recorder.column("LINE_CODE", "LINE_CODE", true)); // L110 헤더 항목

        assertThat(MetaRevTestSupport.rows(jdbc)).contains("COLUMN:LINE_CODE:SAVE", row(m.l110()), row(m.message()))
                .doesNotHaveDuplicates().doesNotContain(row(m.l100()));
    }

    @Test
    void 레이아웃이_쓰지_않는_컬럼과_피드_무관_저장은_LAYOUT_키를_남기지_않는다() {
        m201();
        String free = uniq("MR_FREE_COL_");
        column(free, "안 쓰는 컬럼 " + free, null, domain("MR_FREE_DOM", "QTY", "NUMBER", 5, 0, null));
        MetaRevTestSupport.clear(jdbc);

        inTx(() -> recorder.column(null, free, true));
        assertThat(MetaRevTestSupport.rows(jdbc)).containsExactly("COLUMN:" + free + ":SAVE");

        // 쓰는 컬럼이라도 라벨·설명만 바꾼 저장(펼침 꺼짐)은 컬럼 키만
        MetaRevTestSupport.clear(jdbc);
        inTx(() -> recorder.column("COIL_THK", "COIL_THK", false));
        assertThat(MetaRevTestSupport.rows(jdbc)).containsExactly("COLUMN:COIL_THK:SAVE");
    }
}
