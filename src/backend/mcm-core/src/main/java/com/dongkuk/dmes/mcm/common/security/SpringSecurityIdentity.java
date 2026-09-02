package com.dongkuk.dmes.mcm.common.security;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * Spring Security 표준 컨텍스트만으로 동작하는 default 구현. 사이트가 별도 빈을
 * 등록하지 않으면 본 빈이 사용된다 ({@link ConditionalOnMissingBean}).
 */
@Component
@ConditionalOnMissingBean(SecurityIdentity.class)
public class SpringSecurityIdentity implements SecurityIdentity {

    @Override
    public String currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) return null;
        Object principal = auth.getPrincipal();
        if (principal == null) return null;
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
