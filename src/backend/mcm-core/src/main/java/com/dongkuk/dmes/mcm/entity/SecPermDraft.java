/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-27
 * 내용: SecPermDraft 엔티티 — TB_MCM_SEC_PERM_DRAFT (권한 작업대 초안, 관리자마다 1건)
 */
package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

/**
 * 권한 작업대 초안 — {@code TB_MCM_SEC_PERM_DRAFT}(V20, D22).
 *
 * <p>관리자({@code ownerUserId})마다 1건이다. {@code draftJson} = 변경 목록({@code PermChange} 배열 JSON),
 * {@code baseFpJson} = 초안이 처음 건드린 범위(사람·그룹·역할)의 현재 행 지문(SHA-256). 적용 때 지문을 다시 계산해
 * 다르면 {@code PERM_CONFLICT} 다.
 */
@Entity
@Table(name = "TB_MCM_SEC_PERM_DRAFT", schema = "MCMAPUSER")
public class SecPermDraft extends McmAuditEntity {

    /** PK — 초안 주인 사용자 아이디. VARCHAR(100). */
    @Id
    @Column(name = "OWNER_USER_ID", length = 100, nullable = false)
    private String ownerUserId;

    /** 변경 목록(JSON). CLOB. */
    @Lob
    @Column(name = "DRAFT_JSON")
    private String draftJson;

    /** 처음 건드린 범위의 현재 행 지문(JSON). CLOB. */
    @Lob
    @Column(name = "BASE_FP_JSON")
    private String baseFpJson;

    /** 변경 건수. NUMBER(10). */
    @Column(name = "CHANGE_CNT", nullable = false)
    private Integer changeCnt = 0;

    public SecPermDraft() {}

    public SecPermDraft(String ownerUserId) { this.ownerUserId = ownerUserId; }

    // ── getter / setter ──

    public String getOwnerUserId() { return ownerUserId; }
    public void setOwnerUserId(String ownerUserId) { this.ownerUserId = ownerUserId; }

    public String getDraftJson() { return draftJson; }
    public void setDraftJson(String draftJson) { this.draftJson = draftJson; }

    public String getBaseFpJson() { return baseFpJson; }
    public void setBaseFpJson(String baseFpJson) { this.baseFpJson = baseFpJson; }

    public Integer getChangeCnt() { return changeCnt; }
    public void setChangeCnt(Integer changeCnt) { this.changeCnt = changeCnt; }
}
