package com.dongkuk.dmes.mdm.contract.version;

/**
 * 버전 상태 서비스 계약 — 이번 범위 전이(담당자 확정·DRAFT 삭제·확정 취소)와 새 버전 만들기를 둔다. 구현 TSK-01-03(ADR-0002 D4·D8),
 * 04·06 영역 서비스가 부른다. 새 버전은 BE 리팩토링 2회차 C3 에서 더했다.
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

    /**
     * 새 버전 — 한 트랜잭션에서(호출자 트랜잭션이 있으면 합류한다) 다음 순서로 한다.
     * <ol>
     *   <li>그 객체의 모든 버전을 읽고, 미적용 버전이 하나라도 있으면 MDM006.</li>
     *   <li>{@link SourcePicker} 로 복사 원천을 고른다. 대상의 오류는 그대로 나간다.</li>
     *   <li>번호 = 상태와 무관한 모든 버전의 최대값에서 {@code kind} 로 올린 값. 버전이 없는데 MINOR 면 MDM021, 상한을 넘으면 MDM009.</li>
     *   <li>{@link DraftWriter} 로 새 DRAFT 를 쓴다(소유자 = {@code actorId}).</li>
     *   <li>적용된 RELEASED 가 하나라도 있으면 {@link ParentPromotion} 을 부른다.</li>
     * </ol>
     * 새 DRAFT 의 키를 돌려준다. 하나라도 실패하면 전부 롤백된다. RELEASED 를 바꾸지 않으므로 메타 캐시는 기록하지 않는다. 대상마다 다른
     * 단계는 손잡이 세 개({@code source}·{@code writer}·{@code promotion})로 받는다.
     */
    VersionRef newVersion(NewVersionCommand command, SourcePicker source, DraftWriter writer, ParentPromotion promotion);
}
