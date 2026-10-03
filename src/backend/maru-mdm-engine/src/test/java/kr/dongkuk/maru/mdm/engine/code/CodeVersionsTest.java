package kr.dongkuk.maru.mdm.engine.code;

import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.OPEN_DT;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.dt;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.ver;
import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;
import org.junit.jupiter.api.Test;

/** D-154 — 코드 버전 고르기를 엔진 공개 함수로 꺼냈다(스펙 §3.2). 해석기·MDM 목차·업무 모듈 캐시가 같은 함수를 쓴다. */
class CodeVersionsTest {

    private static final List<CodeVersionRow> V = List.of(
            new CodeVersionRow(ver("1.000"), "RELEASED", dt("2026-01-01T00:00"), dt("2026-04-01T00:00")),
            new CodeVersionRow(ver("1.001"), "CANCELLED", null, null),
            // 빈틈 [2026-04-01, 2026-05-01)
            new CodeVersionRow(ver("2.000"), "RELEASED", dt("2026-05-01T00:00"), dt("2026-08-01T00:00")),
            new CodeVersionRow(ver("3.000"), "DRAFT", null, null));

    @Test
    void 덮는_RELEASED_를_고르고_경계는_시작_포함_끝_제외다() {
        assertEquals(Optional.of(ver("1.000")), CodeVersions.select(V, dt("2026-01-01T00:00")));
        assertEquals(Optional.of(ver("1.000")), CodeVersions.select(V, dt("2026-03-31T23:59:59")));
        assertEquals(Optional.of(ver("2.000")), CodeVersions.select(V, dt("2026-05-01T00:00")));
    }

    @Test
    void 첫_버전_앞_빈틈_닫힌_끝_뒤는_가장_작은_RELEASED_로_소급한다() {
        assertEquals(Optional.of(ver("1.000")), CodeVersions.select(V, dt("2025-06-01T00:00")));
        assertEquals(Optional.of(ver("1.000")), CodeVersions.select(V, dt("2026-04-15T00:00")));
        assertEquals(Optional.of(ver("1.000")), CodeVersions.select(V, dt("2026-09-01T00:00")));
    }

    @Test
    void 겹치면_적용_시작이_가장_이른_것이고_RELEASED_가_없으면_빈_값이다() {
        List<CodeVersionRow> overlap = List.of(
                new CodeVersionRow(ver("1.000"), "RELEASED", dt("2026-01-01T00:00"), OPEN_DT),
                new CodeVersionRow(ver("2.000"), "RELEASED", dt("2026-02-01T00:00"), OPEN_DT));
        assertEquals(Optional.of(ver("1.000")), CodeVersions.select(overlap, dt("2026-03-01T00:00")));
        assertEquals(Optional.<BigDecimal>empty(),
                CodeVersions.select(List.of(new CodeVersionRow(ver("1.000"), "DRAFT", null, null)), dt("2026-03-01T00:00")));
    }
}
