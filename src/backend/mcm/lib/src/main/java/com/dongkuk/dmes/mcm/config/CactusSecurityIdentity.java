package com.dongkuk.dmes.mcm.config;

import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.cactus.security.context.UserInfo;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import org.springframework.context.annotation.Primary;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * mcm 런처(사이트 슬라이스)의 {@link SecurityIdentity} 구현 — cactus {@link UserContextHolder}
 * 가 우선, 없으면 Spring Security {@code SecurityContext} 폴백.
 *
 * <p>{@code @Primary} 로 등록되어 mcm-core 의 default {@code SpringSecurityIdentity}
 * 빈을 override 한다.
 */
@Component
@Primary
public class CactusSecurityIdentity implements SecurityIdentity {

    @Override
    public String currentUserId() {
        UserInfo info = UserContextHolder.get();
        if (info != null && info.userId() != null && !info.userId().isBlank()) {
            return info.userId();
        }
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) return null;
        Object principal = auth.getPrincipal();
        if ("anonymousUser".equals(principal)) return null;
        return auth.getName();
    }

    @Override
    public boolean hasAuthority(String authority) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || authority == null) return false;
        for (GrantedAuthority a : auth.getAuthorities()) {
            if (authority.equals(a.getAuthority())) return true;
        }
        return false;
    }

    @Override
    public java.util.Collection<String> currentRoleIds() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) return java.util.List.of();
        java.util.List<String> ids = new java.util.ArrayList<>();
        for (GrantedAuthority a : auth.getAuthorities()) {
            String v = a.getAuthority();
            if (v == null) continue;
            ids.add(v.startsWith("ROLE_") ? v.substring(5) : v);
        }
        return ids;
    }
}
