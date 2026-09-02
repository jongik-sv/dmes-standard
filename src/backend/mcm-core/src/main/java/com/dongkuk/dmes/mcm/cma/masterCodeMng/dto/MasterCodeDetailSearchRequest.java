package com.dongkuk.dmes.mcm.cma.masterCodeMng.dto;

/**
 * Detail 그리드 + LoV 일괄 조회 파라미터 — As-Is {@code fn_searchDetail} (xfdl:410) 의 sArgument 인용:
 * {@code pCodeId} (=ds_grdMain.MASTER_CODE) + {@code pMasterCodeRef1~5} (ds_grdMain.MASTER_CODE_REF1~5).
 *
 * <p>OASIS BPMN serviceTask {@code searchDetailTask} 의 dto property.
 */
public class MasterCodeDetailSearchRequest {

    /** Master 의 MASTER_CODE 값 — Detail / Category SELECT WHERE 키. */
    private String pCodeId;

    /** 참조 마스터 1~5 (Detail 콤보 LoV 의 키 — CODE_VAL_REF1~5). */
    private String pMasterCodeRef1;
    private String pMasterCodeRef2;
    private String pMasterCodeRef3;
    private String pMasterCodeRef4;
    private String pMasterCodeRef5;

    public String getPCodeId() { return pCodeId; }
    public void setPCodeId(String pCodeId) { this.pCodeId = pCodeId; }

    public String getPMasterCodeRef1() { return pMasterCodeRef1; }
    public void setPMasterCodeRef1(String pMasterCodeRef1) { this.pMasterCodeRef1 = pMasterCodeRef1; }

    public String getPMasterCodeRef2() { return pMasterCodeRef2; }
    public void setPMasterCodeRef2(String pMasterCodeRef2) { this.pMasterCodeRef2 = pMasterCodeRef2; }

    public String getPMasterCodeRef3() { return pMasterCodeRef3; }
    public void setPMasterCodeRef3(String pMasterCodeRef3) { this.pMasterCodeRef3 = pMasterCodeRef3; }

    public String getPMasterCodeRef4() { return pMasterCodeRef4; }
    public void setPMasterCodeRef4(String pMasterCodeRef4) { this.pMasterCodeRef4 = pMasterCodeRef4; }

    public String getPMasterCodeRef5() { return pMasterCodeRef5; }
    public void setPMasterCodeRef5(String pMasterCodeRef5) { this.pMasterCodeRef5 = pMasterCodeRef5; }
}
