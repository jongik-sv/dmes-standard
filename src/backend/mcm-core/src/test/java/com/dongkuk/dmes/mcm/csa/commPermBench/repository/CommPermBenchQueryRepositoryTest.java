/*
 * 작성자: perm-z2fix
 * 작성일: 2026-11-28
 * 내용: CommPermBenchQueryRepository 의 DB 없이 보는 부분 — 역할 칸 PERM_CNT 의 SYSADMIN 판정(z2 F3)
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.repository;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CommPermBenchQueryRepositoryTest {

    @Test
    @DisplayName("rolePermCnt: SYSADMIN(별칭 ROLE_SYSADMIN·앞뒤 공백 포함)은 퍼미션 행 수와 상관없이 -1, 다른 역할은 행 수 그대로")
    void sysadminPermCntIsMinusOne() {
        assertThat(CommPermBenchQueryRepository.rolePermCnt("SYSADMIN", 0L)).isEqualTo(-1L);
        assertThat(CommPermBenchQueryRepository.rolePermCnt("SYSADMIN", 7L)).isEqualTo(-1L);
        assertThat(CommPermBenchQueryRepository.rolePermCnt("ROLE_SYSADMIN", 3L)).isEqualTo(-1L);
        assertThat(CommPermBenchQueryRepository.rolePermCnt(" SYSADMIN ", 3L)).isEqualTo(-1L);
        assertThat(CommPermBenchQueryRepository.rolePermCnt("R_VIEW", 2L)).isEqualTo(2L);
        assertThat(CommPermBenchQueryRepository.rolePermCnt("R_VIEW", 0L)).isZero();
        assertThat(CommPermBenchQueryRepository.rolePermCnt(null, 4L)).isEqualTo(4L);
    }
}
