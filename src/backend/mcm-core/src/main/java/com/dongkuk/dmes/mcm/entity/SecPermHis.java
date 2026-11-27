/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-27
 * 내용: SecPermHis 엔티티 — TB_MCM_SEC_PERM_HIS (권한 작업대 적용 이력 머리)
 */
package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 권한 작업대 적용 이력 머리 — {@code TB_MCM_SEC_PERM_HIS}(V20, D23). 줄은 {@link SecPermHisDtl}.
 * 「누가·언제·몇 건·몇 명에게」를 이 표 한 줄로 답한다. 작업대 적용만 기록한다.
 */
@Entity
@Table(name = "TB_MCM_SEC_PERM_HIS", schema = "MCMAPUSER")
public class SecPermHis extends McmAuditEntity {

    /** PK — 적용 아이디. VARCHAR(40). */
    @Id
    @Column(name = "APPLY_ID", length = 40, nullable = false)
    private String applyId;

    /** 적용자 아이디. VARCHAR(100). */
    @Column(name = "APPLY_USER_ID", length = 100, nullable = false)
    private String applyUserId;

    /** 적용일시(KST). TIMESTAMP(6). */
    @Column(name = "APPLY_AT", nullable = false)
    private LocalDateTime applyAt;

    /** 변경 건수. */
    @Column(name = "CHANGE_CNT", nullable = false)
    private Integer changeCnt = 0;

    /** 권한을 얻은 사용자 수. */
    @Column(name = "GAIN_USER_CNT", nullable = false)
    private Integer gainUserCnt = 0;

    /** 권한을 잃은 사용자 수. */
    @Column(name = "LOSE_USER_CNT", nullable = false)
    private Integer loseUserCnt = 0;

    /** 적용 메모. VARCHAR(1000). */
    @Column(name = "APPLY_MEMO", length = 1000)
    private String applyMemo;

    public SecPermHis() {}

    // ── getter / setter ──

    public String getApplyId() { return applyId; }
    public void setApplyId(String applyId) { this.applyId = applyId; }

    public String getApplyUserId() { return applyUserId; }
    public void setApplyUserId(String applyUserId) { this.applyUserId = applyUserId; }

    public LocalDateTime getApplyAt() { return applyAt; }
    public void setApplyAt(LocalDateTime applyAt) { this.applyAt = applyAt; }

    public Integer getChangeCnt() { return changeCnt; }
    public void setChangeCnt(Integer changeCnt) { this.changeCnt = changeCnt; }

    public Integer getGainUserCnt() { return gainUserCnt; }
    public void setGainUserCnt(Integer gainUserCnt) { this.gainUserCnt = gainUserCnt; }

    public Integer getLoseUserCnt() { return loseUserCnt; }
    public void setLoseUserCnt(Integer loseUserCnt) { this.loseUserCnt = loseUserCnt; }

    public String getApplyMemo() { return applyMemo; }
    public void setApplyMemo(String applyMemo) { this.applyMemo = applyMemo; }
}
