package com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;

/**
 * 검사값과 기준으로 항목 판정을 계산하고, 항목 판정으로 코일 판정(시스템 제안)을 계산한다. 상태가 없는 순수 규칙이다.
 *
 * <ul>
 *   <li>값이 비었거나 「—」 → 미검(NONE). 값이 「재검」 → 보류(HOLD).</li>
 *   <li>RANGE: 하한 ≤ 값 ≤ 상한(한쪽만 있으면 그쪽만 본다) → 합, 아니면 부. 두께 편차 ±x 는 하한 -x, 상한 x 다.</li>
 *   <li>GRADE: 등급 A 가 가장 좋다. 기준 등급(GRADE_LMT) 이상(A~기준)이면 합, 아래면 부.</li>
 *   <li>코일: 부가 하나라도 있으면 불합격, 아니고 미검·보류가 있으면 보류, 모두 합이면 합격.</li>
 * </ul>
 */
public final class InspectionEvaluator {

    public static final String RANGE = "RANGE";
    public static final String GRADE = "GRADE";
    public static final String RETEST = "재검";
    static final List<String> GRADES = List.of("A", "B", "C", "D");

    private InspectionEvaluator() {
    }

    /** 입력값을 저장 형태로 다듬는다. 빈 값·「—」 는 null, 등급은 대문자. 형식이 틀리면 IllegalArgumentException. */
    public static String normalize(String critTp, String raw) {
        if (raw == null) return null;
        String v = raw.trim();
        if (v.isEmpty() || "—".equals(v) || "-".equals(v)) return null;
        if (RETEST.equals(v)) return v;
        if (GRADE.equals(critTp)) {
            String g = v.toUpperCase();
            if (!GRADES.contains(g)) throw new IllegalArgumentException("등급은 A·B·C·D 또는 재검이어야 합니다: " + raw);
            return g;
        }
        try {
            new BigDecimal(v);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("숫자 또는 재검이어야 합니다: " + raw);
        }
        return v;
    }

    /** 항목 하나를 판정한다. value 는 normalize 를 거친 값이다. */
    public static ItemResult evaluate(String critTp, BigDecimal lower, BigDecimal upper, String gradeLmt, String value) {
        if (value == null || value.isBlank() || "—".equals(value.trim())) return ItemResult.NONE;
        String v = value.trim();
        if (RETEST.equals(v)) return ItemResult.HOLD;
        if (GRADE.equals(critTp)) {
            int got = GRADES.indexOf(v.toUpperCase());
            int lmt = gradeLmt == null ? GRADES.size() - 1 : GRADES.indexOf(gradeLmt.trim().toUpperCase());
            return got >= 0 && got <= lmt ? ItemResult.PASS : ItemResult.FAIL;
        }
        BigDecimal n;
        try {
            n = new BigDecimal(v);
        } catch (NumberFormatException e) {
            return ItemResult.NONE;
        }
        if (lower != null && n.compareTo(lower) < 0) return ItemResult.FAIL;
        if (upper != null && n.compareTo(upper) > 0) return ItemResult.FAIL;
        return ItemResult.PASS;
    }

    /** 항목 판정 묶음으로 코일 판정을 제안한다. 항목이 없으면 보류. */
    public static JudgmentStatus suggest(Collection<ItemResult> results) {
        if (results == null || results.isEmpty()) return JudgmentStatus.HOLD;
        if (results.contains(ItemResult.FAIL)) return JudgmentStatus.FAIL;
        if (results.contains(ItemResult.NONE) || results.contains(ItemResult.HOLD)) return JudgmentStatus.HOLD;
        return JudgmentStatus.PASS;
    }

    /** 항목 묶음(도금량·표면·기계적성질·치수)의 대표 판정. 부 > 보류 > 미검 > 합 순으로 나쁜 쪽을 고른다. */
    public static ItemResult worst(Collection<ItemResult> results) {
        if (results == null || results.isEmpty()) return ItemResult.NONE;
        if (results.contains(ItemResult.FAIL)) return ItemResult.FAIL;
        if (results.contains(ItemResult.HOLD)) return ItemResult.HOLD;
        if (results.contains(ItemResult.NONE)) return ItemResult.NONE;
        return ItemResult.PASS;
    }
}
