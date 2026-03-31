package demodataset

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/Alechan/finance-analyzer/pkg/internal/financeengine"
	"github.com/Alechan/finance-analyzer/pkg/internal/pdfcardsummary"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
)

func TestPublicWebDemoDataset_CanBeParsedIntoRepoCompatibleStructs(t *testing.T) {
	csvPath := filepath.Join("..", "..", "web", "mockups_lab", "tmp_public_data", "current", "demo_extracted.csv")
	csvBytes, err := os.ReadFile(csvPath)
	require.NoError(t, err)

	rows, err := pdfcardsummary.ParseMovementsWithCardContextCSV(csvBytes)
	require.NoError(t, err)
	require.NotEmpty(t, rows)
}

func TestPublicWebDemoDataset_LatestMonthKeepsOverviewCoverage(t *testing.T) {
	csvPath := filepath.Join("..", "..", "web", "mockups_lab", "tmp_public_data", "current", "demo_extracted.csv")
	csvBytes, err := os.ReadFile(csvPath)
	require.NoError(t, err)

	rows, err := pdfcardsummary.ParseMovementsWithCardContextCSV(csvBytes)
	require.NoError(t, err)
	require.NotEmpty(t, rows)

	metricsRows := financeengine.New().OverviewMetricsByStatementMonth(rows)
	require.NotEmpty(t, metricsRows)

	latest := metricsRows[len(metricsRows)-1]
	require.True(t, latest.TaxesARS.GreaterThan(decimal.Zero) || latest.TaxesUSD.GreaterThan(decimal.Zero))
	require.True(t, latest.NextMonthDebtARS.GreaterThan(decimal.Zero) || latest.NextMonthDebtUSD.GreaterThan(decimal.Zero))
	require.True(t, latest.RemainingDebtARS.GreaterThan(decimal.Zero) || latest.RemainingDebtUSD.GreaterThan(decimal.Zero))
	require.True(t, latest.CardMovementsUSD.GreaterThan(decimal.Zero))
}
