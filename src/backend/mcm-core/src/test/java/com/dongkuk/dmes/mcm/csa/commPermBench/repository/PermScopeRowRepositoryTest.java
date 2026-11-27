/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: PermScopeRowRepository 의 DB 없이 보는 부분 — IN 목록 끊기 경계(500/501)와 역할 범위 줄 모양
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.repository;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PermScopeRowRepositoryTest {

    private static List<String> ids(int n) {
        List<String> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            out.add("id" + i);
        }
        return out;
    }

    @Test
    @DisplayName("chunks: 0건 = 0묶음, 500건 = 1묶음, 501건 = 2묶음(500+1), 1000건 = 2묶음, 1001건 = 3묶음")
    void chunkBoundaries() {
        assertThat(PermScopeRowRepository.CHUNK).isEqualTo(500);
        assertThat(PermScopeRowRepository.chunks(ids(0))).isEmpty();
        assertThat(PermScopeRowRepository.chunks(ids(500))).hasSize(1);
        List<List<String>> c501 = PermScopeRowRepository.chunks(ids(501));
        assertThat(c501).hasSize(2);
        assertThat(c501.get(0)).hasSize(500);
        assertThat(c501.get(1)).containsExactly("id500");
        assertThat(PermScopeRowRepository.chunks(ids(1000))).hasSize(2);
        assertThat(PermScopeRowRepository.chunks(ids(1001))).hasSize(3);
    }

    @Test
    @DisplayName("roleLine: OBJECT_ID US BTN US POPUP US DATA — 골든")
    void roleLineShape() {
        assertThat(PermScopeRowRepository.roleLine("OBJ", "find,save", "", ""))
                .isEqualTo("OBJ\u001Ffind,save\u001F\u001F");
        assertThat(PermScopeRowRepository.roleLine("OBJ", "find", "pop1", "d"))
                .isEqualTo("OBJ\u001Ffind\u001Fpop1\u001Fd");
    }
}
