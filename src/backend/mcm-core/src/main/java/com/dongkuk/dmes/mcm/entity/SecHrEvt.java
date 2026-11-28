/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: SecHrEvt 엔티티 — TB_MCM_SEC_HR_EVT (ERP 인사 정보 수신·처리 상태, V24)
 */
package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * ERP 인사 정보 한 건. 받은 그대로 담고 처리 결과를 같은 줄에 쓴다.
 *
 * <p>EVT_TP: {@code HIRE} 입사 · {@code LEAVE} 휴직 · {@code RETURN} 복직 · {@code RETIRE} 퇴직 · {@code MOVE} 부서 이동 ·
 * {@code INFO} 이름·연락처 변경.
 * <p>PROC_ST: {@code WAIT} 대기 · {@code DONE} 끝 · {@code SKIP} 건너뜀(협력업체·이미 같은 상태) · {@code FAIL} 실패(다음 회차 재시도) ·
 * {@code HOLD} 계정 생성 대기(입사 — 관리자가 골라 만든다, D12).
 */
@Entity
@Table(name = "TB_MCM_SEC_HR_EVT", schema = "MCMAPUSER")
public class SecHrEvt extends McmAuditEntity {

    public static final String TP_HIRE = "HIRE";
    public static final String TP_LEAVE = "LEAVE";
    public static final String TP_RETURN = "RETURN";
    public static final String TP_RETIRE = "RETIRE";
    public static final String TP_MOVE = "MOVE";
    public static final String TP_INFO = "INFO";

    public static final String ST_WAIT = "WAIT";
    public static final String ST_DONE = "DONE";
    public static final String ST_SKIP = "SKIP";
    public static final String ST_FAIL = "FAIL";
    public static final String ST_HOLD = "HOLD";

    @Id
    @Column(name = "EVT_ID", length = 40, nullable = false)
    private String evtId;

    @Column(name = "EMP_NO", length = 10, nullable = false)
    private String empNo;

    @Column(name = "EVT_TP", length = 10, nullable = false)
    private String evtTp;

    /** 발령 일자 YYYYMMDD. */
    @Column(name = "EVT_DT", length = 8, nullable = false)
    private String evtDt;

    @Column(name = "ORDER_NO", length = 50)
    private String orderNo;

    @Column(name = "USER_NM", length = 30)
    private String userNm;

    @Column(name = "DEPT_CD", length = 10)
    private String deptCd;

    @Column(name = "EMAIL", length = 30)
    private String email;

    @Column(name = "TEL_NO", length = 15)
    private String telNo;

    @Column(name = "MOBILE_TEL_NO", length = 15)
    private String mobileTelNo;

    /** 사번으로 맞춘 사용자 ID. 못 맞추면 비어 있다. */
    @Column(name = "USER_ID", length = 30)
    private String userId;

    @Column(name = "PROC_ST", length = 10, nullable = false)
    private String procSt = ST_WAIT;

    @Column(name = "PROC_MSG", length = 500)
    private String procMsg;

    @Column(name = "TRY_CNT", nullable = false)
    private Integer tryCnt = 0;

    @Column(name = "PROC_AT")
    private LocalDateTime procAt;

    public SecHrEvt() {}

    public String getEvtId() { return evtId; }
    public void setEvtId(String evtId) { this.evtId = evtId; }
    public String getEmpNo() { return empNo; }
    public void setEmpNo(String empNo) { this.empNo = empNo; }
    public String getEvtTp() { return evtTp; }
    public void setEvtTp(String evtTp) { this.evtTp = evtTp; }
    public String getEvtDt() { return evtDt; }
    public void setEvtDt(String evtDt) { this.evtDt = evtDt; }
    public String getOrderNo() { return orderNo; }
    public void setOrderNo(String orderNo) { this.orderNo = orderNo; }
    public String getUserNm() { return userNm; }
    public void setUserNm(String userNm) { this.userNm = userNm; }
    public String getDeptCd() { return deptCd; }
    public void setDeptCd(String deptCd) { this.deptCd = deptCd; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getTelNo() { return telNo; }
    public void setTelNo(String telNo) { this.telNo = telNo; }
    public String getMobileTelNo() { return mobileTelNo; }
    public void setMobileTelNo(String mobileTelNo) { this.mobileTelNo = mobileTelNo; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getProcSt() { return procSt; }
    public void setProcSt(String procSt) { this.procSt = procSt; }
    public String getProcMsg() { return procMsg; }
    public void setProcMsg(String procMsg) { this.procMsg = procMsg; }
    public Integer getTryCnt() { return tryCnt; }
    public void setTryCnt(Integer tryCnt) { this.tryCnt = tryCnt; }
    public LocalDateTime getProcAt() { return procAt; }
    public void setProcAt(LocalDateTime procAt) { this.procAt = procAt; }
}
