package jar.models;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

@JsonTypeInfo(
    use = JsonTypeInfo.Id.NAME,
    include = JsonTypeInfo.As.PROPERTY,
    property = "tipo",
    visible = true
)
@JsonSubTypes({
    @JsonSubTypes.Type(value = Pintura.class, name = "pintura"),
    @JsonSubTypes.Type(value = Escultura.class, name = "escultura"),
    @JsonSubTypes.Type(value = Maqueta.class, name = "maqueta")
})
public abstract class Obra {
    private Long id;
    private String tipo;
    private String titulo;
    private String autor;
    private Integer anio;
    private String descripcion;
    private Double posicionX;
    private Double posicionY;
    private Double posicionZ;

    public Obra() {}

    public Obra(Long id, String tipo, String titulo, String autor, Integer anio, String descripcion, Double posicionX, Double posicionY, Double posicionZ) {
        this.id = id;
        this.tipo = tipo;
        this.titulo = titulo;
        this.autor = autor;
        this.anio = anio;
        this.descripcion = descripcion;
        this.posicionX = posicionX;
        this.posicionY = posicionY;
        this.posicionZ = posicionZ;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getTipo() { return tipo; }
    public void setTipo(String tipo) { this.tipo = tipo; }
    public String getTitulo() { return titulo; }
    public void setTitulo(String titulo) { this.titulo = titulo; }
    public String getAutor() { return autor; }
    public void setAutor(String autor) { this.autor = autor; }
    public Integer getAnio() { return anio; }
    public void setAnio(Integer anio) { this.anio = anio; }
    public String getDescripcion() { return descripcion; }
    public void setDescripcion(String descripcion) { this.descripcion = descripcion; }
    public Double getPosicionX() { return posicionX; }
    public void setPosicionX(Double posicionX) { this.posicionX = posicionX; }
    public Double getPosicionY() { return posicionY; }
    public void setPosicionY(Double posicionY) { this.posicionY = posicionY; }
    public Double getPosicionZ() { return posicionZ; }
    public void setPosicionZ(Double posicionZ) { this.posicionZ = posicionZ; }
}
