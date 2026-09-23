package com.dongkuk.dmes.mdm.common.security;

import static org.junit.jupiter.api.Assertions.assertFalse;

import org.junit.jupiter.api.Test;

/**
 * TSK-01-03 design.md §3.1 L9 — 담당자 조회 어댑터가 없을 때 넘기기 대상 검사는 항상 거부한다(D7 fail-closed, 불변 규칙 I7).
 */
class UnresolvedStewardDirectoryTest {

    private final UnresolvedStewardDirectory subject = new UnresolvedStewardDirectory();

    @Test
    void 어떤_ID_도_담당자로_보지_않는다() {
        assertFalse(subject.isSteward("kim"));
        assertFalse(subject.isSteward(" "));
        assertFalse(subject.isSteward(null));
    }
}
