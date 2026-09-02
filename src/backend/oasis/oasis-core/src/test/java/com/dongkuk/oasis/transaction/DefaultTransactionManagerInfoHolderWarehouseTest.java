package com.dongkuk.oasis.transaction;

import org.assertj.core.api.Assertions;
import autoparams.AutoSource;
import autoparams.Repeat;
import org.junit.jupiter.params.ParameterizedTest;

import java.util.List;

/**
 * @author Jeongjin Kim
 * @since 2021-05-24
 */
class DefaultTransactionManagerInfoHolderWarehouseTest {
    @ParameterizedTest
    @AutoSource
    @Repeat(3)
    void givenMultipleTxManagerAndStatusAddedShouldReturnInOrderOfThatEntered(List<String> list) {
        DefaultTransactionManagerWarehouse<Object, Object> tx = new
                DefaultTransactionManagerWarehouse<>();

        for (String s : list) {
            System.out.println(s);
            tx.putTransactionManagerAndStatus(new TransactionManagerAndStatus<>(s, null, null));
        }

        List<TransactionManagerAndStatus<Object, Object>> transactionManagerAndStatuses = tx.transactionManagerAndStatusList();
        for (int i = 0; i < transactionManagerAndStatuses.size(); i++) {
            Assertions.assertThat(transactionManagerAndStatuses.get(i).getTransactionManagerName()).isEqualTo(list.get(i));
        }
    }
}