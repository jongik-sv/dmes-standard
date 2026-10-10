package com.dongkuk.dmes.mdm.dma.erdEdit.dto;

/**
 * execute kind=CLAIM 응답(S2-26). ok 와 상관없이 지금 그 표를 쥔 세션·사용자·만료 시각(ISO-8601)을 준다.
 * 같은 표를 다른 세션이 동시에 처음 표시해 키가 겹쳤고, 그 사이 상대 표시가 만료·해제되어 쥔 세션을 읽지 못했으면 셋 다 null 이다.
 */
public record ErdClaimResult(boolean ok, String claimedBy, String userId, String expiresAt) {
}
