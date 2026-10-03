package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import org.junit.jupiter.api.Test;

/** D-154 — 목차로 버전 고르기(스펙 §3.2)와 다음 경계(선택이 바뀔 수 있는 가장 이른 시각). */
class MdmVersionSelectorTest {

    private static final LocalDateTime OPEN = LocalDateTime.of(9999, 12, 31, 0, 0);

    private static MdmTocVersion v(String ver, String from, String to) {
        return new MdmTocVersion(new BigDecimal(ver), "RELEASED", from == null ? null : LocalDateTime.parse(from),
                to == null ? null : LocalDateTime.parse(to));
    }

    private static final MdmToc TOC = new MdmToc(null, List.of(
            v("1.000", "2026-01-01T00:00:00", "2026-04-01T00:00:00"),
            v("1.001", "2026-03-01T00:00:00", "2026-05-01T00:00:00"),     // 1.000 과 겹친다
            v("2.000", "2026-06-01T00:00:00", null)));                    // 빈틈 [05-01, 06-01), 열린 끝(null)

    @Test
    void 룰_세트_전문은_덮는_것_중_ver_최대이고_소급하지_않는다() {
        for (MdmTargetType t : List.of(MdmTargetType.RULE, MdmTargetType.RULE_SET, MdmTargetType.LAYOUT)) {
            assertThat(MdmVersionSelector.select(t, TOC, LocalDateTime.parse("2026-03-15T00:00:00"))).contains("1.001");
            assertThat(MdmVersionSelector.select(t, TOC, LocalDateTime.parse("2025-12-31T23:59:59"))).isEmpty();
            assertThat(MdmVersionSelector.select(t, TOC, LocalDateTime.parse("2026-05-15T00:00:00"))).isEmpty();
            assertThat(MdmVersionSelector.select(t, TOC, LocalDateTime.parse("2030-01-01T00:00:00"))).contains("2.000");
        }
    }

    @Test
    void 코드는_덮는_것_중_적용_시작이_가장_이른_것이고_없으면_가장_작은_ver_로_소급한다() {
        MdmToc code = new MdmToc(new CodeHeader("C", "INUSE"), List.of(
                v("1.000", "2026-01-01T00:00:00", "2026-04-01T00:00:00"),
                v("1.001", "2026-03-01T00:00:00", "2026-05-01T00:00:00"),
                v("2.000", "2026-06-01T00:00:00", "9999-12-31T00:00:00")));
        assertThat(MdmVersionSelector.select(MdmTargetType.CODE, code, LocalDateTime.parse("2026-03-15T00:00:00"))).contains("1.000");
        assertThat(MdmVersionSelector.select(MdmTargetType.CODE, code, LocalDateTime.parse("2025-01-01T00:00:00"))).contains("1.000");
        assertThat(MdmVersionSelector.select(MdmTargetType.CODE, code, LocalDateTime.parse("2026-05-15T00:00:00"))).contains("1.000");
        assertThat(MdmVersionSelector.select(MdmTargetType.CODE, new MdmToc(new CodeHeader("C", "INUSE"), List.of()),
                LocalDateTime.parse("2026-05-15T00:00:00"))).isEmpty();
    }

    @Test
    void 코드_목차의_applyTo_null_은_열린_끝이고_applyFrom_null_은_덮지_않되_소급_후보로는_남는다() {
        MdmToc openEnd = new MdmToc(new CodeHeader("C", "INUSE"), List.of(
                v("1.000", "2026-01-01T00:00:00", "2026-06-01T00:00:00"),
                v("2.000", "2026-06-01T00:00:00", null)));
        assertThat(MdmVersionSelector.select(MdmTargetType.CODE, openEnd, LocalDateTime.parse("2030-01-01T00:00:00"))).contains("2.000");
        assertThat(MdmVersionSelector.select(MdmTargetType.CODE, openEnd, LocalDateTime.parse("2026-03-01T00:00:00"))).contains("1.000");
        assertThat(openEnd.codeRows().versions().get(1).applyTo()).as("엔진 열린 끝").isEqualTo(OPEN);
        assertThat(openEnd.versions().get(1).applyTo()).as("목차 자체(JSON·경계)는 그대로").isNull();

        MdmToc noStart = new MdmToc(new CodeHeader("C", "INUSE"), List.of(
                v("1.000", null, null),
                v("2.000", "2026-06-01T00:00:00", null)));
        assertThat(MdmVersionSelector.select(MdmTargetType.CODE, noStart, LocalDateTime.parse("2030-01-01T00:00:00"))).contains("2.000");
        assertThat(MdmVersionSelector.select(MdmTargetType.CODE, noStart, LocalDateTime.parse("2026-03-01T00:00:00")))
                .as("시작 없는 1.000 은 덮지 않지만 가장 작은 ver 소급으로 고른다").contains("1.000");
    }

    @Test
    void 다음_경계는_t_보다_뒤인_가장_이른_applyFrom_applyTo_이고_없으면_MAX_다() {
        assertThat(MdmVersionSelector.nextBoundary(TOC, LocalDateTime.parse("2025-06-01T00:00:00"))).isEqualTo(LocalDateTime.parse("2026-01-01T00:00:00"));
        assertThat(MdmVersionSelector.nextBoundary(TOC, LocalDateTime.parse("2026-01-01T00:00:00"))).isEqualTo(LocalDateTime.parse("2026-03-01T00:00:00"));
        assertThat(MdmVersionSelector.nextBoundary(TOC, LocalDateTime.parse("2026-04-15T00:00:00"))).isEqualTo(LocalDateTime.parse("2026-05-01T00:00:00"));
        assertThat(MdmVersionSelector.nextBoundary(TOC, LocalDateTime.parse("2030-01-01T00:00:00"))).isEqualTo(LocalDateTime.MAX);
        MdmToc open = new MdmToc(null, List.of(new MdmTocVersion(new BigDecimal("1.000"), "RELEASED",
                LocalDateTime.parse("2026-01-01T00:00:00"), OPEN)));
        assertThat(MdmVersionSelector.nextBoundary(open, LocalDateTime.parse("2026-02-01T00:00:00"))).isEqualTo(OPEN);
    }
}
