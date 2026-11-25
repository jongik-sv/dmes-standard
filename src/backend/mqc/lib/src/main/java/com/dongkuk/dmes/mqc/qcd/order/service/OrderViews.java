package com.dongkuk.dmes.mqc.qcd.order.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mqc.qcd.order.pipeline.DesignCatalog;
import com.dongkuk.dmes.mqc.qcd.order.pipeline.PipelineText;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/** 주문 화면 모양(OrderRow)·정본 주문 항목 맵. 품질설계결과·시뮬레이션이 함께 쓴다. */
public final class OrderViews {

    private OrderViews() {
    }

    /** "D260831014-010" → {no, ln}. 마지막 '-' 로 나눈다. */
    public static String[] splitKey(String orderKey) {
        if (orderKey == null || orderKey.isBlank()) throw new BusinessException(ErrorCode.REQUIRED_VALUE, "주문 키를 입력하세요.");
        String k = orderKey.trim();
        int i = k.lastIndexOf('-');
        if (i <= 0 || i == k.length() - 1) throw new BusinessException(ErrorCode.INVALID_VALUE, "주문 키 형식은 주문번호-행번입니다: " + k);
        return new String[] {k.substring(0, i), k.substring(i + 1)};
    }

    public static String key(Map<String, String> o) {
        return o.get("ORD_REQ_NO") + "-" + o.get("ORD_REQ_LN");
    }

    /** 화면 목록 행(OrderRow). */
    public static Map<String, Object> row(Map<String, String> o) {
        Map<String, Object> m = new LinkedHashMap<>();
        String prd = nz(o.get("PRD_NM_CD"));
        String mat = nz(o.get("MAT_CD"));
        String usgCd = nz(o.get("ORD_USG_CD"));
        String usgNm = nz(o.get("ORD_USG_NM"));
        m.put("orderKey", key(o));
        m.put("ordReqNo", o.get("ORD_REQ_NO"));
        m.put("ordReqLn", o.get("ORD_REQ_LN"));
        m.put("prdNmCd", prd);
        m.put("prdLabel", prd + " : " + DesignCatalog.PRD_NM.getOrDefault(prd, prd));
        m.put("prdShp", nz(o.get("PRD_SHP")));
        m.put("edge", nz(o.get("ORD_EDG_ASG_TP")));
        m.put("spcAvr", nz(o.get("SPC_AVR")));
        m.put("usgCd", usgCd);
        m.put("usgNm", usgNm);
        m.put("usgFull", usgCd + (o.get("ORD_USG_DTL") == null ? "" : " : " + o.get("ORD_USG_DTL")));
        m.put("cusCd", nz(o.get("FNL_CUS_CD")));
        m.put("cusNm", nz(o.get("FNL_CUS_NM")));
        m.put("thk", PipelineText.dbl(o.get("ORD_EXC_THK")));
        m.put("wid", PipelineText.dbl(o.get("ORD_EXC_WTH")));
        m.put("matCd", mat);
        m.put("matLabel", mat + (DesignCatalog.MAT_NM.containsKey(mat) ? " : " + DesignCatalog.MAT_NM.get(mat) : ""));
        m.put("urgent", "Y".equals(o.get("URGENT_YN")));
        m.put("export", nz(o.get("ORD_REQ_NO")).startsWith("E"));
        String d = nz(o.get("REQ_DT"));
        m.put("reqDt", d.length() == 8 ? d.substring(0, 4) + "-" + d.substring(4, 6) + "-" + d.substring(6) : d);
        return m;
    }

    /** 정본 주문 항목만(+ 추가 항목). 화면 입력·파이프라인 입력. */
    public static Map<String, String> fields(Map<String, String> o) {
        Map<String, String> m = new LinkedHashMap<>();
        for (String f : DesignCatalog.ORDER_FIELDS) m.put(f, o.get(f));
        o.forEach((k, v) -> {
            if (!m.containsKey(k) && !k.equals("URGENT_YN") && !k.equals("REQ_DT") && !k.equals("SRC_TP")) m.put(k, v);
        });
        return m;
    }

    /** 키워드가 주문 키·규격약호·수요가·용도에 들어 있으면 참. */
    public static boolean matches(Map<String, String> o, String keyword) {
        if (keyword == null || keyword.isBlank()) return true;
        String k = keyword.trim().toLowerCase(Locale.ROOT);
        for (String v : new String[] {key(o), o.get("SPC_AVR"), o.get("FNL_CUS_CD"), o.get("FNL_CUS_NM"), o.get("ORD_USG_NM")}) {
            if (v != null && v.toLowerCase(Locale.ROOT).contains(k)) return true;
        }
        return false;
    }

    public static Map<String, Object> labels() {
        return new LinkedHashMap<>(DesignCatalog.FIELD_LABELS);
    }

    private static String nz(String v) {
        return v == null ? "" : v;
    }
}
