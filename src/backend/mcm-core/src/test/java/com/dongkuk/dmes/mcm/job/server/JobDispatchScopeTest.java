package com.dongkuk.dmes.mcm.job.server;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class JobDispatchScopeTest {

    @AfterEach
    void close() {
        JobDispatchScope.close();
    }

    @Test
    @DisplayName("열기 전에는 require 가 거절하고, 열면 통과하고, 닫으면 다시 거절한다")
    void openClose() {
        assertThat(JobDispatchScope.isOpen()).isFalse();
        assertThatThrownBy(JobDispatchScope::require).isInstanceOf(IllegalStateException.class).hasMessageContaining("판정");
        JobDispatchScope.open();
        JobDispatchScope.require();
        JobDispatchScope.close();
        assertThat(JobDispatchScope.isOpen()).isFalse();
    }

    @Test
    @DisplayName("다른 스레드에서는 열려 있지 않다 — 웹 요청 스레드는 표시를 가질 수 없다")
    void threadLocal() throws Exception {
        JobDispatchScope.open();
        AtomicBoolean other = new AtomicBoolean(true);
        Thread t = new Thread(() -> other.set(JobDispatchScope.isOpen()));
        t.start();
        t.join();
        assertThat(other.get()).isFalse();
    }
}
