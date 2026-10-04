package com.dongkuk.dmes.mdm.dma.naming;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * {@link TermDictionary#parseSurfaces} 특성 시험 — JSON 목록 파서 공통화 전에 지금 동작을 고정한다.
 *
 * <p>이 파서는 원소 단위로 관대하다(D3): 루트가 배열이 아니거나 파싱이 안 되면 빈 목록, 문자열 원소는 끝의 {@code (…)} 를 떼고
 * trim 한 뒤 비면 버린다. 객체 원소는 {@code name}, 없거나 문자열이 아니면 {@code term} 을 쓴다. 숫자·불린·null·중첩 배열 원소는 건너뛴다.
 * TermMngService·TermRecommendationCache 의 엄격한 {@code List<String>} 파서와 결과가 다르다(같은 입력 행렬로 비교).
 */
class TermDictionaryParseSurfacesCharacterizationTest {

    private static List<String> p(String json) {
        return TermDictionary.parseSurfaces(json);
    }

    @Test
    void 비어있거나_공백이면_빈_목록() {
        assertEquals(List.of(), p(null));
        assertEquals(List.of(), p(""));
        assertEquals(List.of(), p("   "));
        assertEquals(List.of(), p("\t\n"));
        assertEquals(List.of(), p("[]"));
    }

    @Test
    void 정상_배열은_원소를_순서대로() {
        assertEquals(List.of("a", "b"), p("[\"a\",\"b\"]"));
        assertEquals(List.of("a", "b"), p("  [ \"a\" , \"b\" ]  "));
        assertEquals(List.of("a", "a"), p("[\"a\",\"a\"]"), "중복을 지우지 않는다");
    }

    @Test
    void 깨진_JSON이나_배열이_아닌_JSON은_빈_목록() {
        assertEquals(List.of(), p("[\"a\""));
        assertEquals(List.of(), p("[\"a\",]"));
        assertEquals(List.of(), p("{\"a\":1}"));
        assertEquals(List.of(), p("{\"name\":\"객체\"}"));
        assertEquals(List.of(), p("\"abc\""));
        assertEquals(List.of(), p("\"\""));
        assertEquals(List.of(), p("null"));
        assertEquals(List.of(), p("3"));
        assertEquals(List.of(), p("true"));
        assertEquals(List.of(), p("abc"));
    }

    @Test
    void 배열_뒤에_남은_글자가_있어도_앞의_배열을_읽는다() {
        assertEquals(List.of("a"), p("[\"a\"] x"));
        assertEquals(List.of("a"), p("[\"a\"][\"b\"]"));
    }

    @Test
    void 원소의_공백은_trim_하고_빈_원소와_null은_버린다() {
        assertEquals(List.of("a"), p("[\" a \",\"\",null,\"   \"]"));
        assertEquals(List.of("작업 지시"), p("[\" 작업 지시 \"]"), "가운데 공백은 그대로");
    }

    @Test
    void 문자열이_아닌_원소는_건너뛰고_객체는_name_또는_term을_읽는다() {
        assertEquals(List.of(), p("[1,true,1.5]"));
        assertEquals(List.of(), p("[[\"a\"]]"));
        assertEquals(List.of("x"), p("[{\"name\":\"x\"}]"));
        assertEquals(List.of("y"), p("[{\"name\":1,\"term\":\"y\"}]"));
        assertEquals(List.of("x"), p("[{\"name\":\"x\",\"term\":\"y\"}]"));
        assertEquals(List.of(), p("[{\"other\":\"z\"}]"));
        assertEquals(List.of("배치"), p("[{\"name\":\"배치(ERP)\"}]"));
    }

    @Test
    void 끝의_괄호_하나만_떼고_괄호뿐이면_버린다() {
        assertEquals(List.of("배치"), p("[\"배치(ERP)\"]"));
        assertEquals(List.of("배치"), p("[\"배치 (ERP, APS)\"]"));
        assertEquals(List.of("배치(ERP)"), p("[\"배치(ERP)(MES)\"]"), "끝 괄호 하나만 뗀다");
        assertEquals(List.of("(ERP)배치"), p("[\"(ERP)배치\"]"), "앞 괄호는 그대로");
        assertEquals(List.of(), p("[\"(ERP)\"]"));
        assertEquals(List.of("배치(a(b))"), p("[\"배치(a(b))\"]"), "괄호 안에 괄호가 있으면 떼지 않는다");
    }

    @Test
    void 유니코드_이스케이프는_디코드한다() {
        assertEquals(List.of("배"), p("[\"\\uBC30\"]"));
        assertEquals(List.of("배치"), p("[\"\\uBC30\\uCE58(\\u0045RP)\"]"));
        assertEquals(List.of("따옴\"표", "역\\슬"), p("[\"따옴\\\"표\",\"역\\\\슬\"]"));
    }
}
