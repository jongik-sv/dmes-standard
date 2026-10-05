package com.dongkuk.dmes.mdm.common.rule;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.line;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.setNode;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.rule.RuleIo.IoName;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionLookup;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunRequest;
import com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunResult;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.AstExporter;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.flow.FlowParse;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.flow.SetStep;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace;
import kr.dongkuk.maru.mdm.engine.rule.SetShape;
import kr.dongkuk.maru.mdm.engine.rule.SetShapeProbe;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.InputContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 하위 세트 계획 편차 8·Review Focus 1(srv:6 묶음 E1) — 서버 겉모양({@link RuleSetInterface}·{@link SetCallIoReader})과 엔진 {@code SetShape}(eng:4)가
 * 같은 알고리즘인지 본다. 엔진 겉모양은 package-private 이라 엔진 패키지의 시험 도우미 {@link SetShapeProbe} 로 엔진과 같은 재료에서 만든다.
 *
 * <ul>
 *   <li>알고리즘(코퍼스·퍼즈 흐름 전부): 룰 입출력을 같은 이름으로 준 합성 정의로 inputs·outputs·always 를 견준다. 엔진 inputs 는 {@code CATCH_*} 를 빼고
 *       견준다(편차 11 — 서버만 뺀다, 아래 따로 묶음).</li>
 *   <li>endsEarly: 엔진 겉모양에는 없는 칸이라 실제 실행의 {@code calls[].endedBy} 로 견준다.</li>
 *   <li>이름 출처: 엔진 {@code FlowKeys.needed}·{@code RuleEvaluator.resultNames} 와 서버 {@link RuleIoReader} 의 conds·results 를 저장된 룰로 견준다.</li>
 * </ul>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class SetCallIoEngineAgreementTest extends AbstractMdmSharedDbTest {

    /** lib 테스트 자원 — api 테스트 클래스패스에 없어 파일로 읽는다(RuleLedgerChecksTest 와 같다, api test 작업 입력에 선언돼 있다). */
    private static final Path RULE_RES = Path.of("../lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule");
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Instant TS = RuleSetRunner.parseKst("2026-03-01 09:00:00");
    private static final LocalDateTime AT = LocalDateTime.of(2026, 3, 1, 9, 0, 0);

    @Autowired
    SetCallIoReader reader;
    @Autowired
    RuleSetRunner runner;
    @Autowired
    RuleIoReader ioReader;
    @Autowired
    MdmEvaluator evaluator;
    @Autowired
    RuleQueries queries;
    @Autowired
    StoredRuleDefinitions stored;
    @Autowired
    MdmRuleRepository rules;
    @Autowired
    RuleSetVersionQueries setVersions;
    @Autowired
    MdmRuleSetRepository sets;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        DmeTestSupport.sampleRule(jdbc);
        DmeTestSupport.ruleSet(jdbc, "RS_LINE", "한 줄", "[\"QLTY_GRD_JDG\"]", "INUSE", 0);
    }

    private StoredDefinitionLookup lookup() {
        return new StoredDefinitionLookup(queries, stored, rules, setVersions, sets);
    }

    // ── 상수 ──

    @Test
    void 호출_깊이_상한은_엔진_상수와_같다() {
        assertEquals(SetShape.MAX_CALL_DEPTH, RuleSetCallGraph.MAX_DEPTH);
        assertEquals(5, RuleSetCallGraph.MAX_DEPTH);
    }

    // ── 알고리즘: 코퍼스·퍼즈 흐름 ──

    @Test
    void 코퍼스_퍼즈_흐름마다_서버_겉모양과_엔진_SetShape_의_inputs_outputs_always_가_같다() throws IOException {
        List<String> diffs = new ArrayList<>();
        int compared = 0;
        int withSet = 0;
        for (String file : List.of("rule-set-corpus.json", "rule-set-fuzz.json")) {
            for (JsonNode c : cases(file)) {
                String name = file + " › " + c.path("name").asText();
                FlowDefinition flow = c.has("flow") ? RuleSetFlowJson.parse(c.get("flow").toString()) : FlowParser.linear(strings(c.path("ids")));
                FlowParse p = FlowParser.parse(flow);
                if (p.tree() == null) {
                    continue; // 구조 오류 — 엔진은 준비하지 않고 서버는 빈 겉모양이다
                }
                Map<String, RuleIo> ruleIo = new LinkedHashMap<>();
                c.path("rules").properties().forEach(e -> ruleIo.put(e.getKey(), corpusRule(e.getKey(), e.getValue())));
                Map<String, SetCallIo> calls = new LinkedHashMap<>();
                c.path("calls").properties().forEach(e -> calls.put(e.getKey(), corpusCall(e.getKey(), e.getValue())));

                SetCallIo server = RuleSetInterface.of("X", null, true, "INUSE", flow, ruleIo, calls);

                // 엔진 준비와 같은 재료 — 조회되는 룰(있고 RELEASED 가 있는 것)만, SET 노드는 준비되는 하위 세트(있고 폐기 아님)만 노드 ID 로.
                Map<String, RuleDefinition> defs = new LinkedHashMap<>();
                ruleIo.forEach((id, r) -> {
                    if (r.exists() && r.releasedVer() != null) {
                        defs.put(id, definition(r));
                    }
                });
                Map<String, SetShape> shapes = new LinkedHashMap<>();
                for (SetStep s : p.tree().setSteps()) {
                    SetCallIo call = s.setId() == null ? null : calls.get(s.setId());
                    if (call != null && call.exists() && !"DEPRECATED".equals(call.status())) {
                        shapes.put(s.nodeId(), SetShapeProbe.given(call.inputs().stream().map(IoName::name).toList(),
                                call.outputs().stream().map(SetCallIo.OutputName::name).toList(),
                                new LinkedHashSet<>(call.outputs().stream().filter(SetCallIo.OutputName::always).map(SetCallIo.OutputName::name).toList())));
                    }
                }
                SetShapeProbe.Shape engine;
                try {
                    engine = SetShapeProbe.view(SetShapeProbe.of(p.tree(), defs, shapes, evaluator));
                } catch (RuntimeException e) {
                    diffs.add(name + ": 엔진 겉모양 예외 " + e);
                    continue;
                }
                compared++;
                if (!p.tree().setSteps().isEmpty()) {
                    withSet++;
                }
                List<String> engineInputs = engine.inputs().stream().filter(n -> !isCatch(n)).toList();
                List<String> serverInputs = server.inputs().stream().map(IoName::name).toList();
                if (!engineInputs.equals(serverInputs)) {
                    diffs.add(name + ": inputs 엔진 " + engineInputs + " ≠ 서버 " + serverInputs);
                }
                List<String> serverOutputs = server.outputs().stream().map(SetCallIo.OutputName::name).toList();
                if (!engine.outputs().equals(serverOutputs)) {
                    diffs.add(name + ": outputs 엔진 " + engine.outputs() + " ≠ 서버 " + serverOutputs);
                }
                Set<String> serverAlways = new LinkedHashSet<>(server.outputs().stream().filter(SetCallIo.OutputName::always).map(SetCallIo.OutputName::name).toList());
                if (!engine.always().equals(serverAlways)) {
                    diffs.add(name + ": always 엔진 " + engine.always() + " ≠ 서버 " + serverAlways);
                }
            }
        }
        assertEquals(List.of(), diffs, "어긋난 사례 " + diffs.size() + " / 대조 " + compared);
        assertTrue(compared >= 250, "대조 사례가 너무 적다: " + compared);
        assertTrue(withSet >= 15, "SET 노드가 든 대조 사례가 너무 적다: " + withSet);
    }

    @Test
    void 처리_갈래가_읽는_CATCH_이름은_엔진_inputs_에는_있고_서버_inputs_에서는_뺀다() {
        // 편차 11 — 하위 세트 입력은 부모 ctx 에서 CATCH_* 를 뺀 사본이다. 서버는 겉모양 inputs 에서도 빼(부모 분석기의 헛 R13 ORDER 를 막는다),
        // 엔진 SetShape.inputs 는 FlowKeys.needed 그대로라 남는다. 엔진 inputs 는 부모 겉모양 계산에만 쓰이고 입력 키 사전 검사(mustInputs)는
        // 처리 갈래 안을 보지 않으므로 판정 결과는 같다.
        String flow = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"R_A\"},"
                + "{\"id\":\"c1\",\"kind\":\"CATCH\",\"attachTo\":\"r1\",\"catches\":[\"EVAL_ERROR\"]},{\"id\":\"r2\",\"kind\":\"RULE\",\"ruleId\":\"R_H\"},"
                + "{\"id\":\"end\",\"kind\":\"END\"}],\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"r1\"},{\"id\":\"e2\",\"from\":\"r1\",\"to\":\"end\"},"
                + "{\"id\":\"e3\",\"from\":\"c1\",\"to\":\"r2\"},{\"id\":\"e4\",\"from\":\"r2\",\"to\":\"end\"}]}";
        Map<String, RuleIo> io = new LinkedHashMap<>();
        io.put("R_A", io("R_A", List.of("A"), List.of("Y")));
        io.put("R_H", io("R_H", List.of("CATCH_MSG", "CATCH_SET", "B"), List.of("H")));
        FlowDefinition def = RuleSetFlowJson.parse(flow);

        SetCallIo server = RuleSetInterface.of("X", null, true, "INUSE", def, io, Map.of());
        Map<String, RuleDefinition> defs = new LinkedHashMap<>();
        io.forEach((id, r) -> defs.put(id, definition(r)));
        SetShapeProbe.Shape engine = SetShapeProbe.view(SetShapeProbe.of(FlowParser.parse(def).tree(), defs, Map.of(), evaluator));

        assertEquals(List.of("A", "CATCH_MSG", "CATCH_SET", "B"), engine.inputs());
        assertEquals(List.of("A", "B"), server.inputs().stream().map(IoName::name).toList());
        assertEquals(List.of("A"), engine.mustInputs(), "처리 갈래 안 입력은 사전 검사에 들지 않는다");
    }

    // ── 저장된 세트: 엔진 실행·엔진 겉모양·서버 겉모양 ──

    @Test
    void 저장된_하위_세트의_겉모양_출력과_엔진이_넘긴_출력과_엔진_겉모양이_같다() {
        String parent = line(setNode("s1", "RS_LINE"));

        RunTrace t = runner.trace(parent, Map.of("COIL_THK", new BigDecimal("2.0"), "COIL_WID", new BigDecimal("1200"), "SURF_GRD", "A"), TS);
        RunTrace.NodeTrace s1 = t.nodes().stream().filter(n -> "s1".equals(n.nodeId())).findFirst().orElseThrow();

        SetCallIo server = reader.read(List.of("RS_LINE"), AT).get("RS_LINE");
        Set<String> serverOut = new LinkedHashSet<>(server.outputs().stream().map(SetCallIo.OutputName::name).toList());
        assertEquals(serverOut, s1.outputs().keySet(), "엔진이 실제로 넘긴 출력");
        assertEquals(Set.of("QLTY_GRD", "PRC_FCT"), serverOut);

        SetShapeProbe.Shape engine = SetShapeProbe.view(SetShapeProbe.stored(lookup(), evaluator, "RS_LINE", TS).orElseThrow());
        assertEquals(server.inputs().stream().map(IoName::name).toList(), engine.inputs());
        assertEquals(List.copyOf(serverOut), engine.outputs());
        assertEquals(Set.copyOf(server.outputs().stream().filter(SetCallIo.OutputName::always).map(SetCallIo.OutputName::name).toList()), engine.always());
        assertEquals(List.of("COIL_THK", "COIL_WID", "SURF_GRD"), engine.mustInputs());
    }

    @Test
    void 손주까지_저장된_세트의_엔진_겉모양과_서버_겉모양이_같다() {
        // RS_MID: s2(RS_LINE) → IF(QLTY_GRD == 'A' → r9 QLTY_GRD_JDG 를 다시 부르지 않고 TASK, 그 밖 → END). 출력 always 는 끝내는 갈래 때문에 비지 않는다.
        String mid = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"s2\",\"kind\":\"SET\",\"setId\":\"RS_LINE\"},"
                + "{\"id\":\"if1\",\"kind\":\"IF\"},{\"id\":\"t1\",\"kind\":\"TASK\"},{\"id\":\"end\",\"kind\":\"END\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"s2\"},{\"id\":\"e2\",\"from\":\"s2\",\"to\":\"if1\"},"
                + "{\"id\":\"b1\",\"from\":\"if1\",\"to\":\"t1\",\"order\":1,\"cond\":\"PRC_FCT > 1\"},{\"id\":\"bo\",\"from\":\"if1\",\"to\":\"end\",\"otherwise\":true},"
                + "{\"id\":\"e3\",\"from\":\"t1\",\"to\":\"end\"}]}";
        DmeTestSupport.ruleSet(jdbc, "RS_MID", "가운데", "[]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "RS_MID", mid);
        DmeTestSupport.ruleSetCalls(jdbc, "RS_MID", "[\"RS_LINE\"]");

        SetCallIo server = reader.read(List.of("RS_MID"), AT).get("RS_MID");
        SetShapeProbe.Shape engine = SetShapeProbe.view(SetShapeProbe.stored(lookup(), evaluator, "RS_MID", TS).orElseThrow());

        assertTrue(server.exists());
        assertEquals(server.inputs().stream().map(IoName::name).toList(), engine.inputs());
        assertEquals(server.outputs().stream().map(SetCallIo.OutputName::name).toList(), engine.outputs());
        assertEquals(Set.copyOf(server.outputs().stream().filter(SetCallIo.OutputName::always).map(SetCallIo.OutputName::name).toList()), engine.always());
        assertEquals(List.of("QLTY_GRD", "PRC_FCT"), engine.outputs());
        assertEquals(Set.of("QLTY_GRD", "PRC_FCT"), engine.always(), "하위 always 는 끝내는 IF 갈래 앞에서 이미 만들어졌다");
        assertFalse(server.endsEarly(), "처리 갈래 밖의 끝내는 IF 갈래는 끝냄이 아니다(편차 10)");
    }

    // ── endsEarly: 실제 실행의 calls[].endedBy ──

    private static final String END_BY_HANDLER = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},"
            + "{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"QLTY_GRD_JDG\"},{\"id\":\"c1\",\"kind\":\"CATCH\",\"attachTo\":\"r1\",\"catches\":[\"INPUT_ERROR\"]},"
            + "{\"id\":\"end\",\"kind\":\"END\"}],\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"r1\"},{\"id\":\"e2\",\"from\":\"r1\",\"to\":\"end\"},"
            + "{\"id\":\"e3\",\"from\":\"c1\",\"to\":\"end\"}]}";

    private static final String END_BY_IF = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"if1\",\"kind\":\"IF\"},"
            + "{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"QLTY_GRD_JDG\"},{\"id\":\"end\",\"kind\":\"END\"}],"
            + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"if1\"},{\"id\":\"b1\",\"from\":\"if1\",\"to\":\"end\",\"order\":1,\"cond\":\"COIL_THK > 100\"},"
            + "{\"id\":\"bo\",\"from\":\"if1\",\"to\":\"r1\",\"otherwise\":true},{\"id\":\"e2\",\"from\":\"r1\",\"to\":\"end\"}]}";

    private RuleSetRunResult runParentOf(String childId, String recordJson) {
        String parentId = "RS_P_" + childId;
        DmeTestSupport.ruleSet(jdbc, parentId, "부모", "[]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, parentId, line(setNode("s1", childId)));
        DmeTestSupport.ruleSetCalls(jdbc, parentId, "[\"" + childId + "\"]");
        RuleSetRunRequest req = new RuleSetRunRequest();
        req.setSetId(parentId);
        req.setRecordJson(recordJson);
        req.setEvalTs("2026-03-01 09:00:00");
        return runner.execute(req);
    }

    @Test
    void 서버_endsEarly_는_하위_세트가_처리_갈래로_끝낼_수_있는가와_같다() {
        DmeTestSupport.ruleSet(jdbc, "RS_END", "처리 갈래 끝냄", "[\"QLTY_GRD_JDG\"]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "RS_END", END_BY_HANDLER);
        DmeTestSupport.ruleSet(jdbc, "RS_IFEND", "IF 끝냄", "[\"QLTY_GRD_JDG\"]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "RS_IFEND", END_BY_IF);

        Map<String, SetCallIo> io = reader.read(List.of("RS_END", "RS_IFEND", "RS_LINE"), AT);
        assertTrue(io.get("RS_END").endsEarly());
        assertFalse(io.get("RS_IFEND").endsEarly());
        assertFalse(io.get("RS_LINE").endsEarly());

        // 처리 갈래가 END 로 끝냄 — 하위 입력이 모자라 r1 이 INPUT_ERROR(받는 단계의 입력은 사전 검사에서 빠진다) → c1 → END.
        RuleSetRunResult ended = runParentOf("RS_END", "{\"SURF_GRD\":\"A\"}");
        assertEquals("c1", ended.getCalls().get(0).get("endedBy"));
        assertNull(ended.getEndedBy(), "하위 세트의 끝냄은 부모 endedBy 와 섞지 않는다");

        // 끝내는 IF 갈래로 끝남 — 부모에게는 정상 완료(endedBy 없음).
        RuleSetRunResult ifEnded = runParentOf("RS_IFEND", "{\"COIL_THK\":\"200\",\"COIL_WID\":\"1200\",\"SURF_GRD\":\"A\"}");
        assertTrue(ifEnded.getCalls().get(0).containsKey("endedBy"));
        assertNull(ifEnded.getCalls().get(0).get("endedBy"));
        assertFalse(ifEnded.getFinalValues().containsKey("QLTY_GRD"));
    }

    // ── 이름 출처: FlowKeys.needed·resultNames ↔ RuleIoReader conds·results ──

    @Test
    void 룰이_읽고_만드는_이름의_엔진과_서버_출처를_견준다() throws Exception {
        DmeTestSupport.column(jdbc, "SET_THK", DmeTestSupport.domain(jdbc, "SET_THK_D", "QTY", "NUMBER", 2));
        DmeTestSupport.column(jdbc, "SET_SURF", DmeTestSupport.domain(jdbc, "SET_SURF_D", "TEXT", "STRING", null));
        DmeTestSupport.column(jdbc, "D_REQ", DmeTestSupport.domain(jdbc, "D_REQ_D", "QTY", "NUMBER", 0));
        DmeTestSupport.column(jdbc, "D_OPT", DmeTestSupport.domain(jdbc, "D_OPT_D", "QTY", "NUMBER", 0));
        DmeTestSupport.column(jdbc, "D_LOW", DmeTestSupport.domain(jdbc, "D_LOW_D", "QTY", "NUMBER", 0));

        // DECISION — 이름 조건 열 둘, 결과 열 하나(Value).
        DmeTestSupport.rule(jdbc, "R_DEC", "판정 룰", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_DEC", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_DEC", 1, 1, "COND", "2", "SET_THK", 1, null);
        DmeTestSupport.var(jdbc, "R_DEC", 1, 2, "COND", "1", "SET_SURF", 2, null);
        DmeTestSupport.var(jdbc, "R_DEC", 1, 3, "RESULT", "Value", "S_GRD", 1, "STRING");
        DmeTestSupport.row(jdbc, "R_DEC", 1, 1, 1, "NORMAL",
                "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"1\",\"right\":\"2\"},\"2\":{\"op\":\"IN\",\"list\":[\"A\"]},\"3\":{\"val\":\"A\"}}");

        // DERIVE — 결과 Expression 열: COALESCE(D_OPT, 0) + D_REQ → 행 required D_REQ · optional D_OPT.
        DmeTestSupport.rule(jdbc, "R_DRV", "파생 룰", "DERIVE", "INUSE");
        DmeTestSupport.released(jdbc, "R_DRV", 1, null, "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_DRV", 1, 1, "COND", "1", "SET_THK", 1, null);
        DmeTestSupport.var(jdbc, "R_DRV", 1, 2, "RESULT", "Expression", "S_SPD", 1, "NUMBER");
        DmeTestSupport.row(jdbc, "R_DRV", 1, 1, 1, "NORMAL", "{\"1\":{\"op\":\"GT\",\"left\":\"0\"},\"2\":" + exprCell("COALESCE(D_OPT, 0) + D_REQ") + "}");

        // DECISION 인데 결과 열이 Expression — 식이 읽는 D_LOW.
        DmeTestSupport.rule(jdbc, "R_DEX", "식 결과 판정 룰", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_DEX", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_DEX", 1, 1, "COND", "1", "SET_THK", 1, null);
        DmeTestSupport.var(jdbc, "R_DEX", 1, 2, "RESULT", "Expression", "S_X", 1, "NUMBER");
        DmeTestSupport.row(jdbc, "R_DEX", 1, 1, 1, "NORMAL", "{\"1\":{\"op\":\"GT\",\"left\":\"0\"},\"2\":" + exprCell("D_LOW * 2") + "}");

        // DERIVE 인데 식의 이름을 소문자로 썼다 — d_low.
        DmeTestSupport.rule(jdbc, "R_LOW", "소문자 파생 룰", "DERIVE", "INUSE");
        DmeTestSupport.released(jdbc, "R_LOW", 1, null, "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_LOW", 1, 1, "COND", "1", "SET_THK", 1, null);
        DmeTestSupport.var(jdbc, "R_LOW", 1, 2, "RESULT", "Expression", "S_L", 1, "NUMBER");
        DmeTestSupport.row(jdbc, "R_LOW", 1, 1, 1, "NORMAL", "{\"1\":{\"op\":\"GT\",\"left\":\"0\"},\"2\":" + exprCell("d_low + 1") + "}");

        List<String> ids = List.of("QLTY_GRD_JDG", "R_DEC", "R_DRV", "R_DEX", "R_LOW");
        Map<String, RuleIo> server = ioReader.read(ids);
        StoredDefinitionLookup lookup = lookup();
        Map<String, List<String>> engineReads = new LinkedHashMap<>();
        Map<String, List<String>> serverReads = new LinkedHashMap<>();
        Map<String, List<String>> engineMakes = new LinkedHashMap<>();
        Map<String, List<String>> serverMakes = new LinkedHashMap<>();
        for (String id : ids) {
            RuleDefinition def = lookup.rule(id, TS).orElseThrow();
            engineReads.put(id, SetShapeProbe.needed(def).stream().distinct().toList());
            serverReads.put(id, server.get(id).conds().stream().map(IoName::name).toList());
            engineMakes.put(id, SetShapeProbe.resultNames(def));
            serverMakes.put(id, server.get(id).results().stream().map(IoName::name).toList());
        }

        assertEquals(serverMakes, engineMakes, "만드는 이름은 같다(RES_GRP 있으면 그 이름, 결과 열 순서)");
        // 읽는 이름 — 같은 것: 이름 조건 열.
        for (String id : List.of("QLTY_GRD_JDG", "R_DEC")) {
            assertEquals(serverReads.get(id), engineReads.get(id), id + " 읽는 이름");
        }
        // DERIVE 결과 식(행 required·optional) — 이름은 같고 순서만 다르다(엔진은 행마다 required 다음 optional, 서버는 식 AST 첫 등장 순).
        // 겉모양 inputs 의 순서(첫 등장 순)만 갈릴 수 있고 이름 집합·검사는 같다.
        assertEquals(Set.copyOf(serverReads.get("R_DRV")), Set.copyOf(engineReads.get("R_DRV")));
        assertEquals(List.of("SET_THK", "D_OPT", "D_REQ"), serverReads.get("R_DRV"));
        assertEquals(List.of("SET_THK", "D_REQ", "D_OPT"), engineReads.get("R_DRV"));
        // 어긋나는 곳 ①: DECISION 의 Expression 결과 셀이 읽는 이름 — 서버는 conds 에 넣고, 엔진 needed 는 DERIVE 만 행 이름을 넣는다.
        assertEquals(List.of("SET_THK", "D_LOW"), serverReads.get("R_DEX"));
        assertEquals(List.of("SET_THK"), engineReads.get("R_DEX"));
        // 어긋나는 곳 ②: 식에 쓴 표기 — 엔진은 대문자(InputContracts.usedVariables), 서버는 처음 쓴 표기 그대로. 대소문자 무시로는 같다.
        assertEquals(List.of("SET_THK", "d_low"), serverReads.get("R_LOW"));
        assertEquals(List.of("SET_THK", "D_LOW"), engineReads.get("R_LOW"));
        assertEquals(upper(serverReads.get("R_LOW")), upper(engineReads.get("R_LOW")));
    }

    // ── 도우미 ──

    private String exprCell(String expr) throws Exception {
        return "{\"expr\":\"" + expr + "\",\"ast\":" + JSON.writeValueAsString(AstExporter.export(expr, evaluator.configuration())) + "}";
    }

    private static List<String> upper(List<String> names) {
        return names.stream().map(n -> n.toUpperCase(Locale.ROOT)).toList();
    }

    private static boolean isCatch(String name) {
        return ReservedNames.CATCH_NAMES.contains(name.toUpperCase(Locale.ROOT));
    }

    /** 룰 입출력과 같은 이름을 읽고 만드는 합성 엔진 정의 — 읽는 이름은 입력 계약 always, 만드는 이름은 결과 열(Value). */
    private static RuleDefinition definition(RuleIo r) {
        List<RuleVar> vars = new ArrayList<>();
        int k = 0;
        for (IoName n : r.results()) {
            k++;
            vars.add(new RuleVar(k, VarKind.RESULT, DispType.VALUE, n.name(), null, null, List.of(), DataType.STRING, null, null, null, null, null, null,
                    null, k));
        }
        List<VarType> always = r.conds().stream().map(n -> new VarType(n.name(), DataType.STRING, null, null)).toList();
        return new RuleDefinition(r.ruleId(), BigDecimal.ONE, RuleKind.DECISION, HitPolicy.FIRST, null, null, null, vars,
                new InputContract(always, List.of()), List.of());
    }

    private static RuleIo io(String id, List<String> conds, List<String> results) {
        return new RuleIo(id, null, "DECISION", "INUSE", true, "1.000", "FIRST",
                conds.stream().map(n -> new IoName(n, RuleIo.NONE, null, null, null, false, null)).toList(),
                results.stream().map(n -> new IoName(n, null, null, null, null, false, null)).toList());
    }

    private static JsonNode cases(String file) throws IOException {
        JsonNode root = JSON.readTree(RULE_RES.resolve(file).toFile());
        assertEquals(1, root.path("version").asInt(), file);
        return root.path("cases");
    }

    /** RuleSetCorpusTest 의 빈 칸 채움 규칙 그대로 — 빠진 칸은 null·false·빈 목록. */
    private static RuleIo corpusRule(String id, JsonNode r) {
        List<IoName> conds = new ArrayList<>();
        r.path("conds").forEach(n -> conds.add(new IoName(text(n, "name"), text(n, "source"), null, null, null, false, null)));
        List<IoName> results = new ArrayList<>();
        r.path("results").forEach(n -> results.add(new IoName(text(n, "name"), null, null, null, null, false, null)));
        JsonNode ver = r.path("releasedVer");
        return new RuleIo(id, null, null, text(r, "status"), r.path("exists").asBoolean(false),
                ver.isNull() || ver.isMissingNode() ? null : VersionNumbers.plain(VersionNumbers.parse(ver.asText())), text(r, "hitPolicy"), conds, results,
                r.path("hasDefault").asBoolean(false));
    }

    /** RuleSetCorpusTest 의 calls 읽기 그대로. */
    private static SetCallIo corpusCall(String id, JsonNode n) {
        List<IoName> inputs = new ArrayList<>();
        n.path("inputs").forEach(i -> inputs.add(new IoName(text(i, "name"), text(i, "source"), null, null, null, false, null)));
        List<SetCallIo.OutputName> outputs = new ArrayList<>();
        n.path("outputs").forEach(o -> outputs.add(new SetCallIo.OutputName(text(o, "name"), null, null, false, null, o.path("always").asBoolean(false))));
        return new SetCallIo(id, null, n.path("exists").asBoolean(false), text(n, "status"), inputs, outputs, n.path("endsEarly").asBoolean(false));
    }

    private static List<String> strings(JsonNode node) {
        List<String> out = new ArrayList<>();
        node.forEach(n -> out.add(n.asText()));
        return out;
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return v.isNull() || v.isMissingNode() ? null : v.asText();
    }
}
