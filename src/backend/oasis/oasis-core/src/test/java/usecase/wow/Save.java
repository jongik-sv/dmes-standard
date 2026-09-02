package usecase.wow;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.WowContext;
import com.dongkuk.oasis.wow.Wow;

/**
 * @author Jeongjin Kim
 * @since 2021-05-18
 */
public class Save implements Wow {
    @Override
    public TypedObject run(WowContext wowContext) {
        WowRepository wowRepository = wowContext.get("wowRepository").getObject(WowRepository.class);
        String id = wowContext.get("id").getObject(String.class);

        WowDto wowDto = new WowDto(id);
        int save = wowRepository.save(wowDto);

        return new TypedObject(save);
    }
}
