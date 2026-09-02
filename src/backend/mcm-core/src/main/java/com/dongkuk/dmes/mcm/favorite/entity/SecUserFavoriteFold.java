package com.dongkuk.dmes.mcm.favorite.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * 즐겨찾기 폴더 — {@code TB_MCM_SEC_USER_FAVORITE_FOLD} (DMES Section 정본 2테이블 중 폴더).
 *
 * <p>스키마 = {@code MCMAPUSER}. PK 복합 = (USER_ID, FVT_FOLD_ID).
 * 감사컬럼은 Tibero 원본의 CREATED_OBJECT / DATA_END / ARCHIVE 계열을 폐기하고
 * mcm-core {@link McmAuditEntity} (cactus 규약 C_USR_ID/C_AT/.../VER 9 컬럼) 로 대체.
 */
@Entity
@Table(name = "TB_MCM_SEC_USER_FAVORITE_FOLD", schema = "MCMAPUSER")
@IdClass(SecUserFavoriteFoldId.class)
public class SecUserFavoriteFold extends McmAuditEntity {

    @Id
    @Column(name = "USER_ID", length = 30, nullable = false)
    private String userId;

    /** 폴더 ID — {@code FVT}+lpad(seq,3) (예: FVT000). */
    @Id
    @Column(name = "FVT_FOLD_ID", length = 10, nullable = false)
    private String fvtFoldId;

    @Column(name = "FVT_FOLD_NM", length = 30)
    private String fvtFoldNm;

    @Column(name = "FVT_FOLD_SEQ", nullable = false)
    private Integer fvtFoldSeq;

    public SecUserFavoriteFold() {}

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getFvtFoldId() { return fvtFoldId; }
    public void setFvtFoldId(String fvtFoldId) { this.fvtFoldId = fvtFoldId; }
    public String getFvtFoldNm() { return fvtFoldNm; }
    public void setFvtFoldNm(String fvtFoldNm) { this.fvtFoldNm = fvtFoldNm; }
    public Integer getFvtFoldSeq() { return fvtFoldSeq; }
    public void setFvtFoldSeq(Integer fvtFoldSeq) { this.fvtFoldSeq = fvtFoldSeq; }
}
