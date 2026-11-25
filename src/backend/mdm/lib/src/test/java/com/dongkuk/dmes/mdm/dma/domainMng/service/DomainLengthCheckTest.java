package com.dongkuk.dmes.mdm.dma.domainMng.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

/** 도메인 길이 검사 — 엔진이 보지 않는 유효 길이·소수 자리수를 테스트 케이스·미리보기 판정에서 본다. */
class DomainLengthCheckTest {

    @Test
    void 문자는_글자_수가_길이를_넘으면_실패다() {
        assertEquals("길이 초과: 11자 > 10자", DomainLengthCheck.violation("STRING", 10, null, "12345678901"));
        assertNull(DomainLengthCheck.violation("STRING", 10, null, "1234567890"));
        assertNull(DomainLengthCheck.violation("STRING", 3, null, "가나다"), "한글도 한 글자로 센다");
    }

    @Test
    void 숫자는_정수_자리수와_소수_자리수를_본다() {
        assertEquals("정수 자리수 초과: 3자리 > 2자리", DomainLengthCheck.violation("NUMBER", 4, 2, "123.4"));
        assertNull(DomainLengthCheck.violation("NUMBER", 4, 2, "12.34"));
        assertNull(DomainLengthCheck.violation("NUMBER", 4, 2, "-12.30"), "부호와 뒤쪽 0은 자리수가 아니다");
        assertEquals("소수 자리수 초과: 3자리 > 2자리", DomainLengthCheck.violation("NUMBER", 4, 2, "1.234"));
        assertNull(DomainLengthCheck.violation("NUMBER", 3, null, "1.2345"), "소수 자리수가 없으면 소수는 보지 않는다");
        assertEquals("정수 자리수 초과: 4자리 > 3자리", DomainLengthCheck.violation("NUMBER", 3, null, "1000"));
        assertNull(DomainLengthCheck.violation("NUMBER", 2, 2, "0.5"));
    }

    @Test
    void 판정하지_않는_경우() {
        assertNull(DomainLengthCheck.violation("STRING", null, null, "아주 긴 값"), "길이 없음");
        assertNull(DomainLengthCheck.violation("STRING", 1, null, "  "), "빈 값은 필수 검사 몫");
        assertNull(DomainLengthCheck.violation("NUMBER", 1, null, "abc"), "타입 변환 실패는 엔진 몫");
        assertNull(DomainLengthCheck.violation("BOOLEAN", 1, null, "true"));
    }
}
