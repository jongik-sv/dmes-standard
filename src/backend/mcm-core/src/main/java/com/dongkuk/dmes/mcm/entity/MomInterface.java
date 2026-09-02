package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.LocalDate;

/**
 * Interface 관리 — TB_MCM_MOM_INTERFACES (신축 MCMAPUSER 스키마) JPA Entity.
 *
 * <p>설계서: `docs/mcm/design/interfaceList/interfaceList_분석리포트.md` §7 (16 컬럼 + AUDIT 9).
 * 신축 DDL: `docs/mcm/002_인터페이스/create_tables_mcmapuser.sql` Line 67-100.
 *
 * <p>복합 PK: (INTERFACE_ID, TRANSACTION_CODE) — {@link MomInterfaceId} @EmbeddedId.
 *
 * <p>화면 매핑: cia/InterfaceList — 16 컬럼 모두 본 Entity 매핑.
 * Q-007 (송수신지역) / Q-002/Q-003/Q-004 (수신 IF_TP / RECV_TABLE_ID) 결정으로 화면 미노출이나
 * **DB 컬럼은 유지** (운영 정책 변경 시 그리드 복귀 가능).
 *
 * <p>AUDIT: mcm-core {@link McmAuditEntity} 상속 (C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID /
 * U_USR_ID / U_AT / U_SVC_ID / U_PGM_ID / VER 9 컬럼 — McmAuditListener 자동 주입).
 */
@Entity
@Table(name = "TB_MCM_MOM_INTERFACES", schema = "MCMAPUSER")
public class MomInterface extends McmAuditEntity {

    /** PK (INTERFACE_ID, TRANSACTION_CODE) — 복합키. */
    @EmbeddedId
    private MomInterfaceId id;

    /** 인터페이스 설명 (G-007 INTERFACE 명). VARCHAR(300). */
    @Column(name = "INTERFACE_DESC", length = 300)
    private String interfaceDesc;

    /**
     * 인터페이스 프로토콜 (G-008 PROTOCOL) — Q-001 결정: HTTP / DB 2값만.
     * caravan-hub 로 보내는 방식 결정 컬럼 (DB INSERT vs API 호출). VARCHAR(20).
     */
    @Column(name = "INTERFACE_PROTOCOL", length = 20)
    private String interfaceProtocol;

    /** FK — FORMAT_ID → TB_MCM_MOM_FORMAT_LIST.FORMAT_ID (G-004 FORMAT ID). VARCHAR(50). */
    @Column(name = "FORMAT_ID", length = 50)
    private String formatId;

    /**
     * 송신 사업장 (Q-007: 화면 미노출, DB 컬럼 유지). VARCHAR(2).
     * 운영 환경 단일 사업장 가정 — 운영 정책 변경 시 그리드 복귀 가능.
     */
    @Column(name = "SEND_WORKS_CD", length = 2)
    private String sendWorksCd;

    /**
     * 송신 모듈 ID (G-010 송신모듈) — Q-006 결정: Edit 박스 입력 (LoV X).
     * 예: "MPP" / "MQC" 사용자 직접 입력. VARCHAR(20).
     */
    @Column(name = "SEND_MODULE_ID", length = 20)
    private String sendModuleId;

    /**
     * 송신 I/F 방식 (G-011 I/F 방식) — Q-002 결정: HTTP / DB 2값만 (송신만 화면 노출).
     * VARCHAR(20).
     */
    @Column(name = "SEND_IF_TP", length = 20)
    private String sendIfTp;

    /** 송신 인터페이스 테이블 ID (G-012 송신 TABLE명). VARCHAR(50). */
    @Column(name = "SEND_TABLE_ID", length = 50)
    private String sendTableId;

    /**
     * 수신 사업장 (Q-007: 화면 미노출, DB 컬럼 유지). VARCHAR(2).
     */
    @Column(name = "RECV_WORKS_CD", length = 2)
    private String recvWorksCd;

    /** 수신 모듈 ID (G-013 수신모듈) — Q-006 결정: Edit 박스. VARCHAR(20). */
    @Column(name = "RECV_MODULE_ID", length = 20)
    private String recvModuleId;

    /**
     * 수신 I/F 방식 (Q-002/Q-003: 화면 미노출, DB 컬럼 유지).
     * 수신은 caravan-hub 가 명시 — MES는 무조건 caravan-hub API 호출. VARCHAR(20).
     */
    @Column(name = "RECV_IF_TP", length = 20)
    private String recvIfTp;

    /**
     * 수신 인터페이스 테이블 ID (Q-004: 화면 미노출, DB 컬럼 유지). VARCHAR(50).
     */
    @Column(name = "RECV_TABLE_ID", length = 50)
    private String recvTableId;

    /** 사용 여부 (G-009 사용 여부, V-003 필수) — Y/N. VARCHAR(1) NOT NULL. */
    @Column(name = "USE_TP", length = 1, nullable = false)
    private String useTp;

    /**
     * 유효 개시일 (G-014). 행추가 기본값 = 현재 시각 (Service 단에서 set).
     * 신축 DDL = DATE 타입 → Java LocalDate.
     */
    @Column(name = "START_ACTIVE_DATE")
    private LocalDate startActiveDate;

    /**
     * 유효 기한일 (G-015). 행추가 기본값 = `9999-12-31` (As-Is `99991231` 의 DATE 변환).
     * 신축 DDL = DATE 타입 → Java LocalDate.
     */
    @Column(name = "END_ACTIVE_DATE")
    private LocalDate endActiveDate;

    // ── getter / setter ──

    public MomInterfaceId getId() { return id; }
    public void setId(MomInterfaceId id) { this.id = id; }

    public String getInterfaceDesc() { return interfaceDesc; }
    public void setInterfaceDesc(String interfaceDesc) { this.interfaceDesc = interfaceDesc; }

    public String getInterfaceProtocol() { return interfaceProtocol; }
    public void setInterfaceProtocol(String interfaceProtocol) { this.interfaceProtocol = interfaceProtocol; }

    public String getFormatId() { return formatId; }
    public void setFormatId(String formatId) { this.formatId = formatId; }

    public String getSendWorksCd() { return sendWorksCd; }
    public void setSendWorksCd(String sendWorksCd) { this.sendWorksCd = sendWorksCd; }

    public String getSendModuleId() { return sendModuleId; }
    public void setSendModuleId(String sendModuleId) { this.sendModuleId = sendModuleId; }

    public String getSendIfTp() { return sendIfTp; }
    public void setSendIfTp(String sendIfTp) { this.sendIfTp = sendIfTp; }

    public String getSendTableId() { return sendTableId; }
    public void setSendTableId(String sendTableId) { this.sendTableId = sendTableId; }

    public String getRecvWorksCd() { return recvWorksCd; }
    public void setRecvWorksCd(String recvWorksCd) { this.recvWorksCd = recvWorksCd; }

    public String getRecvModuleId() { return recvModuleId; }
    public void setRecvModuleId(String recvModuleId) { this.recvModuleId = recvModuleId; }

    public String getRecvIfTp() { return recvIfTp; }
    public void setRecvIfTp(String recvIfTp) { this.recvIfTp = recvIfTp; }

    public String getRecvTableId() { return recvTableId; }
    public void setRecvTableId(String recvTableId) { this.recvTableId = recvTableId; }

    public String getUseTp() { return useTp; }
    public void setUseTp(String useTp) { this.useTp = useTp; }

    public LocalDate getStartActiveDate() { return startActiveDate; }
    public void setStartActiveDate(LocalDate startActiveDate) { this.startActiveDate = startActiveDate; }

    public LocalDate getEndActiveDate() { return endActiveDate; }
    public void setEndActiveDate(LocalDate endActiveDate) { this.endActiveDate = endActiveDate; }
}
