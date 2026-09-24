package com.dongkuk.dmes.mdm.dmb.layout.codec;

import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;

/**
 * 전문 한 줄의 구간 하나(TSK-05-03 design.md §2). {@code offset} 은 메시지 절대 바이트다 — 헤더 항목이면 헤더 시작 + 헤더 안 상대값.
 *
 * @param zone      {@code HEADER} 또는 {@code BODY}
 * @param headerSeq 헤더 적층 순번(본문 0)
 */
public record LayoutSegment(String zone, int headerSeq, String headerName, MdmLayoutItemSnapshot item, int offset, int length) {

    public static final String HEADER = "HEADER";
    public static final String BODY = "BODY";

    public boolean body() {
        return BODY.equals(zone);
    }
}
