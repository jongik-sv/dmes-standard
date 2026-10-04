package com.dongkuk.dmes.cactus.oasis.aop;

/**
 * BPMN 이 부르는 빈의 프록시 의존 어노테이션 기동 검사 방식 ({@code cactus.oasis.aop-check}).
 *
 * <ul>
 *   <li>{@link #WARN} — 경고 로그만 남기고 기동은 계속한다 (기본값).</li>
 *   <li>{@link #FAIL} — 기동 시 BPMN 스캔에서 하나라도 걸리면 기동을 멈춘다 (HTTP 로더 모드는 스캔할 수 없어 안내만 한다).</li>
 *   <li>{@link #OFF} — 검사하지 않는다.</li>
 * </ul>
 *
 * <p>기본값을 FAIL 로 두지 않는다. 아직 정리되지 않은 모듈이 먼저 기동 실패하기 때문이다.
 */
public enum OasisAopCheckMode {
    /** 경고 로그만 남긴다 (기본값) */
    WARN,
    /** 기동 시 위반이 있으면 기동을 멈춘다 */
    FAIL,
    /** 검사하지 않는다 */
    OFF
}
