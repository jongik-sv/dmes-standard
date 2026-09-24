package com.dongkuk.dmes.mdm.dma.naming;

/** 표면형이 용어에 붙은 근거. 선언 순서가 후보 정렬 순서다(NAME < SYNONYM < ALIAS, 불변 규칙 I6). */
public enum MatchVia {
    NAME,
    SYNONYM,
    ALIAS
}
