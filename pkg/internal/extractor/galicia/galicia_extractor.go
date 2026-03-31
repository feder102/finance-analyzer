package galicia

import (
	"fmt"

	"github.com/Alechan/finance-analyzer/pkg/internal/pdfcardsummary"
	"github.com/Alechan/finance-analyzer/pkg/internal/platform/pdfwrapper"
)

// GaliciaExtractor extracts Card Summary from Visa Galicia PDFs
type GaliciaExtractor struct{}

// NewGaliciaExtractor creates a new Galicia extractor
func NewGaliciaExtractor() *GaliciaExtractor {
	return &GaliciaExtractor{}
}

// ExtractFromBytes extracts a CardSummary from raw PDF bytes
func (e *GaliciaExtractor) ExtractFromBytes(rawBytes []byte) (pdfcardsummary.CardSummary, error) {
	document, err := NewDocumentFromBytes(rawBytes)
	if err != nil {
		return pdfcardsummary.CardSummary{}, err
	}

	// Extract bank and card company from PDF text
	pdfReader := pdfwrapper.NewReaderWrapper()
	pdfDoc, err := pdfReader.ReadFromBytes(rawBytes)
	if err != nil {
		return pdfcardsummary.CardSummary{}, fmt.Errorf("error reading pdf for bank/card company detection: %w", err)
	}
	allText := pdfcardsummary.ExtractAllTextFromDocument(pdfDoc)
	bank := pdfcardsummary.DetectBankFromText(allText)
	cardCompany := pdfcardsummary.DetectCardCompanyFromText(allText)

	cardSummary := e.convertDocumentToCardSummary(document)
	cardSummary.StatementContext.Bank = bank
	cardSummary.StatementContext.CardCompany = cardCompany

	return cardSummary, nil
}

// ExtractFromDocument extracts a CardSummary from a pdfwrapper.Document
func (e *GaliciaExtractor) ExtractFromDocument(pdfDoc pdfwrapper.Document) (pdfcardsummary.CardSummary, error) {
	return pdfcardsummary.CardSummary{}, fmt.Errorf("ExtractFromDocument not implemented for Galicia extractor. Use ExtractFromBytes() instead")
}

// convertDocumentToCardSummary converts a Galicia Document to a CardSummary
func (e *GaliciaExtractor) convertDocumentToCardSummary(document Document) pdfcardsummary.CardSummary {
	var cards []pdfcardsummary.Card
	for _, pdfCard := range document.Cards {
		cardNum := pdfCard.Number
		card := pdfcardsummary.Card{
			CardContext: pdfcardsummary.CardContext{
				CardNumber:   &cardNum,
				CardOwner:    pdfCard.Owner,
				CardTotalARS: pdfCard.TotalARS,
				CardTotalUSD: pdfCard.TotalUSD,
			},
			Movements: e.convertPDFMovementsToMovements(pdfCard.Movements),
		}
		cards = append(cards, card)
	}

	pastPaymentMovements := e.convertPDFMovementsToMovements(document.PastPaymentMovements)
	taxesMovements := e.convertPDFMovementsToMovements(document.TaxesMovements)

	return pdfcardsummary.CardSummary{
		StatementContext: pdfcardsummary.StatementContext{
			TotalARS:       document.TotalARS,
			TotalUSD:       document.TotalUSD,
			CloseDate:      document.CloseDate,
			ExpirationDate: document.ExpirationDate,
		},
		Table: pdfcardsummary.Table{
			PastPaymentMovements: pastPaymentMovements,
			Cards:                cards,
			TaxesMovements:       taxesMovements,
		},
	}
}

// convertPDFMovementsToMovements converts PDFMovements to Movements
func (e *GaliciaExtractor) convertPDFMovementsToMovements(pdfMovements []PDFMovement) []pdfcardsummary.Movement {
	var movements []pdfcardsummary.Movement
	for _, pdfMov := range pdfMovements {
		movement := pdfcardsummary.Movement{
			OriginalDate:       pdfMov.OriginalDate,
			ReceiptNumber:      pdfMov.ReceiptNumber,
			Detail:             pdfMov.Detail,
			CurrentInstallment: pdfMov.CurrentInstallment,
			TotalInstallments:  pdfMov.TotalInstallments,
			AmountARS:          pdfMov.AmountARS,
			AmountUSD:          pdfMov.AmountUSD,
		}
		movements = append(movements, movement)
	}
	return movements
}