package com.dongkuk.dmes.mqc.qdm.qualitySpec.engine;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SpecMatcherTest {

    @Test
    @DisplayName("= 는 대소문자 무시 글자 같음 또는 숫자 같음(0.80 = 0.8)")
    void equality() {
        assertThat(SpecMatcher.compare("=", "ral9016", "RAL9016")).isTrue();
        assertThat(SpecMatcher.compare("=", "0.80", "0.8")).isTrue();
        assertThat(SpecMatcher.compare("=", "1.2", "1.25")).isFalse();
        assertThat(SpecMatcher.compare("=", "A60041", "'A60041'")).isTrue();
    }

    @Test
    @DisplayName("~ 는 양끝 포함 범위, 부등호는 숫자 비교, 주문값이 없으면 불일치")
    void rangesAndInequalities() {
        assertThat(SpecMatcher.compare("~", "0.8", "0.5~0.8")).isTrue();
        assertThat(SpecMatcher.compare("~", "0.5", "0.5~0.8")).isTrue();
        assertThat(SpecMatcher.compare("~", "0.81", "0.5~0.8")).isFalse();
        assertThat(SpecMatcher.compare("≥", "1100", "1100")).isTrue();
        assertThat(SpecMatcher.compare(">", "1100", "1100")).isFalse();
        assertThat(SpecMatcher.compare("<", "938", "1000")).isTrue();
        assertThat(SpecMatcher.compare("≤", "abc", "10")).isFalse();
        assertThat(SpecMatcher.compare("=", null, "10")).isFalse();
        assertThat(SpecMatcher.compare("=", "", "10")).isFalse();
    }
}
