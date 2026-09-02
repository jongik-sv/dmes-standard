package com.dongkuk.oasis.model.service;

import com.dongkuk.oasis.model.Process;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.Arrays;
import java.util.List;

import static org.mockito.BDDMockito.given;

@SuppressWarnings({"ConstantConditions", "ArraysAsListWithZeroOrOneArgument"})
class DefaultServiceTest {
    @Test
    void givenAnyParamIsNullThenThrowException() {
        Process process = Mockito.mock(Process.class);

        Assertions.assertThatExceptionOfType(
                IllegalArgumentException.class
        ).isThrownBy(() -> new DefaultService(
                "sid",
                "sname",
                Arrays.asList(process),
                null));

        Assertions.assertThatExceptionOfType(
                IllegalArgumentException.class
        ).isThrownBy(() -> new DefaultService(
                "sid",
                "sname",
                null,
                "abc"));

        Assertions.assertThatExceptionOfType(
                IllegalArgumentException.class
        ).isThrownBy(() -> new DefaultService(
                "sid",
                null,
                Arrays.asList(process),
                "abc"));

        Assertions.assertThatExceptionOfType(
                IllegalArgumentException.class
        ).isThrownBy(() -> new DefaultService(
                null,
                "sname",
                Arrays.asList(process),
                "abc"));
    }

    @Test
    void givenProcessIdOfProcessIsNullThenThrowException() {
        Process process = Mockito.mock(Process.class);
        given(process.getId()).willReturn(null);

        Assertions.assertThatExceptionOfType(
                IllegalArgumentException.class
        ).isThrownBy(() -> new DefaultService(
                "sid",
                "sname",
                Arrays.asList(process),
                "pid2"));
    }

    @Test
    void givenNotExistsDefaultProcessIdThenThrowException() {
        Process process = Mockito.mock(Process.class);
        given(process.getId()).willReturn("pid");

        Assertions.assertThatExceptionOfType(
                IllegalArgumentException.class
        ).isThrownBy(() ->
                new DefaultService(
                        "sid",
                        "sname",
                        Arrays.asList(process),
                        "pid2")
        );
    }

    @Test
    void givenProcessIdThenReturnProcess() {
        Process process = Mockito.mock(Process.class);
        given(process.getId()).willReturn("pid");

        List<Process> spyProcesses = Arrays.asList(process);
        DefaultService service = new DefaultService(
                "sid",
                "sname",
                spyProcesses,
                "pid");

        Process processFromService = service.getProcess("pid");

        Assertions.assertThat(processFromService).isEqualTo(process);
    }

    @Test
    void defaultProcessShouldBeReturned() {
        Process defaultProcess = Mockito.mock(Process.class);
        given(defaultProcess.getId()).willReturn("pid");

        Process otherProcess = Mockito.mock(Process.class);
        given(otherProcess.getId()).willReturn("pid2");

        List<Process> processes = Arrays.asList(defaultProcess, otherProcess);
        DefaultService service = new DefaultService(
                "sid",
                "sname",
                processes,
                "pid");

        Process processFromService = service.getInitialProcess();

        Assertions.assertThat(processFromService).isEqualTo(defaultProcess);
    }

    @Test
    void givenProcessWithSameProcessIdThenThrowException() {
        Process defaultProcess = Mockito.mock(Process.class);
        given(defaultProcess.getId()).willReturn("pid");

        Process otherProcess = Mockito.mock(Process.class);
        given(otherProcess.getId()).willReturn("pid");

        List<Process> spyProcesses = Arrays.asList(defaultProcess, otherProcess);

        Assertions.assertThatExceptionOfType(
                IllegalArgumentException.class
        ).isThrownBy(() -> new DefaultService(
                "sid",
                "sname",
                spyProcesses,
                "pid"));
    }
}