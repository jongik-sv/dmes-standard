package com.dongkuk.dmes.mcm.widget.memo.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * 메모장 위젯의 개인 메모 — 스펙 2026-10-02-widget-admin-generic §17.2. 사용자·배치 칸(instId)마다 하나.
 * CONTENT 는 20,000자까지라 LONG32VARCHAR(W-D30, {@code @Lob} 금지). 빈 메모는 Oracle 이 '' 를 NULL 로 저장하므로
 * CONTENT 는 NULL 을 허용하고 읽을 때 빈 문자열로 돌려준다. U_AT 이 마지막 저장 시각이다.
 */
@Entity
@Table(name = "TB_MCM_SEC_USER_WIDGET_MEMO", schema = "MCMAPUSER")
@IdClass(WidgetMemoId.class)
public class WidgetMemo extends McmAuditEntity {

    @Id
    @Column(name = "USER_ID", length = 50, nullable = false)
    private String userId;

    @Id
    @Column(name = "INST_ID", length = 40, nullable = false)
    private String instId;

    /** 정의 위젯 ID(def.xxxxxxxx). */
    @Column(name = "DEF_ID", length = 100, nullable = false)
    private String defId;

    /** text · md · html */
    @Column(name = "FMT", length = 10, nullable = false)
    private String fmt;

    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "CONTENT")
    private String content;

    public WidgetMemo() {}

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getInstId() { return instId; }
    public void setInstId(String instId) { this.instId = instId; }
    public String getDefId() { return defId; }
    public void setDefId(String defId) { this.defId = defId; }
    public String getFmt() { return fmt; }
    public void setFmt(String fmt) { this.fmt = fmt; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
}
