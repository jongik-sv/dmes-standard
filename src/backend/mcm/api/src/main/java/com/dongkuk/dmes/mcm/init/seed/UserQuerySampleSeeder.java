package com.dongkuk.dmes.mcm.init.seed;

/**
 * 맞춤 레포트 견본 정의(Flyway V15 의 8개)를 admin 에 <b>처음 한 번만</b> 할당 — 스펙 2026-10-10-custom-report-v2-design §6.1.
 *
 * <p>정의는 Flyway V15 가 넣고(모든 DB), 할당은 이 시더가 넣는다. {@code admin} 은 {@link CoreRbacSeeder} 가 도는 DB 에만 있어
 * Flyway 로 넣으면 다른 DB 에 「없는 사용자」 할당이 남기 때문이다.
 * <ul>
 *   <li>대상은 V15 가 넣은 8개 ID 목록뿐이다. 이름이 {@code SAMPLE_} 로 시작하는 다른 정의는 건드리지 않는다.</li>
 *   <li>한 번만: V15 가 넣은 정의는 생성 서비스 표시({@code C_SVC_ID})가 {@code 'V15'} 이다. admin 이 있을 때 할당하고 표시를
 *       {@code 'V15-ASSIGNED'} 로 바꾼다(감사 칸 U_*·VER 는 건드리지 않는다). 그 뒤 관리자가 일부러 뺀 견본은 되살아나지 않는다.
 *       admin 이 없는 DB 는 표시가 남아 나중에 admin 이 생기면 그때 한 번 할당한다.</li>
 * </ul>
 * 개발자 계정 할당은 조정자가 화면에서 한다.
 */
public final class UserQuerySampleSeeder extends SeedSupport {

    /** V15 가 넣는 견본 ID 8개. */
    static final String SAMPLE_IDS = "'SAMPLE_USER_FIND', 'SAMPLE_JOB_RUN_HIST', 'SAMPLE_WIDGET_BY_CTG', 'SAMPLE_SCREEN_USAGE', "
            + "'SAMPLE_MENU_ACTIVE', 'SAMPLE_USRQ_LIST', 'SAMPLE_ROW_LIMIT', 'SAMPLE_MY_INFO'";
    private static final String ADMIN_EXISTS = "EXISTS (SELECT 1 FROM MCMAPUSER.TB_MCM_SEC_USER U WHERE U.USER_ID = 'admin')";

    public UserQuerySampleSeeder(SeedSupport support) {
        super(support);
    }

    /** 표시가 'V15' 인 견본 정의를 admin 에 할당하고 표시를 바꾼다. */
    public void seedUserQuerySamples() {
        int n = nq("INSERT INTO MCMAPUSER.TB_MCM_USRQ_ASSIGN (QUERY_ID, USER_ID" + AUDIT_COLS + ") " +
                "SELECT A.QUERY_ID, 'admin'" + AUDIT_VALS + " " +
                "FROM   MCMAPUSER.TB_MCM_USRQ_DEF A " +
                "WHERE  A.QUERY_ID IN (" + SAMPLE_IDS + ") " +
                "AND    A.C_SVC_ID = 'V15' " +
                "AND    " + ADMIN_EXISTS + " " +
                "AND    NOT EXISTS (SELECT 1 FROM MCMAPUSER.TB_MCM_USRQ_ASSIGN B " +
                "                   WHERE  B.QUERY_ID = A.QUERY_ID AND B.USER_ID = 'admin')").executeUpdate();
        nq("UPDATE MCMAPUSER.TB_MCM_USRQ_DEF SET C_SVC_ID = 'V15-ASSIGNED' " +
                "WHERE  QUERY_ID IN (" + SAMPLE_IDS + ") AND C_SVC_ID = 'V15' AND " + ADMIN_EXISTS).executeUpdate();
        if (n > 0) log.info("[DataInitializer] 맞춤 레포트 견본 {}개를 admin 에 처음 할당", n);
    }
}
