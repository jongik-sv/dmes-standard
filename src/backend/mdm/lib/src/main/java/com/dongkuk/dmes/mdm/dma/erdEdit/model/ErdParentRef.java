package com.dongkuk.dmes.mdm.dma.erdEdit.model;

import java.util.List;

/** 모듈 사이 관계의 부모(스펙 D8). */
public record ErdParentRef(String model, String table, List<String> columns) {
}
