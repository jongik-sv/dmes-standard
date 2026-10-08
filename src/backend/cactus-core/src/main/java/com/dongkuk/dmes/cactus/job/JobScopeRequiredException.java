package com.dongkuk.dmes.cactus.job;

/** 내장 서비스가 예약 실행 범위 없이 불렸다 — 웹 경로·{@code createNewService}·병렬 게이트웨이 같은 다른 스레드의 호출이다(설계 §4.4 중첩, §8). */
public class JobScopeRequiredException extends IllegalStateException {

    public JobScopeRequiredException() {
        super("예약 실행 밖에서는 호출할 수 없습니다.");
    }
}
