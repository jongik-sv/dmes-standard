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
import com.dongkuk.dmes.mcm.repository.SecUserPwdRepository;
import com.dongkuk.dmes.mcm.security.account.AccountState;
import com.dongkuk.dmes.mcm.security.account.McmAccount;
import com.dongkuk.dmes.mcm.security.account.McmAccountReader;
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
 * <p>2026-11-28 (V24) — 잠금은 LOCK_YN·LOCK_AT·LOCK_CNT 로 따로 담는다. 아래 매핑 설명 중 「USE_TP='N' → 잠금」은
 * 옛 동작이다. 계정 값은 {@link McmAccountReader} 하나가 읽는다.
 *
 * <p>cactus AuthService (login / refresh) 가 사용하는 메서드만 실제 구현:
 * <ul>
 *   <li>{@link #findById(String)} — TB_MCM_SEC_USER + TB_MCM_SEC_USER_PWD JOIN → cactus.SecUser 로 매핑</li>
 *   <li>{@link #lockUser(String)} — LOCK_YN='Y'·LOCK_AT·LOCK_CNT+1</li>
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
    private final McmAccountReader accountReader;

    public McmSecUserRepository(SecUserPwdRepository secUserPwdRepository, McmAccountReader accountReader) {
        this.secUserPwdRepository = secUserPwdRepository;
        this.accountReader = accountReader;
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
    public Optional<SecUser> findById(String userId) {
        return accountReader.find(userId).map(McmSecUserRepository::toSecUser);
    }

    /**
     * 로그인·토큰 갱신·세션 판정용 계정 한 줄 — 상태 칸(LOCK_YN·HR_ST·임시 비밀번호)까지 담는다.
     */
    @Transactional(readOnly = true)
    public Optional<McmAccount> findAccount(String userId) {
        return accountReader.find(userId);
    }

    /**
     * cactus.SecUser 로 옮긴다(2026-11-28 V24 뒤).
     * <ul>
     *   <li>useYn = 'Y' 는 USE_TP='Y' 이고 인사 휴직·퇴직이 아닐 때만</li>
     *   <li>lockYn = LOCK_YN(비밀번호 실패 잠금). 전에는 칸이 없어 늘 'N' 이었다</li>
     *   <li>passInitYn = 마지막 변경일이 비면 'Y'(임시 비밀번호). 전에는 늘 'N' 이었다</li>
     * </ul>
     */
    static SecUser toSecUser(McmAccount a) {
        SecUser user = new SecUser();
        user.setUserId(a.userId());
        user.setUserNm(a.userNm());
        user.setUserNo(a.userEmpNo());
        boolean hrBlocked = AccountState.HR_LEAVE.equals(a.hrSt()) || AccountState.HR_RETIRED.equals(a.hrSt());
        user.setUseYn("Y".equals(a.useTp()) && !hrBlocked ? "Y" : "N");
        user.setLockYn(a.locked() ? "Y" : "N");
        user.setValidStrDd(a.startActiveDate() == null ? null : a.startActiveDate().toLocalDate());
        user.setValidEndDd(a.endActiveDate() == null ? null : a.endActiveDate().toLocalDate());
        user.setTryCnt((int) a.pwdFailCount());
        user.setUserPass(a.userEncPwd());
        user.setPassSetDd(a.lastPwdChngDate() == null ? null : a.lastPwdChngDate().toLocalDate());
        user.setPassInitYn(a.tempPassword() ? "Y" : "N");
        return user;
    }

    /**
     * 로그인 성공 — 실패 횟수와 연속 잠금 횟수를 0 으로. TB_MCM_SEC_USER.PWD_FAIL_COUNT = 0, LOCK_CNT = 0.
     */
    @Override
    @Transactional
    public void resetTryCnt(String userId) {
        if (userId == null || userId.isBlank()) return;
        int updated = entityManager.createNativeQuery(
                "UPDATE MCMAPUSER.TB_MCM_SEC_USER SET PWD_FAIL_COUNT = 0, LOCK_CNT = 0 WHERE USER_ID = :userId")
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
     * 비밀번호 실패 잠금 — LOCK_YN='Y', LOCK_AT=지금, LOCK_CNT+1 (V24). USE_TP 는 건드리지 않는다
     * (전에는 USE_TP='N' 으로 잠가 관리자 비활성·삭제와 구분이 안 됐다).
     */
    @Override
    @Transactional
    public void lockUser(String userId) {
        if (userId == null || userId.isBlank()) return;
        int updated = entityManager.createNativeQuery(
                "UPDATE MCMAPUSER.TB_MCM_SEC_USER "
                        + "   SET LOCK_YN = 'Y', LOCK_AT = LOCALTIMESTAMP, LOCK_CNT = COALESCE(LOCK_CNT, 0) + 1 "
                        + " WHERE USER_ID = :userId")
                .setParameter("userId", userId)
                .executeUpdate();
        if (updated == 0) log.debug("[McmSecUserRepository] lockUser — userId {} 미존재", userId);
    }

    /**
     * 관리자 잠금 해제 — LOCK_YN='N', 실패 횟수·연속 잠금 횟수 0. 비밀번호는 그대로 둔다(시안 「잠금 해제 (비밀번호 유지)」).
     */
    @Override
    @Transactional
    public void unlockUser(String userId) {
        if (userId == null || userId.isBlank()) return;
        int updated = entityManager.createNativeQuery(
                "UPDATE MCMAPUSER.TB_MCM_SEC_USER SET LOCK_YN = 'N', LOCK_AT = NULL, PWD_FAIL_COUNT = 0, LOCK_CNT = 0 "
                        + " WHERE USER_ID = :userId")
                .setParameter("userId", userId)
                .executeUpdate();
        if (updated == 0) log.debug("[McmSecUserRepository] unlockUser — userId {} 미존재", userId);
    }

    /**
     * SYSADMIN 시간 잠금이 지나 저절로 푼다 — LOCK_YN='N', 실패 횟수 0. 연속 잠금 횟수(LOCK_CNT)는 남겨
     * 다시 잠기면 더 길게 잠근다(D15). 로그인 성공 때 {@link #resetTryCnt} 가 0 으로 되돌린다.
     */
    @Transactional
    public void releaseTimedLock(String userId) {
        if (userId == null || userId.isBlank()) return;
        entityManager.createNativeQuery(
                "UPDATE MCMAPUSER.TB_MCM_SEC_USER SET LOCK_YN = 'N', PWD_FAIL_COUNT = 0 WHERE USER_ID = :userId")
                .setParameter("userId", userId)
                .executeUpdate();
    }

    /**
     * 비밀번호 변경 반영 — TB_MCM_SEC_USER_PWD 가 비밀번호 SoT 이므로 그 테이블을 갱신한다.
     *
     * <p>{@link #findById(String)} 가 USER_ENC_PWD 를 TB_MCM_SEC_USER_PWD 에서 읽는 것과
     * 짝을 이룬다. TB_MCM_SEC_USER 쪽엔 PWD 컬럼이 없어(스키마에 PWD_FAIL_COUNT 만 존재)
     * 잠금 횟수 초기화만 네이티브 UPDATE 로 함께 쓴다.
     *
     * <p>JpaRepository#save 를 쓸 수 없는 이유: 이 저장소는 세션 저장소가 아니라 네이티브 쿼리
     * 위주 별도 구현이라 save 전부가 미구현 stub 이다(아래 unsupported()).
     *
     * @return 반영 행 수 — 0 이면 PWD 행이 없어 호출측이 INSERT 로 이어야 한다
     */
    @Transactional
    public int updatePassword(String userId, String hashedPassword) {
        if (userId == null || userId.isBlank() || hashedPassword == null) return 0;
        int updated = secUserPwdRepository.updateEncPwd(userId, hashedPassword, LocalDateTime.now());
        entityManager.createNativeQuery(
                "UPDATE MCMAPUSER.TB_MCM_SEC_USER SET PWD_FAIL_COUNT = 0 WHERE USER_ID = :userId")
                .setParameter("userId", userId)
                .executeUpdate();
        return updated;
    }

    /**
     * PWD 행이 없는 계정에 비밀번호 행을 새로 만든다 (초기 비밀번호 부여 경로).
     */
    @Transactional
    public void insertPassword(String userId, String hashedPassword) {
        if (userId == null || userId.isBlank() || hashedPassword == null) return;
        if (secUserPwdRepository.findById(userId).isPresent()) return;
        entityManager.createNativeQuery(
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_USER_PWD (USER_ID, USER_ENC_PWD, LAST_PWD_CHNG_DATE) "
                        + "VALUES (:userId, :pwd, :chgDate)")
                .setParameter("userId", userId)
                .setParameter("pwd", hashedPassword)
                .setParameter("chgDate", java.sql.Date.valueOf(LocalDate.now()))
                .executeUpdate();
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
}
