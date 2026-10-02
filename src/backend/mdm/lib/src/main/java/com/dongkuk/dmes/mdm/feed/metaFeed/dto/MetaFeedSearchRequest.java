package com.dongkuk.dmes.mdm.feed.metaFeed.dto;

/** metaFeed action=search params(spec 2026-10-02-mdm-meta-cache-design §3.4 changes). since 기본 0, limit 기본 1000(최대 5000). */
public class MetaFeedSearchRequest {

    private Long since;
    private Integer limit;

    public Long getSince() { return since; }
    public Integer getLimit() { return limit; }
    public void setSince(Long v) { this.since = v; }
    public void setLimit(Integer v) { this.limit = v; }
}
