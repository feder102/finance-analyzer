package pdf2csvcli

// BankType is a custom type to represent the bank enum.
type BankType string

var (
	Santander  BankType = "santander"
	VisaPrisma BankType = "visa-prisma"
	Galicia    BankType = "galicia"

	validBanks = []BankType{
		Santander,
		VisaPrisma,
		Galicia,
	}
)
