package com.dongkuk.oasis.service;

import com.dongkuk.oasis.PathElement;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.message.Message;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

class WatchServiceStarterTest {
    @Test
    void finishWithExceptionThenLogException() {
        StopWatchServiceStarter serviceStarter = new StopWatchServiceStarter(new ServiceStarter() {
            @Override
            public ServiceResult start(String serviceId, ServiceContext serviceContext) {
                return new ServiceResult() {
                    @Override
                    public ServiceResultCode serviceResultCode() {
                        return ServiceResultCode.SYSTEM_ERROR;
                    }

                    @Override
                    public String serviceResultMessage() {
                        return null;
                    }

                    @Override
                    public Throwable exception() {
                        return null;
                    }

                    @Override
                    public Map<String, TypedObject> results() {
                        return null;
                    }

                    @Override
                    public TypedObject result(String key) {
                        return null;
                    }

                    @Override
                    public List<PathElement> path() {
                        return null;
                    }

                    @Override
                    public List<Message> messages() {
                        return null;
                    }
                };
            }

            @Override
            public ServiceResult start(String serviceId) {
                return start(serviceId, null);
            }
        });

        ServiceResult start = serviceStarter.start("dd");
        Assertions.assertThat(start.serviceResultCode()).isEqualTo(ServiceResultCode.SYSTEM_ERROR);
    }
}