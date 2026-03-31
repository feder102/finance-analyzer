package galicia

import (
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testPDFPath = "../../../../resumenes/galicia_visa_feb2026.pdf"

// TestParseDateFormats tests the date parsing functions individually
func TestParseDateFormats(t *testing.T) {
	t.Run("header date DD-Mon-YY", func(t *testing.T) {
		cases := []struct {
			input    string
			expected time.Time
		}{
			{"27-Nov-25", time.Date(2025, 11, 27, 0, 0, 0, 0, time.UTC)},
			{"05-Dic-25", time.Date(2025, 12, 5, 0, 0, 0, 0, time.UTC)},
			{"09-Ene-26", time.Date(2026, 1, 9, 0, 0, 0, 0, time.UTC)},
		}
		for _, c := range cases {
			t.Run(c.input, func(t *testing.T) {
				got, err := parseGaliciaHeaderDate(c.input)
				require.NoError(t, err)
				assert.Equal(t, c.expected.Year(), got.Year())
				assert.Equal(t, c.expected.Month(), got.Month())
				assert.Equal(t, c.expected.Day(), got.Day())
			})
		}
	})

	t.Run("transaction date DD-MM-YY", func(t *testing.T) {
		cases := []struct {
			input    string
			expected time.Time
		}{
			{"05-03-25", time.Date(2025, 3, 5, 0, 0, 0, 0, time.UTC)},
			{"29-01-26", time.Date(2026, 1, 29, 0, 0, 0, 0, time.UTC)},
		}
		for _, c := range cases {
			t.Run(c.input, func(t *testing.T) {
				got, err := parseGaliciaTransactionDate(c.input)
				require.NoError(t, err)
				assert.Equal(t, c.expected.Year(), got.Year())
				assert.Equal(t, c.expected.Month(), got.Month())
				assert.Equal(t, c.expected.Day(), got.Day())
			})
		}
	})
}

// TestParseAmounts tests amount parsing
func TestParseAmounts(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"25.499,92", "25499.92"},
		{"1,99", "1.99"},
		{"-203.000,00", "-203000"},
		{"0,00", "0"},
		{"673.231,80", "673231.8"},
		{"120.340,58", "120340.58"},
	}
	for _, c := range cases {
		t.Run(c.input, func(t *testing.T) {
			got, err := parseGaliciaAmount(c.input)
			require.NoError(t, err)
			assert.Equal(t, c.expected, got.String())
		})
	}
}

// TestDocumentFromPDF tests the full parsing of the Feb 2026 PDF
func TestDocumentFromPDF(t *testing.T) {
	if _, err := os.Stat(testPDFPath); os.IsNotExist(err) {
		t.Skipf("PDF not found at %s, skipping integration test", testPDFPath)
	}

	doc, err := NewDocumentFromFilePath(testPDFPath)
	require.NoError(t, err)

	t.Run("dates parsed", func(t *testing.T) {
		assert.False(t, doc.CloseDate.IsZero(), "CloseDate should not be zero, got: %v", doc.CloseDate)
		assert.False(t, doc.ExpirationDate.IsZero(), "ExpirationDate should not be zero, got: %v", doc.ExpirationDate)
		if !doc.CloseDate.IsZero() {
			fmt.Printf("  CloseDate: %v\n", doc.CloseDate)
			fmt.Printf("  ExpirationDate: %v\n", doc.ExpirationDate)
		}
	})

	t.Run("totals parsed", func(t *testing.T) {
		fmt.Printf("  TotalARS: %v\n", doc.TotalARS)
		fmt.Printf("  TotalUSD: %v\n", doc.TotalUSD)
		assert.False(t, doc.TotalARS.IsZero(), "TotalARS should not be zero")
	})

	t.Run("past payments", func(t *testing.T) {
		fmt.Printf("  PastPaymentMovements: %d\n", len(doc.PastPaymentMovements))
		for _, m := range doc.PastPaymentMovements {
			fmt.Printf("    - %s | ARS: %v | USD: %v\n", m.Detail, m.AmountARS, m.AmountUSD)
		}
		assert.Greater(t, len(doc.PastPaymentMovements), 0, "Should have past payment movements")
	})

	t.Run("cards", func(t *testing.T) {
		fmt.Printf("  Cards: %d\n", len(doc.Cards))
		for _, card := range doc.Cards {
			fmt.Printf("    Card %s (%s): ARS=%v USD=%v - %d movements\n",
				card.Number, card.Owner, card.TotalARS, card.TotalUSD, len(card.Movements))
		}
		assert.Greater(t, len(doc.Cards), 0, "Should have at least one card")
	})

	t.Run("taxes", func(t *testing.T) {
		fmt.Printf("  TaxesMovements: %d\n", len(doc.TaxesMovements))
		for _, m := range doc.TaxesMovements {
			fmt.Printf("    - %s | ARS: %v\n", m.Detail, m.AmountARS)
		}
	})
}

// TestCycleDatesRegex tests the cycle dates regex on sample lines
func TestCycleDatesRegex(t *testing.T) {
	cases := []struct {
		line          string
		expectedCount int
	}{
		{"30-Oct-25 07-Nov-25 27-Nov-25 05-Dic-25 31-Dic-25 09-Ene-26", 6},
		{"Fecha de cierre 27-Nov-25 vencimiento 05-Dic-25", 2},
	}
	for _, c := range cases {
		t.Run(c.line[:20], func(t *testing.T) {
			matches := cycleDatesRegex.FindAllString(c.line, -1)
			assert.Equal(t, c.expectedCount, len(matches), "matches: %v", matches)
		})
	}
}

// TestCard2240Movements muestra todos los movimientos de la tarjeta 2240
func TestCard2240Movements(t *testing.T) {
	if _, err := os.Stat(testPDFPath); os.IsNotExist(err) {
		t.Skipf("PDF not found at %s", testPDFPath)
	}
	doc, err := NewDocumentFromFilePath(testPDFPath)
	require.NoError(t, err)

	for _, card := range doc.Cards {
		if card.Number == "2240" {
			fmt.Printf("Card 2240 - TotalARS=%v TotalUSD=%v\n", card.TotalARS, card.TotalUSD)
			sumARS := decimal.Zero
			sumUSD := decimal.Zero
			for _, m := range card.Movements {
				fmt.Printf("  ARS=%v USD=%v | %s\n", m.AmountARS, m.AmountUSD, m.Detail)
				sumARS = sumARS.Add(m.AmountARS)
				sumUSD = sumUSD.Add(m.AmountUSD)
			}
			fmt.Printf("  SUMA ARS=%v USD=%v\n", sumARS, sumUSD)
		}
	}
}
