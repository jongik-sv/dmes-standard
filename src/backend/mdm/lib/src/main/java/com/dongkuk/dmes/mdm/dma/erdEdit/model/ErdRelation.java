package com.dongkuk.dmes.mdm.dma.erdEdit.model;

import com.fasterxml.jackson.annotation.JsonInclude;
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
    /**
     * 허브 칼럼 후보 순위(단계 1 S7). 허브가 아니거나 DB 관계면 null, 그릴 후보 1, 접는 후보 2..n.
     * 엔진 명령은 이 값을 쓰지 않는다. null 이면 JSON 에 쓰지 않아 단계 0 모델 JSON 이 바뀌지 않는다.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public Integer candidateRank;
    @JsonProperty("_rev")
    public LinkedHashMap<String, PropRev> rev = new LinkedHashMap<>();
}
