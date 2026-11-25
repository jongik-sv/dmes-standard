package com.dongkuk.dmes.mqc.qpr.qualityCertificate.dto;

/**
 * qualityCertificate 모든 action 의 params(계약 docs/mqc/demo/wty-contract.md §3). 배열·객체는 받지 않고 본문은 문자열로 받는다.
 * <ul>
 *   <li>save — json, state(APPLIED·DRAFT·PENDING), act(INIT·DRAFT·REQUEST·UNREQUEST·DISCARD), msg</li>
 *   <li>approve — memo</li>
 *   <li>search·reset — 없음</li>
 * </ul>
 */
public class QualityCertificateRequest {
    private String json;
    private String state;
    private String act;
    private String msg;
    private String memo;
    public String getJson() { return json; }
    public void setJson(String v) { this.json = v; }
    public String getState() { return state; }
    public void setState(String v) { this.state = v; }
    public String getAct() { return act; }
    public void setAct(String v) { this.act = v; }
    public String getMsg() { return msg; }
    public void setMsg(String v) { this.msg = v; }
    public String getMemo() { return memo; }
    public void setMemo(String v) { this.memo = v; }
}
