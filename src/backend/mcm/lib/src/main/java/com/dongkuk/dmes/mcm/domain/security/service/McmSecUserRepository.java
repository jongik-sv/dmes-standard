/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: cactus.SecUserRepository 를 신규 RBAC (TB_MCM_SEC_USER + TB_MCM_SEC_USER_PWD) 로 swap 하는
 *       @Primary 구현체. cactus AuthService (login / refresh) 가 호출하는 메서드만 실제 구현하고,
 *       나머지 JpaRepository 메서드는 UnsupportedOperationException stub.
 */
package com.dongkuk.dmes.mcm.domain.security.service;

import com.dongkuk.dmes.cactus.security.auth.SecUser;
import com.dongkuk.dmes.cactus.security.auth.SecUserRepository;
import com.dongkuk.dmes.mcm.entity.SecUserPwd;
import com.dongkuk.dmes.mcm.repository.SecUserPwdRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Primary;
import org.springframework.data.domain.Example;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;

/**
 * cactus {@link SecUserRepository} 의 mcm 신규 RBAC SoT swap 구현체.
 *
 * <p>Phase R7 (2026-06-01 옵션 B) — 로그인 chain 의 사용자 / 비밀번호 SoT 를
 * legacy {@code TB_SEC_USER} (cactus 기본 매핑) 에서 신규 {@code MCMAPUSER.TB_MCM_SEC_USER} +
 * {@code MCMAPUSER.TB_MCM_SEC_USER_PWD} 로 swap. cactus AuthService 가 본 구현체를 자동 주입
 * 받도록 {@code @Primary}.
 *
 * <p>cactus AuthService (login / refresh) 가 사용하는 4 메서드만 실제 구현:
 * <ul>
 *   <li>{@link #findById(String)} — TB_MCM_SEC_USER + TB_MCM_SEC_USER_PWD JOIN → cactus.SecUser 로 매핑</li>
 *   <li>{@link #lockUser(String)} — USE_TP='N' 으로 SET (TB_MCM_SEC_USER 에는 LOCK_YN 컬럼 ✗ — USE_TP 통일)</li>
 *   <li>{@link #incrementTryCnt(String)} — PWD_FAIL_COUNT++</li>
 *   <li>{@link #resetTryCnt(String)} — PWD_FAIL_COUNT=0</li>
 * </ul>
 *
 * <p>나머지 {@link org.springframework.data.jpa.repository.JpaRepository} 메서드는 cactus AuthService 가
 * 호출 ✗ — 호출 시 {@link UnsupportedOperationException}. 향후 cactus 본체에서 추가 사용 발생 시 case-by-case 확장.
 *
 * <p>매핑 룰 (TB_MCM_SEC_USER → cactus.SecUser):
 * <ul>
 *   <li>USER_ID → userId</li>
 *   <li>USER_NM → userNm</li>
 *   <li>USER_EMP_NO → userNo / userEmpNo</li>
 *   <li>TB_MCM_SEC_USER_PWD.USER_ENC_PWD → userPass</li>
 *   <li>USE_TP → useYn (Y/N — 동일 의미)</li>
 *   <li>USE_TP='N' → lockYn 'Y' fallback (TB_MCM_SEC_USER 에 LOCK_YN 별도 컬럼 미존재. cycle 2 정책)</li>
 *   <li>PWD_FAIL_COUNT (Long) → tryCnt (Integer)</li>
 *   <li>passInitYn / passSetDd / deptCd / validStrDd / validEndDd — TB_MCM_SEC_USER 매핑 (deptCd 동일,
 *       validStrDd ← START_ACTIVE_DATE, validEndDd ← END_ACTIVE_DATE, passInitYn ← 'N' default,
 *       passSetDd ← TB_MCM_SEC_USER_PWD.LAST_PWD_CHNG_DATE)</li>
 * </ul>
 */
@Component("cactusSecUserRepoMcmAdapter")
@Primary
public class McmSecUserRepository implements SecUserRepository {

    private static final Logger log = LoggerFactory.getLogger(McmSecUserRepository.class);

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    private final SecUserPwdRepository secUserPwdRepository;

    public McmSecUserRepository(SecUserPwdRepository secUserPwdRepository) {
        this.secUserPwdRepository = secUserPwdRepository;
    }

    // ─────────────────────────────────────────────────────────────────────
    // cactus AuthService 가 호출하는 4 메서드 (실제 구현)
    // ─────────────────────────────────────────────────────────────────────

    /**
     * TB_MCM_SEC_USER + TB_MCM_SEC_USER_PWD 를 조회하여 cactus.SecUser 로 변환 반환.
     *
     * <p>USER_ENC_PWD 는 TB_MCM_SEC_USER_PWD 에서 읽고, 미존재 시 null → cactus AuthService 가
     * passwordEncoder.matches(rawPwd, null) → false → AUTH_FAILED 로 처리.
     */
    @Override
    @Transactional(readOnly = true)
    @SuppressWarnings("unchecked")
    public Optional<SecUser> findById(String userId) {
        if (userId == null || userId.isBlank()) return Optional.empty();

        List<Object[]> rows = entityManager.createNativeQuery(
                "SELECT USER_ID, USER_NM, USER_EMP_NO, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE, " +
                "       DEPT_CD, PWD_FAIL_COUNT " +
                "  FROM MCMAPUSER.TB_MCM_SEC_USER WHERE USER_ID = :userId")
                .setParameter("userId", userId)
                .getResultList();
        if (rows == null || rows.isEmpty()) return Optional.empty();
        Object[] r = rows.get(0);

        SecUser user = new SecUser();
        user.setUserId(asString(r[0]));
        user.setUserNm(asString(r[1]));
        user.setUserNo(asString(r[2]));
        String useTp = asString(r[3]);
        user.setUseYn(useTp); // TB_MCM_SEC_USER.USE_TP 그대로 (Y/N 동일 의미)
        // TB_MCM_SEC_USER 에 LOCK_YN 별도 컬럼 ✗ — USE_TP='N' 이면 잠금 동등 취급.
        // login fail count 누적 분리가 필요하면 향후 LOCK_YN 컬럼 별도 추가 시 확장.
        user.setLockYn("N");
        user.setValidStrDd(toLocalDate(r[4]));
        user.setValidEndDd(toLocalDate(r[5]));
        user.setDeptCd(asString(r[6]));
        Number pwdFail = (Number) r[7];
        user.setTryCnt(pwdFail == null ? 0 : pwdFail.intValue());

        // 비밀번호 SoT — TB_MCM_SEC_USER_PWD (USER_ENC_PWD).
        Optional<SecUserPwd> pwdOpt = secUserPwdRepository.findById(userId);
        if (pwdOpt.isPresent()) {
            SecUserPwd pwd = pwdOpt.get();
            user.setUserPass(pwd.getUserEncPwd());
            user.setPassSetDd(toLocalDate(pwd.getLastPwdChngDate()));
        }
        user.setPassInitYn("N");

        return Optional.of(user);
    }

    /**
     * 로그인 실패 횟수를 0 으로 리셋. TB_MCM_SEC_USER.PWD_FAIL_COUNT = 0.
     */
    @Override
    @Transactional
    public void resetTryCnt(String userId) {
        if (userId == null || userId.isBlank()) return;
        int updated = entityManager.createNativeQuery(
                "UPDATE MCMAPUSER.TB_MCM_SEC_USER SET PWD_FAIL_COUNT = 0 WHERE USER_ID = :userId")
                .setParameter("userId", userId)
                .executeUpdate();
        if (updated == 0) log.debug("[McmSecUserRepository] resetTryCnt — userId {} 미존재", userId);
    }

    /**
     * 로그인 실패 횟수를 1 증가. TB_MCM_SEC_USER.PWD_FAIL_COUNT = COALESCE(PWD_FAIL_COUNT, 0) + 1.
     */
    @Override
    @Transactional
    public void incrementTryCnt(String userId) {
        if (userId == null || userId.isBlank()) return;
        int updated = entityManager.createNativeQuery(
                "UPDATE MCMAPUSER.TB_MCM_SEC_USER " +
                "   SET PWD_FAIL_COUNT = COALESCE(PWD_FAIL_COUNT, 0) + 1 WHERE USER_ID = :userId")
                .setParameter("userId", userId)
                .executeUpdate();
        if (updated == 0) log.debug("[McmSecUserRepository] incrementTryCnt — userId {} 미존재", userId);
    }

    /**
     * 사용자 잠금. TB_MCM_SEC_USER 에 LOCK_YN 컬럼 ✗ — USE_TP='N' 으로 SET (잠금 동등).
     */
    @Override
    @Transactional
    public void lockUser(String userId) {
        if (userId == null || userId.isBlank()) return;
        int updated = entityManager.createNativeQuery(
                "UPDATE MCMAPUSER.TB_MCM_SEC_USER SET USE_TP = 'N' WHERE USER_ID = :userId")
                .setParameter("userId", userId)
                .executeUpdate();
        if (updated == 0) log.debug("[McmSecUserRepository] lockUser — userId {} 미존재", userId);
    }

    /**
     * 사용자 잠금 해제 — USE_TP='Y' / PWD_FAIL_COUNT=0.
     */
    @Override
    @Transactional
    public void unlockUser(String userId) {
        if (userId == null || userId.isBlank()) return;
        int updated = entityManager.createNativeQuery(
                "UPDATE MCMAPUSER.TB_MCM_SEC_USER SET USE_TP = 'Y', PWD_FAIL_COUNT = 0 WHERE USER_ID = :userId")
                .setParameter("userId", userId)
                .executeUpdate();
        if (updated == 0) log.debug("[McmSecUserRepository] unlockUser — userId {} 미존재", userId);
    }

    // ─────────────────────────────────────────────────────────────────────
    // JpaRepository 의 미사용 메서드 stub (cactus AuthService 가 호출 ✗ — 호출 시 UnsupportedOperationException)
    // ─────────────────────────────────────────────────────────────────────

    private static UnsupportedOperationException unsupported(String method) {
        return new UnsupportedOperationException("McmSecUserRepository#" + method + " 는 미구현 — cactus AuthService 사용 메서드만 구현. 필요 시 case-by-case 확장.");
    }

    @Override public void flush() { throw unsupported("flush"); }
    @Override public <S extends SecUser> S saveAndFlush(S entity) { throw unsupported("saveAndFlush"); }
    @Override public <S extends SecUser> List<S> saveAllAndFlush(Iterable<S> entities) { throw unsupported("saveAllAndFlush"); }
    @Override public void deleteAllInBatch(Iterable<SecUser> entities) { throw unsupported("deleteAllInBatch"); }
    @Override public void deleteAllByIdInBatch(Iterable<String> ids) { throw unsupported("deleteAllByIdInBatch"); }
    @Override public void deleteAllInBatch() { throw unsupported("deleteAllInBatch"); }
    @Override public SecUser getOne(String id) { throw unsupported("getOne"); }
    @Override public SecUser getById(String id) { throw unsupported("getById"); }
    @Override public SecUser getReferenceById(String id) { throw unsupported("getReferenceById"); }
    @Override public <S extends SecUser> List<S> findAll(Example<S> example) { throw unsupported("findAll(Example)"); }
    @Override public <S extends SecUser> List<S> findAll(Example<S> example, Sort sort) { throw unsupported("findAll(Example, Sort)"); }
    @Override public <S extends SecUser> List<S> saveAll(Iterable<S> entities) { throw unsupported("saveAll"); }
    @Override public List<SecUser> findAll() { return Collections.emptyList(); }
    @Override public List<SecUser> findAllById(Iterable<String> ids) { throw unsupported("findAllById"); }
    @Override public <S extends SecUser> S save(S entity) { throw unsupported("save"); }
    @Override public boolean existsById(String id) { return findById(id).isPresent(); }
    @Override public long count() { throw unsupported("count"); }
    @Override public void deleteById(String id) { throw unsupported("deleteById"); }
    @Override public void delete(SecUser entity) { throw unsupported("delete"); }
    @Override public void deleteAllById(Iterable<? extends String> ids) { throw unsupported("deleteAllById"); }
    @Override public void deleteAll(Iterable<? extends SecUser> entities) { throw unsupported("deleteAll(Iterable)"); }
    @Override public void deleteAll() { throw unsupported("deleteAll"); }
    @Override public List<SecUser> findAll(Sort sort) { throw unsupported("findAll(Sort)"); }
    @Override public Page<SecUser> findAll(Pageable pageable) { throw unsupported("findAll(Pageable)"); }
    @Override public <S extends SecUser> Optional<S> findOne(Example<S> example) { throw unsupported("findOne(Example)"); }
    @Override public <S extends SecUser> Page<S> findAll(Example<S> example, Pageable pageable) { throw unsupported("findAll(Example, Pageable)"); }
    @Override public <S extends SecUser> long count(Example<S> example) { throw unsupported("count(Example)"); }
    @Override public <S extends SecUser> boolean exists(Example<S> example) { throw unsupported("exists(Example)"); }
    @Override public <S extends SecUser, R> R findBy(Example<S> example, Function<org.springframework.data.repository.query.FluentQuery.FetchableFluentQuery<S>, R> queryFunction) {
        throw unsupported("findBy");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 변환 helpers
    // ─────────────────────────────────────────────────────────────────────

    private static String asString(Object v) {
        return v == null ? null : v.toString();
    }

    private static LocalDate toLocalDate(Object v) {
        if (v == null) return null;
        if (v instanceof LocalDate ld) return ld;
        if (v instanceof LocalDateTime ldt) return ldt.toLocalDate();
        if (v instanceof java.sql.Date d) return d.toLocalDate();
        if (v instanceof java.sql.Timestamp ts) return ts.toLocalDateTime().toLocalDate();
        if (v instanceof java.util.Date jd) {
            return jd.toInstant().atZone(ZoneId.systemDefault()).toLocalDate();
        }
        return null;
    }
}
