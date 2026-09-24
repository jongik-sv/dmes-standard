package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutNumFormat;

/**
 * 숫자 항목의 표현 형식(TSK-05-02 design.md D3) — 부호 자리·0 채움·암묵 소수 자리·표현 자리수. 표현 자리수({@code width})는
 * 항목 길이가 된다(불변 I4). 문자열 형식은 {@link LayoutNumFormatCodec}.
 */
public record LayoutNumFormat(boolean sign, boolean zeroPad, int impliedScale, int width) {

    /** 계약 record 에는 width 가 없다 — 스냅샷 항목 {@code length} 가 같은 값을 싣는다(TSK-05-01 §6.1). */
    public MdmLayoutNumFormat toContract() {
        return new MdmLayoutNumFormat(sign, zeroPad, impliedScale);
    }
}
