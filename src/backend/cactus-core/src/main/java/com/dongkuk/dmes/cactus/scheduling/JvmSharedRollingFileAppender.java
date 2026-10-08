package com.dongkuk.dmes.cactus.scheduling;

import ch.qos.logback.core.rolling.RollingFileAppender;

/**
 * 한 JVM 안의 여러 logback 컨텍스트가 같은 파일에 prudent 모드로 쓸 때 줄이 사라지지 않게 하는 appender.
 *
 * <p>prudent 모드는 {@code FileChannel.lock()} 으로 다른 프로세스와 쓰기를 직렬화한다. 그런데 같은 JVM 안에서 채널이 둘이면
 * 한쪽이 잡은 잠금 때문에 다른 쪽이 {@code OverlappingFileLockException} 을 던지고 logback 은 이를 잡지 못해 줄을 잃는다.
 * WildFly 개발계는 WAR 마다 logback 을 따로 가져 컨텍스트가 여럿이고 클래스 로더도 달라 정적 잠금을 공유할 수 없으므로,
 * JVM 전체에서 하나인 {@link String#intern() intern} 문자열을 모니터로 써서 JVM 안의 쓰기를 먼저 직렬화한다.
 * 프로세스 사이는 기존 prudent 파일 잠금이 맡는다.
 */
public class JvmSharedRollingFileAppender<E> extends RollingFileAppender<E> {

    private static final String JVM_MONITOR = "com.dongkuk.dmes.cactus.scheduling.JvmSharedRollingFileAppender.sch-log-file".intern();

    @Override
    protected void subAppend(E event) {
        synchronized (JVM_MONITOR) {
            super.subAppend(event);
        }
    }
}
