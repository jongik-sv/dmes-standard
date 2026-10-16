package com.dongkuk.dmes.mdm.contract.version;

/**
 * 새 버전 만들기 요청(BE 리팩토링 2회차 C3, {@link VersionStateService#newVersion}). {@code actorId} 가 새 DRAFT 의 소유자다. 대상에
 * 따라 필요한 화면 앞단 검사(예: 객체 읽기·외부 원천(EXTERNAL)·폐기·담당자 역할·결재 중, ERD 는 모델 확인·잠금)는 호출자가 먼저 끝낸다.
 */
public record NewVersionCommand(VersionTarget target, String objectId, VersionKind kind, String actorId) {
}
