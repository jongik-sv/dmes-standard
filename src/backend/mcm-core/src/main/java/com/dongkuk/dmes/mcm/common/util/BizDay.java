package com.dongkuk.dmes.mcm.common.util;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 전기일 계산 — 회사는 아침 {@link #BASE_HOUR}시를 기준으로 하루를 나눈다(07:00 ~ 다음 날 07:00 이 전기일 하루).
 * 위젯 SQL 시스템 변수·수집 SQL·예약 작업 변수가 이 한 곳의 값과 계산을 같이 쓴다. 값은 사용자 결정으로 코드 상수에 고정한다.
 */
public final class BizDay {

    /** 전기일이 바뀌는 시각(시). */
    public static final int BASE_HOUR = 7;

    private BizDay() {}

    /** 주어진 시각이 속한 전기일 — (시각 − BASE_HOUR 시간) 의 날짜. 06:59 는 전날, 07:00 은 그날. */
    public static LocalDate bizDate(LocalDateTime at) {
        return at.minusHours(BASE_HOUR).toLocalDate();
    }
}
