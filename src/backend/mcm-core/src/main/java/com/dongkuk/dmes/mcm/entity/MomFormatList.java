package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.LocalDate;

/**
 * FORMAT 목록 — TB_MCM_MOM_FORMAT_LIST (신축 MCMAPUSER 스키마) JPA Entity.
 *
 * <p>설계서: `docs/mcm/design/interfaceList/interfaceList_분석리포트.md` §7 (7 컬럼 + AUDIT 9).
 * 신축 DDL: `docs/mcm/002_인터페이스/create_tables_mcmapuser.sql` Line 13-37.
 *
 * <p>복합 PK: (FORMAT_ID, FORMAT_VER) — {@link MomFormatListId} @EmbeddedId.
 * Q-012 결정: cia/InterfaceList 화면은 FORMAT_VER = 1 고정 (mui As-Is 1:1).
 *
 * <p>화면 매핑: cia/InterfaceList 의 그리드 G-004 (FORMAT ID) + G-005 (FORMAT 명) 매핑.
 * 다중 버전 관리 = cib/InterfaceFormatList 화면 책임.
 *
 * <p>AUDIT: mcm-core {@link McmAuditEntity} 상속.
 */
@Entity
@Table(name = "TB_MCM_MOM_FORMAT_LIST", schema = "MCMAPUSER")
public class MomFormatList extends McmAuditEntity {

    /** PK (FORMAT_ID, FORMAT_VER) — 복합키. */
    @EmbeddedId
    private MomFormatListId id;

    /** FORMAT 명 (G-005 FORMAT 명). VARCHAR(120). */
    @Column(name = "FORMAT_NM", length = 120)
    private String formatNm;

    /** FORMAT 설명. VARCHAR(300). */
    @Column(name = "FORMAT_DESC", length = 300)
    private String formatDesc;

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

    public MomFormatListId getId() { return id; }
    public void setId(MomFormatListId id) { this.id = id; }

    public String getFormatNm() { return formatNm; }
    public void setFormatNm(String formatNm) { this.formatNm = formatNm; }

    public String getFormatDesc() { return formatDesc; }
    public void setFormatDesc(String formatDesc) { this.formatDesc = formatDesc; }

    public String getUseTp() { return useTp; }
    public void setUseTp(String useTp) { this.useTp = useTp; }

    public LocalDate getStartActiveDate() { return startActiveDate; }
    public void setStartActiveDate(LocalDate startActiveDate) { this.startActiveDate = startActiveDate; }

    public LocalDate getEndActiveDate() { return endActiveDate; }
    public void setEndActiveDate(LocalDate endActiveDate) { this.endActiveDate = endActiveDate; }
}
