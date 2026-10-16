package com.dongkuk.dmes.mcm.security;

/**
 * 비밀번호 해시 추상화 — mcm-core SPI.
 *
 * <p>mcm-core 가 cactus.PasswordEncoder 또는 BCrypt 라이브러리를 직접 import 하지 않고도
 * 비밀번호 해싱·검증을 수행할 수 있게 한다.
 *
 * <p>본 템플릿의 mcm 런처는 cactus.PasswordEncoder 위임 어댑터를 사이트 슬라이스에 등록.
 */
public interface PasswordHasher {

    /** 평문을 해시한다. 동일 평문에 대해 매번 다른 해시 생성 (salt 자동) 권장. */
    String encode(String rawPassword);

    /** 평문이 해시와 일치하는지 검증. */
    boolean matches(String rawPassword, String hashedPassword);
}
