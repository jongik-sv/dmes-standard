package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

/**
 * 룰 세트 테스트 케이스 — {@code TB_MDM_RULE_SET_TEST_CASE}(V15, 흐름도 3단계 P7). 복합 PK 는 {@link MdmRuleSetTestCaseId}.
 *
 * <p>세트에 붙는다(FK → TB_MDM_RULE_SET). {@code INPUT_JSON}·{@code EXPECTED_JSON} 은 {@code String} 이고 칼럼이 CLOB 이라 {@code @Lob} 이다.
 * {@code ROW_VERSION} 은 조건부 네이티브 UPDATE 로만 오르고 {@code @Version} 이 아니다(D7).
 */
@Entity
@Table(name = "TB_MDM_RULE_SET_TEST_CASE")
@IdClass(MdmRuleSetTestCaseId.class)
public class MdmRuleSetTestCase extends CactusAuditEntity {

    @Id
    @Column(name = "MARU_RULE_SET_ID", length = 50)
    private String maruRuleSetId;

    @Id
    @Column(name = "CASE_ID")
    private Integer caseId;

    @Column(name = "CASE_NAME")
    private String caseName;

    @Lob
    @Column(name = "INPUT_JSON", nullable = false)
    private String inputJson;

    /** KST {@code yyyy-MM-dd HH:mm:ss} 문자열(P-D6). 없으면 실행 시각. */
    @Column(name = "EVAL_TS", length = 19)
    private String evalTs;

    @Lob
    @Column(name = "EXPECTED_JSON")
    private String expectedJson;

    @Column(name = "DESCRIPTION")
    private String description;

    @Column(name = "ROW_VERSION", nullable = false, updatable = false)
    private long rowVersion;

    protected MdmRuleSetTestCase() {
        // JPA 기본 생성자
    }

    public MdmRuleSetTestCase(String maruRuleSetId, Integer caseId, String inputJson) {
        this.maruRuleSetId = maruRuleSetId;
        this.caseId = caseId;
        this.inputJson = inputJson;
        this.rowVersion = 0;
    }

    public String getMaruRuleSetId() { return maruRuleSetId; }
    public Integer getCaseId() { return caseId; }
    public String getCaseName() { return caseName; }
    public String getInputJson() { return inputJson; }
    public String getEvalTs() { return evalTs; }
    public String getExpectedJson() { return expectedJson; }
    public String getDescription() { return description; }
    public long getRowVersion() { return rowVersion; }

    public void setCaseName(String v) { this.caseName = v; }
    public void setInputJson(String v) { this.inputJson = v; }
    public void setEvalTs(String v) { this.evalTs = v; }
    public void setExpectedJson(String v) { this.expectedJson = v; }
    public void setDescription(String v) { this.description = v; }
    /** INSERT 때만 반영된다. 저장된 행의 값은 조건부 네이티브 UPDATE 로 올린다(D7). */
    public void setRowVersion(long v) { this.rowVersion = v; }
}
