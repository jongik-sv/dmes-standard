package com.dongkuk.dmes.mqc.qcd.order.pipeline;

import static com.dongkuk.dmes.mqc.qcd.order.pipeline.DesignCatalog.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * ⑥ 설계값 계산 — Maru 룰로 값을 정하고 값마다 근거(룰 ID·버전·적중 행)를 남긴다.
 * <ul>
 *   <li>원자재: QD_RAW_MATERIAL_GRADE(PRD_NM_CD, SPC_AVR, ORD_USG_CD, THK=주문두께) → RAW_MAT_PRI. 미적중이면 재질별 표준 원자재.</li>
 *   <li>압연 SET: C10B2060 → 보정치·단위. 압연목표 = BMT t+c / TCT t−g+c (PCN·TRK 도 지원), SP 0%(C10B2070 미등록), 소수 3자리 절삭, 0.005 눈금.</li>
 *   <li>통과공정: 사양 PROC_CD &gt; QD_PROCESS_ROUTING → ROUTE_CD &gt; 품명별 표준 경로.</li>
 *   <li>폭: 제품폭에서 거꾸로 — 정전 마진(C10B1079)·정전 수축(C10B1077)·CCL 수축(C10B1078)·CGL 수축(C10B1075) → PLTCM 폭목표,
 *       + PLTCM 마진(C10B1073) = Side Trimming Set, + PLTCM 수축(C10B1074) = 원자재 폭. 미적중이면 0(룰 화면과 같은 규칙).</li>
 * </ul>
 */
public final class DesignCalc {

    static final BigDecimal TOL = new BigDecimal("0.015");

    final OrderInput o;
    final SpecMatch spec;
    final String prd;
    final String mat;
    final String spc;
    final String cus;
    final BigDecimal t;
    final BigDecimal w;
    final boolean has;
    final boolean color;
    final int[] coat;
    final String gw;
    final String thkTp;

    // 결과값
    RuleHit thkStdHit, baseGradeHit, rawHit, rollHit, routeHit;
    RuleHit jzMarginHit, jzShrinkHit, cclShrinkHit, cglShrinkHit, pMarginHit, pShrinkHit;
    String thkStd, baseGrade;
    String rawCode, rawKind, rawAlt, rawMatCd;
    BigDecimal rawThk, rawWid;
    BigDecimal adj = BigDecimal.ZERO;
    String corUnit = "CRN";
    BigDecimal rollTarget, outThk, setThk;
    String rollFormula;
    String routeCd, routeKind;
    final List<String[]> routeSteps = new ArrayList<>();   // [code, line]
    String mainLine, cglCode;
    boolean hasCcl;
    BigDecimal mJz = BigDecimal.ZERO, sJz = BigDecimal.ZERO, sCcl = BigDecimal.ZERO, sCgl = BigDecimal.ZERO, mP = BigDecimal.ZERO, sP = BigDecimal.ZERO;
    BigDecimal jzIn, cclIn, pltcmOut, trimSet;
    String pack, packKind;
    String bom;
    String topThk;
    final List<String> fallbacks = new ArrayList<>();
    final Map<String, Map<String, Object>> trace = new LinkedHashMap<>();

    DesignCalc(OrderInput o, SpecMatch spec) {
        this.o = o;
        this.spec = spec;
        this.prd = o.prd();
        this.mat = o.get("MAT_CD", "");
        this.spc = o.get("SPC_AVR", "");
        this.cus = o.get("FNL_CUS_CD", o.get("CUS_CD", ""));
        this.t = o.num("ORD_EXC_THK");
        this.w = o.num("ORD_EXC_WTH");
        this.has = t != null && w != null;
        this.color = isColor(prd);
        this.coat = COAT_RANGE.getOrDefault(prd, new int[] {0, 0, 0, 0});
        this.gw = o.get("GW_ASG_CD", GW_CD.getOrDefault(prd, ""));
        this.thkTp = o.get("ORD_THK_TP", "1");
    }

    void compute(RuleCaller.Session s) {
        String org = specOrg(spc);
        thkStdHit = s.judge(RULE_SPEC_THK_STD, map("SPEC_ORG_CD", org));
        thkStd = thkStdHit.matched() ? thkStdHit.result("THK_STD_CD") : ("2".equals(thkTp) ? "TCT" : "BMT");
        baseGradeHit = s.judge(RULE_SPEC_BASE_GRADE, map("SPEC_ORG_CD", org, "STL_GRD_CD", steelGrade(spc)));
        baseGrade = baseGradeHit.matched() ? baseGradeHit.result("BASE_STL_GRD_CD") : null;

        // 원자재
        rawHit = s.judge(RULE_RAW_GRADE, map("PRD_NM_CD", prd, "SPC_AVR", spc, "ORD_USG_CD", o.get("ORD_USG_CD"), "THK", t));
        SpecMatch.Override rawOv = spec.overrides().get("RAW_MTRL");
        if (rawOv != null) {
            rawCode = rawOv.value();
            rawKind = "spec";
        } else if (rawHit.matched() && rawHit.result("RAW_MAT_PRI") != null) {
            rawCode = rawHit.result("RAW_MAT_PRI");
            rawKind = "rule";
        } else {
            rawCode = MAT_HR.getOrDefault(mat, "H32");
            rawKind = rawHit.missing() ? "missing" : "formula";
            fallbacks.add("원자재 코드(재질 " + mat + " 표준 " + rawCode + ")");
        }
        rawMatCd = rawHit.matched() ? rawHit.result("MAT_CD") : null;
        rawAlt = "G32";
        if (rawHit.matched() && rawHit.result("RAW_MAT_ALT") != null) {
            for (String a : rawHit.result("RAW_MAT_ALT").split(",")) {
                if (!a.isBlank() && !a.trim().equals(rawCode) && !"-".equals(a.trim())) {
                    rawAlt = a.trim();
                    break;
                }
            }
        }
        // 포장·BOM·도막
        SpecMatch.Override packOv = spec.overrides().get("PACK_CD");
        if (packOv != null) {
            pack = packOv.value() + " : 품질사양 지정";
            packKind = "spec";
        } else {
            pack = o.export() ? "ARSE00 : 수출Coil+방청+목재+없음+없음" : "ARSX00 : 내수Coil+일반+철판+없음+없음";
            packKind = "constant";
        }
        SpecMatch.Override bomOv = spec.overrides().get("CCL_BOM");
        bom = bomOv != null ? bomOv.value() : o.get("CCL_BOM_NO", color ? ("3".equals(prd) ? "L2000E" : "L4000C") : "");
        SpecMatch.Override topOv = spec.overrides().get("TOP_THK");
        topThk = topOv != null ? topOv.value() : "25";

        if (!has) return;

        // 압연 SET
        rollHit = s.judge(RULE_ROLLING_SET, map("PRD_NM_CD", prd, "SPEC_ORG_CD", org, "SPC_AVR", spc, "ORD_USG_CD", o.get("ORD_USG_CD"),
                "CUS_CD", cus, "ORD_THK_TP", thkTp, "ORD_THK_MNG_CD", o.get("ORD_THK_MNG_CD"), "GW_ASG_CD", gw, "THK", t, "WID", w));
        if (rollHit.matched()) {
            BigDecimal c = PipelineText.num(rollHit.result("THK_ADJ"));
            adj = c == null ? BigDecimal.ZERO : c;
            corUnit = rollHit.result("THK_COR_UNT") == null ? "CRN" : rollHit.result("THK_COR_UNT");
        } else {
            fallbacks.add("압연 보정치(" + RULE_ROLLING_SET + (rollHit.missing() ? " 기준 없음" : " 미적중 KK82") + " → 0)");
        }
        BigDecimal g = BigDecimal.valueOf(coat[3]).movePointLeft(3);
        boolean tct = "2".equals(thkTp);
        String base = tct ? "주문두께 " + PipelineText.fixed(t, 3) + " − 도금 " + PipelineText.fixed(g, 3) : "주문두께 " + PipelineText.fixed(t, 3);
        switch (corUnit) {
            case "PCN" -> {
                rollTarget = (tct ? t.subtract(g) : t).add(t.multiply(adj).divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
                rollFormula = base + " + 주문두께 × " + PipelineText.plain(adj) + "%";
            }
            case "TRK" -> {
                rollTarget = tct ? adj.subtract(g) : adj;
                rollFormula = "확정값 " + PipelineText.plain(adj) + (tct ? " − 도금 " + PipelineText.fixed(g, 3) : "");
            }
            default -> {
                rollTarget = (tct ? t.subtract(g) : t).add(adj);
                if (tct) rollTarget = rollTarget.setScale(4, RoundingMode.HALF_UP);
                rollFormula = base + (adj.signum() < 0 ? " − " : " + ") + PipelineText.plain(adj.abs()) + " (CRN)";
            }
        }
        outThk = PipelineText.trunc3(rollTarget);
        setThk = PipelineText.snapSet(outThk);
        rollFormula = rollFormula + " = " + PipelineText.plain(rollTarget) + " → SP 0% → 절삭 " + outThk.toPlainString() + " → 0.005 눈금 " + setThk.toPlainString();

        // 통과공정
        routeHit = s.judge(RULE_ROUTING, map("PRD_NM_CD", prd, "MAT_CD", mat, "EMBS_CD", o.get("EMBS_CD"), "ORD_SPNL_TP", o.get("ORD_SPNL_TP"),
                "GW_ASG_CD", gw, "ORD_SUR_HND_CD", o.get("ORD_SUR_HND_CD"), "THK", t, "WID", w));
        SpecMatch.Override procOv = spec.overrides().get("PROC_CD");
        if (procOv != null) {
            routeCd = procOv.value();
            routeKind = "spec";
        } else if (routeHit.matched() && routeHit.result("ROUTE_CD") != null) {
            routeCd = routeHit.result("ROUTE_CD");
            routeKind = "rule";
        } else {
            routeCd = color ? "1P-85-A5" : "G".equals(prd) ? "1P-31" : "1P-87";
            routeKind = routeHit.missing() ? "missing" : "formula";
            fallbacks.add("통과공정(품명 " + prd + " 표준 " + routeCd + ")");
        }
        for (String code : routeCd.split("-")) {
            if (code.isBlank()) continue;
            String line = lineName(code);
            routeSteps.add(new String[] {code.trim(), line});
            if (mainLine == null && isCgl(line)) {
                mainLine = line;
                cglCode = code.trim();
            }
            if (isCcl(line)) hasCcl = true;
        }
        if (color) hasCcl = true;

        // 폭 — 제품폭에서 거꾸로
        String edge = o.get("ORD_EDG_ASG_TP");
        jzMarginHit = s.judge(RULE_MARGIN_JZ, map("ORD_EDG_ASG_TP", edge, "PRD_NM_CD", prd, "PRD_SHP", o.get("PRD_SHP", "C"),
                "COAT_WAY_CD", o.get("COAT_WAY_CD"), "RESIN_TP", o.get("RESIN_TP"), "THK", setThk, "CCL_BOM_NO", bom, "ORD_SPNL_TP", o.get("ORD_SPNL_TP")));
        mJz = qty(jzMarginHit, "WID_MARGIN_QTY", "정전 폭마진량");
        jzShrinkHit = s.judge(RULE_SHRINK_JZ, map("PRD_NM_CD", prd, "MAT_CD", mat, "THK", setThk, "WID", w));
        sJz = qty(jzShrinkHit, "WID_SHRINK_QTY", "정전 폭감소량");
        jzIn = w.add(mJz).add(sJz);
        if (hasCcl) {
            cclShrinkHit = s.judge(RULE_SHRINK_CCL, map("PRD_NM_CD", prd, "MAT_CD", mat, "THK", setThk, "WID", w));
            sCcl = qty(cclShrinkHit, "WID_SHRINK_QTY", "CCL 폭감소량");
        }
        cclIn = jzIn.add(sCcl);
        cglShrinkHit = s.judge(RULE_SHRINK_CGL, map("PROC_CD", cglCode, "PRD_NM_CD", prd, "MAT_CD", mat, "RAW_MAT_CD", rawCode, "THK", setThk, "WID", cclIn));
        sCgl = qty(cglShrinkHit, "WID_SHRINK_QTY", "CGL 폭감소량");
        pltcmOut = cclIn.add(sCgl);
        rawThk = t.multiply(BigDecimal.valueOf(4)).setScale(1, RoundingMode.HALF_UP);
        pMarginHit = s.judge(RULE_MARGIN_PLTCM, map("RAW_MAT_CD", rawCode, "RAW_THK", rawThk, "WID", pltcmOut, "CUS_CD", cus));
        mP = qty(pMarginHit, "WID_MARGIN_QTY", "PLTCM 폭마진량");
        trimSet = pltcmOut.add(mP);
        pShrinkHit = s.judge(RULE_SHRINK_PLTCM, map("RAW_MAT_CD", rawCode, "THK", outThk, "WID", trimSet));
        sP = qty(pShrinkHit, "WID_SHRINK_QTY", "PLTCM 폭수축량");
        rawWid = trimSet.add(sP).setScale(0, RoundingMode.CEILING);
    }

    private BigDecimal qty(RuleHit hit, String var, String label) {
        if (hit.matched()) {
            BigDecimal v = PipelineText.num(hit.result(var));
            return v == null ? BigDecimal.ZERO : v;
        }
        fallbacks.add(label + "(" + hit.ruleId() + (hit.missing() ? " 기준 없음" : " 미적중") + " → 0)");
        return BigDecimal.ZERO;
    }

    static Map<String, Object> map(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    // ── 근거 ─────────────────────────────────────────────────

    /** 값 하나의 근거를 기록하고 화면 형상용 evidence 를 돌려준다. */
    Map<String, Object> trace(String path, String label, Object value, String unit, String kind, String formula, String note, RuleHit hit) {
        String k = kind;
        String n = note;
        if (hit != null && !"spec".equals(kind)) {
            if (hit.missing()) {
                k = "missing";
                n = join(n, "기준 없음 — " + hit.ruleId());
            } else if (!hit.matched()) {
                k = "formula";
                n = join(n, hit.ruleId() + " 미적중 — 표준값");
            } else {
                k = "rule";
            }
        }
        Map<String, Object> ev = new LinkedHashMap<>();
        ev.put("kind", k);
        ev.put("ruleId", hit == null ? null : hit.ruleId());
        ev.put("ver", hit == null ? null : hit.ver());
        ev.put("ruleKey", hit == null ? null : hit.ruleKey());
        ev.put("seq", hit == null ? null : hit.seq());
        ev.put("screen", hit == null ? null : screenOf(hit.ruleId()));
        ev.put("note", n);
        if (path != null) {
            Map<String, Object> tr = new LinkedHashMap<>();
            tr.put("path", path);
            tr.put("label", label);
            tr.put("value", value == null ? null : PipelineText.plain(value));
            tr.put("unit", unit);
            tr.put("kind", k);
            tr.put("formula", formula);
            tr.put("note", n);
            tr.put("ruleId", ev.get("ruleId"));
            tr.put("ver", ev.get("ver"));
            tr.put("ruleKey", ev.get("ruleKey"));
            tr.put("seq", ev.get("seq"));
            tr.put("screen", ev.get("screen"));
            SpecMatch.Override ov = "spec".equals(kind) ? specOverrideFor(path) : null;
            tr.put("base", ov == null ? null : ov.base());
            tr.put("specs", ov == null ? List.of() : ov.specs());
            if (ov != null) tr.put("screen", "qualitySpec");
            trace.put(path, tr);
        }
        return ev;
    }

    private SpecMatch.Override specOverrideFor(String path) {
        for (Map.Entry<String, String> e : SpecMatch.SPEC_TO_DESIGN.entrySet()) {
            if (e.getValue().equals(path)) return spec.overrides().get(e.getKey());
        }
        if ("common.포장방법".equals(path)) return spec.overrides().get("PACK_CD");
        return null;
    }

    static String join(String a, String b) {
        if (a == null || a.isBlank()) return b;
        if (b == null || b.isBlank()) return a;
        return a + " · " + b;
    }

    /** 이번 계산에서 부른 값 룰(근거 목록용). */
    List<RuleHit> hits() {
        List<RuleHit> out = new ArrayList<>();
        for (RuleHit h : new RuleHit[] {thkStdHit, baseGradeHit, rawHit, rollHit, routeHit, jzMarginHit, jzShrinkHit, cclShrinkHit, cglShrinkHit, pMarginHit, pShrinkHit}) {
            if (h != null) out.add(h);
        }
        return out;
    }
}
