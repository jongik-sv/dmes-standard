package com.dongkuk.dmes.mdm.dmb.layout;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.dmb.layout.LayoutConstJudge.Judgement;
import com.dongkuk.dmes.mdm.dmb.layout.codec.LayoutUnitTable;
import java.math.BigDecimal;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/**
 * TSK-05-03 design.md §3.1·§6.2 — 03 등록 거부 #2(L12)·#3(L13)·#4(L14)·#7(L15) 순수 경계(불변 I12·I13·I14). 판정기는 스텁이다.
 */
class LayoutRegistrationRulesTest {

    private static final Charset EUC_KR = Charset.forName("EUC-KR");
    private static final LayoutUnitTable UNITS = LayoutUnitTable.of(List.of(
            new LayoutUnitTable.Unit("MM", "LENGTH", new BigDecimal("1")),
            new LayoutUnitTable.Unit("UM", "LENGTH", new BigDecimal("0.001")),
            new LayoutUnitTable.Unit("INCH", "LENGTH", new BigDecimal("25.4")),
            new LayoutUnitTable.Unit("KG", "WEIGHT", new BigDecimal("1"))));

    private static final BiFunction<String, String, Judgement> PASS = (c, v) -> new Judgement(Judgement.PASS, null);

    static LayoutColumnInfo col(String phys, String domainName, String type, Integer length, Integer scale, String unit) {
        return new LayoutColumnInfo(phys, phys + " 논리명", null, phys + " 논리명", 1L, domainName, type, length, scale, unit);
    }

    private static final Map<String, LayoutColumnInfo> DICT = new HashMap<>(Map.of(
            "COIL_ID", col("COIL_ID", "코일 식별자", "STRING", 20, null, null),
            "PROD_DT", col("PROD_DT", "일자", "STRING", 8, null, null),
            "COIL_THK", col("COIL_THK", "코일 두께", "NUMBER", 3, 1, null),
            "THK_MM", col("THK_MM", "두께 mm", "NUMBER", 3, 1, "MM"),
            "FAC", col("FAC", "공장", "STRING", 2, null, null),
            "QTY5", col("QTY5", "수량", "NUMBER", 5, 0, null),
            "WGT_UNIT", col("WGT_UNIT", "단위", "STRING", 4, null, null)));

    private static LayoutItemDraft item(int seq, String kind, String phys, String trans, String unitItem, String fmt, String def,
                                        Integer filler) {
        return new LayoutItemDraft(seq, kind, phys, trans, unitItem, fmt, def, filler);
    }

    private static Map<Integer, Integer> lengths(List<LayoutItemDraft> items) {
        Map<Integer, Integer> out = new HashMap<>();
        for (LayoutItemDraft d : items) {
            out.put(d.seq(), LayoutRows.lengths(List.of(d), DICT).get(0));
        }
        return out;
    }

    private static List<LayoutIssue> check(List<LayoutItemDraft> items, BiFunction<String, String, Judgement> judge,
                                           List<LayoutIssue> warnings) {
        return LayoutRegistrationRules.check(items, DICT, UNITS, EUC_KR, lengths(items), judge, warnings);
    }

    private static List<LayoutIssue> check(List<LayoutItemDraft> items) {
        return check(items, PASS, new ArrayList<>());
    }

    private static void only(LayoutIssueCode code, List<LayoutIssue> issues) {
        assertEquals(1, issues.size(), issues.toString());
        assertEquals(code, issues.get(0).code(), issues.toString());
    }

    @Test
    void 거부_2_CONST_값이_판정기에서_거짓이면_L12() {
        List<LayoutIssue> issues = check(List.of(item(1, "CONST", "FAC", null, null, null, "B9", null)),
                (c, v) -> new Judgement(Judgement.FAIL, "value <= 1 위반"), new ArrayList<>());
        only(LayoutIssueCode.L12, issues);
        assertTrue(issues.get(0).message().contains("value <= 1 위반"), issues.get(0).message());
        assertEquals(1, issues.get(0).seq());
    }

    @Test
    void 거부_2_CONST_값이_항목_바이트_길이를_넘으면_L12() {
        only(LayoutIssueCode.L12, check(List.of(item(1, "CONST", "FAC", null, null, null, "ABC", null))));
        only(LayoutIssueCode.L12, check(List.of(item(1, "CONST", "FAC", null, null, null, "가나", null))));
        assertTrue(check(List.of(item(1, "CONST", "FAC", null, null, null, "가", null))).isEmpty(), "EUC-KR 한글 1자 = 2바이트");
    }

    @Test
    void 거부_2_판정_불가는_거부가_아니라_경고다() {
        List<LayoutIssue> warnings = new ArrayList<>();
        List<LayoutIssue> issues = check(List.of(item(1, "CONST", "FAC", null, null, null, "B1", null)),
                (c, v) -> new Judgement(Judgement.UNDECIDED, "판정 불가"), warnings);
        assertTrue(issues.isEmpty(), issues.toString());
        only(LayoutIssueCode.L12, warnings);
    }

    @Test
    void 거부_2_상수_재정의_값도_검사한다() {
        List<LayoutRegistrationRules.Override> overrides = List.of(
                new LayoutRegistrationRules.Override(100L, 2, "FAC", "B9", 2),
                new LayoutRegistrationRules.Override(100L, 3, "FAC", "B1", 2));
        List<LayoutIssue> issues = LayoutRegistrationRules.checkOverrides(overrides, DICT, EUC_KR,
                (c, v) -> "B9".equals(v) ? new Judgement(Judgement.FAIL, "틀림") : new Judgement(Judgement.PASS, null), new ArrayList<>());
        only(LayoutIssueCode.L12, issues);
        assertEquals(2, issues.get(0).seq());
        // 재정의 값이 항목 길이를 넘어도 L12
        only(LayoutIssueCode.L12, LayoutRegistrationRules.checkOverrides(
                List.of(new LayoutRegistrationRules.Override(100L, 5, "FAC", "ABC", 2)), DICT, EUC_KR, PASS, new ArrayList<>()));
    }

    @Test
    void 거부_3_전송_단위의_차원이_기준_단위와_다르면_L13() {
        only(LayoutIssueCode.L13, check(List.of(item(1, "DATA", "THK_MM", "KG", null, null, null, null))));
    }

    @Test
    void 거부_3_단위_마스터에_없는_전송_단위는_L13() {
        only(LayoutIssueCode.L13, check(List.of(item(1, "DATA", "THK_MM", "NOPE", null, null, null, null))));
    }

    @Test
    void 거부_3_기준_단위가_없는_도메인에_전송_단위를_지정하면_L13() {
        only(LayoutIssueCode.L13, check(List.of(item(1, "DATA", "COIL_THK", "UM", null, "SIGN=N;ZERO=Y;SCALE=1;WIDTH=6", null, null))));
    }

    @Test
    void 전송_단위가_같은_차원이고_자리가_넉넉하면_통과한다() {
        assertTrue(check(List.of(item(1, "DATA", "THK_MM", "UM", null, "SIGN=N;ZERO=Y;SCALE=1;WIDTH=6", null, null))).isEmpty());
    }

    @Test
    void 거부_4_표현_자리_2는_도메인_3_1을_담지_못해_L14() {
        List<LayoutIssue> issues = check(List.of(item(3, "DATA", "COIL_THK", null, null, "SIGN=N;ZERO=Y;SCALE=1;WIDTH=2", null, null)));
        only(LayoutIssueCode.L14, issues);
        assertEquals("표현 자리 2는 도메인 코일 두께(숫자 3,1)를 담지 못합니다", issues.get(0).message());
        assertEquals(3, issues.get(0).seq());
    }

    @ParameterizedTest
    @CsvSource({
            "3, 1, SIGN=N;ZERO=Y;SCALE=1, '', 3",
            "3, 1, SIGN=N;ZERO=Y;SCALE=0, '', 4",
            "3, 1, SIGN=Y;ZERO=Y;SCALE=1, '', 4",
            "3, 1, SIGN=N;ZERO=Y;SCALE=1, UM, 6",
            "3, 1, SIGN=N;ZERO=Y;SCALE=1, INCH, 3",
            "5, 0, '', '', 5"})
    void 거부_4_필요_자리수는_정수_소수_소수점_부호_전송_단위를_더한다(int p, int s, String fmt, String trans, int need) {
        LayoutColumnInfo c = col("X", "X 도메인", "NUMBER", p, s, "MM");
        LayoutNumFormat f = fmt.isEmpty() ? null : LayoutNumFormatCodec.decode(fmt + ";WIDTH=9");
        assertEquals(need, LayoutRegistrationRules.requiredWidth(c, f, trans.isEmpty() ? null : trans, UNITS));
        // need-1 은 L14, need 는 통과. 형식이 없으면 폭 = 도메인 길이(p)라 need 만 본다
        int[] widths = fmt.isEmpty() ? new int[] {need} : new int[] {need - 1, need};
        for (int w : widths) {
            String text = fmt.isEmpty() ? null : fmt + ";WIDTH=" + w;
            LayoutItemDraft d = item(1, "DATA", "X", trans.isEmpty() ? null : trans, null, text, null, null);
            List<LayoutIssue> issues = LayoutRegistrationRules.check(List.of(d), Map.of("X", c), UNITS, EUC_KR, Map.of(1, w), PASS,
                    new ArrayList<>());
            assertEquals(w < need, issues.stream().anyMatch(i -> i.code() == LayoutIssueCode.L14),
                    fmt + "/" + trans + " W" + w + " " + issues);
        }
    }

    @Test
    void 거부_4_숫자_형식이_없는_숫자_항목도_전송_단위로_자리가_늘면_L14() {
        only(LayoutIssueCode.L14, check(List.of(item(1, "DATA", "THK_MM", "UM", null, null, null, null))));
    }

    @Test
    void 거부_4_AUTO_숫자_항목도_본다() {
        assertTrue(check(List.of(item(1, "AUTO", "QTY5", null, null, null, "SEQ", null))).isEmpty());
        only(LayoutIssueCode.L14, check(List.of(item(1, "AUTO", "QTY5", null, null, "SIGN=Y;ZERO=Y;SCALE=0;WIDTH=5", "SEQ", null))));
    }

    @Test
    void 거부_7_단위_항목이_같은_레이아웃_항목을_가리키지_않으면_L15() {
        only(LayoutIssueCode.L15, check(List.of(item(1, "DATA", "THK_MM", null, "NOPE_UNIT", null, null, null))));
        assertTrue(check(List.of(item(1, "DATA", "THK_MM", null, "WGT_UNIT", null, null, null),
                item(2, "DATA", "WGT_UNIT", null, null, null, null, null))).isEmpty());
    }

    @Test
    void 거부_7_단위_항목이_자기_자신을_가리키면_L15() {
        only(LayoutIssueCode.L15, check(List.of(item(1, "DATA", "THK_MM", null, "THK_MM", null, null, null))));
    }

    @Test
    void M201_은_7종을_모두_통과한다() {
        List<LayoutItemDraft> body = List.of(item(1, "DATA", "COIL_ID", null, null, null, null, null),
                item(2, "DATA", "PROD_DT", null, null, null, null, null),
                item(3, "DATA", "COIL_THK", null, null, "SIGN=N;ZERO=Y;SCALE=1;WIDTH=4", null, null),
                item(4, "FILLER", null, null, null, null, null, 25));
        List<LayoutIssue> warnings = new ArrayList<>();
        assertTrue(check(body, PASS, warnings).isEmpty());
        assertTrue(warnings.isEmpty());
    }
}
