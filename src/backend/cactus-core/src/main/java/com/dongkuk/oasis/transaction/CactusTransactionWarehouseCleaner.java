package com.dongkuk.oasis.transaction;

/**
 * 현재 스레드의 OASIS 트랜잭션 보관소를 끝내는(비우는) cactus 쪽 다리 — 쓰기는 이것 하나다 (refactor/framework-txfix, 2026-10-04).
 *
 * <p>oasis {@code SpringTransactionHandler.execute()} 는 {@code ThreadLocalTransactionWarehouseHolder.begin()} 과
 * 트랜잭션 시작 반복문을 {@code try} 밖에 둬서, 두 번째 트랜잭션 매니저 시작이 실패하면 먼저 시작된 트랜잭션이
 * 스레드에 묶인 채 {@code end()} 가 돌지 않는다. {@code com.dongkuk.dmes.cactus.oasis.CactusSpringTransactionHandler}
 * 가 그 경우 먼저 시작된 트랜잭션을 롤백한 뒤 이 메서드로 보관소를 끝낸다. 부모 {@code execute()} finally 가 하는 일과
 * 같은 동작이고, 두 번 불려도 안전하다(보관소 제거 + 상태 IDLE).
 *
 * <p>읽기 전용 다리 {@link CactusTransactionWarehouseView} 와 나눈 까닭은 그쪽을 읽기 전용으로 두기 위해서다.
 *
 * <p><b>oasis 내부 패키지(package-private 클래스)에 기댄다 — oasis 버전을 올릴 때 반드시 확인한다.</b>
 * 기대는 것: {@code ThreadLocalTransactionWarehouseHolder.end()} 가 보관소를 지우고 상태를 IDLE 로 돌린다는 것.
 */
public final class CactusTransactionWarehouseCleaner {

    private CactusTransactionWarehouseCleaner() {
    }

    /** 현재 스레드의 보관소를 지우고 상태를 IDLE 로 돌린다 — oasis {@code ThreadLocalTransactionWarehouseHolder.end()} 그대로. */
    public static void end() {
        ThreadLocalTransactionWarehouseHolder.end();
    }
}
