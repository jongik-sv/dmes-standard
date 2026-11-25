package com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class InspectionEvaluatorTest {

    private static BigDecimal d(String v) {
        return v == null ? null : new BigDecimal(v);
    }

    @Test
    @DisplayName("범위 기준: 하한·상한 포함이면 합, 벗어나면 부, 열린 상한은 하한만 본다")
    void range() {
        assertThat(InspectionEvaluator.evaluate("RANGE", d("100"), d("150"), null, "92")).isEqualTo(ItemResult.FAIL);
        assertThat(InspectionEvaluator.evaluate("RANGE", d("80"), d("120"), null, "80")).isEqualTo(ItemResult.PASS);
        assertThat(InspectionEvaluator.evaluate("RANGE", d("570"), null, null, "548")).isEqualTo(ItemResult.FAIL);
        assertThat(InspectionEvaluator.evaluate("RANGE", d("245"), null, null, "9999")).isEqualTo(ItemResult.PASS);
        assertThat(InspectionEvaluator.evaluate("RANGE", d("-0.020"), d("0.020"), null, "+0.008")).isEqualTo(ItemResult.PASS);
        assertThat(InspectionEvaluator.evaluate("RANGE", d("-0.020"), d("0.020"), null, "-0.021")).isEqualTo(ItemResult.FAIL);
    }

    @Test
    @DisplayName("등급 기준: B 이상이면 A·B 합, C 부. 빈 값은 미검, 재검은 보류")
    void gradeAndSpecialValues() {
        assertThat(InspectionEvaluator.evaluate("GRADE", null, null, "B", "A")).isEqualTo(ItemResult.PASS);
        assertThat(InspectionEvaluator.evaluate("GRADE", null, null, "B", "B")).isEqualTo(ItemResult.PASS);
        assertThat(InspectionEvaluator.evaluate("GRADE", null, null, "B", "C")).isEqualTo(ItemResult.FAIL);
        assertThat(InspectionEvaluator.evaluate("RANGE", d("205"), d("380"), null, null)).isEqualTo(ItemResult.NONE);
        assertThat(InspectionEvaluator.evaluate("RANGE", d("205"), d("380"), null, "—")).isEqualTo(ItemResult.NONE);
        assertThat(InspectionEvaluator.evaluate("GRADE", null, null, "B", "재검")).isEqualTo(ItemResult.HOLD);
    }

    @Test
    @DisplayName("코일 제안: 부가 있으면 불합격, 미검·보류가 있으면 보류, 모두 합이면 합격")
    void suggest() {
        assertThat(InspectionEvaluator.suggest(List.of(ItemResult.PASS, ItemResult.FAIL, ItemResult.NONE))).isEqualTo(JudgmentStatus.FAIL);
        assertThat(InspectionEvaluator.suggest(List.of(ItemResult.PASS, ItemResult.NONE))).isEqualTo(JudgmentStatus.HOLD);
        assertThat(InspectionEvaluator.suggest(List.of(ItemResult.PASS, ItemResult.HOLD))).isEqualTo(JudgmentStatus.HOLD);
        assertThat(InspectionEvaluator.suggest(List.of(ItemResult.PASS, ItemResult.PASS))).isEqualTo(JudgmentStatus.PASS);
        assertThat(InspectionEvaluator.worst(List.of(ItemResult.PASS, ItemResult.NONE, ItemResult.HOLD))).isEqualTo(ItemResult.HOLD);
    }

    @Test
    @DisplayName("입력 다듬기: 빈 값은 null, 등급은 대문자, 숫자가 아니면 거절")
    void normalize() {
        assertThat(InspectionEvaluator.normalize("RANGE", "  ")).isNull();
        assertThat(InspectionEvaluator.normalize("GRADE", "b")).isEqualTo("B");
        assertThat(InspectionEvaluator.normalize("RANGE", " 268 ")).isEqualTo("268");
        assertThat(InspectionEvaluator.normalize("RANGE", "재검")).isEqualTo("재검");
        assertThatThrownBy(() -> InspectionEvaluator.normalize("RANGE", "abc")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> InspectionEvaluator.normalize("GRADE", "E")).isInstanceOf(IllegalArgumentException.class);
    }
}
