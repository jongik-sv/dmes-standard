package com.dongkuk.dmes.mcm.favorite.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * 즐겨찾기 메뉴(leaf) — {@code TB_MCM_SEC_USER_FAVORITE} (DMES Section 정본 2테이블 중 메뉴).
 *
 * <p>스키마 = {@code MCMAPUSER}. PK 복합 = (USER_ID, FVT_FOLD_ID, FULL_ID, MENU_ID, MENU_SEQ).
 *
 * <p>{@code FULL_ID} = portal-shell 의 {@code componentPath}({@code ${PARENT_MENU_ID}/${OBJECT_ID}})
 * = mui {@code FULL_ID} 등가의 안정 식별자. 토글/하이라이트 매칭은 URL 조립이 아닌 본 값으로 한다.
 * 감사컬럼은 {@link McmAuditEntity} (cactus 규약 9 컬럼).
 */
@Entity
@Table(name = "TB_MCM_SEC_USER_FAVORITE", schema = "MCMAPUSER")
@IdClass(SecUserFavoriteId.class)
public class SecUserFavorite extends McmAuditEntity {

    @Id
    @Column(name = "USER_ID", length = 30, nullable = false)
    private String userId;

    /** 소속 폴더 ID (FK → {@link SecUserFavoriteFold}). */
    @Id
    @Column(name = "FVT_FOLD_ID", length = 30, nullable = false)
    private String fvtFoldId;

    /** 메뉴 안정 식별자 = componentPath ({@code ${parentMenuId}/${objectId}}). */
    @Id
    @Column(name = "FULL_ID", length = 200, nullable = false)
    private String fullId;

    @Id
    @Column(name = "MENU_ID", length = 30, nullable = false)
    private String menuId;

    @Id
    @Column(name = "MENU_SEQ", nullable = false)
    private Integer menuSeq;

    /** 폴더 내 즐겨찾기 순서. */
    @Column(name = "FVT_SEQ", nullable = false)
    private Integer fvtSeq;

    public SecUserFavorite() {}

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getFvtFoldId() { return fvtFoldId; }
    public void setFvtFoldId(String fvtFoldId) { this.fvtFoldId = fvtFoldId; }
    public String getFullId() { return fullId; }
    public void setFullId(String fullId) { this.fullId = fullId; }
    public String getMenuId() { return menuId; }
    public void setMenuId(String menuId) { this.menuId = menuId; }
    public Integer getMenuSeq() { return menuSeq; }
    public void setMenuSeq(Integer menuSeq) { this.menuSeq = menuSeq; }
    public Integer getFvtSeq() { return fvtSeq; }
    public void setFvtSeq(Integer fvtSeq) { this.fvtSeq = fvtSeq; }
}
