package com.dongkuk.dmes.mdm.feed.metaFeed.dto;

/** metaFeed action=save(= 스펙 force) params — 대상 종류와 EVICT·RELOAD. 키는 grids.keys.rows[{key}]. SYSADMIN 만. */
public class MetaFeedSaveRequest {

    private String type;
    private String kind;

    public String getType() { return type; }
    public String getKind() { return kind; }
    public void setType(String v) { this.type = v; }
    public void setKind(String v) { this.kind = v; }
}
