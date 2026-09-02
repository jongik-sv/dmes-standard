package com.dongkuk.dmes.cactus.web.request;

/**
 * 그리드 행의 변경 상태.
 * 저장/삭제 요청 시 각 행의 rowStatus 필드에 사용한다.
 */
public enum RowStatus {

    /** Create — 신규 행. 서버에서 PK 채번 */
    C,
    /** Update — 수정된 행. PK 필수 포함 */
    U,
    /** Delete — 삭제 대상 행. PK 필수 포함 */
    D,
    /** Read — 특수 용도 (전체행 검증, 부모-자식 동시 저장 시 참조행 전달 등) */
    R;
}
