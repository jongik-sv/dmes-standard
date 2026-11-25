package com.dongkuk.dmes.mqc.qcd.designSimulation.service;

import com.dongkuk.dmes.mqc.qcd.order.pipeline.PinPaths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 케이스 평가(simulation.html checkPins·checkVerdicts·goldenDiff·caseStatus). 순수 함수.
 * 상태: pin·판정 기대·골든 diff 중 하나라도 어긋나면 FAIL, 아니면 경고(warn·error 이상징후)가 있으면 WARN, 아니면 PASS.
 */
public final class CaseEvaluator {

    public static final Map<String, String> STATUS_NM = Map.of("NOT_RUN", "미실행", "PASS", "PASS", "WARN", "경고", "FAIL", "FAIL");

    private CaseEvaluator() {
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> evaluate(Map<String, Object> run, List<Map<String, Object>> pins, List<Map<String, Object>> verdicts,
                                               Map<String, String> golden, String goldenAt) {
        Map<String, Object> design = (Map<String, Object>) run.get("design");
        List<Map<String, Object>> pinResults = new ArrayList<>();
        int pinPass = 0;
        for (Map<String, Object> p : pins) {
            String path = str(p.get("path"));
            String op = p.get("op") == null ? "=" : str(p.get("op"));
            Object actual = PinPaths.resolve(design, path);
            boolean ok = PinPaths.compare(op, actual, str(p.get("val")));
            if (ok) pinPass++;
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("path", path);
            r.put("label", p.get("label"));
            r.put("op", op);
            r.put("val", p.get("val"));
            r.put("actual", PinPaths.text(actual));
            r.put("ok", ok);
            pinResults.add(r);
        }
        List<Map<String, Object>> stages = (List<Map<String, Object>>) run.get("stages");
        List<Map<String, Object>> verdictResults = new ArrayList<>();
        int verdictPass = 0;
        for (Map<String, Object> v : verdicts) {
            int no = v.get("stage") instanceof Number n ? n.intValue() : Integer.parseInt(str(v.get("stage")));
            Map<String, Object> st = stages.stream().filter(s -> ((Number) s.get("no")).intValue() == no).findFirst().orElse(null);
            String expectCode = v.get("expectErrorCode") == null ? null : str(v.get("expectErrorCode"));
            String expect = v.get("expect") == null ? null : str(v.get("expect"));
            String actual;
            boolean ok;
            if (st == null) {
                actual = null;
                ok = false;
            } else if (expectCode != null) {
                Object detail = st.get("detail");
                List<String> codes = new ArrayList<>();
                if (detail instanceof Map<?, ?> d && d.get("fired") instanceof List<?> fired) {
                    for (Object f : fired) if (f instanceof Map<?, ?> fm) codes.add(str(fm.get("errCd")));
                }
                actual = String.join(",", codes);
                ok = codes.contains(expectCode);
            } else {
                actual = st.get("verdict") == null ? null : str(st.get("verdict"));
                ok = expect != null && expect.equals(actual);
            }
            if (ok) verdictPass++;
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("stage", no);
            r.put("expect", expect);
            r.put("expectErrorCode", expectCode);
            r.put("actual", actual);
            r.put("ok", ok);
            verdictResults.add(r);
        }
        List<Map<String, Object>> diff = golden == null ? List.of() : PinPaths.diff(golden, PinPaths.snapshot(design));
        List<Map<String, Object>> anomalies = (List<Map<String, Object>>) run.getOrDefault("anomalies", List.of());
        int warn = (int) anomalies.stream().filter(a -> !"info".equals(a.get("severity"))).count();
        String status = pinPass < pinResults.size() || verdictPass < verdictResults.size() || !diff.isEmpty() ? "FAIL" : warn > 0 ? "WARN" : "PASS";
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", status);
        out.put("statusNm", STATUS_NM.get(status));
        out.put("pins", pinResults);
        out.put("pinPass", pinPass);
        out.put("pinTotal", pinResults.size());
        out.put("verdicts", verdictResults);
        out.put("verdictPass", verdictPass);
        out.put("verdictTotal", verdictResults.size());
        out.put("goldenAt", goldenAt);
        out.put("goldenDiff", diff);
        out.put("anomalies", anomalies.size());
        out.put("warnings", warn);
        return out;
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}
