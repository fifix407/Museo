package jar.patterns.template;

import jar.models.Obra;
import jar.patterns.factory.ObraFactory;
import jar.patterns.strategy.ObraFilter;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

public abstract class AbstractObraService {

    // Método Plantilla (Template Method) que define el esqueleto del algoritmo
    public final List<Obra> obtenerObrasProcesadas(ObraFilter filtro) {
        // Paso 1: Cargar datos crudos
        List<Map<String, Object>> datosCrudos = cargarDatosCrudos();

        // Paso 2: Construir los objetos de dominio usando la Factory
        List<Obra> obras = construirObras(datosCrudos);

        // Paso 3: Aplicar filtro seleccionado mediante Strategy
        return aplicarFiltro(obras, filtro);
    }

    // Estos métodos pueden ser implementados por las subclases
    protected abstract List<Map<String, Object>> cargarDatosCrudos();

    protected List<Obra> construirObras(List<Map<String, Object>> datosCrudos) {
        if (datosCrudos == null) return new ArrayList<>();

        return datosCrudos.stream()
                .map(ObraFactory::crearObra)
                .filter(Objects::nonNull)
                .collect(Collectors.toList());
    }

    protected List<Obra> aplicarFiltro(List<Obra> obras, ObraFilter filtro) {
        if (filtro == null) {
            return obras;
        }
        return filtro.filtrar(obras);
    }
}
