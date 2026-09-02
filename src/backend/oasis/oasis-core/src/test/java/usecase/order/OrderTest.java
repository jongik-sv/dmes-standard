package usecase.order;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ApplicationContext;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.utils.MapBuilder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getServiceStarter;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * @author Jeongjin Kim
 * @since 2021-05-17
 */
public class OrderTest {
    Map<String, TypedObject> applicationContextMap = new HashMap<>();
    OrderRecorderRepositorySpy orderRecorderRepositorySpy;
    OrderRepositorySpy orderRepositorySpy;
    PaymentRepositorySpy paymentRepositorySpy;
    StockApiSpy stockApi;

    @BeforeEach
    void initApplicationContext() {
        orderRecorderRepositorySpy = new OrderRecorderRepositorySpy();
        orderRepositorySpy = new OrderRepositorySpy();
        paymentRepositorySpy = new PaymentRepositorySpy();
        stockApi = new StockApiSpy();

        applicationContextMap.put("orderRecorderRepository", new TypedObject(orderRecorderRepositorySpy));
        applicationContextMap.put("orderRepository", new TypedObject(orderRepositorySpy));
        applicationContextMap.put("paymentRepository", new TypedObject(paymentRepositorySpy));
        applicationContextMap.put("stockApi", new TypedObject(stockApi));
    }

    @Test
    void immediatePaymentOrder() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/callDomainObject.bpmn");

        ApplicationContext applicationContext = new DefaultApplicationContext(applicationContextMap);

        OrderRequestDocument orderRequestDocument = new OrderRequestDocument();
        orderRequestDocument.addOrder(new Product("p1", "p1Name"), 3);
        orderRequestDocument.addOrder(new Product("p2", "p2Name"), 1);

        ServiceContext serviceContext = new DefaultServiceContext(applicationContext,
                new MapBuilder<String, TypedObject>()
                        .addEntity("orderRequestDocument", new TypedObject(orderRequestDocument))
                        .addEntity("paymentTerms", new TypedObject("ImmediatePayment"))
                        .build());

        serviceStarter.start("callDomainObject", serviceContext);

        assertThat(orderRecorderRepositorySpy.getOrders().size()).isEqualTo(1);
        assertThat(orderRepositorySpy.getOrderList().size()).isEqualTo(2);
        assertThat(paymentRepositorySpy.getPaidList().size()).isEqualTo(1);
        assertThat(stockApi.getReserveCount()).isEqualTo(4);
    }

    @Test
    void transferPaymentOrder() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/callDomainObject.bpmn");

        ApplicationContext applicationContext = new DefaultApplicationContext(applicationContextMap);

        OrderRequestDocument orderRequestDocument = new OrderRequestDocument();
        orderRequestDocument.addOrder(new Product("p1", "p1Name"), 3);
        orderRequestDocument.addOrder(new Product("p2", "p2Name"), 1);

        ServiceContext serviceContext = new DefaultServiceContext(applicationContext,
                new MapBuilder<String, TypedObject>()
                        .addEntity("orderRequestDocument", new TypedObject(orderRequestDocument))
                        .addEntity("paymentTerms", new TypedObject("transfer"))
                        .build());

        serviceStarter.start("callDomainObject", serviceContext);

        assertThat(orderRecorderRepositorySpy.getOrders().size()).isEqualTo(1);
        assertThat(orderRepositorySpy.getOrderList().size()).isEqualTo(2);
        assertThat(paymentRepositorySpy.getPaidList().size()).isEqualTo(0);
        assertThat(stockApi.getReserveCount()).isEqualTo(4);
    }

    @Test
    void inorderableOrder() {
        OutOfStockApiSpy stockApi = new OutOfStockApiSpy();
        applicationContextMap.put("stockApi", new TypedObject(stockApi));

        ServiceStarter serviceStarter = getServiceStarter("/usecase/callDomainObject.bpmn");

        ApplicationContext applicationContext = new DefaultApplicationContext(applicationContextMap);

        OrderRequestDocument orderRequestDocument = new OrderRequestDocument();
        orderRequestDocument.addOrder(new Product("p1", "p1Name"), 3);
        orderRequestDocument.addOrder(new Product("p2", "p2Name"), 1);

        ServiceContext serviceContext = new DefaultServiceContext(applicationContext,
                new MapBuilder<String, TypedObject>()
                        .addEntity("orderRequestDocument", new TypedObject(orderRequestDocument))
                        .addEntity("paymentTerms", new TypedObject("transfer"))
                        .build());

        serviceStarter.start("callDomainObject", serviceContext);

        assertThat(orderRecorderRepositorySpy.getOrders().size()).isEqualTo(1);
        assertThat(orderRepositorySpy.getOrderList().size()).isEqualTo(0);
        assertThat(paymentRepositorySpy.getPaidList().size()).isEqualTo(0);
        assertThat(stockApi.getReserveCount()).isEqualTo(0);
    }
}
