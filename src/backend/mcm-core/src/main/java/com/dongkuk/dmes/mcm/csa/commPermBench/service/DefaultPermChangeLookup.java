/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: PermChangeLookup 의 JPA 구현 — 기존 저장소·SecurityIdentity 재사용(security/** 무수정)
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.security.perm.PermResolver;
import com.dongkuk.dmes.mcm.security.perm.PermTokens;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 「사용자가 SYSADMIN 인가」= 기존 {@code UserPermCache.isSysadmin} 과 같은 DB 사슬(사람→그룹→역할에 SYSADMIN·ROLE_SYSADMIN)만 본다.
 * 인증 컨텍스트 권한({@code hasAuthority})은 보지 않는다 — 판정 기준을 한 곳(DB)으로 둔다.
 */
@Component
public class DefaultPermChangeLookup implements PermChangeLookup {

    private final SecObjRepository objects;
    private final SecRoleGroupMappingRepository groupRoles;
    private final SecUserMappingRepository userGroups;
    private final SecurityIdentity identity;
    private final SecUserRepository users;
    private final SecRoleGroupRepository groups;
    private final SecRoleRepository roles;

    public DefaultPermChangeLookup(SecObjRepository objects, SecRoleGroupMappingRepository groupRoles,
                                   SecUserMappingRepository userGroups, SecurityIdentity identity,
                                   SecUserRepository users, SecRoleGroupRepository groups, SecRoleRepository roles) {
        this.users = users;
        this.groups = groups;
        this.roles = roles;
        this.objects = objects;
        this.groupRoles = groupRoles;
        this.userGroups = userGroups;
        this.identity = identity;
    }

    @Override
    public Map<String, ObjAllowed> objectAllowed(Collection<String> objectIds) {
        Map<String, ObjAllowed> out = new HashMap<>();
        if (objectIds == null || objectIds.isEmpty()) {
            return out;
        }
        objects.findAllById(objectIds).forEach(o -> out.put(o.getObjectId(),
                new ObjAllowed(PermTokens.parse(o.getBtnPerm()), PermTokens.parse(o.getPopupPerm()))));
        return out;
    }

    @Override
    public Set<String> existing(Target kind, Collection<String> ids) {
        Set<String> out = new HashSet<>();
        if (ids == null || ids.isEmpty()) {
            return out;
        }
        switch (kind) {
            case USER -> users.findAllById(ids).forEach(u -> out.add(u.getUserId()));
            case GROUP -> groups.findAllById(ids).forEach(g -> out.add(g.getRoleGroupId()));
            case ROLE -> roles.findAllById(ids).forEach(r -> out.add(r.getRoleId()));
        }
        return out;
    }

    @Override
    public Map<String, Set<String>> rolesOfGroups(Collection<String> groupIds) {
        Map<String, Set<String>> out = new HashMap<>();
        for (String g : groupIds) {
            List<String> roles = groupRoles.findRoleIdsByRoleGroupIdIn(List.of(g));
            out.put(g, roles == null ? Set.of() : new HashSet<>(roles));
        }
        return out;
    }

    @Override
    public boolean currentUserIsSysadmin() {
        String user = identity.currentUserId();
        if (user == null || user.isBlank()) {
            return false;
        }
        List<String> gids = userGroups.findRoleGroupIdsByUserId(user);
        if (gids == null || gids.isEmpty()) {
            return false;
        }
        List<String> roles = groupRoles.findRoleIdsByRoleGroupIdIn(gids);
        return roles != null && roles.stream().anyMatch(DefaultPermChangeLookup::isSysadminId);
    }

    private static boolean isSysadminId(String r) {
        return PermResolver.SYSADMIN_ROLE.equals(r) || ("ROLE_" + PermResolver.SYSADMIN_ROLE).equals(r);
    }
}
