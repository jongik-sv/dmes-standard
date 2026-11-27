package com.dongkuk.dmes.mcm.security.perm.impl;

import com.dongkuk.dmes.mcm.security.perm.GroupMeta;
import com.dongkuk.dmes.mcm.security.perm.MenuNode;
import com.dongkuk.dmes.mcm.security.perm.ObjMeta;
import com.dongkuk.dmes.mcm.security.perm.PermGraph;
import com.dongkuk.dmes.mcm.security.perm.RoleMeta;
import com.dongkuk.dmes.mcm.security.perm.RolePerm;
import com.dongkuk.dmes.mcm.security.perm.PermTokens;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 시험용 그래프 조립기. 시험 기준 시각 = 2026-11-27 12:00. */
final class GraphFixture {

    static final LocalDateTime NOW = LocalDateTime.of(2026, 11, 27, 12, 0);

    private final Map<String, Set<String>> userGroups = new LinkedHashMap<>();
    private final Map<String, Set<String>> groupRoles = new LinkedHashMap<>();
    private final Map<String, RoleMeta> roles = new LinkedHashMap<>();
    private final Map<String, GroupMeta> groups = new LinkedHashMap<>();
    private final Map<String, ObjMeta> objects = new LinkedHashMap<>();
    private final Map<String, Map<String, RolePerm>> rolePerms = new LinkedHashMap<>();
    private final List<MenuNode> menus = new ArrayList<>();

    static GraphFixture graph() { return new GraphFixture(); }

    GraphFixture user(String userId, String... groupIds) {
        userGroups.computeIfAbsent(userId, k -> new LinkedHashSet<>()).addAll(List.of(groupIds));
        return this;
    }

    GraphFixture group(String groupId, String... roleIds) {
        groups.putIfAbsent(groupId, new GroupMeta(groupId, "Y", null, null));
        groupRoles.computeIfAbsent(groupId, k -> new LinkedHashSet<>()).addAll(List.of(roleIds));
        for (String r : roleIds) roles.putIfAbsent(r, new RoleMeta(r, "Y", null, null));
        return this;
    }

    GraphFixture groupMeta(String groupId, String useTp, LocalDateTime start, LocalDateTime end) {
        groups.put(groupId, new GroupMeta(groupId, useTp, start, end));
        return this;
    }

    GraphFixture roleMeta(String roleId, String useTp, LocalDateTime start, LocalDateTime end) {
        roles.put(roleId, new RoleMeta(roleId, useTp, start, end));
        return this;
    }

    GraphFixture obj(String objectId, String btn, String popup) {
        return obj(objectId, "mcm", "Y", null, null, btn, popup);
    }

    GraphFixture obj(String objectId, String sys, String useTp, LocalDateTime start, LocalDateTime end,
                     String btn, String popup) {
        objects.put(objectId, new ObjMeta(objectId, sys, useTp,
                PermTokens.parse(btn), PermTokens.parse(popup), start, end));
        menus.add(new MenuNode("M_" + objectId, "cic", objectId, true, "Y"));
        return this;
    }

    GraphFixture menu(String menuId, String objectId, boolean visible, String useTp) {
        menus.removeIf(m -> m.menuId().equals("M_" + objectId));
        menus.add(new MenuNode(menuId, "cic", objectId, visible, useTp));
        return this;
    }

    GraphFixture perm(String roleId, String objectId, String btn, String popup) {
        rolePerms.computeIfAbsent(roleId, k -> new LinkedHashMap<>())
                .put(objectId, new RolePerm(roleId, objectId, PermTokens.parse(btn), PermTokens.parse(popup), null));
        return this;
    }

    PermGraph build() {
        return new PermGraph(userGroups, groupRoles, roles, groups, objects, rolePerms, menus);
    }
}
