package com.dongkuk.dmes.mcm.widget.def;

/**
 * 위젯 정의를 저장·삭제한 뒤 내는 이벤트(스펙 2026-10-02-widget-admin-generic §7.3).
 * 쿼리 실행기는 이 이벤트를 받아 그 위젯의 결과 캐시를 비운다. 발행은 {@code ApplicationEventPublisher}.
 */
public record WidgetDefSavedEvent(String widgetId) {}
