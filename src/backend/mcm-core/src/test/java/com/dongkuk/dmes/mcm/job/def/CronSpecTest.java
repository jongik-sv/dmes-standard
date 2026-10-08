package com.dongkuk.dmes.mcm.job.def;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class CronSpecTest {

    private static final LocalDateTime BASE = LocalDateTime.parse("2026-10-08T21:23:00");   // 목요일

    @ParameterizedTest(name = "[{index}] {0} → {1}")
    @CsvSource(delimiter = '|', value = {
            "* * * * *|2026-10-08T21:24:00",
            "*/10 * * * *|2026-10-08T21:30:00",
            "0 2 * * *|2026-10-09T02:00:00",
            "0 9 * * 1-5|2026-10-09T09:00:00",
            "0 4 * * 0|2026-10-11T04:00:00",
            "0 4 * * 7|2026-10-11T04:00:00",
            "0 4 * * sun|2026-10-11T04:00:00",
            "30 0 1 * *|2026-11-01T00:30:00",
            "0 9,15 * * MON-FRI|2026-10-09T09:00:00",
            "*/30 8-20 * * 1-6|2026-10-09T08:00:00",
            "@daily|2026-10-09T00:00:00",
            "@hourly|2026-10-08T22:00:00",
            "0 0 31 * *|2026-10-31T00:00:00",
    })
    @DisplayName("다음 시각 — 기준 2026-10-08T21:23 (Asia/Seoul 벽시계)")
    void next(String expr, String expected) {
        assertThat(CronSpec.parse(expr).next(BASE)).isEqualTo(LocalDateTime.parse(expected));
    }

    @Test
    @DisplayName("next 는 엄격히 뒤이다 — 정각 입력은 그 시각을 돌려주지 않는다")
    void nextIsStrictlyAfter() {
        CronSpec spec = CronSpec.parse("0 2 * * *");
        assertThat(spec.next(LocalDateTime.parse("2026-10-09T02:00:00"))).isEqualTo(LocalDateTime.parse("2026-10-10T02:00:00"));
        assertThat(spec.nextN(BASE, 3)).containsExactly(
                LocalDateTime.parse("2026-10-09T02:00:00"), LocalDateTime.parse("2026-10-10T02:00:00"), LocalDateTime.parse("2026-10-11T02:00:00"));
    }

    @ParameterizedTest(name = "[{index}] 거절: {0}")
    @ValueSource(strings = {"0 9 1 * 1", "0 0 0 * * *", "0 0 L * *", "0 0 ? * *", "0 0 1W * *", "0 0 * * 1#2", "60 * * * *",
            "* 24 * * *", "* * 0 * *", "* * * 13 *", "* * * * 8", "5-1 * * * *", "*/0 * * * *", "@never", "a b c d e", "0 0 */2 * 1"})
    void rejects(String expr) {
        assertThat(CronSpec.validate(expr)).isPresent();
        assertThatThrownBy(() -> CronSpec.parse(expr)).isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   "})
    void rejectsBlank(String expr) {
        assertThat(CronSpec.validate(expr)).isPresent();
    }

    @Test
    @DisplayName("오류 문구는 어느 칸이 왜 틀렸는지 한국어로 알린다")
    void messages() {
        assertThat(CronSpec.validate("* * * * 8")).contains("요일 칸(5번째) 값 8 은 0~7 범위를 벗어났습니다");
        assertThat(CronSpec.validate("0 9 1 * 1").orElseThrow()).contains("일과 요일 중 하나는 * 로 두세요");
        assertThat(CronSpec.validate("0 0 0 * * *").orElseThrow()).contains("5칸");
        assertThat(CronSpec.validate("0 0 L * *").orElseThrow()).contains("지원하지 않는");
    }

    @Test
    @DisplayName("유효한 식은 validate 가 empty 이다")
    void validatePasses() {
        assertThat(CronSpec.validate("*/5 * * * *")).isEqualTo(Optional.empty());
    }

    @ParameterizedTest(name = "[{index}] {0} → 최소 간격 {1}분")
    @CsvSource(delimiter = '|', value = {"*/5 * * * *|5", "0 9,15 * * *|360", "0,5 * * * *|5", "0 0 1 * *|40320"})
    @DisplayName("minGap — 2026-01-01 부터 366일 안 연속 실행 간격의 최솟값(월 1일 실행은 2월 28일 = 40320분)")
    void minGap(String expr, long minutes) {
        assertThat(CronSpec.parse(expr).minGap(LocalDateTime.parse("2026-01-01T00:00:00"), Duration.ofDays(366)))
                .isEqualTo(Duration.ofMinutes(minutes));
    }

    @Test
    @DisplayName("minGap — 366일 안에 실행이 2회 미만이면 366일")
    void minGapSparse() {
        assertThat(CronSpec.parse("0 0 1 1 *").minGap(LocalDateTime.parse("2026-01-02T00:00:00"), Duration.ofDays(300)))
                .isEqualTo(Duration.ofDays(366));
    }

    @ParameterizedTest(name = "[{index}] {0} → {1}")
    @CsvSource(delimiter = '|', value = {
            "* * * * *|매분",
            "*/10 * * * *|10분마다",
            "0 * * * *|매시 정각",
            "15 * * * *|매시 15분",
            "0 2 * * *|매일 02:00",
            "0 9 * * 1-5|평일 09:00",
            "0 4 * * 0|매주 일요일 04:00",
            "0 4 * * 7|매주 일요일 04:00",
            "0 4 * * SUN|매주 일요일 04:00",
            "30 0 1 * *|매월 1일 00:30",
            "@hourly|매시 정각",
            "@daily|매일 00:00",
            "*/30 8-20 * * 1-6|월~토 8~20시 30분마다",
            "0 9,15 * * MON-FRI|0 9,15 * * MON-FRI (직접 입력)",
    })
    void describe(String expr, String expected) {
        assertThat(CronSpec.parse(expr).describe()).isEqualTo(expected);
    }

    @Test
    @DisplayName("expression() 은 공백을 하나로 맞추고 매크로를 펼친다")
    void expressionIsNormalized() {
        assertThat(CronSpec.parse("  0   2 * *   *").expression()).isEqualTo("0 2 * * *");
        assertThat(CronSpec.parse("@weekly").expression()).isEqualTo("0 0 * * 0");
        assertThat(List.of(CronSpec.parse("0 4 * * sun").expression())).containsExactly("0 4 * * SUN");
    }
}
