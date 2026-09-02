package com.dongkuk.oasis.process;

public class Sub {
    public String hi(SubProcessPassingDtoTest.MyDto dto) {
        return dto.getName();
    }

    public String hi(TaskPassingDtoTest.MyDto dto) {
        return dto.getName();
    }

    public String hi(TaskPassingDtoTest.MyDto dto, TaskPassingDtoTest.NameDto nameDto) {
        return dto.getAge() + nameDto.getName();
    }
}
