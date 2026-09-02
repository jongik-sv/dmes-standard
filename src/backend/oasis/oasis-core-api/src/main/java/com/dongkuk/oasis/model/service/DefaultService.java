package com.dongkuk.oasis.model.service;

import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.Service;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 한 번 초기화 되면 변경할 수 없음.
 * 스레드에 안전함
 *
 * @author Jeongjin Kim
 * @since 2021-01-28
 */
public class DefaultService implements Service {
    private final String serviceId;
    private final String serviceName;
    private final Map<String, ? extends Process> processesMap;
    private final String initialProcessId;

    /**
     * 서비스 생성자.
     * 모든 파라미터는 null 일 수 없음
     *
     * @param serviceId        서비스 식별자
     * @param serviceName      서비스 이름
     * @param processes        프로세스들
     * @param initialProcessId 시작 프로세스 식별자
     */
    public DefaultService(String serviceId,
                          String serviceName,
                          Collection<? extends Process> processes,
                          String initialProcessId) {
        if (serviceId == null ||
                serviceName == null ||
                processes == null ||
                initialProcessId == null)
            throw new IllegalArgumentException(
                    String.format("serviceId[%s], serviceName[%s], processes[%s], initialProcessId[%s]"
                            , serviceId, serviceName, processes, initialProcessId));

        this.serviceId = serviceId;
        this.serviceName = serviceName;

        Map<String, Process> tempMap = new HashMap<>();
        for (Process process : processes) {
            String processId = process.getId();

            if (processId == null)
                throw new IllegalArgumentException("Process ID is null");

            if (tempMap.containsKey(processId))
                throw new IllegalArgumentException(
                        String.format("A process with the same ID[%s] already exists.", processId));

            tempMap.put(processId, process);
        }

        processesMap = tempMap;

        if (!tempMap.containsKey(initialProcessId))
            throw new IllegalArgumentException(String.format("[%s] is an invalid start process ID.", initialProcessId));

        this.initialProcessId = initialProcessId;
    }

    @Override
    public String getServiceId() {
        return serviceId;
    }

    @Override
    public String getServiceName() {
        return serviceName;
    }

    @Override
    public Process getInitialProcess() {
        return getProcess(initialProcessId);
    }

    @Override
    public Process getProcess(String processId) {
        if (processesMap.containsKey(processId))
            return processesMap.get(processId);
        else
            throw new NoSuchElementException(
                    "Cannot find a process with the given ID. " +
                            "Requested ID : " + processId);
    }
}
