package com.dongkuk.dmes.mcm.startpgm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * 사용자별 기본 화면 — {@code TB_MCM_SEC_USER_START_PGM}. 포털을 처음 시작할 때 자동으로 여는 화면 목록.
 *
 * <p>스키마 = {@code MCMAPUSER}. PK 복합 = (USER_ID, FULL_ID, MENU_ID, MENU_SEQ). 폴더 없는 평면 목록이다.
 *
 * <p>{@code FULL_ID} = portal-shell 의 {@code componentPath}({@code ${PARENT_MENU_ID}/${OBJECT_ID}}) —
 * 즐겨찾기({@code TB_MCM_SEC_USER_FAVORITE})와 같은 메뉴 안정 식별자다. {@code START_SEQ} 는 등록 순서(= 여는 순서).
 * 감사컬럼은 {@link McmAuditEntity} (cactus 규약 9 컬럼).
 */
@Entity
@Table(name = "TB_MCM_SEC_USER_START_PGM", schema = "MCMAPUSER")
@IdClass(SecUserStartPgmId.class)
public class SecUserStartPgm extends McmAuditEntity {

    @Id
    @Column(name = "USER_ID", length = 30, nullable = false)
    private String userId;

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

    /** 기본 화면 순서 — 등록할 때 사용자 내 최댓값 + 1. 포털은 이 순서대로 탭을 연다. */
    @Column(name = "START_SEQ", nullable = false)
    private Integer startSeq;

    public SecUserStartPgm() {}

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getFullId() { return fullId; }
    public void setFullId(String fullId) { this.fullId = fullId; }
    public String getMenuId() { return menuId; }
    public void setMenuId(String menuId) { this.menuId = menuId; }
    public Integer getMenuSeq() { return menuSeq; }
    public void setMenuSeq(Integer menuSeq) { this.menuSeq = menuSeq; }
    public Integer getStartSeq() { return startSeq; }
    public void setStartSeq(Integer startSeq) { this.startSeq = startSeq; }
}
