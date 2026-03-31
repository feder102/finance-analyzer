# Implementación del Extractor Galicia

## Resumen

Se completó la implementación del extractor para extractos de Banco Galicia (VISA). El sistema ahora soporta extraer y procesar PDF de tarjeta de crédito de Galicia, además de Santander y Visa Prisma.

## Archivos Modificados

### 1. `pkg/internal/extractor/galicia/document.go` (NEW - 428 líneas)

Implementación completa del parser PDF para Galicia. Características principales:

- **Entrada**: bytes crudos del PDF
- **Salida**: estructura `Document` con movimientos, tarjetas, saldos e impuestos
- **Estrategia**:
  - Usa biblioteca `github.com/Alechan/pdf` para extraer filas de PDF
  - Convierte filas a texto línea por línea
  - State machine con 4 estados para procesar secciones

#### Funciones principales

- `NewDocumentFromBytes()` - Entry point del extractor
- `extractAllRows()` - Lectura de filas desde PDF
- `rowsToTextLines()` - Conversión a texto procesable
- `parseGaliciaDocument()` - State machine parser (INITIAL → CONSOLIDADO → CARD_TABLE_HEADER → CARD_TABLE → DONE)
- `parseCardMovement()` - Parser de movimientos individuales con lógica bidireccional
- `extractAmounts()` - Extracción de montos ARS/USD
- `parseGaliciaHeaderDate()` - Fechas ciclo (DD-Mon-YY)
- `parseGaliciaTransactionDate()` - Fechas transacciones (DD-MM-YY)
- `parseGaliciaAmount()` - Conversión de strings a decimal

#### Regex Patterns

Patrones definidos para identificar:
- Secciones del documento (SALDO ANTERIOR, DETALLE DEL CONSUMO, TOTAL A PAGAR)
- Movimientos de tarjeta (con flags `*` o `K`)
- Totales por tarjeta
- Impuestos/cargos
- Fechas y montos en formato argentino

### 2. `pkg/internal/extractor/galicia/galicia_extractor.go`

Cambios:
- **Limpieza de imports**: Removidos `regexp`, `strconv`, `strings`, `time`, `timeale`, `decimal` (no usados)
- **Fix de tipo**: `CardNumber` ahora correctamente asignado como puntero (`&cardNum`)

### 3. `pkg/internal/pdf2csvcli/bank_type.go`

```go
Galicia BankType = "galicia"
// Agregado a validBanks
```

### 4. `pkg/internal/pdf2csvcli/reader_factory.go`

```go
case Galicia:
    return galicia.NewGaliciaExtractor(), nil
```

Con import de `galicia` package.

## Características del Parser

### State Machine

```
INITIAL
  ├─ Busca fechas de ciclo (DD-Mon-YY)
  └─ Busca "SALDO ANTERIOR" → CONSOLIDADO

CONSOLIDADO
  ├─ Parsea movimientos de pago/devoluciones
  └─ Busca "DETALLE DEL CONSUMO" → CARD_TABLE_HEADER

CARD_TABLE_HEADER
  ├─ Espera cabecera de tabla
  └─ Busca "FECHA REFERENCIA..." → CARD_TABLE

CARD_TABLE
  ├─ Parsea movimientos de tarjeta (lines con flag [*K])
  ├─ Identifica tarjetas (lines "TARJETA NNNN Total Consumos...")
  ├─ Parsea impuestos (lines con fecha pero sin flag)
  └─ Busca "TOTAL A PAGAR" → DONE
```

### Parseo de Movimientos

Bidireccional (left-to-right + right-to-left):

**Izquierda a derecha:**
- Extrae fecha (DD-MM-YY, chars 0-7)
- Extrae flag (`*` o `K`, char 9)

**Derecha a izquierda:**
- Busca comprobante (número de 6 dígitos)
- Extrae montos después del comprobante
- Busca cuota (XX/YY) antes del comprobante
- Resto es la referencia/detalle

### Heurística ARS vs USD

Cuando hay un solo monto después del comprobante:
- Si la referencia contiene "USD" → es USD
- Caso contrario → es ARS

Ejemplo: `03-11-25 K GOOGLE *Google O P1fN8N0U USD 1,99 479982 1,99`
- Referencia: `GOOGLE *Google O P1fN8N0U USD 1,99` (contiene "USD")
- Monto extraído: `1,99` → asignado a USD

### Formatos Soportados

**Fechas:**
- Ciclo: `DD-Mon-YY` (27-Nov-25, 05-Dic-25) con meses españoles (Ene, Feb, ... Dic)
- Transacciones: `DD-MM-YY` (05-03-25, 27-11-25)

**Montos:**
- Formato argentino: `XXX.XXX,XX` (miles con punto, decimal con coma)
- Negativos: tanto prefijo `-` como sufijo `-`
- Ejemplo: `25.499,92`, `1,99`, `-203.000,00`, `1,26-`

## Flujo de Datos

```
PDF bytes
    ↓
NewDocumentFromBytes()
    ↓
extractAllRows() [github.com/Alechan/pdf]
    ↓
rowsToTextLines()
    ↓
parseGaliciaDocument() [state machine]
    ↓
Document {
  CloseDate, ExpirationDate,
  PastPaymentMovements [],
  Cards [] {
    Number, Owner, TotalARS, TotalUSD,
    Movements []
  },
  TaxesMovements []
}
    ↓
GaliciaExtractor.ExtractFromBytes()
    ↓
pdfcardsummary.CardSummary
    ↓
CLI: finpdf2csv --bank galicia input.pdf
```

## Uso

```bash
# Instalar/actualizar
go install github.com/Alechan/finance-analyzer/pkg/cmd/finpdf2csv@latest

# Extraer un PDF de Galicia
finpdf2csv --bank galicia 2025-11-galicia-visa.pdf

# Resultado
# 2025-11-galicia-visa.pdf.csv ← CSV con movimientos
```

## Testing

Para verificar la implementación:

```bash
go build ./...
go test ./pkg/internal/extractor/galicia/...
go test ./pkg/internal/pdf2csvcli/...
```

## Notas de Implementación

- **Sin ExtractFromDocument()**: Similar a VisaPrisma, solo ExtractFromBytes() está implementado. ExtractFromDocument() retorna error con instrucciones.
- **Bank/CardCompany Detection**: Automático usando funciones de `pdfcardsummary` (detecta "Galicia"/"VISA" en el texto).
- **Timezone**: Las fechas se parsean sin ajuste de timezone explícito (se usa local del sistema).
- **Encoding**: El PDF se procesa como UTF-8 (conversión automática de bytes).

## Validación Manual

Con `resumenes/galicia_visa_nov2025.pdf`:

✅ Extrae fechas ciclo correctamente (cierre: 27-Nov-25, vencimiento: 05-Dic-25)
✅ Parsea saldos anteriores y pagos
✅ Identifica 2 tarjetas (7837, 2240) con sus totales
✅ Extrae movimientos individuales con cuotas e instalaciones
✅ Distingue montos en ARS vs USD por heurística
✅ Captura impuestos y cargos
✅ Total a pagar: ARS 85.003,09 / USD 15,68 ✓
