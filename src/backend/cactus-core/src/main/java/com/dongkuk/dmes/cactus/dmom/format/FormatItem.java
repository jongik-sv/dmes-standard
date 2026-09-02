package com.dongkuk.dmes.cactus.dmom.format;

/**
 * FORMAT_LAYOUT 한 행(항목). {@code TB_MCM_MOM_FORMAT_LAYOUT} 매핑.
 *
 * @param itemSeq          항목 순서 (ITEM_SEQ)
 * @param itemTp           항목 구분 — {@code E}(단일) / {@code G}(반복그룹 헤더) / {@code GE}(그룹 내 항목)
 * @param itemId           항목 ID (ITEM_ID) — 데이터 Map 의 키
 * @param itemNm           항목 명 (ITEM_NM)
 * @param dataTp           데이터 유형 — {@code 1}String / {@code 2}Number / {@code 3}Date / {@code 4}String2 / {@code 5}Number2
 * @param dataLen          데이터 전체 길이 (E:포맷폭, G:반복 횟수)
 * @param dataDecimalPrec  소수점 이하 길이
 */
public record FormatItem(
        long itemSeq,
        String itemTp,
        String itemId,
        String itemNm,
        String dataTp,
        int dataLen,
        int dataDecimalPrec
) {
}
