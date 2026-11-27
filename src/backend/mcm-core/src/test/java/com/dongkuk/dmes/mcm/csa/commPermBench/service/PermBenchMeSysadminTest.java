/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: searchBench 의 me(ME_SYSADMIN) 시험 — PermChangeLookup.currentUserIsSysadmin 을 그대로 쓴다
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import com.dongkuk.dmes.mcm.csa.commPermBench.dto.CommPermBenchSearchBenchRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class PermBenchMeSysadminTest {

    private static PermChangeLookup lookup(boolean sysadmin) {
        return new PermChangeLookup() {
            @Override public Map<String, ObjAllowed> objectAllowed(Collection<String> ids) { throw new UnsupportedOperationException(); }
            @Override public Map<String, Set<String>> rolesOfGroups(Collection<String> ids) { throw new UnsupportedOperationException(); }
            @Override public Set<String> existing(Target kind, Collection<String> ids) { throw new UnsupportedOperationException(); }
            @Override public boolean currentUserIsSysadmin() { return sysadmin; }
        };
    }

    private static CommPermBenchService service(PermChangeLookup lookup) {
        // searchBench 는 그래프 원천을 쓰지 않는다 — 생성자 모양이 바뀌어도 깨지지 않게 null 로 둔다
        PermBenchGraphSource graphs = new PermBenchGraphSource(null, null, null);
        return new CommPermBenchService(new CommPermBenchServiceTest.FakeQuery(), graphs, null, null, null, null, lookup);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> me(Map<String, Object> out) {
        return (List<Map<String, Object>>) out.get("me");
    }

    @Test
    @DisplayName("SYSADMIN 사용자 = ME_SYSADMIN Y, 한 줄")
    void yes() {
        Map<String, Object> out = service(lookup(true)).searchBench(new CommPermBenchSearchBenchRequest());
        assertThat(me(out)).containsExactly(Map.of("ME_SYSADMIN", "Y"));
    }

    @Test
    @DisplayName("SYSADMIN 아님 = N")
    void no() {
        Map<String, Object> out = service(lookup(false)).searchBench(new CommPermBenchSearchBenchRequest());
        assertThat(me(out)).containsExactly(Map.of("ME_SYSADMIN", "N"));
    }

    @Test
    @DisplayName("로그인 사용자 없음(판정이 false)·판정기 없는 구성 = N")
    void noUser() {
        assertThat(me(service(null).searchBench(null))).containsExactly(Map.of("ME_SYSADMIN", "N"));
    }

    @Test
    @DisplayName("기존 5 grid 뒤에 me 가 온다")
    void order() {
        assertThat(service(lookup(true)).searchBench(null).keySet())
                .containsExactly("users", "groups", "roles", "userGroups", "groupRoles", "me");
    }
}
