package com.dongkuk.dmes.mdm.feed.metaFeed.dto;

/**
 * metaFeed action=view params — 대상 종류 하나(COLUMN·DOMAIN·RULE·RULE_SET·CODE·LAYOUT). 키는 grids.keys.rows[{key}](BODY 는 [{key, ver}]).
 * {@code part}(TOC·BODY)·{@code at}(KST {@code yyyy-MM-ddTHH:mm:ss})은 D-154 — 없으면 지금 응답(전 이력)이다. COLUMN·DOMAIN 은 part 를 무시한다.
 */
public class MetaFeedViewRequest {

    private String type;
    private String systemCode;
    private String part;
    private String at;

    public String getType() { return type; }
    public String getSystemCode() { return systemCode; }
    public String getPart() { return part; }
    public String getAt() { return at; }
    public void setType(String v) { this.type = v; }
    public void setSystemCode(String v) { this.systemCode = v; }
    public void setPart(String v) { this.part = v; }
    public void setAt(String v) { this.at = v; }
}
