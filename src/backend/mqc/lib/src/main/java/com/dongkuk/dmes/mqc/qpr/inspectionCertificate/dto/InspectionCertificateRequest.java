package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.dto;

/**
 * inspectionCertificate 모든 action 의 params(계약 docs/mqc/demo/mtc-contract.md §3·§5). 배열·객체는 받지 않고 JSON 본문은 문자열로 받는다.
 * <ul>
 *   <li>save — kind(FORM·RULE·CERT·OVR·IMG), key, json(빈 값이면 삭제), act, msg, reason</li>
 *   <li>reg — sourceCertId, msg(선택)</li>
 *   <li>issue — certId, snap, msg, act(선택: ISSUE·AUTO_ISSUE)</li>
 *   <li>reissue — certId, snap, reason, msg</li>
 *   <li>confirm — verifyCode, snap(선택)</li>
 *   <li>search·reset — 없음</li>
 * </ul>
 */
public class InspectionCertificateRequest {
    private String kind;
    private String key;
    private String json;
    private String act;
    private String msg;
    private String reason;
    private String sourceCertId;
    private String certId;
    private String snap;
    private String verifyCode;
    public String getKind() { return kind; }
    public void setKind(String v) { this.kind = v; }
    public String getKey() { return key; }
    public void setKey(String v) { this.key = v; }
    public String getJson() { return json; }
    public void setJson(String v) { this.json = v; }
    public String getAct() { return act; }
    public void setAct(String v) { this.act = v; }
    public String getMsg() { return msg; }
    public void setMsg(String v) { this.msg = v; }
    public String getReason() { return reason; }
    public void setReason(String v) { this.reason = v; }
    public String getSourceCertId() { return sourceCertId; }
    public void setSourceCertId(String v) { this.sourceCertId = v; }
    public String getCertId() { return certId; }
    public void setCertId(String v) { this.certId = v; }
    public String getSnap() { return snap; }
    public void setSnap(String v) { this.snap = v; }
    public String getVerifyCode() { return verifyCode; }
    public void setVerifyCode(String v) { this.verifyCode = v; }
}
