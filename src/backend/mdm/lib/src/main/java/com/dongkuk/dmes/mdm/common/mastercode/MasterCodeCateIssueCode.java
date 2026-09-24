package com.dongkuk.dmes.mdm.common.mastercode;

/**
 * 카테고리 저장 검사·조작 거부의 이슈 코드(TSK-06-04 design.md §2). 우산 오류 코드는 기존
 * {@code MdmErrorCode.CODE_SAVE_REJECTED}(MDM022)를 그대로 재사용하고(D6), 세부는 이 이름을 {@code MdmCheckIssue.code} 에
 * 싣는다. BASE 보호는 이 이슈 코드가 아니라 {@code MdmErrorCode.RESERVED_CATEGORY}(MDM012)로 던진다(불변 규칙 2).
 */
public enum MasterCodeCateIssueCode {
    /** cate_id 가 비었다. */
    CATE_ID_REQUIRED,
    /** cate_id 에 점·콤마·공백이 있다({@code MaruIdRules.FORBIDDEN_CHAR_PATTERN}). */
    CATE_ID_FORBIDDEN_CHAR,
    /** cate_name 이 비었다. */
    CATE_NAME_REQUIRED,
    /** REGEX defExpr 이 {@code Pattern.compile} 에 실패한다. */
    INVALID_REGEX,
    /** REGEX defTarget 이 {@code CategoryOwner.MASTER_CODE.allowedDefTargets()} 밖이다. */
    DEF_TARGET_NOT_ALLOWED,
    /** 저장된 defKind 와 다른 defKind 로 changeCategory 를 요청했다. */
    DEF_KIND_IMMUTABLE,
    /** 이 버전에 이미 유효한 cate_id 로 addCategory 를 요청했다. */
    CATE_ID_OVERLAP,
    /** changeCategory·closeCategory 대상 cate_id 가 이 버전에 없다. */
    CATE_NOT_FOUND,
    /** addCategoryMembers 에 이 버전에 없는 코드가 섞였다. */
    MEMBER_CODE_NOT_FOUND
}
