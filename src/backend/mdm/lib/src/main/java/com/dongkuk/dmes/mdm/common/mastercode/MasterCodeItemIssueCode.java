package com.dongkuk.dmes.mdm.common.mastercode;

/**
 * 코드 행 저장 검사·경미 수정 거부의 이슈 코드(TSK-06-03 design.md §1.2, D5). 우산 오류 코드는
 * {@code MdmErrorCode.CODE_SAVE_REJECTED}(MDM022)·{@code CODE_PATCH_REJECTED}(MDM023)이고, 세부는 이 이름을
 * {@code MdmCheckIssue.code} 에 싣는다.
 */
public enum MasterCodeItemIssueCode {
    /** 코드값이 비었다. */
    CODE_REQUIRED,
    /** 코드값·계층 칸 값에 콤마·공백이 있다(04:109·197). */
    CODE_FORBIDDEN_CHAR,
    /** lvl_cnt 뒤 칸에 값이 있다(04:112 첫째). */
    LVL_BEYOND_CNT,
    /** 값이 있는 칸 앞에 빈 칸이 있다(04:112 둘째). */
    LVL_GAP,
    /** 같은 값이 이미 다른 앞 칸 아래에 있다(04:112 셋째). */
    LVL_PARENT_MISMATCH,
    /** 라벨이 없는 번호의 추가 컬럼에 값이 있다(04:164). */
    ATTR_WITHOUT_LABEL,
    /** 코드값·계층 칸 값이 50자를 넘는다(VARCHAR2(50 CHAR) — ORA-12899 예방). */
    KEY_TOO_LONG,
    /** 이름·약칭·설명·추가 컬럼 값이 4000바이트를 넘는다(VARCHAR2(4000 BYTE) — ORA-12899 예방). */
    TEXT_TOO_LONG,
    /** 같은 코드의 구간이 겹친다(04:418). */
    SEGMENT_OVERLAP,
    /** 수정·삭제·되돌리기 대상 코드가 버전 V 에 없다. */
    CODE_NOT_FOUND,
    /** 원천이 EXTERNAL 인 마루 코드는 MDM 화면에서 저장하지 않는다(04:84·846). */
    SOURCE_EXTERNAL,
    /** 경미 수정 대상 행의 from_ver 버전이 RELEASED 가 아니다(04:541-542). */
    PATCH_NOT_RELEASED,
    /** 확정 전 버전이 같은 키를 이미 고쳤다 — DRAFT 에서 고친다(04:544, D8). */
    PATCH_KEY_CHANGED_IN_UNAPPLIED
}
