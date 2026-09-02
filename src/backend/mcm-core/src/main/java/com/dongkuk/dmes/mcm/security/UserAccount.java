package com.dongkuk.dmes.mcm.security;

import java.time.Instant;
import java.time.LocalDate;

/**
 * 사용자 계정 추상화 — mcm-core 가 사용자 정보를 다루기 위한 SPI.
 *
 * <p>본 인터페이스는 mcm-core 가 cactus-core 의 {@code SecUser} 또는 다른 사이트의 자체
 * 사용자 클래스를 직접 import 하지 않고도 동작하게 하기 위한 추상화다.
 *
 * <p>의존 방향 정책 (절대 원칙):
 * <ul>
 *   <li>mcm-core 는 cactus / oasis / aps / 사이트 패키지를 import 하지 않는다.</li>
 *   <li>본 인터페이스의 구현체는 사이트(SI 프로젝트) 책임 — 본 템플릿의 mcm 런처는 cactus.SecUser
 *       위임 어댑터를 작성, 다른 사이트는 자체 인증 시스템에 맞춰 작성.</li>
 * </ul>
 *
 * <p>필드 의미: cactus.SecUser / mui TB_MCM_SEC_USER 컬럼 매핑.
 */
public interface UserAccount {

    String getUserId();

    String getUserNm();
    void setUserNm(String userNm);

    String getUserEmpNo();
    void setUserEmpNo(String userEmpNo);

    /** 해시된 비밀번호. 평문 저장 금지. */
    String getUserPass();
    void setUserPass(String hashedPassword);

    /** 'Y' / 'N' */
    String getUseYn();
    void setUseYn(String useYn);

    /** 'Y' / 'N' — 잠김 여부 */
    String getLockYn();
    void setLockYn(String lockYn);

    /** 로그인 실패 시도 횟수. nullable */
    Integer getTryCnt();
    void setTryCnt(Integer tryCnt);

    /** 'Y' / 'N' — 비번 초기화 필요 여부 (사용자가 다음 로그인에서 변경 강제) */
    String getPassInitYn();
    void setPassInitYn(String passInitYn);

    /** 마지막 비번 변경일. 만료 정책에 사용 */
    LocalDate getPassSetDd();
    void setPassSetDd(LocalDate passSetDd);

    String getDeptCd();
    void setDeptCd(String deptCd);

    // ── Audit timestamps (read-only — 영속화 시 자동 채움) ──
    /** 생성 사용자 ID. 미영속 신규 row 는 null. */
    default String getCreatedBy() { return null; }
    /** 생성 시각. 미영속 신규 row 는 null. */
    default Instant getCreatedAt() { return null; }
    /** 마지막 수정 사용자 ID. 미영속 신규 row 는 null. */
    default String getUpdatedBy() { return null; }
    /** 마지막 수정 시각. 미영속 신규 row 는 null. */
    default Instant getUpdatedAt() { return null; }
}
