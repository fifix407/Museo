package jar.patterns.strategy;

import jar.models.Obra;
import java.util.List;
import java.util.stream.Collectors;

public class FiltroPorTipo implements ObraFilter {
    private String tipoDeseado;

    public FiltroPorTipo(String tipoDeseado) {
        this.tipoDeseado = tipoDeseado;
    }

    @Override
    public List<Obra> filtrar(List<Obra> obras) {
        if (tipoDeseado == null || tipoDeseado.isEmpty()) {
            return obras;
        }
        return obras.stream()
                .filter(obra -> tipoDeseado.equalsIgnoreCase(obra.getTipo()))
                .collect(Collectors.toList());
    }
}
