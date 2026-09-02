package com.dongkuk.oasis.transaction;

/**
 * 스레드 로컬에 저장.
 * <p>
 * 스레드 풀을 사용할 경우 실제로 다른 스레드임에도 불구하고 같은 스레드 저장소를 사용할 수 있으므로
 * 새로운 스레드를 시작하기 전에 또는 사용 후에는 {@link ThreadLocalTransactionWarehouseHolder#end()} 메소드를 호출하도록 한다.
 *
 * @author Jeongjin Kim
 * @since 2021-05-21
 */
final class ThreadLocalTransactionWarehouseHolder {
    private static final ThreadLocal<Warehouse> warehouse = new ThreadLocal<>();
    private static final ThreadLocal<Status> status = new ThreadLocal<>();

    private ThreadLocalTransactionWarehouseHolder() {
    }

    /**
     * 현재 스레드의 트랜잭션 관리자 저장소를 반환한다.
     *
     * @param <T> 반환타입
     * @return 트랜잭션 관리자 저장소
     */
    public static <T extends Warehouse> T getWarehouse() {
        @SuppressWarnings("unchecked")
        T t = (T) warehouse.get();
        return t;
    }

    /**
     * 현재 스레드의 트랜잭션 관리자 저장소를 설정한다.
     *
     * @param holder 트랜잭션 관리자 저장소
     */
    public static void setWarehouse(Warehouse holder) {
        warehouse.set(holder);
    }

    /**
     * 현재 스레드의 트랜잭션 관리자를 제거한다.
     * 명시적으로 제거하지 않으면 다른 요청이 같은 스레드를 사용할 때 정리되지 않은 트랜잭션 관리자를 사용하기 된다.
     */
    public static void end() {
        warehouse.remove();
        status.set(Status.IDLE);
    }

    /**
     * 요청에 대한 트랜잭션을 시작한다.
     */
    public static void begin() {
        status.set(Status.STARTED);
    }

    /**
     * 데이터소스의 트랜잭션을 시작 가능여부를 반환한다.
     *
     * @return 데이터소스 트랜잭션 시작가능 여부
     */
    public static boolean canStart() {
        return status.get() == Status.STARTED;
    }

    /**
     * 요청별 트랜잭션 관리 상태.
     */
    private enum Status {
        IDLE,
        STARTED,
    }
}
