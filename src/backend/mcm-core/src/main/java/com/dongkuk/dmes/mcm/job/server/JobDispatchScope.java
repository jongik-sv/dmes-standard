package com.dongkuk.dmes.mcm.job.server;

/** 판정 서비스 실행 표시(ThreadLocal) — 트리거만 연다. 판정 몸체가 첫 줄에서 확인해 웹 경로로 부른 호출을 거절한다(설계 §8, D23 와 같은 방식). */
public final class JobDispatchScope {

    private static final ThreadLocal<Boolean> OPEN = new ThreadLocal<>();

    private JobDispatchScope() {}

    public static void open() { OPEN.set(Boolean.TRUE); }

    public static void close() { OPEN.remove(); }

    public static boolean isOpen() { return Boolean.TRUE.equals(OPEN.get()); }

    public static void require() {
        if (!isOpen()) throw new IllegalStateException("예약 작업 판정 서비스는 트리거만 부를 수 있습니다");
    }
}
