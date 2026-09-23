package com.dongkuk.dmes.mdm.batch.sapdict;

import java.util.List;
import java.util.Map;

/**
 * 읽은 SAP DDIC 추출(TSK-04-05 design.md §4.1). 활성 행만 담고, 모든 값은 앞뒤 공백을 뗐다.
 *
 * @param fields      DD03L 대상 행(구조 행 제외)
 * @param elements    DD04L, {@code ROLLNAME} 키
 * @param koreanTexts DD04T 한국어 행(언어 키 {@code 3}·{@code KO}), {@code ROLLNAME} 키
 * @param domains     DD01L, {@code DOMNAME} 키
 */
public record SapDdicExtract(
        List<Dd03lField> fields,
        Map<String, Dd04lElement> elements,
        Map<String, Dd04tText> koreanTexts,
        Map<String, Dd01lDomain> domains) {

    public SapDdicExtract {
        fields = List.copyOf(fields);
        elements = Map.copyOf(elements);
        koreanTexts = Map.copyOf(koreanTexts);
        domains = Map.copyOf(domains);
    }

    /** DD03L 테이블 필드. {@code rollname} 이 빈 문자열이면 내장 타입 필드다. */
    public record Dd03lField(String tabname, String fieldname, String rollname) {
    }

    /** DD04L 데이터 엘리먼트. {@code domname} 이 빈 문자열이면 도메인 없이 내장 타입을 직접 쓴다. */
    public record Dd04lElement(String rollname, String domname, String datatype, int leng, int decimals) {
    }

    /** DD04T 한국어 라벨. */
    public record Dd04tText(String rollname, String ddtext, String scrtextS, String scrtextM, String scrtextL) {
    }

    /** DD01L 도메인. {@code convexit} 은 SAP 변환 루틴(ALPHA 등)이다. */
    public record Dd01lDomain(String domname, String datatype, int leng, int decimals, String convexit) {
    }
}
