package com.dongkuk.dmes.mdm.common.security;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * TSK-06-02 design.md §10.1·I28 — 공용 부품 P1. 쓰기 가드는 {@code MDM_STEWARD} 역할만 통과시킨다(SYSADMIN·표준 관리자
 * 우회 없음). 오류는 MDM013 이다(MDM016 이 아니다).
 */
class MdmStewardGuardTest {

    @Test
    void 담당자는_통과한다() {
        assertDoesNotThrow(() -> guard(Set.of("MDM_STEWARD")).requireSteward());
        assertDoesNotThrow(() -> guard(Set.of("SYSADMIN", "MDM_STEWARD")).requireSteward());
    }

    @Test
    void SYSADMIN_표준관리자_역할_없음은_MDM013() {
        for (Set<String> roles : List.of(Set.of("SYSADMIN"), Set.of("MDM_STD_ADMIN"), Set.<String>of())) {
            BusinessException e = assertThrows(BusinessException.class, () -> guard(roles).requireSteward());
            assertEquals(MdmErrorCode.STEWARD_ROLE_REQUIRED.code(), e.getErrors().get(0).code(), roles.toString());
            assertTrue(e.getMessage().startsWith(MdmErrorCode.STEWARD_ROLE_REQUIRED.defaultMessage()), roles.toString());
        }
    }

    private static MdmStewardGuard guard(Set<String> roles) {
        return new MdmStewardGuard(new MdmCurrentUser() {
            @Override
            public String userId() {
                return "u";
            }

            @Override
            public Set<String> roleIds() {
                return roles;
            }
        });
    }
}
