package com.dongkuk.dmes.mcm.job.agent;

import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.def.JobVar;
import java.time.Duration;
import java.util.List;

/**
 * 코드로 등록하는 예약 작업 처리기(설계 §5.2). 실행할 수 있는 「코드 실행」 작업은 이 빈뿐이다 — 화면에서 임의 클래스·메서드를 받지 않는다.
 * {@code defaultCron()} 이 있으면 모듈 앱이 기동할 때 같은 id 의 작업이 DB 에 없을 때만 자동 등록된다(일정의 정본은 DB).
 * 같은 처리기를 변수만 달리해 여러 작업으로 쓸 수 있다. 실패는 예외로 알린다.
 */
public interface ScheduledJob {

    /** 처리기 id, 예: {@code mcm.screenUsageRollup}. {@code [A-Za-z0-9_.-]{1,60}}. */
    String id();

    /** 이 처리기가 있는 모듈. 앱의 모듈 키와 같을 때만 등록·실행한다. */
    JobModule module();

    String name();

    default String defaultCron() { return null; }

    default List<JobVar> defaultVars() { return List.of(); }

    default Duration defaultTimeout() { return Duration.ofMinutes(30); }

    /** @return 처리한 건수. 실패는 예외로. */
    int run(JobContext ctx);
}
