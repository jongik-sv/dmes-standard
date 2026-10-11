package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import com.fasterxml.jackson.databind.JsonNode;

/** 델타 한 건(스펙 4.4). kind: table|column|key|relation|diagram|diagramNode|diagramRoute. value 는 upsert 면 요소 JSON, delete 면 null. */
public record ErdChange(String kind, String id, String op, JsonNode value) {
    public static final String UPSERT = "upsert";
    public static final String DELETE = "delete";
    /** Restore 안에서만 쓴다. value 는 바뀐 속성만 담은 부분 JSON 이다. */
    public static final String PATCH = "patch";
}
