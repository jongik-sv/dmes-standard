package com.dongkuk.dmes.mcm.repository;

import com.fasterxml.jackson.annotation.JsonIgnore;

import java.sql.Clob;
import java.sql.SQLException;

/**
 * tcErrorList 조회 결과 projection (Spring Data native query interface projection).
 *
 * <p>{@link MomTcErrorRepository#search} 의 SELECT alias(따옴표 camelCase — Oracle 대문자화 방지)와 1:1 매핑.
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

    /**
     * INTERFACE_MSG(NCLOB) 원본 LOB — SQL 별칭 {@code "interfaceMsgLob"}. NClob 은 Clob 의 하위 형이라 그대로 담긴다.
     * 글은 {@link #getInterfaceMsg()} 로 읽는다(응답 직렬화에서는 뺀다).
     */
    @JsonIgnore
    Clob getInterfaceMsgLob();

    /**
     * 그리드 미표시 — P-001 전달(pInterfaceMsg). 재전송 팝업이 이 글을 그대로 다시 보내므로 자르지 않고 LOB 글 전체를 읽는다
     * (oracle-1007 c4 — NCLOB 은 투영이 String 으로 바꾸지 못해 LOB 로 받아 여기서 바꾼다). 조회와 같은 트랜잭션 안에서 부른다.
     */
    default String getInterfaceMsg() {
        Clob lob = getInterfaceMsgLob();
        if (lob == null) return null;
        try {
            long len = lob.length();
            return len == 0 ? "" : lob.getSubString(1, Math.toIntExact(len));
        } catch (SQLException e) {
            throw new IllegalStateException("INTERFACE_MSG(NCLOB) 를 읽지 못했습니다.", e);
        }
    }

    /** G-006 구분. */
    String getErrorType();

    /** G-007 CODE. */
    String getErrorCode();

    /** G-008 Message. */
    String getErrorMsg();

    /** G-005 발생일시 (AUDIT C_AT, As-Is CREATION_TIMESTAMP) — SQL TO_CHAR(,'YYYY-MM-DD HH24:MI:SS') 표시문자열 yyyy-MM-dd HH:mm:ss. */
    String getCreationTimestamp();

    /** G-009 재전송 횟수 (TB_MCM_MOM_TC_SEND COUNT — Q-100 A). */
    Long getResendCnt();
}
