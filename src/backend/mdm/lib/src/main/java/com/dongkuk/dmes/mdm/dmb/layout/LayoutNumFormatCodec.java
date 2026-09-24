package com.dongkuk.dmes.mdm.dmb.layout;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * {@code TB_MDM_LAYOUT_ITEM.NUM_FORMAT} 문자열 형식(TSK-05-02 design.md D3, 불변 I15) — 정본:
 * {@code SIGN=Y|N;ZERO=Y|N;SCALE=<0~9>;WIDTH=<1~99>}. 키 순서 고정, 네 키 필수, 최대 29자(칼럼 50자). m-mdm
 * {@code src/layout/num-format.ts} 와 같은 벡터를 통과해야 한다.
 */
public final class LayoutNumFormatCodec {

    private static final Pattern FORMAT = Pattern.compile("^SIGN=([YN]);ZERO=([YN]);SCALE=(\\d);WIDTH=([1-9]\\d?)$");

    private LayoutNumFormatCodec() {
    }

    public static String encode(LayoutNumFormat f) {
        return "SIGN=" + yn(f.sign()) + ";ZERO=" + yn(f.zeroPad()) + ";SCALE=" + f.impliedScale() + ";WIDTH=" + f.width();
    }

    /** @throws IllegalArgumentException 형식 위반(L08 원인) */
    public static LayoutNumFormat decode(String text) {
        Matcher m = text == null ? null : FORMAT.matcher(text);
        if (m == null || !m.matches()) {
            throw new IllegalArgumentException("숫자 표현 형식이 SIGN=Y|N;ZERO=Y|N;SCALE=n;WIDTH=n 이 아니다: " + text);
        }
        return new LayoutNumFormat("Y".equals(m.group(1)), "Y".equals(m.group(2)), Integer.parseInt(m.group(3)),
                Integer.parseInt(m.group(4)));
    }

    private static String yn(boolean b) {
        return b ? "Y" : "N";
    }
}
