package com.dongkuk.dmes.cactus.common;

/**
 * 응답 코드를 스스로 정하는 예외. OASIS BPMN 안에서 던진 예외는 기본으로 {@code meta.code} 가 {@code S001}(사용자 예외는 {@code E001})이다
 * ({@code CactusResponseConverter}). 이 인터페이스를 구현한 예외가 원인 사슬에 있으면 그 {@link #responseCode()} 를 {@code meta.code} 로
 * 싣는다 — 계약이 업무 코드를 약속한 경로만 골라 쓴다(예: MDM {@code metaFeed/save} 권한 거부 {@code MDM027}, 2026-10-02).
 */
public interface ResponseCodeAware {

    /** {@code meta.code} 로 실을 코드. null·빈 값이면 기본 코드를 쓴다. */
    String responseCode();
}
