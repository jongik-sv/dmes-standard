package com.dongkuk.dmes.mqc.qcd.order.pipeline;

import java.util.List;
import java.util.Map;

/**
 * 품질사양(품질사양 관리 화면이 소유한 TB_MQC_QSPEC* 표) 읽기 경계. 다른 담당의 표라 읽기만 하고, 표가 없으면 available=false 다.
 */
public interface SpecSource {

    SpecData load(String cusCd, String prdNmCd);

    /** 한 사양의 조건(IF)·결과(THEN) 한 줄. */
    record Term(String side, int seq, String attrCd, String attrNm, String op, String val, String unit) {}

    record Spec(String specNo, String status, List<Term> terms) {}

    /** base = 항목코드 → 표준 설계 기준값, names = 항목코드 → 한글명. */
    record SpecData(boolean available, String note, List<Spec> specs, Map<String, String> base, Map<String, String> names) {
        public static SpecData unavailable(String note) {
            return new SpecData(false, note, List.of(), Map.of(), Map.of());
        }
    }
}
