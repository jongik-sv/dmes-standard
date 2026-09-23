package com.dongkuk.dmes.mdm.contract.layout;

/**
 * 숫자 항목의 직렬화 형식(TSK-05-01 design.md §6.1, F22, html:560) — {@code sign}(부호 유무),
 * {@code zeroPad}(왼쪽 0-채움 여부), {@code impliedScale}(암시 소수점 자리수). 단일 문자열이 아니라
 * 구조화된 record 로 두어 소비자(TSK-05-03)가 파싱 없이 바로 쓸 수 있게 한다.
 */
public record MdmLayoutNumFormat(boolean sign, boolean zeroPad, int impliedScale) {
}
