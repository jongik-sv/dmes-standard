package com.dongkuk.dmes.mdm.dma.erdEdit.model;

/** 속성이 마지막으로 바뀐 rev 와 바꾼 세션(스펙 4.3 충돌 판정). */
public record PropRev(long rev, String session) {
}
