package com.dongkuk.dmes.cactus.scheduling;

import ch.qos.logback.classic.LoggerContext;
import com.dongkuk.oasis.TraceConstants;
import com.dongkuk.oasis.logger.MDCTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.slf4j.event.Level;
import org.springframework.scheduling.SchedulingAwareRunnable;
import org.springframework.scheduling.support.ScheduledMethodRunnable;
import org.springframework.util.ClassUtils;
import org.springframework.util.ReflectionUtils;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;

/**
 * 예약 작업 한 번의 실행을 요청 처리와 같은 로그 태그로 감싼다.
 *
 * <p>logback 공통 패턴 {@code [%X{service_tag}] [%X{serviceId}]} 는 예약 작업 스레드에서 비어 있어,
 * 로그 뷰어(analog)가 그 줄들을 어느 서비스에도 묶지 못했다. 요청 경로({@code TxIdFilter}·
 * {@code OasisServiceExecutor})와 같은 방식으로 실행마다 다음을 넣는다.
 * <ul>
 *   <li>{@code service_tag}: OASIS {@link MDCTemplate} 이 만드는 랜덤 4자리</li>
 *   <li>{@code serviceId}: 작업 이름, 예: {@code sch.mcm.widgetCollector.collectMinute}
 *       ({@code sch.<모듈>.<클래스>.<메서드>}, 모듈은 logback 의 {@code DMES_MODULE} 값)</li>
 * </ul>
 * 이 {@code sch.} 접두어로 {@link ScheduledJobLogFilter} 가 예약 작업 줄을 업무 로그에서 빼
 * {@code logs/sch/dmes-sch.log} 한 파일로 모은다.
 * 끝나면 {@link MDCTemplate} 이 MDC 를 비우므로 스레드 풀의 다음 작업으로 새지 않는다.
 *
 * <p>작업 이름은 {@code serviceId/action} 줄의 정규식({@code [\w.-]+/\w+})에 맞게 콜론 없이 만든다.
 * analog 서비스 목록은 태그가 있는 줄이면 항목을 만들고 소요 시간은 아래 끝 줄에서 읽는다.
 * <pre>
 * sch.widgetCollector.collectMinute/run
 * Service end - service name [sch.widgetCollector.collectMinute] RunTime : [12]
 * </pre>
 * 이 두 줄은 {@code OasisServiceExecutor} 와 같은 문구라 analog 쪽 수정이 필요 없다.
 */
public final class ScheduledJobLogContext {

    private static final Logger log = LoggerFactory.getLogger(ScheduledJobLogContext.class);

    /** 작업 이름 앞에 붙여 요청 서비스와 구분한다. */
    static final String NAME_PREFIX = "sch.";

    /** {@code dmes-logback-base.xml} 이 logback 컨텍스트에 올리는 모듈 id(mcm, mdm 등). */
    static final String MODULE_PROPERTY = "DMES_MODULE";

    private ScheduledJobLogContext() {
    }

    /**
     * {@code sch.<모듈>.<이름>} 형태의 작업 이름을 만든다. 모듈 id 를 알 수 없으면(logback 설정이 없는 시험 등)
     * {@code sch.<이름>} 으로 둔다. 자체 실행기에서 {@link #run} 을 직접 부르는 쪽이 쓴다.
     */
    public static String jobName(String name) {
        String module = moduleId();
        return module == null ? NAME_PREFIX + name : NAME_PREFIX + module + "." + name;
    }

    /** 시작·끝 줄을 INFO 로 남기며 실행한다. */
    public static void run(String jobName, Runnable task) {
        run(jobName, Level.INFO, task);
    }

    /**
     * 시작·끝 줄을 DEBUG 로 낮춰 실행한다. 몇 초 간격으로 도는 작업이 운영 로그를 채우지 않게 할 때 쓴다.
     * 태그와 이름은 INFO 일 때와 똑같이 들어간다.
     */
    public static void runQuiet(String jobName, Runnable task) {
        run(jobName, Level.DEBUG, task);
    }

    /** 실행 때마다 {@link #run} 으로 감싼 Runnable 을 돌려준다. 이름은 감쌀 때 한 번만 만든다. */
    public static Runnable wrap(Runnable task) {
        String jobName = jobNameOf(task);
        if (task instanceof SchedulingAwareRunnable aware) {
            // @Scheduled(scheduler = "...") 의 qualifier 를 스케줄러 라우터가 이 인터페이스로 읽는다 — 감싸도 그대로 보인다.
            return new SchedulingAwareRunnable() {
                @Override
                public void run() {
                    ScheduledJobLogContext.run(jobName, task);
                }

                @Override
                public boolean isLongLived() {
                    return aware.isLongLived();
                }

                @Override
                public String getQualifier() {
                    return aware.getQualifier();
                }
            };
        }
        return () -> run(jobName, task);
    }

    /** 이미 요청 등으로 태그가 있는 스레드에서 불리면 그 태그를 그대로 두고 작업만 실행한다. */
    private static void run(String jobName, Level boundaryLevel, Runnable task) {
        if (MDC.get(TraceConstants.SERVICE_TAG) != null) {
            task.run();
            return;
        }
        new MDCTemplate() {
            @Override
            public void process() {
                MDC.put("serviceId", jobName);
                long startedAt = System.currentTimeMillis();
                log.atLevel(boundaryLevel).log("{}/run", jobName);
                try {
                    task.run();
                } catch (RuntimeException | Error e) {
                    // 스택은 스프링 오류 처리기가 남긴다. 여기서는 분석기가 ERROR 로 표시하도록 한 줄만 태그와 함께 남긴다.
                    log.error("예약 작업 실패 [{}]: {}", jobName, e.toString());
                    throw e;
                } finally {
                    log.atLevel(boundaryLevel).log("Service end - service name [{}] RunTime : [{}]",
                            jobName, System.currentTimeMillis() - startedAt);
                }
            }
        }.mdc(null);
    }

    /**
     * {@code @Scheduled} 메서드는 {@code sch.클래스.메서드}, 그 밖의 Runnable 은 {@code sch.클래스} 로 이름을 짓는다.
     * 프록시 빈은 원래 클래스 이름을 쓴다.
     */
    static String jobNameOf(Runnable task) {
        task = unwrapSpring(task);
        if (task instanceof ScheduledMethodRunnable m) {
            Class<?> type = ClassUtils.getUserClass(m.getTarget());
            return jobName(lowerFirst(type.getSimpleName()) + "." + m.getMethod().getName());
        }
        Class<?> type = ClassUtils.getUserClass(task);
        String simple = type.getSimpleName();
        return jobName(simple.isEmpty() ? "anonymous" : lowerFirst(simple));
    }

    private static String moduleId() {
        try {
            if (LoggerFactory.getILoggerFactory() instanceof LoggerContext context) {
                String module = context.getProperty(MODULE_PROPERTY);
                return module == null || module.isBlank() ? null : module;
            }
        } catch (LinkageError e) {
            // logback 이 없는 환경 — 모듈 없이 이름만 쓴다.
        }
        return null;
    }

    /**
     * 스프링이 {@code @Scheduled} 메서드 Runnable 을 실행 결과 추적용 래퍼({@code Task$OutcomeTrackingRunnable})와
     * 오류 처리 래퍼로 한 겹씩 더 싸서 넘긴다. 이름을 만들려고 그 안쪽을 꺼낸다.
     * 스프링 내부 필드를 읽으므로 구조가 바뀌어 못 찾으면 바깥 래퍼 이름으로 대신하고(로그는 계속 찍힌다),
     * 시험({@code ScheduledJobLogContextTest})이 업그레이드 때 이를 알려 준다.
     */
    private static Runnable unwrapSpring(Runnable task) {
        for (int depth = 0; depth < 5 && !(task instanceof ScheduledMethodRunnable); depth++) {
            Class<?> type = task.getClass();
            if (!type.getName().startsWith("org.springframework.scheduling.")) {
                break;
            }
            Runnable inner = null;
            for (Field f : type.getDeclaredFields()) {
                if (Runnable.class.isAssignableFrom(f.getType()) && !Modifier.isStatic(f.getModifiers())) {
                    ReflectionUtils.makeAccessible(f);
                    inner = (Runnable) ReflectionUtils.getField(f, task);
                    break;
                }
            }
            if (inner == null) {
                break;
            }
            task = inner;
        }
        return task;
    }

    private static String lowerFirst(String s) {
        return s.isEmpty() ? s : Character.toLowerCase(s.charAt(0)) + s.substring(1);
    }
}
