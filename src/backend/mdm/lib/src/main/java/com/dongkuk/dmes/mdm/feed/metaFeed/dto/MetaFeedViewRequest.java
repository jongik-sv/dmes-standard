package com.dongkuk.dmes.mdm.feed.metaFeed.dto;

/** metaFeed action=view params — 대상 종류 하나(COLUMN·DOMAIN·RULE·RULE_SET·CODE·LAYOUT). 키는 grids.keys.rows[{key}]. */
public class MetaFeedViewRequest {

    private String type;
    private String systemCode;

    public String getType() { return type; }
    public String getSystemCode() { return systemCode; }
    public void setType(String v) { this.type = v; }
    public void setSystemCode(String v) { this.systemCode = v; }
}
