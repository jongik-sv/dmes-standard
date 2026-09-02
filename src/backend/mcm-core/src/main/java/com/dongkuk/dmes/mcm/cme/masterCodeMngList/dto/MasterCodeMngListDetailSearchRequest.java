package com.dongkuk.dmes.mcm.cme.masterCodeMngList.dto;

/**
 * Master Code 상세조회 — searchDetail action 파라미터.
 *
 * <p>인용: 분석리포트 §4.4 #5 (fn_searchDetail) / §6 #3 (GetCodeDetailList) /
 *  xfdl:303~321 의 sArgument =
 *  {@code pCodeId} (= ds_grdMain.MASTER_CODE) +
 *  {@code pCodeIdRef1~5} (= ds_grdMain.MASTER_CODE_REF1~5 — nested scalar subquery 의
 *  SUB.MASTER_CODE 결정용).
 *
 * <p>OASIS BPMN serviceTask {@code searchDetailTask} 의 dto property.
 *
 * <p>**As-Is 파라미터명 보존**: {@code pCodeIdRef1~5} — masterCodeMng 의
 *  {@code pMasterCodeRef1~5} 와 명명 다르지만 본 화면 xfdl 의 As-Is 1:1 보존.
 */
public class MasterCodeMngListDetailSearchRequest {

    /** Master 의 MASTER_CODE 값 — Detail / Category SELECT WHERE 키. */
    private String pCodeId;

    /** 참조 마스터 1 (= ds_grdMain.MASTER_CODE_REF1). nested scalar subquery 의 MAST.CODE_ID 비교 키. */
    private String pCodeIdRef1;
    /** 참조 마스터 2. */
    private String pCodeIdRef2;
    /** 참조 마스터 3. */
    private String pCodeIdRef3;
    /** 참조 마스터 4. */
    private String pCodeIdRef4;
    /** 참조 마스터 5. */
    private String pCodeIdRef5;

    public String getPCodeId() { return pCodeId; }
    public void setPCodeId(String pCodeId) { this.pCodeId = pCodeId; }

    public String getPCodeIdRef1() { return pCodeIdRef1; }
    public void setPCodeIdRef1(String pCodeIdRef1) { this.pCodeIdRef1 = pCodeIdRef1; }

    public String getPCodeIdRef2() { return pCodeIdRef2; }
    public void setPCodeIdRef2(String pCodeIdRef2) { this.pCodeIdRef2 = pCodeIdRef2; }

    public String getPCodeIdRef3() { return pCodeIdRef3; }
    public void setPCodeIdRef3(String pCodeIdRef3) { this.pCodeIdRef3 = pCodeIdRef3; }

    public String getPCodeIdRef4() { return pCodeIdRef4; }
    public void setPCodeIdRef4(String pCodeIdRef4) { this.pCodeIdRef4 = pCodeIdRef4; }

    public String getPCodeIdRef5() { return pCodeIdRef5; }
    public void setPCodeIdRef5(String pCodeIdRef5) { this.pCodeIdRef5 = pCodeIdRef5; }
}
