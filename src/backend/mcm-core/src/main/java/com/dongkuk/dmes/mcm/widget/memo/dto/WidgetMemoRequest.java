package com.dongkuk.dmes.mcm.widget.memo.dto;

/**
 * widgetMemo load·save 공용 요청(params) — 스펙 §17.3. 사용자는 늘 인증 컨텍스트(요청에 userId 를 받지 않는다).
 * load 는 instId 만, save 는 instId·defId·format·content·title 을 쓴다.
 * <p>title: OASIS 가 params 를 Gson 으로 이 클래스에 옮기므로 키가 없으면 null 이고, 명시적 null 은 cactus 요청 변환기가 거절해 도착하지 않는다.
 * 그래서 null = 「제목을 건드리지 않는다(기존 값 유지)」, 빈 문자열·공백뿐 = 「제목을 지운다(정의 이름으로 돌아감)」다.
 */
public class WidgetMemoRequest {

    private String instId;
    private String defId;
    private String format;
    private String content;
    private String title;

    public WidgetMemoRequest() {}

    public String getInstId() { return instId; }
    public void setInstId(String instId) { this.instId = instId; }
    public String getDefId() { return defId; }
    public void setDefId(String defId) { this.defId = defId; }
    public String getFormat() { return format; }
    public void setFormat(String format) { this.format = format; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
}
