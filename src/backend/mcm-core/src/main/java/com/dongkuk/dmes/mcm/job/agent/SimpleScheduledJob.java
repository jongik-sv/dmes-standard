package com.dongkuk.dmes.mcm.job.agent;

import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.def.JobVar;
import java.time.Duration;
import java.util.List;
import java.util.function.ToIntFunction;

/** 람다로 만드는 {@link ScheduledJob} — 기존 서비스의 공개 메서드를 코드 작업으로 노출할 때 쓴다. */
public final class SimpleScheduledJob implements ScheduledJob {

    private final String id;
    private final JobModule module;
    private final String name;
    private final String defaultCron;
    private final Duration timeout;
    private final List<JobVar> vars;
    private final ToIntFunction<JobContext> body;

    public SimpleScheduledJob(String id, JobModule module, String name, String defaultCron, Duration timeout, ToIntFunction<JobContext> body) {
        this(id, module, name, defaultCron, timeout, List.of(), body);
    }

    public SimpleScheduledJob(String id, JobModule module, String name, String defaultCron, Duration timeout, List<JobVar> vars,
                              ToIntFunction<JobContext> body) {
        this.id = id;
        this.module = module;
        this.name = name;
        this.defaultCron = defaultCron;
        this.timeout = timeout;
        this.vars = vars;
        this.body = body;
    }

    @Override public String id() { return id; }
    @Override public JobModule module() { return module; }
    @Override public String name() { return name; }
    @Override public String defaultCron() { return defaultCron; }
    @Override public Duration defaultTimeout() { return timeout; }
    @Override public List<JobVar> defaultVars() { return vars; }
    @Override public int run(JobContext ctx) { return body.applyAsInt(ctx); }
}
