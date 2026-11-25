package com.dongkuk.dmes.mqc.qcd.order.pipeline;

import static com.dongkuk.dmes.mqc.qcd.order.pipeline.DesignCatalog.*;
import static com.dongkuk.dmes.mqc.qcd.order.pipeline.PipelineText.fixed;
import static com.dongkuk.dmes.mqc.qcd.order.pipeline.PipelineText.plain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 계산 결과 → 설계결과 문서(quality-design.html genDetail 모양) + 설계 형상 모델(assets/shape ShapeModel).
 * 룰로 정한 값은 근거(trace)를 달고, 아직 기준이 없는 값은 프로토타입 표준값(constant)·산식(formula)으로 둔다.
 */
final class DesignDocs {

    private DesignDocs() {
    }

    static Map<String, Object> design(DesignCalc c, String statusLabel) {
        OrderInput o = c.o;
        String prdLabel = c.prd + " : " + PRD_NM.getOrDefault(c.prd, c.prd);
        String cusNm = o.get("FNL_CUS_NM");
        String buyer = c.cus + (cusNm == null ? "" : " : " + cusNm);
        String gwLabel = c.gw + (GW_NM.containsKey(c.gw) ? " : " + GW_NM.get(c.gw) : "");
        String rawLabel = c.rawCode + (RAW_NM.containsKey(c.rawCode) ? " - " + RAW_NM.get(c.rawCode) : "");
        boolean exp = o.export();
        Map<String, Object> d = new LinkedHashMap<>();

        Map<String, Object> head = new LinkedHashMap<>();
        head.put("buyer", buyer);
        head.put("spec", c.spc);
        head.put("size", c.has ? fixed(c.t, 3) + "  x  " + PipelineText.width1(c.w) + "  x  0.0" : "");
        head.put("prd", prdLabel);
        head.put("use", o.get("ORD_USG_DTL") == null ? o.get("ORD_USG_CD", "") : o.get("ORD_USG_CD", "") + " : " + o.get("ORD_USG_DTL"));
        head.put("mat", c.mat + (MAT_NM.containsKey(c.mat) ? " : " + MAT_NM.get(c.mat) : ""));
        head.put("mat2", rawLabel);
        head.put("bom", c.color ? c.bom : "");
        d.put("head", head);
        if (c.color) c.trace("head.bom", "BOM", c.bom, null, c.spec.overrides().containsKey("CCL_BOM") ? "spec" : "constant",
                null, c.spec.overrides().containsKey("CCL_BOM") ? null : "주문 CCL_BOM_NO", null);

        // 공통
        List<List<String>> common = new ArrayList<>();
        common.add(row("품질설계상태", statusLabel, "b"));
        common.add(row("주문유형", exp ? "Z03 : 수출 일반" : "Z01 : 내수 일반"));
        common.add(row("유통경로 / 국가코드", exp ? "12 : 수출 · " + o.get("NAT_CD", "US") : "11 : 민수 · KR : 한국"));
        String edge = o.get("ORD_EDG_ASG_TP", "");
        common.add(row("제품형태 / EDGE", o.get("PRD_SHP", "C") + " : Coil · " + edge + ("N".equals(edge) ? " : ZERO-SPANGLE" : "")));
        common.add(row("규격명", specName(c.spc)));
        common.add(row("인수도규격 / 규격년도", c.spc.startsWith("A") ? "ASTM A755M · " + o.get("SPC_YR", "2020") : "KSD3520A · " + o.get("SPC_YR", "2008")));
        common.add(row("고객사", buyer));
        common.add(row("주문 Actual Size", c.has ? fixed(c.t, 2) + " X " + c.w.setScale(0, RoundingMode.HALF_UP) + " X COIL" : ""));
        common.add(row("수요가", buyer));
        common.add(row("주문량 / 단위중량", o.get("ORD_LN_WGT", "") + " " + o.get("ORD_WGT_UNT", "MT") + " · 분할 " + o.get("ORD_SLIT_GRP_CNT", "-")));
        common.add(row("중량결정", o.get("WGT_DCS_MTH_TP", "NA") + " : 계근중량"));
        common.add(row("도금량코드", gwLabel));
        c.trace("common.도금량코드", "도금량코드", gwLabel, null, "constant", null, "주문 도금량지정코드(품명 표준)", null);
        common.add(row("조질도", "4 : EXTR"));
        c.trace("common.조질도", "조질도", "4 : EXTR", null, "constant", null, "표준값 — 기준 미등록", null);
        String tp = c.thkTp + " : " + ("2".equals(c.thkTp) ? "TCT" : "3".equals(c.thkTp) ? "칼라 TCT" : "BMT");
        common.add(row("주문두께구분", tp));
        c.trace("common.주문두께구분", "주문두께구분", tp, null, "constant", null, "주문 값", null);
        common.add(row("두께관리기준", c.thkStd));
        c.trace("common.두께관리기준", "두께관리기준", c.thkStd, null, "rule", "규격기관 " + specOrg(c.spc) + " → 두께관리기준", null, c.thkStdHit);
        String mng = o.get("ORD_THK_MNG_CD", "");
        String mngLabel = mng.isEmpty() ? "" : mng + " : " + THK_MNG_NM.getOrDefault(mng, "");
        common.add(row("두께관리코드", mngLabel));
        c.trace("common.두께관리코드", "두께관리코드", mngLabel, null, "constant", null, "주문 값", null);
        String wmng = o.get("ORD_WTH_MNG_CD", "A");
        common.add(row("폭관리코드", wmng + " : No S/T: 0~미보증"));
        c.trace("common.폭관리코드", "폭관리코드", wmng, null, "constant", null, "주문 값", null);
        String rollLabel = c.setThk == null ? "" : c.setThk.toPlainString() + " · " + c.corUnit + " " + plain(c.adj);
        common.add(row("압연목표두께/단위", rollLabel));
        if (c.rollHit != null) c.trace("common.압연목표두께/단위", "압연목표두께/단위", rollLabel, "mm", "rule", c.rollFormula, null, c.rollHit);
        common.add(row("원판강종", c.baseGrade == null ? "" : c.baseGrade));
        c.trace("common.원판강종", "원판강종", c.baseGrade, null, "rule", "규격기관 + 강종 " + steelGrade(c.spc), null, c.baseGradeHit);
        common.add(row("주문내경/종류", o.get("ORD_COIL_IDIA", "508") + " · " + o.get("ORD_SLV_KND_TP", "P") + " : PAPER"));
        String pakL = o.get("ORD_PAK_UNT_WGT_LLV", ""), pakU = o.get("ORD_PAK_UNT_WGT_ULV", "");
        common.add(row("포장단중(하/상)", pakL + " · " + pakU));
        common.add(row("정포장중량(하/상)", pakL + " · " + pakU));
        common.add(row("포장방법", c.pack));
        c.trace("common.포장방법", "포장방법", c.pack, null, c.packKind, null, "spec".equals(c.packKind) ? null : "수출·내수 표준 포장", null);
        common.add(row("권취방법", o.get("ORD_COILG_MTH", "S") + " : Stagger"));
        c.trace("common.권취방법", "권취방법", o.get("ORD_COILG_MTH", "S"), null, "constant", null, "주문 값", null);
        String[] top = c.color ? ("3".equals(c.prd) ? new String[] {"L2001", "W0034", "C9015"} : new String[] {"L2003", "W0034", "C9012"}) : null;
        if (c.color) {
            common.add(row("색상코드(T/B)", top[0] + " · " + top[2]));
            common.add(row("수지구분(T/B)", "H2 : HPP(SEL · B1 : EPOXY"));
            common.add(row("도막두께(T/B)", c.topThk + " · 5"));
            common.add(row("Material Code", "F381A4E-4ZH22A0006"));
        }
        d.put("common", common);

        // 재질
        String[] mb = matBands(c.spc);
        Map<String, Object> mat = new LinkedHashMap<>();
        mat.put("bands", List.of(
                row("고객사양", "", "", "", "", "", "", "", "", "", "", ""),
                row("규격사양", "", "", mb[0], "", mb[2], "", "", "", "", "", ""),
                row("사내사양", "", "", mb[0], mb[1], mb[2], mb[3], mb[4], "", "", "", mb[5]),
                row("보증사양", "", "", mb[0], mb[1], mb[2], mb[3], mb[4], "", "", "", mb[5] + " - 간격 1.0t")));
        String cmin = String.valueOf(c.coat[0]), cmax = String.valueOf(c.coat[1]);
        mat.put("spc", List.of(
                row("고객사양", "", "", "", "", "", "", "", "", ""),
                row("규격사양", "", "", "", "", "", "", "", cmin, ""),
                row("사내사양", "W/S 1/4", "300", "A", "", "", "", "", cmin, cmax),
                row("보증사양", "W/S 1/4", "300", "A", "", "", "", "", cmin, cmax)));
        d.put("mat", mat);

        // 인수도
        Map<String, Object> tol = new LinkedHashMap<>();
        tol.put("tols", List.of(row("고객사양", "-0.05", "0.1", "0", "30", "0", "0"), row("규격사양", "-0.05", "0.1", "0", "", "", ""),
                row("보증사양", "-0.05", "0.1", "0", "30", "0", "0")));
        String w0 = c.has ? c.w.setScale(0, RoundingMode.HALF_UP).toPlainString() : "";
        String w30 = c.has ? c.w.add(BigDecimal.valueOf(30)).setScale(0, RoundingMode.HALF_UP).toPlainString() : "";
        tol.put("base", List.of(
                row("설계기준", c.thkStd, c.has ? fixed(c.t.subtract(new BigDecimal("0.008")), 3) : "", c.has ? fixed(c.t.add(new BigDecimal("0.142")), 3) : "", w0, w30, "0", "0"),
                row("규격기준", c.thkStd, c.has ? fixed(c.t.subtract(new BigDecimal("0.003")), 3) : "", c.has ? fixed(c.t.add(new BigDecimal("0.147")), 3) : "", "외관검사기준", "32", "", "")));
        tol.put("shape", List.of(row("고객사양", "", "", "", "", "", "", "", ""), row("규격사양", "6", "", "", "1.0", "", "", "", ""),
                row("보증사양", "6", "3", "6", "1.0", "1.0", "", "8", "")));
        d.put("tol", tol);

        // 용융도금
        Map<String, Object> cgl = new LinkedHashMap<>();
        String rawThk = c.rawThk == null ? "" : c.rawThk.toPlainString();
        String rawThkU = c.rawThk == null ? "" : c.rawThk.add(new BigDecimal("0.2")).toPlainString();
        String rawWid = c.rawWid == null ? "" : c.rawWid.toPlainString();
        cgl.put("lines", List.of(
                row("적정", rawLabel, "L - 일반(중)", rawThk, rawThk, rawThkU, rawWid),
                row("차선1", c.rawAlt + " - 구매GR", "L - 일반(중)", c.has ? fixed(c.t.subtract(new BigDecimal("0.008")), 3) : "",
                        c.has ? fixed(c.t.subtract(new BigDecimal("0.03")), 2) : "", c.has ? fixed(c.t.add(new BigDecimal("0.01")), 2) : "",
                        c.has ? c.w.subtract(BigDecimal.ONE).setScale(0, RoundingMode.HALF_UP).toPlainString() : ""),
                row("차선2", "", "", "", "", "", "")));
        c.trace("cgl.lines.적정.1", "원자재 코드", rawLabel, null, c.rawKind, null,
                "spec".equals(c.rawKind) ? null : c.rawMatCd == null ? null : "원자재강종 재질 " + c.rawMatCd, "spec".equals(c.rawKind) ? null : c.rawHit);
        c.trace("cgl.lines.적정.3", "원자재 두께", rawThk, "mm", "formula", "주문두께 × 4, 0.1 mm 반올림", "원자재두께 기준(C10B1071) 미등록 — 프로토타입 산식", null);
        c.trace("cgl.lines.적정.6", "원자재 폭", rawWid, "mm", "rule", "Side Trimming Set " + plain(c.trimSet) + " + PLTCM 폭수축 " + plain(c.sP) + " (올림)", null, c.pShrinkHit);

        List<List<String>> pltcm = new ArrayList<>();
        String set = c.setThk == null ? "" : c.setThk.toPlainString();
        pltcm.add(row("5Stand WRType", "B"));
        pltcm.add(row("내경링 사용여부", "Y - 사용"));
        pltcm.add(row("S/T유무", "N - 무"));
        pltcm.add(row("X-Ray Set두께값", set));
        pltcm.add(row("PLTCM 출측두께", c.outThk == null ? "" : c.outThk.toPlainString()));
        pltcm.add(row("Side Trimming Set값(주공정)", plain(c.trimSet) == null ? "" : plain(c.trimSet)));
        pltcm.add(row("PLTCM 폭마진량", plain(c.mP)));
        pltcm.add(row("폭수축값", plain(c.sP)));
        pltcm.add(row("BigData 분석값", "4"));
        pltcm.add(row("두께목표값", c.setThk == null ? "" : set + " (" + c.setThk.subtract(DesignCalc.TOL).toPlainString() + " ~ " + c.setThk.add(DesignCalc.TOL).toPlainString() + ")"));
        pltcm.add(row("폭목표값(주공정)", c.pltcmOut == null ? "" : plain(c.pltcmOut)));
        cgl.put("pltcm", pltcm);
        if (c.rollHit != null) {
            c.trace("cgl.pltcm.X-Ray Set두께값", "X-Ray Set 두께", set, "mm", "rule", c.rollFormula, null, c.rollHit);
            c.trace("cgl.pltcm.PLTCM 출측두께", "PLTCM 출측두께", c.outThk, "mm", "rule", "압연목표 " + plain(c.rollTarget) + " × (1 + SP 0%) → 소수 3자리 절삭", "SP 보정률 기준(C10B2070) 미등록 — 0%", c.rollHit);
            c.trace("cgl.pltcm.Side Trimming Set값(주공정)", "Side Trimming Set", c.trimSet, "mm", "rule", "폭목표 " + plain(c.pltcmOut) + " + PLTCM 마진 " + plain(c.mP), null, c.pMarginHit);
            c.trace("cgl.pltcm.PLTCM 폭마진량", "PLTCM 폭마진량", c.mP, "mm", "rule", null, null, c.pMarginHit);
            c.trace("cgl.pltcm.폭수축값", "PLTCM 폭수축값", c.sP, "mm", "rule", "원자재 " + c.rawCode + " · 출측두께 " + c.outThk + " · 폭 " + plain(c.trimSet), null, c.pShrinkHit);
            c.trace("cgl.pltcm.폭목표값(주공정)", "폭목표값(PLTCM 출측폭)", c.pltcmOut, "mm", "rule", widthFormula(c), null, c.cglShrinkHit);
            c.trace("cgl.pltcm.두께목표값", "두께목표값", set, "mm", "constant", "SET ± 0.015", "허용폭 표준값", null);
        }
        List<List<String>> ops = new ArrayList<>();
        for (String[] st : c.routeSteps) {
            if (!isCgl(st[1])) continue;
            boolean hot = st[1].startsWith("5") || st[1].startsWith("7");
            ops.add(row(st[1], "1 - CQ", hot ? "730" : "680", "", "", hot ? "150" : "180"));
        }
        cgl.put("ops", ops);
        Map<String, Object> coat = new LinkedHashMap<>();
        coat.put("min", c.coat[0]);
        coat.put("max", c.coat[1]);
        coat.put("target", c.coat[2]);
        coat.put("thk", c.coat[3]);
        coat.put("spangle", "G".equals(c.prd) ? "0 : MINI" : "4 : EXTRA SMOOTH");
        coat.put("lv", "Y - Leveling");
        coat.put("skin", "Y");
        coat.put("sizeT", c.has ? fixed(c.t.subtract(new BigDecimal("0.008")), 3) : "");
        coat.put("sizeW", c.has ? c.w.setScale(0, RoundingMode.HALF_UP).intValue() : null);
        cgl.put("coat", coat);
        c.trace("cgl.coat.min", "도금 부착량 하한", c.coat[0], "g/㎡", "constant", null, "품명별 표준 부착량 — 기준 미등록", null);
        c.trace("cgl.coat.max", "도금 부착량 상한", c.coat[1], "g/㎡", "constant", null, "품명별 표준 부착량 — 기준 미등록", null);
        d.put("cgl", cgl);
        d.put("egl", null);

        // 후공정
        Map<String, Object> post = new LinkedHashMap<>();
        post.put("t2c", "N - 무");
        post.put("st", "N - 무");
        post.put("wMin", c.has ? c.w.setScale(0, RoundingMode.HALF_UP).intValue() : null);
        post.put("wMax", c.has ? c.w.add(BigDecimal.valueOf(30)).setScale(0, RoundingMode.HALF_UP).intValue() : null);
        post.put("pack", c.pack);
        post.put("packMsg", "");
        post.put("qMsg", "");
        List<String> widSet = new ArrayList<>(Arrays.asList("", "", "", "", "", "", "", "", "", ""));
        if (c.jzIn != null) widSet.set(0, plain(c.jzIn));
        post.put("widSet", widSet);
        post.put("emboss", "");
        post.put("sheetLoad", "");
        post.put("oil", "N");
        post.put("shlSize", "");
        post.put("film", List.of(row("", "", "", "", "", "", "")));
        d.put("post", post);
        c.trace("post.pack", "포장방법", c.pack, null, c.packKind, null, "spec".equals(c.packKind) ? null : "수출·내수 표준 포장", null);
        if (c.jzIn != null) c.trace("post.widSet.0", "정전 폭 Set", c.jzIn, "mm", "rule", "제품폭 " + plain(c.w) + " + 정전 마진 " + plain(c.mJz) + " + 정전 수축 " + plain(c.sJz), null, c.jzMarginHit);

        // 칼라
        if (c.color) {
            Map<String, Object> color = new LinkedHashMap<>();
            color.put("matrix", List.of(
                    row("품질수지", "", "", "H2 : HI-POLYMER", "PC : Primer", "B1 : EPOXY", "", "", ""),
                    row("색상코드", "", "", top[0], top[1], top[2], "", "", ""),
                    row("광택코드", "", "", "2 : 무광(30%↓)", "4 : 반광(40~60)", "2 : 무광(30%↓)", "", "", ""),
                    row("광택도", "", "", "25", "", "", "", "", ""),
                    row("도막두께", "", "", "20", "5", "5", "", "", ""),
                    row("PMT", "", "", "232", "216", "224", "", "", ""),
                    row("시너", "", "", "THN04", "THN04", "THN02", "", "", ""),
                    row("구매수지", "", "", "", "", "", "", "", "")));
            Map<String, Object> sum = new LinkedHashMap<>();
            sum.put("way", "4 : TOP = 2 COAT / BACK = 1 COAT");
            sum.put("cT", top[0]);
            sum.put("cB", top[2]);
            sum.put("thkT", c.topThk);
            sum.put("thkB", "5");
            sum.put("glossT", "2");
            sum.put("glossB", "2");
            sum.put("resinT", "H2");
            sum.put("resinB", "B1");
            sum.put("szT", c.has ? fixed(c.t.add(new BigDecimal("0.022")), 3) : "");
            sum.put("szW", c.has ? c.w.setScale(0, RoundingMode.HALF_UP).intValue() : null);
            sum.put("chem", "CHNCR");
            sum.put("name", "3".equals(c.prd) ? "딤그레이 b상향(5CCL)" : "화이트 g상향(5CCL)");
            color.put("sum", sum);
            color.put("test", List.of(row("Bending", "2T"), row("시험평점", "-"), row("M.E.K", "250"), row("연필경도", "1H"), row("색차", "0.3")));
            d.put("color", color);
            boolean topSpec = c.spec.overrides().containsKey("TOP_THK");
            c.trace("color.sum.thkT", "Top 도막두께", c.topThk, "µm", topSpec ? "spec" : "constant", null, topSpec ? null : "칼라BOM 표준값(칼라BOM관리 준비 중)", null);
        } else {
            d.put("color", null);
        }

        // 통과공정
        Map<String, Object> route = new LinkedHashMap<>();
        route.put("no", c.routeCd == null ? "" : c.routeCd);
        List<List<String>> rrows = new ArrayList<>();
        String tail = o.get("ORD_REQ_NO", "00000");
        tail = tail.length() > 5 ? tail.substring(tail.length() - 5) : tail;
        int i = 1;
        for (String[] st : c.routeSteps) {
            String mc = "1P".equals(st[0]) ? "HD81AND-AR03724" : isCgl(st[1]) ? "HG81A4E-GX" + tail : isCcl(st[1]) ? "H381A4E-4ZH22A0006" : "H" + st[0] + "-" + tail;
            rrows.add(row(String.valueOf(i++), st[0] + " - " + st[1], mc));
        }
        route.put("rows", rrows);
        d.put("route", route);
        if (c.routeCd != null) c.trace("route.no", "통과공정", c.routeCd, null, c.routeKind, null, null, "spec".equals(c.routeKind) ? null : c.routeHit);

        // 성분
        boolean hi = highStrength(c.spc);
        List<String> inh = hi ? List.of("사내사양", "", "0.2500", "", "", "", "1.7000", "", "0.0300", "", "0.0350", "", "", "", "")
                : List.of("사내사양", "0.0200", "0.0800", "", "", "", "0.5000", "", "0.0300", "", "0.0350", "", "", "", "");
        List<String> guar = new ArrayList<>(inh);
        guar.set(0, "보증사양");
        Map<String, Object> comp = new LinkedHashMap<>();
        comp.put("g1", List.of(blankRow("고객사양", 14), blankRow("규격사양", 14), inh, guar));
        comp.put("g2", List.of(blankRow("고객사양", 12), blankRow("규격사양", 12), blankRow("사내사양", 12), blankRow("보증사양", 12)));
        d.put("comp", comp);
        d.put("trace", c.trace);
        return d;
    }

    static String widthFormula(DesignCalc c) {
        StringBuilder sb = new StringBuilder("제품폭 ").append(plain(c.w)).append(" + 정전 마진 ").append(plain(c.mJz)).append(" + 정전 수축 ").append(plain(c.sJz));
        if (c.hasCcl) sb.append(" + CCL 수축 ").append(plain(c.sCcl));
        sb.append(" + CGL 수축 ").append(plain(c.sCgl));
        return sb.toString();
    }

    // ── 설계 형상 ─────────────────────────────────────────────

    private static final Map<String, String[]> STACKS = Map.of(
            "G", new String[] {"GI", "zinc", "0"}, "L", new String[] {"GL", "az", "0"}, "W", new String[] {"GLX", "am", "0"},
            "3", new String[] {"CCGI", "zinc", "1"}, "4", new String[] {"CCLI", "az", "1"});
    private static final Map<String, String> COATING_LABEL = Map.of("zinc", "아연 도금(Zn)", "az", "알루미늄·아연 도금(AZ)", "am", "아연·알루미늄·마그네슘 도금(AM)");

    static Map<String, Object> shape(DesignCalc c, Map<String, Object> design) {
        List<String> warnings = new ArrayList<>();
        String[] stack = STACKS.get(c.prd);
        if (stack == null) warnings.add("층 정의 없음 · 품명 " + (c.prd.isEmpty() ? "?" : c.prd));
        if (!c.has) warnings.add("주문 두께·폭이 없어 형상을 그리지 못했습니다");
        String productType = stack == null ? "unknown" : stack[0];
        List<Map<String, Object>> scenes = new ArrayList<>();
        Map<String, Object> d = design;
        @SuppressWarnings("unchecked") Map<String, Object> coat = (Map<String, Object>) ((Map<String, Object>) d.get("cgl")).get("coat");
        String gwLabel = (String) PinPaths.resolve(d, "common.도금량코드");

        // ① 원자재
        List<Map<String, Object>> rawVals = new ArrayList<>();
        rawVals.add(val("rmtl_cd", "원자재 코드", c.rawCode, null, null, c.trace(null, null, null, null, c.rawKind, null,
                c.rawMatCd == null ? null : "재질 " + c.rawMatCd, "spec".equals(c.rawKind) ? null : c.rawHit)));
        rawVals.add(val("rmtl_thk", "원자재 두께", num(c.rawThk), "mm", "주문두께 × 4, 0.1 mm 반올림", ev("formula", null, "원자재두께 기준(C10B1071) 미등록 — 프로토타입 산식")));
        rawVals.add(val("rmtl_wid", "원자재 폭", num(c.rawWid), "mm", "Side Trimming Set + PLTCM 폭수축량 " + plain(c.sP) + " (올림)",
                c.trace(null, null, null, null, "rule", null, null, c.pShrinkHit)));
        rawVals.add(val("rmtl_pref", "원자재 선호도", "L - 일반(중)", null, null, ev("constant", null, "표준값")));
        scenes.add(scene("raw", "원자재", null, num(c.rawThk), num(c.rawWid), null, null,
                List.of(layer("substrate", "substrate", "core", um(c.rawThk), "핫코일 " + c.rawCode)), rawVals));

        // ② 압연
        String[] p0 = c.routeSteps.isEmpty() ? new String[] {"1P", "PLTCM"} : c.routeSteps.get(0);
        List<Map<String, Object>> rollVals = new ArrayList<>();
        rollVals.add(val("set_thk", "X-Ray Set 두께", num(c.setThk), "mm", c.rollFormula, c.trace(null, null, null, null, "rule", null, null, c.rollHit)));
        rollVals.add(val("out_thk", "PLTCM 출측두께", num(c.outThk), "mm", "압연목표 × (1 + SP 0%) → 소수 3자리 절삭", ev("formula", null, "SP 보정률 기준(C10B2070) 미등록 — 0%")));
        rollVals.add(val("thk_target", "두께목표 (허용범위)", PinPaths.resolve(d, "cgl.pltcm.두께목표값"), null, "SET ± 0.015", ev("constant", null, "허용폭 표준값")));
        rollVals.add(val("trim_wid", "Side Trimming Set", num(c.trimSet), "mm", "폭목표 + PLTCM 마진 " + plain(c.mP), c.trace(null, null, null, null, "rule", null, null, c.pMarginHit)));
        rollVals.add(val("wid_shrink", "PLTCM 폭수축값", num(c.sP), "mm", "원자재·출측두께·Side Trimming 폭으로 조회", c.trace(null, null, null, null, "rule", null, null, c.pShrinkHit)));
        rollVals.add(val("wid_target", "폭목표값(주공정)", num(c.pltcmOut), "mm", widthFormula(c), c.trace(null, null, null, null, "rule", null, null, c.cglShrinkHit)));
        rollVals.add(val("wr_type", "5Stand WR Type", "B", null, null, ev("constant", null, "표준값")));
        rollVals.add(val("id_ring", "내경링 사용여부", "Y - 사용", null, null, ev("constant", null, "표준값")));
        scenes.add(scene("rolled", "압연", proc(p0), num(c.setThk), num(c.trimSet), null, null,
                List.of(layer("substrate", "substrate", "core", um(c.setThk), "냉연 소지")), rollVals));

        // ③ 도금
        String[] cglStep = c.routeSteps.stream().filter(s -> isCgl(s[1])).findFirst().orElse(null);
        List<Map<String, Object>> coatedLayers = new ArrayList<>();
        Integer coatUm = c.coat[3] == 0 ? null : c.coat[3];
        if (stack != null) coatedLayers.add(layer("coating-top", stack[1], "top", coatUm, COATING_LABEL.get(stack[1])));
        coatedLayers.add(layer("substrate", "substrate", "core", um(c.setThk), "냉연 소지"));
        if (stack != null) coatedLayers.add(layer("coating-bottom", stack[1], "bottom", coatUm, COATING_LABEL.get(stack[1])));
        boolean bmt = !"2".equals(c.thkTp);
        List<Map<String, Object>> coatVals = new ArrayList<>();
        coatVals.add(val("coated_thk", "도금 후 두께", num(c.t), "mm", bmt ? "주문두께 (BMT 주문 · 도금두께 별도)" : "주문두께 (TCT · 도금 포함)", ev("formula", null, null)));
        coatVals.add(val("coat_cd", "도금량코드", gwLabel, null, null, ev("constant", null, "주문 도금량지정코드")));
        coatVals.add(val("coat_range", "도금 부착량 (하한 ~ 상한)", c.coat[0] + " ~ " + c.coat[1], "g/㎡", null, ev("constant", null, "품명별 표준 — 기준 미등록")));
        coatVals.add(val("coat_target", "도금목표 부착량", coat.get("target"), "g/㎡", null, ev("constant", null, null)));
        coatVals.add(val("coat_thk", "도금 두께", coatUm, "µm", null, ev("constant", null, "면당")));
        coatVals.add(val("spangle", "Spangle", coat.get("spangle"), null, null, ev("constant", null, null)));
        coatVals.add(val("lv", "L/V", coat.get("lv"), null, null, ev("constant", null, null)));
        coatVals.add(val("cgl_shrink", "CGL 폭감소량", num(c.sCgl), "mm", "공정 " + c.cglCode + " · SET " + plain(c.setThk) + " · 폭 " + plain(c.cclIn),
                c.trace(null, null, null, null, "rule", null, null, c.cglShrinkHit)));
        coatVals.add(val("line", "도금 라인", cglStep == null ? null : cglStep[0] + " - " + cglStep[1], null, "통과공정 " + c.routeCd,
                c.trace(null, null, null, null, c.routeKind, null, null, "spec".equals(c.routeKind) ? null : c.routeHit)));
        scenes.add(scene("coated", "도금", cglStep == null ? null : proc(cglStep), num(c.t), num(c.cclIn), null, null, coatedLayers, coatVals));

        // ④ 칼라
        @SuppressWarnings("unchecked") Map<String, Object> color = (Map<String, Object>) d.get("color");
        boolean painted = stack != null && "1".equals(stack[2]) && color != null;
        if (stack != null && "1".equals(stack[2]) && color == null) warnings.add("칼라 품명이지만 칼라제조사양이 없어 칼라 장면을 생략");
        if (painted) {
            @SuppressWarnings("unchecked") Map<String, Object> sum = (Map<String, Object>) color.get("sum");
            String[] cclStep = c.routeSteps.stream().filter(s -> isCcl(s[1])).findFirst().orElse(new String[] {"A5", "5CCL"});
            List<Map<String, Object>> ls = new ArrayList<>();
            ls.add(layer("topcoat-2", "topcoat", "top", 20, "Top 2코트 " + PinPaths.resolve(d, "color.matrix.색상코드.3")));
            ls.add(layer("primer", "primer", "top", 5, "프라이머 " + PinPaths.resolve(d, "color.matrix.색상코드.4")));
            coatedLayers.forEach(l -> ls.add(new LinkedHashMap<>(l)));
            ls.add(layer("backcoat", "backcoat", "bottom", 5, "Back 코트 " + PinPaths.resolve(d, "color.matrix.색상코드.5")));
            boolean topSpec = c.spec.overrides().containsKey("TOP_THK");
            List<Map<String, Object>> pv = new ArrayList<>();
            pv.add(val("paint_way", "도장방식", sum.get("way"), null, null, ev("constant", null, "칼라BOM 표준값")));
            pv.add(val("paint_top", "Top 도막두께 합계", sum.get("thkT"), "µm", null, topSpec ? ev("spec", null, "품질사양 " + String.join(", ", c.spec.overrides().get("TOP_THK").specs())) : ev("constant", null, "칼라BOM 표준값")));
            pv.add(val("paint_back", "Back 도막두께", sum.get("thkB"), "µm", null, ev("constant", null, null)));
            pv.add(val("color_top", "색상코드 Top", sum.get("cT"), null, null, ev("constant", null, null)));
            pv.add(val("color_back", "색상코드 Back", sum.get("cB"), null, null, ev("constant", null, null)));
            pv.add(val("bom", "CCL BOM", c.bom, null, null, c.spec.overrides().containsKey("CCL_BOM") ? ev("spec", null, "품질사양") : ev("constant", null, "주문 CCL_BOM_NO")));
            pv.add(val("ccl_shrink", "CCL 폭감소량", num(c.sCcl), "mm", null, c.trace(null, null, null, null, "rule", null, null, c.cclShrinkHit)));
            pv.add(val("painted_size", "목표 Size (두께 × 폭)", sum.get("szT") + " × " + sum.get("szW"), "mm", "주문두께 + 0.022", ev("formula", null, null)));
            scenes.add(scene("painted", "칼라", proc(cclStep), num(PipelineText.num(sum.get("szT"))), num(c.jzIn), null, null, ls, pv));
        }

        // ⑤ 제품
        Map<String, Object> prev = scenes.get(scenes.size() - 1);
        @SuppressWarnings("unchecked") List<Map<String, Object>> prevLayers = (List<Map<String, Object>>) prev.get("layers");
        @SuppressWarnings("unchecked") Map<String, Object> prevGeo = (Map<String, Object>) prev.get("geometry");
        BigDecimal ll = c.o.num("ORD_PAK_UNT_WGT_LLV");
        List<Map<String, Object>> prodVals = new ArrayList<>();
        prodVals.add(val("size", "주문 Actual Size", PinPaths.resolve(d, "common.주문 Actual Size"), null, null, ev("constant", null, "주문 값")));
        prodVals.add(val("thk_range", "제품 두께 범위 (설계기준)", PinPaths.resolve(d, "tol.base.설계기준.2") + " ~ " + PinPaths.resolve(d, "tol.base.설계기준.3"), "mm", "주문두께 −0.008 ~ +0.142", ev("formula", null, "인수도 기준 미등록")));
        prodVals.add(val("wid_range", "제품 폭 범위", PinPaths.resolve(d, "post.wMin") + " ~ " + PinPaths.resolve(d, "post.wMax"), "mm", "주문폭 ~ +30", ev("formula", null, null)));
        prodVals.add(val("jz_margin", "정전 폭마진량", num(c.mJz), "mm", null, c.trace(null, null, null, null, "rule", null, null, c.jzMarginHit)));
        prodVals.add(val("jz_shrink", "정전 폭감소량", num(c.sJz), "mm", null, c.trace(null, null, null, null, "rule", null, null, c.jzShrinkHit)));
        prodVals.add(val("coil_id", "주문내경", c.o.num("ORD_COIL_IDIA") == null ? null : c.o.num("ORD_COIL_IDIA").intValue(), "mm", null, ev("constant", null, "주문 값")));
        prodVals.add(val("winding", "권취방법", PinPaths.resolve(d, "common.권취방법"), null, null, ev("constant", null, "주문 값")));
        prodVals.add(val("pack", "포장방법", c.pack, null, null, "spec".equals(c.packKind) ? ev("spec", null, "품질사양 " + String.join(", ", c.spec.overrides().get("PACK_CD").specs())) : ev("constant", null, "수출·내수 표준")));
        List<Map<String, Object>> prodLayers = new ArrayList<>();
        prevLayers.forEach(l -> prodLayers.add(new LinkedHashMap<>(l)));
        scenes.add(scene("product", "제품", Map.of("code", "—", "name", "정전·포장"), painted ? (Double) prevGeo.get("thkMm") : num(c.t), num(c.w),
                c.o.num("ORD_COIL_IDIA") == null ? null : c.o.num("ORD_COIL_IDIA").doubleValue(), ll == null ? null : ll.doubleValue() / 1000.0, prodLayers, prodVals));

        // 번호·변화
        for (int i = 0; i < scenes.size(); i++) {
            Map<String, Object> s = scenes.get(i);
            s.put("no", i + 1);
            if (i == 0) continue;
            Map<String, Object> p = scenes.get(i - 1);
            @SuppressWarnings("unchecked") List<Map<String, Object>> changes = (List<Map<String, Object>>) s.get("changes");
            change(changes, "thk_mm", geo(p, "thkMm"), geo(s, "thkMm"), "mm");
            change(changes, "wid_mm", geo(p, "widMm"), geo(s, "widMm"), "mm");
            int pl = ((List<?>) p.get("layers")).size(), sl = ((List<?>) s.get("layers")).size();
            if (pl != sl) {
                Map<String, Object> ch = new LinkedHashMap<>();
                ch.put("key", "layers"); ch.put("from", pl); ch.put("to", sl); ch.put("delta", sl - pl); ch.put("unit", null);
                changes.add(ch);
            }
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("productType", productType);
        m.put("summary", summary(productType, scenes, gwLabel, painted ? (String) PinPaths.resolve(d, "color.sum.way") : null));
        m.put("warnings", warnings);
        m.put("scenes", scenes);
        return m;
    }

    static String summary(String type, List<Map<String, Object>> scenes, String gwLabel, String way) {
        List<String> parts = new ArrayList<>();
        for (Map<String, Object> s : scenes) {
            String id = (String) s.get("id");
            String g = fmtMm(geo(s, "thkMm")) + "×" + fmtMm(geo(s, "widMm"));
            switch (id) {
                case "raw" -> parts.add("원자재 " + g);
                case "rolled" -> parts.add("Set " + g);
                case "coated" -> { if (gwLabel != null && !gwLabel.isBlank()) parts.add(gwLabel.split(" : ")[0]); }
                case "painted" -> { if (way != null) { String[] w = way.split(" : "); parts.add(w[w.length - 1]); } }
                case "product" -> parts.add("제품 " + g);
                default -> { }
            }
        }
        return type + " · " + String.join(" → ", parts);
    }

    static String fmtMm(Double n) {
        if (n == null) return "—";
        if (Math.abs(n) >= 100) return String.format(java.util.Locale.KOREA, "%,d", Math.round(n));
        return BigDecimal.valueOf(n).setScale(3, RoundingMode.HALF_UP).toPlainString();
    }

    private static void change(List<Map<String, Object>> out, String key, Double from, Double to, String unit) {
        if (from == null || to == null || from.equals(to)) return;
        Map<String, Object> ch = new LinkedHashMap<>();
        ch.put("key", key);
        ch.put("from", from);
        ch.put("to", to);
        ch.put("delta", BigDecimal.valueOf(to).subtract(BigDecimal.valueOf(from)).setScale(3, RoundingMode.HALF_UP).stripTrailingZeros().doubleValue());
        ch.put("unit", unit);
        out.add(ch);
    }

    private static Double geo(Map<String, Object> s, String k) {
        @SuppressWarnings("unchecked") Map<String, Object> g = (Map<String, Object>) s.get("geometry");
        Object v = g.get(k);
        return v == null ? null : ((Number) v).doubleValue();
    }

    private static Map<String, Object> scene(String id, String title, Map<String, String> process, Double thk, Double wid, Double idMm, Double weightT,
                                             List<Map<String, Object>> layers, List<Map<String, Object>> values) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("id", id);
        s.put("no", 0);
        s.put("title", title);
        s.put("process", process);
        Map<String, Object> g = new LinkedHashMap<>();
        g.put("thkMm", thk);
        g.put("widMm", wid);
        g.put("idMm", idMm);
        g.put("weightT", weightT);
        s.put("geometry", g);
        s.put("layers", layers);
        s.put("values", values);
        s.put("changes", new ArrayList<>());
        return s;
    }

    private static Map<String, String> proc(String[] step) {
        return Map.of("code", step[0], "name", step[1]);
    }

    private static Map<String, Object> layer(String id, String kind, String side, Integer thkUm, String label) {
        Map<String, Object> l = new LinkedHashMap<>();
        l.put("id", id);
        l.put("kind", kind);
        l.put("side", side);
        l.put("thkUm", thkUm);
        l.put("label", label);
        return l;
    }

    private static Map<String, Object> val(String key, String label, Object value, String unit, String formula, Map<String, Object> evidence) {
        boolean missing = value == null || "".equals(value);
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("key", key);
        v.put("label", label);
        v.put("value", missing ? null : value);
        v.put("unit", unit);
        v.put("formula", missing ? null : formula);
        Map<String, Object> e = evidence;
        if (missing && e.get("ruleId") == null) e = ev("missing", null, "설계값 없음");
        v.put("evidence", e);
        return v;
    }

    private static Map<String, Object> ev(String kind, String ruleId, String note) {
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("kind", kind);
        e.put("ruleId", ruleId);
        e.put("ver", null);
        e.put("ruleKey", null);
        e.put("seq", null);
        e.put("screen", null);
        e.put("note", note);
        return e;
    }

    private static Double num(BigDecimal v) {
        return v == null ? null : v.doubleValue();
    }

    private static Double num(Object v) {
        BigDecimal b = PipelineText.num(v);
        return b == null ? null : b.doubleValue();
    }

    private static Integer um(BigDecimal mm) {
        return mm == null ? null : mm.movePointRight(3).setScale(0, RoundingMode.HALF_UP).intValue();
    }

    static List<String> row(String... cells) {
        List<String> r = new ArrayList<>();
        for (String s : cells) r.add(s == null ? "" : s);
        return r;
    }

    private static List<String> blankRow(String head, int n) {
        List<String> r = new ArrayList<>();
        r.add(head);
        for (int i = 0; i < n; i++) r.add("");
        return r;
    }
}
