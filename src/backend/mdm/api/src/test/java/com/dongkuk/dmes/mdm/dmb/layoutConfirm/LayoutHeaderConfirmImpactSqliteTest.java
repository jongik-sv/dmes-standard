package com.dongkuk.dmes.mdm.dmb.layoutConfirm;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dmb.LayoutServiceTestSupport;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionService;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto.LayoutConfirmRequest;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto.LayoutConfirmValidateRequest;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.service.LayoutConfirmService;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutVersionRequest;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
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
 * D-144 3단계 — 헤더 확정 화면의 영향도: 사용 전문·EAI, apply_from 시점 총 길이 전후, MSG_LENGTH 용량, 재정의 짝, EAI 표준 헤더
 * 전환 경고(Ruling P3-17 — 넘겨받기·되찾기·내려놓기).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class LayoutHeaderConfirmImpactSqliteTest extends LayoutServiceTestSupport {

    static final String JUL1 = "2026-07-01 00:00:00";

    @Autowired LayoutConfirmService confirmService;
    @Autowired LayoutVersionService versions;
    @Autowired PlatformTransactionManager transactionManager;

    @BeforeEach
    void setUp() {
        dictionary();
    }

    private String newMajorHeader(long id, List<Map<String, Object>> items) {
        LayoutVersionRequest r = new LayoutVersionRequest();
        r.setLayoutId(id);
        r.setVerKind("MAJOR");
        String ver = versions.newVersion(r, "HEADER").getVer();
        // 화면처럼 새 버전 행이 이어받은 EAI 를 그대로 돌려보낸다 — 저장 요청의 EAI 가 버전 행 EAI_CODE 의 정본이다(Ruling P3-15)
        String eai = jdbc.queryForObject("SELECT EAI_CODE FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = ?", String.class, id,
                new BigDecimal(ver));
        headerService.save(headerReq(layoutRow(id).get("LAYOUT_NAME").toString(), q -> {
            q.setLayoutId(id);
            q.setVer(ver);
            q.setRowVersion(0L);
            q.setEaiCode(eai);
        }), items);
        return ver;
    }

    /** 헤더 minor 새 버전에서 EAI 를 바꿔(비우면 null) 저장한다. */
    private String headerMinorWithEai(long id, String eai) {
        LayoutVersionRequest r = new LayoutVersionRequest();
        r.setLayoutId(id);
        r.setVerKind("MINOR");
        String ver = versions.newVersion(r, "HEADER").getVer();
        headerService.save(headerReq(layoutRow(id).get("LAYOUT_NAME").toString(), q -> {
            q.setLayoutId(id);
            q.setVer(ver);
            q.setRowVersion(0L);
            q.setEaiCode(eai);
        }), l100Items());
        return ver;
    }

    private Map<String, Object> validate(long id, String ver) {
        return validate(id, ver, JUL1);
    }

    private Map<String, Object> validate(long id, String ver, String applyFrom) {
        LayoutConfirmValidateRequest r = new LayoutConfirmValidateRequest();
        r.setLayoutId(id);
        r.setVer(ver);
        r.setApplyFrom(applyFrom);
        return confirmService.validate(r);
    }

    /** OASIS action 한 건처럼 한 트랜잭션 — 확정 서비스는 트랜잭션 밖 호출을 거부한다. */
    private Map<String, Object> confirm(long id, String ver, String applyFrom) {
        LayoutConfirmRequest r = new LayoutConfirmRequest();
        r.setLayoutId(id);
        r.setVer(ver);
        r.setRowVersion(rowVersion(id, ver));
        r.setApplyFrom(applyFrom);
        r.setWarningsAcknowledged(true);
        return new TransactionTemplate(transactionManager).execute(s -> confirmService.confirm(r));
    }

    /** MdmErrors 의 코드는 message 가 아니라 첫 detail 에 있다. */
    private static String code(BusinessException e) {
        return e.getErrors() == null || e.getErrors().isEmpty() ? e.getErrorCode().name() : e.getErrors().get(0).code();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Map<String, Object> m, String key) {
        return (List<Map<String, Object>>) m.get(key);
    }

    @SuppressWarnings("unchecked")
    private static List<String> eais(Map<String, Object> m) {
        return (List<String>) m.get("eais");
    }

    private static List<Map<String, Object>> switches(Map<String, Object> validated) {
        return list(validated, "checks").stream().filter(c -> "EAI_STANDARD_HEADER_SWITCH".equals(c.get("code"))).toList();
    }

    @Test
    void longerHeaderShowsUsingMessagesWithTotalLengthBeforeAndAfter() {
        M201 m = m201();
        List<Map<String, Object>> items = l110Items();
        items.set(5, filler(8));
        String ver = newMajorHeader(m.l110(), numbered(items));
        Map<String, Object> out = validate(m.l110(), ver);
        assertThat(list(out, "impact")).singleElement().satisfies(r -> {
            assertThat(((Number) r.get("LAYOUT_ID")).longValue()).isEqualTo(m.message());
            assertThat(r.get("STATE")).isEqualTo("CURRENT");
            assertThat(r.get("VER")).isEqualTo("1.000");
            assertThat(r.get("EVALUATED_AT")).isEqualTo(JUL1);
            assertThat(r.get("TOTAL_LENGTH_BEFORE")).isEqualTo(187);
            assertThat(r.get("TOTAL_LENGTH_AFTER")).isEqualTo(190);
        });
        assertThat(out.get("simultaneous")).isEqualTo(true);
        assertThat(eais(out)).isEmpty(); // L110 은 EAI 를 주장하지 않는다
        assertThat(switches(out)).isEmpty();
    }

    @Test
    void messageStartingLaterIsEvaluatedAtItsOwnApplyFrom() {
        M201 m = m201();
        String msgVer = "1.001";
        newDraft(m.message(), "1.000", msgVer);
        release(m.message(), msgVer, "2026-09-01 00:00:00"); // 미래 버전 — 1.000 은 09-01 에 닫힌다
        List<Map<String, Object>> items = l110Items();
        items.set(5, filler(8));
        String ver = newMajorHeader(m.l110(), numbered(items));
        List<Map<String, Object>> impact = list(validate(m.l110(), ver), "impact");
        assertThat(impact).extracting(r -> r.get("VER") + "/" + r.get("STATE") + "/" + r.get("EVALUATED_AT"))
                .containsExactlyInAnyOrder("1.000/CURRENT/" + JUL1, msgVer + "/FUTURE/2026-09-01 00:00:00");
    }

    @Test
    void eaiUsingTheHeaderIsListed() {
        M201 m = m201();
        String ver = newMajorHeader(m.l100(), l100Items());
        Map<String, Object> out = validate(m.l100(), ver);
        assertThat(eais(out)).containsExactly(m.eai());
        assertThat(switches(out)).isEmpty(); // 같은 헤더가 계속 표준 헤더다
    }

    @Test
    void msgLengthOverflowBlocksHeaderConfirm() {
        column("LEN3", "길이 3자리", null, domain("T_NUM_3", "QTY", "NUMBER", 3, 0, null));
        long h = saveHeader(headerReq(uniq("길이칸 헤더 "), r -> {}), numbered(new ArrayList<>(List.of(item("AUTO", "LEN3", "MSG_LENGTH"), filler(7)))));
        release(h, "1.000", HEADER_FROM);
        Map<String, Object> saved = layoutService.save(layoutReq(uniq("긴 전문 "), null, r -> {}), List.of(headerRow(h)), List.of(),
                numbered(new ArrayList<>(List.of(filler(900)))));
        release(((Number) saved.get("layoutId")).longValue(), "1.000", MESSAGE_FROM);
        String ver = newMajorHeader(h, numbered(new ArrayList<>(List.of(item("AUTO", "LEN3", "MSG_LENGTH"), filler(97)))));
        Map<String, Object> out = validate(h, ver);
        assertThat(list(out, "checks")).anySatisfy(c -> {
            assertThat(c.get("severity")).isEqualTo("ERROR");
            assertThat(c.get("code")).isEqualTo("L16");
        });
        assertThat(list(out, "impact")).singleElement().satisfies(r -> {
            assertThat(r.get("TOTAL_LENGTH_BEFORE")).isEqualTo(910);
            assertThat(r.get("TOTAL_LENGTH_AFTER")).isEqualTo(1000);
            assertThat((String) r.get("ISSUES")).contains("LEN3");
        });
        assertThat(code(rejected(() -> confirm(h, ver, JUL1)))).isEqualTo("MDM010");
        assertThat(jdbc.queryForObject("SELECT STATUS FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = ?", String.class, h,
                new BigDecimal(ver))).isEqualTo("DRAFT");
    }

    @Test
    void reorderKeepsOverrideButRemovedConstTargetWarnsPerMessage() {
        Map<String, Object> override = new LinkedHashMap<>();
        override.put("HEADER_SEQ", 2);
        override.put("CONST_VALUE", "B1");
        M201 m = m201(List.of(override)); // L100 SEQ 2 = SND_FAC_TP 재정의
        // 순서만 바꾼다(SND_FAC_TP ↔ SND_PROC_TP) — 물리명 짝이라 경고 없음
        List<Map<String, Object>> swapped = new ArrayList<>(l100Items());
        Map<String, Object> a = swapped.get(1);
        swapped.set(1, swapped.get(2));
        swapped.set(2, a);
        String ver = newMajorHeader(m.l100(), numbered(swapped));
        assertThat(list(validate(m.l100(), ver), "checks")).noneSatisfy(c -> assertThat(c.get("code")).isEqualTo("ORPHAN_OVERRIDE"));
        // 대상 항목을 같은 길이 여분으로 바꾼다 — 그 전문에 "재정의가 적용되지 않음" 경고
        List<Map<String, Object>> removed = new ArrayList<>(l100Items());
        removed.set(1, filler(4));
        LayoutVersionRequest del = new LayoutVersionRequest();
        del.setLayoutId(m.l100());
        del.setVer(ver);
        del.setRowVersion(rowVersion(m.l100(), ver));
        versions.deleteDraft(del, "HEADER");
        String ver2 = newMajorHeader(m.l100(), numbered(removed));
        Map<String, Object> out = validate(m.l100(), ver2);
        assertThat(list(out, "checks")).filteredOn(c -> "ORPHAN_OVERRIDE".equals(c.get("code"))).singleElement().satisfies(c -> {
            assertThat(c.get("severity")).isEqualTo("WARNING");
            assertThat((String) c.get("message")).contains("SND_FAC_TP").contains("B1");
            assertThat(c.get("itemKey")).isEqualTo(m.message() + "@1.000");
        });
    }

    /** 숫자 CONST 항목의 표현 자리수(WIDTH)를 줄이면 그 항목을 재정의한 전문의 값이 넘친다 — L12 오류(직렬화가 넘침으로 실패한다). */
    @Test
    void overrideLongerThanNewItemWidthIsAnError() {
        Map<String, Object> ord = item("CONST", "SNT_ORD", "1");
        ord.put("NUM_FORMAT", "SIGN=N;ZERO=Y;SCALE=0;WIDTH=8");
        long h = saveHeader(headerReq(uniq("순번 헤더 "), r -> {}), numbered(new ArrayList<>(List.of(ord, filler(2)))));
        release(h, "1.000", HEADER_FROM);
        Map<String, Object> saved = layoutService.save(layoutReq(uniq("순번 재정의 전문 "), null, r -> {}), List.of(headerRow(h)),
                List.of(constRow(h, 1, "1234567")), numbered(new ArrayList<>(List.of(filler(10)))));
        long msg = ((Number) saved.get("layoutId")).longValue();
        release(msg, "1.000", MESSAGE_FROM);
        Map<String, Object> narrow = new LinkedHashMap<>(ord);
        narrow.put("NUM_FORMAT", "SIGN=N;ZERO=Y;SCALE=0;WIDTH=5");
        String ver = newMajorHeader(h, numbered(new ArrayList<>(List.of(narrow, filler(5)))));
        Map<String, Object> out = validate(h, ver);
        assertThat(list(out, "checks")).anySatisfy(c -> {
            assertThat(c.get("severity")).isEqualTo("ERROR");
            assertThat(c.get("code")).isEqualTo("L12");
            assertThat((String) c.get("message")).contains("SNT_ORD=1234567");
            assertThat(c.get("itemKey")).isEqualTo(msg + "@1.000");
        });
    }

    // ── Ruling P3-17 — 표준 헤더가 바뀌는 확정은 EAI_STANDARD_HEADER_SWITCH 경고(넘겨받기·되찾기·내려놓기) ──

    @Test
    void claimingAnotherHeadersEaiWarnsTakeOver() {
        M201 m = m201();
        long claimer = saveHeader(headerReq(uniq("넘겨받는 헤더 "), r -> r.setEaiCode(m.eai())), l100Items());
        Map<String, Object> out = validate(claimer, "1.000");
        assertThat(eais(out)).containsExactly(m.eai());
        assertThat(switches(out)).singleElement().satisfies(c -> {
            assertThat(c.get("severity")).isEqualTo("WARNING");
            assertThat(c.get("itemKey")).isEqualTo(m.eai());
            assertThat((String) c.get("message")).contains(m.eai()).contains(JUL1).contains("넘겨받습니다")
                    .contains("(" + m.l100() + ") → ").contains("(" + claimer + ")");
        });
    }

    @Test
    void newVersionOfEarlierClaimerWarnsReclaim() {
        M201 m = m201();
        long claimer = saveHeader(headerReq(uniq("앞서 넘겨받은 헤더 "), r -> r.setEaiCode(m.eai())), l100Items());
        confirm(claimer, "1.000", "2026-06-01 00:00:00"); // 06-01 부터 claimer 가 표준 헤더
        // L100 새 버전은 EAI_CODE 를 이어받는다 — 더 늦게 적용을 시작하므로 표준 헤더를 되찾는다
        String ver = newMajorHeader(m.l100(), l100Items());
        Map<String, Object> out = validate(m.l100(), ver);
        assertThat(eais(out)).containsExactly(m.eai());
        assertThat(switches(out)).singleElement().satisfies(c -> assertThat((String) c.get("message")).contains("되찾습니다")
                .contains("(" + claimer + ") → ").contains("(" + m.l100() + ")"));
    }

    /** T7 검토 Important 2 ③ — 넘겨받은 헤더가 EAI 를 빼면 앞서 주장하던 헤더로 되돌아간다. 그 확정에 경고가 붙는다. */
    @Test
    void claimerDroppingEaiWarnsFallbackToEarlierClaimer() {
        M201 m = m201();
        long claimer = saveHeader(headerReq(uniq("내려놓는 헤더 "), r -> r.setEaiCode(m.eai())), l100Items());
        confirm(claimer, "1.000", "2026-06-01 00:00:00");
        String ver = headerMinorWithEai(claimer, null);
        Map<String, Object> out = validate(claimer, ver);
        assertThat(eais(out)).isEmpty();
        assertThat(switches(out)).singleElement().satisfies(c -> assertThat((String) c.get("message")).contains(m.eai())
                .contains("내려놓습니다").contains("(" + claimer + ") → ").contains("(" + m.l100() + ")"));
        // 경고는 확인 흐름(MDM014)에 실린다 — 확인하지 않으면 확정되지 않는다
        LayoutConfirmRequest r = new LayoutConfirmRequest();
        r.setLayoutId(claimer);
        r.setVer(ver);
        r.setRowVersion(rowVersion(claimer, ver));
        r.setApplyFrom(JUL1);
        r.setWarningsAcknowledged(false);
        BusinessException e = rejected(() -> new TransactionTemplate(transactionManager).execute(s -> confirmService.confirm(r)));
        assertThat(code(e)).isEqualTo("MDM014");
        // 막은 경고가 바로 그 전환 경고 하나다(첫 detail 은 MDM014 묶음 코드) — 다른 경고에 묻혀 녹색이 되지 않게
        assertThat(e.getErrors().subList(1, e.getErrors().size())).extracting(d -> d.code())
                .containsExactly("EAI_STANDARD_HEADER_SWITCH");
    }

    @Test
    void droppingEaiWarnsReleaseAndListsNoEai() {
        M201 m = m201();
        String ver = headerMinorWithEai(m.l100(), null);
        Map<String, Object> out = validate(m.l100(), ver);
        assertThat(eais(out)).isEmpty();
        assertThat(switches(out)).singleElement().satisfies(c -> assertThat((String) c.get("message")).contains(m.eai())
                .contains("내려놓습니다").contains("(" + m.l100() + ") → 없음"));
    }

    // ── 수정 1회차 — Ruling P3-24(apply_from 뒤 경계마다 EAI 전환 비교)·P3-25(이미 있던 L16·L12 는 경고)·검토 Minor 2·3 ──

    /** 다른 헤더 버전 행을 시험 준비로 바로 확정한다 — 새 minor DRAFT 를 만들어 EAI 를 바꾸고 release 로 그 시각에 연다(미적용 하나 규칙 밖). */
    private void releaseNextWithEai(long headerId, String from, String to, String eai, String applyFrom) {
        newDraft(headerId, from, to);
        jdbc.update("UPDATE TB_MDM_LAYOUT_VER SET EAI_CODE = ? WHERE LAYOUT_ID = ? AND VER = ?", eai, headerId, new BigDecimal(to));
        release(headerId, to, applyFrom);
    }

    /** 검토 "팀장 확인 사항" 의 예 — apply_from 에는 전후가 같아도 그 뒤 경계(09-01)에서 표준 헤더가 조용히 "없음" 으로 바뀌면 경고한다. */
    @Test
    void laterBoundarySwitchToNoneIsWarned() {
        M201 m = m201();                                                     // L100 이 01-01 부터 E 를 주장
        long b = saveHeader(headerReq(uniq("넘겨받은 헤더 "), r -> r.setEaiCode(m.eai())), l100Items());
        confirm(b, "1.000", "2026-03-01 00:00:00");                            // B 가 03-01 에 넘겨받음
        String bv = headerMinorWithEai(b, null);
        confirm(b, bv, "2026-09-01 00:00:00");                                 // B 는 09-01 부터 내려놓음(그때 L100 으로 돌아갈 예정)
        String ver = headerMinorWithEai(m.l100(), null);                       // 이제 L100 이 07-01 에 E 를 뺀다
        Map<String, Object> out = validate(m.l100(), ver);
        assertThat(switches(out)).singleElement().satisfies(c -> assertThat((String) c.get("message")).contains(m.eai())
                .contains("2026-09-01 00:00:00 부터").contains("(" + m.l100() + ") → 없음").contains("내려놓습니다"));
    }

    /** 같은 EAI 의 같은 전환이 경계 사이에서 끊겼다 다시 나와도 처음 시각 한 줄이다. */
    @Test
    void sameSwitchAtSeveralBoundariesIsOneLine() {
        M201 m = m201();
        long x = saveHeader(headerReq(uniq("잠깐 주장하는 헤더 "), r -> r.setEaiCode(m.eai())), l100Items());
        release(x, "1.000", "2026-08-01 00:00:00");                            // 08-01~08-15 동안 X 가 이긴다(전후 모두 X)
        releaseNextWithEai(x, "1.000", "1.001", null, "2026-08-15 00:00:00");
        long claimer = saveHeader(headerReq(uniq("넘겨받는 헤더 "), r -> r.setEaiCode(m.eai())), l100Items());
        Map<String, Object> out = validate(claimer, "1.000");
        assertThat(switches(out)).singleElement().satisfies(c -> assertThat((String) c.get("message"))
                .contains(JUL1 + " 부터").contains("(" + m.l100() + ") → ").contains("(" + claimer + ")"));
    }

    /** 헤더가 EAI 를 E1 에서 E2 로 바꾸면 E1 내려놓기·E2 넘겨받기 두 줄이다. */
    @Test
    void changingEaiWarnsDropAndTakeOverSeparately() {
        M201 m = m201();
        String other = uniq("H");
        jdbc.update("INSERT INTO TB_MDM_EAI (EAI_CODE, EAI_NAME, ENCODING) VALUES (?, ?, 'EUC-KR')", other, "다른 EAI " + other);
        String ver = headerMinorWithEai(m.l100(), other);
        Map<String, Object> out = validate(m.l100(), ver);
        assertThat(eais(out)).containsExactly(other);
        assertThat(switches(out)).extracting(c -> (String) c.get("itemKey")).containsExactlyInAnyOrder(m.eai(), other);
        assertThat(switches(out)).anySatisfy(c -> assertThat((String) c.get("message")).contains(m.eai()).contains("내려놓습니다"));
        assertThat(switches(out)).anySatisfy(c -> assertThat((String) c.get("message")).contains(other).contains("넘겨받습니다"));
    }

    /** 재정의 두 건이 짝을 잃으면 그 전문 버전에 경고 한 줄, 두 재정의가 모두 그 줄에 있다. */
    @Test
    void twoOrphanOverridesAreOneLinePerMessage() {
        M201 m = m201(List.of(l100Const(2, "B1"), l100Const(3, "L3")));      // SND_FAC_TP·SND_PROC_TP 재정의
        List<Map<String, Object>> removed = new ArrayList<>(l100Items());
        removed.set(1, filler(4));
        removed.set(2, filler(3));
        String ver = newMajorHeader(m.l100(), numbered(removed));
        assertThat(list(validate(m.l100(), ver), "checks")).filteredOn(c -> "ORPHAN_OVERRIDE".equals(c.get("code"))).singleElement()
                .satisfies(c -> assertThat((String) c.get("message")).contains("SND_FAC_TP=B1").contains("SND_PROC_TP=L3"));
    }

    /** 이미 닫힌 RELEASED 전문 버전(APPLY_TO <= apply_from)은 빼고, DRAFT 전문 버전은 apply_from 으로 평가한다. */
    @Test
    void closedMessageVersionIsSkippedAndDraftMessageVersionIsEvaluatedAtApplyFrom() {
        M201 m = m201();
        newDraft(m.message(), "1.000", "1.001");
        release(m.message(), "1.001", "2026-06-01 00:00:00");                  // 1.000 은 06-01 에 닫힌다
        newDraft(m.message(), "1.001", "1.002");                               // 전문 DRAFT 도 L110 을 쌓는다
        List<Map<String, Object>> items = l110Items();
        items.set(5, filler(8));
        String ver = newMajorHeader(m.l110(), numbered(items));
        assertThat(list(validate(m.l110(), ver), "impact")).extracting(r -> r.get("VER") + "/" + r.get("STATE") + "/" + r.get("EVALUATED_AT"))
                .containsExactlyInAnyOrder("1.001/CURRENT/" + JUL1, "1.002/DRAFT/" + JUL1);
    }

    /** "전" 합성에도 이미 넘치던 MSG_LENGTH 칸은 오류가 아니라 경고 — 무관한 헤더 확정이 옛 문제로 막히지 않는다(Ruling P3-25). */
    @Test
    void preexistingMsgLengthOverflowIsOnlyAWarning() {
        column("LEN3", "길이 3자리", null, domain("T_NUM_3", "QTY", "NUMBER", 3, 0, null));
        long h = saveHeader(headerReq(uniq("길이칸 헤더 "), r -> {}), numbered(new ArrayList<>(List.of(item("AUTO", "LEN3", "MSG_LENGTH"), filler(7)))));
        release(h, "1.000", HEADER_FROM);
        Map<String, Object> saved = layoutService.save(layoutReq(uniq("긴 전문 "), null, r -> {}), List.of(headerRow(h)), List.of(),
                numbered(new ArrayList<>(List.of(filler(900)))));
        long msg = ((Number) saved.get("layoutId")).longValue();
        release(msg, "1.000", MESSAGE_FROM);
        String grown = newMajorHeader(h, numbered(new ArrayList<>(List.of(item("AUTO", "LEN3", "MSG_LENGTH"), filler(97)))));
        release(h, grown, "2026-03-01 00:00:00");                              // 시험 준비 — 이미 1000 으로 넘친 상태
        String ver = newMajorHeader(h, numbered(new ArrayList<>(List.of(item("AUTO", "LEN3", "MSG_LENGTH"), filler(98)))));
        Map<String, Object> out = validate(h, ver);
        assertThat(list(out, "checks")).filteredOn(c -> "L16".equals(c.get("code"))).singleElement().satisfies(c -> {
            assertThat(c.get("severity")).isEqualTo("WARNING");
            assertThat((String) c.get("message")).contains("이미 있던 문제");
        });
        assertThat(list(out, "checks")).noneSatisfy(c -> assertThat(c.get("severity")).isEqualTo("ERROR"));
        confirm(h, ver, JUL1);                                                // 확인하면 확정된다
        assertThat(jdbc.queryForObject("SELECT STATUS FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = ?", String.class, h,
                new BigDecimal(ver))).isEqualTo("RELEASED");
    }

    /** "전" 합성에도 이미 넘치던 재정의는 오류가 아니라 경고(Ruling P3-25). */
    @Test
    void preexistingOverrideOverflowIsOnlyAWarning() {
        Map<String, Object> ord = item("CONST", "SNT_ORD", "1");
        ord.put("NUM_FORMAT", "SIGN=N;ZERO=Y;SCALE=0;WIDTH=8");
        long h = saveHeader(headerReq(uniq("순번 헤더 "), r -> {}), numbered(new ArrayList<>(List.of(ord, filler(2)))));
        release(h, "1.000", HEADER_FROM);
        Map<String, Object> saved = layoutService.save(layoutReq(uniq("순번 재정의 전문 "), null, r -> {}), List.of(headerRow(h)),
                List.of(constRow(h, 1, "1234567")), numbered(new ArrayList<>(List.of(filler(10)))));
        release(((Number) saved.get("layoutId")).longValue(), "1.000", MESSAGE_FROM);
        Map<String, Object> narrow = new LinkedHashMap<>(ord);
        narrow.put("NUM_FORMAT", "SIGN=N;ZERO=Y;SCALE=0;WIDTH=5");
        String narrowed = newMajorHeader(h, numbered(new ArrayList<>(List.of(narrow, filler(5)))));
        release(h, narrowed, "2026-03-01 00:00:00");                           // 시험 준비 — 이미 넘친 상태
        String ver = newMajorHeader(h, numbered(new ArrayList<>(List.of(narrow, filler(6)))));
        Map<String, Object> out = validate(h, ver);
        assertThat(list(out, "checks")).filteredOn(c -> "L12".equals(c.get("code"))).singleElement().satisfies(c -> {
            assertThat(c.get("severity")).isEqualTo("WARNING");
            assertThat((String) c.get("message")).contains("이미 있던 문제").contains("SNT_ORD=1234567");
        });
        assertThat(list(out, "checks")).noneSatisfy(c -> assertThat(c.get("severity")).isEqualTo("ERROR"));
    }
}
