package com.dongkuk.dmes.mcm.widget.chat.service;

import java.util.List;

/**
 * 챗봇 find_screen 도구가 쓰는 화면 찾기(스펙 §9.2) — 현재 인증 사용자가 볼 수 있는 메뉴 중 이름에 keyword 가 든 화면.
 * 구현은 {@link MyMenuChatScreenFinder}(포털 사이드바와 같은 {@code secUser/myMenus} 조회).
 */
public interface ChatScreenFinder {

    /** 화면 하나 — pageId 는 포털 셸이 탭을 여는 값({@code {sysCd}:{componentPath}}), path 는 상위 메뉴 이름 경로. */
    record Screen(String pageId, String title, String path) {}

    List<Screen> find(String keyword, int limit);
}
