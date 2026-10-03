package com.dongkuk.dmes.mcm.widget.common;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 사용자별 고정 구간 호출 수 상한(메모리) — 위젯이 외부 API·LLM 처럼 비용이 드는 호출을 일으키는 빈도를 막는다.
 * 구간은 부르는 쪽이 정한다(환율: 10분 칸 번호, 챗봇: 서울 날짜의 epochDay). 구간이 바뀌면 그 사용자의 수는 0 부터 다시 센다.
 * <ul>
 *   <li>세기와 확인은 한 잠금 안에서 함께 한다(동시 요청이 함께 상한을 넘지 못한다).</li>
 *   <li>사용자 수는 {@code maxUsers} 까지(가장 오래 안 쓴 사용자부터 버린다) — 아무 사용자 ID 로 메모리를 채우지 못하게.</li>
 *   <li>서버를 다시 띄우면 0 부터 센다. 인스턴스가 여럿이면 인스턴스마다 따로 센다(다중 인스턴스 합산은 범위 밖).</li>
 * </ul>
 */
public final class WidgetUserQuota {

    private record Window(long period, int count) {}

    private final Map<String, Window> windows;

    public WidgetUserQuota(int maxUsers) {
        if (maxUsers < 1) throw new IllegalArgumentException("maxUsers 는 1 이상이어야 합니다: " + maxUsers);
        this.windows = new LinkedHashMap<>(64, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, Window> eldest) {
                return size() > maxUsers;
            }
        };
    }

    /** {@code period} 구간에서 {@code userId} 의 수를 하나 늘린다. 이미 {@code limit} 이면 늘리지 않고 false. */
    public synchronized boolean tryAcquire(String userId, long period, int limit) {
        String key = userId == null ? "" : userId;
        Window w = windows.get(key);
        int used = w == null || w.period() != period ? 0 : w.count();
        if (used >= limit) return false;
        windows.put(key, new Window(period, used + 1));
        return true;
    }

    /** {@code period} 구간에서 {@code userId} 가 쓴 수. */
    public synchronized int used(String userId, long period) {
        Window w = windows.get(userId == null ? "" : userId);
        return w == null || w.period() != period ? 0 : w.count();
    }

    /** 시험용 — 기억하는 사용자 수. */
    public synchronized int size() {
        return windows.size();
    }
}
