package com.dongkuk.oasis.transaction;

import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * @author Jeongjin Kim
 * @since 2021-05-21
 */
@SuppressFBWarnings("DLS_DEAD_LOCAL_STORE")
@Execution(ExecutionMode.SAME_THREAD)
class ThreadLocalTransactionWarehouseHolderTest {
    @Test
    void mainThreadAndSubThreadHaveDifferentObject() throws InterruptedException {
        ThreadLocalTransactionWarehouseHolder.end();
        ExecutorService service = Executors.newFixedThreadPool(3);
        service.execute(() -> {
            ThreadLocalTransactionWarehouseHolder.setWarehouse(new Warehouse() {
            });
            System.out.println(ThreadLocalTransactionWarehouseHolder.getWarehouse());
        });

        service.shutdown();
        service.awaitTermination(5, TimeUnit.SECONDS);

        Warehouse transactionManagerWarehouse1 = ThreadLocalTransactionWarehouseHolder.getWarehouse();
        System.out.println(transactionManagerWarehouse1);
        Assertions.assertThat(transactionManagerWarehouse1).isNull();
    }
}