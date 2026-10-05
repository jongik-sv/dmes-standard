package com.dongkuk.dmes.mdm.common.rule;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.line;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.ruleNode;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.setNode;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.dongkuk.dmes.mdm.common.rule.RuleIo.IoName;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetVer;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 하위 세트 spec §2·§5·§6, srv:6 조정 ① — {@link SetCallIoReader}: 기준 시각에 적용 중인 RELEASED 로 겉모양(손주까지 재귀, DRAFT 만 있으면 없는 세트,
 * 순환·깊이 초과는 없는 세트), 부르는 쪽 행·호출 그래프는 폐기 안 한 부모의 기준 시각 이후 유효한 RELEASED 행(Ruling 24·25).
 *
 * <p>룰(VER 1 RELEASED 2026-01-01~): R_GRD(SET_THK → S_GRD), R_OTH(SET_THK → S_OTH), R_FCT(S_GRD·SET_THK → S_FCT). 세트(1.000 RELEASED
 * 2000-01-01~9999-12-31): C(R_GRD 한 줄), M(SET C 만), G(SET M → R_FCT), P(SET C → R_FCT).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class SetCallIoReaderSqliteTest extends AbstractMdmSharedDbTest {

    static final LocalDateTime NOW = DmeTestSupport.NOW;
    /** 버전 경계 시각 — 1.000 이 여기서 끝나고 1.001 이 여기서 시작한다. */
    static final LocalDateTime T = LocalDateTime.of(2026, 7, 1, 0, 0);

    @Autowired
    SetCallIoReader reader;
    @Autowired
    RuleIoReader ioReader;
    @Autowired
    RuleQueries queries;
    @Autowired
    RuleSetVersionQueries setVersions;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        seedFixture(jdbc);
    }

    /** 두 시험 클래스(읽기기·연쇄 재검사)가 같이 쓰는 픽스처. */
    static void seedFixture(JdbcTemplate jdbc) {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        DmeTestSupport.column(jdbc, "SET_THK", DmeTestSupport.domain(jdbc, "SET_THK_D", "QTY", "NUMBER", 2));
        rule(jdbc, "R_GRD", "INUSE", "S_GRD", "SET_THK");
        rule(jdbc, "R_OTH", "INUSE", "S_OTH", "SET_THK");
        rule(jdbc, "R_FCT", "INUSE", "S_FCT", "S_GRD", "SET_THK");
        rule(jdbc, "R_DEP", "DEPRECATED", "S_DEP", "SET_THK");
        set(jdbc, "C", "[\"R_GRD\"]", "[]", line(ruleNode("r1", "R_GRD")));
        set(jdbc, "M", "[]", "[\"C\"]", line(setNode("s1", "C")));
        set(jdbc, "G", "[\"R_FCT\"]", "[\"M\"]", line(setNode("s1", "M"), ruleNode("r2", "R_FCT")));
        set(jdbc, "P", "[\"R_FCT\"]", "[\"C\"]", line(setNode("s1", "C"), ruleNode("r2", "R_FCT")));
    }

    static void rule(JdbcTemplate jdbc, String id, String status, String result, String... conds) {
        DmeTestSupport.rule(jdbc, id, id + " 룰", "DECISION", status);
        DmeTestSupport.released(jdbc, id, 1, "FIRST", "2026-01-01 00:00:00", null);
        int varId = 1;
        for (String c : conds) {
            DmeTestSupport.var(jdbc, id, 1, varId, "COND", "1", c, varId);
            varId++;
        }
        DmeTestSupport.var(jdbc, id, 1, varId, "RESULT", "Value", result, 1, "STRING");
    }

    static void set(JdbcTemplate jdbc, String id, String ruleIds, String callIds, String flow) {
        DmeTestSupport.ruleSet(jdbc, id, id + " 세트", ruleIds, "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, id, flow);
        DmeTestSupport.ruleSetCalls(jdbc, id, callIds);
    }

    /** 1.000 을 T 에 끝내고 T 부터 1.001 을 RELEASED 로 둔다. */
    static void splitAt(JdbcTemplate jdbc, String id, String ruleIds, String callIds, String flow) {
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET APPLY_TO = '2026-07-01 00:00:00' WHERE MARU_RULE_SET_ID = ? AND STATUS = 'RELEASED'", id);
        DmeTestSupport.ruleSetVersion(jdbc, id, "1.001", "MINOR", "RELEASED", "kim", ruleIds, "2026-07-01 00:00:00", "9999-12-31 00:00:00", 0);
        DmeTestSupport.ruleSetFlow(jdbc, id, "1.001", flow);
        DmeTestSupport.ruleSetCalls(jdbc, id, "1.001", callIds);
    }

    private static List<String> outputs(SetCallIo io) {
        return io.outputs().stream().map(o -> o.name() + ":" + o.always()).toList();
    }

    private static List<String> inputs(SetCallIo io) {
        return io.inputs().stream().map(IoName::name).toList();
    }

    private static List<String> callers(List<SetCallIoReader.Caller> cs) {
        return cs.stream().map(c -> c.setId() + " " + c.ver().getVer().toPlainString()).toList();
    }

    @Test
    void 손주까지_재귀해_겉모양을_만든다() {
        Map<String, SetCallIo> r = reader.read(List.of("G", "M"), NOW);

        assertEquals(List.of("G", "M"), List.copyOf(r.keySet()), "요청 순서");
        SetCallIo g = r.get("G");
        assertTrue(g.exists());
        assertEquals("G 세트", g.setName());
        assertEquals("INUSE", g.status());
        assertEquals(List.of("SET_THK"), inputs(g), "M 이 넘긴 C 의 입력 SET_THK — S_GRD 는 M 이 만들어 중간 결과다");
        assertEquals(List.of("S_FCT:true"), outputs(g));
        assertEquals(List.of("S_GRD:true"), outputs(r.get("M")), "M 은 C 의 출력을 그대로 넘긴다");
    }

    @Test
    void 없는_세트와_DRAFT_만_있는_세트는_없는_세트이고_빈_ID_중복은_뺀다() {
        jdbc.update("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, STATUS, C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, "
                + "U_SVC_ID, U_PGM_ID, VER) VALUES ('D', 'D 세트', 'CREATED', 'fixture', '2026-01-01 00:00:00', 'fixture', 'fixture', 'fixture', "
                + "'2026-01-01 00:00:00', 'fixture', 'fixture', 0)");
        DmeTestSupport.ruleSetDraft(jdbc, "D", "1.000", "kim", "[\"R_GRD\"]", 0);

        Map<String, SetCallIo> r = reader.read(Arrays.asList("NOPE", "", null, "D", "NOPE"), NOW);

        assertEquals(List.of("NOPE", "D"), List.copyOf(r.keySet()));
        assertEquals(SetCallIo.missing("NOPE"), r.get("NOPE"));
        assertEquals(SetCallIo.missing("D"), r.get("D"), "DRAFT 만 있으면 기준 시각에 RELEASED 가 없다(Ruling 24)");
        assertEquals(Map.of(), reader.read(List.of(), NOW));
    }

    @Test
    void 폐기된_세트는_겉모양은_있고_상태가_DEPRECATED_다() {
        jdbc.update("UPDATE TB_MDM_RULE_SET SET STATUS = 'DEPRECATED' WHERE MARU_RULE_SET_ID = 'C'");

        SetCallIo c = reader.read(List.of("C"), NOW).get("C");

        assertTrue(c.exists());
        assertEquals("DEPRECATED", c.status());
        assertEquals(List.of("S_GRD:true"), outputs(c));
    }

    @Test
    void 처음_확정한_CREATED_세트는_적용이_시작되면_INUSE_다() {
        jdbc.update("UPDATE TB_MDM_RULE_SET SET STATUS = 'CREATED' WHERE MARU_RULE_SET_ID = 'C'");

        assertEquals("INUSE", reader.read(List.of("C"), NOW).get("C").status());
    }

    @Test
    void 기준_시각에_적용_중인_RELEASED_로_계산한다() {
        splitAt(jdbc, "C", "[\"R_OTH\"]", "[]", line(ruleNode("r1", "R_OTH")));

        assertEquals(List.of("S_GRD:true"), outputs(reader.read(List.of("C"), T.minusSeconds(1)).get("C")));
        assertEquals(List.of("S_OTH:true"), outputs(reader.read(List.of("C"), T).get("C")));
        assertEquals(SetCallIo.missing("C"), reader.read(List.of("C"), LocalDateTime.of(1999, 1, 1, 0, 0)).get("C"), "적용 전이면 없는 세트");
    }

    @Test
    void 저장된_순환은_되돌아오는_세트를_없는_세트로_보고_끝난다() {
        set(jdbc, "X", "[]", "[\"Y\"]", line(setNode("s1", "Y")));
        set(jdbc, "Y", "[\"R_GRD\"]", "[\"X\"]", line(setNode("s1", "X"), ruleNode("r1", "R_GRD")));

        SetCallIo x = reader.read(List.of("X"), NOW).get("X");

        assertTrue(x.exists());
        assertEquals(List.of("S_GRD:true"), outputs(x), "Y 안의 X 는 없는 세트 — Y 는 R_GRD 결과만 낸다");
    }

    @Test
    void 깊이_상한을_넘는_세트는_없는_세트로_본다() {
        // D0 → D1 → … → D7, D7 만 R_GRD 를 부른다. read(D0) 에서 D6 은 위로 여섯(D0~D5)이라 없는 세트다.
        for (int i = 0; i < 7; i++) {
            set(jdbc, "D" + i, "[]", "[\"D" + (i + 1) + "\"]", line(setNode("s1", "D" + (i + 1))));
        }
        set(jdbc, "D7", "[\"R_GRD\"]", "[]", line(ruleNode("r1", "R_GRD")));

        assertEquals(List.of(), outputs(reader.read(List.of("D0"), NOW).get("D0")));
        assertEquals(List.of("S_GRD:true"), outputs(reader.read(List.of("D2"), NOW).get("D2")), "D2 에서는 D7 이 다섯 단계 아래다");
    }

    @Test
    void 깊이_방어가_걸린_하위_트리는_다시_쓰지_않고_다른_자리에서_다시_계산한다() {
        // D0 → D1 → … → D7. read(D0) 안에서 D2 는 D6 에서 깊이 방어가 걸려 출력이 없다. 같은 read 의 D2 자체는 다섯 단계 아래 D7 까지 닿는다.
        for (int i = 0; i < 7; i++) {
            set(jdbc, "D" + i, "[]", "[\"D" + (i + 1) + "\"]", line(setNode("s1", "D" + (i + 1))));
        }
        set(jdbc, "D7", "[\"R_GRD\"]", "[]", line(ruleNode("r1", "R_GRD")));

        Map<String, SetCallIo> r = reader.read(List.of("D0", "D2"), NOW);

        assertEquals(List.of(), outputs(r.get("D0")));
        assertEquals(reader.read(List.of("D2"), NOW).get("D2"), r.get("D2"), "D0 아래에서 잘린 D2 를 memo 로 다시 쓰면 안 된다");
        assertEquals(List.of("S_GRD:true"), outputs(r.get("D2")));
    }

    @Test
    void 한_read_안에서_세트마다_한_번만_계산한다() {
        // 다이아몬드 DIA → SET C, SET M(→ SET C). C 의 룰 입출력은 한 번만 읽는다.
        set(jdbc, "DIA", "[]", "[\"C\",\"M\"]", line(setNode("s1", "C"), setNode("s2", "M")));
        RuleIoReader spy = Mockito.spy(ioReader);
        SetCallIoReader counting = new SetCallIoReader(queries, setVersions, spy);

        SetCallIo dia = counting.read(List.of("DIA", "M", "C"), NOW).get("DIA");

        assertEquals(List.of("S_GRD:true"), outputs(dia));
        verify(spy, times(1)).readAt(eq(List.of("R_GRD")), any(), any());
    }

    @Test
    void CALL_SET_IDS_가_깨진_행은_아무것도_부르지_않는다() {
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET CALL_SET_IDS = '{}' WHERE MARU_RULE_SET_ID = 'P'"); // JSON 이지만 배열이 아니다

        assertEquals(List.of("M 1.000"), callers(reader.callers("C", NOW)));
        assertFalse(reader.edges(NOW).containsKey("P"));
        assertEquals(List.of("S_FCT:true"), outputs(reader.read(List.of("P"), NOW).get("P")), "겉모양은 FLOW_JSON 으로 계산한다");

        MdmRuleSetVer v = new MdmRuleSetVer("X", BigDecimal.ONE, VersionKind.MAJOR, null, "[]");
        v.setCallSetIds("[bad");
        assertEquals(List.of(), SetCallIoReader.callIds(v), "JSON 이 아니어도 던지지 않는다");
        v.setCallSetIds("[null, \"\", \"A\", \" \"]");
        assertEquals(List.of("A"), SetCallIoReader.callIds(v), "null·빈 값은 뺀다");
    }

    @Test
    void 깨진_흐름의_세트는_입출력이_빈_겉모양이다() {
        DmeTestSupport.ruleSetFlow(jdbc, "C", "{\"version\":2,\"nodes\":[],\"edges\":[]}"); // JSON 이지만 흐름 형식이 아니다

        SetCallIo c = reader.read(List.of("C"), NOW).get("C");

        assertTrue(c.exists());
        assertEquals(List.of(), outputs(c));
        assertEquals(List.of(), inputs(c));
    }

    @Test
    void 저장하려는_흐름의_겉모양은_하위_세트를_기준_시각으로_읽는다() {
        String flow = line(setNode("s1", "C"), ruleNode("r2", "R_OTH"));
        Map<String, RuleIo> rules = ioReader.read(List.of("R_OTH"));

        SetCallIo io = reader.of("N", "새 세트", "CREATED", RuleSetFlowJson.parse(flow), rules, NOW);

        assertEquals("N", io.setId());
        assertTrue(io.exists());
        assertEquals(List.of("S_GRD:true", "S_OTH:true"), outputs(io));
        assertEquals(Map.of("C", reader.read(List.of("C"), NOW).get("C")), reader.callsOf(RuleSetFlowJson.parse(flow), NOW));
    }

    @Test
    void 부르는_쪽은_폐기_안_한_부모의_RELEASED_행이고_세트_ID_순이다() {
        assertEquals(List.of("M 1.000", "P 1.000"), callers(reader.callers("C", NOW)));

        jdbc.update("UPDATE TB_MDM_RULE_SET SET STATUS = 'DEPRECATED' WHERE MARU_RULE_SET_ID = 'P'");
        jdbc.update("UPDATE TB_MDM_RULE_SET SET STATUS = 'CREATED' WHERE MARU_RULE_SET_ID = 'M'");
        DmeTestSupport.ruleSetDraft(jdbc, "G", "2.000", "kim", "[]", 0);
        DmeTestSupport.ruleSetCalls(jdbc, "G", "2.000", "[\"C\"]");

        assertEquals(List.of("M 1.000"), callers(reader.callers("C", NOW)), "폐기 부모는 빼고 CREATED 는 넣는다. DRAFT 행은 세지 않는다(Ruling 25)");
        assertEquals(List.of("G 1.000"), callers(reader.callers("M", NOW)));
        assertEquals(List.of(), callers(reader.callers("G", NOW)));
    }

    @Test
    void 부르는_쪽은_기준_시각_이후에도_유효한_행만_센다() {
        // P 1.000(~T) 는 C 를, 1.001(T~) 는 M 을 부른다.
        splitAt(jdbc, "P", "[\"R_FCT\"]", "[\"M\"]", line(setNode("s1", "M"), ruleNode("r2", "R_FCT")));

        assertEquals(List.of("M 1.000", "P 1.000"), callers(reader.callers("C", T.minusSeconds(1))));
        assertEquals(List.of("M 1.000"), callers(reader.callers("C", T)), "P 1.000 은 T 에 끝난다");
        assertEquals(List.of("G 1.000", "P 1.001"), callers(reader.callers("M", T.minusSeconds(1))), "미래 RELEASED 도 센다");
    }

    @Test
    void 불릴_수_있는지는_RELEASED_행의_CALL_SET_IDS_로_값싸게_가린다() {
        assertTrue(setVersions.mayBeCalled("C"));
        assertTrue(setVersions.mayBeCalled("M"));
        assertFalse(setVersions.mayBeCalled("G"), "G 를 부르는 행이 없다");
        assertFalse(setVersions.mayBeCalled("R_GRD"), "RULE_IDS 는 보지 않는다");

        DmeTestSupport.ruleSetDraft(jdbc, "P", "2.000", "kim", "[]", 0);
        DmeTestSupport.ruleSetCalls(jdbc, "P", "2.000", "[\"G\"]");
        assertFalse(setVersions.mayBeCalled("G"), "DRAFT 행은 부르는 쪽이 아니다(Ruling 25)");

        set(jdbc, "AXB", "[]", "[]", line(ruleNode("r1", "R_GRD")));
        DmeTestSupport.ruleSetCalls(jdbc, "G", "[\"M\",\"AXB\"]");
        assertTrue(setVersions.mayBeCalled("A_B"), "LIKE 의 _ 는 거짓 양성일 수 있다 — 정확한 판정은 원장 읽기가 한다");
        assertEquals(List.of(), callers(reader.callers("A_B", NOW)));
    }

    @Test
    void 호출_그래프는_부르는_쪽_행의_합집합이다() {
        splitAt(jdbc, "P", "[\"R_FCT\"]", "[\"M\"]", line(setNode("s1", "M"), ruleNode("r2", "R_FCT")));
        jdbc.update("UPDATE TB_MDM_RULE_SET SET STATUS = 'DEPRECATED' WHERE MARU_RULE_SET_ID = 'G'");

        assertEquals(Map.of("M", List.of("C"), "P", List.of("C", "M")), reader.edges(T.minusSeconds(1)));
        assertEquals(Map.of("M", List.of("C"), "P", List.of("M")), reader.edges(T));
        assertFalse(reader.edges(T).containsKey("C"), "부르는 것이 없는 세트는 뺀다");
    }
}
