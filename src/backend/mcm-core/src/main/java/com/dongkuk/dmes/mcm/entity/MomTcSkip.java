package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;

/**
 * 전문(TC) SKIP 설정 — TB_MCM_MOM_TC_SKIP (신축 MCMAPUSER 스키마) JPA Entity.
 *
 * <p>설계서: `docs/mcm/design/tcAbnormalData/tcAbnormalData_분석리포트.md` §7 (5 컬럼 + AUDIT 9 = 14).
 * 화면: cic/tcAbnormalData (비정상 TC 등록) — TC_LIST LEFT JOIN TC_SKIP 후 SKIP_LEVEL/USE_TP UPSERT.
 *
 * <p>PK: (TRANSACTION_CODE) — 단순 키. 논리 FK → TB_MCM_MOM_TC_LIST.TRANSACTION_CODE
 * (UPSERT 대상은 항상 TC_LIST 에 존재 — LEFT JOIN 결과만 화면에 표시).
 *
 * <p>SKIP_LEVEL LoV: N=NO ACTION / T=SKIP2 / Y=SKIP1 (기능 §3.2 LV-001).
 *
 * <p>AUDIT: mcm-core {@link McmAuditEntity} 상속 — C_/U_ 9 컬럼은 {@code McmAuditListener} 자동.
 */
@Entity
@Table(name = "TB_MCM_MOM_TC_SKIP", schema = "MCMAPUSER")
public class MomTcSkip extends McmAuditEntity {

    /** PK — TRANSACTION_CODE (전문ID). VARCHAR(50) NOT NULL. */
    @Id
    @Column(name = "TRANSACTION_CODE", length = 50, nullable = false)
    private String transactionCode;

    /** 스킵 레벨 — N=NO ACTION / T=SKIP2 / Y=SKIP1. VARCHAR(1) (DEC-06: 미선택 시 'N' 자동). */
    @Column(name = "SKIP_LEVEL", length = 1)
    private String skipLevel;

    /** 사용 여부 — Y/N. VARCHAR(1) NOT NULL (V-003). */
    @Column(name = "USE_TP", length = 1, nullable = false)
    private String useTp;

    /** 유효 개시일 (V-004: 미입력 시 BE 가 today 자동 set). */
    @Column(name = "START_ACTIVE_DATE")
    private LocalDate startActiveDate;

    /** 유효 기한일 (V-005: 미입력 시 BE 가 9999-12-31 자동 set). */
    @Column(name = "END_ACTIVE_DATE")
    private LocalDate endActiveDate;

    // ── getter / setter ──

    public String getTransactionCode() { return transactionCode; }
    public void setTransactionCode(String transactionCode) { this.transactionCode = transactionCode; }

    public String getSkipLevel() { return skipLevel; }
    public void setSkipLevel(String skipLevel) { this.skipLevel = skipLevel; }

    public String getUseTp() { return useTp; }
    public void setUseTp(String useTp) { this.useTp = useTp; }

    public LocalDate getStartActiveDate() { return startActiveDate; }
    public void setStartActiveDate(LocalDate startActiveDate) { this.startActiveDate = startActiveDate; }

    public LocalDate getEndActiveDate() { return endActiveDate; }
    public void setEndActiveDate(LocalDate endActiveDate) { this.endActiveDate = endActiveDate; }
}
