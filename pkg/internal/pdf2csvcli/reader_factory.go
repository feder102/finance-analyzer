package pdf2csvcli

import (
	"fmt"

	"github.com/Alechan/finance-analyzer/pkg/internal/extractor/galicia"
	"github.com/Alechan/finance-analyzer/pkg/internal/extractor/santander"
	"github.com/Alechan/finance-analyzer/pkg/internal/extractor/visaprisma"
	"github.com/Alechan/finance-analyzer/pkg/internal/pdfcardsummaryio"
)

// ExtractorFactory creates a new PDF card summary extractor based on the bank type.
func ExtractorFactory(bankType BankType) (pdfcardsummaryio.Extractor, error) {
	switch bankType {
	case Santander:
		return santander.NewSantanderExtractorFromDefaultCfg(), nil
	case VisaPrisma:
		return visaprisma.NewVisaprismaExtractor(), nil
	case Galicia:
		return galicia.NewGaliciaExtractor(), nil
	default:
		return nil, fmt.Errorf("unsupported bank type: %s", bankType)
	}
}
