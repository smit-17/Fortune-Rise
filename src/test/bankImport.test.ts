import { describe, expect, it } from "vitest";
import { detectStatementBank, detectColumns, detectHeader, importDate, importAmount, mapImportRows, importInput, sameBankImport, findImportReview, importStatementBalance, validateImportRow, inferImportCategory, canSubmitImport, importSubmitIds } from "@/lib/lepdo/bankImport";
import type { Transaction } from "@/lib/lepdo/types";
import type { ImportRow } from "@/lib/lepdo/bankImport";
const row: ImportRow = { id:"1",rowNumber:2,date:"2026-11-12",accountId:"bank_hdfc",category:"other",customCategory:"",partyName:"",particulars:"Test receipt",credit:"15100",debit:"",reference:"UTR123456",notes:"",expenseCategory:"",destination:"",statementClosingBalance:"25000" };
describe("Bank Excel import",()=>{
  const banks=[{id:"hdfc",bankName:"HDFC Bank",nickname:"LEPDO HDFC",last4:"0053",active:true,openingBalance:0},{id:"sbi",bankName:"State Bank of India",nickname:"LEPDO SBI",last4:"1234",active:true,openingBalance:0}];
  it("identifies the bank from statement headings and account metadata",()=>{
    expect(detectStatementBank(["HDFC BANK LIMITED","Account No.","0000000053"],banks)).toBe("hdfc");
    expect(detectStatementBank(["Bank: State Bank of India"],banks)).toBe("sbi");
    expect(detectStatementBank(["Account Number: 0000000053"],banks)).toBe("hdfc");
    expect(detectStatementBank(["Unknown bank"],banks)).toBeUndefined();
    const secondHdfc={id:"hdfc2",bankName:"HDFC Bank",nickname:"Second HDFC",last4:"9999",active:true,openingBalance:0};
    expect(detectStatementBank(["HDFC BANK"],[...banks,secondHdfc])).toBe("");
    expect(detectStatementBank(["HDFC BANK","Account Number: 0000000053"],[...banks,secondHdfc])).toBe("hdfc");
  });
  it("defaults rows to the detected statement bank and honors row bank names",()=>{
    const result=mapImportRows([["12/11/2026","", "Receipt",100],["13/11/2026","State Bank of India","Receipt",200]],{date:0,bank:1,particulars:2,credit:3},{},{bankId:"hdfc",banks,parties:[],categories:[],masters:{},headerRow:3});
    expect(result.map(r=>r.accountId)).toEqual(["hdfc","sbi"]);
    expect(detectColumns(["Date","Bank Name"]).bank).toBe(1);
  });
  it("matches official bank names to branded ledger names without guessing ambiguous accounts",()=>{
    const branded=[{id:"bank_hdfc",bankName:"LEPDO HDFC",nickname:"LEPDO HDFC",last4:"4821",active:true,openingBalance:0}];
    expect(detectStatementBank(["HDFC BANK LIMITED"],branded)).toBe("bank_hdfc");
    expect(detectStatementBank(["HDFC BANK"],[...branded,{...branded[0],id:"second",bankName:"Second HDFC",nickname:"Second HDFC",last4:"9999",active:true,openingBalance:0}])).toBe("");
    expect(detectStatementBank(["State Bank of India"],[{id:"sbi",bankName:"Brijes SBI",nickname:"Brijes SBI",last4:"9037",active:true,openingBalance:0}])).toBe("sbi");
  });
  it("automatically assigns categories from existing bank narration without mutating history",()=>{
    const prior={...importInput(row,null),id:"old",category:"expense",direction:"out",expenseCategory:"Office"} as Transaction;
    const debit={...row,credit:"",debit:"100"};
    expect(inferImportCategory(debit,{transactions:[prior],parties:[],categories:[],masters:{}})).toMatchObject({category:"expense",expenseCategory:"Office"});
    expect(inferImportCategory(debit,{transactions:[{...prior,accountId:"different"}],parties:[],categories:[],masters:{}}).category).toBe("other");
    expect(prior.expenseCategory).toBe("Office");
  });
  it("automatically recognizes narration expense masters",()=>{
    const result=inferImportCategory({...row,particulars:"Office Expenses November",credit:"",debit:"100"},{parties:[],categories:[],masters:{expenseCategories:[{id:"office",name:"Office Expenses",active:true}]}});
    expect(result).toMatchObject({category:"expense",expenseCategory:"Office Expenses"});
  });
  it("does not classify unknown narration as a payment from punctuation-only party names",()=>{
    expect(inferImportCategory({...row,partyName:""},{parties:[{id:"p",name:"..",type:"customer"}],categories:[],masters:{}}).category).toBe("other");
  });
  it("enables submit when at least one remaining row is ready despite invalid rows",()=>{
    expect(canSubmitImport(["ready","duplicate","saved"],1)).toBe(true);
    for(const skipped of ["invalid","review","error"]) expect(canSubmitImport(["ready",skipped],1)).toBe(true);
    expect(canSubmitImport(["ready"],0)).toBe(false);
    expect(canSubmitImport(["invalid","duplicate","saved"],1)).toBe(false);
    expect(canSubmitImport([],1)).toBe(false);
  });
  it("submits only ready rows, honors bulk selection, and excludes saved or duplicate rows",()=>{
    const rows=[row,{...row,id:"2"},{...row,id:"3"},{...row,id:"4"}];
    const statuses=new Map([["1",{kind:"ready"}],["2",{kind:"invalid"}],["3",{kind:"saved"}],["4",{kind:"duplicate"}]]);
    expect(importSubmitIds(rows,statuses,new Set())).toEqual(["1"]);
    expect(importSubmitIds(rows,statuses,new Set(["2","3","4"]))).toEqual(["1"]);
    statuses.set("2",{kind:"ready"});
    expect(importSubmitIds(rows,statuses,new Set(["2","3","4"]))).toEqual(["2"]);
    statuses.set("2",{kind:"saved"});
    expect(importSubmitIds(rows,statuses,new Set(["2"]))).toEqual(["1"]);
  });
  it("keeps only dated Excel rows and preserves original sheet row numbers",()=>{
    const result=mapImportRows([
      ["", "Opening Balance", 100],
      ["12/11/2026", "Receipt", 9800],
      ["Total", "Summary", 9900],
      ["30/02/2026", "Invalid date", 100],
      ["13/11/2026", "", ""],
      [null, "Closing Balance", 9900],
    ],{date:0,particulars:1,credit:2},{},{bankId:"bank_hdfc",banks:[],parties:[],categories:[],masters:{},headerRow:20});
    expect(result.map(r=>r.date)).toEqual(["2026-11-12"]);
    expect(result.map(r=>r.rowNumber)).toEqual([23]);
    expect(result[0]?.credit).toBe("9800");
  });
  it("excludes dated totals, footer balances, numeric opening balances and blank rows but keeps incomplete transactions",()=>{
    const result=mapImportRows([
      [2177.9,"Opening Balance",100],
      ["12/11/2026","Grand Total",100],
      ["12/11/2026","Closing Balance: 25000",100],
      ["12/11/2026","Summary",100],
      ["12/11/2026","", ""],
      ["12/11/2026","Actual receipt",100],
      ["12/11/2026","Actual incomplete receipt", ""],
      ["12/11/2026","Total payment for invoice",100],
    ],{date:0,particulars:1,credit:2},{},{bankId:"hdfc",banks,parties:[],categories:[],masters:{},headerRow:0});
    expect(result.map(r=>r.rowNumber)).toEqual([7,8,9]);
    expect(result.map(r=>r.particulars)).toEqual(["Actual receipt","Actual incomplete receipt","Total payment for invoice"]);
  });
  it("detects bank columns following statement preamble",()=>{
    const rows=[["Statement"],["Date","Narration","Chq./Ref.No.","Withdrawal Amt.","Deposit Amt."]];
    expect(detectHeader(rows)).toBe(1);
    expect(detectColumns(rows[1]??[])).toMatchObject({date:0,particulars:1,reference:2,debit:3,credit:4});
  });
  it("handles INR commas and day-first dates",()=>{expect(importAmount("₹2,77,482.47")).toBe("277482.47");expect(importDate("12/11/2026")).toBe("2026-11-12");expect(importDate(46338)).toMatch(/^2026-/);});
  it("maps narration substrings and recognized customer without allocations",()=>{
    const result=mapImportRows([["12/11/2026","UPI/123456789012/ABHISHEK",9800]],{date:0,particulars:1,credit:2,reference:1},{reference:{start:"4",end:"16"}},{bankId:"bank_hdfc",banks:[],parties:[{id:"p",name:"ABHISHEK",type:"customer"}],categories:[],masters:{},headerRow:0});
    expect(result[0]?.reference).toBe("123456789012");expect(result[0]?.partyName).toBe("ABHISHEK");expect(result[0]?.category).toBe("sale_payment");
    if(!result[0]) throw new Error("Missing row");expect(importInput(result[0],"p").allocations).toBeUndefined();expect(importInput(result[0],"p").amount).toBe(9800);
  });
  it("uses all five fields and ignores reference and narration",()=>{
    const a=importInput(row,null);
    expect(sameBankImport(a,{...a,reference:undefined,particulars:"Changed"})).toBe(true);
    expect(sameBankImport(a,{...a,reference:"DIFFERENT"})).toBe(true);
    expect(sameBankImport(a,{...a,date:"2026-11-13"})).toBe(false);
    expect(sameBankImport(a,{...a,accountId:"bank_sbi"})).toBe(false);
    expect(sameBankImport(a,{...a,direction:"out"})).toBe(false);
    expect(sameBankImport(a,{...a,amount:15101})).toBe(false);
    expect(sameBankImport(a,{...a,statementClosingBalance:25001})).toBe(false);
  });
  it("requires balance and never confirms missing balances as duplicates",()=>{
    const a=importInput(row,null);
    expect(sameBankImport(a,{...a,statementClosingBalance:undefined})).toBe(false);
    expect(validateImportRow({...row,statementClosingBalance:""},["bank_hdfc"],[])).toBe("Enter the statement closing balance");
    expect(importStatementBalance("1,200 DR")).toBe("-1200");
    expect(importStatementBalance("0")).toBe("0");
    expect(detectColumns(["Date","Closing Balance"]).statementClosingBalance).toBe(1);
  });
  it("flags legacy matches for review without using UTR",()=>{
    const legacy = {...importInput(row,null),id:"old",code:"TXN-OLD",statementClosingBalance:undefined,voided:false,sourceType:"bank"} as Transaction;
    expect(findImportReview({...row,reference:"OTHER"},[legacy])?.id).toBe("old");
    expect(findImportReview(row,[{...legacy,voided:true}])).toBeUndefined();
    expect(findImportReview(row,[{...legacy,date:"2026-11-13"}])).toBeUndefined();
    expect(findImportReview(row,[{...legacy,statementClosingBalance:25000}])).toBeUndefined();
  });
  it("requires valid manual fields without rejecting unrelated valid rows",()=>{
    expect(validateImportRow(row,["bank_hdfc"],[])).toBeNull();
    expect(validateImportRow({...row,debit:"1"},["bank_hdfc"],[])).toMatch(/not both/);
    expect(validateImportRow({...row,date:"2026-02-30"},["bank_hdfc"],[])).toBe("Invalid calendar date");
    expect(validateImportRow({...row,category:"sale_payment"},["bank_hdfc"],[])).toMatch(/required/);
    expect(validateImportRow({...row,category:"expense",credit:"",debit:"100"},["bank_hdfc"],[])).toMatch(/Expense category/);
  });
  it("preserves transfer and expense manual save behavior",()=>{
    const transfer=importInput({...row,category:"bank_transfer",credit:"",debit:"100",destination:"cash:cash_main"},null);
    expect(transfer.category).toBe("bank_to_cash");expect(transfer.destinationId).toBe("cash_main");
    const expense=importInput({...row,category:"expense",credit:"",debit:"100",expenseCategory:"Office"},null);
    expect(expense.expensePaid).toBe(true);expect(expense.ledger).toBe(true);
  });
});