package utils;

import org.junit.platform.engine.TestExecutionResult;
import org.junit.platform.engine.support.descriptor.ClassSource;
import org.junit.platform.launcher.TestExecutionListener;
import org.junit.platform.launcher.TestIdentifier;

/**
 * 시험 클래스 하나가 끝날 때마다 {@link OracleTestDatabase} 가 내준 연결을 닫는다.
 *
 * <p>시험들이 {@code SingleConnectionDataSource(database.getConnection(), true)} 로 연결을 쥐고 닫지 않아(H2 일 때는
 * shutdown() 이 정리했다) Oracle 세션이 JVM 이 끝날 때까지 남는다. 인스턴스를 모든 레인이 공유하므로(processes 200)
 * 클래스 단위로 정리한다. ServiceLoader 로 등록한다(META-INF/services).
 */
public class OracleConnectionCleaner implements TestExecutionListener {

    @Override
    public void executionFinished(TestIdentifier identifier, TestExecutionResult result) {
        if (identifier.isContainer() && identifier.getSource().filter(ClassSource.class::isInstance).isPresent()) {
            OracleTestDatabase.closeOpenedConnections();
        }
    }
}
