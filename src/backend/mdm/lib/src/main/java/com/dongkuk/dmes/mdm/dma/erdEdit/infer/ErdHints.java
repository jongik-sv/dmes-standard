package com.dongkuk.dmes.mdm.dma.erdEdit.infer;

import java.util.List;

/** 리포 문서·SQL 조인에서 뽑은 관계 근거(단계 1 S6). 파일 형식은 README "근거 파일" 절. 이름은 대문자 물리명이다. */
public record ErdHints(List<Ref> refs) {

    public static final ErdHints EMPTY = new ErdHints(List.of());

    public ErdHints {
        refs = List.copyOf(refs);
    }

    /** kind 는 DOC|SQL_JOIN. ref 는 근거 위치(예 docs/mcm/erd/csa-menu.dbml:494). */
    public record Ref(String kind, String childTable, List<String> childColumns, String parentTable, List<String> parentColumns,
                      String ref) {
        public Ref {
            childColumns = List.copyOf(childColumns);
            parentColumns = List.copyOf(parentColumns);
        }
    }
}
