package com.dongkuk.caravan.core.alert;

/**
 * 운영자 알림이 발생하는 파이프라인 단계.
 *
 * <p>모두 "메시지가 목적지에 닿지 못하고 멈춘(큐막기) / 프레임 레벨로 밀려난(DLT)" 지점이다.
 * 정상 스킵(운영자가 의도한 skip)에서는 알림하지 않는다 — 알림 = "사람이 개입해야 한다".</p>
 */
public enum AlertStage {

    /** 소비 비즈니스 처리 재시도 소진 → 큐막기(pause + seek). */
    CONSUME_BLOCKED,

    /** 소비 메시지 파싱 실패 → 큐막기(pause + seek). */
    PARSE_ERROR,

    /** DB 인바운드 폴링에서 {@code IF_FLAG='E'} 감지 → 폴링 큐막기. */
    INBOUND_BLOCKED,

    /** FILE 인바운드 처리 중 라인 발행 실패(부분/전체) → 파일 에러 폴더 격리 또는 이동 실패. */
    FILE_INBOUND_FAILED,

    /** 프레임 레벨 예외로 메시지가 Dead Letter Topic 으로 밀려남. */
    DLT
}
