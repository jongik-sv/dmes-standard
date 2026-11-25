package com.dongkuk.dmes.mqc.qcd.order.pipeline;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 파이프라인이 부르는 Maru 룰 ID·제목·소유 화면과 시연 표준값(프로토타입 quality-design.html 의 상수).
 * 룰 ID 는 scripts/mqc-demo/mdm/bundles 의 등록 묶음과 m-mqc src/common/catalog.ts 가 정본이다.
 * 표준값은 아직 Maru 기준이 없는 값(도금 부착량, 재질 밴드 등)이며 근거 종류 constant 로 표시한다.
 */
public final class DesignCatalog {

    private DesignCatalog() {
    }

    // ── 룰 ID ─────────────────────────────────────────────────
    public static final String RULE_ROLLING_SET = "C10B2060";
    public static final String RULE_SHRINK_PLTCM = "C10B1074";
    public static final String RULE_SHRINK_CGL = "C10B1075";
    public static final String RULE_SHRINK_EGL = "C10B1076";
    public static final String RULE_SHRINK_JZ = "C10B1077";
    public static final String RULE_SHRINK_CCL = "C10B1078";
    public static final String RULE_MARGIN_PLTCM = "C10B1073";
    public static final String RULE_MARGIN_JZ = "C10B1079";
    public static final String RULE_RAW_GRADE = "QD_RAW_MATERIAL_GRADE";
    public static final String RULE_SPEC_THK_STD = "QD_SPEC_THK_STD";
    public static final String RULE_SPEC_BASE_GRADE = "QD_SPEC_BASE_GRADE";
    public static final String RULE_ROUTING = "QD_PROCESS_ROUTING";
    public static final String RULE_WEIGHT = "QD_ORDER_WEIGHT_ERROR";
    public static final String RULE_CONSISTENCY = "QD_ORDER_CHECK";

    /** 생산범위 시트 키(코드 QC_FEAS_SHEET) → 룰 ID. */
    public static final Map<String, String> FEAS_RULES = ordered(
            "2CGL-GI", "QD_FEAS_2CGL_GI",
            "2CGL-GL", "QD_FEAS_2CGL_GL",
            "3CGL", "QD_FEAS_3CGL",
            "4CGL", "QD_FEAS_4CGL",
            "5CGL", "QD_FEAS_5CGL");
    public static final String CODE_FEAS_GROUP = "QC_FEAS_MATL_GRP";
    public static final String CODE_FEAS_SHEET = "QC_FEAS_SHEET";
    public static final String CODE_WEIGHT_LIMIT = "QC_ORD_WGT_LIMIT";

    private static final Map<String, String[]> RULE_META = new LinkedHashMap<>();

    static {
        meta(RULE_ROLLING_SET, "압연두께Set치보정기준", "rollingThicknessSet");
        meta(RULE_SHRINK_PLTCM, "PLTCM 폭수축량", "lineWidthShrinkage");
        meta(RULE_SHRINK_CGL, "CGL 폭감소량", "lineWidthShrinkage");
        meta(RULE_SHRINK_EGL, "EGL 폭감소량", "lineWidthShrinkage");
        meta(RULE_SHRINK_JZ, "정전 폭감소량", "lineWidthShrinkage");
        meta(RULE_SHRINK_CCL, "CCL 폭감소량", "lineWidthShrinkage");
        meta(RULE_MARGIN_PLTCM, "PLTCM 폭마진량", "lineWidthMargin");
        meta(RULE_MARGIN_JZ, "정전 폭마진량", "lineWidthMargin");
        meta(RULE_RAW_GRADE, "원자재강종", "rawMaterialGrade");
        meta(RULE_SPEC_THK_STD, "규격약호 두께관리기준", "specCode");
        meta(RULE_SPEC_BASE_GRADE, "규격약호 원판강종 매핑", "specCode");
        meta(RULE_ROUTING, "공정라우팅", "processRouting");
        meta(RULE_WEIGHT, "주문단중에러 기준", "orderWeightError");
        meta(RULE_CONSISTENCY, "주문정합성체크(통합)", "orderConsistency");
        meta("QD_FEAS_2CGL_GI", "B.D 생산범위(2CGL GI)", "productionFeasibility");
        meta("QD_FEAS_2CGL_GL", "B.D 생산범위(2CGL GL)", "productionFeasibility");
        meta("QD_FEAS_3CGL", "B.D 생산범위(3CGL GI.GIX)", "productionFeasibility");
        meta("QD_FEAS_4CGL", "B.D 생산범위(4CGL GL.GLX)", "productionFeasibility");
        meta("QD_FEAS_5CGL", "B.D 생산범위(5CGL GI.GL)", "productionFeasibility");
    }

    private static void meta(String id, String title, String screen) {
        RULE_META.put(id, new String[] {title, screen});
    }

    public static String ruleTitle(String ruleId) {
        String[] m = RULE_META.get(ruleId);
        return m == null ? ruleId : m[0];
    }

    /** 룰을 관리하는 mqc 화면 objectId. 모르면 null. */
    public static String screenOf(String ruleId) {
        String[] m = RULE_META.get(ruleId);
        return m == null ? null : m[1];
    }

    // ── 코드 표시 ────────────────────────────────────────────
    public static final Map<String, String> PRD_NM = ordered("3", "CCGI", "4", "CCLI", "G", "GI", "L", "G/L", "W", "GLX");
    public static final Map<String, String> MAT_NM = ordered("1A", "SAE1008", "BA", "SAE1006", "EA", "SAE1015", "CB", "SGC570급");
    /** 재질 → 원자재(핫코일) 표준값. 원자재강종 룰이 맞지 않을 때만 쓴다. */
    public static final Map<String, String> MAT_HR = ordered("1A", "H32", "BA", "H34", "EA", "H36", "CB", "H38");
    public static final Map<String, String> RAW_NM = ordered("H32", "1 종 : SAE 1008", "H34", "2 종 : SAE 1006", "H36", "3 종 : SAE 1015",
            "H38", "고강도 : SGC570급", "H2J", "DDQ", "H7J", "IF Steel", "H8C", "HS IF-Steel");
    public static final Map<String, String> GW_CD = ordered("3", "E", "4", "A10", "G", "Z12", "L", "A15", "W", "M12");
    public static final Map<String, String> GW_NM = ordered("E", "80 g/㎡", "A10", "AZ100", "Z12", "120 g/㎡", "A15", "AZ150", "M12", "AM120");
    /** 품명 → 도금 부착량 [하한, 상한, 목표 g/㎡, 도금 두께 µm(면당)]. */
    public static final Map<String, int[]> COAT_RANGE = Map.of(
            "3", new int[] {80, 120, 84, 12}, "4", new int[] {100, 150, 104, 12}, "G", new int[] {120, 180, 124, 17},
            "L", new int[] {150, 200, 153, 12}, "W", new int[] {120, 170, 125, 12});
    public static final Map<String, String> THK_MNG_NM = ordered("1", "규격일반:(+/-)TOL", "2", "규격일반:(+/-)HALF TOL", "3", "규격일반:(+)ONLY",
            "4", "규격일반:(-)ONLY", "5", "특별관리(TCT → BMT관리)", "6", "특별관리(BMT → TCT관리)", "A", "규격일반:(+)보정10", "D", "규격일반:(-)보정20");
    public static final Map<String, String> DSN_STAT_NM = ordered("WAIT", "미설계", "ING", "설계중", "CONF", "확정", "HOLD", "보류");
    public static final Map<String, String> FEAS_STATE_NM = ordered("P", "생산가능", "C", "조건부 생산", "-", "생산불가", "X", "생산불가(검증 완료)");

    /** 공정 코드 → 라인 이름(통과공정 표시). 1P PLTCM, 8n nCGL, 31 2CGL(프로토타입 표기), An nCCL, AX CCL, 9n EGL. */
    public static String lineName(String code) {
        if (code == null || code.isBlank()) return "";
        String c = code.trim().toUpperCase();
        if (c.equals("1P")) return "PLTCM";
        if (c.equals("31")) return "2CGL";
        if (c.equals("AX")) return "CCL";
        if (c.equals("8O")) return "CGL(8O)";
        if (c.length() == 2 && c.charAt(0) == '8' && Character.isDigit(c.charAt(1))) return c.charAt(1) + "CGL";
        if (c.length() == 2 && c.charAt(0) == 'A' && Character.isDigit(c.charAt(1))) return c.charAt(1) + "CCL";
        if (c.length() == 2 && c.charAt(0) == '9' && Character.isDigit(c.charAt(1))) return "EGL" + c.charAt(1);
        if (c.length() == 2 && c.charAt(0) == '3' && Character.isDigit(c.charAt(1))) return (c.charAt(1) - '0' + 1) + "CGL";
        return c;
    }

    public static boolean isCgl(String lineName) {
        return lineName != null && lineName.contains("CGL");
    }

    public static boolean isCcl(String lineName) {
        return lineName != null && lineName.contains("CCL");
    }

    /** 품명이 칼라(도장)인가. */
    public static boolean isColor(String prd) {
        return "3".equals(prd) || "4".equals(prd);
    }

    /** 규격약호 → 규격기관(QD_SPEC_THK_STD·C10B2060 조건). */
    public static String specOrg(String spc) {
        if (spc == null) return null;
        String s = spc.trim().toUpperCase();
        if (s.startsWith("KS")) return "KS";
        if (s.startsWith("JS") || s.startsWith("JIS")) return "JIS";
        if (s.startsWith("AM")) return "ASTM";
        if (s.startsWith("AS")) return "AS";
        if (s.startsWith("EN")) return "EN";
        return null;
    }

    /** 규격약호 → 강종 코드(첫 '-' 뒤). KS3-CGCC → CGCC. */
    public static String steelGrade(String spc) {
        if (spc == null) return null;
        int i = spc.indexOf('-');
        return i < 0 ? null : spc.substring(i + 1).trim();
    }

    public static String specName(String s) {
        if (s == null) return "";
        if (s.startsWith("KS3")) return "도장 용융 아연 도금 강판 및 강대";
        if (s.startsWith("KS4")) return "도장 용융 알루미늄 아연 합금 도금 강판";
        if (s.startsWith("KSG") || s.startsWith("AMG")) return "용융 아연 도금 강판 및 강대";
        if (s.startsWith("KSL") || s.startsWith("AML")) return "용융 55% 알루미늄 아연 합금 도금 강판";
        return "용융 알루미늄 아연 마그네슘 합금 도금 강판";
    }

    /** 규격약호별 기계적 성질 밴드(프로토타입 matBands) — {YP하,YP상,TS하,TS상,EL하,굴곡}. */
    public static String[] matBands(String spec) {
        String s = spec == null ? "" : spec;
        if (s.contains("SGC340")) return new String[] {"245", "", "340", "510", "20", "1T"};
        if (s.contains("570") || s.contains("G300")) return new String[] {"560", "", "570", "", "", "3T"};
        return new String[] {"205", "380", "270", "500", "22", "1T"};
    }

    public static boolean highStrength(String spec) {
        String s = spec == null ? "" : spec;
        return s.contains("570") || s.contains("G300");
    }

    static Map<String, String> ordered(String... kv) {
        Map<String, String> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return java.util.Collections.unmodifiableMap(m);
    }

    /** 품질설계 정본 주문 항목(시뮬레이션 orderFromSeed 순서). */
    public static final List<String> ORDER_FIELDS = List.of(
            "ORD_REQ_NO", "ORD_REQ_LN", "PRD_NM_CD", "PRD_SHP", "SPC_AVR", "MAT_CD", "ORD_EXC_THK", "ORD_EXC_WTH",
            "FNL_CUS_CD", "ORD_USG_CD", "ORD_EDG_ASG_TP", "ORD_LN_WGT", "ORD_SLIT_GRP_CNT", "ORD_PAK_UNT_WGT_ULV",
            "ORD_PAK_UNT_WGT_LLV", "ORD_PTT_FLM_CD", "ORD_SLV_KND_TP", "FLOW_CHL", "NAT_CD", "ORD_KND", "CUS_CD",
            "ACT_CUS_CD", "SPC_YR", "ORD_SZ", "ORD_THK_TP", "WGT_DCS_MTH_TP", "ORD_WGT_UNT", "ORD_PAK_MTH",
            "ORD_THK_MNG_CD", "ORD_WTH_MNG_CD", "ORD_RGS_PRS_ID", "ORD_TEM_CD", "ORD_COIL_IDIA", "ORD_COILG_MTH",
            "GW_ASG_CD", "CCL_BOM_NO", "ORD_SPNL_TP");
    /** 화면 핵심 입력 칸(시뮬레이션 CORE_FIELDS). */
    public static final List<String> CORE_FIELDS = List.of(
            "PRD_NM_CD", "PRD_SHP", "SPC_AVR", "MAT_CD", "ORD_EXC_THK", "ORD_EXC_WTH", "FNL_CUS_CD", "ORD_USG_CD",
            "ORD_EDG_ASG_TP", "ORD_LN_WGT", "ORD_SLIT_GRP_CNT", "ORD_PAK_UNT_WGT_ULV", "ORD_PAK_UNT_WGT_LLV",
            "ORD_PTT_FLM_CD", "ORD_SLV_KND_TP");
    /** ① 입력 검증 필수 항목. */
    public static final List<String> REQUIRED_FIELDS = List.of("PRD_NM_CD", "SPC_AVR", "MAT_CD", "ORD_EXC_THK", "ORD_EXC_WTH", "FNL_CUS_CD");

    public static final Map<String, String> FIELD_LABELS = ordered(
            "ORD_REQ_NO", "주문요청번호", "ORD_REQ_LN", "주문요청행번", "PRD_NM_CD", "품명코드", "PRD_SHP", "제품형태",
            "SPC_AVR", "규격약호", "MAT_CD", "재질코드", "ORD_EXC_THK", "주문환산두께", "ORD_EXC_WTH", "주문환산폭",
            "FNL_CUS_CD", "최종수요가코드", "ORD_USG_CD", "주문용도코드", "ORD_EDG_ASG_TP", "주문Edge지정구분",
            "ORD_LN_WGT", "주문행번중량", "ORD_SLIT_GRP_CNT", "주문Slit조수", "ORD_PAK_UNT_WGT_ULV", "주문포장단중상한값",
            "ORD_PAK_UNT_WGT_LLV", "주문포장단중하한값", "ORD_PTT_FLM_CD", "주문보호필름상세코드", "ORD_SLV_KND_TP", "주문내경링종류구분",
            "FLOW_CHL", "유통경로", "NAT_CD", "국가코드", "ORD_KND", "주문종류", "CUS_CD", "고객사코드", "ACT_CUS_CD", "수요가코드",
            "SPC_YR", "규격년도", "ORD_SZ", "주문생칫수", "ORD_THK_TP", "주문두께구분", "WGT_DCS_MTH_TP", "중량결정법구분",
            "ORD_WGT_UNT", "주문중량단위", "ORD_PAK_MTH", "주문포장방법", "ORD_THK_MNG_CD", "주문두께관리코드",
            "ORD_WTH_MNG_CD", "주문폭관리코드", "ORD_RGS_PRS_ID", "주문등록자", "ORD_TEM_CD", "영업팀코드",
            "ORD_COIL_IDIA", "주문코일내경", "ORD_COILG_MTH", "주문권취방법", "GW_ASG_CD", "도금량지정코드",
            "CCL_BOM_NO", "CCL_BOM번호", "ORD_SPNL_TP", "주문Spangle구분", "USAGE_CD", "용도(사양 조건)",
            "COLOR_CD", "색상코드", "COAT_WAY_CD", "코팅방식", "RESIN_TP", "수지타입", "EMBS_CD", "EMBOSS무늬",
            "ORD_SUR_HND_CD", "주문표면처리코드", "ORD_EXC_LTH", "주문환산길이", "ORD_COIL_ODIA", "주문코일외경",
            "ORD_ORG_PLT_SPC_AVR", "원판규격약호");

    public static String fieldLabel(String f) {
        return FIELD_LABELS.getOrDefault(f, f);
    }
}
