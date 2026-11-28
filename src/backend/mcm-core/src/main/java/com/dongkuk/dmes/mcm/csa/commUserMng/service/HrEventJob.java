/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: 예약 작업 mcm.hrEventProcess — ERP 인사 정보 대기·실패 건을 10분마다 처리한다(D8)
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.agent.JobContext;
import com.dongkuk.dmes.mcm.job.agent.ScheduledJob;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * ERP 인사 정보 처리 예약 작업. 발령일이 된 대기 건과 자동 재시도(5회) 안의 실패 건을 처리한다.
 * 일정·사용 여부는 예약 작업 관리 화면에서 바꾼다(처음 등록 때만 기본 일정을 넣는다).
 */
@Component
public class HrEventJob implements ScheduledJob {

    private final CommUserMngHrService hrService;

    public HrEventJob(CommUserMngHrService hrService) {
        this.hrService = hrService;
    }

    @Override
    public String id() {
        return "mcm.hrEventProcess";
    }

    @Override
    public JobModule module() {
        return JobModule.MCM;
    }

    @Override
    public String name() {
        return "ERP 인사 정보 처리";
    }

    @Override
    public String defaultCron() {
        return "*/10 * * * *";
    }

    @Override
    public Duration defaultTimeout() {
        return Duration.ofMinutes(10);
    }

    @Override
    public int run(JobContext ctx) {
        return hrService.processPending();
    }
}
