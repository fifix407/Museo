package jar.services;

import jar.patterns.singleton.JsonDataLoader;
import jar.patterns.template.AbstractObraService;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class ObraServiceImpl extends AbstractObraService {

    @Override
    protected List<Map<String, Object>> cargarDatosCrudos() {
        // Usa el Singleton para obtener los datos cacheados
        return JsonDataLoader.getInstance().getObrasData();
    }
}
