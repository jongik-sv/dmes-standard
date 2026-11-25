package com.dongkuk.dmes.mqc.qdm.qualitySpec;

import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecAttr;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecBase;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecCustomer;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecOrder;
import java.time.LocalDateTime;
import java.util.List;

/** 시연 V2 시드와 같은 사전·기준값·고객·표본 주문(사양은 시험마다 서비스로 만든다). */
public final class QualitySpecFixture {

    private QualitySpecFixture() {}

    public static List<QualitySpecAttr> dictionary() {
        Object[][] rows = {
            {"CUS_CD", "고객사", "COND", "", "VARCHAR2", "6"},
            {"PRD_NM_CD", "품명", "COND", "", "CHAR", "1"},
            {"RAW_THK", "원재료 두께", "COND", "mm", "NUMBER", "4,2"},
            {"RAW_WID", "원재료 폭", "COND", "mm", "NUMBER", "5"},
            {"COLOR_CD", "색상코드", "COND", "", "VARCHAR2", "10"},
            {"USAGE_CD", "용도", "COND", "", "VARCHAR2", "10"},
            {"CCL_BOM", "BOM", "BOTH", "", "VARCHAR2", "6"},
            {"RAW_MTRL", "원재료 재질", "BOTH", "", "VARCHAR2", "4"},
            {"PROC_CD", "통과공정", "RESULT", "", "VARCHAR2", "12"},
            {"TOP_THK", "상도 도막두께", "RESULT", "㎛", "NUMBER", "3"},
            {"GLOSS", "광택", "RESULT", "GU", "NUMBER", "3"},
            {"POST_TRT", "후처리", "RESULT", "", "VARCHAR2", "20"},
            {"PACK_CD", "포장방법", "RESULT", "", "VARCHAR2", "3"},
            {"TEST_CD", "시험항목", "RESULT", "", "VARCHAR2", "20"},
        };
        java.util.ArrayList<QualitySpecAttr> out = new java.util.ArrayList<>();
        for (int i = 0; i < rows.length; i++) {
            Object[] r = rows[i];
            String unit = (String) r[3];
            out.add(QualitySpecAttr.of((String) r[0], (String) r[1], (String) r[2], (String) r[4], (String) r[5],
                    unit.isEmpty() ? null : unit, null, true, i + 1));
        }
        return out;
    }

    public static InMemoryQualitySpecStore store() {
        InMemoryQualitySpecStore s = new InMemoryQualitySpecStore();
        dictionary().forEach(s::saveAttr);
        String[][] base = {{"RAW_MTRL", "CQ"}, {"CCL_BOM", "S00001"}, {"PROC_CD", "1P-31-81-A1"}, {"TOP_THK", "18"},
            {"GLOSS", "40"}, {"POST_TRT", "없음"}, {"PACK_CD", "P01"}, {"TEST_CD", "표준검사"}};
        for (int i = 0; i < base.length; i++) s.bases.add(QualitySpecBase.of(base[i][0], base[i][1], null, i + 1));
        String[][] cus = {{"110197", "수요가 A"}, {"320104", "수요가 B"}, {"320100", "수요가 C"}, {"115462", "수요가 D"}, {"205202", "수요가 E"}};
        for (int i = 0; i < cus.length; i++) s.customers.add(QualitySpecCustomer.of(cus[i][0], cus[i][1], i + 1));
        s.orders.put("D260831027-010", QualitySpecOrder.of("D260831027-010", "320104", "L", "24.0 t",
                "{\"RAW_THK\":\"0.8\",\"RAW_WID\":\"1224\",\"USAGE_CD\":\"벽체재\"}", LocalDateTime.of(2026, 8, 31, 8, 10)));
        return s;
    }
}
