package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;

/**
 * Transaction Code 목록 — TB_MCM_MOM_TC_LIST (신축 MCMAPUSER 스키마) JPA Entity.
 *
 * <p>설계서: `docs/mcm/design/interfaceList/interfaceList_분석리포트.md` §7 (7 컬럼 + AUDIT 9).
 * 신축 DDL: `docs/mcm/002_인터페이스/create_tables_mcmapuser.sql` Line 102-126.
 *
 * <p>PK: (TRANSACTION_CODE) — 단순 키.
 *
 * <p>화면 매핑: cia/InterfaceList 의 그리드 G-002 (TC-CODE) + G-003 (TC 명) 매핑.
 * 본 화면에서 저장 시 함께 UPSERT (Q-005 결정: editable 유지). FK → TB_MCM_MOM_FORMAT_LIST.FORMAT_ID.
 *
 * <p>AUDIT: mcm-core {@link McmAuditEntity} 상속.
 */
@Entity
@Table(name = "TB_MCM_MOM_TC_LIST", schema = "MCMAPUSER")
public class MomTcList extends McmAuditEntity {

    /** PK — TRANSACTION_CODE (G-002 TC-CODE, V-001 필수). VARCHAR(50). */
    @Id
    @Column(name = "TRANSACTION_CODE", length = 50, nullable = false)
    private String transactionCode;

    /** Transaction 명 (G-003 TC 명). VARCHAR(120). */
    @Column(name = "TRANSACTION_NM", length = 120)
    private String transactionNm;

    /** Transaction 설명. VARCHAR(300). */
    @Column(name = "TRANSACTION_DESC", length = 300)
    private String transactionDesc;

    /** FK → TB_MCM_MOM_FORMAT_LIST.FORMAT_ID. VARCHAR(50) NOT NULL. */
    @Column(name = "FORMAT_ID", length = 50, nullable = false)
    private String formatId;

    /** 사용 여부 — Y/N. VARCHAR(1) NOT NULL. */
    @Column(name = "USE_TP", length = 1, nullable = false)
    private String useTp;

    /** 유효 개시일. */
    @Column(name = "START_ACTIVE_DATE")
    private LocalDate startActiveDate;

    /** 유효 기한일. */
    @Column(name = "END_ACTIVE_DATE")
    private LocalDate endActiveDate;

    // ── getter / setter ──

    public String getTransactionCode() { return transactionCode; }
    public void setTransactionCode(String transactionCode) { this.transactionCode = transactionCode; }

    public String getTransactionNm() { return transactionNm; }
    public void setTransactionNm(String transactionNm) { this.transactionNm = transactionNm; }

    public String getTransactionDesc() { return transactionDesc; }
    public void setTransactionDesc(String transactionDesc) { this.transactionDesc = transactionDesc; }

    public String getFormatId() { return formatId; }
    public void setFormatId(String formatId) { this.formatId = formatId; }

    public String getUseTp() { return useTp; }
    public void setUseTp(String useTp) { this.useTp = useTp; }

    public LocalDate getStartActiveDate() { return startActiveDate; }
    public void setStartActiveDate(LocalDate startActiveDate) { this.startActiveDate = startActiveDate; }

    public LocalDate getEndActiveDate() { return endActiveDate; }
    public void setEndActiveDate(LocalDate endActiveDate) { this.endActiveDate = endActiveDate; }
}
