package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.Length;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.Nationalized;
import org.hibernate.type.SqlTypes;

/**
 * TC Error 로그 — TB_MCM_MOM_TC_ERROR (MCMAPUSER) JPA Entity.
 *
 * <p>설계서: `docs/mcm/design/tcErrorList/tcErrorList_분석리포트.md` §9.1 (12 비즈니스 컬럼 + AUDIT 9).
 *
 * <p>PK: (SQ_VAL) — 단순 키. INSERT 는 caravan-hub/caravan 수신 실패 적재(cactus DmomErrorLogger)에서 발생,
 * 본 화면(tcErrorList)은 <b>조회 전용</b>. G-005(발생일시)는 AUDIT C_AT 매핑(DEC-04, As-Is CREATION_TIMESTAMP).
 *
 * <p>AUDIT: {@link McmAuditEntity} 상속 (생성/수정/버전 audit 9 컬럼).
 */
@Entity
@Table(name = "TB_MCM_MOM_TC_ERROR", schema = "MCMAPUSER")
public class MomTcError extends McmAuditEntity {

    /** PK — Log ID. NUMERIC(19) (SEQ_MCM_MOM_TC_ERROR 채번). 그리드 미표시 — P-001 전달(pSqVal).
     *  DB 실제 타입 numeric(19,0) 정합 — Long 기본 매핑(bigint)이면 ddl-auto update 가 매 기동마다
     *  numeric→bigint alter 를 시도하다 PK 종속으로 실패(WARN). JdbcTypeCode NUMERIC 고정으로 제거. */
    @Id
    @JdbcTypeCode(SqlTypes.NUMERIC)
    @Column(name = "SQ_VAL", nullable = false, precision = 19, scale = 0)
    private Long sqVal;

    /** TRANSACTION_CODE (G-001 / TC_LIST 조인키 / S-005 / P-001). VARCHAR(50). */
    @Column(name = "TRANSACTION_CODE", length = 50)
    private String transactionCode;

    /** 인터페이스 ID (G-004 / S-003 부문구분 LIKE). VARCHAR(100). */
    @Column(name = "INTERFACE_ID", length = 100)
    private String interfaceId;

    /** 전송 Protocol (미표시). VARCHAR(20). */
    @Column(name = "INTERFACE_PROTOCOL", length = 20)
    private String interfaceProtocol;

    /** 전문 내용 (그리드 미표시 — P-001 전달 pInterfaceMsg). 대용량 Unicode text. */
    @Nationalized
    @Column(name = "INTERFACE_MSG", length = Length.LONG32)
    private String interfaceMsg;

    /** 키 데이터 1 (미사용). VARCHAR(100). */
    @Column(name = "KEY_DATA1", length = 100)
    private String keyData1;

    /** 키 데이터 2 (미사용). VARCHAR(100). */
    @Column(name = "KEY_DATA2", length = 100)
    private String keyData2;

    /** 키 데이터 3 (미사용). VARCHAR(100). */
    @Column(name = "KEY_DATA3", length = 100)
    private String keyData3;

    /** Error 유형 (G-006). VARCHAR(3). */
    @Column(name = "ERROR_TYPE", length = 3)
    private String errorType;

    /** 에러 코드 (G-007 / S-004). VARCHAR(100). */
    @Column(name = "ERROR_CODE", length = 100)
    private String errorCode;

    /** 에러 내용 (G-008). VARCHAR(1000). */
    @Column(name = "ERROR_MSG", length = 1000)
    private String errorMsg;

    /** Error 처리 상태 코드 (미사용 — Q-103 As-Is 동일). VARCHAR(1). */
    @Column(name = "ERROR_STATUS_CODE", length = 1)
    private String errorStatusCode;

    // ── getter / setter ──

    public Long getSqVal() { return sqVal; }
    public void setSqVal(Long sqVal) { this.sqVal = sqVal; }

    public String getTransactionCode() { return transactionCode; }
    public void setTransactionCode(String transactionCode) { this.transactionCode = transactionCode; }

    public String getInterfaceId() { return interfaceId; }
    public void setInterfaceId(String interfaceId) { this.interfaceId = interfaceId; }

    public String getInterfaceProtocol() { return interfaceProtocol; }
    public void setInterfaceProtocol(String interfaceProtocol) { this.interfaceProtocol = interfaceProtocol; }

    public String getInterfaceMsg() { return interfaceMsg; }
    public void setInterfaceMsg(String interfaceMsg) { this.interfaceMsg = interfaceMsg; }

    public String getKeyData1() { return keyData1; }
    public void setKeyData1(String keyData1) { this.keyData1 = keyData1; }

    public String getKeyData2() { return keyData2; }
    public void setKeyData2(String keyData2) { this.keyData2 = keyData2; }

    public String getKeyData3() { return keyData3; }
    public void setKeyData3(String keyData3) { this.keyData3 = keyData3; }

    public String getErrorType() { return errorType; }
    public void setErrorType(String errorType) { this.errorType = errorType; }

    public String getErrorCode() { return errorCode; }
    public void setErrorCode(String errorCode) { this.errorCode = errorCode; }

    public String getErrorMsg() { return errorMsg; }
    public void setErrorMsg(String errorMsg) { this.errorMsg = errorMsg; }

    public String getErrorStatusCode() { return errorStatusCode; }
    public void setErrorStatusCode(String errorStatusCode) { this.errorStatusCode = errorStatusCode; }
}
