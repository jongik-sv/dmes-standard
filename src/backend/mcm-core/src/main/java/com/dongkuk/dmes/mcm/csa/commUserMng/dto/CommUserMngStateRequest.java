/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: commUserMng 계정 상태 action 입력 — unlock·suspend·resume·retire·handover·searchOwned·retryHrEvt·regHrEvtUser
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.dto;

/**
 * 계정 상태 action 한 건 입력. 이름은 화면 그리드 칸과 같은 대문자 SNAKE 이다(As-Is dataset 관례).
 */
public class CommUserMngStateRequest {

    /** 대상 사용자 ID. */
    private String USER_ID;

    /** 사유 — 비활성: 장기 출장 · 보안 점검 · 업체 요청 · 기타(직접 입력). 퇴직: 퇴사 · 계약 종료 · 타 법인 전출 · 기타(시안과 같다). 서버는 글자를 그대로 이력에 쓴다. */
    private String REASON;

    /** 담당 데이터를 받을 사람 — 퇴직·인계. 비우면 「나중에 인계」(D4). */
    private String TO_USER_ID;

    /** 인사 정보 ID — retryHrEvt·regHrEvtUser. 여러 건은 쉼표로 잇는다(retryHrEvt). */
    private String EVT_ID;

    /** 인사 입사 정보로 계정을 만들 때 쓸 사용자 ID — regHrEvtUser(D12). */
    private String NEW_USER_ID;

    /** 인사 정보 조회 조건 — 처리 상태(WAIT·DONE·SKIP·FAIL·HOLD, 비우면 FAIL·HOLD·WAIT). */
    private String PROC_ST;

    public CommUserMngStateRequest() {}

    public String getUSER_ID() { return USER_ID; }
    public void setUSER_ID(String USER_ID) { this.USER_ID = USER_ID; }
    public String getREASON() { return REASON; }
    public void setREASON(String REASON) { this.REASON = REASON; }
    public String getTO_USER_ID() { return TO_USER_ID; }
    public void setTO_USER_ID(String TO_USER_ID) { this.TO_USER_ID = TO_USER_ID; }
    public String getEVT_ID() { return EVT_ID; }
    public void setEVT_ID(String EVT_ID) { this.EVT_ID = EVT_ID; }
    public String getNEW_USER_ID() { return NEW_USER_ID; }
    public void setNEW_USER_ID(String NEW_USER_ID) { this.NEW_USER_ID = NEW_USER_ID; }
    public String getPROC_ST() { return PROC_ST; }
    public void setPROC_ST(String PROC_ST) { this.PROC_ST = PROC_ST; }
}
