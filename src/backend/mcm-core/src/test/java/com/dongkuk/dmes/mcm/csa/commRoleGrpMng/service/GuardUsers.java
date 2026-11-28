/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: 역할·역할 그룹 시험용 사용자 행(마지막 시스템관리자 판정 시험 — perm-crudfix c5 d)
 */
package com.dongkuk.dmes.mcm.csa.commRoleGrpMng.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

/**
 * {@code CommSecMngFixtures} 는 사용자 표를 만들지 않는다. SYSADMIN 보유자 판정은 사용자 행(USE_TP·기간)을 보므로
 * {@code GUARD_} 로 시작하는 사용자를 넣고 시험 뒤 지운다. 시험 패키지라 운영 빈이 아니다(시험 구성의 컴포넌트 스캔이 잡는다).
 */
@Component
public class GuardUsers {

    private final JdbcTemplate jdbc;

    public GuardUsers(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    /** 활성 사용자 한 명(USE_TP=Y, 2026-01-01 ~ 9999-12-31). ID 는 GUARD_ 로 시작해야 한다. */
    public void user(String userId) {
        if (!userId.startsWith("GUARD_")) throw new IllegalArgumentException("GUARD_ 접두 필요: " + userId);
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_USER (USER_ID, USER_NM, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE) "
                + "VALUES (?, ?, 'Y', DATE '2026-01-01', DATE '9999-12-31')", userId, "시험 " + userId);
    }

    /** GUARD_ 사용자와 그 매핑을 지운다. */
    public void clear() {
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_USER_MAPPING WHERE USER_ID LIKE 'GUARD\\_%' ESCAPE '\\'");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_USER WHERE USER_ID LIKE 'GUARD\\_%' ESCAPE '\\'");
    }
}
