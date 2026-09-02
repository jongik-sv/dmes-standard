package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import org.hibernate.Length;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.Nationalized;
import org.hibernate.type.SqlTypes;

/**
 * TC 재전송 이력 — TB_MCM_MOM_TC_SEND (MCMAPUSER) JPA Entity.
 *
 * <p><b>사용자 결정 Q-100 = (A) 재전송 이력형 신설</b> (tcErrorList_개발체크리스트 §1 DEC-Q-100, 2026-06-02).
 * tcErrorList 의 RESEND_CNT(G-009) = {@code COUNT(* WHERE ERR_SQ_VAL = TC_ERROR.SQ_VAL)}.
 *
 * <p>적재 시점: TCErrorResendPop(P-001) 재전송 실행 시 1행 INSERT (본 tcErrorList 는 COUNT 조회만).
 *
 * <p>PK: (SEND_SQ_VAL). FK(논리): ERR_SQ_VAL → TB_MCM_MOM_TC_ERROR.SQ_VAL.
 * AUDIT: {@link McmAuditEntity} 상속.
 */
@Entity
@Table(name = "TB_MCM_MOM_TC_SEND", schema = "MCMAPUSER")
public class MomTcSend extends McmAuditEntity {

    /** PK — 재전송 이력 ID. NUMERIC(19). 채번 = MCMAPUSER.SEQ_MCM_MOM_TC_SEND.
     *  DB numeric(19,0) 정합 — JdbcTypeCode NUMERIC 고정 (bigint 매핑 시 ddl-auto update 가 PK 종속 alter 실패). */
    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "seqMomTcSend")
    @SequenceGenerator(name = "seqMomTcSend", sequenceName = "MCMAPUSER.SEQ_MCM_MOM_TC_SEND", allocationSize = 1)
    @JdbcTypeCode(SqlTypes.NUMERIC)
    @Column(name = "SEND_SQ_VAL", nullable = false, precision = 19, scale = 0)
    private Long sendSqVal;

    /** 원본 에러 로그 ID (FK → TB_MCM_MOM_TC_ERROR.SQ_VAL). NUMERIC(19). RESEND_CNT 집계 키.
     *  DB numeric(19,0) 정합 — JdbcTypeCode NUMERIC 고정 (bigint 매핑 시 IX_TB_MCM_MOM_TC_SEND_ERR 종속 alter 실패). */
    @JdbcTypeCode(SqlTypes.NUMERIC)
    @Column(name = "ERR_SQ_VAL", nullable = false, precision = 19, scale = 0)
    private Long errSqVal;

    /** 재전송 TRANSACTION_CODE. VARCHAR(50). */
    @Column(name = "TRANSACTION_CODE", length = 50)
    private String transactionCode;

    /** 재전송 인터페이스 ID. VARCHAR(100). */
    @Column(name = "INTERFACE_ID", length = 100)
    private String interfaceId;

    /** 재전송 전문 내용. 대용량 Unicode text. */
    @Nationalized
    @Column(name = "INTERFACE_MSG", length = Length.LONG32)
    private String interfaceMsg;

    /** 재전송 결과 코드 (S=성공/F=실패 등). VARCHAR(10). */
    @Column(name = "SEND_RESULT", length = 10)
    private String sendResult;

    // ── getter / setter ──

    public Long getSendSqVal() { return sendSqVal; }
    public void setSendSqVal(Long sendSqVal) { this.sendSqVal = sendSqVal; }

    public Long getErrSqVal() { return errSqVal; }
    public void setErrSqVal(Long errSqVal) { this.errSqVal = errSqVal; }

    public String getTransactionCode() { return transactionCode; }
    public void setTransactionCode(String transactionCode) { this.transactionCode = transactionCode; }

    public String getInterfaceId() { return interfaceId; }
    public void setInterfaceId(String interfaceId) { this.interfaceId = interfaceId; }

    public String getInterfaceMsg() { return interfaceMsg; }
    public void setInterfaceMsg(String interfaceMsg) { this.interfaceMsg = interfaceMsg; }

    public String getSendResult() { return sendResult; }
    public void setSendResult(String sendResult) { this.sendResult = sendResult; }
}
