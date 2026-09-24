package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * 룰 테스트 케이스 — {@code TB_MDM_RULE_TEST_CASE}(TSK-08-01 design.md §6.0 ⑥·§6.2). 복합 PK 는 {@link MdmRuleTestCaseId}.
 *
 * <p>버전과 무관하게 룰에 붙는다. {@code INPUT_JSON}·{@code EXPECTED_JSON} 은 일반 {@code String} 이다.
 * {@code ROW_VERSION} 은 조건부 네이티브 UPDATE 로만 오르고 {@code @Version} 이 아니다(D7).
 */
@Entity
@Table(name = "TB_MDM_RULE_TEST_CASE")
@IdClass(MdmRuleTestCaseId.class)
public class MdmRuleTestCase extends CactusAuditEntity {

    @Id
    @Column(name = "MARU_RULE_ID", length = 50)
    private String maruRuleId;

    @Id
    @Column(name = "CASE_ID")
    private Integer caseId;

    @Column(name = "CASE_NAME")
    private String caseName;

    @Column(name = "INPUT_JSON", nullable = false)
    private String inputJson;

    @Column(name = "EXPECTED_JSON")
    private String expectedJson;

    @Column(name = "DESCRIPTION")
    private String description;

    @Column(name = "ROW_VERSION", nullable = false, updatable = false)
    private long rowVersion;

    protected MdmRuleTestCase() {
        // JPA 기본 생성자
    }

    public MdmRuleTestCase(String maruRuleId, Integer caseId, String inputJson) {
        this.maruRuleId = maruRuleId;
        this.caseId = caseId;
        this.inputJson = inputJson;
        this.rowVersion = 0;
    }

    public String getMaruRuleId() { return maruRuleId; }
    public Integer getCaseId() { return caseId; }
    public String getCaseName() { return caseName; }
    public String getInputJson() { return inputJson; }
    public String getExpectedJson() { return expectedJson; }
    public String getDescription() { return description; }
    public long getRowVersion() { return rowVersion; }

    public void setCaseName(String v) { this.caseName = v; }
    public void setInputJson(String v) { this.inputJson = v; }
    public void setExpectedJson(String v) { this.expectedJson = v; }
    public void setDescription(String v) { this.description = v; }
    /** INSERT 때만 반영된다. 저장된 행의 값은 조건부 네이티브 UPDATE 로 올린다(D7). */
    public void setRowVersion(long v) { this.rowVersion = v; }
}
