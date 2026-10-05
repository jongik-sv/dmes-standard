package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.rule.RuleIo.IoName;
import com.dongkuk.dmes.mdm.common.rule.RuleSetAnalyzer.SetIo;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;
import kr.dongkuk.maru.mdm.engine.flow.FlowParse;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.flow.RuleStep;
import kr.dongkuk.maru.mdm.engine.flow.SetStep;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * TSK-08-06 design §3.3·§6.8·I9 — 세트 계산 코퍼스 동치의 Java 쪽. 한 벌 코퍼스 {@code rule-set-corpus.json} 을 {@link RuleSetAnalyzer} 로 돌려
 * {@code io}·{@code deps}·{@code checks}(message 포함)가 {@code expect} 와 순서까지 같은지 본다. TS 러너(m-mdm
 * {@code tests/dme/ruleSetEdit/rule-set-corpus.test.ts})가 같은 파일을 읽고 사례 수 하한을 같게 둔다.
 *
 * <p>읽기 규칙(두 러너 공통): {@code rules} 원소의 빠진 칸은 null·false·빈 목록으로 채운다({@code exists} 를 빠뜨리면 없는 룰이고,
 * {@code hitPolicy}·{@code hasDefault} 가 빠지면 null·false 다). {@code rules} 에 키가 없는 ID 는 없는 룰이다. {@code checks} 의 빠진 칸과
 * {@code null} 은 같다.
 *
 * <p>{@code flow} 가 있으면 {@code ids} 는 {@code RuleSetFlowJson.ruleIds(flow)} 기대값이고(RULE 만 — SET 노드의 세트 ID 는 넣지 않는다),
 * io·deps 는 흐름 오버로드, checks 는 {@code checks(flow, rules, condIo, calls)} 로 계산한다. checks 의 빠진 {@code nodeId}·{@code edgeId} 는 null 이다.
 *
 * <p>{@code calls}(하위 세트 계획 Task 5) 원소(세트 ID → 겉모양 {@link SetCallIo})의 빠진 칸은 false·null·빈 목록이다({@code exists} 를 빠뜨리면 없는
 * 세트다). {@code calls} 에 키가 없는 세트 ID 도 없는 세트다. flow 사례의 io·deps·checks 는 calls 를 넘기는 겹정의로 계산한다.
 *
 * <p>같은 형식의 퍼즈 파일 {@code rule-set-fuzz.json}({@link RuleSetFlowFuzz} 가 시드로 만들고 expect 는 Java 결과)도 함께 돌린다. Java 쪽에서는
 * 자기 결과와 같은지(생성 뒤 분석기가 바뀌지 않았는지), TS 쪽에서는 두 언어 차분이다.
 */
class RuleSetCorpusTest {

    /** 사례 수 하한 — TS 러너와 같은 값(design §3.3). TS 러너({@code rule-set-corpus.test.ts})도 같은 값으로 맞춘다. */
    static final int MIN_CASES = 111;

    /** 퍼즈 파일 사례 수 하한 — TS 러너와 같은 값({@link RuleSetFlowFuzz#COUNT}). */
    static final int MIN_FUZZ_CASES = 200;

    /** 클래스패스 위치 = {@code src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json}. 없으면 실패한다(건너뛰지 않는다). */
    static final String CORPUS = "/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json";

    /** 퍼즈 파일({@link RuleSetFlowFuzz#RESOURCE}). 없으면 실패한다. */
    static final String FUZZ = RuleSetFlowFuzz.RESOURCE;

    private static final ObjectMapper JSON = new ObjectMapper();

    static JsonNode cases(String resource) throws IOException {
        try (InputStream in = RuleSetCorpusTest.class.getResourceAsStream(resource)) {
            assertNotNull(in, "세트 계산 코퍼스가 없다: " + resource);
            JsonNode root = JSON.readTree(in);
            assertEquals(1, root.path("version").asInt(), "코퍼스 version: " + resource);
            return root.path("cases");
        }
    }

    static Stream<Arguments> corpus() throws IOException {
        List<Arguments> out = new ArrayList<>();
        for (String resource : List.of(CORPUS, FUZZ)) {
            cases(resource).forEach(c -> out.add(Arguments.of(c.path("name").asText(), c)));
        }
        return out.stream();
    }

    @Test
    void 사례_수가_하한_이상이고_이름이_겹치지_않는다() throws IOException {
        JsonNode cases = cases(CORPUS);
        assertTrue(cases.size() >= MIN_CASES, "사례 " + cases.size() + " < 하한 " + MIN_CASES);
        JsonNode fuzz = cases(FUZZ);
        assertTrue(fuzz.size() >= MIN_FUZZ_CASES, "퍼즈 사례 " + fuzz.size() + " < 하한 " + MIN_FUZZ_CASES);
        Set<String> names = new HashSet<>();
        cases.forEach(c -> assertTrue(names.add(c.path("name").asText()), "name 중복: " + c.path("name").asText()));
        fuzz.forEach(c -> assertTrue(names.add(c.path("name").asText()), "name 중복: " + c.path("name").asText()));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("corpus")
    void 세트_계산이_코퍼스_기대와_순서와_문구까지_같다(String name, JsonNode c) {
        List<String> ids = strings(c.path("ids"));
        Map<String, RuleIo> rules = new LinkedHashMap<>();
        c.path("rules").properties().forEach(e -> rules.put(e.getKey(), rule(e.getKey(), e.getValue())));
        Map<String, SetCallIo> calls = new LinkedHashMap<>();
        c.path("calls").properties().forEach(e -> calls.put(e.getKey(), call(e.getKey(), e.getValue())));
        JsonNode expect = c.path("expect");
        FlowDefinition flow = c.has("flow") ? RuleSetFlowJson.parse(c.get("flow").toString()) : null;
        if (flow != null) {
            assertEquals(ids, RuleSetFlowJson.ruleIds(flow), name + " ids(펼친 목록)");
        }

        SetIo io = flow == null ? RuleSetAnalyzer.io(ids, rules) : RuleSetAnalyzer.io(flow, rules, calls);
        List<Map<String, Object>> inputs = new ArrayList<>();
        expect.path("io").path("inputs").forEach(i -> inputs.add(map("name", text(i, "name"), "source", text(i, "source"), "users", strings(i.path("users")))));
        assertEquals(inputs, io.inputs().stream().map(i -> map("name", i.name(), "source", i.source(), "users", i.users())).toList(), name + " io.inputs");
        List<Map<String, Object>> results = new ArrayList<>();
        expect.path("io").path("results").forEach(r -> results.add(map("name", text(r, "name"), "by", strings(r.path("by")), "readers", strings(r.path("readers")))));
        assertEquals(results, io.results().stream().map(r -> map("name", r.name(), "by", r.by(), "readers", r.readers())).toList(), name + " io.results");

        Map<String, List<String>> deps = new LinkedHashMap<>();
        expect.path("deps").properties().forEach(e -> deps.put(e.getKey(), strings(e.getValue())));
        Map<String, List<String>> actualDeps = flow == null ? RuleSetAnalyzer.deps(ids, rules) : RuleSetAnalyzer.deps(flow, rules, calls);
        assertEquals(List.copyOf(deps.entrySet()), List.copyOf(actualDeps.entrySet()), name + " deps");

        List<RuleSetCheck> checks = new ArrayList<>();
        expect.path("checks").forEach(k -> checks.add(new RuleSetCheck(text(k, "code"), text(k, "severity"), text(k, "ruleId"),
                text(k, "otherRuleId"), text(k, "varName"), text(k, "message"), text(k, "nodeId"), text(k, "edgeId"))));
        List<RuleSetCheck> actual = flow == null ? RuleSetAnalyzer.checks(ids, rules) : RuleSetAnalyzer.checks(flow, rules, condIo(c.path("condIo")), calls);
        assertEquals(checks, actual, name + " checks");
    }

    static Map<String, CondIo> condIo(JsonNode node) {
        Map<String, CondIo> out = new LinkedHashMap<>();
        node.properties().forEach(e -> {
            List<IoName> vars = new ArrayList<>();
            e.getValue().path("vars").forEach(v -> vars.add(new IoName(text(v, "name"), text(v, "source"), null, null, null, false, null)));
            out.put(e.getKey(), new CondIo(e.getValue().path("ok").asBoolean(false), text(e.getValue(), "message"), vars));
        });
        return out;
    }

    static RuleIo rule(String id, JsonNode r) {
        List<IoName> conds = new ArrayList<>();
        r.path("conds").forEach(n -> conds.add(new IoName(text(n, "name"), text(n, "source"), null, null, null, false, null)));
        List<IoName> results = new ArrayList<>();
        r.path("results").forEach(n -> results.add(new IoName(text(n, "name"), null, null, null, null, false, null)));
        JsonNode ver = r.path("releasedVer");
        return new RuleIo(id, null, null, text(r, "status"), r.path("exists").asBoolean(false),
                ver.isNull() || ver.isMissingNode() ? null : VersionNumbers.plain(VersionNumbers.parse(ver.asText())), text(r, "hitPolicy"), conds, results, r.path("hasDefault").asBoolean(false));
    }

    /** 코퍼스 calls 원소 하나 → 겉모양. 입력 이름·출처, 출력 이름·always 만 읽고 타입·표시명은 null 이다. */
    static SetCallIo call(String id, JsonNode n) {
        List<IoName> inputs = new ArrayList<>();
        n.path("inputs").forEach(i -> inputs.add(new IoName(text(i, "name"), text(i, "source"), null, null, null, false, null)));
        List<SetCallIo.OutputName> outputs = new ArrayList<>();
        n.path("outputs").forEach(o -> outputs.add(new SetCallIo.OutputName(text(o, "name"), null, null, false, null, o.path("always").asBoolean(false))));
        return new SetCallIo(id, null, n.path("exists").asBoolean(false), text(n, "status"), inputs, outputs, n.path("endsEarly").asBoolean(false));
    }

    /**
     * 하위 세트 계획 srv:5 조정 — 분석기가 트리를 직접 걸어 모은 RULE·SET 단계의 RULE 부분이 {@code FlowTree.ruleSteps()} 와 같은 순서이고, 세트 키를 뺀
     * {@code callKeys} 가 {@code RuleSetFlowJson.ruleIds} 와 같다(구조 오류 사례 포함). 기존 RULE·TASK 흐름의 io·deps·검사 순서가 그대로라는 근거다.
     */
    @ParameterizedTest(name = "{0}")
    @MethodSource("corpus")
    void 분석기가_모은_RULE_단계는_FlowTree_ruleSteps_와_순서가_같다(String name, JsonNode c) {
        FlowDefinition flow = c.has("flow") ? RuleSetFlowJson.parse(c.get("flow").toString()) : FlowParser.linear(strings(c.path("ids")));
        FlowParse p = FlowParser.parse(flow);
        if (p.tree() != null) {
            assertEquals(p.tree().ruleSteps(), RuleSetAnalyzer.callSteps(p.tree()).stream().filter(s -> s instanceof RuleStep).map(s -> (RuleStep) s).toList(),
                    name + " RULE 단계 순서");
            assertEquals(p.tree().setSteps(), RuleSetAnalyzer.callSteps(p.tree()).stream().filter(s -> s instanceof SetStep).map(s -> (SetStep) s).toList(),
                    name + " SET 단계 순서");
        }
        assertEquals(RuleSetFlowJson.ruleIds(flow), RuleSetAnalyzer.callKeys(flow, p).stream().filter(k -> !SetCallIo.isKey(k)).toList(), name + " callKeys 의 룰 부분");
    }

    private static Map<String, Object> map(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    private static List<String> strings(JsonNode array) {
        List<String> out = new ArrayList<>();
        array.forEach(n -> out.add(n.asText()));
        return out;
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return v.isNull() || v.isMissingNode() ? null : v.asText();
    }
}
