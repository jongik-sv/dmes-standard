package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import org.springframework.stereotype.Component;

/**
 * 룰 화면의 담당자 역할 판단 — 유일한 연결 지점(TSK-08-02 design §7.1, I30). 룰 서비스는 역할을 직접 보지 않고 이 클래스만 부른다.
 * 가드의 사본이 아니라 연결 지점이므로 두 메서드 외에 규칙을 두지 않는다.
 *
 * <p>TSK-06-02 {@code MdmStewardGuard} 가 머지되면 {@link #requireSteward()} 는 그 가드에 위임하고, {@link #isSteward()} 는 가드가
 * 불리언 판단을 공개하면 그것에 위임한다(공개하지 않으면 지금 몸체를 둔다). 소유자 판단은 공통 버전 서비스의 OWNER_ID 가 한다.
 */
@Component
public class RuleStewardCheck {

    private final MdmCurrentUser currentUser;

    public RuleStewardCheck(MdmCurrentUser currentUser) {
        this.currentUser = currentUser;
    }

    /** 담당자 역할이 없으면 MDM013. */
    public void requireSteward() {
        if (!isSteward()) {
            throw MdmErrors.of(MdmErrorCode.STEWARD_ROLE_REQUIRED);
        }
    }

    public boolean isSteward() {
        return currentUser.roleIds().contains(MdmRoles.STEWARD);
    }
}
