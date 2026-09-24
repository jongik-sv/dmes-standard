package com.dongkuk.dmes.mdm.dmb.layout;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutNumFormat;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * TSK-05-02 design.md §3.1·D3 — NUM_FORMAT 문자열 형식(불변 I15). 같은 벡터를 m-mdm {@code tests/layout/num-format.test.ts}
 * 가 쓴다 — 한쪽만 바꾸면 한쪽이 빨개진다.
 */
class LayoutNumFormatCodecTest {

    @Test
    void M201_코일_두께_형식을_문자열로_쓰고_읽는다() {
        LayoutNumFormat f = new LayoutNumFormat(false, true, 1, 4);
        assertEquals("SIGN=N;ZERO=Y;SCALE=1;WIDTH=4", LayoutNumFormatCodec.encode(f));
        assertEquals(f, LayoutNumFormatCodec.decode("SIGN=N;ZERO=Y;SCALE=1;WIDTH=4"));
        assertEquals(new MdmLayoutNumFormat(false, true, 1), f.toContract());
        assertEquals(new LayoutNumFormat(true, false, 0, 12), LayoutNumFormatCodec.decode("SIGN=Y;ZERO=N;SCALE=0;WIDTH=12"));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "ZERO=Y;SIGN=N;SCALE=1;WIDTH=4", "SIGN=N;ZERO=Y;SCALE=1", "SIGN=X;ZERO=Y;SCALE=1;WIDTH=4",
            "SIGN=N;ZERO=Y;SCALE=1;WIDTH=0", "SIGN=N,ZERO=Y,SCALE=1,WIDTH=4", "sign=N;ZERO=Y;SCALE=1;WIDTH=4",
            "SIGN=N;ZERO=Y;SCALE=1;WIDTH=4;", "", "SIGN=N;ZERO=Y;SCALE=10;WIDTH=4", "SIGN=N;ZERO=Y;SCALE=1;WIDTH=100"})
    void 키_순서가_다르거나_키가_빠지거나_값이_틀리면_읽지_않는다(String text) {
        assertThrows(IllegalArgumentException.class, () -> LayoutNumFormatCodec.decode(text));
    }

    @Test
    void 형식_문자열은_50자를_넘지_않는다() {
        String max = LayoutNumFormatCodec.encode(new LayoutNumFormat(true, true, 9, 99));
        assertEquals("SIGN=Y;ZERO=Y;SCALE=9;WIDTH=99", max);
        assertTrue(max.length() <= 50, max);
    }
}
