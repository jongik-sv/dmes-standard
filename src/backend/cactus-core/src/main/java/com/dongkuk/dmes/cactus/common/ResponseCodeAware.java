package com.dongkuk.dmes.cactus.common;

/**
 * 응답 코드를 스스로 정하는 예외. OASIS BPMN 안에서 던진 예외의 {@code meta.code} 는 사용자 예외 {@code E001}, 업무 예외
 * ({@link BusinessException}) 는 그 {@link ErrorCode} 의 코드, 그 밖의 시스템 오류는 {@code S001} 이다({@code CactusResponseConverter},
 * 2026-10-05). 이 인터페이스를 구현한 예외가 원인 사슬에 있으면 그 {@link #responseCode()} 를 가장 먼저 {@code meta.code} 로 싣는다
 * — 운반용 {@link ErrorCode} 와 다른 업무 코드를 낼 때 쓴다(예: MDM 오류 {@code MDMnnn}, {@code MdmErrors}).
 */
public interface ResponseCodeAware {

    /** {@code meta.code} 로 실을 코드. null·빈 값이면 기본 코드를 쓴다. */
    String responseCode();
}
