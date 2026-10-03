import { DEFAULT_SETTINGS } from "./extras";
import { buildDefaultMasters } from "./masters";
import type { LepdoData } from "./types";


export function buildSeed(): LepdoData {
  return {
    bankAccounts: [
      {
        id: "bank_hdfc",
        bankName: "LEPDO HDFC",
        nickname: "LEPDO HDFC",
        last4: "4821",
        openingBalance: 0,
        active: true,
      },
      {
        id: "bank_indusind",
        bankName: "LEPDO IndusInd",
        nickname: "LEPDO IndusInd",
        last4: "7714",
        openingBalance: 0,
        active: true,
      },
      {
        id: "bank_kotak",
        bankName: "Renuka Kotak",
        nickname: "Renuka Kotak",
        last4: "3390",
        openingBalance: 0,
        active: true,
      },
      {
        id: "bank_sbi",
        bankName: "Brijes SBI",
        nickname: "Brijes SBI",
        last4: "9037",
        openingBalance: 0,
        active: true,
      },
    ],
    cashLocations: [
      { id: "cash_itpark", name: "IT Park Cash", openingBalance: 0, active: true },
      { id: "cash_mahidharpura", name: "Mahidharpura Cash", openingBalance: 0, active: true },
    ],
    parties: [],
    salesInvoices: [],
    purchaseBills: [],
    transactions: [],
    auditLogs: [],
    brokers: [],
    sellers: [],
    liabilities: [],
    liabilityEntries: [],
    stockEntries: [],
    teamMembers: [],
    teamPayments: [],
    goals: [],
    emiPlans: [],
    emiPayments: [],
    masters: buildDefaultMasters(),

    settings: DEFAULT_SETTINGS,
  };
}
