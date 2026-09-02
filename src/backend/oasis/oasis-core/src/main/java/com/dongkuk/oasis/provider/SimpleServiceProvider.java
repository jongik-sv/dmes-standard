package com.dongkuk.oasis.provider;

import com.dongkuk.oasis.loader.ClassPathFileServiceLoader;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.unmarshal.camunda.CamundaBpmnServiceUnmarshaller;

/**
 * {@link Service} 를 반환하는 서비스 프로바이더이다.
 * <p>
 * 서비스 객체를 캐시하지 않는다.
 */
public class SimpleServiceProvider implements ServiceProvider {
    private final String serviceDocumentDirectory;
    private final String fileExtension;
    private final String fileDescriptionDelimiter;

    /**
     * @param serviceDocumentDirectory 서비스 정의 문서가 저장되어 있는 디렉토리
     * @param fileExtension            서비스 정의 문서 파일 확장자, null 이면 {@code bpmn} 을 기본값으로 설정한
     * @param fileDescriptionDelimiter 서비스 설명 구분자
     */
    public SimpleServiceProvider(String serviceDocumentDirectory,
                                 String fileExtension,
                                 String fileDescriptionDelimiter) {
        this.serviceDocumentDirectory = serviceDocumentDirectory;
        this.fileExtension = fileExtension;
        this.fileDescriptionDelimiter = fileDescriptionDelimiter;
    }

    @Override
    public Service service(String serviceId) {
        ClassPathFileServiceLoader classPathFileServiceLoader =
                new ClassPathFileServiceLoader(serviceDocumentDirectory, fileExtension, fileDescriptionDelimiter);
        String serviceDocumentString = classPathFileServiceLoader.serviceDocument(serviceId);

        CamundaBpmnServiceUnmarshaller unmarshaller =
                new CamundaBpmnServiceUnmarshaller();

        return unmarshaller.unmarshal(serviceDocumentString, serviceId, serviceId);
    }
}
