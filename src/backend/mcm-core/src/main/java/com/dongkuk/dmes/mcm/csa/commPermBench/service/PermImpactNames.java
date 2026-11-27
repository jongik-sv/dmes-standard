/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: 영향 표시용 이름 조회 이음매 — 사용자·오브젝트 이름
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import java.util.Collection;
import java.util.Map;

/** 영향 화면의 USER_NM·OBJECT_NM 조회. 구현 = repository.PermImpactNameRepository, 시험에서는 가짜. */
public interface PermImpactNames {
    /** USER_ID → USER_NM. 없는 ID 는 빠진다. */
    Map<String, String> userNames(Collection<String> userIds);

    /** OBJECT_ID → OBJECT_NM. 없는 ID 는 빠진다. */
    Map<String, String> objectNames(Collection<String> objectIds);
}
