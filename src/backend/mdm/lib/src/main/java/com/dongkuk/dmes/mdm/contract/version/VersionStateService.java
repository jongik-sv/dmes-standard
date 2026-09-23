package com.dongkuk.dmes.mdm.contract.version;

/**
 * 버전 상태 서비스 계약 — 이번 범위 전이(담당자 확정·DRAFT 삭제)만 둔다. 구현 TSK-01-03(ADR-0002 D4),
 * 04·06 영역 서비스가 부른다.
 */
public interface VersionStateService {

    /** 담당자 확정 DRAFT→RELEASED. 실패 시 BusinessException(MdmErrorCode…), DRAFT 는 그대로. */
    ConfirmResult confirm(ConfirmCommand command);

    /** DRAFT 삭제(소유자만). */
    void deleteDraft(VersionRef draft, long expectedRowVersion, String userId);
}
