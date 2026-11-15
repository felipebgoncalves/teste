package br.gov.es.cepdec.simet;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

import java.math.BigDecimal;
import java.net.URI;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@RestController
@RequestMapping("/api")
public class SimetController {
    private final RestClient http = RestClient.create();
    private final ObjectMapper json;
    @Value("${simet.token-url}") private String tokenUrl;
    @Value("${simet.base-url}") private String baseUrl;
    @Value("${simet.client-id}") private String clientId;
    @Value("${simet.client-secret}") private String clientSecret;
    @Value("${simet.api-key}") private String apiKey;
    private String token;
    private Instant tokenExpires = Instant.EPOCH;

    public SimetController(ObjectMapper json) { this.json = json; }

    @GetMapping("/chuva")
    public ResponseEntity<?> chuva() {
        if (clientId.isBlank() || clientSecret.isBlank() || apiKey.isBlank())
            return ResponseEntity.status(503).body(Map.of("erro", "Configure SIMET_CLIENT_ID, SIMET_CLIENT_SECRET e SIMET_API_KEY."));
        try {
            Instant fim = Instant.now();
            Instant inicio = fim.minus(24, ChronoUnit.HOURS);
            JsonNode estacoes = get("v1/estacoes", null);
            Map<String, Station> porCodigo = new LinkedHashMap<>();
            for (JsonNode e : estacoes) {
                String codigo = e.path("codigo").asText();
                porCodigo.put(codigo, new Station(codigo, e.path("nome").asText(), e.path("municipio").asText()));
            }
            String cursor = null;
            Set<String> vistos = new HashSet<>();
            int paginas = 0;
            do {
                UriComponentsBuilder query = UriComponentsBuilder.newInstance()
                    .queryParam("inicio_utc", inicio.toString()).queryParam("fim_utc", fim.toString())
                    .queryParam("variavel", "PRECIPITACAO_MM").queryParam("intervalo_minutos", 15).queryParam("limite", 500);
                if (cursor != null) query.queryParam("cursor", cursor);
                JsonNode pagina = get("v1/observacoes", query);
                for (JsonNode item : pagina.path("items")) {
                    String codigo = item.path("estacao_codigo").asText();
                    Station station = porCodigo.get(codigo);
                    JsonNode valor = item.path("dados").path("PRECIPITACAO_MM");
                    String horario = item.path("data_hora_utc").asText();
                    if (station == null || !valor.isNumber() || !vistos.add(codigo + ":" + horario)) continue;
                    station.total24h = station.total24h.add(valor.decimalValue());
                    station.medicoes++;
                    if (station.ultimaLeitura == null || horario.compareTo(station.ultimaLeitura) > 0) {
                        station.ultimaLeitura = horario;
                        station.chuvaRecente = valor.decimalValue();
                    }
                }
                cursor = pagina.path("next_cursor").isNull() ? null : pagina.path("next_cursor").asText(null);
                if (++paginas > 1000) throw new IllegalStateException("Limite de paginação excedido");
            } while (cursor != null && !cursor.isBlank());
            return ResponseEntity.ok(Map.of("inicioUtc", inicio, "fimUtc", fim, "estacoes", porCodigo.values(), "paginas", paginas));
        } catch (RestClientResponseException e) {
            return ResponseEntity.status(e.getStatusCode()).body(Map.of("erro", "A API SIMET respondeu com HTTP " + e.getStatusCode().value() + "."));
        } catch (Exception e) {
            return ResponseEntity.status(502).body(Map.of("erro", "Não foi possível consultar a API SIMET: " + e.getClass().getSimpleName()));
        }
    }

    private synchronized String token() {
        if (token != null && Instant.now().isBefore(tokenExpires)) return token;
        JsonNode result = http.post().uri(tokenUrl).contentType(MediaType.APPLICATION_FORM_URLENCODED)
            .body("grant_type=client_credentials&client_id=" + encode(clientId) + "&client_secret=" + encode(clientSecret))
            .retrieve().body(JsonNode.class);
        token = result.path("access_token").asText();
        tokenExpires = Instant.now().plusSeconds(Math.max(30, result.path("expires_in").asLong(300) - 30));
        return token;
    }

    private String encode(String value) { return java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8); }

    private JsonNode get(String path, UriComponentsBuilder query) {
        URI uri = URI.create(baseUrl.replaceAll("/+$", "") + "/" + path + (query == null ? "" : query.build().encode().toUriString()));
        return http.get().uri(uri).header("Authorization", "Bearer " + token()).header("X-API-Key", apiKey)
            .accept(MediaType.APPLICATION_JSON).retrieve().body(JsonNode.class);
    }

    public static class Station {
        public final String codigo, nome, municipio;
        public BigDecimal total24h = BigDecimal.ZERO;
        public BigDecimal chuvaRecente;
        public String ultimaLeitura;
        public int medicoes;
        Station(String codigo, String nome, String municipio) { this.codigo = codigo; this.nome = nome; this.municipio = municipio; }
    }
}
