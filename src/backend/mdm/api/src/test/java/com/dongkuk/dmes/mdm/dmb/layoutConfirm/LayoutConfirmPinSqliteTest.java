package com.dongkuk.dmes.mdm.dmb.layoutConfirm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutHeaderRef;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemType;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.dma.unitMng.dto.UnitDeleteRequest;
import com.dongkuk.dmes.mdm.dma.unitMng.service.UnitMngService;
import com.dongkuk.dmes.mdm.dmb.LayoutServiceTestSupport;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutColumnPins;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutComposer;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutReleaseTimeline;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutReleaseTimeline.ReleasedVersion;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionService;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto.LayoutConfirmRequest;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto.LayoutConfirmValidateRequest;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.service.LayoutConfirmService;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngExecuteRequest;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngViewRequest;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutVersionRequest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
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
 * D-151 — 레이아웃 확정 때 컬럼 속성(DATA_TYPE·UNIT_CODE·SCALE)을 항목 행에 고정한다. 확정(전문·헤더)이 그 버전 항목 행 전부를 고정
 * 표시(PINNED_YN 'Y')하고 확정 시점 사전 유효값(없으면 NULL)을 쓰며, 확정 취소가 비우고, 새 버전 복사는 옮기지 않는다(DRAFT 는 'N').
 * 확정 뒤 사전을 바꿔도 — 값이 없던 칸에 값이 생겨도 — RELEASED 합성(시각 T·피드 구간·헤더 한 벌)은 그대로이고 DRAFT 는 새 값을 쓴다.
 * 재확정은 그 시점 값을 고정한다.
 *
 * <p>확정은 운영에서 OASIS action 한 건의 트랜잭션이다 — 시험은 같은 경계를 {@link TransactionTemplate} 으로 만든다. 확정 취소는 공통
 * 엔진이 자기 트랜잭션 경계를 가진다(고정값 비움은 그 안의 취소 훅에서 한다).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class LayoutConfirmPinSqliteTest extends LayoutServiceTestSupport {

    static final String JUL1 = "2026-07-01 00:00:00";
    static final String AUG1 = "2026-08-01 00:00:00";
    static final String SEP1 = "2026-09-01 00:00:00";
    static final LocalDateTime JUL15 = LocalDateTime.of(2026, 7, 15, 0, 0);
    static final LocalDateTime AUG15 = LocalDateTime.of(2026, 8, 15, 0, 0);

    @Autowired LayoutConfirmService confirmService;
    @Autowired LayoutVersionService versions;
    @Autowired LayoutComposer composer;
    @Autowired LayoutReleaseTimeline timeline;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired UnitMngService unitService;
    @Autowired LayoutColumnPins columnPins;

    /** 시험마다 새로 붙이는 도메인 — 시험이 사전을 바꿔도 같은 클래스의 다른 시험(공유 DB)에 번지지 않는다. */
    private long thkDomain;
    private long dtDomain;
    private long seqDomain;
    private long lineDomain;

    @BeforeEach
    void setUp() {
        dictionary();
        unit("kg", "WEIGHT", "kg", "1");
        thkDomain = domainWithUnit(uniq("CP_THK_"), "NUMBER", 3, 1, "mm");
        dtDomain = domain(uniq("CP_DT_"), "DATE", "STRING", 8, null, null);
        seqDomain = domain(uniq("CP_SEQ_"), "QTY", "NUMBER", 4, 0, null);
        lineDomain = domain(uniq("CP_LINE_"), "TEXT", "STRING", 2, null, null);
        jdbc.update("UPDATE TB_MDM_COLUMN SET DOMAIN_ID = ? WHERE PHYS_NAME = 'COIL_THK'", thkDomain);
        jdbc.update("UPDATE TB_MDM_COLUMN SET DOMAIN_ID = ? WHERE PHYS_NAME = 'PROD_DT'", dtDomain);
        jdbc.update("UPDATE TB_MDM_COLUMN SET DOMAIN_ID = ? WHERE PHYS_NAME = 'SEQUENCE_NO'", seqDomain);
        jdbc.update("UPDATE TB_MDM_COLUMN SET DOMAIN_ID = ? WHERE PHYS_NAME = 'LINE_CODE'", lineDomain);
    }

    // ------------------------------------------------------------------ 도우미

    private String newMinor(long id, String kind) {
        LayoutVersionRequest r = new LayoutVersionRequest();
        r.setLayoutId(id);
        r.setVerKind("MINOR");
        return versions.newVersion(r, kind).getVer();
    }

    /** M201 본문 마지막 여분 25 를 추가 항목 3 + 여분 22 로 쪼갠 화면 행(순차 전환). */
    private static List<Map<String, Object>> fillerSplitItems() {
        List<Map<String, Object>> items = new ArrayList<>(m201Items().subList(0, 3));
        items.add(item("DATA", "EXTRA_3", null));
        items.add(filler(22));
        return numbered(items);
    }

    private void saveFillerSplit(M201 m, String ver) {
        layoutService.save(layoutReq("출측검사 실적 수신", m.eai(), r -> {
            r.setLayoutId(m.message());
            r.setVer(ver);
            r.setRowVersion(rowVersion(m.message(), ver));
        }), List.of(headerRow(m.l110())), List.of(), fillerSplitItems());
    }

    /** 화면 [샘플 전문] — 그 버전 화면의 행(쪼갠 본문)과 예시 값으로 판정 시각 7월 15일에 렌더한다. */
    private Map<String, Object> execute(M201 m, String ver) {
        LayoutMngExecuteRequest r = new LayoutMngExecuteRequest();
        r.setLayoutId(m.message());
        r.setVer(ver);
        r.setAsOf("2026-07-15 00:00:00");
        r.setLayoutName("출측검사 실적 수신");
        r.setEaiCode(m.eai());
        r.setSndSystem("L2");
        r.setRcvSystem("MES");
        r.setSendTime("20260715143015");
        r.setSeq(1L);
        return layoutService.execute(r, List.of(headerRow(m.l110())), List.of(), fillerSplitItems(),
                List.of(sample("COIL_ID", "C26A0012345"), sample("PROD_DT", "20260715"), sample("COIL_THK", "3.5"),
                        sample("EXTRA_3", "ABC")));
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> bodySegment(Map<String, Object> rendered, String phys) {
        return ((List<Map<String, Object>>) rendered.get("segments")).stream()
                .filter(s -> phys.equals(s.get("COLUMN_PHYS")) && "BODY".equals(s.get("ZONE"))).findFirst().orElseThrow();
    }

    private Map<String, Object> confirm(long id, String ver, String applyFrom) {
        LayoutConfirmRequest r = new LayoutConfirmRequest();
        r.setLayoutId(id);
        r.setVer(ver);
        r.setRowVersion(rowVersion(id, ver));
        r.setApplyFrom(applyFrom);
        r.setWarningsAcknowledged(true);
        return new TransactionTemplate(transactionManager).execute(s -> confirmService.confirm(r));
    }

    private Map<String, Object> validate(long id, String ver, String applyFrom) {
        LayoutConfirmValidateRequest r = new LayoutConfirmValidateRequest();
        r.setLayoutId(id);
        r.setVer(ver);
        r.setApplyFrom(applyFrom);
        return confirmService.validate(r);
    }

    private void cancelConfirm(long id, String ver, String kind) {
        LayoutVersionRequest r = new LayoutVersionRequest();
        r.setLayoutId(id);
        r.setVer(ver);
        r.setRowVersion(rowVersion(id, ver));
        versions.cancelConfirm(r, kind);
    }

    /** {@code 물리명=고정표시:타입|단위|소수}(물리명 없는 항목은 뺀다), SEQ 순. */
    private List<String> pins(long layoutId, String ver) {
        return jdbc.queryForList("SELECT COLUMN_PHYS || '=' || PINNED_YN || ':' || COALESCE(DATA_TYPE, '-') || '|' || COALESCE(UNIT_CODE, '-') || '|' "
                + "|| COALESCE(CAST(SCALE AS VARCHAR(10)), '-') FROM TB_MDM_LAYOUT_ITEM WHERE LAYOUT_ID = ? AND VER = ? "
                + "AND COLUMN_PHYS IS NOT NULL ORDER BY SEQ", String.class, layoutId, new BigDecimal(ver));
    }

    /** {@code 버전상태:항목마다 고정 표시(SEQ 순)} — 물리명 없는 항목 포함. */
    private String flags(long layoutId, String ver) {
        String status = jdbc.queryForObject("SELECT STATUS FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = ?", String.class,
                layoutId, new BigDecimal(ver));
        return status + ":" + String.join("", jdbc.queryForList("SELECT PINNED_YN FROM TB_MDM_LAYOUT_ITEM WHERE LAYOUT_ID = ? AND VER = ? "
                + "ORDER BY SEQ", String.class, layoutId, new BigDecimal(ver)));
    }

    private static List<String> unpinned(List<String> phys) {
        return phys.stream().map(p -> p + "=N:-|-|-").toList();
    }

    private void changeThk(String type, int scale, String unit) {
        jdbc.update("UPDATE TB_MDM_DOMAIN SET DATA_TYPE = ?, SCALE = ?, UNIT_CODE = ? WHERE DOMAIN_ID = ?", type, scale, unit, thkDomain);
    }

    private static MdmLayoutItemSnapshot bodyItem(MdmLayoutSnapshot s, String phys) {
        return s.items().stream().filter(i -> phys.equals(i.columnPhys())).findFirst().orElseThrow();
    }

    private static MdmLayoutItemSnapshot headerItem(MdmLayoutSnapshot s, long headerId, String phys) {
        MdmLayoutHeaderRef h = s.headers().stream().filter(x -> x.headerLayoutId() == headerId).findFirst().orElseThrow();
        return h.items().stream().filter(i -> phys.equals(i.columnPhys())).findFirst().orElseThrow();
    }

    private ReleasedVersion released(long messageId, String ver) {
        return timeline.released(messageId).stream().filter(v -> v.ver().compareTo(new BigDecimal(ver)) == 0).findFirst().orElseThrow();
    }

    private static final List<String> BODY = List.of("COIL_ID", "PROD_DT", "COIL_THK", "EXTRA_3");
    private static final List<String> BODY_PINNED = List.of("COIL_ID=Y:STRING|-|-", "PROD_DT=Y:STRING|-|-", "COIL_THK=Y:NUMBER|mm|1",
            "EXTRA_3=Y:STRING|-|-");

    // ------------------------------------------------------------------ 시험

    @Test
    void messageConfirmPinsAttrsSoReleasedIgnoresLaterDictionaryChangesWhileDraftAndCopyUseCurrent() {
        M201 m = m201();
        String v1 = newMinor(m.message(), "MESSAGE");
        saveFillerSplit(m, v1);
        assertThat(pins(m.message(), v1)).isEqualTo(unpinned(BODY)); // DRAFT 저장은 고정하지 않는다
        confirm(m.message(), v1, JUL1);
        assertThat(pins(m.message(), v1)).isEqualTo(BODY_PINNED);

        // 새 버전 복사는 고정 표시·고정값을 옮기지 않는다(DRAFT 는 'N') — 확정하면 그 시점 값으로 다시 고정한다
        clock.setLocal(LocalDateTime.of(2026, 7, 2, 9, 0, 0));
        String v2 = newMinor(m.message(), "MESSAGE");
        assertThat(pins(m.message(), v2)).isEqualTo(unpinned(BODY));
        confirm(m.message(), v2, AUG1);
        assertThat(pins(m.message(), v2)).isEqualTo(BODY_PINNED);

        MdmLayoutSnapshot atJul = composer.at(m.message(), JUL15);
        MdmLayoutSnapshot atAug = composer.at(m.message(), AUG15);
        ReleasedVersion feed1 = released(m.message(), v1);
        ReleasedVersion feed2 = released(m.message(), v2);
        assertThat(bodyItem(atJul, "COIL_THK").dataType()).isEqualTo(MdmLayoutItemType.NUM);

        // 확정 뒤 사전 변경 — RELEASED 합성(지난 시각 T 재현 포함)·피드 구간은 그대로
        changeThk("STRING", 2, "kg");
        assertThat(composer.at(m.message(), JUL15)).isEqualTo(atJul);
        assertThat(composer.at(m.message(), AUG15)).isEqualTo(atAug);
        assertThat(released(m.message(), v1)).isEqualTo(feed1);
        assertThat(released(m.message(), v2)).isEqualTo(feed2);

        // DRAFT(복사)는 고정값이 없어 지금 사전 값이다
        clock.setLocal(LocalDateTime.of(2026, 8, 2, 9, 0, 0));
        String v3 = newMinor(m.message(), "MESSAGE");
        assertThat(pins(m.message(), v3)).isEqualTo(unpinned(BODY));
        MdmLayoutItemSnapshot draftThk = bodyItem(composer.compose(m.message(), new BigDecimal(v3), AUG15), "COIL_THK");
        assertThat(draftThk.dataType()).isEqualTo(MdmLayoutItemType.CHAR);
        assertThat(draftThk.unitCode()).isEqualTo("kg");
        assertThat(draftThk.scale()).isEqualTo(2);
        // 확정 본문 스냅샷(감사용)도 고정값으로 남았다
        assertThat(jdbc.queryForObject("SELECT SNAPSHOT_JSON FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = ?", String.class,
                m.message(), new BigDecimal(v2))).contains("\"unitCode\":\"mm\"");
        // 화면 조회도 같은 선택 — 확정 버전 항목은 고정값, DRAFT 항목은 지금 사전 값
        assertThat(viewItem(m.message(), v1, "COIL_THK")).containsEntry("DATA_TYPE", "NUMBER").containsEntry("UNIT_CODE", "mm")
                .containsEntry("SCALE", 1);
        assertThat(viewItem(m.message(), v3, "COIL_THK")).containsEntry("DATA_TYPE", "STRING").containsEntry("UNIT_CODE", "kg")
                .containsEntry("SCALE", 2);
    }

    /**
     * 검토 I1 — 샘플 실행(execute)도 확정 이후 버전이면 저장 행을 시각 T 로 합성해 렌더한다(그리드·피드와 같은 값). 확정 뒤 사전 소수를
     * 1 → 2 로 바꿔도 확정 버전의 샘플 줄은 그대로다. DRAFT 는 지금처럼 화면 행을 지금 사전으로 검사한다 — 새 소수 2 와 NUM_FORMAT 암묵
     * 소수 1 이 어긋나 렌더 대신 이슈를 돌려준다.
     */
    @Test
    void sampleExecuteOnConfirmedVersionKeepsPinnedAttrsWhileDraftUsesCurrentDictionary() {
        M201 m = m201();
        String v1 = newMinor(m.message(), "MESSAGE");
        saveFillerSplit(m, v1);
        confirm(m.message(), v1, JUL1);
        Map<String, Object> before = execute(m, v1);
        assertThat((List<?>) before.get("issues")).isEmpty();
        assertThat(bodySegment(before, "COIL_THK")).containsEntry("TEXT", "0035");

        changeThk("NUMBER", 2, "kg");
        assertThat(execute(m, v1)).isEqualTo(before);

        clock.setLocal(LocalDateTime.of(2026, 7, 2, 9, 0, 0));
        String v2 = newMinor(m.message(), "MESSAGE");
        assertThat(String.valueOf(execute(m, v2).get("issues"))).contains("도메인 소수 자리(2)");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> viewItem(long messageId, String ver, String phys) {
        LayoutMngViewRequest r = new LayoutMngViewRequest();
        r.setLayoutId(messageId);
        r.setVer(ver);
        List<Map<String, Object>> items = (List<Map<String, Object>>) layoutService.view(r).get("items");
        return items.stream().filter(i -> phys.equals(i.get("COLUMN_PHYS"))).findFirst().orElseThrow();
    }

    @Test
    void headerConfirmPinsHeaderItemsSoStackedMessagesKeepTheirHeaderAttrs() {
        M201 m = m201();
        String hv = newMinor(m.l110(), "HEADER");
        assertThat(pins(m.l110(), hv)).allMatch(p -> p.endsWith("=N:-|-|-"));
        confirm(m.l110(), hv, JUL1);
        assertThat(pins(m.l110(), hv)).containsExactly("LINE_CODE=Y:STRING|-|-", "SEQUENCE_NO=Y:NUMBER|-|0", "LENGTH=Y:NUMBER|-|0",
                "DATE=Y:STRING|-|-", "TIME=Y:STRING|-|-");
        MdmLayoutSnapshot atJul = composer.at(m.message(), JUL15);
        MdmLayoutSnapshot alone = composer.headerAlone(m.l110(), new BigDecimal(hv));
        assertThat(headerItem(atJul, m.l110(), "SEQUENCE_NO").dataType()).isEqualTo(MdmLayoutItemType.NUM);

        // 헤더 항목 컬럼의 도메인 타입을 바꿔도 확정한 헤더 버전으로 합성한 전문은 그대로
        jdbc.update("UPDATE TB_MDM_DOMAIN SET DATA_TYPE = 'STRING', SCALE = NULL WHERE DOMAIN_ID = ?", seqDomain);
        assertThat(composer.at(m.message(), JUL15)).isEqualTo(atJul);
        assertThat(composer.headerAlone(m.l110(), new BigDecimal(hv))).isEqualTo(alone);
    }

    /**
     * 검토 Minor — 헤더 상수 재정의 값은 그 헤더 버전 항목이 직렬화에 쓰는 타입으로 판정한다(확정 헤더 버전이면 고정값). 확정 뒤 LINE_CODE
     * 도메인이 NUMBER 로 바뀌어도 확정한 L110 버전은 LINE_CODE 를 문자로 직렬화하므로 재정의 "B2" 가 통과한다.
     */
    @Test
    void headerConstOverrideIsJudgedWithThePinnedHeaderItemType() {
        M201 m = m201();
        String hv = newMinor(m.l110(), "HEADER");
        confirm(m.l110(), hv, JUL1);
        assertThat(pins(m.l110(), hv)).contains("LINE_CODE=Y:STRING|-|-");
        jdbc.update("UPDATE TB_MDM_DOMAIN SET DATA_TYPE = 'NUMBER', SCALE = 0 WHERE DOMAIN_ID = ?", lineDomain);

        String v1 = newMinor(m.message(), "MESSAGE");
        Map<String, Object> checked = layoutService.validate(layoutReq("출측검사 실적 수신", m.eai(), r -> {
            r.setLayoutId(m.message());
            r.setVer(v1);
            r.setAsOf("2026-07-15 00:00:00");
        }), List.of(headerRow(m.l110())), List.of(constRow(m.l110(), 1, "B2")), m201Items());
        assertThat(checked.get("passed")).as(String.valueOf(checked)).isEqualTo(true);
        // 헤더 고정값은 그대로 문자다(직렬화도 문자)
        assertThat(headerItem(composer.at(m.message(), JUL15), m.l110(), "LINE_CODE").dataType()).isEqualTo(MdmLayoutItemType.CHAR);
    }

    private static UnitDeleteRequest unitDelete(String unitCode) {
        UnitDeleteRequest r = new UnitDeleteRequest();
        r.setUnitCode(unitCode);
        return r;
    }

    /**
     * 검토 Minor — 레이아웃 항목이 가리키는 단위(확정 고정값 UNIT_CODE, 전송 단위 TRANS_UNIT)는 삭제를 FK 오류(S999) 대신 도메인 참조와
     * 같은 업무 오류로 거부한다. 흔한 흐름: 도메인 단위를 바꾼 뒤 옛 단위를 지운다 — 도메인은 더 이상 가리키지 않아도 확정 버전이 고정했다.
     * TRANS_UNIT FK 는 버전 상태와 무관하므로 DRAFT 행이 가리켜도 거부한다. 단위는 시험마다 새로 만든다(같은 클래스 DB 의 다른 시험이
     * mm·kg 를 고정해 두었다).
     */
    @Test
    void unitDeleteIsRejectedWhileLayoutItemsReferenceTheUnit() {
        String pinnedUnit = uniq("CPU");
        String transUnit = uniq("CPT");
        String freeUnit = uniq("CPF");
        unit(pinnedUnit, "LENGTH", "mm", "10");
        unit(transUnit, "LENGTH", "mm", "0.1");
        unit(freeUnit, "LENGTH", "mm", "100");
        jdbc.update("UPDATE TB_MDM_DOMAIN SET UNIT_CODE = ? WHERE DOMAIN_ID = ?", pinnedUnit, thkDomain);
        M201 m = m201();
        String v1 = newMinor(m.message(), "MESSAGE");
        saveFillerSplit(m, v1);
        confirm(m.message(), v1, JUL1);
        assertThat(pins(m.message(), v1)).contains("COIL_THK=Y:NUMBER|" + pinnedUnit + "|1");
        changeThk("NUMBER", 1, "mm"); // 도메인은 옛 단위를 더 이상 가리키지 않는다 — 확정 고정값만 남았다

        BusinessException pinned = rejected(() -> unitService.delete(unitDelete(pinnedUnit)));
        assertThat(pinned.getErrorCode()).isEqualTo(ErrorCode.BUSINESS_ERROR);
        assertThat(pinned.getMessage()).isEqualTo("다른 데이터(레이아웃 항목)가 이 단위를 참조하고 있어 삭제할 수 없습니다.");

        clock.setLocal(LocalDateTime.of(2026, 7, 2, 9, 0, 0));
        String v2 = newMinor(m.message(), "MESSAGE");
        jdbc.update("UPDATE TB_MDM_LAYOUT_ITEM SET TRANS_UNIT = ? WHERE LAYOUT_ID = ? AND VER = ? AND COLUMN_PHYS = 'COIL_THK'", transUnit,
                m.message(), new BigDecimal(v2));
        BusinessException trans = rejected(() -> unitService.delete(unitDelete(transUnit)));
        assertThat(trans.getErrorCode()).isEqualTo(ErrorCode.BUSINESS_ERROR);
        assertThat(trans.getMessage()).contains("레이아웃 항목");

        unitService.delete(unitDelete(freeUnit)); // 아무도 가리키지 않는 단위는 지운다
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_UNIT WHERE UNIT_CODE IN (?, ?, ?)", Integer.class, pinnedUnit,
                transUnit, freeUnit)).isEqualTo(2);
    }

    /** 검토 Nit — 고정 표시 행 수가 항목 수와 다르면(RELEASED 가 아닌 버전을 고정하려 하면) 조용히 'N' 을 남기지 않고 실패한다. */
    @Test
    void pinRefusesAVersionThatIsNotReleased() {
        M201 m = m201();
        String v1 = newMinor(m.message(), "MESSAGE");
        assertThat(flags(m.message(), v1)).isEqualTo("DRAFT:NNNN");
        assertThatThrownBy(() -> new TransactionTemplate(transactionManager)
                .executeWithoutResult(s -> columnPins.pin(m.message(), new BigDecimal(v1))))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("고정 표시");
        assertThat(flags(m.message(), v1)).isEqualTo("DRAFT:NNNN");
    }

    /**
     * 검토 Nit — 헤더 확정 취소가 원장 가드(MDM028)에 걸려 거부되면 취소 전체가 롤백되어, 훅 첫 줄이 비운 고정 표시·고정값도 돌아온다.
     * 시나리오는 LayoutHeaderCancelGuardSqliteTest 의 거부 경로와 같다(미래 헤더 H 를 쌓은 미래 전문 버전이 있다).
     */
    @Test
    void headerCancelRejectedByLedgerGuardKeepsThePins() {
        M201 m = m201();
        long h = saveHeader(headerReq(uniq("새 구간 헤더 "), r -> {}), l110Items());
        confirm(h, "1.000", AUG1);
        List<String> pinned = pins(h, "1.000");
        assertThat(pinned).contains("SEQUENCE_NO=Y:NUMBER|-|0").allMatch(p -> p.contains("=Y:"));

        String mv = newMinor(m.message(), "MESSAGE");
        layoutService.save(layoutReq((String) layoutRow(m.message()).get("LAYOUT_NAME"), m.eai(), q -> {
            q.setLayoutId(m.message());
            q.setVer(mv);
            q.setRowVersion(rowVersion(m.message(), mv));
            q.setAsOf(AUG1);
        }), List.of(headerRow(h)), List.of(), m201Items());
        confirm(m.message(), mv, SEP1);

        BusinessException e = rejected(() -> cancelConfirm(h, "1.000", "HEADER"));
        assertThat(e.getErrors()).isNotEmpty();
        assertThat(e.getErrors().get(0).code()).isEqualTo("MDM028");
        assertThat(flags(h, "1.000")).isEqualTo("RELEASED:YYYYYY");
        assertThat(pins(h, "1.000")).isEqualTo(pinned);
    }

    @Test
    void cancelConfirmClearsPinsAndReconfirmPinsTheThenCurrentValues() {
        M201 m = m201();
        String v1 = newMinor(m.message(), "MESSAGE");
        saveFillerSplit(m, v1);
        confirm(m.message(), v1, JUL1);
        assertThat(pins(m.message(), v1)).isEqualTo(BODY_PINNED);

        cancelConfirm(m.message(), v1, "MESSAGE");
        assertThat(jdbc.queryForObject("SELECT STATUS FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = ?", String.class,
                m.message(), new BigDecimal(v1))).isEqualTo("DRAFT");
        assertThat(pins(m.message(), v1)).isEqualTo(unpinned(BODY));

        // 재확정은 그 시점 값 — 소수는 NUM_FORMAT 암묵 소수(1)와 맞아야 확정 검사를 지나므로 단위만 바꾼다
        changeThk("NUMBER", 1, "kg");
        confirm(m.message(), v1, JUL1);
        assertThat(pins(m.message(), v1)).containsExactly("COIL_ID=Y:STRING|-|-", "PROD_DT=Y:STRING|-|-", "COIL_THK=Y:NUMBER|kg|1",
                "EXTRA_3=Y:STRING|-|-");

        // 헤더 확정 취소도 비운다(쌓은 전문이 있는 헤더 — 취소 가드를 지나는 경로)
        String hv = newMinor(m.l110(), "HEADER");
        confirm(m.l110(), hv, AUG1);
        assertThat(pins(m.l110(), hv)).contains("SEQUENCE_NO=Y:NUMBER|-|0");
        cancelConfirm(m.l110(), hv, "HEADER");
        assertThat(pins(m.l110(), hv)).allMatch(p -> p.endsWith("=N:-|-|-"));
    }

    /**
     * 결정 6 — 분류의 기준 버전(직전 RELEASED)은 자기 확정 때 고정한 값으로 합성되므로, 확정 사이의 사전 변경이 다음 확정의 변경 분류에
     * 잡힌다. 헤더: 항목 컬럼 도메인의 소수 0 → 2 를 내용 변경 없는 새 버전 확정이 형식 변경(동시 전환)으로 분류한다.
     */
    @Test
    void dictionaryScaleChangeBetweenHeaderConfirmsIsClassifiedOnTheNextConfirm() {
        M201 m = m201();
        String h2 = newMinor(m.l110(), "HEADER");
        confirm(m.l110(), h2, JUL1);
        jdbc.update("UPDATE TB_MDM_DOMAIN SET SCALE = 2 WHERE DOMAIN_ID = ?", seqDomain);

        clock.setLocal(LocalDateTime.of(2026, 7, 2, 9, 0, 0));
        String h3 = newMinor(m.l110(), "HEADER"); // 내용은 그대로 복사
        Map<String, Object> checked = validate(m.l110(), h3, AUG1);
        assertThat(checked.get("simultaneous")).isEqualTo(true);
        Map<String, Object> out = confirm(m.l110(), h3, AUG1);
        assertThat(out.get("switchMode")).isEqualTo("SIMULTANEOUS");
        assertThat(out.get("changeKinds")).isEqualTo("FORMAT");
        assertThat((String) out.get("changeSummary")).contains("일련번호 형식 변경");
        assertThat(pins(m.l110(), h3)).contains("SEQUENCE_NO=Y:NUMBER|-|2");
        assertThat(pins(m.l110(), h2)).contains("SEQUENCE_NO=Y:NUMBER|-|0");
    }

    /** 결정 6 — 전문: 본문 컬럼 도메인의 단위 mm → kg 를 내용 변경 없는 새 버전 확정이 형식 변경으로 분류한다. */
    @Test
    void dictionaryUnitChangeBetweenMessageConfirmsIsClassifiedOnTheNextConfirm() {
        M201 m = m201();
        String v1 = newMinor(m.message(), "MESSAGE");
        saveFillerSplit(m, v1);
        confirm(m.message(), v1, JUL1);
        changeThk("NUMBER", 1, "kg");

        clock.setLocal(LocalDateTime.of(2026, 7, 2, 9, 0, 0));
        String v2 = newMinor(m.message(), "MESSAGE");
        Map<String, Object> out = confirm(m.message(), v2, AUG1);
        assertThat(out.get("switchMode")).isEqualTo("SIMULTANEOUS");
        assertThat(out.get("changeKinds")).isEqualTo("FORMAT");
        assertThat((String) out.get("changeSummary")).contains("코일 두께 형식 변경");
    }

    /**
     * 운영 경로에서는 DRAFT 만 지금 사전을 읽는다 — 확정 → 확정 취소 → 재확정 → 새 버전 복사 → DRAFT 저장 → 복사본 확정의 단계마다
     * 항목 행 전부(물리명 없는 여분 포함)의 고정 표시를 본다. 확정 이후 버전은 늘 'Y', DRAFT 는 늘 'N' 이다.
     */
    @Test
    void pinnedFlagFollowsReleasedStateThroughConfirmCancelCopyReconfirm() {
        M201 m = m201();
        String v1 = newMinor(m.message(), "MESSAGE");
        saveFillerSplit(m, v1);
        assertThat(flags(m.message(), v1)).isEqualTo("DRAFT:NNNNN");

        confirm(m.message(), v1, JUL1);
        assertThat(flags(m.message(), v1)).isEqualTo("RELEASED:YYYYY");

        cancelConfirm(m.message(), v1, "MESSAGE");
        assertThat(flags(m.message(), v1)).isEqualTo("DRAFT:NNNNN");
        assertThat(pins(m.message(), v1)).isEqualTo(unpinned(BODY));

        confirm(m.message(), v1, JUL1);
        assertThat(flags(m.message(), v1)).isEqualTo("RELEASED:YYYYY");

        clock.setLocal(LocalDateTime.of(2026, 7, 2, 9, 0, 0));
        String v2 = newMinor(m.message(), "MESSAGE");
        assertThat(flags(m.message(), v2)).isEqualTo("DRAFT:NNNNN");   // 복사는 표시를 옮기지 않는다
        assertThat(flags(m.message(), v1)).isEqualTo("RELEASED:YYYYY"); // 원본은 그대로
        saveFillerSplit(m, v2);                                          // DRAFT 저장도 표시하지 않는다
        assertThat(flags(m.message(), v2)).isEqualTo("DRAFT:NNNNN");

        confirm(m.message(), v2, AUG1);
        assertThat(flags(m.message(), v2)).isEqualTo("RELEASED:YYYYY");
        // 확정 이후 상태인데 고정 표시가 없는 행은 없다(이 전문·헤더 모두 — 헤더는 확정 경로를 거치지 않은 시험 준비라 대상에서 뺀다)
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_LAYOUT_ITEM i JOIN TB_MDM_LAYOUT_VER v ON v.LAYOUT_ID = i.LAYOUT_ID "
                + "AND v.VER = i.VER WHERE i.LAYOUT_ID = ? AND v.STATUS <> 'DRAFT' AND v.LEGACY_SNAPSHOT_YN = 'N' AND v.VER <> 1 "
                + "AND i.PINNED_YN <> 'Y'", Integer.class, m.message())).isZero();
    }

    /**
     * 팀장 결정(2026-10-03, 브리프 결정 4 변경) — 확정 이후 버전은 NULL 까지 항목 행 값을 쓴다. 확정 때 사전 값이 없던 칸(문자 도메인의
     * 단위·소수)은 "값 없음" 으로 고정되고, 확정 뒤 사전에 그 값이 새로 생겨도 확정한 버전의 합성은 그대로다. (도메인 없는 컬럼은 확정
     * 검사 L07 에 막혀 확정 경로로는 생기지 않는다 — 그 경우는 이행 시험이 본다.)
     */
    @Test
    void valuesGainedAfterConfirmDoNotLeakIntoReleased() {
        M201 m = m201();
        String v1 = newMinor(m.message(), "MESSAGE");
        saveFillerSplit(m, v1);
        confirm(m.message(), v1, JUL1);
        assertThat(pins(m.message(), v1)).contains("PROD_DT=Y:STRING|-|-");
        MdmLayoutSnapshot atJul = composer.at(m.message(), JUL15);
        ReleasedVersion feed = released(m.message(), v1);
        assertThat(bodyItem(atJul, "PROD_DT").unitCode()).isNull();

        // 확정 뒤 PROD_DT 도메인에 단위·소수가 생기고 타입이 바뀐다
        jdbc.update("UPDATE TB_MDM_DOMAIN SET UNIT_CODE = 'kg', SCALE = 2, DATA_TYPE = 'NUMBER' WHERE DOMAIN_ID = ?", dtDomain);
        assertThat(composer.at(m.message(), JUL15)).isEqualTo(atJul);
        assertThat(released(m.message(), v1)).isEqualTo(feed);
        MdmLayoutItemSnapshot prodDt = bodyItem(composer.at(m.message(), JUL15), "PROD_DT");
        assertThat(prodDt.unitCode()).isNull();
        assertThat(prodDt.scale()).isNull();
        assertThat(prodDt.dataType()).isEqualTo(MdmLayoutItemType.CHAR);
    }
}
