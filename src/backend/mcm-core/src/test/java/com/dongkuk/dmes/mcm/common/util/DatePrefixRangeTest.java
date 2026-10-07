package com.dongkuk.dmes.mcm.common.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class DatePrefixRangeTest {

    @Test
    @DisplayName("연·월·일·시·분·초 앞 일치는 다음 단위 시작까지의 반열린 범위가 된다")
    void 달력단위_앞일치() {
        assertRange("2026%", "20260101000000", "20270101000000");
        assertRange("202610%", "20261001000000", "20261101000000");
        assertRange("202612%", "20261201000000", "20270101000000");
        assertRange("20261003%", "20261003000000", "20261004000000");
        assertRange("2026100312%", "20261003120000", "20261003130000");
        assertRange("202610031259%", "20261003125900", "20261003130000");
        assertRange("20261003125959%", "20261003125959", "20261003130000");
    }

    @Test
    @DisplayName("윤일·월말 경계를 넘긴다")
    void 경계() {
        assertRange("20240229%", "20240229000000", "20240301000000");
        assertRange("20261231%", "20261231000000", "20270101000000");
    }

    @Test
    @DisplayName("범위로 바꾸지 못하면 비어 있다 — 중간 일치·_ 패턴·% 없음·달력 단위 아님·없는 날짜·범위 밖 연도")
    void 바꾸지_못하는_경우() {
        assertThat(DatePrefixRange.of(null)).isEmpty();
        assertThat(DatePrefixRange.of("")).isEmpty();
        assertThat(DatePrefixRange.of("%1003%")).isEmpty();
        assertThat(DatePrefixRange.of("2026_0%")).isEmpty();
        assertThat(DatePrefixRange.of("20261003")).isEmpty();       // % 가 없으면 현행 LIKE(=전체 일치)
        assertThat(DatePrefixRange.of("20261%")).isEmpty();         // 5자 — 달력 단위 아님
        assertThat(DatePrefixRange.of("202613%")).isEmpty();        // 13월
        assertThat(DatePrefixRange.of("20260231%")).isEmpty();      // 2월 31일
        assertThat(DatePrefixRange.of("2026100325%")).isEmpty();    // 25시
        assertThat(DatePrefixRange.of("0000%")).isEmpty();          // Oracle 은 0000 년을 받지 않는다
        assertThat(DatePrefixRange.of("9999%")).isEmpty();          // 다음 해가 10000 년
        assertThat(DatePrefixRange.of("2026%%")).isEmpty();
    }

    private static void assertRange(String like, String from, String to) {
        assertThat(DatePrefixRange.of(like)).hasValueSatisfying(r -> {
            assertThat(r.from()).isEqualTo(from);
            assertThat(r.to()).isEqualTo(to);
        });
    }
}
