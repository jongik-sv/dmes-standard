package com.dongkuk.dmes.mdm.internal.userOwnership;

/**
 * 사용자를 소유자·담당자로 가리키는 MDM 칸의 묶음(퇴직 처리). 코드 값은 MCM 과 주고받는 고정 이름이라 바꾸지 않는다.
 *
 * <p>버전 표의 {@code OWNER_ID} 는 DRAFT 선점자다({@code DefaultDraftOwnershipService}). 확정·취소된 버전의 {@code OWNER_ID} 는 그때의 이력이라
 * 세지도 넘기지도 않는다 — {@code STATUS = 'DRAFT'} 인 행만 본다. {@code REQUESTED_BY}·{@code APPROVED_BY}·{@code TB_MDM_ERD_CMD_LOG.USER_ID} 도
 * 이력이라 대상이 아니다.
 *
 * <p>선언 순서가 넘기기 순서다. {@link #ERD_EDITOR} 는 {@link #ERD_OWNER} 뒤에 둔다 — 받는 사람이 이미 그 초안의 소유자가 된 뒤에 편집자 행을
 * 정리한다.
 */
public enum UserOwnershipKind {

    CODE_OWNER("코드 초안 소유", IdType.USER_ID),
    RULE_OWNER("룰 초안 소유", IdType.USER_ID),
    RULE_SET_OWNER("룰 세트 초안 소유", IdType.USER_ID),
    LAYOUT_OWNER("전문·헤더 초안 소유", IdType.USER_ID),
    ERD_OWNER("ERD 초안 소유", IdType.USER_ID),
    ERD_EDITOR("ERD 초안 공동 편집자", IdType.USER_ID),
    TERM_OWNER("용어 소유자", IdType.USER_ID),
    /** 표 작업 중 표시 — 넘기지 않고 지운다. */
    ERD_CLAIM("ERD 작업 중 표시", IdType.USER_ID);

    /** 그 칸이 담는 값 — 사용자 ID 또는 사번. 사번 칸은 요청에 사번이 없으면 건너뛴다. */
    public enum IdType { USER_ID, EMP_NO }

    private final String label;
    private final IdType idType;

    UserOwnershipKind(String label, IdType idType) {
        this.label = label;
        this.idType = idType;
    }

    public String label() {
        return label;
    }

    public IdType idType() {
        return idType;
    }
}
