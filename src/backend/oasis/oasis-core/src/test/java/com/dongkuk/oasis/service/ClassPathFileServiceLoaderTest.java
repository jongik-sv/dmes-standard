package com.dongkuk.oasis.service;

import com.dongkuk.oasis.loader.ClassPathFileServiceLoader;
import com.dongkuk.oasis.loader.ServiceDocumentLoader;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * @author Jeongjin Kim
 * @since 2021-02-01
 */
class ClassPathFileServiceLoaderTest {
    @Test
    void givenNotExistsServiceDocumentDirectoryThenThrowRuntimeException() {
        ServiceDocumentLoader loader =
                new ClassPathFileServiceLoader("wrong_path/service", "bpmn", "^^");
        Assertions.assertThatExceptionOfType(RuntimeException.class).isThrownBy(() ->
                loader.serviceDocument("board"));
    }

    @Test
    void loadServiceFromClasspath() {
        ServiceDocumentLoader loader =
                new ClassPathFileServiceLoader("/service/ClassPathFileServiceLoaderTest", "bpmn", "^^");
        String result = loader.serviceDocument("board");
        assertTrue(result.startsWith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
    }

    @Test
    void loadServiceInSubDirectory() {
        ServiceDocumentLoader loader =
                new ClassPathFileServiceLoader("/service/ClassPathFileServiceLoaderTest", "bpmn", "^^");

        String result = loader.serviceDocument("innerboard");
        assertTrue(result.startsWith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
    }

    @Test
    void loadServiceWithDelimiter() {
        ServiceDocumentLoader loader =
                new ClassPathFileServiceLoader("/service/ClassPathFileServiceLoaderTest", "bpmn", "^^");

        String result = loader.serviceDocument("descTest");
        assertTrue(result.startsWith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
    }

    @Test
    void duplicatedServiceLoadingFail() {
        ServiceDocumentLoader loader =
                new ClassPathFileServiceLoader("/service/ClassPathFileServiceLoaderTest", "bpmn", "^^");

        Assertions.assertThatExceptionOfType(RuntimeException.class).isThrownBy(() ->
                loader.serviceDocument("dup"));
    }
}