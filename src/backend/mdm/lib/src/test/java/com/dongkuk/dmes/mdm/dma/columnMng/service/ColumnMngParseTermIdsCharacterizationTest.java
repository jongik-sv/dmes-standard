package com.dongkuk.dmes.mdm.dma.columnMng.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * {@link ColumnMngService#parseTermIds} 특성 시험 — JSON 목록 파서 공통화 전에 지금 동작을 고정한다.
 *
 * <p>이 파서는 문자열이 아니라 ID({@code Long}) 목록 파서다: 루트가 배열이 아니거나 파싱이 안 되면 빈 목록, JSON {@code null} 원소는
 * 자리({@code ***})로 null 을 남기고, {@code canConvertToLong} 인 숫자 원소만 읽는다(소수는 버림). 문자열·불린·객체·배열 원소는 건너뛴다.
 */
class ColumnMngParseTermIdsCharacterizationTest {

    private static List<Long> p(String json) {
        return ColumnMngService.parseTermIds(json);
    }

    @Test
    void 비어있거나_공백이면_빈_목록() {
        assertEquals(List.of(), p(null));
        assertEquals(List.of(), p(""));
        assertEquals(List.of(), p("   "));
        assertEquals(List.of(), p("[]"));
    }

    @Test
    void 정상_배열은_ID를_순서대로() {
        assertEquals(List.of(1L, 2L), p("[1,2]"));
        assertEquals(List.of(2L, 1L, 2L), p(" [ 2 , 1 , 2 ] "), "중복을 지우지 않는다");
    }

    @Test
    void 깨진_JSON이나_배열이_아닌_JSON은_빈_목록() {
        assertEquals(List.of(), p("[1,"));
        assertEquals(List.of(), p("{\"a\":1}"));
        assertEquals(List.of(), p("\"abc\""));
        assertEquals(List.of(), p("\"\""));
        assertEquals(List.of(), p("null"));
        assertEquals(List.of(), p("3"));
        assertEquals(List.of(), p("abc"));
    }

    @Test
    void 배열_뒤에_남은_글자가_있어도_앞의_배열을_읽는다() {
        assertEquals(List.of(1L), p("[1] x"));
    }

    @Test
    void null_원소는_자리로_남긴다() {
        assertEquals(Arrays.asList(null, 1L, null), p("[null,1,null]"));
    }

    @Test
    void 숫자가_아닌_원소는_건너뛰고_소수는_버림한다() {
        assertEquals(List.of(), p("[\"3\",\" 4 \",\"\",\"x\",\"\\u0031\"]"), "숫자 모양 문자열도 건너뛴다");
        assertEquals(List.of(), p("[true,{\"id\":1},[1]]"));
        assertEquals(List.of(1L, 2L), p("[1.5,2.9]"));
        assertEquals(List.of(-3L), p("[-3]"));
        assertEquals(List.of(), p("[9223372036854775808]"), "long 범위 밖은 건너뛴다");
        assertEquals(List.of(), p("[1e30]"));
    }
}
