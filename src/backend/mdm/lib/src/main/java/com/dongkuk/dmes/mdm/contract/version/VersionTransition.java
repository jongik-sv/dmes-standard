package com.dongkuk.dmes.mdm.contract.version;

/**
 * 버전 상태 전이 표 — 원천 04:234-245 의 7종 + 담당자 확정 1종 + 확정 취소 1종(ADR-0002 D1·D8, PRD §2 규칙 7).
 * {@code to() == null} 은 행 삭제다. 이번 범위({@code inScope})는 담당자 확정·DRAFT 삭제·확정 취소 3종뿐이다.
 * "(없음)→DRAFT 생성"·"상위 CREATED→INUSE" 는 버전 상태 사이 전이가 아니라 이 표에 없다.
 *
 * <p>확정 취소({@link #REVERT_CONFIRM}) 는 {@link #CANCEL} 과 이름이 가깝지만 뜻이 반대다. 철회가 아니라 되돌림이다.
 */
public enum VersionTransition {

    REQUEST(VersionStatus.DRAFT, VersionStatus.REQUESTED, false),
    REJECT(VersionStatus.REQUESTED, VersionStatus.DRAFT, false),
    APPROVE(VersionStatus.REQUESTED, VersionStatus.APPROVED, false),
    UNAPPROVE(VersionStatus.APPROVED, VersionStatus.DRAFT, false),
    RELEASE(VersionStatus.APPROVED, VersionStatus.RELEASED, false),
    CANCEL(VersionStatus.RELEASED, VersionStatus.CANCELLED, false),
    /** 원천 04 의 DRAFT → 삭제. */
    DELETE_DRAFT(VersionStatus.DRAFT, null, true),
    /** 담당자 확정(결재 없음) — 원천에는 없는 전이. */
    CONFIRM(VersionStatus.DRAFT, VersionStatus.RELEASED, true),
    /**
     * 확정 취소 — 아직 적용 시각이 오지 않은 확정 버전을 다시 작성 중으로 되돌린다(ADR-0002 D8).
     *
     * <p>{@link #CANCEL}(RELEASED→CANCELLED)과 다르다. 철회 상태 값은 쓰지 않고 {@code DRAFT} 로 돌아가므로,
     * 되돌린 자리에 다시 확정할 수 있다.
     */
    REVERT_CONFIRM(VersionStatus.RELEASED, VersionStatus.DRAFT, true);

    private final VersionStatus from;
    private final VersionStatus to;
    private final boolean inScope;

    VersionTransition(VersionStatus from, VersionStatus to, boolean inScope) {
        this.from = from;
        this.to = to;
        this.inScope = inScope;
    }

    public VersionStatus from() {
        return from;
    }

    /** 전이 뒤 상태. null 이면 행 삭제. */
    public VersionStatus to() {
        return to;
    }

    public boolean inScope() {
        return inScope;
    }
}
