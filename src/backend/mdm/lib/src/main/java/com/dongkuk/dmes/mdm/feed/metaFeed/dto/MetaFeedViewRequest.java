package com.dongkuk.dmes.mdm.feed.metaFeed.dto;

/** metaFeed action=view params — 대상 종류 하나(COLUMN·DOMAIN·RULE·RULE_SET·CODE·LAYOUT). 키는 grids.keys.rows[{key}]. */
public class MetaFeedViewRequest {

    private String type;

    public String getType() { return type; }
    public void setType(String v) { this.type = v; }
}
