package com.dongkuk.dmes.mcm.widget.common;

import java.util.List;

/**
 * 위젯 서비스가 쓰는 현재 사용자 정보(스펙 2026-10-02-widget-admin-generic §4.2·§7.2·§9.2). 늘 인증 컨텍스트에서 만든다(IDOR).
 *
 * @param userId    인증 사용자 ID
 * @param userNm    사용자 이름(없으면 userId)
 * @param deptCd    부서 코드(없으면 null)
 * @param deptNm    부서 이름(없으면 null)
 * @param deptChain 자기 부서부터 위로 올라간 부서 코드 목록(자기 부서가 첫째, 최대 10단, 순환이면 거기서 멈춘다). 부서가 없으면 빈 목록
 */
public record WidgetUserContext(String userId, String userNm, String deptCd, String deptNm, List<String> deptChain) {}
