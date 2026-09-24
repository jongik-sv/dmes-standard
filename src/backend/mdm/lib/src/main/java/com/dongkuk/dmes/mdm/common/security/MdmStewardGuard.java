package com.dongkuk.dmes.mdm.common.security;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import org.springframework.stereotype.Component;

/**
 * 담당자 쓰기 가드(TSK-06-02, 공용 부품 D-TSK-06-02-2). BFF 액션 권한(1차)과 별도로 서비스가 요청 역할을 직접 본다.
 * SYSADMIN·MDM_STD_ADMIN 만으로는 거부한다 — {@link MdmStdAdminGuard} 와 같은 모양이다.
 */
@Component
public class MdmStewardGuard {

    private final MdmCurrentUser currentUser;

    public MdmStewardGuard(MdmCurrentUser currentUser) {
        this.currentUser = currentUser;
    }

    public void requireSteward() {
        if (!currentUser.roleIds().contains(MdmRoles.STEWARD)) {
            throw MdmErrors.of(MdmErrorCode.STEWARD_ROLE_REQUIRED);
        }
    }
}
