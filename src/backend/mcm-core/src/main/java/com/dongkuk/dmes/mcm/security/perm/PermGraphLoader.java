package com.dongkuk.dmes.mcm.security.perm;

import java.util.Set;

/**
 * 권한 그래프 로더.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: DB 에서 {@link PermGraph} 를 읽는 계약. 구현은 load 레인이 맡는다.
 */
public interface PermGraphLoader {
    /** 지정 사용자에게 닿는 범위만 읽는다. */
    PermGraph loadForUsers(Set<String> userIds);

    /** 전체를 읽는다. */
    PermGraph loadAll();
}
