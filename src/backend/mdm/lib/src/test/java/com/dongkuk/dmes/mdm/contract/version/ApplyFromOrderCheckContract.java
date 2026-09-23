package com.dongkuk.dmes.mdm.contract.version;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/**
 * TSK-01-02 design.md §3.1 T10 — {@link ApplyFromOrderCheck} 계약 테스트 키트(불변 규칙 I17).
 *
 * <p>ADR-0002 D4-3: 직전 RELEASED 의 apply_from 보다 <b>엄격히 뒤</b>만 통과(같으면 거부), 최초 버전은 면제,
 * 과거 일시라도 직전보다 뒤면 통과(소급 허용). TSK-01-03 실구현 테스트는 이 클래스를 상속해 같은 사례를
 * 통과해야 한다(design.md §7 인계).
 */
public abstract class ApplyFromOrderCheckContract {

    private static final LocalDateTime PREVIOUS = LocalDateTime.of(2026, 10, 1, 9, 0, 0);

    protected abstract ApplyFromOrderCheck subject();

    @Test
    void 최초_버전은_어떤_일시든_통과한다() {
        assertEquals(Optional.empty(), subject().check(null, PREVIOUS));
        assertEquals(Optional.empty(), subject().check(null, LocalDateTime.of(2000, 1, 1, 0, 0, 0)));
    }

    @Test
    void 직전과_같은_일시는_거부한다() {
        assertRejected(subject().check(PREVIOUS, PREVIOUS));
    }

    @Test
    void 직전보다_앞선_일시는_거부한다() {
        assertRejected(subject().check(PREVIOUS, PREVIOUS.minusSeconds(1)));
    }

    @Test
    void 직전보다_1초_뒤면_통과한다() {
        assertEquals(Optional.empty(), subject().check(PREVIOUS, PREVIOUS.plusSeconds(1)));
    }

    @Test
    void 과거_일시라도_직전보다_뒤면_통과한다_소급_허용() {
        LocalDateTime longAgo = LocalDateTime.of(2001, 1, 1, 0, 0, 0);
        assertEquals(Optional.empty(), subject().check(longAgo, longAgo.plusDays(1)));
    }

    private static void assertRejected(Optional<MdmCheckIssue> result) {
        assertTrue(result.isPresent(), "직전 RELEASED 보다 뒤가 아니면 이슈가 있어야 한다");
        assertEquals(MdmErrorCode.APPLY_FROM_NOT_AFTER_PREVIOUS.code(), result.get().code());
    }
}
