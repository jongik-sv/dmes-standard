package com.dongkuk.dmes.mdm.common.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.cactus.security.context.UserInfo;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/**
 * TSK-01-03 design.md §3.1 L2 — 요청 문맥의 역할 문자열을 {@code ROLE_} 접두 없는 역할 ID 로 정규화한다(불변 규칙 I4).
 * ClientKeyFilter·JwtAuthenticationFilter 를 거친 역할은 {@code ROLE_MDM_STEWARD} 모양이다(F17).
 */
class CactusMdmCurrentUserTest {

    private final CactusMdmCurrentUser subject = new CactusMdmCurrentUser();

    @AfterEach
    void clear() {
        UserContextHolder.clear();
    }

    @Test
    void ROLE_접두를_한_번_떼어_역할_ID_로_돌려준다() {
        UserContextHolder.set(new UserInfo("u1", "u1", null, List.of("ROLE_MDM_STEWARD", "ROLE_SYSADMIN")));
        assertEquals("u1", subject.userId());
        assertEquals(Set.of("MDM_STEWARD", "SYSADMIN"), subject.roleIds());
    }

    @Test
    void 접두가_없는_역할은_그대로_쓴다() {
        UserContextHolder.set(new UserInfo("u2", "u2", null, List.of("MDM_STEWARD")));
        assertEquals(Set.of("MDM_STEWARD"), subject.roleIds());
    }

    @Test
    void 접두는_한_번만_뗀다() {
        UserContextHolder.set(new UserInfo("u3", "u3", null, List.of("ROLE_ROLE_X")));
        assertEquals(Set.of("ROLE_X"), subject.roleIds());
    }

    @Test
    void 문맥이_없으면_사용자_null_역할_빈_집합() {
        assertNull(subject.userId());
        assertTrue(subject.roleIds().isEmpty());
    }
}
