package com.dongkuk.dmes.mdm.common.rule;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.rule.RuleIssue;

/**
 * 분석 이슈 → 응답 모양(TSK-08-02 design §6.2). 값이 없는 칸(varId·lower·upper)은 싣지 않는다 — TS {@code RuleIssue} 를 JSON 으로
 * 옮긴 모양과 같아 화면이 즉시 검사 결과와 그대로 견줄 수 있다({@code sameIssues}).
 */
public final class RuleIssueMaps {

    private RuleIssueMaps() {
    }

    public static List<Map<String, Object>> of(List<RuleIssue> issues) {
        List<Map<String, Object>> out = new ArrayList<>(issues.size());
        for (RuleIssue i : issues) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("code", i.code().name());
            m.put("severity", i.severity().name());
            m.put("rowIds", i.rowIds());
            if (i.varId() != null) {
                m.put("varId", i.varId());
            }
            if (i.lower() != null) {
                m.put("lower", i.lower());
            }
            if (i.upper() != null) {
                m.put("upper", i.upper());
            }
            m.put("message", i.message());
            out.add(m);
        }
        return out;
    }
}
