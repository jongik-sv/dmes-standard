package kr.dongkuk.maru.mdm.engine.code;

import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.dt;
import static kr.dongkuk.maru.mdm.engine.testsupport.PortFixtures.PORT;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.code.MasterDataRows.DataHeader;
import kr.dongkuk.maru.mdm.engine.testsupport.PortFixtures;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvFileSource;
import org.junit.jupiter.params.provider.CsvSource;

/**
 * TSK-03-02 design.md §3.2·§6.11(D1) — 05 마루 데이터 판정(① 데이터 닫힘 ② 항목 선분 ③ 카테고리 선분 ④ 소속,
 * 최초 행 소급, 05:361-415). 수용 기준 4: 05 PORT 판정 7케이스.
 */
class MasterDataResolverTest {

    private static final MasterDataResolver PORT_RESOLVER = PortFixtures.resolver(PortFixtures.port());

    @ParameterizedTest(name = "{0} {1} {2} {3} → {4}")
    @CsvFileSource(resources = "/kr/dongkuk/maru/mdm/engine/code/05-port-cases.csv", numLinesToSkip = 1)
    void 원천05_PORT_판정_7케이스(String id, String cate, String key, LocalDateTime baseDt, boolean expected) {
        assertEquals(expected, PORT_RESOLVER.isValid(id, cate, key, baseDt));
    }

    @ParameterizedTest(name = "{0} {1} → {2}")
    @CsvSource({
            "KRINC, 2026-09-01T08:59:59, true",
            "KRINC, 2026-09-01T09:00:00, false",
            "KRPUS, 2026-08-25T09:00:00, true"})
    void 선분_경계(String key, LocalDateTime baseDt, boolean expected) {
        assertEquals(expected, PORT_RESOLVER.isValid(PORT, "BASE", key, baseDt));
    }

    @ParameterizedTest(name = "{0} → {1}")
    @CsvSource({"KRPUS, KR", "KRINC, "})
    void attr_형태(String key, String expected) {
        assertEquals(Optional.ofNullable(expected), PORT_RESOLVER.attr(PORT, "BASE", key, dt("2026-09-06T00:00"), 1));
    }

    @Test
    void 폐기된_마루_데이터는_closed_at_부터_false_다() {
        MasterDataResolver r = PortFixtures.resolver(PortFixtures.port(dt("2026-09-05T00:00")));
        assertAll(
                () -> assertTrue(r.isValid(PORT, "BASE", "KRPUS", dt("2026-09-04T23:59:59"))),
                () -> assertFalse(r.isValid(PORT, "BASE", "KRPUS", dt("2026-09-05T00:00"))));
    }

    @Test
    void 닫았다_다시_연_빈_구간은_false_다() {
        MasterDataRows port = PortFixtures.port();
        MasterDataRows reopened = new MasterDataRows(
                new DataHeader(PORT, "INUSE", null),
                List.of(
                        PortFixtures.item("KRPUS", "부산", "KR", "2026-08-20T09:00", "2026-08-25T09:00"),
                        PortFixtures.item("KRPUS", "부산", "KR", "2026-08-28T09:00", null)),
                port.categories(),
                port.cateItems());
        MasterDataResolver r = PortFixtures.resolver(reopened);
        assertAll(
                () -> assertTrue(r.isValid(PORT, "BASE", "KRPUS", dt("2026-08-24T00:00"))),
                () -> assertFalse(r.isValid(PORT, "BASE", "KRPUS", dt("2026-08-26T00:00"))),
                () -> assertTrue(r.isValid(PORT, "BASE", "KRPUS", dt("2026-08-29T00:00"))));
    }

    @ParameterizedTest(name = "{0} {1} {2}")
    @CsvSource({
            "PORT, BASE, ",
            "NOPE, BASE, KRPUS",
            "PORT, NOPE, KRPUS"})
    void 대상이_없으면_false_다(String id, String cate, String key) {
        assertFalse(PORT_RESOLVER.isValid(id, cate, key, dt("2026-09-06T00:00")));
    }
}
