package com.dongkuk.dmes.mqc.qjd.qualityJudgment.service;

import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.Coil;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.CoilJudgment;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.InspectionEvaluator;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.InspectionItem;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.ItemResult;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.JudgmentStatus;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.support.DemoSupport;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 코일 한 개와 그 판정·검사 항목. 판정 화면과 출력물 화면이 같은 모양으로 코일을 보이게 한다.
 * judgment 가 없으면 판정대기로 본다.
 */
public record CoilSnapshot(Coil coil, CoilJudgment judgment, List<InspectionItem> items) {

    /** 목록 배지 묶음(순서 = 화면 순서): 코드, 짧은 글자, 이름. */
    static final String[][] GROUPS = {
        {"COAT", "도", "도금량"},
        {"SURF", "표", "표면"},
        {"MECH", "기", "기계적성질"},
        {"DIM", "치", "치수"},
    };

    public String coilNo() {
        return coil.getCoilNo();
    }

    public JudgmentStatus status() {
        return judgment == null ? JudgmentStatus.WAIT : judgment.getJdgStat();
    }

    public JudgmentStatus suggestion() {
        return judgment == null ? null : judgment.getSuggStat();
    }

    public boolean passed() {
        return status() == JudgmentStatus.PASS;
    }

    public InspectionItem item(String itemCd) {
        for (InspectionItem i : items) {
            if (i.getItemCd().equals(itemCd)) return i;
        }
        return null;
    }

    /** 숫자 검사값(YP·TS·EL·COAT 등). 없거나 숫자가 아니면 null. */
    public BigDecimal value(String itemCd) {
        InspectionItem i = item(itemCd);
        return i == null ? null : i.numericValue();
    }

    /** 코일 공통 칸(목록·상세 공용). */
    public Map<String, Object> coilView() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("coilNo", coil.getCoilNo());
        m.put("ordNo", coil.getOrdNo());
        m.put("cusNm", coil.getCusNm());
        m.put("poNo", coil.getPoNo());
        m.put("prdCd", coil.getPrdCd());
        m.put("prdNm", coil.getPrdNm());
        m.put("prdLabel", coil.prdLabel());
        m.put("specCd", coil.getSpecCd());
        m.put("thk", coil.getThk());
        m.put("wth", coil.getWth());
        m.put("sizeText", coil.sizeText());
        m.put("wgt", coil.getWgt());
        m.put("lineCd", coil.getLineCd());
        m.put("heatNo", coil.getHeatNo());
        m.put("inspBy", coil.getInspBy());
        m.put("inspAt", DemoSupport.format(coil.getInspAt()));
        m.put("inspDate", DemoSupport.formatDate(coil.getInspAt()));
        m.put("status", status().name());
        m.put("statusNm", status().label());
        m.put("suggStatus", suggestion() == null ? null : suggestion().name());
        m.put("suggStatusNm", JudgmentStatus.labelOf(suggestion()));
        return m;
    }

    /** 배지 4개(도금량·표면·기계적성질·치수)의 묶음 판정. */
    public List<Map<String, Object>> badges() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (String[] g : GROUPS) {
            List<ItemResult> rs = new ArrayList<>();
            for (InspectionItem i : items) {
                if (g[0].equals(i.getItemGrp())) rs.add(i.getRsltCd());
            }
            Map<String, Object> b = new LinkedHashMap<>();
            b.put("grp", g[0]);
            b.put("short", g[1]);
            b.put("name", g[2]);
            b.put("result", InspectionEvaluator.worst(rs).name());
            out.add(b);
        }
        return out;
    }

    /** 검사 항목 표(항목 · 기준 · 검사값 · 판정). */
    public List<Map<String, Object>> itemViews() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (InspectionItem i : items) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("itemCd", i.getItemCd());
            m.put("itemNm", i.getItemNm());
            m.put("itemGrp", i.getItemGrp());
            m.put("unitNm", i.getUnitNm());
            m.put("label", i.getUnitNm() == null ? i.getItemNm() : i.getItemNm() + " (" + i.getUnitNm() + ")");
            m.put("critTp", i.getCritTp());
            m.put("critTxt", i.getCritTxt());
            m.put("lowerVal", i.getLowerVal());
            m.put("upperVal", i.getUpperVal());
            m.put("gradeLmt", i.getGradeLmt());
            m.put("measVal", i.getMeasVal());
            m.put("result", i.getRsltCd().name());
            m.put("resultNm", i.getRsltCd().label());
            out.add(m);
        }
        return out;
    }
}
