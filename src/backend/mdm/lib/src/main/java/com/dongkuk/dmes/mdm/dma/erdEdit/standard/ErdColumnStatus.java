package com.dongkuk.dmes.mdm.dma.erdEdit.standard;

/** 컬럼 표준 상태(스펙 2.1-3, 계획 P4). 선언 순서 = 나쁜 순서(뒤가 나쁨). */
public enum ErdColumnStatus {
    OK, ALIAS, NEW, TYPE, DOMAIN, MISS;

    /** 확정(D19)을 막는 상태. NEW·ALIAS 는 경고만 한다. */
    public boolean blocksConfirm() {
        return this == TYPE || this == DOMAIN || this == MISS;
    }

    public ErdColumnStatus worse(ErdColumnStatus other) {
        return other.ordinal() > ordinal() ? other : this;
    }
}
