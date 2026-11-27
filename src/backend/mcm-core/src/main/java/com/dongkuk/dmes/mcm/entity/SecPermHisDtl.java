/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-27
 * 내용: SecPermHisDtl 엔티티 — TB_MCM_SEC_PERM_HIS_DTL (권한 작업대 적용 이력 줄, 복합 PK)
 */
package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.util.Objects;

/**
 * 권한 작업대 적용 이력 줄 — {@code TB_MCM_SEC_PERM_HIS_DTL}(V20, D23). 머리는 {@link SecPermHis}.
 *
 * <p>한 줄 = 변경 1건({@code security.perm.PermChange} 와 같은 뜻).
 * {@code targetTp} = USER_GRP(key1 사용자·key2 그룹) · GRP_ROLE(key1 그룹·key2 직무) · ROLE_OBJ(key1 직무·key2 오브젝트),
 * {@code opTp} = ADD·DEL·UPD(DB CHECK 제약).
 */
@Entity
@Table(name = "TB_MCM_SEC_PERM_HIS_DTL", schema = "MCMAPUSER")
@IdClass(SecPermHisDtl.PK.class)
public class SecPermHisDtl extends McmAuditEntity {

    /** PK#1 — 적용 아이디(FK → TB_MCM_SEC_PERM_HIS). VARCHAR(40). */
    @Id
    @Column(name = "APPLY_ID", length = 40, nullable = false)
    private String applyId;

    /** PK#2 — 순번(1부터). NUMBER(10). */
    @Id
    @Column(name = "SEQ_NO", nullable = false)
    private Integer seqNo;

    /** 대상 구분 — USER_GRP·GRP_ROLE·ROLE_OBJ. VARCHAR(10). */
    @Column(name = "TARGET_TP", length = 10, nullable = false)
    private String targetTp;

    /** 대상 키 1. VARCHAR(100). */
    @Column(name = "KEY1", length = 100)
    private String key1;

    /** 대상 키 2. VARCHAR(100). */
    @Column(name = "KEY2", length = 100)
    private String key2;

    /** 변경 구분 — ADD·DEL·UPD. VARCHAR(3). */
    @Column(name = "OP_TP", length = 3, nullable = false)
    private String opTp;

    /** 변경 전 값(ROLE_OBJ 는 버튼·팝업 값 요약). VARCHAR(2000). */
    @Column(name = "BEFORE_VAL", length = 2000)
    private String beforeVal;

    /** 변경 후 값. VARCHAR(2000). */
    @Column(name = "AFTER_VAL", length = 2000)
    private String afterVal;

    public SecPermHisDtl() {}

    // ── getter / setter ──

    public String getApplyId() { return applyId; }
    public void setApplyId(String applyId) { this.applyId = applyId; }

    public Integer getSeqNo() { return seqNo; }
    public void setSeqNo(Integer seqNo) { this.seqNo = seqNo; }

    public String getTargetTp() { return targetTp; }
    public void setTargetTp(String targetTp) { this.targetTp = targetTp; }

    public String getKey1() { return key1; }
    public void setKey1(String key1) { this.key1 = key1; }

    public String getKey2() { return key2; }
    public void setKey2(String key2) { this.key2 = key2; }

    public String getOpTp() { return opTp; }
    public void setOpTp(String opTp) { this.opTp = opTp; }

    public String getBeforeVal() { return beforeVal; }
    public void setBeforeVal(String beforeVal) { this.beforeVal = beforeVal; }

    public String getAfterVal() { return afterVal; }
    public void setAfterVal(String afterVal) { this.afterVal = afterVal; }

    /** 복합 PK({@code @IdClass}) — (applyId, seqNo). */
    public static class PK implements Serializable {
        private static final long serialVersionUID = 1L;

        private String applyId;
        private Integer seqNo;

        public PK() {}

        public PK(String applyId, Integer seqNo) {
            this.applyId = applyId;
            this.seqNo = seqNo;
        }

        public String getApplyId() { return applyId; }
        public void setApplyId(String applyId) { this.applyId = applyId; }

        public Integer getSeqNo() { return seqNo; }
        public void setSeqNo(Integer seqNo) { this.seqNo = seqNo; }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof PK pk)) return false;
            return Objects.equals(applyId, pk.applyId) && Objects.equals(seqNo, pk.seqNo);
        }

        @Override
        public int hashCode() { return Objects.hash(applyId, seqNo); }
    }
}
