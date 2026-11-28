/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: 계정 한 줄 읽기 — 로그인·토큰 갱신·세션 판정·비밀번호 변경이 같은 값을 보게 한다
 */
package com.dongkuk.dmes.mcm.security.account;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

/**
 * {@code TB_MCM_SEC_USER} + {@code TB_MCM_SEC_USER_PWD} 를 {@link McmAccount} 로 읽는다.
 *
 * <p>쓰지 않는다. 트랜잭션은 부르는 쪽 것을 따른다.
 */
@Component
public class McmAccountReader {

    static final String SQL =
            "SELECT U.USER_ID, U.USER_NM, U.USER_EMP_NO, U.USE_TP, U.START_ACTIVE_DATE, U.END_ACTIVE_DATE, "
            + "       U.HR_ST, U.IN_OUT_EMP_TP, U.LOCK_YN, U.LOCK_AT, U.LOCK_CNT, U.PWD_FAIL_COUNT, "
            + "       U.PWD_EXPIRY_EXEMPT_YN, P.USER_ENC_PWD, P.LAST_PWD_CHNG_DATE, P.TEMP_PWD_EXPIRATION_DATE "
            + "  FROM MCMAPUSER.TB_MCM_SEC_USER U, MCMAPUSER.TB_MCM_SEC_USER_PWD P "
            + " WHERE U.USER_ID = :userId "
            + "   AND P.USER_ID(+) = U.USER_ID";

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    /** 계정 한 줄. 없으면 empty. */
    @SuppressWarnings("unchecked")
    public Optional<McmAccount> find(String userId) {
        if (userId == null || userId.isBlank()) return Optional.empty();
        List<Object[]> rows = entityManager.createNativeQuery(SQL)
                .setParameter("userId", userId)
                .getResultList();
        if (rows == null || rows.isEmpty()) return Optional.empty();
        return Optional.of(map(rows.get(0)));
    }

    static McmAccount map(Object[] r) {
        return new McmAccount(
                str(r[0]), str(r[1]), str(r[2]), str(r[3]),
                ldt(r[4]), ldt(r[5]),
                str(r[6]), str(r[7]), str(r[8]), ldt(r[9]),
                num(r[10]), num(r[11]),
                "Y".equals(str(r[12])),
                str(r[13]), ldt(r[14]), ldt(r[15]));
    }

    private static String str(Object v) {
        return v == null ? null : v.toString();
    }

    private static long num(Object v) {
        return v instanceof Number n ? n.longValue() : 0L;
    }

    static LocalDateTime ldt(Object v) {
        if (v == null) return null;
        if (v instanceof LocalDateTime ldt) return ldt;
        if (v instanceof java.sql.Timestamp ts) return ts.toLocalDateTime();
        if (v instanceof java.sql.Date d) return d.toLocalDate().atStartOfDay();
        if (v instanceof java.time.LocalDate ld) return ld.atStartOfDay();
        if (v instanceof java.util.Date jd) return LocalDateTime.ofInstant(jd.toInstant(), ZoneId.systemDefault());
        return null;
    }
}
