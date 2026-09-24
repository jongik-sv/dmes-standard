package com.dongkuk.dmes.mdm.dmb.layout.codec;

/**
 * 직렬화·파싱 오류(TSK-05-03 design.md §2, D10) — 넘침·담지 못하는 문자·숫자 칸의 비숫자·길이 불일치·단위. 잘라내거나 대체하지 않고
 * 이 예외로 알린다(불변 I6). message = {@code "[{seq} {columnPhys}] {reason}"}(항목을 모르면 reason 만).
 */
public class LayoutCodecException extends RuntimeException {

    private final Integer seq;
    private final String columnPhys;
    private final String reason;

    public LayoutCodecException(Integer seq, String columnPhys, String reason) {
        super(seq == null && columnPhys == null ? reason : "[" + seq + " " + columnPhys + "] " + reason);
        this.seq = seq;
        this.columnPhys = columnPhys;
        this.reason = reason;
    }

    public LayoutCodecException(String reason) {
        this(null, null, reason);
    }

    public Integer seq() {
        return seq;
    }

    public String columnPhys() {
        return columnPhys;
    }

    public String reason() {
        return reason;
    }
}
