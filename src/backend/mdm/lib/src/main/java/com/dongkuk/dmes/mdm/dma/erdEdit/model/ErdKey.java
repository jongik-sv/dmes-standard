package com.dongkuk.dmes.mdm.dma.erdEdit.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;

/** 키·인덱스 요소. {@code kind}: PK | UK | IX. {@code columns} 는 컬럼 요소 id 순서 목록이다. */
public final class ErdKey {
    public String table;
    public String kind;
    public String name;
    public List<String> columns = new ArrayList<>();
    @JsonProperty("_rev")
    public LinkedHashMap<String, PropRev> rev = new LinkedHashMap<>();
}
