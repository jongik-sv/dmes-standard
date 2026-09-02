package com.dongkuk.dmes.cactus.integration.caravanhub.exception;

/**
 * caravan-hub 통합 클라이언트 호출 실패 예외.
 *
 * <p>다음 케이스에 throw:
 * <ul>
 *   <li>최대 재시도 횟수 ({@code cactus.caravan-hub.retry.max-attempts}) 모두 실패</li>
 *   <li>응답 역직렬화 실패</li>
 *   <li>HTTP timeout 또는 연결 실패</li>
 * </ul>
 *
 * <p>호출 모듈은 본 예외를 catch 하여 자기 비즈니스 트랜잭션 rollback 수행해야 함 (v4 §결정 #6 — atomic 보장 포기).
 *
 * <p>v4 caravan-hub-EAI 마이그레이션 Phase 4-A (2026-05-13).
 */
public class CaravanHubIntegrationException extends RuntimeException {

    public CaravanHubIntegrationException(String message) {
        super(message);
    }

    public CaravanHubIntegrationException(String message, Throwable cause) {
        super(message, cause);
    }
}
