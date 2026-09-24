package com.dongkuk.dmes.mdm.dmb.layout.codec;

import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutNumFormat;

/**
 * 숫자 칸 형식(TSK-05-03 design.md §2·§6.3). 표현 형식이 없는 숫자 항목은 03:59 "숫자 왼쪽 0" 기본값 — 부호 없음·0 채움·암묵 소수 =
 * 도메인 소수(불변 I3). {@link #pointMode()} 는 암묵 소수가 0 인데 도메인 소수가 있는 경우 — 소수점 문자를 쓴다(I4).
 */
public record LayoutNumSpec(boolean sign, boolean zeroPad, int impliedScale, int domainScale) {

    public static LayoutNumSpec of(MdmLayoutItemSnapshot item) {
        int scale = item.scale() == null ? 0 : item.scale();
        MdmLayoutNumFormat f = item.numFormat();
        return f == null ? new LayoutNumSpec(false, true, scale, scale) : new LayoutNumSpec(f.sign(), f.zeroPad(), f.impliedScale(), scale);
    }

    public boolean pointMode() {
        return impliedScale == 0 && domainScale > 0;
    }
}
