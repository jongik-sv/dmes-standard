package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/**
 * 마스터데이터 수신 로그 — {@code TB_MDM_DATA_RECV}(TSK-07-01 design.md §2·§6.0, ERD {@code
 * 05-master-data.sql}). 보류 테이블(F3·F4·D2) — DDL·엔티티는 만들되 서비스·화면·리포지토리는 없다
 * (D-019 원칙, 수신 처리 로직은 이 Task 밖). {@code RECV_ID} 는 IDENTITY 채번({@code ID_AI} 토큰).
 *
 * <p>{@code MARU_DATA_ID}({@code TB_MDM_DATA})·{@code SOURCE_SYSTEM}({@code TB_MDM_SYSTEM}) 모두 FK
 * 이지만 연관관계 매핑을 쓰지 않는다(불변 규칙 9). 예약어 칼럼 {@code RESULT} 는 방언-중립 백틱 인용으로
 * 매핑한다(naming-dialect-rules §1, TSK-05-01 D1 선례).
 */
@Entity
@Table(name = "TB_MDM_DATA_RECV")
public class MdmDataRecv extends CactusAuditEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "RECV_ID")
    private Long recvId;

    /** {@code TB_MDM_DATA.MARU_DATA_ID} 를 가리키는 FK. 원시 필드로만 둔다(불변 규칙 9). */
    @Column(name = "MARU_DATA_ID", length = 50)
    private String maruDataId;

    /** {@code TB_MDM_SYSTEM.SYSTEM_CODE} 를 가리키는 FK. 원시 필드로만 둔다(불변 규칙 9). */
    @Column(name = "SOURCE_SYSTEM", length = 20, nullable = false)
    private String sourceSystem;

    @Column(name = "SOURCE_REF", length = 50)
    private String sourceRef;

    @Column(name = "RECEIVED_AT", nullable = false)
    private LocalDateTime receivedAt;

    @Column(name = "BODY", nullable = false)
    private String body;

    @Column(name = "ROW_COUNT", nullable = false)
    private int rowCount;

    /** 예약어 칼럼(naming-dialect-rules §1, TSK-05-01 D1 선례). */
    @Column(name = "`RESULT`", length = 20)
    private String result;

    @Column(name = "RESULT_DETAIL")
    private String resultDetail;

    @Column(name = "CHG_SEQ")
    private Long chgSeq;

    @Column(name = "PROCESSED_AT")
    private LocalDateTime processedAt;

    protected MdmDataRecv() {
        // JPA 기본 생성자
    }

    public MdmDataRecv(String sourceSystem, LocalDateTime receivedAt, String body) {
        this.sourceSystem = sourceSystem;
        this.receivedAt = MdmEntityTimes.seconds(receivedAt);
        this.body = body;
    }

    public Long getRecvId() { return recvId; }
    public String getMaruDataId() { return maruDataId; }
    public String getSourceSystem() { return sourceSystem; }
    public String getSourceRef() { return sourceRef; }
    public LocalDateTime getReceivedAt() { return receivedAt; }
    public String getBody() { return body; }
    public int getRowCount() { return rowCount; }
    public String getResult() { return result; }
    public String getResultDetail() { return resultDetail; }
    public Long getChgSeq() { return chgSeq; }
    public LocalDateTime getProcessedAt() { return processedAt; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
    public void setSourceRef(String v) { this.sourceRef = v; }
    public void setRowCount(int v) { this.rowCount = v; }
    public void setResult(String v) { this.result = v; }
    public void setResultDetail(String v) { this.resultDetail = v; }
    public void setChgSeq(Long v) { this.chgSeq = v; }
    public void setProcessedAt(LocalDateTime v) { this.processedAt = MdmEntityTimes.seconds(v); }
}
