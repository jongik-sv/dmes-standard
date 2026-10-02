package com.dongkuk.dmes.mdm.common.rule.confirm;

import com.dongkuk.dmes.mdm.contract.version.DiffKind;
import com.dongkuk.dmes.mdm.contract.version.VersionDiffEntry;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.TreeSet;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowEdge;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode;

/** 세트 버전 diff(D-144 2단계) — 노드·선 ID 를 키로 견준다. 화면 전용 view(배치·색)는 보지 않는다. 순수. */
public final class RuleSetVersionDiffs {

    private RuleSetVersionDiffs() {
    }

    /** base 가 null 이면(최초 버전) 모두 ADDED. 키 글자 순. */
    public static List<VersionDiffEntry> diff(FlowDefinition base, FlowDefinition target) {
        Map<String, Map<String, Object>> before = entries(base);
        Map<String, Map<String, Object>> after = entries(target);
        TreeSet<String> keys = new TreeSet<>(before.keySet());
        keys.addAll(after.keySet());
        List<VersionDiffEntry> out = new ArrayList<>(keys.size());
        for (String key : keys) {
            Map<String, Object> o = before.get(key);
            Map<String, Object> n = after.get(key);
            DiffKind kind = o == null ? DiffKind.ADDED : n == null ? DiffKind.REMOVED : Objects.equals(o, n) ? DiffKind.SAME : DiffKind.CHANGED;
            out.add(new VersionDiffEntry(key, kind, o, n));
        }
        return out;
    }

    private static Map<String, Map<String, Object>> entries(FlowDefinition f) {
        Map<String, Map<String, Object>> out = new TreeMap<>();
        if (f == null) {
            return out;
        }
        for (FlowNode n : f.nodes()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("kind", n.kind().name());
            m.put("ruleId", n.ruleId());
            m.put("label", n.label());
            m.put("splitId", n.splitId());
            m.put("attachTo", n.attachTo());
            m.put("catches", n.catches());
            out.putIfAbsent("NODE:" + n.id(), m);
        }
        for (FlowEdge e : f.edges()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("from", e.from());
            m.put("to", e.to());
            m.put("order", e.order());
            m.put("cond", e.cond());
            m.put("otherwise", e.otherwise());
            m.put("label", e.label());
            out.putIfAbsent("EDGE:" + e.id(), m);
        }
        return out;
    }
}
