package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * 카테고리 관리 — TB_MCM_CODE_CATEGORY (As-Is) JPA Entity.
 *
 * <p>분석리포트 §9.1 본 컬럼 4 (MASTER_CODE / CATEGORY_ID / CATEGORY_NM / SORT_SEQ) +
 * mcm-core audit 9 (McmAuditEntity 상속).
 *
 * <p>스키마 = 원장 schema {@code MCM_SOURCE} (사용자 결정 2026-05-29 정정).
 * {@code MCMAPUSER} 는 운영 read 동기화본 / {@code MCM_BACKUP} 은 백업본 — 동기화 화면이 적재 책임 (별도 사이클).
 * 테이블명 대문자 prefix 유지.
 *
 * <p>As-Is {@code ref_Audit} fragment (CREATION_TIMESTAMP / CREATED_OBJECT_ID 등) 폐기 →
 * mcm-core {@link McmAuditEntity} 의 C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID /
 * U_USR_ID / U_AT / U_SVC_ID / U_PGM_ID / VER 9 컬럼 + JPA {@code @PrePersist} / {@code @PreUpdate}
 * 자동 채움 (mcm-core McmAuditListener — 결정 누적표 §12).
 *
 * <p>DATA_END_* / ARCHIVE_* 9 컬럼 (분석 §9.1 r19~r27) 은 To-Be 제거 (사용자 결정).
 *
 * <p>인용:
 * <ul>
 *   <li>분석리포트 §9.1 컬럼 카탈로그</li>
 *   <li>As-Is Mapper.xml {@code InsertTbMcmCodeCategory} / {@code UpdateTbMcmCodeCategory} (xml:54~69 / 39~46)</li>
 *   <li>As-Is xfdl ds_grdMain (xfdl:85~94, 6 컬럼)</li>
 *   <li>분석 §11 변환점 (Oracle → MSSQL, MERGE 미사용)</li>
 * </ul>
 */
@Entity
@Table(name = "TB_MCM_CODE_CATEGORY", schema = "MCM_SOURCE")
public class MasterCodeCategory extends McmAuditEntity {

    /** 복합 PK — (MASTER_CODE, CATEGORY_ID). */
    @EmbeddedId
    private MasterCodeCategoryId id;

    /**
     * 카테고리 명 — 분석 §9.1 #3 / xfdl col 6 / Mapper.xml:11 SELECT + xml:41 UPDATE SET +
     * xml:58 INSERT VALUES. As-Is editmaxlength 180.
     */
    @Column(name = "CATEGORY_NM", length = 180)
    private String categoryNm;

    /**
     * 정렬 — 분석 §9.1 #4 / xfdl col 7 / Mapper.xml:12 SELECT + xml:42 UPDATE SET +
     * xml:59 INSERT VALUES. sheet36 차용 NUMBER(8).
     */
    @Column(name = "SORT_SEQ", precision = 8)
    private Integer sortSeq;

    public MasterCodeCategoryId getId() { return id; }
    public void setId(MasterCodeCategoryId id) { this.id = id; }

    public String getCategoryNm() { return categoryNm; }
    public void setCategoryNm(String categoryNm) { this.categoryNm = categoryNm; }

    public Integer getSortSeq() { return sortSeq; }
    public void setSortSeq(Integer sortSeq) { this.sortSeq = sortSeq; }
}
