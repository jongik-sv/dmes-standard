package com.dongkuk.dmes.mdm.dmb;

import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dmb.headerMng.dto.HeaderMngSaveRequest;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutWriter;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngSaveRequest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * D-144 3단계 — 서비스를 트랜잭션 없이 부르는 레이아웃 시험 공용. 현재 사용자 kim(담당자·표준 관리자), 시계 2026-06-15 09:00(KST).
 * 확정 서비스(Task 7) 없이 버전을 RELEASED 로 만드는 {@link #release}(HTTP 시험과 같이 쓰므로 {@link LayoutTestSupport} 에 둔다)를
 * 쓴다 — 시험 준비 전용(운영 경로는 공통 엔진).
 * 하위 시험 클래스는 {@code @Import(DmeTestSupport.Config.class)} 를 단다.
 */
public abstract class LayoutServiceTestSupport extends LayoutTestSupport {

    public static final String KIM = "kim";
    public static final String HEADER_FROM = "2026-01-01 00:00:00";
    public static final String MESSAGE_FROM = "2026-02-01 00:00:00";

    @Autowired
    protected DmeTestSupport.MutableCurrentUser user;
    @Autowired
    protected MutableClock clock;
    @Autowired
    protected LayoutWriter layoutWriter;

    @BeforeEach
    void asSteward() {
        user.set(KIM, Set.of(MdmRoles.STEWARD, MdmRoles.STD_ADMIN));
        clock.setLocal(DmeTestSupport.NOW);
    }

    /**
     * 확정본 {@code from} 에서 내 새 DRAFT {@code to} 를 만든다 — 새 버전 액션(Task 6) 전이라 버전 행은 JDBC 로 넣고 항목·헤더 구성·재정의는
     * {@link LayoutWriter#copyVersionRows} 로 복사한다(시험 준비 전용).
     */
    protected void newDraft(long layoutId, String from, String to) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, BASE_VER, OWNER_ID, EAI_CODE, OWN_LENGTH) "
                + "SELECT LAYOUT_ID, ?, 'MAJOR', 'DRAFT', VER, ?, EAI_CODE, OWN_LENGTH FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = ?",
                new BigDecimal(to), KIM, layoutId, new BigDecimal(from));
        layoutWriter.copyVersionRows(layoutId, new BigDecimal(from), new BigDecimal(to));
    }

    /** 이 레이아웃의 DRAFT 버전 문자열({@code "1.000"}) — 없으면 null. */
    protected String draftVer(long layoutId) {
        List<String> vs = jdbc.queryForList("SELECT CAST(VER AS VARCHAR(40)) FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND STATUS = 'DRAFT'",
                String.class, layoutId);
        return vs.isEmpty() ? null : new BigDecimal(vs.get(0)).setScale(3).toPlainString();
    }

    protected long rowVersion(long layoutId, String ver) {
        return jdbc.queryForObject("SELECT ROW_VERSION FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = ?", Long.class,
                layoutId, new BigDecimal(ver));
    }

    protected List<Map<String, Object>> versionRows(long layoutId) {
        return jdbc.queryForList("SELECT CAST(VER AS VARCHAR(40)) AS VER, STATUS, OWNER_ID, ROW_VERSION, OWN_LENGTH "
                + "FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ?", layoutId);
    }

    // ------------------------------------------------------------------ 저장 도우미(헤더는 HEADER_FROM, 전문은 MESSAGE_FROM 에 release)

    protected long saveHeader(HeaderMngSaveRequest r, List<Map<String, Object>> items) {
        return ((Number) headerService.save(r, items).get("layoutId")).longValue();
    }

    /** EAI 를 함께 만든 L100(EUC-KR) — 저장 뒤 HEADER_FROM 에 확정해 EAI 표준 헤더가 된다. */
    protected long saveL100(String eai) {
        long id = saveHeader(headerReq(uniq("GLUE 공통 헤더 "), r -> {
            r.setEaiCode(eai);
            r.setEaiName("GLUE " + eai);
            r.setEncoding("EUC-KR");
            r.setPadRule("숫자 왼쪽 0, 문자 오른쪽 공백");
        }), l100Items());
        release(id, "1.000", HEADER_FROM);
        return id;
    }

    /** L110 — 저장 뒤 HEADER_FROM 에 확정한다. */
    protected long saveL110() {
        long id = saveHeader(headerReq(uniq("L2 구간 헤더 "), r -> {}), l110Items());
        release(id, "1.000", HEADER_FROM);
        return id;
    }

    protected long saveLayout(LayoutMngSaveRequest r, List<Map<String, Object>> headers, List<Map<String, Object>> consts,
                              List<Map<String, Object>> items) {
        return ((Number) layoutService.save(r, headers, consts, items).get("layoutId")).longValue();
    }

    /**
     * M201 한 벌: L100(새 EAI)·L110 을 헤더 저장으로 만들어 확정하고, 전문은 헤더 grid 에 L110 만 준다(L100 은 EAI 자동 삽입). 전문은
     * 저장 뒤 MESSAGE_FROM 에 확정한다 — 고치려면 새 DRAFT 가 필요하다.
     */
    protected M201 m201(List<Map<String, Object>> consts) {
        dictionary();
        String eai = uniq("G");
        long l100 = saveL100(eai);
        long l110 = saveL110();
        List<Map<String, Object>> c = new ArrayList<>();
        for (Map<String, Object> row : consts) {
            Map<String, Object> m = new LinkedHashMap<>(row);
            m.putIfAbsent("HEADER_LAYOUT_ID", l100);
            c.add(m);
        }
        long msg = saveLayout(layoutReq(uniq("출측검사 실적 수신 "), eai, r -> {}), List.of(headerRow(l110)), c, m201Items());
        release(msg, "1.000", MESSAGE_FROM);
        return new M201(eai, l100, l110, msg);
    }

    protected M201 m201() {
        return m201(List.of());
    }

    public record M201(String eai, long l100, long l110, long message) {
    }
}
