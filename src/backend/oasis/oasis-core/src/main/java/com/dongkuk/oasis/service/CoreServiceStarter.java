package com.dongkuk.oasis.service;

import com.dongkuk.oasis.audit.AuditHolder;
import com.dongkuk.oasis.context.DefaultProcessContext;
import com.dongkuk.oasis.context.ProcessContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.event.*;
import com.dongkuk.oasis.exceptions.NoTraceException;
import com.dongkuk.oasis.exceptions.UserException;
import com.dongkuk.oasis.message.Message;
import com.dongkuk.oasis.model.ElementExecutedEvent;
import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.process.ProcessStarter;
import com.dongkuk.oasis.provider.ServiceProvider;
import com.dongkuk.oasis.transaction.TransactionHandler;

import java.util.*;

import static com.dongkuk.oasis.model.PropertyNames.ALWAYS_COMMIT_TRANSACTION_MANAGER_NAME;
import static com.dongkuk.oasis.model.PropertyNames.TRANSACTION_MANAGER_NAME;

/**
 * 서비스를 수행하고 결과를 처리하는 핵심 서비스 수행기이다.
 * <p>
 * 초기 프로세스의 속성에 {@code adapter} 이 있으면 지정한 어댑터를 서비스를 시작하기 전에 먼저 실행시킨다.
 * See, {@link ServiceAdapter}
 * <p>
 * 초기 프로세스 속성에 {@code tx}가 있으면 지정된 트랜잭션 매니저 이름을 {@code ,}로 분리하여 지정한 트랜잭션을 시작하도록 한다.
 *
 * @author Jeongjin Kim
 * @since 2021-02-10
 */
public final class CoreServiceStarter implements ServiceStarter {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(CoreServiceStarter.class);
    private final ServiceProvider serviceProvider;
    private final ProcessStarter processStarter;
    private final TransactionHandler transactionHandler;
    private final Map<Class<? extends Event>, EventHandler> eventHandlers = new HashMap<>();

    /**
     * @param serviceProvider    서비스 프로바이더
     * @param processStarter     프로세스 컨트롤러
     * @param transactionHandler 트랜잭션 핸들러
     */
    public CoreServiceStarter(ServiceProvider serviceProvider,
                              ProcessStarter processStarter,
                              TransactionHandler transactionHandler) {
        this.serviceProvider = serviceProvider;
        this.processStarter = processStarter;
        this.transactionHandler = transactionHandler;

        this.eventHandlers.put(CommitTransactionAskedEvent.class, event -> {
            for (String transactionManagerName : ((CommitTransactionAskedEvent) event).getTransactionManagerNames()) {
                transactionHandler.commitAndRestartTransaction(transactionManagerName);
            }
        });
        this.eventHandlers.put(RollbackTransactionAskedEvent.class, event -> {
            for (String transactionManagerName : ((RollbackTransactionAskedEvent) event).getTransactionManagerNames()) {
                transactionHandler.rollbackAndRestartTransaction(transactionManagerName);
            }
        });
    }

    @Override
    public ServiceResult start(String serviceId, ServiceContext serviceContext) {
        MapServiceResult result = new MapServiceResult();
        List<Message> messages = new ArrayList<>();
        boolean hasUserException = false;
        ProcessContext processContext = null;
        try {
            Service service = serviceProvider.service(serviceId);
            Process initialProcess = service.getInitialProcess();

            ServiceContext adaptedServiceContext =
                    new DefaultServiceContextAdapter().adaptServiceInput(serviceContext, initialProcess);
            adaptedServiceContext =
                    new DtoServiceContextAdapter().adaptServiceInput(adaptedServiceContext, initialProcess);

            listenAllEvents(adaptedServiceContext);
            serviceContext
                    .listenEvent(ElementExecutedEvent.class, event -> result.addPath(((ElementExecutedEvent) event)
                            .getElement()));
            serviceContext
                    .listenEvent(MessageSendEvent.class,
                            event -> messages.add(((MessageSendEvent) event).getMessage()));

            processContext = new DefaultProcessContext(adaptedServiceContext);
            ServiceFindableProcessContext serviceFindableProcessContext
                    = new ServiceFindableProcessContext(processContext, serviceProvider);

            String[] userDefinedTransactionManagerNames = getUserTransactionManagerNames(initialProcess);
            String[] alwaysCommitTransactionManagerNames = getAlwaysCommitTransactionManagerNames(initialProcess);

            AuditHolder.setAudit(serviceContext.audit());

            transactionHandler.execute(() ->
                            processStarter.start(initialProcess, serviceFindableProcessContext)
                    , userDefinedTransactionManagerNames
                    , alwaysCommitTransactionManagerNames);
        } catch (UserException e) {
            log.error(e.getMessage());
            result.setServiceResultCode(ServiceResultCode.USER_ERROR);
            result.setException(e);
            result.setServiceResultMessage(e.getMessage());
            hasUserException = true;
        } catch (NoTraceException e) {
            log.error(e.getMessage());
            result.setServiceResultCode(ServiceResultCode.SYSTEM_ERROR);
            result.setException(e);
            result.setServiceResultMessage(e.getMessage());
            hasUserException = true;
        } catch (Exception e) {
            result.setServiceResultCode(ServiceResultCode.SYSTEM_ERROR);
            result.setException(e);
            result.setServiceResultMessage(e.getMessage());
            log.error(e.getMessage(), e);
            hasUserException = true;
        } finally {
            AuditHolder.remove();
        }

        if (!hasUserException) {
            result.setServiceResultCode(ServiceResultCode.SUCCESS);
            result.setResult(processContext.elementOutputs());
        }

        result.setMessages(messages);

        return result;
    }

    @Override
    public ServiceResult start(String serviceId) {
        return start(serviceId, ServiceContext.emptyContext());
    }

    private void listenAllEvents(ServiceContext serviceContext) {
        for (Map.Entry<Class<? extends Event>, EventHandler> entry : this.eventHandlers.entrySet()) {
            serviceContext.listenEvent(entry.getKey(), entry.getValue());
        }
    }

    private String[] getUserTransactionManagerNames(Process initialProcess) {
        Property tx = initialProcess.getProperty(TRANSACTION_MANAGER_NAME);
        if (tx != null) {
            return Arrays.stream(tx.getValue().split(","))
                    .map(String::trim)
                    .toArray(String[]::new);
        }
        return null;
    }

    private String[] getAlwaysCommitTransactionManagerNames(Process initialProcess) {
        Property tx = initialProcess.getProperty(ALWAYS_COMMIT_TRANSACTION_MANAGER_NAME);
        if (tx != null) {
            return Arrays.stream(tx.getValue().split(","))
                    .map(String::trim)
                    .toArray(String[]::new);
        }
        return null;
    }
}
