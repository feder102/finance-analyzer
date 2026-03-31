package galicia

import (
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/Alechan/pdf"
)

// TestDebugPDFLines imprime todas las líneas del PDF para diagnosticar el parser
func TestDebugPDFLines(t *testing.T) {
	if _, err := os.Stat(testPDFPath); os.IsNotExist(err) {
		t.Skipf("PDF not found at %s", testPDFPath)
	}

	data, err := os.ReadFile(testPDFPath)
	if err != nil {
		t.Fatal(err)
	}

	readerAt := strings.NewReader(string(data))
	pdfReader, err := pdf.NewReader(readerAt, int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}

	rows, err := extractAllRows(pdfReader)
	if err != nil {
		t.Fatal(err)
	}

	lines := rowsToTextLines(rows)

	fmt.Printf("\n=== TOTAL LINES: %d ===\n\n", len(lines))

	for i, line := range lines {
		marker := "  "
		if totalAPagarRegex.MatchString(line) {
			marker = "✅ TOTAL A PAGAR"
		} else if cardMovStartRegex.MatchString(line) {
			marker = "💳 CARD MOV"
		} else if cardTotalRegex.MatchString(line) {
			marker = "🏦 CARD TOTAL"
		} else if saldoAnteriorLineRegex.MatchString(line) {
			marker = "💰 SALDO ANT"
		} else if strings.Contains(line, "TOTAL") {
			marker = "⚠️  CONTAINS TOTAL"
		}

		fmt.Printf("[%03d] %s | %q\n", i+1, marker, line)
	}
}
