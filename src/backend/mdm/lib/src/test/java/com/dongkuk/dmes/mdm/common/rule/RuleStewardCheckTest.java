package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.security.MdmStewardGuard;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * TSK-08-02 design §7.1·I30 — 룰 화면의 담당자 역할 판단 연결 지점. {@code requireSteward()} 는 TSK-06-02 공용 가드
 * {@link MdmStewardGuard} 에 위임하고(MDM013), {@code isSteward()} 는 가드가 불리언 판단을 공개하지 않아 역할 집합을 본다.
 */
class RuleStewardCheckTest {

    @Test
    void 담당자는_통과하고_isSteward_가_참이다() {
        MdmCurrentUser user = user(Set.of("MDM_STEWARD"));
        RuleStewardCheck check = new RuleStewardCheck(user, new MdmStewardGuard(user));
        assertDoesNotThrow(check::requireSteward);
        assertTrue(check.isSteward());
    }

    @Test
    void 담당자가_아니면_MDM013_이고_isSteward_가_거짓이다() {
        for (Set<String> roles : List.of(Set.of("SYSADMIN"), Set.of("MDM_STD_ADMIN"), Set.<String>of())) {
            MdmCurrentUser user = user(roles);
            RuleStewardCheck check = new RuleStewardCheck(user, new MdmStewardGuard(user));
            BusinessException e = assertThrows(BusinessException.class, check::requireSteward);
            assertEquals(MdmErrorCode.STEWARD_ROLE_REQUIRED.code(), e.getErrors().get(0).code(), roles.toString());
            assertFalse(check.isSteward(), roles.toString());
        }
    }

    @Test
    void requireSteward_는_공용_가드의_판정을_따른다() {
        // 역할은 담당자지만 가드가 거부하면 거부한다 — 판정을 스스로 하지 않고 가드에 위임한다는 뜻이다.
        MdmCurrentUser user = user(Set.of("MDM_STEWARD"));
        IllegalStateException denied = new IllegalStateException("guard");
        MdmStewardGuard rejecting = new MdmStewardGuard(user) {
            @Override
            public void requireSteward() {
                throw denied;
            }
        };
        RuleStewardCheck check = new RuleStewardCheck(user, rejecting);
        assertSame(denied, assertThrows(IllegalStateException.class, check::requireSteward));
    }

    private static MdmCurrentUser user(Set<String> roles) {
        return new MdmCurrentUser() {
            @Override
            public String userId() {
                return "u";
            }

            @Override
            public Set<String> roleIds() {
                return roles;
            }
        };
    }
}
