package com.dongkuk.dmes.mdm.contract.version;

/**
 * 버전 상태 서비스 계약 — 이번 범위 전이(담당자 확정·DRAFT 삭제·확정 취소)만 둔다. 구현 TSK-01-03(ADR-0002 D4·D8),
 * 04·06 영역 서비스가 부른다.
 */
public interface VersionStateService {

    /** 담당자 확정 DRAFT→RELEASED. 실패 시 BusinessException(MdmErrorCode…), DRAFT 는 그대로. */
    ConfirmResult confirm(ConfirmCommand command);

    /** DRAFT 삭제(소유자만). */
    void deleteDraft(VersionRef draft, long expectedRowVersion, String userId);

    /**
     * 확정 취소 — 아직 적용 시각이 오지 않은 확정 버전을 작성 중으로 되돌린다(ADR-0002 D8).
     *
     * <p>요청 대상은 {@code RELEASED} 이고 {@code apply_from > 현재 시각} 일 때만 되돌린다. 이미 적용된 버전을
     * 되돌리면 MDM025, {@code RELEASED} 가 아니면 MDM002 다. 한 트랜잭션이며 하나라도 실패하면 전부 롤백되어
     * {@code RELEASED} 가 그대로 남는다. 직전 {@code RELEASED} 의 적용 구간을 다시 열어 주므로 되돌린 뒤에도 그 이전
     * 버전이 유효하다.
     */
    void cancelConfirm(VersionRef released, long expectedRowVersion, String userId);
}
