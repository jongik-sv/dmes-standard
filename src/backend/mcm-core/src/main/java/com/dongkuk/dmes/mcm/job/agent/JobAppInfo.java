package com.dongkuk.dmes.mcm.job.agent;

import com.dongkuk.dmes.mcm.job.JobModule;

/** 이 앱의 모듈 키 — {@code dmes.job.module} 또는 {@code spring.application.name} 첫 '-' 앞부분. */
public record JobAppInfo(JobModule module) {
}
