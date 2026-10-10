package com.dongkuk.dmes.mdm.dma.erdEdit.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;

/** 테이블 요소. {@code rev} 는 속성 이름 → 마지막으로 바뀐 rev·세션. */
public final class ErdTable {
    public String phys;
    public String logical;
    public String comment;
    public List<String> columnOrder = new ArrayList<>();
    @JsonProperty("_rev")
    public LinkedHashMap<String, PropRev> rev = new LinkedHashMap<>();
}
