package com.dongkuk.dmes.mqc.qdm.qualitySpec.engine;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mqc.qdm.qualitySpec.QualitySpecFixture;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecAttr;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SpecDslTest {

    private final List<QualitySpecAttr> dict = QualitySpecFixture.dictionary();

    @Test
    @DisplayName("연산자 없는 항목은 사전 항목명 앞머리로 읽고, 고객사·품명을 채번 기준으로 뽑는다")
    void parsesNoOperatorForm() {
        SpecDsl.Line line = SpecDsl.parseLine("고객사 = 320104, 품명 = L, 원재료 두께 1.2 | 원재료 재질 = H36", dict);

        assertThat(line.ok()).isTrue();
        assertThat(line.cus()).isEqualTo("320104");
        assertThat(line.prd()).isEqualTo("L");
        assertThat(line.conds()).extracting(SpecDsl.Token::attrCd).containsExactly("CUS_CD", "PRD_NM_CD", "RAW_THK");
        SpecDsl.Token thk = line.conds().get(2);
        assertThat(thk.op()).isEqualTo("=");
        assertThat(thk.val()).isEqualTo("1.2");
        assertThat(thk.unit()).isEqualTo("mm");
        assertThat(line.results()).singleElement().satisfies(t -> {
            assertThat(t.attrCd()).isEqualTo("RAW_MTRL");
            assertThat(t.val()).isEqualTo("H36");
        });
        assertThat(line.issues()).isEmpty();
    }

    @Test
    @DisplayName(">= 는 ≥ 로, n~m 은 범위(~)로, 따옴표는 떼고 따옴표 안 쉼표는 나누지 않는다")
    void operatorsRangesQuotes() {
        SpecDsl.Line line = SpecDsl.parseLine("고객사 = 110197, 품명 = L, BOM = 'A6,0041', 원재료 폭 >= 1100 | 광택 = 25~35", dict);

        assertThat(line.conds()).hasSize(4);
        assertThat(line.conds().get(2).val()).isEqualTo("A6,0041");
        assertThat(line.conds().get(3).op()).isEqualTo("≥");
        assertThat(line.conds().get(3).val()).isEqualTo("1100");
        assertThat(line.results().get(0).op()).isEqualTo("~");
        assertThat(line.results().get(0).val()).isEqualTo("25~35");
    }

    @Test
    @DisplayName("항목은 시스템 코드(대소문자 무시)로도 찾고, 사용 중지 항목은 알아보지 않는다")
    void codeLookupAndInactive() {
        List<QualitySpecAttr> d = new ArrayList<>(dict);
        d.stream().filter(a -> a.getAttrCd().equals("GLOSS")).findFirst().orElseThrow().setUseYn("N");

        SpecDsl.Line line = SpecDsl.parseLine("고객사 = 110197, 품명 = 3, color_cd = RAL9016 | 광택 = 40", d);

        assertThat(line.conds().get(2).attrCd()).isEqualTo("COLOR_CD");
        assertThat(line.results().get(0).attr()).isNull();
        assertThat(line.mapped()).isFalse();
        assertThat(line.issues()).anySatisfy(i -> {
            assertThat(i.level()).isEqualTo(SpecDsl.Level.WARN);
            assertThat(i.quickAdd()).isTrue();
            assertThat(i.kindGuess()).isEqualTo("RESULT");
        });
        assertThat(line.ok()).isTrue();
    }

    @Test
    @DisplayName("고객사·품명이 없거나 '|' 뒤 결과가 없으면 오류, '|' 가 없으면 경고, 자리 바뀐 항목은 경고")
    void errorsAndWarnings() {
        SpecDsl.Line noCus = SpecDsl.parseLine("품명 = L | 원재료 재질 = H36", dict);
        assertThat(noCus.errors()).containsExactly("조건에 고객사가 필요합니다 (채번 기준)");

        SpecDsl.Line noResult = SpecDsl.parseLine("고객사 = 110197, 품명 = L |", dict);
        assertThat(noResult.errors()).containsExactly("'|' 뒤에 설계결과가 없습니다");

        SpecDsl.Line noBar = SpecDsl.parseLine("고객사 = 110197, 품명 = L, 광택 = 30", dict);
        assertThat(noBar.ok()).isTrue();
        assertThat(noBar.issues()).extracting(SpecDsl.Issue::msg)
                .anyMatch(m -> m.startsWith("'|' 구분자가 없습니다"))
                .anyMatch(m -> m.contains("설계결과용 항목인데 조건 영역에 있습니다"));

        SpecDsl.Line unknown = SpecDsl.parseLine("고객사 = 110197, 품명 = L, 아무말 | 광택 = 30", dict);
        assertThat(unknown.errors()).containsExactly("\"아무말\" — 항목명을 인식할 수 없습니다");

        SpecDsl.Line empty = SpecDsl.parseLine("고객사 = 110197, 품명 = L, 원재료 두께 = | 광택 = 30", dict);
        assertThat(empty.errors()).containsExactly("\"원재료 두께\" — 값이 없습니다");
    }

    @Test
    @DisplayName("표시값: = 는 '= 값', ~ 는 값만, 부등호는 '≥ 값'. 설계 적용값은 = 와 ~ 를 값만 보인다")
    void displayValues() {
        assertThat(SpecDsl.dispValue("=", "H36")).isEqualTo("= H36");
        assertThat(SpecDsl.dispValue("~", "0.5~0.8")).isEqualTo("0.5~0.8");
        assertThat(SpecDsl.dispValue("≥", "20")).isEqualTo("≥ 20");
        assertThat(SpecDsl.resultValue("=", "H36")).isEqualTo("H36");
        assertThat(SpecDsl.resultValue("≥", "20")).isEqualTo("≥ 20");
    }
}
