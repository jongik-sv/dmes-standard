package com.dongkuk.oasis.loader;

import com.dongkuk.oasis.exceptions.ServiceLoadException;
import org.jboss.vfs.VFS;
import org.jboss.vfs.VirtualFile;

import java.io.IOException;
import java.io.InputStream;
import java.net.URISyntaxException;
import java.net.URL;
import java.util.List;
import java.util.Objects;

/**
 * Jboss VFS Support service file loader.
 *
 * @author Jeongjin Kim
 * @since 2021-05-20
 */
public final class JBossVfsFileServiceLoader extends AbstractFileServiceLoader {
    /**
     * @param serviceDocumentDirectory 서비스 정의 문서가 저장되어 있는 디렉토리
     * @param fileExtension            서비스 정의 문서 파일 확장자, null 이면 {@code bpmn} 을 기본값으로 설정한
     * @param fileDescriptionDelimiter 서비스 설명 구분자
     */
    public JBossVfsFileServiceLoader(String serviceDocumentDirectory,
                                     String fileExtension,
                                     String fileDescriptionDelimiter) {
        super(serviceDocumentDirectory, (fileExtension == null) ? "bpmn" : fileExtension, fileDescriptionDelimiter);
    }

    @Override
    protected InputStream getServiceDocumentAsStream(String serviceId) {
        URL dirUrl = getClass().getResource(this.serviceDocumentDirectory);
        if (dirUrl == null)
            throw new ServiceLoadException(this.serviceDocumentDirectory + "directory does not exist.");

        VirtualFile vfDir;
        try {
            vfDir = VFS.getChild(dirUrl.toURI());
        } catch (URISyntaxException e) {
            throw new ServiceLoadException(e);
        }

        VirtualFile serviceFile;
        try {
            serviceFile = findServiceFile(vfDir, serviceId);
        } catch (IOException e) {
            throw new ServiceLoadException("Can find [" + serviceId + "] service file", e);
        }

        try {
            return Objects.requireNonNull(serviceFile).openStream();
        } catch (IOException e) {
            throw new ServiceLoadException("Can find [" + serviceId + "] service file", e);
        }
    }

    private VirtualFile findServiceFile(VirtualFile baseDirectory, String serviceFileName) throws IOException {
        VirtualFile serviceFile = null;
        if (baseDirectory == null) return null;

        List<VirtualFile> fileList = baseDirectory.getChildren(virtualFile -> true);

        if (fileList == null) return null;

        //noinspection ComparatorMethodParameterNotUsed
        fileList.sort((o1, o2) -> {
            if (o1.isFile()) return -1;
            else return 1;
        });

        //파일 중복 확인
        int chkFileCnt = 0;
        VirtualFile tmpFile;
        for (VirtualFile file : fileList) {
            if (file.isFile() && isMatchedServiceName(serviceFileName, file.getName())) {
                chkFileCnt++;
                serviceFile = file;
            } else if (file.isDirectory()) {
                tmpFile = findServiceFile(file, serviceFileName);
                if (tmpFile != null) {
                    chkFileCnt++;
                    serviceFile = tmpFile;
                }
            }
        }
        if (serviceFile != null && chkFileCnt == 1) {
            return serviceFile;
        } else {
            return null;
        }
    }
}
