package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * 수신 로그 처리 명세 — {@code TB_MDM_DATA_RECV_ITEM}(TSK-07-01 design.md §2·§6.0, ERD {@code
 * 05-master-data.sql}). 보류 테이블(F3·F4·D2) — DDL·엔티티는 만들되 서비스·화면·리포지토리는 없다
 * (D-019 원칙). 복합 PK 는 {@link MdmDataRecvItemId} 로 표현한다. 칼럼 {@code ACTION} 은 옛 방언의
 * 예약어라 백틱으로 인용했으나 Oracle 에서는 예약어가 아니어서 따옴표 없이 매핑한다(아래 필드 주석, oracle-1007).
 *
 * <p>{@code RECV_ID}({@code TB_MDM_DATA_RECV}) 는 FK 이지만 연관관계 매핑을 쓰지 않는다(불변 규칙 9).
 */
@Entity
@Table(name = "TB_MDM_DATA_RECV_ITEM")
@IdClass(MdmDataRecvItemId.class)
public class MdmDataRecvItem extends CactusAuditEntity {

    @Id
    @Column(name = "RECV_ID")
    private Long recvId;

    @Id
    @Column(name = "SEQ")
    private Integer seq;

    @Column(name = "CODE", length = 50)
    private String code;

    /** 옛 방언의 예약어 칼럼(naming-dialect-rules §1). Oracle 에서는 예약어가 아니라 따옴표 없이 쓴다 — 백틱이면 Spring 이름 전략이 소문자 "action" 으로 따옴표를 남겨 V1 의 대문자 칼럼과 어긋난다(ORA-00904). */
    @Column(name = "ACTION", length = 20)
    private String action;

    protected MdmDataRecvItem() {
        // JPA 기본 생성자
    }

    public MdmDataRecvItem(Long recvId, Integer seq) {
        this.recvId = recvId;
        this.seq = seq;
    }

    public Long getRecvId() { return recvId; }
    public Integer getSeq() { return seq; }
    public String getCode() { return code; }
    public String getAction() { return action; }

    public void setCode(String v) { this.code = v; }
    public void setAction(String v) { this.action = v; }
}
