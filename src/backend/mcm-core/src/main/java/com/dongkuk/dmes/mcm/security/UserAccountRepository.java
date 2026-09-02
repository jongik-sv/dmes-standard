package com.dongkuk.dmes.mcm.security;

import java.util.List;
import java.util.Optional;

/**
 * 사용자 계정 저장소 추상화 — mcm-core SPI.
 *
 * <p>{@link UserAccount} 의 영속화를 위임받는 저장소. 사이트가 본 인터페이스 구현 빈을
 * 등록하면 mcm-core 의 {@code SecUserService} 가 이를 통해 사용자 CRUD 를 수행한다.
 *
 * <p>본 템플릿의 mcm 런처는 cactus.SecUserRepository 를 위임하는 어댑터 빈을 사이트 슬라이스
 * (`com.dongkuk.dmes.mcm.adapter`) 에 등록한다.
 */
public interface UserAccountRepository {

    Optional<UserAccount> findById(String userId);

    boolean existsById(String userId);

    /** 신규 또는 기존 사용자 저장. 어댑터가 UserAccount → 구현체 클래스 변환 책임. */
    UserAccount save(UserAccount account);

    void deleteById(String userId);

    /** 페이지네이션 미사용 — 소규모 SI 환경 가정. 필요 시 추후 확장. */
    List<UserAccount> findAll();
}
