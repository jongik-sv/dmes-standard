package usecase.sequential;

public class Consumer {
    public void consume(SpyClass spyClass, SpyDto spyDto) {
        spyClass.addData(spyDto.getName());
    }
}
