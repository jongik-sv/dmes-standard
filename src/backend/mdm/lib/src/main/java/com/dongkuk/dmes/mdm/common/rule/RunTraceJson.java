package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.EngineWarning;
import kr.dongkuk.maru.mdm.engine.rule.RuleResult;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace;

/**
 * 실행 기록 → 엔진 계약 스키마 {@code $defs/RunTrace} 모양의 맵(룰 세트 흐름도 2단계 P5). 엔진 계약(Java 타입·스키마)은 바꾸지 않고 JSON 모양만
 * 여기서 만든다 — 엔진은 Jackson 을 쓰지 않는다.
 *
 * <ul>
 *   <li>시각: KST 벽시계 {@code yyyy-MM-dd'T'HH:mm:ss}.</li>
 *   <li>값({@code input}·{@code finalValues}·{@code reads}·{@code result.results}): TypedValue — null → NULL, 숫자 → NUMBER(십진 문자열),
 *       String → STRING, Boolean → BOOLEAN({@code "true"}/{@code "false"}), List → LIST. 그 밖의 타입은 {@link IllegalStateException}.</li>
 *   <li>{@code NodeTrace}: 스키마 속성을 모두 싣되 {@code result} 가 null 이면 키를 뺀다. 나머지 null 칸은 null 로 싣는다.</li>
 * </ul>
 * 키 순서는 스키마 속성 순서다(골든 파일이 사람이 읽는 순서).
 */
public final class RunTraceJson {

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    private RunTraceJson() {
    }

    public static Map<String, Object> toMap(RunTrace t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("setId", t.setId());
        m.put("evalTs", ts(t.evalTs()));
        m.put("input", values(t.input()));
        List<Object> nodes = new ArrayList<>(t.nodes().size());
        for (RunTrace.NodeTrace n : t.nodes()) {
            nodes.add(node(n));
        }
        m.put("nodes", nodes);
        m.put("finalValues", values(t.finalValues()));
        m.put("violations", violations(t.violations()));
        return m;
    }

    private static Map<String, Object> node(RunTrace.NodeTrace n) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("seq", n.seq());
        m.put("nodeId", n.nodeId());
        m.put("kind", n.kind().name());
        m.put("status", n.status().name());
        m.put("ruleId", n.ruleId());
        m.put("ver", n.ver());
        m.put("reads", n.reads() == null ? null : values(n.reads()));
        if (n.result() != null) {
            m.put("result", result(n.result()));
        }
        m.put("branches", n.branches() == null ? null : n.branches().stream().map(RunTraceJson::branch).toList());
        m.put("chosenEdgeId", n.chosenEdgeId());
        m.put("order", n.order() == null ? null : List.copyOf(n.order()));
        m.put("splitId", n.splitId());
        m.put("merged", n.merged() == null ? null : List.copyOf(n.merged()));
        m.put("violations", violations(n.violations()));
        return m;
    }

    private static Map<String, Object> branch(RunTrace.BranchTrace b) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("edgeId", b.edgeId());
        m.put("outcome", b.outcome().name());
        m.put("message", b.message());
        return m;
    }

    private static Map<String, Object> result(RuleResult r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ruleId", r.ruleId());
        m.put("ver", r.ver());
        m.put("evalTs", ts(r.evalTs()));
        m.put("hits", r.hits().stream().map(RunTraceJson::hit).toList());
        m.put("defaultApplied", r.defaultApplied());
        m.put("results", values(r.results()));
        m.put("trace", r.trace().stream().map(RunTraceJson::row).toList());
        m.put("warnings", r.warnings().stream().map(RunTraceJson::warning).toList());
        return m;
    }

    private static Map<String, Object> hit(RuleResult.Hit h) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rowId", h.rowId());
        m.put("seq", h.seq());
        m.put("groupChoices", new LinkedHashMap<>(h.groupChoices()));
        return m;
    }

    private static Map<String, Object> row(RuleResult.RowTrace t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rowId", t.rowId());
        m.put("seq", t.seq());
        m.put("evaluated", t.evaluated());
        m.put("hit", t.hit());
        m.put("firstFalseVarId", t.firstFalseVarId());
        return m;
    }

    private static Map<String, Object> warning(EngineWarning w) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("code", w.code().name());
        m.put("ruleId", w.ruleId());
        m.put("rowId", w.rowId());
        m.put("varId", w.varId());
        m.put("message", w.message());
        return m;
    }

    private static List<Object> violations(List<Violation> vs) {
        if (vs == null) {
            return null;
        }
        List<Object> out = new ArrayList<>(vs.size());
        for (Violation v : vs) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("stage", v.stage().name());
            m.put("code", v.code().name());
            m.put("ruleId", v.ruleId());
            m.put("rowId", v.rowId());
            m.put("name", v.name());
            m.put("message", v.message());
            out.add(m);
        }
        return out;
    }

    private static Map<String, Object> values(Map<String, Object> vs) {
        Map<String, Object> m = new LinkedHashMap<>();
        vs.forEach((k, v) -> m.put(k, typed(v)));
        return m;
    }

    /** 값 하나 → TypedValue. */
    static Map<String, Object> typed(Object v) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (v == null) {
            m.put("type", "NULL");
        } else if (v instanceof Number n) {
            m.put("type", "NUMBER");
            m.put("value", new BigDecimal(n.toString()).toPlainString());
        } else if (v instanceof String s) {
            m.put("type", "STRING");
            m.put("value", s);
        } else if (v instanceof Boolean b) {
            m.put("type", "BOOLEAN");
            m.put("value", b.toString());
        } else if (v instanceof List<?> l) {
            m.put("type", "LIST");
            List<Object> items = new ArrayList<>(l.size());
            for (Object x : l) {
                items.add(typed(x));
            }
            m.put("items", items);
        } else {
            throw new IllegalStateException("기록 값 타입을 모른다: " + v.getClass().getName());
        }
        return m;
    }

    private static String ts(Instant ts) {
        return LocalDateTime.ofInstant(ts, MdmClockConfig.KST).format(TS);
    }
}
