package com.dongkuk.dmes.mcm.screenusage.support;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;

/**
 * SecurityIdentity 스텁. requireUserId() 는 인터페이스 default 메서드라 Mockito mock 으로는 실제 로직(빈 값 거절)이
 * 돌지 않는다 — 손으로 만든 구현을 써서 default 동작을 그대로 시험한다.
 */
public class StubSecurityIdentity implements SecurityIdentity {

    public String userId;

    public StubSecurityIdentity(String userId) {
        this.userId = userId;
    }

    @Override
    public String currentUserId() { return userId; }

    @Override
    public boolean hasAuthority(String authority) { return false; }
}
