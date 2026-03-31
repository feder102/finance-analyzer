package galicia

import (
	"fmt"
	"io"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/Alechan/pdf"
	"github.com/Alechan/finance-analyzer/pkg/internal/platform/timeale"
	"github.com/shopspring/decimal"
)

type PDFCard struct {
	Number     string
	Owner      string
	TotalARS   decimal.Decimal
	TotalUSD   decimal.Decimal
	Movements  []PDFMovement
}

type PDFTablePositions struct {
	OriginalDateStart int
	OriginalDateEnd   int
	ReceiptStart      int
	ReceiptEnd        int
	DetailStart       int
	ARSAmountStart    int
	ARSAmountEnd      int
	USDAmountStart    int
	USDAmountEnd      int
}

type Document struct {
	TotalARS             decimal.Decimal
	TotalUSD             decimal.Decimal
	CloseDate            time.Time
	ExpirationDate       time.Time
	PastPaymentMovements []PDFMovement
	Cards                []PDFCard
	TaxesMovements       []PDFMovement
	TablePositions       PDFTablePositions
}

// NewDocumentFromFilePath reads a Galicia PDF from a file path
func NewDocumentFromFilePath(filePath string) (Document, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return Document{}, fmt.Errorf("error reading file %s: %w", filePath, err)
	}
	return NewDocumentFromBytes(data)
}

// NewDocumentFromBytes extracts a Document from raw PDF bytes
func NewDocumentFromBytes(rawBytes []byte) (Document, error) {
	readerAt := strings.NewReader(string(rawBytes))
	return NewDocumentFromReaderAt(readerAt, int64(len(rawBytes)))
}

// NewDocumentFromReaderAt extracts a Document from a ReaderAt interface
func NewDocumentFromReaderAt(readerAt io.ReaderAt, size int64) (Document, error) {
	pdfReader, err := pdf.NewReader(readerAt, size)
	if err != nil {
		return Document{}, fmt.Errorf("error creating pdf reader: %w", err)
	}

	rows, err := extractAllRows(pdfReader)
	if err != nil {
		return Document{}, fmt.Errorf("error extracting rows: %w", err)
	}

	// Convert rows to text lines
	lines := rowsToTextLines(rows)

	return parseGaliciaDocument(lines)
}

// extractAllRows extracts all text rows from all pages of the PDF
func extractAllRows(r *pdf.Reader) ([]*pdf.Row, error) {
	var allRows []*pdf.Row
	totalPages := r.NumPage()
	for pageIndex := 1; pageIndex <= totalPages; pageIndex++ {
		page := r.Page(pageIndex)
		if page.V.IsNull() {
			continue
		}

		rows, err := page.GetTextByRow()
		if err != nil {
			return nil, fmt.Errorf("error getting text by row from page %d: %w", pageIndex, err)
		}

		allRows = append(allRows, rows...)
	}
	return allRows, nil
}

// rowsToTextLines converts PDF rows to text lines by joining all text content in each row
func rowsToTextLines(rows []*pdf.Row) []string {
	var lines []string
	for _, row := range rows {
		var textParts []string
		for _, text := range row.Content {
			if text.S != "" {
				textParts = append(textParts, text.S)
			}
		}
		line := strings.Join(textParts, " ")
		line = strings.TrimSpace(line)
		if line != "" {
			lines = append(lines, line)
		}
	}
	return lines
}

var (
	// Ciclo de facturación dates: "30-Oct-25 07-Nov-25 27-Nov-25 05-Dic-25 31-Dic-25 09-Ene-26"
	// 3rd = cierre actual, 4th = vencimiento actual
	cycleDatesRegex = regexp.MustCompile(`(\d{2}-[A-Za-z]{3}-\d{2})`)

	// Saldo anterior marker (start of consolidado section)
	saldoAnteriorLineRegex = regexp.MustCompile(`^SALDO ANTERIOR\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})`)

	// Table header
	tableHeaderRegex = regexp.MustCompile(`FECHA\s+REFERENCIA\s+CUOTA\s+COMPROBANTE\s+PESOS`)

	// Card movement start marker (has * or K flag)
	cardMovStartRegex = regexp.MustCompile(`^(\d{2}-\d{2}-\d{2})\s+[*K]\s+`)

	// Card total line: "TARJETA 7837 Total Consumos de FE CASTIGLIONE PERE 40.239,92 0,00"
	cardTotalRegex = regexp.MustCompile(`^TARJETA\s+(\d+)\s+Total Consumos de\s+(.+?)\s+([\d.,]+)\s+([\d.,]+)\s*$`)

	// Consolidado movement (date-based, no flag)
	consolidadoMovRegex = regexp.MustCompile(`^(\d{2}-\d{2}-\d{2})\s+(.+?)\s+(-?[\d.]+,\d+)(?:\s+(-?[\d.]+,\d+))?\s*$`)

	// Tax/charge row: date + description + optional $ + amount
	taxRowRegex = regexp.MustCompile(`^(\d{2}-\d{2}-\d{2})\s+(.+?)\s+(?:P?\s*\$\s+)?(-?[\d.]+,\d{2})\s*$`)

	// Total a pagar line
	totalAPagarRegex = regexp.MustCompile(`TOTAL A PAGAR\s+([\d.,]+)\s+([\d.,]+)`)

	// Installments pattern (XX/YY)
	installmentsRegex = regexp.MustCompile(`\b(\d{2})/(\d{2})\b`)

	// 6-digit comprobante
	comprobanteRegex = regexp.MustCompile(`\b(\d{6})\b`)

	// Detalle del consumo marker
	detalleRegex = regexp.MustCompile(`DETALLE DEL CONSUMO`)

	// Amount patterns (for extraction)
	amountRegex = regexp.MustCompile(`(-?[\d.]+,\d{2}-?)`)
)

// parseGaliciaDocument parses the document sections sequentially
func parseGaliciaDocument(lines []string) (Document, error) {
	var doc Document

	// State machine states
	state := "INITIAL"
	var currentCard *PDFCard

	for i, line := range lines {
		// Try to find billing cycle dates (in INITIAL state)
		if state == "INITIAL" {
			if matches := cycleDatesRegex.FindAllString(line, -1); len(matches) >= 4 && doc.CloseDate.IsZero() {
				// 3rd date is "cierre actual", 4th is "vencimiento actual"
				var errClose, errExp error
				doc.CloseDate, errClose = parseGaliciaHeaderDate(matches[2])
				doc.ExpirationDate, errExp = parseGaliciaHeaderDate(matches[3])
				if errClose != nil || errExp != nil {
					return Document{}, fmt.Errorf("error parsing header dates: close=%v, exp=%v", errClose, errExp)
				}
			}
		}

		// Check for TOTAL A PAGAR (end marker)
		if m := totalAPagarRegex.FindStringSubmatch(line); m != nil {
			arsTotal, _ := parseGaliciaAmount(m[1])
			usdTotal, _ := parseGaliciaAmount(m[2])
			doc.TotalARS = arsTotal
			doc.TotalUSD = usdTotal
			state = "DONE"
			continue
		}

		// Check for SALDO ANTERIOR (start consolidado)
		if m := saldoAnteriorLineRegex.FindStringSubmatch(line); m != nil {
			state = "CONSOLIDADO"
			arsAmt, _ := parseGaliciaAmount(m[1])
			usdAmt, _ := parseGaliciaAmount(m[2])
			doc.PastPaymentMovements = append(doc.PastPaymentMovements, PDFMovement{
				Detail:    "SALDO ANTERIOR",
				AmountARS: arsAmt,
				AmountUSD: usdAmt,
			})
			continue
		}

		// Check for DETALLE DEL CONSUMO (transition to card table)
		if detalleRegex.MatchString(line) {
			state = "CARD_TABLE_HEADER"
			continue
		}

		// Check for table header (start card movements parsing)
		if state == "CARD_TABLE_HEADER" && tableHeaderRegex.MatchString(line) {
			state = "CARD_TABLE"
			continue
		}

		// Parse consolidado movements
		if state == "CONSOLIDADO" {
			if m := consolidadoMovRegex.FindStringSubmatch(line); m != nil {
				date, _ := parseGaliciaTransactionDate(m[1])
				arsAmt, _ := parseGaliciaAmount(m[3])
				usdAmt := decimal.Zero
				if m[4] != "" {
					usdAmt, _ = parseGaliciaAmount(m[4])
				}
				doc.PastPaymentMovements = append(doc.PastPaymentMovements, PDFMovement{
					OriginalDate: &date,
					Detail:       m[2],
					AmountARS:    arsAmt,
					AmountUSD:    usdAmt,
				})
			}
			continue
		}

		// Parse card table movements and taxes
		if state == "CARD_TABLE" {
			// Card total line?
			if m := cardTotalRegex.FindStringSubmatch(line); m != nil {
				if currentCard != nil {
					currentCard.Number = m[1]
					currentCard.Owner = m[2]
					currentCard.TotalARS, _ = parseGaliciaAmount(m[3])
					currentCard.TotalUSD, _ = parseGaliciaAmount(m[4])
					doc.Cards = append(doc.Cards, *currentCard)
					currentCard = nil
				}
				continue
			}

			// Regular card movement (has * or K flag)?
			if cardMovStartRegex.MatchString(line) {
				mov, err := parseCardMovement(line)
				if err == nil && mov != nil {
					if currentCard == nil {
						currentCard = &PDFCard{}
					}
					currentCard.Movements = append(currentCard.Movements, *mov)
				}
				continue
			}

			// Tax/charge row (date but no * or K flag)?
			if m := taxRowRegex.FindStringSubmatch(line); m != nil && !cardMovStartRegex.MatchString(line) {
				date, _ := parseGaliciaTransactionDate(m[1])
				amt, _ := parseGaliciaAmount(m[3])
				doc.TaxesMovements = append(doc.TaxesMovements, PDFMovement{
					OriginalDate: &date,
					Detail:       m[2],
					AmountARS:    amt,
				})
				continue
			}
		}
	}

	// If we have a pending current card at the end, add it
	if currentCard != nil {
		doc.Cards = append(doc.Cards, *currentCard)
	}

	return doc, nil
}

// parseCardMovement parses a single card movement line
// Format: DD-MM-YY [*|K] REFERENCE [XX/YY] COMPROBANTE [ARS] [USD]
func parseCardMovement(line string) (*PDFMovement, error) {
	line = strings.TrimSpace(line)

	// Extract date (first 8 chars)
	if len(line) < 10 {
		return nil, nil
	}
	dateStr := line[:8]
	date, err := parseGaliciaTransactionDate(dateStr)
	if err != nil {
		return nil, nil
	}

	// Remove date and space
	rest := strings.TrimSpace(line[9:])

	// Remove flag (* or K)
	if len(rest) > 0 && (rest[0] == '*' || rest[0] == 'K') {
		rest = strings.TrimSpace(rest[1:])
	}

	// Find comprobante (6-digit number)
	comprobanteMatch := comprobanteRegex.FindString(rest)
	if comprobanteMatch == "" {
		return nil, nil
	}

	// Split by comprobante
	idx := strings.Index(rest, comprobanteMatch)
	beforeComprobante := strings.TrimSpace(rest[:idx])
	afterComprobante := strings.TrimSpace(rest[idx+len(comprobanteMatch):])

	// Parse amounts (everything after comprobante)
	var arsAmount, usdAmount decimal.Decimal
	amounts := extractAmounts(afterComprobante)

	if len(amounts) == 2 {
		arsAmount, _ = parseGaliciaAmount(amounts[0])
		usdAmount, _ = parseGaliciaAmount(amounts[1])
	} else if len(amounts) == 1 {
		// Determine if it's ARS or USD based on the reference (contains "USD"?)
		if strings.Contains(beforeComprobante, "USD") {
			usdAmount, _ = parseGaliciaAmount(amounts[0])
			arsAmount = decimal.Zero
		} else {
			arsAmount, _ = parseGaliciaAmount(amounts[0])
			usdAmount = decimal.Zero
		}
	}

	// Parse installments (XX/YY) from beforeComprobante
	var currentInst, totalInst *int
	if instMatch := installmentsRegex.FindStringSubmatch(beforeComprobante); instMatch != nil {
		if curr, err := strconv.Atoi(instMatch[1]); err == nil {
			currentInst = &curr
		}
		if total, err := strconv.Atoi(instMatch[2]); err == nil {
			totalInst = &total
		}
	}

	// Receipt number is the comprobante
	receiptStr := comprobanteMatch

	// Extract detail (everything except installments)
	detail := installmentsRegex.ReplaceAllString(beforeComprobante, "")
	detail = strings.TrimSpace(detail)

	return &PDFMovement{
		OriginalDate:       &date,
		ReceiptNumber:      &receiptStr,
		Detail:             detail,
		CurrentInstallment: currentInst,
		TotalInstallments:  totalInst,
		AmountARS:          arsAmount,
		AmountUSD:          usdAmount,
	}, nil
}

// extractAmounts finds all amount patterns in a string (separated by spaces)
func extractAmounts(text string) []string {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	// Split by whitespace and filter for amount patterns
	parts := strings.Fields(text)
	var amounts []string
	for _, part := range parts {
		if amountRegex.MatchString(part) {
			amounts = append(amounts, part)
		}
	}
	return amounts
}

// parseGaliciaHeaderDate parses dates in format DD-Mon-YY (with dashes)
// e.g., "27-Nov-25" → 2025-11-27
func parseGaliciaHeaderDate(dateStr string) (time.Time, error) {
	// Replace dashes with spaces for compatibility with timeale function
	normalized := strings.ReplaceAll(dateStr, "-", " ")
	return timeale.CardSummarySpanishMonthDateToTime(normalized)
}

// parseGaliciaTransactionDate parses dates in format DD-MM-YY (numeric)
// e.g., "05-03-25" → 2025-03-05
func parseGaliciaTransactionDate(dateStr string) (time.Time, error) {
	t, err := time.Parse("02-01-06", dateStr)
	if err != nil {
		return time.Time{}, err
	}
	return t, nil
}

// parseGaliciaAmount parses an amount in format like "25.499,92" or "1,99"
// Removes thousand separators (dots), replaces comma with dot, handles trailing minus
func parseGaliciaAmount(rawAmount string) (decimal.Decimal, error) {
	if rawAmount == "" || rawAmount == "0,00" {
		return decimal.Zero, nil
	}

	rawAmount = strings.TrimSpace(rawAmount)

	// Handle trailing minus (e.g., "-1,26")
	isNegative := false
	if strings.HasSuffix(rawAmount, "-") {
		isNegative = true
		rawAmount = strings.TrimSuffix(rawAmount, "-")
	}
	if strings.HasPrefix(rawAmount, "-") {
		isNegative = true
		rawAmount = strings.TrimPrefix(rawAmount, "-")
	}

	// Remove thousand separators (dots)
	rawAmount = strings.ReplaceAll(rawAmount, ".", "")
	// Replace decimal separator (comma) with dot
	rawAmount = strings.ReplaceAll(rawAmount, ",", ".")

	dec, err := decimal.NewFromString(rawAmount)
	if err != nil {
		return decimal.Zero, fmt.Errorf("error converting %s to decimal: %w", rawAmount, err)
	}

	if isNegative {
		dec = dec.Neg()
	}

	if dec.IsZero() {
		return decimal.Zero, nil
	}

	return dec, nil
}
