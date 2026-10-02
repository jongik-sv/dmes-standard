package com.dongkuk.dmes.mcm.widget.memo.dto;

/**
 * widgetMemo load·save 공용 요청(params) — 스펙 §17.3. 사용자는 늘 인증 컨텍스트(요청에 userId 를 받지 않는다).
 * load 는 instId 만, save 는 instId·defId·format·content 를 쓴다.
 */
public class WidgetMemoRequest {

    private String instId;
    private String defId;
    private String format;
    private String content;

    public WidgetMemoRequest() {}

    public String getInstId() { return instId; }
    public void setInstId(String instId) { this.instId = instId; }
    public String getDefId() { return defId; }
    public void setDefId(String defId) { this.defId = defId; }
    public String getFormat() { return format; }
    public void setFormat(String format) { this.format = format; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
}
