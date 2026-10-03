package com.dongkuk.oasis.transaction;

import java.util.ArrayList;
import java.util.List;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;

/**
 * 현재 스레드의 OASIS 트랜잭션 보관소를 읽기 전용으로 보여 주는 cactus 쪽 다리 (refactor/framework-tx 3b, 2026-10-04).
 *
 * <p>oasis 의 {@code ThreadLocalTransactionWarehouseHolder}·{@code TransactionManagerWarehouse}·
 * {@code TransactionManagerAndStatus} 는 모두 package-private 이라, 다른 패키지의
 * {@code SpringTransactionHandler} 하위 클래스는 시작된 트랜잭션 목록을 볼 수 없다. oasis 소스
 * ({@code src/backend/oasis})는 고치지 않으므로 cactus-core 가 같은 패키지 이름에 이 클래스 하나만 둔다.
 * 리플렉션 대신 이 방식을 쓰는 까닭은 oasis 가 이름을 바꾸면 실행 중이 아니라 컴파일에서 깨지게 하려는 것이다.
 * 같은 패키지 접근은 같은 클래스 로더일 때만 되며, 실행 jar(BOOT-INF/lib)·WAR(WEB-INF/lib) 모두 그렇다.
 *
 * <p><b>읽기 전용이다</b> — 보관소를 바꾸는 경로가 없다(2026-10-04 확인: {@code getWarehouse()} 와
 * {@code transactionManagerAndStatusList()}(사본) 만 부르고 {@link Entry} 는 값 묶음이다). 시작·종료
 * ({@code begin}/{@code end})와 등록은 oasis 가 한다. 시작 실패 정리에 필요한 {@code end()} 한 가지는 쓰기라서
 * 이 클래스가 아니라 {@link CactusTransactionWarehouseCleaner} 에 따로 둔다.
 * 쓰는 곳은 {@code com.dongkuk.dmes.cactus.oasis.CactusSpringTransactionHandler} 하나다.
 *
 * <p><b>oasis 내부 패키지(package-private 클래스)에 기댄다 — oasis 버전을 올릴 때 반드시 확인한다.</b>
 * 기대는 것: {@code ThreadLocalTransactionWarehouseHolder.getWarehouse()},
 * {@code TransactionManagerWarehouse.transactionManagerAndStatusList()} 가 시작 순서대로 사본을 돌려준다는 것,
 * {@code TransactionManagerAndStatus} 의 이름·매니저·상태 접근자. 이름이 바뀌면 컴파일에서 깨지지만,
 * 순서·사본 같은 동작이 바뀌면 컴파일은 되므로 cactus-core {@code CactusSpringTransactionHandlerTest} 로 확인한다.
 */
public final class CactusTransactionWarehouseView {

    private CactusTransactionWarehouseView() {
    }

    /**
     * 보관소에 든 트랜잭션 하나.
     *
     * @param name    트랜잭션 매니저 이름(BPMN {@code tx} 속성·{@code cactus.tx.managers} 의 별칭)
     * @param manager 트랜잭션 매니저
     * @param status  시작할 때 받은 트랜잭션 상태
     */
    public record Entry(String name, PlatformTransactionManager manager, TransactionStatus status) {
    }

    /**
     * 현재 스레드 보관소의 트랜잭션을 시작 순서대로 돌려준다. 보관소가 없으면 빈 목록이다.
     * 돌려준 목록은 사본이라 고쳐도 보관소에 영향이 없다.
     *
     * @return 시작 순서대로 늘어선 트랜잭션 목록
     */
    public static List<Entry> currentTransactions() {
        TransactionManagerWarehouse<PlatformTransactionManager, TransactionStatus> warehouse =
                ThreadLocalTransactionWarehouseHolder.getWarehouse();
        if (warehouse == null) {
            return List.of();
        }
        List<Entry> entries = new ArrayList<>();
        for (TransactionManagerAndStatus<PlatformTransactionManager, TransactionStatus> tx
                : warehouse.transactionManagerAndStatusList()) {
            entries.add(new Entry(tx.getTransactionManagerName(), tx.getTransactionManager(), tx.getTransactionStatus()));
        }
        return entries;
    }
}
