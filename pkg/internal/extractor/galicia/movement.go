package galicia

import (
	"time"

	"github.com/shopspring/decimal"
)

type PDFMovement struct {
	OriginalDate       *time.Time
	ReceiptNumber      *string
	Detail             string
	CurrentInstallment *int
	TotalInstallments  *int
	AmountARS          decimal.Decimal
	AmountUSD          decimal.Decimal
}
