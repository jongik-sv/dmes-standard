package com.dongkuk.dmes.analog.web;

import com.dongkuk.dmes.analog.dto.LovDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

// CORS 개방(@CrossOrigin) 은 제거 — FE 는 BFF(be-proxy) 경유이며 mpn/mcm 관례에도 없음.
@RestController
public class MetaApiController {
    @Value("${analog-express.modules}")
    private String modules;

    @Value("${analog-express.client_types}")
    private String clientTypes;

    @Value("${analog-express.stage_title:#{null}}")
    private String stageTitle;

    @Value("${analog-express.title:#{null}}")
    private String title;

    @Value("${analog-express.stage}")
    private String stage;

    @RequestMapping("/api/meta")
    public Meta meta() {
        List<LovDto> moduleDtos = getLovDtos(modules);
        List<LovDto> clientTypeDtos = getLovDtos(clientTypes);

        return new Meta(moduleDtos,
                clientTypeDtos,
                (stageTitle == null ? stage : stageTitle),
                (title == null ? "DMES log 분석화면" : title));
    }

    private List<LovDto> getLovDtos(String commaSeparated) {
        String[] split = commaSeparated.split(",");
        return Arrays.stream(split)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(s -> new LovDto(s, s))
                .collect(Collectors.toList());
    }

    public static class Meta {
        private List<LovDto> modules;
        private List<LovDto> clientTypes;
        private String stageTitle;
        private String title;

        public Meta(List<LovDto> modules, List<LovDto> clientTypes, String stageTitle, String title) {
            this.modules = modules;
            this.clientTypes = clientTypes;
            this.stageTitle = stageTitle;
            this.title = title;
        }

        public List<LovDto> getModules() {
            return modules;
        }

        public void setModules(List<LovDto> modules) {
            this.modules = modules;
        }

        public List<LovDto> getClientTypes() {
            return clientTypes;
        }

        public void setClientTypes(List<LovDto> clientTypes) {
            this.clientTypes = clientTypes;
        }

        public String getStageTitle() {
            return stageTitle;
        }

        public void setStageTitle(String stageTitle) {
            this.stageTitle = stageTitle;
        }

        public String getTitle() {
            return title;
        }

        public void setTitle(String title) {
            this.title = title;
        }
    }
}
