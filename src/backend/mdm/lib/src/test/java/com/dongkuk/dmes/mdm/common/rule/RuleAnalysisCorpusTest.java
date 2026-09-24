package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.rule.RuleAnalysisInputMapper.StoredRow;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;
import kr.dongkuk.maru.mdm.engine.rule.RuleAnalyzer;
import kr.dongkuk.maru.mdm.engine.rule.RuleIssue;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * TSK-08-02 design §3.1·§3.3 「RuleAnalysisCorpusTest」 — 수용 기준 7 의 Java 쪽 증명. 한 벌 코퍼스(엔진 test resources 의
 * {@code analysis/analysis-corpus.json})를 운영 변환기 {@link RuleAnalysisInputMapper} → 이식 분석기 {@link RuleAnalyzer} 로 돌려
 * {@code {code, severity, rowIds, varId, lower, upper}} 목록이 {@code expect} 와 순서까지 같은지 본다. 이 경로는 표 저장 응답 issues 를
 * 만드는 경로와 같다(I12). TS 러너(m-mdm {@code tests/dme/ruleEdit/rule-analysis-corpus.test.ts})와 사례 수 하한을 같게 둔다(I15).
 */
class RuleAnalysisCorpusTest {

    /** 사례 수 하한 — TS 러너와 같은 값(design §6.6.2, 08-04 가 사례를 더하면 두 러너를 함께 올린다). */
    static final int MIN_CASES = 30;

    /** Gradle 테스트 작업 디렉터리 = src/backend/mdm/lib. 파일이 없으면 실패한다(건너뛰지 않는다). */
    static final Path CORPUS = Path.of("../../maru-mdm-engine/src/test/resources/kr/dongkuk/maru/mdm/engine/analysis/analysis-corpus.json");

    private static final ObjectMapper JSON = new ObjectMapper();

    static JsonNode cases() throws IOException {
        assertTrue(Files.isRegularFile(CORPUS), "분석 코퍼스가 없다: " + CORPUS.toAbsolutePath());
        JsonNode root = JSON.readTree(CORPUS.toFile());
        assertEquals(1, root.path("version").asInt(), "코퍼스 version");
        return root.path("cases");
    }

    static Stream<Arguments> corpus() throws IOException {
        List<Arguments> out = new ArrayList<>();
        cases().forEach(c -> out.add(Arguments.of(c.path("id").asText(), c)));
        return out.stream();
    }

    @Test
    void 사례_수가_하한_이상이고_id_가_겹치지_않는다() throws IOException {
        JsonNode cases = cases();
        assertTrue(cases.size() >= MIN_CASES, "사례 " + cases.size() + " < 하한 " + MIN_CASES);
        Set<String> ids = new HashSet<>();
        cases.forEach(c -> assertTrue(ids.add(c.path("id").asText()), "id 중복: " + c.path("id").asText()));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("corpus")
    void 운영_변환기와_이식_분석기가_코퍼스_기대와_순서까지_같다(String id, JsonNode c) {
        JsonNode r = c.path("rule");
        List<ResolvedVar> vars = new ArrayList<>();
        r.path("vars").forEach(v -> vars.add(new ResolvedVar(v.path("varId").asInt(), v.path("varKind").asText(), v.path("dispType").asText(),
                v.path("seq").asInt(), text(v, "varName"), v.path("exprVar").asBoolean(), null, v.path("dataType").asText(),
                v.path("scale").isNull() || v.path("scale").isMissingNode() ? null : v.path("scale").asInt(), v.path("dateString").asBoolean(),
                text(v, "maruCodeId"), null, null, null, null)));
        List<StoredRow> rows = new ArrayList<>();
        r.path("rows").forEach(w -> rows.add(new StoredRow(w.path("rowId").asInt(), w.path("seq").asInt(), w.path("rowKind").asText(),
                w.path("cells").asText())));

        List<RuleIssue> issues = RuleAnalyzer.analyze(
                RuleAnalysisInputMapper.toAnalysisRule(r.path("ruleId").asText(), r.path("ruleKind").asText(), text(r, "hitPolicy"), vars, rows));

        List<Map<String, Object>> expected = new ArrayList<>();
        c.path("expect").forEach(e -> expected.add(project(e.path("code").asText(), e.path("severity").asText(), ints(e.path("rowIds")),
                e.has("varId") ? e.path("varId").asInt() : null, text(e, "lower"), text(e, "upper"))));
        List<Map<String, Object>> actual = issues.stream()
                .map(i -> project(i.code().name(), i.severity().name(), i.rowIds(), i.varId(), i.lower(), i.upper()))
                .toList();
        assertEquals(expected, actual, id);
    }

    private static Map<String, Object> project(String code, String severity, List<Integer> rowIds, Integer varId, String lower, String upper) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("code", code);
        m.put("severity", severity);
        m.put("rowIds", rowIds);
        m.put("varId", varId);
        m.put("lower", lower);
        m.put("upper", upper);
        return m;
    }

    private static List<Integer> ints(JsonNode array) {
        List<Integer> out = new ArrayList<>();
        array.forEach(n -> out.add(n.asInt()));
        return out;
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return v.isNull() || v.isMissingNode() ? null : v.asText();
    }
}
