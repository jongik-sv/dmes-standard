package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutConstJudge.Judgement;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutFillKinds.Field;
import com.dongkuk.dmes.mdm.dmb.layout.codec.LayoutUnitTable;
import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;

/**
 * 03 등록 거부 #2·#3·#4·#7 — L12~L15(TSK-05-03 design.md §6.2, 불변 I12·I13·I14). 05-02 {@link LayoutItemRules}(L01~L08) 뒤에
 * 도는 순수 검사다 — 사전·단위·판정기는 인자로 받는다. 한 행이 여러 규칙에 걸리면 모두 모은다. 판정 불가(UNDECIDED)는 경고다(D6).
 */
public final class LayoutRegistrationRules {

    private static final String NUMBER = "NUMBER";
    private static final MathContext MC = new MathContext(34, RoundingMode.HALF_UP);

    /** 전문 상수 재정의 한 건 — 대상 헤더 항목의 컬럼·길이로 검사한다. */
    public record Override(long headerLayoutId, int headerSeq, String columnPhys, String value, int length) {
    }

    private LayoutRegistrationRules() {
    }

    /**
     * @param lengthsBySeq 행 SEQ → 항목 바이트 길이(파생할 수 없던 행은 없다)
     * @param warnings     판정 불가(L12 경고)를 여기에 더한다
     */
    public static List<LayoutIssue> check(List<LayoutItemDraft> items, Map<String, LayoutColumnInfo> dictionary, LayoutUnitTable units,
                                          Charset charset, Map<Integer, Integer> lengthsBySeq,
                                          BiFunction<String, String, Judgement> judge, List<LayoutIssue> warnings) {
        List<LayoutIssue> issues = new ArrayList<>();
        for (LayoutItemDraft item : items) {
            MdmFillKind kind = LayoutFillKinds.parse(item.fillKind());
            if (kind == null || kind == MdmFillKind.FILLER || item.columnPhys() == null) {
                continue;
            }
            LayoutColumnInfo col = dictionary.get(item.columnPhys());
            if (col == null) {
                continue; // L01
            }
            if (kind == MdmFillKind.CONST && item.defaultValue() != null) {
                constValue(item.seq(), Field.DEFAULT_VALUE.key(), item.columnPhys(), item.defaultValue(), lengthsBySeq.get(item.seq()),
                        charset, judge, issues, warnings);
            }
            if ((kind == MdmFillKind.DATA || kind == MdmFillKind.CONST) && item.transUnit() != null) {
                transUnit(item, col, units, issues);
            }
            if (NUMBER.equals(col.dataType())) {
                width(item, col, units, issues);
            }
            if ((kind == MdmFillKind.DATA || kind == MdmFillKind.CONST) && item.unitItem() != null) {
                unitItem(item, items, issues);
            }
        }
        return issues;
    }

    /** 전문 상수 재정의 값의 L12 — seq 는 헤더 항목 SEQ. */
    public static List<LayoutIssue> checkOverrides(List<Override> overrides, Map<String, LayoutColumnInfo> dictionary, Charset charset,
                                                   BiFunction<String, String, Judgement> judge, List<LayoutIssue> warnings) {
        List<LayoutIssue> issues = new ArrayList<>();
        for (Override o : overrides) {
            if (o.value() == null || o.columnPhys() == null || !dictionary.containsKey(o.columnPhys())) {
                continue;
            }
            constValue(o.headerSeq(), "CONST_VALUE", o.columnPhys(), o.value(), o.length(), charset, judge, issues, warnings);
        }
        return issues;
    }

    /**
     * #4 필요 자리수(I13, D8) = (p − s) + 전송 단위 증가 자리 + s + (소수점 문자 1) + (부호 1). 전송 단위 증가 = 기준 계수 ÷ 전송 계수가
     * 1 초과면 ⌈log10(비)⌉. 형식이 없으면 암묵 소수 = 도메인 소수(03:59)라 소수점 문자·부호가 없다.
     */
    public static int requiredWidth(LayoutColumnInfo col, LayoutNumFormat fmt, String transUnit, LayoutUnitTable units) {
        int p = col.length() == null ? 0 : col.length();
        int s = col.scale() == null ? 0 : col.scale();
        int implied = fmt == null ? s : fmt.impliedScale();
        int point = implied == 0 && s > 0 ? 1 : 0;
        int sign = fmt != null && fmt.sign() ? 1 : 0;
        return (p - s) + growth(col.unitCode(), transUnit, units) + s + point + sign;
    }

    private static int growth(String base, String trans, LayoutUnitTable units) {
        if (trans == null || base == null || !units.has(trans) || !units.has(base)) {
            return 0;
        }
        BigDecimal ratio = units.require(base).factor().divide(units.require(trans).factor(), MC);
        int k = 0;
        BigDecimal p = BigDecimal.ONE;
        while (p.compareTo(ratio) < 0) {
            p = p.multiply(BigDecimal.TEN);
            k++;
        }
        return k;
    }

    private static void constValue(int seq, String field, String phys, String value, Integer length, Charset charset,
                                   BiFunction<String, String, Judgement> judge, List<LayoutIssue> issues, List<LayoutIssue> warnings) {
        int bytes = value.getBytes(charset).length;
        if (length != null && bytes > length) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L12, seq, field,
                    "CONST 값 " + value + " 은 " + bytes + "바이트로 항목 길이 " + length + " 를 넘는다(" + charset.name() + ")"));
            return;
        }
        Judgement j = judge.apply(phys, value);
        if (Judgement.FAIL.equals(j.result())) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L12, seq, field, "CONST 값 " + value + " 이 도메인 유효 식을 어긴다: " + j.message()));
        } else if (Judgement.UNDECIDED.equals(j.result())) {
            warnings.add(LayoutIssue.of(LayoutIssueCode.L12, seq, field, "CONST 값 " + value + " 을 판정할 수 없다: " + j.message()));
        }
    }

    private static void transUnit(LayoutItemDraft item, LayoutColumnInfo col, LayoutUnitTable units, List<LayoutIssue> issues) {
        String key = Field.TRANS_UNIT.key();
        String trans = item.transUnit();
        if (!units.has(trans)) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L13, item.seq(), key, "단위 마스터에 없는 전송 단위다: " + trans));
        } else if (col.unitCode() == null) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L13, item.seq(), key,
                    "도메인 " + col.domainName() + " 에 기준 단위가 없어 전송 단위를 쓸 수 없다: " + trans));
        } else if (!units.has(col.unitCode())) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L13, item.seq(), key, "단위 마스터에 없는 기준 단위다: " + col.unitCode()));
        } else {
            LayoutUnitTable.Unit base = units.require(col.unitCode());
            LayoutUnitTable.Unit to = units.require(trans);
            if (!base.dimension().equals(to.dimension())) {
                issues.add(LayoutIssue.of(LayoutIssueCode.L13, item.seq(), key, "전송 단위의 차원이 기준 단위와 다르다: "
                        + base.code() + "(" + base.dimension() + ") → " + to.code() + "(" + to.dimension() + ")"));
            }
        }
    }

    private static void width(LayoutItemDraft item, LayoutColumnInfo col, LayoutUnitTable units, List<LayoutIssue> issues) {
        LayoutNumFormat fmt = null;
        if (item.numFormat() != null) {
            try {
                fmt = LayoutNumFormatCodec.decode(item.numFormat());
            } catch (IllegalArgumentException e) {
                return; // L08
            }
        }
        Integer w = fmt != null ? Integer.valueOf(fmt.width()) : col.length();
        if (w == null) {
            return; // L07
        }
        int need = requiredWidth(col, fmt, item.transUnit(), units);
        if (w < need) {
            int s = col.scale() == null ? 0 : col.scale();
            issues.add(LayoutIssue.of(LayoutIssueCode.L14, item.seq(), Field.NUM_FORMAT.key(),
                    "표현 자리 " + w + "는 도메인 " + col.domainName() + "(숫자 " + col.length() + "," + s + ")를 담지 못합니다"));
        }
    }

    private static void unitItem(LayoutItemDraft item, List<LayoutItemDraft> items, List<LayoutIssue> issues) {
        boolean found = items.stream().anyMatch(o -> o != item && o.seq() != item.seq() && item.unitItem().equals(o.columnPhys()));
        if (!found) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L15, item.seq(), Field.UNIT_ITEM.key(),
                    "단위 항목이 같은 레이아웃의 다른 항목을 가리키지 않는다: " + item.unitItem()));
        }
    }
}
