package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

/** 변경 기록 시각(UX 1차 U22) — 델타의 {@code at} 문자열 모양. */
class ErdDeltaAtTest {

    /** LocalDateTime.toString 은 초가 0 이면 줄여 쓴다("14:03"). 화면이 읽을 모양은 늘 초까지다. */
    @Test
    void atKeepsZeroSeconds() {
        assertThat(ErdDelta.atOf(LocalDateTime.of(2026, 10, 11, 14, 3, 0))).isEqualTo("2026-10-11T14:03:00");
        assertThat(ErdDelta.atOf(LocalDateTime.of(2026, 10, 11, 14, 3, 22, 123_456_000))).isEqualTo("2026-10-11T14:03:22");
        assertThat(ErdDelta.atOf(null)).isNull();
    }

    @Test
    void oldConstructorsLeaveAtNull() {
        assertThat(new ErdDelta("m", 1, "u", "s", "UI", List.of()).at()).isNull();
        assertThat(new ErdDelta("m", 1, "u", "s", "UI", 7L, List.of()).at()).isNull();
    }

    @Test
    void jsonCarriesAt() {
        var d = new ErdDelta("m", 1, "u", "s", "UI", null, List.of(), "2026-10-11T14:03:00");
        JsonNode j = ErdModelCodec.MAPPER.valueToTree(d);
        assertThat(j.path("at").asText()).isEqualTo("2026-10-11T14:03:00");
    }
}
