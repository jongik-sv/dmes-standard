package com.dongkuk.dmes.mcm.searchdefaults.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * 사용자 조회 칸 기본값 — 화면(PAGE_ID)의 조회 칸(FIELD_KEY) 하나가 가진 규칙 한 줄
 * (스펙 2026-10-07-search-defaults-design §5.2). RULE_JSON 은 §4.2 의 규칙 표현이다.
 * 감사컬럼은 {@link McmAuditEntity}.
 */
@Entity
@Table(name = "TB_MCM_SEC_USER_SRCH_DFLT", schema = "MCMAPUSER")
@IdClass(SecUserSrchDfltId.class)
public class SecUserSrchDflt extends McmAuditEntity {

    @Id
    @Column(name = "USER_ID", length = 30, nullable = false)
    private String userId;

    @Id
    @Column(name = "PAGE_ID", length = 200, nullable = false)
    private String pageId;

    @Id
    @Column(name = "FIELD_KEY", length = 100, nullable = false)
    private String fieldKey;

    @Column(name = "RULE_JSON", length = 1000, nullable = false)
    private String ruleJson;

    @Column(name = "FIELD_META", length = 50)
    private String fieldMeta;

    @Column(name = "FIELD_LABEL", length = 100)
    private String fieldLabel;

    public SecUserSrchDflt() {}

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getPageId() { return pageId; }
    public void setPageId(String pageId) { this.pageId = pageId; }
    public String getFieldKey() { return fieldKey; }
    public void setFieldKey(String fieldKey) { this.fieldKey = fieldKey; }
    public String getRuleJson() { return ruleJson; }
    public void setRuleJson(String ruleJson) { this.ruleJson = ruleJson; }
    public String getFieldMeta() { return fieldMeta; }
    public void setFieldMeta(String fieldMeta) { this.fieldMeta = fieldMeta; }
    public String getFieldLabel() { return fieldLabel; }
    public void setFieldLabel(String fieldLabel) { this.fieldLabel = fieldLabel; }
}
