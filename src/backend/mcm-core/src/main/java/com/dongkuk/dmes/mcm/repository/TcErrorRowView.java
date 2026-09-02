package com.dongkuk.dmes.mcm.repository;

/**
 * tcErrorList 조회 결과 projection (Spring Data native query interface projection).
 *
 * <p>{@link MomTcErrorRepository#search} 의 SELECT alias(camelCase)와 1:1 매핑.
 * ({@code resultType=map}/projection 키는 underscore→camel 자동변환이 보장되지 않으므로
 * 네이티브 SELECT 에서 camelCase alias 를 명시한다 — cactus dmom 매퍼 버그 교훈.)
 *
 * <p>G-003(SNDR_INFORM_EDIT_DATE)은 DEC-Q-102(유효하지않음)로 제거 — 본 projection 에 없음.
 */
public interface TcErrorRowView {

    /** SQ_VAL — 그리드 미표시, P-001 전달. */
    Long getSqVal();

    /** G-001 전문ID. */
    String getTransactionCode();

    /** G-002 전문명 (TC_LIST LEFT JOIN). */
    String getTransactionNm();

    /** G-004 InterfaceID. */
    String getInterfaceId();

    /** 그리드 미표시 — P-001 전달(pInterfaceMsg). */
    String getInterfaceMsg();

    /** G-006 구분. */
    String getErrorType();

    /** G-007 CODE. */
    String getErrorCode();

    /** G-008 Message. */
    String getErrorMsg();

    /** G-005 발생일시 (AUDIT C_AT, As-Is CREATION_TIMESTAMP) — SQL CONVERT(,120) 표시문자열 yyyy-MM-dd HH:mm:ss. */
    String getCreationTimestamp();

    /** G-009 재전송 횟수 (TB_MCM_MOM_TC_SEND COUNT — Q-100 A). */
    Long getResendCnt();
}
