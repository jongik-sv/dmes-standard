package com.dongkuk.dmes.mcm.cmb.masterRuleDataList.dto;

/**
 * 업무기준 상세조회 파라미터 (분석 §4.6 sArgument 전수 — 조회 전용, 저장/긴급적용 파라미터 없음).
 *
 * <ul>
 *   <li>{@link #pRuleId} — 업무기준 ID (필수 — BR-001. 서버가 형식 검증 후 pTable 재조립 — Q-007.
 *       Q-009 확정: As-Is Java 의 pTable↔pRuleId 변수명 혼동은 To-Be 에서 정정 — 본 DTO 는 의미대로 분리)</li>
 *   <li>{@link #pTable} — As-Is 계약 보존 파라미터 (FE "TB_MCA_"+ruleId 조립 — 서버는 신뢰하지 않고
 *       pRuleId 로 재조립·대조. 불일치/형식 위반 → INVALID_VALUE)</li>
 *   <li>pWhere1~5 / pOperator1~5 / pVal1~5 — 5조건 동적 WHERE (컬럼=컬럼정의 화이트리스트,
 *       연산자=LIKE·=·&lt;=·&gt;= 화이트리스트, 값=파라미터 바인딩 — Q-007)</li>
 *   <li>{@link #countPerPage} / {@link #currentPage} — 페이징 (As-Is ds_srch)</li>
 * </ul>
 */
public class MasterRuleDataListSearchRequest {

    private String pRuleId;
    private String pTable;
    private String pWhere1;
    private String pWhere2;
    private String pWhere3;
    private String pWhere4;
    private String pWhere5;
    private String pOperator1;
    private String pOperator2;
    private String pOperator3;
    private String pOperator4;
    private String pOperator5;
    private String pVal1;
    private String pVal2;
    private String pVal3;
    private String pVal4;
    private String pVal5;
    private Integer countPerPage;
    private Integer currentPage;

    public String getPRuleId() { return pRuleId; }
    public void setPRuleId(String pRuleId) { this.pRuleId = pRuleId; }

    public String getPTable() { return pTable; }
    public void setPTable(String pTable) { this.pTable = pTable; }

    public String getPWhere1() { return pWhere1; }
    public void setPWhere1(String pWhere1) { this.pWhere1 = pWhere1; }

    public String getPWhere2() { return pWhere2; }
    public void setPWhere2(String pWhere2) { this.pWhere2 = pWhere2; }

    public String getPWhere3() { return pWhere3; }
    public void setPWhere3(String pWhere3) { this.pWhere3 = pWhere3; }

    public String getPWhere4() { return pWhere4; }
    public void setPWhere4(String pWhere4) { this.pWhere4 = pWhere4; }

    public String getPWhere5() { return pWhere5; }
    public void setPWhere5(String pWhere5) { this.pWhere5 = pWhere5; }

    public String getPOperator1() { return pOperator1; }
    public void setPOperator1(String pOperator1) { this.pOperator1 = pOperator1; }

    public String getPOperator2() { return pOperator2; }
    public void setPOperator2(String pOperator2) { this.pOperator2 = pOperator2; }

    public String getPOperator3() { return pOperator3; }
    public void setPOperator3(String pOperator3) { this.pOperator3 = pOperator3; }

    public String getPOperator4() { return pOperator4; }
    public void setPOperator4(String pOperator4) { this.pOperator4 = pOperator4; }

    public String getPOperator5() { return pOperator5; }
    public void setPOperator5(String pOperator5) { this.pOperator5 = pOperator5; }

    public String getPVal1() { return pVal1; }
    public void setPVal1(String pVal1) { this.pVal1 = pVal1; }

    public String getPVal2() { return pVal2; }
    public void setPVal2(String pVal2) { this.pVal2 = pVal2; }

    public String getPVal3() { return pVal3; }
    public void setPVal3(String pVal3) { this.pVal3 = pVal3; }

    public String getPVal4() { return pVal4; }
    public void setPVal4(String pVal4) { this.pVal4 = pVal4; }

    public String getPVal5() { return pVal5; }
    public void setPVal5(String pVal5) { this.pVal5 = pVal5; }

    public Integer getCountPerPage() { return countPerPage; }
    public void setCountPerPage(Integer countPerPage) { this.countPerPage = countPerPage; }

    public Integer getCurrentPage() { return currentPage; }
    public void setCurrentPage(Integer currentPage) { this.currentPage = currentPage; }

    // ── 편의 접근 (Service 루프용) ──

    /** n(1~5)번째 조건 컬럼. */
    public String where(int n) {
        return switch (n) { case 1 -> pWhere1; case 2 -> pWhere2; case 3 -> pWhere3; case 4 -> pWhere4; case 5 -> pWhere5; default -> null; };
    }

    /** n(1~5)번째 연산자. */
    public String operator(int n) {
        return switch (n) { case 1 -> pOperator1; case 2 -> pOperator2; case 3 -> pOperator3; case 4 -> pOperator4; case 5 -> pOperator5; default -> null; };
    }

    /** n(1~5)번째 값. */
    public String val(int n) {
        return switch (n) { case 1 -> pVal1; case 2 -> pVal2; case 3 -> pVal3; case 4 -> pVal4; case 5 -> pVal5; default -> null; };
    }
}
