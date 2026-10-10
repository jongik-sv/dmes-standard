package com.dongkuk.dmes.mdm.dma.erdEdit.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;

/** 관계 요소. {@code state}: DB | INFERRED | CONFIRMED | REJECTED. */
public final class ErdRelation {
    public String child;
    public String parent;
    /** [자식 컬럼 id, 부모 컬럼 id] 짝. parentRef 가 있으면 부모 쪽은 다른 모델의 컬럼 id 다. */
    public List<List<String>> pairs = new ArrayList<>();
    public boolean identifying;
    public ErdCardinality cardinality = new ErdCardinality();
    public String state = "CONFIRMED";
    public boolean dbFk;
    public List<ErdEvidence> evidence = new ArrayList<>();
    public ErdParentRef parentRef;
    @JsonProperty("_rev")
    public LinkedHashMap<String, PropRev> rev = new LinkedHashMap<>();
}
