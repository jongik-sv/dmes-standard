package com.dongkuk.dmes.mcm.security.perm;

import java.util.List;

/**
 * 영향 계산기.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 변경 전후 그래프를 비교해 사용자×오브젝트별 action 증감을 낸다. 구현은 impl 레인이 맡는다.
 */
public interface ImpactCalculator {
    List<UserImpact> diff(PermGraph before, PermGraph after);
}
