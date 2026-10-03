import { isLedgerEntry, isPosted } from "./entry";
import { CASH_BOOKS } from "./cash";
import { round2 } from "./format";
import type { BankAccount, CashLocation, CategoryId, Party, Transaction } from "./types";

/** Money given to a person (they owe us — receivable increases). */
export const UCHHINA_GIVEN: CategoryId = "uchhina_money_given";
/** Money received back from a person (receivable decreases). */
export const UCHHINA_RECEIVED_BACK: CategoryId = "uchhina_money_received_back";
/** Money taken from a person (we owe them — payable increases). */
export const UCHHINA_TAKEN: CategoryId = "uchhina_received";
/** Money returned to a person (payable decreases). */
export const UCHHINA_RETURNED: CategoryId = "uchhina_given";

export function isUchhina(id: CategoryId | null): boolean {
  return (
    id === UCHHINA_GIVEN ||
    id === UCHHINA_RECEIVED_BACK ||
    id === UCHHINA_TAKEN ||
    id === UCHHINA_RETURNED
  );
}

/** Fixed cash/bank direction forced by an Uchhina entry type. */
export function uchhinaDirection(id: CategoryId | null): "in" | "out" | null {
  if (id === UCHHINA_RECEIVED_BACK || id === UCHHINA_TAKEN) return "in";
  if (id === UCHHINA_GIVEN || id === UCHHINA_RETURNED) return "out";
  return null;
}

export function uchhinaTypeLabel(id: CategoryId | null): string {
  switch (id) {
    case UCHHINA_GIVEN:
      return "Money Given";
    case UCHHINA_RECEIVED_BACK:
      return "Money Received Back";
    case UCHHINA_TAKEN:
      return "Money Taken";
    case UCHHINA_RETURNED:
      return "Money Returned";
    default:
      return "Uchhina";
  }
}

/** Exact source label, e.g. "LEPDO HDFC" or "IT Park Cash". */
export function accountLabel(
  t: Pick<Transaction, "sourceType" | "accountId">,
  banks: BankAccount[],
  cash: CashLocation[],
): string {
  if (t.sourceType === "bank") {
    const b = banks.find((x) => x.id === t.accountId);
    return b ? b.bankName : "Bank";
  }
  const book = CASH_BOOKS.find((c) => c.id === t.accountId);
  if (book) return `${book.short} Cash`;
  return cash.find((c) => c.id === t.accountId)?.name ?? "Cash";
}

export interface UchhinaRow {
  id: string;
  code: string;
  date: string;
  category: CategoryId | null;
  particulars: string;
  account: string;
  sourceType: Transaction["sourceType"];
  amount: number;
  /** running "still to receive" balance after this entry */
  receivable: number;
  /** running "still to pay" balance after this entry */
  payable: number;
}

export interface PersonLedger {
  personId: string;
  name: string;
  given: number;
  receivedBack: number;
  stillToReceive: number;
  taken: number;
  returned: number;
  stillToPay: number;
  /** stillToReceive - stillToPay, as of the selected end date */
  netBalance: number;
  rows: UchhinaRow[];
  /** totals limited to the visible rows */
  periodGiven: number;
  periodReceivedBack: number;
  periodTaken: number;
  periodReturned: number;
}

function sortAsc(a: Transaction, b: Transaction) {
  return a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date);
}

/**
 * Builds person-wise uchhina ledgers from bank/cash transactions.
 * Running receivable/payable balances are computed across all time so
 * backdated edits stay correct, while the returned rows are limited to the
 * selected period.
 */
export function buildPersonLedgers(
  transactions: Transaction[],
  parties: Party[],
  banks: BankAccount[],
  cash: CashLocation[],
  from: string,
  to: string,
): PersonLedger[] {
  const all = transactions
    .filter(
      (t) => !t.voided && isUchhina(t.category) && t.partyId && t.date <= to && !isLedgerEntry(t),
    )
    .sort(sortAsc);

  const byPerson = new Map<string, Transaction[]>();
  for (const t of all) {
    const list = byPerson.get(t.partyId!) ?? [];
    list.push(t);
    byPerson.set(t.partyId!, list);
  }

  const ledgers: PersonLedger[] = [];
  for (const [personId, list] of byPerson) {
    let receivable = 0;
    let payable = 0;
    let given = 0;
    let receivedBack = 0;
    let taken = 0;
    let returned = 0;
    let periodGiven = 0;
    let periodReceivedBack = 0;
    let periodTaken = 0;
    let periodReturned = 0;
    const rows: UchhinaRow[] = [];
    for (const t of list) {
      // pending / rejected classifications stay visible but never move balances
      const posted = isPosted(t);
      if (posted) {
        if (t.category === UCHHINA_GIVEN) {
          receivable = round2(receivable + t.amount);
          given = round2(given + t.amount);
        } else if (t.category === UCHHINA_RECEIVED_BACK) {
          receivable = round2(receivable - t.amount);
          receivedBack = round2(receivedBack + t.amount);
        } else if (t.category === UCHHINA_TAKEN) {
          payable = round2(payable + t.amount);
          taken = round2(taken + t.amount);
        } else {
          payable = round2(payable - t.amount);
          returned = round2(returned + t.amount);
        }
      }
      if (t.date >= from && t.date <= to) {
        if (posted) {
          if (t.category === UCHHINA_GIVEN) periodGiven = round2(periodGiven + t.amount);
          else if (t.category === UCHHINA_RECEIVED_BACK)
            periodReceivedBack = round2(periodReceivedBack + t.amount);
          else if (t.category === UCHHINA_TAKEN) periodTaken = round2(periodTaken + t.amount);
          else periodReturned = round2(periodReturned + t.amount);
        }
        rows.push({
          id: t.id,
          code: t.code,
          date: t.date,
          category: t.category,
          particulars: t.particulars,
          account: accountLabel(t, banks, cash),
          sourceType: t.sourceType,
          amount: t.amount,
          receivable,
          payable,
        });
      }
    }
    ledgers.push({
      personId,
      name: parties.find((p) => p.id === personId)?.name ?? "Unnamed person",
      given,
      receivedBack,
      stillToReceive: round2(given - receivedBack),
      taken,
      returned,
      stillToPay: round2(taken - returned),
      netBalance: round2(given - receivedBack - (taken - returned)),
      rows: rows.reverse(),
      periodGiven,
      periodReceivedBack,
      periodTaken,
      periodReturned,
    });
  }

  return ledgers.sort(
    (a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance) || a.name.localeCompare(b.name),
  );
}
