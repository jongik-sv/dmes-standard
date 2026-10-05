package com.dongkuk.dmes.mdm.common.rule;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.line;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.ruleNode;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.setNode;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 하위 세트 spec §6.1 3·4·§6.4, srv:6 조정 ① — {@link SetCallerRecheck}: 겉모양이 바뀐 세트를 부르는 쪽 행을 바뀌기 전·뒤로 두 번 검사해 뒤에만 있는
 * 거부를 CALLER_BROKEN("세트 P: …", Ruling 10)으로, 뒤에만 있는 경고는 부모 ID 로 모은다. 부모 겉모양이 바뀌면 조부모로 이어 간다.
 *
 * <p>픽스처는 {@link SetCallIoReaderSqliteTest#seedFixture}: C(R_GRD → S_GRD), M(SET C), G(SET M → R_FCT), P(SET C → R_FCT). R_FCT 는 S_GRD 를 읽는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class SetCallerRecheckSqliteTest extends AbstractMdmSharedDbTest {

    static final LocalDateTime NOW = DmeTestSupport.NOW;
    static final String UNKNOWN_S_GRD = "R_FCT의 조건 변수 S_GRD는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다";

    @Autowired
    SetCallerRecheck recheck;
    @Autowired
    SetCallIoReader reader;
    @Autowired
    RuleIoReader ioReader;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        SetCallIoReaderSqliteTest.seedFixture(jdbc);
    }

    /** C 를 flow 로 바꿨을 때의 겉모양. */
    private SetCallIo newC(String flow) {
        var f = RuleSetFlowJson.parse(flow);
        return reader.of("C", "C 세트", "INUSE", f, ioReader.read(RuleSetFlowJson.ruleIds(f)), NOW);
    }

    private static List<String> rejects(SetCallerRecheck.Outcome o) {
        return o.rejects().stream().map(c -> c.code() + " " + c.severity() + " " + c.ruleId() + " " + c.message()).toList();
    }

    @Test
    void 겉모양이_바뀌어_부르는_세트에_새_거부가_생기면_CALLER_BROKEN_이고_조부모까지_이어_간다() {
        // C 가 S_GRD 대신 S_OTH 를 내면: M 은 거부 없이 겉모양만 바뀌고, P·G 의 R_FCT 가 S_GRD 를 못 읽는다.
        SetCallerRecheck.Outcome o = recheck.recheck("C", newC(line(ruleNode("r1", "R_OTH"))), NOW);

        assertEquals(List.of("CALLER_BROKEN REJECT P 세트 P: " + UNKNOWN_S_GRD, "CALLER_BROKEN REJECT G 세트 G: " + UNKNOWN_S_GRD), rejects(o),
                "단계 순서 — C 를 부르는 M·P(세트 ID 순) 다음 M 을 부르는 G");
        assertEquals(List.of(), o.warnedCallers());
    }

    @Test
    void 부모에_원래_있던_거부는_새_거부가_아니고_출력이_늘기만_하면_아무것도_없다() {
        // BAD 는 원래 폐기 룰 R_DEP 를 불러 RULE_DEPRECATED 거부가 있다.
        SetCallIoReaderSqliteTest.set(jdbc, "BAD", "[\"R_DEP\",\"R_FCT\"]", "[\"C\"]",
                line(ruleNode("r0", "R_DEP"), setNode("s1", "C"), ruleNode("r2", "R_FCT")));

        SetCallerRecheck.Outcome o = recheck.recheck("C", newC(line(ruleNode("r1", "R_GRD"), ruleNode("r2", "R_OTH"))), NOW);

        assertTrue(o.isEmpty(), o.toString());
    }

    @Test
    void 부르는_세트에_새_경고만_생기면_그_부모를_모은다() {
        // C 를 IF 로 바꿔 S_GRD 를 한 갈래에서만 만들면(always=false) P·G 의 R_FCT 가 FLOW_PARTIAL 경고다.
        String ifFlow = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"if1\",\"kind\":\"IF\"},"
                + ruleNode("r1", "R_GRD") + "," + ruleNode("r2", "R_OTH") + ",{\"id\":\"m1\",\"kind\":\"MERGE\",\"splitId\":\"if1\"},"
                + "{\"id\":\"end\",\"kind\":\"END\"}],\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"if1\"},"
                + "{\"id\":\"b1\",\"from\":\"if1\",\"to\":\"r1\",\"order\":1,\"cond\":\"SET_THK > 1\"},{\"id\":\"bo\",\"from\":\"if1\",\"to\":\"r2\",\"otherwise\":true},"
                + "{\"id\":\"e2\",\"from\":\"r1\",\"to\":\"m1\"},{\"id\":\"e3\",\"from\":\"r2\",\"to\":\"m1\"},{\"id\":\"e4\",\"from\":\"m1\",\"to\":\"end\"}]}";
        SetCallIo c = newC(ifFlow);
        assertTrue(c.outputs().stream().anyMatch(out -> "S_GRD".equals(out.name()) && !out.always()), c.toString());

        SetCallerRecheck.Outcome o = recheck.recheck("C", c, NOW);

        assertEquals(List.of(), rejects(o));
        assertEquals(List.of("P", "G"), o.warnedCallers());
    }

    @Test
    void 부르는_행이_여럿이면_문구에_버전을_적는다() {
        SetCallIoReaderSqliteTest.splitAt(jdbc, "P", "[\"R_FCT\"]", "[\"C\"]", line(setNode("s1", "C"), ruleNode("r2", "R_FCT")));
        jdbc.update("DELETE FROM TB_MDM_RULE_SET_VER WHERE MARU_RULE_SET_ID IN ('M', 'G')");

        SetCallerRecheck.Outcome o = recheck.recheck("C", newC(line(ruleNode("r1", "R_OTH"))), NOW);

        assertEquals(List.of("CALLER_BROKEN REJECT P 세트 P v1.000: " + UNKNOWN_S_GRD, "CALLER_BROKEN REJECT P 세트 P v1.001: " + UNKNOWN_S_GRD),
                rejects(o));
    }

    @Test
    void 폐기한_부모와_기준_시각_전에_끝난_행은_보지_않는다() {
        jdbc.update("UPDATE TB_MDM_RULE_SET SET STATUS = 'DEPRECATED' WHERE MARU_RULE_SET_ID = 'P'");
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET APPLY_TO = '2026-06-01 00:00:00' WHERE MARU_RULE_SET_ID = 'M'");

        SetCallerRecheck.Outcome o = recheck.recheck("C", newC(line(ruleNode("r1", "R_OTH"))), NOW);

        assertTrue(o.isEmpty(), "P 는 폐기, M 은 NOW 전에 끝나 G 까지 이어지지 않는다: " + o);
    }

    @Test
    void 부모_흐름에_새로_생긴_세트_호출_코드는_경고여도_거부로_센다() {
        // C 를 첫 확정 전 상태(없는 세트)로 보면 P·M 에 CALL_MISSING(WARN)이 새로 생긴다 — 확정이 거부하는 코드라 CALLER_BROKEN 이다.
        SetCallerRecheck.Outcome o = recheck.recheck("C", SetCallIo.missing("C"), NOW);

        assertEquals(List.of("CALLER_BROKEN REJECT M 세트 M: C는 없는 세트다", "CALLER_BROKEN REJECT P 세트 P: C는 없는 세트다",
                "CALLER_BROKEN REJECT P 세트 P: " + UNKNOWN_S_GRD, "CALLER_BROKEN REJECT G 세트 G: " + UNKNOWN_S_GRD), rejects(o));
    }
}
