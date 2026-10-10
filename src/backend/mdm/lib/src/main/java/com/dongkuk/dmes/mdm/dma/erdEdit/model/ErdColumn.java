package com.dongkuk.dmes.mdm.dma.erdEdit.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.LinkedHashMap;

/** 컬럼 요소. {@code table} 은 소속 테이블 요소 id 다. */
public final class ErdColumn {
    public String table;
    public String phys;
    public String logical;
    public Long domainId;
    public String dataType;
    public Integer length;
    public Integer scale;
    public boolean notNull;
    @JsonProperty("default")
    public String defaultValue;
    public String comment;
    @JsonProperty("_rev")
    public LinkedHashMap<String, PropRev> rev = new LinkedHashMap<>();
}
