package com.dongkuk.dmes.mdm.common.security;

import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.cactus.security.context.UserInfo;
import java.util.LinkedHashSet;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * cactus 요청 문맥의 사용자(TSK-01-03 B7). BFF 신뢰 채널(D6)을 거친 역할은 {@code ROLE_MDM_STEWARD} 모양이라
 * 앞의 {@code ROLE_} 를 한 번 떼어 역할 ID 로 쓴다(F17). 문맥이 없으면 userId null·역할 빈 집합.
 */
@Component
public class CactusMdmCurrentUser implements MdmCurrentUser {

    private static final String ROLE_PREFIX = "ROLE_";

    @Override
    public String userId() {
        UserInfo user = UserContextHolder.get();
        return user != null ? user.userId() : null;
    }

    @Override
    public Set<String> roleIds() {
        UserInfo user = UserContextHolder.get();
        if (user == null || user.roles() == null) {
            return Set.of();
        }
        Set<String> ids = new LinkedHashSet<>();
        for (String role : user.roles()) {
            if (role != null) {
                ids.add(role.startsWith(ROLE_PREFIX) ? role.substring(ROLE_PREFIX.length()) : role);
            }
        }
        return Set.copyOf(ids);
    }
}
