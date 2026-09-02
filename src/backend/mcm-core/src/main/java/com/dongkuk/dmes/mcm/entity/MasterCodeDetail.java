package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * Master Code Detail — TB_MCM_CODE_DETAIL (As-Is) JPA Entity.
 *
 * <p>분석리포트 §9.2 본 컬럼 14 (PK 3 + 11 일반) + mcm-core audit 9 (상속).
 * CODE_VAL_REMARK 는 사용자 결정에 따라 보존 (As-Is Mapper 미사용이나 DDL 의미 유지).
 *
 * <p>스키마 = 원장 schema {@code MCM_SOURCE} (사용자 결정 2026-05-29 정정).
 * {@code MCMAPUSER} 는 운영 read 동기화본 / {@code MCM_BACKUP} 은 백업본 — 동기화 화면이 적재 책임 (별도 사이클).
 *
 * <p>PK 복합키 = (MASTER_CODE, CATEGORY_ID, CODE_VAL) — {@link MasterCodeDetailId}.
 *
 * <p>인용:
 * <ul>
 *   <li>분석 §9.2 컬럼 카탈로그</li>
 *   <li>As-Is Mapper.xml {@code UpdateTbMcmCodeDetail} (xml:186~200) /
 *       {@code DeleteTbMcmCodeDetail} (xml:202~207) /
 *       {@code InsertTbMcmCodeDetail} (xml:209~240)</li>
 *   <li>As-Is xfdl ds_grdDetail (xfdl:199~221)</li>
 * </ul>
 */
@Entity
@Table(name = "TB_MCM_CODE_DETAIL", schema = "MCM_SOURCE")
public class MasterCodeDetail extends McmAuditEntity {

    @EmbeddedId
    private MasterCodeDetailId id;

    /** 코드 의미 (xfdl GE-005, CellEssentail). VARCHAR(120). */
    @Column(name = "CODE_VAL_MEAN", length = 120)
    private String codeValMean;

    /** 코드 설명 (xfdl GE-009). VARCHAR(300). */
    @Column(name = "CODE_VAL_DESC", length = 300)
    private String codeValDesc;

    /** 코드 버전 — 행추가 시 "1" 하드코딩. */
    @Column(name = "CODE_VER", length = 50)
    private String codeVer;

    /** 정렬순서 (xfdl GE-008, mask format). */
    @Column(name = "SORT_SEQ")
    private Long sortSeq;

    /** 참조1 (GE-010 / 동적 콤보). */
    @Column(name = "CODE_VAL_REF1", length = 300)
    private String codeValRef1;

    /** 참조2 (GE-011). */
    @Column(name = "CODE_VAL_REF2", length = 300)
    private String codeValRef2;

    /** 참조3 (GE-012). */
    @Column(name = "CODE_VAL_REF3", length = 300)
    private String codeValRef3;

    /** 참조4 (GE-013). */
    @Column(name = "CODE_VAL_REF4", length = 300)
    private String codeValRef4;

    /** 참조5 (GE-014). */
    @Column(name = "CODE_VAL_REF5", length = 300)
    private String codeValRef5;

    /**
     * 코드 참조값 — DMES Excel sheet36 r17. As-Is Mapper 미사용이나 DDL 의미 보존
     * (사용자 결정 §12 결정 누적).
     */
    @Column(name = "CODE_VAL_REMARK", length = 300)
    private String codeValRemark;

    // ── getter / setter ──

    public MasterCodeDetailId getId() { return id; }
    public void setId(MasterCodeDetailId id) { this.id = id; }

    public String getCodeValMean() { return codeValMean; }
    public void setCodeValMean(String codeValMean) { this.codeValMean = codeValMean; }

    public String getCodeValDesc() { return codeValDesc; }
    public void setCodeValDesc(String codeValDesc) { this.codeValDesc = codeValDesc; }

    public String getCodeVer() { return codeVer; }
    public void setCodeVer(String codeVer) { this.codeVer = codeVer; }

    public Long getSortSeq() { return sortSeq; }
    public void setSortSeq(Long sortSeq) { this.sortSeq = sortSeq; }

    public String getCodeValRef1() { return codeValRef1; }
    public void setCodeValRef1(String codeValRef1) { this.codeValRef1 = codeValRef1; }

    public String getCodeValRef2() { return codeValRef2; }
    public void setCodeValRef2(String codeValRef2) { this.codeValRef2 = codeValRef2; }

    public String getCodeValRef3() { return codeValRef3; }
    public void setCodeValRef3(String codeValRef3) { this.codeValRef3 = codeValRef3; }

    public String getCodeValRef4() { return codeValRef4; }
    public void setCodeValRef4(String codeValRef4) { this.codeValRef4 = codeValRef4; }

    public String getCodeValRef5() { return codeValRef5; }
    public void setCodeValRef5(String codeValRef5) { this.codeValRef5 = codeValRef5; }

    public String getCodeValRemark() { return codeValRemark; }
    public void setCodeValRemark(String codeValRemark) { this.codeValRemark = codeValRemark; }
}
