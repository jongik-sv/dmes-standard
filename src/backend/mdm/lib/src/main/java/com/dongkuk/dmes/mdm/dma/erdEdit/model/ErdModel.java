package com.dongkuk.dmes.mdm.dma.erdEdit.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.LinkedHashMap;

/** ERD 모델 JSON(스펙 3.1). 엔진 안에서만 고친다 — 밖에서는 {@link ErdModelCodec#copy} 로 받은 사본을 쓴다. */
public final class ErdModel {
    public int schemaVersion = 1;
    public ErdModelInfo model = new ErdModelInfo();
    public LinkedHashMap<String, ErdTable> tables = new LinkedHashMap<>();
    public LinkedHashMap<String, ErdColumn> columns = new LinkedHashMap<>();
    public LinkedHashMap<String, ErdKey> keys = new LinkedHashMap<>();
    public LinkedHashMap<String, ErdRelation> relations = new LinkedHashMap<>();
    /** 지운 요소 id → 지운 rev·세션(계획 P6). NOT_FOUND 응답에 쓴다. */
    @JsonProperty("_tombstones")
    public LinkedHashMap<String, PropRev> tombstones = new LinkedHashMap<>();

    public static ErdModel empty(String module, String schema) {
        ErdModel m = new ErdModel();
        m.model.module = module;
        m.model.schema = schema;
        return m;
    }
}
