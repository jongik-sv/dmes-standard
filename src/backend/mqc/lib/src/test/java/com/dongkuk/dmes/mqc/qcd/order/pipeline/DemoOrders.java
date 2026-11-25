package com.dongkuk.dmes.mqc.qcd.order.pipeline;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 시험 주문 — V4 시드(orderFromSeed 기본값)와 같은 값. */
final class DemoOrders {

    private DemoOrders() {
    }

    static Map<String, String> order(String no, String ln, String prd, String edge, String spec, String usg, String cus, String thk, String wid, String mat) {
        boolean exp = no.startsWith("E");
        Map<String, String> m = new LinkedHashMap<>();
        m.put("ORD_REQ_NO", no); m.put("ORD_REQ_LN", ln); m.put("PRD_NM_CD", prd); m.put("PRD_SHP", "C"); m.put("SPC_AVR", spec);
        m.put("MAT_CD", mat); m.put("ORD_EXC_THK", thk); m.put("ORD_EXC_WTH", wid); m.put("FNL_CUS_CD", cus); m.put("FNL_CUS_NM", "수요가 A");
        m.put("ORD_USG_CD", usg); m.put("ORD_EDG_ASG_TP", edge); m.put("ORD_LN_WGT", "24.0"); m.put("ORD_SLIT_GRP_CNT", "6");
        m.put("ORD_PAK_UNT_WGT_ULV", "8000"); m.put("ORD_PAK_UNT_WGT_LLV", "5000"); m.put("ORD_PTT_FLM_CD", null); m.put("ORD_SLV_KND_TP", "P");
        m.put("FLOW_CHL", "11"); m.put("NAT_CD", exp ? "US" : "KR"); m.put("ORD_KND", exp ? "Z03" : "Z01"); m.put("CUS_CD", cus); m.put("ACT_CUS_CD", cus);
        m.put("SPC_YR", spec.startsWith("A") ? "2020" : "2008"); m.put("ORD_SZ", thk + "X" + wid + "XCOIL"); m.put("ORD_THK_TP", "1");
        m.put("WGT_DCS_MTH_TP", "NA"); m.put("ORD_WGT_UNT", "MT"); m.put("ORD_PAK_MTH", exp ? "ARSE00" : "ARSX00"); m.put("ORD_THK_MNG_CD", "D");
        m.put("ORD_WTH_MNG_CD", "A"); m.put("ORD_RGS_PRS_ID", "sales01"); m.put("ORD_TEM_CD", "T01"); m.put("ORD_COIL_IDIA", "508");
        m.put("ORD_COILG_MTH", "S"); m.put("GW_ASG_CD", DesignCatalog.GW_CD.get(prd));
        m.put("CCL_BOM_NO", "3".equals(prd) ? "L2000E" : "4".equals(prd) ? "L4000C" : null); m.put("ORD_SPNL_TP", "4");
        if (DesignCatalog.isColor(prd)) { m.put("COLOR_CD", "L2001"); m.put("COAT_WAY_CD", "X"); m.put("RESIN_TP", "CC"); }
        return m;
    }

    /** D260831014-010 CCGI 0.45 × 1490 (AS-IS 기준 주문). */
    static Map<String, String> ccgi() {
        return order("D260831014", "010", "3", "N", "KS3-CGCC", "G0493P", "110197", "0.450", "1490.0", "1A");
    }

    /** D260831021-010 GI 0.44 × 1225. */
    static Map<String, String> gi() {
        return order("D260831021", "010", "G", "M", "KSG-SGC340", "B01000", "320104", "0.440", "1225.0", "BA");
    }

    /** D260831020-010 G/L 0.40 × 915 — 공정라우팅 미적중 → 7CGL 표준 경로. */
    static Map<String, String> gl() {
        return order("D260831020", "010", "L", "M", "KSL-SGLCC", "B01000", "320104", "0.400", "915.0", "1A");
    }

    /** 품질사양 표본: 320104-L02(확정, 두께 0.5~0.8 → H32·1P-31-81-A1), 320104-L01(전송완료, 두께 1.2), 320104-L09(작성중). */
    static SpecSource specs() {
        return (cus, prd) -> {
            if (!"320104".equals(cus) || !"L".equals(prd)) {
                return new SpecSource.SpecData(true, null, List.of(), base(), Map.of());
            }
            return new SpecSource.SpecData(true, null, List.of(
                    new SpecSource.Spec("320104-L01", "SENT", List.of(
                            new SpecSource.Term("IF", 1, "CUS_CD", "고객사", "=", "320104", null),
                            new SpecSource.Term("IF", 2, "PRD_NM_CD", "품명", "=", "L", null),
                            new SpecSource.Term("IF", 3, "RAW_THK", "원재료 두께", "=", "1.2", "mm"),
                            new SpecSource.Term("THEN", 1, "RAW_MTRL", "원재료 재질", "=", "H36", null))),
                    new SpecSource.Spec("320104-L02", "CONF", List.of(
                            new SpecSource.Term("IF", 3, "RAW_THK", "원재료 두께", "~", "0.3~0.8", "mm"),
                            new SpecSource.Term("THEN", 1, "RAW_MTRL", "원재료 재질", "=", "H32", null),
                            new SpecSource.Term("THEN", 2, "PROC_CD", "통과공정", "=", "1P-31-81-A1", null),
                            new SpecSource.Term("THEN", 3, "GLOSS", "광택", "=", "30", "GU"))),
                    new SpecSource.Spec("320104-L09", "DRAFT", List.of(
                            new SpecSource.Term("THEN", 1, "PACK_CD", "포장방법", "=", "P03", null)))),
                    base(), Map.of("RAW_MTRL", "원재료 재질", "PROC_CD", "통과공정", "GLOSS", "광택", "PACK_CD", "포장방법"));
        };
    }

    static Map<String, String> base() {
        Map<String, String> b = new LinkedHashMap<>();
        b.put("RAW_MTRL", "CQ"); b.put("PROC_CD", "1P-31-81-A1"); b.put("PACK_CD", "P01"); b.put("GLOSS", "40");
        return b;
    }
}
