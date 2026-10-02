package com.dongkuk.dmes.mcm.widget.chat.dto;

/**
 * widgetChat history·send·reset 공용 요청(params) — 스펙 §5.1. 사용자는 늘 인증 컨텍스트(요청에 userId 를 받지 않는다).
 * history·reset 은 instId 만, send 는 instId·defId·message 를 쓴다.
 */
public class WidgetChatRequest {

    private String instId;
    private String defId;
    private String message;

    public WidgetChatRequest() {}

    public String getInstId() { return instId; }
    public void setInstId(String instId) { this.instId = instId; }
    public String getDefId() { return defId; }
    public void setDefId(String defId) { this.defId = defId; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
}
